'use strict';
// Process/module-local mutex capability. This is NOT recovery/AE authority.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const leases = new WeakMap();
function fail(code) { throw Object.assign(new Error(code), { code }); }
function safeDirectory(directory, io) {
  const absolute = path.resolve(directory); if (absolute !== directory) fail('lease_absolute_path');
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) { cursor = path.join(cursor, part); const stat = io.lstatSync(cursor); if (stat.isSymbolicLink() || stat.reparsePoint || !stat.isDirectory() || io.realpathSync(cursor) !== cursor) fail('lease_path'); }
}
function pathsFor({ installRoot, stateDir, descriptorPath }) {
  if (!path.isAbsolute(installRoot) || path.resolve(installRoot) !== installRoot || stateDir !== path.join(installRoot, 'state/production') || descriptorPath !== path.join(installRoot, 'installation.json')) fail('lease_scope');
  return { installRoot, stateDir, descriptorPath, installGate: path.join(installRoot, 'install.lock'), brokerGate: path.join(stateDir, 'broker/broker-owner.gate') };
}
function acquireInstallLease(scope, ...unsupported) {
  if (unsupported.length) fail('install_lease_options_forbidden');
  const io = fs;
  const paths = pathsFor(scope), lease = Object.freeze({}), item = { paths, io, gates: [], phase: 'acquired', retained: false, released: false, checkpoint: null };
  io.mkdirSync(paths.installRoot, { recursive: true }); safeDirectory(paths.installRoot, io);
  io.mkdirSync(path.join(paths.stateDir, 'broker'), { recursive: true }); safeDirectory(path.join(paths.stateDir, 'broker'), io);
  try {
    for (const file of [paths.installGate, paths.brokerGate]) {
      const bytes = Buffer.from('core4-install-lease-v1-' + crypto.randomUUID()); let fd;
      try {
        fd = io.openSync(file, 'wx'); const stat = io.fstatSync(fd, { bigint: true }); item.gates.push({ file, bytes, fd, dev: String(stat.dev), ino: String(stat.ino) });
        if (io.writeSync(fd, bytes) !== bytes.length) fail('lease_short_write'); io.fsyncSync(fd);
        if (!io.readFileSync(file).equals(bytes)) fail('lease_readback');
      } catch (e) { if (fd !== undefined) item.retained = true; throw e; }
    }
    leases.set(lease, item); assertInstallLease(lease, scope); return lease;
  } catch (e) {
    for (const gate of [...item.gates].reverse()) { try { io.closeSync(gate.fd); } catch { item.retained = true; } if (!item.retained) { try { if (!io.readFileSync(gate.file).equals(gate.bytes)) fail('lease_changed'); io.unlinkSync(gate.file); } catch { item.retained = true; } } }
    if (item.retained) e.leaseRetained = true; throw e;
  }
}
function state(lease) { const value = lease && leases.get(lease); if (!value || value.released) fail('install_lease_brand'); return value; }
function assertInstallLease(lease, scope) {
  const item = state(lease), expected = pathsFor(scope);
  if (Object.keys(expected).some(k => expected[k] !== item.paths[k])) fail('install_lease_scope');
  for (const gate of item.gates) {
    const stat = item.io.lstatSync(gate.file, { bigint: true }), held = item.io.fstatSync(gate.fd, { bigint: true });
    if (stat.isSymbolicLink() || item.io.realpathSync(gate.file) !== gate.file || String(stat.dev) !== gate.dev || String(stat.ino) !== gate.ino || String(held.dev) !== gate.dev || String(held.ino) !== gate.ino || !item.io.readFileSync(gate.file).equals(gate.bytes)) fail('install_lease_changed');
  }
  return Object.freeze({ ...item.paths, phase: item.phase, checkpoint: item.checkpoint && Object.freeze({ ...item.checkpoint }), retained: item.retained });
}
function ownedLeaseGates(lease) { const item = state(lease); assertInstallLease(lease, item.paths); return new Map(item.gates.map(g => [g.file, Buffer.from(g.bytes)])); }
function checkpointInstallLease(lease, phase, checkpoint = null) {
  const item = state(lease); assertInstallLease(lease, item.paths);
  const allowed = { acquired: ['validated', 'installing'], validated: ['disposition-appended'], 'disposition-appended': ['receiver-archived'], 'receiver-archived': ['installing'], installing: ['installed'] };
  if (!allowed[item.phase]?.includes(phase)) fail('install_lease_phase');
  // Phase/checkpoint records describe held work. Install admission independently
  // verifies fixed journal semantics and signatures; this is never a skip gate.
  item.phase = phase; item.checkpoint = checkpoint && Object.freeze({ ...checkpoint });
}
function retainInstallLease(lease) { const item = state(lease); item.retained = true; }
function releaseInstallLease(lease) {
  const item = state(lease); assertInstallLease(lease, item.paths); if (item.retained) fail('install_lease_retained');
  try {
    for (const gate of [...item.gates].reverse()) { item.io.closeSync(gate.fd); gate.fd = undefined; if (!item.io.readFileSync(gate.file).equals(gate.bytes)) fail('install_lease_changed'); item.io.unlinkSync(gate.file); }
    item.released = true;
  } catch (e) { item.retained = true; throw e; }
}
module.exports = { acquireInstallLease, assertInstallLease, ownedLeaseGates, checkpointInstallLease, retainInstallLease, releaseInstallLease };
