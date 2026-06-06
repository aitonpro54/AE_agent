# Frame Navigator Typed Plan

## Goal

Move one explicit composition current time indicator to a reviewed target time using `set_comp_current_time`, without copying source JSX or changing layer timing, work area, markers, keyframes, render queue items, files, or project structure.

## Applies When

- The user asks to move the CTI, playhead, current time, or frame navigator to a specific time or frame in one composition.
- The target composition is explicit from current `get_active_comp` or `get_comp_details` evidence.
- The target is a finite seconds value or a reviewed zero-based frame with a finite positive frame rate.
- The requested target is within the composition duration, or the user explicitly accepts `clampToDuration:true` and the clamped value is disclosed.
- If the user needs layer trimming, alignment, keyframe insertion, marker placement, work-area changes, timecode/display-start offsets, source-exact ScriptUI button behavior, or broad selected-comp inference, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` or `get_comp_details` to bind the explicit composition identity, duration, frame rate, display start time, current `time`, and layer count.
2. Convert a frame target only with a reviewed `frameRate`, preferably from the inspected comp; interpret the frame as zero-based comp-start frame unless the user explicitly asks for a different timecode policy.
3. Run one `set_comp_current_time` step with `compItemIndex` or `compName`, exactly one of `time` or `frame`, optional `expectedCurrentTime`, and `openInViewer:true` only when the user needs the viewer CTI to move.
4. Run `get_comp_details` for the same comp and verify `time` equals the requested or clamped target.
5. Report unsupported layer timing, work-area, marker, keyframe, timecode-offset, source-exact UI, and raw ExtendScript semantics as typed-tool gaps.

## Safety Gates

- Mutating composition UI/timeline state, so normal Agent plan validation, mutation confirmation, idempotency, and edit-session protection apply.
- Require one explicit comp target; do not infer a target from screenshots, previous chat, project item names, or broad project scans.
- Use `expectedCurrentTime` when the request depends on a known starting CTI.
- Default bounds policy is fail-closed when the target is outside `[0, duration]`; use clamping only when explicitly reviewed.
- Use a stable idempotency key for the same comp target and target time when the plan runner exposes one.
- Post-mutation read-back through `get_comp_details.time` is required.
- Do not substitute `set_comp_work_area`, `align_layers_to_time`, `set_layer_time_range`, marker tools, keyframe tools, or raw ExtendScript.

## Verification

- Pre-run evidence identifies the target comp and current `time`.
- `set_comp_current_time` returns `before.time`, `after.time`, requested target, bounds policy, and structural unchanged evidence.
- Post-run `get_comp_details.time` equals the requested or clamped target for the same comp.
- `duration`, `frameRate`, dimensions, work area, and layer count remain unchanged.
- Unsupported exact source ScriptUI behavior and timecode/display-start offset semantics are reported as typed-tool gaps.
