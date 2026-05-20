# M112 SDK Write-Capable Runner Scaffold

## Result

pass

## What changed

Implemented a non-live write-capable SDK runner scaffold under `orchestrator/`.

The scaffold is deny-by-default and contract-tested locally. It does not import `@openai/codex-sdk`, does not create an SDK thread, does not execute real write work, and does not auto-commit.

## Runner contract

The runner requires an explicit `--scope` before any non-help run:

- `docs-audit`
- `orchestrator`
- `production-code`
- `cep-panel`

Unknown scopes are rejected during local argument parsing.

Unsafe and bypass-capable flags are rejected during local argument parsing, including:

- `--approval`
- `--auto-commit`
- `--commit`
- `--danger-full-access`
- `--execute`
- `--external-provider`
- `--force`
- `--live`
- `--mutating-live`
- `--network`
- `--openai-cli-planner`
- `--sandbox`
- `--skip-git-repo-check`
- `--tenant-policy-bypass`
- `--unsafe`
- `--web-search`

Would-be thread options are fixed to:

- `sandboxMode: "workspace-write"`
- `approvalPolicy: "never"`
- `networkAccessEnabled: false`
- `webSearchMode: "disabled"`

## Git snapshot contract

The scaffold captures pre-run and post-run git snapshots:

- `git status --short --branch`
- `git diff --name-only`
- `git diff --cached --name-only`
- `git ls-files --others --exclude-standard`
- per-path signature hashes for changed paths

Post-run validation compares path signatures between the pre and post snapshots so pre-existing acknowledged changes are not treated as newly created diffs.

## Path allowlist contract

Path allowlists are scope-specific:

- `docs-audit`: `.codex-audit/**`, `.codex/handoff.md`, docs/specs/plans/readme files.
- `orchestrator`: `orchestrator/**`, `package.json`, audit/handoff files.
- `production-code`: `mcp-server/**`, `chatgpt-connector/**`, `scripts/**`, `recipes/**`, `registry/**`, `package.json`, audit/handoff files.
- `cep-panel`: `cep-panel/**`, audit/handoff files.

Default forbidden paths include:

- `.git/**`
- `node_modules/**`
- `logs/**`
- `backups/**`
- `snapshots/**`
- `pro-review-bundles/**`
- `mcp-config.json`
- `.env*`
- `**/.env*`
- `*.key`
- `**/*.key`
- `*.pem`
- `**/*.pem`
- `*secret*`
- `**/*secret*`
- `*token*`
- `**/*token*`

## Hard-stop conditions

The scaffold hard-stops on:

- dirty unexpected git state before the run;
- forbidden path diff after the run;
- path diff outside the active scope allowlist;
- external-provider request;
- OpenAI CLI planner request;
- live/mutating request;
- tenant-policy bypass request;
- auto-commit request;
- failed validation result.

## Local contract smoke

`npm.cmd run check:rules` now imports and runs the M112 write-capable scaffold contract smoke. The smoke verifies:

- explicit scope set;
- unknown scope rejection;
- unsafe flag rejection;
- prompt policy hard-stops;
- fixed write-capable thread option contract;
- per-scope path allowlists;
- forbidden paths;
- pre/post snapshot diff comparison;
- failed-validation hard stop;
- dirty unexpected git state hard stop.

No real SDK write work is executed by the smoke.

## Validation

Allowed checks run:

- `node --check orchestrator/codex-sdk-orchestrator.mjs` -> pass
- `node --check orchestrator/run-buffered-acceptance.mjs` -> pass
- `node --check orchestrator/run-write-capable-scaffold.mjs` -> pass
- `npm.cmd run codex:orchestrator:help` -> pass
- `npm.cmd run check:rules` -> pass
- `git diff --check` -> pass; Git reported only LF-to-CRLF working-copy warnings for touched text files.

## Not run

Per M112 restrictions, the following were not run:

- external-provider validation;
- OpenAI CLI planner validation;
- mutating-live;
- live CEP / AE smoke tests;
- tenant-policy bypass;
- network diagnostics;
- package installation;
- real production write work;
- auto-commit.

## Remaining risks

- This is a scaffold and contract smoke, not a live SDK write execution path.
- Prompt policy scanning is intentionally conservative and may reject safety text that mentions forbidden live/provider/bypass terms.
- Future live write enablement should keep SDK thread creation behind the same local validations and add milestone-specific post-run validation before any manual commit.

## Next safe milestone

Review M112 diff, then decide whether to add a guarded, still-local dry-run mode that exercises the runner end-to-end without SDK thread creation in a clean worktree.
