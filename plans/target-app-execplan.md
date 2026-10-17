# План исполнения AE Agent 3.3.1

Продукт: [target app](../specs/target-app.md).
Режимы: [deployment](../docs/deployment-modes.md).
Текущий контракт: [штатный сброс bridge](../docs/product-session-reset.md).
Исторический экспорт: [product two-title workflow](../docs/product-two-title-workflow.md).

## Текущая цель пользователя

Новое поручение 17.10 после завершения reset: проверить добавление двух титров
в AME без запуска рендера. Остановка до enqueue: новый snapshot export UNKNOWN,
addDL0/START0. Данные и проверка — в linked product two-title workflow.

17.10 создать штатный операторский сброс bridge для обычной новой product-сессии.
Историю, UNKNOWN, checkpoints, idempotency и output/resource guards сохранить.
Не восстанавливать старые задания, не удалять очереди, не запускать рендер.
Пользователь выбрал внутреннее review сильной моделью вместо внешнего Pro.
Sol 6.1 Ultra выполнил source/design review; обязательные REVISE приняты.
Scoped ae_specialist реализовал инструмент; родитель владеет docs и live-контролем.

## Progress

- 17.10: fresh bridge/AE/AME/source/preset/workArea preflight PASS. Новый snapshot
  proposal/dry-run PASS; real run dad3dc19…/command f988d318… истёк на restore.
  Resolve Fonts подтверждён и закрыт после deadline. Исходник восстановлен,
  новые snapshots существуют, native flags/GUID не подтверждены; enqueue0/START0.
  Reconcile incomplete/unknown; существующего adoption route нет, replay запрещён.
- 17.10: приложения AE/AME и idle disconnected панель подтверждены. Bridge отсутствует;
  current указывает на отсутствующий прежний процесс. Штатные status/ensure дают
  native refusal; новых ENQUEUE/START не было. Готового clean reset не существовало.
- 17.10: подготовлен secret-safe bundle COMPLETE; внешний Pro не использован по
  прямому выбору пользователя. Внутреннее Ultra review разрешило узкую реализацию
  с отдельной reset policy, session anchor, native absence, mutex/once/CAS,
  физическим CEP tracker и закрытым admission до activation.
- 17.10: production-реализация завершена. Добавлены local MCP route, reducer/CLI,
  отдельная авторизация, native probe, mutex/CAS и CEP epoch/handshake. Уточняются
  live условия. Три замечания Ultra исправлены: lost lease, exact receipt hashes
  и known-failed read-only preflight retry. Correction source review GO.
- `fc3a9e6`: инструмент зафиксирован. Порученный reset выполнен один раз,
  operation `75081867…`, новая generation `408cbe01…`, pending_preflight.
  Девять CEP assets поставлены с полной резервной копией и hash read-back.
  Live startup выявил transient busy без возобновления poll; узкая CEP correction
  добавляет один passive retry до native submission. Delta Ultra review GO.
- `e9414ea`: startup correction поставлена. Обычный restart `64fa8b87…`
  подтвердил exit root daemon (WAIT_OBJECT_0/code0), successor `31518ffd…`.
  Fixed native read завершён, подписанная activation сохранена, reset_active.
  Следующий poll отверг строковую reset generation. Ultra одобрил отдельный
  numeric reconnect epoch после activation; исправление завершено и проверено.
- `47c7344`: numeric reconnect correction поставлена (9 assets, hash match).
  Restart `0e6e66c4…` подтвердил WAIT_OBJECT_0/code0, current `3ce32a47…`.
  Панель Connected/online; connected_idle, pending0/inflight0/editSession=null,
  autonomy active. Обычный typed get_project_info успешно прочитал текущий AEP.
  Reset и native preflight не повторялись; пользовательский scope завершён.
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
- Startup busy ожидается пассивно в том же actor/config; смена actor или physical
  unknown отменяет продолжение. Истёкший challenge обновляется одним fixed GET.
- Signed activation хранит исходный reset actor неизменным. Точный reset actor
  после activation и пустого physical tracker переходит в обычную numeric epoch;
  автономные полномочия устанавливает штатный observePanel, validator не расширяется.
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
  До live применения эти проверки оставались изолированными; queue/render acceptance нет.
- Startup delta: reset25, CEP48 actions/16 VM, rules/diff/JS syntax PASS; Ultra GO
  по SHA panel dbd6e955 и smoke 67b88ea9. Повторный reset не выполнялся.
- Numeric epoch SourceSTOP: reset32 с настоящим autonomous manager, CEP48/16 VM,
  rules/syntax/diff PASS; проверяются ACK loss, duplicates, actor/config drift
  и physical unknown, настоящий bootstrap0/manual connect. Ultra source review GO
  по SHA panel6e790905/smoke f82956bd; general numeric validator не изменён.
- Live reset/launch1, activation и обычный poll подтверждены.
  Passive wait connected_idle и настоящий project read PASS
  (17.10 16:08:51 UTC, revision12968664). CLI status консервативен и сам по себе
  не доказывает execution admission. Очереди и рендер не тронуты.
- Новая queue-проверка: dry-run ready, export real UNKNOWN, независимый source
  read-back PASS; snapshot file hashes не заменяют native verification.
  CU-блок только Resolve Fonts завершён, свой REPL reset; продуктовый код не менялся.
- Исторические diagnostics8/own-status29/not-sent+rehydrate25 и rules/syntax/diff PASS;
  actual addDL1/START0 и independent queued STATUS описаны в linked workflow.
  Fake/offline результаты не являются live доказательством нового reset.

## Следующий шаг

Reset завершён; новая проверка добавления остановилась до enqueue на source proof.
Для продолжения нужен отдельный scoped verifier existing snapshots с protected
restoration и durable verification receipt; original UNKNOWN/noReplay сохранить.
Не повторять export и не обходить gate через restart/raw/UI.
Исторические ENQUEUE/START/export/save/open и UNKNOWN не повторять.

## Отложенные scope

- [Release/PR/merge](../docs/release-workflow.md): отдельное поручение на merge.
- [Монтаж](../docs/montage-workflow.md), [его план](montage-pipeline-execplan.md).
- [Frozen boundary](../config/frozen-intake-manifest.json): без thaw.
- [Исторический first-two](../docs/owned-runtime-first-two-test-states.md):
  finite/native evidence не переносится в условия обычного product reset.
