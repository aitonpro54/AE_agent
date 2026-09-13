# Project Timecode And Start Frames Typed Plan

## Goal

Set the AE project frame numbering mode and native display start frame on
explicit generated or reviewed compositions through typed tools.

## Applies When

- The user asks to toggle project timecode/start-frame numbering between the
  source modes where composition frame numbers start at 0 or 1.
- A safe adaptation is acceptable: Alt-key branching is replaced with an
  explicit reviewed final `framesCountType`.
- Composition targets are generated/temp or explicitly reviewed before
  mutation, not discovered through a broad all-project scan.
- The workflow can read project frame numbering with `get_project_info`, update
  it with `set_project_frames_count_type`, read it back, then update each
  explicit composition with `set_comp_properties(displayStartFrame:<integer>)`
  and read the same compositions back.
- Source-exact all-project `CompItem` traversal, ScriptUI keyboard state,
  non-generated user comp batch mutation, display-start-time fallback semantics,
  render queue changes, footage interpretation changes, raw ExtendScript, and
  source JSX copy remain out of scope.

## Plan Pattern

1. Bind every target composition with `create_comp`, `find_project_items`, or
   `get_comp_details` evidence. Prefer generated composition fixtures for live
   proof.
2. Run `get_project_info` before mutation and record `framesCountType` and
   `framesCountStartFrame`.
3. Run `get_comp_details` before mutation for every target and record
   `itemIndex`, name, `displayStartFrame`, `displayStartTime`, frame rate,
   duration, dimensions, work area, and layer count.
4. Normalize the requested final mode to `FC_START_0` or `FC_START_1`. Use
   explicit user or plan intent; do not infer from Alt-key state.
5. Run `set_project_frames_count_type` with the reviewed `framesCountType`.
6. Run `get_project_info` again and verify the requested frame-count mode.
7. Run one `set_comp_properties` call per target composition with only
   `displayStartFrame`, `verifyAfter:true`, and a stable idempotency key when
   used in normal Agent planning.
8. Run `get_comp_details` after each composition mutation and compare native
   `displayStartFrame` plus unchanged identity, dimensions, duration, frame
   rate, layer count, and work area.
9. Fail closed instead of using raw script execution when the request requires
   all-project traversal, Project panel selection, Alt-key behavior,
   non-generated user asset mutation, `displayStartTime` fallback, render queue
   changes, footage interpretation, or exact source JSX semantics.

## Safety Gates

- Mutating project/composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Mutate only the project `framesCountType` and native `displayStartFrame` on
  explicitly bound composition items.
- Preserve comp identity, name, dimensions, duration, frame rate, background
  color, work area, layer stack, layer sources, effects, markers, render queue,
  project item folders, and non-target project items.
- Treat broad "all comps" requests as unsupported unless a separate reviewed
  generated-only batch contract defines the exact generated target set and
  cleanup policy.

## Verification

- Pre-run `get_project_info` identifies the current project frame-count mode.
- `set_project_frames_count_type` reports `updatedFields:["framesCountType"]`
  and `postVerification.ok:true`.
- Post-run `get_project_info` shows the requested `framesCountType` and
  `framesCountStartFrame`.
- Pre-run `get_comp_details` identifies every concrete target comp and its
  current native `displayStartFrame`.
- Each `set_comp_properties` result reports
  `updatedFields:["displayStartFrame"]` and `postVerification.ok:true`.
- Post-run `get_comp_details` shows the requested native integer
  `displayStartFrame` on the same composition.
- Post-run read-back shows unchanged width, height, duration, frame rate,
  background color, layer count, work area, and comp item identity.
- The plan reports all-project traversal, Alt-key branching,
  `displayStartTime` fallback, non-generated user comp mutation, render queue
  changes, footage interpretation, raw ExtendScript, and exact source JSX
  behavior as unsupported by this safe adaptation.
