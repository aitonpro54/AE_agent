# New Trimmed Null Typed Plan

## Goal

Inspect the active comp and selected layer timing for a requested
`newTrimmedNull` workflow, especially the top selected layer by layer index,
then fail closed unless reviewed typed tools for generated null-layer creation,
layer timing assignment, label assignment, and parenting are available. Do not
copy or execute source JSX.

## Applies When

- The user asks to run `newTrimmedNull`, create a new trimmed null, or create a
  null layer whose timing should be derived from the highest/top selected layer.
- The target context is the current active composition, and current selected
  layer timing evidence can be read before any creation or trim decision.
- The plan can identify the selected layer set with concrete layer indices,
  names, `inPoint`, `outPoint`, `startTime`, `label`, and parent evidence from
  typed tools.
- Current typed tools are sufficient only for inspection and gap reporting. If
  the request requires creating a native null layer, setting a new layer's
  in/out range, assigning labels, parenting selected layers, preserving
  source-exact layer ordering, or reproducing native UI side effects, fail
  closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition identity, frame rate,
   duration, current time, and selected-layer count.
2. Run `get_selected_layers` to bind concrete selected layer indices and names
   from current evidence.
3. Fail closed when no active comp exists, no layers are selected, selected
   layers are not identifiable, or the request depends on hidden native UI
   selection order that typed tools did not expose.
4. Sort or identify the top selected layer by explicit `layerIndex` evidence
   only; fail closed when selected-layer order is unavailable or ambiguous.
5. Run `get_layer_details` for selected layers when detailed timing, label, or
   parenting evidence is needed or selected-layer evidence omits `inPoint`,
   `outPoint`, `startTime`, `label`, locked state, shy state, parent state, or
   source context.
6. Compute and report the reviewed generated-null spec that a future mutating
   tool would need: one generated null before the top selected layer, with
   `startTime`, `inPoint`, `outPoint`, and label copied from that top selected
   layer, plus reviewed parenting of the selected layers to the generated null.
7. Report the missing generated null-layer creation, label, timing-assignment,
   ordering, and parenting typed tool contracts. Do not mutate the project while
   only read tools are available.
8. Do not run raw ExtendScript or any generic script runner to create or trim
   the null layer.
9. Fail closed unless an accepted typed tool can create only one generated null
   layer with explicit name, top-layer timing and label assignment,
   `verifyAfter:true`, idempotency, checkpoint or edit-session protection,
   parenting read-back, and post-mutation read-back.

## Safety Gates

- Current recipe is read-only advisory because no accepted typed tool for
  generated null-layer creation plus trimmed timing assignment is available in
  this worktree.
- Requires normal Agent plan validation for inspection. It does not require
  mutation permission, confirmation, checkpoint, edit session, idempotency, or
  post-mutation verification while it remains read-only.
- A future mutating variant must require validated Agent plan, dry-run,
  explicit confirmation, `allowMutations:true`, idempotency, checkpoint or
  edit-session protection, and post-mutation read-back.
- Do not infer selected-layer timing from screenshots, prior chat context, layer
  names, source names, or source-script assumptions when typed evidence is
  ambiguous.
- Do not create null layers, set layer timing or labels, rename or reorder
  layers, alter selection state, parent layers, relink sources, edit effects,
  masks, expressions, keyframes, project items, render queue items, or use raw
  ExtendScript with current read-only tools.

## Verification

- Pre-run evidence identifies the active comp, every selected layer, and the
  selected layer chosen as the top selected layer by explicit layer index.
- Layer evidence lists `inPoint`, `outPoint`, `startTime`, `label`, and parent
  state for every selected layer used to review the proposed generated null.
- The plan reports the proposed generated null timing/label/parenting spec and
  explicitly marks actual null-layer creation, label assignment, timing
  assignment, ordering, and parenting as unsupported by current typed tools.
- No mutating layer creation, layer timing step, raw ExtendScript, script file
  execution, selection mutation, layer reorder, source relink, comp mutation, or
  render queue mutation appears in the plan.
