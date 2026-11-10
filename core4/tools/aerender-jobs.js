'use strict';

// Local operator for already-prepared AE render queues. The queue witness is
// supplied by the operator after inspecting the saved AEP.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createServer } = require('node:net');
const { plainPath, readAep, samePath } = require('../runtime/project-save-proof');

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
    ready[0].frames === t.frames && ready[0].format === 'H.264', 'aerender_queue_witness');
  requireFact(Array.isArray(spec.media) && spec.media.length <= 512, 'aerender_media_witness');
  requireFact(typeof spec.output === 'string' && path.isAbsolute(spec.output) &&
    samePath(path.resolve(spec.output), spec.output) && /^[\w.-]+\.mp4$/i.test(path.basename(spec.output)), 'aerender_output_path');
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

function processRows(filter) {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const command = `$p=Get-CimInstance Win32_Process -Filter "${filter}" -ErrorAction Stop; if($p){$p | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,@{N='Birth';E={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress}`;
  const bytes = execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + command], { encoding: 'utf8', windowsHide: true, timeout: 6000, maxBuffer: 32768 }).trim();
  if (!bytes) return [];
  return [JSON.parse(bytes)].flat().map(row => ({
    pid: row.ProcessId, parent: row.ParentProcessId, exe: row.ExecutablePath, commandLine: row.CommandLine, birth: row.Birth
  }));
}

function processIdentity(pid) {
  requireFact(Number.isSafeInteger(pid) && pid > 0, 'aerender_process_id');
  const [row] = processRows('ProcessId=' + pid);
  if (!row) return null;
  requireFact(row.pid === pid && typeof row.exe === 'string' &&
    typeof row.commandLine === 'string' && Number.isFinite(Date.parse(row.birth)), 'aerender_process_identity');
  return row;
}

function matchesProcess(expected, identity) {
  if (!expected) return false;
  const actual = identity(expected.pid);
  return !!actual && samePath(actual.exe, expected.exe) &&
    actual.birth === expected.birth && actual.commandLine === expected.commandLine;
}

function nativeRenderers(job, engine) {
  const rows = processRows("Name='AfterFX.com' OR Name='AfterFX.exe'");
  const mentions = (command, file) => command.includes(file) || command.includes(file.replace(/\\/g, '\\\\'));
  const matched = rows.filter(row => typeof row.commandLine === 'string' &&
    mentions(row.commandLine, job.working) && mentions(row.commandLine, job.partial));
  requireFact(matched.length <= 1 && matched.every(row => typeof row.exe === 'string' &&
    samePath(path.dirname(row.exe), path.dirname(job.spec.engine.path)) &&
    (!engine || row.parent === engine.pid && Date.parse(row.birth) >= Date.parse(engine.birth))), 'aerender_native_identity');
  return matched;
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
  const video = media.streams.filter(s => s.codec_type === 'video');
  const audio = media.streams.filter(s => s.codec_type === 'audio');
  const [num, den] = target.fps.split('/').map(Number);
  requireFact(video.length === 1 && video[0].codec_name === 'h264' && video[0].width === target.width &&
    video[0].height === target.height && video[0].avg_frame_rate === target.fps &&
    Number(video[0].nb_read_frames) === target.frames && audio.length === Number(target.audio) &&
    Math.abs(Number(media.format.duration) - target.frames * den / num) <= den / num, 'aerender_media_profile');
  execFileSync(job.spec.ffmpeg.path, ['-nostdin','-v','error','-xerror','-i',job.partial,'-map','0:v','-map','0:a?','-f','null','-'],
    { windowsHide:true, maxBuffer:1024 * 1024 });
  return { frames: target.frames, fps: target.fps, duration: Number(media.format.duration), width: target.width, height: target.height, audio: target.audio };
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

function createJobs(root, identity = processIdentity) {
  requireFact(path.isAbsolute(root), 'aerender_root');
  fs.mkdirSync(root, { recursive:true });
  plainPath(root, true);
  const active = path.join(root, 'active.json');
  const file = (id, name) => {
    requireFact(uuid.test(id), 'aerender_job_id');
    return path.join(root, id, name);
  };
  const get = id => {
    const job = record(file(id, 'prepared.json'));
    requireFact(job?.id === id, 'aerender_job_missing');
    return job;
  };
  const bound = (job, stage) => {
    const entry = record(file(job.id, stage));
    if (entry) requireFact(entry.id === job.id && entry.jobHash === jobHash(job), 'aerender_job_binding');
    return entry;
  };
  const release = id => {
    const held = record(active);
    if (held?.id === id) fs.unlinkSync(active);
  };
  return {
    prepare(spec) {
      validateSpec(spec);
      checkInputs(spec);
      requireFact(!present(spec.output), 'aerender_output_exists');
      const id = randomUUID(), prepared = file(id, 'prepared.json');
      const working = path.join(path.dirname(spec.project.path), 'core4-render-' + id + '.aep');
      const partial = path.join(path.dirname(spec.output), 'core4-render-' + id + '.partial.mp4');
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
        fs.mkdirSync(path.dirname(prepared));
        const job = { id, spec, working, partial, createdAt: new Date().toISOString() };
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
    start(id) {
      return withLock(root, async () => {
        const job = get(id), dispatch = file(id, 'dispatch.json');
        requireFact(!present(dispatch) && !present(active), 'aerender_active_or_already_dispatched');
        requireFact(!present(job.partial) && !present(job.spec.output), 'aerender_output_exists');
        checkInputs(job.spec, job.working);
        writeOnce(active, { id });
        writeOnce(dispatch, { id, jobHash:jobHash(job), createdAt: new Date().toISOString() });
        const child = spawn(process.execPath, [__filename,'worker',root,id], { detached:true, windowsHide:true, stdio:'ignore' });
        await new Promise((resolve, reject) => { child.once('spawn',resolve); child.once('error',reject); });
        try {
          const launched = identity(child.pid);
          if (launched && samePath(launched.exe,process.execPath) && launched.commandLine.includes(id)) writeOnce(file(id,'launcher.json'),launched);
        } catch { /* Worker records its own identity before touching AE. */ }
        child.unref();
        return { id, state:'submitted' };
      });
    },
    async worker(id) {
      const job = get(id);
      requireFact(record(active)?.id === id && bound(job,'dispatch.json'), 'aerender_dispatch_binding');
      const self = identity(process.pid);
      requireFact(self && samePath(self.exe,process.execPath) && self.commandLine.includes(id), 'aerender_worker_identity');
      writeOnce(file(id,'worker.json'), self);
      let terminal;
      try {
        checkInputs(job.spec, job.working);
        plainPath(path.dirname(job.partial),true);
        requireFact(!present(job.partial) && !present(job.spec.output), 'aerender_output_exists');
        const log = file(id,'aerender.log');
        const args = ['-project',job.working,'-rqindex',String(job.spec.target.queueIndex),'-output',job.partial,
          '-close','DO_NOT_SAVE_CHANGES','-v','ERRORS_AND_PROGRESS','-log',log];
        writeOnce(file(id,'start-intent.json'), { executable: job.spec.engine.path, args, createdAt: new Date().toISOString() });
        const fd = fs.openSync(file(id,'console.log'),'wx');
        let result, engine;
        try {
          const child = spawn(job.spec.engine.path,args,{windowsHide:true,stdio:['pipe',fd,fd]});
          result = new Promise(resolve => {
            child.once('close',(code,signal)=>resolve({code,signal}));
            child.once('error',error=>resolve({error:error.code||'spawn_error'}));
          });
          if (child.pid) {
            try {
              engine = identity(child.pid);
              requireFact(engine && samePath(engine.exe,job.spec.engine.path) &&
                engine.commandLine.includes(job.working) && engine.commandLine.includes(job.partial), 'aerender_engine_identity');
              writeOnce(file(id,'engine.json'),engine);
            } catch (error) {
              writeOnce(file(id,'engine-observation-error.json'), { code:error.message });
            }
          }
        } finally { fs.closeSync(fd); }
        const exit = await result;
        writeOnce(file(id,'engine-exit.json'),exit);
        requireFact(exit.code === 0, 'aerender_engine_failed');
        const [renderer] = nativeRenderers(job,engine);
        if (renderer) {
          writeOnce(file(id,'renderer.json'),renderer);
          while (matchesProcess(renderer,identity)) await new Promise(resolve => setTimeout(resolve,3000));
        }
        terminal = verifyCompleted(job,log);
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
      const published = bound(job,'published.json');
      if (published) return published;
      const terminal = bound(job,'reconciled.json') || bound(job,'terminal.json');
      if (terminal) return terminal;
      if (!bound(job,'dispatch.json')) return { id, state:'prepared' };
      try {
        if (matchesProcess(record(file(id,'worker.json')) || record(file(id,'launcher.json')),identity)) {
          const running = matchesProcess(record(file(id,'renderer.json')),identity) ||
            matchesProcess(record(file(id,'engine.json')),identity);
          const engineExit = !!record(file(id,'engine-exit.json'));
          return { id, state: running ? 'rendering' : engineExit ? 'verifying' : 'starting' };
        }
      } catch { return { id, state:'unknown' }; }
      return { id, state:'unknown' };
    },
    reconcile(id) {
      return withLock(root, () => {
        const job = get(id), old = bound(job,'reconciled.json');
        if (old) return old;
        requireFact(record(active)?.id === id && bound(job,'dispatch.json') &&
          record(file(id,'start-intent.json')) && record(file(id,'engine-exit.json'))?.code === 0 &&
          !matchesProcess(record(file(id,'worker.json')),identity) &&
          nativeRenderers(job,record(file(id,'engine.json'))).length === 0, 'aerender_reconcile_unsettled');
        const result = { ...verifyCompleted(job,file(id,'aerender.log')), jobHash:jobHash(job) };
        writeOnce(file(id,'reconciled.json'),result);
        return result;
      });
    },
    finalize(id) {
      return withLock(root, () => {
        const job = get(id), publishedPath = file(id,'published.json');
        const published = bound(job,'published.json');
        if (published) {
          const output = fingerprint(job.spec.output,true);
          requireFact(output.sha256 === published.sha256, 'aerender_published_changed');
          removePublishedAlias(job,output);
          release(id);
          return published;
        }
        const end = bound(job,'reconciled.json') || bound(job,'terminal.json');
        requireFact(record(active)?.id === id && bound(job,'dispatch.json') &&
          end && end.id === id && ['verified','failed'].includes(end.state), 'aerender_unsettled');
        if (end.state === 'failed') {
          requireFact(!present(file(id,'start-intent.json')), 'aerender_unsettled');
          release(id); return end;
        }
        checkInputs(job.spec,job.working);
        plainPath(path.dirname(job.spec.output),true);
        const partial = fingerprint(job.partial,true);
        requireFact(partial.sha256 === end.output.sha256 && partial.bytes === end.output.bytes &&
          partial.dev === end.output.dev && partial.ino === end.output.ino, 'aerender_partial_changed');
        try { fs.linkSync(job.partial,job.spec.output); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        const output = fingerprint(job.spec.output,true);
        requireFact(output.sha256 === partial.sha256 && output.dev === partial.dev && output.ino === partial.ino, 'aerender_publication_conflict');
        const result = { id, jobHash:jobHash(job), state:'published', path:job.spec.output, sha256:output.sha256, bytes:output.bytes, media:end.media };
        writeOnce(publishedPath,result);
        removePublishedAlias(job,output);
        release(id);
        return result;
      });
    }
  };
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

async function main() {
  requireFact(process.platform === 'win32' && process.env.LOCALAPPDATA, 'aerender_windows_required');
  const [command, arg, workerId, ...rest] = process.argv.slice(2);
  if (command === 'worker') {
    requireFact(arg && workerId && !rest.length, 'aerender_usage');
    await createJobs(arg).worker(workerId);
    return;
  }
  requireFact(['prepare','start','status','reconcile','finalize'].includes(command) && arg && !workerId, 'aerender_usage');
  const installation = fs.realpathSync.native(path.join(process.env.LOCALAPPDATA,'AEAgentCore4'));
  const jobs = createJobs(path.join(installation,'aerender-jobs-v1'));
  const value = command === 'prepare' ? jobs.prepare(record(path.resolve(arg))) : await jobs[command](arg);
  console.log(JSON.stringify(value));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createJobs };
