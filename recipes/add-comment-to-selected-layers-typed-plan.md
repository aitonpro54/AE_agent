# Add Comment To Selected Layers Typed Plan

## Goal

Inspect the active composition and selected layers for a request to add
`Layer.comment` metadata, then fail closed until a reviewed typed tool exists
for writing layer comments. This recipe does not convert layer comments into
markers, names, labels, expressions, or other nearby metadata.

## Applies When

- The user asks to run `Add_Comment_To_Selected_Layers`, add comments to
  selected layers, or write the same reviewed layer comment to the current
  selected active-comp layers.
- The target is the active composition and the affected layers must come from
  current `get_selected_layers` evidence.
- The requested comment text is explicit, reviewed, and intended for
  `Layer.comment` metadata rather than marker comments or layer names.
- Current tools can safely inspect the selection and report the typed-tool gap.
- If the request requires actual comment mutation, source-exact UI behavior, a
  prompt dialog, selection side effects, or hidden selection-order semantics,
  fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity, current time,
   duration, frame rate, layer count, and selected-layer count.
2. Run `get_selected_layers` to bind concrete selected layer indices and names.
3. Run `get_layer_details` for selected layers when current layer metadata or
   existing comment evidence is available through typed read-back.
4. Build and disclose a reviewed `layerCommentIntent` containing the exact
   requested `Layer.comment` text, selected layer indices, and skipped-target
   reasons.
5. Stop before mutation and report the typed-tool gap for setting
   `Layer.comment` on selected layers.
6. Require a future narrow writer such as `set_layer_comment` before any real
   comment mutation is accepted.

## Safety Gates

- Current adaptation is read-only and low risk.
- Requires validated Agent plan, but does not require confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, or
  post-mutation read-back because no mutation is performed.
- Do not use marker comments, layer renames, labels, effects, expressions,
  property values, source relinks, comp settings, render queue changes, or
  script execution as substitutes for `Layer.comment`.
- Do not infer selected layers from screenshots, previous chat context, layer
  names, visual stacking order, or unavailable source-script state.
- A future mutating variant must require selected-layer evidence, explicit
  reviewed comment text, idempotency, checkpoint/edit-session protection,
  dry-run/confirmation gates, and post-mutation read-back of the exact layer
  comment field.

## Verification

- Pre-run evidence identifies the active comp and selected layers with concrete
  layer indices and names.
- The reviewed `layerCommentIntent` records the exact `Layer.comment` text and
  selected target layers.
- The plan reports a `Layer.comment` typed-tool gap and does not create marker
  comments, rename layers, change labels, edit expressions, change properties,
  relink sources, alter timing, update render queue items, or mutate the
  composition.
- Unsupported prompt dialog behavior, native selection side effects, hidden
  selection ordering, and exact source-script semantics are reported as typed
  gaps instead of being approximated silently.
