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

`sdk-write` uses the same operation envelope and is accepted only for `scope:"docs-audit"` or `scope:"orchestrator"` with `mode:"sdk-write"`. M117R generalizes docs-audit planned outputs from the original M115 single-file allowlist to any non-empty `plannedPaths` set under `.codex-audit/**`, after the same unsafe path shape checks, forbidden path checks, and docs-audit scope allowlist validation. M123 adds the first orchestrator-scope SDK write lane for docs-only Markdown planned paths under `orchestrator/**`, such as `orchestrator/m123-sdk-thread-orchestrator-scope-output.md`. M125 adds a second orchestrator lane for non-executable JSON fixtures only under `orchestrator/fixtures/sdk-write/**`, such as `orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json`; `.js`, `.mjs`, `.ts`, `.tsx`, `.cmd`, `.bat`, and `.ps1` fixture paths are rejected. Orchestrator source files, `package.json` as a planned SDK output, runtime paths, and paths such as `src/**`, `scripts/**`, `specs/**`, `cep-panel/**`, `../outside.json`, `.env`, `node_modules/**`, and `.git/**` are rejected before SDK thread creation. The SDK prompt is constrained to the validated planned path set, auto-commit remains disabled, and the runner captures pre/post git snapshots plus `git diff --check`. After the SDK turn, the runner hard-stops if the changed-since-pre diff includes anything outside the planned path set. If Git reports a newly-created untracked parent directory for a planned nested output, the runner recursively enumerates that directory and normalizes the parent away only when every actual child file is an explicitly planned SDK output; enumeration failure, empty directories, unplanned children, executable children, forbidden paths, sensitive paths, or out-of-scope children still fail closed.

M116 hardens SDK write diagnostics without retrying real write work. M120 adds a runtime preflight for SDK write logs and operation envelopes: the runner prefers `.codex/sdk`, verifies that both `logs` and `operations` can be created and written, then falls back to the ignored `.codex-runtime/sdk` runtime when `.codex/sdk` is missing or not writable. Routine SDK logs and operation-envelope paths use the selected runtime, for example `.codex-runtime/sdk/operations/<operation>-operation.json` when the fallback is selected. If selected-runtime log writing still fails, including `EPERM`, the original SDK/post-run error remains in the console failure message and the runner attempts only the reviewable diagnostic report under `.codex-audit/<operation>-sdk-write-failure-diagnostics.md`.

## SDK scope expansion acceptance gate

M127 adds a local-only acceptance gate for future SDK write scope expansion. `docs-audit` and controlled `orchestrator` outputs are the only enabled `sdk-write` scopes; `production-code` and `cep-panel` remain review-required and are rejected before any SDK thread can be created, even when their planned paths would be valid for ordinary dry-run scope checks.

## SDK scope expansion review packet gate

M128 adds a local review-packet contract for any future proposal to expand SDK write scopes. Review packets use schema `sdk-scope-expansion-review.v1` and should live under `.codex-audit/sdk-scope-expansion-reviews/`. A packet can describe a proposed `production-code` or `cep-panel` lane, but it must keep `sdkWriteEnabled:false`, include a narrow planned path allowlist, validation plan, and rollback plan, and it does not create an SDK thread or enable a write lane.

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

Default forbidden paths включают `.git/**`, `node_modules/**`, `logs/**`, `backups/**`, `snapshots/**`, `pro-review-bundles/**`, `mcp-config.json`, root/nested `.env*`, `*.key`, `*.pem`, `*secret*` и `*token*` patterns.

Hard-stop conditions:

- dirty unexpected git state before the run;
- forbidden path diff after the run;
- path outside the active scope allowlist;
- external-provider, live/mutating, OpenAI CLI planner, tenant-policy bypass, or auto-commit request;
- failed validation result.

## Локальный contract smoke

Локальный smoke проверяет non-mutating orchestrator contract и M114 write-capable runner scaffold: help output, safe defaults, согласованность README/package scripts, запрет unsafe flags, explicit write scopes, dry-run mode, planned-operation envelope validation, planned path allowlists, forbidden paths, SDK scope expansion acceptance gate, SDK scope expansion review packet gate и pre/post snapshot comparison. Он не запускает provider/live/network validation и не выполняет real SDK write work.

```powershell
npm.cmd run check:rules
```

Buffered acceptance wrapper всегда создает SDK thread с теми же безопасными ограничениями: `sandboxMode: "read-only"`, `approvalPolicy: "never"`, `networkAccessEnabled: false`, `webSearchMode: "disabled"`.

В buffered acceptance mode wrapper отклоняет unsafe-capable overrides до создания SDK thread, включая `--sandbox danger-full-access`, `--approval on-request`, `--network` и `--web-search live`. Также отклоняются `--external-provider`, `--openai-cli-planner`, `--mutating-live`, `--tenant-policy-bypass` и `--skip-git-repo-check`.
