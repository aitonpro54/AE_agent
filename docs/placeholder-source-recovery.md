# Восстановление отсутствующих исходников

Первый этап добавляет локальный поиск кандидатов, typed-план перепривязки и независимое
контрольное чтение. Новые инструменты доступны в существующем bridge-каталоге; отдельные
элементы CEP-панели не добавлены. Выполнение использует обычные proposal/dry-run,
checkpoint/edit-session, confirmation и idempotency gates проекта.

## Контракты

`find_missing_footage_candidates` принимает явные `searchRoots` и до 250 `missingItems`
с уникальными положительными `itemId`. Для inspected элемента передаются `name`,
`originalPath` и `footageMissing`. Basename прежнего пути имеет приоритет над ручным
именем элемента AE. Кандидаты возвращают путь, имя, размер, рейтинг, причины и
`metadata`/`comparisons` с явными `unknown` для неизвестных характеристик.

Обход потоковый и ограничен:

| Параметр | По умолчанию | Максимум |
| --- | ---: | ---: |
| `maxDepth` (корень — глубина 1) | 5 | 10 |
| `maxFiles` (собранные файлы) | 2000 | 10000 |
| `maxEntries` (все просмотренные записи) | 20000 | 50000 |
| `maxDirectories` | 2000 | 10000 |

Фильтр расширений не освобождает запись от лимита обхода. Корни и файлы
дедуплицируются по каноническому пути, вложенные корни не дублируют обход. Дочерний
канонический путь должен оставаться внутри разрешённого корня; symlink/junction
не обходятся. Ошибки корней/чтения, пропущенная глубина и ссылки дают `incomplete`;
исчерпание бюджета также даёт `truncated`. Единственный найденный файл при incomplete
имеет `status: "ambiguous"` и не выбран автоматически. Несколько кандидатов всегда
остаются неоднозначными независимо от рейтинга и характеристик.

Размер измеряется filesystem stat и сравнивается с `missingItems[].expectedSize`.
`expectedMetadata` допускает width/height/duration/frameRate; сравнение возможно только
с фактически прочитанными характеристиками кандидата. По явному `probeMedia: true`
используется уже установленный `ffprobe`, без новой зависимости: `maxProbeFiles`
по умолчанию 10, максимум 25; `probeTimeoutMs` по умолчанию 2000, максимум 5000;
до 10 секунд суммарно и 256 KiB вывода на файл. По умолчанию probe выключен.
Неудача/недоступность probe оставляет медиа-поля unknown и объяснение в `probe`.

`build_source_recovery_plan` принимает до 250 запросов. Каждый содержит:

```json
{
  "itemId": 42,
  "itemIndex": 17,
  "itemName": "Принятое ручное имя",
  "currentFilePath": "D:/old/source.mp4",
  "footageMissing": true,
  "candidates": [{"filePath": "E:/media/source.mp4"}],
  "targetFilePath": "E:/media/source.mp4",
  "candidateSelectionConfirmed": true
}
```

`itemIndex` — только подсказка. Имя, прежний путь и missing-state берутся из свежего
чтения проекта; `candidates` — из актуального результата поиска для этого элемента.
Выбранный путь и подтверждение обязательны даже для одного кандидата. Пропущенные
`isAmbiguous`/`candidates` не позволяют обойти выбор. Билдер требует существующий файл
из списка, отвергает каталоги и повторяющиеся target itemIds. Он сохраняет
`expectedReadBack` как в ответе, так и внутри `plan` для последующего proposal.

План содержит relink-шаги и один заключительный `find_project_items` с точными
`itemIds`, `type: "footage"` и соответствующим `limit`. Фильтр IDs применяется перед
лимитом; адресный запрос работает для целей за пределами первых 25 элементов.

`relink_footage_source` требует `itemId`, `expectedName`,
`expectedPreviousFilePath` и `filePath`. Он разрешает FootageItem по persistent ID,
проверяет `footageMissing === true`, имя и полный прежний путь до открытия undo group.
Недоступный/null прежний файл не отключает проверку. `item.replace(new File(...))`
выполняется внутри try/finally, закрывающего undo group и при исключении. Файлы не
копируются; save/reopen не выполняются. Возвращаемый `postVerification` — локальное
наблюдение setter, которое требует независимого подтверждения.

`find_project_items` теперь возвращает для footage фактические `file`,
`footageMissing`, width/height, duration/frameRate, pixelAspect, hasVideo/hasAudio,
когда свойства доступны. Missing-флаг не приводится к boolean: неизвестное значение
не превращается в false. Форма результата остаётся `{matches: [...]}`.

`verify_source_recovery_read_back` сравнивает `expected` со свежим независимым
`observed.matches` или inspected snapshot items. Для каждой цели требуется ровно
один persistent ID, точный нормализованный полный путь, `footageMissing === false`
и ожидаемое имя, если оно задано. Невалидный expected, отсутствующее поле, дубли ID
или setter-only `{item}` дают `needs_review`. Изменившийся itemIndex допустим.

Semantic verifier использует настоящие строки последнего адресного
`find_project_items` после relink; заключительный batch read может подтверждать
несколько предыдущих relink-шагов. Он не принимает basename fallback, coercion
missing-флага, повторяющийся ID и одно лишь setter `postVerification`.

## Библиотека решений и проверки

Рецепт `placeholder-source-recovery-plan` зарегистрирован ровно один раз и доступен
через `search_solutions`/`get_solution`. Он использует `build_source_recovery_plan` и
существующий `propose_ai_agent_plan`; gates рецепта включены. Tested context —
`synthetic`, версии живых AE/CEP/bridge неизвестны (`null`).

Адресные проверки:

- `scripts/placeholder-source-recovery-smoke.js`: production scanner/scorer/builder/verifier,
  неоднозначность, лимиты, canonical escape, junction, candidate-list omission,
  дубли целей, unknown missing, настоящий optional ffprobe на синтетическом PNG.
- `scripts/placeholder-source-recovery-jsx-smoke.js`: production подготовленный JSX
  в VM, stale guards, missing/null state, throwing replace/finally, ID за пределами
  первых 25 и реальные positive/negative semantic проверки.
- `scripts/placeholder-source-recovery-bridge-smoke.js`: изолированный loopback daemon,
  актуальные schemas/tools, единственный recipe, routing helper, validation плана,
  readback; подключённой панели и AE-команд нет.

Это offline-доказательства. Живой AE/CEP и пользовательский AEP не проверялись;
произвольное медиа может оказаться несовместимым с AE. После timeout сначала читать
состояние конкретных itemIds и устанавливать применённые шаги; автоматического
повтора неизвестной мутации этот workflow не разрешает. Обычная re-inspection
перед proposal сохраняет значение: переданные клиентом evidence не являются
криптографическим подтверждением свежести.
