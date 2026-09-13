# Set All Layer Labels To None Typed Plan

## Goal

Inspect the active composition for a request to set every layer label to
`None`, then fail closed until a reviewed typed tool exists for writing and
reading back layer label state. This recipe does not approximate layer labels
with selection changes, layer renames, switches, expressions, or property edits.

## Applies When

- The user asks to run `Set_All_Layer_Labels_To_None`, clear all layer labels,
  or set every active-comp layer label color to `None`.
- The target is the active composition and the affected set must come from
  current layer evidence rather than prior chat context, screenshots, or source
  script state.
- Current tools can safely inspect the comp and layer list, then report the
  typed-tool gap.
- If the request requires actual label mutation, source-exact UI behavior,
  selection side effects, or hidden layer-order semantics, fail closed and
  require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity, current time,
   duration, frame rate, layer count, and selected-layer count.
2. Run `list_layers` to bind current layer indices, names, and available layer
   metadata for every layer in the active comp.
3. Run `get_layer_details` for layers when current label-state evidence is
   available through typed read-back.
4. Build and disclose a reviewed `setAllLayerLabelsToNoneIntent` containing
   the active comp identity, total layer count, target layer indices, known
   label state when available, and skipped-target reasons for unavailable
   evidence.
5. Stop before mutation and report the typed-tool gap for setting
   `Layer.label` to `None` on all active-comp layers.
6. Require a future narrow writer such as `set_layer_label` or
   `set_layer_labels` before any real label mutation is accepted.

## Safety Gates

- Current adaptation is read-only and low risk.
- Requires validated Agent plan, but does not require confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, or
  post-mutation read-back because no mutation is performed.
- Do not use layer selection, layer renames, guide/shy/solo switches, effects,
  expressions, property values, source relinks, comp settings, render queue
  changes, or script execution as substitutes for `Layer.label` writes.
- Do not infer target layers or label state from screenshots, previous chat
  context, layer names, visual stacking order, or unavailable source-script
  state.
- A future mutating variant must require active-comp layer evidence, explicit
  target count, idempotency, checkpoint/edit-session protection,
  dry-run/confirmation gates, and post-mutation read-back of the exact layer
  label field.

## Verification

- Pre-run evidence identifies the active comp and total active-comp layer count.
- The reviewed `setAllLayerLabelsToNoneIntent` records every target layer index
  and known label state when typed read-back exposes it.
- The plan reports a `Layer.label` typed-tool gap and does not select layers,
  rename layers, change switches, edit expressions, change properties, relink
  sources, alter timing, update render queue items, or mutate the composition.
- Unsupported native selection side effects, hidden layer ordering, and exact
  source-script semantics are reported as typed-tool gaps instead of being
  approximated silently.
