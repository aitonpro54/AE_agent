# Target App Execution Plan

## Progress

- [x] Milestone 1: Docs and instruction baseline.
- [ ] Milestone 2: Provider model contract and OpenAI/Codex CLI provider.
- [ ] Milestone 3: AE GPT-style CEP layout.
- [ ] Milestone 4: Chat/Agent UX parity and prompt optimization.
- [ ] Milestone 5: Full validation and release notes.

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

## Decision Log

- 2026-05-13: ChatGPT subscription access will use Codex CLI auth, not a normal OpenAI API key.
- 2026-05-13: `OpenAI -> API` remains separate and uses API billing.
- 2026-05-13: No Pro/license gate in this project; the screenshot activation card is treated as reference-only.
- 2026-05-13: No production dependencies for CLI integration; use Node built-ins.
- 2026-05-13: Existing dirty worktree must be preserved; commits should stage only the current milestone changes.

## Validation

- Milestone 1:
  - Created `specs/target-app.md`.
  - Created `specs/screenshots/README.md`.
  - Created `plans/target-app-execplan.md`.
  - Updated `AGENTS.md` verification to repo-aware checks.
- Pending for later milestones:
  - `node --check mcp-server/ai-agents.js`
  - `node --check mcp-server/bridge-daemon.js`
  - `node --check cep-panel/panel.js`
  - `git diff --check`
  - `node scripts/bridge-only-smoke-test.js`
  - `node scripts/smoke-test.js`
  - `node scripts/cep-panel-cdp-smoke.js smoke` when After Effects and the CEP panel are available.
