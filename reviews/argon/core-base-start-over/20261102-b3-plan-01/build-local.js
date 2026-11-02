'use strict';
// Local packaging only; never part of the external allowlist.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../..'), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const request = fs.readFileSync(path.join(__dirname, 'request.md'));
const plan = fs.readFileSync(path.join(root, 'docs/core-base-b3-20261102.md'));
fs.mkdirSync(path.join(__dirname, 'context'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'context/plan.md'), plan, { flag: 'wx' });
const ranges = [
  ['core4/runtime/attachment-owner.js', [[9, 33], [101, 145]]],
  ['core4/runtime/stdio-entry.js', [[174, 230], [276, 310]]],
  ['core4/runtime/owner-maintenance.js', [[97, 129]]],
  ['core4/runtime/owner-lifecycle.js', [[469, 488]]],
  ['core4/integrations/cep/http-peer.js', [[25, 36], [87, 110], [135, 175]]],
  ['core4/core/broker.js', [[390, 402], [477, 488]]],
  ['core4/cep/js/poll-dispatcher.js', [[10, 44]]]
];
const sourceSnapshot = [], sections = [];
for (const [file, selected] of ranges) {
  const bytes = fs.readFileSync(path.join(root, file)), lines = bytes.toString('utf8').split(/\r?\n/), digest = sha(bytes);
  const actualRanges = selected.filter(([start]) => start <= lines.length).map(([start, end]) => [start, Math.min(end, lines.length)]);
  sourceSnapshot.push({ path: file, sha256: digest, ranges: actualRanges, classification: 'INTERNAL' });
  sections.push('### ' + file + '\n\nFull file SHA-256: ' + digest + '. Dirty source snapshot; base ' + baseCommit + '.\n');
  for (const [start, end] of actualRanges) sections.push('Lines ' + start + '-' + end + ':\n\n```javascript\n' + lines.slice(start - 1, end).map((line, index) => (start + index) + ': ' + line).join('\n') + '\n```\n');
}
const excerpts = Buffer.from('# Ограниченные фрагменты текущего исходного кода\n\nВне перечисленных ranges код не передан. Никаких live state/credentials.\n\n' + sections.join('\n'));
fs.writeFileSync(path.join(__dirname, 'context/source-excerpts.md'), excerpts, { flag: 'wx' });
const bundle = Buffer.from(request.toString('utf8') + '\n\n# Точный контракт B3\n\n' + plan.toString('utf8') + '\n\n' + excerpts.toString('utf8'));
const forbidden = [/C:[\\/]+Users[\\/]+Ant/i, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, /(?:panelToken|controlToken|password|apiKey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bsk-[A-Za-z0-9_-]{20,}/];
if (forbidden.some(pattern => pattern.test(bundle.toString('utf8')))) throw Error('content_scan_refused');
fs.writeFileSync(path.join(__dirname, 'bundle.md'), bundle, { flag: 'wx' });
const files = ['request.md', 'context/plan.md', 'context/source-excerpts.md', 'bundle.md'].map(file => { const bytes = fs.readFileSync(path.join(__dirname, file)); return { path: file, bytes: bytes.length, sha256: sha(bytes), classification: 'INTERNAL source/plan, no runtime state' }; });
const manifest = { status: 'COMPLETE', stageId: 'core-base-start-over', reviewId: '20261102-b3-plan-01', type: 'plan', baseCommit, targetCommit: null, planDigest: sha(plan), requestDigest: sha(request), files, sourceSnapshot,
  externalAllowlist: ['bundle.md'], recipient: 'Argon via existing sole ARGON_BrowserUse controller; existing selected account and maximum available effort',
  exclusions: ['credentials and token values', 'runtime/browser/auth state', 'AEP/assets', 'full logs', 'private absolute paths and account identifiers', 'unlisted source ranges', 'local builder and approval records'],
  limitations: ['bounded plan review; not full code audit', 'B3 implementation and native/reset/installed evidence do not yet exist', 'B1 validation still in progress; B2 offline evidence only', 'dirty source snippets are individually SHA-256 bound; no claim of committed implementation'],
  builder: 'Node builtins used because bundled Python builder is unavailable in this host environment; exact allowlist and full output content scan/read-back applied',
  workingTree: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim() };
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'); fs.writeFileSync(path.join(__dirname, 'manifest.json'), manifestBytes, { flag: 'wx' });
const externalPrompt = 'Проведи одно ограниченное ревью плана из приложенного bundle.md. review_id=20261102-b3-plan-01; stage_id=core-base-start-over; type=plan; base_commit=' + baseCommit + '; plan_sha256=' + sha(plan) + '; request_sha256=' + sha(request) + '; bundle_sha256=' + sha(bundle) + '; manifest_sha256=' + sha(manifestBytes) + '. Ответь по-русски на пять вопросов запроса. Фрагменты исходников ограничены указанными ranges; неподтверждённые места пометь гипотезами. Дай verdict и конкретные минимальные исправления/проверки. Это не разрешение исполнения или повод для второго ревью.';
const approval = { reviewId: manifest.reviewId, sourceThreadId: '01a19c6c-1e7d-7751-93cc-cb38dadb85ab', sourceUserMessageId: '01a19c83-20eb-7df0-87d9-0c67f1896214', authorization: 'К Аргуну, кстати, тоже там обращайся, когда того требуют ревью стороннее, например.', authorizationScope: 'First bounded review of new independent B3 stage under current human instruction and standing mandate. No automatic result/fix/final review or retry.', requestSha256: sha(request), payloadSha256: sha(bundle), manifestSha256: sha(manifestBytes), externalPrompt, createdAt: new Date().toISOString() };
fs.writeFileSync(path.join(__dirname, 'approval.json'), JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' });
for (const entry of files) { const value = fs.readFileSync(path.join(__dirname, entry.path)); if (sha(value) !== entry.sha256 || value.length !== entry.bytes) throw Error('readback_failed'); }
console.log(JSON.stringify({ files, manifestSha256: sha(manifestBytes), planDigest: sha(plan), externalPrompt }, null, 2));
