# AE Agent Target Application

## Goal

Build this repository into AE Agent, a local After Effects AI panel that combines the current bridge safety model with a compact reference-panel-inspired user experience.

The panel remains a client of the local bridge daemon. The daemon remains the owner of provider access, chat calls, AE plan validation, execution gates, logs, checkpoints, and edit-session protection.

## Product Shape

- The first screen is a compact dark CEP panel inspired by the references in `specs/screenshots/`.
- The visible product title format is `AE Agent 1.0.8` in the native CEP title/menu only; do not duplicate the product name in a separate in-panel top bar or sidebar heading.
- The left side exposes provider setup: `Gemini`, `OpenAI`, `Claude`, `OpenRouter`, and `Local`.
- `OpenAI` supports two auth modes:
  - `API`: uses an OpenAI API key and normal API billing.
  - `CLI`: uses the installed Codex CLI after the user has signed in with ChatGPT through the panel's sign-in action or `codex login`.
- `Local` detects Ollama on `127.0.0.1:11434`, lists installed models, and does not require an API key.
- `Gemini` and `Claude` support API-key setup states and provider calls through their official HTTP APIs.
- The chat area supports `Chat`, `Agent`, and `Agent Hardcore` modes, a model selector, prompt input, chat history, and a visible Prompt Optimization toggle.
- Agent mode shows planned steps with success/error/ready states and concrete backend results.
- Valid Agent-mode plans expose inline `Dry run / Проверить` and `Выполнить план` actions in the chat message, wired to the same validated plan runner and safety gates as the persistent composer controls.
- When an Agent plan or run shows a typed-tool gap, raw ExtendScript workaround, failed run, or semantic verification issue, the panel can prepare a targeted dev-request bundle for Codex App instead of continuing repository development inside the AE chat.

## ChatGPT Subscription Model Access

ChatGPT subscription access must not be represented as a normal OpenAI API key. The target behavior is:

- `OpenAI -> CLI` is the ChatGPT/Codex subscription path.
- The bridge checks whether `codex` is installed and whether CLI auth appears usable.
- The bridge runs subscription-backed requests through `codex exec --ephemeral --json --sandbox read-only --model <model> <prompt>`.
- The bridge parses the final assistant message from the JSONL stream and normalizes it into the existing agent result shape.
- If CLI auth is missing, the UI offers a `Sign in with ChatGPT` action that launches the local Codex CLI login flow and refreshes readiness automatically for a short window. Manual `codex login` remains a fallback.

OpenAI API key access remains separate:

- `OpenAI -> API` uses `OPENAI_API_KEY` or a key saved through the bridge's local secret store.
- The UI must clearly show that this mode uses API access, not ChatGPT subscription allowance.

Other provider API key access is also separate from ChatGPT subscription allowance:

- `Gemini` uses `GEMINI_API_KEY` and the Gemini `generateContent` REST endpoint.
- `Claude` uses `ANTHROPIC_API_KEY` and the Anthropic Messages API.
- `OpenRouter` uses `OPENROUTER_API_KEY` and the OpenRouter OpenAI-compatible API, including `:free` model variants and the `openrouter/free` router.

## Safety Requirements

- AE project mutations must continue through the validated AE Plan runner.
- Mutating Agent steps require explicit confirmation, mutation permission, idempotency, and post-mutation verification.
- Broad or multi-step mutations must use checkpoint/edit-session protection.
- The panel must not let ChatGPT/Codex CLI directly run arbitrary workspace edits or shell commands as part of AE chat. Use `--sandbox read-only` for CLI calls.
- `run_extendscript` and `run_extendscript_file` stay escape hatches, but planned workflows should prefer narrow bridge tools.
- Dev-request bundles are local handoffs for a separate Codex App development chat. They must be compact, redacted, ignored by git, and limited to targeted files and evidence.
- V1 must not imply that a Codex App chat was created automatically; dev escalation prepares the bundle and start prompt, then the user starts the Codex App dev chat manually from that prompt until a stable local chat-creation API exists.

## Non-Goals For V1

- No license or Pro activation gate.
- No attempt to decompile or copy AE GPT implementation details.
- No production dependency additions unless the decision is recorded in the execution plan.
- No direct use of ChatGPT web session cookies or undocumented APIs.
