"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  auditComputerUse,
  decodeJsStringLiteral,
  stripCommentsAndStrings,
  extractNestedToolInvocations,
  countObservablesInCode,
  countImageBlocks,
  classifyIntent
} = require("./computer-use-audit");

const TEST_UUID_1 = "11111111-2222-4333-8444-555555555555";
const TEST_UUID_2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TEST_UUID_3 = "33333333-3333-4333-8333-333333333333";
const MISMATCH_UUID = "99999999-9999-4999-8999-999999999999";

function testLexicalDecodingAndAliases() {
  // Safe string literal decoding
  assert.deepStrictEqual(decodeJsStringLiteral('"hello\\nworld"'), { ok: true, value: "hello\nworld" });
  assert.deepStrictEqual(decodeJsStringLiteral("'single\\'quote'"), { ok: true, value: "single'quote" });
  assert.deepStrictEqual(decodeJsStringLiteral("`template`"), { ok: true, value: "template" });
  assert.strictEqual(decodeJsStringLiteral("dynamicVar").unsupported, true);

  // Observable aliases: get_window_state, getState/snapshot, click, press_key/keypress/pressKey, type_text, activate_window/focus
  const codeWithAliases = `
    await cua.getState();
    await snapshot();
    await click_at({ x: 50, y: 50 });
    await press_key("Tab");
    await keypress("Enter");
    await pressKey("Escape");
    await type_text("Sample");
    await activate_window();
    await focus();
  `;
  const obs = countObservablesInCode(codeWithAliases);
  assert.strictEqual(obs.windowState, 2, "getState and snapshot");
  assert.strictEqual(obs.click, 1, "click_at");
  assert.strictEqual(obs.keyboard, 4, "press_key, keypress, pressKey, type_text");
  assert.strictEqual(obs.focus, 2, "activate_window and focus");
  assert.strictEqual(obs.total, 9);

  // RU & EN intents with title
  assert.strictEqual(classifyIntent("await cua.click()", "Подтверждение диалога"), "confirmation");
  assert.strictEqual(classifyIntent("", "Перезагрузка панели CEP"), "panel");
  assert.strictEqual(classifyIntent("scrub comp", "Проверка кадра"), "visual");
  assert.strictEqual(classifyIntent("select comp", "Сохранить как новый проект"), "project");
}

function testNestedInvocationsExtractor() {
  // Real invocation with code and title
  const script1 = `
    await tools.mcp__node_repl__js({
      code: "await cua.click({ x: 100, y: 200 });",
      title: "Клик по кнопке"
    });
  `;
  const invs1 = extractNestedToolInvocations(script1);
  assert.strictEqual(invs1.length, 1);
  assert.strictEqual(invs1[0].toolName, "mcp__node_repl__js");
  assert.strictEqual(invs1[0].code, "await cua.click({ x: 100, y: 200 });");
  assert.strictEqual(invs1[0].title, "Клик по кнопке");
  assert.strictEqual(invs1[0].unsupported, false);

  // Fake bare identifier without parentheses
  const scriptFakeId = `
    const f = tools.mcp__node_repl__js;
    const g = tools.mcp__cua_repl__js;
  `;
  const invsFake = extractNestedToolInvocations(scriptFakeId);
  assert.strictEqual(invsFake.length, 0, "Bare identifiers without parentheses must not count as invocations");

  // Invocations inside comments and strings must not be extracted
  const scriptInString = `
    // tools.mcp__node_repl__js({ code: "click()" })
    const str = "tools.mcp__cua_repl__js({ code: 'click()' })";
  `;
  const invsComment = extractNestedToolInvocations(scriptInString);
  assert.strictEqual(invsComment.length, 0, "Invocations in comments or strings must not be extracted");

  // Two inner calls in one script
  const scriptTwo = `
    await tools.mcp__cua_repl__js({ code: "await cua.click();", title: "click 1" });
    await tools.mcp__cua_repl__js({ code: "await cua.focus();", title: "focus 2" });
  `;
  const invsTwo = extractNestedToolInvocations(scriptTwo);
  assert.strictEqual(invsTwo.length, 2);

  // Unsupported expression
  const scriptDynamic = `
    await tools.mcp__node_repl__js({ code: getDynamicScript() });
  `;
  const invsDyn = extractNestedToolInvocations(scriptDynamic);
  assert.strictEqual(invsDyn.length, 1);
  assert.strictEqual(invsDyn[0].unsupported, true);
}

async function testSyntheticRollouts() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-cu-audit-smoke-"));

  try {
    const writeRollout = (id, rows) => {
      const file = path.join(tempDir, `rollout-${id}.jsonl`);
      fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
      return file;
    };

    // 1. Session 1:
    // - Actual shaped exec custom-call with quoted inner code and title
    // - 65 image content blocks proof
    // - Fake bare identifier
    // - Conflicting response ID to verify partial_unknown usage
    const imageBlocks65 = [];
    for (let i = 0; i < 65; i += 1) {
      imageBlocks65.push({ type: "image", mime_type: "image/png", data: "base64proof" });
    }

    writeRollout(TEST_UUID_1, [
      {
        type: "session_meta",
        timestamp: "2026-10-03T10:00:00Z",
        payload: { id: TEST_UUID_1, session_id: TEST_UUID_1 }
      },
      {
        type: "token_usage_record",
        timestamp: "2026-10-03T10:00:01Z",
        payload: {
          thread_id: TEST_UUID_1,
          response_id: "resp-1",
          usage: { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 200, reasoning_output_tokens: 50 }
        }
      },
      // Conflicting token usage record for resp-1
      {
        type: "token_usage_record",
        timestamp: "2026-10-03T10:00:02Z",
        payload: {
          thread_id: TEST_UUID_1,
          response_id: "resp-1",
          usage: { input_tokens: 9999, cached_input_tokens: 600, output_tokens: 200, reasoning_output_tokens: 50 }
        }
      },
      // Call 1: Fake identifier in exec - must NOT count as CU
      {
        type: "response_item",
        timestamp: "2026-10-03T10:00:03Z",
        payload: {
          type: "function_call",
          call_id: "call_fake_id",
          name: "functions.exec",
          arguments: {
            code: "const f = tools.mcp__node_repl__js;\nconsole.log(f);"
          }
        }
      },
      // Call 2: Real exec with quoted inner code & title, matched to 65 images
      {
        type: "response_item",
        timestamp: "2026-10-03T10:00:10Z",
        payload: {
          type: "function_call",
          call_id: "call_exec_65",
          name: "functions.exec",
          arguments: {
            code: `
              await tools.mcp__node_repl__js({
                code: "await cua.click({ x: 100, y: 200 });\\nawait cua.get_window_state();",
                title: "Подтверждение диалога"
              });
            `
          }
        }
      },
      // Output for call_exec_65 with 65 image blocks
      {
        type: "response_item",
        timestamp: "2026-10-03T10:00:15Z",
        payload: {
          type: "function_call_output",
          call_id: "call_exec_65",
          output: imageBlocks65
        }
      },
      // Duplicate output row for call_exec_65 - must NOT double-count 65 images!
      {
        type: "response_item",
        timestamp: "2026-10-03T10:00:16Z",
        payload: {
          type: "function_call_output",
          call_id: "call_exec_65",
          output: imageBlocks65
        }
      }
    ]);

    const result1 = await auditComputerUse({ threadId: TEST_UUID_1, root: tempDir });
    assert.strictEqual(result1.threadId, TEST_UUID_1);
    assert.strictEqual(result1.attempts.embedded.execWrappers, 1);
    assert.strictEqual(result1.attempts.embedded.innerAttempts, 1);
    assert.strictEqual(result1.attempts.total, 1, "Fake identifier must be excluded");
    assert.strictEqual(result1.observables.click, 1);
    assert.strictEqual(result1.observables.windowState, 1);
    assert.strictEqual(result1.intents.confirmation, 1);
    assert.strictEqual(result1.images.matchedImageBlocks, 65, "Must match exactly 65 image blocks without double-counting");
    assert.strictEqual(result1.images.matchedToolOutputs, 1);
    assert.strictEqual(result1.usage.status, "partial_unknown", "Conflicting response_id must mark partial_unknown");
    assert.strictEqual(result1.usage.exact, false);
    assert(result1.timeSpan.cu.cuSpanMs >= 0);

    // 2. Session 2: Two inner calls in one parent exec, matched to 4 images
    writeRollout(TEST_UUID_2, [
      {
        type: "session_meta",
        timestamp: "2026-10-03T11:00:00Z",
        payload: { id: TEST_UUID_2, session_id: TEST_UUID_2 }
      },
      {
        type: "response_item",
        timestamp: "2026-10-03T11:00:05Z",
        payload: {
          type: "function_call",
          call_id: "call_two_inner",
          name: "functions.exec",
          arguments: {
            code: `
              await tools.mcp__cua_repl__js({ code: "await cua.press_key('Enter');", title: "Нажатие клавиши" });
              await tools.mcp__cua_repl__js({ code: "await cua.activate_window();", title: "Активация окна" });
            `
          }
        }
      },
      {
        type: "response_item",
        timestamp: "2026-10-03T11:00:08Z",
        payload: {
          type: "function_call_output",
          call_id: "call_two_inner",
          output: [
            { type: "image", mime_type: "image/png" },
            { type: "image", mime_type: "image/png" },
            { type: "image", mime_type: "image/png" },
            { type: "image", mime_type: "image/png" }
          ]
        }
      }
    ]);

    const result2 = await auditComputerUse({ threadId: TEST_UUID_2, root: tempDir });
    assert.strictEqual(result2.attempts.embedded.execWrappers, 1);
    assert.strictEqual(result2.attempts.embedded.innerAttempts, 2);
    assert.strictEqual(result2.attempts.total, 2);
    assert.strictEqual(result2.observables.keyboard, 1);
    assert.strictEqual(result2.observables.focus, 1);
    assert.strictEqual(result2.images.matchedImageBlocks, 4, "Images from one parent exec must be counted only once");
    assert.strictEqual(result2.images.matchedToolOutputs, 1);
    assert.strictEqual(result2.usage.status, "unknown");

    // 3. Session 3: Unsupported dynamic code expression
    writeRollout(TEST_UUID_3, [
      {
        type: "session_meta",
        timestamp: "2026-10-03T12:00:00Z",
        payload: { id: TEST_UUID_3, session_id: TEST_UUID_3 }
      },
      {
        type: "response_item",
        timestamp: "2026-10-03T12:00:05Z",
        payload: {
          type: "function_call",
          call_id: "call_dyn",
          name: "functions.exec",
          arguments: {
            code: "await tools.mcp__node_repl__js({ code: getGeneratedScript() });"
          }
        }
      }
    ]);

    const result3 = await auditComputerUse({ threadId: TEST_UUID_3, root: tempDir });
    assert.strictEqual(result3.attempts.total, 1);
    assert.strictEqual(result3.observableCoverage, "unknown", "Unsupported dynamic expression must report observableCoverage unknown");

    // 4. Strict error cases
    await assert.rejects(
      auditComputerUse({ threadId: "current", root: tempDir }),
      /invalid_thread_id/
    );

    writeRollout(MISMATCH_UUID, [
      {
        type: "session_meta",
        payload: { id: "00000000-0000-4000-8000-000000000000" }
      }
    ]);
    await assert.rejects(
      auditComputerUse({ threadId: MISMATCH_UUID, root: tempDir }),
      /session_id_mismatch/
    );

    const badJsonUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    fs.writeFileSync(path.join(tempDir, `rollout-${badJsonUuid}.jsonl`), "MALFORMED JSON\n", "utf8");
    await assert.rejects(
      auditComputerUse({ threadId: badJsonUuid, root: tempDir }),
      /invalid_jsonl/
    );

  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  testLexicalDecodingAndAliases();
  testNestedInvocationsExtractor();
  await testSyntheticRollouts();
  console.log(JSON.stringify({
    ok: true,
    suite: "computer-use-audit-smoke",
    checks: "actual shaped exec row, 65 image proof, fake identifier exclusion, two inner calls one output, unknown code expressions, malformed JSONL, stable UUID check, conflicting usage handling"
  }));
}

main().catch((err) => {
  console.error("computer-use-audit-smoke failed:", err);
  process.exitCode = 1;
});
