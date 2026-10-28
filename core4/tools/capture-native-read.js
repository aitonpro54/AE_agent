'use strict';
// Standalone evidence-only operator. No installed/source non-builtin code imports.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const { execFile } = require('node:child_process');
const PURPOSE = 'native-read-evidence-capture-v1', BUNDLE = 'com.codex.aeagentcore4';
const DIGEST = /^[a-f0-9]{64}$/;
const READ_EXECUTOR = '787a1cc3b2a084a7a2bed11008def8be75aa61e889f48a1469c3db0b7056e019';
const READ_CONTRACT = 'cd0e85894e11e2e070cb73113321b24dfca95b00aa934364313f04319ea6dc5a';
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('capture_json');
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail('capture_schema'); }
function equal(a, b, code = 'capture_binding') { if (canonical(a) !== canonical(b)) fail(code); }
function mac(v, secret) { return crypto.createHmac('sha256', secret).update(canonical(v)).digest('hex'); }
function validMac(v, actual, secret) { return typeof actual === 'string' && DIGEST.test(actual) && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(mac(v, secret))); }
function pidState(pid) { try { process.kill(pid, 0); return 'alive'; } catch (e) { return e.code === 'ESRCH' ? 'dead' : 'unknown'; } }
function portState() { return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port: 3457 }); let done = false; function finish(v) { if (!done) { done = true; socket.destroy(); resolve(v); } } socket.once('connect', () => finish('active')); socket.once('error', e => finish(e.code === 'ECONNREFUSED' ? 'absent' : 'unknown')); socket.setTimeout(500, () => finish('unknown')); }); }
// Fixed query: command lines remain inside the probe; only matching PIDs leave it.
// All checked paths are DATA. Reparse attributes unavailable to Node lstat are
// checked by Get-Item; any inaccessible path/inventory fails the whole probe.
const PROCESS_PROBE = '$ErrorActionPreference="Stop";[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false);[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false);$captureData=ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd());if($captureData -isnot [Array] -or $captureData.Count -lt 1 -or $captureData.Count -gt 8192){throw "capture_path_array"};foreach($captureValue in $captureData){if($captureValue -isnot [string] -or [string]::IsNullOrWhiteSpace($captureValue) -or -not [IO.Path]::IsPathRooted($captureValue)){throw "capture_path_string"}};[string[]]$capturePaths=$captureData;foreach($capturePath in $capturePaths){if((Get-Item -LiteralPath $capturePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "capture_reparse"}};$capturePids=@();foreach($captureProcess in @(Get-CimInstance Win32_Process -Filter "Name = \'node.exe\'")){if($captureProcess.ProcessId -eq [int]$env:CORE4_CAPTURE_SELF){continue};if(-not $captureProcess.CommandLine){throw "capture_inventory_unknown"};$captureLine=$captureProcess.CommandLine.Replace("/","\\");if($captureLine.IndexOf($env:CORE4_CAPTURE_DESCRIPTOR,[StringComparison]::OrdinalIgnoreCase)-ge 0 -or $captureLine.IndexOf($env:CORE4_CAPTURE_ROOT,[StringComparison]::OrdinalIgnoreCase)-ge 0){$capturePids+=[int]$captureProcess.ProcessId}};[ordered]@{version=1;matchedPids=$capturePids;pathsChecked=$capturePaths.Count;observedAt=[DateTime]::UtcNow.ToString("o")}|ConvertTo-Json -Depth 3 -Compress';
function processesForInstallation(d, descriptor, checkedPaths) {
  if (process.platform !== 'win32') fail('capture_windows_probe_required');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, { CORE4_CAPTURE_SELF: String(process.pid), CORE4_CAPTURE_DESCRIPTOR: descriptor.replace(/\//g, '\\'), CORE4_CAPTURE_ROOT: d.installRoot.replace(/\//g, '\\') });
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const input = JSON.stringify(checkedPaths); if (Buffer.byteLength(input) > 2 * 1024 * 1024) fail('capture_probe_path_budget');
  return new Promise((resolve, reject) => {
    const child = execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PROCESS_PROBE], { env, windowsHide: true, timeout: 5000, maxBuffer: 16384 }, (error, stdout, stderr) => {
      if (error || stderr.trim()) { reject(Object.assign(new Error('capture_process_probe_failed'), { code: 'capture_process_probe_failed' })); return; }
      try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); } catch { reject(Object.assign(new Error('capture_process_probe_invalid'), { code: 'capture_process_probe_invalid' })); }
    });
    // Paths can exceed Windows' per-environment-value limit once retained code
    // trees are checked. Pipe bounded UTF-8 JSON DATA, never executable text.
    child.stdin.on('error', () => reject(Object.assign(new Error('capture_process_probe_failed'), { code: 'capture_process_probe_failed' })));
    child.stdin.end(input);
  });
}
function defaults() { return { cepDir: process.env.APPDATA && path.join(process.env.APPDATA, 'Adobe/CEP/extensions', BUNDLE), config: path.join(process.cwd(), '.codex/config.toml'), evidenceRoot: process.cwd() }; }
function createCapture({ io = fs, probePid = pidState, probeProcesses = processesForInstallation, probePort = portState, port = 3457, globalTimeoutMs = 60000, completionTimeoutMs = 15000, onListening = () => {} } = {}) {
  let listeningPort = null;
  function exists(file) { try { io.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; fail('capture_absence_unknown'); } }
  function snapshot(args, owned = new Map()) {
    const opts = { ...defaults(), ...args }, checked = new Set(), protectedHashes = {};
    if (typeof opts.cepDir !== 'string' || !path.isAbsolute(opts.cepDir) || typeof opts.config !== 'string' || !path.isAbsolute(opts.config)) fail('capture_layout_required');
    function safe(file, directory = false) {
      if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) fail('capture_absolute_path');
      let cursor = path.parse(file).root;
      for (const part of file.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part); const s = io.lstatSync(cursor); checked.add(cursor);
        if (s.isSymbolicLink() || s.reparsePoint || io.realpathSync(cursor) !== cursor || cursor !== file && !s.isDirectory()) fail('capture_symlink_or_reparse');
      }
      const stat = io.lstatSync(file); if (directory ? !stat.isDirectory() : !stat.isFile()) fail('capture_path_type');
    }
    function read(file, max = 4 * 1024 * 1024) { safe(file); const bytes = io.readFileSync(file); if (bytes.length > max) fail('capture_file_budget'); protectedHashes[file] = hash(bytes); return bytes; }
    function json(file) { const b = read(file), text = b.toString('utf8'); if (!Buffer.from(text).equals(b)) fail('capture_utf8'); return JSON.parse(text); }
    const descriptor = opts.descriptor; const d = json(descriptor);
    exact(d, ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken']);
    if (d.version !== 1 || !DIGEST.test(d.packageHash) || !DIGEST.test(d.nodeHash) || !DIGEST.test(d.panelToken) || !DIGEST.test(d.controlToken) || d.panelToken === d.controlToken || !/^v(2\d|[3-9]\d)\./.test(d.nodeVersion)) fail('capture_descriptor');
    if (d.machineId !== os.hostname()) fail('capture_machine_mismatch');
    if (process.platform === 'win32' && path.basename(d.nodePath).toLowerCase() !== 'node.exe') fail('capture_node_basename');
    if (descriptor !== path.join(d.installRoot, 'installation.json') || d.stateDir !== path.join(d.installRoot, 'state/production') || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) || path.basename(d.installRoot).toLowerCase() !== 'aeagentcore4') fail('capture_installation_scope');
    safe(d.installRoot, true); safe(d.stateDir, true); safe(path.join(d.installRoot, 'transactions'), true);
    if (path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(read(d.nodePath, 512 * 1024 * 1024)) !== d.nodeHash || process.version !== d.nodeVersion) fail('capture_node_binding');
    const origin = json(path.join(d.installRoot, 'origin.json')), anchor = json(path.join(d.stateDir, 'origin.json'));
    equal(origin, anchor); if (origin.version !== 1 || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('capture_origin');
    const release = json(path.join(d.releaseDir, 'release.json')); exact(release, ['version', 'format', 'hashes']);
    if (release.version !== '4.0.0' || release.format !== 1 || hash(release) !== d.packageHash) fail('capture_package');
    function tree(directory, expected, inert = false) {
      if (Object.keys(expected).length > 256) fail('capture_tree_budget'); let treeBytes = 0;
      const dirs = new Set(['']); for (const f of Object.keys(expected)) {
        if (!/^[A-Za-z0-9_./-]+$/.test(f) || f.split('/').some(p => !p || p === '.' || p === '..')) fail('capture_release_path');
        for (let dir = path.posix.dirname(f); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
      }
      const remaining = new Set(Object.keys(expected));
      function visit(dir, relative) {
        safe(dir, true); if (!dirs.delete(relative)) fail('capture_tree_mismatch');
        for (const name of io.readdirSync(dir)) {
          const full = path.join(dir, name), rel = relative ? relative + '/' + name : name, stat = io.lstatSync(full);
          if (stat.isSymbolicLink() || stat.reparsePoint || io.realpathSync(full) !== full) fail('capture_symlink_or_reparse');
          if (stat.isDirectory()) visit(full, rel);
          else {
            if (!remaining.delete(rel)) fail('capture_tree_mismatch');
            const bytes = read(full, inert ? 512 * 1024 : 4 * 1024 * 1024);
            treeBytes += bytes.length; if (treeBytes > 64 * 1024 * 1024) fail('capture_tree_budget');
            if (inert) { inertCacheBytes += bytes.length; if (inertCacheBytes > 16 * 1024 * 1024) fail('capture_cache_budget'); }
            if (hash(bytes) !== expected[rel]) fail('capture_tree_bytes');
          }
        }
      }
      visit(directory, ''); if (remaining.size || dirs.size) fail('capture_tree_mismatch');
    }
    tree(d.releaseDir, { ...release.hashes, 'release.json': hash(canonical(release)) });
    const contract = json(path.join(d.releaseDir, 'modules/project-inspection/contract.json')), admission = json(path.join(d.releaseDir, 'modules/project-inspection/artifact.json'));
    if (hash(contract) !== READ_CONTRACT || admission.executorHash !== READ_EXECUTOR || contract.moduleId !== 'project-inspection' || contract.operationId !== 'inspect-project' || contract.executionPolicy !== 'read-only-current-observation-v1' || contract.effectPolicy.effect !== 'none' || contract.effectPolicy.continuity !== false || contract.buildSupported !== false || admission.moduleId !== contract.moduleId || admission.executionPolicy !== contract.executionPolicy || admission.contractHash !== hash(contract) || admission.executorHash !== hash(read(path.join(d.releaseDir, 'modules/project-inspection/executor.jsx')))) fail('capture_read_only_asset');
    const manual = json(path.join(d.releaseDir, 'config/admissions/titles-current-target.json'));
    const expectedCep = Object.fromEntries(Object.entries(release.hashes).filter(([f]) => f.startsWith('cep/')).map(([f, digest]) => [f.slice(4), digest]));
    if (Object.keys(expectedCep).length !== 6 || path.basename(opts.cepDir) !== BUNDLE) fail('capture_cep_scope');
    const cfg = { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: admission.executorHash, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: admission.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
    tree(opts.cepDir, { ...expectedCep, 'installation.js': hash('window.Core4Installation=' + canonical(cfg) + ';\n') });
    read(opts.config);
    const receiver = path.join(d.stateDir, 'receiver'), broker = path.join(d.stateDir, 'broker'); safe(receiver, true); safe(broker, true);
    const gates = [path.join(d.installRoot, 'install.lock'), path.join(broker, 'broker-owner.gate')];
    for (const gate of gates) { if (owned.has(gate)) { if (hash(read(gate)) !== hash(owned.get(gate))) fail('capture_gate_changed'); delete protectedHashes[gate]; } else if (exists(gate)) fail('capture_gate_unavailable'); }
    for (const f of ['broker-owner.lock', 'ledger.ndjson']) if (exists(path.join(broker, f))) fail('capture_other_obligations');
    if (io.readdirSync(broker).some(name => name !== 'artifacts' && (name !== 'broker-owner.gate' || !owned.has(gates[1]))) || canonical(io.readdirSync(receiver).sort()) !== canonical(['completions.ndjson', 'owner'])) fail('capture_other_obligations');
    // Broker startup publishes immutable core code copies. Snapshot their exact
    // bounded shape/bytes as INERT DATA, including stale copies. Classify by a
    // verified retained package's explicit core manifest; no descriptor/backups,
    // imports, execution, authority lineage or grants are involved.
    let inertCacheBytes = 0;
    const inertCacheTrees = {}, cacheClassifications = {}, cacheRoot = path.join(broker, 'artifacts'), cachePresent = exists(cacheRoot);
    if (cachePresent) {
      safe(cacheRoot, true); const names = io.readdirSync(cacheRoot).sort();
      if (names.length > 8 || names.some(name => !/^core-[a-f0-9]{64}$/.test(name))) fail('capture_cache_shape');
      const currentCore = json(path.join(d.releaseDir, 'core/artifact.json')), manifests = new Map([[hash(currentCore), { manifest: currentCore, packageHash: d.packageHash }]]);
      const missing = new Set(names.map(name => name.slice(5)).filter(identity => !manifests.has(identity)));
      if (missing.size) {
        const releasesRoot = path.join(d.installRoot, 'releases'); safe(releasesRoot, true); const packages = io.readdirSync(releasesRoot).sort();
        if (packages.length > 16 || packages.some(name => !DIGEST.test(name))) fail('capture_cache_release_inventory');
        for (const packageHash of packages) {
          if (packageHash === d.packageHash) continue;
          const directory = path.join(releasesRoot, packageHash); safe(directory, true);
          const retained = json(path.join(directory, 'release.json')); exact(retained, ['version', 'format', 'hashes']);
          if (retained.version !== '4.0.0' || retained.format !== 1 || hash(retained) !== packageHash) fail('capture_cache_release_binding');
          const bytes = read(path.join(directory, 'core/artifact.json'));
          if (hash(bytes) !== retained.hashes['core/artifact.json']) fail('capture_cache_release_binding');
          const manifest = JSON.parse(bytes.toString('utf8')), identity = hash(manifest);
          if (!missing.has(identity)) continue;
          tree(directory, { ...retained.hashes, 'release.json': hash(canonical(retained)) });
          manifests.set(identity, { manifest, packageHash }); missing.delete(identity);
          if (!missing.size) break;
        }
        if (missing.size) fail('capture_cache_unclassified');
      }
      for (const name of names) {
        const selected = manifests.get(name.slice(5)), manifest = selected.manifest; exact(manifest, ['id', 'version', 'hashes']);
        const shape = manifest.hashes;
        if (manifest.id !== 'core' || !Object.keys(shape).length || Object.keys(shape).length > 128 || Object.keys(shape).some(file => !/^(?:core\/|protocol\/|worker\.js$)/.test(file) || !DIGEST.test(shape[file]))) fail('capture_cache_shape');
        const directory = path.join(cacheRoot, name); tree(directory, shape, true);
        cacheClassifications[name] = { packageHash: selected.packageHash, coreManifestHash: name.slice(5), evidenceOnly: true };
        inertCacheTrees[name] = Object.fromEntries(Object.keys(shape).sort().map(file => [file, protectedHashes[path.join(directory, file)]]));
      }
    }
    for (const name of io.readdirSync(d.stateDir)) {
      if (!['origin.json', 'broker', 'receiver', 'host-adoption.json'].includes(name)) fail('capture_other_obligations');
      if (name === 'host-adoption.json') read(path.join(d.stateDir, name));
    }
    if (read(path.join(receiver, 'owner')).length !== 0) fail('capture_owner_nonempty');
    const journalPath = path.join(receiver, 'completions.ndjson'), journalBytes = read(journalPath), text = journalBytes.toString('utf8');
    if (!Buffer.from(text).equals(journalBytes) || !text.endsWith('\n') || text.split('\n').length !== 4) fail('capture_journal_shape');
    const events = text.trimEnd().split('\n').map(line => JSON.parse(line));
    for (let i = 0; i < 3; i++) { const e = events[i], { recordHash, ...body } = e; if (e.seq !== i + 1 || e.previousHash !== (i ? events[i - 1].recordHash : 'origin') || hash(body) !== recordHash) fail('capture_journal_hash'); }
    const [first, begin, last] = events;
    exact(first, ['type', 'identity', 'seq', 'previousHash', 'recordHash']); exact(begin, ['type', 'commandId', 'commandDigest', 'command', 'originalBinding', 'seq', 'previousHash', 'recordHash']); exact(last, ['type', 'commandId', 'seq', 'previousHash', 'recordHash']);
    const c = begin.command, binding = begin.originalBinding;
    exact(c, ['protocolVersion', 'controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'phase', 'payloadHash', 'payload']);
    exact(c.payload, Object.hasOwn(c.payload, 'compId') ? ['compId'] : []);
    if (Object.hasOwn(c.payload, 'compId') && (!Number.isSafeInteger(c.payload.compId) || c.payload.compId < 1)) fail('capture_payload');
    if (first.type !== 'origin' || typeof first.identity !== 'string' || !first.identity || begin.type !== 'begin' || last.type !== 'unknown' || c.commandId !== begin.commandId || last.commandId !== c.commandId || c.protocolVersion !== 1 || c.moduleId !== 'project-inspection' || c.operationId !== 'inspect' || c.phase !== 'inspect' || c.executorHash !== admission.executorHash || c.payloadHash !== hash(canonical(c.payload)) || begin.commandDigest !== hash(c)) fail('capture_command_scope');
    const fields = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase'];
    if (fields.some(k => typeof c[k] !== 'string' || !c[k])) fail('capture_command_binding');
    const expectedBinding = { ...Object.fromEntries(fields.map(k => [k, c[k]])), receiverStoreIdentity: first.identity };
    equal(binding, { ...expectedBinding, receiptRef: hash(expectedBinding) });
    // Evidence paths are bound to an explicit project root, never interpreted as code.
    safe(opts.evidenceRoot, true); const w = json(opts.provenance);
    if (w.version !== 1 || w.evidenceOnly !== true || w.authority !== false || w.installationId !== d.installationId || w.receiverStoreIdentity !== first.identity || w.journalHash !== hash(journalBytes) || !Array.isArray(w.files) || w.files.length !== 6) fail('capture_provenance');
    equal(w.originalCommand, c); equal(w.originalBinding, binding);
    const evidence = new Map();
    for (const item of w.files) {
      exact(item, ['file', 'sha256']); if (typeof item.file !== 'string' || !DIGEST.test(item.sha256) || path.isAbsolute(item.file) || item.file.includes('\\') || item.file.split('/').some(p => !p || p === '.' || p === '..')) fail('capture_evidence_path');
      const full = path.resolve(opts.evidenceRoot, item.file); if (!full.startsWith(opts.evidenceRoot + path.sep) || evidence.has(path.basename(full))) fail('capture_evidence_path');
      const bytes = read(full); if (hash(bytes) !== item.sha256) fail('capture_evidence_hash'); evidence.set(path.basename(full), true);
    }
    function evidenceFile(name) { const f = w.files.find(f => path.posix.basename(f.file) === name); if (!f) fail('capture_provenance_files'); return path.join(opts.evidenceRoot, f.file); }
    function lines(name) { const b = read(evidenceFile(name)); if (!b.toString().endsWith('\n')) fail('capture_evidence_lines'); return b.toString().trimEnd().split('\n').map(line => JSON.parse(line)); }
    const context = json(evidenceFile('context.json')), requests = lines('requests.jsonl'), replies = lines('stdio.raw.jsonl'), exit = lines('exit.jsonl'), managed = json(evidenceFile('original-managed-command-evidence.json'));
    if (!read(evidenceFile('original-receiver-journal.jsonl')).equals(journalBytes)) fail('capture_provenance_journal');
    const m = w.managedProcess, item = managed.item;
    if (!Number.isSafeInteger(m?.pid) || m.pid < 1 || m.exitCode !== 0 || m.packageHash !== d.packageHash || !Number.isFinite(Date.parse(m.contextBeforeSpawn)) || !Number.isFinite(Date.parse(m.endedByUtc)) || Date.parse(m.contextBeforeSpawn) > Date.parse(m.endedByUtc) || Date.parse(m.endedByUtc) > Date.now() || context.at !== m.contextBeforeSpawn || context.packageHash !== d.packageHash || context.automaticNativeDispatch !== false || context.recordContext?.purpose !== 'technical_check' || context.recordContext?.lifetime !== 'ephemeral_check' || exit.length !== 1 || exit[0].code !== 0 || exit[0].signal !== null || exit[0].at !== m.endedByUtc || managed.sourceThread !== w.sourceThread || managed.sourceTurn !== w.sourceTurn || item?.id !== w.sourceCommandItem || item.type !== 'commandExecution' || item.status !== 'completed' || item.exitCode !== 0 || item.cwd !== opts.evidenceRoot || item.output?.truncated !== false || typeof item.command !== 'string' || !item.command.includes(d.nodePath.replace(/\\/g, '\\\\')) && !item.command.includes(d.nodePath) || !item.command.includes(d.packageHash) || typeof item.output.text !== 'string') fail('capture_managed_provenance');
    const childStart = item.output.text.match(/\{"proof":"child_started","pid":(\d+),"packageHash":"([a-f0-9]{64})"/);
    if (!childStart || Number(childStart[1]) !== m.pid || childStart[2] !== d.packageHash) fail('capture_managed_provenance');
    const requestMap = new Map(), replyMap = new Map();
    for (const r of requests) { if (requestMap.has(r.id)) fail('capture_duplicate_evidence'); requestMap.set(r.id, r); if (!['initialize', 'tools/call'].includes(r.method) || r.method === 'tools/call' && !['core_status', 'get_module_contract', 'inspect_module_target'].includes(r.params?.name)) fail('capture_other_requests'); }
    for (const r of replies) { if (replyMap.has(r.id)) fail('capture_duplicate_evidence'); replyMap.set(r.id, r); }
    const o = w.observations;
    function result(id) { const r = replyMap.get(id); if (!r?.result || r.result.isError || r.result.content?.length !== 1 || r.result.content[0].type !== 'text') fail('capture_evidence_result'); return JSON.parse(r.result.content[0].text); }
    const pre = result(o.preDispatchStatus), contractReply = result(o.contractReply), delivered = result(o.deliveredStatus), post = result(o.postTimeoutStatus);
    for (const s of [pre, delivered, post]) {
      if (s.pid !== m.pid || s.installation?.installationId !== d.installationId || s.installation?.packageHash !== d.packageHash || s.installation?.machineId !== d.machineId || s.ledgerFault !== false || s.ownershipFault !== null || !Array.isArray(s.unresolved) || s.unresolved.length || s.physical?.receiverStoreIdentity !== first.identity || s.physical.storeFault !== false || s.worker?.pending !== 0 || s.worker?.pid !== null) fail('capture_status_provenance');
    }
    const contractId = hash({ packageHash: d.packageHash, admission, contract });
    if (contractReply.contractId !== contractId || contractReply.modulePin !== hash(admission)) fail('capture_contract_provenance'); equal(contractReply.contract, contract);
    const dispatched = requestMap.get(o.soleDispatchedRequest), refusal = replyMap.get(o.definiteRefusal);
    if (o.successfulNativeReads !== 0 || o.mutatingCommands !== 0 || requestMap.get(o.contractReply)?.params?.name !== 'get_module_contract' || dispatched?.params?.name !== 'inspect_module_target' || replyMap.get(o.soleDispatchedRequest)?.error?.message !== 'host_callback_timeout' || refusal?.error?.message !== 'contract_required' || requests.filter(r => r.params?.name === 'inspect_module_target').length !== 2 || pre.physical.pending !== null || pre.physical.storeClosed !== false || delivered.physical.pending?.commandId !== c.commandId || delivered.physical.pending.delivered !== true || post.physical.pending !== null || post.physical.storeClosed !== true || post.physical.unknown !== true) fail('capture_dispatch_provenance');
    equal(dispatched.params.arguments, { payload: { moduleId: 'project-inspection', contractId, target: c.payload } });
    const proof = { version: 1, purpose: PURPOSE, operatorHash: hash(io.readFileSync(__filename)), installationId: d.installationId, machineId: d.machineId, packageHash: d.packageHash, descriptorHash: protectedHashes[descriptor], receiverStoreIdentity: first.identity, journalHash: hash(journalBytes), journalTailHash: last.recordHash, commandDigest: begin.commandDigest, contractId, originalBinding: binding, pins: { packageHash: d.packageHash, installationId: d.installationId, executorHash: admission.executorHash }, provenanceHash: protectedHashes[opts.provenance], managedPid: m.pid, inertCacheRoot: cachePresent ? cacheRoot : null, inertCacheTrees, cacheClassifications, protectedHashes };
    return { d, opts, proof, proofHash: hash(proof), checkedPaths: [...checked].sort(), gates };
  }
  async function observe(state, listenerOwned = false) {
    if (await probePid(state.proof.managedPid) !== 'dead') fail('capture_pid_not_dead');
    const p = await probeProcesses(state.d, state.opts.descriptor, state.checkedPaths);
    if (p?.version !== 1 || !Array.isArray(p.matchedPids) || p.matchedPids.length || p.pathsChecked !== state.checkedPaths.length || !Number.isFinite(Date.parse(p.observedAt)) || Math.abs(Date.now() - Date.parse(p.observedAt)) > 5000) fail('capture_processes_unknown_or_active');
    if (!listenerOwned && await probePort() !== 'absent') fail('capture_port_not_absent');
  }
  async function inspect(args, owned) { const a = snapshot(args, owned); await observe(a); const b = snapshot(args, owned); if (a.proofHash !== b.proofHash) fail('capture_proof_changed'); return { proof: b.proof, proofHash: b.proofHash, inspectionOnly: true, authority: false }; }
  function durable(file, value) { const text = canonical(value), fd = io.openSync(file, 'wx'); try { if (io.writeSync(fd, text) !== Buffer.byteLength(text)) fail('capture_short_write'); io.fsyncSync(fd); } finally { io.closeSync(fd); } if (hash(io.readFileSync(file)) !== hash(text)) fail('capture_durable_readback'); }
  async function capture(args) {
    if (!DIGEST.test(args.expectedProofHash)) fail('capture_expected_proof_required');
    const initial = snapshot(args), owned = new Map(), fds = new Map(); let retain = false, transaction, server, globalTimer, completionTimer, ended = false, receiptAttempted = false;
    function closeTimers() { clearTimeout(globalTimer); clearTimeout(completionTimer); }
    try {
      for (const gate of initial.gates) {
        const bytes = Buffer.from(PURPOSE + '-' + crypto.randomUUID()); let fd;
        try { fd = io.openSync(gate, 'wx'); fds.set(gate, fd); retain = true; if (io.writeSync(fd, bytes) !== bytes.length) fail('capture_gate_short_write'); io.fsyncSync(fd); if (!io.readFileSync(gate).equals(bytes)) fail('capture_gate_changed'); owned.set(gate, bytes); retain = false; }
        catch (e) { if (fd === undefined && e.code === 'EEXIST') fail('capture_gate_unavailable'); throw e; }
      }
      const state = snapshot(args, owned); await observe(state); if (state.proofHash !== args.expectedProofHash) fail('capture_proof_changed');
      if (snapshot(args, owned).proofHash !== state.proofHash) fail('capture_proof_changed');
      const transactions = path.join(state.d.installRoot, 'transactions');
      const stat = io.lstatSync(transactions); if (!stat.isDirectory() || stat.isSymbolicLink() || io.realpathSync(transactions) !== transactions) fail('capture_transactions_path');
      transaction = path.join(transactions, crypto.randomUUID() + '-native-read-capture'); retain = true; io.mkdirSync(transaction);
      if (!io.lstatSync(transaction).isDirectory() || io.lstatSync(transaction).isSymbolicLink() || io.realpathSync(transaction) !== transaction) fail('capture_transactions_path');
      durable(path.join(transaction, 'intent.json'), { version: 1, purpose: PURPOSE, proof: state.proof, proofHash: state.proofHash, state: 'evidence-only-no-ack' });
      const transcript = [], challenges = new Map(), epoch = 'capture-' + crypto.randomUUID(), controllerId = 'capture-controller-' + crypto.randomUUID(); let peer;
      const captured = await new Promise((resolve, reject) => {
        function finish(error, value) { if (!ended) { ended = true; closeTimers(); error ? reject(error) : resolve(value); } }
        function send(res, code, value, origin) { if (res.destroyed || res.writableEnded) return; res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) }); res.end(canonical(value)); }
        server = http.createServer(async (req, res) => {
          let corsOrigin, attemptedHere = false;
          try {
            if (ended) fail('capture_closed');
            if (req.headers.host !== '127.0.0.1:' + server.address().port || req.socket.remoteAddress !== '127.0.0.1') fail('loopback_host_required');
            const origin = req.headers.origin;
            if (!['null', 'file://'].includes(origin) || req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === 'origin').length !== 1) fail('cep_origin_required');
            corsOrigin = origin;
            if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }); res.end(); return; }
            if (req.method !== 'POST' || !['/challenge', '/link', '/complete'].includes(req.url)) fail('capture_route_denied');
            let bytes = 0, chunks = []; req.setTimeout(2000, () => req.destroy());
            for await (const chunk of req) { bytes += chunk.length; if (bytes > 262144) fail('capture_frame_budget'); chunks.push(chunk); }
            const text = Buffer.concat(chunks).toString('utf8'), input = JSON.parse(text); if (text !== canonical(input)) fail('capture_wire_json');
            if (req.url === '/challenge') {
              exact(input, ['role']); if (!['panel', 'control'].includes(input.role)) fail('role_required'); if (peer || challenges.size >= 16) fail('capture_challenge_unavailable');
              const challenge = { nonce: crypto.randomBytes(32).toString('hex'), epoch, role: input.role, origin, ...state.proof.pins, controllerId, purpose: PURPOSE, receiverStoreIdentity: state.proof.receiverStoreIdentity, commandDigest: state.proof.commandDigest, journalTailHash: state.proof.journalTailHash };
              challenges.set(challenge.nonce, { value: challenge, time: Date.now() }); transcript.push({ route: req.url, request: input, response: challenge }); send(res, 200, challenge, origin); return;
            }
            if (req.url === '/link') {
              exact(input, ['challenge', 'peerId', 'proof']); const stored = challenges.get(input.challenge?.nonce); challenges.delete(input.challenge?.nonce);
              const secret = stored?.value.role === 'panel' ? state.d.panelToken : state.d.controlToken;
              if (!stored || Date.now() - stored.time > 10000 || stored.value.origin !== origin || canonical(input.challenge) !== canonical(stored.value) || typeof input.peerId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(input.peerId) || !validMac({ challenge: input.challenge, peerId: input.peerId }, input.proof, secret)) fail('peer_auth');
              if (stored.value.role !== 'panel') fail('panel_role_required'); if (peer) fail('duplicate_peer');
              peer = { peerId: input.peerId, origin, sequence: 0 }; const body = { linked: true, epoch, peerId: peer.peerId, controllerId, pins: state.proof.pins, receiverStoreIdentity: state.proof.receiverStoreIdentity, laneClosed: true };
              const response = { body, mac: mac(body, state.d.panelToken) }; transcript.push({ route: req.url, request: input, response }); send(res, 200, response, origin);
              completionTimer = setTimeout(() => finish(Object.assign(new Error('capture_completion_not_received'), { code: 'capture_completion_not_received' })), completionTimeoutMs); return;
            }
            exact(input, ['body', 'mac']); const b = input.body; exact(b, ['epoch', 'peerId', 'sequence', 'method', 'path', 'payload']);
            if (!peer || origin !== peer.origin || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, state.d.panelToken)) fail('peer_auth_or_replay');
            if (receiptAttempted) fail('capture_receipt_attempted'); receiptAttempted = true; attemptedHere = true; peer.sequence = b.sequence;
            exact(b.payload, ['commandId', 'originalBinding', 'pins', 'result']);
            if (b.payload.commandId !== state.proof.originalBinding.commandId) fail('capture_receipt_binding'); equal(b.payload.originalBinding, state.proof.originalBinding, 'capture_receipt_binding'); equal(b.payload.pins, state.proof.pins, 'capture_receipt_pins');
            equal(b.payload.result, { readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' }, 'capture_result_not_admitted');
            const current = snapshot(args, owned); await observe(current, true); if (current.proofHash !== state.proofHash || snapshot(args, owned).proofHash !== state.proofHash) fail('capture_proof_changed');
            if (ended) fail('capture_closed');
            transcript.push({ route: req.url, request: input, response: { error: 'capture_recorded_no_ack' } });
            const record = { version: 1, purpose: PURPOSE, proofHash: state.proofHash, proof: state.proof, transcript, result: b.payload.result, evidenceOnly: true, authority: false, unknownUnchanged: true };
            const receipt = path.join(transaction, 'receipt.json'); durable(receipt, record);
            if (snapshot(args, owned).proofHash !== state.proofHash) fail('capture_proof_changed');
            send(res, 403, { error: 'capture_recorded_no_ack' }, corsOrigin);
            res.once('finish', () => finish(null, { captured: true, evidenceOnly: true, unknownUnchanged: true, ack: false, transaction, receiptHash: hash(canonical(record)), proofHash: state.proofHash }));
          } catch (e) { send(res, 403, { error: e.code || 'capture_request_failed' }, corsOrigin); if (attemptedHere) finish(e); }
        });
        server.requestTimeout = 3000; server.headersTimeout = 3000;
        server.once('error', e => finish(e)); server.listen(port, '127.0.0.1', () => {
          listeningPort = server.address().port;
          try { onListening(Object.freeze({ event: 'capture_listening', proofHash: state.proofHash, port: listeningPort, transaction })); } catch (e) { finish(e); }
        });
        globalTimer = setTimeout(() => finish(Object.assign(new Error('capture_deadline_no_receipt'), { code: 'capture_deadline_no_receipt' })), globalTimeoutMs);
      });
      retain = false; return captured;
    } catch (e) { if (transaction) e.transaction = transaction; throw e; }
    finally {
      ended = true; closeTimers(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } listeningPort = null;
      for (const [file, fd] of [...fds].reverse()) { io.closeSync(fd); if (!retain) { if (!owned.has(file) || !io.readFileSync(file).equals(owned.get(file))) fail('capture_gate_changed'); io.unlinkSync(file); } }
    }
  }
  return Object.freeze({ inspect, capture, status: () => ({ listening: listeningPort !== null, port: listeningPort }) });
}
if (require.main === module) {
  const args = process.argv.slice(2), allowed = ['--installation', '--provenance', '--cep-dir', '--config', '--expected-proof-hash'], flags = args.slice(1).filter((_, i) => i % 2 === 0), get = name => args[args.indexOf(name) + 1];
  if (!['inspect', 'capture'].includes(args[0]) || args.length % 2 !== 1 || flags.some(f => !allowed.includes(f)) || new Set(flags).size !== flags.length || !flags.includes('--installation') || !flags.includes('--provenance') || args[0] === 'capture' && !flags.includes('--expected-proof-hash')) { process.stderr.write('capture-native-read inspect|capture --installation ABS_DESCRIPTOR --provenance ABS_PROVENANCE [--cep-dir ABS_BUNDLE] [--config ABS_CONFIG] [--expected-proof-hash HASH]\n'); process.exitCode = 2; }
  else {
    const options = { descriptor: get('--installation'), provenance: get('--provenance'), ...(flags.includes('--cep-dir') ? { cepDir: get('--cep-dir') } : {}), ...(flags.includes('--config') ? { config: get('--config') } : {}), ...(flags.includes('--expected-proof-hash') ? { expectedProofHash: get('--expected-proof-hash') } : {}) };
    const operator = createCapture({ onListening: event => process.stdout.write(canonical(event) + '\n') }); operator[args[0]](options).then(value => console.log(canonical(args[0] === 'inspect' ? { inspectionOnly: true, evidenceOnly: true, proofHash: value.proofHash, unknownUnchanged: true } : value))).catch(e => { process.stderr.write(canonical({ error: e.code || 'capture_failed', ...(e.transaction ? { transaction: e.transaction } : {}) }) + '\n'); process.exitCode = 1; });
  }
}
module.exports = { createCapture, PROCESS_PROBE, processesForInstallation, defaults };
