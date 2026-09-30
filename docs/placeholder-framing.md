# Placeholder Framing Helper (Этап 3)

## Назначение и архитектура

Модуль `mcp-server/placeholder-framing.js` представляет собой чистый (pure) вычислительный хелпер для расчета равномерного кадрирования (cover), строгой геометрической верификации фактического покрытия композиции и подбора свободных интервалов из того же источника при невозможности корректного кадрирования.

Хелпер является детерминированным, реализован в формате CommonJS проекта, не содержит внешних зависимостей, не выполняет мутаций в After Effects и не подменяет собой службу визуальной приёмки или раннер планов.

## Экспортируемые функции (CommonJS)

```javascript
const {
  proposePlaceholderCover,
  verifyPlaceholderCoverage,
  proposeAlternativeSourceIntervals,
} = require('./mcp-server/placeholder-framing.js');
```

---

### 1. `proposePlaceholderCover`

```javascript
proposePlaceholderCover({
  geometry,
  samples = [],
  sourceRange,
  shotBoundaries = [],
  marginPixels = 0,
  target = null,
  usage = null,
})
```

- **Требования к `geometry`**:
  - `comp`: `width` > 0, `height` > 0, `pixelAspect === 1`.
  - `source`: `width` > 0, `height` > 0, `pixelAspect === 1`, обязательные конечные положительные `duration` > 0 и `frameRate` > 0 (значения по умолчанию не подставляются).
  - `layer`: `threeDLayer === false`, `parentLayerId === null`, `rotation === 0`, `transformStatic === true`, `hasMasks === false`, `collapseTransformation === false`, `anchorPoint: [ax, ay]`.
  - Любое неизвестное/неполное поле переводит статус в `ineligible` (`eligible: false`).
- **Расчёт масштаба (Uniform Cover)**:
  $$s = \max\left(\frac{\text{comp.width}}{\text{source.width}}, \frac{\text{comp.height}}{\text{source.height}}\right)$$
  Масштаб задается равномерным вектором: $[s \times 100, s \times 100]$.
- **Границы позиции полного покрытия (Anchor-aware)**:
  Для якорной точки $a = [a_x, a_y]$:
  $$x \in [\text{comp.width} - (\text{source.width} - a_x) \times s, \; a_x \times s]$$
  $$y \in [\text{comp.height} - (\text{source.height} - a_y) \times s, \; a_y \times s]$$
- **Ограничения значимых объектов (Subject Boxes)**:
  Для каждого сэмпла и каждого прямоугольника объекта $[left, top, right, bottom]$ в пикселях исходника:
  $$x \ge margin - (left - a_x) \times s$$
  $$x \le \text{comp.width} - margin - (right - a_x) \times s$$
  $$y \ge margin - (top - a_y) \times s$$
  $$y \le \text{comp.height} - margin - (bottom - a_y) \times s$$
- **Требования к сэмплам (`samples`)**:
  - Массив объектов, длина $\le 24$.
  - Обязательные поля каждого сэмпла: `sourceTime` в полуоткрытом интервале $[0, \text{source.duration})$, `coordinateSpace: 'source_pixels'`, непустой `imageRef`, 64-значный hex-хэш `imageSha256`, содержательное непустое описание `observation`.
  - Объекты `subjects`: массив с полями `kind` (`'person' | 'face' | 'significant_subject'`), `coordinateSpace: 'source_pixels'` и валидными внутренними положительными координатами `box: [l, t, r, b]`, либо явный флаг `noSignificantSubjects: true`.
  - При отсутствии обязательных доказательств инспекции кадров возвращается статус `ineligible` или `needs_sampling`.
- **Контрольные точки сэмплирования**:
  $$\text{frameCount} = \text{round}((\text{endSec} - \text{startSec}) \times \text{fps})$$
  $$\text{offset}_0 = 0, \quad \text{offset}_{mid} = \left\lfloor\frac{\text{frameCount} - 1}{2}\right\rfloor, \quad \text{offset}_{last} = \text{frameCount} - 1$$
  Дополнительно включаются все внутренние границы планов `shotBoundaries` (массив конечных чисел $\le 12$ элементов). Допуск сопоставления сэмплов $\le 0.25 / \text{fps}$.
- **Невозможное кадрирование (`crop_impossible_for_samples`)**:
  Если пересечение границ покрытия и объектов пусто, хелпер фиксирует конфликт и подбирает альтернативные интервалы того же исходника через `proposeAlternativeSourceIntervals` на основе авторитетной карты `usage`.

---

### 2. `verifyPlaceholderCoverage`

```javascript
verifyPlaceholderCoverage({
  geometry,
  transform,
})
```

- Выполняет строгую независимую проверку фактического трансформа слоя, не доверяя сеттеру.
- **Обязательные поля `transform`**:
  - `transform.scale`: 2D массив $[s_x, s_y]$ (или положительный скаляр) с конечными положительными числами, строго равномерный ($|s_x - s_y| \le 10^{-4}$). Не заполняется из геометрии.
  - `transform.position`: 2D массив $[p_x, p_y]$ конечных чисел.
  - `transform.anchorPoint`: 2D массив $[a_x, a_y]$ конечных чисел. Строго обязателен, не подменяется значением из `geometry.layer.anchorPoint`.
  - `transform.rotation`: строго 0 ($|\text{rotation}| \le 10^{-4}$). Строго обязателен, не подменяется из `geometry.layer.rotation`.
- **Проверка покрытия 4 независимых границ**:
  $$x_{left} = p_x - a_x \times s, \quad x_{right} = p_x + (\text{source.width} - a_x) \times s$$
  $$y_{top} = p_y - a_y \times s, \quad y_{bottom} = p_y + (\text{source.height} - a_y) \times s$$
  Все 4 границы обязаны быть конечными числами и полностью покрывать прямоугольник композиции в пределах числового эпсилон $10^{-4}$ пикселя:
  - $x_{left} \le 10^{-4}$
  - $x_{right} \ge \text{comp.width} - 10^{-4}$
  - $y_{top} \le 10^{-4}$
  - $y_{bottom} \ge \text{comp.height} - 10^{-4}$
- Результат верификации: `{ eligible, covered, status, actualBounds, compBounds, holes, scale, reasons, artisticReviewPending: true }`.

---

### 3. `proposeAlternativeSourceIntervals`

```javascript
proposeAlternativeSourceIntervals({
  usage,
  target,
  mediaKey,
  sourceItemId,
  sourceDuration,
  duration,
  excludeRange,
  frameRate = 30,
  maxCandidates = 12,
})
```

- **Авторитетная карта использования (`usage` M2)**:
  - Строгие флаги: `usage.ok === true`, `usage.complete === true`.
  - `usage.sources`: массив объектов вида `[{ sourceItemId, mediaKey, duration, type }]`.
  - `usage.occurrences`: массив структурных вхождений вида `[{ target, rootCompItemId, routeLayerIds, rootRange }]`.
  - `usage.entries`: массив записей использования вида `[{ target, sourceItemId, mediaKey, sourceRange, rootRange, ... }]`.
- **Композитный идентификатор цели (`target`)**:
  - Строго составной объект `{ compItemId, layerId }` с положительными целыми числами. Сравнение только по словарю `layerId` или `name` запрещено.
  - Цель обязана иметь ровно 1 структурное вхождение в `usage.occurrences`. При 0 вхождений (фантомная цель) или > 1 (повторяющиеся/общие цели) возвращается `status: 'unsupported'`.
- **Защита от подмены исходника и длительности**:
  - `sourceItemId` проверяется на строгое соответствие `mediaKey` в `usage.sources`.
  - Длительность `sourceDuration` обязана соответствовать авторитетной длительности из `usage.sources`.
- **Учёт занятых интервалов**:
  - Объединение всех записей с тем же `mediaKey` (включая дубликаты импорта).
  - Исключение только собственных записей текущей цели (`isSameTarget(entry.target, target)`).
  - Невалидные записи (`sourceRange` с NaN или выходом за границы) вызывают отказ, а не исчезают бесследно.
  - Исключение текущего невозможного диапазона `excludeRange`.
- **Привязка к кадрам (Frame Snapping)**:
  - Строго полуоткрытые интервалы без искусственного допуска на перекрытие или выход за пределы свободного участка.
  - Начало кандидата привязывается вверх к началу кадра: `candStart = Math.ceil(fStart * fps) / fps`.
  - Кандидат генерируется только если `candStart + duration <= fEnd` строго.

---

## Гарантии разделения проверок

1. **Геометрическая полнота $\neq$ художественная приёмка**:
   Флаг `artisticReviewPending: true` сохраняется во всех результатах предложений и верификаций. Никакой JSON, статус `covered` или наличие сгенерированного PNG не объявляет кадр художественно приемлемым без независимого визуального ревью.
2. **Безопасность метаданных и приватность**:
   Модуль работает с локальным `canonicalMediaKey`. Внешний манифест для визуального ревью использует хэш `sourceKey = sha256(canonicalMediaKey)` без передачи полных путей к файлам.

---

## Команды валидации для Codex / Root

```bash
# Синтаксическая проверка
node --check mcp-server/placeholder-framing.js
node --check scripts/placeholder-framing-smoke.js

# Запуск smoke-тестов хелпера (13 реалистичных сценариев)
node scripts/placeholder-framing-smoke.js

# Запуск независимого регрессионного набора (35 граничных проверок)
node scripts/placeholder-framing-boundary-smoke.js
```

Для sampling используется `geometry.comp.frameRate`, если он передан; иначе
частота источника из исходного pure-контракта. Интеграция всегда передаёт
свежую частоту целевой композиции, совпадающую с frameReview builder.
В alternatives `frameRate` задаёт минимальный media frame, а отдельный
`samplingFrameRate` — сетку начала фрагмента и контрольные времена композиции.
Это сохраняет совместимость с frame boundaries существующего builder. Неизвестная
частота не подменяется 30 fps. Даже малое превышение media duration запрещено.
Все внутренние известные shot points обязательны, включая точку у конца
фрагмента; превышение лимита даёт отказ вместо усечения списка.
Неизвестный media key или неподдерживаемый тип источника не предоставляют
свободных альтернатив. Sample times всегда находятся внутри candidate range;
фрагмент короче одного контрольного кадра не предлагается.
