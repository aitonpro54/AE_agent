# Live review текста — 4 октября 2026

Статус: IN PROGRESS. Ограниченная live проверка четырёх synthetic кейсов решения `text-visual-review-plan`; единственный AE/CEP/UI контроллер — root. Source repair принят offline и активирован. Первая партия 5 actual PNG просмотрена и измерена; следующие исправления/экспорты pending.

## Границы и исходное состояние

- Только новый собственный синтетический проект; проект пользователя не используется.
- Свежая исходная инспекция root: `projectFile=null`, `numItems=0`, `revision=1`; bridge Connected, autonomy active, idle; lifecycle=false.
- Новый артефакт: `C:/Users/Ant/Documents/Codex/AE_agent/.codex-runtime/text-live-20261004/text-review-live-20261004.aep`.
- `New/Open/Save As` через lifecycle disabled. Bootstrap выполняет root только разрешённым способом для первого неназванного проекта. Save и export остаются под штатными confirmation/checkpoint/gates.
- Предпочтение — typed proposal → dry-run → штатное подтверждение → run/read-back. Stretch 150% — typed gap. Raw обход запрещён; если root задействует специально защищённый raw flow, proposal обязан показать exact project/revision, comp ID, layer ID, текущий stretch и желаемый 150%, пройти guards и ручной CEP gate по явной команде/валидному confirmation counter, затем independent read-back. Font update остаётся typed plan.
- При unknown submit сначала сверить durable run, фактическую сцену и receipt; не отправлять повторно вслепую. Provider не менять.
- До двух helpers суммарно; root владеет live controller. Docs operator отвечает только за эту запись и план; reviewer — read-only.

## Матрица кейсов

Все времена — root time по frame grid. Итого восемь фактически экспортированных PNG; каждый должен быть открыт и просмотрен в читаемом размере. ID, run ID, revision, receipts, PNG и выводы добавляются только по фактическому read-back.

| Кейс | Контракт | Экспорты | Статус / evidence |
|---|---|---|---|
| `scaled-precomp-text` | Текст `Scaled Text`; font 72, вложенная comp scale [125,85], root precomp layer scale [65,65]; проверить видимый итог и поля | 0 entry, 1 hold, 2.5 exit | Три actual PNG просмотрены; статичны и SHA идентичны. Pixels show shifted text block in stated transform; no clipping observed. |
| `offset-stretch-phases` | startTime/inPoint 1.2 s, stretch 150%, no time-remap; stretch — typed gap, не разрешение на raw обход; проверить фазы | 1.2 entry, 2.2 hold, 3.2 exit | Three exports pending. Position read-backs at all three times match linear animation. |
| `accents-descenders` | Точный текст `ÁÉÍÓÚ ЙЁ\nagjpqy`, font 72, центр; проверить глифы, descenders, clipping и баланс полей | 1 hold | One PNG viewed; wrong acute Latin glyphs with inherited `LugaBookAd-Book`, source exact (CR). Explicit Arial typed correction + fresh affected capture pending. |
| `font-difference` | Синтетический текст; exact unique unavailable PostScript name, durable update step + pre-read; проверка только по authoritative outcome, meaningful font metadata/read-back и фактическому кадру | 1 hold | Baseline one PNG viewed/readable. Manifest incomplete from server-added `verifyAfter`/`idempotencyKey`/scope arg normalization mismatch; no setter replay. Normalization guard fix pending. |

## Общие gates и критерии

В каждой сцене записать exact comp/layer IDs и ID/name/index mapping до мутаций, revision и исходные свойства. Сохранить recipe plan, canonical hash, run/step IDs, dry-run и confirmation receipts. После мутаций независимо перечитать цели и проверить revision. Review manifest и hashes помогают связать кадры с операцией, но не заменяют открытие PNG.

У каждого фактического PNG зафиксировать путь, размеры/hash, соответствующие comp/time/frame, просмотр и наблюдения: видимые границы, поля, clipping, иерархия, требуемые фазы. Source Text, font metadata, SourceRect, layer position и stored font сами по себе не доказывают отрисованный результат. Различие requested/stored font само по себе не доказывает подмену. Для unavailable font нужен явный authoritative native отказ; generic error или unknown outcome — incomplete, сначала reconciliation.

Root сверяет receipts/read-backs и фактические PNG; separate source reviewer reviewed code, not the artwork. Требуемые будущие capture count теперь минимум 10 суммарно: pending offset 3, corrected accents 1, post-fix font 1 плюс первые 5 сохранённых. До завершения всех критериев не писать PASS, verified, rendered-font proof или artistic acceptance.

## Результаты

- Save As выполнен root для первого unnamed synthetic проекта: 2026-10-04 17:26:39Z, 8346 bytes, SHA-256 `8bc9e0baab10049118a2a37352121285ae15ee1eee32d9c5d7a3862553d608aa`; native path совпал с целевым, `numItems=0`, revision=1.
- `create_comps` run `c9c09688-c2d0-427f-b389-d0f99c0dcb36`: success; protected checkpoint создан.
- `create_text_layer` + precomp link run `94d3f381-b94c-4948-8b39-f3031e9fe488`: 5 мутаций применены, aggregate `verification_required` из-за semantic failure. Независимые comp reads подтвердили root comp 1, precomp 13, offset 25, accents 37, font 49; текстовые слои 61–64, precomp layer 65.
- Сцена accents нормализовала LF в CR; сохранён результат как failure, повторного submit не было.
- Commit `f913a7b499f68e1ba059782d70b326b0f253dbd0` activated in bridge PID 25472, source SHA-256 `4e99847681e97b251cd15de5167ab32cae09a05379b7e0079923334aa6df5dc3`. Protected static text read-only succeeds with 0 keys / expression false / intrinsic `collapseTransformation=true`.
- Typed 4-mutation run `75a40aed…` returned applied with `verification_required` / `insufficient`; status retained and no replay. Independent position reads at three times match intended linear keyframes.
- Capture runs: scaled `cf304b11…` — manifest complete, 3/3 PNG viewed; identical pixels, text readable/no clipping, shifted as expected from transforms. Accents `b5c87535…` — 1 manifest-complete PNG viewed; wrong acute Latin glyphs under inherited `LugaBookAd-Book`; source is exact CR. Explicit supported Arial typed correction and affected-root recapture remain pending. Font baseline `83473005…` — 1 PNG viewed/readable; original manifest's safety-argument normalization mismatch has a scoped server repair now accepted offline. Baseline evidence is now offline-complete without mutation; native rendered-font evidence remains false. No setter retry.
- Total actual exported/viewed: 5/5. Pixel-measurement script/report: `.codex-runtime/text-live-20261004/measure_phase1_bounds.py` and `phase1-png-measurements.json`; report SHA-256 `1676e1d4fbcc438ca67e2a0a76161c2adb27ef5747c93dae271d31f332f0136b`. Exact five PNG hashes and pixel bounds are in the report.
- Bounds are RGB max-channel difference against explicit background `(10,13,20)`, thresholds 2/8/32, anti-alias pixels included; bbox at threshold 8 in 1920×1080: scaled three `[845,561,1169,591)` (margins 845/561/751/489); accents `[780,481,1138,660)` (780/481/782/420); font baseline `[554,489,1366,554)` (554/489/554/526). Threshold sensitivity is recorded per threshold. These bounds do not establish glyph identity, rendered font/substitution, canonical freshness or artistic acceptance; native SourceRect was not used as a pixel oracle.
- Initial text-read repair commit `f913a7b` is active; follow-up manifest normalization repair accepted offline by independent reviewer: 29 assertions including 20 negative cases, node/file writes 0 and live calls 0. Stable SHA prefixes: manifest `7a68e059…`, smoke `f87ea848…`, recipe `e9d7866…`. Actual records and all 5 PNG remain unchanged. Font-baseline manifest is offline-complete with no writes, while native `fontRenderingVerified` remains false. The original MCP blocker and initial `verification_required` outcome remain historical evidence.
- Code reviewer ACCEPT six source/test/recipe files on 31 assertions; live calls 0 / filesystem writes 0 in review. Common getter legacy caveat remains nonblocking: default false for non-text layers; collapsed precomp routes still rejected.
- Rules PASS. Root keeps AE paused pending next scoped step. Pending: typed Arial correction/read-back for comp/layer 37/63, affected recapture/view; offset case captures; explicit missing-font request review at 49/64. Any RawFontObject observation must use the separately protected gate, scoped to one request; do not set global font preferences or inspect/install/list fonts or font locations. Total task remains IN PROGRESS; do not blindly replay any prior mutation.
- Runtime evidence dir: `.codex-runtime/text-live-20261004/` (локальная ignored зона); подробные machine-readable receipts и фактические summaries добавляются после операций root.
- План/документ не являются разрешением обойти любые AE gates.
