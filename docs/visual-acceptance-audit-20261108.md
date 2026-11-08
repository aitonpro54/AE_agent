# Визуальная приёмка AE Agent Core 4.1.2 — аудит 8 ноября 2026

## 1. Executive summary

**Визуальную приёмку не нужно строить с нуля.** В legacy реализованы экспорт кадров, выбор времён, контактные листы, manifests, проверки PNG и доказательств доставки изображений Codex/Flash. Есть сохранённый benchmark и ограниченная нативная приёмка текста. В Core 4.1.2 уже работают рендер, структурные проверки, проверка видео и отдельные визуальные сценарии. Не перенесён общий повторяемый путь от выбора кадров до привязанного к артефакту визуального заключения.

Рекомендация: **переиспользовать части legacy и добавить небольшую связку вне Owner**, начиная с review готового MP4. Простая переупаковка старых файлов недостаточна: они связаны с прежним runner, owner store, формой receipts и журналами провайдеров. Новый broker, SDK или универсальная подсистема приёмки не нужны. Typed PNG-export — следующий небольшой модуль при потребности в проверке до полного рендера, lossless пикселях или alpha.

Исследованные снимки:

- Core: `codex/ae-agent-core-4.1.2`, `d5bf682eb2b1470cc7f69b5186b8447c8ec5b768`.
- Legacy: `codex/release-3.3.5`, `5d0d255e6858477d1c19c1010154389425229028`; ветка и файлы прочитаны через GitHub по закреплённому SHA, без checkout/switch.
- Существовавшее изменение рабочего `AGENTS.md` сохранено. Source, runtime, настройки и AEP в аудите не изменялись. Тесты/рендер/установки не запускались; из существующего MP4 только извлечены проверочные PNG.

Обозначения: **VERIFIED(source)** — прочитанная реализация; **VERIFIED(recorded)** — сохранённые результаты с указанными границами, без нового воспроизведения; **VERIFIED(viewed)** — изображения действительно открыты в этом аудите; **INFERRED** — вывод; **UNKNOWN** — подтверждения недостаточно. Ни один из этих статусов сам по себе не означает полную художественную приёмку текущего AEP.

## 2. Что уже есть в legacy

| Возможность | Реализация и доказательство | Статус и предел |
| --- | --- | --- |
| PNG-export | `save_comp_frame_png`, stable comp ID, точное время/frame grid, full resolutionFactor, восстановление resolution, no overwrite, read-back | VERIFIED(source); нативный путь использовался в text live review |
| Выбор кадров композиции | `comp-visual-review-plan.js`: до 4 comps, 12 уникальных кадров, 18 шагов; pre/post project/comp reads | VERIFIED(source). Времена задаются явно; автоматический поиск всех визуально значимых моментов не заявлен |
| Contact sheet | Placeholder owned service/control comps, contain внутри ячейки и подписи; source/target/root views; first/middle/last/shot roles | VERIFIED(source). Это не общий contact-sheet exporter Core. Основной root не получает служебных слоёв |
| Manifest и integrity | Точный run/plan/export step, comp/time/frame, bytes/SHA/dimensions, containment и стабильное чтение; complete/incomplete/corrupt | VERIFIED(source). Complete не равно artisticAccepted |
| Полнота PNG | Signature/IHDR/chunk bounds/IDAT/IEND, отсутствие trailing bytes, bounded ожидание записи | VERIFIED(source). **CRC и декодирование pixels этим helper не проверяются** |
| Placeholder coverage | Uniform cover и четыре границы прямоугольника по fresh geometry; ограниченный static2D профиль | VERIFIED(source). Alpha, effects, важные лица и художественный crop требуют изображений |
| Review через Flash | Официальный AGY inspect, runtime model, парные ACTIVE/DONE `view_file`, manifest pins и concrete observations каждого кадра | VERIFIED(source) и VERIFIED(recorded benchmark). Это не автоматический вызов модели из visual verifier |
| Review через Codex | Сервер читает официальный completed turn, проверяет полный manifest до PNG, мультимножества ImageView и original PNG attachments, bytes/hash/dimensions и final JSON | VERIFIED(source) и VERIFIED(recorded benchmark). Логи не подписаны; provenance доставки не доказывает внимание/истинность суждения |
| Text review | 4 synthetic кейса, 1–3 entry/hold/exit кадра, root/один precomp route, static text, exact Unicode, IDs/revision, text/timing/transform pre/post | VERIFIED(source). Не универсальный bounds/glyph/font oracle |
| Freshness и ownership | Placeholder/montage captures имеют собственные receipt/graph/file bindings и owner cleanup; общий comp manifest отдельно сохраняет historicalCapture | VERIFIED(source). Нельзя переносить freshness одного маршрута на остальные |

Основные источники закреплены в [legacy visual contract](https://github.com/aitonpro54/AE_agent/blob/5d0d255e6858477d1c19c1010154389425229028/docs/placeholder-visual-review.md), [comp recipe](https://github.com/aitonpro54/AE_agent/blob/5d0d255e6858477d1c19c1010154389425229028/recipes/comp-visual-review-plan.md), [cover recipe](https://github.com/aitonpro54/AE_agent/blob/5d0d255e6858477d1c19c1010154389425229028/recipes/placeholder-cover-visual-review-plan.md) и [PNG proof](https://github.com/aitonpro54/AE_agent/blob/5d0d255e6858477d1c19c1010154389425229028/docs/generated-png-proof.md).

**Что действительно работало.** В benchmark 3 октября использовался один сохранённый синтетический пакет: manifest 48 421 bytes, sheet и 10 PNG. Flash завершил его за 104,735 с с 10 safe; Codex Luna/medium — за 89,031 с с 8 safe/2 reject. Независимая проверка двух спорных кадров установила один ложный отказ Codex и один дефект, обнаруженный Codex и пропущенный Flash. Контроль без изображений не прошёл visual evidence. Это подтверждённая доставка/view pipeline и сравнение одного пакета, **не новый live AE прогон, не качество на клиентских сценах и не общий рейтинг моделей**. Записаны 56 offline regressions; в этом аудите они не повторялись. [Benchmark](https://github.com/aitonpro54/AE_agent/blob/5d0d255e6858477d1c19c1010154389425229028/docs/codex-visual-review-benchmark-2026-10-03.md).

4–5 октября документирована нативная приёмка четырёх собственных text-сцен: **10/10 PNG, 6 manifests, independent ACCEPT ограниченного synthetic scope**. Были замечены неправильные акценты у унаследованного шрифта, затем просмотрена typed ArialMT correction. Missing-font case дал native `isSubstitute=true` при равенстве requested/stored font; фактическое имя fallback неизвестно. Pixel bounds отдельно измерялись относительно известного фона на порогах 2/8/32. Это реальная историческая visual работа, а не только structural test. Октябрьские raw PNG/logs на MSI в этом аудите не воспроизведены. Ранний text recipe ещё пишет «live не выполнялся»; более поздняя [запись native review](https://github.com/aitonpro54/AE_agent/blob/5d0d255e6858477d1c19c1010154389425229028/docs/text-live-review-2026-10-04.md) уточняет результат.

Полная свежая owner-wide placeholder acceptance конкретного пользовательского AEP из изученных материалов **UNKNOWN**. Общий comp manifest намеренно оставляет `currentProjectStateVerified`, `canonicalFreshness`, `artisticAccepted` равными false. Нельзя объявлять всю legacy систему универсально визуально принятой.

## 3. Что уже есть в Core 4.1.2

**VERIFIED(source).** Декларации состава и package closure подключают typed modules. `manual-titles-variants` добавляет `text-variant` и `comp-render`; актуальный `manual-media-layers` наследует этот состав и добавляет другие операции. Generic MCP и Owner не публикуют отдельный PNG/visual-review модуль. Одного отсутствия имени tool в `core/stdio.js` было бы недостаточно для вывода: дополнительно проверены составы и package closure. [Source package](../core4/runtime/source-package.json), [generic stdio](../core4/core/stdio.js), [variants composition](../core4/config/compositions/manual-titles-variants.json), [media composition](../core4/config/compositions/manual-media-layers.json).

`comp-render` реализует stage/finalize/discard своего задания и временной композиции, проверки DONE, сохранности snapshot, пути/размера выхода. Запуск очереди выполняется в AE. Текущий код ограничивает этот путь 600 кадрами и 12 секундами. Ни этот proof, ни read-back 16 полей текста не устанавливают видимые глифы/клиппинг. [Executor](../core4/modules/comp-render/executor.jsx), [proof](../core4/runtime/comp-render-proof.js).

На текущем HEAD есть существенно больше: **checkout CLI `aerender-jobs.js`** ведёт постоянное задание, запускает отдельный renderer на рабочей копии AEP, проверяет native completion log, входные hashes, H.264/dimensions/fps/frame count/audio/duration через FFprobe, полный decode через FFmpeg и стабильность SHA выхода. Это media verification; selection PNG/diff/artistic verdict в `verifyMedia`/`verifyCompleted` отсутствуют. CLI не включён в установленный MCP runtime. [Реализация](../core4/tools/aerender-jobs.js), [приёмка](../plans/core-4.0.0-installable.md).

Продукты тоже задают правильную границу: Slideshow README после рендера требует посмотреть кадры до, внутри и после перехода; Titles compiler выдаёт данные для существующего контроллера и не запускает собственный runtime/provider. Но общей реализации review packet/verdict у них нет. [Slideshow](../products/slideshow/README.md), [Titles](../products/titles/README.md).

Пилот модульности полезен для будущего небольшого export capability: декларативный состав, artifacts/admissions, отделение предметного сравнения от trusted file checks. Новый профиль результата всё равно требует реализации доверенной проверки. Пилот сам visual acceptance не добавляет. [Оценка курса](core-modularity-review-20261106.md), [пилот](../plans/core-modularity-pilot-20261106.md).

### Фактический визуальный просмотр в этом аудите

| Артефакт | Что подтверждено сейчас | Что остаётся неизвестным |
| --- | --- | --- |
| S1 operator, Core4.1.2 MSI | SHA MP4 `cf8fd2e9…` и трёх PNG10/45/75 совпали. Все PNG открыты: A, видимый crossfade A+B, затем B. Recorded blendB45=0,49149 согласуется с видом | PNG768×480 уменьшены относительно MP4 3840×2400; все90 кадров, typography/alpha и current AEP этим не приняты |
| Async master, текущий HEAD | Exact published job `d546f2a1…`, MP4 SHA `a6e9e225…` совпал. Из него отдельно извлечены и открыты 6 PNG640×400:0/45/89/90/315/719 | Это samples из saved output, не новый AE capture. Crop без визуального эталона не принят |
| Старый ручной master720 | Существующий contact sheet открыт как дополнительный материал | Он относится к другому MP4 SHA `ff6d2244…`, не заменяет evidence async output |
| Titles operator4.1.2 | Есть recorded read-back16 полей и наблюдение результата в AE | Отдельный PNG/MP4 именно этой операции в найденном evidence отсутствует |
| Фото4.1.2 / Advanced3D | Фото recorded на двух машинах. 612 совпавших decoded frames Advanced3D действительно записаны | Эти612 относятся к Core4.1.1, не4.1.2; S1/async desktop ещё не принят |

У async-мастера вид заметно теснее исходного S1: вместо целой сферы в начальном кадре видна синяя область, затем крупные складки. Без заданного reference это **наблюдение, а не установленный дефект**. Оно показывает, почему успешный decode и верные размеры не заменяют проверку визуального намерения. Повторы PNG45=315 и89=719 согласуются с повторяемыми сегментами и сами по себе не доказывают stale capture.

Локальная воспроизводимая запись этого аудита: [manifest извлечённых кадров](../.codex-runtime/visual-acceptance-audit-20261108/sample-manifest.json) и [наблюдения](../.codex-runtime/visual-acceptance-audit-20261108/observations.json). Они находятся в ignored runtime и не являются переносимым release evidence. Рендер и AE в этой проверке не запускались.

## 4. Что потеряно / не перенесено

| Не хватает в Core | Состояние legacy / что требуется |
| --- | --- |
| Bounded frame-export для явных comp/time | Реализован в legacy; адаптировать к Core module/receipt/gates при необходимости |
| Единый пакет кадры + контактный лист + manifest | Части уже есть в legacy и разовых local scripts; нужен небольшой повторяемый внешний workflow |
| Привязанный sampled verdict с полным покрытием выбранных кадров | Legacy placeholder verifier есть; общий простой контракт Core-продуктов отсутствует |
| Машинная проверка факта доставки изображений текущему reviewer | Legacy Codex/AGY adapters существуют, но совместимость с текущим runtime/log layout не доказана |
| Reusable image diff / visual assertions | В legacy были отдельные измерения и сравнения; общей современной A/B утилиты в Core не обнаружено |
| Text stress regression | Есть четыре старых synthetic кейса и T3/layout machinery; нет готовой широкой visual stress suite Core |

**INFERRED: это частично неперенесённые функции и частично отсутствующая интеграция, а не архитектурная невозможность.** Pure selection/binding/PNG helpers можно адаптировать. Простое включение `mcp-server/` в пакет вернуло бы зависимости от старого daemon, store, provider evidence и authority. Общий visual reviewer разумно держать снаружи Core; Core отвечает за допущенный capture/AE operation, продукт — за ожидания и приёмку.

## 5. Что заимствовать у внешних MCP

Все три исследованы **по коду закреплённых commits**; установка и native прогон не выполнялись. Runtime на наших машинах — UNKNOWN.

| MCP | Реально реализовано | Что полезно Core / ограничения |
| --- | --- | --- |
| Surehand `0073d99e…` | Capture/compare тех же comp/time, RGBA delta/count/bbox, ΔE/heatmap, tolerance, alpha handling; text stress inputs и измерения; render/sequence validation | P1: diff с явной политикой, несколько text fixtures и notRun при неподдерживаемом API. Не переносить весь stress/farm framework. Sampled PNG не покрывает audio/HDR/весь timeline; compare после edit не означает автоматический rollback |
| Engine Room `59b896ab…` | Multi-time2–6 screenshots, contact sheet, bounded complete-PNG reader, места ошибок в sheet, shared stale-hash cache | P0: подпись каждого frame и явная failed/missing ячейка. PNG completeness уже было в AE Agent. Stale-hash — эвристика: одинаковые static/repeated pixels могут быть нормой. Его retry нельзя переносить через Core UNKNOWN |
| JUNKDOGE `10b0154c…` | A/B capture references с SHA/dimensions, changed ratio/bbox, heatmap/side-by-side, grid<=16; библиотека reusable JSX candidates | P1: небольшой offline A/B helper. Встроенное auto-resize B к A неприемлемо для строгого identical proof. Tool Library имеет candidate `verified:false`, не является библиотекой визуально принятых операций |

Первичные ссылки: Surehand [pixel proof](https://github.com/ConformLabs/surehand-mcp/blob/0073d99e3217bc2bfba0af49aff3937cac7a5987/server/src/tools/prove.ts#L354), [typography](https://github.com/ConformLabs/surehand-mcp/blob/0073d99e3217bc2bfba0af49aff3937cac7a5987/server/src/stress/measure.ts#L191), [render validation](https://github.com/ConformLabs/surehand-mcp/blob/0073d99e3217bc2bfba0af49aff3937cac7a5987/server/src/tools/farm.ts#L552); Engine Room [capture](https://github.com/Engine-Room-Games/after-effects-mcp/blob/59b896ab5c67fd0a2f49ff3d95d5779c5fec7144/packages/jsx/vision.jsx#L270), [reader](https://github.com/Engine-Room-Games/after-effects-mcp/blob/59b896ab5c67fd0a2f49ff3d95d5779c5fec7144/packages/mcp-server/src/frames/frameReader.ts#L121), [sheet](https://github.com/Engine-Room-Games/after-effects-mcp/blob/59b896ab5c67fd0a2f49ff3d95d5779c5fec7144/packages/mcp-server/src/frames/pipeline.ts#L405); JUNKDOGE [A/B](https://github.com/JUNKDOGE-JOE/after-effects-mcp/blob/10b0154ca64f5ed15096b367f160129ee9ffe503/plugin/host/mcp/tools/preview-frame.js#L504), [pixel operations](https://github.com/JUNKDOGE-JOE/after-effects-mcp/blob/10b0154ca64f5ed15096b367f160129ee9ffe503/plugin/host/mcp/image-ops.js#L187), [candidate library](https://github.com/JUNKDOGE-JOE/after-effects-mcp/blob/10b0154ca64f5ed15096b367f160129ee9ffe503/plugin/host/mcp/candidate-artifacts.js#L71).

## 6. Рекомендованный минимальный план

Первый implementation scope после аудита: **один небольшой reusable review готового render artifact вне Owner**. Он использует существующее подтверждённое видео, не создаёт новый renderer и не требует миграции всех legacy mechanisms.

1. На вход дать exact job/receipt и SHA MP4, frame indices/fps, ожидаемые визуальные свойства и reference при сравнении. Old artifact review явно отделить от current project acceptance.
2. Сверить файл, декодировать выбранные frames без уменьшения относительно output, записать comp/job/frame/time/dimensions/bytes/SHA. Это pixels из compressed MP4, не lossless AE PNG.
3. Сделать contact sheet с подписями кадров как индекс; сохранять полные отдельные PNG. Сохранять места и статусы missing/error frames и не считать sheet заменой читаемого текста.
4. Фактически открыть материалы, записать конкретные observations и verdict каждого обязательного кадра. Integrity, render verification, sampling coverage и visual verdict — отдельные поля. Missing/unknown не PASS; общая приёмка только при покрытии всего заданного набора.
5. Выполнить один ограниченный Slideshow case: A, начало/середина/конец dissolve, B, границы30/60; явно задать ожидаемый crop/порядок/отсутствие пустых frames. Для Titles — entry/hold/exit, ожидаемые строки/переносы, accents/descenders, поля, клиппинг и контраст.

Критерий завершения первого шага: другой вызов может воспроизвести пакет из того же artifact и получить тот же список frames/hashes; каждый выбранный кадр имеет наблюдение или explicit unknown; смена MP4/недостающий PNG не даёт reuse прежнего verdict. Это критерий будущей реализации, не утверждение о готовом CLI.

Typed `comp-frame-export` добавлять отдельно, когда требуется проверка до рендера, текущей композиции, прозрачности или lossless typography. Переиспользовать legacy bounded selection и PNG proof, адаптировать exact target/freshness/receipt к Core и сохранить existing gates. Contact sheet собирать вне AE; служебные compositions для этого первого модуля не обязательны.

Legacy provider evidence adapter можно вернуть позже, если нужен машинный delivery proof. Нельзя предполагать его совместимость с текущими Codex sessions без отдельной проверки. На первом шаге явный просмотр и запись review не должны ждать миграции этого парсера. Двусторонняя переносимость нового workflow/модуля проверяется адресно; MSI evidence не выдаётся за desktop PASS.

## 7. Приоритеты

**P0 — сначала:** повторяемый review packet из существующего видео, точная идентичность и границы утверждения, обязательные кадры/ожидания, фактический просмотр, per-frame observations и явный incomplete/unknown. Переиспользовать текущие S1/async материалы как исходный пример. Для возвращения пользы не нужен новый live renderer.

**P1 — потом:** typed PNG-export, native-size/lossless Titles review, компактный A/B с одинаковой сеткой/dimensions/color/alpha и явным tolerance/ROI; несколько typography stress fixtures; адаптация delivery evidence Codex/Flash. Одинаковые hashes использовать как диагностический сигнал с контекстом, а не безусловный отказ.

**REJECT сейчас:** полный перенос legacy runtime, новый broker/SDK, обязательное второе AI-мнение, универсальная face model, большой stress/farm framework, автоматический rerender после UNKNOWN, artistic PASS по одному hash/decode/SourceRect, строгий A/B proof после скрытого resize, повышение исторического evidence до current-project proof.

## Консультация Argon и состояние работы

Один ограниченный пакет передан существующему контроллеру по прямому поручению пользователя; исходные [request](../reviews/argon/visual-acceptance/20261108-research-01/request.md), [bundle](../reviews/argon/visual-acceptance/20261108-research-01/bundle.md) и [manifest](../reviews/argon/visual-acceptance/20261108-research-01/manifest.json) сохранены неизменными. Подтверждены Aiton Pro, режим Argon и **«Высокий — Глубокий»**, максимальный из трёх доступных вариантов усилия. UI показал запрос и оба вложения, началась генерация. Затем Gemini вернулся к пустому редактору; поиск по review ID не нашёл беседу.

Итог внешней стадии — **submission-unknown: ответ и вердикт не получены**. Одна отправка, ноль повторов; постоянной ссылки нет. Отсутствие ответа не объявляется одобрением или отказом Argon. Данный отчёт — самостоятельный локальный вывод, не «вывод, согласованный с Аргоном». Поручение получить его содержательную консультацию остаётся невыполненным из-за этого внешнего сбоя. Новый send не выполнялся. [Метаданные](../reviews/argon/visual-acceptance/20261108-research-01/response-meta.json), [локальное решение](../reviews/argon/visual-acceptance/20261108-research-01/decisions.md).

### Progress

Обязательные файлы legacy и Core изучены; внешние механизмы сверены по source snapshots; исходные MP4/PNG hashes проверены, saved frames просмотрены. Завершён локальный отчёт; внешняя консультация имеет неизвестный исход. [Реестр 8+8 обязательных источников](../reviews/argon/visual-acceptance/20261108-research-01/source-inventory.json).

### Decision Log

Не подменять visual review structural verification и не обесценивать уже работающие native/render части Core. Минимум — маленький внешний workflow с выборочным переиспользованием legacy; новый typed exporter обусловлен конкретной потребностью.

### Validation

Source/read-only аудит, GitHub pinned source review, SHA сверка двух MP4 и трёх S1 PNG; шесть PNG извлечены из exact async MP4 штатным существующим FFmpeg после сверки его SHA, все открыты. Тесты и новое live AE исполнение не проводились. Октябрьские native результаты и upstream MCP live остаются в отдельно указанных пределах.
