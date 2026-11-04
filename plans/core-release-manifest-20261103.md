# Release-manifest Core — 3 ноября 2026

**Текущая source-приёмка после MSI-дельты, 4 ноября:** 48covered =36unchanged exact reuse +10desktop named PASS +1MSI named PASS +1desktop documentation PASS;23open =21changed deferred integrations +2Titles held. Исторические69/71 на77a860e и35blocks/36commands сохранены как прежняя фаза, без переобъявления current. [Desktop evidence](../docs/evidence/core-portability-quoted-config-20261104.json). Full release не заявляется.

## Цель и состав

По прямому поручению пользователя сформирован актуальный план приёмки: какие
проверки нужны, какие результаты можно переиспользовать и что остаётся открытым.
Исходный commit `2a3aa82`, ветка `AE-Agent-Core-4.0.1`. Имя ветки не меняет
версию runtime: `core4/package.json` по-прежнему объявляет `4.0.0`.

Машиночитаемый состав — [JSON manifest](../docs/core-release-manifest-20261103.json).
Он содержит каждую из 71 проверок `validation-map.json` ровно один раз, её
штатную command array, cwd, текущий evidence key, тип проверки, принятое
evidence, решение о reuse и отдельное условие будущего запуска. После следующего
поручения пользователя manifest дополнен результатами source-приёмки и историей
устаревших ключей. Сам manifest не разрешает автоматические live операции.

Цель сопоставления — текущая manual/owner-композиция Core. Её исходный состав
включает `photo-placeholder`, `titles` и `titles-current-target`; исторический
установленный package — `cdf7338f…`. Source/TEMP evidence не заменяет native
приёмку, а прошлые owner/session/PID не дают полномочий сейчас. Живое состояние
установки при подготовке manifest не опрашивалось.

## Исходный inventory при подготовке manifest

Все 71 checks имеют решение: **31 exact-key reuse + 2 byte-command-bound reuse + 38 current-unverified**. Из 38 открытых — 36 без продуктового hold и две dedicated Titles под паузой. Ни одна команда сейчас не запускалась. В JSON 29 сгруппированных source-кандидатов для будущего выбора; это не утверждение, что их нужно запускать немедленно. Ранее найденные 27 deferred — подмножество этого полного inventory.

## Пауза продуктов

Titles и Slideshow остаются на паузе: разработки, новых product tests,
native product acceptance и операций с пользовательскими AEP здесь нет.
Dedicated Core-проверки `titles-owner` и `titles-executor-contract` остаются
необходимыми для полной приёмки manual-композиции, если этот модуль поставляется,
но их будущий запуск имеет отдельный статус `held-by-product-pause`.

Shared Core-проверки, включая `manual-runtime`, `installable-runtime`,
`manual-current-target`, recovery/admission/transport, не исключаются по наличию
Titles в dependencies. Они проверяют поставляемый контракт Core; это не
разрешение возобновить продуктовую разработку или native mutation. Для будущего
узкого запуска сохраняются его собственные fixture/host gates.

Самостоятельный `products/titles/` и будущий Slideshow учтены отдельными
продуктовыми критериями вне 71 Core checks. `photo-placeholder` не объявляется
приёмкой Slideshow. Полная приёмка выпуска с продуктами остаётся открытой.

## Правила reuse

1. `reuse-exact-key`: имеется принятый PASS именно named check, текущий ключ
   штатного selector совпал. Ключ включает check ID, command, все dependency
   bytes и projections. Промежуточный, cancelled, timeout или audit-only record
   не становится самостоятельным принятым результатом.
2. `reuse-byte-command-bound`: допустим отдельно от сохранённого exact key.
   Нужны принятый успешный named batch, проверенная команда/selector, полный
   снимок именно его dependencies и projections, совпадение текущих bytes.
   Manifest явно отмечает, что ключ reconstructed, а не записан прежним run.
3. `needs-current-evidence`: подходящего current PASS в просмотренном
   structured evidence нет. Это не FAIL. Для полной source-приёмки нужно новое
   адресное выполнение либо восстановление достаточной доказательной привязки.
   Старые несовпадающие ключи остаются provenance.

Среда и границы evidence сохраняются. Windows PASS не подтверждает другую ОС;
SKIP не становится PASS; VM/TEMP не становится native AE. Named checks могут
делить одни test cases, поэтому их количества и cases не суммируются как
глобальное число уникальных тестов. Групповые 9 PASS облачного intake — это
два check ID, не девять проверок карты.

## Что нужно до полной приёмки

- Закрыть `needs-current-evidence` в выбранном release scope. Manifest хранит
  точные команды; данные о запуске и evidence должны быть привязаны к текущему
  ключу и результатам, включая skips. Пауза dedicated Titles остаётся отдельным
  ограничением и не исчезает от наличия команды в JSON.
- Сверить выбранный package/distribution hash и точную runtime/CEP closure.
  Прежние B6 package/install receipts применимы в своей неизменённой области;
  новая установка и повтор settled IDs для этого документа не нужны.
- Перед следующей live операцией получить свежий preflight текущей установки,
  AE/CEP/owner и точной цели. Исторические B6/B7 native результаты сохраняются
  для своих package/scenario, без заявления о нынешнем состоянии процессов.
- Для полной продуктовой/переносимой готовности отдельно закрыть paused native
  product acceptance и [P1–P8 на двух машинах](../docs/portability.md).

Не требуется заново исполнять принятую матрицу B1–B7 ради manifest, вводить
global-idle SLA или packet capture. Native прерывание finisher остаётся
дополнительным наблюдением; если нужна усиленная source-проверка reset, первый
кандидат — `start-over-runtime` с собственной TEMP-изоляцией. Это не команда
для немедленного запуска.

Legacy `npm run check:release` перечисляет шесть test entry files. У команд
55 из 71 зарегистрированных проверок другие entry files. Это статическое
сопоставление, не измерение динамического coverage и не 55 FAIL. Существующая
команда также включает dedicated Titles suite; её нельзя использовать как
единственное доказательство полноты или как обход продуктовой паузы.
Runtime, `package.json` и карта маршрутизации этим manifest не меняются.

## Дополнительные проверки вне карты

Package-location, cloud-checks-audit и cloud-result-preflight имеют собственные
Windows результаты из [intake](core-cloud-intake-20261103.md): 3 PASS,
15 PASS и 25 PASS + 1 POSIX-only SKIP соответственно. Все 33 сохранённых file
hashes совпали; source/tool bytes после принятого `5f99093` не менялись.
Их reuse не увеличивает число закрытых Core checks. Пропуск POSIX chmod остаётся
открытой платформенной границей; preflight example с `integrationAllowed=false`
не является разрешением интеграции.

## Progress

- Получен полный inventory 71 Core checks штатным selector без `--run`.
- Сопоставлены принятые structured source results; reuse и remaining приведены
  в реестре ниже и в JSON, с исходными JSON pointers и hashes.
- Отдельно сохранены package/native/portability/product критерии; source PASS
  не закрывает их автоматически.

## Decision Log

- Root — единственный writer. `ae_implementer` сверяет current keys/evidence;
  `ae_reviewer` выполняет независимое ограниченное read-only review. Маршрут —
  `ae-task-routing`; effective model metadata без наблюдения не утверждаются.
- Это подготовка manifest, без source test runs, live AE/CEP/MCP/UI, process
  operations, build/install/config changes, network/Argon, dependency/push/PR.
- Полнота inventory, применимость evidence, продуктовая пауза и будущий запуск
  отражаются раздельно. `releaseCertified=false`.

## Validation при подготовке manifest

Валидация и независимое review — PASS:

- 71/71 уникальных ID, команды и current keys совпали со штатным selector;
  31 accepted и 122 historical JSON pointers разрешились с правильными ID/keys.
- Для двух byte-command групп проверены принятые commands/selector и все
  73 dependency files каждой; всего сверены 214 source и 33 supplemental hashes.
  Общие 9 PASS не удваиваются.
- 36 открытых checks без hold ровно один раз покрыты 29 source batch candidates;
  две dedicated Titles held, source/native/product/portability gates разделены.
- UTF-8 восьми файлов, 173 локальные Markdown ссылки, JSON/pause/gate invariants,
  отсутствие source/runtime diff и whitespace — PASS. Staged whitespace также
  PASS.

[Отчёт валидации](../docs/evidence/core-release-manifest-20261103-validation.json).
Source suites и live операции не запускались; `releaseCertified=false`.

## Реестр Core checks

Полные ключи, команды и ссылки на evidence находятся в JSON. Решение о reuse
не снимает отдельную паузу или требование fresh preflight перед live работой.

| Проверка | Тип | Evidence | Пауза / будущее действие |
| --- | --- | --- | --- |
| `start-over-driver` | component | unchanged exact-key reuse | повтор только при drift |
| `start-over-panel-control` | component | unchanged exact-key reuse | повтор только при drift |
| `panel-start-over` | component | unchanged exact-key reuse | повтор только при drift |
| `start-over-runtime` | integration | current evidence open | deferred; не запускался в V2 scope |
| `start-over-operator` | integration | current evidence open | deferred; не запускался в V2 scope |
| `work-session-owner` | component | unchanged exact-key reuse | повтор только при drift |
| `work-session` | component | unchanged exact-key reuse | повтор только при drift |
| `start-over-channel` | component | unchanged exact-key reuse | повтор только при drift |
| `start-over-finisher` | component | unchanged exact-key reuse | повтор только при drift |
| `start-over-state` | component | unchanged exact-key reuse | повтор только при drift |
| `start-over-barrier` | component | unchanged exact-key reuse | повтор только при drift |
| `start-over-inspection` | component | unchanged exact-key reuse | повтор только при drift |
| `start-over-process` | component | unchanged exact-key reuse | повтор только при drift |
| `stopped-host-readoption-operator` | integration | current evidence open | deferred; не запускался в V2 scope |
| `stopped-host-readoption` | component | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `readoption-core` | component | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `readoption-recovery` | component | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `readoption-enable` | component | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `readoption-probe` | component | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `stopped-update-operator` | integration | current evidence open | deferred; не запускался в V2 scope |
| `stopped-update` | integration | current evidence open | deferred; не запускался в V2 scope |
| `legacy-owner-migration` | integration | current evidence open | deferred; не запускался в V2 scope |
| `windows-retained-process` | component | unchanged exact-key reuse | повтор только при drift |
| `stopped-certification` | component | unchanged exact-key reuse | повтор только при drift |
| `maintenance-finish` | component | unchanged exact-key reuse | повтор только при drift |
| `maintenance-finish-operator` | integration | current evidence open | deferred; не запускался в V2 scope |
| `owner-maintenance` | component | unchanged exact-key reuse | повтор только при drift |
| `maintenance-operator` | integration | current evidence open | deferred; не запускался в V2 scope |
| `windows-owner-process` | component | unchanged exact-key reuse | повтор только при drift |
| `owner-lifecycle` | component | unchanged exact-key reuse | повтор только при drift |
| `owner-lifecycle-faults` | component | unchanged exact-key reuse | повтор только при drift |
| `owner-marker-publication` | component | unchanged exact-key reuse | повтор только при drift |
| `client-launcher` | component | unchanged exact-key reuse | повтор только при drift |
| `recovery-inspection` | component | unchanged exact-key reuse | повтор только при drift |
| `owner-installation` | integration | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `controller-transfer` | component | unchanged exact-key reuse | повтор только при drift |
| `client-entry` | component | unchanged exact-key reuse | повтор только при drift |
| `owner-runtime` | integration | current evidence open | deferred; не запускался в V2 scope |
| `client-ipc` | component | unchanged exact-key reuse | повтор только при drift |
| `owner-attachments` | component | unchanged exact-key reuse | повтор только при drift |
| `owner-ipc-process` | integration | unchanged exact-key reuse | повтор только при drift |
| `controller-lease` | component | unchanged exact-key reuse | повтор только при drift |
| `panel-reconnect` | component | unchanged exact-key reuse | повтор только при drift |
| `endpoint-observation` | component | unchanged exact-key reuse | повтор только при drift |
| `native-read-capture` | integration | current evidence open | deferred; не запускался в V2 scope |
| `windows-cim-probe` | integration | unchanged exact-key reuse | повтор только при drift |
| `zero-dispatch-recovery` | integration | current evidence open | deferred; не запускался в V2 scope |
| `human-window` | integration | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `manual-runtime` | integration | unchanged exact-key reuse | повтор только при drift |
| `installable-runtime` | integration | MSI CLI delta full named PASS → exact reuse | повтор только при drift |
| `manual-current-target` | integration | unchanged exact-key reuse | повтор только при drift |
| `audit-repairs` | integration | unchanged exact-key reuse | повтор только при drift |
| `core-control` | integration | current evidence open | deferred; не запускался в V2 scope |
| `core-admission` | integration | current evidence open | deferred; не запускался в V2 scope |
| `worker-isolation` | integration | current evidence open | deferred; не запускался в V2 scope |
| `protocol-codec` | integration | current evidence open | deferred; не запускался в V2 scope |
| `workflow-recovery` | integration | current evidence open | deferred; не запускался в V2 scope |
| `photo-owner` | component | unchanged exact-key reuse | повтор только при drift |
| `titles-owner` | component | current evidence open | Titles: held |
| `photo-executor-contract` | component | unchanged exact-key reuse | повтор только при drift |
| `titles-executor-contract` | component | current evidence open | Titles: held |
| `catalog-discovery` | integration | unchanged exact-key reuse | повтор только при drift |
| `validation-routing` | integration | current evidence open | deferred; не запускался в V2 scope |
| `artifact-boundaries` | integration | current evidence open | deferred; не запускался в V2 scope |
| `documentation` | component | desktop README full named PASS → exact reuse | повтор только при drift |
| `cep-transport` | integration | current evidence open | deferred; не запускался в V2 scope |
| `lifecycle-simulation` | integration | current evidence open | deferred; не запускался в V2 scope |
| `native-read-recovery` | integration | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `installed-composition` | integration | desktop V2 full named PASS → exact reuse | повтор только при drift |
| `exact-f548-transition` | integration | current evidence open | deferred; не запускался в V2 scope |
| `standalone-installer` | integration | desktop V2 full named PASS → exact reuse | повтор только при drift |

## Продолжение

Подготовка manifest завершена; последующее прямое поручение разрешило адресную source-приёмку. При следующей подготовке выпуска сначала
проверить его source/evidence fingerprint; затем выбирать только необходимые
адресные source checks с учётом reuse и пауз. Один manifest не объявляет выпуск
принятым и не запускает перечисленные проверки.

## V2 desktop portability source admission — 4 ноября

### Progress

11canonical commands выполнены серийно на DESKTOP-32974QF. Full source phase35blocks/36commands не повторялась. Current keys71 exact,32changed/39unchanged,48covered/23open. [Receipt](core-portability-quoted-config-20261104.md).

### Decision Log

Прежние accepted refs32changed checks сохранены как superseded. Новые11currentPASS имеют точные JSONpointer/command/key и переносимые original stdout SHA. 21changed integrations remain open; Titles held. Manual-runtime — reuse, не fresh.

### Validation

Snapshot215 current, accepted supplemental hashes отделены от current observation. Runtime packagecdf/80 unchanged; standalone5d5d1aa4…/98 verified. Actual-config dry-run/tomllib PASS, protected bytes unchanged, actual install0. Исторический FAIL сохранён; P1–P8/native/configured/full release открыты.

## MSI: обратная инженерная дельта — 4 ноября

### Progress

Desktop commit `f857f2d` принят exact-hash-reviewed fast-forward. Один CLI case расширен quoted legacy/env и local paths; полный `installable-runtime`46/46PASS. Сборки cdf/80 и standalone5d5d1aa4/98 совпали с desktop; foreign-CWD dry-run PASS. Свежая configured native inspection собственного AEP PASS, lease освобождён. [Evidence](../docs/evidence/core-portability-msi-roundtrip-20261104.json).

### Decision Log

Runtime unchanged: MSI reinstall0. Изменились только `installable-runtime` и уже открытый `lifecycle-simulation`; 10desktop и37прежних exact checks переиспользованы. Native observation не даёт mutation authority.

### Validation

71current keys, snapshot215 и supplemental33 сверены; current48/open23. Desktop install/native и итоговый round-trip ещё открыты.

## Desktop: initial installation — 4 ноября

### Progress

MSI commit `0b78aac` принят fast-forward. Адресный CLIcase1 и полный documentation1 PASS; README приведён к bounded quoted TOML контракту. Package cdf/80 и standalone5d5/98 verified. Initial CLI apply выполнен ровно один раз; новый desktop installationId `installation-e0e81ad5-6bce-451c-8cfd-8e2ec14f3700`. Runtime80/CEP7 и конфигурация прочитаны обратно. Repeat foreign-CWD dry-run сохранил точные bytes всех98 наблюдавшихся файлов. [Evidence](../docs/evidence/core-portability-desktop-installed-20261104.json).

### Decision Log

Первый observer ошибочно ожидал отсутствующее поле descriptor.runtimeModel. Исходный diagnostic сохранён; исправлено только read-only наблюдение через runtimeBinding и transaction clientBinding. Установка не повторялась. Legacy/global config сохранены, ручных config edits0. Отсутствие Core4 в меню уже запущенного AE пока не объявляется дефектом версии.

### Validation

71 current keys, только documentation изменён; snapshot215, supplemental33. Current48/open23 сохранены:36 прежних exact reuse +10 desktop +1 MSI +1 documentation. CLIcase1 не заменяет MSI full46. Configured/native proof ещё не получен; следующий шаг — targeted MCP refresh и initial CEP discovery, затем один typed read/release. P1–P8/full release открыты, Titles/Slideshow на паузе, cloud исключён.

## Desktop: CEP discovery и effective configuration — 4 ноября

### Progress

После защиты наблюдавшегося пустого Untitled Project штатно завершён exact AE612/birth13:03:13Z и выполнен один normal launch. Новый PID28156/birth13:23:21.533736Z, та же26.3.0.87. Панель появилась в Extensions и открыта; статус «Ожидание Core для проверки сеанса». [Evidence](../docs/evidence/core-portability-desktop-cep-discovery-20261104.json).

### Decision Log

Отсутствие панели до restart не является доказательством бага AE. Disk-cache informational warning закрыт, настройки не менялись. Начать заново/reset/adoption не нажимались. CLI mcp get/list в точном cwd видит Core4 enabled и правильные paths; global trusted binding совпадает с cwd точно, включая регистр. Это config proof, не configured runtime proof. Global config/trust/security без изменений.

### Validation

Core4 tools в свежем inventory отсутствуют; UI MCPs показывает4 сервера безCore4 и не предлагает адресный reload. Существующий app-server7060 без --listen, поддерживаемый endpoint reload доступными tools не опубликован; cwd app-server не наблюдён. Не выполнялись stdin interception, speculative TCP или подменный stdio client. Конкретный blocker — недоступный supported targeted MCP reload/отсутствие Core4 tools в runtime этого чата. Configured/native inspection0; source keys48/23 без изменений. После появления tools нужен fresh status/contract и acquire/connect/one read/release.

## Desktop: адресный service refresh preflight

### Progress

Runtime UUID совпал с единственным active local Codex chat «Найти следы переноса на десктоп». Полный snapshot341 unarchived Codex entries/7pages:1active,340notLoaded. Exact child7060/birth09:29:14.751034Z — parent текущего shell; его parent — main ChatGPT16720/birth09:29:06.024344Z. ProjectId теперь наблюдён, прежнее предположение projectId=null не используется. [Evidence](../docs/evidence/core-portability-desktop-service-refresh-preflight-20261104.json).

### Decision Log

Штатный existing app-server proxy отказал10050 до initialize, requests0. Read-only анализ текущего app.asar обнаружил, что local stdio transport не обещает supportsReconnect; точный runtime wrapper не опубликован. Гарантированный auto-relaunch после внешнего завершения child не доказан. По ограничению поручения child не завершался, main app/AE/owner не затрагивались, sidecar не запускался.

### Validation

State production содержит только origin.json; наших submitted/native commands0, новых UNKNOWN0; это не подмена недоступного core_status. Configured/native proof остаётся открытым именно из-за отсутствия supported reload/restart с доказанным восстановлением текущего клиента. Новых tests/source changes нет,71keys/48covered/23open прежние.

## Desktop: configured native proof PASS — 4 ноября

### Progress

В том же чате появился namespace Core4. Без restart app-server и без смены membership выполнены fresh configured status/contract → acquiregen1 → connect → ровно одна typed project-inspection → немедленный release. Текущий workSession.sessionId=null/legacy принят без reset/adoption. AE26.3x87, реальный пустой несохранённый проект,numItems0. [Evidence](../docs/evidence/core-portability-desktop-configured-native-20261104.json).

### Decision Log

Прежние reload diagnostics сохранены как история; blocker снят фактической публикацией tools, её причина не приписывается нашим действиям. Exact app-server7060/birth прежний. Новый service restart, повтор AE restart и project membership edits не нужны. Lease держался менее0.4сек; token не опубликован. Publisher сначала ожидал2 records без origin; corrected read-only journal proof3records, native command не повторялась.

### Validation

Final owner25516 ready, peer connected, holder=null, pending=null, UNKNOWN/fault/unresolved0. Receiver3records:origin+begin+complete, одна settled inspection; hash chain и commandId проверены. Runtime80/CEP7, descriptor/client/project/global config, legacy/probe сохранены. Панель готова к командам. Authority/continuity=false, mutation/save0. Desktop scoped этап завершён; source48/23, P1–P8/full release и итоговая двухмашинная матрица остаются у координатора.

## Практический перенос принят — 4 ноября

### Progress

[Сводный двухмашинный отчёт](../docs/core-portability-two-host-result-20261104.md) подтверждает реальную source-дельту в обе стороны, local installation/read-back и configured native channels обоих хостов.

### Decision Log

Bounded practical PASS; strict portability gate открыта по literal CEP HTTP Origin(P2) и actual production repeat(P5). P8 report complete не означает полную сертификацию. Runtime/package без новой дельты, источник actual receipts сохранён.

### Validation

Current48/71,21deferred integrations+2Titlesheld open, full release=false. Новый aggregate report не заменяет keyed source evidence и не назначает новые тесты.
