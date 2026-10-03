# Cover и визуальная приёмка плейсхолдеров

Применять для равномерного заполнения рамки видео, проверки людей на выбранных
кадрах и отдельной художественной приёмки. Значимые люди/лица задаются явными
наблюдениями с boxes в исходных pixel coordinates; обязательная модель детекции
не устанавливается.

1. Прочитать свежие `get_placeholder_usage` и `get_placeholder_protection`.
   Выбрать устойчивую цель и допустимый sourceRange без повторного фрагмента.
2. Собрать наблюдения исходных кадров: первый, средний, последний по frame offsets
   существующего builder и все известные смены плана. Для каждого нужны время,
   идентичность изображения и конкретное наблюдение; отсутствие людей отмечается
   явно. Недостающие кадры дают needs_sampling.
3. Вызвать `propose_placeholder_cover` с target, sourceRange, samples и известными
   shotBoundaries. Свежая геометрия должна быть поддерживаемой: static 2D,
   square pixels, без parent, rotation, masks и collapse transformations.
   Uniform cover сохраняет anchor; offset выбирается по всем значимым boxes.
   Если кадрирование невозможно, проверить предлагаемые свободные интервалы
   того же источника и заново собрать кадры выбранной альтернативы.
4. Передать framing в `build_placeholder_plan`, затем обычные proposal/dry-run/
   confirmation/checkpoint gates. После записи использовать свежий read-back и
   `verify_placeholder_coverage`. Полное покрытие прямоугольника и uniform scale
   проверяются независимо; alpha, эффекты и художественное качество отдельны.
5. Вызвать `build_placeholder_visual_review_plan` для явных target/root IDs,
   маршрутов и root/target/source sample times. Выполнить план обычным runner:
   `create_placeholder_review_comps` создаёт отдельные owned control/contact
   compositions с живыми ссылками. Основная композиция не получает service layers.
   Контрольный кадр сохраняет полный вид; ячейка листа использует contain.
6. Прочитать `get_placeholder_review_manifest`, экспортировать указанные frames
   существующим `save_comp_frame_png` и обновить manifest с hashes. Передать Flash
   компактный manifest и изображения через existing agy-bridge profile ae-agent.
   `kind:inspect`, без записи отчёта, достаточен для текстового заключения.
   `inspectionMaterials` разбивает большой набор на части до десяти control
   frames плюс лист. Каждая часть имеет свой manifest pin и уникальный task ID;
   service objects создаются один раз. Все части относятся к одному owner.
7. Проверить `verify_placeholder_visual_review` по owner и селектору:
   для AGY — `inspectionRunId` / `inspectionRunIds`; для Codex —
   `codexReviews:[{threadId, turnId}]`. Смешанные селекторы отклоняются.
   Для Codex сервер разрешает UUID в официальном корне сессий, проверяет
   полную фактическую доставку canonical JSON до картинок и совпадение
   plaintext pin, если он доступен. SHA, путь или обрезанный JSON недостаточны.
   Бюджет внешнего functions.exec должен вместить полное тело manifest.
   Проверяются мультимножество
   ImageView и оригинальных PNG вложений (по байтам, SHA, размерам),
   завершённый turn и официальный JSON финал с last_agent_message.
   Конкретные observations сервер читает из официального ответа Flash/Codex;
   он сверяет фактические view_file call/result пары (для AGY) либо
   независимые полные мультимножества ImageView + original attachments
   (для Codex) и manifest identities. Финал следует за всеми PNG.
   PNG, viewed=true и SUCCESS не заменяют просмотр.
   Нечитаемая ячейка требует просмотра отдельного control frame. Заключение
   относится только к просмотренным временам; промежутки остаются неизвестными.
   Для нескольких частей передать полный `inspectionRunIds` или `codexReviews`.
   Отсутствующий просмотр, повторный run, изменившийся hash или неполный набор
   не дают общей приёмки. Client observations не подменяют outputs официальных запусков.
8. После пользовательской приёмки зафиксировать плейсхолдер через CEP.
   Удалить service objects существующим `cleanup_test_items` с точными itemIds,
   owner и confirm. Ownership/read-back и отсутствие внешних dependents обязательны.
   Совпадение префикса имени не разрешает удаление чужого объекта.

Отказ доступа к изображению или записи отчёта не обходится. При запрете записи
вернуть текстовое заключение; художественную проверку без просмотра оставить
незавершённой. Проверки synthetic JSX/daemon и синтетического Flash image review
не являются художественной приёмкой открытого пользовательского AEP.
