#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { compile, prepareBuild, MAX_BYTES } = require('./src/compiler');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function read(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) fail('file_budget_or_type');
    const bytes = Buffer.alloc(MAX_BYTES + 1); let total = 0, count;
    do { count = fs.readSync(fd, bytes, total, bytes.length - total, null); total += count; } while (count && total < bytes.length);
    if (total > MAX_BYTES) fail('file_budget_or_type');
    const data = bytes.subarray(0, total).toString('utf8');
    if (!Buffer.from(data).equals(bytes.subarray(0, total))) fail('invalid_utf8');
    return JSON.parse(data);
  } finally { fs.closeSync(fd); }
}
function main(args) {
  const [command, ...rest] = args;
  const names = command === 'compile' ? ['--job'] : command === 'prepare-build' ? ['--job', '--contract', '--inspection'] : null;
  if (!names || rest.length !== names.length * 2) fail('usage');
  const options = new Map();
  for (let i = 0; i < rest.length; i += 2) {
    if (!names.includes(rest[i]) || options.has(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith('--')) fail('usage');
    options.set(rest[i], rest[i + 1]);
  }
  const job = read(options.get('--job'));
  return command === 'compile' ? compile(job) : prepareBuild(job, read(options.get('--contract')), read(options.get('--inspection')));
}
if (require.main === module) {
  try { const output = JSON.stringify(main(process.argv.slice(2))); if (Buffer.byteLength(output) > MAX_BYTES) fail('output_budget'); process.stdout.write(output + '\n'); }
  catch (error) { process.stderr.write(JSON.stringify({ error: error.code || 'invalid_json_or_input' }) + '\n'); process.exitCode = 1; }
}
module.exports = { main };
