# Full Intaker Unsafe Skip Triage

Date: 2026-05-31
Source ledger: `.codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json`

## Summary

The `blocked_or_skipped` backlog contains 75 entries, all classified as
`unsafe_skip_tool_gap`. This means they were not imported because the current typed
tool and proof-lane surface did not provide a narrow enough safe path, not because
the source scripts are permanently useless.

Recommended order:

1. `safe-next-generated-only`: 28 entries. Start here with one narrow family at a
   time, beginning with Selection or Markers.
2. `needs-new-typed-tool-contract`: 32 entries. Useful backlog, but each family
   needs an explicit bridge contract, generated-only fixture, read-back, and
   semantic verification before import retry.
3. `approval-gated-or-last`: 15 entries. Defer until file I/O, render queue,
   external plugin, cleanup, proxy, or user-environment assumptions have explicit
   approval and safety gates.

## Safe Next Generated-Only

These should be reviewed first because they can plausibly be proven on generated
comps/layers/items with read-back and no user assets.

- Compositions:
  - `tool-compositions-set-work-area-to-markers`
  - `tool-compositions-transfer-composition-work-area`
- Layers:
  - `tool-layers-add-comment-to-selected-layers`
  - `tool-layers-hard-solo-layers`
  - `tool-layers-lock-all-layers`
  - `tool-layers-reset-selected-layer-labels`
  - `tool-layers-set-all-layer-labels-to-none`
  - `tool-layers-set-all-track-matte-labels`
  - `tool-layers-toggle-difference-blend-mode`
  - `tool-layers-unlock-all-layers`
- Markers:
  - `tool-markers-add-markers-at-out-points`
  - `tool-markers-add-markers-at-work-area`
  - `tool-markers-copy-composition-markers-to-layer`
  - `tool-markers-copy-layer-markers-to-composition`
- Selection:
  - `tool-selection-layer-selection-set`
  - `tool-selection-select-all-children`
  - `tool-selection-select-disabled-layers`
  - `tool-selection-select-guide-layers`
  - `tool-selection-select-layers-below-label`
  - `tool-selection-select-non-null-layers`
  - `tool-selection-select-parent-layer`
  - `tool-selection-select-random-layers`
  - `tool-selection-select-shape-layers`
  - `tool-selection-select-text-layers`
  - `tool-selection-select-unparented-layers`
- Utilities:
  - `tool-utilities-alert-selected-layer-index`
  - `tool-utilities-frame-navigator`
  - `tool-utilities-milliseconds-to-frames`

First proposed lane: `selection-generated-only`, covering generated layer setup,
selection mutation, read-back via `get_selected_layers`/`get_layer_details`, and
deterministic semantics for random selection.

Second proposed lane: `marker-transfer-generated-only`, covering generated markers
on comps/layers, copy/add operations, and read-back through marker details.

## Needs New Typed-Tool Contract

These look valuable, but they should not be retried until the project has a narrow
tool contract and proof lane for the operation family.

- Compositions:
  - `tool-compositions-force-composition-panel-refresh`
  - `tool-compositions-rename-composition-to-file-name`
- Layers:
  - `tool-layers-add-3d-break`
  - `tool-layers-add-fill-with-color-cycle`
  - `tool-layers-connect-two-layers-with-a-line`
  - `tool-layers-create-shapes-from-text`
  - `tool-layers-parent-closest-layers`
  - `tool-layers-parent-opacity`
  - `tool-layers-parent-selected-layers-to-layers-below`
  - `tool-layers-replace-grid-rig-control`
  - `tool-layers-reset-layer-names`
  - `tool-layers-set-track-matte-to-above`
  - `tool-layers-stick-effect-to-layer`
  - `tool-layers-toggle-puppet-pins-as-guide-layers`
  - `tool-layers-toggle-specific-effects`
- Lottie:
  - `tool-lottie-convert-drop-shadows-for-lottie`
  - `tool-lottie-prepare-layer-out-points-for-lottie`
- Project:
  - `tool-project-add-selection-to-new-folder`
  - `tool-project-reset-imported-item-names`
  - `tool-project-set-all-item-labels-to-none`
  - `tool-project-toggle-preserve-nested-frame-rate`
  - `tool-project-toggle-timecode-and-start-frames`
- Properties:
  - `tool-properties-add-properties-to-essential-graphics`
  - `tool-properties-estimate-path-length`
  - `tool-properties-expose-essential-properties`
  - `tool-properties-flip-path`
  - `tool-properties-increase-all-pin-sizes`
  - `tool-properties-move-parametric-anchor-point`
  - `tool-properties-remove-disabled-strokes`
  - `tool-properties-rename-selected-properties`
  - `tool-properties-toggle-puppet-on-transparent`
  - `tool-properties-toggle-puppet-pin-types`

Likely contract families:

- `layer-parenting-and-matte-generated-only`
- `layer-metadata-generated-only`
- `shape-path-generated-only`
- `essential-graphics-generated-only`
- `project-item-metadata-generated-only`
- `lottie-prep-generated-only`

## Approval-Gated Or Last

These should remain blocked until the user explicitly approves the relevant risk
class and the bridge has matching gates. Many involve file I/O, render queue, proxy
state, cleanup/deletion, external plugin naming assumptions, or host OS actions.

- Compositions:
  - `tool-compositions-save-frame-as-png`
- Layers:
  - `tool-layers-convert-srt-to-text-layers`
  - `tool-layers-create-text-layers-from-file`
  - `tool-layers-match-layers-to-newton-layers`
  - `tool-layers-rename-puppet-pins-for-duik`
- Project:
  - `tool-project-add-folder-to-render-queue`
  - `tool-project-clean-render-queue`
  - `tool-project-clean-selected-folder`
  - `tool-project-clean-up-overlord-folder`
  - `tool-project-export-text-to-file`
  - `tool-project-manually-render-png-sequence`
  - `tool-project-remove-all-proxies`
  - `tool-project-reveal-project-file`
  - `tool-project-set-proxies-from-folder`
- Properties:
  - `tool-properties-export-path-points`

## Next Review Slice

Do not retry all 75. Pick one safe family and prove it end to end:

1. Define or reuse the narrow typed tools.
2. Add a generated-only proof lane with read-back and semantic verification.
3. Reclassify only matching candidates.
4. Run the normal bounded Full Intaker path with `max-items 1` / scoped ids.

Best first slice: Selection, because it has 11 candidates, no file I/O, no render
queue, no third-party plugin dependency, and clear read-back semantics.
