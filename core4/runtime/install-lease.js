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
function assertInstallLease(lease, scope, { full = false } = {}) {
  const item = state(lease), expected = pathsFor(scope);
  if (Object.keys(expected).some(k => expected[k] !== item.paths[k])) fail('install_lease_scope');
  if (full && item.gates.length !== 2) fail('install_lease_incomplete');
  for (const gate of item.gates) {
    if (item.maintenance) { checkMaintenanceGate(item.io, gate); continue; }
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
    for (const gate of [...item.gates].reverse()) {
      if (item.maintenance) { checkMaintenanceGate(item.io, gate); item.io.unlinkSync(gate.file); item.io.closeSync(gate.fd); gate.fd = undefined; }
      else { item.io.closeSync(gate.fd); gate.fd = undefined; if (!item.io.readFileSync(gate.file).equals(gate.bytes)) fail('install_lease_changed'); item.io.unlinkSync(gate.file); }
    }
    item.released = true;
  } catch (e) { item.retained = true; throw e; }
}
const FIELDS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const stamp = s => Object.fromEntries(FIELDS.map(k => [k, String(s[k])]));
function checkMaintenanceGate(io, gate) {
  const named = io.lstatSync(gate.file, { bigint: true }), held = io.fstatSync(gate.fd, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink() || io.realpathSync(gate.file) !== gate.file || FIELDS.some(k => String(named[k]) !== String(held[k]) || gate.stat && String(named[k]) !== gate.stat[k]) || named.size !== BigInt(gate.bytes.length)) fail('install_lease_changed');
  const bytes = Buffer.alloc(gate.bytes.length + 1); let at = 0, n;
  while (at < bytes.length && (n = io.readSync(gate.fd, bytes, at, bytes.length - at, at))) at += n;
  if (at !== gate.bytes.length || !bytes.subarray(0, at).equals(gate.bytes) || FIELDS.some(k => String(io.fstatSync(gate.fd, { bigint: true })[k]) !== String(named[k]) || String(io.lstatSync(gate.file, { bigint: true })[k]) !== String(named[k]))) fail('install_lease_changed');
  return stamp(named);
}
function publishMaintenanceGate(file, bytes, nonce) {
  const stage = file + '.stage-' + nonce; let fd;
  try {
    fd = fs.openSync(stage, 'wx+'); if (fs.writeSync(fd, bytes) !== bytes.length) fail('lease_short_write'); fs.fsyncSync(fd);
    checkMaintenanceGate(fs, { file: stage, fd, bytes }); fs.linkSync(stage, file); checkMaintenanceGate(fs, { file: stage, fd, bytes }); checkMaintenanceGate(fs, { file, fd, bytes }); fs.unlinkSync(stage);
    const before = checkMaintenanceGate(fs, { file, fd, bytes }), closing = fd; fd = undefined; fs.closeSync(closing);
    fd = fs.openSync(file, 'r'); const gate = { file, fd, bytes, dev: before.dev, ino: before.ino }, after = checkMaintenanceGate(fs, gate);
    if (FIELDS.filter(k => k !== 'ctimeNs').some(k => before[k] !== after[k])) fail('install_lease_changed'); gate.stat = after; fd = undefined; return gate;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function acquireMaintenanceInstallLease(capability) {
  // The permit is module-private and can only be minted after full-role proof,
  // death/settlement/CAS checks and a durable process-bound resume intent.
  const permit = require('./owner-maintenance').maintenanceLeasePermit(capability), paths = pathsFor(permit.scope);
  if (!Array.isArray(permit.gates) || permit.gates.length !== 2 || permit.gates.some(b => !Buffer.isBuffer(b) || b.length > 16384) || !/^[a-f0-9-]{36}$/.test(permit.nonce)) fail('install_lease_brand');
  safeDirectory(paths.installRoot, fs); safeDirectory(path.join(paths.stateDir, 'broker'), fs);
  const lease = Object.freeze({}), item = { paths, io: fs, gates: [], phase: 'acquired', retained: false, released: false, checkpoint: null, maintenance: true };
  try {
    for (const [index, file] of [paths.installGate, paths.brokerGate].entries()) {
      if (!permit.recovery) item.gates.push(publishMaintenanceGate(file, permit.gates[index], permit.nonce));
      else {
        if (!Array.isArray(permit.facts) || permit.facts.length !== 2) fail('install_lease_changed');
        const expected = permit.facts[index];
        if (expected.file !== file || expected.hash !== crypto.createHash('sha256').update(permit.gates[index]).digest('hex')) fail('install_lease_changed');
        let exists = true; try { fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') exists = false; else throw e; }
        if (exists) {
          const fd = fs.openSync(file, 'r'), gate = { file, fd, bytes: permit.gates[index], stat: expected.stat, dev: expected.stat.dev, ino: expected.stat.ino }; item.gates.push(gate); checkMaintenanceGate(fs, gate);
        }
      }
    }
    leases.set(lease, item); assertInstallLease(lease, permit.scope); return lease;
  } catch (e) { for (const gate of item.gates) { try { fs.closeSync(gate.fd); } catch {} } e.leaseRetained = true; throw e; }
}
function maintenanceLeaseFacts(lease) {
  const item = state(lease); if (!item.maintenance) fail('install_lease_brand'); assertInstallLease(lease, item.paths);
  return item.gates.map(g => ({ file: g.file, hash: crypto.createHash('sha256').update(g.bytes).digest('hex'), stat: checkMaintenanceGate(item.io, g) }));
}
function acquireMaintenanceFinishLease(capability) {
  const p = require('./owner-maintenance').maintenanceLeasePermit(capability);
  if (p.kind !== 'finish' || !p.recovery || !['commit', 'release'].includes(p.mode) || p.mode === 'commit' && p.facts.some(f => f.stat === null)) fail('maintenance_lease_brand');
  return acquireMaintenanceInstallLease(capability);
}
function acquireSealedLease(permit, installOnly = false) {
  const paths = pathsFor(permit.scope);
  if (!Array.isArray(permit.gates) || permit.gates.length !== 2 || permit.gates.some(b => !Buffer.isBuffer(b) || !b.length || b.length > 16384) || !/^[a-f0-9-]{36}$/.test(permit.nonce)) fail('install_lease_brand');
  safeDirectory(paths.installRoot, fs); safeDirectory(path.join(paths.stateDir, 'broker'), fs);
  const lease = Object.freeze({}), item = { paths, io: fs, gates: [], phase: 'acquired', retained: false, released: false, checkpoint: null, maintenance: true, update: true };
  try {
    for (const [index, file] of [paths.installGate, paths.brokerGate].entries()) {
      if (installOnly && index === 1) break;
      if (!permit.recovery) item.gates.push(publishMaintenanceGate(file, permit.gates[index], permit.nonce));
      else {
        const expected = permit.facts?.[index];
        if (!expected || expected.file !== file || expected.hash !== crypto.createHash('sha256').update(permit.gates[index]).digest('hex')) fail('install_lease_changed');
        if (permit.recoverMissing && expected.stat === null) { item.gates.push(publishMaintenanceGate(file, permit.gates[index], permit.nonce)); continue; }
        if (permit.releaseOnly) { try { fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; } }
        const fd = fs.openSync(file, 'r'), gate = { file, fd, bytes: permit.gates[index], stat: expected.stat };
        item.gates.push(gate); checkMaintenanceGate(fs, gate);
      }
    }
    leases.set(lease, item); assertInstallLease(lease, permit.scope); return lease;
  } catch (error) { for (const gate of item.gates) try { fs.closeSync(gate.fd); } catch {} error.leaseRetained = true; throw error; }
}
function acquireStoppedUpdateLease(capability) { return acquireSealedLease(require('../tools/stopped-update').stoppedUpdateLeasePermit(capability)); }
function acquireLegacyMigrationInstallLease(capability) {
  const p = require('../tools/legacy-owner-migration').legacyMigrationLeasePermit(capability);
  if (p.installOnly !== true || p.recovery) fail('install_lease_brand');
  return acquireSealedLease(p, true);
}
function acquireLegacyMigrationRecoveryLease(capability) {
  const p = require('../tools/legacy-owner-migration').legacyMigrationLeasePermit(capability);
  if (p.recovery !== true || typeof p.installOnly !== 'boolean') fail('install_lease_brand');
  return acquireSealedLease(p, p.installOnly);
}
function promoteLegacyMigrationInstallLease(lease, capability) {
  const p = require('../tools/legacy-owner-migration').legacyMigrationLeasePermit(capability), item = state(lease);
  assertInstallLease(lease, p.scope);
  if (!item.update || p.installOnly !== false || item.gates.length !== 1 || !item.gates[0].bytes.equals(p.gates[0])) fail('install_lease_brand');
  try {
    const expected = p.facts?.[1];
    if (p.recovery && expected?.stat) {
      if (expected.file !== item.paths.brokerGate || expected.hash !== crypto.createHash('sha256').update(p.gates[1]).digest('hex')) fail('install_lease_changed');
      const fd = fs.openSync(item.paths.brokerGate, 'r'), gate = { file: item.paths.brokerGate, fd, bytes: p.gates[1], stat: expected.stat }; item.gates.push(gate); checkMaintenanceGate(fs, gate);
    } else item.gates.push(publishMaintenanceGate(item.paths.brokerGate, p.gates[1], p.nonce));
    assertInstallLease(lease, p.scope, { full: true }); return lease;
  }
  catch (error) { item.retained = true; error.leaseRetained = true; throw error; }
}
module.exports = { acquireInstallLease, acquireMaintenanceInstallLease, acquireMaintenanceFinishLease, maintenanceLeaseFacts, assertInstallLease, ownedLeaseGates, checkpointInstallLease, retainInstallLease, releaseInstallLease,
  acquireStoppedUpdateLease, acquireLegacyMigrationInstallLease, acquireLegacyMigrationRecoveryLease, promoteLegacyMigrationInstallLease };
