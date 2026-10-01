# Учёт использованных фрагментов исходников и групп (Placeholder Usage)

## Назначение

Модуль `mcp-server/placeholder-usage.js` представляет собой независимый чисто вычислительный хелпер (Этап 2) для:
1. Построения точной карты использования исходных медиа (`buildSourceUsageMap`) по снимку композиций After Effects с учётом вложенных прекомпозиций, клиппирования таймлайна, структурных вхождений слоёв до отсечения длительности медиа, авторитетного индекса источников и жестких ограничений бюджета графа.
2. Проверки предлагаемых назначений для плейсхолдеров (`checkPlaceholderAssignments`) на отсутствие пересечений временных интервалов, соблюдение требования уникальности музыкальных групп/исполнителей, соответствие авторитетному индексу источников и недопустимость разделяемых (shared) плейсхолдеров.
3. Формирования канонического устойчивого ключа источника (`mediaKeyForSource`), объединяющего дублирующие импорты одного и того же физического файла.

Модуль не производит мутаций в проекте After Effects, не выполняет вызовов сторонних подпроцессов и не сохраняет внешнее состояние.

---

## Экспортируемый контракт

```javascript
const {
  buildSourceUsageMap,
  checkPlaceholderAssignments,
  mediaKeyForSource
} = require("./placeholder-usage.js");
```

---

## 1. Канонические ключи медиа и лексический разбор путей (`mediaKeyForSource`)

Формирует устойчивый строковый идентификатор медиафайла вида `file:<canonical_path>`.

### Единый идемпотентный парсер (`parseAndNormalizePath`)
- **Формат ключа**: `file:<lexical_path>` для диска Windows/POSIX и отдельный префикс `file:unc://` для UNC (например, `file:c:/projects/media/clip_01.mp4`, `file:unc://server/share/video.mp4`, `file:/posix/media/clip.mp4`).
- **Схемы URI и сетевые пути**:
  - `file:///C:/projects/...`, `file://localhost/C:/...` и `file:/C:/...` нормализуются к `file:c:/projects/...`.
  - UNC-пути (`\\server\share\...` и исходные URI `file://server/share/...`) нормализуются к `file:unc://server/share/...`. Префикс канонического ключа отличается от URI, поэтому выбор декодирования однозначен.
  - `file://server/share/a%20b.mp4` и `\\server\share\a b.mp4` получают один ключ `file:unc://server/share/a b.mp4`; URI `file://server/share/a%2520b.mp4` соответствует буквальному имени `a%20b.mp4`.
- **Селективное декодирование URI и сохранение байтов процентов**:
  - `decodeURIComponent` вызывается **один раз только для исходного URI**: `file:///...`, `file://localhost/...`, `file:/C:/...` и `file://server/share/...` (включая имя сетевой шары).
  - В «сырых» путях операционной системы (например, `C:\Media\a%2520b.mp4` или `C:\Media\a%20b.mp4`) и в уже сформированных канонических ключах знаки процента сохраняются буквально. Это исключает повторное декодирование (`%2520` -> `%20` -> ` `) и ложные совпадения псевдонимов.
  - Канонические ключи `file:c:/...`, `file:/posix/...` и `file:unc://...` идемпотентны. Форма `file://...` всегда трактуется как исходный URI; переданные старые UNC-ключи этой формы с буквальными процентами следует заменить на `file:unc://...`.
  - Авторитетный индекс `usage.sources`, интервалы `usage.entries`, сопоставления групп и заявленный ключ назначения используют один канонизатор.
- **Сегменты точек и слэши**:
  - Все обратные слэши `\` приводятся к `/`, множественные слэши нормализуются.
  - Точечные сегменты (`.` и `..`) разрешаются лексически без выхода выше корня диска или сетевой шары.
- **Чувствительность к регистру**:
  - Windows-пути с буквой диска и UNC-пути нечувствительны к регистру и приводятся к нижнему регистру (`toLowerCase()`).
  - POSIX-пути (начинающиеся с `/`) чувствительны к регистру, исходный регистр символов сохраняется.
- **Только абсолютные явные пути**:
  - Относительные пути (например, `media/clip.mp4`, `./clip.mp4`) отклоняются, функция возвращает `"unknown"`.
- **Ограничение лексического пути (Lexical Path)**:
  - Функция выполняет строго детерминированный лексический разбор пути без вызова `fs.realpath` или чтения физических inode операционной системы. Символические ссылки (symlinks) и жесткие псевдонимы файловой системы на этом уровне неизвестны.

---

## 2. Построение карты использования (`buildSourceUsageMap`)

```javascript
const usage = buildSourceUsageMap({
  inventory,
  roots,
  groupMappings,
  maxNodes,
  maxDepth
});
```

### Входные параметры
- `inventory` (`object`, обязательный):
  - `complete` (`boolean`): должен быть строго `true`. При `complete: false` возвращается `{ ok: false, complete: false, reason: "inventory_not_complete" }`.
  - `comps` (`Array<Comp>`): список композиций. `itemId` должны быть уникальны и не пересекаться с `sources`.
  - `sources` (`Array<Source>`): список элементов проекта. Для `footage` проверяется наличие `file` и `duration > 0`.
- `roots` (`Array<{ compItemId: number, range?: [number, number] }>`, обязательный): список корневых композиций.
- `groupMappings` (`Array<GroupMapping>`, опциональный): подтверждённые сопоставления групп (`confirmed === true`).
- `maxNodes` (`number`, по умолчанию 5000, предел 20000): жесткий лимит на количество обрабатываемых узлов графа (композиции + каждый анализируемый слой).
- `maxDepth` (`number`, по умолчанию 10, предел 50): предел глубины вложенности прекомпозиций.

### Выходная структура `usage`
```javascript
{
  ok: boolean,
  complete: boolean,
  entries: Array<{
    mediaKey: string,
    sourceItemId: number,
    sourceRange: [number, number],
    rootCompItemId: number,
    rootRange: [number, number],
    routeLayerIds: Array<number>,
    target: { compItemId: number, layerId: number },
    groupId: string | null
  }>,
  occurrences: Array<{
    target: { compItemId: number, layerId: number },
    rootCompItemId: number,
    routeLayerIds: Array<number>,
    rootRange: [number, number]
  }>,
  sources: Array<{
    sourceItemId: number,
    mediaKey: string,
    duration: number | null,
    type: string
  }>,
  groupMappings: Array<{
    mediaKey: string,
    groupId: string,
    provenance: string,
    confirmed: true
  }>,
  unsupported: Array<object>,
  scope: object,
  reason?: string
}
```

### Авторитетный индекс источников (`usage.sources`)
- Содержит все элементы `inventory.sources` с их каноническими `mediaKey`, длительностями и типами.
- Позволяет сопоставлять несколько импортов одного и того же файла (одинаковый `mediaKey` при разных `sourceItemId`).

### Структурные вхождения слоёв (`usage.occurrences`)
- Фиксируются для каждого посещённого слоя в активном временном окне **до** отсечения по длительности медиафайла.
- Позволяет обнаруживать слои прекомпозиций, на которые ссылаются повторно, даже если их текущее видео лежит вне диапазона длительности исходника (offmedia).

### Происхождение групп (Group Provenance)
- Разрешены только значения `provenance`: `"explicit_metadata"` и `"user_confirmed"`.
- В `mediaMetadata` источника:
  - `user_confirmed` требует строгого `confirmed === true`. При отсутствии флага или `confirmed: false` сопоставление отклоняется как неподтверждённое.
  - `explicit_metadata` принимается как доверенные метаданные (если `confirmed !== false`).
- Во внешних `groupMappings`:
  - Требуется строго `confirmed === true`.
- Любые конфликтующие привязки одного `mediaKey` к разным `groupId` делают карту неполной (`conflicting_group_mappings`).

---

## 3. Проверка предлагаемых замен (`checkPlaceholderAssignments`)

```javascript
const result = checkPlaceholderAssignments({
  usage,
  assignments,
  constraints
});
```

### Входные параметры
- `usage` (`object`): результат `buildSourceUsageMap`. Обязан содержать `ok: true`, `complete: true`, а также массивы `entries`, `sources` и `occurrences`.
- `assignments` (`Array<Assignment>`): непустой массив предлагаемых замен:
  ```javascript
  {
    target: { compItemId: number, layerId: number },
    sourceItemId: number,
    mediaKey?: string,
    sourceRange: [number, number],
    groupId?: string
  }
  ```
- `constraints` (`object`):
  - `distinctGroups` (`boolean`, по умолчанию `true`): требование разных групп для плейсхолдеров.
  - `disallowSourceOverlap` (`boolean`, по умолчанию `true`): запрет пересечения временных интервалов одного медиа.
  - `selectedTargets` (`Array<{ compItemId, layerId }>`): список заменяемых слоёв.
  - `groupMappings` (`Array<GroupMapping>`): дополнительные сопоставления групп.

### Правила проверки и выявление коллизий

1. **Авторитетная валидация источников**:
   - `assign.sourceItemId` обязан присутствовать в `usage.sources`. Несуществующие идентификаторы вызывают ошибку `unknown_source_item`.
   - Если в `assign.mediaKey` передан ключ, он сверяется с авторитетным `mediaKey` из `usage.sources`. Несоответствие регистрируется как `source_media_mismatch` (защита от подделки ключа медиа).
   - Проверка длительности (duration clamp): `assign.sourceRange[1] <= source.duration`. Превышение длительности файла фиксируется как `source_range_exceeds_duration`.

2. **Проверка целевых слоёв и разделяемых прекомпозиций**:
   - Слой `assign.target` обязан присутствовать в `usage.occurrences`. Обращение к отсутствующему слою бракуется как `target_not_found`.
   - Если целевой слой присутствует более чем в одном вхождении (`targetOccurrences.length > 1`), фиксируется `unsupported_shared_placeholder`.

3. **Слияние групп без скрытого перезаписывания**:
   - Внешние `constraints.groupMappings` объединяются с `usage.groupMappings`.
   - Если переданное сопоставление противоречит подтверждённому сопоставлению из карты использования, регистрируется `conflicting_group_mappings` без молчаливой перезаписи.

4. **Строгие полуоткрытые интервалы без округления**:
   - Интервалы $[start, end)$ проверяются строго: смежные отрезки $[0, 5)$ и $[5, 8)$ не пересекаются.
   - Любое реальное пересечение (включая доли микросекунды) фиксируется как `source_interval_overlap` (внутри пакета или с существующими слоями проекта).

---

## 4. Ограничения

1. **Лексическое сопоставление файлов**:
   - Определение псевдонимов выполняется по лексическому нормализованному пути. Символические ссылки файловой системы на один и тот же файл с разными именами без доступа к файловой системе не объединяются.
2. **Неподдерживаемые деформации времени в композициях**:
   - Слои с включенным Time Remapping (`timeRemapEnabled: true`) или стретчем (`stretch !== 100`) помечаются как `unsupported_time_remap` / `unsupported_stretch`.
3. **Разделяемые слои в прекомпозициях**:
   - Слой прекомпозиции, используемый в нескольких местах мастер-композиции, отклоняется при попытке назначения плейсхолдера (`unsupported_shared_placeholder`), так как замена затронет все экземпляры сразу. Требуется предварительное дублирование прекомпозиции.
4. **Чистый хелпер**:
   - Модуль выполняет только валидацию и расчёт карты использования. Применение замен к слоям AE и фиксация транзакций выполняются вызывающим кодом через соответствующие typed tools.
