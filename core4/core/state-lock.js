'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function acquireStateLock(directory) {
  fs.mkdirSync(directory, { recursive: true }); const file = path.join(directory, 'broker-owner.lock'); const token = crypto.randomUUID();
  const gate = path.join(directory, 'broker-owner.gate'); let gateFd;
  try { gateFd = fs.openSync(gate, 'wx'); fs.writeSync(gateFd, token); fs.fsyncSync(gateFd); }
  catch { return { error: 'state_owner_gate_unavailable', release() {} }; }
  try {
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try {
      fd = fs.openSync(file, 'wx'); fs.writeSync(fd, JSON.stringify({ pid: process.pid, token })); fs.fsyncSync(fd); fs.closeSync(fd);
      return { error: null, release() {
        let releaseGate;
        try {
          releaseGate = fs.openSync(gate, 'wx');
          if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.unlinkSync(file);
        } catch { /* Unknown/busy release leaves ownership closed, never steals a lease. */ }
        finally { if (releaseGate !== undefined) { try { fs.closeSync(releaseGate); fs.unlinkSync(gate); } catch {} } }
      } };
    } catch (e) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
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
    fs.closeSync(gateFd); fs.unlinkSync(gate);
  }
}
module.exports = { acquireStateLock };
