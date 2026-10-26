# Core 4.0.0: учёт работы через Codeburn

Статус: проект, 26 октября 2026. Ни Codeburn, ни его CLI/dashboard/MCP в этом этапе не запускались; БД не открывалась и не менялась. Архитектура Core: [границы и контракты](core-4.0.0-architecture.md); этапы: [план](../plans/core-4.0.0.md).

## Проверенная база и повторное использование

Исходный форк: `C:/Users/Ant/Documents/Codex/AE_Agent_Core_Codeburn`, ветка `codex/core-4.0.0-module`. Фактический HEAD — `55735f36034c5496bdfc253fde269622f56b015b`, база — `3f36f682cdafccc649811eb86011088ea9243b81`, upstream — локальный `C:/Users/Ant/Documents/ChatGPT/Codeburn`. Дерево чистое. После указанного в стартовом файле `da04f76` добавлен только документационный commit `55735f3` в `FORK.md`; кодовая база не изменилась. Форк не подключён к Core.

Адресное чтение подтвердило следующие точки расширения; номера относятся к этому HEAD:

| Источник в форке | Уже существующая возможность / ограничение |
| --- | --- |
| `analytics/store.py:30,75` | SQLite `sessions/events/streams/bindings/quota/overrides/meta`; события и дедупликация по ID, конфликтующие измерения отклоняются |
| `analytics/collect.py:244,412` | Подтверждённые response/thread/turn, subset-ограничения, инкрементальный сбор существующих источников |
| `analytics/collect.py:445` | Выбор effective/configured/request model; происхождение этого выбора отдельно не сохраняется |
| `analytics/store.py:189`, `README.md:31`, `web/help.js:67` | «Чаты и запуски», «Последние шаги», разбивка по моделям/provider, подробности, CSV, встроенная справка |
| `codeburn.py:27`, `analytics/report.py:14` | Query/report с explicit `--db`, read-only доступ; freshness, coverage и source errors |
| `analytics/web.py:37,186` | `serve()` запускает recovery-поток с `collect(..., quota=True)`; dashboard сейчас имеет побочный эффект сбора |

В проверенной схеме нет отдельных module/activity меток и effort. Нельзя объявлять configured model фактически использованной моделью без доказательства источника.

## Один владелец и расширение существующих событий

Предлагаемый владелец исходных usage events, ingestion, dedupe и БД — существующий Codeburn collector. Core не получает writer к его SQLite и не разбирает usage logs. Core/диспетчер задаёт описательные work units и передаёт проверенные связи в будущий ограниченный attribution API Codeburn; единственный writer и миграции остаются у Codeburn. До подключения нужно зафиксировать конкретную установку collector, абсолютный DB path и владельца процесса. Новый fork не запускается одновременно со старым сборщиком на той же БД.

Расширение — дополнительные атрибуции к `events.id`, а не копирование events. Предлагаемые логические сущности (точный DDL — отдельная будущая реализация):

- `work_units`: ID, цель, `recordContext`, parent/workflow binding, время начала/закрытия.
- `event_attributions`: один активный primary assignment события к work unit, `module`, `activity`, provenance, verified IDs и время назначения. Уточнения хранят историю, не создают второе событие расхода.
- `work_unit_modules`: список затронутых модулей для `shared/workflow`; это фильтры/связи, не несколько аддитивных копий usage.

Значения `activity`: `design`, `implementation`, `repair`, `maintenance/build`, `validation`, `user_work`. Для неразделимой работы `module=shared/workflow` и явный список компонентов. Атрибуция не выводится автоматически из cwd, текущего чата, имени файла или настроенной роли. Новая метка не даёт runtime authority.

Событие без подтверждённой связи остаётся `unclassified`. Назначение по thread допустимо лишь когда весь подтверждённый интервал относится к одному work unit; при смешанном чате нужны turn/response IDs либо честное shared assignment. Повторные запросы атрибуции идемпотентны; конфликтующее назначение требует явного решения владельца. Предлагаемое расширение existing `bindings` или новые таблицы нужно выбрать после проверки его семантики; это не повод проектировать второй ledger.

## Суммы, helpers и представление

Отчёт соединяет атрибуции с существующими событиями и сначала дедуплицирует `event.id`. Сумма токенов — `input + output`; cache является частью input, reasoning — частью output, повторно их не добавлять. Уже применяемые subset-проверки сохранить. Вклад helper включать только при подтверждённой parent↔helper thread/turn/response связи и наличии его уникальных событий. Parent total и helper total, содержащие одни и те же events, не складывать повторно. Для фильтра по нескольким модулям использовать distinct events; shared usage показывать отдельно, без выдуманных процентов распределения.

Расширить существующие «Чаты и запуски» и «Последние шаги» колонками/фильтрами work unit, module и activity, сохранив model/provider breakdown, details и CSV. В справку добавить правила атрибуции, shared usage, dedupe, freshness и ограничения. Стандартный вывод компактный; подробный отчёт запрашивается отдельно. Сбор, классификация по явным bindings и суммирование работают без модельных вызовов.

Каждый отчёт сохраняет `collected_at`, границы времени, coverage gaps, source/model provenance и ошибки источников. Quota snapshots относятся к аккаунту: точный процент лимита подписки по модулю из этих данных не получается. API-equivalent — отдельная условная оценка по тарифу, не фактически списанные деньги подписки. Effort и effective/configured model отмечать `unknown`, пока источник их не подтверждает; не восстанавливать из имени роли.

## Безопасное подключение и проверки будущего блока

Сначала отделить recovery collector от dashboard: отчётный запуск с explicit read-only DB не создаёт collector, quota polling, scheduler или миграцию. Collector включается отдельным явным действием владельца данных. Ошибка/отсутствие Codeburn не блокирует Core, работу с AE или сохранение core receipts.

Будущий блок проверяет только расширение: повторный ingest не увеличивает usage; повторная атрибуция идемпотентна; helper event учитывается один раз; shared event не умножается по числу модулей; cache/reasoning не увеличивают total; read-only report/dashboard не пишут БД и не запускают recovery; старая БД читается совместимо до явной миграции. Миграция и подключение — отдельный scope с backup/проверкой схемы. В этом проектировании эти проверки не исполнялись.

## Документальное соответствие уже начатой работы

Снимок на 26 октября 2026, 17:36 Asia/Yekaterinburg. Это карта привязок, не отчёт о токенах. Root thread UUID `01a1782f-f95b-7692-9368-d1e2f27825a6` подтверждён переменной текущего runtime `CODEX_THREAD_ID`; UUID общего MCP не использовался. Инструменты делегирования подтвердили canonical helper names, но не раскрыли их underlying thread/turn/response IDs. Эти имена пока нельзя использовать как ключ соединения с usage events.

| Work unit | Module / activity | Подтверждённая связь | Пробел покрытия |
| --- | --- | --- | --- |
| `core4-design-integration` | `shared/workflow` / `design`; core, plan-engine, photo-placeholder, titles, codeburn | Root thread UUID выше | Текущий turn/response ID и точные границы событий не установлены; не относить автоматически весь чат |
| `core4-architecture` | `shared/workflow` / `design`; core, plan-engine, photo-placeholder, titles | Helper `/root/architecture`, отправлен через `spawn_agent` | Helper thread/turn/response UUID не раскрыт; числовой вклад пока не включать |
| `core4-codeburn-evidence` | `codeburn` / `design` | Helper `/root/codeburn_evidence`, результат получен | Те же отсутствующие helper IDs |
| `core4-design-review` | `shared/workflow` / `validation`; весь design-пакет | Helper `/root/design_review`, read-only review получено без P1/P2 | Helper thread/turn/response UUID не раскрыт; числовой вклад не включён |

Строка review добавлена после фактического получения результата. Исторические usage events не переписывать; после реализации атрибуций импортировать только подтверждённые соответствия. Неподтверждённый остаток сохраняется в coverage gaps. Codeburn и его отчётные инструменты сейчас не вызывались, поэтому measured totals отсутствуют.
