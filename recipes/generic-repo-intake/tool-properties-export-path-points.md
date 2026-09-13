# tool-properties-export-path-points Intake Note

- Candidate id: `tool-properties-export-path-points`
- Source path: `Properties/Export_Path_Points.jsx`
- Status: advisory typed-plan coverage only
- Recipe: `recipes/export-path-points-typed-plan.md`

The source idea is represented without copying raw JSX. The safe AE Agent
adaptation reads one explicit path with `get_path_geometry`, exports reviewed
vertices through `export_path_points`, and reads the same target back.

Accepted slice:

- no Desktop writes;
- no arbitrary `outputPath`;
- no selectedProperties traversal;
- no raw ExtendScript;
- no mutation of path geometry;
- generated local exports only under the bridge generated export root.

Live candidate completion still needs the approved generated-only CEP proof lane
to run. This note only records the parent-owned typed contract and policy.
