'use strict';
// Deterministic process crash in an isolated test store, never a live runtime.
const fs = require('node:fs');
const path = require('node:path');
const { Broker } = require('../../core/broker');
const { Artifacts } = require('../../core/artifacts');
const { hash } = require('../../protocol/json');
const [root, stateDir, kind] = process.argv.slice(2), store = path.join(stateDir, 'artifacts');
let artifacts;
if (kind === 'module') artifacts = new Artifacts({ root, store });
const manifest = JSON.parse(fs.readFileSync(path.join(root, kind === 'core' ? 'core/artifact.json' : 'modules/titles/artifact.json')));
const final = path.join(store, (kind === 'core' ? 'core-' : '') + hash(manifest));
const open = fs.openSync, write = fs.writeSync, descriptors = new Map();
fs.openSync = function(file, ...args) { const fd = open.call(fs, file, ...args); descriptors.set(fd, path.resolve(file)); return fd; };
fs.writeSync = function(fd, data, ...args) {
  const file = descriptors.get(fd);
  if (file?.startsWith(path.resolve(store) + path.sep) && path.relative(store, file).startsWith('.stage-')) {
    write.call(fs, fd, Buffer.from(data).subarray(0, 19)); fs.fsyncSync(fd);
    process.stdout.write(JSON.stringify({ file, final }) + '\n'); process.exit(86);
  }
  return write.call(fs, fd, data, ...args);
};
if (kind === 'core') new Broker({ root, stateDir }); else artifacts.select('titles');
process.exit(87);
