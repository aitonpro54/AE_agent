# Ограниченный offline benchmark оптимизации

`npm.cmd run benchmark:optimization-fixtures` запускает фиксированные
синтетические входы существующих placeholder builder/read-back/evidence,
выбора кадров и пассивных AME функций. Никакой AE/AME job, provider или модель
не вызываются. JSON-вывод содержит фактические размеры сериализованных
результатов в UTF-8 байтах и диагностическую длительность одного прогона.

Проверенные кейсы 28 сентября 2026 на текущем checkout:

| Кейс | Планы/шаги | Кадры | Plan bytes | Full/compact evidence bytes | Результат |
|---|---:|---:|---:|---:|---|
| Три плейсхолдера | 3/9 | 9 | 4248 | 968/950 | 3 synthetic read-back pass |
| Nested offset | 1/3 | 3 | 1418 | 323/317 | 1 synthetic read-back pass |
| Split 50/50 | 2/6 | 6 | 2837 | 647/635 | 2 synthetic read-back pass |
| AME passive + metadata | — | — | 1283 output bytes | — | `output_growing`, `needs_media_probe`; completion false |

Compact evidence уменьшает именно эти небольшие fixture JSON; эти байты не
равны доставленным модели токенам. AME media validator принял синтетические
metadata и фиктивный decode status, поэтому `technicalMediaVerified` в
benchmark остаётся false. Отдельный `smoke:ame-media` проверяет реальный
синтетический MP4 через ffprobe/ffmpeg, если бинарники доступны; это тоже не
доказательство реального AME render. Ни один synthetic read-back не является
свежим ответом AE.

Для данного fixture runner наблюдалось 0 model calls; input/cached/output
tokens оставлены `null`, потому что runner не имеет model meter. Процент
экономии токенов и подписки тоже `null`: нет сопоставимого A/B с одинаковыми
критериями результата, cache, retries и проверенным usage. Длительность
одного локального прогона не используется для оценки ускорения.
