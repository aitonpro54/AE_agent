# Cleanup Migration

Clean baseline date: 2026-06-04. Aggressive cleanup refresh: 2026-07-02.

This repository is the active AE Agent 2.0.0 baseline. It keeps product code,
typed tools, recipes, registry, provider integration, bridge/CEP surfaces, and
current AE-specific Full Intaker/importer tooling.

## Kept

- CEP panel and local bridge/MCP server
- ChatGPT connector
- Provider, planning, semantic verification, and bridge smoke scripts
- Current AE-specific Full Intaker/importer commands
- Reviewed recipes and solution registry
- Compact specs, docs, plans, and handoff notes

## Local Only

The following are runtime artifacts and must stay ignored:

- `.codex/`
- `.codex-runtime/`
- `.codex-autonomy/logs/`
- `.codex-autonomy/runs/`
- `logs/`
- `backups/`
- `snapshots/`
- `pro-review-bundles/`
- `node_modules/`

## Not Part Of Baseline

- old audit packet trees
- historical execution-plan archives
- generated proof/report dumps
- old handoff-only docs
- broad generic SDK governance history

Historical questions should be answered from git history or the legacy
repository, not by adding archives back into this baseline.

Primary validation entrypoint:

```powershell
npm.cmd run check:rules
```
