'use strict';

// Сверка ключей и исходных логов перед принятием строк L4.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical } = require('../core4/protocol/json');
const { matrix } = require('./core-followup-matrix.cjs');
const { supplementalInventory } = require('./run-core-followup-matrix.cjs');

const read = file => JSON.parse(fs.readFileSync(file));
const same = (a,b) => canonical(a) === canonical(b);
const verify = result => result.evidence?.log && fs.existsSync(result.evidence.log) &&
  hash(fs.readFileSync(result.evidence.log)) === result.evidence.sha256;

function summarize(files) {
  const current = matrix();
  const records = files.map(read);
  for (const record of records) {
    assert.equal(record.machine, 'MSI');
    assert.equal(record.node, process.version);
    assert.equal(record.registry.file, current.registry.file);
  }
  const all = records.flatMap(record => record.checks);
  const source = current.checks.map(entry => {
    const attempts = all.filter(r => r.check === entry.check && r.result && verify(r));
    const accepted = attempts.findLast(r => r.evidenceKey === entry.evidenceKey && r.cwd === entry.cwd &&
      same(r.command, entry.command) && r.status === 'fresh-pass' && r.result.exitCode === 0 &&
      r.result.pass > 0 && r.result.fail === 0 && r.result.skipped === 0);
    return { ...entry, status: accepted ? 'fresh-pass' : entry.status, evidence: accepted?.evidence ?? entry.evidence,
      result: accepted?.result, environment: accepted?.environment ?? entry.environment,
      previousAttempts: attempts.filter(r => r !== accepted).map(r => ({ evidenceKey:r.evidenceKey, status:r.status,
        evidence:r.evidence, result:r.result })) };
  });
  const extra = all.filter(r => !r.evidenceKey && r.result);
  const supplemental = supplementalInventory().map(entry => {
    const attempts = extra.filter(r => r.check === entry.check);
    const accepted = attempts.findLast(row => row.dependencyDigest === entry.dependencyDigest && row.cwd === entry.cwd &&
      same(row.command,entry.command) && verify(row) && row.status === 'fresh-pass' && row.result.skipped === 0);
    return { ...entry,...accepted, previousAttempts:attempts.filter(r => r !== accepted).map(r =>
      ({ status:r.status, result:r.result, evidence:r.evidence, dependencyDigest:r.dependencyDigest })) };
  });
  const result = { ...current, checks:source, supplemental };
  result.summary = Object.fromEntries([...new Set([...source,...supplemental].map(row => row.status))]
    .map(status => [status,[...source,...supplemental].filter(row => row.status === status).length]));
  return result;
}

if (require.main === module) {
  if (process.argv.length < 4) throw Error('Укажите новый файл реестра и хотя бы один результат прогона.');
  const result = summarize(process.argv.slice(3).map(file => path.resolve(file)));
  fs.writeFileSync(path.resolve(process.argv[2]),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result.summary));
}

module.exports = { summarize };
