# Cleanup Migration

Дата миграции: 2026-06-04.

Clean baseline был подготовлен в staging-каталоге `AE_agent_clean`, затем стал
активным проектом по пути `C:\Users\Ant\Documents\Codex\AE_agent`.
Старый проект сохранен как dated legacy directory
`C:\Users\Ant\Documents\Codex\AE_agent_legacy_2026-06-04` и остается
историческим источником для точечного lookup.

## Что перенесено

- CEP panel, bridge/MCP server, ChatGPT connector, target spec and compact
  project docs.
- Current provider, planning, semantic verification, solution-library and
  bridge smoke scripts.
- Current `generic-repo:*` Full Intaker/importer tools and compact runtime
  helpers for AE-specific intake work.
- Registry and active recipes.

## Что намеренно не перенесено

- Git history and old repository metadata.
- Runtime/cache/log/output folders: `.codex/`, `.codex-runtime/`, `logs/`,
  `backups/`, `snapshots/`, `pro-review-bundles/`, `node_modules/`.
- Historical SDK audit packet tree: `.codex-audit/**`.
- Historical execution plan archives: `plans/archive/**`.
- Old handoff-only docs and old SDK conveyor/governance proof scripts.

## Новый baseline

The clean repo keeps AE Agent product behavior and current useful tools, but it
does not rely on historical proof packets at runtime. Historical questions
should be answered from the legacy repository. New work should add compact
current evidence in this repo instead of recreating a broad archive tree.

Primary validation entrypoint:

```powershell
npm run check:rules
```

Product and Full Intaker smokes are exposed through the `smoke:*` package
scripts and can be run individually during future milestones.
