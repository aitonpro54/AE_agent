import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { InputError, originIdentity, validateManifest, validBranchRef } from './manifest.mjs';
import { git } from './git.mjs';
import { inspectBundle, sameStat } from './bundle.mjs';

const MESSAGES = {
  manual_review_required: 'Предварительные проверки пройдены. Требуется ручное рассмотрение кода и условий интеграции; автоматическое применение не разрешено.',
  blocked: 'Обнаружены несовпадения или условия, требующие отдельного решения до интеграции.',
  incomplete: 'Часть обязательных проверок не выполнена. Для решения об интеграции данных недостаточно.',
  input_error: 'Входные параметры или манифест некорректны. Исправьте явно указанные входы.',
};

function initialReport() {
  return {
    reportVersion: 1, toolVersion: '1.0.0', generatedAt: new Date().toISOString(),
    environment: { platform: process.platform, arch: process.arch, node: process.version },
    decision: 'incomplete', integrationAllowed: false, checks: [], unknowns: [], nextSteps: [],
  };
}

function finish(report) {
  report.summary = MESSAGES[report.decision];
  report.exitCode = report.decision === 'manual_review_required' ? 0 : report.decision === 'blocked' ? 1 : 2;
  return report;
}

function localState(target) {
  return {
    branch: git(target, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    head: git(target, ['rev-parse', '--verify', 'HEAD']),
    status: git(target, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']),
    origin: git(target, ['config', '--local', '--no-includes', '--get-all', 'remote.origin.url']),
    configLayers: git(target, ['config', '--local', '--no-includes', '--name-only', '--get-regexp', '^(include|includeif)\\.|^extensions\\.worktreeconfig$']),
    refs: git(target, ['for-each-ref', '--format=%(refname) %(objectname)']),
  };
}

function equalState(before, after) {
  return Object.keys(before).every(key => before[key].ok === after[key].ok
    && before[key].code === after[key].code && before[key].out === after[key].out);
}

export async function preflight(options) {
  const report = initialReport();
  const check = (id, status, message, details = {}) => report.checks.push({ id, status, message, ...details });
  const unknown = (id, message) => report.unknowns.push({ id, status: 'unverified', message });
  const next = text => { if (!report.nextSteps.includes(text)) report.nextSteps.push(text); };
  try {
    if (typeof options.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(options.sha256)
        || !['bundle', 'manifest', 'target'].every(key => typeof options[key] === 'string' && options[key])) {
      throw new InputError('Обязательны --bundle, --sha256 (64 hex), --manifest и --target.');
    }
    const manifestPath = await realpath(options.manifest);
    const manifestStat = await stat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.size > 64 * 1024) throw new InputError('Манифест должен быть JSON-файлом размером до 64 КиБ.');
    let raw;
    try { raw = JSON.parse(await readFile(manifestPath, 'utf8')); }
    catch { throw new InputError('Не удалось прочитать JSON-манифест.'); }
    const manifest = validateManifest(raw);
    const bundle = await realpath(options.bundle);
    const target = await realpath(options.target);
    report.inputs = { bundle, manifest: manifestPath, target, expectedSha256: options.sha256.toLowerCase() };
    report.claims = {
      repositoryIdentity: manifest.repository.identity, sourceBranch: manifest.sourceBranch,
      baseCommit: manifest.baseCommit, resultCommit: manifest.resultCommit, refs: manifest.refs,
    };
    check('manifest', 'passed', 'Манифест соответствует формату v1; это заявление отправителя, без доказательства подлинности.');
    unknown('authenticity', 'Манифест и совпадение хеша не удостоверяют автора. Доверие к отдельно полученному SHA-256 проверяется вне инструмента.');
    unknown('ae_compatibility', 'Качество кода, runtime state, credentials, сборка, AE/CEP/MCP и совместимость установки не проверялись.');
    unknown('pack_objects', 'Контрольная сумма PACK не доказывает корректность всех объектов. Распаковка, fsck и импорт не выполнялись.');
    unknown('ignored_files', 'Игнорируемые файлы и содержимое вложенных репозиториев не проверялись.');

    const inspected = await inspectBundle(bundle);
    check('bundle_sha256', inspected.sha256 === report.inputs.expectedSha256 ? 'passed' : 'hash_mismatch',
      inspected.sha256 === report.inputs.expectedSha256 ? 'SHA-256 совпадает с отдельно переданным значением.' : 'SHA-256 bundle не совпадает.',
      { actualSha256: inspected.sha256 });
    check('bundle_header', inspected.headerValid ? 'passed' : 'invalid_bundle',
      inspected.headerValid ? 'Прочитан заголовок bundle v2/v3.' : 'Неверный, неподдерживаемый или слишком большой заголовок bundle.');
    check('bundle_pack_checksum', inspected.packChecksum ? 'passed' : 'invalid_bundle',
      inspected.packChecksum ? 'Контрольная сумма потока PACK совпадает; объекты не распаковывались.' : 'Контрольная сумма или структура потока PACK не прошла проверку.');
    check('object_format', inspected.format === manifest.objectFormat ? 'passed' : 'mismatch', 'Формат SHA манифеста сопоставлен с bundle.',
      { expected: manifest.objectFormat, actual: inspected.format });

    const version = git(target, ['--version']);
    if (!version.ok) {
      check('git', 'unverified', 'Git недоступен или превысил ограничения выполнения.');
      next('Установить доступный Git и повторить проверку с теми же входами.');
      return finish(report);
    }
    report.environment.git = version.out.trim();
    const root = git(target, ['rev-parse', '--show-toplevel']);
    if (!root.ok || await realpath(root.out.trim()) !== target) {
      check('target_repository', 'invalid_target', 'Нужен явный корень существующего небезголого рабочего репозитория. Поиск в родительском каталоге не допускается.');
      next('Указать корень нужного локального рабочего репозитория.');
      report.decision = 'blocked';
      return finish(report);
    }
    check('target_repository', 'passed', 'Указанный путь является корнем рабочего репозитория.');
    const targetFormat = git(target, ['rev-parse', '--show-object-format']);
    check('target_object_format', targetFormat.ok ? (targetFormat.out.trim() === inspected.format ? 'passed' : 'mismatch') : 'unverified',
      'Формат объектов цели сопоставлен с bundle отдельно от git bundle verify.',
      { expected: inspected.format, actual: targetFormat.ok ? targetFormat.out.trim() : null });
    const before = localState(target);
    if (!before.refs.ok) check('target_refs_observation', 'unverified', 'Полный набор локальных refs не удалось прочитать в пределах ограничений.');
    const originLines = before.origin.out.trim().split('\n').filter(Boolean);
    const layeredConfig = before.configLayers.ok || before.configLayers.code !== 1 || before.configLayers.limited;
    const targetIdentity = !layeredConfig && before.origin.ok && originLines.length === 1 ? originIdentity(originLines[0]) : null;
    report.target = { repositoryIdentity: targetIdentity, branch: before.branch.ok ? before.branch.out.trim() : null,
      head: before.head.ok ? before.head.out.trim() : null };
    check('repository_identity', targetIdentity ? (targetIdentity === manifest.repository.identity ? 'passed' : 'repository_mismatch') : 'unverified',
      targetIdentity ? 'Identity сопоставлена с единственным прямым local origin; это локальный locator, не криптографическая identity.' : 'Не удалось однозначно определить identity по прямому local origin.');
    check('origin', targetIdentity ? (targetIdentity === manifest.repository.origin ? 'passed' : 'origin_mismatch') : 'unverified',
      targetIdentity ? 'Сопоставлены host/port/path origin без credentials и различия HTTPS/SSH.' : 'Origin отсутствует, неоднозначен, использует include/worktree config или имеет неподдерживаемый формат.');
    check('target_branch', before.branch.ok && before.head.ok ? (report.target.branch === manifest.sourceBranch ? 'passed' : 'branch_mismatch') : 'detached_or_unborn',
      before.branch.ok && before.head.ok ? 'Текущая ветка сопоставлена с sourceBranch.' : 'Текущая именованная ветка с commit HEAD не установлена.');
    const indexFlags = git(target, ['ls-files', '-v', '-z']);
    const hiddenByIndex = indexFlags.ok && indexFlags.out.split('\0').some(line => /^[a-zS] /.test(line));
    check('working_tree', before.status.ok && before.status.out.length ? 'dirty_worktree'
      : !before.status.ok || !indexFlags.ok || hiddenByIndex ? 'unverified' : 'passed',
    before.status.ok && before.status.out.length ? 'Есть незакоммиченные, индексированные, конфликтующие или неотслеживаемые изменения.'
      : hiddenByIndex ? 'Флаги assume-unchanged/skip-worktree могут скрывать изменения; чистота рабочего дерева не подтверждена.'
      : !before.status.ok || !indexFlags.ok ? 'Не удалось проверить рабочее дерево или флаги индекса.' : 'Рабочее дерево и индекс чисты в проверенной области.');
    const gitlinks = git(target, ['ls-files', '--stage', '-z']);
    if (!gitlinks.ok || gitlinks.out.split('\0').some(line => line.startsWith('160000 '))) {
      unknown('submodules', 'Состояние submodules не проверено: вложенные репозитории не открывались.');
    }

    const typeOf = oid => git(target, ['cat-file', '-t', oid]);
    const baseType = typeOf(manifest.baseCommit);
    const basePresent = baseType.ok && baseType.out.trim() === 'commit';
    check('base_commit', basePresent ? 'passed' : baseType.limited ? 'unverified' : 'missing_base',
      basePresent ? 'Base commit доступен в целевом репозитории.' : 'Base commit недоступен как commit; сеть и lazy fetch отключены.');
    const shallow = git(target, ['rev-parse', '--is-shallow-repository']);
    const graftsPath = git(target, ['rev-parse', '--git-path', 'info/grafts']);
    let grafts = false;
    if (graftsPath.ok) {
      try { grafts = (await stat(path.resolve(target, graftsPath.out.trim()))).size > 0; }
      catch (error) { if (error.code !== 'ENOENT') grafts = true; }
    }
    const historyLimited = !shallow.ok || shallow.out.trim() !== 'false' || !graftsPath.ok || grafts;
    function relation(ancestor, descendant) {
      const forward = git(target, ['merge-base', '--is-ancestor', ancestor, descendant]);
      if (forward.ok) return 'ancestor';
      if (forward.code !== 1 || forward.limited) return 'unverified';
      const reverse = git(target, ['merge-base', '--is-ancestor', descendant, ancestor]);
      return reverse.ok ? 'descendant' : reverse.code === 1 && !reverse.limited ? 'diverged' : 'unverified';
    }
    let headStatus = 'unverified';
    if (basePresent && before.head.ok) {
      if (report.target.head === manifest.baseCommit) headStatus = 'passed';
      else if (!historyLimited) {
        const value = relation(manifest.baseCommit, report.target.head);
        headStatus = { ancestor: 'local_ahead', descendant: 'local_behind', diverged: 'history_diverged', unverified: 'unverified' }[value];
      }
    }
    check('head_vs_base', headStatus, {
      passed: 'HEAD точно совпадает с заявленной базой.', local_ahead: 'HEAD содержит локальные commits сверх базы.',
      local_behind: 'HEAD отстаёт от заявленной базы.', history_diverged: 'Локальная история и база разошлись или не имеют общей истории.',
      unverified: 'Сопоставление HEAD с базой недоступно; возможны отсутствующая база/HEAD, shallow history или grafts.',
    }[headStatus]);

    const safeBundle = inspected.sha256 === report.inputs.expectedSha256 && inspected.headerValid
      && inspected.packChecksum && inspected.stable && inspected.format === manifest.objectFormat;
    const missing = [];
    let prerequisitesUnknown = false;
    if (safeBundle) {
      for (const oid of inspected.prerequisites) {
        const type = typeOf(oid);
        if (type.limited) prerequisitesUnknown = true;
        else if (!type.ok || type.out.trim() !== 'commit') missing.push(oid);
      }
      check('prerequisites', prerequisitesUnknown ? 'unverified' : missing.length ? 'missing_prerequisites' : 'passed',
        prerequisitesUnknown ? 'Не удалось проверить все prerequisites.' : missing.length ? 'В целевом репозитории недоступны prerequisites bundle.' : 'Все заявленные prerequisites доступны как commits.',
        { required: inspected.prerequisites, missing });
      const verify = git(target, ['bundle', 'verify', '--quiet', bundle]);
      check('git_bundle_verify', verify.ok ? 'passed' : verify.limited ? 'unverified' : missing.length ? 'missing_prerequisites' : 'git_rejected_bundle',
        verify.ok ? 'Штатный git bundle verify принял bundle относительно целевого репозитория.' : 'Git не подтвердил bundle относительно цели; сырой stderr скрыт.', { gitExitCode: verify.code });
      const heads = git(target, ['bundle', 'list-heads', bundle]);
      check('git_bundle_list_heads', heads.ok ? 'passed' : heads.limited ? 'unverified' : 'invalid_bundle',
        heads.ok ? 'Штатный git bundle list-heads выполнен.' : 'Git не смог перечислить refs bundle.', { gitExitCode: heads.code });
      if (heads.ok) {
        const parsed = heads.out.trim().split('\n').filter(Boolean).map(line => {
          const match = /^([a-f0-9]{40}|[a-f0-9]{64}) (.+)$/.exec(line);
          return match && validBranchRef(match[2]) ? { name: match[2], commit: match[1] } : null;
        });
        const sortRefs = refs => JSON.stringify([...refs].sort((a, b) => a.name.localeCompare(b.name)));
        const matches = parsed.every(Boolean) && sortRefs(parsed) === sortRefs(manifest.refs);
        check('bundle_refs', matches ? 'passed' : 'refs_mismatch', matches ? 'Полный набор refs bundle точно совпадает с манифестом.' : 'Refs или их SHA не совпадают; лишние refs также считаются несовпадением.');
        check('result_commit', parsed.some(ref => ref && ref.commit === manifest.resultCommit) ? 'passed' : 'result_mismatch',
          'resultCommit сопоставлен с SHA вершины refs/heads в заголовке bundle; это не проверка содержимого commit.');
      } else {
        check('bundle_refs', 'unverified', 'Refs недоступны без успешного list-heads.');
        check('result_commit', 'unverified', 'Result commit не сопоставлен с bundle.');
      }
    } else {
      for (const id of ['prerequisites', 'git_bundle_verify', 'git_bundle_list_heads', 'bundle_refs', 'result_commit']) {
        check(id, 'unverified', 'Проверка пропущена: целостность/формат bundle не подтверждены.');
      }
    }

    // Никакого импорта даже во временный ODB: доступна лишь уже локальная история.
    const resultType = typeOf(manifest.resultCommit);
    if (basePresent && resultType.ok && resultType.out.trim() === 'commit' && !historyLimited) {
      const relationStatus = manifest.baseCommit === manifest.resultCommit ? 'ancestor' : relation(manifest.baseCommit, manifest.resultCommit);
      if (relationStatus === 'unverified') unknown('base_to_result', 'Не удалось проверить связь base → result по локальным объектам.');
      else check('base_to_result', relationStatus === 'ancestor' ? 'passed' : 'history_diverged', 'Связь base → result проверена только по уже имеющимся локальным commits.');
    } else {
      unknown('base_to_result', 'Связь base → result и тип объекта result не подтверждены: нужны локальные commits и полная история. Bundle не импортировался.');
    }
    const after = localState(target);
    check('target_observation_stability', equalState(before, after) ? 'passed' : 'changed_during_check',
      equalState(before, after) ? 'Наблюдаемые branch/HEAD/refs/origin/config layers/status до и после совпадают; это не полный снимок файлов.' : 'Состояние цели изменилось во время проверки; отчёт устарел.');
    const bundleAfter = await stat(bundle, { bigint: true });
    check('bundle_stability', inspected.stable && sameStat(inspected.snapshot, bundleAfter) ? 'passed' : 'changed_during_check',
      'Метаданные bundle сопоставлены до и после проверки. Это не блокировка от параллельной записи.');
    const failures = report.checks.filter(item => !['passed', 'unverified'].includes(item.status));
    const incomplete = report.checks.some(item => item.status === 'unverified');
    report.decision = failures.length ? 'blocked' : incomplete ? 'incomplete' : 'manual_review_required';
    if (failures.length) next('Разобрать указанные несовпадения и условия отдельно; сохранить чужие изменения и обе истории. Повторить preflight после решения.');
    if (incomplete) next('Устранить причины неполных обязательных проверок и повторить preflight.');
    next('Проверить доверенный источник отдельно переданного SHA-256, diff/result commit, связь с базой и релевантные тесты в отдельно разрешённом процессе.');
    next('Выбрать условия интеграции вручную с учётом локального HEAD/ветки/рабочего дерева; этот отчёт не разрешает применение.');
    return finish(report);
  } catch (error) {
    check('inputs_or_execution', error instanceof InputError ? 'invalid_input' : 'unverified',
      error instanceof InputError ? error.message : 'Не удалось прочитать явно указанные входы или завершить проверку; системные детали скрыты.');
    report.decision = error instanceof InputError ? 'input_error' : 'incomplete';
    next('Проверить формат, доступность и неизменность явно указанных файлов и целевого репозитория; повторить проверку.');
    return finish(report);
  }
}

export function explain(report) {
  const render = items => items.length ? items.map(item => `${item.id}: ${item.message}`).join('\n  ') : 'нет';
  return [report.summary,
    'Проверено: ' + report.checks.filter(item => item.status === 'passed').map(item => item.id).join(', '),
    'Не совпало / блокирует:\n  ' + render(report.checks.filter(item => !['passed', 'unverified'].includes(item.status))),
    'Неизвестно:\n  ' + render([...report.checks.filter(item => item.status === 'unverified'), ...report.unknowns]),
    'Следующий шаг:\n  ' + report.nextSteps.join('\n  '),
  ].join('\n');
}
