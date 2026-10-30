# Core/CEP: checkpoint перед паузой

31 октября 2026. Пользователь: «закругляемся, завтра доделаешь».
Работа остановлена по этому поручению; новый engineering/live этап не начат.
Текущий чат остаётся coordinator/writer, новый чат не требуется.

## Зафиксированный результат

Branch `codex/ae-agent-core-4.0.0`, source HEAD
`91b85b56f8b4d4e874dd621b7ee7f2f8acaa2bdf`.

| Commit | Завершённый source-блок | Проверка |
| --- | --- | --- |
| `6263abb` | Boot-bound owner recovery, atomic markers, diagnostic mode | 359 selected PASS |
| `5b6cc6c` | Private maintenance stop, durable desired-stop, same-descriptor resume | Общий R3d1/R4 packet329PASS |
| `5039c49` | Bounded idle reconnect панели, truthful states, raw latch preservation | 66component/HTTP; тот же общий329PASS |
| `9ca310f` | Полный installer staging до visible switch, config-last | 100 selected PASS на immutable B1 source export |
| `91b85b5` | Explicit interrupted-resume finish, sealed continuation, NEW-distribution bootstrap | 221 selected PASS поверх B1 |

Это отдельные packets, не сумма уникальных tests. Bounded source reviews ACCEPT,
открытых P1/P2 в завершённых scopes нет. Full release не запускалась.

Последние evidence: `snapshots/core4-lifecycle/20261031/B1/summary.json`
(run`2b123458-1619-42c3-a11b-22ea78a24278`) и `.../A/summary.json`
(run`9a165759-ba42-4b80-8437-1c4f2762b5b0`). Source hashes/evidence keys неизменны
в принятых runs. Перед паузой собственных активных validation/test Node processes
не обнаружено; оба helper завершены. Чужой `.codex-attachments/` сохранён.

## Установленная копия

Installed runtime/config/credentials/CEP не переключались. AE не перезапускался,
проект не сохранялся, новых AE dispatch0. Последние реальные наблюдения около
18:02UTC30октября: manual package`3f9293f76f5dbef30f8919151145e28ebceb8fe796ee4495b9747e18e0ff8c51`,
Core PID5448, AE6492, worker.pending0, physical.pending=null, ledgerFault=false,
unresolved=[], receiver storeClosed/unknown=true, peer disconnected. Это
исторические факты; завтра PID/queue/host/project нужно проверять заново.

Receiver journal оставался16events, SHA256
`4cfe881718e7255829785e57b604304493b319ba6e68d597074a98454e146f45`.
Original UNKNOWN/terminal disposition и fences не очищались/не переигрывались.
Installed/job-lifetime proof и desktop↔MSI round-trip не заявлены.

## Следующий этап без повторного планирования с нуля

1. **Stopped certification, без update.** Valid desired-stop, dead original
   incarnation, settled combined history, exact CAS. Если markers уже отсутствуют,
   новый actor выдаёт собственный stopped certificate. Иначе только recognized
   sealed owner/shutdown provenance и узкий private retirement seam с повторным
   использованием finishReady/finishRecovery guards; не запускать обычный
   createOwnerLifecycle и не публиковать execution owner. Foreign/UNKNOWN/
   corrupt/ambiguous facts сохраняют fence. Не имитировать старого producer.
2. **Owner→owner stopped update и forward recovery.** Один private prepared plan
   и тот же branded lease; permit связывает их object identities, payload hashes,
   stop/certificate/tree, old/new descriptor/transaction и все baseline bytes.
   B1 stages/JSONv2/config-last сохраняются. Mixed switch получает dedicated
   recovery capability; normal plan brand из JSON не восстанавливается, новые
   credentials вместо исходных не генерируются. Rotation завершается atomic
   typed update-stopped barrier/certificate с old/new full-role seals; explicit
   enable отдельно, update не запускает runtime.
3. **Первый переход manual3f92.** Known source profile, свежие root service status,
   exact retained native handle/PID/birth, monotonic receiver closure и settled
   signed history. Один root-controlled verified operator держит install-only
   lease до единственного root service stop, затем сам проверяет death/CAS,
   retire известных legacy markers и добавляет broker gate к тому же lease.
   Plan/lease не сериализуются. Root-stop message не заменяет proof. EOF/unknown
   outcome сохраняет fence; старые одноразовые readoption/retirement scripts
   и transaction`stopped-readopt-Titles-T2-20261030-c47a91e8` не повторять.

После этого — actual own install/MCP/CEP, normal restart/reconnect cycles и
Windows/MSIX owner lifetime. Titles остаётся одним проверочным сценарием.
Node upgrade, broad rollback, AE restart/save/raw/destructive не добавлять
автоматически. Root — sole live/CEP/UI controller; helpers только scoped source/
TEMP, один writer на ресурс. Новые live шаги только после fresh runtime preflight.

Основные планы: [lifecycle](core-cep-lifecycle-20261030.md),
[maintenance](core-cep-r3-maintenance-20261030.md),
[resume finish](core-cep-r3-maintenance-finish-20261030.md),
[staging](core-cep-r3-installer-staging-20261031.md).
