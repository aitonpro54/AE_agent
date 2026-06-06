# tool-project-set-all-item-labels-to-none Intake Note

- Candidate id: `tool-project-set-all-item-labels-to-none`
- Status: generated-only typed contract/lane coverage; candidate completion
  remains live-proof/readiness-gated.
- Recipe: `recipes/set-project-item-labels-to-none-typed-plan.md`
- Typed tool: `set_project_item_metadata`

The safe adaptation sets only AE Project item `label` to `0` for explicit
`itemIndices` from current project-item evidence. It does not read current
Project panel selection, infer label defaults by item type, rename or move
items, delete folders/items, touch proxies, start render queue work, perform
filesystem operations, or copy raw source JSX.

Future live proof should use generated project items, bind concrete
`itemIndices` from `find_project_items` or `get_project_snapshot`, run
`set_project_item_metadata`, and read labels back with project-item inspection
before cleanup.
