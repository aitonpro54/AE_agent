# Argon result review: bounded CEP Origin repair

## Review request

``````markdown
# Запрос Argon: result-review bounded CEP Origin repair

- Review ID: `20261028-origin-result-01`
- Stage ID: `cep-origin`
- Тип: `result`
- Base commit: `aa1659819d3d9e1c51e87326d314f805a775334c`
- Target source commit: `30311539ce2b2eb091d19c179667e513217e41cc`
- Plan-review provenance: `20261028-origin-plan-04`; request SHA-256 `c14069a89c7040a782c82665a2f9a72c9156defcd799cfb2e1dd189e50451f00`; response SHA-256 `df165fdf3be48ca7c1efd5c2bc56b94dbe5dedcbf1405895ee26f19658d1eeeb`.
- Package candidate identity: `6c94efb678b9a56861b18e762076da7b38824bbbe30233770c4133ff81edc696`; candidate file SHA-256 `fd4320d1f0e95540dce83515fffaf21c92bbdac09f82303005d305930f5caad3`.
- Request SHA-256, exact core diff SHA-256 and result bundle SHA-256: см. `context/bindings.json`.

## Цель

Независимо проверить точный core diff от base до target: корректно ли реализованы пять привязанных plan-review findings, отражают ли выбранные scoped checks изменения, и какие блокеры остаются до следующего gated перехода. Это bounded result-review, не полный аудит архитектуры или всего выпуска.

## Текущее состояние и доказательства

В пакете ровно один полный `changes.diff` от указанного base до target по `core4/`, полный текущий `http-peer.js`, полный текущий `panel.js`, полный текущий неизменённый `peer-protocol.js`, краткая source-provenanced сводка closure/tests и точный финальный `validate-diff-02` Node spec stdout. Изменённый test-файл полностью виден в diff. Сводка содержит адресные пути/строки для каждого finding, selected commands/evidence keys, package identity и deferred coverage.

Факт Production Origin ограничен: собственная file-based panel послала `POST /challenge` с Origin `file://`; body/credentials/native commands не читались. Diagnostic observer сообщил `observer-only` отказ; это не installed success. Candidate deterministic/verified, но ещё не installed.

## Вопросы

1. Верно ли закрыт `CEP-ORIGIN-PLAN-01`: точная Origin/CORS граница при exact Host/loopback и одинаковое правило для success/error/OPTIONS без wildcard/credentials?
2. Закрыт ли `CEP-ORIGIN-PLAN-02`: challenge-origin equality и peer-origin guard перед state effects, one-time nonce, sequence/pending/completion/ACK поведение при wrong Origin?
3. Правильно ли сохранена граница `CEP-ORIGIN-PLAN-03`: unchanged peer protocol/signed body, без расширения данных в signed envelope?
4. Достаточно ли test helper и тестов для `CEP-ORIGIN-PLAN-04`, включая duplicate raw header, missing Origin, OPTIONS 204, headers и early rejection без false client errors?
5. Закрыт ли `CEP-ORIGIN-PLAN-05`: panel exact validation перед первым HMAC/link и подпись полного исходного challenge?
6. Какие конкретные defects или uncovered tests реально блокируют следующий разрешённый package dry-run/apply/read-back; что явно остаётся deferred и не должно называться PASS?

## Границы и stop-lines

Проверяйте только этот diff и его приложенное evidence. Не расширяйте аудит на независимые архитектуры/интеграции. Не просите и не выводите credentials, installation/state data, browser profile, пользовательские AEP/assets, local absolute paths или PIDs. Не запускайте команды. Не предполагайте, что offline Node/VM вывод доказывает настоящий browser/CEP/CORS или установленный пакет.

Result-review нужен до package install. Даже `go` не разрешает apply, restart/reopen, live AE/CEP/UI, dispatch, save, raw или destructive операции. Следующие gates должны оставаться отдельными: package dry-run exact hash → явно разрешённый apply → installed release/Node/CEP/config/state read-back → настоящий stdio/status/connect/poll → только разрешённая typed read-only inspection. При mismatch, pending/UNKNOWN или неопределённом исходе — stop/no-replay.

## Требуемый ответ

Подтвердите binding по `context/bindings.json`: Review ID, Stage ID, type, полный base и target commits, SHA-256 полного `changes.diff`, package hash и request SHA-256. Ответьте ровно одним verdict: `go`, `revise`, `stop` или `insufficient-evidence`. Перечислите прочитанные context-файлы и реальные omissions.

Для каждого finding дайте стабильный ID, локальный приоритет P0–P3, утверждение, отказной сценарий, точную ссылку `path:line` и тест/evidence key, статус (`confirmed`, `already addressed`, `not supported` или `requires verification`), новизну (`new/known/duplicate/unknown`), уверенность и минимальный безопасный следующий шаг. Отдельно перечислите blockers для перехода, доказанные ограничения и missing installed/browser/two-machine evidence. Не интерпретируйте verdict как разрешение на установку или live-действия.
``````

## Included files

- `context/bindings.json`
- `context/changes.diff`
- `context/evidence-summary.md`
- `context/http-peer.js`
- `context/panel.js`
- `context/peer-protocol.js`
- `context/source-metadata.json`
- `context/validate-diff-02.stdout.txt`

## Context

### context/bindings.json

``````
{
  "reviewId": "20261028-origin-result-01",
  "stageId": "cep-origin",
  "reviewType": "result",
  "baseCommit": "aa1659819d3d9e1c51e87326d314f805a775334c",
  "targetCommit": "30311539ce2b2eb091d19c179667e513217e41cc",
  "changesDiffSha256": "f7fdc1747c1aa26ea1ce2d94e64c508e2cae7dbfcd935c8f95932183adfb33b9",
  "packageHash": "6c94efb678b9a56861b18e762076da7b38824bbbe30233770c4133ff81edc696",
  "packageFileSha256": "fd4320d1f0e95540dce83515fffaf21c92bbdac09f82303005d305930f5caad3",
  "requestSha256": "74115c96a4211146ca9ec1a0814d2a66a25c1a8c4b6a64151123456fac406542"
}
``````

### context/changes.diff

``````
diff --git a/core4/README.md b/core4/README.md
index 7922a2b..c08a39d 100644
--- a/core4/README.md
+++ b/core4/README.md
@@ -4,7 +4,9 @@
 
 `runtime/profiles.json` допускает optional `project-inspection` по pinned contract/executor. Existing generic flow `list_modules → get_module_contract → inspect_module_target` возвращает bounded текущую observation: до50 comp summaries и до100 layers выбранной comp. `target:{compId}` необязателен; это discovery saved/unsaved проекта без synthetic session. Observation не выдаёт authority или continuity; build для этого read-only модуля явно unsupported. Остальные generic tools обслуживает существующий Broker с прежними strict gates.
 
-Пакет создаётся детерминированно из `runtime/source-package.json` и закреплённых artifact closures. В пакет не входят tests/experiments/tools/deps/logs/state/`.git`. Fixed JSX registry компилируется при packaging; runtime frame содержит только `assetKey/phase/typedPayload/commandId/originalBinding/pins`. Произвольный source/path/function не принимается. CEP использует native WebCrypto HMAC, fresh challenge/epoch/sequence, отдельный panel token и exact loopback Host/opaque `null` Origin. Недоступный WebCrypto закрывает подключение. JSX registry включает pinned lexical ES3 JSON codec без global polyfill; native JSX JSON не требуется. Native AE APIs требуют фактической live-проверки.
+Пакет создаётся детерминированно из `runtime/source-package.json` и закреплённых artifact closures. В пакет не входят tests/experiments/tools/deps/logs/state/`.git`. Fixed JSX registry компилируется при packaging; runtime frame содержит только `assetKey/phase/typedPayload/commandId/originalBinding/pins`. Произвольный source/path/function не принимается. CEP использует native WebCrypto HMAC, fresh challenge/epoch/sequence, отдельный panel token и exact loopback Host; общий пакет принимает ровно два значения Origin: `null` и `file://`. Недоступный WebCrypto закрывает подключение. JSX registry включает pinned lexical ES3 JSON codec без global polyfill; native JSX JSON не требуется. Native AE APIs требуют фактической live-проверки.
+
+Origin связывается с сохранённым server challenge и private peer; несовпадение отклоняется до изменения peer sequence/lastSeen, доставки команды или completion/ACK. Полный challenge подписывается панелью после проверки допустимого Origin; signed request body не получает новое поле. Missing/empty/duplicate и другие Origin отклоняются; HTTP OWS вокруг значения предварительно нормализуется Node HTTP parser. CORS success/error/OPTIONS отражает только принятое значение после exact Host/loopback gates, с `Vary: Origin`, без credentials/wildcard. Origin остаётся ingress-фильтром, authority требует MAC и прежних bindings. Настройки по имени компьютера не нужны; Node HTTP/VM проверки не подтверждают live CEP/CORS или переносимость десктоп ↔ MSI.
 
 Node append+fsync begin выполняется до публикации команды; complete fsync — до correlated ACK. CEP сохраняет physical latch до eval и callback receipt до POST; latch удаляется только после ACK с exact command/receipt. LocalStorage не является fsync proof: Node store остаётся authority для no-replay. Timeout, callback loss, corruption, reload с потерянным callback и orphan receiver owner закрывают lane. Installer не удаляет owner/fences и отказывает при owned/unknown production state.
 
diff --git a/core4/cep/js/panel.js b/core4/cep/js/panel.js
index b708bf2..8ea663b 100644
--- a/core4/cep/js/panel.js
+++ b/core4/cep/js/panel.js
@@ -12,7 +12,7 @@
       if (!cfg || !window.crypto || !crypto.subtle || typeof TextEncoder !== 'function' || typeof fetch !== 'function' || !window.__adobe_cep__ || typeof __adobe_cep__.evalScript !== 'function') throw new Error('CEP_WebCrypto_or_host_unavailable');
       var random = new Uint8Array(24); crypto.getRandomValues(random); peerId = 'panel-' + Array.from(random).map(function (b) { return b.toString(16); }).join('');
       var challenge = await post('/challenge', { role: 'panel' });
-      if (challenge.packageHash !== cfg.packageHash || challenge.installationId !== cfg.installationId || challenge.executorHash !== cfg.executorHash || challenge.role !== 'panel') throw new Error('installation_binding');
+      if (challenge.packageHash !== cfg.packageHash || challenge.installationId !== cfg.installationId || challenge.executorHash !== cfg.executorHash || challenge.role !== 'panel' || (challenge.origin !== 'null' && challenge.origin !== 'file://')) throw new Error('installation_binding');
       var response = await post('/link', { challenge: challenge, peerId: peerId, proof: await sign({ challenge: challenge, peerId: peerId }) });
       if (response.mac !== await sign(response.body) || response.body.peerId !== peerId || response.body.epoch !== challenge.epoch) throw new Error('link_auth');
       epoch = response.body.epoch; sequence = 0; linked = true;
diff --git a/core4/integrations/cep/http-peer.js b/core4/integrations/cep/http-peer.js
index 14cbc94..5a750c1 100644
--- a/core4/integrations/cep/http-peer.js
+++ b/core4/integrations/cep/http-peer.js
@@ -22,12 +22,14 @@ function createHttpPeer({ installation, directory, asset, additionalAssets = [],
   }
   const server = http.createServer(async (req, res) => {
     const origin = req.headers.origin;
+    let corsOrigin;
     try {
       if (closed || req.headers.host !== '127.0.0.1:' + server.address().port || req.socket.remoteAddress !== '127.0.0.1') fail('loopback_host_required');
-      // CEP file origin is opaque. It is accepted only with fresh role-secret MAC;
+      // Package-owned CEP file origins. They are accepted only with fresh role-secret MAC;
       // never wildcard CORS, cookies, unauthenticated status or source ingress.
-      if (origin !== 'null') fail('cep_origin_required');
-      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }); res.end(); return; }
+      if ((origin !== 'null' && origin !== 'file://') || req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'origin').length !== 1) fail('cep_origin_required');
+      corsOrigin = origin;
+      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': corsOrigin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }); res.end(); return; }
       if (req.method !== 'POST') fail('post_required');
       let bytes = 0, chunks = [];
       for await (const chunk of req) { bytes += chunk.length; if (bytes > 256 * 1024) fail('frame_too_large'); chunks.push(chunk); }
@@ -36,23 +38,23 @@ function createHttpPeer({ installation, directory, asset, additionalAssets = [],
         exact(input, ['role']); if (!['panel', 'control'].includes(input.role)) fail('role_required');
         for (const [key, c] of challenges) if (Date.now() - c.time > 10000) challenges.delete(key);
         if (challenges.size >= 16) fail('challenge_backpressure');
-        const nonce = crypto.randomBytes(32).toString('hex'); const value = { nonce, epoch, role: input.role, ...pins, controllerId };
-        challenges.set(nonce, { value, time: Date.now() }); reply(res, 200, value, origin); return;
+        const nonce = crypto.randomBytes(32).toString('hex'); const value = { nonce, epoch, role: input.role, origin: corsOrigin, ...pins, controllerId };
+        challenges.set(nonce, { value, time: Date.now() }); reply(res, 200, value, corsOrigin); return;
       }
       if (req.url === '/link') {
         exact(input, ['challenge', 'peerId', 'proof']); const challenge = challenges.get(input.challenge?.nonce); challenges.delete(input.challenge?.nonce);
         const role = challenge?.value.role, secret = role === 'panel' ? installation.panelToken : installation.controlToken;
-        if (!challenge || Date.now() - challenge.time > 10000 || canonical(input.challenge) !== canonical(challenge.value) || typeof input.peerId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.peerId) || !validMac({ challenge: input.challenge, peerId: input.peerId }, input.proof, secret)) fail('peer_auth');
+        if (!challenge || origin !== challenge.value.origin || Date.now() - challenge.time > 10000 || canonical(input.challenge) !== canonical(challenge.value) || typeof input.peerId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.peerId) || !validMac({ challenge: input.challenge, peerId: input.peerId }, input.proof, secret)) fail('peer_auth');
         if (role !== 'panel') fail('panel_role_required');
         if (peer && (Date.now() - peer.lastSeen < 45000 || pending)) fail('duplicate_peer');
-        peer = { peerId: input.peerId, sequence: 0, lastSeen: Date.now() };
+        peer = { peerId: input.peerId, origin: challenge.value.origin, sequence: 0, lastSeen: Date.now() };
         const body = { linked: true, epoch, peerId: peer.peerId, controllerId, pins, receiverStoreIdentity: store.identity, laneClosed: store.closed };
-        reply(res, 200, { body, mac: mac(body, secret) }, origin); return;
+        reply(res, 200, { body, mac: mac(body, secret) }, corsOrigin); return;
       }
       exact(input, ['body', 'mac']); const b = requestBody(input.body);
-      if (!peer || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, installation.panelToken)) fail('peer_auth_or_replay');
+      if (!peer || origin !== peer.origin || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, installation.panelToken)) fail('peer_auth_or_replay');
       peer.sequence = b.sequence; peer.lastSeen = Date.now();
-      function signed(payload) { const body = { epoch, peerId: peer.peerId, sequence: b.sequence, payload }; reply(res, 200, { body, mac: mac(body, installation.panelToken) }, origin); }
+      function signed(payload) { const body = { epoch, peerId: peer.peerId, sequence: b.sequence, payload }; reply(res, 200, { body, mac: mac(body, installation.panelToken) }, corsOrigin); }
       if (req.url === '/poll') {
         exact(b.payload, []); if (activePoll) fail('concurrent_poll');
         if (pending && !pending.delivered) { try { admissionGuard(pending.command); } catch (e) { disconnect(e.code || 'physical_admission_closed'); throw e; } }
@@ -98,7 +100,7 @@ function createHttpPeer({ installation, directory, asset, additionalAssets = [],
         return;
       }
       fail('unknown_peer_route');
-    } catch (e) { reply(res, e.code === 'frame_too_large' ? 413 : 403, { error: e.code || 'peer_request_failed' }, origin === 'null' ? origin : undefined); }
+    } catch (e) { reply(res, e.code === 'frame_too_large' ? 413 : 403, { error: e.code || 'peer_request_failed' }, corsOrigin); }
   });
   function submit(command, broker = false) {
     const selected = assets.get(command.executorHash);
diff --git a/core4/test/installable-runtime.test.js b/core4/test/installable-runtime.test.js
index 27bf852..29bf231 100644
--- a/core4/test/installable-runtime.test.js
+++ b/core4/test/installable-runtime.test.js
@@ -6,6 +6,7 @@ const path = require('node:path');
 const os = require('node:os');
 const vm = require('node:vm');
 const http = require('node:http');
+const { webcrypto } = require('node:crypto');
 const { spawn, spawnSync } = require('node:child_process');
 const { PassThrough } = require('node:stream');
 const { once } = require('node:events');
@@ -25,10 +26,21 @@ function install(directory, pkg = buildPackage()) {
 }
 const installation = { packageHash: '1'.repeat(64), installationId: 'test-installation', panelToken: '2'.repeat(64), controlToken: '3'.repeat(64) };
 const asset = { assetKey: 'project-inspection-v1', executorHash: hash(fs.readFileSync(path.join(root, 'modules/project-inspection/executor.jsx'))) };
-async function client(port, config = installation) {
+function rawRequest(port, route, body, { origin = 'null', headers = {}, method = 'POST', rawHeaders } = {}) {
+  // Delete missing headers explicitly: Node rejects an undefined header value client-side.
+  const values = { Origin: origin, 'Content-Type': 'application/json', ...headers };
+  for (const key of Object.keys(values)) if (values[key] === undefined) delete values[key];
+  return new Promise((resolve, reject) => {
+    const req = http.request('http://127.0.0.1:' + port + route, { method, agent: false, headers: rawHeaders || values }, res => {
+      let data = ''; res.on('data', b => data += b);
+      res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, value: data ? JSON.parse(data) : null }); } catch (e) { reject(e); } });
+    });
+    req.on('error', reject); req.end(body === undefined ? undefined : canonical(body));
+  });
+}
+async function client(port, config = installation, origin = 'null') {
   let sequence = 0;
-  const base = 'http://127.0.0.1:' + port;
-  async function raw(route, body, extra = {}) { return new Promise((resolve, reject) => { const req = http.request(base + route, { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json', ...extra } }, res => { let data = ''; res.on('data', b => data += b); res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(data) })); }); req.on('error', reject); req.end(canonical(body)); }); }
+  function raw(route, body, extra = {}, options = {}) { return rawRequest(port, route, body, { origin, headers: extra, ...options }); }
   const challenge = (await raw('/challenge', { role: 'panel' })).value, peerId = 'test-peer';
   const link = await raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, config.panelToken) });
   assert.equal(link.status, 200); assert.equal(link.value.mac, mac(link.value.body, config.panelToken));
@@ -170,6 +182,140 @@ test('installable-runtime actual HTTP auth role, origin, challenge, epoch, repla
   const big = await c.raw('/challenge', { role: 'panel', padding: 'x'.repeat(300000) }); assert.equal(big.status, 413);
   assert.ok(!canonical(peer.status()).includes(installation.panelToken)); assert.ok(!canonical(peer.status()).includes(installation.controlToken));
 });
+function cors(response, origin) {
+  assert.equal(response.headers['access-control-allow-origin'], origin);
+  assert.equal(response.headers.vary, origin === undefined ? undefined : 'Origin');
+  assert.equal(response.headers['access-control-allow-credentials'], undefined);
+}
+test('installable-runtime exact CEP Origin ingress and CORS success/error/OPTIONS matrix at Node HTTP boundary', async t => {
+  const peer = createHttpPeer({ installation, directory: temp(), asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
+  const port = peer.status().port;
+  for (const origin of ['null', 'file://']) {
+    const challenge = await rawRequest(port, '/challenge', { role: 'panel' }, { origin });
+    assert.equal(challenge.status, 200); assert.equal(challenge.value.origin, origin); cors(challenge, origin);
+    const error = await rawRequest(port, '/challenge', { role: 'other' }, { origin });
+    assert.equal(error.value.error, 'role_required'); cors(error, origin);
+    const preflight = await rawRequest(port, '/challenge', undefined, { origin, method: 'OPTIONS' });
+    assert.equal(preflight.status, 204); assert.equal(preflight.value, null); cors(preflight, origin);
+    assert.equal(preflight.headers['access-control-allow-methods'], 'POST'); assert.equal(preflight.headers['access-control-allow-headers'], 'Content-Type');
+    for (const host of ['localhost:' + port, '127.0.0.1:' + (port === 65535 ? port - 1 : port + 1), '[::1]:' + port]) {
+      for (const method of ['POST', 'OPTIONS']) {
+        const response = await rawRequest(port, '/challenge', { role: 'panel' }, { origin, method, headers: { Host: host } });
+        assert.equal(response.value.error, 'loopback_host_required'); cors(response, undefined);
+      }
+    }
+  }
+  const invalid = [undefined, '', 'NULL', 'FILE://', 'File://', 'file:', 'file:/', 'file:///', 'file://localhost', 'file:///C:/panel.html', 'null, null', 'null, file://', 'null file://', 'n ull', 'file: //', 'http://127.0.0.1:' + port, 'http://localhost:' + port, 'https://example.test'];
+  for (const origin of invalid) for (const method of ['POST', 'OPTIONS']) {
+    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { headers: { Origin: origin }, method });
+    assert.equal(response.value.error, 'cep_origin_required', String(origin)); cors(response, undefined);
+  }
+  for (const values of [['null', 'null'], ['file://', 'file://'], ['null', 'file://'], ['file://', 'null']]) for (const method of ['POST', 'OPTIONS']) {
+    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { method, rawHeaders: ['Host', '127.0.0.1:' + port, 'Origin', values[0], 'oRiGiN', values[1], 'Content-Type', 'application/json'] });
+    assert.equal(response.value.error, 'cep_origin_required'); cors(response, undefined);
+  }
+  // HTTP OWS is stripped by Node's parser before application validation. This is
+  // a parser-layer observation, not a claim that original wire bytes are exact.
+  for (const origin of ['null', 'file://']) {
+    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { origin: ' \t' + origin + '\t ' });
+    assert.equal(response.status, 200); assert.equal(response.value.origin, origin); cors(response, origin);
+  }
+});
+for (const origin of ['null', 'file://']) test('installable-runtime Origin-bound challenge and peer preserve auth/sequence/pending/ACK: ' + origin, async t => {
+  const directory = temp(), peer = createHttpPeer({ installation, directory, asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
+  const port = peer.status().port, foreign = origin === 'null' ? 'file://' : 'null';
+  const raw = (route, body, selected = origin) => rawRequest(port, route, body, { origin: selected });
+  const challenge = async (role = 'panel') => (await raw('/challenge', { role })).value;
+  const link = (value, selected = origin, secret = installation.panelToken, peerId = 'test-peer') => raw('/link', { challenge: value, peerId, proof: mac({ challenge: value, peerId }, secret) }, selected);
+  const crossed = await challenge(); assert.equal((await link(crossed, foreign)).value.error, 'peer_auth');
+  assert.equal((await link(crossed)).value.error, 'peer_auth', 'foreign link burns the one-time challenge');
+  const tampered = await challenge(); tampered.origin = foreign;
+  assert.equal((await link(tampered, foreign)).value.error, 'peer_auth', 'even a recomputed valid MAC cannot replace the stored challenge');
+  const wrongPin = await challenge(); wrongPin.packageHash = 'a'.repeat(64);
+  assert.equal((await link(wrongPin)).value.error, 'peer_auth', 'stored pins remain bound even with a valid MAC');
+  assert.equal((await link(await challenge(), origin, installation.controlToken)).value.error, 'peer_auth');
+  const control = await challenge('control');
+  assert.equal((await link(control, foreign, installation.controlToken)).value.error, 'peer_auth', 'origin is checked before role');
+  assert.equal((await link(await challenge('control'), origin, installation.controlToken)).value.error, 'panel_role_required');
+  const expired = await challenge(), now = Date.now;
+  try { Date.now = () => now() + 10001; assert.equal((await link(expired)).value.error, 'peer_auth'); } finally { Date.now = now; }
+  const c = await client(port, installation, origin); assert.equal(c.challenge.origin, origin);
+  const other = await challenge(); assert.equal((await link(other, foreign, installation.panelToken, 'other-peer')).value.error, 'peer_auth', 'origin is checked before duplicate peer');
+  assert.equal(peer.status().peer.peerId, c.peerId);
+  assert.equal((await link(await challenge(), origin, installation.panelToken, 'other-peer')).value.error, 'duplicate_peer');
+  assert.equal((await link(c.challenge)).value.error, 'peer_auth', 'successful link is also one-time');
+  const envelope = c.envelope('/poll', {});
+  const rejected = await raw('/poll', envelope, foreign); assert.equal(rejected.value.error, 'peer_auth_or_replay'); cors(rejected, foreign);
+  const accepted = await raw('/poll', envelope); assert.equal(accepted.status, 200); cors(accepted, origin); assert.equal(accepted.value.body.sequence, 1);
+  assert.equal((await raw('/poll', envelope)).value.error, 'peer_auth_or_replay');
+  for (const patch of [{ epoch: 'old' }, { peerId: 'other' }, { sequence: 100 }, { method: 'GET' }, { path: '/complete' }]) {
+    const bad = c.envelope('/poll', {}, 2); Object.assign(bad.body, patch); bad.mac = mac(bad.body, installation.panelToken);
+    assert.equal((await raw('/poll', bad)).value.error, 'peer_auth_or_replay');
+  }
+  const wrongMac = c.envelope('/poll', {}, 2); wrongMac.mac = mac(wrongMac.body, installation.controlToken);
+  assert.equal((await raw('/poll', wrongMac)).value.error, 'peer_auth_or_replay');
+  const extraOrigin = c.envelope('/poll', {}, 2); extraOrigin.body.origin = origin; extraOrigin.mac = mac(extraOrigin.body, installation.panelToken);
+  assert.equal((await raw('/poll', extraOrigin)).value.error, 'unexpected_field', 'signed request schema is unchanged');
+  const fresh = c.envelope('/poll', {}, 2);
+  try {
+    Date.now = () => now() + 45001;
+    assert.equal((await raw('/poll', fresh, foreign)).value.error, 'peer_auth_or_replay');
+    assert.equal(peer.status().peer.connected, false, 'foreign request did not refresh lastSeen');
+    assert.equal((await raw('/poll', fresh)).status, 200); assert.equal(peer.status().peer.connected, true);
+  } finally { Date.now = now; }
+  let settled = false; const inspection = peer.inspect({}); inspection.then(() => { settled = true; }, () => { settled = true; });
+  const nextPoll = c.envelope('/poll', {}, 3), beforeDelivery = fs.readFileSync(path.join(directory, 'completions.ndjson'));
+  assert.equal(peer.status().pending.delivered, false);
+  assert.equal((await raw('/poll', nextPoll, foreign)).value.error, 'peer_auth_or_replay');
+  assert.equal(peer.status().pending.delivered, false); assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(beforeDelivery));
+  const frame = (await raw('/poll', nextPoll)).value.body.payload.command;
+  const receipt = { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result: { observationVersion: 1, target: { projectId: null, compId: null }, project: { name: 'Untitled', numItems: 0, saved: false }, compositions: [], layers: [], truncated: false, aeVersion: '26.0-fixture' } };
+  const completion = c.envelope('/complete', receipt, 4), before = fs.readFileSync(path.join(directory, 'completions.ndjson'));
+  const status = peer.status(); const denied = await raw('/complete', completion, foreign);
+  assert.equal(denied.value.error, 'peer_auth_or_replay'); assert.equal(denied.value.body, undefined); assert.equal(settled, false);
+  assert.deepEqual(peer.status().pending, status.pending); assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(before));
+  const ack = await raw('/complete', completion); assert.equal(ack.status, 200); cors(ack, origin);
+  assert.equal(ack.value.mac, mac(ack.value.body, installation.panelToken)); assert.equal(ack.value.body.payload.ack.commandId, frame.commandId);
+  assert.equal((await inspection).observation.project.name, 'Untitled'); assert.equal(peer.status().pending, null);
+  const completed = fs.readFileSync(path.join(directory, 'completions.ndjson'));
+  assert.equal(completed.toString().trim().split('\n').map(JSON.parse).filter(e => e.type === 'complete').length, 1);
+  assert.equal((await raw('/complete', completion)).value.error, 'peer_auth_or_replay');
+  assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(completed), 'same signed completion cannot ACK twice');
+});
+test('installable-runtime panel VM/WebCrypto shim validates challenge Origin before signing or link and signs full original challenge', async () => {
+  const source = fs.readFileSync(path.join(root, 'cep/js/panel.js'), 'utf8');
+  for (const origin of ['null', 'file://', undefined, '', 'NULL', 'FILE://', 'file:///', 'https://example.test']) {
+    const accepted = origin === 'null' || origin === 'file://', calls = [], signed = [];
+    const challenge = { epoch: 'shim-epoch', nonce: 'shim-nonce', role: 'panel', ...installation, executorHash: asset.executorHash, controllerId: 'shim-controller' };
+    delete challenge.panelToken; delete challenge.controlToken; if (origin !== undefined) challenge.origin = origin;
+    const cfg = { ...installation, executorHash: asset.executorHash, assetKey: asset.assetKey }, elements = { status: {}, detail: {} };
+    let finish; const finished = new Promise(resolve => { finish = resolve; });
+    elements.connect = { addEventListener() {}, set disabled(value) { if (!value) finish(); } };
+    let recovered = 0;
+    const cryptoShim = { getRandomValues: value => webcrypto.getRandomValues(value), subtle: { importKey: (...args) => webcrypto.subtle.importKey(...args), sign: (...args) => { signed.push(Buffer.from(args[2]).toString()); return webcrypto.subtle.sign(...args); } } };
+    const context = vm.createContext({ crypto: cryptoShim, TextEncoder, Uint8Array, localStorage: memoryStorage(), document: { getElementById: id => elements[id] }, __adobe_cep__: { evalScript() { throw new Error('no native dispatch in shim'); } },
+      Core4Installation: cfg,
+      async fetch(url, options) {
+        const route = new URL(url).pathname, value = JSON.parse(options.body); calls.push({ route, options, value });
+        assert.deepEqual(Object.keys(options.headers), ['Content-Type']); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
+        if (route === '/challenge') return { ok: true, json: async () => challenge };
+        if (route === '/link') {
+          assert.equal(canonical(value.challenge), canonical(challenge)); assert.equal(value.proof, mac({ challenge, peerId: value.peerId }, installation.panelToken));
+          const body = { peerId: value.peerId, epoch: challenge.epoch, pins: {} }; return { ok: true, json: async () => ({ body, mac: mac(body, installation.panelToken) }) };
+        }
+        assert.equal(route, '/poll'); throw new Error('shim_stop_after_poll');
+      }
+    });
+    vm.runInContext('window=this;', context);
+    vm.runInContext(fs.readFileSync(path.join(root, 'cep/js/poll-dispatcher.js'), 'utf8'), context);
+    context.Core4PollDispatcher.createDispatcher = () => ({ recover: async () => { recovered++; } });
+    vm.runInContext(source, context); await finished;
+    assert.deepEqual(calls.map(c => c.route), accepted ? ['/challenge', '/link', '/poll'] : ['/challenge'], elements.status.textContent);
+    assert.equal(recovered, accepted ? 1 : 0);
+    if (accepted) { assert.equal(signed[0], canonical({ challenge, peerId: calls[1].value.peerId })); assert.match(elements.status.textContent, /shim_stop_after_poll/); }
+    else { assert.equal(signed.length, 0); assert.equal(elements.status.textContent, 'Остановлено: installation_binding'); }
+  }
+});
 test('installable-runtime real HTTP and compiled registry VM: begin before evaluate, receipt before POST, durable ACK then latch clear', async t => {
   const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
   const c = await client(peer.status().port), storage = memoryStorage(); let physicalCalls = 0;
@@ -185,9 +331,9 @@ test('installable-runtime real HTTP and compiled registry VM: begin before evalu
   const missingAck = dispatcher(pkg, { installationId: 'wrong-ack', assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: host, complete: async () => ({ ack: { commandId: 'wrong' } }) });
   await assert.rejects(missingAck.dispatch(frame), /completion_ack_mismatch/); assert.ok(missingAck.pending().result);
 });
-test('installable-runtime callback loss fences durable store and persisted browser latch: no replay on reload or restart', async t => {
+for (const origin of ['null', 'file://']) test('installable-runtime callback loss fences durable store and persisted browser latch: no replay on reload or cross-Origin restart: ' + origin, async t => {
   const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0, timeout: 40 }); await peer.listen();
-  const c = await client(peer.status().port), storage = memoryStorage(); let physicalCalls = 0;
+  const c = await client(peer.status().port, installation, origin), storage = memoryStorage(); let physicalCalls = 0;
   const options = { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage, csInterface: { evalScript() { physicalCalls++; } }, complete: () => { throw new Error('unexpected'); } };
   const dispatch = dispatcher(pkg, options);
   const inspection = peer.inspect({}); const rejected = assert.rejects(inspection, /host_callback_timeout/);
@@ -197,6 +343,12 @@ test('installable-runtime callback loss fences durable store and persisted brows
   assert.equal(peer.status().unknown, true); await peer.close();
   const reopened = createHttpPeer({ installation, directory, asset, port: 0 }); await reopened.listen(); t.after(() => reopened.close());
   assert.equal(reopened.status().storeClosed, true); assert.throws(() => reopened.inspect({}), /receiver_lane_closed/);
+  const reconnected = await client(reopened.status().port, installation, origin === 'null' ? 'file://' : 'null');
+  const before = fs.readFileSync(path.join(directory, 'completions.ndjson'));
+  const receipt = { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result: { readFailureVersion: 1, outcome: 'rejected', code: 'inspection_failed' } };
+  assert.equal((await reconnected.raw('/complete', reconnected.envelope('/complete', receipt))).value.error, 'unknown_no_promotion');
+  assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(before)); assert.equal(physicalCalls, 1);
+  assert.throws(() => reopened.inspect({}), /receiver_lane_closed/);
 });
 test('installable-runtime missing fixed host registry returns known read rejection after durable begin, no raw fallback', async t => {
   const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0 }); await peer.listen(); t.after(() => peer.close());
``````

### context/evidence-summary.md

``````
# Сводка реализации Origin-патча и evidence

## Привязки

- Base: `aa1659819d3d9e1c51e87326d314f805a775334c` (source до patch совпадает с baseline plan-review `b42942afa92df0bcdb293ada05214f4ac13a3ed3`).
- Target source commit: `30311539ce2b2eb091d19c179667e513217e41cc`.
- Exact diff: `git diff aa1659819d3d9e1c51e87326d314f805a775334c 30311539ce2b2eb091d19c179667e513217e41cc -- core4`; изменены только `core4/README.md`, `core4/cep/js/panel.js`, `core4/integrations/cep/http-peer.js`, `core4/test/installable-runtime.test.js`.
- `core4/integrations/cep/peer-protocol.js` включён полностью и не изменён; SHA-256 на base и target одинаков.

## Сводка фактических изменений

HTTP peer теперь сначала проверяет точный IPv4 loopback Host/peer, затем ровно один Origin из allowlist `null` и `file://`; выбранный `corsOrigin` применяется к success/error/OPTIONS с `Vary: Origin` и без wildcard/credentials. Origin входит в выдаваемый challenge; `/link` требует совпадения с сохранённым challenge до дальнейшего принятия peer. `peer.origin` берётся из сохранённого challenge; post-link Origin проверяется общим auth guard до изменения sequence/lastSeen/pending/completion/ACK. Panel проверяет challenge.origin до HMAC/link и подписывает исходный полный challenge. Signed-body schema не расширена.

## Пять plan-review findings и локальное disposition

| Finding | Result evidence / disposition |
| --- | --- |
| `CEP-ORIGIN-PLAN-01` | `http-peer.js:27,30-32,103`: ingress guard назначает corsOrigin только после Host/Origin проверки, и ответам соответствует этот Origin. Тест `installable-runtime exact CEP Origin ingress and CORS success/error/OPTIONS matrix at Node HTTP boundary` проверяет success/error/OPTIONS, wrong Host и дубликаты. |
| `CEP-ORIGIN-PLAN-02` | `http-peer.js:45-49,54-55`: one-time stored challenge origin привязан на link; signed requests сравнивают peer.origin до sequence/lastSeen. Оба `Origin-bound challenge and peer preserve auth/sequence/pending/ACK` режима проверяют cross-origin отказ, тот же envelope/sequence после отказа и no-pending/no-ACK effects. Чужой `/link` сжигает одноразовый nonce, но peer не меняет. |
| `CEP-ORIGIN-PLAN-03` | Протокол намеренно оставлен прежним: hash `peer-protocol.js` совпадает base/target. В обеих Origin ветвях тест с extra `body.origin` получает `unexpected_field`. |
| `CEP-ORIGIN-PLAN-04` | Test helper `installable-runtime.test.js:29-35` явно задаёт Origin, method, headers/rawHeaders, удаляет missing header и использует `agent:false`; тестовая матрица включает OPTIONS 204, missing и сырые duplicate Origin lines. |
| `CEP-ORIGIN-PLAN-05` | `panel.js:14-16`: проверка challenge origin идёт до link/HMAC; тест `installable-runtime panel VM/WebCrypto shim validates challenge Origin before signing or link and signs full original challenge` проверяет положительный и отрицательный путь. |

Source reviewer дал read-only `ACCEPT` без actionable findings по сообщению root; это controller-provided evidence, а не приложенный независимый отчёт.

## Validation evidence freeze

Итоговый файл `validate-diff-02.stdout.txt` — точная копия полного Node test-runner **spec stdout**, не TAP: installable-runtime 20/20, manual-runtime 12/12, documentation 1/1; fail/skipped 0. В stdout есть одна scanner-совместимая длительность `duration_ms 10837.0721` (строка 462), числовое время выполнения тестов, не PII.

- installable-runtime: `node --test --test-name-pattern=installable-runtime test/installable-runtime.test.js`; evidence key `0fec7e93a3ea4605dcf86f5551f723272245b9b3c24feecd85067def0e6e640e`.
- manual-runtime: `node --test --test-name-pattern=manual-runtime test/manual-runtime.test.js`; evidence key `2e144affd7e68a3499256b83f240e6c563bd8abeb7b8b341dcb0a10d29cb1b13`.
- documentation: `node --test --test-name-pattern=documentation test/core4.test.js`; evidence key `204f058f382989a174b9e5d55cf05b874ab00a0b9e31c7f5840a147da00e2882`.
- Boundaries: 21 source units PASS, `liveCalls: 0`; log SHA-256 `4fe58209f99b184b26f779291af142ad56d22a5b9fb84c552e337ca7cc5df3e4`.
- Syntax/diff: three `node --check` files plus `git diff --check` PASS; log SHA-256 `8d9726741a6e8698d97e3aa99f6358f428104c453fac9dcf33db8ce5d65aa954`.
- Validation mode is scoped/selected-artifacts-only. Deferred current-closure checks: `windows-cim-probe`, `zero-dispatch-recovery`, `human-window`, `audit-repairs`, `cep-transport`, `lifecycle-simulation`; full release is not certified.
- Earlier focused attempts failed on HTTP reuse `ECONNRESET`, then test-side VM/canonical mismatches. They were resolved in the helper (`agent:false`) and by using the production poll-dispatcher canonical in the VM; production auth/timeouts/gates were not relaxed. The three targeted-attempt logs stay local; final passing stdout is included.

## Package candidate and release boundary

Two `buildPackage` + `verifyPackage` runs were byte-identical. Root independently checked 5 source hashes and all 56 package files and rebuilt candidate byte-identically. Package hash `6c94efb678b9a56861b18e762076da7b38824bbbe30233770c4133ff81edc696`; candidate file SHA-256 `fd4320d1f0e95540dce83515fffaf21c92bbdac09f82303005d305930f5caad3`; 56 files, 286740 bytes. Candidate is not installed. Against installed package `0aea…`, only packaged `http-peer.js` and `panel.js` differ.

## Открытые границы

Нет browser/CORS proof: Node tests задают Origin вручную; VM/WebCrypto/fetch проверки offline. Node HTTP parser сам убирает стандартный surrounding OWS, отдельного wire-level OWS rejection нет. Отдельный timing-specific activePoll probe отсутствует, хотя общий auth guard расположен до side effects. Не сделаны desktop/MSI round-trip P1–P8, install/read-back, full release и deferred integrations. Ни один из этих offline результат-review материалов не доказывает installed success.
``````

### context/http-peer.js

``````
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { hash, canonical, parse, bounded, exact, fail, id, dispatchBinding, decode, encode, envelope } = require('../../core/receiver-api');
const { openCompletionStore } = require('./completion-store');
const { mac, validMac, requestBody } = require('./peer-protocol');
function createHttpPeer({ installation, directory, asset, additionalAssets = [], port = 3457, timeout = 30000, pollTimeout = 15000, admissionGuard = () => {} }) {
  const store = openCompletionStore({ directory });
  const epoch = id('http'), controllerId = id('controller');
  let peer = null, pending = null, closed = false, activePoll = null;
  const challenges = new Map();
  const assets = new Map([asset, ...additionalAssets].map(a => [a.executorHash, a])); let brokerBinding;
  const pins = Object.freeze({ packageHash: installation.packageHash, executorHash: asset.executorHash, installationId: installation.installationId });
  const commandPins = command => ({ ...pins, executorHash: command.executorHash });
  function disconnect(reason) { if (pending) { store.unknown(pending.command.commandId); pending.reject(Object.assign(new Error(reason), { code: reason })); clearTimeout(pending.timer); pending = null; } }
  function frame() { return pending && !pending.delivered ? { assetKey: assets.get(pending.command.executorHash).assetKey, phase: pending.command.phase, typedPayload: pending.command.payload, commandId: pending.command.commandId, originalBinding: pending.binding, pins: commandPins(pending.command) } : null; }
  function deliver() { if (activePoll && frame()) { const poll = activePoll; activePoll = null; const value = frame(); pending.delivered = true; poll(value); } }
  function status() { return { listening: server.listening, port: server.address()?.port || port, peer: peer ? { connected: Date.now() - peer.lastSeen < 45000, peerId: peer.peerId } : { connected: false }, receiverStoreIdentity: store.identity || null, storeClosed: store.closed, storeFault: store.fault, pending: pending ? { commandId: pending.command.commandId, delivered: pending.delivered } : null, unknown: store.closed, automaticLifecycle: 'unavailable', externalLegacyCoverage: 'unobserved' }; }
  function reply(res, statusCode, value, origin) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) }); res.end(bounded(value));
  }
  const server = http.createServer(async (req, res) => {
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
        const body = { linked: true, epoch, peerId: peer.peerId, controllerId, pins, receiverStoreIdentity: store.identity, laneClosed: store.closed };
        reply(res, 200, { body, mac: mac(body, secret) }, corsOrigin); return;
      }
      exact(input, ['body', 'mac']); const b = requestBody(input.body);
      if (!peer || origin !== peer.origin || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, installation.panelToken)) fail('peer_auth_or_replay');
      peer.sequence = b.sequence; peer.lastSeen = Date.now();
      function signed(payload) { const body = { epoch, peerId: peer.peerId, sequence: b.sequence, payload }; reply(res, 200, { body, mac: mac(body, installation.panelToken) }, corsOrigin); }
      if (req.url === '/poll') {
        exact(b.payload, []); if (activePoll) fail('concurrent_poll');
        if (pending && !pending.delivered) { try { admissionGuard(pending.command); } catch (e) { disconnect(e.code || 'physical_admission_closed'); throw e; } }
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
        if (!c || canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(b.payload.pins) !== canonical(commandPins(c.command))) fail('completion_correlation');
        if (c.state === 'completed') { if (canonical(c.response.result) !== canonical(b.payload.result)) fail('completion_conflict'); signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return; }
        if (!pending || c.state !== 'ongoing' || !pending.delivered || pending.command.commandId !== b.payload.commandId) fail('unknown_no_promotion');
        const result = b.payload.result;
        const selectedAsset = assets.get(c.command.executorHash);
        if (result.readFailureVersion === 1) {
          exact(result, ['readFailureVersion', 'outcome', 'code']);
          if (result.outcome !== 'rejected' || !['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable'].includes(result.code)) fail('inspection_result');
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
        const done = pending; pending = null; clearTimeout(done.timer);
        signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } });
        if (result.readFailureVersion === 1) done.reject(Object.assign(new Error(result.code || 'inspection_failed'), { code: result.code || 'inspection_failed' })); else done.resolve(done.broker ? response : { observation: result, originalBinding: c.originalBinding, pins: commandPins(c.command), continuity: false });
        return;
      }
      fail('unknown_peer_route');
    } catch (e) { reply(res, e.code === 'frame_too_large' ? 413 : 403, { error: e.code || 'peer_request_failed' }, corsOrigin); }
  });
  function submit(command, broker = false) {
    const selected = assets.get(command.executorHash);
    if (!selected || selected.moduleId && (selected.moduleId !== command.moduleId || selected.operationId !== command.operationId) || !['inspect', 'mutate', 'verify'].includes(command.phase) || command.phase !== 'inspect' && selected.resultProfile !== 'manual-text-v1') fail('http_asset_not_admitted');
    admissionGuard(command);
    if (closed || store.closed) fail('receiver_lane_closed'); if (!peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); if (pending) fail('physical_lane_pending');
    const binding = dispatchBinding(command, store.identity); store.begin(command, binding);
    return new Promise((resolve, reject) => { pending = { command, binding, resolve, reject, broker, delivered: false, timer: setTimeout(() => disconnect('host_callback_timeout'), timeout) }; deliver(); });
  }
  return Object.freeze({
    status,
    identity: hash({ packageHash: installation.packageHash, assets: [...assets.values()] }),
    transport: Object.freeze({
      async connect(value) { if (store.closed || !peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); exact(value, ['controllerId', 'channelEpoch', 'secret']); brokerBinding = Object.freeze({ ...value }); return { receiverStoreIdentity: store.identity }; },
      async send(frame) { if (!brokerBinding) fail('transport_disconnected'); const command = envelope(decode(frame, brokerBinding.secret)); if (command.controllerId !== brokerBinding.controllerId || command.channelEpoch !== brokerBinding.channelEpoch) fail('controller_binding'); return encode(await submit(command, true), brokerBinding.secret); },
      async completion(commandId) { if (!brokerBinding) fail('transport_disconnected'); const c = store.get(commandId); return encode({ commandId, state: c?.state || 'unknown', ...(c?.originalBinding ? { originalBinding: c.originalBinding } : {}), ...(c?.response ? { response: c.response } : {}) }, brokerBinding.secret); },
      async disconnect() { if (pending) fail('physical_lane_pending'); brokerBinding = undefined; }
    }),
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return status(); },
    inspect(payload = {}) {
      exact(payload, ['compId']); if (payload.compId !== undefined && (!Number.isSafeInteger(payload.compId) || payload.compId < 1)) fail('invalid_comp_id');
      const command = { protocolVersion: 1, controllerId, channelEpoch: epoch, commandId: id('inspect'), moduleId: 'project-inspection', operationId: 'inspect', executorHash: asset.executorHash, phase: 'inspect', payloadHash: hash(canonical(payload)), payload };
      return submit(command);
    },
    async close() { closed = true; disconnect('runtime_closed'); if (activePoll) { const poll = activePoll; activePoll = null; poll(null); } await new Promise(resolve => server.close(resolve)); store.close(); }
  });
}
module.exports = { createHttpPeer };
``````

### context/panel.js

``````
(function () {
  'use strict';
  var cfg = window.Core4Installation, api = window.Core4PollDispatcher, status = document.getElementById('status'), detail = document.getElementById('detail'), button = document.getElementById('connect');
  var peerId, epoch, sequence = 0, linked = false, running = false;
  function show(s) { status.textContent = s; }
  async function sign(value) { var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.panelToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); var bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(api.canonical(value)))); return Array.from(bytes).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function post(path, value) { var response = await fetch('http://127.0.0.1:3457' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: api.canonical(value), credentials: 'omit', cache: 'no-store' }); var body = await response.json(); if (!response.ok) throw new Error(body.error || 'http_' + response.status); return body; }
  async function authenticated(path, payload) { var b = { epoch: epoch, peerId: peerId, sequence: ++sequence, method: 'POST', path: path, payload: payload }; var response = await post(path, { body: b, mac: await sign(b) }); if (response.mac !== await sign(response.body) || response.body.epoch !== epoch || response.body.peerId !== peerId || response.body.sequence !== b.sequence) throw new Error('response_auth'); return response.body.payload; }
  async function start() {
    if (running) return; running = true; button.disabled = true;
    try {
      if (!cfg || !window.crypto || !crypto.subtle || typeof TextEncoder !== 'function' || typeof fetch !== 'function' || !window.__adobe_cep__ || typeof __adobe_cep__.evalScript !== 'function') throw new Error('CEP_WebCrypto_or_host_unavailable');
      var random = new Uint8Array(24); crypto.getRandomValues(random); peerId = 'panel-' + Array.from(random).map(function (b) { return b.toString(16); }).join('');
      var challenge = await post('/challenge', { role: 'panel' });
      if (challenge.packageHash !== cfg.packageHash || challenge.installationId !== cfg.installationId || challenge.executorHash !== cfg.executorHash || challenge.role !== 'panel' || (challenge.origin !== 'null' && challenge.origin !== 'file://')) throw new Error('installation_binding');
      var response = await post('/link', { challenge: challenge, peerId: peerId, proof: await sign({ challenge: challenge, peerId: peerId }) });
      if (response.mac !== await sign(response.body) || response.body.peerId !== peerId || response.body.epoch !== challenge.epoch) throw new Error('link_auth');
      epoch = response.body.epoch; sequence = 0; linked = true;
      var dispatcher = api.createDispatcher({ installationId: cfg.installationId, assetKey: cfg.assetKey, assets: cfg.assets, pins: response.body.pins, storage: localStorage, csInterface: { evalScript: function (s, cb) { __adobe_cep__.evalScript(s, cb); } }, complete: function (p) { return authenticated('/complete', p); } });
      await dispatcher.recover(); if (response.body.laneClosed) throw new Error('receiver_lane_closed');
      show('Подключено к Core 4.0.0'); detail.textContent = 'Изменения текста требуют подтверждения в After Effects';
      while (linked) { var next = await authenticated('/poll', {}); if (next.command) await dispatcher.dispatch(next.command); }
    } catch (e) { linked = false; show('Остановлено: ' + e.message); detail.textContent = 'UNKNOWN не повторяется. Проверяйте core_status; перезагрузка не снимает fence.'; }
    finally { running = false; button.disabled = false; }
  }
  button.addEventListener('click', start); start();
}());
``````

### context/peer-protocol.js

``````
'use strict';
const crypto = require('node:crypto');
const { canonical, exact, fail } = require('../../core/receiver-api');
function mac(value, secret) { return crypto.createHmac('sha256', secret).update(canonical(value)).digest('hex'); }
function validMac(value, actual, secret) { const expected = mac(value, secret); return typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual) && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected)); }
function requestBody(value) { exact(value, ['epoch', 'peerId', 'sequence', 'method', 'path', 'payload']); if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) fail('peer_sequence'); return value; }
module.exports = { mac, validMac, requestBody };
``````

### context/source-metadata.json

``````
[
  {
    "path": "core4/integrations/cep/http-peer.js",
    "targetCommit": "30311539ce2b2eb091d19c179667e513217e41cc",
    "bytes": 14490,
    "sha256": "d2a6709a054e3cd029c4cf32168e8d9bba73b326af2a814f1754b038f16e676c",
    "baseBytes": 14197,
    "baseSha256": "24135024ce651eaa2586d85f7931c714745d582e7ae1f3b8a4890c7cc4e35df6",
    "unchangedAtTarget": false
  },
  {
    "path": "core4/cep/js/panel.js",
    "targetCommit": "30311539ce2b2eb091d19c179667e513217e41cc",
    "bytes": 3864,
    "sha256": "5c06ab424a0469380009eda2410da50d74dae62c009015ef9a7a3e41ba323662",
    "baseBytes": 3797,
    "baseSha256": "f59b51d4bd0c5ad699bce21d77382a7977367ce6f9c072bef7db5a8bb6af34c7",
    "unchangedAtTarget": false
  },
  {
    "path": "core4/integrations/cep/peer-protocol.js",
    "targetCommit": "30311539ce2b2eb091d19c179667e513217e41cc",
    "bytes": 718,
    "sha256": "9b4f3f3600b32a7e8efa3541bf795a05d485cd691324c374f1e65bab63a6f584",
    "baseBytes": 718,
    "baseSha256": "9b4f3f3600b32a7e8efa3541bf795a05d485cd691324c374f1e65bab63a6f584",
    "unchangedAtTarget": true
  },
  {
    "path": "changes.diff",
    "command": "git diff aa1659819d3d9e1c51e87326d314f805a775334c 30311539ce2b2eb091d19c179667e513217e41cc -- core4",
    "bytes": 31981,
    "sha256": "f7fdc1747c1aa26ea1ce2d94e64c508e2cae7dbfcd935c8f95932183adfb33b9",
    "changedFiles": [
      "core4/README.md",
      "core4/cep/js/panel.js",
      "core4/integrations/cep/http-peer.js",
      "core4/test/installable-runtime.test.js"
    ]
  },
  {
    "path": "validate-diff-02.stdout.txt",
    "source": "snapshots/core4-live-proof/IV-origin-portability-20261028/implementation-freeze/validate-diff-02.log",
    "bytes": 18659,
    "sha256": "d680e39a8526df8a3b33609375f822b4b8657cf0e5e04b1db02a2b064c866adc",
    "kind": "complete Node test-runner spec stdout; not TAP"
  }
]
``````

### context/validate-diff-02.stdout.txt

``````
{
  "mode": "scoped",
  "certification": "selected-artifacts-only",
  "releaseCertified": false,
  "contractImpacts": [],
  "checks": [
    {
      "check": "installable-runtime",
      "reasons": [
        "changed owner installable-runtime: core4/integrations/cep/http-peer.js",
        "changed owner installable-runtime: core4/cep/js/panel.js",
        "changed owner installable-runtime: core4/test/installable-runtime.test.js"
      ],
      "dependencyPaths": [
        [
          "core4/integrations/cep/http-peer.js",
          "installable-runtime",
          "installable-runtime"
        ],
        [
          "core4/cep/js/panel.js",
          "installable-runtime",
          "installable-runtime"
        ],
        [
          "core4/test/installable-runtime.test.js",
          "installable-runtime",
          "installable-runtime"
        ]
      ],
      "command": [
        "node",
        "--test",
        "--test-name-pattern=installable-runtime",
        "test/installable-runtime.test.js"
      ],
      "evidenceKey": "0fec7e93a3ea4605dcf86f5551f723272245b9b3c24feecd85067def0e6e640e",
      "reason": "changed owner installable-runtime: core4/integrations/cep/http-peer.js; changed owner installable-runtime: core4/cep/js/panel.js; changed owner installable-runtime: core4/test/installable-runtime.test.js",
      "dependencyPath": [
        [
          "core4/integrations/cep/http-peer.js",
          "installable-runtime",
          "installable-runtime"
        ],
        [
          "core4/cep/js/panel.js",
          "installable-runtime",
          "installable-runtime"
        ],
        [
          "core4/test/installable-runtime.test.js",
          "installable-runtime",
          "installable-runtime"
        ]
      ],
      "dependencies": [
        "cep/CSXS/manifest.xml",
        "cep/index.html",
        "cep/js/panel.js",
        "cep/js/poll-dispatcher.js",
        "cep/panel.css",
        "config/admissions/photo-placeholder.json",
        "config/admissions/titles-current-target.json",
        "config/admissions/titles.json",
        "config/catalog.json",
        "core/artifact.json",
        "core/artifacts.js",
        "core/authority.js",
        "core/broker.js",
        "core/ledger.js",
        "core/receiver-api.js",
        "core/receiver.js",
        "core/record-context.js",
        "core/resources.js",
        "core/state-lock.js",
        "core/stdio.js",
        "core/worker-client.js",
        "integrations/cep/completion-store.js",
        "integrations/cep/http-peer.js",
        "integrations/cep/peer-protocol.js",
        "modules/photo-placeholder/artifact.json",
        "modules/photo-placeholder/contract.json",
        "modules/photo-placeholder/executor.jsx",
        "modules/photo-placeholder/implementation.js",
        "modules/project-inspection/artifact.json",
        "modules/project-inspection/contract.json",
        "modules/project-inspection/executor.jsx",
        "modules/titles-current-target/artifact.json",
        "modules/titles-current-target/contract.json",
        "modules/titles-current-target/executor.jsx",
        "modules/titles-current-target/implementation.js",
        "modules/titles/artifact.json",
        "modules/titles/contract.json",
        "modules/titles/executor.jsx",
        "modules/titles/implementation.js",
        "plan-engine/artifact.json",
        "plan-engine/index.js",
        "protocol/artifact.json",
        "protocol/codec.js",
        "protocol/dispatch.js",
        "protocol/json.js",
        "protocol/schema.js",
        "protocol/target-contract.json",
        "runtime/host/json-codec.jsx",
        "runtime/installation.js",
        "runtime/manual-policy.js",
        "runtime/profiles.json",
        "runtime/source-package.json",
        "runtime/stdio-entry.js",
        "runtime/windows-host-probe.ps1",
        "runtime/windows-reservation-provider.js",
        "test/installable-runtime.test.js",
        "tools/adopt-host.js",
        "tools/install-core4.js",
        "tools/package-installable.js",
        "worker.js"
      ]
    },
    {
      "check": "manual-runtime",
      "reasons": [
        "changed public contract fixed-http-manual-asset-v1: core4/integrations/cep/http-peer.js"
      ],
      "dependencyPaths": [
        [
          "core4/integrations/cep/http-peer.js",
          "fixed-http-manual-asset-v1",
          "manual-runtime"
        ]
      ],
      "command": [
        "node",
        "--test",
        "--test-name-pattern=manual-runtime",
        "test/manual-runtime.test.js"
      ],
      "evidenceKey": "2e144affd7e68a3499256b83f240e6c563bd8abeb7b8b341dcb0a10d29cb1b13",
      "reason": "changed public contract fixed-http-manual-asset-v1: core4/integrations/cep/http-peer.js",
      "dependencyPath": [
        [
          "core4/integrations/cep/http-peer.js",
          "fixed-http-manual-asset-v1",
          "manual-runtime"
        ]
      ],
      "dependencies": [
        "cep/CSXS/manifest.xml",
        "cep/index.html",
        "cep/js/panel.js",
        "cep/js/poll-dispatcher.js",
        "cep/panel.css",
        "config/admissions/photo-placeholder.json",
        "config/admissions/titles-current-target.json",
        "config/admissions/titles.json",
        "config/catalog.json",
        "core/artifact.json",
        "core/artifacts.js",
        "core/authority.js",
        "core/broker.js",
        "core/ledger.js",
        "core/receiver-api.js",
        "core/receiver.js",
        "core/record-context.js",
        "core/resources.js",
        "core/state-lock.js",
        "core/stdio.js",
        "core/worker-client.js",
        "integrations/cep/completion-store.js",
        "integrations/cep/http-peer.js",
        "integrations/cep/peer-protocol.js",
        "modules/photo-placeholder/artifact.json",
        "modules/photo-placeholder/contract.json",
        "modules/photo-placeholder/executor.jsx",
        "modules/photo-placeholder/implementation.js",
        "modules/project-inspection/artifact.json",
        "modules/project-inspection/contract.json",
        "modules/project-inspection/executor.jsx",
        "modules/titles-current-target/artifact.json",
        "modules/titles-current-target/contract.json",
        "modules/titles-current-target/executor.jsx",
        "modules/titles-current-target/implementation.js",
        "modules/titles/artifact.json",
        "modules/titles/contract.json",
        "modules/titles/executor.jsx",
        "modules/titles/implementation.js",
        "plan-engine/artifact.json",
        "plan-engine/index.js",
        "protocol/artifact.json",
        "protocol/codec.js",
        "protocol/dispatch.js",
        "protocol/json.js",
        "protocol/schema.js",
        "protocol/target-contract.json",
        "runtime/host/json-codec.jsx",
        "runtime/installation.js",
        "runtime/manual-policy.js",
        "runtime/profiles.json",
        "runtime/source-package.json",
        "runtime/stdio-entry.js",
        "runtime/windows-host-probe.ps1",
        "runtime/windows-reservation-provider.js",
        "test/fixtures/ae.js",
        "test/fixtures/manual-http-runtime.js",
        "test/manual-runtime.test.js",
        "tools/package-installable.js",
        "worker.js"
      ]
    },
    {
      "check": "documentation",
      "reasons": [
        "changed owner documentation: core4/README.md",
        "changed component dependency README.md: core4/README.md"
      ],
      "dependencyPaths": [
        [
          "core4/README.md",
          "documentation",
          "documentation"
        ],
        [
          "core4/README.md",
          "README.md",
          "documentation"
        ]
      ],
      "command": [
        "node",
        "--test",
        "--test-name-pattern=documentation",
        "test/core4.test.js"
      ],
      "evidenceKey": "204f058f382989a174b9e5d55cf05b874ab00a0b9e31c7f5840a147da00e2882",
      "reason": "changed owner documentation: core4/README.md; changed component dependency README.md: core4/README.md",
      "dependencyPath": [
        [
          "core4/README.md",
          "documentation",
          "documentation"
        ],
        [
          "core4/README.md",
          "README.md",
          "documentation"
        ]
      ],
      "dependencies": [
        "README.md",
        "test/core4.test.js"
      ]
    }
  ],
  "executionBatches": [
    {
      "checks": [
        "installable-runtime"
      ],
      "command": [
        "node",
        "--test",
        "--test-name-pattern=(?:installable-runtime)",
        "test/installable-runtime.test.js"
      ]
    },
    {
      "checks": [
        "manual-runtime"
      ],
      "command": [
        "node",
        "--test",
        "--test-name-pattern=(?:manual-runtime)",
        "test/manual-runtime.test.js"
      ]
    },
    {
      "checks": [
        "documentation"
      ],
      "command": [
        "node",
        "--test",
        "--test-name-pattern=(?:documentation)",
        "test/core4.test.js"
      ]
    }
  ],
  "deferredCoverage": [
    {
      "check": "windows-cim-probe",
      "status": "current-closure-unverified",
      "changedDependencies": [
        {
          "file": "core4/integrations/cep/http-peer.js",
          "dependency": "integrations/cep/http-peer.js"
        },
        {
          "file": "core4/cep/js/panel.js",
          "dependency": "cep/"
        }
      ],
      "reason": "Integration bytes changed outside this scoped owner/public/shared contract route; no current-closure PASS or release certification is claimed.",
      "dependencyPath": [
        [
          "core4/integrations/cep/http-peer.js",
          "integrations/cep/http-peer.js",
          "windows-cim-probe"
        ],
        [
          "core4/cep/js/panel.js",
          "cep/",
          "windows-cim-probe"
        ]
      ]
    },
    {
      "check": "zero-dispatch-recovery",
      "status": "current-closure-unverified",
      "changedDependencies": [
        {
          "file": "core4/integrations/cep/http-peer.js",
          "dependency": "integrations/cep/http-peer.js"
        },
        {
          "file": "core4/cep/js/panel.js",
          "dependency": "cep/"
        }
      ],
      "reason": "Integration bytes changed outside this scoped owner/public/shared contract route; no current-closure PASS or release certification is claimed.",
      "dependencyPath": [
        [
          "core4/integrations/cep/http-peer.js",
          "integrations/cep/http-peer.js",
          "zero-dispatch-recovery"
        ],
        [
          "core4/cep/js/panel.js",
          "cep/",
          "zero-dispatch-recovery"
        ]
      ]
    },
    {
      "check": "human-window",
      "status": "current-closure-unverified",
      "changedDependencies": [
        {
          "file": "core4/integrations/cep/http-peer.js",
          "dependency": "integrations/cep/http-peer.js"
        },
        {
          "file": "core4/cep/js/panel.js",
          "dependency": "cep/"
        }
      ],
      "reason": "Integration bytes changed outside this scoped owner/public/shared contract route; no current-closure PASS or release certification is claimed.",
      "dependencyPath": [
        [
          "core4/integrations/cep/http-peer.js",
          "integrations/cep/http-peer.js",
          "human-window"
        ],
        [
          "core4/cep/js/panel.js",
          "cep/",
          "human-window"
        ]
      ]
    },
    {
      "check": "audit-repairs",
      "status": "current-closure-unverified",
      "changedDependencies": [
        {
          "file": "core4/integrations/cep/http-peer.js",
          "dependency": "integrations/cep/"
        }
      ],
      "reason": "Integration bytes changed outside this scoped owner/public/shared contract route; no current-closure PASS or release certification is claimed.",
      "dependencyPath": [
        [
          "core4/integrations/cep/http-peer.js",
          "integrations/cep/",
          "audit-repairs"
        ]
      ]
    },
    {
      "check": "cep-transport",
      "status": "current-closure-unverified",
      "changedDependencies": [
        {
          "file": "core4/integrations/cep/http-peer.js",
          "dependency": "integrations/cep/"
        }
      ],
      "reason": "Integration bytes changed outside this scoped owner/public/shared contract route; no current-closure PASS or release certification is claimed.",
      "dependencyPath": [
        [
          "core4/integrations/cep/http-peer.js",
          "integrations/cep/",
          "cep-transport"
        ]
      ]
    },
    {
      "check": "lifecycle-simulation",
      "status": "current-closure-unverified",
      "changedDependencies": [
        {
          "file": "core4/integrations/cep/http-peer.js",
          "dependency": "integrations/cep/"
        },
        {
          "file": "core4/test/installable-runtime.test.js",
          "dependency": "test/"
        }
      ],
      "reason": "Integration bytes changed outside this scoped owner/public/shared contract route; no current-closure PASS or release certification is claimed.",
      "dependencyPath": [
        [
          "core4/integrations/cep/http-peer.js",
          "integrations/cep/",
          "lifecycle-simulation"
        ],
        [
          "core4/test/installable-runtime.test.js",
          "test/",
          "lifecycle-simulation"
        ]
      ]
    }
  ]
}
✔ installable-runtime package deterministic closure, install CAS, exact rollback and stable origin (1108.5913ms)
✔ installable-runtime exact release closure rejects extensionless shadow, empty directory and junction before package imports (1274.8339ms)
✔ installable-runtime stale release A entry cannot verify B descriptor then import unchecked A dependencies (1217.4344ms)
✔ installable-runtime descriptor changed at startup gate is rejected before package imports (704.5098ms)
✔ installable-runtime bounded TOML edit preserves indented neighboring servers and inline-commented Core4 header bytes (258.9635ms)
✔ installable-runtime CLI apply requires reviewed package hash and mismatches have zero installation writes (142.8228ms)
✔ installable-runtime unknown Broker owner, ledger fault or unresolved intent permits diagnostics but no new physical read begin (2252.3809ms)
✔ installable-runtime actual HTTP auth role, origin, challenge, epoch, replay, bounded input and duplicate peer (36.4124ms)
✔ installable-runtime exact CEP Origin ingress and CORS success/error/OPTIONS matrix at Node HTTP boundary (55.65ms)
✔ installable-runtime Origin-bound challenge and peer preserve auth/sequence/pending/ACK: null (63.3477ms)
✔ installable-runtime Origin-bound challenge and peer preserve auth/sequence/pending/ACK: file:// (62.1995ms)
✔ installable-runtime panel VM/WebCrypto shim validates challenge Origin before signing or link and signs full original challenge (9.5605ms)
✔ installable-runtime real HTTP and compiled registry VM: begin before evaluate, receipt before POST, durable ACK then latch clear (41.4065ms)
✔ installable-runtime callback loss fences durable store and persisted browser latch: no replay on reload or cross-Origin restart: null (84.3474ms)
✔ installable-runtime callback loss fences durable store and persisted browser latch: no replay on reload or cross-Origin restart: file:// (94.2219ms)
✔ installable-runtime missing fixed host registry returns known read rejection after durable begin, no raw fallback (38.4357ms)
✔ installable-runtime long Cyrillic display names and total inspection budget stay bounded at actual HTTP boundary; next read survives known budget refusal (296.5799ms)
✔ installable-runtime real stdio child advertises generic API, status without panel, then typed module inspect via HTTP + VM (885.3878ms)
✔ installable-runtime private adoption bootstrap imports no mutable operator-relative provider before verified release preflight (760.3747ms)
✔ installable-runtime real stdio process crash after delivery preserves original ongoing record and blocks new reads after restart (1368.7248ms)
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 10837.0721
✔ manual-runtime actual Broker HTTP compiled JSX generic flow uses one native confirm and original local transaction receipt without session (407.4339ms)
✔ manual-runtime native cancellation and post-confirm drift do not set text; fresh proposal required (517.0216ms)
✔ manual-runtime absent adoption and ambiguous process/managed writer fail before mutation delivery (432.4519ms)
✔ manual-runtime setter uncertainty keeps UNKNOWN, durable receiver fence and no replay (260.4065ms)
✔ manual-runtime fresh OS process identity, named managed writers and observation TTL are required before delivery (1119.14ms)
✔ manual-runtime v1 UNKNOWN fence still overlaps session-free target; known other-machine constraint is separate (530.0613ms)
✔ manual-runtime forged policy/reservation JSON never receives a private brand; tampered original receipt cannot succeed and real original proof reconciles without replay (352.7436ms)
✔ manual-runtime final synchronous reservation guard rejects expiry before send with no setter (2345.6736ms)
✔ manual-runtime authenticated but wrong protocol version cannot certify original completion (260.0913ms)
✔ manual-runtime explicit oneStep works with physically absent engine and unrelated packages (329.3415ms)
✔ manual-runtime lexical ES3 JSON codec is data-only, matches native JSON on Unicode/control values and denies malformed/deep/duplicate/prototype input (21.3152ms)
✔ manual-runtime known paragraph Enumerator is normalized to numeric protected value; unknown host objects fail closed (21.0671ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6669.4711
✔ [documentation] local README records offline and UNKNOWN constraints (1.2487ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 236.9274
``````

