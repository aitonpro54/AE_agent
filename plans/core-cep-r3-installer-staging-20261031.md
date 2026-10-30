# R3d2b1: полный staging перед installer switch

31 октября 2026. Baseline `5039c49`. Узкий source-блок подготовки
[штатного update](core-cep-r3-maintenance-20261030.md), параллельно отдельному
[maintenance finish](core-cep-r3-maintenance-finish-20261030.md).

Root владеет только `tools/install-core4.js`, соответствующими installer tests и
этой заметкой. R3d2a writer владеет runtime/lease/recovery bootstrap. До общего
source freeze package snapshots не считаются финальным validation evidence.

## Scope и решение

- Same-volume preflight между installRoot и CEP выполняется до writes; config
  stage остаётся adjacent target. Unsupported placement получает ранний отказ.
- CEP полностью строится/fsync/read-back в известном transaction staging path,
  затем публикуется directory rename. Descriptor/client/config stages полностью
  готовы до первой замены действующего CEP/descriptor/config.
- Existing transaction JSONv2, prepared plan brand/digests, shared lease,
  historical lineage/rollback schema и config-last порядок сохраняются.
- Собственные staging files связываются с exact bytes и retained identity;
  допускаются в последнем baseline CAS только как private installer-owned state.
  Чужие `.next`/rollback/stage paths и drift дают отказ, а не overwrite.
- При ошибке partial stages сохраняются вместе с lease/evidence. Этот блок ещё
  не разрешает update поверх maintenance и не выдаёт recovery permit для mixed
  switch. Эти действия относятся к следующему R3d2b2.

## Progress

- [x] Ownership согласован с R3d2a writer; package tests ждут общего freeze.
- [x] Реализация staging и9failure/ordering tests PASS; существующий install/CAS/
  rollback case1PASS. Это development evidence, не final combined closure.
- [x] Bounded source review ACCEPT, открытых P1/P2 нет.
- [x] Independent frozen selected100/100PASS и milestone note для commit.
- [ ] Взаимодействие с R3d2a проверяется его следующим selected packet.

## Decision Log

Публичные CEP files не записываются по одному после удаления прежнего каталога.
Полный staging делает visible phases однозначными для следующего recovery route.
Это изменение собственной установки, без AE/AEP/project authority или native sends.

## Validation

9staging tests PASS10477ms: полные stages до первого rename, config-last,
четыре short writes с сохранением действующих bytes, две подмены client stage,
сохранение чужого staging-каталога и cross-volume refusal до writes.
Existing package/CAS/rollback1PASS2564ms. Cross-volume case использует synthetic
stat.dev; actual multi-volume acceptance не заявлена. Windows native directory/
file rename с retained read FD прошёл в TEMP. No AE/native/installed operations.

Frozen installer SHA256`d4a95166c836f55a0489b3c0265ea5382f5b8b16f4e71b7f0b93cca5e059f2f0`,
test`c5d0f18891fb345554b4810f3fdbb0c9202063eec87741ec7a2b0e0db53b2338`.

Финальный B1 packet: `snapshots/core4-lifecycle/20261031/B1/summary.json`,
run`2b123458-1619-42c3-a11b-22ea78a24278`: **100/100PASS**,7checks/7batches,
boundaries39/live0,3changed JS syntax/diff check PASS. Проверки выполнены на
неизменяемом source export `5039c49` плюс три B1 files. `.git`, runtime state и
credentials из установки не копировались; source hashes/evidence keys неизменны.
Это отдельная source closure B1, не WIP closure параллельного R3d2a.

Два старых owner-installation fixture expectations обновлены к ранним guards:
junction получает volume-path refusal, corrupt client stage ловится до публикации
client/config; отсутствие client и прежние config bytes проверены. Test-only review
ACCEPT; third file hash`4e882bc5a66ceb6a7a97c5269b6a32bd78b5121c7a4c192e797d581964280003`.
--resume переиспользовал только exact successful keys, включая native-read19PASS275s.
Installed manual3f92 не менялся, full release не запускалась.
