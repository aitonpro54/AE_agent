# Core 4.2.5 transfer admission: immutable review snapshot

Только allowlist ниже. Прочие файлы/история не передаются.

## Точный запрос

# Кросс-ревью Core 4.2.5: сохранение identity при переносе

review_id: 20261111-transfer-425-result-01
stage_id: core-transfer-admission-425
type: result
base_commit: c34ac23 (контракт и исходное расследование); точные source hashes в manifest.

Проверь общий механизм установки/переноса Core 4.2.5. При частично отсутствующей
прежней установке обычный installer мог принять состояние за чистое начало и
создать вторую identity. На изолированных стендах также воспроизведены origins
без descriptor и settled ledger, добавленный после plan. Исторический писатель
исчезновения/возврата файлов не установлен; не делай выводов о нём из этих тестов.

Исправление различает чистую первую установку, согласованную существующую
установку и orphan/mixed состояние. Проверки идут в plan, под собственным lease
и перед switch. В initial разрешены только собственные gates/prepared/stages/
release; origins публикуются после финальной проверки. Existing descriptor/CEP/
managed MCP binding сверяются; отсутствие Core entry в новом workspace допустимо.
Initial rollback сохраняет origins, последующий обычный reapply отказывает.
Новая recovery authority, tombstone, перенос credentials/state не добавляются.

Вопросы:
1. Есть ли сценарий второй identity или потери predecessor, который проходит guards?
2. Достаточны ли CAS, allowlist собственных файлов и порядок публикации при
   изменении state после plan и сбоях? Не ослаблены ли gates repeat/update/rollback?
3. Сохранены ли штатные first install, новый workspace, quoted TOML/preferences,
   legacy соседние записи и совместимость прежних пакетов?
4. Попадает ли исправленный installer в standalone closure и принимается ли
   версия 4.2.5 всеми затронутыми readers? Какие адресные регрессии ещё нужны?

Классификация: INTERNAL — исходники, синтетические тесты и краткое описание
дефекта для разрешённого пользователем ревью. PRODUCTION-SENSITIVE сведено к логической причине, без реальных
identity, state или командных журналов. Секреты, credentials, .env, backup/state,
AEP/assets, настройки, browser/account данные и полные rollouts исключены.
Состав ограничен manifest allowlist. Это адресный review, не полный аудит Core;
runtime authority и native/product acceptance не выводятся из offline tests.

Верни review_id/stage_id, source hashes из manifest, прочитанные/пропущенные файлы
и обрезку. Verdict go/revise/stop/insufficient-evidence. Для каждого finding дай
ID, P0–P3, сценарий, файл/строку, уверенность и минимальную проверку. Отдели
подтверждённый дефект от гипотезы и пробела evidence. Не выполняй команды и не
расширяй scope. Ответ будет проверен локально; автоматического повторного review нет.


## Manifest исходников

[
  {
    "path": "core4/tools/install-core4.js",
    "bytes": 59611,
    "sha256": "1cb25357bb2bb2558bcca8f111d397283345b16649b78043e76e6dcb86487db9"
  },
  {
    "path": "core4/runtime/install-lease.js",
    "bytes": 13950,
    "sha256": "fe91dfedfafceaa38f0cac72d007f2600d4b82915d07b960c8d3ed6d735bb368"
  },
  {
    "path": "core4/runtime/installation.js",
    "bytes": 248,
    "sha256": "7b7894f23e0ed6b7e11c644884b782d2532520e1da56981907cf0c7484cc1dc9"
  },
  {
    "path": "core4/runtime/stdio-entry.js",
    "bytes": 66382,
    "sha256": "41e35929bb3118ad0e490de4e464f6051d6410b2ab2bfd9953aae80db920d2c7"
  },
  {
    "path": "core4/test/owner-installation.test.js",
    "bytes": 34061,
    "sha256": "b2f1b5e9d8d62c59c5cf0eafb3df0495a12ada4572cc085cd6d881fd3566dd60"
  },
  {
    "path": "core4/tools/package-installable.js",
    "bytes": 9637,
    "sha256": "3b40fd268013d76586690ed019a83699bdb68d7400764037fb2e34a3b3d8ef8c"
  },
  {
    "path": "core4/tools/standalone-installer.js",
    "bytes": 18111,
    "sha256": "9459c199eabaadfa1a9cfe7fc981790eb4d780f2724c21bd45d4c9fca31bfe05"
  },
  {
    "path": "core4/tools/package-standalone-installer.js",
    "bytes": 11784,
    "sha256": "91dfd29d8e3dddfbfc0882b7ca02fbc9678e7bcc229df47d95ae0e6b626e49dc"
  },
  {
    "path": "docs/portability.md",
    "bytes": 22225,
    "sha256": "52da8fb83be23be4440a98a419edf15db18be0475bd6e75ae43bb9835e748899"
  }
]

## core4/tools/install-core4.js
SHA-256: `1cb25357bb2bb2558bcca8f111d397283345b16649b78043e76e6dcb86487db9`
```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { hash, canonical, fail } = require('../protocol/json');
const { verifyPackage, runtimeBinding } = require('./package-installable');
const { deriveComposition, installationConfig } = require('../runtime/stdio-entry.js');
const { acquireInstallLease, assertInstallLease, ownedLeaseGates, checkpointInstallLease, retainInstallLease, releaseInstallLease } = require('../runtime/install-lease');
const BUNDLE = 'com.codex.aeagentcore4';
function safeFile(file) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('client_binding_path');
  let cursor = path.parse(file).root;
  const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    cursor = path.join(cursor, parts[i]); let stat;
    try { stat = fs.lstatSync(cursor); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(cursor) !== cursor || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) fail('client_binding_path');
  }
  return true;
}
function checkedBytes(file, limit = 16384) {
  if (!safeFile(file)) return null;
  const named = fs.lstatSync(file), fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!named.isFile() || !stat.isFile() || named.dev !== stat.dev || named.ino !== stat.ino) fail('client_binding_path');
    if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > limit) fail('client_binding_budget');
    const value = Buffer.alloc(stat.size); let offset = 0;
    while (offset < value.length) { const count = fs.readSync(fd, value, offset, value.length - offset, offset); if (!count) fail('client_binding_changed'); offset += count; }
    const extra = fs.readSync(fd, Buffer.alloc(1), 0, 1, offset), after = fs.fstatSync(fd);
    if (extra || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => after[key] !== stat[key])) fail('client_binding_changed');
    let final;
    try { if (!safeFile(file)) fail('client_binding_changed'); final = fs.lstatSync(file); } catch { fail('client_binding_changed'); }
    if (!final.isFile() || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => final[key] !== after[key])) fail('client_binding_changed');
    return value;
  } finally { fs.closeSync(fd); }
}
function clientPaths(root, staged) {
  const file = path.join(root, 'core-client.json'); safeFile(file);
  for (const suffix of ['.next', '.rollback']) if (safeFile(file + suffix)) {
    const owned = staged?.get(file + suffix);
    if (!owned || owned.file !== file + suffix) fail('client_binding_staging_exists');
    assertStagedFile(owned);
  }
  return file;
}
function directoryVolume(directory) {
  let existing = path.resolve(directory);
  while (!entryExists(existing)) { const parent = path.dirname(existing); if (parent === existing) fail('install_volume_unknown'); existing = parent; }
  let cursor = path.parse(existing).root;
  for (const part of ['', ...existing.slice(cursor.length).split(path.sep).filter(Boolean)]) {
    if (part) cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(cursor) !== cursor) fail('install_volume_path');
  }
  return String(fs.lstatSync(existing, { bigint: true }).dev);
}
function assertSwitchVolumes(installRoot, cepDir) {
  if (directoryVolume(installRoot) !== directoryVolume(path.dirname(cepDir))) fail('install_cross_volume_unsupported');
}
const STAGE_FIELDS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const stageStamp = stat => Object.fromEntries(STAGE_FIELDS.map(k => [k, String(stat[k])]));
function assertStagedFile(view, file = view.file, renamed = false) {
  if (!safeFile(file)) fail('install_staging_changed');
  const held = fs.fstatSync(view.fd, { bigint: true }), named = fs.lstatSync(file, { bigint: true });
  const stable = renamed ? ['dev', 'ino', 'size', 'mtimeNs'] : STAGE_FIELDS;
  if (!held.isFile() || stable.some(k => String(held[k]) !== view.stat[k]) || STAGE_FIELDS.some(k => String(held[k]) !== String(named[k]))) fail('install_staging_changed');
  const bytes = Buffer.alloc(view.bytes.length + 1); let at = 0, n;
  while (at < bytes.length && (n = fs.readSync(view.fd, bytes, at, bytes.length - at, at))) at += n;
  if (at !== view.bytes.length || !bytes.subarray(0, at).equals(view.bytes) || STAGE_FIELDS.some(k => String(fs.fstatSync(view.fd, { bigint: true })[k]) !== String(held[k]) || String(fs.lstatSync(file, { bigint: true })[k]) !== String(held[k]))) fail('install_staging_changed');
  return stageStamp(held);
}
function retainStagedFile(file, expected) {
  const bytes = Buffer.isBuffer(expected) ? expected : Buffer.from(expected), fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    if (stat.size !== BigInt(bytes.length)) fail('install_staging_changed');
    const view = { file, fd, bytes, stat: stageStamp(stat) }; assertStagedFile(view); return view;
  } catch (error) { fs.closeSync(fd); throw error; }
}
function publishStagedFile(view, destination) {
  const source = view.file; assertStagedFile(view); fs.renameSync(source, destination);
  const stat = assertStagedFile(view, destination, true);
  if (entryExists(source)) fail('install_staging_changed'); view.file = destination; view.stat = stat;
}
function assertCepStage(directory, expected) {
  const files = new Set(Object.keys(expected)), dirs = new Set(['']);
  for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  function visit(dir, relative) {
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(dir) !== dir || !dirs.delete(relative)) fail('install_staging_changed');
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name), rel = relative ? relative + '/' + name : name, entry = fs.lstatSync(file);
      if (entry.isDirectory()) visit(file, rel);
      else {
        if (!files.delete(rel)) fail('install_staging_changed');
        const view = retainStagedFile(file, Buffer.from(expected[rel], 'base64'));
        fs.closeSync(view.fd);
      }
    }
  }
  visit(directory, ''); if (files.size || dirs.size) fail('install_staging_changed');
}
function originState(d) { return { root: checkedBytes(path.join(d.installRoot, 'origin.json'), 8192), anchor: checkedBytes(path.join(d.stateDir, 'origin.json'), 8192) }; }
function installedBinding(d) {
  if (!/^[a-f0-9]{64}$/.test(d.packageHash) || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash)) fail('client_previous_release');
  const release = JSON.parse(checkedBytes(path.join(d.releaseDir, 'release.json'), 4 * 1024 * 1024));
  if (hash(release) !== d.packageHash) fail('client_previous_release'); checkRelease(d.releaseDir, release);
  return runtimeBinding(release, file => fs.readFileSync(path.join(d.releaseDir, file)));
}
function assertOwnedClient(value, d, originBytes) {
  if (!value || !d || !originBytes) fail('foreign_client_descriptor');
  // Historical releases are data only. This closed projection also works in a
  // stdio-only standalone candidate that deliberately has no client-entry code.
  const { installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken } = d;
  if (![installationId, machineId].every(v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v)) ||
      ![packageHash, nodeHash, controlToken].every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) fail('foreign_client_descriptor');
  const origin = JSON.parse(originBytes);
  if (origin.installationId !== installationId || origin.machineId !== machineId) fail('foreign_client_descriptor');
  const expected = { version: 1, role: 'core4-control-client', installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken,
    originHash: hash(originBytes), ownerEndpoint: '\\\\.\\pipe\\ae-core4-owner-' + hash(JSON.stringify({ installationId, machineId })).slice(0, 32) };
  if (value.length > 16384 || !value.equals(Buffer.from(canonical(expected)))) fail('foreign_client_descriptor');
}
function validateClientBinding(binding, root) {
  const keys = ['version', 'runtimeModel', 'clientDescriptorPath', 'previousClient', 'appliedClientHash'];
  if (!binding || Object.getPrototypeOf(binding) !== Object.prototype || Object.keys(binding).length !== keys.length || keys.some(k => !Object.hasOwn(binding, k)) ||
      binding.version !== 1 || !['stdio', 'owner'].includes(binding.runtimeModel) || binding.clientDescriptorPath !== path.join(root, 'core-client.json') ||
      (binding.runtimeModel === 'owner' ? !/^[a-f0-9]{64}$/.test(binding.appliedClientHash) : binding.appliedClientHash !== null) ||
      binding.previousClient !== null && (typeof binding.previousClient !== 'string' || binding.previousClient.length > 22000 || Buffer.from(binding.previousClient, 'base64').toString('base64') !== binding.previousClient)) fail('client_binding_schema');
}
const preparedPlans = new WeakMap();
function planDigest(plan) { return hash({ transactionId: plan.transactionId, package: plan.pkg, origin: plan.origin, originBytes: plan.originBytes.toString('base64'), clientBinding: plan.clientBinding, nextClient: plan.nextClient?.toString('base64') ?? null, descriptor: plan.descriptor, descriptorPath: plan.descriptorPath, configPath: plan.configPath, nextConfig: plan.nextConfig, cepDir: plan.cepDir, cep: plan.cep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCep: plan.previousCep, baseline: plan.baseline }); }
function assertPreparedInstallPlan(plan) {
  const entry = plan && preparedPlans.get(plan); let digest;
  try { if (entry) digest = planDigest(plan); } catch { fail('prepared_install_plan_brand_or_changed'); }
  if (!entry || entry.digest !== digest) fail('prepared_install_plan_brand_or_changed');
  return Object.freeze({ transactionId: plan.transactionId, packageHash: plan.pkg.packageHash, appliedDescriptorHash: hash(canonical(plan.descriptor)), previousDescriptorHash: plan.baseline.descriptor, preparedPlanHash: entry.digest, preparedStateHash: entry.prepared?.hash || null });
}
function preparedInstallPayload(plan) {
  const fingerprint = assertPreparedInstallPlan(plan);
  return { version: 1, transactionId: plan.transactionId, preparedPlanHash: fingerprint.preparedPlanHash, package: plan.pkg, origin: plan.origin, originBytes: plan.originBytes.toString('base64'), clientBinding: plan.clientBinding, nextClient: plan.nextClient?.toString('base64') ?? null, descriptorBytes: Buffer.from(canonical(plan.descriptor)).toString('base64'), descriptorPath: plan.descriptorPath, configPath: plan.configPath, configBytes: Buffer.from(plan.nextConfig).toString('base64'), cepDir: plan.cepDir, cep: plan.cep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCep: plan.previousCep, baseline: plan.baseline };
}
function prepareInstallPlan(plan, { lease }) {
  const fingerprint = assertPreparedInstallPlan(plan), scope = { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath };
  assertInstallLease(lease, scope); const entry = preparedPlans.get(plan);
  if (!entry.prepared) {
    const directory = path.join(scope.installRoot, 'transactions', plan.transactionId + '-prepared');
    const payload = preparedInstallPayload(plan);
    try {
      const parent = path.dirname(directory); if (!fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink() || fs.realpathSync(parent) !== parent) fail('prepared_install_path');
      fs.mkdirSync(directory, { recursive: false });
      if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) fail('prepared_install_path');
      durable(path.join(directory, 'prepared.json'), canonical(payload));
      durable(path.join(directory, 'descriptor.json'), canonical(plan.descriptor));
      if (plan.nextClient) durable(path.join(directory, 'client.json'), plan.nextClient);
      entry.prepared = { directory, hash: hash(canonical(payload)), descriptorHash: fingerprint.appliedDescriptorHash };
      rememberInitialFile(plan, path.join(directory, 'prepared.json'), canonical(payload));
      rememberInitialFile(plan, path.join(directory, 'descriptor.json'), canonical(plan.descriptor));
      if (plan.nextClient) rememberInitialFile(plan, path.join(directory, 'client.json'), plan.nextClient);
    } catch (e) { retainInstallLease(lease); e.preparedDirectory = directory; e.leaseRetained = true; throw e; }
  }
  return assertDurablePreparedInstallPlan(plan, { lease });
}
function assertDurablePreparedInstallPlan(plan, { lease }) {
  assertPreparedInstallPlan(plan); assertInstallLease(lease, { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath });
  const prepared = preparedPlans.get(plan).prepared; if (!prepared) fail('prepared_install_state_required');
  const plain = file => { const s = fs.lstatSync(file); return s.isFile() && !s.isSymbolicLink() && !s.reparsePoint && fs.realpathSync(file) === file; };
  const expected = ['descriptor.json', 'prepared.json', ...(plan.nextClient ? ['client.json'] : [])].sort();
  if (fs.lstatSync(prepared.directory).isSymbolicLink() || fs.realpathSync(prepared.directory) !== prepared.directory || canonical(fs.readdirSync(prepared.directory).sort()) !== canonical(expected) || !plain(path.join(prepared.directory, 'prepared.json')) || !plain(path.join(prepared.directory, 'descriptor.json')) || hash(fs.readFileSync(path.join(prepared.directory, 'prepared.json'))) !== prepared.hash || hash(fs.readFileSync(path.join(prepared.directory, 'descriptor.json'))) !== prepared.descriptorHash || plan.nextClient && (!plain(path.join(prepared.directory, 'client.json')) || !fs.readFileSync(path.join(prepared.directory, 'client.json')).equals(plan.nextClient))) { retainInstallLease(lease); fail('prepared_install_state_changed'); }
  return assertPreparedInstallPlan(plan);
}
function durable(file, data, flag = 'wx') { fs.mkdirSync(path.dirname(file), { recursive: true }); const fd = fs.openSync(file, flag); try { if (fs.writeSync(fd, data) !== Buffer.byteLength(data)) fail('install_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function bytes(file) { return fs.existsSync(file) ? fs.readFileSync(file) : null; }
function snapshot(directory) {
  if (!fs.existsSync(directory)) return null;
  const result = {};
  function visit(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isSymbolicLink()) fail('install_symlink'); if (item.isDirectory()) visit(file); else result[path.relative(directory, file).replace(/\\/g, '/')] = fs.readFileSync(file).toString('base64'); } }
  visit(directory); return result;
}
function treeHash(value) { return hash(value); }
function restoreTree(directory, data) { fs.mkdirSync(directory, { recursive: true }); for (const [relative, b64] of Object.entries(data || {})) durable(path.join(directory, relative), Buffer.from(b64, 'base64')); }
function configStructure(previous) {
  const text = previous ? previous.toString('utf8') : '';
  if (Buffer.byteLength(text) > 1024 * 1024 || previous && !Buffer.from(text, 'utf8').equals(previous) || text.includes('"""') || text.includes("'''")) fail('config_syntax_requires_review');
  const headers = []; let offset = 0, currentTable = '';
  // Deliberately bounded TOML subset: ASCII bare-key segments, optionally quoted
  // without escapes. Quoted aliases have the same identity as bare segments.
  // Unsupported table syntax is rejected BEFORE any installation writes.
  const keySegment = /(?:[A-Za-z0-9_-]+|"[A-Za-z0-9_-]+"|'[A-Za-z0-9_-]+')/.source;
  const keyPath = keySegment + '(?:[ \\t]*\\.[ \\t]*' + keySegment + ')*';
  const headerPattern = new RegExp('^[ \\t]*\\[[ \\t]*(' + keyPath + ')[ \\t]*\\][ \\t]*(?:#[^\\r\\n]*)?(?:\\r?\\n)?$');
  const assignmentKeyPattern = new RegExp('^[ \\t]*(' + keyPath + ')[ \\t]*$');
  const keyName = value => value.split('.').map(part => part.trim().replace(/^(['"])(.*)\1$/, '$2')).join('.');
  function assignmentKey(line) {
    let quote = null;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (quote) {
        if (quote === '"' && char === '\\') index++;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '#' || /[\r\n\[\]{},]/.test(char)) return null;
      else if (char === '=') {
        const parsed = assignmentKeyPattern.exec(line.slice(0, index));
        if (!parsed) fail('config_syntax_requires_review');
        return keyName(parsed[1]);
      }
    }
    return null;
  }
  for (const line of text.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) {
    if (/^[ \t]*\[/.test(line)) {
      const parsed = headerPattern.exec(line);
      if (!parsed) fail('config_syntax_requires_review');
      currentTable = keyName(parsed[1]);
      if (currentTable.startsWith('mcp_servers.after-effects-core4.')) fail('config_core4_nested_requires_review');
      headers.push({ name: currentTable, start: offset, end: offset + line.length, line });
    } else {
      const key = assignmentKey(line);
      if (/^[ \t]*mcp_servers[ \t]*\.[ \t]*after-effects-core4[ \t]*[.=]/.test(line) || currentTable === 'mcp_servers' && /^[ \t]*["']?after-effects-core4["']?[ \t]*=/.test(line) || key && (key === 'mcp_servers.after-effects-core4' || key.startsWith('mcp_servers.after-effects-core4.') || currentTable === 'mcp_servers' && (key === 'after-effects-core4' || key.startsWith('after-effects-core4.')))) fail('config_ambiguous_core4');
    }
    offset += line.length;
  }
  const matches = headers.filter(h => h.name === 'mcp_servers.after-effects-core4'); if (matches.length > 1) fail('config_ambiguous_core4');
  return { text, headers, matches };
}
function configText(previous, descriptor, nodePath, entry, argument = '--installation') {
  if (!['--installation', '--client-descriptor'].includes(argument)) fail('config_runtime_argument');
  const { text, headers, matches } = configStructure(previous);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  // TOML basic strings accept JSON's escaped backslashes. Preserve native path
  // bytes: the installed verifier deliberately rejects noncanonical spellings.
  const body = 'command = ' + JSON.stringify(nodePath) + newline + 'args = ' + JSON.stringify([entry, argument, descriptor]) + newline;
  if (!matches.length) return text + (text && !text.endsWith('\n') ? newline : '') + newline + '[mcp_servers.after-effects-core4]' + newline + 'tool_timeout_sec = 120' + newline + body;
  const own = matches[0], following = headers.find(h => h.start > own.start);
  const ownBody = text.slice(own.end, following ? following.start : text.length), preferences = [], timeouts = [];
  for (const line of ownBody.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) if (/^[ \t]*(?:enabled|"enabled"|'enabled')[ \t]*=/.test(line)) {
    if (!/^[ \t]*(?:enabled|"enabled"|'enabled')[ \t]*=[ \t]*(?:true|false)[ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.test(line)) fail('config_enabled_preference_requires_review');
    preferences.push(line);
  }
  for (const line of ownBody.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) if (/^[ \t]*(?:tool_timeout_sec|"tool_timeout_sec"|'tool_timeout_sec')[ \t]*=/.test(line)) {
    if (!/^[ \t]*(?:tool_timeout_sec|"tool_timeout_sec"|'tool_timeout_sec')[ \t]*=[ \t]*[1-9][0-9]*[ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.test(line)) fail('config_timeout_preference_requires_review');
    timeouts.push(line);
  }
  if (preferences.length > 1) fail('config_duplicate_enabled_preference');
  if (timeouts.length > 1) fail('config_duplicate_timeout_preference');
  const preference = preferences.length ? preferences[0] + (preferences[0].endsWith('\n') ? '' : newline) : '';
  const timeout = timeouts.length ? timeouts[0] + (timeouts[0].endsWith('\n') ? '' : newline) : 'tool_timeout_sec = 120' + newline;
  return text.slice(0, own.end) + (own.line.endsWith('\n') ? '' : newline) + preference + timeout + body + text.slice(following ? following.start : text.length);
}
function assertHistoricalInstallation(old, origin, cepDir) {
  const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', ...(old.version === 2 ? ['cepDir', 'receiverFormatVersion', 'predecessor'] : [])];
  if (![1, 2].includes(old.version) || Object.keys(old).length !== keys.length || keys.some(k => !Object.hasOwn(old, k)) || old.machineId !== origin.machineId || !path.isAbsolute(old.nodePath) || !/^[a-f0-9]{64}$/.test(old.nodeHash) || !/^v(2\d|[3-9]\d)\./.test(old.nodeVersion) || !/^[a-f0-9]{64}$/.test(old.panelToken) || !/^[a-f0-9]{64}$/.test(old.controlToken) || old.panelToken === old.controlToken) fail('installation_historical_binding');
  if (old.version === 2 && (old.receiverFormatVersion !== 2 || old.cepDir !== cepDir || old.predecessor !== null && (!old.predecessor || Object.keys(old.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{64}$/.test(old.predecessor.previousDescriptorHash) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(old.predecessor.transactionId)))) fail('installation_historical_binding');
  // Historical Node is data. Only the verified candidate Node executes this
  // installer. Both descriptor versions still require exact release/CEP bytes.
  const release = JSON.parse(checkedBytes(path.join(old.releaseDir, 'release.json'), 4 * 1024 * 1024));
  require('../runtime/installation').verifyCep(old, release, cepDir);
}
function assertManagedConfig(previous, old, runtime, candidateNode) {
  const { text, headers, matches } = configStructure(previous);
  if (!matches.length) return; // A coherent installation may join a new checkout.
  const own = matches[0], following = headers.find(h => h.start > own.start), values = {};
  for (const line of text.slice(own.end, following ? following.start : text.length).split(/\r?\n/)) {
    const match = /^[ \t]*(?:"(command|args)"|'(command|args)'|(command|args))[ \t]*=[ \t]*(.*)$/.exec(line);
    if (!match) continue;
    const name = match[1] || match[2] || match[3]; if (Object.hasOwn(values, name)) fail('installation_config_binding');
    // Installer-generated bindings use JSON-compatible TOML strings/arrays.
    // Comments, quoted keys and harmless whitespace do not change the binding.
    const value = match[4]; let quote = null, end = value.length;
    for (let i = 0; i < value.length; i++) {
      if (quote) { if (value[i] === '\\') i++; else if (value[i] === quote) quote = null; }
      else if (value[i] === '"') quote = value[i]; else if (value[i] === '#') { end = i; break; }
    }
    try { values[name] = JSON.parse(value.slice(0, end).trim()); } catch { fail('installation_config_binding'); }
  }
  const descriptor = path.join(old.installRoot, runtime.runtimeModel === 'owner' ? 'core-client.json' : 'installation.json');
  if (![old.nodePath, candidateNode].includes(values.command) || canonical(values.args ?? null) !== canonical([path.join(old.releaseDir, runtime.clientEntry), runtime.clientArgument, descriptor])) fail('installation_config_binding');
}
function initialPlan(plan) { return plan.previousDescriptor === null && plan.baseline.rootOrigin === null && plan.baseline.anchorOrigin === null; }
function rememberInitialFile(plan, file, expected) {
  const entry = preparedPlans.get(plan); if (!entry?.initialFiles) return;
  const bytes = Buffer.isBuffer(expected) ? expected : Buffer.from(expected);
  if (!safeFile(file) || !fs.readFileSync(file).equals(bytes)) fail('initial_installation_not_pristine');
  entry.initialFiles.set(file, { bytes: Buffer.from(bytes), stat: stageStamp(fs.lstatSync(file, { bigint: true })) });
}
function assertInitialLayout(plan, lease) {
  if (!initialPlan(plan)) return;
  const d = plan.descriptor, entry = preparedPlans.get(plan), files = new Map(entry?.initialFiles || []), dirs = new Set([d.installRoot]);
  if (lease) {
    assertInstallLease(lease, { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath: plan.descriptorPath }, { full: true });
    for (const [file, bytes] of ownedLeaseGates(lease)) files.set(file, { bytes });
    for (const dir of [path.join(d.installRoot, 'state'), d.stateDir, path.join(d.stateDir, 'broker')]) dirs.add(dir);
  } else if (files.size) fail('initial_installation_not_pristine');
  for (const file of files.keys()) {
    if (!file.startsWith(d.installRoot + path.sep)) continue;
    for (let dir = path.dirname(file); dir !== d.installRoot; dir = path.dirname(dir)) dirs.add(dir);
  }
  function visit(directory) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(directory) !== directory || !dirs.delete(directory)) fail('initial_installation_not_pristine');
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      if (stat.isDirectory()) visit(file);
      else {
        const expected = files.get(file);
        if (!expected || !safeFile(file) || !fs.readFileSync(file).equals(expected.bytes) || expected.stat && STAGE_FIELDS.some(k => String(fs.lstatSync(file, { bigint: true })[k]) !== expected.stat[k])) fail('initial_installation_not_pristine');
        files.delete(file);
      }
    }
  }
  if (entryExists(d.installRoot)) visit(d.installRoot);
  for (const file of files.keys()) if (file.startsWith(d.installRoot + path.sep)) fail('initial_installation_not_pristine');
  if (configStructure(bytes(plan.configPath)).matches.length) fail('initial_installation_not_pristine');
}
function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, machineId, runtimeModel }) {
  verifyPackage(pkg);
  const runtime = runtimeBinding(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (runtimeModel !== undefined && runtimeModel !== runtime.runtimeModel) fail('runtime_selector_mismatch');
  const receiverContract = pkg.files['runtime/receiver-contract.json'] && JSON.parse(Buffer.from(pkg.files['runtime/receiver-contract.json'], 'base64'));
  if (!receiverContract || receiverContract.version !== 1 || receiverContract.descriptorVersion !== 2 || receiverContract.journalFormat !== 2 || receiverContract.terminalReadFailureDispositionVersion !== 1) fail('candidate_receiver_contract_unsupported');
  for (const value of [nodePath, installRoot, extensionsDir, configPath]) if (!path.isAbsolute(value)) fail('absolute_install_paths_required');
  if (path.basename(installRoot).toLowerCase() !== 'aeagentcore4' || path.basename(path.join(extensionsDir, BUNDLE)) !== BUNDLE) fail('install_scope');
  nodePath = path.resolve(nodePath);
  const resolvedNode = fs.realpathSync(nodePath); if (resolvedNode !== nodePath) fail('node_path_not_exact');
  if (path.resolve(process.execPath).toLowerCase() !== nodePath.toLowerCase()) fail('installer_candidate_node_must_be_current_process');
  const version = process.version;
  if (!/^v(2\d|[3-9]\d)\./.test(version)) fail('node_20_required');
  const releaseDir = path.join(installRoot, 'releases', pkg.packageHash), descriptor = path.join(installRoot, 'installation.json'), stateDir = path.join(installRoot, 'state', 'production'), cepDir = path.join(extensionsDir, BUNDLE);
  if (entryExists(path.join(stateDir, 'runtime-start-over.json'))) fail('start_over_install_pending');
  if (entryExists(path.join(stateDir, 'work-session.json')) && (runtime.runtimeModel !== 'owner' || runtime.version !== 4)) fail('work_session_reader_unsupported');
  assertSwitchVolumes(installRoot, cepDir);
  const clientDescriptorPath = clientPaths(installRoot), previousClient = checkedBytes(clientDescriptorPath);
  const originBytes = checkedBytes(path.join(installRoot, 'origin.json'), 8192), anchorBytes = checkedBytes(path.join(stateDir, 'origin.json'), 8192);
  if (!!originBytes !== !!anchorBytes || (originBytes && !originBytes.equals(anchorBytes))) fail('stable_state_origin_missing_or_mismatch');
  if (!originBytes && (fs.existsSync(descriptor) || fs.existsSync(cepDir) || fs.existsSync(stateDir))) fail('existing_installation_without_origin');
  const origin = originBytes ? JSON.parse(originBytes) : { version: 1, installationId: 'installation-' + crypto.randomUUID(), machineId: machineId || os.hostname(), createdAt: new Date().toISOString() };
  if (origin.machineId !== (machineId || os.hostname())) fail('machine_origin_mismatch');
  const previousDescriptor = checkedBytes(descriptor), previousConfig = bytes(configPath), previousCep = snapshot(cepDir);
  if (originBytes && !previousDescriptor) fail('installation_descriptor_required');
  if (previousDescriptor) {
    const old = JSON.parse(previousDescriptor); if (old.installationId !== origin.installationId || old.installRoot !== installRoot || old.stateDir !== stateDir) fail('installation_identity_mismatch');
    if (old.version === 2 && old.cepDir !== cepDir) fail('installation_cep_binding_change_unsupported');
    const previousRuntime = installedBinding(old);
    if (previousRuntime.runtimeModel === 'owner') assertOwnedClient(previousClient, old, originBytes);
    else if (previousClient) fail('foreign_client_descriptor');
    assertHistoricalInstallation(old, origin, cepDir);
    assertManagedConfig(previousConfig, old, previousRuntime, nodePath);
  }
  else if (previousClient) fail('foreign_client_descriptor');
  const transactionId = crypto.randomUUID();
  const d = { version: 2, installRoot, installationId: origin.installationId, machineId: origin.machineId, packageHash: pkg.packageHash, releaseDir, stateDir, nodePath, nodeHash: hash(fs.readFileSync(nodePath)), nodeVersion: version, panelToken: crypto.randomBytes(32).toString('hex'), controlToken: crypto.randomBytes(32).toString('hex'), cepDir, receiverFormatVersion: 2, predecessor: previousDescriptor ? { transactionId, previousDescriptorHash: hash(previousDescriptor) } : null };
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  const cep = Object.fromEntries(Object.entries(pkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, data]) => [f.slice(4), data]));
  cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical(installationConfig(d, selected)) + ';\n').toString('base64');
  const plannedOrigin = originBytes || Buffer.from(canonical(origin));
  const nextClient = runtime.runtimeModel === 'owner' ? Buffer.from(canonical(require('../runtime/client-entry').projectClientDescriptor(d, { originBytes: plannedOrigin }))) : null;
  const clientBinding = { version: 1, runtimeModel: runtime.runtimeModel, clientDescriptorPath, previousClient: previousClient?.toString('base64') ?? null, appliedClientHash: nextClient ? hash(nextClient) : null };
  const nextConfig = configText(previousConfig, runtime.runtimeModel === 'owner' ? clientDescriptorPath : descriptor, nodePath, path.join(releaseDir, runtime.clientEntry), runtime.clientArgument);
  const plan = { pkg, origin, originBytes: plannedOrigin, clientBinding, nextClient, transactionId, descriptor: d, descriptorPath: descriptor, configPath, nextConfig, cepDir, cep, previousDescriptor, previousConfig, previousCep, baseline: { client: previousClient ? hash(previousClient) : null, rootOrigin: originBytes ? hash(originBytes) : null, anchorOrigin: anchorBytes ? hash(anchorBytes) : null, config: previousConfig ? hash(previousConfig) : null, descriptor: previousDescriptor ? hash(previousDescriptor) : null, cep: treeHash(previousCep) } };
  preparedPlans.set(plan, { digest: planDigest(plan), prepared: null, initialFiles: previousDescriptor === null ? new Map() : null });
  assertInitialLayout(plan); return plan;
}
function assertBaseline(plan, originPublished = false, staged) {
  if (staged) for (const view of staged.values()) assertStagedFile(view);
  validateClientBinding(plan.clientBinding, plan.descriptor.installRoot); clientPaths(plan.descriptor.installRoot, staged);
  const client = checkedBytes(plan.clientBinding.clientDescriptorPath), origin = originState(plan.descriptor);
  const originHash = hash(plan.originBytes), rootExpected = originPublished && plan.baseline.rootOrigin === null ? originHash : plan.baseline.rootOrigin, anchorExpected = originPublished && plan.baseline.anchorOrigin === null ? originHash : plan.baseline.anchorOrigin;
  if ((client ? hash(client) : null) !== plan.baseline.client || (origin.root ? hash(origin.root) : null) !== rootExpected || (origin.anchor ? hash(origin.anchor) : null) !== anchorExpected || (bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || (bytes(plan.descriptorPath) ? hash(bytes(plan.descriptorPath)) : null) !== plan.baseline.descriptor || treeHash(snapshot(plan.cepDir)) !== plan.baseline.cep) fail('install_baseline_changed');
}
function assertPreparedInstallBaseline(plan) { const fingerprint = assertPreparedInstallPlan(plan); assertBaseline(plan); return fingerprint; }
function entryExists(file) { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function assertNoLifecycleMarkers(stateDir, certifiedStop = false) {
  if (entryExists(path.join(stateDir, 'runtime-start-over.json'))) fail('start_over_install_pending');
  for (const name of ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', ...(certifiedStop ? [] : ['runtime-maintenance.json'])]) if (entryExists(path.join(stateDir, name))) fail('runtime_lifecycle_owned_or_maintenance');
}
function assertRuntimeStopped(stateDir, { lease, descriptorPath, cepDir, plan, stoppedPermit } = {}) {
  const scope = { installRoot: path.resolve(stateDir, '../..'), stateDir, descriptorPath };
  const owned = lease ? (assertInstallLease(lease, scope, { full: true }), ownedLeaseGates(lease)) : new Map();
  const certified = stoppedPermit && require('./stopped-update').assertStoppedUpdatePermit(stoppedPermit, { plan, lease });
  assertNoLifecycleMarkers(stateDir, !!certified);
  if (plan && entryExists(path.join(stateDir, 'work-session.json'))) {
    const runtime = runtimeBinding(plan.pkg.release, file => Buffer.from(plan.pkg.files[file], 'base64'));
    if (runtime.runtimeModel !== 'owner' || runtime.version !== 4) fail('work_session_reader_unsupported');
  }
  for (const relative of ['broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) {
    const file = path.join(stateDir, relative);
    if (entryExists(file) && !(relative === 'broker/broker-owner.gate' && owned.has(file) && fs.readFileSync(file).equals(owned.get(file)))) fail('runtime_state_owned_or_unknown');
  }
  if (!certified) require('../runtime/render-job-maintenance').inspectRenderJobs(stateDir);
  const ledger = path.join(stateDir, 'broker/ledger.ndjson');
  if (entryExists(ledger)) {
    const stat = fs.lstatSync(ledger); if (stat.isSymbolicLink() || fs.realpathSync(ledger) !== ledger) fail('runtime_ledger_unknown');
    const { Ledger } = require('../core/ledger'); const value = new Ledger(ledger); if (value.corrupt || value.unresolved().length) fail('runtime_ledger_unresolved');
  }
  if (entryExists(path.join(stateDir, 'receiver/completions.ndjson'))) {
    const options = { directory: path.join(stateDir, 'receiver'), descriptorPath, cepDir };
    if (plan) require('./disposition-install-preflight').assertPreparedReceiverJournalSettled({ ...options, plan, lease });
    else require('../runtime/native-read-disposition').assertReceiverJournalSettled(options);
  }
}
function checkRelease(directory, release) {
  const expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('immutable_release_mismatch');
    expectedFiles.add(relative); for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(dir, rel) {
    const stat = fs.lstatSync(dir); if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(dir) !== dir || !expectedDirs.delete(rel)) fail('immutable_release_mismatch');
    for (const item of fs.readdirSync(dir)) {
      const file = path.join(dir, item), relative = rel ? rel + '/' + item : item, stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || fs.realpathSync(file) !== file) fail('immutable_release_mismatch');
      if (stat.isDirectory()) visit(file, relative);
      else if (!stat.isFile() || !expectedFiles.delete(relative)) fail('immutable_release_mismatch');
      else if (relative === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[relative]) fail('immutable_release_mismatch');
    }
  }
  visit(path.resolve(directory), ''); if (expectedFiles.size || expectedDirs.size) fail('immutable_release_mismatch');
}
function applyInstall(plan, { lease: borrowed, stoppedPermit } = {}) {
  let fingerprint = assertPreparedInstallPlan(plan);
  assertBaseline(plan);
  if (!borrowed) assertInitialLayout(plan);
  const certified = stoppedPermit && require('./stopped-update').assertStoppedUpdatePermit(stoppedPermit, { plan, lease: borrowed });
  const d = plan.descriptor; assertNoLifecycleMarkers(d.stateDir, !!certified); assertSwitchVolumes(d.installRoot, plan.cepDir); fs.mkdirSync(d.installRoot, { recursive: true });
  const scope = { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath: plan.descriptorPath };
  const lease = borrowed || acquireInstallLease(scope); assertInstallLease(lease, scope, { full: true });
  let txnFile, txn, writes = false; const staged = new Map();
  try {
    assertBaseline(plan);
    assertInitialLayout(plan, lease);
    if (d.version !== 2 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(plan.transactionId) || (plan.previousDescriptor ? canonical(d.predecessor) !== canonical({ transactionId: plan.transactionId, previousDescriptorHash: hash(plan.previousDescriptor) }) : d.predecessor !== null)) fail('install_lineage_plan');
    assertRuntimeStopped(d.stateDir, { lease, descriptorPath: plan.descriptorPath, cepDir: plan.cepDir, plan, stoppedPermit });
    writes = true;
    fs.mkdirSync(path.join(d.installRoot, 'transactions'), { recursive: true });
    fingerprint = prepareInstallPlan(plan, { lease });
    checkpointInstallLease(lease, 'installing');
    const existingRelease = fs.existsSync(d.releaseDir);
    if (initialPlan(plan) && existingRelease) fail('initial_installation_not_pristine');
    if (!existingRelease) {
      writes = true;
      const stage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
      for (const [relative, b64] of Object.entries(plan.pkg.files)) durable(path.join(stage, relative), Buffer.from(b64, 'base64'));
      durable(path.join(stage, 'release.json'), canonical(plan.pkg.release)); checkRelease(stage, plan.pkg.release);
      if (initialPlan(plan) && entryExists(d.releaseDir)) fail('initial_installation_not_pristine');
      fs.renameSync(stage, d.releaseDir);
    }
    checkRelease(d.releaseDir, plan.pkg.release);
    for (const [file, b64] of Object.entries(plan.pkg.files)) rememberInitialFile(plan, path.join(d.releaseDir, file), Buffer.from(b64, 'base64'));
    rememberInitialFile(plan, path.join(d.releaseDir, 'release.json'), canonical(plan.pkg.release));
    const transactionId = plan.transactionId; txnFile = path.join(d.installRoot, 'transactions', transactionId + '.json');
    const backupCep = path.join(d.installRoot, 'transactions', transactionId + '-cep'), cepStage = path.join(d.installRoot, 'transactions', transactionId + '-cep-next');
    txn = { version: 2, transactionId, preparedPlanHash: fingerprint.preparedPlanHash, preparedStateHash: fingerprint.preparedStateHash, clientBinding: plan.clientBinding, originBinding: { version: 1, rootOriginHash: hash(plan.originBytes), anchorOriginHash: hash(plan.originBytes) }, installRoot: d.installRoot, descriptorPath: plan.descriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, backupCep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCepHash: treeHash(plan.previousCep), appliedDescriptorHash: hash(canonical(d)), appliedConfigHash: hash(plan.nextConfig), appliedCepHash: treeHash(plan.cep), stateDir: d.stateDir };
    writes = true;
    if (entryExists(backupCep) || entryExists(cepStage)) fail('install_staging_exists');
    fs.mkdirSync(path.dirname(plan.cepDir), { recursive: true }); assertSwitchVolumes(d.installRoot, plan.cepDir);
    restoreTree(cepStage, plan.cep); assertCepStage(cepStage, plan.cep);
    for (const [file, b64] of Object.entries(plan.cep)) rememberInitialFile(plan, path.join(cepStage, file), Buffer.from(b64, 'base64'));
    durable(plan.descriptorPath + '.next', canonical(d)); staged.set(plan.descriptorPath + '.next', retainStagedFile(plan.descriptorPath + '.next', canonical(d)));
    if (plan.nextClient) { durable(plan.clientBinding.clientDescriptorPath + '.next', plan.nextClient); staged.set(plan.clientBinding.clientDescriptorPath + '.next', retainStagedFile(plan.clientBinding.clientDescriptorPath + '.next', plan.nextClient)); }
    durable(plan.configPath + '.core4-next', plan.nextConfig); staged.set(plan.configPath + '.core4-next', retainStagedFile(plan.configPath + '.core4-next', plan.nextConfig));
    durable(txnFile, canonical(txn));
    rememberInitialFile(plan, txnFile, canonical(txn));
    for (const view of staged.values()) rememberInitialFile(plan, view.file, view.bytes);
    // Last CAS before any visible switch. Unknown filesystem outcomes are not retried.
    assertBaseline(plan, false, staged); assertCepStage(cepStage, plan.cep); assertInitialLayout(plan, lease);
    // The initial identity becomes visible only after the final pristine CAS.
    // Earlier failures retain attributable staging, never mint a replacement ID.
    if (initialPlan(plan)) {
      durable(path.join(d.installRoot, 'origin.json'), plan.originBytes);
      rememberInitialFile(plan, path.join(d.installRoot, 'origin.json'), plan.originBytes);
      durable(path.join(d.stateDir, 'origin.json'), plan.originBytes);
      rememberInitialFile(plan, path.join(d.stateDir, 'origin.json'), plan.originBytes);
    }
    assertBaseline(plan, true, staged);
    if (stoppedPermit) require('./stopped-update').stoppedUpdateSwitchReady(stoppedPermit, { plan, lease, txnFile, cepStage, backupCep });
    const cepIdentity = fs.lstatSync(cepStage, { bigint: true });
    if (fs.existsSync(plan.cepDir)) fs.renameSync(plan.cepDir, backupCep);
    fs.renameSync(cepStage, plan.cepDir); assertCepStage(plan.cepDir, plan.cep);
    const publishedCep = fs.lstatSync(plan.cepDir, { bigint: true }); if (publishedCep.dev !== cepIdentity.dev || publishedCep.ino !== cepIdentity.ino) fail('install_staging_changed');
    publishStagedFile(staged.get(plan.descriptorPath + '.next'), plan.descriptorPath);
    safeFile(plan.clientBinding.clientDescriptorPath); safeFile(plan.clientBinding.clientDescriptorPath + '.next'); safeFile(plan.clientBinding.clientDescriptorPath + '.rollback');
    const beforeClient = checkedBytes(plan.clientBinding.clientDescriptorPath);
    if ((beforeClient ? hash(beforeClient) : null) !== plan.baseline.client) fail('client_binding_changed');
    if (plan.nextClient) publishStagedFile(staged.get(plan.clientBinding.clientDescriptorPath + '.next'), plan.clientBinding.clientDescriptorPath);
    else if (plan.clientBinding.previousClient !== null) {
      if (!safeFile(plan.clientBinding.clientDescriptorPath)) fail('client_binding_changed');
      fs.unlinkSync(plan.clientBinding.clientDescriptorPath);
    }
    const appliedClient = checkedBytes(clientPaths(d.installRoot)), appliedOrigin = originState(d);
    if ((appliedClient ? hash(appliedClient) : null) !== txn.clientBinding.appliedClientHash || !appliedOrigin.root || !appliedOrigin.anchor || hash(appliedOrigin.root) !== txn.originBinding.rootOriginHash || hash(appliedOrigin.anchor) !== txn.originBinding.anchorOriginHash || hash(bytes(plan.descriptorPath)) !== txn.appliedDescriptorHash || (bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || treeHash(snapshot(plan.cepDir)) !== txn.appliedCepHash) fail('install_readback_mismatch');
    publishStagedFile(staged.get(plan.configPath + '.core4-next'), plan.configPath);
    if (hash(bytes(plan.configPath)) !== txn.appliedConfigHash) fail('install_readback_mismatch');
    require('../runtime/installation').verifyInstallation(plan.descriptorPath); checkpointInstallLease(lease, 'installed');
    return { installed: true, packageHash: d.packageHash, installationId: d.installationId, descriptorPath: plan.descriptorPath, transactionFile: txnFile, stateDir: d.stateDir, requiresPanelOpen: true, requiresMcpReconnect: true, liveProof: false };
  } catch (e) { if (writes) { retainInstallLease(lease); e.leaseRetained = true; if (txnFile) e.transactionFile = txnFile; } throw e; }
  finally {
    let closeFault;
    for (const view of staged.values()) try { fs.closeSync(view.fd); } catch (e) { closeFault ||= e; }
    if (closeFault) retainInstallLease(lease);
    if (!borrowed) { const state = assertInstallLease(lease, scope); if (!state.retained) releaseInstallLease(lease); }
    if (closeFault) throw Object.assign(new Error('install_stage_close_failed'), { code: 'install_stage_close_failed', leaseRetained: true, cause: closeFault });
  }
}
function rollbackBinding(t, current, target) {
  if (current.installRoot !== t.installRoot || current.stateDir !== t.stateDir || target &&
      ['installRoot', 'stateDir', 'installationId', 'machineId'].some(key => target[key] !== current[key])) fail('rollback_client_scope');
  const file = clientPaths(t.installRoot), value = checkedBytes(file), origin = originState(current);
  if (!origin.root || !origin.anchor || !origin.root.equals(origin.anchor)) fail('rollback_client_baseline_changed');
  const originValue = JSON.parse(origin.root);
  if (originValue.installationId !== current.installationId || originValue.machineId !== current.machineId) fail('rollback_client_baseline_changed');
  const currentRuntime = installedBinding(current), targetRuntime = target ? installedBinding(target) : null;
  if (entryExists(path.join(t.stateDir, 'work-session.json')) && (targetRuntime?.runtimeModel !== 'owner' || targetRuntime.version !== 4)) fail('work_session_reader_unsupported');
  if (!Object.hasOwn(t, 'clientBinding')) {
    if (Object.hasOwn(t, 'originBinding') || currentRuntime.runtimeModel !== 'stdio' || targetRuntime?.runtimeModel === 'owner' || value) fail('rollback_client_extension_required');
    return { file, previous: null, value: null, origin };
  }
  validateClientBinding(t.clientBinding, t.installRoot);
  const binding = t.clientBinding, prior = binding.previousClient === null ? null : Buffer.from(binding.previousClient, 'base64');
  const o = t.originBinding;
  if (!o || Object.keys(o).sort().join(',') !== 'anchorOriginHash,rootOriginHash,version' || o.version !== 1 || !/^[a-f0-9]{64}$/.test(o.rootOriginHash) || !/^[a-f0-9]{64}$/.test(o.anchorOriginHash) ||
      !origin.root || !origin.anchor || hash(origin.root) !== o.rootOriginHash || hash(origin.anchor) !== o.anchorOriginHash ||
      binding.runtimeModel !== currentRuntime.runtimeModel || (value ? hash(value) : null) !== binding.appliedClientHash) fail('rollback_client_baseline_changed');
  if (currentRuntime.runtimeModel === 'owner') assertOwnedClient(value, current, origin.root);
  if (targetRuntime?.runtimeModel === 'owner') assertOwnedClient(prior, target, origin.root);
  else if (prior) fail('foreign_client_descriptor');
  const preparedFile = path.join(t.installRoot, 'transactions', t.transactionId + '-prepared', 'prepared.json');
  const preparedBytes = checkedBytes(preparedFile, 64 * 1024 * 1024), prepared = preparedBytes && JSON.parse(preparedBytes);
  if (!prepared || hash(preparedBytes) !== t.preparedStateHash || prepared.preparedPlanHash !== t.preparedPlanHash || prepared.transactionId !== t.transactionId ||
      prepared.descriptorPath !== t.descriptorPath || prepared.configPath !== t.configPath || prepared.cepDir !== t.cepDir ||
      prepared.previousDescriptor !== t.previousDescriptor || prepared.previousConfig !== t.previousConfig || treeHash(prepared.previousCep) !== t.previousCepHash ||
      canonical(prepared.clientBinding) !== canonical(binding) ||
      hash(Buffer.from(prepared.originBytes, 'base64')) !== o.rootOriginHash ||
      (prepared.nextClient === null ? null : hash(Buffer.from(prepared.nextClient, 'base64'))) !== binding.appliedClientHash ||
      hash(Buffer.from(prepared.descriptorBytes, 'base64')) !== t.appliedDescriptorHash || hash(Buffer.from(prepared.configBytes, 'base64')) !== t.appliedConfigHash || treeHash(prepared.cep) !== t.appliedCepHash) fail('rollback_client_prepared_changed');
  const planned = JSON.parse(Buffer.from(prepared.descriptorBytes, 'base64'));
  const previousDescriptorHash = t.previousDescriptor === null ? null : hash(Buffer.from(t.previousDescriptor, 'base64'));
  const previousConfigHash = t.previousConfig === null ? null : hash(Buffer.from(t.previousConfig, 'base64'));
  const predecessor = t.previousDescriptor === null ? null : { transactionId: t.transactionId, previousDescriptorHash };
  if (t.version !== 2 || planned.version !== 2 || canonical(planned) !== canonical(current) || canonical(planned.predecessor) !== canonical(predecessor) ||
      planned.installRoot !== t.installRoot || planned.stateDir !== path.join(t.installRoot, 'state/production') || planned.cepDir !== t.cepDir ||
      prepared.package.packageHash !== planned.packageHash || hash(prepared.package.release) !== planned.packageHash ||
      prepared.origin.installationId !== planned.installationId || prepared.origin.machineId !== planned.machineId ||
      prepared.baseline.descriptor !== previousDescriptorHash || prepared.baseline.config !== previousConfigHash || prepared.baseline.cep !== t.previousCepHash) fail('rollback_client_prepared_changed');
  const preparedDirectory = path.dirname(preparedFile), expected = ['descriptor.json', 'prepared.json', ...(prepared.nextClient === null ? [] : ['client.json'])].sort();
  if (canonical(fs.readdirSync(preparedDirectory).sort()) !== canonical(expected) || hash(checkedBytes(path.join(preparedDirectory, 'descriptor.json'))) !== t.appliedDescriptorHash ||
      prepared.nextClient !== null && hash(checkedBytes(path.join(preparedDirectory, 'client.json'))) !== binding.appliedClientHash) fail('rollback_client_prepared_changed');
  return { file, previous: prior, value, origin };
}
function rollback(file) {
  if (!safeFile(file)) fail('rollback_scope');
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(t.version) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(t.transactionId) || !path.isAbsolute(t.installRoot) || path.basename(t.installRoot).toLowerCase() !== 'aeagentcore4' || t.descriptorPath !== path.join(t.installRoot, 'installation.json') || t.backupCep !== path.join(t.installRoot, 'transactions', t.transactionId + '-cep') || path.basename(t.cepDir) !== BUNDLE || path.resolve(file) !== path.join(t.installRoot, 'transactions', t.transactionId + '.json') || fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== path.resolve(file)) fail('rollback_scope');
  if (hash(bytes(t.descriptorPath)) !== t.appliedDescriptorHash || hash(bytes(t.configPath)) !== t.appliedConfigHash || treeHash(snapshot(t.cepDir)) !== t.appliedCepHash) fail('rollback_baseline_changed');
  const current = JSON.parse(bytes(t.descriptorPath)), priorBytes = t.previousDescriptor === null ? null : Buffer.from(t.previousDescriptor, 'base64'), target = priorBytes && JSON.parse(priorBytes);
  if (priorBytes && priorBytes.toString('base64') !== t.previousDescriptor) fail('rollback_previous_bytes');
  let client = rollbackBinding(t, current, target);
  assertNoLifecycleMarkers(t.stateDir);
  const scope = { installRoot: t.installRoot, stateDir: t.stateDir, descriptorPath: t.descriptorPath }, lease = acquireInstallLease(scope); let writes = false;
  try {
    if (hash(bytes(t.descriptorPath)) !== t.appliedDescriptorHash || hash(bytes(t.configPath)) !== t.appliedConfigHash || treeHash(snapshot(t.cepDir)) !== t.appliedCepHash) fail('rollback_baseline_changed');
    client = rollbackBinding(t, current, target);
    assertRuntimeStopped(t.stateDir, { lease, descriptorPath: t.descriptorPath, cepDir: t.cepDir });
    require('../runtime/native-read-disposition').assertRollbackReaderCompatible({ directory: path.join(t.stateDir, 'receiver'), target });
    if (target && (target.nodePath !== process.execPath || target.nodeHash !== hash(fs.readFileSync(process.execPath)))) fail('rollback_node_binding_unsupported');
    if (t.previousCepHash !== treeHash(fs.existsSync(t.backupCep) ? snapshot(t.backupCep) : null)) fail('rollback_backup_mismatch');
    checkpointInstallLease(lease, 'installing');
    // Move only the exact owned bundle. Keep recoverable applied files as evidence.
    writes = true;
    fs.renameSync(t.cepDir, path.join(t.installRoot, 'transactions', t.transactionId + '-applied-cep'));
    if (fs.existsSync(t.backupCep)) fs.renameSync(t.backupCep, t.cepDir);
    for (const [destination, prior] of [[t.descriptorPath, t.previousDescriptor], [client.file, client.previous?.toString('base64') ?? null], [t.configPath, t.previousConfig]]) {
      if (destination === client.file) clientPaths(t.installRoot);
      if (prior === null) { if (destination !== client.file || client.value) fs.unlinkSync(destination); }
      else { durable(destination + '.rollback', Buffer.from(prior, 'base64')); fs.renameSync(destination + '.rollback', destination); }
    }
    const restored = checkedBytes(clientPaths(t.installRoot)), restoredOrigin = originState(current);
    if ((restored?.toString('base64') ?? null) !== (client.previous?.toString('base64') ?? null) || !restoredOrigin.root?.equals(client.origin.root) || !restoredOrigin.anchor?.equals(client.origin.anchor) ||
        (bytes(t.descriptorPath)?.toString('base64') ?? null) !== t.previousDescriptor || (bytes(t.configPath)?.toString('base64') ?? null) !== t.previousConfig || treeHash(snapshot(t.cepDir)) !== t.previousCepHash) fail('rollback_readback_mismatch');
    if (t.previousDescriptor !== null) require('../runtime/installation').verifyInstallation(t.descriptorPath, { cepDir: t.cepDir });
    checkpointInstallLease(lease, 'installed');
    return { rolledBack: true, transactionId: t.transactionId, statePreserved: true, liveProof: false };
  } catch (e) { if (writes) { retainInstallLease(lease); e.leaseRetained = true; e.transactionFile = file; } throw e; }
  finally { const state = assertInstallLease(lease, scope); if (!state.retained) releaseInstallLease(lease); }
}
function sourceWorkspace(explicit) {
  // Source checkout layout is the discovery contract; neither CWD nor machine
  // identity selects a configuration target. Standalone copies need --workspace.
  const workspaceRoot = explicit === undefined ? path.resolve(__dirname, '../..') : explicit;
  if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot) || path.resolve(workspaceRoot) !== workspaceRoot) fail('workspace_absolute_exact_path_required');
  try {
    const marker = path.join(workspaceRoot, 'core4/package.json'), installer = path.join(workspaceRoot, 'core4/tools/install-core4.js');
    if (explicit === undefined && __filename !== installer) fail('workspace_source_layout_required');
    if (!fs.lstatSync(workspaceRoot).isDirectory() || fs.realpathSync(workspaceRoot) !== workspaceRoot || ![marker, installer].every(file => fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && fs.realpathSync(file) === file) || JSON.parse(fs.readFileSync(marker, 'utf8')).name !== 'ae-agent-core4') fail('workspace_source_layout_required');
  } catch { fail('workspace_source_layout_required'); }
  return { workspaceRoot, workspaceSource: explicit === undefined ? 'installer-location' : 'explicit-workspace', installerPath: __filename };
}
function defaults(pkg, nodePath, workspaceRoot) { return { pkg, nodePath, installRoot: path.join(process.env.LOCALAPPDATA, 'AEAgentCore4'), extensionsDir: path.join(process.env.APPDATA, 'Adobe/CEP/extensions'), configPath: path.join(workspaceRoot, '.codex/config.toml') }; }
if (require.main === module) {
  try {
    const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1];
    if (args[0] === 'rollback' && args.length === 2) console.log(canonical(rollback(path.resolve(args[1]))));
    else {
      const flags = args.slice(1).filter((_, index) => index % 2 === 0);
      if (!['dry-run', 'apply'].includes(args[0]) || args.length % 2 !== 1 || flags.some(f => !['--package', '--node', '--workspace', '--expected-package-hash', '--runtime'].includes(f)) || new Set(flags).size !== flags.length || !flags.includes('--package') || args[0] === 'apply' && !flags.includes('--expected-package-hash')) fail('usage_install_mode_package_node_expected_hash');
      const pkg = verifyPackage(JSON.parse(fs.readFileSync(get('--package'), 'utf8')));
      if (flags.includes('--expected-package-hash') && (!/^[a-f0-9]{64}$/.test(get('--expected-package-hash')) || pkg.packageHash !== get('--expected-package-hash'))) fail('reviewed_package_hash_mismatch');
      const workspace = sourceWorkspace(flags.includes('--workspace') ? get('--workspace') : undefined);
      const plan = planInstall({ ...defaults(pkg, flags.includes('--node') ? get('--node') : process.execPath, workspace.workspaceRoot), ...(flags.includes('--runtime') ? { runtimeModel: get('--runtime') } : {}) });
      console.log(canonical(args[0] === 'apply' ? applyInstall(plan) : { dryRun: true, ...workspace, packageHash: pkg.packageHash, expectedPackageHash: pkg.packageHash, releaseDir: plan.descriptor.releaseDir, descriptorPath: plan.descriptorPath, stateDir: plan.descriptor.stateDir, cepDir: plan.cepDir, configPath: plan.configPath, nodePath: plan.descriptor.nodePath, nodeVersion: plan.descriptor.nodeVersion, nodeHash: plan.descriptor.nodeHash, baseline: plan.baseline, liveProof: false }));
    }
  } catch (e) { console.error(canonical({ error: e.code || 'install_failed', ...(e.transactionFile ? { transactionFile: e.transactionFile } : {}) })); process.exitCode = 1; }
}
module.exports = { planInstall, assertPreparedInstallPlan, assertPreparedInstallBaseline, preparedInstallPayload, prepareInstallPlan, assertDurablePreparedInstallPlan, applyInstall, rollback, snapshot, configText, checkRelease };

```

## core4/runtime/install-lease.js
SHA-256: `fe91dfedfafceaa38f0cac72d007f2600d4b82915d07b960c8d3ed6d735bb368`
```javascript
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

```

## core4/runtime/installation.js
SHA-256: `7b7894f23e0ed6b7e11c644884b782d2532520e1da56981907cf0c7484cc1dc9`
```javascript
'use strict';
// The entry is builtin-only until start() verifies the complete installed tree.
const { verifyInstallation, verifyRelease, verifyCep } = require('./stdio-entry.js');
module.exports = { verifyInstallation, verifyRelease, verifyCep };

```

## core4/runtime/stdio-entry.js
SHA-256: `41e35929bb3118ad0e490de4e464f6051d6410b2ab2bfd9953aae80db920d2c7`
```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const PRODUCTION_TIMING = Object.freeze({ callerTimeoutMs: 100000, callbackTimeoutMs: 90000, mcpToolTimeoutSec: 120 });
// A large project with a native load warning returned its authenticated result after 103 s.
const PROJECT_OPEN_TIMING = Object.freeze({ callerTimeoutMs: 115000, callbackTimeoutMs: 110000 });
const DIRECT_READ_DRAIN_MS = 10000;
// ONLY builtins are loaded until the entire installed release is verified.
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_installation_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
function exactKeys(value, keys) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('composition_schema'); }
const POLICY_FILE = 'runtime/composition-policy.json';
const BUILTIN_CAPABILITIES = Object.freeze({ 'render-jobs': Object.freeze({ version: 1,
  files: Object.freeze(['runtime/render-job-owner.js', 'runtime/aerender-jobs.js', 'runtime/aerender-profile.js']) }) });
function builtinCapabilityFiles(capabilities) {
  if (!capabilities || Object.getPrototypeOf(capabilities) !== Object.prototype) fail('composition_capabilities');
  return Object.entries(capabilities).flatMap(([id, version]) => {
    if (!Object.hasOwn(BUILTIN_CAPABILITIES, id) || version !== BUILTIN_CAPABILITIES[id].version) fail('composition_capabilities');
    return BUILTIN_CAPABILITIES[id].files;
  });
}
function validateCompRenderCompletion(value) {
  exactKeys(value, ['directory', 'format']);
  if (typeof value.directory !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.directory) ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(value.directory) || value.format !== 'H.264') fail('composition_not_admitted');
  return value;
}
const RESULT_PROFILES = Object.freeze({
  'manual-text-v1': null,
  'photo-source-v1': 'runtime/photo-source-proof.js',
  'owned-project-assembly-v1': 'runtime/project-assembly-proof.js',
  'media-import-v1': 'runtime/media-layer-proof.js',
  'layer-insert-v1': 'runtime/layer-insert-proof.js',
  'layer-overlay-v1': 'runtime/layer-overlay-proof.js',
  'current-project-save-v1': 'runtime/project-save-proof.js',
  'project-lifecycle-v1': 'runtime/project-lifecycle-proof.js',
  'manual-point-layout-v1': 'runtime/point-layout-proof.js',
  'owned-text-layer-v1': 'runtime/text-layer-proof.js',
  'owned-text-variant-v1': 'runtime/text-variant-proof.js',
  'owned-comp-render-v1': 'runtime/comp-render-proof.js',
  'comp-frame-export-v1': 'runtime/comp-frame-export-proof.js',
});
const OPERATOR_EFFECTS = Object.freeze({
  'titles-current-target': 'layer.text',
  'photo-placeholder': 'layer.source',
  'titles-point-layout': 'layer.text-layout',
  'text-layer': 'point-text-document-write',
  'text-variant': 'text-variant-stage',
  'comp-render': 'owned-native-render',
  'comp-frame-export': 'composition-frame-png-export',
  'project-assembly': 'project-composition-assembly',
  'project-save': 'project-save-in-place',
  'project-lifecycle': 'project-lifecycle-transition',
  'media-import': 'project-media-import',
  'layer-insert': 'composition-layer-insert',
  'layer-overlay': 'composition-layer-overlay',
});
const INSPECTION_ASSET = { assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] };
function compositionPaths(files, closures, readArtifact) {
  const safe = file => typeof file === 'string' && file !== 'release.json' && /^[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)*$/.test(file) && !/^(test|experiments|node_modules|logs|state|tools)\//.test(file);
  if (!Array.isArray(files) || !files.every(safe) || !Array.isArray(closures) || !closures.every(safe)) fail('composition_paths');
  const paths = new Set(files);
  for (const relative of closures) {
    paths.add(relative);
    const artifact = readArtifact(relative);
    const local = /^(modules|plan-engine)\//.test(relative);
    for (const file of Object.keys(artifact.hashes)) {
      if (!safe(file) || local && !/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file)) fail('composition_paths');
      paths.add(local ? path.posix.join(path.posix.dirname(relative), file) : file);
    }
  }
  return paths;
}
function declarativeProfiles(composition, release, json, checked) {
  const policy = json(POLICY_FILE);
  const declared = Object.hasOwn(policy, 'version');
  const versionedPolicy = ['4.2.3', '4.2.4', '4.2.5'].includes(release.version);
  exactKeys(policy, ['id', 'modules', 'assets', 'profiles', 'files', 'closures', ...(declared ? ['version', 'capabilities'] : [])]);
  if (declared ? policy.version !== 2 || !versionedPolicy : versionedPolicy) fail('composition_policy_version');
  const capabilities = declared ? policy.capabilities : release.version === '4.2.2' && composition.id === 'operator-render-jobs' ? { 'render-jobs': 1 } : {};
  builtinCapabilityFiles(capabilities);
  if (policy.id !== composition.id || canonical(policy.modules) !== canonical(composition.modules) || canonical(policy.assets) !== canonical(composition.assets)) fail('composition_assets');
  const paths = compositionPaths(policy.files, policy.closures, json);
  for (const file of ['config/catalog.json', 'runtime/composition.json', POLICY_FILE, 'cep/jsx/registry.jsx']) paths.add(file);
  if (canonical([...paths].sort()) !== canonical(Object.keys(release.hashes).sort())) fail('composition_optional_closure');
  if (canonical(composition.assets[0]) !== canonical(INSPECTION_ASSET) || new Set(composition.modules).size !== composition.modules.length ||
      !composition.modules.every(id => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id))) fail('composition_assets');
  const mutations = composition.assets.slice(1);
  if (composition.id === 'readonly' ? mutations.length || composition.modules.length : !mutations.length) fail('composition_assets');
  if (mutations.length) {
    checked('runtime/manual-policy.js');
    checked('runtime/windows-reservation-provider.js');
  }
  if (new Set(mutations.map(a => a.moduleId)).size !== mutations.length || new Set(composition.assets.map(a => a.assetKey)).size !== composition.assets.length) fail('composition_assets');
  exactKeys(policy.profiles, mutations.map(a => a.moduleId));
  const proofPaths = new Set();
  for (const asset of mutations) {
    exactKeys(asset, ['assetKey', 'moduleId', 'path', 'admission', 'policy', 'phases']);
    const id = asset.moduleId, profile = policy.profiles[id];
    exactKeys(profile, ['operationId', 'resultProfile', ...(Object.hasOwn(profile, 'operatorConfirmation') ? ['operatorConfirmation'] : [])]);
    if (!composition.modules.includes(id) || asset.assetKey !== id + '-v1' || asset.path !== 'modules/' + id || asset.admission !== 'config/admissions/' + id + '.json' ||
        asset.policy !== 'current-matching-target-after-local-confirmation-v1' || canonical(asset.phases) !== '["inspect","mutate","verify"]' ||
        typeof profile.resultProfile !== 'string' || !Object.hasOwn(RESULT_PROFILES, profile.resultProfile) ||
        (profile.resultProfile === 'manual-text-v1') !== (id === 'titles-current-target') ||
        profile.resultProfile === 'photo-source-v1' && (id !== 'photo-placeholder' || profile.operationId !== 'replace-source') ||
        (profile.resultProfile === 'owned-project-assembly-v1') !== (id === 'project-assembly') ||
        id === 'project-assembly' && profile.operationId !== 'assemble-composition' ||
        (profile.resultProfile === 'media-import-v1') !== (id === 'media-import') ||
        id === 'media-import' && profile.operationId !== 'ingest-footage' ||
        (profile.resultProfile === 'layer-insert-v1') !== (id === 'layer-insert') ||
        id === 'layer-insert' && profile.operationId !== 'insert-footage-layer' ||
        (profile.resultProfile === 'layer-overlay-v1') !== (id === 'layer-overlay') ||
        id === 'layer-overlay' && (profile.operationId !== 'duplicate-and-replace-still' ||
          profile.operatorConfirmation !== 'registry-v1' || !release.hashes['runtime/media-layer-proof.js']) ||
        (profile.resultProfile === 'current-project-save-v1') !== (id === 'project-save') ||
        id === 'project-save' && profile.operationId !== 'save-current-project' ||
        (profile.resultProfile === 'project-lifecycle-v1') !== (id === 'project-lifecycle') ||
        id === 'project-lifecycle' && profile.operationId !== 'transition-project' ||
        (profile.resultProfile === 'comp-frame-export-v1') !== (id === 'comp-frame-export') ||
        id === 'comp-frame-export' && (profile.operationId !== 'save-comp-frame-png' || profile.operatorConfirmation !== 'registry-v1' ||
          !release.hashes['runtime/png-proof.js'] ||
          !(release.hashes['runtime/project-file.js'] || release.hashes['runtime/project-save-proof.js'])) ||
        Object.hasOwn(profile, 'operatorConfirmation') &&
          (![true, 'registry-v1'].includes(profile.operatorConfirmation) || !release.hashes['runtime/operator-confirmation.js'])) fail('composition_not_admitted');
    // Earlier packages kept both media proofs in the same pinned file.
    const proof = profile.resultProfile === 'layer-insert-v1' && !release.hashes['runtime/layer-insert-proof.js']
      ? 'runtime/media-layer-proof.js' : RESULT_PROFILES[profile.resultProfile];
    if (proof) { checked(proof); proofPaths.add(proof); }
  }
  if (release.hashes['runtime/project-file.js']) checked('runtime/project-file.js');
  if (composition.id === 'operator-photo-montage') {
    checked('runtime/montage-mandate.js');
    if (!release.hashes['runtime/project-save-proof.js']) checked('runtime/project-file.js');
  }
  const modules = new Set(['project-inspection', ...composition.modules]);
  for (const file of paths) {
    if (file.startsWith('modules/') && !modules.has(file.split('/')[1]) ||
        file.startsWith('config/admissions/') && !composition.modules.some(id => file === 'config/admissions/' + id + '.json') ||
        Object.values(RESULT_PROFILES).includes(file) && !proofPaths.has(file)) fail('composition_optional_closure');
  }
  if (composition.id === 'readonly' && [...paths].some(file => /^(plan-engine\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
  return { profiles: policy.profiles, capabilities };
}
// Compatibility table for previously issued composition-v1 packages.
const LEGACY_PROFILES = Object.freeze({
  'titles-current-target': { operationId: 'set-current-text', resultProfile: 'manual-text-v1' },
  'titles-point-layout': { operationId: 'measure-or-apply-point-layout', resultProfile: 'manual-point-layout-v1' },
  'text-layer': { operationId: 'write-point-text', resultProfile: 'owned-text-layer-v1' },
  'text-variant': { operationId: 'stage-text-variant', resultProfile: 'owned-text-variant-v1' },
  'comp-render': { operationId: 'render-text-variant', resultProfile: 'owned-comp-render-v1' },
});
// Builtin-only release interpretation. Callers verify the COMPLETE tree first.
// These two reviewed adapters are closed policies, never names of executable imports.
function deriveComposition(release, read) {
  if (release.format !== 1 && release.format !== 2) fail('release_format');
  const checked = file => { if (!Object.hasOwn(release.hashes, file)) fail('composition_unhashed_path'); const bytes = read(file); if (hash(bytes) !== release.hashes[file]) fail('composition_bytes'); return bytes; };
  const json = file => JSON.parse(checked(file));
  if (release.format === 1) {
    if (Object.hasOwn(release.hashes, 'runtime/composition.json') || Object.hasOwn(release.hashes, POLICY_FILE) ||
        builtinCapabilityFiles({ 'render-jobs': 1 }).some(file => Object.hasOwn(release.hashes, file))) fail('composition_downgrade');
    if (!Object.hasOwn(release.hashes, 'runtime/profiles.json') || !Object.hasOwn(release.hashes, 'runtime/source-package.json')) fail('composition_downgrade');
    const inspection = json('modules/project-inspection/artifact.json');
    const manual = json('config/admissions/titles-current-target.json');
    return { legacy: true, assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
  }
  if (!Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_required');
  const composition = json('runtime/composition.json'); exactKeys(composition, ['version', 'id', 'modules', 'engine', 'assets']);
  if (![1, 2].includes(composition.version) || (composition.version === 2) !== Object.hasOwn(release.hashes, POLICY_FILE) ||
      typeof composition.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(composition.id) || !Array.isArray(composition.modules) || !Array.isArray(composition.assets)) fail('composition_schema');
  const catalog = json('config/catalog.json'); exactKeys(catalog, ['catalogRevision', 'modules', 'engine']);
  if (['4.2.3', '4.2.4', '4.2.5'].includes(release.version) && composition.version !== 2) fail('composition_policy_version');
  const { profiles, capabilities } = composition.version === 2 ? declarativeProfiles(composition, release, json, checked) : { profiles: LEGACY_PROFILES, capabilities: {} };
  if (composition.version === 1) validateLegacyComposition(composition, release, checked);
  if (!Array.isArray(catalog.modules) || canonical(catalog.modules.map(m => m.id)) !== canonical(composition.modules) || canonical(catalog.engine) !== canonical(composition.engine) || (composition.id === 'readonly' ? composition.engine !== null : !composition.engine || composition.engine.path !== 'plan-engine')) fail('composition_catalog');
  function admitted(entry) {
    exactKeys(entry, ['id', 'version', 'path', 'admission']);
    if (entry.path !== 'modules/' + entry.id || entry.admission !== 'config/admissions/' + entry.id + '.json') fail('composition_catalog');
    const manifest = json(entry.path + '/artifact.json'), contract = json(entry.path + '/contract.json'), admission = json(entry.admission), executor = checked(entry.path + '/executor.jsx');
    exactKeys(admission, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
    if (manifest.id !== entry.id || manifest.version !== entry.version || admission.revoked !== false || typeof admission.trustApprovalId !== 'string' || !admission.trustApprovalId || admission.protocolVersion !== 1 || admission.moduleId !== entry.id || contract.moduleId !== entry.id || admission.operationId !== contract.operationId || admission.artifactHash !== hash(manifest) || admission.schemaHash !== hash(contract.inputSchema) || admission.resultSchemaHash !== hash(contract.snapshotSchema) || admission.effectPolicyHash !== hash(contract.effectPolicy) || admission.executorHash !== hash(executor)) fail('composition_not_admitted');
    for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file) || hash(checked(entry.path + '/' + file)) !== pin) fail('composition_artifact');
    return { manifest, contract, admission, executor };
  }
  const selected = new Map(catalog.modules.map(entry => [entry.id, admitted(entry)]));
  if (composition.engine) { exactKeys(composition.engine, ['path', 'artifactHash']); const manifest = json('plan-engine/artifact.json'); if (hash(manifest) !== composition.engine.artifactHash) fail('composition_engine'); for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json)$/.test(file) || hash(checked('plan-engine/' + file)) !== pin) fail('composition_engine'); }
  const assets = composition.assets.map(asset => {
    let value = selected.get(asset.moduleId);
    if (asset.policy === 'read-only-current-observation-v1') {
      const contract = json(asset.path + '/contract.json'), admission = json(asset.admission), executor = checked(asset.path + '/executor.jsx');
      exactKeys(admission, ['moduleId', 'executionPolicy', 'executorHash', 'contractHash']);
      if (admission.moduleId !== asset.moduleId || admission.executionPolicy !== asset.policy || admission.executorHash !== hash(executor) || admission.contractHash !== hash(contract)) fail('composition_not_admitted');
      value = { contract, admission, executor };
    }
    if (!value) fail('composition_not_admitted');
    const binding = Object.hasOwn(profiles, asset.moduleId) ? profiles[asset.moduleId] : null;
    if (binding && (value.contract.operationId !== binding.operationId || value.contract.executionPolicy !== asset.policy)) fail('composition_not_admitted');
    const pilotConfirmation = ['manual-text-v1', 'photo-source-v1'].includes(binding?.resultProfile);
    if (binding?.operatorConfirmation && (
      !Object.hasOwn(OPERATOR_EFFECTS, asset.moduleId) || OPERATOR_EFFECTS[asset.moduleId] !== value.contract.effectPolicy.effect ||
      binding.operatorConfirmation !== (pilotConfirmation ? true : 'registry-v1')
    )) fail('composition_not_admitted');
    let proofConfig;
    if (composition.version === 2 && binding?.resultProfile === 'owned-comp-render-v1') {
      if (!Object.hasOwn(value.manifest.hashes, 'completion.json')) fail('composition_artifact');
      proofConfig = validateCompRenderCompletion(json(asset.path + '/completion.json'));
    }
    return { ...asset, ...value, executorHash: value.admission.executorHash, ...(binding ? { resultProfile: binding.resultProfile } : {}),
      ...(binding?.operatorConfirmation ? { operatorConfirmation: true } : {}),
      ...(binding?.operatorConfirmation === 'registry-v1' ? { registryOperatorConfirmation: true } : {}),
      ...(proofConfig ? { proofConfig } : {}) };
  });
  const startOverSupported = Object.hasOwn(release.hashes, 'runtime/owner-contract.json') && json('runtime/owner-contract.json').version === 4;
  if (assets.some(item => item.operatorConfirmation) && !startOverSupported) fail('operator_confirmation_owner_required');
  const renderJobs = Object.hasOwn(capabilities, 'render-jobs');
  for (const [id, capability] of Object.entries(BUILTIN_CAPABILITIES)) {
    if (Object.hasOwn(capabilities, id)) for (const file of capability.files) checked(file);
    else if (capability.files.some(file => Object.hasOwn(release.hashes, file))) fail('composition_optional_closure');
  }
  if (renderJobs) {
    if (!startOverSupported || !assets.some(item => item.resultProfile === 'project-lifecycle-v1' && item.registryOperatorConfirmation) ||
        !assets.some(item => item.resultProfile === 'current-project-save-v1')) fail('render_job_owner_required');
    if (['4.2.3', '4.2.4', '4.2.5'].includes(release.version)) for (const file of ['runtime/project-file.js', 'runtime/render-job-history.js', 'runtime/render-job-maintenance.js']) checked(file);
  }
  return { composition, assets, ...(startOverSupported ? { startOverSupported: true } : {}), ...(renderJobs ? { renderJobs: true } : {}) };
}
function validateLegacyComposition(composition, release, checked) {
  if (!['readonly', 'manual', 'manual-layout', 'manual-titles', 'manual-titles-variants'].includes(composition.id)) fail('composition_schema');
  const expectedIds = composition.id === 'readonly' ? [] : ['photo-placeholder', 'titles', 'titles-current-target'];
  const withVariants = composition.id === 'manual-titles-variants';
  const withText = withVariants || composition.id === 'manual-titles', withLayout = withText || composition.id === 'manual-layout';
  if (withLayout) expectedIds.push('titles-point-layout');
  if (withText) expectedIds.push('text-layer');
  if (withVariants) expectedIds.push('text-variant', 'comp-render');
  if (canonical(composition.modules) !== canonical(expectedIds)) fail('composition_catalog');
  const expectedAssets = [{ assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] }];
  if (composition.id !== 'readonly') expectedAssets.push({ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', path: 'modules/titles-current-target', admission: 'config/admissions/titles-current-target.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
  if (withLayout) {
    expectedAssets.push({ assetKey: 'titles-point-layout-v1', moduleId: 'titles-point-layout', path: 'modules/titles-point-layout', admission: 'config/admissions/titles-point-layout.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
    checked('runtime/point-layout-proof.js');
  } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/point-layout-proof\.js$|modules\/titles-point-layout\/|config\/admissions\/titles-point-layout\.json$)/.test(file))) fail('composition_optional_closure');
  if (withText) {
    expectedAssets.push({ assetKey: 'text-layer-v1', moduleId: 'text-layer', path: 'modules/text-layer', admission: 'config/admissions/text-layer.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
    checked('runtime/text-layer-proof.js');
  } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/text-layer-proof\.js$|modules\/text-layer\/|config\/admissions\/text-layer\.json$)/.test(file))) fail('composition_optional_closure');
  if (withVariants) {
    expectedAssets.push({ assetKey: 'text-variant-v1', moduleId: 'text-variant', path: 'modules/text-variant', admission: 'config/admissions/text-variant.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
    expectedAssets.push({ assetKey: 'comp-render-v1', moduleId: 'comp-render', path: 'modules/comp-render', admission: 'config/admissions/comp-render.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
    checked('runtime/text-variant-proof.js');
    checked('runtime/comp-render-proof.js');
  } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/(?:text-variant|comp-render)-proof\.js$|modules\/(?:text-variant|comp-render)\/|config\/admissions\/(?:text-variant|comp-render)\.json$)/.test(file))) fail('composition_optional_closure');
  if (canonical(composition.assets) !== canonical(expectedAssets)) fail('composition_assets');
  // No optional runtime code is shipped in the standalone inspection composition.
  if (composition.id === 'readonly' && Object.keys(release.hashes).some(file => /^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
}
function registrySource(assets, codecSource) {
  const declarations = [], entries = assets.map((asset, index) => {
    const name = 'executor' + index; declarations.push('var ' + name + '=' + asset.executor + ';');
    const calls = asset.phases.map(phase => {
      const method = asset.resultProfile === 'photo-source-v1' ? phase + 'Current' : phase;
      const call = name + '[' + JSON.stringify(method) + ']';
      const guarded = phase === 'mutate' && asset.registryOperatorConfirmation;
      const target = guarded ? 'function(p){return applyOperatorApproval(' + call + ',p);}' : call;
      return JSON.stringify(phase) + ':' + target;
    });
    return JSON.stringify(asset.assetKey) + ':{"hash":' + JSON.stringify(asset.executorHash) + ',"calls":{' + calls.join(',') + '}}';
  });
  const approval = assets.some(asset => asset.registryOperatorConfirmation) ? [
    'function applyOperatorApproval(call,p){',
    'var proof=p&&p._execution&&p._execution.operatorConfirmation;',
    'if(!proof)return {"outcome":"rejected","code":"operator_confirmation_required"};',
    'if(typeof proof.digest!=="string"||!/^[a-f0-9]{64}$/.test(proof.digest)||',
    'typeof proof.expiresAt!=="number"||!isFinite(proof.expiresAt)||proof.expiresAt<=new Date().getTime())',
    'return {"outcome":"rejected","code":"operator_confirmation_expired"};',
    'return call(p,function(){if(proof.expiresAt<=new Date().getTime()){',
    'var e=new Error("operator_confirmation_expired");e.coreCode="operator_confirmation_expired";throw e;}return true;});}',
  ].join('') : '';
  return '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';' + declarations.join('') + approval + 'var assets={' + entries.join(',') + '};return {"dispatch":function(serialized){var frame=JSON.parse(serialized),own=Object.prototype.hasOwnProperty,a=frame&&own.call(assets,frame.assetKey)&&assets[frame.assetKey],call=a&&own.call(a.calls,frame.phase)&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({"readFailureVersion":1,"outcome":"rejected","code":"inspection_failed"});}}};}());\n';
}
function installationConfig(d, selected) { const assets = selected.assets.map(a => ({ assetKey: a.assetKey, executorHash: a.executorHash, phases: a.phases })); return { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: assets[0].executorHash, assetKey: assets[0].assetKey, assets, ...(selected.startOverSupported ? { startOverSupported: true } : {}) }; }
function verifyRelease(directory, release) {
  exactKeys(release, ['version', 'format', 'hashes']); if ((release.version !== '4.0.0' && !(['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5'].includes(release.version) && release.format === 2)) || !release.hashes || Object.getPrototypeOf(release.hashes) !== Object.prototype) fail('release_schema');
  const root = path.resolve(directory), expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes || {})) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('release_path');
    expectedFiles.add(relative);
    for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(directory, relative) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory || !expectedDirs.delete(relative)) fail('release_tree_mismatch');
    for (const item of fs.readdirSync(directory)) {
      const file = path.join(directory, item), rel = relative ? relative + '/' + item : item, child = fs.lstatSync(file);
      if (child.isSymbolicLink() || fs.realpathSync(file) !== file) fail('release_tree_mismatch');
      if (child.isDirectory()) visit(file, rel);
      else if (!child.isFile() || !expectedFiles.delete(rel)) fail('release_tree_mismatch');
      else if (rel === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[rel]) fail('installed_release_bytes');
    }
  }
  visit(root, ''); if (expectedFiles.size || expectedDirs.size) fail('release_tree_mismatch');
  if (release.format !== 1 && release.format !== 2) fail('release_format');
  if (release.format === 1) {
    if (Object.hasOwn(release.hashes, 'runtime/composition.json') || Object.hasOwn(release.hashes, POLICY_FILE) ||
        builtinCapabilityFiles({ 'render-jobs': 1 }).some(file => Object.hasOwn(release.hashes, file))) fail('composition_downgrade');
    return;
  }
  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
  if (fs.readFileSync(path.join(root, 'cep/jsx/registry.jsx'), 'utf8') !== registrySource(selected.assets, fs.readFileSync(path.join(root, 'runtime/host/json-codec.jsx'), 'utf8'))) fail('composition_registry');
}
function assertPlainPath(file, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('installation_path');
  const stat = fs.lstatSync(file); if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(file) !== file || (directory ? !stat.isDirectory() : !stat.isFile())) fail('installation_path');
}
function verifyCep(d, manifest, cepDir) {
  verifyRelease(d.releaseDir, manifest);
  assertPlainPath(cepDir, true); if (path.basename(cepDir) !== 'com.codex.aeagentcore4') fail('installation_cep_scope');
  const selected = deriveComposition(manifest, file => fs.readFileSync(path.join(d.releaseDir, file)));
  const expected = Object.fromEntries(Object.entries(manifest.hashes).filter(([file]) => file.startsWith('cep/')).map(([file, digest]) => [file.slice(4), digest]));
  if (Object.keys(expected).length !== 6) fail('installation_cep_closure');
  const cfg = installationConfig(d, selected);
  expected['installation.js'] = hash('window.Core4Installation=' + canonical(cfg) + ';\n');
  const files = new Set(Object.keys(expected)), dirs = new Set(['']); for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  function visit(directory, relative) { assertPlainPath(directory, true); if (!dirs.delete(relative)) fail('installation_cep_tree'); for (const name of fs.readdirSync(directory)) { const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); assertPlainPath(file, stat.isDirectory()); if (stat.isDirectory()) visit(file, rel); else if (!files.delete(rel) || hash(fs.readFileSync(file)) !== expected[rel]) fail('installation_cep_bytes'); } }
  visit(cepDir, ''); if (files.size || dirs.size) fail('installation_cep_tree');
}
function verifyInstallation(file, options = {}) {
  if (Object.keys(options).some(key => key !== 'cepDir')) fail('installation_verifier_options');
  const { cepDir } = options;
  if (!path.isAbsolute(file)) fail('absolute_descriptor_required');
  assertPlainPath(file);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(d.version) || !path.isAbsolute(d.installRoot) || file !== path.join(d.installRoot, 'installation.json') || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) || d.stateDir !== path.join(d.installRoot, 'state/production') || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !d.installationId || d.panelToken === d.controlToken || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken)) fail('installation_descriptor');
  if (d.version === 2) {
    const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', 'cepDir', 'receiverFormatVersion', 'predecessor'];
    if (Object.keys(d).length !== keys.length || keys.some(key => !Object.hasOwn(d, key)) || !path.isAbsolute(d.cepDir) || d.receiverFormatVersion !== 2) fail('installation_descriptor_v2');
    if (d.predecessor !== null && (!d.predecessor || Object.keys(d.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.predecessor.transactionId) || !/^[a-f0-9]{64}$/.test(d.predecessor.previousDescriptorHash))) fail('installation_predecessor');
  }
  assertPlainPath(path.join(d.installRoot, 'origin.json')); assertPlainPath(path.join(d.stateDir, 'origin.json'));
  const origin = JSON.parse(fs.readFileSync(path.join(d.installRoot, 'origin.json'), 'utf8'));
  const anchor = JSON.parse(fs.readFileSync(path.join(d.stateDir, 'origin.json'), 'utf8'));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('installation_origin_mismatch');
  if ((path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20)) fail('external_node_mismatch');
  const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  if (hash(manifest) !== d.packageHash) fail('installation_package_hash');
  verifyRelease(d.releaseDir, manifest);
  if (d.version === 2) { const receiver = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'runtime/receiver-contract.json'), 'utf8')); if (receiver.version !== 1 || receiver.descriptorVersion !== 2 || receiver.journalFormat !== d.receiverFormatVersion || receiver.terminalReadFailureDispositionVersion !== 1) fail('installation_receiver_contract'); verifyCep(d, manifest, d.cepDir); }
  else if (cepDir) verifyCep(d, manifest, cepDir);
  return Object.freeze(d);
}
async function start({ descriptor, port = 3457, input = process.stdin, output = process.stdout, mode = 'stdio' } = {}) {
  const installation = verifyInstallation(descriptor), root = installation.releaseDir;
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(root)) fail('installation_entry_root_mismatch');
  const installGate = path.join(installation.installRoot, 'install.lock');
  let startupGate, broker, peer, attachmentOwner, ipc, reservedServer, ownerLifecycle, workSession, startOverOwner, startOverControl, ownerMaintenance, startOverRestartArmed = false;
  try {
  if (!['stdio', 'owner'].includes(mode)) fail('runtime_mode');
  if (mode === 'stdio') startupGate = fs.openSync(installGate, 'wx');
  if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');
  const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
  if (selected.composition?.version !== 2) fail('runtime_composition_required');
  const ownerFiles = ['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/client-ipc.js', 'runtime/client-stdio.js', 'runtime/controller-lease.js', 'runtime/attachment-owner.js', 'runtime/owner-lifecycle.js', 'runtime/recovery-inspection.js', 'runtime/windows-owner-process.js', 'runtime/owner-maintenance.js', 'runtime/start-over-inspection.js', 'runtime/start-over-process.js', 'runtime/start-over-state.js', 'runtime/start-over-barrier.js', 'runtime/start-over-archive.js', 'runtime/start-over-finisher.js', 'runtime/work-session.js', 'runtime/start-over-panel-control.js', 'runtime/start-over-driver.js', 'runtime/owner-launch.js'];
  const ownerRuntime = Object.hasOwn(release.hashes, 'runtime/owner-contract.json');
  if (ownerRuntime) {
    const bytes = fs.readFileSync(path.join(root, 'runtime/owner-contract.json'));
    const expected = { version: 4, runtimeModel: 'owner', clientEntry: 'runtime/client-entry.js', clientArgument: '--client-descriptor',
      ownerEntry: 'runtime/owner-entry.js', ownerArgument: '--installation', clientDescriptorFile: 'core-client.json', requiredFiles: ownerFiles };
    if (release.format !== 2 || hash(bytes) !== release.hashes['runtime/owner-contract.json'] || canonical(JSON.parse(bytes)) !== canonical(expected) || ownerFiles.some(file => !Object.hasOwn(release.hashes, file))) fail('owner_contract_schema');
    if (mode !== 'owner') fail('owner_entry_required');
  } else {
    if (mode === 'owner') fail('owner_composition_unavailable');
    if (ownerFiles.some(file => Object.hasOwn(release.hashes, file))) fail('owner_contract_required');
  }
  if (mode === 'owner') {
    const { continueStartOverStartup } = require('./start-over-driver.js');
    await continueStartOverStartup({ installation, descriptorPath: descriptor, port });
    workSession = require('./work-session.js').createWorkSession({ installation, descriptorPath: descriptor });
    // Presence is a fail-closed barrier, including malformed/unreadable records.
    const maintenance = path.join(installation.stateDir, 'runtime-maintenance.json');
    try { fs.lstatSync(maintenance); fail('owner_desired_stopped'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    // HTTP elects the starter before acquiring/recovering a process-bound gate.
    // No execution store opens until lifecycle has verified death/CAS/history.
    reservedServer = require('node:http').createServer();
    await new Promise((resolve, reject) => {
      reservedServer.once('error', reject);
      reservedServer.listen(port, '127.0.0.1', () => { reservedServer.removeListener('error', reject); resolve(); });
    });
    const { createOwnerLifecycle } = require('./owner-lifecycle.js');
    ownerLifecycle = await createOwnerLifecycle({ installation, descriptorPath: descriptor, reservedServer });
  } else {
    for (const name of ['runtime-start-over.json', 'work-session.json']) {
      try { fs.lstatSync(path.join(installation.stateDir, name)); fail('owner_work_session_requires_owner_runtime'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }
  const aeReadiness = require('./ae-readiness').createAeReadiness();
  function startOverView() {
    const { startOverEligibility } = require('./start-over-panel-control.js');
    const ownerBootId = ownerLifecycle.state().processBootId;
    const status = (value, facts) => ({ ...value, ownerBootId, eligibility: startOverEligibility({ phase: value.phase, fault: value.fault, ...facts }), aeAuthority: false });
    const faultCode = e => typeof e.code === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(e.code) ? e.code : 'start_over_state_unavailable';
    const requested = startOverOwner?.status();
    const maintenance = ownerMaintenance?.status();
    if (requested?.requested) {
      let observed;
      try { observed = startOverOwner.inspect(); }
      catch (e) { return status({ id: requested.id, sessionId: null, phase: 'blocked', requiresAEExit: true, resetComplete: false, baselineRequired: true, fault: faultCode(e) }); }
      const fault = requested.fault || maintenance?.fault || null;
      const canContinue = !!(requested.fault && observed.id && observed.id === requested.id && maintenance?.requested === false);
      const phase = maintenance?.fault || requested.fault && !maintenance?.requested ? 'blocked' : 'stopping';
      return status({ id: observed.id || requested.id, sessionId: observed.newSessionId || null, phase, requiresAEExit: observed.requiresAEExit !== false, resetComplete: false, baselineRequired: true, fault }, { canContinue });
    }
    try {
      const value = workSession.status(), owner = attachmentOwner?.status();
      return status({ id: value.resetId, sessionId: value.sessionId, phase: value.resetPending ? 'blocked' : value.baselineRequired ? 'baseline-required' : 'ready', requiresAEExit: owner?.activity.unresolved === true, resetComplete: value.mode === 'work-session' && !value.resetPending, baselineRequired: value.baselineRequired, fault: value.resetPending ? 'start_over_in_progress' : null }, { ownerMode: ownerLifecycle.mode, owner, maintenance });
    } catch (e) {
      return status({ id: null, sessionId: null, phase: 'blocked', requiresAEExit: false, resetComplete: false, baselineRequired: true, fault: faultCode(e) });
    }
  }
  async function requestStartOver() {
    if (!startOverOwner || !ownerMaintenance) fail('start_over_owner_not_ready');
    require('./render-job-maintenance').inspectRenderJobs(installation.stateDir, { installationId: installation.installationId });
    try { await startOverOwner.request(); }
    catch (error) {
      // An inventory failure must not strand a published reset in a live
      // frozen producer. Stop this exact owner; the same finisher can capture
      // continuation inventory once after its real process death.
      const current = startOverOwner.inspect(), requested = startOverOwner.status();
      if (!current.id || current.id !== requested.id) throw error;
      if (!ownerMaintenance.status().requested) {
        const { createStopAuthorization } = require('./owner-maintenance.js');
        startOverRestartArmed = true;
        ownerMaintenance.request(createStopAuthorization({ installation, descriptorPath: descriptor, scope: ownerMaintenance.scope, id: current.id }));
      }
    }
    return startOverView();
  }
  if (mode === 'owner') startOverControl = require('./start-over-panel-control.js').createStartOverPanelControl({ installation, status: startOverView, request: requestStartOver });
  async function exposeOwner(facade, activity, invoke, options = {}) {
    const { createAttachmentOwner, ownerMethods } = require('./attachment-owner.js');
    const { createIpcServer } = require('./client-ipc.js');
    const { ownerEndpoint } = require('./client-entry.js');
    const { PRIVATE_METHODS, createOwnerMaintenance, createStopAuthorization } = require('./owner-maintenance.js');
    attachmentOwner = createAttachmentOwner({ runtime: facade, activity, invoke, ...options, workSession: workSession.status });
    const endpoint = ownerEndpoint(installation);
    let closed = false, closing, maintenance;
    async function closeRuntime() {
      if (closed) return; if (closing) return closing;
      if (attachmentOwner.status().accepted || activity().pending) fail('owner_draining');
      ownerLifecycle.beginClose();
      closing = (async () => { await attachmentOwner.close(); await ipc.close(); ownerLifecycle.finishClose(); closed = true; })(); return closing;
    }
    maintenance = createOwnerMaintenance({ installation, descriptorPath: descriptor, lifecycle: ownerLifecycle, activity,
      freeze: attachmentOwner.freeze, accepted: () => attachmentOwner.status().accepted, close: closeRuntime });
    ownerMaintenance = maintenance;
    startOverOwner = require('./start-over-state.js').createOwnerStartOver({ installation, descriptorPath: descriptor, lifecycle: ownerLifecycle, freeze: attachmentOwner.freeze,
      fencePhysical() { if (peer) peer.fenceForStartOver(); else if (ownerLifecycle.mode !== 'diagnostic') fail('start_over_physical_unavailable'); },
      stop(id) { startOverRestartArmed = true; return maintenance.request(createStopAuthorization({ installation, descriptorPath: descriptor, scope: maintenance.scope, id })); } });
    void maintenance.done.then(async value => {
      if (!startOverRestartArmed || value.phase !== 'stopped' && !closed) return;
      try { await require('./owner-launch.js').launchInstalledOwner({ installation, descriptorPath: descriptor }); } catch { /* intent remains; a fresh thin client can launch the same normal entry */ }
    });
    const currentStatus = facade.status, currentDiagnostics = facade.diagnostics;
    facade.status = () => ({ ...currentStatus(), maintenance: maintenance.status(), workSession: workSession.status(), startOver: startOverView() });
    facade.diagnostics = async () => ({ ...await currentDiagnostics(), maintenance: maintenance.status(), workSession: workSession.status(), startOver: startOverView() });
    ipc = createIpcServer({ endpoint, identity: { installationId: installation.installationId, machineId: installation.machineId, packageHash: installation.packageHash },
      secret: installation.controlToken, bootId: attachmentOwner.bootId, methods: [...ownerMethods(options.renderJobs), ...PRIVATE_METHODS],
      onAttach: attachmentOwner.onAttach, onDetach: attachmentOwner.onDetach, onRequest: request => {
        if (!PRIVATE_METHODS.includes(request.method)) return attachmentOwner.onRequest(request);
        try { return { ok: true, value: maintenance.request(request.payload) }; }
        catch (e) { return { ok: false, code: ['maintenance_authorization', 'maintenance_in_progress', 'maintenance_persist_failed', 'maintenance_schema', 'maintenance_id', 'render_job_maintenance_unsettled', 'render_job_maintenance_unverifiable', 'render_job_maintenance_toolchain_changed'].includes(e.code) ? e.code : 'maintenance_refused' }; }
      } });
    if (ownerLifecycle.mode === 'active') ownerLifecycle.markReady();
    await ipc.listen(); ownerLifecycle.releaseStartup();
    return { endpoint, bootId: attachmentOwner.bootId,
      async close() {
        if (closed) return;
        const value = maintenance.requestLocal(); if (value.fault) fail(value.fault);
        if (attachmentOwner.status().accepted || activity().pending) fail('owner_draining');
        const result = await maintenance.done; if (result.phase !== 'stopped') fail('maintenance_stop_uncertain');
      },
      status: () => ({ ...facade.status(), attachmentOwner: attachmentOwner.status(), ipc: ipc.status(), maintenance: maintenance.status() }) };
  }
  if (ownerLifecycle?.mode === 'diagnostic') {
    // A fenced boot exposes authenticated observations without constructing a
    // Broker or opening an execution store. Only authenticated panel reset
    // control is available; the physical command channel remains refused.
    require('./start-over-panel-control.js').attachStartOverHttp({ server: reservedServer, control: startOverControl, reason: 'owner_recovery_required' });
    const status = () => ({ ready: false, closed: false, pid: process.pid, product: 'AE Agent Core 4.2.5',
      installation: { installationId: installation.installationId, machineId: installation.machineId, packageHash: installation.packageHash, nodeVerified: true },
      lifecycle: ownerLifecycle.state(), ownershipFault: 'owner_recovery_required', physical: { listening: reservedServer.listening, port: reservedServer.address()?.port || null, inspectionAvailable: false, storeClosed: true, unknown: true, coverage: 'diagnostic-only; execution queue not reopened', readiness: aeReadiness.status({ peer: { connected: false }, storeClosed: true }, true) }, externalLegacyCoverage: 'unobserved' });
    const unavailable = () => ({ available: false, reason: 'owner_recovery_required' });
    const facade = { status, diagnostics: async () => { await aeReadiness.refresh(); return status(); }, listModules: unavailable, getContract: unavailable, getTask: unavailable,
      close: () => new Promise(resolve => { reservedServer.close(resolve); reservedServer.closeAllConnections(); }) };
    return await exposeOwner(facade, () => ({ pending: false, unresolved: true, fault: true }), (method, payload) => facade[method](payload));
  }
  const { Broker } = require('../core/broker.js');
  const { serve } = require('../core/stdio.js');
  const { exact, id } = require('../protocol/json.js');
  const { createHttpPeer } = require('../integrations/cep/http-peer.js');
  const invocationContext = mode === 'owner' ? new (require('node:async_hooks').AsyncLocalStorage)() : null;
  const completedReadErrors = new WeakMap();
  const inspection = selected.assets.find(a => a.policy === 'read-only-current-observation-v1');
  const { contract, admission } = inspection;
  const profile = { id: inspection.moduleId, executionPolicy: inspection.policy };
  const asset = { assetKey: inspection.assetKey, executorHash: inspection.executorHash };
  const mutationAssets = selected.assets.filter(a => a.resultProfile);
  const montage = release.hashes['runtime/montage-mandate.js'] ? require('./montage-mandate.js') : null;
  let provider, manual, privateEmbedding, projectSave, projectLifecycle, operatorConfirmation, latestProjectRead;
  const observedMontageProject = () => {
    const physical = peer.status(), session = workSession?.status();
    return latestProjectRead && physical.peer.connected && !physical.startOverFrozen && !session?.baselineRequired &&
      !session?.resetPending && peer.linkIdentity() === latestProjectRead.link &&
      performance.now() - latestProjectRead.at <= 120000 ? latestProjectRead.projectId : null;
  };
  function canResumeMontageTask({ taskId, steps, oneStep }) {
    if (!montage || !operatorConfirmation || oneStep !== true || !Array.isArray(steps) || steps.length !== 1 ||
        !broker.ledger.events.some(event => event.type === 'task' && event.taskId === taskId)) return false;
    const task = broker.ledger.task(taskId), projectId = observedMontageProject();
    if (task.reset || !projectId) return false;
    try {
      const mandate = montage.observeMontageMandate(installation, taskId, workSession.status().sessionId ?? installation.installationId);
      return !!mandate && mandate.body.taskEpoch === task.epoch && mandate.body.projectId === projectId &&
        mandate.body.actions.some(action => action.moduleId === steps[0]?.moduleId);
    } catch { return false; }
  }
  if (mutationAssets.length) {
    const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
    const { createManualPolicy } = require('./manual-policy.js');
    provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
    operatorConfirmation = mutationAssets.some(item => item.operatorConfirmation)
      ? require('./operator-confirmation.js').createOperatorConfirmation(installation,
        () => workSession?.status().sessionId, observedMontageProject, () => workSession?.status().sessionId ?? installation.installationId,
        (mandate, input) => montage.importedMontageItem(broker.ledger.commands(mandate.body.taskId), mandate, input), montage)
      : undefined;
    if (operatorConfirmation && !workSession) fail('operator_confirmation_owner_required');
    const profileFor = item => {
      const binding = { pin: hash(item.manifest), contract: item.contract, admission: item.admission, operatorConfirmation: item.operatorConfirmation };
      switch (item.resultProfile) {
        case 'manual-text-v1': return binding;
        case 'photo-source-v1': return { ...binding, ...require('./photo-source-proof.js').createPhotoSourceProof(() => workSession?.status().sessionId ?? installation.installationId) };
        case 'owned-project-assembly-v1': return { ...binding, ...require('./project-assembly-proof.js').createProjectAssemblyProof(() => workSession?.status().sessionId ?? installation.installationId) };
        case 'media-import-v1': return { ...binding, ...require('./media-layer-proof.js').createMediaImportProof(() => workSession?.status().sessionId ?? installation.installationId) };
        case 'layer-insert-v1': return { ...binding, ...require('./layer-insert-proof.js').createLayerInsertProof(() => workSession?.status().sessionId ?? installation.installationId) };
        case 'layer-overlay-v1': return { ...binding, ...require('./layer-overlay-proof.js').createLayerOverlayProof(() => workSession.status().sessionId ?? installation.installationId) };
        case 'current-project-save-v1':
          projectSave = require('./project-save-proof.js').createProjectSaveProof({ stateDir: installation.stateDir,
            currentSessionId: () => workSession?.status().sessionId ?? installation.installationId });
          return { ...binding, ...projectSave };
        case 'project-lifecycle-v1':
          projectLifecycle = require('./project-lifecycle-proof.js').createProjectLifecycleProof({ stateDir: installation.stateDir, allowRenderCopy: selected.renderJobs === true,
            currentSessionId: () => workSession?.status().sessionId ?? installation.installationId });
          return { ...binding, ...projectLifecycle };
        case 'manual-point-layout-v1': return { ...binding, proof: require('./point-layout-proof.js').createPointLayoutProof({ getBroker: () => broker, getPeer: () => peer }) };
        case 'owned-text-layer-v1': return { ...binding, validateResult: require('./text-layer-proof.js').validateTextLayerCompletion };
        case 'owned-text-variant-v1': return { ...binding, validateResult: require('./text-variant-proof.js').validateTextVariantCompletion };
        case 'owned-comp-render-v1': return { ...binding, ...require('./comp-render-proof.js').createRenderProof(item.proofConfig) };
        case 'comp-frame-export-v1': return { ...binding, ...require('./comp-frame-export-proof.js') };
        default: fail('composition_not_admitted');
      }
    };
    manual = createManualPolicy({ additional: mutationAssets.map(profileFor),
      provider, installation, getPeer: () => peer, pinAdoption: !!projectLifecycle || !!montage, operatorConfirmation });
    const admissions = Object.fromEntries(mutationAssets.map(a => [a.moduleId, a.admission]));
    const transport = { identity: hash({ packageHash: installation.packageHash, admissions }), connect: value => peer.transport.connect(value), send: (value, offer) => peer.transport.send(value, offer), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
    privateEmbedding = { authority: manual.authority, executionPolicy: manual.port, transport };
  }
  broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs,
    ...(projectLifecycle ? { projectOpenTransportTimeout: PROJECT_OPEN_TIMING.callerTimeoutMs } : {}),
    ...(ownerLifecycle ? { stateLockToken: ownerLifecycle.brokerToken } : {}), ...(privateEmbedding ? { privateEmbedding } : {}) });
  const admissionGuard = command => {
    if (broker.closed) fail('broker_closed');
    if (broker.stateLock.error) fail(broker.stateLock.error);
    if (broker.ledger.corrupt) fail('ledger_corrupt');
    if (broker.ledger.unresolved().some(c => c.commandId !== command?.commandId)) fail('controller_unresolved');
  };
  const additionalAssets = mutationAssets.map(item => ({ assetKey: item.assetKey, moduleId: item.moduleId,
    operationId: item.contract.operationId, executorHash: item.executorHash, resultProfile: item.resultProfile, effect: item.contract.effectPolicy.effect }));
  peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets,
    observeProjectSave: projectSave?.observe, observeProjectLifecycle: projectLifecycle?.observe,
    assertMediaSourceLock: manual?.assertSourceLock, requireMutationGuard: mode === 'owner',
    timeout: PRODUCTION_TIMING.callbackTimeoutMs, ...(projectLifecycle ? { projectOpenTimeout: PROJECT_OPEN_TIMING.callbackTimeoutMs } : {}),
    directReadDrainMs: DIRECT_READ_DRAIN_MS, port, admissionGuard, ...(workSession ? { workSessionId: workSession.status().sessionId, startOverControl } : {}), ...(reservedServer ? { preboundServer: reservedServer } : {}), ...(invocationContext ? { captureDeliveryGuard(command) {
    const context = invocationContext.getStore();
    if (!context) fail('owner_controller_required');
    // Retain this exact operation's grant beyond ALS lifetime, including /poll.
    return () => { context.assertCurrent(); operatorConfirmation?.assertDelivery(command); };
  } } : {}), installationContext: { descriptorPath: descriptor }, ...(ownerLifecycle ? { ownerToken: ownerLifecycle.receiverToken } : {}) });
  const contractId = hash({ packageHash: installation.packageHash, admission, contract }); let closed = false;
  const facade = Object.create(broker);
  const physical = () => {
    const value = peer.status();
    const readiness = aeReadiness.status(value, workSession?.status().baselineRequired ?? null);
    return { ...value, readiness, inspectionAvailable: !broker.closed && !broker.stateLock.error && !broker.ledger.corrupt && !broker.ledger.unresolved().length && value.peer.connected && !value.startOverFrozen && !value.storeClosed && !value.storeFault && !value.pending && !aeReadiness.blocker() };
  };
  facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.2.5', composition: selected.composition.id, installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: physical(), ...(ownerLifecycle ? { lifecycle: ownerLifecycle.state() } : {}), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual?.policyId || null, resourceProvider: provider ? provider.status() : null, ...(manual ? {} : { mutationAvailable: false }), externalLegacyCoverage: 'unobserved' });
  facade.diagnostics = async () => {
    await aeReadiness.refresh();
    return { ...broker.diagnostics(), ...facade.status() };
  };
  facade.connect = async () => {
    const result = manual ? await broker.connect() : null;
    const snapshot = physical();
    return { ...(manual ? result : { available: snapshot.inspectionAvailable, reason: snapshot.inspectionAvailable ? null : 'physical_inspection_unavailable', mutationAvailable: false }), automaticLifecycle: 'unavailable', physical: snapshot };
  };
  facade.disconnect = async () => ({ disconnected: false, reason: mode === 'owner' ? 'physical_link_owned_by_installation_owner' : 'physical_link_owned_by_stdio_lifetime', physical: physical() });
  facade.listModules = value => { const result = broker.listModules(value); return { ...result, modules: [...result.modules, { id: profile.id, version: '4.0.0', executionPolicy: profile.executionPolicy }] }; };
  facade.getContract = value => {
    if (value.moduleId === profile.id) {
      exact(value, ['moduleId']);
      return { contractId, moduleId: profile.id, operationId: contract.operationId, modulePin: hash(admission), contract: JSON.parse(canonical(contract)) };
    }
    const result = broker.getContract(value);
    return mutationAssets.some(item => item.moduleId === result.moduleId && item.operatorConfirmation)
      ? { ...result, operatorConfirmation: 'local-operator-exact-confirmation-v1' }
      : result;
  };
  facade.inspect = async value => {
    if (value.contractId !== contractId) {
      try { return await broker.inspect(value); }
      catch (error) {
        const rejection = peer.consumeReadRejection(error), context = invocationContext?.getStore();
        const selected = mutationAssets.find(item => item.moduleId === value.moduleId && item.executorHash === rejection?.executorHash);
        if (selected && context && !context.observer && rejection.physical.stage === 'terminal' &&
            rejection.payloadHash === hash(canonical(value.target))) {
          completedReadErrors.set(error, { context, moduleId: value.moduleId, contractId: value.contractId,
            targetHash: rejection.payloadHash, code: rejection.code, physical: rejection.physical });
        }
        throw error;
      }
    }
    exact(value, ['moduleId', 'contractId', 'target']);
    if (value.moduleId !== profile.id) fail('contract_identity');
    const target = value.target || {};
    const context = invocationContext?.getStore();
    // A new project baseline may follow an AE open or a newly visible modal.
    await aeReadiness.refresh({ force: Object.keys(target).length === 0 });
    context?.assertCurrent();
    const blocker = aeReadiness.blocker();
    if (blocker) {
      const error = Object.assign(new Error(blocker), { code: blocker });
      if (context && !context.observer) completedReadErrors.set(error, { context, moduleId: value.moduleId, contractId, targetHash: hash(canonical(target)), code: blocker, phase: 'pre-dispatch' });
      throw error;
    }
    const originalPeerId = peer.status().peer.peerId, originalLink = peer.linkIdentity();
    let result;
    try { result = await peer.inspect(target); }
    catch (error) {
      const rejection = peer.consumeReadRejection(error);
      if (rejection && context && !context.observer && rejection.executorHash === asset.executorHash && rejection.payloadHash === hash(canonical(target))) {
        completedReadErrors.set(error, { context, moduleId: value.moduleId, contractId, targetHash: rejection.payloadHash, code: rejection.code, physical: rejection.physical });
      }
      throw error;
    }
    if (result.observation?.readFailureVersion === 1) fail(result.observation.code || 'inspection_failed');
    aeReadiness.recordRead(originalPeerId);
    const coverage = result.observation?.coverage;
    if (workSession && originalLink === peer.linkIdentity() && !peer.status().startOverFrozen && value.target?.cursor === undefined &&
        (!coverage || coverage.inventory.status !== 'scan_incomplete' && ['not_requested', 'found'].includes(coverage.lookup.status))) {
      workSession.recordProjectBaseline(peer, result);
      latestProjectRead = { link: originalLink, projectId: result.observation.target.projectId, at: performance.now() };
    }
    return { evidenceRef: id('observation'), moduleId: profile.id, contractId, ...result, authority: false };
  };
  facade.build = value => { if (value.contractId === contractId || value.steps?.some(s => s.contractId === contractId)) fail('read_only_module_build_unsupported'); return broker.build(value); };
  if (selected.renderJobs && mode === 'owner') {
    const { createRenderJobOwner } = require('./render-job-owner.js');
    const render = createRenderJobOwner({ stateDir: installation.stateDir, installationId: installation.installationId,
      getCommand(taskId, commandId) {
        if (broker.ledger.corrupt) return undefined;
        const record = broker.ledger.commands(taskId).find(command => command.commandId === commandId);
        if (record?.target?.sessionId !== (invocationContext.getStore()?.sessionId ?? installation.installationId)) return undefined;
        return record;
      } });
    const current = () => {
      const context = invocationContext.getStore();
      if (!context || context.observer) fail('owner_controller_required');
      context.assertCurrent();
    };
    const admitting = () => {
      current();
      if (attachmentOwner.status().frozen) fail('render_job_maintenance');
    };
    facade.renderJobPrepare = value => render.prepare(value, admitting);
    facade.renderJobStart = value => render.start(value, admitting);
    facade.renderJobStatus = value => render.status(value);
    facade.renderJobReconcile = value => render.reconcile(value, current);
    facade.renderJobFinalize = value => render.finalize(value, current);
    facade.renderJobCancel = value => render.cancel(value, current);
  }
  facade.close = async () => { if (closed) return; closed = true; await peer.close(); await broker.close(); };
  try { await peer.listen(); } catch (e) { await facade.close(); throw e; }
  if (mode === 'owner') {
    const activity = () => {
      const physicalState = peer.status();
      return { pending: !!(broker.running || broker.reconciling || broker.controllerBusy || broker.controlPending || broker.worker.status().pending || physicalState.pending),
        unresolved: !!(broker.ledger.unresolved().length || physicalState.storeClosed || physicalState.unknown),
        fault: !!(broker.closed || broker.stateLock.error || broker.ledger.corrupt || physicalState.storeFault) };
    };
    return await exposeOwner(facade, activity, (method, payload, context) => {
      const receiver = Object.hasOwn(facade, method) ? facade : broker;
      return invocationContext.run(context, () => { if (!context.observer) context.assertCurrent(); return receiver[method](payload); });
    }, {
      consumeReadRejection(error, request) {
        const record = completedReadErrors.get(error); completedReadErrors.delete(error);
        if (!record || request.context !== record.context || request.method !== 'inspect_module_target' || request.payload.moduleId !== record.moduleId || request.payload.contractId !== record.contractId || hash(canonical(request.payload.target || {})) !== record.targetHash) return null;
        return { code: record.code, ...(record.phase ? { phase: record.phase } : {}), ...(record.physical ? { physical: record.physical } : {}) };
      },
      isFreshDryrunRefusal: Broker.isFreshDryrunRefusal,
      consumeMediaDuplicateBuildRefusal: Broker.consumeMediaDuplicateBuildRefusal,
      canResumeTask: canResumeMontageTask,
      renderJobs: selected.renderJobs === true
    });
  }
  serve(facade, input, output, { serverInfo: { name: 'ae-agent-core4', version: '4.2.5' } });
  return { close: facade.close, status: facade.status };
  } catch (e) {
    if (ipc) await ipc.close();
    if (peer) await peer.close();
    else if (reservedServer?.listening) await new Promise(resolve => { reservedServer.close(resolve); reservedServer.closeAllConnections(); });
    if (broker) await broker.close(); if (ownerLifecycle) { try { ownerLifecycle.abortStartup(); } catch {} } throw e;
  }
  finally { if (startupGate !== undefined) { fs.closeSync(startupGate); fs.unlinkSync(installGate); } }
}
// Direct-main start imports the historical reader synchronously. Publish these
// builtin verifiers first so its installation.js import sees initialized exports.
module.exports = { start, verifyInstallation, verifyRelease, verifyCep, deriveComposition, compositionPaths, builtinCapabilityFiles, validateCompRenderCompletion, registrySource, installationConfig, PRODUCTION_TIMING };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--installation') { process.stderr.write('Explicit --installation ABSOLUTE_DESCRIPTOR required.\n'); process.exitCode = 2; }
  else start({ descriptor: args[1] }).then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
  }).catch(e => { process.stderr.write((e.code || 'runtime_start_failed') + '\n'); process.exitCode = 1; });
}

```

## core4/test/owner-installation.test.js
SHA-256: `b2f1b5e9d8d62c59c5cf0eafb3df0495a12ada4572cc085cd6d881fd3566dd60`
```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { spawnSync } = require('node:child_process');
const { canonical, hash } = require('../protocol/json');
const { buildPackage, verifyPackage, runtimeBinding } = require('../tools/package-installable');
const { buildStandalone, writeStandalone } = require('../tools/package-standalone-installer');
const { HELPERS, verifyStandalone } = require('../tools/standalone-installer');
const { planInstall, applyInstall, rollback, snapshot, assertPreparedInstallPlan, prepareInstallPlan, assertDurablePreparedInstallPlan } = require('../tools/install-core4');
const { acquireInstallLease } = require('../runtime/install-lease');
const { verifyInstallation } = require('../runtime/installation');
const { projectClientDescriptor, verifyClientDescriptor } = require('../runtime/client-entry');
const SOURCE = path.resolve(__dirname, '..'), packages = new Map();
function pkg(composition = 'readonly', runtimeModel = 'owner') {
  const key = composition + '/' + runtimeModel;
  if (!packages.has(key)) packages.set(key, buildPackage(SOURCE, composition, { runtimeModel }));
  return packages.get(key);
}
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-owner-install-'));
  t.after(() => { assert.ok(path.resolve(directory) === directory && directory.startsWith(path.join(os.tmpdir(), 'core4-owner-install-'))); fs.rmSync(directory, { recursive: true, force: true }); });
  const args = { nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'config.toml'), machineId: os.hostname() };
  const client = path.join(args.installRoot, 'core-client.json');
  return { directory, args, client, plan(runtime = 'owner', composition = 'readonly') { return planInstall({ ...args, pkg: pkg(composition, runtime) }); },
    apply(runtime = 'owner', composition = 'readonly') { return applyInstall(this.plan(runtime, composition)); } };
}
function edit(packageValue, file, value) {
  const result = structuredClone(packageValue), bytes = typeof value === 'string' ? value : canonical(value);
  result.files[file] = Buffer.from(bytes).toString('base64'); result.release.hashes[file] = hash(bytes); result.packageHash = hash(result.release); return result;
}
function configArgs(file) { return JSON.parse(/^args = (.+)$/m.exec(fs.readFileSync(file, 'utf8'))[1]); }

test('owner-installation runtime selector is independent of composition and owner contract is a closed admitted cluster', () => {
  for (const composition of ['readonly', 'manual']) for (const model of ['stdio', 'owner']) {
    const p = pkg(composition, model), binding = runtimeBinding(p.release, file => Buffer.from(p.files[file], 'base64'));
    assert.equal(binding.runtimeModel, model); assert.equal(verifyPackage(p), p);
    assert.equal(Object.hasOwn(p.files, 'runtime/client-entry.js'), model === 'owner');
    assert.ok(p.files['runtime/composition-policy.json']);
    assert.ok(p.files['runtime/ae-readiness.js']);
    assert.equal(Object.hasOwn(p.files, 'runtime/photo-source-proof.js'), composition === 'manual');
    // All compositions can verify an existing R1 history during maintenance.
    assert.ok(p.files['runtime/render-job-history.js']);
    assert.ok(p.files['runtime/render-job-maintenance.js']);
    assert.equal(Object.hasOwn(p.files, 'runtime/render-job-owner.js'), false);
    assert.equal(Object.keys(p.files).length, (composition === 'readonly' ? 44 : 64) + (model === 'owner' ? 21 : 0));
  }
  assert.equal(buildPackage(SOURCE, 'readonly').packageHash, pkg('readonly', 'stdio').packageHash);
  const p = pkg(), contract = JSON.parse(Buffer.from(p.files['runtime/owner-contract.json'], 'base64'));
  for (const altered of [{ ...contract, runtimeModel: 'stdio' }, { ...contract, clientEntry: 'runtime/stdio-entry.js' }, { ...contract, extra: true }, { ...contract, requiredFiles: contract.requiredFiles.slice(1) }]) assert.throws(() => verifyPackage(edit(p, 'runtime/owner-contract.json', altered)), /owner_contract/);
  const partial = structuredClone(p); delete partial.files['runtime/client-ipc.js']; delete partial.release.hashes['runtime/client-ipc.js']; partial.packageHash = hash(partial.release); assert.throws(() => verifyPackage(partial), /owner_contract_schema/);
  const noContract = structuredClone(p); delete noContract.files['runtime/owner-contract.json']; delete noContract.release.hashes['runtime/owner-contract.json']; noContract.packageHash = hash(noContract.release); assert.throws(() => verifyPackage(noContract), /owner_contract_required/);
  assert.throws(() => buildPackage(SOURCE, 'readonly', { runtimeModel: 'auto' }), /runtime_selector/);
});

test('owner-installation fresh-root planning projects exact origin bytes without destination reads or writes', t => {
  const f = fixture(t), before = snapshot(f.directory), plan = f.plan();
  assert.deepEqual(snapshot(f.directory), before); assert.equal(fs.existsSync(f.args.installRoot), false);
  const client = JSON.parse(plan.nextClient); assert.equal(client.originHash, hash(plan.originBytes)); assert.equal(client.controlToken, plan.descriptor.controlToken);
  assert.equal(Object.hasOwn(client, 'panelToken'), false); assert.equal(Object.hasOwn(client, 'stateDir'), false); assert.equal(Object.hasOwn(client, 'cepDir'), false);
  assert.deepEqual(plan.clientBinding, { version: 1, runtimeModel: 'owner', clientDescriptorPath: f.client, previousClient: null, appliedClientHash: hash(plan.nextClient) });
  assert.throws(() => projectClientDescriptor(plan.descriptor, { originBytes: Buffer.from('{}') }), /client_origin/);
  assert.throws(() => projectClientDescriptor(plan.descriptor, { originBytes: Buffer.alloc(8193) }), /client_origin/);
  assert.throws(() => projectClientDescriptor(plan.descriptor, { originBytes: plan.originBytes, readRoot: true }), /client_projection_options/);
  assert.throws(() => planInstall({ ...f.args, pkg: pkg(), runtimeModel: 'stdio' }), /runtime_selector_mismatch/);
});

test('owner-installation TEMP readonly/manual apply stages exact role sidecar before publishing config last', t => {
  for (const composition of ['readonly', 'manual']) {
    const f = fixture(t), plan = f.plan('owner', composition), rename = fs.renameSync; let published = 0;
    fs.renameSync = function (from, to) {
      if (to === f.args.configPath) {
        published++; assert.deepEqual(fs.readFileSync(f.client), plan.nextClient);
        assert.equal(hash(fs.readFileSync(plan.descriptorPath)), hash(canonical(plan.descriptor)));
      }
      return rename.call(this, from, to);
    };
    let applied; try { applied = applyInstall(plan); } finally { fs.renameSync = rename; }
    assert.equal(published, 1); assert.equal(applied.liveProof, false);
    const d = verifyInstallation(applied.descriptorPath), client = verifyClientDescriptor(f.client);
    assert.equal(client.packageHash, d.packageHash); assert.equal(client.controlToken, d.controlToken);
    assert.ok(!fs.readFileSync(f.client, 'utf8').includes(d.panelToken));
    assert.deepEqual(configArgs(f.args.configPath), [path.join(d.releaseDir, 'runtime/client-entry.js'), '--client-descriptor', f.client]);
    const txn = JSON.parse(fs.readFileSync(applied.transactionFile)); assert.equal(txn.version, 2); assert.deepEqual(txn.clientBinding, plan.clientBinding);
    assert.deepEqual(fs.readFileSync(path.join(d.installRoot, 'transactions', txn.transactionId + '-prepared/client.json')), plan.nextClient);
    assert.equal(fs.existsSync(path.join(d.stateDir, 'receiver')), false);
  }
});

test('owner-installation legacy to owner to legacy and both rollbacks preserve exact sidecar bytes and stable origin', t => {
  const f = fixture(t), legacy = f.apply('stdio'), origin = fs.readFileSync(path.join(f.args.installRoot, 'origin.json'));
  const owner = f.apply(), ownerClient = fs.readFileSync(f.client), ownerDescriptor = fs.readFileSync(owner.descriptorPath), ownerConfig = fs.readFileSync(f.args.configPath);
  const back = f.apply('stdio'); assert.equal(fs.existsSync(f.client), false); assert.equal(configArgs(f.args.configPath)[1], '--installation');
  const binding = JSON.parse(fs.readFileSync(back.transactionFile)).clientBinding; assert.equal(binding.runtimeModel, 'stdio'); assert.equal(binding.appliedClientHash, null); assert.equal(binding.previousClient, ownerClient.toString('base64'));
  rollback(back.transactionFile); assert.deepEqual(fs.readFileSync(f.client), ownerClient); assert.deepEqual(fs.readFileSync(owner.descriptorPath), ownerDescriptor); assert.deepEqual(fs.readFileSync(f.args.configPath), ownerConfig);
  rollback(owner.transactionFile); assert.equal(fs.existsSync(f.client), false); assert.equal(configArgs(f.args.configPath)[1], '--installation');
  assert.deepEqual(fs.readFileSync(path.join(f.args.installRoot, 'origin.json')), origin); assert.deepEqual(fs.readFileSync(path.join(f.args.installRoot, 'state/production/origin.json')), origin);
  assert.equal(JSON.parse(fs.readFileSync(legacy.transactionFile)).clientBinding.previousClient, null);
});

test('owner-installation first owner rollback removes only its exact sidecar and retains stable state origin', t => {
  const f = fixture(t), applied = f.apply(), origin = fs.readFileSync(path.join(f.args.installRoot, 'origin.json'));
  rollback(applied.transactionFile); assert.equal(fs.existsSync(f.client), false); assert.equal(fs.existsSync(applied.descriptorPath), false); assert.equal(fs.existsSync(f.args.configPath), false);
  assert.deepEqual(fs.readFileSync(path.join(f.args.installRoot, 'origin.json')), origin);
  assert.throws(() => f.plan(), /installation_descriptor_required/);
});

test('owner-installation virgin admission refuses retained transactions/releases/config instead of issuing another identity', t => {
  const f = fixture(t), installed = f.apply(), original = JSON.parse(fs.readFileSync(installed.descriptorPath));
  for (const [file, name] of [[installed.descriptorPath, 'descriptor'], [f.client, 'client'], [path.join(f.args.installRoot, 'origin.json'), 'origin'], [installed.stateDir, 'state'], [original.cepDir, 'cep']]) fs.renameSync(file, path.join(f.directory, 'saved-' + name));
  const before = snapshot(f.directory);
  assert.throws(() => f.plan(), /initial_installation_not_pristine/);
  assert.deepEqual(snapshot(f.directory), before); assert.ok(fs.existsSync(installed.transactionFile));
});

test('owner-installation existing origins require a descriptor; initial rollback retains history but cannot be reapplied as virgin', t => {
  for (const mode of ['missing-descriptor', 'rollback-ledger']) {
    const f = fixture(t), installed = f.apply(), ledger = path.join(installed.stateDir, 'broker/ledger.ndjson');
    if (mode === 'missing-descriptor') { fs.renameSync(installed.descriptorPath, path.join(f.directory, 'saved-descriptor')); fs.renameSync(f.client, path.join(f.directory, 'saved-client')); }
    else {
      const { Ledger } = require('../core/ledger'), log = new Ledger(ledger);
      log.append({ type: 'intent', commandId: 'fixture-command', taskId: 'fixture-task', target: { projectId: 'fixture-only' } }); log.append({ type: 'command', commandId: 'fixture-command', state: 'succeeded' });
      assert.equal(rollback(installed.transactionFile).rolledBack, true);
    }
    const before = snapshot(f.directory); assert.throws(() => f.plan(), /installation_descriptor_required/); assert.deepEqual(snapshot(f.directory), before);
  }
});

test('owner-installation virgin apply refuses a settled ledger added after planning without publishing an identity', t => {
  const f = fixture(t), plan = f.plan(), file = path.join(plan.descriptor.stateDir, 'broker/ledger.ndjson');
  const { Ledger } = require('../core/ledger'), log = new Ledger(file);
  log.append({ type: 'intent', commandId: 'fixture-command', taskId: 'fixture-task', target: { projectId: 'fixture-only' } }); log.append({ type: 'command', commandId: 'fixture-command', state: 'succeeded' });
  const before = snapshot(f.directory); assert.throws(() => applyInstall(plan), /initial_installation_not_pristine/); assert.deepEqual(snapshot(f.directory), before);
  assert.equal(fs.existsSync(path.join(f.args.installRoot, 'origin.json')), false);
});

test('owner-installation virgin admission recognizes quoted Core headers while preserving unrelated legacy config', t => {
  for (const header of ['[mcp_servers.after-effects-core4]', '["mcp_servers"."after-effects-core4"]', "['mcp_servers'.'after-effects-core4']"]) {
    const f = fixture(t); fs.writeFileSync(f.args.configPath, header + '\ncommand="foreign"\nargs=[]\n');
    const before = snapshot(f.directory); assert.throws(() => f.plan(), /initial_installation_not_pristine/); assert.deepEqual(snapshot(f.directory), before);
  }
  const f = fixture(t), legacy = '["mcp_servers"."legacy-bridge"]\ncommand="unchanged"\n'; fs.writeFileSync(f.args.configPath, legacy);
  f.apply(); assert.ok(fs.readFileSync(f.args.configPath, 'utf8').startsWith(legacy));
});

test('owner-installation pristine CAS rejects foreign additions under the lease and before switch, preserving the foreign file', t => {
  for (const phase of ['lease', 'last-cas']) {
    const f = fixture(t), plan = f.plan(), file = path.join(plan.descriptor.stateDir, 'broker/foreign.ndjson');
    const open = fs.openSync, sync = fs.fsyncSync, close = fs.closeSync, handles = new Map(); let injected = false;
    fs.openSync = function (file, ...args) { const fd = open.call(this, file, ...args); handles.set(fd, file); return fd; };
    fs.closeSync = function (fd) { handles.delete(fd); return close.call(this, fd); };
    fs.fsyncSync = function (fd) {
      const result = sync.call(this, fd), name = handles.get(fd);
      if (!injected && name === (phase === 'lease' ? path.join(plan.descriptor.stateDir, 'broker/broker-owner.gate') : path.join(f.args.installRoot, 'transactions', plan.transactionId + '.json'))) {
        injected = true; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'foreign evidence');
      }
      return result;
    };
    try {
      assert.throws(() => applyInstall(plan), e => e.code === 'initial_installation_not_pristine' && (phase !== 'last-cas' || e.leaseRetained === true));
      assert.equal(injected, true); assert.equal(fs.readFileSync(file, 'utf8'), 'foreign evidence');
      for (const target of [plan.descriptorPath, path.join(f.args.installRoot, 'origin.json'), path.join(plan.descriptor.stateDir, 'origin.json'), plan.cepDir]) assert.equal(fs.existsSync(target), false);
      if (phase === 'lease') for (const gate of ['install.lock', 'state/production/broker/broker-owner.gate']) assert.equal(fs.existsSync(path.join(f.args.installRoot, gate)), false);
    } finally { fs.openSync = open; fs.fsyncSync = sync; fs.closeSync = close; for (const fd of handles.keys()) try { close(fd); } catch {} }
  }
});

test('owner-installation coherent repeat accepts a new checkout config but refuses foreign CEP or an existing mismatched managed binding', t => {
  for (const mode of ['new-checkout', 'formatted', 'foreign-cep', 'foreign-config']) {
    const f = fixture(t), installed = f.apply(), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
    if (mode === 'new-checkout') fs.unlinkSync(f.args.configPath);
    if (mode === 'formatted') fs.writeFileSync(f.args.configPath, fs.readFileSync(f.args.configPath, 'utf8').replace('[mcp_servers.after-effects-core4]', '["mcp_servers"."after-effects-core4"] # same binding').replace('command = ', '"command"  =  ').replace('args = ', "'args' = ") + '# retained outside comment\n');
    if (mode === 'foreign-cep') fs.appendFileSync(path.join(d.cepDir, 'index.html'), 'foreign');
    if (mode === 'foreign-config') fs.writeFileSync(f.args.configPath, fs.readFileSync(f.args.configPath, 'utf8').replace(d.releaseDir.split('\\').join('\\\\'), 'C:/foreign-release'));
    const before = snapshot(f.directory);
    if (mode.startsWith('foreign')) { assert.throws(() => f.plan(), mode === 'foreign-cep' ? /installation_cep_bytes/ : /installation_config_binding/); assert.deepEqual(snapshot(f.directory), before); }
    else assert.equal(f.apply().installationId, installed.installationId);
  }
});

test('owner-installation historical v1 data still requires exact CEP bytes before a candidate upgrade', t => {
  const f = fixture(t), plan = f.plan('stdio');
  require('./fixtures/legacy-installation-v1').legacyV1Data(plan);
  fs.appendFileSync(path.join(plan.cepDir, 'index.html'), 'foreign CEP');
  const before = snapshot(f.directory); assert.throws(() => f.plan(), /installation_cep_bytes/); assert.deepEqual(snapshot(f.directory), before);
});

test('owner-installation branded plans bind client bytes, origin bytes and binding metadata; durable prepared client tampering refuses', t => {
  for (const mutate of [p => { p.nextClient[0] ^= 1; }, p => { p.originBytes[0] ^= 1; }, p => { p.clientBinding.appliedClientHash = '0'.repeat(64); }]) {
    const f = fixture(t), plan = f.plan(); mutate(plan); assert.throws(() => applyInstall(plan), /prepared_install_plan_brand_or_changed/); assert.equal(fs.existsSync(f.args.installRoot), false);
  }
  const f = fixture(t), plan = f.plan(), lease = acquireInstallLease({ installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath });
  fs.mkdirSync(path.join(f.args.installRoot, 'transactions')); prepareInstallPlan(plan, { lease }); assertPreparedInstallPlan(plan);
  const prepared = path.join(f.args.installRoot, 'transactions', plan.transactionId + '-prepared/client.json'); fs.appendFileSync(prepared, 'tampered');
  assert.throws(() => assertDurablePreparedInstallPlan(plan, { lease }), /prepared_install_state_changed/);
});

test('owner-installation client and origin CAS detect drift before writes, including drift while acquiring the install lease', t => {
  for (const drift of ['client', 'root', 'anchor', 'under-lease']) {
    const f = fixture(t); f.apply(); const plan = f.plan();
    const file = drift === 'root' ? path.join(f.args.installRoot, 'origin.json') : drift === 'anchor' ? path.join(f.args.installRoot, 'state/production/origin.json') : f.client;
    if (drift !== 'under-lease') fs.appendFileSync(file, ' ');
    const open = fs.openSync; let injected = false;
    if (drift === 'under-lease') fs.openSync = function (name, ...rest) {
      const fd = open.call(this, name, ...rest);
      if (!injected && name === path.join(f.args.installRoot, 'install.lock')) { injected = true; fs.appendFileSync(f.client, ' '); }
      return fd;
    };
    const descriptor = fs.readFileSync(plan.descriptorPath), config = fs.readFileSync(f.args.configPath);
    try { assert.throws(() => applyInstall(plan), /install_baseline_changed/); } finally { fs.openSync = open; }
    assert.deepEqual(fs.readFileSync(plan.descriptorPath), descriptor); assert.deepEqual(fs.readFileSync(f.args.configPath), config); assert.equal(fs.existsSync(path.join(f.args.installRoot, 'install.lock')), false);
  }
});

test('owner-installation noncanonical existing origin bytes are retained and pinned exactly', t => {
  const f = fixture(t); f.apply('stdio');
  const originFile = path.join(f.args.installRoot, 'origin.json'), raw = Buffer.from(fs.readFileSync(originFile, 'utf8') + '\n');
  fs.writeFileSync(originFile, raw); fs.writeFileSync(path.join(f.args.installRoot, 'state/production/origin.json'), raw);
  const applied = f.apply(); assert.equal(verifyClientDescriptor(f.client).originHash, hash(raw)); assert.deepEqual(fs.readFileSync(originFile), raw); rollback(applied.transactionFile);
});

test('owner-installation foreign or missing sidecar never permits replacement or owner to stdio deletion', t => {
  const f = fixture(t); f.apply('stdio'); fs.writeFileSync(f.client, '{"foreign":true}'); const before = snapshot(f.args.installRoot);
  assert.throws(() => f.plan(), /foreign_client_descriptor/); assert.deepEqual(snapshot(f.args.installRoot), before);
  const g = fixture(t); g.apply(); fs.appendFileSync(g.client, ' '); const protectedBytes = fs.readFileSync(g.client);
  assert.throws(() => g.plan('stdio'), /foreign_client_descriptor/); assert.deepEqual(fs.readFileSync(g.client), protectedBytes);
  fs.unlinkSync(g.client); assert.throws(() => g.plan('stdio'), /foreign_client_descriptor/);
});

test('owner-installation staging files and ancestor junctions refuse before reading or changing destinations', t => {
  for (const suffix of ['.next', '.rollback']) {
    const f = fixture(t); fs.mkdirSync(f.args.installRoot); fs.writeFileSync(f.client + suffix, 'retained-stage'); const before = snapshot(f.directory);
    assert.throws(() => f.plan(), /client_binding_staging_exists/); assert.deepEqual(snapshot(f.directory), before);
  }
  const f = fixture(t), target = path.join(f.directory, 'target'), alias = path.join(f.directory, 'alias'); fs.mkdirSync(target); fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  try { assert.throws(() => planInstall({ ...f.args, pkg: pkg(), installRoot: path.join(alias, 'AEAgentCore4') }), /install_volume_path/); assert.deepEqual(snapshot(target), {}); }
  finally { fs.unlinkSync(alias); }
});

test('owner-installation rollback refuses sidecar/origin/prepared drift and missing owner transaction extension before writes', t => {
  for (const drift of ['client', 'origin', 'prepared', 'extension']) {
    const f = fixture(t), applied = f.apply();
    if (drift === 'client') fs.appendFileSync(f.client, ' ');
    if (drift === 'origin') fs.appendFileSync(path.join(f.args.installRoot, 'origin.json'), ' ');
    if (drift === 'prepared') fs.appendFileSync(path.join(f.args.installRoot, 'transactions', JSON.parse(fs.readFileSync(applied.transactionFile)).transactionId + '-prepared/client.json'), 'tamper');
    if (drift === 'extension') { const txn = JSON.parse(fs.readFileSync(applied.transactionFile)); delete txn.clientBinding; delete txn.originBinding; fs.writeFileSync(applied.transactionFile, canonical(txn)); }
    const before = snapshot(f.args.installRoot); assert.throws(() => rollback(applied.transactionFile), /rollback_client_/); assert.deepEqual(snapshot(f.args.installRoot), before);
  }
  const legacy = fixture(t), installed = legacy.apply('stdio'), txn = JSON.parse(fs.readFileSync(installed.transactionFile)); delete txn.clientBinding; delete txn.originBinding; fs.writeFileSync(installed.transactionFile, canonical(txn));
  assert.equal(rollback(installed.transactionFile).rolledBack, true);
});

test('owner-installation owner package cannot execute through the legacy stdio entry before listener or store open', async t => {
  const f = fixture(t), applied = f.apply(), d = verifyInstallation(applied.descriptorPath), before = snapshot(d.stateDir);
  const entry = require(path.join(d.releaseDir, 'runtime/stdio-entry.js')), create = http.createServer; let servers = 0;
  http.createServer = (...args) => { servers++; return create(...args); };
  try { await assert.rejects(entry.start({ descriptor: applied.descriptorPath, mode: 'stdio', port: 0 }), e => e.code === 'owner_entry_required'); } finally { http.createServer = create; }
  assert.equal(servers, 0); assert.deepEqual(snapshot(d.stateDir), before);
  const preload = path.join(f.directory, 'deny-listener.cjs'); fs.writeFileSync(preload, "require('node:net').Server.prototype.listen=function(){throw Error('unexpected_listener')};");
  const result = spawnSync(process.execPath, ['--require', preload, path.join(d.releaseDir, 'runtime/stdio-entry.js'), '--installation', applied.descriptorPath], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 1); assert.equal(result.stderr, 'owner_entry_required\n'); assert.deepEqual(snapshot(d.stateDir), before);
});

test('owner-installation standalone stdio and owner closure apply without checkout code, launcher or listeners', t => {
  const f = fixture(t), preload = path.join(f.directory, 'offline-only.cjs');
  fs.writeFileSync(preload, "require('node:net').Server.prototype.listen=function(){throw Error('network_forbidden')};for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])require('node:child_process')[key]=function(){throw Error('child_forbidden')};");
  const distributions = {};
  for (const model of ['stdio', 'owner']) {
    const bundle = buildStandalone(SOURCE, 'readonly', { runtimeModel: model }), directory = path.join(f.directory, model); writeStandalone(directory, bundle); verifyStandalone(directory, bundle.distributionHash);
    assert.deepEqual(Object.keys(bundle.files).filter(file => HELPERS.includes(file)).sort(), [...HELPERS]);
    assert.equal(Object.hasOwn(bundle.files, 'runtime/client-entry.js'), model === 'owner'); distributions[model] = { bundle, directory };
  }
  for (const model of ['stdio', 'owner', 'stdio']) {
    const { bundle, directory } = distributions[model];
    const run = spawnSync(process.execPath, ['--require', preload, path.join(directory, 'tools/standalone-installer.js'), 'apply', '--expected-distribution-hash', bundle.distributionHash, '--expected-package-hash', bundle.packageHash,
      '--install-root', f.args.installRoot, '--extensions-dir', f.args.extensionsDir, '--config', f.args.configPath], { encoding: 'utf8', windowsHide: true, timeout: 15000, cwd: f.directory });
    assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).liveProof, false); assert.equal(fs.existsSync(f.client), model === 'owner');
  }
});

test('owner-installation fixed CLI runtime selector reaches package and standalone builders and rejects unknown models', t => {
  const f = fixture(t), output = path.join(f.directory, 'candidate.json'), distribution = path.join(f.directory, 'distribution');
  const built = spawnSync(process.execPath, [path.join(SOURCE, 'tools/package-installable.js'), '--output', output, '--composition', 'readonly', '--runtime', 'owner'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(built.status, 0, built.stderr); assert.equal(JSON.parse(built.stdout).runtimeModel, 'owner'); verifyPackage(JSON.parse(fs.readFileSync(output)));
  const standalone = spawnSync(process.execPath, [path.join(SOURCE, 'tools/package-standalone-installer.js'), '--output', distribution, '--composition', 'readonly', '--runtime', 'owner'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(standalone.status, 0, standalone.stderr); assert.equal(Object.hasOwn(verifyStandalone(distribution, JSON.parse(standalone.stdout).distributionHash).pkg.files, 'runtime/owner-contract.json'), true);
  const refused = path.join(f.directory, 'refused.json'), invalid = spawnSync(process.execPath, [path.join(SOURCE, 'tools/package-installable.js'), '--output', refused, '--runtime', 'auto'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(invalid.status, 1); assert.equal(fs.existsSync(refused), false);
});

test('owner-installation corrupt staged sidecar refuses before client or config becomes visible', t => {
  const f = fixture(t); f.apply('stdio'); const plan = f.plan(), config = fs.readFileSync(f.args.configPath), rename = fs.renameSync;
  fs.renameSync = function (from, to) {
    const result = rename.call(this, from, to);
    if (to === plan.descriptorPath) fs.appendFileSync(f.client + '.next', 'tamper');
    return result;
  };
  try { assert.throws(() => applyInstall(plan), error => error.code === 'install_staging_changed' && error.leaseRetained === true); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readFileSync(f.args.configPath), config);
  assert.equal(fs.existsSync(f.client), false);
});

function refusesGrowth(file, invoke, code) {
  const open = fs.openSync, read = fs.readSync, readFile = fs.readFileSync, close = fs.closeSync;
  const sampledSize = fs.statSync(file).size, descriptors = new Set(); let grown = false, injecting = false, writes = 0, requested = 0;
  fs.openSync = function (name, flags, ...rest) {
    if (!injecting && typeof flags === 'string' && /[wax+]/.test(flags)) writes++;
    const fd = open.call(this, name, flags, ...rest); if (name === file && flags === 'r') descriptors.add(fd); return fd;
  };
  fs.readSync = function (fd, buffer, offset, length, position) {
    if (descriptors.has(fd)) {
      requested += length; assert.ok(length <= sampledSize, 'each read fits the sampled allocation');
      if (!grown) { grown = true; injecting = true; try { fs.appendFileSync(file, Buffer.alloc(20000, 32)); } finally { injecting = false; } }
    }
    return read.call(this, fd, buffer, offset, length, position);
  };
  fs.readFileSync = function (name, ...args) { if (name === file) assert.fail('unbounded named-file read is forbidden'); return readFile.call(this, name, ...args); };
  fs.closeSync = function (fd) { descriptors.delete(fd); return close.call(this, fd); };
  try { assert.throws(invoke, error => error.code === code); }
  finally { fs.openSync = open; fs.readSync = read; fs.readFileSync = readFile; fs.closeSync = close; }
  assert.equal(grown, true); assert.ok(requested <= sampledSize + 1); assert.equal(descriptors.size, 0); assert.equal(writes, 0);
}

test('owner-installation bounded readers reject growth after fd sampling before installer writes and close their fd', t => {
  for (const mode of ['installer-client', 'client-descriptor', 'client-origin']) {
    const f = fixture(t), applied = f.apply(), plan = f.plan(), descriptor = verifyInstallation(applied.descriptorPath);
    if (mode === 'installer-client') refusesGrowth(f.client, () => applyInstall(plan), 'client_binding_changed');
    if (mode === 'client-descriptor') refusesGrowth(f.client, () => verifyClientDescriptor(f.client), 'client_file_changed');
    if (mode === 'client-origin') refusesGrowth(path.join(f.args.installRoot, 'origin.json'), () => projectClientDescriptor(descriptor), 'client_file_changed');
    assert.equal(fs.existsSync(path.join(f.args.installRoot, 'install.lock')), false);
    assert.deepEqual(fs.readFileSync(applied.descriptorPath), Buffer.from(canonical(plan.previousDescriptor ? JSON.parse(plan.previousDescriptor) : descriptor)));
  }
});

test('owner-installation byte-exact ownership rejects invalid UTF8 that decodes to the same client descriptor', t => {
  const f = fixture(t); f.args.installRoot = path.join(f.directory, 'replacement-\uFFFD', 'AEAgentCore4'); f.apply();
  const client = path.join(f.args.installRoot, 'core-client.json'), original = fs.readFileSync(client), at = original.indexOf(Buffer.from('\uFFFD'));
  assert.ok(at >= 0); const altered = Buffer.concat([original.subarray(0, at), Buffer.from([255]), original.subarray(at + 3)]);
  assert.equal(altered.toString('utf8'), original.toString('utf8')); fs.writeFileSync(client, altered);
  assert.throws(() => f.plan('stdio'), error => error.code === 'foreign_client_descriptor'); assert.deepEqual(fs.readFileSync(client), altered);
});

test('owner-installation all rollback restore inputs and stamped transaction paths are bound before any destination writes', t => {
  const f = fixture(t); f.apply('stdio'); const applied = f.apply();
  const originalTxn = fs.readFileSync(applied.transactionFile), transaction = JSON.parse(originalTxn), css = path.join(transaction.backupCep, 'panel.css'), originalCss = fs.readFileSync(css);
  const preparedFile = path.join(f.args.installRoot, 'transactions', transaction.transactionId + '-prepared/prepared.json'), originalPrepared = fs.readFileSync(preparedFile);
  for (const mode of ['previousConfig', 'previousDescriptor', 'previousCepHash', 'configPath', 'preparedTransaction', 'preparedPath']) {
    fs.writeFileSync(css, originalCss); fs.writeFileSync(preparedFile, originalPrepared); const txn = JSON.parse(originalTxn);
    if (mode === 'previousConfig') txn.previousConfig = Buffer.from('[mcp_servers.foreign]\ncommand = "foreign"\n').toString('base64');
    if (mode === 'previousDescriptor') { const previous = JSON.parse(Buffer.from(txn.previousDescriptor, 'base64')); previous.panelToken = 'f'.repeat(64); txn.previousDescriptor = Buffer.from(canonical(previous)).toString('base64'); }
    if (mode === 'previousCepHash') { fs.appendFileSync(css, '\n/* forged previous CEP */\n'); txn.previousCepHash = hash(snapshot(txn.backupCep)); }
    if (mode === 'configPath') { txn.configPath = path.join(f.directory, 'alias-config.toml'); fs.copyFileSync(f.args.configPath, txn.configPath); }
    if (mode === 'preparedTransaction' || mode === 'preparedPath') {
      const prepared = JSON.parse(originalPrepared);
      if (mode === 'preparedTransaction') prepared.transactionId = '00000000-0000-4000-8000-000000000001';
      else prepared.configPath = path.join(f.directory, 'wrong-prepared-config.toml');
      const changed = Buffer.from(canonical(prepared)); fs.writeFileSync(preparedFile, changed); txn.preparedStateHash = hash(changed);
    }
    fs.writeFileSync(applied.transactionFile, canonical(txn)); const before = snapshot(f.directory), originals = {}, mutations = [];
    for (const name of ['mkdirSync', 'renameSync', 'unlinkSync']) { originals[name] = fs[name]; fs[name] = function (...args) { mutations.push(name); return originals[name].apply(this, args); }; }
    originals.openSync = fs.openSync; fs.openSync = function (name, flags, ...args) { if (typeof flags === 'string' && /[wax+]/.test(flags)) mutations.push('open-write'); return originals.openSync.call(this, name, flags, ...args); };
    try { assert.throws(() => rollback(applied.transactionFile), error => error.code === 'rollback_client_prepared_changed', mode); }
    finally { for (const [name, original] of Object.entries(originals)) fs[name] = original; }
    assert.deepEqual(mutations, [], mode); assert.deepEqual(snapshot(f.directory), before, mode);
  }
});

```

## core4/tools/package-installable.js
SHA-256: `3b40fd268013d76586690ed019a83699bdb68d7400764037fb2e34a3b3d8ef8c`
```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { deriveComposition, compositionPaths, builtinCapabilityFiles, registrySource } = require('../runtime/stdio-entry.js');
const OWNER_V3_FILES = Object.freeze(['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/client-ipc.js', 'runtime/client-stdio.js', 'runtime/controller-lease.js', 'runtime/attachment-owner.js', 'runtime/owner-lifecycle.js', 'runtime/recovery-inspection.js', 'runtime/windows-owner-process.js', 'runtime/owner-maintenance.js']);
const OWNER_FILES = Object.freeze([...OWNER_V3_FILES, 'runtime/start-over-inspection.js', 'runtime/start-over-process.js', 'runtime/start-over-state.js', 'runtime/start-over-barrier.js', 'runtime/start-over-archive.js', 'runtime/start-over-finisher.js', 'runtime/work-session.js', 'runtime/start-over-panel-control.js', 'runtime/start-over-driver.js', 'runtime/owner-launch.js']);
function runtimeBinding(release, read) {
  if (!Object.hasOwn(release.hashes, 'runtime/owner-contract.json')) {
    if (OWNER_FILES.some(file => Object.hasOwn(release.hashes, file))) fail('owner_contract_required');
    return Object.freeze({ runtimeModel: 'stdio', clientEntry: 'runtime/stdio-entry.js', clientArgument: '--installation', clientDescriptorFile: null });
  }
  const bytes = read('runtime/owner-contract.json');
  if (release.format !== 2 || hash(bytes) !== release.hashes['runtime/owner-contract.json']) fail('owner_contract_integrity');
  let contract; try { contract = JSON.parse(bytes); } catch { fail('owner_contract_schema'); }
  const files = contract.version === 3 ? OWNER_V3_FILES : OWNER_FILES;
  const expected = { version: contract.version === 3 ? 3 : 4, runtimeModel: 'owner', clientEntry: 'runtime/client-entry.js', clientArgument: '--client-descriptor',
    ownerEntry: 'runtime/owner-entry.js', ownerArgument: '--installation', clientDescriptorFile: 'core-client.json', requiredFiles: [...files] };
  if (canonical(contract) !== canonical(expected) || files.some(file => !Object.hasOwn(release.hashes, file)) || contract.version === 3 && OWNER_FILES.some(file => !OWNER_V3_FILES.includes(file) && Object.hasOwn(release.hashes, file))) fail('owner_contract_schema');
  return Object.freeze(contract);
}
function buildPackage(root = path.resolve(__dirname, '..'), selector = 'manual', options = {}) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => key !== 'runtimeModel')) fail('runtime_selector');
  const runtimeModel = options.runtimeModel ?? 'stdio'; if (!['stdio', 'owner'].includes(runtimeModel)) fail('runtime_selector');
  const read = file => fs.readFileSync(path.join(root, file));
  const spec = JSON.parse(read('runtime/source-package.json'));
  if (spec.version !== 3) fail('composition_selector');
  function compositionPart(key) {
    if (typeof key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(key)) fail('composition_selector');
    if (Object.hasOwn(spec.compositions, key)) return spec.compositions[key];
    const file = path.resolve(root, 'config/compositions', key + '.json');
    if (!fs.existsSync(file)) fail('composition_selector');
    if (fs.realpathSync(file) !== file) fail('package_symlink');
    const part = JSON.parse(fs.readFileSync(file));
    if (!part.bundle || Object.hasOwn(part, 'packagePart')) fail('composition_selector');
    return part;
  }
  const lineage = new Set();
  const parts = [];
  for (let key = selector; key !== null;) {
    if (lineage.has(key)) fail('composition_selector');
    const part = compositionPart(key);
    lineage.add(key); parts.unshift(part); key = part.parent;
  }
  const optional = parts.flatMap(part => part.packagePart === null ? [] : [part.bundle ?? spec.optional[part.packagePart]]);
  const capabilities = Object.assign({}, ...parts.map(part => {
    const declared = Object.hasOwn(part, 'capabilities') ? part.capabilities : {};
    builtinCapabilityFiles(declared);
    return declared;
  }));
  const filesInPolicy = [...spec.files, ...builtinCapabilityFiles(capabilities), ...optional.flatMap(part => part.files), ...(runtimeModel === 'owner' ? spec.optional.owner.files : [])];
  const closures = [...spec.artifactClosures, ...optional.flatMap(part => part.artifactClosures)];
  const artifacts = new Map();
  const paths = compositionPaths(filesInPolicy, closures, relative => {
    const artifact = JSON.parse(read(relative));
    artifacts.set(relative, artifact);
    return artifact;
  });
  for (const [relative, artifact] of artifacts) {
    for (const [file, pin] of Object.entries(artifact.hashes)) {
      const location = /^(modules|plan-engine)\//.test(relative) ? path.posix.join(path.posix.dirname(relative), file) : file;
      if (hash(read(location)) !== pin) fail('package_artifact_mismatch');
    }
  }
  const hashes = {}, files = {};
  for (const relative of [...paths].sort()) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) fail('package_closure_forbidden');
    const full = path.resolve(root, relative); if (fs.realpathSync(full) !== full) fail('package_symlink');
    const bytes = fs.readFileSync(full); hashes[relative] = hash(bytes); files[relative] = bytes.toString('base64');
  }
  const release = { version: '4.2.5', format: 2, hashes };
  const original = JSON.parse(fs.readFileSync(path.join(root, 'config/catalog.json'), 'utf8'));
  const modules = parts.flatMap(part => part.modules), assets = parts.flatMap(part => part.assets);
  const profiles = Object.assign({}, ...parts.map(part => part.profiles));
  for (const moduleId of modules.filter(id => !original.modules.some(entry => entry.id === id))) {
    const modulePath = 'modules/' + moduleId;
    const manifest = JSON.parse(Buffer.from(files[modulePath + '/artifact.json'], 'base64'));
    original.modules.push({ id: moduleId, version: manifest.version, path: modulePath, admission: 'config/admissions/' + moduleId + '.json' });
    original.catalogRevision = selector + '-' + hash(manifest);
  }
  if (modules.some(id => original.modules.filter(m => m.id === id).length !== 1)) fail('composition_catalog');
  const catalog = { catalogRevision: original.catalogRevision, modules: modules.map(id => original.modules.find(m => m.id === id)), engine: selector === 'readonly' ? null : original.engine };
  const composition = { version: 2, id: selector, modules, engine: catalog.engine, assets };
  const add = (file, source) => { const bytes = typeof source === 'string' ? source : canonical(source); files[file] = Buffer.from(bytes).toString('base64'); hashes[file] = hash(bytes); };
  add('config/catalog.json', catalog); add('runtime/composition.json', composition);
  add('runtime/composition-policy.json', { version: 2, id: selector, modules, assets, profiles, capabilities, files: filesInPolicy, closures });
  // Reserve the generated registry slot before checking the declared closure.
  add('cep/jsx/registry.jsx', '');
  const selected = deriveComposition(release, file => Buffer.from(files[file], 'base64'));
  add('cep/jsx/registry.jsx', registrySource(selected.assets, Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8')));
  return verifyPackage({ packageHash: hash(release), release, files });
}
function verifyPackage(pkg) {
  if (pkg.packageHash !== hash(pkg.release) || (pkg.release.version !== '4.0.0' && !(['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5'].includes(pkg.release.version) && pkg.release.format === 2)) || canonical(Object.keys(pkg.files).sort()) !== canonical(Object.keys(pkg.release.hashes).sort())) fail('package_integrity');
  for (const [relative, data] of Object.entries(pkg.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || path.isAbsolute(relative) || /^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || hash(Buffer.from(data, 'base64')) !== pkg.release.hashes[relative]) fail('package_integrity');
  }
  runtimeBinding(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (!selected.legacy && Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8') !== registrySource(selected.assets, Buffer.from(pkg.files['runtime/host/json-codec.jsx'], 'base64').toString('utf8'))) fail('composition_registry');
  return pkg;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let n = 0; n < args.length; n += 2) { const key = args[n]; if (!['--output', '--composition', '--runtime'].includes(key) || Object.hasOwn(options, key) || typeof args[n + 1] !== 'string' || args[n + 1].startsWith('--')) fail('package_options'); options[key] = args[n + 1]; }
    if (!options['--output'] || !path.isAbsolute(options['--output'])) fail('absolute_output_required');
    const pkg = buildPackage(undefined, options['--composition'] ?? 'manual', { runtimeModel: options['--runtime'] ?? 'stdio' }); fs.writeFileSync(options['--output'], canonical(pkg), { flag: 'wx' }); console.log(JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).length, composition: options['--composition'] ?? 'manual', runtimeModel: options['--runtime'] ?? 'stdio', output: options['--output'] }));
  } catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
}
module.exports = { buildPackage, verifyPackage, runtimeBinding };

```

## core4/tools/standalone-installer.js
SHA-256: `9459c199eabaadfa1a9cfe7fc981790eb4d780f2724c21bd45d4c9fca31bfe05`
```javascript
'use strict';
// Reviewed local bootstrap: only builtins until every distributed byte passes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const HELPERS = Object.freeze(['runtime/stopped-certification.js', 'tools/disposition-install-preflight.js', 'tools/finish-owner-maintenance.js', 'tools/install-core4.js', 'tools/legacy-owner-migration.js', 'tools/maintain-owner.js', 'tools/operate-start-over.js', 'tools/operate-stopped-readoption.js', 'tools/operate-stopped-update.js', 'tools/package-installable.js', 'tools/standalone-installer.js', 'tools/stopped-host-readoption-store.js', 'tools/stopped-host-readoption-transaction.js', 'tools/stopped-host-readoption.js', 'tools/stopped-update.js', 'tools/windows-retained-process.js']);
const HASH = /^[a-f0-9]{64}$/;
const maintenanceBootstraps = new WeakMap();
const updateBootstraps = new WeakMap();
const readoptionBootstraps = new WeakMap();
const startOverBootstraps = new WeakMap();
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('standalone_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || canonical(Object.keys(v).sort()) !== canonical([...keys].sort())) fail('standalone_schema'); }
function verifyManifest(manifest) {
  const keys = ['version', 'purpose', 'packageHash', 'hashes'];
  if (manifest?.version === 2) keys.push('capabilityBaseHash');
  exact(manifest, keys);
  if (![1, 2].includes(manifest.version) || manifest.purpose !== 'core4-standalone-installer-v1' ||
      typeof manifest.packageHash !== 'string' || !HASH.test(manifest.packageHash)) fail('standalone_schema');
  if (manifest.version === 2 && (typeof manifest.capabilityBaseHash !== 'string' || !HASH.test(manifest.capabilityBaseHash) ||
      manifest.capabilityBaseHash === manifest.packageHash)) fail('capability_update_base');
}
function absolute(file) { if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) fail('standalone_absolute_exact_path'); return file; }
function safe(file, directory = false) { absolute(file); const s = fs.lstatSync(file); if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file || (directory ? !s.isDirectory() : !s.isFile())) fail('standalone_path'); return s; }
function read(file) {
  const named = safe(file), fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.dev !== named.dev || stat.ino !== named.ino) fail('standalone_path');
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > 16 * 1024 * 1024) fail('standalone_budget');
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) fail('standalone_file_changed'); offset += count; }
    // A growing file cannot cause an unbounded read or bypass the original size.
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, offset) || fs.fstatSync(fd).size !== stat.size) fail('standalone_file_changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function verifyStandalone(root, expectedHash) {
  safe(root, true); const manifestBytes = read(path.join(root, 'standalone.json')), manifest = JSON.parse(manifestBytes);
  if (!HASH.test(expectedHash) || hash(manifestBytes) !== expectedHash) fail('standalone_reviewed_hash');
  verifyManifest(manifest);
  const files = new Set(['standalone.json']), dirs = new Set(['']);
  exact(manifest.hashes, Object.keys(manifest.hashes));
  for (const [file, digest] of Object.entries(manifest.hashes)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(file) || file.split('/').some(p => !p || p === '.' || p === '..') || file === 'standalone.json' || !HASH.test(digest)) fail('standalone_manifest_path');
    files.add(file); for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  }
  function visit(directory, relative) {
    safe(directory, true); if (!dirs.delete(relative)) fail('standalone_closure_tree');
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); safe(file, stat.isDirectory());
      if (stat.isDirectory()) visit(file, rel);
      else if (!files.delete(rel) || rel !== 'standalone.json' && hash(read(file)) !== manifest.hashes[rel]) fail('standalone_closure_bytes');
    }
  }
  visit(root, ''); if (files.size || dirs.size) fail('standalone_closure_tree');
  const pkg = JSON.parse(read(path.join(root, 'candidate.json'))); exact(pkg, ['packageHash', 'release', 'files']);
  if (pkg.packageHash !== manifest.packageHash || hash(pkg.release) !== pkg.packageHash || !['4.0.0', '4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5'].includes(pkg.release.version) || pkg.release.format !== 2) fail('standalone_candidate');
  exact(pkg.files, Object.keys(pkg.release.hashes));
  const expected = [...Object.keys(pkg.files), ...HELPERS, 'candidate.json', 'README.txt'].sort();
  if (canonical(Object.keys(manifest.hashes).sort()) !== canonical(expected)) fail('standalone_helper_closure');
  for (const [file, encoded] of Object.entries(pkg.files)) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(file) || manifest.hashes[file] !== pkg.release.hashes[file] || hash(Buffer.from(encoded, 'base64')) !== pkg.release.hashes[file]) fail('standalone_candidate_bytes');
  }
  return { distributionHash: expectedHash, packageHash: pkg.packageHash, pkg, ...(manifest.version === 2 ? { capabilityBaseHash: manifest.capabilityBaseHash } : {}) };
}
function main(args = process.argv.slice(2)) {
  const options = {}, mode = args[0];
  const maintenance = ['maintenance-inspect', 'maintenance-finish', 'stopped-inspect', 'stopped-certify'].includes(mode);
  const update = ['migrate-legacy', 'owner-update', 'update-inspect', 'update-finish', 'update-enable', 'enable-finish', 'legacy-inspect', 'legacy-finish', 'owner-pre-ready-inspect', 'owner-pre-ready-finish'].includes(mode);
  const readoption = ['readopt-inspect', 'readopt-apply', 'readopt-finish', 'readopt-enable', 'readopt-enable-finish'].includes(mode);
  const startOver = ['start-over-plan', 'start-over-request', 'start-over-stopped-plan', 'start-over-stopped-request', 'start-over-inspect', 'start-over-finish', 'start-over-continue'].includes(mode);
  const action = ['maintenance-finish', 'stopped-certify'].includes(mode);
  if (!['dry-run', 'apply'].includes(mode) && !maintenance && !update && !readoption && !startOver || args.length % 2 !== 1) fail('standalone_usage');
  if (startOver) {
    const pin = ['start-over-request', 'start-over-stopped-request'].includes(mode) ? ['--confirm-plan-hash'] :
      ['start-over-finish', 'start-over-continue'].includes(mode) ? ['--expected-intent-hash'] : [];
    const allowed = ['--expected-distribution-hash', '--expected-current-package-hash', '--installation', '--operation', ...pin];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || typeof args[i + 1] !== 'string' || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== allowed.length || allowed.filter(k => k.includes('hash')).some(k => !HASH.test(options[k])) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
    absolute(options['--installation']);
    const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
    for (const name of ['owner-contract.json', 'start-over-state.js', 'start-over-finisher.js', 'start-over-driver.js', 'work-session.js']) if (!Object.hasOwn(checked.pkg.release.hashes, 'runtime/' + name)) fail('start_over_distribution_unavailable');
    const capability = Object.freeze({}); startOverBootstraps.set(capability, Object.freeze({ mode, descriptor: options['--installation'], id: options['--operation'], expectedCurrentPackageHash: options['--expected-current-package-hash'], expectedIntentHash: options['--expected-intent-hash'], confirmedPlanHash: options['--confirm-plan-hash'] }));
    return (async () => { try { return await require('./operate-start-over.js').operate(capability); } finally { startOverBootstraps.delete(capability); } })();
  }
  if (readoption) {
    const allowed = ['--expected-distribution-hash', '--expected-current-package-hash', '--installation', '--operation', ...(mode !== 'readopt-inspect' ? ['--expected-proof-hash'] : []), ...(mode === 'readopt-apply' ? ['--witness', '--expected-witness-hash'] : [])];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || typeof args[i + 1] !== 'string' || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== allowed.length || allowed.filter(k => k.includes('hash')).some(k => !HASH.test(options[k])) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
    absolute(options['--installation']); if (mode === 'readopt-apply') absolute(options['--witness']);
    const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
    if (checked.packageHash !== options['--expected-current-package-hash']) fail('readoption_distribution_package_mismatch');
    for (const name of ['owner-contract.json', 'owner-entry.js', 'owner-maintenance.js', 'recovery-inspection.js', 'windows-owner-process.js', 'windows-reservation-provider.js', 'manual-policy.js']) if (!Object.hasOwn(checked.pkg.release.hashes, 'runtime/' + name)) fail('readoption_distribution_unavailable');
    const capability = Object.freeze({}); readoptionBootstraps.set(capability, Object.freeze({ mode, descriptorPath: options['--installation'], id: options['--operation'], expectedCurrentPackageHash: options['--expected-current-package-hash'], expectedProofHash: options['--expected-proof-hash'], witnessPath: options['--witness'], expectedWitnessHash: options['--expected-witness-hash'] }));
    // Catch synchronous import/call failures too; revoke only after the complete
    // awaited operation, including its election cleanup, has settled.
    return (async () => { try { return await require('./operate-stopped-readoption.js').operate(capability); } finally { readoptionBootstraps.delete(capability); } })();
  }
  if (update) {
    const primary = ['migrate-legacy', 'owner-update'].includes(mode), inspecting = ['update-inspect', 'legacy-inspect', 'owner-pre-ready-inspect'].includes(mode);
    const allowed = ['--expected-distribution-hash', '--expected-package-hash', '--expected-current-package-hash', '--expected-previous-descriptor-hash', '--installation', '--operation', ...(primary ? ['--config'] : []), ...(mode === 'migrate-legacy' ? ['--root-status', '--expected-root-status-hash'] : []), ...(!primary && !inspecting ? ['--expected-proof-hash'] : [])];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== allowed.length || allowed.filter(k => k.includes('hash')).some(k => !HASH.test(options[k])) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
    for (const k of ['--installation', ...(primary ? ['--config'] : []), ...(mode === 'migrate-legacy' ? ['--root-status'] : [])]) absolute(options[k]);
    const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
    if (checked.packageHash !== options['--expected-package-hash'] || !Object.hasOwn(checked.pkg.release.hashes, 'runtime/owner-contract.json')) fail('update_distribution_unavailable');
    if (checked.capabilityBaseHash && (mode.includes('legacy') || checked.capabilityBaseHash !== options['--expected-current-package-hash'])) fail('capability_update_base');
    const capability = Object.freeze({});
    updateBootstraps.set(capability, Object.freeze({ mode, descriptorPath: options['--installation'], expectedPreviousDescriptorHash: options['--expected-previous-descriptor-hash'], expectedCurrentPackageHash: options['--expected-current-package-hash'], expectedPackageHash: options['--expected-package-hash'], id: options['--operation'], pkg: checked.pkg, configPath: options['--config'], rootStatusPath: options['--root-status'], rootStatusHash: options['--expected-root-status-hash'], expectedProofHash: options['--expected-proof-hash'] }));
    return Promise.resolve(require('./operate-stopped-update.js').operate(capability)).finally(() => updateBootstraps.delete(capability));
  }
  if (maintenance) {
    const allowed = ['--expected-distribution-hash', '--expected-current-package-hash', '--installation', '--operation', ...(action ? ['--expected-proof-hash'] : [])];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== allowed.length || !HASH.test(options['--expected-current-package-hash']) || action && !HASH.test(options['--expected-proof-hash']) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
    absolute(options['--installation']);
    const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
    for (const name of ['owner-contract.json', 'owner-maintenance.js', 'recovery-inspection.js', 'windows-owner-process.js']) if (!Object.hasOwn(checked.pkg.release.hashes, 'runtime/' + name)) fail('maintenance_distribution_unavailable');
    const capability = Object.freeze({}); maintenanceBootstraps.set(capability, Object.freeze({ mode, descriptor: options['--installation'], id: options['--operation'], expectedPackageHash: options['--expected-current-package-hash'], expectedProofHash: options['--expected-proof-hash'] }));
    // The only continuation import is from this exact reviewed distribution.
    return Promise.resolve(require('./finish-owner-maintenance.js').operate(capability)).finally(() => maintenanceBootstraps.delete(capability));
  }
  for (let i = 1; i < args.length; i += 2) { const key = args[i], value = args[i + 1]; if (!['--expected-distribution-hash', '--expected-package-hash', '--install-root', '--extensions-dir', '--config'].includes(key) || Object.hasOwn(options, key) || typeof value !== 'string' || value.startsWith('--')) fail('standalone_usage'); options[key] = value; }
  if (!options['--expected-distribution-hash'] || !options['--install-root'] || !options['--extensions-dir'] || !options['--config'] || mode === 'apply' && !options['--expected-package-hash']) fail('standalone_usage');
  const destination = { installRoot: absolute(options['--install-root']), extensionsDir: absolute(options['--extensions-dir']), configPath: absolute(options['--config']) };
  const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
  if (checked.capabilityBaseHash) fail('capability_stopped_update_required');
  if (options['--expected-package-hash'] !== undefined && (!HASH.test(options['--expected-package-hash']) || options['--expected-package-hash'] !== checked.packageHash)) fail('reviewed_package_hash_mismatch');
  // All eager and lazy imports, including signed-history preflight, were checked.
  const { planInstall, applyInstall } = require('./install-core4.js');
  const plan = planInstall({ ...destination, pkg: checked.pkg, nodePath: process.execPath });
  return mode === 'apply' ? applyInstall(plan) : { dryRun: true, distributionHash: checked.distributionHash, packageHash: checked.packageHash, ...destination, descriptorPath: plan.descriptorPath, stateDir: plan.descriptor.stateDir, cepDir: plan.cepDir, baseline: plan.baseline, liveProof: false };
}
function assertMaintenanceBootstrap(capability) { const value = capability && maintenanceBootstraps.get(capability); if (!value) fail('maintenance_bootstrap_brand'); return value; }
function assertUpdateBootstrap(capability) { const value = capability && updateBootstraps.get(capability); if (!value) fail('update_bootstrap_brand'); return value; }
function assertReadoptionBootstrap(capability) { const value = capability && readoptionBootstraps.get(capability); if (!value) fail('readoption_bootstrap_brand'); return value; }
function assertStartOverBootstrap(capability) { const value = capability && startOverBootstraps.get(capability); if (!value) fail('start_over_bootstrap_brand'); return value; }
if (require.main === module) { Promise.resolve().then(() => main()).then(value => console.log(canonical(value))).catch(e => { console.error(canonical({ error: /^[a-z][a-z0-9_]{0,80}$/.test(e.code || '') ? e.code : 'standalone_failed', ...(e.transactionFile ? { transactionFile: e.transactionFile } : {}) })); process.exitCode = 1; }); }
module.exports = { HELPERS, verifyManifest, verifyStandalone, main, assertMaintenanceBootstrap, assertUpdateBootstrap, assertReadoptionBootstrap, assertStartOverBootstrap };

```

## core4/tools/package-standalone-installer.js
SHA-256: `91dfd29d8e3dddfbfc0882b7ca02fbc9678e7bcc229df47d95ae0e6b626e49dc`
```javascript
'use strict';
// Offline packaging only. Runtime payload excludes installer tools as before.
const fs = require('node:fs'), path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { buildPackage, verifyPackage } = require('./package-installable');
const { HELPERS, verifyManifest, verifyStandalone } = require('./standalone-installer');
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
Для отдельного пакета операции manifest v2 фиксирует capabilityBaseHash.
Передайте этот хеш как --expected-current-package-hash. Такой дистрибутив
принимает остановленное обновление owner, а обычные apply и dry-run отклоняет.
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
start-over-plan с теми же общими параметрами печатает одноразовый план нового сброса.
start-over-request принимает его --confirm-plan-hash PLAN_SHA и отправляет один запрос.
Для plan/request параметр --operation обозначает UUID оператора, ответ возвращает отдельный UUID сброса.
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
  return bundleStandalone(buildPackage(root, selector, options), { root });
}
function bundleStandalone(pkg, { root = path.resolve(__dirname, '..'), capabilityBaseHash } = {}) {
  verifyPackage(pkg);
  const files = { ...pkg.files };
  for (const file of HELPERS) { const target = path.join(root, file); if (fs.realpathSync(target) !== target || !fs.lstatSync(target).isFile()) fail('standalone_source_path'); files[file] = fs.readFileSync(target).toString('base64'); }
  files['candidate.json'] = Buffer.from(canonical(pkg)).toString('base64'); files['README.txt'] = Buffer.from(README).toString('base64');
  const manifest = { version: capabilityBaseHash === undefined ? 1 : 2, purpose: 'core4-standalone-installer-v1', packageHash: pkg.packageHash,
    hashes: Object.fromEntries(Object.keys(files).sort().map(file => [file, hash(Buffer.from(files[file], 'base64'))])),
    ...(capabilityBaseHash === undefined ? {} : { capabilityBaseHash }) };
  verifyManifest(manifest);
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
  verifyManifest(bundle.manifest);
  const pkg = verifyPackage(JSON.parse(Buffer.from(bundle.files['candidate.json'] || '', 'base64'))), expected = [...Object.keys(pkg.files), ...HELPERS, 'candidate.json', 'README.txt'].sort();
  if (bundle.packageHash !== pkg.packageHash || canonical(Object.keys(bundle.files).sort()) !== canonical(expected) || canonical(Object.keys(bundle.manifest.hashes).sort()) !== canonical(expected) || expected.some(file => hash(Buffer.from(bundle.files[file], 'base64')) !== bundle.manifest.hashes[file]) || Object.keys(pkg.files).some(file => pkg.release.hashes[file] !== bundle.manifest.hashes[file])) fail('standalone_bundle');
  fs.mkdirSync(output);
  for (const [file, encoded] of Object.entries(bundle.files)) { const target = path.join(output, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(encoded, 'base64'), { flag: 'wx' }); }
  fs.writeFileSync(path.join(output, 'standalone.json'), canonical(bundle.manifest), { flag: 'wx' });
  verifyStandalone(output, bundle.distributionHash);
  return { distributionHash: bundle.distributionHash, packageHash: bundle.packageHash, files: Object.keys(bundle.files).length, output, liveProof: false };
}
if (require.main === module) { try { const args = process.argv.slice(2), options = {}; for (let i = 0; i < args.length; i += 2) { if (!['--output', '--composition', '--runtime'].includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_package_options'); options[args[i]] = args[i + 1]; } if (!options['--output']) fail('new_absolute_standalone_output_required'); console.log(canonical(writeStandalone(options['--output'], buildStandalone(undefined, options['--composition'] || 'manual', { runtimeModel: options['--runtime'] ?? 'stdio' })))); } catch (e) { console.error(e.code || 'standalone_package_failed'); process.exitCode = 1; } }
module.exports = { buildStandalone, bundleStandalone, writeStandalone };

```

## docs/portability.md
SHA-256: `52da8fb83be23be4440a98a419edf15db18be0475bd6e75ae43bb9835e748899`
```markdown
# Переносимость AE Agent Core: десктоп ↔ MSI

Создан 28 октября 2026. Актуализирован 10 ноября, Asia/Yekaterinburg.
**Приёмка маршрута P1–P8 между MSI и DESKTOP-32974QF завершена.
Итоговая продуктовая приёмка Core проходит на MSI.**
Основание — прямое поручение пользователя сделать регулярный перенос крупных
архитектурных блоков в обе стороны штатным свойством всего AE Agent Core.
Core4/4.0.0 — текущее рабочее название среза, а не граница действия правила.

Историческое уточнение очередности от 29 октября 2026: по прямому поручению пользователя
фактический двухмашинный round-trip/P1–P8 выполняется в конце выбранного
функционального состава, после внешних продуктов и необходимых операций AE.
Это не предварительный gate разработки Titles/Slideshow. Архитектурные правила
переносимого кода и локальности authority действуют в текущих изменениях;
Фактические проверки этой пары выполнены 4 ноября, итог принят 5 ноября; см. отчёт ниже.

Документ дополняет [intent](core-4.0.0-intent.md),
[архитектуру](core-4.0.0-architecture.md) и [основной план](../plans/core-4.0.0.md).
Он задаёт требуемое поведение; имена будущих команд/файлов здесь не объявляются
существующими API. Изменение плана не возобновляет остановленные работы,
автоматизации, browser review или live AE-действия.

## Практический результат 4 ноября 2026

По прямому поручению пользователя отсрочка двухмашинного блока снята.
Выбранный manual/owner Core перенесён и проверен в обе стороны: одинаковые
runtime1f8c…/standalone18f247…, независимые локальные установки, штатные MCP-клиенты,
authenticated Origin `file://` и одно финальное native-чтение на каждой машине.
Подтверждены настоящий повтор прежнего пакета, следующий перенос и сохранность
локального состояния. Ручных правок конфигурации — 0.
[Итог P1–P8](core-portability-final-two-host-result-20261104.md).
Titles/Slideshow на паузе; full release, cloud и перенос пользовательских
AEP/assets не входят в этот результат. Полностью фоновое пересоздание службы
Codex без возобновления чата не доказано; после смены пакета проверяется штатный reconnect.

## Пользовательский результат

После однократной подготовки поддерживаемой среды на каждом компьютере
пользователь переносит выбранный commit/архитектурный блок, запускает штатный
сценарий проверки и обновления и продолжает разработку. Обратный перенос устроен
так же. **При каждом повторном цикле — 0 ручных правок исходников, MCP/CEP-конфига,
путей, портов и credentials ради смены компьютера.** Ручная сборка конфигурации
из сообщений прежнего чата также не допускается как штатный процесс.

Первичная подготовка включает установку поддерживаемых AE/Node/Codex, выбор
локальных корней при необходимости и законные пользовательские разрешения.
Штатный вход/подтверждение установки или разрешённый reconnect не считаются
правкой конфигурации. Ручной ремонт на каждом переносе, отключение защит и
регулярный перезапуск AE ради обновления не могут быть условиями успеха.
Неподдерживаемая или изменившаяся среда получает точный диагностический отказ
с перечнем несовместимостей до отправки AE-команд. Фактическая необходимость
действия пользователя отражается в отчёте и не скрывается за PASS.

## Новые модули и последующие версии

По уточнению пользователя от 10 ноября 2026 разработка, отладка и
продуктовая приёмка проходят на MSI. После приёмки принятый пакет переносится
на десктоп штатным маршрутом. Для переноса достаточно проверок совместимости,
установки и read-back. Продуктовые сценарии повторяются при изменении значимой
части среды, выявленном сбое или отдельном поручении.

При разработке модуля агент самостоятельно обеспечивает:

- включение необходимых файлов и объявленных зависимостей в переносимый состав;
- получение локальных путей и capabilities через общий механизм установки,
  без пользовательских абсолютных путей в предметном коде;
- диагностику новых требований среды до AE dispatch и сохранность локальных
  настроек, credentials, state и authority при обновлении;
- адресную проверку, если изменился механизм передачи, упаковки, установки
  или подключения, появилось новое требование к среде либо выявлен сбой.

Штатный запуск переноса/обновления должен автоматически выполнять проверку
совместимости, упаковку, применение и read-back в разрешённом scope. Ручная
правка конфигурации и повторное обсуждение общей переносимости не входят в
нормальный цикл добавления модулей. Новые зависимости или несовместимости
разбираются как конкретная инженерная задача; к пользователю обращаются,
если требуется его действие или решение по конкретному препятствию.

При обычной смене машины применяй штатный preflight и read-back переноса.
Повтор всего продуктового сценария или всей матрицы P1–P8 нужен только по
отдельному поручению. Область адресной проверки определяется изменением
или наблюдаемым сбоем.

## Архитектурные границы

| Область | Переносимый состав | Локальная привязка и обязательное поведение |
| --- | --- | --- |
| Разработка | Git commits/refs, исходники, contracts, manifests и необходимые dependency locks | Получение по Git или проверенному bundle; сохранять обе истории и чужие изменения. Расхождение веток согласовывается как изменение кода, а не маскируется настройкой среды; blind overwrite/reset запрещены |
| Сборка | Детерминированный пакет и hashes точной closure | Для одинакового выбранного состава кодовых артефактов пути/hostname не меняют их identity. Генерируемые локальные descriptors/CEP config имеют отдельные bindings и read-back |
| Установка | Версионированная схема конфигурации и контракт совместимости | Installer обнаруживает/проверяет локальные paths, Node path/version/hash, AE/CEP capabilities и доступность endpoints; создаёт локальную MCP/CEP-конфигурацию, сохраняет явные preferences и соседние записи |
| Состояние исполнения | Только необходимые очищенные сведения о результатах и ограничениях для инженерного контекста | Credentials, installation/state origins, owner locks, host adoption, живые grants, очереди и журналы исполнения принадлежат своей машине. Их нельзя копировать в действующий state другой машины или импортировать как authority |
| Инженерный контекст | План, decisions, review findings и их разбор, команды/логи/coverage с commit или exact closure binding | Evidence переносится с указанием исходной среды и без секретов/пользовательских активов. Новый чат не обязателен; продолжение доступно из файлов проекта |

Адреса/пути машины задаются через проверяемую локальную конфигурацию или
обнаружение среды. Разветвления предметной логики по имени десктопа/MSI и
встроенные абсолютные пользовательские paths запрещены. Fixed loopback endpoint
допустим как явный общий контракт; конфликт должен обнаруживаться и разбираться
штатным сценарием, без ручного редактирования порта или обхода чужого listener.
Исторические абсолютные пути в evidence сохраняют provenance и не являются
конфигурацией новой машины. Текущий рабочий root MSI из AGENTS.md этим не меняется.

Штатное обновление должно иметь preflight/dry-run, проверку точного package hash,
безопасное применение с проверкой неизменности исходного состояния, backup и
read-back. Повтор на той же версии не повреждает локальную установку/state;
возврат пакета к прежней версии сохраняет state и отказывает при несовместимой
схеме, а не сбрасывает его. Незавершённая команда удерживает свои ограничения.
Подключение проверяет точные Host/Origin/auth/MAC bindings; несовместимость CEP
не устраняется wildcard CORS, отключением auth или молчаливым fallback.

С Core 4.2.5 initial install допускается только в pristine-среде: без origins,
descriptor/client, CEP, state, releases, transactions и действующей записи Core
в конфигурации. Существующий пустой install root допустим. Read-only проверка
повторяется под обеими install leases и непосредственно перед первым видимым
switch. Под lease допускаются только собственные gates и созданные пустые
каталоги; перед switch — закреплённые собственные prepared/stage/release/transaction
файлы. Посторонний файл, в том числе завершённый ledger, не становится основанием
для новой identity. При отказе он сохраняется, новая identity не публикуется.

При существующих origins обязателен согласованный descriptor, client для Owner
и точный установленный CEP/release. Существующая запись Core должна адресовать
эту установку; quoted headers, preferences и соседние legacy-записи сохраняются.
Исторические Node binding и release проверяются как данные: старый executable
не исполняется и не требуется для candidate upgrade. Runtime verifier при этом
сохраняет свою проверку действующего Node; installer отдельно сверяет обе версии CEP.
Отсутствие записи Core в новом checkout допускает её штатное создание. Initial
rollback сохраняет origins/state/history; оставшаяся без descriptor установка
не становится pristine и ordinary reapply после такого rollback отклоняется.
Обновление и восстановление действующей установки используют существующие
stopped-update/inspect/finish gates; новые tombstones и authority не вводятся.

## Две машины и общие ресурсы

На десктопе и MSI — независимые installation identities и credentials,
актуальная проверка собственного процесса AE и новый разрешённый вход в работу.
Перенос исходников, одинаковый путь к AEP, commit или UUID не доказывают
continuity сеанса и не отменяют отправленную команду на исходной машине.
Исполняемые старые proposals/grants и UNKNOWN не превращаются в новые sends.

Fences действительно общих AEP/outputs/сетевых ресурсов сохраняют силу между
машинами. Неясная принадлежность или неизвестный исход не объявляются безопасными
из-за смены компьютера. Независимая работа с доказанно другими ресурсами не
должна зависеть от всей архивной рабочей истории другого компьютера. Sole
controller и текущие runtime gates действуют для соответствующих ресурсов;
автоматическое переключение живого контроллера или общий distributed lock пока
не обещаются. Перенос пользовательских AEP/assets — отдельный явный scope.

## Первичная приёмка маршрута P1–P8

Целевая пара — десктоп пользователя и MSI в явно записанном поддерживаемом
составе Windows/AE/CEP/Node/Codex. Совместимость всех ОС/версий этим не обещается.
Одной offline-имитации или положительного внешнего review недостаточно.

| ID | Проверяемый сценарий | Условие закрытия |
| --- | --- | --- |
| P1 | Разделение переносимого пакета и локальной установки | Один выбранный состав имеет одинаковую переносимую closure/identity на обеих машинах; локальные descriptors/credentials/state исключены из неё и проверены отдельно |
| P2 | Первичная подготовка и диагностика двух сред | На обеих машинах записаны версии/capabilities, проверены Node и AE identity, пути, endpoints, фактический Origin и auth. Отказы объясняют конкретную несовместимость до dispatch; unsupported не считается PASS |
| P3 | Десктоп → MSI | Реальный архитектурный блок с зафиксированным commit/closure перенесён и штатно установлен; configured MCP handshake/status и одна разрешённая typed read-only инспекция AE прошли; ручных правок конфигурации 0 |
| P4 | MSI → десктоп | Последующая проверяемая дельта этого блока возвращена, установлена и проверена тем же путём; ручных правок конфигурации 0. Копирование неизменённого архива обратно не заменяет обратный этап разработки |
| P5 | Повторный цикл и сохранность установки | Повторное применение той же версии и следующий перенос сохраняют local preferences, соседний config, installation/state identity. Проверены безопасный отказ при занятой очереди/конфликте endpoints и восстановление после частичной установки без сброса state |
| P6 | Отделение authority и общие fences | Адресные негативные проверки исключают принятие чужих credentials/origin/adoption/старого proposal как полномочий, replay UNKNOWN и обход fence общего ресурса. Независимые ресурсы не блокируются одной архивной историей |
| P7 | Продолжение инженерного этапа и review | На каждой стороне доступны точные commits/closure, decisions, findings с disposition, validation и пробелы покрытия. Исторический review/тест не объявлен проверкой изменившихся bytes или другой среды; секретов и пользовательских активов в пакете нет |
| P8 | Сводный результат | Сохранён единый отчёт P1–P7 с host/version/commit/package bindings, командами, исходами, числом ручных правок и оставшимися ограничениями; подтверждены обе реальные машины и оба направления |

Результат первичной приёмки подтверждён
[итоговым отчётом](core-portability-final-two-host-result-20261104.md).
Таблица фиксирует, что было проверено при создании маршрута. При
последующих изменениях выбирай тесты по затронутому контракту.

## Последовательность первичной реализации

1. Зафиксировать матрицу двух сред и точный состав переносимого блока. Сверить
   существующий installer и локальные настройки с этим контрактом, записать gaps.
2. Доработать обнаружение/проверку среды, генерацию конфигурации и повторяемое
   обновление. Закрыть адресные offline/negative tests и конкретные findings.
3. Провести P1–P7 в обе стороны на двух реальных машинах в разрешённом scope,
   сохраняя ownership, исходное evidence и незавершённые обязательства.
4. Зафиксировать P8 и решение о готовности маршрута.

Этот блок включён в [план устанавливаемого среза](../plans/core-4.0.0-installable.md).
Общие правила Argon review применяются на необходимых сложных переходах;
документ не поручает новую отправку и не возобновляет остановленную автоматизацию.

```
