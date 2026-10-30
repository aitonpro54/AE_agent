'use strict';
const { createInterface } = require('node:readline');
const { OWNER_METHODS, OWNER_ERRORS } = require('./attachment-owner');

// Thin private fixture/embedding adapter, not the configured production entry.
// EOF closes this authenticated attachment only. No Broker/HTTP/store/bootstrap.
function serveAttachment({ client, input, output } = {}) {
  if (!client || typeof client.call !== 'function' || typeof client.close !== 'function' || !input || !output) throw new Error('stdio_attachment_options');
  const MAX = 256 * 1024;
  let pending = 0, bytes = 0, ended = false;
  const ownErrors = new WeakSet();
  function fail(code, requestId) { const error = new Error(code); ownErrors.add(error); error.requestId = requestId; throw error; }
  function reply(value) {
    if (ended || output.destroyed || output.writableEnded) return;
    const id = Number.isSafeInteger(value.id) || typeof value.id === 'string' && Buffer.byteLength(value.id) <= 256 ? value.id : null;
    let data = JSON.stringify({ ...value, id });
    if (Buffer.byteLength(data) > MAX) data = JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'frame_too_large' } });
    if (output.writableLength + Buffer.byteLength(data) + 1 > MAX * 4) { finish(); return; }
    output.write(data + '\n');
  }
  function exact(value, keys) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !keys.includes(k))) fail('invalid_request'); }
  function ingest(chunk) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    for (const byte of buffer) { if (byte === 10) bytes = 0; else if (++bytes > MAX) { input.destroy(); finish(); break; } }
  }
  function finish() { if (ended) return; ended = true; input.removeListener('data', ingest); client.close(); }
  input.on('data', ingest);
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('close', finish); input.on('error', finish); output.on('error', finish);
  lines.on('line', async line => {
    let request, counted = false;
    try {
      if (ended) return;
      if (Buffer.byteLength(line) > MAX) fail('frame_too_large');
      request = JSON.parse(line); exact(request, ['jsonrpc', 'id', 'method', 'params']);
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || request.id !== undefined && typeof request.id !== 'string' && !Number.isSafeInteger(request.id) || typeof request.id === 'string' && Buffer.byteLength(request.id) > 256) fail('invalid_request');
      if (request.id === undefined) return;
      if (pending >= 32) fail('rpc_backpressure'); pending++; counted = true;
      let result;
      if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'ae-agent-core4', version: '4.0.0' } };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools: OWNER_METHODS.map(name => ({ name, description: 'Core4 owner attachment; control requires explicit acquisition', inputSchema: { type: 'object', properties: { payload: { type: 'object', additionalProperties: true } }, additionalProperties: false } })) };
      else if (request.method === 'tools/call') {
        exact(request.params, ['name', 'arguments', '_meta']);
        if (!OWNER_METHODS.includes(request.params.name)) fail('unknown_tool');
        if (request.params._meta !== undefined) {
          if (!request.params._meta || Object.getPrototypeOf(request.params._meta) !== Object.prototype || Buffer.byteLength(JSON.stringify(request.params._meta)) > 8192) fail('invalid_protocol_metadata');
        }
        const args = request.params.arguments || {}; exact(args, ['payload']);
        const payload = args.payload === undefined ? {} : args.payload;
        if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('invalid_payload');
        const response = await client.call(request.params.name, payload);
        if (!response || response.ok !== true) fail(OWNER_ERRORS.includes(response?.code) ? response.code : 'owner_request_failed', response?.requestId);
        result = { content: [{ type: 'text', text: JSON.stringify(response.value) }], isError: false };
      } else fail('method_not_found');
      reply({ jsonrpc: '2.0', id: request.id, result });
    } catch (error) {
      const ipcErrors = ['ipc_outcome_uncertain', 'ipc_closed', 'ipc_capacity', 'ipc_payload', 'ipc_frame_size', 'ipc_json'];
      const message = ipcErrors.includes(error?.code) ? error.code : ownErrors.has(error) ? error.message : 'request_failed';
      const uncertain = message === 'ipc_outcome_uncertain' || message === 'owner_outcome_uncertain';
      reply({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message,
        ...(uncertain ? { data: { outcome: 'unknown', requestId: typeof error.requestId === 'string' && /^[a-f0-9]{64}$/.test(error.requestId) ? error.requestId : null } } : {}) } });
    } finally { if (counted) pending--; }
  });
  return Object.freeze({ close() { finish(); lines.close(); }, status() { return { closed: ended, pending }; } });
}
module.exports = { serveAttachment };
