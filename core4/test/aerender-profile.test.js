'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateTimeline, frameArgs, verifyMediaFacts } = require('../tools/aerender-profile');

const master = { frames: 720, fps: '30000/1001', width: 640, height: 400, audio: false };
const timeline = { startFrame: 1800, frameCount: 720 };
const row = { startFrame: 1800, frames: 720 };
const excerpt = { ...master, timeline, range: { startFrame: 1830, endFrameExclusive: 1890 }, frames: 60, audio: true };
const invalidTarget = { message: 'aerender_target' };
const invalidWitness = { message: 'aerender_queue_witness' };
const invalidMedia = { message: 'aerender_media_profile' };

function probe() {
  return {
    streams: [{
      codec_type: 'video', codec_name: 'h264', width: 640, height: 400,
      avg_frame_rate: '30000/1001', nb_read_frames: '720'
    }],
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '24.024000', tags: { major_brand: 'mp42' } }
  };
}

test('legacy target binds queue frames and preserves saved render bounds', () => {
  assert.doesNotThrow(() => validateTimeline(master, { frames: 720 }));
  assert.throws(() => validateTimeline(master, { frames: 719 }), invalidWitness);
  assert.deepEqual(frameArgs(master), []);
});

test('full composition uses its native start and includes the last frame', () => {
  const target = { ...master, timeline };
  validateTimeline(target, row);
  assert.deepEqual(frameArgs(target), ['-s', '1800', '-e', '2519']);
  const one = { ...master, frames: 1, timeline: { startFrame: 0, frameCount: 1 } };
  validateTimeline(one, { startFrame: 0, frames: 1 });
  assert.deepEqual(frameArgs(one), ['-s', '0', '-e', '0']);
  assert.throws(() => validateTimeline({ ...target, frames: 719 }, row), invalidTarget);
});

test('half-open excerpt binds full queue dimensions and yields inclusive render bounds', () => {
  validateTimeline(excerpt, row);
  assert.deepEqual(frameArgs(excerpt), ['-s', '1830', '-e', '1889']);
  const tail = { ...excerpt, frames: 1, range: { startFrame: 2519, endFrameExclusive: 2520 } };
  validateTimeline(tail, row);
  assert.deepEqual(frameArgs(tail), ['-s', '2519', '-e', '2519']);
  assert.throws(() => validateTimeline(excerpt, { ...row, frames: excerpt.frames }), invalidWitness);
  assert.throws(() => validateTimeline(excerpt, { ...row, startFrame: 1801 }), invalidWitness);
  assert.throws(() => validateTimeline(excerpt, { frames: row.frames }), invalidWitness);
});

test('unsafe, out of bounds, missing and inconsistent timeline values are refused', () => {
  for (const badTimeline of [
    undefined, null, { startFrame: -1, frameCount: 720 }, { startFrame: 1800, frameCount: 0 },
    { startFrame: 1800, frameCount: 720.5 }, { startFrame: '1800', frameCount: 720 },
    { startFrame: Number.MAX_SAFE_INTEGER - 1, frameCount: 2 }
  ]) assert.throws(() => validateTimeline({ ...excerpt, timeline: badTimeline }, row), invalidTarget);

  for (const range of [
    null, { startFrame: 1799, endFrameExclusive: 1859 }, { startFrame: 2461, endFrameExclusive: 2521 },
    { startFrame: 1830, endFrameExclusive: 1830 }, { startFrame: 1830, endFrameExclusive: 1829 },
    { startFrame: 1830, endFrameExclusive: 1889 }, { startFrame: 1830.5, endFrameExclusive: 1890.5 },
    { startFrame: 1830, endFrameExclusive: Number.MAX_SAFE_INTEGER + 1 }
  ]) assert.throws(() => validateTimeline({ ...excerpt, range }, row), invalidTarget);
});

test('FFprobe facts retain the media receipt shape for a master and an excerpt', () => {
  assert.deepEqual(verifyMediaFacts(master, probe()), { ...master, duration: 24.024 });
  const media = probe();
  media.streams[0].avg_frame_rate = '60000/2002';
  media.streams[0].nb_read_frames = '60';
  media.streams.push({ codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 });
  media.format.duration = '2.002000';
  assert.deepEqual(verifyMediaFacts(excerpt, media), { ...master, frames: 60, duration: 2.002, audio: true });
});

test('wrong container, codec, dimensions, decoded count and rational rate are refused', () => {
  for (const format of [
    { format_name: 'matroska,webm' }, { tags: { major_brand: 'qt  ' } },
    { tags: {} }, { tags: { major_brand: '3gp6' } }
  ]) {
    const media = probe();
    Object.assign(media.format, format);
    assert.throws(() => verifyMediaFacts(master, media), invalidMedia);
  }

  for (const video of [
    { codec_name: 'hevc' }, { width: 641 }, { height: 401 }, { nb_read_frames: '719' },
    { nb_read_frames: 'N/A', nb_frames: '720' }, { avg_frame_rate: '30000/1000' }, { avg_frame_rate: '0/0' }
  ]) {
    const media = probe();
    Object.assign(media.streams[0], video);
    assert.throws(() => verifyMediaFacts(master, media), invalidMedia);
  }
  const media = probe();
  media.streams.push({ ...media.streams[0] });
  assert.throws(() => verifyMediaFacts(master, media), invalidMedia);
});

test('audio expectation binds count, AAC codec, positive sample rate and channels', () => {
  const target = { ...master, audio: true };
  const media = probe();
  const aac = { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 };
  assert.throws(() => verifyMediaFacts(target, media), invalidMedia);
  media.streams.push(aac);
  assert.throws(() => verifyMediaFacts(master, media), invalidMedia);
  media.streams.push(aac);
  assert.throws(() => verifyMediaFacts(target, media), invalidMedia);
  media.streams.pop();
  for (const invalidAudio of [{ codec_name: 'mp3' }, { sample_rate: '0' }, { sample_rate: 'N/A' }, { channels: 0 }]) {
    media.streams[1] = { ...aac, ...invalidAudio };
    assert.throws(() => verifyMediaFacts(target, media), invalidMedia);
  }
});

test('duration allows exactly one fractional-rate frame of drift', () => {
  const media = probe();
  const target = { ...master, frames: 59 };
  media.streams[0].nb_read_frames = '59';
  media.format.duration = '2.002000'; // (59 + 1) * 1001 / 30000
  assert.equal(verifyMediaFacts(target, media).duration, 2.002);
  media.format.duration = '2.002001';
  assert.throws(() => verifyMediaFacts(target, media), invalidMedia);

  target.frames = 61;
  media.streams[0].nb_read_frames = '61';
  media.format.duration = '2.002000'; // (61 - 1) * 1001 / 30000
  assert.equal(verifyMediaFacts(target, media).duration, 2.002);
  for (const duration of ['2.001999', 'N/A', '', '0']) {
    media.format.duration = duration;
    assert.throws(() => verifyMediaFacts(target, media), invalidMedia);
  }
});
