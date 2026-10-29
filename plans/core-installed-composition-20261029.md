# Декларативная устанавливаемая композиция Core

29 октября 2026. Baseline `1eea17d`; продолжение завершённого
[аудита](core-post-reinstall-audit-20261029.md). Цель — устанавливаемый read-only
Core без обязательных рабочих пакетов и plan engine, при сохранении текущего
manual состава и исторической проверки установок.

## Scope

Source/runtime/package/installer и адресные temp-only проверки. Root —
единственный live controller; архитектурный помощник завершил read-only разбор,
одному implementer передан ownership `core4/**`; root ведёт планы/evidence/review.
Изменения production state, owner markers, AE/AEP и повтор прежних команд в
этот source-блок не входят. Полная release-проверка и приёмка второй машины
не выполняются.

## Progress

- [x] Прочитаны актуальные планы, scoped инструкции и история коммитов.
- [x] Configured tools Core4 доступны: status, diagnostics, discovery и contract
  прочитаны через MCP текущего чата. Installed package остаётся f548.
- [x] Зафиксирован live blocker: CEP disconnected, receiver storeClosed=true,
  unknown=true, pending=null, storeFault=false, unresolved=[]; PID25840.
  Журнал содержит восемь событий: исходная UNKNOWN с terminal disposition и
  два complete. Marker receiver создан 09:09:53UTC, текущий MCP — 11:08:28UTC.
  Это признаки оставшегося marker, а не разрешение его удалить.
- [x] Определить минимальный release-specific контракт композиции.
- [x] Новый source verifier проверил actual installed f548 и exact retained
  f548 package; descriptor/journal bytes не изменились, native/install0.
- [x] Убрать обязательные imports/closures/admissions manual titles и engine
  из read-only состава, сохранив server-owned admission и fixed registry.
- [x] Проверить standalone read-only install/start/discovery и переход с fixed
  f548 с сохранением signed disposition, original UNKNOWN и no-replay.
- [x] Выполнить адресные проверки, собрать детерминированные candidates;
  независимое source review ACCEPT, найденный CLI P2 исправлен локально.
- [x] Зафиксировать source milestone, получить одно ограниченное Argon review
  результата и разобрать findings локально без повторного review.
- [x] Final local fixes:75/75scoped +1/1exact-f548PASS на неизменных файлах;
  root пересобрал final distributions и проверил installed signed history.

## Decision Log

- `unknown` в текущем HTTP status означает закрытый store; одного этого Boolean
  недостаточно для вывода о незавершённом native исполнении. Native inspection
  не отправляется при закрытом store. Новый runtime не запускается.
- Старый adopted host PID31452 отличается от фактического AE PID18992.
  Старые resource bindings не принимаются как текущая incarnation.
- Ожидаемые CEP bytes определяются контрактом именно проверяемого release:
  current verifier обязан понимать fixed f548 в historical install path.
  Отсутствующий новый manifest не превращается в разрешённый legacy fallback.
- Hash/manifest сам по себе не выдаёт admission или mutation authority.
  Рабочие пакеты остаются optional, automatic lifecycle unavailable.
- Новый release `format:2` требует hashed `runtime/composition.json`; `format:1`
  проверяется по прежнему fixed контракту двух assets. Выбор формата не зависит
  от наличия файла. До полного release verification и entry-root binding
  stdio-entry импортирует только builtins; исторический entry не исполняется.
- `readonly` и `manual` выбираются при сборке; default остаётся manual.
  Readonly package физически исключает рабочие modules/admissions, plan-engine,
  manual-policy и windows-reservation-provider. Broker работает без authority,
  facade inspection сохраняет прежние owner/ledger/unresolved guards.
- Selected assets получают pins из проверенных artifact/admission bytes;
  policy adapters ограничены двумя существующими контрактами. Unknown/duplicate
  assets, catalog mismatch, отсутствующий manifest и downgrade отвергаются.
- Portable fixed-format1 fixture и temp proof с exact retained f548 package —
  разные доказательства. В обоих случаях credentials/state создаются заново;
  production journal и ключи не копируются. Старые MAC/seals не переписываются.
- Source review первоначальных пяти файлов — ACCEPT. Tiny CLI review обнаружил
  пустой selector, превращавшийся через `||` в manual; заменён на `??` и добавлен
  negative CLI case. Это локальное review, не дополнительное обращение к Argon.
- Единственное Argon result review target `ed747ef` — **go**,3P3.
  [Decision log](../reviews/argon/installed-composition/20261029-composition-result-01/decisions.md):
  F-01 verification сохранена ради fresh lease/standalone historical API;
  F-02 legacy helper hashes и F-03 source guard/status исправлены локально.
  Независимое source review fixes ACCEPT; повторного Argon нет.
- Выбор двух установочных presets не объявляется независимой горячей установкой
  любых рабочих пакетов. Этот последующий пункт intent остаётся открытым.

## Validation

Пока только read-only preflight текущей установки: configured MCP metadata,
discovery/contract; descriptor SHA256
`67202b2e5e75e462eb3631757e035f512a86dc5f78db6af1b17355e84ea4419e`;
receiver journal SHA256
`0354eb5e308336776e85963efb5c940534fb3c2b94ea2d7b53feb9e69e21fb7f`.
Actual AE commands0, install0, state mutations0.

`snapshots/core4-live-proof/XVIII-installed-composition-20261029/`:
`configured-preflight.json` — ответ configured status с реальным покрытием;
`root-legacy-verification.json` — новый verifier против installed format1,
retained packageHash f548 совпал, 60 package files, descriptor/journal unchanged.
Это read-only совместимость verifier; фактический переход на format2 ещё не принят.

### Source/temp milestone

- `implementation/scoped-final.log`: exit0, **73/73 PASS** — recovery19,
  installable23, composition7, manual12, human-window3, routing/boundaries9.
  Runtime bytes окончательные; packager CLI имел hash `f33a4bf…` до исправления
  empty selector. После CLI/test/routing delta этот прогон не переименовывается
  в единый final-closure PASS.
- `implementation/composition-cli-final.log`: final CLI, **7+1 PASS** в двух
  отдельных suites (composition и exact f548). `routing-final.log`:5PASS.
  `boundaries-final.log`:28unitsPASS; `diff-check-final.log`:exit0.
- Portable format1 fixture и exact f548 artifact проверены раздельно. Последний:
  343626bytes, SHA256 `dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8`.
  Temp transition сохраняет signed disposition/original UNKNOWN/no-replay;
  два late ACK не меняют journal, дополнительная UNKNOWN закрывает lane.
  Исходный ENOENT test harness сохранён; исправлен только относительный путь.
- Новый runtime реально запущен в temp installed child: stdio discovery/contract,
  ephemeral HTTP и одна native fake VM inspection. Это **не live AE**.
- Root независимо пересобрал пакеты дважды и сверил каждый file/manifest hash:
  readonly40files — `c14436485c1889e2ff98b0582bded0cff5e96c03be6c448d69ca15202d2578f4`;
  manual59files — `e945f12b5ac42cf1fb945b5db92f1fd537210c743fd09e952f283c8754b91af0`.
  `coreIdentity` прежний: `c70a07d36c5db55cd9e4683729c52bc3f9d381503bcd83e1d3d67b21b93c9fb7`.
- В `dist/core4/4.0.0-composition-{readonly-c14436485c18,manual-e945f12b5ac4}/`
  сохранены immutable package/distribution и standalone installer closure6.
  Root dry-run обоих exact distributions в temp workspace/env PASS, installRoot
  и config не созданы. Evidence: `root-packages.json`,
  `root-distribution-dry-run.json`, `implementation/implementation-summary.json`.

Production остаётся f548; actual install/native0. Release certification,
manual AE mutation, automatic lifecycle и round-trip P1–P8 не подтверждаются.

### Final после локального разбора review

Source milestone `ed747ef`, локальные fixes `510d5ca`.
`implementation/review-fixes/results.json`: **75/75 PASS** на неизменной final
closure (19recovery +23installable +9composition +12manual +3human +9routing),
отдельный exact-f5481/1PASS, boundaries28PASS, diff-check exit0.
Root независимо сверил4source/4log hashes, mismatches0; состояние selection
до/после scoped run совпало. Это final selected scope, не full release suite.

Final candidates, каждый дважды пересобран и проверен root по всем file hashes:

| Состав | Files | Package hash | Каталог distribution |
| --- | --- | --- | --- |
| readonly | 40 | `7a46f386447340ea394174ffde1965dd8b96df4ba1afac3b17ab5938385634ab` | `dist/core4/4.0.0-composition-readonly-7a46f3864473/` |
| manual | 59 | `3f9293f76f5dbef30f8919151145e28ebceb8fe796ee4495b9747e18e0ff8c51` | `dist/core4/4.0.0-composition-manual-3f9293f76f5d/` |

Оба standalone installer dry-run в temp workspace/env PASS без installRoot/config
writes. Evidence: `root-packages-after-review.json`,
`root-distribution-dry-run-after-review.json`, `root-installed-after-review.json`.
Последний файл подтверждает actual installed f548 и signed disposition новым
verifier/reader:8events, descriptor/journal unchanged, store не открывался.

Raw response Argon:21914bytes, SHA256
`b34a30cd08d6e945740069d3d3ae23c476242468b021ff13bf081269e7baad31`.
Request/manifest/bundle/response и20byte sections сверены root;1upload/1send/0retries.
Внешний go относится к своему frozen snapshot; final fixes приняты локально.

## Продолжение

**Source/temp этап завершён.** Изменены package/runtime/installer/boundary guard,
validation routing и адресные fixtures/tests; документация состава —
[core-installed-composition](../docs/core-installed-composition.md).
Следующий зависимый блок — безопасное обслуживание текущего receiver ownership,
штатная установка final manual candidate и configured native read; произвольная
горячая установка модулей остаётся отдельным следующим source этапом.

Свежий `configured-final-status.json`: MCP PID25840, installed f548,
storeClosed=true/unknown=true/storeFault=false, peer disconnected,
pending=null/unresolved=[], ledger/ownershipFault отсутствуют. Занятый runtime
и старый marker не обходятся новым stdio/store или replay. Завершённый XVI
INSTALL/f548 не является updater этого нового candidate и не повторяется.
До остановленного/проверенного владельца production не переключается.
Пользовательский AE/AEP, save/reopen/destructive и AME не затронуты.
