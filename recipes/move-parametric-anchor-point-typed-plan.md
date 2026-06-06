# Move Parametric Anchor Point Typed Plan

## Goal

Drive one or more explicit rectangle or ellipse shape Position properties with a
reviewed anchor-position expression through `set_expression`, without copying
the source JSX or relying on modal ScriptUI selection.

## Applies When

- The user asks to pin a parametric rectangle or ellipse shape to a side or
  corner while its Size changes.
- Current typed evidence identifies each accepted target as
  `ADBE Vector Rect Position` or `ADBE Vector Ellipse Position` on a shape
  layer, with concrete `layerIndex`, exact `propertyPath`, expression-capable
  state, and current expression/keyframe state when available.
- The requested anchor position is one reviewed key from this bounded set:
  `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`,
  `bottom`, or `bottom-right`.
- The safe adaptation writes only the reviewed expression for the accepted
  position target. It does not open ScriptUI, infer targets from prior chat
  context, traverse arbitrary selected properties, or mutate layer Transform
  Anchor Point.
- If the request needs source-exact modal UI behavior, silent selected-property
  no-op semantics, broad batch traversal, existing expression preservation,
  expression merging, shape path edits, layer transform anchor point changes, or
  raw JSX execution, fail closed or require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition.
2. Run `get_selected_properties` with `includeValues:true` and
   `includeExpressions:true` when the target comes from current UI selection, or
   use equivalent explicit `get_layer_details` evidence for generated-only
   workflows.
3. Bind every accepted target from current evidence: comp identity, `layerIndex`,
   layer name when available, exact `propertyPath`, `matchName`, current
   expression state, and keyframe/animated state when available.
4. Fail closed when evidence is empty, ambiguous, not expression-capable, not
   `ADBE Vector Rect Position` or `ADBE Vector Ellipse Position`, belongs to a
   locked layer, has an existing unrelated expression without explicit
   replacement approval, or requires preserving keyframed/animated behavior.
5. Resolve `anchorPositionKey` from the bounded set and compute the exact final
   expression:
   - `x` is `size[0] / 2`, `0`, or `size[0] / -2`.
   - `y` is `size[1] / 2`, `0`, or `size[1] / -2`.
   - The expression reads `thisProperty.propertyGroup(1).size` and returns
     `[x, y]`.
6. Show the previous expression state, exact `propertyPath`, selected
   `anchorPositionKey`, and final expression before confirmation.
7. Run one `set_expression` step per accepted target with the inspected comp
   target, evidence-backed `layerIndex`, exact `propertyPath`, final expression,
   `enabled:true`, and `verifyAfter:true`.
8. Run `get_layer_details` for every affected layer with property/expression
   detail enabled and report read-back for each updated expression.

## Safety Gates

- Mutating selected-property or explicit generated shape-property workflow.
- Requires validated Agent plan, explicit confirmation, `allowMutations:true`,
  idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties from prior chat context. Use current
  `get_selected_properties` or explicit generated `get_layer_details` evidence
  before every mutation.
- Do not apply this recipe to layer Transform Position, layer Transform Anchor
  Point, Size, Scale, masks, paths, effects, text animators, non-parametric shape
  properties, or unselected/unreviewed properties.
- Do not overwrite existing expressions or keyframed/animated Position
  properties unless that replacement is explicitly reviewed in the plan.
- Do not change shape paths, Size values, layer transforms, layer names, layer
  sources, timing, masks, effects, render queue items, project items, or
  selection state.

## Verification

- Pre-run evidence identifies each concrete target as
  `ADBE Vector Rect Position` or `ADBE Vector Ellipse Position`, with owning
  layer, exact property path, expression-capable state, and prior
  expression/keyframe state when available.
- The dry-run plan shows the selected `anchorPositionKey`, previous expression
  state, exact `propertyPath`, and final expression for each target.
- Every mutating step uses `set_expression` on one explicit property target and
  reports the expected expression text, `expressionEnabled:true`, and no
  `expressionError`.
- Post-run `get_layer_details` read-back shows the expression on the expected
  layer/property path and no unrelated property, transform, path, effect, source,
  timing, render queue, project item, or selection mutation.
- Unsupported targets are reported with explicit reasons such as missing typed
  evidence, unsupported matchName, locked layer, existing expression overwrite
  not approved, keyframed/animated state preservation gap, ambiguous selection,
  missing read-back, or unsupported exact source semantics.
