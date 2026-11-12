# Контексты отдельных source-проверок

Архитектурное решение и независимое read-only review: допускается явный
`per-check-contexts` для приёмки C. Это не автоматический fallback строгого join
и не доказательство одинакового окружения всех запусков.

Два диагностических capture обнаружили разные значения только CODEX_TOOL_CALL_ID
при одинаковых hashes остальных 77 значений. Для initial main сохранён только
общий environment hash; возможные другие отличия окружения восстановить нельзя.
Raw environment, старый ToolCallID и initial result не переписывались.

Новый режим требует одинаковых Node version/executable/binary SHA, platform,
arch, hostname и OS release; единственное допускаемое различие — собственный
opaque environmentSHA256 каждой проверки. Схема восьми runtime fields закрыта.
Каждый выбранный PASS связан с его полным runtime, result SHA и batch identity;
контекст verifier сохраняется отдельно. Все gates source union, current key,
command/cwd, before/after bindings, raw-log hashes/counts/exit и immutable inputs
сохранены. Неизвестная policy отклоняется.

Успех обозначается только MULTI_CONTEXT_SELECTED_PASS, sameEnvironment=false,
environmentEquivalence=unproven, releaseCertified=false. Этот итог относится
к актуальным выбранным source checks, не единому запуску, full release или
native acceptance. Strict join остаётся отдельным неизменённым режимом.

Reviewed utility SHA:
8335dceced64f9305f01fc6106f11282fa6ccd441ad966b86437495397c835a2.
Прежние 12 synthetic cases, новые context cases и node --check PASS.
При принятии policy фактический join ещё не исполнялся.

Для incremental reuse отдельно принят и reviewed prior-subset-of-current.
Исходные 37/42/43 paths сохраняются в каждом proof; current union43 проверяется
полностью. Допускается только canonical подмножество current Core paths,
конфигурация и исходная selection остаются pinned. Старый key не становится
current из-за отношения scopes; stale key или missing PASS остаётся gap.
Полнота прежнего diff base отдельно не заявляется. Фактический scope verifier
edb6b8b997050e4020316845e25c823cadb17f244ed05275f4d249146a4dfa49
принял 82/82 current checks, 72 batches, 1338/1338 records без skip/cancel/fail.
Все 11 исходных failed/UNKNOWN attempts сохранены. Этот итог не меняет
ограничения относительно окружений, full release или native acceptance.
