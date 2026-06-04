# Project Memory

Дата обновления: 2026-06-04.

## Current Workspace

- Active project root: `C:\Users\Ant\Documents\Codex\AE_agent`.
- Repository status: clean standalone baseline repo on `main`.
- Historical source: after replacement, the previous AE Agent workspace is kept
  as the dated legacy directory outside this repo and should be used only for
  targeted historical lookup.

## Product Goal

AE Agent is a local After Effects CEP panel backed by a local bridge daemon and
MCP adapter. The bridge owns provider access, safe AE plan validation, execution
gates, logs, checkpoints, edit sessions, and typed tools. Codex remains the
agent; the panel and bridge provide reliable AE capabilities and safety rails.

## Current Architecture

```text
Codex -> stdio MCP adapter -> local bridge daemon -> CEP panel -> After Effects
```

- `mcp-server/mcp-adapter.js` owns MCP stdio and starts or connects to the
  daemon when needed.
- `mcp-server/bridge-daemon.js` owns the local HTTP bridge, command queue,
  retained results, provider calls, safety gates, checkpoints, and tool
  execution.
- `cep-panel/` stays a passive client that polls for commands and posts results.
- `registry/` and `recipes/` hold current reusable AE solution knowledge.
- `orchestrator/` keeps only the current AE-specific Full Intaker/importer
  subset and compact runtime helpers.

## Clean Repository Decisions

- Runtime outputs stay ignored and local: `.codex/`, `.codex-runtime/`, `logs/`,
  `backups/`, and generated proof/report folders are not committed.
- Old audit packets, execution-plan archives, historical proof dumps, and old
  handoff-only docs are not part of this repo.
- Full Intaker/importer commands must receive explicit current ledger paths for
  real runs; the clean repo must not rely on generated ledgers from the old
  workspace.
- Local/Ollama, fallback providers, broad CEP smoke, live mutation, dependency
  changes, push, and PR creation remain approval-gated.

## Current Validation Surface

- `npm run check:rules` is the default local validation entrypoint.
- Product smoke groups live in `package.json` as `smoke:*` scripts.
- Read-only live connectivity checks are:
  - `node scripts/cep-panel-cdp-smoke.js inspect`
  - `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`

## Next Useful Work

1. Keep product work in this clean repo after user acceptance.
2. Keep the dated legacy directory until the clean baseline has been accepted
   and used for normal work.
3. Resume product milestones from compact current docs and handoffs, not from
   old generated proof archives.
