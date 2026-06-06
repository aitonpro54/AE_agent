# tool-properties-toggle-puppet-on-transparent Intake Note

## Parent Reducer Decision

- Candidate id: `tool-properties-toggle-puppet-on-transparent`
- Source path: `Properties/Toggle_Puppet_On_Transparent.jsx`
- Status: accepted only as a scoped generated-only typed-plan/proof-lane
  adaptation.

## Safe Adaptation

The source idea is represented by
`recipes/toggle-puppet-on-transparent-typed-plan.md`. No raw source JSX is
copied. The adaptation uses existing typed tools on one explicit generated
effect target: `add_effect`, `get_effect_details`, and `set_effect_property`.

The generated-only proof lane creates a generated comp/layer, adds a generated
`ADBE FreePin3` Puppet effect when AE supports that effect on the generated
layer, reads `ADBE FreePin3 On Transparent`, sets it to a reviewed boolean
value, and reads the property back.

Source-exact all-project traversal, Alt-key branching, mutation of every Puppet
effect in the project, user-layer Puppet effects, puppet pin atom mutation,
third-party DuIK behavior, selection persistence, and raw ExtendScript remain
fail-closed.

## Validation Owner

Parent reducer owns registry validation, solution-library smoke coverage, the
generated-only live lane entry, scoped Full Intaker retry evidence, plan/handoff
updates, and the reviewable milestone commit.
