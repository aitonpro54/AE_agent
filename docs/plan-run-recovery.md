# Статусы запуска и чтение состояния после сбоя

`run-outcome.js` возвращает `ae-agent-run-outcome.v2`. Измерения независимы:

| Измерение | Статусы | Основание |
|---|---|---|
| `execution` | `not_started`, `completed`, `failed` | Исполнение шагов; исходная ошибка сохранена в `originalError` |
| `mutation` | `not_started`, `applied`, `unknown`, `failed` | Typed результат setter и lifecycle только его mutation-команд |
| `verification` | `not_required`, `pending`, `passed`, `failed`, `insufficient` | Независимые semantic checks; отсутствие проверки оставляет неполное доказательство |
| `coverage` | `not_required`, `complete`, `incomplete` | Охват заявленных инвариантов |
| `acceptance` | `not_requested`, `pending` | Художественная и пользовательская приёмка остаются отдельными |

Завершённые read-only команды не увеличивают количество изменений. Если setter
вернул typed результат, а последующий read-back истёк по времени, изменение имеет
статус `applied`, проверка — `pending`; исходная ошибка чтения сохраняется. Timeout
после `leased`/`submitted` без результата означает `unknown`, даже при
`executedCount: 0`. Ошибка тела setter не доказывает отсутствие частичной записи.
`failed` для изменения требует явного отказа до мутации; отменённая недоставленная
команда даёт `not_started`. Счётчики и статусы отдельных mutation-шагов доступны
в `outcome.mutation`.

## Read-only reconciliation

Чистый `reconcilePlanRun({record, freshReadSteps, commandStates, project})`
используется существующим bridge runner. `record` — сохранённая сервером запись
`ae-agent-plan-run-record.v1`: `runId`, исходный `plan`, `project.file` и полный
`run.steps` с разрешёнными args, typed результатами и lifecycle команд. Новые args
или результаты из запроса клиента не заменяют эту запись. Helper не запускает AE,
не меняет запись, не строит raw JSX и всегда возвращает `replayAllowed: false`.

`reconciliationReadRequests(record)` перечисляет точные read-only инструменты.
Bridge обрамляет их свежим `get_project_info` до и после чтения. Все сведения о
проекте должны совпасть с сохранённым путём; пропущенное, неуспешное или
противоречивое чтение проекта оставляет reconciliation незавершённым.

| Setter | Независимое чтение |
|---|---|
| `set_layer_transform`, `replace_layer_source`, `set_layer_time_range`, `update_text_layer`, `set_layer_metadata` | `get_layer_details` по `compItemId` и `layerId` |
| `set_property_value` | `get_property_value` по тем же ID, точному `propertyPath` и запрошенному `time`, если он задан |
| `set_effect_property` | `get_effect_details` по ID слоя и точному дескриптору эффекта |
| `set_comp_properties`, `set_comp_work_area`, `set_comp_current_time` | `get_comp_details` по `compItemId` |

Для каждого изменяющего шага возвращаются `mutationStatus` и
`verificationStatus`:

- `applied` / `passed` с `desired_state_confirmed`: все запрошенные поддерживаемые
  постусловия обнаружены в текущем состоянии точных целей. Это подтверждение
  текущего состояния, не доказательство истории вызова setter.
- `not_applied` / `not_required`: серверный lifecycle доказывает отсутствие
  доставки либо явный отказ до записи.
- `unknown` / `failed`: обнаружено несовпадение постусловия. Частичное изменение
  или последующая ручная правка всё ещё возможны, поэтому повтор запрещён.
- `unknown` / `insufficient`: отсутствуют ID, точная проверка, однозначное чтение
  либо сохранённая запись.

Новые объекты, import, raw JSX и неподдерживаемые операции остаются `unknown`.
Bulk без списка устойчивых ID, styling текста вне ограниченного набора полей,
work-area без явного `start` и неоднозначные property receipts не получают
ложного подтверждения. Reconciliation не проверяет художественную корректность,
не доказывает отсутствие ручных изменений между произвольными чтениями и не
является разрешением на дальнейшее исполнение.

## Semantic identity и запрет повтора

`set_layer_transform` сравнивает каждое запрошенное поле (`position`, `scale`,
`anchorPoint`, `rotation`, `opacity`) с typed результатом и отдельным свежим
`get_layer_details`. Принимаются конечные raw значения и `{kind,value}` preview;
усечённые, пустые, нечисловые или неоднозначные данные дают `needs_review`.
Правильная цель с неправильным значением даёт failed check.

Свойства и эффекты связываются по `request → setter result → independent read`
через persistent comp/layer ID. Изменение project/layer index не отменяет это
соответствие. `propertyIndex`, `name` и `matchName` остаются составной строгой
идентичностью свойства и экземпляра эффекта; их нельзя заменить одним именем.
Если setter свойства указывает `time`, независимый read-back обязан проверять
то же время. Server-attached reads учитываются из отдельного поля runner
`step.independentReadBack` с источником `server_typed_readback`; произвольный
`payload.verification.readBack` не является доказательством.
Конфликтующие либо пропущенные ID не дают success. Любая выполненная мутация без
реализованного checker оставляет aggregate semantic result `needs_review`,
включая прежний пробел для `create_null_layer`.

`autonomous-repair` требует серверное reconciliation того же run и stable ID
целей даже для нового корректирующего proposal. Уже `applied` шаги исключены из
допустимого scope. Timeout, `verification_required` и unknown не разрешают
автоматическое исправление; они ведут к чтению и остановке. Новый proposal
сохраняет обычные dry-run, confirmation, project и ownership gates.

## Проверки

`node scripts/run-outcome-smoke.js`, `node scripts/plan-run-reconciliation-smoke.js`,
`node scripts/semantic-verification-smoke.js` и `node scripts/autonomy-state-smoke.js`
проверяют реальные production pure modules: timeout после возможной записи,
timeout attached read-back, недоставленную отмену, устойчивые ID при смене индексов,
неправильные цели, строгие property descriptors, каждый transform field,
противоречивые сведения проекта и запрет повторения применённого шага. Эти тесты
не вызывают живой AE; generated JSX и изолированный daemon проверяются отдельно
интеграционными тестами bridge.
