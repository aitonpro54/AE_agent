# Visual acceptance: исследовательский пакет

Дата: 8 ноября 2026. Только исследование и рекомендации, без реализации.
Core source snapshot: `d5bf682eb2b1470cc7f69b5186b8447c8ec5b768`, ветка `codex/ae-agent-core-4.1.2`.
Legacy source snapshot: `5d0d255e6858477d1c19c1010154389425229028`, ветка `codex/release-3.3.5`; ref получен через GitHub, исходники прочитаны по полному SHA.
Рабочий AGENTS.md имеет существовавшее до аудита изменение; оно не включено в выводы о committed коде и не изменялось нами.

## Уровни evidence

- VERIFIED(source): реализация прочитана; это не успешный live прогон.
- VERIFIED(recorded): есть сохранённый отчёт/квитанция прошлого native прогона; дата и версия ограничивают вывод.
- VERIFIED(viewed): root действительно открыл указанный локальный PNG в этом аудите; не fresh capture текущего открытого AEP.
- INFERRED: вывод или рекомендация из этих фактов.
- UNKNOWN: нет достаточного подтверждения.

## 1. Legacy: что действительно было

Обязательные восемь файлов изучены: docs/placeholder-visual-review.md, docs/codex-visual-review-benchmark-2026-10-03.md, mcp-server/codex-visual-evidence.js, comp-visual-review-plan.js, placeholder-visual-review.js, text-visual-review-plan.js, recipes/comp-visual-review-plan.md, placeholder-cover-visual-review-plan.md. Дополнительно docs/generated-png-proof.md, docs/text-live-review-2026-10-04.md и recipes/text-visual-review-plan.md.

Общий comp builder: явные stable comp IDs и times на frame grid; 4 comps, 12 уникальных кадров, 18 шагов; свежий preflight и post-read, полный resolutionFactor [1,1], no overwrite, восстановление resolution. Export через save_comp_frame_png. Manifest проверяет точный builder pattern/run и путь/bytes/hash/dimensions, даёт complete/incomplete/corrupt. Даже complete сохраняет historicalCapture=true, currentProjectStateVerified=false, canonicalFreshness=false, artisticAccepted=false. Это reusable техническое основание, не oracle художественного качества.

Placeholder: uniform cover + fresh геометрия и четыре границы прямоугольника, static 2D без parent/rotation/masks/collapse; alpha/effects/люди требуют pixels. Review builder делает owned control comps/contact sheet с contain и подписями, не добавляет слои в основной root. Есть first/middle/last/shot roles, source/target/root views, stable IDs/routes/times, sourceKey, hashes, детерминированные batches <=10 control PNG + sheet. Cleanup по точному owner/receipt/ID set. Canonical capture/freshness зависит от отдельного montage графа/receipt, не автоматически от PNG.

Gemini Flash: официальный agy-bridge inspect, ожидаемый runtime model gemini-3.8-flash-high; paired ACTIVE/DONE view_file и конкретный observation на каждый target/root frame. Codex: parser официальных session/turn logs, manifest целиком до изображений, multiset native ImageView + original PNG bytes/hash/dimensions, completed turn и exact final JSON. Сервер сам читает evidence; viewed=true клиента недостаточно. Это provenance доставки, не математическое доказательство внимания модели; logs не подписаны. Оба пути выдают accepted_sampled_frames / rejected_sampled_frames / insufficient_material. Они не запускают провайдера автоматически.

PNG proof: сигнатура, IHDR, границы chunks, IDAT, конечный IEND без trailing bytes; bounded stable read и SHA. CRC и реальное декодирование прямо исключены из legacy file-completion proof. Поэтому нельзя называть его полной проверкой PNG-декодирования.

Text wrapper: четыре synthetic case IDs — scaled-precomp-text, offset-stretch-phases, accents-descenders, font-difference; 1–3 entry/hold/exit кадра, root и один precomp route, static Source Text; exact Unicode, native IDs/revision, до/после text/timing/transform metadata и связь font request с durable update. Не измеряет автоматически видимые glyph/ink bounds во всех состояниях, не доказывает actual rendered font по stored имени.

Сохранённый benchmark 3 октября: один синтетический пакет, manifest 48421 bytes + 11 изображений (sheet +10 PNG). Flash 104.735 s: 10 safe. Codex Luna/medium 89.031 s: 8 safe /2 reject. Независимый просмотр PNG7/8 подтвердил у Codex один ложный отказ и один обнаруженный дефект; Flash пропустил один дефект. Text-only control имел 0 images и unknown/reject. 56 offline Codex regressions, AGY smoke. Это реальная доставка/view evidence на сохранённом batch, не свежая owner-wide live AE приёмка и не рейтинг качества моделей.

Live text 4–5 октября: четыре собственных synthetic сцены, 10/10 actual PNG и 6 manifests, independent ACCEPT ограниченного scope. Обнаружены неправильные accents у унаследованного шрифта; после typed ArialMT correction просмотрен исправленный кадр. Native FontObject.isSubstitute=true при missing-font запросе, stored=requested, реальный fallback name неизвестен. Pixel bbox измерялись относительно явного однотонного фона на порогах 2/8/32. Описанная в раннем recipe фраза «live не выполнялся» устарела относительно этой более поздней записи. Raw PNG/логи тех октябрьских кейсов на этой машине не перепроверены; это VERIFIED(recorded), не новое воспроизведение.

Ссылки legacy: https://github.com/aitonpro54/AE_agent/tree/5d0d255e6858477d1c19c1010154389425229028 (пути выше).

## 2. Core 4.1.2

Изучены source-package.json, core/stdio.js, manual-titles-variants.json, products/slideshow/README.md, products/titles/README.md, installable plan, modularity review и pilot.

В установленном generic MCP отсутствуют dedicated PNG/contact-sheet/review/visual-verdict tools и отдельный visual review module. Наличие mcp-server/*.js в checkout не включает их в source-package/Core dispatch. Современный состав manual-media-layers наследует variants и добавляет project/media операции. Пилот модульности даёт проверенные декларации module/artifact/admission/result profile; новый тип доверенного proof не появляется автоматически от записи JSON.

comp-render — owned queue stage/finalize/discard, DONE/read-back + source/output path/size; сам Render Queue не запускает. Ограничение текущего кода 600 кадров /12 секунд. Numeric/text/geometry read-back и 16 полей оформления не доказывают rendered typography.

На HEAD core4/tools/aerender-jobs.js — отдельный checkout CLI (не installed MCP): saved copy, точный target queue item, durable job ID, fingerprint входов/процесса, native completion log, FFprobe exact H264/dimensions/fps/count/audio/duration, полный FFmpeg decode, stable output SHA, публикация без перезаписи. verifyMedia/verifyCompleted строки147–187 не содержат выбора кадров, diff или эстетического вердикта. AME CLI также отдельный путь.

Реальные evidence 4.1.2 MSI: S1 crossfade90 и operator S1: H264 3840x2400 @30000/1001, no audio. 7 численных sample измерений; blendB(frame45)=0.49149. Три PNG10/45/75 физически есть, SHA совпали при аудите. PNG — 768x480, а не полные3840x2400. Root открыл их: A — тёмная сфера с голубым/фиолетовым краем; средний кадр сочетает A и светлые складки B; последний — B. В пределах этих samples нет пустого/очевидно битого изображения. Continuity всех90 кадров и typography не установлены этим просмотром.

Новый async job d546f2a1-a340-4209-91c9-57018b0486e5 опубликовал MP4 SHA a6e9e225e63c48d99c937004dc0c6fe1a37765080fd7c98f3b72dcfc0a3f5bd1:720 кадров,640x400,24.024s. Root дополнительно проверил SHA и извлёк offline кадры0/45/89/90/315/719, открыл все6 на native output size. Кадры45/315 и89/719 совпадают побайтово; повторяемость сама по себе не stale. Вид существенно теснее оригинального S1: в начале видна синяя область, далее крупные складки; без заданного visual reference crop не классифицируется как ошибка. Существующий contact sheet другого ручного master720 связан с MP4 SHA ff6d2244…; он не использован как доказательство именно async output. Новых render/AE вызовов не было.

Titles operator4.1.2: recorded in-memory text/style read-back и видимый результат; отдельного PNG/MP4 этого изменения не найдено. Ранее612 decoded frames совпали с эталоном на Core4.1.1, не4.1.2. Фото4.1.2 проверено на MSI/desktop; S1 и async aerender на desktop в изученном evidence остаются открыты.

Вывод: в Core есть render + structural/media verification + отдельные реальные visual checks; отсутствует общий повторяемый visual acceptance workflow. Это не «ничего нет» и не «добавить файлы legacy в package достаточно».

## 3. Внешние MCP — только статический code audit

На этих MCP нет нашего live прогона; все ниже VERIFIED(source), работоспособность в нашей AE среде UNKNOWN.

Surehand commit0073d99e3217bc2bfba0af49aff3937cac7a5987: server/src/tools/prove.ts capture175–195, diff204–277, compare354–460. Pinned project/comp/time/PNG, RGBA max delta/count/bbox, CIE76, alpha awareness, heatmap, tolerance. Scope sampled PNG, no audio, HDR clamping. run529–556 сохраняет уже применённый batch при провале compare. Stress cases.ts90–130 и stress/measure.ts191–325 реально проверяют long strings/RTL/CJK/diacritics/emoji, overflow/margins/font/glyph/composer, недоступные API дают notRun. Farm verify проверяет последовательность/metadata и выборочные AE comparisons, не универсальный pixel-check всего видео.
https://github.com/ConformLabs/surehand-mcp/blob/0073d99e3217bc2bfba0af49aff3937cac7a5987/server/src/tools/prove.ts
https://github.com/ConformLabs/surehand-mcp/blob/0073d99e3217bc2bfba0af49aff3937cac7a5987/server/src/stress/measure.ts
https://github.com/ConformLabs/surehand-mcp/blob/0073d99e3217bc2bfba0af49aff3937cac7a5987/server/src/tools/farm.ts

Engine Room commit59b896ab5c67fd0a2f49ff3d95d5779c5fec7144: packages/jsx/vision.jsx270–310 multi-time2–6, packages/mcp-server/src/frames pipeline.ts с sheet/status placeholders и PNG reader. Hash normalized pixels, shared per-instance cache24/10min: одинаковые непрозрачные pixels у разных request keys трактуются как stale, поэтому static/repeated content может дать false positive, same-key stale не обнаруживается. FRAME_INCOMPLETE допускает один новый render, timeout не ретраится. Не переносить retry через Core UNKNOWN.
https://github.com/Engine-Room-Games/after-effects-mcp/blob/59b896ab5c67fd0a2f49ff3d95d5779c5fec7144/packages/mcp-server/src/frames/pipeline.ts
https://github.com/Engine-Room-Games/after-effects-mcp/blob/59b896ab5c67fd0a2f49ff3d95d5779c5fec7144/packages/mcp-server/src/frames/frameCache.ts

JUNKDOGE commit10b0154ca64f5ed15096b367f160129ee9ffe503: plugin/host/mcp/tools/preview-frame.js compare504–609/grid612–647 и image-ops.js187–232. Capture ID cache50, previous PNG SHA/dims validation, A/B RGBA threshold8/255, changed ratio/bbox/heatmap/side-by-side; B автоматически resizes к A с warning. Grid<=16. Tool Library сохраняет успешный JSX candidate verified:false, это не библиотека доказанных visual assertions. Копировать её raw replay/approval архитектуру не требуется.
https://github.com/JUNKDOGE-JOE/after-effects-mcp/blob/10b0154ca64f5ed15096b367f160129ee9ffe503/plugin/host/mcp/tools/preview-frame.js
https://github.com/JUNKDOGE-JOE/after-effects-mcp/blob/10b0154ca64f5ed15096b367f160129ee9ffe503/plugin/host/mcp/image-ops.js

## 4. Предложение для проверки Argon

P0: малый внешний workflow на существующем render output, не новый Core subsystem. На вход точный job/output SHA и явно выбранные frame indices/fps/ожидания. Проверить текущие bytes и decode; сохранить PNG без уменьшения относительно output, маленький подписанный contact sheet как индекс, manifest frame/time/dims/hash плюс image/view/observations. Полные PNG обязательны там, где sheet недостаточен. Отдельные статусы integrity/render/sample coverage/review verdict; missing/unknown не PASS, sampled PASS не full timeline/current AEP PASS. Output video уже compressed: для glyph/alpha fidelity прямые lossless PNG могут понадобиться отдельно.

Первый проверяемый продуктовый случай — S1 до/внутри/после dissolve, включая границы30/60; для Titles — entry/hold/exit, exact expected text/line breaks, видимые accents/descenders, поля/клиппинг/контраст. Принятый reference и ожидаемые изменения задаются явно; sourceRect/stored font/width-height не заменяют визуальный intent.

Переиспользовать legacy формы frame bindings/manifests и pure PNG helpers после проверки границ; не импортировать старые daemon/runner/authority/session-root store в Owner. На первом шаге обычный явный просмотр текущим агентом и отдельный review record; legacy session parser нужно отдельно адаптировать и проверить на текущем Codex runtime, если позже требуется машинное доказательство доставки. Он не должен быть условием первого полезного review.

P1 по фактической потребности: небольшой typed comp-frame-export capability через существующие module/admission/dispatch/gates, без legacy contact service comps; image diff (строгие одинаковые dimensions/time/color/alpha и заданная tolerance/ROI), несколько text stress fixtures. Любое изменение, затрагивающее переносимость, проверять на MSI/desktop; один host не даёт двусторонний PASS.

REJECT сейчас: новый broker/SDK/render engine, перенос всего legacy, второй provider как обязательный judge, авто-refresh/render после UNKNOWN, приравнивание hash/diff к artistic acceptance, одинаковые кадры как безусловный stale, auto-resize A/B как строгий proof, универсальная face model и полный stress/farm framework.

## Ограничения консультации

Это snapshot источников и локальных фактов, а не полный кодовый bundle. Argon не получает PNG/MP4/AEP, необработанные runtime logs или конфигурацию; не может независимо подтвердить visual observations. Внешние MCP не устанавливались и не запускались. Legacy raw logs/PNG октября на MSI не сверены. Current runtime AE не опрашивался и не изменялся; fresh current-AEP visual acceptance не заявляется. Требуется только критика вывода и минимального плана.
