'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHmac, timingSafeEqual, randomUUID } = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');

const MAX_AGE_MS = 8 * 60 * 60 * 1000;
const MAX_BYTES = 64 * 1024;
const TASK = /^task-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const POLICIES = Object.freeze({ dirty: 'preserve-in-memory', save: 'separate-exact-approval', reopen: 'clean-only-separate-exact-approval' });
const OPERATIONS = Object.freeze({
  'media-import': {
    operationId: 'ingest-footage', effect: 'project-media-import',
    fields: ['sessionId', 'projectId', 'file', 'sha256'], target: ['sessionId', 'projectId', 'file']
  },
  'layer-overlay': {
    operationId: 'duplicate-and-replace-still', effect: 'composition-layer-overlay',
    fields: ['sessionId', 'projectId', 'compId', 'layerId', 'originalSourceId', 'itemId', 'file', 'sha256'],
    target: ['sessionId', 'projectId', 'compId', 'layerId', 'originalSourceId', 'itemId']
  },
  'comp-frame-export': {
    operationId: 'save-comp-frame-png', effect: 'composition-frame-png-export',
    fields: ['projectId', 'compId', 'frame', 'fileName'], target: ['projectId', 'compId']
  }
});
const own = (value, key) => Object.hasOwn(value, key);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => own(value, key));
const same = (a, b) => canonical(a) === canonical(b);
const pick = (source, keys) => Object.fromEntries(keys.map(key => [key, source[key]]));
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,160}$/.test(value);
const filePath = value => typeof value === 'string' && value.length <= 512 && path.isAbsolute(value) && !/[\x00-\x1f]/.test(value);
const positive = value => Number.isInteger(value) && value > 0 && value <= 2147483647;

function filename(installation, taskId) {
  if (typeof taskId !== 'string' || !TASK.test(taskId)) fail('montage_mandate_task');
  return path.join(installation.stateDir, 'montage-mandate-' + taskId + '.json');
}
function mac(installation, body) {
  if (!HEX.test(installation.controlToken) || !HEX.test(installation.panelToken) || installation.panelToken === installation.controlToken)
    fail('montage_mandate_signer');
  return createHmac('sha256', Buffer.from(installation.controlToken + installation.panelToken, 'hex'))
    .update('ae-core4/montage-mandate/v2\0' + canonical(body)).digest('hex');
}
function read(file) {
  let before;
  try { before = fs.lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const sameFile = observed => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => before[key] === observed[key]);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(MAX_BYTES)) fail('montage_mandate_record');
  const fd = fs.openSync(file, 'r');
  try {
    if (!sameFile(fs.fstatSync(fd, { bigint: true }))) fail('montage_mandate_record');
    const bytes = Buffer.alloc(Number(before.size));
    for (let offset = 0; offset < bytes.length;) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) fail('montage_mandate_record');
      offset += count;
    }
    if (!sameFile(fs.fstatSync(fd, { bigint: true })) || !sameFile(fs.lstatSync(file, { bigint: true }))) fail('montage_mandate_record');
    const value = JSON.parse(bytes.toString('utf8'));
    if (!bytes.equals(Buffer.from(canonical(value)))) fail('montage_mandate_record');
    return value;
  } finally { fs.closeSync(fd); }
}
function writeOnce(file, value) {
  const bytes = Buffer.from(canonical(value));
  if (bytes.length > MAX_BYTES) fail('montage_mandate_budget');
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    if (fs.writeSync(fd, bytes) !== bytes.length) fail('montage_mandate_write');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}
function revoked(file) {
  try { fs.lstatSync(file + '.revoked'); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function validateActions({ projectId, sessionId, actions }) {
  if (!identifier(sessionId) || !filePath(projectId) || !/\.aep$/i.test(projectId) ||
      !Array.isArray(actions) || !actions.length || actions.length > 64) fail('montage_mandate_scope');
  const keys = new Set(), slots = new Set(), outputs = new Set();
  for (const action of actions) {
    if (!exact(action, ['moduleId', 'input']) || !own(OPERATIONS, action.moduleId)) fail('montage_mandate_action');
    const { input } = action;
    const fields = scopeFields(action.moduleId, input);
    if (!exact(input, fields) || input.projectId !== projectId || own(input, 'sessionId') && input.sessionId !== sessionId ||
        fields.filter(key => key === 'compId' || key === 'layerId' || key === 'itemId' || key === 'originalSourceId').some(key => !positive(input[key])) ||
        own(input, 'file') && (!filePath(input.file) || typeof input.sha256 !== 'string' || !HEX.test(input.sha256)) ||
        own(input, 'frame') && (!Number.isSafeInteger(input.frame) || input.frame < 0 || input.frame > 1000000 ||
          typeof input.fileName !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,90}\.png$/i.test(input.fileName))) fail('montage_mandate_action');
    const key = canonical(action), slot = input.compId + '/' + input.layerId, output = String(input.fileName).toLowerCase();
    if (keys.has(key) || action.moduleId === 'layer-overlay' && slots.has(slot) ||
        action.moduleId === 'comp-frame-export' && outputs.has(output)) fail('montage_mandate_duplicate_action');
    keys.add(key);
    if (action.moduleId === 'layer-overlay') slots.add(slot);
    if (action.moduleId === 'comp-frame-export') outputs.add(output);
  }
  for (const action of actions) {
    if (action.moduleId === 'layer-overlay' && !own(action.input, 'itemId') &&
        !actions.some(candidate => candidate.moduleId === 'media-import' && candidate.input.file === action.input.file &&
          candidate.input.sha256 === action.input.sha256)) fail('montage_mandate_import_required');
  }
}
function scopeFields(moduleId, input) {
  const { fields } = OPERATIONS[moduleId];
  return moduleId === 'layer-overlay' && input && !own(input, 'itemId') ? fields.filter(key => key !== 'itemId') : fields;
}

function issueMontageMandate(installation, input, now = Date.now()) {
  if (!exact(input, ['taskId', 'taskEpoch', 'sessionId', 'projectId', 'expiresAt', 'actions']) ||
      !Number.isSafeInteger(input.taskEpoch) || input.taskEpoch < 0 ||
      !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + MAX_AGE_MS) fail('montage_mandate_scope');
  validateActions(input);
  const file = filename(installation, input.taskId);
  if (revoked(file)) fail('montage_mandate_revoked');
  const body = { ...input, version: 2, backend: 'core', installationId: installation.installationId,
    packageHash: installation.packageHash, createdAt: now, policies: POLICIES };
  const staged = file + '.' + randomUUID() + '.stage';
  try {
    writeOnce(staged, { body, mac: mac(installation, body) });
    if (revoked(file)) fail('montage_mandate_revoked');
    fs.linkSync(staged, file);
  } finally {
    try { fs.unlinkSync(staged); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { taskId: input.taskId, expiresAt: input.expiresAt, digest: hash(body), backend: 'core', policies: POLICIES };
}
function revokeMontageMandate(installation, taskId) {
  const file = filename(installation, taskId);
  if (!read(file)) fail('montage_mandate_missing');
  if (!revoked(file)) {
    try { writeOnce(file + '.revoked', { taskId, revokedAt: Date.now() }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return { taskId, revoked: true };
}
function observeMontageMandate(installation, taskId, sessionId, now = Date.now()) {
  if (typeof taskId !== 'string' || !TASK.test(taskId)) return null;
  const file = filename(installation, taskId);
  if (revoked(file)) fail('montage_mandate_revoked');
  const record = read(file);
  if (!record) return null;
  const { body } = record;
  if (!exact(record, ['body', 'mac']) || !exact(body, ['version', 'backend', 'taskId', 'taskEpoch', 'sessionId', 'projectId', 'expiresAt',
    'actions', 'installationId', 'packageHash', 'createdAt', 'policies']) || typeof record.mac !== 'string' ||
    !HEX.test(record.mac) || !timingSafeEqual(Buffer.from(record.mac, 'hex'), Buffer.from(mac(installation, body), 'hex'))) fail('montage_mandate_signature');
  if (body.version !== 2 || body.backend !== 'core' || body.taskId !== taskId || body.sessionId !== sessionId ||
      body.installationId !== installation.installationId || body.packageHash !== installation.packageHash ||
      !same(body.policies, POLICIES)) fail('montage_mandate_binding');
  if (body.expiresAt <= now || body.createdAt > now || body.expiresAt > body.createdAt + MAX_AGE_MS) fail('montage_mandate_expired');
  validateActions(body);
  if (revoked(file)) fail('montage_mandate_revoked');
  return { body, digest: hash(body) };
}
function matchesMontageAction(mandate, moduleId, operationId, input, importedItem) {
  const op = OPERATIONS[moduleId];
  return own(OPERATIONS, moduleId) && operationId === op.operationId && mandate.body.actions.some(action => {
    if (action.moduleId !== moduleId || !same(action.input, pick(input, scopeFields(moduleId, action.input)))) return false;
    return moduleId !== 'layer-overlay' || own(action.input, 'itemId') ||
      importedItem(mandate, action.input) === input.itemId;
  });
}
function importedMontageItem(commands, { body, digest }, input) {
  const imports = commands.filter(command => command.taskId === body.taskId && command.state === 'succeeded' &&
    command.verificationKind === 'local-transaction-receipt' && command.taskEpoch === body.taskEpoch &&
    command.selected?.moduleId === 'media-import' && command.grant?.operatorConfirmation?.mandateDigest === digest &&
    command.input.projectId === body.projectId && command.input.sessionId === body.sessionId &&
    command.input.file === input.file && command.input.sha256 === input.sha256 &&
    positive(command.after?.createdItemId) && command.after.items.some(item => item.id === command.after.createdItemId &&
      item.file === input.file && item.kind === 'still'));
  return imports.length === 1 ? imports[0].after.createdItemId : null;
}
function authorizeMontageStep(installation, approval, sessionId, observedProject, importedItem) {
  const step = approval.steps[0], id = step.moduleId;
  if (!own(OPERATIONS, id)) return null;
  const mandate = observeMontageMandate(installation, approval.taskId, sessionId);
  if (!mandate) return null;
  const { body } = mandate, { operationId, effect, fields, target } = OPERATIONS[id];
  if (approval.taskEpoch !== body.taskEpoch || observedProject !== body.projectId ||
      step.operationId !== operationId || step.effectPolicy.effect !== effect ||
      !exact(step.input, [...fields, 'expectedRevision']) || !exact(step.target, target)) fail('montage_mandate_binding');
  const input = pick(step.input, fields);
  if (!same(step.target, pick(input, target)) ||
      !matchesMontageAction(mandate, id, step.operationId, input, importedItem)) fail('montage_mandate_action');
  return { digest: mandate.digest, expiresAt: body.expiresAt };
}

module.exports = { issueMontageMandate, revokeMontageMandate, observeMontageMandate, authorizeMontageStep, matchesMontageAction, importedMontageItem };
