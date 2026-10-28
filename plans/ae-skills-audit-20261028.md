# Проверка AE-скиллов — 28 октября 2026

Основание: прямое поручение пользователя проверить AE-скиллы на старые версии и
инструкции во время продолжения Core. Baseline Core `ac050cc`; пользовательские
skills находятся вне Git этого проекта в `C:/Users/Ant/.codex/skills`.

## Progress

- [x] Проверены 12 skill folders, их необходимые references и актуальные scoped
  AGENTS исходного `AE_agent` и независимого `AE_agent_core`.
- [x] Обновлены 5 пользовательских SKILL.md и 1 связанный reference; исходные
  файлы сохранены в `snapshots/ae-skills-audit-20261028/before/`.
- [x] Выполнена независимая read-only оценка четырёх рабочих сценариев;
  подтверждённые замечания к full smoke и missing-context формулировке исправлены.
- [x] Сохранены переносимые [patch](../docs/skill-audits/ae-skills-20261028.patch)
  и [manifest](../docs/skill-audits/ae-skills-20261028-manifest.json) с before/after
  SHA-256; reverse patch check прошёл без изменения файлов.

## Findings и решения

| Область | Подтверждённая проблема | Результат |
| --- | --- | --- |
| `ae-mcp-bridge-workflow` и `references/bridge-patterns.md` | Solution/recipe tools, legacy daemon/token/status и old plan API задавались почти универсально | Разделены исходный AE_agent, база Core 3.3.5 и независимый Core4. Для Core4 указаны фактически существующие generic module/plan tools; raw API не предполагается, legacy state/authority не переносится |
| `ae-computer-use-workflow` | Legacy reload script мог применяться к Core4; в запрете pinning оставался старый номер vendor-копии | Reload ограничен исходным AE_agent; правило выбора установленной vendor-версии обобщено. Default ограничения UI сохранены, прямое поручение пользователя по-прежнему выше skill-guidelines |
| `cep-panel-controls` | Недостаточно явная граница legacy credentials/reload и Core4 | Явно отделены role/peer/store/package bindings Core4; старый daemon/adapter не запускается ради его reload |
| `ae-full-intake-orchestrator` | Обязательная ссылка на отсутствующий historical triage file, старый default ledger без проверки существования, stop по 70/76% контекста | Читаются текущие active docs; historical файл только если существует и объявлен active. Run/ledger сначала проверяются. Контекст не вызывает остановку или новый чат; required runner input не выдумывается |
| `full-intake-repo-orchestrator` | Synthetic context meter, automatic new chat и full repo smoke перед каждым commit | Работа продолжается после compaction в том же чате. Новый чат/пересылка только по прямому поручению, с поддержанными tools и verified target. Проверки выбираются scoped контрактом, full release не становится следствием commit |

Без изменений оставлены `ae-task-routing`, `ae-safe-project-automation`,
`ae-scriptui-panel-workflow`, `ae-slideshow-template-workflow`, `antigravity-cli`
и обе копии `pro-review-bundle`. Их проверенные legacy разрешения ограничены
исходным AE_agent и не переносятся в Core. Обе Pro-review копии байт-в-байт
совпадают; обязательного повторного Argon result/fix/final review не найдено.
Дубликаты не удалялись.

## Decision Log

- Аудит не превращает правильно scoped legacy сведения в ошибки. Существующие
  model/effort/provider routes и режимы Intake сохраняются; текущая модель и
  настройки runtime не менялись. Сам Intake и внешние review не запускались.
- Computer Use default deny обнаружен в актуальном vendor guidance, а не в
  старой версии пользовательского AE-skill. Замечание «убрать пользовательский
  приоритет» отклонено: действующие developer/user инструкции прямо сохраняют
  приоритет прямого поручения над skill-guidelines. Vendor cache не менялся.
- Отсутствующий context input блокирует только runner, который требует его,
  а не независимую разрешённую source/read-only работу. Метрика не подделывается.
- `full release` и обязательные scoped checks остаются разными видами проверки.
  Generic skill не вводит новый release gate для Core перед каждым commit.
- Новые skill scripts/dependencies не добавлялись. Правки обратимы из backup;
  patch и manifest сохраняют проверяемые изменения для переноса. Сам audit
  packet не применяется автоматически и не несёт runtime authority.

## Validation

- UTF-8 прочитан для всех изменённых файлов; исходный newline format сохранён.
  Frontmatter четырёх entrypoints сохранён; у generic Intake изменено только
  проверенное plain-text description, name/остальные поля сохранены.
- Четыре независимых behavioural сценария: Core4 read-only inspection,
  legacy panel reload при разрыве MCP, продолжение при context78%, обычный
  MCP repair без явного ChatGPT UI поручения. Подтверждены границы API,
  authority, sole controller и продолжение текущего чата.
- После этой проверки исправлены два найденных wording остатка: unconditional
  full smoke перед commit и противоречие `preflight only`/independent source
  при отсутствии context метрики. Root проверил итоговые формулировки.
- `git apply --reverse --check --unidiff-zero` для шести файлов PASS.
  Patch использует нулевой контекст; before/after hashes обязательны для
  проверки соответствия иной копии. Команда проверки файлов не изменяла.
- Официальный `skill-creator/scripts/quick_validate.py` был вызван, но не
  запустился: bundled Python не содержит PyYAML (`ModuleNotFoundError: yaml`).
  PASS этого validator не заявляется; новая dependency не устанавливалась.
- Изменены только Markdown-инструкции и audit packet. Core runtime/CEP bytes,
  installed credentials, grants, state/origins и пользовательский AEP не менялись.

## Параллельная проверка MCP

Пользователь сообщил о ручном reconnect. Штатный MCP discovery текущего чата
всё ещё возвращает `connection closed` при initialize; это подтверждено
startup notification для данного thread в локальном desktop log. Установка
fa9e на диске корректна. Две доступные AppData views дали одинаковые descriptor,
release set, origin и journal hashes; рассогласование views не доказано.

Root выполнил один необходимый диагностический installed stdio initialize и
`core_status`, без native dispatch: child23156, ready=true, ownershipFault=null,
ledgerFault=false, unresolved=[], storeFault=false/storeClosed=false/unknown=false,
pending=null. Peer не подключён. Child штатно закрыт exit0, stderr пустой;
owners/gates отсутствуют, journal SHA-256 сохранился
`1a07b1a379a166a7c8be1af714fa9ac7f7f328f05ad98599fcf12473bdd040b4`.

Это отдельный stdio proof, **не configured-client success** и не новая native
инспекция. Точная причина отказа штатного launch пока не установлена.
29 октября пользователь показал настройки приложения: отдельного пункта MCP
servers на снимках нет. Прежний UI-путь по документации оказался неприменим;
запрос пользователю найти там статус снят. Дальше нужны headless launch/config
diagnostics, а не повторные UI-поручения. Старый adoption PID31452
не обновлялся под текущий AE20108. Повтор original UNKNOWN не выполнялся.
Локальное evidence — `snapshots/core4-live-proof/VIII-configured-client-20261028/`:
`configured-post-reconnect-census.json`, `physical-installation-views.json`,
`stdio-startup-diagnostic.json`, `post-diagnostic-census.json`.

29 октября: выполнен один обратимый цикл project MCP enabled=false/true при
отсутствии процессов/listener/owners. Исходные config bytes восстановлены точно
(SHA-256 `0aff09f8e5b98d1d45d09351ad21d12ca9fe2816f0341a74b99355079d6b2835`),
нового configured startup в журнале не появилось; cached initialize failure
сохранился. CIM event subscription отменена до создания observer, обхода нет.
В read-only logs_2.sqlite найдены только сообщения об исключении неготового
client из tool catalog; причины stderr они не дают. Evidence — ignored
`snapshots/core4-live-proof/IX-configured-startup-20261029/`. Runtime/CEP и AE
не менялись, native dispatch0, исходный journal hash прежний.
