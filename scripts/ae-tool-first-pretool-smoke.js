#!/usr/bin/env node
/**
 * scripts/ae-tool-first-pretool-smoke.js
 *
 * Focused pure smoke test suite for AE Tool-First PreToolUse guard and installer.
 * Covers all material findings, vendor key alias normalization, first_unnamed_save scoping,
 * exact project handler ownership, schema validation, strict proposal pins, and guard-second-review.cjs.
 * Zero external dependencies (pure Node.js).
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
  getRepoRoot
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

runTest('CORRECTION 2 DEFECT: getHookCommand uses absolute process.execPath and script path quoted safely', () => {
  const cmd = getHookCommand(PROJECT_ROOT);
  const expectedNode = `"${process.execPath.replace(/\\/g, '/')}"`;
  const expectedScript = `"${path.resolve(PROJECT_ROOT, 'scripts/ae-tool-first-pretool.js').replace(/\\/g, '/')}"`;
  assert.strictEqual(cmd, `${expectedNode} ${expectedScript}`);
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
  assert.strictEqual(hookCmd, `"${process.execPath.replace(/\\/g, '/')}" "${path.resolve(PROJECT_ROOT, 'scripts/ae-tool-first-pretool.js').replace(/\\/g, '/')}"`);
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
console.log(`Final review matrix: ${finalReviewCases} pure assertions; no live UI, daemon, hooks installation or trust writes.`);
console.log('\n=======================================');
console.log(`Results: ${passed} passed, ${failed} failed.`);
console.log('=======================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
