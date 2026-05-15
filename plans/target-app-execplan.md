# Target App Execution Plan

## Progress

- [x] Stable baseline: AE Agent 1.0.0 CEP panel, provider setup, Agent planning, plan validation, protected execution, local history, diagnostics, and installed-panel smoke coverage.
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
- [ ] Milestone 71: Solution library validation.
- [ ] Milestone 72: Project Intent Memory.
- [ ] Milestone 73: Plan confidence and risk classification.
- [ ] Milestone 74: Plan repair loop.
- [ ] Milestone 75: Semantic verification.
- [ ] Milestone 76: Reliability validation.

## Current Stable Baseline

- The active repository is `C:\Users\Ant\Documents\Codex\AE_agent`.
- The native CEP title/menu format is `AE Agent 1.0.0`.
- The panel is a compact dark CEP client for the local bridge daemon.
- Provider paths are separate: OpenAI API, OpenAI CLI, Gemini, Claude, and Local/Ollama.
- Agent mode drafts structured MCP plans, validates tool names and required fields, dry-runs plans, and executes only through explicit mutation gates.
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

### Milestone 72: Project Intent Memory

- Спроектировать lightweight per-project memory для Agent planning: главные comps, защищенные folders/assets, naming conventions, generated prefixes и user/project hints.
- Хранить память локально, без отправки секретов и без широкого project scan по умолчанию.
- Добавить явные read/update paths и compact summary для planning prompt.
- Покрыть offline smoke fixtures и read-only live inspection, не мутируя AE project.

### Milestone 73: Plan confidence and risk classification

- Добавить предварительную классификацию Agent plans: safe typed-tool, needs clarification, risky, unsupported.
- Связать classification с existing validation summary, mutation counts, affected targets, checkpoint expectation, raw ExtendScript risk и solution-library recipe risk.
- В CEP Plan Review показать короткий confidence/risk verdict до dry-run/run.
- Покрыть corpus cases для safe, ambiguous, risky и unsupported plans.

### Milestone 74: Plan repair loop

- Добавить bounded repair path для near-valid plans: missing required fields, common binding aliases, wrong tool names with obvious typed-tool equivalent.
- Не превращать repair в raw ExtendScript fallback и не исполнять repaired plan без повторной validation.
- Покрыть repair corpus и убедиться, что unsafe/ambiguous plans остаются blocked or clarification-needed.

### Milestone 75: Semantic verification

- Усилить post-run verification так, чтобы Agent сравнивал requested outcome с read-back summaries, а не только `tool completed`.
- Начать с typed-tool workflows из existing Agent scenario fixtures: timing, layout/animation, precomp/source/rename, render queue setup.
- Показывать concise verification result в run transcript и Agent run report artifact.
- Не добавлять внешние provider calls в verification без отдельного решения.

### Milestone 76: Reliability validation

- Собрать reliability validation suite: offline corpus, read-only live audit, provider readiness, and approved protected mutation checks.
- Разделить cheap local checks, read-only live checks, external-provider checks и mutating live AE checks.
- Сформировать handoff/release notes с доказательствами reliability layer перед добавлением новых AE mutation tools.

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
