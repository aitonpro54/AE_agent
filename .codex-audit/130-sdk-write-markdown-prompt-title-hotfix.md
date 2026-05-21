# M130 SDK Write Markdown Prompt Title Hotfix

## Result

pass

## Goal

Fix the `outputTitle is not defined` failure in docs-audit and orchestrator Markdown `sdk-write` prompt creation.

## Trigger

A user-run final project audit SDK command reached `createSdkWritePrompt()` and stopped before SDK thread creation with:

```text
outputTitle is not defined
```

The run was correctly rooted at `C:\Users\Ant\Documents\Codex\AE_agent` and did not walk parent directories.

## Changes

- `orchestrator/run-write-capable-scaffold.mjs`
  - Adds a concrete Markdown output title for docs-audit and orchestrator Markdown `sdk-write` prompts.
  - Keeps JSON fixture prompt behavior separate.
  - Changes the wrapper instruction from `short` to focused on the requested artifact, so final audit reports are not artificially constrained.
  - Adds contract-smoke assertions for docs-audit Markdown, orchestrator Markdown, and fixture JSON prompt rendering.
- `plans/target-app-execplan.md`
  - Records the hotfix progress, decision, and validation.

## Validation

- `node --check orchestrator/run-write-capable-scaffold.mjs`: pass.
- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `npm.cmd run codex:orchestrator:help`: pass.
- `npm.cmd run codex:orchestrator:write-scaffold:contract`: pass.
- `npm.cmd run check:rules`: pass.
- `git diff --check`: pass; only LF-to-CRLF working-copy warnings.
- `node scripts/provider-contract-smoke.js`: pass.
- `node scripts/solution-registry-smoke.js`: pass.
- `node scripts/solution-candidate-report-smoke.js`: pass.
- `node scripts/solution-promotion-smoke.js`: pass.
- `node scripts/solution-retrieval-smoke.js`: pass.
- `node scripts/solution-library-validation-smoke.js`: pass.
- `node scripts/project-intent-memory-smoke.js`: pass.
- `node scripts/plan-classification-smoke.js`: pass.
- `node scripts/plan-repair-smoke.js`: pass.
- `node scripts/semantic-verification-smoke.js`: pass.
- `node scripts/reliability-validation-suite-smoke.js`: pass.
- `node scripts/chatgpt-connector-smoke.js`: pass on individual rerun after the combined wrapper run aborted at this command with Windows exit code `-1073740791`.
- `node scripts/provider-api-smoke.js`: pass.
- `node scripts/prompt-optimization-smoke.js`: pass.
- `node scripts/bridge-only-smoke-test.js`: pass.
- `node scripts/smoke-test.js`: pass.

## Scope Boundaries

- No SDKThread was created by this hotfix.
- No real SDK write work was run by this hotfix.
- No production-code SDK write lane was enabled.
- No CEP-panel SDK write lane was enabled.
- The user-created `.codex-audit/sdk-final-project-audit-operation.json` operation file was not staged by this hotfix.

## Decision

Markdown `sdk-write` prompt construction is now covered directly by local contract smoke before any future real SDKThread write reaches that branch.
