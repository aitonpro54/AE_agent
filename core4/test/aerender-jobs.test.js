'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { createJobs } = require('../tools/aerender-jobs');
const operator = require.resolve('../tools/aerender-jobs');

const windows = { skip:process.platform !== 'win32' };
const digest = value => createHash('sha256').update(value).digest('hex');
const aepLimit = 96 * 1024 * 1024;

async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function fixture(t, identity = () => null, owned = false) {
  const parent = fs.realpathSync.native(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent,'core4-aerender-test-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync.native(dir)), parent);
    fs.rmSync(dir,{recursive:true,force:true});
  });
  function input(name, bytes = name) {
    const file = path.join(dir,name);
    fs.writeFileSync(file,bytes,{flag:'wx'});
    return { path:file, sha256:digest(bytes) };
  }
  const root = path.join(dir,owned ? 'render-jobs-v1' : 'jobs');
  const spec = { project:input('source.aep'), media:[input('source.jpg')],
    engine:input('aerender.exe'), ffprobe:input('ffprobe.exe'), ffmpeg:input('ffmpeg.exe'),
    output:path.join(dir,'export.mp4'),
    target:{compId:9,compName:'Master',queueIndex:2,frames:720,fps:'30000/1001',width:640,height:400,audio:false},
    queue:[{index:1,name:'Decoy',status:'Needs Output'},
      {index:2,name:'Master',status:'Queued',compId:9,frames:720,format:'H.264'}] };
  const jobs = createJobs(root,identity,() => assert.fail('unexpected native inventory'));
  const stage = (id,name) => path.join(root,id,name);
  const job = id => JSON.parse(fs.readFileSync(stage(id,'prepared.json'),'utf8'));
  const bind = (id,data = {}) => ({ id, jobHash:digest(JSON.stringify(job(id))), ...data });
  const write = (id,name,data) => fs.writeFileSync(stage(id,name),JSON.stringify(data),{flag:'wx'});
  return {jobs,root,spec,job,bind,write,stage};
}

function processFixture(t, owned = false) {
  const f = fixture(t, undefined, owned);
  let preparation;
  if (owned) {
    const { hash } = require('../protocol/json');
    const { randomUUID } = require('node:crypto');
    const { engine, ffmpeg, ffprobe, ...stage } = f.spec;
    const commandId = 'command-' + randomUUID(), installationId = 'installation-' + randomUUID();
    const hex = hash(['ae-core4/render-job/v1', installationId, commandId]);
    preparation = { id: [hex.slice(0,8), hex.slice(8,12), '8' + hex.slice(13,16),
      ((parseInt(hex[16], 16) & 3) | 8).toString(16) + hex.slice(17,20), hex.slice(20,32)].join('-'),
      authorization: { installationId, commandId, taskId: 'task-' + randomUUID(), stageHash: hash(stage) } };
  }
  const { id } = f.jobs.prepare(f.spec, preparation), job = f.job(id);
  const command = (...args) => args.map(arg => '"' + arg + '"').join(' ');
  const starter = {pid:9,parent:8,exe:process.execPath,birth:'2026-11-08T00:00:00.000Z',
    commandLine:command(process.execPath,operator,'start',id)};
  const dispatch = f.bind(id,{observationVersion:1,starter,createdAt:'2026-11-08T00:00:00.100Z', ...(owned && { workerEntry: operator })});
  const dispatchHash = digest(JSON.stringify(dispatch));
  f.write(id,'dispatch.json',dispatch);
  fs.writeFileSync(path.join(f.root,'active.json'),JSON.stringify(f.bind(id,{dispatchHash})),{flag:'wx'});
  const save = (stage,data) => f.write(id,stage,f.bind(id,{...data,stage,dispatchHash}));
  const worker = {pid:10,parent:9,exe:process.execPath,birth:'2026-11-08T00:00:01.000Z',
    commandLine:command(process.execPath,operator,'worker',f.root,id)};
  const args = ['-project',job.working,'-rqindex','2','-output',job.partial,
    '-close','DO_NOT_SAVE_CHANGES','-v','ERRORS_AND_PROGRESS','-log',f.stage(id,'aerender.log')];
  const engine = {pid:11,parent:10,exe:job.spec.engine.path,birth:'2026-11-08T00:00:02.000Z',
    commandLine:command(job.spec.engine.path,...args)};
  const rendererExe = path.join(path.dirname(engine.exe),'AfterFX.com');
  const wrapped = ['-port','[::1]:7856',...args].map(arg => JSON.stringify("'" + arg + "'")).join(',');
  const renderer = {pid:12,parent:11,exe:rendererExe,birth:'2026-11-08T00:00:02.300Z',
    commandLine:"d -noui -m -s if (typeof gAECommandLineRenderer == 'undefined' ) { app.exitCode = 13;} else { gAECommandLineRenderer.Render(" + wrapped + '); }'};
  const engineHash = digest(JSON.stringify(engine));
  const exit = {code:0,signal:null,engineHash,observedAt:'2026-11-08T00:00:03.000Z'};
  const processes = new Map();
  const read = (listRenderers = () => []) => createJobs(f.root,pid => processes.get(pid) || null,listRenderers);
  const started = () => {
    save('launcher.json',{process:worker});
    save('worker.json',{process:worker});
    save('start-intent.json',{executable:engine.exe,args,workerHash:digest(JSON.stringify(worker)),createdAt:'2026-11-08T00:00:01.500Z'});
  };
  return {...f,id,job,save,worker,engine,renderer,engineHash,exit,processes,read,started};
}

test('R1 maintenance fences a lost worker and a reserved publication even without the slot', windows, async t => {
  const { inspectRenderJobs } = require('../runtime/render-job-maintenance');
  const f = processFixture(t, true);
  const scan = (probe = () => []) => inspectRenderJobs(path.dirname(f.root), { probe });
  const held = path.join(f.root, 'active.json'), slot = fs.readFileSync(held);
  f.started();
  f.save('engine.json', { process: f.engine });
  fs.unlinkSync(held);
  assert.throws(() => scan(), /render_job_maintenance_unsettled/);
  fs.writeFileSync(held, slot);
  f.save('engine-exit.json', f.exit);
  verifiedFixture(f, f.id, f.job);
  const old = fs.linkSync;
  try {
    fs.linkSync = (from, to) => { if (to === f.job.spec.output) throw Error('fixture_interrupted_publication'); return old(from,to); };
    await assert.rejects(f.read().finalize(f.id), /fixture_interrupted_publication/);
  } finally { fs.linkSync = old; }
  assert.ok(fs.existsSync(f.stage(f.id,'publish-intent.json')));
  fs.unlinkSync(held);
  assert.throws(() => scan(), /render_job_maintenance_unsettled/);
  fs.writeFileSync(held, slot);
  assert.equal((await f.read().finalize(f.id)).state, 'published');
  assert.throws(() => scan(() => [f.worker]), /render_job_maintenance_unsettled/);
  assert.match(scan().registry, /^[0-9a-f]{64}$/);
});

function verifiedFixture(f, id, job) {
  const bytes = 'verified fixture output';
  fs.writeFileSync(job.partial,bytes,{flag:'wx'});
  const info = fs.statSync(job.partial,{bigint:true});
  const end = f.bind(id,{state:'verified',media:{frames:720},
    output:{sha256:digest(bytes),bytes:bytes.length,dev:String(info.dev),ino:String(info.ino)}});
  f.write(id,'terminal.json',end);
  return bytes;
}

test('aerender-jobs binds a saved queue and refuses drift and extra ready rows', windows, async t => {
  const f = fixture(t);
  const extra = structuredClone(f.spec);
  extra.queue[0].status = 'Queued';
  assert.throws(() => f.jobs.prepare(extra), /aerender_queue_witness/);
  const { id } = f.jobs.prepare(f.spec);
  assert.equal(f.jobs.status(id).state,'prepared');
  assert.equal(path.dirname(f.job(id).working),path.dirname(f.spec.project.path));
  fs.appendFileSync(f.job(id).working,'changed');
  await assert.rejects(f.jobs.start(id), /aerender_input_changed/);
  assert.equal(f.jobs.status(id).state,'prepared');
});

test('aerender-jobs observes the starter from the configured owner environment before dispatch', windows, t => {
  const f = fixture(t);
  const { id } = f.jobs.prepare(f.spec);
  const runner = path.resolve(__dirname, '../runtime/aerender-jobs.js');
  const script = 'const {createJobs}=require(process.argv[1]);createJobs(process.argv[2]).start(process.argv[3],()=>{throw Error("fixture_before_spawn")}).catch(error=>{console.log(error.message);process.exitCode=1;})';
  const child = spawnSync(process.execPath, ['-e', script, runner, f.root, id],
    { encoding: 'utf8', windowsHide: true, env: { ...process.env, PATH: '', USERPROFILE: '' }, timeout: 12000 });
  assert.equal(child.status, 1, child.stderr);
  assert.equal(child.stdout.trim(), 'fixture_before_spawn');
  assert.deepEqual(fs.readdirSync(f.root), [id]);
  assert.deepEqual(fs.readdirSync(path.join(f.root, id)), ['prepared.json']);
});

test('aerender-jobs reaches the native launch intent with an isolated owner environment', windows, async t => {
  const f = fixture(t);
  const { id } = f.jobs.prepare(f.spec);
  const runner = path.resolve(__dirname, '../runtime/aerender-jobs.js');
  const script = 'require(process.argv[1]).createJobs(process.argv[2]).start(process.argv[3]).catch(error=>{console.error(error.message);process.exitCode=1;})';
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  for (const key of ['PATH', 'HOMEDRIVE', 'HOMEPATH', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'USERPROFILE']) env[key] = '';
  const child = spawnSync(process.execPath, ['-e', script, runner, f.root, id],
    { encoding:'utf8', windowsHide:true, env, timeout:12000 });
  assert.equal(child.status, 0, child.stderr);
  const terminal = f.stage(id, 'terminal.json');
  for (let n = 0; n < 120 && !fs.existsSync(terminal); n++) await new Promise(resolve => setTimeout(resolve, 100));
  const workerPid = JSON.parse(fs.readFileSync(f.stage(id, 'worker.json'), 'utf8')).process.pid;
  // Windows holds the job directory until the detached worker leaves its cwd.
  let workerExited = false;
  for (let n = 0; n < 50; n++) {
    try { process.kill(workerPid, 0); }
    catch (error) {
      assert.equal(error.code, 'ESRCH');
      workerExited = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(workerExited, true, 'detached worker still holds the job directory');
  assert.equal(JSON.parse(fs.readFileSync(terminal, 'utf8')).state, 'unknown');
  assert.equal(JSON.parse(fs.readFileSync(f.stage(id, 'start-intent.json'), 'utf8')).executable, f.spec.engine.path);
});

test('aerender-jobs verifies a 96 MiB AEP and fences same-size copy drift before dispatch', windows, async t => {
  const f = fixture(t);
  fs.truncateSync(f.spec.project.path, aepLimit);
  f.spec.project.sha256 = await fileDigest(f.spec.project.path);
  const { id } = f.jobs.prepare(f.spec);
  const job = f.job(id);
  assert.equal(path.dirname(job.working), path.dirname(f.spec.project.path));
  assert.equal(fs.statSync(job.working).size, aepLimit);
  assert.equal(await fileDigest(job.working), f.spec.project.sha256);

  const fd = fs.openSync(job.working, 'r+');
  try { fs.writeSync(fd, Buffer.from([1]), 0, 1, aepLimit - 1); }
  finally { fs.closeSync(fd); }
  await assert.rejects(f.jobs.start(id), { message:'aerender_input_changed' });
  assert.equal(f.jobs.status(id).state, 'prepared');
  assert.deepEqual(fs.readdirSync(f.root), [id]);
  assert.deepEqual(fs.readdirSync(path.join(f.root, id)), ['prepared.json']);
});

test('aerender-jobs refuses a saved AEP one byte over 96 MiB before preparing a job', windows, t => {
  const f = fixture(t);
  const dir = path.dirname(f.spec.project.path);
  const before = fs.readdirSync(dir);
  fs.truncateSync(f.spec.project.path, aepLimit + 1);
  assert.throws(() => f.jobs.prepare(f.spec), { message:'aerender_input_budget' });
  assert.deepEqual(fs.readdirSync(f.root), []);
  assert.deepEqual(fs.readdirSync(dir), before);
});

test('aerender-jobs keeps the AEP when cleaning up a published prepare receipt fails', windows, t => {
  const f = fixture(t);
  const failure = Error('injected stage unlink failure');
  const unlink = fs.unlinkSync;
  let stage;
  const mock = t.mock.method(fs, 'unlinkSync', file => {
    if (path.dirname(path.dirname(file)) === f.root && /^prepared\.json\..+\.tmp$/.test(path.basename(file))) {
      stage = file;
      throw failure;
    }
    return unlink(file);
  });
  try { assert.throws(() => f.jobs.prepare(f.spec), error => error === failure); }
  finally { mock.mock.restore(); }

  const [id] = fs.readdirSync(f.root);
  assert.equal(fs.statSync(stage).nlink, 2);
  assert.throws(() => f.jobs.status(id), { code:'save_disk_proof_unavailable' });
  fs.unlinkSync(stage);
  assert.deepEqual(f.jobs.status(id), { id, state:'prepared' });
  assert.equal(digest(fs.readFileSync(f.job(id).working)), f.spec.project.sha256);
});

test('aerender-jobs reopens exact engine and renderer pins after worker loss and fences PID reuse', windows, async t => {
  const f = processFixture(t), { id } = f;
  const snapshot = () => fs.readdirSync(path.join(f.root,id)).map(name => [name,fs.readFileSync(f.stage(id,name),'utf8')]);
  f.started();
  f.save('engine.json',{process:f.engine});
  f.processes.set(f.engine.pid,f.engine);
  let before = snapshot();
  assert.deepEqual(f.read().status(id),{id,state:'rendering'});
  assert.deepEqual(snapshot(),before);
  f.processes.delete(f.engine.pid);
  f.save('engine-exit.json',f.exit);
  f.save('renderer.json',{process:f.renderer,engineHash:f.engineHash});
  f.write(id,'terminal.json',f.bind(id,{state:'unknown',error:'fixture interruption'}));
  f.processes.set(f.renderer.pid,f.renderer);
  before = snapshot();
  assert.deepEqual(f.read().status(id),{id,state:'rendering'});
  f.processes.set(f.renderer.pid,{...f.renderer,birth:'2026-11-08T00:01:00.000Z'});
  assert.equal(f.read().status(id).state,'unknown');
  await assert.rejects(f.read().start(id), /aerender_active_or_already_dispatched/);
  await assert.rejects(f.read().finalize(id), /aerender_unsettled/);
  assert.deepEqual(snapshot(),before);
});

test('aerender-jobs fences crash gaps and foreign or malformed process receipts', windows, async t => {
  const f = processFixture(t), { id } = f;
  const replay = {...f.worker,pid:process.pid};
  const orphan = createJobs(f.root,pid => pid === replay.pid ? replay : null,() => []);
  await assert.rejects(orphan.worker(id), /aerender_worker_identity/);
  assert.equal(fs.existsSync(f.stage(id,'worker.json')),false);
  f.started();
  f.processes.set(f.engine.pid,f.engine);
  assert.deepEqual(f.read().status(id),{id,state:'unknown'});
  await assert.rejects(f.read().reconcile(id), /aerender_reconcile_unsettled/);

  const enginePath = f.stage(id,'engine.json');
  f.write(id,'engine.json',f.bind(id,{process:f.engine,stage:'engine.json',dispatchHash:'0'.repeat(64)}));
  assert.deepEqual(f.read().status(id),{id,state:'unknown'});
  await assert.rejects(f.read().reconcile(id), /aerender_reconcile_unsettled/);
  fs.unlinkSync(enginePath);

  f.save('engine.json',{process:{...f.engine,parent:f.worker.pid + 1}});
  assert.deepEqual(f.read().status(id),{id,state:'unknown'});
  fs.unlinkSync(enginePath);
  f.save('engine.json',{process:f.engine});
  f.save('engine-exit.json',f.exit);
  f.processes.delete(f.engine.pid);
  f.save('renderer.json',{process:{...f.renderer,commandLine:f.renderer.commandLine.replace("\"'2'\"","\"'3'\"")},engineHash:f.engineHash});
  assert.deepEqual(f.read().status(id),{id,state:'unknown'});
  await assert.rejects(f.read().reconcile(id), /aerender_reconcile_unsettled/);
  fs.unlinkSync(f.stage(id,'renderer.json'));
  f.write(id,'renderer.json',null);
  assert.deepEqual(f.read().status(id),{id,state:'unknown'});
  await assert.rejects(f.read().reconcile(id), /aerender_reconcile_unsettled/);
  await assert.rejects(f.read().start(id), /aerender_active_or_already_dispatched/);
  assert.equal(fs.existsSync(f.stage(id,'reconciled.json')),false);
  assert.equal(fs.existsSync(path.join(f.root,'active.json')),true);
});

test('aerender-jobs reconcile waits for all proven processes and an unambiguous native inventory', windows, async t => {
  const f = processFixture(t), { id } = f;
  f.started();
  f.save('engine.json',{process:f.engine});
  f.save('engine-exit.json',f.exit);
  f.save('renderer.json',{process:f.renderer,engineHash:f.engineHash});
  for (const row of [f.worker,f.engine,f.renderer]) {
    f.processes.set(row.pid,row);
    await assert.rejects(f.read().reconcile(id), /aerender_reconcile_unsettled/);
    f.processes.delete(row.pid);
  }
  await assert.rejects(f.read(() => [f.renderer]).reconcile(id), /aerender_reconcile_unsettled/);
  await assert.rejects(f.read(() => [{...f.renderer,commandLine:null}]).reconcile(id), /aerender_reconcile_unsettled/);
  await assert.rejects(f.read(() => { throw Error('injected observation failure'); }).reconcile(id), /aerender_reconcile_unsettled/);
  fs.writeFileSync(f.stage(id,'aerender.log'),'missing completion proof',{flag:'wx'});
  await assert.rejects(f.read().reconcile(id), /aerender_completion_log/);
  assert.equal(fs.existsSync(f.stage(id,'reconciled.json')),false);
  assert.equal(fs.existsSync(path.join(f.root,'active.json')),true);
});

test('aerender-jobs returns a prior verified or failed receipt without trying to reconcile it', windows, async t => {
  for (const state of ['verified','failed']) {
    const f = fixture(t), { id } = f.jobs.prepare(f.spec), receipt = f.bind(id,{state});
    f.write(id,'dispatch.json',f.bind(id)); // Legacy dispatch without process binding.
    f.write(id,'terminal.json',receipt);
    const observer = createJobs(f.root,() => { assert.fail('unexpected identity query'); },
      () => { assert.fail('unexpected native inventory'); });
    assert.deepEqual(observer.status(id),receipt);
    assert.deepEqual(await observer.reconcile(id),receipt);
    assert.equal(fs.existsSync(f.stage(id,'reconciled.json')),false);
  }
});

test('aerender-jobs cancels a prepared job once without touching its copy or another active job', windows, async t => {
  t.mock.method(process,'kill',() => assert.fail('unexpected process signal'));
  const f = fixture(t), { id } = f.jobs.prepare(f.spec), { working } = f.job(id);
  const active = path.join(f.root,'active.json'), other = JSON.stringify({id:'00000000-0000-4000-8000-000000000001'});
  fs.writeFileSync(active,other,{flag:'wx'});
  const result = { id, state:'cancelled' };
  assert.deepEqual(await f.jobs.cancel(id),result);
  const receipt = fs.readFileSync(f.stage(id,'cancelled.json'),'utf8');
  assert.deepEqual(f.jobs.status(id),result);
  assert.deepEqual(await f.jobs.cancel(id),result);
  assert.deepEqual(await f.jobs.reconcile(id),result);
  await assert.rejects(f.jobs.start(id), /aerender_cancelled/);
  await assert.rejects(f.jobs.finalize(id), /aerender_cancelled/);
  assert.equal(fs.readFileSync(f.stage(id,'cancelled.json'),'utf8'),receipt);
  assert.equal(fs.readFileSync(active,'utf8'),other);
  assert.equal(digest(fs.readFileSync(working)),f.spec.project.sha256);
  assert.equal(fs.existsSync(f.stage(id,'dispatch.json')),false);
});

test('aerender-jobs closes the exact pre-dispatch slot after a lost release and leaves legacy gaps fenced', windows, async t => {
  t.mock.method(process,'kill',() => assert.fail('unexpected process signal'));
  const f = fixture(t), { id } = f.jobs.prepare(f.spec), active = path.join(f.root,'active.json');
  fs.writeFileSync(active,JSON.stringify({id}),{flag:'wx'});
  await assert.rejects(f.jobs.cancel(id), /aerender_cancel_unsettled/);
  assert.deepEqual(f.jobs.status(id),{id,state:'unknown'});
  const stranded = JSON.stringify(f.bind(id,{dispatchHash:'a'.repeat(64)}));
  fs.writeFileSync(active,stranded);
  const unlink = fs.unlinkSync, failure = Error('injected slot release failure');
  const mock = t.mock.method(fs,'unlinkSync',file => {
    if (file === active) throw failure;
    unlink(file);
  });
  try { await assert.rejects(f.jobs.cancel(id),error => error === failure); }
  finally { mock.mock.restore(); }
  assert.deepEqual(f.jobs.status(id),{id,state:'cancelled'});
  assert.equal(fs.readFileSync(active,'utf8'),stranded);
  assert.deepEqual(await f.jobs.cancel(id),{id,state:'cancelled'});
  assert.equal(fs.existsSync(active),false);
  assert.equal(fs.existsSync(f.stage(id,'dispatch.json')),false);
  assert.equal(fs.existsSync(f.stage(id,'cancel-request.json')),false);
});

test('aerender-jobs drains an exact verified dispatch after a lost cancel reply and releases only its slot', windows, async t => {
  t.mock.method(process,'kill',() => assert.fail('unexpected process signal'));
  const f = processFixture(t), { id, job } = f, active = path.join(f.root,'active.json');
  f.started();
  f.save('engine.json',{process:f.engine});
  f.save('engine-exit.json',f.exit);
  f.save('renderer.json',{process:f.renderer,engineHash:f.engineHash});
  const bytes = verifiedFixture(f,id,job), end = fs.readFileSync(f.stage(id,'terminal.json'),'utf8');
  f.processes.set(f.renderer.pid,f.renderer);
  const unlink = fs.unlinkSync, requestPath = f.stage(id,'cancel-request.json');
  const failure = Error('injected lost cancel acknowledgement');
  const mock = t.mock.method(fs,'unlinkSync',file => {
    unlink(file);
    if (file.startsWith(requestPath + '.') && file.endsWith('.tmp')) throw failure;
  });
  try { await assert.rejects(f.read().cancel(id),error => error === failure); }
  finally { mock.mock.restore(); }
  const request = fs.readFileSync(requestPath,'utf8');
  const pending = { id, state:'cancel_pending' };
  assert.deepEqual(f.read().status(id),pending);
  assert.deepEqual(await f.read().cancel(id),pending);
  await assert.rejects(f.read().finalize(id), /aerender_cancelled/);
  assert.equal(fs.existsSync(active),true);

  f.processes.delete(f.renderer.pid);
  assert.deepEqual(await f.read().cancel(id),{id,state:'cancelled'});
  assert.equal(fs.existsSync(active),false);
  const foreign = JSON.stringify(f.bind(id,{dispatchHash:'0'.repeat(64)}));
  fs.writeFileSync(active,foreign,{flag:'wx'});
  assert.deepEqual(await f.read().cancel(id),{id,state:'cancelled'});
  await assert.rejects(f.read().finalize(id), /aerender_cancelled/);
  assert.equal(fs.readFileSync(active,'utf8'),foreign);
  assert.equal(fs.readFileSync(requestPath,'utf8'),request);
  assert.equal(fs.readFileSync(f.stage(id,'terminal.json'),'utf8'),end);
  assert.equal(fs.readFileSync(job.partial,'utf8'),bytes);
  assert.equal(digest(fs.readFileSync(job.working)),f.spec.project.sha256);
  assert.equal(fs.existsSync(job.spec.output),false);
});

test('aerender-jobs fences unknown cancellation until an observed engine exit and clean native inventory are proven', windows, async t => {
  t.mock.method(process,'kill',() => assert.fail('unexpected process signal'));
  const f = processFixture(t), { id, job } = f;
  f.started();
  f.save('engine.json',{process:f.engine});
  const terminal = f.bind(id,{state:'unknown',error:'aerender_media_profile'});
  f.write(id,'terminal.json',terminal);
  fs.writeFileSync(job.partial,'damaged fixture output',{flag:'wx'});
  const pending = { id, state:'cancel_pending' };
  assert.deepEqual(await f.read().cancel(id),pending);
  assert.deepEqual(f.read().status(id),pending);
  await assert.rejects(f.read().finalize(id), /aerender_cancelled/);
  f.save('engine-exit.json',{...f.exit,code:1});
  assert.deepEqual(await f.read(() => [{...f.renderer,commandLine:null}]).cancel(id),pending);
  assert.equal(fs.existsSync(path.join(f.root,'active.json')),true);
  assert.deepEqual(await f.read().cancel(id),{id,state:'cancelled'});
  assert.equal(fs.existsSync(path.join(f.root,'active.json')),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.stage(id,'terminal.json'),'utf8')),terminal);
  assert.equal(fs.readFileSync(job.partial,'utf8'),'damaged fixture output');
});

test('aerender-jobs settles a failed cancel before native intent and fences malformed cancel receipts', windows, async t => {
  t.mock.method(process,'kill',() => assert.fail('unexpected process signal'));
  const f = processFixture(t), { id } = f;
  const terminal = f.bind(id,{state:'failed',error:'aerender_input_changed'});
  f.write(id,'terminal.json',terminal);
  const request = f.stage(id,'cancel-request.json');
  f.write(id,'cancel-request.json',null);
  assert.deepEqual(f.read().status(id),{id,state:'unknown'});
  await assert.rejects(f.read().cancel(id), /aerender_job_binding/);
  await assert.rejects(f.read().finalize(id), /aerender_job_binding/);
  await assert.rejects(f.read().start(id), /aerender_cancelled/);
  assert.equal(fs.existsSync(path.join(f.root,'active.json')),true);
  fs.unlinkSync(request);
  assert.deepEqual(await f.read().cancel(id),{id,state:'cancelled'});
  assert.equal(fs.existsSync(path.join(f.root,'active.json')),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.stage(id,'terminal.json'),'utf8')),terminal);
});

test('aerender-jobs fences cancel after finalize reserved an exact publication and recovers the output', windows, async t => {
  t.mock.method(process,'kill',() => assert.fail('unexpected process signal'));
  const f = processFixture(t), { id, job } = f;
  f.started();
  f.save('engine.json',{process:f.engine});
  f.save('engine-exit.json',f.exit);
  const bytes = verifiedFixture(f,id,job);
  const link = fs.linkSync, failure = Error('injected lost publication acknowledgement');
  const mock = t.mock.method(fs,'linkSync',(from,to) => {
    link(from,to);
    if (from === job.partial && to === job.spec.output) throw failure;
  });
  try { await assert.rejects(f.read().finalize(id),error => error === failure); }
  finally { mock.mock.restore(); }
  await assert.rejects(f.read().cancel(id), /aerender_cancel_publication_started/);
  fs.unlinkSync(job.spec.output); // Simulate the alias disappearing after the ambiguous link.
  await assert.rejects(f.read().cancel(id), /aerender_cancel_publication_started/);
  const published = await f.read().finalize(id);
  assert.equal(published.state,'published');
  assert.equal(fs.readFileSync(job.spec.output,'utf8'),bytes);
  await assert.rejects(f.read().cancel(id), /aerender_cancel_publication_started/);
  assert.equal(fs.existsSync(f.stage(id,'cancel-request.json')),false);
});

test('aerender-jobs publishes only the verified inode and recovers a lost publish reply', windows, async t => {
  const f = fixture(t);
  const { id } = f.jobs.prepare(f.spec);
  const job = f.job(id), bytes = verifiedFixture(f,id,job);
  await assert.rejects(f.jobs.finalize(id), /aerender_unsettled/);
  f.write(id,'dispatch.json',f.bind(id,{}));
  fs.writeFileSync(path.join(f.root,'active.json'),JSON.stringify({id}),{flag:'wx'});
  fs.writeFileSync(job.spec.output,bytes,{flag:'wx'});
  await assert.rejects(f.jobs.cancel(id), /aerender_cancel_publication_started/);
  assert.equal(fs.existsSync(f.stage(id,'cancelled.json')),false);
  await assert.rejects(f.jobs.finalize(id), /aerender_publication_conflict/);
  assert.equal(fs.readFileSync(job.spec.output,'utf8'),bytes);
  fs.unlinkSync(job.spec.output);
  // The link exists, but the publication receipt was interrupted.
  fs.linkSync(job.partial,job.spec.output);
  const result = await f.jobs.finalize(id);
  assert.equal(result.state,'published');
  assert.equal(fs.existsSync(job.partial),false);
  assert.deepEqual(await f.jobs.finalize(id),result);
  assert.deepEqual(f.jobs.status(id),result);
});
