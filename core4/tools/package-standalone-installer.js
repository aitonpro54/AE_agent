'use strict';
// Offline packaging only. Runtime payload excludes installer tools as before.
const fs = require('node:fs'), path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { buildPackage, verifyPackage } = require('./package-installable');
const { HELPERS, verifyStandalone } = require('./standalone-installer');
const README = `Core4 standalone installer v1
Offline dry-run/apply; no MCP/CEP/AE startup and no environment discovery.
Run with the current supported Node (the same executable is bound by installer).
All destinations are mandatory absolute, canonical native paths:
node tools/standalone-installer.js dry-run --expected-distribution-hash REVIEWED_DISTRIBUTION_SHA256 --install-root ABS_AEAgentCore4 --extensions-dir ABS_EXTENSIONS --config ABS_CONFIG_TOML
node tools/standalone-installer.js apply --expected-distribution-hash REVIEWED_DISTRIBUTION_SHA256 --expected-package-hash HASH_FROM_DRY_RUN --install-root ABS_AEAgentCore4 --extensions-dir ABS_EXTENSIONS --config ABS_CONFIG_TOML
Owner distributions also support explicit same-descriptor pending-resume finish:
node tools/standalone-installer.js maintenance-inspect --expected-distribution-hash REVIEWED_DISTRIBUTION_SHA256 --expected-current-package-hash CURRENT_HASH --installation ABS_DESCRIPTOR --operation UUID
node tools/standalone-installer.js maintenance-finish --expected-distribution-hash REVIEWED_DISTRIBUTION_SHA256 --expected-current-package-hash CURRENT_HASH --installation ABS_DESCRIPTOR --operation UUID --expected-proof-hash INSPECT_PROOF
Maintenance never updates, launches runtime, kills a process or replays an RPC.
For an interrupted stop use stopped-inspect / stopped-certify with the same
arguments as maintenance-inspect / maintenance-finish. Certification requires
a durable desired-stop, fresh process-death proof and settled original history;
it preserves the stop barrier and issues its own certificate, not an old receipt.
Явные команды обновления owner distributions:
Общие flags: --expected-distribution-hash DIST --expected-package-hash NEW
--expected-current-package-hash OLD --expected-previous-descriptor-hash OLD_DESC
--installation ABS_DESCRIPTOR --operation UUID.
owner-update дополнительно требует --config ABS_CONFIG и существующий stop UUID.
migrate-legacy дополнительно требует --config ABS_CONFIG --root-status ABS_JSON
--expected-root-status-hash STATUS_HASH; JSON: {observedAt,status} из свежего
configured core_status. Только этот режим может один раз остановить проверенную
Core incarnation через удерживаемый native handle. AE не останавливается.
update-inspect принимает transaction UUID; update-finish продолжает только известную
фазу с --expected-proof-hash INSPECT_PROOF. update-enable отдельно разрешает старт
новой установки с тем же proof flag; enable-finish завершает прерванный enable.
legacy-inspect / legacy-finish используют исходный migration UUID для ранней фазы;
finish требует --expected-proof-hash. Новые ключи при продолжении не генерируются.
owner-pre-ready-inspect / owner-pre-ready-finish используют исходный update
transaction UUID до switch-ready; finish требует --expected-proof-hash. Допускаются
только исходные sealed role gates: отсутствуют оба, install-only, либо оба.
Живые actors, изменённые inode/bytes, неизвестные records/stages запрещены.
Metadata-only fresh host re-adoption требует manual/owner distribution с тем же
package hash. Modes: readopt-inspect / readopt-apply / readopt-finish /
readopt-enable / readopt-enable-finish. Общие обязательные flags:
--expected-distribution-hash DIST --expected-current-package-hash CURRENT
--installation ABS_DESCRIPTOR --operation ORIGINAL_STOP_UUID.
Все actions кроме readopt-inspect требуют --expected-proof-hash FRESH_PROOF.
Только readopt-apply требует --witness ABS_UTF8_JSON --expected-witness-hash SHA256;
witness snapshot ограничен16KiB. Finish/enable не принимают новый witness/target.
Apply сохраняет stopped barrier; enable — отдельный filesystem commit без запуска
Core. Historical enabled receipt не утверждает current runtime/history/barrier
или отсутствие pending/UNKNOWN и не выдаёт AE authority. Неизвестный pre-CAS
исход сохраняет stopped fence; повтор apply вместо inspect/finish запрещён.
Продолжение использует исходный payload/credentials и сохраняет stop barrier;
после switch-ready применяется отдельный update-inspect / update-finish.
Успешное обновление сохраняет stopped barrier. Explicit enable не запускает Core;
обычный thin client делает это после enable. Неизвестные исходы не повторяются.
Продолжение уже начатого B3 reset (новый reset этим helper не создаётся):
start-over-inspect --expected-distribution-hash DIST --expected-current-package-hash CURRENT --installation ABS_DESCRIPTOR --operation RESET_UUID
start-over-finish / start-over-continue требуют также --expected-intent-hash INTENT_SHA.
Finish использует тот же private finisher, когда canonical endpoints свободны.
Continue запрашивает один явный restart blocked driver для того же intent;
при ожидании AE/native только возвращает статус. Потерянная отправка не повторяется.
UNKNOWN сохраняется; текущая AE authority и переносимость не выдаются.
Review distributionHash out of band from package builder output. The manifest
does not issue authority. Standard install lease/CAS, signed history, owner,
UNKNOWN/no-replay and runtime-stopped gates remain in the existing installer.
Never edit a distribution. Rebuild and review a fresh hash after source changes.
This adapter does not certify live installation or desktop/MSI portability.
`;
function buildStandalone(root = path.resolve(__dirname, '..'), selector = 'manual', options = {}) {
  const pkg = buildPackage(root, selector, options), files = { ...pkg.files };
  for (const file of HELPERS) { const target = path.join(root, file); if (fs.realpathSync(target) !== target || !fs.lstatSync(target).isFile()) fail('standalone_source_path'); files[file] = fs.readFileSync(target).toString('base64'); }
  files['candidate.json'] = Buffer.from(canonical(pkg)).toString('base64'); files['README.txt'] = Buffer.from(README).toString('base64');
  const manifest = { version: 1, purpose: 'core4-standalone-installer-v1', packageHash: pkg.packageHash, hashes: Object.fromEntries(Object.keys(files).sort().map(file => [file, hash(Buffer.from(files[file], 'base64'))])) };
  return { distributionHash: hash(canonical(manifest)), packageHash: pkg.packageHash, manifest, files };
}
function writeStandalone(output, bundle = buildStandalone()) {
  if (!path.isAbsolute(output) || path.resolve(output) !== output || fs.existsSync(output)) fail('new_absolute_standalone_output_required');
  // mkdir must not follow an existing ancestor junction/symlink before the
  // post-write closure verifier can reject it. The direct parent must exist.
  const parent = path.dirname(output); let cursor = path.parse(parent).root;
  for (const part of ['', ...parent.slice(cursor.length).split(path.sep).filter(Boolean)]) {
    if (part) cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(cursor) !== cursor) fail('standalone_output_parent');
  }
  // Reject an invalid in-memory bundle before creating even the output folder.
  if (!bundle || !bundle.manifest || !bundle.files || bundle.distributionHash !== hash(canonical(bundle.manifest)) || bundle.packageHash !== bundle.manifest.packageHash || Object.keys(bundle.files).some(file => !/^[A-Za-z0-9_./-]+$/.test(file) || file.split('/').some(p => !p || p === '.' || p === '..') || file === 'standalone.json')) fail('standalone_bundle');
  const pkg = verifyPackage(JSON.parse(Buffer.from(bundle.files['candidate.json'] || '', 'base64'))), expected = [...Object.keys(pkg.files), ...HELPERS, 'candidate.json', 'README.txt'].sort();
  if (bundle.packageHash !== pkg.packageHash || bundle.manifest.version !== 1 || bundle.manifest.purpose !== 'core4-standalone-installer-v1' || canonical(Object.keys(bundle.files).sort()) !== canonical(expected) || canonical(Object.keys(bundle.manifest.hashes).sort()) !== canonical(expected) || expected.some(file => hash(Buffer.from(bundle.files[file], 'base64')) !== bundle.manifest.hashes[file]) || Object.keys(pkg.files).some(file => pkg.release.hashes[file] !== bundle.manifest.hashes[file])) fail('standalone_bundle');
  fs.mkdirSync(output);
  for (const [file, encoded] of Object.entries(bundle.files)) { const target = path.join(output, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(encoded, 'base64'), { flag: 'wx' }); }
  fs.writeFileSync(path.join(output, 'standalone.json'), canonical(bundle.manifest), { flag: 'wx' });
  verifyStandalone(output, bundle.distributionHash);
  return { distributionHash: bundle.distributionHash, packageHash: bundle.packageHash, files: Object.keys(bundle.files).length, output, liveProof: false };
}
if (require.main === module) { try { const args = process.argv.slice(2), options = {}; for (let i = 0; i < args.length; i += 2) { if (!['--output', '--composition', '--runtime'].includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_package_options'); options[args[i]] = args[i + 1]; } if (!options['--output']) fail('new_absolute_standalone_output_required'); console.log(canonical(writeStandalone(options['--output'], buildStandalone(undefined, options['--composition'] || 'manual', { runtimeModel: options['--runtime'] ?? 'stdio' })))); } catch (e) { console.error(e.code || 'standalone_package_failed'); process.exitCode = 1; } }
module.exports = { buildStandalone, writeStandalone };
