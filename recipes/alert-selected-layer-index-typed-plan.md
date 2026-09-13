# Alert Selected Layer Index Typed Plan

## Goal

Report the first selected layer index in the active composition from typed
selected-layer evidence, without using a UI alert, raw ExtendScript, or any
selection mutation.

## Applies When

- The user asks to alert, show, report, or read the selected layer index.
- The request is satisfied by reporting the first selected layer index from the
  current active-comp selection.
- The current layer selection can be read through `get_selected_layers`.
- If no layer is selected, report empty selection and do not guess a layer from
  visible names, timeline order, previous chat context, screenshots, or source
  script state.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the composition
   identity before reporting a selected layer index.
2. Run `get_selected_layers` and treat the returned order as the authoritative
   selected layer selection snapshot.
3. If no selected layers are returned, report selected layer count `0` and do
   not run a script fallback.
4. If one or more selected layers are returned, report the first selected
   `layerIndex`, selected layer count, layer name, and any returned layer type or
   timing fields.
5. Run `get_layer_details` only when more detail is needed for the same concrete
   first selected `layerIndex`.
6. Do not reproduce ScriptUI or native `alert()` behavior; answer through the
   Agent response using typed evidence.

## Safety Gates

- Read-only selected-layer index inspection workflow.
- Requires normal Agent plan validation, but no mutation confirmation,
  `allowMutations:true`, checkpoint, edit session, idempotency key, or
  post-mutation verification.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not change selection state, select a fallback layer, rename layers, edit
  timing, modify effects/properties, relink sources, touch render queue items, or
  execute raw scripts.
- Exact source UI alert timing, modal behavior, and silent try/catch semantics
  remain out of scope.

## Verification

- The response cites `get_active_comp` and `get_selected_layers` evidence before
  reporting the first selected layer index.
- The reported selected layer count equals the number of records returned by
  `get_selected_layers`.
- The reported first selected `layerIndex` and layer name match the first record
  returned by `get_selected_layers` or optional `get_layer_details` read-back for
  that same index.
- Empty selection is reported as empty selection, not handled through raw
  ExtendScript, guessed layer choice, or selection mutation.
- The plan contains only active-comp inspection, selected-layer inspection,
  optional same-index layer detail read-back, and reporting.
