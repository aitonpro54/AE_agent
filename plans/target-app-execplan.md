# Target App Execution Plan

## Progress

- [x] Milestone 1: Docs and instruction baseline.
- [x] Milestone 2: Provider model contract and OpenAI/Codex CLI provider.
- [x] Milestone 3: AE GPT-style CEP layout.
- [x] Milestone 4: Chat/Agent UX parity and prompt optimization.
- [x] Milestone 5: Full validation and release notes.
- [x] Milestone 6: Installed CEP panel live validation.
- [x] Milestone 7: OpenAI CLI live panel validation.
- [x] Milestone 8: Provider contract smoke coverage.
- [x] Milestone 9: Local multi-chat history.
- [x] Milestone 10: Remove reference license gate UI.
- [x] Milestone 11: OpenAI API setup-state model labels.
- [x] Milestone 12: Panel-launched ChatGPT sign-in for OpenAI CLI.
- [x] Milestone 13: Bridge offline UX.
- [x] Milestone 14: ChatGPT sign-in status polling.
- [x] Milestone 15: Gemini/Claude setup placeholders.
- [x] Milestone 16: Sidebar collapse control polish.
- [x] Milestone 17: Diagnostics log toggle.
- [x] Milestone 18: Stable send button glyph.
- [x] Milestone 19: Prompt Optimization payload smoke.
- [x] Milestone 20: Gemini and Claude API providers.
- [x] Milestone 21: Provider key save smoke and docs cleanup.
- [x] Milestone 22: Provider wording consistency.
- [x] Milestone 23: MCP provider descriptions.
- [x] Milestone 24: README provider command examples.
- [x] Milestone 25: AE Agent rename and version bump.
- [x] Milestone 26: AE Agent 1.0.0 single-title cleanup.

## Milestones

### Milestone 1: Docs and instruction baseline

- Create `specs/target-app.md` as the target product source of truth.
- Create `specs/screenshots/README.md` to capture screenshot-derived UI requirements.
- Update `AGENTS.md` so verification matches this JavaScript/CEP bridge repository.
- Confirm the plan, spec, and screenshot notes exist before coding.

### Milestone 2: Provider model contract and OpenAI/Codex CLI provider

- Add public agent fields without breaking existing endpoints: `providerGroup`, `authMode`, `transport`, `uiModes`, `canSaveKey`, and `setupAction`.
- Add `openai-api` using `OPENAI_API_KEY` or the local bridge secret store. This is API billing, not ChatGPT subscription access.
- Add `openai-cli` using the installed Codex CLI and ChatGPT-managed CLI auth.
- Run `codex exec --ephemeral --json --sandbox read-only --model <model> <prompt>` for CLI-backed chat, parse the final assistant message from JSONL, and normalize it into the existing agent result shape.
- Keep existing OpenRouter, Ollama, Ollama Cloud, and custom provider behavior working.

### Milestone 3: AE GPT-style CEP layout

- Replace the generic Agent controls with provider tabs and an auth-mode segmented control.
- Show OpenAI API key entry only for `OpenAI -> API`.
- Show Codex CLI setup/status messaging only for `OpenAI -> CLI`.
- Show Ollama detection/status messaging for `Local`.
- Keep existing `localStorage` keys compatible where possible and avoid storing secrets in the panel.

### Milestone 4: Chat/Agent UX parity and prompt optimization

- Convert Chat/AE Plan selection into a visible `Chat` / `Agent` pill toggle.
- Add a Prompt Optimization toggle and pass its state to backend requests as a stable boolean.
- Render Agent plan/run output as step cards with ready/completed/failed states.
- Preserve existing validated plan execution gates, confirmation, checkpoints/edit sessions, and run formatting.

### Milestone 5: Full validation and release notes

- Update README and RELEASES with the OpenAI API vs OpenAI CLI distinction.
- Run repo checks and smoke tests.
- Run live CEP smoke only when After Effects and the panel are available.
- Record all validation results here before marking the milestone complete.

### Milestone 6: Installed CEP panel live validation

- Copy the updated repo CEP files into the installed Adobe CEP extension.
- Reload the live CEP panel through the DevTools target.
- Run read-only live CEP smoke.
- Run protected mutating live CEP smoke with generated `Codex Test Safe Run` items and cleanup.
- Keep generated smoke preview/log artifacts out of git.

### Milestone 7: OpenAI CLI live panel validation

- Add a live CEP smoke command that selects `OpenAI -> CLI`, model `gpt-5.5`, and `Chat` mode.
- Verify the installed panel can call the backend `openai-cli` provider and receive a real Codex CLI response.
- Keep this smoke chat-only so it validates ChatGPT/Codex subscription access without mutating the AE project.

### Milestone 8: Provider contract smoke coverage

- Add a provider contract smoke test for OpenAI `API` vs `CLI` metadata.
- Verify missing Codex CLI state reports `setupAction: codex_login`, no API key requirement, and the approved CLI model list.
- Make list-agent errors use provider-specific setup guidance instead of a generic not-configured message.

### Milestone 9: Local multi-chat history

- Add `New Chat` beside `Clear Chat` in the AE GPT-style history area.
- Persist multiple local chat sessions in panel `localStorage` while keeping the legacy active transcript key for compatibility.
- Add a live CEP history smoke that restores fixture conversations, switches history, creates a new blank chat, and restores the user's stored history afterward.

### Milestone 10: Remove reference license gate UI

- Remove the screenshot-derived `Trial Version` / `License...` strip from the CEP panel.
- Keep the compact AE GPT-style top bar and reclaim the removed strip height for the app shell.
- Update screenshot notes and release notes to make the no-license-gate decision explicit.

### Milestone 11: OpenAI API setup-state model labels

- Add setup suffixes to model dropdown labels when a provider is not configured.
- For `OpenAI -> API` without a key, show labels like `GPT-5.5 (No API key)`.
- Add a live CEP smoke for the OpenAI API no-key/setup state.

### Milestone 12: Panel-launched ChatGPT sign-in for OpenAI CLI

- Add a `Sign in with ChatGPT` action to the `OpenAI -> CLI` setup card.
- Add a local bridge endpoint that launches the official Codex CLI login flow for `openai-cli` only.
- Keep API keys separate: the sign-in action must not store ChatGPT tokens in CEP localStorage and must not apply to `OpenAI -> API`.
- Add contract and live CEP smoke coverage for the setup action without triggering a real login during tests.

### Milestone 13: Bridge offline UX

- Replace raw CEP network failures such as `HTTP 0`, `Network error`, and `Network timeout` with one friendly `Bridge offline` state.
- Add a compact bridge help line below the connection controls.
- Keep the panel as a bridge client; starting the bridge remains owned by Codex/MCP startup or the existing helper scripts.
- Add a live CEP offline smoke that points the panel at an unused local port, verifies the friendly state, and restores the user's bridge settings.

### Milestone 14: ChatGPT sign-in status polling

- After `OpenAI -> CLI -> Sign in with ChatGPT` launches, keep the panel in a waiting state and refresh provider readiness automatically for a short window.
- Stop polling once Codex CLI reports ChatGPT auth, when the bridge goes offline, or when the timeout expires.
- Do not enable CEP Node process execution just to start local services from the panel.

### Milestone 15: Gemini/Claude setup placeholders

- Make `Gemini` and `Claude` provider tabs clickable instead of disabled.
- Show an honest setup placeholder state for each without adding backend providers.
- Keep chat, Agent run, model check, API key save, auth mode, and local service controls disabled/hidden for placeholders.
- Add a live CEP smoke that clicks both placeholders, verifies the UI state, and restores prior provider selection.

### Milestone 16: Sidebar collapse control polish

- Replace Unicode collapse glyphs with ASCII `<` / `>` to avoid CEP/Windows encoding drift.
- Add `aria-expanded` to the provider sidebar collapse button.
- Add a live CEP smoke that toggles collapsed and expanded states and verifies text/title/accessibility state.

### Milestone 17: Diagnostics log toggle

- Expose the existing `Activity` log pane through a compact sidebar `Log` control.
- Persist the diagnostics pane state in panel `localStorage`.
- Keep diagnostics UI out of the main chat flow unless explicitly opened.
- Add a live CEP smoke that opens/closes diagnostics and verifies display state plus `aria-expanded`.

### Milestone 18: Stable send button glyph

- Replace the composer send button Unicode arrow with an ASCII `>` label to avoid mojibake in CEP/Windows.
- Preserve the existing `Send` tooltip and button sizing.
- Add a live CEP smoke that verifies the installed panel's send button label and tooltip.

### Milestone 19: Prompt Optimization payload smoke

- Add a dependency-free smoke test with a fake OpenAI-compatible provider.
- Verify `promptOptimization:true` reaches chat requests as a system instruction.
- Verify `promptOptimization:true` reaches AE Plan requests inside the generated planning prompt.
- Include the smoke in repo-aware verification docs.

### Milestone 20: Gemini and Claude API providers

- Add `gemini-api` using Google's Gemini `generateContent` REST endpoint and `GEMINI_API_KEY`.
- Add `claude-api` using Anthropic's Messages API and `ANTHROPIC_API_KEY`.
- Let Gemini and Claude tabs select real setup/API providers when present, while preserving honest setup states when keys are missing.
- Extend local secret saving to Gemini and Claude API keys.
- Add fake-provider smoke coverage for Gemini/Claude request/response normalization without calling external APIs.

### Milestone 21: Provider key save smoke and docs cleanup

- Add an isolated live CEP smoke that saves Gemini and Claude API keys through the panel without touching the user's real `.codex/agent-secrets.json`.
- Let the bridge use an alternate local secrets file during validation.
- Update stale docs/release notes that still describe Gemini and Claude as placeholder-only providers.

### Milestone 22: Provider wording consistency

- Update user-facing docs that still describe the agent layer as non-Codex-only.
- Update release notes that still describe Gemini and Claude as placeholder-only in the current release.
- Make the panel's fallback placeholder copy describe a missing bridge contract, not a future product plan.

### Milestone 23: MCP provider descriptions

- Update MCP tool descriptions for `list_ai_agents`, `check_ai_agent_readiness`, `chat_with_ai_agent`, and `plan_with_ai_agent` to include Gemini and Claude.
- Keep the public tool schemas compatible and avoid behavior changes.

### Milestone 24: README provider command examples

- Add manual MCP readiness examples for `gemini-api` and `claude-api`.
- Keep examples explicit that these paths use provider API keys, separate from ChatGPT subscription access.

### Milestone 25: AE Agent rename and version bump

- Rename the visible product from `Codex AE MCP Bridge` / `AE GPT` to `AE Agent`.
- Bump the reported version to `0.27.0` after the rename.
- Update CEP title/header/sidebar, manifest menu, install note, startup task helper defaults, smoke-test expectations, release notes, and target spec.
- Preserve stable internal ids and provider implementations; do not change Claude or Gemini provider behavior.

### Milestone 26: AE Agent 1.0.0 single-title cleanup

- Remove duplicate in-panel product names from the custom top bar and sidebar heading.
- Set the native/document/manifest title format to `AE Agent 1.0.0`.
- Bump the daemon, adapter, CEP panel, manifest, install note, and smoke expectations to `1.0.0`.
- Preserve Claude and Gemini provider behavior unchanged.

## Decision Log

- 2026-05-13: ChatGPT subscription access will use Codex CLI auth, not a normal OpenAI API key.
- 2026-05-13: `OpenAI -> API` remains separate and uses API billing.
- 2026-05-13: No Pro/license gate in this project; the screenshot activation card is treated as reference-only.
- 2026-05-13: No production dependencies for CLI integration; use Node built-ins.
- 2026-05-13: Existing dirty worktree must be preserved; commits should stage only the current milestone changes.
- 2026-05-13: Gemini and Claude remain setup placeholders until provider implementations are intentionally added.
- 2026-05-13: Static local Chrome preview is the repo UI smoke for this milestone; live CEP smoke requires copying the changed panel files into the installed Adobe CEP extension first.
- 2026-05-13: Installed CEP validation copies only changed panel files into `C:\Users\Ant\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge`; registry/debug settings are not changed.
- 2026-05-13: OpenAI CLI live smoke stays chat-only; Local/Ollama remains the default live mutating smoke path because it avoids unnecessary paid/subscription model calls for AE mutations.
- 2026-05-13: Provider contract smoke simulates a missing Codex CLI with an invalid `CODEX_CLI_PATH`; authenticated CLI behavior remains covered by live CEP smoke.
- 2026-05-13: Chat history remains panel-local for v1; no backend persistence or migration is needed, and the old `codexAeChatTranscript` key stays as the active-conversation snapshot.
- 2026-05-13: The reference trial/license strip is not part of this product; removing it avoids implying an app license or Pro gate while preserving API/CLI billing distinctions.
- 2026-05-13: Model dropdown setup suffixes are UI labels only; option values remain canonical model ids such as `gpt-5.5`.
- 2026-05-13: `Sign in with ChatGPT` launches the official local Codex CLI login flow from the bridge daemon; manual `codex login` remains a fallback for troubleshooting.
- 2026-05-13: CEP bridge offline handling should be friendly but non-magical; the panel reports offline clearly and keeps retrying, while process startup stays in the Codex/MCP layer.
- 2026-05-13: Keep direct process launching out of the CEP panel for v1; sign-in/status follow-up can be handled safely through the already-running bridge daemon.
- 2026-05-13: Gemini and Claude tabs should stay clickable and setup-aware; after Milestone 20 they resolve to real API providers when backend contracts are present.
- 2026-05-13: Use ASCII `<` / `>` for the sidebar collapse control to avoid Unicode/mojibake issues in CEP runtimes.
- 2026-05-13: Activity logs should be user-accessible on demand, but hidden by default so the first screen remains focused on provider setup and chat.
- 2026-05-13: Prefer stable ASCII labels for compact CEP icon-like controls when Unicode glyphs risk mojibake.
- 2026-05-13: Prompt Optimization coverage should inspect provider payloads with a fake local OpenAI-compatible endpoint instead of relying on real model behavior.
- 2026-05-13: Gemini and Claude provider support uses official HTTP APIs with Node built-ins; no production SDK dependency is added.
- 2026-05-13: Default provider model ids are conservative documented API ids: `gemini-2.5-flash` for Gemini and `claude-sonnet-4-20250514` for Claude.
- 2026-05-13: Live key-save smoke must run against an isolated temporary bridge secrets file, not the user's real provider keys.
- 2026-05-13: Placeholder fallback copy is only for bridge sessions missing a provider contract; the target v1 includes real Gemini and Claude API providers.
- 2026-05-13: MCP tool discovery text should enumerate the same first-party provider ids that the CEP panel exposes.
- 2026-05-13: README manual examples should include at least one command path for each first-party provider group exposed by the panel.
- 2026-05-13: The visible product name is `AE Agent`; the panel title should always include the current version after branding changes.
- 2026-05-13: Keep stable technical ids such as `com.codex.aemcpbridge` and `codex-ae-mcp-bridge` for compatibility while changing user-facing names.
- 2026-05-13: Claude and Gemini provider implementations stay frozen unless the user explicitly asks to change them.
- 2026-05-13: Current working product version is `1.0.0`; visible title format is `AE Agent 1.0.0` without a `v` prefix.
- 2026-05-13: Keep only the native CEP title/menu product name; remove duplicate in-panel product title rows.

## Validation

- Milestone 1:
  - Created `specs/target-app.md`.
  - Created `specs/screenshots/README.md`.
  - Created `plans/target-app-execplan.md`.
  - Updated `AGENTS.md` verification to repo-aware checks.
- Pending for later milestones:
- Milestone 2:
  - Added `openai-api` and `openai-cli`.
  - Added public agent metadata: `providerGroup`, `authMode`, `transport`, `uiModes`, `canSaveKey`, and `setupAction`.
  - Verified `openai-cli` with real `codex exec --ephemeral --json --sandbox read-only --model gpt-5.5`.
- Milestone 3:
  - Reworked the CEP panel into an AE GPT-style provider/sidebar and chat layout.
  - Preserved existing bridge connection, agent selection, model readiness, local transcript, and plan run controls.
- Milestone 4:
  - Added `Chat`/`Agent` pill controls.
  - Added Prompt Optimization state and backend prompt handling.
  - Rendered Agent plan/run text as compact step cards.
- Milestone 5:
  - Passed `node --check mcp-server/ai-agents.js`.
  - Passed `node --check mcp-server/bridge-daemon.js`.
  - Passed `node --check mcp-server/mcp-adapter.js`.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/smoke-test.js`.
  - Passed `node --check scripts/bridge-only-smoke-test.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed static Chrome preview of `cep-panel/index.html`; screenshot written to `logs/panel-preview.png`.
  - `node scripts/cep-panel-cdp-smoke.js inspect` reached the installed CEP panel, but it points at the older AppData extension copy. Run live `smoke` after copying the updated repo panel into the installed CEP extension.
- Milestone 6:
  - Copied `index.html`, `panel.js`, `style.css`, and `CSXS/manifest.xml` into the installed CEP extension.
  - Reloaded the installed CEP panel through `node scripts/cep-panel-cdp-smoke.js reload`.
  - Passed `node scripts/cep-panel-cdp-smoke.js smoke` against the installed panel with `ollama-local` / `gemma4:latest`.
  - Passed `node scripts/cep-panel-cdp-smoke.js mutating-smoke`; it created `Codex Test Safe Run 48750199`, used `auto_edit_session` with checkpoint `Intro_full-checkpoint-session-ai-plan-9d280408-2026-05-13T05-06-10-468Z.aep`, then cleanup removed the temporary comp.
  - Passed `node --check mcp-server/mcp-adapter.js`.
  - Passed `node --check scripts/bridge-only-smoke-test.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed XML parsing for `cep-panel/CSXS/manifest.xml`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 7:
  - Added `node scripts/cep-panel-cdp-smoke.js openai-cli-smoke`.
  - Passed `node scripts/cep-panel-cdp-smoke.js openai-cli-smoke` against the installed panel with `openai-cli` / `gpt-5.5`; response text was `AE GPT CLI OK`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 8:
  - Added `node scripts/provider-contract-smoke.js`.
  - Updated `AGENTS.md` to include the provider contract smoke in the repo-aware verification list.
  - Updated `listAgents` non-configured errors to use provider-specific setup guidance.
  - Passed `node --check mcp-server/ai-agents.js`.
  - Passed `node --check scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 9:
  - Added `New Chat` and multi-chat local history to the CEP panel.
  - Added `node scripts/cep-panel-cdp-smoke.js history-smoke`.
  - Copied updated `index.html`, `panel.js`, and `style.css` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js history-smoke`.
  - Passed `node scripts/cep-panel-cdp-smoke.js smoke`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 10:
  - Removed the `Trial Version` / `License...` strip from `cep-panel/index.html` and `cep-panel/style.css`.
  - Updated `specs/screenshots/README.md` and `RELEASES.md` with the no-license-gate decision.
  - Copied updated `index.html` and `style.css` into the installed CEP extension.
  - Passed installed-panel reload through `node scripts/cep-panel-cdp-smoke.js reload`.
  - Passed installed extension text check: no `Trial Version`, `License...`, or `trial-bar` remains in the installed `index.html`.
  - Passed `node scripts/cep-panel-cdp-smoke.js history-smoke`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 11:
  - Added model dropdown setup suffixes in `cep-panel/panel.js`.
  - Added `node scripts/cep-panel-cdp-smoke.js openai-api-setup-smoke`.
  - Copied updated `panel.js` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js openai-api-setup-smoke` with a temporary bridge job.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 12:
  - Added `POST /agents/setup` and `/dev/agents/setup` for `openai-cli` / `codex_login`.
  - Added `Sign in with ChatGPT` button to the OpenAI CLI setup card.
  - Added `node scripts/cep-panel-cdp-smoke.js openai-cli-setup-smoke`.
  - Updated `specs/target-app.md`, `README.md`, and `RELEASES.md`.
  - Copied updated `index.html`, `panel.js`, and `style.css` into the installed CEP extension.
  - Passed `node --check mcp-server/ai-agents.js`.
  - Passed `node --check mcp-server/bridge-daemon.js`.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js openai-cli-setup-smoke` with a temporary bridge job.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 13:
  - Added a visible `bridgeHelp` line to the CEP connection area.
  - Normalized local bridge transport failures to `Bridge offline. Start the local bridge from Codex, then click Connect.`
  - Added `node scripts/cep-panel-cdp-smoke.js offline-smoke` to validate the installed panel's offline state and restore prior bridge settings afterward.
  - Copied updated `index.html`, `panel.js`, and `style.css` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js offline-smoke`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 14:
  - Added automatic short-window provider refresh after `Sign in with ChatGPT` launches.
  - Added stop conditions for completed Codex CLI login, bridge offline, disconnect, reload, and timeout.
  - Copied updated `panel.js` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js openai-cli-setup-smoke` with a temporary bridge job; installed panel showed Codex CLI signed in.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 15:
  - Made `Gemini` and `Claude` provider tabs clickable.
  - Added placeholder setup rendering for planned provider groups without backend agents.
  - Added `node scripts/cep-panel-cdp-smoke.js provider-placeholder-smoke`.
  - Copied updated `index.html` and `panel.js` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js provider-placeholder-smoke` with a temporary bridge job.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 16:
  - Replaced sidebar collapse button text with ASCII `<` / `>`.
  - Added `aria-expanded` updates for expanded/collapsed states.
  - Added `node scripts/cep-panel-cdp-smoke.js sidebar-collapse-smoke`.
  - Copied updated `index.html` and `panel.js` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js sidebar-collapse-smoke`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 17:
  - Added `Log` / `Hide log` diagnostics toggle to the bridge connection controls.
  - Added persisted `codexAeDiagnosticsOpen` state and `aria-expanded` updates.
  - Added `node scripts/cep-panel-cdp-smoke.js diagnostics-smoke`.
  - Copied updated `index.html`, `panel.js`, and `style.css` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js diagnostics-smoke`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 18:
  - Replaced the composer send button glyph with ASCII `>`.
  - Added `node scripts/cep-panel-cdp-smoke.js send-button-smoke`.
  - Copied updated `index.html` into the installed CEP extension.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js send-button-smoke`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 19:
  - Added `node scripts/prompt-optimization-smoke.js`.
  - Updated `AGENTS.md` and `README.md` verification notes to include the prompt optimization smoke.
  - Passed `node --check scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 20:
  - Added `gemini-api` and `claude-api` provider definitions.
  - Added Gemini `generateContent` request/response normalization.
  - Added Anthropic Messages API request/response normalization.
  - Added Gemini/Claude API key saving support in the bridge daemon.
  - Updated CEP provider selection so Gemini/Claude tabs use real provider setup states when backend agents exist.
  - Added `node scripts/provider-api-smoke.js`.
  - Copied updated `panel.js` into the installed CEP extension.
  - Passed `node --check mcp-server/ai-agents.js`.
  - Passed `node --check mcp-server/bridge-daemon.js`.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check scripts/provider-contract-smoke.js`.
  - Passed `node --check scripts/provider-api-smoke.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js provider-setup-smoke` with a temporary bridge job.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 21:
  - Added `AE_AGENT_SECRETS_FILE` so validation can isolate bridge secret writes.
  - Added `node scripts/provider-key-save-smoke.js`.
  - Added guarded `node scripts/cep-panel-cdp-smoke.js provider-key-save-smoke`.
  - Updated README, release notes, screenshot notes, and repo verification instructions to reflect real Gemini/Claude API providers.
  - Passed `node --check mcp-server/bridge-daemon.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts/provider-key-save-smoke.js`.
  - Passed `node --check scripts/provider-contract-smoke.js`.
  - Passed `node --check scripts/provider-api-smoke.js`.
  - Passed `node scripts/provider-key-save-smoke.js` against the installed CEP panel with a temporary bridge and temporary secret file.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 22:
  - Updated README agent-provider descriptions to include OpenAI, Gemini, and Claude.
  - Updated current release notes from placeholder-only Gemini/Claude wording to real setup-aware provider wording.
  - Updated CEP fallback copy for missing provider contracts.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Live installed-panel copy/smoke for the fallback text was not rerun because the approval review for copying `panel.js` into the Adobe CEP extension hit an auto-review capacity failure. The changed fallback only applies when a bridge session omits Gemini/Claude contracts; normal provider flows remain covered by the repo and provider smokes.
- Milestone 23:
  - Updated MCP tool descriptions and agentId examples to include `gemini-api` and `claude-api`.
  - Kept schemas and runtime behavior unchanged.
  - Passed `node --check mcp-server/bridge-daemon.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 24:
  - Added README `mcp-call-tool.js check_ai_agent_readiness` examples for `gemini-api` and `claude-api`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
- Milestone 25:
  - Renamed visible CEP product text to `AE Agent`.
  - Removed `AE GPT` from the CEP window header.
  - Bumped daemon, adapter, CEP panel, manifest, install note, and smoke expectations to `0.27.0`.
  - Updated planning prompt product text, README, release notes, target spec, OpenRouter attribution, and startup task helper defaults.
  - Left Claude and Gemini provider implementations unchanged.
  - Copied updated `index.html`, `panel.js`, and `CSXS/manifest.xml` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check mcp-server/bridge-daemon.js`.
  - Passed `node --check mcp-server/mcp-adapter.js`.
  - Passed `node --check mcp-server/ai-agents.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts/bridge-only-smoke-test.js`.
  - Passed `node --check scripts/smoke-test.js`.
  - Passed XML parsing for `cep-panel/CSXS/manifest.xml`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js branding-smoke` against the installed CEP panel.
- Milestone 26:
  - Removed the duplicate in-panel custom top bar and sidebar product heading.
  - Set CEP document title and manifest/menu title to `AE Agent 1.0.0`.
  - Bumped daemon, adapter, CEP panel, manifest, install note, and smoke expectations to `1.0.0`.
  - Left Claude and Gemini provider behavior unchanged.
  - Copied updated `index.html`, `panel.js`, `style.css`, and `CSXS/manifest.xml` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node --check mcp-server/bridge-daemon.js`.
  - Passed `node --check mcp-server/mcp-adapter.js`.
  - Passed `node --check scripts/bridge-only-smoke-test.js`.
  - Passed `node --check scripts/cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts/smoke-test.js`.
  - Passed XML parsing for `cep-panel/CSXS/manifest.xml`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js branding-smoke` against the installed CEP panel; the actual document title is `AE Agent 1.0.0`, duplicate title DOM nodes are absent, and the DevTools target metadata may keep the old title until the host panel target refreshes.
  - Passed `git diff --check`.
