#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { audit, textReport, disclaimer } = require('./audit.cjs');

const help = `Офлайн-аудит карты проверок AE Agent Core (Node >= 18).
Использование:
  node tools/cloud-checks-audit/cli.cjs [--root <core4>] [--map <relative.json>]
       [--format text|json] [--check <имя>]...
По умолчанию root — core4 рядом с tools, формат — text.
CLI только читает файлы и пишет отчёт в stdout. --run и --output отсутствуют.
${disclaimer}
Коды выхода: 0 — отчёт создан (не оценка проверок); 2 — ошибка input/аргументов.
`;

function run(args) {
  let format = 'text';
  try {
    const options = { root: path.resolve(__dirname, '../../core4'), checks: [] };
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--help' || arg === '-h') return { stdout: help, status: 0 };
      if (!['--root', '--map', '--format', '--check'].includes(arg) || !args[i + 1] || args[i + 1].startsWith('--')) throw Object.assign(new Error('Неизвестный или неполный аргумент: ' + arg), { code: 'invalid-argument' });
      const value = args[++i];
      if (arg === '--root') options.root = value;
      if (arg === '--map') options.mapFile = value;
      if (arg === '--check') options.checks.push(value);
      if (arg === '--format') { if (!['json', 'text'].includes(value)) throw Object.assign(new Error('Формат должен быть text или json.'), { code: 'invalid-format' }); format = value; }
    }
    const report = audit(options);
    return { stdout: format === 'json' ? JSON.stringify(report, null, 2) + '\n' : textReport(report), status: 0 };
  } catch (error) {
    const result = { schemaVersion: 1, mode: 'static-read-only', error: { code: error.code || 'input-error', message: error.message }, commandsExecuted: false, runtimeImported: false };
    return { stdout: format === 'json' ? JSON.stringify(result, null, 2) + '\n' : 'Ошибка аудита [' + result.error.code + ']: ' + result.error.message + '\n', status: 2 };
  }
}

function main(args) {
  const result = run(args);
  process.stdout.write(result.stdout);
  process.exitCode = result.status;
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { run, main };
