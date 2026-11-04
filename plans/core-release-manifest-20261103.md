# Release-manifest Core — 3 ноября 2026

**Текущая source-приёмка:** Принято source runs: 31; current fresh checks: 34. Применимое evidence: 65 exact-key + 0 byte-command-bound. Открыто: 6 (без hold: 4, Titles под паузой: 2). Следующий блок: source-candidate-26. [Ход выполнения](core-release-execution-20261103.md).

## Цель и состав

По прямому поручению пользователя сформирован актуальный план приёмки: какие
проверки нужны, какие результаты можно переиспользовать и что остаётся открытым.
Исходный commit `2a3aa82`, ветка `AE-Agent-Core-4.0.1`. Имя ветки не меняет
версию runtime: `core4/package.json` по-прежнему объявляет `4.0.0`.

Машиночитаемый состав — [JSON manifest](../docs/core-release-manifest-20261103.json).
Он содержит каждую из 71 проверок `validation-map.json` ровно один раз, её
штатную command array, cwd, текущий evidence key, тип проверки, принятое
evidence, решение о reuse и отдельное условие будущего запуска. Это план,
а не новый результат выполнения и не автоматически исполняемая очередь.

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
| `start-over-driver` | component | reuse: записанный exact key | не повторять без drift |
| `start-over-panel-control` | component | reuse: записанный exact key | не повторять без drift |
| `panel-start-over` | component | reuse: записанный exact key | не повторять без drift |
| `start-over-runtime` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `start-over-operator` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `work-session-owner` | component | reuse: записанный exact key | не повторять без drift |
| `work-session` | component | reuse: записанный exact key | не повторять без drift |
| `start-over-channel` | component | reuse: записанный exact key | не повторять без drift |
| `start-over-finisher` | component | reuse: записанный exact key | не повторять без drift |
| `start-over-state` | component | reuse: записанный exact key | не повторять без drift |
| `start-over-barrier` | component | reuse: записанный exact key | не повторять без drift |
| `start-over-inspection` | component | reuse: записанный exact key | не повторять без drift |
| `start-over-process` | component | reuse: записанный exact key | не повторять без drift |
| `stopped-host-readoption-operator` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `stopped-host-readoption` | component | reuse: записанный exact key | не повторять без drift |
| `readoption-core` | component | reuse: записанный exact key | не повторять без drift |
| `readoption-recovery` | component | reuse: записанный exact key | не повторять без drift |
| `readoption-enable` | component | reuse: записанный exact key | не повторять без drift |
| `readoption-probe` | component | reuse: записанный exact key | не повторять без drift |
| `stopped-update-operator` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `stopped-update` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `legacy-owner-migration` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `windows-retained-process` | component | fresh source PASS → exact reuse | не повторять без drift |
| `stopped-certification` | component | reuse: записанный exact key | не повторять без drift |
| `maintenance-finish` | component | reuse: записанный exact key | не повторять без drift |
| `maintenance-finish-operator` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `owner-maintenance` | component | reuse: записанный exact key | не повторять без drift |
| `maintenance-operator` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `windows-owner-process` | component | fresh source PASS → exact reuse | не повторять без drift |
| `owner-lifecycle` | component | reuse: записанный exact key | не повторять без drift |
| `owner-lifecycle-faults` | component | reuse: записанный exact key | не повторять без drift |
| `owner-marker-publication` | component | reuse: записанный exact key | не повторять без drift |
| `client-launcher` | component | reuse: записанный exact key | не повторять без drift |
| `recovery-inspection` | component | reuse: записанный exact key | не повторять без drift |
| `owner-installation` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `controller-transfer` | component | reuse: записанный exact key | не повторять без drift |
| `client-entry` | component | reuse: записанный exact key | не повторять без drift |
| `owner-runtime` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `client-ipc` | component | fresh source PASS → exact reuse | не повторять без drift |
| `owner-attachments` | component | reuse: записанный exact key | не повторять без drift |
| `owner-ipc-process` | integration | reuse: записанный exact key | не повторять без drift |
| `controller-lease` | component | fresh source PASS → exact reuse | не повторять без drift |
| `panel-reconnect` | component | reuse: записанный exact key | не повторять без drift |
| `endpoint-observation` | component | fresh source PASS → exact reuse | не повторять без drift |
| `native-read-capture` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `windows-cim-probe` | integration | reuse: записанный exact key | не повторять без drift |
| `zero-dispatch-recovery` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `human-window` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `manual-runtime` | integration | reuse: записанный exact key | не повторять без drift |
| `installable-runtime` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `manual-current-target` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `audit-repairs` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `core-control` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `core-admission` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `worker-isolation` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `protocol-codec` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `workflow-recovery` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `photo-owner` | component | fresh source PASS → exact reuse | не повторять без drift |
| `titles-owner` | component | нужен current result | Titles: held |
| `photo-executor-contract` | component | fresh source PASS → exact reuse | не повторять без drift |
| `titles-executor-contract` | component | нужен current result | Titles: held |
| `catalog-discovery` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `validation-routing` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `artifact-boundaries` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `documentation` | component | fresh source PASS → exact reuse | не повторять без drift |
| `cep-transport` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `lifecycle-simulation` | integration | fresh source PASS → exact reuse | не повторять без drift |
| `native-read-recovery` | integration | нужен current result | адресно до full release |
| `installed-composition` | integration | нужен current result | адресно до full release |
| `exact-f548-transition` | integration | нужен current result | адресно до full release |
| `standalone-installer` | integration | нужен current result | адресно до full release |

## Продолжение

Подготовка manifest завершена; последующее прямое поручение разрешило адресную source-приёмку. При следующей подготовке выпуска сначала
проверить его source/evidence fingerprint; затем выбирать только необходимые
адресные source checks с учётом reuse и пауз. Один manifest не объявляет выпуск
принятым и не запускает перечисленные проверки.
