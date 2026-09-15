"use strict";

const DEFAULT_SCHEMA = "ae-agent-slideshow.v1";
const MAX_EVENTS = 60;
const MAX_MEDIA_GROUPS = 8;
const MAX_MEDIA_ITEMS = 24;
const MAX_CAPTIONS = 8;
const EPSILON = 0.051;

class SlideshowInputError extends Error {
  constructor(code, message, path) {
    super(message);
    this.code = code;
    this.path = path || null;
  }
}

function fail(code, message, path) {
  throw new SlideshowInputError(code, message, path);
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_INPUT", `${path} must be an object.`, path);
  return value;
}

function allowKeys(value, allowed, path) {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra !== undefined) fail("UNKNOWN_INPUT_FIELD", `${path}.${extra} is not supported.`, `${path}.${extra}`);
}

function string(value, path, max = 500) {
  if (typeof value !== "string" || !value.trim()) fail("INVALID_STRING", `${path} must be a non-empty string.`, path);
  if (value.length > max) fail("INPUT_TOO_LARGE", `${path} exceeds ${max} characters.`, path);
  return value.trim();
}

function finite(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("NONFINITE_NUMBER", `${path} must be a finite number.`, path);
  return value;
}

function positive(value, path) {
  const result = finite(value, path);
  if (result <= 0) fail("INVALID_RANGE", `${path} must be greater than zero.`, path);
  return result;
}

function integer(value, path, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail("INVALID_INTEGER", `${path} must be an integer from ${min} through ${max}.`, path);
  return value;
}

function optionalBoolean(value, path, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail("INVALID_BOOLEAN", `${path} must be a boolean.`, path);
  return value;
}

function rejectCodeLikeKeys(value, path) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (/^(jsx|script|code|expression|command|eval)$/i.test(key)) {
      fail("CODE_FIELD_FORBIDDEN", `${path}.${key} is forbidden in slideshow data.`, `${path}.${key}`);
    }
    rejectCodeLikeKeys(value[key], `${path}.${key}`);
  }
}

function normalizeMediaItem(value, path, eventDuration, audioOnly) {
  const item = object(value, path);
  allowKeys(item, ["path", "start", "duration", "sourceIn", "audio"], path);
  const filePath = string(item.path, `${path}.path`, 2048);
  const start = item.start === undefined ? 0 : finite(item.start, `${path}.start`);
  const duration = positive(item.duration, `${path}.duration`);
  const sourceIn = item.sourceIn === undefined ? 0 : finite(item.sourceIn, `${path}.sourceIn`);
  if (start < 0 || sourceIn < 0) fail("INVALID_RANGE", `${path} start and sourceIn must be non-negative.`, path);
  if (start + duration > eventDuration + EPSILON) fail("EVENT_RANGE_EXCEEDED", `${path} exceeds its event duration.`, path);
  const audio = optionalBoolean(item.audio, `${path}.audio`, audioOnly === true);
  if (audioOnly && audio !== true) fail("AUDIO_REQUIRED", `${path}.audio must be true for audioOnly media.`, `${path}.audio`);
  return { path: filePath, start, duration, sourceIn, audio };
}

function normalizeImageGroup(value, path, eventDuration) {
  const group = object(value, path);
  allowKeys(group, ["leaf", "items"], path);
  const leaf = string(group.leaf, `${path}.leaf`, 180);
  if (!Array.isArray(group.items) || group.items.length < 1 || group.items.length > MAX_MEDIA_ITEMS) {
    fail("INVALID_MEDIA_ITEMS", `${path}.items must contain 1-${MAX_MEDIA_ITEMS} entries.`, `${path}.items`);
  }
  return { leaf, items: group.items.map((item, index) => normalizeMediaItem(item, `${path}.items[${index}]`, eventDuration, false)) };
}

function normalizeEvent(value, index, introDuration) {
  const path = `manifest.events[${index}]`;
  const event = object(value, path);
  allowKeys(event, ["id", "scene", "start", "duration", "title", "titleWrap", "hero", "images", "audioOnly", "captions"], path);
  const id = string(event.id, `${path}.id`, 40);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) fail("UNSAFE_EVENT_ID", `${path}.id must contain only letters, digits, underscore, or hyphen.`, `${path}.id`);
  const scene = integer(event.scene, `${path}.scene`, 1, 999);
  const start = finite(event.start, `${path}.start`);
  const duration = positive(event.duration, `${path}.duration`);
  if (start < 0) fail("INVALID_RANGE", `${path}.start must be non-negative.`, `${path}.start`);
  if (duration <= introDuration) fail("INTRO_CONSUMES_EVENT", `${path}.duration must exceed introDuration.`, `${path}.duration`);
  const title = string(event.title, `${path}.title`, 2000);
  const titleWrap = event.titleWrap === undefined ? 24 : integer(event.titleWrap, `${path}.titleWrap`, 8, 120);
  const hero = string(event.hero, `${path}.hero`, 80);
  const images = event.images === undefined ? [] : event.images;
  if (!Array.isArray(images) || images.length > MAX_MEDIA_GROUPS) fail("INVALID_IMAGE_GROUPS", `${path}.images must contain at most ${MAX_MEDIA_GROUPS} groups.`, `${path}.images`);
  const audioOnly = event.audioOnly === undefined ? [] : event.audioOnly;
  if (!Array.isArray(audioOnly) || audioOnly.length > MAX_MEDIA_ITEMS) fail("INVALID_AUDIO_ITEMS", `${path}.audioOnly must contain at most ${MAX_MEDIA_ITEMS} entries.`, `${path}.audioOnly`);
  const captions = event.captions === undefined ? [] : event.captions;
  if (!Array.isArray(captions) || captions.length > MAX_CAPTIONS) fail("INVALID_CAPTIONS", `${path}.captions must contain at most ${MAX_CAPTIONS} strings.`, `${path}.captions`);
  return {
    id,
    scene,
    start,
    duration,
    title,
    titleWrap,
    hero,
    images: images.map((group, groupIndex) => normalizeImageGroup(group, `${path}.images[${groupIndex}]`, duration)),
    audioOnly: audioOnly.map((item, itemIndex) => normalizeMediaItem(item, `${path}.audioOnly[${itemIndex}]`, duration, true)),
    captions: captions.map((caption, captionIndex) => string(caption, `${path}.captions[${captionIndex}]`, 400))
  };
}

function normalizeArticles(value) {
  const articles = object(value, "articles");
  allowKeys(articles, ["suhanov", "kurnikov", "both"], "articles");
  const result = {};
  for (const key of ["suhanov", "kurnikov", "both"]) {
    if (!Array.isArray(articles[key]) || !articles[key].length || articles[key].length > 20) {
      fail("INVALID_ARTICLES", `articles.${key} must contain 1-20 strings.`, `articles.${key}`);
    }
    result[key] = articles[key].map((entry, index) => string(entry, `articles.${key}[${index}]`, 30000));
  }
  return result;
}

function normalizeManifest(value, articlesValue) {
  const manifest = object(value, "manifest");
  rejectCodeLikeKeys(manifest, "manifest");
  allowKeys(manifest, ["schema", "action", "projectPath", "duration", "frameRate", "width", "height", "pixelAspect", "prefix", "masterName", "finalComp", "introDuration", "events"], "manifest");
  if (manifest.action !== undefined && manifest.action !== "build") {
    fail("UNSUPPORTED_ACTION", "manifest.action must be build when supplied.", "manifest.action");
  }
  const schema = manifest.schema === "codx-133-build.v1" ? DEFAULT_SCHEMA : string(manifest.schema || DEFAULT_SCHEMA, "manifest.schema", 100);
  if (schema !== DEFAULT_SCHEMA) fail("UNSUPPORTED_SCHEMA", `manifest.schema must be ${DEFAULT_SCHEMA} or codx-133-build.v1.`, "manifest.schema");
  const projectPath = string(manifest.projectPath, "manifest.projectPath", 2048);
  const duration = positive(manifest.duration, "manifest.duration");
  const frameRate = positive(manifest.frameRate, "manifest.frameRate");
  if (frameRate > 240) fail("INVALID_FRAME_RATE", "manifest.frameRate must not exceed 240.", "manifest.frameRate");
  const width = integer(manifest.width, "manifest.width", 4, 30000);
  const height = integer(manifest.height, "manifest.height", 4, 30000);
  const pixelAspect = manifest.pixelAspect === undefined ? 1 : positive(manifest.pixelAspect, "manifest.pixelAspect");
  const prefix = string(manifest.prefix, "manifest.prefix", 80);
  if (!/^CODX_[A-Z0-9_-]+_$/.test(prefix)) fail("UNSAFE_GENERATED_PREFIX", "manifest.prefix must be an explicit CODX_*_ generated prefix.", "manifest.prefix");
  const masterName = string(manifest.masterName, "manifest.masterName", 180);
  if (!masterName.startsWith(prefix)) fail("UNSAFE_MASTER_NAME", "manifest.masterName must start with manifest.prefix.", "manifest.masterName");
  const introDuration = manifest.introDuration === undefined ? 2 : positive(manifest.introDuration, "manifest.introDuration");
  const finalComp = manifest.finalComp === undefined ? { name: "Final Comp" } : object(manifest.finalComp, "manifest.finalComp");
  allowKeys(finalComp, ["itemIndex", "name"], "manifest.finalComp");
  const normalizedFinalComp = { name: string(finalComp.name || "Final Comp", "manifest.finalComp.name", 180) };
  if (finalComp.itemIndex !== undefined) normalizedFinalComp.itemIndex = integer(finalComp.itemIndex, "manifest.finalComp.itemIndex", 1, 1000000);
  if (!Array.isArray(manifest.events) || manifest.events.length < 1 || manifest.events.length > MAX_EVENTS) {
    fail("INVALID_EVENTS", `manifest.events must contain 1-${MAX_EVENTS} entries.`, "manifest.events");
  }
  const events = manifest.events.map((event, index) => normalizeEvent(event, index, introDuration));
  const ids = new Set();
  let cursor = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (ids.has(event.id)) fail("DUPLICATE_EVENT_ID", `Duplicate event id ${event.id}.`, `manifest.events[${index}].id`);
    ids.add(event.id);
    if (Math.abs(event.start - cursor) > EPSILON) fail("NONCONTIGUOUS_EVENTS", `Event ${event.id} must start at ${cursor}.`, `manifest.events[${index}].start`);
    cursor = event.start + event.duration;
  }
  if (Math.abs(cursor - duration) > EPSILON) fail("DURATION_MISMATCH", `Events end at ${cursor}, expected ${duration}.`, "manifest.events");
  if (events.length >= 10) {
    const firstTen = events.slice(0, 10).map((event) => event.scene);
    const expectedScenes = "1,2,3,4,5,6,7,8,9,10";
    if (new Set(firstTen).size !== 10 || firstTen.slice().sort((a, b) => a - b).join(",") !== expectedScenes) {
      fail("FIRST_TEN_SCENES_INVALID", "The first ten events must use Scene 1 through Scene 10 exactly once.", "manifest.events");
    }
  }
  const articles = normalizeArticles(articlesValue);
  for (let index = 0; index < events.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(articles, events[index].hero)) {
      fail("UNKNOWN_HERO", `Unknown hero ${events[index].hero}.`, `manifest.events[${index}].hero`);
    }
  }
  return { manifest: { schema, projectPath, duration, frameRate, width, height, pixelAspect, prefix, masterName, finalComp: normalizedFinalComp, introDuration, events }, articles };
}

module.exports = {
  DEFAULT_SCHEMA,
  MAX_EVENTS,
  SlideshowInputError,
  normalizeManifest
};
