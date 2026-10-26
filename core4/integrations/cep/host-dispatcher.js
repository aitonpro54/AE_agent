'use strict';
const { hash, bounded, parse, exact, fail } = require('../../core/receiver-api');
const sourceHash = hash(require('node:fs').readFileSync(__filename));
const PHASES = Object.freeze({ inspect: 'inspect', mutate: 'mutate', verify: 'verify' });
function literal(value) { return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
function createHostDispatcher({ csInterface, installExecutors, reviewedAdmissions, callbackTimeout = 2000 }) {
  if (!csInterface || typeof csInterface.evalScript !== 'function') fail('private_host_required');
  const assets = new Map(); let physicalPending = false;
  for (const item of installExecutors) {
    exact(item, ['moduleId', 'operationId', 'executorHash', 'source', 'admissionRef']);
    const admission = reviewedAdmissions.find(a => a.admissionRef === item.admissionRef);
    if (!admission || admission.revoked || admission.moduleId !== item.moduleId || admission.operationId !== item.operationId || admission.executorHash !== item.executorHash || hash(item.source) !== item.executorHash || assets.has(item.executorHash)) fail('executor_install_admission');
    assets.set(item.executorHash, Object.freeze({ ...item }));
  }
  const admittedExecutors = Object.freeze([...assets.values()]);
  return Object.freeze({
    admittedExecutors,
    get physicalPending() { return physicalPending; },
    evaluate({ phase, payload, command }) {
      const asset = assets.get(command.executorHash);
      if (!asset || asset.moduleId !== command.moduleId || asset.operationId !== command.operationId || !Object.hasOwn(PHASES, phase)) fail('host_not_admitted');
      if (physicalPending) fail('physical_lane_pending');
      // Only reviewed source enters the executable position. Every runtime value is a
      // JSON string literal parsed as data. No path/file/raw command ingress exists.
      const call = 'executor.' + PHASES[phase] + '(input)';
      const invoke = phase === 'mutate' ? 'return JSON.stringify(' + call + ');' :
        'try{return JSON.stringify(' + call + ');}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:e&&typeof e.coreCode==="string"&&/^[a-z][a-z0-9_]{0,63}$/.test(e.coreCode)?e.coreCode:"snapshot_failed"});}';
      const script = '(function(){var executor=' + asset.source + ';var input=JSON.parse(' + literal(bounded(payload)) + ');' + invoke + '}())';
      physicalPending = true;
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => { settled = true; reject(Object.assign(new Error('host_callback_timeout'), { code: 'host_callback_timeout' })); }, callbackTimeout);
        try {
          csInterface.evalScript(script, result => {
            // A late callback proves physical termination but cannot promote a timeout
            // to success; the durable UNKNOWN tombstone and lane remain fenced.
            if (settled) return;
            // A read callback proves physical termination. The fixed wrapper reports
            // executor refusals as data; the known CEP sentinel is also read-only.
            if (phase !== 'mutate') physicalPending = false;
            try {
              const value = phase !== 'mutate' && result === 'EvalScript error.' ? { readFailureVersion: 1, outcome: 'rejected', code: 'snapshot_failed' } : parse(result);
              physicalPending = false; settled = true; clearTimeout(timer); resolve(value);
            }
            catch (e) { settled = true; clearTimeout(timer); reject(e); }
          });
        } catch (e) { settled = true; clearTimeout(timer); reject(e); }
      });
    }
  });
}
module.exports = { createHostDispatcher, sourceHash };
