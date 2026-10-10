# Пакетный экспорт вариантов титров через AME

Цель: одна рабочая композиция, независимые AEP-снимки вариантов, один существующий
EPR-пресет, отправка и подтверждённые статусы Adobe Media Encoder. GUI-автоматизация,
native AE render, aerender и ffmpeg как замена AME исключены. Flash исключён прямым
указанием пользователя в этой задаче. Исходный запрос — приложенный текст от 10.10.2026.

## Progress

- [x] M1: доказать структурированный программный транспорт AME, включая команду в
  уже работающем экземпляре. Только после этого выбирать основной adapter.
- [ ] M2: каталог существующих пресетов с точными путями/форматами/SHA-256 и
  разрешением одинаковых имён; безопасное сохранение независимых состояний AEP.
- [ ] M3: durable reservations до submit, связь нашего job ID с AME, один preset
  для серии, диапазон, защита чужой очереди при запуске, реальные status/progress.
- [ ] M4: offline проверки и live цепочка двух различимых тестовых вариантов;
  закрытый/открытый AME, отсутствующий/неоднозначный preset, unknown и чужая очередь.

## Decision Log

- Блок M1: `ae_scout` — read-only карта source/установки; `ae_architect` — transport
  и API границы; `ae_specialist` — scoped typed diagnostic; root — единственный
  live controller. Причина: новый транспорт и внешняя очередь требуют проверки
  системных границ; Flash явно запрещён. Один writer на ресурс, два helper slots.
- Baseline: `codex/release-3.3.1`, `a8ddb50`. Четыре ранее изменённых tracked файла
  не входят в задачу; их SHA-256 сохранены в ignored runtime до разработки.
- Пользовательский `titr_all.aep` не изменялся. Первые сведения об unsaved edits
  были историческими; live read в M1 показал `dirty=false`. Перед snapshot нужен
  новый preflight; копия saved AEP при dirty=true не фиксирует текущие edits.
- Unknown outcome запрещает повтор команды; транспортный ACK, локальный UUID и
  рост файла не заменяют native job identity/terminal evidence.
- Runtime evidence хранится в `.codex-runtime/ame-transport-probe/`; архивы и
  generated logs не добавляются в Git. Frozen intake и зависимости не меняются.

## Validation

- 10.10.2026: AME был закрыт; установлен 26.2.0.52. Один cold launch
  `--console es.processFile` выполнил read-only probe и создал nonce-bound JSON:
  `buildNumber=52`, `BridgeTalk.appSpecifier=ame-26.0`, `isBatchRunning=false`.
  AME PID12492. Этот результат пока доказывает только startup script execution.
- AE bridge: panel connected, pending/inflight=0, edit session отсутствует;
  native project identity прочитана. Мутации/сохранение AEP не выполнялись.
- M1 warm PASS: `inspect_ame_transport`, request `bd54e5cc-7673-497f-b305-b29bafad58c0`,
  новый response nonce, прежний boot nonce, тот же AME PID12492/start. BridgeTalk
  доставил команду без нового AME launch. GUI/queue/project writes=0.
- Read-only reflection AME: frontend13/host13/batch3 methods, без truncation;
  нет публичного queue-list/native-job-ID метода. `stopped` не доказывает empty.
  AE save metadata: `save`/`saveWithDialog`, saveCopy/saveAsCopy отсутствуют.
- Offline M1: transport17 groups (strict ES3/VM), presets с explicit completeness,
  review-evidence12 groups, syntax6JS/diff PASS. File symlink fixture недоступна;
  directory junction проверен. Реальный каталог:11 EPR,issues0,complete=true;
  source=file_catalog/nativeAvailability=not_verified.
- Daemon заменён только после idle/controller checks:12260, sourceSHA
  `5fe5f6f6d66e8f3901aa41b7cbbe2b2015673b6bdcf3094ef66a964862b9c29f`.
  CEP/AME/AE не перезагружались. Предшествующие четыре dirty source SHA совпадают.
- M2 snapshots и M3 submit/start/status ещё не реализованы; полный экспорт не заявляется.
