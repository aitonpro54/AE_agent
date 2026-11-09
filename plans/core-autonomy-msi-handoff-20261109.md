# Передача разработки автономного фотомонтажа на MSI

9 ноября 2026. Цель и критерии сохраняются в [исполняемом плане](core-autonomy-implementation-20261109.md). Рабочий корень на MSI — `C:/Users/Ant/Documents/Codex/AE_Agent_Core`. Последний commit исходников на десктопе — `a1602420cc7a913f41bd73e4265c8a588f5061c8` на ветке `codex/core-412-desktop-s1-20261108`. Эта заметка идёт следующим коммитом и завершает передачу. Запись на десктопе остановлена. Перед записью на MSI сверить принятый Git tip и чистоту checkout.

| Commit | Что зафиксировано |
|---|---|
| `317c416` | P0a. Readiness, общий recovery, поиск comp по ID и курсор |
| `dda7cbe` | P1b. Потоковый checkpoint save/lifecycle, профиль до 96 МиБ |
| `d6ff1d0` | P0a. Сброс сохранённого допуска кнопки при потере связи CEP |
| `a160242` | WIP P0b, P0c и P1a. Передавать вместе с изменёнными тестами и этим планом |

## Порядок продолжения

1. Закрыть **P0b**. Изменения в `integrations/cep/{http-peer,completion-store}.js`, `runtime/{attachment-owner,client-stdio,stdio-entry}.js` и тестах `start-over-channel` / `owner-runtime`. Есть write-ahead, durable zero-handoff direct read, состояние handoff отдельно от недоказанного native start и окно 90 + 10 секунд для исходного direct read. Сверить обработку ошибки отправки poll, fsync, freeze во время ожидания, поздние и ошибочные привязки. Добавить отрицательные проверки PNG/мутации и истёкшего dry-run, повторить owner-runtime, исторические capture/disposition/recovery и валидировать текущую карту. Исторический валидатор сохраняет собственные исходные пины.
2. Закрыть **P1a**. Папка `modules/layer-overlay`, `runtime/layer-overlay-proof.js`, `config/admissions/layer-overlay.json`, `config/compositions/manual-layer-overlay.json`, профиль в runtime и заготовка `test/fixtures/manual-http-runtime.js`. Сначала сверить executor/builder и после source review обновить artifact/admission штатным `node core4/tools/seal.js --module layer-overlay --reviewed-source`. На WIP точная сборка `operator-photo-montage/owner` отказывает `package_artifact_mismatch`. Затем написать и выполнить VM/HTTP и нативный тест одного слота, включая ошибку после duplicate, пропавший callback, повтор доставки и повторный свежий proposal. Заявленный профиль пока ограничен 2D still одинаковой геометрии, ключами трансформаций, статическими масками, разрешёнными эффектами, наблюдаемым parent/matte и alpha. Произвольные выражения, layer-index и непрозрачные свойства требуют отдельного доказательства. Сверить marker/защиту от немаркированной частичной копии.
3. Связать **P0c** с P1a. `runtime/montage-mandate.js` и `operator-confirmation.js` дают подписанный мандат для одного task/epoch, AEP/session, точных слотов, файла и SHA, импортов и имён PNG. Предусмотрены свежий typed baseline того же peer, отзыв перед handoff и действующий proposal/reservation/claim. Стартовые команды оператора принимают `--montage-issue` с JSON scope либо `--montage-revoke` с task ID после descriptor/package pin. Сверить утверждённые поля с реальным broker approval каждого модуля, подписать тестовый scope через установленный операторский путь, проверить выдачу и повторный вход после сбоя. Save и reopen требуют отдельных точных разрешений. Несохранённое состояние остаётся в памяти до отдельного решения.
4. Закрыть **P1b/P2**. Раздельно измерить импортный inventory, lifecycle inventory, stack/dependency/transport и recovery budgets. Сохранить все защищённые поля и `checkBytes` после confirm. Добавить преflight большого AEP и проверяемый исход после частичного open. Затем пройти коллаж с общим прекомпом, повторным still под разными масками и alpha-портретом. Снять структурные read-back, PNG и время стадий. Собрать и адресно проверить переносимый состав на MSI и десктопе в разрешённой среде.

Перед каждым изменением сверять текущий Core, затем подходящий код legacy AE Agent. Источники duplicate, replace, track matte, снимка композиции и зависимостей закреплены в [таблице плана](core-autonomy-implementation-20261109.md#переиспользование-кода). Kumo рассматривать по оставшемуся конкретному пробелу. При переносе кода фиксировать источник и MIT-атрибуцию.

## Фактическая проверка и границы

- P0a 84/84 readiness, owner attachments и installable-runtime. Отдельные VM/HTTP проверки закрыли 1079 items, позднюю comp, совпадающие имена, границы и Unicode до 107549 байт в измеренном MCP-ответе. Panel/control 21/21 и driver/operator 10/10. TEMP recovery 12/13. Единственное расхождение в `start-over-runtime.test.js:62` сравнило позднюю сборку с fixture, созданным до изменений в checkout. Повторить на закреплённых байтах. Исторические capture/recovery в WIP не объявлены пройденными.
- P1b save/lifecycle 15/15. На синтетическом файле 95724372 байта SHA совпал, время SHA / копии с fsync / сверки составило 190 / 319 / 189 мс. Это файловая проверка, нативное сохранение или открытие валидного AEP такого размера открыто.
- WIP `start-over-channel` 17/17 и readiness/mandate 4/4. Проверка границ проверила 81 файл. `git diff --check` чист. VM/HTTP overlay и сквозной мандат через owner ещё не проверены. Промежуточный `readonly/owner` собрался с SHA-256 `2505b692e70b63bcea0e44a142218215de808ae8ace47c8c209479433981a49b`, 63 файла. Этот состав предназначен для чтения. Состав монтажа ещё не собран.
- DESKTOP-32974QF. Windows observer в ходе задачи увидел закрытый AE. На диске configured пакет `582744df1a5c…`. Новая установка, конфигурация, очередь, рабочий AEP и рабочий runtime не менялись. MSI и его текущая установка должны быть сверены на принимающей стороне. Нативного стенда, PNG и адресной приёмки кандидата на обеих машинах пока нет. Сохранять один live-контроллер, использовать disposable AEP и отдельные выходы.

| Аудит | Состояние к передаче |
|---|---|
| A1 | P0b WIP с 17/17 проверками канала. Owner/PNG/mutation gates и native остаются открытыми |
| A2 | Source/VM readiness и фактический Windows absent. Реальные модальные окна открыты для проверки |
| A3 | Общий recovery и VM PASS, один TEMP runtime повтор на закреплённых байтах |
| A4 | WIP подписанного мандата и separate save/reopen. Сквозной допуск и восстановление открыты |
| A5 | VM/HTTP PASS на 1079 items. Нативный курсор и точный lookup открыты |
| A6 | Потоковый disk profile PASS. Inventory/transport и нативный large AEP открыты |
| A7 | Overlay WIP, нужно обновить пины и провести VM/HTTP/native проверки |
| A8 | Ограниченный fail-closed профиль в WIP. Отдельные dependency tests открыты |
| A9 | Active comp, work area и dirty реализованы в P0a. Полный рабочий снимок открыт |
| A10 | Частично закрыт через typed recovery и readiness. Нативный сквозной сценарий открыт |
| A11 | Мандат фиксирует Core как backend. В сценарии монтажа предстоит подтвердить исполнение |
| A12 | Есть раздельное время файловой стадии. Сквозной замер и вмешательства открыты |
| A13 | Передача позволяет продолжить реализацию без RDP. Автономный нативный прогон и приёмка на обеих машинах открыты |
