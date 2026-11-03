// Формат v1: только полные SHA и переносимые refs/heads/*.
export class InputError extends Error {}

function keys(value, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== required.length || !required.every(key => Object.hasOwn(value, key))) {
    throw new InputError('Неверный набор полей манифеста v1.');
  }
}

// Локальные пути и неизвестные URL намеренно не нормализуются догадками.
// Ни исходная строка origin, ни ошибки URL не попадают в отчёт.
export function originIdentity(value) {
  if (typeof value !== 'string' || /[\s\x00-\x1f\x7f]/u.test(value)) return null;
  // Drive paths (включая C:relative) нельзя принять за SCP origin с host C.
  if (/^[A-Za-z]:/.test(value)) return null;
  let host, port = '', pathname;
  try {
    if (/^(https|ssh):\/\//.test(value)) {
      const url = new URL(value);
      host = url.hostname.toLowerCase();
      port = url.port;
      if (url.protocol === 'ssh:' && port === '22') port = '';
      pathname = url.pathname;
    } else {
      const match = /^(?:[^/@:]+@)?([A-Za-z0-9.-]+):([^?#]+)(?:[?#].*)?$/.exec(value);
      if (!match) return null;
      [, host, pathname] = match;
      host = host.toLowerCase();
    }
    pathname = pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
    if (!host || !pathname || pathname.split('/').some(p => !p || p === '.' || p === '..')
        || !/^[A-Za-z0-9._/-]+$/.test(pathname)) return null;
    return `${host}${port ? ':' + port : ''}/${pathname}`;
  } catch {
    return null;
  }
}

export function validBranchRef(value) {
  return typeof value === 'string' && value.startsWith('refs/heads/')
    && value.length <= 1024 && !/[\s\x00-\x20\x7f~^:?*\[\\]/u.test(value)
    && !value.includes('..') && !value.includes('@{') && !value.endsWith('.')
    && value.split('/').every(p => p && !p.startsWith('.') && !p.endsWith('.lock'));
}

export function validateManifest(value) {
  keys(value, ['schemaVersion', 'repository', 'sourceBranch', 'baseCommit', 'resultCommit', 'refs']);
  if (value.schemaVersion !== 1) throw new InputError('Поддерживается только schemaVersion: 1.');
  keys(value.repository, ['identity', 'origin']);
  const identity = originIdentity(value.repository.origin);
  if (!identity || value.repository.identity !== identity) {
    throw new InputError('repository.identity должен совпадать с нормализованным repository.origin.');
  }
  if (typeof value.sourceBranch !== 'string' || !validBranchRef('refs/heads/' + value.sourceBranch)) {
    throw new InputError('sourceBranch должен быть именем ветки без refs/heads/.');
  }
  const oidLength = typeof value.baseCommit === 'string' ? value.baseCommit.length : 0;
  const oid = new RegExp(`^[a-f0-9]{${oidLength === 64 ? 64 : 40}}$`);
  if (typeof value.baseCommit !== 'string' || typeof value.resultCommit !== 'string'
      || !oid.test(value.baseCommit) || !oid.test(value.resultCommit)) {
    throw new InputError('baseCommit и resultCommit должны быть полными SHA одного формата, в нижнем регистре.');
  }
  if (!Array.isArray(value.refs) || !value.refs.length || value.refs.length > 128) {
    throw new InputError('refs должен содержать от 1 до 128 записей.');
  }
  const seen = new Set();
  for (const ref of value.refs) {
    keys(ref, ['name', 'commit']);
    if (!validBranchRef(ref.name) || typeof ref.commit !== 'string' || !oid.test(ref.commit) || seen.has(ref.name)) {
      throw new InputError('Неверный или повторный переносимый ref. V1 поддерживает только refs/heads/*.');
    }
    seen.add(ref.name);
  }
  if (!value.refs.some(ref => ref.commit === value.resultCommit)) {
    throw new InputError('resultCommit должен быть вершиной хотя бы одного переносимого ref.');
  }
  // Origin с возможными credentials больше не хранится в возвращаемом значении.
  return { ...value, repository: { identity, origin: identity }, objectFormat: oidLength === 64 ? 'sha256' : 'sha1' };
}
