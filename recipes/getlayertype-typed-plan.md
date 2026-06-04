# Get Layer Type Typed Plan

## Goal

Report the type or kind of selected or explicit layers using current typed bridge read-back evidence, without copying source JSX or relying on unreviewed AE class traversal.

## Applies When

- The user asks what type a selected layer is, asks to classify selected layers, or asks whether a layer is text, shape, camera, light, null, adjustment, guide, precomp, footage, solid, or another exposed layer kind.
- Current layer targets can be bound from `get_active_comp`, `get_selected_layers`, `get_comp_details`, or explicit `layerIndex` evidence.
- The requested workflow is inspection-only and does not require converting layers, changing selection state, editing properties, relinking sources, scanning the whole project, or reproducing exact source JSX output.
- If the request requires source-exact `getLayerType.jsx` strings, hidden AE class checks, raw ExtendScript, broad project inspection, or mutation, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active comp identity and current basic layer context, or use current explicit comp evidence when the user names a non-active target.
2. Run `get_selected_layers` when the request targets selected layers, and treat the returned selected layer list as the authoritative target set.
3. Run `get_comp_details` when the request targets explicit layer indices or names in a known comp and the active/selected-layer evidence is insufficient.
4. Run `get_layer_details` only for concrete layers identified by prior typed evidence and only when deeper source, switch, property, effect, or layer-kind fields are needed.
5. Classify each target only from fields returned by typed tools, such as `type`, `layerType`, `matchName`, `textLayer`, `shapeLayer`, `cameraLayer`, `lightLayer`, `nullLayer`, `adjustmentLayer`, `guideLayer`, source/precomp evidence, or other available layer-kind fields.
6. Report unknown or unavailable type evidence explicitly instead of inferring hidden AE state.
7. Do not execute raw JSX, do not change selection, and do not call mutating tools.

## Safety Gates

- Read-only workflow.
- Requires Agent plan validation when used in planning context.
- Does not require explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, or post-mutation verification because no mutation is allowed.
- Do not infer selected or explicit layer targets from prior chat context; use current typed read evidence.
- Do not use this recipe for layer conversion, layer creation, source relinking, effects/properties/keyframes/expressions, selection changes, raw ExtendScript, broad project scans, or exact source JSX behavior.

## Verification

- Pre-run evidence comes only from typed read tools.
- The response cites the active comp or explicit comp evidence and the exact selected or requested layer indices/names used for classification.
- Every reported layer type cites only fields returned by `get_selected_layers`, `get_comp_details`, or optional `get_layer_details`.
- Ambiguous, missing, or unsupported type evidence is reported as unavailable or as a typed-tool gap.
- No project-changing tool appears in the plan.
