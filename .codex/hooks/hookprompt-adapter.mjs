import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function readPayload() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function promptFromPayload(payload) {
  for (const key of ["prompt", "user_prompt", "input", "text"]) {
    if (typeof payload[key] === "string" && payload[key].trim()) return payload[key];
  }
  const messages = payload.messages;
  if (Array.isArray(messages)) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") continue;
      if (typeof message.content === "string") return message.content;
      if (Array.isArray(message.content)) {
        const parts = message.content
          .map((part) => typeof part === "string" ? part : part?.text)
          .filter(Boolean);
        if (parts.length) return parts.join("\n");
      }
    }
  }
  return "";
}

function findHookPromptScript() {
  const candidates = [];
  const hookDir = path.dirname(fileURLToPath(import.meta.url));
  candidates.push(path.join(hookDir, "user-prompt-submit.js"));
  candidates.push(path.join(hookDir, "hookprompt", "user-prompt-submit.js"));
  candidates.push(path.join(hookDir, "..", "skills", "hookprompt", ".codex", "hooks", "user-prompt-submit.js"));
  candidates.push(path.join(hookDir, "..", "skills", "hookprompt", ".claude", "hooks", "user-prompt-submit.js"));
  candidates.push(path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "user-prompt-submit.js"));
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function parseClaudeAdditionalContext(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return parsed?.hookSpecificOutput?.additionalContext || "";
  } catch {
    return "";
  }
}

function emitAdditionalContext(additionalContext) {
  const runtimeId = "codex";
  if (runtimeId === "cursor") {
    console.log(JSON.stringify({ prompt: additionalContext }));
    return;
  }
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  }));
}

const payload = readPayload();
const prompt = promptFromPayload(payload);
const script = findHookPromptScript();
if (prompt && script) {
  const result = spawnSync("node", [script], {
    input: JSON.stringify({ prompt }),
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
  });
  const additionalContext = parseClaudeAdditionalContext(result.stdout || '');
  if (additionalContext) {
    emitAdditionalContext(additionalContext);
  }
}
