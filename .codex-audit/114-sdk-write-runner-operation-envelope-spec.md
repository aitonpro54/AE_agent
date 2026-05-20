\# M114 SDK Write Runner Planned Operation Envelope



\## Goal

Add a local structured planned-operation envelope for future write-capable runner work, without SDK thread creation and without real writes.



\## Context

M113 is complete:

\- guarded local `--dry-run` exists for the write-capable scaffold;

\- dry-run requires `--scope` and `--prompt`;

\- dry-run accepts repeated `--planned-path`;

\- dry-run captures local pre-run git state;

\- dry-run checks planned paths;

\- dry-run returns `dry-run-allowed` or `dry-run-denied`;

\- dry-run reports:

&#x20; - sdkThreadCreated: false

&#x20; - realWriteWork: false

&#x20; - autoCommit: false

\- dry-run does not infer target files from prompt text; callers must pass `--planned-path`.



Next safe step:

\- add a local structured planned-operation envelope for future write runner work;

\- still no SDK thread creation;

\- still no real writes.



\## Scope

Allowed:

\- edit orchestrator/run-write-capable-scaffold.mjs

\- edit orchestrator/run-buffered-acceptance.mjs only if contract smoke coverage requires it

\- edit orchestrator/README.md

\- edit package.json

\- create .codex-audit/114-sdk-write-runner-operation-envelope.md



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

\- do not create SDK threads

\- do not perform real write work

\- do not auto-commit

\- do not commit unless explicitly requested by the user



\## Required implementation

1\. Add support for a local planned-operation envelope.

2\. The envelope must be read from a local file, for example:

&#x20;  - `--operation-file <path>`

3\. The envelope must be validated before any possible SDK thread creation.

4\. The envelope must include at minimum:

&#x20;  - version

&#x20;  - operationId

&#x20;  - scope

&#x20;  - mode

&#x20;  - prompt

&#x20;  - plannedPaths

5\. Supported mode for this milestone:

&#x20;  - dry-run

6\. Supported scopes remain:

&#x20;  - docs-audit

&#x20;  - orchestrator

&#x20;  - production-code

&#x20;  - cep-panel

7\. The runner must reject:

&#x20;  - missing operation file

&#x20;  - operation file outside the repo

&#x20;  - malformed JSON

&#x20;  - unsupported version

&#x20;  - missing operationId

&#x20;  - missing or unknown scope

&#x20;  - mode other than dry-run

&#x20;  - missing prompt

&#x20;  - missing or empty plannedPaths

&#x20;  - unsafe path shapes

&#x20;  - forbidden paths

&#x20;  - paths outside the selected scope allowlist

&#x20;  - unsafe/bypass-capable flags

8\. Envelope dry-run must still report:

&#x20;  - sdkThreadCreated: false

&#x20;  - realWriteWork: false

&#x20;  - autoCommit: false

9\. Extend local contract smoke so `npm.cmd run check:rules` verifies operation-envelope behavior.

10\. Update README with operation envelope usage and safety constraints.

11\. Create `.codex-audit/114-sdk-write-runner-operation-envelope.md`.



\## Required checks

\- node --check orchestrator/codex-sdk-orchestrator.mjs

\- node --check orchestrator/run-buffered-acceptance.mjs

\- node --check orchestrator/run-write-capable-scaffold.mjs

\- npm.cmd run codex:orchestrator:help

\- npm.cmd run check:rules

\- git diff --check



\## Done when

\- local operation envelope support exists;

\- operation envelope validation is covered by contract smoke;

\- check:rules passes;

\- no SDK thread is created;

\- no real write work is performed;

\- no production code is changed;

\- no CEP panel code is changed;

\- `.codex-audit/114-sdk-write-runner-operation-envelope.md` exists.

