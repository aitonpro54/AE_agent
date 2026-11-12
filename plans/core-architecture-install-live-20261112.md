# Core 4.2.6: установка архитектурного пакета и live AE

12 ноября 2026. Продолжение завершённого source-плана
[A → B → C](core-architecture-implementation-20261112.md), commit `1f837b3`.
Поручение пользователя: «добивай установку и live ae».

## Этапы

1. I — штатный stopped update текущей desktop-установки с сохранением состава,
   identities, истории, preferences и соседней конфигурации. Проверить release,
   CEP, effective configured client и одно свежее native-чтение; освободить lease.
   Завершить отдельным коммитом.
2. II — адресная live-приёмка на собственной цели: актуальные contracts,
   inspection, proposal/dry-run, точное нативное подтверждение, исходная квитанция
   и свежий read-back. Для визуального изменения проверить фактический кадр.
   Сохранение/экспорт учитывать отдельными результатами. Завершить отдельным
   коммитом, указав фактические границы приёмки.

## Progress

- Исходный read-only `core_status`: DESKTOP-32974QF,
  `installation-81a5d9e6-9ecf-4fbd-a33f-5ceb3d772f56`,
  `operator-render-jobs/owner`, Core 4.2.6, package
  `6cea11091208c73dab7ca40e763623f50dadeb537967bef267c93815010791a9`.
  CEP `file://` connected, registry ready; holder отсутствует,
  pending/UNKNOWN/fault отсутствуют. Это наблюдение до обновления.
- I передан `ae_implementer` (Sol High): единственный installation writer и
  live-controller до явной передачи обратно. Read-only runbook собирает
  `ae_scout` (Luna High). Координатор ведёт этот план и milestone-коммиты.
- **I завершён.** Stop `37539102-1019-4f08-8825-ca0c93ccb6c0`, stopped update
  `90a876b9-32d2-4c96-b2d9-ee1725d7a779` и enable выполнены по одному разу.
  Установлены package `950d180c…` и 164 runtime files, CEP8 сверены.
  Descriptor SHA `79266cc306d9a080a94d0d1007c26e23b55f1398d640b0dfcbc9f8f6f2e3903b`.
  Installation ID сохранён; config изменён штатно только на новый package path.
- Панель переоткрыта коротким root UI-блоком в прежнем AE16072, без restart.
  Fresh standard stdio client из effective project MCP config получил
  authenticated `file://`, panelBuild `574cffbc…`, registry `f58832f…` и
  native inspection `inspect-3f069492-0b8f-4665-862e-fb6db9364dbd`.
  AE26.3x87: пустой несохранённый проект, dirty=false, items0. Lease освобождён,
  holder/pending отсутствуют, UNKNOWN/fault0. Управление возвращено root.

## Decision Log

- Состав сохраняется: проверенный candidate `operator-render-jobs/owner`,
  package `950d180c11eaead6c5dcf6c371225ef47af5ff77ee16e84dc5202f1775c9ef80`,
  standalone distribution
  `799b23e38839bc53a16ae003c63b5289c79d448de11cfb3a2ea2053e330d2420`.
  Source-приёмка 82 keys / 1338 Node records и Titles 28 переиспользуется в
  проверенных границах; новый полный source-прогон ради установки не требуется.
- Текущее поручение разрешает установку и live AE. Историческое source-only
  ограничение относится к завершённым A/B/C, а не к этому продолжению.
- Пользовательский AEP защищён: сначала свежее чтение. Не сохранять, закрывать
  или заменять несохранённое состояние ради стенда. Мутации — только через
  текущие runtime gates; UNKNOWN устанавливается по исходному intent/status,
  без слепого повторения. Frozen MSIX incident rebase не возобновляется.
- Исходные dirty `AGENTS.md` и `plans/core-transfer-4.2.5-20261111.md`
  не принадлежат этому engineering-блоку и не входят в коммиты.
- Cached MCP этого чата после обновления вернул `owner_unavailable` при одном
  read-only status. Он не считается обновлённым. Native evidence получено
  свежим штатным клиентом из effective configured binding; этот же поддержанный
  путь доступен для следующего этапа без широкого restart Codex.
- Проверенные P2 AEP — большие пользовательские копии, подходящий минимальный
  исторический B6 файл здесь отсутствует. II начнётся с создания собственного
  простого текстового стенда в подтверждённом пустом чистом AE; пользовательские
  четыре AEP не открываются и не меняются.

## Validation

- Новые результаты установки и live будут записаны отдельно от offline/VM
  source evidence в `docs/evidence/core-architecture-install-live-20261112/`.
- I: [summary](../docs/evidence/core-architecture-install-live-20261112/install/summary.json),
  [hash inventory](../docs/evidence/core-architecture-install-live-20261112/install/artifacts.json),
  [UI observation](../docs/evidence/core-architecture-install-live-20261112/panel-reopen.json).
  Root независимо сверил actual descriptor/package/identity с receipt.
  470 protected files точны сразу после switch; после штатного нового owner —
  469 exact, 78 immutable preferences, четыре AEP и 11 append-only prefixes
  сохранены. Ожидаемые runtime owner files учитываются отдельно.
- Source checks не повторялись; I доказывает установку, running CEP и одно
  live read-only наблюдение. Мутация/кадр/сохранение относятся к II.
