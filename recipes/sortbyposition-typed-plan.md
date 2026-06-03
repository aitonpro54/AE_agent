# Sort By Position Typed Plan

## Goal

Inspect selected layers and produce a reviewed position-based ordering proposal
for a requested `sortByPosition` workflow, then fail closed unless a reviewed
layer stack reordering typed tool is available. Do not copy or execute source
JSX.

## Applies When

- The user asks to run `sortByPosition`, sort selected layers by Position, or
  reorder selected layers based on their transform Position values.
- The target layers are the current active-comp selected layers, and current
  layer identity plus Position evidence can be read before any decision.
- The plan can identify at least two selected layers with concrete layer
  indices, names, and numeric transform Position values from typed evidence.
- The intended comparator is explicit in the plan, such as x ascending, y
  ascending, y then x, or another reviewed axis/order policy.
- Current typed tools are sufficient only for inspection and gap reporting. If
  the request requires changing layer stack order, preserving exact source JSX
  comparator behavior, mutating selection state, or handling ambiguous
  coordinate-space semantics, fail closed and require a separate typed-tool
  contract.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition identity, frame rate,
   duration, current time, and selected-layer count.
2. Run `get_selected_layers` to bind concrete selected layer indices and names
   from current evidence.
3. Fail closed when fewer than two layers are selected, selected layers are not
   identifiable, or the requested comparator axis/order is ambiguous.
4. Run `get_layer_details` for each selected layer when selected-layer evidence
   omits transform Position, dimensionality, parent/3D state, or sample-time
   context.
5. Fail closed if any target lacks a numeric Position array, if dimensionality
   is mixed, if parent/world-space conversion is required, or if separated
   dimensions make the ordering ambiguous.
6. Compute a proposed sorted order from the reviewed comparator and the cited
   Position values. Include layer index, name, Position, comparator key, and
   current stack order for every selected layer.
7. Report the proposed order and the missing layer-reordering typed-tool
   contract. Do not mutate the project while only read tools are available.
8. Do not run raw ExtendScript or any generic script runner to perform the
   reorder.
9. Fail closed unless an accepted layer stack reordering typed tool is present
   and can reorder only the reviewed selected-layer set with `verifyAfter:true`,
   idempotency, checkpoint or edit-session protection, and post-mutation
   read-back.

## Safety Gates

- Current recipe is read-only advisory because no accepted mutating layer stack
  reordering typed tool is available in this worktree.
- Requires normal Agent plan validation for inspection. It does not require
  mutation permission, confirmation, checkpoint, edit session, idempotency, or
  post-mutation verification while it remains read-only.
- A future mutating variant must require validated Agent plan, dry-run,
  explicit confirmation, `allowMutations:true`, idempotency, checkpoint or
  edit-session protection, and post-mutation read-back.
- Do not infer comparator policy from source-script assumptions, prior chat
  context, layer names, or current stack order when the user intent is
  ambiguous.
- Do not alter layer order, selection state, layer names, sources, timing,
  effects, masks, parenting, expressions, keyframes, transform values, project
  items, or render queue items with current read-only tools.

## Verification

- Pre-run evidence identifies the active comp and at least two selected layers
  with concrete layer indices and names.
- Layer evidence lists numeric transform Position values for every selected
  layer used in the proposed ordering.
- The plan states the reviewed comparator policy and shows the computed order
  without mutating layer stack order.
- The plan explicitly marks actual layer reordering as unsupported by current
  typed tools.
- No raw ExtendScript, script file execution, generic script runner, selection
  mutation, layer transform mutation, source relink, comp mutation, or render
  queue mutation appears in the plan.
