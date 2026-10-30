# R3d: штатный maintenance-stop, resume и обновление

30 октября 2026. Baseline `6263abb4a82cf51c900b6e8be79c7b4490df26f2`.
Продолжение [R3c](core-cep-r3-owner-20261030.md) по
[плану устойчивости](core-cep-lifecycle-20261030.md). Installed manual3f92 ещё
сохраняется. Root остаётся единственным live/CEP/UI controller.

## R3d1: stop/resume без смены descriptor

Первый проверяемый блок — explicit maintenance-stop и explicit resume для тех же
descriptor/package/origin/anchor. Update/key rotation, новая adoption, legacy
retirement и завершение процессов извне относятся к отдельному R3d2.

Admission freeze выполняется синхронно до попытки записи desired-stopped. Stop
считается принятым только после bounded atomic publication/fsync/read-back.
Persist failure сохраняет volatile fence и diagnostics; не откатывает admission
и не разрешает force-close. Принятые операции сохраняют original completion/drain,
новые controller/stateful operations не допускаются. Pending проверяется повторно
перед закрытием. Stop не снимает UNKNOWN или execution markers.

Операции идут через отдельный private IPC router с full-role-derived proof и
собственным MAC domain; exact boot/PID/birth/descriptor/id связывают запрос с
текущим owner. Public OWNER_METHODS/MCP tools не расширяются. Обычного control
credential тонкого клиента недостаточно для maintenance. Локальный operator
проверяет полную installation до trusted imports и не запускает/не убивает Core/AE.

Desired-stopped блокирует owner startup и thin-client autolaunch. Его нельзя
снять TTL, reconnect, новым чатом или обычным acquire. Diagnostic owner можно
остановить при pending0, сохраняя чужие execution markers/history/UNKNOWN.

Explicit resume требует exact descriptor/origins/client/history/stop receipt,
fresh proof завершения прежней process incarnation и отсутствия execution/lifecycle
markers под installation lease. Resume не архивирует execution markers и не
лечит UNKNOWN/legacy store. Stop barrier сохраняется до durable resume completion;
interrupted/contradictory phase facts остаются stopped/fenced. Исторические lease
gates не reclaim; новый private process-bound resume lease заранее связывается с
sealed intent/nonces и exact process birth. Lost reply не вызывает resend.

R3d1 ограничивал pending resume диагностическим отказом. R3d2a теперь даёт explicit
forward finish по original intent и bounded sealed continuation,221selectedPASS;
[границы](core-cep-r3-maintenance-finish-20261030.md). Доказанно completed resume
получает exact dead lease cleanup без повторного RPC/native action. Installed
acceptance и interrupted-stop certification ещё открыты; manual cleanup не нужен
как штатный путь.

Installer дополнительно отказывает при owner/diagnostic/ownerNext/maintenance
records, чтобы новый lifecycle нельзя было обойти старой проверкой лишь Broker
и receiver markers. Разрешённый update permit появится отдельно в R3d2.

## R3d2: следующий блок

Prepared update/rollback permit under lease, key rotation, fresh stopped legacy
migration и новая host adoption с fresh native witness/CAS. Первое переключение
manual3f92 требует нового доказанного stopped перехода; старые exact scripts не
повторяются. AE не перезапускается, AEP не сохраняется, native dispatch не выдаётся
как побочный эффект обслуживания runtime.

Перед installed acceptance также закрыть interrupted stop: durable desired-stop
уже существует, но owner умер до stopped receipt. R3d2a намеренно требует valid
published resume intent и этого случая не решает. Нужен отдельный stopped
certification/retirement путь по exact old boot provenance, fresh death proof и
settled history; receipt нового certifier не объявляется receipt старого процесса.
При unresolved original outcome этот путь сохраняет fence. Возможное совместное
использование retirement guards с update/first legacy migration проверяется в B2.

Bounded read-only inspection определило точки расширения:

- `applyInstall(plan,{lease})` уже принимает borrowed branded lease и сохраняет
  prepared-plan brand/durable digest, baseline CAS, descriptor/client/CEP read-back
  и config switch последним. Permit следующего блока должен связать именно этот
  lease/plan object с exact maintenance и old/new descriptor/transaction hashes.
  Сам installer не получает общего права архивировать markers.
- Owner вход: R3d1 desired-stop/drain/receipt → fresh process-death proof → update
  lease. Generic dual-gate lease до graceful close запрещён: Broker release нужен
  тот же broker-owner.gate. Для first legacy нужен staged branded lease:
  install.lock до exact root stop, broker gate только после fresh death/recheck.
- First legacy вход ограничен доказанно монотонно execution-closed runtime либо
  отдельно доказанным freeze. Текущее `storeClosed=true` ещё сверяется заново;
  один idle snapshot/старый PID/mtime/отсутствие порта этого не заменяют.
- Root stop intent пишется до единственного OS действия с retained process
  handle; receipt связывает exact incarnation/evidence/nonce. Lost result не
  разрешает повтор termination. Старые XIX/Titles one-case scripts не повторяются.
- Под одним lease: full baseline/semantic facts, durable prepared plan, sealed
  transition intent, exact held-file CAS archive с source/archive XOR, обычный
  installer, full new installation/history/archive read-back, durable completion.
  Journal/ledger/origins не переписываются и не переподписываются при rotation;
  historical descriptors/releases проверяются как данные через lineage.
- Desired-stop нельзя удалять до проверенного completion. При rotation нужен
  атомарный sealed barrier transition либо заранее связанное update-and-enable
  завершение под непрерывным lease. Ни промежуток без gate/barrier, ни старый MAC
  как разрешение новому runtime не допускаются.
- Незавершённый visible switch нельзя повторять новым plan/новыми ключами.
  Штатное finish/rollback должно проверять exact сохранённые phase facts и выдавать
  private recovery capability; public JSON rehydration plan brand запрещён.
  Legacy rollback, игнорирующий desired-stop, не включается молча.

Relevant tests: historical exact stdio startup refused на каждой границе switch;
graceful close не блокируется lease; PID reuse/unavailable/drift/foreign marker
refuse; crash после каждого rename/visible switch сохраняет fence на двух boots;
rotation сохраняет original signed UNKNOWN; чужие plan/lease/permit refuse;
Windows preflight не удерживает descriptor FD до election и ловит последующий CAS.

### Проверенный source compatibility profile manual3f92

Read-only чтение установленного кода как данных подтвердило `install.lock wx`
до Broker import/construction/receiver store, повторную проверку descriptor под
gate и exact entry-root guard. После переключения на другой releaseDir старый
entry отказывает; одна ротация keys при том же releaseDir такого свойства не даёт.
Неудачный wx расположен до legacy finally и не удаляет чужой install gate.

Constructor receiver refusal при существующем marker монотонно закрывает store:
reset/reopen отсутствует, append/begin закрыты, все выбранные direct inspection и
manual sends идут через fenced HTTP submit. Historical terminal/completed ACK
проверяет корреляцию без journal append. Это само по себе не доказывает, что
текущий instance именно constructor-refused: перед stop требуются новые реальные
status/CIM/marker/history facts и отсутствие pending. Другие AE actors остаются
outside coverage. Legacy EOF/signals — прежний close, не новый drain contract.

Critical source hashes: stdio-entry
`b756c068a0be8f311d644f38b7b499a94df6fac9972a3f9fc5ccd3e88121ebbf`,
completion-store`c5678e98b6eea7cb0ad7db605b4bd9a5a4f73080bb1e32f60c6a99420e904835`,
http-peer`678aa498eee23498d143017834be0be1f60df10d36de39aad6fec91ba7938757`.
Установленный код не импортировался/не выполнялся в этой инспекции, credentials
не читались/не переносились; runtime authority этим profile не выдаётся.

## Progress

- [x] Read-only inspection seams и bounded архитектурное решение R3d1.
- [x] R3d1 реализация, TEMP/component validation и bounded source review ACCEPT.
- [x] Frozen R3d1/R4 packet329PASS и milestone note для отдельного commit.
- [ ] R3d2 update/adoption/first migration и проверка; R4 source готов отдельно,
  actual CEP/runtime приёмка остаётся в R5.

## Decision Log

- Не добавлять admin methods в OWNER_METHODS: thin stdio публикует этот список
  как MCP tools. Maintenance доступен только отдельному exact operator пути.
- Generic install lease с неатрибутируемым orphan gate не превращается в
  process-death proof. Новая private lease обязан иметь собственный provenance;
  отсутствие такого доказательства остаётся fence.
- Natural owner exit/stop receipt не заменяет fresh OS PID/birth death proof.
- Owner lifecycle уже проверяет maintenance presence до process observation и
  повторно под startup gate. Fixed HTTP election и publish-stop-before-HTTP-close
  исключают кооперативный поздний запуск, прошедший ранний stdio presence check.
- Local operator требует explicit expected package hash и operation ID до первого
  non-builtin import. Hash берётся из проверенного выбранного пакета, а не из
  собственного произвольного descriptor. Full installation проверяется повторно
  trusted verifier; resume повторяет проверку под lease. Это package trust pin,
  не AE grant и не новый пользовательский approval gate.
- Existing zero-dispatch retirement неприменим к текущим16 events: он требует
  единственный origin и absent ledger. Semantic readers R3b обязательны дополнительно
  к старым installer checks по terminal event type: unknown outcome/reservation/
  constraint и противоречивые outcomes не становятся settled при archive.

## Validation

Actual installed stop/update/recovery не выполнялись.

Промежуточные source проверки R3d1:13 isolated maintenance +12 launcher PASS;
5 TEMP operator/IPC PASS; real TEMP owner-runtime21PASS. В installation packet
два старых fixture expectations (closed filecount и sorted HELPERS) исправлены,
targeted3PASS. Partial source review обнаружило P2: receipt/tree metadata не
перепроверялись после process observation await; full metadata/proof CAS исправлен.
Root дополнительно обнаружил pre-spawn desired-stop отказ, оставляющий sticky
launch-attempt latch у того же thin client после resume. Исправлен только
доказанный отказ до spawn; ambiguous launch/auth/timeout не разрешает новый запуск
или автоматический resend. Проверка — stop-barrier spawn0 → explicit resume →
новая явная call тем же клиентом запускает ровно одного owner.
В operator review найден активный HTTP request, удерживающий finally `server.close`;
private reservation cleanup закрывает все свои соединения. Own-machine check
проверяется до probes/writes, чтобы local CIM death proof не применялся к чужому
скопированному machine-local state. Компонентный packet после metadata/client
fixes36/36PASS; финальный component/operator30PASS и compatibility43PASS.

Финальный parent packet — `snapshots/core4-lifecycle/20261030/R3d1/summary.json`,
run `33bf8016-f05b-4cda-80e3-cdda0526f6d8`: **329/329PASS**,22selectedchecks,
21batches, source hashes/evidence keys unchanged. Boundaries39/liveCalls0,
19changed JS syntax и diff check PASS. Review runtime seams, operator/bootstrap,
installer refusal и package closure: ACCEPT после исправлений, без открытых P1/P2.

В первом selected run один старый integration VM fixture не предоставлял
AbortController/актуальный link body панели. Исправлены только fixture capabilities,
проверка AbortSignal и full signed schema; Origin negative assertions сохранены,
bounded rereview ACCEPT. --resume переиспользовал успешные batches только при
точном совпадении checks/evidence keys, включая native-read-recovery19PASS258s.
Raw stdout/selection/source hashes и explicit deferred coverage сохранены в packet.
Full release, installed update, AE restart/save/native dispatch и job proof0.

Owner contract v3 содержит10required runtime JS плюс contract marker; пакет
readonly owner51/manual owner70 files. Старый stdio selector остаётся совместим.
Для existing lifecycle/maintenance records обычный installer отказывает до lease
и под ним; private update permit ещё не реализован. Pending resume без completion
сохраняет fence и остаётся обязательным R3d2 continuation item.

## Handoff предыдущего блока

R3c commit `6263abb` содержит boot/process lifecycle, atomic marker seams,
diagnostic composition и package closure; файлы — `core4/runtime/`, scoped
`core4/core/` и CEP integration seams, component/real-process tests, package/guard
tools и планы. Проверено359selectedPASS,31checks/23batches, boundaries37/live0,
20JS syntax и diff check. Следующий шаг — R3d1 по этому документу. Установленная
копия и AE/AEP не менялись; foreign `.codex-attachments/` сохранён.
