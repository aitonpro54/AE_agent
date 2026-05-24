# Аудит применимости ComposioHQ Agent Orchestrator к AE Agent

Дата: 2026-05-24
Проект: `C:\Users\Ant\Documents\Codex\AE_agent`
Внешний репозиторий: [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator)

## Источники и границы

- Локально изучены: `AGENTS.md`, `README.md`, `package.json`, `specs/target-app.md`, `plans/target-app-execplan.md`, `.codex/handoff.md`, `orchestrator/README.md`, ключевые `.codex-audit/**`, `orchestrator/**`, `scripts/**`, `docs/**`.
- Внешний AO изучен read-only через `gh repo view` и shallow clone во временную папку вне проекта.
- AO не устанавливался, `ao start` не запускался, код AO не копировался в проект, зависимости проекта не менялись.

Основные AO-источники:

- [AO README](https://github.com/ComposioHQ/agent-orchestrator/blob/main/README.md)
- [AO SETUP.md](https://github.com/ComposioHQ/agent-orchestrator/blob/main/SETUP.md)
- [AO config schema](https://github.com/ComposioHQ/agent-orchestrator/blob/main/schema/config.schema.json)
- [AO core types](https://github.com/ComposioHQ/agent-orchestrator/blob/main/packages/core/src/types.ts)
- [AO Codex agent plugin](https://github.com/ComposioHQ/agent-orchestrator/blob/main/packages/plugins/agent-codex/src/index.ts)
- [AO process runtime plugin](https://github.com/ComposioHQ/agent-orchestrator/blob/main/packages/plugins/runtime-process/src/index.ts)
- [AO worktree plugin](https://github.com/ComposioHQ/agent-orchestrator/blob/main/packages/plugins/workspace-worktree/src/index.ts)

## A. Executive Summary

- Verdict: `pilot-only`.
- AO не стоит ставить или запускать в текущем AE Agent repo прямо сейчас.
- AO ценен не как "магическая замена" и не как "30 агентов", а как связка `task isolation + session lifecycle + feedback routing`.
- В проекте уже есть похожие элементы: roadmap supervisor, feature conveyor, exact approvals, planned path allowlists, read-only reviewers, runtime state, handoff.
- Чего не хватает: worktree-per-task isolation, unified activity JSONL, stuck detector, dashboard/status surface, GitHub CI/review feedback routing.
- Главная боль с автосжатием контекста решается не заменой Codex Desktop, а выносом состояния в persisted task/session artifacts.
- AO как внешнюю систему нужно проверять только в sandbox/dummy repo.
- Самые полезные AO-паттерны стоит перенести в наш SDK orchestrator без установки AO.

## B. Current Project Fit

### Уже похоже на AO

- `orchestrator/run-ae-agent-roadmap-supervisor.mjs`: plan-only, exact approval, queue SHA binding, one writer child, read-only reviewers, validation, handoff, final report.
- `.codex-audit/sdk-roadmap-supervisor/*.json`: structured queue items with planned/forbidden paths, allowed actions, validation commands, stop gates.
- `.codex-runtime/sdk/roadmap-supervisor/<session-id>/`: state, event logs, child/reviewer/live logs, reports.
- `orchestrator/core/**`: operation envelope, path policy, runtime store, diagnostics, post-run contract.
- `AGENTS.md`: milestone continuity, mandatory handoff, context-pressure hard stops, validation matrix.

### Отсутствует

- Отдельный worktree/branch per milestone.
- Dashboard/status page по active sessions.
- Activity JSONL как общий контракт для Codex SDK/CLI runs.
- Stuck/needs-input detector поверх activity events.
- CI failure и review comment routing.
- Issue/task adapter, который мапит external events в bounded milestone tasks.

### Конфликты с текущим workflow

- AO обычно создает branches/worktrees/PRs; это запрещено без отдельного разрешения.
- AO install и `ao start` запрещены для текущего проекта.
- AO не знает AE-specific live safety: generated-only validation, CEP/CDP, checkpoints, edit sessions, semantic read-back.
- Подключение AO к текущему repo может обойти `plans/target-app-execplan.md` как source of truth.

## C. Immediate Usable Tasks

| Task name | AO сейчас | Наш SDK orchestrator | Риск | Зоны проекта | Проверки | Комментарий |
| --- | --- | --- | --- | --- | --- | --- |
| Read-only applicability report по AO | no need | yes | low | `docs/research/**` | file exists/content check | Этот документ. |
| Task schema для milestones по AO issue/session model | patterns-only | yes | low-medium | `.codex-audit/**`, `orchestrator/**` | schema smoke | Хороший следующий шаг. |
| Activity/state JSONL в SDK orchestrator | patterns-only | yes | low-medium | `.codex-runtime/sdk/**`, `orchestrator/core/**` | fixture smoke | Самый ценный перенос без AO. |
| Stuck detector для Codex runs | patterns-only | yes | medium | `orchestrator/**`, `.codex-runtime/**` | timeout/stale fixtures | Делать после activity schema. |
| Безопасный worktree pilot на dummy milestone | pilot | partial/no | high | temp repo only | worktree create/cleanup proof | Не в текущем checkout. |
| CI-failure analyzer без auto-fix | pilot later | yes | medium | logs/reports, future `.codex-audit/**` | read-only log fixture | Analyzer готовит repair prompt, не чинит код. |
| Reviewer-worker для handoff/milestone report | pilot later | yes | low-medium | `.codex/handoff.md`, `plans/**` | reviewer smoke | Уже близко к текущей модели reviewers. |
| Dashboard/status markdown или HTML | patterns-only | yes | medium | `.codex-runtime/**`, docs/status output | static render smoke | Не нужен полноценный web UI. |
| Escalation rules | patterns-only | yes | medium | schema/governance docs | policy smoke | Когда stop, handoff, ask user, repair prompt. |
| AO sandbox вне production workflow | yes/pilot | no | medium | separate dummy repo | `ao doctor`, dummy issue | Только после отдельного разрешения. |
| AO как замена SDK orchestrator | no | no | high | весь pipeline | no-go | Потеряем AE-specific gates. |

## D. Risk Matrix

| Risk | Level | Оценка | Mitigation |
| --- | --- | --- | --- |
| Windows compatibility | medium-high | AO поддерживает process runtime/ConPTY/node-pty, но это отдельный слой с file-handle/pty-host рисками. | Sandbox proof first. |
| Git/worktree | high | AO создает worktrees/branches; текущий checkout не должен быть полигоном. | Temp repo/dummy milestone only. |
| GitHub auth/gh CLI | medium | `gh` доступен, но write scopes не проверялись. | Sandbox-only auth checks. |
| Dependency pollution | high | AO требует install/toolchain; current project deps менять нельзя. | No install in AE Agent. |
| Context compaction | medium | AO снижает зависимость от одного чата, но не лечит Desktop context внутри thread. | Persisted state + short sessions. |
| Agent runaway | high | AO может spawn/react automatically. | Max one worker, no auto-merge, exact caps. |
| PR/branch noise | high | AO intended flow шумит branches/PRs. | Dummy repo only. |
| CEP/live damage | high | Generic agent не знает AE safety gates. | No CEP/live/prod paths. |
| Maintenance | medium | AO быстро развивается. | Borrow stable patterns; pin sandbox version. |

## E. Recommended Integration Strategy

### Phase 0 - read-only research only

Цель: понять fit, записать решение, ничего не запускать.

Разрешено: читать repo/AO, создать research report.
Запрещено: AO install, `ao start`, branch/worktree/PR/issues/actions, production/CEP/live/deps changes.
Acceptance: один отчет с verdict, risk matrix, tasks, borrow list, next milestone.
Rollback: удалить этот markdown.

### Phase 1 - safe pilot outside production scope

Цель: проверить AO на dummy repo/issue.

Разрешено после отдельного approval: isolated AO install/use вне AE Agent, dummy repo, one worker, AO doctor, dashboard, worktree cleanup, synthetic CI/review routing.
Запрещено: подключать AO к AE Agent, использовать CEP/live/project secrets, auto-merge, push/PR в AE Agent.
Acceptance: AO создает/чистит sandbox worktree, Windows ConPTY не оставляет мусор, dummy feedback возвращается агенту.
Rollback: stop/cleanup sandbox, удалить dummy repo/worktrees, отозвать test scopes.

### Phase 2 - limited integration or rejection

Цель: решить, использовать AO ограниченно или оставить patterns-only.

Разрешено при успешном pilot: read-only reviewer/explorer sessions или GitHub feedback tasks вне CEP/live/prod.
Запрещено: замена SDK orchestrator, AO write access к CEP/live/prod, auto-merge/push/deps/live operations.
Acceptance: записан contract: что берет AO, что остается за SDK orchestrator.
Rollback: не добавлять `agent-orchestrator.yaml` в AE Agent, оставить только patterns.

## F. What To Borrow Without Installing AO

| AO pattern | Аналог у нас | Сложность | Польза | Минимальный milestone |
| --- | --- | --- | --- | --- |
| Worktree isolation | partial: clean-git/path gates | medium-high | Изолировать milestones | Design-only worktree packet |
| Session state | partial: supervisor `state.json` | low-medium | Resume/stop/handoff | Session-state schema smoke |
| Activity JSONL | partial: `events.jsonl` | low | active/ready/stuck detection | `activity-events.v1` fixture |
| Lifecycle manager | partial: supervisor loop | medium | Единая state machine | Transition spec |
| Stuck detection | partial: timeouts | medium | Ловить зависания | Stale activity fixture |
| CI failure routing | no | medium | Repair prompt из CI logs | Analyzer milestone |
| Review comment routing | no | medium | Comments -> bounded task | Dummy PR first |
| Dashboard/status | partial: JSON reports | medium | Видимость blockers | Static markdown/HTML |
| Issue/task adapter | partial: queue JSON | medium | Унификация intake | Plan/queue adapter |
| Escalation/notifier | partial: handoff | medium | Не терять needs-input | Local escalation rules |
| Structured task schema | yes | low | Стабильные handoffs | Common schema docs |

## G. Concrete Next Milestone Proposal

Milestone id/name: `M215 AO-inspired activity and session-state intake`

Goal: перенести полезную AO-идею без установки AO: унифицированный контракт `activity JSONL + session lifecycle summary` для SDK roadmap supervisor.

Allowed paths:

- `.codex-audit/sdk-ao-pattern-intake/**`
- `scripts/sdk-ao-pattern-intake-smoke.js`
- `orchestrator/README.md` только если нужен docs pointer
- `plans/target-app-execplan.md` и `.codex/handoff.md` только при normal milestone closeout

Forbidden paths:

- `cep-panel/**`
- `mcp-server/**`
- `chatgpt-connector/**`
- `registry/**`
- `recipes/**`
- `package.json`, `package-lock.json`, dependency files
- `logs/**`, `backups/**`, `snapshots/**`, `node_modules/**`
- AO install, `ao start`, live AE/CEP, branch/worktree/PR/GitHub Actions

Implementation steps:

1. Add `.codex-audit/sdk-ao-pattern-intake/215-activity-session-schema.json`.
2. Include schema/version, event examples, lifecycle states, stop gates, mapping to existing roadmap supervisor state.
3. Add `scripts/sdk-ao-pattern-intake-smoke.js`.
4. Optionally document in `orchestrator/README.md`.
5. Update plan/handoff only if run as a normal approved milestone.

Checks:

- `node --check scripts/sdk-ao-pattern-intake-smoke.js`
- `node scripts/sdk-ao-pattern-intake-smoke.js`
- `npm.cmd run check:rules` if package/check wiring is touched
- `git diff --check`

Exact prompt:

```text
Продолжи в AE Agent с безопасного milestone M215 AO-inspired activity and session-state intake. Не устанавливай и не запускай Composio AO, не трогай CEP/live/production/dependencies/PR/branches. Создай только локальный schema artifact под .codex-audit/sdk-ao-pattern-intake и smoke script для проверки activity JSONL/session lifecycle контракта, затем выполни node --check, smoke script и git diff --check. Если меняешь план/handoff, держи изменения минимальными и запиши, что это перенос паттернов AO, а не интеграция AO.
```

## Pipeline insertion: ядро ценности AO для AE Agent

Ключевую ценность AO стоит завести в наш pipeline как самостоятельную capability, не как зависимость от AO. Рабочая формула:

```text
Task isolation + session lifecycle + feedback routing
```

Для AE Agent это означает:

- task isolation: каждый крупный milestone получает отдельный task envelope, bounded paths, logs, handoff, а позже - безопасный worktree только после sandbox proof;
- session lifecycle: каждый writer/reviewer/live-check run получает persisted state, activity events, stuck/needs-input/error/done transitions;
- feedback routing: validation/CI/review failures не чинятся автоматически вслепую, а превращаются в structured repair prompt или next bounded task.

### Pipeline hooks

| Pipeline point | AO-inspired hook | Минимальный безопасный вариант |
| --- | --- | --- |
| Перед writer child | создать task/session envelope | JSON artifact + planned paths + stop gates |
| Во время Codex SDK/CLI run | писать activity/state JSONL | `active`, `ready`, `idle`, `needs_input`, `stuck`, `errored`, `done` |
| После validation failure | route feedback в repair prompt | read-only analyzer создает prompt, не правит код |
| После reviewer finding | route review feedback в bounded task | reviewer-worker пишет blocking/non-blocking finding |
| При context pressure | stop + handoff | сохранить exact next prompt |
| При live/CEP gate | fail closed | не запускать live mutation без generated-only approval |
| При будущей GitHub CI/review интеграции | map CI/review events to task feedback | только после sandbox и отдельного approval |

### Adoption ladder

| Step | Capability | Почему рано полезно | Запрещено на этом шаге |
| --- | --- | --- | --- |
| M215 | Activity/session schema intake | общий язык состояний без runtime риска | AO install, worktree, PR, production edits |
| M216 | Stuck detector + escalation rules | снижает зависания Codex runs | auto-fix, auto-retry без лимитов |
| M217 | Status markdown/HTML dashboard | показывает sessions/blockers/next action | web server/dependency |
| M218 | Read-only CI/test failure analyzer | превращает logs в repair prompt | самостоятельное исправление кода analyzer-ом |
| M219 | Dummy worktree pilot outside production | проверяет isolation pattern | worktree в текущем repo |
| M220 | Optional AO sandbox pilot | проверяет настоящий AO feedback routing | подключение AO к AE Agent |

### Минимальный task/session envelope

Task artifact должен хранить:

- `taskId`, `milestone`, `source`, `goal`;
- `allowedPaths`, `forbiddenPaths`, `allowedCommands`, `validationCommands`;
- `sessionId`, `role` (`writer`, `reviewer`, `analyzer`, `live-check`);
- `activityLog`, `stateFile`, `handoffPath`, `reportPath`;
- `feedbackInputs` (`validation_failure`, `review_comment`, `ci_failure`, `context_pressure`);
- `stopGates` и `escalationRules`;
- `nextPrompt` для продолжения в новой Codex thread.

Decision: добавлять это в pipeline стоит. Не как "поставить AO", а как локальную дорожку `ao-inspired-pipeline-hardening`: сначала schema/state/activity, затем stuck/escalation, потом read-only feedback analyzers, и только после этого sandbox worktree/AO pilot.

## Backlog: что добавить в наш pipeline

Этот backlog разворачивает `ao-inspired-pipeline-hardening` в практические задачи. Он не означает установку AO и не разрешает worktree/branch/PR/live/dependency work без отдельного approval.

### Задачи для нашего pipeline

| # | Задача | Ценность | Минимальная безопасная форма |
| --- | --- | --- | --- |
| 1 | `Task/session envelope` для каждого milestone | Делает задачу переносимой между чатами и агентами | JSON artifact: goal, allowed/forbidden paths, commands, stop gates, next prompt |
| 2 | `activity.jsonl` для SDK/Codex runs | Даёт наблюдаемость без чтения огромных логов | Events: `active`, `ready`, `idle`, `needs_input`, `stuck`, `errored`, `done` |
| 3 | `session-state.json` рядом с каждым run | Фиксирует текущий статус вне chat context | Role, started/ended, last activity, validation result |
| 4 | Stuck detector | Снижает риск зависших Codex sessions | Detect no activity, no log progress, process wait, input prompt |
| 5 | Escalation rules | Ясно решает, когда остановиться | Stop, handoff, ask user, or generate repair prompt |
| 6 | Status dashboard markdown/HTML | Быстрый обзор pipeline health | Static file from session state and activity logs |
| 7 | CI/test failure analyzer | Превращает failures в рабочий prompt | Read-only worker читает log и готовит repair prompt, не правит код |
| 8 | Reviewer-worker | Проверяет claims перед закрытием milestone | Сверяет handoff/milestone report с diff и validation evidence |
| 9 | Handoff freshness guard | Не даёт закрыть milestone со старым handoff | Проверка mtime/content/fingerprint и exact next prompt |
| 10 | Context-pressure gate | Предотвращает "ещё чуть-чуть" перед compaction | Machine-readable stop reason and mandatory handoff |
| 11 | Feedback router | Делает failures новым bounded input | Validation/reviewer/context signals -> structured next task |
| 12 | Worker role split | Разделяет полномочия агентов | `explorer`, `writer`, `reviewer`, `analyzer`, `live-checker` roles |
| 13 | Failure packet format | Упрощает ремонт после падения | JSON/MD packet: what failed, log path, suspected cause, repair prompt |
| 14 | Worktree pilot | Проверяет настоящую изоляцию задач | Только dummy repo/milestone, не текущий production checkout |
| 15 | AO sandbox pilot | Проверяет AO как внешний инструмент | Dummy issue, dummy CI failure, dummy review comment, cleanup proof |

### Идеи и паттерны, которые стоит перенести

| # | Паттерн | Как применять у нас |
| --- | --- | --- |
| 1 | Task isolation | Сначала envelope/path gates, позже worktree isolation после sandbox proof |
| 2 | Session lifecycle | State machine вместо надежды, что один чат всё помнит |
| 3 | Activity event stream | JSONL как источник правды для stuck/status/dashboard |
| 4 | Feedback as input | CI/review/test failures становятся bounded task input |
| 5 | Single writer, multiple read-only reviewers | Сохранить текущую supervisor модель и усилить reviewer contracts |
| 6 | Dashboard over logs | Показывать состояние, blockers и next action без ручного чтения длинных логов |
| 7 | Replace, don't stretch | Если session зависла или context high, закрыть с handoff и открыть новую |
| 8 | Approval-bound actions | Worktree/live/PR/deps только через explicit approval |
| 9 | No auto-fix analyzers | Analyzer готовит prompt, writer чинит отдельной bounded задачей |
| 10 | Cleanup lifecycle | Worktree/session/log cleanup как отдельный проверяемый шаг |

Рекомендуемый порядок внедрения: `task envelope + activity JSONL + lifecycle state`, затем `stuck/escalation`, затем `dashboard`, затем `failure analyzer/reviewer`, и только потом `dummy worktree/AO pilot`.

## H. Final Recommendation

1. Ставить AO прямо сейчас в этот проект: нет.
2. Делать отдельный sandbox pilot: да, после отдельного разрешения, на dummy repo/issue.
3. Первые 3 задачи для AO pilot:
   - dummy CI failure routing to agent;
   - dummy review comment routing to agent;
   - dashboard/worktree/session cleanup proof on Windows ConPTY.
4. Первые 3 идеи для переноса в наш SDK orchestrator:
   - activity JSONL with active/ready/idle/stuck/needs_input states;
   - persisted session lifecycle state and transition reasons;
   - dashboard/status artifact over roadmap supervisor sessions.

## Current Local Observations

- Node observed during audit: `v24.15.0`; Git observed: `2.54.0.windows.1`; `gh` observed: `2.92.0`.
- Branch observed during audit: `road-map-2.0`; latest local commit observed during audit: `221198d docs: add duplicate layers solution guidance`.
- `.github/` not found; `tasks/` not found.
- `package-lock.json` exists; no package install was run.
- Ignored runtime zones observed: `.codex-runtime/`, `.codex/`, `backups/`, `logs/`, `node_modules/`, `pro-review-bundles/`, `snapshots/`.
