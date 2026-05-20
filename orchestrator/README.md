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
npm.cmd run codex:orchestrator:write-scaffold -- --operation-file .codex/sdk/operations/m115-docs-audit-sdk-write.json
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

M115 adds one real `sdk-write` cutover path through the same operation envelope. It is accepted only when the envelope uses `scope:"docs-audit"`, `mode:"sdk-write"`, and the single planned path `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`. The envelope is validated before SDK thread creation. The SDK prompt is constrained to that planned path, auto-commit remains disabled, and the runner captures pre/post git snapshots plus `git diff --check`. After the SDK turn, the runner hard-stops if the changed-since-pre diff includes anything outside the planned path plus the explicit M115 implementation/report files.

M116 hardens SDK write diagnostics without retrying real write work. Primary SDK logs under `.codex/sdk/logs/` are best-effort and non-fatal: if log creation or JSON write fails, including `EPERM`, the original SDK/post-run error remains in the console failure message. The runner then attempts a fallback Markdown diagnostic report under `.codex-audit/<operation>-sdk-write-failure-diagnostics.md`. If `.codex/sdk/operations/` cannot be created, the operation envelope can be placed at the reported `.codex-audit/<operation>-operation.json` fallback path and passed with `--operation-file`.

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

Локальный smoke проверяет non-mutating orchestrator contract и M114 write-capable runner scaffold: help output, safe defaults, согласованность README/package scripts, запрет unsafe flags, explicit write scopes, dry-run mode, planned-operation envelope validation, planned path allowlists, forbidden paths и pre/post snapshot comparison. Он не запускает provider/live/network validation и не выполняет real SDK write work.

```powershell
npm.cmd run check:rules
```

Buffered acceptance wrapper всегда создает SDK thread с теми же безопасными ограничениями: `sandboxMode: "read-only"`, `approvalPolicy: "never"`, `networkAccessEnabled: false`, `webSearchMode: "disabled"`.

В buffered acceptance mode wrapper отклоняет unsafe-capable overrides до создания SDK thread, включая `--sandbox danger-full-access`, `--approval on-request`, `--network` и `--web-search live`. Также отклоняются `--external-provider`, `--openai-cli-planner`, `--mutating-live`, `--tenant-policy-bypass` и `--skip-git-repo-check`.
