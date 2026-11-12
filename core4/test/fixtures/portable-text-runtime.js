'use strict';
// Private TEMP installed-runtime fixture. Production selection/authority/HTTP
// validators stay intact; only Windows observation and the AE host are simulated.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http');
const { PassThrough } = require('node:stream');
const { workspace } = require('../helpers');
const { canonical, hash } = require('../../protocol/json');
const { buildPackage } = require('../../tools/package-installable');
const { planInstall, applyInstall } = require('../../tools/install-core4');
const { initialState } = require('./ae');
const { textEnvironment } = require('./text-layer-ae');
const { mac } = require('../../integrations/cep/peer-protocol');
const moduleId = 'fixture-owned-text-layer';

function fixturePackage(t, profile = 'owned-text-layer-v1', operatorConfirmation) {
  const f = workspace(), closers = [];
  t.after(async () => { try { for (const close of closers.reverse()) await close(); } finally { fs.rmSync(f.temp, { recursive: true, force: true }); } });
  const json = file => JSON.parse(fs.readFileSync(path.join(f.root, file)));
  const put = (file, value) => { const target = path.join(f.root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, canonical(value)); };
  fs.cpSync(path.join(f.root, 'modules/text-layer'), path.join(f.root, 'modules', moduleId), { recursive: true });
  const base = 'modules/' + moduleId + '/', contract = json(base + 'contract.json'); contract.moduleId = moduleId;
  put(base + 'contract.json', contract);
  const artifact = json(base + 'artifact.json'); artifact.id = moduleId; artifact.hashes['contract.json'] = hash(canonical(contract)); put(base + 'artifact.json', artifact);
  const admission = json('config/admissions/text-layer.json');
  admission.moduleId = moduleId; admission.artifactHash = hash(artifact); admission.schemaHash = hash(contract.inputSchema);
  admission.trustApprovalId = 'isolated-portable-profile-reviewed-fixture';
  put('config/admissions/' + moduleId + '.json', admission);
  put('config/compositions/fixture-portable-text.json', {
    parent: 'readonly', modules: [moduleId],
    assets: [{ assetKey: moduleId + '-v1', moduleId, path: 'modules/' + moduleId,
      admission: 'config/admissions/' + moduleId + '.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] }],
    profiles: { [moduleId]: { operationId: contract.operationId, resultProfile: profile, ...(operatorConfirmation === undefined ? {} : { operatorConfirmation }) } },
    bundle: { files: ['runtime/manual-policy.js', 'runtime/windows-reservation-provider.js', 'runtime/text-layer-proof.js', 'config/admissions/' + moduleId + '.json', ...(operatorConfirmation === undefined ? [] : ['runtime/operator-confirmation.js'])],
      artifactClosures: [base + 'artifact.json', 'plan-engine/artifact.json'] }
  });
  const pkg = buildPackage(f.root, 'fixture-portable-text', operatorConfirmation === undefined ? {} : { runtimeModel: 'owner' });
  assert.equal(Object.keys(pkg.files).some(file => file.startsWith('modules/text-layer/')), false);
  return { ...f, pkg, closers };
}

async function runtime(t, { confirm = () => true, corruptReceipt = false } = {}) {
  const f = fixturePackage(t), installRoot = path.join(f.temp, 'AEAgentCore4'), configPath = path.join(f.temp, 'project/config.toml');
  fs.mkdirSync(path.dirname(configPath)); fs.writeFileSync(configPath, '# isolated fixture\n');
  const plan = planInstall({ pkg: f.pkg, installRoot, extensionsDir: path.join(f.temp, 'extensions'), configPath, nodePath: fs.realpathSync(process.execPath) });
  for (const file of [plan.descriptor.installRoot, plan.descriptor.releaseDir, plan.descriptor.stateDir, plan.descriptor.cepDir, plan.descriptorPath, plan.configPath]) assert.ok(path.resolve(file).startsWith(f.temp + path.sep), file);
  applyInstall(plan); const d = plan.descriptor;
  const from = file => require(path.join(d.releaseDir, file));
  const providerModule = from('runtime/windows-reservation-provider.js'), brokerModule = from('core/broker.js'), peerModule = from('integrations/cep/http-peer.js');
  const readinessModule = from('runtime/ae-readiness.js'), proofModule = from('runtime/text-layer-proof.js');
  const originals = { provider: providerModule.createWindowsReservationProvider, Broker: brokerModule.Broker, peer: peerModule.createHttpPeer, readiness: readinessModule.createAeReadiness, proof: proofModule.validateTextLayerCompletion };
  let provider, broker, peer, runtimeHandle, pump, stopped = false, confirmations = 0, proofCalls = 0, corruptedReceipts = 0;
  const state = initialState(); delete state.sessionId;
  const observation = () => ({ version: 1, observedAt: new Date().toISOString(), hostname: d.machineId,
    processes: [{ pid: 123456, birth: '2026-01-01T00:00:00.0000000Z', executablePath: 'C:/fixture/AfterFX.exe', executableHash: '5'.repeat(64) }],
    endpoints: [{ port: 3456, state: 'observed-absent' }, { port: 8787, state: 'observed-absent' }], completedAt: Date.now() });
  providerModule.createWindowsReservationProvider = options => (provider = originals.provider({ ...options, probe: async () => observation() }));
  brokerModule.Broker = class extends originals.Broker { constructor(options) { super(options); broker = this; } };
  peerModule.createHttpPeer = options => (peer = originals.peer(options));
  readinessModule.createAeReadiness = () => originals.readiness({ platform: 'fixture' });
  proofModule.validateTextLayerCompletion = (...args) => { proofCalls++; return originals.proof(...args); };
  const input = new PassThrough(), output = new PassThrough(), pending = new Map(); let buffer = '', serial = 0;
  output.on('data', bytes => { buffer += bytes; while (buffer.includes('\n')) { const end = buffer.indexOf('\n'), value = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); pending.get(value.id)?.(value); pending.delete(value.id); } });
  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++serial; pending.set(id, resolve); input.write(canonical({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  f.closers.push(async () => { stopped = true; input.end(); await runtimeHandle?.close(); await pump?.catch(() => {}); });
  try { runtimeHandle = await from('runtime/stdio-entry.js').start({ descriptor: plan.descriptorPath, port: 0, input, output }); }
  finally {
    providerModule.createWindowsReservationProvider = originals.provider; brokerModule.Broker = originals.Broker;
    peerModule.createHttpPeer = originals.peer; readinessModule.createAeReadiness = originals.readiness; proofModule.validateTextLayerCompletion = originals.proof;
  }
  assert.ok(provider && broker && peer, 'production start constructs the real policy, Broker and HTTP peer');
  await provider.adopt({ expected: { machineId: d.machineId, aePid: 123456, aeProcessBirth: '2026-01-01T00:00:00.0000000Z', executablePath: 'C:/fixture/AfterFX.exe', executableHash: '5'.repeat(64) }, allowedProject: state.projectId, rootObservationDigest: '6'.repeat(64) });
  const port = runtimeHandle.status().physical.port;
  const raw = (route, value) => new Promise((resolve, reject) => {
    const request = http.request('http://127.0.0.1:' + port + route, { method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => {
      let bytes = ''; response.on('data', b => { bytes += b; }); response.on('end', () => {
        try { const parsed = JSON.parse(bytes); assert.equal(response.statusCode, 200, bytes); resolve(parsed); } catch (e) { reject(e); }
      });
    }); request.on('error', reject); request.end(canonical(value));
  });
  const loadedPanel = from('integrations/cep/panel-identity.js').verify(file => fs.readFileSync(path.join(d.releaseDir, file)));
  const challenge = await raw('/challenge', { role: 'panel' }), peerId = 'portable-profile-fixture';
  const claim = { challenge, peerId, loadedPanel, extensionRoot: d.cepDir.replace(/\\/g, '/') };
  const link = await raw('/link', { ...claim, proof: mac(claim, d.panelToken) }); let sequence = 0;
  async function call(route, payload) {
    const body = { epoch: challenge.epoch, peerId, sequence: ++sequence, method: 'POST', path: route, payload: JSON.parse(JSON.stringify(payload)) };
    const response = await raw(route, { body, mac: mac(body, d.panelToken) }); assert.equal(response.mac, mac(response.body, d.panelToken)); return response.body.payload;
  }
  const context = vm.createContext({ ...textEnvironment(state, () => {}), JSON: undefined, confirm: message => { confirmations++; return confirm({ state, message }); } });
  vm.runInContext('Object.keys=undefined;', context);
  vm.runInContext(Buffer.from(f.pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
  assert.equal(context.AECore4Host.identity().registryBuildId, loadedPanel.registryBuildId);
  const bootstrap = link.body.bootstrap;
  await call('/registry-ready', { nonce: bootstrap.nonce, sessionId: bootstrap.sessionId, registryBuildId: loadedPanel.registryBuildId, refreshed: false });
  const selected = from('runtime/composition-spec.js').deriveComposition(f.pkg.release, file => Buffer.from(f.pkg.files[file], 'base64'));
  const browser = vm.createContext({ JSON, Object, Array, Promise, Error, isFinite });
  vm.runInContext(Buffer.from(f.pkg.files['cep/js/poll-dispatcher.js'], 'base64').toString(), browser);
  const memory = new Map();
  const dispatcher = browser.Core4PollDispatcher.createDispatcher({ installationId: d.installationId,
    pins: { packageHash: d.packageHash, installationId: d.installationId, executorHash: selected.assets[0].executorHash },
    assets: selected.assets.slice(1).map(({ assetKey, executorHash, phases }) => ({ assetKey, executorHash, phases })),
    storage: { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) },
    csInterface: { evalScript(script, callback) {
      let result = vm.runInContext(script, context);
      if (corruptReceipt) { const value = JSON.parse(result); if (value.transactionReceipt) { value.transactionReceipt.checkpointDigest = '0'.repeat(64); result = JSON.stringify(value); corruptedReceipts++; } }
      callback(result);
    } }, complete: payload => call('/complete', payload) });
  pump = (async () => { while (!stopped) { const { command } = await call('/poll', {}); if (command) await dispatcher.dispatch(command); } })(); pump.catch(() => {});
  await broker.connect();
  return { pkg: f.pkg, broker, state, rpc, runtime: runtimeHandle, get confirmations() { return confirmations; }, get proofCalls() { return proofCalls; }, get corruptedReceipts() { return corruptedReceipts; } };
}
module.exports = { fixturePackage, runtime, moduleId };
