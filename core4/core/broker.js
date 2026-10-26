'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { Artifacts } = require('./artifacts');
const { Ledger } = require('./ledger');
const { WorkerClient } = require('./worker-client');
const { Resources } = require('./resources');
const { acquireStateLock } = require('./state-lock');
const { recordContext } = require('./record-context');
const { validatePort } = require('./authority');
const { check } = require('../protocol/schema');
const { encode, decode } = require('../protocol/codec');
const { hash, canonical, exact, fail, id, bounded } = require('../protocol/json');
const clone = value => JSON.parse(canonical(value));
const pick = (object, fields) => Object.fromEntries(fields.map(k => [k, object[k]]));
class Broker {
  constructor({ root = path.resolve(__dirname, '..'), stateDir, trace, workerTimeout, transportTimeout = 2000, privateEmbedding } = {}) {
    if (!stateDir) fail('explicit_state_directory_required');
    this.stateLock = acquireStateLock(stateDir);
    this.closed = false; this.ledger = new Ledger(path.join(stateDir, 'ledger.ndjson')); this.ledger.ownerFault = this.stateLock.error; this.ledger.writeGuard = () => !this.closed;
    this.artifacts = new Artifacts({ root, store: path.join(stateDir, 'artifacts'), trace });
    this.worker = new WorkerClient({ timeout: workerTimeout, runtime: this.artifacts.runtime });
    this.transportTimeout = transportTimeout; this.contracts = new Map(); this.evidence = new Map(); this.builds = new Map(); this.proposals = new Map(); this.dryruns = new Map();
    this.controllerId = id('controller'); this.channelEpoch = id('channel'); this.secret = crypto.randomBytes(32).toString('hex');
    this.connected = false; this.running = false; this.controllerBusy = false; this.controlPending = 0; this.hooks = {};
    if (privateEmbedding) {
      this.authority = validatePort(privateEmbedding.authority);
      this.transport = privateEmbedding.transport; this.hooks = privateEmbedding.hooks || {};
      this.defaultRecordContext = privateEmbedding.recordContext;
    }
    this.resources = new Resources(this.ledger, this.authority?.resourceConstraints || []);
    for (const e of this.ledger.events) {
      if (e.type === 'evidence') this.evidence.set(e.evidenceRef, e);
      if (e.type === 'build') this.builds.set(e.buildId, e.plan);
      if (e.type === 'proposal') this.proposals.set(e.proposalId, e);
    }
  }
  status() {
    return { ready: !this.closed, closed: this.closed, pid: process.pid, coreIdentity: this.artifacts.coreIdentity, protocolPin: this.artifacts.protocolPin, connection: this.connected ? 'connected' : 'unavailable', unavailableReason: this.closed ? 'broker_closed' : this.stateLock.error || (this.transport ? null : 'live_transport_not_installed'), synthetic: !!this.authority?.synthetic, ledgerFault: !!this.ledger.corrupt, ownershipFault: this.stateLock.error, unresolved: this.ledger.unresolved().map(c => ({ commandId: c.commandId, taskId: c.taskId, state: c.state, target: c.target })), worker: this.worker.status() };
  }
  diagnostics() { return { ...this.status(), catalogRevision: this.artifacts.catalog.catalogRevision, catalogError: this.artifacts.catalogError, controllerBusy: this.controllerBusy, resourceDiagnostics: this.resources.diagnostics }; }
  async connect() {
    if (this.closed) return { available: false, reason: 'broker_closed' };
    if (this.stateLock.error) return { available: false, reason: this.stateLock.error };
    if (!this.transport || !this.authority) return { available: false, reason: 'live_transport_not_installed' };
    if (this.connected) return { available: true, synthetic: !!this.authority.synthetic };
    this.controlPending++;
    try {
    const binding = await this.transport.connect({ controllerId: this.controllerId, channelEpoch: this.channelEpoch, secret: this.secret });
    if (this.closed) return { available: false, reason: 'broker_closed' };
    if (!binding?.sessionBinding || binding.sessionBinding.kind !== 'project-incarnation' || binding.sessionBinding.lifecycleVerified !== true) return { available: false, reason: 'trusted_project_lifecycle_unavailable' };
    this.sessionBinding = binding.sessionBinding; this.connected = true;
    return { available: true, synthetic: !!this.authority.synthetic };
    } finally { this.controlPending--; this.releaseIfDrained(); }
  }
  async disconnect() {
    if (this.closed) return { disconnected: false, reason: 'broker_closed', unresolvedPreserved: this.ledger.unresolved().length };
    this.connected = false;
    this.controlPending++;
    try { if (this.transport) await this.transport.disconnect(); }
    finally { this.controlPending--; this.releaseIfDrained(); }
    return { disconnected: true, unresolvedPreserved: this.ledger.unresolved().length };
  }
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
  current(taskId, epoch) { if (this.closed) fail('broker_closed'); const task = this.ledger.task(taskId); if (task.reset || task.epoch !== epoch) fail('stale_task_epoch'); return task; }
  async hook(name, data) { if (this.hooks[name]) await this.hooks[name](data, this); }
  async job(task, method, selected, payload) {
    this.current(task.taskId, task.epoch); this.artifacts.verifyCopy(selected);
    const result = await this.worker.request({ taskId: task.taskId, taskEpoch: task.epoch, method, componentPins: pick(selected, ['pin', 'path', 'manifest']), payload });
    this.current(task.taskId, task.epoch); return result;
  }
  async send(selected, phase, payload, commandId = id(phase), onDispatched) {
    this.ensureConnection(); if (this.controllerBusy) fail('controller_busy');
    if (phase !== 'verify' && this.ledger.unresolved().some(c => c.commandId !== commandId)) fail('controller_unresolved');
    this.artifacts.recheck(selected);
    const body = { protocolVersion: 1, controllerId: this.controllerId, channelEpoch: this.channelEpoch, commandId, moduleId: selected.moduleId, operationId: selected.contract.operationId, executorHash: selected.admission.executorHash, phase, payloadHash: hash(canonical(payload)), payload };
    bounded(body); this.controllerBusy = true;
    let actual;
    try { actual = Promise.resolve(this.transport.send(encode(body, this.secret))); }
    catch (e) { this.controllerBusy = false; throw e; }
    const pending = actual.then(frame => {
      const response = decode(frame, this.secret);
      exact(response, ['protocolVersion', 'commandId', 'executorHash', 'payloadHash', 'result']);
      if (response.protocolVersion !== 1 || response.commandId !== commandId || response.executorHash !== body.executorHash || response.payloadHash !== body.payloadHash) fail('response_correlation');
      return response.result;
    }).finally(() => { this.controllerBusy = false; this.releaseIfDrained(); });
    // Late results may inform reconciliation, never continue a reset/expired workflow.
    pending.catch(() => {});
    if (onDispatched) onDispatched();
    let timer;
    try { const result = await Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('transport_timeout'), { code: 'transport_timeout' })), this.transportTimeout); })]); if (this.closed) fail('broker_closed'); return result; }
    finally { clearTimeout(timer); }
  }
  snapshot(selected, result, target) {
    check(selected.contract.snapshotSchema, result);
    if (canonical(result.target) !== canonical(target)) fail('snapshot_target'); return result;
  }
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
    exact(args, ['taskId', 'workflowId', 'steps', 'recordContext']);
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
      const intent = await this.job(task, 'build', selected, { input: request.input, evidence: evidence.snapshot });
      const input = this.validateIntent(selected, intent, request.input, evidence.snapshot);
      steps.push({ stepId: request.stepId, selected, input, desiredInput: request.input, inputDigest: hash({ input: request.input, modulePin: selected.pin, bindings: request.bindings || [] }), dependsOn: request.dependsOn || [], bindings: request.bindings || [], initialEvidence: evidence.snapshot });
    }
    const engine = this.artifacts.selectEngine(); const plan = { workflowId: args.workflowId || id('workflow'), planRevision: id('revision'), taskId, taskEpoch: task.epoch, engine, steps, pins: { core: this.artifacts.coreIdentity, protocol: this.artifacts.protocolPin, engine: engine.pin, modules: steps.map(s => ({ stepId: s.stepId, module: s.selected.pin, admission: hash(s.selected.admission), dependencies: s.selected.publicDependencies })) } };
    plan.recordContext = recordContext(args.recordContext || this.defaultRecordContext, { taskId, projectId: steps[0].input.projectId });
    await this.job(task, 'engine', engine, { action: 'validate', plan: { steps: steps.map(s => pick(s, ['stepId', 'dependsOn', 'bindings'])) } });
    const buildId = id('build'); this.ledger.append({ type: 'build', buildId, plan }); this.builds.set(buildId, clone(plan));
    return { buildId, workflowId: plan.workflowId, planRevision: plan.planRevision, pins: clone(plan.pins), recordContext: clone(plan.recordContext), taskId, deterministicDigest: hash(steps.map(s => ({ operationId: s.selected.contract.operationId, input: s.input, pin: s.selected.pin }))) };
  }
  propose({ buildId }) {
    const plan = this.builds.get(buildId); if (!plan) fail('server_build_required'); this.current(plan.taskId, plan.taskEpoch);
    const proposal = { type: 'proposal', proposalId: id('proposal'), buildId, taskId: plan.taskId, taskEpoch: plan.taskEpoch, planDigest: hash(plan), createdAt: Date.now() };
    this.ledger.append(proposal); this.proposals.set(proposal.proposalId, proposal);
    return { proposalId: proposal.proposalId, planRevision: plan.planRevision, taskId: plan.taskId, confirmationRequired: true, effects: plan.steps.map(s => ({ stepId: s.stepId, target: pick(s.desiredInput, s.selected.contract.effectPolicy.targetFields), effect: s.selected.contract.effectPolicy.effect, input: clone(s.input), expectedSnapshotDigest: hash(s.initialEvidence), modulePin: s.selected.pin })), pins: clone(plan.pins) };
  }
  proposal(proposalId) {
    const proposal = this.proposals.get(proposalId); if (!proposal) fail('server_proposal_required');
    const plan = this.builds.get(proposal.buildId); if (!plan || hash(plan) !== proposal.planDigest) fail('proposal_integrity');
    this.current(plan.taskId, plan.taskEpoch); return { proposal, plan };
  }
  async dryrun({ proposalId }) {
    const { plan } = this.proposal(proposalId); this.ensureConnection();
    if (this.ledger.corrupt) fail('ledger_corrupt');
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
    if (this.ledger.corrupt) fail('ledger_corrupt');
    if (this.ledger.unresolved().some(c => c.target.projectId === target.projectId && c.target.sessionId === target.sessionId)) fail('resource_fenced');
  }
  async materialize(plan, step, outputs) {
    const desired = clone(step.desiredInput);
    for (const binding of step.bindings) {
      const output = outputs[binding.fromStep]; if (!output) fail('binding_dependency');
      const [container, field] = binding.from.split('.'); desired[binding.to] = output[container][field];
    }
    // M1 proposals approve exact neutral identities. Bindings can carry dependency proof,
    // but changing an approved resource requires a new build/proposal/confirmation.
    const identityFields = step.selected.contract.effectPolicy.targetFields;
    if (canonical(pick(desired, identityFields)) !== canonical(pick(step.desiredInput, identityFields))) fail('binding_changes_approved_target');
    check(step.selected.contract.buildSchema, desired);
    const target = pick(desired, step.selected.contract.effectPolicy.targetFields);
    const before = this.snapshot(step.selected, await this.send(step.selected, 'inspect', target), target);
    if (canonical(before) !== canonical(step.initialEvidence)) fail('approved_target_drift');
    const intent = await this.job({ taskId: plan.taskId, epoch: plan.taskEpoch }, 'build', step.selected, { input: desired, evidence: before });
    const input = this.validateIntent(step.selected, intent, desired, before);
    return { input, before, target };
  }
  async executeStep({ plan, step, proposal, runId, outputs }) {
    const { input, before, target } = await this.materialize(plan, step, outputs);
    this.checkFence(target); this.current(plan.taskId, plan.taskEpoch);
    const policy = step.selected.contract.effectPolicy;
    const grant = this.authority.authorize({ proposalId: proposal.proposalId, input, effectPolicy: clone(policy), target: clone(target), taskId: plan.taskId });
    if (!grant || !grant.owner || (policy.requiresCheckpoint && !grant.checkpointRef) || grant.allowedEffect !== policy.effect) fail('private_grant_required');
    this.resources.authorize(target, policy, grant, before);
    const attemptId = id('attempt'); const commandId = id('command');
    const dryrun = { kind: 'step_dryrun', runId, stepId: step.stepId, attemptId, target, inputDigest: hash(input), snapshotRevision: before.revision, modulePin: step.selected.pin };
    this.engineEvent(plan, dryrun);
    await this.hook('afterAuthorize', { commandId, step });
    this.current(plan.taskId, plan.taskEpoch); this.checkFence(target); this.artifacts.recheck(step.selected); this.resources.authorize(target, policy, grant, before);
    await this.hook('beforeIntent', { commandId, step });
    const guard = () => {
      this.current(plan.taskId, plan.taskEpoch); this.artifacts.recheck(step.selected);
      const freshGrant = this.authority.authorize({ proposalId: proposal.proposalId, input, effectPolicy: clone(policy), target: clone(target), taskId: plan.taskId });
      if (canonical(freshGrant) !== canonical(grant)) fail('private_grant_changed');
      this.resources.authorize(target, policy, freshGrant, before);
    };
    guard();
    const receipt = { type: 'intent', commandId, taskId: plan.taskId, taskEpoch: plan.taskEpoch, workflowId: plan.workflowId, planRevision: plan.planRevision, recordContext: plan.recordContext, runId, stepId: step.stepId, attemptId, inputDigest: step.inputDigest, input, before, target, selected: step.selected, grant, dispatchedAt: Date.now() };
    this.ledger.append(receipt);
    await this.hook('afterIntent', receipt);
    // No await exists between this epoch check and physical dispatch. A crash after intent
    // remains UNKNOWN even when it happened before send: conservative, never replayed.
    try { guard(); }
    catch (e) { this.ledger.append({ type: 'command', commandId, state: 'rejected', code: e.code || 'gate_revoked_before_send' }); throw e; }
    let mutation;
    try {
      mutation = await this.send(step.selected, 'mutate', input, commandId, () => { if (this.hooks.afterPhysicalSend) this.hooks.afterPhysicalSend(receipt, this); });
      await this.hook('afterSend', receipt);
      exact(mutation, ['outcome', 'snapshot', 'code']);
      if (mutation.outcome === 'rejected') { this.ledger.append({ type: 'command', commandId, state: 'rejected', code: mutation.code || 'executor_rejected' }); fail('executor_rejected', mutation.code); }
      if (mutation.outcome !== 'applied') fail('mutation_unknown');
      this.snapshot(step.selected, mutation.snapshot, target);
      this.ledger.append({ type: 'command', commandId, state: 'acknowledged' });
      await this.hook('afterAck', receipt);
      this.current(plan.taskId, plan.taskEpoch);
      await this.hook('beforeReadback', receipt);
      const after = this.validateReadback(step.selected, input, before, await this.send(step.selected, 'verify', input));
      await this.hook('afterReadback', receipt);
      this.ledger.append({ type: 'command', commandId, state: 'succeeded', after });
      await this.hook('afterSuccessRecord', receipt);
      this.engineEvent(plan, { kind: 'succeeded', runId, stepId: step.stepId, attemptId, commandId, inputDigest: step.inputDigest, output: after });
      return after;
    } catch (e) {
      // Receipt and fence are retained after every uncertain boundary. No automatic retry.
      this.engineEvent(plan, { kind: 'fault', runId, stepId: step.stepId, attemptId, commandId, code: e.code || 'unknown' }); throw e;
    }
  }
  async run({ proposalId, dryrunRef }) {
    const { proposal, plan } = this.proposal(proposalId); const dryrun = this.dryruns.get(dryrunRef);
    if (!dryrun || dryrun.proposalId !== proposalId || dryrun.taskEpoch !== plan.taskEpoch || Date.now() - dryrun.createdAt > 5000) fail('fresh_dryrun_required');
    this.dryruns.delete(dryrunRef); this.ensureConnection(); if (this.running) fail('broker_busy');
    if (this.ledger.unresolved().some(c => c.taskId === plan.taskId)) fail('reconciliation_required');
    this.running = true; const runId = id('run'); const outputs = {};
    try {
      const events = this.ledger.workflow(plan.workflowId);
      const completions = this.ledger.commands().filter(c => c.workflowId === plan.workflowId && c.state === 'succeeded').map(c => pick(c, ['stepId', 'inputDigest', 'commandId']));
      const decisions = await this.job({ taskId: plan.taskId, epoch: plan.taskEpoch }, 'engine', plan.engine, { action: 'resume', plan: { steps: plan.steps.map(s => pick(s, ['stepId', 'inputDigest'])) }, events, completions });
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
  getTask({ taskId }) {
    const commands = this.ledger.commands(taskId);
    return { ...this.ledger.task(taskId), commands: commands.map(c => ({ commandId: c.commandId, workflowId: c.workflowId, runId: c.runId, stepId: c.stepId, attemptId: c.attemptId, state: c.state, target: c.target, modulePin: c.selected.pin, ...(c.after ? { after: c.after } : {}) })) };
  }
  reset({ taskId }) {
    const previous = this.ledger.task(taskId); const task = { type: 'task', taskId, epoch: previous.epoch + 1, reset: true }; this.ledger.append(task);
    this.worker.resetTask(taskId, task.epoch);
    return { ...this.getTask({ taskId }), resetScope: 'queued-unsent-only; command receipts and fences preserved' };
  }
  async reconcile({ taskId }) {
    this.ensureConnection();
    for (const command of this.ledger.commands(taskId).filter(c => !['succeeded', 'rejected'].includes(c.state))) {
      const proof = decode(await this.transport.completion(command.commandId), this.secret);
      exact(proof, ['commandId', 'state', 'response']);
      if (proof.commandId !== command.commandId) fail('completion_correlation');
      if (proof.state !== 'completed' || !proof.response) continue;
      const response = proof.response; exact(response, ['protocolVersion', 'commandId', 'executorHash', 'payloadHash', 'result']);
      if (response.protocolVersion !== 1 || response.commandId !== command.commandId || response.executorHash !== command.selected.admission.executorHash || response.payloadHash !== hash(canonical(command.input))) fail('completion_correlation');
      exact(response.result, ['outcome', 'snapshot', 'code']);
      if (response.result.outcome === 'rejected') { this.ledger.append({ type: 'command', commandId: command.commandId, state: 'rejected', code: response.result.code || 'reconciled_rejection' }); continue; }
      if (response.result.outcome !== 'applied') continue;
      // Matching target values without original command-completion proof never reach this branch.
      const after = this.validateReadback(command.selected, command.input, command.before, await this.send(command.selected, 'verify', command.input));
      this.ledger.append({ type: 'command', commandId: command.commandId, state: 'succeeded', after });
      this.ledger.append({ type: 'engine', workflowId: command.workflowId, event: { kind: 'succeeded', runId: command.runId, stepId: command.stepId, attemptId: command.attemptId, commandId: command.commandId, inputDigest: command.inputDigest, output: after, reconciled: true } });
    }
    return this.getTask({ taskId });
  }
  releaseIfDrained() { if (this.closed && !this.running && !this.controllerBusy && !this.controlPending && !this.released) { this.stateLock.release(); this.released = true; } }
  close() { this.closed = true; this.connected = false; this.worker.stop(); this.releaseIfDrained(); }
}
module.exports = { Broker };
