# 07-mcp-surface

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/core/stdio.js:1–18`
Полный файл SHA256 (hex groups, concatenate) `e48f5565:3cb38670:32851e6f:e91c7637:151de96a:f01e9a96:6aebf565:3787c401`; Git blob `761bdf05:9246e28d:fa9df438:e8f519c1:0c4d3647`. Выдержка: строки 1–18, 1553 bytes.

```javascript
'use strict';
const readline = require('node:readline');
const { Broker } = require('./broker');
const { parse, bounded, exact, fail, MAX_FRAME } = require('../protocol/json');
const TOOL_METHODS = Object.freeze({ core_status: 'status', core_connect: 'connect', core_disconnect: 'disconnect', core_diagnostics: 'diagnostics', list_modules: 'listModules', get_module_contract: 'getContract', inspect_module_target: 'inspect', build_solution_plan: 'build', propose_plan: 'propose', dry_run_plan: 'dryrun', run_plan: 'run', get_task: 'getTask', reset_task: 'reset', reconcile_task: 'reconcile' });
function serve(broker, input = process.stdin, output = process.stdout, { serverInfo = { name: 'ae-agent-core4', version: '4.0.0-m1' } } = {}) {
  let pending = 0; let rawBytes = 0;
  input.on('data', chunk => { rawBytes += chunk.length; if (rawBytes > MAX_FRAME && !chunk.includes(10)) input.destroy(new Error('frame_too_large')); if (chunk.includes(10)) rawBytes = chunk.length - chunk.lastIndexOf(10) - 1; });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  function reply(value) { output.write(bounded(value) + '\n'); }
  lines.on('line', async line => {
    let request; let counted = false;
    try {
      request = parse(line); exact(request, ['jsonrpc', 'id', 'method', 'params']);
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') fail('invalid_request');
      if (request.id === undefined) return;
      if (pending >= 32) fail('rpc_backpressure'); pending++; counted = true;
      let result;
```

## `core4/core/stdio.js:20–45`
Полный файл SHA256 (hex groups, concatenate) `e48f5565:3cb38670:32851e6f:e91c7637:151de96a:f01e9a96:6aebf565:3787c401`; Git blob `761bdf05:9246e28d:fa9df438:e8f519c1:0c4d3647`. Выдержка: строки 20–45, 1959 bytes.

```javascript
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools: Object.keys(TOOL_METHODS).map(name => ({ name, description: 'Core4 bounded generic operation; no live fallback', inputSchema: { type: 'object', properties: { payload: { type: 'object', additionalProperties: true } }, additionalProperties: false } })) };
      else if (request.method === 'tools/call') {
        exact(request.params, ['name', 'arguments', '_meta']);
        // MCP request metadata is transport data only. It never enters a domain
        // payload, builder, proposal, authority or runtime executor.
        if (request.params._meta !== undefined) {
          if (!request.params._meta || typeof request.params._meta !== 'object' || Array.isArray(request.params._meta) || Buffer.byteLength(bounded(request.params._meta)) > 8192) fail('invalid_protocol_metadata');
        }
        const method = TOOL_METHODS[request.params.name]; if (!method) fail('unknown_tool');
        const args = request.params.arguments || {}; exact(args, ['payload']);
        const value = await broker[method](args.payload || {});
        result = { content: [{ type: 'text', text: bounded(value) }], isError: false };
      } else fail('method_not_found');
      reply({ jsonrpc: '2.0', id: request.id, result });
    } catch (e) { reply({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: e.code || 'request_failed' } }); }
    finally { if (counted) pending--; }
  });
  lines.on('close', () => broker.close()); return lines;
}
if (require.main === module) {
  const index = process.argv.indexOf('--state-dir');
  if (index < 0 || !process.argv[index + 1]) { process.stderr.write('Explicit --state-dir PATH required; installed runtime is never used.\n'); process.exitCode = 2; }
  else { const broker = new Broker({ stateDir: process.argv[index + 1] }); serve(broker); }
}
module.exports = { serve, TOOL_METHODS };
```

## `core4/runtime/client-stdio.js:82–109`
Полный файл SHA256 (hex groups, concatenate) `3996fb79:0334c289:efe0ea25:626e2419:e0943290:0da46e2f:cf55000b:2998fb16`; Git blob `b743afe4:f37018b6:9db81bcc:991a3456:8621f547`. Выдержка: строки 82–109, 3091 bytes.

```javascript
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
```
