# Add Properties To Essential Graphics Typed Plan

## Plan Pattern

Use this recipe only for generated-only Essential Graphics controller proof where the target comp and layer are explicit and the property is already known. First read the active or named comp and the generated layer with `get_layer_details`. Then read current Motion Graphics Template controllers with `get_essential_graphics_controllers`.

Add exactly one reviewed property with `add_property_to_essential_graphics` using an explicit `propertyPath`, `controllerName`, `layerIndex`, and expected property identity such as `expectedPropertyMatchName:"ADBE Opacity"`. Finish with another `get_essential_graphics_controllers` read-back and, when useful, `get_layer_details` for generated layer evidence.

## Safety Gates

The mutation is allowed only on generated fixtures or explicitly reviewed generated layers. Keep normal plan validation, mutation permission, checkpoint/edit-session protection, idempotency, and post-mutation read-back enabled.

Do not infer selected properties. Do not traverse broad `selectedProperties`, mutate user template comps, export MOGRTs, rename/delete/reorder existing controllers, or guess property paths. If the controller list cannot be read or `canAddToMotionGraphicsTemplate` is unavailable, fail closed.

## Verification

1. Read controllers before mutation with `get_essential_graphics_controllers` and record `controllerCount`.
2. Run `add_property_to_essential_graphics` once with the reviewed `propertyPath` and `controllerName`.
3. Read controllers after mutation with `get_essential_graphics_controllers`.
4. Confirm the named controller appears, `controllerCount` increased by one, and the mutation result reports `postVerification.ok:true`.

Expected evidence includes `controllerName`, before/after `controllerCount`, explicit generated layer name, reviewed `propertyPath`, property `matchName`, and no raw ExtendScript execution.
