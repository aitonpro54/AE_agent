# Визуальный контроль текста через существующий frame builder

Решение `text-visual-review-plan` готовит один ограниченный кейс с typed read-back.
Компиляция читает проект, обе композиции при route, точный текстовый слой и слой
прекомпозиции, затем проект повторно. Именованный `.aep`, доступная native revision
и одинаковая revision до/после всех наблюдений обязательны. Сейчас проверены только
офлайн-контракты и синтетические PNG integrity fixtures; живые сцены не выполнялись.

Вход `build_solution_plan`:

```json
{
  "solutionId": "text-visual-review-plan",
  "inputs": {
    "caseId": "scaled-precomp-text",
    "rootCompItemId": 20,
    "textTarget": {"compItemId": 10, "layerId": 2},
    "route": [{"parentCompItemId": 20, "layerId": 5, "childCompItemId": 10}],
    "frames": [
      {"time": 0, "phase": "entry"},
      {"time": 1, "phase": "hold"},
      {"time": 2.5, "phase": "exit"}
    ],
    "checks": ["staticSourceText", "transformedBounds", "phaseCoverage"],
    "expectedText": "Scaled Text"
  }
}
```

ID в примере заменяются подтверждёнными текущими ID. Route имеет длину 0 для
текста в корне или 1 для вложенной композиции. Поддерживаются существующие 2D
слои без дополнительного layer parenting, collapse transformation и time-remap.
Source Text должен быть статичен. `frames` содержит 1–3 явных времени корневой
композиции на её frame grid; `phase` обязателен и равен entry/hold/exit.
`checks` — массив имён, staticSourceText обязателен. Остальные имена обозначают
задание для просмотра, а не серверное доказательство видимых границ.

Для `font-difference` добавить только
`"fontRequest": {"runId": "<точный UUID запуска>", "stepIndex": 2}`.
Имя шрифта сервер извлекает из `args.font` именно указанного durable
`update_text_layer` шага. Клиент не передаёт requestedFont, actualFont, bounds,
матрицу или результаты визуальной оценки.

## Замкнутый план и evidence

Wrapper переиспользует `buildCompVisualReviewPlan`, его безопасные имена PNG,
resolution restoration, idempotency и прежние export gates. Один route и три
кадра дают ровно 10 шагов:

1. Начальный get_project_info.
2. Exact text pre-read get_layer_details с protected Source Text path.
3. Exact route pre-read get_layer_details.
4. Три contiguous save_comp_frame_png (шаги 4–6, ordinals 1–3).
5. Exact text post-read (7) и route post-read (8).
6. Existing root get_comp_details post-read (9).
7. Финальный get_project_info (10).

Без route три кадра дают 8 шагов. Дополнительные произвольные reads или mutations
не допускаются. Прежний общий comp builder сохраняет лимиты 4 comps / 12 frames /
18 steps; текстовый wrapper ограничен одним кейсом, одним route и тремя кадрами.

`get_comp_visual_review_manifest({runId})` читает долговечную server запись.
Закрытый text pattern целиком проверяется перед точным remap в прежний PNG
verifier. Canonical `reviewEvidence.sha256(plan)` совпадает с runner provenance.
Каждый frame binding содержит runId, planSha256, export stepIndex, ordinal,
rootCompItemId, time и frameNumber. Time 0 с frameNumber 300 отклоняется.

Pre и post обязаны подтвердить точные comp/layer IDs, exact Unicode без
нормализации, normal text.kind `TextDocument`, font как строку, отдельный fontSize
и justification. Защищённая строка Source Text имеет path
`[{matchName:"ADBE Text Properties"},{matchName:"ADBE Text Document"}]` именно в этом
порядке, numKeys 0 и expressionEnabled false. `protectedProperties.value` — raw
host value; его сериализация не используется как текстовое доказательство.
Имя слоя не заменяет Source Text. Сверяются route.source.itemId, timing/stretch,
2D flags и transform metadata. Динамические transform values сравниваются только
при одинаковом comp.time; getter не читает их в каждом экспортном времени.

Font observation требует исходную запись того же проекта, canonical hash,
точный update step, запрос font и independent stable-ID get_layer_details до
обновления. Текущий update_text_layer адресует compItemIndex/name и layerIndex,
поэтому этот pre-read связывает индексы с IDs; native mutation receipt должен
подтвердить layer.id и comp index/name. Отсутствие записи, чужой шаг/цель или
неизвестный outcome даёт blocked/incomplete. Только явный authoritative native
отказ unavailable font может дать font_request_rejected; он также incomplete и
не требует автоматического повтора. Generic error не доказывает отсутствие шрифта.
Различие requested/stored font — историческое наблюдение, а не доказанная подмена
в отрисовке.

Verified означает только исторические native read-back и PNG integrity.
Всегда сохраняются historicalCapture true и currentProjectStateVerified,
canonicalFreshness, artisticAccepted, visibleBoundsVerified, fontRenderingVerified
false. После редактирования строится новый план и новый capture; старый манифест
не является доказательством текущего состояния.

## Воспроизводимые будущие synthetic случаи

Эти процедуры требуют отдельно разрешённой области: новый synthetic именованный
AEP, создание слоёв, сохранение и экспорт через действующие gates. Текущий этап
их не выполняет. Не использовать проект пользователя как тестовую сцену.

Для каждого кейса сначала через guarded-project-lifecycle / create_named_project
подготовить отдельный `text-review-<caseId>.aep`. Через существующие create_comp,
create_text_layer и typed transform/timing tools создать root 1920×1080, 30 fps,
10 s и, где нужен route, precomp 1280×720 с той же частотой и длительностью.
После каждой creation прочитать новые IDs/индексы, а после текстовой правки —
повторно имя и ID слоя. Каждый mutating proposal проходит dry-run,
confirmation/checkpoint и independent read-back; save_current_named_project
сохраняет только через собственные gates.

- `scaled-precomp-text`: текст `Scaled Text`, fontSize 72, center, position
  [640,360], anchor [40,20], scale [125,85] во вложенной comp. Слой precomp в root
  имеет scale [65,65], anchor [640,360], position [1040,600], без parenting.
  Кадры root 0/entry, 1/hold, 2.5/exit. Проверить поля по итоговому видимому
  тексту после обеих трансформаций, верхние и нижние элементы и иерархию.
- `offset-stretch-phases`: тот же статический текст; startTime/inPoint 1.2 s,
  stretch 150%, без time-remap. Текущий set_layer_time_range не имеет stretch;
  set_property_value допускает только whitelisted layer attributes и не закрывает
  эту настройку. Для будущей synthetic подготовки это конкретный typed gap:
  назначить stretch 150 только в отдельно разрешённом protected raw flow с точными
  comp/layer ID guards и read-back либо подготовить сцену вручную. Текущий этап
  такого разрешения не получает. Transform анимация entry/hold/exit задаётся существующим
  typed keyframe setter с точным прочитанным path. Например root position
  [300,540] при 1.2 s, [960,540] при 2.2 s, [1620,540] при 3.2 s.
  Экспортные времена root заданы явно: 1.2/entry, 2.2/hold, 3.2/exit.
  У Source Text остаются numKeys 0 / expression false; не вычислять sourceTime oracle.
- `accents-descenders`: exact текст `ÁÉÍÓÚ ЙЁ\nagjpqy`, fontSize 72, center,
  position [960,540] в root, static Source Text. Hold frame 1 s.
  В читаемом PNG проверить акценты, Й/Ё, нижние выносные элементы и межстрочное
  расстояние; numeric fontSize и центр слоя не подтверждают видимые поля.
- `font-difference`: текст `Font Difference Sample` в root; после получения
  точного layer ID/индекса подготовить отдельный typed update_text_layer запрос
  конкретного имени шрифта. В том же durable plan сохранить exact stable-ID
  get_layer_details до update; при успехе сделать independent text read-back.
  Сохранить его runId и точный update stepIndex. Новый review план использует
  hold 1 s и этот fontRequest. Не придумывать FontObject, список установленных
  шрифтов или автоматический fallback; unknown outcome сначала сверить.

Экспортный review plan отдельно предложить через propose_ai_agent_plan, выполнить
dry-run и штатное подтверждение/защиту перед run_ai_agent_plan. Проверить manifest,
затем **фактически открыть каждый PNG** в читаемом размере. Сохранить отдельный
визуальный вывод по entry/hold/exit, обрезке, полям и иерархии по
[text-layout-policy](../docs/text-layout-policy.md). Просмотр не меняет серверные
флаги manifest и не превращает PNG hash в художественную приёмку.

Typed gaps: текущий get_layer_details читает только current comp.time; нет
покадрового composed ink/perspective proof и доказательства rendered font либо
отсутствия font substitution. SourceRect math, stored font name и layer.position
не закрывают эти пробелы.
