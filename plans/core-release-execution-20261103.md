# Адресная source-приёмка Core — 3 ноября 2026

## Цель и разрешённый scope

Прямое поручение пользователя: начать со `start-over-runtime`, продолжать по
release-manifest, после каждого блока обновлять evidence/manifest. Titles и
Slideshow оставить на паузе. Исходная точка — `f8741ed`.

Очередь состоит из 36 открытых named checks без продуктового hold, сгруппированных
в 29 source batches. Изначальные 31 exact-key и 2 byte-command-bound reuse не
повторяются без drift. Две dedicated Titles проверки сохраняют hold.

Root — единственный tracked writer/reducer/committer. `ae_implementer` выполняет
один переданный source batch в собственных fixtures и пишет ignored log/report;
`ae_reviewer` адресно проверяет изоляцию следующих batches. После каждого результата
root сверяет keys/команду/исходы, обновляет durable evidence и manifest, делает
отдельный commit и только затем передаёт следующий batch. Маршруты skills:
`ae-task-routing`, `ae-mcp-bridge-workflow`. Runtime model metadata не выводятся
из названия роли.

Разрешены TEMP package/install fixtures с synthetic AE observations и собственными
endpoints. Это source/TEMP proof, не native AE. Нет работы с production state,
живыми AE/CEP/MCP/UI, настоящих install/config/service действий, network/Argon,
push/PR и запуска dedicated продуктов. Штатные внутренние test budgets сохраняются;
короткий tool yield не является timeout команды.

## Progress

Подтверждена исходная очередь. Block01 preflight: key `05154b43…` совпал;
own TEMP/random IPC/logical3457→ephemeral0/synthetic AE и exact cleanup проверены.

<!-- EXECUTION_STATUS -->
Принято source runs: 16; current fresh checks: 13. Применимое evidence: 44 exact-key + 0 byte-command-bound. Открыто: 27 (без hold: 25, Titles под паузой: 2). Следующий блок: source-candidate-30.
<!-- /EXECUTION_STATUS -->

<!-- EXECUTION_BLOCKS -->
| Блок | Named checks | Результат / Node summary | Evidence | Коммит |
| --- | --- | --- | --- | --- |
| source-candidate-01 | `start-over-runtime` | PASS: 3 pass / 0 skip | [JSON](../docs/evidence/core-release-block-01-20261103.json) | `6625aed` |
| source-candidate-02 | `start-over-operator` | PASS: 6 pass / 0 skip | [JSON](../docs/evidence/core-release-block-02-20261103.json) | `bb23f1a` |
| source-candidate-03 | `stopped-host-readoption-operator` | PASS: 17 pass / 0 skip | [JSON](../docs/evidence/core-release-block-03-20261103.json) | `0af346d` |
| source-candidate-04 | `stopped-update-operator` | PASS: 4 pass / 0 skip | [JSON](../docs/evidence/core-release-block-04-20261103.json) | `e7b3964` |
| source-candidate-05 | `stopped-update` | PASS: 55 pass / 0 skip | [JSON](../docs/evidence/core-release-block-05-20261103.json) | `0e97571` |
| source-candidate-06 | `legacy-owner-migration` | PASS: 29 pass / 0 skip | [JSON](../docs/evidence/core-release-block-06-20261103.json) | `948b41b` |
| source-candidate-07 | `windows-retained-process` | PASS: 3 pass / 0 skip | [JSON](../docs/evidence/core-release-block-07-20261103.json) | `7622aa7` |
| source-candidate-08 | `maintenance-finish-operator` | PASS: 7 pass / 0 skip | [JSON](../docs/evidence/core-release-block-08-20261103.json) | `44d97d3` |
| source-candidate-09 | `maintenance-operator` | PASS: 8 pass / 0 skip | [JSON](../docs/evidence/core-release-block-09-20261103.json) | `6befbb5` |
| source-candidate-10 | `windows-owner-process` | PASS: 8 pass / 0 skip | [JSON](../docs/evidence/core-release-block-10-20261103.json) | `427c060` |
| source-candidate-11 | `owner-installation` | PASS: 18 pass / 0 skip | [JSON](../docs/evidence/core-release-block-11-20261103.json) | `63c942d` |
| source-candidate-12 | `owner-runtime` | PASS: 23 pass / 0 skip | [JSON](../docs/evidence/core-release-block-12-20261103.json) | `ecc46e5` |
| source-candidate-13 | `client-ipc` | PASS: 27 pass / 0 skip | [JSON](../docs/evidence/core-release-block-13-20261103.json) | `c80dad9` |
| source-candidate-14 | `controller-lease` | PASS: 16 pass / 0 skip | [JSON](../docs/evidence/core-release-block-14-20261103.json) | `2fcca17` |
| source-candidate-15 | `endpoint-observation` | PASS: 15 pass / 0 skip | [JSON](../docs/evidence/core-release-block-15-20261103.json) | `782ae1d` |
| source-candidate-16 | `artifact-boundaries`, `native-read-capture`, `validation-routing`, `documentation` | PASS: 27 pass / 0 skip | [JSON](../docs/evidence/core-release-block-16-20261103.json) | создаётся после проверки |
<!-- /EXECUTION_BLOCKS -->

## Block16: сохранённый FAIL и принятый repair

**Current checkout:** capture-era repair принят полным composite run: 17 capture +
10 Core cases PASS, fail/cancelled/skipped 0. [Evidence](../docs/evidence/core-release-block-16-20261103.json).
Все описанные ниже failed/cancelled candidate runs — история диагностики.

**Продолжение 4 ноября:** [epoch diagnosis](../docs/evidence/core-native-capture-epoch-diagnosis-20261104.json).
High candidate16:14PASS/2FAIL после устранения format/globals drift.
XHigh specialist подтвердил историческое смешение package/client epochs:
позитивный capture требует capture-era package-owned panel, не текущий клиент.
Production exact8/reader sourceA pins остаются прежними; отдельный отрицательный
тест закрепляет отказ несовместимого current/late клиента. До исправления candidate source checkout не применялся;
staging FAIL/cancelled сохранены и не принимаются как PASS.

[Первый run](../docs/evidence/core-release-block-16-attempt-01-20261103.json) завершился15tests=2PASS/13FAIL,exit1.
Все отказы capture_package до listener; production fault не заявляется.
Гейт format1 оператора не ослабляется. Предпочтительный repair — явная legacy
fixture, полная dependency binding и routing CLI без nested dedicated Titles.
Изменившиеся keys переоткрываются; старые PASS сохраняются как historical.

## Decision Log

- При preflight block12 обнаружена статически достижимая fail-ветка fixture:
  `rpcProcess` запускает `client-entry.js` без preload; при потере own IPC thin
  client может создать detached owner без fixture port mapping. Фактического
  запуска этой ветки не было. Block12 удержан до test-only guard в существующих
  `owner-runtime.test.js` и `fixtures/owner-runtime-child.js`.
- Guard применяется после принятого block11, перед полным named block12.
  Production код/timeout/map не меняются; candidate VM regression не считается
  PASS самого `owner-runtime`. Ожидаемый key drift — только `owner-runtime` и
  `lifecycle-simulation`, который сохраняет статус integration remaining до
  своего позднейшего блока.
- Preflight 16–29 завершён: production fallback не найден. Намеренно сохранённые
  собственные TEMP trees в 16/17/18/19/21/22/23/25/26/27/28 отделяются от активных
  ресурсов. При аварии в 05/22/26/27 exact fixture children удерживают следующий
  блок до доказанного выхода; blanket kills и широкий filesystem cleanup запрещены.
- Новое поручение разрешает последовательное выполнение source-кандидатов;
  прежний `plan-only` описывал подготовку manifest, а не запрет этого поручения.
- PASS требует exit0, непустых matched tests, fail/cancelled0 и сохранённых skips.
  Сравниваются keys до и после выполнения. Parent/group counts не складываются
  как глобальное число уникальных cases; каждый named check имеет свою привязку.
- При FAIL сохраняется исход, queue admission следующего блока откладывается
  до адресной диагностики/исправления. Не повторять неизвестный production исход,
  не менять budgets/gates ради зелёного результата и не удалять чужие fixtures.
- Full release, P1–P8 и native product acceptance этой очередью не закрываются.
  `releaseCertified=false`, Titles/Slideshow на паузе.

## Validation

Capture-era repair применён 4 ноября: 4 test/map/data files, 18 rekey / 53 same;
8 старых accepted результатов historical. [Repair](../docs/evidence/core-native-capture-fixture-repair-20261103.json).
Composite16 проверяет 17 capture + 10 Core = 27 outer cases до code commit;
затем шесть устаревших source integrations идут как 30–35, без nested Titles.

Guard перед block12 применён: только два test files, 69 ключей прежние.
[Fixture evidence](../docs/evidence/core-owner-runtime-fixture-guard-20261103.json) дополнено полным named
`owner-runtime`: 23 cases PASS на изменённых test bytes, до commit.

Для каждого блока durable JSON содержит baseline/argv/cwd/time, текущие keys,
Node reporter summary (spec/TAP), named matched tests, log SHA, isolation/cleanup и ограничение source
proof. Reducer проверяет полноту всех 71 IDs, current keys, accepted references,
remaining/batch/pause invariants и отсутствие source diff. UTF-8/локальные ссылки
и staged whitespace проверяются перед каждым commit.

## Продолжение

Активная очередь и текущий remaining находятся в
[manifest](../docs/core-release-manifest-20261103.json).
Завершённые blocks имеют отдельные evidence и commits в Git. Следующий batch
выбирается из оставшихся после проверки собственного fixture/host scope;
не запрашивать новый чат или общее «продолжать?» между уже разрешёнными блоками.
