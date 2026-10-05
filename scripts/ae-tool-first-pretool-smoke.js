#!/usr/bin/env node
/**
 * scripts/ae-tool-first-pretool-smoke.js
 *
 * Focused offline smoke test suite for AE Tool-First PreToolUse guard and installer.
 * Covers all material findings, vendor key alias normalization, first_unnamed_save scoping,
 * exact project handler ownership, schema validation, strict proposal pins, and guard-second-review.cjs.
 * No external dependencies. Windows adds native shell/guard subprocesses and parse-only AST fixtures.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const vm = require('vm');
const {
  evaluatePreToolUse,
  extractFallbackPacket,
  extractLeadingCommentPacket,
  parseKeyShortcut,
  extractShortcutsFromCode,
  checkCodeSubstitutions,
  isInsideProject,
  VALID_REASONS,
  FORBIDDEN_SUBSTITUTION_PRIMITIVES,
  EXACT_HARMLESS_CANARY_TEMPLATES
} = require('./ae-tool-first-pretool.js');

const cp = require('child_process');
const {
  mergeHooksConfig,
  unmergeHooksConfig,
  buildHookHandler,
  buildHookEntry,
  computeDefinitionHash,
  validateHooksContainerSchema,
  isOurHandler,
  getHookCommand,
  parseCliArgs,
  MATCHER_PATTERN,
  getRepoRoot,
  validateWindowsPathSafe,
  validateWindowsShellTokenSafe,
  getWindowsPowerShellPath,
  SMART_QUOTES_REGEX,
  escapePowershellSingleQuote,
  buildWindowsPowershellScript,
  encodePowershellCommand,
  decodePowershellCommand
} = require('./install-ae-tool-first-hook.js');

const PROJECT_ROOT = getRepoRoot();
let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('--- Suite 1: Canonical Project Scope & Sibling Safety (Realpath) ---');

runTest('Passes when cwd is realpath outside project root', () => {
  const result = evaluatePreToolUse({
    cwd: path.resolve(PROJECT_ROOT, '..'),
    tool_name: 'mcp__node_repl__js',
    tool_input: { code: 'console.log("outside");' }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(result.decision, 'pass');
  assert.strictEqual(result.reason, 'out of project scope');
});

runTest('Passes on sibling directory with same prefix name (sibling-safe)', () => {
  const siblingDir = `${PROJECT_ROOT}_other`;
  const mockFs = {
    realpathSync: (p) => path.normalize(p)
  };
  const isInside = isInsideProject(PROJECT_ROOT, siblingDir, { fsAdapter: mockFs });
  assert.strictEqual(isInside, false);

  const result = evaluatePreToolUse({
    cwd: siblingDir,
    tool_name: 'mcp__node_repl__js',
    tool_input: { code: 'console.log("sibling");' }
  }, { projectRoot: PROJECT_ROOT, fsAdapter: mockFs });
  assert.strictEqual(result.decision, 'pass');
  assert.strictEqual(result.reason, 'out of project scope');
});

runTest('Gated when cwd is exactly project root or nested subdirectory', () => {
  assert.strictEqual(isInsideProject(PROJECT_ROOT, PROJECT_ROOT), true);
  assert.strictEqual(isInsideProject(PROJECT_ROOT, path.join(PROJECT_ROOT, 'scripts')), true);
  const result = evaluatePreToolUse({
    cwd: path.join(PROJECT_ROOT, 'scripts'),
    tool_name: 'mcp__node_repl__js',
    tool_input: { code: 'console.log("nested");' }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(result.decision, 'deny');
});

runTest('Denies (fail closed) when cwd does not exist or cannot be canonicalized', () => {
  const result = evaluatePreToolUse({
    cwd: 'C:/NonExistentPath_XYZ_12345/subdir',
    tool_name: 'mcp__node_repl__js',
    tool_input: { code: 'console.log("test");' }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(result.decision, 'deny');
  assert(result.reason.includes('cwd не существует или не может быть канонизирован'));
});

console.log('\n--- Suite 2: Tool Name Catalog & Unmonitored Tools ---');

runTest('Denies when tool_name is missing or empty (fail closed)', () => {
  const r1 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_input: { code: '1+1' }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r1.decision, 'deny');
  assert(r1.reason.includes('отсутствует или некорректно обязательное имя инструмента'));

  const r2 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: '   ',
    tool_input: { code: '1+1' }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r2.decision, 'deny');
});

runTest('Passes unmonitored tools (e.g. get_project_info, search_solutions) with valid event', () => {
  const r1 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'get_project_info',
    tool_input: {}
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r1.decision, 'pass');

  const r2 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'search_solutions',
    tool_input: { query: 'montage' }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r2.decision, 'pass');
});

runTest('Gates both node_repl and cua_repl catalog variants', () => {
  const names = ['mcp__node_repl__js', 'mcp__cua_repl__js'];
  for (const name of names) {
    const res = evaluatePreToolUse({
      cwd: PROJECT_ROOT,
      tool_name: name,
      tool_input: { code: '1+1' }
    }, { projectRoot: PROJECT_ROOT });
    assert.strictEqual(res.decision, 'deny');
  }
});

console.log('\n--- Suite 3: Setup / Reset & Exact Harmless Canary Exemption ---');

runTest('Passes REPL reset tool without code', () => {
  const r1 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js_reset',
    tool_input: {}
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r1.decision, 'pass');
  assert.strictEqual(r1.reason, 'repl reset exemption');

  const r2 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__cua_repl__js_reset',
    tool_input: {}
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r2.decision, 'pass');
});

runTest('Passes REPL add node module dir setup tool', () => {
  const r = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js_add_node_module_dir',
    tool_input: { dir: './node_modules' }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r.decision, 'pass');
  assert.strictEqual(r.reason, 'repl setup exemption');
});

runTest('Passes exact harmless literal canary templates', () => {
  const harmlessTemplates = [
    '/* AE_TOOL_FIRST_READONLY_CANARY */',
    '// AE_TOOL_FIRST_READONLY_CANARY',
    '/* AE_TOOL_FIRST_READONLY_CANARY */ 0;'
  ];
  for (const tmpl of harmlessTemplates) {
    const r = evaluatePreToolUse({
      cwd: PROJECT_ROOT,
      tool_name: 'mcp__node_repl__js',
      tool_input: { code: tmpl }
    }, { projectRoot: PROJECT_ROOT });
    assert.strictEqual(r.decision, 'pass');
    assert.strictEqual(r.reason, 'read-only evaluator canary exemption');
  }
});

runTest('REGRESSION (P1): Denies canary substring alias bypass with arbitrary code', () => {
  const bypassCode = '/* AE_TOOL_FIRST_READONLY_CANARY */ await controllerAlias.click({window:w,x:5,y:5});';
  const r = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: { code: bypassCode }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r.decision, 'deny');
  assert(r.reason.includes('отсутствует классификация CU-capable вызова'));
});

console.log('\n--- Suite 4: Direct Code GUI Shortcuts & Vendor Key Alias Normalization ---');

runTest('CORRECTION 2 DEFECT: Denies vendor Control_L+o and Control+N shortcuts in diagnostics', () => {
  const title = JSON.stringify({
    reason: 'diagnostics',
    primitive: 'capture_ui_screenshot',
    evidence: 'actual vendor API key aliases'
  });

  // Control_L+o
  const r1 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title,
      code: "await sky.press_key({window:targetWindow,key:'Control_L+o'});"
    }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r1.decision, 'deny');
  assert(r1.reason.includes('запрещено открытие проекта'));

  // Control+N
  const r2 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title,
      code: "await sky.press_key({window:targetWindow,key:'Control+N'});"
    }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r2.decision, 'deny');
  assert(r2.reason.includes('запрещено создание проекта'));
});

runTest('CORRECTION 2 DEFECT: Preserves legitimate first_unnamed_save with fresh unnamed evidence', () => {
  const title = JSON.stringify({
    reason: 'typed_gap',
    primitive: 'first_unnamed_save',
    evidence: 'fresh native unnamed state, owned fixture'
  });
  const first = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title,
      code: "await sky.press_key({window:targetWindow,key:'Ctrl+Shift+S'});"
    }
  }, { projectRoot: PROJECT_ROOT });

  assert.strictEqual(first.decision, 'pass');
});

runTest('Denies Ctrl+Shift+S if reason is NOT typed_gap first_unnamed_save with fixture evidence', () => {
  // Wrong primitive (save_as instead of first_unnamed_save)
  const r1 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title: JSON.stringify({ reason: 'typed_gap', primitive: 'save_as', evidence: 'fresh native unnamed state, owned fixture' }),
      code: "await sky.press_key({key:'Ctrl+Shift+S'});"
    }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r1.decision, 'deny');

  // Missing fixture in evidence
  const r2 = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title: JSON.stringify({ reason: 'typed_gap', primitive: 'first_unnamed_save', evidence: 'general save' }),
      code: "await sky.press_key({key:'Ctrl+Shift+S'});"
    }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r2.decision, 'deny');
});

runTest('Normalizes multiline press_key calls with whitespace and modifiers', () => {
  const multilineCode = `await sky.press_key({
    window: targetWindow,
    key: ' Control_R  +  Shift_R + s '
  });`;
  const r = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title: JSON.stringify({ reason: 'diagnostics', primitive: 'capture_ui_screenshot', evidence: 'diag' }),
      code: multilineCode
    }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r.decision, 'deny');
});

console.log('\n--- Suite 5: Real Leading Code Comment Only & Strict JSON Extraction ---');

runTest('REGRESSION (P2): Denies fake fallback comment placed inside a string literal', () => {
  const fakeStringCode = `const fake = "/* AE_TOOL_FIRST_FALLBACK: { \\"reason\\": \\"diagnostics\\", \\"primitive\\": \\"capture_ui_screenshot\\", \\"evidence\\": \\"e\\" } */";
await sky.click();`;
  const r = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: { code: fakeStringCode }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r.decision, 'deny');
  assert(r.reason.includes('отсутствует классификация CU-capable вызова'));
});

runTest('Passes valid leading block comment with strict JSON', () => {
  const code = `/* AE_TOOL_FIRST_FALLBACK: { "reason": "diagnostics", "primitive": "capture_ui_screenshot", "evidence": "diag-1" } */
sky.screenshot();`;
  const r = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: { code }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r.decision, 'pass');
});

console.log('\n--- Suite 6: Strict Proposal Pins (UUID, Positive Int, SHA-256) ---');

runTest('CORRECTION 2 DEFECT: Denies dryRunId as boolean true and requires actual UUID', () => {
  const pinsWithBool = {
    actionId: 'act_' + '1'.repeat(32),
    instanceUUID: '11111111-2222-4333-8444-555555555555',
    revision: 1,
    dryRunId: true, // bool true not allowed!
    payloadHash: 'a'.repeat(64)
  };
  const r = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title: JSON.stringify({
        reason: 'protected_confirmation',
        primitive: 'confirm_proposal_dialog',
        evidence: 'plan-1',
        proposalPins: pinsWithBool
      }),
      code: 'sky.click(confirmBtn);'
    }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r.decision, 'deny');
  assert(r.reason.includes('dryRunId обязан быть валидным строковым UUID'));
});

runTest('Denies missing or invalid sha256 payload/preview hash', () => {
  const pinsBadHash = {
    actionId: 'act_' + '1'.repeat(32),
    instanceUUID: '11111111-2222-4333-8444-555555555555',
    revision: 1,
    dryRunId: '22222222-3333-4444-8555-666666666666',
    payloadHash: 'short-hash' // not 64 hex!
  };
  const r = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title: JSON.stringify({
        reason: 'protected_confirmation',
        primitive: 'confirm_proposal_dialog',
        evidence: 'plan-1',
        proposalPins: pinsBadHash
      }),
      code: 'sky.click(confirmBtn);'
    }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r.decision, 'deny');
  assert(r.reason.includes('требует хеша формы sha256'));
});

runTest('Passes protected_confirmation with full UUIDs, positive revision, and sha256 hash', () => {
  const validPins = {
    actionId: 'act_' + 'abcdef01'.repeat(4),
    instanceUUID: '11111111-2222-4333-8444-555555555555',
    revision: 5,
    dryRunId: '22222222-3333-4444-8555-666666666666',
    payloadHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
  };
  const r = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      title: JSON.stringify({
        reason: 'protected_confirmation',
        primitive: 'confirm_proposal_dialog',
        evidence: 'plan-1',
        proposalPins: validPins
      }),
      code: 'sky.click(confirmBtn);'
    }
  }, { projectRoot: PROJECT_ROOT });
  assert.strictEqual(r.decision, 'pass');
});

console.log('\n--- Suite 7: Installer Exact Handler Ownership & Foreign Preservation ---');

runTest('CORRECTION 2 DEFECT: Preserves other-project handler with same basename', () => {
  const foreign = { type: 'command', command: 'node C:/another-project/scripts/ae-tool-first-pretool.js' };
  const initial = { hooks: { PreToolUse: [{ matcher: 'foreign', hooks: [foreign] }] } };
  const merged = mergeHooksConfig(initial, PROJECT_ROOT).config;
  const jsonStr = JSON.stringify(merged);
  assert.strictEqual(jsonStr.includes(foreign.command), true);

  // Unmerge also preserves foreign handler
  const unmerged = unmergeHooksConfig(merged, PROJECT_ROOT).config;
  assert.strictEqual(JSON.stringify(unmerged).includes(foreign.command), true);
});

runTest('CORRECTION 2 DEFECT: Null config throws error without modifying', () => {
  assert.throws(() => {
    mergeHooksConfig(null, PROJECT_ROOT);
  }, /Incompatible hooks configuration/);

  assert.throws(() => {
    unmergeHooksConfig(null, PROJECT_ROOT);
  }, /Incompatible hooks configuration/);
});

runTest('getHookCommand uses absolute process.execPath and script path safely across platforms', () => {
  const nonWinCmd = getHookCommand(PROJECT_ROOT, { platform: 'linux' });
  const expectedNode = `"${process.execPath.replace(/\\/g, '/')}"`;
  const expectedScript = `"${path.resolve(PROJECT_ROOT, 'scripts/ae-tool-first-pretool.js').replace(/\\/g, '/')}"`;
  assert.strictEqual(nonWinCmd, `${expectedNode} ${expectedScript}`);

  const winFixtureRoot = 'C:\\Windows';
  const winCmd = getHookCommand(PROJECT_ROOT, { platform: 'win32', systemRoot: winFixtureRoot });
  const psExe = getWindowsPowerShellPath({ platform: 'win32', systemRoot: winFixtureRoot });
  assert(winCmd.startsWith(`${psExe} -NoProfile -NonInteractive -EncodedCommand `));
  const b64 = winCmd.replace(`${psExe} -NoProfile -NonInteractive -EncodedCommand `, '');
  const decoded = decodePowershellCommand(b64);
  const escNode = escapePowershellSingleQuote(process.execPath);
  const escScript = escapePowershellSingleQuote(path.win32.resolve(PROJECT_ROOT, 'scripts', 'ae-tool-first-pretool.js'));
  assert.strictEqual(decoded, `& '${escNode}' '${escScript}'`);

  const currentCmd = getHookCommand(PROJECT_ROOT);
  if (process.platform === 'win32') {
    const actualPsExe = getWindowsPowerShellPath();
    assert.strictEqual(currentCmd, `${actualPsExe} -NoProfile -NonInteractive -EncodedCommand ${b64}`);
  } else {
    assert.strictEqual(currentCmd, nonWinCmd);
  }
});

runTest('getHookCommand keeps pure Windows root fixtures independent of the current environment', () => {
  for (const systemRoot of ['C:\\Windows', 'D:\\Windows']) {
    const command = getHookCommand(PROJECT_ROOT, { platform: 'win32', systemRoot });
    const prefix = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -NonInteractive -EncodedCommand `;
    assert(command.startsWith(prefix), `Expected pinned executable under fixture ${systemRoot}`);
    assert.strictEqual(
      decodePowershellCommand(command.slice(prefix.length)),
      `& '${escapePowershellSingleQuote(process.execPath)}' '${escapePowershellSingleQuote(path.win32.resolve(PROJECT_ROOT, 'scripts', 'ae-tool-first-pretool.js'))}'`
    );
  }
});

console.log('\n--- Suite 8: Exact guard-second-review.cjs Replication ---');

runTest('Replicates exact guard-second-review.cjs output assertions', () => {
  const diag = code => evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      code,
      title: JSON.stringify({ reason: 'diagnostics', primitive: 'capture_ui_screenshot', evidence: 'actual vendor API key aliases' })
    }
  });

  const title = JSON.stringify({ reason: 'typed_gap', primitive: 'first_unnamed_save', evidence: 'fresh native unnamed state, owned fixture' });
  const first = evaluatePreToolUse({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: { title, code: "await sky.press_key({window:targetWindow,key:'Ctrl+Shift+S'});" }
  });

  const foreign = { type: 'command', command: 'node C:/another-project/scripts/ae-tool-first-pretool.js' };
  const initial = { hooks: { PreToolUse: [{ matcher: 'foreign', hooks: [foreign] }] } };
  const merged = mergeHooksConfig(initial, PROJECT_ROOT).config;

  const controlLResult = diag("await sky.press_key({window:targetWindow,key:'Control_L+o'});");
  const controlResult = diag("await sky.press_key({window:targetWindow,key:'Control+N'});");
  const foreignPreserved = JSON.stringify(merged).includes(foreign.command);
  const nullAccepted = (() => {
    try {
      mergeHooksConfig(null, PROJECT_ROOT);
      return true;
    } catch (_) {
      return false;
    }
  })();
  const hookCmd = getHookCommand(PROJECT_ROOT);

  assert.strictEqual(controlLResult.decision, 'deny');
  assert.strictEqual(controlResult.decision, 'deny');
  assert.strictEqual(first.decision, 'pass');
  assert.strictEqual(foreignPreserved, true);
  assert.strictEqual(nullAccepted, false);
  if (process.platform === 'win32') {
    const winExpected = getHookCommand(PROJECT_ROOT, { platform: 'win32' });
    assert.strictEqual(hookCmd, winExpected);
  } else {
    assert.strictEqual(hookCmd, `"${process.execPath.replace(/\\/g, '/')}" "${path.resolve(PROJECT_ROOT, 'scripts/ae-tool-first-pretool.js').replace(/\\/g, '/')}"`);
  }
});

console.log('\n--- Suite 9: Final Review Regressions (Quoted Keys, Literal Canary, Action Shape, Optional Matcher) ---');

const REVIEW_VALID_PINS = {
  actionId: 'act_' + '0123456789abcdef'.repeat(2),
  instanceUUID: '11111111-2222-4333-8444-555555555555', revision: 1,
  dryRunId: '22222222-3333-4444-8555-666666666666', payloadHash: 'a'.repeat(64)
};
const REVIEW_PRIMITIVES = {
  typed_gap: 'documented_gap_action', visual_ui_only: 'observe_ui', panel_bootstrap: 'open_closed_panel',
  protected_confirmation: 'confirm_proposal_dialog', modal_blocker: 'dismiss_ae_modal', diagnostics: 'capture_ui_screenshot'
};
let finalReviewCases = 0;
function reviewInvocation(tool, packet, code, nested) {
  const input = { title: JSON.stringify(packet), code };
  return evaluatePreToolUse({ cwd: PROJECT_ROOT, tool_name: tool, tool_input: nested ? { input } : input });
}
for (const reason of VALID_REASONS) runTest(`Final review: quoted/nested forbidden keys cannot bypass ${reason}`, () => {
  const packet = { reason, primitive: REVIEW_PRIMITIVES[reason], evidence: 'bounded offline fixture', proposalPins: REVIEW_VALID_PINS };
  const forbiddenKeys = [
    ['Control_L + o', 'открытие проекта'], ['Control_R + N', 'создание проекта'],
    ['Ctrl + s', 'сохранение проекта'], ['s + Control_L', 'сохранение проекта'],
    ['Control_R + r', 'reload панели'], ['F5', 'reload панели'],
    ['Shift_R + Control_L + s', 'именованное сохранение'], ['s + Shift_L + Ctrl', 'именованное сохранение'],
    ['Alt_L + Control_R + S', 'именованное сохранение'], ['Command + Shift + s', 'именованное сохранение']
  ];
  for (const tool of ['mcp__node_repl__js', 'mcp__cua_repl__js']) for (const nested of [false, true])
    for (const prop of ['key', '"key"', "'key'"]) for (const quote of ['"', "'"]) for (const [key, denial] of forbiddenKeys) {
      const code = `await sky.press_key({\n ${prop}: ${quote}${key}${quote}\n});`;
      const result = reviewInvocation(tool, packet, code, nested);
      assert.strictEqual(result.decision, 'deny', `${reason}/${tool}/${nested}/${prop}/${key}`);
      assert(result.reason.includes(denial), result.reason); finalReviewCases++;
    }
  // Benign keys still need, and can retain, their scoped packet.
  for (const key of ['Return', 'Control_L + Return', 'Shift_R + Escape']) {
    assert.strictEqual(reviewInvocation('mcp__cua_repl__js', packet, `await sky.press_key({"key":"${key}"});`, true).decision, 'pass'); finalReviewCases++;
  }
});

runTest('Final review: spaced combinations outside key property use the same parser', () => {
  const packet = { reason: 'diagnostics', primitive: 'capture_ui_screenshot', evidence: 'bounded fixture' };
  for (const code of ["await sky.press_key('Control_L + o');", "await sky.hotkey('Shift + Ctrl + s');", "const combo = 'o + Control_R';"])
    { assert.strictEqual(reviewInvocation('mcp__cua_repl__js', packet, code, false).decision, 'deny'); finalReviewCases++; }
});

runTest('Final review: quoted first_unnamed_save remains a scoped declaration, not native proof', () => {
  const packet = { reason: 'typed_gap', primitive: 'first_unnamed_save', evidence: 'fresh unnamed state, owned fixture' };
  for (const key of ['Ctrl + Shift + S', 'Shift_R + Control_L + s', 's + Control_R + Alt_L']) {
    assert.strictEqual(reviewInvocation('mcp__cua_repl__js', packet, `await sky.press_key({'key': '${key}'});`, true).decision, 'pass');
    const invalid = { ...packet, evidence: 'named source' };
    assert.strictEqual(reviewInvocation('mcp__cua_repl__js', invalid, `await sky.press_key({"key": "${key}"});`, true).decision, 'deny'); finalReviewCases += 2;
  }
});

runTest('Final review: canary literals do no persistent property lookup, former process templates deny', () => {
  let reads = 0;
  const dynamicProcess = {};
  Object.defineProperty(dynamicProcess, 'version', { get() { reads++; return 'mutable binding'; } });
  const context = vm.createContext({ process: dynamicProcess });
  for (const code of EXACT_HARMLESS_CANARY_TEMPLATES) {
    assert(!code.includes('process'));
    const result = evaluatePreToolUse({ cwd: PROJECT_ROOT, tool_name: 'mcp__cua_repl__js', tool_input: { code } });
    assert.strictEqual(result.decision, 'pass'); vm.runInContext(`(function(){${code}\n})()`, context); finalReviewCases++;
  }
  const former = ['/* AE_TOOL_FIRST_READONLY_CANARY */ process.version;',
    '/* AE_TOOL_FIRST_READONLY_CANARY */ const v = process.version; return v;',
    '/* AE_TOOL_FIRST_READONLY_CANARY */ return process.version;'];
  for (const code of former) {
    const result = evaluatePreToolUse({ cwd: PROJECT_ROOT, tool_name: 'mcp__node_repl__js', tool_input: { input: { code } } });
    assert.strictEqual(result.decision, 'deny'); finalReviewCases++;
  }
  assert.strictEqual(reads, 0);
  // Negative control: the former exact template actually invokes that getter if evaluated.
  vm.runInContext(`(function(){${former[1]}})()`, context); assert.strictEqual(reads, 1); finalReviewCases++;
});

runTest('Final review: actionId accepts only generated lowercase act_32hex shape', () => {
  const packet = { reason: 'protected_confirmation', primitive: 'confirm_proposal_dialog', evidence: 'fixture', proposalPins: REVIEW_VALID_PINS };
  assert.strictEqual(reviewInvocation('mcp__cua_repl__js', packet, 'sky.click(confirmBtn);', true).decision, 'pass'); finalReviewCases++;
  for (const actionId of ['', 'invalid-but-nonempty', 'act-UUID', 'act_' + 'a'.repeat(31), 'act_' + 'a'.repeat(33),
    'act_' + 'A'.repeat(32), 'ACT_' + 'a'.repeat(32), ' act_' + 'a'.repeat(32), 'act_' + 'a'.repeat(32) + ' ', true, null]) {
    const result = reviewInvocation('mcp__cua_repl__js', { ...packet, proposalPins: { ...REVIEW_VALID_PINS, actionId } }, 'sky.click(confirmBtn);', true);
    assert.strictEqual(result.decision, 'deny'); assert(result.reason.includes('proposalPins.actionId')); finalReviewCases++;
  }
});

runTest('Final review: foreign match-all groups preserve absent matcher across merge/repeat/unmerge', () => {
  const foreign = { type: 'command', command: 'foreign-hook' };
  const initial = { hooks: { PreToolUse: [{ hooks: [foreign] }, { hooks: [] }], PostToolUse: [{ hooks: [{ type: 'command', command: 'foreign-post' }] }] } };
  const untouched = JSON.stringify(initial), merged = mergeHooksConfig(initial, PROJECT_ROOT);
  assert.strictEqual(JSON.stringify(initial), untouched); assert.deepStrictEqual(merged.config.hooks.PreToolUse[0], initial.hooks.PreToolUse[0]);
  assert(!Object.prototype.hasOwnProperty.call(merged.config.hooks.PreToolUse[0], 'matcher'));
  assert.deepStrictEqual(merged.config.hooks.PreToolUse[1], { hooks: [] });
  const repeated = mergeHooksConfig(merged.config, PROJECT_ROOT); assert.strictEqual(repeated.changed, false); assert.deepStrictEqual(repeated.config, merged.config);
  assert.deepStrictEqual(unmergeHooksConfig(merged.config, PROJECT_ROOT).config, initial); finalReviewCases++;
  const mixed = { hooks: { PreToolUse: [{ hooks: [foreign, buildHookHandler(PROJECT_ROOT)] }] } };
  const relocated = mergeHooksConfig(mixed, PROJECT_ROOT).config;
  assert.deepStrictEqual(relocated.hooks.PreToolUse[0], { hooks: [foreign] }); finalReviewCases++;
});

runTest('Final review: present nonstring matcher fails without mutation, empty matcher survives', () => {
  for (const matcher of [null, 1, true, [], {}, undefined]) {
    const config = { hooks: { PreToolUse: [{ matcher, hooks: [] }] } }, before = JSON.stringify(config);
    assert.throws(() => mergeHooksConfig(config, PROJECT_ROOT), /matcher must be a string/);
    assert.throws(() => unmergeHooksConfig(config, PROJECT_ROOT), /matcher must be a string/);
    assert.strictEqual(JSON.stringify(config), before); finalReviewCases++;
  }
  const config = { hooks: { PreToolUse: [{ matcher: '', hooks: [] }] } };
  assert.deepStrictEqual(unmergeHooksConfig(mergeHooksConfig(config, PROJECT_ROOT).config, PROJECT_ROOT).config, config); finalReviewCases++;
});
console.log('\n--- Suite 10: Windows Shell-Portability & Subprocess Verification (CMD & PowerShell) ---');

function runSubprocessViaCmd(commandStr, stdinPayload) {
  const cmdLine = commandStr.includes('"') ? `"${commandStr}"` : commandStr;
  return cp.spawnSync('cmd.exe', ['/d', '/s', '/c', cmdLine], {
    input: stdinPayload,
    encoding: 'utf-8',
    windowsVerbatimArguments: true,
    timeout: 15000
  });
}

function runSubprocessViaPowerShell(commandStr, stdinPayload) {
  return cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', commandStr], {
    input: stdinPayload,
    encoding: 'utf-8',
    windowsVerbatimArguments: true,
    timeout: 15000
  });
}

runTest('Suite 10: Special characters in Windows paths (spaces, apostrophes, $, backticks) are safely literal and do not inject code', () => {
  const nodeWithSpecial = 'C:\\Program Files\\Node\'s $dir\\`test\\node.exe';
  const scriptWithSpecial = 'C:\\My Projects\\AE\'s $agent\\`pretool\\scripts\\ae-tool-first-pretool.js';

  const script = buildWindowsPowershellScript(nodeWithSpecial, scriptWithSpecial);
  assert.strictEqual(
    script,
    "& 'C:\\Program Files\\Node''s $dir\\`test\\node.exe' 'C:\\My Projects\\AE''s $agent\\`pretool\\scripts\\ae-tool-first-pretool.js'"
  );

  const encoded = encodePowershellCommand(script);
  const decoded = decodePowershellCommand(encoded);
  assert.strictEqual(decoded, script);

  // Illegal control characters must fail closed before write
  assert.throws(() => validateWindowsPathSafe('C:\\invalid\npath\\node.exe'), /illegal control characters/);
  assert.throws(() => validateWindowsPathSafe('C:\\invalid\rpath\\node.exe'), /illegal control characters/);
  assert.throws(() => validateWindowsPathSafe('C:\\invalid\0path\\node.exe'), /illegal control characters/);
  assert.throws(() => validateWindowsPathSafe(''), /non-empty string/);
  assert.throws(() => validateWindowsPathSafe('   '), /non-empty string/);
});

runTest('Suite 10: Smart quotes fail closed before write; AST parse verification without fixture execution', () => {
  // Point (2): Fixtures with Unicode smart quotes (U+2018, U+2019, etc.) must fail closed before write
  const smartQuoteFixture1 = 'C:\\AE’s Agent\\node.exe'; // U+2019 right single quote
  const smartQuoteFixture2 = 'C:\\AE‘s Agent\\node.exe'; // U+2018 left single quote
  const smartQuoteFixture3 = 'C:\\AE’s Agent; # malicious injection\\script.js';

  assert.throws(() => validateWindowsPathSafe(smartQuoteFixture1), /unsupported Unicode smart quotes/);
  assert.throws(() => validateWindowsPathSafe(smartQuoteFixture2), /unsupported Unicode smart quotes/);
  assert.throws(() => validateWindowsPathSafe(smartQuoteFixture3), /unsupported Unicode smart quotes/);
  assert.throws(() => getHookCommand(PROJECT_ROOT, { platform: 'win32', systemRoot: 'C:\\Windows', execPath: smartQuoteFixture1 }), /unsupported Unicode smart quotes/);

  // Supported special characters (ASCII apostrophes, spaces, $, backticks, harmless semicolons/hashes in benign path context)
  const validSpecialNode = 'C:\\Program Files\\Node\'s $app\\`build\\node.exe';
  const validSpecialScript = 'C:\\Projects\\AE\'s Agent\\scripts\\ae-tool-first-pretool.js';
  const validScript = buildWindowsPowershellScript(validSpecialNode, validSpecialScript);
  assert.strictEqual(
    validScript,
    "& 'C:\\Program Files\\Node''s $app\\`build\\node.exe' 'C:\\Projects\\AE''s Agent\\scripts\\ae-tool-first-pretool.js'"
  );

  // On Windows, audit via PowerShell AST parser API without executing any fixture.
  // All fixture strings cross stdin as ASCII Base64 to preserve Unicode regardless of console encoding.
  if (process.platform === 'win32') {
    const auditCode = `
      $ProgressPreference = 'SilentlyContinue';
      $ErrorActionPreference = 'Stop';
      $inputObj = [Console]::In.ReadToEnd() | ConvertFrom-Json;
      $inputCode = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($inputObj.inputCode));
      $expectedNode = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($inputObj.expectedNode));
      $expectedScript = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($inputObj.expectedScript));
      $tokens = $null; $errors = $null;
      $ast = [System.Management.Automation.Language.Parser]::ParseInput($inputCode, [ref]$tokens, [ref]$errors);
      $commands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true));
      $report = [ordered]@{ parseErrorCount = $errors.Count; commandCount = $commands.Count; failureCode = 0 };
      function Complete-Audit([int]$code) {
        $report.failureCode = $code;
        $report | ConvertTo-Json -Compress;
        exit $code;
      }

      if ($errors.Count -gt 0) { Complete-Audit 10; }
      if ($ast.ParamBlock -or $ast.DynamicParamBlock -or $ast.BeginBlock -or $ast.ProcessBlock -or
          $ast.Attributes.Count -gt 0 -or $ast.UsingStatements.Count -gt 0 -or
          -not $ast.EndBlock -or -not $ast.EndBlock.Unnamed -or
          $ast.EndBlock.Traps.Count -gt 0 -or $ast.EndBlock.Statements.Count -ne 1) { Complete-Audit 11; }
      $pipeline = $ast.EndBlock.Statements[0];
      if (-not ($pipeline -is [System.Management.Automation.Language.PipelineAst])) { Complete-Audit 12; }
      if ($pipeline.PipelineElements.Count -ne 1) { Complete-Audit 13; }
      $command = $pipeline.PipelineElements[0];
      if (-not ($command -is [System.Management.Automation.Language.CommandAst])) { Complete-Audit 14; }
      if ($command.InvocationOperator -ne [System.Management.Automation.Language.TokenKind]::Ampersand) { Complete-Audit 15; }
      if ($command.CommandElements.Count -ne 2) { Complete-Audit 16; }
      if ($command.Redirections.Count -ne 0 -or $commands.Count -ne 1) { Complete-Audit 17; }

      $nodeLiteral = $command.CommandElements[0];
      $scriptLiteral = $command.CommandElements[1];
      if (-not ($nodeLiteral -is [System.Management.Automation.Language.StringConstantExpressionAst]) -or
          -not ($scriptLiteral -is [System.Management.Automation.Language.StringConstantExpressionAst])) { Complete-Audit 18; }
      if ($nodeLiteral.StringConstantType -ne [System.Management.Automation.Language.StringConstantType]::SingleQuoted -or
          $scriptLiteral.StringConstantType -ne [System.Management.Automation.Language.StringConstantType]::SingleQuoted) { Complete-Audit 19; }
      if ($nodeLiteral.Value -cne $expectedNode -or $scriptLiteral.Value -cne $expectedScript) { Complete-Audit 20; }
      Complete-Audit 0;
    `;

    function runAstAudit(inputCode, expectedNode, expectedScript) {
      const encodeFixture = value => Buffer.from(value, 'utf8').toString('base64');
      const result = cp.spawnSync(getWindowsPowerShellPath(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowershellCommand(auditCode)], {
        input: JSON.stringify({
          inputCode: encodeFixture(inputCode),
          expectedNode: encodeFixture(expectedNode),
          expectedScript: encodeFixture(expectedScript)
        }),
        encoding: 'utf-8',
        windowsVerbatimArguments: true,
        timeout: 10000
      });
      assert.ifError(result.error);
      assert.strictEqual(result.signal, null, 'AST auditor must finish without timeout or termination');
      assert.strictEqual(result.stderr.trim(), '', `AST auditor itself failed: ${result.stderr}`);
      const audit = JSON.parse(result.stdout.trim());
      assert.strictEqual(result.status, audit.failureCode, 'AST auditor exit must match its structural verdict');
      return { ...result, audit };
    }

    // 1. Safe path with ASCII apostrophe, $, backtick, spaces: must pass exact AST literal check
    const validRes = runAstAudit(validScript, validSpecialNode, validSpecialScript);
    assert.strictEqual(validRes.status, 0, `Valid safe script must pass AST audit: ${validRes.stderr} (status ${validRes.status})`);
    assert.deepStrictEqual(validRes.audit, { parseErrorCount: 0, commandCount: 1, failureCode: 0 });

    const punctuationNode = 'C:\\Узел; # literal\\Node\'s $app\\`build\\node.exe';
    const punctuationScript = 'D:\\Проект; # literal\\scripts\\ae-tool-first-pretool.js';
    const punctuationRes = runAstAudit(buildWindowsPowershellScript(punctuationNode, punctuationScript), punctuationNode, punctuationScript);
    assert.deepStrictEqual(punctuationRes.audit, { parseErrorCount: 0, commandCount: 1, failureCode: 0 });

    // 2. Negative control: Unescaped smart quote fixture C:\AE’s Agent\node.exe
    // Delimiter behavior splits path into multiple command elements and corrupts Value
    const brokenScript = `& 'C:\\AE’s Agent\\node.exe' 'C:\\test\\script.js'`;
    const brokenRes = runAstAudit(brokenScript, 'C:\\AE’s Agent\\node.exe', 'C:\\test\\script.js');
    assert.notStrictEqual(brokenRes.status, 0, 'Unescaped smart quote must fail AST exact-literal validation');

    // 3. Negative control: Old unsafe quoted path without & fails PowerShell parser completely
    const oldQuotedScript = `"C:\\Program Files\\nodejs\\node.exe" "C:\\test\\script.js"`;
    const oldQuotedRes = runAstAudit(oldQuotedScript, 'C:\\Program Files\\nodejs\\node.exe', 'C:\\test\\script.js');
    assert.notStrictEqual(oldQuotedRes.status, 0, 'Old unsafe quoted path without & must fail AST parser');

    // 4. A smart quote plus semicolon/hash can produce zero parse errors and one command,
    // yet split the literal path. Those shallow criteria must not approve it.
    const injectionScript = `& 'C:\\AE’s Agent; # malicious' 'C:\\test\\script.js'`;
    const injectionRes = runAstAudit(injectionScript, 'C:\\AE’s Agent; # malicious', 'C:\\test\\script.js');
    assert.strictEqual(injectionRes.audit.parseErrorCount, 0, 'Marker fixture must be syntactically valid to test exact literal validation');
    assert.strictEqual(injectionRes.audit.commandCount, 1, 'Marker fixture must contain only one parsed command');
    assert.notStrictEqual(injectionRes.status, 0, 'Injection marker with smart quote must fail AST validation');

    // Every fixture below is parsed only. It is never invoked by the auditor.
    const rejectedForms = [
      `${validScript}; Write-Output 'AST_ONLY_MARKER'`,
      `if ($true) { ${validScript} }`,
      `${validScript} | Write-Output`,
      `${validScript} > 'AST_ONLY_MARKER'`,
      `. '${escapePowershellSingleQuote(validSpecialNode)}' '${escapePowershellSingleQuote(validSpecialScript)}'`,
      `& $node '${escapePowershellSingleQuote(validSpecialScript)}'`,
      `& '${escapePowershellSingleQuote(validSpecialNode)}' $script`,
      `& "C:\\Node\\node.exe" 'C:\\script.js'`,
      buildWindowsPowershellScript(validSpecialNode.toLowerCase(), validSpecialScript),
      `begin {} end { ${validScript} }`,
      `end { ${validScript} }`,
      `trap {} ${validScript}`
    ];
    for (const inputCode of rejectedForms) {
      const result = runAstAudit(inputCode, validSpecialNode, validSpecialScript);
      assert.notStrictEqual(result.status, 0, `Additional statements, commands or nonexact literals must fail: ${inputCode}`);
    }
    console.log(`  Windows AST matrix: 2 literal positives, ${3 + rejectedForms.length} negative fixtures; Parser::ParseInput only.`);
  }
});

runTest('Suite 10: Pin trusted native Windows PowerShell under SystemRoot; no PATH or cwd fallback', () => {
  const winFixtureRoot = 'C:\\Windows';
  // Point (3): Unquoted executable path is absolute under SystemRoot
  const winCmd = getHookCommand(PROJECT_ROOT, { platform: 'win32', systemRoot: winFixtureRoot });
  const exeToken = winCmd.split(' -NoProfile')[0];
  assert(path.win32.isAbsolute(exeToken), 'PowerShell executable must be absolute');
  assert(!exeToken.startsWith('powershell.exe'), 'Must not use bare powershell.exe');
  assert(!exeToken.startsWith('powershell '), 'Must not use bare powershell');
  assert(/System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe/i.test(exeToken), 'Must pin WindowsPowerShell v1.0 under System32');

  // Safe unquoted token validation
  validateWindowsShellTokenSafe(exeToken);

  // Fails closed if SystemRoot has whitespace
  assert.throws(
    () => getWindowsPowerShellPath({ systemRoot: 'C:\\Weird Windows Path' }),
    /contains whitespace and cannot be safely unquoted/
  );

  // Fails closed if SystemRoot has metacharacters
  assert.throws(
    () => getWindowsPowerShellPath({ systemRoot: 'C:\\Windows&more' }),
    /contains shell metacharacters/
  );

  // Fails closed if powershellPath is relative (cwd spoof attempt)
  assert.throws(
    () => getWindowsPowerShellPath({ powershellPath: 'powershell.exe' }),
    /must be an absolute path \(no PATH\/cwd resolution\)/
  );
  assert.throws(
    () => getWindowsPowerShellPath({ powershellPath: './powershell.exe' }),
    /must be an absolute path/
  );

  // Point (1): Fails closed if SystemRoot is explicitly empty string, null, or whitespace
  assert.throws(
    () => getWindowsPowerShellPath({ systemRoot: '', platform: 'other' }),
    /SystemRoot is not defined/
  );
  assert.throws(
    () => getWindowsPowerShellPath({ systemRoot: null }),
    /SystemRoot is not defined/
  );
  assert.throws(
    () => getWindowsPowerShellPath({ systemRoot: '   ' }),
    /SystemRoot is not defined/
  );
});

runTest('Suite 10: Idempotent migration of historical direct quoted command for THIS repoRoot', () => {
  const historicalCmd = `"${process.execPath.replace(/\\/g, '/')}" "${path.resolve(PROJECT_ROOT, 'scripts/ae-tool-first-pretool.js').replace(/\\/g, '/')}"`;
  const foreignCmd = 'node C:/another-project/scripts/ae-tool-first-pretool.js';
  const foreignGroup = { matcher: 'other-matcher', hooks: [{ type: 'command', command: 'other-cmd' }] };
  const emptyForeignGroup = { hooks: [] };

  const initial = {
    hooks: {
      PreToolUse: [
        foreignGroup,
        {
          matcher: MATCHER_PATTERN,
          hooks: [
            { type: 'command', command: foreignCmd, timeout: 5 },
            { type: 'command', command: historicalCmd, timeout: 5 }
          ]
        },
        emptyForeignGroup
      ]
    }
  };

  const merge1 = mergeHooksConfig(initial, PROJECT_ROOT);
  // Point (1): Platform-appropriate expectation
  // On Windows: historical command is migrated to new pinned PowerShell wrapper (changed === true).
  // On non-Windows: historical command is already identical to canonical getHookCommand (changed === false).
  const expectedChanged = process.platform === 'win32';
  assert.strictEqual(merge1.changed, expectedChanged, `merge1.changed should be ${expectedChanged} on ${process.platform}`);

  const targetGroup = merge1.config.hooks.PreToolUse.find(g => g.matcher === MATCHER_PATTERN);
  assert(targetGroup, 'Target group must exist');
  assert.strictEqual(targetGroup.hooks.length, 2, 'Must not duplicate our handler');
  assert.strictEqual(targetGroup.hooks[0].command, foreignCmd, 'Foreign sibling handler must be preserved');
  assert.strictEqual(targetGroup.hooks[1].command, getHookCommand(PROJECT_ROOT), 'Our handler must be updated to current command');

  // Foreign groups preserved
  assert.deepStrictEqual(merge1.config.hooks.PreToolUse[0], foreignGroup);
  assert.deepStrictEqual(merge1.config.hooks.PreToolUse[2], emptyForeignGroup);

  // Idempotence: second merge produces no changes
  const merge2 = mergeHooksConfig(merge1.config, PROJECT_ROOT);
  assert.strictEqual(merge2.changed, false);
  assert.deepStrictEqual(merge2.config, merge1.config);

  // Also verify legacy bare node command migrates on all platforms
  const legacyInitial = {
    hooks: {
      PreToolUse: [
        {
          matcher: MATCHER_PATTERN,
          hooks: [{ type: 'command', command: `node "${path.resolve(PROJECT_ROOT, 'scripts/ae-tool-first-pretool.js').replace(/\\/g, '/')}"`, timeout: 5 }]
        }
      ]
    }
  };
  const legacyMerge = mergeHooksConfig(legacyInitial, PROJECT_ROOT);
  assert.strictEqual(legacyMerge.changed, true, 'Legacy node command must migrate on all platforms');
  assert.strictEqual(legacyMerge.config.hooks.PreToolUse[0].hooks[0].command, getHookCommand(PROJECT_ROOT));

  // Also verify round 1 bare powershell command migrates to pinned wrapper on Windows
  if (process.platform === 'win32') {
    const rawScript = path.win32.resolve(PROJECT_ROOT, 'scripts', 'ae-tool-first-pretool.js');
    const psScript = buildWindowsPowershellScript(process.execPath, rawScript);
    const round1Cmd = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encodePowershellCommand(psScript)}`;
    const round1Initial = {
      hooks: {
        PreToolUse: [
          {
            matcher: MATCHER_PATTERN,
            hooks: [{ type: 'command', command: round1Cmd, timeout: 5 }]
          }
        ]
      }
    };
    const round1Merge = mergeHooksConfig(round1Initial, PROJECT_ROOT);
    assert.strictEqual(round1Merge.changed, true, 'Round 1 bare powershell command must migrate to pinned executable');
    assert.strictEqual(round1Merge.config.hooks.PreToolUse[0].hooks[0].command, getHookCommand(PROJECT_ROOT));
  }

  // Unmerge removes ONLY our handler, preserving foreign sibling and foreign groups
  const unmerged = unmergeHooksConfig(merge1.config, PROJECT_ROOT);
  assert.strictEqual(unmerged.changed, true);
  const unmergedTarget = unmerged.config.hooks.PreToolUse.find(g => g.matcher === MATCHER_PATTERN);
  assert.strictEqual(unmergedTarget.hooks.length, 1);
  assert.strictEqual(unmergedTarget.hooks[0].command, foreignCmd);
  assert.deepStrictEqual(unmerged.config.hooks.PreToolUse[0], foreignGroup);
  assert.deepStrictEqual(unmerged.config.hooks.PreToolUse[2], emptyForeignGroup);
});

runTest('Suite 10: isOurHandler strictly preserves foreign handlers and commands with suffix args', () => {
  const currentCmd = getHookCommand(PROJECT_ROOT);
  assert.strictEqual(isOurHandler({ type: 'command', command: currentCmd }, PROJECT_ROOT), true);
  assert.strictEqual(isOurHandler({ type: 'command', command: `${currentCmd} --extra-arg` }, PROJECT_ROOT), false);
  assert.strictEqual(isOurHandler({ type: 'command', command: 'node C:/other/scripts/ae-tool-first-pretool.js' }, PROJECT_ROOT), false);
  assert.strictEqual(isOurHandler({ type: 'other_type', command: currentCmd }, PROJECT_ROOT), false);
  assert.strictEqual(isOurHandler(null, PROJECT_ROOT), false);
});

if (process.platform !== 'win32') {
  console.log(`  [SKIP] Windows CMD and PowerShell real subprocess tests skipped on non-Windows platform: ${process.platform}`);
} else {
  const canonicalNegativePayload = JSON.stringify({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      code: 'console.log("unclassified CU invocation");'
    }
  });

  const canonicalNoopPayload = JSON.stringify({
    cwd: PROJECT_ROOT,
    tool_name: 'get_project_info',
    tool_input: {}
  });

  const canonicalCanaryPayload = JSON.stringify({
    cwd: PROJECT_ROOT,
    tool_name: 'mcp__node_repl__js',
    tool_input: {
      code: '/* AE_TOOL_FIRST_READONLY_CANARY */'
    }
  });

  const historicalOldCommand = `"${process.execPath.replace(/\\/g, '/')}" "${path.resolve(PROJECT_ROOT, 'scripts/ae-tool-first-pretool.js').replace(/\\/g, '/')}"`;
  const currentExportedCommand = getHookCommand(PROJECT_ROOT);

  runTest('Suite 10: BEFORE archived old command reproducibly fails PowerShell criterion while passing CMD', () => {
    // 1. Run historical command in PowerShell: must fail execution criterion
    const psRes = runSubprocessViaPowerShell(historicalOldCommand, canonicalNegativePayload);
    const failedPs = psRes.status !== 0 ||
      (psRes.stderr && /ParserError|Unexpected token/i.test(psRes.stderr)) ||
      !psRes.stdout.includes('permissionDecision');
    assert.strictEqual(failedPs, true, 'Historical old command must fail PowerShell execution criterion');

    // 2. Run historical command in CMD: succeeds (demonstrating the historical CMD-only behavior)
    const cmdRes = runSubprocessViaCmd(historicalOldCommand, canonicalNegativePayload);
    assert.strictEqual(cmdRes.status, 0, 'Historical old command passes in CMD');
    const cmdParsed = JSON.parse(cmdRes.stdout.trim());
    assert.strictEqual(cmdParsed.hookSpecificOutput.permissionDecision, 'deny');
  });

  runTest('Suite 10: Current exported installer command passes negative canonical MCP guard via CMD (exit 0, parsed deny JSON)', () => {
    const cmdRes = runSubprocessViaCmd(currentExportedCommand, canonicalNegativePayload);
    assert.strictEqual(cmdRes.status, 0, `CMD execution must exit 0: ${cmdRes.stderr}`);
    const parsed = JSON.parse(cmdRes.stdout.trim());
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert(
      parsed.hookSpecificOutput.permissionDecisionReason.includes('отсутствует классификация CU-capable вызова'),
      `Unexpected reason: ${parsed.hookSpecificOutput.permissionDecisionReason}`
    );
  });

  runTest('Suite 10: Current exported installer command passes negative canonical MCP guard via PowerShell (exit 0, parsed deny JSON)', () => {
    const psRes = runSubprocessViaPowerShell(currentExportedCommand, canonicalNegativePayload);
    assert.strictEqual(psRes.status, 0, `PowerShell execution must exit 0: ${psRes.stderr}`);
    const parsed = JSON.parse(psRes.stdout.trim());
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert(
      parsed.hookSpecificOutput.permissionDecisionReason.includes('отсутствует классификация CU-capable вызова'),
      `Unexpected reason: ${parsed.hookSpecificOutput.permissionDecisionReason}`
    );
  });

  runTest('Suite 10: Current exported installer command passes exact noop via CMD (exit 0, no output)', () => {
    const cmdRes = runSubprocessViaCmd(currentExportedCommand, canonicalNoopPayload);
    assert.strictEqual(cmdRes.status, 0, `CMD noop must exit 0: ${cmdRes.stderr}`);
    assert.strictEqual(cmdRes.stdout.trim(), '', 'CMD noop must produce no output');
  });

  runTest('Suite 10: Current exported installer command passes exact noop via PowerShell (exit 0, no output)', () => {
    const psRes = runSubprocessViaPowerShell(currentExportedCommand, canonicalNoopPayload);
    assert.strictEqual(psRes.status, 0, `PowerShell noop must exit 0: ${psRes.stderr}`);
    assert.strictEqual(psRes.stdout.trim(), '', 'PowerShell noop must produce no output');
  });

  runTest('Suite 10: Current exported installer command passes harmless canary exemption via CMD and PowerShell (exit 0, no output)', () => {
    const cmdRes = runSubprocessViaCmd(currentExportedCommand, canonicalCanaryPayload);
    assert.strictEqual(cmdRes.status, 0, `CMD canary must exit 0: ${cmdRes.stderr}`);
    assert.strictEqual(cmdRes.stdout.trim(), '', 'CMD canary must produce no output');

    const psRes = runSubprocessViaPowerShell(currentExportedCommand, canonicalCanaryPayload);
    assert.strictEqual(psRes.status, 0, `PowerShell canary must exit 0: ${psRes.stderr}`);
    assert.strictEqual(psRes.stdout.trim(), '', 'PowerShell canary must produce no output');
  });
}

console.log(`Final review matrix: ${finalReviewCases} pure assertions; no live UI, daemon, hooks installation or trust writes.`);
console.log('\n=======================================');
console.log(`Results: ${passed} passed, ${failed} failed.`);
console.log('=======================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
