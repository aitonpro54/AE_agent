# Get Property Parent Typed Plan

## Goal

Report the immediate parent property group for selected or explicit properties using current typed bridge read-back evidence, without copying source JSX or relying on unreviewed AE `parentProperty` traversal.

## Applies When

- The user asks for a selected property's parent, containing property group, property hierarchy context, match-name path, or compact property-path diagnostics.
- Current property targets can be bound from `get_active_comp`, `get_selected_layers`, `get_selected_properties`, or explicit layer/property path evidence.
- The requested workflow is inspection-only and can be satisfied from typed fields such as selected property `propertyPath`, path segments, display names, match names, expression/keyframe state, or layer-detail property evidence.
- If the request requires source-exact `getPropertyParent.jsx` object output, hidden AE property traversal, unavailable parent object fields, broad project scanning, raw ExtendScript, selection changes, or mutation, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active comp identity, current time, and selected-layer count.
2. Run `get_selected_layers` when selected layer identity, layer indices, names, or ordering are relevant to the selected property context.
3. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true` to capture selected property paths, names, match names, values, keyframe state, expression state, and any exposed hierarchy fields.
4. Run `get_layer_details` only for concrete layers identified by current typed evidence and only when selected-property evidence is insufficient but a specific layer/property path needs deeper read-back.
5. For each accepted property target, report the property itself and its immediate parent group only from returned typed evidence. Prefer structured hierarchy fields when exposed; otherwise derive the parent path only from returned property-path segments and label it as path-derived evidence.
6. Report root-level, missing, ambiguous, truncated, or unsupported parent evidence explicitly instead of inferring hidden AE state.
7. Do not execute raw JSX, do not change selection, and do not call mutating tools.

## Safety Gates

- Read-only workflow.
- Requires Agent plan validation when used in planning context.
- Does not require explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, or post-mutation verification because no mutation is allowed.
- Do not infer selected properties from prior chat context; use current typed read evidence.
- Do not use this recipe for property edits, expression edits, keyframe edits, selection changes, marker/text writes, source relinking, effect addition/removal, render queue changes, project-item mutation, raw ExtendScript, broad hidden traversal, or exact source JSX behavior.

## Verification

- Pre-run evidence comes only from typed read tools.
- The report cites active comp evidence, selected layer indices/names when available, and selected property paths/names/match names only when returned by typed tools.
- Every reported parent property group cites either structured hierarchy fields returned by typed tools or a clearly labeled parent path derived from the returned property path.
- Ambiguous, root-level, missing, truncated, or unsupported parent evidence is reported as unavailable or as a typed-tool gap.
- No project-changing tool appears in the plan.
