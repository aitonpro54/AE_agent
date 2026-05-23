# M193 Layer Marker Evidence Design

Дата: 2026-05-24

## Цель

M193 закрывает узкий Dakkshin-inspired audio-adjacent gap без аудио-анализа: существующий `add_layer_marker` получает явный read-back evidence path через marker summary в `get_layer_details`, semantic verification и локальные smoke checks.

## Граница среза

Срез намеренно ограничен:

- `add_layer_marker` остается typed mutating tool для одного маркера на явном `layerIndex`;
- план должен иметь явные `time`/`comment` evidence или использовать текущее время композиции как bridge-owned default;
- response возвращает созданный marker и компактный список маркеров слоя;
- `get_layer_details` возвращает marker count/list для read-back;
- semantic verification сверяет marker comment/time/duration с последующим read-back.

Этот срез не реализует:

- audio import, audio amplitude scan, beat detection или marker generation from audio;
- bulk marker generation;
- marker delete/update;
- destructive layer/project operations;
- mask delete/invert/arbitrary path editing;
- CEP panel UI, dependency changes, live CEP/AE validation, OpenAI CLI planner acceptance, push или PR.

## Validation strategy

Acceptance для M193 локальная и non-live:

- touched JavaScript `node --check`;
- plan repair alias/arg coverage for layer marker plans;
- semantic verification coverage for marker read-back;
- main bridge smoke exposure, queued command, and M100 safety schema coverage;
- AGENTS non-live suite.

Live CEP/AE mutating validation and OpenAI CLI planner acceptance are deliberately not rerun unless the user explicitly asks for a separate generated-only live lane.
