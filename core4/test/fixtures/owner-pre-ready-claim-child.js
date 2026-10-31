'use strict';
// Disposable subprocess for a controlled filesystem claim race. No runtime,
// process probes, HTTP or installed state. The private primitive is exposed
// only in this test-local compiled module, never in the production exports.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const [file, encoded, signal, proceed] = process.argv.slice(2), source = path.resolve(__dirname, '../../tools/stopped-update.js');
const io = { ...fs, linkSync(from, to) {
  fs.writeFileSync(signal, from, { flag: 'wx' });
  const start = Date.now();
  while (!fs.existsSync(proceed)) { if (Date.now() - start > 15000) throw Object.assign(Error('fixture coordination timeout'), { code: 'fixture_timeout' }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); }
  return fs.linkSync(from, to);
} };
const mod = new Module(source, module); mod.filename = source; mod.paths = Module._nodeModulePaths(path.dirname(source));
mod.require = target => target === 'node:fs' ? io : Module.createRequire(source)(target);
mod._compile(fs.readFileSync(source, 'utf8') + '\nmodule.exports.fixtureClaim = (file, bytes) => atomic(file, bytes, true);\n', source);
try { mod.exports.fixtureClaim(file, Buffer.from(encoded, 'base64')); process.stdout.write('claimed'); }
catch (e) { process.stdout.write(e.code || 'fixture_error'); }
