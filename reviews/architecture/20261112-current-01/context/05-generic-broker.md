# 05-generic-broker

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/core/broker.js:18–37`
Полный файл SHA256 (hex groups, concatenate) `259384bb:b699742a:ccd5c61e:e123723c:295f2c40:52a76c25:895ef83e:a1a9c460`; Git blob `48a7208c:de9ef725:86f33c6a:585c40d7:7f5f3f55`. Выдержка: строки 18–37, 1800 bytes.

```javascript
const freshDryrunRefusals = new WeakSet();
const mediaDuplicateBuildRefusals = new WeakSet();
class Broker {
  static isFreshDryrunRefusal(error) { return freshDryrunRefusals.has(error); }
  static consumeMediaDuplicateBuildRefusal(error) { return mediaDuplicateBuildRefusals.delete(error); }

  constructor({ root = path.resolve(__dirname, '..'), stateDir, trace, workerTimeout, transportTimeout = 2000, projectOpenTransportTimeout, privateEmbedding, stateLockToken } = {}) {
    if (!stateDir) fail('explicit_state_directory_required');
    if (projectOpenTransportTimeout !== undefined && (!Number.isSafeInteger(projectOpenTransportTimeout) || projectOpenTransportTimeout <= transportTimeout || projectOpenTransportTimeout >= 120000)) fail('project_open_transport_timeout');
    this.stateLock = acquireStateLock(stateDir, stateLockToken === undefined ? {} : { token: stateLockToken });
    this.closed = false; this.ledger = new Ledger(path.join(stateDir, 'ledger.ndjson')); this.ledger.ownerFault = this.stateLock.error; this.ledger.writeGuard = () => !this.closed;
    try {
      this.artifacts = new Artifacts({ root, store: path.join(stateDir, 'artifacts'), trace, readOnly: !!this.stateLock.error, publicationGuard: () => {
        if (this.closed || this.released) fail('broker_closed');
        if (this.stateLock.error) fail(this.stateLock.error);
      } });
    } catch (e) { if (!this.stateLock.error) this.stateLock.release(); throw e; }
    this.worker = new WorkerClient({ timeout: workerTimeout, runtime: this.artifacts.runtime });
    this.transportTimeout = transportTimeout; this.projectOpenTransportTimeout = projectOpenTransportTimeout;
    this.contracts = new Map(); this.evidence = new Map(); this.builds = new Map(); this.proposals = new Map(); this.dryruns = new Map();
```

## `core4/core/broker.js:39–56`
Полный файл SHA256 (hex groups, concatenate) `259384bb:b699742a:ccd5c61e:e123723c:295f2c40:52a76c25:895ef83e:a1a9c460`; Git blob `48a7208c:de9ef725:86f33c6a:585c40d7:7f5f3f55`. Выдержка: строки 39–56, 1138 bytes.

```javascript
    this.connected = false; this.running = false; this.reconciling = false; this.controllerBusy = false; this.controlPending = 0; this.hooks = {};
    if (privateEmbedding) {
      this.authority = validatePort(privateEmbedding.authority);
      this.transport = privateEmbedding.transport; this.hooks = privateEmbedding.hooks || {};
      if (privateEmbedding.executionPolicy) this.executionPolicy = validateExecutionPolicyPort(privateEmbedding.executionPolicy);
      this.defaultRecordContext = privateEmbedding.recordContext;
    }
    this.resources = new Resources(this.ledger, this.authority?.resourceConstraints || []);
    for (const e of this.ledger.events) {
      if (e.type === 'evidence') this.evidence.set(e.evidenceRef, e);
      if (e.type === 'build') this.builds.set(e.buildId, e.plan);
      if (e.type === 'proposal') this.proposals.set(e.proposalId, e);
    }
    if (this.authority) for (const proposal of this.proposals.values()) {
      const plan = this.builds.get(proposal.buildId);
      if (plan && hash(plan) === proposal.planDigest) this.authority.registerProposal(this.approval(proposal, plan));
    }
  }
```

## `core4/core/broker.js:92–123`
Полный файл SHA256 (hex groups, concatenate) `259384bb:b699742a:ccd5c61e:e123723c:295f2c40:52a76c25:895ef83e:a1a9c460`; Git blob `48a7208c:de9ef725:86f33c6a:585c40d7:7f5f3f55`. Выдержка: строки 92–123, 2709 bytes.

```javascript
  listModules({ refresh = false } = {}) {
    if (refresh) {
      const before = canonical(this.artifacts.catalog); this.artifacts.refresh();
      if (before !== canonical(this.artifacts.catalog) && this.worker.pending.size === 0) this.worker.stop('catalog_idle_drain');
    }
    return { catalogRevision: this.artifacts.catalog.catalogRevision, modules: this.artifacts.catalog.modules.map(m => ({ id: m.id, version: m.version })), diagnostic: this.artifacts.catalogError || null };
  }
  getContract({ moduleId }) {
    const selected = this.artifacts.select(moduleId);
    const contractId = hash({ modulePin: selected.pin, admissionPin: hash(selected.admission), protocolPin: this.artifacts.protocolPin });
    this.contracts.set(contractId, selected);
    return { contractId, moduleId, operationId: selected.contract.operationId, modulePin: selected.pin, admissionPin: hash(selected.admission), contract: clone(selected.contract) };
  }
  selected(contractId) { const selected = this.contracts.get(contractId); if (!selected) fail('contract_required'); this.artifacts.recheck(selected); return selected; }
  ensureConnection() { if (this.closed) fail('broker_closed'); if (this.stateLock.error) fail(this.stateLock.error); if (!this.connected || !this.transport) fail('live_transport_unavailable'); }
  lifecycle(target) {
    if (!validateLifecycleBinding(this.sessionBinding)) fail('trusted_project_lifecycle_unavailable');
    if (target.sessionId !== this.sessionBinding.sessionId || target.projectId !== this.sessionBinding.projectId) fail('project_incarnation_changed');
  }
  executionDescription(selected, target) { return this.executionPolicy?.describe(selected, { target }) || null; }
  assertExecution(selected, payload, phase, context, stage = 'before-send') {
    const target = pick(payload, selected.contract.effectPolicy.targetFields), descriptor = this.executionDescription(selected, target);
    if (!descriptor) return this.lifecycle(payload);
    this.executionPolicy.assertCurrent({ ...context, selected, target, descriptor, phase, stage });
  }
  current(taskId, epoch) { if (this.closed) fail('broker_closed'); const task = this.ledger.task(taskId); if (task.reset || task.epoch !== epoch) fail('stale_task_epoch'); return task; }
  async hook(name, data) { if (this.hooks[name]) await this.hooks[name](data, this); }
  async job(task, method, selected, payload) {
    this.current(task.taskId, task.epoch); this.artifacts.verifyCopy(selected);
    const result = await this.worker.request({ taskId: task.taskId, taskEpoch: task.epoch, method, componentPins: pick(selected, ['pin', 'path', 'manifest']), payload });
    this.current(task.taskId, task.epoch); return result;
  }
```

## `core4/core/broker.js:165–258`
Полный файл SHA256 (hex groups, concatenate) `259384bb:b699742a:ccd5c61e:e123723c:295f2c40:52a76c25:895ef83e:a1a9c460`; Git blob `48a7208c:de9ef725:86f33c6a:585c40d7:7f5f3f55`. Выдержка: строки 165–258, 8842 bytes.

```javascript
  async inspect({ moduleId, contractId, target }) {
    const selected = this.selected(contractId);
    if (selected.moduleId !== moduleId) fail('contract_identity'); check(selected.contract.targetSchema, target);
    const snapshot = this.snapshot(selected, await this.send(selected, 'inspect', target), target);
    const evidence = { type: 'evidence', evidenceRef: id('evidence'), modulePin: selected.pin, snapshot, observedAt: Date.now() };
    this.ledger.append(evidence); this.evidence.set(evidence.evidenceRef, evidence);
    return { evidenceRef: evidence.evidenceRef, snapshot, modulePin: selected.pin, synthetic: !!this.authority?.synthetic };
  }
  validateIntent(selected, intent, desired, evidence) {
    exact(intent, ['operationId', 'input']);
    if (intent.operationId !== selected.contract.operationId) fail('intent_operation');
    check(selected.contract.inputSchema, intent.input);
    // The module may fill only the declared expectation fields, never alter desired effects/targets.
    for (const key of Object.keys(desired)) if (canonical(intent.input[key]) !== canonical(desired[key])) fail('intent_changed_input');
    const policy = selected.contract.effectPolicy;
    if (canonical(pick(intent.input, policy.targetFields)) !== canonical(evidence.target)) fail('intent_resource');
    for (const [field, observed] of Object.entries(policy.expectedBindings)) if (canonical(intent.input[field]) !== canonical(evidence[observed])) fail('intent_stale_expectation');
    return intent.input;
  }
  async build(args) {
    exact(args, ['taskId', 'workflowId', 'steps', 'recordContext', 'oneStep']);
    if (!Array.isArray(args.steps) || args.steps.length > 16 || !args.steps.length) fail('workflow_size');
    const taskId = args.taskId || id('task'); const task = this.ledger.task(taskId); this.current(taskId, task.epoch);
    if (!this.ledger.events.some(e => e.type === 'task' && e.taskId === taskId)) this.ledger.append({ type: 'task', taskId, epoch: 0, reset: false });
    const steps = [];
    for (const request of args.steps) {
      exact(request, ['stepId', 'moduleId', 'contractId', 'evidenceRef', 'input', 'dependsOn', 'bindings']);
      const selected = this.selected(request.contractId);
      if (selected.moduleId !== request.moduleId) fail('contract_identity');
      const evidence = this.evidence.get(request.evidenceRef);
      if (!evidence || evidence.modulePin !== selected.pin) fail('server_evidence_required');
      check(selected.contract.buildSchema, request.input);
      let intent;
      try { intent = await this.job(task, 'build', selected, { input: request.input, evidence: evidence.snapshot }); }
      catch (error) {
        // Only the selected media builder can prove this refusal before plan publication.
        if (selected.moduleId === 'media-import' && error.code === 'media_already_imported') mediaDuplicateBuildRefusals.add(error);
        throw error;
      }
      const input = this.validateIntent(selected, intent, request.input, evidence.snapshot);
      const executionPolicy = this.executionDescription(selected, evidence.snapshot.target);
      steps.push({ stepId: request.stepId, selected, input, desiredInput: request.input, inputDigest: hash({ input: request.input, modulePin: selected.pin, bindings: request.bindings || [] }), dependsOn: request.dependsOn || [], bindings: request.bindings || [], initialEvidence: evidence.snapshot, ...(executionPolicy ? { executionPolicy } : {}) });
    }
    const oneStep = args.oneStep === true;
    if (oneStep && (steps.length !== 1 || !steps[0].executionPolicy || steps[0].dependsOn.length || steps[0].bindings.length)) fail('one_step_policy_required');
    const engine = oneStep ? null : this.artifacts.selectEngine(); const plan = { workflowId: args.workflowId || id('workflow'), planRevision: id('revision'), taskId, taskEpoch: task.epoch, engine, ...(oneStep ? { oneStep: true } : {}), steps, pins: { core: this.artifacts.coreIdentity, protocol: this.artifacts.protocolPin, engine: engine?.pin || null, modules: steps.map(s => ({ stepId: s.stepId, module: s.selected.pin, admission: hash(s.selected.admission), dependencies: s.selected.publicDependencies, ...(s.executionPolicy ? { executionPolicy: s.executionPolicy } : {}) })) } };
    plan.pins.transport = this.transportIdentity || null;
    plan.recordContext = recordContext(args.recordContext || this.defaultRecordContext, { taskId, projectId: steps[0].input.projectId });
    if (engine) await this.job(task, 'engine', engine, { action: 'validate', plan: { steps: steps.map(s => pick(s, ['stepId', 'dependsOn', 'bindings'])) } });
    const buildId = id('build'); this.ledger.append({ type: 'build', buildId, plan }); this.builds.set(buildId, clone(plan));
    return { buildId, workflowId: plan.workflowId, planRevision: plan.planRevision, pins: clone(plan.pins), recordContext: clone(plan.recordContext), taskId, deterministicDigest: hash(steps.map(s => ({ operationId: s.selected.contract.operationId, input: s.input, pin: s.selected.pin }))) };
  }
  propose({ buildId }) {
    const plan = this.builds.get(buildId); if (!plan) fail('server_build_required'); this.current(plan.taskId, plan.taskEpoch);
    const proposal = { type: 'proposal', proposalId: id('proposal'), buildId, taskId: plan.taskId, taskEpoch: plan.taskEpoch, planDigest: hash(plan), createdAt: Date.now() };
    if (!this.authority) fail('private_grant_required');
    const approval = this.approval(proposal, plan);
    this.authority.registerProposal(approval);
    this.ledger.append(proposal); this.proposals.set(proposal.proposalId, proposal);
    const confirmation = plan.steps.some(step => step.executionPolicy?.operatorConfirmation) ? { operatorApprovalDigest: hash(approval) } : {};
    return { proposalId: proposal.proposalId, planRevision: plan.planRevision, taskId: plan.taskId, confirmationRequired: true, effects: plan.steps.map(s => ({ stepId: s.stepId, target: pick(s.desiredInput, s.selected.contract.effectPolicy.targetFields), effect: s.selected.contract.effectPolicy.effect, input: clone(s.input), expectedSnapshotDigest: hash(s.initialEvidence), modulePin: s.selected.pin })), pins: clone(plan.pins), ...confirmation };
  }
  approvalStep(step, proposal) {
    const base = { stepId: step.stepId, moduleId: step.selected.moduleId, operationId: step.selected.contract.operationId, modulePin: step.selected.pin, admissionPin: hash(step.selected.admission), input: clone(step.input), target: pick(step.desiredInput, step.selected.contract.effectPolicy.targetFields), effectPolicy: clone(step.selected.contract.effectPolicy), expectedSnapshotDigest: hash(step.initialEvidence) };
    if (step.executionPolicy) {
      base.executionPolicy = clone(step.executionPolicy);
      base.checkpoint = { kind: step.selected.contract.effectPolicy.checkpointKind, digest: hash({ proposalId: proposal.proposalId, planDigest: proposal.planDigest, ...base, preimage: step.initialEvidence }) };
    }
    return base;
  }
  approval(proposal, plan) {
    return { proposalId: proposal.proposalId, planDigest: proposal.planDigest, taskId: plan.taskId, taskEpoch: plan.taskEpoch, steps: plan.steps.map(step => this.approvalStep(step, proposal)) };
  }
  proposal(proposalId) {
    const proposal = this.proposals.get(proposalId); if (!proposal) fail('server_proposal_required');
    const plan = this.builds.get(proposal.buildId); if (!plan || hash(plan) !== proposal.planDigest) fail('proposal_integrity');
    this.current(plan.taskId, plan.taskEpoch); return { proposal, plan };
  }
  async dryrun({ proposalId }) {
    const { plan } = this.proposal(proposalId); this.ensureConnection();
    if (this.ledger.corrupt) fail('ledger_corrupt');
    if (canonical(plan.pins.transport || null) !== canonical(this.transportIdentity || null)) fail('transport_pin_changed');
    for (const step of plan.steps) this.artifacts.recheck(step.selected);
    const dryrunRef = id('dryrun'); const result = { dryrunRef, proposalId, taskEpoch: plan.taskEpoch, createdAt: Date.now(), structural: true, freshness: 'each-step-reinspected-immediately-before-send' };
    this.dryruns.set(dryrunRef, result); return clone(result);
  }
  engineEvent(plan, event) { this.ledger.append({ type: 'engine', workflowId: plan.workflowId, event }); }
  validateReadback(selected, input, before, after) {
    const target = pick(input, selected.contract.effectPolicy.targetFields); this.snapshot(selected, after, target);
    for (const [observed, desired] of Object.entries(selected.contract.effectPolicy.resultBindings)) if (canonical(after[observed]) !== canonical(input[desired])) fail('readback_result');
    for (const field of selected.contract.effectPolicy.preserve) if (canonical(after[field]) !== canonical(before[field])) fail('readback_protected');
    return after;
  }
  checkFence(target) {
```

## `core4/core/broker.js:387–426`
Полный файл SHA256 (hex groups, concatenate) `259384bb:b699742a:ccd5c61e:e123723c:295f2c40:52a76c25:895ef83e:a1a9c460`; Git blob `48a7208c:de9ef725:86f33c6a:585c40d7:7f5f3f55`. Выдержка: строки 387–426, 3568 bytes.

```javascript
  async run({ proposalId, dryrunRef }) {
    const { proposal, plan } = this.proposal(proposalId); const dryrun = this.dryruns.get(dryrunRef);
    if (!dryrun || dryrun.proposalId !== proposalId || dryrun.taskEpoch !== plan.taskEpoch || Date.now() - dryrun.createdAt > 5000) {
      const error = Object.assign(new Error('fresh_dryrun_required'), { code: 'fresh_dryrun_required' });
      freshDryrunRefusals.add(error);
      throw error;
    }
    this.ensureConnection(); if (this.running || this.reconciling || this.controlPending) fail('broker_busy');
    this.dryruns.delete(dryrunRef);
    if (canonical(plan.pins.transport || null) !== canonical(this.transportIdentity || null)) fail('transport_pin_changed');
    if (this.ledger.unresolved().some(c => c.taskId === plan.taskId)) fail('reconciliation_required');
    this.running = true; const runId = id('run'); const outputs = {};
    try {
      const events = this.ledger.workflow(plan.workflowId);
      const completions = this.ledger.commands().filter(c => c.workflowId === plan.workflowId && c.state === 'succeeded').map(c => pick(c, ['stepId', 'inputDigest', 'commandId']));
      const decisions = plan.oneStep ? { steps: plan.steps.map(s => { const c = completions.find(c => c.stepId === s.stepId && c.inputDigest === s.inputDigest); return { stepId: s.stepId, action: c ? 'reinspect_success' : 'execute', ...(c ? { commandId: c.commandId } : {}) }; }) } : await this.job({ taskId: plan.taskId, epoch: plan.taskEpoch }, 'engine', plan.engine, { action: 'resume', plan: { steps: plan.steps.map(s => pick(s, ['stepId', 'inputDigest'])) }, events, completions });
      exact(decisions, ['steps']);
      if (!Array.isArray(decisions.steps) || decisions.steps.length !== plan.steps.length) fail('engine_decision');
      this.engineEvent(plan, { kind: 'run_started', runId, planRevision: plan.planRevision });
      for (let index = 0; index < plan.steps.length; index++) {
        const step = plan.steps[index], decision = decisions.steps[index]; exact(decision, ['stepId', 'action', 'commandId']);
        if (decision.stepId !== step.stepId) fail('engine_decision');
        for (const dependency of step.dependsOn) if (!outputs[dependency]) fail('dependency_unsatisfied');
        const completed = this.ledger.commands().find(c => c.workflowId === plan.workflowId && c.stepId === step.stepId && c.state === 'succeeded' && c.inputDigest === step.inputDigest);
        if (completed) {
          if (decision.action !== 'reinspect_success' || decision.commandId !== completed.commandId) fail('engine_false_replay');
          this.artifacts.recheck(completed.selected);
          const current = this.snapshot(completed.selected, await this.send(completed.selected, 'verify', completed.input), completed.target);
          if (canonical(current) !== canonical(completed.after)) fail('successful_step_drift');
          outputs[step.stepId] = current;
        } else {
          if (decision.action !== 'execute') fail('engine_false_success');
          outputs[step.stepId] = await this.executeStep({ plan, step, proposal, runId, outputs });
        }
      }
      this.engineEvent(plan, { kind: 'run_succeeded', runId });
      return { runId, workflowId: plan.workflowId, state: 'succeeded', outputs, synthetic: !!this.authority.synthetic };
    } catch (e) { return { runId, workflowId: plan.workflowId, state: 'stopped', code: e.code || 'execution_failed', message: e.message, task: this.getTask({ taskId: plan.taskId }) }; }
    finally { this.running = false; this.releaseIfDrained(); }
  }
```
