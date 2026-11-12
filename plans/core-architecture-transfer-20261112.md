# Передача архитектурного разбора в Core-чат

12 ноября 2026. Передача по прямому новому поручению пользователя, полученному
от чата «Провести аудит архитектуры», `01a1cede-3e0f-7aa1-a375-be24e49bec1e`.
Исходный чат «Настроить мост к Chrome» прекращает работу после этой записи.

## Цель и исполнитель

Пользователь попросил выставленную им для ответа «Астру» повторно разобрать
архитектурные составляющие Core и подготовить план для нового чата реализации.
Scope остаётся **анализ + план**, реализация не назначена. Архитектурные решения
принимал текущий основной агент; фактическое имя модели по selector не утверждалось.
Luna ae_scout использовалась только для read-only карты composition/tests.

## Подготовлено

- `plans/core-architecture-implementation-20261112.md` — 37553 байта, полный
  черновик плана: архитектурная карта, 20 границ, разбор AE/G замечаний,
  контракты и три этапа A/B/C с критериями приёмки и stop-lines.
- `plans/core-architecture-new-chat-20261112.md` — 4450 байт, готовый черновик
  запроса для будущего чата. Он ничего не запускал, новый чат не создавался.

Все пути здесь относительно `C:/Users/Ant/Documents/Codex/AE_agent_core`.
Оба файла untracked; commits в этом проходе **не создавались**.

## Новые существенные выводы

1. Сохранить архитектуру. Сначала A1 lower close, A2 bootstrap diagnostics,
   A3 allowed builder keys; затем B composition/identity; C targeted integration.
2. `runtime/attachment-owner.js:215` теряет ожидание повторного close, но верхний
   `runtime/stdio-entry.js:462–497` уже сохраняет shared promise/maintenance.
   Правка нижнего слоя не требует общего shutdown redesign.
3. `cep/js/poll-dispatcher.js:99–115` теряет registry_refresh_failed; текущий
   `panel-lifecycle.test.js:100` прямо ожидает invalid_frame. Первый контракт —
   сохранить диагностику, не вводить terminal rejection/автоочистку latch.
   `panel.js:276,317–320` уже проводит error.message в UI. Sync throw/нет callback
   остаются неопределёнными. Signed retirement сохраняется.
4. `core/broker.js:173–183` проверяет desired/target/expectations, но не запрещает
   новые optional schema-valid keys вне desired и expectedBindings. Проверка
   нужна в общей функции, используемой и build, и materialize.
5. G-02 — неполный catalogRevision, а не nondeterminism. В
   `tools/package-installable.js:75–83` revision перезаписывается последним
   отсутствующим в исходном catalog модулем. Полный digest меняет package hash.
6. **Главная новая граница плана:** pure helper extraction не является простым
   перемещением кода. `stdio-entry.js:296–364` проверяет дерево и одновременно
   interprets composition; `start:367–374` устанавливает entry/root после вызова
   verifier. `tools/check-boundaries.js:8–20` запрещает non-builtin imports до
   verification. `client-entry.js:98–100,230–232` импортирует stdio entry после
   собственной проверки. Новый helper нельзя загрузить раньше подтверждения
   именно его дерева/root. В B0 предусмотрен отдельный контракт; legacy packages
   без helper должны иметь явный исход. Если это требует нового trust протокола,
   ограничить extraction post-verification consumers и сохранить verifier inline.
7. **Риск будущего выпуска:** exact-version checks, в частности
   `stdio-entry.js:233` registryVerification только для 4.2.6 и
   `package-installable.js:97–105` verification/registry generation. Новый номер
   версии нельзя менять без явной compatibility matrix. Это не текущий exploit.
8. `manual-titles-variants` наследует manual-titles → manual-layout → manual;
   minimality проверять по фактической closure. Render history/maintenance в
   общей базе не удалять по названию: может быть обязанность выявить старые jobs.
9. Frozen MSIX root-rebase явно остаётся остановлен; новая identity/startup и
   live product proof не закрываются текущим fresh empty-project read.

Подробные решения, limitations и source anchors уже в основном плане.
Полное чтение каждой строки репозитория и отсутствие всех дефектов не заявлялись.

## Реально выполненные проверки

- HEAD `48576d1`, ветка `codex/ae-panel-startup`; product diff core4/products к
  `6d40cc228d9f2e18c672af5782033be305b82917` пуст.
- Read-only source/docs reads; fresh hashes чужих dirty файлов совпали с аудитом:
  AGENTS.md `0097d035294e889dd2b4410fb247938764d8b007c226893911c3ef4772f6f700`;
  transfer plan `cc9ca6acebbc0732587a82c3dfd94da57f8a850c39f38ee6c2bf8b7936926bb7`.
- Вызван `selectChecks` без запуска tests. Путь → checks/batches/deferred:
  attachment-owner 14/14/31; poll-dispatcher 7/7/29; stdio-entry 30/30/25;
  package-installable 12/12/35; broker 26/19/31. Это read-only routing, не PASS.
- Нет product tests/build/install/AE/browser/CU/config writes, внешних отправок.

## Незавершённое

Последний apply_patch для добавления таблицы test mapping и исправления опечатки
отклонился целиком: строку «адmission» искали не в том файле. Фактический исход
проверен: таблица selectChecks не добавлена, исходные два плана сохранены.
Опечатка находится в implementation plan, строка 291.

Принимающему чату остаётся документальная финализация: добавить актуальную карту
проверок при необходимости; сверить относительные ссылки и diff; уточнить, что
готовность source-реализации не равна live acceptance; затем сообщить итог
пользователю. Не запускать реализацию без нового поручения.

Адресные существующие тесты из scout:
owner-attachments/owner-ipc-process/controller-transfer-ipc;
panel-lifecycle (100 failure, 216 signed retirement), start-over-channel (126 sync throw);
installed-composition (44 deterministic closure), installable-runtime (374 package,
883 callback loss, 992 crash); manual-runtime (27 Broker+HTTP+compiled JSX fixture,
105 UNKNOWN, 131 receipt/reconcile); owner-runtime (955 diagnostic crash).
Test source — покрытие в коде, не новый результат выполнения.

## Процессы, helpers, рабочее дерево

- `/root/architecture_inventory` (`ae_scout`, Luna) завершён, файлов не менял.
  Его immutable snapshot создан git archive 48576d1 core4 в
  `C:/Users/Ant/AppData/Local/Temp/core426-architecture-inventory-48576d1`.
  Архив и распакованные tracked source оставлены; credentials/runtime state нет.
- Активных запущенных этим проходом процессов/отправок/ожидающих операций нет.
  UI-блок не открывался; CU для проверки остановки не запускается.
- Чужие dirty: `AGENTS.md`, `plans/core-transfer-4.2.5-20261111.md`.
- Свои новые: два плана выше и эта передача. Product source не изменён.
- Commit id этого прохода отсутствует; исходный HEAD 48576d1.

После этой записи исходный чат завершает turn и больше не продолжает работу.

## Приёмка в Core-чате

Принимающий чат получил финальный ответ исходного чата и штатный status idle:
turn завершён, помощник закончил работу, активных операций этого прохода нет.
Дальнейшая инициатива принадлежит Core-чату
`01a1cede-3e0f-7aa1-a375-be24e49bec1e`; автоматического продолжения в прежнем
чате и нового внешнего запроса нет.

Документальная финализация выполнена здесь. Независимый ae_reviewer прочитал
оба плана и нашёл один P2: A1 оставлял второй нижний facade.close в
stdio-entry.js:718. Он добавлен в ownership и offline deferred/rejected fixtures;
верхний exposeOwner/maintenance сохранён. Остальные проверенные контракты
получили ACCEPT как план, без новой live acceptance.

Добавлена таблица исходного read-only test mapping, уточнены роли и scope,
исправлена опечатка admission. Относительные ссылки проверены; исходные
dirty файлы сохранены по SHA, product diff core4/products к 6d40cc2 пуст.
Исходная запись выше сохраняет состояние на момент передачи; текущая
приёмка относится к последующей документальной редакции.

Результат — план и готовый промпт для отдельно поручаемой реализации.
Создание нового чата, выполнение A/B/C, product build/install и live AE
этой передачей не запускались. Документы фиксируются принимающим чатом
отдельным commit, без двух чужих dirty файлов.
