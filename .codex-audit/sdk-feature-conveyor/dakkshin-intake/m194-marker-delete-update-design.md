# M194 Marker Delete/Update Design

Дата: 2026-05-24

## Цель

M194 фиксирует отдельный будущий gated-срез для редактирования и удаления layer markers после M193 marker evidence. Это только дизайн-контракт: runtime tools, planner exposure, semantic verification, CEP UI, live validation и OpenAI CLI planner acceptance не добавляются в этом milestone.

## Предлагаемая граница будущего среза

Будущий marker delete/update slice должен быть отдельным от `add_layer_marker` и должен начинаться с минимального набора явных операций:

- `update_layer_marker` для одного существующего маркера на явном `layerIndex`;
- `delete_layer_marker` для одного существующего маркера на явном `layerIndex`;
- target marker должен определяться явно через `markerIndex` или через строгий match по `time` плюс optional `comment` guard;
- update должен позволять только bounded поля маркера: `comment`, `time`, `duration`;
- delete должен возвращать before/after marker summaries and the deleted marker read-back;
- обе операции должны проходить обычные M100, idempotency, checkpoint/edit-session и post-mutation verification gates;
- semantic verification должна сверять read-back after state: update подтверждает новое значение, delete подтверждает отсутствие удалённого marker target и сохранность соседних markers.

## Safety gates

Будущий implementation slice должен fail-closed при неоднозначности:

- reject, если marker target не найден;
- reject, если `time` match находит больше одного маркера и нет `markerIndex`;
- reject, если `markerIndex` вне диапазона current marker summary;
- reject destructive bulk delete, clear-all-markers, selected-layer-only target, audio-derived marker generation, marker generation from beats, mask delete/invert/path editing, layer/project deletion, and arbitrary ExtendScript marker edits;
- require generated-only live validation approval before any live mutating acceptance lane.

## Out of scope for M194

M194 не реализует:

- `update_layer_marker` или `delete_layer_marker`;
- planner aliases, tool schema, bridge mutation code, semantic verification code, or local smoke assertions;
- bulk marker generation or deletion;
- audio import, audio amplitude scan, beat detection, or marker generation from audio;
- destructive layer/project operations;
- mask delete/invert/arbitrary path editing;
- CEP panel UI, dependency changes, live CEP/AE validation, OpenAI CLI planner acceptance, push или PR.

## Validation strategy

Acceptance для M194 документационная и non-live:

- UTF-8 plan/handoff update;
- `npm.cmd run check:rules`;
- `git diff --check`.

Будущий implementation milestone должен добавить touched JavaScript `node --check`, plan-repair coverage, semantic verification coverage, main bridge smoke exposure/M100 safety checks, AGENTS non-live suite, and a separately approved generated-only live lane if live acceptance is requested.
