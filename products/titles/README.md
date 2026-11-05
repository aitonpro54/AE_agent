# Titles

Внешний workflow-пакет с автономной подготовкой вёрстки и действующей операцией
0.1 для замены текста одного **существующего,
статичного, uniform single-line слоя** через публичную capability Core4
`titles-current-target` / `set-current-text` и policy
`current-matching-target-after-local-confirmation-v1`.

Пакет работает автономно на Node.js 20+ без зависимостей. Runtime, Core/CEP,
installer и их state не импортируются. Он выдаёт данные для существующего
MCP-контроллера. Текущая операция 0.1 работает с заменой одной строки при
сохранении стиля. Применимость к реальному слою устанавливает inspection Core.
Подготовка вёрстки ниже работает автономно.

## Быстрый запуск

Из корня репозитория:

```powershell
node products/titles/cli.js compile --job products/titles/examples/single-title.json
node products/titles/cli.js prepare-build --job job.json --contract contract.json --inspection inspection.json
node --test products/titles/test/compiler.test.js products/titles/test/layout.test.js
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
другом порядке. `workflowId` равен `titles-<SHA-256 canonical job>`; изменение
текста меняет эту identity. `taskId` выдаёт Core при первом build. `contextId`
равен jobId, purpose/lifetime —
`user_work/work_context`, resources описывают project/job. Эти metadata не дают
authority и не снимают fences/UNKNOWN.

## Подготовка одного многострочного титра

```powershell
node products/titles/cli.js prepare-layout --job products/titles/examples/multiline-title.json
node products/titles/cli.js fit-layout --job layout-job.json --measurements measurements.json
```

[Схема задания](layout-job.schema.json) · [Пример с тремя рубриками](examples/multiline-title.json).

- `format` задаёт порядок рубрик. `author-title` принимает автора и название,
  `author-caption-title` — автора, пояснение и название. Каждая рубрика начинается
  с новой строки. Один начальный номер вида `№ 7`, `7.` или `7)` сохраняется
  отдельно. Пустая строка между рубриками или ещё один номер означает границу
  другого блока. Поддерживается продолжение начальной парной кавычки на новой
  строке. Варианты порядка рубрик и пакетный разбор остаются вне этого формата.
- Результат сохраняет `source` буквально. Для отображения он нормализует пробелы,
  начальные парные кавычки, охватывающие целую рубрику, и пробелы между инициалами.
  `titleCase` явно выбирает `preserve` или `uppercase` для названия. Содержательный
  вход ограничен 768 кодовыми единицами UTF-16.
- `frame` — осевой прямоугольник в пикселях композиции с неотрицательными `left`,
  `top`, шириной и высотой от 1 px. Preview выдаёт базовый вариант и до 18
  альтернатив с теми же словами и максимум пятью строками. `lineBreaks` позволяет
  задать один вариант для этого титра. Например, `{"title":[3]}` означает перенос
  после третьего слова нормализованной рубрики `title`.
- Для `fit-layout` добавьте в job `fit` с полями `padding` в пикселях,
  `preferredScale` и `minimumScale`. Масштаб задаётся множителем `1` для 100%.
  Расчёт сохраняет базовый вариант, если он помещается при предпочтительном
  масштабе. Иначе выбирается наибольший допустимый масштаб. При равенстве
  сохраняется порядок вариантов из preview.

Файл `measurements.json` принимает `layoutId` из preview, `geometry` со значением
`unparented-unrotated-2d-point-text`, исходный `anchor` как `[x,y]` и `samples`.
Каждый элемент `samples` содержит `id` кандидата и `bounds` с `left`, `top`,
`width`, `height` в локальных координатах слоя до масштабирования. Нужны все
кандидаты из одного контекста шрифта, стиля и кадра. `layoutId` связывает рамку и
точные строки кандидатов. Проверку AE-цели, шрифта и происхождения замеров должен
выполнять будущий адаптер.

При `status: "fit"` расчёт возвращает вариант, `scale`, `position` с сохранённым
anchor и `projectedBounds`. `below_minimum_scale` означает, что ни один кандидат
не достиг порога. Измерение в After Effects, применение и сверка фактического
кадра описаны в [плане T3](../../plans/external-products-titles-20261029.md#t3-многострочный-титр-в-рамке).

### Подготовка типизированных операций для AE

Дополнительный пакет Core `manual-layout` содержит `titles-point-layout`.
Подготовьте два point-text слоя в одной композиции с одинаковым шрифтом и
стилем. Измерительный слой скрыт и помечен комментарием
`AE_CORE4_TITLES_MEASURE_V1`. Видимый слой помечен `AE_CORE4_TITLES_LAYOUT_V1`.
Профиль ограничен статичным горизонтальным однородным 2D point text без обводки,
масок, эффектов, поворота и родителя. Обе цели задаются точными IDs, а время
и стиль проверяет Core. Для этой операции требуется отступ не менее 1 px.

```powershell
node products/titles/cli.js prepare-layout-measure --job layout-job.json --target hidden-target.json --contract layout-contract.json --inspection hidden-inspection.json
node products/titles/cli.js prepare-layout-apply --job layout-job.json --target visible-target.json --contract layout-contract.json --inspection visible-inspection.json --measurement-task task-after-measure.json
```

Каждый target содержит `projectId`, `compId` и `layerId`. Получите текущий
контракт и свежую инспекцию соответствующей цели. Вывод каждой команды — payload
для `build_solution_plan`. Проведите замер через proposal, dry-run и одно
нативное подтверждение. Получите `task-after-measure.json` из `get_task` и новую
инспекцию видимой цели. Затем проведите применение с отдельным подтверждением
в той же задаче и с тем же управлением Core. После применения прочитайте
видимый слой заново и просмотрите композицию в проверенном кадре.

Core связывает применение с исходной завершённой командой замера, текущим AE,
тем же кадром, шрифтом и стилем. Клиентские JSON готовят payload. Проверка
авторитетной записи выполняется на сервере. Отказ из-за устаревшего замера
требует свежей пары замер и применение.

## Серия и выпуск через очередь AE

Установите состав Core `manual-titles-variants`. Подготовьте сохранённую рабочую
копию композиции с меткой `AE_CORE4_TEXT_WORKSPACE_V1`. Заполните точные цели
по свежему чтению Core. В [примере серии](examples/numbered-series.json) находятся
исходный текст, имена, номера, ручной перенос и профили трёх рубрик. Рамка задана
в пикселях. Значение `"guides"` требует две направляющие по каждой оси внутри
композиции.

```powershell
node products/titles/cli.js prepare-series --job series.json --inspection text-inspection.json
node products/titles/cli.js prepare-series-write --job series.json --selection title.json --contract text-contract.json --inspection text-inspection.json
node products/titles/cli.js prepare-release --job release.json --selection phase.json --contract phase-contract.json --inspection phase-inspection.json
```

`prepare-series` собирает выбранные переносы и диапазоны стиля. Для записи
нужны контракт и снимок `text-layer`. Выбор `{"number":1}` создаёт свободный
слот, `{"number":1,"layerId":123}` перевёрстывает наблюдавшийся слой.
После каждой записи получите свежий снимок перед следующим титром. `text-layer`
принимает статичный горизонтальный 2D point text без родителя, поворота,
выражений в геометрии и активных Layer Styles. Он измеряет `sourceRectAtTime`
в AE и центрирует видимый блок в рамке отдельно от выравнивания абзаца.

[Пример выпуска](examples/titr-all-release.json) задаёт исходный слой оформления,
слой вёрстки, управляемые варианты, время удержания, диапазон кадров, шаблоны AE
и имя MP4. Подготовьте папку `titles-output` рядом с рабочим AEP. `phase.json`
определяет шаг и точные цели.

| Фаза | Контракт | Пример выбора |
| --- | --- | --- |
| Создать оформленный вариант | `text-variant` | `{"phase":"derive"}` |
| Подготовить единственное задание | `comp-render` | `{"phase":"stage","variantLayerId":123}` |
| Принять `DONE` и очистить очередь | `comp-render` | `{"phase":"finalize","variantLayerId":123,"jobCompId":456}` |
| Снять незавершённое задание | `comp-render` | `{"phase":"discard","variantLayerId":123,"jobCompId":456}` |

Каждый payload проходит build, proposal, dry-run и подтверждение Core. После
постановки сверьте задание и выход по свежему чтению, затем запустите рендер
в штатной очереди AE. Для финализации получите свежий снимок `DONE` и передайте
ID временной композиции из него. Core снимает свою строку и копию, сохраняет
медиа и проверяет исходную видимость. [Матрица нативной приёмки MSI](../../plans/titles-end-to-end-msi-20261105.md#матрица-приёмки-msi).

## Совместимость и доверие

Операция `prepare-build` принимает закреплённый публичный contract profile из
[compat/titles-current-target.contract.json](compat/titles-current-target.contract.json).
Его canonical SHA-256 —
`6226f911063f94f471bff23e9ebb60f1ee49323c2f25d54e6a4bdabf95bbe55b`.
Module artifact pin, подтверждённый на Core 4.0.0 и 4.1.0 —
`189c58bf5335a8ce7c889159808b7791a39dc0ad3f0641cd522342bcdb8c6e79`.
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

На Core 4.1.0 на MSI прошла нативная проверка одного тестового слоя с однородным
стилем. Внешний CLI подготовил план, After Effects выполнил замену после локального
подтверждения, а свежая инспекция совпала с исходным receipt. Сохранённый AEP
остался прежним. Покрытие десктопа и иных шаблонов открыто.
[Результат проверки](../../plans/titles-live-20261029.md#5-ноября-titles-на-core-410).

Порядок работы с существующим controller — в [WORKFLOW.md](WORKFLOW.md).
