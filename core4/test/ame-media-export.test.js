'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
  return { job, dir, submit, record, encodeId };
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
