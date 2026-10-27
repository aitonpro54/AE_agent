'use strict';
const { canonical, exact, fail } = require('../protocol/json');
const { validateReservationHandle } = require('./authority');
function scopesOverlap(a, b) {
  if (!a || !b || !a.projectId || !b.projectId) return true;
  const knownOrigin = value => value && typeof value.machineId === 'string' && value.machineId.length > 0 && Number.isSafeInteger(value.aePid) && value.aePid > 0 && typeof value.aeProcessBirth === 'string' && value.aeProcessBirth.length > 0;
  if (knownOrigin(a.origin) && knownOrigin(b.origin)) {
    if (a.origin.machineId && b.origin.machineId && a.origin.machineId !== b.origin.machineId) return false;
    if (a.origin.aePid && b.origin.aePid && (a.origin.aePid !== b.origin.aePid || a.origin.aeProcessBirth !== b.origin.aeProcessBirth)) return false;
  }
  if (a.projectId !== b.projectId) return false;
  if (a.sessionId && b.sessionId && a.sessionId !== b.sessionId) return false;
  return ['compId', 'layerId', 'itemId', 'file', 'output'].every(k => a[k] === undefined || b[k] === undefined || a[k] === b[k]);
}
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
    if (grant.executionScope) return this.authorizeCurrentTarget(target, effectPolicy, grant, snapshot);
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
  authorizeCurrentTarget(target, policy, grant, snapshot) {
    if (this.diagnostics.length || this.ledger.corrupt || this.ledger.ownerFault) fail('constraint_rebinding_required');
    const handle = validateReservationHandle(grant.reservation);
    if (handle.ref !== grant.reservationRef || canonical(handle.executionScope) !== canonical(grant.executionScope) || grant.executionScope.schemaVersion !== 2 || canonical(grant.executionScope.target) !== canonical(target)) fail('reservation_scope');
    const scope = { ...target, origin: grant.executionScope.origin }; let authorized = false;
    for (const record of this.records()) {
      if (!record || !record.resource || typeof record.resource.projectId !== 'string') fail('constraint_schema_unavailable');
      exact(record, ['constraintId', 'schemaVersion', 'resource', 'origin', 'owner', 'checkpointRef', 'allowedEffects', 'reservationOwner', 'unresolvedOutcome', 'revision', 'provenance']);
      if (![1, 2].includes(record.schemaVersion) || typeof record.owner !== 'string' || typeof record.checkpointRef !== 'string' || !Array.isArray(record.allowedEffects) || record.allowedEffects.some(e => typeof e !== 'string') || typeof record.unresolvedOutcome !== 'boolean' || record.schemaVersion === 1 && (!record.resource.sessionId || record.origin !== undefined)) fail('constraint_schema_unavailable');
      exact(record.resource, ['sessionId', 'projectId', 'compId', 'layerId', 'itemId', 'file', 'output']);
      for (const key of ['sessionId', 'projectId', 'file', 'output']) if (key in record.resource && (typeof record.resource[key] !== 'string' || !record.resource[key])) fail('constraint_schema_unavailable');
      for (const key of ['compId', 'layerId', 'itemId']) if (key in record.resource && (!Number.isSafeInteger(record.resource[key]) || record.resource[key] < 1)) fail('constraint_schema_unavailable');
      if (record.schemaVersion === 2 && (!record.origin || typeof record.origin.machineId !== 'string' || !Number.isSafeInteger(record.origin.aePid) || record.origin.aePid < 1 || typeof record.origin.aeProcessBirth !== 'string')) fail('constraint_schema_unavailable');
      if (record.schemaVersion === 2) exact(record.origin, ['machineId', 'aePid', 'aeProcessBirth']);
      if (!scopesOverlap({ ...record.resource, ...(record.origin ? { origin: record.origin } : {}) }, scope)) continue;
      if (record.unresolvedOutcome || record.reservationOwner && record.reservationOwner !== grant.owner) fail('shared_resource_fenced');
      if (record.owner !== grant.owner || record.checkpointRef !== grant.checkpointRef || !record.allowedEffects.includes(policy.effect)) fail('resource_ownership_checkpoint_effect');
      if (record.revision !== null && record.revision !== snapshot.revision) fail('resource_revision');
      if (record.schemaVersion === 2 && canonical(record.resource) === canonical(target) && canonical(record.origin) === canonical(scope.origin)) authorized = true;
    }
    if (!authorized) fail('resource_constraints_required');
  }
}
module.exports = { Resources, scopesOverlap };
