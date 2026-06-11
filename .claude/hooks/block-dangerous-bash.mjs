import process from "node:process";
import { readJsonFromStdin } from "./utils.mjs";

const payload = await readJsonFromStdin();
const command = payload?.tool_input?.command ?? "";

const blockedPatterns = [
  /\brm\s+-rf\s+\/\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+checkout\s+--\b/i,
  /\bdel\s+\/f\s+\/s\s+\/q\b/i,
  /\bformat-volume\b/i,
];

if (blockedPatterns.some((pattern) => pattern.test(command))) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Meta_Kim blocked a destructive shell command. Use a safer alternative or get explicit human approval.",
      },
    }),
  );
  process.exit(0);
}

process.exit(0);
