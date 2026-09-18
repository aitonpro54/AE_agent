# Text Layer Justification Typed Plan

## Goal

Set paragraph justification on a generated or explicitly reviewed text layer
through `create_text_layer` or `update_text_layer`, without copying source JSX
or exposing arbitrary TextDocument mutation.

## Applies When

- The user asks to create a left, center, or right aligned text layer.
- The user asks to change an existing reviewed text layer to left, center, or
  right paragraph justification.
- Current typed evidence identifies the target composition and, for updates,
  the exact text layer index/name.

## Plan Pattern

1. Bind the target composition with `get_active_comp`, `get_comp_details`, or an
   explicit `compName` / `compItemIndex`.
2. Normalize the reviewed alignment to one of `left`, `center`, or `right`.
3. For new generated text, run `create_text_layer` with explicit text, generated
   name when available, covered styling/timing fields, and `justification`.
4. For an existing reviewed text layer, run `get_layer_details` first, then
   `update_text_layer` with `layerIndex` and `justification`.
5. Run `get_layer_details` after mutation and verify `text.justification`
   matches the requested value.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Do not infer the text layer from prior chat context, screenshots, or untyped
  selection state.
- Do not mutate non-generated user text layers without explicit review,
  approval, and rollback protection.
- Do not use raw ExtendScript, temp-args files, broad layer scans, arbitrary
  TextDocument fields, or render queue work.

## Fail-Closed Scope

- Full justify, vertical text, paragraph box dimensions, baseline/anchor
  inference, source-exact stack placement, selection side effects, text
  animators, expression/keyframe edits, and arbitrary TextDocument fields
  require separate typed-tool contracts.
- Font-family creation-time assignment through `create_text_layer` remains out
  of scope; use `update_text_layer` with explicit `font` only after the
  generated layer identity is known and read back.
- Source temp-args wrappers, filesystem behavior, JSON output formatting, and
  hidden source defaults are not reproduced.

## Verification

- Dry-run evidence lists the target comp, text layer identity, reviewed
  justification, and unsupported TextDocument/source-exact behavior.
- Mutation uses only `create_text_layer` or `update_text_layer` with
  `justification:left|center|right`.
- Post-run `get_layer_details` shows the same generated/reviewed layer with
  matching `text.justification`.
- The plan records unsupported full-justify, font-creation, wrapper, selection,
  and source-exact behavior as typed-tool gaps instead of silently guessing.
