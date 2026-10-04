# Live review текста — 4 октября 2026

Статус: IN PROGRESS. Ограниченная live проверка четырёх synthetic кейсов решения `text-visual-review-plan`; единственный AE/CEP/UI контроллер — root. Source repair принят offline независимым reviewer; активация bridge, exports и визуальная приёмка pending.

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
| `scaled-precomp-text` | Текст `Scaled Text`; font 72, вложенная comp scale [125,85], root precomp layer scale [65,65]; проверить видимый итог и поля | 0 entry, 1 hold, 2.5 exit | Pending; IDs/revision/PNG/просмотр: — |
| `offset-stretch-phases` | startTime/inPoint 1.2 s, stretch 150%, no time-remap; stretch — typed gap, не разрешение на raw обход; проверить фазы | 1.2 entry, 2.2 hold, 3.2 exit | Pending; IDs/revision/PNG/просмотр: — |
| `accents-descenders` | Точный текст `ÁÉÍÓÚ ЙЁ\nagjpqy`, font 72, центр; проверить глифы, descenders, clipping и баланс полей | 1 hold | Pending; IDs/revision/PNG/просмотр: — |
| `font-difference` | Синтетический текст; exact unique unavailable PostScript name, durable update step + pre-read; проверка только по authoritative outcome, meaningful font metadata/read-back и фактическому кадру | 1 hold | Pending; requested/stored/rendered distinction and evidence: — |

## Общие gates и критерии

В каждой сцене записать exact comp/layer IDs и ID/name/index mapping до мутаций, revision и исходные свойства. Сохранить recipe plan, canonical hash, run/step IDs, dry-run и confirmation receipts. После мутаций независимо перечитать цели и проверить revision. Review manifest и hashes помогают связать кадры с операцией, но не заменяют открытие PNG.

У каждого фактического PNG зафиксировать путь, размеры/hash, соответствующие comp/time/frame, просмотр и наблюдения: видимые границы, поля, clipping, иерархия, требуемые фазы. Source Text, font metadata, SourceRect, layer position и stored font сами по себе не доказывают отрисованный результат. Различие requested/stored font само по себе не доказывает подмену. Для unavailable font нужен явный authoritative native отказ; generic error или unknown outcome — incomplete, сначала reconciliation.

Независимый reviewer сверяет receipts, read-backs и фактические восемь PNG read-only; его заключение не подменяет root visual review. До завершения всех критериев не писать PASS, verified, rendered-font proof или artistic acceptance.

## Результаты

- Save As выполнен root для первого unnamed synthetic проекта: 2026-10-04 17:26:39Z, 8346 bytes, SHA-256 `8bc9e0baab10049118a2a37352121285ae15ee1eee32d9c5d7a3862553d608aa`; native path совпал с целевым, `numItems=0`, revision=1.
- `create_comps` run `c9c09688-c2d0-427f-b389-d0f99c0dcb36`: success; protected checkpoint создан.
- `create_text_layer` + precomp link run `94d3f381-b94c-4948-8b39-f3031e9fe488`: 5 мутаций применены, aggregate `verification_required` из-за semantic failure. Независимые comp reads подтвердили root comp 1, precomp 13, offset 25, accents 37, font 49; текстовые слои 61–64, precomp layer 65.
- Сцена accents нормализовала LF в CR; сохранён результат как failure, повторного submit не было.
- Точный protected `get_layer_details` для comp/layer 13/61 и новый builder оба завершились typed read-only ошибкой `Text document not of Box document type`. Диагностика продолжается; production code не менялся. Экспортировано 0 PNG, просмотрено 0; visual и независимое ревью pending.
- Source repair принят offline: plan — 35 VM reads / 0 writes; manifest — 67 negative cases; legacy + syntax + diff PASS. Независимый reviewer ACCEPT: 6 files, 31 assertions, live calls 0, filesystem writes 0. Caveat reviewer: common getter по умолчанию отдаёт `collapseTransformation=false` для non-text layers, как ожидали legacy callers; это не блокер. Collapsed precomp routes остаются отвергнутыми.
- Rules PASS. Bridge activation ещё pending; экспортировано 0 PNG, просмотрено 0; live visual и artistic acceptance pending.
- Текущий статус — blocker / IN PROGRESS, не задача целиком завершена. Нельзя пересылать submit из-за semantic/read-only ошибки; сперва завершить source diagnosis и reconcile.
- Runtime evidence dir: `.codex-runtime/text-live-20261004/` (локальная ignored зона); подробные machine-readable receipts и фактические summaries добавляются после операций root.
- План/документ не являются разрешением обойти любые AE gates.
