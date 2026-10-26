'use strict';
// Privileged synthetic embedding. Never imported by production stdio.
const net = require('node:net');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { environment, initialState, lifecycleFor } = require('./ae');
const { createReceiver, hash } = require('../../core/receiver-api');
const { openCompletionStore } = require('../../integrations/cep/completion-store');
const { createHostDispatcher } = require('../../integrations/cep/host-dispatcher');
const { createTransport } = require('../../integrations/cep/transport');
const { packet, createParser } = require('../../integrations/cep/wire');
function install(root, moduleIds = ['titles', 'photo-placeholder']) {
  const reviewedAdmissions = moduleIds.map(moduleId => {
    const admission = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions', moduleId + '.json')));
    return { ...admission, admissionRef: hash(admission) };
  });
  return { reviewedAdmissions, installExecutors: reviewedAdmissions.map(a => ({ moduleId: a.moduleId, operationId: a.operationId, executorHash: a.executorHash, admissionRef: a.admissionRef, source: fs.readFileSync(path.join(root, 'modules', a.moduleId, 'executor.jsx'), 'utf8') })) };
}
function vmHost({ state = initialState(), persist = () => {}, mode, delay = 0 } = {}) {
  const lifecycle = lifecycleFor(state);
  const scripts = [], counts = { evaluate: 0, native: 0 };
  const csInterface = { evalScript(script, callback) {
    scripts.push(script); counts.evaluate++;
    if (mode === 'throw') throw new Error('synthetic_eval_throw');
    const result = new vm.Script(script).runInContext(vm.createContext(environment(state, persist)), { timeout: 1000 });
    if (mode === 'missing') return;
    setTimeout(() => callback(mode === 'malformed' ? 'EvalScript error.' : result), delay);
  } };
  return { state, counts, scripts, csInterface, lifecycle };
}
async function loopback({ root, directory, state, hostOptions = {}, io, loseReply = () => false, callbackTimeout = 100 } = {}) {
  const host = vmHost({ state, ...hostOptions });
  const store = openCompletionStore({ directory, ...(io ? { io } : {}) });
  const dispatcher = createHostDispatcher({ ...install(root), csInterface: host.csInterface, callbackTimeout });
  let active, receiver, wireFrames = 0, connects = 0;
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
    socket.on('data', createParser(async request => {
      wireFrames++;
      try {
        let result;
        if (request.method === 'send') result = await receiver.receive(request.frame);
        else if (request.method === 'completion') result = receiver.completion(request.commandId);
        else throw new Error('unknown_wire_method');
        if (loseReply(request)) { socket.destroy(); return; }
        socket.write(packet({ id: request.id, result }));
      } catch (e) { if (!socket.destroyed) socket.write(packet({ id: request.id, error: e.code || e.message })); }
    }, () => socket.destroy()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const channel = { async connect(binding) {
    if (active) throw Object.assign(new Error('controller_busy'), { code: 'controller_busy' });
    const reservation = {}; active = reservation;
    connects++;
    receiver = createReceiver({ ...binding, admittedExecutors: dispatcher.admittedExecutors, evaluate: args => dispatcher.evaluate(args), completionStore: store });
    const socket = net.createConnection({ host: '127.0.0.1', port: server.address().port });
    try { await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); }); }
    catch (e) { if (active === reservation) active = undefined; throw e; }
    active = socket; const pending = new Map(); let seq = 0;
    function rejectAll() { for (const p of pending.values()) p.reject(new Error('wire_disconnected')); pending.clear(); }
    socket.on('error', rejectAll); socket.on('close', rejectAll);
    socket.on('data', createParser(response => {
      const p = pending.get(response.id); if (!p) return; pending.delete(response.id);
      if (response.error) p.reject(Object.assign(new Error(response.error), { code: response.error })); else p.resolve(response.result);
    }, e => { rejectAll(); socket.destroy(e); }));
    function request(data) {
      return new Promise((resolve, reject) => {
        if (socket.destroyed) { reject(new Error('wire_disconnected')); return; }
        const id = ++seq; pending.set(id, { resolve, reject });
        const bytes = packet({ id, ...data });
        // Deliberately fragmented header and UTF-8 payload through a real TCP socket.
        socket.write(bytes.subarray(0, 2)); socket.write(bytes.subarray(2, 7)); socket.write(bytes.subarray(7));
      });
    }
    return { receiverStoreIdentity: store.identity, send: frame => request({ method: 'send', frame }), completion: commandId => request({ method: 'completion', commandId }), async disconnect() { socket.destroy(); if (active === socket) active = undefined; } };
  } };
  const lifecycleProducer = () => host.lifecycle.snapshot().binding;
  return { host, store, dispatcher, channel, lifecycleProducer,
    transport: createTransport({ channel, lifecycleProducer }),
    get wireFrames() { return wireFrames; }, get connects() { return connects; },
    async close() { for (const socket of sockets) socket.destroy(); active?.destroy(); await new Promise(resolve => server.close(resolve)); store.close(); }
  };
}
module.exports = { install, vmHost, loopback };
