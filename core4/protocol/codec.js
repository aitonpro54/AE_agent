'use strict';
const crypto = require('node:crypto');
const { bounded, parse, exact, fail, hash, canonical } = require('./json');
const VERSION = 1;
function sign(body, secret) { return crypto.createHmac('sha256', secret).update(bounded(body)).digest('hex'); }
function encode(body, secret) { return bounded({ body, mac: sign(body, secret) }); }
function decode(frame, secret) {
  const outer = parse(frame); exact(outer, ['body', 'mac']);
  const expected = sign(outer.body, secret);
  if (typeof outer.mac !== 'string' || outer.mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(outer.mac))) fail('channel_auth');
  return outer.body;
}
function envelope(value) {
  exact(value, ['protocolVersion', 'controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'phase', 'payloadHash', 'payload']);
  if (value.protocolVersion !== VERSION || !['inspect', 'mutate', 'verify'].includes(value.phase)) fail('protocol_mismatch');
  for (const k of ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash']) if (typeof value[k] !== 'string' || value[k].length > 256) fail('invalid_envelope');
  if (hash(canonical(value.payload)) !== value.payloadHash) fail('payload_binding');
  return value;
}
module.exports = { VERSION, encode, decode, envelope };
