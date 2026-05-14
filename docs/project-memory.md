# AE MCP Bridge Project Memory

Date: 2026-05-13

This file condenses the projectless Codex chat history that was moved into the
`AE_MCP_Bridge` project. It is meant as the first file to read after
`RELEASES.md` and the latest handoff.

## Current Workspace

- Active project root: `C:\Users\Ant\Documents\Codex\AE_agent`
- Origin repo copied from:
  `C:\Users\Ant\Documents\Codex\2026-05-03\files-mentioned-by-the-user-c36e102f\ae-mcp-bridge`
- Current branch: `codex-v0.26-agent-ux-polish`
- Current tag: none for the active v0.26 work
- Current base commit: `336a906 Add AI agents and safe AE plan execution`

Active development branch:

- `codex-v0.26-agent-ux-polish`

The old large live `backups/` and `logs/` contents were intentionally not
copied into this workspace. Empty working folders exist here, and release zip
snapshots were copied into `snapshots/`.

## Project Goal

Build a local After Effects MCP bridge for Codex without depending on Atom AI.
The practical goal is iterative AE scripting and project editing: Codex should
inspect the open AE project, run small scripts when needed, and prefer safer
high-level tools for common edits.

The bridge is not trying to become a second AI agent layer inside After Effects.
Codex remains the agent. The bridge should expose reliable AE capabilities,
safety rails, observability, and good mutation feedback.

## Architecture Decisions

- Keep the working HTTP CEP bridge instead of switching fully to a file bridge.
- Use this architecture:

```text
Codex -> stdio MCP adapter -> local bridge daemon -> CEP panel -> After Effects
```

- `mcp-server/mcp-adapter.js` owns MCP stdio and auto-starts the daemon when
  needed.
- `mcp-server/bridge-daemon.js` owns port `3456`, command IDs, queue state,
  retained results, logs, backups, health/status endpoints, and tool execution.
- `cep-panel/` remains a passive client that polls `/bridge/next` and posts to
  `/bridge/result`.
- Windows logon startup is not the default lifecycle. It was tried in v0.5.2
  and removed from the default in v0.5.3 because Codex-triggered startup is
  simpler and avoids background startup windows.

## Release Timeline

- `v0.2.0-mvp`: working Codex MCP -> CEP panel -> AE path.
- `v0.3.0-diagnostics`: bridge status, command log, project backups.
- `v0.4.0-daemon-split`: persistent daemon plus thin MCP adapter.
- `v0.5.0-dev-workflow`: file execution, selected layers/properties, test comp
  creation and cleanup.
- `v0.5.1` to `v0.5.4`: adapter auto-start, startup-task experiment, lifecycle
  correction, panel autoconnect.
- `v0.6.0-dev-inspection`: project, comp, layer, and property inspection.
- `v0.7.0-practical-layers`: footage import, typed layer creation, comp
  duplication, project item lookup.
- `v0.8.0-property-values`: targeted property value writes.
- `v0.9.0-effect-tools`: add effects and set effect properties.
- `v0.10.0-effect-inspection`: list and inspect effects.
- `v0.11.0-effect-presets`: curated effect matchName presets.
- `v0.12.0-checkpoints`: project checkpoint/list/restore tools.
- `v0.13.0-auto-checkpoints`: opt-in checkpoint fields on mutating tools.
- `v0.14.0-checkpoint-management`: checkpoint details and deletion.
- `v0.15.0-mutation-summaries`: consistent mutation summaries.
- `v0.16.0-scope-cleanup-handoff`: removed obsolete scope references and
  prepared this project transfer.
- `v0.17.0-safe-edit-sessions`: one active edit session with an automatic
  starting checkpoint and mutation operation tracking.
- `v0.18.0-agent-chat`: selectable non-Codex chat agents through OpenRouter,
  local Ollama, optional Ollama Cloud, and custom OpenAI-compatible providers.
- `v0.19.0-agent-rails`: readiness preflight, AI chat JSONL log,
  idempotency keys for mutating tools, and post-mutation AE verification.
- `v0.20.0-api-key-ui`: API key entry in the AE panel, local key saving in
  `.codex\agent-secrets.json`, and daemon loading of saved provider keys.
- `v0.21.0-ae-plan-mode`: safe `AE Plan` mode in the panel and
  `plan_with_ai_agent` / `POST /agents/plan` for structured MCP step drafts
  without executing AE changes.
- `v0.22.0-plan-validation`: validator for AI-generated AE plans, including
  tool existence checks, missing required args, mutating step counts, warnings,
  and safe args with idempotency/verification fields.
- `v0.23.0-plan-repair`: malformed JSON plan repair retry before validation,
  runtime binding validation for dependent steps, and `repairPlan:false` as an
  escape hatch.
- `v0.24.0-plan-runner`: `run_ai_agent_plan` and `/agents/plan/run` for dry-run
  and explicitly confirmed execution of validated plans, with mutation,
  checkpoint, raw ExtendScript, and runtime binding gates. The planner prompt
  now includes a compact catalog of real MCP tools/required fields and tells
  local models to treat Russian/Cyrillic requests as valid input. The CEP panel
  clears stale plans when a new AE Plan request starts and shows verification
  details after executed plan steps.
- `v0.25.0-safe-run`: mutating AE Plan runs now require established
  checkpoint/edit-session protection before the first project-changing step.
  The panel sends `autoEditSession:true` for confirmed mutating runs, the
  backend auto-starts and finishes a protected edit session when possible, and
  unsaved projects are blocked before mutation with a save-project-first result.
  Smoke coverage now includes unsafe mutating-run blocking and a live CEP
  mutating scenario with `Codex Test Safe Run` cleanup.
- `v0.26.0-agent-ux-polish`: the CEP Agent area now shows provider/model
  readiness details, supports an OpenRouter free-model filter, has a manual
  `Check model` preflight action, and persists the visible chat transcript
  locally until the user clears it. The panel now follows the AE GPT-style
  provider layout, separates OpenAI API keys from OpenAI CLI/ChatGPT sign-in,
  and exposes Prompt Optimization. The runner also tolerates common model
  shorthand such as `step-2-result` during real runtime binding and the panel
  formats partial/failed plan runs as `Run: needs review` instead of raw JSON.
- `roadmap-1.1-2026-05-14`: added workflow presets, clearer Plan Review and
  run/checkpoint/recovery transcripts, compact Project Context Snapshot,
  normalized provider reliability errors, and CEP repo-versus-installed
  sync health. Final notes live in
  `docs/2026-05-14-roadmap-1.1-release-notes.md`.

## Important Product Decisions

- Do not return to the old render-output scheduling direction unless the user
  explicitly asks. It was started, live-tested partially, and called off.
- If render queue work is ever resumed, do not trust `RenderQueueItem.index`;
  compute item indices by scanning `app.project.renderQueue`.
- Next work should continue around project safety, tool reliability,
  observability, checkpoints, mutation UX, and AE editing workflows.
- Mutating tools should use AE Undo Groups and return clear `mutation` objects.
- Checkpoints stay opt-in for routine mutations through `autoCheckpoint` or
  `checkpointLabel`; do not silently create large `.aep` backups for every tiny
  operation.
- Keep `run_extendscript` and `run_extendscript_file` as escape hatches, but
  prefer narrow, inspectable tools for repeat workflows.
- Earlier guidance avoided adding Ollama or other model providers because Codex
  was the only intended agent. On 2026-05-12, the user changed direction:
  selectable non-Codex agents are now part of the product plan.
- Keep that agent layer text-first until a later explicit design connects it to
  safe AE mutations. Project-changing work still goes through Codex/MCP tools,
  checkpoints, edit sessions, and undo-aware automation.
- When non-Codex agents begin driving AE tools, require preflight readiness,
  `idempotencyKey` on mutating calls, and the default `verifyAfter` readback so
  duplicate or missing AE changes are visible immediately.
- For non-Codex AE Plan execution, mutating steps must run through a checkpoint
  or edit session. Prefer `autoEditSession:true` from the panel/backend runner
  so the user gets a checkpoint/session result and the session is closed even
  when a step fails.
- Prefer local Ollama `gemma4:latest` for non-Codex agent testing when it is
  installed; keep trying other Ollama-listed models such as cloud/proxy entries
  when they appear in `/api/tags`.
- Default OpenRouter to `nvidia/nemotron-3-super-120b-a12b:free` for now.
  It was selected from OpenRouter's May 2026 top free model list because it is
  positioned for agentic/coding workflows; keep `openrouter/free` available as
  a router fallback.
- Treat ChatGPT subscription access as OpenAI CLI mode, not OpenAI API mode.
  `openai-cli` depends on installed Codex CLI plus `codex login` and calls
  `codex exec --ephemeral --json --sandbox read-only`; `openai-api` uses
  `OPENAI_API_KEY` and normal API billing.
- Keep Agent UX state local and low-risk: selected agent/model, free-model
  filter, and visible transcript may use panel `localStorage`, while API keys
  remain in `.codex\agent-secrets.json` through the daemon.
- When testing Russian prompts from PowerShell, avoid raw Cyrillic in command
  literals if results look like `????`; send UTF-8 JSON or Unicode escapes.
- The bridge CEP panel now ships with `.debug` using AEFT port `8870`. The
  debug target appears only after After Effects loads the extension with that
  file present, so an AE restart may be needed before UI automation can attach.
- After the AE restart on 2026-05-12, `scripts/cep-panel-cdp-smoke.js smoke`
  successfully drove the live panel on port `8870`: selected Ollama
  `gemma4:latest`, sent a Russian AE Plan, dry-ran it, and ran the read-only
  plan through AE with all steps completed.
- v0.25 adds `scripts/cep-panel-cdp-smoke.js mutating-smoke` for live UI
  validation of Safe Run. It creates only temporary comps with the
  `Codex Test Safe Run` prefix and removes them through the same protected
  runner path after success.

## Chat Transfer State

Ten AE MCP projectless chats were identified and moved to the
`AE_MCP_Bridge` project root in Codex local state:

- `019def04-f480-7180-b01d-389ac79a0f44`
- `019def3b-0045-7d62-bc13-b6982a757bbc`
- `019def45-0230-78b0-80fe-c46fc2990e0a`
- `019df2c9-abb6-7050-ab75-0150e9a54489`
- `019df303-247c-7503-9ed9-73d81b390c04`
- `019df840-3554-7ff1-9326-de10dbcccc93`
- `019df955-066b-7320-a860-190b415eada2`
- `019e182c-8602-70b3-bf20-c185d1227808`
- `019e182c-a56d-79a2-9aa9-9fa8bfd6f9eb`
- `019e182c-b0c8-72c2-abc0-6ed70ea155c6`

The post-exit move marker is:
`C:\Users\Ant\Documents\Codex\2026-05-11\githab\ae_mcp_project_move_done.json`

The state backup recorded there is:
`C:\Users\Ant\.codex\ae_mcp_project_move_after_exit_backup_20260511-231709`

## Setup Completed In This Workspace

- Repository files, git history, docs, scripts, CEP panel, and release snapshots
  were copied into `C:\Users\Ant\Documents\Codex\AE_agent`.
- Codex MCP config now points `after-effects` at
  `C:\Users\Ant\Documents\Codex\AE_agent\mcp-server\mcp-adapter.js`.
- Existing `AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT` was preserved in the global
  Codex config.
- Live daemon was restarted and reports `0.16.0`.
- Live daemon paths now point here:
  `logs\bridge-events.jsonl` and `backups\`.
- CEP panel is connected after the restart.
- v0.17 development adds edit session state under `logs\edit-session-active.json`
  and `logs\edit-sessions.jsonl`.

## Next Useful Work

1. Keep this workspace as the active repo for AE MCP Bridge work.
2. Before live AE mutation tests, create or use a checkpoint.
3. Continue with project safety, reliability, observability, mutation UX, and
   practical AE editing workflows.
