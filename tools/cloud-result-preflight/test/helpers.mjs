import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, lstat, readlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preflight } from '../preflight.mjs';
import { gitEnvironment } from '../git.mjs';

export const branch = 'AE-Agent-Core-4.0.1';
export const origin = 'https://github.com/aitonpro54/AE_agent.git';
export const identity = 'github.com/aitonpro54/AE_agent';
export const env = {
  ...gitEnvironment(), GIT_AUTHOR_NAME: 'Preflight fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Preflight fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_AUTHOR_DATE: '2026-11-03T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-03T00:00:00Z',
};

export function git(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], {
    cwd, env, shell: false, encoding: 'utf8', timeout: 30_000, windowsHide: true,
  });
  assert.equal(result.status, 0, `Fixture Git ${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
}

export async function digest(filename) {
  return createHash('sha256').update(await readFile(filename)).digest('hex');
}

// Проверяем все файлы цели, включая .git, индекс, config, refs, reflogs и ODB.
// atime исключён: чтение может изменить его на уровне файловой системы.
export async function snapshot(root) {
  const entries = [];
  async function walk(relative) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute, { bigint: true });
    const kind = info.isSymbolicLink() ? 'link' : info.isDirectory() ? 'dir' : 'file';
    entries.push([relative, kind, info.mode.toString(), info.mtimeNs.toString(),
      kind === 'file' ? await digest(absolute) : kind === 'link' ? await readlink(absolute) : null]);
    if (kind === 'dir') for (const name of (await readdir(absolute)).sort()) await walk(path.join(relative, name));
  }
  await walk('');
  return entries;
}

export async function fixture(t, { full = false, objectFormat = 'sha1' } = {}) {
  const temporaryRoot = await realpath(os.tmpdir());
  const prefix = 'preflight пробелы Юникод-';
  const root = await mkdtemp(path.join(temporaryRoot, prefix));
  t.after(async () => {
    const resolved = await realpath(root);
    assert.equal(resolved, root, 'Fixture root изменил canonical path; cleanup запрещён');
    assert.equal(path.dirname(resolved), temporaryRoot, 'Fixture вне ожидаемого temp root; cleanup запрещён');
    assert.ok(path.basename(resolved).startsWith(prefix), 'Неизвестный fixture path; cleanup запрещён');
    await rm(resolved, { recursive: true, force: true });
  });
  const seed = path.join(root, 'исходный репозиторий');
  const cloud = path.join(root, 'облачный результат');
  const target = path.join(root, 'локальный AE Core');
  const bundle = path.join(root, 'входящий результат.bundle');
  const manifest = path.join(root, 'манифест.json');
  await mkdir(seed);
  git(seed, 'init', '--object-format=' + objectFormat, '-b', branch);
  await writeFile(path.join(seed, 'base.txt'), 'исходный файл\n');
  git(seed, 'add', '--', 'base.txt');
  git(seed, 'commit', '-m', 'initial');
  const initial = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'commit', '--allow-empty', '-m', 'base');
  const base = git(seed, 'rev-parse', 'HEAD');
  git(root, 'clone', '--no-hardlinks', '--', seed, target);
  git(root, 'clone', '--no-hardlinks', '--', seed, cloud);
  git(target, 'remote', 'set-url', 'origin', origin);
  git(cloud, 'remote', 'set-url', 'origin', origin);
  await writeFile(path.join(cloud, 'result.txt'), 'облачный результат\n');
  git(cloud, 'add', '--', 'result.txt');
  git(cloud, 'commit', '-m', 'result');
  const result = git(cloud, 'rev-parse', 'HEAD');
  git(cloud, 'bundle', 'create', bundle, 'refs/heads/' + branch, ...(full ? [] : ['^' + base]));
  const data = {
    schemaVersion: 1, repository: { identity, origin }, sourceBranch: branch,
    baseCommit: base, resultCommit: result, refs: [{ name: 'refs/heads/' + branch, commit: result }],
  };
  await writeFile(manifest, JSON.stringify(data));
  return { root, seed, cloud, target, bundle, manifest, data, base, result, initial };
}

export async function run(f, overrides = {}) {
  const options = { bundle: f.bundle, sha256: await digest(f.bundle), manifest: f.manifest, target: f.target, ...overrides };
  const before = await snapshot(f.target);
  const report = await preflight(options);
  assert.deepEqual(await snapshot(f.target), before, 'Целевой репозиторий изменился после preflight');
  assert.equal(report.integrationAllowed, false);
  return report;
}
