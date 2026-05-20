\# M109 SDK Orchestrator CLI Value Validation



\## Goal

Add explicit value validation for the general `codex:orchestrator` CLI without running real provider, live, mutating, or network validation.



\## Context

M108 is complete:

\- `check:rules` runs local non-mutating contract smoke.

\- Buffered acceptance wrapper rejects unsafe/bypass-capable flags before SDK thread creation.

\- Buffered acceptance wrapper forces:

&#x20; - sandboxMode: read-only

&#x20; - approvalPolicy: never

&#x20; - networkAccessEnabled: false

&#x20; - webSearchMode: disabled



Remaining gap:

\- The general `codex:orchestrator` CLI still documents unsafe-capable flags for explicit local experiments.

\- M108 blocks unsafe flags only in buffered acceptance mode.

\- General CLI option values need explicit validation before they can reach SDK thread creation.



\## Scope

Allowed:

\- edit orchestrator/codex-sdk-orchestrator.mjs

\- edit orchestrator/run-buffered-acceptance.mjs only if needed for contract smoke coverage

\- edit orchestrator/README.md

\- edit package.json

\- create .codex-audit/109-sdk-orchestrator-cli-value-validation.md



Forbidden:

\- do not run external-provider validation

\- do not run OpenAI CLI planner validation

\- do not run mutating-live

\- do not run live CEP / AE smoke tests

\- do not bypass tenant policy

\- do not modify production code

\- do not modify CEP panel code

\- do not run broad npm/cache/network diagnostics

\- do not commit unless explicitly requested by the user



\## Tasks

1\. Add explicit option value validation for the general `codex:orchestrator` CLI.

2\. Validation must happen before SDK thread creation.

3\. Reject unknown or malformed values for:

&#x20;  - --sandbox

&#x20;  - --approval

&#x20;  - --web-search

4\. Boolean/bypass-capable flags must be parsed deterministically.

5\. Export validation helpers where useful so contract smoke can test them without running a real SDK turn.

6\. Extend local contract smoke so `npm.cmd run check:rules` verifies:

&#x20;  - safe defaults still hold;

&#x20;  - buffered acceptance still rejects unsafe flags;

&#x20;  - general CLI rejects invalid option values before SDK thread creation.

7\. Update README with the validated values and safety note.

8\. Create `.codex-audit/109-sdk-orchestrator-cli-value-validation.md`.



\## Required checks

\- node --check orchestrator/codex-sdk-orchestrator.mjs

\- node --check orchestrator/run-buffered-acceptance.mjs

\- npm.cmd run codex:orchestrator:help

\- npm.cmd run check:rules

\- git diff --check



\## Done when

\- invalid general CLI values are rejected before SDK thread creation;

\- buffered acceptance safety remains unchanged;

\- `npm.cmd run check:rules` passes;

\- no external-provider, OpenAI CLI planner, mutating-live, production code, CEP panel, network, or npm/cache diagnostics are run;

\- `.codex-audit/109-sdk-orchestrator-cli-value-validation.md` exists.

