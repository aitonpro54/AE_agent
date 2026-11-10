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
const { validateTimeline, verifyMediaFacts } = require('./aerender-profile');
const { createHistory, windowsProbe, processIdentity, rendererRows, nativeRenderers,
  validProcess, sameProcess, matchesProcess, renderArgs, jobHash } = require('./render-job-history');

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
  const { active, requestStage, cancelledStage, publishStage, file, get, bound, scoped, observed,
    verifyDispatch, ownsActive, workerArgs, workerFor, logFor, engineFor, readProcess, observe,
    settled, assertQuiescent, cancelProof, cancellation, noSlotFor, strandedSlot } =
    createHistory({ root, identity, listRenderers, workerEntry, record, present,
      checkDirectory: directory => plainPath(directory, true) });
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
  const assertAccepting = () => {
    if (path.basename(root) === 'render-jobs-v1') {
      requireFact(!present(path.join(path.dirname(root), 'runtime-maintenance.json')) &&
        !present(path.join(path.dirname(root), 'runtime-start-over.json')), 'render_job_maintenance');
    }
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
      assertCurrent(); assertAccepting();
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
        assertCurrent(); assertAccepting();
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
  requireFact(path.basename(root).toLowerCase() !== 'render-jobs-v1', 'render_job_owner_required');
  const jobs = createJobs(root, undefined, undefined, workerEntry);
  const value = command === 'prepare' ? jobs.prepare(record(path.resolve(arg))) : await jobs[command](arg);
  console.log(JSON.stringify(value));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createJobs, main };
