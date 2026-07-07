# AR Link Puppet Pins To Nulls Typed Plan

## Goal

Inspect a requested `AR_LinkPuppetPinsToNulls.jsx` workflow, bind explicit
Puppet pin and null-controller requirements from typed evidence, and fail closed
unless separate reviewed typed tools can create the controller nulls and link
pin position properties with read-back.

## Applies When

- The user asks to link Puppet pins to nulls, create null controllers for Puppet
  pins, or references `AR_LinkPuppetPinsToNulls.jsx`.
- Current active-comp, selected-layer, selected-property, layer, and Puppet
  effect evidence can be gathered before any mutation decision.
- The request can be classified against explicit `ADBE FreePin3` or reviewed
  Puppet-like effect evidence from `get_effect_details`.
- Current safe handling is read-only advisory: it may report the required
  `linkPuppetPinsToNullsSpec`, but it must not create null layers, assign
  expressions, change Puppet pin atoms, or parent layers with current tools.
- If source-exact selected Puppet pin traversal, automatic null creation,
  controller placement, expression authoring, user Puppet/DuIK mutation,
  project-wide scans, Alt-key behavior, or raw JSX is required, fail closed and
  require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity and current
   selected-layer/property context.
2. Run `get_selected_layers` and `get_selected_properties` when the request is
   selection-driven. Treat missing selected-property evidence as a typed-tool
   gap rather than inferring Puppet pins from layer names or screenshots.
3. Run `get_layer_details` for candidate layers when layer identity, existing
   parent/null/controller state, or expression state must be reviewed.
4. Run `get_effect_details` with bounded property depth/limit for every
   explicitly reviewed Puppet candidate and require concrete `ADBE FreePin3`
   effect identity plus pin atom/position property evidence before discussing a
   future link.
5. Build and report a reviewed `linkPuppetPinsToNullsSpec` only as an advisory
   object: comp identity, source layer index/name, Puppet effect identity, pin
   atom/property paths, proposed generated null names, controller placement
   assumptions, proposed expression/link behavior, and skipped-target reasons.
6. Fail closed if any target pin, owning layer, effect identity, property path,
   null naming/placement, coordinate-space conversion, existing expression
   state, or cleanup behavior is ambiguous.
7. Do not run `set_expression`, `set_property_value`, `set_layer_parent`,
   layer-creation tools, raw ExtendScript, or script runners from this recipe.
8. A future mutating variant must first add a narrow generated-null controller
   creation contract, exact Puppet pin position property binding, reviewed
   expression text or link writer, idempotency keys, checkpoint/edit-session
   protection, cleanup/rollback policy, and post-mutation read-back through
   `get_layer_details` and `get_effect_details`.

## Safety Gates

- Current recipe is read-only advisory because the work requires coordinated
  generated null-layer creation plus Puppet pin position expression/link
  mutation that is not accepted as a single safe typed contract here.
- It requires normal Agent plan validation for inspection and gap reporting. It
  does not require mutation permission, confirmation, checkpoint, edit-session,
  idempotency, or post-mutation verification while it remains read-only.
- Do not infer selected Puppet pins, pin coordinates, controller null names,
  expression targets, or coordinate spaces from screenshots, prior chat
  context, source-script behavior, layer names, or project-wide traversal.
- Do not create, delete, duplicate, rename, reorder, parent, or trim layers; do
  not edit Puppet pin atoms, expressions, keyframes, transforms, masks, effects,
  sources, Project items, render queue items, files, or selection state.
- Do not use this recipe to mutate user Puppet or DuIK effects, execute raw
  JSX, run generic script runners, or emulate source-exact selection side
  effects.

## Verification

- Pre-run evidence identifies the active comp, candidate selected layers and
  selected properties, and every reviewed Puppet effect target by concrete
  layer index/name and effect identity.
- `get_effect_details` evidence lists the exact Puppet pin atom and pin position
  property paths that a future mutating contract would need to bind.
- The plan reports a `linkPuppetPinsToNullsSpec` with proposed generated null
  names, placement/link assumptions, skipped-target reasons, and missing typed
  contracts.
- The plan explicitly states that no null layer creation, expression/link write,
  Puppet pin atom mutation, parenting, selection mutation, raw ExtendScript, or
  script file execution is performed by the current recipe.
- Unsupported source-exact selected pin traversal, automatic controller
  placement, coordinate-space conversion, user Puppet/DuIK mutation,
  project-wide scans, Alt-key behavior, cleanup, and exact source JSX semantics
  are reported as typed-tool gaps.
