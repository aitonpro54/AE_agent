'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { createJobs } = require('../tools/aerender-jobs');

const windows = { skip:process.platform !== 'win32' };
const digest = value => createHash('sha256').update(value).digest('hex');
const aepLimit = 96 * 1024 * 1024;

async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function fixture(t, identity = () => null) {
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
  const root = path.join(dir,'jobs');
  const spec = { project:input('source.aep'), media:[input('source.jpg')],
    engine:input('aerender.exe'), ffprobe:input('ffprobe.exe'), ffmpeg:input('ffmpeg.exe'),
    output:path.join(dir,'export.mp4'),
    target:{compId:9,compName:'Master',queueIndex:2,frames:720,fps:'30000/1001',width:640,height:400,audio:false},
    queue:[{index:1,name:'Decoy',status:'Needs Output'},
      {index:2,name:'Master',status:'Queued',compId:9,frames:720,format:'H.264'}] };
  const jobs = createJobs(root,identity);
  const stage = (id,name) => path.join(root,id,name);
  const job = id => JSON.parse(fs.readFileSync(stage(id,'prepared.json'),'utf8'));
  const bind = (id,data = {}) => ({ id, jobHash:digest(JSON.stringify(job(id))), ...data });
  const write = (id,name,data) => fs.writeFileSync(stage(id,name),JSON.stringify(data),{flag:'wx'});
  return {jobs,root,spec,job,bind,write};
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

test('aerender-jobs observes the original worker and renderer and fences a reused PID', windows, async t => {
  const worker = {pid:10,exe:'C:\\fixture\\node.exe',birth:'2026-11-08T00:00:00Z',commandLine:'worker'};
  const renderer = {pid:12,exe:'C:\\fixture\\AfterFX.com',birth:'2026-11-08T00:00:02Z',commandLine:'render target'};
  const processes = new Map([[10,worker],[12,renderer]]);
  const f = fixture(t,pid=>processes.get(pid));
  const { id } = f.jobs.prepare(f.spec);
  f.write(id,'dispatch.json',f.bind(id));
  f.write(id,'worker.json',worker);
  f.write(id,'engine-exit.json',{code:0,signal:null});
  f.write(id,'renderer.json',renderer);
  assert.equal(f.jobs.status(id).state,'rendering');
  processes.set(10,{...worker,birth:'2026-11-08T00:01:00Z'});
  assert.equal(f.jobs.status(id).state,'unknown');
  await assert.rejects(f.jobs.start(id), /aerender_active_or_already_dispatched/);
  await assert.rejects(f.jobs.finalize(id), /aerender_unsettled/);
});

test('aerender-jobs publishes only the verified inode and recovers a lost publish reply', windows, async t => {
  const f = fixture(t);
  const { id } = f.jobs.prepare(f.spec);
  const job = f.job(id), bytes = 'verified fixture output';
  fs.writeFileSync(job.partial,bytes,{flag:'wx'});
  const info = fs.statSync(job.partial,{bigint:true});
  f.write(id,'terminal.json',f.bind(id,{state:'verified',media:{frames:720},
    output:{sha256:digest(bytes),bytes:bytes.length,dev:String(info.dev),ino:String(info.ino)}}));
  await assert.rejects(f.jobs.finalize(id), /aerender_unsettled/);
  f.write(id,'dispatch.json',f.bind(id,{}));
  fs.writeFileSync(path.join(f.root,'active.json'),JSON.stringify({id}),{flag:'wx'});
  fs.writeFileSync(job.spec.output,bytes,{flag:'wx'});
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
