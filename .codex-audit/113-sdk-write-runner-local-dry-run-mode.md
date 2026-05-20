# M113 SDK Write Runner Local Dry-Run Mode

## Result

pass

## What changed

Added a guarded local dry-run mode to `orchestrator/run-write-capable-scaffold.mjs`.

The mode is explicitly local: it does not import the SDK, does not create SDK threads, does not edit target files, does not execute real write work, does not use network access, and does not auto-commit.

## Dry-run behavior

Dry-run is enabled only with `--dry-run`.

Required inputs:

- `--scope <name>`
- `--prompt <text>`

Optional repeated planned path inputs:

- `--planned-path <repo-path>`

The dry-run path returns:

- `dry-run-allowed` when the prompt policy, pre-run git state, and planned path policy all pass.
- `dry-run-denied` when the simulation finds an unacknowledged pre-run dirty state or planned path policy violation.

`dry-run-denied` is a local simulation result, not real write work.

## Scope validation

Dry-run uses the same explicit write scopes as the M112 scaffold:

- `docs-audit`
- `orchestrator`
- `production-code`
- `cep-panel`

Missing `--scope` and unknown scopes are rejected during local argument parsing before any possible SDK thread creation.

## Unsafe flags rejected

Dry-run shares the write runner unsafe/bypass flag blocklist. Local contract smoke verifies rejection for unsafe flags including:

- `--sandbox`
- `--approval`
- `--network`
- `--web-search`
- `--skip-git-repo-check`
- `--external-provider`
- `--openai-cli-planner`
- `--mutating-live`
- `--tenant-policy-bypass`
- `--auto-commit`
- `--commit`
- `--force`
- `--live`
- `--execute`

These are rejected before any possible SDK thread creation.

## Path allowlist and forbidden path behavior

Dry-run checks planned paths with the same scope allowlists and forbidden path patterns used by post-run contract validation.

Covered by local smoke:

- allowed orchestrator paths return allowed;
- `node_modules/**` returns `forbidden-path`;
- `mcp-server/**` under `orchestrator` scope returns `outside-scope-allowlist`;
- `../outside.txt` returns `unsafe-path-shape`.

The check is local and uses the requested planned paths. It does not create or modify those paths.

## Local contract smoke

`npm.cmd run check:rules` now verifies:

- dry-run argument parsing;
- explicit dry-run scope requirement;
- unknown dry-run scope rejection;
- unsafe flag rejection in dry-run mode;
- planned path allowlist behavior;
- forbidden path behavior;
- unsafe path shape behavior;
- `sdkThreadCreated:false`;
- `realWriteWork:false`;
- `autoCommit:false`.

## Validation

Allowed checks run:

- `node --check orchestrator/codex-sdk-orchestrator.mjs` -> pass
- `node --check orchestrator/run-buffered-acceptance.mjs` -> pass
- `node --check orchestrator/run-write-capable-scaffold.mjs` -> pass
- `npm.cmd run codex:orchestrator:help` -> pass
- `npm.cmd run check:rules` -> pass; output includes `Write-capable local dry-run mode: pass`
- `git diff --check` -> pass; Git reported only LF-to-CRLF working-copy warnings for touched text files

## Not run

Per M113 restrictions, the following were not run:

- external-provider validation;
- OpenAI CLI planner validation;
- mutating-live;
- live CEP / AE smoke tests;
- tenant-policy bypass;
- production code edits;
- CEP panel edits;
- network diagnostics;
- package installation;
- SDK thread creation;
- real write work;
- auto-commit.

## Remaining risks

- This remains a local dry-run contract, not a live SDK write runner.
- Dry-run only evaluates explicit `--planned-path` inputs; it does not infer target paths from a natural-language prompt.
- Pre-run git state is reported from a local snapshot and can make the simulation return `dry-run-denied` when dirty paths are not acknowledged.

## Next safe milestone

Add a still-local planned-operation envelope for the write runner so future milestones can pass structured planned paths and validation expectations without creating SDK threads or performing real write work.
