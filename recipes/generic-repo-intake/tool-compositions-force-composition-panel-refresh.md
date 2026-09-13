# tool-compositions-force-composition-panel-refresh Intake Note

## Candidate

- Candidate id: `tool-compositions-force-composition-panel-refresh`
- Safe lane: `composition-panel-refresh-generated-only`
- Typed plan: `recipes/force-composition-panel-refresh-typed-plan.md`

## Safe Adaptation

The source intent forces a Composition panel refresh by toggling
`CompItem.motionBlur` twice. The supported adaptation exposes a bounded
`refresh_comp_panel` typed tool that targets one explicit composition, optionally
guards the current `motionBlur` value, performs the transient double-toggle, and
returns before/transient/after evidence with `motionBlurRestored:true`.

Generated-only proof creates a temporary composition, reads `motionBlur` through
`get_comp_details`, runs `refresh_comp_panel`, reads the same comp back, and
requires semantic verification for restored `motionBlur`, unchanged comp
identity, unchanged layer count, unchanged work area, and cleanup.

## Out Of Scope

Source-exact active-viewer UI refresh behavior, broad active-comp assumptions,
layer `motionBlur` switches, arbitrary `set_comp_properties` fields, persistent
settings, non-generated user assets, render queue work, file I/O, raw JSX, and
project-wide traversal remain fail-closed.
