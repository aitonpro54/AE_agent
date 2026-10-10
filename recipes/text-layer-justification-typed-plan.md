# Text Layer Justification Typed Plan

## Goal

Set paragraph justification on a generated or explicitly reviewed text layer
through `create_text_layer` or `update_text_layer`, without copying source JSX
or exposing arbitrary TextDocument mutation.

## Applies When

- The user asks to create a left, center, or right aligned text layer.
- The user asks to change an existing reviewed text layer to left, center, or
  right paragraph justification.
- Current typed evidence identifies the target composition and, for updates,
  the exact text layer index/name.

## Правила оформления текста AE Agent

- До замены определить смысловые группы и иерархию по референсу и текущему кадру.
- В титрах с основным названием верхняя строка или подпись может иметь тот же
  номинальный кегль, что и название, но не больший. Small Caps может сохранять
  иерархию при равном кегле; этот стиль не обязателен.
- Равноправные элементы оформлять общим кеглем, начертанием, насыщенностью
  и регистром с сопоставимым видимым весом. Длина строки не делает элемент
  главнее; акцент требует явно заданного смыслового приоритета.
- Не уменьшать подпись на фиксированный процент только из-за её роли; в титрах
  с основным названием её номинальный кегль не должен превышать кегль названия.
  Размер выбирать по объёму текста и доступным ширине и высоте конкретного варианта.
  Основное название предпочтительно оставлять в одну строку, если оно помещается
  после небольшого уменьшения кегля с сохранением читаемости и согласованности
  серии; переносы использовать по необходимости размещения и смыслу.
- Кегль, межстрочные интервалы и поля подбирать совместно, сохраняя отчётливое
  разделение строк и достаточные отступы от видимых краёв; при тесноте допустимо
  немного уменьшить кегль блока.
- Общий масштаб подбирать по самому требовательному элементу группы,
  не подгонять строки независимо к одной ширине разным размером или
  растяжением букв.
- Сравнивать серию титров по видимому весу, крупности букв, плотности и доле
  площади плашки, занятой текстом. Коротким титрам допустимы большие свободные
  поля; увеличение относительно типичного заполнения серии должно быть умеренным,
  без заметных выбросов. Сохранять общий стиль и смысловую иерархию, не требуя
  одинакового кегля для всех титров и не растягивая строки.
- Проверять видимую высоту и вес букв с учётом Small Caps, смешанных стилей,
  масштаба и перспективы; компенсация должна сохранять пропорции. Равный
  fontSize не доказывает равный вес.
- Подписи и уточнения размещать рядом с той сущностью, к которой они относятся.
- Каждую строку и весь блок выравнивать по видимым границам своего контейнера:
  сопоставлять левое и правое поля на высоте строки с учётом курсива и перспективы.
  Проверять баланс вертикальных промежутков между элементами и поля от границ.
  Числовой центр слоя или precomp не доказывает оптическое выравнивание.
  Сохранять явно заданное пользователем левое или правое выравнивание.
- Заполнять площадь согласованным масштабом и интервалами, сохраняя читаемые
  поля и связь подписи с основным текстом; исключать пересечения и обрезку.
  Каждый кадр проверять отдельно на поля, пересечения и обрезку; варианты всей
  серии сравнивать на чрезмерно крупные или плотные выбросы. После вложенных
  композиций и перспективных трансформаций проверять видимые границы текста.
- Варианты заголовка по умолчанию собирать необходимыми текстовыми слоями или
  группами в одной общей композиции, переключая их видимость для рендера.
  Отдельную precomp на заголовок создавать только по просьбе пользователя или
  при действительно различающейся анимации; общую precomp рамки или анимации
  можно сохранить. Пункты render queue сами по себе не фиксируют активный
  вариант и не доказывают получение нужного кадра или файла.
- Проверять фактический кадр в читаемом размере и нужные фазы анимации.
  Read-back свойств не заменяет просмотр; без просмотра не заявлять визуальную
  проверку. Все существующие typed/confirmation/read-back gates сохраняются.

Общий контракт: `docs/text-layout-policy.md`; рабочие инструкции:
`mcp-server/text-layout-policy.js`.

## Plan Pattern

1. Bind the target composition with `get_active_comp`, `get_comp_details`, or an
   explicit `compName` / `compItemIndex`.
2. Normalize the reviewed alignment to one of `left`, `center`, or `right`.
3. For new generated text, run `create_text_layer` with explicit text, generated
   name when available, covered styling/timing fields, and `justification`.
4. For an existing reviewed text layer, run `get_layer_details` first, then
   `update_text_layer` with `layerIndex` and `justification`.
5. Run `get_layer_details` after mutation and verify `text.justification`
   matches the requested value.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Do not infer the text layer from prior chat context, screenshots, or untyped
  selection state.
- Do not mutate non-generated user text layers without explicit review,
  approval, and rollback protection.
- Do not use raw ExtendScript, temp-args files, broad layer scans, arbitrary
  TextDocument fields, or render queue work.

## Fail-Closed Scope

- Full justify, vertical text, paragraph box dimensions, baseline/anchor
  inference, source-exact stack placement, selection side effects, text
  animators, expression/keyframe edits, and arbitrary TextDocument fields
  require separate typed-tool contracts.
- Font-family creation-time assignment through `create_text_layer` remains out
  of scope; use `update_text_layer` with explicit `font` only after the
  generated layer identity is known and read back.
- Source temp-args wrappers, filesystem behavior, JSON output formatting, and
  hidden source defaults are not reproduced.

## Verification

- Dry-run evidence lists the target comp, text layer identity, reviewed
  justification, and unsupported TextDocument/source-exact behavior.
- Mutation uses only `create_text_layer` or `update_text_layer` with
  `justification:left|center|right`.
- Post-run `get_layer_details` shows the same generated/reviewed layer with
  matching `text.justification`.
- The plan records unsupported full-justify, font-creation, wrapper, selection,
  and source-exact behavior as typed-tool gaps instead of silently guessing.
