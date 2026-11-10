'use strict';

// Read-only R1 record and process bindings remain available even when the
// installation does not supply the render executor.
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{64}$/;
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function requireFact(condition, code) { if (!condition) throw Error(code); }

function windowsProbe(command, failure) {
  const windows = process.env.SystemRoot || 'C:\\Windows';
  const ps = path.join(windows, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => path.isAbsolute(process.env[key] || '')).map(key => [key, process.env[key]]));
  // The installed owner clears inherited user fields. Windows PowerShell still
  // needs the current token's native home directory, even with -NoProfile.
  env.USERPROFILE = os.userInfo().homedir;
  env.SYSTEMDRIVE = path.parse(windows).root.slice(0, 2);
  env.HOMEDRIVE = path.parse(env.USERPROFILE).root.slice(0, 2);
  env.HOMEPATH = env.USERPROFILE.slice(2);
  try {
    return execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + command], { encoding: 'utf8', windowsHide: true, timeout: 6000, maxBuffer: 32768, env }).trim();
  } catch { throw Error(failure); }
}

function processRows(filter) {
  const command = `$p=Get-CimInstance Win32_Process -Filter "${filter}" -ErrorAction Stop; if($p){$p | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,@{N='Birth';E={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress}`;
  const bytes = windowsProbe(command, 'aerender_process_probe_unavailable');
  if (!bytes) return [];
  return [JSON.parse(bytes)].flat().map(row => ({
    pid: row.ProcessId, parent: row.ParentProcessId, exe: row.ExecutablePath, commandLine: row.CommandLine, birth: row.Birth
  }));
}

function processIdentity(pid) {
  requireFact(Number.isSafeInteger(pid) && pid > 0, 'aerender_process_id');
  const rows = processRows('ProcessId=' + pid);
  requireFact(rows.length <= 1, 'aerender_process_identity');
  const [row] = rows;
  if (!row) return null;
  requireFact(row.pid === pid && validProcess(row), 'aerender_process_identity');
  return row;
}

function validProcess(row) {
  return row && Number.isSafeInteger(row.pid) && row.pid > 0 &&
    Number.isSafeInteger(row.parent) && row.parent >= 0 &&
    typeof row.exe === 'string' && path.isAbsolute(row.exe) &&
    typeof row.commandLine === 'string' && row.commandLine.length > 0 &&
    typeof row.birth === 'string' && Number.isFinite(Date.parse(row.birth));
}

function sameProcess(a, b) {
  return a.pid === b.pid && a.parent === b.parent && samePath(a.exe, b.exe) &&
    a.birth === b.birth && a.commandLine === b.commandLine;
}

function matchesProcess(expected, identity) {
  if (!expected) return false;
  const actual = identity(expected.pid);
  if (actual == null) return false;
  requireFact(validProcess(actual) && actual.pid === expected.pid, 'aerender_process_identity');
  if (actual.birth !== expected.birth) return false; // The original incarnation is gone.
  requireFact(sameProcess(actual, expected), 'aerender_process_identity');
  return true;
}

// These spawned argv values contain no literal quotes or trailing quoted backslashes.
function commandArgs(row) {
  return (row.commandLine.match(/"[^"]*"|[^\s"]+/g) || []).slice(1).map(arg => arg.replace(/^"|"$/g, ''));
}

function argsMatch(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((arg, index) => arg === expected[index]);
}

function childOf(child, parent) {
  return validProcess(child) && child.parent === parent.pid && child.pid !== parent.pid &&
    Date.parse(child.birth) >= Date.parse(parent.birth);
}

function adobeArgs(command) {
  const prefix = "d -noui -m -s if (typeof gAECommandLineRenderer == 'undefined' ) { app.exitCode = 13;} else { gAECommandLineRenderer.Render(";
  const suffix = '); }';
  if (!command.startsWith(prefix) || !command.endsWith(suffix)) return null;
  const wrapped = JSON.parse('[' + command.slice(prefix.length,-suffix.length) + ']');
  if (!wrapped.every(value => typeof value === 'string' && value.length >= 2 && value.startsWith("'") && value.endsWith("'"))) return null;
  const [flag,port,...args] = wrapped.map(value => value.slice(1,-1));
  return flag === '-port' && /^(?:\[::1\]|127\.0\.0\.1):[1-9]\d{0,4}$/.test(port) ? args : null;
}

function rendererFor(row, job, engine, exit) {
  if (!childOf(row, engine) || Date.parse(row.birth) > Date.parse(exit.observedAt) ||
      !/^AfterFX\.(com|exe)$/i.test(path.basename(row.exe)) ||
      !samePath(path.dirname(row.exe), path.dirname(job.spec.engine.path))) return false;
  return argsMatch(adobeArgs(row.commandLine),commandArgs(engine));
}

function rendererRows() {
  return processRows("Name='AfterFX.com' OR Name='AfterFX.exe'");
}

function nativeRenderers(job, engine, exit, list) {
  const matched = list().filter(row => {
    if (row.parent === engine.pid) return true;
    if (typeof row.commandLine !== 'string') return false;
    const command = row.commandLine.toLowerCase();
    return [job.working, job.partial].some(file =>
      command.includes(file.toLowerCase()) || command.includes(file.toLowerCase().replace(/\\/g, '\\\\')));
  });
  requireFact(matched.length <= 1 && matched.every(row => rendererFor(row, job, engine, exit)), 'aerender_native_identity');
  return matched;
}

function renderArgs(job, log) {
  return ['-project',job.working,'-rqindex',String(job.spec.target.queueIndex),'-output',job.partial,
    ...frameArgs(job.spec.target),'-close','DO_NOT_SAVE_CHANGES','-v','ERRORS_AND_PROGRESS','-log',log];
}

// The target has passed validateTimeline. aerender's last frame is inclusive.
function frameArgs(target) {
  if (target.timeline === undefined) return [];
  const startFrame = target.range?.startFrame ?? target.timeline.startFrame;
  const endFrameExclusive = target.range?.endFrameExclusive ?? target.timeline.startFrame + target.timeline.frameCount;
  return ['-s', String(startFrame), '-e', String(endFrameExclusive - 1)];
}

function jobHash(job) {
  return createHash('sha256').update(JSON.stringify(job)).digest('hex');
}

function createHistory({ root, identity, listRenderers, workerEntry, record, present, checkDirectory }) {
  const active = path.join(root, 'active.json');
  const requestStage = 'cancel-request.json', cancelledStage = 'cancelled.json', publishStage = 'publish-intent.json';
  const file = (id, name) => {
    requireFact(uuid.test(id), 'aerender_job_id');
    return path.join(root, id, name);
  };
  const get = id => {
    const filename = file(id, 'prepared.json');
    if (present(path.dirname(filename))) checkDirectory(path.dirname(filename));
    const job = record(filename);
    requireFact(job?.id === id, 'aerender_job_missing');
    return job;
  };
  const bound = (job, stage) => {
    const filename = file(job.id, stage);
    const entry = record(filename);
    if (entry !== null || present(filename)) requireFact(entry?.id === job.id && entry.jobHash === jobHash(job), 'aerender_job_binding');
    return entry;
  };
  const scoped = (job, dispatch, stage, data) => ({
    ...data, id:job.id, jobHash:dispatch.jobHash, dispatchHash:jobHash(dispatch), stage
  });
  const observed = (job, dispatch, stage) => {
    const entry = bound(job,stage);
    if (entry) requireFact(entry.dispatchHash === jobHash(dispatch) && entry.stage === stage, 'aerender_dispatch_binding');
    return entry;
  };
  const verifyDispatch = dispatch => {
    requireFact(dispatch?.observationVersion === 1 && validProcess(dispatch.starter) &&
      (dispatch.workerEntry === undefined || typeof dispatch.workerEntry === 'string' &&
        path.isAbsolute(dispatch.workerEntry) && path.basename(dispatch.workerEntry) === 'aerender-jobs.js') &&
      Number.isFinite(Date.parse(dispatch.createdAt)) && Date.parse(dispatch.createdAt) >= Date.parse(dispatch.starter.birth),
    'aerender_dispatch_binding');
  };
  const ownsActive = (job, dispatch) => {
    const held = record(active);
    return held?.id === job.id && (dispatch.observationVersion === undefined ||
      held.jobHash === dispatch.jobHash && held.dispatchHash === jobHash(dispatch));
  };
  const workerArgs = (id, entry = workerEntry) => [entry,'worker',root,id];
  const workerFor = (row, job, dispatch) => childOf(row, dispatch.starter) &&
    samePath(row.exe, dispatch.starter.exe) && argsMatch(commandArgs(row), workerArgs(job.id, dispatch.workerEntry)) &&
    Date.parse(row.birth) >= Date.parse(dispatch.createdAt);
  const logFor = job => file(job.id,'aerender.log');
  const engineFor = (row, job, worker, intent) => childOf(row, worker) && samePath(row.exe, job.spec.engine.path) &&
    argsMatch(commandArgs(row), intent.args) && Date.parse(row.birth) >= Date.parse(intent.createdAt);
  const readProcess = (job, dispatch, stage, validate) => {
    const entry = observed(job,dispatch,stage);
    if (entry) requireFact(validate(entry.process,entry), 'aerender_process_identity');
    return entry?.process;
  };
  const observe = (job, dispatch, requireSlot = true) => {
    verifyDispatch(dispatch);
    if (requireSlot) requireFact(ownsActive(job,dispatch), 'aerender_dispatch_binding');
    const worker = readProcess(job,dispatch,'worker.json', row => workerFor(row,job,dispatch));
    const launcher = readProcess(job,dispatch,'launcher.json', row => workerFor(row,job,dispatch));
    requireFact(!worker || !launcher || sameProcess(worker,launcher), 'aerender_worker_identity');
    const intent = observed(job,dispatch,'start-intent.json');
    if (intent) requireFact(worker && intent.workerHash === jobHash(worker) && intent.executable === job.spec.engine.path &&
      argsMatch(intent.args,renderArgs(job,logFor(job))) && Date.parse(intent.createdAt) >= Date.parse(worker.birth),
    'aerender_dispatch_binding');
    const engine = readProcess(job,dispatch,'engine.json', row => worker && intent && engineFor(row,job,worker,intent));
    const exit = observed(job,dispatch,'engine-exit.json');
    if (exit) requireFact(engine && exit.engineHash === jobHash(engine) &&
      Date.parse(exit.observedAt) >= Date.parse(engine.birth) &&
      (Number.isInteger(exit.code) && (exit.signal === null || typeof exit.signal === 'string') ||
        exit.code === null && typeof exit.signal === 'string' || typeof exit.error === 'string'), 'aerender_dispatch_binding');
    const renderer = readProcess(job,dispatch,'renderer.json', (row,entry) =>
      engine && exit?.code === 0 && entry.engineHash === jobHash(engine) && rendererFor(row,job,engine,exit));
    return { worker, launcher, renderer, intent, engine, exit, workerAlive:matchesProcess(worker || launcher,identity),
      renderAlive: [engine,renderer].map(row => matchesProcess(row,identity)).some(Boolean) };
  };
  const settled = (job, terminal) => {
    if (terminal) requireFact(['verified','failed','unknown'].includes(terminal.state), 'aerender_job_binding');
    if (['verified','failed'].includes(terminal?.state)) return terminal;
    const reconciled = bound(job,'reconciled.json');
    if (reconciled) requireFact(reconciled.state === 'verified', 'aerender_job_binding');
    return reconciled;
  };
  const assertQuiescent = (job, dispatch, code, requireSuccess = true) => {
    let state;
    try {
      state = observe(job,dispatch);
      requireFact(state.exit && (requireSuccess ? state.exit.code === 0 && state.exit.signal === null :
        Number.isInteger(state.exit.code) || typeof state.exit.signal === 'string') && !state.workerAlive && !state.renderAlive &&
        nativeRenderers(job,state.engine,state.exit,listRenderers).length === 0, code);
    } catch { throw Error(code); }
  };
  const cancelProof = job => {
    const terminal = bound(job,'terminal.json');
    return settled(job,terminal) || terminal;
  };
  const cancellation = (job, dispatch) => {
    const receipt = bound(job,cancelledStage), request = bound(job,requestStage);
    if (!request && !receipt) return {};
    const original = dispatch === undefined ? bound(job,'dispatch.json') : dispatch;
    const dispatchHash = original ? jobHash(original) : null;
    if (request) requireFact(original && request.dispatchHash === dispatchHash && request.stage === requestStage &&
      request.state === 'cancel_pending' && typeof request.createdAt === 'string' && Number.isFinite(Date.parse(request.createdAt)),
    'aerender_cancel_binding');
    if (receipt) {
      const proof = original && cancelProof(job);
      requireFact(receipt.state === 'cancelled' && typeof receipt.createdAt === 'string' &&
        Number.isFinite(Date.parse(receipt.createdAt)) && Boolean(original) === Boolean(request) &&
        (!original || proof) && receipt.dispatchHash === dispatchHash &&
        receipt.requestHash === (request ? jobHash(request) : null) &&
        receipt.proofHash === (proof ? jobHash(proof) : null) &&
        (receipt.slotHash === null || !original && typeof receipt.slotHash === 'string' && sha.test(receipt.slotHash)),
      'aerender_cancel_binding');
    }
    return { request, receipt };
  };
  const noSlotFor = (id, held) => held ? uuid.test(held.id) && held.id !== id : !present(active);
  const strandedSlot = job => {
    const held = record(active);
    if (noSlotFor(job.id,held)) return null;
    // start writes this slot before it can dispatch a worker.
    requireFact(held?.id === job.id && held.jobHash === jobHash(job) &&
      typeof held.dispatchHash === 'string' && sha.test(held.dispatchHash) &&
      !present(job.partial) && !['launcher.json','worker.json','start-intent.json','engine.json',
        'engine-exit.json','renderer.json','terminal.json','reconciled.json'].some(stage => present(file(job.id,stage))),
    'aerender_cancel_unsettled');
    return jobHash(held);
  };
  return { active, requestStage, cancelledStage, publishStage, file, get, bound, scoped, observed,
    verifyDispatch, ownsActive, workerArgs, workerFor, logFor, engineFor, readProcess, observe,
    settled, assertQuiescent, cancelProof, cancellation, noSlotFor, strandedSlot };
}

module.exports = { createHistory, frameArgs, windowsProbe, processRows, processIdentity, rendererRows,
  nativeRenderers, validProcess, sameProcess, matchesProcess, renderArgs, jobHash };
