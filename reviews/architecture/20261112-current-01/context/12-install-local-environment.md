# 12-install-local-environment

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/tools/install-core4.js:339–374`
Полный файл SHA256 (hex groups, concatenate) `a64b61d4:be78a1d3:0247488f:f09e8d66:987608df:0b315d1b:610fe17f:e9e93c11`; Git blob `8f29f14b:f3c39883:8081bfce:53b554a4:ff3a6662`. Выдержка: строки 339–374, 3816 bytes.

```javascript
function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, machineId, runtimeModel }) {
  verifyPackage(pkg);
  const runtime = runtimeBinding(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (runtimeModel !== undefined && runtimeModel !== runtime.runtimeModel) fail('runtime_selector_mismatch');
  const receiverContract = pkg.files['runtime/receiver-contract.json'] && JSON.parse(Buffer.from(pkg.files['runtime/receiver-contract.json'], 'base64'));
  if (!receiverContract || receiverContract.version !== 1 || receiverContract.descriptorVersion !== 2 || receiverContract.journalFormat !== 2 || receiverContract.terminalReadFailureDispositionVersion !== 1) fail('candidate_receiver_contract_unsupported');
  for (const value of [nodePath, installRoot, extensionsDir, configPath]) if (!path.isAbsolute(value)) fail('absolute_install_paths_required');
  if (path.basename(installRoot).toLowerCase() !== 'aeagentcore4' || path.basename(path.join(extensionsDir, BUNDLE)) !== BUNDLE) fail('install_scope');
  nodePath = path.resolve(nodePath);
  const resolvedNode = fs.realpathSync(nodePath); if (resolvedNode !== nodePath) fail('node_path_not_exact');
  if (path.resolve(process.execPath).toLowerCase() !== nodePath.toLowerCase()) fail('installer_candidate_node_must_be_current_process');
  const version = process.version;
  if (!/^v(2\d|[3-9]\d)\./.test(version)) fail('node_20_required');
  const releaseDir = path.join(installRoot, 'releases', pkg.packageHash), descriptor = path.join(installRoot, 'installation.json'), stateDir = path.join(installRoot, 'state', 'production'), cepDir = path.join(extensionsDir, BUNDLE);
  if (entryExists(path.join(stateDir, 'runtime-start-over.json'))) fail('start_over_install_pending');
  if (entryExists(path.join(stateDir, 'work-session.json')) && (runtime.runtimeModel !== 'owner' || runtime.version !== 4)) fail('work_session_reader_unsupported');
  assertSwitchVolumes(installRoot, cepDir);
  const clientDescriptorPath = clientPaths(installRoot), previousClient = checkedBytes(clientDescriptorPath);
  const originBytes = checkedBytes(path.join(installRoot, 'origin.json'), 8192), anchorBytes = checkedBytes(path.join(stateDir, 'origin.json'), 8192);
  if (!!originBytes !== !!anchorBytes || (originBytes && !originBytes.equals(anchorBytes))) fail('stable_state_origin_missing_or_mismatch');
  if (!originBytes && (fs.existsSync(descriptor) || fs.existsSync(cepDir) || fs.existsSync(stateDir))) fail('existing_installation_without_origin');
  const origin = originBytes ? JSON.parse(originBytes) : { version: 1, installationId: 'installation-' + crypto.randomUUID(), machineId: machineId || os.hostname(), createdAt: new Date().toISOString() };
  if (origin.machineId !== (machineId || os.hostname())) fail('machine_origin_mismatch');
  const previousDescriptor = checkedBytes(descriptor), previousConfig = bytes(configPath), previousCep = snapshot(cepDir);
  if (originBytes && !previousDescriptor) fail('installation_descriptor_required');
  if (previousDescriptor) {
    const old = JSON.parse(previousDescriptor); if (old.installationId !== origin.installationId || old.installRoot !== installRoot || old.stateDir !== stateDir) fail('installation_identity_mismatch');
    if (old.version === 2 && old.cepDir !== cepDir) fail('installation_cep_binding_change_unsupported');
    const previousRuntime = installedBinding(old);
    if (previousRuntime.runtimeModel === 'owner') assertOwnedClient(previousClient, old, originBytes);
    else if (previousClient) fail('foreign_client_descriptor');
    assertHistoricalInstallation(old, origin, cepDir);
    assertManagedConfig(previousConfig, old, previousRuntime, nodePath);
  }
  else if (previousClient) fail('foreign_client_descriptor');
  const transactionId = crypto.randomUUID();
```

## `core4/tools/install-core4.js:376–386`
Полный файл SHA256 (hex groups, concatenate) `a64b61d4:be78a1d3:0247488f:f09e8d66:987608df:0b315d1b:610fe17f:e9e93c11`; Git blob `8f29f14b:f3c39883:8081bfce:53b554a4:ff3a6662`. Выдержка: строки 376–386, 2001 bytes.

```javascript
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  const cep = Object.fromEntries(Object.entries(pkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, data]) => [f.slice(4), data]));
  cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical(installationConfig(d, selected)) + ';\n').toString('base64');
  if (selected.registryVerification) cep['installation-state.json'] = Buffer.from(canonical(require('../runtime/stdio-entry').installationMarker(d, selected))).toString('base64');
  const plannedOrigin = originBytes || Buffer.from(canonical(origin));
  const nextClient = runtime.runtimeModel === 'owner' ? Buffer.from(canonical(require('../runtime/client-entry').projectClientDescriptor(d, { originBytes: plannedOrigin }))) : null;
  const clientBinding = { version: 1, runtimeModel: runtime.runtimeModel, clientDescriptorPath, previousClient: previousClient?.toString('base64') ?? null, appliedClientHash: nextClient ? hash(nextClient) : null };
  const nextConfig = configText(previousConfig, runtime.runtimeModel === 'owner' ? clientDescriptorPath : descriptor, nodePath, path.join(releaseDir, runtime.clientEntry), runtime.clientArgument);
  const plan = { pkg, origin, originBytes: plannedOrigin, clientBinding, nextClient, transactionId, descriptor: d, descriptorPath: descriptor, configPath, nextConfig, cepDir, cep, previousDescriptor, previousConfig, previousCep, baseline: { client: previousClient ? hash(previousClient) : null, rootOrigin: originBytes ? hash(originBytes) : null, anchorOrigin: anchorBytes ? hash(anchorBytes) : null, config: previousConfig ? hash(previousConfig) : null, descriptor: previousDescriptor ? hash(previousDescriptor) : null, cep: treeHash(previousCep) } };
  preparedPlans.set(plan, { digest: planDigest(plan), prepared: null, initialFiles: previousDescriptor === null ? new Map() : null });
  assertPublicationPaths(descriptor, configPath); assertInitialLayout(plan); return plan;
```

## `core4/tools/install-core4.js:453–479`
Полный файл SHA256 (hex groups, concatenate) `a64b61d4:be78a1d3:0247488f:f09e8d66:987608df:0b315d1b:610fe17f:e9e93c11`; Git blob `8f29f14b:f3c39883:8081bfce:53b554a4:ff3a6662`. Выдержка: строки 453–479, 2208 bytes.

```javascript
function applyInstall(plan, { lease: borrowed, stoppedPermit } = {}) {
  let fingerprint = assertPreparedInstallPlan(plan);
  assertBaseline(plan);
  if (!borrowed) assertInitialLayout(plan);
  const certified = stoppedPermit && require('./stopped-update').assertStoppedUpdatePermit(stoppedPermit, { plan, lease: borrowed });
  const d = plan.descriptor; assertNoLifecycleMarkers(d.stateDir, !!certified); assertSwitchVolumes(d.installRoot, plan.cepDir); fs.mkdirSync(d.installRoot, { recursive: true });
  const scope = { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath: plan.descriptorPath };
  const lease = borrowed || acquireInstallLease(scope); assertInstallLease(lease, scope, { full: true });
  let txnFile, txn, writes = false; const staged = new Map();
  try {
    assertBaseline(plan);
    assertInitialLayout(plan, lease);
    if (d.version !== 2 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(plan.transactionId) || (plan.previousDescriptor ? canonical(d.predecessor) !== canonical({ transactionId: plan.transactionId, previousDescriptorHash: hash(plan.previousDescriptor) }) : d.predecessor !== null)) fail('install_lineage_plan');
    assertRuntimeStopped(d.stateDir, { lease, descriptorPath: plan.descriptorPath, cepDir: plan.cepDir, plan, stoppedPermit });
    writes = true;
    fs.mkdirSync(path.join(d.installRoot, 'transactions'), { recursive: true });
    fingerprint = prepareInstallPlan(plan, { lease });
    checkpointInstallLease(lease, 'installing');
    const existingRelease = fs.existsSync(d.releaseDir);
    if (initialPlan(plan) && existingRelease) fail('initial_installation_not_pristine');
    if (!existingRelease) {
      writes = true;
      const stage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
      for (const [relative, b64] of Object.entries(plan.pkg.files)) durable(path.join(stage, relative), Buffer.from(b64, 'base64'));
      durable(path.join(stage, 'release.json'), canonical(plan.pkg.release)); checkRelease(stage, plan.pkg.release);
      if (initialPlan(plan) && entryExists(d.releaseDir)) fail('initial_installation_not_pristine');
      fs.renameSync(stage, d.releaseDir);
```

## `core4/runtime/adobe-child-environment.js:1–24`
Полный файл SHA256 (hex groups, concatenate) `0db59905:46fb91ee:f36e943a:ab5739ce:8243b2ac:cb1209a9:3d097c04:b84ecfa9`; Git blob `9627073f:a980008d:cac94347:e426d967:d9500e5f`. Выдержка: строки 1–24, 2285 bytes.

```javascript
'use strict';
// Shared Adobe child environment only. Never widen the owner/client environment.
const path = require('node:path');
const os = require('node:os');
const { windowsProbe } = require('./render-job-history');
const FOLDERS = Object.freeze({ SystemRoot: 'Windows', APPDATA: 'ApplicationData', LOCALAPPDATA: 'LocalApplicationData',
  ProgramData: 'CommonApplicationData', ProgramFiles: 'ProgramFiles', CommonProgramFiles: 'CommonProgramFiles',
  'ProgramFiles(x86)': 'ProgramFilesX86', 'CommonProgramFiles(x86)': 'CommonProgramFilesX86' });
const QUERY = '@{' + Object.entries(FOLDERS).map(([key, folder]) => "'" + key + "'=[Environment]::GetFolderPath('" + folder + "')").join(';') + '} | ConvertTo-Json -Compress';
function adobeEnvironment(executable, { probe = windowsProbe, userInfo = os.userInfo, inherited = process.env, failure = 'adobe_native_environment' } = {}) {
  const valid = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && path.win32.isAbsolute(value) && !/[;\x00-\x1f]/.test(value);
  const requireFact = condition => { if (!condition) throw new Error(failure); };
  const known = JSON.parse(probe(QUERY, failure)), user = userInfo();
  requireFact(valid(executable) && [known.SystemRoot, known.APPDATA, known.LOCALAPPDATA, known.ProgramData, user.homedir].every(valid));
  requireFact(typeof user.username === 'string' && user.username.length > 0 && user.username.length <= 256 && !/[\x00-\x1f]/.test(user.username));
  const windows = known.SystemRoot, system = path.win32.join(windows, 'System32'), homeRoot = path.win32.parse(user.homedir).root;
  const env = Object.fromEntries(Object.keys(FOLDERS).filter(key => valid(known[key])).map(key => [key, known[key]]));
  const temp = valid(inherited.TEMP) ? inherited.TEMP : path.win32.join(known.LOCALAPPDATA, 'Temp');
  return { ...env, WINDIR: windows, SYSTEMDRIVE: path.win32.parse(windows).root.slice(0, 2), ComSpec: path.win32.join(system, 'cmd.exe'),
    PATH: [path.win32.dirname(executable), system, windows].join(';'), PATHEXT: '.COM;.EXE;.BAT;.CMD',
    USERPROFILE: user.homedir, USERNAME: user.username, HOMEDRIVE: homeRoot.slice(0, 2), HOMEPATH: user.homedir.slice(2),
    TEMP: temp, TMP: temp, NODE_V8_COVERAGE: '' };
}
module.exports = { adobeEnvironment };
```
