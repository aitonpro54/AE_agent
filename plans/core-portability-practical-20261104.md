# Практический перенос Core: MSI ↔ десктоп

4 ноября 2026. Исходная точка `b88c651`. По прямому поручению пользователя
довести существующий перенос между двумя Windows-машинами; облако исключено,
Titles/Slideshow остаются на паузе. Основной writer/координатор — текущий чат MSI.

## Цель и границы

Получить воспроизводимый перенос выбранного commit/состава и штатное обновление
без ручного ремонта конфигурации. Использовать существующие package/installer/
stop/update/inspect/enable; новые механизмы вводить только для доказанного
препятствия. Наличие восьми критериев P1–P8 не требует восьми новых подсистем.

## Последовательность

1. Сверить текущие средства, собрать выбранный пакет, определить доступ к
   десктопу и его фактическую среду/checkout/установку без изменений.
2. Сопоставить оба checkout и сохранить чужую работу; подготовить передачу
   выбранного кода и пакета без local state/credentials. Применить существующий
   initial-install либо owner-update по фактам целевой установки. Не выполнять
   повторную установку на MSI ради уже совпадающего package hash.
3. На обеих машинах проверить configured client и новую разрешённую typed
   read-only inspection; затем вернуть реальную инженерную дельту обратно.
   Для каждой живой операции получать свежий preflight и нужные runtime grants.
4. Выполнить только необходимые повторные/негативные проверки затронутых
   границ, сохранить bindings и единый отчёт P1–P8.

## Progress

- [x] Современный source-flow проверен read-only; источник — существующие
  `core4/tools/package-installable.js`, `package-standalone-installer.js`,
  `install-core4.js`, `maintain-owner.js`, `standalone-installer.js`.
- [x] На MSI собран manual/owner package `cdf7338f…` (80 файлов) и standalone
  `85c3d95a…` (98 хешируемых файлов); оба совпали с принятым B6 составом.
- [x] Получен configured `core_status`: MSI, cdf package, ready, без
  pending/UNKNOWN/ledger/ownership fault. CEP disconnected; native read не было.
  Это наблюдение в блоке подготовки, не бессрочная свежесть runtime.
- [x] После добавления подключения обнаружен DESKTOP-32974QF:
  `remote-control:env_e_6aaa3f0513c483209c3eb84d29674988`.
- [x] Найден существующий Core-чат «Найти следы переноса на десктоп»
  `01a186f7-9c1b-7513-a89e-cef10752eba1`, статус notLoaded, cwd Core.
- [ ] Получено прямое разрешение использовать этот чат для адресных этапов
  переноса. До разрешения сообщения туда не отправлять.
- [ ] Read-only preflight десктопа; фактический round-trip и P1–P8.

Первое конкретное поручение подготовлено в ignored файле
`.codex-runtime/portability-practical-20261104/desktop-readonly-task.txt`:
только версии, Git status, безопасные installation bindings и AE/CEP metadata;
никаких установок, запуска AE, MCP/JSX или правок.

## Decision Log

- Явно выбирать `--composition manual --runtime owner`: default builder — stdio.
- Source-приёмка 69/71 уже применима; две Titles held. Повтор всей очереди не
  нужен для неизменённых runtime/tool bytes.
- Стандартные APPDATA/LOCALAPPDATA на MSI присутствуют. Их гипотетическое
  отсутствие и явные paths standalone не объявляются причиной большой переделки.
- Десктоп подключён как хост, но прямого remote shell tool здесь нет. Доступный
  исполнительный путь — существующий remote-чат. `send_message_to_thread`
  требует прямого разрешения пользователя на отправку; чтение выполнено без неё.
- Старые ошибки плана 28 октября и прежние PID/транзакции не задают текущую
  authority. Новые startup/update операции и продуктовая разработка не запускались.

## Validation

- Build package/standalone и штатные verifiers PASS, package hashes совпали;
  production source/config/install изменений 0, новые test-suite runs 0.
- Точное evidence — [подготовительный блок](../docs/evidence/core-portability-practical-20261104.json).
- P1 подтверждён только в локальной части; P1–P8 в двухмашинном объёме остаются
  открыты. Следующий шаг — подготовленное read-only поручение на десктопе.
