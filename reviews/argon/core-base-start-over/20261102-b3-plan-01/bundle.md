# Argon: проверка плана «Начать заново»

review_id: 20261102-b3-plan-01; stage_id: core-base-start-over; type: plan.
base_commit: ad12e125e01b2be89ec7298b32c69a366cc390d2.
Это новый самостоятельный механизм. Одно ревью плана до реализации;
автоматического повторного result/fix/final review нет.

## Цель

В локальной цепочке MCP → единый Node owner → CEP → After Effects пользователь
может прекратить прежние планы, сохранить UNKNOWN как неизвестные исходы и
начать новую работу от свежего состояния AE. Не требуется разгадать каждый
старый UNKNOWN. Нельзя допустить позднее исполнение или replay прежних команд.
Разрешены необходимые тестовые проекты, сохранение работы, restart AE/Core/CEP
и штатная установка. Пользовательские исходники защищаются сохранением/копией.

## Текущее состояние

Есть installation-scoped owner, authenticated thin IPC clients, controller lease,
durable receiver journal, Broker ledger, maintenance stop с HMAC receipts,
native PID/birth observations и fail-closed startup. Панель имеет persistent
physical latch, который после callback loss запрещает повторный evalScript.
reset_task отменяет только queued-unsent; reconcile_task ищет original completion.
Они не реализуют новый сеанс. Сейчас UNKNOWN запрещает восстановить writer.

B1 исправляет передачу известного terminal read rejection, его выбранные source
checks ещё заканчиваются. B2 улучшает ожидание Core; адресные offline checks
пройдены. Оба изменения незакоммичены и не установлены. Фрагменты из dirty
snapshot имеют собственные полные file hashes и line ranges. B3 production
code пока отсутствует. Installed/live/reset proof для B3 отсутствует — это
явный предмет будущей приёмки, а не потерянное evidence ревью плана.

## Кандидат

Приложенный контракт предлагает durable reset intent → freeze/maintenance stop
→ проверку прекращения старого Node/AE исполнения → полный архив прежних
broker/receiver stores и атрибутированных markers → новый подписанный session ID
и чистые stores → fresh project-inspection до новой работы с эффектами.
UNKNOWN в архиве не становится success, cancelled или not-executed. Сброс не
откатывает изменения AEP. Установка, credentials и origins сохраняются.

Нужен штатный механизм Core и кнопка панели. Finisher может быть отдельным
package-owned процессом того же runtime, запущенным owner после durable intent;
он продолжает только тот же reset ID. При необходимости AE restart он показывает
конкретное действие и ждёт, не убивает AE и не уничтожает несохранённую работу.
Обычный idle reset не требует restart AE. Потеря helper/owner должна оставлять
восстановимый закрытый сброс, без ручного удаления locks и без нового replay.
Старый browser latch остаётся под прежним session key; новый dispatcher выбирает
session ID только после проверки MAC и installation/package bindings.

## Вопросы

1. Достаточен ли такой archive/new-session путь, какие конкретные barrier proofs
   нужны для queued-unsent и delivered/UNKNOWN? Проверь поздний poll и callback.
2. Где возможна частичная разблокировка при crash между stop, archive и publish?
   Предложи минимальную forward-only схему и адресные fault cases.
3. Как отозвать старые clients/proposals/grants и browser latch, не подменяя
   UNKNOWN и не выдавая новый session ID за project continuity/AE authority?
4. Какие внешние/shared resource fences нельзя архивировать вместе со своим
   сеансом? Где нужен явный отказ либо сохранение ограничения новой работе?
5. Есть ли меньший безопасный срез в текущей композиции? Сравни с append-only
   abandonment markers в прежних журналах; не предлагай новый transport/framework.
   Дай конечную минимальную матрицу component/integration/installed приёмки.

## Формат ответа и границы

Верни IDs/base и plan/request digests из manifest, перечень прочитанного и
пропущенного, verdict go/revise/stop/insufficient-evidence. На finding: ID,
P0–P3, сценарий, конкретный path:line или отмеченная гипотеза, уверенность и
минимальная локальная проверка. Отдели дефект от упрощения и отсутствующего
live evidence. Не угадывай непереданные функции и не требуй полного нового
аудита/повторного Argon review после локальных fixes.

Не возвращаться к Titles/Slideshow, SDK, другому transport, общему project
lifecycle detector, AI providers или двухмашинной приёмке. Review не выдаёт
runtime authority. Рекомендации проверяются владельцем локально.

Данные: INTERNAL source/план, PUBLIC архитектурные понятия. Личные пути,
учётные записи, credentials, runtime state, пользовательские AEP/assets и полные
логи исключены. Ограничения intentional: фрагменты кода и план, без full code
audit, live наблюдений и future implementation. Состав и размеры — в manifest.


# Точный контракт B3

# B3: прекращение прежней работы и новый сеанс

Контракт до production write, 2 ноября 2026. Root — единственный writer и
live-controller. Реализация идёт в существующей installation-scoped композиции;
новый транспорт, Titles compiler и automatic project lifecycle не добавляются.

## Механизм

1. Явная команда «Начать заново» создаёт один durable reset intent с server-owned
   UUID, installation/package/descriptor bindings и точной identity прежнего owner.
   Повтор status/continue относится к тому же UUID. После intent admission заморожен;
   штатный maintenance stop закрывает owner после завершения его принятых callbacks.
   Ни планы, ни физические команды не переотправляются.
2. Finisher имеет полный installation-контекст и проверяет точную смерть прежнего
   Node owner, свободный endpoint и неизменность своего intent. При незавершённой
   или неизвестной физической работе он дополнительно требует прекращения всех
   процессов AE, наблюдавшихся при начале сброса. PID без birth не является proof.
   Если прежнее исполнение уже доказанно прекратилось, restart AE не требуется.
   Finisher сам не убивает AE и не закрывает несохранённый проект: показывает
   конкретное необходимое действие. Root защищает работу и выполняет разрешённый
   restart при installed-проверке.
3. После barrier proof и под исключительным файловым допуском finisher сохраняет
   прежние `broker/` и `receiver/` целиком в transaction history, вместе с точными
   runtime/maintenance markers. UNKNOWN остаётся UNKNOWN; manifest отдельно
   обозначает отказ от продолжения прежнего сеанса. Это не success/cancelled,
   не rollback AEP и не ручная очистка locks. Чужие/неатрибутированные markers,
   чужие ресурсы и повреждённые истории не разрешаются по одному имени файла.
4. Новый сеанс получает новый подписанный session ID, новые Broker/receiver
   stores и owner boot/lease. Старые proposals, tasks, ответы и attachment refs
   отсутствуют в исполняемом состоянии. Все прежние bytes и списки неизвестных
   исходов остаются доступны в reset history. Идентичность установки, credentials,
   origins и пользовательские файлы сохраняются.
5. Панель принимает session ID только из authenticated handshake. Её старый latch
   сохраняется под прежним session key; новый dispatcher не восстанавливает и
   не исполняет его. До свежей project-inspection новой работы с эффектами нет.
   Новая adoption после restart не означает continuity или mutation grant.
6. Фазы intent → stopped/barrier → archive → publish → baseline/ready фиксируются
   до перехода. Любое прерывание оставляет admission закрытым. Продолжение сверяет
   тот же intent, каждый источник/архив и уже совершённые rename; не угадывает
   промежуточное состояние и не создаёт второй сброс.

## Срезы и файлы

- B3a: private transaction/inspection module в `core4/runtime/`, собственные
  bounded component tests и selector registration. Без новой кнопки-заглушки.
- B3b: composition/owner entry, authenticated panel control, session key dispatcher,
  source package и штатный operator helper. Изменения packaging проверяются
  вместе с exact runtime closure. До этого installed runtime не менять.
- B3c: защита тестового AEP, штатный package/install, настоящий panel/Core reset и
  свежая configured project-inspection. Старые settled transactions не повторять.

## Адресная приёмка

Очередь до доставки; UNKNOWN и поздний результат; прерывание после каждого
архивирования/публикации; повтор continue того же сброса; чужой PID/birth/marker;
изменённый архив/intent; старый client/proposal/latch; свежая inspection до допуска
эффектов. В component tests допустимы только явно тестовые process observations;
production barriers проверяются штатным native probe без public injection.

Selector выбирается по фактическому diff каждого среза. Успешные exact closures
переиспользуются; full release и двусторонняя portability не объявляются закрытыми.
Статус этого документа: контракт выбран, B3 ещё не реализован и не установлен.


# Ограниченные фрагменты текущего исходного кода

Вне перечисленных ranges код не передан. Никаких live state/credentials.

### core4/runtime/attachment-owner.js

Full file SHA-256: 4ee78b14a71633e93eaa742fdbdaa85d07a9e7e2938006cfd9a642e8bd69fba1. Dirty source snapshot; base ad12e125e01b2be89ec7298b32c69a366cc390d2.

Lines 9-33:

```javascript
9: const CONTROL_METHODS = Object.freeze(['owner_status', 'controller_acquire', 'controller_renew', 'controller_release', 'controller_transfer']);
10: const OWNER_METHODS = Object.freeze([...Object.keys(TOOL_METHODS), ...CONTROL_METHODS]);
11: const LEASE_ERRORS = Object.freeze(['controller_busy', 'controller_fenced', 'controller_lease_identity', 'controller_lease_expired', 'controller_draining', 'controller_client_detached', 'controller_clock_fault', 'controller_operation_pending', 'controller_expected', 'controller_transfer_changed', 'controller_not_expired']);
12: const OWNER_ERRORS = Object.freeze([...LEASE_ERRORS, 'owner_payload', 'owner_recovery_required', 'owner_draining', 'owner_attachment_required', 'owner_lease_token', 'owner_reference_generation', 'owner_attachment_refused', 'owner_closed', 'owner_method', 'owner_controller_required', 'owner_reference_budget', 'owner_observer_physical_access', 'owner_outcome_uncertain', 'owner_unavailable', 'runtime_request_failed']);
13: const OBSERVERS = new Set(['core_status', 'core_diagnostics', 'list_modules', 'get_module_contract', 'get_task']);
14: const READ_REJECTION_CODES = Object.freeze(['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable']);
15: 
16: function createAttachmentOwner({ runtime, activity, invoke, consumeReadRejection = () => null, clock, ttlMs, drainIntervalMs = 100 } = {}) {
17:   if (!runtime || typeof runtime.status !== 'function' || typeof activity !== 'function' || typeof invoke !== 'function' || !Number.isSafeInteger(drainIntervalMs) || drainIntervalMs < 1 || drainIntervalMs > 1000) throw new Error('owner_options');
18:   const lease = createControllerLease({ clock, ttlMs }), sessions = new Map(), accepted = new Set(), timers = new Set(), ownErrors = new WeakSet();
19:   const rejectedReads = new WeakSet();
20:   const refs = { evidence: new Map(), build: new Map(), proposal: new Map(), dryrun: new Map(), task: new Map() };
21:   let closed = false, frozen = false;
22:   function fail(code) { const e = new Error(code); ownErrors.add(e); e.code = code; throw e; }
23:   function object(value, keys) {
24:     if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !keys.includes(k))) fail('owner_payload');
25:   }
26:   function facts() {
27:     try {
28:       const value = activity();
29:       if (!value || ['pending', 'unresolved', 'fault'].some(k => typeof value[k] !== 'boolean')) throw new Error('unobserved');
30:       return { pending: value.pending, unresolved: value.unresolved, fault: value.fault };
31:     } catch { return { pending: true, unresolved: true, fault: true }; }
32:   }
33:   function admitted() { if (frozen) fail('owner_draining'); const value = facts(); if (value.fault || value.unresolved) fail('owner_recovery_required'); if (value.pending) fail('owner_draining'); }
```

Lines 101-145:

```javascript
101:     admitted();
102:     if (!record.grant) fail('owner_controller_required');
103:     if (Object.values(refs).some(values => values.size >= 4096)) fail('owner_reference_budget');
104:     lease.assertCurrent(record.grant); inputs(method, payload, record.grant);
105:     const grant = record.grant, operation = lease.begin(grant); accepted.add(operation);
106:     const context = { observer: false, generation: grant.generation, assertCurrent() { if (closed) fail('owner_closed'); lease.assertCurrent(grant); } };
107:     try {
108:       let result;
109:       try { result = await invoke(TOOL_METHODS[method], payload, context); }
110:       catch (error) {
111:         // Consume even if facts/context prevent classification. Clean facts alone
112:         // never prove completion, and the original grant need not still be live.
113:         let rejection;
114:         try { rejection = consumeReadRejection(error, { method, payload, context }); } catch {}
115:         const value = facts();
116:         if (method === 'inspect_module_target' && READ_REJECTION_CODES.includes(rejection?.code) && !value.pending && !value.unresolved && !value.fault) {
117:           const rejected = new Error(rejection.code); rejected.code = rejection.code; rejectedReads.add(rejected); throw rejected;
118:         }
119:         fail('owner_outcome_uncertain');
120:       }
121:       const value = facts();
122:       if (value.pending || value.unresolved || value.fault) fail('owner_outcome_uncertain');
123:       outputs(method, result, grant); return result;
124:     }
125:     finally { finalize(operation); }
126:   }
127:   async function onRequest(request) {
128:     try { return { ok: true, value: await dispatch(request) }; }
129:     catch (error) {
130:       if (rejectedReads.has(error)) return { ok: false, outcome: 'rejected', code: error.code, nextAction: 'core_diagnostics' };
131:       // Only our own errors and the fixed private lease vocabulary cross IPC.
132:       const code = ownErrors.has(error) || LEASE_ERRORS.includes(error?.code) ? error.code : 'runtime_request_failed';
133:       return code === 'owner_outcome_uncertain' ? { ok: false, code, outcome: 'unknown', requestId: request.requestId || null } : { ok: false, code };
134:     }
135:   }
136:   async function close() {
137:     if (closed) return;
138:     if (accepted.size || facts().pending) fail('owner_draining');
139:     closed = true; for (const session of sessions.keys()) onDetach(session);
140:     for (const timer of timers) clearTimeout(timer);
141:     await runtime.close();
142:   }
143:   return Object.freeze({ onAttach, onDetach, onRequest, status, close, freeze() { frozen = true; }, bootId: lease.status().bootId });
144: }
145: module.exports = { createAttachmentOwner, TOOL_METHODS, OWNER_METHODS, OWNER_ERRORS, READ_REJECTION_CODES };
```

### core4/runtime/stdio-entry.js

Full file SHA-256: e2cd0c2bbf6c0bb772f5563ad694470b33f0370e9d155f41b9d62015233f9127. Dirty source snapshot; base ad12e125e01b2be89ec7298b32c69a366cc390d2.

Lines 174-230:

```javascript
174:   async function exposeOwner(facade, activity, invoke, consumeReadRejection) {
175:     const { createAttachmentOwner, OWNER_METHODS } = require('./attachment-owner.js');
176:     const { createIpcServer } = require('./client-ipc.js');
177:     const { ownerEndpoint } = require('./client-entry.js');
178:     const { PRIVATE_METHODS, createOwnerMaintenance } = require('./owner-maintenance.js');
179:     attachmentOwner = createAttachmentOwner({ runtime: facade, activity, invoke, consumeReadRejection });
180:     const endpoint = ownerEndpoint(installation);
181:     let closed = false, closing, maintenance;
182:     async function closeRuntime() {
183:       if (closed) return; if (closing) return closing;
184:       if (attachmentOwner.status().accepted || activity().pending) fail('owner_draining');
185:       ownerLifecycle.beginClose();
186:       closing = (async () => { await attachmentOwner.close(); await ipc.close(); ownerLifecycle.finishClose(); closed = true; })(); return closing;
187:     }
188:     maintenance = createOwnerMaintenance({ installation, descriptorPath: descriptor, lifecycle: ownerLifecycle, activity,
189:       freeze: attachmentOwner.freeze, accepted: () => attachmentOwner.status().accepted, close: closeRuntime });
190:     const currentStatus = facade.status, currentDiagnostics = facade.diagnostics;
191:     facade.status = () => ({ ...currentStatus(), maintenance: maintenance.status() });
192:     facade.diagnostics = () => ({ ...currentDiagnostics(), maintenance: maintenance.status() });
193:     ipc = createIpcServer({ endpoint, identity: { installationId: installation.installationId, machineId: installation.machineId, packageHash: installation.packageHash },
194:       secret: installation.controlToken, bootId: attachmentOwner.bootId, methods: [...OWNER_METHODS, ...PRIVATE_METHODS],
195:       onAttach: attachmentOwner.onAttach, onDetach: attachmentOwner.onDetach, onRequest: request => {
196:         if (!PRIVATE_METHODS.includes(request.method)) return attachmentOwner.onRequest(request);
197:         try { return { ok: true, value: maintenance.request(request.payload) }; }
198:         catch (e) { return { ok: false, code: ['maintenance_authorization', 'maintenance_in_progress', 'maintenance_persist_failed', 'maintenance_schema', 'maintenance_id'].includes(e.code) ? e.code : 'maintenance_refused' }; }
199:       } });
200:     if (ownerLifecycle.mode === 'active') ownerLifecycle.markReady();
201:     await ipc.listen(); ownerLifecycle.releaseStartup();
202:     return { endpoint, bootId: attachmentOwner.bootId,
203:       async close() {
204:         if (closed) return;
205:         const value = maintenance.requestLocal(); if (value.fault) fail(value.fault);
206:         if (attachmentOwner.status().accepted || activity().pending) fail('owner_draining');
207:         const result = await maintenance.done; if (result.phase !== 'stopped') fail('maintenance_stop_uncertain');
208:       },
209:       status: () => ({ ...facade.status(), attachmentOwner: attachmentOwner.status(), ipc: ipc.status(), maintenance: maintenance.status() }) };
210:   }
211:   if (ownerLifecycle?.mode === 'diagnostic') {
212:     // A fenced boot exposes authenticated observations without constructing a
213:     // Broker or opening an execution store. CEP receives only a static refusal.
214:     reservedServer.on('request', (req, res) => {
215:       req.on('error', () => {}); const origin = req.headers.origin;
216:       if (origin === 'null' || origin === 'file://') res.setHeader('Access-Control-Allow-Origin', origin);
217:       res.writeHead(503, { 'Content-Type': 'application/json', 'Connection': 'close' });
218:       res.on('finish', () => req.socket.destroy()); res.end(JSON.stringify({ error: 'owner_recovery_required' }));
219:     });
220:     const status = () => ({ ready: false, closed: false, pid: process.pid, product: 'AE Agent Core 4.0.0',
221:       installation: { installationId: installation.installationId, machineId: installation.machineId, packageHash: installation.packageHash, nodeVerified: true },
222:       lifecycle: ownerLifecycle.state(), ownershipFault: 'owner_recovery_required', physical: { listening: reservedServer.listening, port: reservedServer.address()?.port || null, inspectionAvailable: false, storeClosed: true, unknown: true, coverage: 'diagnostic-only; execution queue not reopened' }, externalLegacyCoverage: 'unobserved' });
223:     const unavailable = () => ({ available: false, reason: 'owner_recovery_required' });
224:     const facade = { status, diagnostics: status, listModules: unavailable, getContract: unavailable, getTask: unavailable,
225:       close: () => new Promise(resolve => { reservedServer.close(resolve); reservedServer.closeAllConnections(); }) };
226:     return await exposeOwner(facade, () => ({ pending: false, unresolved: true, fault: true }), (method, payload) => facade[method](payload));
227:   }
228:   const { Broker } = require('../core/broker.js');
229:   const { serve } = require('../core/stdio.js');
230:   const { exact, id } = require('../protocol/json.js');
```

Lines 276-310:

```javascript
276:   facade.inspect = async value => {
277:     if (value.contractId !== contractId) return broker.inspect(value);
278:     exact(value, ['moduleId', 'contractId', 'target']);
279:     if (value.moduleId !== profile.id) fail('contract_identity');
280:     let result;
281:     try { result = await peer.inspect(value.target || {}); }
282:     catch (error) {
283:       const rejection = peer.consumeReadRejection(error), context = invocationContext?.getStore();
284:       if (rejection && context && !context.observer && rejection.executorHash === asset.executorHash && rejection.payloadHash === hash(canonical(value.target || {}))) {
285:         completedReadErrors.set(error, { context, moduleId: value.moduleId, contractId, targetHash: rejection.payloadHash, code: rejection.code });
286:       }
287:       throw error;
288:     }
289:     if (result.observation?.readFailureVersion === 1) fail(result.observation.code || 'inspection_failed');
290:     return { evidenceRef: id('observation'), moduleId: profile.id, contractId, ...result, authority: false };
291:   };
292:   facade.build = value => { if (value.contractId === contractId || value.steps?.some(s => s.contractId === contractId)) fail('read_only_module_build_unsupported'); return broker.build(value); };
293:   facade.close = async () => { if (closed) return; closed = true; await peer.close(); await broker.close(); };
294:   try { await peer.listen(); } catch (e) { await facade.close(); throw e; }
295:   if (mode === 'owner') {
296:     const activity = () => {
297:       const physicalState = peer.status();
298:       return { pending: !!(broker.running || broker.reconciling || broker.controllerBusy || broker.controlPending || broker.worker.status().pending || physicalState.pending),
299:         unresolved: !!(broker.ledger.unresolved().length || physicalState.storeClosed || physicalState.unknown),
300:         fault: !!(broker.closed || broker.stateLock.error || broker.ledger.corrupt || physicalState.storeFault) };
301:     };
302:     return await exposeOwner(facade, activity, (method, payload, context) => {
303:       const receiver = Object.hasOwn(facade, method) ? facade : broker;
304:       return invocationContext.run(context, () => { if (!context.observer) context.assertCurrent(); return receiver[method](payload); });
305:     }, (error, request) => {
306:       const record = completedReadErrors.get(error); completedReadErrors.delete(error);
307:       if (!record || request.context !== record.context || request.method !== 'inspect_module_target' || request.payload.moduleId !== record.moduleId || request.payload.contractId !== record.contractId || hash(canonical(request.payload.target || {})) !== record.targetHash) return null;
308:       return { code: record.code };
309:     });
310:   }
```

### core4/runtime/owner-maintenance.js

Full file SHA-256: 0b370cbec8130236d03dd4c3ae2f6d28f9e5b1f3f487c2e340452d0b01168793. Dirty source snapshot; base ad12e125e01b2be89ec7298b32c69a366cc390d2.

Lines 97-129:

```javascript
97: function createOwnerMaintenance({ installation, descriptorPath, lifecycle, freeze, activity, accepted, close, intervalMs = 50 }) {
98:   if (![freeze, activity, accepted, close].every(value => typeof value === 'function') || !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 1000) fail('maintenance_options');
99:   const c = context(installation, descriptorPath), state = lifecycle.state(), scope = { bootId: state.processBootId, pid: state.pid, birthTicks: state.birthTicks };
100:   c.scope(scope); let stop, stopped, fault = null, timer, closing = false, resolveDone;
101:   const done = new Promise(resolve => { resolveDone = resolve; });
102:   function status() { return { requested: !!stop, id: stop?.id || null, phase: stopped ? 'stopped' : fault ? 'fenced' : closing ? 'closing' : stop ? 'draining' : 'running', fault }; }
103:   async function drain() {
104:     timer = undefined; if (!stop || fault || stopped || closing) return;
105:     try {
106:       const pending = activity().pending, count = accepted();
107:       if (typeof pending !== 'boolean' || !Number.isSafeInteger(count) || count < 0) fail('maintenance_activity');
108:       if (count || pending) { timer = setTimeout(drain, intervalMs); return; }
109:       closing = true; await close();
110:       const snap = c.snapshot(true), markers = c.markers(); let settled = true;
111:       try { c.settled(snap); } catch { settled = false; }
112:       stopped = atomic(path.join(c.dir(stop.id), 'stopped.json'), c.seal('maintenance-stopped', { id: stop.id, stopHash: stop.hash, scope, protected: snap.facts, markers, settled }), stop.nonce);
113:       resolveDone(status());
114:     } catch { fault = 'maintenance_stop_uncertain'; resolveDone(status()); }
115:   }
116:   function request(value) {
117:     const id = c.verifyAuthorization(value, scope);
118:     if (stop || fault) { if (stop?.id === id) return status(); fail('maintenance_in_progress'); }
119:     // Freeze is synchronous and is never undone after a persist failure.
120:     freeze();
121:     try {
122:       const baseline = c.snapshot().facts, nonce = crypto.randomUUID(); c.dir(id, true);
123:       const barrier = atomic(c.p.barrier, c.seal('maintenance-stop', { id, scope, protected: baseline, authorizationHash: hash(value), nonce }), nonce);
124:       stop = { id, hash: hash(barrier.bytes), nonce }; timer = setTimeout(drain, 10); return status();
125:     } catch { fault = 'maintenance_persist_failed'; fail(fault); }
126:   }
127:   return Object.freeze({ request, requestLocal: () => stop || fault ? status() : request(c.authorization(scope)), status, done, scope: Object.freeze(scope) });
128: }
129: async function gone(scope) { const o = await observeOwnerProcess(scope.pid); if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: scope.pid, birthTicks: scope.birthTicks }, o))) fail('maintenance_process_not_dead'); }
```

### core4/runtime/owner-lifecycle.js

Full file SHA-256: 29f525aefc8768ef3cc37a87caa0e802afa5da1d31fe2592cef1f613f5da8746. Dirty source snapshot; base ad12e125e01b2be89ec7298b32c69a366cc390d2.

Lines 469-488:

```javascript
469:       beginClose() {
470:         if (!released || shuttingDown) fail('owner_lifecycle_close');
471:         reverify(); if (view(paths.gate).bytes !== null) fail('owner_lifecycle_gate_busy');
472:         gate = durable(paths.gate, seal('startup-gate', { scope: boot, recoveryId: crypto.randomUUID(), readyId: null, takeoverId: null, phase: 'shutdown' })); shuttingDown = true;
473:       },
474:       finishClose() {
475:         if (!shuttingDown) fail('owner_lifecycle_close'); assertView(gate); assertView(published);
476:         let snap, clean = mode === 'diagnostic';
477:         try { snap = historySnapshot(); settled(snap); assertHistory(snap); clean ||= ['brokerOwner', 'brokerGate', 'receiverOwner'].every(name => view(paths[name]).bytes === null); } catch { /* Retain execution owner/fences if history cannot certify a clean stop. */ }
478:         if (clean) {
479:           if (!snap) snap = { values: rawHistories() };
480:           const id = gateBody(gate).recoveryId, dir = transaction(id, true), name = mode === 'active' ? 'owner' : 'diagnostic';
481:           durable(path.join(dir, 'intent.json'), seal('owner-recovery-intent', { id, previousScope: boot, originals: [serial(published, name, true)], protected: PROTECTED.map(n => serial(snap.values[n], n)) }));
482:           finishRecovery(id);
483:         }
484:         releaseGate(); for (const fd of [...held]) { fs.closeSync(fd); held.delete(fd); }
485:       }
486:     });
487:   } catch (error) {
488:     // Failed/ambiguous mutation retains its attributable gate for a future
```

### core4/integrations/cep/http-peer.js

Full file SHA-256: 067e4c789e847940ef5760fd7d5240f8648f011cc81a9cb39a0e8ed34e8b3d16. Dirty source snapshot; base ad12e125e01b2be89ec7298b32c69a366cc390d2.

Lines 25-36:

```javascript
25:   const assets = new Map([asset, ...additionalAssets].map(a => [a.executorHash, a])); let brokerBinding;
26:   const pins = Object.freeze({ packageHash: installation.packageHash, executorHash: asset.executorHash, installationId: installation.installationId });
27:   const commandPins = command => ({ ...pins, executorHash: command.executorHash });
28:   function disconnect(reason) { if (pending) { store.unknown(pending.command.commandId); pending.reject(Object.assign(new Error(reason), { code: reason })); clearTimeout(pending.timer); pending = null; } }
29:   function frame() { return pending && !pending.delivered ? { assetKey: assets.get(pending.command.executorHash).assetKey, phase: pending.command.phase, typedPayload: pending.command.payload, commandId: pending.command.commandId, originalBinding: pending.binding, pins: commandPins(pending.command) } : null; }
30:   function guardDelivery() { admissionGuard(pending.command); pending.deliveryGuard(); }
31:   function deliver() {
32:     if (!activePoll || !frame()) return;
33:     const poll = activePoll; activePoll = null;
34:     try { guardDelivery(); const value = frame(); pending.delivered = true; poll(value); }
35:     catch (e) { disconnect(e.code || 'physical_admission_closed'); poll(null); }
36:   }
```

Lines 87-110:

```javascript
87:       }
88:       if (req.url === '/complete') {
89:         exact(b.payload, ['commandId', 'originalBinding', 'pins', 'result']);
90:         const c = store.get(b.payload.commandId);
91:         // Current-channel MAC/Origin/sequence already passed above. Historical
92:         // pins/result come only from a fixed verified disposition, before the
93:         // normal current-package correlation. No promotion/event/eval occurs.
94:         if (c?.state === 'unknown' && c.terminalDisposition) {
95:           if (canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(c.terminalDisposition.pins) !== canonical(b.payload.pins) || canonical(c.terminalDisposition.result) !== canonical(b.payload.result)) fail('historical_completion_correlation');
96:           signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return;
97:         }
98:         if (!c || canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(b.payload.pins) !== canonical(commandPins(c.command))) fail('completion_correlation');
99:         if (c.state === 'completed') { if (canonical(c.response.result) !== canonical(b.payload.result)) fail('completion_conflict'); signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return; }
100:         if (!pending || c.state !== 'ongoing' || !pending.delivered || pending.command.commandId !== b.payload.commandId) fail('unknown_no_promotion');
101:         const result = b.payload.result;
102:         const selectedAsset = assets.get(c.command.executorHash);
103:         if (result.readFailureVersion === 1) {
104:           exact(result, ['readFailureVersion', 'outcome', 'code']);
105:           if (result.outcome !== 'rejected' || !['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable'].includes(result.code) && !(titlesReadCommand(c.command, selectedAsset) && TITLES_READ_CODES.has(result.code))) fail('inspection_result');
106:         } else if (selectedAsset.resultProfile === 'manual-text-v1') {
107:           if (c.command.phase === 'mutate') {
108:             exact(result, ['outcome', 'snapshot', 'code', 'transactionReceipt']);
109:             if (result.outcome === 'unknown') { disconnect('manual_effect_unknown'); fail('manual_effect_unknown'); }
110:             if (!['applied', 'rejected'].includes(result.outcome)) fail('manual_result');
```

Lines 135-175:

```javascript
135:           done.reject(error);
136:         } else done.resolve(done.broker ? response : { observation: result, originalBinding: c.originalBinding, pins: commandPins(c.command), continuity: false });
137:         return;
138:       }
139:       fail('unknown_peer_route');
140:     } catch (e) { reply(res, e.code === 'frame_too_large' ? 413 : 403, { error: e.code || 'peer_request_failed' }, corsOrigin); }
141:   });
142:   function submit(command, broker = false) {
143:     const selected = assets.get(command.executorHash);
144:     if (!selected || selected.moduleId && (selected.moduleId !== command.moduleId || selected.operationId !== command.operationId) || !['inspect', 'mutate', 'verify'].includes(command.phase) || command.phase !== 'inspect' && selected.resultProfile !== 'manual-text-v1') fail('http_asset_not_admitted');
145:     const deliveryGuard = captureDeliveryGuard(command);
146:     if (typeof deliveryGuard !== 'function') fail('physical_delivery_guard');
147:     admissionGuard(command); deliveryGuard();
148:     if (closed || store.closed) fail('receiver_lane_closed'); if (!peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); if (pending) fail('physical_lane_pending');
149:     const binding = dispatchBinding(command, store.identity); store.begin(command, binding);
150:     return new Promise((resolve, reject) => { pending = { command, binding, deliveryGuard, resolve, reject, broker, delivered: false, timer: setTimeout(() => disconnect('host_callback_timeout'), timeout) }; deliver(); });
151:   }
152:   return Object.freeze({
153:     status,
154:     consumeReadRejection(error) {
155:       const record = completedReadErrors.get(error); completedReadErrors.delete(error); return record || null;
156:     },
157:     identity: hash({ packageHash: installation.packageHash, assets: [...assets.values()] }),
158:     transport: Object.freeze({
159:       async connect(value) { if (store.closed || !peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); exact(value, ['controllerId', 'channelEpoch', 'secret']); brokerBinding = Object.freeze({ ...value }); return { receiverStoreIdentity: store.identity }; },
160:       async send(frame) { if (!brokerBinding) fail('transport_disconnected'); const command = envelope(decode(frame, brokerBinding.secret)); if (command.controllerId !== brokerBinding.controllerId || command.channelEpoch !== brokerBinding.channelEpoch) fail('controller_binding'); return encode(await submit(command, true), brokerBinding.secret); },
161:       async completion(commandId) { if (!brokerBinding) fail('transport_disconnected'); const c = store.get(commandId); return encode({ commandId, state: c?.state || 'unknown', ...(c?.originalBinding ? { originalBinding: c.originalBinding } : {}), ...(c?.response ? { response: c.response } : {}) }, brokerBinding.secret); },
162:       async disconnect() { if (pending) fail('physical_lane_pending'); brokerBinding = undefined; }
163:     }),
164:     async listen() {
165:       if (preboundServer) { if (!server.listening) fail('http_prebound_server'); return status(); }
166:       await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return status();
167:     },
168:     inspect(payload = {}) {
169:       exact(payload, ['compId']); if (payload.compId !== undefined && (!Number.isSafeInteger(payload.compId) || payload.compId < 1)) fail('invalid_comp_id');
170:       const command = { protocolVersion: 1, controllerId, channelEpoch: epoch, commandId: id('inspect'), moduleId: 'project-inspection', operationId: 'inspect', executorHash: asset.executorHash, phase: 'inspect', payloadHash: hash(canonical(payload)), payload };
171:       return submit(command);
172:     },
173:     async close() { closed = true; disconnect('runtime_closed'); if (activePoll) { const poll = activePoll; activePoll = null; poll(null); } await new Promise(resolve => server.close(resolve)); store.close(); }
174:   });
175: }
```

### core4/core/broker.js

Full file SHA-256: 432f7438b6ccd53e4f9b71cc4cc4624fa86f2cbae89528e7c29bf8cc00857352. Dirty source snapshot; base ad12e125e01b2be89ec7298b32c69a366cc390d2.

Lines 390-402:

```javascript
390:   }
391:   getTask({ taskId }) {
392:     const commands = this.ledger.commands(taskId);
393:     return { ...this.ledger.task(taskId), commands: commands.map(c => ({ commandId: c.commandId, workflowId: c.workflowId, runId: c.runId, stepId: c.stepId, attemptId: c.attemptId, state: c.state, target: c.target, modulePin: c.selected.pin, ...(c.after ? { after: c.after } : {}) })) };
394:   }
395:   reset({ taskId }) {
396:     const previous = this.ledger.task(taskId); const task = { type: 'task', taskId, epoch: previous.epoch + 1, reset: true }; this.ledger.append(task);
397:     this.worker.resetTask(taskId, task.epoch);
398:     return { ...this.getTask({ taskId }), resetScope: 'queued-unsent-only; command receipts and fences preserved' };
399:   }
400:   async reconcile({ taskId }) {
401:     this.ensureConnection();
402:     if (this.running || this.reconciling || this.controlPending) fail('broker_busy');
```

### core4/cep/js/poll-dispatcher.js

Full file SHA-256: 741824cffa897c8c3f04a9f8f54b81fc3b0fd45c68c5dd4a6afd59e9a3075006. Dirty source snapshot; base ad12e125e01b2be89ec7298b32c69a366cc390d2.

Lines 10-44:

```javascript
10:   function exact(v, keys) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(function (k) { return keys.indexOf(k) < 0; })) throw new Error('invalid_frame'); }
11:   function createDispatcher(options) {
12:     var key = 'aeagentcore4-physical-' + options.installationId;
13:     var active = false;
14:     function load() { var value = options.storage.getItem(key); return value ? JSON.parse(value) : null; }
15:     function save(v) { var value = canonical(v); options.storage.setItem(key, value); if (options.storage.getItem(key) !== value) throw new Error('latch_write_failed'); }
16:     function post(record) { return options.complete({ commandId: record.frame.commandId, originalBinding: record.frame.originalBinding, pins: record.frame.pins, result: record.result }).then(function (reply) {
17:       if (!reply.ack || reply.ack.commandId !== record.frame.commandId || reply.ack.receiptRef !== record.frame.originalBinding.receiptRef) throw new Error('completion_ack_mismatch');
18:       options.storage.removeItem(key); active = false;
19:     }); }
20:     return {
21:       pending: load,
22:       recover: function () { var prior = load(); if (!prior) return Promise.resolve(); if (!prior.result) return Promise.reject(new Error('physical_outcome_unknown_no_replay')); active = true; return post(prior); },
23:       dispatch: function (frame) {
24:         exact(frame, ['assetKey', 'phase', 'typedPayload', 'commandId', 'originalBinding', 'pins']);
25:         if (active || load()) throw new Error('physical_latch_present');
26:         var assets = options.assets || [{ assetKey: options.assetKey, executorHash: options.pins.executorHash, phases: ['inspect'] }];
27:         var selected = assets.filter(function (a) { return a.assetKey === frame.assetKey; })[0];
28:         var expectedPins = { packageHash: options.pins.packageHash, installationId: options.pins.installationId, executorHash: selected ? selected.executorHash : '' };
29:         if (!selected || selected.phases.indexOf(frame.phase) < 0 || canonical(frame.pins) !== canonical(expectedPins) || frame.originalBinding.commandId !== frame.commandId || frame.originalBinding.executorHash !== selected.executorHash || frame.originalBinding.phase !== frame.phase) throw new Error('fixed_asset_binding');
30:         var record = { frame: frame }; save(record); active = true;
31:         // This persistent latch is not fsync proof. The Node durable begin/fence
32:         // is authoritative and remains closed after lost callback/reload.
33:         return new Promise(function (resolve, reject) {
34:           var data = canonical(frame).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
35:           var script = '(function(){if(typeof AECore4Host==="undefined"||typeof AECore4Host.dispatch!=="function")return "{\\"readFailureVersion\\":1,\\"outcome\\":\\"rejected\\",\\"code\\":\\"host_registry_unavailable\\"}";return AECore4Host.dispatch(' + JSON.stringify(data) + ');}())';
36:           try { options.csInterface.evalScript(script, function (raw) {
37:             try { record.result = JSON.parse(raw); save(record); post(record).then(resolve, reject); } catch (e) { reject(e); }
38:           }); } catch (e) { reject(e); }
39:         });
40:       }
41:     };
42:   }
43:   root.Core4PollDispatcher = { canonical: canonical, createDispatcher: createDispatcher };
44:   if (typeof module === 'object') module.exports = root.Core4PollDispatcher;
```
