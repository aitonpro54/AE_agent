'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { hash } = require('../core4/protocol/json');
const { matrix } = require('./core-followup-matrix.cjs');

const repo = path.resolve(__dirname, '..');
const entries = [
  ['titles-tests','products/titles',['node','--test']],
  ['slideshow-tests','products/slideshow',['node','--test']],
  ['boundaries','core4',['node','tools/check-boundaries.js']]
];
function supplementalInventory() {
  const { files } = require('../core4/tools/check-boundaries');
  return entries.map(([check,cwd,command]) => {
    const roots = check === 'titles-tests' ? [cwd,'core4'] : [cwd];
    const closure = roots.flatMap(root => files(path.join(repo,root))).sort();
    return { check,cwd,command,status:'pending-current',dependencyDigest:hash(closure.map(f =>
      [path.relative(repo,f).replaceAll('\\','/'),hash(fs.readFileSync(f))])) };
  });
}

async function run(output, decoder, selected = []) {
  assert.equal(os.hostname(), 'MSI');
  const plan = matrix();
  fs.mkdirSync(output);
  const supplemental = supplementalInventory();
  const inventory = [...plan.checks, ...supplemental];
  for (const id of selected) assert.ok(inventory.some(entry => entry.check === id), 'Неизвестная проверка: ' + id);
  const checks = selected.length ? inventory.filter(entry => selected.includes(entry.check)) : inventory;
  const report = { schemaVersion:1, baseline:plan.baseline, registry:plan.registry, machine:os.hostname(), node:process.version,
    decoder:{ directory:decoder, ffmpegSha256:hash(fs.readFileSync(path.join(decoder,'ffmpeg.exe'))),
      ffprobeSha256:hash(fs.readFileSync(path.join(decoder,'ffprobe.exe'))) }, checks };
  const save = () => fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
  save();
  // Keep expensive process/IPC tests off the same suite file; each child gets private profiles.
  const pending = checks.filter(x => x.status === 'pending-current'), running = new Set();
  async function execute(entry) {
    assert.equal(entry.command[0], 'node');
    const own = path.join(output,entry.check), started = new Date().toISOString();
    fs.mkdirSync(own);
    const local = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'core4-followup-check-'));
    for (const dir of ['temp','roaming','local']) fs.mkdirSync(path.join(local,dir));
    const env = { ...process.env, TEMP:path.join(local,'temp'), TMP:path.join(local,'temp'),
      APPDATA:path.join(local,'roaming'), LOCALAPPDATA:path.join(local,'local'), CORE4_VISUAL_DECODER_DIR:decoder };
    for (const variable of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT']) delete env[variable];
    entry.environment = { platform:process.platform, node:process.version, temp:local, profiles:'isolated', decoder:entry.check==='visual-review' ? report.decoder : null };
    const log = path.join(own,'output.log'), fd = fs.openSync(log,'wx');
    let outcome;
    try {
      const child = spawn(process.execPath,entry.command.slice(1),{ cwd:path.join(repo,entry.cwd), env, windowsHide:true,
        stdio:['ignore',fd,fd] });
      entry.pid = child.pid; entry.started = started; save();
      outcome = await new Promise(resolve => {
        child.on('error', error => resolve({ error:error.message }));
        child.on('close',(exitCode,signal) => resolve({ exitCode,signal }));
      });
    } finally { fs.closeSync(fd); }
    const content = fs.readFileSync(log), printed = content.toString('utf8');
    const count = name => Number(printed.match(new RegExp('^[ℹ#] ' + name + ' (\\d+)', 'm'))?.[1] ?? 0);
    entry.result = { ...outcome, pass:count('pass'), fail:count('fail'), skipped:count('skipped') };
    entry.finished = new Date().toISOString();
    entry.status = outcome.exitCode === 0 && (entry.check === 'boundaries' || entry.result.pass > 0) ? 'fresh-pass' : 'failed-or-empty';
    entry.evidence = { log, sha256:hash(content) };
    save();
    console.log(JSON.stringify({ check:entry.check, status:entry.status, result:entry.result }));
  }
  await Promise.all(Array.from({ length:3 },async () => {
    while (pending.length) {
      const key = entry => entry.cwd + '/' + entry.command.at(-1);
      const index = pending.findIndex(entry => !running.has(key(entry)));
      if (index < 0) { await new Promise(resolve => setTimeout(resolve,250)); continue; }
      const [entry] = pending.splice(index,1);
      running.add(key(entry));
      try { await execute(entry); } finally { running.delete(key(entry)); }
    }
  }));
  const count = status => checks.filter(row => row.status === status).length;
  report.summary = { fresh:count('fresh-pass'), reuse:count('reuse-exact-key'), failed:count('failed-or-empty'), pending:count('pending-current') };
  save();
  console.log(JSON.stringify(report.summary));
  if (report.summary.failed) process.exitCode = 1;
}

if (require.main === module) {
  if (process.argv.length < 4) throw Error('Укажите новый каталог отчёта и каталог FFmpeg/FFprobe. Можно перечислить ID нужных проверок.');
  run(path.resolve(process.argv[2]),path.resolve(process.argv[3]),process.argv.slice(4)).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { supplementalInventory };
