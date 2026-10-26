'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { acquireStateLock } = require('../../core/state-lock');
const [directory, role] = process.argv.slice(2); const ownerFile = path.join(directory, 'broker-owner.lock');
if (role === 'pause-reclaimer') {
  const original = fs.readFileSync; let paused = false;
  fs.readFileSync = function (file, ...args) {
    const data = original.call(fs, file, ...args);
    if (file === ownerFile && !paused) {
      paused = true; fs.writeFileSync(path.join(directory, 'reclaimer-ready'), 'ready');
      const wait = new Int32Array(new SharedArrayBuffer(4)); const deadline = Date.now() + 5000;
      while (!fs.existsSync(path.join(directory, 'release-reclaimer')) && Date.now() < deadline) Atomics.wait(wait, 0, 0, 10);
    }
    return data;
  };
}
const lock = acquireStateLock(directory); process.stdout.write(JSON.stringify({ pid: process.pid, error: lock.error }) + '\n');
if (!lock.error && role === 'pause-reclaimer') {
  const wait = new Int32Array(new SharedArrayBuffer(4)); const deadline = Date.now() + 5000;
  while (!fs.existsSync(path.join(directory, 'release-owner')) && Date.now() < deadline) Atomics.wait(wait, 0, 0, 10);
}
lock.release();
