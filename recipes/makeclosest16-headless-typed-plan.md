# Make Closest 16 Headless Typed Plan

## Goal

Resize the verified active composition width and height to reviewed
16-pixel-multiple values using existing typed bridge tools, without copying or
executing source JSX.

## Applies When

- The user asks to run `makeClosest16_headless`, resize the active composition
  to the closest multiple of 16, or make the current comp dimensions divisible
  by 16 without opening a UI.
- The target is the current active composition, or one explicit composition
  that is read before mutation.
- The accepted adaptation is limited to composition `width` and `height`
  updates through `set_comp_properties`.
- The plan can show the current width, current height, reviewed rounding policy,
  `targetWidth`, and `targetHeight` before confirmation.
- If the user needs layer-position snapping, anchor or bounds snapping,
  recursive nested composition resizing, layer/source scaling, crop/reframe
  behavior, expression/keyframe edits, rendered pixel preservation, source-exact
  UI behavior, or raw JSX execution, fail closed and require a separate
  typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to establish the active composition identity.
2. Run `get_comp_details` for the same composition and record current `width`,
   `height`, `pixelAspect`, duration, frame rate, background color, layer count,
   work area, and comp item identity before mutation.
3. Compute `targetWidth` and `targetHeight` using the reviewed
   `nearest16HeadlessPolicy`: values already divisible by 16 stay unchanged;
   otherwise a remainder below 4 rounds down to the previous multiple of 16,
   and a remainder of 4 or greater rounds up to the next multiple of 16.
4. Fail closed when the current dimensions are missing, non-finite, outside
   supported AE composition bounds, or when rounding down would produce a
   non-positive dimension.
5. Show `currentWidth`, `currentHeight`, `targetWidth`, `targetHeight`, and
   the rounding policy in the dry-run evidence.
6. Run one `set_comp_properties` call against only the verified composition,
   passing only changed `width` and/or `height`, `verifyAfter:true`, and a
   stable `idempotencyKeyTemplate`.
7. Run `get_comp_details` again for the same composition and compare the new
   width/height plus unchanged pixel aspect, duration, frame rate, background
   color, layer count, work area, and comp item identity.
8. Fail closed instead of using raw script execution when exact source JSX
   execution or unsupported resize side effects are required.

## Safety Gates

- Mutating composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Require current active-comp or explicit comp evidence before binding the
  target composition.
- Mutate only the verified composition `width` and `height`; do not change
  layer order, layer timing, layer sources, transforms, masks, effects,
  expressions, keyframes, project items, render queue items, work area,
  duration, frame rate, pixel aspect, or background color.
- Treat recursive/nested comp resizing and rendered-pixel preservation as
  separate high-risk contracts.
- Do not use this recipe for layer-position snapping, anchor or bounds
  snapping, source relinking, template batch changes, project-wide scans, crop
  decisions, scale-to-fit operations, or raw ExtendScript.

## Verification

- The plan reads the target composition before any mutation.
- Pre-run `get_comp_details` records current width and height plus unchanged
  structural composition fields.
- Dry-run evidence lists the rounding policy and computed target dimensions.
- The mutating step uses exactly one `set_comp_properties` call with only
  `width` and/or `height` for the verified composition.
- Post-run `get_comp_details` shows the requested 16-pixel-multiple dimensions
  on the same composition and unchanged pixel aspect, duration, frame rate,
  background color, layer count, work area, and comp item identity.
- Layer-position snapping, recursive nested resizing, layer/source scaling,
  crop/reframe behavior, expression/keyframe edits, rendered pixel preservation,
  source-exact UI behavior, and raw JSX execution are reported as typed-tool
  gaps.
