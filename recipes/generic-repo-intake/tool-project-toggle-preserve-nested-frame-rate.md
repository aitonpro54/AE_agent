# Generic Repo Intake: tool-project-toggle-preserve-nested-frame-rate

- Candidate: `tool-project-toggle-preserve-nested-frame-rate`
- Source: `Project/Toggle_Preserve_Nested_Frame_Rate.jsx`
- Safe recipe: `recipes/preserve-nested-frame-rate-typed-plan.md`

Use the recipe only for explicit generated or reviewed composition items. The
source script walks every `CompItem` in the project and sets
`preserveNestedFrameRate` to true unless ALT is held, but broad project-wide
mutation and keyboard-state branching are not safe typed-tool behavior.

The safe adaptation therefore requires current typed composition evidence,
concrete comp targets, an explicit final boolean value,
`set_comp_properties(preserveNestedFrameRate:<boolean>)`, and post-mutation
`get_comp_details` read-back. Keep all-project traversal, Project panel
selection, non-generated user comp batch mutation, render queue work, footage
interpretation, raw ExtendScript, and source JSX copy out of scope.
