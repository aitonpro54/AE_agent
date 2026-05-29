# Enable Motion Blur Typed Plan

## Goal

Enable the `motionBlur` layer switch on explicitly inspected layers through existing typed bridge tools.

## Applies When

- The user asks to enable Motion Blur or turn on the motion blur switch for selected or explicit layers.
- A safe adaptation is acceptable: inspect the active comp and target layers, set only the whitelisted `motionBlur` layer attribute to `true` with `set_property_value`, then read it back.
- Target layers are selected in the current active comp, or the user provides explicit layer indices/names that are verified before mutation.
- Every accepted layer has current `get_layer_details` evidence showing layer identity, source/type context, current `motionBlur` state, and support for the switch when `canSetMotionBlur` evidence is exposed by the bridge or by a guarded mutation result.
- Unsupported layer kinds, missing layer details, ambiguous selected-layer sets, or requests that require guessing from prior chat context fail closed.
- If the user needs comp-wide motion blur enablement, renderer or shutter settings, recursive all-nested-comp changes, project-wide layer traversal, onion-skinning, version duplication, parenting/camera/controller setup, source duplication/relinking, layer timing changes, expression/keyframe edits, render queue changes, or exact source JSX behavior, fail closed and request a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to establish the active composition identity.
2. Run `get_selected_layers` for selected-layer workflows, or bind only explicit layer targets from current typed evidence.
3. Run `get_layer_details` for every candidate target and record `layerIndex`, layer name, source/type context, current `motionBlur`, and `canSetMotionBlur` support when available. Fail closed for unsupported layers instead of trying to force the switch.
4. Show the accepted target list, previous `motionBlur` values, skipped target reasons, and requested final value `motionBlur:true` before confirmation.
5. Run one `set_property_value` step per accepted layer with the inspected comp target, evidence-backed `layerIndex`, `propertyPath:"motionBlur"`, `value:true`, `setAtTime:false`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
6. Run `get_layer_details` again for every affected layer and confirm `motionBlur:true` on the same layer index/name/source context.
7. Fail closed instead of using raw script execution when the request needs comp-wide motion blur switches, renderer/shutter settings, recursive/global traversal, exact source switch discovery semantics, unsupported layer coercion, or any adjacent layer/property mutation.

## Safety Gates

- Mutating layer-switch workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current active-comp and layer-detail evidence before binding targets.
- Mutate only `motionBlur` on the explicitly accepted layers; do not change `collapseTransformation`, `threeDLayer`, layer timing, order, source, name, effects, masks, expressions, keyframes, comp settings, renderer/shutter settings, project items, render queue items, selection state, or unrelated layer attributes.
- Treat unsupported layers as typed-tool gaps unless a separate contract proves safe behavior for that layer kind.
- Do not use this recipe for comp-wide motion blur enablement, enabling every layer in a comp without review, recursive precomp traversal, renderer settings, source duplication/relinking, layer cleanup, camera/controller workflows, onion-skinning, version management, template batch changes, or raw script execution.

## Verification

- The plan reads the active composition before choosing target layers.
- Selected-layer plans include current `get_selected_layers` evidence before any layer index is bound.
- Pre-run `get_layer_details` identifies every accepted target layer, its current `motionBlur` value, source/type context, and `canSetMotionBlur` support or guarded support outcome.
- Dry-run evidence lists previous `motionBlur` values, skipped unsupported targets, and requested final `motionBlur:true` for every accepted layer.
- Each `set_property_value` result reports `propertyPath:"motionBlur"`, `value:true`, `setAtTime:false`, and the expected layer index.
- Post-run `get_layer_details` shows `motionBlur:true` on the same layer index/name/source context for every accepted target.
- Skipped targets are reported with explicit typed-tool gap reasons instead of being silently changed.
- Post-run evidence shows no `collapseTransformation`, `threeDLayer`, source, timing, order, name, effect, mask, expression, keyframe, comp setting, renderer/shutter setting, project item, render queue, selection state, recursive nested comp, or unrelated layer mutation.
