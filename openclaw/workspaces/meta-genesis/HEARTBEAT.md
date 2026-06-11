# HEARTBEAT.md - meta-genesis

## Capability-First Mandatory Refusal (OpenClaw)

OpenClaw has internal command/lifecycle hooks and typed plugin hooks, but this Meta_Kim projection has not installed a typed plugin adapter for tool-call denial. The four-runtime governance contract (Claude / Codex / Cursor / OpenClaw) requires `fetchRecord.capabilitySearchPerformed = true` before any Agent dispatch in regulated runs. Claude Code, Codex, and Cursor can enforce the dispatch gate mechanically through tool hooks. OpenClaw enforces the same rule here through workspace instructions until a typed plugin policy hook is installed.

**Before dispatching any execution worker or running any execution-layer task in OpenClaw, you must:**

1. Search `config/capability-index/meta-kim-capabilities.json` for matching capability owners.
2. Search `canonical/agents/*.md` for boundary fit.
3. Record the search outcome in the run's `fetchRecord` field.
4. Only then dispatch.

If you cannot record the search outcome, **refuse** to execute and respond:

> "OpenClaw capability-first refusal: I cannot dispatch without fetchRecord evidence. Please run capability discovery first or escalate to meta-warden."

This is not a soft preference. This is the OpenClaw-equivalent of the mechanical tool-call deny that Claude / Codex / Cursor enforce. Treat it as a hard contract.

Official OpenClaw workspace note: the workspace is the default cwd and context home, not a hard sandbox. Absolute paths can still reach host files unless sandboxing is configured. Do not treat workspace placement as a security boundary.

Cross-reference: see `AGENTS.md` for the cross-runtime enforcement matrix and `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs` for the mechanical sibling.

## Default Heartbeat Policy

- If there is no explicit scheduled work, respond with `HEARTBEAT_OK`.
- Do not create autonomous tasks or self-assign missions by default.
- Only act proactively after the deployment owner adds concrete heartbeat tasks below.

## Deployment Tasks

- None by default.
