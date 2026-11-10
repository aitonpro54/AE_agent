'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { hash } = require('../protocol/json');

const packer = path.resolve(__dirname, '../tools/package-visual-review.js');
const decoder = process.env.CORE4_VISUAL_DECODER_DIR;
const ffmpeg = decoder ? path.resolve(decoder, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg') : 'ffmpeg';
const run = (exe, args) => {
  const result = spawnSync(exe, args, { encoding:'utf8', timeout:120000, windowsHide:true });
  if (result.error) throw result.error;
  return result;
};
const ok = (exe, args) => {
  const result = run(exe, args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test('visual-review binds published R1 frames, requires full and ROI observations, and retains unbound format', t => {
  const temp = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'core4-visual-review-'));
  t.after(() => {
    const resolved = fs.realpathSync.native(root);
    assert.equal(path.dirname(resolved), temp);
    fs.rmSync(resolved, { recursive:true, force:true });
  });
  const file = name => path.join(root, name);
  const sha = name => hash(fs.readFileSync(file(name)));
  const write = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value, null, 2) + '\n');
  const read = name => JSON.parse(fs.readFileSync(file(name)));
  const packed = JSON.parse(ok(process.execPath, [packer, 'pack', file('offline')]));
  assert.equal(packed.files, 4);
  ok(process.execPath, [packer, 'verify', file('offline'), packed.sha256]);
  const movie = (name, filter) => ok(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', filter + '=size=64x48:rate=30000/1001',
    '-frames:v', '6', '-c:v', 'libx264', '-threads', '1', '-vf', 'setsar=1', '-pix_fmt', 'yuv420p', file(name)]);
  movie('one.mp4', 'testsrc2');
  movie('two.mp4', 'smptebars');
  const id = '11111111-2222-8333-8444-555555555555';
  const stage = { commandId:'command-11111111-2222-4333-8444-555555555555', specSha256:hash('spec'),
    preparationSha256:hash('preparation'), renderCopySha256:hash('aep') };
  const evidence = { schema:'ae-agent-r1-publication.v1', id, state:'published', compId:7, stage,
    publicationSha256:hash('published'), source:{ startFrame:37, endFrameExclusive:43, fps:'30000/1001' },
    movie:{ sha256:sha('one.mp4'), byteLength:fs.statSync(file('one.mp4')).size, width:64, height:48 } };
  write('r1.json', evidence);
  const spec = { movie:'one.mp4', sha256:sha('one.mp4'), samples:[{ index:0, expectation:'First frame' },
    { index:5, expectation:'Last frame', roi:{ x:1, y:3, width:17, height:15 } }], r1:{ file:'r1.json', sha256:sha('r1.json'), jobId:id } };
  write('spec.json', spec);
  const script = file('offline/tools/visual-review.js');
  const invoke = (command, ...args) => run(process.execPath, [script, command, ...args]);
  const prep = (dir, specName = 'spec.json') => invoke('prepare', file(specName), file(dir), ...(decoder ? [decoder] : []));
  const mustPass = result => { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  const refuses = (result, pattern) => { assert.equal(result.status, 1, result.stdout); assert.match(result.stderr, pattern); };
  mustPass(prep('packet'));
  mustPass(prep('repeat'));
  const manifest = read('packet/manifest.json');
  assert.equal(sha('packet/manifest.json'), sha('repeat/manifest.json'));
  assert.equal(sha('packet/observations.json'), sha('repeat/observations.json'));
  assert.deepEqual(manifest.frames.map(f => [f.index, f.compFrame]), [[0, 37], [5, 42]]);
  assert.equal(manifest.frames[0].pts, 0);
  assert.ok(manifest.frames[1].pts > 0);
  assert.equal(manifest.frames[1].roi.width, 17);
  assert.equal(manifest.sheet.source, 'contact_sheet');

  const seal = (movie = 'one.mp4', proof = 'r1.json') => invoke('seal', file('packet'), file(movie), file(proof), sha(proof));
  const obs = read('packet/observations.json');
  obs.reviewer = 'TEMP';
  for (const frame of obs.frames) Object.assign(frame, { decision:'pass', observation:'Full frame inspected' });
  write('packet/observations.json', obs);
  refuses(seal(), /missing_roi_observation/);
  Object.assign(obs.frames[1], { roiDecision:'pass', roiObservation:'ROI inspected' });
  write('packet/observations.json', obs);
  refuses(invoke('seal', file('packet'), file('one.mp4')), /r1_evidence_binding_required/);
  refuses(seal('two.mp4'), /packet_file_changed/);
  const png = file('packet/frames/frame-00.png'), original = fs.readFileSync(png);
  fs.copyFileSync(file('packet/frames/frame-01.png'), png);
  refuses(seal(), /packet_file_changed/);
  fs.writeFileSync(png, original);
  const foreign = { ...evidence, id:'22222222-2222-8333-8444-555555555555', publicationSha256:hash('foreign') };
  write('foreign.json', foreign);
  refuses(seal('one.mp4', 'foreign.json'), /r1_evidence_binding_mismatch/);
  const bad = (proof, pattern) => {
    write('bad.json', proof);
    write('bad-spec.json', { ...spec, r1:{ ...spec.r1, file:'bad.json', sha256:sha('bad.json') } });
    refuses(prep('must-not-exist', 'bad-spec.json'), pattern);
    assert.equal(fs.existsSync(file('must-not-exist')), false);
  };
  bad({ ...evidence, state:'verified' }, /invalid_r1_publication/);
  bad({ ...evidence, id:foreign.id }, /r1_job_mismatch/);
  bad({ ...evidence, source:{ ...evidence.source, endFrameExclusive:42 } }, /r1_media_mismatch/);
  bad({ ...evidence, movie:{ ...evidence.movie, sha256:sha('two.mp4') } }, /r1_movie_mismatch/);
  assert.deepEqual(mustPass(seal()).coverage, { required:3, decided:3 });

  const { r1, ...legacy } = spec;
  write('legacy.json', legacy);
  mustPass(prep('legacy', 'legacy.json'));
  const legacyObs = read('legacy/observations.json');
  legacyObs.reviewer = 'TEMP';
  for (const frame of legacyObs.frames) Object.assign(frame, { decision:'pass', observation:'Frame inspected' });
  write('legacy/observations.json', legacyObs);
  assert.equal(mustPass(invoke('seal', file('legacy'), file('one.mp4'))).scope, 'sampled_mp4');
});
