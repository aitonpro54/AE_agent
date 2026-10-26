'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Broker } = require('../core/broker');
const { syntheticAuthority } = require('./fixtures/authority');
const { initialState, fixtureTransport, lifecycleFor } = require('./fixtures/ae');
const SOURCE = path.resolve(__dirname, '..');
function workspace() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-core4-')); const root = path.join(temp, 'core4');
  fs.cpSync(SOURCE, root, { recursive: true }); return { temp, root, stateDir: path.join(temp, 'broker-state') };
}
function seal(root) { return execFileSync(process.execPath, [path.join(root, 'tools/seal.js'), '--all', '--reviewed-source'], { encoding: 'utf8', windowsHide: true }); }
function fixture(options = {}) {
  const ws = options.workspace || workspace(); let state = options.state || initialState();
  const transport = options.transport || fixtureTransport({ root: ws.root, state, ...options.transportOptions });
  state = transport.state || state;
  const lifecycle = transport.lifecycle || lifecycleFor(state);
  const authority = syntheticAuthority({ sessionId: state.sessionId, projectId: state.projectId, lifecycle, owner: 'synthetic-fixture-owner', checkpointRef: 'synthetic-checkpoint:' + state.sessionId, effects: ['layer.source', 'layer.text'] });
  const recordContext = { purpose: 'technical_check', lifetime: 'ephemeral_check', contextId: 'core4-synthetic-fixture', project: { file: state.projectId }, resources: [{ kind: 'project', identity: state.projectId }] };
  const broker = new Broker({ root: ws.root, stateDir: ws.stateDir, trace: options.trace, workerTimeout: options.workerTimeout || 1000, transportTimeout: options.transportTimeout || 1000, privateEmbedding: { authority, transport, hooks: options.hooks || {}, recordContext } });
  return { ...ws, broker, authority, transport, lifecycle, state: transport.state, close: () => broker.close() };
}
function target(f, title = false) { return { sessionId: f.state.sessionId, projectId: f.state.projectId, compId: 1, layerId: title ? 102 : 101 }; }
async function requestStep(f, moduleId, stepId = moduleId) {
  const title = moduleId === 'titles'; const contract = f.broker.getContract({ moduleId });
  const resource = target(f, title); const inspection = await f.broker.inspect({ moduleId, contractId: contract.contractId, target: resource });
  return { stepId, moduleId, contractId: contract.contractId, evidenceRef: inspection.evidenceRef, input: { ...resource, ...(title ? { text: 'After' } : { newSourceId: 12 }) }, dependsOn: [] };
}
async function prepare(f, mixed = false, options = {}) {
  await f.broker.connect();
  const steps = mixed ? [await requestStep(f, 'photo-placeholder', 'photo'), await requestStep(f, 'titles', 'titles')] : [await requestStep(f, 'titles', 'titles')];
  if (mixed) { steps[1].dependsOn = ['photo']; steps[1].bindings = [{ fromStep: 'photo', from: 'target.projectId', to: 'projectId' }]; }
  const built = await f.broker.build({ taskId: options.taskId || 'task-fixture', workflowId: options.workflowId || 'workflow-fixture', steps });
  const proposed = f.broker.propose({ buildId: built.buildId }); if (options.confirm !== false) f.authority.confirm(proposed.proposalId);
  return { ...built, ...proposed, steps };
}
async function run(f, plan) { const dryrun = await f.broker.dryrun({ proposalId: plan.proposalId }); return f.broker.run({ proposalId: plan.proposalId, dryrunRef: dryrun.dryrunRef }); }
function rewrite(root, file, transform) { const absolute = path.join(root, file); fs.writeFileSync(absolute, transform(fs.readFileSync(absolute, 'utf8'))); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = { SOURCE, workspace, seal, fixture, target, requestStep, prepare, run, rewrite, delay };
