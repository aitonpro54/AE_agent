'use strict';
// Private subprocess harness. The production observer has no target override.
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const target = Number(process.env.CORE4_ENDPOINT_TEST_PORT);
assert.ok(Number.isInteger(target) && target > 0 && target <= 65535 && target !== 3457);
const originalConnect = net.Socket.prototype.connect;
const audit = { fixture: 'endpoint-observation-private-preload', connects: 0, targets: [], filesystemWrites: 0 };
net.Socket.prototype.connect = function (options) {
  assert.deepEqual(options, { host: '127.0.0.1', port: 3457, family: 4 });
  audit.connects++;
  audit.targets.push(options);
  return originalConnect.call(this, { ...options, port: target });
};
const denied = () => { audit.filesystemWrites++; throw new Error('fixture denies filesystem mutation'); };
for (const name of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream', 'mkdir', 'mkdirSync', 'rm', 'rmSync', 'unlink', 'unlinkSync', 'rename', 'renameSync', 'copyFile', 'copyFileSync', 'truncate', 'truncateSync', 'chmod', 'chmodSync', 'chown', 'chownSync', 'symlink', 'symlinkSync', 'link', 'linkSync']) fs[name] = denied;
for (const name of ['writeFile', 'appendFile', 'mkdir', 'rm', 'unlink', 'rename', 'copyFile', 'truncate', 'chmod', 'chown', 'symlink', 'link']) fs.promises[name] = denied;
process.on('exit', () => process.stderr.write(JSON.stringify(audit) + '\n'));
