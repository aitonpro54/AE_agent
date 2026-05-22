# M121 SDK Docs-Audit Runtime Fallback Retry

## Result

partial-review-needed

## Summary

M121 ran exactly one controlled `docs-audit` `sdk-write` retry after M120 was committed and tagged. The SDKThread completed successfully and created the planned output file, but the runtime fallback was not selected for the routine log: runtime preflight reported `.codex/sdk` writable in this host process and wrote the SDK log there.

## M120 Commit Gate

- M120 commit created: yes.
- M120 commit hash: `bb4c007`.
- M120 tag created: yes.
- M120 tag name: `sdk-m120-sdk-runtime-path-hardening`.
- M120 tag target: `bb4c007`.
- Committed files:
  - `.codex-audit/120-chatgpt-return-packet.md`
  - `.codex-audit/120-sdk-runtime-path-hardening.md`
  - `.gitignore`
  - `orchestrator/README.md`
  - `orchestrator/run-buffered-acceptance.mjs`
  - `orchestrator/run-write-capable-scaffold.mjs`
  - `plans/target-app-execplan.md`

## M121 Precondition Gate

- M120 tag present: yes.
- Tracked diff clean before M121: yes.
- Staged diff clean before M121: yes.
- `.codex-runtime/` ignored: yes.
- Preexisting M115/M117/M118/M121 SDK output files: absent.
- Allowed audit-only untracked packets present: yes:
  - `.codex-audit/117r-commit-return-packet.md`
  - `.codex-audit/117r-worktree-reconciliation-return-packet.md`

## SDKThread Retry

- SDKThread retry performed during M121: yes.
- Number of SDKThread write attempts during M121: 1.
- SDK thread created: yes.
- SDKThread completed: yes.
- Thread id: `019e4933-7359-72c3-b8aa-128596ce647c`.
- Planned output path: `.codex-audit/121-sdk-docs-audit-sdk-thread-output.md`.
- Planned output created by SDKThread: yes.
- Original SDK error preserved: not applicable; no SDK failure was reported.

## Runtime Paths

- Primary runtime path: `.codex/sdk`.
- Fallback runtime path: `.codex-runtime/sdk`.
- Operation envelope path: `.codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json`.
- Selected runtime path reported by runner: `.codex/sdk`.
- Selected runtime reason: `primary-runtime-writable`.
- Routine log path: `.codex/sdk/logs/2026-05-21T06-23-21-979Z-m121-sdk-docs-audit-runtime-fallback-retry-sdk-write.json`.
- Routine log written under `.codex-runtime/sdk/logs/**`: no.
- Operation file written under `.codex-runtime/sdk/operations/**`: yes.
- Fallback diagnostic report used: no.

## Command Used

```cmd
npm.cmd run codex:orchestrator:write-scaffold -- --operation-file .codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json --acknowledge-existing-change .codex-audit/117r-commit-return-packet.md --acknowledge-existing-change .codex-audit/117r-worktree-reconciliation-return-packet.md
```

## Safety

- No second SDKThread retry was run.
- External-provider validation was not run.
- OpenAI CLI planner validation was not run.
- Mutating-live was not run.
- Live CEP / AE smoke tests were not run.
- Tenant-policy bypass was not attempted.
- Production code was not changed.
- CEP panel code was not changed.
- Network diagnostics were not run.
- Package installation was not run.
- Windows ACLs were not modified.
- `git add .` was not used.
- M121 was not committed.
