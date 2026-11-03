# B3c: установка и первое нативное чтение

**Актуально после restart Codex:** configured package327faaac… с первого status
PASS; owner25380/один3457, old31404 absent, та жеAE21960. CEP подключилась сама.
Stale session отказан; explicit current session8fe8b332… → fresh exact-contract
project-inspection того же saved empty test AEP → release generation3 PASS.
Receiver5settled/prefix3 exact, архивы14/52events и8reset records exact;
bindings/origins/adoption/ledger/AEP unchanged, pending/UNKNOWN/fault0.
Install/reset/AE restart/save/mutation0. Ошибки вызова root до submit journal не
меняли; добавлена ровно одна native command с begin/complete.
[Configured evidence](evidence/core-base-b3-configured-20261103.json).

| Сценарий | Итог текущего среза | Граница доказательства |
| --- | --- | --- |
| B1/B2 diagnostics/reconnect | Source и прежние installed read/rejection/96с reconnect PASS | Новый fault injection после restart не повторялся |
| B3 production composition | 721unique cases/42checks/55boundaries PASS | Source/TEMP proof из принятого0cddee2 |
| Idle reset | Native request/archive52events/new session/fresh baseline PASS | AE не перезапускался; отдельное idle evidence |
| UNKNOWN reset | Exact old Node/AE death/archive14events/new session/native baseline PASS | Delivery/late callback wire не наблюдались, исход старой команды неизвестен |
| Прерванный reset | Selected crash-prefix/finisher cases PASS | TEMP/component, не новый native fault сценарий |
| Configured client после restart | Новый package/status/session/read/release PASS | Read-only; mutation authority/continuity не выдаются |

Ограниченная приёмка базы B1/B2/B3 завершена; bounded L0 research уже выполнен.
Recovery принятой mutation, Titles native acceptance, full release и desktop/MSI
round-trip остаются открытыми. Titles/Slideshow на паузе до отдельного scope.
Ни installation, ни settled reset/stop/update/enable не повторять.

Ниже — история до configured proof.

**Предыдущий snapshot:** UNKNOWN reset69facd01… выполнен самим агентом через
existing authenticated panel protocol (одна отправка). Old AE9472/26308 и old
Node19452/30888 exact gone; root штатно перезапустил own AE/new21960 и открыл
тот же saved empty AEP. UNKNOWN14events/638fbd1b… и earlier52event archive/e095…
сохранены побайтно. New session8fe8b332…/receiver34940d50…/3events, explicit ack,
native fresh project baseline/release PASS, baselineRequiredfalse.
[Подробное evidence](evidence/core-base-b3-unknown-reset-20261103.json).
UI/API действия больше не передаются пользователю по его прямому поручению.
Configured MCP всё ещё требует обновления: old thin client5264 прекращён адресно,
auto reconnect не произошёл (Transport closed); требуется scoped app-server restart.
Ни установка, ни settled resets не повторяются. Source suites прежние; остался
configured proof, а также отдельные unproven scopes mutation/full release/portability.

**Дополнение:** native idle reset9b128005… завершён:52events archived exact,
sameAE9472 без restart, новый sessionaeddb9ee…/explicit ack/fresh baseline PASS.
Затем один exact Node fault создал read UNKNOWN с14events/no terminal;
recovered diagnostic owner19452 не открыл execution queue. Отдельный UNKNOWN
reset и fresh configured proof остаются открытыми. Точные сведения —
[idle evidence](evidence/core-base-b3-idle-reset-20261103.json) и
[fault evidence](evidence/core-base-b3-unknown-fault-20261103.json).
Содержание ниже фиксирует исходный момент установки до этих native сценариев.

3 ноября 2026. Source commit `0cddee2b80b16ad80eafa93fd9b1720337b26607`.
Этап установки завершён; приёмка установленного «Начать заново» ещё открыта.
[Проверяемые факты и hashes](evidence/core-base-b3c-installed-20261103.json).

## Установка

Package `327faaac97f8f4c5e17c20dfbf30082b1be242f59be566c72ef7e3d4970f88cd`,
distribution `4975c36a1a53743d378cf2fed85ffd1c89399cf8327dfd5fd43ec1e605a62741`:
80 runtime files и 98 bundle files, official build/write/verify/dry-run PASS.
Actual exact installed runtime/CEP verification и explicit enable PASS.

Штатный stop `49b423d9-7763-433b-808d-0048264ba491` завершён. Original update
`af65ee78-03e7-4c19-8a6b-3783e19879d1` вызван один раз. Диагностическая обёртка
ошибочно прервала helper через 90 секунд до switch-ready. Original intent/lease
сохранены; official pre-ready inspect/finish завершил ту же транзакцию, затем
update-inspect и explicit update-enable прошли. Wrapper budget увеличен до
15 минут; production deadlines не менялись. Повтора apply или ручной очистки нет.
Оба ID теперь settled и не подлежат повтору.

## Нативное наблюдение

Первый standard thin client1576 загрузил новый установленный package с первого
status за11.960с, exit0. Owner15584/birth639292661152752430/
boot16749b0f-6511-4ff1-85ce-11bcf79da644 ready, один listener127.0.0.1:3457.
Собственная CEP закрыта и открыта по одному разу для обновления; новое подключение
произошло автоматически. Кнопка «Начать заново» видима в фактической панели.

Standard client14224: acquire1 → connect → contract → direct project-inspection
→ release PASS, exit0. Command `inspect-2b2e4818-2dba-4b2b-9f6f-bccfa040204c`.
AE9472/birth639292254253597850 прочитал собственный сохранённый пустой AEP
`snapshots/core-base-b3-native-20261103.aep`, 0 items,26.3x87.
AEP8367bytes/SHA8299fd9f… прежний; пользовательские материалы не менялись.
Журнал52settled events/SHAe095765c… с точным прежним prefix50; origins/adoption
и absent ledger сохранены. Lease освобождён, pending/UNKNOWN/fault0.
Перезапусков AE и native mutations0; прежняя adoptionAE26308 не стала authority
для текущего AE9472. Чтение также не выдаёт lifecycle continuity.

## Матрица оставшейся приёмки

| Сценарий | Подтверждено | Осталось |
| --- | --- | --- |
| Production B3 source/composition | 42checks/41batches/721unique cases PASS; boundaries55 | Это source/TEMP, не native reset proof |
| Actual package/update/enable | Exact installed bytes; original interrupted update штатно завершён | Не повторять установку или settled transactions |
| New standard client/CEP/native read | Реальный saved empty project read, durable begin/complete, lease release | Configured MCP proof отдельно |
| Idle «Начать заново» | Кнопка панели видна; исходный52event journal зафиксирован | Actual request, новый owner/session, архив52events без restart AE, explicit session acquire и свежая baseline |
| UNKNOWN и поздний ответ | Production TEMP process/crash cases из source evidence | Собственный held native read, точная смерть прежних Node/AE, original UNKNOWN bytes в архиве, новый сеанс без replay |
| Configured MCP | Старый cached2fb client возвращает owner_unavailable | Restart MCP, затем первый status и свежий session/read/release нового package |

Computer-use дважды отклонил клик до input: точка принадлежит отдельному
CEPHtmlEngine.exe/Chrome Legacy Window, а адресуемое окно — AfterFX.exe.
Свежий inventory отдельной CEP цели не предоставляет; повторный coordinate
клик после activation/refresh также отказал. Запрос сброса не отправлен.
Пользователю отправлен узкий запрос нажать кнопку и подтвердить диалог вручную.
До установления исхода допустимы status/inspection, повтор request запрещён.

После этого продолжить idle/UNKNOWN proof из
[активного checkpoint](../plans/core-base-installed-checkpoint-20261102.md).
Mutation recovery, Titles native acceptance, full release и desktop/MSI
round-trip этим документом не закрываются. Повторный Argon review не требуется.
