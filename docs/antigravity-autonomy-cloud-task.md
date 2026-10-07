# Облачная задача: автономный режим Antigravity для AE Agent 3.3.0

Статус пакета: **offline_ready**. Это решение и ограниченное техническое задание для облачного Codex; оно не означает, что изменения реализованы, установлены или активированы. Локальная приёмка выполняется после облачных commits отдельным исполнителем и единственным контроллером AE/CEP.

## Цель и пользовательский контракт

Добавить в CEP вторую кнопку, визуально и по поведению повторяющую текущую «Автономная сессия Codex», расположенную непосредственно ниже и названную «Автономная сессия Antigravity». Это два взаимоисключающих переключателя одного серверного владельца: `codex`, `antigravity` или `off`. Одновременно активен максимум один; выключенное состояние обоих разрешено и возвращает ручной CEP flow. Существующее включение Codex при первом доверенном подключении панели сохраняется. Явное выключение Codex остаётся выключенным; новые старые boolean-записи мигрируют `true → codex`, `false → off`, отсутствующая настройка получает прежнее значение по умолчанию. Повреждённое состояние закрывает автономную авторизацию. Поздняя запись старого boolean-клиента не должна отключать или переизбирать владельца Antigravity.

![Текущая кнопка Codex и её пояснение в CEP](assets/antigravity-autonomy-reference.png)

Скриншот — только визуальный пример текущего состояния: зелёная кнопка Codex, пояснение о typed tools/подтверждениях и Bridge connected. Не делайте выводов о наличии или работе второй кнопки по этому изображению.

## Полномочия и протокол

Оба владельца получают одинаковый полный каталог уже существующих typed read/build/proposal/dry-run/server-proposed mutation/read-back возможностей и одинаковые ручные gates. Toggle не управляет поиском/сбором кандидатов, продвижением рецептов, статистикой или выбором Codex-модели. Raw JSX, direct mutations и destructive/protected raw/delete/save операции сохраняют свои нынешние подтверждения; автономный режим не ослабляет их.

Сервер хранит одно `desiredOwner: codex|antigravity|off`. Личность клиента определяется двумя раздельными server-side сопоставленными automation credentials: текущий `AE_BRIDGE_TOKEN` остаётся ролью Codex, для Antigravity вводится отдельный automation secret, задаваемый панелью/администратором. Panel credential и automation credentials остаются разными. Имя модели, request header, UI-переключатель и клиентское заявление не подтверждают личность. Не выводить и не копировать реальные секреты; в примерах использовать только имена переменных и placeholders.

Каждый proposal, dry-run receipt и execution связывается с server-issued `ownerClientId` и `authorityEpoch`, плюс со всеми существующими tuple guards (action/revision/hash, project/session и срок). Повторно проверять владельца и epoch на всех alias/маршрутах: в момент proposal, выдачи и асинхронной регистрации, dry-run, CAS/перехода состояния и непосредственно до каждого исполнения/submit. При смене владельца epoch увеличивается; stale aliases и незавершённые async registration не могут принять результат после смены. Нельзя усыновлять, подтверждать, вытеснять или исполнять чужой pending proposal, lease, run или receipt; существующий контракт «новый pending proposal заменяет старый» должен стать owner-scoped.

Переключение отзывает старые queued, ещё не submitted команды. Уже submitted команды не объявлять отменёнными: дождаться их фактического завершения, прочитать состояние и зафиксировать partial/unknown результат. Пока выполняется reconciliation, новый владелец не получает mutation authority. Затем старый владелец отзывается, а новый начинает с нового proposal и нового успешного dry-run; lease не наследуется. Таймаут/unknown, незавершённый run, pending command или ошибка persist блокируют выдачу полномочий и повтор операции до read-only reconciliation. Ручной flow при `off` остаётся доступен.

При cancel применяются TTL и точная проверка владельца/панели; владельцы не могут отменить чужую работу. После рестарта panel identity/connection generation свежие, прежний lease не восстанавливается. Persisted desired owner можно сохранить, но при недоступной identity автономная authority выключена до свежего доверенного подключения. Откат функции переводит Antigravity в `off`, отзывает её queued authority и не восстанавливает устаревшее предпочтение; далее работает Codex в прежней семантике или ручной режим. Не допускать, чтобы старый boolean write незаметно восстановил Codex.

## Провайдер и делегирование

Сохранять версию **3.3.0**. Автостарт adapter использует полную существующую server configuration и не подменяет Codex automation token токеном панели/Antigravity. Общие CLI настройки и независимый выбор модели Codex-чата не меняются. Пользовательский routing остаётся прежним: при активном Codex Flash может подготовить draft/materials, но только Codex предлагает, dry-run и запускает server-authorized typed plan. Делегированный Flash/Antigravity не получает временную или неявную mutation authority; переключение владельца не выполняется автоматически.

Сохранить существующий каталог `agy-bridge` и CLI. Краткий контракт для исполнителя: общий bridge — отдельный проект (`C:/Users/Ant/Documents/Codex/agy-bridge`, проверенный HEAD `7ea628f0a94303999da8f53938988e3890635281` на момент подготовки), AE Agent — клиент с `config/agy-bridge.json`; профиль `ae-agent` задаёт модель `gemini-3.8-flash-high` и настроенный effort `high` (это значения конфигурации; эффективный effort может быть неизвестен). Использовать `run`, `status` и `diagnostics` существующего CLI, штатный singleton process и закреплённые resources. Не создавать второй bridge, сервер/очередь или альтернативный fallback; не читать/переносить runtime state, conversations, пользовательский config либо секреты. Соседний проект не менять.

## Владение исходниками и последовательность

Менять только необходимые текущие точки входа: `mcp-server/autonomous-session.js`, `http-boundary.js`, `proposal-state.js`, `bridge-daemon.js`, `mcp-adapter.js` и CEP panel. Обновить документацию/API/tool guidance так, чтобы Codex и Antigravity имели один явно описанный контракт. Новую архитектуру не вводить; расширять существующие identity, proposal, lease, queue и read-back механизмы. Frozen Intake/importer boundary `config/frozen-intake-manifest.json` не трогать; зависимости и провайдеры не менять.

Разбить работу на три reviewable milestones, каждый со своим commit и записью `Progress`, `Decision Log`, `Validation` в плане:

1. Контракт полномочий, миграция persisted state и серверные guards/epoch/CAS.
2. CEP переключатель, раздельная credential mapping и adapter/integration.
3. Offline acceptance и эксплуатационная документация.

## Offline-приёмка

Выбрать фактически изолированные группы autonomy, panel-auth, planning и recovery; сначала проверить их scope. Добавить/использовать настоящие module-level offline tests с fake transport/storage, не выдавая их за live proof. Минимальная матрица: клиенты Codex/Antigravity × owner `codex`/`antigravity`/`off`; межклиентский spoof; вызов каждого alias; гонки переключения с queued/leased/submitted и async CAS registration; отсутствие чужого pending supersede/receipt/run; старые true/false/missing и corrupt persisted state; restart с новой identity; partial/unknown reconciliation без blind retry; raw/delete/save confirmation; ручной CEP flow в `off`; старый boolean write после выбора Antigravity. Дополнительно — целевые синтаксические проверки всех изменённых JS, `npm run check:rules` (на Linux использовать `npm`, не `npm.cmd`) и `git diff --check`. Не запускать live AE/CEP, модельные вызовы/Flash/AGY, provider изменения, установку/активацию, save/reopen, push, PR или merge.

## Условие передачи локальному контроллеру

Завершённый облачный пакет пометить только `offline_ready`. Вернуть базовый и итоговый commit, diff stat, SHA-256 каждого переданного файла, команды и результаты проверок, известные пробелы/ограничения доказательств и точные шаги handoff. Если remote недоступен — собрать проверяемый Git bundle; remote не менять и не отправлять изменения.

Локальная активация — отдельный этап после проверки diff/commit/bundle и offline suites: зарегистрировать настоящие раздельные automation credentials в фактическом MCP server с минимальным scope; установить/перезагрузить только предусмотренную CEP-копию в idle-порядке, сверив точный target/hash; получить фактический скриншот двух кнопок, проверить default Codex, persistence, переключение на Antigravity, `off` и затем Codex, restart и reconciliation. На disposable project выполнить по одной обратимой typed operation от каждого владельца с обычными proposal → dry-run → server-run → независимый read-back; отдельно проверить защищённые raw/delete/save confirmation и ручной flow. Сохранить пользовательские AEP/preferences до тестов. Не объявлять локальную активацию или acceptance завершённой без этих фактических read-back и UI evidence; cloud offline tests сами по себе этого не доказывают.
