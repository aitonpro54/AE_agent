'use strict';
// Deliberately small non-executable schema dialect. No refs, regex, custom code or coercion.
const { fail, bounded, canonical } = require('./json');
const KEYS = ['type', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'enum'];
function check(schema, value, at = '$', depth = 0) {
  if (depth > 24 || !schema || typeof schema !== 'object' || Object.keys(schema).some(k => !KEYS.includes(k))) fail('unsupported_schema', at);
  if (depth === 0) bounded(value);
  if (schema.enum && !schema.enum.some(v => canonical(v) === canonical(value))) fail('schema_enum', at);
  const t = schema.type;
  if (t === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('schema_type', at);
    const props = schema.properties || {};
    if (schema.additionalProperties !== false) fail('unsupported_schema', at + ': objects must be closed');
    for (const k of schema.required || []) if (!(k in value)) fail('schema_required', at + '.' + k);
    for (const k of Object.keys(value)) { if (!(k in props) || ['__proto__', 'constructor', 'prototype'].includes(k)) fail('schema_extra', at + '.' + k); check(props[k], value[k], at + '.' + k, depth + 1); }
  } else if (t === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems || 0) || value.length > (schema.maxItems === undefined ? 4096 : schema.maxItems)) fail('schema_array', at);
    value.forEach((v, i) => check(schema.items, v, at + '[' + i + ']', depth + 1));
  } else if (t === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > (schema.maxLength === undefined ? 8192 : schema.maxLength)) fail('schema_string', at);
  } else if (t === 'number' || t === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (t === 'integer' && !Number.isInteger(value)) || value < (schema.minimum === undefined ? -Infinity : schema.minimum) || value > (schema.maximum === undefined ? Infinity : schema.maximum)) fail('schema_number', at);
  } else if (t === 'boolean') { if (typeof value !== 'boolean') fail('schema_boolean', at); }
  else fail('unsupported_schema', at);
  return value;
}
module.exports = { check };
