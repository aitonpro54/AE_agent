# Layer Selection Set Typed Plan

## Goal

Установить текущую selection state слоев активной композиции через bounded `set_layer_selection` typed bridge tool после явного read-back слоя.

## Applies When

- Пользователь просит select/set/replace current layer selection to explicit layers.
- Активная композиция и candidate layers должны быть прочитаны перед selection state mutation.
- Target selection задается concrete one-based `layerIndices`, optionally guarded by expected layer names from read-back evidence.
- Supported mode is replacement selection unless the user explicitly requests a supported add/remove/toggle mode and the typed tool contract exposes it.
- Задача не требует persistent named selection sets, selecting by type/label/randomness, fuzzy name search, cross-comp selection, layer duplication, layer renaming, timing/source/effect edits, render queue work or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_comp_details` with layer information, or use current `get_selected_layers` evidence only when it already contains the concrete target layer indices the user wants to keep selected.
3. Bind explicit one-based `layerIndices` from current layer read-back. If names are user-facing targets, bind `expectedNames` from the same read-back before mutation.
4. Fail closed when the request depends on fuzzy matching, hidden timeline state, source-exact named selection sets, selection by type/label/randomness, or layers that are not present in the inspected comp.
5. Run one `set_layer_selection` step for the inspected comp with the explicit `layerIndices`, optional `expectedNames`, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
6. Run `get_selected_layers` after mutation and report selected layer count, selected `layerIndex` values and names.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs because selection state can affect subsequent mutations.
- Do not infer target layers from previous chat context, visible layer names, partial name matches or source ordering guesses.
- Do not promise persistent named selection sets or exact native UI selection side effects unless a separate typed-tool contract proves those semantics.
- Do not use this recipe for selecting layers by type, label, randomness, expressions, effect presence, source type, project item selection, layer duplication, deletion, renaming, timing edits, marker edits, render queue changes or broad timeline cleanup.

## Verification

- The plan includes active comp and layer inventory evidence before any target layer index is used.
- The `set_layer_selection` step reports the requested explicit `layerIndices`, optional `expectedNames`, replacement selection semantics and `verifyAfter:true`.
- The post-run `get_selected_layers` read-back shows exactly the requested selected layer count, selected layer indices and expected names.
- Skipped or missing targets are reported as typed-tool gaps instead of silently selecting approximate layers.
- The plan contains only active-comp inspection, layer inventory inspection, one typed selection mutation and selected-layer read-back.
