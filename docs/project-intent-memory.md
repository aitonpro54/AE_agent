# Project Intent Memory

Milestone 76 добавляет небольшую локальную память намерений проекта для Agent planning. Это не transcript store и не база знаний с полным состоянием AE-проекта. Память хранит только короткие reviewed hints, которые помогают planner учитывать устойчивые проектные правила: generated prefixes, protected assets, naming conventions, важные comps/folders и пользовательские предпочтения.

## Артефакты

- `registry/project-intent-memory.json` - inspectable JSON registry с schema `ae-project-intent-memory.v1`.
- `mcp-server/project-intent-memory.js` - чтение, валидация, retrieval, bounded prompt formatting и explicit update helper.
- `scripts/project-intent-memory-smoke.js` - offline smoke для contract, retrieval, update и hygiene checks.

## Safety Contract

Память не должна хранить:

- provider secrets или API keys;
- raw chat transcripts или message arrays;
- public/tunnel URLs;
- broad project dumps/full scans;
- пользовательские absolute paths.

Если update содержит такие данные, helper отклоняет запись и не пишет registry. Planner получает только compact top matches, а не весь registry.

## Planning Use

`plan_with_ai_agent` перед provider call собирает отдельный блок `Project intent memory hints`. Этот блок:

- локальный и inspectable;
- bounded по размеру;
- advisory only;
- не доказывает наличие target в AE;
- не обходит read tools, plan validation, mutation gates, checkpoints, idempotency или read-back verification.

Memory hints вставляются рядом с Solution Library hints и Project Context Snapshot. Нормальное исполнение всё равно проходит через структурированный AE plan, validation, dry-run/run gates и post-mutation verification.

## Read/Update Paths

MCP tools:

- `get_project_intent_memory` читает registry и, если передан `prompt`, возвращает compact matching hints.
- `update_project_intent_memory` требует `confirm:true`, поддерживает `upsert` и `disable`, валидирует schema/hygiene и пишет только локальный registry.

`update_project_intent_memory` не входит в Agent planning catalog, поэтому AI-generated AE plans не должны использовать его как step. Память обновляется отдельным явным действием, а не как часть AE mutation plan.

## Validation

```powershell
node .\scripts\project-intent-memory-smoke.js
node .\scripts\prompt-optimization-smoke.js
```

Первый smoke проверяет registry shape, retrieval scoring, prompt bounds, dry-run/persisted updates, disable path и отказы на unsafe content. Второй smoke проверяет, что planning prompt получает bounded memory section вместе с solution hints и context snapshot.