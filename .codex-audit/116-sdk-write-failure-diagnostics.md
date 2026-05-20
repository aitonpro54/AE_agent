# M116 SDK Write Failure Diagnostics

## Result

pass

## Scope

M116 diagnosed and hardened the M115 `sdk-write` failure path without retrying the real SDKThread write.

No SDK thread was created during M116, and no real write work was performed during M116 contract smoke.

## Diagnosis

- M115 reached the `codex.startThread()` path after envelope/preflight validation, but no thread id was captured and the planned output `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md` was not created.
- The original M115 SDK failure detail cannot be recovered from the available artifacts because the historical attempt was masked by `EPERM` while writing `.codex/sdk/logs/...sdk-write.json`.
- `.codex/sdk/operations` was also unavailable in M115 with Access denied, so future diagnostic guidance needs an in-repo fallback operation-file path that does not depend on `.codex/sdk/operations`.

## Changes

- Added explicit SDK write diagnostic paths for primary logs, operation envelopes, and `.codex-audit` fallback reports.
- Made SDK log write failure handling report `EPERM` as non-fatal diagnostic metadata.
- Added fallback Markdown reporting under `.codex-audit/<operation>-sdk-write-failure-diagnostics.md` when `.codex/sdk/logs/**` cannot be written.
- Added fallback operation-file guidance under `.codex-audit/<operation>-operation.json` when `.codex/sdk/operations/**` cannot be used.
- Preserved the original SDK/post-run failure in the thrown console message even when the primary log write fails.
- Wrapped post-run SDK validation/output-missing failures so they are also logged or fallback-reported instead of escaping before diagnostics.
- Extended local contract smoke with a synthetic `EPERM` log-write failure and assertions for original-error preservation, fallback reporting, no SDK thread creation, and no real write work.

## Safety

- Real SDKThread write was not retried.
- SDK thread was not created.
- External-provider validation was not run.
- OpenAI CLI planner validation was not run.
- Mutating-live and live CEP / AE smoke tests were not run.
- Tenant-policy bypass, network diagnostics, package installation, auto-commit, and commit were not run.

## Validation

- `node --check orchestrator/codex-sdk-orchestrator.mjs` passed.
- `node --check orchestrator/run-buffered-acceptance.mjs` passed.
- `node --check orchestrator/run-write-capable-scaffold.mjs` passed.
- `npm.cmd run codex:orchestrator:help` passed.
- `npm.cmd run check:rules` passed and printed `Write-capable sdk-write diagnostic logging mode: pass`.
- `git diff --check` passed with only LF-to-CRLF working-copy warnings.
