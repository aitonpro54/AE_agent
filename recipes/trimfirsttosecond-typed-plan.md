# Trim First To Second Typed Plan

## Goal

Inspect the active comp and selected layer timing for a requested
`trimFirstToSecond` workflow, then fail closed unless a reviewed layer-timing
mutation typed tool is available. Do not copy or execute source JSX.

## Applies When

- The user asks to run `trimFirstToSecond`, trim the first selected layer to the
  second selected layer, or make one selected layer end/start at another
  selected layer's timing boundary.
- The target layers are the current active-comp selected layers, and current
  layer timing evidence can be read before any decision.
- The plan can identify exactly which two selected layers are involved and show
  their `inPoint`, `outPoint`, `startTime`, names, and layer indices from typed
  evidence.
- Current typed tools are sufficient only for inspection and gap reporting. If
  the request requires mutating `inPoint`, `outPoint`, `startTime`, stretch,
  time remap, keyframes, source timing, or exact source JSX behavior, fail
  closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition identity, frame rate,
   duration, current time, and selected-layer count.
2. Run `get_selected_layers` to bind concrete selected layer indices and names
   from current evidence.
3. Fail closed when fewer than two layers are selected, more than two selected
   layers make the first/second target ambiguous, or the selected-layer order is
   not explicit in the typed evidence.
4. Run `get_layer_details` for the two candidate layers when detailed timing
   fields are needed or selected-layer evidence omits `inPoint`, `outPoint`, or
   `startTime`.
5. Report the reviewed trim intent and the observed timing boundary that would
   be needed by a future mutating tool.
6. Do not run raw ExtendScript or any generic script runner to perform the trim.
7. Fail closed with a typed-tool gap unless an accepted layer-timing mutation
   tool is present and can update only the reviewed timing field on the first
   selected layer with `verifyAfter:true`, idempotency, and post-mutation
   read-back.

## Safety Gates

- Current recipe is read-only advisory because no accepted mutating layer trim
  typed tool is available in this worktree.
- Requires normal Agent plan validation for inspection. It does not require
  mutation permission, confirmation, checkpoint, edit session, idempotency, or
  post-mutation verification while it remains read-only.
- A future mutating variant must require validated Agent plan, dry-run,
  explicit confirmation, `allowMutations:true`, idempotency, checkpoint or
  edit-session protection, and post-mutation read-back.
- Do not infer selected-layer order from layer stack order, names, prior chat
  context, or source-script assumptions when the typed evidence is ambiguous.
- Do not alter layer timing, split layers, ripple adjacent layers, move
  keyframes, change stretch/time-remap, relink sources, change comp duration,
  edit markers, mutate selection state, or use raw ExtendScript.

## Verification

- Pre-run evidence identifies the active comp and exactly two selected layers
  with concrete layer indices and names.
- Layer timing evidence lists `inPoint`, `outPoint`, and `startTime` for both
  selected layers, either from `get_selected_layers` or `get_layer_details`.
- The plan reports the intended trim boundary and explicitly marks the actual
  timing mutation as unsupported by current typed tools.
- No mutating layer timing step, raw ExtendScript, script file execution,
  keyframe shift, source relink, comp duration change, or selection mutation
  appears in the plan.
