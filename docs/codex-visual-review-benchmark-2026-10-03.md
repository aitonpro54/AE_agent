# Flash и Codex: просмотр сохранённых кадров и расход — 3 октября 2026

На одном полном пакете Codex Luna/medium завершил проверку за **89,0 с**, Flash 3.8 High — за **104,7 с**. В этом одном сравнении полный запуск Codex был короче на **15,0%**. Нативный способ подтверждения просмотра добавлен как альтернатива; оснований автоматически менять основной маршрут Flash этот тест не даёт.

## Что сравнивалось

Сохранённый синтетический batch: exact canonical manifest 48 421 bytes, контактный лист и десять полных PNG (11 изображений, 143 430 bytes). Экспорт AE, смена композиции, UI, сохранение проекта и новая live-приёмка в сравнение не входили. Сами PNG до/после закреплены SHA-256. Manifest доставлен целиком до изображений, каждый PNG — в original detail.

Flash: fresh `ae-agent` inspect через существующий agy-bridge; runtime model `gemini-3.8-flash-high`, effort high задан конфигурацией, отдельного runtime effort нет. Codex: две свежие изолированные read-only CLI 0.160.0 с runtime `gpt-6-luna`, effort `medium`; visual arm и text-only control. Контроль читает тот же manifest, возвращает десять явных unknown/reject и не получает картинок.

| Полный запуск | Время | Результат |
|---|---:|---|
| Flash, изображения | 104,735 с | 10 safe, все required inputs просмотрены |
| Codex Luna/medium, изображения | 89,031 с | 8 safe, 2 reject; 11 native views и 11 совпадающих original PNG |
| Codex Luna/medium, контроль без изображений | 34,469 с | 10 unknown/reject, 0 изображений |

Границы времени немного различаются: native — wall-clock CLI процесса, Flash — execution elapsed моста (model probe отдельно). Это сравнение двух полных способов работы на одном packet, а не измерение чистой латентности моделей. Один валидный pair не даёт статистического интервала или универсального результата.

## Дополнительный расход Codex

Учитывались уникальные `token_usage_record.response_id` только заданных completed turns; runtime model/effort проверены по `turn_context`. Cumulative `token_count` не суммировался.

| Метрика | Без картинок | С картинками | Разница |
|---|---:|---:|---:|
| Ответы модели | 2 | 3 | +1 |
| Весь обработанный вход | 64 222 | 115 021 | **+50 799 (+79,1%)** |
| В том числе cached input | 21 248 | 64 000 | +42 752 |
| Некэшированный вход | 42 974 | 51 021 | **+8 047 (+18,7%)** |
| Выход | 1 008 | 1 688 | **+680 (+67,5%)** |
| В том числе reasoning output | 97 | 538 | +441 |

Cached input входит в общий input, reasoning входит в output: их нельзя складывать второй раз. Разница относится к полному visual workflow: передаче картинок, дополнительному ответу модели, повторной обработке контекста, анализу и более длинному заключению. Отдельного image-token счётчика нет; цена только пикселей и процент подписочного лимита не установлены. Кэш влияет на результат: ранний pilot дал даже меньший uncached input visual arm; это показывает, почему общий input нельзя механически переводить в деньги/квоту.

Недельный счётчик аккаунта за весь рабочий интервал изменился **24% → 31%**. В интервал входили разработка адаптера, архитектура/проверки, невалидные пробы и другие активные чаты. Все семь пунктов нельзя приписать картинкам или одному сравнению. Полный root orchestration overhead также не входит в таблицу изолированных native turns.

## Качество: модели разошлись

Независимо просмотрены исходные PNG 7 и 8 с теми же pinned bytes. В PNG 7 белая внутренняя рамка видна полностью: Luna ошибочно заявила её отсутствие и дала reject. В PNG 8 белая рамка видна слева и на левых участках сверху/снизу, но отсутствует справа: Luna обнаружила проблему, хотя преувеличила отсутствие; Flash дал safe с неверным утверждением о полностью сохранённой рамке.

Следовательно, два решения расходятся: у Luna один ложный отказ и один найденный дефект, у Flash один пропущенный дефект. Это маленькая техническая fixture, а не общий рейтинг моделей и не проверка лиц, типографики или клиентского художественного монтажа. Между выбранными кадрами состояние неизвестно.

## Равнозначный Codex proof

`verify_placeholder_visual_review` теперь принимает `codexReviews:[{threadId,turnId}]` либо прежние AGY selectors, с запретом смешивания. Сервер читает официальный runtime сам; клиентские пути, JSON evidence и viewed flags не принимаются. Проверяются completed turn/cwd/UUID/final JSON, полное canonical body до PNG, отдельные мультимножества native ImageView paths и фактически доставленных PNG bytes/hash/dimensions. Одинаковые hashes не схлопывают разные обязательные views. Сохраняются owner-wide coverage и текущие native/canonical freshness gates.

Реальный valid visual02 прошёл adapter и aggregation с `ok:true,status:"rejected_sampled_frames"`: proof просмотра принят, два visual rejects сохранены. Контроль без PNG и пробы с обрезанным manifest дали `insufficient_material`. 56 адресных offline Codex regressions, три группы прежнего AGY smoke, syntax шести JS, rules и diff checks прошли. Это проверка сохранённого native batch и offline integration; новая свежая owner-wide live-приёмка и активация кода в работающем bridge не заявляются.

Локальные logs не подписаны и не доказывают внутреннее внимание модели или истинность текста наблюдений. Точный контракт и команды — [placeholder-visual-review.md](placeholder-visual-review.md).

## Исполнение и ограничения

Архитектура — Sol/ultra; подбор данных/первичная сводка — Luna; draft реализации — Flash. Первый Flash draft получил отказ на ненужное чтение global config; доступ исключён. Второй draft потерял provider socket, процессы проверены как exited, partial files сохранены и claim официально reconciled. Узкий engineering blocker довёл Sol/xhigh. После runtime agent-thread-limit сборка финальной таблицы выполнена существующим локальным детерминированным script без нового helper/model вызова.

Ранние helper pilots и CLI01 получили все PNG, но инструмент обрезал 48 KiB manifest из-за внешнего output budget. Они сохранены как диагностические пробы, исключены из итогового сравнения полного протокола. Исправлены оба лимита доставки текста; valid pair повторён с полным manifest. Настройки основного чата, dependencies, frozen intake, AE mutations и default маршрут моделей не менялись.

## Локальные воспроизводимые данные

Ignored directory: `.codex-runtime/frame-review-benchmark-20261003/`. Главный report `measurement-final.json`, детерминированный сборщик `measure-cli-pair.py`; native `frame-review-native-cli-20261003-{visual,control}-02.*`, официальный Flash task `frame-review-benchmark-flash-20261003-01` в `.codex-runtime/agy-bridge/`. Runtime IDs: visual `01a102ec-807e-7221-8ab4-a1c0f4ddf449` / `01a102ec-8175-77c3-ab13-e335960cf35f`; control `01a102ea-86bd-74c0-ab49-74087d80165c` / `01a102ea-87c4-76e0-b601-19e8e6d90200`.
