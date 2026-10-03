# Сводка завершения поручения

После каждого основного поручения диспетчер собирает сводку на стороне AE Agent:

```powershell
node scripts/ae-task-completion.js .codex-runtime/my-task/completion-input.json
```

Файл входа содержит серверные ID выполненных typed plans, выбранные диспетчером:

```json
{"taskId":"my-task-01","runIds":["<server run UUID>"]}
```

`taskId` относится к сохранённой задаче профиля `ae-agent`. Пустой `runIds`
допустим для поручения без typed plans; фактическое выполнение тогда неизвестно.
Список не доказывает, что представлены все планы поручения. Пути к evidence и
runtime roots не принимаются из входа: CLI использует конфигурацию AE Agent.

Модуль `mcp-server/ae-task-completion.js` и CLI читают файлы без обращения к AE,
моделям или сети. Они не исполняют планы и не выдают разрешения на повторение.
Результат JSON имеет схему `ae-agent-task-completion.v1`; exit 1 означает ошибку
входа или наличие блокеров, а не указание повторить мутацию.

## Независимые состояния

| Поле | Основание и предел |
|---|---|
| transport | Сохранённая metadata AGY: transport/task status, terminal/schema flags, artifact verification и записанные сообщения |
| execution | Записанные native outcomes только предоставленных run IDs; отдельно mutationStatus |
| technicalVerification | Native verification и semantic coverage; incomplete/unknown не повышаются до passed |
| visualAcceptance | По умолчанию not_established; явная декларация диспетчера связывается с проверенным PNG |

Metadata проверяется по task/profile/workspace. Native records и receipts
проверяются по ID, hashes и bindings; пути ограничены серверными roots с учётом
realpath. Отсутствующие, повреждённые и изменившиеся доказательства требуют сверки.
Успешный транспорт не устанавливает native выполнение.
Большой receipt проверяется через адресный API и целиком читается в его прежнем
ограниченном бюджете; в сводку попадают только нужные поля. Хеши receipt и
canonical record повторно сверяются, чтобы не смешивать разные наблюдения.
`reportedSummary` и warnings остаются записанными сообщениями с ограничением
длины; они не служат основанием для повышения статусов.

`artifacts` описывает нынешние файлы из `request.expected_artifacts`, включая
полный SHA256 и время чтения. Старое `artifactVerification` не становится свежим
доказательством изменения. Legacy metadata без доказанной пары before/after
сохраняет `changed:null`, `changeStatus:"unknown_no_before_proof"`; требование
`changed` остаётся блокером. Новый bound proof применяется только после сверки
request/path/times/full SHA и текущего файла (см. дополнение ниже).
Model `reported_outputs` не выбирает пути.

Native сведения имеют `fresh:false` и прошлое `observedAt`; generatedAt сводки
не обновляет их свежесть. `coverage:"provided_run_ids_only"` и
`completeTaskAcceptance:false` сохраняются во всех результатах. Usage остаётся
unknown; расход отдельно читается разрешёнными локальными usage tools.

## Декларация после просмотра кадров

После фактического просмотра диспетчер может добавить во вход:

```json
{
  "visualReview": {
    "taskId": "my-task-01",
    "reviewer": "dispatcher",
    "reviewedAt": "2026-10-02T12:00:00.000Z",
    "frames": [{"runId":"<server run UUID>","stepIndex":1,"sha256":"<PNG SHA256>","decision":"accepted"}]
  }
}
```

Этот объект дополняет taskId/runIds. Шаг должен быть завершённым
`save_comp_frame_png`, receipt — целым и привязанным к запуску. Нынешний PNG
в серверном export root сверяется по хешу, bytes, dimensions и завершённости.
Декларация даёт `declared_accepted` или `needs_fix` только для перечисленных кадров.
`machineProofOfViewing:false`: проверка файла не доказывает просмотр или качество
монтажа. Полное покрытие scene manifest оценивает диспетчер.

`nextAction` указывает чтение для сверки, просмотр недостающих доказательств или
кадров. Продолжать следует только независимую сверенную работу по
[монтажному контракту](montage-workflow.md); автоматического retry нет.

## Проверки

`npm.cmd run smoke:ae-task-completion` проверяет настоящий модуль и CLI в
изолированном файловом fixture: ошибки транспорта при выполненных native plans,
unknown/partial/incomplete, hashes/bindings/containment, артефакты и декларации
PNG. Хеши fixture до и после подтверждают read-only поведение. Это offline proof.

## Дополнение этапа 3 agy-bridge (2026-10-03)

`changed` может быть доказан persisted парой `agy-bridge-artifact-observation.v1`:
consumer проверяет hash исходного request, task/scope/path/root/realpath, фазу,
времена before/spawn/after/finish, полный SHA и свежий файл, совпавший с after.
Missing before, частичный SHA, чужой binding и read errors оставляют changed:null.
Наблюдавшийся отсутствующий файл до запуска может доказать создание. Утверждение
`changed` в metadata не используется без проверки пары. State остаётся локальным
неподписанным evidence; проверка не защищает от полной злонамеренной перезаписи.
Timeout/failed и независимая native/visual acceptance не повышаются.
