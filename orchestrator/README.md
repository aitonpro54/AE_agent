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

`sdk-write` uses the same operation envelope and is accepted only for enabled scope-specific lanes with `mode:"sdk-write"`. M117R generalizes docs-audit planned outputs from the original M115 single-file allowlist to any non-empty `plannedPaths` set under `.codex-audit/**`, after the same unsafe path shape checks, forbidden path checks, and docs-audit scope allowlist validation. M123 adds the first orchestrator-scope SDK write lane for docs-only Markdown planned paths under `orchestrator/**`, such as `orchestrator/m123-sdk-thread-orchestrator-scope-output.md`. M125 adds a second orchestrator lane for non-executable JSON fixtures only under `orchestrator/fixtures/sdk-write/**`, such as `orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json`; `.js`, `.mjs`, `.ts`, `.tsx`, `.cmd`, `.bat`, and `.ps1` fixture paths are rejected. M135 adds the first production-code lane only for `scripts/provider-contract-smoke.js`; broad `scripts/**`, `package.json` as a planned SDK output, other production-code paths, CEP paths such as `cep-panel/**`, runtime paths, and paths such as `src/**`, `specs/**`, `../outside.json`, `.env`, `node_modules/**`, `.git/**`, credential paths, and `package-lock.json` are rejected before SDK thread creation. The SDK prompt is constrained to the validated planned path set, auto-commit remains disabled, and the runner captures pre/post git snapshots plus `git diff --check`. After the SDK turn, the runner hard-stops if the changed-since-pre diff includes anything outside the planned path set. If Git reports a newly-created untracked parent directory for a planned nested output, the runner recursively enumerates that directory and normalizes the parent away only when every actual child file is an explicitly planned SDK output; enumeration failure, empty directories, unplanned children, executable children, forbidden paths, sensitive paths, package-lock churn, git metadata churn, or out-of-scope children still fail closed.

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
- `production-code`: `scripts/provider-contract-smoke.js` only.
- `cep-panel`: no enabled SDK-write lane.

Default forbidden paths включают `.git/**`, `node_modules/**`, `logs/**`, `backups/**`, `snapshots/**`, `pro-review-bundles/**`, `mcp-config.json`, `package-lock.json`, root/nested `.env*`, `*.key`, `*.pem`, `*credential*`, `*secret*` и `*token*` patterns.

Hard-stop conditions:

- dirty unexpected git state before the run;
- forbidden path diff after the run;
- path outside the active scope allowlist;
- external-provider, live/mutating, OpenAI CLI planner, tenant-policy bypass, or auto-commit request;
- failed validation result.

## Локальный contract smoke

Локальный smoke проверяет non-mutating orchestrator contract и M114 write-capable runner scaffold: help output, safe defaults, согласованность README/package scripts, запрет unsafe flags, explicit write scopes, dry-run mode, planned-operation envelope validation, planned path allowlists, forbidden paths, SDK scope expansion acceptance gate, SDK scope expansion review packet gate, committed review packet files, SDK write lane readiness packet gate, SDK write lane approval decision packet gate, SDK write lane enablement packet gate, SDK launch governance packet gate, SDK launch governance drift report, subprocess parser smoke для governance-report JSON, launch/production-readiness smoke и pre/post snapshot comparison. Он не запускает provider/live/network validation и не выполняет real SDK write work.

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

M144 фиксирует release-readiness boundary в committed summary `.codex-audit/sdk-launch-readiness/144-sdk-launch-readiness-summary.json`. Этот artifact классифицирует SDK state как `local-gated-production-candidate`, отмечает узкую production-code lane как `ready-local-gated`, а broader production-code, CEP-panel, SDKThread/network, external-provider и live CEP/AE work как approval-required или not-validated.

```powershell
npm.cmd run codex:orchestrator:launch-readiness:smoke
```

M146 supersedes the blocked M145 artifact with committed artifact `.codex-audit/sdk-production-readiness/146-sdk-production-ready.json`. Этот artifact выбирает `narrow-lane-production-ready`, records `productionReady:true` and `overall:"narrow-lane-production-ready"` only for `scripts/provider-contract-smoke.js`; general SDK workflow, broader production-code writes and CEP-panel SDK writes remain not production-ready/out of scope.

```powershell
npm.cmd run codex:orchestrator:production-readiness:smoke
```

M147 adds a bounded iterative local-command reliability gate without broadening production-code or CEP-panel SDK writes. The committed gate `.codex-audit/sdk-iterative-cmd/147-sdk-iterative-cmd-reliability.json` uses schema `sdk-iterative-cmd-reliability-gate.v1` and points to the SDK-created JSON fixture `orchestrator/fixtures/sdk-write/m147-iterative-cmd-reliability-proof.json`. The proof records scoped context reads, one failing local JSON check, one repair iteration, the same check passing, safe thread options, and a post-run allowlist contract where only the planned fixture changed.

```powershell
npm.cmd run codex:orchestrator:iterative-cmd:smoke
```

M148 adds a local multi-file planned operation contract before any real SDKThread multi-file proof. The committed artifact `.codex-audit/sdk-multi-file-planned-operation/148-sdk-multi-file-planned-operation-contract.json` uses schema `sdk-multi-file-planned-operation-contract.v1` and proves that an orchestrator `sdk-write` envelope can predeclare two fixture JSON outputs, render both planned paths into the prompt, and pass post-run validation only when both planned files changed. The same smoke proves rejection for extra files, unplanned directory children, `.env`, credential paths, `package-lock.json` churn, and `.git/**` metadata churn.

```powershell
npm.cmd run codex:orchestrator:multi-file-planned:smoke
```

Buffered acceptance wrapper всегда создает SDK thread с теми же безопасными ограничениями: `sandboxMode: "read-only"`, `approvalPolicy: "never"`, `networkAccessEnabled: false`, `webSearchMode: "disabled"`.

В buffered acceptance mode wrapper отклоняет unsafe-capable overrides до создания SDK thread, включая `--sandbox danger-full-access`, `--approval on-request`, `--network` и `--web-search live`. Также отклоняются `--external-provider`, `--openai-cli-planner`, `--mutating-live`, `--tenant-policy-bypass` и `--skip-git-repo-check`.
