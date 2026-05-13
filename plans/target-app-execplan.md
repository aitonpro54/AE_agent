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
- [x] Milestone 27: Native CEP window title sync.
- [x] Milestone 28: Provider refresh after bridge reconnect.
- [x] Milestone 29: Selected layer Agent run binding fix.
- [x] Milestone 30: Selected layer CTI alignment tool.
- [x] Milestone 31: Agent comp runtime binding hardening.
- [x] Milestone 32: Direct Run Plan and working indicator.
- [x] Milestone 33: Voice input in chat composer.
- [x] Milestone 34: Voice input microphone permission hardening.
- [x] Milestone 35: Voice input API transcription fallback.
- [x] Milestone 36: Project relocation to `C:\Users\Ant\Documents\Codex\AE_agent`.
- [x] Milestone 37: Remove built-in CEP voice input.

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

### Milestone 27: Native CEP window title sync

- Force the live CEP host window title through the native CEP runtime when the panel loads.
- Keep the product title as `AE Agent 1.0.0`.
- Do not change provider implementations or bridge contracts.

### Milestone 28: Provider refresh after bridge reconnect

- Refresh provider/model metadata after `/bridge/next` first succeeds following an offline or connecting state.
- Ensure the panel does not remain stuck with empty agents and a stale `Bridge offline` provider message while the bridge transport is already online.
- Do not change provider implementations or bridge contracts.

### Milestone 29: Selected layer Agent run binding fix

- Resolve common model-produced `{{selectedLayerIndices}}` bindings from prior `get_active_comp` or `get_selected_layers` steps.
- Allow `set_property_value` to target multiple layer indexes when the same value/property should be applied to selected layers.
- Treat `threeDLayer` as a safe layer attribute in `set_property_value`.
- Keep checkpoint/edit-session protection unchanged for mutating Agent runs.

### Milestone 30: Selected layer CTI alignment tool

- Add a narrow `align_layers_to_time` MCP tool for aligning selected or specified layers to the active comp current time indicator.
- Teach AE Plan prompting to prefer this tool for selected layer/precomp timeline alignment instead of raw ExtendScript.
- Preserve raw ExtendScript blocking in Agent runs.
- Keep checkpoint/edit-session protection unchanged for mutating Agent runs.

### Milestone 31: Agent comp runtime binding hardening

- Resolve common model-produced `{{compItemIndex}}` and `{{compName}}` bindings from prior `get_active_comp`, `get_comp_details`, `get_selected_layers`, project snapshot, and duplicate-comp results.
- Support wrapped step shorthands such as `{{steps.1.result}}` in addition to bare `steps.1.result` / `step-1-result`.
- Add selected precomp/source-comp binding aliases such as `{{selectedPrecompItemIndex}}` for plans that intentionally target a selected layer's source composition.
- Extend smoke coverage so read-only Agent plan runs execute dependent comp bindings instead of only validating the plan shape.

### Milestone 32: Direct Run Plan and working indicator

- Remove the browser confirm dialog from the CEP `Run plan` button; the validated plan run should start immediately when the user clicks the button.
- Keep backend safety gates unchanged: confirmed non-dry runs still send `confirm:true`, and mutating runs still request `allowMutations:true` plus `autoEditSession:true`.
- Add a temporary animated chat indicator while chat, planning, dry-run, and run requests are in flight.
- Keep the temporary working indicator out of persisted chat history.

### Milestone 33: Voice input in chat composer

- Add a compact microphone control and `RU` / `EN` / `Auto` language selector beside the chat composer send button.
- Use the CEP runtime's browser speech-recognition API to insert recognized text into `chatPrompt` without auto-sending.
- Keep the voice language preference in panel `localStorage` and default to `RU` because the user primarily prompts in Russian while CEP reports an English browser locale.
- Add live CEP smoke coverage with a mocked speech recognizer so validation does not require real microphone input.

### Milestone 34: Voice input microphone permission hardening

- Enable CEP media-stream support in the panel manifest so microphone capture is allowed by the embedded CEF runtime.
- Check microphone access before starting speech recognition and show a clear blocked/busy/missing microphone status instead of silently listening forever.
- Add a no-activity timeout for speech recognition sessions that start but never receive native microphone/speech events.
- Keep mocked voice smoke independent of a real microphone by stubbing both speech recognition and `getUserMedia`.

### Milestone 35: Voice input API transcription fallback

- Add a bridge `/voice/status` and `/voice/transcribe` path backed by OpenAI API transcription when browser Web Speech fails with `network` in CEP.
- Record short voice clips in the CEP panel with `MediaRecorder`, send audio to the bridge as base64, and insert the returned transcript into `chatPrompt` without auto-sending.
- Require the saved `OpenAI -> API` key or `OPENAI_API_KEY` for the fallback; keep ChatGPT/Codex CLI access separate from API-billed audio transcription.
- Add a fake OpenAI transcription smoke so the multipart audio request and bridge contract are covered without external API calls.

### Milestone 36: Project relocation to `C:\Users\Ant\Documents\Codex\AE_agent`

- Move the full working project, including git history and ignored runtime state, into `C:\Users\Ant\Documents\Codex\AE_agent`.
- Update path-based local MCP config examples and active handoff notes from the old `New project 2` root to the new project root.
- Refresh the user's Codex MCP `after-effects` entry after the move so the adapter launches from the new path.
- Keep runtime logs, checkpoints, and local secrets ignored by git after relocation.

### Milestone 37: Remove built-in CEP voice input

- Remove the microphone button and voice language selector from the CEP composer.
- Remove panel Web Speech, microphone permission, MediaRecorder, and API transcription fallback logic.
- Remove bridge `/voice/status` and `/voice/transcribe` endpoints and their fake OpenAI transcription smoke.
- Remove CEP media/speech manifest flags because the panel no longer captures audio.
- Keep external dictation supported naturally by focusing the chat textarea and letting the user's third-party tool type or paste text there.

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
- 2026-05-13: CEP may keep an older host-frame title after manifest changes; the panel should call native `setWindowTitle` on load to synchronize the visible AE frame title.
- 2026-05-13: A successful bridge poll should refresh provider metadata after reconnect because the initial `/agents` request can fail while the daemon is still starting.
- 2026-05-13: Selected-layer Agent plans may use template bindings like `{{selectedLayerIndices}}`; the runner should resolve these from inspection results instead of passing the literal string to mutating tools.
- 2026-05-13: Do not enable raw ExtendScript in Agent mode for common timeline alignment; add typed bridge tools for narrow AE actions instead.
- 2026-05-13: Runtime binding aliases should resolve against established tool result shapes, not literal field names only; `{{compItemIndex}}` can map from `itemIndex`, `comp.itemIndex`, active project item metadata, or duplicate results depending on the prior step payload.
- 2026-05-13: Selected precomp/source-comp bindings should use explicit aliases and stay unresolved when multiple different selected source comps are present, rather than guessing a target.
- 2026-05-13: CEP `Run plan` should not show a second browser confirmation; the plan card and enabled Run button are the user-facing confirmation point, while backend mutation/edit-session safeguards remain mandatory.
- 2026-05-13: Model calls and plan runs should show a lightweight transient chat working indicator so the panel feels alive during long provider responses.
- 2026-05-13: Voice input v1 uses CEP's built-in `webkitSpeechRecognition` path because the installed panel exposes it; OpenAI audio transcription remains a possible later API-billing option, not part of this milestone.
- 2026-05-13: Voice input should insert recognized text into the composer only and never auto-send, so Agent-mode actions remain reviewable before running.
- 2026-05-13: CEP microphone access requires the manifest CEF media-stream flag; page reload alone may not apply new CEF command-line flags, so the installed panel/After Effects should be restarted after copying the manifest.
- 2026-05-13: CEP Web Speech can expose `webkitSpeechRecognition` but still fail with `network`; voice input therefore needs an API transcription fallback for reliable operation.
- 2026-05-13: Voice API transcription uses the saved OpenAI API key path and is separate from OpenAI CLI/ChatGPT subscription access.
- 2026-05-13: The active project root is now `C:\Users\Ant\Documents\Codex\AE_agent`; tracked examples should point there while ignored runtime state remains local-only.
- 2026-05-13: Built-in CEP voice capture is removed. Speech-to-text is now owned by the user's external dictation tool, which inserts text into the focused chat textarea without panel microphone UI or provider-billed transcription endpoints.

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
- Milestone 27:
  - Added native CEP `setWindowTitle` synchronization during `setAppTitle`.
  - Verified the installed `com.codex.aemcpbridge` manifest, HTML title, and panel version are `AE Agent 1.0.0`.
  - Verified `.debug` contains only the extension id/port and no stale title.
  - Copied updated `panel.js` into the installed CEP extension.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js reload`; the live DevTools page title and document title both reported `AE Agent 1.0.0`.
  - Passed `node scripts/cep-panel-cdp-smoke.js branding-smoke`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `git diff --check`.
- Milestone 28:
  - Updated CEP polling so the first successful bridge poll after offline/connecting refreshes provider/model metadata.
  - Copied updated `panel.js` into the installed CEP extension.
  - Verified live bridge health on `127.0.0.1:3456` reports `codex-ae-mcp-bridge` version `1.0.0` and sees the CEP panel.
  - Passed `node scripts/cep-panel-cdp-smoke.js reload`; the live panel reported `Connected`, `online`, selected `openai-cli`, 6 CLI models, and enabled Send.
  - Passed `node --check cep-panel/panel.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `git diff --check`.
- Milestone 29:
  - Root cause: the model produced `layerIndex: "{{selectedLayerIndices}}"` and `propertyPath: "threeDLayer"`; the runner passed the literal layerIndex string to `set_property_value`.
  - Added template binding support for selected-layer indexes from prior `get_active_comp` / `get_selected_layers` results.
  - Updated `set_property_value` to accept multiple layer indexes for the same property/value.
  - Updated `set_property_value` to accept `threeDLayer` as a layer attribute.
  - Extended `node scripts/smoke-test.js` to cover multi-layer `threeDLayer` setting through the bridge command queue.
  - Restarted the live bridge daemon on `127.0.0.1:3456` with the fixed backend.
  - Verified live `/health` reports `codex-ae-mcp-bridge` version `1.0.0` and the CEP panel is connected.
  - Passed a live dry-run of the selected-layer 3D plan shape without mutating the user's current composition.
  - Passed `node --check mcp-server/bridge-daemon.js`.
  - Passed `node --check scripts/smoke-test.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `git diff --check`.
- Milestone 30:
  - Added `align_layers_to_time` as a narrow mutating MCP tool for selected or explicit layer timing alignment.
  - Updated AE Plan prompting to prefer `align_layers_to_time` for selected layer/precomp alignment to the current time indicator instead of raw ExtendScript.
  - Extended mutation metadata inference and queue-level smoke coverage for multi-layer alignment.
  - Passed a temporary Agent-plan smoke: the planning prompt exposed `align_layers_to_time`, the generated plan used `get_active_comp -> align_layers_to_time -> get_selected_layers`, validation reported 1 mutating step, and dry-run marked the alignment step `ready`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js` after one startup-race retry.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `git diff --check`.
- Milestone 31:
  - Root cause: Agent runs only resolved named template bindings by literal payload paths, so `{{compItemIndex}}` did not map to `get_active_comp`'s `itemIndex` result and blocked before the mutating/verification tool could run.
  - Added canonical comp/item/layer binding aliases and default extraction from active comp, project active item, and `duplicate_comp` result payloads.
  - Added wrapped step binding support for forms like `{{steps.1.result}}`.
  - Added selected source/precomp aliases with ambiguity protection when multiple different selected source comps are present.
  - Updated the AE Plan prompt to teach `{{compItemIndex}}` for active comp follow-up steps and `{{selectedPrecompItemIndex}}` for selected source/precomp operations.
  - Extended `node scripts/smoke-test.js` with a read-only dependent Agent run covering `{{compItemIndex}}`, `{{steps.1.result}}`, and `{{selectedPrecompItemIndex}}`.
  - Restarted the live bridge daemon on `127.0.0.1:3456` with the fixed backend; live `/health` reported `codex-ae-mcp-bridge` version `1.0.0` and the CEP panel connected.
  - Passed a live read-only comp binding run after one AE command timeout retry: `get_active_comp` returned `Slides_fin`, and `get_comp_details` executed with resolved `compItemIndex: 2142`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\smoke-test.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js smoke` against the installed CEP panel.
  - Passed `git diff --check`.
- Milestone 32:
  - Removed `window.confirm` from CEP `runLastPlan`; Run Plan now immediately posts to `/agents/plan/run`.
  - Preserved backend `confirm:true`, `allowMutations:true`, and `autoEditSession:true` for confirmed mutating runs.
  - Added a transient chat working indicator with animated three-dot status labels for planning, thinking, checking, and running states.
  - Kept the working indicator out of `codexAeChatTranscript` and local multi-chat session persistence.
  - Updated `node scripts/cep-panel-cdp-smoke.js` to assert the planning indicator appears and to fail if a Run Plan click triggers `window.confirm`.
  - Copied updated `panel.js` and `style.css` into the installed CEP extension.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js reload` against the installed CEP panel.
  - Passed `node scripts/cep-panel-cdp-smoke.js smoke` against the installed CEP panel.
  - Passed `node scripts/cep-panel-cdp-smoke.js mutating-smoke` on retry; first attempt hit an AE edit-session startup timeout before mutation, second attempt created and cleaned up `Codex Test Safe Run 81974680` with `confirmMessages: []`.
  - Passed `git diff --check`.
- Milestone 33:
  - Added a compact voice input button and `RU` / `EN` / `Auto` language selector beside the composer send button.
  - Wired CEP `webkitSpeechRecognition` support to insert recognized text into `chatPrompt` without auto-sending.
  - Persisted the voice language preference with `codexAeVoiceLanguage`, defaulting to `RU`.
  - Added CSS-only microphone styling and disabled/listening visual states.
  - Added `node scripts/cep-panel-cdp-smoke.js voice-input-smoke` with a mocked speech recognizer.
  - Copied updated `index.html`, `panel.js`, and `style.css` into the installed CEP extension.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js reload` against the installed CEP panel; voice support reported available.
  - Passed `node scripts/cep-panel-cdp-smoke.js voice-input-smoke`; mock text inserted into the prompt and did not enter chat history.
  - Passed `node scripts/cep-panel-cdp-smoke.js smoke` against the installed CEP panel.
- Milestone 34:
  - Root cause: live CEP reported `microphone: denied`, `getUserMedia({ audio:true })` failed with `NotAllowedError`, and native `webkitSpeechRecognition` produced no events while the UI stayed in `Listening...`.
  - Added `--enable-media-stream` and `--enable-speech-input` to the CEP manifest.
  - Added microphone preflight before speech recognition starts, clearer blocked/missing/busy microphone messages, and a no-activity timeout if CEP starts listening but receives no native speech events.
  - Updated `voice-input-smoke` to mock both speech recognition and `getUserMedia`.
  - Copied updated `panel.js` and `CSXS/manifest.xml` into the installed CEP extension.
  - Verified the installed manifest contains `--enable-media-stream` and `--enable-speech-input`.
  - Current live CEP process still reports `getUserMedia` as `NotAllowedError` until the panel/After Effects is restarted with the new manifest flags.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed XML parsing for `cep-panel\CSXS\manifest.xml`.
  - Passed `git diff --check`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js reload` against the installed CEP panel.
  - Passed `node scripts/cep-panel-cdp-smoke.js voice-input-smoke`.
  - Passed `node scripts/cep-panel-cdp-smoke.js smoke`.
- Milestone 35:
  - Root cause after AE restart: CEP Web Speech no longer had microphone permission trouble, but `webkitSpeechRecognition` failed with `network`, so the browser speech service was unavailable in embedded Chromium.
  - Added `/voice/status` for OpenAI API transcription readiness and `/voice/transcribe` for API-backed audio transcription.
  - Added multipart upload to the OpenAI `/audio/transcriptions` endpoint using `gpt-4o-mini-transcribe` by default.
  - Added CEP `MediaRecorder` fallback that records audio when Web Speech fails with `network`, checks for an OpenAI API key before recording, sends audio to the bridge, and inserts returned text into `chatPrompt` without auto-sending.
  - Added `node scripts/voice-transcription-smoke.js` with a fake OpenAI transcription endpoint.
  - Copied updated `panel.js` into the installed CEP extension.
  - Restarted the live bridge daemon on `127.0.0.1:3456` with the voice transcription endpoint available.
  - Verified live `/voice/status` returns `provider: openai-api`, `configured: false`, and `model: gpt-4o-mini-transcribe`.
  - Verified the installed panel now reports `Voice transcription needs an OpenAI API key. Save one in OpenAI -> API.` instead of silently failing after CEP Web Speech returns `network`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed `node --check scripts\voice-transcription-smoke.js`.
  - Passed `node scripts/voice-transcription-smoke.js`.
  - Passed `git diff --check`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `node scripts/cep-panel-cdp-smoke.js reload` against the installed CEP panel.
  - Passed `node scripts/cep-panel-cdp-smoke.js voice-input-smoke`.
  - Passed `node scripts/cep-panel-cdp-smoke.js smoke`.
- Milestone 36:
  - Updated tracked local path references from `C:\Users\Ant\Documents\New project 2` to `C:\Users\Ant\Documents\Codex\AE_agent`.
  - Updated `mcp-config.example.json`, `docs/project-memory.md`, `docs/2026-05-13-new-chat-handoff.md`, and this plan.
  - No JavaScript files were changed, so `node --check` did not apply to touched files.
  - No package manager check is configured because the repository has no `package.json`.
  - Passed `git diff --check`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed `node scripts/voice-transcription-smoke.js`.
  - Live CEP smoke was not rerun because the relocation changes do not touch installed CEP panel files.
- Milestone 37:
  - Removed the CEP microphone button, voice language selector, mic icon styles, and composer voice layout column.
  - Removed panel Web Speech, microphone permission, MediaRecorder, API transcription fallback, and voice localStorage state.
  - Removed bridge voice transcription constants, multipart OpenAI audio upload helper, `/voice/status`, and `/voice/transcribe`.
  - Removed `scripts/voice-transcription-smoke.js` and the mocked `voice-input-smoke` command.
  - Removed CEP manifest media/speech flags.
  - Updated `docs/2026-05-13-new-chat-handoff.md` to mark external dictation as the active direction.
  - Copied updated `index.html`, `panel.js`, `style.css`, and `CSXS/manifest.xml` into the installed CEP extension.
  - Passed static search confirming no runtime/test identifiers remain for `voiceInputButton`, `voiceLanguage`, Web Speech, MediaRecorder, `/voice/*`, or CEP media/speech flags in `cep-panel`, `mcp-server`, and `scripts`.
  - Passed `node --check cep-panel\panel.js`.
  - Passed `node --check mcp-server\bridge-daemon.js`.
  - Passed `node --check scripts\cep-panel-cdp-smoke.js`.
  - Passed XML parsing for `cep-panel\CSXS\manifest.xml`.
  - Passed `git diff --check`.
  - Passed `node scripts/provider-contract-smoke.js`.
  - Passed `node scripts/provider-api-smoke.js`.
  - Passed `node scripts/prompt-optimization-smoke.js`.
  - Passed `node scripts/bridge-only-smoke-test.js`.
  - Passed `node scripts/smoke-test.js`.
  - Passed installed CEP extension static search for removed voice/runtime identifiers.
  - Passed `node scripts/cep-panel-cdp-smoke.js reload` against the installed CEP panel.
  - Passed `node scripts/cep-panel-cdp-smoke.js smoke` against the installed CEP panel.
