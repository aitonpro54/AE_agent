# Target Application

## Goal

Build this repository into a local After Effects AI panel that combines the current Codex AE MCP Bridge safety model with an AE GPT-style user experience.

The panel remains a client of the local bridge daemon. The daemon remains the owner of provider access, chat calls, AE plan validation, execution gates, logs, checkpoints, and edit-session protection.

## Product Shape

- The first screen is a compact dark CEP panel inspired by the references in `specs/screenshots/`.
- The left side exposes provider setup: `Gemini`, `OpenAI`, `Claude`, and `Local`.
- `OpenAI` supports two auth modes:
  - `API`: uses an OpenAI API key and normal API billing.
  - `CLI`: uses the installed Codex CLI after the user has signed in with ChatGPT through the panel's sign-in action or `codex login`.
- `Local` detects Ollama on `127.0.0.1:11434`, lists installed models, and does not require an API key.
- `Gemini` and `Claude` may ship as disabled or setup-needed placeholders until provider implementations are added.
- The chat area supports `Chat` and `Agent` modes, a model selector, prompt input, chat history, and a visible Prompt Optimization toggle.
- Agent mode shows planned steps with success/error/ready states and concrete backend results.

## ChatGPT Subscription Model Access

ChatGPT subscription access must not be represented as a normal OpenAI API key. The target behavior is:

- `OpenAI -> CLI` is the ChatGPT/Codex subscription path.
- The bridge checks whether `codex` is installed and whether CLI auth appears usable.
- The bridge runs subscription-backed requests through `codex exec --ephemeral --json --sandbox read-only --model <model> <prompt>`.
- The bridge parses the final assistant message from the JSONL stream and normalizes it into the existing agent result shape.
- If CLI auth is missing, the UI offers a `Sign in with ChatGPT` action that launches the local Codex CLI login flow. Manual `codex login` remains a fallback.

OpenAI API key access remains separate:

- `OpenAI -> API` uses `OPENAI_API_KEY` or a key saved through the bridge's local secret store.
- The UI must clearly show that this mode uses API access, not ChatGPT subscription allowance.

## Safety Requirements

- AE project mutations must continue through the validated AE Plan runner.
- Mutating Agent steps require explicit confirmation, mutation permission, idempotency, and post-mutation verification.
- Broad or multi-step mutations must use checkpoint/edit-session protection.
- The panel must not let ChatGPT/Codex CLI directly run arbitrary workspace edits or shell commands as part of AE chat. Use `--sandbox read-only` for CLI calls.
- `run_extendscript` and `run_extendscript_file` stay escape hatches, but planned workflows should prefer narrow bridge tools.

## Non-Goals For V1

- No license or Pro activation gate.
- No attempt to decompile or copy AE GPT implementation details.
- No production dependency additions unless the decision is recorded in the execution plan.
- No direct use of ChatGPT web session cookies or undocumented APIs.
