# Штатное завершение owned runtime: R1

R1 добавляет закрытие двух disposable native fixture children. Исходный daemon,
основной AE, AME, CEP и пользовательские проекты остаются за отдельными gates.
R1 не запускает и не перезапускает приложения. Следующие этапы используют тот же
контракт authority/journal; R1 не меняет runner, daemon и набор runtime hashes.

CLI принимает только `inspect`, `close-once`, `read-back` и три обязательных
селектора. Единственный production profile selector —
`migration-fixture-children-v1`. PID, executable, command, path, process tree и
caller-supplied disposable/force flags не входят в публичный контракт.

```powershell
node scripts/owned-runtime-control.js inspect --profile migration-fixture-children-v1 --run-id <UUID> --stage-id <32hex>
node scripts/owned-runtime-control.js close-once --profile migration-fixture-children-v1 --run-id <UUID> --stage-id <32hex>
node scripts/owned-runtime-control.js read-back --profile migration-fixture-children-v1 --run-id <UUID> --stage-id <32hex>
```

`inspect` проверяет authority, открывает query/sync handle и читает HWND/состояние.
Он не создаёт shutdown journal. Отсутствующий или устаревший provision закрывает
доступ к эффектам. `read-back` читает потреблённый журнал даже после смены daemon
или истечения профиля; `profileFresh:false` не допускает новый эффект.

## Provision и схема

Фиксированный источник authority:
`.codex-runtime/owned-runtime-maintenance/profiles/migration-fixture-children-v1.json`.
Это отдельное доверенное локальное решение оператора после review оригинальных
launch witnesses. Содержимое текущего writable ledger, его producer strings,
plain SHA и inspector сами по себе не дают ownership. CLI не принимает путь
профиля, его hash, credential или обходной executable. Профиль нельзя публиковать
как remote tool evidence. Этот контракт не заявляет защиту от другого процесса
с полномочиями того же локального оператора.

Все поля ниже обязательны; дополнительные поля отказаны `validateProfile`.
Пример задаёт форму, значения в угловых скобках заполняет оператор:

```json
{
  "schema": "ae-agent.owned-runtime-profile.v1",
  "profileId": "migration-fixture-children-v1",
  "generation": "<уникальный nonce поколения>",
  "issuedAt": "<UTC ISO>",
  "expiresAt": "<UTC ISO>",
  "context": {
    "runId": "<UUID>",
    "requestId": "<UUID original transport>",
    "actionId": "act_<32hex>",
    "instanceId": "<UUID original transport>",
    "proposalRevision": 2,
    "payloadHash": "sha256:<64hex>"
  },
  "canonicalBindingSha256": "<hash(context)>",
  "canonicalRecord": {
    "path": "<absolute logs/evidence/plan-runs/runId.json>",
    "rawSha256": "<SHA256 всех bytes файла>",
    "envelopeSha256": "<record envelope.sha256>"
  },
  "daemon": {
    "identity": "<Identity object ниже>",
    "startedAt": "<exact /dev/status.startedAt>",
    "loadedRuntimeSha256": "<humanGuardRuntime.sourceSha256>",
    "port": 3456,
    "credentialSha256": "<SHA256 private AE_BRIDGE_TOKEN, без самого token>"
  },
  "protected": ["<daemon Identity>", "<primary AE Identity>", "<AME/прочие защищённые Identity>"],
  "protectedInventorySha256": "<hash(protected)>",
  "stages": ["<capture Stage object>", "<stage Stage object>"],
  "policy": {
    "disposableFixture": true,
    "allowForce": true,
    "gracefulDeadlineMs": 5000,
    "forceDeadlineMs": 5000
  }
}
```

`Identity` имеет ровно `pid` (positive int32), `birthFileTime` (decimal string
FILETIME), `birthUtc` (UTC с **семью** дробными цифрами), `imagePath` (полный
Windows path), `executableSha256` (64 lowercase hex). FILETIME и UTC должны
представлять одно и то же значение 100 ns; миллисекунды не являются birth pin.
Daemon Identity должен полностью присутствовать в protected. PID всех protected
уникальны; PID обоих stage не совпадают с ними и друг с другом.

`Stage` имеет ровно `stageId`, `role` (`capture`/`stage`), `identity`, `descriptor`,
`pins`. Descriptor — точная оригинальная структура runner:
`nonce,stageId,role,rootPath,pluginPath,pluginSha256,executablePath,executableSha256`.
В `pins` ровно четыре записи: `reservation`, `launch`, `manifest`, `unknown`.
Каждая имеет `path` (absolute), `rawSha256`, `valueSha256`. Для manifest
`valueSha256:null`; для трёх JSON envelopes это оригинальный `envelope.sha256`,
который дополнительно проверяется против digest `value`. Raw SHA считает все
bytes, включая форматирование. Manifest hashes каждого stage проверяются отдельно.

Фиксированные evidence paths:

- `logs/evidence/plan-runs/<runId>.json` — canonical envelope `{schema,sha256,record}`;
- `.codex-runtime/ame-native-fixture-ledger/<stageId>/reservation.json`;
- `.codex-runtime/ame-native-fixture-ledger/<stageId>/launch.json`;
- `.codex-runtime/ame-native-fixture-ledger/<stageId>/unknown.json`;
- `.codex-runtime/ame-native-fixtures/probe-<nonce>/launch.manifest`.

Canonical envelope проверяется целиком, включая `record.runId`, `run.id` и
`run.provenance.actionId/proposalRevision/payloadHash`. Request/instance IDs
оператор сверяет с сохранённым original transport; этих полей в canonical record
нет. Их нельзя достраивать из нового inspector read-back. `canonicalBindingSha256`
и `protectedInventorySha256` вычисляет экспорт `hash` из lifecycle — canonical
JSON с рекурсивной сортировкой object keys. Hash original envelopes использует
существующий ledger digest `JSON.stringify(value)`; это разные представления.

Credentials читаются только из фиксированного repo `.codex/config.toml`, секции
`[mcp_servers."after-effects".env]`: automation `AE_BRIDGE_TOKEN` и отдельный
`AE_BRIDGE_PANEL_TOKEN`. Ограниченный parser допускает однострочные double-quoted
TOML basic strings с общими JSON escapes, отказывает duplicate keys/sections,
multiline/unsupported values и совпадение двух tokens. Host фиксирован
`127.0.0.1`, port `3456`; заданные в секции host/port обязаны совпадать. Если
задан `AE_BRIDGE_LOG_DIR`, он обязан разрешаться в repo `logs`. Другие секции
не являются credential source. Token не попадает в profile, stdout или docs.
Profile содержит automation fingerprint и port; environment/CLI/global config
fallback отсутствует. Оператор отдельно проверяет
свежий полный protected inventory и оригинальные witnesses перед provision.
Файлы и все ancestors обязаны быть обычными contained путями без symlink/junction;
hard links отказаны. Load копирует/freeze JSON и сохраняет source identity/hash;
каждая async граница повторно проверяет их.

## Native эффект и журнал

Backend использует единственный одобренный portable PS7.6.5 `pwsh.exe`, pinned
в `owned-runtime-win32.POLICY` вместе с SHA fixed helper. `-File` получает
фиксированный helper, structured NDJSON идёт через stdin; shell-built commands,
PS5 fallback и ExecutionPolicy bypass отсутствуют.

OpenProcess открывает QUERY_LIMITED_INFORMATION/SYNCHRONIZE и, для close,
TERMINATE. Тот же handle удерживается через identity checks, EnumWindows,
WM_CLOSE, TerminateProcess и WaitForSingleObject. Image path/SHA и lossless birth
сверяются с trusted witness; image file удерживается без разрешения записи.
Выбор окна использует PID ownership, без title, broadcast и dialog clicks.
Ноль или несколько HWND — явное graceful unavailable. Ошибка OS/API/auth/access
прекращает operation и не переводится в force.

Native helper непосредственно перед каждым эффектом перечитывает профиль,
source file identity, expiry, witness bytes, protected identities и authenticated
original-daemon status/registration. На время send профиль и witness files
удерживаются Share.Read handles. Fixed credential config также перечитывается,
проходит тот же strict parser и fingerprint check и удерживается Share.Read
handle на время эффекта; parse/auth refusal не допускает force. Истечение
проверяется ещё в C# перед API.
Legacy bootstrap допускается только для явного terminal `stage:"verified"`
при отсутствующем `busy`; running/pending/unknown отказаны. Это узкая проекция
старого status, она **не** является общим daemon drain или authority на primary AE.

Журнал лежит в `.codex-runtime/owned-runtime-maintenance/journal/<runId>/<stageId>`.
Exclusive mkdir и fsynced `intent.json` предшествуют эффектам. Отдельные
`graceful-intent`/`force-intent` потребляются до единственной отправки; результаты
пишутся отдельными immutable envelopes. Любой existing/partial directory,
неизвестная отправка или timeout блокирует следующую `close-once`, в том числе
из нового factory/process. Журнал нельзя удалять или переписывать для retry.

Persistent policy допускает один force только после graceful deadline или true
unavailable, только для доверенного disposable fixture. Force использует
TerminateProcess с тем же handle. Успех PostMessage/TerminateProcess означает
лишь отправку; фактический exit подтверждает `WAIT_OBJECT_0`. Exit code 259
допустим для signaled handle. PID absence/reuse и незавершённое ожидание не дают
exit proof.

Положительный wait/inspect результат сохраняется синхронно до следующей async
проверки authority. Если эта проверка отказывает после intent, immutable result
сохраняет фактический `shutdownExitProven:true` и прежний shutdown proof вместе
с `followupRefused:true` и code отказа. Отзыв policy блокирует будущие эффекты,
не отменяя уже наблюдённый exit; timeout по-прежнему не создаёт proof и остаётся
consumed без force/retry после отзыва.

`ae-agent.owned-runtime-shutdown-handle-result.v1` — собственное свидетельство
закрытия. Оно не заменяет **original launch observer** retirement proof.
`shutdownExitProven` не означает success старой native mutation, replay,
guard/admission release или разрешение остановить original daemon. UNKNOWN
старого run сохраняется. `inspector.processExited` относится к retirement audit
и может оставаться false после реального original observer proof. Следующий этап
проверяет обе оригинальные proofs отдельно до daemon restart.

## Встраивание и проверки

Private factory `createOwnedRuntimeLifecycle({repoRoot,journalRoot,
loadTrustedProfile,checkOriginalRegistration,native,now})` возвращает `run` для
закрытой selector schema. Loader возвращает
`{profile,profilePath,profileRawSha256,assertUnchanged}`. Registration adapter
возвращает `registered,originalDaemonVerified,idle,generation,
canonicalBindingSha256,protectedInventorySha256`; это не launch ownership.
`checkWitnesses`/`writeJournal` overrides предусмотрены только для trusted
private harness/integration, не для публичных tool args.

Shared exports: `validateProfile`, `pinFiles`, `selector`, `binding`, `canonical`,
`hash`, `freeze`, `journalDirectory`, `readJournal`, `writeJournalOnce`,
`exitProof`, schemas/outcome. Native factory `createWin32Backend().open` возвращает
`inspect/graceful/force/wait/dispose` одного held session; `authority` — private
native lease из loader. CLI экспортирует fixed `loadTrustedProfile`,
`checkOriginalRegistration` и private trusted JS helpers `credential(profile)` /
`request(profile,route,body)` для общего authenticated transport. Transport
проверяет automation fingerprint и fixed endpoint; сам по себе не даёт ownership
или admission. `credentialFingerprint()` без profile возвращает только SHA256
automation token из fixed config для operator provision; `parseCredentialConfig`
экспортирован для scoped regression harness. Эти helpers не являются публичными
MCP tools/CLI commands. Native session напрямую не публикуется в MCP/CLI.

```powershell
node scripts/owned-runtime-lifecycle-smoke.js
node scripts/owned-runtime-win32-smoke.js
npm.cmd run check:rules
```

Offline smoke проверяет contract refusals, async invalidation, journal failure,
partial/unknown/duplicate, concurrent factories и strict credential parser.
Native smoke проверяет тот же parser по fixed helper AST и запускает только
собственные hidden synthetic PS processes/windows: graceful, stubborn single
force, no-window, code 259, protected/birth refusal, native lease revocation и
inspect-only refusal, credential revocation перед graceful и parser refusal
перед force после timeout. Собственный synthetic nonce root имеет фиксированный
`.codex/config.toml` с придуманными credentials; production config тесты не меняют.
Synthetic profile существует в отдельном nonce root и
не является production authority. Test children самоистекают; cleanup ждёт их
закрытия и удаляет только проверенный exact собственный temporary root после
завершённого теста. Synthetic результат не доказывает живую AE migration,
original daemon registration или original observer proofs.

Нормативные API: [PostMessageW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew),
[TerminateProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess),
[WaitForSingleObject](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject).
