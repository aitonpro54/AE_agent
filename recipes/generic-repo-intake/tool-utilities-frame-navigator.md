# tool-utilities-frame-navigator Intake Note

## Parent Reducer Decision

- Candidate id: `tool-utilities-frame-navigator`
- Source path: `Utilities/Frame_Navigator.jsx`
- Status: accepted only as a scoped generated-only typed contract / proof-lane preparation. Candidate completion remains live-proof/readiness-gated.

## Safe Adaptation

The source behavior preserved in the triage ledger moves the composition current time indicator through `comp.time`. This intake adapts only that CTI navigation intent into `recipes/frame-navigator-typed-plan.md`. No raw source JSX is copied into the product.

The safe adaptation uses one narrow typed tool, `set_comp_current_time`, after `get_active_comp` or `get_comp_details` evidence binds the explicit composition identity, current time, duration, frame rate, and layer count. The tool accepts exactly one reviewed target form: finite seconds or a zero-based frame with a positive frame rate. It fails closed outside composition duration unless `clampToDuration:true` is explicitly reviewed, and it requires `get_comp_details.time` read-back.

Source-exact ScriptUI controls, display-start/timecode offsets, selected-comp ambiguity, layer timing, work-area edits, markers, keyframes, raw ExtendScript, and broad project scans remain fail-closed.

## Validation Owner

Parent reducer owns bridge contract validation, registry validation, solution-library smoke coverage, semantic verification, generated-only live lane metadata, any future scoped Full Intaker retry evidence, plan/handoff updates, and the reviewable milestone commit.
