# Parent Opacity Typed Plan

## Intent

Apply a generated child layer opacity expression that follows a reviewed parent
layer's opacity, after binding the child -> parent relationship with typed
parenting evidence and reading the expression back.

## Applies When

- The user asks to run `Parent_Opacity` or make a selected/generated child
  layer inherit or clamp opacity from its parent.
- Current typed evidence identifies one target composition, one generated or
  explicitly reviewed child layer, and one generated or explicitly reviewed
  parent layer.
- The accepted child and parent are represented as concrete same-comp
  `childLayerIndex` and `parentLayerIndex` values plus expected names before
  mutation.
- The requested behavior can be represented as the reviewed expression
  `Math.min(value, thisLayer.parent.transform.opacity.value);` on
  `ADBE Transform Group.ADBE Opacity`.

## Plan Pattern

1. Run `get_active_comp` to bind the target composition when active-comp
   context is the user-facing input.
2. Run `get_selected_layers`, `get_comp_details includeLayers:true`, or
   `get_layer_details` to bind the exact child and parent layer indices, names,
   existing parent state, and current opacity property evidence.
3. Fail closed if the child or parent identity is ambiguous, cross-comp, not
   generated or explicitly reviewed, missing, already in a parent cycle, or if
   the target opacity property cannot be read.
4. Run `set_layer_parent` with explicit `childLayerIndex` mapped to
   `layerIndex`, explicit `parentLayerIndex`, `expectedLayerName`, and
   `expectedParentName` when the reviewed relationship is not already present.
5. Run `get_layer_details` after parenting to verify the child's
   `parent.index` and `parent.name`.
6. Run `set_expression` on the child layer's
   `ADBE Transform Group.ADBE Opacity` using the reviewed parent-opacity
   expression and `enabled:true`.
7. Run `get_layer_details includeProperties:true includeExpressions:true` after
   mutation and verify the opacity property's expression text, enabled state,
   and lack of expression error.

## Safety Gates

- Require normal Agent plan validation, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before parent-link or expression mutation.

## Safety Limits

- Mutate only the explicit child layer's parent link and opacity expression.
- Do not create, delete, duplicate, rename, reorder, retime, relink, select
  extra layers, change track mattes, edit non-opacity properties, edit effects,
  change labels, change layer switches, mutate project items, render queue, or
  files.
- Do not infer parent targets from screenshots, visual indentation, layer names
  alone, stale selection context, or previous chat context.
- Do not run broad selected-layer parenting or expression writes on
  non-generated user assets without a separate reviewed contract and
  checkpoint/rollback scope.
- Do not clear expressions or try to restore prior expressions unless a
  separate explicit restoration contract exists.
- Do not use raw ExtendScript or source-checkout execution as a substitute for
  `set_layer_parent`, `set_expression`, and typed read-back.

## Verification

- Pre-run evidence identifies the target comp, child layer index/name, parent
  layer index/name, current parent state, and opacity property path.
- The `set_layer_parent` result reports the exact child/parent indices,
  expected-name guards, and `postVerification.parentMatches:true`, or the plan
  records that the reviewed parent relationship already existed.
- Post-parenting `get_layer_details` proves the child layer's `parent.index`
  and `parent.name` match the reviewed parent layer.
- The `set_expression` result targets only
  `ADBE Transform Group.ADBE Opacity` on the reviewed child layer.
- Post-expression `get_layer_details` proves the opacity expression equals the
  reviewed parent-opacity expression, `expressionEnabled:true`, and no
  expression error is present.
- Semantic verification passes for every parent-link and expression write plus
  read-back.
- Unsupported bulk parenting, parent cycles, missing opacity property evidence,
  expression restoration/deletion, track matte changes, layer reordering,
  non-generated user-layer mutation, source-exact native UI side effects, or raw
  script execution are reported as typed-tool gaps.
