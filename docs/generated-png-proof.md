# Проверка PNG и независимого read-back

Для `save_comp_frame_png` bridge ожидает завершённый PNG в своей папке generated-exports: сигнатуру, IHDR, безопасные границы чанков, IDAT и конечный IEND без лишних байтов. Проверяются размер файла и стабильность его идентичности, размера и времени изменения вокруг чтения. Хеш, число байтов и размеры изображения вычисляются из одного принятого буфера. Ожидание ограничено; неполный файл сохраняется для диагностики, операция не повторяется автоматически.

Это доказательство завершения записи, а не декодирование изображения или художественная приёмка. CRC и визуальное качество проверка не устанавливает. Предельный размер — 64 MiB; новые зависимости не требуются. Повтор выдачи сохранённого результата с новым признаком `pngComplete` проверяет текущий файл без повторного экспорта AE. Исторические результаты без этого признака не повышаются до нового доказательства.

План, состоящий только из успешно завершённых PNG-экспортов, может пройти semantic verification с `readBackCount:0` и scope `generated_png_file_proof_only`. Обязательны согласованные target/path/hash/bytes/dimensions, сохранённый файл, фактически применённая и восстановленная resolutionFactor. Bridge передаёт собственную настроенную папку экспорта. Смешанные планы, ошибки и неполные доказательства этим исключением не принимаются; `acceptance` остаётся `not_established`.

Для transform допускается ровно одно серверное прикреплённое чтение и одно явное чтение той же стабильной цели в пределах текущей операции. Оба должны подтвердить запрошенные конечные значения. Конфликт, лишнее, неуспешное или malformed чтение требует проверки; индексы не заменяют постоянные ID.

Offline-проверки: `npm.cmd run smoke:png-proof`, `node scripts/semantic-verification-smoke.js`. PNG smoke использует синтетические файлы и не требует клиентского AEP или локальных архивов. Дополнительный режим `node scripts/generated-png-proof-smoke.js --local-evidence` проверяет доступные локальные файлы исходного live случая; его результат не заменяет новую проверку AE и просмотр кадров.

Для root capture можно дополнительно передать `expectedCompItemId`. Bridge
проверяет stable ID до mkdir/overwrite/export и повторно внутри native body;
возвращает actual `comp.itemId`. В этом режиме time находится на comp frame grid
в `[0,duration)`, overwrite запрещён. Cached root PNG не выдаётся повторно:
fresh ID drift блокируется, совпадение ID тоже требует fresh capture, поскольку
полный contributing render graph неизвестен. Legacy PNG replay сохраняет свою
проверку текущего файла. Регистрация owner, полный SHA/IEND, containment,
resolution restoration, manual-save и cleanup gates не заменяются.

Montage root packets и stable-ID export явно сообщают
`rootFreshness:{status:'blocked',code:'unsupported_unknown_render_graph'}`.
Canonical unit/policy/material namespace не привязан к owner export API:
`captureBinding` blocked `missing_canonical_unit_material_capture_binding`.
Stable ID и валидный PNG не доказывают неизменность rendered scene или artistic
acceptance. `smoke:montage-affine` проверяет actual emitted owner root controls,
mapped stretch200 samples, ID race до export и cache rejection в offline VM.
