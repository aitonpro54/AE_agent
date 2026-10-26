'use strict';
const crypto = require('node:crypto');
const MAX_FRAME = 256 * 1024;
function fail(code, message = code) { const e = new Error(message); e.code = code; throw e; }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function bounded(value) { const data = canonical(value); if (Buffer.byteLength(data) > MAX_FRAME) fail('frame_too_large'); return data; }
function parse(data) { if (Buffer.byteLength(data) > MAX_FRAME) fail('frame_too_large'); const value = JSON.parse(data); bounded(value); return value; }
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
function id(prefix) { return prefix + '-' + crypto.randomUUID(); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_object');
  if (Object.keys(value).some(k => !keys.includes(k))) fail('unexpected_field');
}
module.exports = { MAX_FRAME, fail, canonical, bounded, parse, hash, id, exact };
