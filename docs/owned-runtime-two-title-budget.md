# Два титровых задания: конечный бюджет и media reservation

14 октября 2026. Уточнение существующего local-controller профиля для двух
последовательных AME DXV3 HQ-alpha заданий. Это решение о source semantics;
production остаётся CLOSED до приёмки всей реализации, сборки и закрытого M.
`RuntimeFIT` не доказан. Ordinary/synthetic профили с Call32 сохраняются.

## Конечная схема

Рассчитаны 11 отдельных guarded groups: checkpoint1, clean-copy2, stage2,
enqueue2, START2, restoration2. Каждая требует собственных proposal, dry-run
и execute. Checkpoint/copy требуют точных новых private selectors и producers;
новые generic leaves или объединение stage/restoration этим решением не разрешены.
Оригинальный AEP и его RAM-состояние защищены. Копия saved AEP не считается
checkpoint несохранённого состояния; неподдержанное состояние закрывает эффекты.

Базовые Calls59: library/search/build3, panel1, initial bracket/actual project4,
expiry-renew3, pre-enqueue slot2 renew3, root/target comp reads2,
variant/baseline inspections4, source inspections2, queue inspections2,
11 groups×3 и own completion-result calls2. Дополнительно резервируются
восемь eligible work renewals×3 и final renewal3: production Call86.
Это потолок, а не обязанность расходовать все renewals или разрешение продлять
READ/Call/session clocks. Между enqueue и START renew запрещён.

Отдельные layer reads исключены только при достаточном настоящем ответе
`get_comp_details`: поддержанные includeLayers/layerLimit, отсутствие truncation,
все требуемые IDs, identity, enabled, text, font и fontSize. Null/missing/oversize
закрывают manifest. Font-name/size не являются loaded-face proof.

| Бюджет | Потолок / расчёт |
|---|---:|
| Production Calls / Handler rows | 86 |
| Prepared effect scopes | 11 |
| C6/C7 bracket/read issuances | 12 |
| Private completion polls | 10/slot, 20 всего |
| Startup external allocation | 32 |
| Fixed normal external | 104 |
| Poll external | 20×2=40 |
| Normal external | 104+32+40=176 |
| Independent teardown reserve | 16 |
| Total external / stable keys | 192 |
| Conservative Store use / ceiling | 32+176+16=224 / 256 |
| Terminal/media records | 4, category ceiling16 |

Actual startup≤32, dry-run≤1 AE delivery/group, same-origin prefacing association
и соответствие каждой cost row фактическим producer/consumer остаются
обязательными source proofs. Нельзя объявлять fit по одной арифметике,
увеличивать общий `kCallRows` вместо production-specific limits или выводить
PreparedScope count из общего увеличенного Call count. Extra calls, helpers,
effects и новые retries не разрешены; при неполном footprint — CLOSED.

## D49: разрешение media до первого child

Шесть fixed operations: Metadata, Packets, FullDecode, Alpha0, Alpha1, Alpha2.
Каждая запускает ровно один pinned native-created decoder child. Ровно три
distinct frame indices и их coverage фиксируются в own slot manifest;
generic helper с произвольными восемью samples сюда не переносится.
Bound30+30+120×4=540 секунд/job должен учитывать EOF/exit внутри этих deadlines.
Весь workflow вместе с ожиданиями/восстановлением ограничен исходной session8h.

D49 получает exact successful own terminal из current poll. До успешного ответа
broker проводит terminal Note и шесть precharge Notes через один shared
Lifetime/Store/floor. Каждый переход сохраняет irreversible attempt/latch,
CAS/head, flush acknowledgement, read-back и fresh floor. Только полный свежий
chain выдаёт own Terminal cap с private MediaReservation. Partial append или
lost ACK сохраняют UNKNOWN и допускают **ноль** child starts. Refund, повторная
reservation и ключи из resettable job/proposal/ordinal запрещены.

Каждый child once проверяет original job/session/source/policy/floor/deadline
и held output. D50 только связывает эту reservation, own successful terminal,
стабильный файл и фактические outcomes исходных children. D50 не выдаёт права
запускать helper. Encoded HQ не создаёт SettingsCap; configuration/exporter-enum
claims остаются false.

## Фактические кадры без дополнительных helper launches

Каждая Alpha operation — заранее закрытый составной effect: original child →
retained RGBA stdout → exact frame/dimension/alpha checks → fixed pure PNG
conversion → bounded immutable no-overwrite preview artifact → hash/identity
read-back. Весь состав входит в исходные operation/once key, SourceM и selectors
**до C1**. Converter, CRC/encoding, byte bounds, шесть output selectors и связь
slot/frame/child/output обязательны. Envelope-only PNG validator не заменяет
CRC/encoding/actual-pixel проверки. Новый process/dependency/AE visual export
или отложенный дополнительный artifact effect не разрешены.

Own accepted media result публикует привязки трёх PNG каждого slot. Parent
фактически просматривает оба набора, сверяя frame/hash/identity. Workspace
image-view — независимый read-only consumer этих готовых артефактов, не native
issuer, grant или дополнительный AE/AME dispatch. Если implementation выделяет
artifact IO в отдельный effect, прежняя algebra неприменима: нужен новый vector
до C1, с `Pmax=floor((40−delta)/4)`, а не бесплатные добавления.

## Restoration и quiescence

Отличать известный outstanding restoration debt от in-flight/UNKNOWN restoration.
Debt явно показывается в status; он не становится `normalIdle=true` по одному
job terminal. Normal renewal требует quiescent jobs/media/children и отсутствие
in-flight/UNKNOWN writes. Для известного debt нужен отдельный debt-aware guard:
own завершённый stage/effect receipt, live preissued exact restoration descriptor,
фактический matching project/source/expected staged state и отсутствие иных
незавершённых операций. Такой READ renewal разрешает только подготовку и
исполнение точного restoration до независимого cleared read-back. Следующий slot
и generic EXEC закрыты, пока debt не снят. Несовпадение или отсутствие proofs —
CLOSED, без маскировки debt как idle или переноса authority.

Independent lifecycle использует original factual disposition без current READ,
media success или обязательного AE dispatch. Он прекращает own observers/IO,
сверяет исходные child outcomes и сохраняет UNKNOWN с ограниченной quiescence.
Пользовательские AE/AME не terminate; restoration failure не объявляется успехом.

## Приёмка

Адресные negatives: ordinary32/33, production86/87, scopes11/12, polls10/11,
startup32/33; все семь partial precharge transitions → children0; seventh child,
foreign file/job/terminal, duplicate/new-object/renew reset, чужой PNG и повтор
Alpha effect; terminal-only/busy/UNKNOWN renew; debt-restricted READ и запрет
следующего EXEC до cleared restoration; actor-absent independent lifecycle.
После полного source STOP — независимое review, relevant offline/native checks,
exact all-role build/source closure и M. Только затем один original production
lifetime и фактическая проверка обоих видео.

Основание: bounded architecture report F66A80C4…0A8B5 и независимое review
арифметики/precharge; root уточнил intrinsic visual effect и debt-aware guard.
Эти уточнения также требуют проверки конкретной source реализации до admission.
