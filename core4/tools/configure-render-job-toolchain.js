'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { hostname } = require('node:os');
const { canonical, fail, hash } = require('../protocol/json');
const { plainPath, samePath } = require('../runtime/project-file');
const { verifyInstallation } = require('../runtime/installation');

const executables = { engine: 'aerender.exe', ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' };

function installationPath(file, directory = false) {
  const logical = fs.lstatSync(file, { bigint: true });
  const physical = plainPath(fs.realpathSync.native(file), directory);
  if (logical.isSymbolicLink() || !samePath(fs.realpathSync(file), file) ||
      logical.dev !== physical.info.dev || logical.ino !== physical.info.ino) fail('render_job_toolchain_installation');
  return physical.resolved;
}

async function main([descriptor, expectedPackageHash, witness, ...extra]) {
  if (process.platform !== 'win32' || extra.length || !descriptor || !/^[a-f0-9]{64}$/.test(expectedPackageHash || '') || !witness) fail('render_job_toolchain_usage');
  const before = fs.readFileSync(installationPath(descriptor));
  const d = verifyInstallation(descriptor);
  if (d.packageHash !== expectedPackageHash || d.machineId !== hostname()) fail('render_job_toolchain_installation');
  const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  if (hash(manifest) !== expectedPackageHash || !require('../runtime/stdio-entry').deriveComposition(manifest,
    file => fs.readFileSync(path.join(d.releaseDir, file))).renderJobs) fail('render_job_toolchain_installation');
  const source = plainPath(witness);
  if (source.info.size > 16384n) fail('render_job_toolchain_witness');
  const data = JSON.parse(fs.readFileSync(source.resolved, 'utf8'));
  if (!data || Object.keys(data).sort().join(',') !== 'engine,ffmpeg,ffprobe') fail('render_job_toolchain_witness');
  for (const [key, executable] of Object.entries(executables)) {
    const value = data[key];
    if (!value || Object.keys(value).sort().join(',') !== 'path,sha256' || typeof value.path !== 'string' ||
        path.basename(value.path).toLowerCase() !== executable || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) fail('render_job_toolchain_witness');
    const file = plainPath(value.path);
    if (file.info.size < 1n || file.info.size > 512n * 1024n * 1024n) fail('render_job_toolchain_witness');
    const digest = createHash('sha256');
    for await (const chunk of fs.createReadStream(file.resolved)) digest.update(chunk);
    const current = plainPath(file.resolved).info;
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(field => current[field] !== file.info[field]) || digest.digest('hex') !== value.sha256) fail('render_job_toolchain_changed');
  }
  const state = installationPath(d.stateDir, true);
  if (!fs.readFileSync(installationPath(descriptor)).equals(before)) fail('render_job_toolchain_installation_changed');
  const target = path.join(state, 'render-job-toolchain.json');
  const fd = fs.openSync(target, 'wx', 0o600);
  try { fs.writeFileSync(fd, canonical(data)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  console.log(JSON.stringify({ configured: true, packageHash: d.packageHash, toolchainHash: hash(data) }));
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.code || 'render_job_toolchain_failed'); process.exitCode = 1; });
