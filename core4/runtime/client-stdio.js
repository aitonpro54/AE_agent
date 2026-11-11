'use strict';
const { createInterface } = require('node:readline');
const { ownerMethods, OWNER_ERRORS, READ_REJECTION_CODES, PRE_DISPATCH_READ_CODES, classifyPhysicalRead } = require('./attachment-owner');

// Thin private fixture/embedding adapter, not the configured production entry.
// EOF closes this authenticated attachment only. No Broker/HTTP/store/bootstrap.
function serveAttachment({ client, input, output, renderJobs = false } = {}) {
  if (!client || typeof client.call !== 'function' || typeof client.close !== 'function' || !input || !output) throw new Error('stdio_attachment_options');
  const MAX = 256 * 1024;
  const methods = ownerMethods(renderJobs);
  let pending = 0, bytes = 0, ended = false;
  const ownErrors = new WeakSet();
  function fail(code, requestId, physical) { const error = new Error(code); ownErrors.add(error); error.requestId = requestId; error.physical = physical; throw error; }
  function reply(value) {
    if (ended || output.destroyed || output.writableEnded) return;
    const id = Number.isSafeInteger(value.id) || typeof value.id === 'string' && Buffer.byteLength(value.id) <= 256 ? value.id : null;
    let data = JSON.stringify({ ...value, id });
    if (Buffer.byteLength(data) > MAX) data = JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'frame_too_large' } });
    if (output.writableLength + Buffer.byteLength(data) + 1 > MAX * 4) { finish(); return; }
    output.write(data + '\n');
  }
  function exact(value, keys) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !keys.includes(k))) fail('invalid_request'); }
  function description(name) {
    if (name === 'controller_acquire' || name === 'controller_transfer') return 'Явное получение управления. Сначала прочитайте core_status; для нового сеанса передайте его workSession.sessionId в payload.sessionId. Это не допуск к изменению AE.';
    if (name === 'core_status') return 'Статус Core, текущего сеанса и сброса. baselineRequired снимается свежей project-inspection; старое управление автоматически не восстанавливается.';
    if (name === 'core_diagnostics') return 'Статус очереди, привязки CEP, окна Windows и подтверждённого нативного ответа.';
    if (name === 'inspect_module_target') return 'Прочитайте get_module_contract и передайте его moduleId и обязательный contractId в payload вместе с target по контракту. Требуется действующий controller lease; чтение не выдаёт допуск к изменению AE.';
    if (name === 'controller_release' || name === 'controller_renew') return 'Передайте в payload.leaseToken точный токен, полученный от controller_acquire/controller_transfer текущим клиентом.';
    if (name === 'render_job_prepare') return 'Подготовить долговечное задание R1 по квитанции stage-render-copy. Передайте taskId и commandId. Требуется controller lease.';
    if (name === 'render_job_status') return 'Прочитать статус R1 по ID задания. Lease не требуется.';
    if (name.startsWith('render_job_')) return 'Операция R1 по ID задания. Требуется controller lease.';
    return 'Подключение к owner Core4; управление требует явного controller_acquire.';
  }
  function inputSchema(name) {
    const schema = { type: 'object', properties: { payload: { type: 'object', additionalProperties: true } }, additionalProperties: false };
    if (name === 'inspect_module_target') {
      schema.required = ['payload'];
      schema.properties.payload.properties = { contractId: { type: 'string', pattern: '^[a-f0-9]{64}$' } };
      schema.properties.payload.required = ['contractId'];
    }
    if (name.startsWith('render_job_')) {
      const keys = name === 'render_job_prepare' ? ['taskId', 'commandId'] : ['id'];
      schema.required = ['payload'];
      schema.properties.payload = { type: 'object', properties: Object.fromEntries(keys.map(key => [key, { type: 'string', minLength: 1, maxLength: 64 }])), required: keys, additionalProperties: false };
    }
    return schema;
  }
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
      if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'ae-agent-core4', version: '4.2.5' } };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools: methods.map(name => ({ name, description: description(name), inputSchema: inputSchema(name) })) };
      else if (request.method === 'tools/call') {
        exact(request.params, ['name', 'arguments', '_meta']);
        if (!methods.includes(request.params.name)) fail('unknown_tool');
        if (request.params._meta !== undefined) {
          if (!request.params._meta || Object.getPrototypeOf(request.params._meta) !== Object.prototype || Buffer.byteLength(JSON.stringify(request.params._meta)) > 8192) fail('invalid_protocol_metadata');
        }
        const args = request.params.arguments || {}; exact(args, ['payload']);
        const payload = args.payload === undefined ? {} : args.payload;
        if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('invalid_payload');
        const response = await client.call(request.params.name, payload);
        const physical = request.params.name === 'inspect_module_target' && response?.ok === false && classifyPhysicalRead(response.physical);
        if (request.params.name === 'run_plan' && response?.ok === false && response.code === 'fresh_dryrun_required') {
          result = { content: [{ type: 'text', text: JSON.stringify({ outcome: 'rejected', code: response.code, nextAction: 'dry_run_plan' }) }], isError: true };
        } else if (physical && ['outcome', 'code', 'nextAction'].every(key => response[key] === physical[key]) &&
            Object.keys(response).every(key => ['ok', 'outcome', 'code', 'nextAction', 'physical', ...(physical.outcome === 'unknown' ? ['requestId'] : [])].includes(key))) {
          if (physical.outcome === 'unknown') fail(physical.code, response.requestId, { nextAction: physical.nextAction, physical: response.physical });
          result = { content: [{ type: 'text', text: JSON.stringify({ ...physical, physical: response.physical }) }], isError: true };
        } else if (request.params.name === 'inspect_module_target' && response?.ok === false && response.outcome === 'rejected' && [...READ_REJECTION_CODES, ...PRE_DISPATCH_READ_CODES].includes(response.code) && response.nextAction === 'core_diagnostics' && Object.keys(response).every(key => ['ok', 'outcome', 'code', 'nextAction'].includes(key))) {
          result = { content: [{ type: 'text', text: JSON.stringify({ outcome: 'rejected', code: response.code, nextAction: response.nextAction }) }], isError: true };
        } else {
          if (!response || response.ok !== true) fail(OWNER_ERRORS.includes(response?.code) ? response.code : 'owner_request_failed', response?.requestId);
          result = { content: [{ type: 'text', text: JSON.stringify(response.value) }], isError: false };
        }
      } else fail('method_not_found');
      reply({ jsonrpc: '2.0', id: request.id, result });
    } catch (error) {
      const ipcErrors = ['ipc_outcome_uncertain', 'ipc_closed', 'ipc_capacity', 'ipc_payload', 'ipc_frame_size', 'ipc_json'];
      const message = ipcErrors.includes(error?.code) ? error.code : ownErrors.has(error) ? error.message : 'request_failed';
      const uncertain = message === 'ipc_outcome_uncertain' || message === 'owner_outcome_uncertain';
      reply({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message,
        ...(uncertain ? { data: { outcome: 'unknown', requestId: typeof error.requestId === 'string' && /^[a-f0-9]{64}$/.test(error.requestId) ? error.requestId : null, ...(ownErrors.has(error) ? error.physical : undefined) } } : message === 'owner_inspection_contract_required' ? { data: { nextAction: 'get_module_contract' } } : {}) } });
    } finally { if (counted) pending--; }
  });
  return Object.freeze({ close() { finish(); lines.close(); }, status() { return { closed: ended, pending }; } });
}
module.exports = { serveAttachment };
