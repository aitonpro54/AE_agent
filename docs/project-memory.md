# Project Memory

Дата обновления: 2026-07-02.

## Current Workspace

- Active project root: `C:\Users\Ant\Documents\Codex\AE_agent`.
- Current branch: `codex/full-intake-runtime-cleanup`.
- Target product: AE Agent 2.0.0.
- Active spec: `specs/target-app.md`.
- Active plan: `plans/target-app-execplan.md`.

## Product Goal

AE Agent is a local After Effects CEP panel backed by a local bridge daemon and
MCP adapter. The bridge owns provider access, safe AE plan validation,
execution gates, logs, checkpoints, edit sessions, and typed tools.

## Runtime Architecture

```text
Codex/App client -> stdio MCP adapter -> bridge daemon -> CEP panel -> After Effects
```

- `mcp-server/mcp-adapter.js` owns MCP stdio and connects to the daemon.
- `mcp-server/bridge-daemon.js` owns the local HTTP bridge, command queue,
  retained results, provider calls, safety gates, checkpoints, and tool
  execution.
- `cep-panel/` is the local panel client that polls commands and posts results.
- `registry/` and `recipes/` hold reviewed AE solution knowledge.
- `orchestrator/` keeps current AE-specific Full Intaker/importer tooling.

## Repository Rules

- Keep docs compact and current.
- Keep runtime outputs ignored and local.
- Keep reusable generic SDK orchestration out of this repo unless a separate
  reviewed migration approves it.
- Keep Local/Ollama, fallback providers, broad CEP smoke, live mutation,
  dependency changes, push, and PR approval-gated.

## Validation

- Default: `npm.cmd run check:rules`
- Source edits: touched-file `node --check` plus `git diff --check`
- Product/tooling edits: relevant `smoke:*` scripts from `package.json`
- Read-only live connectivity, when AE and panel are available:
  `node scripts/cep-panel-cdp-smoke.js inspect` and
  `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`
