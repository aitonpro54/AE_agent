# tool-compositions-set-work-area-to-markers Intake Note

## Source

- Repository: `https://github.com/reviewed external AE script collection`
- Source path: `Compositions/Set_Work_Area_To_Markers.jsx`
- Candidate id: `tool-compositions-set-work-area-to-markers`
- License: review required by the parent importer before any source-derived
  promotion.

## Adaptation

This intake adapts only the marker-derived work-area intent into
`recipes/set-work-area-to-markers-typed-plan.md`. No raw JSX is copied into the
product.

The safe supported path is a typed mutating recipe: read composition markers
from `get_comp_details` with `includeMarkers:true`, derive a finite work-area
start and duration from two reviewed composition marker times, run
`set_comp_work_area`, then read back the composition work area and markers.

Generated-only proof setup may create composition markers with `add_comp_marker`
on a generated composition only. It must not create, update, or delete markers
on user assets as an implementation shortcut.

## Fail-Closed Scope

- Source-exact active composition panel traversal, native undo grouping,
  selected comp ambiguity, hidden UI state, raw ExtendScript execution, layer
  marker substitution, audio-derived marker generation, marker update/delete,
  persistent settings, keyboard-state branching, render queue work, file I/O,
  layer retiming, duration changes, and exact source JSX semantics require
  separate reviewed contracts.
- Marker-derived work-area mutation is allowed only after explicit composition
  marker evidence and normal Agent mutation gates.

## Validation

- Parent reducer accepts this candidate only as a non-live generated-only
  contract/lane adaptation over `get_comp_details`, `add_comp_marker`, and
  `set_comp_work_area`.
- Parent validation owns registry validation, solution-library validation,
  semantic verification, the scoped Full Intaker proof path, and the final
  reviewable commit.
