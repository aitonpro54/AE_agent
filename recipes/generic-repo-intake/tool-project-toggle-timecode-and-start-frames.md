# Generic Repo Intake: tool-project-toggle-timecode-and-start-frames

- Candidate: `tool-project-toggle-timecode-and-start-frames`
- Source: `Project/Toggle_Timecode_And_Start_Frames.jsx`
- Safe recipe: `recipes/project-timecode-start-frames-typed-plan.md`

Use the recipe only for an explicit reviewed project frame-count mode and
explicit generated or reviewed composition targets. The source script reads
`ScriptUI.environment.keyboardState.altKey`, sets `app.project.framesCountType`
to `FC_START_0` or `FC_START_1`, then walks every `CompItem` in the project and
sets native `displayStartFrame = 0`; keyboard-state branching and broad
project-wide composition mutation are not safe typed-tool behavior.

The safe adaptation therefore requires current typed project and composition
evidence, an explicit final `framesCountType`, concrete composition targets,
`set_project_frames_count_type`, `set_comp_properties(displayStartFrame:<integer>)`,
and post-mutation `get_project_info` / `get_comp_details` read-back. Keep
all-project traversal, Project panel selection, non-generated user comp batch
mutation, display-start-time fallback semantics, render queue work, footage
interpretation, raw ExtendScript, and source JSX copy out of scope.
