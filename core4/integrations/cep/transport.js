'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, exact, fail, validateLifecycleBinding } = require('../../core/receiver-api');
// Import reads only own source bytes for loaded-code identity. It opens no channel,
// listener, process or state. Only an explicit private embedding supplies a channel.
const loadedHashes = Object.freeze({
  'transport.js': hash(fs.readFileSync(__filename)),
  'completion-store.js': require('./completion-store').sourceHash,
  'host-dispatcher.js': require('./host-dispatcher').sourceHash,
  'wire.js': require('./wire').sourceHash,
  'manifest.json': hash(fs.readFileSync(path.join(__dirname, 'manifest.json')))
});
function artifactIdentity() {
  const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'artifact.json'), 'utf8'));
  for (const [file, expected] of Object.entries(artifact.hashes)) {
    if (!Object.hasOwn(loadedHashes, file) || loadedHashes[file] !== expected || hash(fs.readFileSync(path.join(__dirname, file))) !== expected) fail('transport_artifact_bytes');
  }
  if (Object.keys(artifact.hashes).length !== 5) fail('transport_artifact_incomplete');
  return hash(artifact);
}
function createTransport({ channel, lifecycleProducer } = {}) {
  const identity = artifactIdentity(); let binding, current, connecting = false, generation = 0;
  return Object.freeze({ identity,
    async connect(value) {
      exact(value, ['controllerId', 'channelEpoch', 'secret']);
      if (binding || connecting) fail('transport_already_connected');
      if (!channel || typeof lifecycleProducer !== 'function') return { available: false, reason: 'trusted_project_lifecycle_unavailable' };
      connecting = true; const epoch = generation;
      try {
        const sessionBinding = await lifecycleProducer();
        if (!validateLifecycleBinding(sessionBinding)) return { available: false, reason: 'trusted_project_lifecycle_unavailable' };
        const connected = await channel.connect(Object.freeze({ ...value }));
        if (epoch !== generation) { await connected?.disconnect(); fail('transport_connection_cancelled'); }
        if (!connected || typeof connected.receiverStoreIdentity !== 'string') { await connected?.disconnect(); fail('receiver_store_identity_unavailable'); }
        current = connected; binding = Object.freeze({ ...value });
        return { sessionBinding, receiverStoreIdentity: current.receiverStoreIdentity };
      } finally { connecting = false; }
    },
    send(frame) { if (!binding) fail('transport_disconnected'); return current.send(frame); },
    completion(commandId) { if (!binding) fail('transport_disconnected'); return current.completion(commandId); },
    async disconnect() { generation++; const previous = current; binding = undefined; current = undefined; if (previous) await previous.disconnect(); }
  });
}
module.exports = { createTransport };
