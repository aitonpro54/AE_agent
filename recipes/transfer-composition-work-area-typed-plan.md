# Transfer Composition Work Area Typed Plan

## Goal

Transfer reviewed `workAreaStart` and `workAreaDuration` values from one
composition to another through typed bridge tools, without using persistent
`app.settings`, keyboard-state branching, or raw ExtendScript.

## Applies When

- The user asks to copy, paste, transfer, or apply a composition work area from
  one composition to another.
- A safe adaptation is acceptable: read a concrete source composition work area
  with `get_comp_details`, then apply the same start and duration to a concrete
  target composition with `set_comp_work_area`.
- Source and target composition identities are explicit or can be bound from
  current active-comp evidence before mutation.
- The copied work area is finite, non-negative, has a positive duration, and
  fits within the target composition duration.
- If the task requires source-exact persistent clipboard storage, `Alt` key
  branching, cross-session settings, hidden native state, or exact source JSX
  behavior, fail closed and request a separate contract.

## Plan Pattern

1. Run `get_active_comp` only when the request uses the current active
   composition as the source or target; otherwise bind explicit comp names or
   item indices from current typed evidence.
2. Run `get_comp_details` for the source composition and record
   `workAreaStart`, `workAreaDuration`, `duration`, `frameRate`, width, height,
   background color, layer count, and composition identity.
3. Run `get_comp_details` for the target composition and record the same
   structural fields before mutation.
4. Review the copied start and duration against the target composition duration
   and frame rate. Fail closed if either value is missing, non-finite, negative
   where unsupported, non-positive for duration, outside the target comp bounds,
   or depends on marker/current-time/selection inference.
5. Run `set_comp_work_area` once against only the verified target composition
   with the copied `start`, copied `duration`, `verifyAfter:true`, and a stable
   `idempotencyKeyTemplate`.
6. Run `get_comp_details` again for the target composition and compare
   `workAreaStart`, `workAreaDuration`, duration, frame rate, width, height,
   background color, layer count, and composition identity.
7. When the source and target are different comps, optionally run
   `get_comp_details` for the source again and confirm its work area and
   structural fields were not changed.

## Safety Gates

- Mutating composition work-area workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Mutate only the verified target composition `workAreaStart` and
  `workAreaDuration`; do not change duration, frame rate, background color,
  layer timing, layer sources, keyframes, expressions, markers, render queue
  items, project items, or persistent settings.
- Do not implement persistent `app.settings` storage, cross-session clipboard
  state, `ScriptUI.environment.keyboardState.altKey` branching, native undo
  grouping semantics, or raw script execution.

## Verification

- Pre-run source `get_comp_details` evidence shows the exact copied
  `workAreaStart` and `workAreaDuration`.
- Pre-run target `get_comp_details` evidence shows the target comp duration and
  frame rate used for bounds and frame-alignment review.
- Dry-run evidence lists the copied work-area start, copied duration, target
  bounds check, and why no settings clipboard, keyboard shortcut state, marker
  inference, layer retiming, duration change, or source JSX execution is being
  performed.
- The mutating step uses exactly one `set_comp_work_area` call for the verified
  target composition with only the reviewed start and duration.
- Post-run target `get_comp_details` shows the copied `workAreaStart` and
  `workAreaDuration` with unchanged duration, frame rate, width, height,
  background color, layer count, and comp identity.
- Unsupported persistent settings clipboard, `Alt` key paste branching,
  cross-session state, marker-derived work areas, current-time inference,
  layer retiming, duration changes, and exact source JSX semantics are reported
  as typed-tool gaps.
