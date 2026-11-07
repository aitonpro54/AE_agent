'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { compile, prepareBuild, prepareRender } = require('./compiler');

function digest(file) {
  const stat = fs.lstatSync(file);
  if (!path.isAbsolute(file) || path.resolve(file) !== file || fs.realpathSync(file) !== file ||
      !stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 128 * 1024 * 1024) throw new Error('slideshow_file_scope');
  const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const after = fs.lstatSync(file);
  if (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => stat[key] !== after[key])) throw new Error('slideshow_file_changed');
  return { hash, stat };
}
function verifyFiles(job, initial) {
  compile(job);
  const original = digest(job.template.file), working = digest(job.project.file);
  if (original.hash !== job.template.sha256 ||
      (working.stat.dev === original.stat.dev && working.stat.ino === original.stat.ino) ||
      (initial && working.hash !== original.hash)) throw new Error('slideshow_template_copy');
  const photos = job.photos.map(photo => {
    const { hash } = digest(photo.file);
    if (hash !== photo.sha256) throw new Error('slideshow_photo_hash');
    return { sourceId: photo.sourceId, sha256: hash };
  });
  return { templateSha256: original.hash, workingSha256: working.hash, photos };
}
function json(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 256 * 1024) throw new Error('slideshow_json_budget');
  return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
}
function main(args) {
  const [command, jobPath, evidencePath, mode] = args;
  if (args.length < 2 || args.length > 4) throw new Error('slideshow_usage');
  const job = json(jobPath);
  if (args.length === 2 && command === 'compile') return compile(job);
  if (args.length === 2 && ['verify-initial', 'verify-files'].includes(command)) return verifyFiles(job, command === 'verify-initial');
  if (args.length === 3 && command === 'prepare-build') return prepareBuild(job, json(evidencePath));
  if (args.length === 4 && command === 'prepare-render') return prepareRender(job, json(evidencePath), mode);
  throw new Error('slideshow_usage');
}
if (require.main === module) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
}
module.exports = { verifyFiles };
