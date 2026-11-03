import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { branch, origin, env, git, digest, snapshot, fixture, run } from './helpers.mjs';
import { InputError, originIdentity, validateManifest } from '../manifest.mjs';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

function status(report, id) {
  const found = report.checks.find(item => item.id === id);
  assert.ok(found, `Нет проверки ${id}`);
  return found.status;
}

test('корректный incremental bundle; пробелы и Unicode; полный снимок цели неизменен', async t => {
  const f = await fixture(t);
  const report = await run(f);
  assert.equal(report.decision, 'manual_review_required');
  assert.equal(report.exitCode, 0);
  for (const id of ['bundle_sha256', 'bundle_pack_checksum', 'git_bundle_verify', 'git_bundle_list_heads',
    'bundle_refs', 'result_commit', 'repository_identity', 'origin', 'target_branch', 'base_commit',
    'head_vs_base', 'working_tree', 'prerequisites', 'bundle_stability', 'target_observation_stability']) {
    assert.equal(status(report, id), 'passed', id);
  }
  assert.deepEqual(report.checks.find(item => item.id === 'prerequisites').required, [f.base]);
  assert.ok(report.unknowns.some(item => item.id === 'base_to_result'));
  assert.ok(report.unknowns.some(item => item.id === 'ae_compatibility'));
  assert.notEqual(spawnSync('git', ['cat-file', '-e', f.result], { cwd: f.target, env }).status, 0, 'Result не должен импортироваться');
});

test('неверный отдельно переданный SHA-256', async t => {
  const report = await run(await fixture(t), { sha256: '0'.repeat(64) });
  assert.equal(report.exitCode, 1);
  assert.equal(status(report, 'bundle_sha256'), 'hash_mismatch');
  assert.equal(status(report, 'git_bundle_verify'), 'unverified');
});

test('повреждённый заголовок bundle при совпадающем внешнем хеше', async t => {
  const f = await fixture(t);
  await writeFile(f.bundle, 'not a git bundle\n');
  const report = await run(f);
  assert.equal(status(report, 'bundle_sha256'), 'passed');
  assert.equal(status(report, 'bundle_header'), 'invalid_bundle');
  assert.equal(report.exitCode, 1);
});

test('повреждение и усечение PACK обнаруживаются без распаковки даже с пересчитанным SHA-256', async t => {
  const f = await fixture(t);
  const original = await readFile(f.bundle);
  const damaged = Buffer.from(original);
  const packStart = damaged.indexOf('\n\n') + 2;
  damaged[packStart + 16] ^= 1;
  await writeFile(f.bundle, damaged);
  let report = await run(f);
  assert.equal(status(report, 'bundle_header'), 'passed');
  assert.equal(status(report, 'bundle_pack_checksum'), 'invalid_bundle');
  assert.equal(report.exitCode, 1);
  await writeFile(f.bundle, original.subarray(0, packStart + 5));
  report = await run(f);
  assert.equal(status(report, 'bundle_pack_checksum'), 'invalid_bundle');
});

test('несовпадающие refs, result SHA и дополнительные refs', async t => {
  const f = await fixture(t);
  f.data.refs[0].name = 'refs/heads/another';
  await writeFile(f.manifest, JSON.stringify(f.data));
  let report = await run(f);
  assert.equal(status(report, 'bundle_refs'), 'refs_mismatch');
  f.data.refs[0].commit = f.base;
  f.data.resultCommit = f.base;
  await writeFile(f.manifest, JSON.stringify(f.data));
  report = await run(f);
  assert.equal(status(report, 'result_commit'), 'result_mismatch');
  f.data.refs = [{ name: 'refs/heads/' + branch, commit: f.result }];
  f.data.resultCommit = f.result;
  await writeFile(f.manifest, JSON.stringify(f.data));
  git(f.cloud, 'branch', 'extra');
  git(f.cloud, 'bundle', 'create', f.bundle, '--branches', '^' + f.base);
  report = await run(f);
  assert.equal(status(report, 'bundle_refs'), 'refs_mismatch');
});

test('чужой repository identity и origin', async t => {
  const f = await fixture(t);
  git(f.target, 'remote', 'set-url', 'origin', 'https://github.com/other/AE_agent.git');
  const report = await run(f);
  assert.equal(status(report, 'repository_identity'), 'repository_mismatch');
  assert.equal(status(report, 'origin'), 'origin_mismatch');
  assert.equal(report.exitCode, 1);
  const foreign = path.join(f.root, 'чужой независимый репозиторий');
  await mkdir(foreign);
  git(foreign, 'init', '-b', branch);
  git(foreign, 'commit', '--allow-empty', '-m', 'foreign root');
  git(foreign, 'remote', 'add', 'origin', 'https://github.com/other/other.git');
  f.target = foreign;
  const foreignReport = await run(f);
  assert.equal(status(foreignReport, 'repository_identity'), 'repository_mismatch');
  assert.equal(status(foreignReport, 'base_commit'), 'missing_base');
});

test('отсутствующая база при полном bundle отделена от prerequisites', async t => {
  const f = await fixture(t, { full: true });
  f.data.baseCommit = '1'.repeat(40);
  await writeFile(f.manifest, JSON.stringify(f.data));
  const report = await run(f);
  assert.equal(status(report, 'base_commit'), 'missing_base');
  assert.equal(status(report, 'prerequisites'), 'passed');
  assert.equal(status(report, 'git_bundle_verify'), 'passed');
  assert.equal(status(report, 'head_vs_base'), 'unverified');
  assert.equal(report.exitCode, 1);
});

test('недоступные prerequisites отдельно от доступной базы', async t => {
  const f = await fixture(t);
  const foreign = path.join(f.root, 'пустой другой репозиторий');
  await mkdir(foreign);
  git(foreign, 'init', '-b', branch);
  git(foreign, 'commit', '--allow-empty', '-m', 'foreign base');
  git(foreign, 'remote', 'add', 'origin', origin);
  f.target = foreign;
  f.data.baseCommit = git(foreign, 'rev-parse', 'HEAD');
  await writeFile(f.manifest, JSON.stringify(f.data));
  const report = await run(f);
  assert.equal(status(report, 'base_commit'), 'passed');
  assert.equal(status(report, 'prerequisites'), 'missing_prerequisites');
  assert.equal(status(report, 'git_bundle_verify'), 'missing_prerequisites');
  assert.deepEqual(report.checks.find(item => item.id === 'prerequisites').missing, [f.base]);
});

test('незакоммиченные, staged и untracked изменения сохраняются', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.target, 'base.txt'), 'локальное изменение\n');
  assert.equal(status(await run(f), 'working_tree'), 'dirty_worktree');
  git(f.target, 'add', '--', 'base.txt');
  await writeFile(path.join(f.target, 'неотслеживаемый.txt'), 'оставить\n');
  const report = await run(f);
  assert.equal(status(report, 'working_tree'), 'dirty_worktree');
  assert.equal(report.exitCode, 1);
});

test('локальные commits впереди базы, отставание и расхождение имеют разные статусы', async t => {
  const f = await fixture(t);
  git(f.target, 'commit', '--allow-empty', '-m', 'local extra');
  assert.equal(status(await run(f), 'head_vs_base'), 'local_ahead');
  // Fixture меняет только ref: все эти commits имеют одинаковое дерево.
  git(f.target, 'update-ref', 'refs/heads/' + branch, f.initial);
  assert.equal(status(await run(f), 'head_vs_base'), 'local_behind');
  const tree = git(f.target, 'rev-parse', f.base + '^{tree}');
  const divergent = git(f.target, 'commit-tree', tree, '-p', f.initial, '-m', 'divergent local');
  git(f.target, 'update-ref', 'refs/heads/' + branch, divergent);
  const report = await run(f);
  assert.equal(status(report, 'head_vs_base'), 'history_diverged');
  assert.equal(status(report, 'working_tree'), 'passed');
});

test('другая ветка и detached HEAD не считаются совпадением базы', async t => {
  const f = await fixture(t);
  git(f.target, 'branch', '-m', 'local-other');
  assert.equal(status(await run(f), 'target_branch'), 'branch_mismatch');
  git(f.target, 'update-ref', '--no-deref', 'HEAD', f.base);
  assert.equal(status(await run(f), 'target_branch'), 'detached_or_unborn');
});

test('origin credentials и query не выводятся; HTTPS и SSH сопоставимы', async t => {
  const f = await fixture(t);
  git(f.target, 'remote', 'set-url', 'origin', 'https://private-user:secret-PASSWORD@github.com/aitonpro54/AE_agent.git?token=secret-TOKEN#secret-FRAGMENT');
  f.data.repository.origin = 'https://manifest-user:manifest-PASSWORD@github.com/aitonpro54/AE_agent.git?token=manifest-TOKEN';
  await writeFile(f.manifest, JSON.stringify(f.data));
  let report = await run(f);
  assert.equal(status(report, 'origin'), 'passed');
  assert.doesNotMatch(JSON.stringify(report), /PASSWORD|TOKEN|FRAGMENT|private-user|manifest-user/);
  git(f.target, 'remote', 'set-url', 'origin', 'git@github.com:aitonpro54/AE_agent.git');
  report = await run(f);
  assert.equal(status(report, 'origin'), 'passed');
});

test('нет origin и несколько origin оставляют identity непроверенной', async t => {
  const f = await fixture(t);
  git(f.target, 'remote', 'remove', 'origin');
  let report = await run(f);
  assert.equal(status(report, 'origin'), 'unverified');
  assert.equal(report.exitCode, 2);
  git(f.target, 'remote', 'add', 'origin', origin);
  git(f.target, 'config', '--add', 'remote.origin.url', 'https://github.com/other/other.git');
  report = await run(f);
  assert.equal(status(report, 'origin'), 'unverified');
});

test('локальный Windows drive origin не принимается за SCP locator', async t => {
  const f = await fixture(t);
  for (const localOrigin of ['C:/checkout/repository', 'C:\\checkout\\repository', 'C:repository', '\\\\server\\share\\repository']) {
    assert.equal(originIdentity(localOrigin), null, localOrigin);
    assert.throws(() => validateManifest({ ...f.data, repository: { identity: 'c/repository', origin: localOrigin } }), InputError);
  }
  git(f.target, 'remote', 'set-url', 'origin', 'C:/checkout/repository');
  const report = await run(f);
  assert.equal(status(report, 'origin'), 'unverified');
  assert.equal(status(report, 'repository_identity'), 'unverified');
  assert.equal(report.exitCode, 2);
});

test('include и worktree config не дают ошибочно подтвердить прямой origin', async t => {
  const f = await fixture(t);
  const include = path.join(f.target, '.git', 'preflight-include.conf');
  await writeFile(include, '[remote "origin"]\n\turl = https://github.com/other/other.git\n');
  git(f.target, 'config', 'include.path', include);
  let report = await run(f);
  assert.equal(status(report, 'origin'), 'unverified');
  assert.equal(report.exitCode, 2);
  git(f.target, 'config', '--unset', 'include.path');
  git(f.target, 'config', 'extensions.worktreeConfig', 'true');
  report = await run(f);
  assert.equal(status(report, 'repository_identity'), 'unverified');
});

test('неинициализированный HEAD не объявляется совпадающей рабочей веткой', async t => {
  const f = await fixture(t);
  const unborn = path.join(f.root, 'без commits');
  await mkdir(unborn);
  git(unborn, 'init', '-b', branch);
  git(unborn, 'remote', 'add', 'origin', origin);
  f.target = unborn;
  const report = await run(f);
  assert.equal(status(report, 'target_branch'), 'detached_or_unborn');
  assert.equal(status(report, 'head_vs_base'), 'unverified');
});

test('манифест v1: неизвестная версия, неизвестные поля, дубли refs, injection и неправильный result', async t => {
  const f = await fixture(t);
  for (const patch of [
    { schemaVersion: 2 }, { unexpected: true }, { baseCommit: [f.base] }, { sourceBranch: ['main'] },
    { refs: [...f.data.refs, ...f.data.refs] }, { resultCommit: f.base },
    { refs: [{ name: 'refs/heads/x;$(touch injected)', commit: f.result }] },
    { repository: { identity: 'github.com/other/other', origin } },
  ]) {
    await writeFile(f.manifest, JSON.stringify({ ...f.data, ...patch }));
    const report = await run(f);
    assert.equal(report.decision, 'input_error');
    assert.equal(report.exitCode, 2);
  }
});

test('явный target не может быть подкаталогом или несуществующим репозиторием', async t => {
  const f = await fixture(t);
  const nested = path.join(f.target, 'вложенная папка');
  await mkdir(nested);
  let report = await run(f, { target: nested });
  assert.equal(status(report, 'target_repository'), 'invalid_target');
  const outside = path.join(f.root, 'обычная папка');
  await mkdir(outside);
  report = await run(f, { target: outside });
  assert.equal(status(report, 'target_repository'), 'invalid_target');
});

test('ambient Git-переменные и fsmonitor не перенаправляют проверку и не запускают hook', async t => {
  const f = await fixture(t);
  git(f.target, 'config', 'core.fsmonitor', 'не существующая команда');
  const before = await snapshot(f.target);
  const result = spawnSync(process.execPath, [cli, '--bundle', f.bundle, '--sha256', await digest(f.bundle),
    '--manifest', f.manifest, '--target', f.target], {
    cwd: f.root, encoding: 'utf8', shell: false,
    env: { ...process.env, GIT_DIR: f.cloud + '/.git', GIT_WORK_TREE: f.cloud,
      GIT_TRACE: path.join(f.target, 'forbidden-trace'), GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'remote.origin.url', GIT_CONFIG_VALUE_0: 'https://github.com/other/other' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(status(report, 'head_vs_base'), 'passed');
  assert.match(result.stderr, /ручное рассмотрение/);
  assert.deepEqual(await snapshot(f.target), before);
});

test('CLI выдаёт JSON в stdout и объяснение в stderr; невалидные параметры — exit 2', async t => {
  const f = await fixture(t);
  const before = await snapshot(f.target);
  for (const args of [[], ['--target', f.target], ['--unknown', 'secret-PASSWORD'], ['--bundle', f.bundle, '--bundle', f.bundle]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', shell: false });
    assert.ifError(result.error);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).decision, 'input_error');
    assert.doesNotMatch(result.stdout + result.stderr, /secret-PASSWORD/);
  }
  assert.deepEqual(await snapshot(f.target), before);
});

test('полный bundle SHA-256 object format v3 поддерживается', async t => {
  const f = await fixture(t, { full: true, objectFormat: 'sha256' });
  const report = await run(f);
  assert.equal(report.exitCode, 0);
  assert.equal(status(report, 'bundle_pack_checksum'), 'passed');
  assert.equal(status(report, 'git_bundle_verify'), 'passed');
  assert.equal(status(report, 'bundle_refs'), 'passed');
});

test('другой object format блокируется, даже если штатный verify полного bundle прошёл', async t => {
  const f = await fixture(t, { full: true, objectFormat: 'sha256' });
  const sha1Target = path.join(f.root, 'локальный SHA1');
  await mkdir(sha1Target);
  git(sha1Target, 'init', '--object-format=sha1', '-b', branch);
  git(sha1Target, 'commit', '--allow-empty', '-m', 'sha1 root');
  git(sha1Target, 'remote', 'add', 'origin', origin);
  f.target = sha1Target;
  const report = await run(f);
  assert.equal(status(report, 'bundle_pack_checksum'), 'passed');
  assert.equal(status(report, 'git_bundle_verify'), 'passed');
  assert.equal(status(report, 'target_object_format'), 'mismatch');
  assert.equal(report.exitCode, 1);
});

test('assume-unchanged и skip-worktree не дают объявить скрытые изменения проверенными', async t => {
  const f = await fixture(t);
  for (const flag of ['--assume-unchanged', '--skip-worktree']) {
    git(f.target, 'update-index', '--no-assume-unchanged', '--no-skip-worktree', '--', 'base.txt');
    git(f.target, 'update-index', flag, '--', 'base.txt');
    await writeFile(path.join(f.target, 'base.txt'), 'скрытое локальное изменение\n');
    const report = await run(f);
    assert.equal(status(report, 'working_tree'), 'unverified');
    assert.equal(report.exitCode, 2);
  }
});

test('shallow history оставляет непроверенную связь HEAD с базой', async t => {
  const f = await fixture(t);
  git(f.target, 'commit', '--allow-empty', '-m', 'local above shallow boundary');
  await writeFile(path.join(f.target, '.git', 'shallow'), f.base + '\n');
  const report = await run(f);
  assert.equal(status(report, 'base_commit'), 'passed');
  assert.equal(status(report, 'head_vs_base'), 'unverified');
  assert.equal(report.exitCode, 2);
});

test('уже локальный result позволяет проверить base → result без импорта bundle', async t => {
  const f = await fixture(t);
  f.target = f.cloud;
  const report = await run(f);
  assert.equal(status(report, 'base_to_result'), 'passed');
  assert.equal(status(report, 'head_vs_base'), 'local_ahead');
  assert.equal(report.exitCode, 1);
});

test('read-only файлы цели (POSIX) не препятствуют проверке', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t);
  await chmod(path.join(f.target, '.git', 'index'), 0o444);
  await chmod(path.join(f.target, 'base.txt'), 0o444);
  assert.equal((await run(f)).exitCode, 0);
});
