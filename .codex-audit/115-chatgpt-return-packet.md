# M115 Return Packet for ChatGPT Pro

## Result
partial

## One-line verdict
M115 local `sdk-write` contract was implemented and validated, but the one real docs-audit SDKThread write did not create the planned output file.

## SDKThread write status
- SDKThread created: yes (runner reached the `codex.startThread()` path after envelope/preflight validation; no thread id was captured)
- SDKThread completed: no
- SDKThread output file created by SDK: no
- SDKThread output path:
  `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`
- Thread id, if available: unavailable
- If failed, exact failure class: `sdk-write-attempt-failed-output-missing`; runner log capture then failed with `EPERM` for `.codex/sdk/logs/2026-05-20T13-52-39-285Z-m115-sdk-docs-audit-real-write-cutover-sdk-write.json`, masking the original SDK failure detail. The output path was checked after the attempt and did not exist.

## Files changed
- `orchestrator/run-write-capable-scaffold.mjs`
- `orchestrator/run-buffered-acceptance.mjs`
- `orchestrator/README.md`
- `plans/target-app-execplan.md`
- `.codex-audit/115-sdk-docs-audit-real-write-cutover-spec.md`
- `.codex-audit/115-sdk-docs-audit-real-write-cutover.md`
- `.codex-audit/115-chatgpt-return-packet.md`
- `.codex/handoff.md` (ignored by git)
- `.codex/sdk/logs/m115-docs-audit-sdk-write-operation.json` (ignored by git)

Not created:
- `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`

## Files intentionally not staged / ignored
- `.codex/handoff.md` was updated with M115 handoff context and is ignored by `.gitignore`.
- `.codex/sdk/logs/m115-docs-audit-sdk-write-operation.json` is the ignored operation envelope used for the real write attempt.
- `.codex/sdk/logs/2026-05-20T13-52-39-285Z-m115-sdk-docs-audit-real-write-cutover-sdk-write.json` was attempted but not written because of `EPERM`.
- `tratorREADME.md` remains a pre-existing unrelated untracked file and should not be staged for M115.
- No untracked `test` path was observed in final `git status --short --branch`.

## Operation envelope
```json
{
  "version": 1,
  "operationId": "m115-sdk-docs-audit-real-write-cutover",
  "scope": "docs-audit",
  "mode": "sdk-write",
  "prompt": "Create the M115 docs-audit SDKThread output file only.",
  "plannedPaths": [
    ".codex-audit/115-sdk-docs-audit-sdk-thread-output.md"
  ]
}
```

## Commands run
- command: `node --check orchestrator/codex-sdk-orchestrator.mjs`
  - result: pass
  - important output: no syntax errors

- command: `node --check orchestrator/run-buffered-acceptance.mjs`
  - result: pass
  - important output: no syntax errors

- command: `node --check orchestrator/run-write-capable-scaffold.mjs`
  - result: pass
  - important output: no syntax errors

- command: `npm.cmd run codex:orchestrator:help`
  - result: pass
  - important output: printed `Codex SDK orchestrator` help with safe defaults/options.

- command: `npm.cmd run check:rules`
  - result: pass
  - important output: `PASS M115 SDK orchestrator contract smoke`; `Write-capable docs-audit sdk-write mode: pass`.

- command: `git diff --check`
  - result: pass
  - important output: only LF-to-CRLF working-copy warnings for `orchestrator/README.md`, `orchestrator/run-buffered-acceptance.mjs`, `orchestrator/run-write-capable-scaffold.mjs`, and `plans/target-app-execplan.md`.

- command: `git diff --name-only`
  - result: pass
  - important output:
```text
orchestrator/README.md
orchestrator/run-buffered-acceptance.mjs
orchestrator/run-write-capable-scaffold.mjs
plans/target-app-execplan.md
```

- command: `git status --short --branch`
  - result: pass
  - important output:
```text
## codex/roadmap-1.3-planning...origin/codex/roadmap-1.3-planning [ahead 30]
 M orchestrator/README.md
 M orchestrator/run-buffered-acceptance.mjs
 M orchestrator/run-write-capable-scaffold.mjs
 M plans/target-app-execplan.md
?? .codex-audit/115-sdk-docs-audit-real-write-cutover-spec.md
?? .codex-audit/115-sdk-docs-audit-real-write-cutover.md
?? .codex-audit/115-chatgpt-return-packet.md
?? tratorREADME.md
```

- command: `git diff --stat`
  - result: pass
  - important output:
```text
orchestrator/README.md                      |   3 +
orchestrator/run-buffered-acceptance.mjs    |  14 +-
orchestrator/run-write-capable-scaffold.mjs | 624 +++++++++++++++++++++++++++-
plans/target-app-execplan.md                |  27 ++
4 files changed, 646 insertions(+), 22 deletions(-)
```

- command: `Test-Path .codex-audit\115-sdk-docs-audit-sdk-thread-output.md`
  - result: pass
  - important output: `False`

- command: `New-Item -ItemType Directory -Force .codex\sdk\operations`
  - result: fail
  - important output: `Access denied` for creating `.codex/sdk/operations`; operation envelope was instead placed in existing ignored `.codex/sdk/logs/`.

- command: `npm.cmd run codex:orchestrator:write-scaffold -- --operation-file .codex/sdk/logs/m115-docs-audit-sdk-write-operation.json --acknowledge-existing-change orchestrator/README.md --acknowledge-existing-change orchestrator/run-buffered-acceptance.mjs --acknowledge-existing-change orchestrator/run-write-capable-scaffold.mjs --acknowledge-existing-change plans/target-app-execplan.md --acknowledge-existing-change .codex-audit/115-sdk-docs-audit-real-write-cutover-spec.md --acknowledge-existing-change tratorREADME.md`
  - result: fail before SDK thread creation
  - important output: `Dirty unexpected git state before write-capable run: lans/target-app-execplan.md, rchestrator/README.md, rchestrator/run-buffered-acceptance.mjs, rchestrator/run-write-capable-scaffold.mjs`
  - note: this exposed a pre-existing `git status --short` parser bug caused by trimming leading status columns. The bug was fixed and covered in `check:rules`.

- command: `npm.cmd run codex:orchestrator:write-scaffold -- --operation-file .codex/sdk/logs/m115-docs-audit-sdk-write-operation.json --acknowledge-existing-change orchestrator/README.md --acknowledge-existing-change orchestrator/run-buffered-acceptance.mjs --acknowledge-existing-change orchestrator/run-write-capable-scaffold.mjs --acknowledge-existing-change plans/target-app-execplan.md --acknowledge-existing-change .codex-audit/115-sdk-docs-audit-real-write-cutover-spec.md --acknowledge-existing-change tratorREADME.md`
  - result: fail during the one real `sdk-write` attempt
  - important output: `EPERM: operation not permitted, open 'C:\Users\Ant\Documents\Codex\AE_agent\.codex\sdk\logs\2026-05-20T13-52-39-285Z-m115-sdk-docs-audit-real-write-cutover-sdk-write.json'`
  - note: planned output file was absent after the attempt. No second real SDKThread write was run.

- command: `rg -n "m115-sdk-docs-audit-real-write-cutover|M115 SDKThread docs-audit writer" C:\Users\Ant\.codex -g "*.jsonl" -g "*.json"`
  - result: pass
  - important output: found current/guardian session references to the M115 operation, but no usable SDK thread id for the real write attempt.

- command: `git check-ignore -v .codex\sdk\logs\m115-docs-audit-sdk-write-operation.json`
  - result: pass
  - important output: `.gitignore:14:.codex/`

## Diff allowlist result
- plannedPaths:
  - `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`
- actual changed files:
  - `orchestrator/README.md`
  - `orchestrator/run-buffered-acceptance.mjs`
  - `orchestrator/run-write-capable-scaffold.mjs`
  - `plans/target-app-execplan.md`
  - `.codex-audit/115-sdk-docs-audit-real-write-cutover-spec.md`
  - `.codex-audit/115-sdk-docs-audit-real-write-cutover.md`
  - `.codex-audit/115-chatgpt-return-packet.md`
  - `.codex/handoff.md` (ignored)
  - `.codex/sdk/logs/m115-docs-audit-sdk-write-operation.json` (ignored)
  - `tratorREADME.md` (pre-existing unrelated untracked)
- allowed implementation/report files:
  - `orchestrator/run-write-capable-scaffold.mjs`
  - `orchestrator/run-buffered-acceptance.mjs`
  - `orchestrator/README.md`
  - `package.json`
  - `plans/target-app-execplan.md`
  - `.codex/handoff.md`
  - `.codex-audit/115-sdk-docs-audit-real-write-cutover-spec.md`
  - `.codex-audit/115-sdk-docs-audit-real-write-cutover.md`
  - `.codex-audit/115-chatgpt-return-packet.md`
- out-of-scope files:
  - `tratorREADME.md` (pre-existing unrelated untracked, not touched for M115)
- verdict: fail, because planned SDK output path was not created by the SDKThread attempt.

## Safety assertions
- external-provider validation was not run: yes
- OpenAI CLI planner validation was not run: yes
- mutating-live was not run: yes
- live CEP / AE smoke tests were not run: yes
- tenant-policy bypass was not attempted: yes
- production code was not changed: yes
- CEP panel code was not changed: yes
- network diagnostics were not run: yes
- package installation was not run: yes
- auto-commit was not performed: yes

## Git status at end
```text
## codex/roadmap-1.3-planning...origin/codex/roadmap-1.3-planning [ahead 30]
 M orchestrator/README.md
 M orchestrator/run-buffered-acceptance.mjs
 M orchestrator/run-write-capable-scaffold.mjs
 M plans/target-app-execplan.md
?? .codex-audit/115-sdk-docs-audit-real-write-cutover-spec.md
?? .codex-audit/115-sdk-docs-audit-real-write-cutover.md
?? .codex-audit/115-chatgpt-return-packet.md
?? tratorREADME.md
```

## Recommended commit commands
Do not commit automatically. If reviewer approves a partial M115 commit, use exact adds only:

```powershell
git add orchestrator/run-write-capable-scaffold.mjs
git add orchestrator/run-buffered-acceptance.mjs
git add orchestrator/README.md
git add plans/target-app-execplan.md
git add .codex-audit/115-sdk-docs-audit-real-write-cutover-spec.md
git add .codex-audit/115-sdk-docs-audit-real-write-cutover.md
git add .codex-audit/115-chatgpt-return-packet.md
```

Do not add `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`; it does not exist and must not be created manually.

## Files that must not be committed
- `.codex/handoff.md`
- `.codex/sdk/logs/m115-docs-audit-sdk-write-operation.json`
- `.codex/sdk/logs/**`
- `tratorREADME.md`
- `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md` unless a future explicitly approved SDKThread write actually creates it

## Remaining risks
- The real SDKThread failure detail is unavailable because the first real attempt was masked by the `.codex/sdk/logs` `EPERM` log-write failure before non-fatal logging was patched.
- No planned SDK output file exists, so M115 did not prove real docs-audit write success.
- The runner implementation changed substantially; although `check:rules` passes, external review should inspect the exact allowlist and failure handling before another real write.
- `plans/target-app-execplan.md` includes prior M114 notes plus short M115 partial notes; review before staging if a narrow M115-only commit is desired.

## Next safe milestone
M115 Follow-up: diagnose the SDK write failure without running another real SDKThread write, then request separate explicit approval before any retry.
