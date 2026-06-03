# GUI Template Typed Plan

## Goal

Prepare a safe development handoff for AE Agent panel or ScriptUI scaffold requests, without copying source JSX, editing repository files from AE chat, or mutating the active After Effects project.

## Applies When

- The user asks for a GUI template, ScriptUI panel scaffold, AE Agent panel control layout, reusable panel boilerplate, or a development prompt for adding panel UI.
- The request is about repository development, UI structure, controls, state persistence, or verification steps rather than changing the current AE project.
- Minimal read-only AE project context is useful for describing the intended panel workflow, but the panel implementation itself belongs in a separate Codex App development chat.
- If the user asks to directly edit panel source files, run raw ExtendScript, mutate a live CEP panel, install dependencies, run live CEP/AE validation, push, PR, or reproduce exact source JSX behavior from inside AE chat, fail closed and prepare an explicit handoff instead.

## Plan Pattern

1. Classify the request as UI or repository development, not an AE project mutation.
2. Run `get_project_info` only when current project context is relevant to the proposed UI workflow; skip AE reads when the request is purely repository-facing.
3. Summarize the requested controls, expected state, bridge interactions, safety gates, and target files as a compact dev-request bundle.
4. Include the manual Codex App start prompt and make clear that the user starts the development chat separately.
5. Keep the bundle narrow: name only the intended UI files, relevant existing components, expected verification, and known fail-closed limits.
6. Do not execute raw JSX, do not edit repository files through AE chat, do not run live CEP/AE validation, and do not change the active project.

## Safety Gates

- Read-only advisory workflow.
- Requires Agent plan validation when used in planning context.
- Does not require explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, or post-mutation verification because no AE project mutation is allowed.
- Do not infer that a Codex App chat, source edit, live smoke, push, or PR has happened.
- Do not use this recipe for source-exact ScriptUI templates, automatic file edits, dependency changes, raw ExtendScript execution, live panel mutation, broad repository scans, or user-asset mutation.

## Verification

- The plan contains no project-changing AE tool and no raw ExtendScript step.
- Any AE context is limited to read-only `get_project_info` evidence and is optional.
- The generated dev-request bundle identifies the UI goal, target files, required controls, state/persistence expectations, bridge safety constraints, and validation expectations.
- The response clearly states unsupported source-exact ScriptUI behavior and any needed separate Codex App development step.
- No source JSX, copied UI handler code, repository edit, dependency change, live CEP/AE smoke, push, or PR is claimed.
