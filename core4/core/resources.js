'use strict';
const { canonical, exact, fail } = require('../protocol/json');
// Neutral durable constraints. This class knows no module IDs or domain effects.
class Resources {
  constructor(ledger, seed = []) {
    this.ledger = ledger; this.diagnostics = [];
    if (ledger.corrupt || ledger.ownerFault) { this.diagnostics.push(ledger.ownerFault || 'ledger_corrupt'); return; }
    for (const record of seed) {
      const old = this.records().find(r => r && r.constraintId === record.constraintId);
      if (old && canonical(old) !== canonical(record)) { this.diagnostics.push('constraint_rebinding_required'); continue; }
      if (!old) ledger.append({ type: 'constraint', record });
    }
  }
  records() {
    const map = new Map(); for (const event of this.ledger.events) if (event.type === 'constraint') map.set(event.record?.constraintId, event.record);
    return [...map.values()];
  }
  authorize(target, effectPolicy, grant, snapshot) {
    if (this.diagnostics.length) fail('constraint_rebinding_required');
    for (const record of this.records()) {
      const resource = record?.resource;
      if (!resource || typeof resource !== 'object' || Array.isArray(resource) || typeof resource.sessionId !== 'string' || !resource.sessionId || typeof resource.projectId !== 'string' || !resource.projectId) fail('constraint_schema_unavailable');
      for (const key of ['sessionId', 'projectId', 'file', 'output']) if (key in resource && (typeof resource[key] !== 'string' || resource[key].length === 0 || resource[key].length > 8192)) fail('constraint_schema_unavailable');
      for (const key of ['compId', 'layerId', 'itemId']) if (key in resource && (!Number.isInteger(resource[key]) || resource[key] < 1 || resource[key] > 2147483647)) fail('constraint_schema_unavailable');
      if (typeof record.constraintId !== 'string' || !record.constraintId) fail('constraint_schema_unavailable');
      if (record.schemaVersion === 1 && (typeof record.owner !== 'string' || typeof record.checkpointRef !== 'string' || !Array.isArray(record.allowedEffects) || record.allowedEffects.some(effect => typeof effect !== 'string') || typeof record.unresolvedOutcome !== 'boolean' || (record.reservationOwner !== null && typeof record.reservationOwner !== 'string') || (record.revision !== null && typeof record.revision !== 'string'))) fail('constraint_schema_unavailable');
    }
    const candidates = this.records().filter(r => ['sessionId', 'projectId'].every(k => r.resource[k] === undefined || r.resource[k] === target[k]));
    // Only stable neutral base bindings can exclude an unfamiliar constraint. An
    // unknown schema/extension cannot narrow its own fence using unknown semantics.
    for (const record of candidates) {
      try { exact(record, ['constraintId', 'schemaVersion', 'resource', 'owner', 'checkpointRef', 'allowedEffects', 'reservationOwner', 'unresolvedOutcome', 'revision', 'provenance']); }
      catch { fail('constraint_schema_unavailable'); }
      if (record.schemaVersion !== 1 || Object.keys(record.resource).some(k => !['sessionId', 'projectId', 'compId', 'layerId', 'itemId', 'file', 'output'].includes(k))) fail('constraint_schema_unavailable');
    }
    const records = candidates.filter(r => Object.keys(r.resource).every(k => target[k] === r.resource[k]));
    if (!records.length) fail('resource_constraints_required');
    // Missing item/file/output bindings cannot prove a constraint unrelated. Such
    // records restrict a broad authorization, but never supply that authorization.
    // Preserve exclusion for known comp/layer (including sibling-layer) mismatches.
    const indeterminate = candidates.filter(r => !records.includes(r) &&
      Object.keys(r.resource).every(k => target[k] === r.resource[k] ||
        (target[k] === undefined && ['itemId', 'file', 'output'].includes(k))));
    for (const record of [...records, ...indeterminate]) {
      if (record.schemaVersion !== 1 || !Array.isArray(record.allowedEffects) || typeof record.owner !== 'string') fail('constraint_schema_unavailable');
      if (record.unresolvedOutcome || (record.reservationOwner && record.reservationOwner !== grant.owner)) fail('shared_resource_fenced');
      if (record.owner !== grant.owner || record.checkpointRef !== grant.checkpointRef || !record.allowedEffects.includes(effectPolicy.effect)) fail('resource_ownership_checkpoint_effect');
      if (record.revision !== null && record.revision !== snapshot.revision) fail('resource_revision');
    }
  }
}
module.exports = { Resources };
