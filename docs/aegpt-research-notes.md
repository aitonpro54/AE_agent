# AE GPT Research Notes

Date: 2026-05-12

Purpose: capture observable AE GPT behavior for product research without
copying or decompiling the closed implementation.

## Access Method

- Installed AE GPT exposes a CEP debug target at the live cache:
  `C:\Users\Ant\AppData\Local\Temp\cep_cache\AEFT_26.2_com.suza.aegpt.main`.
- The active page is:
  `file:///C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.suza.aegpt/main/index.html`.
- Reusable helper:
  `node scripts\aegpt-cdp.js inspect`
- Send a prompt:
  `$env:AEGPT_MODE='chat'; $env:AEGPT_PROVIDER='Local'; $env:AEGPT_PROMPT='...'; node scripts\aegpt-cdp.js send`

## Observed UI

- Provider tabs: Gemini, OpenAI, Claude, Local.
- Gemini default UI showed “Gemini 3.0 Flash (No API key)” and related models.
- Local tab detected Ollama on port `11434` and listed `translategemma:4b`.
- Input mode is a pill toggle, not two buttons:
  - `.message-input` for Chat.
  - `.message-input.agent-mode` for Agent.
- Agent mode has a Prompt Optimization toggle.
- Chat history stores named sessions with message counts.

## Test Results

- Empty unsaved AE project was used. A generated sandbox comp was created:
  `Codex AE GPT Research Sandbox`, 1280x720, 6 seconds, 30 fps.
- Gemini chat failed despite “No API key” model label:
  `Sorry, I encountered an error: Gemini API key not set`.
- Local/Ollama chat worked with `translategemma:4b` and returned a normal text answer.
- Local/Ollama Agent mode partially worked:
  - UI showed a four-step plan.
  - Two steps succeeded and two needed review.
  - Actual AE result created two text layers despite the prompt asking for exactly one.
  - Both layers were named `AE GPT Agent Test Text` and had text `AE GPT TEST`.
  - One duplicate layer had unusual scale `[1, 1, 100]`.

## Product Takeaways

- Good ideas to borrow:
  - Provider tabs with clear Local/Ollama detection.
  - Chat history with readable session summaries.
  - Visible Chat/Agent mode switch.
  - Agent step list with success/error states.
  - Prompt optimization as an explicit toggle.
- Improvements for our bridge:
  - Treat “No API key” labels carefully; provider readiness should be verified before send.
  - Agent mode needs operation-level idempotency to avoid duplicate mutations.
  - Each step should expose concrete tool calls/results, not only human-readable step labels.
  - Final agent status should compare intended changes against actual AE state.
  - Our checkpoint/edit-session layer remains a strong differentiator.

## Converted Into Product Work

- `v0.19.0-agent-rails` converts the main test findings into bridge behavior:
  provider readiness checks, AI chat JSONL logging, idempotency keys for
  mutating tools, and post-mutation AE verification with duplicate layer-name
  warnings.
