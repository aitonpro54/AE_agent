# M198 Live Validation Rule And Marker Lifecycle Lane

Дата: 2026-05-24

## Цель

M198 делает live CEP/AE validation and OpenAI CLI planner acceptance постоянным правилом для доступной live-среды и добавляет generated-only marker lifecycle lane для M193-M196 marker tools.

## Граница среза

- `AGENTS.md` теперь требует live CEP/AE validation whenever After Effects, installed AE Agent panel, and bridge are available.
- Для planner-visible or mutating tool changes требуется relevant generated-only Full UI Agent `openai-cli` planner acceptance lane; если lane ещё нет, её нужно создать узко и fail-closed.
- Добавлен `full-ui-agent-marker-lifecycle-openai-cli-smoke` для CEP/CDP validation через installed panel, Agent UI, `openai-cli`, `gpt-5.5`, dry run, protected run, marker read-back, and cleanup.
- Добавлен feature conveyor item `m198-marker-lifecycle-live-validation` with exact approval text and deterministic/Ollama/OpenRouter fallback rejection.

## Safety boundary

M198 validation lane работает только с generated-only assets and generated prefixes. Она не разрешает:

- user asset mutation outside generated cleanup;
- bulk marker operations;
- audio-derived marker generation;
- destructive layer/project operations;
- mask delete/invert/arbitrary path editing;
- package/dependency changes, push, or PR.

## Validation strategy

Local validation:

- touched JavaScript `node --check`;
- feature conveyor readiness/command smokes;
- M198 live dry-run command;
- `npm.cmd run check:rules`;
- `git diff --check`.

Live validation after a clean commit:

- sync installed CEP panel if needed;
- ensure current bridge/CEP exposes the new marker tools;
- run M198 feature conveyor live validation with exact approval text.
