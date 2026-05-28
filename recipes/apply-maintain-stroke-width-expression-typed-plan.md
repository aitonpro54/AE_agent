# Apply Maintain Stroke Width Expression Typed Plan

## Goal

Добавить bounded maintain-stroke-width expression к явно выбранным shape stroke width properties через existing typed bridge tools.

## Applies When

- Пользователь просит keep/maintain/fix shape stroke width while scaling, or apply a maintain stroke width expression to selected stroke width properties.
- Активная композиция и выбранные properties должны быть прочитаны перед мутацией.
- Workflow targets only properties returned by current `get_selected_properties` evidence with concrete `layerIndex`, `propertyPath`, expression-capable status, and stroke-width identity evidence.
- The safe adaptation sets this exact bounded expression unless the user supplies a separately reviewed expression:

```js
var sx = Math.abs(transform.scale[0]) / 100;
sx === 0 ? value : value / sx;
```

- If the user needs nonuniform-scale compensation, per-shape transform traversal, all-strokes discovery, automatic shape-layer creation, controller rigs, broad property scans, expression syntax repair, or source-exact selection side effects, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, effect edits, layer timing changes, source relinking, render queue changes, selection mutation, layer transform mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, expression-capable status, and stroke-width property identity.
4. Fail closed if no selected properties are returned, if any target lacks a concrete owning layer or property path, if a target is not expression-capable, or if a target is not clearly a stroke width property.
5. Use the exact bounded expression shown in this recipe for maintain-stroke-width requests and report the full expression text in the dry-run plan before confirmation.
6. Do not overwrite an existing expression unless the plan surfaces the previous expression evidence and the user explicitly confirms replacement.
7. Run one `set_expression` step per concrete selected stroke width property target with the inspected comp target, the evidence-backed `layerIndex`, the exact `propertyPath`, the bounded expression, and `enabled:true`.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
9. Run `get_layer_details` for every affected layer with expression/property detail enabled, and report read-back evidence for each stroke width expression.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected properties from prior chat context. Use current `get_selected_properties` evidence before every mutation.
- Do not apply this expression to scale, position, opacity, path, color, effect, mask, text, transform group, or non-stroke-width properties.
- Do not promise exact visual compensation for nonuniform layer scale, nested shape transforms, collapsed/precomp transforms, camera perspective, or renderer-specific stroke behavior; those need a separate typed-tool contract or explicit user review.
- Do not use this recipe for broad property scans, expression controller rigs, expression syntax repair, keyframe generation, expression clearing, render queue changes, source relinking, layer cleanup, layer transform edits, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_properties` evidence before any `set_expression` target is bound.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact stroke width `propertyPath`, the bounded maintain-stroke-width expression, and `enabled:true`.
- `set_expression` returns the expected maintain-stroke-width expression, `expressionEnabled:true`, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected stroke width property has the expected expression enabled on the expected layer/property path.
- The plan reports unsupported requests for broad stroke discovery, nonuniform-scale compensation, nested shape transform traversal, controller setup, selection side effects, expression clearing, or exact source JSX behavior as typed-tool gaps.
