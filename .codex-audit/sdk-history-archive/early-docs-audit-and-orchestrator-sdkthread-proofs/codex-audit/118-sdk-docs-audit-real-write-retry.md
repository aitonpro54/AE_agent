# M118 SDK Docs-Audit Real Write Retry

## Result

partial

## Scope

M118 repeated exactly one real `docs-audit` `sdk-write` retry for the planned output path:

`.codex-audit/118-sdk-docs-audit-sdk-thread-output.md`

No second retry was run, and the planned output file was not created manually.

## Precondition Gate

- M115 partial tag present: yes.
- M116 diagnostics tag present: yes.
- M117R planned-path generalization tag present: yes.
- Tracked diff clean before M118: yes.
- Staged diff clean before M118: yes, inferred from `git status --short --branch`.
- Failed M117 artifacts present before retry: no.
- Preexisting M115/M117/M118 SDK output files present before retry: no.
- Allowed audit-only untracked packets present: yes, `.codex-audit/117r-commit-return-packet.md` and `.codex-audit/117r-worktree-reconciliation-return-packet.md`.
- `tratorREADME.md` present: no.

## Operation Envelope

Fallback operation path was used because `.codex/sdk/operations` returned `Access denied`:

`.codex-audit/m118-sdk-docs-audit-real-write-retry-operation.json`

```json
{
  "version": 1,
  "operationId": "m118-sdk-docs-audit-real-write-retry",
  "scope": "docs-audit",
  "mode": "sdk-write",
  "prompt": "Create only `.codex-audit/118-sdk-docs-audit-sdk-thread-output.md`. Do not edit any other file.",
  "plannedPaths": [
    ".codex-audit/118-sdk-docs-audit-sdk-thread-output.md"
  ]
}
```

## Retry Status

- SDKThread retry performed during M118: yes.
- Number of SDKThread write attempts during M118: 1.
- SDK thread created: yes.
- SDKThread completed: no.
- Thread id: `019e46a0-303c-7b40-afca-d76be0bcb61c`.
- Planned output created by SDKThread: no.
- Failure class: SDK stream/API request disconnection before completion.
- Original SDK error preserved: yes.
- Original SDK error: `stream disconnected before completion: error sending request for url (https://api.openai.com/v1/responses)`.
- Primary log write succeeded: no.
- Primary log write error: `EPERM: operation not permitted, open 'C:\Users\Ant\Documents\Codex\AE_agent\.codex\sdk\logs\2026-05-20T18-23-14-938Z-m118-sdk-docs-audit-real-write-retry-sdk-write.json'`.
- Fallback report used: yes.
- Fallback report path: `.codex-audit/m118-sdk-docs-audit-real-write-retry-sdk-write-failure-diagnostics.md`.

## Safety

- External-provider validation was not run.
- OpenAI CLI planner validation was not run.
- Mutating-live was not run.
- Live CEP / AE smoke tests were not run.
- Tenant-policy bypass was not attempted.
- Production code was not changed.
- CEP panel code was not changed.
- Network diagnostics were not run.
- Package installation was not run.
- Auto-commit was not performed.
- No staging was performed.
- No commit was performed.
- No second SDKThread retry was run.
