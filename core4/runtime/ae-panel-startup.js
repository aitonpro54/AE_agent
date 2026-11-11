'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { hash, canonical } = require('../protocol/json');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function input(value, observe = false) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !['operationId', ...(observe ? [] : ['timeoutMs'])].includes(k)) || !UUID.test(value.operationId) ||
      value.timeoutMs !== undefined && (!Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1000 || value.timeoutMs > 90000)) throw new Error('startup_input');
}
// The installed state/release roots are verified by startup. Recheck every
// existing ancestor for redirection before each request/receipt access.
function plain(file, directory = false) {
  const resolved = path.resolve(file), parent = path.dirname(resolved);
  if (parent !== resolved) plain(parent, true);
  const info = fs.lstatSync(resolved);
  if (info.isSymbolicLink() || info.reparsePoint || fs.realpathSync(resolved).toLowerCase() !== resolved.toLowerCase() || (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1)) throw new Error('startup_path_redirected');
  return info;
}
function mkdir(directory) { try { plain(directory, true); } catch (e) { if (e.code !== 'ENOENT') throw e; const parent = path.dirname(directory); plain(parent, true); fs.mkdirSync(directory); plain(directory, true); } }
function bytes(file) {
  plain(file); const fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd), value = fs.readFileSync(fd), after = fs.fstatSync(fd); plain(file);
    const named = fs.lstatSync(file);
    if (value.length > 512 * 1024 * 1024 || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(k => before[k] !== after[k] || after[k] !== named[k])) throw new Error('startup_file_changed');
    return value;
  } finally { fs.closeSync(fd); }
}
function durable(file, value) {
  plain(path.dirname(file), true);
  const stage = file + '.stage-' + randomUUID(), fd = fs.openSync(stage, 'wx');
  try { const text = typeof value === 'string' ? value : canonical(value); if (fs.writeSync(fd, text) !== Buffer.byteLength(text)) throw new Error('startup_short_write'); fs.fsyncSync(fd); plain(stage); fs.linkSync(stage, file); fs.unlinkSync(stage); plain(file); } finally { fs.closeSync(fd); }
}
const QUERY = String.raw`$ErrorActionPreference='Stop'; $p=@(Get-CimInstance Win32_Process -Filter "Name = 'AfterFX.exe'" -ErrorAction Stop | ForEach-Object { [ordered]@{pid=$_.ProcessId;birth=$_.CreationDate.ToUniversalTime().ToString('o');executablePath=$_.ExecutablePath} }); ConvertTo-Json -InputObject $p -Compress`;
function scanWindows() {
  if (process.platform !== 'win32') throw new Error('startup_platform');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]])); env.USERPROFILE = os.userInfo().homedir;
  return new Promise((resolve, reject) => execFile(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', QUERY],
    { shell: false, windowsHide: true, timeout: 4500, maxBuffer: 8192, env }, (e, stdout, stderr) => {
      try { if (e || stderr.trim()) throw new Error(); const rows = JSON.parse(stdout); if (!Array.isArray(rows) || rows.length > 16 || rows.some(p => !Number.isSafeInteger(p.pid) || p.pid < 1 || typeof p.birth !== 'string' || !Number.isFinite(Date.parse(p.birth)) || !path.win32.isAbsolute(p.executablePath))) throw new Error(); resolve(rows); } catch { reject(new Error('startup_process_probe')); }
    }));
}
function dispatch(executable, args) {
  // AfterFX -r forwards to the one existing instance. No shell and no -m.
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, detached: true, stdio: 'ignore', cwd: path.dirname(executable) });
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve({ pid: child.pid }); });
  });
}
function collisionPreflight(installation, executable, testRoots) {
  const drive = path.parse(process.env.SystemRoot || executable).root;
  const roots = testRoots || [...new Map([path.dirname(installation.cepDir), path.join(os.userInfo().homedir, 'AppData/Roaming/Adobe/CEP/extensions'),
    path.join(drive, 'Program Files/Common Files/Adobe/CEP/extensions'), path.join(drive, 'Program Files (x86)/Common Files/Adobe/CEP/extensions')].map(root => [path.resolve(root).toLowerCase(), root])).values()];
  let copies = 0, menus = 0;
  for (const root of roots) {
    if (!fs.existsSync(root)) continue; plain(root, true);
    const entries = fs.readdirSync(root, { withFileTypes: true }); if (entries.length > 512) throw new Error('startup_extension_inventory');
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const xmlPath = path.join(root, entry.name, 'CSXS/manifest.xml'); if (!fs.existsSync(xmlPath)) continue;
      const xml = bytes(xmlPath).toString('utf8'); if (xml.length > 1024 * 1024) throw new Error('startup_extension_inventory');
      const ids = xml.match(/\bId\s*=\s*["']com\.codex\.aeagentcore4\.panel["']/g) || [], labels = xml.match(/<Menu>\s*AE Agent Core\s*<\/Menu>/g) || [];
      copies += ids.length ? 1 : 0; menus += labels.length;
      if ((ids.length || labels.length) && path.resolve(root, entry.name).toLowerCase() !== path.resolve(installation.cepDir).toLowerCase()) throw new Error('startup_panel_ambiguous');
    }
  }
  if (copies !== 1 || menus !== 1) throw new Error('startup_panel_ambiguous');
  function scripts(directory) {
    if (!fs.existsSync(directory)) return; plain(directory, true);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (/^AE Agent Core\.(jsx|jsxbin)$/i.test(entry.name)) throw new Error('startup_script_menu_collision');
      if (entry.name.toLowerCase() === 'scriptui panels') scripts(file);
    }
  }
  scripts(path.join(path.dirname(executable), 'Scripts'));
}
function ownsRegistryBootstrap(physical, operationId) {
  const bootstrap = physical.registryBootstrap;
  return !!(operationId && physical.pending?.stage === 'registry-bootstrap' && bootstrap?.startupOperationId === operationId && bootstrap.commandId === physical.pending.commandId && bootstrap.peerId === physical.peer.peerId && bootstrap.epoch === physical.peer.identityEpoch);
}
function createAePanelStartup({ installation, expectedIdentity, peerStatus, assertIdle, reverify = () => {}, preflight = collisionPreflight, scan = scanWindows, observeSubmission = require('./windows-owner-process').observeOwnerProcess, launch = dispatch, now = Date.now, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  const root = path.join(installation.stateDir, 'panel-startup'); let busy = false, activeOperationId = null;
  function read(file) { try { return JSON.parse(bytes(file)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
  function binding() {
    const a = read(path.join(installation.stateDir, 'host-adoption.json')), h = a?.host;
    if (a?.version !== 1 || a.installationId !== installation.installationId || a.machineId !== installation.machineId || h?.machineId !== installation.machineId ||
        !h || !path.isAbsolute(h.executablePath) || path.basename(h.executablePath).toLowerCase() !== 'afterfx.exe' || !/^[a-f0-9]{64}$/.test(h.executableHash)) throw new Error('startup_executable_binding_required');
    if (hash(bytes(h.executablePath)) !== h.executableHash) throw new Error('startup_executable_changed');
    return h;
  }
  function panel() { const p = peerStatus().peer; return p.connected && p.registryReady !== false && canonical(p.acceptedIdentity) === canonical(expectedIdentity) ? p : null; }
  function freshPanel(attempt) { const current = panel(), previous = attempt.initialPeer; return current && (!previous || current.peerId !== previous.peerId || current.identityEpoch !== previous.identityEpoch || current.identityObservedAt > previous.identityObservedAt) ? current : null; }
  function preparationOnly(directory, attempt) {
    if (attempt && attempt.dispatchProtocol !== 2 || fs.existsSync(path.join(directory, 'dispatch-entered.json'))) return false;
    plain(directory, true);
    return fs.readdirSync(directory).every(name => /^(?:attempt\.json|request\.json|bootstrap\.jsx|result\.json)(?:\.stage-[a-f0-9-]{36})?$/.test(name));
  }
  function rejectPrepared(directory, attempt) {
    if (preparationOnly(directory, attempt) && !read(path.join(directory, 'result.json'))) durable(path.join(directory, 'result.json'), { outcome: 'rejected', code: 'rejected_before_dispatch' });
  }
  function activity() {
    try {
      if (!fs.existsSync(root)) return { operationId: activeOperationId, pending: busy, unresolved: false };
      plain(root, true);
      const unsettled = fs.readdirSync(root).filter(id => UUID.test(id)).some(id => {
        const directory = path.join(root, id), attempt = read(path.join(directory, 'attempt.json'));
        return !read(path.join(directory, 'result.json')) && !preparationOnly(directory, attempt);
      });
      return { operationId: activeOperationId, pending: busy, unresolved: !busy && unsettled };
    } catch { return { operationId: activeOperationId, pending: busy, unresolved: true }; }
  }
  function status(value) {
    input(value, true); const directory = path.join(root, value.operationId), attempt = read(path.join(directory, 'attempt.json'));
    if (!attempt) { const result = read(path.join(directory, 'result.json')); return { operationId: value.operationId, outcome: result?.outcome || 'absent', code: result?.code || null, nativeVerified: false }; }
    const result = read(path.join(directory, 'result.json')), ack = read(path.join(directory, 'ack.json'));
    if (attempt.operationId !== value.operationId || attempt.packageHash !== installation.packageHash) throw new Error('startup_attempt_binding');
    if (ack && (ack.operationId !== value.operationId || Object.keys(ack).sort().join(',') !== 'code,hostFacts,operationId' || !['menu_executed', 'requires_host_restart'].includes(ack.code) ||
        !ack.hostFacts || Object.keys(ack.hostFacts).sort().join(',') !== 'appVersion,dirty,file,numItems,projectPresent' || typeof ack.hostFacts.appVersion !== 'string' || typeof ack.hostFacts.projectPresent !== 'boolean' ||
        ack.hostFacts.file !== null && typeof ack.hostFacts.file !== 'string' || ack.hostFacts.dirty !== null && typeof ack.hostFacts.dirty !== 'boolean' || ack.hostFacts.numItems !== null && (!Number.isSafeInteger(ack.hostFacts.numItems) || ack.hostFacts.numItems < 0))) throw new Error('startup_ack_invalid');
    return { operationId: value.operationId, outcome: result?.outcome || 'unknown', code: result?.code || 'startup_outcome_unresolved', attempt, completion: result, ack, panel: panel(), nativeVerified: false };
  }
  async function reconcile(value) {
    const directory = path.join(root, value.operationId);
    if (!fs.existsSync(directory)) return status(value);
    const attempt = read(path.join(directory, 'attempt.json')); rejectPrepared(directory, attempt);
    const observed = status(value);
    if (observed.outcome !== 'unknown') return observed;
    if (observed.ack?.code === 'requires_host_restart') durable(path.join(directory, 'result.json'), { outcome: 'blocked', code: 'requires_host_restart' });
    if (observed.ack?.code === 'menu_executed' && freshPanel(observed.attempt)) {
      const current = await scan(), prior = observed.attempt.original || read(path.join(directory, 'host.json'));
      if (current.length === 1 && path.resolve(current[0].executablePath).toLowerCase() === path.resolve(observed.attempt.executablePath).toLowerCase() && (!prior || canonical(current[0]) === canonical(prior))) {
        durable(path.join(directory, 'result.json'), { outcome: 'ready', code: 'authenticated_panel_reconciled', host: current[0], peer: freshPanel(observed.attempt) });
      }
    }
    if (!read(path.join(directory, 'result.json')) && Number.isSafeInteger(observed.attempt.deadline) && now() >= observed.attempt.deadline) {
      const prior = observed.attempt.original || read(path.join(directory, 'host.json')), submission = read(path.join(directory, 'submission.json'));
      if (prior && Number.isSafeInteger(submission?.pid) && submission.pid > 0) {
        const current = await scan(), gone = !current.some(host => canonical(host) === canonical(prior));
        if (gone) { const process = await observeSubmission(submission.pid); if (process?.status === 'absent' && process.pid === submission.pid) durable(path.join(directory, 'result.json'), { outcome: 'interrupted', code: 'startup_host_exited', original: prior, submissionAbsent: process }); }
      }
    }
    return status(value);
  }
  async function observe(value) {
    input(value, true); if (busy) return status(value);
    busy = true; try { return await reconcile(value); } finally { busy = false; }
  }
  async function ensure(value, context) {
    input(value); context.assertCurrent();
    if (busy) return { outcome: 'blocked', code: 'startup_busy', nativeVerified: false };
    busy = true; activeOperationId = value.operationId; let directory, recorded = false, dispatchEntered = false;
    try {
      // Repeated UUID is observation only, including a timeout or owner restart.
      if (fs.existsSync(path.join(root, value.operationId))) return await reconcile({ operationId: value.operationId });
      assertIdle({ operationId: value.operationId });
      if (fs.existsSync(root)) { plain(root, true); for (const prior of fs.readdirSync(root).filter(id => UUID.test(id))) rejectPrepared(path.join(root, prior), read(path.join(root, prior, 'attempt.json'))); if (fs.readdirSync(root).some(id => UUID.test(id) && !read(path.join(root, id, 'result.json')))) throw new Error('startup_outcome_unresolved'); }
      reverify(); const h = binding(); preflight(installation, h.executablePath); const rows = await scan(); context.assertCurrent(); assertIdle({ operationId: value.operationId });
      if (rows.length > 1) throw new Error('startup_ambiguous_ae');
      if (rows.length && path.resolve(rows[0].executablePath).toLowerCase() !== path.resolve(h.executablePath).toLowerCase()) throw new Error('startup_host_mismatch');
      mkdir(root); directory = path.join(root, value.operationId); mkdir(directory);
      const deadline = now() + (value.timeoutMs ?? 60000), original = rows[0] || null;
      const previousPeer = peerStatus().peer, initialPeer = typeof previousPeer.peerId === 'string' ? { peerId: previousPeer.peerId ?? null, identityEpoch: previousPeer.identityEpoch ?? null, identityObservedAt: previousPeer.identityObservedAt ?? null } : null;
      const attempt = { dispatchProtocol: 2, operationId: value.operationId, packageHash: installation.packageHash, deadline, original, initialPeer, executablePath: h.executablePath, executableHash: h.executableHash };
      durable(path.join(directory, 'attempt.json'), attempt); recorded = true;
      if (rows.length === 1 && panel()) {
        durable(path.join(directory, 'result.json'), { outcome: 'ready', code: 'already_authenticated', host: original, peer: panel() });
        return status({ operationId: value.operationId });
      }
      durable(path.join(directory, 'request.json'), { deadline, operationId: value.operationId });
      const script = bytes(path.join(installation.releaseDir, 'runtime/host/ensure-panel.jsx'));
      durable(path.join(directory, 'bootstrap.jsx'), script.toString('utf8'));
      context.assertCurrent(); assertIdle({ operationId: value.operationId });
      // Recheck immediately before dispatch; never launch a second host on ambiguity.
      reverify(); preflight(installation, h.executablePath); if (canonical(binding()) !== canonical(h) || !bytes(path.join(directory, 'bootstrap.jsx')).equals(script)) throw new Error('startup_binding_changed');
      const before = await scan();
      if (canonical(before) !== canonical(rows)) throw new Error('startup_process_changed');
      context.assertCurrent(); assertIdle({ operationId: value.operationId }); durable(path.join(directory, 'dispatch-entered.json'), { operationId: value.operationId, packageHash: installation.packageHash }); dispatchEntered = true;
      const submission = await launch(h.executablePath, ['-r', path.join(directory, 'bootstrap.jsx')]);
      if (Number.isSafeInteger(submission?.pid) && submission.pid > 0) durable(path.join(directory, 'submission.json'), { pid: submission.pid });
      let observedHost = original;
      while (now() < deadline) {
        context.assertCurrent(); assertIdle({ operationId: value.operationId });
        const current = await scan();
        if (original && current.length === 2 && submission?.pid && current.some(p => canonical(p) === canonical(original)) && current.some(p => p.pid === submission.pid && path.resolve(p.executablePath).toLowerCase() === path.resolve(h.executablePath).toLowerCase())) {
          // Known forwarding CLI may be transiently visible. It is never a
          // second accepted host and cannot establish readiness until it exits.
          await wait(Math.min(500, Math.max(1, deadline - now()))); continue;
        }
        if (current.length > 1 || current.length === 1 && (path.resolve(current[0].executablePath).toLowerCase() !== path.resolve(h.executablePath).toLowerCase() || observedHost && canonical(current[0]) !== canonical(observedHost))) throw new Error('startup_process_changed');
        if (current.length === 1 && !observedHost) { observedHost = current[0]; durable(path.join(directory, 'host.json'), observedHost); }
        const ack = read(path.join(directory, 'ack.json'));
        if (ack && (ack.operationId !== value.operationId || Object.keys(ack).sort().join(',') !== 'code,hostFacts,operationId' || !['menu_executed', 'requires_host_restart'].includes(ack.code))) throw new Error('startup_ack_invalid');
        if (ack?.code === 'requires_host_restart') { durable(path.join(directory, 'result.json'), { outcome: 'blocked', code: 'requires_host_restart' }); return status({ operationId: value.operationId }); }
        if (current.length === 1 && ack?.code === 'menu_executed' && freshPanel(attempt)) {
          durable(path.join(directory, 'result.json'), { outcome: 'ready', code: 'authenticated_panel', host: current[0], peer: freshPanel(attempt) }); return status({ operationId: value.operationId });
        }
        await wait(Math.min(500, Math.max(1, deadline - now())));
      }
      return status({ operationId: value.operationId });
    } catch (e) {
      if (recorded && !dispatchEntered) { try { rejectPrepared(directory, read(path.join(directory, 'attempt.json'))); return status({ operationId: value.operationId }); } catch {} }
      return { operationId: value.operationId, outcome: dispatchEntered ? 'unknown' : 'blocked', code: dispatchEntered ? 'startup_outcome_unresolved' : /^startup_/.test(e.message) ? e.message : 'startup_unavailable', nativeVerified: false };
    } finally { busy = false; activeOperationId = null; }
  }
  return { ensure, status, observe, activity };
}
module.exports = { createAePanelStartup, validateStartupInput: input, collisionPreflight, ownsRegistryBootstrap };
