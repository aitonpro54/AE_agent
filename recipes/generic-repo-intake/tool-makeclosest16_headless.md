# tool-makeclosest16_headless Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `makeClosest16_headless.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the active-composition size rounding idea into
`recipes/makeclosest16-headless-typed-plan.md`. No raw JSX is copied into the
product.

The safe supported path is a typed composition-property workflow: read the
active or explicit composition, compute reviewed 16-pixel-multiple target
dimensions, update only `width` and `height` with `set_comp_properties`, and
read the same composition back.

## Fail-Closed Scope

- Source JSX is not copied or executed.
- The imported recipe does not adapt the already accepted
  `makeclosest16-typed-plan` layer-position snapping behavior.
- Layer-position snapping, anchor/bounds snapping, recursive nested composition
  resizing, layer/source scaling, crop/reframe behavior, rendered-pixel
  preservation, expression/keyframe edits, template batch changes, raw
  ExtendScript, and broad project scans require separate typed-tool contracts.
- The detached child initially produced layer-position guidance; parent review
  corrected the accepted central recipe to match the source's active-comp
  width/height semantics before validation.

## Validation

- Parent importer/reducer accepted the candidate in run
  `fi-mc16h-r3-20260603`.
- Parent review corrected registry and recipe semantics to composition
  `width`/`height` mutation before final validation.
