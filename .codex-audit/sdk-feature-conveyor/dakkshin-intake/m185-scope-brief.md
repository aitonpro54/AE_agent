# M185 Dakkshin Intake Scope Brief

Дата: 2026-05-23

## Цель

Зафиксировать минимальный intake для будущей работы с Dakkshin-направлением без реализации продуктовых фич AE Agent. Этот milestone отвечает только на вопрос: что уже известно, какие ограничения нельзя нарушать, и какие вопросы нужно закрыть до разработки.

## Источники в репозитории

- `docs/ready-solutions-research.md`
- `docs/daemon-split-handoff.md`
- `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json`
- `plans/target-app-execplan.md`

В этом milestone не выполнялся новый внешний аудит `Dakkshin/after-effects-mcp`, не запускались external-provider/OpenAI CLI planner проверки и не выполнялась live CEP/AE validation.

## Что уже известно про Dakkshin-направление

- В старом research note `Dakkshin/after-effects-mcp` рассматривается как один из существующих After Effects MCP bridge проектов.
- Зафиксированная архитектурная идея: file-based bridge с командным JSON-файлом и result JSON-файлом, похожими на `ae_command.json` и `ae_mcp_result.json`.
- Полезные идеи из research:
  - разделять постановку долгой команды и чтение результата;
  - обнаруживать stale results по времени изменения result file, около 30 секунд в заметке;
  - использовать стабильный shared bridge directory, например `~/Documents/ae-mcp-bridge`;
  - рассмотреть более широкий tool catalog: comp/layer/keyframe/expression/mask/effect/preset/audio-marker/help workflows.
- Уже принятое направление AE Agent: не переходить полностью на file bridge, а сохранять persistent bridge daemon, HTTP queue, command IDs, retained results, logs, checkpoints, and CEP panel status.

## Жёсткие границы перед реализацией

- Не копировать Dakkshin code or scripts без отдельного review.
- Не заменять текущий daemon/CEP bridge на file bridge.
- Не включать CEP-panel SDK writes.
- Не запускать live CEP/AE validation без отдельной явной просьбы.
- Не запускать external-provider/OpenAI CLI planner validation.
- Не устанавливать packages и не менять dependencies.
- Не добавлять raw ExtendScript workflow как основной путь.
- Не обходить M100/checkpoint/idempotency/post-verification gates для mutating operations.
- Не делать push или PR без отдельной просьбы.

## Возможные future work lanes

1. Reliability/durability lane:
   - stale-result detection;
   - retained result snapshots;
   - long-running operation polling semantics;
   - clearer timeout/error evidence in bridge logs.

2. Typed tool gap lane:
   - compare existing AE Agent typed tools against the Dakkshin-inspired catalog;
   - separate read-only discovery tools from mutating tools;
   - require M100 safety fields for any mutation.

3. Help/prompt lane:
   - local help prompts for common AE tasks;
   - bridge-owned prompt templates that produce validated MCP plans instead of raw JSX.

4. File-bridge compatibility lane:
   - consider optional import/read support for file-bridge style evidence;
   - avoid making file bridge the primary runtime path unless a later architecture review proves the need.

## Questions before implementation

- What exact Dakkshin outcome does the user want: feature parity study, one reliability idea, one typed tool group, or migration compatibility?
- Should the next step use a fresh external source audit of `Dakkshin/after-effects-mcp`, or only the existing repo notes?
- Which user workflow should benefit first: long-running command reliability, tool catalog expansion, help prompts, or bridge diagnostics?
- What validation is acceptable for the first implementation slice if live AE/CEP is unavailable?
- Which files may be touched in the first implementation slice, and should CEP panel changes stay completely out of SDK/CLI execution?

## Recommended next step

Run M186 as a local-only tool gap map. It should compare the known Dakkshin-inspired ideas against current AE Agent typed tools and propose the smallest safe implementation slice. It should still avoid product implementation until a reviewed slice plan exists.

## Execution note

This M185 intake brief was completed manually in the parent Codex turn after user approval. The M184 child runner remains fail-closed for queued AI execution until a separate queue-state update is made; no child SDK/CLI workspace-write turn was run in this milestone.
