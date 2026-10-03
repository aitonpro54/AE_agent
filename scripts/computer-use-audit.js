"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { findRollouts } = require("./codex-task-ledger");

const MAX_FILE_BYTES = 128 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE_FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];

function manualUnescape(str) {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function decodeJsStringLiteral(raw) {
  if (typeof raw !== "string" || raw.length < 2) {
    return { ok: false, unsupported: true };
  }
  if (raw.startsWith('"')) {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: true, value: manualUnescape(raw.slice(1, -1)) };
    }
  }
  if (raw.startsWith("'")) {
    return { ok: true, value: manualUnescape(raw.slice(1, -1)) };
  }
  if (raw.startsWith("`")) {
    return { ok: true, value: manualUnescape(raw.slice(1, -1)) };
  }
  return { ok: false, unsupported: true };
}

function stripCommentsAndStrings(text) {
  if (typeof text !== "string") return "";
  let result = "";
  let i = 0;
  const len = text.length;
  let state = "normal";

  while (i < len) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : "";

    if (state === "normal") {
      if (ch === "/" && next === "/") {
        state = "line_comment";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "block_comment";
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = "single_quote";
        i += 1;
        continue;
      }
      if (ch === '"') {
        state = "double_quote";
        i += 1;
        continue;
      }
      if (ch === "`") {
        state = "backtick";
        i += 1;
        continue;
      }
      result += ch;
      i += 1;
    } else if (state === "line_comment") {
      if (ch === "\n" || ch === "\r") {
        state = "normal";
        result += ch;
      }
      i += 1;
    } else if (state === "block_comment") {
      if (ch === "*" && next === "/") {
        state = "normal";
        i += 2;
        continue;
      }
      i += 1;
    } else if (state === "single_quote") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = "normal";
      }
      i += 1;
    } else if (state === "double_quote") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        state = "normal";
      }
      i += 1;
    } else if (state === "backtick") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") {
        state = "normal";
      }
      i += 1;
    }
  }
  return result;
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  let state = "normal";
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : "";
    if (state === "normal") {
      if (ch === "/" && next === "/") { state = "line_comment"; i += 1; continue; }
      if (ch === "/" && next === "*") { state = "block_comment"; i += 1; continue; }
      if (ch === "'") { state = "single_quote"; continue; }
      if (ch === '"') { state = "double_quote"; continue; }
      if (ch === "`") { state = "backtick"; continue; }
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) return i;
      }
    } else if (state === "line_comment") {
      if (ch === "\n" || ch === "\r") state = "normal";
    } else if (state === "block_comment") {
      if (ch === "*" && next === "/") { state = "normal"; i += 1; }
    } else if (state === "single_quote") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "'") state = "normal";
    } else if (state === "double_quote") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === '"') state = "normal";
    } else if (state === "backtick") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "`") state = "normal";
    }
  }
  return -1;
}

function parseStringLiteralAt(text, startIndex) {
  const quote = text[startIndex];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let i = startIndex + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return text.slice(startIndex, i + 1);
    }
    i += 1;
  }
  return null;
}

function extractPropertyFromArgText(argText, propName) {
  let state = "normal";
  let i = 0;
  while (i < argText.length) {
    const ch = argText[i];
    const next = i + 1 < argText.length ? argText[i + 1] : "";
    if (state === "normal") {
      if (ch === "/" && next === "/") { state = "line_comment"; i += 2; continue; }
      if (ch === "/" && next === "*") { state = "block_comment"; i += 2; continue; }
      if (ch === "'") { state = "single_quote"; i += 1; continue; }
      if (ch === '"') { state = "double_quote"; i += 1; continue; }
      if (ch === "`") { state = "backtick"; i += 1; continue; }

      const sub = argText.slice(i);
      const propMatch = sub.match(new RegExp(`^\\b${propName}\\b\\s*:\\s*`));
      if (propMatch) {
        const valStart = i + propMatch[0].length;
        const remaining = argText.slice(valStart).trimStart();
        const firstChar = remaining[0];
        if (firstChar === '"' || firstChar === "'" || firstChar === "`") {
          const literal = parseStringLiteralAt(remaining, 0);
          if (literal) {
            return decodeJsStringLiteral(literal);
          }
        }
        return { ok: false, unsupported: true };
      }
      i += 1;
    } else if (state === "line_comment") {
      if (ch === "\n" || ch === "\r") state = "normal";
      i += 1;
    } else if (state === "block_comment") {
      if (ch === "*" && next === "/") { state = "normal"; i += 2; continue; }
      i += 1;
    } else if (state === "single_quote") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "'") state = "normal";
      i += 1;
    } else if (state === "double_quote") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === '"') state = "normal";
      i += 1;
    } else if (state === "backtick") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "`") state = "normal";
      i += 1;
    }
  }
  return null;
}

function extractNestedToolInvocations(scriptText) {
  if (typeof scriptText !== "string") return [];
  const invocations = [];
  const len = scriptText.length;
  let i = 0;
  let state = "normal";

  while (i < len) {
    const ch = scriptText[i];
    const next = i + 1 < len ? scriptText[i + 1] : "";

    if (state === "normal") {
      if (ch === "/" && next === "/") { state = "line_comment"; i += 2; continue; }
      if (ch === "/" && next === "*") { state = "block_comment"; i += 2; continue; }
      if (ch === "'") { state = "single_quote"; i += 1; continue; }
      if (ch === '"') { state = "double_quote"; i += 1; continue; }
      if (ch === "`") { state = "backtick"; i += 1; continue; }

      const sub = scriptText.slice(i, i + 40);
      const match = sub.match(/^(?:tools\.)?(mcp__cua_repl__js|mcp__node_repl__js)\s*\(/);
      if (match) {
        const toolName = match[1];
        const openParenIndex = i + match[0].length - 1;
        const closeParenIndex = findMatchingParen(scriptText, openParenIndex);
        if (closeParenIndex !== -1) {
          const argText = scriptText.slice(openParenIndex + 1, closeParenIndex).trim();
          let codeResult = null;
          let titleResult = null;

          if (argText.startsWith("{") && argText.endsWith("}")) {
            codeResult = extractPropertyFromArgText(argText, "code");
            titleResult = extractPropertyFromArgText(argText, "title");
          } else if (argText.startsWith('"') || argText.startsWith("'") || argText.startsWith("`")) {
            codeResult = decodeJsStringLiteral(argText);
          } else {
            codeResult = { ok: false, unsupported: true };
          }

          invocations.push({
            toolName,
            code: codeResult && codeResult.ok ? codeResult.value : null,
            title: titleResult && titleResult.ok ? titleResult.value : null,
            unsupported: Boolean(codeResult && codeResult.unsupported)
          });

          i = closeParenIndex + 1;
          continue;
        }
      }
      i += 1;
    } else if (state === "line_comment") {
      if (ch === "\n" || ch === "\r") state = "normal";
      i += 1;
    } else if (state === "block_comment") {
      if (ch === "*" && next === "/") { state = "normal"; i += 2; continue; }
      i += 1;
    } else if (state === "single_quote") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "'") state = "normal";
      i += 1;
    } else if (state === "double_quote") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === '"') state = "normal";
      i += 1;
    } else if (state === "backtick") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "`") state = "normal";
      i += 1;
    }
  }
  return invocations;
}

function countObservablesInCode(code) {
  if (typeof code !== "string" || !code) {
    return { windowState: 0, click: 0, keyboard: 0, focus: 0, total: 0 };
  }
  const stripped = stripCommentsAndStrings(code);
  const windowStateMatches = stripped.match(/\b(?:cua\.)?(?:get_window_state|getWindowState|getState|snapshot)\s*\(/g) || [];
  const clickMatches = stripped.match(/\b(?:cua\.)?(?:click|click_at|mouse_click)\s*\(/g) || [];
  const keyboardMatches = stripped.match(/\b(?:cua\.)?(?:press_key|keypress|pressKey|type_text|typeText|keyboard(?:\.\w+)?|key)\s*(?:\.|\()/g) || [];
  const focusMatches = stripped.match(/\b(?:cua\.)?(?:activate_window|activateWindow|focus)\s*\(/g) || [];

  return {
    windowState: windowStateMatches.length,
    click: clickMatches.length,
    keyboard: keyboardMatches.length,
    focus: focusMatches.length,
    total: windowStateMatches.length + clickMatches.length + keyboardMatches.length + focusMatches.length
  };
}

function classifyIntent(code, title) {
  const text = `${title || ""} ${code || ""}`.toLowerCase();

  // Confirmation (modal popups, approval dialogs, save changes)
  if (/\b(confirm|confirmation|modal|dialog|alert|prompt|ok|cancel|discard|approval|save changes|permission)\b/i.test(text) ||
      /(подтверд|модальн|диалог|отмен|сохранить изменения|разрешен)/i.test(text)) {
    return "confirmation";
  }

  // CEP Panel interactions
  if (/\b(panel|cep|extension|ae-agent|html|button|header|connect|reload panel|devtools)\b/i.test(text) ||
      /(панел|расширен|кнопк|подключ|шапк)/i.test(text)) {
    return "panel";
  }

  // Visual comp / viewer checking
  if (/\b(preview|viewer|zoom|pan|scrub|comp viewer|visual check|inspect frame|frame)\b/i.test(text) ||
      /(просмотр|кадр|зум|превью|провер|вьюер)/i.test(text)) {
    return "visual";
  }

  // Project, comp, timeline operations
  if (/\b(project|comp|composition|timeline|layer|save as|import|footage|item|after effects|menu|file|edit)\b/i.test(text) ||
      /(проект|композиц|таймлайн|слой|сохранить как|импорт|футаж|меню|файл)/i.test(text)) {
    return "project";
  }

  return "unknown";
}

function countImageBlocks(output) {
  if (!output) return 0;
  let parsed = output;
  if (typeof output === "string") {
    try {
      parsed = JSON.parse(output);
    } catch {
      return 0;
    }
  }

  let count = 0;
  function inspect(val) {
    if (!val || typeof val !== "object") return;
    if (val.type === "image" || val.type === "image_url" || val.type === "input_image") {
      count += 1;
    } else if (typeof val.mime_type === "string" && val.mime_type.startsWith("image/")) {
      count += 1;
    } else if (typeof val.mimeType === "string" && val.mimeType.startsWith("image/")) {
      count += 1;
    }
    if (Array.isArray(val)) {
      for (const item of val) inspect(item);
    } else {
      if (Array.isArray(val.content)) {
        for (const item of val.content) inspect(item);
      }
      if (val.output && typeof val.output === "object") {
        inspect(val.output);
      }
    }
  }
  inspect(parsed);
  return count;
}

function extractToolCalls(row) {
  const calls = [];
  if (!row || typeof row !== "object") return calls;
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return calls;

  if (payload.type === "function_call" || payload.type === "custom_tool_call") {
    calls.push({
      callId: payload.call_id || payload.id || null,
      name: payload.name || payload.tool || "",
      args: payload.arguments || payload.input || payload.args || {}
    });
  }

  if (Array.isArray(payload.tool_calls)) {
    for (const tc of payload.tool_calls) {
      if (!tc || typeof tc !== "object") continue;
      const fn = tc.function || tc;
      calls.push({
        callId: tc.id || tc.call_id || null,
        name: fn.name || tc.name || "",
        args: fn.arguments || tc.input || tc.args || {}
      });
    }
  }

  if (Array.isArray(payload.content)) {
    for (const blk of payload.content) {
      if (!blk || typeof blk !== "object") continue;
      if (blk.type === "tool_use" || blk.type === "function_call") {
        calls.push({
          callId: blk.id || blk.call_id || null,
          name: blk.name || "",
          args: blk.input || blk.arguments || {}
        });
      }
    }
  }

  if (payload.item && typeof payload.item === "object") {
    const it = payload.item;
    if (it.type === "function_call" || it.type === "custom_tool_call") {
      calls.push({
        callId: it.call_id || it.id || null,
        name: it.name || it.tool || "",
        args: it.arguments || it.input || it.args || {}
      });
    }
  }

  return calls;
}

function extractToolOutputs(row) {
  const outputs = [];
  if (!row || typeof row !== "object") return outputs;
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return outputs;

  if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output" || payload.type === "tool_response") {
    outputs.push({
      callId: payload.call_id || payload.tool_call_id || payload.id || null,
      output: payload.output !== undefined ? payload.output : payload.content
    });
  }

  if (payload.role === "tool") {
    outputs.push({
      callId: payload.tool_call_id || payload.call_id || null,
      output: payload.content !== undefined ? payload.content : payload.output
    });
  }

  if (payload.item && typeof payload.item === "object") {
    const it = payload.item;
    if (it.type === "function_call_output" || it.type === "tool_response" || it.role === "tool") {
      outputs.push({
        callId: it.call_id || it.tool_call_id || it.id || null,
        output: it.output !== undefined ? it.output : it.content
      });
    }
  }

  return outputs;
}

function extractCodeString(args) {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object") return extractCodeString(parsed);
    } catch {
      return args;
    }
  }
  if (args && typeof args === "object") {
    if (typeof args.code === "string") return args.code;
    if (typeof args.script === "string") return args.script;
    if (typeof args.command === "string") return args.command;
    if (typeof args.js === "string") return args.js;
    return JSON.stringify(args);
  }
  return "";
}

function validUsage(value) {
  if (!value || !USAGE_FIELDS.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0)) return false;
  return value.cached_input_tokens <= value.input_tokens && value.reasoning_output_tokens <= value.output_tokens;
}

async function auditComputerUse(options = {}) {
  const threadId = options.threadId;
  if (!threadId || typeof threadId !== "string" || !ID_PATTERN.test(threadId)) {
    throw new Error(`invalid_thread_id: expected explicit confirmed UUID, got ${JSON.stringify(threadId)}`);
  }

  let rolloutFile = options.filePath || null;
  if (!rolloutFile) {
    const defaultRoot = path.join(os.homedir(), ".codex", "sessions");
    const primaryRoot = options.root || defaultRoot;
    try {
      const found = findRollouts(primaryRoot, [threadId]);
      rolloutFile = found.get(threadId);
    } catch (err) {
      if (options.archivedRoot) {
        const foundArchived = findRollouts(options.archivedRoot, [threadId]);
        rolloutFile = foundArchived.get(threadId);
      } else {
        throw err;
      }
    }
  }

  if (!rolloutFile || !fs.existsSync(rolloutFile)) {
    throw new Error(`rollout_missing:${threadId}`);
  }

  const stat = fs.statSync(rolloutFile);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`rollout_too_large:${threadId}`);
  }

  let sessionMetaSeen = false;
  let parentThreadId = null;
  let firstTimestamp = null;
  let lastTimestamp = null;
  let firstCuTimestamp = null;
  let lastCuTimestamp = null;

  const usageRecords = new Map();
  const coverageErrors = [];

  const seenCallIds = new Set();
  const parentCuCallIds = new Set();
  const outputsByCallId = new Map();

  let directCuaRepl = 0;
  let directNodeRepl = 0;
  let embeddedExecWrappers = 0;
  let embeddedInnerAttempts = 0;
  let hasUnsupportedExpression = false;

  const observables = {
    windowState: 0,
    click: 0,
    keyboard: 0,
    focus: 0,
    total: 0
  };

  const intents = {
    project: 0,
    panel: 0,
    confirmation: 0,
    visual: 0,
    unknown: 0
  };

  const input = fs.createReadStream(rolloutFile, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      if (!line || !line.trim()) continue;

      let row;
      try {
        row = JSON.parse(line);
      } catch {
        throw new Error(`invalid_jsonl:${threadId}`);
      }

      const rowTs = row.timestamp || null;
      if (rowTs) {
        if (!firstTimestamp) firstTimestamp = rowTs;
        lastTimestamp = rowTs;
      }

      if (row.type === "session_meta") {
        if (sessionMetaSeen) throw new Error(`duplicate_session_meta:${threadId}`);
        sessionMetaSeen = true;
        const sid = row.payload && (row.payload.id || row.payload.session_id);
        if (sid !== threadId) throw new Error(`session_id_mismatch:${threadId}`);
        parentThreadId = (row.payload && row.payload.parent_thread_id) || null;
      } else if (row.type === "token_usage_record") {
        const p = row.payload || {};
        const respId = p.response_id;
        if (p.thread_id !== threadId || !respId || !validUsage(p.usage)) {
          coverageErrors.push(`invalid_usage_record:${respId || "unknown"}`);
        } else if (usageRecords.has(respId)) {
          const prev = usageRecords.get(respId);
          if (JSON.stringify(prev) !== JSON.stringify(p.usage)) {
            coverageErrors.push(`conflicting_response_id:${respId}`);
          }
        } else {
          usageRecords.set(respId, p.usage);
        }
      }

      // Check tool calls
      const toolCalls = extractToolCalls(row);
      for (const call of toolCalls) {
        if (call.callId && seenCallIds.has(call.callId)) continue;
        if (call.callId) seenCallIds.add(call.callId);

        const toolName = call.name || "";
        const isDirectCua = toolName === "mcp__cua_repl__js" || toolName === "cua_repl";
        const isDirectNode = toolName === "mcp__node_repl__js" || toolName === "node_repl";
        const isExec = toolName === "functions.exec" || toolName === "exec";

        if (isDirectCua || isDirectNode) {
          if (isDirectCua) directCuaRepl += 1;
          if (isDirectNode) directNodeRepl += 1;
          if (call.callId) parentCuCallIds.add(call.callId);

          if (rowTs) {
            if (!firstCuTimestamp) firstCuTimestamp = rowTs;
            lastCuTimestamp = rowTs;
          }

          let directCode = "";
          let directTitle = "";
          if (call.args && typeof call.args === "object") {
            directCode = typeof call.args.code === "string" ? call.args.code : "";
            directTitle = typeof call.args.title === "string" ? call.args.title : "";
          } else if (typeof call.args === "string") {
            directCode = call.args;
          }

          const obs = countObservablesInCode(directCode);
          observables.windowState += obs.windowState;
          observables.click += obs.click;
          observables.keyboard += obs.keyboard;
          observables.focus += obs.focus;
          observables.total += obs.total;

          const intent = classifyIntent(directCode, directTitle);
          intents[intent] = (intents[intent] || 0) + 1;
        } else if (isExec) {
          const scriptText = extractCodeString(call.args);
          const innerInvocations = extractNestedToolInvocations(scriptText);

          if (innerInvocations.length > 0) {
            embeddedExecWrappers += 1;
            embeddedInnerAttempts += innerInvocations.length;
            if (call.callId) parentCuCallIds.add(call.callId);

            if (rowTs) {
              if (!firstCuTimestamp) firstCuTimestamp = rowTs;
              lastCuTimestamp = rowTs;
            }

            for (const inv of innerInvocations) {
              if (inv.unsupported) {
                hasUnsupportedExpression = true;
              }
              const obs = countObservablesInCode(inv.code);
              observables.windowState += obs.windowState;
              observables.click += obs.click;
              observables.keyboard += obs.keyboard;
              observables.focus += obs.focus;
              observables.total += obs.total;

              const intent = classifyIntent(inv.code, inv.title);
              intents[intent] = (intents[intent] || 0) + 1;
            }
          }
        }
      }

      // Check tool outputs - store ONLY { callId, count } without raw data
      const toolOutputs = extractToolOutputs(row);
      for (const out of toolOutputs) {
        const callId = out.callId;
        if (!callId || outputsByCallId.has(callId)) continue;
        const blocks = countImageBlocks(out.output);
        outputsByCallId.set(callId, blocks);
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }

  if (!sessionMetaSeen) {
    throw new Error(`session_meta_missing:${threadId}`);
  }

  // Match tool outputs to parent CU calls (counting each parent call's output images once)
  let matchedToolOutputs = 0;
  let matchedImageBlocks = 0;
  for (const callId of parentCuCallIds) {
    if (outputsByCallId.has(callId)) {
      matchedToolOutputs += 1;
      matchedImageBlocks += outputsByCallId.get(callId);
    }
  }

  // Calculate session span proxy
  let sessionSpanMs = 0;
  if (firstTimestamp && lastTimestamp) {
    const t0 = new Date(firstTimestamp).getTime();
    const t1 = new Date(lastTimestamp).getTime();
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
      sessionSpanMs = t1 - t0;
    }
  }

  // Calculate CU-specific span proxy
  let cuSpanMs = 0;
  if (firstCuTimestamp && lastCuTimestamp) {
    const t0 = new Date(firstCuTimestamp).getTime();
    const t1 = new Date(lastCuTimestamp).getTime();
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
      cuSpanMs = t1 - t0;
    }
  }

  // Usage summary with strict error accounting
  let usageSummary = null;
  const hasErrors = coverageErrors.length > 0;
  if (usageRecords.size > 0 || hasErrors) {
    const totals = { inputTokens: 0, cachedInputTokens: 0, uncachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
    for (const u of usageRecords.values()) {
      totals.inputTokens += u.input_tokens;
      totals.cachedInputTokens += u.cached_input_tokens;
      totals.uncachedInputTokens += u.input_tokens - u.cached_input_tokens;
      totals.outputTokens += u.output_tokens;
      totals.reasoningOutputTokens += u.reasoning_output_tokens;
    }
    usageSummary = {
      status: hasErrors ? "partial_unknown" : "available",
      exact: !hasErrors,
      responseCount: usageRecords.size,
      totals,
      ...(hasErrors ? { coverageErrors } : {})
    };
  } else {
    usageSummary = {
      status: "unknown",
      exact: false,
      responseCount: 0,
      totals: null,
      reason: "no_token_usage_records_in_session"
    };
  }

  const directTotal = directCuaRepl + directNodeRepl;
  const totalAttempts = directTotal + embeddedInnerAttempts;

  return {
    schema: "ae-agent-computer-use-audit.v1",
    threadId,
    parentThreadId,
    rolloutFileBasename: path.basename(rolloutFile),
    sessionMetaVerified: true,
    observableCoverage: hasUnsupportedExpression ? "unknown" : "complete",
    attempts: {
      direct: {
        cuaRepl: directCuaRepl,
        nodeRepl: directNodeRepl,
        total: directTotal
      },
      embedded: {
        execWrappers: embeddedExecWrappers,
        innerAttempts: embeddedInnerAttempts,
        total: embeddedInnerAttempts
      },
      total: totalAttempts
    },
    observables: {
      windowState: observables.windowState,
      click: observables.click,
      keyboard: observables.keyboard,
      focus: observables.focus,
      total: observables.total
    },
    images: {
      matchedToolOutputs,
      matchedImageBlocks
    },
    intents: {
      project: intents.project,
      panel: intents.panel,
      confirmation: intents.confirmation,
      visual: intents.visual,
      unknown: intents.unknown
    },
    timeSpan: {
      session: {
        firstTimestamp,
        lastTimestamp,
        spanMs: sessionSpanMs,
        spanMinutes: Math.round((sessionSpanMs / 60000) * 10) / 10
      },
      cu: {
        firstCuTimestamp,
        lastCuTimestamp,
        cuSpanMs,
        cuSpanMinutes: Math.round((cuSpanMs / 60000) * 10) / 10
      }
    },
    usage: usageSummary,
    limitations: [
      "Metadata interval is a span proxy, not active screen-lock duration or CPU time.",
      "Token usage reflects recorded response totals and is not claimed as direct Computer Use expense.",
      "Observable counts and intents are heuristic and do not constitute semantic proof."
    ]
  };
}

module.exports = {
  auditComputerUse,
  decodeJsStringLiteral,
  stripCommentsAndStrings,
  extractNestedToolInvocations,
  countObservablesInCode,
  classifyIntent,
  countImageBlocks,
  extractToolCalls,
  extractToolOutputs,
  MAX_FILE_BYTES,
  ID_PATTERN
};
