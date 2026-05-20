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

Если нужно продолжить существующую Codex thread:

```powershell
npm.cmd run codex:orchestrator -- --resume <thread-id> --prompt "Continue from the previous result"
```

## Локальный contract smoke

M108 проверяет только локальный non-mutating contract: help output, safe defaults, согласованность README/package scripts и запрет unsafe flags в buffered acceptance wrapper.

```powershell
npm.cmd run check:rules
```

Buffered acceptance wrapper всегда создает SDK thread с теми же безопасными ограничениями: `sandboxMode: "read-only"`, `approvalPolicy: "never"`, `networkAccessEnabled: false`, `webSearchMode: "disabled"`.

В buffered acceptance mode wrapper отклоняет unsafe-capable overrides до создания SDK thread, включая `--sandbox danger-full-access`, `--approval on-request`, `--network` и `--web-search live`. Также отклоняются `--external-provider`, `--openai-cli-planner`, `--mutating-live`, `--tenant-policy-bypass` и `--skip-git-repo-check`.
