'use strict';

// Ограниченный лексический обзор. Здесь нет parser/runtime анализируемого проекта.
const { builtinModules } = require('node:module');
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const opaque = new Set(['child_process', 'vm', 'module', 'net', 'http', 'https', 'tls',
  'dgram', 'cluster', 'worker_threads', 'sqlite', 'test/mock_loader']);

function tokens(source) {
  const result = [], expressionBefore = new Set(['(', '[', '{', '=', ':', ',', ';', '!', '?', '&', '|', 'return', 'throw', 'case', '>']);
  let index = 0, line = 1;
  while (index < source.length) {
    const start = index, startLine = line, char = source[index];
    if (/\s/.test(char)) { if (char === '\n') line++; index++; continue; }
    if (source.startsWith('//', index)) { while (index < source.length && source[index] !== '\n') index++; continue; }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2); index = end < 0 ? source.length : end + 2;
      line += source.slice(start, index).split('\n').length - 1; continue;
    }
    let type = 'code', value;
    if (["'", '"', '`'].includes(char)) {
      index++;
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue; }
        if (source[index++] === char) break;
      }
      type = char === '`' ? 'template' : 'string';
      value = source.slice(start + 1, index - 1);
    } else if (char === '/' && (!result.length || expressionBefore.has(result.at(-1).value))) {
      index++; let inClass = false, closed = false;
      while (index < source.length && source[index] !== '\n') {
        const current = source[index++];
        if (current === '\\') { index++; continue; }
        if (current === '[') inClass = true;
        if (current === ']') inClass = false;
        if (current === '/' && !inClass) { closed = true; break; }
      }
      if (closed) { while (index < source.length && /[a-z]/i.test(source[index])) index++; type = 'regexp'; }
      else type = 'ambiguous';
    } else if (char === '/') {
      // После ')' или '}' regexp может начинать statement: parser здесь отсутствует.
      type = [')', '}'].includes(result.at(-1)?.value) ? 'ambiguous' : 'operator'; index++;
    } else {
      const word = /^[A-Za-z_$][\w$]*|^\d+(?:\.\d+)?/.exec(source.slice(index));
      index += word ? word[0].length : 1;
    }
    value ??= source.slice(start, index);
    result.push({ value, type, line: startLine });
    line += source.slice(start, index).split('\n').length - 1;
  }
  return result;
}

function inspect(source) {
  const list = tokens(source), imports = [], findings = [];
  const add = (kind, token, detail) => {
    if (!findings.some(item => item.kind === kind)) findings.push({ kind, basis: 'heuristic', line: token.line, detail });
  };
  for (let i = 0; i < list.length; i++) {
    const token = list[i], next = list[i + 1], after = list[i + 2];
    if (token.type === 'template' && token.value.includes('${')) add('opaque-code', token, 'Шаблон с вычисляемыми выражениями не разбирается.');
    if (token.type === 'ambiguous') add('lexical-ambiguity', token, 'Контекст regexp не установлен ограниченным лексером.');
    if (token.type !== 'code') continue;
    if (token.value === 'require' && next?.value === '(') {
      if (after?.type === 'string' && list[i + 3]?.value === ')' && !after.value.includes('\\')) {
        imports.push({ specifier: after.value, line: token.line });
      } else add('dynamic-import', token, 'Вычисляемый require не разрешается статически.');
    }
    if (token.value === 'import') {
      if (next?.value === '(') {
        if (after?.type === 'string' && list[i + 3]?.value === ')' && !after.value.includes('\\')) imports.push({ specifier: after.value, line: token.line });
        else add('dynamic-import', token, 'Вычисляемый import не разрешается статически.');
      } else if (next?.type === 'string') imports.push({ specifier: next.value, line: token.line });
    }
    if (token.value === 'from' && next?.type === 'string') imports.push({ specifier: next.value, line: token.line });
    if (['eval', 'Function', 'createRequire', '_load', 'load', 'dlopen'].includes(token.value) && next?.value === '(') {
      add('opaque-code', token, 'Найден возможный загрузчик/вычислитель; его targets не доказаны.');
    }
    if (['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'].includes(token.value) && next?.value === '(') {
      add('process-call', token, 'Возможен запуск процесса; mocks и достижимость не установлены.');
    }
    if (token.value === 'process' && next?.value === '.' && ['platform', 'env', 'getBuiltinModule'].includes(after?.value)) {
      add('host-condition', token, 'Найдена зависимость от platform/env или косвенная загрузка builtin; ветки не вычисляются.');
    }
    if (token.value === 'skip' && list.slice(i + 1, i + 9).map(t => t.value).join(' ') === ': process . platform ! = = win32') {
      findings.push({ kind: 'windows-skip-gate', basis: 'explicit', line: token.line,
        detail: 'В файле есть skip: process.platform !== win32; охват выбранного --test-name-pattern этим guard не установлен.' });
    }
    if (['mock', 'createContext', 'runInContext', 'runInNewContext', 'fixtureTransport'].includes(token.value)) {
      add('simulation', token, 'Найден признак mock/VM/fixture; полнота подмен не доказана.');
    }
  }
  for (const item of imports) {
    const name = item.specifier.replace(/^node:/, '');
    item.kind = builtins.has(name) ? 'builtin' : item.specifier.startsWith('.') ? 'local' : 'external';
    if (item.kind === 'builtin' && opaque.has(name)) add('capability', item, 'Builtin ' + name + ' требует отдельного разбора среды/подмен.');
  }
  // Упоминания — только предположения, включая строки и комментарии.
  const hints = [
    ['windows-hint', /windows|win32|powershell|Get-CimInstance|\.cmd\b/i, 'Упоминание Windows само по себе не доказывает зависимость проверки.'],
    ['ae-hint', /\.jsx\b|after\s*effects|afterfx|__adobe_cep__|app\.project/i, 'Упоминание AE/JSX допускает VM/mock и не доказывает необходимость AE.']
  ];
  for (const [kind, pattern, detail] of hints) {
    const match = pattern.exec(source);
    if (match) findings.push({ kind, basis: 'heuristic', line: source.slice(0, match.index).split('\n').length, detail });
  }
  return { imports, findings };
}

module.exports = { inspect };
