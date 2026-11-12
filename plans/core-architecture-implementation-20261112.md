# Core 4.2.6: архитектурная сверка и план реализации

Дата: 12 ноября 2026. Назначение: исполненный source-план A → B → C и его evidence.
Рабочий корень: `C:/Users/Ant/Documents/Codex/AE_agent_core`.

## Решение

Сохранить существующую архитектуру. Выполнить ограниченное укрепление контрактов,
затем отделить описание состава от запуска runtime. Полная перепись, новый
универсальный plugin framework и переделка восстановления для этого не нужны.

Главная проблема — стоимость изменения: описание состава, проверка допуска,
генерация registry, выбор proof adapters и запуск процессов сосредоточены рядом.
Один новый профиль или версия затрагивает несколько списков и условных ветвей.
При этом разделение внешнего продукта, серверного допуска и физического исполнения
уже содержательное; его следует сохранить.

Реализация делится на три этапа:

1. **A — локальные гарантии:** ожидание close, диагностика bootstrap, граница builder input.
2. **B — состав и зависимости:** безопасное отделение чистого описания состава,
   полная ревизия каталога и проверка совместимости версий.
3. **C — связность и приёмка:** адресная проверка сквозного пути и применимости
   прежних результатов; подготовка пакета к отдельному выпуску.

Записка первоначально подготовлена по поручению на анализ и план. Затем
пользователь прямо поручил исполнить source-этапы A → B → C здесь, в Core-чате,
с проверками и отдельными коммитами. Установка, перезапуск AE, live-мутации
и повтор старых команд в текущий source scope не входят.

## База и достоверность

- Product snapshot: `6d40cc228d9f2e18c672af5782033be305b82917`, Core **4.2.6**.
- HEAD при повторном разборе: `48576d1` — последующие коммиты аудита документальные.
  `git diff 6d40cc228d9f2e18c672af5782033be305b82917 -- core4 products` пуст.
- Ветка при подготовке: `codex/ae-panel-startup`. Уже изменены `AGENTS.md` и
  `plans/core-transfer-4.2.5-20261111.md`; эти изменения принадлежат другим работам.
- Основные evidence: [решения аудита](../reviews/architecture/20261112-current-01/decisions.md),
  [локальный Pro triage](../reviews/architecture/20261112-current-01/local-pro-triage.md),
  [локальный Argon triage](../reviews/architecture/20261112-current-01/local-argon-triage.md).
- Pro и Gemini дали `revise`. В Gemini модель была выбрана как Argon перед
  отправкой; после сбоя UI показывал Flash в следующем composer. Backend-модель
  ответа независимо не подтверждена. Решения ниже опираются также на локальный код.
- Повторно прочитаны ключевые полные функции broker execution/reconciliation,
  attachment shutdown, composition/release verification, bootstrap/latch, упаковки,
  client bootstrap, artifact/worker, ledger, product Titles и правила portability.
  Это разбор основных границ, а не утверждение о чтении каждой строки репозитория
  или формальное доказательство отсутствия всех дефектов.
- При подготовке исходного read-only плана тесты, product build и live AE не
  запускались. Результаты последующей реализации приведены в Progress/Validation.

## Архитектурная карта

```mermaid
flowchart TD
  Product[Внешние продукты: задания, шаблоны, компиляторы] --> Client[MCP thin client]
  Client --> Owner[Installation Owner: IPC, lease, lifecycle]
  Owner --> Broker[Broker: evidence, build, proposal, dry-run]
  Broker --> Worker[Worker: вычисление typed intent]
  Broker --> Policy[Authority, resources, checkpoint, execution policy]
  Policy --> Transport[HTTP peer и durable completion store]
  Transport --> Panel[CEP: authenticated link, registry, callback guard]
  Panel --> Executor[Допущенный JSX executor в AE]
  Executor --> Proof[Исходная квитанция и read-back]
  Proof --> Broker
  Spec[Декларация состава и фиксированные profiles] --> Package[Пакет: manifest, hashes, registry]
  Package --> Install[Installer: локальные bindings и integrity]
  Install --> Owner
  Install --> Panel
```

Стрелки показывают данные и wiring, а не передачу права на мутацию. Ни внешний
продукт, ни worker, ни manifest сами по себе не выдают authority.

| Составляющая | Проверенный вывод | Решение / остаточная граница |
|---|---|---|
| Внешние Titles/Slideshow | Titles компилирует данные, не импортирует runtime и не получает credentials | Сохранить. Художественные правила, шаблоны и задания остаются снаружи Core |
| MCP client и IPC | Thin client проверяет собственный release, отделён от panel credentials; EOF не должен останавливать Owner | Сохранить. Убрать зависимость клиента от runtime entry ради чтения composition после проверки пакета |
| Installation Owner | Общий процесс, controller lease, ограниченные роли и draining | Сохранить. Исправить нижний close, не переписывать maintenance/death protocol |
| Broker и plan engine | Сервер владеет evidence/build/proposal; перед dispatch повторно сверяет pins и цель | Сохранить. Закрыть добавление builder полей вне declared expectations |
| Authority и ресурсы | Private brands, grants, resource constraints, reservation и checkpoint имеют разные назначения | Не сливать в один флаг ready/approved; не переносить в product или JSON manifest |
| Modules и worker | Версионированные artifacts, admission, immutable copies, ограниченный worker IPC | Сохранить. Статический review кода и отдельный процесс не объявлять полноценной OS sandbox для враждебного кода |
| Composition и profiles | Выбор состава декларативный, но допуск новых result/effect profiles закреплён в trusted code | Это допустимая граница. Существующий profile переиспользуется декларативно; новая семантика proof требует reviewed adapter |
| Package / transitive closure | Упаковщик собирает прямые файлы и artifact closures, проверяет hashes и запрещённые пути | Сверять фактический manifest, а не только modules[] или размер исходников. Наличие файла не означает активный маршрут |
| Catalog identity | Revision может зависеть лишь от последнего добавленного manifest | Исправить семантику revision; package hash и module pins остаются отдельными identities |
| Bootstrap trust | Entry использует builtins до проверки дерева; check-boundaries охраняет порядок imports | Главная граница этапа B. Чистота функции не делает её файл доверенным до integrity verification |
| HTTP/CEP auth | Loopback/Origin/MAC/sequence и роли проверяются отдельно | Сохранить. Ограничение pre-auth challenge — liveness вопрос, не доказанный auth bypass |
| Registry и panel identity | Exact build/installation binding, callback guard и persistent latch | Исправить диагностику ошибки. Не снимать UNKNOWN и не повторять eval по timeout/throw |
| Native execution / resultProfile | Active HTTP route понимает профильные receipts; generic receiver имеет другой контракт | Зафиксировать таблицу маршрутов. Не ослаблять allowlists ради общего формата |
| Journal / recovery | Intent до send, durable completion, original binding, UNKNOWN/fences, no replay | Сохранить. Разделять доказательство завершения и простое совпадение текущих значений |
| Startup / host adoption | Есть отдельная capability запуска и доказательства привязки executable/panel | Текущее fresh read не доказывает cold/hot/repeat startup новой identity. Не возобновлять frozen MSIX root-rebase |
| Installer / переносимость | Код и пакет отделены от локальных state/config/credentials | Приёмка продукта на MSI; на десктопе адресная проверка переноса. Не повторять всю P1–P8 без причины |
| Render / media / external processes | Есть отдельные proof adapters и render-job capability; её присутствие зависит от состава | Не включать их в каждый состав ради удобства. Общие history/maintenance файлы могут быть нужны для сохранности прежних jobs |
| Версии и compatibility | Есть несколько exact-version allowlists; registryVerification включён проверкой `=== '4.2.6'` | Проверить переход версии явной матрицей. Не заменять ограничения широким semver >= |
| Observability / API ошибки | Различаются pre-dispatch отказ, completed rejection и unknown; G-01 теряет диагностический код | Сохранить фазу, исходный код и безопасное nextAction; диагностический текст не выдаёт recovery authority |
| Производительность / история | Sync fsync и линейные проходы существуют, текущий ущерб latency не измерен | Пока сохранить. Не вводить БД, compaction или обязательный reset без измеренного требования |

## Что меняется относительно внешних рекомендаций

1. AE-04 подтверждён для `runtime/attachment-owner.js:215`, но верхний
   `stdio-entry.js:462` уже имеет shared closing promise и maintenance fences.
   Общая поломка Owner shutdown не доказана.
2. G-01 — потеря `registry_refresh_failed` в `poll-dispatcher.js:99–115`.
   Сохранённый latch не является сам по себе дефектом: callback может быть
   неизвестен, а signed retirement уже есть. Первая правка улучшает диагностику,
   не вводит новый протокол автоматического разблокирования.
3. AE-07 — недостающая общая гарантия `added keys ⊆ expectedBindings` в
   `core/broker.js:173`. Текущий злонамеренный builder или обход действующего
   workflow не найден; нужен негативный fixture, а не объявление инцидента.
4. G-02 — неполнота change identity (`package-installable.js:75–82`),
   а не недетерминированная сборка одинаковых inputs. Исправление revision
   закономерно меняет package hash; обещать byte-identical пакет нельзя.
5. AE-06 не доказывает сломанный Titles. `core/receiver.js` действительно
   попадает в пакет через `core/artifact.json`; active HTTP route использует
   профильный validator. Удаление receiver только по этому замечанию неверно.
6. AE-01–03 — вопросы применимости evidence. Полные execute/reconcile paths и
   исторические проверки существуют. Missing excerpt не превращается в missing code.
7. Дополнение этого разбора: извлечение helpers затрагивает trust bootstrap,
   а exact-version ветви требуют проверки следующего выпуска. Это риски
   будущей реализации, не новые доказанные текущие аварии.

## Целевые контракты до начала реализации

### Close

Все вызовы после начала принятого закрытия ожидают одну underlying cleanup
операцию и получают одинаковый итог, включая rejection. Cleanup выполняется
один раз. Закрытие admission происходит до первого await. `owner_draining`
до начала cleanup не отравляет будущую допустимую попытку close. После ошибки
cleanup последующий вызов не превращает её в успешный no-op. Не требовать
объектного `===` у Promise, возвращённых async wrapper: важны lifetime и итог.

### Bootstrap diagnostic

Строго различать success callback, связанный error callback, malformed/foreign
callback, sync throw и отсутствие callback. Только существующий success
контракт вызывает `/registry-ready`. Связанный `registry_refresh_failed`
сохраняется как диагностический факт; он не означает, что Node получил
authenticated terminal outcome или что частично выполненный bootstrap можно
повторить. Persistent latch и signed retirement сохраняются.

Начальный scope не вводит `/registry-failed`, новый durable terminal state или
автоматическое clearing/retry. Если для передачи диагностики через существующий
status всё-таки понадобится новый wire format, это отдельный небольшой контракт
до кода, с перечислением отправителя, MAC, binding и совместимости.

### Builder intent

После существующей schema validation каждый ключ `intent.input` обязан быть
либо в исходном `desired`, либо в ключах `effectPolicy.expectedBindings`.
Исходные значения desired, target и expected bindings проверяются как прежде.
Нельзя легализовать произвольные optional schema fields только потому, что они
есть в inputSchema. Проверка действует и в initial build, и в materialize.

### Composition и identity

Чистые helpers получают данные/ограниченный read callback и возвращают данные
или registry source. У них нет процессов, сети, runtime state, credentials,
lease/grants или module-path imports из manifest. Runtime wiring и proof factories
остаются в доверенном адаптерном слое.

`catalogRevision` — версионированный digest окончательного выбранного состава:
composition identity, упорядоченных module entries с artifact/admission pins,
engine pin, assets/result profiles/capabilities. Поля и canonicalization фиксируются
в тесте и документе. Не включать revision в собственный preimage, timestamps,
machine paths или runtime IDs. Сохранять значимый порядок массивов; не обещать
одинаковый digest для перестановки, если контракт не объявляет её эквивалентной.

Revision меняется при изменении любого включённого предметного artifact/admission
или выбранного профиля; не меняется от правки невключённого модуля. Она не заменяет
release hash, coreIdentity, protocolPin, installationId или authority.

## Этап A — три малых изменения контрактов

Исполнитель реализации: Sol 6.1 High (`ae_implementer`), отдельные коммиты A1–A3.
При сомнении о bootstrap/authority — узкий `ae_specialist`, без общего redesign.

### A1. Lower close

- Ownership: `core4/runtime/attachment-owner.js`, нижний `facade.close()` в
  `core4/runtime/stdio-entry.js:718` и их адресные offline тесты. Direct stdio
  возвращает именно facade close; его concurrent/rejected cleanup имеет тот же
  подтверждённый дефект ожидания. Верхний `exposeOwner`/maintenance не менять.
- Ввести shared cleanup state/promise по контракту выше, не менять wire API,
  Owner lifecycle, leases или правила accepted/pending.
- Приёмка: два одновременных close при управляемом отложенном cleanup;
  один cleanup; оба ожидают; оба видят одинаковую ошибку; requests после начала
  закрытия отвергаются; draining до закрытия допускает последующий close.
- Для facade отдельно проверить отложенный и rejected `peer.close()`: ни один
  повторный caller не завершает ожидание раньше cleanup и не получает success
  после его ошибки. Поведение цепочки `peer.close`/`broker.close` при ошибке
  закрепить явно; не выполнять cleanup повторно ради получения успеха.
- Отдельно проверить верхний Owner wrapper; не исправлять его без контрпримера.

### A2. Registry diagnostic

- Ownership: `core4/cep/js/poll-dispatcher.js`, только необходимая диагностическая
  обработка `panel.js` и связанные VM fixtures.
- Распознать строго связанный error callback вместо потери кода в `invalid_frame`.
  Проверять nonce, version, точный allowed shape и текущий callback token.
- Если сохраняется дополнительный diagnostic record, он связан с прежним latch
  и не служит основанием удалить его, создать новую session или вызвать eval.
- Приёмка: success unchanged; matching error виден; wrong nonce/extra keys/raw
  parse error не маскируются как известный отказ; sync throw и missing callback
  не снимают guard; storage failure сохраняет отказ; signed retirement по-прежнему
  требует доказанный completed reset и архивирует исходный latch.
- Начальный этап не требует AE. Native proof назначается лишь для затронутого
  пользовательского обещания, если оно будет заявлено в выпуске.

### A3. Builder boundary

- Ownership: `core4/core/broker.js`, узкие broker/admission fixtures и необходимые
  artifact hashes через существующий sealing workflow.
- Негативный builder добавляет optional, schema-valid effect field, которого не
  было в desired и expectedBindings. Отказ происходит до публикации build/dispatch.
- Проверить expected bindings, сохранение desired, повторный materialize,
  payload с ошибочной целью и отсутствие физической мутации.
- Текущие законные builders сохраняют результат. Не расширять inputSchema и
  не доверять внешнему compiler заполнять серверные expectations.

## Этап B — состав без зависимости от запуска

### B0. Сначала контракт integrity bootstrap

Исполнитель: `ae_architect` или текущий явно выбранный пользователем архитектор.
Это адресная сложность проверки доверия, не основание переписывать весь startup.

Составить для каждого entry точную последовательность:
`read descriptor → verify pinned tree/path/root → load fixed helper → semantic
composition validation → lifecycle admission → construct runtime`.

Сейчас `verifyRelease` одновременно проверяет bytes и интерпретирует состав,
а `verifyInstallation` вызывает его до возвращения в `start`. Поэтому просто
добавить top-level import `composition-spec.js` нельзя. Принятый вариант для
реализации: оставить минимальную проверку bytes/paths/pins на builtins в bootstrap;
разрешить один фиксированный pure helper только после доказанной проверки
соответствующего дерева и его привязки к исполняемому entry. Одинаковое название
файла в source tree и installed tree не означает одинаковые доверенные bytes.

До перемещения кода зафиксировать поведение старых поддерживаемых пакетов,
в которых нового helper нет: отдельный явный legacy путь с прежними проверками
либо документированное сужение поддержки по отдельному решению. Не использовать
тихий fallback, произвольный dynamic require, eval или загрузку из cwd.
Если извлечение требует нового trust протокола, сократить B1 до post-verification
потребителей и оставить verifier inline; это допустимый ограниченный результат,
который нужно прямо отметить, а не ослаблять guard ради рефакторинга.

### B1. Извлечение и wiring

- Кандидаты: pure composition description, fixed profile metadata, registry source,
  installation config/marker derivation. Предлагаемые имена файлов —
  `runtime/composition-spec.js`, при необходимости `runtime/registry-source.js`.
- Consumers: package/install tools и проверенный client; runtime использует
  контракт B0. `stdio-entry.js` остаётся composition root для runtime процессов.
- Все imports proof factories остаются фиксированными и проверяемыми; manifest
  не получает поле с произвольным исполняемым путём.
- Update: source-package/closures, standalone closure, boundary checker и ровно
  затронутые tests. Sealing выполняется штатно; правка checksum не заменяет тест.
- Не объединять с переносом всех proof adapters по каталогам, удалением legacy
  receiver или переработкой shutdown/recovery.

Приёмка: package/install/client не импортируют runtime entry только ради metadata;
невключённые возможности не добавлены; corrupted/missing helper отклоняется до
его исполнения и создания runtime/state; old package compatibility имеет явный
исход; checker запрещает прочие early imports. Для чистого extraction должны
совпадать selected assets, catalog semantics, generated registry и tool surface.
Source file hashes и package hash могут измениться от перемещения кода.

### B2. Catalog revision и минимальный состав

- Вычислить revision один раз после окончательного выбора modules, admissions,
  engine, assets, profiles и capabilities. Убрать присваивание в цикле modules.
- Fixtures: два разных dynamic modules; изменение первого и последнего;
  изменение admission/profile/engine; изменение исключённого модуля; одинаковые
  inputs дважды; циклическое наследование/дубликаты/лишний файл → отказ.
- До/после сохранить объяснимый manifest diff: для каждого добавленного файла
  прямая причина либо dependency chain. Проверять минимум readonly/owner,
  manual/owner, manual-titles-variants/owner и затронутый operator состав.
- Не удалять общие render history/maintenance по одному названию файла:
  проверить обязанность новой установки обнаруживать прежние незавершённые jobs.
- Не обещать, что manual-titles-variants уже минимален: он наследует
  manual-titles → manual-layout → manual; оценить transitive features по
  объявленному сценарию. Изменение пользовательской поверхности — отдельный
  объяснимый diff, не скрытый побочный эффект extraction.

### B3. Совместимость версии и result profiles

- Явная таблица: product version, release format, composition policy version,
  owner/receiver contracts, registry verification и client/serverInfo.
- До изменения номера выпуска найти все exact-version ветви, включая
  `deriveComposition`, `verifyRelease`, `verifyPackage`, client entry и
  panel identity. Новая версия не должна молча выключать registry verification.
- Не включать произвольные будущие версии через `>=`; незнакомые formats и
  capabilities отклоняются. Старые проверенные форматы сохраняют свои требования.
- Матрица result routes: модуль → resultProfile → runtime proof → transport
  validator → completion/read-back. Generic receiver проверяется как отдельный
  поддерживаемый маршрут, если он действительно используется.
- Для существующего result profile добавление законного модуля должно обходиться
  декларацией/артефактом/admission без новой ветки Broker. Новый effect/proof —
  отдельное расширение trusted adapters; универсальный plugin ABI не требуется.
- Эта приёмка относится к переносимому profile, а не всем profiles подряд:
  TEMP-only новый reviewed module с owned-text-layer-v1 сохраняет прежние typed
  semantics и подтверждение; runtime selection и HTTP validator проверяются
  через production seam. Fixed module-identity profiles/OPERATOR_EFFECTS
  сохраняют прежние отказы. Положительный и отрицательный случаи описаны
  в [контракте B0](../docs/core-composition-bootstrap-contract-20261112.md).

## Этап C — доказать затронутую связность

Из A1 известен test-only пробел текущего panel identity handshake. Перед broad
affected прогоном исправить owner-runtime panel helper и проверить аналогичные
installed-composition/transition fixtures. Использовать действующий пример
installable-runtime.test.js: panelIdentity.verify(), loadedPanel/extensionRoot
в подписанном claim и signed registry-ready. Synthetic helpers без releaseDir/
cepDir не переводить механически на installed identity. Это ремонт fixtures,
production HMAC/Origin/identity/registry gates сохраняются.
Также сохранить исходный A3 core suite FAIL: три exact routing assertions
ожидают прежние два checks, текущая карта добавляет panel-lifecycle. В C
обновить точные ожидания по окончательной карте после B, без ослабления selector
или замены assertions на неполные includes.

Для продуктового шва C использовать существующий manual-http-runtime fixture:
его реальный Broker contract/inspection передать в products/titles prepareBuild,
затем продолжить прежние proposal/dry-run/run/receipt/read-back. Не копировать
request вручную и не подменять inspection.synthetic. Действующий manual-policy
fixture сам возвращает synthetic=false через свой private port в изолированной
TEMP-среде; это не authority установленного AE и не native acceptance. Existing
transport crash/ACK/UNKNOWN fixtures дополняют этот сценарий, без дублирования
широкого harness и без экспортируемых production grants.
Предпочтительное размещение нового интеграционного test — products/titles/test:
он использует реальный compiler и существующий Core manual-http fixture через
узкий test-only request-builder hook. Core production/startup не импортирует
продукт; root confinement validation-map не ослабляется ради внешнего test.
Supplemental product/source hashes фиксируются отдельно от Core check keys.
В C адресно проверить package-location CSS fixture; stopped-update содержит
корректный образец identity restamp. Capability artifact manifest v2 и owner
contract v3 — другие identities: их не менять массово вслед за standalone v3.

1. Использовать актуальный diff и existing validation map. Для каждого изменённого
   инварианта: какой fixture ловит нарушение, какой результат получен, какое
   историческое evidence применимо и что осталось непроверенным.
2. Проверить supported Titles path на offline harness: product prepare-build →
   contract/evidence → build/propose/dry-run → execution policy → соответствующий
   completion/read-back. Harness остаётся synthetic и не выдаёт production grants.
   Сначала найти подходящий существующий integration test; не плодить его копию.
3. Адресные failure transitions: stale input/pin; rejected before send; accepted
   then disconnect; lost callback; сохранённый result с потерянным ACK; restart с
   UNKNOWN. Во всех случаях не больше одного физического исполнения, повторная
   доставка receipt не превращается в повтор eval, новое владение не получает
   право продолжить старую неопределённую команду.
4. Сверить initialize/version/tools-list свежего offline client и состав пакета.
   Полный release suite нужен только если назначен выпуск, а не как бесконечный
   startup gate для каждой обычной content-задачи.
5. Если затем поручены установка и продуктовая приёмка: проверять на MSI один
   согласованный сценарий на собственном стенде; сохранить receipt, read-back,
   визуальный результат и освобождение lease. Для новой identity отдельно
   определить необходимость host adoption/startup proof. Не использовать
   существующий пользовательский AEP как удобный тестовый стенд.
6. Перенос принятого пакета на десктоп — штатный preflight/apply/read-back;
   повторять лишь затронутые границы. Frozen MSIX root-rebase остаётся frozen.

## Проверки и управление scope

Read-only mapping неизменённого product snapshot, полученный при подготовке:

| Изменяемый путь в core4 | Выбрано checks | Batches |
| --- | ---: | ---: |
| runtime/attachment-owner.js | 14 | 14 |
| cep/js/poll-dispatcher.js | 7 | 7 |
| runtime/stdio-entry.js | 30 | 30 |
| tools/package-installable.js | 12 | 12 |
| core/broker.js | 26 | 19 |

Это плановый объём, не результаты запуска. Наборы пересекаются; их нельзя
складывать как число уникальных проверок. В реализации пересчитать выбор
для фактического diff, включая новые файлы и sealing dependencies.

Из корня Core для адресного выбора:

```powershell
node core4/tools/validate-diff.js <changed-path> --run
npm.cmd --prefix core4 run check:boundaries
git diff --check
```

Сначала посмотреть mapping без `--run`, оценить выбранные проверки и применимость
reuse. Несколько общих файлов могут выбирать широкий набор — не запускать один
и тот же набор после каждой мелкой правки. Новый путь helper обязан попасть в
dependency mapping. Исключение большого набора обосновывается затронутой closure,
а не желанием получить зелёный результат. Не запускать live endpoints, installer,
Chrome или AE под видом offline теста.

Перед каждым commit: только свои paths, актуальные hashes evidence, scoped test
results, обновлённые Progress/Decision Log/Validation. Чужие dirty файлы не
нормализовать, не коммитить, не stash/reset. Один writer на файл, один live
контроллер; helpers получают immutable snapshot или явно выделенный scope.

## Отложено и почему

- G-03 recordContext без projectId: текущие AE modules используют projectId;
  решать при реальном non-project module, не выдавать metadata за authority.
- G-04 challenge fairness: сначала требование по локальной угрозе и liveness;
  не снимать лимиты/MAC/Origin и не нагрузочно тестировать живой endpoint.
- G-05 dev-entry version: явно dev metadata; можно исправить в отдельной
  согласованной правке версии, не считать текущий installed MCP старой версией.
- Ledger DB/compaction, распределённый owner, cross-machine execution state,
  новый browser bridge, общий plugin marketplace — вне нужного решения.
- Специальные случаи project-open timeout/media rejection в Broker — долг
  адаптерной границы. Переносить только при новом use case или измеримой выгоде,
  с тестом сохранения pre-dispatch/unknown семантики; не включать в A автоматически.
- Generic receiver не удалять по отсутствию его вызова в одном сценарии.
- Не возобновлять остановленный `core-msix-layer-recovery-20261112.md`, не
  перемещать foreign lower state и не повторять settled reset/install IDs.

## Definition of done

Source-работа завершена, когда A1–A3 и согласованный объём B выполнены отдельными
reviewable commits, контракты и затронутая closure проверены, фактический manifest
объяснён, C содержит результат интеграции и честный список непроверенных live
границ. Отсутствие live-приёмки не скрывается за offline PASS. Релиз/установка
отмечаются отдельно и не считаются выполненными самим созданием плана.

## Progress

- Отдельное поручение после source A/B/C выполнено в
  [install/live-продолжении](core-architecture-install-live-20261112.md):
  штатная установка operator-render-jobs/owner `950d180c…`, native Titles,
  PNG кадра0, project-save с checkpoint и свежие read-backs. I commit `89a6b85`;
  II завершён с native PASS и независимым ACCEPT, оформляется отдельным
  milestone-коммитом. Source A/B/C bytes не изменялись.

- **A → B → C завершены в разрешённом source scope.** Финальный verified join:
  82/82 current checks, 72 distinct batches, 1338/1338 Node records PASS,
  fail/cancel/skip/todo 0. Итог MULTI_CONTEXT_SELECTED_PASS, 4 записанных runtime
  contexts; равенство окружений и full release не заявляются. Не выбраны
  catalog-discovery и validation-reuse; их current PASS не приписан.
  Final source union43 paths к dd50fb8 и protected dirty hashes сверены.
  [Coverage](../docs/evidence/core-architecture-implementation-20261112/C/final/actual-selected-coverage.json),
  [архитектурный результат](../docs/core-architecture-result-20261112.md).
  Независимое итоговое ae_reviewer чтение фактического evidence: ACCEPT,
  P1/P2 нет; current keys/raw logs,385 supplemental source hashes и candidates
  подтверждены. Новых tests/build для этого review не запускалось.
- C7 принят independent review, mixed-repair 44/44 и lifecycle31/31 PASS.
  Genuine kernel reservation/busy/pipe проверки изолированы в TEMP; существующий
  установленный Owner и canonical3457 не менялись. Все 11 исходных failed/
  UNKNOWN attempts сохранены. Final Titles28/28; четыре current candidates
  совпали с прошедшими dry-run distributions. Ветка остаётся Core4.2.6;
  публикация, actual installation/cutover и live/native acceptance не назначались.
- Milestone commits: A1 5ea56ca, A2 563f30a, A3 37c68a0, B0 5ef6921,
  B1 d8740d0, B2 0378e88, B3 3f6821f. Финальный C commit содержит оставшийся
  source/test diff, эту запись и сохранённое evidence. Записи ниже — ход работы.
- C4/C5/C6 применены после independent ACCEPT. Final four-key attempt:
  lifecycle 31/31, installed-composition 23/23, exact f548 1/1 PASS;
  mixed 36/42, 6 FAIL. Все 4 helper-drift cases PASS. Шесть remaining —
  actual kernel endpoint conflict3457, который занят существующим production
  Owner (его не трогали); guard правильно даёт repair_endpoint_busy. C7
  изолирует только TEMP operator на собственном ephemeral endpoint, сохраняя
  реальные bind/busy/pipe отказы и production port/pin/PROFILE. C7 исполняет
  ae_implementer; после review повторяются лишь mixed и lifecycle keys.
- C3 второй controller завершён: 44/44 batches, 41 PASS и 3 FAIL
  (mixed legacy CEP7/8, legacy R1 registry4.2.2, exact transition test deadline).
  813 Node test records: 793 PASS/19 FAIL/1 cancelled; это попытка, не финальная
  source certification. Большие stopped-update 61/61 и native-read-recovery
  23/23 приняты в пределах current keys. C5 исправляет только legacy registry
  fixture; C6 увеличивает test deadline30→90s после установления полного
  завершённого transition outcome и отсутствия связанных actors. Все исходные
  FAIL/cancel/UNKNOWN и их logs сохраняются.
- C3 runtime checkpoint: повторный stopped-update/frame-export-slot batch
  завершён 61/61 PASS за ~39 минут. Initial UNKNOWN не переписан; принадлежавшие
  timeout стенду процессы ранее проверены как завершённые. Во втором controller
  закрыты batches 1–8: 53/53, 15/15, 31/31, 35/35, 33/33, mixed 23/41 FAIL,
  start-over 3/3, stopped-update 61/61. Остальные группы продолжаются.
  Единственный текущий известный FAIL — mixed legacy CEP contract; для него
  подготовлен и reviewed C4, который применяется после завершения controller.
- C4 подготовлен только в TEMP и независимо reviewed ACCEPT: mixed incident
  fixture приводится к явно synthetic legacy release policy 4.2.5, без нового
  registry marker. Настоящие derive/revision/registry/verifyPackage сохраняют
  current executable bytes и формируют согласованные 7 CEP-файлов. Pure preview
  3 packages/read-only plans PASS; patch ещё не применён и runtime suites ему
  не приписаны. Production incident 7/pin/PROFILE/guard остаются frozen.
- C3 применён после исходного checkpoint: 7 reviewed test-only файлов совпали
  с prepared SHA. Initial run завершился на batch36 по 30-минутному timeout
  stopped-update/frame-export-slot; outcome UNKNOWN сохранён. Дочерний PID
  отсутствует, owned TEMP Node actors не найдены, cleanup не потребовался.
  OS PID и exec session ID различены исправленной metadata-копией отчёта.
  Новый frozen diff — 42 source paths; выполняются 47 checks/44 batches,
  включая незапущенные и все инвалидированные, с лимитом 2 часа на batch.
  35 unchanged PASS — только кандидаты до final verified join.
  После применения Titles снова 28/28, current candidate fingerprints 4/4
  совпали с actual dry-run distributions, boundaries 92 PASS.
- C2: обе tooling closure исправлены по архитектурному контракту; 11 applicable
  focused checks, boundaries 92 PASS. Независимый reviewer ACCEPT для C1/C2,
  8+5 source hashes сверены. Production native-read operator остаётся v1.
  Exact f548 input восстановлен из 7dec462 исходным builder с полным совпадением
  размера/SHA/packageHash; прежний ENOENT сохранён, не переименован в PASS.
- C3: заморожен полный diff к dd50fb8 — 37 source paths, 82 checks/72 batches,
  2 deferred. Полный Titles suite 28/28 PASS. Initial union выполняется;
  собраны дополнительные fixture FAIL: неполная CLI copy, installed identity
  в synthetic owner helper, старые routing/count/journal expectations,
  start-over handshake и исторический source pin TEMP mixed-repair.
  Test-only исправления готовит ae_implementer в отдельном TEMP; основной
  checkout остаётся замороженным до завершения initial run. Финальный proof
  объединит только точные current keys и verified raw logs после scoped rerun.
- C1 выполняет ae_implementer: current identity/registry handshakes и точные
  routing/cache assertions обновлены в fixtures; реальный Titles compiler
  прошёл offline HTTP/receipt/read-back и stale-input отказ. Две production
  tooling closure после B1 обнаружены неполными: check-package-location snapshot
  и native-read operator не несут composition-spec helper. Их безопасный
  own-tooling contract отдельно разбирает ae_architect до исправления.
  Полный affected union ещё не запущен; предварительно 82 checks/72 batches.
- C packaging: readonly/manual/manual-titles-variants/operator-render-jobs owner
  собраны детерминированно, verifyPackage/verifyStandalone и actual v3 dry-run
  из foreign CWD PASS. Все пути назначения в task TEMP отсутствуют после dry-run,
  distribution bytes сохранены. Это candidate proof, без real install/native.
- B3 реализован ae_implementer: явная release feature policy в trusted bootstrap
  и pure spec; неизвестная версия отвергается до чтения состава. Narrower
  owner/client whitelist сохранён. Actual TEMP module проходит штатный
  owned-text-layer-v1 adapter, signed HTTP, receipt и свежий read-back;
  sibling/cancellation/invalid receipt/no replay проверены. Focused 67/67 PASS,
  boundaries 92; независимый ae_architect review ACCEPT, семь SHA совпали.
  Четыре состава сохраняют 70/90/115/164 файлов и прежнюю поверхность;
  selector 61/9 deferred — это выбор, полный union исполняется в C.
  [Evidence B3](../docs/evidence/core-architecture-implementation-20261112/B3/acceptance.json).
- **B2 реализован:** один selected-v1 digest полного выбранного каталога;
  генератор остаётся packaging-only. 36/36 focused tests, syntax/boundaries 92
  и diff check PASS; независимый ae_reviewer ACCEPT.
  [Контракт revision](../docs/core-selected-catalog-revision.md),
  [evidence B2](../docs/evidence/core-architecture-implementation-20261112/B2/acceptance.json).
- B2 manifests: counts 70/90/115/164, added/removed 0, изменён только
  config/catalog.json; registry/assets/capabilities/tool surface совпали.
  Selector 15 checks/15 batches и deferred 35 сохраняются для union C.
- **B1 реализован и принят в source scope:** pure spec после own-root проверки,
  trusted standalone tooling copy/manifest v3 и legacy data readers/rebundling.
  Focused suites 58/58, boundaries 92, syntax 13 JS и diff check PASS.
  Source trust review и адресный standalone review ae_architect ACCEPT.
  [Evidence B1](../docs/evidence/core-architecture-implementation-20261112/B1/acceptance.json).
- При промежуточной реализации B1 source/client parity и manifest сравнение дали
  ожидаемое +1 common helper (69→70, 89→90, 114→115, 163→164), registry bytes и
  выбранные metadata/assets/tool surface совпали. Но выявлен data-only seam:
  в flattened standalone tooling import runtime/composition-spec разрешается
  к candidate-owned файлу. Изолированный poison-candidate dry-run воспроизвёл
  исполнение marker-кода после успешной outer byte verification, без install.
- Эта B1 граница передана ae_architect для конкретного trusted tooling closure
  решения, включая supported old no-helper candidates/distributions. Writer
  не перезаписывает candidate bytes и не ослабляет guards; независимые parity/
  client fixtures продолжаются. Исходный failure evidence остаётся в task TEMP
  core4-b1-8413d5e1fdeb442d9f38522ca633a4eb до финального связывания результатов.
- B1 seam contract уточнён: отдельный trusted tools/composition-spec slot,
  repository shim и full own pure bytes в standalone; новые manifests v3.
  Legacy v1/v2 data readers и old candidate/capability rebundling сохраняются.
  Current executable отвергает legacy-only tooling closure до imports.
  Ae_implementer продолжает реализацию по этому контракту после XHigh-разбора.
- Финальный B1 actual dry-run: poison helper не исполнился, destination не
  создан; supported old format2 без runtime helper работает; capability mode
  сохраняет отказ ordinary dry-run. Runtime manifests +1 common spec, selected
  assets/metadata/registry/tool surface эквивалентны. Standalone имеет +2 paths
  против baseline role count (runtime candidate spec + trusted tools spec).
- B1 оставляет C старую installable-runtime wrong-root fixture: изменение CSS
  без restamp identity даёт panel_identity_integrity раньше intended root guard.
  FAIL сохранён; C восстановит fixture с прежней целью. Полный affected union
  пока не заявлен, baseline standalone role counts реконструированы, не запускались.
- **B0 завершён:** [контракт доверенного bootstrap](../docs/core-composition-bootstrap-contract-20261112.md)
  подготовлен ae_architect, независимый ae_reviewer ACCEPT. Inline verifier
  остаётся прежней доверенной границей; fixed pure spec загружается после
  проверки собственного root либо trusted tooling читает candidate как данные.
- B1 передаётся ae_implementer по зафиксированному контракту. Его ограниченный
  результат сознательно сохраняет дублирование inline semantic validation;
  parity fixtures не допускают незаметного расхождения. Новый trust protocol
  и версия продукта не нужны.
- **A3 реализован:** validateIntent запрещает дополнительные keys вне desired
  и expectedBindings при initial build и materialize. Четыре новых actual-worker
  fixtures и audit-repairs 32/32 PASS; syntax, boundaries 91 и source diff check
  PASS. Ae_reviewer ACCEPT. Core artifact resealed штатно, protocol/admissions
  не менялись. [Evidence A3](../docs/evidence/core-architecture-implementation-20261112/A3/acceptance.json).
- Full core suite A3: 39/42 PASS, три существующих exact routing assertions FAIL
  сохранены. Они сравнивают прежние два checks с текущими тремя; C исправляет
  ожидания по окончательной карте. Full selected current PASS пока не заявлен.
- **A2 реализован:** строгий связанный bootstrap error callback сохраняет
  registry_refresh_failed через существующий UI. Success/registry-ready,
  persistent latch, signed retirement и UNKNOWN/no-replay не изменены.
  panel.js менять не потребовалось. 146/146 offline tests, syntax и boundaries
  91 PASS; ae_reviewer ACCEPT.
  [Evidence A2](../docs/evidence/core-architecture-implementation-20261112/A2/acceptance.json).
- Оставшиеся A2 выбранные integration routes (installable-runtime,
  manual-runtime, ae-panel-startup) и deferred records сохраняются до C;
  полный current closure PASS этим локальным этапом не заявлен.
- **A1 реализован:** оба нижних close ожидают один cleanup и сохраняют его
  rejection; direct stdio сразу закрывает tool admission/status. При ошибке
  peer.close Broker/state lock не освобождается. Upper Owner/maintenance не менялись.
- Проверки A1: owner-attachments 38/38, focused runtime 3/3 PASS; syntax четырёх
  JS, entry boundary и diff check PASS. Независимый ae_reviewer — ACCEPT.
  [Evidence A1](../docs/evidence/core-architecture-implementation-20261112/A1/acceptance.json).
- Исходные FAIL сохранены: первая версия new fixture использовала transient
  gate вместо steady lock; исправлена. Existing desired-stop fixture получает
  /link403 из-за отсутствия текущей panel identity; она не объявлена PASS.
  Её test-only ремонт и полный affected набор входят в C. A1 selection —
  37 checks/37 batches, 26 deferred; полный current closure proof пока не заявлен.
- Исходный план подготовлен до source-реализации; текущий статус определяется
  поэтапными записями выше.
- План подготовлен в чате «Настроить мост к Chrome». По прямому поручению
  пользователя продолжение и финальная проверка переданы в Core-чат
  «Провести аудит архитектуры» (`01a1cede-3e0f-7aa1-a375-be24e49bec1e`).
  Прежний чат подтвердил остановку, status idle; помощник завершён.
- Карта composition/test/validation собрана read-only по immutable snapshot
  `48576d1`. Независимый ae_reviewer проверил оба документа; единственный
  actionable P2 — пропущенный facade.close — включён в A1.
- Подготовлен [готовый запрос для нового чата](core-architecture-new-chat-20261112.md).
- Пользователь прямо поручил реализовать план в этом Core-чате: A1 → A2 → A3,
  затем B0–B3 и C, с проверками и отдельными milestone commits. Прежний
  документальный stop-line на начало source-работ снят этим поручением.
- A1 выполняет ae_implementer (Sol 6.1 High), владеет двумя нижними close и
  адресными fixtures. B0 параллельно исследует ae_architect read-only:
  конкретная сложность — integrity-before-import и совместимость старых пакетов.
  Координатор владеет планом/evidence/коммитами; установку и live AE не запускаем.

## Decision Log

- Install/live продолжение не расширяет source certification до full release.
  Native срез — один собственный однородный 2D point text с активными Fill/Stroke.
  Unknown чтения сохранены, reset архивы exact; исходный startup reconciled
  тем же UUID после ручного восстановления панели. Это установленные пределы,
  не основание ослаблять gates или менять source без доказанной причины.

- C завершён без нового incident rebase: package maker моделирует известную
  legacy4.2.5 policy только в synthetic fixture, сохраняя current executable
  bytes и отдельное provenance. Это не byte-identical исторический4.2.5 пакет
  и не native old-panel proof. Для exact f548 использованы побайтно восстановленные
  данные. Ephemeral endpoint адаптирует только TEMP operator, включён в его
  operatorHash; mutable production overrides не введены.
- C evidence: явный per-check-contexts принят ae_architect и независимо reviewed.
  Каждый current-key PASS сохраняет собственный полный runtime/envhash; прочие
  runtime-поля одинаковы. Итог MULTI_CONTEXT_SELECTED_PASS не утверждает равенство
  окружений. Initial main хранит только общий envhash; остальные отличия этого
  окружения восстановить нельзя. Strict режим не меняется, prod guards не затронуты.
- C: production incident repair PROFILE/SOURCE_CLOSURE_HASH/guard остаются
  прежними. Для synthetic fixture допускается один manifest двух существующих
  literal-import roots и его pin в TEMP operator до load. После plan digest
  не обновляется; новые negative tests проверяют helper drift до plan и до apply.
  Это не новый production incident rebase и не снятие frozen MSIX scope.
- C: CSS leak в source-location checker порождает restamped panel identity,
  поэтому первый exact byte-diff — cep/js/panel.js. Production compare order
  сохранён; fixture проверяет именно CSS input delta и связанный panel stamp.
- B3: closed feature table сохраняет прежние version/format пары и отсутствие
  registryVerification у старых selected shapes. Минимальная inline/spec
  дубликация защищена parity, без preverification import. Portable execution
  подтверждён в stdio; этот тест не заменяет общий restart/UNKNOWN no-replay proof.
- B2 не вводит общего runtime helper для единственного writer revision.
  Старые revision читаются opaque; candidate/runtime IDs, machine paths,
  исходный catalogRevision и excluded modules в preimage не входят.
  Значимый порядок arrays сохранён; новый digest не является authority.
- Уточнение B0 в B1: own-tooling helper должен оставаться отдельным от candidate
  и в flattened standalone, а не только в source checkout. Current supported
  legacy rebundling не сужается молча; итоговый контракт фиксируется до принятия
  B1. Outer reviewed distribution hash не заменяет data-only boundary tooling.
- Добавление standalone v3 — явное разделение tooling/candidate ролей, не смена
  версии Core и не расширение authority. Runtime spec не дублируется в HELPERS;
  новый tooling slot копируется из reviewed source, candidate hashes неизменны.
  Подробные legacy/current closure и отрицательные fixtures закреплены в B0.
- Проверка target tree не удостоверяет соседний helper исполняемого source tree.
  Поэтому ранний verifier не вызывает новый require; новый entry требует свой
  pinned helper без missing-helper fallback. Legacy readers/форматы сохраняются.
- B3 доказывает переносимый owned-text-layer-v1 на TEMP-only reviewed module.
  Identity-bound profiles и OPERATOR_EFFECTS не расширяются ради fixture.
  Это уточняет исходное общее обещание модульности, сохраняя authority envelope.
- A3 усиливает общий validateIntent, без отдельного mutable allowlist и без
  фильтрации нежелательных полей. Схема может разрешать optional поле, но worker
  не вправе добавить его без desired/expectedBindings. TEMP-only admission
  fixtures изолированы; production sealing выполнен только --component core.
- A2 использует существующий error.message путь. Matching finite error требует
  exact keys/version/nonce, текущий callback token и owned latch; malformed и
  foreign callback не превращаются в подтверждённый отказ. Новый terminal
  wire result, автоочистка и повтор исполнения не введены.
- A1 safe sequencing: failed peer close сохраняет ошибку для повторных callers
  и удерживает Broker lease; cleanup не повторяется автоматически. Runtime
  status обозначает closing немедленно, существующий public return API не расширен.
- Широкий набор общих файлов не повторяется после каждой локальной правки:
  A1 проверяет changed invariant fixtures, текущий union будет выполнен в C.
  Сохранённый /link403 исследован как несовместимость test helper текущему
  identity/registry контракту, без ослабления production auth.
- Перепись не нужна; порядок A → B → C уменьшает число одновременно меняющихся
  инвариантов. Крупные этапы делятся на малые отдельные commits.
- Bootstrap diagnostic отделён от решения о terminal outcome/recovery.
- Pure extraction допускается только с сохранением integrity-before-import.
- Версия продукта, schema capability, catalog revision и authority — разные
  понятия; не использовать одно как замену остальным.
- План не превращает старые acceptance gaps в обязательный gate каждой
  пользовательской задачи. Frozen работы остаются остановленными.
- На момент передачи выполнялась только финализация плана без новых
  browser/external/live действий. Следующим прямым поручением пользователь
  разрешил source-реализацию здесь; новый чат автоматически не создаётся.
- Новое поручение на реализацию получено здесь. A/B/C остаются source scope;
  выпуск, публикация, установка, изменение MCP/CEP config и native приемка
  не добавлены. Совместимые исторические records переиспользуются только
  в пределах проверенной closure. Проверки общих файлов группируются по
  завершённым инвариантам, а итоговый affected набор проверяется в C.

## Validation

- После завершения A/B/C пользователь отдельно поручил установку и live AE.
  I/II [продолжения](core-architecture-install-live-20261112.md): пакет
  operator-render-jobs/owner `950d180c…` установлен штатным stopped update;
  CEP/native read, текст с 16 exact style fields, PNG и typed save PASS.
  Исходные receipts/read-backs/checkpoint, визуальный просмотр, освобождённый
  lease и сохранность четырёх пользовательских AEP учитываются отдельно от
  source evidence. Финальный AEP после save не переоткрывался; full release
  не заявляется. Пределы завершённой source-приёмки не переписываются.

- Финальный source coverage SHA:
  032a12aa3d0a3a9277336d79992ab318b1be9ba35912e0738a8f0e123afac261.
  Verifier повторно проверил current Git union, hashes43 source files, protected
  files, selector/map, input/config/runner pins, original scope relations,
  before/after keys, actual commands/cwd и raw logs/counts/matched names.
  246 rejected stale/nonPASS candidates не скрыты; 11 failed attempts сохранены.
  1338/1338 — сумма 72 distinct used batches, не сумма повторных attempts.
  Дополнительно final Titles28/28 и boundaries92 PASS. Source/package fingerprints
  и команды с raw hashes лежат в evidence C; больших package blobs в Git нет.
- C evidence automation — task-local, вне product/runtime. Full runner и
  explicit-subset runner независимо reviewed; subset не заявляет full PASS.
  Join verifier проверяет source union, keys/commands/контекст и повторно разбирает
  сырые logs; его 12 synthetic cases и независимое read-only review PASS/ACCEPT.
  Actual финальное объединение ещё не выполнено. Root отвечает за config pins
  и полный список внешних immutable inputs, включая exact f548 fixture.
- B3: focused 67/67, boundaries 92, syntax и final declared-consumers parity
  PASS. Исходные failures и их причины сохранены; transient SHA ранних test
  revisions не фиксировались и не выдаются за финальное evidence. Coordinator
  и независимый архитектор сверили все семь final SHA. C остаётся отдельным
  доказательством полного affected union и product/transport связности.
- B2: actual package fixtures покрывают base/first dynamic/last module и
  admission, engine/order/excluded; profile/capability/registry flag отдельно
  проверены на pure preimage. Их не выдаём за actual-build proof. Source SHA
  четырёх файлов сверены; сохранён исправленный auxiliary selector error при
  подаче вне-Core docs path (не product/test FAIL).
- B1: pure/parity/bootstrap 16, client-entry 13, client-launcher 21,
  standalone-installer 8 PASS. Координатор сверил все 15 source SHA и скопированные
  evidence hashes. Большие baseline source/package blobs оставлены в task TEMP;
  portable manifests/role diff и исходный unsafe marker/stdout сохранены.
- Независимый B1 review привязан к финальным hashes; после него source не менялся.
  Исходные fixture/auxiliary failures сохранены с пределами provenance, не
  переписаны как PASS. Raw stdout/stderr имеют только локальное whitespace exception.
- B0 — source argument и независимый contract review, не test/live PASS.
  Описаны positive/negative parity, corrupt/missing helper, wrong root,
  candidate non-execution и version/profile compatibility fixtures для B1/B3.
- A3 exact source hashes сверены. Полные команды/exit/stdout SHA и исходный
  failed core run сохранены; никакого переноса этого FAIL в PASS нет. Whitespace
  исключён только для raw failed stdout локальным .gitattributes, source проверен.
- A2: lifecycle 37, panel-start-over 11, start-over-channel 29,
  reconnect 69 PASS. Два изменённых source/test SHA сверены координатором;
  commands/exit codes/stdout hashes сохранены. Новый live proof не заявляется.
- A1 evidence скопировано с SHA, source hashes четырёх changed JS совпали;
  полный stdout успешных и неуспешных попыток сохранён. Новых live действий нет.
- Failed-run raw stdout содержит отступы на пустых строках; они сохраняются
  побайтно. Локальный .gitattributes исключает только whitespace-проверку этого
  stdout, не source/tests. Source и остальной staged diff проверяются штатно.
- Source diff к снимку внешнего аудита пуст до правки этих документов.
- Проверены полные ключевые execution/recovery functions и потребители helpers.
- Чужие исходные dirty файлы исключены из области записи.
- Новых product tests/build/install/native/browser операций в этом проходе нет.
- После передачи независимый review обоих документов завершён; A1 уточнён
  для двух нижних close-путей. Source/test аргументы ограничены их семантикой;
  Windows signal shutdown сценарий не воспроизводился.
- Принимающий чат проверил относительные ссылки всех трёх документов и
  сохранность product source: diff core4/products к target пуст. SHA двух
  исходных dirty файлов совпали. Документальный staged diff проверен отдельно;
  product tests и live действия для этой финализации не назначались.
