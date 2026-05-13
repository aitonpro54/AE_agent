# AE Agent Handoff - 2026-05-13

This handoff is for starting a fresh Codex chat in:

`C:\Users\Ant\Documents\Codex\AE_agent`

Respond to the user in Russian. The user prefers direct execution after a short status/plan update.

## Current Goal

Build and harden the local After Effects panel app described in `specs/target-app.md`, following `plans/target-app-execplan.md`.

The latest discussion focused on voice input for the CEP chat composer. Three implementation milestones were completed, then live testing showed that the browser-native CEP Web Speech path is probably not a reliable solution in Adobe CEP/CEF. The user clarified that voice input should be an external transcription/input solution, not tied to the selected LLM model.

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

Latest commits:

```text
e5afa3c Add API fallback for CEP voice transcription
4b06bc9 Harden CEP voice input microphone access
573157e Add voice input to chat composer
7a82d91 Add new chat handoff
9793066 Remove run plan confirm and add working indicator
15b0335 Harden agent comp runtime bindings
6143a8f Add selected layer CTI alignment tool
fba9e6b Fix selected layer agent bindings
```

Before this handoff edit, `git status --short` was clean and the branch was ahead of origin by 6 commits.

## Completed Voice Milestones

### Commit `573157e` - Voice Input In Chat Composer

Changed:

- `cep-panel/index.html`
  - Added a compact microphone button beside Send.
  - Added `RU` / `EN` / `Auto` language selector, defaulting to `RU`.
- `cep-panel/panel.js`
  - Added Web Speech state for support detection, start/stop, interim/final transcript handling, disabled state while chat is in flight, `aria-pressed`, and `codexAeVoiceLanguage` persistence.
  - Inserted recognized text into `chatPrompt` without auto-send.
- `cep-panel/style.css`
  - Updated composer layout for `textarea + mic + send`.
  - Added CSS-only mic icon, no SVG/Unicode.
- `scripts/cep-panel-cdp-smoke.js`
  - Added `voice-input-smoke` with a mocked speech recognizer.
- `plans/target-app-execplan.md`
  - Added Milestone 33 notes and validation.

Installed CEP extension was updated with changed CEP files.

### Commit `4b06bc9` - CEP Microphone Permission Hardening

Root cause observed live:

- The mic button appeared and toggled, but no recognition events arrived.
- `getUserMedia({ audio:true })` failed in live CEP with `NotAllowedError`.

Changed:

- `cep-panel/CSXS/manifest.xml`
  - Added CEP CEF flags `--enable-media-stream` and `--enable-speech-input`.
- `cep-panel/panel.js`
  - Added microphone preflight.
  - Added clearer blocked/missing/busy microphone status.
  - Added no-activity timeout for sessions that start but receive no native speech events.
- `scripts/cep-panel-cdp-smoke.js`
  - Updated `voice-input-smoke` to mock `getUserMedia` as well as speech recognition.
- `plans/target-app-execplan.md`
  - Added Milestone 34 notes and validation.

Installed CEP extension was updated with changed files. AE restart was needed for manifest flags.

### Commit `e5afa3c` - OpenAI API Transcription Fallback

Root cause after AE restart:

- Microphone permission was no longer the primary blocker.
- Live CEP `webkitSpeechRecognition` failed with `network`.
- This strongly suggests the embedded CEF runtime cannot reliably access the Chrome/Google speech-recognition service even though the Web Speech object exists.

Changed:

- `mcp-server/bridge-daemon.js`
  - Added `/voice/status`.
  - Added `/voice/transcribe`.
  - Added multipart upload to OpenAI audio transcription, default model `gpt-4o-mini-transcribe`.
- `cep-panel/panel.js`
  - Added `MediaRecorder` fallback after Web Speech `network` errors.
  - Records a short clip, posts audio to the bridge, and inserts returned text into `chatPrompt`.
  - Requires saved `OpenAI -> API` key or `OPENAI_API_KEY`.
  - Keeps ChatGPT/Codex CLI separate from API-billed audio transcription.
- `scripts/voice-transcription-smoke.js`
  - Added fake OpenAI transcription smoke.
- `scripts/cep-panel-cdp-smoke.js`
  - Reset voice fallback preferences during smoke setup.
- `plans/target-app-execplan.md`
  - Added Milestone 35 notes and validation.

Installed CEP extension was updated with changed `panel.js`. The live bridge was restarted on `127.0.0.1:3456`, and `/voice/status` returned:

```text
provider: openai-api
configured: false
model: gpt-4o-mini-transcribe
```

The installed panel then reported that voice transcription needs an OpenAI API key, instead of silently failing.

## Current User Direction

The user explicitly clarified:

- Voice input should not depend on the currently selected LLM model.
- It should be an external/third-party transcription mechanism whose only job is to put dictated text into the chat textarea.
- We should clarify whether CEP can support this at all, and consider external apps or a separate helper.

Important response already given:

- Direct in-CEP Web Speech is likely a dead end for production reliability.
- CEP can expose `webkitSpeechRecognition` and can be configured for media capture, but embedded Chromium/CEF does not reliably provide Chrome's server-backed speech-recognition service. The live symptom was `network`.
- Best no-model-coupled path is external dictation that types/pastes into the focused CEP textarea.
- First thing to try manually: Windows Voice Typing with `Win+H` while the AE Agent chat textarea is focused.
- Better quality path: an external Windows dictation helper using local Whisper/faster-whisper/whisper.cpp, which records on a hotkey and pastes text into the active field.

Sources already checked:

- Adobe CEP Cookbook: CEF flags include `--enable-media-stream` and `--enable-speech-input`.
- MDN `SpeechRecognition`: limited availability, Chrome recognition can be server-based.
- CEF forum: `SpeechRecognition` can return `network`; CEF maintainer notes Google-API-key-backed features are not generally tested/supported in CEF.
- Microsoft Support: Windows Voice Typing via `Win+H`, supports dictation into text fields.
- External dictation candidates discovered for later comparison: Voiceasy, HeyDict, Dit, OmniVox, Spokenly.

## Important Current Behavior

- The CEP composer now has mic UI and language selector.
- Mocked `voice-input-smoke` passes.
- Live native CEP Web Speech fails with `network` in the installed Adobe CEP panel.
- API transcription fallback exists in code, but the user does not want the product direction to depend on an LLM/provider model. Treat that fallback as an experiment or optional capability, not the preferred architecture.
- Backend/API contracts for normal chat/Agent providers remain intact.
- OpenAI CLI and OpenAI API access are still separate:
  - `OpenAI -> CLI` is ChatGPT/Codex subscription access.
  - `OpenAI -> API` is API billing and is currently what the transcription fallback would need.

## Validation Already Run For Voice Work

Local checks:

```powershell
node --check cep-panel\panel.js
node --check mcp-server\bridge-daemon.js
node --check scripts\cep-panel-cdp-smoke.js
node --check scripts\voice-transcription-smoke.js
node scripts\voice-transcription-smoke.js
git diff --check
node scripts\provider-contract-smoke.js
node scripts\provider-api-smoke.js
node scripts\prompt-optimization-smoke.js
node scripts\bridge-only-smoke-test.js
node scripts\smoke-test.js
```

Live / installed CEP checks:

```powershell
node scripts\cep-panel-cdp-smoke.js reload
node scripts\cep-panel-cdp-smoke.js voice-input-smoke
node scripts\cep-panel-cdp-smoke.js smoke
```

Live environment notes:

- CEP runtime: AdobeCEP/12.0.1, Chrome 99.
- Installed extension path: `C:\Users\Ant\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge`
- Live panel URL: `file:///C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.codex.aemcpbridge/index.html`
- Bridge URL/token: `http://127.0.0.1:3456`, token `codex-ae-local`.
- Live bridge was running after the final voice fallback work.

## Recommended Next Steps In New Chat

1. Run `git status --short` and confirm whether this handoff edit is committed.
2. Decide what to do with commit `e5afa3c`:
   - keep it as optional API fallback;
   - hide/disable it from UI;
   - or revert/remove it if the user wants no API transcription path.
3. Test Windows Voice Typing manually:
   - focus the AE Agent chat textarea;
   - press `Win+H`;
   - dictate Russian text;
   - confirm whether text appears in the CEP textarea.
4. If Windows Voice Typing works well enough, prefer documenting that workflow and simplify the CEP mic behavior.
5. If higher quality is needed, plan a separate external helper:
   - Windows tray app or hotkey process;
   - record audio outside CEP;
   - transcribe with local Whisper/faster-whisper/whisper.cpp or a user-chosen cloud dictation app;
   - paste text into the active CEP textarea;
   - no dependency on the selected chat model.
6. If touching CEP UI, copy only changed files into the installed CEP extension and run `node scripts\cep-panel-cdp-smoke.js reload` plus relevant smokes.

## Suggested Opening Prompt For New Chat

```text
Continue AE Agent in Russian. Read:
C:\Users\Ant\Documents\Codex\AE_agent\AGENTS.md
C:\Users\Ant\Documents\Codex\AE_agent\specs\target-app.md
C:\Users\Ant\Documents\Codex\AE_agent\plans\target-app-execplan.md
C:\Users\Ant\Documents\Codex\AE_agent\docs\2026-05-13-new-chat-handoff.md

Do not restart from scratch. First check git status. The latest issue is voice input: CEP Web Speech fails live with a network error, and the preferred product direction is external dictation/transcription that inserts text into the chat box without depending on the selected LLM model.
```
