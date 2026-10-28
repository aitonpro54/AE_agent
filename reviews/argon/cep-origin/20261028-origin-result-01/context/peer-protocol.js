'use strict';
const crypto = require('node:crypto');
const { canonical, exact, fail } = require('../../core/receiver-api');
function mac(value, secret) { return crypto.createHmac('sha256', secret).update(canonical(value)).digest('hex'); }
function validMac(value, actual, secret) { const expected = mac(value, secret); return typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual) && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected)); }
function requestBody(value) { exact(value, ['epoch', 'peerId', 'sequence', 'method', 'path', 'payload']); if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) fail('peer_sequence'); return value; }
module.exports = { mac, validMac, requestBody };
