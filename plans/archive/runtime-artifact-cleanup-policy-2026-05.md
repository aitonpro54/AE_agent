# Runtime Artifact Cleanup Policy, 2026-05

## Цель

Эта заметка закрывает M175: фиксирует локальную политику разбора ignored runtime artifacts без удаления, перемещения или очистки пользовательских данных. Она относится к runtime-папкам `backups/`, `logs/`, `snapshots/`, `.codex-runtime/` и `pro-review-bundles/`.

## Граница безопасности

- Этот milestone является docs-only.
- Нельзя удалять ignored runtime artifacts.
- Нельзя перемещать backups/logs/snapshots в внешний архив без отдельного explicit approval.
- Нельзя менять `.gitignore` в рамках M175.
- Нельзя запускать live CEP/AE, SDKThread/network, external-provider/OpenAI CLI planner или mutating-live validation.
- Любое будущее действие над runtime artifacts должно начинаться с read-only inventory report и отдельного review.

## Уже собранные evidence

| Категория | Источник | Size/count evidence |
| --- | --- | --- |
| Affected ignored runtime dirs | `.codex-audit/sdk-milestone-conveyor/173-ae-agent-cleanup-conveyor-queue.json` / `m175-runtime-artifact-cleanup-note` | Зафиксирован только список директорий: `backups/`, `logs/`, `snapshots/`, `.codex-runtime/`, `pro-review-bundles/`. |
| Runtime artifact policy need | `plans/target-app-execplan.md` после M174 active-state split | Зафиксирована необходимость policy/archive checklist; точные size/count numbers не были собраны в tracked docs. |
| Historical runtime artifact references | `plans/archive/target-app-execplan-history-2026-05.md` | История упоминает ignored logs/dev-request/report artifacts, но не содержит стабильной сводки размеров и количества для M175 cleanup. |

В этом bounded workspace-write turn не выполнялся новый scan runtime directories, чтобы не раздувать вывод, не трогать runtime state и не смешивать policy milestone с cleanup execution.

## Archive checklist для будущего approved cleanup

1. Создать отдельный read-only inventory artifact с точным временем, командами, количеством файлов и суммарным размером по каждой affected directory.
2. Исключить секреты, API keys, full transcripts, локальные project paths и user-specific private notes из tracked отчета.
3. Разделить результаты на категории: disposable cache, reproducible logs, review bundles, checkpoints/snapshots, user-investigation evidence.
4. Для каждой категории записать `retain`, `archive externally`, `delete later`, или `needs manual review`.
5. Для внешнего архива заранее указать абсолютный операторский target outside repo, retention period и восстановление.
6. Получить отдельное explicit approval перед любым move/delete.
7. После approved move/delete выполнить отдельную validation: `git status --short`, отсутствие tracked runtime churn, и targeted read-back inventory.

## Recommended external archive locations

Внешний архив должен быть вне репозитория и вне ignored runtime folders. Рекомендуемые формы:

- операторская папка вроде `%USERPROFILE%\Documents\AE Agent Archives\<YYYY-MM-DD>\`;
- защищенное локальное backup-хранилище, если оно уже используется пользователем;
- сжатый архив с manifest-файлом, если нужно переносить evidence между машинами.

Эта рекомендация не является разрешением на move/delete. M175 только документирует будущий безопасный порядок.

## Decision

M175 оставляет runtime state неизменным. До отдельного approved cleanup runtime artifacts остаются на месте, `.gitignore` не меняется, а active plan ссылается на эту policy как на текущую archive checklist.
