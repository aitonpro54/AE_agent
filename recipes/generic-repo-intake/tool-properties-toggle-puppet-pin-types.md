# tool-properties-toggle-puppet-pin-types Intake Note

## Parent Reducer Decision

- Candidate id: `tool-properties-toggle-puppet-pin-types`
- Source path: `Properties/Toggle_Puppet_Pin_Types.jsx`
- Status: accepted only as a scoped generated-only typed contract / proof-lane
  preparation. Candidate completion remains live-proof/readiness-gated.

## Safe Adaptation

The source idea is represented by
`recipes/toggle-puppet-pin-types-typed-plan.md`. No raw source JSX is copied.
The adaptation uses one narrow typed tool, `set_puppet_pin_type`, after current
`get_effect_details` evidence proves a generated or explicitly reviewed
`ADBE FreePin3` effect, an `ADBE FreePin3 PosPin Atom` ancestor, and an
`ADBE FreePin3 PosPin Type` property path.

The generated-only proof lane is allowed to set only reviewed enum values
`1` / `position` and `4` / `advanced`. It does not claim to create Puppet pin
atoms. If a generated AE fixture cannot provide a Puppet pin atom through
reviewed typed evidence, the lane must remain blocked instead of falling back
to raw JSX or selected-property traversal.

Source-exact selected Puppet pin traversal, automatic pin creation, Alt-key
branching, user Puppet effects, project-wide scans, third-party DuIK behavior,
selection persistence, and raw ExtendScript remain fail-closed.

## Validation Owner

Parent reducer owns bridge contract validation, registry validation,
solution-library smoke coverage, semantic verification, generated-only live
lane metadata, any future scoped Full Intaker retry evidence, plan/handoff
updates, and the reviewable milestone commit.
