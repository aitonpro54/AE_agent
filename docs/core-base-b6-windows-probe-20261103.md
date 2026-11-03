# B6 — Windows probe в очищенном окружении owner

3 ноября 2026. Исправление воспроизведённого отказа базы перед native mutation.
Исходный commit `ae3f8a0`; цель — продолжение
[доставки и recovery](../plans/core-base-delivery-recovery-20261103.md).

## Проблема и изменение

На отдельном own AEP native inspection приняла comp1/layer13/BASE_A и полный
style proof. После штатной re-adoption получены server-owned build/proposal и
dry-run. Один `run_plan` task2e0d60d4…/proposalc4ec0189… остановился
`host_probe_failed`, run596ad0c4…. Task commands пусты: intent/physical mutation
не создавались, confirmation и запланированный owner fault не выполнялись.
Client освободил lease и завершился exit0. Старый run не повторяется.

У штатного installation owner очищены пользовательские переменные окружения.
Повтор fixed Windows probe в таком же окружении завершился PowerShell
exit4294901760: ошибка инициализатора `System.Management.Automation.Utils`.
Передача только `USERPROFILE`, полученного из native `os.userInfo().homedir`,
позволила тому же query прочитать exact AE21960 и отсутствие endpoints3456/8787.

Изменён один runtime file `core4/runtime/windows-reservation-provider.js`:
перед fixed-query child получает native profile. Пустой, относительный,
содержащий NUL или недоступный profile даёт прежний `host_probe_failed` до spawn.
Профиль не берётся из caller/унаследованного окружения. Остальной allowlist env,
query, timeout4с, bounded decode, process hash, отсутствие fallback и AE gates
сохраняются. Это не новый источник authority или grant.

## Progress

- Исходный срез принят:15checks/330unique cases (87fresh/243exact current-key reuse),
  55boundaries PASS. Все current evidence keys повторно сверены;
  [итоговое evidence](evidence/core-base-b6-probe-source-20261103.json).
- Две новые regression cases подтверждают native profile в очищенном env и
  fail-closed до spawn. Exact baseline bytes дают ожидаемый FAIL; настоящий
  Windows probe после исправления проходит в owner-like env без AE команд.
- Девять checks/212cases, readoption-probe1case и certification30cases
  переиспользованы после точного сравнения keys/commands/log hashes — всего243cases.
  Остальные87cases прошли в последних полных checks. Частичные результаты
  failed batches не включены в PASS.
- Подтверждены test timeout:90с в historical-receipt case и15с в archived
  lifecycle/stop-inode и двух maintenance cases. Только эти cases получили300с/90с;
  assertions сохранены. Отдельные confirmations первых двух cases и полные
  affected checks прошли. Остановки exact test процессов не затронули live Core/AE.
  Runtime timeout4с прежний.
- Кандидат package
  `cdf7338f5761fbfcb8f8a01fcb00a90ff2aea09a4537a675ee354547f8c3f944`,
  distribution`85c3d95a0dc33f6fad7901c6f6b8a70f58b20297b3e66d8eb8cdc13e39d39f63`:
  80runtime/98bundle, официальный builder/verify/dry-run PASS. Runtime delta —
  только windows-reservation-provider.js; CEP/module assets прежние.
- Actual install0. Установленный21a884fa… пока содержит воспроизведённый дефект.
  Native confirmation/fault/mutation/recovery этого B6 не выполнялись.

## Decision Log

- Исправляется подтверждённая причина отказа до submit, без retry старого run,
  ослабления native inspection или обхода reservation provider.
- Путь профиля обнаруживается OS API, в package нет machine/user-specific path.
  Windows отказ остаётся отказом: нет registry/permissions/security изменений.
- Штатное обновление package также синхронизирует MCP entry в проектном
  `.codex/config.toml`. Это пересекает действующее уточнение пользователя об
  отложенной перенастройке MCP/Codex; перед actual install нужна точная развилка
  по этой части scope. Подготовка source, checks и immutable package разрешена.
- Pure config review подтвердил финальный diff: меняется ровно args-line
  существующего Core entry21a884fa…→cdf7338f…. Enabled/timeout/command, остальные
  строки Core и все прочие секции сохраняются. Actual config write0.
- При разрешённой установке нужны новый stop/update IDs, сохранение уже settled
  b25b5fef… и всех B3 архивов, fresh target inspection и новый proposal. Ранее
  полученный pre-submit отказ не превращается в UNKNOWN или successful mutation.

## Validation

- Baseline regression: ожидаемый FAIL; real owner-env repro до правки FAIL,
  с одним native USERPROFILE PASS. После правки real owner-env probe PASS без
  временного wrapper. Все эти probes read-only, AE commands0.
- Syntax изменённых source/test files,55boundaries и git diff --check PASS.
- Closing configured status: прежний owner22188/booted18a535…, CEP connected,
  pending/UNKNOWN/fault0. Descriptor/client/config/adoption/AEP hashes сохранены.
  Receiver21events/prefix15 exact, mutation begin0. Ledger11events/prefix1 exact:
  добавлены evidence/task/build/proposal/engine/checkpoint metadata;
  физических command intents/reservations0. Ledger не объявляется byte-unchanged.
- Полная выбранная матрица15checks PASS, keys/commands/log hashes сверены.
  Full release, deferred closures, fixed-package configured/native acceptance
  и двусторонняя переносимость остаются открытыми.
- Первоначальный незавершённый enable batch и timeout diagnostic не входят в
  PASS. Targeted300s confirmation —1PASS; он не подменяет полный selected check.
- Failed certification/maintenance batches также не входят в PASS. Изменение
  четырёх named test budgets не меняет runtime timeout4с или production gates.
