# Работа с Titles 0.1 через существующий controller

Этот файл — инструкция оператору. Сам CLI выполняет только compile/prepare-build.
Пакет не запускает второй Broker, не подключается к CEP и не управляет AE.

1. Требуется уже сохранённый открытый AEP, существующие comp/layer IDs и буквальное
   совпадение `projectId` с `app.project.file.fsName`. Несохранённый пустой проект
   не подходит; пример `C:/example/film.aep` — placeholder, отправлять его как есть
   нельзя. Сохранение проекта не входит в пакет. Зафиксировать рабочий заказ,
   точную цель и желаемый текст в job JSON. Запустить
   `compile --job FILE`, проверить preview и literal text. Один job — один слой.
2. Единственный действующий Core MCP controller проверяет своё подключение,
   unresolved/pending и доступный module catalog по актуальным проектным gates.
   В owner composition сначала получить `controller_acquire`. Если `core_status`
   вернул `workSession.sessionId`, передать его как `payload.sessionId`.
   Затем выполнить `core_connect` и проверить `available:true`. Подключённая CEP
   сама по себе не устанавливает транспорт Broker для Titles. Удерживать lease
   через штатный `controller_renew` в пределах его срока; после release/acquire
   заново получить inspection/build/proposal refs текущего поколения.
   Получить свежий `get_module_contract` с
   `payload:{moduleId:"titles-current-target"}`. Сохранить только JSON результата.
3. Тем же controller вызвать `inspect_module_target` с
   `payload:{moduleId:"titles-current-target",contractId:CURRENT_ID,target:JOB_TARGET}`.
   Inspection должен подтвердить поддержку существующего слоя. Не выдавать
   inspection/preview за подтверждение пользователя. При ручных изменениях цели
   обновить inspection и baseline.
4. Передать эти свежие результаты в
   `prepare-build --job FILE --contract FILE --inspection FILE`. Проверить payload:
   один step, точные target/text/references, `oneStep:true`. При отказе совместимости
   остановить данный build и разобрать конкретное несовпадение; не подставлять pins
   или выдумывать evidence, ожидания, grants и timestamps.
5. Существующий controller вызывает `build_solution_plan` с возвращённым payload.
   Core сам создаёт ожидания из server-owned evidence. Новый taskId возвращает
   сервер; workflowId и описательный contextId сохраняют связь с job. Не передавать
   заранее выдуманный taskId для обхода owner refs. Далее controller ведёт
   `propose_plan` → `dry_run_plan` → разрешённый `run_plan` по действующим gates.
   Пятисекундная свежесть dry-run проверяется Core перед отправкой. Native
   confirmation текущей совпадающей цели остаётся внутри mutate; ручное
   подтверждение не означает automatic lifecycle/continuity прежней incarnation.
6. Проверить server receipt/read-back и точный target/text. При UNKNOWN/timeout
   сначала установить фактическое состояние через штатный controller/reconciliation;
   не повторять mutation из compiler, не менять identity для обхода fences.
   Save, raw JSX и destructive остаются отдельными gates и не входят в Titles 0.1.

Внешние JSON — недоверенные данные. Ни прохождение `prepare-build`, ни наличие
`synthetic:false` в файле не доказывают свежесть/подлинность server evidence или
авторизацию исполнения. Удаление папки Titles не удаляет state Core и не отменяет
уже отправленную команду. Собственные runtime receipts/state продукт не хранит.

## Серия в копии шаблона

В составе Core `manual-titles/owner` используйте общий модуль `text-layer`.
В [примере задания](examples/numbered-series.json) замените `target` на точный
путь и ID своей рабочей композиции. Для `frame: "guides"` инспекция должна вернуть
ровно две направляющие по каждой оси. Можно задать прямоугольник `left, top,
width, height` явно. Профиль задаёт оформление автора, пояснения и названия.
Количество блоков входа совпадает с количеством записей в `titles`. Для
ручных переносов задайте `lineBreaks` по словам рубрики и `candidateId: "override"`.

```powershell
node products/titles/cli.js prepare-series --job JOB.json --inspection CURRENT.json
node products/titles/cli.js prepare-series-write --job JOB.json --selection SELECT.json --contract CONTRACT.json --inspection CURRENT.json
```

Для создания `SELECT.json` содержит `{"number":1}`. Для редактирования он также
содержит `layerId` из свежей инспекции этого слота. Компилятор возвращает один
шаг. Каждый шаг проходит стандартное подтверждение и свежий read-back перед
подготовкой следующего. Сборка серии создаёт текстовые слои. Выбор видимости и
применение анимации идут отдельными операциями.

## Анимированный вариант и очередь AE

В составе `manual-titles-variants/owner` заполните
[задание выпуска](examples/titr-all-release.json) по IDs серии и шаблона. `holdTime`
задаёт момент, в который Core выровняет анимированный текст по границам
оформленного слоя. Для шаблона с `IN` укажите `markerSourceLayerId` явно.

```powershell
node products/titles/cli.js prepare-release --job RELEASE.json --selection SELECT.json --contract CONTRACT.json --inspection CURRENT.json
```

1. `{"phase":"derive"}` создаёт оформленный вариант через `text-variant`.
   Запишите новый `layerId` из квитанции и сверьте его свежим чтением.
2. `{"phase":"stage","variantLayerId":4594}` готовит одно задание через
   `comp-render`. Core создаёт временную копию композиции. Исходная видимость
   сохраняется. Папка `titles-output` рядом с рабочим AEP должна существовать.
3. В штатной очереди AE проверьте, что к запуску готово только это задание.
   Сверьте композицию, диапазон, шаблоны и выходной путь. Запустите рендер,
   дождитесь `Done` и получите свежую инспекцию `comp-render`.
4. Передайте `{"phase":"finalize","variantLayerId":4594,"jobCompId":6000}`
   с фактическими IDs. Core сверит `DONE` и файл, затем удалит временную
   пару объектов. Сверьте квитанцию, очередь, видимость и декодированные кадры.
   При остановке или ошибке `discard` снимает временные объекты после отдельного
   подтверждения и сохраняет выходные байты для диагностики.

## Проверка задания Adobe Media Encoder

`node core4/tools/ame-media-export.js plan JOB.json` проверяет точные пути и SHA-256
копии AEP, исходного MP4 и пресета `.epr`. `read JOB.json` сверяет сохранённые
квитанции по тому же binding, native ID и выходному файлу. Обе команды работают
в режиме чтения. Успешная постановка подтверждает связь с заданием. Для приёмки
медиа нужны терминальная квитанция и декодированные кадры.

На MSI `exportItem` запустил общую очередь AME. Приёмка кодирования требует
отдельно подтверждённой изоляции от чужих заданий. Результат и восстановление
общей очереди зафиксированы в [evidence MSI](../../docs/evidence/titles-msi-ame-shared-queue-20261105.json).
