# 09-authenticated-peer

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/integrations/cep/http-peer.js:157–178`
Полный файл SHA256 (hex groups, concatenate) `d0d6081d:f5b814e3:64b795c0:f0808710:1fd9db82:19ede64a:29e999a0:4bdf1bb0`; Git blob `7557858f:44dd8f56:fb595189:9cb4b430:4418cd43`. Выдержка: строки 157–178, 2090 bytes.

```javascript
  const server = preboundServer || http.createServer();
  const store = openCompletionStore({ directory, installationContext, ownerToken });
  const epoch = id('http'), controllerId = id('controller');
  const registryRequired = !!expectedPanelIdentity?.registryBuildId;
  let registryBootstrap = null, registryTimer = null;
  function registryPending() { return registryBootstrap && store.get(registryBootstrap.command.commandId)?.state === 'ongoing'; }
  function failRegistry() { if (registryPending()) store.unknown(registryBootstrap.command.commandId); clearTimeout(registryTimer); }
  function ready() { return !!peer && (!registryRequired || peer.registryReady === true); }
  function extensionRoot(value) {
    if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value) || !path.isAbsolute(value) || path.resolve(value).replace(/\\/g, '/').toLowerCase() !== path.resolve(installation.cepDir).replace(/\\/g, '/').toLowerCase()) fail('panel_extension_root');
    return path.resolve(installation.cepDir).replace(/\\/g, '/');
  }
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
```

## `core4/integrations/cep/http-peer.js:296–322`
Полный файл SHA256 (hex groups, concatenate) `d0d6081d:f5b814e3:64b795c0:f0808710:1fd9db82:19ede64a:29e999a0:4bdf1bb0`; Git blob `7557858f:44dd8f56:fb595189:9cb4b430:4418cd43`. Выдержка: строки 296–322, 2317 bytes.

```javascript
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
        exact(input, ['challenge', 'peerId', 'proof', ...(Object.hasOwn(input, 'loadedPanel') ? ['loadedPanel'] : []), ...(Object.hasOwn(input, 'extensionRoot') ? ['extensionRoot'] : [])]); const challenge = challenges.get(input.challenge?.nonce); challenges.delete(input.challenge?.nonce);
```

## `core4/integrations/cep/http-peer.js:324–348`
Полный файл SHA256 (hex groups, concatenate) `d0d6081d:f5b814e3:64b795c0:f0808710:1fd9db82:19ede64a:29e999a0:4bdf1bb0`; Git blob `7557858f:44dd8f56:fb595189:9cb4b430:4418cd43`. Выдержка: строки 324–348, 3782 bytes.

```javascript
        if (!challenge || origin !== challenge.value.origin || Date.now() - challenge.time > 10000 || canonical(input.challenge) !== canonical(challenge.value) || typeof input.peerId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.peerId) || !validMac({ challenge: input.challenge, peerId: input.peerId, ...(Object.hasOwn(input, 'loadedPanel') ? { loadedPanel: input.loadedPanel } : {}), ...(Object.hasOwn(input, 'extensionRoot') ? { extensionRoot: input.extensionRoot } : {}) }, input.proof, secret)) fail('peer_auth');
        if (role !== 'panel') fail('panel_role_required');
        if (expectedPanelIdentity && canonical(input.loadedPanel ?? null) !== canonical(expectedPanelIdentity)) { lastPanelRejection = { code: 'panel_identity_mismatch', observedAt: Date.now(), loadedPanel: input.loadedPanel ?? null }; fail('panel_identity_mismatch'); }
        expirePending();
        if (peer && (Date.now() - peer.lastSeen < 45000 || pending || registryPending())) fail('duplicate_peer');
        const root = registryRequired ? extensionRoot(input.extensionRoot) : null;
        if (registryRequired) { if (store.closed || store.fault || pending || startOverFrozen) fail('registry_lane_closed'); bootstrapAdmissionGuard(); }
        flushPoll();
        peer = { peerId: input.peerId, origin: challenge.value.origin, sequence: 0, lastSeen: Date.now(), identity: Object.freeze(input.loadedPanel || {}), identityObservedAt: Date.now(), registryReady: !registryRequired };
        if (registryRequired) {
          const nonce = crypto.randomBytes(32).toString('hex'), payload = { nonce, extensionRoot: root, registryBuildId: expectedPanelIdentity.registryBuildId, sessionId: workSessionId };
          const command = { protocolVersion: 1, controllerId, channelEpoch: epoch, commandId: id('registry'), moduleId: 'registry-bootstrap', operationId: 'verify-registry', executorHash: expectedPanelIdentity.registryBuildId, phase: 'inspect', payloadHash: hash(payload), payload };
          store.begin(command, dispatchBinding(command, store.identity));
          registryBootstrap = { command, nonce, epoch, sessionId: workSessionId, startupOperationId: captureBootstrapStartup(), peerId: peer.peerId, deadlineAt: Date.now() + registryTimeoutMs };
          registryTimer = setTimeout(() => { try { failRegistry(); } catch { /* durable store fault remains fenced */ } }, registryTimeoutMs);
        }
        const body = { linked: true, epoch, peerId: peer.peerId, controllerId, pins, receiverStoreIdentity: store.identity, laneClosed: store.closed, ...(Object.hasOwn(input, 'loadedPanel') ? { acceptedIdentity: peer.identity } : {}), ...(registryRequired ? { registryReady: false, bootstrap: { nonce: registryBootstrap.nonce, expectedRegistryBuildId: expectedPanelIdentity.registryBuildId, deadline: registryBootstrap.deadlineAt, sessionId: workSessionId } } : {}), ...(startOverControl ? { workSessionId, startOver: startOverControl.status() } : {}) };
        reply(res, 200, { body, mac: mac(body, secret) }, corsOrigin); return;
      }
      exact(input, ['body', 'mac']); const b = requestBody(input.body);
      if (!peer || origin !== peer.origin || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, installation.panelToken)) fail('peer_auth_or_replay');
      peer.sequence = b.sequence; peer.lastSeen = Date.now();
      function signed(payload, beforeWrite) { const body = { epoch, peerId: b.peerId, sequence: b.sequence, payload }; return reply(res, 200, { body, mac: mac(body, installation.panelToken) }, corsOrigin, beforeWrite); }
      if (req.url === '/registry-ready') {
        exact(b.payload, ['nonce', 'registryBuildId', 'refreshed', 'sessionId']);
```
