# M121 Return Packet for ChatGPT Pro

## Result
partial

## One-line verdict
Коротко: the docs-audit SDKThread write retry succeeded and created the planned output, but runtime fallback was not fully exercised because the runner selected writable `.codex/sdk` for the routine log; needs Pro review before any M121 commit.

## M120 commit gate
- M120 commit created: yes
- M120 commit hash: `bb4c007ce454fa4478fbade1acbfb132808bfa8b`
- M120 tag created: yes
- M120 tag name: `sdk-m120-sdk-runtime-path-hardening`
- M120 tag target: `bb4c007ce454fa4478fbade1acbfb132808bfa8b`
- committed files:
  - `.codex-audit/120-chatgpt-return-packet.md`
  - `.codex-audit/120-sdk-runtime-path-hardening.md`
  - `.gitignore`
  - `orchestrator/README.md`
  - `orchestrator/run-buffered-acceptance.mjs`
  - `orchestrator/run-write-capable-scaffold.mjs`
  - `plans/target-app-execplan.md`
- files intentionally not committed:
  - `.codex/handoff.md`
  - `.codex/sdk/**`
  - `.codex-runtime/**`
  - `.codex-audit/117r-commit-return-packet.md`
  - `.codex-audit/117r-worktree-reconciliation-return-packet.md`
  - `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`
  - `.codex-audit/117-sdk-docs-audit-sdk-thread-output.md`
  - `.codex-audit/118-sdk-docs-audit-sdk-thread-output.md`
  - `.codex-audit/121-sdk-docs-audit-sdk-thread-output.md`

## Precondition gate for M121
- M120 tag present: yes
- tracked diff clean before M121: yes
- staged diff clean before M121: yes
- `.codex-runtime/` ignored: yes
- preexisting M115 SDK output present: no
- preexisting M117 SDK output present: no
- preexisting M118 SDK output present: no
- preexisting M121 SDK output present: no
- allowed audit-only untracked packets present: yes
- gate verdict: pass
- if failed, exact reason: n/a

## SDKThread retry status
- SDKThread retry performed during M121: yes
- number of SDKThread write attempts during M121: 1
- SDK thread created: yes
- SDKThread completed: yes
- thread id, if available: `019e4933-7359-72c3-b8aa-128596ce647c`
- planned output created by SDKThread: yes
- planned output path:
  `.codex-audit/121-sdk-docs-audit-sdk-thread-output.md`
- if failed, exact failure class: n/a; SDKThread completed and planned output was created
- original SDK error preserved: unclear (not applicable; no SDK failure was reported)
- primary runtime path: `.codex/sdk`
- fallback runtime path: `.codex-runtime/sdk`
- selected runtime path: `.codex/sdk`
- operation envelope path: `.codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json`
- routine log path, if any: `.codex/sdk/logs/2026-05-21T06-23-21-979Z-m121-sdk-docs-audit-runtime-fallback-retry-sdk-write.json`
- fallback diagnostic report used: no
- fallback diagnostic report path, if any: n/a

## Operation envelope
Path: `.codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json`

```json
{
  "version": 1,
  "operationId": "m121-sdk-docs-audit-runtime-fallback-retry",
  "scope": "docs-audit",
  "mode": "sdk-write",
  "prompt": "Create only `.codex-audit/121-sdk-docs-audit-sdk-thread-output.md`. Do not edit any other file.",
  "plannedPaths": [
    ".codex-audit/121-sdk-docs-audit-sdk-thread-output.md"
  ]
}
```

## Files changed
- `plans/target-app-execplan.md`
- `.codex-audit/121-sdk-docs-audit-sdk-thread-output.md`
- `.codex-audit/121-sdk-docs-audit-runtime-fallback-retry.md`
- `.codex-audit/121-chatgpt-return-packet.md`
- `.codex/handoff.md` (ignored/local)
- `.codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json` (ignored runtime)
- `.codex/sdk/logs/2026-05-21T06-23-21-979Z-m121-sdk-docs-audit-runtime-fallback-retry-sdk-write.json` (ignored SDK runtime log)

Pre-existing untracked audit-only files still present and not staged:
- `.codex-audit/117r-commit-return-packet.md`
- `.codex-audit/117r-worktree-reconciliation-return-packet.md`

## Commands run
- `git status --short --branch`
  - result: pass
  - important M120 gate output:
```text
## codex/roadmap-1.3-planning...origin/codex/roadmap-1.3-planning [ahead 35]
 M .gitignore
 M orchestrator/README.md
 M orchestrator/run-buffered-acceptance.mjs
 M orchestrator/run-write-capable-scaffold.mjs
 M plans/target-app-execplan.md
?? .codex-audit/117r-commit-return-packet.md
?? .codex-audit/117r-worktree-reconciliation-return-packet.md
?? .codex-audit/120-chatgpt-return-packet.md
?? .codex-audit/120-sdk-runtime-path-hardening.md
```
  - important M121 precondition output:
```text
## codex/roadmap-1.3-planning...origin/codex/roadmap-1.3-planning [ahead 36]
?? .codex-audit/117r-commit-return-packet.md
?? .codex-audit/117r-worktree-reconciliation-return-packet.md
```

- `git log --oneline -16 --decorate`
  - result: pass
  - important output after M120 commit/tag:
```text
bb4c007 (HEAD -> codex/roadmap-1.3-planning, tag: sdk-m120-sdk-runtime-path-hardening) test: harden sdk runtime path fallback
85cfe85 (tag: sdk-m119-sdk-disconnect-permission-diagnostics) test: record sdk disconnect permission diagnostics
bab5451 (tag: sdk-m118-docs-audit-sdk-write-retry-partial) test: record docs-audit sdk write retry diagnostics
888ee05 (tag: sdk-m117r-sdk-write-plannedpath-generalization) test: harden sdk write planned path validation
5832dc3 (tag: sdk-m116-sdk-write-diagnostics) test: harden sdk write failure diagnostics
69a1d12 (tag: sdk-m115-docs-audit-sdk-write-partial) test: harden sdk write failure diagnostics
```

- `git tag --list sdk-m119-sdk-disconnect-permission-diagnostics`
  - result: pass
  - important output: `sdk-m119-sdk-disconnect-permission-diagnostics`

- `git tag --list sdk-m120-sdk-runtime-path-hardening`
  - result: pass
  - important output: `sdk-m120-sdk-runtime-path-hardening`

- `git diff --check`
  - result: pass
  - important M120 gate output: LF-to-CRLF warnings only for `.gitignore`, `orchestrator/README.md`, `orchestrator/run-buffered-acceptance.mjs`, `orchestrator/run-write-capable-scaffold.mjs`, and `plans/target-app-execplan.md`.
  - important M121 precondition output: no output.
  - important post-M121 output: no whitespace errors; LF-to-CRLF warning may appear for `plans/target-app-execplan.md`.

- `git diff --name-only`
  - result: pass
  - important M120 gate output:
```text
.gitignore
orchestrator/README.md
orchestrator/run-buffered-acceptance.mjs
orchestrator/run-write-capable-scaffold.mjs
plans/target-app-execplan.md
```
  - important M121 precondition output: empty.

- `git diff --stat`
  - result: pass
  - important M120 gate output:
```text
 .gitignore                                  |   1 +
 orchestrator/README.md                      |   4 +-
 orchestrator/run-buffered-acceptance.mjs    |  18 +-
 orchestrator/run-write-capable-scaffold.mjs | 273 ++++++++++++++++++++++++----
 plans/target-app-execplan.md                |  11 ++
 5 files changed, 269 insertions(+), 38 deletions(-)
```
  - important M121 precondition output: empty.

- `git diff --cached --name-only`
  - result: pass
  - before M120 staging: empty.
  - after M120 exact-path staging:
```text
.codex-audit/120-chatgpt-return-packet.md
.codex-audit/120-sdk-runtime-path-hardening.md
.gitignore
orchestrator/README.md
orchestrator/run-buffered-acceptance.mjs
orchestrator/run-write-capable-scaffold.mjs
plans/target-app-execplan.md
```
  - M121 precondition output: empty.

- `git diff --cached --check`
  - result: pass
  - important output before M120 commit: no output.

- M120 exact-path staging
  - result: pass
  - command used:
```cmd
git add .gitignore orchestrator\run-write-capable-scaffold.mjs orchestrator\run-buffered-acceptance.mjs orchestrator\README.md .codex-audit\120-sdk-runtime-path-hardening.md .codex-audit\120-chatgpt-return-packet.md plans\target-app-execplan.md
```
  - important output: LF-to-CRLF warnings only.

- `git commit -m "test: harden sdk runtime path fallback"`
  - result: pass
  - important output:
```text
[codex/roadmap-1.3-planning bb4c007] test: harden sdk runtime path fallback
 7 files changed, 645 insertions(+), 38 deletions(-)
 create mode 100644 .codex-audit/120-chatgpt-return-packet.md
 create mode 100644 .codex-audit/120-sdk-runtime-path-hardening.md
```

- `git tag sdk-m120-sdk-runtime-path-hardening HEAD`
  - result: pass
  - important output: no output.

- `node --check orchestrator/codex-sdk-orchestrator.mjs`
  - result: pass
  - important output: no syntax errors.

- `node --check orchestrator/run-buffered-acceptance.mjs`
  - result: pass
  - important output: no syntax errors.

- `node --check orchestrator/run-write-capable-scaffold.mjs`
  - result: pass
  - important output: no syntax errors.

- `npm.cmd run codex:orchestrator:help`
  - result: pass
  - important output: printed `Codex SDK orchestrator` help with default `sandbox read-only`, `approval never`, `network` flag, `web-search` option, and no thread creation.

- `npm.cmd run check:rules`
  - result: pass
  - important output:
```text
PASS M117R SDK orchestrator contract smoke
Invalid general CLI values rejected before SDK thread creation
Write-capable local dry-run mode: pass
Write-capable operation envelope mode: pass
Write-capable docs-audit sdk-write mode: pass
Write-capable sdk-write diagnostic logging mode: pass
Write-capable sdk runtime fallback mode: pass
```

- SDK write command used
  - result: pass
  - command:
```cmd
npm.cmd run codex:orchestrator:write-scaffold -- --operation-file .codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json --acknowledge-existing-change .codex-audit/117r-commit-return-packet.md --acknowledge-existing-change .codex-audit/117r-worktree-reconciliation-return-packet.md
```
  - important output:
```text
Result: sdk-write-completed
Scope: docs-audit
Operation: m121-sdk-docs-audit-runtime-fallback-retry
Operation file: .codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json
SDK thread created: true
SDK thread completed: true
Thread id: 019e4933-7359-72c3-b8aa-128596ce647c
Real write work: true
SDK runtime: .codex/sdk
SDK output path: .codex-audit/121-sdk-docs-audit-sdk-thread-output.md
SDK output file created: true
Changed since pre-run: .codex-audit/121-sdk-docs-audit-sdk-thread-output.md
SDK log: .codex/sdk/logs/2026-05-21T06-23-21-979Z-m121-sdk-docs-audit-runtime-fallback-retry-sdk-write.json
```

- targeted runtime log/operation checks
  - result: pass
  - important output:
```text
.codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json exists
.codex-runtime/sdk/logs/** had no M121 log file
.codex/sdk/logs/2026-05-21T06-23-21-979Z-m121-sdk-docs-audit-runtime-fallback-retry-sdk-write.json exists
runtime.primaryWritable=True
runtime.fallbackWritable=True
runtime.selectedRuntimePath=.codex/sdk
runtime.reasonSelected=primary-runtime-writable
postContract.verdict=pass
postContract.actualChangedFiles=.codex-audit/121-sdk-docs-audit-sdk-thread-output.md
```

- targeted planned output existence checks
  - result: pass
  - important output:
```text
.codex-audit\115-sdk-docs-audit-sdk-thread-output.md=False
.codex-audit\117-sdk-docs-audit-sdk-thread-output.md=False
.codex-audit\118-sdk-docs-audit-sdk-thread-output.md=False
.codex-audit\121-sdk-docs-audit-sdk-thread-output.md=True
```

- final `git status --short --branch`
  - result: pass
  - important output: see `Current git status` section below.

## Diff allowlist result
- plannedPaths:
  - `.codex-audit/121-sdk-docs-audit-sdk-thread-output.md`
- actual changed files:
  - `.codex-audit/121-sdk-docs-audit-sdk-thread-output.md`
  - `.codex-audit/121-sdk-docs-audit-runtime-fallback-retry.md`
  - `.codex-audit/121-chatgpt-return-packet.md`
  - `plans/target-app-execplan.md`
  - `.codex/handoff.md` (ignored/local)
  - `.codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json` (ignored runtime)
  - `.codex/sdk/logs/2026-05-21T06-23-21-979Z-m121-sdk-docs-audit-runtime-fallback-retry-sdk-write.json` (ignored runtime log)
- allowed report/operation files:
  - `.codex-audit/121-sdk-docs-audit-runtime-fallback-retry.md`
  - `.codex-audit/121-chatgpt-return-packet.md`
  - `plans/target-app-execplan.md`
  - `.codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json`
  - `.codex/handoff.md` (ignored/local)
- allowed runtime files:
  - `.codex-runtime/sdk/operations/m121-sdk-docs-audit-runtime-fallback-retry-operation.json`
  - `.codex/sdk/logs/2026-05-21T06-23-21-979Z-m121-sdk-docs-audit-runtime-fallback-retry-sdk-write.json` (ignored, but selected primary runtime rather than expected fallback)
- allowed audit-only untracked packets:
  - `.codex-audit/117r-commit-return-packet.md`
  - `.codex-audit/117r-worktree-reconciliation-return-packet.md`
- out-of-scope files: none in tracked diff or SDK post-run changed files; runtime selection mismatch requires review.
- verdict: pass for diff allowlist, partial for runtime-fallback objective.

## Safety assertions
- no second SDKThread retry was run: yes
- external-provider validation was not run: yes
- OpenAI CLI planner validation was not run: yes
- mutating-live was not run: yes
- live CEP / AE smoke tests were not run: yes
- tenant-policy bypass was not attempted: yes
- production code was not changed: yes
- CEP panel code was not changed: yes
- network diagnostics were not run: yes
- package installation was not run: yes
- Windows ACLs were not modified: yes
- `git add .` was not used: yes
- M121 was not committed: yes

## Current git status
```text
## codex/roadmap-1.3-planning...origin/codex/roadmap-1.3-planning [ahead 36]
 M plans/target-app-execplan.md
?? .codex-audit/117r-commit-return-packet.md
?? .codex-audit/117r-worktree-reconciliation-return-packet.md
?? .codex-audit/121-chatgpt-return-packet.md
?? .codex-audit/121-sdk-docs-audit-runtime-fallback-retry.md
?? .codex-audit/121-sdk-docs-audit-sdk-thread-output.md
```

## Diff review
- path: `.codex-audit/121-sdk-docs-audit-sdk-thread-output.md`
  - belongs to M121: yes
  - safe to stage: yes, after ChatGPT Pro review
  - reason: planned SDKThread output; runner reported `outputFileCreatedBySdk=True` and post-run contract verdict `pass`.

- path: `.codex-audit/121-sdk-docs-audit-runtime-fallback-retry.md`
  - belongs to M121: yes
  - safe to stage: yes, after ChatGPT Pro review
  - reason: required M121 audit report and includes the runtime selection mismatch.

- path: `.codex-audit/121-chatgpt-return-packet.md`
  - belongs to M121: yes
  - safe to stage: yes, after ChatGPT Pro review
  - reason: required self-contained return packet for the ChatGPT Pro loop.

- path: `.codex-runtime/**`
  - belongs to M121: local runtime only
  - safe to stage: no
  - reason: ignored runtime area; contains the operation envelope under `.codex-runtime/sdk/operations/**` and no M121 routine log.

- path: `.codex/sdk/**`
  - belongs to M121: local runtime log only
  - safe to stage: no
  - reason: ignored SDK runtime state; M121 log was written under `.codex/sdk/logs/**` because primary runtime was selected as writable.

- path: `.codex-audit/117r-commit-return-packet.md`
  - belongs to M121: no
  - safe to stage: no
  - reason: pre-existing untracked M117R audit-only packet.

- path: `.codex-audit/117r-worktree-reconciliation-return-packet.md`
  - belongs to M121: no
  - safe to stage: no
  - reason: pre-existing untracked M117R reconciliation packet.

- path: `plans/target-app-execplan.md`
  - belongs to M121: yes
  - safe to stage: yes, after ChatGPT Pro review
  - reason: short M121 Progress/Milestone/Decision/Validation note; diff is under 30 lines.

- path: `.codex/handoff.md`
  - belongs to M121: local continuation context only
  - safe to stage: no
  - reason: ignored local handoff file.

- path: `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`
  - belongs to M121: no
  - safe to stage: no
  - reason: absent.

- path: `.codex-audit/117-sdk-docs-audit-sdk-thread-output.md`
  - belongs to M121: no
  - safe to stage: no
  - reason: absent.

- path: `.codex-audit/118-sdk-docs-audit-sdk-thread-output.md`
  - belongs to M121: no
  - safe to stage: no
  - reason: absent.

## Recommended commit classification
needs-human-review

## Recommended commit commands
Do not commit M121 until ChatGPT Pro reviews this packet. If the reviewer accepts the partial/review-needed result, use exact paths only:

```cmd
git add plans\target-app-execplan.md
git add .codex-audit\121-sdk-docs-audit-sdk-thread-output.md
git add .codex-audit\121-sdk-docs-audit-runtime-fallback-retry.md
git add .codex-audit\121-chatgpt-return-packet.md
```

Do not add `.codex\**`, `.codex-runtime\**`, `.codex-audit\117r-commit-return-packet.md`, `.codex-audit\117r-worktree-reconciliation-return-packet.md`, `.codex-audit\115-sdk-docs-audit-sdk-thread-output.md`, `.codex-audit\117-sdk-docs-audit-sdk-thread-output.md`, or `.codex-audit\118-sdk-docs-audit-sdk-thread-output.md`.
