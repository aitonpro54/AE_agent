#!/usr/bin/env node
/**
 * scripts/install-ae-tool-first-hook.js
 *
 * Project-scoped installer and checker for AE Agent PreToolUse hook.
 *
 * Modes:
 *   --check     Verify current installation state, definition hash, and matching status (read-only).
 *   --install   Idempotently install/update the hook in <repo>/.codex/hooks.json (atomic write).
 *   --uninstall Remove the hook handler from <repo>/.codex/hooks.json.
 *
 * Rules:
 *   - Command uses absolute current Node executable (process.execPath) and script path safely quoted.
 *   - Ownership is at the level of EXACT full current-project command; foreign handlers, other-project
 *     handlers with same basename, and foreign groups (even empty ones) are strictly preserved.
 *   - Schema validation is performed prior to mutation; bad/incompatible containers, null, and arrays
 *     fail WITHOUT write.
 *   - Absent target on disk uses initial empty object.
 *   - Modifies ONLY <repo>/.codex/hooks.json.
 *   - Does NOT touch global config, provider config, auth, or trusted hashes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOOK_EVENT_NAME = 'PreToolUse';
const MATCHER_PATTERN = '^mcp__(node_repl__(js|js_reset|js_add_node_module_dir)|cua_repl__(js|js_reset))$|^(Bash|exec_command)$';
const HOOK_TIMEOUT = 5;

/**
 * Returns canonical realpath repository root path.
 */
function getRepoRoot(fsAdapter = fs) {
  const dir = path.resolve(__dirname, '..');
  try {
    if (fsAdapter && typeof fsAdapter.realpathSync === 'function') {
      return fsAdapter.realpathSync(dir);
    }
    return fs.realpathSync(dir);
  } catch (_) {
    return dir;
  }
}

const SMART_QUOTES_REGEX = /[\u2018\u2019\u201A\u201B\u201C\u201D\u201E]/;

/**
 * Validates that a path does not contain illegal characters or unsupported smart quotes
 * that could break out of single-quoted string literals in PowerShell.
 * Fails closed before write if dangerous characters like newlines, null bytes,
 * or Unicode smart quotation marks (delimiters in PowerShell) are present.
 */
function validateWindowsPathSafe(p) {
  if (typeof p !== 'string' || !p.trim()) {
    throw new Error('Path must be a non-empty string');
  }
  if (/[\r\n\0]/.test(p)) {
    throw new Error(`Path contains illegal control characters: ${JSON.stringify(p)}`);
  }
  if (SMART_QUOTES_REGEX.test(p)) {
    throw new Error(`Path contains unsupported Unicode smart quotes (PowerShell delimiters): ${JSON.stringify(p)}`);
  }
}

/**
 * Validates that an executable path is safe to use as an unquoted token in both CMD and PowerShell.
 * It must be an absolute path without whitespace, quotes, or shell metacharacters.
 * Fails closed before write if unusual SystemRoot contains whitespace or metacharacters.
 */
function validateWindowsShellTokenSafe(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('PowerShell executable token must be a non-empty string');
  }
  if (!path.win32.isAbsolute(token)) {
    throw new Error(`PowerShell executable token must be an absolute path (no PATH/cwd resolution): ${token}`);
  }
  if (/\s/.test(token)) {
    throw new Error(`PowerShell executable token contains whitespace and cannot be safely unquoted: ${token}`);
  }
  if (/["'\u2018\u2019\u201A\u201B\u201C\u201D\u201E]/.test(token)) {
    throw new Error(`PowerShell executable token contains quotes: ${token}`);
  }
  if (/[&|<>;%^$()`\r\n\0]/.test(token)) {
    throw new Error(`PowerShell executable token contains shell metacharacters: ${token}`);
  }
}

/**
 * Resolves the pinned native Windows PowerShell executable path under SystemRoot.
 * Never falls back to PATH or cwd.
 * Fails closed before write if SystemRoot is undefined or path contains unsafe metacharacters.
 */
function getWindowsPowerShellPath(options = {}) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'powershellPath')) {
    if (!options.powershellPath || typeof options.powershellPath !== 'string' || !options.powershellPath.trim()) {
      throw new Error('PowerShell executable token must be a non-empty string');
    }
    validateWindowsShellTokenSafe(options.powershellPath);
    return options.powershellPath;
  }

  let systemRoot;
  if (options && Object.prototype.hasOwnProperty.call(options, 'systemRoot')) {
    systemRoot = options.systemRoot;
  } else {
    systemRoot = process.env.SystemRoot || process.env.windir;
  }

  if (!systemRoot || typeof systemRoot !== 'string' || !systemRoot.trim()) {
    throw new Error('SystemRoot is not defined; cannot pin native Windows PowerShell executable (fail closed)');
  }

  const resolved = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  validateWindowsShellTokenSafe(resolved);
  return resolved;
}

/**
 * Escapes a literal path for inclusion inside PowerShell single-quoted string ('...').
 * In PowerShell single-quoted strings:
 * - Variables ($var) are NOT expanded.
 * - Backticks (`) are NOT escape characters.
 * - Single quotes are escaped by doubling them (' -> '').
 */
function escapePowershellSingleQuote(str) {
  validateWindowsPathSafe(str);
  return str.replace(/'/g, "''");
}

/**
 * Builds the PowerShell script to invoke node with the target pretool script.
 */
function buildWindowsPowershellScript(nodeExe, scriptPath) {
  const escNode = escapePowershellSingleQuote(nodeExe);
  const escScript = escapePowershellSingleQuote(scriptPath);
  return `& '${escNode}' '${escScript}'`;
}

/**
 * Encodes a PowerShell script as a Base64 UTF-16LE string for -EncodedCommand.
 */
function encodePowershellCommand(psScript) {
  return Buffer.from(psScript, 'utf16le').toString('base64');
}

/**
 * Decodes an -EncodedCommand Base64 string back to UTF-16LE string (for review and test inspection).
 */
function decodePowershellCommand(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf16le');
}

/**
 * Formats command line using absolute current Node executable and script path.
 * On Windows: uses an explicit native WindowsPowerShell absolute executable under SystemRoot
 * with -NoProfile -NonInteractive -EncodedCommand wrapper, which is shell-portable (executes with stdin through both CMD and PowerShell).
 * On other OS: uses safely quoted absolute Node executable and script path.
 */
function getHookCommand(repoRoot, options = {}) {
  const platform = (options && options.platform) || process.platform;
  const rawNode = (options && options.execPath) || process.execPath;
  const rawScript = platform === 'win32'
    ? path.win32.resolve(repoRoot, 'scripts', 'ae-tool-first-pretool.js')
    : path.resolve(repoRoot, 'scripts', 'ae-tool-first-pretool.js');

  if (platform === 'win32') {
    const psExe = getWindowsPowerShellPath(options);
    const psScript = buildWindowsPowershellScript(rawNode, rawScript);
    const encoded = encodePowershellCommand(psScript);
    return `${psExe} -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
  }

  const nodeExe = rawNode.replace(/\\/g, '/');
  const scriptPath = rawScript.replace(/\\/g, '/');
  return `"${nodeExe}" "${scriptPath}"`;
}

/**
 * Builds canonical hook handler object.
 */
function buildHookHandler(repoRoot) {
  return {
    type: 'command',
    command: getHookCommand(repoRoot),
    timeout: HOOK_TIMEOUT
  };
}

/**
 * Builds canonical hook group entry object.
 */
function buildHookEntry(repoRoot) {
  return {
    matcher: MATCHER_PATTERN,
    hooks: [buildHookHandler(repoRoot)]
  };
}

/**
 * Calculates SHA-256 hash of a JSON-serializable definition.
 */
function computeDefinitionHash(definition) {
  const json = JSON.stringify(definition);
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Checks if a specific command handler belongs to THIS project's guard.
 * Matches ONLY the exact full command or explicitly enumerated legacy commands for THIS repoRoot.
 * Never matches other projects or commands with additional/suffix arguments.
 */
function isOurHandler(handler, repoRoot) {
  if (!handler || typeof handler !== 'object' || Array.isArray(handler)) return false;
  if (handler.type !== 'command') return false;
  if (typeof handler.command !== 'string') return false;

  const cmd = handler.command.trim();
  let currentCommand = '';
  try {
    currentCommand = getHookCommand(repoRoot);
  } catch (_) {}
  if (currentCommand && cmd === currentCommand) return true;

  const scriptNorm = path.resolve(repoRoot, 'scripts', 'ae-tool-first-pretool.js').replace(/\\/g, '/');
  const scriptWin = path.resolve(repoRoot, 'scripts', 'ae-tool-first-pretool.js').replace(/\//g, '\\');
  const nodeNorm = process.execPath.replace(/\\/g, '/');
  const nodeWin = process.execPath.replace(/\//g, '\\');

  let winCmd = '';
  let nonWinCmd = '';
  try {
    const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    winCmd = getHookCommand(repoRoot, { platform: 'win32', systemRoot: sysRoot });
  } catch (_) {}
  try {
    nonWinCmd = getHookCommand(repoRoot, { platform: 'linux' });
  } catch (_) {}

  const enumeratedLegacy = new Set([
    `node "${scriptNorm}"`,
    `node ${scriptNorm}`,
    `node "${scriptWin}"`,
    `node ${scriptWin}`,
    `"${nodeNorm}" "${scriptNorm}"`,
    `"${nodeNorm}" ${scriptNorm}`,
    `"${nodeWin}" "${scriptWin}"`,
    `"${nodeWin}" ${scriptWin}`,
    `"${nodeNorm}" "${scriptWin}"`,
    `"${nodeWin}" "${scriptNorm}"`
  ]);

  if (winCmd) enumeratedLegacy.add(winCmd);
  if (nonWinCmd) enumeratedLegacy.add(nonWinCmd);

  // Also recognize round 1 bare powershell.exe wrapper for this repo
  try {
    const rawScript = path.win32.resolve(repoRoot, 'scripts', 'ae-tool-first-pretool.js');
    const psScript = buildWindowsPowershellScript(process.execPath, rawScript);
    const encoded = encodePowershellCommand(psScript);
    enumeratedLegacy.add(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`);
  } catch (_) {}

  return enumeratedLegacy.has(cmd);
}

/**
 * Strict schema validation for hooks configuration before mutation.
 * Throws an Error if container shape is null, array, incompatible, or malformed.
 */
function validateHooksContainerSchema(config) {
  if (config === null || config === undefined) {
    throw new Error('Incompatible hooks configuration: root cannot be null or undefined');
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Incompatible hooks configuration: root must be a non-null JSON object');
  }
  if (config.hooks !== undefined) {
    if (typeof config.hooks !== 'object' || Array.isArray(config.hooks) || config.hooks === null) {
      throw new Error('Incompatible hooks configuration: "hooks" property must be a non-null JSON object');
    }
    if (config.hooks[HOOK_EVENT_NAME] !== undefined) {
      if (!Array.isArray(config.hooks[HOOK_EVENT_NAME])) {
        throw new Error(`Incompatible hooks configuration: hooks.${HOOK_EVENT_NAME} must be an array`);
      }
      for (let i = 0; i < config.hooks[HOOK_EVENT_NAME].length; i++) {
        const item = config.hooks[HOOK_EVENT_NAME][i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new Error(`Incompatible hooks configuration: hooks.${HOOK_EVENT_NAME}[${i}] must be an object`);
        }
        if (Object.prototype.hasOwnProperty.call(item, 'matcher') && typeof item.matcher !== 'string') {
          throw new Error(`Incompatible hooks configuration: hooks.${HOOK_EVENT_NAME}[${i}].matcher must be a string`);
        }
        if (!Array.isArray(item.hooks)) {
          throw new Error(`Incompatible hooks configuration: hooks.${HOOK_EVENT_NAME}[${i}].hooks must be an array`);
        }
      }
    }
  }
}

/**
 * Merges our hook handler into existing hooks configuration preserving all foreign handlers and foreign groups.
 * Throws Error on malformed container shapes without making any changes.
 * Returns { config: Object, changed: boolean, definitionHash: string }.
 */
function mergeHooksConfig(existingConfig, repoRoot) {
  validateHooksContainerSchema(existingConfig);

  const config = JSON.parse(JSON.stringify(existingConfig));

  if (!config.hooks) {
    config.hooks = {};
  }
  if (!Array.isArray(config.hooks[HOOK_EVENT_NAME])) {
    config.hooks[HOOK_EVENT_NAME] = [];
  }

  const preToolList = config.hooks[HOOK_EVENT_NAME];
  const targetHandler = buildHookHandler(repoRoot);
  const targetHash = computeDefinitionHash(targetHandler);
  let changed = false;

  // 1. If our owned handler is present in any other matcher group, remove only our handler.
  // Preserve foreign groups (even if empty) unless our owned handler was actually removed from it.
  for (let i = preToolList.length - 1; i >= 0; i--) {
    const group = preToolList[i];
    if (group.matcher !== MATCHER_PATTERN) {
      const origCount = group.hooks.length;
      const hadOurHandler = group.hooks.some(h => isOurHandler(h, repoRoot));
      if (hadOurHandler) {
        group.hooks = group.hooks.filter(h => !isOurHandler(h, repoRoot));
        changed = true;
        // Only remove group if our owned handler was actually removed and made it empty
        if (group.hooks.length === 0 && origCount > 0) {
          preToolList.splice(i, 1);
        }
      }
    }
  }

  // 2. Find group matching our exact MATCHER_PATTERN
  const targetGroup = preToolList.find(g => g.matcher === MATCHER_PATTERN);

  if (targetGroup) {
    const existingHandlerIdx = targetGroup.hooks.findIndex(h => isOurHandler(h, repoRoot));
    if (existingHandlerIdx >= 0) {
      const currentHandler = targetGroup.hooks[existingHandlerIdx];
      const currentHash = computeDefinitionHash(currentHandler);
      if (currentHash === targetHash) {
        // Already matching handler in target group
        return { config, changed, definitionHash: targetHash };
      }
      // Update only our handler in place, preserving sibling handlers in targetGroup.hooks
      targetGroup.hooks[existingHandlerIdx] = targetHandler;
      changed = true;
    } else {
      // Append our handler to existing matcher group, preserving foreign siblings
      targetGroup.hooks.push(targetHandler);
      changed = true;
    }
  } else {
    // Create new matcher group with our handler
    preToolList.push({
      matcher: MATCHER_PATTERN,
      hooks: [targetHandler]
    });
    changed = true;
  }

  return { config, changed, definitionHash: targetHash };
}

/**
 * Removes ONLY our hook handler from configuration, preserving all foreign sibling handlers and foreign groups.
 * Throws Error on malformed container shapes without making any changes.
 * Returns { config: Object, changed: boolean }.
 */
function unmergeHooksConfig(existingConfig, repoRoot) {
  validateHooksContainerSchema(existingConfig);

  const config = JSON.parse(JSON.stringify(existingConfig));
  if (!config.hooks || !Array.isArray(config.hooks[HOOK_EVENT_NAME])) {
    return { config, changed: false };
  }

  const list = config.hooks[HOOK_EVENT_NAME];
  let changed = false;

  for (let i = list.length - 1; i >= 0; i--) {
    const group = list[i];
    if (Array.isArray(group.hooks)) {
      const origCount = group.hooks.length;
      const hadOurHandler = group.hooks.some(h => isOurHandler(h, repoRoot));
      if (hadOurHandler) {
        group.hooks = group.hooks.filter(h => !isOurHandler(h, repoRoot));
        changed = true;
        // Only remove group if our owned handler was removed and left it empty
        if (group.hooks.length === 0 && origCount > 0) {
          list.splice(i, 1);
        }
      }
    }
  }

  return { config, changed };
}

/**
 * Checks current installation state.
 */
function checkHooksInstallation(repoRoot) {
  const hooksFile = path.resolve(repoRoot, '.codex', 'hooks.json');
  const targetHandler = buildHookHandler(repoRoot);
  const definitionHash = computeDefinitionHash(targetHandler);
  const expectedGroup = buildHookEntry(repoRoot);

  if (!fs.existsSync(hooksFile)) {
    return {
      targetFile: hooksFile,
      installed: false,
      matching: false,
      definitionHash,
      hookDefinition: expectedGroup
    };
  }

  try {
    const raw = fs.readFileSync(hooksFile, 'utf-8');
    const parsed = JSON.parse(raw);
    validateHooksContainerSchema(parsed);

    const preToolList = (parsed && parsed.hooks && Array.isArray(parsed.hooks[HOOK_EVENT_NAME]))
      ? parsed.hooks[HOOK_EVENT_NAME]
      : [];

    let foundHandler = null;
    let foundInMatchingGroup = false;

    for (const group of preToolList) {
      if (Array.isArray(group.hooks)) {
        const h = group.hooks.find(cand => isOurHandler(cand, repoRoot));
        if (h) {
          foundHandler = h;
          if (group.matcher === MATCHER_PATTERN) {
            foundInMatchingGroup = true;
          }
          break;
        }
      }
    }

    if (!foundHandler) {
      return {
        targetFile: hooksFile,
        installed: false,
        matching: false,
        definitionHash,
        hookDefinition: expectedGroup
      };
    }

    const currentHash = computeDefinitionHash(foundHandler);
    const matching = foundInMatchingGroup && currentHash === definitionHash;

    return {
      targetFile: hooksFile,
      installed: true,
      matching,
      installedHash: currentHash,
      definitionHash,
      hookDefinition: expectedGroup
    };
  } catch (err) {
    return {
      targetFile: hooksFile,
      installed: false,
      matching: false,
      error: err.message,
      definitionHash,
      hookDefinition: expectedGroup
    };
  }
}

/**
 * Atomically writes JSON to target file with parent directory check.
 */
function writeHooksFileAtomic(targetFile, config) {
  const dir = path.dirname(targetFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpFile = `${targetFile}.tmp.${process.pid}.${Date.now()}`;
  const content = JSON.stringify(config, null, 2) + '\n';
  fs.writeFileSync(tmpFile, content, 'utf-8');
  fs.renameSync(tmpFile, targetFile);
}

function parseCliArgs(argv) {
  const flags = new Set(argv);
  const knownFlags = new Set(['--check', '--install', '--uninstall']);
  for (const flag of flags) {
    if (!knownFlags.has(flag)) {
      throw new Error(`Неизвестный аргумент командной строки: ${flag}`);
    }
  }

  const count = (flags.has('--check') ? 1 : 0)
    + (flags.has('--install') ? 1 : 0)
    + (flags.has('--uninstall') ? 1 : 0);

  if (count > 1) {
    throw new Error('Флаги --check, --install, --uninstall являются взаимоисключающими');
  }

  return {
    isCheck: flags.has('--check') || count === 0,
    isInstall: flags.has('--install'),
    isUninstall: flags.has('--uninstall')
  };
}

function main() {
  let cliModes;
  try {
    cliModes = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const hooksFile = path.resolve(repoRoot, '.codex', 'hooks.json');

  if (cliModes.isInstall) {
    let existingConfig;
    if (fs.existsSync(hooksFile)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(hooksFile, 'utf-8'));
      } catch (err) {
        console.error(`[ERROR] Не удалось распарсить существующий ${hooksFile}: ${err.message}`);
        process.exit(1);
      }
    } else {
      // Absent installer target uses initial empty object
      existingConfig = {};
    }

    let mergeResult;
    try {
      mergeResult = mergeHooksConfig(existingConfig, repoRoot);
    } catch (err) {
      console.error(`[ERROR] Отказ установки хука из-за несовместимой структуры файла: ${err.message}`);
      process.exit(1);
    }

    const { config, changed, definitionHash } = mergeResult;
    if (changed) {
      writeHooksFileAtomic(hooksFile, config);
      console.log(`[INSTALLED] Hook успешно записан в ${hooksFile}`);
    } else {
      console.log(`[IDEMPOTENT] Hook уже установлен и совпадает с текущим определением`);
    }

    console.log(JSON.stringify({
      targetFile: hooksFile,
      installed: true,
      definitionHash,
      matcher: MATCHER_PATTERN
    }, null, 2));
    process.exit(0);
  }

  if (cliModes.isUninstall) {
    if (!fs.existsSync(hooksFile)) {
      console.log(`[NOOP] ${hooksFile} не существует`);
      process.exit(0);
    }
    let existingConfig;
    try {
      existingConfig = JSON.parse(fs.readFileSync(hooksFile, 'utf-8'));
    } catch (err) {
      console.error(`[ERROR] Не удалось распарсить ${hooksFile}: ${err.message}`);
      process.exit(1);
    }

    let unmergeResult;
    try {
      unmergeResult = unmergeHooksConfig(existingConfig, repoRoot);
    } catch (err) {
      console.error(`[ERROR] Отказ удаления хука из-за несовместимой структуры файла: ${err.message}`);
      process.exit(1);
    }

    const { config, changed } = unmergeResult;
    if (changed) {
      writeHooksFileAtomic(hooksFile, config);
      console.log(`[UNINSTALLED] Hook удален из ${hooksFile}`);
    } else {
      console.log(`[NOOP] Hook не был установлен в ${hooksFile}`);
    }
    process.exit(0);
  }

  // Default: --check
  const status = checkHooksInstallation(repoRoot);
  console.log(JSON.stringify(status, null, 2));
  process.exit(status.installed && status.matching ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  HOOK_EVENT_NAME,
  MATCHER_PATTERN,
  HOOK_TIMEOUT,
  getRepoRoot,
  getHookCommand,
  buildHookHandler,
  buildHookEntry,
  computeDefinitionHash,
  isOurHandler,
  validateHooksContainerSchema,
  mergeHooksConfig,
  unmergeHooksConfig,
  checkHooksInstallation,
  writeHooksFileAtomic,
  parseCliArgs,
  validateWindowsPathSafe,
  validateWindowsShellTokenSafe,
  getWindowsPowerShellPath,
  SMART_QUOTES_REGEX,
  escapePowershellSingleQuote,
  buildWindowsPowershellScript,
  encodePowershellCommand,
  decodePowershellCommand
};
