'use strict';

const { createHash } = require('node:crypto');
const FORMATS = new Map([
  ['author-title', ['author', 'title']],
  ['author-caption-title', ['author', 'caption', 'title']],
]);
const QUOTES = new Map([['«', '»'], ['“', '”'], ['„', '“'], ['"', '"']]);
const NUMBER_PREFIX = /^(?:№\s*(\d{1,3})[.)]?|(\d{1,3})[.)])(?:\s+|$)/u;
const CONNECTOR = /^(?:а|в|во|до|за|и|из|к|ко|на|не|ни|о|об|от|по|с|со|у)$/iu;
const MAX_LINES = 5;

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function record(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function frameRect(frame) {
  const keys = ['left', 'top', 'width', 'height'];
  if (!exactKeys(frame, keys) || keys.some(key => !Number.isFinite(frame[key]))) fail('layout_frame');
  const { left, top, width, height } = frame;
  const right = left + width;
  const bottom = top + height;
  if (left < 0 || top < 0 || width < 1 || height < 1 || right > 1e6 || bottom > 1e6) fail('layout_frame');
  return { left, top, width, height };
}

function fitPreferences(value, frame) {
  if (!exactKeys(value, ['padding', 'preferredScale', 'minimumScale'])) fail('layout_fit_preferences');
  const { padding, preferredScale, minimumScale } = value;
  if (!Number.isFinite(padding) || padding < 0 || Math.min(frame.width, frame.height) - 2 * padding < 1 ||
      !Number.isFinite(preferredScale) || preferredScale <= 0 || preferredScale > 10 ||
      !Number.isFinite(minimumScale) || minimumScale < 0.01 || minimumScale > preferredScale) fail('layout_fit_preferences');
  return { padding, preferredScale, minimumScale };
}

// A quote at the beginning of a rubric can span physical lines. Count nested
// pairs of asymmetric delimiters so they do not end the outer quote early.
function closingQuote(text) {
  const open = text[0];
  const close = QUOTES.get(open);
  if (close === undefined) return -1;
  if (open === close) return text.indexOf(close, 1);
  let depth = 1;
  for (let index = 1; index < text.length; index++) {
    if (text[index] === open) depth++;
    if (text[index] === close && --depth === 0) return index;
  }
  return -1;
}

function parse(source, roles, titleCase) {
  const rows = source.split(/\r\n|[\r\n]/u).map(line => line.trim().replace(/\s+/gu, ' '));
  while (rows[0] === '') rows.shift();
  while (rows.at(-1) === '') rows.pop();

  let number = null;
  const prefix = rows[0]?.match(NUMBER_PREFIX);
  if (prefix) {
    number = Number(prefix[1] ?? prefix[2]);
    rows[0] = rows[0].slice(prefix[0].length);
    if (!rows[0]) rows.shift();
    while (rows[0] === '') rows.shift();
  }

  const rubrics = [];
  for (let index = 0; index < rows.length; index++) {
    let text = rows[index];
    if (!text || NUMBER_PREFIX.test(text)) fail('layout_multiple_blocks');
    const quoted = QUOTES.has(text[0]);
    if (quoted) {
      while (closingQuote(text) < 0 && rows[index + 1] && !NUMBER_PREFIX.test(rows[index + 1])) {
        text += ' ' + rows[++index];
      }
      const end = closingQuote(text);
      if (end < 0) fail('layout_unclosed_quote');
      if (end === text.length - 1) {
        const inner = text.slice(1, -1).trim();
        if (!inner) fail('layout_empty_rubric');
        text = `«${inner}»`;
      }
    }
    rubrics.push(text);
  }
  if (rubrics.length !== roles.length) fail('layout_rubric_count');
  return {
    number,
    rubrics: rubrics.map((text, index) => {
      const role = roles[index];
      if (role === 'author') text = text.replace(/(\p{Lu}\.) (?=\p{Lu}\.)/gu, '$1');
      if (role === 'title' && titleCase === 'uppercase') text = text.toUpperCase();
      return { role, text };
    }),
  };
}

function canBreak(words, position) {
  const previous = words[position - 1];
  const next = words[position];
  return !CONNECTOR.test(previous.replace(/^[«“„"]+/u, '')) &&
    !/(?:^|[^\p{L}])(?:\p{Lu}\.)+$/u.test(previous) &&
    !/[«“„(\[—–-]$/u.test(previous) && !/^[»”.,!?;:)\]—–-]/u.test(next);
}

function alternatives(role, words) {
  const textLength = words.join(' ').length;
  if (words.length < 2 || textLength < 24) return [[]];

  const ranked = [];
  let leftLength = 0;
  for (let position = 1; position < words.length; position++) {
    leftLength += words[position - 1].length + (position > 1 ? 1 : 0);
    if (!canBreak(words, position)) continue;
    const atSeparator = /[,;]$/u.test(words[position - 1]);
    if (role === 'author' && !atSeparator) continue;
    const rightLength = textLength - leftLength - 1;
    if (Math.min(leftLength, rightLength) < 4) continue;
    ranked.push({ position, distance: Math.abs(leftLength - rightLength), atSeparator });
  }
  ranked.sort((a, b) => Number(b.atSeparator) - Number(a.atSeparator) ||
    a.distance - b.distance || b.position - a.position);
  return [[], ...ranked.slice(0, 2).map(({ position }) => [position])];
}

function overrideBreaks(override, rubrics) {
  if (!record(override) || Object.keys(override).length === 0 ||
      Object.keys(override).some(role => !rubrics.some(rubric => rubric.role === role))) fail('layout_override');
  return rubrics.map(({ role, words }) => {
    if (!Object.hasOwn(override, role)) return [];
    const breaks = override[role];
    if (!Array.isArray(breaks) || breaks.length === 0 || breaks.length >= MAX_LINES) fail('layout_override');
    let previous = 0;
    for (const position of breaks) {
      if (!Number.isInteger(position) || position <= previous || position >= words.length ||
          !canBreak(words, position)) fail('layout_override');
      previous = position;
    }
    return breaks;
  });
}

function renderLines(rubrics, breaks) {
  return rubrics.flatMap(({ role, words }, index) => {
    let start = 0;
    return [...breaks[index], words.length].map(end => {
      const text = words.slice(start, end).join(' ');
      start = end;
      return { role, text };
    });
  });
}

function candidates(rubrics, override) {
  if (override !== undefined) {
    const lines = renderLines(rubrics, overrideBreaks(override, rubrics));
    if (lines.length > MAX_LINES) fail('layout_line_limit');
    return [{ id: 'override', lines }];
  }

  const optionSets = rubrics.map(({ role, words }) => alternatives(role, words));
  const options = optionSets.reduce((combinations, set) =>
    combinations.flatMap(combination => set.map(option => [...combination, option])), [[]]);
  return options.map(breaks => renderLines(rubrics, breaks))
    .filter(lines => lines.length <= MAX_LINES)
    .map((lines, index) => ({ id: index === 0 ? 'base' : `alternative-${index}`, lines }));
}

function prepareLayout(job) {
  const keys = ['schemaVersion', 'format', 'source', 'titleCase', 'frame', 'lineBreaks', 'fit'];
  if (!record(job) || Object.keys(job).some(key => !keys.includes(key)) || job.schemaVersion !== 'layout-1') fail('layout_job');
  const roles = FORMATS.get(job.format);
  if (!roles || !['preserve', 'uppercase'].includes(job.titleCase)) fail('layout_format');
  const source = job.source;
  if (typeof source !== 'string' || !source.trim() || source.length > 768 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u.test(source)) fail('layout_source');
  const frame = frameRect(job.frame);
  const fit = job.fit === undefined ? undefined : fitPreferences(job.fit, frame);
  const { number, rubrics } = parse(source, roles, job.titleCase);
  const withWords = rubrics.map(rubric => ({ ...rubric, words: rubric.text.split(' ') }));
  const variants = candidates(withWords, job.lineBreaks);
  const layoutId = createHash('sha256').update(JSON.stringify(['layout-1', frame, variants])).digest('hex');
  return { schemaVersion: 'layout-1', layoutId, source, number, frame, rubrics, candidates: variants,
    ...(fit === undefined ? {} : { fit }) };
}

function localCoordinate(value) {
  return Number.isFinite(value) && Math.abs(value) <= 1e6;
}

function measuredBounds(sample) {
  if (!exactKeys(sample, ['id', 'bounds']) || typeof sample.id !== 'string' ||
      !exactKeys(sample.bounds, ['left', 'top', 'width', 'height'])) fail('layout_measurement');
  const { left, top, width, height } = sample.bounds;
  if (![left, top, width, height].every(localCoordinate) || width < 1 || height < 1 ||
      !localCoordinate(left + width) || !localCoordinate(top + height)) fail('layout_measurement');
  return sample.bounds;
}

function fitLayout(job, measurements) {
  const { layoutId, frame, fit, candidates: variants } = prepareLayout(job);
  if (!fit) fail('layout_fit_preferences');
  if (!exactKeys(measurements, ['layoutId', 'geometry', 'anchor', 'samples'])) fail('layout_measurement');
  if (measurements.layoutId !== layoutId) fail('layout_measurement_stale');
  if (measurements.geometry !== 'unparented-unrotated-2d-point-text') fail('layout_measurement_geometry');
  const { anchor, samples } = measurements;
  if (!Array.isArray(anchor) || anchor.length !== 2 || !localCoordinate(anchor[0]) || !localCoordinate(anchor[1]) ||
      !Array.isArray(samples) || samples.length !== variants.length) fail('layout_measurement');

  const boundsById = new Map();
  for (const sample of samples) {
    const bounds = measuredBounds(sample);
    if (boundsById.has(sample.id)) fail('layout_measurement');
    boundsById.set(sample.id, bounds);
  }

  const availableWidth = frame.width - 2 * fit.padding;
  const availableHeight = frame.height - 2 * fit.padding;
  let best;
  for (const variant of variants) {
    const bounds = boundsById.get(variant.id);
    if (!bounds) fail('layout_measurement');
    const scale = Math.min(fit.preferredScale, availableWidth / bounds.width, availableHeight / bounds.height);
    if (!best || scale > best.scale) best = { variant, scale, bounds };
  }
  const { variant, scale, bounds } = best;
  if (scale < fit.minimumScale) return { status: 'below_minimum_scale', layoutId, candidateId: variant.id, scale };

  const center = [frame.left + frame.width / 2, frame.top + frame.height / 2];
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  return {
    status: 'fit', layoutId, candidateId: variant.id, lines: variant.lines, scale,
    position: [center[0] - (bounds.left + bounds.width / 2 - anchor[0]) * scale,
      center[1] - (bounds.top + bounds.height / 2 - anchor[1]) * scale],
    projectedBounds: { left: center[0] - width / 2, top: center[1] - height / 2, width, height },
  };
}

module.exports = { prepareLayout, fitLayout };
