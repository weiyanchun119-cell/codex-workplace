---
name: meta-theory
description: Run the Meta_Kim meta-theory governance dispatcher
args: <request>
---

Use the Meta_Kim `meta-theory` skill for this request:

$ARGUMENTS

Resolve the skill from the first available directory skill root:

1. `~/.codex/skills/meta-theory/SKILL.md`
2. `.agents/skills/meta-theory/SKILL.md`

Follow the skill's clarity, capability-discovery, dispatch, review, verification, and evolution discipline. If a required runtime capability is missing, state the missing capability and the exact checked path instead of guessing.

Default product runtime path:

For governed execution that should produce an auditable artifact, run:

```bash
npm run meta:theory:run -- "$ARGUMENTS"
```

Then use `npm run meta:theory:report -- latest` or the returned runId to reopen the user-readable report. This is the default artifact path for `/meta-theory` governed execution: Warden entry gate -> Conductor orchestration -> CapabilityGap decisions -> workerTaskPackets -> runtime projection evidence -> Warden writeback decision -> run report.

Codex execution rule:

**DISPATCH IS MANDATORY.** The main thread is the dispatcher, never the executor. Before producing >3 sentences of execution-layer analysis yourself, STOP and dispatch via `spawn_agent` instead.

- This `/meta-theory` invocation is explicit user authorization to use Codex sub-agent delegation and parallel agent work.
- Use `agent-teams-playbook` only after Thinking and before Execution when the plan has 2+ independent parallel worker lanes. Resolve it from the first available skill root (`~/.codex/skills/agent-teams-playbook/SKILL.md`, `.agents/skills/agent-teams-playbook/SKILL.md`).
- Then use Codex `spawn_agent` with capability-matched Meta_Kim agents. The main thread clarifies, routes, verifies, and synthesizes; it must not do multi-agent execution work by itself.
- If `spawn_agent` is unavailable, record the blocked reason — do not silently continue as main-thread execution.
