# AE MCP Bridge Project Memory

Date: 2026-05-11

This file condenses the projectless Codex chat history that was moved into the
`AE_MCP_Bridge` project. It is meant as the first file to read after
`RELEASES.md` and the latest handoff.

## Current Workspace

- Active project root: `C:\Users\Ant\Documents\New project 2`
- Origin repo copied from:
  `C:\Users\Ant\Documents\Codex\2026-05-03\files-mentioned-by-the-user-c36e102f\ae-mcp-bridge`
- Current branch: `v0.16-scope-cleanup-handoff`
- Current tag: `v0.16.0-scope-cleanup-handoff`
- Current commit: `77df1b7 Prepare scope cleanup handoff`

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
- Do not add Ollama or other model providers inside the bridge right now. That
  would create a second agent layer, while Codex already fills that role.
- AE GPT and Atom AI are useful product references, but the near-term advantage
  of this project is a transparent local bridge with safety rails, not an
  in-AE chat UI clone.

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
  were copied into `C:\Users\Ant\Documents\New project 2`.
- Codex MCP config now points `after-effects` at
  `C:\Users\Ant\Documents\New project 2\mcp-server\mcp-adapter.js`.
- Existing `AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT` was preserved in the global
  Codex config.
- Live daemon was restarted and reports `0.16.0`.
- Live daemon paths now point here:
  `logs\bridge-events.jsonl` and `backups\`.
- CEP panel is connected after the restart.

## Next Useful Work

1. Keep this workspace as the active repo for AE MCP Bridge work.
2. Before live AE mutation tests, create or use a checkpoint.
3. Continue with project safety, reliability, observability, mutation UX, and
   practical AE editing workflows.
