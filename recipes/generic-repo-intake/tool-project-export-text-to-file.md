# Generic Repo Intake: Export Text To File

- Candidate id: `tool-project-export-text-to-file`
- Source path: `Project/Export_Text_To_File.jsx`
- Recipe: `recipes/export-text-to-file-typed-plan.md`
- Safety class: generated-only file-output typed contract

The supported adaptation exports reviewed selected-layer text evidence through
`export_text_to_file`. The bridge constrains output to a simple `.txt` file
under the generated export root, returns byte length and `sha256`, and preserves
the source payload shape:

- an ordinal header line followed by Source Text for text layers;
- an ordinal header line followed by `[Not a text layer]` for non-text
  selected layers;
- blank line after each layer block.

This intentionally does not reproduce source-exact file behavior:

- no `~/Desktop/export.txt`;
- no Desktop/user-selected paths or arbitrary outputPath;
- no raw JSX copy or source-checkout execution;
- no Project panel or filesystem side effects outside generated exports;
- no mutation of Source Text, layer selection, layer order, project items,
  render queue items, or non-generated user assets.

Future work that needs user-selected output folders, exact Desktop export, or
broad filesystem writes requires a separate approval-gated contract with
explicit user approval, overwrite policy, rollback/cleanup policy, and typed
read-back.
