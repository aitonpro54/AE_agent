# Codex SDK Orchestrator

Этот каталог содержит минимальный JavaScript-оркестратор для локальной проверки `@openai/codex-sdk`.

## Текущее состояние

- `@openai/codex-sdk` установлен как production dependency.
- `tsx` и `typescript` пока не установлены: доступ к `registry.npmjs.org:443` завершается `EIDLETIMEOUT`.
- Поэтому стартовый оркестратор написан как `.mjs` и не требует TypeScript toolchain.

## Запуск

Показать параметры:

```powershell
npm.cmd run codex:orchestrator:help
```

Запустить read-only turn в текущем репозитории:

```powershell
npm.cmd run codex:orchestrator -- --prompt "Summarize this repository status"
```

По умолчанию оркестратор использует безопасные параметры SDK: `sandboxMode: "read-only"`, `approvalPolicy: "never"`, `networkAccessEnabled: false`, `webSearchMode: "disabled"`.

## General CLI value validation

Invalid values are rejected before any SDK thread is created. Это локальная проверка аргументов общего `codex:orchestrator` CLI; она не запускает provider/live/network validation.

Проверяемые значения:

- `--sandbox`: `read-only`, `workspace-write`, `danger-full-access`
- `--approval`: `never`, `on-request`, `on-failure`, `untrusted`
- `--web-search`: `disabled`, `cached`, `live`

Boolean flags принимаются как bare flags или с явным `=true`/`=false`. Например, `--network` и `--network=false` валидны, а `--network=enabled` отклоняется. То же правило применяется к bypass-capable boolean flags, включая `--skip-git-repo-check=yes`.

Если нужно продолжить существующую Codex thread:

```powershell
npm.cmd run codex:orchestrator -- --resume <thread-id> --prompt "Continue from the previous result"
```

## Write-capable runner scaffold

M112 добавляет non-live scaffold для будущего write-capable SDK runner:

```powershell
npm.cmd run codex:orchestrator:write-scaffold -- --scope orchestrator --prompt "Implement a narrow orchestrator change"
npm.cmd run codex:orchestrator:write-scaffold -- --dry-run --operation-file .codex-audit/m114-operation-envelope.json
npm.cmd run codex:orchestrator:write-scaffold -- --operation-file .codex-runtime/sdk/operations/m115-docs-audit-sdk-write.json
npm.cmd run codex:orchestrator:write-scaffold:contract
```

Scaffold deny-by-default: он не импортирует SDK, не создает thread, не выполняет реальную write-работу и не делает auto-commit. Он локально проверяет будущий contract, снимает pre/post git status and diff snapshots и возвращает would-be thread options с `sandboxMode: "workspace-write"`, `approvalPolicy: "never"`, `networkAccessEnabled: false`, `webSearchMode: "disabled"`.

M113 dry-run core включается только явным `--dry-run`: он локально policy-scan'ит prompt, снимает pre-run git snapshot, проверяет planned paths against active scope allowlist и default forbidden path patterns, затем возвращает `dry-run-allowed` или `dry-run-denied`. Dry-run не импортирует SDK, не создает thread, не редактирует target files, не выполняет real write work и не делает auto-commit.

M114 dry-run CLI принимает structured planned-operation envelope из локального JSON-файла:

```json
{
  "version": 1,
  "operationId": "m114-example",
  "scope": "orchestrator",
  "mode": "dry-run",
  "prompt": "Check the write runner envelope contract.",
  "plannedPaths": [
    "orchestrator/run-write-capable-scaffold.mjs",
    "orchestrator/README.md"
  ]
}
```

Запуск envelope dry-run:

```powershell
npm.cmd run codex:orchestrator:write-scaffold -- --dry-run --operation-file .codex-audit/m114-operation-envelope.json
```

Envelope file must live inside the repo and is validated before any possible SDK thread creation. M114 supports only `version: 1` and `mode: "dry-run"`. The envelope must include `operationId`, `scope`, `prompt`, and a non-empty `plannedPaths` array. Envelope validation rejects malformed JSON, missing/unknown scope, unsupported mode/version, missing prompt, missing/empty planned paths, unsafe path shapes, forbidden paths, paths outside the active scope allowlist, and unsafe/bypass-capable CLI flags or envelope fields.

Envelope dry-run reports `sdkThreadCreated:false`, `realWriteWork:false`, and `autoCommit:false`. Planned paths outside the active scope allowlist or inside forbidden paths are rejected without touching the working tree.

`sdk-write` uses the same operation envelope and is accepted only for enabled scope-specific lanes with `mode:"sdk-write"`. M117R generalizes docs-audit planned outputs from the original M115 single-file allowlist to any non-empty `plannedPaths` set under `.codex-audit/**`, after the same unsafe path shape checks, forbidden path checks, and docs-audit scope allowlist validation. M123 adds the first orchestrator-scope SDK write lane for docs-only Markdown planned paths under `orchestrator/**`, such as `orchestrator/m123-sdk-thread-orchestrator-scope-output.md`. M125 adds a second orchestrator lane for non-executable JSON fixtures only under `orchestrator/fixtures/sdk-write/**`, such as `orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json`; `.js`, `.mjs`, `.ts`, `.tsx`, `.cmd`, `.bat`, and `.ps1` fixture paths are rejected. M135 adds the first production-code lane only for `scripts/provider-contract-smoke.js`; M152 supersedes the current production-code SDK-write allowlist with exactly `scripts/provider-api-smoke.js` and `scripts/provider-contract-smoke.js`. Broad `scripts/**`, `package.json` as a planned SDK output, other production-code paths, CEP paths such as `cep-panel/**`, runtime paths, and paths such as `src/**`, `specs/**`, `../outside.json`, `.env`, `node_modules/**`, `.git/**`, credential paths, and `package-lock.json` are rejected before SDK thread creation. The SDK prompt is constrained to the validated planned path set, auto-commit remains disabled, and the runner captures pre/post git snapshots plus `git diff --check`. After the SDK turn, the runner hard-stops if the changed-since-pre diff includes anything outside the planned path set. If Git reports a newly-created untracked parent directory for a planned nested output, the runner recursively enumerates that directory and normalizes the parent away only when every actual child file is an explicitly planned SDK output; enumeration failure, empty directories, unplanned children, executable children, forbidden paths, sensitive paths, package-lock churn, git metadata churn, or out-of-scope children still fail closed.

M116 hardens SDK write diagnostics without retrying real write work. M120 adds a runtime preflight for SDK write logs and operation envelopes: the runner prefers `.codex/sdk`, verifies that both `logs` and `operations` can be created and written, then falls back to the ignored `.codex-runtime/sdk` runtime when `.codex/sdk` is missing or not writable. Routine SDK logs and operation-envelope paths use the selected runtime, for example `.codex-runtime/sdk/operations/<operation>-operation.json` when the fallback is selected. If selected-runtime log writing still fails, including `EPERM`, the original SDK/post-run error remains in the console failure message and the runner attempts only the reviewable diagnostic report under `.codex-audit/<operation>-sdk-write-failure-diagnostics.md`.

## SDK scope expansion acceptance gate

M127 adds a local-only acceptance gate for future SDK write scope expansion. `docs-audit` and controlled `orchestrator` outputs started as the only enabled `sdk-write` scopes; broad `production-code` and `cep-panel` remain review-required and rejected before any SDK thread can be created unless a later committed lane artifact enables a narrower path allowlist.

## SDK scope expansion review packet gate

M128 adds a local review-packet contract for any future proposal to expand SDK write scopes. Review packets use schema `sdk-scope-expansion-review.v1` and should live under `.codex-audit/sdk-scope-expansion-reviews/`. A packet can describe a proposed `production-code` or `cep-panel` lane, but it must keep `sdkWriteEnabled:false`, include a narrow planned path allowlist, validation plan, and rollback plan, and it does not create an SDK thread or enable a write lane.

M129 adds the first committed review packet, `.codex-audit/sdk-scope-expansion-reviews/129-production-code-smoke-harness-review.json`, for a future `production-code` scripts-only lane. `check:rules` validates committed review packet JSON files with the same local contract while unapproved production-code and CEP-panel SDK writes remain disabled.

M132 adds a second committed review packet, `.codex-audit/sdk-scope-expansion-reviews/132-cep-panel-composer-review.json`, for a future narrow `cep-panel` lane. This remains a proposed review artifact only: `sdkWriteEnabled:false`, no SDK thread creation, and no CEP-panel write enablement.

M133 adds a local readiness gate for the first future `production-code` write lane proposed by M129. Readiness packets use schema `sdk-write-lane-readiness.v1` and live under `.codex-audit/sdk-write-lane-readiness/`. The first readiness artifact, `.codex-audit/sdk-write-lane-readiness/133-production-code-smoke-harness-readiness.json`, must point back to the M129 review packet, keep `approvalState:"pending-explicit-approval"` and `sdkWriteEnabled:false`, and match the reviewed allowlist `scripts/provider-contract-smoke.js`. It prepares a later approval milestone but does not create an SDK thread or enable production-code writes.

M134 records the explicit approval decision state for that M129/M133 lane. Approval decision packets use schema `sdk-write-lane-approval-decision.v1` and live under `.codex-audit/sdk-write-lane-approval-decisions/`. The M134 decision artifact keeps `approvalState:"pending-explicit-approval"`, `explicitApprovalRecorded:false`, and `sdkWriteEnabled:false`; it proves that a continuation prompt without explicit approval cannot enable production-code writes or broaden the reviewed `scripts/provider-contract-smoke.js` lane.

M135 enables the first `production-code` SDK write lane after explicit user approval. Enablement packets use schema `sdk-write-lane-enablement.v1` and live under `.codex-audit/sdk-write-lane-enablement/`. The first enablement artifact, `.codex-audit/sdk-write-lane-enablement/135-production-code-smoke-harness-enable.json`, points back to M134/M133/M129, records `approvalState:"approved"`, `explicitApprovalRecorded:true`, and `sdkWriteEnabled:true`, and allows only `scripts/provider-contract-smoke.js`. Other production-code paths, including `mcp-server/**`, `chatgpt-connector/**`, `scripts/smoke-test.js`, `recipes/**`, `registry/**`, and `package.json`, remain rejected for `sdk-write`.

M136 prepares that first production-code lane for existing-source updates. Unlike docs-audit and orchestrator sdk-write lanes, which still reject pre-existing planned outputs, production-code sdk-write requires the planned source file to exist before SDK thread creation and then requires the post-run diff to include only that planned source path.

M140 adds a local SDK launch governance packet. Governance packets use schema `sdk-launch-governance.v1` and live under `.codex-audit/sdk-launch-governance/`. The first packet, `.codex-audit/sdk-launch-governance/140-sdk-launch-governance.json`, records `state:"local-gated"`, cites M138/M139, preserves the exact enabled `sdk-write` scopes, keeps production-code limited to `scripts/provider-contract-smoke.js`, keeps CEP-panel disabled, and records that new SDKThread/network writes still require a separate approval milestone.

M141 adds an SDK launch governance drift report. The report uses schema `sdk-launch-governance-drift-report.v1` and is built during `check:rules` from the committed launch-governance packet plus the committed production-code enablement packet. It fails if enabled scopes, review-required scopes, production-code allowlist, CEP-panel disabled state, or SDKThread/network approval state drift away from the local-gated contract.

M152 adds the current two-file production-code provider smoke lane through committed review, readiness, approval-decision, enablement, and launch-governance packets. The M135/M140 single-file packets remain historical evidence; current governance reports read `.codex-audit/sdk-launch-governance/152-sdk-production-code-provider-smokes-governance.json` and `.codex-audit/sdk-write-lane-enablement/152-production-code-provider-smokes-enable.json`.

Обязательный `--scope` принимает только:

- `docs-audit`
- `orchestrator`
- `production-code`
- `cep-panel`

Unknown scopes отклоняются до возможного SDK thread creation. То же правило действует для unsafe/bypass-capable flags: `--sandbox`, `--approval`, `--network`, `--web-search`, `--skip-git-repo-check`, `--external-provider`, `--openai-cli-planner`, `--mutating-live`, `--tenant-policy-bypass`, `--auto-commit`, `--commit`, `--force`, `--live`, `--execute` и близкие bypass flags.

Path allowlist contract:

- `docs-audit`: `.codex-audit/**`, `.codex/handoff.md`, docs/specs/plans/readme files.
- `orchestrator`: `orchestrator/**`, `package.json`, audit/handoff files.
- `production-code`: `mcp-server/**`, `chatgpt-connector/**`, `scripts/**`, `recipes/**`, `registry/**`, `package.json`, audit/handoff files.
- `cep-panel`: `cep-panel/**`, audit/handoff files.

SDK-write output allowlist contract:

- `docs-audit`: `.codex-audit/**`.
- `orchestrator`: Markdown files under `orchestrator/**` plus JSON fixture outputs under `orchestrator/fixtures/sdk-write/**`.
- `production-code`: `scripts/provider-api-smoke.js` and `scripts/provider-contract-smoke.js` only.
- `cep-panel`: no enabled SDK-write lane.

Default forbidden paths включают `.git/**`, `node_modules/**`, `logs/**`, `backups/**`, `snapshots/**`, `pro-review-bundles/**`, `mcp-config.json`, `package-lock.json`, root/nested `.env*`, `*.key`, `*.pem`, `*credential*`, `*secret*` и `*token*` patterns.

Hard-stop conditions:

- dirty unexpected git state before the run;
- forbidden path diff after the run;
- path outside the active scope allowlist;
- external-provider, live/mutating, OpenAI CLI planner, tenant-policy bypass, or auto-commit request;
- failed validation result.

## Локальный contract smoke

Локальный smoke проверяет non-mutating orchestrator contract и M114 write-capable runner scaffold: help output, safe defaults, согласованность README/package scripts, запрет unsafe flags, explicit write scopes, dry-run mode, planned-operation envelope validation, planned path allowlists, forbidden paths, SDK scope expansion acceptance gate, SDK scope expansion review packet gate, committed review packet files, SDK write lane readiness packet gate, SDK write lane approval decision packet gate, SDK write lane enablement packet gate, SDK launch governance packet gate, SDK launch governance drift report, subprocess parser smoke для governance-report JSON, current M152+ governance/conveyor/extraction smokes, historical smoke migration, historical archive review, historical archive move и pre/post snapshot comparison. Он не запускает provider/live/network validation и не выполняет real SDK write work.

```powershell
npm.cmd run check:rules
```

Для быстрого локального статуса без полного smoke можно вывести текущий launch-governance drift report:

```powershell
npm.cmd run codex:orchestrator:governance-report
```

Чтобы отдельно проверить, что package command печатает parseable JSON с exact local-gated fields:

```powershell
npm.cmd run codex:orchestrator:governance-report:smoke
```

M144-M151 остаются историческими доказательствами: launch readiness, superseded single-file production readiness, bounded iterative-command reliability, multi-file planned/real proofs, post-multi-file boundary and closeout are kept in place but no longer have active package smoke entrypoints. M163 migrates superseded historical smoke coverage into `.codex-audit/sdk-orchestrator-extraction/163-sdk-historical-smoke-migration.json` with schema `sdk-historical-smoke-migration.v1`; the old script files remain available as historical source material, while `check:rules` keeps current M152+ governance/conveyor/extraction checks direct. The archive move remains blocked.

```powershell
npm.cmd run codex:orchestrator:historical-smoke-migration:smoke
```

M152 records the bounded two-file production-code provider smoke proof in `.codex-audit/sdk-production-readiness/152-sdk-production-code-provider-smokes-ready.json` with schema `sdk-production-code-broader-readiness.v1`. It may claim production-code SDK-write readiness only for `scripts/provider-api-smoke.js` and `scripts/provider-contract-smoke.js`; general SDK workflow, CEP-panel writes, external-provider/OpenAI CLI planner validation, live CEP/AE validation, mutating-live validation, package installs and dependency changes remain out of scope.

```powershell
npm.cmd run codex:orchestrator:production-code-broader:smoke
```

M153 records the next SDK lane selection in `.codex-audit/sdk-next-lane/153-sdk-next-lane-selection.json` with schema `sdk-next-lane-selection.v1`. It selects `cep-panel-composer-local-preflight` as the next candidate direction only; it keeps CEP-panel SDK writes disabled, creates no SDKThread/network approval, and requires a separate explicit approval before any CEP-panel enablement or proof.

```powershell
npm.cmd run codex:orchestrator:next-lane:smoke
```

M154 defines the SDK milestone conveyor contract in `.codex-audit/sdk-milestone-conveyor/154-sdk-milestone-conveyor-spec.json` with schema `sdk-milestone-conveyor-spec.v1`. Queue items must name scope, mode, planned paths, stop gates, validation commands, commit and handoff expectations, and the no-push-by-default policy. The M154-M157 series allows only local conveyor artifacts plus one explicitly approved M156 `docs-audit` `sdk-write` proof under `.codex-audit/sdk-milestone-conveyor/**`; CEP-panel SDK writes, production-code writes, live CEP/AE checks, external-provider/OpenAI CLI planner validation, mutating-live validation, dependency changes, and push remain disabled by default.

```powershell
npm.cmd run codex:orchestrator:milestone-conveyor-spec:smoke
```

M155 adds a local-only dry-run proof in `.codex-audit/sdk-milestone-conveyor/155-sdk-milestone-conveyor-local-dry-run.json` with schema `sdk-milestone-conveyor-local-dry-run-proof.v1`. The smoke reads the M154 spec, simulates one `docs-audit` `sdk-write` queue item for the planned M156 proof, and deterministically stops at `no-explicit-approval` with `sdkThreadCreated:false`, `networkAccessed:false`, `operationFileWritten:false`, `autoCommit:false`, and `autoPush:false`.

```powershell
npm.cmd run codex:orchestrator:milestone-conveyor-dry-run:smoke
```

M156 records the one approved real `docs-audit` SDKThread conveyor proof in `.codex-audit/sdk-milestone-conveyor/156-sdk-conveyor-sdkthread-proof.json` with schema `sdk-milestone-conveyor-sdkthread-proof.v1`. The single allowed run used SDKThread `019e4dcd-dd6f-7651-8882-b0c014894633`, completed as `sdk-write-completed`, changed only the planned docs-audit proof artifact, and kept `autoPush:false`. No retry, CEP-panel write, production-code write, live CEP/AE check, external-provider/OpenAI CLI planner validation, mutating-live validation, dependency change, or push was performed.

```powershell
npm.cmd run codex:orchestrator:milestone-conveyor-sdkthread-proof:smoke
```

M157 closes the conveyor loop gate in `.codex-audit/sdk-milestone-conveyor/157-sdk-conveyor-commit-handoff-loop-gate.json` with schema `sdk-conveyor-commit-handoff-loop-gate.v1`. It proves the local per-milestone loop contract: select one queued milestone, validate, create one reviewable commit, update handoff with an exact next prompt, and stop before the next milestone on `context-pressure`. The gate also records dirty-tree handling, no auto-push, and stop conditions for validation failure, missing SDKThread approval, forbidden work, dependency changes, and push.

```powershell
npm.cmd run codex:orchestrator:milestone-conveyor-loop-gate:smoke
```

M158 records the SDK orchestrator extraction/cleanup plan in `.codex-audit/sdk-orchestrator-extraction/158-sdk-orchestrator-extraction-cleanup-plan.json` with schema `sdk-orchestrator-extraction-cleanup-plan.v1`. It classifies reusable SDK orchestrator core, AE Agent project adapter material, active governance/readiness evidence, historical audit trail, archive/squash/summary candidates, and files that must not be removed. It also records a recommended standalone tool structure and a safe AE Agent cleanup plan. This is classification only: no files are deleted, CEP-panel SDK writes remain disabled, no SDKThread/network proof is run, and `cep-panel/panel.js` remains outside SDK writes.

```powershell
npm.cmd run codex:orchestrator:extraction-cleanup:smoke
```

M159 freezes the current SDK orchestrator inventory in `.codex-audit/sdk-orchestrator-extraction/159-sdk-orchestrator-inventory-freeze.json` with schema `sdk-orchestrator-inventory-freeze.v1`. It follows the M158 safe cleanup phase named `Freeze current inventory`, records active command-surface files, current governance/conveyor evidence, historical evidence kept until a future index, and check entrypoints. It does not delete, move, archive, squash, run SDKThread/network, enable CEP-panel SDK writes, install packages, change dependencies, push, or edit `cep-panel/panel.js` through SDK. The next allowed direction remains `Extract reusable core without behavior change`.

```powershell
npm.cmd run codex:orchestrator:inventory-freeze:smoke
```

M160 performs the first behavior-preserving reusable-core extraction in `.codex-audit/sdk-orchestrator-extraction/160-sdk-reusable-core-extraction.json` with schema `sdk-reusable-core-extraction.v1`. The existing wrapper commands stay unchanged, while policy-neutral helpers now live in `orchestrator/core/path-policy.mjs`, `orchestrator/core/git-snapshot.mjs`, and `orchestrator/core/thread-options.mjs`. AE Agent-specific scope and lane material remains adapter-side, with the current shape documented in `orchestrator/adapters/ae-agent-policy.example.json`. This milestone does not run SDKThread/network, enable CEP-panel SDK writes, install packages, change dependencies, move/archive/delete historical evidence, push, or change wrapper command entrypoints.

```powershell
npm.cmd run codex:orchestrator:reusable-core:smoke
```

M161 introduces the active AE Agent adapter config in `.codex-audit/sdk-orchestrator-extraction/161-ae-agent-adapter-config.json` with schema `sdk-ae-agent-adapter-config.v1`. The runtime policy now lives in `orchestrator/adapters/ae-agent-sdk-policy.mjs` and is consumed by the existing write-runner facade, while `orchestrator/adapters/ae-agent-policy.example.json` remains the documented example shape. The adapter keeps the current `docs-audit`, `orchestrator`, `production-code`, and `cep-panel` lanes, validates current M152/M154-M157 evidence against that policy, keeps production-code limited to `scripts/provider-api-smoke.js` and `scripts/provider-contract-smoke.js`, and CEP-panel SDK writes remain disabled. This milestone does not run SDKThread/network, change wrapper command entrypoints, enable CEP-panel SDK writes, install packages, change dependencies, move/archive/delete historical evidence, push, or edit `cep-panel/panel.js`.

```powershell
npm.cmd run codex:orchestrator:adapter-config:smoke
```

M162 adds the historical SDK evidence index in `.codex-audit/sdk-orchestrator-extraction/162-sdk-historical-evidence-index.json` with schema `sdk-historical-evidence-index.v1`. The index records historical artifacts, verdicts, supersession chain, and commit refs for early docs-audit/orchestrator SDKThread proofs, superseded single-file production readiness, and bounded reliability/multi-file proofs. The current evidence remains directly checked: M152 governance/readiness, M153-M157 conveyor packets, M158-M161 extraction artifacts, provider smoke targets, and `cep-panel/panel.js` are not treated as historical-only. This is a summary milestone only: no archive move, deletion, squash, SDKThread/network proof, CEP-panel SDK write, dependency change, push, live CEP/AE validation, external-provider/OpenAI CLI planner validation, or mutating-live validation is performed.

```powershell
npm.cmd run codex:orchestrator:historical-evidence:smoke
```

M163 migrates superseded historical smoke coverage to `.codex-audit/sdk-orchestrator-extraction/163-sdk-historical-smoke-migration.json` with schema `sdk-historical-smoke-migration.v1`. The migration retires active package/check:rules entrypoints for M144-M151 historical smokes, keeps the old script files and artifacts in place, keeps M152+ current evidence directly checked, and confirms archive move remains blocked.

```powershell
npm.cmd run codex:orchestrator:historical-smoke-migration:smoke
```

M164 reviews historical archive move candidates in `.codex-audit/sdk-orchestrator-extraction/164-sdk-historical-archive-review.json` with schema `sdk-historical-archive-review.v1`. The review maps only historical indexed or smoke-migrated files to future archive batches, excludes current M152+ governance/conveyor/extraction evidence and active command-surface files, keeps all files in place, and confirms archive move remains blocked until a separate reviewed cleanup milestone.

```powershell
npm.cmd run codex:orchestrator:historical-archive-review:smoke
```

M165 moves the M164-reviewed historical archive candidates into `.codex-audit/sdk-history-archive/` and records the move in `.codex-audit/sdk-orchestrator-extraction/165-sdk-historical-archive-move.json` with schema `sdk-historical-archive-move.v1`. Original paths remain preserved in the M165 index, while verdicts, commit refs, and supersession chain stay in the M162 historical index. Current M152+ evidence, active command files, provider smoke targets, `package.json`/`package-lock.json`, and `cep-panel/panel.js` remain in place; delete and squash remain blocked.

```powershell
npm.cmd run codex:orchestrator:historical-archive-move:smoke
```

M166 reviews the remaining AE Agent-specific runner split candidates in `.codex-audit/sdk-orchestrator-extraction/166-sdk-runner-split-review.json` with schema `sdk-runner-split-review.v1`. The review records which code should stay adapter-side, which operation-envelope/runtime/post-run pieces are future core candidates, and the next safe extraction order. This is a review-only milestone with no behavior-changing extraction, no wrapper command changes, no SDKThread/network proof, no CEP-panel SDK write, no dependency change, no archive/delete/squash cleanup, and no push.

```powershell
npm.cmd run codex:orchestrator:runner-split-review:smoke
```

M167 extracts the operation-envelope helpers into `orchestrator/core/operation-envelope.mjs` and records the behavior-preserving split in `.codex-audit/sdk-orchestrator-extraction/167-sdk-operation-envelope-core-extraction.json` with schema `sdk-operation-envelope-core-extraction.v1`. The write-runner remains the compatibility facade: public exports, package command entrypoints, operation envelope version/modes/required fields from the AE Agent adapter config, planned path policy, and dry-run/sdk-write safety checks stay unchanged. Runtime-store diagnostics and post-run contract helpers remain deferred follow-up candidates.

```powershell
npm.cmd run codex:orchestrator:operation-envelope-core:smoke
```

M168 extracts SDK runtime-store and failure-diagnostics helpers into `orchestrator/core/runtime-store.mjs` and `orchestrator/core/failure-diagnostics.mjs`, then records the behavior-preserving split in `.codex-audit/sdk-orchestrator-extraction/168-sdk-runtime-diagnostics-review-or-extraction.json` with schema `sdk-runtime-diagnostics-review-or-extraction.v1`. The write-runner remains the compatibility facade: public exports and package command entrypoints stay unchanged, while runtime paths, runtime subdirectories, and fallback report directory remain injected from the AE Agent adapter config. Post-run contract extraction remains deferred.

```powershell
npm.cmd run codex:orchestrator:runtime-diagnostics:smoke
```

M169 extracts SDK post-run contract helpers into `orchestrator/core/post-run-contract.mjs`, then records the behavior-preserving split in `.codex-audit/sdk-orchestrator-extraction/169-sdk-post-run-contract-review-or-extraction.json` with schema `sdk-post-run-contract-review-or-extraction.v1`. The write-runner remains the compatibility facade: public exports and package command entrypoints stay unchanged, while scope policy, forbidden path policy, sdk-write planned path allowlists, and the production-code existing-source requirement remain injected from the AE Agent adapter-backed facade.

```powershell
npm.cmd run codex:orchestrator:post-run-contract:smoke
```

M170 reviews buffered acceptance split boundaries in `.codex-audit/sdk-orchestrator-extraction/170-sdk-buffered-acceptance-split-review.json` with schema `sdk-buffered-acceptance-split-review.v1`. The review keeps governance packet validators, current M152+ direct checks, package script assertions, README assertions, and AE Agent project evidence policy project-local; no reusable extraction is performed because the only neutral candidates are too small or too coupled to the local acceptance wrapper to justify behavior risk.

```powershell
npm.cmd run codex:orchestrator:buffered-acceptance-split-review:smoke
```

M171 closes the SDK orchestrator extraction block in `.codex-audit/sdk-orchestrator-extraction/171-sdk-orchestrator-extraction-closeout-review.json` with schema `sdk-orchestrator-extraction-closeout-review.v1`. The closeout records the M160-M170 reusable core modules, the AE Agent adapter/project-local boundaries, and the remaining standalone-packaging blockers; the block status is `closed-local-gated`, with no new extraction, SDKThread/network work, CEP-panel SDK write, package install, archive/delete/squash cleanup, or push.

```powershell
npm.cmd run codex:orchestrator:extraction-closeout:smoke
```

M172 designs the standalone adapter/plugin interface in `.codex-audit/sdk-orchestrator-extraction/172-sdk-adapter-interface-design-review.json` with schema `sdk-adapter-interface-design-review.v1`. The review defines how a future `codex-sdk-orchestrator-tool` could load project policy, evidence validators, package script assertions, README assertions, smoke catalogs, and handoff rules through an adapter/plugin interface while keeping AE Agent governance packet validators, current M152+ checks, package script assertions, README assertions, and project evidence policy project-local until a separate implementation milestone. No standalone package, new extraction, SDKThread/network work, CEP-panel SDK write, package install, dependency change, archive/delete/squash cleanup, push, or PR is introduced.

```powershell
npm.cmd run codex:orchestrator:adapter-interface-design:smoke
```

Buffered acceptance wrapper всегда создает SDK thread с теми же безопасными ограничениями: `sandboxMode: "read-only"`, `approvalPolicy: "never"`, `networkAccessEnabled: false`, `webSearchMode: "disabled"`.

В buffered acceptance mode wrapper отклоняет unsafe-capable overrides до создания SDK thread, включая `--sandbox danger-full-access`, `--approval on-request`, `--network` и `--web-search live`. Также отклоняются `--external-provider`, `--openai-cli-planner`, `--mutating-live`, `--tenant-policy-bypass` и `--skip-git-repo-check`.
