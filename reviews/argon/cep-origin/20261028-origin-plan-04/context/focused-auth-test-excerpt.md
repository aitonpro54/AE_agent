<!-- Source: core4/test/installable-runtime.test.js; baseline: b42942afa92df0bcdb293ada05214f4ac13a3ed3; full-file SHA-256: 536d144b4355fece552ef867a90192a266c9b9a5b5ad782855a1d1aad492ab8e; included lines: 159-170. -->

## core4/test/installable-runtime.test.js:159-170

```text
test('installable-runtime actual HTTP auth role, origin, challenge, epoch, replay, bounded input and duplicate peer', async t => {
  const peer = createHttpPeer({ installation, directory: temp(), asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port);
  const foreign = await c.raw('/challenge', { role: 'panel' }, { Origin: 'https://example.test' }); assert.equal(foreign.status, 403);
  const wrongHost = await c.raw('/challenge', { role: 'panel' }, { Host: 'localhost:' + peer.status().port }); assert.equal(wrongHost.status, 403);
  const control = (await c.raw('/challenge', { role: 'control' })).value;
  assert.equal((await c.raw('/link', { challenge: control, peerId: 'control', proof: mac({ challenge: control, peerId: 'control' }, installation.controlToken) })).status, 403);
  const another = (await c.raw('/challenge', { role: 'panel' })).value;
  assert.equal((await c.raw('/link', { challenge: another, peerId: 'duplicate', proof: mac({ challenge: another, peerId: 'duplicate' }, installation.panelToken) })).value.error, 'duplicate_peer');
  const poll = c.envelope('/poll', {}); assert.equal((await c.raw('/poll', poll)).status, 200); assert.equal((await c.raw('/poll', poll)).status, 403);
  const old = c.envelope('/poll', {}); old.body.epoch = 'old'; old.mac = mac(old.body, installation.panelToken); assert.equal((await c.raw('/poll', old)).status, 403);
  const big = await c.raw('/challenge', { role: 'panel', padding: 'x'.repeat(300000) }); assert.equal(big.status, 413);
```

