# Milliseconds To Frames Typed Plan

## Goal

Convert a reviewed finite millisecond duration into frame units with an explicit frame rate and rounding policy, without copying source JSX or mutating the After Effects project.

## Applies When

- The user asks to convert milliseconds to frames, ms to frames, a duration in milliseconds to frame count, or the frame index equivalent of a millisecond duration.
- The frame rate is explicitly provided or can be read from the active composition with `get_active_comp`.
- The millisecond value is finite and non-negative unless the user explicitly asks for a signed offset calculation.
- The rounding policy is explicit: `exact`, `round`, `floor`, or `ceil`.
- If the user needs drop-frame timecode, feet+frames, frame numbering offsets, comp start-frame offsets, display-start-time offsets, keyframe edits, layer timing edits, comp frame-rate mutation, render queue changes, or exact source UI semantics, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Bind `milliseconds` from the user request as a finite number.
2. Bind `frameRate` from the user request, or run `get_active_comp` only when the request asks to use the current active composition frame rate.
3. Fail closed if `frameRate` is missing, zero, negative, non-finite, or ambiguous.
4. Choose and disclose `roundingMode`. Use `exact` only when a fractional frame result is acceptable; otherwise use the user-requested `round`, `floor`, or `ceil` policy.
5. Compute `exactFrames = milliseconds * frameRate / 1000`.
6. Compute `reportedFrames` from `exactFrames` according to `roundingMode`.
7. Report the formula, `milliseconds`, `frameRate`, `roundingMode`, `exactFrames`, and `reportedFrames`.
8. Do not run raw script execution or mutate project state for this utility conversion.

## Safety Gates

- Read-only utility workflow.
- Requires normal Agent plan validation when used inside a larger plan.
- Does not require explicit mutation confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, or post-mutation read-back.
- Preserve layers, properties, keyframes, expressions, comp settings, render queue items, project items, selection state, and project files.
- Do not infer frame rate from screenshots, prior chat context, UI defaults, render settings, footage interpretation, or unavailable source-script state.
- Do not use this recipe for timecode parsing, frame-to-time conversion, retiming, marker placement, keyframe generation, layer trimming, work-area changes, comp frame-rate edits, or raw ExtendScript.

## Verification

- The plan records a finite `milliseconds` input and a finite positive `frameRate`.
- If the frame rate comes from After Effects, `get_active_comp` evidence identifies the active comp and frame rate.
- The result uses `exactFrames = milliseconds * frameRate / 1000`.
- The reported frame value matches the reviewed `roundingMode`.
- The plan reports unsupported drop-frame timecode, offsets, retiming, mutation, and exact source UI semantics as typed-tool gaps.
