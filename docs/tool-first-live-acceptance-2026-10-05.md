# Live lifecycle acceptance — 2026-10-05

Эта запись фиксирует bounded acceptance для lifecycle recipe на After Effects
26.2x49, AE Agent/panel 3.3.0 и bridge 3.3.0. Проверки прошли в отдельном
runtime с lifecycle opt-in; это evidence конкретных запусков.

## Принятые запуски

| Сценарий | Run | Результат |
|---|---|---|
| Кадры и manifest | `9830c7e0-82f6-4125-9adb-c25d3abf5aa2` | 8/8 шагов, 12/12 semantic checks, 4/4 manifest entries; PNG 1920×1080 физически просмотрен root. Это проверка захвата/manifest, не artistic acceptance и не lifecycle operation. |
| State-only recovery | `0e9c4b5f-4ea4-442a-8c10-50f31cc69576` | 1/1, semantic passed, 0 native mutations; exact private phase UUIDs использованы. |
| Empty create | `c0231bb3-1ca8-4d79-9abc-e1c1e4e79537` | 1/1 passed, generation 2. |
| Protected named save | `cd51c067-e898-408a-bee4-910eccf75e32` | 2/2, semantic passed, native revision 55 при `dirty=false`; classifier fix `5345f09` активирован daemon `42676`. |
| Accepted/proxy Save As | `04febdab-7579-4489-b994-5cae9a61b96e` | 1/1 passed, native revision 70 при `dirty=false`, generation 3. |
| Open-back | `d01dc363-a75b-488c-a699-70cadc04a76b` | 1/1 passed, native revision 70 при `dirty=false`, generation 4, `pending=null`. |

Последние две строки сохраняют факт успешных operation runs, но их media/proxy
read-back теперь считается неполным: старый native classifier ошибочно выдавал
folder kind для comp/footage. Они не являются full-media acceptance.

Fixture policy: один accepted item (comp ID 2, layer ID 14, footage ID 1), одна
group; `distinctGroups=true`, `disallowSourceOverlap=true`. Drift после Save As и
Open — 0. Main footage: 320×180, H.264, 30 fps, 2 s; proxy 160×90 с
`useProxy=true`. Диск-снимок source после нового сохранения:
`819eccb57f1c8a081ab3b85e3aa004756f5637dec8e35bae273a8dac634e8874`;
копия: `be8923d44851e5e936c61586872a0d36d691de0a3ca6d9e09e1951010d97bb19`.
SHA-256 исходной текстовой fixture `95cc5cd1f41db05026b1e946144af7f013c47042704d8fb4cbcb5e387635e5b1`
не изменился.

Сохранены все истории запусков. Исходный failed Save As
`d5e50096…` остаётся `failed` / `timed_out_after_submit` / `unknown`;
state-only recovery не переписывает его в успех. Setup-add/select
`018cca…` и initial-save `26d743…` остаются `needs_review` из-за отсутствующего
read-back в исходных запусках. Raw setter `d3cf…` остаётся `needs_review` с
независимым read-back; эти записи не повышались по соседним принятым запускам.

## Границы вывода

- История подтверждает перечисленные fixture runs и их read-back. Она не
  утверждает художественную/текущую визуальную приёмку или универсальное
  покрытие операций.
- После acceptance-запусков root подтвердил постоянную project-env активацию,
  controlled idle restart и отдельную свежую проверку после CLI reload. Исторические
  сведения о PID/config и точный read-back приведены ниже. Для каждой операции
  обязателен свежий `get_project_lifecycle_state`.
- Реализация project PreToolUse guard имеет 36 тестов / 1495 assertions и
  локальный matching включён. Отрицательная canary была исполнена, однако
  техническое доверие `/hooks` остаётся pending. Это не доказывает runtime
  enforcement guard или достижение 100% цели.
- Запись не меняет статус, результат или историю каких-либо run.

## Read-back после штатного CLI reload

По фактическому read-back root, 2026-10-05 15:42 UTC:

```powershell
$env:CEP_PANEL_ENSURE_DAEMON='0'; node scripts/cep-panel-cdp-smoke.js reload
```

Reload выбрал единственную CEP page:
`file:///C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.codex.aemcpbridge/index.html`;
title `AE Agent 3.3.0`, `assetVersion=3.3.0`, badge `online`, status `Connected`.
`panelGeneration` изменился `1791200500749` → `1791214953069`. После reload:
autonomy `true`, lifecycle generation 4, native revision 70 при `dirty=false`,
`pending=null`; остальные lifecycle pins остались без изменений. Computer Use
для reload не использовался (CU=0).

Исторический deployment fact: root подтвердил, что daemon `41328` запустился
с флагом из project config, без private override; сохранены stateDir, policy 3,
generation 4 и `pending=null`, состояние Connected/idle, drift 0. Сведения о
постоянной активации не доказывают hot-reload env для уже подключённого stdio
adapter; перед операцией всё равно требуется свежий state.

## Исправленная live media/proxy приёмка

После `915e46b` producer/validator использует явный ES3 `if` вместо ternary и
проверяет cross-relations. Scoped validation прошла: 103/106 contract cases,
10/7/2 strict AST checks и полный lifecycle group; независимый аудит одобрил
actual payload и отклонил старый folder-only payload. Контекст: After Effects
26.2x49, panel/bridge 3.3.0; daemon `24144`, настроенный opt-in включён,
lifecycle generation 6, `pending=null`, активный созданный source fixture
clean при native revision 85.

| Переход | Run | Action / post-state | Проверенный результат |
|---|---|---|---|
| Новый Save As | `0fc5e30a-bfef-45ba-8b51-fcf71f9fc59d` | `act_cae1…`, revision 2, 1 шаг, non-dry, semantic passed | Source preflight + stage pre/post + final pre/post: 5 complete inventories. |
| Open-back | `ad2cea85-f106-418f-910b-fc0b6b08e6cd` | `act_b610…`, revision 4, 1 шаг, non-dry, semantic passed | Open read-back: 3 complete inventories. |

Совпадающий полный inventory hash для source/stage/final:
`e1c55a5e6c31c955290c8b3a62c5289fd5d33fc4792443c66a8cca23344d6d34`.
Native comp: index 1, ID 2, one layer (ID 14), source Footage ID 1. Footage item:
index 2, ID 1, `kind=footage`, `main.kind=file`, path `owned-main.mp4`,
`missing=false`, `isStill=false`, 320×180, PAR 1, duration 2 s, 30 fps,
`hasVideo=true`, `hasAudio=false`. Proxy во всех восьми наблюдаемых срезах:
`kind=file`, path `owned-proxy.mp4`, `missing=false`, `isStill=false`,
`useProxy=true`.

Исходный AEP: 71436 bytes, SHA-256
`e5cf2e7a540884e51ba815190aae21b85aca89d51c1711ef8785d12801937925` — одинаков
до и после переходов, file identity сохранена. Проверенная копия:
`assets-copy-verified/owned-assets-verified.aep`, 72540 bytes,
SHA-256 `0b41eb11f2f285cb20c206b7d45ee4e4493cf421b6055feccca0305fbcf2c8b9`;
stage hash совпал с финальным, file identities различаются. Policy source/copy
совпадает: один accepted item (comp 2, layer 14, footage 1), одна group,
`distinctGroups=true`, `disallowSourceOverlap=true`; drift 0. Исходная text
fixture сохранила SHA-256 `95cc5cd1f41db05026b1e946144af7f013c47042704d8fb4cbcb5e387635e5b1`.

При этом `inheritedOwnership` отсутствует, `reviewArtifacts={}` и
`sourceLoadEpochs={}`; поэтому эта acceptance не заявляет непустые proof
invalidation. Сохранённая история recovery `0e9c4b5f-4ea4-442a-8c10-50f31cc69576`
остаётся доказательством state-only recovery с нулём native mutations, но не
заменяет full-media evidence новых Save As/Open переходов. Старая failed Save As
история и последующая recovery остаются неизменными.

Причина исходного classifier дефекта соответствует известному ExtendScript
ternary issue; см. [Adobe community bug report](https://community.adobe.com/bug-reports-528/bug-in-extendscript-s-conditional-ternary-operator-1216218).

После полного Open-back отдельно проверен один защищённый отрицательный кейс:
валидный typed `set_layer_transform` для comp item index 1 / expected ID 2 и
layer index 1 / expected ID 14 с `position=[160,94,0]` получил до построения
плана и до исполнения `protected_placeholder_conflict` /
`accepted_transform_conflict`. Action, dry-run и run не создавались. Свежий
state остался clean revision 85, generation 6, `pending=null`, policy revision 3,
drift 0; source file не изменился. Это доказательство только данного protected
placeholder gate; оно не обобщается на все трансформации или `/hooks` enforcement.

Отдельно выявлена CEP current-plan refresh/adoption race в scoped source:
`currentPlanSyncInFlight` означает только GET current-plan refresh, а post/adopt
callback может отбросить автоматическое dry-run continuation. Причина конкретного
first click остаётся unknown; в этом инциденте execution/native command не было.
AGY ведёт scoped refresh fix (`ae-panel-adopt-dry-refresh-20261005-01`); не считать
исправление принятым до нового подтверждения root. Общие unknown-result и no-replay
правила lifecycle остаются независимыми от этого UI race.
