\# M108 SDK Orchestrator Contract Smoke



\## Goal

Add a non-mutating local contract smoke for the Codex SDK orchestrator wrapper and close the M107 partial acceptance gaps.



\## Context

M107 result was partial:

\- `node --check orchestrator/codex-sdk-orchestrator.mjs` passed.

\- `git diff --check` passed.

\- `npm.cmd run check:rules` failed because `check:rules` is absent from package.json.

\- The orchestrator scaffold is usable, but unsafe-capable flags exist:

&#x20; - `--sandbox danger-full-access`

&#x20; - `--approval on-request`

&#x20; - `--network`

&#x20; - `--web-search live`

\- The orchestrator does not yet validate option values before passing them to SDK.



\## Scope

Allowed:

\- edit orchestrator/\*\*

\- edit package.json

\- edit package-lock.json only if npm script metadata requires it

\- edit orchestrator/README.md

\- create .codex-audit/108-sdk-orchestrator-contract-smoke.md



Forbidden:

\- do not run external-provider validation

\- do not run OpenAI CLI planner validation

\- do not run mutating-live

\- do not modify production code

\- do not modify CEP panel code

\- do not bypass tenant policy

\- do not run broad npm/cache/network diagnostics

\- do not commit unless explicitly requested



\## Tasks

1\. Add a local non-mutating contract smoke for the SDK orchestrator.

2\. The smoke must verify:

&#x20;  - help command works;

&#x20;  - safe defaults are documented or inspectable;

&#x20;  - unsafe flags are rejected in buffered acceptance mode;

&#x20;  - README and package scripts are consistent.

3\. Add a `check:rules` npm script or replace the plan reference with an explicit local equivalent.

4\. Ensure unsafe-capable flags cannot be accidentally used by the buffered acceptance wrapper.

5\. Create `.codex-audit/108-sdk-orchestrator-contract-smoke.md` with:

&#x20;  - Result

&#x20;  - Files changed

&#x20;  - Checks run

&#x20;  - Unsafe flags rejected

&#x20;  - Remaining risks

&#x20;  - Next safe milestone



\## Required checks

\- node --check orchestrator/codex-sdk-orchestrator.mjs

\- node --check orchestrator/run-buffered-acceptance.mjs

\- npm.cmd run codex:orchestrator:help

\- npm.cmd run check:rules

\- git diff --check



\## Done when

\- `npm.cmd run check:rules` passes.

\- unsafe flags are rejected by local contract smoke / wrapper.

\- no external-provider, mutating-live, or production code changes occur.

\- `.codex-audit/108-sdk-orchestrator-contract-smoke.md` exists.

