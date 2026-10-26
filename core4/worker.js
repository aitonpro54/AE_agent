'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { bounded, parse, exact, hash, fail, MAX_FRAME } = require('./protocol/json');
const { reviewCode } = require('./core/artifacts');
let buffer = ''; const loaded = new Set(); let queue = Promise.resolve();
function component(pin) {
  exact(pin, ['pin', 'path', 'manifest']);
  if (hash(pin.manifest) !== pin.pin) fail('worker_artifact_pin');
  for (const [file, digest] of Object.entries(pin.manifest.hashes)) {
    const resolved = path.resolve(pin.path, file);
    if (!resolved.startsWith(path.resolve(pin.path) + path.sep)) fail('artifact_path');
    const bytes = fs.readFileSync(resolved, 'utf8'); if (hash(bytes) !== digest) fail('worker_artifact_pin');
    if (file.endsWith('.js')) reviewCode(bytes);
  }
  loaded.add(pin.manifest.id + '@' + pin.pin);
  return require(path.join(pin.path, pin.manifest.entry));
}
async function handle(message) {
  exact(message, ['protocolVersion', 'requestId', 'workerEpoch', 'taskId', 'taskEpoch', 'method', 'componentPins', 'payload']);
  if (message.protocolVersion !== 1 || !['build', 'engine'].includes(message.method)) fail('worker_method');
  const implementation = component(message.componentPins);
  if (message.method === 'build') return implementation.build(message.payload);
  return implementation.transition(message.payload);
}
process.stdin.on('data', data => {
  buffer += data.toString('utf8'); if (Buffer.byteLength(buffer) > MAX_FRAME && !buffer.includes('\n')) process.exit(70);
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    let message; try { message = parse(line); } catch { process.exit(70); }
    queue = queue.then(async () => {
      const reply = { protocolVersion: 1, requestId: message.requestId, workerEpoch: message.workerEpoch, taskId: message.taskId, taskEpoch: message.taskEpoch };
      try { reply.result = await handle(message); } catch (e) { reply.error = { code: e.code || 'worker_job_failed', message: e.message }; }
      reply.loaded = [...loaded];
      try { process.stdout.write(bounded(reply) + '\n'); } catch { process.exit(70); }
    });
  }
});
