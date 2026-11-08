'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { hash, exact } = require('../protocol/json');
const { sameFileSnapshot, inspectPngBuffer, DEFAULT_MAX_PNG_BYTES } = require('./png-proof');

const SCHEMA = 'ae-agent-visual-review.v1';
const JSON_LIMIT = 256 * 1024;
const MAX_FRAMES = 12;
const MAX_VIDEO_FRAMES = 3600;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function nonempty(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function snapshot(file, limit, keepBytes = false) {
  const before = fs.lstatSync(file);
  check(before.isFile() && before.size > 0 && before.size <= limit, 'invalid_file: ' + file);
  const fd = fs.openSync(file, 'r');
  try {
    check(sameFileSnapshot(before, fs.fstatSync(fd)), 'file_changed: ' + file);
    const buffer = Buffer.alloc(keepBytes ? before.size : Math.min(before.size, 1024 * 1024));
    const sha = createHash('sha256');
    let offset = 0;
    while (offset < before.size) {
      const count = fs.readSync(fd, buffer, keepBytes ? offset : 0,
        Math.min(buffer.length, before.size - offset), null);
      check(count > 0, 'file_changed: ' + file);
      sha.update(buffer.subarray(keepBytes ? offset : 0, keepBytes ? offset + count : count));
      offset += count;
    }
    check(sameFileSnapshot(before, fs.fstatSync(fd)) &&
      sameFileSnapshot(before, fs.lstatSync(file)), 'file_changed: ' + file);
    return { sha256: sha.digest('hex'), byteLength: offset, ...(keepBytes ? { buffer } : {}) };
  } finally {
    fs.closeSync(fd);
  }
}

function readJson(file) {
  const { buffer, sha256 } = snapshot(file, JSON_LIMIT, true);
  return { value: JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')), sha256 };
}

function writeJson(file, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  return hash(bytes);
}

function mediaTool(program, args, input) {
  const result = spawnSync(program, args, {
    input, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true
  });
  if (result.error) throw result.error;
  check(result.status === 0 && !result.stderr.trim(), path.basename(program) + ': ' +
    (result.stderr.trim() || 'exit ' + result.status));
  return result.stdout;
}

function rational(value) {
  check(typeof value === 'string' && /^[1-9]\d{0,8}\/[1-9]\d{0,8}$/.test(value), 'unsupported_time_base_or_rate');
  return value.split('/').map(BigInt);
}

function probe(ffprobe, movie) {
  const data = JSON.parse(mediaTool(ffprobe, ['-v', 'error', '-select_streams', 'v',
    '-show_streams', '-show_frames', '-show_format', '-show_entries',
    'format=format_name:stream=codec_name,width,height,pix_fmt,color_transfer,sample_aspect_ratio,avg_frame_rate,r_frame_rate,time_base,start_pts,nb_frames:stream_side_data=side_data_type:stream_tags=rotate:frame=pts,width,height,pix_fmt,interlaced_frame',
    '-of', 'json', movie]));
  const [video] = data.streams;
  const frames = data.frames ?? [];
  check(data.format?.format_name?.split(',').includes('mp4') && data.streams.length === 1 &&
    video.codec_name === 'h264' && video.pix_fmt === 'yuv420p' &&
    [video.width, video.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096) &&
    video.sample_aspect_ratio === '1:1' && !video.tags?.rotate && !video.side_data_list?.length &&
    !['smpte2084', 'arib-std-b67'].includes(video.color_transfer), 'unsupported_video_profile');
  check(video.start_pts === 0 && video.avg_frame_rate === video.r_frame_rate &&
    frames.length > 0 && frames.length <= MAX_VIDEO_FRAMES &&
    Number(video.nb_frames) === frames.length, 'unsupported_frame_grid');
  const [fpsNum, fpsDen] = rational(video.avg_frame_rate);
  const [timeNum, timeDen] = rational(video.time_base);
  for (const [index, frame] of frames.entries()) {
    check(Number.isSafeInteger(frame.pts) && BigInt(frame.pts) * timeNum * fpsNum === BigInt(index) * timeDen * fpsDen &&
      frame.width === video.width && frame.height === video.height && frame.pix_fmt === video.pix_fmt &&
      frame.interlaced_frame === 0, 'unsupported_frame_grid: ' + index);
  }
  return {
    width: video.width, height: video.height, fps: video.avg_frame_rate, timeBase: video.time_base,
    frameCount: frames.length, pts: frames.map(frame => frame.pts)
  };
}

function frameFile(i) {
  return 'frames/frame-' + String(i).padStart(2, '0') + '.png';
}

function roiFile(i) {
  return 'roi/' + path.basename(frameFile(i));
}

function referenceFile(i) {
  return 'evidence-' + i + '.json';
}

function validateRoi(roi, media) {
  exact(roi, ['x', 'y', 'width', 'height']);
  check([roi.x, roi.y, roi.width, roi.height].every(Number.isSafeInteger) &&
    roi.x >= 0 && roi.y >= 0 && roi.width > 0 && roi.height > 0 &&
    roi.x <= media.width - roi.width && roi.y <= media.height - roi.height, 'roi_out_of_bounds');
}

function validateSamples(samples) {
  check(Array.isArray(samples) && samples.length > 0 && samples.length <= MAX_FRAMES, 'invalid_sample_count');
  let previous = -1;
  for (const sample of samples) {
    exact(sample, ['index', 'expectation', 'roi']);
    check(Number.isSafeInteger(sample.index) && sample.index > previous && sample.index < MAX_VIDEO_FRAMES &&
      nonempty(sample.expectation, 600), 'invalid_or_unsorted_sample');
    previous = sample.index;
  }
}

function pngInfo(ffmpeg, file, expected) {
  const { buffer, sha256, byteLength } = snapshot(file, DEFAULT_MAX_PNG_BYTES, true);
  const png = inspectPngBuffer(buffer);
  check(png.complete, 'invalid_png: ' + file + ' (' + png.reason + ')');
  if (expected) check(png.width === expected.width && png.height === expected.height, 'wrong_png_dimensions: ' + file);
  mediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-err_detect', 'crccheck+explode',
    '-f', 'image2pipe', '-c:v', 'png', '-i', 'pipe:0', '-f', 'null', '-'], buffer);
  return { sha256, byteLength, width: png.width, height: png.height };
}

function cropRoi(ffmpeg, directory, frame, index, bounds) {
  const file = roiFile(index);
  const crop = [bounds.width, bounds.height, bounds.x, bounds.y].join(':');
  mediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-n', '-i', path.join(directory, frame),
    '-vf', 'crop=' + crop + ':exact=1', '-frames:v', '1', '-threads', '1', '-update', '1', path.join(directory, file)]);
  return { bounds, file, ...pngInfo(ffmpeg, path.join(directory, file), bounds) };
}

function makeSheet(ffmpeg, directory, samples, timeBase) {
  const [num, den] = rational(timeBase).map(Number);
  // On Windows use the system font directly. This avoids a fontconfig dependency.
  const windowsFont = process.platform === 'win32'
    ? "fontfile='" + path.join(process.env.WINDIR || 'C:/Windows', 'Fonts/arial.ttf')
      .replaceAll('\\', '/').replaceAll(':', '\\:') + "':"
    : '';
  const filters = [
    'scale=320:200:force_original_aspect_ratio=decrease',
    'pad=320:224:(ow-iw)/2:(200-ih)/2:black',
    ...samples.map((sample, i) => 'drawtext=' + windowsFont + 'text=frame ' + sample.index + ' - ' +
      (sample.pts * num / den).toFixed(3) + " s:x=6:y=204:fontsize=15:fontcolor=white:enable='eq(n," + i + ")'"),
    'tile=' + Math.min(3, samples.length) + 'x' + Math.ceil(samples.length / 3)
  ];
  mediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-n', '-start_number', '0',
    '-i', path.join(directory, 'frames/frame-%02d.png'), '-vf', filters.join(','),
    '-frames:v', '1', '-threads', '1', '-update', '1', path.join(directory, 'sheet.png')]);
}

function prepare(specFile, directory, decoderDirectory) {
  const { value: spec } = readJson(specFile);
  exact(spec, ['movie', 'sha256', 'samples', 'references']);
  check(nonempty(spec.movie, 4096) && path.extname(spec.movie).toLowerCase() === '.mp4' && digest(spec.sha256), 'invalid_movie_spec');
  validateSamples(spec.samples);
  const fromSpec = file => path.resolve(path.dirname(specFile), file);
  const movie = fromSpec(spec.movie);
  const input = snapshot(movie, 1024 ** 3);
  check(input.sha256 === spec.sha256, 'movie_hash_mismatch');
  const references = spec.references ?? [];
  check(Array.isArray(references) && references.length <= 4, 'invalid_reference_count');
  const evidence = references.map(ref => {
    exact(ref, ['label', 'file', 'sha256']);
    check(nonempty(ref.label, 200) && nonempty(ref.file, 4096) && digest(ref.sha256), 'invalid_reference');
    const { buffer, sha256, byteLength } = snapshot(fromSpec(ref.file), JSON_LIMIT, true);
    check(sha256 === ref.sha256, 'reference_hash_mismatch');
    JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
    return { label: ref.label, buffer, sha256, byteLength };
  });

  const tool = name => decoderDirectory
    ? path.resolve(decoderDirectory, name + (process.platform === 'win32' ? '.exe' : '')) : name;
  const ffmpeg = tool('ffmpeg'), ffprobe = tool('ffprobe');
  const decoder = Object.fromEntries([['ffmpeg', ffmpeg], ['ffprobe', ffprobe]].map(([name, executable]) => {
    const version = mediaTool(executable, ['-version']);
    return [name, { version: version.split(/\r?\n/)[0], buildInfoSha256: hash(version) }];
  }));
  const { pts, ...media } = probe(ffprobe, movie);
  check(spec.samples.at(-1).index < media.frameCount, 'sample_out_of_range');
  for (const sample of spec.samples) if (sample.roi !== undefined) validateRoi(sample.roi, media);
  const selected = spec.samples.map(sample => ({ ...sample, pts: pts[sample.index] }));
  fs.mkdirSync(directory);
  fs.mkdirSync(path.join(directory, 'frames'));
  if (selected.some(sample => sample.roi)) fs.mkdirSync(path.join(directory, 'roi'));
  const select = selected.map(sample => 'eq(n\\,' + sample.index + ')').join('+');
  mediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-n', '-noautorotate', '-i', movie,
    '-map', '0:v:0', '-vf', 'select=' + select, '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24',
    '-threads', '1', '-start_number', '0', path.join(directory, 'frames/frame-%02d.png')]);
  check(fs.readdirSync(path.join(directory, 'frames')).length === selected.length, 'extraction_count_mismatch');
  const frames = selected.map(({ roi, ...sample }, i) => {
    const file = frameFile(i);
    return { ...sample, file, ...pngInfo(ffmpeg, path.join(directory, file), media),
      ...(roi ? { roi: cropRoi(ffmpeg, directory, file, i, roi) } : {}) };
  });
  makeSheet(ffmpeg, directory, frames, media.timeBase);
  const sheet = { file: 'sheet.png', ...pngInfo(ffmpeg, path.join(directory, 'sheet.png')) };
  check(snapshot(movie, 1024 ** 3).sha256 === input.sha256, 'movie_changed_during_prepare');
  const recordedReferences = evidence.map(({ buffer, ...record }, i) => {
    const file = referenceFile(i);
    fs.writeFileSync(path.join(directory, file), buffer, { flag: 'wx' });
    return { ...record, file };
  });
  const manifest = { schema: SCHEMA, scope: 'sampled_mp4', movie: input, decoder, media, frames, sheet, references: recordedReferences };
  const manifestSha256 = writeJson(path.join(directory, 'manifest.json'), manifest);
  writeJson(path.join(directory, 'observations.json'), {
    manifestSha256, reviewer: '', frames: frames.map(frame => ({
      index: frame.index, sha256: frame.sha256, ...(frame.roi ? { roiSha256: frame.roi.sha256 } : {}),
      decision: 'unknown', observation: ''
    }))
  });
  return { manifestSha256, frameCount: frames.length };
}

function matchFile(file, pin, limit) {
  const actual = snapshot(file, limit);
  check(actual.sha256 === pin.sha256 && actual.byteLength === pin.byteLength, 'packet_file_changed: ' + file);
}

function seal(directory, movie) {
  const { value: manifest, sha256: manifestSha256 } = readJson(path.join(directory, 'manifest.json'));
  const { value: observations, sha256: observationsSha256 } = readJson(path.join(directory, 'observations.json'));
  check(manifest.schema === SCHEMA && manifest.scope === 'sampled_mp4' &&
    observations.manifestSha256 === manifestSha256, 'manifest_binding_mismatch');
  check(Array.isArray(manifest.frames) && Array.isArray(manifest.references) &&
    manifest.references.length <= 4, 'invalid_manifest');
  validateSamples(manifest.frames.map(({ index, expectation }) => ({ index, expectation })));
  exact(observations, ['manifestSha256', 'reviewer', 'frames']);
  check(nonempty(observations.reviewer, 200) && Array.isArray(observations.frames) &&
    observations.frames.length === manifest.frames.length, 'observation_coverage_mismatch');
  matchFile(movie, manifest.movie, 1024 ** 3);
  for (const [i, frame] of manifest.frames.entries()) {
    matchFile(path.join(directory, frameFile(i)), frame, DEFAULT_MAX_PNG_BYTES);
    const observation = observations.frames[i];
    exact(observation, ['index', 'sha256', 'decision', 'observation', ...(frame.roi === undefined ? [] : ['roiSha256'])]);
    check(observation.index === frame.index && observation.sha256 === frame.sha256 &&
      ['pass', 'fail', 'unknown'].includes(observation.decision) &&
      nonempty(observation.observation, 2000), 'invalid_or_unbound_observation: ' + frame.index);
    if (frame.roi !== undefined) {
      validateRoi(frame.roi?.bounds, manifest.media);
      check(observation.roiSha256 === frame.roi.sha256, 'invalid_or_unbound_roi: ' + frame.index);
      matchFile(path.join(directory, roiFile(i)), frame.roi, DEFAULT_MAX_PNG_BYTES);
    }
  }
  matchFile(path.join(directory, 'sheet.png'), manifest.sheet, DEFAULT_MAX_PNG_BYTES);
  for (const [i, ref] of manifest.references.entries()) matchFile(path.join(directory, referenceFile(i)), ref, JSON_LIMIT);
  const decisions = observations.frames.map(frame => frame.decision);
  const verdict = decisions.includes('fail') ? 'fail' : decisions.includes('unknown') ? 'incomplete' : 'pass';
  const result = {
    schema: SCHEMA, scope: manifest.scope, movie: manifest.movie, manifestSha256, observationsSha256,
    integrity: 'matched', mediaVerification: 'decoded_video_exact_frame_grid',
    coverage: { required: decisions.length, decided: decisions.filter(decision => decision !== 'unknown').length },
    visual: { verdict, evidence: 'reviewer_observations', reviewer: observations.reviewer }
  };
  writeJson(path.join(directory, 'review.json'), result);
  return result;
}

if (require.main === module) {
  try {
    const [command, first, second, decoderDirectory, ...extra] = process.argv.slice(2);
    check(first && second && extra.length === 0 &&
      (command === 'prepare' || (command === 'seal' && !decoderDirectory)),
    'usage: visual-review.js prepare <spec.json> <new-packet-dir> [decoder-bin-dir] | seal <packet-dir> <mp4>');
    const result = command === 'prepare'
      ? prepare(path.resolve(first), path.resolve(second), decoderDirectory)
      : seal(path.resolve(first), path.resolve(second));
    console.log(JSON.stringify(result));
    if (result.visual && result.visual.verdict !== 'pass') process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
