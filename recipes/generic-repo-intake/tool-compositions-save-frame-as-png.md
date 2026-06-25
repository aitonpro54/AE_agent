# Generic Repo Intake: Save Frame As PNG

- Candidate id: `tool-compositions-save-frame-as-png`
- Source path: `Compositions/Save_Frame_As_PNG.jsx`
- Recipe: `recipes/save-frame-as-png-typed-plan.md`
- Safety class: generated-only file-output typed contract

The supported adaptation saves one reviewed frame from one explicit generated
composition through `save_comp_frame_png`. The bridge constrains output to a
simple `.png` file under the generated export root, returns byte length and
`sha256`, and proves `resolutionFactor` restoration before the plan performs
post-export `get_comp_details` read-back.

This intentionally does not reproduce source-exact UI/file behavior:

- no `Folder.selectDialog` or Desktop/user-selected paths;
- no source-exact `app.settings/app.preferences` persistence;
- no Shift-key branching;
- no render queue rendering or project save/saveAs;
- no non-generated user-asset mutation;
- no raw JSX copy or source-checkout execution.

Future work that needs user-selected folders, persistent last-folder settings,
rendered deliverables outside the generated export root, or exact keyboard
semantics requires a separate approval-gated contract with explicit user
approval, rollback/cleanup policy, and typed read-back.
