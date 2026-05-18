# Target App Execution Plan

## Progress

- [x] Stable baseline: AE Agent 1.0.5 CEP panel, provider setup, Agent planning, Agent Hardcore planning, plan validation, protected execution, local history, diagnostics, and installed-panel smoke coverage.
- [x] Milestone 38: Repo cleanup and roadmap reset.
- [x] Milestone 39: Agent planning quality.
- [x] Milestone 40: Timeline and layer tools.
- [x] Milestone 41: Precomp and source tools.
- [x] Milestone 42: Text, shape, and layout tools.
- [x] Milestone 43: Animation tools.
- [x] Milestone 44: Render queue tools.
- [x] Milestone 45: Live typed-tool validation and spatial ease hardening.
- [x] Milestone 46: Библиотека Agent-сценариев.
- [x] Milestone 47: Улучшенный Plan Review UX.
- [x] Milestone 48: Project Context Snapshot.
- [x] Milestone 49: Recovery и checkpoint UX.
- [x] Milestone 50: Provider reliability polish.
- [x] Milestone 51: Installer и CEP sync health.
- [x] Milestone 52: Полная 1.1 validation.
- [x] Milestone 53: Release prep review и sync-only hardening.
- [x] Milestone 54: Master merge и release tag prep.
- [x] Milestone 55: Live Agent Scenario QA.
- [x] Milestone 56: Planner Fidelity на ChatGPT 5.5.
- [x] Milestone 57: OpenAI CLI readiness diagnostics.
- [x] Milestone 58: Live OpenAI CLI diagnostics preflight.
- [x] Milestone 59: Approved OpenAI CLI Agent scenario smoke.
- [x] Milestone 60: Сброс плана roadmap 1.3.
- [x] Milestone 61: Артефакты отчетов Agent-run.
- [x] Milestone 62: Регрессионный корпус planner.
- [x] Milestone 63: Аудит checkpoint и cleanup.
- [x] Milestone 64: Provider readiness self-test UX.
- [x] Milestone 65: Полная validation 1.3.
- [x] Milestone 66: Safe Solution Library roadmap reset.
- [x] Milestone 67: Solution registry and metadata.
- [x] Milestone 68: Candidate capture and quarantine.
- [x] Milestone 69: Promotion validation pipeline.
- [x] Milestone 70: Planner retrieval and safe use.
- [x] Hotfix: Agent `itemIndexes` runtime binding.
- [x] Milestone 71: Solution library validation.
- [x] Hotfix: OpenAI CLI detection and setup action.
- [x] Milestone 72: Parallel AI Paths - OpenRouter UI restore.
- [x] Milestone 73: ChatGPT Connector read-only skeleton.
- [x] Milestone 74: JSX Lab candidate quarantine and checks.
- [x] Milestone 75: Gated JSX Lab run, promotion hooks and CEP connector status.
- [x] Milestone 76: Project Intent Memory.
- [x] Milestone 77: Plan confidence and risk classification.
- [x] Milestone 78: Plan repair loop.
- [x] Milestone 79: Semantic verification.
- [x] Milestone 80: Reliability validation.
- [x] Milestone 81: Inline Agent plan execution controls.
- [x] Milestone 82: Восстановление последнего плана из чата.
- [x] Milestone 83: Dry run visibility and stale workspace guard.
- [x] Milestone 84: Hardcore dev escalation handoff.
- [x] Milestone 85: Agent Hardcore visible mode and Cyrillic UI fix.
- [x] Milestone 86: Raw ExtendScript dry-run gate unlocks Run plan.
- [x] Milestone 87: Dev request manual Codex chat handoff.

## Current Stable Baseline

- The active repository is `C:\Users\Ant\Documents\Codex\AE_agent`.
- The native CEP title/menu format is `AE Agent 1.0.5`.
- The panel is a compact dark CEP client for the local bridge daemon.
- Provider paths are separate: OpenAI API, OpenAI CLI, Gemini, Claude, OpenRouter, and Local/Ollama.
- Agent mode drafts structured MCP plans, validates tool names and required fields, dry-runs plans, and executes only through explicit mutation gates.
- Agent Hardcore is a visible composer mode next to Agent; it uses the same planner/runner safety gates with stronger guidance for inspection, dry-run/read-back evidence, verification, and typed-tool gap handoff.
- The latest valid Agent plan exposes inline `Dry run / Проверить` and `Выполнить план` controls inside the chat message, while keeping the same validated backend runner and project-change gates.
- Raw ExtendScript plans stay blocked for normal Run until a successful dry run of the same current plan records a short-lived gate id; the enabled Run then sends `allowRawExtendscript:true` with the matching `rawExtendscriptDryRunId`.
- Agent plans or runs that reveal a typed-tool gap can create an ignored `logs/dev-requests/<id>/` bundle for a targeted Codex App dev handoff instead of continuing repo development inside the AE chat; v1 does not auto-create a Codex App chat, so the user starts a new dev chat from `start-prompt.md`.
- Project-changing tools use idempotency, optional checkpoints, edit-session protection, and post-mutation verification.
- Raw ExtendScript remains available as an escape hatch, but normal product workflows should use typed bridge tools.

## Milestones

### Milestone 38: Repo cleanup and roadmap reset

- Rewrite the active handoff as a clean current-state document.
- Replace historical milestone clutter with this active roadmap.
- Keep only current architectural decisions and forward-looking work.
- Verify current repo files and installed CEP files contain no stale references to removed input experiments.
- Commit the cleanup as an independently reviewable milestone.

### Milestone 39: Agent planning quality

- Tighten the AE planning prompt so models prefer typed MCP tools first and raw ExtendScript only when no typed tool fits.
- Improve validation messages for unknown tools, unresolved bindings, broad unsafe mutations, and missing mutation safety fields.
- Add a compact affected-target summary to validated plan steps and display it in the CEP plan text.
- Preserve existing plan schema compatibility.

### Milestone 40: Timeline and layer tools

- Add `set_comp_work_area` for work-area start/duration on the active or specified comp.
- Add `set_layer_time_range` for start/in/out/duration on selected or explicit layers.
- Add `stagger_layers` for sequencing selected or explicit layers by order, gap, and overlap.
- Add `split_layers_at_time` for splitting selected or explicit layers at the CTI or a target time.

### Milestone 41: Precomp and source tools

- Add `precompose_layers` with explicit layer indexes, new comp name, move-attributes mode, and optional open-after-create.
- Add `replace_layer_source` to swap footage/precomp sources while preserving layer transforms.
- Add `rename_layers` for selected or explicit layers with prefix/suffix/find-replace/exact modes.
- Add `rename_project_items` for scoped project-item batch naming with type filters and safe limits.

### Milestone 42: Text, shape, and layout tools

- Add `update_text_layer` for text content and common TextDocument fields.
- Add `create_shape_layer` for rectangle/ellipse shapes with fill, stroke, size, position, and duration.
- Add `fit_layer_to_comp` for contain/cover/stretch sizing on selected or explicit layers.

### Milestone 43: Animation tools

- Add `set_property_keyframes` for a property path and an explicit keyframe array.
- Add `apply_keyframe_ease` for temporal easing on selected keys or explicit key indexes.
- Add general `set_expression` and `clear_expression` tools for any expression-capable property.

### Milestone 44: Render queue tools

- Add `add_comp_to_render_queue`.
- Add `set_render_queue_output` for output path, render-settings template, and output-module template.
- Add `get_render_queue_status`.
- Keep render start out of scope for this milestone.

### Milestone 45: Live typed-tool validation and spatial ease hardening

- Restart the live bridge daemon from `C:\Users\Ant\Documents\Codex\AE_agent`.
- Create a saved-project checkpoint before live mutations.
- Run protected live AE validation on generated `Codex Test Live Typed ...` comps for representative timeline, precomp/source, text/shape/layout, animation, and render queue setup workflows.
- Fix issues found by live validation and keep temporary project/render-queue items cleaned up.

### Milestone 46: Библиотека Agent-сценариев

- Добавить компактный выбор готового workflow в composer Agent-режима.
- Сценарии должны вставлять понятные Agent prompts для частых typed-tool workflows без автоотправки.
- Покрыть сценарии для тайминга выбранных слоев, precompose/rename, text/shape layout, базовой анимации и замены source.
- Оставить сценарии только фронтенд-помощниками для prompt; исполнение по-прежнему идет через Agent planning, validation, dry-run и run gates.
- Добавить CEP smoke, который проверяет вставку сценария, Agent mode, Prompt Optimization и отсутствие побочных записей в chat history.

### Milestone 47: Улучшенный Plan Review UX

- Улучшить текст review для affected targets, mutation counts, checkpoint expectations и warnings.
- Сделать dry-run и mutating run состояние легче считываемыми перед нажатием `Run plan`.
- Сохранить совместимость backend plan schemas и существующих execution gates.

### Milestone 48: Project Context Snapshot

- Добавить компактный структурированный snapshot для Agent planning: active comp, selected layers, selected source/precomp hints, render queue count и недавний bridge context.
- Держать snapshot достаточно маленьким, чтобы не раздувать prompt.
- Предпочитать существующие typed read tools и bridge state; не делать широкие project scans без явного запроса.

### Milestone 49: Recovery и checkpoint UX

- Яснее показывать checkpoint/edit-session status после dry-run и run results.
- Для неудачных mutating runs показывать самый безопасный recovery hint из существующих backend metadata.
- Не добавлять automatic restore actions, пока они отдельно не спроектированы и не провалидированы.

### Milestone 50: Provider reliability polish

- Нормализовать user-facing provider errors для OpenAI API, OpenAI CLI, Gemini, Claude и Local/Ollama.
- Разделить missing key/auth, unavailable model, network failure, rate limit и malformed provider response.
- Добавить fake-provider smoke coverage для представительных error cases.

### Milestone 51: Installer и CEP sync health

- Добавить health check repo-versus-installed CEP для `index.html`, `panel.js`, `style.css` и `CSXS/manifest.xml`.
- Добавить безопасный sync helper, который копирует только измененные panel files в установленное CEP extension.
- Ясно показывать mismatch версии daemon, panel, manifest и installed files.

### Milestone 52: Полная 1.1 validation

- Запустить полный настроенный smoke suite.
- Запустить live CEP validation, когда After Effects и panel доступны.
- Запустить protected live AE validation на generated test comps для новых 1.1 workflows.
- Обновить release notes и handoff notes для roadmap block 1.1.

### Milestone 53: Release prep review и sync-only hardening

- Провести review локальных roadmap 1.1 коммитов перед push/release.
- Исправить найденный release-prep дефект в `scripts\install-cep-panel.ps1 -SyncOnly`.
- Подготовить ветку к публикации без изменения runtime Agent/CEP поведения.

### Milestone 54: Master merge и release tag prep

- Fast-forward merge `codex-v0.26-agent-ux-polish` в `master`.
- Подготовить lightweight release tag `v0.26.0-agent-ux-polish`.
- Проверить merged `master` и синхронизировать установленную CEP-панель перед публикацией.

### Milestone 55: Live Agent Scenario QA

- Добавить live CEP smoke `agent-scenario-smoke` для реальных Agent-mode сценариев на generated assets с префиксом `Codex QA 1.2 <stamp>`.
- Покрыть timeline/layer timing, text/shape/layout/animation, precomp/source/rename и render queue setup workflows.
- Перед запуском проверять bridge health, panel connection, active comp, edit session и render queue baseline.
- Если panel planner возвращает пустой или неполный plan, запускать deterministic backend fallback через `/agents/plan/run`, чтобы проверить typed tools, dry-run, protected run и checkpoint/edit-session поведение без изменения product planner.
- Усилить cleanup: удалять generated render queue items по prefix до `cleanup_test_items`, затем проверять отсутствие generated project items и возврат render queue к baseline.

### Milestone 56: Planner Fidelity на ChatGPT 5.5

- Добавить live CEP smoke `agent-scenario-openai-cli-smoke`, который прогоняет те же четыре Agent QA сценария через `openai-cli` и `gpt-5.5`.
- Сценарный smoke должен явно выбирать OpenAI provider group, CLI auth mode, agent `openai-cli` и модель `gpt-5.5`, не полагаясь на сохраненное Local/Ollama состояние панели.
- Отчет Agent scenario smoke должен явно разделять `panel-agent-plan` и `deterministic-plan-fallback`, показывать expected validation summary, step/mutation counts, accepted checks и transcript tail.
- Для `openai-cli` / `gpt-5.5` deterministic fallback остается cleanup/runtime страховкой, но не считается успешным planner-fidelity результатом: command должен завершаться ошибкой, если хотя бы один сценарий ушел в fallback.
- Не менять public provider schema; ChatGPT subscription path остается существующим `codex exec --ephemeral --json --sandbox read-only`.

### Milestone 57: OpenAI CLI readiness diagnostics

- Добавить компактные диагностические поля в `codexStatus`: результаты `codex --version` и `codex login status` с args, exit status, signal, error code и коротким output.
- Сохранить поведение provider readiness: ChatGPT/Codex CLI path по-прежнему считается готовым только когда CLI установлен и `login status` возвращает success.
- Расширить provider-contract smoke fake CLI проверками для not-logged-in и logged-in состояний.
- Добавить `codexStatus` summary в live Agent scenario preflight report, чтобы следующий `agent-scenario-openai-cli-smoke` показывал источник расхождения shell/bridge readiness.

### Milestone 58: Live OpenAI CLI diagnostics preflight

- Перезапустить live bridge daemon из текущей ревизии `C:\Users\Ant\Documents\Codex\AE_agent`.
- Проверить live `/agents/readiness` для `openai-cli` / `gpt-5.5` с `checkModels=0`, чтобы подтвердить новые `codexStatus.versionCheck` и `codexStatus.loginStatusCheck` без внешнего planner-запроса и без мутаций AE-проекта.
- Не запускать полный `agent-scenario-openai-cli-smoke` без явного разрешения пользователя, потому что он отправляет Agent prompts / компактный AE project context через OpenAI/Codex CLI и выполняет временные live AE-мутации.

### Milestone 59: Approved OpenAI CLI Agent scenario smoke

- После явного разрешения пользователя запустить полный live CEP smoke `agent-scenario-openai-cli-smoke` через `openai-cli` / `gpt-5.5`.
- Подтвердить, что все четыре Agent QA сценария используют `panel-agent-plan`, а не deterministic fallback.
- Проверить, что protected runs создают checkpoint/edit-session protection, cleanup удаляет generated project/render-queue items, а render queue возвращается к baseline.
- Зафиксировать результат как validation-only milestone без изменений product code.

### Milestone 60: Сброс плана roadmap 1.3

- Начать roadmap 1.3 от чистого baseline после Milestone 59 на отдельной ветке.
- Сфокусировать новый блок на наблюдаемости, регрессионных доказательствах, безопасности cleanup и provider readiness перед добавлением нового AE mutation behavior.
- Определить следующие маленькие вехи, чтобы работа продолжалась milestone-by-milestone без догадок после закрытого 1.2 live QA block.
- Обновить active handoff так, чтобы следующий поток мог сразу начинать Milestone 61.

### Milestone 61: Артефакты отчетов Agent-run

- Добавить стабильный локальный report artifact для Agent scenario smokes: planner config, plan source, acceptance counts, scenario outcomes, cleanup counts и final render queue status.
- По умолчанию держать raw live artifacts вне git; в tracked docs заносить только устойчивые решения и validation results.
- Добавить smoke coverage, которая проверяет создание отчета и ключевые поля для диагностики planner regressions без чтения длинного terminal log.

### Milestone 62: Регрессионный корпус planner

- Зафиксировать accepted live Agent scenario prompts и expected plan shapes как offline fixture corpus.
- Добавить dependency-free validator, который прогоняет fixture plans через plan validation и dry-run-compatible checks без вызова external providers.
- Использовать corpus как preflight перед дорогими live OpenAI CLI planner runs.

### Milestone 63: Аудит checkpoint и cleanup

- Добавить read-only audit command для generated QA prefixes, render queue leftovers, checkpoint records и edit-session records, связанных с live smoke runs.
- Оставить deletion под guard через точные generated prefixes и существующие cleanup tools; audit path не должен мутировать AE projects.
- Использовать audit до и после live mutating validation, чтобы leftover state был виден перед следующим external planner run.

### Milestone 64: Provider readiness self-test UX

- Показать в панели compact provider readiness diagnostics для OpenAI API, OpenAI CLI, Gemini, Claude и Local/Ollama.
- Скрывать secrets и сохранить существующую shape provider contract.
- Добавить fake-provider и CEP smoke coverage для missing auth, unavailable models и CLI readiness details.

### Milestone 65: Полная validation 1.3

- Запустить configured repo smoke suite и relevant live CEP validation после внесения изменений 1.3.
- Запускать external-provider или mutating live smokes только с явным approval, если они отправляют planner prompts/project context или мутируют AE project.
- Обновить release/handoff notes с финальным validation status 1.3 и следующим recommended block.

### Milestone 66: Safe Solution Library roadmap reset

- Зафиксировать pivot после 1.3 validation: перед дальнейшим reliability layer добавить безопасную базу удачных решений, чтобы одноразовые ExtendScript-находки проходили quarantine, review и promotion.
- Определить целевой lifecycle решений: `candidate` -> `recipe` -> `typed-tool-candidate` -> `tool`, без автоматического повышения доверия после одного удачного запуска.
- Оставить raw ExtendScript escape hatch, но не давать новой библиотеке обходить Agent plan validation, mutation gates, idempotency, checkpoint/edit-session protection и post-mutation verification.
- Обновить handoff так, чтобы следующий чат начинал с Milestone 67 и не запускал external planner smokes или live AE mutation smokes без explicit approval.

### Milestone 67: Solution registry and metadata

- Добавить tracked структуру для общей базы решений: registry JSON, `recipes/` для reusable recipes и `scripts/solutions/` для reviewed ExtendScript files, без production dependencies.
- Описать стабильную схему `ae-solution.v1`: id, title, status, tags, intent, inputs, target assumptions, mutating/read-only flag, risk level, required safety gates, verification recipe, tested AE context и promotion history.
- Добавить dependency-free validator, который проверяет registry shape, уникальность ids, допустимые статусы, обязательные safety fields для mutating/raw ExtendScript entries и отсутствие абсолютных project-specific paths в promoted recipes.
- Задокументировать contract в README или `docs/`, чтобы новые решения добавлялись одинаково и не превращались в неструктурированный архив JSX.

### Milestone 68: Candidate capture and quarantine

- Добавить локальный ignored quarantine area для свежих удачных решений, например `logs/solution-candidates/`, чтобы live experiments не попадали в git автоматически.
- Добавить helper/report format для ручного сохранения candidate: исходный user intent, generated script/tool plan, affected target summary, run result, verification read-back, warnings, project assumptions и suggested next promotion action.
- Интегрировать capture с существующими Agent run reports и bridge logs без записи secrets, API keys, full project scans или больших raw transcripts.
- Добавить smoke coverage на candidate report generation без live AE и external providers.

### Milestone 69: Promotion validation pipeline

- Добавить promotion helper, который переносит candidate в tracked solution entry только после явного review decision и заполняет registry metadata.
- Для raw ExtendScript promotion требовать file-based execution shape, small script size, undo group for mutations, generated prefixes/comments where applicable, no broad project deletion, no hard-coded active project paths и explicit verification steps.
- Добавить local validation suite: registry validator, promoted script syntax/static checks where possible, plan validation/dry-run fixtures и checks that promoted solutions do not recommend raw ExtendScript when an existing typed tool fits.
- Зафиксировать правило: repeated stable recipes should become typed bridge tools rather than permanent raw JSX shortcuts.

### Milestone 70: Planner retrieval and safe use

- Добавить read-only solution retrieval path for planning prompt: compact top-N relevant recipes by tags/intent/risk, never the full library.
- Обновить Agent planning prompt so solutions are advisory recipes, not execution bypasses; every suggested action still becomes normal validated plan steps.
- Добавить risk-aware behavior: `candidate` entries are invisible to planner by default, `recipe` entries can be suggested, `typed-tool-candidate` can recommend tool implementation, `tool` is represented by normal MCP tool catalog.
- Покрыть planner corpus cases: relevant recipe is surfaced, irrelevant/stale recipe is omitted, raw ExtendScript recipe is marked risky, and typed-tool equivalent wins when available.

### Hotfix: Agent `itemIndexes` runtime binding

- Исправить live Agent-run regression, где plan step для переименования source/precomp project items блокировался с `Unresolved runtime bindings: itemIndexes`.
- Нормализовать common planner aliases such as `itemIndexes` to canonical tool schema field `itemIndices`.
- Добавить plural project-item binding resolution from selected source/precomp layers and project item search results.
- Сохранить существующие safety gates: rename/mutation execution still goes through validation, mutation permission, idempotency, checkpoint/edit-session protection and read-back verification.

### Milestone 71: Solution library validation

- Seed the library with 1-2 low-risk reviewed examples from existing proven workflows, preferably recipe-first and typed-tool-based rather than new mutating JSX.
- Run full local smoke suite plus solution-specific validators; run read-only live inspection only if AE/panel are available.
- Run external OpenAI CLI planner smokes or live mutating AE validation only after explicit approval; if run, use generated prefixes, checkpoint/edit-session protection and generated QA audit before/after.
- Update plan Decision Log, Validation and handoff with the library schema, promotion rules, seeded entries, validation evidence and next recommended reliability milestone.

### Hotfix: OpenAI CLI detection and setup action

- Fix OpenAI CLI setup state when the bridge process cannot find `codex` through its inherited PATH even though Codex Desktop installed a local CLI under the user's profile.
- Keep explicit `CODEX_CLI_PATH` / `CODEX_PATH` overrides authoritative for tests and custom installs.
- Make the missing-CLI setup button actionable instead of disabled, so it can retry setup and show a backend error if the CLI is truly unavailable.
- Sync the installed CEP panel and restart the live bridge from the current repo after validation.

### Milestone 72: Parallel AI Paths - OpenRouter UI restore

- Insert the new `Parallel AI Paths: ChatGPT Connector + OpenRouter API` roadmap block before the previous reliability-layer milestones.
- Restore OpenRouter as a visible CEP provider tab while preserving backend ids and env names: `openrouter`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `openrouter/free`, and `:free` model variants.
- Add OpenRouter to provider self-test and CEP setup smoke coverage, including API-key setup, model list selection, `freeOnly` UI and disabled chat state when no key is saved.
- Update OpenRouter attribution headers to send `HTTP-Referer` and `X-OpenRouter-Title`, while keeping `X-Title` as a compatibility fallback.
- Cover OpenRouter with offline/fake-provider tests only; live OpenRouter calls remain explicit-approval-gated because they can spend API quota and expose prompt/project context.

### Milestone 73: ChatGPT Connector read-only skeleton

- Add an isolated `chatgpt-connector/` module for an Apps SDK/MCP HTTP `/mcp` server intended for ChatGPT Business/Admin custom connectors through a Cloudflare Tunnel.
- Keep the connector separate from normal API providers: it must not call OpenAI APIs itself; the ChatGPT subscription/workspace model calls AE Agent tools through the connector.
- Start with read-only bridge proxy tools and tool listing, with `readOnlyHint:true` annotations and no AE mutation/write tools exposed.
- Add a local/offline MCP tool-list smoke without requiring a live tunnel or ChatGPT workspace.

### Milestone 74: JSX Lab candidate quarantine and checks

- Add a controlled JSX Lab candidate flow for ChatGPT connector use: `propose_extendscript_candidate` stores candidate metadata and JSX in ignored quarantine.
- Add `check_extendscript_candidate` for syntax, static risk, size limit and denylist checks without mutating AE.
- Do not expose direct raw `run_extendscript` from ChatGPT; raw JSX must always pass through saved candidates and reports.
- Add offline smoke coverage for candidate save, redaction/path hygiene, static rejection and non-mutating check reports.

### Milestone 75: Gated JSX Lab run, promotion hooks and CEP connector status

- Add `run_extendscript_candidate` only for saved candidates, with explicit confirmation, checkpoint/edit-session protection, generated-prefix expectations, denylist enforcement and read-back verification.
- Add `promote_solution_candidate` hooks into the existing Solution Library review/promotion lifecycle: `candidate -> recipe -> typed-tool-candidate -> tool`.
- Add compact CEP status for ChatGPT Connector: connected/offline, local/tunnel status, exposed tools snapshot, last tool call, write actions enabled/disabled and emergency disable.
- Keep live ChatGPT connector checks, Cloudflare Tunnel checks and any live AE mutation run explicit-approval-gated.

### Milestone 76: Project Intent Memory

- Спроектировать lightweight per-project memory для Agent planning: главные comps, защищенные folders/assets, naming conventions, generated prefixes и user/project hints.
- Хранить память локально, без отправки секретов и без широкого project scan по умолчанию.
- Добавить явные read/update paths и compact summary для planning prompt.
- Покрыть offline smoke fixtures и read-only live inspection, не мутируя AE project.

### Milestone 77: Plan confidence and risk classification

- Добавить предварительную классификацию Agent plans: safe typed-tool, needs clarification, risky, unsupported.
- Связать classification с existing validation summary, mutation counts, affected targets, checkpoint expectation, raw ExtendScript risk и solution-library recipe risk.
- В CEP Plan Review показать короткий confidence/risk verdict до dry-run/run.
- Покрыть corpus cases для safe, ambiguous, risky и unsupported plans.

### Milestone 78: Plan repair loop

- Добавить bounded repair path для near-valid plans: missing required fields, common binding aliases, wrong tool names with obvious typed-tool equivalent.
- Не превращать repair в raw ExtendScript fallback и не исполнять repaired plan без повторной validation.
- Покрыть repair corpus и убедиться, что unsafe/ambiguous plans остаются blocked or clarification-needed.

### Milestone 79: Semantic verification

- Усилить post-run verification так, чтобы Agent сравнивал requested outcome с read-back summaries, а не только `tool completed`.
- Начать с typed-tool workflows из existing Agent scenario fixtures: timing, layout/animation, precomp/source/rename, render queue setup.
- Показывать concise verification result в run transcript и Agent run report artifact.
- Не добавлять внешние provider calls в verification без отдельного решения.

### Milestone 80: Reliability validation

- Собрать reliability validation suite: offline corpus, read-only live audit, provider readiness, and approved protected mutation checks.
- Разделить cheap local checks, read-only live checks, external-provider checks и mutating live AE checks.
- Сформировать handoff/release notes с доказательствами reliability layer перед добавлением новых AE mutation tools.

### Milestone 81: Inline Agent plan execution controls

- Добавить inline-действия к последнему валидному Agent-плану прямо внутри сообщения чата.
- Переименовать persistent run controls в `Проверить` / `Выполнить план`, сохранив существующий `/agents/plan/run` runner.
- Оставить старые/замененные планы неактивными, чтобы пользователь не запускал устаревший план после нового запроса.
- Обновить live CEP smoke так, чтобы он проверял наличие inline-кнопок и запускал read-only план через `Выполнить план`.

### Milestone 82: Восстановление последнего плана из чата

- Добавить composer-кнопку `Подхватить последний план из чата`.
- Сохранять структурированный `planResult` вместе с Agent transcript item, чтобы после reload можно было восстановить последний валидный план без повторного provider call.
- Для старых plan-like текстовых ответов без сохраненного `planResult` использовать безопасный fallback: отправить текст обратно в `/agents/plan` для нового validated Agent plan, не исполняя произвольный текст напрямую.
- Обновить live CEP smoke так, чтобы он генерировал план, перезагружал панель, восстанавливал план кнопкой и выполнял read-only run через существующий runner.
- Поднять patch-версию панели/bridge/manifest до `1.0.1`.

### Milestone 83: Dry run visibility and stale workspace guard

- Сделать dry-run действие явно видимым как `Dry run / Проверить` в persistent и inline controls.
- Добавить понятный in-flight/completion status для dry-run/run, чтобы клики не выглядели как отсутствие реакции.
- Усилить автоскролл transcript после working indicator и новых run results.
- Пометить старую папку `C:\Users\Ant\Documents\New project 2` как неактивную копию, чтобы будущие агенты не читали устаревший план до Milestone 37.
- Поднять patch-версию панели/bridge/manifest до `1.0.2`.

### Milestone 84: Hardcore dev escalation handoff

- Добавить backend `/agents/dev-request`, который создает локальный ignored bundle для typed-tool/panel escalation вместо длинной dev-работы внутри AE-чата.
- Bundle должен включать `request.md`, `ae-evidence.json`, `start-prompt.md` и `candidate.jsx`, если текущий Agent-план содержит raw ExtendScript workaround.
- Редактировать provider secrets, bridge tokens и локальные project paths перед записью bundle.
- Добавить CEP-кнопку `Prepare typed tool request`, видимую только для unsupported/raw/failed/semantic-needs-review Agent outcomes.
- По явному клику из панели пытаться открыть Codex App на текущем workspace через стабильный `codex app <repo>` path fallback.
- Поднять patch-версию панели/bridge/manifest до `1.0.3`.

### Milestone 85: Agent Hardcore visible mode and Cyrillic UI fix

- Add `Agent Hardcore` as a visible third composer mode next to `Chat` and `Agent`.
- Route Hardcore through the existing `/agents/plan` path with an explicit `hardcore` flag and no new execution shortcut.
- Add backend planning guidance for Hardcore: inspection first, dry-run/read-back evidence, verification, and typed-tool gap handoff instead of repo work inside AE chat.
- Fix mojibake in visible Cyrillic controls: `Подхватить последний план из чата`, `Dry run / Проверить`, and `Выполнить план`.
- Bump panel/bridge/manifest to `1.0.4` and synchronize the installed CEP extension.

### Milestone 86: Raw ExtendScript dry-run gate unlocks Run plan

- Keep raw ExtendScript classification blocking normal Run by default.
- After a successful dry run of the same current plan/request, store a short-lived accepted dry-run id in the panel and backend.
- Re-enable persistent and inline `Выполнить план` only for that matching raw dry-run gate.
- Send real runs through the existing protected runner with `confirm:true`, `allowMutations:true`, `autoEditSession:true`, `allowRawExtendscript:true`, and `rawExtendscriptDryRunId`.
- Update ChatGPT JSX Lab candidate runs to perform the same preflight dry-run gate before a real raw file execution.
- Add offline/backend and CEP/CDP smoke coverage for the unlocked-button payload.

### Milestone 87: Dev request manual Codex chat handoff

- Stop `Prepare typed tool request` from launching Codex App by default, because v1 cannot create a new Codex App chat automatically.
- Change the panel result text to say that the bundle was prepared, no new chat was auto-created, and the next step is to open a Codex App dev chat from `start-prompt.md`.
- Keep backend `codex app <repo>` fallback available for explicit callers, but hide its console window and report `autoChatCreated:false`.
- Bump panel/bridge/manifest to `1.0.5` and synchronize the installed CEP extension.

## Decision Log

- 2026-05-13: ChatGPT subscription access uses Codex CLI auth, not a normal OpenAI API key.
- 2026-05-13: `OpenAI -> API` remains separate and uses normal API billing.
- 2026-05-13: Gemini and Claude use provider API keys and official HTTP APIs.
- 2026-05-13: No Pro/license gate is part of AE Agent.
- 2026-05-13: No production dependencies are added unless a milestone records a concrete reason.
- 2026-05-13: Installed CEP validation copies only changed panel files into `C:\Users\Ant\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge`.
- 2026-05-13: Keep only the native CEP title/menu product name; do not duplicate product title rows inside the panel.
- 2026-05-13: Agent plans should prefer typed bridge tools and avoid raw ExtendScript for common workflows.
- 2026-05-13: Runtime binding aliases resolve against established tool result shapes, not literal field names only.
- 2026-05-13: New mutating tools must join the existing checkpoint/idempotency/verification model.
- 2026-05-13: Render queue setup tools may prepare queue items and outputs, but starting a render remains out of scope for this roadmap block.
- 2026-05-13: Spatial Position properties expect a single temporal `KeyframeEase` entry in `apply_keyframe_ease`; non-spatial array properties may still use value dimensionality.
- 2026-05-13: AE project item indexes can shift after item-creating operations such as precompose; live validation and Agent follow-up steps should use returned/read-back indexes such as `sourceComp.itemIndex`.
- 2026-05-14: Roadmap 1.1 не включает отдельную веху русификации UI или документации.
- 2026-05-14: Roadmap 1.1 не включает render workflow polish; существующие render queue setup tools остаются доступными, но отдельной render-вехи в этом блоке нет.
- 2026-05-14: Workflow presets являются только prompt helpers; они не должны обходить Agent planning, validation, dry-run или mutation gates.
- 2026-05-14: Plan Review UX остается text-first внутри chat transcript; backend plan schemas и execution gates не меняются, а CEP только яснее показывает affected targets, mutation count, checkpoint expectation и read-only/protected run readiness.
- 2026-05-14: Project Context Snapshot выполняется как компактный planning preflight перед provider call; он использует только bridge status, `get_active_comp` и `get_render_queue_status`, пропускает AE-запросы при offline panel и остается подсказкой, которую план все равно должен проверять read tools перед мутациями.
- 2026-05-14: Recovery UX не добавляет restore-кнопки и не запускает восстановление автоматически; failed run получает только текстовый `recoveryHint`, сформированный из safety/checkpoint/undo metadata.
- 2026-05-14: Provider reliability errors нормализуются через стабильный `providerError` с `code/status/message/setupHint/retryable`; UI и MCP получают один и тот же user-facing error, а сырые provider failures остаются вспомогательным контекстом.
- 2026-05-14: CEP sync health считается read-only по умолчанию; запись в установленное extension выполняется только явным `--sync`/`-SyncOnly`, копирует только tracked files и не удаляет сторонние файлы.
- 2026-05-14: Roadmap 1.1 закрыт полной validation и документацией; следующий work block должен начинаться отдельной новой вехой, а не продолжать этот список.
- 2026-05-14: `scripts\install-cep-panel.ps1 -SyncOnly` должен выполнять только safe sync/health-check и не должен повторно включать PlayerDebugMode в реестре; full install по-прежнему выполняет registry debug setup.
- 2026-05-14: Для release этого блока используется fast-forward merge в `master` и lightweight tag `v0.26.0-agent-ux-polish`, чтобы сохранить существующий стиль тегов repo.
- 2026-05-14: Roadmap 1.2 live Agent QA использует deterministic backend fallback, когда panel planner возвращает пустой или частичный plan; это решение валидирует runtime typed tools и protection, но не меняет product planner behavior.
- 2026-05-14: Live Agent QA удаляет только generated assets с префиксом `Codex QA 1.2 <stamp>`; render queue cleanup ограничен items, у которых comp name начинается с текущего generated prefix.
- 2026-05-15: Planner-fidelity контрольным provider становится `openai-cli` / `gpt-5.5`, то есть ChatGPT subscription path через Codex CLI; Ollama остается полезным local smoke provider, но не является итоговым критерием Milestone 56.
- 2026-05-15: Для `agent-scenario-openai-cli-smoke` fallback через `/agents/plan/run` может выполнить cleanup/runtime validation, но сам command должен падать при fallback, чтобы не скрывать planner-quality regression.
- 2026-05-15: OpenAI CLI readiness diagnostics добавляются как additive поля внутри `codexStatus`; публичные provider ids, auth modes, transports и readiness gates не меняются.

- 2026-05-15: После перезапуска live bridge можно проверять новые OpenAI CLI diagnostic fields через `/agents/readiness?checkModels=0`; полный `agent-scenario-openai-cli-smoke` требует явного разрешения на внешний OpenAI/Codex CLI planner-запрос и временные AE-мутации.
- 2026-05-15: После явного разрешения пользователя полный `agent-scenario-openai-cli-smoke` можно учитывать как отдельный validation milestone; он не требует code changes, если `panelPlanCount` совпадает со scenario count и cleanup возвращает render queue к baseline.
- 2026-05-15: Roadmap 1.3 начинается от чистого baseline Milestone 59 на ветке `codex/roadmap-1.3-planning`; блок должен усилить Agent QA observability и regression confidence перед добавлением нового AE mutation behavior.
- 2026-05-15: External planner smokes и live AE mutation smokes остаются approval-gated, когда они отправляют project context через OpenAI/Codex CLI или временно мутируют live AE project.
- 2026-05-15: Agent scenario report artifacts используют компактную локальную JSON-схему `agent-run-report.v1`; live smoke пишет их в игнорируемую `logs\agent-run-reports\`, а tracked docs фиксируют только решения и validation results.
- 2026-05-15: Planner regression corpus держит accepted Agent scenario prompts и expected plan shapes в dependency-free `scripts\agent-scenario-fixtures.js`; live CEP scenario smoke и offline corpus smoke используют один источник сценариев.
- 2026-05-15: Offline planner corpus smoke проверяет `/agents/plan/validate` и dry-run `/agents/plan/run` через локальный bridge daemon без external providers, без CEP panel requirement и без AE project mutations.
- 2026-05-15: Generated QA audit остается read-only: он читает project items, render queue, checkpoint records и edit-session records, но deletion остается только в существующих guarded cleanup paths с точными generated prefixes.
- 2026-05-15: Provider self-test UX использует существующий `/agents/readiness` contract для OpenAI API, OpenAI CLI, Gemini, Claude и Local/Ollama; публичная provider shape не меняется, а UI показывает только безопасные summaries без API key values.
- 2026-05-15: Self-test results не сбрасываются обычным reload списка агентов, чтобы startup refresh не стирал только что полученную диагностику; новый запуск self-test очищает результаты перед повторной проверкой.
- 2026-05-15: Milestone 65 выявил race в CEP provider key-save UX: старые `loadAgents` ответы могли очистить введенный API key или откатить `key saved` state. Панель теперь применяет readiness из `/agents/key`, сохраняет typed key при refresh того же агента и игнорирует stale agent-list responses.
- 2026-05-15: Полная validation 1.3 не запускает external OpenAI CLI planner smoke и live AE mutation smoke без отдельного approval; Milestone 65 закрывается local suite, provider key save, read-only live CEP smoke и read-only generated QA audit.
- 2026-05-15: Следующий roadmap block после 1.3 validation — Agent reliability layer: project intent memory, plan confidence/risk classification, bounded plan repair, semantic verification и отдельная reliability validation веха.
- 2026-05-15: После обсуждения live ChatGPT-in-AE testing roadmap получает промежуточный блок `Safe Solution Library`: удачные одноразовые ExtendScript/Agent решения сначала попадают в quarantine как candidates, затем проходят explicit promotion в reviewed recipes или typed tools; automatic promotion после одного успешного запуска запрещен.
- 2026-05-15: Solution Library не должна становиться обходом safety model: promoted solutions only advise planner context, while execution remains through validated Agent plans, mutation gates, idempotency, checkpoint/edit-session protection and read-back verification.
- 2026-05-15: Milestone 67 вводит tracked registry baseline через `registry/solutions.json`, `recipes/` и `scripts/solutions/`; `candidate` и другие unreviewed статусы запрещены в tracked library, а первые реальные entries будут добавляться отдельным promotion/seed milestone.
- 2026-05-15: `node scripts\solution-registry-smoke.js` становится dependency-free gate для `ae-solution.v1` metadata: он проверяет форму registry, уникальность ids, path/secret hygiene, safety gates для mutating entries и более строгие требования к raw ExtendScript, пока planner retrieval остается выключенным до Milestone 70.
- 2026-05-15: Milestone 68 добавляет ignored quarantine `logs\solution-candidates\` и schema `solution-candidate-report.v1` для ручного capture удачных live candidates; candidate reports остаются локальными, не видны planner retrieval, требуют explicit promotion и проходят redaction/drop guards для секретов, абсолютных путей, raw transcripts/log tails и full project scans.
- 2026-05-15: Milestone 69 вводит explicit promotion review schema `solution-promotion-review.v1`: tracked registry entry создается только после `explicitReview:true`, local plan fixture validation, typed-tool comparison для raw JSX и повторной registry validation. Repeated stable raw JSX recipes должны становиться `typed-tool-candidate`/typed bridge tools, а не постоянными shortcuts.
- 2026-05-15: Milestone 70 включает только read-only advisory retrieval для Agent planning prompt: bridge читает tracked `registry/solutions.json`, выбирает compact top-N по tags/intent/tools/risk и никогда не читает ignored candidate quarantine или full library.
- 2026-05-15: Solution status handling в planner retrieval risk-aware: `candidate` невидим, `recipe` может быть подсказкой, `typed-tool-candidate` рекомендует typed bridge tool implementation, а `tool` считается представленным обычным MCP tool catalog и подавляет matching raw JSX equivalents.
- 2026-05-15: Agent runtime binding теперь принимает model-produced plural aliases `itemIndexes` / `itemIndices` для project-item workflows, но canonical execution args остаются schema-first (`itemIndices` for `rename_project_items`); алиасы не обходят validation или mutation safety gates.
- 2026-05-15: Для selected source/precomp workflows plural project-item bindings могут извлекаться из `get_active_comp` / `get_selected_layers` selected layer source refs или из `find_project_items` matches; одиночные target fields получают первый индекс, а array-capable fields получают deduped list.
- 2026-05-15: Milestone 71 seeds only reviewed typed-tool recipes: `active-comp-context-review` for read-only context inspection and `selected-layers-align-to-cti` for the proven CTI alignment workflow. No raw JSX solution is promoted in this milestone.
- 2026-05-15: `node scripts\solution-library-validation-smoke.js` becomes the combined library validation gate for seeded entry quality, advisory prompt-section bounds, candidate invisibility and stale/tool-equivalent retrieval behavior.
- 2026-05-15: OpenAI CLI detection now falls back to the Codex Desktop local install path `%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe` when no explicit CLI path is configured and the bridge's PATH cannot resolve `codex`; explicit `CODEX_CLI_PATH` / `CODEX_PATH` still take precedence.
- 2026-05-15: The OpenAI CLI setup button no longer becomes a disabled `Install Codex CLI` dead end when the live bridge reports missing CLI; it stays actionable as `Retry CLI check` and surfaces backend setup errors.
- 2026-05-15: Parallel AI Paths block is inserted before Project Intent Memory; OpenRouter UI restore is the first small reviewable milestone because the backend provider and secret-store path already exist.
- 2026-05-15: OpenRouter remains a normal API-billed provider path, separate from OpenAI API and ChatGPT/Codex CLI subscription access; live OpenRouter chat/plan calls stay explicit-approval-gated.
- 2026-05-15: OpenRouter attribution headers now send `HTTP-Referer` and `X-OpenRouter-Title`, while keeping legacy `X-Title` as a compatibility fallback.
- 2026-05-15: ChatGPT Connector will be an isolated Apps SDK/MCP `/mcp` server reached through Cloudflare Tunnel for development; it will not call OpenAI APIs itself and must not commit tunnel URLs, connector tokens or secrets.
- 2026-05-15: ChatGPT Connector tools start read-only with `readOnlyHint:true`; write/JSX tools require explicit server-side risk signals and confirmation gates before exposure.
- 2026-05-15: Milestone 73 exposes a fixed read-only ChatGPT connector allowlist that is available offline for tool discovery, while tool calls proxy to the existing bridge only when invoked; provider chat/planning, plan execution, write tools, and raw ExtendScript stay excluded.
- 2026-05-15: The ChatGPT connector supports an optional `AE_CHATGPT_CONNECTOR_TOKEN` for local `/mcp` development without committing connector secrets, tunnel URLs, or captured traffic.
- 2026-05-15: JSX Lab must use candidate quarantine and static/risk checks before any execution; ChatGPT must never receive a direct raw `run_extendscript` string path that bypasses candidate reports, checkpoint/edit-session protection and read-back verification.
- 2026-05-15: Milestone 74 keeps ChatGPT JSX Lab local-only: `propose_extendscript_candidate` is disclosed as a non-read-only quarantine write under ignored `logs/solution-candidates/jsx-lab/`, `check_extendscript_candidate` returns static non-execution reports, bridge inspection tools remain read-only, and raw `run_extendscript` / `run_extendscript_file` stay unexposed.
- 2026-05-15: `run_extendscript_candidate` remains opt-in disabled unless `AE_CHATGPT_CONNECTOR_WRITE_ACTIONS=1`; even when enabled it only runs saved accepted candidates through `/agents/plan/run` with `confirm:true`, hash confirmation, generated-prefix evidence, `allowRawExtendscript:true` inside the bridge runner, checkpoint/edit-session protection and read-back allowlist calls.
- 2026-05-15: `promote_solution_candidate` creates only ignored `solution-candidate-report.v1` promotion hooks. It does not write `registry/solutions.json`, does not make candidates planner-visible and blocks direct `candidate -> tool` promotion; tracked promotion remains explicit review through `solution-promotion-helper.js`.
- 2026-05-15: The CEP ChatGPT Connector status card polls the local connector `/status` endpoint for local/tunnel state, exposed tool snapshot, last tool call and write-action state; emergency disable blocks connector local write actions until restart.
- 2026-05-15: Project Intent Memory хранится локально в tracked `registry/project-intent-memory.json` как compact reviewed hints; planner получает только bounded top matches и не весь registry.
- 2026-05-15: `update_project_intent_memory` является явным operator/MCP update path с `confirm:true` и hygiene checks, но не входит в Agent planning catalog, чтобы AI-generated AE plans не могли обновлять память как обычный step.
- 2026-05-16: Plan classification добавляется как additive metadata поверх existing validation: `planValidation.classification`, `planClassification` у planner result и `run.classification` у runner result; базовые validation поля и safety gates остаются источником истины.
- 2026-05-16: `safe typed-tool` означает только read-only validated typed-tool plan. Любая project mutation классифицируется как `risky`, даже если typed-tool validation проходит и Run может идти через protected edit-session.
- 2026-05-16: `needs clarification` и `unsupported` получают `blocksRun:true`; backend также блокирует dry-run для non-actionable classifications через `allowsDryRun:false`, чтобы пустые или operator-tool планы не выглядели готовыми.
- 2026-05-16: Solution Library и Project Intent Memory signals входят в classification только как advisory context; они усиливают risk/safety verdict, но не делают plan executable и не обходят validation, mutation gates или checkpoints.
- 2026-05-16: Plan repair выполняется локально и детерминированно после первичной validation: только bounded tool aliases, schema arg/binding aliases и runtime bindings из уже запланированных read/create steps. Repair не вызывает provider, не предлагает raw ExtendScript fallback и не исполняется без повторной validation/classification.
- 2026-05-16: `/agents/plan/validate`, `validate_ai_agent_plan`, `plan_with_ai_agent` и `/agents/plan/run` возвращают additive `planRepair` metadata; когда repair применен, runner использует repaired plan только после revalidation. Ambiguous, unsupported и non-obvious plans остаются blocked или clarification-needed.
- 2026-05-16: Semantic verification добавляется как локальный deterministic post-run слой `ae-agent-semantic-verification.v1`: он сравнивает requested typed-tool outcome с result/read-back summaries после последней мутации, не вызывает provider и не меняет `run.ok`.
- 2026-05-16: Для passed semantic verification у mutating Agent-run нужен явный read-back summary step после мутаций; per-step `verifyAfter` snapshots остаются evidence, но без финального read-back outcome помечается `needs_review`.
- 2026-05-16: Reliability validation suite фиксируется как orchestration/reporting слой, а не новый execution shortcut: `local` запускает дешевые offline/fake-provider проверки, `provider-readiness` использует live readiness только с `checkModels=0`, `read-only-live` не мутирует AE project, а `external-provider` и `mutating-live` требуют явных флагов approval.
- 2026-05-17: Inline `Выполнить план` в Agent-чате является UX-обвязкой над существующим `/agents/plan/run`; она не обходит validation, classification blocks, dry-run, `confirm:true`, `allowMutations`, checkpoint/edit-session protection или semantic verification.
- 2026-05-17: `Подхватить последний план из чата` восстанавливает только сохраненный structured `planResult`; старые текстовые планы без metadata перепланируются через `/agents/plan` и не исполняются напрямую.
- 2026-05-17: Любое изменение кода панели должно поднимать patch-часть версии после второй точки; текущая панель, manifest, daemon и adapter обновлены до `1.0.1`.
- 2026-05-17: Старый каталог `C:\Users\Ant\Documents\New project 2` является stale copy после переноса; его `AGENTS.md` и план теперь явно направляют в активный репозиторий `C:\Users\Ant\Documents\Codex\AE_agent`.
- 2026-05-17: Dry-run действие должно быть подписано явно как `Dry run / Проверить`; статус строки плана после клика сообщает о запуске и о том, что результат добавлен ниже.
- 2026-05-17: Текущее изменение кода панели подняло panel, manifest, daemon и adapter до `1.0.2`.
- 2026-05-17: Hardcore dev escalation не выполняет repo-разработку внутри AE-чата. Панель только создает compact local handoff bundle для отдельного Codex App dev-чата, когда Agent outcome показывает typed-tool gap.
- 2026-05-17: Dev-request bundle пишется в ignored `logs/dev-requests/<id>/`, потому что `.codex/dev-requests` может быть недоступен для записи дочернему bridge-процессу в sandboxed окружении.
- 2026-05-17: `Prepare typed tool request` видим только для unsupported/raw/failed/semantic-needs-review outcomes и не создает escalation, если текущий Agent workflow решается существующими typed tools.
- 2026-05-17: Текущее изменение кода панели подняло panel, manifest, daemon и adapter до `1.0.3`.

- 2026-05-17: Agent Hardcore is now a visible composer mode next to `Agent`, not only a post-run action. In v1.0.4 it uses the existing `/agents/plan` endpoint with `hardcore:true` and stronger planning guidance for inspection/read-back/verification.
- 2026-05-17: CEP panel Cyrillic control labels must be stored as valid UTF-8, not mojibake; this fix replaces the visible labels with readable Russian text.
- 2026-05-17: This panel code change bumped panel, manifest, daemon and adapter to `1.0.4`.
- 2026-05-18: Raw ExtendScript remains blocked by classification until a successful dry run of the same current plan records a matching short-lived gate id; unlocking `Выполнить план` sends that id to the protected runner rather than bypassing mutation/checkpoint/edit-session safety.
- 2026-05-18: ChatGPT JSX Lab real candidate runs must follow the same bridge contract: preflight dry-run first, then real `/agents/plan/run` with `allowRawExtendscript:true` and the returned `rawExtendscriptDryRunId`.
- 2026-05-18: `Prepare typed tool request` creates only the local handoff bundle in v1. It does not launch Codex App or imply that a new Codex App chat was created; chat creation stays manual from `start-prompt.md` until a stable local API exists.

## Validation

- Milestone 38:
  - Rewrote the active handoff as a clean current-state document.
  - Replaced the historical plan with the current stable baseline and active roadmap.
  - Passed repo-wide stale-input reference search.
  - Passed installed CEP extension stale-input reference search.
  - Passed `git diff --check`.
- Milestone 39:
  - Tightened the AE planning prompt around typed tools first and raw ExtendScript last.
  - Added clearer validation warnings for unknown tools, runtime bindings, mutation safety defaults, and broad mutating plans.
  - Added `targetSummary` to validated and run plan steps.
  - Updated the CEP plan/run transcript formatting to show affected targets.
- Milestone 40:
  - Added `set_comp_work_area`, `set_layer_time_range`, `stagger_layers`, and `split_layers_at_time`.
  - Added public schemas, planning catalog entries, mutation safety coverage, and queue smoke coverage.
- Milestone 41:
  - Added `precompose_layers`, `replace_layer_source`, `rename_layers`, and `rename_project_items`.
  - Added public schemas, planning catalog entries, mutation safety coverage, and queue smoke coverage.
- Milestone 42:
  - Added `update_text_layer`, `create_shape_layer`, and `fit_layer_to_comp`.
  - Added public schemas, planning catalog entries, mutation safety coverage, and queue smoke coverage.
- Milestone 43:
  - Added `set_property_keyframes`, `apply_keyframe_ease`, `set_expression`, and `clear_expression`.
  - Added public schemas, planning catalog entries, mutation safety coverage, and queue smoke coverage.
- Milestone 44:
  - Added `add_comp_to_render_queue`, `set_render_queue_output`, and `get_render_queue_status`.
  - Kept render start out of scope.
  - Added public schemas, planning catalog entries, and smoke coverage.
- Roadmap block validation:
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `git diff --check`.
  - Passed repo-wide stale-input reference search.
  - Copied changed `cep-panel\panel.js` to the installed CEP extension.
  - Passed installed CEP extension stale-input reference search.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
- Milestone 45:
  - Restarted the live daemon from `C:\Users\Ant\Documents\Codex\AE_agent`; bridge status reported logs, secrets, and backups under the relocated project root with the CEP panel connected.
  - Created checkpoint `final_slides-checkpoint-live-typed-tools-2026-05-13-2026-05-13T18-40-53-948Z.aep` before live mutations.
  - Live typed-tool validation covered `set_comp_work_area`, `set_layer_time_range`, `stagger_layers`, `split_layers_at_time`, `update_text_layer`, `create_shape_layer`, `fit_layer_to_comp`, `set_property_keyframes`, `apply_keyframe_ease`, `set_expression`, `clear_expression`, `precompose_layers`, `replace_layer_source`, `rename_layers`, `rename_project_items`, `add_comp_to_render_queue`, `set_render_queue_output`, and `get_render_queue_status`.
  - Found and fixed an AE runtime failure in `apply_keyframe_ease` for spatial Position properties: AE expects one temporal ease entry for spatial position values.
  - Added smoke coverage that checks the generated `apply_keyframe_ease` script includes the temporal ease dimension helper.
  - Verified live render queue cleanup removed the generated render queue item and `cleanup_test_items` removed 5 generated project items for prefix `Codex Test Live Typed 1778698579888`.
  - Verified `find_project_items` returned no matches for `Codex Test Live Typed 1778698579888` after cleanup.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
- Milestone 46:
  - Переписал следующий roadmap-блок без отдельной русификации рабочего слоя и без render workflow polish.
  - Добавил compact workflow preset control в CEP composer.
  - Добавил пять prompt presets: selected-layer timing, precompose/rename, text/shape layout, basic animation и source replacement.
  - Preset insert переключает панель в Agent mode, включает Prompt Optimization, вставляет prompt без автоотправки и сбрасывает stale `lastPlanResult`.
  - Добавил `node scripts\cep-panel-cdp-smoke.js workflow-preset-smoke`.
  - Скопировал измененные `index.html`, `panel.js` и `style.css` в установленное CEP extension.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js workflow-preset-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
- Milestone 47:
  - Добавил compact `planRunStatus` рядом с `Dry run` / `Run plan`, чтобы до запуска было видно: нет плана, read-only план готов, либо mutating run пойдет через protection.
  - Улучшил Plan Review transcript: теперь он явно показывает `Plan review`, `Affected targets`, `Mutations`, `Checkpoint expectation`, `Run readiness` и grouped warnings.
  - Добавил CEP fallback для affected targets из уже существующих step args, например `create_test_comp` теперь показывает будущий `new comp ...` target без изменения backend schema.
  - Улучшил run/dry-run transcript: dry-run явно пишет, что проект не менялся; mutating run показывает protected project-change mode, edit session и checkpoint.
  - Добавил focused live CEP smoke `node scripts\cep-panel-cdp-smoke.js plan-review-smoke`.
  - Скопировал измененные `index.html`, `panel.js` и `style.css` в установленное CEP extension.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts\cep-panel-cdp-smoke.js plan-review-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js mutating-smoke`; generated `Codex Test Safe Run 36686021`, created a checkpoint under project backups, then cleaned up the generated composition.
- Milestone 48:
  - Добавил `planContextSnapshot` в Agent planning result и вставку `Current project context snapshot` в planning prompt.
  - Snapshot включает compact bridge context, active comp, selected layers, selected source/precomp hints с `{{selectedPrecompItemIndex}}`, render queue count и короткие recent bridge events.
  - Snapshot не делает широкие project scans и не блокирует planning при offline CEP panel; в этом случае prompt получает offline note.
  - Расширил `node scripts\prompt-optimization-smoke.js`: теперь он проверяет offline snapshot и simulated online CEP snapshot с selected precomp source и render queue count.
  - Перезапустил live bridge daemon на `127.0.0.1:3456` из `C:\Users\Ant\Documents\Codex\AE_agent`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\prompt-optimization-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js plan-review-smoke` against the restarted live daemon.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke` against the restarted live daemon. One earlier parallel `smoke` attempt timed out while `plan-review-smoke` was already using the single CEP panel; rerunning it separately passed.
- Milestone 49:
  - Добавил backend `recoveryHint` для failed Agent plan runs, вычисляемый из существующих `safety`, checkpoint и mutation undo metadata.
  - CEP run transcript теперь явно показывает `Checkpoint/edit session:` для dry-run, read-only run, protected mutating run и blocked safety states.
  - CEP показывает `Recovery:` только для failed runs; automatic restore actions не добавлялись.
  - Обновил smoke coverage: blocked mutating run теперь проверяет `recoveryHint`, live CEP smokes проверяют checkpoint/edit-session строки.
  - Скопировал обновленный `panel.js` в установленное CEP extension.
  - Перезапустил live bridge daemon на `127.0.0.1:3456` из текущего repo root.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts\cep-panel-cdp-smoke.js plan-review-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js mutating-smoke`; generated `Codex Test Safe Run 37940813`, created a checkpoint under project backups, then cleaned up the generated composition.
- Milestone 50:
  - Добавил нормализованный `providerError` для missing auth/setup, missing model, unavailable model, network failure, rate limit, malformed response и generic provider error.
  - `checkAgentReadiness`, `listAgents`, `chatWithAgent`, HTTP endpoints и MCP tool errors теперь прокидывают единый provider error object.
  - Chat response normalizers больше не считают пустой assistant text успешным ответом; такие ответы идут как `malformed_response`.
  - Расширил `node scripts\provider-api-smoke.js` fake-provider сценариями для missing key, unavailable model, network failure, 429, 401 и malformed response.
  - Перезапустил live bridge daemon на `127.0.0.1:3456` из текущего repo root.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\ai-agents.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\provider-api-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
- Milestone 51:
  - Добавил `scripts\cep-sync-health.js` для repo-versus-installed CEP health по `index.html`, `panel.js`, `style.css` и `CSXS/manifest.xml`.
  - Health report показывает file hashes, installed-file mismatch, repo daemon/panel/manifest versions и installed panel/title/manifest versions.
  - Добавил safe sync mode `node scripts\cep-sync-health.js --sync --check`, который копирует только missing/different tracked files; на текущей установке он скопировал 0 и пропустил 4 совпадающих файла.
  - Добавил `-SyncOnly` режим в `scripts\install-cep-panel.ps1`, чтобы installer мог использовать safe sync helper без полного recursive copy.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\cep-sync-health.js`.
  - Passed PowerShell parse check for `scripts\install-cep-panel.ps1`.
  - Passed `node scripts\cep-sync-health.js --check` against the installed CEP extension.
  - Passed `node scripts\cep-sync-health.js --sync --check` against the installed CEP extension; copied 0, skipped 4.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
- Milestone 52:
  - Обновил `README.md` с командами CEP install/sync health.
  - Добавил `docs\2026-05-14-roadmap-1.1-release-notes.md`.
  - Обновил `docs\2026-05-14-new-chat-handoff.md` и `docs\project-memory.md` под завершенный roadmap 1.1 block.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\ai-agents.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\provider-api-smoke.js`.
  - Passed `node --check scripts\cep-sync-health.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed PowerShell parse check for `scripts\install-cep-panel.ps1`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-sync-health.js --check` against the installed CEP extension.
  - Passed `node scripts\cep-sync-health.js --sync --check` against the installed CEP extension; copied 0, skipped 4.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts\cep-panel-cdp-smoke.js workflow-preset-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js plan-review-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js mutating-smoke`; generated `Codex Test Safe Run 39391233`, created checkpoint `final_slides2-checkpoint-session-ai-plan-69ae226e-2026-05-14T06-16-56-765Z.aep`, then cleaned up the generated composition.
- Milestone 53:
  - Review перед push/release нашел, что `scripts\install-cep-panel.ps1 -SyncOnly` использовал safe sync helper, но затем продолжал выполнять registry debug setup.
  - Исправил `-SyncOnly`: после `node scripts\cep-sync-health.js --sync --check` он выводит sync/health подсказки и завершает скрипт без `PlayerDebugMode` изменений.
  - Обновил `README.md`, чтобы явно указать: `-SyncOnly` не повторяет full install/debug-registry setup.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed PowerShell parse check for `scripts\install-cep-panel.ps1`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Initial sandboxed `node scripts\cep-sync-health.js --check` could not read the installed CEP extension; reran installed-panel validation with approved filesystem access.
  - Passed `node scripts\cep-sync-health.js --sync --check` against the installed CEP extension; copied 0, skipped 4.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke` against the live installed CEP panel on `127.0.0.1:3456`.
- Milestone 54:
  - Fetched `origin` before release prep; `master` was an ancestor of `codex-v0.26-agent-ux-polish`.
  - Fast-forward merged `codex-v0.26-agent-ux-polish` into `master`.
  - Initial committed-range `git diff --check origin/master..HEAD` reported a legacy EOF blank line in `docs\v0.9-new-chat-handoff.md`; removed it before tagging.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\ai-agents.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\provider-api-smoke.js`.
  - Passed `node --check scripts\prompt-optimization-smoke.js`.
  - Passed `node --check scripts\cep-sync-health.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed PowerShell parse check for `scripts\install-cep-panel.ps1`.
  - Passed working-tree `git diff --check` after the EOF cleanup.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - `node scripts\cep-sync-health.js --check` first reported byte mismatches between merged `master` and installed CEP files; `node scripts\cep-sync-health.js --sync --check` then copied 4 tracked files and reported ok.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke` against the synced installed CEP panel on `127.0.0.1:3456`.
- Milestone 55:
  - Added `node scripts\cep-panel-cdp-smoke.js agent-scenario-smoke`.
  - Covered four live Agent-mode QA workflows: `timeline-layer-timing`, `text-shape-layout-animation`, `precomp-source-rename`, and `render-queue-setup`.
  - Strengthened panel plan acceptance to require the exact validation summary step/mutation counts, mutating run status, and enabled dry-run/run buttons; prompt text alone no longer satisfies the check.
  - Added deterministic backend fallback for empty/partial panel plans, using `/agents/plan/run` dry-run and protected run with `autoEditSession:true`.
  - Added generated-prefix render queue cleanup before project item cleanup, then verified no generated project items remain and render queue returns to baseline.
  - Before the next live run, checked the previous failed stamp `Codex QA 1.2 47551055`; no generated project items remained and render queue was already at `0`, so no one-off guarded deletion was needed.
  - Live `agent-scenario-smoke` passed twice with `ollama-local` / `gemma4:latest`; final run prefix was `Codex QA 1.2 84055932`.
  - In final live QA, local `gemma4:latest` returned empty or partial panel plans, including a render-plan unknown-tool variant; all four scenarios therefore used deterministic fallback and completed protected runs with checkpoints/edit sessions.
  - Final cleanup removed generated project items per scenario (`3`, `1`, `4`, `1`), removed `1` generated render queue item in the render scenario, and left final render queue total at `0`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Initial sandboxed `node scripts\cep-sync-health.js --check` could not read the installed CEP extension; reran installed-panel validation with approved filesystem access.
  - Passed `node scripts\cep-sync-health.js --check` against the installed CEP extension; files and versions matched.
  - Passed `node scripts\cep-panel-cdp-smoke.js inspect`.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js mutating-smoke`; generated `Codex Test Safe Run 84026908`, created checkpoint `final_slides2_tests-checkpoint-session-ai-plan-f5414a3d-2026-05-14T18-40-48-237Z.aep`, then cleaned up the generated composition.
  - Passed `node scripts\cep-panel-cdp-smoke.js agent-scenario-smoke` after the full suite.
- Milestone 56:
  - Added `node scripts\cep-panel-cdp-smoke.js agent-scenario-openai-cli-smoke`.
  - The new command explicitly selects OpenAI provider group, CLI auth mode, `openai-cli`, and `gpt-5.5` before each Agent scenario.
  - Agent scenario reports now include planner config, provider readiness, `plannerAcceptance`, per-scenario `panelPlan.accepted`, expected validation summary, expected step/mutation counts, exact acceptance checks, and transcript tail.
  - `agent-scenario-openai-cli-smoke` requires all four scenarios to use `panel-agent-plan`; if any scenario uses deterministic fallback, cleanup/runtime validation still runs but the command exits with failure.
  - Initial `agent-scenario-openai-cli-smoke` run produced `panelPlanCount: 3`, `fallbackCount: 1`; `gpt-5.5` added extra inspection/discovery steps to `text-shape-layout-animation`.
  - Tightened `exactPlanPrompt` to preserve the fixture plan length/order/titles/tools/args and to forbid extra discovery, inspection, checkpoint, cleanup, verification, or explanatory steps.
  - Final live `agent-scenario-openai-cli-smoke` passed with prefix `Codex QA 1.2 87813893`, `panelPlanCount: 4`, `fallbackCount: 0`, and `renderQueueTotal: 0`.
  - Final cleanup removed generated project items per scenario (`3`, `1`, `4`, `1`), removed `1` generated render queue item in the render scenario, and left final cleanup removed count at `0`.
  - Shell `codex login status` returned `Not logged in`; an interactive `codex login` attempt timed out, but the live bridge/panel OpenAI CLI readiness reported `ready` and both GPT-5.5 live smokes succeeded through the product path.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js openai-cli-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js agent-scenario-openai-cli-smoke`.
- Milestone 57:
  - Added compact `codexStatus.versionCheck` and `codexStatus.loginStatusCheck` diagnostics for OpenAI CLI readiness.
  - The diagnostics include command args, exit status, signal, error code/message, and short output, while preserving existing provider ids, auth modes, transports, and readiness gates.
  - Extended `node scripts\provider-contract-smoke.js` with fake Codex CLI not-logged-in and logged-in checks.
  - Added `codexStatus` summary to Agent scenario live preflight reports so OpenAI CLI planner QA can show shell/bridge readiness details.
  - Confirmed local shell module readiness reports installed CLI `codex-cli 0.130.0-alpha.5`, `login status` exit `1`, and `Not logged in`.
  - Confirmed the currently running live bridge still reports OpenAI CLI ready and `node scripts\cep-panel-cdp-smoke.js openai-cli-smoke` passed through the product path; the live daemon was not restarted during this diagnostic-only milestone.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\ai-agents.js`.
  - Passed `node --check scripts\provider-contract-smoke.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js inspect`.
  - Passed `node scripts\cep-panel-cdp-smoke.js openai-cli-smoke`.
- Milestone 58:
  - Restarted the live bridge daemon on `127.0.0.1:3456` from `C:\Users\Ant\Documents\Codex\AE_agent`; stopped PID `33836` and started PID `14228`.
  - Confirmed bridge health after restart: `ok: true`, version `1.0.0`, panel connected, pending `0`, inflight `0`.
  - Confirmed live readiness for `openai-cli` / `gpt-5.5` with `checkModels=0`: status `ready_unverified`, configured `true`, canChat `true`, modelSource `not_checked`.
  - Confirmed live `codexStatus.versionCheck`: args `--version`, status `0`, output `codex-cli 0.130.0-alpha.5`.
  - Confirmed live `codexStatus.loginStatusCheck`: args `login status`, status `0`, output `Logged in using ChatGPT`.
  - No JavaScript files were changed, so there were no touched JavaScript files for `node --check`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js inspect` against the restarted live daemon.
  - Did not run `node scripts\cep-panel-cdp-smoke.js agent-scenario-openai-cli-smoke`: it requires explicit user approval because it sends planner prompts/project context through OpenAI/Codex CLI and temporarily mutates the live AE project.
- Milestone 59:
  - Received explicit user approval to run the full OpenAI CLI Agent smoke.
  - Preflight passed: live bridge health `ok: true`, version `1.0.0`, panel connected, pending `0`, inflight `0`; installed CEP page title `AE Agent 1.0.0`; selected agent `openai-cli`, model `gpt-5.5`.
  - Passed `node scripts\cep-panel-cdp-smoke.js agent-scenario-openai-cli-smoke`.
  - Smoke run prefix: `Codex QA 1.2 16056606`.
  - Planner readiness reported `openai-cli` / `gpt-5.5` ready with remote model list count `6`, `codex-cli 0.130.0-alpha.5`, and `Logged in using ChatGPT`.
  - Planner acceptance passed with `panelPlanCount: 4`, `fallbackCount: 0`, `scenarioCount: 4`.
  - Covered `timeline-layer-timing`, `text-shape-layout-animation`, `precomp-source-rename`, and `render-queue-setup` through panel-generated Agent plans.
  - Protected runs created checkpoint/edit-session protection under `backups\` and completed cleanup.
  - Cleanup removed generated project items per scenario (`3`, `1`, `4`, `1`), removed `1` generated render queue item in the render scenario, and final cleanup left `renderQueueTotal: 0`.
  - No JavaScript files were changed, so there were no touched JavaScript files for `node --check`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
- Milestone 60:
  - Подтвердил, что Milestone 59 уже закоммичен как `869365f Record approved OpenAI CLI agent smoke`.
  - Подтвердил clean working tree на предыдущей ветке перед стартом нового блока.
  - Создал ветку `codex/roadmap-1.3-planning` для следующего roadmap block.
  - Добавил Milestones 61-65 для Agent QA reporting, planner regression fixtures, cleanup auditing, provider readiness self-test UX и full 1.3 validation.
  - JavaScript-файлы не менялись, поэтому `node --check` не применяется.
  - Package manager check не настроен, потому что в репозитории нет `package.json`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
- Milestone 61:
  - Добавил `scripts\agent-scenario-report.js` со стабильной compact JSON-схемой `agent-run-report.v1`.
  - Подключил запись artifact к `agent-scenario-smoke` и `agent-scenario-openai-cli-smoke`; report включает planner config, plan source counts, acceptance counts, scenario outcomes, cleanup counts и final render queue status.
  - Добавил `logs\agent-run-reports\` в `.gitignore`, чтобы live report artifacts оставались локальными.
  - Добавил dependency-free `node scripts\agent-scenario-report-smoke.js`, который проверяет создание отчета и ключевые поля без live AE, OpenAI/Codex CLI или mutating smokes.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\agent-scenario-report.js`.
  - Passed `node --check scripts\agent-scenario-report-smoke.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node scripts\agent-scenario-report-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Live CEP Agent scenario smokes and external OpenAI CLI planner smokes were not run because Milestone 61 is local report-format coverage and those paths remain approval-gated.
- Milestone 62:
  - Вынес accepted Agent scenario fixture plans/prompts из `scripts\cep-panel-cdp-smoke.js` в общий dependency-free модуль `scripts\agent-scenario-fixtures.js`.
  - Live `agent-scenario-smoke` и `agent-scenario-openai-cli-smoke` теперь строят сценарии из того же fixture-модуля, что и offline regression corpus.
  - Добавил `scripts\agent-planner-corpus-smoke.js`, который поднимает локальный bridge daemon, проверяет fixture corpus shape, прогоняет каждый сценарий через `/agents/plan/validate`, затем через dry-run `/agents/plan/run`.
  - Corpus smoke подтвердил 4 сценария: `timeline-layer-timing`, `text-shape-layout-animation`, `precomp-source-rename`, `render-queue-setup`; все fixture dry-run steps получили `ready`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\agent-scenario-fixtures.js`.
  - Passed `node --check scripts\agent-planner-corpus-smoke.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node scripts\agent-planner-corpus-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Live CEP Agent scenario smokes and external OpenAI CLI planner smokes were not run because Milestone 62 is offline regression corpus coverage and those paths remain approval-gated.
- Milestone 63:
  - Добавил `scripts\agent-qa-audit.js` со стабильной compact JSON-схемой `agent-qa-audit.v1`.
  - Добавил read-only command `node scripts\cep-panel-cdp-smoke.js agent-scenario-audit`, который проверяет generated QA project item prefixes, render queue leftovers, checkpoint records и edit-session records.
  - Audit command не вызывает cleanup, не запускает planner и не мутирует AE project; render queue deletion остается только в существующем guarded cleanup helper, а project-item deletion только через `cleanup_test_items` с точным prefix.
  - Добавил dependency-free `node scripts\agent-qa-audit-smoke.js` для проверки prefix matching, render queue matching, checkpoint/edit-session matching и concise output limits без live AE.
  - Live read-only audit на bridge `127.0.0.1:3456` подтвердил: generated project item leftovers `0`, render queue leftovers `0`, active edit session `false`, checkpoint records `69`, edit-session records `99`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\agent-qa-audit.js`.
  - Passed `node --check scripts\agent-qa-audit-smoke.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node scripts\agent-qa-audit-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js agent-scenario-audit` with `CEP_PANEL_AUDIT_DETAIL_LIMIT=3`.
  - External OpenAI CLI planner smokes and live AE mutation smokes were not run because Milestone 63 is read-only audit coverage and those paths remain approval-gated.
- Milestone 64:
  - Добавил compact `Provider self-test` block в CEP provider section.
  - Self-test проверяет `openai-api`, `openai-cli`, `gemini-api`, `claude-api` и `ollama-local` через существующий `/agents/readiness` endpoint с `checkModels=1`.
  - UI показывает setup/missing auth, model unavailable, offline и ready states без отображения API key values; OpenAI CLI row включает безопасный summary `codexStatus` version/login checks.
  - Исправил startup race: обычный refresh списка агентов больше не стирает последние self-test rows, а новый запуск self-test очищает их явно.
  - Добавил `node scripts\cep-panel-cdp-smoke.js provider-self-test-smoke` с fake readiness responses для missing auth, unavailable model, Local/Ollama offline и CLI readiness details.
  - Синхронизировал установленную CEP-панель через `node scripts\cep-sync-health.js --sync --check`; copied `index.html`, `panel.js`, `style.css`, skipped unchanged manifest on first sync, then copied updated `panel.js` after race fix.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js provider-self-test-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js provider-setup-smoke`.
  - External OpenAI CLI planner smokes and live AE mutation smokes were not run because Milestone 64 is provider-readiness UI coverage and those paths remain approval-gated.
- Milestone 65:
  - Закрыл full 1.3 validation и подготовил следующий roadmap block `Agent reliability layer`.
  - Во время validation найден и исправлен CEP race в provider API-key save flow: background agent refresh мог очистить typed key или откатить `key saved` UI после успешного `/agents/key`.
  - Обновил `cep-panel\panel.js`: key input сохраняется при refresh того же агента, stale `loadAgents` responses игнорируются после bridge/key-state changes, `/agents/key` readiness применяется сразу к выбранному provider UI.
  - Синхронизировал установленную CEP-панель; final sync health подтвердил совпадение `index.html`, `panel.js`, `style.css` и `CSXS/manifest.xml`, version/title `AE Agent 1.0.0`.
  - Live bridge на `127.0.0.1:3456` перед финальным CEP кругом был offline; перезапустил bridge из текущего repo через `scripts\start-bridge-only.ps1`, после чего health стал `ok: true`, panel connected, pending `0`, inflight `0`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\agent-scenario-report.js`.
  - Passed `node --check scripts\agent-scenario-report-smoke.js`.
  - Passed `node --check scripts\agent-scenario-fixtures.js`.
  - Passed `node --check scripts\agent-planner-corpus-smoke.js`.
  - Passed `node --check scripts\agent-qa-audit.js`.
  - Passed `node --check scripts\agent-qa-audit-smoke.js`.
  - Passed `node scripts\agent-scenario-report-smoke.js`.
  - Passed `node scripts\agent-planner-corpus-smoke.js`.
  - Passed `node scripts\agent-qa-audit-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\provider-key-save-smoke.js`; Gemini and Claude key-save paths used an isolated temporary secrets file and did not touch user secrets.
  - Passed `node scripts\cep-sync-health.js --sync --check`.
  - Passed `node scripts\cep-sync-health.js --check`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js provider-self-test-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js provider-setup-smoke`.
  - Passed `node scripts\cep-panel-cdp-smoke.js agent-scenario-audit`; generated project item leftovers `0`, render queue leftovers `0`, active edit session `false`, checkpoint records `69`, edit-session records `99`.
  - Passed `node scripts\cep-panel-cdp-smoke.js inspect`; final panel state was `Connected` / `online`, selected `ollama-local`, `gemma4:latest`, 3 Local/Ollama models.
  - Did not run external OpenAI CLI planner smokes or live AE mutation smokes because they remain explicit-approval-gated.
- Milestone 66:
  - Зафиксировал planning-only pivot к `Safe Solution Library` перед продолжением reliability layer.
  - Разложил путь к безопасной базе решений на Milestones 67-71: registry/metadata, candidate quarantine, promotion validation, planner retrieval и library validation.
  - Перенес прежний Agent reliability layer после library block как Milestones 72-76.
  - JavaScript-файлы не менялись, поэтому `node --check` не применяется.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Initial `node scripts\prompt-optimization-smoke.js` attempt reported `Bridge did not become ready`; immediate rerun passed, consistent with a transient random-port bridge startup issue rather than a code regression.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Did not run live CEP or mutating AE smokes because this milestone changed only roadmap/handoff documentation.
- Milestone 67:
  - Added the tracked Safe Solution Library baseline: `registry/solutions.json`, `recipes/`, and `scripts/solutions/`.
  - Documented the `ae-solution.v1` contract and promotion safety rules in `docs/solution-library.md`, plus README/AGENTS verification references.
  - Added `node scripts\solution-registry-smoke.js` with fixture self-tests for a valid reviewed recipe, tracked `candidate` rejection, absolute path rejection, and raw script file gating.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings for new files.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Did not run live CEP smoke because no CEP files changed.
  - Did not run external OpenAI CLI planner smokes or live AE mutation smokes because Milestone 67 is local registry/docs/validator work and those remain explicit-approval-gated.
- Milestone 68:
  - Added ignored candidate quarantine path `logs\solution-candidates\`.
  - Added `scripts\solution-candidate-report.js` with schema `solution-candidate-report.v1`, manual capture template/input helper, compact Agent-run provenance, generated plan/script capture, affected target summary, run result, verification read-back, warnings, project assumptions and suggested promotion action.
  - Candidate reports are quarantine-only, not planner-visible and require explicit promotion; helper redacts known secret/path patterns and drops raw transcript/log tail/full project scan fields.
  - Documented candidate quarantine in `docs\solution-library.md` and added `node scripts\solution-candidate-report-smoke.js` to README/AGENTS verification flow.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\solution-candidate-report.js`.
  - Passed `node --check scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Did not run live CEP smoke because no CEP files changed.
  - Did not run external OpenAI CLI planner smokes or live AE mutation smokes because Milestone 68 is local quarantine/report-format work and those remain explicit-approval-gated.
- Milestone 69:
  - Added `scripts\solution-promotion-helper.js` with review schema `solution-promotion-review.v1`, preview-by-default CLI, explicit `--write`, candidate-to-registry entry construction, registry metadata filling and final registry validation.
  - Added `scripts\solution-promotion-smoke.js` covering reviewed typed promotion, explicit-review rejection, inline `run_extendscript` rejection, reviewed file-based raw JSX static checks and typed-tool-fit rejection for raw JSX.
  - Strengthened `scripts\solution-registry-smoke.js` for promoted raw JSX: small script size, file-based `run_extendscript_file`, no inline raw, undo groups, no `eval`, no direct project save, no broad project-item deletion loops, generated prefix/comment evidence and typed-tool comparison metadata.
  - Documented the promotion workflow in `docs\solution-library.md` and added `node scripts\solution-promotion-smoke.js` to README/AGENTS verification flow.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\solution-registry-smoke.js`.
  - Passed `node --check scripts\solution-promotion-helper.js`.
  - Passed `node --check scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-promotion-helper.js --print-review-template`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Did not run live CEP smoke because no CEP files changed.
  - Did not run external OpenAI CLI planner smokes or live AE mutation smokes because Milestone 69 is local promotion/validation pipeline work and those remain explicit-approval-gated.
- Milestone 70:
  - Added `mcp-server\solution-library.js` for read-only advisory retrieval from tracked `registry\solutions.json`.
  - Agent planning prompt now includes compact reviewed solution hints when relevant, while explicitly keeping recipes advisory and requiring normal MCP plan steps, validation, mutation gates and read-back verification.
  - Retrieval filters out candidates and stale entries, marks reviewed raw ExtendScript as risky, surfaces `typed-tool-candidate` as tool-implementation guidance, and treats `tool` entries as represented by the normal MCP tool catalog.
  - Added `scripts\solution-retrieval-smoke.js` covering relevant recipe surfaced, irrelevant/stale/candidate omitted, raw ExtendScript marked risky, typed-tool equivalent winning over raw JSX, and typed-tool-candidate guidance.
  - Updated `node scripts\prompt-optimization-smoke.js` to verify solution hints are injected into the planning prompt from a temporary registry fixture.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\solution-library.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\solution-retrieval-smoke.js`.
  - Passed `node --check scripts\prompt-optimization-smoke.js`.
  - Passed `node --check scripts\solution-registry-smoke.js`.
  - Passed `node --check scripts\solution-promotion-helper.js`.
  - Passed `node --check scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Did not run live CEP smoke because no CEP files changed.
  - Did not run external OpenAI CLI planner smokes or live AE mutation smokes because Milestone 70 is local planner-prompt retrieval work and those remain explicit-approval-gated.
- Hotfix: Agent `itemIndexes` runtime binding:
  - Root cause: the live planner produced an Agent step for selected source/precomp project-item renaming with `itemIndexes`, while the canonical `rename_project_items` schema expects `itemIndices`; runtime binding resolution also lacked plural project-item aliases, so the step blocked before mutation.
  - Added schema-aware arg alias normalization so `itemIndexes`, `itemIndex`, source/precomp item aliases and layer index aliases resolve to canonical fields only when the target tool schema supports them.
  - Added plural project-item binding extraction from selected source/precomp layer refs and project item search/match payloads, with deduping and singular-field coercion.
  - Updated planner prompt to prefer canonical `itemIndices` and `{{selectedPrecompItemIndices}}` for selected source/precomp rename workflows.
  - Extended `node scripts\smoke-test.js` to validate alias normalization and execute a dependent `{{itemIndexes}}` plan step.
  - Restarted live bridge daemon on `127.0.0.1:3456` from the current repo; health reported `ok: true`, panel connected, pending `0`, inflight `0`.
  - Current AE selection had no selected layers, so the exact selected-source rename case was not re-run live. Instead, a live read-only plan `find_project_items -> get_comp_details` verified `{{itemIndexes}}` resolves and executes without mutation against `Mother and child 2` (`itemIndex: 323`).
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\cep-panel-cdp-smoke.js smoke` against the installed CEP panel after the final live bridge restart.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Did not run external OpenAI CLI planner smokes or live AE mutation smokes because the hotfix was covered by local runtime binding smoke, live read-only binding smoke and live read-only CEP smoke; mutating/external paths remain explicit-approval-gated.
- Milestone 71:
  - Seeded `registry\solutions.json` with two reviewed typed-plan recipes: `active-comp-context-review` and `selected-layers-align-to-cti`.
  - Added dedicated recipe docs under `recipes\active-comp-context-review.md` and `recipes\selected-layers-align-to-cti.md`.
  - Added `scripts\solution-library-validation-smoke.js` to verify seeded fixture quality, compact prompt injection bounds, candidate invisibility, stale omission and typed-tool-equivalent suppression.
  - Documented the validation strategy in `docs\solution-library.md`, README and AGENTS verification.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`; it confirmed 2 seeded entries, prompt sections under 2200/2600 character bounds, 1 candidate omitted, 1 stale entry omitted and 1 raw JSX equivalent suppressed by a typed tool.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed read-only live CEP smoke `node scripts\cep-panel-cdp-smoke.js smoke` against the connected installed panel; the run stayed read-only and reported active comp `Mother and child 2`.
  - Did not run external OpenAI CLI planner smokes or live AE mutation smokes because Milestone 71 is local/read-only library validation and those paths remain explicit-approval-gated.
- Hotfix: OpenAI CLI detection and setup action:
  - Root cause: the live bridge process inherited a PATH where `codex` was not resolvable, while the user's current shell could run `codex --version` through the Codex Desktop local install. The panel then rendered a disabled `Install Codex CLI` button, so setup appeared to do nothing.
  - Added backend fallback detection for `%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe` when no explicit `CODEX_CLI_PATH` / `CODEX_PATH` is set.
  - Preserved explicit CLI path behavior for custom installs and provider contract tests.
  - Changed the CEP setup button for missing CLI from disabled `Install Codex CLI` to actionable `Retry CLI check`.
  - Updated CEP setup smoke expectations for the new button label.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\ai-agents.js`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed manual fallback simulation with empty `PATH`, confirming OpenAI CLI status resolves to `C:\Users\Ant\AppData\Local\OpenAI\Codex\bin\codex.exe` and reports `not_logged_in` instead of `missing`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\cep-sync-health.js --sync --check`; copied updated `panel.js` into the installed CEP extension.
  - Restarted the live bridge daemon on `127.0.0.1:3456` from the current repo.
  - Live `/agents` now reports OpenAI CLI `installed:true`, `loggedIn:true`, `status:"ready"`, `version:"codex-cli 0.130.0-alpha.5"` and `loginStatusCheck.output:"Logged in using ChatGPT"`.
  - Passed `node scripts\cep-panel-cdp-smoke.js reload`; the live panel now shows OpenAI CLI `Status: ready`, setup text `Codex CLI is signed in with ChatGPT...`, self-test row `Ready`, and enabled Send.
  - Passed `node scripts\cep-panel-cdp-smoke.js openai-cli-setup-smoke`.
  - Did not run external OpenAI CLI planner/chat smokes or live AE mutation smokes; the hotfix was validated through readiness/setup paths without sending a provider prompt or mutating the AE project.
- Milestone 72:
  - Inserted the new `Parallel AI Paths: ChatGPT Connector + OpenRouter API` roadmap block before the previous Project Intent Memory reliability-layer milestone.
  - Restored OpenRouter as a visible CEP provider tab while preserving backend id `openrouter`, env/key names `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`, `openrouter/free` and `:free` variants.
  - Added OpenRouter to provider self-test rows and CEP provider setup smoke coverage, including API-key setup copy, model list state and the free-model filter row.
  - Updated OpenRouter attribution headers to send `HTTP-Referer`, `X-OpenRouter-Title` and legacy fallback `X-Title`.
  - Extended provider contract/API smokes with OpenRouter metadata and a fake OpenRouter server that verifies attribution headers without a live OpenRouter call.
  - Synchronized changed `index.html`, `panel.js` and `style.css` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check mcp-server\ai-agents.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\provider-api-smoke.js`.
  - Passed `node --check scripts\provider-contract-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed targeted live CEP smoke `node scripts\cep-panel-cdp-smoke.js provider-setup-smoke` using fake provider data; it verified OpenRouter tab/setup without calling OpenRouter.
  - Passed targeted live CEP smoke `node scripts\cep-panel-cdp-smoke.js provider-self-test-smoke` using fake readiness data; it verified OpenRouter self-test row without calling OpenRouter.
  - Did not run generic live CEP `smoke` because normal panel reload can query live model lists for configured providers, including OpenRouter, and live OpenRouter calls remain explicit-approval-gated.
  - Did not run Cloudflare Tunnel, ChatGPT connector checks, external OpenAI CLI planner smokes or live AE mutation smokes because this milestone is OpenRouter UI/fake-provider coverage only and those paths remain explicit-approval-gated.
- Milestone 73:
  - Added isolated `chatgpt-connector/server.js` as a dependency-free MCP HTTP `/mcp` skeleton for ChatGPT custom connector development.
  - Kept the connector separate from normal API providers: it does not call OpenAI APIs, Codex CLI, OpenRouter, Gemini, Claude, or Ollama.
  - Exposed only a fixed read-only bridge proxy allowlist plus `get_connector_status`, with `readOnlyHint:true`, `destructiveHint:false`, and `openWorldHint:false` annotations.
  - Excluded write tools, raw `run_extendscript`, JSX execution, provider chat/planning, and plan execution from the connector surface.
  - Added `chatgpt-connector/README.md` and README/AGENTS verification references.
  - Added `node scripts\chatgpt-connector-smoke.js`, which starts the connector on a random local port and verifies initialize, tool listing, annotations, token rejection, local status, and offline bridge error shaping without ChatGPT, Cloudflare Tunnel, After Effects, live providers, or AE mutations.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check chatgpt-connector\server.js`.
  - Passed `node --check scripts\chatgpt-connector-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Live ChatGPT connector/Tunnel checks were not run because Milestone 73 is an offline skeleton and live connector setup remains explicit-approval-gated.
- Milestone 74:
  - Added `chatgpt-connector\jsx-lab.js` for local JSX Lab quarantine handling.
  - Added `propose_extendscript_candidate`, which saves redacted candidate metadata and raw JSX under ignored `logs\solution-candidates\jsx-lab\` without calling AE, bridge, or providers.
  - Added `check_extendscript_candidate`, which reads saved candidates and returns offline syntax, size, static risk, denylist, hash, and path-hygiene reports without executing JSX.
  - Kept direct raw `run_extendscript` / `run_extendscript_file`, provider chat/planning, plan execution and mutating bridge tools out of the ChatGPT connector surface.
  - Updated connector docs and README wording so the connector is described as read-only bridge inspection plus local JSX Lab quarantine, not a general write surface.
  - Extended `node scripts\chatgpt-connector-smoke.js` to cover candidate save, metadata redaction, raw JSX non-embedding, static acceptance, static rejection, absolute-path rejection and non-mutating check reports.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check chatgpt-connector\jsx-lab.js`.
  - Passed `node --check chatgpt-connector\server.js`.
  - Passed `node --check scripts\chatgpt-connector-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Live ChatGPT connector/Tunnel checks, live OpenRouter calls, live CEP smokes and live AE mutations were not run because Milestone 74 is offline connector/quarantine work and those paths remain explicit-approval-gated.
- Milestone 75:
  - Added `run_extendscript_candidate` as a gated JSX Lab wrapper for saved accepted candidates only.
  - The run gate requires explicit confirmation, mutation opt-in, auto edit-session protection, candidate hash confirmation, generated-prefix evidence and read-back tool calls for real runs.
  - Candidate execution routes through the existing bridge `/agents/plan/run` safety model with `run_extendscript_file`, `allowRawExtendscript:true`, checkpoint/edit-session protection and bridge mutation verification; direct raw `run_extendscript` / `run_extendscript_file` are still not exposed as ChatGPT connector tools.
  - Added `promote_solution_candidate`, which writes only ignored `solution-candidate-report.v1` promotion hooks and blocks direct `candidate -> tool` promotion.
  - Added connector runtime status, `/status`, emergency write-disable, local/tunnel status fields, exposed tool snapshot and last-tool-call tracking.
  - Added compact CEP ChatGPT Connector status UI with connected/offline state, local/tunnel state, exposed tools, last call, write state and emergency disable.
  - Synchronized updated `index.html`, `panel.js` and `style.css` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check chatgpt-connector\jsx-lab.js`.
  - Passed `node --check chatgpt-connector\server.js`.
  - Passed `node --check scripts\chatgpt-connector-smoke.js`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\chatgpt-connector-smoke.js`; fake bridge coverage verified gated run payloads, read-back allowlist preflight, disabled write-action behavior, emergency disable and promotion hooks without AE mutations.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed targeted live CEP smoke `node scripts\cep-panel-cdp-smoke.js connector-status-smoke` with fake connector data; it verified status rows and emergency disable UI without a live tunnel.
  - Passed live read-only CEP smoke `node scripts\cep-panel-cdp-smoke.js smoke` through Local/Ollama; it planned, dry-ran and ran a read-only bridge-status plan with 0 mutating steps.
  - Did not run live ChatGPT connector/Tunnel checks, live OpenRouter calls, external OpenAI CLI planner smokes or live AE mutation smokes because those remain explicit-approval-gated.
- Milestone 76:
  - Added tracked local `registry\project-intent-memory.json` with schema `ae-project-intent-memory.v1` and three reviewed baseline hints for generated prefixes, protected user assets and batch naming conventions.
  - Added `mcp-server\project-intent-memory.js` for validation, unsafe-content hygiene, bounded retrieval, prompt-section formatting and explicit read/update helpers.
  - Added MCP tools `get_project_intent_memory` and `update_project_intent_memory`; update requires `confirm:true`, supports `upsert`/`disable`, and rejects provider secrets, raw transcripts, public/tunnel URLs, broad project dumps and user absolute paths.
  - Kept memory update out of the Agent planning catalog; plan validation now rejects MCP tools that are not in `PLANNING_TOOL_NAMES` so local operator tools cannot become AE Agent plan steps.
  - Injected bounded `Project intent memory hints` into `plan_with_ai_agent` prompts beside Solution Library hints and Project Context Snapshot, and exposed retrieval metadata as `planProjectIntentMemory`.
  - Documented the contract in `docs\project-intent-memory.md` and added `node scripts\project-intent-memory-smoke.js` to README/AGENTS verification.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\project-intent-memory.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\project-intent-memory-smoke.js`.
  - Passed `node --check scripts\prompt-optimization-smoke.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`; it verified memory hints, solution hints and context snapshot injection.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`; it verified memory tools are listed and `update_project_intent_memory` is rejected inside AE Agent plans.
  - Passed read-only live CEP smoke `node scripts\cep-panel-cdp-smoke.js smoke` through Local/Ollama; it planned, dry-ran and ran a 0-mutating read-only bridge/project status plan.
  - Did not run live ChatGPT connector/Tunnel checks, live OpenRouter calls, external OpenAI CLI planner smokes or live AE mutation smokes because those remain explicit-approval-gated and Milestone 76 was covered by local/fake-provider/read-only validation.
- Milestone 77:
  - Added `mcp-server\plan-risk-classifier.js` with `ae-agent-plan-classification.v1` output for `safe typed-tool`, `needs clarification`, `risky` and `unsupported` plans.
  - Attached classification to `planValidation.classification`, top-level `planClassification` in planner results, `/agents/plan/validate` responses and `run.classification`.
  - Classification uses existing validation summary, mutation counts, affected targets, checkpoint expectations, raw ExtendScript steps, declared plan risk, Solution Library risk metadata and Project Intent Memory advisory matches.
  - CEP Plan Review now prints a `Confidence:` verdict and `Run guidance:` before dry-run/run; the plan-run status row shows safe/risky/blocked state and normal Run is disabled when `classification.blocksRun` is true.
  - Added `docs\plan-classification.md` and `node scripts\plan-classification-smoke.js` for offline safe/ambiguous/risky/unsupported coverage plus Solution Library and Project Intent Memory context-signal assertions.
  - Synchronized changed `panel.js` and `style.css` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\plan-risk-classifier.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\plan-classification-smoke.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\agent-planner-corpus-smoke.js`.
  - `node scripts\cep-panel-cdp-smoke.js plan-review-smoke` could not run because the live CEP CDP endpoint refused connection on `127.0.0.1:8870`; After Effects/panel CDP access is needed to rerun it.
  - Did not run live ChatGPT connector/Tunnel checks, live OpenRouter calls, external OpenAI CLI planner smokes or live AE mutation smokes because those remain explicit-approval-gated.
- Milestone 78:
  - Added `mcp-server\plan-repair.js` with `ae-agent-plan-repair.v1` metadata for bounded deterministic Agent plan repair.
  - Wired repair into planner results, `/agents/plan/validate`, `validate_ai_agent_plan`, and `/agents/plan/run`; repaired plans are revalidated/reclassified before dry-run or run.
  - Repair covers obvious typed-tool aliases, schema field aliases, binding alias normalization and runtime bindings for near-valid missing required fields.
  - Raw ExtendScript aliases, unsupported tools and ambiguous missing targets remain unsupported or needs-clarification instead of being repaired.
  - Added `node scripts\plan-repair-smoke.js` and documented it in README/AGENTS verification.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\plan-repair.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\plan-repair-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\agent-planner-corpus-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - `node scripts\cep-panel-cdp-smoke.js plan-review-smoke` could not run because the live CEP CDP endpoint refused connection on `127.0.0.1:8870`; After Effects/panel CDP access is needed to rerun it.
  - Did not run live ChatGPT connector/Tunnel checks, live OpenRouter calls, external OpenAI CLI planner smokes or live AE mutation smokes because those remain explicit-approval-gated.
- Milestone 79:
  - Added `mcp-server\semantic-verification.js` with schema `ae-agent-semantic-verification.v1` for deterministic post-run outcome checks.
  - Wired semantic verification into `/agents/plan/run` and `run_ai_agent_plan` results for non-dry-run mutating Agent plans.
  - Semantic verification compares typed-tool requested outcomes against tool result summaries and explicit read-back steps after the last mutation for timing, layout/animation, precomp/source/rename, and render queue setup fixture workflows.
  - CEP run transcript now shows concise `Outcome verification` and check/read-back counts for mutating runs.
  - Agent scenario report artifacts now include compact per-scenario semantic verification plus aggregate passed/needs-review counts.
  - Updated live Agent scenario smoke expectations so protected runs must surface passed outcome verification when live CDP/AE validation is available.
  - Added `node scripts\semantic-verification-smoke.js` and documented it in README/AGENTS verification.
  - Synchronized the updated `panel.js` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`; the first sandboxed attempt could not read the installed extension, the approved run copied `panel.js` and reported sync status `ok`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check mcp-server\semantic-verification.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\agent-scenario-report.js`.
  - Passed `node --check scripts\agent-scenario-report-smoke.js`.
  - Passed `node --check scripts\semantic-verification-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\semantic-verification-smoke.js`.
  - Passed `node scripts\agent-scenario-report-smoke.js`.
  - Passed `node scripts\agent-planner-corpus-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - `node scripts\cep-panel-cdp-smoke.js plan-review-smoke` could not run because the live CEP CDP endpoint refused connection on `127.0.0.1:8870`; After Effects/panel CDP access is needed to rerun it.
  - Did not run live ChatGPT connector/Tunnel checks, live OpenRouter calls, external OpenAI CLI planner smokes or live AE mutation smokes because those remain explicit-approval-gated.
- Milestone 80:
  - Added `scripts\reliability-validation-suite.js` with grouped validation scopes: `local`, `provider-readiness`, `read-only-live`, `external-provider`, `mutating-live`, `all`, and `list`.
  - Added `scripts\reliability-validation-suite-smoke.js` to cover catalog integrity, category coverage, readiness grouping, and approval-gate behavior.
  - The local suite groups offline corpus validation, provider fake/API smokes, Project Intent Memory, Solution Library, plan classification/repair, semantic verification, Agent report/audit schemas, and daemon/adapter smokes.
  - The live provider readiness matrix checks OpenAI API, OpenAI CLI, Gemini, Claude, OpenRouter and Local/Ollama through `/agents/readiness` with `checkModels=0`, avoiding external provider model-list calls.
  - The read-only live suite records CEP/CDP inspect, read-only smoke, Plan Review, generated QA audit, provider setup/self-test UI and connector status UI as non-mutating checks that still require AE/panel availability.
  - External-provider and mutating-live suites are present but blocked unless explicitly launched with `--allow-external-provider` and/or `--allow-mutating-live`.
  - Added ignored report output path `logs\reliability-validation\`.
  - Updated README, RELEASES and AGENTS verification notes for the reliability suite.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check scripts\reliability-validation-suite.js`.
  - Passed `node --check scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\reliability-validation-suite.js list`; catalog reported 31 checks across local, provider-readiness, read-only-live, external-provider and mutating-live groups.
  - Passed `node scripts\reliability-validation-suite.js local`; summary 19/19 passed, covering provider contract/API fakes, connector quarantine, prompt optimization, Project Intent Memory, plan classification/repair, semantic verification, Agent audit/report schemas, planner corpus, Solution Library, bridge-only and repo smoke.
  - Passed `node scripts\reliability-validation-suite.js provider-readiness`; live bridge `127.0.0.1:3456` returned structured readiness for 6/6 providers with `checkModels=0`, 3 configured/canChat providers and 3 setup-needed API-key providers.
  - `node scripts\reliability-validation-suite.js read-only-live --stop-on-fail` could not run live CEP checks because CDP `127.0.0.1:8870` refused connection; open After Effects/panel with CDP to rerun.
  - Passed `node scripts\reliability-validation-suite.js all --dry-run --allow-external-provider --allow-mutating-live`; all 31 checks were planned without execution.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Did not run external-provider checks, live ChatGPT connector/Tunnel checks, live OpenRouter calls or mutating live AE checks because those remain explicit-approval-gated.
- Milestone 81:
  - Added inline `Проверить` and `Выполнить план` controls to valid Agent plan chat messages.
  - The inline controls are enabled only for the latest current plan; replaced plans become disabled and cannot start stale execution.
  - Kept execution routed through the existing `/agents/plan/run` request with the same dry-run, `confirm:true`, mutation allowance, auto edit-session and classification blocking rules.
  - Renamed the persistent composer plan buttons to `Проверить` and `Выполнить план`.
  - Updated `node scripts\cep-panel-cdp-smoke.js smoke` to assert inline controls and click the inline `Выполнить план` button for read-only live execution.
  - Updated the live smoke to back up and restore chat history, provider selection and composer state after the run.
  - Synchronized updated `index.html`, `panel.js` and `style.css` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`.
  - No package manager check is configured because the repository has no `package.json`.
  - `node --check ...` through the PATH `node.exe` failed with Windows `Access is denied`; the same checks passed with the bundled Codex runtime Node executable.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\semantic-verification-smoke.js`.
  - Passed `node scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js inspect`; installed panel was online through CDP and bridge connected.
  - Passed live read-only `node scripts\cep-panel-cdp-smoke.js smoke`; the installed panel generated a valid Agent plan, showed inline `Проверить` / `Выполнить план`, clicked inline `Выполнить план`, and completed a read-only run.
  - Passed a follow-up live `node scripts\cep-panel-cdp-smoke.js inspect` confirming the user's prior chat history/provider state was restored after the smoke.
  - Did not run external-provider checks, OpenAI CLI planner scenario smokes, ChatGPT connector/Tunnel checks, live OpenRouter calls or mutating live AE checks because this milestone only changes panel Agent-run UX and those paths remain explicit-approval-gated.
- Milestone 82:
  - Added `Подхватить последний план из чата` to the composer plan controls.
  - Persisted structured Agent `planResult` metadata with transcript items so the latest valid plan can be restored after panel reload.
  - Added a safe fallback for old plan-like text: the panel asks `/agents/plan` to convert the chat text into a validated Agent plan instead of executing text directly.
  - Bumped CEP panel, manifest, bridge daemon, MCP adapter, install note and smoke expectations to `1.0.1`.
  - Updated `node scripts\cep-panel-cdp-smoke.js smoke` to verify reload recovery before dry-run/run.
  - Synchronized updated `index.html`, `panel.js`, `style.css` and `CSXS\manifest.xml` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`.
  - Restarted the live bridge daemon on `127.0.0.1:3456`; live `/health` reported `version:"1.0.1"` and the CEP panel connected.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check` for all touched JavaScript files using the bundled Codex runtime Node executable.
  - Passed XML parsing for `cep-panel\CSXS\manifest.xml`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\semantic-verification-smoke.js`.
  - Passed `node scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\agent-qa-audit-smoke.js`.
  - Passed `node scripts\agent-scenario-report-smoke.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js smoke`; it generated a valid read-only Agent plan, reloaded the panel, restored the plan through `Подхватить последний план из чата`, dry-ran it and ran it read-only.
  - Passed live `node scripts\cep-panel-cdp-smoke.js reload`; state title reported `AE Agent 1.0.1` and the restored user transcript showed the recovery button enabled for the existing text-only plan.
  - Passed live `node scripts\cep-panel-cdp-smoke.js branding-smoke`; page and document title both reported `AE Agent 1.0.1`.
  - Did not click the recovery button on the user's restored text-only plan because the selected provider was OpenAI CLI and that would send the plan text through an external/subscription-backed planner request.
  - Did not run external-provider checks, OpenAI CLI planner scenario smokes, ChatGPT connector/Tunnel checks, live OpenRouter calls or mutating live AE checks because this milestone only changes panel recovery UX and those paths remain explicit-approval-gated.
- Milestone 83:
  - Root cause for the milestone confusion: the active Codex workspace still opened `C:\Users\Ant\Documents\New project 2`, an old relocated copy whose plan stopped at Milestone 37.
  - Added stale-copy warnings to `C:\Users\Ant\Documents\New project 2\AGENTS.md` and `C:\Users\Ant\Documents\New project 2\plans\target-app-execplan.md`, pointing future work to `C:\Users\Ant\Documents\Codex\AE_agent`.
  - Renamed persistent and inline dry-run controls to `Dry run / Проверить`.
  - Added plan-run in-flight labels (`Dry run...`, `Dry run is running...`) and completion status (`result added below`).
  - Changed blocked risky plan status from the ambiguous `Risky plan; dry run first` to `Dry run available; Run blocked` when classification blocks normal Run.
  - Hardened transcript autoscroll after working indicators and appended run results.
  - Bumped CEP panel, manifest, bridge daemon, MCP adapter, install note and smoke expectations to `1.0.2`.
  - Synchronized updated `index.html`, `panel.js`, `style.css` and `CSXS\manifest.xml` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`; the first sandboxed attempt could not read/write the installed extension, the approved run copied 4 files and reported status `ok`.
  - Restarted the live bridge daemon on `127.0.0.1:3456` from the current repo; live `/health` reported `version:"1.0.2"` and the CEP panel connected.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check` for all touched JavaScript files using the bundled Codex runtime Node executable.
  - Passed XML parsing for `cep-panel\CSXS\manifest.xml`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\semantic-verification-smoke.js`.
  - Passed `node scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js smoke`; the installed panel showed `AE Agent 1.0.2`, generated a read-only plan, showed `Dry run / Проверить`, recovered the plan after reload, dry-ran it and ran it read-only.
  - Passed follow-up live `node scripts\cep-panel-cdp-smoke.js inspect`; user's prior chat/provider state was restored and the panel remained connected to bridge `1.0.2`.
  - Did not run external-provider checks, OpenAI CLI planner scenario smokes, ChatGPT connector/Tunnel checks, live OpenRouter calls or mutating live AE checks because this milestone only changes panel dry-run UX and stale workspace guidance.
- Milestone 84:
  - Added a hardcore dev escalation handoff path: AE chat remains focused on the user's AE task, while typed-tool/panel development moves into a compact local dev request bundle.
  - Added backend `/agents/dev-request` and `/dev/agents/dev-request` endpoints that create ignored `logs\dev-requests\<id>\` bundles with `request.md`, `ae-evidence.json`, `start-prompt.md`, and optional `candidate.jsx`.
  - The bundle redacts configured secrets/tokens and local user/project path prefixes, captures compact plan/run/semantic evidence, and includes a targeted Codex App prompt that forbids broad repo rereads unless targeted search cannot find the needed code.
  - Added CEP action `Prepare typed tool request`; it is visible only when the current Agent outcome shows a typed-tool gap: unsupported tools, raw ExtendScript, failed run, or semantic verification needing review.
  - The action posts the compact plan/run evidence to the backend and reports bundle paths plus Codex App launch status in chat; repo/git/commit work remains outside AE chat and starts only after explicit dev escalation.
  - Added `logs/dev-requests/` to ignored local artifacts and documented the workflow in README, release notes, target spec, and current baseline.
  - Bumped CEP panel, manifest, bridge daemon, MCP adapter, install note and smoke expectations to `1.0.3`.
  - Synchronized updated `index.html`, `panel.js`, `style.css` and `CSXS\manifest.xml` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`; the approved run copied 4 files and reported status `ok`.
  - Restarted the live bridge daemon on `127.0.0.1:3456` from the current repo; live `/health` reported `version:"1.0.3"` and `panelConnected:true`.
  - No package manager check is configured because the repository has no `package.json`.
  - The PATH `node.exe`/`codex.exe` WindowsApps shims returned access-denied/EPERM in this environment; validation used the bundled Codex runtime Node and the backend now treats EPERM/EACCES CLI probes as unusable so it can fall back to `%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe`.
  - Passed `node --check` for all touched JavaScript files using the bundled Codex runtime Node executable.
  - Passed XML parsing for `cep-panel\CSXS\manifest.xml`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\smoke-test.js`; it now verifies the dev request bundle files, secret redaction, local path redaction, candidate capture, and targeted `start-prompt.md` context.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\semantic-verification-smoke.js`.
  - Passed `node scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\agent-qa-audit-smoke.js`.
  - Passed `node scripts\agent-scenario-report-smoke.js`.
  - Passed `node scripts\reliability-validation-suite.js local`; summary 19/19 passed.
  - Passed live `node scripts\cep-panel-cdp-smoke.js inspect`; installed panel reported `AE Agent 1.0.3`, bridge connected, and `Prepare typed tool request` hidden in the normal no-gap state.
  - Passed live `node scripts\cep-panel-cdp-smoke.js branding-smoke`; page title reported `AE Agent 1.0.3`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js dev-request-button-smoke`; safe typed-tool recovered plan kept the dev request action hidden, and raw ExtendScript/tool-gap recovered plan showed it enabled with the raw-workaround promotion reason.
  - Passed live `node scripts\cep-panel-cdp-smoke.js connector-status-smoke`.
  - Passed `node scripts\provider-key-save-smoke.js`; it used the isolated temporary secrets wrapper.
  - Passed live `node scripts\cep-panel-cdp-smoke.js openai-cli-setup-smoke`; OpenAI CLI was detected through the local Codex Desktop install and signed-in ChatGPT state.
  - The first live `node scripts\cep-panel-cdp-smoke.js smoke` attempt used the default Local/Ollama configuration and failed because Ollama was offline; rerun with `CEP_PANEL_AGENT_ID=openai-cli` and `CEP_PANEL_MODEL=gpt-5.5` passed planning, reload recovery, dry-run, and read-only run.
  - Did not run live ChatGPT connector/Tunnel checks, live OpenRouter calls, external OpenAI CLI Agent scenario smokes, or mutating live AE smokes because they are outside this narrow dev-escalation handoff milestone and remain explicit-approval-gated.
- Milestone 85:
  - Added visible `Agent Hardcore` composer mode next to `Chat` and `Agent`.
  - Hardcore planning reuses `/agents/plan` with `hardcore:true`/`agentMode:"hardcore"` and stronger inspection, dry-run/read-back and verification guidance.
  - Fixed visible Cyrillic plan controls: `Подхватить последний план из чата`, `Dry run / Проверить`, and `Выполнить план`.
  - Bumped CEP panel, manifest, bridge daemon, MCP adapter, install note and smoke expectations to `1.0.4`.
  - Synchronized updated `index.html`, `panel.js`, `style.css` and `CSXS\manifest.xml` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`; the approved run copied 4 changed files and reported installed panel/manifest `1.0.4`.
  - Restarted the live bridge daemon on `127.0.0.1:3456` from the current repo; live `/health` reported `version:"1.0.4"` and `panelConnected:true`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check` for all touched JavaScript files using the bundled Codex runtime Node executable.
  - Passed XML parsing for `cep-panel\CSXS\manifest.xml`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `rg` source check for mojibake markers in active UI/backend files; no current `Рџ...`/`????` artifacts were found in the active panel sources.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\semantic-verification-smoke.js`.
  - Passed `node scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Passed `node scripts\agent-qa-audit-smoke.js`.
  - Passed `node scripts\agent-scenario-report-smoke.js`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js reload`; document state reported `AE Agent 1.0.4`, the panel stayed connected, and the bottom controls showed readable Cyrillic labels.
  - Passed live `node scripts\cep-panel-cdp-smoke.js branding-smoke`; page and document title reported `AE Agent 1.0.4`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js mode-toggle-smoke`; the panel exposed `Chat`, `Agent`, and `Agent Hardcore`, and selecting Hardcore set mode `hardcore`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js dev-request-button-smoke`; safe plans kept dev escalation hidden and tool-gap plans showed it enabled.
  - Did not run live ChatGPT connector/Tunnel checks, live OpenRouter calls, external OpenAI CLI Agent scenario smokes, or mutating live AE smokes because this milestone only changes visible mode selection, planner guidance and label rendering.
- Milestone 86:
  - Activated persistent and inline `Выполнить план` for raw ExtendScript plans only after a successful dry run of the same current plan/request.
  - Preserved the backend classification block by requiring `allowRawExtendscript:true` plus the matching `rawExtendscriptDryRunId`; wrong or missing ids return `blocked_raw_extendscript_gate`.
  - Updated ChatGPT JSX Lab real candidate execution to dry-run the exact bridge plan before the real raw file run, then pass the matching dry-run id.
  - Added `scripts\cep-panel-cdp-smoke.js raw-run-gate-smoke` for the UI unlock/payload path; it uses a fake `/agents/plan/run` XHR and does not mutate AE.
  - Synchronized the updated installed CEP panel with `node scripts\cep-sync-health.js --sync --check`; the sandboxed attempt could not access the installed extension, the approved run copied `panel.js` and reported status `ok`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check chatgpt-connector\server.js`.
  - Passed `node --check chatgpt-connector\jsx-lab.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\chatgpt-connector-smoke.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\semantic-verification-smoke.js`.
  - Passed `node scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`.
  - Could not run live `node scripts\cep-panel-cdp-smoke.js raw-run-gate-smoke` or `inspect` because the CEP CDP endpoint refused connection on `127.0.0.1:8870`; open/reload After Effects with CEP remote debugging to rerun the prepared UI smoke.
- Milestone 87:
  - Changed `Prepare typed tool request` so the CEP panel posts `openCodexApp:false`; clicking it no longer launches a transient command window and no longer implies a Codex App chat was created.
  - Updated the panel transcript copy to say: `Codex App: no new chat was created automatically.` and to direct the user to start a Codex App dev chat from `start-prompt.md`.
  - Kept backend explicit `codex app <repo>` fallback hidden-window only and marked its response with `autoChatCreated:false`.
  - Bumped CEP panel, manifest, bridge daemon, MCP adapter, install note and smoke expectations to `1.0.5`.
  - Synchronized updated `index.html`, `panel.js` and `CSXS\manifest.xml` into the installed CEP extension with `node scripts\cep-sync-health.js --sync --check`; the approved run reported installed panel/manifest `1.0.5`.
  - Restarted the live bridge daemon on `127.0.0.1:3456` from the current repo; live `/health` reported `version:"1.0.5"` and `panelConnected:true`.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check mcp-server\mcp-adapter.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed XML parsing for `cep-panel\CSXS\manifest.xml`.
  - Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings.
  - Passed `node scripts\provider-contract-smoke.js`.
  - Passed `node scripts\solution-registry-smoke.js`.
  - Passed `node scripts\solution-candidate-report-smoke.js`.
  - Passed `node scripts\solution-promotion-smoke.js`.
  - Passed `node scripts\solution-retrieval-smoke.js`.
  - Passed `node scripts\solution-library-validation-smoke.js`.
  - Passed `node scripts\project-intent-memory-smoke.js`.
  - Passed `node scripts\plan-classification-smoke.js`.
  - Passed `node scripts\plan-repair-smoke.js`.
  - Passed `node scripts\semantic-verification-smoke.js`.
  - Passed `node scripts\reliability-validation-suite-smoke.js`.
  - Passed `node scripts\chatgpt-connector-smoke.js`.
  - Passed `node scripts\provider-api-smoke.js`.
  - Passed `node scripts\prompt-optimization-smoke.js`.
  - Passed `node scripts\bridge-only-smoke-test.js`.
  - Passed `node scripts\smoke-test.js`; it now asserts that `openCodexApp:false` skips Codex App launch.
  - Passed `node scripts\agent-qa-audit-smoke.js`.
  - Passed `node scripts\agent-scenario-report-smoke.js`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js reload`; document state reported `AE Agent 1.0.5`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js branding-smoke`; page and document title reported `AE Agent 1.0.5`.
  - Passed live `node scripts\cep-panel-cdp-smoke.js dev-request-button-smoke`; the tool-gap path clicked `Prepare typed tool request` and the transcript reported that no new chat was created automatically.
  - Passed live `node scripts\cep-panel-cdp-smoke.js mode-toggle-smoke`.
  - Did not run live ChatGPT connector/Tunnel checks, live OpenRouter calls, external OpenAI CLI Agent scenario smokes, or mutating live AE smokes because this milestone only changes dev-request handoff UX and launch behavior.
