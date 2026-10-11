# План: обслуживание принадлежащих runtime и окон

**Статус:** исходники и offline engineering checks завершены; R1 подтверждён. R2 panel proof получен, server adoption заблокирован; R3 aggregate acceptance заблокирована. Live acceptance и M3/M4 не заявляются. Root — единственный live controller.

## Progress

- **R1:** закрыты ровно два owned fixture children; их original native outcome остаётся `UNKNOWN/noReplay`, `nativeExecutionProven=false`. Отдельный never-admitted startup retirement подтвердил PID 35300 через тот же held HANDLE (`WAIT_OBJECT_0`, exit 0, `2026-10-11T13:19:56.496Z`). Исходный unified exec 97441 естественно завершился с exit 0, stdout совпал, sealed completion подтверждён; controller force не применялся. Сохранён immutable historical snapshot подписанного source 71.
- **Successor:** reviewed patch 5 применён к ROOT74. Текущий S1 `d0c414…` исправил owned PID 26540, generation `896f2ae3…`; launch естественно завершился с exit 0 при живом daemon около 13:24, stdio изолирован. Read-back PID/kernel identity/image SHA и четыре protected identities совпал; процесс остался жив, эффектов над ними не было.
- **R2 panel proof:** genuine capture `82227aa8…` не переигрывался после timeout; capture и authorize `a9038ec2…` сверены, HTTP 200. Для original `bcfe` / run `8a14` выпущен sidecar; original остаётся `UNKNOWN/noReplay`, native execution не доказан, исходные journals неизменны. Панель получила два assets и ровно один `Page.reload`; instance `panel-1791726175906-bjjamn5d8u` и current actor совпали. Private immutable public no-args native lookup выполнен один раз успешно: session 32018 завершилась exit 0; original outcome не изменился.
- **Server adoption blocked:** официальный MCP `get_panel_action_result` вернул `retained_admission_actor_or_runtime_changed`; helper-direct `/tools/call` payload не является корректным способом вызова. `bridge.assertRetainedAdmissionCurrent` сравнивает stale `lastPanelInfo` со старым actor против actual current actor. Подключение, которое должно опубликовать новый actor, остаётся закрыто прежним pre-phase issuer mismatch. Полный trusted refresh завершился failed/unknown; original journals не менялись. Root wrapper прошёл Sol/ultra review после четырёх guards, но server read-back не принят.
- **R3:** immutable public no-args `refreshNativeFixtureAbandonments` recipe и wrapper review PASS; live aggregate остаётся заблокирован тем же actor/issuer cycle. R2 panel proof observed, server adoption not accepted.

## Decision Log

- R1 закрывает только exact disposable fixture children; их exit proofs не меняют исходный `UNKNOWN/noReplay` и не доказывают native operation success/admission release.
- Never-admitted startup retirement — отдельная authority для immutable signed source 71, same-held-handle exit, sealed completion original exec 97441 и post-exit inventory. Его startup CAP привязан к PID 35300 и не переносится на successor PID 26540.
- Persistent policy с явной пользовательской авторизацией разрешает обычное обслуживание exact owned fixtures и lifecycle. Startup retirement остаётся отдельной узкой authority. Ни одна ветка не распространяется на primary AE, AME project window, чужие/неизвестные процессы, raw bypass или replay неизвестной отправки.
- R2 sidecar/panel proof не снимает pre-phase issuer gate и не завершает server adoption. `issuer_not_isolated` возник в предыдущем refresh; устранение текущего actor-cycle требует актуального server read-back, а не сверки grant с unrelated proof. Не переписывать proof, issuer или original journals ради обхода ошибки.
- Инженерный milestone исходников и offline suites завершён и может быть зафиксирован без live acceptance. Исполнители: Sol/xhigh — implementation; Sol/ultra — read-only architecture и wrapper review; Sol/high — review; Luna — offline/docs; root — sole controller. Flash/CU не использовались.

## Validation

- Offline PASS: 34 JS, 4 PowerShell, package JSON, rules и diff; supervisor 91 + predecessor 22; startup 28 + date parity 12; panel reload 24. Native stdio-only smoke 1 PASS на own hidden Node/disposable child: child оставался жив до same-held-handle cleanup (`WAIT_OBJECT_0`); это не AE/AME acceptance.
- Live read-backs: PID 35300 startup retirement и sealed exec completion; successor PID 26540 kernel identity/image SHA и четыре protected identities; panel instance/current actor; native lookup session 32018. Все указанные read-backs сохраняют точные scoped outcomes, без primary effects.
- Server `get_panel_action_result` failed с `retained_admission_actor_or_runtime_changed`; полный refresh unknown/failed, исходные journals неизменны. Это server adoption blocker, не подтверждение native execution или release. R2/R3 live acceptance, M3/M4 и общая acceptance остаются blocked/not accepted. Не переигрывать unknown capture/reload/refresh.
