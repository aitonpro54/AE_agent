\# M111 SDK Write-Capable Readiness Design



\## Goal

Design the write-capable SDK runner guardrails without implementing or running write-capable SDK project work.



\## Execution mode

Read-only design / planning.



The buffered runner may create the final report file:

\- .codex-audit/111-sdk-write-capable-readiness-design.md



The SDK turn itself must not edit production files directly.



\## Context

M109 is complete:

\- tag sdk-m109-cli-value-validation exists;

\- commit 822127f validates general codex orchestrator CLI options;

\- invalid general CLI values are rejected before SDK thread creation.



M110 is complete:

\- read-only analysis milestones are ready for controlled buffered SDK use;

\- buffered wrapper forces safe read-only options;

\- unsafe or bypass-capable flags are rejected before SDK thread creation;

\- next safe milestone is write-capable SDK readiness design, still non-mutating by default.



\## Scope

Allowed reads:

\- AGENTS.md

\- .codex/handoff.md

\- plans/target-app-execplan.md

\- specs/target-app.md

\- package.json

\- orchestrator/README.md

\- orchestrator/codex-sdk-orchestrator.mjs

\- orchestrator/run-buffered-acceptance.mjs

\- .codex-audit/\*\*

\- git history / tags / current status



Allowed output:

\- create .codex-audit/111-sdk-write-capable-readiness-design.md through the buffered runner



Forbidden:

\- do not modify production code

\- do not modify CEP panel code

\- do not modify orchestrator code in this milestone

\- do not run external-provider validation

\- do not run OpenAI CLI planner validation

\- do not run mutating-live

\- do not run live CEP / AE smoke tests

\- do not bypass tenant policy

\- do not run network diagnostics

\- do not install packages

\- do not commit

\- do not create a write-capable runner yet



\## Tasks

1\. Define the minimum safe contract for a future write-capable SDK runner.

2\. Specify required preflight checks.

3\. Specify allowed write scopes:

&#x20;  - docs/audit-only

&#x20;  - orchestrator-only

&#x20;  - production-code scoped

&#x20;  - CEP panel scoped

4\. Specify forbidden paths by default.

5\. Specify how the runner must validate git diff before and after execution.

6\. Specify when the runner must stop instead of repair-looping.

7\. Specify whether commits are allowed automatically or must remain manual.

8\. Define the next implementation milestone after this design.



\## Required checks

The host should have run:

\- node --check orchestrator/codex-sdk-orchestrator.mjs

\- node --check orchestrator/run-buffered-acceptance.mjs

\- npm.cmd run check:rules

\- git diff --check



\## Final report format



\# M111 SDK Write-Capable Readiness Design



\## Result

pass | partial | fail



\## Current state



\## Write-capable readiness decision



\## Required preflight checks



\## Allowed write scopes



\## Forbidden paths by default



\## Unsafe flags and policy blocks



\## Diff validation contract



\## Repair-loop policy



\## Commit policy



\## Proposed M112 implementation milestone



\## Commands allowed next



\## Commands forbidden



\## Recommendation



\## Done when

\- .codex-audit/111-sdk-write-capable-readiness-design.md exists.

\- No production files are changed.

\- No CEP panel files are changed.

\- No orchestrator code is changed.

\- No live/mutating/external-provider/network validation is run.

