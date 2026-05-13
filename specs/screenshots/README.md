# Screenshot Reference Notes

The screenshot references are visual and behavioral targets, not source code to copy.

## Reference 1: OpenAI CLI Selected

- Compact dark CEP window with a narrow top bar, left provider rail, and right chat area. The reference blue trial/license strip is intentionally omitted because this project has no license gate.
- Provider tabs: `Gemini`, `OpenAI`, `Claude`, `Local`.
- Gemini and Claude should be reachable setup placeholders in v1, not inert disabled controls.
- `OpenAI` is active.
- Auth mode segmented control shows `API` and `CLI`; `CLI` is selected.
- CLI mode shows a setup/pro feature card in the reference, but this project does not implement a license gate. Use an informational state that points to `codex login` instead.
- Model dropdown shows `GPT-5.5`.
- Chat input has `Chat` and `Agent` pill modes, with `Agent` active.
- Prompt Optimization is a visible toggle.

## Reference 2: OpenAI CLI Model Menu

- The model selector opens as a dark dropdown.
- V1 CLI model list:
  - `GPT-5.5`
  - `GPT-5.4`
  - `GPT-5.4-Mini`
  - `GPT-5.3-Codex`
  - `GPT-5.3-Codex-Spark`
  - `GPT-5.2`
- Do not expose `Codex Auto Review` as an AE chat model in V1.

## Reference 3: OpenAI API Without Key

- `OpenAI -> API` mode shows an API key input and disabled model state when no key is available.
- The model label should make setup status obvious, for example `GPT-5.5 (No API key)`.
- Saving keys must continue through the bridge secret store, never panel localStorage.

## Reference 4: Local/Ollama Connected

- `Local` provider shows a short local service description.
- It has a `Detect Ollama` action.
- When connected, it shows a green status like `Connected to Ollama - 3 models available`.
- Model dropdown lists installed Ollama models.
- No API key is required.

## Reference 5: Collapsed/Focused Chat Layout

- The provider sidebar can be collapsed or absent.
- The collapse control should render consistently in CEP/Windows and avoid mojibake-prone glyphs.
- The chat pane remains usable as the main surface.
- Agent responses render step cards with icon/status color:
  - ready/pending
  - completed
  - failed or needs review
- Bottom composer stays fixed and compact.
- Diagnostics/activity logs should stay out of the primary chat surface unless the user opens them.
