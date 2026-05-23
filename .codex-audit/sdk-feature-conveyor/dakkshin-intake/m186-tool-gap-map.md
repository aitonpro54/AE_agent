# M186 Dakkshin Intake Tool Gap Map

Дата: 2026-05-23

## Цель

Сопоставить известные Dakkshin-inspired потребности из M185 с текущим typed bridge catalog AE Agent и зафиксировать самые маленькие безопасные будущие implementation slices. Этот artifact не реализует продуктовое поведение и не добавляет bridge tools.

## Использованные источники

- `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m185-scope-brief.md`
- `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json`
- `docs/ready-solutions-research.md`
- `docs/daemon-split-handoff.md`
- `mcp-server/bridge-daemon.js` только как read-only evidence текущего tool catalog
- `plans/target-app-execplan.md`

Внешний аудит `Dakkshin/after-effects-mcp`, live CEP/AE validation, external-provider/OpenAI CLI planner validation и mutating-live validation не запускались.

## Execution boundary note

`.codex/handoff.md` входит в planned path allowlist, но в этом turn запись в него заблокирована средой: `apply_patch` отклоняет этот ignored path как запись вне проекта, а PowerShell `Set-Content -Encoding UTF8 -Force .codex/handoff.md` возвращает `UnauthorizedAccessException`. Поэтому handoff blocker дополнительно зафиксирован в этом artifact и в `plans/target-app-execplan.md`.

Локальный milestone commit также заблокирован средой: `git add`/`git commit` не смогли создать `.git/index.lock` из-за `Permission denied`. Изменения оставлены unstaged в рабочем дереве.

## Текущий typed bridge coverage

Текущий каталог уже покрывает значительную часть Dakkshin-inspired "rich tool catalog" без перехода на file bridge:

| Need group | Existing AE Agent coverage | Статус |
| --- | --- | --- |
| Bridge status/log evidence | `get_bridge_status`, `get_command_log`, `get_ai_agent_log`, `get_project_snapshot` | Covered для диагностики daemon/queue/status. |
| Project and comp discovery | `get_project_info`, `find_project_items`, `list_project_folder_items`, `list_comps`, `find_comps`, `get_comp_details` | Covered. |
| Composition creation/organization | `create_comp`, `create_project_folder`, `move_project_items_to_folder`, `duplicate_comp` | Mostly covered; comp update is intentionally narrower than creation. |
| Layer discovery/read-back | `list_layers`, `get_layer_details`, `get_active_comp`, `get_selected_layers`, `get_selected_properties` | Covered. |
| Common layer creation | `create_text_layer`, `create_solid_layer`, `create_null_layer`, `create_adjustment_layer`, `create_shape_layer`, `add_project_item_to_comp`, `import_footage` | Mostly covered; camera layer creation remains a gap. |
| Source/precomp workflows | `precompose_layers`, `replace_layer_source`, `deep_duplicate_precomp_sources`, `rename_layers`, `rename_project_items` | Covered for current safe precomp/source workflows. |
| Timing and edit operations | `align_layers_to_time`, `set_comp_work_area`, `set_layer_time_range`, `stagger_layers`, `split_layers_at_time` | Covered for common timeline operations. |
| Transform and property mutation | `set_layer_transform`, `set_property_value`, `set_property_keyframes`, `apply_keyframe_ease` | Covered for many property/keyframe cases, but requires careful read-back targeting. |
| Expressions | `set_expression`, `clear_expression`, `apply_transform_expression` | Covered as typed mutation, still requires validation/read-back. |
| Effects and presets | `list_effect_presets`, `list_effects`, `get_effect_details`, `add_effect`, `set_effect_property` | Covered for curated discovery plus matchName/display-name application. |
| Markers/audio-adjacent workflow | `add_layer_marker` | Partial: layer markers exist; audio analysis/marker generation is not covered. |
| Render queue | `add_comp_to_render_queue`, `set_render_queue_output`, `get_render_queue_status` | Covered for basic render queue setup/status. |
| Raw escape hatch | `run_extendscript`, `run_extendscript_file` | Exists, but should remain fallback only after typed tools fail to fit. |

## Advisory/RAG vs mutating AE tool needs

### Advisory/RAG needs

These should stay advisory and bridge-owned; they do not justify a new mutating AE tool by themselves.

- Help prompts such as "analyze/create composition" should become local prompt templates or solution-library entries that produce validated MCP plans, not direct raw JSX.
- Dakkshin file-bridge notes about `ae_command.json` and `ae_mcp_result.json` are reliability evidence. They can inform logs/result retention, but should not replace the daemon HTTP queue.
- Effect/preset guidance should prefer curated matchName hints plus read-back with `get_effect_details`.
- Common workflow recipes should enter the solution/promotion path only after evidence proves typed tool coverage or a specific missing typed capability.

### Mutating AE tool needs

These require normal AE Agent safety gates before implementation.

- Camera layer creation: plausible typed gap because Dakkshin catalog includes camera layers and current create-layer coverage has text/solid/null/adjustment/shape/project-item, but no camera-specific tool.
- Mask creation/update: read-back exposes masks through `get_layer_details`, but there is no narrow typed mask mutation tool. This needs careful geometry schema, target layer verification, and semantic read-back.
- Layer duplicate/delete: `duplicate_comp` and source/precomp duplication exist, but generic layer duplicate/delete tools are not present. These are higher risk because delete is destructive and duplicate must preserve target selection semantics.
- Audio-marker workflows: `add_layer_marker` exists, but no typed audio analysis or marker generation from audio evidence exists. This is likely a later workflow slice, not a first mutation.
- Composition update: `create_comp` exists, but broad comp settings mutation is not a single safe current tool. If needed, it should start with one narrow field group, not a generic update-anything tool.

## Smallest safe later slices

1. **Advisory help/prompt slice**
   - Add local prompt/solution entries for "inspect comp", "create basic comp", "add effect safely", and "animate selected layers".
   - Output must be validated MCP plans using existing typed tools.
   - No bridge mutation contract change required.

2. **Camera layer typed tool slice**
   - Add one narrow mutating bridge tool for `create_camera_layer`.
   - Required safety: explicit comp target or active comp, generated/default name, position/point-of-interest/schema bounds, M100 mutation gate, checkpoint/idempotency where applicable, `get_layer_details` read-back.
   - Avoid bundling lights, 3D scene setup, or camera rig creation into the same slice.

3. **Mask read/write slice**
   - Start with a read/verify improvement if current `get_layer_details` mask summary is insufficient.
   - Mutating follow-up should be one tool such as `create_layer_mask` with explicit target layer and shape schema.
   - Do not include arbitrary mask path editing, roto workflows, or destructive mask deletion in the first slice.

4. **Reliability evidence slice**
   - Add stale-result/retained-result reporting only if current command log evidence is insufficient for long-running operations.
   - Keep the persistent daemon and HTTP queue as primary runtime.
   - Treat file-bridge compatibility as import/read evidence, not as the execution path.

## Deferred or unsafe for first implementation

- Replacing the daemon/CEP bridge with a Dakkshin-style file bridge.
- Generic `run-script`/`get-results` UX as the primary execution model.
- Broad layer delete or project-item delete tools without separate destructive-operation design.
- Arbitrary effect/preset execution by display text without matchName/read-back constraints.
- Audio analysis, beat detection, and marker generation without a clear local evidence source and validation strategy.
- CEP-panel SDK writes, live CEP/AE validation, external-provider/OpenAI CLI planner validation, package/dependency changes, push, and PR.

## Recommendation

The next reviewable item should remain an implementation-slice plan, not product code. The safest first product slice is either advisory help/prompt entries backed by existing tools, or a single camera-layer creation typed tool if the user wants visible AE capability expansion. Mask and destructive layer operations should wait until target schemas and semantic verification expectations are explicit.
