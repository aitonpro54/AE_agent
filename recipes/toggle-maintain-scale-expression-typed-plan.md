# Toggle Maintain Scale Expression Typed Plan

## Goal

Переключить bounded maintain-scale expression на `Transform > Scale` явно выбранных слоев через existing typed bridge tools.

## Applies When

- Пользователь просит toggle/turn on/turn off a maintain scale expression on selected layers, or keep selected layers visually scaled while their immediate parent scale changes.
- Активная композиция, выбранные layers, and current `Transform > Scale` expression state must be read before mutation.
- Workflow targets only selected layers returned by current `get_selected_layers` evidence with concrete `layerIndex` values and `get_layer_details` evidence for the layer's `Transform > Scale` property path and expression state.
- The safe adaptation toggles only this reviewed bounded immediate-parent maintain-scale expression unless the user supplies a separately reviewed expression:

```js
try {
  var out = [];
  var ps = parent.transform.scale.value;
  for (var i = 0; i < value.length; i++) {
    var p = ps[i] || 100;
    out[i] = p === 0 ? value[i] : value[i] * 100 / p;
  }
  out;
} catch (err) {
  value;
}
```

- Toggle-on sets the reviewed maintain-scale expression with `enabled:true`; toggle-off preserves the current maintain-scale expression text and sets `enabled:false`.
- If a selected Scale property already has a different expression, if nested parent compensation is required, if the expression must be deleted instead of disabled, or if source-exact raw JSX behavior is required, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, layer timing changes, source relinking, effect edits, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` to capture current selected-layer evidence and concrete `layerIndex` values.
3. Run `get_layer_details` for every selected layer with transform/expression detail enabled.
4. Bind only each selected layer's explicit `Transform > Scale` property path from current evidence. Fail closed if any target lacks concrete layer ownership, a scale property path, expression capability, or current expression state.
5. Determine the toggle action per target from current evidence:
   - no current expression text: set the reviewed maintain-scale expression with `enabled:true`;
   - same reviewed maintain-scale expression and `expressionEnabled:true`: preserve the expression text and set `enabled:false`;
   - same reviewed maintain-scale expression and `expressionEnabled:false`: preserve the expression text and set `enabled:true`;
   - any other expression text: report the prior expression and require explicit replacement confirmation before setting the reviewed maintain-scale expression.
6. Report the full maintain-scale expression text, previous expression state, and target layer/property path in the dry-run plan before confirmation.
7. Run one `set_expression` step per concrete selected Scale property target with the inspected comp target, evidence-backed `layerIndex`, exact `Transform > Scale` `propertyPath`, intended expression text, and intended `enabled` state.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
9. Run `get_layer_details` again for every affected layer with expression/property detail enabled, and report read-back evidence for each Scale expression.

## Safety Gates

- Mutating selected-layer Scale expression workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers or Scale property paths from prior chat context. Use current `get_selected_layers` and `get_layer_details` evidence before every mutation.
- Do not use `clear_expression` for toggle-off. Toggle-off must preserve the maintain-scale expression text and set only `enabled:false`.
- Do not apply this expression to Position, Rotation, Opacity, Anchor Point, shape Stroke Width, masks, effects, text animators, unselected layers, or arbitrary selected properties.
- Do not promise exact visual compensation for nested parent chains, separated dimensions, 3D camera perspective, collapsed/precomp transforms, nonuniform parent hierarchies beyond immediate parent scale, or source-exact script behavior; those need a separate typed-tool contract or explicit user review.
- Do not use this recipe for expression deletion, broad property scans, layer parenting changes, expression controller rigs, expression syntax repair, keyframe generation, layer transform value edits, render queue changes, source relinking, layer cleanup, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_layers` and `get_layer_details` evidence before any `set_expression` target is bound.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact `Transform > Scale` `propertyPath`, the intended maintain-scale expression text, and the intended `enabled:true` or `enabled:false` toggle state.
- `set_expression` returns the expected maintain-scale expression text, expected `expressionEnabled` state, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected selected layer's Scale property has the expected maintain-scale expression text and enabled state on the expected layer/property path.
- The plan reports unsupported requests for clearing/deleting expressions, replacing unrelated existing expressions without confirmation, nested parent-chain compensation, controller setup, broad property scans, selection side effects, or exact source JSX behavior as typed-tool gaps.
