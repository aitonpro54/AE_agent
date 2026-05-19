# 05 Build Test QA Audit

## Scripts found

- package manager: не обнаружен. Точечный поиск не нашел `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` или `npm-shrinkwrap.json` вне исключенных `node_modules/dist/build/generated/cache/vendor`.
- package scripts: отсутствуют, потому что нет `package.json`.
- CI config: `.github` каталог не найден.
- build scripts: отдельного build pipeline не найдено. Проект запускает исходные `.js` файлы напрямую через Node, а CEP panel устанавливается/синхронизируется копированием `cep-panel/index.html`, `panel.js`, `style.css`, `CSXS/manifest.xml` через `scripts/install-cep-panel.ps1` и `scripts/cep-sync-health.js`.
- start scripts:
  - `scripts/start-server.ps1` запускает `mcp-server/mcp-adapter.js`.
  - `scripts/start-bridge-only.ps1` запускает `mcp-server/bridge-daemon.js`.
- install/sync scripts:
  - `scripts/install-cep-panel.ps1`
  - `scripts/cep-sync-health.js`
  - `scripts/cep-sync-cache-smoke.js`
  - `scripts/install-codex-mcp-config.ps1`
  - `scripts/install-daemon-startup-task.ps1`
  - `scripts/uninstall-daemon-startup-task.ps1`
- lint/typecheck commands: не найдено `eslint`, `tsc`, TypeScript config, Jest/Vitest/Playwright config или package scripts. Фактическая синтаксическая проверка в плане/AGENTS - `node --check` для затронутых JS-файлов и `git diff --check`.
- standalone smoke/test scripts under `scripts/`:
  - local/offline contract and corpus: `provider-contract-smoke.js`, `provider-api-smoke.js`, `prompt-optimization-smoke.js`, `project-intent-memory-smoke.js`, `plan-classification-smoke.js`, `plan-repair-smoke.js`, `semantic-verification-smoke.js`, `reliability-validation-suite-smoke.js`, `agent-qa-audit-smoke.js`, `agent-scenario-report-smoke.js`, `agent-planner-corpus-smoke.js`.
  - Solution Library: `solution-registry-smoke.js`, `solution-candidate-report-smoke.js`, `solution-promotion-smoke.js`, `solution-retrieval-smoke.js`, `solution-library-validation-smoke.js`.
  - daemon/adapter: `bridge-only-smoke-test.js`, `smoke-test.js`.
  - connector: `chatgpt-connector-smoke.js`.
  - live CEP/CDP: `cep-panel-cdp-smoke.js` with commands such as `inspect`, `smoke`, `plan-review-smoke`, `connector-status-smoke`, `mutating-smoke`, `agent-scenario-smoke`, `agent-scenario-openai-cli-smoke`.
  - reliability orchestration: `reliability-validation-suite.js` groups `local`, `provider-readiness`, `read-only-live`, `external-provider`, and `mutating-live` scopes.

## Commands run

- command: `Get-Content -LiteralPath .codex\handoff.md`
  - reason: прочитать handoff перед audit phase.
  - result: handoff прочитан; терминал показал mojibake для части кириллицы, но структура handoff и ограничения были понятны.
  - changed files: no

- command: `Get-ChildItem -LiteralPath .codex-audit -Force`
  - reason: увидеть существующие audit notes.
  - result: найдены `00-index.md`, `01-panel-to-codex.md`, `02-panel-to-after-effects.md`, `03-agent-action-protocol.md`, `04-instructions-and-prompts.md`.
  - changed files: no

- command: `Get-Content -LiteralPath .codex-audit\00-index.md`
  - reason: использовать индекс аудита и начальную карту build/test/QA.
  - result: индекс уже фиксировал отсутствие package manager и наличие standalone smoke scripts.
  - changed files: no

- command: `git status --short`
  - reason: зафиксировать исходное состояние worktree.
  - result: pre-existing changes: `M AGENTS.md`, `M registry/project-intent-memory.json`, `?? .codex-audit/`.
  - changed files: no

- command: `Get-Content -LiteralPath .codex-audit\01-panel-to-codex.md`
  - reason: учесть уже найденные gaps в panel-to-agent path.
  - result: audit note прочитан; важные QA gaps: Codex JSONL не стримится, ошибки теряют correlation details, нет cancel/job-status endpoint.
  - changed files: no

- command: `Get-Content -LiteralPath .codex-audit\02-panel-to-after-effects.md`
  - reason: учесть уже найденные gaps в panel-to-AE/evalScript path.
  - result: audit note прочитан; важные QA gaps: timeout command может поздно выполниться, CEP может отправить несколько `evalScript`, malformed/empty result может считаться success.
  - changed files: no

- command: `Get-Content -LiteralPath .codex-audit\03-agent-action-protocol.md`
  - reason: сопоставить QA coverage с M100 action protocol.
  - result: audit note прочитан; ключевой вывод: нет unified assistant/action/result envelope и сквозной `requestId -> actionId -> executionId -> AE command id`.
  - changed files: no

- command: `Get-Content -LiteralPath .codex-audit\04-instructions-and-prompts.md`
  - reason: учесть процессные конфликты вокруг audit-only validation.
  - result: audit note прочитан; важный вывод: AGENTS validation rules слишком широкие для audit-only фаз, external-provider и mutating-live должны быть approval-gated.
  - changed files: no

- command: `rg --files -g package.json -g package-lock.json -g pnpm-lock.yaml -g yarn.lock -g bun.lockb -g npm-shrinkwrap.json -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: проверить package manager и lockfiles.
  - result: exit 1/no output; package manager files не найдены.
  - changed files: no

- command: `rg --files scripts`
  - reason: перечислить standalone scripts.
  - result: найден широкий набор smoke/install/start/helper scripts under `scripts/`.
  - changed files: no

- command: `rg --files -g *test* -g *spec* -g *smoke* -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: найти test/spec/smoke artifacts.
  - result: найдены smoke scripts, `.jsx` fixture, historical snapshots/backups whose filenames include `test`; conventional `test/` or `__tests__/` не найден.
  - changed files: no

- command: `rg -n -i "\b(build|lint|typecheck|tsc|eslint|jest|vitest|mocha|playwright|smoke|test)\b" AGENTS.md README.md docs specs plans scripts cep-panel mcp-server chatgpt-connector -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: найти documented build/lint/test commands.
  - result: output был очень большим и частично truncated; подтвердил smoke-centric validation, `node --check`, `git diff --check`, live CEP smokes и отсутствие package script entrypoint.
  - changed files: no

- command: `Get-Content -LiteralPath README.md | Select-Object -Skip 270 -First 140`
  - reason: прочитать README smoke/validation section.
  - result: README перечисляет offline/local smokes, reliability scopes, live CEP, provider and mutating-live commands; external-provider/mutating-live documented as explicit-approval paths.
  - changed files: no

- command: `Get-Content -LiteralPath chatgpt-connector\README.md | Select-Object -Skip 80 -First 30`
  - reason: проверить connector smoke scope.
  - result: connector smoke documented as offline, no ChatGPT/tunnel/AE/live providers/AE mutations; uses fake bridge and gated JSX Lab checks.
  - changed files: no

- command: `Get-ChildItem -LiteralPath scripts -File | Sort-Object Name | Select-Object Name,Length`
  - reason: получить compact inventory scripts and sizes.
  - result: confirmed large `cep-panel-cdp-smoke.js`, broad `smoke-test.js`, and many focused dependency-free smoke scripts.
  - changed files: no

- command: `rg -n -i "manual qa|qa checklist|checklist|vertical flow|agent-scenario|user prompt|confirmed ae action|ae result|debug mode|debug|logs|jsonl" README.md docs specs plans .codex-audit -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: найти manual QA checklist, vertical flow, logs/debug docs.
  - result: найдено много logging/debug/agent-scenario references, но не найден единый current manual QA checklist.
  - changed files: no

- command: `rg -n -i "codex.*(fake|mock|stub)|fake.*codex|codex cli|codex exec|CODEX_CLI|apiStyle.*codex|child_process|spawn\(" scripts mcp-server chatgpt-connector -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: проверить mocks для Codex process.
  - result: найден fake Codex CLI readiness/login in `provider-contract-smoke.js`; full `codex exec --json`/JSONL process mock не найден.
  - changed files: no

- command: `rg -n -i "fake bridge|fakeBridge|simulate.*CEP|simulates the CEP|bridge/next|bridge/result|evalScript|CSInterface|run_extendscript|run_extendscript_file|JSX Lab|candidate" scripts README.md chatgpt-connector docs -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: проверить mocks для AE host, evalScript, JSX execution.
  - result: найден fake bridge in connector smoke, simulated CEP polling/result in `smoke-test.js`, fake XHR in CEP CDP smoke, JSX Lab static/gated checks; no isolated `evalScript` host mock found.
  - changed files: no

- command: `rg -n -i "agent-scenario|vertical|user prompt|prompt.*agent|panel.*plan|confirmed|confirm|plan/run|mutating-smoke|openai-cli-smoke" scripts\cep-panel-cdp-smoke.js scripts\agent-scenario-fixtures.js scripts\agent-planner-corpus-smoke.js README.md plans\target-app-execplan.md`
  - reason: проверить vertical flow smoke coverage.
  - result: found `agent-scenario-smoke`, `agent-scenario-openai-cli-smoke`, offline planner corpus, protected run assertions, and approval notes.
  - changed files: no

- command: `rg -n -i "DEBUG|debug|logLevel|verbose|bridge-events|ai-agent-chats|dev/logs|recordEvent|appendAiChatEvent|console\.log|console\.error" README.md mcp-server cep-panel chatgpt-connector scripts -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: проверить logs/debug mode.
  - result: found JSONL logs, `/dev/logs`, CEP PlayerDebugMode docs, many script JSON outputs; no unified documented debug/log-level mode found.
  - changed files: no

- command: `Get-Content -LiteralPath README.md | Select-Object -Skip 186 -First 55`
  - reason: проверить install/build-ish CEP flow.
  - result: README documents manual CEP install, `install-cep-panel.ps1`, `cep-sync-health.js --check`, `--sync --check`, and cache-clearing behavior.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\install-cep-panel.ps1`
  - reason: inspect build/install script safety and side effects.
  - result: full install copies panel files and writes `PlayerDebugMode` registry; `-SyncOnly` uses sync helper and cache clear.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\start-server.ps1`
  - reason: inspect start script for MCP adapter.
  - result: chooses bundled Node if present, sets bridge env vars, starts `mcp-server\mcp-adapter.js`.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\start-bridge-only.ps1`
  - reason: inspect daemon start script.
  - result: chooses bundled Node if present, sets bridge env vars, starts `mcp-server\bridge-daemon.js`.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\smoke-test.js | Select-Object -First 230`
  - reason: inspect local smoke behavior and AE/CEP simulation.
  - result: smoke starts daemon/adapter, writes smoke registry/memory copies under `logs/hardcore-sessions/smoke-*`, polls `/bridge/next`, posts fake `/bridge/result`.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\smoke-test.js | Select-Object -Skip 230 -First 220`
  - reason: inspect how smoke fakes AE command results.
  - result: confirmed fake successful wrapped AE results are posted to bridge; this exercises queue/result contract, not real `CSInterface.evalScript`.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\provider-contract-smoke.js | Select-Object -First 260`
  - reason: inspect Codex CLI process mock coverage.
  - result: found `withFakeNodeCodex()` for fake `codex login status` states; no fake `codex exec` assistant JSONL path in this script.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\agent-planner-corpus-smoke.js | Select-Object -First 240`
  - reason: inspect offline planner corpus smoke.
  - result: script starts local daemon, validates fixture plans through `/agents/plan/validate` and dry-run `/agents/plan/run`; no external provider, no CEP panel, no AE mutation.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\cep-panel-cdp-smoke.js | Select-Object -First 80`
  - reason: inspect live CEP smoke defaults and provider modes.
  - result: script targets CEP CDP on port `8870`, default bridge `127.0.0.1:3456`, default agent `ollama-local`, includes OpenAI CLI scenario config.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\cep-panel-cdp-smoke.js | Select-Object -Skip 1080 -First 210`
  - reason: inspect fake XHR UI tests.
  - result: found fake `/agents/plan/run` raw-run gate and fake `/agents/hardcore/run` UI/autopilot responses; these mock backend HTTP, not AE host.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\cep-panel-cdp-smoke.js | Select-Object -Skip 3230 -First 190`
  - reason: inspect vertical Agent scenario run.
  - result: flow selects agent/prompt, waits for plan UI, dry-runs, clicks run, asserts protected run, checkpoint/edit-session text, and outcome verification.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\cep-panel-cdp-smoke.js | Select-Object -Skip 3710 -First 90`
  - reason: inspect available live CEP smoke commands.
  - result: confirmed commands including `smoke`, `mutating-smoke`, `agent-scenario-smoke`, `agent-scenario-openai-cli-smoke`, `connector-status-smoke`, `openai-cli-smoke`, `offline-smoke`.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\cep-panel-cdp-smoke.js | Select-Object -Skip 3790 -First 80`
  - reason: finish command-list inspection.
  - result: confirmed `history-smoke`, `offline-smoke`, and unknown-command handling.
  - changed files: no

- command: `rg -n "process\.argv|Usage|command =|async function .*Smoke|async function offlineSmoke|function offline" scripts\cep-panel-cdp-smoke.js`
  - reason: compactly map live CEP smoke functions and CLI command dispatch.
  - result: found function/command locations for current CEP smoke command set.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\cep-panel-cdp-smoke.js | Select-Object -Skip 2960 -First 85`
  - reason: inspect `offlineSmoke`.
  - result: `offlineSmoke` still connects to live panel/CDP, edits localStorage temporarily, reloads panel, then restores state; not a pure Node offline test.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\provider-api-smoke.js | Select-Object -First 130`
  - reason: inspect fake provider coverage.
  - result: confirmed local fake HTTP servers for Gemini/Claude/OpenRouter-style provider responses.
  - changed files: no

- command: `rg -n "runCodexCli|chatWithAgent\(|openai-cli|codex exec|JSONL|assistant message|fake.*provider|make.*Server|/agents/chat|/agents/plan" scripts\provider-contract-smoke.js scripts\prompt-optimization-smoke.js scripts\provider-api-smoke.js scripts\smoke-test.js mcp-server\ai-agents.js`
  - reason: check whether `runCodexCli` assistant JSONL path has a fake process smoke.
  - result: `runCodexCli` found in production `ai-agents.js`; tests cover provider fakes and HTTP agent endpoints but no fake Codex exec JSONL completion was found.
  - changed files: no

- command: `rg -n "CSInterface|evalScript|__adobe_cep__|new CSInterface|window\.cep|FakeXHR|XMLHttpRequest" scripts cep-panel -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: check evalScript and CSInterface test/mocking surfaces.
  - result: runtime `cep-panel/lib/CSInterface.js` is a minimal shim; panel calls `cs.evalScript`; CEP smoke fakes `XMLHttpRequest`, not `evalScript`.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\reliability-validation-suite.js | Select-Object -First 180`
  - reason: inspect validation suite scopes and gates.
  - result: suite defines `local`, `provider-readiness`, `read-only-live`, `external-provider`, `mutating-live`; external/mutating scopes require explicit flags; report dir is `logs/reliability-validation`.
  - changed files: no

- command: `Get-Content -LiteralPath scripts\reliability-validation-suite-smoke.js`
  - reason: inspect suite self-check.
  - result: confirms category/gate metadata and selected local checks without launching full suite.
  - changed files: no

- command: `rg --files .github`
  - reason: check for CI workflow config.
  - result: exit 1; `.github` directory not found.
  - changed files: no

- command: `rg --files -g *.js -g *.jsx -g *.jsxinc -g *.ts -g *.tsx -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: inventory source/test JS/JSX files relevant to `node --check`.
  - result: found JS/JSX files under `mcp-server`, `cep-panel`, `chatgpt-connector`, and `scripts`; no TS/TSX files.
  - changed files: no

- command: `rg --files -g .eslintrc* -g eslint.config.* -g tsconfig.json -g vitest.config.* -g jest.config.* -g playwright.config.* -g mocha.* -g ava.config.* -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: check for lint/typecheck/test-runner config files.
  - result: exit 1/no output; no configs found.
  - changed files: no

- command: `rg -n "module\.exports|exports\.|if \(require\.main === module\)|process\.argv|main\(\)\.catch|console\.log\(JSON\.stringify" scripts mcp-server chatgpt-connector -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: distinguish library modules from CLI-only scripts.
  - result: found CommonJS module exports for core modules and many smoke scripts with direct CLI execution.
  - changed files: no

- command: `rg -n -i "manual qa|manual test|manual validation|test plan|qa checklist|checklist|validation checklist|minimum.*verification|M100" README.md docs specs plans .codex-audit -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: second pass for manual QA checklist/M100 wording.
  - result: no single current manual QA checklist found; found historical handoff test plans and M100 protocol notes.
  - changed files: no

- command: `rg -n -i "agent-scenario-openai-cli-smoke|agent-scenario-smoke|planner corpus|vertical flow|panel-agent-plan|deterministic-plan-fallback|user prompt|agent response|UI display|confirmed AE action|AE result|semanticVerification|Outcome verification" README.md scripts\cep-panel-cdp-smoke.js scripts\agent-scenario-fixtures.js scripts\agent-planner-corpus-smoke.js docs plans .codex-audit -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: second pass for vertical-flow smoke evidence.
  - result: found live Agent scenario smoke coverage and offline planner corpus; no one-command local non-mutating full vertical smoke for prompt -> agent response -> UI -> confirmed AE action -> AE result/error.
  - changed files: no

- command: `rg -n -i "unit|integration|e2e|end-to-end|offline smoke|live CEP|smoke test|test verifies|without After Effects|temporary daemon|random local ports|fake" README.md chatgpt-connector\README.md scripts docs plans .codex-audit -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: classify test coverage types.
  - result: evidence supports smoke/integration/fake-provider/live CEP categories; conventional unit/integration/e2e taxonomy is not centralized.
  - changed files: no

- command: `rg -n -i "lint|typecheck|typescript|tsc|eslint|prettier|node --check|git diff --check|npm test|npm run|package scripts|configured checks" AGENTS.md README.md docs plans .codex-audit scripts -g !node_modules/** -g !dist/** -g !build/** -g !generated/** -g !cache/** -g !vendor/**`
  - reason: final pass for lint/typecheck/package scripts references.
  - result: found `node --check` and `git diff --check` references; no npm scripts/lint/typecheck runner found.
  - changed files: no

No test/lint/typecheck command was executed. Reason: this audit was read-only; many available validation commands spawn daemons, write `logs/*` artifacts, touch temp files, require live CEP/After Effects, send provider prompts, or can perform protected live AE mutations. `node --check` would be safe, but no JavaScript source was changed in this phase, so it was not necessary.

## Test coverage assessment

Проект имеет много smoke coverage, но не имеет стандартной package-manager test harness.

- Unit-like coverage: есть dependency-free scripts для отдельных модулей и контрактов: plan classification/repair, semantic verification, project intent memory, solution registry/retrieval/promotion, provider contract, reliability suite catalog.
- Integration coverage: `smoke-test.js` поднимает daemon and adapter, симулирует CEP polling через `/bridge/next` and `/bridge/result`, проверяет tool schemas, plan runner, dry-run/run gates and many bridge tool contracts. Это хороший local integration smoke, но он пишет локальные smoke artifacts under `logs/hardcore-sessions/smoke-*`.
- Provider mocks: `provider-api-smoke.js` uses local fake Gemini/Claude/OpenRouter/OpenAI-error servers. `provider-contract-smoke.js` fakes Codex CLI readiness/login states.
- Connector mocks: `chatgpt-connector-smoke.js` starts local connector and fake bridge, checks allowlists, gated JSX Lab payloads, static rejection, redaction and promotion hooks.
- Live CEP/E2E coverage: `cep-panel-cdp-smoke.js` covers installed CEP panel through CDP and includes read-only, UI-only/fake XHR, provider setup, connector status, mutating Safe Run, and Agent scenario commands. These require AE/panel/CDP and some commands need explicit external-provider or mutating-live approval.
- Vertical Agent QA: exists in live form through `agent-scenario-smoke` and `agent-scenario-openai-cli-smoke`. The flow covers prompt input, panel planning, UI display, dry-run, confirmed run, checkpoint/edit-session protection, and outcome verification. It is not a simple safe default command because it can use external provider/Codex CLI and mutate generated live AE items. The non-live `agent-planner-corpus-smoke.js` covers plan validation/dry-run only, not UI or AE execution.
- Logs/debug: backend JSONL logs and `/dev/logs` exist. CEP PlayerDebugMode setup is documented. However, QA does not appear to have a single debug-mode contract with log level, scenario IDs, and required user-visible correlation fields.

## Missing tests

- No `package.json` scripts, no CI config, no single `npm test`/`npm run check` equivalent.
- No lint/typecheck runner beyond `node --check` syntax checks and `git diff --check`.
- No isolated unit test harness for CEP panel state machines; panel behavior is mostly exercised through live CDP smoke or fake XHR injections.
- No fake `codex exec --json` subprocess smoke that returns delayed/malformed/valid JSONL assistant events and verifies bridge parsing, timeout, stderr, and UI display behavior.
- No isolated `CSInterface.evalScript` / AE host mock that covers callback ordering, empty result, malformed wrapper JSON, `EvalScript error.` variations, Unicode/control characters, timeout, and concurrent evalScript submission.
- No local non-mutating full vertical smoke for M100 flow: `user prompt -> agent response/action proposal -> UI display -> confirmed AE action -> AE result/error` with deterministic fake agent and fake AE executor.
- No direct test proving timed-out pending AE commands are removed/skipped before the panel later reconnects.
- No direct test proving malformed/empty wrapped `evalScript` result fails instead of becoming `{ ok:true, raw:true }`.
- No single manual QA checklist current to AE Agent 1.0.11; validation steps are spread across README, execution plan history, and handoffs.
- No QA test that asserts user-visible logs include the same request/action/execution/AE command correlation chain, because the protocol does not yet expose stable `actionId`/`executionId`.

## Minimum M100 verification checklist

automated:

- Confirm package manager state: no `package.json` means no dependency install or npm scripts are required; use bundled Node or known-good `node` explicitly.
- Run `node --check` for every touched `.js` file.
- Run `git diff --check`.
- Run local/offline suite after confirming allowed write side effects to `logs/` and temp dirs:
  - `node scripts/reliability-validation-suite-smoke.js`
  - `node scripts/reliability-validation-suite.js local`
  - or the equivalent explicit local smoke list from AGENTS/README.
- Run `node scripts/agent-planner-corpus-smoke.js` for accepted Agent scenario fixture validation/dry-run without providers, CEP, or AE mutations.
- Run `node scripts/cep-sync-health.js --check` when installed CEP reproducibility matters; do not use `--sync` or `--clear-cache` in audit-only mode.
- Do not run `external-provider` or `mutating-live` scopes without explicit approval.

mocked:

- Add/require a fake Codex exec process for JSONL cases:
  - valid assistant text;
  - delayed JSONL/progress;
  - stderr warning;
  - non-zero exit;
  - no assistant text;
  - malformed JSONL;
  - timeout.
- Add/require a fake AE host/evalScript harness:
  - one command at a time;
  - late result after timeout;
  - empty/malformed wrapper response;
  - `EvalScript error.` and non-standard error strings;
  - concurrent command submission guard;
  - Unicode/control-character serialization.
- Add/require a deterministic fake-agent/fake-AE vertical M100 smoke that checks:
  - user prompt accepted by panel;
  - structured `action_proposal` rendered as UI controls;
  - confirmation boundary;
  - fake AE execution result/error;
  - transcript/result display;
  - backend and UI logs include matching correlation IDs.
- Keep fake provider and fake connector checks from current suite.

manual inside After Effects:

- Open After Effects with installed `AE Agent 1.0.11` panel and confirm CEP remote debug/CDP target is reachable.
- Confirm panel sync health before testing: repo files match installed panel bundle; no stale cache symptoms.
- Confirm bridge health, token, panel connected state, `/bridge/next` polling, and Activity log status.
- Run read-only live CEP smoke first, for example `node scripts/cep-panel-cdp-smoke.js inspect` and `node scripts/cep-panel-cdp-smoke.js smoke`.
- For mutating M100 validation only after explicit approval:
  - use a saved test project;
  - use generated prefixes only;
  - confirm checkpoint/edit-session protection;
  - run `mutating-smoke` and/or `agent-scenario-smoke`;
  - verify cleanup leaves no generated comp/render queue leftovers.
- For external OpenAI/Codex CLI Agent validation only after explicit approval:
  - verify `openai-cli` readiness with `checkModels=0`;
  - run `agent-scenario-openai-cli-smoke`;
  - require `panelPlanCount === scenarioCount` and `fallbackCount === 0` when testing planner quality.
- Inspect backend JSONL logs and panel transcript after failures; M100 should require user-visible request/action/execution/log IDs.

## Findings

- title: No package-manager entrypoint for reproducible checks
  - type: process risk
  - severity: medium
  - confidence: high
  - evidence: `rg --files` found no `package.json` or lockfiles; no `.github` workflow config; README and AGENTS list direct `node scripts/...` commands.
  - impact: a new reviewer cannot run one standard `npm test`/`npm run check`; validation knowledge is spread across README, AGENTS, plan history, and individual scripts.
  - minimal fix: add a lightweight non-dependency script index or package-free `scripts/check-local.ps1`/`scripts/check-local.js` that documents and runs the approved local/offline checks without installing dependencies.
  - verification: from a clean checkout, one documented local command prints the exact local/offline check plan and exits non-zero on failure.

- title: No lint or typecheck layer beyond syntax checks
  - type: quality gap
  - severity: medium
  - confidence: high
  - evidence: no ESLint/TS/Jest/Vitest/Playwright config found; AGENTS and plan reference `node --check` and `git diff --check`.
  - impact: syntax errors are caught, but many API/contract mistakes, unused branches, and browser-global assumptions are left to smoke tests or live QA.
  - minimal fix: either document `node --check + focused smokes` as the intentional no-dependency policy, or add a no-install/local lint alternative if the project accepts a package manager later.
  - verification: documented check policy names what it catches and what it does not; touched JS syntax checks are mandatory before review.

- title: Local smoke suite is useful but not fully read-only
  - type: reproducibility risk
  - severity: medium
  - confidence: high
  - evidence: `smoke-test.js` writes smoke registry/memory copies under `logs/hardcore-sessions/smoke-*`; `reliability-validation-suite.js` writes reports under `logs/reliability-validation`; connector and candidate smokes can use temp/quarantine artifacts.
  - impact: audit-only prompts may correctly avoid running smokes, but normal reviewers need to know which scripts write ignored artifacts and which are pure read-only.
  - minimal fix: add a side-effect matrix for every smoke: `read-only`, `writes ignored logs`, `starts local daemon`, `requires live CEP`, `external provider`, `mutates generated AE`.
  - verification: `node scripts/reliability-validation-suite.js list` or a docs table shows side-effect class and approval requirements for every check.

- title: Full vertical M100 flow lacks a safe deterministic local smoke
  - type: coverage gap
  - severity: high
  - confidence: high
  - evidence: `cep-panel-cdp-smoke.js agent-scenario-smoke` covers prompt -> panel plan -> UI -> dry-run -> run -> verification, but it is live CEP/AE and can mutate generated items. `agent-planner-corpus-smoke.js` is local but stops at validation/dry-run and does not exercise UI display or AE result/error.
  - impact: the most important user-facing workflow cannot be reproduced safely in audit-only/local CI without AE, provider readiness, and mutation approvals.
  - minimal fix: add a deterministic fake-agent/fake-AE vertical smoke using the panel or panel-compatible harness and fake `/agents/*` plus fake `/bridge/*` result contracts.
  - verification: one local command proves `user prompt -> agent response/action proposal -> UI controls -> confirmation -> fake AE result/error -> transcript/log display` without external providers or AE mutations.

- title: Codex CLI process mock does not cover `codex exec` JSONL behavior
  - type: coverage gap
  - severity: high
  - confidence: high
  - evidence: `provider-contract-smoke.js` fakes `codex login status`; `runCodexCli()` production path parses JSONL and assistant text, but targeted searches found no fake `codex exec --json` completion smoke.
  - impact: regressions in JSONL parsing, stderr handling, timeout, missing assistant text, and delayed output can reach live panel testing before being caught.
  - minimal fix: add a fake executable or injectable runner for `runCodexCli()` covering success, malformed JSONL, no assistant message, non-zero exit, stderr, and timeout.
  - verification: provider/Codex smoke fails when JSONL parser drops final assistant text or misclassifies stderr/timeout.

- title: evalScript and AE host behavior are not isolated enough
  - type: coverage gap
  - severity: high
  - confidence: high
  - evidence: runtime `cep-panel/lib/CSInterface.js` only forwards to `window.__adobe_cep__.evalScript`; `smoke-test.js` posts fake `/bridge/result` payloads; `cep-panel-cdp-smoke.js` fakes XHR for UI endpoints but does not provide an isolated `evalScript` host mock.
  - impact: prior audit risks around late timed-out command execution, concurrent `evalScript`, malformed result success, and narrow error-prefix detection are not protected by cheap tests.
  - minimal fix: add a small host harness for the command executor that mocks `CSInterface.evalScript` responses and timing, plus backend checks for expired command IDs.
  - verification: tests fail until expired commands are skipped, concurrent host calls are gated, and malformed/empty wrapper responses are reported as errors.

- title: Manual QA checklist is not centralized
  - type: process gap
  - severity: medium
  - confidence: high
  - evidence: README contains install/smoke commands and plan history contains many validation notes, but searches did not find a single current `manual QA checklist` or `M100 verification checklist` document.
  - impact: live AE validation depends on reviewer memory and historical plan entries; the chance of skipping cache sync, generated-prefix cleanup, checkpoint checks, or provider approval gates is higher.
  - minimal fix: create a current manual QA checklist section/file for AE Agent 1.0.11 with read-only, external-provider, and mutating-live sections.
  - verification: a reviewer can follow the checklist from clean AE startup through read-only smoke and optional mutating/provider checks without reading old milestone history.

- title: Logs exist, but QA lacks a debug/correlation contract
  - type: observability gap
  - severity: medium
  - confidence: high
  - evidence: backend writes `logs/bridge-events.jsonl` and `logs/ai-agent-chats.jsonl`; README documents `/dev/logs`; prior protocol audit found fragmented `requestId`, `run.id`, `command.id`, `eventId`, `sessionId` and no unified `actionId`/`executionId`.
  - impact: failures can be logged but still hard to reproduce or correlate from the user's visible panel state to backend events and AE command results.
  - minimal fix: define required debug fields for QA output and UI errors: `requestId`, `actionId`, `executionId`, AE command id, log file/event id, provider/agent id, and failure phase.
  - verification: a failed vertical smoke shows the same correlation chain in panel transcript/status, smoke JSON output, and backend JSONL logs.
