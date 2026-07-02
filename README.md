# AE Agent

AE Agent 2.0.0 is a local After Effects assistant: a CEP panel talks to a local
bridge daemon, and the daemon owns all provider calls, plan validation, AE
execution gates, checkpoints, logs, and verification.

The product target is in `specs/target-app.md`. The active work plan is
`plans/target-app-execplan.md`.

## What Stays In This Repo

- `cep-panel/`: the CEP UI.
- `mcp-server/`: bridge daemon, typed tools, provider integration, planning,
  semantic verification, and safety gates.
- `chatgpt-connector/`: local connector used by the panel.
- `recipes/` and `registry/`: reviewed typed-tool planning patterns and the
  solution library.
- `orchestrator/` and related smoke scripts: current AE-specific Full
  Intaker/importer tooling.
- `specs/`, `docs/`, `plans/`: compact current product and project docs.

Runtime output stays local and ignored: `.codex/`, `.codex-runtime/`, `logs/`,
`backups/`, `snapshots/`, `pro-review-bundles/`, `.codex-autonomy/logs/`, and
`.codex-autonomy/runs/`.

## Run The Bridge

Start the local bridge daemon:

```powershell
node mcp-server/bridge-daemon.js
```

The daemon serves the CEP panel and MCP tools. It is also the safety boundary
for mutating AE actions.

## Install The CEP Panel

Use `cep-panel/` as the extension source during local development. The panel
expects the bridge daemon to be running locally. If the panel appears offline,
start the daemon first and then reload the CEP panel.

## Provider Paths

Configured provider surfaces include OpenAI API, OpenAI CLI/Codex CLI, Gemini,
Claude, OpenRouter, and Local/Ollama.

Important boundaries:

- ChatGPT subscription access is the OpenAI CLI/Codex CLI path, not an OpenAI
  API key.
- OpenAI API access uses `OPENAI_API_KEY` or the bridge secret store.
- Local/Ollama is allowed as a target product provider, but validation/intake
  must not use it without explicit approval.

## Safety Model

- Prefer typed tools over raw ExtendScript.
- Mutating plans require validation, explicit permission, dry-run evidence when
  applicable, and post-run read-back.
- Broad or risky mutations require checkpoint/edit-session protection.
- Raw ExtendScript remains an escape hatch behind bridge-owned gates.
- Dev-request bundles are local handoffs for separate Codex App development
  work; the panel must not imply it created a Codex thread automatically.

## Full Intaker Boundary

Keep AE Agent-specific Full Intaker/importer tooling here. Do not rebuild the
broad generic SDK orchestrator history in this repo. Reusable generic SDK
orchestration belongs in the sibling `codex-sdk-orchestrator-tool` through a
separate reviewed migration.

Approval-gated by default:

- Local/Ollama and fallback providers in validation/intake
- broad/default CEP smoke
- live AE mutation
- dependency changes
- push and PR

## Validation

Default guard:

```powershell
npm.cmd run check:rules
```

For JavaScript/MJS edits, also run `node --check` for every touched source file
and:

```powershell
git diff --check
```

Focused smoke groups:

```powershell
npm.cmd run smoke:provider-contract
npm.cmd run smoke:provider-api
npm.cmd run smoke:solutions
npm.cmd run smoke:planning
npm.cmd run smoke:bridge
npm.cmd run smoke:full-intake
```

Run only the groups relevant to the touched surface unless a milestone calls
for a broader pass.

## Handoff

After each milestone, update `.codex/handoff.md` with the goal, current state,
files touched, validation, decisions, risks, commit id, and exact next prompt.
Keep it compact; long historical evidence belongs in git history or the legacy
repository, not in the clean baseline.
