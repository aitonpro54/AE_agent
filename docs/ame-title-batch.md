# Экспорт вариантов титров через AME: состояние реализации

Активный [план](../plans/ame-title-batch-execplan.md) разделяет подтверждённый
транспорт и полную цепочку экспорта. На 10.10.2026 готов только первый этап:
`inspect_ame_transport` и `list_ame_presets`. Snapshot/submit/start/status ещё не готовы.

## Доступные инструменты

`inspect_ame_transport` требует подключённой AE Agent CEP-панели и уже работающего
AME. Пример аргументов:

```json
{"targetSpecifier":"ame-26.0","timeoutMs":5000}
```

Инструмент исполняет фиксированные чтения через BridgeTalk и возвращает build
number, форматы, ограниченные метаданные API, источник и время наблюдения.
`deliveryVerified` означает совпавший ответ новой команды; `adapterReady=false`
не позволяет считать чтения приёмкой submit/start/status. Для warm-proof
передают прежний `expectedSessionNonce` и сверяют PID/время старта AME.
Подробности и exact-nonce reconciliation — [контракт транспорта](ame-transport.md).

`list_ame_presets` принимает `{}`. Он читает существующие пользовательские EPR
AME26 и системный `Settings/EncoderPresets`, не добавляя ничего в очередь.
Запись содержит canonicalPath, presetId, SHA-256, размер и mtime; имя и
format/exporter поля берутся из XML. Неизвестный format не вычисляется из имени.
Одинаковые имена остаются отдельными записями; внутренний selector требует
точный путь либо пару presetId+sha256.

`source=file_catalog`, `nativeAvailability=not_verified`: найденный EPR ещё не
доказывает его применение AME. `complete` и `issues` показывают повреждённые/
нечитаемые файлы и пределы обхода; непройденные корни не выдаются за полный каталог.

## Подтверждённое и оставшиеся границы

Один cold console запуск AME26.2.0.52 вернул JSON с boot nonce; следующий
BridgeTalk запрос получил новый request nonce и тот же boot nonce в AME PID12492
с прежним временем старта. Повторного запуска exe для warm-команды не было.
Очередь и пользовательский AEP не менялись.

Полное reflection frontend/encoderHost/batchEncoder не обнаружило публичного
перечисления всех jobs или постоянного native job ID. `stopped` не подтверждает
пустую очередь. `runBatch` может запустить чужие задания; до проверенного
ownership отправка/запуск заблокированы. Comp GUID, attemptId и output path
не являются native job ID.

AE26 показал `save`/`saveWithDialog`; публичный `Project.save(File)` соответствует
Save/Save As, а file/dirty read-only. Копия saved AEP не является snapshot
несохранённых edits. Нельзя незаметно save/reopen исходный проект. Save-copy
через native SDK требует реализации и проверки path/dirty/source bytes.

Remote AME установлен, но shipping справка описывает media/PRPROJ/FCP XML;
экспорт AEP и связь с видимой очередью пока не доказаны. Он ещё не fallback.

Источники: [Adobe BridgeTalk sample](https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/jsx/PPRO/Premiere.jsx),
[AME ExtendScript](https://ame-scripting.docsforadobe.dev/reference/),
[cold console, AME Team](https://community.adobe.com/questions-506/no-responce-from-media-encoder-via-the-command-line-996273),
[Project.save](https://ae-scripting.docsforadobe.dev/general/project/#projectsave),
[Remote AME driver](https://github.com/Brainferno/brainferno-mcp-bridge/blob/main/packages/server/src/drivers/ame-webservice.ts).

## Проверки

`smoke:ame-transport`: strict ES3/fake VM, ошибки/тайм-ауты/nonce, поздний ответ,
регистрация/runtime identity. `smoke:ame-presets`: XML fixtures, identities,
ambiguity, junction, malformed/limits/completeness. File symlink fixture
недоступна на Windows host; это пробел покрытия. Эти checks не кодируют видео.

Live M1 доказывает cold/warm транспорт и файловый каталог. Два варианта,
применение preset, кодирование, native completion и проверка outputs ещё не выполнены.
