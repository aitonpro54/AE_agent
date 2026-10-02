# Компактные результаты и записанный evidence

`run_ai_agent_plan` принимает `responseView:"full"|"summary"`; default `full`
сохраняет прежний ответ. Представление выбирается отдельно от proposal, hashes,
confirmation и idempotency. Неверный view отвергается до исполнения.

Сначала выполняются полные существующие native/semantic проверки и формируется
outcome. Затем полный canonical record сохраняется существующим evidence store,
включая final dry-run/read-only, и только после этого строится summary. В summary
остаются stable IDs, статусы execution/mutation/verification/acceptance,
passed/failed/needs-review/unverified counts, ошибки, repair указания и refs.
Большие bodies/деревья/command histories читаются адресно. Truncated diagnostics
помечаются; `unknown`, `insufficient` и ошибка записи record не скрываются.

```json
{"actionId":"<server proposal>","dryRun":true,"responseView":"summary"}
```

Это пример представления, не полный executable request: реальное исполнение
по-прежнему требует актуальных proposal pins и всех существующих gates.

## Адресное чтение

```json
{"runId":"<server UUID>","stepIndex":1,"offset":0,"limitChars":6000}
```

`get_plan_run_evidence` — read-only tool без обращения к AE. Без stepIndex
возвращается полный canonical документ запуска. Defaults: offset0/limit6000,
максимум12000; числа должны быть safe integers, stepIndex>=1. Произвольные пути
не принимаются. Envelope/inner run identity, step hash/artifact/action/project/
proposal/tool binding и realpath относительно trusted log root проверяются,
включая перенаправленные родительские каталоги.

Ответ содержит IDs, observedAt (null при отсутствии), полный document SHA256,
text, offset/nextOffset/totalChars, `fresh:false` и `evidenceKind:"recorded"`.
Использовать серверный nextOffset: offsets считают UTF-16 units; начало внутри
surrogate pair отвергается. Целый двух-unit символ при limit1 выдаётся атомарно.
Повреждённый/чужой/отсутствующий record возвращает ошибку, а не новый proof.

Это прошлое наблюдение. Перед изменением AE свежий preflight и read-back
сохраняются. Получение записанного evidence не даёт права на replay или mutation.

## Проверка

`npm.cmd run smoke:plan-run-response` проверяет actual modules и isolated HTTP/
catalog/runner с fake panel: parity full/summary, invalid-before-commands,
canonical-after-verification, default compatibility, dry/read-only persistence,
replay rejection, integrity/containment/numeric/Unicode negative cases.
Контрольный20step fixture: full132153bytes → summary12249bytes при лимите12288.
Это конкретный offline пакет, не обещание размеров всех ответов или экономии
подписки. Реальный монтаж при этой проверке не выполняется.

Исходный solution smoke ожидал native `passed`, хотя baseline выдавал
`insufficient` при exact recipe read-back. Это доказано на unchanged HEAD;
assertion уточнена с сохранением incomplete native evidence. Сам verifier не
изменён и недостающие доказательства не подменяются recipe checks.
