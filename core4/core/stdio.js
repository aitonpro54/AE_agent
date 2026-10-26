'use strict';
const readline = require('node:readline');
const { Broker } = require('./broker');
const { parse, bounded, exact, fail, MAX_FRAME } = require('../protocol/json');
const TOOL_METHODS = Object.freeze({ core_status: 'status', core_connect: 'connect', core_disconnect: 'disconnect', core_diagnostics: 'diagnostics', list_modules: 'listModules', get_module_contract: 'getContract', inspect_module_target: 'inspect', build_solution_plan: 'build', propose_plan: 'propose', dry_run_plan: 'dryrun', run_plan: 'run', get_task: 'getTask', reset_task: 'reset', reconcile_task: 'reconcile' });
function serve(broker, input = process.stdin, output = process.stdout) {
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
      if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'ae-agent-core4', version: '4.0.0-m1' } };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools: Object.keys(TOOL_METHODS).map(name => ({ name, description: 'Core4 bounded generic operation; no live fallback', inputSchema: { type: 'object', properties: { payload: { type: 'object', additionalProperties: true } }, additionalProperties: false } })) };
      else if (request.method === 'tools/call') {
        exact(request.params, ['name', 'arguments']); const method = TOOL_METHODS[request.params.name]; if (!method) fail('unknown_tool');
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
