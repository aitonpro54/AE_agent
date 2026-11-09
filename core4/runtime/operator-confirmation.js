'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');
const { authorizeMontageStep, observeMontageMandate, issueMontageMandate, revokeMontageMandate } = require('./montage-mandate');

const HEX = /^[a-f0-9]{64}$/;
const PROPOSAL = /^proposal-[a-f0-9-]{36}$/;
const TTL_MS = 120000;
function fileFor(installation, proposalId) {
  if (!PROPOSAL.test(proposalId)) fail('operator_confirmation_proposal');
  return path.join(installation.stateDir, 'operator-confirmation-' + proposalId + '.json');
}
function sign(installation, body) {
  if (!HEX.test(installation.controlToken || '')) fail('operator_confirmation_key');
  return createHmac('sha256', Buffer.from(installation.controlToken, 'hex'))
    .update('ae-core4/operator-confirmation/v1\0' + canonical(body)).digest('hex');
}
function writeOnce(file, value) {
  const bytes = Buffer.from(canonical(value));
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    if (fs.writeSync(fd, bytes) !== bytes.length) fail('operator_confirmation_write');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}
function read(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 4096) fail('operator_confirmation_record');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    fail('operator_confirmation_record');
  }
}
function binding(installation, sessionId, proposalId, approvalDigest) {
  if (typeof sessionId !== 'string' || !sessionId || !HEX.test(approvalDigest || '')) fail('operator_confirmation_binding');
  return { version: 1, installationId: installation.installationId, packageHash: installation.packageHash, sessionId, proposalId, approvalDigest };
}
function issue(installation, { sessionId, proposalId, approvalDigest }) {
  const expiresAt = Date.now() + TTL_MS;
  const body = { ...binding(installation, sessionId, proposalId, approvalDigest), expiresAt };
  const file = fileFor(installation, proposalId);
  if (read(file + '.used')) fail('operator_confirmation_used');
  writeOnce(file, { body, mac: sign(installation, body) });
  return { proposalId, approvalDigest, expiresAt };
}
function createOperatorConfirmation(installation, currentSession, observedProject = () => null, currentMandateSession = currentSession) {
  function authorize(approval, reservation) {
    if (approval.steps.length !== 1) fail('operator_confirmation_single_step');
    const file = fileFor(installation, approval.proposalId), record = read(file);
    let proof;
    if (record) {
      const { body, mac } = record;
      if (!body || !HEX.test(mac || '') || !timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(sign(installation, body), 'hex'))) fail('operator_confirmation_signature');
      const now = Date.now(), expiresAt = body.expiresAt;
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + TTL_MS) fail('operator_confirmation_expired');
      const expected = { ...binding(installation, currentSession(), approval.proposalId, hash(approval)), expiresAt };
      if (canonical(body) !== canonical(expected)) fail('operator_confirmation_binding');
      proof = { digest: hash(body), expiresAt };
    } else {
      const mandate = authorizeMontageStep(installation, approval, currentMandateSession(), observedProject());
      if (!mandate) fail('operator_confirmation_required');
      proof = { digest: hash({ approval, mandate: mandate.digest }), expiresAt: mandate.expiresAt, mandateDigest: mandate.digest };
    }
    const { digest } = proof;
    const claim = { digest, commandId: reservation.commandId, reservationRef: reservation.ref, checkpointRef: reservation.checkpointRef, checkpointDigest: reservation.checkpointDigest };
    const usedPath = file + '.used';
    let used = read(usedPath);
    if (!used) {
      try { writeOnce(usedPath, claim); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      used = read(usedPath);
    }
    if (!used || canonical(used) !== canonical(claim)) fail('operator_confirmation_used');
    return proof;
  }
  authorize.assertDelivery = command => {
    const execution = command.payload?._execution, proof = execution?.operatorConfirmation;
    if (command.phase !== 'mutate' || !proof?.mandateDigest) return;
    const mandate = observeMontageMandate(installation, execution.taskId, currentMandateSession());
    if (!mandate || mandate.digest !== proof.mandateDigest || mandate.body.taskEpoch !== execution.taskEpoch ||
        mandate.body.projectId !== observedProject() || mandate.body.projectId !== command.payload.projectId ||
        proof.expiresAt !== mandate.body.expiresAt) fail('montage_mandate_binding');
  };
  return authorize;
}
module.exports = { createOperatorConfirmation, issue };

if (require.main === module) {
  try {
    const [descriptor, packageHash, proposalId, approvalDigest, sessionId, ...extra] = process.argv.slice(2);
    const mandateAction = proposalId === '--montage-issue' || proposalId === '--montage-revoke';
    if (!approvalDigest || !mandateAction && !sessionId || mandateAction && sessionId || extra.length) fail('operator_confirmation_arguments');
    const installation = require('./stdio-entry').verifyInstallation(descriptor);
    if (installation.packageHash !== packageHash || path.join(installation.releaseDir, 'runtime', path.basename(__filename)) !== __filename) fail('operator_confirmation_installation');
    if (proposalId === '--montage-revoke') console.log(JSON.stringify(revokeMontageMandate(installation, approvalDigest)));
    else {
      const work = require('./work-session').createWorkSession({ installation, descriptorPath: descriptor });
      if (proposalId === '--montage-issue') {
        const stat = fs.lstatSync(approvalDigest);
        if (!path.isAbsolute(approvalDigest) || !stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) fail('montage_mandate_record');
        const input = JSON.parse(fs.readFileSync(approvalDigest, 'utf8'));
        const session = work.status();
        if (session.resetPending || session.baselineRequired || (session.sessionId ?? installation.installationId) !== input.sessionId) fail('operator_confirmation_baseline');
        console.log(JSON.stringify(issueMontageMandate(installation, input)));
      } else {
        const session = work.assertCurrent(sessionId);
        if (session.baselineRequired) fail('operator_confirmation_baseline');
        console.log(JSON.stringify(issue(installation, { sessionId, proposalId, approvalDigest })));
      }
    }
  } catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
}
