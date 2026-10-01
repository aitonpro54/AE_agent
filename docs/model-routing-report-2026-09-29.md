# Проверка постоянной маршрутизации, 29 сентября 2026

Реальный маршрут **новый native-сеанс Luna High → существующий agy-мост →
Gemini 3.8 Flash High → артефакт → независимый валидатор** выполнен.
AE MCP из Antigravity проверен чтением. AE-write, render и художественная приёмка
не проводились. Отдельный CLI-сеанс с файловыми командами заблокирован Windows
sandbox; это не скрыто и не исправлялось отключением защиты.

## Исходное состояние

- Cwd: `C:/Users/Ant/Documents/Codex/AE_agent`, локальный Windows PowerShell,
  Codex Desktop, не Remote. AfterFX и Antigravity работают на этом же компьютере.
- AE Agent: ветка `codex/release-3.1.0`, исходный HEAD
  `c0f8e9f2b5be86a19cdfd418d12051c4bdb26ae4`; tracked diff отсутствовал.
- Пользовательские untracked сохранены: `AE-Agent-Codex-Plan-2026-09-19.zip`,
  одноимённый каталог, `architecture-vNext.md`,
  `docs/ae-agent-last-case-factual-review-2026-09-18.md`,
  `docs/all-review-new-files-2026-09-18.json`, `docs/all-review-remediation-2026-09-18.patch`
  и `.sha256`, `docs/review-followup-2026-09-18.md`, `docs/scope-safety-fix-2026-09-18.md`
  и `.patch`, `docs/scope-safety-test-results-2026-09-18.json`,
  `docs/tool-token-savings-estimate.md`, `plans/full-intake-unsafe-skip-triage.md`.
- Существующий bridge: `C:/Users/Ant/VideoScout/Code/scripts/agy_bridge.py`;
  ветка `codex/agy-contract`, исходный HEAD
  `2b848ffc650af2fa9b51c82028a3235197d0cdb3`, tracked diff отсутствовал.
- Codex CLI `0.156.1`, agy `1.2.12`, Python `3.12`. Проверены help, exec,
  debug models, login status, agy models/mcp; флаги брались из установленного CLI.
- Codex авторизован через ChatGPT. У agy работала существующая аккаунтная
  авторизация: каталог моделей и реальные вызовы доступны без нового login.
  Значения credentials в отчёт не включены. OPENAI/GEMINI/GOOGLE/ANTHROPIC API key
  variables отсутствуют в окружении проверяющего процесса. Новых API keys,
  провайдеров, gateway, подписок, зависимостей или платёжных настроек не добавлено.
- До настройки в agy был только Chrome DevTools MCP; AE MCP не наследовался.
  Существующие глобальные grants и широкие пользовательские политики agy
  не изменялись. Для AE создана отдельная workspace-конфигурация.

## Что изменено

| Место | Изменение |
|---|---|
| `AE_agent/AGENTS.md` | Короткая постоянная политика dispatcher/Flash/Sol/Astra, приёмка, ошибки, один writer |
| `AE_agent/.codex/config.toml` | Проектный default Luna/high, default native child Sol/high, cap 2; прежний MCP сохранён |
| `~/.codex/skills/ae-task-routing/SKILL.md` | Новый маршрут только для AE Agent; политика остальных проектов сохранена |
| `~/.codex/skills/antigravity-cli/SKILL.md` | AE-профиль существующего моста, самостоятельный Flash и ссылка на инструкцию |
| `~/.codex/skills/ae-computer-use-workflow/SKILL.md` | Согласован исполнитель для AE Agent и последовательный UI fallback |
| `VideoScout/Code/scripts/agy_bridge.py` | Opt-in AE-профиль, explicit model/effort, workspace/project ID, пакет и baseline, metadata, SHA-256 changed |
| `VideoScout/Code/tests/test_agy_bridge.py` | Отрицательные сценарии и совместимость VideoScout |
| `VideoScout/Code/docs/AGY_BRIDGE.md`, `WORK_LOG.md` | Контракт, проверки и запись изменения |
| `~/.gemini/config/mcp_config.json` | Общий agy MCP `after-effects` на существующий adapter, automation credential без panel credential; autostart отключён |
| `~/.gemini/config/projects/82137d9f-3dac-43ae-bd5b-d4ecaa75885c.json` | Создан штатным `--new-project`; ресурс только AE Agent, четыре точных read grants |
| `docs/model-routing.md`, этот отчёт, plan | Рабочая инструкция, факты, ограничения и прогресс |

Роли `ae_scout`, `ae_operator`, `ae_specialist`, `ae_reviewer`, `ae_architect`
уже имели правильные model/effort, поэтому новые дублирующие роли не создавались.
Scout/operator оставлены вспомогательными; specialist больше не назначается
основным исполнителем всей обычной разработки. Глобальный Codex default
`gpt-6-astra/high` и модель текущего чата не менялись. Общие skills получили
условный раздел AE Agent; их исходная политика вне проекта сохранена.
Новый MCP виден всем workspace agy, но добавленные grants ограничены проектом
AE Agent и именами `search_solutions`, `get_solution`, `get_bridge_status`,
`get_project_info`. Нет `dangerously-skip-permissions` или новых mutating grants.

Bridge не создаёт daemon/очередь, не использует shell interpolation или latest
conversation. Полный запрос/ограничения/приёмка/материалы/allowed_scope хранятся
в state вместе с git HEAD/porcelain и conversation ID. `original_request` больше
30000 символов отклоняется; для него документирована передача точного файла.
`allowed_scope` — контракт для исполнителя и последующей проверки, не OS sandbox.
Лимит двух исполнителей включает AGY по политике диспетчера; native cap сам по
себе внешний процесс не учитывает. Аппаратный mutex AE writer не добавлялся.

## Модели и реальные запуски

Каталог аккаунта `codex debug models` подтверждает `gpt-6-luna`, `gpt-6-sol`,
`gpt-6-astra` и high; Sol также поддерживает xhigh. `agy models` вернул
`gemini-3.8-flash-high — Gemini 3.8 Flash (High)`. Terra отсутствует в активных
defaults/ролях маршрута; наличие других моделей в каталоге не является маршрутом.
Max/ultra не выбирались.

| Роль/проверка | Session ID | Доказательство |
|---|---|---|
| Текущий родитель | `01a0ed20-045a-77e2-a374-7632c9a8feca` | Последний turn_context: gpt-6-astra/high |
| Узкая инженерная адаптация | `01a0ed21-762f-7092-a729-9c2a0f3a914e` | ae_specialist, gpt-6-sol/high; patch и тесты |
| Прямая архитектурная проверка | `01a0ed22-8a87-7b50-b580-56ed7ef03c3d` | ae_architect, gpt-6-astra/high; инварианты передачи writer после timeout |
| Native dispatcher smoke | `01a0ed2c-001a-7073-9ce0-1377d8d9d174` | ae_operator, gpt-6-luna/high; bridge и validator, без реализации output |
| Новый CLI default без `-m`/effort override | `01a0ed2e-8de2-7461-a12b-e15ef6a5b9a3` | gpt-6-luna/high; ответ ROUTING_DEFAULT_READY, strict-config accepted |

Metadata извлечены из последнего собственного `turn_context`, не из самоотчёта
модели или унаследованной истории. Custom role model/effort имеет приоритет над
spawn defaults; project config выше user config, явный UI/CLI выбор выше проекта.
Это сверено с установленным клиентом и официальными
[правилами конфигурации](https://learn.chatgpt.com/docs/config-file/config-basic)
и [описанием custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

Основной live task: `luna-flash-live-20260929-01`, conversation
`3642e8ab-63c9-4e9a-9e54-135e33b46603`. Вход и output лежат в
`.codex-runtime/routing-2026-09-29/тест с пробелами/`.
Flash выполнил `view_file → write_to_file → view_file`; не запускал shell,
других агентов или AE. Luna создала только пакет, вызвала мост/status и готовый
`verify_artifact.py`. Исходные несортированные события превращены в ожидаемые
`Начало/Музыка/Финал`, durations `3/5/2`, total `10`. Валидатор PASS.

Bridge: `completed`, `success`, schema valid, artifact passed. Отдельное
`validation_status=not_run` в bridge намеренно не выдаёт файловый след за приёмку:
валидатор запускала Luna вне bridge. Init metadata подтверждает точный
`gemini-3.8-flash-high`; `--effort high` принят CLI, но agy не сообщает отдельное
effective effort, поэтому поле осталось null. Нельзя утверждать независимую
проверку внутреннего reasoning budget сверх runtime slug High.

## Проверки, отказы и пределы

- **Реально:** native Luna → agy → Flash → артефакт → фиксированный валидатор PASS.
- **Реально:** Flash connectivity probe conversation
  `7699183e-c82b-4edf-a23c-53bdce4dc88e`, точный init model.
- **Реально:** первый MCP probe `c56c81b0-525f-4ff3-8b9f-f188d3d06927`
  auto-denied без read grant; SUCCESS с пустым ответом не засчитан.
- **Реально после точных project read grants:** conversation
  `57e9ab92-ee5e-4894-abf1-e6e10575cd8e`: search_solutions,
  get_bridge_status, get_project_info завершились DONE. CEP connected,
  pending/inflight пусты, проект `file:null`, `numItems:0`, 16 bpc.
  Рабочий проект не закрывался, не заменялся и не сохранялся.
- **Заблокировано:** отдельный CLI route session
  `01a0ed2a-bac9-7df0-b9d6-3f7e9fa609a1`: sandbox provisioning
  `helper_sandbox_lock_failed` для `.codex/.sandbox-bin`. Сеанс завершился сам,
  без пакета/AGY/артефакта. Exit 0 не засчитан. Причина перехода к native Luna —
  доступный поддерживаемый Desktop runtime, без смены модели и отключения sandbox.
- **Офлайн с fake AGY:** 20 адресных tests: unsupported/mismatched model,
  denied MCP/command, timeout/partial terminal, SUCCESS без файла,
  unchanged content, path scope, Unicode/quotes/PowerShell text как argv data.
- **Офлайн приёмка:** три ошибочных fixtures отвергнуты настоящим валидатором:
  неверная сумма, обратный порядок, одно заявление SUCCESS.
- **Совместимость VideoScout:** штатный offline unittest discover —
  141 test, OK, 1 skipped: `test_directory_symlink_escape` — система не разрешает
  создание symlink. Этот тест не обозначается как pass.
  Лог `C:/Users/Ant/VideoScout/Code/local/agy-bridge-ae-tests-20260929.txt`.
- **Конфигурация:** TOML parsing, fresh CLI `--strict-config`, реальные каталоги
  моделей, отсутствие Terra в ролях/defaults — pass. Skills YAML не менялся;
  предметные skills не содержали другого активного назначения исполнителя.
- **Статика:** py_compile обоих изменённых Python-файлов, git diff --check обоих
  репозиториев, AE `npm.cmd run check:rules` — pass. JS не менялись, node --check
  неприменим. План уплотнён после обнаружения лимита строк, критерий не ослаблялся.
- **Не запускалось:** AE-write, render, full-intake, broad CEP, Local/Ollama,
  paid provider lanes, push/PR, полный Desktop restart, Sol/xhigh live test.
- **Кредиты:** в CLI help/доступных JSON settings нет поддерживаемой настройки
  автоматического расходования дополнительных AI-кредитов. Она не изменена;
  её фактическое состояние на аккаунте не подтверждено. Отсутствие API key
  само по себе не доказывает отключение подписочных overage credits.

Подробные локальные evidence/logs не добавлялись в Git:
`.codex-runtime/routing-2026-09-29/evidence.json`, `runtime-metadata.json`,
`agy-mcp-read.ndjson`, `default-events.jsonl`, `luna-events.jsonl`,
`validator-negative.json`, `acceptance.json` (tool-output валидатора из Luna),
`original-request.txt` и `.codex-runtime/agy-bridge/`.
Нет художественного одобрения или заявления о полной проверке всех AE-инструментов.

## Начало следующей задачи и откат

Откройте новый чат этого проекта, выберите **GPT-6 Luna / High**, задайте обычную
задачу. В CLI воспроизводимый запуск указан в `docs/model-routing.md`; файловые
команды отдельного CLI пока ограничены описанной ошибкой sandbox. Маршрут native
Desktop проверен; память текущего чата для него не требуется.

Bridge зафиксирован коммитом `22d750c` в VideoScout. AE-изменения оформлены
отдельным коммитом на прежней ветке; точный ID записан в `.codex/handoff.md`
и доступен через `git log -1 -- docs/model-routing-report-2026-09-29.md`.

Для отката дождитесь завершения исполнителей и сверки pending. Без reset:

1. Если после настройки появились правки, сохраните их и восстанавливайте только
   соответствующие изменения. AE commit можно отменить `git revert <ID>`;
   bridge — `git -C C:/Users/Ant/VideoScout/Code revert 22d750c`.
2. Верните project config и три skills по отображению
   `.codex-runtime/routing-2026-09-29/backups/manifest.json`. Это локальные
   ignored файлы, Git revert их не восстанавливает. Глобальный Codex config
   не изменён и отката не требует.
3. Для нового MCP — `agy mcp remove after-effects`, либо точечное восстановление
   прежнего `mcp_config.json` из manifest, сохраняя более поздние изменения.
4. Read grants проекта верните из `backups/agy-ae-project-before-grants.json`.
   Сам созданный проект/разговоры можно сохранить; удаление не требуется.
5. Резервная копия bridge/tests/docs/WORK_LOG находится в
   `C:/Users/Ant/VideoScout/Code/local/agy-bridge-ae-backup-20260929-172753/`.

Frozen manifest, рабочие assets, branch selection и vendor-инструкции не менялись.
