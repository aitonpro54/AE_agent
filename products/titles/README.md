# Titles 0.1

Внешний workflow-пакет для одной операции: заменить текст одного **существующего,
статичного, uniform single-line слоя** через публичную capability Core4
`titles-current-target` / `set-current-text` и policy
`current-matching-target-after-local-confirmation-v1`.

Пакет работает автономно на Node.js 20+ без зависимостей. Runtime, Core/CEP,
installer и их state не импортируются. Он выдаёт данные для существующего
MCP-контроллера. Создание слоёв, типографика, смешанные стили, анимация, templates,
batch, render и сохранение AEP в 0.1 не поддерживаются. Поддержанность реального
слоя устанавливает inspection Core, а не входной JSON.

## Быстрый запуск

Из корня репозитория:

```powershell
node products/titles/cli.js compile --job products/titles/examples/single-title.json
node products/titles/cli.js prepare-build --job job.json --contract contract.json --inspection inspection.json
node --test products/titles/test/compiler.test.js
```

В example стоят демонстрационные `projectId`, `compId`, `layerId`; отправлять его
как есть нельзя. Требуется **уже сохранённый открытый AEP** с существующими comp/layer
IDs. `projectId` должен буквально совпадать с `app.project.file.fsName`; пустой
несохранённый проект не подходит. Замените пример точными значениями своего
рабочего контекста: продукт сам проект не сохраняет. `contract.json` и `inspection.json`
во втором вызове — **свежие результаты** соответствующих tools существующего Core,
без внешней MCP-обёртки `content`. Пакет не извлекает эти результаты сам.

CLI читает только явно указанные файлы, выводит один JSON в stdout и ничего не
записывает. При ошибке stdout пуст, stderr содержит JSON `{ "error": "код" }`,
exit code — 1. Файлы UTF-8, максимум 65536 байт каждый; выход ограничен тем же
budget. Аргументы строгие: дубли, неизвестные flags и пропущенные файлы запрещены.
HTTP/stdio подключение к Core, процессы, автоматическое propose/run, discovery
установки и чтение credentials отсутствуют. Используется обычный `JSON.parse`:
повтор ключа в JSON следует его стандартной семантике последнего значения;
неизвестные итоговые ключи запрещены.

## API и вход

```javascript
const { compile, prepareBuild } = require('./src/compiler');
const preview = compile(job);
const payload = prepareBuild(job, freshContractResponse, freshInspectionResponse);
```

`compile(job)` — чистая детерминированная функция. Результат содержит product
identity, jobId, intention и описательный recordContext; ссылки contract/evidence
не изобретаются. `prepareBuild` возвращает **непосредственно payload** для
`build_solution_plan`: `oneStep:true`, один `steps[]`, moduleId/contractId/evidenceRef
и `input:{projectId,compId,layerId,text}`. Публичная MCP-обёртка имеет вид
`arguments:{payload:result}`. `expectedRevision` и `expectedText` добавляет Core.

Схема задания — [job.schema.json](job.schema.json), пример —
[single-title.json](examples/single-title.json). Job содержит только
`schemaVersion:"0.1"`, `jobId`, `target`, `text`. Идентификатор job — 1–80 ASCII
букв/цифр/`.`/`_`/`-`, с буквы или цифры. AE item IDs — целые 1–2147483647.
Project identity сохраняется буквально: нормализации путей нет.

Пустой и полностью пробельный текст, управляющие символы, tab/newline,
NEL/U+2028/U+2029 отклоняются. Начальные/конечные пробелы содержательного текста,
NBSP внутри строки и Unicode сохраняются без trim/нормализации. Text ограничен
2048 UTF-16 units, projectId — 8192; это намеренно строже JSON Schema для некоторых
символов вне BMP и соответствует текущему Core. Вход должен быть обычным JSON
деревом с глубиной не больше 12 и budget 65536 байт. Styles, render, batch,
ожидания и любые дополнительные поля не принимаются.

Одинаковый job даёт одинаковый результат; ключи входного объекта могут идти в
другом порядке. `taskId` и `workflowId` равны `titles-<SHA-256 canonical job>`.
Изменение текста меняет обе identity. `contextId` равен jobId, purpose/lifetime —
`user_work/work_context`, resources описывают project/job. Эти metadata не дают
authority и не снимают fences/UNKNOWN.

## Совместимость и доверие

Пакет принимает только закреплённый публичный contract profile из
[compat/titles-current-target.contract.json](compat/titles-current-target.contract.json).
Его canonical SHA-256 —
`6226f911063f94f471bff23e9ebb60f1ee49323c2f25d54e6a4bdabf95bbe55b`.
Module artifact pin версии 4.0.0 —
`6b89ae03e01e195da5a33a75391ee60cfb7f63a9dd77f0c8116f06b468098d46`.
Это public capability identities; packageHash, installation/machine identity и
credentials здесь не участвуют. Новый несовместимый contract или module pin
требует явного обновления продукта; fallback отсутствует.

Проверяются полная форма contract response, digest публичного contract, module
pin, форма opaque contractId/admissionPin, форма inspection и snapshot, совпадение
target и module pin. `synthetic:true` или отсутствие `synthetic:false` отклоняются.
ContractId не вычисляется из contract: это opaque ссылка сервера.

**Структурная проверка JSON не доказывает подлинность, свежесть или допуск.**
Inspection не содержит доверенного timestamp для локальной проверки возраста.
Внешний JSON можно подделать, включая `synthetic:false` и корректно выглядящие
references. Core самостоятельно находит evidenceRef в своём хранилище и проверяет
contract/admission/refs, resource state и последующие gates. Он остаётся владельцем
build/proposal, ledger, receipts и fences. Продукт не выдаёт grants и не создаёт
production epoch/continuity прежней incarnation.

## Проверки и ограничения доказательств

Suite проверяет детерминированность и независимость результатов, изменение текста,
строгие поля/типы/budgets, Unicode/пробелы/newline, повреждённые и несовместимые
contract/inspection, CLI, собственный import graph и точное совпадение public profile.

Integration импортирует **только из test** настоящий Core4 Broker, private branded
test policy и текущий executor в Node VM с существующим `fixtures/ae`. State
расположен в TEMP; HTTP/native UI/installed runtime и mutate не используются.
Настоящий synthetic inspection сначала отклоняется продуктом. Затем test явно
меняет только недоверенное экспортное поле на `synthetic:false`, чтобы проверить
совместимость формы production response. Серверная запись остаётся synthetic.
Этот шаг не является issuance, авторизацией или live evidence.

Проверены принятие output серверным builder, добавление expected fields и настоящий
отказ Core `server_evidence_required` для выдуманной ссылки. Snapshots подтверждают
сохранение Core/CEP source bytes и временного server ledger/artifacts после compile,
ошибки и удаления test-owned копии workflow. Это узкая offline-проверка владения
данными, а не проверка восстановления реальной незавершённой команды.

Live PASS, новый admission/install/hot-swap capability и десктоп↔MSI round-trip
не заявлены. Порядок работы с существующим controller — в [WORKFLOW.md](WORKFLOW.md).
