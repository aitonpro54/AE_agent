\# M113 SDK Write Runner Local Dry-Run Mode



\## Goal

Add a guarded local dry-run mode to the scoped SDK write-capable runner scaffold without creating SDK threads, without real write work, and without production/CEP changes.



\## Context

M112 is complete:

\- write-capable runner scaffold exists;

\- explicit scope is required;

\- supported scopes are docs-audit, orchestrator, production-code, cep-panel;

\- unknown scopes are rejected before any possible SDK thread creation;

\- unsafe/bypass-capable flags are rejected before any possible SDK thread creation;

\- pre/post git snapshot logic exists;

\- path allowlists and forbidden paths exist;

\- runner does not auto-commit;

\- M112 was non-live and did not create SDK threads.



Next safe step from M112:

\- review M112 diff;

\- add a guarded local dry-run mode only if explicitly approved.



\## Scope

Allowed:

\- edit orchestrator/run-write-capable-scaffold.mjs

\- edit orchestrator/run-buffered-acceptance.mjs only if contract smoke coverage requires it

\- edit orchestrator/README.md

\- edit package.json

\- create .codex-audit/113-sdk-write-runner-local-dry-run-mode.md



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

\- do not create real SDK threads

\- do not perform real write work

\- do not auto-commit

\- do not commit unless explicitly requested by the user



\## Required implementation

1\. Add a guarded local dry-run mode to the write-capable runner scaffold.

2\. Dry-run mode must:

&#x20;  - require explicit scope;

&#x20;  - reject unknown scopes;

&#x20;  - reject unsafe/bypass-capable flags;

&#x20;  - compute or simulate pre-run git snapshot;

&#x20;  - compute planned allowlist/forbidden path checks;

&#x20;  - report whether the requested operation would be allowed;

&#x20;  - not create SDK threads;

&#x20;  - not edit target project files;

&#x20;  - not auto-commit.

3\. Extend local contract smoke so `npm.cmd run check:rules` verifies dry-run behavior.

4\. Update README with dry-run usage and safety constraints.

5\. Create `.codex-audit/113-sdk-write-runner-local-dry-run-mode.md`.



\## Required checks

\- node --check orchestrator/codex-sdk-orchestrator.mjs

\- node --check orchestrator/run-buffered-acceptance.mjs

\- node --check orchestrator/run-write-capable-scaffold.mjs

\- npm.cmd run codex:orchestrator:help

\- npm.cmd run check:rules

\- git diff --check



\## Done when

\- guarded local dry-run mode exists;

\- contract smoke covers dry-run behavior;

\- check:rules passes;

\- no SDK thread is created;

\- no real write work is performed;

\- no production code is changed;

\- no CEP panel code is changed;

\- `.codex-audit/113-sdk-write-runner-local-dry-run-mode.md` exists.

