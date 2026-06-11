#!/usr/bin/env node
/**
 * Stop hook: auto-save project task progress when session ends.
 *
 * Reads the session transcript, extracts task descriptions and context,
 * then calls mcp_memory_global.py --mode save with the detected state.
 *
 * Reads stdin for session path, extracts recent task-related messages,
 * and invokes save-progress with minimal friction.
 *
 * Always exits 0 — never blocks session stop.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ── Read stdin ONCE at top level ─────────────────────────────────────────
const STDIN_CHUNKS = [];
for await (const chunk of process.stdin) STDIN_CHUNKS.push(chunk);
const RAW_STDIN = Buffer.concat(STDIN_CHUNKS).toString("utf8").trim();
let INPUT = {};
try { INPUT = JSON.parse(RAW_STDIN || "{}"); } catch { INPUT = {}; }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_ROOT = path.resolve(__dirname, "..");
const PYTHON_HOOK = path.join(HOOKS_ROOT, "mcp_memory_global.py");

// ── Task extraction patterns ────────────────────────────────────────────────

// Patterns that indicate a completed task
const DONE_PATTERNS = [
  /\n\d+\.\s*[`"\u201c]?((?:完成|搞完|搞定|写完|改完|修完|新增|添加|删除|修复|更新)[^`"\n]{5,60})/gi,
  /\b(完成|搞定|搞完|写完|改完|修复了|新增了|添加了|删除了|更新了|commit|push)[^\n]{3,80}/gi,
  /\b(?:saved|complete|done|finished|finished|applied|written|pushed|committed)[^\n]{3,80}/gi,
  /\b(搞定|完成|done|完事)[^\n]{0,30}/gi,
];

// Patterns that indicate a current/remaining task
const REMAINING_PATTERNS = [
  /\b(下一步|待做|还剩|还需要|还没做|remaining|pending|todo|接下来)[^\n]{3,80}/gi,
  /\b(还没|还没完|未完成|进行中|in progress)[^\n]{3,80}/gi,
];

// Patterns that describe what was just done
const TASK_PATTERNS = [
  /[*-]\s+(.{10,80})/g,  // bullet points
  /`([^`]{5,80})`/g,      // inline code (file paths, commands)
  /#\s+(.{5,60})/g,       // headings
];

// ── Helpers ──────────────────────────────────────────────────────────────

async function readTranscriptLines(transcriptPath, maxLines = 400) {
  try {
    const fd = await fs.open(transcriptPath, "r");
    const buf = [];
    for await (const line of fd.readLines()) {
      buf.push(line);
      if (buf.length > maxLines) buf.shift();
    }
    fd.close();
    return buf;
  } catch {
    return [];
  }
}

function extractUniqueItems(lines, patterns, maxItems = 5) {
  const seen = new Set();
  const items = [];

  for (const line of lines) {
    for (const pattern of patterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(line)) !== null) {
        const text = match[1] || match[0];
        const clean = text.trim().slice(0, 80);
        if (clean.length > 5 && !seen.has(clean)) {
          seen.add(clean);
          items.push(clean);
          if (items.length >= maxItems) return items;
        }
      }
    }
  }
  return items;
}

function extractCurrentTask(lines) {
  // Look for the most recent task description in user messages
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Look for task-related lines in user/assistant turns
    if (/[做|干|搞|写|修|改|完|完成|开始]/.test(line) && line.length < 120) {
      const clean = line.trim().slice(0, 100);
      if (clean.length > 5) return clean;
    }
  }
  return "";
}

function runPythonSave(args) {
  return new Promise((resolve) => {
    const proc = spawn("python", [PYTHON_HOOK, ...args], {
      cwd: process.cwd(),
      timeout: 8000,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    proc.on("error", () => {
      resolve({ code: -1, stdout: "", stderr: "spawn error" });
    });
  });
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const transcriptPath = INPUT.transcript_path || INPUT.transcriptPath || "";

  if (!transcriptPath) {
    // No transcript path — can't extract tasks, skip silently
    console.error("stop-save-progress: no transcript path in stdin");
    process.exit(0);
    return;
  }

  const lines = await readTranscriptLines(transcriptPath, 400);
  if (lines.length < 5) {
    process.exit(0);
    return;
  }

  const text = lines.join("\n");

  // Only save if there's meaningful work done
  const hasMeaningfulContent = (
    text.includes("完成") || text.includes("搞定") ||
    text.includes("commit") || text.includes("push") ||
    text.includes("写") || text.includes("改") ||
    text.includes("fix") || text.includes("add") ||
    text.includes("save-progress") ||
    text.includes("进度")
  );

  if (!hasMeaningfulContent) {
    // Session was too short or trivial — skip
    process.exit(0);
    return;
  }

  // Extract tasks
  const completed = extractUniqueItems(lines, DONE_PATTERNS, 5);
  const remaining = extractUniqueItems(lines, REMAINING_PATTERNS, 3);
  const currentTask = extractCurrentTask(lines);

  if (completed.length === 0 && remaining.length === 0) {
    // Nothing extractable — skip silently
    process.exit(0);
    return;
  }

  // Build python args
  const args = ["--mode", "save"];
  if (currentTask) args.push("--task", currentTask);
  for (const item of completed) args.push("--done", item);
  for (const item of remaining) args.push("--remaining", item);
  args.push("--note", `auto-save from Stop hook, ${lines.length} transcript lines`);

  const result = await runPythonSave(args);

  if (result.code === 0) {
    // Success — result.stdout has the JSON
    console.error(`stop-save-progress: saved ${completed.length} done, ${remaining.length} remaining`);
  } else {
    console.error(`stop-save-progress: failed (${result.code}): ${result.stderr}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`stop-save-progress: ${err.message}`);
  process.exit(0);
});
