# Hard Solo Layers Typed Plan

## Goal

Apply hard-solo visibility semantics in one inspected composition by setting
selected generated layers to `enabled:true` and every other explicit generated
layer to `enabled:false` through `set_layer_metadata`, then read back each
affected layer.

## Applies When

- The user asks to run `Hard_Solo_Layers` or disable every unselected layer in
  the active composition.
- The target is exactly one inspected composition.
- Current typed evidence identifies the selected layers and the complete layer
  inventory for that same composition.
- The request accepts explicit typed hard-solo state instead of native selected
  layer traversal or raw JSX execution.
- The workflow does not require changing AE solo switches, layer labels,
  comments, locks, blend modes, timing, sources, effects, properties, render
  queue items, project items, or cross-comp/project-wide visibility.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity.
2. Run `get_selected_layers` to capture current selected-layer evidence with
   concrete one-based layer indices and names.
3. Run `get_comp_details` with `includeLayers:true` for the same composition to
   capture the complete layer inventory and current `enabled` state.
4. Build reviewed `hardSoloSelectedTargets` and `hardSoloDisabledTargets` from
   that evidence. The selected targets keep `enabled:true`; every non-selected
   explicit layer target gets `enabled:false`.
5. Fail closed when selected-layer evidence is empty, inventory evidence is
   incomplete or stale, target names do not match, or any target is not clearly
   generated or explicitly approved for mutation.
6. Run `set_layer_metadata` for selected targets with `enabled:true` and
   `expectedLayerNames` when available.
7. Run `set_layer_metadata` for non-selected targets with `enabled:false` and
   `expectedLayerNames` when available.
8. Run `get_layer_details` or `get_comp_details` after mutation and report
   read-back for every selected and disabled layer.

## Safety Gates

- Mutating layer visibility workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Do not infer selection or layer inventory from screenshots, prior chat
  context, visible UI order, layer names alone, or source-script assumptions.
- Do not call `set_layer_metadata` without explicit layer indices from current
  typed evidence.
- Do not substitute AE solo switches, layer selection mutation, labels, locks,
  comments, opacity, expressions, blend modes, source relinks, timing edits,
  render queue changes, or raw ExtendScript for `Layer.enabled` writes.
- If the request needs native solo switches, selected-property traversal,
  multi-comp/project-wide hard solo, restoration of previous enabled states, or
  source-exact ScriptUI behavior, stop for a separate reviewed contract.

## Verification

- Pre-run evidence identifies the target composition, selected layers, complete
  layer inventory, and explicit selected/unselected target sets.
- Each `set_layer_metadata` result reports only the `enabled` field for explicit
  layer indices and includes expected-name guards when available.
- Post-run read-back shows selected targets with `enabled:true` and every
  reviewed non-selected target with `enabled:false`.
- Post-run evidence shows no layer creation/deletion, order change, selection
  persistence requirement, solo-switch change, label/comment/lock edit,
  expression/property edit, timing/source edit, project item edit, render queue
  mutation, or raw script execution.
