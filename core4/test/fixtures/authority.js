'use strict';
const { brandAuthorityPort, validateLifecycleBinding } = require('../../core/authority');
const { fail, canonical, hash } = require('../../protocol/json');
function syntheticAuthority({ sessionId, projectId, lifecycle, owner, checkpointRef, effects }) {
  if (!sessionId || !projectId || !lifecycle || !owner || !checkpointRef || !Array.isArray(effects)) fail('explicit_synthetic_bindings_required');
  const proposals = new Map(), confirmations = new Set(); let revoked = false;
  lifecycle.subscribe(() => confirmations.clear());
  const resourceConstraints = [{ constraintId: sessionId + ':' + projectId, schemaVersion: 1, resource: { sessionId, projectId }, owner, checkpointRef, allowedEffects: effects, reservationOwner: owner, unresolvedOutcome: false, revision: null, provenance: 'explicit-synthetic-constraint' }];
  function current() { const binding = lifecycle.snapshot().binding; if (!validateLifecycleBinding(binding)) fail('trusted_project_lifecycle_unavailable'); return binding; }
  return brandAuthorityPort({ synthetic: true, resourceConstraints,
    registerProposal(approval) {
      const copy = JSON.parse(canonical(approval)), previous = proposals.get(copy.proposalId);
      if (previous && canonical(previous) !== canonical(copy)) fail('proposal_registration_changed');
      proposals.set(copy.proposalId, copy);
    },
    confirm(proposalId) {
      const approval = proposals.get(proposalId); if (!approval) fail('registered_proposal_required');
      const binding = current();
      if (approval.steps.some(step => step.target.sessionId !== binding.sessionId || step.target.projectId !== binding.projectId)) fail('authority_target');
      confirmations.add(proposalId);
    },
    revoke(proposalId) { if (proposalId) confirmations.delete(proposalId); else { revoked = true; confirmations.clear(); } },
    authorize(request) {
      const binding = current(), approval = proposals.get(request.proposalId);
      if (revoked || request.target.sessionId !== binding.sessionId || request.target.projectId !== binding.projectId || request.target.sessionId !== sessionId || request.target.projectId !== projectId) fail('authority_target');
      if (!approval || !confirmations.has(request.proposalId)) fail('confirmation_checkpoint_ownership_required');
      const step = approval.steps.find(step => step.stepId === request.stepId);
      const expected = step && { proposalId: approval.proposalId, planDigest: approval.planDigest, taskId: approval.taskId, taskEpoch: approval.taskEpoch, ...step };
      if (!expected || canonical(request) !== canonical(expected)) fail('approval_binding_changed');
      if (!effects.includes(request.effectPolicy.effect)) fail('confirmation_checkpoint_ownership_required');
      return { owner, checkpointRef, allowedEffect: request.effectPolicy.effect, approvalDigest: hash(approval), provenance: 'synthetic-test-only' };
    }
  });
}
module.exports = { syntheticAuthority };
