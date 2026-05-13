# Target App Execution Plan

## Progress

- [x] Milestone 1: Docs and instruction baseline.
- [x] Milestone 2: Provider model contract and OpenAI/Codex CLI provider.
- [x] Milestone 3: AE GPT-style CEP layout.
- [x] Milestone 4: Chat/Agent UX parity and prompt optimization.
- [x] Milestone 5: Full validation and release notes.
- [x] Milestone 6: Installed CEP panel live validation.

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

## Decision Log

- 2026-05-13: ChatGPT subscription access will use Codex CLI auth, not a normal OpenAI API key.
- 2026-05-13: `OpenAI -> API` remains separate and uses API billing.
- 2026-05-13: No Pro/license gate in this project; the screenshot activation card is treated as reference-only.
- 2026-05-13: No production dependencies for CLI integration; use Node built-ins.
- 2026-05-13: Existing dirty worktree must be preserved; commits should stage only the current milestone changes.
- 2026-05-13: Gemini and Claude remain disabled UI placeholders until provider implementations are intentionally added.
- 2026-05-13: Static local Chrome preview is the repo UI smoke for this milestone; live CEP smoke requires copying the changed panel files into the installed Adobe CEP extension first.
- 2026-05-13: Installed CEP validation copies only changed panel files into `C:\Users\Ant\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge`; registry/debug settings are not changed.

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
