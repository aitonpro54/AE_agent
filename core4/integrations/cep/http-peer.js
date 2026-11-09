'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
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
const SAVE_READ_CODES = new Set(['save_project_changed', 'save_revision_unavailable', 'save_dirty_unavailable', 'save_file_unavailable']);
const LIFECYCLE_READ_CODES = new Set(['lifecycle_project_changed', 'lifecycle_native_state']);
const OVERLAY_PREFLIGHT_READ_CODES = new Set(['layer_overlay_layer_profile', 'layer_overlay_expression_scope', 'layer_overlay_existing_or_partial']);
const OVERLAY_DIAGNOSTIC_ROOTS = new Set(['layer', 'ADBE Transform Group', 'ADBE Text Properties', 'ADBE Root Vectors Group',
  'ADBE Camera Options Group', 'ADBE Light Options Group', 'ADBE Marker', 'ADBE Time Remapping', 'ADBE Audio Group',
  'ADBE Layer Overrides', 'ADBE Layer Styles', 'ADBE Blend Options Group', 'ADBE Material Options Group',
  'ADBE Plane Options Group', 'ADBE Extrsn Options Group']);
const MEDIA_DIAGNOSTIC_FIELDS = new Map([
  ['item_count', []],
  ['field_units', ['itemIndex', 'nameUnits', 'fileUnits']],
  ['inventory_bytes', ['itemIndex', 'inventoryBytes']],
  ['snapshot_bytes', ['snapshotBytes']],
  ['prospect_capacity', ['snapshotBytes', 'projectedSnapshotBytes', 'escapedInventoryBytes', 'projectedIntentBytes']]
]);
function montagePreflight(command) {
  return command.phase === 'inspect' && (command.moduleId === 'media-import' && command.payload.file === undefined ||
    command.moduleId === 'layer-overlay' && command.payload.itemId === undefined);
}
function validateMontageDiagnostic(command, selected, { code, diagnostic }) {
  if (!montagePreflight(command) || !selected || selected.moduleId !== command.moduleId ||
      selected.operationId !== command.operationId || selected.executorHash !== command.executorHash ||
      !diagnostic || diagnostic.version !== 1) fail('inspection_result');
  const uint = (value, min = 0, max = 2147483647) => Number.isSafeInteger(value) && value >= min && value <= max;
  if (selected.assetKey === 'media-import-v1' && selected.moduleId === 'media-import' &&
      selected.operationId === 'ingest-footage' && selected.resultProfile === 'media-import-v1' && code === 'inspection_result_budget') {
    const { stage, itemCount, itemIndex, nameUnits, fileUnits, inventoryBytes, snapshotBytes,
      projectedSnapshotBytes, escapedInventoryBytes, projectedIntentBytes } = diagnostic;
    const fields = MEDIA_DIAGNOSTIC_FIELDS.get(stage);
    if (!fields) fail('inspection_result');
    exact(diagnostic, ['version', 'stage', 'itemCount', ...fields]);
    if (!uint(itemCount, stage === 'item_count' ? 2049 : 0, stage === 'item_count' ? 2147483647 : 2048) ||
        fields.some(field => !uint(diagnostic[field]))) fail('inspection_result');
    if ((stage === 'field_units' || stage === 'inventory_bytes') && !uint(itemIndex, 1, itemCount) ||
        stage === 'field_units' && nameUnits <= 512 && fileUnits <= 512 ||
        stage === 'inventory_bytes' && inventoryBytes <= 96 * 1024 ||
        stage === 'snapshot_bytes' && snapshotBytes <= 96 * 1024 ||
        stage === 'prospect_capacity' && (snapshotBytes > 96 * 1024 || projectedSnapshotBytes !== snapshotBytes + 8192 ||
          projectedIntentBytes !== projectedSnapshotBytes + 2 * escapedInventoryBytes ||
          itemCount < 2048 && projectedSnapshotBytes <= 84 * 1024 && projectedIntentBytes <= 224 * 1024)) fail('inspection_result');
    return;
  }
  if (selected.assetKey !== 'layer-overlay-v1' || selected.moduleId !== 'layer-overlay' ||
      selected.operationId !== 'duplicate-and-replace-still' || selected.resultProfile !== 'layer-overlay-v1' ||
      code !== 'layer_overlay_expression_scope') fail('inspection_result');
  exact(diagnostic, ['version', 'projectRevision', 'compId', 'layerId', 'root', 'propertyIndices', 'cause', 'expressionUnits']);
  const { projectRevision, compId, layerId, root, propertyIndices, cause, expressionUnits } = diagnostic;
  if (!uint(projectRevision, 0, Number.MAX_SAFE_INTEGER) || !uint(compId, 1) || !uint(layerId, 1) ||
      !OVERLAY_DIAGNOSTIC_ROOTS.has(root) || !Array.isArray(propertyIndices) ||
      propertyIndices.length > (root === 'layer' ? 32 : 31) || propertyIndices.some(index => !uint(index, 1, 100000)) ||
      !['unsupported_expression', 'expression_unavailable'].includes(cause) || !uint(expressionUnits) ||
      cause === 'expression_unavailable' && expressionUnits !== 0) fail('inspection_result');
}
function validateMediaSnapshot(snapshot, preflight, mutation = false) {
  exact(snapshot, ['target', 'revision', 'protected', 'inventory', ...(preflight ? [] : ['bytes', 'modifiedMs']),
    ...(mutation ? ['createdItemId'] : [])]);
  if (!snapshot.target || typeof snapshot.revision !== 'string' || typeof snapshot.protected !== 'string' ||
      !preflight && (!Number.isSafeInteger(snapshot.bytes) || !Number.isSafeInteger(snapshot.modifiedMs)) ||
      mutation && (!Number.isSafeInteger(snapshot.createdItemId) || snapshot.createdItemId < 1) ||
      Buffer.byteLength(canonical(snapshot)) > 96 * 1024) fail('manual_snapshot');
  // Only the selected media profile has this optional package dependency.
  require('../../runtime/media-layer-proof').decodeMediaInventory(snapshot.inventory);
}
function titlesReadCommand(command, selected) {
  return selected?.assetKey === 'titles-current-target-v1' && selected.moduleId === 'titles-current-target' && selected.operationId === 'set-current-text' && selected.resultProfile === 'manual-text-v1' && selected.executorHash === command.executorHash && command.moduleId === selected.moduleId && command.operationId === selected.operationId && ['inspect', 'verify'].includes(command.phase);
}
function manualResultProfile(asset) { return ['manual-text-v1', 'photo-source-v1', 'manual-point-layout-v1', 'owned-text-layer-v1', 'owned-text-variant-v1', 'owned-comp-render-v1', 'owned-project-assembly-v1', 'current-project-save-v1', 'project-lifecycle-v1', 'media-import-v1', 'layer-insert-v1', 'layer-overlay-v1', 'comp-frame-export-v1'].includes(asset.resultProfile); }
function nativeFileResult(result, phase) {
  if (phase === 'mutate' && result.outcome !== 'applied') return result;
  const { savedFileSha256, checkpointRoot, checkpoint, transition, diskProofError, ...snapshot } = phase === 'mutate' ? result.snapshot : result;
  return phase === 'mutate' ? { ...result, snapshot } : snapshot;
}
function observedOpen(command, result) {
  const { action, projectId, sessionId, destination } = command.payload;
  const snapshot = result.snapshot;
  const key = file => file.replace(/\\/g, '/').toLowerCase();
  if (action !== 'open' || typeof destination !== 'string' || result.outcome !== 'applied' || !snapshot ||
      !snapshot.target || canonical(snapshot.target) !== canonical({ projectId, sessionId }) ||
      snapshot.protected !== projectId || typeof snapshot.currentProject !== 'string' ||
      snapshot.currentProject.length > 512 || key(snapshot.currentProject) !== key(destination) ||
      typeof snapshot.dirty !== 'boolean') return {};
  return { openObservation: Object.freeze({ currentProject: snapshot.currentProject, dirty: snapshot.dirty, diskVerified: false }) };
}
function validateInspectionLayer(item, includeContext) {
  exact(item, ['layerId', 'index', 'name', 'textLayer', ...(includeContext ? ['context'] : [])]);
  if (!Number.isSafeInteger(item.layerId) || item.layerId < 1 || !Number.isSafeInteger(item.index) ||
      item.index < 1 || typeof item.name !== 'string' || typeof item.textLayer !== 'boolean') fail('inspection_result');
  if (!includeContext) return;
  const context = item.context;
  exact(context, ['sourceId', 'enabled', 'solo', 'guideLayer', 'inPoint', 'outPoint', 'stretch', 'timeRemapEnabled']);
  if (context.sourceId !== null && (!Number.isSafeInteger(context.sourceId) || context.sourceId < 1) ||
      ['enabled', 'solo', 'guideLayer', 'timeRemapEnabled'].some(key => context[key] !== null && typeof context[key] !== 'boolean') ||
      ['inPoint', 'outPoint', 'stretch'].some(key => context[key] !== null && !Number.isFinite(context[key]))) fail('inspection_result');
}
function validateInspectionCoverage(result, payload) {
  const uint = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
  const { dirty, projectRevision, activeComp, coverage } = result;
  if ((dirty !== null && typeof dirty !== 'boolean') || (projectRevision !== null && !uint(projectRevision))) fail('inspection_result');
  if (activeComp !== null) {
    exact(activeComp, ['compId', 'time', 'workAreaStart', 'workAreaDuration']);
    if (!uint(activeComp.compId, 1) || ['time', 'workAreaStart', 'workAreaDuration'].some(key => activeComp[key] !== null && !Number.isFinite(activeComp[key]))) fail('inspection_result');
  }
  exact(coverage, ['lookup', 'inventory', 'layers', 'displayNamesShortened']);
  const { lookup, inventory, layers, displayNamesShortened } = coverage;
  exact(lookup, ['compId', 'status', 'method']);
  exact(inventory, ['status', 'startItemIndex', 'throughItemIndex', 'itemsScanned', 'nextCursor']);
  exact(layers, ['total', 'returned']);
  const { status, startItemIndex: start, throughItemIndex: through, itemsScanned, nextCursor } = inventory;
  const total = result.project.numItems;
  if (!['complete', 'more', 'revision_unavailable', 'cursor_stale', 'scan_incomplete'].includes(status) ||
      !uint(itemsScanned) || itemsScanned > 500 || !uint(layers.total) || layers.returned !== result.layers.length ||
      layers.returned > layers.total || result.layers.some((layer, i) => layer.index !== i + 1) || typeof displayNamesShortened !== 'boolean') fail('inspection_result');
  if (status === 'cursor_stale') {
    if (payload.cursor === undefined || start !== null || through !== null || itemsScanned !== 0 || result.compositions.length !== 0) fail('inspection_result');
  } else if (!uint(start, payload.cursor === undefined ? 1 : 2) || (payload.cursor === undefined && start !== 1) ||
      !uint(through) || through < start - 1 || start - 1 + itemsScanned > total || through > start - 1 + itemsScanned ||
      result.compositions.length > through - start + 1 || (status === 'complete') !== (through === total) ||
      (status === 'revision_unavailable' && projectRevision !== null)) fail('inspection_result');
  if (status === 'more' ? projectRevision === null || typeof nextCursor !== 'string' || nextCursor.length < 1 || nextCursor.length > 96 : nextCursor !== null) fail('inspection_result');
  if (lookup.compId !== (payload.compId ?? null) || !['not_requested', 'found', 'not_found', 'scan_incomplete'].includes(lookup.status) ||
      (lookup.status === 'not_requested') !== (payload.compId === undefined) ||
      (['found', 'not_found'].includes(lookup.status) ? !['item_by_id', 'page_scan'].includes(lookup.method) || status === 'cursor_stale' : lookup.method !== 'none') ||
      (lookup.status === 'found' ? result.target.compId !== lookup.compId : result.target.compId !== null || layers.total !== 0) ||
      (lookup.status === 'not_found' && lookup.method === 'page_scan' && (start !== 1 || itemsScanned !== total))) fail('inspection_result');
  if (result.truncated !== (displayNamesShortened || status !== 'complete' || layers.returned < layers.total)) fail('inspection_result');
}
function createHttpPeer({ installation, directory, asset, additionalAssets = [], observeProjectSave, observeProjectLifecycle, assertMediaSourceLock, port = 3457, timeout = 30000, projectOpenTimeout, directReadDrainMs = 0, pollTimeout = 15000, admissionGuard = () => {}, captureDeliveryGuard = () => () => {}, requireMutationGuard = false, preboundServer, installationContext, ownerToken, workSessionId = null, startOverControl }) {
  if (workSessionId !== null && (typeof workSessionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(workSessionId))) fail('physical_work_session');
  if (typeof captureDeliveryGuard !== 'function') fail('physical_delivery_guard');
  if (!Number.isSafeInteger(directReadDrainMs) || directReadDrainMs < 0 || directReadDrainMs > 10000) fail('physical_drain_window');
  if (projectOpenTimeout !== undefined && (!Number.isSafeInteger(projectOpenTimeout) || projectOpenTimeout <= timeout || projectOpenTimeout >= 120000)) fail('project_open_callback_timeout');
  if (startOverControl !== undefined && (typeof startOverControl?.handle !== 'function' || typeof startOverControl?.status !== 'function')) fail('start_over_control');
  if (preboundServer !== undefined) {
    const address = preboundServer instanceof http.Server && preboundServer.listening && preboundServer.address();
    if (!address || typeof address !== 'object' || address.address !== '127.0.0.1' || !Number.isSafeInteger(address.port) ||
        address.port < 1 || address.port > 65535 || preboundServer.listenerCount('request') !== 0) fail('http_prebound_server');
  }
  const server = preboundServer || http.createServer();
  const store = openCompletionStore({ directory, installationContext, ownerToken });
  const epoch = id('http'), controllerId = id('controller');
  let peer = null, pending = null, closed = false, activePoll = null, lastReadFailure = null, lastPhysicalFault = null, lastCommandOutcome = null, startOverFrozen = false;
  const challenges = new Map();
  const completedReadErrors = new WeakMap();
  const completedProjectReads = new WeakMap();
  const assets = new Map([asset, ...additionalAssets].map(a => [a.executorHash, a])); let brokerBinding;
  if ([...assets.values()].some(a => a.resultProfile === 'current-project-save-v1') && typeof observeProjectSave !== 'function') fail('save_disk_observer_required');
  if ([...assets.values()].some(a => a.resultProfile === 'project-lifecycle-v1') && typeof observeProjectLifecycle !== 'function') fail('lifecycle_disk_observer_required');
  const pins = Object.freeze({ packageHash: installation.packageHash, executorHash: asset.executorHash, installationId: installation.installationId });
  const commandPins = command => ({ ...pins, executorHash: command.executorHash });
  function commandOutcome(entry, stage, details = {}) {
    return Object.freeze({ commandId: entry.command.commandId, moduleId: entry.command.moduleId, phase: entry.command.phase, effect: entry.effect,
      stage, intentRecorded: true, handoff: entry.delivered ? 'offered' : 'none', nativeStart: entry.delivered ? 'unknown' : 'not_started',
      queue: 'busy', terminalReceipt: null, ...details });
  }
  function rejectCaller(entry, code, physical) {
    if (entry.callerSettled) return;
    entry.callerSettled = true;
    const error = Object.assign(new Error(code), { code });
    const layerBudgetRead = entry.command.phase === 'inspect' && entry.command.moduleId === 'layer-insert' && code === 'inspection_result_budget';
    if (physical && (entry.directRead || physical.stage === 'terminal' && (montagePreflight(entry.command) || layerBudgetRead))) completedReadErrors.set(error, Object.freeze({ code, commandId: entry.command.commandId,
      executorHash: entry.command.executorHash, payloadHash: entry.command.payloadHash, physical }));
    entry.reject(error);
  }
  function noteFault(entry, reason, error) {
    lastPhysicalFault = Object.freeze({ commandId: entry.command.commandId, reason,
      code: /^[a-z][a-z0-9_]{0,79}$/.test(error.code) ? error.code : 'physical_persist_failed', authority: false });
  }
  function disconnect(reason, diagnostics = {}) {
    if (!pending) return;
    const old = pending;
    try { store.unknown(old.command.commandId); }
    catch (e) { noteFault(old, reason, e); }
    lastCommandOutcome = commandOutcome(old, 'unknown', { code: reason, queue: 'fenced', ...diagnostics });
    pending = null; clearTimeout(old.timer);
    // A persist failure must not escape a timer, retain its Promise forever or
    // masquerade as a terminal rejection. The store's fault/UNKNOWN fence stays.
    rejectCaller(old, reason, lastCommandOutcome);
  }
  function abandonBeforeHandoff(reason) {
    const old = pending;
    if (!old.directRead || old.delivered || closed || startOverFrozen) { disconnect(reason); return; }
    const code = 'inspection_not_dispatched';
    // Node owns the only producer of a command frame. This branch has never
    // offered one, and remains synchronous until the terminal record is fsynced.
    try {
      const result = { notDispatchedVersion: 1, outcome: 'rejected', code };
      const recordHash = store.complete(old.command.commandId, completionResponse(old.command, result));
      lastCommandOutcome = commandOutcome(old, 'not_dispatched', { code, reason, queue: 'idle',
        terminalReceipt: Object.freeze({ source: 'receiver', receiptRef: old.binding.receiptRef, recordHash }) });
    } catch (e) { noteFault(old, reason, e); disconnect(reason); return; }
    pending = null; clearTimeout(old.timer);
    rejectCaller(old, code, lastCommandOutcome);
  }
  function expirePending() {
    if (!pending || performance.now() < pending.deadline) return;
    const entry = pending;
    if (!entry.delivered) { abandonBeforeHandoff('host_callback_timeout'); return; }
    if (!entry.directRead || startOverFrozen || performance.now() >= entry.drainDeadline) { disconnect('host_callback_timeout'); return; }
    if (entry.callerSettled) return;
    lastCommandOutcome = commandOutcome(entry, 'draining', { code: 'inspection_callback_pending', drainDeadlineAt: entry.drainDeadlineAt });
    rejectCaller(entry, 'inspection_callback_pending', lastCommandOutcome);
    armDeadline(entry, entry.drainDeadline);
  }
  function armDeadline(entry, deadline) {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      if (pending !== entry) return;
      if (performance.now() < deadline) { armDeadline(entry, deadline); return; }
      expirePending();
    }, Math.max(1, Math.ceil(deadline - performance.now())));
  }
  function completionResponse(command, result) { return { protocolVersion: 1, commandId: command.commandId, executorHash: command.executorHash, payloadHash: command.payloadHash, result }; }
  function frame() { return !startOverFrozen && pending && !pending.delivered ? { assetKey: assets.get(pending.command.executorHash).assetKey, phase: pending.command.phase, typedPayload: pending.command.payload, commandId: pending.command.commandId, originalBinding: pending.binding, pins: pending.pins } : null; }
  function guardDelivery() { if (startOverFrozen) fail('start_over_frozen'); admissionGuard(pending.command); pending.deliveryGuard(); }
  function handoff(poll, immediate = false) {
    expirePending();
    if (!frame() || poll.peer !== pending.peer || !poll.open()) return null;
    try { guardDelivery(); }
    catch (e) {
      const direct = pending.directRead;
      abandonBeforeHandoff(e.code || 'physical_admission_closed');
      if (!direct && immediate) throw e;
      return null;
    }
    expirePending();
    return poll.open() ? frame() : null;
  }
  function finishPoll(poll, command = null) {
    const entry = command ? pending : null;
    try {
      poll.finish(command, entry && (() => {
        expirePending();
        if (pending !== entry || !poll.open()) return false;
        if (entry.offer) {
          try { guardDelivery(); entry.offer.assert(); }
          catch (error) { abandonBeforeHandoff(error.code || 'physical_admission_closed'); return false; }
          expirePending();
          if (pending !== entry || !poll.open()) return false;
        }
        // Mark before the first write. Bytes offered to HTTP do not prove
        // receipt, evalScript or start, including when the write throws.
        entry.delivered = true;
        return true;
      }));
    } catch {
      if (entry && pending === entry) abandonBeforeHandoff('poll_response_failed');
      poll.abort();
    }
  }
  function flushPoll() {
    if (!activePoll) return;
    const poll = activePoll; activePoll = null;
    finishPoll(poll);
  }
  function deliver() {
    if (!activePoll || !frame()) return;
    const poll = activePoll; activePoll = null;
    finishPoll(poll, handoff(poll));
  }
  function status() { return { listening: server.listening, port: server.address()?.port || port, peer: peer ? { connected: Date.now() - peer.lastSeen < 45000, peerId: peer.peerId, origin: peer.origin } : { connected: false, origin: null }, receiverStoreIdentity: store.identity || null, storeClosed: store.closed, storeFault: store.fault, pending: pending ? { ...commandOutcome(pending, pending.callerSettled ? 'draining' : pending.delivered ? 'handed_to_poll' : 'queued'), delivered: pending.delivered, ...(pending.callerSettled ? { drainDeadlineAt: pending.drainDeadlineAt } : {}) } : null, lastReadFailure, lastPhysicalFault, lastCommandOutcome, startOverFrozen, unknown: store.closed, automaticLifecycle: 'unavailable', externalLegacyCoverage: 'unobserved' }; }
  function reply(res, statusCode, value, origin, beforeWrite) {
    if (res.destroyed || res.writableEnded) return false;
    const body = bounded(value);
    if (beforeWrite && !beforeWrite()) return false;
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) }); res.end(body);
    return true;
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
        expirePending();
        if (peer && (Date.now() - peer.lastSeen < 45000 || pending)) fail('duplicate_peer');
        flushPoll();
        peer = { peerId: input.peerId, origin: challenge.value.origin, sequence: 0, lastSeen: Date.now(), identity: Object.freeze({}) };
        const body = { linked: true, epoch, peerId: peer.peerId, controllerId, pins, receiverStoreIdentity: store.identity, laneClosed: store.closed, ...(startOverControl ? { workSessionId, startOver: startOverControl.status() } : {}) };
        reply(res, 200, { body, mac: mac(body, secret) }, corsOrigin); return;
      }
      exact(input, ['body', 'mac']); const b = requestBody(input.body);
      if (!peer || origin !== peer.origin || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, installation.panelToken)) fail('peer_auth_or_replay');
      peer.sequence = b.sequence; peer.lastSeen = Date.now();
      function signed(payload, beforeWrite) { const body = { epoch, peerId: b.peerId, sequence: b.sequence, payload }; return reply(res, 200, { body, mac: mac(body, installation.panelToken) }, corsOrigin, beforeWrite); }
      if (req.url === '/poll') {
        exact(b.payload, []); if (activePoll) fail('concurrent_poll');
        expirePending();
        const open = () => !req.aborted && !res.destroyed && !res.writableEnded;
        const poll = { peer, open, abort: () => res.destroy(), finish(command, beforeWrite) {
          if (!signed({ command }, beforeWrite) && command && open()) signed({ command: null });
        } };
        if (startOverFrozen || pending?.delivered) { finishPoll(poll); return; }
        if (frame()) { finishPoll(poll, handoff(poll, true)); return; }
        await new Promise(resolve => {
          const waiting = { ...poll, finish(command, beforeWrite) {
            clearTimeout(timer);
            try { poll.finish(command, beforeWrite); } finally { resolve(); }
          } };
          const timer = setTimeout(() => { if (activePoll === waiting) flushPoll(); }, pollTimeout);
          activePoll = waiting;
          res.on('close', () => { if (activePoll === waiting) { activePoll = null; clearTimeout(timer); resolve(); } });
        }); return;
      }
      if (req.url === '/complete') {
        exact(b.payload, ['commandId', 'originalBinding', 'pins', 'result']);
        expirePending();
        const c = store.get(b.payload.commandId);
        // Current-channel MAC/Origin/sequence already passed above. Historical
        // pins/result come only from a fixed verified disposition, before the
        // normal current-package correlation. No promotion/event/eval occurs.
        if (c?.state === 'unknown' && c.terminalDisposition) {
          if (canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(c.terminalDisposition.pins) !== canonical(b.payload.pins) || canonical(c.terminalDisposition.result) !== canonical(b.payload.result)) fail('historical_completion_correlation');
          signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return;
        }
        if (!c || canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(b.payload.pins) !== canonical(commandPins(c.command))) fail('completion_correlation');
        const selectedAsset = assets.get(c.command.executorHash);
        const projectSave = selectedAsset?.resultProfile === 'current-project-save-v1';
        const lifecycle = selectedAsset?.resultProfile === 'project-lifecycle-v1';
        const observeDisk = projectSave ? observeProjectSave : lifecycle ? observeProjectLifecycle : null;
        if (c.state === 'completed') {
          if (c.response.result.notDispatchedVersion === 1) fail('unknown_no_promotion');
          const original = observeDisk ? nativeFileResult(c.response.result, c.command.phase) : c.response.result;
          if (canonical(original) !== canonical(b.payload.result)) fail('completion_conflict');
          signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return;
        }
        if (!pending || c.state !== 'ongoing' || !pending.delivered || pending.peer !== peer || pending.command.commandId !== b.payload.commandId ||
            canonical(pending.binding) !== canonical(b.payload.originalBinding) || canonical(pending.pins) !== canonical(b.payload.pins)) fail('unknown_no_promotion');
        const done = pending;
        let result = b.payload.result;
        if (result.readFailureVersion === 1) {
          const diagnostic = Object.hasOwn(result, 'diagnostic');
          exact(result, ['readFailureVersion', 'outcome', 'code', ...(diagnostic ? ['diagnostic'] : [])]);
          if (result.outcome !== 'rejected' || !['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable'].includes(result.code) &&
              !(titlesReadCommand(c.command, selectedAsset) && TITLES_READ_CODES.has(result.code)) &&
              !(selectedAsset?.resultProfile === 'layer-overlay-v1' && montagePreflight(c.command) && OVERLAY_PREFLIGHT_READ_CODES.has(result.code)) &&
              !(observeDisk && c.command.phase !== 'mutate' && (projectSave ? SAVE_READ_CODES : LIFECYCLE_READ_CODES).has(result.code))) fail('inspection_result');
          if (diagnostic) validateMontageDiagnostic(c.command, selectedAsset, result);
        } else if (manualResultProfile(selectedAsset)) {
          if (c.command.phase === 'mutate') {
            exact(result, ['outcome', 'snapshot', 'code', 'transactionReceipt']);
            if (result.outcome === 'unknown') {
              const code = lifecycle && c.command.payload.action === 'open' && typeof result.code === 'string' &&
                /^lifecycle_open_(source|destination|other|unsaved|unobserved)_(clean|dirty|unobserved)$/.test(result.code)
                ? result.code : 'manual_effect_unknown';
              disconnect(code); fail(code);
            }
            if (!['applied', 'rejected'].includes(result.outcome)) fail('manual_result');
            if (result.outcome === 'applied' && selectedAsset.resultProfile === 'media-import-v1')
              validateMediaSnapshot(result.snapshot, false, true);
          } else if (observeDisk) {
            exact(result, ['target', 'revision', 'protected', 'dirty', 'fileStamp', ...(lifecycle ? ['currentProject', 'inventory'] : [])]);
          } else if (selectedAsset.resultProfile === 'photo-source-v1') {
            exact(result, ['target', 'revision', 'protected', 'sourceId', 'source']);
            if (!result.target || typeof result.revision !== 'string' || typeof result.protected !== 'string' ||
                !Number.isSafeInteger(result.sourceId) || result.sourceId < 1 || !result.source) fail('manual_snapshot');
          } else if (selectedAsset.resultProfile === 'owned-project-assembly-v1') {
            exact(result, ['target', 'revision', 'protected', 'items', 'assemblies']);
            if (!result.target || typeof result.revision !== 'string' || typeof result.protected !== 'string' ||
                !Array.isArray(result.items) || !Array.isArray(result.assemblies)) fail('manual_snapshot');
          } else if (selectedAsset.resultProfile === 'media-import-v1') {
            const preflight = c.command.phase === 'inspect' && c.command.payload.file === undefined;
            validateMediaSnapshot(result, preflight);
          } else if (selectedAsset.resultProfile === 'layer-insert-v1') {
            exact(result, ['target', 'revision', 'protected', 'stack', 'uses', 'source', 'frameDuration', 'duration', 'hasExpressions']);
            if (!Array.isArray(result.stack) || !Array.isArray(result.uses) || !result.source || typeof result.hasExpressions !== 'boolean') fail('manual_snapshot');
          } else if (selectedAsset.resultProfile === 'layer-overlay-v1') {
            exact(result, ['target', 'revision', 'protected', 'stack', 'uses', 'source', 'signature', 'overlay']);
            if (!result.target || typeof result.revision !== 'string' || typeof result.protected !== 'string' ||
                !Array.isArray(result.stack) || !Array.isArray(result.uses) || !result.source ||
                typeof result.signature !== 'string' || !result.overlay) fail('manual_snapshot');
          } else if (selectedAsset.resultProfile === 'comp-frame-export-v1') {
            exact(result, ['target', 'revision', 'protected', 'width', 'height', 'duration', 'frameDuration', 'fullResolution']);
          } else if (['owned-text-layer-v1', 'owned-text-variant-v1', 'owned-comp-render-v1'].includes(selectedAsset.resultProfile)) {
            const fields = ['target', 'revision', 'protected', 'layers'];
            if (selectedAsset.resultProfile === 'owned-text-layer-v1') fields.push('size', 'guides');
            if (selectedAsset.resultProfile === 'owned-comp-render-v1') fields.push('duration', 'frameDuration', 'queueIdle', 'job', 'render');
            exact(result, fields);
            if (!result.target || typeof result.revision !== 'string' || typeof result.protected !== 'string' || !Array.isArray(result.layers)) fail('manual_snapshot');
          } else {
            const fields = ['target', 'revision', 'text', 'protected'];
            if (selectedAsset.resultProfile === 'manual-point-layout-v1') fields.push('role', 'time', 'style', 'anchor', 'scale', 'position', 'bounds', 'baselines', 'comp');
            exact(result, fields);
            if (!result.target || typeof result.revision !== 'string' || typeof result.text !== 'string' || typeof result.protected !== 'string') fail('manual_snapshot');
          }
        } else {
          // Private asset-selected versioned observation profile. No caller chooses
          // the validator and no lifecycle/session is manufactured for discovery.
          exact(result, ['observationVersion', 'target', 'project', 'compositions', 'layers', 'truncated', 'aeVersion', 'dirty', 'projectRevision', 'activeComp', 'coverage']);
          if (result.observationVersion !== 1 || !result.target || !result.project || !Array.isArray(result.compositions) || result.compositions.length > 50 || !Array.isArray(result.layers) || result.layers.length > 100 || typeof result.truncated !== 'boolean' || typeof result.aeVersion !== 'string') fail('inspection_result');
          exact(result.target, ['projectId', 'compId']); exact(result.project, ['name', 'numItems', 'saved']);
          if (result.target.projectId !== null && typeof result.target.projectId !== 'string' || result.target.compId !== null && (!Number.isSafeInteger(result.target.compId) || result.target.compId < 1) || typeof result.project.name !== 'string' || !Number.isSafeInteger(result.project.numItems) || result.project.numItems < 0 || typeof result.project.saved !== 'boolean') fail('inspection_result');
          for (const item of result.compositions) { exact(item, ['compId', 'name', 'numLayers', 'duration']); if (!Number.isSafeInteger(item.compId) || item.compId < 1 || typeof item.name !== 'string' || !Number.isSafeInteger(item.numLayers) || item.numLayers < 0 || typeof item.duration !== 'number' || item.duration < 0) fail('inspection_result'); }
          for (const item of result.layers) validateInspectionLayer(item, c.command.payload.includeLayerContext === true);
          if (c.command.payload.includeLayerContext || c.command.payload.cursor !== undefined ||
              ['dirty', 'projectRevision', 'activeComp', 'coverage'].some(key => Object.hasOwn(result, key))) validateInspectionCoverage(result, c.command.payload);
        }
        if (observeDisk && result.readFailureVersion !== 1) {
          try {
            if (c.command.phase !== 'mutate') result = observeDisk(c.command, result);
            else if (result.outcome === 'applied') result = { ...result, snapshot: observeDisk(c.command, result.snapshot) };
          } catch {
            const code = projectSave ? 'save_disk_proof_unavailable' : 'lifecycle_disk_proof_unavailable';
            if (c.command.phase === 'mutate') {
              disconnect(code, lifecycle ? observedOpen(c.command, result) : undefined); fail(code);
            }
            result = { ...result, diskProofError: code };
          }
        }
        expirePending();
        if (pending !== done) fail('unknown_no_promotion');
        if (c.command.phase === 'mutate' && result.outcome === 'applied' &&
            ['media-import-v1', 'layer-overlay-v1'].includes(selectedAsset?.resultProfile)) {
          try { if (!assertMediaSourceLock) fail('media_file_lock_unavailable'); assertMediaSourceLock(c.command.commandId); }
          catch { disconnect('media_file_lock_unavailable'); fail('media_file_lock_unavailable'); }
        }
        const response = completionResponse(c.command, result);
        let recordHash;
        try { recordHash = store.complete(b.payload.commandId, response); }
        catch (error) {
          noteFault(done, 'completion_persist_failed', error);
          disconnect('completion_persist_failed');
          throw error;
        }
        const code = result.diskProofError || result.code;
        lastCommandOutcome = commandOutcome(done, 'terminal', { queue: startOverFrozen ? 'fenced' : 'idle',
          nativeStart: done.directRead && result.observationVersion === 1 ? 'observed' : 'unknown',
          terminalReceipt: Object.freeze({ source: ['host_json_unavailable', 'host_registry_unavailable'].includes(code) ? 'registry' : 'host', receiptRef: c.originalBinding.receiptRef, recordHash }),
          ...(typeof code === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(code) ? { code } : {}), late: done.callerSettled });
        // One bounded observation of an already durable, authenticated completion.
        // It is not evidence/grant or a statement about current runtime/history.
        if ((result.readFailureVersion === 1 || observeDisk && result.diskProofError) && ['inspect', 'verify'].includes(c.command.phase)) lastReadFailure = Object.freeze({ commandId: c.command.commandId, moduleId: c.command.moduleId, phase: c.command.phase, executorHash: c.command.executorHash, code: result.diskProofError || result.code, authority: false });
        pending = null; clearTimeout(done.timer);
        if (done.callerSettled) {
          // The original MCP call already ended. Do not mint a baseline or
          // expose this late observation as the result of a new request.
        } else if (observeDisk && result.diskProofError) {
          done.reject(Object.assign(new Error(result.diskProofError), { code: result.diskProofError }));
        } else if (result.readFailureVersion === 1) {
          rejectCaller(done, result.code, lastCommandOutcome);
        } else {
          const value = done.broker ? response : { observation: result, originalBinding: c.originalBinding, pins: commandPins(c.command), continuity: false };
          if (done.directRead && result.observationVersion === 1) {
            completedProjectReads.set(value, Object.freeze({ sessionId: workSessionId, commandId: c.command.commandId, executorHash: c.command.executorHash, payloadHash: c.command.payloadHash, receiverStoreIdentity: c.originalBinding.receiverStoreIdentity, observationHash: hash(result), channelEpoch: epoch, resultHash: hash(value) }));
          }
          done.resolve(value);
        }
        signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } });
        return;
      }
      fail('unknown_peer_route');
    } catch (e) {
      try {
        if (res.headersSent) res.destroy();
        else reply(res, e.code === 'frame_too_large' ? 413 : 403, { error: e.code || 'peer_request_failed' }, corsOrigin);
      }
      catch { res.destroy(); }
    }
  });
  function submit(command, broker = false, offer) {
    if (startOverFrozen) fail('start_over_frozen');
    const selected = assets.get(command.executorHash);
    if (!selected || selected.moduleId && (selected.moduleId !== command.moduleId || selected.operationId !== command.operationId) || !['inspect', 'mutate', 'verify'].includes(command.phase) || command.phase !== 'inspect' && !manualResultProfile(selected)) fail('http_asset_not_admitted');
    const deliveryGuard = captureDeliveryGuard(command);
    if (typeof deliveryGuard !== 'function') fail('physical_delivery_guard');
    if (broker && command.phase === 'mutate' && (requireMutationGuard || offer) &&
        (offer?.commandId !== command.commandId || offer?.payloadHash !== command.payloadHash || typeof offer?.assert !== 'function'))
      fail('physical_delivery_guard');
    admissionGuard(command); deliveryGuard();
    if (closed || store.closed) fail('receiver_lane_closed'); if (!peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); if (pending) fail('physical_lane_pending');
    const directRead = !broker && selected === asset && asset.assetKey === 'project-inspection-v1' && command.moduleId === 'project-inspection' && command.operationId === 'inspect' && command.phase === 'inspect';
    const effect = directRead ? 'none' : command.phase === 'mutate' ? selected.effect || 'unclassified' : 'unclassified';
    const isProjectOpen = broker && offer && selected.resultProfile === 'project-lifecycle-v1' && command.phase === 'mutate' &&
      command.moduleId === 'project-lifecycle' && command.operationId === 'transition-project' && command.payload.action === 'open';
    const callbackTimeout = isProjectOpen ? projectOpenTimeout ?? timeout : timeout;
    const binding = dispatchBinding(command, store.identity); store.begin(command, binding);
    return new Promise((resolve, reject) => {
      const deadline = performance.now() + callbackTimeout;
      const entry = { command, binding, pins: Object.freeze(commandPins(command)), peer, effect, directRead, deliveryGuard, resolve, reject, broker, offer,
        delivered: false, callerSettled: false, deadline, drainDeadline: deadline + directReadDrainMs, drainDeadlineAt: Date.now() + callbackTimeout + directReadDrainMs };
      pending = entry; armDeadline(entry, deadline); deliver();
    });
  }
  const api = Object.freeze({
    status,
    linkIdentity: () => peer?.identity || null,
    // B3 has a stronger physical fence than normal maintenance drain. This
    // synchronous private switch covers previously accepted, undelivered work.
    // Already delivered native callbacks may still settle in the OLD journal;
    // timeout/UNKNOWN and real process death remain authoritative.
    fenceForStartOver() {
      startOverFrozen = true;
      if (pending?.callerSettled) disconnect('start_over_frozen');
      flushPoll();
    },
    consumeReadRejection(error) {
      const record = completedReadErrors.get(error); completedReadErrors.delete(error); return record || null;
    },
    identity: hash({ packageHash: installation.packageHash, assets: [...assets.values()] }),
    transport: Object.freeze({
      async connect(value) { if (store.closed || !peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); exact(value, ['controllerId', 'channelEpoch', 'secret']); brokerBinding = Object.freeze({ ...value }); return { receiverStoreIdentity: store.identity }; },
      async send(frame, offer) { if (!brokerBinding) fail('transport_disconnected'); const command = envelope(decode(frame, brokerBinding.secret)); if (command.controllerId !== brokerBinding.controllerId || command.channelEpoch !== brokerBinding.channelEpoch) fail('controller_binding'); return encode(await submit(command, true, offer), brokerBinding.secret); },
      async completion(commandId) { if (!brokerBinding) fail('transport_disconnected'); const c = store.get(commandId); return encode({ commandId, state: c?.state || 'unknown', ...(c?.originalBinding ? { originalBinding: c.originalBinding } : {}), ...(c?.response ? { response: c.response } : {}) }, brokerBinding.secret); },
      async disconnect() { if (pending) fail('physical_lane_pending'); brokerBinding = undefined; }
    }),
    async listen() {
      if (preboundServer) { if (!server.listening) fail('http_prebound_server'); return status(); }
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return status();
    },
    inspect(payload = {}) {
      exact(payload, ['compId', 'cursor', 'includeLayerContext']); if (payload.compId !== undefined && (!Number.isSafeInteger(payload.compId) || payload.compId < 1)) fail('invalid_comp_id');
      if (payload.includeLayerContext !== undefined && (payload.includeLayerContext !== true || payload.compId === undefined)) fail('invalid_layer_context');
      if (payload.cursor !== undefined && (typeof payload.cursor !== 'string' || payload.cursor.length < 1 || payload.cursor.length > 96)) fail('invalid_inspection_cursor');
      payload = Object.freeze({ ...payload });
      const command = { protocolVersion: 1, controllerId, channelEpoch: epoch, commandId: id('inspect'), moduleId: 'project-inspection', operationId: 'inspect', executorHash: asset.executorHash, phase: 'inspect', payloadHash: hash(canonical(payload)), payload };
      return submit(command);
    },
    async close() { closed = true; disconnect('runtime_closed'); flushPoll(); await new Promise(resolve => server.close(resolve)); store.close(); }
  });
  observationPeers.set(api, completedProjectReads); return api;
}
module.exports = { createHttpPeer, consumeProjectObservation };
