# План исполнения AE Agent 3.3.1

Продукт: [target app](../specs/target-app.md).
Режимы: [deployment](../docs/deployment-modes.md).
Текущий контракт: [штатный сброс bridge](../docs/product-session-reset.md).
Исторический экспорт: [product two-title workflow](../docs/product-two-title-workflow.md).

## Текущая цель пользователя

17.10 создать штатный операторский сброс bridge для обычной новой product-сессии.
Историю, UNKNOWN, checkpoints, idempotency и output/resource guards сохранить.
Не восстанавливать старые задания, не удалять очереди, не запускать рендер.
Пользователь выбрал внутреннее review сильной моделью вместо внешнего Pro.
Sol 6.1 Ultra выполнил source/design review; обязательные REVISE приняты.
Scoped ae_specialist реализует инструмент; родитель владеет docs и live-контролем.

## Progress

- 17.10: приложения AE/AME и idle disconnected панель подтверждены. Bridge отсутствует;
  current указывает на отсутствующий прежний процесс. Штатные status/ensure дают
  native refusal; новых ENQUEUE/START не было. Готового clean reset не существовало.
- 17.10: подготовлен secret-safe bundle COMPLETE; внешний Pro не использован по
  прямому выбору пользователя. Внутреннее Ultra review разрешило узкую реализацию
  с отдельной reset policy, session anchor, native absence, mutex/once/CAS,
  физическим CEP tracker и закрытым admission до activation.
- 17.10: production-реализация в работе. Добавлены local MCP route, reducer/CLI,
  отдельная авторизация, native probe, mutex/CAS и CEP epoch/handshake. Уточняются
  live условия. Три замечания Ultra исправлены: lost lease, exact receipt hashes
  и known-failed read-only preflight retry. Correction source review GO.
- 16.10: один actual AME addDL и независимый queued own-wrapper STATUS приняты.
  START0, generatedOutputVerified/appliedPresetVerified/mediaVerified=false.
  Диапазон следующего задания — свежая marked workArea exact pinned comp;
  full comp только по явному запросу. Offline nonzero-range fixture PASS.
- Предыдущая пара титров завершена через явно разрешённый GUI fallback:
  два Ready items с preset/output/full range, START1 и active encoding.
  Готовое видео не проверялось; старые native UNKNOWN сохранены.
- История snapshot export, source reopen timeout, recovery, wire fixes и
  not_sent settlements сохранена в linked workflow и Git. Эти шаги не повторять.

## Decision Log

- Reset — явная local MCP операция, доступная без HTTP daemon, не fallback ensure.
  Caller не задаёт PID/path/generation/raw script. Initial/retained и настоящий
  pending lifecycle в v1 отклоняются; общий recovery framework не строится.
- User authorization на создание reset и внутреннее review получена в этом чате.
  Отдельная private reset policy не расширяет молча owned_daemon_lifecycle.
- Старый exact process должен быть строго absent; alive/reused/denied/unknown
  и занятый fixed endpoint — отказ. Отсутствие не является held-handle exit proof.
- Shared OS controller mutex сериализует ensure/restart/shutdown/reset.
  Predecessor-only once barrier не зависит от source/request ID. Partial launch
  и lost ACK допускают read-back, а не второй launch. Current публикуется CAS.
- Новый signed reset anchor отдельно от genesis/repair. Future succession
  использует настоящие exit receipts. До handshake/fresh project read/activation
  execution закрыт явным AND, даже при обычном product provenance.
- Physical evalScript tracker не стирается при reconnect. Epoch проверяется
  после submitted ACK до evalScript. Fixed host barrier/read подтверждает текущий
  native канал; UNKNOWN внешних effects не выдаётся за completion.
- Operator disposition прекращает прежнюю control/edit ownership только в новой
  epoch; старые records/checkpoints не меняются. Exact signed old panel receipt
  IDs исключаются из общего availability/connect blocker, оставаясь UNKNOWN/noReplay.
  Idempotency, спорные output/jobs и ограничения конкретных ресурсов сохраняются.
- Dirty=false, save/reopen, checkpoint restore, прошлый finite/whole-M и новая
  приёмка титров не являются условиями reset. Proposal/dry-run/autonomy/raw/save
  gates следующих операций сохраняются.
- Исторический AME range выбирается при подготовке по workAreaStart+Duration;
  outputFiles означает созданные файлы, queued ack не является media proof.
  Старый UNKNOWN addDL не повторяется; его callback хранится отдельно.
- Чужие scripts/ame-title-jobs-smoke.js и untracked source-proof WIP сохраняются.
  Frozen intake, зависимости, providers, Local/Ollama, push/PR вне scope.

## Validation

- Internal Ultra source/design review завершён; решение и принятые уточнения
  записаны локально в ignored pro-review-bundles/product-session-reset-20261017/.
- Correction SourceSTOP: reset22, supervisor91, service35, product lifecycle12,
  CEP48 actions/16 VM; rules/diff/JS syntax/PS AST/C# compile-only PASS. Ultra GO.
  Native helper, реальный reset/launch, queue/render acceptance пока не запускались.
- Исторические diagnostics8/own-status29/not-sent+rehydrate25 и rules/syntax/diff PASS;
  actual addDL1/START0 и independent queued STATUS описаны в linked workflow.
  Fake/offline результаты не являются live доказательством нового reset.

## Следующий шаг

Зафиксировать проверенный инструмент отдельным commit. Если условия выполнены,
выполнить порученный штатный
operator reset и минимальный read-back подключения без queue/render acceptance.
Исторические ENQUEUE/START/export/save/open и UNKNOWN не повторять.

## Отложенные scope

- [Release/PR/merge](../docs/release-workflow.md): отдельное поручение на merge.
- [Монтаж](../docs/montage-workflow.md), [его план](montage-pipeline-execplan.md).
- [Frozen boundary](../config/frozen-intake-manifest.json): без thaw.
- [Исторический first-two](../docs/owned-runtime-first-two-test-states.md):
  finite/native evidence не переносится в условия обычного product reset.
