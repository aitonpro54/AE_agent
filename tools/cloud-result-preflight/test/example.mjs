// Демонстрация на собственных временных репозиториях; реальная цель не нужна.
import { fixture, run } from './helpers.mjs';
import { explain } from '../preflight.mjs';

let cleanup;
try {
  const f = await fixture({ after(fn) { cleanup = fn; } });
  const report = await run(f);
  // Убираем случайный корень только из демонстрационного вывода.
  const example = structuredClone(report);
  for (const key of ['bundle', 'manifest', 'target']) example.inputs[key] = example.inputs[key].replace(f.root, '<temporary fixture>');
  example.exampleOnly = true;
  process.stdout.write(JSON.stringify(example, null, 2) + '\n');
  process.stderr.write(explain(example) + '\n');
  process.exitCode = report.exitCode;
} finally {
  if (cleanup) await cleanup();
}
