'use strict';
// Private, synthetic-only embedding seam. No production lifecycle source or issuer.
const { fail, exact, id } = require('../protocol/json');
const ports = new WeakSet();
const lifecycles = new WeakMap();
const transitions = new Set(['project_new', 'project_open', 'project_revert', 'project_replacement']);
function createLifecycleSource(options) {
  exact(options, ['sourceId', 'sourceEpoch', 'synthetic']);
  if (options.synthetic !== true || typeof options.sourceId !== 'string' || !options.sourceId || typeof options.sourceEpoch !== 'string' || !options.sourceEpoch) fail('explicit_synthetic_lifecycle_required');
  const sourceId = options.sourceId, epochs = new Set([options.sourceEpoch]), listeners = new Set();
  let sourceEpoch = options.sourceEpoch, sequence = 0, generation = 0, state = 'unavailable', reason = 'project_transition_required', sessionId, binding;
  const snapshot = () => Object.freeze({ state, sourceId, sourceEpoch, sequence, ...(reason ? { reason } : {}), ...(sessionId ? { sessionId } : {}), ...(binding ? { binding } : {}) });
  function invalidate(nextState, nextReason) {
    generation++; binding = undefined; state = nextState; reason = nextReason;
    for (const listener of listeners) listener();
  }
  function lose(cause = 'source_lost') { invalidate('lost', typeof cause === 'string' && cause ? cause : 'source_lost'); return snapshot(); }
  return Object.freeze({ synthetic: true, snapshot, lose,
    subscribe(listener) { if (typeof listener !== 'function') fail('lifecycle_listener'); listeners.add(listener); return () => listeners.delete(listener); },
    restart(value) {
      try { exact(value, ['sourceEpoch']); } catch (error) { lose('source_restart_malformed'); throw error; }
      if (typeof value.sourceEpoch !== 'string' || !value.sourceEpoch || epochs.has(value.sourceEpoch)) { lose('source_epoch_reused'); fail('new_source_epoch_required'); }
      epochs.add(value.sourceEpoch); sourceEpoch = value.sourceEpoch; sequence = 0; sessionId = undefined;
      invalidate('unavailable', 'project_transition_required'); return snapshot();
    },
    apply(event) {
      if (state === 'lost') return snapshot();
      try {
        exact(event, ['sourceId', 'sourceEpoch', 'sequence', 'type', 'projectId']);
        if (event.sourceId !== sourceId || event.sourceEpoch !== sourceEpoch || !Number.isSafeInteger(event.sequence) || event.sequence !== sequence + 1 || !transitions.has(event.type)) return lose('event_continuity_lost');
        if (event.projectId !== undefined && (typeof event.projectId !== 'string' || !event.projectId || event.projectId.length > 8192)) return lose('event_malformed');
        sequence = event.sequence; sessionId = id('synthetic-project');
        invalidate(event.projectId ? 'current' : 'unavailable', event.projectId ? undefined : 'saved_project_required');
        if (state === 'current') {
          binding = Object.freeze({ kind: 'project-incarnation', lifecycleVerified: true, sessionId, projectId: event.projectId, sourceId, sourceEpoch, sequence, provenance: 'synthetic-event-source-only' });
          const currentBinding = binding, currentGeneration = generation;
          lifecycles.set(binding, { current: () => state === 'current' && binding === currentBinding && generation === currentGeneration });
        }
        return snapshot();
      } catch { return lose('event_malformed'); }
    }
  });
}
function validateLifecycleBinding(binding) { return !!binding && lifecycles.get(binding)?.current() === true; }
function brandAuthorityPort(port) {
  if (!port || typeof port.authorize !== 'function' || typeof port.registerProposal !== 'function') fail('authority_port');
  ports.add(port); return port;
}
function validatePort(port) { if (!ports.has(port)) fail('untrusted_authority_port'); return port; }
module.exports = { brandAuthorityPort, validatePort, createLifecycleSource, validateLifecycleBinding };
