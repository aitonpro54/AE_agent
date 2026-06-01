# Set Spatial In Tangent Typed Plan

## Goal

Set the spatial in tangent for one reviewed spatial keyframe through the existing `set_spatial_in_tangent` typed bridge tool, without copying source JSX or relying on AE UI selection side effects.

## Applies When

- The user asks to set a selected keyframe's spatial in tangent, smooth an incoming motion path handle, or adapt the Set Spacial In Tanget workflow on a Position-like spatial property.
- Current typed evidence identifies exactly one target composition, layer, spatial property, and keyframe through `get_active_comp` plus `get_selected_properties`, or through equivalent explicit generated layer/property/keyframe evidence.
- The target property has array keyframe values, at least two keyframes, and the reviewed `keyIndex` is `2` or later so the previous-current delta can be computed.
- The plan has reviewed the `factor` multiplier before confirmation. The typed tool computes `inSpatialTangent = (previousValue - currentValue) * factor` and preserves the existing out tangent.
- If the request needs selected-key discovery without explicit reviewed keyframe evidence, arbitrary tangent vectors, out-tangent editing, interpolation/ease preservation beyond the existing out tangent, non-spatial properties, path/mask/shape tangents, source-exact UI prompts, broad property scans, or exact source JSX behavior, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity, current time, frame rate, and duration when relevant.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`, or use equivalent explicit current layer/property/keyframe evidence for generated-only workflows.
3. Bind exactly one concrete spatial property target from current evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, value shape, expression state, complete keyframe count when available, and reviewed `selectedKeyframes` or explicit `keyIndex`.
4. Require reviewed `keyIndex` and `factor` before mutation. The `keyIndex` must target keyframe `2` or later, and both the previous keyframe value and current keyframe value must be numeric arrays with matching dimensionality.
5. Fail closed when selected-property evidence is empty, multiple targets are requested without a separate batch contract, the property lacks a stable layer/property path, the values are not spatial numeric arrays, `keyIndex` is missing or points to the first keyframe, the previous-current delta cannot be disclosed, or the user expects exact source JSX UI behavior.
6. Disclose previous value, current value, computed `inSpatialTangent`, reviewed `factor`, existing out-tangent preservation, and the exact `set_spatial_in_tangent` call before confirmation.
7. Run one `set_spatial_in_tangent` step with the evidence-backed comp target, `layerIndex`, exact `propertyPath`, reviewed `keyIndex`, and reviewed `factor`.
8. Run `get_layer_details` after mutation for the affected layer with property values and keyframes included.
9. Report skipped targets with explicit typed-tool gap reasons instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe tangent workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties or selected keyframes from prior chat context; use only current typed evidence plus explicit reviewed `keyIndex`.
- Mutate only the reviewed keyframe's spatial in tangent. Preserve the existing out tangent through the typed tool result.
- Do not change expressions, keyframe values, keyframe times, interpolation/ease settings, other keyframes, path/mask/shape vertices or tangents, layer transforms outside the reviewed property keyframes, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.
- Treat arbitrary tangent vector editing, out-tangent editing, selected-key discovery, non-spatial properties, first-key tangent requests, path/mask/shape tangent workflows, source-exact UI prompts, and exact source semantics as typed-tool gaps unless a separate contract proves safe behavior.

## Verification

- Pre-run evidence identifies exactly one concrete spatial property target, its owning layer, exact property path, current value shape, expression state, complete keyframe count when available, reviewed `keyIndex`, previous keyframe value, and current keyframe value.
- Dry-run evidence lists `selectedKeyframes` or explicit `keyIndex`, reviewed `factor`, previous value, current value, computed `inSpatialTangent`, and preserved existing out-tangent behavior.
- The `set_spatial_in_tangent` result reports the expected property path, `keyIndex`, `factor`, computed `inSpatialTangent`, and preserved `outSpatialTangent`.
- Post-run `get_layer_details` shows the reviewed keyframe on the expected layer/property path with the expected `inSpatialTangent` read back.
- Skipped targets are reported with explicit reasons such as missing selected-property evidence, missing selected keyframe evidence, first keyframe target, non-spatial value shape, missing previous keyframe, arbitrary tangent vector request, out-tangent edit request, path/mask/shape tangent request, selected-key discovery gap, missing read-back, or unsupported exact source semantics.
- Post-run evidence shows no expression, keyframe value, keyframe time, interpolation/ease, out-tangent, path/mask/shape, effect, source, render queue, layer name, selection state, project item, unselected keyframe, or unselected property mutation.
