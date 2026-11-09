'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { Broker } = require('../../core/broker');
const { hash, canonical } = require('../../protocol/json');
const { createManualPolicy } = require('../../runtime/manual-policy');
const { createWindowsReservationProvider } = require('../../runtime/windows-reservation-provider');
const { createHttpPeer } = require('../../integrations/cep/http-peer');
const { mac } = require('../../integrations/cep/peer-protocol');
const { buildPackage } = require('../../tools/package-installable');
const { decode, encode } = require('../../protocol/codec');
const { validateExecutionPolicyPort, validateReservationHandle } = require('../../core/authority');
const { initialState, environment } = require('./ae');
const { assertImportFile } = require('../../runtime/media-layer-proof');
const root = path.resolve(__dirname, '../..');
async function harness({ confirm = () => true, flags = {}, adopt = true, probeOverride, minimalBroker = false, humanDelayMs = 0, callerTimeout = 1500, callbackTimeout = 1500, projectOpenTransportTimeout, projectOpenTimeout, layoutEnvironment, textEnvironment, assemblyEnvironment, saveEnvironment, lifecycleEnvironment, mediaEnvironment, overlayEnvironment, frameEnvironment, operatorSession } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-manual-runtime-')), state = initialState(); delete state.sessionId; Object.assign(state.flags, flags);
  const installation = { installationId: 'fixture-installation', machineId: 'fixture-machine', stateDir: path.join(dir, 'state'), packageHash: '1'.repeat(64), panelToken: '2'.repeat(64), controlToken: '3'.repeat(64) };
  if (saveEnvironment || lifecycleEnvironment || frameEnvironment) Object.assign(state, { projectId: path.join(dir, 'Проект с пробелом.aep'), stateDir: installation.stateDir });
  if (mediaEnvironment || overlayEnvironment) state.fixtureDirectory = dir;
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'modules/titles-current-target/contract.json'))), admission = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions/titles-current-target.json'))), manifest = JSON.parse(fs.readFileSync(path.join(root, 'modules/titles-current-target/artifact.json')));
  const selected = { pin: hash(manifest), contract, admission, operatorConfirmation: !!operatorSession }; let broker, peer, confirmations = 0, stopped = false, pump, hostPhase;
  let brokerRoot = root;
  const pkg = frameEnvironment ? buildPackage(undefined, 'operator-frame-export', { runtimeModel: 'owner' }) :
    overlayEnvironment ? buildPackage(undefined, 'manual-layer-overlay', { runtimeModel: 'owner' }) :
    mediaEnvironment ? buildPackage(undefined, 'manual-media-layers', { runtimeModel: 'owner' }) :
    buildPackage(undefined, lifecycleEnvironment ? 'manual-project-lifecycle' : saveEnvironment ? 'manual-project-save' : assemblyEnvironment ? 'manual-project-assembly' : textEnvironment ? 'manual-titles' : layoutEnvironment ? 'manual-layout' : 'manual');
  if (layoutEnvironment || textEnvironment || assemblyEnvironment || saveEnvironment || lifecycleEnvironment || mediaEnvironment || overlayEnvironment || frameEnvironment) {
    brokerRoot = path.join(dir, 'layout-package');
    for (const [relative, bytes] of Object.entries(pkg.files)) {
      const file = path.join(brokerRoot, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(bytes, 'base64'));
    }
  } else if (minimalBroker) {
    brokerRoot = path.join(dir, 'isolated-root');
    const coreManifest = JSON.parse(fs.readFileSync(path.join(root, 'core/artifact.json')));
    const copy = relative => { const dest = path.join(brokerRoot, relative); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(root, relative), dest); };
    for (const relative of new Set(['core/artifact.json', ...Object.keys(coreManifest.hashes), 'config/admissions/titles-current-target.json', ...['artifact.json', 'contract.json', 'executor.jsx', 'implementation.js'].map(f => 'modules/titles-current-target/' + f)])) copy(relative);
    fs.writeFileSync(path.join(brokerRoot, 'config/catalog.json'), canonical({ catalogRevision: 'isolated-manual-only', modules: [{ id: 'titles-current-target', version: '4.0.0', path: 'modules/titles-current-target', admission: 'config/admissions/titles-current-target.json' }] }));
  }
  const observation = () => ({ version: 1, observedAt: new Date().toISOString(), hostname: installation.machineId, processes: [{ pid: 123456, birth: '2026-01-01T00:00:00.0000000Z', executablePath: 'C:/fixture/AfterFX.exe', executableHash: '5'.repeat(64) }], endpoints: [{ port: 3456, state: 'observed-absent' }, { port: 8787, state: 'observed-absent' }], completedAt: Date.now() });
  let probeCalls = 0;
  const probe = async () => probeOverride && ++probeCalls > 1 ? probeOverride(observation()) : observation();
  const provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer, probe });
  if (adopt) await provider.adopt({ expected: { machineId: installation.machineId, aePid: 123456, aeProcessBirth: '2026-01-01T00:00:00.0000000Z', executablePath: 'C:/fixture/AfterFX.exe', executableHash: '5'.repeat(64) }, allowedProject: state.projectId, rootObservationDigest: '6'.repeat(64) });
  let layout;
  if (layoutEnvironment) {
    const { createPointLayoutProof } = require('../../runtime/point-layout-proof');
    const manifest = require('../../modules/titles-point-layout/artifact.json');
    layout = { pin: hash(manifest), contract: require('../../modules/titles-point-layout/contract.json'),
      admission: require('../../config/admissions/titles-point-layout.json'), proof: createPointLayoutProof({ getBroker: () => broker, getPeer: () => peer }) };
  }
  const additional = [];
  // These VM fixtures have a synthetic PID. The installed owner test exercises
  // the real Windows sharing guard against the observed process identity.
  const sourceLock = (input, observed) => {
    assertImportFile(input, observed);
    return { assert() {}, release() {} };
  };
  if (textEnvironment) {
    const { validateTextLayerCompletion } = require('../../runtime/text-layer-proof');
    additional.push({ pin: hash(require('../../modules/text-layer/artifact.json')), contract: require('../../modules/text-layer/contract.json'),
      admission: require('../../config/admissions/text-layer.json'), validateResult: validateTextLayerCompletion });
  }
  const assembly = assemblyEnvironment ? {
    pin: hash(require('../../modules/project-assembly/artifact.json')), contract: require('../../modules/project-assembly/contract.json'),
    admission: require('../../config/admissions/project-assembly.json'),
    ...require('../../runtime/project-assembly-proof').createProjectAssemblyProof(() => installation.installationId)
  } : null;
  if (assembly) additional.push(assembly);
  const save = saveEnvironment ? {
    pin: hash(require('../../modules/project-save/artifact.json')), contract: require('../../modules/project-save/contract.json'),
    admission: require('../../config/admissions/project-save.json'),
    ...require('../../runtime/project-save-proof').createProjectSaveProof({ stateDir: installation.stateDir, currentSessionId: () => installation.installationId })
  } : null;
  if (save) additional.push(save);
  const lifecycle = lifecycleEnvironment ? {
    pin: hash(require('../../modules/project-lifecycle/artifact.json')), contract: require('../../modules/project-lifecycle/contract.json'),
    admission: require('../../config/admissions/project-lifecycle.json'),
    ...require('../../runtime/project-lifecycle-proof').createProjectLifecycleProof({ stateDir: installation.stateDir, currentSessionId: () => installation.installationId })
  } : null;
  if (lifecycle) additional.push(lifecycle);
  const frame = frameEnvironment ? {
    pin: hash(require('../../modules/comp-frame-export/artifact.json')), contract: require('../../modules/comp-frame-export/contract.json'),
    admission: require('../../config/admissions/comp-frame-export.json'), operatorConfirmation: true,
    ...require('../../runtime/comp-frame-export-proof')
  } : null;
  if (frame) additional.push(frame);
  const overlay = overlayEnvironment ? {
    pin: hash(require('../../modules/layer-overlay/artifact.json')), contract: require('../../modules/layer-overlay/contract.json'),
    admission: require('../../config/admissions/layer-overlay.json'), operatorConfirmation: true,
    ...require('../../runtime/layer-overlay-proof').createLayerOverlayProof(() => installation.installationId, sourceLock)
  } : null;
  if (overlay) additional.push(overlay);
  const mediaAssets = mediaEnvironment ? ['media-import', 'layer-insert'].map(moduleId => {
    const contract = require('../../modules/' + moduleId + '/contract.json');
    const admission = require('../../config/admissions/' + moduleId + '.json');
    const pin = hash(require('../../modules/' + moduleId + '/artifact.json'));
    const proof = moduleId === 'media-import' ? require('../../runtime/media-layer-proof').createMediaImportProof :
      require('../../runtime/layer-insert-proof').createLayerInsertProof;
    additional.push({ pin, contract, admission, operatorConfirmation: !!overlayEnvironment && moduleId === 'media-import',
      ...proof(() => installation.installationId, sourceLock) });
    return { assetKey: moduleId + '-v1', moduleId, operationId: contract.operationId, executorHash: admission.executorHash, resultProfile: moduleId + '-v1' };
  }) : [];
  const montage = overlayEnvironment && require('../../runtime/montage-mandate');
  const operatorConfirmation = operatorSession && require('../../runtime/operator-confirmation').createOperatorConfirmation(
    installation, operatorSession, () => state.projectId, operatorSession, (mandate, input) =>
      montage.importedMontageItem(broker.ledger.commands(mandate.body.taskId), mandate, input), montage);
  const manual = createManualPolicy({ selected, layout, additional, provider, installation, getPeer: () => peer, pinAdoption: !!lifecycle, operatorConfirmation });
  const transport = { identity: 'fixture-http-manual-v1', connect: v => peer.transport.connect(v), send: (v, offer) => peer.transport.send(v, offer), completion: v => peer.transport.completion(v), disconnect: () => peer.transport.disconnect() };
  broker = new Broker({ root: brokerRoot, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: callerTimeout, projectOpenTransportTimeout, privateEmbedding: { authority: manual.authority, executionPolicy: manual.port, transport, recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check', contextId: path.basename(dir), project: { file: state.projectId }, resources: [{ kind: 'project', identity: state.projectId }] } } });
  const inspection = JSON.parse(fs.readFileSync(path.join(root, 'modules/project-inspection/artifact.json')));
  const additionalAssets = [{ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', operationId: contract.operationId, executorHash: admission.executorHash, resultProfile: 'manual-text-v1' }];
  if (layout) additionalAssets.push({ assetKey: 'titles-point-layout-v1', moduleId: 'titles-point-layout', operationId: layout.contract.operationId, executorHash: layout.admission.executorHash, resultProfile: 'manual-point-layout-v1' });
  if (textEnvironment) additionalAssets.push({ assetKey: 'text-layer-v1', moduleId: 'text-layer', operationId: additional[0].contract.operationId, executorHash: additional[0].admission.executorHash, resultProfile: 'owned-text-layer-v1' });
  if (assembly) additionalAssets.push({ assetKey: 'project-assembly-v1', moduleId: 'project-assembly', operationId: assembly.contract.operationId, executorHash: assembly.admission.executorHash, resultProfile: 'owned-project-assembly-v1' });
  if (save) additionalAssets.push({ assetKey: 'project-save-v1', moduleId: 'project-save', operationId: save.contract.operationId, executorHash: save.admission.executorHash, resultProfile: 'current-project-save-v1' });
  if (lifecycle) additionalAssets.push({ assetKey: 'project-lifecycle-v1', moduleId: 'project-lifecycle', operationId: lifecycle.contract.operationId, executorHash: lifecycle.admission.executorHash, resultProfile: 'project-lifecycle-v1' });
  if (frame) additionalAssets.push({ assetKey: 'comp-frame-export-v1', moduleId: 'comp-frame-export', operationId: frame.contract.operationId, executorHash: frame.admission.executorHash, resultProfile: 'comp-frame-export-v1' });
  if (overlay) additionalAssets.push({ assetKey: 'layer-overlay-v1', moduleId: 'layer-overlay', operationId: overlay.contract.operationId, executorHash: overlay.admission.executorHash, resultProfile: 'layer-overlay-v1' });
  additionalAssets.push(...mediaAssets);
  peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), port: 0, pollTimeout: 5, timeout: callbackTimeout, projectOpenTimeout, asset: { assetKey: 'project-inspection-v1', executorHash: inspection.executorHash }, additionalAssets, observeProjectSave: save?.observe, observeProjectLifecycle: lifecycle?.observe, requireMutationGuard: true,
    assertMediaSourceLock(commandId) {
      if (state.flags.loseMediaSourceLock) throw new Error('fixture source lock lost after native mutation');
      manual.assertSourceLock(commandId);
    }, captureDeliveryGuard: command => () => operatorConfirmation?.assertDelivery(command),
    admissionGuard: command => { if (broker.ledger.unresolved().some(c => c.commandId !== command.commandId)) throw Object.assign(new Error('controller_unresolved'), { code: 'controller_unresolved' }); } }); await peer.listen();
  let sequence = 0;
  async function raw(route, body) { return new Promise((resolve, reject) => { const req = http.request('http://127.0.0.1:' + peer.status().port + route, { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json' } }, res => { let data = ''; res.on('data', b => data += b); res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(data)) : reject(new Error(data))); }); req.on('error', reject); req.end(canonical(JSON.parse(JSON.stringify(body)))); }); }
  const challenge = await raw('/challenge', { role: 'panel' }), peerId = 'fixture-peer'; await raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, installation.panelToken) });
  async function call(route, payload) { const body = { epoch: challenge.epoch, peerId, sequence: ++sequence, method: 'POST', path: route, payload: JSON.parse(JSON.stringify(payload)) }; const response = await raw(route, { body, mac: mac(body, installation.panelToken) }); assert.equal(response.mac, mac(response.body, installation.panelToken)); return response.body.payload; }
  const host = frameEnvironment || overlayEnvironment || mediaEnvironment || lifecycleEnvironment || saveEnvironment || assemblyEnvironment || textEnvironment || layoutEnvironment || environment;
  const context = vm.createContext({ ...host(state, () => {}), JSON: undefined, confirm: message => { confirmations++; return confirm({ state, message }); } });
  vm.runInContext('Object.keys=undefined;', context);
  vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
  const browser = vm.createContext({ JSON, Object, Array, Promise, Error, isFinite }); vm.runInContext(Buffer.from(pkg.files['cep/js/poll-dispatcher.js'], 'base64').toString(), browser);
  const map = new Map(), dispatcher = browser.Core4PollDispatcher.createDispatcher({ installationId: installation.installationId, pins: { packageHash: installation.packageHash, installationId: installation.installationId, executorHash: inspection.executorHash }, assets: additionalAssets.map(({ assetKey, executorHash }) => ({ assetKey, executorHash, phases: ['inspect', 'mutate', 'verify'] })), storage: { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }, csInterface: { evalScript(script, cb) {
    const run = () => {
      const result = vm.runInContext(script, context);
      if (hostPhase === 'mutate' && state.flags.holdMutationCallback) state.releaseMutationCallback = () => {
        delete state.releaseMutationCallback;
        cb(result);
        return pump;
      };
      else cb(result);
    };
    if (hostPhase === 'mutate' && humanDelayMs) setTimeout(run, humanDelayMs); else run();
  } }, complete: p => call('/complete', p) });
  pump = (async () => {
    while (!stopped) {
      const { command } = await call('/poll', {});
      if (!command) continue;
      hostPhase = command.phase;
      const result = dispatcher.dispatch(command);
      if (hostPhase === 'mutate' && state.flags.holdMutationCallback) state.retryPendingMutation = () => dispatcher.dispatch(command);
      await result;
    }
  })(); pump.catch(() => {});
  await broker.connect();
  async function proposal(text = 'After') {
    const c = broker.getContract({ moduleId: 'titles-current-target' }), target = { projectId: state.projectId, compId: 1, layerId: 102 };
    const evidence = await broker.inspect({ moduleId: 'titles-current-target', contractId: c.contractId, target });
    const built = await broker.build({ oneStep: true, steps: [{ stepId: 'title', moduleId: 'titles-current-target', contractId: c.contractId, evidenceRef: evidence.evidenceRef, input: { ...target, text } }] });
    const p = broker.propose({ buildId: built.buildId }), dry = await broker.dryrun({ proposalId: p.proposalId });
    return { proposalId: p.proposalId, dryrunRef: dry.dryrunRef, taskId: built.taskId, ...(p.operatorApprovalDigest ? { operatorApprovalDigest: p.operatorApprovalDigest } : {}) };
  }
  return { broker, peer, provider, state, proposal, dir, brokerRoot, installation, get confirmations() { return confirmations; }, async close() { stopped = true; await peer.close(); state.releaseMutationCallback?.(); broker.close(); await pump.catch(() => {}); } };
}
module.exports = { harness };
