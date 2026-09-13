# AR Add Expression Maintain Scale When Parented Typed Plan

## Goal

Добавить reviewed maintain-scale expression к `Transform > Scale` явно выбранных уже parented layers через existing typed bridge tools.

## Applies When

- Пользователь просит add/apply a maintain scale expression when selected layers are parented, including requests that reference `AR_AddExpMantainScaleWhenParented.jsx` or its misspelled "mantain" source name.
- Активная композиция, выбранные layers, current parent evidence and current `Transform > Scale` expression state must be read before mutation.
- Workflow targets only selected layers returned by current `get_selected_layers` evidence with concrete `layerIndex` values, non-empty parent evidence, and `get_layer_details` evidence for the layer's expression-capable `Transform > Scale` property path.
- The safe adaptation sets this reviewed immediate-parent maintain-scale expression unless the user supplies a separately reviewed expression:

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

- If a selected layer is not parented, if a Scale property already has an unrelated expression, if nested parent-chain compensation is required, if parenting should be created or changed, or if source-exact raw JSX behavior is required, fail closed or require a separate typed-tool contract.
- Задача не требует parenting mutation, keyframe edits, layer timing changes, source relinking, effect edits, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` to capture current selected-layer evidence, concrete `layerIndex` values and parent evidence.
3. Run `get_layer_details` for every selected layer with transform/expression detail enabled.
4. Bind only each selected, already parented layer's explicit expression-capable `Transform > Scale` property path from current evidence. Fail closed if any target lacks concrete layer ownership, parent evidence, a Scale property path, expression-capable evidence, or current expression state.
5. Use the reviewed maintain-scale expression shown in this recipe for selected parented layers with no current Scale expression.
6. Do not overwrite an existing expression unless the plan surfaces the previous expression evidence and the user explicitly confirms replacement.
7. Report the full maintain-scale expression text, parent evidence, previous expression state, and target layer/property path in the dry-run plan before confirmation.
8. Run one `set_expression` step per concrete selected parented Scale property target with the inspected comp target, evidence-backed `layerIndex`, exact `Transform > Scale` `propertyPath`, reviewed expression text, and `enabled:true`.
9. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
10. Run `get_layer_details` again for every affected layer with expression/property detail enabled, and report read-back evidence for each Scale expression.

## Safety Gates

- Mutating selected-layer Scale expression workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers, parent state or Scale property paths from prior chat context. Use current `get_selected_layers` and `get_layer_details` evidence before every mutation.
- Do not create, remove, or change parenting. This recipe only applies an expression to layers that are already parented in current evidence.
- Do not apply this expression to unparented layers, Position, Rotation, Opacity, Anchor Point, shape Stroke Width, masks, effects, text animators, unselected layers, or arbitrary selected properties.
- Do not promise exact visual compensation for nested parent chains, separated dimensions, 3D camera perspective, collapsed/precomp transforms, nonuniform parent hierarchies beyond immediate parent scale, or source-exact script behavior; those need a separate typed-tool contract or explicit user review.
- Do not use this recipe for expression deletion, expression toggling, broad property scans, layer parenting changes, expression controller rigs, expression syntax repair, keyframe generation, layer transform value edits, render queue changes, source relinking, layer cleanup, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_layers` and `get_layer_details` evidence before any `set_expression` target is bound.
- Every target has current evidence that the selected layer is already parented.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact `Transform > Scale` `propertyPath`, the reviewed maintain-scale expression, and `enabled:true`.
- `set_expression` returns the expected maintain-scale expression text, `expressionEnabled:true`, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected selected layer's Scale property has the expected maintain-scale expression enabled on the expected layer/property path.
- The plan reports unsupported requests for unparented layers, parenting changes, clearing/deleting expressions, replacing unrelated existing expressions without confirmation, nested parent-chain compensation, controller setup, broad scans, selection side effects, or exact source JSX behavior as typed-tool gaps.
