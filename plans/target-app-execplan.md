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

## Decision Log

- 2026-05-13: ChatGPT subscription access will use Codex CLI auth, not a normal OpenAI API key.
- 2026-05-13: `OpenAI -> API` remains separate and uses API billing.
- 2026-05-13: No Pro/license gate in this project; the screenshot activation card is treated as reference-only.
- 2026-05-13: No production dependencies for CLI integration; use Node built-ins.
- 2026-05-13: Existing dirty worktree must be preserved; commits should stage only the current milestone changes.
- 2026-05-13: Gemini and Claude remain disabled UI placeholders until provider implementations are intentionally added.
- 2026-05-13: Static local Chrome preview is the repo UI smoke for this milestone; live CEP smoke requires copying the changed panel files into the installed Adobe CEP extension first.
- 2026-05-13: Installed CEP validation copies only changed panel files into `C:\Users\Ant\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge`; registry/debug settings are not changed.
- 2026-05-13: OpenAI CLI live smoke stays chat-only; Local/Ollama remains the default live mutating smoke path because it avoids unnecessary paid/subscription model calls for AE mutations.
- 2026-05-13: Provider contract smoke simulates a missing Codex CLI with an invalid `CODEX_CLI_PATH`; authenticated CLI behavior remains covered by live CEP smoke.
- 2026-05-13: Chat history remains panel-local for v1; no backend persistence or migration is needed, and the old `codexAeChatTranscript` key stays as the active-conversation snapshot.
- 2026-05-13: The reference trial/license strip is not part of this product; removing it avoids implying an app license or Pro gate while preserving API/CLI billing distinctions.
- 2026-05-13: Model dropdown setup suffixes are UI labels only; option values remain canonical model ids such as `gpt-5.5`.

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
