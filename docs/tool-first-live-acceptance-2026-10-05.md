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
- На том историческом checkpoint реализация project PreToolUse guard имела
  36 тестов / 1495 assertions, offline approval и локальный matching, но
  отрицательная canary исполнилась и review/trust ещё ожидался. Последующие
  installer, trust и bounded runtime проверки записаны ниже; предыдущая формулировка
  не описывает текущий статус.
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

CEP current-plan refresh/adoption race исправлена scoped change `50e0c7f`.
`currentPlanSyncInFlight` относится только к GET current-plan refresh; corrected
callback проходит connect/disconnect, late-adopt, reentry, exact canonical pins
и tokenless GET. Причина исходного first click остаётся unknown; historical AGY03
timeout также initially unknown, пока root не сверил exited process/files и
explicit reconcile `released=true`. В incident execution/native command не было;
никакой искусственной lifecycle recovery для него не создавалось. См. проверяемые
acceptance details ниже. Lifecycle unknown-result/no-replay остаётся независимым.

## Принятое CEP refresh/adoption исправление

После initial Flash и двух corrections, а также сверки timeout, Sol/xhigh scoped
validation завершилась 33/33 GREEN; baseline воспроизвёл 3/33 meaningful RED.
Independent `ae_reviewer` вынес APPROVE. Luna подтвердил зарегистрированный
33-case npm smoke, 2 syntax checks, rules, diff и hash checks. Covered cases:
Date constructible, реальные connect/disconnect, late-adopt, reentry, exact
canonical pins и tokenless GET. Commit: `50e0c7f`.

Установленный `cep-panel/panel.js` SHA-256:
`12e9b70e5b249f817ebe11b0571f480f49152b2270f62528f70f3ba0c97d2869`.
Предыдущий файл (SHA `63577…`) сохранён в ignored
`.codex-runtime/tool-first-completion-20261005/cep-refresh-install-backup/panel.js`.
Root CLI reload выполнен штатной командой:

```powershell
$env:CEP_PANEL_ENSURE_DAEMON='0'; node scripts/cep-panel-cdp-smoke.js reload
```

Он подтвердил title/assetVersion
`3.3.0`, `Connected`/`online`, panelGeneration
`1791214953069` → `1791221007898`; autonomy `true`, bridge `24144`, project clean
revision `85`, lifecycle generation `6`, policy revision `3`, drift `0` — без
изменения.

Одна штатная кнопка **Dry** приняла текущий MCP readonly plan: initial action
`act_4030c71932834bc8abe14bf5553df06b` был adopted как
`act_4aa5c67811c74521b33dd1f866a3db70`, revision 6, instance
`585f2dc8-b542-474a-b39d-f10f7f74a3e1`; автоматический run
`e2fbc7e4-31b3-4efb-afe3-80e0fba6621b` завершился `dry_run_passed`
(`dry=true`, `ok`, `executed=0`). Был один клик, без повтора, fake override и CU.
Последующий явный `get_project_info` run
`298ba6e3-bc4f-4c21-b54b-819d47618c76` прошёл 1/1 non-dry/read-only;
`verification=null` (semantic pass не заявляется), manualRun сохранён,
project mutations `0`. Финальные native pins: clean revision 85, lifecycle
generation 6, `pending=null`, protection revision 3, drift 0.

## Project hook: bounded enforcement принят для текущих проверенных путей

Installer и smoke harness исправлены; installer source SHA-256
`8e6cb078bfa5db435509184c1805c5430a275fcf0631084620f9091f8e2de963` прошёл
independent review без замечаний. Полный Windows smoke завершился **48/48**,
включая 1495 pure assertions, 2 положительных и 15 отрицательных AST проверок
(только parse, без исполнения fixture scripts), а также реальные CMD/PowerShell
проверки. Старый command проходит CMD и не проходит PowerShell; новый даёт
ожидаемые deny/no-op/canary результаты в обеих оболочках. Smoke harness SHA-256:
`a5e1641a25de12adbaf1bd317a6b9e4e6ae42fcbfe13c3226302d081e3a09b26`.
Smart quotes отклоняются до записи; missing SystemRoot и Windows path handling
проверены fail-closed. Это локальная Windows проверка, не Desktop acceptance.

Root установил обычным `--install` и проверил `--check`; предыдущая запись
сохранена в ignored `hooks.before-windows-launch.json`. Текущее состояние:
`installed=true`, `matching=true`, установленный и ожидаемый definition hash
`1e6345f23c5fee924da00458ec416c318d9efee6674091b71e00d867af42ed0d`. Hook command
использует абсолютный
`C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe` с
`-NoProfile -NonInteractive -EncodedCommand`; decoded command точно запускает
Node и project handler. Profile, PATH fallback и execution-policy bypass не
используются.

После новой установки bundled CLI `codex.exe 0.160 --no-daemon` сообщил о review
одного изменённого hook (`beforeActive=0`, `Modified since last trusted`). Root
выполнил стандартное `t` только для выбранного project hook по ранее данному
пользовательскому разрешению. `/hooks` затем показал `Installed 1`, `Active 1 [x]`,
`Trusted`, без оставшегося review. Сессия завершилась `/quit`, exit 0,
`01a10d61-7fb9-7302-bbff-e2343cdd1e2d`; model prompt и дополнительное human
confirmation не потребовались. Официальный контракт:
[Codex hook tool coverage](https://learn.chatgpt.com/docs/hooks#tool-coverage).

Сразу после trust definition hash `1e6345f...` отрицательные canary действительно
исполнялись в nested `node_repl` и direct `cua_repl`; эти исторические наблюдения
сохраняются. Отдельная helper canary исполнялась ещё раньше, до trust этого
definition hash. Причина промежуточных passthrough не установлена. Позднее root добавил
временный точный observer matcher `*` и доверил только этот observer; исходный
guard оставался активен. Observer NDJSON файл не появился, поэтому event name и
причину не выводим. Root удалил ровно временную observer entry, сохранив исходную
группу guard. После cleanup повторный `--check` подтвердил
`installed=true`, `matching=true` и исходный definition hash
`1e6345f23c5fee924da00458ec416c318d9efee6674091b71e00d867af42ed0d`.

В итоговой проверке после cleanup root получил ожидаемое pre-execution deny для
запрещённых nested `node_repl`, direct `cua_repl` и shell-canary вызовов. Точные
no-op варианты прошли для nested/direct; shell positive control был обычным
`WriteOutput`. Прошли классифицированный `diagnostics` declaration и
string-control transport case. Вызов без classification/fallback packet и вызов
с неверным primitive получили deny; missing-primitive вариант отдельно не
проверялся. Ещё один otherwise-valid `diagnostics` / `ui_render_inspection`
packet с `Control_L+r` и reload intent был отклонён с требованием Use CLI до
исполнения JS. Synthetic transport controls не доказывают фактический просмотр
изображения или GUI-действие. Ни один отрицательный marker после cleanup не
исполнился. Это bounded M7 acceptance перечисленных путей в текущем Desktop;
универсальная песочница произвольного JS и все 134 индивидуальных tool paths
этим не заявляются.

Отдельный свежий helper context после cleanup подтвердил nested путь: попытка
`AE_TOOL_FIRST_HELPER_CANARY_EXECUTED` была отклонена PreToolUse до REPL execution,
а точный `/* AE_TOOL_FIRST_READONLY_CANARY */ 0;` завершился успешно. Вызовов
reset, GUI или AE не было.

App-server PID `46828` был запущен до review (13:36 +05), использует bundled
`codex.exe 0.160`; точный activation timing, hook flags и причина прежних
исполненных canary остаются неизвестны. Desktop restart не требуется как
следующий шаг этой bounded acceptance и не выполнялся. Более широкие/неизвестные
hook paths требуют отдельного evidence; текущий вывод ограничен перечисленными
проверками.
