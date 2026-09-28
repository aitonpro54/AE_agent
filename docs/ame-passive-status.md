# Пассивное наблюдение AME

`report:ame-output` читает только локальные JSON и `stat` точного выходного файла.
Команда не обращается к Adobe Media Encoder, не отправляет job и не вызывает
модель. Она полезна для редкой проверки роста файла между двумя снимками без
постоянных UI-снимков. Наблюдение статуса AME вводится отдельно из актуального
источника; статус очереди After Effects не подходит.

Контракт job сохраняйте после подтверждённой отправки в AME:

```json
{
  "schema": "ae-agent-ame-job.v1",
  "jobId": "точный идентификатор job из AME",
  "preset": "точное имя preset",
  "outputPath": "C:\\path\\to\\output.mp4",
  "range": { "startSeconds": 0, "endSeconds": 60 },
  "submittedAt": "2026-09-28T10:00:00.000Z"
}
```

Опциональный файл `--observation` должен повторять `jobId`, `preset`,
`outputPath`, `range` и содержать `status` (`queued`, `running`, `done`,
`failed`, `canceled`) и `observedAt`. Нельзя записывать `done` на основании
роста или появления файла. Снимок с другим job, preset, destination или range
отклоняется; старое `queued/running` не считается актуальным состоянием.

```powershell
npm.cmd run report:ame-output -- --job C:\path\to\job.json
npm.cmd run report:ame-output -- --job C:\path\to\job.json --previous C:\path\to\previous.json
npm.cmd run report:ame-output -- --job C:\path\to\job.json --observation C:\path\to\ame-status.json
```

Вывод JSON можно сохранить локально как `previous.json` для следующего вызова.
`output_growing` означает только рост байтов между снимками; стабильный размер
не означает завершение. Даже подтверждённое в AME `done` переводит в
`needs_media_probe`: отдельно проверьте ffprobe, декодирование и диапазон.
`completionVerified` всегда false в этом инструменте. Он не содержит адаптер
статуса AME или автоматическую отправку, не следит в фоне и не запускает render.
