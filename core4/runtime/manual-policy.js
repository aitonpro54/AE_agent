'use strict';
const { brandAuthorityPort, brandExecutionPolicyPort } = require('../core/authority');
const { hash, canonical, fail, exact } = require('../protocol/json');
const POLICY = 'current-matching-target-after-local-confirmation-v1';
function createManualPolicy({ selected, layout, additional = [], provider, installation, getPeer }) {
  const profiles = [selected, ...(layout ? [layout] : []), ...additional].map(value => ({ contractPin: hash(value.contract), modulePin: value.pin,
    admissionPin: hash(value.admission), executorHash: value.admission.executorHash, proof: value.proof, prepareCheckpoint: value.prepareCheckpoint,
    validateResult: value.validateResult, assertTarget: value.assertTarget }));
  const approvals = new Map();
  function admitted(candidate) {
    return profiles.find(profile => candidate.pin === profile.modulePin && hash(candidate.contract) === profile.contractPin && hash(candidate.admission) === profile.admissionPin);
  }
  function describe(candidate, evidence) {
    const profile = admitted(candidate);
    if (!profile) return null;
    const { contractPin, modulePin, admissionPin } = profile;
    const target = evidence?.target || {};
    return { policyId: POLICY, pin: hash({ policyId: POLICY, contractPin, modulePin, admissionPin }), verificationKind: 'local-transaction-receipt', executionScope: provider.scope(target) };
  }
  const authority = brandAuthorityPort({ synthetic: false, resourceConstraints: [],
    registerProposal(approval) { const copy = JSON.parse(canonical(approval)), old = approvals.get(copy.proposalId); if (old && canonical(old) !== canonical(copy)) fail('proposal_registration_changed'); approvals.set(copy.proposalId, copy); },
    authorize(request) {
      const approval = approvals.get(request.proposalId), step = approval?.steps.find(s => s.stepId === request.stepId);
      if (!step || step.executionPolicy?.policyId !== POLICY || !request.checkpointRecord || !request.reservation) fail('native_delivery_authorization_required');
      const { checkpointRecord: checkpoint, reservation, ...base } = request;
      if (canonical(base) !== canonical({ proposalId: approval.proposalId, planDigest: approval.planDigest, taskId: approval.taskId, taskEpoch: approval.taskEpoch, ...step })) fail('approval_binding_changed');
      provider.assert(reservation);
      if (reservation.checkpointRef !== checkpoint.ref || reservation.checkpointDigest !== checkpoint.digest || reservation.proposalId !== approval.proposalId) fail('checkpoint_reservation_binding');
      return { owner: installation.installationId, checkpointRef: checkpoint.ref, allowedEffect: step.effectPolicy.effect, approvalDigest: hash(approval), executionScope: step.executionPolicy.executionScope, reservationRef: reservation.ref, reservation, provenance: 'native-confirmation-delivery-only' };
    }
  });
  const port = brandExecutionPolicyPort({
    describe,
    assertCurrent(ctx) {
      const profile = admitted(ctx.selected);
      if (!profile) fail('execution_policy_pin_changed');
      profile.assertTarget?.(ctx.target);
      if (!getPeer().status().peer.connected) fail('panel_unavailable');
      if (ctx.reservation) provider.assert(ctx.reservation, { afterSend: ctx.stage === 'after-send' });
    },
    async prepareReservation(ctx) {
      const profile = admitted(ctx.selected);
      profile?.proof?.beforeReservation(ctx);
      const reservation = await provider.prepare(ctx);
      try { profile?.prepareCheckpoint?.(ctx); }
      catch (error) { provider.cancelBeforeSend(reservation, error.code || 'checkpoint_failed'); throw error; }
      return reservation;
    },
    assertReservation(ctx, handle) { return provider.assert(handle, { afterSend: ctx.stage === 'after-send' }); },
    cancelBeforeSend(handle, code) { provider.cancelBeforeSend(handle, code); },
    verifyCompletion(ctx, proof) {
      const profile = admitted(ctx.selected);
      if (!profile) fail('execution_policy_pin_changed');
      exact(proof, ['commandId', 'state', 'response', 'originalBinding']);
      if (!proof || proof.state !== 'completed' || !proof.response || canonical(proof.originalBinding) !== canonical(ctx.originalBinding)) fail('original_completion_required');
      const body = proof.response;
      exact(body, ['protocolVersion', 'commandId', 'executorHash', 'payloadHash', 'result']);
      if (proof.commandId !== ctx.commandId || body.protocolVersion !== 1 || body.commandId !== ctx.commandId || body.executorHash !== profile.executorHash || body.payloadHash !== hash(canonical(ctx.physicalInput))) fail('original_completion_correlation');
      const result = body.result;
      exact(result, ['outcome', 'snapshot', 'code', 'transactionReceipt', 'readFailureVersion']);
      const execution = ctx.physicalInput._execution;
      if (!execution || execution.checkpointRef !== ctx.checkpoint.ref || execution.checkpointDigest !== ctx.checkpoint.digest || execution.baselineDigest !== hash(ctx.before) || execution.baselineRevision !== ctx.before.revision || execution.proposalId !== (ctx.proposal?.proposalId || ctx.proposalId) || execution.planDigest !== (ctx.proposal?.planDigest || ctx.planDigest)) fail('checkpoint_completion_binding');
      if (result.outcome === 'rejected') { if (ctx.reservation) provider.finish(ctx.reservation, 'rejected'); else if (ctx.grant) provider.finishOriginal(ctx.grant.reservationRef, 'rejected'); return { rejected: true, code: result.code }; }
      if (result.outcome !== 'applied') fail('mutation_unknown');
      const receipt = result.transactionReceipt;
      const expected = { policyId: POLICY, proposalId: execution.proposalId, planDigest: execution.planDigest, taskId: execution.taskId, taskEpoch: execution.taskEpoch, stepId: execution.stepId, checkpointRef: execution.checkpointRef, checkpointDigest: execution.checkpointDigest, baselineDigest: execution.baselineDigest, baselineRevision: execution.baselineRevision, target: ctx.target, protectedFields: ctx.before.protected };
      if (profile.validateResult) {
        profile.validateResult(ctx, result.snapshot);
        Object.assign(expected, { version: 2, resultRevision: result.snapshot.revision });
      } else {
        const desiredText = profile.proof ? profile.proof.validateCompletion(ctx, result.snapshot, execution) : ctx.input.text;
        if (result.snapshot.text !== desiredText) fail('local_transaction_receipt_mismatch');
        Object.assign(expected, { version: 1, desiredText });
      }
      if (canonical(receipt) !== canonical(expected) || result.snapshot.protected !== ctx.before.protected || canonical(result.snapshot.target) !== canonical(ctx.target)) fail('local_transaction_receipt_mismatch');
      if (ctx.reservation) provider.finish(ctx.reservation, 'succeeded');
      else if (ctx.grant) provider.finishOriginal(ctx.grant.reservationRef, 'succeeded');
      return { after: result.snapshot, verificationKind: 'local-transaction-receipt' };
    }
  });
  return { authority, port, describe, policyId: POLICY };
}
module.exports = { createManualPolicy, POLICY };
