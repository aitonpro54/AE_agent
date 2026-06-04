# Selected Layers Animation Typed Plan

## Goal

Анимировать выбранные слои через typed transform/property keyframe tools с read-back verification.

## Applies When

- Пользователь просит сделать простую анимацию выбранных слоёв: position, scale, rotation or opacity.
- Активная композиция и выбранные слои должны быть подтверждены перед мутацией.
- Задача не требует масок, аудио-анализа, удаления слоёв или широкого comp rewrite.

## Plan Pattern

1. Run `get_active_comp` and `get_selected_layers` to identify selected layer indices and current time context.
2. Use `set_property_keyframes` for animated properties such as opacity, position, scale or rotation.
3. Use `apply_keyframe_ease` only after keyframes are created and the target property is known.
4. Use `set_layer_transform` for a single static transform adjustment when keyframes are not required.
5. Run `get_selected_layers` or `list_layers` after mutation to read back timing and transform evidence.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not include masks, destructive layer operations, audio marker generation or raw ExtendScript in this recipe.

## Verification

- Read-back reports the affected selected layers after keyframe or transform updates.
- The plan targets explicit selected layer indices or verified active-comp selection.
- The mutation uses only typed property/transform tools and no raw ExtendScript.
