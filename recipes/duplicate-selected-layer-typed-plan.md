# Duplicate Selected Layer Typed Plan

## Goal

Дублировать выбранный слой через существующий `duplicate_layers` typed bridge tool после read-only selection evidence.

## Applies When

- Пользователь просит duplicate/copy/clone currently selected layer.
- Активная композиция и selected layer evidence должны быть прочитаны перед мутацией.
- Workflow targets selected layers only after `get_selected_layers` returns concrete `layerIndex` values.
- If the user requires the duplicate to be moved directly below the source layer, exact post-duplicate selection state, or custom layer reordering, fail closed or require a separate typed-tool contract because this recipe only covers safe duplication and read-back.
- Задача не требует source/precomp relinking, deletion, masks, expressions, effects, marker edits, timing changes, render queue changes or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` and bind concrete selected `layerIndex` and source `name` values only from that read-only evidence.
3. If no selected layers are returned, fail closed with a clear "select a layer first" message.
4. If the user asked for one selected layer but multiple layers are selected, ask which layer to duplicate or explicitly duplicate all selected layers only when that matches the user request.
5. Run one `duplicate_layers` step with the inspected comp target, concrete `layerIndices`, and `sourceNames` paired to the selected-layer evidence. Use `nameSuffix` only when the user requests a suffix or the plan chooses an explicit safe suffix before confirmation.
6. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the mutating duplicate step.
7. Run `get_comp_details` for the same comp with `includeLayers:true` and report source/duplicate pair read-back plus before/after layer counts.

## Safety Gates

- Mutating selected-layer workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not promise exact below-source placement or changed selection state from this recipe; require a separate typed-tool contract when those semantics matter.
- Do not use this recipe for deep precomp/source duplication, layer deletion, source relinking, mask/path edits, timing changes, marker edits, render queue changes or broad cleanup.

## Verification

- The plan includes `get_selected_layers` evidence before any selected layer index is used.
- `duplicate_layers` returns one source/duplicate pair for each requested selected layer.
- The result reports `postVerification.ok:true`, expected source names, duplicate names when a suffix is requested, and before/after layer counts.
- The post-run `get_comp_details` read-back shows the expected source and duplicate layers in the same comp.
- The plan contains only active-comp inspection, selection inspection, one typed duplicate mutation and comp read-back.
