'use strict';
const { MAX_FRAME, fail, bounded, parse, hash } = require('../../core/receiver-api');
const sourceHash = hash(require('node:fs').readFileSync(__filename));
// Byte framing is independent of TCP chunk boundaries; UTF-8 is decoded only after
// the entire length-prefixed frame arrives. Channel authentication stays in codec.
function packet(value) {
  const bytes = Buffer.from(bounded(value)); const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length);
  return Buffer.concat([header, bytes]);
}
function createParser(onFrame, onFault) {
  let pending = Buffer.alloc(0), failed = false;
  return chunk => {
    if (failed) return;
    try {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0); if (!length || length > MAX_FRAME) fail('wire_frame_too_large');
        if (pending.length < 4 + length) break;
        const body = pending.subarray(4, length + 4); pending = pending.subarray(length + 4);
        const text = new TextDecoder('utf-8', { fatal: true }).decode(body); onFrame(parse(text));
      }
      if (pending.length > MAX_FRAME + 4) fail('wire_frame_too_large');
    } catch (e) { failed = true; pending = Buffer.alloc(0); onFault(e); }
  };
}
module.exports = { packet, createParser, sourceHash };
