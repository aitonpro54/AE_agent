'use strict';
// Parent-owned exact CLI invocation; refuses duplicate evidence slots.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const o = JSON.parse(fs.readFileSync(path.join(__dirname, 'operation.json')));
const [mode, slot, proof] = process.argv.slice(2);
if (!['stop', 'maintenance-inspect', 'stopped-inspect', 'stopped-certify', 'readopt-inspect', 'readopt-apply', 'readopt-finish', 'readopt-enable', 'readopt-enable-finish'].includes(mode) || !/^[a-z0-9-]+$/.test(slot || '') || process.argv.length > 5 || proof && !/^[a-f0-9]{64}$/.test(proof)) throw Error('operator_evidence_arguments');
const output = path.join(__dirname, slot + '.json'); if (fs.existsSync(output)) throw Error('evidence_slot_exists_no_replay');
const maintenance = ['stop', 'maintenance-inspect'].includes(mode);
const entry = path.join(o.distribution, maintenance ? 'tools/maintain-owner.js' : 'tools/standalone-installer.js');
const args = maintenance ? [mode === 'stop' ? 'stop' : 'inspect', '--installation', o.descriptorPath, '--operation', o.id, '--expected-package-hash', o.packageHash] : [mode, '--expected-distribution-hash', o.distributionHash, '--expected-current-package-hash', o.packageHash, '--installation', o.descriptorPath, '--operation', o.id];
if (proof) args.push('--expected-proof-hash', proof);
if (mode === 'readopt-apply') args.push('--witness', o.witnessPath, '--expected-witness-hash', o.witnessHash);
const startedAt = new Date().toISOString();
const r = cp.spawnSync(o.nodePath, [entry, ...args], { windowsHide: true, encoding: 'utf8', timeout: 300000, maxBuffer: 2 * 1024 * 1024 });
let result = null; try { result = JSON.parse(r.stdout); } catch {}
const report = { startedAt, collectedAt: new Date().toISOString(), operationId: o.id, mode, entry, args, exitCode: r.status, signal: r.signal, error: r.error?.code || null, stdout: r.stdout, stderr: r.stderr, result };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report));
process.exitCode = r.status === 0 ? 0 : 1;
