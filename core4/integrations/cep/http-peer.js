'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { hash, canonical, parse, bounded, exact, fail, id, dispatchBinding, decode, encode, envelope } = require('../../core/receiver-api');
const { openCompletionStore } = require('./completion-store');
const { mac, validMac, requestBody } = require('./peer-protocol');
const observationPeers = new WeakMap();
function consumeProjectObservation(peer, result) {
  const records = observationPeers.get(peer), proof = records?.get(result); records?.delete(result);
  if (!proof || hash(result) !== proof.resultHash) return null;
  const { resultHash, ...value } = proof; return Object.freeze(value);
}
const TITLES_READ_FIELDS = ['font', 'font_size', 'apply_fill', 'fill_color', 'apply_stroke', 'stroke_color', 'stroke_width', 'tracking', 'baseline_shift', 'horizontal_scale', 'vertical_scale', 'faux_bold', 'faux_italic', 'justification', 'leading', 'auto_leading'];
const TITLES_READ_CODES = new Set(['project_cas', 'comp_cas', 'layer_cas', 'unsupported_animated_text', 'unsupported_style_proof', 'unsupported_style_api', 'unsupported_mixed_style', 'unsupported_justification_enum', 'titles_native_target', 'titles_native_document', 'titles_native_text', 'titles_native_range', 'titles_native_serialization', ...TITLES_READ_FIELDS.flatMap(field => ['titles_native_' + field, 'titles_missing_' + field])]);
function titlesReadCommand(command, selected) {
  return selected?.assetKey === 'titles-current-target-v1' && selected.moduleId === 'titles-current-target' && selected.operationId === 'set-current-text' && selected.resultProfile === 'manual-text-v1' && selected.executorHash === command.executorHash && command.moduleId === selected.moduleId && command.operationId === selected.operationId && ['inspect', 'verify'].includes(command.phase);
}
function createHttpPeer({ installation, directory, asset, additionalAssets = [], port = 3457, timeout = 30000, pollTimeout = 15000, admissionGuard = () => {}, captureDeliveryGuard = () => () => {}, preboundServer, installationContext, ownerToken, workSessionId = null, startOverControl }) {
  if (workSessionId !== null && (typeof workSessionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(workSessionId))) fail('physical_work_session');
  if (typeof captureDeliveryGuard !== 'function') fail('physical_delivery_guard');
  if (startOverControl !== undefined && (typeof startOverControl?.handle !== 'function' || typeof startOverControl?.status !== 'function')) fail('start_over_control');
  if (preboundServer !== undefined) {
    const address = preboundServer instanceof http.Server && preboundServer.listening && preboundServer.address();
    if (!address || typeof address !== 'object' || address.address !== '127.0.0.1' || !Number.isSafeInteger(address.port) ||
        address.port < 1 || address.port > 65535 || preboundServer.listenerCount('request') !== 0) fail('http_prebound_server');
  }
  const server = preboundServer || http.createServer();
  const store = openCompletionStore({ directory, installationContext, ownerToken });
  const epoch = id('http'), controllerId = id('controller');
  let peer = null, pending = null, closed = false, activePoll = null, lastReadFailure = null, lastPhysicalFault = null, startOverFrozen = false;
  const challenges = new Map();
  const completedReadErrors = new WeakMap();
  const completedProjectReads = new WeakMap();
  const assets = new Map([asset, ...additionalAssets].map(a => [a.executorHash, a])); let brokerBinding;
  const pins = Object.freeze({ packageHash: installation.packageHash, executorHash: asset.executorHash, installationId: installation.installationId });
  const commandPins = command => ({ ...pins, executorHash: command.executorHash });
  function disconnect(reason) {
    if (!pending) return;
    const old = pending; pending = null; clearTimeout(old.timer);
    try { store.unknown(old.command.commandId); }
    catch (e) { lastPhysicalFault = Object.freeze({ commandId: old.command.commandId, reason, code: /^[a-z][a-z0-9_]{0,79}$/.test(e.code) ? e.code : 'physical_persist_failed', authority: false }); }
    // A persist failure must not escape a timer, retain its Promise forever or
    // masquerade as a terminal rejection. The store's fault/UNKNOWN fence stays.
    old.reject(Object.assign(new Error(reason), { code: reason }));
  }
  function frame() { return !startOverFrozen && pending && !pending.delivered ? { assetKey: assets.get(pending.command.executorHash).assetKey, phase: pending.command.phase, typedPayload: pending.command.payload, commandId: pending.command.commandId, originalBinding: pending.binding, pins: commandPins(pending.command) } : null; }
  function guardDelivery() { if (startOverFrozen) fail('start_over_frozen'); admissionGuard(pending.command); pending.deliveryGuard(); }
  function deliver() {
    if (!activePoll || !frame()) return;
    const poll = activePoll; activePoll = null;
    try { guardDelivery(); const value = frame(); pending.delivered = true; poll(value); }
    catch (e) { disconnect(e.code || 'physical_admission_closed'); poll(null); }
  }
  function status() { return { listening: server.listening, port: server.address()?.port || port, peer: peer ? { connected: Date.now() - peer.lastSeen < 45000, peerId: peer.peerId } : { connected: false }, receiverStoreIdentity: store.identity || null, storeClosed: store.closed, storeFault: store.fault, pending: pending ? { commandId: pending.command.commandId, delivered: pending.delivered } : null, lastReadFailure, lastPhysicalFault, startOverFrozen, unknown: store.closed, automaticLifecycle: 'unavailable', externalLegacyCoverage: 'unobserved' }; }
  function reply(res, statusCode, value, origin) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) }); res.end(bounded(value));
  }
  server.on('request', async (req, res) => {
    const origin = req.headers.origin;
    let corsOrigin;
    try {
      if (closed || req.headers.host !== '127.0.0.1:' + server.address().port || req.socket.remoteAddress !== '127.0.0.1') fail('loopback_host_required');
      // Package-owned CEP file origins. They are accepted only with fresh role-secret MAC;
      // never wildcard CORS, cookies, unauthenticated status or source ingress.
      if ((origin !== 'null' && origin !== 'file://') || req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'origin').length !== 1) fail('cep_origin_required');
      corsOrigin = origin;
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': corsOrigin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }); res.end(); return; }
      if (req.method !== 'POST') fail('post_required');
      let bytes = 0, chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 256 * 1024) fail('frame_too_large'); chunks.push(chunk); }
      const input = parse(Buffer.concat(chunks));
      if (startOverControl && req.url.startsWith('/start-over/')) {
        const value = await startOverControl.handle(req.url, input, corsOrigin); if (value === null) fail('unknown_peer_route'); reply(res, 200, value, corsOrigin); return;
      }
      if (req.url === '/challenge') {
        exact(input, ['role']); if (!['panel', 'control'].includes(input.role)) fail('role_required');
        for (const [key, c] of challenges) if (Date.now() - c.time > 10000) challenges.delete(key);
        if (challenges.size >= 16) fail('challenge_backpressure');
        const nonce = crypto.randomBytes(32).toString('hex'); const value = { nonce, epoch, role: input.role, origin: corsOrigin, ...pins, controllerId };
        challenges.set(nonce, { value, time: Date.now() }); reply(res, 200, value, corsOrigin); return;
      }
      if (req.url === '/link') {
        exact(input, ['challenge', 'peerId', 'proof']); const challenge = challenges.get(input.challenge?.nonce); challenges.delete(input.challenge?.nonce);
        const role = challenge?.value.role, secret = role === 'panel' ? installation.panelToken : installation.controlToken;
        if (!challenge || origin !== challenge.value.origin || Date.now() - challenge.time > 10000 || canonical(input.challenge) !== canonical(challenge.value) || typeof input.peerId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.peerId) || !validMac({ challenge: input.challenge, peerId: input.peerId }, input.proof, secret)) fail('peer_auth');
        if (role !== 'panel') fail('panel_role_required');
        if (peer && (Date.now() - peer.lastSeen < 45000 || pending)) fail('duplicate_peer');
        peer = { peerId: input.peerId, origin: challenge.value.origin, sequence: 0, lastSeen: Date.now() };
        const body = { linked: true, epoch, peerId: peer.peerId, controllerId, pins, receiverStoreIdentity: store.identity, laneClosed: store.closed, ...(startOverControl ? { workSessionId, startOver: startOverControl.status() } : {}) };
        reply(res, 200, { body, mac: mac(body, secret) }, corsOrigin); return;
      }
      exact(input, ['body', 'mac']); const b = requestBody(input.body);
      if (!peer || origin !== peer.origin || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, installation.panelToken)) fail('peer_auth_or_replay');
      peer.sequence = b.sequence; peer.lastSeen = Date.now();
      function signed(payload) { const body = { epoch, peerId: peer.peerId, sequence: b.sequence, payload }; reply(res, 200, { body, mac: mac(body, installation.panelToken) }, corsOrigin); }
      if (req.url === '/poll') {
        exact(b.payload, []); if (activePoll) fail('concurrent_poll');
        if (startOverFrozen) { signed({ command: null }); return; }
        if (pending && !pending.delivered) { try { guardDelivery(); } catch (e) { disconnect(e.code || 'physical_admission_closed'); throw e; } }
        if (frame()) { const value = frame(); pending.delivered = true; signed({ command: value }); return; }
        await new Promise(resolve => {
          const timer = setTimeout(() => { if (activePoll === finish) activePoll = null; signed({ command: null }); resolve(); }, pollTimeout);
          const finish = value => { clearTimeout(timer); signed({ command: value }); resolve(); };
          activePoll = finish;
          res.on('close', () => { if (activePoll === finish) { activePoll = null; clearTimeout(timer); resolve(); } });
        }); return;
      }
      if (req.url === '/complete') {
        exact(b.payload, ['commandId', 'originalBinding', 'pins', 'result']);
        const c = store.get(b.payload.commandId);
        // Current-channel MAC/Origin/sequence already passed above. Historical
        // pins/result come only from a fixed verified disposition, before the
        // normal current-package correlation. No promotion/event/eval occurs.
        if (c?.state === 'unknown' && c.terminalDisposition) {
          if (canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(c.terminalDisposition.pins) !== canonical(b.payload.pins) || canonical(c.terminalDisposition.result) !== canonical(b.payload.result)) fail('historical_completion_correlation');
          signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return;
        }
        if (!c || canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(b.payload.pins) !== canonical(commandPins(c.command))) fail('completion_correlation');
        if (c.state === 'completed') { if (canonical(c.response.result) !== canonical(b.payload.result)) fail('completion_conflict'); signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return; }
        if (!pending || c.state !== 'ongoing' || !pending.delivered || pending.command.commandId !== b.payload.commandId) fail('unknown_no_promotion');
        const result = b.payload.result;
        const selectedAsset = assets.get(c.command.executorHash);
        if (result.readFailureVersion === 1) {
          exact(result, ['readFailureVersion', 'outcome', 'code']);
          if (result.outcome !== 'rejected' || !['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable'].includes(result.code) && !(titlesReadCommand(c.command, selectedAsset) && TITLES_READ_CODES.has(result.code))) fail('inspection_result');
        } else if (selectedAsset.resultProfile === 'manual-text-v1') {
          if (c.command.phase === 'mutate') {
            exact(result, ['outcome', 'snapshot', 'code', 'transactionReceipt']);
            if (result.outcome === 'unknown') { disconnect('manual_effect_unknown'); fail('manual_effect_unknown'); }
            if (!['applied', 'rejected'].includes(result.outcome)) fail('manual_result');
          } else { exact(result, ['target', 'revision', 'text', 'protected']); if (!result.target || typeof result.revision !== 'string' || typeof result.text !== 'string' || typeof result.protected !== 'string') fail('manual_snapshot'); }
        } else {
          // Private asset-selected versioned observation profile. No caller chooses
          // the validator and no lifecycle/session is manufactured for discovery.
          exact(result, ['observationVersion', 'target', 'project', 'compositions', 'layers', 'truncated', 'aeVersion']);
          if (result.observationVersion !== 1 || !result.target || !result.project || !Array.isArray(result.compositions) || result.compositions.length > 50 || !Array.isArray(result.layers) || result.layers.length > 100 || typeof result.truncated !== 'boolean' || typeof result.aeVersion !== 'string') fail('inspection_result');
          exact(result.target, ['projectId', 'compId']); exact(result.project, ['name', 'numItems', 'saved']);
          if (result.target.projectId !== null && typeof result.target.projectId !== 'string' || result.target.compId !== null && (!Number.isSafeInteger(result.target.compId) || result.target.compId < 1) || typeof result.project.name !== 'string' || !Number.isSafeInteger(result.project.numItems) || result.project.numItems < 0 || typeof result.project.saved !== 'boolean') fail('inspection_result');
          for (const item of result.compositions) { exact(item, ['compId', 'name', 'numLayers', 'duration']); if (!Number.isSafeInteger(item.compId) || item.compId < 1 || typeof item.name !== 'string' || !Number.isSafeInteger(item.numLayers) || item.numLayers < 0 || typeof item.duration !== 'number' || item.duration < 0) fail('inspection_result'); }
          for (const item of result.layers) { exact(item, ['layerId', 'index', 'name', 'textLayer']); if (!Number.isSafeInteger(item.layerId) || item.layerId < 1 || !Number.isSafeInteger(item.index) || item.index < 1 || typeof item.name !== 'string' || typeof item.textLayer !== 'boolean') fail('inspection_result'); }
        }
        const response = { protocolVersion: 1, commandId: c.command.commandId, executorHash: c.command.executorHash, payloadHash: c.command.payloadHash, result }; store.complete(b.payload.commandId, response);
        // One bounded observation of an already durable, authenticated completion.
        // It is not evidence/grant or a statement about current runtime/history.
        if (result.readFailureVersion === 1 && ['inspect', 'verify'].includes(c.command.phase)) lastReadFailure = Object.freeze({ commandId: c.command.commandId, moduleId: c.command.moduleId, phase: c.command.phase, executorHash: c.command.executorHash, code: result.code, authority: false });
        const done = pending; pending = null; clearTimeout(done.timer);
        signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } });
        if (result.readFailureVersion === 1) {
          const error = Object.assign(new Error(result.code), { code: result.code });
          // Only this exact direct read, after store.complete has durably returned.
          // Serialized errors, Broker reads and other assets cannot mint this proof.
          if (!done.broker && selectedAsset === asset && asset.assetKey === 'project-inspection-v1' && c.command.moduleId === 'project-inspection' && c.command.operationId === 'inspect' && c.command.phase === 'inspect') {
            completedReadErrors.set(error, Object.freeze({ code: result.code, commandId: c.command.commandId, executorHash: c.command.executorHash, payloadHash: c.command.payloadHash }));
          }
          done.reject(error);
        } else {
          const value = done.broker ? response : { observation: result, originalBinding: c.originalBinding, pins: commandPins(c.command), continuity: false };
          if (!done.broker && result.observationVersion === 1 && selectedAsset === asset && asset.assetKey === 'project-inspection-v1' && c.command.moduleId === 'project-inspection' && c.command.operationId === 'inspect' && c.command.phase === 'inspect') {
            completedProjectReads.set(value, Object.freeze({ sessionId: workSessionId, commandId: c.command.commandId, executorHash: c.command.executorHash, payloadHash: c.command.payloadHash, receiverStoreIdentity: c.originalBinding.receiverStoreIdentity, observationHash: hash(result), channelEpoch: epoch, resultHash: hash(value) }));
          }
          done.resolve(value);
        }
        return;
      }
      fail('unknown_peer_route');
    } catch (e) { reply(res, e.code === 'frame_too_large' ? 413 : 403, { error: e.code || 'peer_request_failed' }, corsOrigin); }
  });
  function submit(command, broker = false) {
    if (startOverFrozen) fail('start_over_frozen');
    const selected = assets.get(command.executorHash);
    if (!selected || selected.moduleId && (selected.moduleId !== command.moduleId || selected.operationId !== command.operationId) || !['inspect', 'mutate', 'verify'].includes(command.phase) || command.phase !== 'inspect' && selected.resultProfile !== 'manual-text-v1') fail('http_asset_not_admitted');
    const deliveryGuard = captureDeliveryGuard(command);
    if (typeof deliveryGuard !== 'function') fail('physical_delivery_guard');
    admissionGuard(command); deliveryGuard();
    if (closed || store.closed) fail('receiver_lane_closed'); if (!peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); if (pending) fail('physical_lane_pending');
    const binding = dispatchBinding(command, store.identity); store.begin(command, binding);
    return new Promise((resolve, reject) => { pending = { command, binding, deliveryGuard, resolve, reject, broker, delivered: false, timer: setTimeout(() => disconnect('host_callback_timeout'), timeout) }; deliver(); });
  }
  const api = Object.freeze({
    status,
    // B3 has a stronger physical fence than normal maintenance drain. This
    // synchronous private switch covers previously accepted, undelivered work.
    // Already delivered native callbacks may still settle in the OLD journal;
    // timeout/UNKNOWN and real process death remain authoritative.
    fenceForStartOver() {
      startOverFrozen = true;
      if (activePoll) { const poll = activePoll; activePoll = null; poll(null); }
    },
    consumeReadRejection(error) {
      const record = completedReadErrors.get(error); completedReadErrors.delete(error); return record || null;
    },
    identity: hash({ packageHash: installation.packageHash, assets: [...assets.values()] }),
    transport: Object.freeze({
      async connect(value) { if (store.closed || !peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); exact(value, ['controllerId', 'channelEpoch', 'secret']); brokerBinding = Object.freeze({ ...value }); return { receiverStoreIdentity: store.identity }; },
      async send(frame) { if (!brokerBinding) fail('transport_disconnected'); const command = envelope(decode(frame, brokerBinding.secret)); if (command.controllerId !== brokerBinding.controllerId || command.channelEpoch !== brokerBinding.channelEpoch) fail('controller_binding'); return encode(await submit(command, true), brokerBinding.secret); },
      async completion(commandId) { if (!brokerBinding) fail('transport_disconnected'); const c = store.get(commandId); return encode({ commandId, state: c?.state || 'unknown', ...(c?.originalBinding ? { originalBinding: c.originalBinding } : {}), ...(c?.response ? { response: c.response } : {}) }, brokerBinding.secret); },
      async disconnect() { if (pending) fail('physical_lane_pending'); brokerBinding = undefined; }
    }),
    async listen() {
      if (preboundServer) { if (!server.listening) fail('http_prebound_server'); return status(); }
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return status();
    },
    inspect(payload = {}) {
      exact(payload, ['compId']); if (payload.compId !== undefined && (!Number.isSafeInteger(payload.compId) || payload.compId < 1)) fail('invalid_comp_id');
      const command = { protocolVersion: 1, controllerId, channelEpoch: epoch, commandId: id('inspect'), moduleId: 'project-inspection', operationId: 'inspect', executorHash: asset.executorHash, phase: 'inspect', payloadHash: hash(canonical(payload)), payload };
      return submit(command);
    },
    async close() { closed = true; disconnect('runtime_closed'); if (activePoll) { const poll = activePoll; activePoll = null; poll(null); } await new Promise(resolve => server.close(resolve)); store.close(); }
  });
  observationPeers.set(api, completedProjectReads); return api;
}
module.exports = { createHttpPeer, consumeProjectObservation };
