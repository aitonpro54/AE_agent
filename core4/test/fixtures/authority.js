'use strict';
const { brandAuthorityPort } = require('../../core/authority');
const { fail } = require('../../protocol/json');
function syntheticAuthority({ sessionId, projectId, owner, checkpointRef, effects }) {
  if (!sessionId || !projectId || !owner || !checkpointRef || !Array.isArray(effects)) fail('explicit_synthetic_bindings_required');
  const confirmations = new Set(); let revoked = false;
  const resourceConstraints = [{ constraintId: sessionId + ':' + projectId, schemaVersion: 1, resource: { sessionId, projectId }, owner, checkpointRef, allowedEffects: effects, reservationOwner: owner, unresolvedOutcome: false, revision: null, provenance: 'explicit-synthetic-constraint' }];
  return brandAuthorityPort({ synthetic: true, resourceConstraints, confirm: proposalId => confirmations.add(proposalId), revoke: () => { revoked = true; },
    authorize({ proposalId, input, target, effectPolicy }) {
      if (revoked || input.sessionId !== sessionId || input.projectId !== projectId || target.sessionId !== sessionId || target.projectId !== projectId) fail('authority_target');
      if (!confirmations.has(proposalId) || !effects.includes(effectPolicy.effect)) fail('confirmation_checkpoint_ownership_required');
      return { owner, checkpointRef, allowedEffect: effectPolicy.effect, provenance: 'synthetic-test-only' };
    }
  });
}
module.exports = { syntheticAuthority };
