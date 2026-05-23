# Safe Effect Addition Typed Plan

## Goal

Добавить эффект на явно выбранный слой или слой с явным индексом, затем проверить установленный эффект через typed read-back.

## Applies When

- Пользователь просит добавить эффект к выбранному или конкретному слою.
- Нужен matchName-safe путь вместо выбора эффекта только по display name.
- Пользователь хочет после добавления увидеть свойства эффекта перед дальнейшей настройкой.

## Plan Pattern

1. Run `get_active_comp` and `get_selected_layers` to confirm the target comp and layer.
2. Run `list_effect_presets` or `list_effects` when the requested effect matchName is not already explicit.
3. Run `add_effect` with the chosen matchName and the verified layer target.
4. Run `get_effect_details` with `includeProperties:true` to confirm the effect instance and inspect safe property names.
5. Run `set_effect_property` only as a later explicit step after `get_effect_details` identifies the exact property target.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not use raw ExtendScript or arbitrary display-name execution for this workflow.

## Verification

- The read-back step reports the added effect on the expected layer.
- If a property is changed, `get_effect_details` evidence identifies the property before mutation and after mutation.
- The plan avoids adding effects to unverified layer targets.
