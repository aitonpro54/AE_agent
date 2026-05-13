# Target App Execution Plan

## Progress

- [x] Stable baseline: AE Agent 1.0.0 CEP panel, provider setup, Agent planning, plan validation, protected execution, local history, diagnostics, and installed-panel smoke coverage.
- [x] Milestone 38: Repo cleanup and roadmap reset.
- [ ] Milestone 39: Agent planning quality.
- [ ] Milestone 40: Timeline and layer tools.
- [ ] Milestone 41: Precomp and source tools.
- [ ] Milestone 42: Text, shape, and layout tools.
- [ ] Milestone 43: Animation tools.
- [ ] Milestone 44: Render queue tools.

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

## Validation

- Milestone 38:
  - Rewrote the active handoff as a clean current-state document.
  - Replaced the historical plan with the current stable baseline and active roadmap.
  - Passed repo-wide stale-input reference search.
  - Passed installed CEP extension stale-input reference search.
  - Passed `git diff --check`.
- Milestone 39: Pending.
- Milestone 40: Pending.
- Milestone 41: Pending.
- Milestone 42: Pending.
- Milestone 43: Pending.
- Milestone 44: Pending.
