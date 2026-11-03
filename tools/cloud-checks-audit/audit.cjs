'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { inspect } = require('./source.cjs');

const labels = Object.freeze({
  'cloud-candidate': 'кандидат для облачной проверки',
  'platform-dependency': 'обнаруженная платформенная зависимость',
  'native-ae-evidence-required': 'необходима отдельная проверка в настоящем AE',
  'insufficient-information': 'недостаточно сведений'
});
const disclaimer = 'Только статический аудит: команды не исполнялись, runtime не импортировался. Это не результат тестов и не сертификат переносимости.';
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Ни realpath-follow, ни package resolution через runtime. Symlink/junction отвергаются.
function reader(root) {
  root = path.resolve(root);
  const parts = root.slice(path.parse(root).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(root).root;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) fail('unsafe-root', 'Root проходит через symlink/junction.');
  }
  if (!fs.statSync(root).isDirectory()) fail('invalid-root', 'Root должен быть каталогом.');
  const sources = new Map();
  function target(relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') || path.posix.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) fail('unsafe-path', 'Небезопасный относительный путь: ' + relative);
    const normalized = path.posix.normalize(relative);
    if (normalized === '..' || normalized.startsWith('../')) fail('unsafe-path', 'Путь выходит за root: ' + relative);
    let absolute = root;
    for (const part of normalized.split('/').filter(part => part && part !== '.')) {
      absolute = path.join(absolute, part);
      if (fs.lstatSync(absolute).isSymbolicLink()) fail('unsafe-path', 'Symlink/junction не читается: ' + relative);
    }
    return { absolute, relative: normalized };
  }
  function read(relative) {
    const item = target(relative);
    if (sources.has(item.relative)) return sources.get(item.relative);
    const stat = fs.statSync(item.absolute);
    if (!stat.isFile()) fail('not-file', 'Ожидался файл: ' + relative);
    if (stat.size > 2 * 1024 * 1024) fail('file-limit', 'Файл превышает 2 MiB: ' + relative);
    if (sources.size >= 3000) fail('file-limit', 'Превышен лимит 3000 файлов.');
    const bytes = fs.readFileSync(item.absolute), text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes) || text.includes('\0')) fail('non-text', 'Файл не является UTF-8 текстом: ' + relative);
    const source = { file: item.relative, sha256: sha256(bytes), bytes: bytes.length, text };
    if (/\.(?:[cm]?js|jsx)$/.test(relative)) Object.assign(source, inspect(text));
    else Object.assign(source, { imports: [], findings: [] });
    sources.set(item.relative, source);
    return source;
  }
  function expand(relative, depth = 0) {
    if (depth > 40) fail('directory-limit', 'Превышена глубина 40 каталогов.');
    const item = target(relative);
    if (!fs.statSync(item.absolute).isDirectory()) { read(item.relative); return [item.relative]; }
    const result = [];
    for (const name of fs.readdirSync(item.absolute).sort()) {
      if (['.git', 'node_modules'].includes(name)) fail('excluded-directory', 'Объявленная closure включает исключённый каталог: ' + name);
      result.push(...expand(path.posix.join(item.relative, name), depth + 1));
    }
    if (!result.length) fail('empty-dependency', 'Пустой каталог зависимости: ' + relative);
    return result;
  }
  function resolve(from, specifier) {
    const base = path.posix.join(path.posix.dirname(from), specifier);
    for (const candidate of [base, base + '.js', base + '.cjs', base + '.mjs', base + '.json', base + '/index.js', base + '/index.cjs', base + '/index.mjs']) {
      try { const item = target(candidate); if (fs.statSync(item.absolute).isFile()) { read(candidate); return item.relative; } }
      catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    }
    fail('unresolved-import', 'Не разрешён literal import: ' + from + ' → ' + specifier);
  }
  return { read, expand, resolve, sources, root };
}

function validateMap(map) {
  if (!record(map) || !record(map.checkDependencies) || !Object.keys(map.checkDependencies).length) fail('invalid-map', 'Нужен непустой объект checkDependencies.');
  for (const key of ['checkCommands', 'checkPolicy', 'checkProjections']) if (map[key] !== undefined && !record(map[key])) fail('invalid-map', key + ' должен быть объектом.');
  for (const [check, dependencies] of Object.entries(map.checkDependencies)) {
    if (!check || !strings(dependencies) || !dependencies.length) fail('invalid-map', 'Некорректные зависимости: ' + check);
    if (!['component', 'integration'].includes(map.checkPolicy?.[check]?.kind)) fail('invalid-map', 'Нет корректного checkPolicy.kind: ' + check);
  }
  for (const [check, command] of Object.entries(map.checkCommands || {})) {
    if (!Object.hasOwn(map.checkDependencies, check) || !strings(command) || !command.length) fail('invalid-map', 'Некорректная команда: ' + check);
  }
  for (const [check, projections] of Object.entries(map.checkProjections || {})) {
    if (!Object.hasOwn(map.checkDependencies, check) || !Array.isArray(projections) || projections.some(p => !record(p) || ![p.file, p.key, p.id].every(v => typeof v === 'string' && v))) fail('invalid-map', 'Некорректная projection: ' + check);
  }
}

function gitMetadata(root) {
  // Только справочная метка checkout, не доказательство чистоты или принадлежности bytes commit.
  const directory = path.join(path.dirname(root), '.git');
  try {
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) return null;
    const head = fs.readFileSync(path.join(directory, 'HEAD'), 'utf8').trim();
    const reference = head.startsWith('ref: ') ? head.slice(5) : null;
    let commit = reference ? null : head;
    if (reference && /^refs\/[A-Za-z0-9_./-]+$/.test(reference) && !reference.includes('..')) {
      try { commit = fs.readFileSync(path.join(directory, reference), 'utf8').trim(); }
      catch {
        const packed = fs.readFileSync(path.join(directory, 'packed-refs'), 'utf8');
        commit = packed.split('\n').find(line => line.endsWith(' ' + reference))?.split(' ')[0];
      }
    }
    return { head: /^[a-f0-9]{40}$/.test(commit || '') ? commit : null,
      branch: reference?.replace(/^refs\/heads\//, '') || null,
      basis: 'read-only-git-head-label', worktreeBytesVerifiedAgainstCommit: false };
  } catch { return null; }
}

function audit({ root, mapFile = 'config/validation-map.json', checks = [] }) {
  let files;
  try { files = reader(root); } catch (error) { fail(error.code || 'invalid-root', 'Не удалось открыть root: ' + error.message); }
  const input = files.read(mapFile);
  let map;
  try { map = JSON.parse(input.text); } catch { fail('invalid-json', 'Некорректный JSON: ' + mapFile); }
  validateMap(map);
  for (const check of checks) if (!Object.hasOwn(map.checkDependencies, check)) fail('unknown-check', 'Неизвестная проверка: ' + check);
  const validatorFile = 'tools/validate-diff.js';
  let validator;
  try { validator = files.read(validatorFile); } catch { /* Отсутствие отражается для fallback ниже. */ }
  const results = [], allImports = new Map();
  for (const check of Object.keys(map.checkDependencies).filter(id => !checks.length || checks.includes(id)).sort()) {
    const declaredCommand = map.checkCommands?.[check];
    const command = declaredCommand || ['node', '--test', '--test-name-pattern=' + check, 'test/core4.test.js'];
    const evidence = [{ file: input.file, pointer: '/checkDependencies/' + check, basis: 'explicit', kind: 'declaration', detail: 'Объявленные зависимости; достижимость не следует из карты.' },
      { file: declaredCommand ? input.file : validatorFile, pointer: declaredCommand ? '/checkCommands/' + check : undefined,
        basis: declaredCommand ? 'explicit' : 'heuristic', kind: 'command', detail: declaredCommand ? 'Команда прочитана как данные.' : 'Fallback воспроизведён по изученному validate-diff.js; файл не исполнялся.' }];
    const issues = [], declared = new Set(), reachable = new Set(), imports = [], projectionFiles = [];
    const issue = (file, error) => issues.push({ file, code: error.code || 'read-error', detail: error.message });
    const dependencies = map.checkDependencies[check].map(dependency => {
      try { const expanded = files.expand(dependency); expanded.forEach(file => declared.add(file)); return { path: dependency, files: expanded }; }
      catch (error) { issue(dependency, error); return { path: dependency, files: [] }; }
    });
    for (const file of [...declared].slice(0, 2)) evidence.push({ file, basis: 'explicit', kind: 'declared-file', detail: 'Объявленный файл прочитан как данные; вызов не установлен.' });
    for (const projection of map.checkProjections?.[check] || []) {
      try {
        const source = files.read(projection.file), data = JSON.parse(source.text);
        if (!Array.isArray(data[projection.key]) || !data[projection.key].some(item => item?.id === projection.id)) fail('missing-projection', 'Не найдена projection id=' + projection.id);
        projectionFiles.push(source.file);
      } catch (error) { issue(projection.file, error); }
    }
    // Только точно поддержанный argv. Shell, npm scripts, globs и Node loaders не раскрываются.
    const nodeCommand = command.length === 4 && command[0] === 'node' && command[1] === '--test' && command[2].startsWith('--test-name-pattern=') && /^[\w./-]+\.[cm]?js$/.test(command[3]);
    const executable = command[0].split(/[\\/]/).at(-1).toLowerCase();
    const windowsCommand = ['powershell', 'powershell.exe', 'cmd', 'cmd.exe', 'cscript', 'cscript.exe', 'wscript', 'wscript.exe', 'reg.exe', 'tasklist.exe'].includes(executable);
    const nativeCommand = ['afterfx', 'afterfx.exe', 'aerender', 'aerender.exe'].includes(executable);
    if (!declaredCommand && (!validator || !validator.text.includes("map.checkCommands?.[check] || ['node', '--test', '--test-name-pattern=' + check, 'test/core4.test.js']"))) {
      issues.push({ file: validatorFile, code: 'unverified-fallback', detail: 'Известный fallback не подтверждён текстом validator.' });
    }
    function visit(file, depth = 0) {
      if (reachable.has(file)) return;
      if (depth > 100) { issue(file, { code: 'import-limit', message: 'Превышена глубина 100 imports.' }); return; }
      reachable.add(file);
      try {
        const source = files.read(file);
        if (!/\.(?:[cm]?js|json)$/.test(file)) issue(file, { code: 'unsupported-source', message: 'Язык/формат import не поддержан.' });
        for (const item of source.imports) {
          const edge = { from: file, ...item };
          imports.push(edge); allImports.set(file + ':' + item.line + ':' + item.specifier, edge);
          if (item.kind === 'external') issue(file, { code: 'external-import', message: 'Не исследован внешний import: ' + item.specifier });
          if (item.kind === 'local') {
            try { edge.to = files.resolve(file, item.specifier); visit(edge.to, depth + 1); }
            catch (error) { issue(file, error); }
          }
        }
      } catch (error) { issue(file, error); }
    }
    if (nodeCommand) {
      visit(command[3]);
      evidence.push({ file: command[3], basis: 'explicit', kind: 'entrypoint', detail: 'Файл указан в argv; прочитан без выполнения, hash приведён в sources.' });
    }
    else if (!windowsCommand && !nativeCommand) issues.push({ file: input.file, code: 'unsupported-command', detail: 'Argv не входит в поддержанную форму Node --test; команда не раскрывалась.' });
    const observations = [...new Set([...declared, ...reachable, ...projectionFiles])].sort().flatMap(file =>
      (files.sources.get(file)?.findings || []).map(item => ({ file, scope: reachable.has(file) ? 'entry-or-literal-import' : 'declared-only', ...item })));
    // Declared-only признак не доказывает вызов, но оставляет вопрос для ручной проверки.
    const ambiguous = observations;
    let category, reason, basis;
    if (nativeCommand) {
      category = 'native-ae-evidence-required'; basis = 'explicit'; reason = 'В argv явно указан executable Adobe AE; фактическое поведение требует отдельного native evidence.';
    } else if (windowsCommand) {
      category = 'platform-dependency'; basis = 'explicit'; reason = 'В argv явно указан Windows executable ' + command[0] + '.';
    } else if (issues.length || ambiguous.length) {
      const descriptions = {
        'windows-skip-gate': 'Windows-only skip', 'dynamic-import': 'вычисляемые imports',
        'opaque-code': 'непрозрачные выражения/загрузчики', 'process-call': 'возможные внешние процессы',
        capability: 'встроенные модули с внешними возможностями', 'host-condition': 'данные/ветки среды',
        simulation: 'VM/mock', 'windows-hint': 'упоминания Windows', 'ae-hint': 'упоминания AE/JSX',
        'lexical-ambiguity': 'неясный лексический контекст'
      };
      const signals = [...new Set(ambiguous.map(item => descriptions[item.kind]))].filter(Boolean).slice(0, 4);
      category = 'insufficient-information'; basis = 'heuristic';
      reason = 'Не установлена среда всей группы: ' + (issues.length ? 'неразрешённых зависимостей/команд: ' + issues.length + '; ' : '') +
        (signals.length ? signals.join(', ') + '. ' : '') + 'Подмены, достижимость и выбранные ветки не доказаны.';
    } else {
      category = 'cloud-candidate'; basis = 'heuristic'; reason = 'Поддержанный Node --test argv и literal imports исследованы; явных препятствий в этом ограниченном обзоре не найдено. Нужен отдельный разрешённый запуск.';
    }
    const priority = ['windows-skip-gate', 'dynamic-import', 'opaque-code', 'process-call', 'capability', 'host-condition', 'simulation', 'windows-hint', 'ae-hint', 'lexical-ambiguity'];
    const representatives = priority.flatMap(kind => {
      const matching = observations.filter(item => item.kind === kind);
      const item = matching.find(item => item.file === command[3]) || matching.find(item => item.scope === 'entry-or-literal-import') || matching[0];
      return item ? [item] : [];
    });
    const grounds = [...evidence, ...issues.slice(0, 3).map(item => ({ file: item.file, basis: 'explicit', kind: 'unresolved', detail: item.detail })), ...representatives.slice(0, 5)];
    results.push({ check, category, categoryLabel: labels[category], basis, reason,
      command: { argv: command, source: declaredCommand ? 'map' : 'validator-fallback', executed: false },
      policy: map.checkPolicy[check], dependencies, projections: map.checkProjections?.[check] || [],
      entrypoint: nodeCommand ? command[3] : null, reachableFiles: [...reachable].sort(), importEdgeCount: imports.length,
      nativeEvidence: { status: nativeCommand ? 'separate-required' : 'not-established',
        reason: nativeCommand ? 'Явный AE executable в команде.' : 'Из статического обзора необходимость настоящего AE не установлена; VM/mock/JSX не являются native proof.' },
      evidence: grounds, issues, observationCount: observations.length, observations: representatives });
  }
  return { schemaVersion: 1, mode: 'static-read-only', disclaimer, commandsExecuted: false,
    runtimeImported: false, root: files.root, input: { file: input.file, sha256: input.sha256 },
    checkout: gitMetadata(files.root), environment: { platform: process.platform, arch: process.arch, release: os.release(), node: process.version },
    summary: Object.fromEntries(Object.keys(labels).map(category => [category, results.filter(item => item.category === category).length])),
    checks: results, imports: [...allImports.values()],
    sources: [...files.sources.values()].sort((a, b) => a.file.localeCompare(b.file)).map(({ text, imports, ...source }) => source),
    limitations: [
      'Категория относится ко всей группе файла; --test-name-pattern не вычисляется, отдельные выбранные тесты и ветки не выделяются.',
      'Lexer не является JS parser. Неясный regexp, шаблоны, dynamic loading, capability builtins и host conditions оставляют неопределённость.',
      'В observations выбран один пример каждого вида признаков; все признаки доступны в sources[].findings, edges — в imports.',
      'Declared-only файлы не доказывают достижимость; literal imports тоже не доказывают фактический вызов.',
      'Чтение файлов как данных, generated assets, package exports, loaders и targets процессов полностью не восстанавливаются.',
      'Хеши относятся к прочитанным bytes рабочего дерева; HEAD только метка. Атомарный snapshot при параллельных изменениях не гарантируется.',
      'Windows-only ветки, реальные AE/CEP/native delivery/recovery и двухмашинный P1–P8 требуют отдельного evidence.'
    ] };
}

function textReport(report) {
  const lines = ['Аудит пригодности проверок к облачному запуску', report.disclaimer,
    'Input: ' + report.input.file + ' (SHA-256 ' + report.input.sha256 + ')',
    'Checkout HEAD: ' + (report.checkout?.head || 'не установлен') + '; ветка: ' + (report.checkout?.branch || 'не установлена'),
    'Среда: ' + report.environment.platform + '/' + report.environment.arch + '; Node ' + report.environment.node,
    ...Object.entries(report.summary).map(([category, count]) => labels[category] + ': ' + count), ''];
  for (const check of report.checks) {
    lines.push(check.check + ' — ' + check.categoryLabel + ' [' + (check.basis === 'explicit' ? 'явные сведения' : 'эвристика') + ']',
      '  Причина: ' + check.reason,
      '  Основания: ' + [...new Set(check.evidence.map(e => e.file + (e.line ? ':' + e.line : e.pointer ? '#' + e.pointer : '')))].join(', '));
    if (check.observations.some(item => item.kind === 'simulation')) lines.push('  Есть признаки VM/mock; полнота подмен не установлена.');
    if (check.observations.some(item => item.kind === 'windows-hint')) lines.push('  Есть Windows-признаки; необходимость Windows для всей группы не доказана.');
    lines.push('  AE evidence: ' + check.nativeEvidence.reason);
  }
  lines.push('', 'Ограничения:', ...report.limitations.map(item => '- ' + item));
  return lines.join('\n') + '\n';
}

module.exports = { audit, textReport, labels, disclaimer };
