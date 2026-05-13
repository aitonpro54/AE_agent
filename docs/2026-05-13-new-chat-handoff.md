# AE Agent Handoff - 2026-05-13

This handoff is for starting a fresh Codex chat in:

`C:\Users\Ant\Documents\Codex\AE_agent`

Respond to the user in Russian. The user prefers direct execution after a short status/plan update.

## Current Goal

Build and harden the local After Effects panel app described in `specs/target-app.md`, following `plans/target-app-execplan.md`.

The latest product decision is that speech-to-text is handled by a third-party/external dictation tool. AE Agent should not contain its own microphone button, browser speech-recognition flow, MediaRecorder fallback, or provider-billed transcription endpoint.

## Required Reading In New Chat

Before coding, read:

- `AGENTS.md`
- `specs/target-app.md`
- `plans/target-app-execplan.md`
- this handoff

Relevant skills:

- `cep-panel-controls` when touching the CEP composer/UI.
- `ae-mcp-bridge-workflow` when restarting or validating the local bridge/panel.
- `ae-safe-project-automation` when mutating live AE projects.
- `openai-docs` only if the user asks for current OpenAI API/product details.

## Git State At Handoff

Branch:

`codex-v0.26-agent-ux-polish`

Recent project movement commit:

```text
883ed1f Update project relocation paths
```

## Voice Input Decision

The previously built in-panel voice experiments were removed from the product path:

- CEP composer no longer has a microphone button or language selector.
- `cep-panel/panel.js` no longer contains Web Speech, microphone permission, MediaRecorder, or audio transcription fallback logic.
- The bridge no longer exposes `/voice/status` or `/voice/transcribe`.
- `scripts/voice-transcription-smoke.js` and the mocked `voice-input-smoke` live test were removed.
- CEP manifest media/speech flags were removed because the panel no longer captures audio.

External dictation can still type or paste into the focused `chatPrompt` textarea. This keeps speech input independent from the selected AI provider and from OpenAI API billing.

## Current Behavior

- Chat and Agent modes remain provider-backed through the bridge.
- OpenAI CLI and OpenAI API access remain separate:
  - `OpenAI -> CLI` is ChatGPT/Codex subscription access.
  - `OpenAI -> API` is normal API billing for provider calls.
- The composer now has only the prompt textarea and the `>` send button in the prompt row.

## Validation To Prefer

For this removal milestone, run:

```powershell
node --check cep-panel\panel.js
node --check mcp-server\bridge-daemon.js
node --check scripts\cep-panel-cdp-smoke.js
git diff --check
node scripts\provider-contract-smoke.js
node scripts\provider-api-smoke.js
node scripts\prompt-optimization-smoke.js
node scripts\bridge-only-smoke-test.js
node scripts\smoke-test.js
```

If the installed AE CEP panel is available, copy changed CEP files only and run:

```powershell
node scripts\cep-panel-cdp-smoke.js reload
node scripts\cep-panel-cdp-smoke.js smoke
```

Installed extension path:

`C:\Users\Ant\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge`

## Suggested Opening Prompt For New Chat

```text
Continue AE Agent in Russian. Read:
C:\Users\Ant\Documents\Codex\AE_agent\AGENTS.md
C:\Users\Ant\Documents\Codex\AE_agent\specs\target-app.md
C:\Users\Ant\Documents\Codex\AE_agent\plans\target-app-execplan.md
C:\Users\Ant\Documents\Codex\AE_agent\docs\2026-05-13-new-chat-handoff.md

Do not restart from scratch. First check git status. Built-in CEP voice input has been removed; external dictation is expected to type into the focused chat textarea.
```
