# Запрос для нового чата реализации Core

Работай в `C:/Users/Ant/Documents/Codex/AE_agent_core`.
Выполни source-этапы A → B → C из
`plans/core-architecture-implementation-20261112.md`.
Цель: укрепить узкие контракты Core 4.2.6 и отделить описание состава от runtime
без переписи архитектуры и без ослабления допуска/восстановления.

Сначала прочитай AGENTS.md, этот план, `docs/model-routing.md` и
`reviews/architecture/20261112-current-01/decisions.md`.
Для спорных AE/G findings используй local-pro-triage.md и local-argon-triage.md
рядом с decisions.md; внешнее ревью не заменяет проверку текущего исходника.

База product source: `6d40cc228d9f2e18c672af5782033be305b82917`.
На момент плана HEAD `48576d1`; дальнейший документальный commit не меняет source.
Перед работой сверь текущий HEAD/diff. Сохрани чужие изменения, особенно
`AGENTS.md` и `plans/core-transfer-4.2.5-20261111.md`.

Начни с A1: shared lower close в attachment-owner и facade.close в stdio-entry;
адресные concurrency/rejection fixtures для обоих путей, включая отложенный
и rejected peer.close. Верхний exposeOwner/maintenance сохранить. Затем A2:
сохранить точную bootstrap diagnostics, не очищая UNKNOWN
и не повторяя eval. A3: builder может добавлять только expectedBindings.
Каждый блок — отдельный ограниченный commit с проверками.

Перед B отдельно зафиксируй integrity-before-import контракт. Нельзя вынести
helpers и загрузить новый файл до проверки pinned release/root. У extraction
должна быть явная совместимость старых пакетов. Затем complete catalogRevision,
manifest diff/minimality и таблица version/resultProfile compatibility.
Не менять номер выпуска вслепую: сейчас registryVerification и ряд verifier
ветвей привязаны к точным версиям.

Используй текущий чат как координатора. Самостоятельную scoped реализацию
передавай Sol 6.1 High (`ae_implementer`); сложную границу доверия —
`ae_specialist`/`ae_architect`. Luna — только bounded факты/документация.
Один writer на файл, не более двух helpers, root — единственный live controller.
Не запускай Antigravity через непроверенный legacy executor profile.

Проверки выбирай по `validate-diff.js`, обновляй mapping для новых файлов,
сохраняй check:boundaries и git diff --check. Переиспользуй evidence лишь при
совпадении значимой closure. C — интеграция supported Titles и адресных
failure transitions в offline harness; не объявляй её native acceptance.

Текущий scope — исходники, tests, docs, локальные проверочные artifacts.
Не устанавливай пакет, не меняй MCP/CEP config, не перезапускай AE и не трогай
пользовательские AEP без отдельного поручения на соответствующий live этап.
Не возобновляй frozen MSIX root-rebase; не повторяй settled/UNKNOWN операции.
Не переписывай journals, не копируй credentials/state между машинами.
Сохраняй authority, ownership, checkpoints, original completion binding,
UNKNOWN/no-replay и signed retirement.

После каждого этапа обновляй Progress/Decision Log/Validation плана.
Продолжай до завершения назначенного source scope, не создавай следующий handoff
из-за длины чата. Итог: commits, что изменилось, адресные проверки, manifest diff,
оставшиеся live ограничения и готовность к отдельно назначаемому выпуску.
