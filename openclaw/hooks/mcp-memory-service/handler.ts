import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

type OpenClawEvent = {
  type?: string;
  action?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
};

function readText(filePath: string, maxChars = 3000): string {
  if (!filePath || !existsSync(filePath)) return "";
  try {
    const text = readFileSync(filePath, "utf8");
    return text.length > maxChars ? text.slice(-maxChars) : text;
  } catch {
    return "";
  }
}

function tailFile(filePath: string, maxLines = 80): string {
  const text = readText(filePath, 12000);
  if (!text) return "";
  return text.split(/\r?\n/u).slice(-maxLines).join("\n").trim();
}

function endpoint(): string {
  return process.env.MCP_MEMORY_URL || "http://localhost:8000";
}

const REMOTE_MEMORY_ALLOWED = process.env.META_KIM_ALLOW_REMOTE_MEMORY === "1";
const MEMORY_AUTOSTART_DISABLED = process.env.META_KIM_DISABLE_MEMORY_AUTOSTART === "1";
const SECRET_PATTERNS = [
  /\bsk-(?:proj|live|test)?-[A-Za-z0-9_-]{10,}\b/gu,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gu,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gu,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\b(?:authorization\s*:\s*bearer\s+)[A-Za-z0-9._~+/=-]{8,}/giu,
  /\b(?:api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]{6,}/giu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
];

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isAllowedMemoryEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return true;
    if (isPrivateIpv4(hostname)) return true;
    if (hostname.startsWith("fc") || hostname.startsWith("fd")) return true;
    if (hostname.startsWith("fe80:")) return true;
    return REMOTE_MEMORY_ALLOWED;
  } catch {
    return false;
  }
}

function isLoopbackMemoryEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

async function isMemoryServiceHealthy(value: string): Promise<boolean> {
  if (!isAllowedMemoryEndpoint(value)) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const response = await fetch(new URL("/api/health", value), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return false;
    const body = await response.json().catch(() => ({}));
    return body?.status === "healthy";
  } catch {
    return false;
  }
}

function startMemoryServiceBackground(value: string): boolean {
  if (MEMORY_AUTOSTART_DISABLED || !isLoopbackMemoryEndpoint(value)) return false;
  const memoryBin = process.env.MCP_MEMORY_BIN || "memory";
  try {
    const child = spawn(memoryBin, ["server", "--http"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        MCP_ALLOW_ANONYMOUS_ACCESS: "true",
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
      },
    });
    child.on("error", () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function ensureMemoryService(value: string): Promise<boolean> {
  if (await isMemoryServiceHealthy(value)) return true;
  const started = startMemoryServiceBackground(value);
  if (!started) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (await isMemoryServiceHealthy(value)) return true;
  }
  return false;
}

function redactSecrets(text: string): string {
  let redacted = String(text ?? "");
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      const label = /authorization/iu.test(match) ? "AUTHORIZATION" : "SECRET";
      return `[REDACTED_${label}]`;
    });
  }
  return redacted;
}

function redactValue<T>(value: T): T {
  if (typeof value === "string") return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactValue(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item)]),
    ) as T;
  }
  return value;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function eventName(event: OpenClawEvent): string {
  return [asString(event.type), asString(event.action)].filter(Boolean).join(":");
}

function buildContent(event: OpenClawEvent): {
  content: string;
  project: string;
  workspaceDir: string;
} {
  const context = event.context ?? {};
  const workspaceDir =
    asString(context.workspaceDir) ||
    asString(context.workspace_dir) ||
    asString(context.cwd) ||
    process.cwd();
  const project = basename(workspaceDir || "") || "openclaw";
  const sessionEntry = context.sessionEntry ?? context.previousSessionEntry;

  const lines = [
    `Runtime session checkpoint - openclaw - ${project}`,
    `Time: ${new Date().toISOString()}`,
    `Workspace dir: ${workspaceDir}`,
    `Event: ${eventName(event)}`,
  ];

  const sessionSummary = compactJson(sessionEntry);
  if (sessionSummary) {
    lines.push("\nOpenClaw session entry:\n" + sessionSummary.slice(0, 1800));
  }

  const memory = tailFile(join(workspaceDir, "MEMORY.md"), 80);
  const today = new Date().toISOString().slice(0, 10);
  const daily = tailFile(join(workspaceDir, "memory", `${today}.md`), 80);
  const progress = tailFile(join(workspaceDir, "progress.md"), 70);
  const plan = tailFile(join(workspaceDir, "task_plan.md"), 70);

  if (memory) lines.push("\nMEMORY.md tail:\n" + memory);
  if (daily) lines.push("\nDaily memory tail:\n" + daily);
  if (plan) lines.push("\nTask plan tail:\n" + plan);
  if (progress) lines.push("\nProgress tail:\n" + progress);

  const content = redactSecrets(lines.join("\n").trim());
  return {
    content: content.length > 4000 ? content.slice(0, 3997) + "..." : content,
    project,
    workspaceDir,
  };
}

async function saveMemory(event: OpenClawEvent): Promise<void> {
  const { content, project, workspaceDir } = buildContent(event);
  if (content.length < 40) return;
  const memoryEndpoint = endpoint();
  if (!isAllowedMemoryEndpoint(memoryEndpoint)) return;
  if (!(await ensureMemoryService(memoryEndpoint))) return;

  await fetch(new URL("/api/memories", memoryEndpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-ID": "openclaw" },
    body: JSON.stringify(redactValue({
      content,
      tags: ["openclaw", eventName(event), "meta_kim", project],
      memory_type: "observation",
      conversation_id: `openclaw-${project}-${Date.now()}`,
      metadata: {
        generated_by: "meta-kim-openclaw-mcp-memory-hook",
        runtime: "openclaw",
        event: eventName(event),
        project_dir: workspaceDir,
      },
    })),
  }).catch(() => undefined);
}

export default async function handler(event: OpenClawEvent): Promise<void> {
  await saveMemory(event).catch(() => undefined);
}
