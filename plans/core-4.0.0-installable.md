# Core4 — создание устанавливаемого runtime на MSI

## 7 ноября. Core 4.1.2, фото-плейсхолдеры и Slideshow

### Progress

- Ветка `codex/ae-agent-core-4.1.2` создана от принятого `c88e225`.
  Локальная правка `AGENTS.md` сохранена.
- Первый состав `manual-titles-variants/owner` версии 4.1.2 включает штатную
  доставку `photo-placeholder / replace-source`. На MSI установлены пакет
  `5077800531609f9281238a4a4384e25b957733a1942447eb70e52873fd1324c8`
  и standalone
  `916fd0182814336b8d813dbf892a2bf837ceab0d7ba02529743a16cbb924d98d`
  на 125 файлов. Update `9aea9ce1-129f-4776-ba4b-3c42c30c465d` включён.
- После приёмки фото на MSI и DESKTOP-32974QF следующий этап — S1 из
  [плана внешних продуктов](external-products-titles-20261029.md#очерёдность).
  Затем один согласованный сценарий на рабочей копии реального AEP на
  десктопе. Тег 4.1.2 следует за приёмкой.
- Нативная замена принята на MSI и DESKTOP-32974QF. Десктоп независимо
  воспроизвёл пакет и standalone из `c02454e`. Коммит `1763c44` уточняет
  проверки состава установки. Хеши дистрибутива совпадают для обоих коммитов.

### Decision Log

- Установленный 4.1.1 публиковал контракт `replace-source`, а реестр CEP
  не содержал его исполнителя. Точное чтение в отдельном AEP отказало до
  появления физической команды. Сохраняется прежний маршрут модуля с доверенным
  lifecycle. Установленный ручной маршрут сверяет текущую рабочую сессию Core
  и сохранённый AEP, проводит checkpoint и нативное подтверждение.
- Первый профиль ограничен разблокированным статичным 2D-слоем и файловым
  still с совпадающими габаритами и pixel aspect. Снимок фиксирует трансформации,
  тайминг, порядок слоёв и свойства соседей, которые сверяются после замены.
  Нативная проверка выполняется на двух местных JPEG одинакового размера.

### Validation

- MSI, исходники. 167 адресных тестов прошли. Проверены модуль фото,
  скомпилированный ES3-реестр, установка, capability supply, клиент и CEP.
  Проверка границ прошла для 64 файлов. Дополнительный прогон выбранных
  зависимостей по `validate-diff` ведётся отдельно.
- MSI, установка. После stop/update/enable сверены установка и 11 защищённых
  файлов, включая журналы и исходный AEP. Свежий настроенный MCP подтвердил Origin
  `file://`, прочитал тестовый проект в AE 26.3x87 и освободил lease.
  В композиции `photo-old` (3) видимый слой 16 и скрытый контрольный слой 15.
  Привязка к стенду завершилась по исходному ID остановки
  `9ccd1a9b-63ea-4d17-a358-e4b22b46eaf4`. Первый readopt-inspect потребовал
  сертификацию остановки. После enable первый клиент не дождался старта
  owner. Свежий клиент подключился к уже поднятому владельцу.
- MSI, нативный проход. Один `replace-source` заменил `photo-old.jpg` (1)
  на `photo-new.jpg` (2) в слое 16. Цель сверена в AE и подтверждена.
  Команда `command-8aea5f02-97f5-4ba1-9659-c98af5226505` получила
  `succeeded`. Исходная квитанция совпала со свежим снимком. Оба источника
  3840×2400, pixel aspect 1. Сохранились трансформации, интервал
  0–2.002002002002 с, порядок и свойства скрытого слоя 15. Кадр в композиции
  на `00:00:00:00` показал новое изображение. Рабочий AEP сохранён, SHA
  `9fa71f3b…`, исходная копия сохранила `857897b9…`. Lease освобождён,
  pending/UNKNOWN/fault отсутствуют.
- MSI, отрицательная проверка. Чтение с устаревшим `sessionId` остановилось
  до отправки в CEP. Для точного пути соседнего AEP исходное чтение
  `inspect-9c4ef240-69fc-4e14-bfcf-843fadb58ddf` получило durable
  `inspection_failed`. Внешний ответ owner был `owner_outcome_uncertain`.
  Исход установлен по журналу, физический UNKNOWN отсутствует. Локальные
  квитанции MSI находятся в `.codex-runtime/photo-source-msi-20261107/`.
- DESKTOP-32974QF, исходники и установка. Прошли 65 адресных тестов и проверка
  границ 64 файлов. Совпали package и standalone SHA-256. Обновление
  `db29eddc-115f-4b95-a04c-6693674e1465` включено. Свежий настроенный клиент
  подтвердил 4.1.2, Origin `file://` и нативное чтение стенда.
- DESKTOP-32974QF, нативный проход. Команда
  `command-56fb2ef6-ab37-465a-b10d-f4c858b04456` заменила источник 1 на 15
  в слое 14 композиции 2 и получила `succeeded`. Исходная квитанция и новое
  чтение совпали. Интервал 0–50 с, трансформации, порядок и скрытый слой 16
  сохранены. Устаревшая сессия отклонена до CEP. Кадр `00:00:00:00` проверен,
  рабочая копия сохранена, исходная сверена побайтно. Lease освобождён, журналы
  settled, pending/UNKNOWN/fault отсутствуют.
  [Квитанция и ход проверки](codex://threads/01a186f7-9c1b-7513-a89e-cef10752eba1).

## 7 ноября. Первый Slideshow на MSI

### Progress

- [Внешний Slideshow S1](../products/slideshow/README.md) готовит задание,
  двухшаговый план подстановок и планы постановки и снятия задания рендера.
- MSI воспроизводит установочный состав `manual-titles-variants/owner` 4.1.2.
  Package SHA-256 `c3f3cab153fbc09548b534bb826d9768aa8a6ec2bf7e6867b42488d07456b6f7`.
  Standalone SHA-256 `859409c37b02fdb598e5bb2406682805d732e4aa1df84fabe49c3276937b1643`.
  Проверено 125 файлов по manifest. Дистрибутив лежит в
  `.codex-runtime/slideshow-s1-msi-20261107/standalone/`. Архив
  `core-4.1.2-s1-standalone.zip` распакован и сверён с manifest, SHA-256
  `925bf8d22de32733c27e83492732e2113c4b3e1749de276da0613bdee1e0b3f7`.
- Перенос S1 и нативная приёмка на DESKTOP-32974QF отложены по уточнению
  пользователя. Рабочий проект десктопа и тег выпуска относятся к следующему
  разрешённому этапу.

### Decision Log

- Пилот использует одну мастер-композицию и два вложенных статичных фотослота
  в собственной копии AEP. Шаблон, порядок и тайминг задаёт продукт. Core
  исполняет только `replace-source` и очередь `comp-render` с текущей
  видимостью слоёв. Код продукта и медиа находятся вне runtime.
- Core ставит и снимает задание. Запуск проверенной одиночной строки остаётся
  нативным действием в AE. Синхронный рендер через CEP ранее терял окно ответа
  после кодирования. [Наблюдение на MSI](titles-end-to-end-msi-20261105.md#очередь-ae-и-медиа).
- При контролируемой отмене второго слота первый остался применён. После
  истечения lease свежий клиент получил исходные квитанции, подтвердил
  состояние и продолжил в том же workflow с новой задачей. Первый слот
  перечитан, физически отправлен только второй.

### Validation

- MSI, исходники. Прошли 5 тестов Slideshow и 86 адресных тестов Core,
  включая целевые проверки `comp-render`, реестра CEP и ручного runtime.
  Проверка границ охватила 64 файла. Повторная сборка совпала по обоим хешам.
  Dry-run из другого cwd подтвердил пакет и завершился до записей.
  Дополнительный широкий прогон закрыт после длительного `stopped-update`.
  Проверка отказа при смене inode, pin, actor или gate, отмеченная там как
  сбой, прошла при отдельном запуске. Результаты выше относятся к адресному
  срезу, полная проверка выпуска остаётся открытой.
- MSI, установка. `owner-update` и `update-enable` по транзакции
  `4b5659c3-36aa-40f3-82d0-d3541844284d` завершены. Привязка рабочей копии
  завершена по ID `09d9cf81-1c96-4d93-8ee6-42be79e16a4d`. Свежий configured
  MCP прочитал сохранённый AEP через `file://`. Архив шаблона и медиа
  совпали по SHA-256 до и после, исходник AEP `627c7461…`.
- MSI, нативный проход. Постановка
  `command-8524f56a-8370-4a0b-a713-c109b548619e` и снятие
  `command-5b5f461d-50c4-4139-8e6f-8e056c1b72af` получили `succeeded`.
  Физический рендер одного задания дал `DONE`. После очистки и сохранения
  свежий MCP прочитал мастер 29, оба слота и пустую очередь. Lease освобождён,
  pending/UNKNOWN/fault отсутствуют. Рабочий AEP `977492c2…`.
- MP4 `40e7598479e6f4a58a45adc2b5107e973f3cc5ebf40e1caee3ff572d6b31101a`
  декодирован независимо. 3840×2400, 90 кадров, 30000/1001 fps, 3,003 с,
  H.264, один видеопоток. Кадры 10, 45 и 75 просмотрены, порядок A → B и
  переход сверены с обеими картинками. Квитанции, исходный и рабочий AEP,
  кадры и MP4 лежат в `.codex-runtime/slideshow-s1-msi-20261107/`.
  [Сценарий и проверки продукта](external-products-titles-20261029.md#7-ноября-slideshow-s1-на-msi).

## 7 ноября. Перенос Core 4.1.1 на десктоп

### Progress

- На GitHub опубликована ветка `codex/ae-agent-core-4.1.1`. Исходный коммит
  переноса `835e6854cc1f69621174f48c017efe4676edba82`. Тег `v4.1.1`
  закрепляет первоначальный выпуск.
- DESKTOP-32974QF собрал `manual-titles-variants/owner`. Пакет
  `27a17e9f5391f8f7a0bb839f15fa6e812d7e44fc82bd86450558554b86f0c289`
  и standalone `1d0072e92194473c92ddede1bc5b5a9c0f941885931c20b6951633d40e000db5`
  на 124 файла совпали с MSI. Штатное обновление с `1f8c…`, остановленная
  инспекция и enable завершены для `b79fa1d3-c9d8-4ebc-a1c2-cea77efec259`.

### Decision Log

- Код передан через Git. Исходная ветка десктопа, локальная установка,
  журналы и соседняя конфигурация сохранены. Для приёмки подготовлен отдельный
  локальный AEP. Оригинальная команда с `UNKNOWN` остаётся в истории.
- У AME два разных задания. Первый локальный пресет создал MOV, а оператор
  вернул `media-unverified`. У отдельного второго задания выбран системный
  H.264 MP4-пресет и новый выход.

### Validation

- Адресные тесты на десктопе 66/66. После обновления свежий клиент из
  effective MCP config подтвердил `file://`, прочитал пустой проект AE
  26.3x87 и освободил lease. Прежний префикс receiver и 20 долговременных
  файлов совпали побайтно.
- AME `bf0ca020-606a-4942-a139-9d5fbc7527a4` получил `done`. MP4 имеет
  SHA-256 `8411918eed3f7b5c32042dcce312c9b83311ce177a6256bd6b40502d968aa1c0`.
  Общий `batch.xml`, 62 выходных пути, четыре существовавших выхода и watch
  folders сверены. AME переписал байты `AMEPrefs.xml`, привязки профиля совпали.
- При инспекции сохранённого тестового AEP receiver зафиксировал `UNKNOWN`
  для `inspect-88d53899-9a1a-4771-8e81-35a9e83dd2b2`. Журнал из 9 записей и
  тестовый AEP совпали по хешам после попытки восстановления. Компьютерный
  инструмент не принял нажатие «Начать заново» в отдельном процессе CEP.
  После ручного нажатия сброс `c8b667e9-04eb-4526-bb86-018b028165d8` достиг
  `ready`, все 9 записей сохранены побайтно в архиве, исходный AEP сохранён.
  Свежий клиент подтвердил `file://`, прочитал baseline и освободил lease.
  Нативное чтение `text-variant` нашло подходящий 3D-слой 13 в comp 1 в
  отдельной копии. Последующее создание варианта подтверждено ниже.
  Квитанции на десктопе
  в `.codex-runtime/core411-desktop-transfer-20261107/`.
  [Ход приёмки на десктопе](codex://threads/01a186f7-9c1b-7513-a89e-cef10752eba1).

### Первичная привязка AE для состава Titles

- Старый `adopt-host.js` отклонял действующий расширенный CEP на
  `installation_cep_bytes` до чтения witness. После побайтной сверки release
  оператор берёт проверку дескриптора и CEP из этого же установленного release.
  Сверка процесса, точного AEP и локальное подтверждение действия сохраняются.
- Все 48 тестов установочного runtime и 63 проверки границ прошли. Проверены
  прежний состав, `manual-titles-variants/owner`, подмена CEP и повреждённый
  runtime. На установленном MSI проверка дошла до чтения намеренно
  отсутствующего witness. SHA пакета `27a17e9f…` и установщика `1d0072e9…`
  совпали с предыдущей сборкой. Изменение поставляется через Git.
- Десктоп получил `946c3f3` fast-forward. Оператор привязал AE 30360 к
  `desktop-advanced3d-after-recovery.aep`. Stop/resume
  `ce88f169-5cb6-41e9-8179-3c48ed12a157` завершён. Свежий MCP подтвердил
  `file://`. Один `preserveAdvanced3D` получил `succeeded`. Исходная
  квитанция и свежее чтение совпали. В comp 1 слой 14 видим и сохраняет
  3D-профиль слоя 13, который скрыт.
- Тестовый AEP сохранён с пустой очередью рендера. PNG 720×1000 на
  `00:00:00:00` декодирован и просмотрен, SHA-256 `ed11245f…`.
  Исходный AEP и архив `UNKNOWN` совпали побайтно. Core `ready`, lease
  освобождён, активных ошибок и незавершённых команд нет.
  Итоговая квитанция на десктопе `adoption-titles-final-safe.json`.

## 6 ноября: пилот модульности на MSI

### Progress

- Состав `manual-titles-variants/owner` из `9b2a04b` установлен на MSI и
  включён. Пакет `23d2a039eef72ae4390f8fe6fd78ce230973b68594c6c184193037ddae2c5c3f`,
  Core `4.1.1`. Две сборки standalone по 124 файла дали одинаковый хеш
  `41d514bf4da5481d834fbd95166ab6ed7844732d4ff02bbc3570222c695a6df2`.
- Штатная остановка `18d1f15e-80fd-4b18-a42e-c47161cc9311`, обновление и
  включение `801bf530-8517-4fdc-a1d9-2f53a17eaa8b` завершены.

### Decision Log

- Dry-run подтвердил целевую установку MSI и проектную настройку MCP. В ней
  изменился путь к клиенту нового пакета. Пользователь ограничил обновление MSI.
- Открытая CEP-панель сообщила `installation_binding` после замены пакета.
  Переоткрытие панели в том же процессе AE 32632 восстановило подключение.
  Клиент в текущем чате сохранял прежнюю привязку и возвращал `owner_unavailable`.
  Нативная проверка выполнена свежим MCP-клиентом из действующей настройки Codex.

### Validation

- Верификатор сверил 106 файлов Core и 7 файлов CEP, включая декларацию состава
  и параметры проверки рендера. Сохранились installationId, origins, adoption,
  рабочий сеанс, ledger и глобальная настройка. Receiver 53 → 55, прежний префикс
  совпал побайтово, добавлены только `begin` и `complete` одного чтения.
- Новый owner 15160 подтвердил `file://`, восемь операций в каталоге и контракт
  `comp-render`. `project-inspection` прочитал текущий пустой несохранённый
  проект в AE `26.3x87`, квитанция `observation-6ca17b03-66a9-445e-9f18-df460f79e1b0`.
  Lease освобождён, pending/UNKNOWN/fault отсутствуют. PID и время старта AE
  до и после совпали. Объём нативной проверки ограничен чтением.
- Квитанции и сверка в `dist/core4/4.1.1-msi-modularity-20261106-170828/`.

## 6 ноября: публикация Core 4.1.1 на MSI

### Progress

- Core, MCP и CEP подняты до `4.1.1` в `cca1b0d` поверх принятого Titles.
  Ветка публикации `codex/ae-agent-core-4.1.1`, тег `v4.1.1`.
- Установлен и включён `manual-titles-variants/owner` с SHA-256
  `a7caf4dcd43348338ef286507550602fc81f7d0379cf4393a96dcba4e6ed8573`.
  Stop `bc45144d-2713-4d07-8f11-80e06024d674` и update
  `35c8b85d-9b86-4328-ba2b-03ceb2856bfd` завершены. Панель открыта и показывает
  «Канал Core 4.1.1 готов к командам».

### Decision Log

- Сохранены стабильный CEP ID и версии модулей. Установщик распознаёт
  исторические пакеты 4.0.0 и 4.1.0. Ветка и тег 4.1.0 сохраняют историю.
- В открытом AEP есть несохранённые изменения. CEP переоткрыт в текущем AE
  26160. Заголовок внутри панели и установленный manifest показывают 4.1.1.
  Меню Extensions и вкладка текущего процесса сохранили закешированную
  подпись 4.1.0 до следующего запуска AE.

### Validation

- Две сборки по 122 файла совпали по SHA-256 standalone
  `163ebaf91840ec2ec77f3e715b4f7778b7bc48ae333bd81c5fbe8098230ee58b`.
  Пройдены проверка XML, синтаксис CEP и 63 проверки границ. Штатный dry-run
  прошёл с проектным `.codex/config.toml`. Первая попытка с глобальным TOML
  отказала до записи.
- Сверены 104 файла пакета и семь файлов установленного CEP. Штатный update
  изменил только путь к пакету в проектном MCP config. `installationId`,
  origin, adoption, AEP, глобальный config и исходные журналы сверены по
  байтам. В receiver добавились две записи нативного чтения с прежним префиксом.
- Свежий клиент из effective config объявил MCP 4.1.1. Через `file://` прочитан
  открытый AEP, comp 4193, слои 9200 и 4208, квитанция `observation-e4a873d6…`.
  Lease освобождён, pending/UNKNOWN/fault отсутствуют. У клиента, уже
  загруженного в этом чате, наблюдался `owner_unavailable` после смены пакета.
  Логи MSI в `dist/core4/4.1.1-msi/`.

## 5 ноября: публикация Core 4.1.0

### Progress

- Основная версия Core — `4.1.0`. Исходная точка — `b6055dc`, принятый итог P1–P8 для предыдущего пакета 4.0.0. Ветка публикации — `codex/ae-agent-core-4.1.0`, тег — `v4.1.0`.
- Версию подняли в установочном пакете, MCP и CEP. Имя в меню и внутри панели — **AE Agent Core 4.1.0**.
- На MSI установлен и включён пакет `3de578fb…` из коммита `3c9ab4a`. Штатные операции `stop eb5ce711…` и `owner-update f110dc6c…` завершены. Панель оставлена открытой и подключённой.

### Decision Log

- ID расширения `com.codex.aeagentcore4` сохранён для обновления существующей панели. Форматы пакета и протоколов, версии модулей и их контракты сохранены. Установщик и операторские проверки распознают пакеты 4.0.0 для совместимости с прежними установками и историей.
- Публикация исходников идёт в отдельной ветке Core; общий GitHub `main` продолжает существующую историю репозитория.
- По поручению пользователя фактическое обновление выполнялось только на MSI. Десктоп остаётся на 4.0.0 до отдельного этапа.

### Validation

- `manual/owner`: SHA-256 пакета `3de578fb5e53cb7cb9e8dd99e29a48808745a5011834b6510a83d28e9760b295` (80 файлов); SHA-256 standalone `f0d6ae84ecc1e531774b0575aa2ef13408db17ea240eb8a0d7e37a96e120e915` (98 файлов). Повторная сборка в другой выходной каталог и standalone dry-run из другого рабочего каталога прошли.
- В TEMP проверен `stopped-update` с точного принятого пакета 4.0.0 `1f8c6c14…` на 4.1.0. Сохранились `installationId`, пути CEP/state, обе записи origin и барьер остановки. В manifest установленной в TEMP панели прочитано новое имя. Проверен также переход с точного исторического пакета `f54863db…`, с сохранением UNKNOWN и проверкой позднего ACK.
- На MSI подтверждены 80 файлов runtime, 7 файлов CEP, прежние `installationId` и пути, прежние журналы и один точный переход пути пакета в MCP config. `Window → Extensions → AE Agent Core 4.1.0` открыт в AE `26.3x87`, виден статус «Канал Core 4.1.0 готов к командам». Свежий stdio-клиент из effective Codex MCP config подтвердил `file://` и выполнил одно чтение пустого проекта. Lease освобождён, receiver 13→15 с точным прежним префиксом, ledger сохранён. Текущий чат сохранил старый MCP-клиент с `owner_unavailable`.
- Предыдущая приёмка P1–P8 относится к пакету 4.0.0. Обновление и native-проверка 4.1.0 выполнены на MSI. Полная продуктовая приёмка не заявляется.

## 3 ноября: три облачных offline-инструмента перенесены на MSI

### Progress

Приняты package-location checker, cloud-checks-audit и cloud-result-preflight
из трёх завершённых облачных задач поверх локальной базы `db68140380f52fc630078317512e5ae1df3c273c`.
Исходники, инструкции и заново созданные Windows отчёты находятся в текущем
проекте. [Focused milestone](core-cloud-intake-20261103.md) содержит source
chat/commit provenance, состав и ограничения.

### Decision Log

Перенос добавочный: более новая локальная история и production source сохранены.
Preflight получил подтверждённый Windows-origin fix с regression. Исходные Linux
отчёты не объявляются локальным evidence; runtime/установка не обновлялись.

### Validation

Windows/Node24.15/Git2.54: package-location 3 PASS, audit 15 PASS, preflight
25 PASS/1 POSIX-only SKIP, scoped Core 9 PASS; syntax14 и boundaries55 PASS.
214 source hashes текущего audit сверены; исходные tracked bytes, кроме этой
записи плана, unchanged. P1–P8 и full release остаются открытыми.

**Приоритет 30 октября:** [устойчивый Core/CEP lifecycle](core-cep-lifecycle-20261030.md)
по прямому поручению пользователя. Сначала runtime ownership/startup/recovery,
затем новые продукты. Titles сохранён для сквозной проверки; installed manual3f92
пока не меняется. Полная release/P1–P8 остаются финальными отдельными проверками.

27 октября 2026, baseline `35f4c90`, ветка `codex/ae-agent-core-4.0.0`. Пользователь прямо поручил создавать новую версию здесь после запроса установить4.0.0. Готовый дистрибутив не требуется от другого компьютера: текущие исходники — база разработки. Этот блок заменяет прежнюю остановку перед созданием реальной интеграции.

## Цель и scope

**Актуальная очередь после установки, 29 октября:** пользователь принял
[план внешних продуктов](external-products-titles-20261029.md) и поручил
начать Titles вне `core4/`. Ранее описанные install/manual milestones
сохраняют техническую историю. T1 Titles compiler реализован в `products/titles/`,
8/8offline checks PASS; следующий предметный этап — T2 применимость Titles.
независимая поставка capabilities и Slideshow идут отдельными этапами.
Фактический round-trip переносимости назначен на финал функционального состава,
а не перед началом Titles. P1–P8 остаются открытым критерием выпуска.

**Отдельное архитектурное исследование, 29 октября:** по прямому вопросу
пользователя подготовлено [сравнение независимых workflow-продуктов и AE MCP](../docs/external-workflows-research-20261029.md).
Это консультационный блок; он не меняет текущий install/live scope и не запускает
перенос модулей. Progress / Decision Log / Validation исследования ведутся в
связанном документе вместе с единственным Argon review. Ответ получен при
продолжении: направление поддержано, план revise; семь findings разобраны
локально, окончательная рекомендация уточнена без runtime-изменений.

**Текущий операторский блок:** [manual install/live](core-manual-install-live-20261029.md).
Final manual3f92 установлен, exact owners архивированы; origins и signed history
сохранены.109offline/tempPASS, independent installed read-back и sole installed
stdio MCP→CEP→AE read PASS(native1,mutation0,clean exit0). Затем подтверждён
[configured Codex-client путь](core-client-reconnect-20261029.md): разрешённый
shared restart, recovery AE после CEP crash и один fresh native read PASS.
Managed33164→CEP→AE9672,receiver12events settled,pending/UNKNOWN0,mutation/save0.
Найденный standalone apply closure gap старого ad hoc dist исправлен в
[штатном source builder/entry](../docs/core-standalone-closure-20261029.md):
7/7+5/5 scoped PASS, actual TEMP apply, existing installed/dist без изменений.
Full release/P1–P8 не закрыты; independent capability install — следующий C1b.

**Source/temp этап завершён:** [декларативная устанавливаемая композиция](core-installed-composition-20261029.md).
Созданы readonly40/manual59 с прежними gates; release-specific verifyCep
покрывает fixed f548. Source `ed747ef`, local fixes `510d5ca`, scoped75PASS
и exact-f5481PASS, boundaries28PASS. Одно Argon `go`,3P3 разобраны локально;
новые hashes readonly7a46/manual3f92, full release не заявляется.
Configured tools текущего чата доступны. Native inspection/install пока не
выполняются: receiver storeClosed=true, stale marker требует отдельного
обслуживания с проверкой владельца и истории, без replay. Installed f548 сохранён.

**Текущий блок после переустановки среды:** [аудит накопленных изменений](core-post-reinstall-audit-20261029.md).
Установка f548 из предыдущего recovery завершена; повтор INSTALL не нужен.
Ordinary CEP connect визуально успешен; этот статус не проверяет evalScript.
Source audit исправил накопительный дефект lineage (`1ec3453`),17updates
с installed test startup/store проверены адресно. Единственное Argon review:
go,2P3 учтены локально. Candidate e073 не заменяет installed f548 без fresh status.
Следующая запись сохраняет прежний порядок работ до этого аудита.

**Приоритет от 29 октября 2026:** пользователь отложил перенос до устойчивой
работы здесь, на MSI. Следует локальная доводка и функциональная приёмка;
milestone 4 и сбор facts другой машины сейчас не продолжаются. Требование
переносимости сохраняется открытым. Текущий ограниченный engineering block —
[восстановление receiver ownership и установка f548](core-settled-owner-recovery-20261029.md).

С 28 октября 2026 [двусторонняя переносимость десктоп ↔ MSI](../docs/portability.md)
входит в обязательную готовность этого среза и всего AE Agent Core, независимо
от рабочего названия Core4. После первичной подготовки двух сред перенос
крупных архитектурных блоков не требует повторной ручной настройки. Приёмка
P1–P8 остаётся открытой; локальный успех установки на MSI её не заменяет.

Получить установочный пакет4.0.0 из нашего Core4: настоящий stdio MCP, внешний Node, локальный аутентифицированный канал к CEP, компактная панель4.0.0, диагностика и выбранный typed manual current-target путь для текста. Continuous-incarnation API остаются закрытыми без своего настоящего provider. Версия3.3.3 не переименовывается в4.0.0; legacy daemon/adapter не импортируются.

[Ручной прототип](core-4.0.0-cep-project-safety.md) и [readiness-контракт](../docs/core4-readiness-preflight.md) переиспользуются как проверенные границы, их offline evidence не выдаётся за live proof. C++ SDK, AME и старый cutover protocol сюда не входят. Исходный блок I–III не включал Argon/desktop-пересылки; добавленный пункт4 требует двусторонней приёмки по новому контракту, а конкретные передачи и доступ к машинам выполняются только в разрешённом scope.

Разрешены source/runtime/panel/installer, адресные проверки, детерминированная упаковка, stage/backup/read-back и целевая установка собственного Core4. Root — единственный installed/runtime/CEP/UI-контроллер; один writer `core4/**` и не более двух helpers. Старая установка и её данные сохраняются. Новые install-scoped role credentials создаются отдельно и не попадают в Git/package/public response. Raw executable ingress, public grant Boolean, fake production lifecycle, replay после UNKNOWN и автоматическое снятие fences запрещены.

Пользовательский AEP, save/reopen/destructive не выполняются ради установки. Пользователь отдельно разрешил штатно перезапустить пустой AE для перечитывания списка расширений; перед закрытием root повторно проверяет отсутствие элементов и несохранённых изменений. Test-copy: `snapshots/core4-host-validation/022dad73-ca31-4013-88fe-bf001ae91011/titr_01_ame_product_20261015.aep`, source SHA-256 `9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f`.

## Исходные install milestones (история; актуальная очередь выше)

1. **Package/status/inspect.** Production composition root `runtime/stdio-entry.js`, реальный HTTP long-poll peer внешнего Node и pure CEP browser, fixed reviewed executor registry, MCP status без lifecycle и bounded typed inspection/discovery. Отдельный CEP bundle `com.codex.aeagentcore4`, видимое имя AE Agent Core4.0.0. Receiver/store во внешнем Node; browser не исполняет Core через embedded Node17. Installer публикует immutable release по manifest hashes, отдельные credentials и project MCP entry, сохраняет state origin/fences. После scoped subprocess/IPC/VM/package/installer regressions — bounded review, commit и root install/read-back.
2. **Typed manual current-target.** Отдельный optional `titles-current-target` package/contract с target без sessionId. Private branded policy вне domain-neutral Core; engine-optional single-step path и versioned resource scope. Generic inspect→build→proposal→dry-run→run; fresh native confirm, single setter и local transaction receipt verifier. Durable preimage checkpoint покрывает точный текст/объявленный style, не весь AEP; recovery требует нового typed proposal/подтверждения. Политика выбирается trusted composition/admitted pin, не public Boolean. Default automatic epoch gates сохраняются. После scoped regressions/review обновить пакет и установленную копию.
3. **Фактическая приёмка.** Correlated MCP handshake, exact Node/install/CEP identities, status/admission coverage, одна разрешённая read-only инспекция через installed IPC. Для mutation — актуальные resource/ownership/physical gates и native confirmation. Если running AE не позволяет загрузить новую панель без сохранения/перезапуска, не закрывать его автоматически и не объявлять offline PASS живым результатом; независимая source/packaging работа продолжается.
4. **Двусторонняя переносимость и обновления.** Выполнить этапы [постоянного контракта](../docs/portability.md): матрица сред и installer gaps → адресная реализация/preflight/config generation → реальный десктоп→MSI→десктоп цикл → отчёт P1–P8. Повторная ручная настройка не допускается; credentials/state/authority остаются локальными, общие fences сохраняются. Критерий обязателен до объявления готовности выбранного состава, а не отложен в необязательные улучшения.

Между пунктами не нужны новый чат и повторное разрешение на уже порученную разработку/установку. Каждый пакет самостоятельно запускает свой разрешённый scope. После первого status-only результата работа продолжается ко второму пункту. Добавление пункта 4 в план не возобновляет остановленные live/UI-действия и не выдаёт доступ к другой машине.

## Progress

- 29 октября: baseline86connection/install и108M1 checks PASS, installed f548
  verifier PASS, UI Connected в двух observations. Снятие искусственного лимита
  lineage и проверка17updates ведутся в [audit record](core-post-reinstall-audit-20261029.md).

- [x] 29октября08:57UTC: фактически установлен f548 без очередного пользовательского
  запуска CMD. Root завершил только exact idle managed Node21876, полный stopped
  inspect PASS, successor recovery архивировал оба owner markers под lease и
  выполнил штатный installer. Независимый read-back release/CEP/Node/config/
  origins/semantic journal PASS;99адресных tests PASS. Текущий MCP transport
  закрыт: для нового configured handshake требуется перезапуск только Codex.
  [Evidence и решение](core-settled-owner-recovery-20261029.md#завершение-установки-без-нового-пользовательского-запуска--29-октября-2026).

- [x] 29октября, stopped CHECK локализовал ENOENT на transaction_parent.
  Win32 backing-path и два Node context probes подтвердили MSIX AppData view:
  внешний CMD не видел установленный runtime. Локальный same-package relay
  готов:36fixtures/PS5.1 parse/6CMD cases/syntax PASS, independent ACCEPT;
  actual external inspect видит exact state и блокируется штатным broker guard.
  Следующий шаг снова INSTALL при закрытом Codex; actual apply0.
  [Evidence и текущий ручной переход](core-settled-owner-recovery-20261029.md#следующий-ручной-шаг).
- [x] 29октября, пользовательский XV ENOENT разобран до границы evidence:
 5reportsblocked до intent, protected files/receiver прежние, original missing
  path не сохранён и сейчас не воспроизводится. Расширены только fixed labels
  диагностики helper:60fixtures/syntax и independent delta review PASS.
  Подготовлен read-only `CHECK-CORE4.cmd`; следующий ручной шаг — CHECK при
  закрытом Codex, INSTALL до разбора отчёта не повторять;
  [текущее состояние](core-settled-owner-recovery-20261029.md#отказ-enoent-после-закрытия-codex--29-октября-2026).
- [x] 29октября, новый screenshot отказа XV launcher воспроизведён: UTF-8/LF
  ломал Windows batch parser до вызова Node. Исправлены только22LF→CRLF;
  original сохранён, реальные `cmd` проверки с подменой и кодами0/1/7 PASS.
  Protected hashes/receiver прежние, intent/recovery reports отсутствуют;
  broker уже нового runtime. Установка не повторялась;
  [диагностика и границы](core-settled-owner-recovery-20261029.md#исправление-формата-launcher--29-октября-2026).
- [x] 29октября, по прямому поручению восстановления ownership подготовлен
  one-case XV operator:46offline tests/syntax PASS, independent ACCEPT;
  held lease/identityCAS/durable archive и штатный installer одним переходом.
  Root actual inspect finalhash корректно блокируется живым24688 до записи;
  protected state/markers прежние. Нужен закрытый Codex для actual apply;
  [готовый launcher и план](core-settled-owner-recovery-20261029.md).
- [x] 29октября, разобран пользовательский `local_check_failed`: apply marker
  отсутствует, installedfa9e/config/origins/journal прежние. Точная исходная
  ошибка не была записана. Launcher теперь сохраняет stage/OS code и отдельный
  check-only report;43fixture assertions PASS. Configured MCP24688 доступен,
  но receiver закрыт при сохранившемся marker от04:11:57UTC; journal settled,
  zero-dispatch recovery неприменим. Повтор установки исключён до отдельного
  проверяемого восстановления; [диагностика](core-msi-panel-reconnect-20261029.md).
- [x] 29октября, после restart Codex прежний owner21872 завершён, но новый26568
  автоматически удерживает fa9e. Full file verifier PASS; AE не запущен.
  Existing proxy снова os10050 до initialize. Готов локальный launcher
  установки f548 при закрытом Codex:29fixture assertions PASS; actual check-only
  ожидаемо блокируется owner. Apply0; [следующий шаг](core-msi-panel-reconnect-20261029.md).
- [x] 29октября, разрешённое поручение прежнему чату выполнено: очередь пуста,
  но штатно завершить managed MCP не удалось; Node21872/owners сохраняются.
  Root подготовил полный63file installer closure и dry-run PASS. Пользователь
  сообщил AEcrash; Windows event подтвердил RuntimeInstaller.DLL/c0000005,
  процесс AE завершился. Candidatef548 не установлен; [итог](core-msi-panel-reconnect-20261029.md).
- [x] 29 октября, локальная доводка MSI: исправлено ожидание после быстрого
  переоткрытия CEP. Retry только handshake/точного duplicate_peer,47selected PASS,
  boundaries21/source review ACCEPT. Candidatef548/60files готов, от fa9e
  отличается только panel.js; пока не установлен. Текущий MCP startup закрывается
  при занятом владельце прежнего чата; [focused блок](core-msi-panel-reconnect-20261029.md).
- [x] 29 октября: добавлена отдельная fixed-endpoint diagnostic source-команда,
 21selected PASS; root actual occupied exit2 без protected byte changes, peer
  connected/pending0/UNKNOWNfalse. Runtime fa9e/60files не менялся. Полный
  installer gate и capabilities остаются открыты; [focused блок](core-endpoint-observation-20261029.md).
- [x] 29 октября: configured Codex MCP client подтвердил status и одну новую
  typed inspection через установленный fa9e/CEP/AE26.2x49. Закрытая панель
  открыта штатно и подключилась автоматически; пустой проект, native read1,
  mutation/save/replay/restart0. После чтения peer connected, pending=null,
  unresolved=[], faults/UNKNOWN=false. Evidence и границы — в дополнении
  [focused плана](core-portability-installation-20261028.md).
- [x] 29 октября: воспроизведена startup-причина `installation_path`: installer
  менял native descriptor path на `/`, а прежний diagnostic его нормализовал.
  Генератор и regression исправлены;45 selected/boundaries21 PASS. Project config
  исправлена через generator/CAS; corrected argv дали installed initialize/status
  PASS и clean exit0, native0, fa9e/state прежние. Configured client пока требует
  нового подключения; existing proxy10050. [Детали](core-portability-installation-20261028.md).
- [x] 28 октября, продолжение по прямому поручению пользователя: installed
  fa9e release/CEP/Node повторно верифицированы; configured client tools пока
  отсутствуют, existing app-server proxy отказал socket10050 до initialize.
  Завершён первый source-блок переносимости: матрица MSI, installer audit и
  исправление cwd-dependent config target/Node default. Final45selected PASS,
  boundaries21, root actual foreign-CWD dry-run и unchangedfa9e/60files PASS;
  [focused план](core-portability-installation-20261028.md). Configured status и
  P1–P8 этим не закрыты.
- [x] 28октября: текущий ремонт/установка панели завершены. Package `fa9e2f454588`
  установлен,60release/7CEP+origins/lineage PASS. Fresh authenticated panel и одно
  новое native чтение пустого проекта PASS; original UNKNOWN history/noReplay
  сохранены. Direct-main bootstrap regression исправлен, source `36905c4`.
  По просьбе пользователя работа остановлена; [handoff](core-panel-installation-handoff-20261028.md).
- [x] A actual capture завершён после human click: exact host_registry_unavailable, MAC/bindings/168 protected files PASS, producerexit0, ACK/native0, originalUNKNOWN сохранён. Independent evidence audit допускает SOURCE B–D, без apply grant. Начата offline реализация disposition/sharedlease/lineage/reader/ACK; новый пакет пока не установлен.
- [x] Source collector A: freeze03/20 scoped PASS/boundaries21/source ACCEPT; actual installed preflight включая PS5.1/CIM PASS. Receipt пока не получен: CU отказал вне bounds до ввода, capture deadline; исходный UNKNOWN не изменён, own diagnostic gates сохраняются до проверенного retirement. AE развёрнут, B–D не реализованы/не применялись.
- [x] Отдельный native-read recovery design A–D прошёл единственное Argon/Aiton/High plan-review (go,6 findings локально разобраны). Реализация начата только с evidence-only collector A; original UNKNOWN/owner сохраняются, eval/replay/mutation0. Дальнейшие B–D условны до original receipt/proof; [актуальный план](core-native-read-recovery-design.md).
- [x] Origin transport на installed6c94 подтвердил живое CEP соединение после user-approved restart. Native read обнаружил ES3 protected154 → timeout/UNKNOWN; replay0. Source fix + ES3 grammar/42selected checks и independent ACCEPT готовы; candidate947 не установлен поверх fence. Следующий bounded блок и ограничения — [native ES3/recovery](core-native-es3-recovery.md).
- [x] По новому прямому поручению28октября второе Argon-ревью исключено из общей схемы. Package6c94 установлен, transaction d1b8c949; read-back56release/7CEP, state origins и installed stdio initialize/status/contract PASS. Реальное подключение ожидает открытия панели: AE после её закрытия выдал nullptr warning и не раскрывает Extensions; запрошен ручной шаг/штатный restart пустого AE. Native0, user AEP не менялся; подробности в focused Origin плане.
- [x] 28 октября, возобновлённый scoped ремонт: собственная CEP фактически отправляет `Origin: file://`; baseline guard допускает только `null`. Новый [focused план](core-4.0.0-origin-repair.md) сохраняет измерение и порядок exact portable repair/review/install. Source и установленный пакет на этом шаге ещё не менялись.
- [x] Origin plan-review Argon/Aiton/Высокий принят (go,5 findings разобраны); minimal source freeze4files и selected20+12+1 PASS, boundaries21/syntax/diff PASS, independent source ACCEPT. Root сверил5source/56package hashes и deterministic candidate6c94; до result-review installed0aea не обновляется. Live CEP/CORS и переносимость P1–P8 ещё не подтверждены.
- [x] 28 октября: переносимость закреплена как постоянное архитектурное правило AE Agent Core в AGENTS, intent и architecture; задан измеримый контракт P1–P8.
- [ ] Реализован и подтверждён штатный перенос архитектурных блоков десктоп ↔ MSI без повторной ручной настройки; P1–P8 закрыты фактическим evidence обеих машин.
- [x] Подтверждены user GO, исходники и чистый baseline; поиск внешнего дистрибутива прекращён.
- [x] `ae_architect` дал bounded source design GO; `ae_scout` проверил CEP/runtime facts. Root владеет планами/commit.
- [x] Единственный `ae_implementer` получил source ownership `core4/**` и последовательные milestones I/II.
- [x] I source реализован: отдельная CEP-панель/HTTP peer/stdio entrypoint, `project-inspection` через generic module API, package/installer/rollback. Initial dedicated actual-component checks7/7 перекрыты итоговым freeze I_V4.
- [x] Реализованы runtime/panel/package/installer и scoped validation I; frozenI_V4 принят независимым review.
- [x] Подготовлены первый локальный milestone commit и immutable distribution I; дальнейшая работа продолжается ко II.
- [x] Выполнены target install/read-back и настоящий stdio handshake/status. CEP connectivity пока не подтверждён: running AE не перечитал новый bundle.
- [x] Реализован и адресно проверен manual typed workflow II без fake epoch; independent authority review ACCEPT, включая timing delta.
- [ ] Обновлены пакет/установка и фактическая приёмка; оставшиеся ограничения записаны точно.

## Decision Log

- Post-reinstall audit сохраняет compatibility fixes/authority/no-replay;
  operator recovery не является connect dependency. Fixed manual titles в
  installed composition — открытый modularity debt, не исправляемый простым
  if-exists. Новый source candidate отдельно от installed f548/live proof.

- 29октября: прежняя ошибка повторялась из-за broker pin24688 после новых
  Codex lifetimes. Committed pre-apply отказ позволил отдельный exact successor
 21876 с сохранением старого guard, original receiver/history и всех runtime
  checks. Однократное обслуживание точного idle Node выполнено root в scope
  порученной установки; graceful drain не заявляется. INSTALL завершён;
  дальнейший пользовательский запуск не нужен. AE/native/replay0.

- Причина XV ENOENT подтверждена как различие virtualized AppData внутри Codex
  MSIX и внешнего CMD. One-case relay входит в тот же package context через
  штатный Invoke/PreventBreakaway, не переносит state и не меняет logical paths,
  recovery pins или grants. Timeout/неясный handoff сохраняет no-replay; отдельный
  wx run-submit guard не очищается автоматически. Общая независимость installer
  от filesystem view остаётся portability gap; migration сейчас не выполняется.
- Новый XV `ENOENT` не идентифицирует исчезнувший ресурс. Stage=snapshot мог
  сохраниться и на pre-intent plan/open после lease; отсутствие gates после
  отказа не доказывает отсутствие его получения. Новый диагностический helper
  уточняет фиксированный check/resource без раскрытия path. Stopped-state
  read-only CHECK заменяет прежнюю рекомендацию повторить INSTALL.
- Новый отказ XV launcher вызван сочетанием UTF-8 текста и LF в Windows `cmd`;
  byte-identical воспроизведение подтвердило отсутствие вызова Node. CRLF
  устраняет parser defect без изменений recovery/installer/pins. Новый broker
  не подменяет прежний approved marker: если он останется после закрытия Codex,
  существующий exact-CAS guard сохраняет отказ до intent.
- Сообщение `local_check_failed` не устанавливает первопричину: прежний wrapper
  скрывал OS errors и не сохранял stage. Новый актуальный blocker подтверждён
  отдельно: closed receiver при старом owner, хотя журнал семантически settled.
  Current broker owner живой; timestamp/пустой marker/settled journal не дают
  права удалить marker. Existing zero-dispatch operator для8event history
  неприменим. Ранее предложенный повтор offline launcher пока не выполнять.
- Установка f548 выполняется между штатным закрытием и следующим запуском
  Codex: обычный restart немедленно возвращает прежнего MCP-владельца.
  Подготовлен локальный launcher штатного installer без изменения gates,
  удаления markers или принудительного завершения процессов.
- Свежий пустой status не заменяет штатное завершение stdio lifetime.
  Освобождение MCP остаётся реальной границей установки; процессы/markers не
  завершаются принудительно. AEcrash фиксируется отдельно: новый пакет не был
  установлен, fault module не выдаётся за первопричину. Перезапуск AE0.
- Перенос отложен по новому поручению29октября; локальная доводка продолжается.
  UI bounded retry сохраняет серверный45speer guard и UNKNOWN/no-replay.
  Старый managed runtime остаётся владельцем до штатного освобождения;
  force kill/marker cleanup и второй listener не используются для установки.
- 29 октября: producer MCP-конфигурации сохраняет native paths с TOML escaping;
  verifier не принимает дополнительные формы пути. Regression потребляет emitted
  config без нормализации. Отдельный exact-argv proof подтверждает repair,
  но не managed client; package/CEP update для tooling fix не нужен.
- Новое поручение «продолжай» возобновляет работу после предыдущей остановки.
  Для configured-client нужен штатный reconnect; текущий proxy10050 не является
  отказом AE и не разрешает второй runtime. Независимый source milestone4
  продолжается; runtime state/adoption и установленный package не меняются.
- Историческая остановка после предыдущего ремонта до нового поручения:
  пользователь продолжит в новом чате. Own diagnostic MCP закрыт чисто;
  maintenance enabled=false восстановлен в true. Первый шаг продолжения —
  configured-client status/reconnect, без replay старой inspection. Read-only
  installation proof завершён; manual mutation/adoption и P1–P8 ещё не приняты.
- Поручение пользователя от 28 октября относится ко всему AE Agent Core: название Core4 временное, переносимость обязательна и для последующих версий. Новый блок сейчас документальный; установка, live, таймер и Argon-отправки не возобновляются. Существующие guards и отдельный scope полной release-проверки сохраняются.
- Предыдущее требование принести готовую4.0.0 с десктопа было ошибкой порядка работы: интеграцию предстоит создать из имеющейся разработки. Новое поручение даёт source/build/install scope; прежний offline-запрет не запрещает этот отдельно порученный блок.
- IPC выбран HTTP long-poll: установленная browser CEP-панель уже использует HTTP, а embedded Node CEP12 имеет17.7.1; внешний Node20+ не помещается туда по предположению. Новый внешний runtime использует конкретный проверенный absolute Node path/hash без PATH/npm install, без detached daemon/native C# launcher.
- Во фреймах только fixed reviewed asset key/phase и typed payload, не source/path/function. Durable begin предшествует выдаче команды, physical latch — eval, callback receipt — POST, clear latch — correlated durable completion ACK. Browser storage не объявляется fsync-защитой. Timeout/reload/loss сохраняют UNKNOWN/no-replay.
- Panel и control credentials разделены; свежие challenge/epoch/sequence связывают peer/controller/package. Loopback Host/Origin проверяются, null Origin без credentials/MAC не доверяется, wildcard CORS не вводится. Diagnostic role не получает execution authority.
- Resource fences относятся к реально общим machine/process/file resources. UNKNOWN другого компьютера не является очередью этого AE; одинаковый путь/новый UUID сами по себе разделения не доказывают. Actual identity и локальный physical state устанавливаются отдельно; архивная рабочая история не становится startup dependency.
- Checkpoint/verifier новой manual policy явно versioned: local transaction receipt подтверждает именно эту транзакцию, поздний отдельный inspect — новая observation, а не continuity или снятие UNKNOWN. Full-project protection при необходимости сохраняет save gate.
- Read-only native result имеет собственный `observationVersion`, а не прячет project metadata в `protected` старого snapshot. Missing host JSON/registry даёт явный known read refusal без raw fallback. Generic inspection сверяет moduleId+contractId; новый отдельный публичный `inspect_project` не вводится.
- Root визуально наблюдал единственное окно AE26.2: пустой `Untitled Project.aep`, project items/comp отсутствуют; окно было развёрнуто из minimized, проект не менялся. CEPHtmlEngine на диске12.0.1; PlayerDebugMode12 уже1, security settings не менялись. Read-only CDP inventory2029: один target, legacy AE Agent target не обнаружен. Эти факты не объявляются global AE queue idle.
- Независимый I reviewV2 нашёл2P1/1P2: extra extensionless release file мог загрузиться до проверки; orphan Broker ownership допускал отдельную physical inspection; TOML edit мог поглотить indented соседнюю entry. До установки обязательны exact closure/pre-import verification, общий fail-closed physical guard и bounded TOML edit/regressions. Дополнительно apply должен принимать exact reviewed package hash. Writer исправляет только эти адресные места, II до frozen package не публикуется.
- I_V4 закрыл findings, включая последующее связывание фактического entry root с verified release и повторный descriptor CAS под startup gate. Импорт package code происходит только после проверки closure/identity. Missing/wrong reviewed hash запрещает apply до записи. Прежние marker/fence/ledger не удаляются для старта/установки.
- II actual provider будет отдельным private Windows probe/adoption/reservation, не публичным Boolean: actual hostname/PID/birth/executable + stable installation/state owner + authenticated peer + exact approval/checkpoint + durable reservation. Coverage ограничен cooperating Core4 lane/current native-confirm target; global AE idle и отсутствие всех сторонних actors не обещаются. Known conflicting obligations блокируют отправку; native confirm повторно сверяет текущую цель. Root adoption привязывает процесс/разрешённую test-copy, но не является grant на setter или project epoch.
- I установлен из immutable distribution после commit `0131ab3be059aed3926a966f281bca124ace6250`. Новый project-local MCP entry и отдельный CEP bundle не заменяют старую панель3.3.3. Текущий AE показывает только ранее закэшированные расширения; штатный перезапуск пустого AE отдельно запрошен у пользователя. Пока ответ не получен, source/build II продолжается без перезапуска, открытия AEP и native вызовов.
- Actual Codex MCP client самостоятельно подключил I после завершения root probe. Его `core_status` отклонён `unexpected_field`; это отдельный interoperability finding, manual NDJSON probe его не покрывал. II принимает bounded standard `params._meta` вне domain payload и проверяет это actual stdio-child regression; окончательная проверка configured client остаётся после установки II.
- Project-local `enabled=false` штатно отключил managed client; Codex завершил PID15396, оставив broker/receiver owner markers. Root не выполнял force kill и не удалял markers. Read-only state proof: broker ledger отсутствует, receiver journal содержит ровно valid origin record, ни одного begin. Архитектурный GO дан только на отдельный private zero-dispatch owner retirement с inspect→exact proof hash→gates/CAS→durable archive двух markers. Это не general recovery и не startup/installer fallback. Любой ledger event, begin/unknown/torn record, непроверенный процесс или несовпадение proof закрывает переход; origin/journal/store identity/fences сохраняются. Пустой receiver marker требует отдельного root provenance и свежего census именно собственных Core4 процессов. Writer создаёт temp-tested operator CLI; root применяет только после independent review.
- II дополнительно исправляет host data compatibility: lexical ES3 JSON codec без eval/глобального polyfill, bounded discovery и known read refusal без evidence; opaque host objects закрываются, известный `ParagraphJustification` enum нормализуется явно. Это source/VM evidence до actual native проверки. Installer сохраняет явный MCP enabled preference, чтобы root мог закончить проверку/adoption до подключения клиента.
- Пользователь ответил «Да, перезапусти пустой AE». Root свежим UI-снимком подтвердил пустой Untitled Project без dirty marker, затем выполнил один штатный Alt+F4. Окно и прежний PID4312 исчезли, save dialog не появился; force kill/save/discard не выполнялись. Новый запуск последует после обновления reviewed II, чтобы панель сразу загрузила актуальный пакет.
- Private zero-dispatch recovery V2 прошёл8/8 и independent review ACCEPT после lstat/dangling-ledger repair; source commit `1cd50b5`. Root применил ровно reviewed CLI из distribution после actual inspect/proof CAS. Transaction `8dec8220-b9f3-465e-acce-0dd2bc733051-zero-dispatch-retirement`; независимый read-back подтвердил byte-identical archived markers, неизменные origins/journal/store identity, отсутствие ledger/gates/owner markers. Никакие command outcomes/fences/grants не менялись. [Focused record](core-4.0.0-zero-dispatch-recovery.md).

## Validation

- Post-reinstall: baseline86/86, M1 108/108, boundaries21PASS; реальная temp
  история после17updates проходит installed startup/store с UNKNOWN/no-replay.
  Свежая live mutation/adoption и configured native read этим не доказываются.

- 29октября: successor96fixtures +3real installer/semantic/lineage integration
  PASS; source review P1/P2нет. Actual install exit0 и независимый read-back
 08:58:16UTC PASS. Packagef548, два markers в durable архиве, journal/origins
  неизменны, gates отсутствуют. Configured status после остановки старого
  клиента: `Transport closed`; новое подключение и live CEP ещё не подтверждены.

- MSIX relay:36/36fixtures, PS5.1 parser,6CMD stub cases/syntax PASS; независимый
  source/fix review ACCEPT. Actual inspect из внешнего процесса без видимого
  AppData входит в нужный context, сверяет bindings и возвращает ожидаемый
  broker guard до intent.5protected files/receiver/history прежние, oldfa9e,
  original/new guards до actual run отсутствуют. Apply/native0; installer product
  bytes и underlying helperadff…ad27 прежние.
- XV ENOENT:60/60helper fixtures/syntax, independent diagnostic-delta ACCEPT;
  real-cmd CHECK stub0/1PASS. Actual CHECK при новом broker31972 блокируется
  на broker_marker до intent; actual apply/native0.5dated reports сохранены,
 5protected hashes и receiver identity/bytes прежние, installedfa9e.
  Missing resource из исходного ENOENT остаётся неизвестным до stopped-state
  evidence; готовность повторного INSTALL не заявляется.
- XV launcher-format regression: исходные bytes воспроизводят screenshot,
  исправленные CRLF проходят три реальные `cmd` проверки0/1/7 на recording stub
  в каталоге с пробелами; actual recovery/apply/native0. Новый launcher hash
  `df8e54c1c24b5093e1182338c1e7827e10aa3b8775609573b8fda4a7e930a499`.
  Read-back06:20:29UTC: installedfa9e,5protected files/receiver прежние,
  transaction/gates/recovery reports отсутствуют; broker нового PID2752.
- Screenshot diagnosis: full installed verifier/candidate63file closure/package/
  config/dry-run/baseline PASS; `assertReceiverJournalSettled` PASS на неизменном
 8event journal. Current configured status pending=null/unresolved=[]/faults=false,
  physical.storeClosed/unknown=true. Local wrapper43assertions/syntax PASS;
  actual `--check-only` отказал на ownership без apply marker, исходный отчёт
  сохранён byte-for-byte. Source/runtime/CEP/state/owners не менялись;
  ни новая установка, ни live acceptance этим блоком не подтверждены.
- После restart: actual fa9e60files/CEP/Node/origins verified, protected hashes
  прежние; configured status в этом чате недоступен, fresh queue не заявляется.
  Existing control proxy exit1/stdout0/os10050, status/reload0; install/native0.
  Local launcher29fixture assertions/syntax PASS; actual read-only preflight
  отказал `runtime_state_owned_or_unknown` до apply/attempt marker. Проверки
  stopped/settled под lease и actual installation/read-back остаются открыты.
- Продолжение после пересылки: actual standalone dry-run63file closure PASS,
  package/source bytes прежние. Configured status получен владельцем прежнего
  чата; освобождение MCP FAIL/not-supported. Windows event1000 и census
  подтвердили завершение AE; нового native/live/install proof нет.
- Локальный reconnect source-блок:47/47selected PASS, old baseline negative
  FAIL1/1, final evidence keys совпали; boundaries21/syntax/diff PASS,
  independent source ACCEPT. Candidatef548deterministic/60files; actualfa9e
  read-only verifier PASS. Actual install/live/9deferred integrations/full
  release не приняты. Evidence и package hashes — в focused плане выше.
- 29 октября: exact old argv FAIL exit1/`installation_path` до state startup;
  regenerated native argv PASS initialize/core_status, child18160 exit0/stderr0.
  Python TOML decode и Codex CLI config read-back PASS; descriptor/origins/journal
  byte-identical, runtime packagefa9e.45/45 selected, boundaries21, syntax/diff PASS;
  native0. Configured status через existing proxy недоступен:10050. Evidence —
  `snapshots/core4-live-proof/X-configured-path-repair-20261029/`.
- 29 октября: пользовательские screenshots опровергли предложенный UI-путь к
  отдельному MCP servers. Повторный ручной поиск не требуется. Project config
  после одного bounded reload-cycle восстановлен byte-identical; cached startup
  failure остаётся, новой попытки запуска в журнале нет. Следующий technical
  шаг — точные loaded args/stderr штатного client, не ещё один UI-рецепт.
- После сообщения пользователя о manual reconnect: actual MCP startup текущего
  чата отказывает initialize (`connection closed`). Отдельный installed stdio
  diagnostic23156 дал initialize/core_status PASS и clean exit0, native0,
  journal unchanged/owners0. Configured-client proof этим не заменён.
  По отдельному поручению проверены12AE skills, исправлены5entrypoints+reference;
  результат и границы проверки — [audit](ae-skills-audit-20261028.md).
- 28 октября, source installer portability: final45/45selected PASS
  (23installable+19recovery+3human), boundaries21/syntax/diff PASS; root exact
  fa9e/60closure и actual dry-run финального CLI из чужого cwd PASS. Descriptor,
  config, journal и origins byte-identical, release/CEP повторно верифицированы;
  installation/apply/native0. Configured-client tools отсутствуют; existing
  proxy10050 до initialize, manual reconnect pending. Final bindings и11deferred
  current-closure-unverified — в focused плане; full release не запускался.
- Финальный actual proof и ограничения — в handoff и
  `snapshots/core4-live-proof/VII-native-read-recovery-20261028/root-final-native-proof.json`.
  Native success через installed MCP stdio/CEP/AE, post-read faults/pending0,
  graceful child exit0, owners/gates0. Последний source fix:48selected PASS плюс
  actual-main negative→positive regression; прежние96 относятся к freeze04.
  Full release и готовность переносимости не объявляются закрытыми.
### Архитектурное требование переносимости — 28 октября 2026

- Scope: документация и план, без runtime/source/config/installed изменений. Строгий UTF-8, относительные ссылки и `git diff --check` — PASS; подробности в основном плане. Прежние product PASS не расширяются; P1–P8 не выполнены и readiness обеих машин не заявляется.

### I — source/package, до actual установки

- Итоговый `installable-runtime` batch — **13/13 PASS**: real stdio child+HTTP+VM, auth/role/origin/epoch/replay/size, durable begin/receipt/ACK/latch, crash/reopen/no-replay, known host JSON refusal, package/install/rollback/stable origins, closure injection/junction, orphan owner/corrupt ledger/unresolved intent, TOML preservation, expected package hash и stale entry/descriptor race. Native AE calls0. Earlier7/11 перекрываются итоговыми13 и не суммируются.
- Selected existing consumers на прежнем I freeze: Core36/36, photo3/3, titles4/4 PASS. Их code/dependency bytes не менялись последующими runtime/test-only fixes, повтор не выполнялся. Полный raw stdout этого прежнего subprocess не сохранён (первый chunk был truncated); evidence содержит точные counts/commands и ограничения, а не заявление полного raw TAP. Current full-release PASS отсутствует; audit-repairs/cep-transport/lifecycle-simulation имеют explicit deferred coverage selection.
- Boundaries20, JS syntax, XML и diff checks PASS. `core/stdio.js` меняет только private serverInfo option, default metadata прежнего M1 сохраняется; Core artifact resealed только для actual stdio bytes. Чужие module/engine/protocol pins не обновлялись.
- Frozen source/evidence: `C:/Users/Ant/AppData/Local/Temp/core4-ready-I-V4-AenV3N/` (`summary.json`, `selection.json`, `installable-runtime.raw.log`, `boundaries.raw.log`, `diff-check.raw.log`, `package.json`). Root независимо сверил22 changed source hashes: mismatches0. Все48 package file hashes и exact file set сверены; packageHash `cf07e3189d88c4921f779b806b5dc45c8a305cd9c4bc27d898b3903678327f04` пересчитан независимо. Reviewer выполнил bounded source review и address review fixes: **ACCEPT**, открытых P1/P2 нет; tests/live не запускал.
- Root повторно собрал детерминированный пакет в `dist/core4/4.0.0-readonly-cf07e3189d88/core4-4.0.0.json`: тот же packageHash/48 files, file SHA-256 `786d2a741ce5ec100ef8f7b87d637b51178559ae87494a322278e19a6a70ca6f`. Рядом `distribution.json` и standalone installer closure (3 reviewed files с hashes). Эти generated artifacts игнорируются Git.
- Root dry-run на actual MSI paths прошёл: внешний Node `C:\Program Files\nodejs\node.exe`, v24.15.0, SHA-256 `3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5`; Core4 install/CEP/project config до установки отсутствуют. CLI требует exact native Node path; первая запись с `/` была отвергнута `node_path_not_exact` до изменений, corrected native-path dry-run PASS.
- Номер4.0.0 не является release certification: `releaseCertified:false`, actual installed/host proof записывается отдельно после source commit. Full-release suite не запускалась. До завершения II этот пакет имеет feature scope status/read-only inspection.

### I — actual установка и stdio proof

- Installer apply на MSI завершился успешно с exact reviewed packageHash. Descriptor: `C:/Users/Ant/AppData/Local/AEAgentCore4/installation.json`; installationId `installation-1304c438-5794-4d5c-bf72-d8101f3d2a24`. Immutable release размещён в `releases/<packageHash>`, постоянный state — `state/production`. Transaction `9b4212d6-8a75-4e48-8394-ab5151da2804`; legacy bundle и его state не изменены.
- Root read-back сверил48 release files (mismatches0), exact Node hash и7 установленных CEP files, наличие разных role credentials без вывода их значений. Создан только project-local `.codex/config.toml` с `after-effects-core4`; global config не менялся. Evidence: `snapshots/core4-live-proof/I/installation-readback.json` и `dist/core4/4.0.0-readonly-cf07e3189d88/installation-result.json`.
- Настоящий installed stdio child PID10612 ответил на JSON-RPC initialize как `ae-agent-core4` версии4.0.0. Два `core_status` подтвердили `ready:true`, `nodeVerified:true`, ownershipFault null, ledgerFault false, unresolved0, открытый receiver store и HTTP3457. Raw ответы сохранены в `snapshots/core4-live-proof/I/stdio.raw.jsonl`. Это proof процесса/IPC listener, но не native AE execution.
- CEP peer пока `connected:false`, pending null, unknown false; automatic lifecycle остаётся unavailable. Root увидел в меню Window → Extensions только старые bundle: новая панель ещё не загружена текущим сеансом AE. Перезапуск ждёт отдельного ответа пользователя; AEP не открыт/не изменён, native AE calls0, save/reload0. Идущая source-работа II не зависит от этого ответа.

### II — frozen source/package перед независимым review

- Реализован отдельный admitted `titles-current-target`: target без sessionId, private branded policy/reservation, exact approval/pins/checkpoint, optional-engine single-step, v2 process origin/resource constraints, fixed native-confirm transaction и original local-transaction-receipt verifier. Automatic lifecycle contract не ослаблен. Actual Windows probe/adoption — private operator entry, без public grant Boolean.
- Frozen source packet: `C:/Users/Ant/AppData/Local/Temp/core4-II-frozen-09gaLC/summary.json` и соседние selection/package/raw logs. Root сверил33 source SHA-256, mismatches0. Package57files повторно собран с hash `99be960979416254742b70a497a93751e60574a448421abf1eb85985e091c4a1`; exact file set, каждый file hash и manifest hash пересчитаны независимо. Immutable candidate — `dist/core4/4.0.0-manual-99be96097941/`, package file SHA-256 `0b9e7ae3c22c23de7dd00395b7d0c0eeb25fee83eccbfaf72a3cd34eeb3f963e`; installer closure3 и standalone adoption operator сохранены отдельно.
- Dedicated affected suites **27/27 PASS**: installable15 + manual12, raw `core4-II-bounded-freeze-kLX0uJ/last-affected.raw.log`. После этого изменены только две подписи панели; current panel-selected suite PASS в final packet. Core37/37 PASS на текущих production core bytes до fixture-only/label delta (`core4-II-freeze-4fGEZP/validate-diff.raw.log`). Предыдущий infrastructure worker_timeout сохранён в `core4-II-final-cAXdd5`; timeout/guards не ослаблялись. Более ранний full selected PASS относится только к своим прежним closure/evidence keys, не объявляется current release certification.
- Boundaries21, syntax, PowerShell AST, XML и diff PASS. Native AE calls0 и actual Windows probe calls0 у writer. Independent authority review выполняет `ae_specialist`, read-only, без tests/live. Recovery CLI/test — отдельная добавка вне frozen runtime/package; установленная I ещё не переключалась на candidateII.
- Independent authority review frozenII — **ACCEPT**, открытых P1/P2 нет, source/package hashes сверены повторно reviewer. Перед actual install root обнаружил operational timing gap: Core default2s не подходит для native confirm. Отдельная согласованная дельта только trusted production composition задаёт caller100s / physical callback90s / MCP default120s. Worker timeout и defaults старого Core не меняются; explicit MCP timeout preference сохраняется. Поздний native ответ после physical deadline не снимает UNKNOWN и не разрешает replay. Timing delta получает свой адресный regression/review и новый package hash, candidate99be остаётся сохранённым промежуточным evidence.
- Final timing/routing packet — `C:/Users/Ant/AppData/Local/Temp/core4-human-window-ready-7jlqXE/`. Последняя адресная проверка: human3 + manual12 + installable15 = **30/30 PASS**, routing5/5, recovery8/8. Actual stdio child принимает synthetic human decision после2.6s; ускоренный physical deadline сохраняет UNKNOWN после late setter и блокирует replay. Boundaries21/syntax/diff PASS. Broad suites не повторялись; историческое Core37 evidence и прежние selected closure не расширяются до новой release certification.
- Final independent review — **ACCEPT**, без открытых P1/P2. Root и reviewer независимо сверили36 source +2 recovery hashes, mismatches0; все57 package files/manifest hashes совпали. От candidate99be в runtime package изменён только `runtime/stdio-entry.js`. Новый packageHash `42e101d56879e0f89774499ab2784f2649a6296f59bdafe6ae76bb4a7eb4c3af`, immutable distribution `dist/core4/4.0.0-manual-42e101d56879/`, package file SHA-256 `5272d213ddc38e5d059ebc37e2e640e3778a85d9c9b3614eade6c8c6a768cc70`. Installer closure3 и два standalone private operators зафиксированы с hashes; actual install/read-back следует после source commit.

### II — actual установка и адресный host-query repair

- Source milestone commit `ef17440`; root dry-run/apply reviewed42e PASS, transaction `6c5f72dd-edfb-4c9d-aa7d-f391fb9b327b`. Сохранены installationId/state/origin и explicit MCP enabled=false, добавлен own tool_timeout_sec120. Независимый read-back57files без mismatches, exact Node hash/origins/credential roles и7CEP files/2fixed assets совпали. Evidence: `snapshots/core4-live-proof/II/installation-result.json` и `installation-readback.json`.
- Разрешённый пользователем перезапуск состоялся: пустой AE был штатно закрыт и запущен заново. Новый PID31452, birth `2026-10-27T18:39:21.6825920Z`; окно Untitled без элементов/dirty marker. Первое launch API observation не успело увидеть окно; повторного запуска не делали, свежий inventory затем нашёл единственный нужный процесс/окно. Home закрыт Escape, в Window→Extensions подтверждено **AE Agent Core4.0.0**. Панель пока не открывалась, AEP не загружался.
- Actual private `probeWindows` вернул host_probe_failed. Bounded diagnostic установил точную причину: Windows PowerShell5.1 отклонил pinned `.ps1` как SecurityError/UnauthorizedAccess, running scripts disabled. Состояние policy/registry/security settings не менялось; Unblock, bypass/encoded-source или повторный File fallback не выполнялись. Evidence: `snapshots/core4-live-proof/II/host-probe-file-refusal.json`.
- Следующий адресный repair — новый package-owned literal read-only CIM cmdlet query с фиксированной проекцией PID/точного UTC birth/executable path; Node выполняет нормализацию/hostname/time/stat/hash. Это отдельный разрешённый интерфейс чтения системных facts, не перенос содержимого запрещённого script file в Command. [Microsoft5.1](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1) явно различает разрешённые individual commands и обход через перепаковку script contents. Architect/reviewer дал узкий GO только для первого. Новых source/path/query arguments, dynamic evaluation, EncodedCommand, policy changes или fallback после cmdlet/AppControl/CLM refusal не будет. Writer делает scoped patch/tests; root применяет после source review. MCP остаётся disabled, собственные owners/ledger отсутствуют, поэтому новый пакет можно установить без orphan recovery/restart AE.
- CIM repair реализован и принят отдельным review: literal pipeline использует fixed `-Property ProcessId,CreationDate,ExecutablePath`, затем fixed data projection/JSON; base64 кодирует только UTF-8 данные результата. Node сохраняет raw7-digit birth, проверяет schema/date/bounds и executable stat/hash. Ошибки закрывают probe без fallback. Неиспользуемый `.ps1` исключён из active package и оставлен в source только как provenance.
- Итоговый packet `C:/Users/Ant/AppData/Local/Temp/core4-cim-repair-final-ToPzQc/`: CIM6/6, syntax/query AST/diff PASS. Preceding repair packet `core4-cim-repair-VCb9ZZ` содержит manual12/CIM6/installable15=33PASS и routing5; после него менялись ровно literal `-Property` и его assertion, прежние полные closure не переобъявляются current-release PASS. Actual query/ports/installed reads/native0 у writer; reviewer source-only ACCEPT без P1/P2. Root/reviewer independently checked5source/56package hashes, mismatches0.
- Новый packageHash `0aea36d0caf2f60a91dbdc72cc5d10e268a410d1973e1e2140dfd2a9b5d88589`; immutable distribution `dist/core4/4.0.0-manual-0aea36d0caf2/`, file SHA-256 `3adb8e028bf2d1ef35e97cb3f08c35a705e0546570827c5e8ff5b6d8f4f918fd`. Root actual apply/probe и final MCP→CEP→JSX read proof следуют отдельно.

### Фактический итог на остановке Computer Use — 28 октября 2026

- CIM source repair commit `4e26bde`; final package0aea установлен, transaction `f532d2c6-0920-4c0f-b1be-e972454bac7e`. Root read-back всех56release/7CEP files, Node/origin/credential-role/asset bindings PASS (`snapshots/core4-live-proof/II/installation-readback-0aea36d0caf2.json`).
- Actual installed Windows query PASS: MSI, единственный AE PID31452, birth `2026-10-27T18:39:21.6825920Z`, executable SHA-256 `166ede517e7d314c8842d7dfb47b8f68a24ccc64b0add589e4f16b42c7af8157`; named endpoints3456/8787 observed-absent. Private adoption PASS с exact prepared-copy path, mutationGrant/lifecycleEpoch false. Evidence: `host-observation.json`, `host-witness.json`, `host-adoption-result.json` в том же ignored каталоге.
- Installed stdio child PID21856 успешно ответил initialize как4.0.0, core_status с standard params._meta и generic inspection contract. Ownership/ledger faults отсутствуют, receiver store identity прежняя, pending null/unresolved0/unknown false, adopted true. Чистые ответы — `stdio.raw.jsonl`. Это actual stdio/status proof, но не configured Codex-client или native read proof.
- Новая панель фактически загружена из собственного installed file URL и видима в AE. CU нажать HTML-button не смог из-за cross-process CEP child; пользователь сообщил, что нажал «Подключить». Дополнительно root штатно переоткрыл только панель при подтверждённой пустой очереди. Реальный fetch дошёл до HTTP, но получил **cep_origin_required**. Guard не ослаблялся; exact Origin ещё не измерен. Own Core4 CDP не доступен; port2029 принадлежит Automation Blocks, чужая поверхность не использовалась.
- Configured Codex MCP client не перечитал новую запись в активном чате. Поддержанный CLI app-server proxy не подключился к default control socket (os error10050); новый app-server/чат не создавался, Codex UI не автоматизировался. Для отдельного read-only proof использован root-owned installed stdio client. Он штатно закрыт exit0 без native dispatch; temporary MCP enabled=false восстановлен в true.
- Для измерения Origin подготовлен отдельный one-request observer на том же127.0.0.1:3457: только header classification, без Core imports/credentials/challenge issuance/AE commands. До следующего CU действия пользователь остановил Computer Use физическим Esc; root прекратил UI и закрыл observer. Native inspection/mutation не выполнялись, AEP не открывался/не менялся, save0. Полная живая приёмка **не завершена**.
- Следующий ограниченный шаг: измерить actual Origin собственного CEP, затем независимо проверить точный authenticated origin contract без отключения Host/Origin/MAC gates; после scoped repair повторить один native read пустого проекта и configured-client reconnect. Требуется новое разрешение продолжить Computer Use после пользовательской остановки; source/read-only продолжение само по себе не отменяет эту остановку.

## 7 ноября. Типизированная сборка проекта и приоритет штатных операций

### Progress

- В `AGENTS.md` закреплена проверка контракта Core и каталога 3.3.5 перед
  повторяемым действием через Computer Use.
- `manual-project-assembly/owner` добавляет `project-assembly / assemble-composition`.
  Один подтверждённый план в уже сохранённом AEP создаёт композицию, импортирует
  локальные JPEG/PNG и раскладывает до 12 фото или существующих прекомпов по кадрам.
  Допустима пустая композиция. Для дробного fps используется фактическая
  сетка кадров, возвращённая AE.

### Decision Log

- Для AE API переиспользованы приёмы старых `create_comp`, `import_footage` и
  `add_project_item_to_comp`. Новый исполнитель использует собственный контракт
  Core4, точную цель, проектный checkpoint, действующий lease и нативный диалог.
  После диалога перечитываются целевой AEP и входные файлы. Сбой после начала
  записи оставляет исходную команду в `UNKNOWN`.
- Следующий самостоятельный шаг — типизированное сохранение текущего рабочего AEP
  с побайтным файловым checkpoint и подтверждённым результатом на диске. Создание
  или открытие AEP отдельно связывает смену проекта с рабочей сессией Core.

### Validation

- Первоначальный прогон `project-assembly`, `installed-composition`, `manual-runtime`
  и `package-location` прошёл 82/82. После расширения формата fps прошли все пять
  тестов сборки, обнаружение через временный установленный MCP и `package-location`.
  Сквозной тест использует Broker → signed HTTP → собранный ES3 registry с имитацией
  AE. Сборки воспроизводимы из путей с пробелами и Unicode, 48 случаев размещения.
- После объединения с принятым Slideshow `a88cec7` прошло 18/18 тестов сборки,
  рендера и компилятора S1. Границы 66 файлов и `git diff --check` пройдены.
  Общий MSI standalone `b0622b971eaeffc0e0d05e1330bbfa9683c753ca1b3a75fcbd26455e824c2ad1`
  содержит 131 файл. Пакет `86b68cdf2b089d82b6c4a9a12734a4002bac80aa0834b62c0e7c7a6efbb1ae36`.
- Нативная приёмка на MSI описана ниже. Десктоп отложен по поручению пользователя.

### Нативная диагностика MSI

- Пакеты `86b68cdf…` и `8767e46c…` установлены штатно. Первый обнаружил
  неоднозначное ветвление классификации в ExtendScript. Отправок записи не было.
  После явного разделения ветвей снимок правильно различает фото и прекомпы.
- На втором пакете AE создал comp 57, импортировал JPEG 70 и добавил слои.
  В исходной квитанции `command-95b4be6c-eeb0-4ab0-8b6e-c68734e1c3ba`
  `outPoint` слоя 71 сдвинулся с кадра 90 на 120 при установке `inPoint`.
  Broker оставил `UNKNOWN`, повторов команды не было. Результат сохранён
  только в отдельном `assembly-proof.aep`.
- Возвращён порядок старого `add_project_item_to_comp`: `startTime`, `inPoint`,
  затем `outPoint`. Фикстура воспроизводит observed AE shift. Проверено 18/18
  тестов, подготовлен пакет `bfbee344…` / standalone `f470d6b1…`.
- Штатное восстановление `d9ea7ac9-d35b-4b1f-a6e3-25f0766b7a63` завершено.
  SHA обоих архивных журналов совпали с префиксом до сброса. Исходная команда
  осталась в архиве, новых попыток по её ID не было.

### Нативная приёмка MSI

- Пакет `bfbee344f71de67058cf86b717fd17d24d8b7539c20da045ec1e8aabaf6fe113`
  установлен и включён через stop `c70864fc-084a-4f8e-8565-9077c05c8f77` и
  update `d2c717dd-bc69-4346-921b-581447c6ed02`. Привязка
  `ac07327f-418a-4957-b50d-bc3a22e78a22` сверила точный `assembly-proof-fixed.aep`
  и AE 25840. MCP подключился через `file://` в новом сеансе.
- Одна новая команда `command-8192c246-26cc-4a1a-ac5b-b7d4eaf6bcf2` завершилась
  `succeeded`. В comp 57 размер 3840×2400, 90 кадров при 30000/1001 fps.
  Верхний слой 71 с новым JPEG 70 занимает `[30,90)`, нижний слой 69 с прежним
  прекомпом 29 занимает `[0,90)`. Нативный диалог подтверждён после сверки цели.
  Исходная квитанция побайтно совпала с каноническим свежим снимком.
- Lease освобождён, текущие pending/UNKNOWN/fault отсутствуют. Оба AEP Slideshow
  и оба JPEG сохранили прежние хеши. Новая композиция открыта в памяти отдельной
  тестовой копии. Типизированное сохранение остаётся самостоятельным этапом.
  Локальные квитанции: `.codex-runtime/project-assembly-msi-live-20261107/`.

## 7 ноября. Типизированное сохранение текущего AEP

### Progress

- Добавлен состав `manual-project-save` с командой `project-save / save-current-project`.
  Цель берётся из точного пути уже открытого AEP и текущего рабочего сеанса.

### Decision Log

- Из старого `save_current_named_project` сохранены точная цель, исходный SHA-256,
  независимая копия предыдущей версии и чтение результата. Core создаёт копию после
  проверки host reservation. После нативного подтверждения JSX сверяет ревизию и
  прежние байты перед вызовом `app.project.save()` по текущему пути. Node привязывает
  SHA-256 файла и копии к исходной квитанции. Ошибка проверки после начала записи
  оставляет команду в `UNKNOWN`.
- Поддерживается обычный локальный `.aep` до 64 МиБ. Копия содержит последнюю
  дисковую версию. Для «Сохранить как», создания и открытия нужен отдельный этап
  смены проекта и повторной привязки рабочего сеанса.
- На MSI `File.modified` в ExtendScript возвращает время с точностью до секунды.
  Сверка учитывает эту точность, а допуск перед записью требует побайтного
  совпадения AEP и копии. Для процесса AE, который работает вне Codex MSIX,
  Core получает физический путь к каталогу копий и сверяет identity с каталогом
  состояния установки.

### Validation

- 91/91 тестов прошли на итоговых исходниках. Семь проверок сохранения работают
  через брокер, подписанный CEP HTTP и JSX в VM. Установочный MCP обнаружил
  операцию. Матрица пакета прошла 60 сценариев с пробелами, Unicode и запуском
  из другого каталога.
- Первые два нативных чтения завершились отказом без записи. На третьем пакете
  чтение прошло, но подготовка копии отказала до физической отправки. Резервация
  закрыта как `not-dispatched`, исходный SHA-256 сохранился.
- Итоговый MSI-пакет `b24d4250f5d3af63380a811da4ab2c5753fd68f7e7def28957183d6934170a9c`
  установлен через stop `1de40f75-1416-41c1-ae7c-a144c3fec19b` и update
  `09c7644b-232c-4685-8ea8-79128c151dcf`. Standalone `bef14340…`, 137 файлов.
  После загрузки панели штатный настроенный MCP подтвердил `file://`.
- В `assembly-proof-fixed.aep` подтверждён точный диалог с путями цели и копии.
  Команда `command-ec480cc9-bd2e-49a3-8213-f390f209f861` получила `succeeded`.
  Копия `checkpoint-7526dec9-434a-4e56-ab88-e65028124e02.aep` содержит исходные
  215641 байт (`977492c2…`). На диске сохранены 352383 байта (`8d21bbee…`).
  Свежий снимок совпал с квитанцией, `dirty=false`. В открытом проекте перечитаны
  comp 57 и оба слоя. Lease освобождён, pending/UNKNOWN/fault отсутствуют.
  Десять соседних файлов и привязок совпали по SHA-256 после записи.
- Свежие квитанции лежат в `.codex-runtime/project-save-msi-20261107-v4/`.
  Приёмка покрывает сохранение и чтение с диска на MSI. Повторное открытие
  AEP и нативная приёмка на десктопе остаются отдельными проверками.

## 7 ноября. «Сохранить как», создание и открытие AEP

### Progress

- Первый сценарий `project-lifecycle / transition-project` переносит «Сохранить как».
  Core резервирует новый каталог назначения, создаёт копию прежнего файла и
  связывает запись с точным исходным AEP, его ревизией и подтверждённым путём.
- `action: create` создаёт пустой AEP после проверки, что в исходном проекте
  нет несохранённых правок. В результате сверяются пустой инвентарь и SHA-256
  обоих файлов.
- `action: open` открывает существующий AEP при чистом исходном проекте.
  SHA-256 назначения входит в план. Побайтная сверка с временной копией
  проверяет назначение после диалога, а отдельное чтение подтверждает его
  SHA-256 после открытия.

### Decision Log

- Для новой копии требуется отсутствующий каталог в существующем родительском
  каталоге. После подтверждения AE сверяет прежние байты и отсутствие файла
  назначения. Node проверяет SHA-256 источника и результата. После смены пути
  обычные мутации требуют штатного stopped readoption на новую цель. План
  привязан к записи adoption, поэтому прежний план не оживает при возврате к AEP.

### Validation

- Первый этап прошёл три проверки через Broker, подписанный HTTP и JSX в VM.
  Проверены перенос несохранённого содержимого, защита назначения, устаревший
  план и `UNKNOWN` после неопределённой записи. Нативный прогон следует после
  подготовки всей последовательности.
- Две адресные проверки создания прошли. Подтверждены пустой проект на диске
  и отказ от смены проекта с несохранёнными правками.
- Две проверки открытия подтвердили выбранный AEP и отказ при неверном
  SHA-256 или изменении назначения во время диалога.
