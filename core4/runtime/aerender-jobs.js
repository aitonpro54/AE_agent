'use strict';

// Local operator for already-prepared AE render queues. The queue witness is
// supplied by the operator after inspecting the saved AEP.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createServer } = require('node:net');
const { plainPath, readAep, samePath } = require('./project-save-proof');
const { validateTimeline, frameArgs, verifyMediaFacts } = require('./aerender-profile');

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{64}$/;
const aepBudget = 96n * 1024n * 1024n; // Matches project-save-proof.

function requireFact(condition, code) {
  if (!condition) throw Error(code);
}

function present(file) {
  return fs.lstatSync(file, { throwIfNoEntry: false });
}

function writeOnce(file, data) {
  const stage = file + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(stage, 'wx');
  try {
    try { fs.writeFileSync(fd, JSON.stringify(data) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.linkSync(stage, file);
  } finally { fs.unlinkSync(stage); }
}

function record(file) {
  if (!present(file)) return null;
  const { resolved, info } = plainPath(file);
  requireFact(info.size <= 1024n * 1024n, 'aerender_record_budget');
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function fingerprint(file, allowLink = false) {
  const info = fs.lstatSync(file, { bigint: true });
  requireFact(info.isFile() && !info.isSymbolicLink() &&
    (allowLink || info.nlink === 1n) && samePath(fs.realpathSync.native(file), file), 'aerender_plain_file');
  const fd = fs.openSync(file, 'r');
  const compare = current => {
    requireFact(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => current[key] === info[key]), 'aerender_file_changed');
  };
  try {
    compare(fs.fstatSync(fd, { bigint: true }));
    const hash = createHash('sha256'), buf = Buffer.allocUnsafe(1024 * 1024);
    for (let count; (count = fs.readSync(fd, buf, 0, buf.length, null)) !== 0;) hash.update(buf.subarray(0, count));
    compare(fs.fstatSync(fd, { bigint: true }));
    compare(fs.lstatSync(file, { bigint: true }));
    return { sha256: hash.digest('hex'), bytes: Number(info.size), dev: String(info.dev), ino: String(info.ino) };
  } finally { fs.closeSync(fd); }
}

function projectDigest(file, copyFd) {
  try { return readAep(file, undefined, copyFd).digest; }
  catch (error) {
    if (error.code === 'save_disk_proof_unavailable' || error.code === 'ENOENT') throw Error('aerender_input_changed');
    throw error;
  }
}

function verifyInput(input, filename, project = false) {
  requireFact(input && sha.test(input.sha256) && typeof input.path === 'string' &&
    path.isAbsolute(input.path) && samePath(path.resolve(input.path), input.path), 'aerender_input');
  if (filename) requireFact(filename.test(path.basename(input.path)), 'aerender_input_kind');
  const { info } = plainPath(input.path);
  requireFact(info.size > 0n && (!project || info.size <= aepBudget), 'aerender_input_budget');
  const digest = project ? projectDigest(input.path) : fingerprint(input.path).sha256;
  requireFact(digest === input.sha256, 'aerender_input_changed');
}

function validateSpec(spec) {
  requireFact(spec && typeof spec === 'object', 'aerender_spec');
  const t = spec.target;
  requireFact(t && typeof t.compName === 'string' && t.compName.length > 0 &&
    t.compName.length <= 128 && !/[\x00-\x1f]/.test(t.compName) &&
    [t.compId, t.queueIndex, t.frames, t.width, t.height].every(n => Number.isSafeInteger(n) && n > 0) &&
    typeof t.fps === 'string' && /^[1-9]\d{0,6}\/[1-9]\d{0,6}$/.test(t.fps) &&
    typeof t.audio === 'boolean', 'aerender_target');
  requireFact(Array.isArray(spec.queue) && spec.queue.length > 0 && spec.queue.length <= 64 &&
    spec.queue.every((row, index) => row.index === index + 1 && typeof row.name === 'string' && typeof row.status === 'string'), 'aerender_queue_witness');
  const ready = spec.queue.filter(row => row.status === 'Queued');
  requireFact(ready.length === 1 && ready[0].index === t.queueIndex &&
    ready[0].name === t.compName && ready[0].compId === t.compId &&
    ready[0].format === 'H.264', 'aerender_queue_witness');
  validateTimeline(t, ready[0]);
  requireFact(Array.isArray(spec.media) && spec.media.length <= 512, 'aerender_media_witness');
  requireFact(typeof spec.output === 'string' && path.isAbsolute(spec.output) &&
    samePath(path.resolve(spec.output), spec.output) && /^[\w.-]+\.mp4$/i.test(path.basename(spec.output)) &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(path.basename(spec.output)), 'aerender_output_path');
  plainPath(path.dirname(spec.output), true);
}

function checkInputs(spec, working) {
  verifyInput(spec.project, /\.aep$/i, true);
  if (working) verifyInput({ path: working, sha256: spec.project.sha256 }, /\.aep$/i, true);
  for (const item of spec.media) verifyInput(item);
  verifyInput(spec.engine, /^aerender\.exe$/i);
  verifyInput(spec.ffprobe, /^ffprobe\.exe$/i);
  verifyInput(spec.ffmpeg, /^ffmpeg\.exe$/i);
}

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

function adobeEnvironment(executable) {
  const failure = 'aerender_native_environment';
  const folders = {SystemRoot:'Windows',APPDATA:'ApplicationData',LOCALAPPDATA:'LocalApplicationData',
    ProgramData:'CommonApplicationData',ProgramFiles:'ProgramFiles',CommonProgramFiles:'CommonProgramFiles',
    'ProgramFiles(x86)':'ProgramFilesX86','CommonProgramFiles(x86)':'CommonProgramFilesX86'};
  const properties = Object.entries(folders).map(([key,folder]) => `'${key}'=[Environment]::GetFolderPath('${folder}')`);
  const known = JSON.parse(windowsProbe('@{' + properties.join(';') + '} | ConvertTo-Json -Compress', failure));
  const user = os.userInfo(), homeRoot = path.parse(user.homedir).root;
  const windows = known.SystemRoot, system = path.join(windows, 'System32');
  requireFact([windows, known.APPDATA, known.LOCALAPPDATA, known.ProgramData, user.homedir].every(value =>
    typeof value === 'string' && path.isAbsolute(value) && !/[;\0]/.test(value)), failure);
  const env = Object.fromEntries(Object.keys(folders).filter(key => known[key] && path.isAbsolute(known[key])).map(key => [key, known[key]]));
  const temp = path.isAbsolute(process.env.TEMP || '') ? process.env.TEMP : path.join(known.LOCALAPPDATA, 'Temp');
  // Adobe starts its own AfterFX child. Give it the native shell and user folders
  // without passing the controller's PATH, credentials or developer variables.
  return {...env, WINDIR:windows, SYSTEMDRIVE:path.parse(windows).root.slice(0,2), ComSpec:path.join(system,'cmd.exe'),
    PATH:[path.dirname(executable),system,windows].join(path.delimiter), PATHEXT:'.COM;.EXE;.BAT;.CMD',
    USERPROFILE:user.homedir, USERNAME:user.username, HOMEDRIVE:homeRoot.slice(0,2), HOMEPATH:user.homedir.slice(2),
    TEMP:temp, TMP:temp, NODE_V8_COVERAGE:''};
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

async function withLock(root, action) {
  const token = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 24);
  const server = createServer(socket => socket.destroy());
  const endpoint = '\\\\.\\pipe\\ae-core4-aerender-' + token;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, resolve);
  });
  try { return await action(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function verifyMedia(job) {
  const target = job.spec.target;
  const media = JSON.parse(execFileSync(job.spec.ffprobe.path, ['-v','error','-count_frames','-show_streams','-show_format','-of','json',job.partial],
    { encoding:'utf8', windowsHide:true, maxBuffer:1024 * 1024 }));
  const facts = verifyMediaFacts(target,media);
  execFileSync(job.spec.ffmpeg.path, ['-nostdin','-v','error','-xerror','-i',job.partial,'-map','0:v','-map','0:a?','-f','null','-'],
    { windowsHide:true, maxBuffer:1024 * 1024 });
  return facts;
}

function verifyLog(job, log) {
  const fd = fs.openSync(log, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(Math.min(32768, size)), tail = Buffer.alloc(head.length);
    fs.readSync(fd, head, 0, head.length, 0);
    fs.readSync(fd, tail, 0, tail.length, size - tail.length);
    const header = head.toString(), name = job.spec.target.compName;
    const destination = header.match(/^PROGRESS:\s+Output To: (.+)$/m)?.[1].trim();
    requireFact(destination && samePath(path.normalize(destination), job.partial) &&
      header.includes('Starting composition “' + name + '”') &&
      tail.toString().includes('Finished composition “' + name + '”') &&
      header.split('Starting composition').length === 2, 'aerender_completion_log');
  } finally { fs.closeSync(fd); }
}

function verifyCompleted(job, log) {
  verifyLog(job,log);
  checkInputs(job.spec,job.working);
  const before = fingerprint(job.partial);
  const media = verifyMedia(job);
  const after = fingerprint(job.partial);
  requireFact(before.sha256 === after.sha256 && before.ino === after.ino && before.dev === after.dev, 'aerender_media_changed');
  checkInputs(job.spec,job.working);
  return { id:job.id, state:'verified', output:after, media };
}

function createJobs(root, identity = processIdentity, listRenderers = rendererRows, workerEntry = __filename) {
  requireFact(path.isAbsolute(root) && samePath(path.resolve(root),root), 'aerender_root');
  plainPath(path.dirname(root),true);
  try { fs.mkdirSync(root); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  plainPath(root, true);
  const active = path.join(root, 'active.json');
  const requestStage = 'cancel-request.json', cancelledStage = 'cancelled.json', publishStage = 'publish-intent.json';
  const file = (id, name) => {
    requireFact(uuid.test(id), 'aerender_job_id');
    return path.join(root, id, name);
  };
  const get = id => {
    const filename = file(id, 'prepared.json');
    if (present(path.dirname(filename))) plainPath(path.dirname(filename), true);
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
  const observe = (job, dispatch) => {
    verifyDispatch(dispatch);
    requireFact(ownsActive(job,dispatch), 'aerender_dispatch_binding');
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
    return { engine, exit, workerAlive:matchesProcess(worker || launcher,identity),
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
  const drainProof = (job, dispatch) => {
    try {
      if (!ownsActive(job,dispatch)) return null;
      const proof = cancelProof(job);
      if (!proof) return null;
      if (proof.state === 'failed') {
        if (present(file(job.id,'start-intent.json'))) return null;
        if (dispatch.observationVersion !== undefined) {
          const state = observe(job,dispatch);
          if (state.workerAlive || state.renderAlive) return null;
        }
      } else {
        // An unknown media verdict can coexist with proof that execution has ended.
        assertQuiescent(job,dispatch,'aerender_cancel_unsettled',false);
      }
      return proof;
    } catch { return null; }
  };
  const releaseCancelled = (job, dispatch, receipt) => {
    if (dispatch) {
      if (ownsActive(job,dispatch)) fs.unlinkSync(active);
    } else if (receipt.slotHash) {
      const held = record(active);
      if (held?.id === job.id && jobHash(held) === receipt.slotHash) fs.unlinkSync(active);
    }
  };
  const release = id => {
    const held = record(active);
    if (held?.id === id) fs.unlinkSync(active);
  };
  return {
    preparation(id) {
      const prepared = file(id, 'prepared.json'), directory = path.dirname(prepared);
      if (!present(directory)) return null;
      plainPath(directory, true);
      return { job:record(prepared), intent:record(file(id, 'prepare-intent.json')) };
    },
    prepare(spec, { id = randomUUID(), authorization, assertCurrent = () => {} } = {}) {
      validateSpec(spec);
      checkInputs(spec);
      requireFact(!present(spec.output), 'aerender_output_exists');
      const prepared = file(id, 'prepared.json');
      const working = path.join(path.dirname(spec.project.path), 'core4-render-' + id + '.aep');
      const partial = path.join(path.dirname(spec.output), 'core4-render-' + id + '.partial.mp4');
      requireFact(!samePath(spec.project.path, working) && !samePath(spec.output, partial), 'aerender_path_collision');
      assertCurrent();
      if (authorization) {
        fs.mkdirSync(path.dirname(prepared));
        writeOnce(file(id,'prepare-intent.json'),{id,authorization});
      }
      // Keep the exclusive destination handle here so failure cleanup can prove ownership.
      const fd = fs.openSync(working, 'wx', 0o600);
      let owned;
      try {
        try {
          owned = fs.fstatSync(fd, { bigint: true });
          requireFact(projectDigest(spec.project.path, fd) === spec.project.sha256, 'aerender_input_changed');
          fs.fsyncSync(fd);
        } finally { fs.closeSync(fd); }
        verifyInput({ path: working, sha256: spec.project.sha256 }, /\.aep$/i, true);
        if (!authorization) fs.mkdirSync(path.dirname(prepared));
        const job = { id, spec, working, partial, createdAt: new Date().toISOString(), ...(authorization && {authorization}) };
        writeOnce(prepared, job);
        return { id, state:'prepared' };
      } catch (error) {
        if (owned) {
          try {
            const { info } = plainPath(working);
            // Receipt publication may already have linked the file before stage cleanup failed.
            if (info.dev === owned.dev && info.ino === owned.ino &&
                info.birthtimeNs === owned.birthtimeNs && !present(prepared)) fs.unlinkSync(working);
          } catch { /* Preserve the failure and leave unproven paths alone. */ }
        }
        throw error;
      }
    },
    start(id, assertCurrent = () => {}) {
      return withLock(root, async () => {
        const job = get(id), dispatchPath = file(id, 'dispatch.json');
        requireFact(!present(file(id,requestStage)) && !present(file(id,cancelledStage)), 'aerender_cancelled');
        requireFact(!present(dispatchPath) && !present(active), 'aerender_active_or_already_dispatched');
        requireFact(!present(job.partial) && !present(job.spec.output), 'aerender_output_exists');
        checkInputs(job.spec, job.working);
        const starter = identity(process.pid);
        requireFact(validProcess(starter) && starter.pid === process.pid && samePath(starter.exe,process.execPath), 'aerender_worker_identity');
        const dispatch = { id, jobHash:jobHash(job), createdAt:new Date().toISOString(), observationVersion:1, starter,
          ...(job.authorization && {workerEntry}) };
        verifyDispatch(dispatch);
        assertCurrent();
        writeOnce(active, { id, jobHash:dispatch.jobHash, dispatchHash:jobHash(dispatch) });
        writeOnce(dispatchPath, dispatch);
        const child = spawn(process.execPath, workerArgs(id), { cwd:path.dirname(dispatchPath), detached:true, windowsHide:true, stdio:'ignore' });
        await new Promise((resolve, reject) => { child.once('spawn',resolve); child.once('error',reject); });
        try {
          const launched = identity(child.pid);
          if (workerFor(launched,job,dispatch)) writeOnce(file(id,'launcher.json'),scoped(job,dispatch,'launcher.json',{process:launched}));
        } catch { /* Worker records its own identity before touching AE. */ }
        child.unref();
        return { id, state:'submitted' };
      });
    },
    async worker(id) {
      const job = get(id);
      const dispatch = bound(job,'dispatch.json');
      verifyDispatch(dispatch);
      requireFact(ownsActive(job,dispatch), 'aerender_dispatch_binding');
      const self = identity(process.pid);
      requireFact(workerFor(self,job,dispatch) && self.pid === process.pid && samePath(self.exe,process.execPath), 'aerender_worker_identity');
      const readLauncher = () => readProcess(job,dispatch,'launcher.json', row => workerFor(row,job,dispatch));
      let launched = readLauncher();
      const starterAlive = !launched && matchesProcess(dispatch.starter,identity);
      if (!launched && !starterAlive) launched = readLauncher(); // start may have pinned this child just before exiting.
      requireFact(launched ? sameProcess(launched,self) : starterAlive, 'aerender_worker_identity');
      const write = (stage,data) => writeOnce(file(id,stage),scoped(job,dispatch,stage,data));
      write('worker.json', {process:self});
      let terminal;
      try {
        checkInputs(job.spec, job.working);
        plainPath(path.dirname(job.partial),true);
        requireFact(!present(job.partial) && !present(job.spec.output), 'aerender_output_exists');
        const log = logFor(job), args = renderArgs(job,log);
        const env = adobeEnvironment(job.spec.engine.path);
        const intent = { executable:job.spec.engine.path, args, createdAt:new Date().toISOString(), workerHash:jobHash(self) };
        write('start-intent.json', intent);
        const fd = fs.openSync(file(id,'console.log'),'wx');
        let result, engine;
        try {
          const child = spawn(job.spec.engine.path,args,{cwd:path.dirname(log),windowsHide:true,stdio:['pipe',fd,fd],env});
          result = new Promise(resolve => {
            child.once('close',(code,signal)=>resolve({code,signal}));
            child.once('error',error=>resolve({error:error.code||'spawn_error'}));
          });
          if (child.pid) {
            try {
              const candidate = identity(child.pid);
              requireFact(engineFor(candidate,job,self,intent) && candidate.pid === child.pid, 'aerender_engine_identity');
              write('engine.json', {process:candidate});
              engine = candidate;
            } catch (error) {
              write('engine-observation-error.json', {code:error.message});
            }
          }
        } finally { fs.closeSync(fd); }
        const outcome = await result;
        requireFact(engine, 'aerender_engine_identity');
        const exit = { ...outcome, engineHash:jobHash(engine), observedAt:new Date().toISOString() };
        write('engine-exit.json', exit);
        requireFact(exit.code === 0 && exit.signal === null, 'aerender_engine_failed');
        requireFact(!matchesProcess(engine,identity), 'aerender_engine_identity');
        const [renderer] = nativeRenderers(job,engine,exit,listRenderers);
        if (renderer) {
          write('renderer.json', {process:renderer,engineHash:jobHash(engine)});
          while (matchesProcess(renderer,identity)) await new Promise(resolve => setTimeout(resolve,3000));
        }
        requireFact(nativeRenderers(job,engine,exit,listRenderers).length === 0, 'aerender_native_identity');
        terminal = verifyCompleted(job,log);
        requireFact(nativeRenderers(job,engine,exit,listRenderers).length === 0, 'aerender_native_identity');
      } catch (error) {
        // AfterFX can outlive the CLI wrapper. An incomplete observation after
        // a spawn intent keeps the slot even when the wrapper returned zero.
        terminal = { id, state:present(file(id,'start-intent.json')) ? 'unknown' : 'failed',
          error: String(error.message).slice(0, 240) };
      }
      writeOnce(file(id,'terminal.json'),{ ...terminal, jobHash:jobHash(job) });
    },
    status(id) {
      const job = get(id);
      try {
        const published = bound(job,'published.json');
        const { request, receipt } = cancellation(job);
        if (request || receipt) {
          requireFact(!published && !present(file(id,publishStage)), 'aerender_cancel_binding');
          return { id, state:receipt ? 'cancelled' : 'cancel_pending' };
        }
        if (published) return published;
        if (job.authorization && present(file(id,publishStage))) return { id, state:'unknown' };
        const terminal = bound(job,'terminal.json');
        const end = settled(job,terminal);
        if (end) return end;
        const dispatch = bound(job,'dispatch.json');
        if (!dispatch && noSlotFor(id,record(active))) return { id, state:'prepared' };
        if (dispatch?.observationVersion === 1) {
          const state = observe(job,dispatch);
          if (state.renderAlive) return { id, state:'rendering' };
          if (state.workerAlive && !terminal) return { id, state:state.exit ? 'verifying' : 'starting' };
        }
        if (terminal?.state === 'unknown') return terminal;
      } catch { return { id, state:'unknown' }; }
      return { id, state:'unknown' };
    },
    reconcile(id, assertCurrent = () => {}) {
      return withLock(root, () => {
        const job = get(id), { request, receipt } = cancellation(job);
        if (request || receipt) requireFact(!present(file(id,'published.json')) && !present(file(id,publishStage)), 'aerender_cancel_binding');
        if (receipt) return { id, state:'cancelled' };
        const old = bound(job,'published.json') || settled(job,bound(job,'terminal.json'));
        if (old) return old;
        const dispatch = bound(job,'dispatch.json');
        assertQuiescent(job,dispatch,'aerender_reconcile_unsettled');
        assertCurrent();
        const result = { ...verifyCompleted(job,logFor(job)), jobHash:jobHash(job) };
        assertQuiescent(job,dispatch,'aerender_reconcile_unsettled');
        assertCurrent();
        writeOnce(file(id,'reconciled.json'),result);
        return result;
      });
    },
    cancel(id, assertCurrent = () => {}) {
      return withLock(root, () => {
        const job = get(id), dispatch = bound(job,'dispatch.json');
        const { request, receipt:previous } = cancellation(job,dispatch);
        let receipt = previous;
        requireFact(!present(file(id,'published.json')) && !present(file(id,publishStage)), 'aerender_cancel_publication_started');
        assertCurrent();
        const assertOutputVacant = () => requireFact(!present(job.spec.output), 'aerender_cancel_publication_started');
        if (!receipt) {
          assertOutputVacant();
          let intent = request, proof, slotHash = null;
          if (dispatch) {
            if (!intent) {
              intent = scoped(job,dispatch,requestStage,{state:'cancel_pending',createdAt:new Date().toISOString()});
              writeOnce(file(id,requestStage),intent);
            }
            proof = drainProof(job,dispatch);
            if (!proof) return { id, state:'cancel_pending' };
          } else {
            slotHash = strandedSlot(job);
          }
          assertOutputVacant();
          receipt = {
            id, jobHash:jobHash(job), state:'cancelled', createdAt:new Date().toISOString(),
            dispatchHash:dispatch ? jobHash(dispatch) : null, requestHash:intent ? jobHash(intent) : null,
            proofHash:proof ? jobHash(proof) : null, slotHash
          };
          writeOnce(file(id,cancelledStage),receipt);
        }
        releaseCancelled(job,dispatch,receipt);
        return { id, state:'cancelled' };
      });
    },
    finalize(id, assertCurrent = () => {}) {
      return withLock(root, () => {
        const job = get(id), publishedPath = file(id,'published.json');
        const { request, receipt } = cancellation(job);
        requireFact(!request && !receipt, 'aerender_cancelled');
        assertCurrent();
        const published = bound(job,'published.json');
        if (published) {
          const output = fingerprint(job.spec.output,true);
          requireFact(output.sha256 === published.sha256, 'aerender_published_changed');
          removePublishedAlias(job,output);
          release(id);
          return published;
        }
        const end = settled(job,bound(job,'terminal.json')), dispatch = bound(job,'dispatch.json');
        requireFact(dispatch && ownsActive(job,dispatch) &&
          end && end.id === id && ['verified','failed'].includes(end.state), 'aerender_unsettled');
        if (end.state === 'failed') {
          requireFact(!present(file(id,'start-intent.json')) && !present(file(id,publishStage)), 'aerender_unsettled');
          release(id); return end;
        }
        if (dispatch.observationVersion !== undefined) assertQuiescent(job,dispatch,'aerender_unsettled');
        checkInputs(job.spec,job.working);
        plainPath(path.dirname(job.spec.output),true);
        const partial = fingerprint(job.partial,true);
        requireFact(sameFingerprint(partial,end.output), 'aerender_partial_changed');
        const readAlias = () => {
          const output = fingerprint(job.spec.output,true);
          requireFact(sameFingerprint(output,partial), 'aerender_publication_conflict');
          return output;
        };
        const intent = observed(job,dispatch,publishStage);
        if (intent) requireFact(intent.path === job.spec.output && intent.proofHash === jobHash(end) &&
          sameFingerprint(partial,intent.output), 'aerender_publication_conflict');
        else {
          if (present(job.spec.output)) readAlias();
          writeOnce(file(id,publishStage),scoped(job,dispatch,publishStage,{
            path:job.spec.output, proofHash:jobHash(end), output:partial
          }));
        }
        try { fs.linkSync(job.partial,job.spec.output); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        const output = readAlias();
        const result = { id, jobHash:jobHash(job), state:'published', path:job.spec.output, sha256:output.sha256, bytes:output.bytes, media:end.media };
        writeOnce(publishedPath,result);
        removePublishedAlias(job,output);
        release(id);
        return result;
      });
    }
  };
}

function sameFingerprint(actual, expected) {
  return expected && actual.sha256 === expected.sha256 && actual.bytes === expected.bytes &&
    actual.dev === expected.dev && actual.ino === expected.ino;
}

function jobHash(job) {
  return createHash('sha256').update(JSON.stringify(job)).digest('hex');
}

function removePublishedAlias(job, output) {
  if (!present(job.partial)) return;
  const current = fingerprint(job.partial,true);
  requireFact(current.ino === output.ino && current.dev === output.dev && current.sha256 === output.sha256, 'aerender_partial_changed');
  fs.unlinkSync(job.partial);
}

async function main(workerEntry = __filename) {
  requireFact(process.platform === 'win32', 'aerender_windows_required');
  const args = process.argv.slice(2);
  let root;
  if (args[0] === '--state-dir') {
    requireFact(args.length >= 4 && path.isAbsolute(args[1]), 'aerender_root');
    root = path.resolve(args[1]);
    args.splice(0,2);
  }
  const [command, arg, workerId, ...rest] = args;
  if (command === 'worker') {
    requireFact(!root && arg && workerId && !rest.length, 'aerender_usage');
    await createJobs(arg, undefined, undefined, workerEntry).worker(workerId);
    return;
  }
  requireFact(['prepare','start','status','reconcile','finalize','cancel'].includes(command) && arg && !workerId, 'aerender_usage');
  if (!root) {
    requireFact(process.env.LOCALAPPDATA, 'aerender_windows_required');
    const installation = fs.realpathSync.native(path.join(process.env.LOCALAPPDATA,'AEAgentCore4'));
    root = path.join(installation,'aerender-jobs-v1');
  }
  const jobs = createJobs(root, undefined, undefined, workerEntry);
  const value = command === 'prepare' ? jobs.prepare(record(path.resolve(arg))) : await jobs[command](arg);
  console.log(JSON.stringify(value));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createJobs, main };
