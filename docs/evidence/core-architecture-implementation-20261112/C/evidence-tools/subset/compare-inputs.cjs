'use strict';
// Read-only planning aid. It never runs tests, reuses PASS, or joins evidence.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const sha = b => createHash('sha256').update(b).digest('hex');
const demand = (ok, message) => { if (!ok) throw new Error(message); };
const sameCommand = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function compare(prior, selection) {
  demand(typeof prior.finishedAt === 'string' && Number.isFinite(Date.parse(prior.finishedAt)) &&
    ['PASS', 'INCOMPLETE', 'SUBSET_PASS'].includes(prior.status), 'prior_result_not_finished');
  demand(Array.isArray(prior.checks) && Array.isArray(selection.checks) && selection.checks.length &&
    Array.isArray(selection.executionBatches), 'invalid_result_or_selection_shape');
  const old = new Map(prior.checks.map(c => [c.check, c]));
  demand(old.size === prior.checks.length && new Set(selection.checks.map(c => c.check)).size === selection.checks.length, 'duplicate_check_names');
  const rerun = [], unchangedPassCandidates = [], commandChangedBatches = [];
  for (const check of selection.checks) {
    const previous = old.get(check.check), reasons = [];
    if (!previous) reasons.push('no_prior_check');
    else {
      if (previous.status !== 'PASS') reasons.push('prior_status_' + previous.status);
      if (previous.evidenceKey !== check.evidenceKey) reasons.push('evidenceKey_changed');
      if (!sameCommand(previous.command, check.command)) reasons.push('individual_command_changed');
      const batch = selection.executionBatches.find(b => b.checks.includes(check.check));
      demand(batch, 'new_check_missing_execution_batch');
      if (!sameCommand(previous.actualBatchCommand, batch.command)) { reasons.push('actual_batch_command_changed'); commandChangedBatches.push(check.check); }
    }
    if (reasons.length) rerun.push({ check: check.check, reasons, priorStatus: previous?.status ?? null,
      requiresOutcomeResolution: previous?.status === 'UNKNOWN' });
    else unchangedPassCandidates.push(check.check);
  }
  return { purpose: 'rerun-planning-only', releaseCertified: false, evidenceReuseClaimed: false,
    onlyChecks: rerun.map(c => c.check), rerun, unchangedPassCandidates,
    unchangedPassCandidatesRequireIndependentKeyCommandLogVerification: true, commandChangedBatches };
}
function main() {
  demand(process.argv.length === 4, 'usage: node compare-inputs.cjs prior-result.json new-full-selection.json');
  const before = fs.readFileSync(process.argv[2]), after = fs.readFileSync(process.argv[3]);
  console.log(JSON.stringify({ priorResultSHA256: sha(before), newSelectionSHA256: sha(after),
    ...compare(JSON.parse(before), JSON.parse(after)) }, null, 2));
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { compare };
