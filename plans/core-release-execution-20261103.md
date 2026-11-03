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
Принято блоков: 4; проверок по именам: 4. Применимое evidence: 35 exact-key + 2 byte-command-bound. Открыто: 34 (без hold: 32, Titles под паузой: 2). Следующий блок: source-candidate-05.
<!-- /EXECUTION_STATUS -->

<!-- EXECUTION_BLOCKS -->
| Блок | Named checks | Результат / Node summary | Evidence |
| --- | --- | --- | --- |
| source-candidate-01 | `start-over-runtime` | PASS: 3 pass / 0 skip | [JSON](../docs/evidence/core-release-block-01-20261103.json) |
| source-candidate-02 | `start-over-operator` | PASS: 6 pass / 0 skip | [JSON](../docs/evidence/core-release-block-02-20261103.json) |
| source-candidate-03 | `stopped-host-readoption-operator` | PASS: 17 pass / 0 skip | [JSON](../docs/evidence/core-release-block-03-20261103.json) |
| source-candidate-04 | `stopped-update-operator` | PASS: 4 pass / 0 skip | [JSON](../docs/evidence/core-release-block-04-20261103.json) |
<!-- /EXECUTION_BLOCKS -->

## Decision Log

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
