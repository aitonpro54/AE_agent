'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { canonical, hash, fail } = require('../protocol/json');

const FIELDS = ['version', 'project', 'projectSha256', 'source', 'sourceSha256', 'preset', 'presetSha256', 'output', 'target', 'build'];
const MAX_BYTES = 128 * 1024 * 1024;

function plainPath(file, extension) {
  if (typeof file !== 'string' || file.length > 2048 || !path.isAbsolute(file) || path.resolve(file) !== file ||
      path.extname(file).toLowerCase() !== extension || /[\x00-\x1f\x7f]/.test(file)) fail('ame_file_path');
}

function plainFile(file, limit = MAX_BYTES) {
  const before = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!before?.isFile() || before.isSymbolicLink() || fs.realpathSync(file) !== file || before.size < 1 || before.size > limit) fail('ame_file_scope');
  const bytes = fs.readFileSync(file);
  const after = fs.lstatSync(file);
  if (bytes.length !== before.size || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => before[key] !== after[key])) fail('ame_file_changed');
  return bytes;
}

function compile(job) {
  if (!job || Object.getPrototypeOf(job) !== Object.prototype || !FIELDS.every(field => Object.hasOwn(job, field)) ||
      Object.keys(job).length !== FIELDS.length || job.version !== 1 || typeof job.target !== 'string' ||
      !/^ame-[0-9]{1,3}\.[0-9]{1,3}$/.test(job.target) || typeof job.build !== 'string' || !/^[0-9]{1,7}$/.test(job.build)) fail('ame_job');
  plainPath(job.project, '.aep');
  plainPath(job.source, '.mp4');
  plainPath(job.output, '.mp4');
  plainPath(job.preset, '.epr');
  const directory = path.dirname(job.output);
  if (path.dirname(job.source) !== directory || path.dirname(directory) !== path.dirname(job.project) ||
      job.source.toLowerCase() === job.output.toLowerCase() || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.mp4$/.test(path.basename(job.output)) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(path.basename(job.output)) ||
      fs.realpathSync(directory) !== directory) fail('ame_output_scope');
  for (const key of ['project', 'source', 'preset']) {
    const bytes = plainFile(job[key]);
    if (hash(bytes) !== job[key + 'Sha256']) fail('ame_input_hash');
  }
  return { binding: hash(job), receiptBase: job.output + '.core4-ame' };
}

function plan(job) {
  const compiled = compile(job);
  const reserved = [job.output, ...['dispatch', 'intent', 'submitted', 'terminal', 'delivery-error'].map(stage => compiled.receiptBase + '.' + stage + '.json')];
  if (reserved.some(file => fs.lstatSync(file, { throwIfNoEntry: false }))) fail('ame_output_already_reserved');
  return { state: 'isolated-queue-required', dispatch: false, binding: compiled.binding, source: job.source,
    preset: job.preset, presetSha256: job.presetSha256, output: job.output };
}

function read(job) {
  const compiled = compile(job);
  function receipt(stage) {
    const file = compiled.receiptBase + '.' + stage + '.json';
    if (!fs.lstatSync(file, { throwIfNoEntry: false })) return null;
    const value = JSON.parse(plainFile(file, 16384).toString('utf8').replace(/^\uFEFF/, ''));
    if (value.stage !== stage || value.binding !== compiled.binding || !value.value) fail('ame_receipt_binding');
    return value.value;
  }
  const dispatch = receipt('dispatch'), intent = receipt('intent'), submission = receipt('submitted'), terminal = receipt('terminal');
  const error = receipt('delivery-error');
  if (!submission && !terminal) return { state: dispatch ? 'pending-or-unknown' : 'not-dispatched', binding: compiled.binding, intent, submission, error };
  if (error || dispatch?.target !== job.target || !intent || !submission ||
      ['source', 'preset', 'output', 'target', 'build'].some(key => intent[key] !== job[key]) ||
      submission.method !== 'exportItem' || typeof submission.encodeId !== 'string' || !submission.encodeId) fail('ame_receipt_binding');
  if (!terminal) return { state: 'submission-observed', binding: compiled.binding, intent, submission };
  if (submission.encodeId !== terminal.encodeId) fail('ame_receipt_binding');
  if (terminal.result !== 'Done!') return { state: 'native-failed', binding: compiled.binding, terminal };
  if (canonical(terminal.outputs) !== canonical([job.output])) fail('ame_output_binding');
  const bytes = plainFile(job.output);
  return { state: 'done', binding: compiled.binding, preset: job.preset, presetSha256: job.presetSha256,
    output: job.output, bytes: bytes.length, sha256: hash(bytes), terminal };
}

if (require.main === module) {
  try {
    const [action, jobFile, ...extra] = process.argv.slice(2);
    if (!['plan', 'read'].includes(action) || !jobFile || extra.length) fail('ame_usage');
    const file = path.resolve(jobFile);
    const job = JSON.parse(plainFile(file, 16384).toString('utf8'));
    process.stdout.write(canonical((action === 'plan' ? plan : read)(job)) + '\n');
  } catch (error) { process.stderr.write(JSON.stringify({ error: error.code || 'ame_export_refused' }) + '\n'); process.exitCode = 1; }
}
module.exports = { plan, read };
