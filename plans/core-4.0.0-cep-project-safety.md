# Core4 — защита текущей цели через CEP/JSX без C++ SDK

27 октября 2026. Baseline `844e8da`, ветка `codex/ae-agent-core-4.0.0`. Пользователь поручил продолжить без SDK и разобраться с защитой от смены проекта; затем выбрал «Допустимо подтверждение в AE». [Основной план](core-4.0.0.md), [offline lifecycle-контракт M2b](core-4.0.0-m2b-events.md).

## Решение и точная семантика

Прежний автоматический контракт требует continuity конкретной incarnation между inspect, proposal, send и independent verify. Совпадение path/IDs/text/style не доказывает её: повторно открытый тот же AEP может дать те же значения. Сохранённая JSX-ссылка или `isValid()` требуют отдельного подтверждения правил lifetime/invalidation; такого AE26.2-контракта здесь пока нет. Автоматический Broker и его synthetic-only gate сохраняются.

Выбран отдельный ручной вариант `current-matching-target-after-local-confirmation`: фиксированный reviewed JSX показывает конкретную замену и получает подтверждение в AE, затем заново разрешает текущую цель и проверяет весь baseline перед setter. Это разрешение на текущую совпадающую цель после локального подтверждения. Если исходная A заменена идентичной B до исполнения, новое подтверждение может разрешить действие на B; continuity A этим не утверждается. Отмена оставляет setter0.

Текущий блок — изолированный **offline-прототип** новой политики. Он проверяет поток proposal→receiver→queued JSX→confirm→fresh inspect→single setter→local readback. Прототип не подключается к `run_plan`, catalog, public MCP, production authority или установленному CEP. Он не создаёт настоящий issuer, ownership, checkpoint или physical shared-lane reservation. Необходимые будущие production-условия перечислены ниже.

## Основания и границы доказательства

| Первичный источник | Установленное свойство | Что из него не следует |
| --- | --- | --- |
| [Adobe CEP12 Cookbook, pinned source](https://github.com/Adobe-CEP/CEP-Resources/blob/ab5e4e3e53a42fad08e1225a22a991bb1ffe73f6/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md) | `evalScript` исполняет ExtendScript на основном потоке host; CEP events используют тот же поток | Preflight в Node не атомарен с исполнением; событие не доказывает своевременную смену epoch |
| [Adobe JavaScript Tools Guide CC, pinned PDF](https://github.com/Adobe-CEP/CEP-Resources/blob/ab5e4e3e53a42fad08e1225a22a991bb1ffe73f6/ExtendScript-Toolkit/Guides/JavaScript%20Tools%20Guide%20CC.pdf), физические страницы15,74,121 | Modal задерживает возврат caller и обрабатывает события; обычный event loop не выполняется во время непрерывной scripted operation, отдельный `update()` обрабатывает UI events | Весь `evalScript` с modal не является транзакцией; полного AE26.2-контракта отсутствия lifecycle reentry документ не предоставляет |
| [Adobe After Effects CS6 Scripting Guide](https://download.macromedia.com/pub/developer/aftereffects/scripting/After-Effects-CS6-Scripting-Guide.pdf), физическая страница15 | `isValid` проверяет существование объекта, отдельные операции инвалидируют сохранённые ссылки | Нет нужной здесь гарантии identity/invalidation/reuse при каждом same-path open/revert в AE26.2 |

Получены только публичные документы, без Adobe account/login/SDK. Evidence: `C:/Users/Ant/AppData/Local/Temp/core4-cep-project-guard-tD6bF8/`; `sources.json` содержит URLs, HTTP200, sizes и SHA-256. JavaScript Tools PDF: `0c92dae0e5fea60fcfd1f624e356e64dc9b3d54bc0a0133253e4915947c80cb7`; AE CS6 PDF: `94ee16c9e62cfdd678af06615a6c442c27e937052aa8568d046551a39132e6c1`. Это историческая документация Adobe, а не live-проверка текущего host.

## Порядок и приёмка source-only блока

Root владеет этим планом, основным планом, AGENTS и локальным commit. Read-only `ae_specialist` проверил authority/resource/verification seams. Единственный writer `ae_implementer` получает experimental JSX, private fixtures/tests и необходимые validation routes в `core4/`; он не управляет AE и не меняет Broker/production manifests.

| ID | Проверяемое поведение |
| --- | --- |
| P1 | Registry в private synthetic fixture хранит immutable зарегистрированный proposal/effect/baseline/pins и dispatch bindings. Forged/mismatched данные не доходят до confirm/setter; присланный digest не является authority |
| P2 | Reviewed JSX вызывает встроенный `confirm`; JSON `confirmed:true` и переданный callback не заменяют подтверждение. Видны exact old/new text и цель с явной новой семантикой |
| P3 | После confirm выполняется fresh resolve/inspect; drift path/IDs/text/style запрещает setter. Между этой проверкой, setter и local verify нет нового modal, UI update, scheduling или межпроцессного round-trip |
| P4 | При принятом новом ручном контракте queued identical replacement меняет только текущую B после подтверждения, A не меняется. Это тест новой семантики, а не старой incarnation continuity |
| P5 | Actual receiver сохраняет durable begin до evaluate; duplicate commandId не переисполняется. Timeout/loss/late confirm и setter-after-effect throw сохраняют UNKNOWN/no-replay и original command binding |
| P6 | Единственный setter и отдельный локальный readback проверяют результат и объявленный protected style. Этот readback не называется прежним Broker independent verify |
| P7 | Default connect остаётся unavailable; нет public issuer/injection, production activation, нового phase или обхода lifecycle/ownership/checkpoint |
| P8 | Dedicated scoped checks соответствуют actual changed paths; чужие pins/coverage не обновляются. Native/live AE calls0, releaseCertified=false |

## Progress

- [x] Проверены текущие исходники и граница queued execution; старые probes не запускались повторно.
- [x] Получены первичные Adobe PDF и bounded read-only specialist decision.
- [x] Пользователь выбрал допустимость подтверждения в AE; новая semantics определена отдельно от автоматического контракта.
- [x] Реализован изолированный reviewed JSX-прототип и private proposal fixture.
- [x] Выполнены scoped adversarial regressions, boundaries и bounded независимое review; открытых P1/P2 нет.
- [x] Итог подготовлен к локальному milestone commit `feat: добавить offline CEP/JSX-подтверждение текущей цели`; push не выполняется.

## Decision Log

- C++ SDK не является зависимостью выбранного пути и не запрашивается у пользователя. Блок относится к разработке продукта, без работы над пользовательским AEP.
- Общее имя session/nonce не переносит authority старой A на свежую B. Experimental output/fixture sessions не объявляются настоящей project-incarnation proof.
- Modal может пережить caller timeout: поздний клик потенциально приводит к эффекту. Timeout/disconnect/reset не отменяют физическую отправку и не разрешают replay.
- Source-only прототип разрешён выбранным направлением. Подтверждение в настоящем AE, installation и live acceptance сейчас не выполняются.
- Реализация переиспользует неизменённый titles executor через фиксированную композицию reviewed source в private fixture. Сравнение baseline выполняется ES3 canonical по значениям, без зависимости от порядка JSON-полей. UI показывает русское описание текущей цели и exact старого/нового текста; default choice — отказ.
- Неопределённый результат setter/readback private experimental embedding консервативно переводит в actual receiver UNKNOWN; его общий fixture fence дополнительно блокирует новые команды. Это тестовая политика закрытия admission, а не новый production resource provider. Durable store и original dispatch binding используются без изменения production-кода.

## Следующие условия production-интеграции

1. Принять и проверить для конкретного host узкий synchronous участок fresh resolve→setter→local verify: без lifecycle reentry и неподконтрольных callbacks. Main-thread execution отдельно недостаточен; synthetic VM это свойство AE не доказывает.
2. Определить свежие ownership/checkpoint bindings текущей цели и actual shared-lane provider. Старые session/checkpoint не переносятся по path/IDs. Save при необходимости остаётся отдельным gate.
3. Отдельно определить verifier новой политики: локальный readback и correlated durable result не подменяют существующий independent verify Broker. Решение должно описать поздний completion, observer loss, рестарт и unknown outcome.
4. Только после этого проектировать private production boundary/issuer/Node↔CEP channel из основного плана. Перед live нужны authenticated census, exact installed/source identities и явно выбранный тестовый AEP. Missing/unobserved состояния не считаются idle.

## Validation

- `node core4/tools/validate-diff.js core4/experiments/manual-current-target/transaction.jsx --run` — **13/13 PASS**, native calls0/network runs0. Проверены queued identical replacement с A untouched, отказ, forged registry/dispatch bindings, drift всех объявленных protected fields, target/text/lock/effect drift после modal, quoted data, single setter/local verify, setter-after-effect fault, timeout до исполнения и во время блокирующего confirm, позднее согласие, потеря callback, durable reopen и no-replay. После bounded review добавлен full identical project swap непосредственно внутри confirm: A setter0/B1, один confirm, fresh actual verify B и original durable completed binding. Прежние12 перекрываются итоговыми13 и не суммируются; source JSX/fixture/map после первого review не менялись.
- Selection всего actual Core4 diff содержит `manual-current-target`, `validation-routing`, `documentation`. Выбранный неповторяющийся routing/docs batch `node --test --test-name-pattern='(?:validation-routing)|(?:documentation)' core4/test/core4.test.js` — **6/6 PASS**. Внутренний titles-only locality run existing routing fixtures не суммируется как новая отдельная приёмка. `cep-transport`/`lifecycle-simulation` для этого diff имеют explicit deferred coverage; их прежние результаты не объявляются текущим PASS. `releaseCertified:false`.
- `npm.cmd --prefix core4 run check:boundaries` завершился exit1 до запуска script, без диагностированной причины; env/config не менялись. Точный прямой эквивалент `node core4/tools/check-boundaries.js` — **18 source units PASS**, liveCalls0. Это отдельный успешный запуск script, а не PASS команды npm. Broad/release/Core3 suites не запускались.
- Evidence в `C:/Users/Ant/AppData/Local/Temp/core4-cep-project-guard-tD6bF8/`: `manual-scoped.log`, `manual-routing.log`, `manual-selection.json`, `manual-boundaries.log`, `manual-boundaries-direct.log`, `manual-diff-check.log`, `manual-results.json`. Последний содержит hashes всех5 Core4 paths и logs; итоговый SHA-256 `c448705646146137936601bc04d0b1ef1e6c6ebbc3797f4ad1713ca2794e3411`. Previous12 log/results сохранены отдельно; routing6/boundaries18 после добавления только нового test case не повторялись.
- Root независимо сверил hashes исходников/логов с frozen result: mismatches0. Из59 прежних Core4 файлов изменены только README и validation map; production code, schemas, admissions/catalog и все artifact pins byte-exact неизменны. `before-core4.json`/`root-validation.json` сохраняют сверку. Строгая UTF-8,34 локальные ссылки четырёх изменённых Markdown (missing0) и `git diff --check` PASS. Перед commit повторяется только документальная/staged сверка; tests без нового code diff не повторяются.
- Независимый `ae_reviewer` проверил frozen пять Core4 files, source/evidence hashes и saved outputs: ACCEPT, открытых P1/P2 нет. После дополнительного case он адресно прочитал только новый test и обновлённые hashes/results, подтвердил сохранение ACCEPT. Reviewer tests/live не запускал. Предварительный `ae_specialist` отдельно принял focused plan по authority/reentry/ownership границам.
- Отсутствующие actual AE/ownership/checkpoint/issuer/channel/independent verification proofs не заменяются количеством offline tests. Следующий необходимый вход для физического подтверждения выбранного пути — отдельный разрешённый host-validation scope на явно выбранном тестовом AEP и свежий authenticated runtime/shared-lane census; повторять offline suites вместо этих фактов не требуется.
