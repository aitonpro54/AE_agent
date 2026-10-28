<!-- Source: core4/test/installable-runtime.test.js; baseline: b42942afa92df0bcdb293ada05214f4ac13a3ed3; full-file SHA-256: 536d144b4355fece552ef867a90192a266c9b9a5b5ad782855a1d1aad492ab8e; included lines: 28-35. -->

## core4/test/installable-runtime.test.js:28-35

```text
async function client(port, config = installation) {
  let sequence = 0;
  const base = 'http://127.0.0.1:' + port;
  async function raw(route, body, extra = {}) { return new Promise((resolve, reject) => { const req = http.request(base + route, { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json', ...extra } }, res => { let data = ''; res.on('data', b => data += b); res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(data) })); }); req.on('error', reject); req.end(canonical(body)); }); }
  const challenge = (await raw('/challenge', { role: 'panel' })).value, peerId = 'test-peer';
  const link = await raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, config.panelToken) });
  assert.equal(link.status, 200); assert.equal(link.value.mac, mac(link.value.body, config.panelToken));
  return {
```

