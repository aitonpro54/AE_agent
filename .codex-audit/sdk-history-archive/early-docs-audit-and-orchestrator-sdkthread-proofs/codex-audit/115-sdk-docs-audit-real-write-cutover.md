# M115 SDK Docs-Audit Real Write Cutover

## Result

partial

## Summary

M115 local implementation and contract validation were completed, including a guarded `sdk-write` operation envelope mode limited to `docs-audit` and `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`.

The real cutover did not complete successfully. The planned SDK output file was not created, and no success is claimed.

## Real SDK write attempt

- Operation file: `.codex/sdk/logs/m115-docs-audit-sdk-write-operation.json`
- Scope: `docs-audit`
- Mode: `sdk-write`
- Planned output path: `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`
- SDK output file exists after attempt: no
- Auto-commit: no

Failure notes:

- First runner invocation stopped before SDK thread creation because the existing `git status --short` parser trimmed leading status columns and mismatched acknowledged dirty paths.
- After fixing that parser, exactly one real `sdk-write` invocation was run.
- That invocation failed and did not create the planned output file.
- The runner reported `EPERM` while writing `.codex/sdk/logs/2026-05-20T13-52-39-285Z-m115-sdk-docs-audit-real-write-cutover-sdk-write.json`; because this masked the underlying SDK failure, runner logging was changed to be non-fatal for future runs.

## Validation

- `node --check orchestrator\codex-sdk-orchestrator.mjs` -> pass
- `node --check orchestrator\run-buffered-acceptance.mjs` -> pass
- `node --check orchestrator\run-write-capable-scaffold.mjs` -> pass
- `npm.cmd run codex:orchestrator:help` -> pass
- `npm.cmd run check:rules` -> pass; includes `Write-capable docs-audit sdk-write mode: pass`
- `git diff --check` -> pass; Git printed only LF-to-CRLF working-copy warnings
- `git diff --name-only` and `git status --short --branch` captured for the return packet

## Safety assertions

- external-provider validation was not run
- OpenAI CLI planner validation was not run
- mutating-live was not run
- live CEP / AE smoke tests were not run
- tenant-policy bypass was not attempted
- production code was not changed
- CEP panel code was not changed
- network diagnostics were not run
- package installation was not run
- auto-commit was not performed

## Next safe step

Review `.codex-audit/115-chatgpt-return-packet.md` before any follow-up. Do not run another real SDKThread write without a separate explicit approval.
