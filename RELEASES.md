# AE MCP Bridge Releases

## v0.26.0-agent-ux-polish - 2026-05-13

Agent selector polish for the CEP panel.

Added:

- AE GPT-style provider UI with `Gemini`, `OpenAI`, `Claude`, and `Local` tabs.
- Separate OpenAI `API` and `CLI` modes. API mode uses `OPENAI_API_KEY`; CLI mode uses `codex login` and `codex exec` for ChatGPT/Codex subscription-backed calls.
- OpenAI CLI model list for `GPT-5.5`, `GPT-5.4`, `GPT-5.4-Mini`, `GPT-5.3-Codex`, `GPT-5.3-Codex-Spark`, and `GPT-5.2`.
- Prompt Optimization toggle passed through chat and Agent requests.
- Agent plan text rendering as compact step cards in the CEP transcript.
- Agent details card with provider, endpoint, selected model, model count/source, readiness, setup state, notes, and last error.
- `Free models only` toggle for OpenRouter model refreshes.
- `Check model` action that re-runs readiness/model preflight for the selected provider and model.
- Local visible chat transcript persistence, cleared by the panel's `Clear` button.
- Local multi-chat history with `New Chat`, history switching, and per-chat clearing.
- CEP history smoke command: `node scripts\cep-panel-cdp-smoke.js history-smoke`.

Changed:

- `list_ai_agents` now returns richer public provider metadata: `providerGroup`, `authMode`, `transport`, `uiModes`, `canSaveKey`, and `setupAction`.
- OpenAI API keys can be saved through the same local bridge secret store as OpenRouter and Ollama Cloud keys.
- The CEP panel sends `includeModels=1` and OpenRouter free-model filter state when refreshing agents.
- Failed or partial AE Plan runs now render as a readable `Run: needs review` report when the backend returns run details.
- The plan runner accepts common model shorthand such as `step-2-result` for runtime references and resolves it to useful target fields during real runs; dry-runs report those dependent steps as ready.
- The live CEP smoke now verifies the new agent details and check-model flow.
- The reference `Trial Version` / `License...` strip is intentionally omitted from the CEP UI; this project has no app license gate.
- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.26.0`.

## v0.25.0-safe-run - 2026-05-12

Safe execution path for AI-generated mutating AE plans.

Added:

- `autoEditSession` support on `run_ai_agent_plan` and `POST /agents/plan/run`.
- Automatic protected edit-session startup before the first mutating step when the caller opts in with `autoEditSession:true`.
- Run result safety details for edit session, checkpoint, verification, warnings, and restore hints.
- Live CEP mutating smoke command: `node scripts\cep-panel-cdp-smoke.js mutating-smoke`.

Safety:

- Real mutating runs still require `allowMutations:true`.
- A mutating run without an existing edit session or planned checkpoint/edit-session step is blocked unless `autoEditSession:true` is provided.
- If the project is unsaved and a checkpoint cannot be created, the run is blocked before any mutation with a save-project-first message.
- Mutating steps are blocked until checkpoint/edit-session protection is established, so a later checkpoint step cannot protect an earlier mutation.
- Auto-started edit sessions are finished after run success or failure.

Changed:

- The CEP panel sends `autoEditSession:true` for confirmed mutating AE Plan runs and its confirmation text explicitly mentions checkpoint/edit-session protection.
- AE Plan prompting now asks models to plan project-changing work as inspection, narrow mutation, then verification/readback.
- Local smoke tests cover mutating dry-run readiness and blocking of unsafe mutating execution.
- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.25.0`.

## v0.24.0-plan-runner - 2026-05-12

Review-and-run scaffolding for validated AE plans.

Added:

- `run_ai_agent_plan` MCP tool.
- `POST /agents/plan/run` HTTP endpoint.
- Dry-run and run buttons in the CEP panel for the last generated AE Plan.
- Runtime binding support when a later step needs a value from an earlier tool result.
- A compact planning catalog of real MCP tool names and required fields, so local models choose executable steps more reliably.
- CEP `.debug` descriptor for the bridge panel on AEFT port `8870`, enabling direct panel UI inspection after After Effects restarts.
- `scripts/cep-panel-cdp-smoke.js` for live UI smoke testing through the CEP DevTools target.

Safety:

- Real execution requires `confirm:true`.
- Mutating execution also requires `allowMutations:true`.
- Multi-mutation plans require a checkpoint step unless explicitly overridden.
- Raw ExtendScript steps are blocked unless `allowRawExtendscript:true`.

Changed:

- AE Plan prompts explicitly treat Russian/Cyrillic user requests as valid input, not as malformed text.
- The CEP panel clears stale plans when a new AE Plan request starts, grants mutation permission only for actually mutating runs, and shows per-step verification details after execution.
- Smoke tests now exercise `/agents/plan/run` in dry-run mode.
- Live CEP UI smoke passed with Ollama `gemma4:latest`: Russian AE Plan, dry-run, and confirmed read-only run all completed through the panel.
- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.24.0`.

## v0.23.0-plan-repair - 2026-05-12

Repair pass for malformed JSON plans.

Added:

- Automatic repair retry when `plan_with_ai_agent` receives malformed JSON.
- `repairPlan` option to disable the repair pass.
- Runtime binding validation for steps that depend on earlier tool results.
- CEP plan output notes when JSON repair was applied.

Changed:

- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.23.0`.

## v0.22.0-plan-validation - 2026-05-12

Validation rails for AI-generated AE plans.

Added:

- `validate_ai_agent_plan` MCP tool.
- `POST /agents/plan/validate` HTTP endpoint.
- Automatic plan validation attached to `plan_with_ai_agent` results.
- Safe argument preparation for mutating plan steps with `verifyAfter`, `idempotencyKey`, and `idempotencyScope`.

Changed:

- `AE Plan` output in the CEP panel now shows validation status, mutating step counts, and warnings.
- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.22.0`.

## v0.21.0-ae-plan-mode - 2026-05-12

Safe planning mode for model-driven AE commands.

Added:

- `plan_with_ai_agent` MCP tool.
- `POST /agents/plan` HTTP endpoint.
- `AE Plan` mode in the CEP chat panel.
- JSON plan parsing with request ids, log entries, risk, checkpoint flag, and step list.

Changed:

- Panel agent requests now allow longer chat/plan timeouts for local models.
- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.21.0`.

## v0.20.0-api-key-ui - 2026-05-12

Local API key setup from the After Effects panel.

Added:

- API key password field and `Save key` button for providers that need keys.
- `POST /agents/key` to save supported provider keys locally.
- Local secret loading from `.codex\agent-secrets.json`, which is ignored by git.

Changed:

- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.20.0`.
- OpenRouter can now be configured directly from the panel instead of only through `OPENROUTER_API_KEY`.

## v0.19.0-agent-rails - 2026-05-12

Reliability rails for non-Codex agents and their AE automation loops.

Added:

- `check_ai_agent_readiness` plus `GET /agents/readiness` for provider/model preflight.
- `get_ai_agent_log` plus `GET /agents/log` for JSONL chat attempt history in `logs\ai-agent-chats.jsonl`.
- `idempotencyKey` and `idempotencyScope` on mutating tools to prevent duplicate AE mutations during retries.
- `verifyAfter` on mutating tools, defaulting to true, to read back project/comp/layer state after changes.
- Duplicate layer-name warnings in mutation verification snapshots.

Changed:

- `chat_with_ai_agent` and the CEP chat run readiness checks before sending provider requests.
- The CEP panel disables chat send when the selected agent is not configured, offline, or missing the selected model.
- OpenRouter defaults to `nvidia/nemotron-3-super-120b-a12b:free`, with `openrouter/free`, `openai/gpt-oss-120b:free`, and `google/gemma-4-31b-it:free` as built-in suggestions unless `OPENROUTER_MODEL` / `OPENROUTER_MODELS` overrides them.
- Local Ollama defaults to `gemma4:latest` unless `OLLAMA_MODEL` overrides it.
- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.19.0`.

## v0.18.0-agent-chat - 2026-05-12

Selectable non-Codex chat agents for the bridge and CEP panel.

Added:

- `mcp-server/ai-agents.js` provider layer for OpenRouter, local Ollama, optional Ollama Cloud, and custom OpenAI-compatible providers.
- `list_ai_agents`
- `chat_with_ai_agent`
- `GET /agents` and `POST /agents/chat` for the CEP panel.
- Agent selector, model input, and chat transcript in the After Effects panel.

Changed:

- Daemon, adapter, CEP panel, manifest, install note, and smoke tests report version `0.18.0`.
- `get_bridge_status` now includes a compact `aiAgents` summary.

Notes:

- OpenRouter uses `OPENROUTER_API_KEY`.
- Local Ollama defaults to `http://127.0.0.1:11434` and uses installed models from `/api/tags`.
- The panel chat only returns text. Project-changing After Effects work still goes through Codex/MCP tools, edit sessions, checkpoints, and undo groups.

## v0.17.0-safe-edit-sessions - 2026-05-12

Safe edit sessions for grouping project-changing operations.

Added:

- `start_edit_session`
- `get_edit_session_status`
- `finish_edit_session`
- `list_edit_sessions`
- One active edit session at a time, with an automatic checkpoint before the session starts.
- Active session persistence in `logs\edit-session-active.json`.
- Session lifecycle and operation events in `logs\edit-sessions.jsonl`.
- Automatic recording of successful and failed project-changing tool calls while a session is active.
- `activeEditSession` summary in `get_bridge_status`.

Changed:

- Daemon and adapter report version `0.17.0`.
- Smoke tests expect daemon `0.17.0` and verify the edit session tools are listed.

Notes:

- Edit sessions do not restore or delete checkpoints.
- Read-only tools are not recorded as session operations.

## v0.16.0-scope-cleanup-handoff - 2026-05-11

Documentation cleanup for the handoff into the next project.

Changed:

- Removed remaining obsolete scope references from release notes and research notes.
- Daemon and adapter report version `0.16.0`.
- Smoke tests expect daemon `0.16.0`.

Verified:

- Local syntax checks for daemon, adapter, and smoke scripts.
- Repository text search confirms the obsolete scope terms no longer appear in README, release notes, docs, MCP server code, or scripts.

## v0.15.0-mutation-summaries - 2026-05-05

Consistent mutation summaries for project-changing tools.

Added:

- Successful mutating tool responses now include a `mutation` object with `tool`, `changed`, `target`, optional `checkpoint`, and `undoHint`.
- Checkpoint metadata and mutation summaries are composed together when `autoCheckpoint` or `checkpointLabel` is used.

Changed:

- Daemon and adapter report version `0.15.0`.
- Smoke tests expect daemon `0.15.0`.

Notes:

- This is a response-shaping layer. It does not change the underlying After Effects commands.

Verified:

- Local syntax checks for daemon, adapter, and smoke scripts.
- Daemon-only and adapter smoke tests pass against `0.15.0`.
- Live bridge validation created a temporary comp, returned mutation metadata, and cleaned up the temporary comp.
## v0.14.0-checkpoint-management - 2026-05-05

Checkpoint inspection and cleanup.

Added:

- `get_project_checkpoint_details`
- `delete_project_checkpoint`

Changed:

- Daemon and adapter report version `0.14.0`.
- Smoke tests expect daemon `0.14.0` and verify the checkpoint management tools are listed.

Notes:

- `delete_project_checkpoint` requires `confirm=true`, only accepts `.aep` files inside `backups/`, and only deletes files with checkpoint naming created by bridge checkpoint tools.

Verified:

- Local syntax checks for daemon, adapter, and smoke scripts.
- Daemon-only and adapter smoke tests pass against `0.14.0` and list 40 tools.
- Live bridge validation created a temporary checkpoint, read its details, and deleted only that checkpoint file.

## v0.13.0-auto-checkpoints - 2026-05-05

Opt-in project checkpoints for mutating tools.

Added:

- `autoCheckpoint` and `checkpointLabel` schema fields on mutating tools.
- Preflight checkpoint creation before mutating tool handlers when either field is provided.
- Mutation results include the checkpoint metadata when a preflight checkpoint is created.

Changed:

- Daemon and adapter report version `0.13.0`.
- Smoke tests expect daemon `0.13.0` and verify checkpoint schema fields on a mutating tool.

Notes:

- Preflight checkpoints are opt-in only. Read-only tools ignore checkpoint fields, and routine mutating calls do not create extra `.aep` files unless requested.

Verified:

- Local syntax checks for daemon, adapter, and smoke scripts.
- Daemon-only and adapter smoke tests pass against `0.13.0`.
- Live bridge validation created a checkpointed temporary comp, returned checkpoint metadata in the mutation result, and cleaned up the temporary comp.

## v0.12.0-checkpoints - 2026-05-05

Project safety checkpoints before broader automation.

Added:

- `checkpoint_project`
- `list_project_checkpoints`
- `restore_project_checkpoint`

Changed:

- Daemon and adapter report version `0.12.0`.
- Smoke tests expect daemon `0.12.0` and verify the checkpoint tools are listed.

Notes:

- `restore_project_checkpoint` is intentionally non-destructive in this version. It requires `confirm=true`, validates that the checkpoint is inside `backups/`, and returns manual After Effects restore instructions instead of overwriting the open project.

Verified:

- Local syntax checks for daemon, adapter, and smoke scripts.
- Daemon-only and adapter smoke tests pass against `0.12.0` and list 38 tools.
- Live bridge validation created a checkpoint for the saved `Intro_.aep`, listed it, and prepared non-destructive restore instructions.

## v0.11.0-effect-presets - 2026-05-05

Curated effect matchName presets and automation hints.

Added:

- `list_effect_presets`

Changed:

- Daemon and adapter report version `0.11.0`.
- Smoke tests expect daemon `0.11.0`.

Verified:

- Local syntax checks for daemon and adapter.
- Daemon-only and adapter smoke tests pass against `0.11.0` and list 35 tools.
- Live bridge validation returned the `Fill` preset, used its `ADBE Fill` matchName with `add_effect`, read 8 effect properties with `get_effect_details`, and cleaned up temporary project items.

## v0.10.0-effect-inspection - 2026-05-05

Read-only effect inspection tools for safer effect automation.

Added:

- `list_effects`
- `get_effect_details`

Changed:

- Daemon and adapter report version `0.10.0`.
- Smoke tests expect daemon `0.10.0`.

Verified:

- Local syntax checks for daemon and adapter.
- Daemon-only and adapter smoke tests pass against `0.10.0` and list 34 tools.
- Live AE validation listed an added `ADBE Fill` effect, read its detail/property tree, and cleaned up temporary project items.

## v0.9.0-effect-tools - 2026-05-05

Effect-level tools for adding effects and setting effect properties.

Added:

- `add_effect`
- `set_effect_property`

Changed:

- Daemon and adapter report version `0.9.0`.
- Smoke tests expect daemon `0.9.0`.

Verified:

- Local syntax checks for daemon and adapter.
- Daemon-only and adapter smoke tests pass against `0.9.0` and list 32 tools.
- Live AE validation added an `ADBE Fill` effect, set its Color property, inspected it, and cleaned up temporary project items.

## v0.8.0-property-values - 2026-05-05

Property-level write tool for targeted AE automation.

Added:

- `set_property_value`

Changed:

- Daemon and adapter report version `0.8.0`.
- Smoke tests expect daemon `0.8.0`.

Verified:

- Local syntax checks for daemon and adapter.
- Daemon-only and adapter smoke tests pass against `0.8.0` and list 30 tools.
- Live AE validation set Position, Opacity, and TextDocument fields by property path, then cleaned up temporary project items.

## v0.7.0-practical-layers - 2026-05-05

Practical typed operations on top of the v0.6 inspection layer.

Added:

- `import_footage`
- `create_solid_layer`
- `create_null_layer`
- `create_adjustment_layer`
- `add_project_item_to_comp`
- `duplicate_comp`
- `find_project_items`

Changed:

- Practical comp tools can target `compName` when `compItemIndex` is not stable.
- Existing comp-targeted layer tools also accept `compName`.
- `add_project_item_to_comp` can target `itemName` plus optional `itemType`.
- Daemon and adapter report version `0.7.0`.

Verified:

- Local syntax checks for daemon and adapter.
- Daemon-only and adapter smoke tests pass against `0.7.0` and list 29 tools.
- Live AE validation created temporary comps/layers, used `compName` and `itemName`, duplicated a comp, and cleaned up temporary project items.

## v0.6.0-dev-inspection - 2026-05-05

Read-only development inspection tools for iterative JSX/ScriptUI work.

Added:

- `get_project_snapshot`
- `get_comp_details`
- `get_layer_details`

Changed:

- `get_layer_details` defaults to a compact response; set `includeProperties: true` for a property tree.
- `get_selected_properties` now includes property paths and can include value/expression previews.
- `run_extendscript_file` returns structured failure diagnostics with file path, duration, reported line, and nearby line context when available.
- Daemon and adapter report version `0.6.0`.

Verified:

- `bridge-daemon.js` and `mcp-adapter.js` pass syntax checks.
- `bridge-only-smoke-test.js` passes against daemon `0.6.0`.
- `smoke-test.js` passes and lists all 22 tools.

## v0.5.4-panel-autoconnect - 2026-05-05

Cold boot connection reliability fix.

Observed:

- After a full Windows reboot, the panel could remain offline until Codex and After Effects were restarted.
- Restarting only the programs worked, which pointed to panel polling state after cold boot rather than daemon startup alone.

Changed:

- The CEP panel remembers that the user clicked Connect and auto-connects on the next panel load when a token is saved.
- Panel HTTP requests now have a timeout, so a dead request after reboot cannot block retries forever.
- The default lifecycle remains Codex-triggered daemon startup. No Windows logon startup task is used.

## v0.5.3-codex-lifecycle-default - 2026-05-05

Lifecycle default correction.

Decision:

- Do not use Windows logon startup as the normal bridge lifecycle.
- Keep the daemon triggered by Codex through `mcp-adapter.js`.
- The CEP panel remains a client and can wait offline until Codex starts the daemon.

Changed:

- Removed startup-task setup from the main README flow.
- Documented `uninstall-daemon-startup-task.ps1` only as cleanup for machines that tried `v0.5.2`.
- Confirmed the installed task `Codex AE MCP Bridge Daemon` was removed from the test machine.

## v0.5.2-startup-task - 2026-05-05

Startup reliability improvement.

Observed:

- After reboot, CEP could remain offline for about 80 seconds because daemon startup still depended on Codex/MCP lifecycle timing.
- Logs showed daemon events around `09:38:04` and the first successful CEP poll around `09:40:10`.

Added:

- `scripts\install-daemon-startup-task.ps1`
- `scripts\get-daemon-startup-task.ps1`
- `scripts\uninstall-daemon-startup-task.ps1`

Verified:

- Installed Windows Scheduled Task `Codex AE MCP Bridge Daemon`.
- Starting the task manually brings `/health` online on `127.0.0.1:3456`.
- CEP returns to `panelConnected: true` within a few seconds after the daemon task starts.

Later decision:

- This is not the default lifecycle because it starts at Windows logon and can show a PowerShell window.
- Prefer `v0.5.3-codex-lifecycle-default`.

## v0.5.1-auto-daemon - 2026-05-04

Out-of-box connection hotfix.

Changed:

- `mcp-adapter.js` now checks daemon health on startup.
- If `127.0.0.1:3456` is empty, the adapter auto-starts `bridge-daemon.js` as a detached background process.
- Set `AE_DAEMON_AUTO_START=0` to disable auto-start.

Why:

- After the daemon split, enabling the MCP server in Codex started only the stdio adapter. The CEP panel stayed offline unless the daemon was started manually.

## v0.5.0-dev-workflow - 2026-05-04

Developer workflow tools for iterative AE script and panel development.

Verified:

- `bridge-daemon.js` and `mcp-adapter.js` report version `0.5.0`.
- `bridge-only-smoke-test.js` starts a temporary daemon.
- `smoke-test.js` starts a temporary daemon plus adapter and lists all 19 tools.
- Live CEP validation on `127.0.0.1:3456` reports panel online against daemon `0.5.0`.
- `mcp-call-tool.js` works for `run_extendscript_file`, `create_test_comp`, `create_text_layer`, `get_selected_layers`, `get_selected_properties`, and `cleanup_test_items`.

Added:

- `run_extendscript_file`
- `get_selected_layers`
- `get_selected_properties`
- `create_test_comp`
- `cleanup_test_items`
- `scripts\ae-file-smoke.jsx` as a tiny file-run smoke fixture

Notes:

- `run_extendscript_file` is project-scoped by default. Set `AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT=1` to run files outside the bridge project.
- `cleanup_test_items` requires `confirm: true` and only removes items matching a name prefix.

## v0.4.0-daemon-split - 2026-05-04

Persistent daemon split.

Verified locally:

- `bridge-daemon.js` reports version `0.4.0` from `/health`.
- `bridge-only-smoke-test.js` starts the daemon successfully.
- `smoke-test.js` starts a temporary daemon plus MCP adapter, lists all 14 tools, and simulates `/bridge/next` plus `/bridge/result`.
- Live CEP validation on `127.0.0.1:3456` reports panel online against daemon `0.4.0`.
- `mcp-call-tool.js` works for `get_bridge_status`, `ping_ae`, `get_project_info`, `run_extendscript`, and `create_text_layer`.

Added:

- `mcp-server\bridge-daemon.js`
- `mcp-server\mcp-adapter.js`
- `POST /tools/call` for the MCP adapter
- `GET /tools` for tool discovery
- `GET /results/:id` and retained recent AE command results
- compatibility wrapper in `mcp-server\server.js`
- ExtendScript-side result serialization that does not depend on AE exposing `JSON.stringify`

Changed:

- `scripts\start-bridge-only.ps1` starts the daemon directly.
- `scripts\start-server.ps1` starts the MCP adapter only.
- `scripts\mcp-call-tool.js` calls the MCP adapter and expects a daemon to already be running.
- `scripts\mcp-call-tool.js` accepts `MCP_CALL_ARGS_JSON` and uses the longer AE command timeout by default.
- MCP config examples now point at `mcp-server\mcp-adapter.js`.
- `/bridge/next` uses short polling to avoid losing commands to stale long-poll responses.

Known caveats:

- A previous `0.3.0` bridge process may still be running on `127.0.0.1:3456`; stop it before starting the `0.4.0` daemon on the same port.
- `backup_project_file` cannot back up an unsaved `.aep`; the live smoke project was unsaved, so backup validation correctly returned an error instead of creating a file.

## v0.3.0-diagnostics - 2026-05-04

Diagnostics and pre-daemon-split checkpoint.

Verified:

- `0.2.0` MCP tools still appear in `tools/list`.
- The server reports version `0.3.0`.
- `bridge-only` mode starts a persistent HTTP bridge on a chosen port.
- `get_bridge_status` works through manual JSON-RPC MCP invocation.
- The CEP panel connects successfully to bridge-only mode on `127.0.0.1:3456`.
- JSONL command logging is written to `logs\bridge-events.jsonl`.

Added:

- `get_bridge_status`
- `get_command_log`
- `backup_project_file`
- `scripts\start-bridge-only.ps1`
- `scripts\bridge-only-smoke-test.js`
- `scripts\mcp-call-tool.js`
- local log and backup paths, ignored by git

Known caveats:

- The current architecture still combines MCP stdio server and HTTP bridge in one process.
- Running bridge-only on `3456` prevents Codex MCP from starting another server on the same port.
- Next planned architecture is a persistent bridge daemon plus a thin MCP adapter.

Rollback:

1. Stop bridge-only or any running MCP server.
2. Use `git checkout v0.3.0-diagnostics` or restore the matching snapshot archive.
3. Restart Codex or the bridge process.
4. Reconnect the CEP panel in After Effects.

## v0.2.0-mvp - 2026-05-04

Stable MVP checkpoint.

Verified:

- Codex can connect to the `after-effects` MCP server.
- The local MCP server can communicate with the CEP panel on `127.0.0.1:3456`.
- The CEP panel can execute ExtendScript inside After Effects.
- `ping_ae`, `get_project_info`, `list_comps`, `list_layers`, and `run_extendscript` work.
- Higher-level tools are available:
  - `get_active_comp`
  - `find_comps`
  - `create_text_layer`
  - `set_layer_transform`
  - `apply_transform_expression`
  - `add_layer_marker`

Known caveats:

- CEP panel Activity may still show old `HTTP 0 / Network error` log entries from before the network fix.
- The server is dependency-free and uses simple HTTP polling, not WebSocket.
- `PlayerDebugMode` must remain enabled for unsigned local CEP development panels.

Rollback:

1. Stop the running MCP server.
2. Replace the project folder contents with the matching snapshot archive, or use `git checkout v0.2.0-mvp`.
3. Restart Codex if MCP config or server tools changed.
4. Reopen or reconnect the CEP panel in After Effects.
