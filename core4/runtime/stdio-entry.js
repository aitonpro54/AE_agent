'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PRODUCTION_TIMING = Object.freeze({ callerTimeoutMs: 100000, callbackTimeoutMs: 90000, mcpToolTimeoutSec: 120 });
// ONLY builtins are loaded until the entire installed release is verified.
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_installation_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
function exactKeys(value, keys) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('composition_schema'); }
// Builtin-only release interpretation. Callers verify the COMPLETE tree first.
// These two reviewed adapters are closed policies, never names of executable imports.
function deriveComposition(release, read) {
  if (release.format !== 1 && release.format !== 2) fail('release_format');
  const checked = file => { if (!Object.hasOwn(release.hashes, file)) fail('composition_unhashed_path'); const bytes = read(file); if (hash(bytes) !== release.hashes[file]) fail('composition_bytes'); return bytes; };
  const json = file => JSON.parse(checked(file));
  if (release.format === 1) {
    if (Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_downgrade');
    if (!Object.hasOwn(release.hashes, 'runtime/profiles.json') || !Object.hasOwn(release.hashes, 'runtime/source-package.json')) fail('composition_downgrade');
    const inspection = json('modules/project-inspection/artifact.json');
    const manual = json('config/admissions/titles-current-target.json');
    return { legacy: true, assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
  }
  if (!Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_required');
  const composition = json('runtime/composition.json'); exactKeys(composition, ['version', 'id', 'modules', 'engine', 'assets']);
  if (composition.version !== 1 || !['readonly', 'manual'].includes(composition.id) || !Array.isArray(composition.modules) || !Array.isArray(composition.assets)) fail('composition_schema');
  const catalog = json('config/catalog.json'); exactKeys(catalog, ['catalogRevision', 'modules', 'engine']);
  const expectedIds = composition.id === 'readonly' ? [] : ['photo-placeholder', 'titles', 'titles-current-target'];
  if (canonical(composition.modules) !== canonical(expectedIds) || !Array.isArray(catalog.modules) || canonical(catalog.modules.map(m => m.id)) !== canonical(expectedIds) || canonical(catalog.engine) !== canonical(composition.engine) || (composition.id === 'readonly' ? composition.engine !== null : !composition.engine || composition.engine.path !== 'plan-engine')) fail('composition_catalog');
  function admitted(entry) {
    exactKeys(entry, ['id', 'version', 'path', 'admission']);
    if (entry.path !== 'modules/' + entry.id || entry.admission !== 'config/admissions/' + entry.id + '.json') fail('composition_catalog');
    const manifest = json(entry.path + '/artifact.json'), contract = json(entry.path + '/contract.json'), admission = json(entry.admission), executor = checked(entry.path + '/executor.jsx');
    exactKeys(admission, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
    if (manifest.id !== entry.id || manifest.version !== entry.version || admission.revoked !== false || typeof admission.trustApprovalId !== 'string' || !admission.trustApprovalId || admission.protocolVersion !== 1 || admission.moduleId !== entry.id || contract.moduleId !== entry.id || admission.operationId !== contract.operationId || admission.artifactHash !== hash(manifest) || admission.schemaHash !== hash(contract.inputSchema) || admission.resultSchemaHash !== hash(contract.snapshotSchema) || admission.effectPolicyHash !== hash(contract.effectPolicy) || admission.executorHash !== hash(executor)) fail('composition_not_admitted');
    for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file) || hash(checked(entry.path + '/' + file)) !== pin) fail('composition_artifact');
    return { manifest, contract, admission, executor };
  }
  const selected = new Map(catalog.modules.map(entry => [entry.id, admitted(entry)]));
  if (composition.engine) { exactKeys(composition.engine, ['path', 'artifactHash']); const manifest = json('plan-engine/artifact.json'); if (hash(manifest) !== composition.engine.artifactHash) fail('composition_engine'); for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json)$/.test(file) || hash(checked('plan-engine/' + file)) !== pin) fail('composition_engine'); }
  const expectedAssets = [{ assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] }];
  if (composition.id === 'manual') expectedAssets.push({ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', path: 'modules/titles-current-target', admission: 'config/admissions/titles-current-target.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
  if (canonical(composition.assets) !== canonical(expectedAssets)) fail('composition_assets');
  const assets = composition.assets.map(asset => {
    let value = selected.get(asset.moduleId);
    if (asset.policy === 'read-only-current-observation-v1') {
      const contract = json(asset.path + '/contract.json'), admission = json(asset.admission), executor = checked(asset.path + '/executor.jsx');
      exactKeys(admission, ['moduleId', 'executionPolicy', 'executorHash', 'contractHash']);
      if (admission.moduleId !== asset.moduleId || admission.executionPolicy !== asset.policy || admission.executorHash !== hash(executor) || admission.contractHash !== hash(contract)) fail('composition_not_admitted');
      value = { contract, admission, executor };
    }
    if (!value) fail('composition_not_admitted');
    return { ...asset, ...value, executorHash: value.admission.executorHash };
  });
  // No optional runtime code is shipped in the standalone inspection composition.
  if (composition.id === 'readonly' && Object.keys(release.hashes).some(file => /^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
  const startOverSupported = Object.hasOwn(release.hashes, 'runtime/owner-contract.json') && json('runtime/owner-contract.json').version === 4;
  return { composition, assets, ...(startOverSupported ? { startOverSupported: true } : {}) };
}
function registrySource(assets, codecSource) {
  const declarations = [], entries = assets.map((asset, index) => {
    const name = 'executor' + index; declarations.push('var ' + name + '=' + asset.executor + ';');
    return JSON.stringify(asset.assetKey) + ':{"hash":' + JSON.stringify(asset.executorHash) + ',"calls":{' + asset.phases.map(phase => JSON.stringify(phase) + ':' + name + '[' + JSON.stringify(phase) + ']').join(',') + '}}';
  });
  return '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';' + declarations.join('') + 'var assets={' + entries.join(',') + '};return {"dispatch":function(serialized){var frame=JSON.parse(serialized),own=Object.prototype.hasOwnProperty,a=frame&&own.call(assets,frame.assetKey)&&assets[frame.assetKey],call=a&&own.call(a.calls,frame.phase)&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({"readFailureVersion":1,"outcome":"rejected","code":"inspection_failed"});}}};}());\n';
}
function installationConfig(d, selected) { const assets = selected.assets.map(a => ({ assetKey: a.assetKey, executorHash: a.executorHash, phases: a.phases })); return { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: assets[0].executorHash, assetKey: assets[0].assetKey, assets, ...(selected.startOverSupported ? { startOverSupported: true } : {}) }; }
function verifyRelease(directory, release) {
  exactKeys(release, ['version', 'format', 'hashes']); if (release.version !== '4.0.0' || !release.hashes || Object.getPrototypeOf(release.hashes) !== Object.prototype) fail('release_schema');
  const root = path.resolve(directory), expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes || {})) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('release_path');
    expectedFiles.add(relative);
    for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(directory, relative) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory || !expectedDirs.delete(relative)) fail('release_tree_mismatch');
    for (const item of fs.readdirSync(directory)) {
      const file = path.join(directory, item), rel = relative ? relative + '/' + item : item, child = fs.lstatSync(file);
      if (child.isSymbolicLink() || fs.realpathSync(file) !== file) fail('release_tree_mismatch');
      if (child.isDirectory()) visit(file, rel);
      else if (!child.isFile() || !expectedFiles.delete(rel)) fail('release_tree_mismatch');
      else if (rel === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[rel]) fail('installed_release_bytes');
    }
  }
  visit(root, ''); if (expectedFiles.size || expectedDirs.size) fail('release_tree_mismatch');
  if (release.format !== 1 && release.format !== 2) fail('release_format');
  if (release.format === 1) { if (Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_downgrade'); return; }
  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
  if (fs.readFileSync(path.join(root, 'cep/jsx/registry.jsx'), 'utf8') !== registrySource(selected.assets, fs.readFileSync(path.join(root, 'runtime/host/json-codec.jsx'), 'utf8'))) fail('composition_registry');
}
function assertPlainPath(file, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('installation_path');
  const stat = fs.lstatSync(file); if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(file) !== file || (directory ? !stat.isDirectory() : !stat.isFile())) fail('installation_path');
}
function verifyCep(d, manifest, cepDir) {
  verifyRelease(d.releaseDir, manifest);
  assertPlainPath(cepDir, true); if (path.basename(cepDir) !== 'com.codex.aeagentcore4') fail('installation_cep_scope');
  const selected = deriveComposition(manifest, file => fs.readFileSync(path.join(d.releaseDir, file)));
  const expected = Object.fromEntries(Object.entries(manifest.hashes).filter(([file]) => file.startsWith('cep/')).map(([file, digest]) => [file.slice(4), digest]));
  if (Object.keys(expected).length !== 6) fail('installation_cep_closure');
  const cfg = installationConfig(d, selected);
  expected['installation.js'] = hash('window.Core4Installation=' + canonical(cfg) + ';\n');
  const files = new Set(Object.keys(expected)), dirs = new Set(['']); for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  function visit(directory, relative) { assertPlainPath(directory, true); if (!dirs.delete(relative)) fail('installation_cep_tree'); for (const name of fs.readdirSync(directory)) { const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); assertPlainPath(file, stat.isDirectory()); if (stat.isDirectory()) visit(file, rel); else if (!files.delete(rel) || hash(fs.readFileSync(file)) !== expected[rel]) fail('installation_cep_bytes'); } }
  visit(cepDir, ''); if (files.size || dirs.size) fail('installation_cep_tree');
}
function verifyInstallation(file, options = {}) {
  if (Object.keys(options).some(key => key !== 'cepDir')) fail('installation_verifier_options');
  const { cepDir } = options;
  if (!path.isAbsolute(file)) fail('absolute_descriptor_required');
  assertPlainPath(file);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(d.version) || !path.isAbsolute(d.installRoot) || file !== path.join(d.installRoot, 'installation.json') || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) || d.stateDir !== path.join(d.installRoot, 'state/production') || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !d.installationId || d.panelToken === d.controlToken || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken)) fail('installation_descriptor');
  if (d.version === 2) {
    const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', 'cepDir', 'receiverFormatVersion', 'predecessor'];
    if (Object.keys(d).length !== keys.length || keys.some(key => !Object.hasOwn(d, key)) || !path.isAbsolute(d.cepDir) || d.receiverFormatVersion !== 2) fail('installation_descriptor_v2');
    if (d.predecessor !== null && (!d.predecessor || Object.keys(d.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.predecessor.transactionId) || !/^[a-f0-9]{64}$/.test(d.predecessor.previousDescriptorHash))) fail('installation_predecessor');
  }
  assertPlainPath(path.join(d.installRoot, 'origin.json')); assertPlainPath(path.join(d.stateDir, 'origin.json'));
  const origin = JSON.parse(fs.readFileSync(path.join(d.installRoot, 'origin.json'), 'utf8'));
  const anchor = JSON.parse(fs.readFileSync(path.join(d.stateDir, 'origin.json'), 'utf8'));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('installation_origin_mismatch');
  if ((path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20)) fail('external_node_mismatch');
  const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  if (hash(manifest) !== d.packageHash) fail('installation_package_hash');
  verifyRelease(d.releaseDir, manifest);
  if (d.version === 2) { const receiver = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'runtime/receiver-contract.json'), 'utf8')); if (receiver.version !== 1 || receiver.descriptorVersion !== 2 || receiver.journalFormat !== d.receiverFormatVersion || receiver.terminalReadFailureDispositionVersion !== 1) fail('installation_receiver_contract'); verifyCep(d, manifest, d.cepDir); }
  else if (cepDir) verifyCep(d, manifest, cepDir);
  return Object.freeze(d);
}
async function start({ descriptor, port = 3457, input = process.stdin, output = process.stdout, mode = 'stdio' } = {}) {
  const installation = verifyInstallation(descriptor), root = installation.releaseDir;
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(root)) fail('installation_entry_root_mismatch');
  const installGate = path.join(installation.installRoot, 'install.lock');
  let startupGate, broker, peer, attachmentOwner, ipc, reservedServer, ownerLifecycle, workSession, startOverOwner, startOverControl, ownerMaintenance, startOverRestartArmed = false;
  try {
  if (!['stdio', 'owner'].includes(mode)) fail('runtime_mode');
  if (mode === 'stdio') startupGate = fs.openSync(installGate, 'wx');
  if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');
  const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
  const ownerFiles = ['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/client-ipc.js', 'runtime/client-stdio.js', 'runtime/controller-lease.js', 'runtime/attachment-owner.js', 'runtime/owner-lifecycle.js', 'runtime/recovery-inspection.js', 'runtime/windows-owner-process.js', 'runtime/owner-maintenance.js', 'runtime/start-over-inspection.js', 'runtime/start-over-process.js', 'runtime/start-over-state.js', 'runtime/start-over-barrier.js', 'runtime/start-over-archive.js', 'runtime/start-over-finisher.js', 'runtime/work-session.js', 'runtime/start-over-panel-control.js', 'runtime/start-over-driver.js', 'runtime/owner-launch.js'];
  const ownerRuntime = Object.hasOwn(release.hashes, 'runtime/owner-contract.json');
  if (ownerRuntime) {
    const bytes = fs.readFileSync(path.join(root, 'runtime/owner-contract.json'));
    const expected = { version: 4, runtimeModel: 'owner', clientEntry: 'runtime/client-entry.js', clientArgument: '--client-descriptor',
      ownerEntry: 'runtime/owner-entry.js', ownerArgument: '--installation', clientDescriptorFile: 'core-client.json', requiredFiles: ownerFiles };
    if (release.format !== 2 || hash(bytes) !== release.hashes['runtime/owner-contract.json'] || canonical(JSON.parse(bytes)) !== canonical(expected) || ownerFiles.some(file => !Object.hasOwn(release.hashes, file))) fail('owner_contract_schema');
    if (mode !== 'owner') fail('owner_entry_required');
  } else {
    if (mode === 'owner') fail('owner_composition_unavailable');
    if (ownerFiles.some(file => Object.hasOwn(release.hashes, file))) fail('owner_contract_required');
  }
  if (mode === 'owner') {
    const { continueStartOverStartup } = require('./start-over-driver.js');
    await continueStartOverStartup({ installation, descriptorPath: descriptor, port });
    workSession = require('./work-session.js').createWorkSession({ installation, descriptorPath: descriptor });
    // Presence is a fail-closed barrier, including malformed/unreadable records.
    const maintenance = path.join(installation.stateDir, 'runtime-maintenance.json');
    try { fs.lstatSync(maintenance); fail('owner_desired_stopped'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    // HTTP elects the starter before acquiring/recovering a process-bound gate.
    // No execution store opens until lifecycle has verified death/CAS/history.
    reservedServer = require('node:http').createServer();
    await new Promise((resolve, reject) => {
      reservedServer.once('error', reject);
      reservedServer.listen(port, '127.0.0.1', () => { reservedServer.removeListener('error', reject); resolve(); });
    });
    const { createOwnerLifecycle } = require('./owner-lifecycle.js');
    ownerLifecycle = await createOwnerLifecycle({ installation, descriptorPath: descriptor, reservedServer });
  } else {
    for (const name of ['runtime-start-over.json', 'work-session.json']) {
      try { fs.lstatSync(path.join(installation.stateDir, name)); fail('owner_work_session_requires_owner_runtime'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }
  function startOverView() {
    const requested = startOverOwner?.status();
    if (requested?.requested) {
      let observed;
      try { observed = startOverOwner.inspect(); }
      catch (e) { return { id: requested.id, sessionId: null, phase: 'blocked', requiresAEExit: true, resetComplete: false, baselineRequired: true, fault: /^[a-z][a-z0-9_]{0,99}$/.test(e.code) ? e.code : 'start_over_state_unavailable', aeAuthority: false }; }
      const stopped = ownerMaintenance?.status(), fault = requested.fault || stopped?.fault || null;
      return { id: observed.id || requested.id, sessionId: observed.newSessionId || null, phase: stopped?.fault || requested.fault && !stopped?.requested ? 'blocked' : 'stopping', requiresAEExit: observed.requiresAEExit !== false, resetComplete: false, baselineRequired: true, fault, aeAuthority: false };
    }
    const value = workSession.status();
    return { id: value.resetId, sessionId: value.sessionId, phase: value.resetPending ? 'blocked' : value.baselineRequired ? 'baseline-required' : 'ready', requiresAEExit: false, resetComplete: value.mode === 'work-session' && !value.resetPending, baselineRequired: value.baselineRequired, fault: value.resetPending ? 'start_over_in_progress' : null, aeAuthority: false };
  }
  async function requestStartOver() {
    if (!startOverOwner || !ownerMaintenance) fail('start_over_owner_not_ready');
    try { await startOverOwner.request(); }
    catch (error) {
      // An inventory failure must not strand a published reset in a live
      // frozen producer. Stop this exact owner; the same finisher can capture
      // continuation inventory once after its real process death.
      const current = startOverOwner.inspect(), requested = startOverOwner.status();
      if (!current.id || current.id !== requested.id) throw error;
      if (!ownerMaintenance.status().requested) {
        const { createStopAuthorization } = require('./owner-maintenance.js');
        startOverRestartArmed = true;
        ownerMaintenance.request(createStopAuthorization({ installation, descriptorPath: descriptor, scope: ownerMaintenance.scope, id: current.id }));
      }
    }
    return startOverView();
  }
  if (mode === 'owner') startOverControl = require('./start-over-panel-control.js').createStartOverPanelControl({ installation, status: startOverView, request: requestStartOver });
  async function exposeOwner(facade, activity, invoke, consumeReadRejection) {
    const { createAttachmentOwner, OWNER_METHODS } = require('./attachment-owner.js');
    const { createIpcServer } = require('./client-ipc.js');
    const { ownerEndpoint } = require('./client-entry.js');
    const { PRIVATE_METHODS, createOwnerMaintenance, createStopAuthorization } = require('./owner-maintenance.js');
    attachmentOwner = createAttachmentOwner({ runtime: facade, activity, invoke, consumeReadRejection, workSession: workSession.status });
    const endpoint = ownerEndpoint(installation);
    let closed = false, closing, maintenance;
    async function closeRuntime() {
      if (closed) return; if (closing) return closing;
      if (attachmentOwner.status().accepted || activity().pending) fail('owner_draining');
      ownerLifecycle.beginClose();
      closing = (async () => { await attachmentOwner.close(); await ipc.close(); ownerLifecycle.finishClose(); closed = true; })(); return closing;
    }
    maintenance = createOwnerMaintenance({ installation, descriptorPath: descriptor, lifecycle: ownerLifecycle, activity,
      freeze: attachmentOwner.freeze, accepted: () => attachmentOwner.status().accepted, close: closeRuntime });
    ownerMaintenance = maintenance;
    startOverOwner = require('./start-over-state.js').createOwnerStartOver({ installation, descriptorPath: descriptor, lifecycle: ownerLifecycle, freeze: attachmentOwner.freeze,
      fencePhysical() { if (peer) peer.fenceForStartOver(); else if (ownerLifecycle.mode !== 'diagnostic') fail('start_over_physical_unavailable'); },
      stop(id) { startOverRestartArmed = true; return maintenance.request(createStopAuthorization({ installation, descriptorPath: descriptor, scope: maintenance.scope, id })); } });
    void maintenance.done.then(async value => {
      if (!startOverRestartArmed || value.phase !== 'stopped' && !closed) return;
      try { await require('./owner-launch.js').launchInstalledOwner({ installation, descriptorPath: descriptor }); } catch { /* intent remains; a fresh thin client can launch the same normal entry */ }
    });
    const currentStatus = facade.status, currentDiagnostics = facade.diagnostics;
    facade.status = () => ({ ...currentStatus(), maintenance: maintenance.status(), workSession: workSession.status(), startOver: startOverView() });
    facade.diagnostics = () => ({ ...currentDiagnostics(), maintenance: maintenance.status(), workSession: workSession.status(), startOver: startOverView() });
    ipc = createIpcServer({ endpoint, identity: { installationId: installation.installationId, machineId: installation.machineId, packageHash: installation.packageHash },
      secret: installation.controlToken, bootId: attachmentOwner.bootId, methods: [...OWNER_METHODS, ...PRIVATE_METHODS],
      onAttach: attachmentOwner.onAttach, onDetach: attachmentOwner.onDetach, onRequest: request => {
        if (!PRIVATE_METHODS.includes(request.method)) return attachmentOwner.onRequest(request);
        try { return { ok: true, value: maintenance.request(request.payload) }; }
        catch (e) { return { ok: false, code: ['maintenance_authorization', 'maintenance_in_progress', 'maintenance_persist_failed', 'maintenance_schema', 'maintenance_id'].includes(e.code) ? e.code : 'maintenance_refused' }; }
      } });
    if (ownerLifecycle.mode === 'active') ownerLifecycle.markReady();
    await ipc.listen(); ownerLifecycle.releaseStartup();
    return { endpoint, bootId: attachmentOwner.bootId,
      async close() {
        if (closed) return;
        const value = maintenance.requestLocal(); if (value.fault) fail(value.fault);
        if (attachmentOwner.status().accepted || activity().pending) fail('owner_draining');
        const result = await maintenance.done; if (result.phase !== 'stopped') fail('maintenance_stop_uncertain');
      },
      status: () => ({ ...facade.status(), attachmentOwner: attachmentOwner.status(), ipc: ipc.status(), maintenance: maintenance.status() }) };
  }
  if (ownerLifecycle?.mode === 'diagnostic') {
    // A fenced boot exposes authenticated observations without constructing a
    // Broker or opening an execution store. Only authenticated panel reset
    // control is available; the physical command channel remains refused.
    require('./start-over-panel-control.js').attachStartOverHttp({ server: reservedServer, control: startOverControl, reason: 'owner_recovery_required' });
    const status = () => ({ ready: false, closed: false, pid: process.pid, product: 'AE Agent Core 4.0.0',
      installation: { installationId: installation.installationId, machineId: installation.machineId, packageHash: installation.packageHash, nodeVerified: true },
      lifecycle: ownerLifecycle.state(), ownershipFault: 'owner_recovery_required', physical: { listening: reservedServer.listening, port: reservedServer.address()?.port || null, inspectionAvailable: false, storeClosed: true, unknown: true, coverage: 'diagnostic-only; execution queue not reopened' }, externalLegacyCoverage: 'unobserved' });
    const unavailable = () => ({ available: false, reason: 'owner_recovery_required' });
    const facade = { status, diagnostics: status, listModules: unavailable, getContract: unavailable, getTask: unavailable,
      close: () => new Promise(resolve => { reservedServer.close(resolve); reservedServer.closeAllConnections(); }) };
    return await exposeOwner(facade, () => ({ pending: false, unresolved: true, fault: true }), (method, payload) => facade[method](payload));
  }
  const { Broker } = require('../core/broker.js');
  const { serve } = require('../core/stdio.js');
  const { exact, id } = require('../protocol/json.js');
  const { createHttpPeer } = require('../integrations/cep/http-peer.js');
  const invocationContext = mode === 'owner' ? new (require('node:async_hooks').AsyncLocalStorage)() : null;
  const completedReadErrors = new WeakMap();
  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
  if (selected.legacy) fail('runtime_composition_required');
  const inspection = selected.assets.find(a => a.policy === 'read-only-current-observation-v1');
  const { contract, admission } = inspection;
  const profile = { id: inspection.moduleId, executionPolicy: inspection.policy };
  const asset = { assetKey: inspection.assetKey, executorHash: inspection.executorHash };
  const manualAsset = selected.assets.find(a => a.policy === 'current-matching-target-after-local-confirmation-v1');
  let provider, manual, privateEmbedding;
  if (manualAsset) {
    const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
    const { createManualPolicy } = require('./manual-policy.js');
    provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
    manual = createManualPolicy({ selected: { pin: hash(manualAsset.manifest), contract: manualAsset.contract, admission: manualAsset.admission }, provider, installation, getPeer: () => peer });
    const transport = { identity: hash({ packageHash: installation.packageHash, manualAdmission: manualAsset.admission }), connect: value => peer.transport.connect(value), send: value => peer.transport.send(value), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
    privateEmbedding = { authority: manual.authority, executionPolicy: manual.port, transport };
  }
  broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs, ...(ownerLifecycle ? { stateLockToken: ownerLifecycle.brokerToken } : {}), ...(privateEmbedding ? { privateEmbedding } : {}) });
  const admissionGuard = command => {
    if (broker.closed) fail('broker_closed');
    if (broker.stateLock.error) fail(broker.stateLock.error);
    if (broker.ledger.corrupt) fail('ledger_corrupt');
    if (broker.ledger.unresolved().some(c => c.commandId !== command?.commandId)) fail('controller_unresolved');
  };
  peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets: manualAsset ? [{ assetKey: manualAsset.assetKey, moduleId: manualAsset.moduleId, operationId: manualAsset.contract.operationId, executorHash: manualAsset.executorHash, resultProfile: 'manual-text-v1' }] : [], timeout: PRODUCTION_TIMING.callbackTimeoutMs, port, admissionGuard, ...(workSession ? { workSessionId: workSession.status().sessionId, startOverControl } : {}), ...(reservedServer ? { preboundServer: reservedServer } : {}), ...(invocationContext ? { captureDeliveryGuard() {
    const context = invocationContext.getStore();
    if (!context) fail('owner_controller_required');
    // Retain this exact operation's grant beyond ALS lifetime, including /poll.
    return () => context.assertCurrent();
  } } : {}), installationContext: { descriptorPath: descriptor }, ...(ownerLifecycle ? { ownerToken: ownerLifecycle.receiverToken } : {}) });
  const contractId = hash({ packageHash: installation.packageHash, admission, contract }); let closed = false;
  const facade = Object.create(broker);
  const physical = () => { const value = peer.status(); return { ...value, inspectionAvailable: !broker.closed && !broker.stateLock.error && !broker.ledger.corrupt && !broker.ledger.unresolved().length && value.peer.connected && !value.startOverFrozen && !value.storeClosed && !value.storeFault && !value.pending }; };
  facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.0.0', composition: selected.composition.id, installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: physical(), ...(ownerLifecycle ? { lifecycle: ownerLifecycle.state() } : {}), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual?.policyId || null, resourceProvider: provider ? provider.status() : null, ...(manual ? {} : { mutationAvailable: false }), externalLegacyCoverage: 'unobserved' });
  facade.diagnostics = () => ({ ...broker.diagnostics(), ...facade.status() });
  facade.connect = async () => {
    const result = manual ? await broker.connect() : null;
    const snapshot = physical();
    return { ...(manual ? result : { available: snapshot.inspectionAvailable, reason: snapshot.inspectionAvailable ? null : 'physical_inspection_unavailable', mutationAvailable: false }), automaticLifecycle: 'unavailable', physical: snapshot };
  };
  facade.disconnect = async () => ({ disconnected: false, reason: mode === 'owner' ? 'physical_link_owned_by_installation_owner' : 'physical_link_owned_by_stdio_lifetime', physical: physical() });
  facade.listModules = value => { const result = broker.listModules(value); return { ...result, modules: [...result.modules, { id: profile.id, version: '4.0.0', executionPolicy: profile.executionPolicy }] }; };
  facade.getContract = value => { if (value.moduleId !== profile.id) return broker.getContract(value); exact(value, ['moduleId']); return { contractId, moduleId: profile.id, operationId: contract.operationId, modulePin: hash(admission), contract: JSON.parse(canonical(contract)) }; };
  facade.inspect = async value => {
    if (value.contractId !== contractId) return broker.inspect(value);
    exact(value, ['moduleId', 'contractId', 'target']);
    if (value.moduleId !== profile.id) fail('contract_identity');
    let result;
    try { result = await peer.inspect(value.target || {}); }
    catch (error) {
      const rejection = peer.consumeReadRejection(error), context = invocationContext?.getStore();
      if (rejection && context && !context.observer && rejection.executorHash === asset.executorHash && rejection.payloadHash === hash(canonical(value.target || {}))) {
        completedReadErrors.set(error, { context, moduleId: value.moduleId, contractId, targetHash: rejection.payloadHash, code: rejection.code });
      }
      throw error;
    }
    if (result.observation?.readFailureVersion === 1) fail(result.observation.code || 'inspection_failed');
    if (workSession) workSession.recordProjectBaseline(peer, result);
    return { evidenceRef: id('observation'), moduleId: profile.id, contractId, ...result, authority: false };
  };
  facade.build = value => { if (value.contractId === contractId || value.steps?.some(s => s.contractId === contractId)) fail('read_only_module_build_unsupported'); return broker.build(value); };
  facade.close = async () => { if (closed) return; closed = true; await peer.close(); await broker.close(); };
  try { await peer.listen(); } catch (e) { await facade.close(); throw e; }
  if (mode === 'owner') {
    const activity = () => {
      const physicalState = peer.status();
      return { pending: !!(broker.running || broker.reconciling || broker.controllerBusy || broker.controlPending || broker.worker.status().pending || physicalState.pending),
        unresolved: !!(broker.ledger.unresolved().length || physicalState.storeClosed || physicalState.unknown),
        fault: !!(broker.closed || broker.stateLock.error || broker.ledger.corrupt || physicalState.storeFault) };
    };
    return await exposeOwner(facade, activity, (method, payload, context) => {
      const receiver = Object.hasOwn(facade, method) ? facade : broker;
      return invocationContext.run(context, () => { if (!context.observer) context.assertCurrent(); return receiver[method](payload); });
    }, (error, request) => {
      const record = completedReadErrors.get(error); completedReadErrors.delete(error);
      if (!record || request.context !== record.context || request.method !== 'inspect_module_target' || request.payload.moduleId !== record.moduleId || request.payload.contractId !== record.contractId || hash(canonical(request.payload.target || {})) !== record.targetHash) return null;
      return { code: record.code };
    });
  }
  serve(facade, input, output, { serverInfo: { name: 'ae-agent-core4', version: '4.0.0' } });
  return { close: facade.close, status: facade.status };
  } catch (e) {
    if (ipc) await ipc.close();
    if (peer) await peer.close();
    else if (reservedServer?.listening) await new Promise(resolve => { reservedServer.close(resolve); reservedServer.closeAllConnections(); });
    if (broker) await broker.close(); if (ownerLifecycle) { try { ownerLifecycle.abortStartup(); } catch {} } throw e;
  }
  finally { if (startupGate !== undefined) { fs.closeSync(startupGate); fs.unlinkSync(installGate); } }
}
// Direct-main start imports the historical reader synchronously. Publish these
// builtin verifiers first so its installation.js import sees initialized exports.
module.exports = { start, verifyInstallation, verifyRelease, verifyCep, deriveComposition, registrySource, installationConfig, PRODUCTION_TIMING };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--installation') { process.stderr.write('Explicit --installation ABSOLUTE_DESCRIPTOR required.\n'); process.exitCode = 2; }
  else start({ descriptor: args[1] }).then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
  }).catch(e => { process.stderr.write((e.code || 'runtime_start_failed') + '\n'); process.exitCode = 1; });
}
