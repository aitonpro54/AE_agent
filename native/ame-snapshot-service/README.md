# Resident service: офлайн-контракт enrollment / inspect v2

Отдельный AEGP/AEX для штатной загрузки при старте AE. Сборка по умолчанию
содержит **пустой compiled issuer pin** и остаётся dormant: нет worker/listener
и доступа к проекту. Нет fixture ENV, HMAC, SaveProjectToPath, capture, setters,
render/AME dispatch или caller JSX. `productionReady=false`; live M3 не принят.
Hot-load AEGP в уже работающий primary AE этим блоком не реализован и не доказан.

## Boot и bootstrap transport

`EntryPointFunc` приобретает только RegisterSuite5/v6, регистрирует death/idle
hooks и освобождает suite через RAII. Callback refcon живёт до выхода процесса:
SDK не предоставляет unregister. Ошибка после регистрации закрывает работу,
но не удаляет refcon. Atomic RAII gate защищает idle от вложенного dispatch;
suite reads выполняются только в исходном main thread. Death останавливает worker
и закрывает mailbox. Worker сам Adobe suites не вызывает.

Первый idle измеряет PID, полный FILETIME birth как десятичную строку,
полные пути/SHA-256 executable и AEX, build ID, заявленный SDK archive hash и
случайный boot challenge. Информационная JSON-квитанция публикуется один раз
в `FOLDERID_LocalAppData/AEAgent/native-snapshot-service/identities` через
CREATE_NEW, held handle, flush и абсолютный no-replace FileRenameInfo.
Receipt не аутентифицирован и **не даёт разрешения**; readonly и same-user ACL
не доказывают защиту от другого процесса того же пользователя. Её dormant /
`ipcListenerStarted=false` поля описывают момент публикации до optional listener,
а не служат последующим status-read transport. Сведения проекта не публикуются.

При непустом compiled pin после receipt запускается **bootstrap listener до
первого enrollment**. Это явное изменение foundation v1: сначала иначе негде
принять подписанный enrollment. Фиксированное имя зависит от host PID/birth и
challenge, pipe local-only/message/overlapped, один worker/instance с same-user
DACL и FIRST_PIPE_INSTANCE. Подмена/ошибка endpoint закрывает worker без fallback.
Bootstrap может разобрать bounded frame и вернуть отказ; только проверенные
enrollment + inspect дают ticket в main-thread mailbox. Сам listener не даёт
доступа к фактам проекта. Same-user ACL не является issuer authority.

## Подписанная авторизация

`service_authorization.cpp` определяет единственный canonical ASCII/LF frame
`ae-agent.snapshot-service.authorization.v2`: ровно 31 ordered key с конечным LF,
до 16384 байт, подпись CNG ECDSA-P256 как 128 lowercase hex. Разрешены только
`purpose=enrollment|inspect`, всегда `autonomous=false`; extra/duplicate keys,
неполные/неканонические числа, control bytes и чужие operations отвергаются.
Legacy request.v1 и caller-supplied FixedDaemonEnrollment по-прежнему закрыты и
не могут произвести `VerifiedInspectTicket`.

Подпись покрывает exact host executable PID/full birth/path/hash, AEX path/hash,
build/SDK hash, boot challenge, daemon PID/full birth/path/hash, generation/source
hash, nonce/issued/expiry. Inspect дополнительно содержит expected saved path,
action ID, proposal revision, payload/preview/dry-run hash, run ID и SHA-256
точного signed enrollment. В enrollment эти manual поля пусты. Source hash —
provenance, **не attestation загруженного JavaScript**. Actual peer identity
измеряется kernel pipe API; Node addon соединяется из текущего daemon-процесса,
а не из дочернего helper. Обе стороны проверяют server/client identity.

Enrollment TTL <= 60000 мс, inspect TTL <= 10000 мс, inspect не переживает
enrollment. Первое принятое enrollment закрепляет daemon identity/generation/
source за boot. Renewal допускает только ту же привязку, новый nonce и строго
возрастающие issued/expiry; смена процесса или source требует нового boot.
Exact current enrollment можно повторно прикладывать к новым inspect, пока оно
действует. Старое enrollment не возвращает authority после renewal.
Enrollment и inspect nonce сохраняются вместе на весь срок процесса, включая
timeout/refusal/cancellation. Всего 64 nonce; исчерпание закрывает verifier.
Mailbox имеет 4 слота. Timeout отменяет queued/active ticket; idle проверяет
cancellation/expiry до suites, при чтении и перед ответом. Replay запрещён.

Wire exchange содержит ровно две LF-строки `enrollment_hex=...` и `inspect_hex=...`,
не более 65536 байт. Response ограничен 2 MiB. После полного чтения клиент
отправляет canonical `transport-ack.v2` frame (до 512 байт): exact nonce/challenge
и SHA-256 всех response bytes. Для раннего отказа без parsed nonce используется
`nonce=-`. Сервер проверяет тот же kernel peer до отправки и после ACK, точное
совпадение frame и общий deadline 1000 мс на send/ACK; лишь затем отключает pipe.
Timeout/cancellation/invalid ACK закрывают delivery без повторения. Бесконечного
FlushFileBuffers нет. ACK подтверждает чтение transport bytes и **не означает
semantic acceptance**, успешную инспекцию или выдачу разрешения.

## Чтение и честное покрытие

Inspect требует одного saved проекта по exact signed path. Untitled отказывается.
Main-thread reader дважды сравнивает handle/path/dirty, revision и граф. Revision
читается одним **fixed compile-time read-only script** через UtilitySuite6;
пользовательские данные в него не попадают. Suite lease не делает fallback.

Покрытие — заданные поля bounded project graph: item identity/parent/selection/
flags, active item/layer ID, размеры/время/MRU view handle, timing/flags/downsample
comps, layer identity/source/switches/timing, plain Source Text на текущем времени,
footage/proxy file links. Это **не full project context**: эффекты, keyframes,
expressions, text formatting, render queue, viewer settings и undo history не
инспектируются. Нет обещания сохранения полного undo stack или capture semantics.

Лимиты: 256 items кроме root, 1024 слоя суммарно, 1 MiB graph; footage expansion
ограничен 64 файлами и 8 файлами на кадр. Cycle/unknown type/uncovered reference/
overflow отказывают **целиком**, без truncated success и без выдачи частичного
графа. В частности, проект из 465 items не поддерживается этим bounded reader.
Response описывает `completeWithinScope=true`, `fullProjectContext=false`, точные
limits/counts, included/notInspected и нулевые save/capture/caller-JSX dispatch.

## Офлайн-сборка и проверки

`scripts/ame-native-service-build.ps1 -OfflineSmokeOnly` собирает и выполняет
OfflineProtocolSmoke. Без switch дополнительно собирает AEX, NativeSnapshotIssuer
и NativeSnapshotAdapter.node; запускает только no-argument issuer refusal и
scoped Node addon smoke. **AE не устанавливается/загружается/запускается**,
production pipe не открывается, persistent issuer не создаётся. Harness создаёт
11 уникальных ephemeral named-pipe pairs только внутри своего executable;
их имена отделены от service namespace. Каждый build использует свежий
`build-<32hex>` в ignored `.codex-runtime/.../native-service-build`.

Helper генерирует build/SDK macros и пустой issuer pin. Опциональный
`-IssuerPinPath` читает уже отдельно проверенный public-only issuer-pin.v2 JSON,
проверяет schema/fields/P256 blob header/key-ID hash и компилирует его; helper
не создаёт ключ и не принимает pin из ENV. Сборка с pin не является deployment
или grant. Persistent nonexportable CNG provisioning — отдельная ручная операция
CLI `--provision`, не выполняемая build/test. Автоматической регенерации нет.
Private UI/daemon enrollment integration и доказанный manual confirmation flow
остаются вне этого этапа; addon `sign` проверяет canonical allowlist, но его
наличие само по себе не доказывает CEP approval или runtime manual gate.

Build receipt v2 сверяет ordered source digest, SDK inputs и compiler/linker/RC
до/после, фиксирует binary hashes и точный scope. Supplied archive hash не
выдаётся за повторно измеренный архив. Byte-reproducible PE не заявляется.

Harness исполняет actual protocol/auth/mailbox/freshness/overflow guards с
**настоящими in-memory CNG ECDSA-P256 signatures** и synthetic host/graph facts.
Проверяет tampered host/AEX/peer/challenge/action/revision/hash, valid-signed
wrong target, TTL/expiry, renewal/rollback, replay/capacity, cancellation и
enrollment|inspect allowlist. Test private key никогда не записывается на диск.
Дополнительный actual Win32 unit вызывает общие delivery helpers с delayed read /
ACK, cancellation, timeout, wrong nonce/challenge/hash, missing LF, extra key,
oversized ACK и wrong peer; kernel pipe identity helpers выполняются на двух
собственных endpoints одного test-процесса. Resident worker не запускается,
daemon-to-AE live connection и boot receipt helper не проверяются.
Node smoke проверяет N-API exports, identity своего Node и early refusals;
issuer без аргументов отказывается до provision. Нет вызовов EntryPoint или
Adobe suites/hooks, полного traversal реального AE графа, host load, live
inspection, save/export/M3. Receipt отдельно считает protocol/auth и IPC unit;
resident/production listener fields не приписывают test pipes рабочему backend.

## Запись этапа — 11 октября 2026

- **Progress:** существующий WIP enrollment/inspect подключён к actual AEX,
  issuer CLI и N-API targets; исправлена heterogeneous `auto` declaration.
  Default build остаётся без pin; CNG auth и Node ABI проверяются офлайн.
- **Decision Log:** bootstrap listener предшествует enrollment и не получает
  project authority; renewal фиксированной identity допускается без забывания
  nonce. Лимит 256 items сохранён с полным refusal, coverage ограничен явными
  полями. Capture/save и working primary host не затрагиваются.
- **Validation:** первый полный build `build-d3c89ae8994a4d25a9eb9c90db4ba5dc`
  скомпилировал все четыре targets, 421 CNG/protocol checks и 7 Node ABI checks
  прошли. Финальные receipts содержат дополнительные response-overflow guards
  и все текущие source hashes; точные итоги возвращаются родителю. M3 не принят.
- **P2 transport:** immediate disconnect после buffered WriteFile заменён на
  bounded same-peer/nonce/challenge/response-hash ACK. Первый actual Win32 unit
  `build-1c594df32d4c451491cc54564b6aeacd`: 425 protocol/auth + 94 IPC checks
  прошли на 11 ephemeral pairs; final rebuild включает уточнённые scope fields.
