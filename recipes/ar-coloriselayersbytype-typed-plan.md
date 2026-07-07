# AR Colorise Layers By Type Typed Plan

## Goal

Set `Layer.label` values for explicit active-composition layer targets according
to reviewed typed layer-kind evidence, using a reviewed `typeToLabelMap` and
post-mutation label read-back.

## Applies When

- The user asks to colorise/colorize layers by type or references
  `AR_ColoriseLayersByType.jsx`.
- Current typed evidence can identify every target layer by concrete one-based
  `layerIndex` values and returned layer-kind fields such as `type`,
  `layerType`, `matchName`, `textLayer`, `shapeLayer`, `cameraLayer`,
  `lightLayer`, `nullLayer`, `adjustmentLayer`, `guideLayer`, source/precomp
  evidence, or equivalent available fields.
- The requested type colors are represented as an explicit reviewed
  `typeToLabelMap`, where every mapped label index is in the AE `0..16` range.
- Source-exact AR type classifier behavior, palette UI behavior, hidden AE class
  checks, automatic label selection, Project item labels, property color values,
  cross-comp changes, or raw script execution are not required.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity.
2. Run `get_selected_layers` when the workflow targets selected layers, or run
   `get_comp_details includeLayers:true` when the user explicitly requests all
   active-comp layers.
3. Run `get_layer_details` for every accepted target when deeper type or label
   read-back evidence is needed.
4. Build a reviewed `typeToLabelMap` before confirmation. Each key must be a
   layer-kind value returned by typed evidence, and each value must be an AE
   `labelIndex` from `0..16`.
5. Derive target groups only from current typed layer-kind evidence. Fail closed
   for empty selection, incomplete active-comp inventory, unavailable type
   fields, unmapped layer types, ambiguous type evidence, or source-exact type
   classifier requirements.
6. Run `set_layer_metadata` once per accepted label group with explicit
   `layerIndices`, optional `expectedLayerNames`, and
   `label:<reviewed labelIndex>`.
7. Run `get_layer_details` or `get_comp_details includeLayers:true` after
   mutation and confirm every accepted target reports the expected `label`.

## Safety Gates

- Mutating layer metadata workflow.
- Requires validated Agent plan, explicit confirmation, `allowMutations:true`,
  idempotency, checkpoint or edit-session protection, and post-mutation
  read-back before any label write.
- Mutate only `Layer.label` on explicit active-comp layer indices whose type was
  classified from current typed evidence.
- Preserve layer names, order, selection state, switches, timing, sources,
  effects, expressions, masks, keyframes, parenting, track matte relationships,
  project items, render queue items, files, and non-target layers.
- Do not infer layer type from screenshots, prior chat context, layer names
  alone, visual order, unavailable source-script state, or hidden AE class
  checks.
- Do not use raw ExtendScript, property color edits, Project item metadata,
  layer renames, selection changes, or broad project scans as substitutes for
  typed active-comp label mutation.

## Verification

- Pre-run evidence identifies the active comp, every accepted layer index,
  optional expected layer names, returned layer-kind fields, current label state
  when available, and skipped targets with reasons.
- The dry-run plan discloses the reviewed `typeToLabelMap`, accepted type
  groups, label indices, and layer targets before confirmation.
- Each `set_layer_metadata` call reports only `label:<reviewed labelIndex>`
  updates for concrete layer indices and expected-name guards when available.
- Post-run read-back shows every accepted layer has the expected label for its
  reviewed typed layer kind.
- Unsupported source-exact type classifier behavior, palette UI behavior,
  hidden AE class checks, automatic label selection, Project item label changes,
  property color changes, cross-comp mutation, raw script execution, and exact
  source JSX behavior are reported as typed-tool gaps.
