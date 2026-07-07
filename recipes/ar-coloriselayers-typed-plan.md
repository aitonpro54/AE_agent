# AR Colorise Layers Typed Plan

## Goal

Set the `Layer.label` value for explicitly selected active-composition layers
through typed metadata tools, using a reviewed AE label index and read-back
evidence.

## Applies When

- The user asks to colorise/colorize selected layers, set selected layer label
  colors, or references `AR_ColoriseLayers.jsx`.
- The target layers are the current selected layers returned by typed evidence
  with concrete one-based `layerIndex` values.
- The requested color can be represented as an explicit reviewed AE
  `labelIndex` from `0` through `16`.
- Source-exact color palette UI behavior, automatic cycling, random color
  assignment, label-name inference, cross-comp changes, Project item labels,
  property color values, or raw script execution are not required.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity.
2. Run `get_selected_layers` to capture selected layer indices and names.
3. Run `get_layer_details` or `get_comp_details includeLayers:true` to capture
   current label evidence for every selected target when available.
4. Bind one explicit reviewed `labelIndex` in the range `0..16` before
   confirmation. Do not infer it from screenshots, previous chat context,
   source script UI defaults, color names without mapping, or unavailable AE
   palette state.
5. Fail closed when selection evidence is empty, layer inventory is truncated,
   selected targets lack concrete indices, the requested color cannot be mapped
   to one reviewed `labelIndex`, or source-exact AR palette behavior is needed.
6. Run `set_layer_metadata` once with explicit `layerIndices`, optional
   `expectedLayerNames`, and `label:<reviewed labelIndex>`.
7. Run `get_layer_details` or `get_comp_details includeLayers:true` after
   mutation and confirm every accepted selected layer reports the expected
   `label` value.

## Safety Gates

- Mutating selected-layer metadata workflow.
- Requires validated Agent plan, explicit confirmation, `allowMutations:true`,
  idempotency, checkpoint or edit-session protection, and post-mutation
  read-back before any label write.
- Mutate only the `Layer.label` field on the explicit selected layer indices.
- Preserve layer names, order, selection state, enabled/locked/guide/shy/solo
  switches, timing, sources, effects, expressions, masks, keyframes, parenting,
  track matte relationships, project items, render queue items, files, and
  non-target layers.
- Do not use raw ExtendScript, property color edits, layer renames, selection
  changes, or Project item metadata as substitutes for selected-layer label
  mutation.

## Verification

- Pre-run evidence identifies the active comp, selected layer indices, optional
  expected layer names, and current label state when typed read-back exposes it.
- The dry-run plan discloses the reviewed `labelIndex` and every accepted
  target layer before confirmation.
- `set_layer_metadata` reports only `label:<reviewed labelIndex>` updates for
  concrete selected layer indices and expected-name guards when available.
- Post-run read-back shows every accepted selected layer has the expected
  `label` value.
- Unsupported palette UI behavior, automatic color cycling, random labels,
  label-name inference without an explicit mapping, Project item label changes,
  property color changes, cross-comp mutation, raw script execution, and exact
  source JSX behavior are reported as typed-tool gaps.
