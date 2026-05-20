\# M112 SDK Write-Capable Runner Scaffold



\## Goal

Implement a non-live, contract-tested write-capable SDK runner scaffold without running production write work.



\## Context

M111 is complete:

\- write-capable SDK runner may be implemented only as an explicitly scoped, deny-by-default wrapper;

\- it must not inherit broad workspace-write capability without additional path, git, and policy guards;

\- write-capable runner must enforce explicit scope selection, clean or acknowledged git state, pre/post diff snapshots, path allowlists, forbidden paths, hard stop conditions, and manual commits only.



\## Scope

Allowed:

\- edit orchestrator/\*\*

\- edit package.json

\- edit orchestrator/README.md

\- create .codex-audit/112-sdk-write-capable-runner-scaffold.md



Forbidden:

\- do not modify production code

\- do not modify CEP panel code

\- do not run external-provider validation

\- do not run OpenAI CLI planner validation

\- do not run mutating-live

\- do not run live CEP / AE smoke tests

\- do not bypass tenant policy

\- do not run network diagnostics

\- do not install packages

\- do not execute real production write work

\- do not commit unless explicitly requested by the user



\## Required implementation

1\. Add a write-capable runner scaffold under orchestrator/.

2\. Runner must be deny-by-default.

3\. Runner must require explicit scope:

&#x20;  - docs-audit

&#x20;  - orchestrator

&#x20;  - production-code

&#x20;  - cep-panel

4\. Runner must reject unknown scopes before SDK thread creation.

5\. Runner must reject unsafe/bypass-capable flags before SDK thread creation.

6\. Runner must compute pre-run git status and diff snapshot.

7\. Runner must compute post-run git status and diff snapshot.

8\. Runner must enforce path allowlists per scope.

9\. Runner must define forbidden paths by default.

10\. Runner must hard-stop on:

&#x20;   - dirty unexpected git state;

&#x20;   - forbidden path diff;

&#x20;   - external-provider request;

&#x20;   - live/mutating request;

&#x20;   - tenant-policy bypass request;

&#x20;   - failed validation.

11\. Runner must not auto-commit.

12\. Add local contract smoke coverage.

13\. Ensure `npm.cmd run check:rules` passes.

14\. Update README with the new scaffold and safety contract.

15\. Create `.codex-audit/112-sdk-write-capable-runner-scaffold.md`.



\## Required checks

\- node --check orchestrator/codex-sdk-orchestrator.mjs

\- node --check orchestrator/run-buffered-acceptance.mjs

\- node --check <new write-capable runner file>

\- npm.cmd run codex:orchestrator:help

\- npm.cmd run check:rules

\- git diff --check



\## Done when

\- write-capable runner scaffold exists;

\- local contract smoke verifies scope validation and forbidden flag rejection;

\- no production code is changed;

\- no CEP panel code is changed;

\- no live, mutating, external-provider, network, or package-install commands are run;

\- `.codex-audit/112-sdk-write-capable-runner-scaffold.md` exists.

