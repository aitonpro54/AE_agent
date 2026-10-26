# Core4 — исправления подтверждённых H1–H4 после M2b

27 октября 2026. Пользователь поручил исправить четыре подтверждённые группы итогового аудита, сохранить M2b и проверить целевыми тестами. Исходная точка: чистый `bd2d6fa5a23b1189acc6255878317f2f4d18ce49`, ветка `codex/ae-agent-core-4.0.0`. [Основной план](core-4.0.0.md), [M2b](core-4.0.0-m2b-events.md).

## Основание и scope

Полностью прочитаны `C:/Users/Ant/AppData/Local/Temp/core4-argon-audit-01a1795e/REPORT.txt` и `summary.json`. SHA-256 отчёта: `d584cb195ad91d3326ef81ec3d5bc62cb3f18992b1d5ca9ae113e18a0193e3c7`; summary: `dadebb2b7b9b9b15f1b50af1e11fb4b3f76dc0f38ab45776a065cb7fea3bef7b`. Аудит относится к тому же `bd2d6fa`; его harness18/18 подтверждает наличие дефектов. Repository83/84 содержит реальный CEP B6 `session_cas` до child crash, а не общий PASS.

Разрешены адресные изменения исходников, targeted offline regressions и необходимые проверки затронутых компонентов. Не повторять весь калибровочный аудит без новой причины. Не запускать AE/live, installed CEP/CDP/bootstrap/AME/cutover, браузер/Gemini/Argon; не менять доступ, credentials/config/общий runtime state/пользовательские БД. Push/merge запрещены. Workflow commit `df31175` из `codex/argon-review-workflow` не переносится. Текущая модель чата не переключается; один writer кода.

## Приёмка исправлений

| Группа | Подтверждённая проблема | Необходимая регрессия |
| --- | --- | --- |
| H1 | Snapshot refusal в inspect/verify оставляет physical lane и durable UNKNOWN при доказанном завершении чтения | Actual executors/dispatcher/receiver/store: titles animated и photo timeRemap, обе фазы, throw/callback-error; mutations0, следующий valid read проходит. Реально pending/no-callback не освобождает lane |
| H2 | Конкурентные reconcile дублируют completion/verify/terminal metadata; completion обходит deadline и drain/lease | Один control owner, bounded caller wait, physical pending учитывается до settle; close не отдаёт lease раньше окончания pending completion, поздняя запись по-прежнему запрещена |
| H3 | ItemId/file/output ограничения выпадают при layer matching | Все 18 dimension×restriction сценариев закрываются консервативно; broad grant не снимает narrow запрет, narrow-only не выдаёт broad authority. Полные Broker cases сохраняют fences до mutation |
| H4 | Artifacts пишет при busy state owner и публикует незавершённые final bytes | Busy constructor не пишет artifacts; runtime/module CAS публикуется только после полной записи, проверки и atomic publish. Process crash/short-write не оставляет partial final artifact, corrupt existing final не перезаписывается молча |

Ledger guard после close уже работает: его не представлять новым найденным обходом. M2b lifecycle-after-verify и exact approval сохраняются. Sibling-layer seed semantics спорны — не менять их без отдельного доказательства. CEP B6 остаётся отдельным незавершённым сценарием: stale synthetic session ломает setup до child crash, последующие crash boundaries не доказаны. Исправления H1–H4 не объявляются его сертификацией.

## Progress

- [x] Прочитаны актуальные инструкции и полный итоговый аудит; actual baseline/ветка/чистота подтверждены.
- [x] `ae_architect` получает только read-only repair contract, `ae_scout` — существующие audit evidence/harness seams. Root владеет плановыми файлами и Git; live-controller отсутствует.
- [x] `ae_specialist` — единственный writer `core4/**`: H1–H4 получили GO после read-only архитектурного контракта. Выбор XHigh обусловлен взаимодействием lifetime/authority/CAS, модель текущего чата не меняется.
- [x] Реализованы H1–H4 с целевыми регрессиями и final consumer checks.
- [x] Выполнены адресные проверки и bounded review; записаны coverage gaps, подготовлен локальный milestone `fix: resolve audited Core4 completion resource and artifact defects` без push/merge.

## Decision Log

- Сохранённые наблюдения той же версии переиспользуются как baseline; новые тесты доказывают исправления, а не повторяют assertions наличия дефектов.
- Неопределённый исход не переводится в definite rejection по таймеру. Callback/read refusal и отсутствие callback различаются по доказанной границе исполнения.
- Полная release/live certification не запрашивалась. Состав выполненных и незавершённых проверок записывается отдельно.
- H2: run/reconcile сериализуются; actual completion учитывается отдельно от caller deadline. До true settle сохраняются контроль владения, drain и lease; поздний результат после timeout не продолжает ledger workflow. Closed/lifecycle guards сохраняются после awaits.
- H3: exact scope может дать разрешение; неполный itemId/file/output scope не выдаёт разрешение и не теряет ограничений при совместимости известных измерений. Comp/layer mismatch exclusions не расширяются на спорную sibling-layer семантику.
- H4: проверка владельца предшествует artifact writes. Closure сначала целиком записывается и проверяется в уникальном staging directory; final CAS становится виден после atomic publish. Существующий final только проверяется, не ремонтируется скрытым overwrite.
- H1: fixed read wrapper ловит исключение внутри inspect/verify и возвращает tagged bounded read-failure. Callback до deadline подтверждает завершение чтения; private receiver сохраняет normal completed response, Broker поднимает прикладную ошибку без evidence/success. Внешний throw `evalScript`, отсутствие callback, timeout и поздний callback не объявляются definite no-effect и не освобождают неопределённый lane. Mutation semantics не меняются.
- Проверка H4 относится к process-crash atomic visibility. Power-loss/disk-controller durability Windows не обещается; cleanup касается только собственного staging, orphan staging после crash не используется как ready CAS и не ремонтирует final.
- Независимый `ae_reviewer` не нашёл concrete P1/P2 в стабильном production diff; отдельно прочитал regression suite и process-crash helper, подтвердил покрытие H1–H4 и сохранение controls. Самостоятельных динамических запусков reviewer не делал.
- Штатные existing offline loopback consumers CEP допускаются текущим поручением на необходимые интеграционные проверки. Выполняется только объявленный поднабор, B6 исключён и остаётся несертифицированным. Внешних отправок, Argon/браузера и дополнительного ранее остановленного ad-hoc probe нет; отказ или системный запрос не подтверждается за пользователя.

## Validation

- Старт: HEAD `bd2d6fa`, рабочее дерево чистое, branch `codex/ae-agent-core-4.0.0`, ahead2 относительно опубликованного `81ab980`.
- Исходные audit18/18, repository83/84 и lifecycle31/31 — историческое evidence этой версии, не результат исправлений.

### Итог исправлений

| Область | Выполнено на final dependency bytes | Ограничение |
| --- | --- | --- |
| H1–H4 source/VM regressions | 32/32 PASS | Actual source/receiver/executors и synthetic callbacks/process faults; не реальный Adobe runtime |
| Core selected consumers | 36/36 PASS | Финальный запуск после исправления ожидаемого числа batches в routing assertion |
| M2b lifecycle | 31/31 PASS | Отдельный final run после routing-only test diff, current evidence key подтверждён |
| Photo/titles owner и executor contracts | 7/7 PASS | Module/engine/admission bytes неизменны |
| Штатный CEP loopback subset | 13/13 PASS | Два B6 теста явно исключены; весь mandatory CEP batch не сертифицирован |
| Boundaries / diff checks | 18 source units PASS / PASS | Full release/live certification не выполнялась |

Итого **119/119 выполненных тестов PASS**, два B6 не запускались. Прежние частичные запуски Core35/36, routing/documentation6/6 и lifecycle31 до последнего test diff не суммируются с итогом. Полный калибровочный audit harness не повторялся.

Точные команды: первая выполнялась из `core4/`, остальные — из корня worktree, как явно указано в комментариях:

```powershell
# cwd: C:/Users/Ant/.codex/worktrees/core-4-m1/AE_Agent_Core/core4
node --test --test-reporter=tap --test-name-pattern="(?:documentation)|(?:validation-routing)|(?:core-control)|(?:core-admission)|(?:workflow-recovery)|(?:worker-isolation)|(?:protocol-codec)|(?:artifact-boundaries)" test/core4.test.js
# Следующие команды используют корень worktree как cwd:
node --test --test-reporter=tap core4/test/audit-repairs.test.js
node --test --test-reporter=tap core4/test/lifecycle-simulation.test.js
node --test --test-reporter=tap core4/test/modules/titles.test.js core4/test/modules/photo-placeholder.test.js
node --test --test-reporter=tap --test-name-pattern=cep-transport --test-skip-pattern=" B6 " core4/test/integration/cep-transport.test.js
npm.cmd --prefix core4 run check:boundaries
```

- `selectChecks(actual changed paths)` сохранил реальные owners/contracts/dependencies/evidence keys; commands выполнены по этой selection, с явно ограниченным CEP subset. Routes/deps не ослаблялись ради PASS. `catalog-discovery` остаётся deferred, whole CEP mandatory batch — unverified. `releaseCertified:false`.
- Папка результатов: `C:/Users/Ant/AppData/Local/Temp/core4-h1-h4-repair-VN0Ak0/`. `summary.json` содержит команды, counts, evidence keys, исключения и toolLogChunks; SHA-256 `1a285def2b77589da0a9d450580d547ce37f55c858fa8335ce812edab34eeaaa`. `selection.json` SHA-256 `47d3d119a728497f357414759e537838d97e073ca6edcbf17e79449c5a06d8cd`.
- `final-core.log` и `final-lifecycle.log` содержат raw TAP36/36 и31/31. Остальные32/7/13 подтверждены сохранёнными structured writer records с toolLogChunks; сырых TAP этих запусков в папке нет. Read-only scout независимо проверил raw Core/lifecycle counts, final selection/keys и current/frozen hashes; suites им не повторялись.
- Frozen manifests содержат все59 файлов Core4. Aggregate SHA-256 до/после final checks: `8f42cbc06cebbab5edcc6a2b55a1d5cd731f611dc5f4b67b2588906db3f591e3`. Core pin: `0cdda498e563e535b5db50358aa027e1d85bf8fa660a6d2f75a00d4a685b9591`; CEP pin: `b425b6ab2a02af5d22b9b4998fc2bcba7c1efc497d61ec1b135673b436152cda`. Core/CEP seal выполнены раздельно; module/engine/admission bytes не менялись.
- Подтверждены новые outcomes: следующий valid read после completed read refusal проходит; timeout completion сохраняет actual pending/busy/lease; H3 restrictions блокируют все18 нарушений и3 Broker mutations до send без расширения grants; busy/closed artifact API не публикует CAS, crash/short-write не оставляет частичный final, corrupt final не перезаписывается.
- Sibling-layer seed semantics сохранены. На закрытии H1–H4 B6 stale synthetic-session setup и его дальнейшие crash boundaries ещё не были исправлены и доказаны; последующая точечная проверка описана ниже. Реальный CSInterface, Windows power-loss/disk-controller, production lifecycle/issuer и live acceptance не проверены. Native AE calls0, внешних сетевых отправок0. Установки/config/credentials/общий runtime state не менялись; push/merge не выполнялись.
- Closing representation: все59 staged Core4 blobs совпали с frozen manifest по raw SHA-256; UTF-8 трёх изменённых Markdown файлов и17 локальных ссылок проверены; working/staged diff checks PASS. Stage содержит только14 Core4 файлов и2 плановых документа; workflow branch/commit не переносились.

### Точечный запуск ранее исключённых B6

27 октября 2026 пользователь отдельно разрешил запустить оба B6 и исправить только session/setup/child, сохранив production CAS и assertions. Нового плана или этапа не создавалось. База перед работой: чистый `79ea9d545a1460b16d1a4cd38f0453081cdab4e4`, та же ветка `codex/ae-agent-core-4.0.0`. Один `ae_implementer` владел двумя test-файлами; root — этой Validation и Git, `ae_reviewer` — bounded read-only review.

| B6 | Baseline на 79ea9d5 | Итог на окончательных test bytes |
| --- | --- | --- |
| Actual child crash intent and completion fsync boundaries survive reopen without replay | FAIL в setup: tagged read-failure `session_cas` от stale input оставлял отсутствующий snapshot; построение следующей команды давало `invalid_json` | PASS: intent71/ongoing/mutations0; pending74/ongoing/mutations1; completion72/completed/mutations1. Persisted text и no-replay/lane assertions сохранены |
| Disk write fsync failures and corruption close lane before false reply | PASS | PASS: все6 write/fsync injection points и corrupt journal сохраняют fail-closed outcome |

Изменены только `core4/test/integration/cep-transport.test.js` и `core4/test/fixtures/cep-crash-child.js`. Setup берёт current session из своего VM host. Fake AE VM/state/lifecycle живут в родителе, а receiver child использует async IPC; его crash не создаёт новое открытие проекта. Pending74 наступает только после actual parent evaluate/persist без передачи callback dispatcher; completion72 — после fulfilled receiver completion. Receiver reopen получает тот же state/source. Настоящий synthetic `project_open` отдельно ротирует actual VM session и проверяет reject/session_cas для старой команды без дополнительной mutation. Не добавлялись adopt-session, ослабление CAS или production API.

Reviewer подтвердил сохранность assertions/continuity/crash boundaries и не обнаружил P1/P2. Малое замечание к failure-path cleanup исправлено: kill не вызывает немедленный reject, сначала ожидается child close; teardown ожидает тот же termination promise, ошибки IPC send обработаны. Reviewer подтвердил закрытие по исходникам. Отдельная динамическая инъекция ошибки cleanup-пути **не запускалась**.

Точный targeted запуск из корня worktree, одинаковый для baseline и final:

```powershell
node --test --test-reporter=tap --test-name-pattern=" B6 " core4/test/integration/cep-transport.test.js
node core4/tools/validate-diff.js core4/test/integration/cep-transport.test.js core4/test/fixtures/cep-crash-child.js
git diff --check
```

- Baseline raw TAP:2tests, pass1/fail1, exit1; final raw TAP: **2/2 PASS**, fail0, exit0. Final повтор выполнен после cleanup-правки. Предварительный patched2/2 не суммируется с final.
- Evidence: `C:/Users/Ant/AppData/Local/Temp/core4-b6-fixture-repair-512906d0eb0b418bb8d855606eeac172/`; raw `baseline-b6.log`, `patched-b6.log`, `final-b6.log`; `summary.json`, `selection.json`, `before-core4.json`, `after-core4.json`, `frozen-owned.json`. Summary SHA-256: `3c4929ec30213b06c37dd0b64d553c4f894df1890193db7e04f5a0ea5a179c60`; final raw log: `ca31b8b4692ce8f54d09df17884681220d18b16e4351249097b3bf545e2de1e4`.
- Actual two-file diff выбирает только `cep-transport`; evidence key `c35763174c1a1e74936b9f850876011aa2bac76b3dd0a1e8a236961d9691e871`. Выполнены только два B6, поэтому whole mandatory CEP batch остаётся partial, остальные13 не повторялись. Lifecycle — deferred/current-closure-unverified. Это **не** новый full CEP/release PASS и не арифметическое дополнение прежних119 к fresh certification.
- Read-only scout сверил raw baseline/final counts, все59 current hashes и актуальную selection/key. Сохранённый и свежий JSON семантически совпадают; порядок двух deferred path entries различается, byte-equality JSON не заявляется.
- Остальные57 файлов Core4, включая production code и все pins, побайтно совпадают с `79ea9d5`; seal не запускался. Hash test file: `11acc54cd72d2e18a7529c13329c8022297f2d31811e69e9711be95aec111162`; child: `f48ee7f6c7642b96101a27608c8d783d4485aa38f67cc122641cbdcfa9d7404c`. Нового production defect в проверенном сценарии не выявлено; production не исправлялся.
- Scope evidence — Node VM/isolated loopback/process crash. Реальные AE/CSInterface/installed CEP, power-loss/disk-controller, production lifecycle и live proof не проверены. Внешних отправок, изменений credentials/config/общего runtime state, push и merge нет; `releaseCertified:false`.
- Closing: все59 staged Core4 blobs совпали с final manifest по raw SHA-256. UTF-8 двух плановых документов и18 локальных ссылок проверены, working/staged diff checks PASS. Локальный commit фиксирует только два test-файла и дополнения этих двух существующих плановых документов; нового плана/этапа нет.
