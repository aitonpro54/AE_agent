# Core4 M2a — optional CEP bridge, offline

26 октября 2026. Продолжение по поручению пользователя «Продолжай» от чистого `5667b5b8c9d29621cc5136d1abd89f6699ab9ce8`, ветка `codex/release-4.0.0`. Это следующий срез извлечения инфраструктуры из [основного плана](core-4.0.0.md), а не установка или live cutover.

## Цель и scope

Закончить проверяемый путь `Broker → optional transport → serialized channel → closed receiver → admitted executor → source-only CEP dispatcher → callback → durable completion`. Использовать existing photo/titles assets, без новой предметной функции. Core запускается и при физическом отсутствии integration package.

Разрешены исходники и isolated Node loopback/VM fixtures с fake AE/CSInterface. Не запускать installed CEP, live AE/CDP, production daemon/bootstrap/native factories, Codeburn; не менять установки, конфигурацию, credentials, пользовательские БД или runtime state. Старый UNKNOWN и исторический cutover не объявляются разрешёнными. Реальные project lifecycle/grant producers в этом срезе не реализуются; production connect остаётся unavailable.

## Границы и небольшой API

- Optional integration имеет собственные artifact/manifest, owner и проверки. Core не импортирует пакет; изменение его private implementation не меняет Core identity. Общие receiver/protocol interfaces являются явными public seams, не unrestricted dispatch ports.
- Transport сохраняет `connect({controllerId,channelEpoch,secret})`, `send(frame)`, `completion(commandId)`, `disconnect()`. Channel внедряется приватно; import не запускает listener/process/discovery. Нет поиска старого daemon/credentials, отправки на известный installed port, fallback или автоматического retry mutation.
- Private install seam принимает `moduleId/operationId/executorHash/source/admissionRef`, проверяет их и создаёт immutable executor registry. Runtime commands содержат identities/phase/payload, без script/source/path.
- Source-only host dispatcher выбирает fixed inspect/mutate/verify entry point и сериализует данные проверенным wrapper. Держит один physical latch; timeout/disconnect/restart не доказывают отмену `evalScript`.
- Optional durable store сохраняет single-owner lane, original command binding/digest до evaluate и completion до успешного ответа. Duplicate tombstones/ongoing/UNKNOWN переживают reopen. Corruption/storage failure закрывают lane. Secrets в records не сохраняются.

Минимальная generic Core delta — original dispatch provenance в durable intent и его проверка при reconciliation: original controller/channel epoch, command ID, executor/payload hashes, phase, receiver-store identity/receipt reference. Новая channel MAC подтверждает текущую выдачу proof, но не подменяет provenance первоначального исполнения. Неизвестная continuity остаётся UNKNOWN; read-back отдельный.

Receiver-store identity — происхождение журнала, не project incarnation. Path/dirty/revision, panel/controller epochs и JSON `{kind,lifecycleVerified:true}` не становятся lifecycle proof. Авторитетный producer и grants по-прежнему отсутствуют. Synthetic capability существует только в test embedding и не публикуется MCP.

## Реализация и ownership

Планируемые новые файлы: `core4/integrations/cep/{transport,completion-store,host-dispatcher}.js`, собственный manifest/artifact и `core4/test/integration/cep-transport.test.js`, VM host fixture. Адресные Core changes: receiver store contract, persist/verify provenance в broker, только необходимая protocol schema, packaging и validation map.

`ae_implementer` владеет новым integration, generic Core delta, scoped tests и соответствующими package/map changes. Root владеет этим и основным планом, Git commits и общими документальными bindings. Один writer на ресурс. `ae_architect` определил границы; `ae_scout` адресно подтвердил transport/host seams. Независимый reviewer получает bounded diff после стабилизации; не более двух helpers одновременно, live controller не назначается.

## Измеримая приёмка

| ID | Проверка |
| --- | --- |
| B1 | Core работает без integration; import пакета не создаёт listener/process/state и не открывает канал |
| B2 | Actual authenticated JSON проходит через реальный loopback framing/parser, receiver и dispatcher source в VM; quotes/newlines/JSX-подобный текст остаются данными, native calls 0 |
| B3 | Altered bytes/hash, чужие module/operation, неизвестные phase, runtime script/source/path отклоняются до physical evaluate |
| B4 | Второй controller не получает занятую lane; потеря callback/timeout/disconnect не очищают physical latch |
| B5 | После receiver reopen completed/ongoing duplicate не вызывает второй evaluate; старая неоднозначная попытка сохраняет UNKNOWN и блокировку |
| B6 | Actual crash/fault boundaries: durable intent до evaluate, completion до ответа; write failures не создают ложный no-effects или completion proof |
| B7 | Через новый authenticated channel принимается только completion с original binding/store continuity; подмена origin или потеря journal continuity сохраняет UNKNOWN. Успех требует отдельного verify |
| B8 | Отсутствующий реальный lifecycle/grant producer и shallow ready claims не делают production ready; public stdio не получает install/issuer/synthetic tools |
| B9 | Scoped selection включает owner и реальные consumers изменённого generic API; deferred coverage явная. Private integration patch не меняет Core/module pins и не требует полного release |

## Progress

- [x] Сверены чистые HEAD/branch, актуальные AGENTS и M1 evidence. Broad M1 suites без нового diff не запускались.
- [x] Bounded architect/scout подтвердили следующий полезный срез и отсутствие authoritative project lifecycle hooks в прежнем CEP.
- [x] Реализованы source-only optional bridge, public receiver SDK, durable completion и original dispatch provenance.
- [x] B1–B9 покрыты actual TCP/VM/crash fixtures и затронутыми conformance checks. Найденный review P2 исправлен; итоговая правка проверена обычным чтением исходника root и scoped regression. Milestone: `feat: add optional CEP bridge with durable dispatch provenance`.

## Decision Log

- M2a извлекает нужную инфраструктуру для первых двух модулей. Новая предметная функция сейчас не требуется; монолитный `command.script` ingress не переносится.
- Durable completion принадлежит optional integration; Core хранит нейтральный dispatch intent и сверяет origin. Пакет не входит в постоянную closure Core.
- Production authorization/lifecycle и actual shared-resource ownership остаются за этим срезом. Никакой runtime/config/БД публикации по факту успеха fixtures.
- Private channel provision остаётся вне TCP surface: wire принимает только send/completion, не connect с произвольным secret. Source package не содержит production listener/bootstrap; channel и lifecycle producer внедряются доверенным embedding. Lifecycle binding проверяется private brand, а не JSON-заявлением.
- Package identity фиксируется по собственным загруженным source hashes; cached factory не может назвать старый код новым pin после замены файлов. Import выполняет только read-only чтение собственного package, не создаёт state/listener/process.
- Specialist review выявил P2: повторный connect того же Core ранее сохранял key/epoch и позволял новому store принять прежний authenticated frame при совпавшем CAS. Исправление генерирует новые local candidate epoch/key для каждой private connection и публикует их только после trusted lifecycle/store validation. Original intent не переписывается. Дополнительная проверка actual TCP в suite отклоняет старый frame до evaluate; mutation count остаётся 1.
- No callback/ongoing/unknown после loss оставляют physical lane закрытой; completed proof можно читать при проверенной journal continuity. Store identity не используется как project epoch, secrets в journal не сохраняются.

## Validation

- На старте `5667b5b` чистый. Scout подтвердил нынешние seams: private transport injection, fixed envelope/receiver, default in-memory completion store, отсутствие реального lifecycle issuer. Old panel latch/callback — provenance семантики, не готовый Core4 ingress.
- Исходный scoped diff: 57/57 PASS в 4 batches (Core36, CEP14, photo3, titles4), routing/artifact9/9 после package/map metadata changes. Это baseline до финального channel fix.
- Итоговый frozen diff: `node core4/tools/validate-diff.js core4/core/broker.js core4/test/integration/cep-transport.test.js core4/README.md --run` — 54/54 PASS: Core32, CEP15, photo3, titles4. Ошибок/cancelled/skipped/todo нет. `releaseCertified:false`; `validation-routing` явно deferred/current-closure-unverified для этого конкретного запроса, его отдельный owner diff был проверен ранее.
- Лог последнего прогона: `%TEMP%/core4-m2a-channel-validation.log`, raw SHA-256 `7208d76b56f7f544ef0eca55e1ba441172720d14e388a62d09972d42e3210afd`. Read-only operator независимо подтвердил counts и hash, без повторного исполнения suites/probes. Первоначальные logs: `core4-m2a-scoped-validation.log`, `core4-m2a-routing-validation.log`.
- B6 fixtures используют actual titles JSX и отдельный child process: crash после intent, после физического evaluate до callback, после completion до ответа. После reopen повтор не вызывает второй evaluate; fault записи/fsync закрывает lane. B5/B7 suite подтверждает fresh connection и сохранение original completion binding при независимом verify.
- Boundaries18 PASS, `git diff --check` PASS. Старые 3.3.5 suites не запускались. Native/live AE calls 0; release/cutover/live acceptance не выполнялись.
- Final Core pin `fa6416e68e3d4e9bdec89ed7d3dddd534c55c9f88bbb48801140f7083d23b913`; bridge pin `417bb2f3d0f2dd06bbc63f6452325f667490470668a521978d84b1466e474e47`. Broker raw SHA-256 `aa123b96f24ef6e7252f4901dfc6d26a5da1678ca64c1b894df25abdc0d91a39`; CEP test `68600bbb9d18aeb5347adb5d896a4d78e5cb5648d6f195ce9afa8a884fb2f48c`. Operator подтвердил pins/hashes; photo, titles и plan-engine artifact bytes совпадают с `5667b5b`.
- Initial independent specialist source review нашёл один P2 и не нашёл других concrete P1/P2 в новых boundaries. После исправления root прочитал connect и dispatch comparison, проверил local fresh keys/epoch и отсутствие перепривязки original intent; исправление покрыто итоговыми scoped tests.
- Coverage gap: дополнительный turn specialist для повторной проверки был остановлен автоматической проверкой безопасности с причиной `possible cybersecurity risk`. Дополнительный сетевой probe не повторялся другим инструментом/моделью; вместо него выполнены обычная source inspection root и read-only сверка уже завершённых test logs. Финальное независимое динамическое повторение не утверждается.
- Closing representation: все 56 stage-0 Core4 blobs совпали с raw disk bytes, canonical pins сохранились. В 10 Markdown документах 28 локальных ссылок и UTF-8 проверены без ошибок; HTTP-проверки и новые тестовые запуски не выполнялись. Staged/working diff checks PASS.

## Что ещё не выполнено

Production project-lifecycle/grant producer, actual общий physical-lane ownership, installed CEP/MCP, live style/project proof и shared-resource census остаются отдельным следующим scope. Source dispatcher и private channel сами по себе не разрешают подключение к AE. Исторический UNKNOWN сохранён; ни save/reopen, ни административная отмена старых команд не выполнялись.
