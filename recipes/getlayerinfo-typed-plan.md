# Get Layer Info Typed Plan

## Goal

Report selected or explicit layer information from current typed bridge read-back evidence, without copying source JSX or relying on unreviewed AE layer object traversal.

## Applies When

- The user asks for details about selected layers or a specific layer, such as name, index, type, timing, switches, source context, markers, effects, transform/property summary, or other fields already exposed by typed tools.
- Current layer targets can be bound from `get_active_comp`, `get_selected_layers`, `get_comp_details`, or explicit `comp` plus `layerIndex` evidence.
- The requested workflow is inspection-only and can be satisfied from typed read fields returned by the bridge.
- If the request requires source-exact `getLayerInfo.jsx` output, hidden AE object traversal, unavailable property-tree dumps, broad project scanning, raw script execution, selection changes, or mutation, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active comp identity, current time, and basic layer context, or use current explicit comp evidence when the user names a non-active target.
2. Run `get_selected_layers` when the request targets selected layers, and treat the returned selected layer list as the authoritative target set.
3. Run `get_comp_details` with layer detail enabled when explicit layer indices or names need comp-level inventory before deeper inspection.
4. Run `get_layer_details` only for concrete layers identified by current typed evidence and only for the requested detail scope.
5. Report only fields returned by typed tools, such as layer name/index/type, timing, source/precomp context, switches, markers, effects, masks, transform/property summaries, expressions, or unavailable fields.
6. Label missing, unsupported, truncated, or ambiguous fields as unavailable instead of inferring hidden AE state.
7. Do not execute raw scripts, do not change selection, and do not call mutating tools.

## Safety Gates

- Read-only workflow.
- Requires Agent plan validation when used in planning context.
- Does not require explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, or post-mutation verification because no mutation is allowed.
- Do not infer selected or explicit layer targets from prior chat context; use current typed read evidence.
- Do not use this recipe for layer conversion, layer creation, selection changes, property/keyframe/expression/effect edits, source relinking, render queue work, raw script execution, broad project scans, or exact source JSX behavior.

## Verification

- Pre-run evidence comes only from typed read tools.
- The report cites active-comp or explicit comp identity and the exact selected or requested layer indices/names used for inspection.
- Every reported layer field cites only data returned by `get_selected_layers`, `get_comp_details`, or `get_layer_details`.
- Ambiguous, missing, unavailable, unsupported, or truncated detail fields are reported as typed-tool gaps.
- No project-changing tool appears in the plan.
