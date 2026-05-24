# M195 Update Layer Marker Design

Дата: 2026-05-24

## Цель

M195 реализует первый non-live implementation slice из M194: `update_layer_marker` обновляет один существующий layer marker через явный target and read-back evidence.

## Граница среза

`update_layer_marker` намеренно узкий:

- требует явный `layerIndex`;
- target marker задаётся через `markerIndex` или через строгий `targetTime`;
- `targetComment` может использоваться как guard для существующего marker;
- изменяемые поля ограничены `comment`, `time`, `duration`;
- response возвращает `markerBefore`, updated `marker`, and compact `markers` summary after the mutation;
- semantic verification сверяет updated marker against post-run `get_layer_details` read-back.

Этот срез не реализует:

- marker delete;
- clear-all marker deletion or bulk marker updates;
- audio import, beat detection, or marker generation from audio;
- layer/project deletion;
- mask delete/invert/arbitrary path editing;
- CEP panel UI, dependency changes, live CEP/AE validation, OpenAI CLI planner acceptance, push или PR.

## Validation strategy

Acceptance для M195 локальная и non-live:

- touched JavaScript `node --check`;
- plan repair aliases for marker update plans;
- semantic verification coverage for updated marker read-back;
- main bridge smoke exposure, queued command, and M100 safety schema coverage;
- AGENTS non-live suite.

Live CEP/AE mutating validation and OpenAI CLI planner acceptance are deliberately not rerun unless the user explicitly asks for a separate generated-only live lane.
