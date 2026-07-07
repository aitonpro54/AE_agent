# AR Nulls To Corner Pins Typed Plan

## Goal

Inspect a requested `AR_NullsToCornerPins.jsx` workflow, bind explicit null
controller and Corner Pin requirements from typed evidence, and fail closed
unless separate reviewed typed tools can create or bind the Corner Pin effect
properties with read-back.

## Applies When

- The user asks to drive Corner Pin points from null layers, connect nulls to
  corner pins, or references `AR_NullsToCornerPins.jsx`.
- Current active-comp, selected-layer, selected-property, layer, and effect
  evidence can be gathered before any mutation decision.
- The request can be classified against explicit null controller layers and a
  reviewed Corner Pin-like effect target from typed evidence.
- Current safe handling is read-only advisory: it may report the required
  `nullsToCornerPinsSpec`, but it must not create null layers, add or configure
  Corner Pin effects, write expressions, parent layers, or change transforms
  with current tools.
- If source-exact selected-layer ordering, automatic null creation, Corner Pin
  effect creation, point-expression authoring, coordinate-space conversion,
  effect-property mutation, cleanup behavior, or raw JSX is required, fail
  closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity, dimensions,
   current time, and selected-layer/property context.
2. Run `get_selected_layers` and `get_selected_properties` when the request is
   selection-driven. Treat missing selected-layer/property evidence as a
   typed-tool gap rather than inferring nulls or corner targets from layer
   names, screenshots, or source-script assumptions.
3. Run `get_layer_details` for every explicit candidate controller null and
   target layer to review layer indices, names, type/null status, transform
   Position evidence, parent state, locked/shy state, source/timing identity,
   and existing expressions.
4. Run `list_effects` or `get_effect_details` for the explicit target layer
   when an existing Corner Pin-like effect must be inspected. Require concrete
   effect identity, matchName when available, point property paths, expression
   state, value shape, and current values before discussing any future link.
5. Build and report a reviewed `nullsToCornerPinsSpec` only as an advisory
   object: comp identity, target layer index/name, Corner Pin effect identity,
   four reviewed corner labels, source null layer indices/names, controller
   Position evidence, proposed point-property paths, coordinate-space
   assumptions, proposed expression/link behavior, and skipped-target reasons.
6. Fail closed if target layer identity, null-controller count, layer ordering,
   point-property paths, coordinate-space conversion, existing expression
   state, locked state, cleanup behavior, or idempotency keys are ambiguous.
7. Do not run `add_effect`, `set_effect_property`, `set_expression`,
   `set_layer_parent`, layer-creation tools, raw ExtendScript, or script runners
   from this recipe.
8. A future mutating variant must first add a narrow contract for generated
   null/controller discovery or creation, exact Corner Pin effect/property
   binding, reviewed expression text or point-value writer, coordinate-space
   conversion, idempotency keys, checkpoint/edit-session protection,
   cleanup/rollback policy, and post-mutation read-back through
   `get_layer_details` and `get_effect_details`.

## Safety Gates

- Current recipe is read-only advisory because the work requires coordinated
  null controller handling plus Corner Pin point expression or effect-property
  mutation that is not accepted as a single safe typed contract here.
- It requires normal Agent plan validation for inspection and gap reporting,
  and keeps checkpoint/edit-session protection as the high-risk guard before
  any future mutation. It does not require mutation permission, confirmation,
  idempotency, or post-mutation verification while it remains read-only.
- Do not infer null order, corner labels, point coordinates, target effects,
  expression targets, or coordinate spaces from screenshots, prior chat
  context, source-script behavior, layer names, or broad project traversal.
- Do not create, delete, duplicate, rename, reorder, parent, or trim layers; do
  not add effects, edit Corner Pin point values, write expressions, change
  keyframes, transforms, masks, sources, Project items, render queue items,
  files, or selection state.
- Do not use this recipe to mutate user nulls or effects, execute raw JSX, run
  generic script runners, or emulate source-exact selection side effects.

## Verification

- Pre-run evidence identifies the active comp, explicit target layer, candidate
  null controller layers, selected properties when relevant, and every reviewed
  Corner Pin-like effect target by concrete layer index/name and effect
  identity.
- `get_layer_details` evidence lists controller null layer positions, target
  layer identity, transform/expression state, locked/shy state, and parent state
  that a future mutating contract would need to bind.
- `get_effect_details` evidence lists the exact Corner Pin-like point property
  paths, current values, value shapes, and expression state that a future
  mutating contract would need to bind.
- The plan reports a `nullsToCornerPinsSpec` with proposed corner labels,
  null-controller mapping, target effect/property paths, coordinate-space
  assumptions, skipped-target reasons, and missing typed contracts.
- The plan explicitly states that no null layer creation, Corner Pin effect
  creation, effect-property write, expression/link write, parenting, selection
  mutation, raw ExtendScript, or script file execution is performed by the
  current recipe.
- Unsupported source-exact selected-layer ordering, automatic controller
  creation, Corner Pin effect creation, point-expression authoring, coordinate
  conversion, cleanup, effect-property mutation, and exact source JSX semantics
  are reported as typed-tool gaps.
