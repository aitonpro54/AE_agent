# Штатный запуск AE и проверка загруженной панели

## Цель и scope

По поручению пользователя: запускать After Effects и собственную CEP-панель
штатным инструментом без Computer Use; получать версию именно загруженной
панели через проверяемый ответ; завершать Computer Use сразу после UI-блока.
Это отдельный engineering block, не продолжение продуктовых Titles/Slideshow.
Публикация Git refs и полная release-приёмка не назначены.

## Progress

- База исходников: a238259 (Core 4.2.5). До начала уже изменены AGENTS.md и
  plans/core-transfer-4.2.5-20261111.md; эти изменения сохраняются.
- Текущий configured runtime: Core 4.2.4, package 193539df…, AE 23616,
  CEP connected/file://. Статус не сообщает версию загруженной CEP-копии.
- Архитектура startup/loaded-panel identity: ae_architect startup_contract;
  причина — границы запуска хоста, подключения и проверки live-identity.
- Штатное завершение Computer Use исследует read-only ae_scout
  cua_cleanup_facts. Единственный live-контроллер — координатор.
- Архитектурный контракт принят; реализация и адресные offline-проверки
  переданы ae_implementer startup_implementation (Sol/high). Причина —
  ограниченная реализация уже определённых startup/handshake/packaging границ.
- Пока шло исследование, отдельный чат «4.2.4» завершил установку Core 4.2.5
  и перешёл в idle. Его исход прочитан без повторения stop/update/enable.
  Свежий configured client подтвердил b24af0e1… / 4.2.5, CEP disconnected;
  старый MCP-клиент этого чата не используется для дальнейших live-действий.

## Decision Log

- Новый путь сохраняет existing Host/Origin/auth, очередь, lease, UNKNOWN,
  ownership и все gates изменений проекта. Открытие панели не предоставляет
  права на изменение AEP и не требует его сохранения или перезапуска AE.
- Версия исходного/установленного manifest не выдаётся за версию загруженного
  CEP. Проверка должна различать отсутствующую, старую и совпадающую панель.
- Пути и AE identity получает общая локальная установка; hostname-веток и
  встроенных пользовательских paths в переносимом коде нет.
- Отдельный explicit `core_ensure_ae_panel` принимает UUID операции и bounded
  timeout, сохраняет intent до внешнего действия и неизвестный исход без replay.
  Status/connect не запускают приложение скрытно. Отсутствующий AE запускается
  один раз по проверенному executable binding; один существующий сохраняется;
  неоднозначный inventory отклоняется до dispatch. Host-adoption используется
  как locator, а не как authority для новой incarnation AE.
- Fixed package-owned JSX открывает только собственную панель через точное
  имя меню и проверенный положительный command ID. Произвольных scripts/paths/
  command IDs от клиента нет. Adobe документирует AfterFX.exe -r как запуск
  JSX в существующем процессе: https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html.
- Литерал версии/build identity в выполняемом panel.js передаётся в MAC
  существующего /link; owner сверяет его с проверенным release. Старая панель
  с новой installation config не получает рабочий command lane.
- У старой 4.2.4/4.2.5 нет подтверждённого self-reload контракта. Новый ensure
  не перезапускает пользовательский AEP: stale/cache ambiguity сообщает
  конкретно. Новая панель получает стабильное имя меню AE Agent Core.
- Для native sky документированного teardown API не найдено. Правило немедленно
  завершать доступный UI-протокол/прекращать UI-вызовы закреплено в общих
  C:/Users/Ant/.codex/AGENTS.md и docs/tool-first-workflow.md. Убийство helper,
  закрытие AE и удаление плагина не выдаются за завершение UI-сессии.

## Validation

Предстоят: scoped позитивные/негативные тесты запуска и live-identity,
packaging/closure/boundaries, независимое ограниченное review, проверка
штатного пути на доступной машине без Computer Use и фиксация ограничений
недоступной среды. Установка/открытие панели выполняются только после
проверки реализации; пользовательский AEP сохраняется без изменений.

- Configured preflight: существующий проверенный launch-check.cjs status
  startup-work-baseline-01 → PASS, server4.2.5/package b24af0e1…, native calls0.
- Native Computer Use/CUA вызовов в этом engineering block — 0. Другой чат
  сообщил, что пользователь остановил свой UI-блок через Esc.
- Доступные проекты/чаты сейчас показывают только local desktop; доступный
  MSI host не найден. Локальная адресная проверка не будет названа MSI-приёмкой.
