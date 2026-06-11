---
name: same-set-reusable-flow-for-project-file-inventor
version: 0.1.0
author: Meta_Kim
user-invocable: false
candidateType: skill
sourceGapId: gap-create-skill-same-set-reusable-flow--c89068df05
approvalEvidence: warden-approved-file-inventory-skill-2026-06-05
trigger: "project file inventory|file classification|repo cleanup|项目文件整理|文件用途整理|清理项目"
tools:
  - shell
  - filesystem
description: |
  Reusable Meta_Kim file inventory classification flow. It helps separate durable sources, generated evidence, runtime mirrors, temporary state, and risky unknowns before cleanup or commit.
---

# Project File Inventory Classification

Use this skill when a Meta_Kim workspace has too many files and the user needs to know which are useful, generated, risky, or safe to ignore.

## Goal

Produce a source-backed inventory, not a cleanup guess. The output should help the user decide what to keep, commit, ignore, or inspect again.

## Required Evidence

Start with read-only evidence:

1. `git status --short --branch`
2. `git ls-files`
3. `git ls-files --others --exclude-standard`
4. `git check-ignore -v <path>` for suspicious ignored paths
5. `rg -n "<filename-or-command>" package.json docs scripts tests canonical config` for tracked candidates
6. `npm run` script inventory from `package.json`

Do not classify a tracked file as removable only because it has few references. Check package scripts, tests, docs, sync scripts, setup scripts, and contracts first.

## Classification Buckets

- **Core source**: `canonical/`, `config/contracts/`, `config/capability-index/`, durable scripts, package scripts, and tests that define behavior.
- **Runtime projection**: `.claude/`, `.agents/`, `.cursor/`, `openclaw/`, `.codex/` mirrors generated from canonical sources or sync scripts.
- **Generated evidence**: `.meta-kim/state/default/`, graph outputs, reports, SQLite run state, smoke artifacts, and temporary proof files.
- **Planning continuity**: `task_plan.md`, `findings.md`, `progress.md`; keep during active work even if ignored.
- **Reference docs**: tracked docs and plans that explain product, architecture, contracts, or release decisions.
- **Suspicious or cleanup candidate**: files with no package, test, docs, sync, install, contract, or runtime evidence.

## Output Format

Return a compact table with:

- path or pattern
- bucket
- why it exists
- evidence command
- recommendation: keep, commit, ignore, regenerate, inspect again, or cleanup candidate
- risk if deleted

End with a short "do not delete yet" list for any file whose role is uncertain.

## Boundaries

- Do not auto-write canonical state without Warden approval.
- Keep one-run task details in workerTaskPackets, not durable identity.
- Do not delete files as part of inventory classification unless the user separately approves a cleanup action.
- Do not treat runtime mirrors or generated reports as source of truth when canonical or config sources exist.
