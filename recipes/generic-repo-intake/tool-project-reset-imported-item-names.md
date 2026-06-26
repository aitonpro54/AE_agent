# Generic Repo Intake: tool-project-reset-imported-item-names

- Candidate: `tool-project-reset-imported-item-names`
- Source: `Project/Reset_Imported_Item_Names.jsx`
- Safe recipe: `recipes/reset-imported-item-names-typed-plan.md`

Use the recipe only for explicit generated imported footage items. The source
script works from Project panel selection and resets selected `FootageItem`
names to `item.mainSource.file.displayName`, but current typed tools do not
expose selected Project items. The safe adaptation therefore requires current
typed project evidence, concrete generated footage `itemIndices`, reviewed file
display-name evidence, `rename_project_items(type:"footage", mode:"exact")`,
and post-mutation project snapshot/read-back.

The generated-only live lane may create a sandboxed PNG through
`save_comp_frame_png`, import it with `import_footage`, reset the imported
footage item name to that PNG filename, verify read-back, then remove only the
generated PNG fixture. Keep Project panel selection reads, relinks,
missing-footage repair, non-generated user assets, arbitrary filesystem paths,
item delete/move, render queue work, broad project mutation, raw ExtendScript,
and source JSX copy out of scope.
