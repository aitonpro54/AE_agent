# Force Composition Panel Refresh Typed Plan

Use this recipe when the task is to force a Composition panel refresh for one
explicit generated or otherwise reviewed composition.

## Scope

- This is a safe adaptation of the source behavior that toggles
  `CompItem.motionBlur` twice for a UI refresh side effect.
- The typed path requires one explicit composition target from
  `get_active_comp`, `get_comp_details`, or a generated `create_comp` result.
- The mutating step must be `refresh_comp_panel` with `compName` or
  `compItemIndex`, plus `expectedMotionBlur` when prior read-back is available.
- Follow with `get_comp_details` and semantic verification proving
  `motionBlur` was restored to its original value.

## Required Evidence

1. Read the target composition with `get_comp_details` and record identity,
   `motionBlur`, layer count, and work area.
2. Run `refresh_comp_panel` against the same explicit target. Use
   `expectedMotionBlur` from the prior read-back when available.
3. Read the composition again with `get_comp_details`.
4. Verify `refresh_comp_panel.postVerification.ok:true`,
   `transientToggled:true`, `motionBlurRestored:true`, unchanged comp identity,
   unchanged layer count, unchanged work area, and final read-back
   `motionBlur` equal to the original value.

## Fail Closed

- Do not use raw ExtendScript, `set_comp_properties`, layer `motionBlur`, or
  arbitrary property writes as substitutes.
- Do not target non-generated user assets without separate explicit review,
  checkpoint/rollback, and read-back.
- Do not claim source-exact active-viewer behavior, localized UI refresh
  fidelity, project-wide traversal, persistent settings, layer edits, render
  queue work, file I/O, or selection side effects.
