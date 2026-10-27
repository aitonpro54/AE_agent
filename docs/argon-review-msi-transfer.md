# Перенос Argon review workflow на MSI — 27 октября 2026

## Статус и provenance

Документальный workflow доступен в Core4 по ссылкам из `AGENTS.md` и `README.md`. Исходный маршрут заменён на MSI controller `01a17d90-d9dc-7531-a1d7-e50b3f8a501d`, projectId `bc4a1ea4-d52c-47f5-8591-6fc00af37ec0`, project root `C:\Users\Ant\Documents\ChatGPT\ARGON_BrowserUse`. Источник примера `reviews/argon/m2a/offline-20261026/verification.md` остаётся в исходном worktree и не переносился; новых ревью/отправок нет.

При файловом переносе браузер не проверялся. Затем пользователь отдельно разрешил проверку через существующий MSI controller. Свежий inventory подтвердил Chrome extension, профиль «Ваш Chrome»; Gemini открылся, но чтение вкладки и screenshot вернули Debugger unattached. Это новый сбой подключения, не новый URL deny. Соответствие Aiton/Rohan, чтение страницы, аккаунт и Argon не подтверждены; запросы/файлы/смена режима не выполнялись. Полный результат и ручной шаг сохранены в C:\Users\Ant\Documents\ChatGPT\ARGON_BrowserUse\MSI-STATUS.md. Этот перенос не добавляет автоматическую отправку, платный API, разрешение (permission) или новый skill.

## SHA-256 исходных документов

- `docs/argon-review-workflow.md`: `641318827D60A85EA6CA9676D17BD5EFC6B6A62770121E65946E82C74E1CB0CE`
- `docs/review-templates/argon-plan.md`: `F7F773D3580D1DD70E273EB0D2FFD5528CBF4DB0A515F80BE41E1C1E0C5FE4EA`
- `docs/review-templates/argon-result.md`: `70BB35C8156FAC3639F2EBA59F87B16E9D84492A12DA2B8D185E4F06D1926FCC`

Шаблоны скопированы без изменений. Workflow сохраняет manual-send/manual-fix/privacy/UNKNOWN правила; адаптированы controller/project/root и явный provenance notice для неперенесённого примера.

## Проверки и ограничения

Проверки PASS: строгий UTF-8 для четырёх перенесённых docs; все относительные ссылки workflow/templates на месте (4+1+1, report: 0); SHA обеих шаблонных копий побайтно совпадает с источником; read-back подтверждает MSI controller/project/root, оба skill target path и явные ограничения готовности и запрет обхода отказов. `git diff --check` PASS. Исходный `build_bundle.py` и обе MSI копии имеют SHA-256 `1A3480C0C620D32467B613D3F8DF2D86DA901F9065E8EE99432B38761296DFEA`; `python <UNC script> --help` завершился успешно локально (это не MSI execution). Продуктовые проверки не запускались (docs-only). Отдельная ограниченная browser-проверка MSI остановилась на Debugger unattached; успешный сквозной handshake/browser acceptance не заявляется. Пользователю нужно открыть ChatGPT extension в нужном профиле Chrome, проверить подключение к Codex и лично обработать показанный запрос доступа к вкладке, если он есть; затем проверить аккаунт Gemini. Backup глобальной политики: `C:\Users\Ant\.codex\backups\argon-review-20261027-01a17e21\AGENTS.md` (исходный и backup SHA-256 совпадают: `71A5004B21A7F85B51CBBB2A27065F3016415232318214331F37E69F6856CCCD`).