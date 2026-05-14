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
