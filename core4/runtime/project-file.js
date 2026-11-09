'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { fail } = require('../protocol/json');

const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

function plainPath(file, directory = false) {
  const resolved = path.resolve(file);
  if (!path.isAbsolute(file) || !samePath(resolved, file.replace(/[\\/]/g, path.sep)) ||
      process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(file)) fail('save_disk_proof_unavailable');
  const info = fs.lstatSync(resolved, { bigint: true });
  if (info.isSymbolicLink() || !samePath(fs.realpathSync.native(resolved), resolved) ||
      (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1n)) fail('save_disk_proof_unavailable');
  return { resolved, info };
}

module.exports = { plainPath, samePath };
