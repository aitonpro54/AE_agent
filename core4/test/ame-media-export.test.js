'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { hash } = require('../protocol/json');
const { plan, read } = require('../tools/ame-media-export');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-ame-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'media');
  fs.mkdirSync(dir);
  const job = { version: 1, target: 'ame-26.0', build: '52', project: path.join(root, 'copy.aep'),
    source: path.join(dir, 'from-ae.mp4'), output: path.join(dir, 'from-ame.mp4'), preset: path.join(root, 'chosen.epr') };
  for (const key of ['project', 'source', 'preset']) {
    const bytes = Buffer.from(key);
    fs.writeFileSync(job[key], bytes);
    job[key + 'Sha256'] = hash(bytes);
  }
  const binding = plan(job).binding, encodeId = 'exact-native-id';
  function record(stage, value) {
    fs.writeFileSync(job.output + '.core4-ame.' + stage + '.json', JSON.stringify({ binding, stage, value }), { flag: 'wx' });
  }
  function submit() {
    const { source, output, preset, target, build } = job;
    record('dispatch', { target });
    record('intent', { source, output, preset, target, build });
    record('submitted', { method: 'exportItem', encodeId });
  }
  return { job, root, dir, submit, record, encodeId };
}

test('AME media: planning is read-only and requires an isolated queue; submission alone does not certify output', t => {
  const env = fixture(t);
  const before = fs.readdirSync(env.dir);
  const result = plan(env.job);
  assert.equal(result.state, 'isolated-queue-required');
  assert.equal(result.dispatch, false);
  assert.deepEqual(fs.readdirSync(env.dir), before);
  assert.equal(read(env.job).state, 'not-dispatched');
  env.submit();
  assert.equal(read(env.job).state, 'submission-observed');
  assert.throws(() => plan(env.job), /ame_output_already_reserved/);
  assert.equal(fs.existsSync(env.job.output), false);
});

test('AME media: original terminal receipt requires the exact output, preset and file', t => {
  const env = fixture(t);
  env.submit();
  env.record('terminal', { result: 'Done!', encodeId: env.encodeId, outputs: [env.job.output] });
  assert.throws(() => read(env.job), /ame_file_scope/);
  fs.writeFileSync(env.job.output, 'media');
  assert.equal(read(env.job).sha256, hash(Buffer.from('media')));
  fs.writeFileSync(env.job.preset, 'changed');
  assert.throws(() => read(env.job), /ame_input_hash/);
});

const ps = process.platform === 'win32' && (process.env.Path || process.env.PATH || '').split(path.delimiter)
  .map(dir => path.join(dir, 'pwsh.exe')).find(file => path.isAbsolute(file) && fs.existsSync(file));
const windowsTest = (name, fn) => test(name, { skip: !ps, timeout: 45000 }, fn);
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function isolatedFixture(t, { holdPost = false, loseResult = false } = {}) {
  const { job, root } = fixture(t);
  const portable = path.join(root, 'оператор Core');
  for (const relative of ['tools/ame-media-export.js', 'tools/ame-isolated-export.ps1', 'tools/ame-isolated-host.ps1', 'protocol/json.js']) {
    const target = path.join(portable, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '..', relative), target);
  }
  const jobFile = path.join(root, 'job.json'), queue = path.join(root, 'batch.xml'), watch = path.join(root, 'watch.xml');
  const active = queue + '.core4-ame-active.json', run = job.output + '.core4-ame.isolated';
  const original = Buffer.from('<PremiereData><Groups><Group ObjectRef="1"/></Groups><BatchItemGroup ObjectID="1"/><BatchItem><Status>0</Status></BatchItem></PremiereData>\r\n');
  fs.writeFileSync(jobFile, JSON.stringify(job));
  fs.writeFileSync(queue, original);
  fs.writeFileSync(watch, '<PremiereData/>');
  fs.writeFileSync(path.join(root, 'prefs.xml'), `<prop.map><prop.pair><key>BatchSaveLocation</key><ustring>${escape(queue)}</ustring></prop.pair>` +
    `<prop.pair><key>WatchFolderInfoSaveLocation</key><ustring>${escape(watch)}</ustring></prop.pair></prop.map>`);
  const jobId = 'test-remote-job';
  const fields = `<JobId>${jobId}</JobId><JobStatus>Success</JobStatus>` +
    `<SourceFilePath>${escape(job.source)}</SourceFilePath><SourcePresetPath>${escape(job.preset)}</SourcePresetPath><DestinationPath>${escape(job.output)}</DestinationPath>`;
  const requests = [];
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/xml');
    if (req.method === 'POST' && req.url === '/job') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        requests.push(Buffer.concat(chunks).toString('utf8'));
        if (!loseResult) fs.writeFileSync(job.output, Buffer.from('0000ftypisomfixture'));
        if (!holdPost) res.end(`<payload><SubmitResult>Accepted</SubmitResult><JobId>${jobId}</JobId></payload>`);
      });
    } else if (req.method === 'GET' && req.url === '/history') {
      const finished = requests.length && !loseResult;
      const status = finished ? fields : '<JobStatus>Not Found</JobStatus><JobId></JobId>';
      res.end(`<payload><ServerStatus>Online</ServerStatus>${status}<CompletedJobs>${finished ? `<Job>${fields}</Job>` : ''}</CompletedJobs></payload>`);
    } else { res.statusCode = 404; res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const children = new Set();
  t.after(() => { for (const child of children) child.kill(); server.closeAllConnections(); server.close(); });
  function start(mode, pause = '') {
    const child = spawn(ps, ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'fixtures/ame-isolated-host.ps1'),
      '-Operator', path.join(portable, 'tools/ame-isolated-export.ps1'), '-Mode', mode, '-Job', jobFile, '-Node', process.execPath], {
      windowsHide: true, env: { ...process.env, CORE4_AME_TEST_PORT: String(server.address().port), CORE4_AME_TEST_PAUSE: pause }
    });
    children.add(child);
    let stdout = '', stderr = '';
    child.stdout.on('data', bytes => { stdout += bytes; });
    child.stderr.on('data', bytes => { stderr += bytes; });
    const done = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => { children.delete(child); resolve({ code, stdout, stderr }); });
    });
    return { child, done };
  }
  async function result(mode) {
    const response = await start(mode).done;
    assert.equal(response.code, 0, response.stderr);
    return JSON.parse(response.stdout);
  }
  function verifyRestored() {
    assert.deepEqual(fs.readFileSync(queue), original);
    assert.equal(fs.existsSync(active), false);
  }
  return { job, jobId, root, run, queue, active, original, requests, start, result, verifyRestored };
}

async function until(predicate) {
  const expires = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() >= expires) assert.fail('AME interruption point was not observed');
    await delay(40);
  }
}

windowsTest('AME isolated operator submits one XML job, verifies native completion and restores the original queue', async t => {
  const env = await isolatedFixture(t);
  const result = await env.result('run');
  assert.equal(result.state, 'done');
  assert.equal(result.jobId, env.jobId);
  assert.equal(result.sha256, hash(fs.readFileSync(env.job.output)));
  assert.equal(result.queueSha256, hash(env.original));
  assert.equal(env.requests.length, 1);
  assert.ok(env.requests[0].includes(`<DestinationPath>${escape(env.job.output)}</DestinationPath>`));
  env.verifyRestored();
  assert.deepEqual(read(env.job), result);
  assert.deepEqual(await env.result('recover'), result);
  assert.equal(env.requests.length, 1);
  assert.throws(() => plan(env.job), /ame_output_already_reserved/);
});

windowsTest('AME isolated recovery refuses to overwrite a foreign queue after an interrupted run', async t => {
  const env = await isolatedFixture(t);
  const running = env.start('run', 'isolated');
  await until(() => fs.existsSync(path.join(env.root, 'isolated.ready')));
  running.child.kill();
  await running.done;
  const operation = JSON.parse(fs.readFileSync(path.join(env.run, 'operation.json')));
  fs.writeFileSync(env.queue, env.original);
  const recovery = await env.start('recover').done;
  assert.match(recovery.stderr, /ame_isolated_queue_changed/);
  assert.deepEqual(fs.readFileSync(operation.held), env.original);
  assert.deepEqual(fs.readFileSync(env.queue), env.original);
  assert.ok(fs.existsSync(env.active));
  assert.equal(env.requests.length, 0);
});

windowsTest('AME isolated recovery after process death between queue isolation and dispatch sends zero jobs', async t => {
  const env = await isolatedFixture(t);
  const running = env.start('run', 'isolated');
  await until(() => fs.existsSync(path.join(env.root, 'isolated.ready')));
  assert.equal(fs.existsSync(env.queue), false);
  const second = await env.start('run').done;
  assert.match(second.stderr, /ame_isolation_busy/);
  running.child.kill();
  await running.done;
  assert.equal((await env.result('recover')).state, 'not-dispatched');
  assert.equal(env.requests.length, 0);
  env.verifyRestored();
});

for (const loseResult of [false, true]) windowsTest(`AME isolated recovery after a lost submission reply ${loseResult ? 'preserves UNKNOWN' : 'reads the original completion'}`, async t => {
  const env = await isolatedFixture(t, { holdPost: true, loseResult });
  const running = env.start('run');
  await until(() => env.requests.length === 1);
  assert.ok(fs.existsSync(path.join(env.run, 'dispatch.json')));
  assert.equal(fs.existsSync(path.join(env.run, 'accepted.xml')), false);
  assert.equal(read(env.job).state, 'pending-or-unknown');
  running.child.kill();
  await running.done;
  assert.equal((await env.result('recover')).state, loseResult ? 'unknown' : 'done');
  env.verifyRestored();
  assert.equal(env.requests.length, 1);
  assert.throws(() => plan(env.job), /ame_output_already_reserved/);
});
