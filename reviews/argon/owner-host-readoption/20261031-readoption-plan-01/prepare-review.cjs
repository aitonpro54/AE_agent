'use strict';
// Local-only packet preparation. Reads explicit source ranges, never runtime state.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const baseCommit = '9343989757b8eddbbced434e65858f2d2f0ef2b2';
const planPath = 'plans/core-cep-r3-host-readoption-20261031.md';
const selections = [
  ['core4/tools/adopt-host.js', [[75, 94]]],
  ['core4/runtime/windows-reservation-provider.js', [[1, 16], [75, 114]]],
  ['core4/runtime/owner-maintenance.js', [[52, 94], [97, 139]]],
  ['core4/runtime/stopped-certification.js', [[125, 168], [170, 222]]],
  ['core4/runtime/install-lease.js', [[122, 143]]],
  ['core4/tools/stopped-update.js', [[476, 545]]],
  ['core4/tools/standalone-installer.js', [[1, 16], [74, 83]]]
];
const context = ['# Allowlisted source excerpts', '', 'Классификация: INTERNAL source. Только выбранные строки; неприведённый код не заявляется внешне проверенным.', 'Source base: `' + baseCommit + '`; все приведённые source bytes сверены с Git base.', ''];
const sourceIndex = [];
for (const [relative, ranges] of selections) {
  const bytes = fs.readFileSync(path.join(root, relative));
  const committed = cp.execFileSync('git', ['show', baseCommit + ':' + relative], { cwd: root, maxBuffer: 1024 * 1024 });
  if (!bytes.equals(committed)) throw Error('source_not_base:' + relative);
  const lines = bytes.toString('utf8').split(/\r?\n/), fullHash = hash(bytes);
  sourceIndex.push({ path: relative, baseCommit, sha256: fullHash, ranges });
  context.push('## ' + relative, '', 'Полный file SHA-256: `' + fullHash + '`.', '');
  for (const [first, last] of ranges) {
    if (first < 1 || last > lines.length) throw Error('excerpt_bounds');
    context.push('Строки ' + first + '–' + last + ':', '', '```javascript');
    for (let n = first; n <= last; n++) context.push(lines[n - 1].length ? n + ': ' + lines[n - 1] : n + ':');
    context.push('```', '');
  }
}
const planBytes = fs.readFileSync(path.join(root, planPath));
// Replace local process observations by logical labels in external plan copy.
let externalPlan = planBytes.toString('utf8').replace(/owner6716/g, 'current owner').replace(/AE26308/g, 'current AE').replace(/AE6492/g, 'historical AE');
externalPlan += '\nВнешняя копия заменяет только локальные PID labels. Source plan SHA-256: `' + hash(planBytes) + '`. Это privacy summarization; runtime state/receipts не приложены.\n';
fs.writeFileSync(path.join(__dirname, 'source-excerpts.md'), context.join('\n').trimEnd() + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(__dirname, 'plan.md'), externalPlan, { flag: 'wx' });
fs.writeFileSync(path.join(__dirname, 'source-index.json'), JSON.stringify(sourceIndex, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ baseCommit, planPath, planDigest: hash(planBytes), sourceFiles: sourceIndex.length, sourceLines: selections.flatMap(([, ranges]) => ranges).reduce((n, [a, b]) => n + b - a + 1, 0), excerptBytes: Buffer.byteLength(context.join('\n') + '\n') }));
