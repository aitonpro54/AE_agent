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
  "expectedVideoCodec": "h264",
  "expectedContainer": "mp4",
  "submittedAt": "2026-09-28T10:00:00.000Z"
}
```

Опциональный файл `--observation` должен повторять `jobId`, `preset`,
`outputPath`, `range` и содержать `status` (`queued`, `running`, `done`,
`failed`, `canceled`) и `observedAt`. Нельзя записывать `done` на основании
роста или появления файла. Снимок с другим job, preset, destination или range
отклоняется; старое `queued/running` не считается актуальным состоянием.
До доверенного AME adapter эти поля остаются заявленными во входных JSON:
совпадение двух файлов защищает от смешения job, но не удостоверяет их источник.

```powershell
npm.cmd run report:ame-output -- --job C:\path\to\job.json
npm.cmd run report:ame-output -- --job C:\path\to\job.json --previous C:\path\to\previous.json
npm.cmd run report:ame-output -- --job C:\path\to\job.json --observation C:\path\to\ame-status.json
```

Вывод JSON можно сохранить локально как `previous.json` для следующего вызова.
`output_growing` означает только рост байтов между снимками; стабильный размер
не означает завершение. Даже подтверждённое в AME `done` переводит в
`needs_media_probe`: отдельно запустите:

```powershell
npm.cmd run report:ame-media -- --job C:\path\to\job.json --observation C:\path\to\ame-done.json
```

Проверка требует совпавшего `done` из AME, существующего файла, ожидаемого
`expectedVideoCodec`, `expectedContainer`, длительности `endSeconds-startSeconds` (допуск по умолчанию
0,25 с; `maxDurationErrorSeconds` в job может задать 0–1 с), успешного ffprobe
и полного декодирования video/audio через ffmpeg. Тайм-ауты 30/120 с; при ошибке
или отсутствии бинарников technical proof остаётся false. Даже при успешном
`technicalMediaVerified:true` поле `completionVerified:false`: автоматического
доверенного AME status adapter здесь нет, а визуальная приёмка отдельна.
Команды не отправляют job, не следят в фоне и не запускают render.

## Граница AME status adapter

Официальный [RenderJob API](https://developer.adobe.com/media-encoder/uxp/media-encoder-api/render-queue/render-job/)
описывает `getStatus`, `getOutputFilePath` и `getPresetName` для UXP с AME
27.0; [RenderQueue.getJob](https://developer.adobe.com/media-encoder/uxp/media-encoder-api/render-queue/)
ищет job по ID, который должен прийти из результата `enqueueFile`/`renderFile`, и
возвращает `null`, если job не найден. Это beta API. Повторная локальная проверка
28 сентября 2026: установленный `Adobe Media Encoder.exe` имеет file version
26.2.0.52 (product version 26.2.0); совместимого AME 27.x на host не найдено.
По [официальному образцу панели](https://developer.adobe.com/media-encoder/uxp/get-started/samples/render-queue-panel/)
минимум для примера — 26.5.0, что тоже выше текущей версии. Поэтому на этом host
UXP adapter не реализован и не проверен. Опубликованный `RenderJob` даёт read-only
`getStatus`, `getPresetName`, `getOutputFilePath` и `batchItemID`, но не описывает
read-back точного in/out диапазона; даже на совместимом host его нужно
подтвердить отдельным проверенным контрактом. Не подменяйте
`get_render_queue_status` After Effects статусом AME. До появления совместимого
host и точного job ID статус вводится из отдельного наблюдения; автоматический
submit и retry не добавлены.

## Offline guard от повторной отправки

`report:ame-submit-guard` не общается с AME. Перед внешней отправкой он может
атомарно сохранить локальную резервацию пути назначения. Состояние сразу
`unknown_outcome`: даже если процесс отправки упадёт до получения ответа, guard
не разрешит вторую попытку автоматически. Он хранит локальный attempt ID,
но **не создаёт и не удостоверяет AME job ID**.

Intent JSON версии `ae-agent-ame-submit-intent.v1` требует абсолютные
`sourcePath`, `outputPath`, заявленные `sourceIdentity` и `preset`, а также
`range.startSeconds`/`endSeconds`. Пример использования с уже подготовленным
`intent.json`:

```powershell
npm.cmd run report:ame-submit-guard -- inspect --intent C:\path\to\intent.json
npm.cmd run report:ame-submit-guard -- reserve --intent C:\path\to\intent.json
```

По умолчанию состояние хранится в ignored `.codex-runtime/ame-submit-guard/`;
`--state-dir` принимает другой абсолютный локальный каталог. `reserve` создаёт
файл атомарно (`wx` + `fsync`), повтор с тем же destination блокируется и при
другом preset/source/range. Повреждённый файл также блокирует повтор. CLI exit
code 0 означает только созданную локальную резервацию, 2 — запрет; это не
результат AME. Утилита не имеет команды снятия резервации и не вызывает submit.

Это проверяемый offline компонент, пока не интегрированный во все реальные
маршруты отправки AME. Поэтому сам по себе он не гарантирует, что оператор/UI
не отправит job повторно. Перед production-интеграцией нужны единый submit
маршрут, подтверждённый AME job ID, read-only сверка очереди после unknown и
отдельно проверенное правило освобождения destination. Текущий guard намеренно
оставляет сомнительный исход заблокированным.
