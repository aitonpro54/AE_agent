# План исполнения AE Agent 3.3.1

Продукт: [target app](../specs/target-app.md); режимы: [deployment](../docs/deployment-modes.md).
Текущий контракт: [штатный сброс bridge](../docs/product-session-reset.md).
Исторический экспорт: [product two-title workflow](../docs/product-two-title-workflow.md).
AME global start: [контракт и статус](../docs/ame-global-start.md).

## Текущая цель пользователя

19.10: per-job self-check/immutable acceptance и AME global-start реализованы; reset/apply PASS.
Per-title SaveAs/snapshot/full-AEP SHA producer теперь EXPERIMENTAL / UNFINISHED / FROZEN.
Активное направление повторения N — open-comp enqueue, пока как архитектурный черновик:
[open-comp workflow](../docs/ame-open-comp-workflow.md). Без census/START/render/user jobs.

## Progress

- `505a439`: штатный restart и native project read PASS; история в product workflow.
- Experimental single-job SaveAs/source producer and full-AEP SHA are frozen;
  preserve implementation and useful tests. Details/evidence:
  [frozen workflow](../docs/ame-single-job-workflow.md).
- 19.10: v2 receipt/evidence фиксируют первый self-check. Адресный STATUS меняет
  только текущее наблюдение; acceptanceOnly читает локальную приёмку без OS/native.
  Legacy v1 без proof не мигрирует; corrupt соседний proof не скрывает свой job.
  Scoped specialist implementation и независимое High review GO; только offline.
- 19.10 offline: shared queued-only semantic branch принимает два разных STATUS с
  own-wrapper receipt и исходным completed ENQUEUE proof, без готового файла.
  Проверки сохранённых runs ниже остаются read-only; исходные outcomes неизменны.
  Legacy file-backed ветка остаётся строгой.
- Verifier: exact-selector tools, retained native result, fresh adoption,
  runner/readback/semantic integration; два P2 исправлены, final review GO.
  Exact once/slot, GUID/workArea и protected restoration — в linked workflow.
- 17.10: старый export dad3dc19…/f988d318… остаётся UNKNOWN без replay;
  история восстановления и позднего Resolve Fonts — в product workflow.
- Reset/reconnect milestones `fc3a9e6` → `47c7344`: review и corrections GO,
  activation/read PASS; подробности — в [reset contract](../docs/product-session-reset.md).
- Исторический AME: addDL1/own STATUS queued; предыдущая пара — два Ready,
  START1/encoding active, output quality не проверена. Детали в linked workflow.
- 19.10: reset завершён после свежего подтверждения отсутствия предыдущего
  процесса; verifier PASS и свежие own-item STATUS подтвердили два отдельных
  задания `queued`. Исходный selector остаётся UNKNOWN/noReplay; START0,
  appliedPresetVerified/mediaVerified=false. Агрегатор второго enqueue-плана сообщил
  `semantic verification_required`, поэтому остаётся consistency gap; подробности
  и IDs — в linked workflow.
- 19.10 после штатного restart checker build `921be66` применён; два существующих
  jobs повторно прочитаны как `queued`. Read-only checker на старых exact runs:
  slot2 association PASS/aggregate needs_review из-за сохранённого run.ok=false;
  slot1 needs_review из-за прежнего failed/UNKNOWN шага. Это не live semantic PASS.
- 19.10: reset `48ebe813…`/generation `f735709b…` applied; runtime PID3352 Connected/autonomy active, project `titr_all.aep` read PASS. Новый API catalog найден, вызовов AME API 0.

## Decision Log

- Reset разрешён пользователем 19.10 и выполнен root как sole controller через fresh CLI ровно один раз; старый failed startup `UNKNOWN/noReplay` сохранён. Direct MCP lifecycle collector остаётся на v84; служебное восстановление — fresh CLI без новых restart.
- [block: ame-autostart-global-start] [executor: ae_specialist] [reason: process/session/authority] [ownership: code/tests]; operator/docs.
- [block: per-job-acceptance] [executor: ae_specialist]
  [reason: durable acceptance, current status и UNKNOWN boundaries]
  [ownership: scoped code/tests writer; docs/review/commit — parent]. Только offline.
- Сохранённая приёмка не является текущим STATUS или execution authority. Новая
  mutation и START сохраняют fresh gates; explicit STATUS/UNKNOWN читают exact own job.
- Checker различает shared queued-only и прежний file-backed ENQUEUE contract.
  Без файла принимается только stopped/queued, нулевые progress/time и полные
  independent STATUS/receipt/command bindings. Media/preset completion не заявляется.
  Checker read-only; исходный sender UNKNOWN не становится success. Restart требует
  отдельного scope и не меняет исторические records.
- Свежие own-item STATUS после restart подтверждают текущее состояние jobs, но
  existing semantic API не принимает их как доказательства для старых enqueue runs.
  Исторические bytes/outcomes остаются неизменными; поздний queue read-back не
  переинтерпретирует неизвестный или failed шаг.
- 19.10: продолжение live и product reset явно разрешены пользователем. Родитель —
  единственный AE/CEP/UI-контроллер; specialist — read-only диагностика,
  operator — документация. Два задания приняты в разных внутренних batches
  штатным cross-batch proof после независимого STATUS первого задания; START0.
  Фактическая приёмка — два свежих own-wrapper STATUS, а не итоговый aggregate.
- Reset — явная local MCP операция, доступная без HTTP daemon, не fallback ensure.
  Caller не задаёт PID/path/generation/raw script. Initial/retained и настоящий
  pending lifecycle в v1 отклоняются; общий recovery framework не строится.
- User authorization на создание reset и внутреннее review получена в этом чате.
  Отдельная private reset policy не расширяет молча owned_daemon_lifecycle.
- Старый exact process должен быть строго absent; alive/reused/denied/unknown
  и занятый fixed endpoint — отказ. Отсутствие не является held-handle exit proof.
- [block: ame-generic-single-job] [executor: ae_architect → ae_specialist]
  [reason: дизайн затем scoped реализация] [ownership: docs → assigned code;
  parent — sole live operator]. Source preparation отдельно от queue checker;
  generic Save не получает обходного пути. Pending/source/actor UNKNOWN запрещает replay.
- Native wrapper resource bound 256 не является лимитом batch count N; сохраняется.
  Расширять его или обещать неограниченную вместимость в этом блоке нельзя.
- 19.10: human scope confirms producer is experimental/unfinished/frozen pending
  separate request. Active target is visibility → enqueue from open AE comp →
  exact new-job confirmation → repeat N; no owned AEP/full-AEP SHA/fallback/render/video acceptance.
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

- Per-job acceptance: focused 9 groups, AME semantic 18 groups, association 215
  cases с реальным архивом — PASS; v1 bytes/run.ok=false сохранены. Syntax 4 JS,
  общий semantic smoke/rules/diff — PASS. Дополнительный completion-order harness имеет прежний
  `messageArgument is not defined` (также HEAD); fixture вне scope не менялся.
- Checker regression: `ame-queued-association-smoke.js` с сохранённым real run —
  PASS 213 cases; historical association passed, replay aggregate passed,
  savedRunOk=false сохранён. Независимое read-only source review — GO.
  Related `ame-title-semantic-smoke.js --ame-only` — PASS 10 groups; в clean mock
  добавлен отсутствовавший frontend.addEventListener. Чужой test/source-proof WIP сохранён.
  Общий `semantic-verification-smoke.js`, rules, syntax трёх touched JS и diff — PASS.
- Verifier33, snapshots30/recovery19, actual lifecycle getter и ES3 parse3 PASS;
  rules/syntax/diff PASS. Дополнительный AME semantic fake fixture fails до новой
  ветки тем же code/line и с HEAD module; AME production/foreign WIP не менялись.
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
- Live verifier: PASS, receipt и оба final STATUS подтверждают flags/GUID/workArea,
  восстановленный чистый source и два queued items; aggregate semantic consistency
  остаётся незакрытой. Детали и игнорируемые runtime evidence — в linked workflow.
- Post-restart 19.10: runtime PID21860/source `921be66`, Connected/autonomy active;
  project clean revision12968664, pending/inflight0/editSession=null. Оба jobs
  снова queued с собственным STATUS. Сводка — `.codex-runtime/ame-checker-restart-20261019/summary.json`.
- 19.10: документация проверена `check:rules` и `git diff --check` — PASS;
  продуктовый код и чужой source-proof/test WIP не менялись.
- Single-job experiment: offline worker/source checks and prior syntax passed, but
  live ES3 read-only SHA probe of 32MB exceeded 15s and 40s before SaveAs; effects 0.
  Later Node worker read-only command timed out after an AE parser modal, before helper launch.
  Live acceptance is incomplete; producer remains frozen, with no GO claim.
- AME global start: offline checks/review PASS; reset `48ebe813…`, connected_and_idle, bridge/project reads PASS, catalog 4 API. Вызовов 0; queue/job STATUS/census, enqueue, AME launch, START/render 0. Прежний STOP и причина v84/v86 сохранены в workflow; live cold-start/runBatch не тестировались.
- Исторические diagnostics8/own-status29/not-sent+rehydrate25 и rules/syntax/diff PASS;
  actual addDL1/START0 и independent queued STATUS описаны в linked workflow.
  Fake/offline результаты не являются live доказательством нового reset.

## Следующий шаг

Следующий шаг: архитектурно определить контракт open-comp workflow, затем scoped
реализация по отдельному поручению. No owned AEP, full-AEP SHA, auto-fallback,
census, START, render, video acceptance, user jobs or UNKNOWN replay.

## Отложенные scope

- [Release/PR/merge](../docs/release-workflow.md): отдельное поручение на merge.
- [Монтаж](../docs/montage-workflow.md), [его план](montage-pipeline-execplan.md).
- [Frozen boundary](../config/frozen-intake-manifest.json): без thaw.
- [Исторический first-two](../docs/owned-runtime-first-two-test-states.md):
  finite/native evidence не переносится в условия обычного product reset.
