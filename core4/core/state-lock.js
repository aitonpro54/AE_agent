'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const statFields = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const sameStat = (a, b) => statFields.every(k => String(a[k]) === String(b[k]));
const sameClosedIdentity = (a, b) => statFields.filter(k => k !== 'ctimeNs').every(k => String(a[k]) === String(b[k]));
function changed() { throw Object.assign(new Error('state_owner_changed'), { code: 'state_owner_changed' }); }
function checkMarker(file, fd, bytes, expected) {
  const held = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(file, { bigint: true });
  if (!held.isFile() || !named.isFile() || named.isSymbolicLink() || fs.realpathSync(file) !== path.resolve(file) || held.size !== BigInt(bytes.length) || !sameStat(held, named) || expected && !sameStat(held, expected)) changed();
  const read = Buffer.alloc(bytes.length + 1); let offset = 0, count;
  while (offset < read.length && (count = fs.readSync(fd, read, offset, read.length - offset, offset))) offset += count;
  if (offset !== bytes.length || !read.subarray(0, offset).equals(bytes) || !sameStat(held, fs.fstatSync(fd, { bigint: true })) || !sameStat(held, fs.lstatSync(file, { bigint: true }))) changed();
  return held;
}
function publishMarker(file, token, bytes) {
  const stage = file + '.stage-' + token; let fd;
  try {
    fd = fs.openSync(stage, 'wx+');
    if (fs.writeSync(fd, bytes) !== bytes.length) changed();
    fs.fsyncSync(fd); checkMarker(stage, fd, bytes);
    // A process marker becomes visible only as a complete, durable inode. link
    // is exclusive: an existing gate/owner is never overwritten or renamed away.
    fs.linkSync(stage, file); checkMarker(stage, fd, bytes); checkMarker(file, fd, bytes);
    fs.unlinkSync(stage);
    return { file, fd, bytes, stat: checkMarker(file, fd, bytes) };
  } catch (e) {
    // A known publication collision may discard only our verified complete
    // stage; this also permits the existing known-dead retry with the same nonce.
    if (fd !== undefined && e.code === 'EEXIST') { try { checkMarker(stage, fd, bytes); fs.unlinkSync(stage); } catch {} }
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    // An uncertain stage or published marker is evidence, never reclaim authority.
    throw e;
  }
}
function removeMarker(marker) {
  let fd = marker.fd;
  try {
    if (fd === undefined) fd = fs.openSync(marker.file, 'r');
    checkMarker(marker.file, fd, marker.bytes, marker.stat);
    const named = fs.lstatSync(marker.file, { bigint: true });
    if (!named.isFile() || named.isSymbolicLink() || fs.realpathSync(marker.file) !== path.resolve(marker.file) || !sameStat(marker.stat, named)) changed();
    fs.unlinkSync(marker.file);
  } finally { if (fd !== undefined) { marker.fd = undefined; fs.closeSync(fd); } }
}
function closePublished(marker) {
  const before = marker.stat, fd = marker.fd; marker.fd = undefined; fs.closeSync(fd);
  let reader;
  try {
    reader = fs.openSync(marker.file, 'r');
    const after = checkMarker(marker.file, reader, marker.bytes);
    // Windows can commit the hardlink metadata's ctime when the write FD closes.
    // Only this known close may refresh it, with exact bytes and inode rechecked.
    if (!sameClosedIdentity(before, after)) changed(); marker.stat = after;
  } finally { if (reader !== undefined) fs.closeSync(reader); }
}
function acquireStateLock(directory, options = {}) {
  // A trusted embedding may bind a preselected process nonce into its durable
  // boot record. This never changes the lock's PID, election or AE authority.
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(k => k !== 'token') || options.token !== undefined && (typeof options.token !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options.token))) throw Object.assign(new Error('state_owner_token'), { code: 'state_owner_token' });
  fs.mkdirSync(directory, { recursive: true }); const file = path.join(directory, 'broker-owner.lock'); const token = options.token ?? crypto.randomUUID();
  const gate = path.join(directory, 'broker-owner.gate'); let gateMarker;
  try { gateMarker = publishMarker(gate, token, Buffer.from(token)); }
  catch { return { error: 'state_owner_gate_unavailable', release() {} }; }
  try {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ownerMarker = publishMarker(file, token, Buffer.from(JSON.stringify({ pid: process.pid, token })));
      closePublished(ownerMarker);
      return { error: null, release() {
        let releaseGate;
        try {
          releaseGate = publishMarker(gate, token, Buffer.from(token));
          removeMarker(ownerMarker);
        } catch { /* Unknown/busy release leaves ownership closed, never steals a lease. */ }
        finally { if (releaseGate !== undefined) { try { removeMarker(releaseGate); } catch {} } }
      } };
    } catch (e) {
      if (e.code !== 'EEXIST') return { error: 'state_owner_unavailable', release() {} };
      try {
        const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Number.isInteger(owner.pid) || owner.pid <= 0) return { error: 'state_owner_unknown', release() {} };
        try { process.kill(owner.pid, 0); return { error: 'state_owner_busy', release() {} }; }
        catch (probe) { if (probe.code !== 'ESRCH') return { error: 'state_owner_unknown', release() {} }; }
        // Known-dead process only; a missing/bad lock is never guessed safe.
        if (JSON.parse(fs.readFileSync(file, 'utf8')).token !== owner.token) continue;
        fs.unlinkSync(file);
      } catch { return { error: 'state_owner_unknown', release() {} }; }
    }
  }
  return { error: 'state_owner_busy', release() {} };
  } finally {
    // Every cooperating acquire/reclaim/release holds this atomic gate. An orphan gate
    // is NEVER reclaimed automatically: diagnostic/manual recovery is required.
    removeMarker(gateMarker);
  }
}
module.exports = { acquireStateLock };
