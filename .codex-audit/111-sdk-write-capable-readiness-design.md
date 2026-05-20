# M111 SDK Write-Capable Readiness Design

## Result
pass

## What was checked
Buffered SDK readiness for M111 was reviewed in analyze-only mode. The design decision is that a future write-capable SDK runner may be implemented only as an explicitly scoped, deny-by-default wrapper. It must not inherit the current general orchestrator’s broad `workspace-write` capability without additional path, git, and policy guards.

## Pre-run validation
Host pre-run checks indicate:
- `node --check` for orchestrator files: no reported errors.
- `npm.cmd run check:rules`: pass.
- `git diff --check`: no reported errors.
- Current branch is ahead of origin by 26 commits.
- Existing untracked items before this run: `.codex-audit/111-sdk-write-capable-readiness-design-spec.md` and `test`.

## Orchestrator readiness
The read-only buffered runner is ready for controlled analysis milestones. Unsafe flags are rejected before SDK thread creation, and buffered runs force:
- `sandboxMode: "read-only"`
- `approvalPolicy: "never"`
- `networkAccessEnabled: false`
- `webSearchMode: "disabled"`

For write-capable readiness, the minimum safe contract should require:
- explicit write scope selection;
- clean or acknowledged git state before execution;
- pre/post diff snapshots;
- path allowlists per scope;
- default forbidden paths;
- hard stop on policy, scope, validation, or unexpected diff violations;
- manual commits only.

Allowed future write scopes should be separate modes:
- docs/audit-only;
- orchestrator-only;
- production-code scoped;
- CEP panel scoped.

## Risks
The general orchestrator can create broader thread options when invoked directly with valid unsafe-capable values. That is acceptable only because buffered acceptance blocks those flags today. A future write-capable runner must not expose generic SDK write access without a stricter wrapper-level contract.

## Blocked items
No write-capable runner should be used yet. Implementation is blocked until M112 defines and tests the wrapper-level enforcement for scope allowlists, forbidden paths, git diff validation, and stop conditions.

## Next safe milestone
M112 should implement a non-live, contract-tested write-capable runner scaffold. It should validate CLI scope values locally, reject unsafe flags, compute pre/post git state, enforce path scopes, and run only local contract smoke tests. It should not execute production write work as part of the implementation milestone.

## Commands allowed next
- `node --check orchestrator/codex-sdk-orchestrator.mjs`
- `node --check orchestrator/run-buffered-acceptance.mjs`
- `npm.cmd run check:rules`
- `git diff --check`
- targeted read-only `git status`, `git diff`, and file reads

## Commands forbidden
- external-provider validation
- OpenAI CLI planner validation
- mutating-live
- live CEP / AE smoke tests
- tenant-policy bypass
- network diagnostics
- package installation
- automatic commits
- production or CEP panel edits during this design milestone

## Notes
The final report structure requested by the host says `M107 SDK Orchestrator Acceptance Smoke`, while the supplied milestone is M111. This report follows the host-requested structure and records the M111 write-capable readiness design decision inside it.