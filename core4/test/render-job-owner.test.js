'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { hash } = require('../protocol/json');
const { createRenderJobOwner } = require('../runtime/render-job-owner');
const { jobHash } = require('../runtime/render-job-history');

function fixture(t) {
  const temp = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'core4-render-job-owner-'));
  t.after(() => {
    const resolved = fs.realpathSync.native(root);
    assert.equal(path.dirname(resolved), temp);
    fs.rmSync(resolved, { recursive:true, force:true });
  });
  const installRoot = path.join(root, 'install');
  const stateDir = path.join(installRoot, 'state', 'production');
  const projectDir = path.join(root, 'staged'), outputDir = path.join(root, 'output');
  for (const dir of [stateDir, projectDir, outputDir]) fs.mkdirSync(dir, { recursive:true });
  const pin = (directory, name) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, name, { flag:'wx' });
    return { path:file, sha256:hash(name) };
  };
  const project = pin(projectDir, 'saved.aep'), media = pin(projectDir, 'footage.png');
  const toolchain = {
    engine:pin(root, 'aerender.exe'), ffmpeg:pin(root, 'ffmpeg.exe'), ffprobe:pin(root, 'ffprobe.exe')
  };
  const config = path.join(stateDir, 'render-job-toolchain.json');
  fs.writeFileSync(config, JSON.stringify(toolchain), { flag:'wx' });
  const taskId = 'task-11111111-2222-4333-8444-555555555555';
  const commandId = 'command-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const ids = { taskId, commandId }, output = path.join(outputDir, 'final.mp4');
  const command = {
    ...ids, state:'succeeded', verificationKind:'local-transaction-receipt',
    selected:{ moduleId:'project-lifecycle', contract:{operationId:'transition-project'} },
    executionPolicy:{policyId:'current-matching-target-after-local-confirmation-v1'},
    input:{ action:'stage-render-copy', projectId:path.join(root,'source.aep'), destination:project.path,
      render:{ compId:7, fps:'30/1', audio:false, startFrame:1, endFrameExclusive:3, output } },
    after:{ currentProject:project.path, savedFileSha256:project.sha256, dirty:false, renderJob:{
      target:{compId:7, compName:'Master', queueIndex:1, frames:2, width:320, height:180, fps:'30/1', audio:false,
        timeline:{startFrame:10,frameCount:4}, range:{startFrame:11,endFrameExclusive:13}},
      queue:[{index:1,name:'Master',status:'Queued',compId:7,frames:4,startFrame:10,format:'H.264'}],
      media:[{ ...media, bytes:11, modifiedMs:0 }], output,
      scratchOutput:path.join(projectDir, 'core4-r1-scratch.mp4')
    } }
  };
  const owner = (installationId = 'installation-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee') =>
    createRenderJobOwner({ stateDir, installationId,
      getCommand:(task, id) => task === taskId && id === commandId ? command : undefined });
  const jobsDir = path.join(stateDir, 'render-jobs-v1');
  const jobDir = id => path.join(jobsDir, id);
  return { owner, ids, command, config, toolchain, root, installRoot, projectDir, jobsDir, jobDir, project, media };
}

test('R1 prepares once from exact staged ledger evidence and reopens without an executable payload', async t => {
  const f = fixture(t), owner = f.owner();
  assert.deepEqual(owner.prepare({ ...f.ids, engine:f.toolchain.engine }), { state:'rejected', code:'render_job_arguments' });
  assert.equal(fs.existsSync(f.jobsDir), false);
  const prepared = owner.prepare(f.ids);
  assert.equal(prepared.state, 'prepared', JSON.stringify(prepared));
  const { id } = prepared;
  const file = path.join(f.jobDir(id), 'prepared.json');
  const saved = fs.readFileSync(file, 'utf8'), job = JSON.parse(saved);
  assert.deepEqual(job.spec.engine, f.toolchain.engine);
  assert.deepEqual(job.spec.project, f.project);
  assert.deepEqual(job.spec.media, [f.media]);
  assert.equal(job.spec.output, f.command.input.render.output);
  assert.equal(hash(fs.readFileSync(job.working)), f.project.sha256);

  fs.unlinkSync(f.config);
  assert.deepEqual(f.owner().prepare(f.ids), prepared);
  assert.deepEqual(await f.owner().status({ id }), prepared);
  assert.deepEqual(await f.owner().start({ id, argv:['-reuse'] }), { state:'rejected', code:'render_job_arguments' });
  assert.deepEqual(await f.owner().start({ id }), { state:'rejected', code:'render_job_toolchain' });
  assert.deepEqual(await f.owner('other-installation').status({ id }), { state:'rejected', code:'render_job_missing' });
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  assert.equal(fs.readdirSync(f.projectDir).filter(name => /^core4-render-/.test(name)).length, 1);
});

test('R1 refuses foreign or unsettled receipts, output drift and protected paths before preparation', t => {
  const f = fixture(t), owner = f.owner();
  f.command.state = 'UNKNOWN';
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_stage_receipt' });
  f.command.state = 'succeeded';
  f.command.selected.moduleId = 'comp-render';
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_stage_receipt' });
  f.command.selected.moduleId = 'project-lifecycle';
  f.command.after.renderJob.output = path.join(f.root, 'drift.mp4');
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_stage_binding' });
  f.command.input.render.output = f.command.after.renderJob.output = path.join(f.installRoot, 'protected.mp4');
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_protected_path' });
  assert.equal(fs.existsSync(f.jobsDir), false);
});

test('R1 requires its exact plain local toolchain file and verifies the prepared pins', async t => {
  const f = fixture(t), owner = f.owner(), alias = path.join(f.root, 'toolchain-alias');
  fs.linkSync(f.config, alias);
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_toolchain' });
  fs.unlinkSync(alias);
  fs.writeFileSync(f.config, JSON.stringify({ ...f.toolchain, extra:true }));
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_toolchain' });
  fs.writeFileSync(f.config, JSON.stringify({ ...f.toolchain, engine:{ ...f.toolchain.engine, sha256:'0'.repeat(64) } }));
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'aerender_input_changed' });
  fs.writeFileSync(f.config, JSON.stringify(f.toolchain));
  const { id, state } = owner.prepare(f.ids);
  assert.equal(state, 'prepared');
  fs.writeFileSync(f.config, JSON.stringify({ ...f.toolchain, engine:{ ...f.toolchain.engine, sha256:'0'.repeat(64) } }));
  assert.deepEqual(await owner.start({ id }), { state:'rejected', code:'render_job_toolchain_changed' });
  assert.equal(fs.existsSync(path.join(f.jobDir(id), 'dispatch.json')), false);
});

test('R1 retains an interrupted preparation and refuses a second mutation after restart', async t => {
  const f = fixture(t), owner = f.owner();
  const open = fs.openSync;
  const fault = t.mock.method(fs, 'openSync', (file, ...args) => {
    if (path.dirname(file) === f.projectDir && /^core4-render-/.test(path.basename(file))) {
      throw Error('simulated loss with a private host path');
    }
    return open(file, ...args);
  });
  const pending = owner.prepare(f.ids);
  fault.mock.restore();
  assert.equal(pending.state, 'unknown', JSON.stringify(pending));
  assert.deepEqual(f.owner().prepare(f.ids), pending);
  assert.deepEqual(await f.owner().status({ id:pending.id }), pending);
  assert.deepEqual(await f.owner().start({ id:pending.id }), pending);
  assert.deepEqual(await f.owner().cancel({ id:pending.id }), pending);
  assert.deepEqual(fs.readdirSync(f.jobDir(pending.id)), ['prepare-intent.json']);
  assert.deepEqual(fs.readdirSync(f.projectDir).sort(), ['footage.png','saved.aep']);
});

test('R1 reads back a lost prepare reply and enforces the live guard within cancel', {skip:process.platform !== 'win32'}, async t => {
  const f = fixture(t), owner = f.owner(), link = fs.linkSync;
  const fault = t.mock.method(fs, 'linkSync', (source, destination) => {
    link(source, destination);
    if (path.basename(destination) === 'prepared.json') throw Error('simulated reply loss');
  });
  const prepared = owner.prepare(f.ids);
  fault.mock.restore();
  assert.equal(prepared.state, 'prepared', JSON.stringify(prepared));
  const args = { id:prepared.id };
  const revoke = () => { throw Error('render_job_invocation_revoked'); };
  assert.deepEqual(await owner.cancel(args, revoke), { state:'rejected', code:'render_job_invocation_revoked' });
  assert.deepEqual(await owner.status(args), prepared);
  assert.deepEqual(await owner.cancel(args), { ...args, state:'cancelled' });
  assert.deepEqual(await f.owner().status(args), { ...args, state:'cancelled' });
});

test('R1 requires current stage authority for a fresh start and preserves post-reset cancellation', {skip:process.platform !== 'win32'}, async t => {
  const f = fixture(t), owner = f.owner();
  const prepared = owner.prepare(f.ids), args = { id:prepared.id };
  assert.equal(prepared.state, 'prepared');
  // The production getter stops returning commands from an earlier work session.
  f.command.taskId = 'task-22222222-3333-4444-8555-666666666666';
  assert.deepEqual(await owner.start(args), { state:'rejected', code:'render_job_stage_receipt' });
  assert.deepEqual(await owner.status(args), prepared);
  assert.deepEqual(await owner.cancel(args), { ...args, state:'cancelled' });
  assert.deepEqual(await owner.start(args), { ...args, state:'cancelled' });
});

test('R1 exports only a bound, verified publication and refuses changed evidence or movie', async t => {
  const f = fixture(t), owner = f.owner(), { id } = owner.prepare(f.ids);
  const record = name => path.join(f.jobDir(id), name + '.json');
  const write = (name, value) => fs.writeFileSync(record(name), JSON.stringify(value));
  const args = { id, reviewEvidence:true };
  assert.deepEqual(await owner.status(args), { state:'rejected', code:'render_job_not_published' });
  const job = JSON.parse(fs.readFileSync(record('prepared'))), pin = jobHash(job);
  const intent = JSON.parse(fs.readFileSync(record('prepare-intent')));
  const dispatch = { id, jobHash:pin, observationVersion:1 };
  const bytes = Buffer.from('fixture MP4 bytes'), output = { sha256:hash(bytes), bytes:bytes.length, dev:'1', ino:'2' };
  const media = { frames:2, fps:'30/1', width:320, height:180, audio:false, duration:0.067 };
  const terminal = { id, jobHash:pin, state:'verified', output, media };
  const publication = { id, jobHash:pin, state:'published', path:job.spec.output, sha256:output.sha256, bytes:output.bytes, media };
  const publish = { id, jobHash:pin, dispatchHash:jobHash(dispatch), stage:'publish-intent.json',
    path:job.spec.output, proofHash:jobHash(terminal), output };
  write('dispatch', dispatch); write('terminal', terminal); write('publish-intent', publish); write('published', publication);
  fs.writeFileSync(job.spec.output, bytes);
  assert.deepEqual((await owner.status(args)).reviewEvidence, {
    schema:'ae-agent-r1-publication.v1', id, state:'published', compId:7,
    stage:{ commandId:f.ids.commandId, specSha256:intent.authorization.stageHash,
      preparationSha256:hash(intent), renderCopySha256:f.project.sha256 },
    publicationSha256:jobHash(publication), source:{ startFrame:11, endFrameExclusive:13, fps:'30/1' },
    movie:{ sha256:output.sha256, byteLength:output.bytes, width:320, height:180 }
  });
  assert.equal((await owner.status({ id })).reviewEvidence, undefined);
  write('publish-intent', { ...publish, proofHash:'0'.repeat(64) });
  assert.deepEqual(await owner.status(args), { state:'rejected', code:'render_job_publication_binding' });
  write('publish-intent', publish);
  fs.writeFileSync(job.spec.output, Buffer.alloc(bytes.length));
  assert.deepEqual(await owner.status(args), { state:'rejected', code:'aerender_published_changed' });
});
