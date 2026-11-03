import { spawnSync } from 'node:child_process';

// Убираем ambient Git-переадресацию (GIT_DIR, alternate ODB, config injection,
// trace и т. п.). Команды не имеют shell и не могут обращаться к сети.
export function gitEnvironment() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  return {
    ...env, LC_ALL: 'C', LANG: 'C', GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  };
}

export function git(cwd, args) {
  const result = spawnSync('git', [
    '--no-pager', '--no-optional-locks',
    '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-c', 'gc.auto=0', '-c', 'maintenance.auto=false',
    '-c', 'protocol.allow=never', ...args,
  ], {
    cwd, env: gitEnvironment(), shell: false, encoding: 'utf8',
    timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Не возвращаем stderr: Git может включить credentials/config/path в ошибку.
  return { ok: !result.error && result.status === 0, code: result.status,
    limited: Boolean(result.error), out: result.stdout || '' };
}
