# Toggle Difference Blend Mode Typed Plan

Set reviewed selected generated layers to `Layer.blendingMode` Difference through
`set_layer_blending_mode`, then read every affected layer back.

## Applies When

- The request is to set selected layers to Difference blending mode in one
  inspected composition.
- Current typed evidence identifies the target composition and concrete selected
  layer indices/names.
- A complete layer inventory from the same composition is available before
  mutation.
- A generated-only or explicitly reviewed target scope is acceptable.

## Plan Pattern

1. Run `get_active_comp` to bind the current composition identity.
2. Run `get_selected_layers` to capture selected layer indices and names.
3. Run `get_comp_details` with `includeLayers:true` for the same composition to
   capture complete layer inventory and current `blendingModeName` evidence.
4. Build a reviewed target list from current typed evidence only.
5. Run `set_layer_blending_mode` with explicit `layerIndices`,
   `expectedLayerNames` when available, optional
   `expectedCurrentBlendingModes`, and `blendingMode:"difference"`.
6. Run `get_layer_details` or `get_comp_details` after mutation to confirm
   `blendingModeName:"difference"` for every target layer.

## Fail Closed

- Do not infer selected layers from prior chat context, source JSX traversal, or
  UI assumptions.
- Do not use this recipe for source-exact Alt-key branching, toggle-back
  behavior, native undo semantics, broad project/multi-comp traversal, all blend
  mode enums, locked layers, non-generated user assets, layer labels/comments/
  locks/enabled state, track matte changes, expressions, effects, timing,
  sources, render queue work, file I/O, or raw script execution.

## Safety Gates

- Plan validation, explicit confirmation, mutation permission, idempotency, and
  checkpoint/edit-session protection are required before mutation.
- The target list must come from current `get_selected_layers` and
  `get_comp_details` evidence for one composition.
- Use `expectedLayerNames` and `expectedCurrentBlendingModes` when the evidence
  provides them.
- Post-mutation read-back with `get_layer_details` or `get_comp_details` is
  required before the plan can be considered verified.

## Verification

- Pre-run evidence identifies target comp, selected layer indices/names,
  complete layer inventory, and reviewed explicit target list.
- `set_layer_blending_mode` returns `postVerification.ok:true`,
  `requestedBlendingMode:"difference"`, expected-name guard evidence, and
  changed count equal to the accepted target count.
- Post-run layer read-back shows `blendingModeName:"difference"` on every
  target layer.
- Unsupported source-exact Alt-key branching, toggle restoration, broad
  selection traversal, other blend modes, non-generated assets, and raw JSX are
  reported as typed-tool gaps.