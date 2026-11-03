#!/usr/bin/env node
import { preflight, explain } from './preflight.mjs';

const usage = `Read-only проверка облачного Git bundle (v1.0.0, Node >= 20).
node tools/cloud-result-preflight/cli.mjs --bundle <файл> --sha256 <64 hex> --manifest <JSON> --target <корень репозитория>
stdout: JSON-отчёт; stderr: объяснение человеку. Файлы отчёта CLI не создаёт.
Коды: 0 — к ручному рассмотрению, 1 — блокирующие условия, 2 — ошибка/неполная проверка.
Даже код 0 не разрешает интеграцию. Сеть, импорт, checkout, установка и AE не используются.\n`;

const argv = process.argv.slice(2);
if (argv.length === 1 && argv[0] === '--help') {
  process.stdout.write(usage);
} else {
  const options = {};
  let invalid = false;
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!['bundle', 'sha256', 'manifest', 'target'].includes(key) || !argv[i].startsWith('--')
        || !argv[i + 1] || Object.hasOwn(options, key)) { invalid = true; break; }
    options[key] = argv[i + 1];
  }
  const report = await preflight(invalid ? {} : options);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.stderr.write(explain(report) + '\n');
  process.exitCode = report.exitCode;
}
