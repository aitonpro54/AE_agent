# tool-compositions-transfer-composition-work-area Intake Note

## Source

- Repository: `https://github.com/kyletmartinez/after-effects-scripts`
- Source path: `Compositions/Transfer_Composition_Work_Area.jsx`
- Candidate id: `tool-compositions-transfer-composition-work-area`
- License: review required by the parent importer before any source-derived
  promotion.

## Adaptation

This intake adapts only the work-area transfer intent into
`recipes/transfer-composition-work-area-typed-plan.md`. No raw JSX is copied
into the product.

The safe supported path is a typed mutating recipe: read the source composition
with `get_comp_details`, copy the reviewed `workAreaStart` and
`workAreaDuration` values into an explicit target composition with
`set_comp_work_area`, then read the target back with `get_comp_details`.

## Fail-Closed Scope

- Persistent `app.settings.saveSetting/getSetting` clipboard behavior is not
  reproduced.
- `ScriptUI.environment.keyboardState.altKey` copy/paste branching, hidden
  cross-session state, native undo grouping details, raw ExtendScript
  execution, marker-derived work-area inference, current-time inference, layer
  retiming, duration changes, render queue changes, and exact source JSX
  semantics require separate reviewed contracts.
- The source composition is read-only for this recipe; only the verified target
  composition work area may be mutated after normal Agent mutation gates pass.

## Validation

- Parent reducer accepts this candidate only as an advisory typed-plan
  adaptation over existing `get_comp_details` and `set_comp_work_area` tools.
- Parent validation owns registry validation, solution-library validation,
  semantic verification, the scoped Full Intaker proof path, and the final
  reviewable commit.
