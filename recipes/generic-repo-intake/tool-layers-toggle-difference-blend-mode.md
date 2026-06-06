# tool-layers-toggle-difference-blend-mode

- Recipe: `recipes/difference-blend-mode-typed-plan.md`
- Typed tool: `set_layer_blending_mode`
- Candidate family: `layer-blending-mode-difference-generated-only`

This intake adapts only the safe selected-layer Difference blending intent into
typed tools. The plan reads selected-layer evidence and complete layer inventory
for one composition, then calls `set_layer_blending_mode` with explicit
generated layer indices, expected-name guards, optional current-mode guards, and
`blendingMode:"difference"`. It verifies every affected layer with
`get_layer_details` or `get_comp_details`.

Source-exact Alt-key branching, toggle-back/restoration behavior, all-project
or multi-comp traversal, arbitrary blend mode enums, locked layers, non-generated
user assets, track matte changes, labels/comments/locks/enabled writes,
expressions, effects, timing/source changes, render queue work, file I/O, and
raw ExtendScript remain fail-closed.

No source JSX was copied. Parent importer owns scoped retry, live proof,
candidate completion, and any runtime ledger annotation.
