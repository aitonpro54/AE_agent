# Slideshow S1

Один шаблон `crossfade-two-v1` собирает два изображения в ролик на 90 кадров
при 30 или 30000/1001 кадра в секунду. Слоты занимают кадры `[0,60)` и
`[30,90)`. В перекрытии линейно меняется непрозрачность верхнего слоя.
В этом шаблоне используются два статичных изображения без звука.

## Подготовка в After Effects

1. Импортируйте два JPEG одинаковых размеров и pixel aspect. Через
   **New Comp from Selection → Multiple Compositions** создайте по
   композиции на изображение. Задайте **Still Duration** в 60 кадров.
2. Из двух вложенных композиций создайте мастер. Выберите **Single
   Composition**, **Sequence Layers**, **Overlap** в 30 кадров и
   **Dissolve Front Layer**. В столбце **Comment** мастера укажите
   `AE_CORE4_COMP_WORKSPACE_V1`. Подтвердите фактический порядок слотов
   по начальным кадрам, поскольку он зависит от выбора в панели Project.
3. Сохраните исходный AEP и откройте его отдельную побайтную копию. Подготовьте
   рядом с копией папку `titles-output` для существующего модуля `comp-render`.
   Изображения назначения должны уже присутствовать в рабочем проекте.
   [Последовательность слоёв в Adobe After Effects](https://helpx.adobe.com/after-effects/desktop/work-with-layers/select-and-arrange-layers/selecting-arranging-layers.html)

## Задание и выполнение

Файл задания следует [схеме](job.schema.json). В `slots` передайте comp/layer ID
двух фотослоёв в хронологическом порядке и текущий ID каждого плейсхолдера.
`photos` задаёт желаемый порядок точными ID импортированных источников,
локальными путями и SHA-256. В `project` запишите путь открытой копии, ID
мастера и текущую сессию из `core_status`. В `template` укажите путь и SHA-256
сохранённого оригинала. Настройки render/output templates берутся из текущей
установки AE. Для прогона на стенде используйте `purpose: technical_check`.

```powershell
node products/slideshow/cli.js compile job.json
node products/slideshow/cli.js verify-initial job.json
node products/slideshow/cli.js prepare-build job.json observations.json
node products/slideshow/cli.js prepare-render job.json observations.json stage
node products/slideshow/cli.js prepare-render job.json observations.json finalize
node products/slideshow/cli.js verify-files job.json
```

Перед сборкой плана получите свежие контракты `photo-placeholder` и
`comp-render`. Передайте их ответами `photoContract` и `renderContract`
вместе с инспекцией мастера `master` и двумя инспекциями `slots`.
Подтверждение AE, сохранение checkpoint, отправка и квитанции проходят
через существующий контроллер Core. CLI читает только указанные входы и
выдаёт JSON для `build_solution_plan`.

В составе с внутренним подтверждением `prepare-build` возвращает один
следующий фотослот. Выпустите одноразовый допуск для его предложения перед
`dry_run_plan` и сразу вызовите `run_plan`. Перед следующим вызовом
`prepare-build` заново прочитайте мастер и оба слота и передайте исходную
квитанцию в `tasks`. После двух успехов переходите к `prepare-render`.

При частичном успехе передайте свежие инспекции и исходные ответы `get_task`
в массиве `tasks`. Компилятор привязывает тот же workflow и обе операции.
Можно продолжить с новым lease и новой задачей в этом workflow. Подготовка
плана сверяет успешный слот с исходной квитанцией. В двухшаговом плане Core
также перечитывает успешный слот перед оставшимся шагом. Если исход команды
неопределён, сначала восстановите его
по исходному ID и журналу Core. Подмена успешного слота вызывает отказ.

После двух подтверждённых замен `stage` ставит одно задание на 90 кадров.
В Render Queue проверьте, что отмечено только это задание, и запустите его.
После нативного `DONE` снова получите `master`, `slots` и исходные `tasks`.
`finalize` снимает временное задание и копию композиции. Сверьте ролик на
кадрах до перехода, внутри него и после него. Проверьте SHA-256 шаблона
и изображений командой `verify-files`.
