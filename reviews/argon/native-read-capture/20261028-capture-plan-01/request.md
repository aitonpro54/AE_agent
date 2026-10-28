# Запрос Argon: единый план native read recovery

Тип: единственный initial plan-review объединённого этапа `native-read-recovery`; review ID `20261028-capture-plan-01`.

## Snapshot и цель

- Repository: AE Agent Core / Core4.
- Base commit: `80cc242fc7bc444d726223b39091bdee56879b37`.
- Target commit: `80cc242fc7bc444d726223b39091bdee56879b37`.
- Dirty status при подготовке: clean.
- Frozen plans: `plans/core-native-read-recovery-design.md` (174 lines) и `plans/core-native-read-capture.md` (115 lines); source SHA-256 приведены в manifest.
- Request SHA-256 и payload SHA-256: см. manifest пакета.

Оцени только unified frozen plan A–D и приведённые allowlisted source excerpts. Это один recovery scope и одно initial plan-review; реализация отсутствует. A собирает доказательство исхода единственной ранее отправленной read-only inspect без повторного JSX. B может применить одноразовую terminal disposition лишь при подтверждённом оригинальном receipt/proof и fixed eligibility. C сохраняет descriptor predecessor через явную transaction lineage. D условно обновляет fixed reader, доставляет historical ACK сохранённого callback и лишь затем допускает новое отдельное read-only чтение. Если A не получает требуемый результат/provenance, B–D остаются закрыты, UNKNOWN/no-replay сохраняются. Нет автоматического result/fix/final review; внешний verdict не является authority.

## Контракт и риски для оценки

Проверь целостность условной цепочки A→B→C→D и fail-closed границы. Capture должен сверять полный actual installed CEP closure (шесть package-owned CEP files плюс один generated `installation.js`, всего семь) с descriptor/package; release-dir hash сам по себе недостаточен. Проверь линию lineage: current descriptor → явно указанный exact transaction → exact `previousDescriptor` bytes, без поиска альтернативных backups и без transaction commit marker. Оцени точные-byte hashes, rotation/rollback, cycle/depth checks, atomicity, CAS/concurrency и durability. Проверь разницу panel MAC и parent/control authorization; private one-use capability не должна превращаться в file-based grant. UNKNOWN/no-replay, old-reader rejection, history-ACK и conditional future native dispatch должны следовать только после нужных proof steps. Source excerpts — статический context, не live evidence.

Учитывай только предоставленные excerpts и frozen plan. Production-sensitive факты обезличены в экспортной копии; исходный plan digest привязывает scope к исходной версии. Не проси фактический descriptor, panel/control tokens, auth/runtime state, journal, raw authenticated transcript, logs, browser state, AEP/assets, личные абсолютные пути или адреса электронной почты.

## Вопросы

1. Достаточно ли provenance для A, включая panel order, original managed child, command/store/channel и correlated cached result; какие минимальные blockers/negative checks надо добавить?
2. Есть ли в A–D путь к evaluator, `/poll`, ACK или новому dispatch до его условного разрешения, либо к promotion/clear любого исходного UNKNOWN?
3. Устойчива ли схема C к циклам, подмене predecessor, точным-byte mismatch, rotation, rollback, transaction-before-switch, CAS drift и partial/torn writes без transaction commit marker?
4. Разделены ли panel MAC, old control authorization и private one-use capability без публичного proof-signing или file grant?
5. Какие минимальные негативные/crash проверки доказывают unchanged UNKNOWN/history, no replay, old-reader rejection, historical ACK correlation и release/CEP closure integrity?
6. Как сформулировать предел MAC/capture proof: possession/authenticated channel не равно подписи After Effects или подтверждённой физической callback settlement?

## Ожидаемый ответ

Верни `go`, `revise` или `stop`, привяжи вывод к target commit, обоим frozen-plan SHA-256 и request SHA-256. Раздели дефекты, предположения и недостающее evidence. Предлагай только минимальные изменения unified plan и bounded negative/crash checks. Результат — единственный plan review до реализации; root локально разберёт findings. Не давай approval на implementation, live/AE действия, установку, внешнюю отправку или изменение authority.

## Privacy и границы

Classification: `INTERNAL` source excerpts; `PRODUCTION-SENSITIVE` operational evidence сведено к описанию. Внешняя копия capture plan заменяет исходный command UUID, installed package digest и receiver-journal digest placeholders. Исключены actual descriptor/config, credentials/tokens, auth/browser/runtime state, journal/log files/raw transcript, user assets, personal paths and emails. Source excerpts retain repository-relative provenance and exact line ranges; the manifest records SHA-256 of complete source files.
