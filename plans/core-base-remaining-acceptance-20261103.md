# Остаточная приёмка базы Core — 3 ноября 2026

**Последующий этап:** по отдельному поручению подготовлен
[актуальный release-manifest](core-release-manifest-20261103.md) всех 71 Core
checks: 31 exact-key reuse, 2 byte-command-bound reuse и 38 current-unverified.
Прежние 27 deferred этого документа входят в более полный remaining-список.
Titles/Slideshow остаются на паузе; команды manifest не запускались.
Ниже сохранены исходный scope и результаты завершённой сверки.

## Цель и границы

Поручение пользователя: выполнить рекомендацию сверить оставшиеся пробелы
приёмки базы и выделить действительно необходимые проверки перед возвращением
к продуктам. Исходный HEAD `5f99093534fbe130429a154c97626719b5e2c613`, ветка
`AE-Agent-Core-4.0.1`; рабочее дерево перед сверкой чистое.

Основания: [принятая матрица B7](../docs/core-base-b7-configured-matrix-20261103.md),
[B6 source evidence](../docs/evidence/core-base-b6-probe-source-20261103.json),
[native B6](../docs/core-base-b6-native-recovery-20261103.md),
[завершённый maintenance](core-codex-mcp-maintenance-20261103.md) и
[облачный intake](core-cloud-intake-20261103.md).
Исторические PID/session/transaction IDs остаются provenance, без новой authority.

Root — единственный writer. Для содержательной сверки dependencies/evidence
выбран `ae_implementer` по `ae-task-routing`: ограниченное чтение исходников и
evidence, без live AE/CEP/MCP/UI; configured роль не объявляется runtime metadata.
Titles/Slideshow остаются на паузе. Полный release и работа второй машины
не входят в эту сверку.

## Progress

- Сверка завершена; решения, exact keys и remaining сохранены в отдельном
  evidence. Исполняемые source/runtime файлы и установленная среда не менялись.
- Установлено: B1–B7 приняты в своих документированных пределах. Ожидающего
  ремонта Core/MCP/Codex нет; старые install/reset/readoption не повторяются.
- Все 15 evidence keys принятого B6 пересчитаны штатным `selectChecks` без
  `--run` и совпали с текущими bytes. Это применимость прежнего PASS, не новый
  прогон 330 cases. Runtime/Core/CEP/module/config исходники после B6 не менялись;
  добавлены только автономные package-location checker/test.
- B6 selector по-прежнему выдаёт 19 `current-closure-unverified` integrations.
  Ещё восемь остаются из B3 вне этого списка: всего 27 известных source
  integrations без подтверждённого current PASS в просмотренном `docs/evidence`.
  Это не полный поиск внешних/ignored evidence и не 27 необходимых native tests.
- Обнаружен конкретный пробел release-manifest: `core4/package.json`
  `check:release` перечисляет шесть test entry files; команды 55 из 71 checks
  карты указывают на другие entry files. Это статическая сверка маршрутов,
  без утверждения о результате тестов или полном динамическом coverage.

## Реестр решений по пробелам

| Область | Что установлено | Необходимое действие |
| --- | --- | --- |
| 15 принятых B6 source checks | Current keys exact; B7/native checkpoints не меняли эти исходники | Переиспользовать exact evidence; не повторять suites только из-за этого документа |
| Доставка mutation, потеря owner, поздний callback, UNKNOWN, новый reset/baseline | Native B6 и configured B7 закрывают выбранный сценарий; B7 не является новым mutation proof | Не повторять fault/reset; сохранённые границы остаются в силе |
| Прерывание самого сброса | Current component fault proof есть; отдельного native finisher-crash наблюдения нет | Поведение обязательно, но дополнительный native эксперимент не требуется для уже принятой bounded базы |
| Deferred integrations | Отдельная текущая closure ещё не получила PASS; исторический интеграционный тест не заменяет current key | Выделить адресную проверку при затронутом контракте; до full release закрыть применимые closures либо явно ограничить заявление о готовности |
| Полная release-проверка | Имеющаяся строка `check:release` не перечисляет commands всех checks карты | Перед финальной приёмкой составить полный manifest: выбранные commands, exact reuse, OS/host ограничения, remaining. Один выход 0 старой команды не является полной приёмкой текущей карты |
| Idle SLA, packet capture, transition SLA | B7 не измерял глобальную тишину всех клиентов; B6 не делал packet capture и не сохранил один transition RPC error | Не вводить эти гарантии. Новые эксперименты нужны при отдельном требовании либо воспроизведённом дефекте |
| Windows пункты исторического cloud-аудита | Intake подтверждает собственные tools на Windows; B6 даёт настоящий host probe/native recovery; это разные scopes | Не повторять B6 по старому Linux checklist. Не считать все Windows-only ветки автоматически проверенными |
| Переносимость и продукты | P1–P8 требуют двух реальных машин; Titles/Slideshow имеют отдельную паузу | Сохранить отдельными этапами, не добавлять к текущей базовой сверке |

## Точный B6 deferred-список

Текущий selector использует тот же список `changed` из B6 evidence. Это не
утверждение, что все 19 проверок надо запускать для этого doc-only diff.

- `start-over-runtime`, `start-over-operator`;
- `stopped-host-readoption-operator`, `stopped-update-operator`, `stopped-update`;
- `legacy-owner-migration`, `maintenance-finish-operator`, `maintenance-operator`;
- `owner-installation`, `owner-runtime`, `native-read-capture`;
- `zero-dispatch-recovery`, `human-window`, `installable-runtime`;
- `lifecycle-simulation`, `native-read-recovery`, `installed-composition`;
- `exact-f548-transition`, `standalone-installer`.

У 18 checks изменённая dependency — `windows-reservation-provider.js` внутри
широкой `runtime/` closure. У `lifecycle-simulation` — четыре B6 test files
в широкой `test/` closure. Deferred не означает FAIL и не означает доказанную
семантическую независимость; менять карту ради исчезновения списка не требуется.

Исходный B3b3 содержит ещё 16 deferred: `windows-cim-probe` впоследствии закрыт
точным B6 key; из оставшихся 15 семь совпадают с B6-списком. Восемь дополнительных:
`manual-current-target`, `audit-repairs`, `core-control`, `core-admission`,
`worker-isolation`, `protocol-codec`, `workflow-recovery`, `cep-transport`.
Их current keys и просмотренные recorded matches сохранены в evidence.
Добавленные package-location files также влияют на keys тех широких closures,
которые включают весь `tools/` или `test/`; focused Windows PASS этих tools не
заменяет PASS соответствующих integrations.

## Первый адресный source-кандидат

Если следующий инженерный блок усилит или изменит reset, первая полезная
проверка — `start-over-runtime`, а не новый native fault:

```powershell
# cwd: C:/Users/Ant/Documents/Codex/AE_agent_core/core4
node --test --test-name-pattern=start-over-runtime test/start-over-runtime.test.js
```

Это штатная команда карты; здесь она не запускалась. Три named cases включают
idle reset, diagnostic producer loss/late completion и реальную смерть Node
после receiver rename. Исторический B3 key `80c66f81…` не совпадает с текущим
`05154b43…`: после B3 в этой closure изменились только `attachment-owner.js`,
`client-stdio.js` и `windows-reservation-provider.js`.

Fixture использует собственный `%TEMP%/core4-reset-runtime-*`, свой installation
ID/IPC, synthetic AE inventory; preload перенаправляет logical3457 на ephemeral0.
Настоящие production state, listener3457 и AE не затрагиваются; настоящими
остаются Node process/birth/death/CIM/files. Timeout каждого case600s,
observation240s, IPC120s; это не быстрый smoke и не native proof.
PASS этой команды закроет её current source closure, а не остальные26 или
финальную приёмку. Для текущей сверки нового запуска не требуется.

## Минимальный контракт возможного native finisher-crash

Дополнительный эксперимент оправдан при отдельном требовании installed proof
прерывания сброса или дефекте этого пути. Сейчас он не выполняется.

1. Свежий preflight и точная проверка текущего target/owner/birth/boot; защитить
   работу, использовать собственные тестовые AEP/state. Старые settled IDs не
   участвуют. Root остаётся единственным live controller.
2. Создать один новый reset intent. Кандидат точки fault — после точного rename
   receiver в архив новой transaction, до публикации завершённого reset/session
   (`start-over-archive.js:149`). Перед остановкой доказать durable prefix и
   какой процесс владеет finisher.
   Не использовать старый PID и не убивать процессы по имени.
3. Возобновлять тот же original transaction штатным inspect/finisher путём,
   без второй отправки reset и без replay прежних AE commands.
4. PASS: история/UNKNOWN сохранены, прежняя session не принимается, admission
   закрыт до завершения barrier/архива и нового baseline; после завершения один
   новый session/baseline/read/release. Проверить partial/double archive и replay0.
5. Если durable prefix или фактическое прекращение прежнего исполнения не
   подтверждены, не объявлять PASS и не открывать новую работу. Не расширять
   эксперимент до новой mutation, packet capture или других fault points.

У неизменённого installed runtime deterministic pause hook не подтверждён.
TEMP hook `start-over-runtime-preload.js:35–36` не переносится в live как обход.
Polling UI/status не доказывает точную фазу. Если reset успел завершиться,
fault остаётся ненаблюдённым; это не PASS и не разрешение повторить тот же ID.

## Decision Log

- Текущий пользовательский scope — сверка и выбор необходимых проверок.
  Исторический общий список `full release/deferred/portability` заменён здесь
  конкретными границами, а не автоматически исполняемой очередью всех suites.
- Native finisher-crash не превращается в новый blocker принятой базы.
  Source/TEMP, historical installed и current installed evidence не смешиваются.
- Полная release-проверка остаётся отдельным действием по
  [контракту переносимости](../docs/portability.md); перенос на другую машину,
  browser review, новые зависимости, push/PR не выполняются.

## Validation

Результаты сверки, current keys, deferred provenance и статическая сверка
release entry files фиксируются в
[evidence](../docs/evidence/core-base-remaining-acceptance-20261103.json).
`releaseCertified=false`; эта запись не даёт live authority.

- 15/15 keys и 5/5 B6 source file hashes exact; recorded PASS применяется
  только к совпавшим closures. 27 remaining integrations не переименованы в PASS.
- Выполнены только чтение/хеширование/selector без `--run` и документальные
  проверки. Tests, live AE/CEP/MCP/UI calls, process inventory/termination,
  install/config writes, mutation/save/reset/restart, network/Argon/push/PR — 0.
- UTF-8 шести файлов, все163 локальные Markdown ссылки пяти документов,
  JSON/invariants, неизменность исходных tracked bytes вне четырёх намеренных
  documentation pointers и `git diff --check` — PASS. Живой runtime сейчас
  не опрашивался. Staged whitespace также PASS.

## Продолжение

Перед заявлением о полной готовности выпуска нужен актуальный release-manifest
с явным покрытием текущей карты checks и адресным закрытием применимых deferred
closures. Native finisher-crash, новый idle SLA и повтор B1–B7 не назначаются
обязательными предварительными действиями возвращения к продуктам.
Эта сверка завершает текущее поручение; оставшиеся пункты имеют указанные
условия запуска и не являются автоматически запущенной очередью.
