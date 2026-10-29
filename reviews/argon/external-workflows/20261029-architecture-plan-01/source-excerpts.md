# Исходные выдержки: INTERNAL, только архитектурные границы
Snapshot: 70b340f6e7ecca81673c193a738fd741b43b3306. Полные файлы не передаются; пропущенные строки не проверены внешним reviewer.

## docs/core-4.0.0-intent.md
Full source SHA-256: 7fdda4a8b6d378dd5f3c8f602be99986cc3ea2f11485b7d43503b1c8914e1515

```text
16: 4.0.0 — минимальный самостоятельно работающий мост Codex → MCP → typed admission → AE с независимо подключаемыми рабочими пакетами. Ядро обеспечивает связь, управляемость и обязательные ограничения исполнения. Предметные возможности поставляются отдельными версиями и загружаются только по необходимости.
17: 
18: Главный показатель успеха: правка рабочего модуля требует проверки этого пакета и доказанно затронутых взаимодействий. Она не перепривязывает неизменённые компоненты и не требует полного review, MCP reconnect или перезапуска продукта. Проверенные typed operations/builders извлекаются постепенно; переименование прежнего монолита не считается результатом.
19: 
20: Разработка 4.0.0 не зависит от завершения прежнего cutover. Перед будущим живым подключением отдельно устанавливается актуальное состояние реально общих ресурсов и незавершённых отправок. Новая версия не разрешает прежний UNKNOWN.
21: 
22: ## Обязательные архитектурные инварианты
23: 
24: 1. **Самостоятельный Core.** Startup проверяет только собственную runtime closure. Рабочие пакеты, plan engine и аналитика могут физически отсутствовать.
25: 2. **Предметный код принадлежит модулям.** Builders, handlers, предметные проверки и read-back не становятся «общими primitives» Core. Core не импортирует рабочие пакеты; private-import между соседними модулями запрещён.
26: 3. **Каталог содержит данные.** Discovery не выполняет imports и не хеширует все функции. Generic MCP surface сохраняет стабильные схемы при изменении каталога.
27: 4. **Доверие отделено от схем и hash.** Manifest и совпадение байтов не выдают authority. Только reviewed/admitted executor-артефакт выбранного модуля получает доступ через server-owned admission; worker не передаёт произвольный script.
28: 5. **Gates применяет сервер.** Typed inspection → deterministic build → server-owned proposal → свежий dry-run → подтверждение по риску → read-back сохраняются. Private brands/grants, ownership, checkpoints и shared fences не определяются самим модулем. Raw JSX, destructive и save сохраняют отдельные ручные gates.
29: 6. **Один контроллер отправляет AE-команды.** Модули не имеют transport credentials и прямого CEP доступа. Нейтральный ledger отправок/общих ресурсов живёт независимо от рабочего модуля и plan engine.
30: 7. **Reset не стирает отправку.** Он снимает queued работу и запрещает новые sends этой задачи. Receipt, возможный UNKNOWN и fence остаются; kill worker не доказывает отмену ExtendScript.
31: 8. **Worker сохраняет управляемость Core.** Один процесс запускается по необходимости. Его зависание изолировано от status/reset Core; процесс не является sandbox для враждебного кода под тем же OS user.
32: 9. **Workflow сохраняет частичный успех.** Продолжение выполняет только нужный остаток после адресной сверки. Автоматического атомарного rollback и replay неизвестной мутации нет.
33: 10. **Идентичности локальны.** План закрепляет только реально участвующие компоненты и dependency closure. Изменение постороннего пакета, каталога или чужой записи допуска не переписывает pins плана.
34: 11. **Проверки следуют diff.** Owner, изменённые contracts и обратные зависимости определяют checks с причинами включения. Реально общий API честно затрагивает потребителей. Полная проверка выпуска — отдельное действие.
35: 12. **Evidence ограничена своей областью.** Результат неизменённого artifact сохраняется; он не заменяет свежесть ресурсов, runtime authority или live acceptance.
36: 13. **Пользовательские активы сохраняются.** Обслуживание пакета само по себе не меняет AEP, изображения, текст или outputs. `recordContext` описывает назначение работы, а не полномочия.
37: 14. **Десктоп ↔ MSI без повторной ручной настройки.** Исходники, contracts и пакеты переносимы в обе стороны; локальные paths/config/credentials/state отделены и обслуживаются installer/preflight. После первичной подготовки поддерживаемых сред повторный цикл не требует ручного редактирования исходников, MCP/CEP-конфига, путей или портов. Перенос не создаёт runtime authority и не разрешает replay. Round-trip приёмка на обоих компьютерах обязательна по [постоянному контракту](portability.md), включая для текущего Core4.
```

## docs/core-installed-composition.md
Full source SHA-256: 5cd0ad6efa54ad853ef35915711b9a5f80c98304f791e471a2db6967108c993a

```text
7: Доступны два состава, выбираемые при сборке:
8: 
9: - `readonly`: Core, CEP и bounded `project-inspection`. Рабочие модули,
10:   их admissions, plan-engine, manual-policy и Windows reservation provider
11:   физически отсутствуют. Broker не получает authority; доступность inspection
12:   отдельно отражается в physical status. Automatic lifecycle отсутствует.
13: - `manual` — default: прежние рабочие пакеты и engine, inspection и existing
14:   current-target adapter. Наличие adapter/контракта не выдаёт mutation grant:
15:   сохраняются proposal/dry-run, fresh native confirmation, ownership,
16:   checkpoint, read-back и UNKNOWN/no-replay.
```

```text
30: Состав задаёт modules/catalog, engine и selected assets. Доступны только
31: существующие reviewed policy adapters; произвольные имена policy или source в
32: runtime frames не принимаются. Pins выводятся из проверенных artifact/admission
33: bytes. Registry собирается детерминированно из выбранных executor bytes и
34: проверяется вместе с полным release tree до imports runtime.
35: 
36: Старый `format:1` сохраняет fixed контракт своей CEP-конфигурации. Новый
37: verifier использует format именно проверяемого release, включая historical
38: install preflight; состав кандидата не заменяет контракт старого f548.
39: Для format2 отсутствие composition/hash, подмена registry, несовпадение
40: catalog/admission и неизвестный формат означают отказ, без if-exists fallback.
41: Signed history, original UNKNOWN и disposition не переписываются при смене
42: состава.
43: 
44: Этот этап создаёт два устанавливаемых состава. Независимая установка/горячая
45: замена произвольных рабочих пакетов остаётся последующей работой; она не
46: заявляется по наличию build-time selector. Temp/VM proof не является live AE
47: приёмкой. Production installation и переносимость двух машин подтверждаются
48: отдельно. Текущий [план и evidence](../plans/core-installed-composition-20261029.md).
```

## core4/runtime/stdio-entry.js
Full source SHA-256: b756c068a0be8f311d644f38b7b499a94df6fac9972a3f9fc5ccd3e88121ebbf

```text
30:   if (!Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_required');
31:   const composition = json('runtime/composition.json'); exactKeys(composition, ['version', 'id', 'modules', 'engine', 'assets']);
32:   if (composition.version !== 1 || !['readonly', 'manual'].includes(composition.id) || !Array.isArray(composition.modules) || !Array.isArray(composition.assets)) fail('composition_schema');
33:   const catalog = json('config/catalog.json'); exactKeys(catalog, ['catalogRevision', 'modules', 'engine']);
34:   const expectedIds = composition.id === 'readonly' ? [] : ['photo-placeholder', 'titles', 'titles-current-target'];
35:   if (canonical(composition.modules) !== canonical(expectedIds) || !Array.isArray(catalog.modules) || canonical(catalog.modules.map(m => m.id)) !== canonical(expectedIds) || canonical(catalog.engine) !== canonical(composition.engine) || (composition.id === 'readonly' ? composition.engine !== null : !composition.engine || composition.engine.path !== 'plan-engine')) fail('composition_catalog');
36:   function admitted(entry) {
37:     exactKeys(entry, ['id', 'version', 'path', 'admission']);
38:     if (entry.path !== 'modules/' + entry.id || entry.admission !== 'config/admissions/' + entry.id + '.json') fail('composition_catalog');
39:     const manifest = json(entry.path + '/artifact.json'), contract = json(entry.path + '/contract.json'), admission = json(entry.admission), executor = checked(entry.path + '/executor.jsx');
40:     exactKeys(admission, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
41:     if (manifest.id !== entry.id || manifest.version !== entry.version || admission.revoked !== false || typeof admission.trustApprovalId !== 'string' || !admission.trustApprovalId || admission.protocolVersion !== 1 || admission.moduleId !== entry.id || contract.moduleId !== entry.id || admission.operationId !== contract.operationId || admission.artifactHash !== hash(manifest) || admission.schemaHash !== hash(contract.inputSchema) || admission.resultSchemaHash !== hash(contract.snapshotSchema) || admission.effectPolicyHash !== hash(contract.effectPolicy) || admission.executorHash !== hash(executor)) fail('composition_not_admitted');
42:     for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file) || hash(checked(entry.path + '/' + file)) !== pin) fail('composition_artifact');
43:     return { manifest, contract, admission, executor };
44:   }
45:   const selected = new Map(catalog.modules.map(entry => [entry.id, admitted(entry)]));
46:   if (composition.engine) { exactKeys(composition.engine, ['path', 'artifactHash']); const manifest = json('plan-engine/artifact.json'); if (hash(manifest) !== composition.engine.artifactHash) fail('composition_engine'); for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json)$/.test(file) || hash(checked('plan-engine/' + file)) !== pin) fail('composition_engine'); }
47:   const expectedAssets = [{ assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] }];
48:   if (composition.id === 'manual') expectedAssets.push({ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', path: 'modules/titles-current-target', admission: 'config/admissions/titles-current-target.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
49:   if (canonical(composition.assets) !== canonical(expectedAssets)) fail('composition_assets');
50:   const assets = composition.assets.map(asset => {
51:     let value = selected.get(asset.moduleId);
52:     if (asset.policy === 'read-only-current-observation-v1') {
53:       const contract = json(asset.path + '/contract.json'), admission = json(asset.admission), executor = checked(asset.path + '/executor.jsx');
54:       exactKeys(admission, ['moduleId', 'executionPolicy', 'executorHash', 'contractHash']);
55:       if (admission.moduleId !== asset.moduleId || admission.executionPolicy !== asset.policy || admission.executorHash !== hash(executor) || admission.contractHash !== hash(contract)) fail('composition_not_admitted');
56:       value = { contract, admission, executor };
57:     }
58:     if (!value) fail('composition_not_admitted');
59:     return { ...asset, ...value, executorHash: value.admission.executorHash };
60:   });
61:   // No optional runtime code is shipped in the standalone inspection composition.
62:   if (composition.id === 'readonly' && Object.keys(release.hashes).some(file => /^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
63:   return { composition, assets };
```

```text
157:   const manualAsset = selected.assets.find(a => a.policy === 'current-matching-target-after-local-confirmation-v1');
158:   let provider, manual, privateEmbedding;
159:   if (manualAsset) {
160:     const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
161:     const { createManualPolicy } = require('./manual-policy.js');
162:     provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
163:     manual = createManualPolicy({ selected: { pin: hash(manualAsset.manifest), contract: manualAsset.contract, admission: manualAsset.admission }, provider, installation, getPeer: () => peer });
164:     const transport = { identity: hash({ packageHash: installation.packageHash, manualAdmission: manualAsset.admission }), connect: value => peer.transport.connect(value), send: value => peer.transport.send(value), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
165:     privateEmbedding = { authority: manual.authority, executionPolicy: manual.port, transport };
166:   }
167:   broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs, ...(privateEmbedding ? { privateEmbedding } : {}) });
168:   const admissionGuard = command => {
169:     if (broker.closed) fail('broker_closed');
170:     if (broker.stateLock.error) fail(broker.stateLock.error);
171:     if (broker.ledger.corrupt) fail('ledger_corrupt');
172:     if (broker.ledger.unresolved().some(c => c.commandId !== command?.commandId)) fail('controller_unresolved');
173:   };
174:   peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets: manualAsset ? [{ assetKey: manualAsset.assetKey, moduleId: manualAsset.moduleId, operationId: manualAsset.contract.operationId, executorHash: manualAsset.executorHash, resultProfile: 'manual-text-v1' }] : [], timeout: PRODUCTION_TIMING.callbackTimeoutMs, port, admissionGuard, installationContext: { descriptorPath: descriptor } });
175:   const contractId = hash({ packageHash: installation.packageHash, admission, contract }); let closed = false;
176:   const facade = Object.create(broker);
177:   const physical = () => { const value = peer.status(); return { ...value, inspectionAvailable: !broker.closed && !broker.stateLock.error && !broker.ledger.corrupt && !broker.ledger.unresolved().length && value.peer.connected && !value.storeClosed && !value.storeFault && !value.pending }; };
178:   facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.0.0', composition: selected.composition.id, installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: physical(), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual?.policyId || null, resourceProvider: provider ? provider.status() : null, ...(manual ? {} : { mutationAvailable: false }), externalLegacyCoverage: 'unobserved' });
```

## core4/runtime/source-package.json
Full source SHA-256: a1ef82ab8f3dda21acb3101071e36138af16710cce2013ac98bca1ea8c8fcdb2

```text
29:   "optional": {
30:     "manual": {
31:       "files": [
32:         "config/admissions/titles.json",
33:         "config/admissions/photo-placeholder.json",
34:         "runtime/manual-policy.js",
35:         "runtime/windows-reservation-provider.js",
36:         "config/admissions/titles-current-target.json"
37:       ],
38:       "artifactClosures": [
39:         "modules/titles/artifact.json",
40:         "modules/photo-placeholder/artifact.json",
41:         "modules/titles-current-target/artifact.json",
42:         "plan-engine/artifact.json"
43:       ]
```

```text
62:     "manual": {
63:       "modules": [
64:         "photo-placeholder",
65:         "titles",
66:         "titles-current-target"
67:       ],
68:       "assets": [
69:         {
70:           "assetKey": "project-inspection-v1",
71:           "moduleId": "project-inspection",
72:           "path": "modules/project-inspection",
73:           "admission": "modules/project-inspection/artifact.json",
74:           "policy": "read-only-current-observation-v1",
75:           "phases": [
76:             "inspect"
77:           ]
78:         },
79:         {
80:           "assetKey": "titles-current-target-v1",
81:           "moduleId": "titles-current-target",
82:           "path": "modules/titles-current-target",
83:           "admission": "config/admissions/titles-current-target.json",
84:           "policy": "current-matching-target-after-local-confirmation-v1",
85:           "phases": [
86:             "inspect",
87:             "mutate",
88:             "verify"
89:           ]
90:         }
```

## core4/core/stdio.js
Full source SHA-256: e48f55653cb3867032851e6fe91c7637151de96af01e9a966aebf5653787c401

```text
5: const TOOL_METHODS = Object.freeze({ core_status: 'status', core_connect: 'connect', core_disconnect: 'disconnect', core_diagnostics: 'diagnostics', list_modules: 'listModules', get_module_contract: 'getContract', inspect_module_target: 'inspect', build_solution_plan: 'build', propose_plan: 'propose', dry_run_plan: 'dryrun', run_plan: 'run', get_task: 'getTask', reset_task: 'reset', reconcile_task: 'reconcile' });
6: function serve(broker, input = process.stdin, output = process.stdout, { serverInfo = { name: 'ae-agent-core4', version: '4.0.0-m1' } } = {}) {
7:   let pending = 0; let rawBytes = 0;
8:   input.on('data', chunk => { rawBytes += chunk.length; if (rawBytes > MAX_FRAME && !chunk.includes(10)) input.destroy(new Error('frame_too_large')); if (chunk.includes(10)) rawBytes = chunk.length - chunk.lastIndexOf(10) - 1; });
9:   const lines = readline.createInterface({ input, crlfDelay: Infinity });
10:   function reply(value) { output.write(bounded(value) + '\n'); }
11:   lines.on('line', async line => {
12:     let request; let counted = false;
13:     try {
14:       request = parse(line); exact(request, ['jsonrpc', 'id', 'method', 'params']);
15:       if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') fail('invalid_request');
16:       if (request.id === undefined) return;
17:       if (pending >= 32) fail('rpc_backpressure'); pending++; counted = true;
18:       let result;
19:       if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo };
20:       else if (request.method === 'ping') result = {};
21:       else if (request.method === 'tools/list') result = { tools: Object.keys(TOOL_METHODS).map(name => ({ name, description: 'Core4 bounded generic operation; no live fallback', inputSchema: { type: 'object', properties: { payload: { type: 'object', additionalProperties: true } }, additionalProperties: false } })) };
22:       else if (request.method === 'tools/call') {
23:         exact(request.params, ['name', 'arguments', '_meta']);
24:         // MCP request metadata is transport data only. It never enters a domain
25:         // payload, builder, proposal, authority or runtime executor.
26:         if (request.params._meta !== undefined) {
27:           if (!request.params._meta || typeof request.params._meta !== 'object' || Array.isArray(request.params._meta) || Buffer.byteLength(bounded(request.params._meta)) > 8192) fail('invalid_protocol_metadata');
28:         }
29:         const method = TOOL_METHODS[request.params.name]; if (!method) fail('unknown_tool');
30:         const args = request.params.arguments || {}; exact(args, ['payload']);
31:         const value = await broker[method](args.payload || {});
```

## core4/core/broker.js
Full source SHA-256: 74c457d7ef0da217313c2bc81665091bf41dc1eb07508d0ff9835abaca45ba3f

```text
148:   async inspect({ moduleId, contractId, target }) {
149:     const selected = this.selected(contractId);
150:     if (selected.moduleId !== moduleId) fail('contract_identity'); check(selected.contract.targetSchema, target);
151:     const snapshot = this.snapshot(selected, await this.send(selected, 'inspect', target), target);
152:     const evidence = { type: 'evidence', evidenceRef: id('evidence'), modulePin: selected.pin, snapshot, observedAt: Date.now() };
153:     this.ledger.append(evidence); this.evidence.set(evidence.evidenceRef, evidence);
154:     return { evidenceRef: evidence.evidenceRef, snapshot, modulePin: selected.pin, synthetic: !!this.authority?.synthetic };
155:   }
156:   validateIntent(selected, intent, desired, evidence) {
157:     exact(intent, ['operationId', 'input']);
158:     if (intent.operationId !== selected.contract.operationId) fail('intent_operation');
159:     check(selected.contract.inputSchema, intent.input);
160:     // The module may fill only the declared expectation fields, never alter desired effects/targets.
161:     for (const key of Object.keys(desired)) if (canonical(intent.input[key]) !== canonical(desired[key])) fail('intent_changed_input');
162:     const policy = selected.contract.effectPolicy;
163:     if (canonical(pick(intent.input, policy.targetFields)) !== canonical(evidence.target)) fail('intent_resource');
164:     for (const [field, observed] of Object.entries(policy.expectedBindings)) if (canonical(intent.input[field]) !== canonical(evidence[observed])) fail('intent_stale_expectation');
165:     return intent.input;
166:   }
167:   async build(args) {
168:     exact(args, ['taskId', 'workflowId', 'steps', 'recordContext', 'oneStep']);
169:     if (!Array.isArray(args.steps) || args.steps.length > 16 || !args.steps.length) fail('workflow_size');
170:     const taskId = args.taskId || id('task'); const task = this.ledger.task(taskId); this.current(taskId, task.epoch);
171:     if (!this.ledger.events.some(e => e.type === 'task' && e.taskId === taskId)) this.ledger.append({ type: 'task', taskId, epoch: 0, reset: false });
172:     const steps = [];
173:     for (const request of args.steps) {
174:       exact(request, ['stepId', 'moduleId', 'contractId', 'evidenceRef', 'input', 'dependsOn', 'bindings']);
175:       const selected = this.selected(request.contractId);
176:       if (selected.moduleId !== request.moduleId) fail('contract_identity');
177:       const evidence = this.evidence.get(request.evidenceRef);
178:       if (!evidence || evidence.modulePin !== selected.pin) fail('server_evidence_required');
179:       check(selected.contract.buildSchema, request.input);
180:       const intent = await this.job(task, 'build', selected, { input: request.input, evidence: evidence.snapshot });
181:       const input = this.validateIntent(selected, intent, request.input, evidence.snapshot);
182:       const executionPolicy = this.executionDescription(selected, evidence.snapshot.target);
183:       steps.push({ stepId: request.stepId, selected, input, desiredInput: request.input, inputDigest: hash({ input: request.input, modulePin: selected.pin, bindings: request.bindings || [] }), dependsOn: request.dependsOn || [], bindings: request.bindings || [], initialEvidence: evidence.snapshot, ...(executionPolicy ? { executionPolicy } : {}) });
184:     }
185:     const oneStep = args.oneStep === true;
186:     if (oneStep && (steps.length !== 1 || !steps[0].executionPolicy || steps[0].dependsOn.length || steps[0].bindings.length)) fail('one_step_policy_required');
187:     const engine = oneStep ? null : this.artifacts.selectEngine(); const plan = { workflowId: args.workflowId || id('workflow'), planRevision: id('revision'), taskId, taskEpoch: task.epoch, engine, ...(oneStep ? { oneStep: true } : {}), steps, pins: { core: this.artifacts.coreIdentity, protocol: this.artifacts.protocolPin, engine: engine?.pin || null, modules: steps.map(s => ({ stepId: s.stepId, module: s.selected.pin, admission: hash(s.selected.admission), dependencies: s.selected.publicDependencies, ...(s.executionPolicy ? { executionPolicy: s.executionPolicy } : {}) })) } };
188:     plan.pins.transport = this.transportIdentity || null;
189:     plan.recordContext = recordContext(args.recordContext || this.defaultRecordContext, { taskId, projectId: steps[0].input.projectId });
190:     if (engine) await this.job(task, 'engine', engine, { action: 'validate', plan: { steps: steps.map(s => pick(s, ['stepId', 'dependsOn', 'bindings'])) } });
191:     const buildId = id('build'); this.ledger.append({ type: 'build', buildId, plan }); this.builds.set(buildId, clone(plan));
192:     return { buildId, workflowId: plan.workflowId, planRevision: plan.planRevision, pins: clone(plan.pins), recordContext: clone(plan.recordContext), taskId, deterministicDigest: hash(steps.map(s => ({ operationId: s.selected.contract.operationId, input: s.input, pin: s.selected.pin }))) };
193:   }
194:   propose({ buildId }) {
195:     const plan = this.builds.get(buildId); if (!plan) fail('server_build_required'); this.current(plan.taskId, plan.taskEpoch);
196:     const proposal = { type: 'proposal', proposalId: id('proposal'), buildId, taskId: plan.taskId, taskEpoch: plan.taskEpoch, planDigest: hash(plan), createdAt: Date.now() };
197:     if (!this.authority) fail('private_grant_required');
198:     this.authority.registerProposal(this.approval(proposal, plan));
199:     this.ledger.append(proposal); this.proposals.set(proposal.proposalId, proposal);
200:     return { proposalId: proposal.proposalId, planRevision: plan.planRevision, taskId: plan.taskId, confirmationRequired: true, effects: plan.steps.map(s => ({ stepId: s.stepId, target: pick(s.desiredInput, s.selected.contract.effectPolicy.targetFields), effect: s.selected.contract.effectPolicy.effect, input: clone(s.input), expectedSnapshotDigest: hash(s.initialEvidence), modulePin: s.selected.pin })), pins: clone(plan.pins) };
```

```text
218:   async dryrun({ proposalId }) {
219:     const { plan } = this.proposal(proposalId); this.ensureConnection();
220:     if (this.ledger.corrupt) fail('ledger_corrupt');
221:     if (canonical(plan.pins.transport || null) !== canonical(this.transportIdentity || null)) fail('transport_pin_changed');
222:     for (const step of plan.steps) this.artifacts.recheck(step.selected);
223:     const dryrunRef = id('dryrun'); const result = { dryrunRef, proposalId, taskEpoch: plan.taskEpoch, createdAt: Date.now(), structural: true, freshness: 'each-step-reinspected-immediately-before-send' };
224:     this.dryruns.set(dryrunRef, result); return clone(result);
```

```text
355:   async run({ proposalId, dryrunRef }) {
356:     const { proposal, plan } = this.proposal(proposalId); const dryrun = this.dryruns.get(dryrunRef);
357:     if (!dryrun || dryrun.proposalId !== proposalId || dryrun.taskEpoch !== plan.taskEpoch || Date.now() - dryrun.createdAt > 5000) fail('fresh_dryrun_required');
358:     this.ensureConnection(); if (this.running || this.reconciling || this.controlPending) fail('broker_busy');
359:     this.dryruns.delete(dryrunRef);
360:     if (canonical(plan.pins.transport || null) !== canonical(this.transportIdentity || null)) fail('transport_pin_changed');
361:     if (this.ledger.unresolved().some(c => c.taskId === plan.taskId)) fail('reconciliation_required');
362:     this.running = true; const runId = id('run'); const outputs = {};
363:     try {
364:       const events = this.ledger.workflow(plan.workflowId);
365:       const completions = this.ledger.commands().filter(c => c.workflowId === plan.workflowId && c.state === 'succeeded').map(c => pick(c, ['stepId', 'inputDigest', 'commandId']));
366:       const decisions = plan.oneStep ? { steps: plan.steps.map(s => { const c = completions.find(c => c.stepId === s.stepId && c.inputDigest === s.inputDigest); return { stepId: s.stepId, action: c ? 'reinspect_success' : 'execute', ...(c ? { commandId: c.commandId } : {}) }; }) } : await this.job({ taskId: plan.taskId, epoch: plan.taskEpoch }, 'engine', plan.engine, { action: 'resume', plan: { steps: plan.steps.map(s => pick(s, ['stepId', 'inputDigest'])) }, events, completions });
367:       exact(decisions, ['steps']);
368:       if (!Array.isArray(decisions.steps) || decisions.steps.length !== plan.steps.length) fail('engine_decision');
369:       this.engineEvent(plan, { kind: 'run_started', runId, planRevision: plan.planRevision });
370:       for (let index = 0; index < plan.steps.length; index++) {
371:         const step = plan.steps[index], decision = decisions.steps[index]; exact(decision, ['stepId', 'action', 'commandId']);
372:         if (decision.stepId !== step.stepId) fail('engine_decision');
373:         for (const dependency of step.dependsOn) if (!outputs[dependency]) fail('dependency_unsatisfied');
374:         const completed = this.ledger.commands().find(c => c.workflowId === plan.workflowId && c.stepId === step.stepId && c.state === 'succeeded' && c.inputDigest === step.inputDigest);
375:         if (completed) {
376:           if (decision.action !== 'reinspect_success' || decision.commandId !== completed.commandId) fail('engine_false_replay');
377:           this.artifacts.recheck(completed.selected);
378:           const current = this.snapshot(completed.selected, await this.send(completed.selected, 'verify', completed.input), completed.target);
379:           if (canonical(current) !== canonical(completed.after)) fail('successful_step_drift');
380:           outputs[step.stepId] = current;
381:         } else {
382:           if (decision.action !== 'execute') fail('engine_false_success');
383:           outputs[step.stepId] = await this.executeStep({ plan, step, proposal, runId, outputs });
```

## core4/core/artifacts.js
Full source SHA-256: d92cab3fc958edaf606318f0f5fbf4995a98077f94630affd3c991109d3177a6

```text
6: function local(root, relative) {
7:   if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) fail('artifact_path');
8:   const file = path.resolve(root, relative);
9:   if (!file.startsWith(path.resolve(root) + path.sep)) fail('artifact_path');
10:   if (fs.existsSync(file) && fs.realpathSync(file) !== file) fail('artifact_symlink');
11:   return file;
12: }
13: class Artifacts {
14:   constructor({ root, store, trace = () => {}, publicationGuard = () => {}, readOnly = false }) {
15:     this.root = root; this.store = store; this.trace = trace; this.publicationGuard = publicationGuard;
16:     this.catalog = { catalogRevision: 'absent', modules: [] }; this.refresh();
17:     const core = this.readJSON('core/artifact.json');
18:     this.coreIdentity = hash(core); const runtimeBytes = {};
19:     for (const [file, digest] of Object.entries(core.hashes)) {
20:       if (!/^(core\/|protocol\/|worker\.js$)/.test(file)) fail('core_closure_boundary');
21:       runtimeBytes[file] = this.read(file); if (hash(runtimeBytes[file]) !== digest) fail('core_integrity', file);
22:     }
23:     if (!readOnly) this.runtime = { path: this.publish('core-' + this.coreIdentity, runtimeBytes, core.hashes, 'runtime_copy_short_write', 'immutable_runtime_integrity'), hashes: core.hashes };
24:     this.protocolPin = hash(this.readJSON('protocol/artifact.json'));
```

```text
77:   select(moduleId) {
78:     this.publicationGuard();
79:     const entry = this.catalog.modules.find(m => m.id === moduleId);
80:     if (!entry) fail('module_unavailable');
81:     let admission;
82:     try { admission = this.readJSON(entry.admission); } catch { fail('not_admitted'); }
83:     const selected = this.selectArtifact(entry.path, admission.artifactHash);
84:     if (selected.manifest.id !== moduleId || selected.manifest.version !== entry.version) fail('artifact_identity');
85:     const contract = parse(fs.readFileSync(path.join(selected.path, 'contract.json'), 'utf8'));
86:     const executor = fs.readFileSync(path.join(selected.path, 'executor.jsx'), 'utf8');
87:     this.checkAdmission(admission, selected.pin, contract, executor);
88:     return { ...selected, moduleId, contract, admission, admissionPath: entry.admission, executor };
89:   }
90:   checkAdmission(a, pin, contract, executor) {
91:     exact(a, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
92:     if (a.revoked || !a.trustApprovalId || a.protocolVersion !== 1 || a.artifactHash !== pin || a.moduleId !== contract.moduleId || a.operationId !== contract.operationId || a.schemaHash !== hash(contract.inputSchema) || a.resultSchemaHash !== hash(contract.snapshotSchema) || a.effectPolicyHash !== hash(contract.effectPolicy) || a.executorHash !== hash(executor)) fail('not_admitted');
93:   }
94:   recheck(selected) {
95:     const current = this.readJSON(selected.admissionPath);
96:     this.checkAdmission(current, selected.pin, selected.contract, selected.executor);
97:     if (canonical(current) !== canonical(selected.admission)) fail('admission_changed');
98:     this.verifyCopy(selected); return true;
```

```text
114:   selectArtifact(relative, admittedPin) {
115:     this.publicationGuard();
116:     let manifest;
117:     try { manifest = this.readJSON(relative + '/artifact.json'); } catch (e) { if (e.code === 'ENOENT') fail('module_unavailable'); throw e; }
118:     exact(manifest, ['id', 'version', 'entry', 'hashes', 'publicDependencies']);
119:     const pin = hash(manifest);
120:     if (!admittedPin || admittedPin !== pin) fail('artifact_not_admitted');
121:     if (!manifest.hashes[manifest.entry] || Object.keys(manifest.hashes).length > 32) fail('invalid_manifest');
122:     const bytes = {};
123:     for (const [file, digest] of Object.entries(manifest.hashes)) {
124:       bytes[file] = this.read(relative + '/' + file);
125:       if (hash(bytes[file]) !== digest) fail('artifact_substitution');
126:       if (file.endsWith('.js')) reviewCode(bytes[file]);
127:     }
128:     for (const [file, digest] of Object.entries(manifest.publicDependencies || {})) if (hash(this.read(file)) !== digest) fail('dependency_pin');
129:     const target = this.publish(pin, bytes, manifest.hashes, 'artifact_copy_short_write', 'immutable_integrity');
130:     return { pin, path: target, manifest, publicDependencies: manifest.publicDependencies };
131:   }
132: }
133: function reviewCode(source) {
134:   // Admission is reviewed local code, not an untrusted-code sandbox. This conservative
135:   // guard also rejects computed imports, Node/global ports and dynamic evaluation.
136:   if (/\b(require|import|eval|Function|process|global|globalThis|fetch|WebSocket|__dirname|__filename)\b/.test(source) || /constructor\s*[\[(.]|__proto__/.test(source)) fail('private_import_denied');
```

## core4/modules/titles/executor.jsx
Full source SHA-256: e1eb94f04ce9f2e7fc0fc97acc8a226aadaacde50cec5aa9af72b011b18092ca

```text
5:     function target(p) {
6:         if (typeof AE_CORE_SESSION_ID !== 'string' || p.sessionId !== AE_CORE_SESSION_ID) fault('session_cas');
7:         if (!app.project || !app.project.file || String(app.project.file.fsName) !== p.projectId) fault('project_cas');
8:         var comp = null, layer = null, i;
9:         for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === p.compId) comp = app.project.item(i);
10:         if (!(comp instanceof CompItem)) fault('comp_cas');
11:         for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === p.layerId) layer = comp.layer(i);
12:         if (!layer || layer.locked) fault('layer_cas');
13:         var group = layer.property('ADBE Text Properties'), prop = group && group.property('ADBE Text Document');
14:         if (!prop || prop.numKeys !== 0 || prop.isTimeVarying || prop.expressionEnabled || prop.expression) fault('unsupported_animated_text');
15:         return { comp: comp, layer: layer, prop: prop };
```

```text
26:     function snapshot(p) {
27:         var t = target(p), doc = t.prop.value;
28:         if (!doc || typeof doc.text !== 'string' || doc.text.length === 0 || /[\r\n]/.test(doc.text) || typeof doc.characterRange !== 'function') fault('unsupported_style_proof');
29:         var uniform = fields(doc, characterFields), i;
30:         // One preview TextDocument is insufficient: inspect every character range.
31:         for (i = 0; i < doc.text.length; i++) if (JSON.stringify(fields(doc.characterRange(i, i + 1), characterFields)) !== JSON.stringify(uniform)) fault('unsupported_mixed_style');
32:         var style = { character: uniform, paragraph: fields(doc, paragraphFields) };
33:         var resource = { sessionId: p.sessionId, projectId: p.projectId, compId: t.comp.id, layerId: t.layer.id };
34:         return { target: resource, text: doc.text, protected: JSON.stringify(style), revision: JSON.stringify([resource, doc.text, style]) };
35:     }
36:     function mutate(p) {
37:         var started = false;
38:         try {
39:             var before = snapshot(p);
40:             if (p.expectedRevision !== before.revision || p.expectedText !== before.text) fault('stale_target');
41:             if (typeof p.text !== 'string' || p.text.length === 0 || /[\r\n]/.test(p.text)) fault('unsupported_text');
42:             var t = target(p), doc = t.prop.value; doc.text = p.text;
43:             started = true; t.prop.setValue(doc);
44:             var after = snapshot(p);
45:             if (after.text !== p.text || after.protected !== before.protected) fault('readback_mismatch');
46:             return { outcome: 'applied', snapshot: after };
47:         } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'ae_error' }; }
48:     }
49:     return { inspect: snapshot, mutate: mutate, verify: snapshot };
```

## core4/modules/titles-current-target/implementation.js
Full source SHA-256: 1b31cd96b475f6af3e286fdd5c009d46e09b18b271db88ce951e9ec8d7fc580b

```text
1: 'use strict';
2: function build({ input, evidence }) {
3:   if (/[\r\n]/.test(input.text) || input.text.length === 0) { const e = new Error('single-line nonempty title required'); e.code = 'unsupported'; throw e; }
4:   return { operationId: 'set-current-text', input: { ...input, expectedRevision: evidence.revision, expectedText: evidence.text } };
5: }
6: module.exports = { build };
```

## mcp-server/bridge-daemon.js
Full source SHA-256: ada01bf38d07d0f4a6aeb567c90c07ad682383f1ca629d6bb139464e838461a4

```text
97: const slideshowTools = require("./slideshow-tools");
98: const slideshowPlanBuilder = require("./slideshow-plan-builder");
99: const placeholderPlanBuilder = require("./placeholder-plan-builder");
100: const placeholderReadBack = require("./placeholder-readback");
101: const placeholderEvidence = require("./placeholder-evidence");
102: const placeholderSourceRecovery = require("./placeholder-source-recovery");
103: const placeholderProtection = require("./placeholder-protection");
104: const placeholderUsage = require("./placeholder-usage");
105: const placeholderGeometry = require("./placeholder-geometry");
106: const placeholderReviewService = require("./placeholder-review-service");
107: const placeholderVisualReview = require("./placeholder-visual-review");
108: const placeholderReviewTools = require("./placeholder-review-tools");
109: const placeholderVisualBatches = require("./placeholder-visual-batches");
110: const montageTools = require("./montage-tools");
111: const montagePipelineService = require("./montage-pipeline-service");
112: const montageCaptureService = require("./montage-capture-service");
113: const { buildCompVisualReviewPlanTool, buildCompVisualReviewPlan, validateCompVisualReviewInput } = require("./comp-visual-review-plan");
114: const compVisualReviewManifest = require("./comp-visual-review-manifest");
115: const projectLifecycleState = require("./project-lifecycle-state");
116: const projectLifecycleContract = require("./project-lifecycle-contract");
117: const projectLifecyclePlan = require("./project-lifecycle-plan");
118: const { createLifecycleBridgeAdapter } = require("./project-lifecycle-bridge-adapter");
119: const projectStateMemory = require("./project-state-store");
120: const projectStateController = projectStateMemory.createProjectStateController();
121: const projectSave = require("./project-save");
122: const nativeRenderVariant = require("./native-render-variant");
123: const titleExport = require("./title-export-snapshots");
124: const ameJobSource = require("./ame-job-source");
125: const ameOpenComp = require("./ame-open-comp");
126: const titleVerification = require("./title-export-verification");
```

```text
7490:   try { if(validation.mutatingCount>0)seriesArgs = preflightAmeTitleSeries(prepared.plan);if(seriesArgs)seriesActor=ameTitleSeriesActor(); }
7491:   catch (error) {run.ok=false;run.errorCode=error.code||"ame_title_series_preflight_failed";run.error=error.message;return finishRun();}
7492:   const montageRunMaterialReader = prepared.plan.montagePipeline && !dryRun
7493:     ? montagePipelineService.boundedMaterialReader(require("./montage-contract").normalizeBudgets(prepared.plan.montagePipeline.readBudgets).budgets)
7494:     : null;
7495:   if (validation.mutatingCount > 0 && !lifecycleStep) {
7496:     try { run.placeholderPreflight = await guardPlaceholderPlan(prepared.plan, {
7497:       montageRunPreflight: Boolean(prepared.plan.montagePipeline && !dryRun),
7498:       ...(montageRunMaterialReader ? {montageVerifyMaterials:montageRunMaterialReader} : {})
7499:     }); }
7500:     catch (error) {
7501:       run.ok = false; run.errorCode = error.code || "placeholder_preflight_failed";
7502:       run.error = error.message; run.placeholderPreflight = error.details || null;
7503:       return finishRun();
7504:     }
```

```text
7940:       if (autonomous && step.tool === "audit_slideshow_generated") {
7941:         const checked = buildServerSemanticVerification(prepared.plan, {...run, ok: true});
7942:         if (checked.failedChecks > 0 || checked.unverifiedMutationCount > 0) {
7943:           run.errorCode = "slideshow_verification_failed";
7944:           run.error = "Read-back этапа слайд-шоу не совпал с планом; следующие изменения остановлены.";
7945:           run.failedCount += 1;
7946:           run.intermediateVerification = checked;
7947:           recordAutonomyObstacle({operation: step.tool, proposalId: options._m100ActionRecord.actionId,
7948:             runId: run.id, code: run.errorCode, phase: "verification", failedSteps: 1, verification: "failed"});
7949:           break;
7950:         }
```

## mcp-server/core-tool-dispatch.js
Full source SHA-256: 8726198bae6623714574c97f1737601abe0d22fe43ca7da2fc35a73183cba822

```text
301:   if (name === "build_slideshow_plan") {
302:     try { const result=ports.slideshowPlanBuilder.buildSlideshowPlan(args.manifest, args.articles, args.inventory);
303:       ports.recordEvent("slideshow_plan_built", {builderProvenance:result.builderProvenance,stageCount:result.stageCount,validationOk:result.ok});
304:       return ports.toolResult(result); }
305:     catch (error) { return ports.toolResult({ ok: false, error: error.message, code: error.code || "SLIDESHOW_PLAN_ERROR" }, true); }
306:   }
307:   if (ports.slideshowTools.TOOL_NAMES.includes(name)) {
308:     try {
309:       const result = await ports.slideshowTools.execute(name, args, ports.runExtendScriptBody);
310:       if (result && result.ok === false && !result.code) result.code = "slideshow_audit_failed";
311:       return ports.toolResult(result, !result || result.ok === false);
312:     }
313:     catch (error) { return ports.toolResult({ ok: false, error: error.message, code: error.code || "SLIDESHOW_TOOL_ERROR" }, true); }
```

## mcp-server/slideshow-plan-builder.js
Full source SHA-256: b3bd52f6eec50673fa5dc09fc6657095cba45220833a6b57933ce69f74c4ba0d

```text
7: const MAX_STAGE_STEPS = 50;
```

```text
67: function makeStage(name, targetProjectFile, steps, eventIds) {
68:   if(steps.length>MAX_STAGE_STEPS)throw new Error(`Stage ${name} exceeds ${MAX_STAGE_STEPS} steps.`);
69:   return { name, targetProject:{file:targetProjectFile}, summary:name, risk:"medium",requiresCheckpoint:true,solutionIds:[],clarifyingQuestion:null,eventIds:eventIds||[],steps };
70: }
71: 
72: function setupStage(data, inventory) {
73:   const m=data.manifest, base={expectedProjectFile:m.projectPath,generatedPrefix:m.prefix},protectedSourceFingerprints=protectedArgs([inventory.finalComp]),guardedBase={...base,protectedSourceFingerprints},steps=[];
74:   add(steps,step("Read and guard the exact saved project","get_project_info",{},false));
75:   add(steps,step("Create owned generated slideshow master","create_slideshow_master",{...guardedBase,masterName:m.masterName,width:m.width,height:m.height,pixelAspect:m.pixelAspect,duration:m.duration,frameRate:m.frameRate,backgroundColor:[0.917647,0.917647,0.917647]},true));
76:   add(steps,step("Audit new generated master","audit_slideshow_generated",auditArgs(base,m.masterName,m.duration,[inventory.finalComp]),false));
77:   for(const role of ["CONTROL","COLOR"]){const control=inventory.finalComp.controlLayers[role];add(steps,step(`Copy guarded ${role} layer and preserve its identity`,"copy_slideshow_control_layer",{...guardedBase,expectedSourceCompName:inventory.finalComp.name,sourceLayerName:control.sourceLayerName,targetLayerName:role,expectedEffectCount:control.effectCount,expectedMasterCompName:m.masterName,duration:m.duration},true));add(steps,step(`Audit master after ${role} copy`,"audit_slideshow_generated",auditArgs(base,m.masterName,m.duration,[inventory.finalComp]),false));}
78:   return makeStage("slideshow-setup",m.projectPath,steps,[]);
79: }
80: 
81: function appendEvent(steps,data,inventory,event){
82:   const m=data.manifest,scene=inventory.scenes.get(event.scene),base={expectedProjectFile:m.projectPath,generatedPrefix:m.prefix},rootName=`${m.prefix}E${event.id}_ROOT`,fingerprints=[scene,inventory.finalComp],protectedSourceFingerprints=protectedArgs(fingerprints),guardedBase={...base,protectedSourceFingerprints};
83:   add(steps,step(`Clone Scene ${event.scene} for event ${event.id}`,"clone_slideshow_event_tree",{...guardedBase,expectedSourceCompName:scene.name,generatedRootName:rootName,audioMode:"mute"},true));
84:   add(steps,step(`Audit isolated clone for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,scene.duration,fingerprints),false));
85:   add(steps,step(`Extend event ${event.id} clone at 1x speed`,"extend_slideshow_cloned_tree",{...guardedBase,expectedRootCompName:rootName,targetDuration:event.duration,introDuration:m.introDuration},true));
86:   add(steps,step(`Audit duration and key metadata for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));
87:   add(steps,step(`Rewrite explicit comp references for event ${event.id}`,"rewrite_slideshow_tree_expressions",{...guardedBase,expectedRootCompName:rootName,masterCompName:m.masterName,replacements:[]},true));
88:   add(steps,step(`Audit rewritten expressions for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));
89:   add(steps,step(`Apply title and newspaper text for event ${event.id}`,"apply_slideshow_event_text",{...guardedBase,expectedRootCompName:rootName,sceneNumber:event.scene,titleCompName:`Text ${String(event.scene).padStart(2,"0")}`,hero:event.hero,title:event.title,titleWrap:event.titleWrap,articleChunks:data.articles[event.hero]},true));
90:   add(steps,step(`Audit fitted text and newspaper layout for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));
91:   for(let i=0;i<event.images.length;i+=1){const group=event.images[i],visualItems=group.items.map((item)=>({...item,audio:false}));add(steps,step(`Relink clean media leaf ${i+1} for event ${event.id}`,"replace_slideshow_media_leaf",{...guardedBase,expectedRootCompName:rootName,leafName:group.leaf,generatedLeafName:`${m.prefix}E${event.id}_MEDIA_${i+1}`,duration:event.duration,mediaItems:visualItems},true));add(steps,step(`Audit clean media leaf ${i+1} for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));}
92:   add(steps,step(`Copy guarded intro/main pair for event ${event.id}`,"copy_slideshow_event_pair",{...guardedBase,expectedFinalCompName:inventory.finalComp.name,expectedMasterCompName:m.masterName,expectedRootCompName:rootName,sourceSceneName:scene.name,sceneNumber:event.scene,eventStart:event.start,eventDuration:event.duration,introDuration:m.introDuration,rootHasAudio:false,introEffectCount:scene.introEffectCount,mainEffectCount:scene.mainEffectCount},true));
93:   add(steps,step(`Audit copied pair for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,m.masterName,m.duration,fingerprints),false));
94:   add(steps,step(`Add explicit overlays for event ${event.id}`,"add_slideshow_event_overlays",{...guardedBase,expectedMasterCompName:m.masterName,eventId:event.id,eventStart:event.start,eventDuration:event.duration,audioItems:masterAudioItems(event),captions:event.captions},true));
95:   add(steps,step(`Audit master coverage after event ${event.id}`,"audit_slideshow_generated",auditArgs(base,m.masterName,m.duration,fingerprints),false));
96: }
97: 
98: function eventStages(data,inventory){const stages=[];let cursor=0;while(cursor<data.manifest.events.length){const steps=[];add(steps,step("Read and guard the exact saved project","get_project_info",{},false));add(steps,step("Resolve generated master by exact name","get_comp_details",{compName:data.manifest.masterName,includeLayers:false},false));const ids=[];while(cursor<data.manifest.events.length){const before=steps.length;appendEvent(steps,data,inventory,data.manifest.events[cursor]);if(steps.length>MAX_STAGE_STEPS){steps.splice(before);break;}ids.push(data.manifest.events[cursor].id);cursor++;}if(!ids.length)throw new Error(`Event ${data.manifest.events[cursor].id} exceeds the stage limit.`);stages.push(makeStage(`slideshow-events-${ids[0]}-${ids[ids.length-1]}`,data.manifest.projectPath,steps,ids));}return stages;}
99: 
100: function buildSlideshowPlan(manifest,articles,inventory){const data=normalizeManifest(manifest,articles),checked=normalizeInventory(inventory,data.manifest),stages=[setupStage(data,checked),...eventStages(data,checked)];
101:   const provenance={builderId:"slideshow-newspaper",builderVersion:"2",manifestSchema:data.manifest.schema,manifestSha256:sha256(data.manifest),articlesSha256:sha256(data.articles),inventorySha256:sha256(inventory),builderSourceSha256:sha256(fs.readFileSync(__filename))};
102:   for(const stage of stages)stage.builderProvenance={...provenance,planContentSha256:sha256(stage)};
103:   return {ok:true,schema:"ae-agent-slideshow-plan.v2",builderProvenance:provenance,previewLocal:true,mutatesProject:false,requiresFreshEvidenceReview:true,audioRouting:data.manifest.audioRouting,targetProject:{file:data.manifest.projectPath},manifest:data.manifest,stageCount:stages.length,maxStepsPerStage:Math.max(...stages.map((stage)=>stage.steps.length)),stages};}
```
