'use strict';

// The caller has already checked the target shape and queue item identity.
function validateTimeline(target, row) {
  const { timeline, range, frames } = target;
  if (timeline === undefined && range === undefined) {
    if (row.frames !== frames) throw Error('aerender_queue_witness');
    return;
  }

  const { startFrame, frameCount } = timeline || {};
  if (!Number.isSafeInteger(startFrame) || startFrame < 0 ||
      !Number.isSafeInteger(frameCount) || frameCount < 1) throw Error('aerender_target');
  const endFrameExclusive = startFrame + frameCount;
  if (!Number.isSafeInteger(endFrameExclusive) || endFrameExclusive - 1 > 2147483647) throw Error('aerender_target');

  if (range !== undefined) {
    if (!Number.isSafeInteger(range?.startFrame) || !Number.isSafeInteger(range?.endFrameExclusive) ||
        range.startFrame < startFrame || range.endFrameExclusive > endFrameExclusive ||
        range.startFrame >= range.endFrameExclusive ||
        range.endFrameExclusive - range.startFrame !== frames) throw Error('aerender_target');
  } else if (frameCount !== frames) {
    throw Error('aerender_target');
  }

  if (row.frames !== frameCount || row.startFrame !== startFrame) throw Error('aerender_queue_witness');
}

function positiveInteger(value) {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : NaN;
}

// Probe data is from ffprobe -count_frames -show_streams -show_format -of json.
function verifyMediaFacts(target, probe) {
  const format = probe?.format;
  const majorBrand = format?.tags?.major_brand;
  // FFprobe uses the same demuxer for MP4 and QuickTime, so also require an MP4/ISO brand.
  if (typeof format?.format_name !== 'string' || !format.format_name.split(',').includes('mp4') ||
      typeof majorBrand !== 'string' || !/^(isom|iso[2-9]|mp4[12]|avc1)$/.test(majorBrand) ||
      !Array.isArray(probe.streams)) throw Error('aerender_media_profile');

  const video = probe.streams.filter(stream => stream?.codec_type === 'video');
  const audio = probe.streams.filter(stream => stream?.codec_type === 'audio');
  const picture = video[0];
  const rate = typeof picture?.avg_frame_rate === 'string' && /^([1-9]\d{0,9})\/([1-9]\d{0,9})$/.exec(picture.avg_frame_rate);
  const [num, den] = target.fps.split('/').map(BigInt);
  if (video.length !== 1 || picture.codec_name !== 'h264' ||
      picture.width !== target.width || picture.height !== target.height ||
      positiveInteger(picture.nb_read_frames) !== target.frames ||
      !rate || BigInt(rate[1]) * den !== num * BigInt(rate[2]) ||
      audio.length !== Number(target.audio)) throw Error('aerender_media_profile');

  if (target.audio && (audio[0].codec_name !== 'aac' ||
      !positiveInteger(audio[0].sample_rate) || !positiveInteger(audio[0].channels))) {
    throw Error('aerender_media_profile');
  }

  const reportedDuration = format.duration;
  const durationParts = (typeof reportedDuration === 'string' || typeof reportedDuration === 'number') &&
    /^(\d{1,24})(?:\.(\d{1,9}))?$/.exec(reportedDuration);
  if (!durationParts) throw Error('aerender_media_profile');

  // Compare the decimal duration to the rational one-frame tolerance without floating-point rounding.
  const [, seconds, fraction = ''] = durationParts;
  const scaledDuration = BigInt(seconds + fraction) * num;
  const scaledFrame = 10n ** BigInt(fraction.length) * den;
  const frames = BigInt(target.frames);
  if (scaledDuration <= 0n || scaledDuration < (frames - 1n) * scaledFrame || scaledDuration > (frames + 1n) * scaledFrame) {
    throw Error('aerender_media_profile');
  }

  return { frames: target.frames, fps: target.fps, duration: Number(reportedDuration), width: target.width, height: target.height, audio: target.audio };
}

module.exports = { validateTimeline, frameArgs: require('./render-job-history').frameArgs, verifyMediaFacts };
