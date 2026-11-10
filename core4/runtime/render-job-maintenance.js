'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');
const { createHistory, jobHash, processRows, nativeRenderers, renderArgs } = require('./render-job-history');

const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{64}$/;
const toolNames = ['engine', 'ffmpeg', 'ffprobe'];
const observations = ['launcher.json', 'worker.json', 'start-intent.json', 'engine.json', 'engine-exit.json', 'renderer.json'];
const records = new Set(['prepare-intent.json', 'prepared.json', 'dispatch.json', ...observations,
  'terminal.json', 'reconciled.json', 'cancel-request.json', 'cancelled.json', 'publish-intent.json',
  'published.json', 'aerender.log', 'console.log']);
const stamp = stat => Object.fromEntries(['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs', 'nlink'].map(k => [k, String(stat[k])]));
const same = (a, b) => canonical(a) === canonical(b);
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const exists = file => fs.lstatSync(file, { throwIfNoEntry: false });
function fact(ok, code = 'render_job_maintenance_unverifiable') { if (!ok) fail(code); }
function plain(file, dir) {
  const stat = fs.lstatSync(file, { bigint: true });
  fact(!stat.isSymbolicLink() && !stat.reparsePoint && samePath(fs.realpathSync.native(file), file) &&
    (dir ? stat.isDirectory() : stat.isFile() && stat.nlink === 1n));
  return stamp(stat);
}
function read(file, limit, keepBytes = true) {
  const stat = plain(file, false);
  fact(Number(stat.size) <= limit);
  const fd = fs.openSync(file, 'r');
  try {
    fact(same(stat, stamp(fs.fstatSync(fd, { bigint: true }))));
    const bytes = Buffer.alloc(keepBytes ? Number(stat.size) : Math.min(Number(stat.size), 1024 * 1024));
    const digest = createHash('sha256');
    for (let offset = 0, size = Number(stat.size); offset < size;) {
      const n = fs.readSync(fd, bytes, keepBytes ? offset : 0, Math.min(bytes.length, size - offset), offset);
      fact(n > 0); digest.update(keepBytes ? bytes.subarray(offset, offset + n) : bytes.subarray(0, n)); offset += n;
    }
    fact(same(stat, stamp(fs.fstatSync(fd, { bigint: true }))) && same(stat, plain(file, false)));
    return { stat, hash: digest.digest('hex'), ...(keepBytes && { bytes }) };
  } finally { fs.closeSync(fd); }
}
function parse(view) {
  const text = view.bytes.toString('utf8');
  fact(Buffer.from(text).equals(view.bytes));
  const data = JSON.parse(text);
  fact(data && Object.getPrototypeOf(data) === Object.prototype);
  return data;
}
const verifiedTools = new Map();
function toolchainSnapshot(stateDir) {
  const file = path.join(stateDir, 'render-job-toolchain.json');
  if (!exists(file)) return null;
  const view = read(file, 16384), configured = parse(view);
  fact(same(Object.keys(configured).sort(), toolNames));
  const tools = Object.fromEntries(toolNames.map(name => {
    const tool = configured[name], target = tool?.path;
    fact(tool && same(Object.keys(tool).sort(), ['path', 'sha256']) && typeof target === 'string' &&
      path.isAbsolute(target) && path.resolve(target) === target && sha.test(tool.sha256));
    const stat = plain(target, false), cached = verifiedTools.get(target);
    if (!cached || cached.hash !== tool.sha256 || !same(stat, cached.stat)) {
      const actual = read(target, 512 * 1024 * 1024, false);
      fact(actual.hash === tool.sha256 && same(stat, actual.stat), 'render_job_maintenance_toolchain_changed');
      if (verifiedTools.size >= 32) verifiedTools.clear();
      verifiedTools.set(target, actual);
    }
    return [name, { path: target, hash: tool.sha256, stat }];
  }));
  return { hash: view.hash, stat: view.stat, tools };
}

function ownedJob(job, intent, id, installationId) {
  const a = intent?.authorization;
  fact(a && intent.id === id && typeof a.installationId === 'string' && (!installationId || a.installationId === installationId) &&
    typeof a.taskId === 'string' && a.taskId.startsWith('task-') && idPattern.test(a.taskId.slice(5)) &&
    typeof a.commandId === 'string' && a.commandId.startsWith('command-') && idPattern.test(a.commandId.slice(8)) &&
    sha.test(a.stageHash) && same(a, job.authorization));
  const hex = hash(['ae-core4/render-job/v1', a.installationId, a.commandId]);
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  fact(id === [hex.slice(0,8), hex.slice(8,12), '8' + hex.slice(13,16),
    variant + hex.slice(17,20), hex.slice(20,32)].join('-'));
  const { engine, ffmpeg, ffprobe, ...staged } = job.spec;
  fact(hash(staged) === a.stageHash && Number.isFinite(Date.parse(job.createdAt)) &&
    path.isAbsolute(staged.project.path) && path.isAbsolute(staged.output) &&
    job.working === path.join(path.dirname(staged.project.path), 'core4-render-' + id + '.aep') &&
    job.partial === path.join(path.dirname(staged.output), 'core4-render-' + id + '.partial.mp4') &&
    [engine, ffmpeg, ffprobe].every(tool => tool && path.isAbsolute(tool.path) && sha.test(tool.sha256)));
}

function inspectRenderJobs(stateDir, { installationId, probe = processRows } = {}) {
  try {
    if (!exists(stateDir)) return null;
    const logical = plainStateDirectory(stateDir);
    stateDir = fs.realpathSync.native(stateDir);
    fact(same(logical, plain(stateDir, true)));
    const root = path.join(stateDir, 'render-jobs-v1');
    const rootStat = exists(root) ? plain(root, true) : null;
    const tree = {}, entries = new Map(), jobs = [];
    if (rootStat) {
      fact(!exists(path.join(root, 'active.json')), 'render_job_maintenance_unsettled');
      const ids = fs.readdirSync(root).sort();
      fact(ids.length <= 4096);
      for (const id of ids) {
        fact(idPattern.test(id));
        const dir = path.join(root, id), stat = plain(dir, true), names = fs.readdirSync(dir).sort();
        fact(names.includes('prepared.json'), 'render_job_maintenance_unsettled');
        fact(names.every(name => records.has(name)));
        const files = Object.fromEntries(names.map(name => {
          const filename = path.join(dir, name), json = name.endsWith('.json');
          const { bytes, ...view } = read(filename, json ? 1024 * 1024 : 16 * 1024 * 1024, json);
          if (json) entries.set(filename, parse({ bytes }));
          return [name, view];
        }));
        fact(same(stat, plain(dir, true)));
        tree[id] = { stat, files }; jobs.push({ id, names });
      }
      fact(same(rootStat, plain(root, true)));
    }
    let processes;
    const loadProcesses = () => {
      if (!processes) {
        const clauses = new Set(["Name='AfterFX.exe'", "Name='AfterFX.com'", "Name='aerender.exe'"]);
        for (const item of jobs) {
          const dir = path.join(root, item.id), dispatch = entries.get(path.join(dir, 'dispatch.json'));
          if (!dispatch) continue;
          for (const expected of [dispatch.starter, ...observations.map(name => entries.get(path.join(dir, name))?.process)]) {
            if (!expected) continue;
            fact(Number.isSafeInteger(expected.pid) && expected.pid > 0 && expected.pid <= 0xffffffff);
            clauses.add('ProcessId=' + expected.pid); clauses.add('ParentProcessId=' + expected.pid);
          }
        }
        const filters = [...clauses], rows = new Map();
        for (let n = 0; n < filters.length; n += 80) {
          for (const row of probe(filters.slice(n, n + 80).join(' OR '))) {
            if (rows.has(row.pid)) fact(same(rows.get(row.pid), row));
            rows.set(row.pid, row);
          }
        }
        processes = [...rows.values()];
      }
      return processes;
    };
    const listRenderers = () => loadProcesses().filter(row => /AfterFX\.(exe|com)$/i.test(row.exe || ''));
    const h = createHistory({ root, identity: pid => loadProcesses().find(row => row.pid === pid),
      listRenderers, workerEntry: null, record: file => entries.get(file) ?? null,
      present: file => entries.has(file), checkDirectory: () => {} });
    for (const { id, names } of jobs) {
      const job = h.get(id);
      ownedJob(job, entries.get(h.file(id, 'prepare-intent.json')), id, installationId);
      const dispatch = h.bound(job, 'dispatch.json'), terminal = h.bound(job, 'terminal.json');
      const reconciled = h.bound(job, 'reconciled.json'), end = h.settled(job, terminal);
      fact(!reconciled || reconciled.state === 'verified' && (!terminal || terminal.state === 'unknown'));
      const { request, receipt } = h.cancellation(job, dispatch);
      const published = h.bound(job, 'published.json');
      const publishing = names.includes('publish-intent.json');
      fact(receipt || published || end?.state === 'failed', 'render_job_maintenance_unsettled');
      if (!dispatch) {
        fact(receipt && !request && !terminal && !reconciled && !published && !publishing &&
          !observations.some(name => names.includes(name)));
        continue;
      }
      // Owner jobs record the original script path; a replacement package may
      // have a different release directory. Never rebind to the current script.
      fact(dispatch.workerEntry);
      const state = h.observe(job, dispatch, false);
      fact(!state.workerAlive && !state.renderAlive, 'render_job_maintenance_unsettled');
      for (const row of loadProcesses()) {
        const cmd = row.commandLine?.toLowerCase();
        if (cmd && [job.working, job.partial].some(file => cmd.includes(file.toLowerCase()) ||
            cmd.includes(file.toLowerCase().replace(/\\/g, '\\\\')))) fail('render_job_maintenance_unsettled');
        if (row.parent === dispatch.starter.pid && cmd?.includes(id) &&
            cmd.includes(dispatch.workerEntry.toLowerCase())) fail('render_job_maintenance_unsettled');
      }
      if (state.intent) {
        fact(state.exit && (Number.isInteger(state.exit.code) || typeof state.exit.signal === 'string') &&
          nativeRenderers(job, state.engine, state.exit, listRenderers).length === 0, 'render_job_maintenance_unsettled');
      } else fact(!names.includes('console.log') && !names.includes('aerender.log'));
      if (receipt) {
        fact(request && !published && !publishing && (state.intent ? terminal?.state !== 'failed' : terminal?.state === 'failed'));
      } else if (published) {
        const intent = h.observed(job, dispatch, 'publish-intent.json');
        fact(!request && state.exit?.code === 0 && state.exit.signal === null && end?.state === 'verified' &&
          intent?.path === job.spec.output && intent.proofHash === jobHash(end) && same(intent.output, end.output) &&
          published.state === 'published' && published.path === intent.path && sha.test(published.sha256) &&
          published.sha256 === end.output.sha256 && published.bytes === end.output.bytes && same(published.media, end.media) &&
          !exists(job.partial), 'render_job_maintenance_unsettled');
      } else fact(!request && !publishing && !state.intent && !exists(job.partial), 'render_job_maintenance_unsettled');
    }
    const toolchain = toolchainSnapshot(stateDir);
    if (rootStat) {
      for (const [id, entry] of Object.entries(tree)) {
        const dir = path.join(root, id);
        fact(same(entry.stat, plain(dir, true)));
        for (const [name, view] of Object.entries(entry.files)) fact(same(view.stat, plain(path.join(dir, name), false)));
      }
      fact(same(rootStat, plain(root, true)));
    } else fact(!exists(root));
    return rootStat || toolchain ? { version: 1, registry: rootStat ? hash({ root: rootStat, tree }) : null, toolchain } : null;
  } catch (error) {
    if (/^render_job_maintenance_/.test(error.code || '')) throw error;
    fail('render_job_maintenance_unverifiable');
  }
}

function plainStateDirectory(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  fact(stat.isDirectory() && !stat.isSymbolicLink() && !stat.reparsePoint &&
    samePath(fs.realpathSync(file), file));
  return stamp(stat);
}

module.exports = { inspectRenderJobs };
