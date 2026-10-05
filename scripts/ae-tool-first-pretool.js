#!/usr/bin/env node
/**
 * scripts/ae-tool-first-pretool.js
 *
 * Synchronous PreToolUse hook evaluator for AE Agent Tool-First / MCP-First workflow.
 * Intercepts Computer Use (CU) capable invocations (node_repl, cua_repl) and shell CU bypasses,
 * enforcing realpath canonical project scope, taxonomy fallback packets, direct code shortcut
 * denials (normalizing vendor Control/Control_L/Control_R/Ctrl variants), strict typed proposal
 * pins, exact harmless canary templates, and fail-closed input validation.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 6 taxonomy reasons from docs/tool-first-workflow.md
const VALID_REASONS = new Set([
  'typed_gap',
  'visual_ui_only',
  'panel_bootstrap',
  'protected_confirmation',
  'modal_blocker',
  'diagnostics'
]);

// Known forbidden GUI substitutions denied regardless of declared reason
const FORBIDDEN_SUBSTITUTION_PRIMITIVES = new Set([
  'reload',
  'panel_reload',
  'cep_reload',
  'open',
  'open_project',
  'file_open',
  'new',
  'new_project',
  'create_project',
  'file_new',
  'named_save',
  'save_as',
  'save_named',
  'save_project_as',
  'timeline',
  'timeline_edit',
  'scrub_timeline',
  'move_playhead',
  'trim_layer',
  'comp_layer',
  'layer_edit',
  'comp_edit',
  'create_layer',
  'set_property',
  'modify_layer'
]);

// Exact allowed harmless literal canary templates (no arbitrary substring exemption)
const EXACT_HARMLESS_CANARY_TEMPLATES = new Set([
  '/* AE_TOOL_FIRST_READONLY_CANARY */',
  '// AE_TOOL_FIRST_READONLY_CANARY',
  '/* AE_TOOL_FIRST_READONLY_CANARY */ 0;'
]);

const GATED_REPL_PATTERN = /^mcp__(node_repl__(js|js_reset|js_add_node_module_dir)|cua_repl__(js|js_reset))$/i;
const GATED_SHELL_PATTERN = /^(Bash|exec_command|bash|sh)$/i;

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SHA256_REGEX = /^[0-9a-fA-F]{64}$/;
const ACTION_ID_REGEX = /^act_[0-9a-f]{32}$/;

/**
 * Resolves canonical path using realpathSync (resolves junctions and symlinks).
 */
function getCanonicalPath(targetPath, fsAdapter = fs) {
  if (!targetPath || typeof targetPath !== 'string') return null;
  try {
    if (fsAdapter && typeof fsAdapter.realpathSync === 'function') {
      return fsAdapter.realpathSync(targetPath);
    }
    return fs.realpathSync(targetPath);
  } catch (_) {
    return null;
  }
}

/**
 * Checks whether targetCwd is strictly inside projectRoot using canonical realpath (sibling-safe).
 * Returns true if inside, false if outside, and null if canonicalization fails.
 */
function isInsideProject(projectRoot, targetCwd, options = {}) {
  const fsAdapter = options.fsAdapter || fs;
  const canonicalRoot = getCanonicalPath(projectRoot, fsAdapter);
  const canonicalTarget = getCanonicalPath(targetCwd, fsAdapter);

  if (!canonicalRoot || !canonicalTarget) {
    return null; // Cannot verify canonical path
  }

  const isWin = process.platform === 'win32';
  const normRoot = path.normalize(canonicalRoot);
  const normTarget = path.normalize(canonicalTarget);
  const rootCmp = isWin ? normRoot.toLowerCase() : normRoot;
  const targetCmp = isWin ? normTarget.toLowerCase() : normTarget;

  const rel = path.relative(rootCmp, targetCmp);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Parses a key string (e.g. "Control_L+o", "Ctrl + Shift + S", "Control+N")
 * into normalized modifiers and base key.
 */
function parseKeyShortcut(keyStr) {
  if (!keyStr || typeof keyStr !== 'string') return null;
  const parts = keyStr.split('+').map(p => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return null;

  const modifiers = new Set();
  let mainKey = null;

  for (const part of parts) {
    if (['ctrl', 'control', 'control_l', 'control_r', 'ctrl_l', 'ctrl_r', 'cmd', 'command'].includes(part)) {
      modifiers.add('ctrl');
    } else if (['shift', 'shift_l', 'shift_r'].includes(part)) {
      modifiers.add('shift');
    } else if (['alt', 'alt_l', 'alt_r', 'option'].includes(part)) {
      modifiers.add('alt');
    } else {
      mainKey = part;
    }
  }

  if (!mainKey) return null;
  return {
    hasCtrl: modifiers.has('ctrl'),
    hasShift: modifiers.has('shift'),
    hasAlt: modifiers.has('alt'),
    key: mainKey
  };
}

/**
 * Extracts and normalizes all keyboard and GUI shortcuts from code.
 */
function extractShortcutsFromCode(code) {
  if (!code || typeof code !== 'string') return [];
  const shortcuts = [];

  // 1. The vendor accepts both ordinary JS and JSON-quoted property names.
  const keyPropRegex = /(?:\bkey\b|"key"|'key')\s*:\s*(['"])([^'"]+)\1/gi;
  let match;
  while ((match = keyPropRegex.exec(code)) !== null) {
    const parsed = parseKeyShortcut(match[2]);
    if (parsed) shortcuts.push(parsed);
  }

  // 2. Scan for hotkey('...'), shortcut('...'), press_key('...')
  const fnCallRegex = /(?:hotkey|shortcut|press_key)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((match = fnCallRegex.exec(code)) !== null) {
    const parsed = parseKeyShortcut(match[1]);
    if (parsed) shortcuts.push(parsed);
  }

  // 3. Scan for any quoted shortcut combination like "Control_L+o", "Ctrl+N"
  const comboRegex = /(['"])([^'"\r\n]*\+[^'"\r\n]*)\1/g;
  while ((match = comboRegex.exec(code)) !== null) {
    const parsed = parseKeyShortcut(match[2]);
    if (parsed) shortcuts.push(parsed);
  }

  return shortcuts;
}

/**
 * Inspects code for known GUI shortcut/menu substitutions.
 * Normalizes vendor Control/Control_L/Control_R/Ctrl variants across multiline calls.
 */
function checkCodeSubstitutions(code, packet) {
  const shortcuts = extractShortcutsFromCode(code);

  for (const sc of shortcuts) {
    // Open Project shortcuts
    if (sc.hasCtrl && sc.key === 'o') {
      return {
        forbidden: true,
        reason: 'AE Tool-First: запрещено открытие проекта через GUI (Ctrl+O / Control_L+o / Open Project). Используйте типизированный project lifecycle.'
      };
    }

    // New Project shortcuts
    if (sc.hasCtrl && sc.key === 'n') {
      return {
        forbidden: true,
        reason: 'AE Tool-First: запрещено создание проекта через GUI (Ctrl+N / Control+N / New Project). Используйте типизированный project lifecycle.'
      };
    }

    // Reload shortcuts
    if ((sc.hasCtrl && sc.key === 'r') || sc.key === 'f5') {
      return {
        forbidden: true,
        reason: 'AE Tool-First: запрещен reload панели через GUI (Ctrl+R / F5 / Reload). Используйте штатный CLI scripts/cep-panel-cdp-smoke.js reload.'
      };
    }

    // Save As / Initial Save shortcuts (Ctrl+Shift+S, Ctrl+Alt+S)
    if (sc.hasCtrl && (sc.hasShift || sc.hasAlt) && sc.key === 's') {
      // Allowed ONLY under strict typed_gap: first_unnamed_save with explicit fresh unnamed state and owned fixture evidence
      const isFirstUnnamedSave = packet
        && packet.reason === 'typed_gap'
        && packet.primitive === 'first_unnamed_save'
        && typeof packet.evidence === 'string'
        && /unnamed/i.test(packet.evidence)
        && /(?:owned\s*fixture|fixture)/i.test(packet.evidence);

      if (!isFirstUnnamedSave) {
        return {
          forbidden: true,
          reason: 'AE Tool-First: запрещено именованное сохранение через GUI (Ctrl+Shift+S / Save As). Допускается только initial save безымянного owned fixture в рамках typed_gap: first_unnamed_save.'
        };
      }
    }

    // Plain Save shortcut (Ctrl+S without Shift)
    if (sc.hasCtrl && sc.key === 's' && !sc.hasShift && !sc.hasAlt) {
      return {
        forbidden: true,
        reason: 'AE Tool-First: сохранение проекта через GUI (Ctrl+S) запрещено. Используйте типизированный project lifecycle.'
      };
    }
  }

  // Text/menu string checks
  if (/['"](?:Open Project|Open\.\.\.)['"]/i.test(code)) {
    return {
      forbidden: true,
      reason: 'AE Tool-First: открытие проекта через GUI запрещено; используйте типизированный project lifecycle.'
    };
  }
  if (/['"](?:New Project)['"]/i.test(code)) {
    return {
      forbidden: true,
      reason: 'AE Tool-First: создание проекта через GUI запрещено; используйте типизированный project lifecycle.'
    };
  }
  if (/['"](?:Save Project As)['"]/i.test(code)) {
    return {
      forbidden: true,
      reason: 'AE Tool-First: именованное сохранение через GUI запрещено; используйте типизированный project lifecycle.'
    };
  }
  if (/['"](?:Save As)['"]/i.test(code)) {
    const isFirstUnnamedSave = packet
      && packet.reason === 'typed_gap'
      && packet.primitive === 'first_unnamed_save'
      && typeof packet.evidence === 'string'
      && /unnamed/i.test(packet.evidence)
      && /(?:owned\s*fixture|fixture)/i.test(packet.evidence);
    if (!isFirstUnnamedSave) {
      return {
        forbidden: true,
        reason: 'AE Tool-First: сохранение Save As через GUI запрещено вне strictly scoped first_unnamed_save.'
      };
    }
  }
  if (/['"](?:Reload Extension|Reload Panel)['"]/i.test(code)) {
    return {
      forbidden: true,
      reason: 'AE Tool-First: запрещен reload панели через GUI (используйте scripts/cep-panel-cdp-smoke.js reload).'
    };
  }
  if (/['"](?:New Layer)['"]/i.test(code)) {
    return {
      forbidden: true,
      reason: 'AE Tool-First: создание слоев через GUI запрещено; используйте типизированные MCP инструменты.'
    };
  }

  return { forbidden: false };
}

/**
 * Extracts fallback packet from a REAL leading code comment only (JSON structure strictly).
 * Returns { packet: Object } if valid, { error: string } if syntax error, or null if no leading comment.
 */
function extractLeadingCommentPacket(code) {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.replace(/^\uFEFF/, '').trimStart();
  let commentBody = null;

  if (trimmed.startsWith('/*')) {
    const endIdx = trimmed.indexOf('*/');
    if (endIdx === -1) {
      return { error: 'незакрытый блочный комментарий в начале кода' };
    }
    commentBody = trimmed.slice(2, endIdx).trim();
  } else if (trimmed.startsWith('//')) {
    const newlineIdx = trimmed.indexOf('\n');
    const line = newlineIdx === -1 ? trimmed : trimmed.slice(0, newlineIdx);
    commentBody = line.slice(2).trim();
  } else {
    // Code does NOT start with a comment (e.g. starts with const, let, expression)
    return null;
  }

  const markerMatch = commentBody.match(/^(?:AE_TOOL_FIRST_FALLBACK|AE_FALLBACK)\s*:\s*([\s\S]*)$/i);
  if (!markerMatch) {
    return null;
  }

  const rawJson = markerMatch[1].trim();
  if (!rawJson.startsWith('{') || !rawJson.endsWith('}')) {
    return { error: 'fallback packet в комментарии обязан быть строгим JSON-объектом' };
  }

  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'fallback packet не является объектом JSON' };
    }
    return { packet: parsed };
  } catch (err) {
    return { error: `ошибка парсинга JSON в fallback packet: ${err.message}` };
  }
}

/**
 * Extracts fallback packet strictly as a JSON object from title or leading code comment.
 */
function extractFallbackPacket(title, code) {
  // 1. Try title strictly as JSON object
  if (typeof title === 'string' && title.trim()) {
    const trimmedTitle = title.trim();
    if (trimmedTitle.startsWith('{') && trimmedTitle.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmedTitle);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { packet: parsed };
        }
      } catch (err) {
        return { error: `ошибка парсинга JSON в title: ${err.message}` };
      }
    }
  }

  // 2. Try leading code comment ONLY
  const fromComment = extractLeadingCommentPacket(code);
  if (fromComment) {
    return fromComment;
  }

  return null;
}

/**
 * Extracts code, command, and title from potentially nested tool_input shapes.
 */
function extractInputFields(toolInput) {
  let code = '';
  let command = '';
  let title = '';

  if (typeof toolInput === 'string') {
    code = toolInput;
    command = toolInput;
  } else if (toolInput && typeof toolInput === 'object' && !Array.isArray(toolInput)) {
    title = toolInput.title || '';
    code = toolInput.code || toolInput.script || '';
    command = toolInput.command || toolInput.cmd || '';

    // Handle nested shapes e.g. toolInput.input
    if (toolInput.input && typeof toolInput.input === 'object' && !Array.isArray(toolInput.input)) {
      if (!title && toolInput.input.title) title = toolInput.input.title;
      if (!code && (toolInput.input.code || toolInput.input.script)) {
        code = toolInput.input.code || toolInput.input.script;
      }
      if (!command && (toolInput.input.command || toolInput.input.cmd)) {
        command = toolInput.input.command || toolInput.input.cmd;
      }
    }
  }

  return { code, command, title };
}

/**
 * Evaluates PreToolUse invocation against Tool-First guard policies.
 * Returns { decision: 'pass', reason?: string } or { decision: 'deny', reason: string }.
 */
function evaluatePreToolUse(payload, options = {}) {
  try {
    let data = payload;
    if (typeof data === 'string') {
      if (!data.trim()) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: пустой входной payload (fail closed)'
        };
      }
      try {
        data = JSON.parse(data);
      } catch (err) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: ошибка парсинга JSON payload (fail closed)'
        };
      }
    }

    // Must be a non-array, non-null plain object
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        decision: 'deny',
        reason: 'AE Tool-First: некорректная структура payload (должен быть plain JSON object) (fail closed)'
      };
    }

    // Mandatory tool name verification
    const rawToolName = data.tool_name !== undefined ? data.tool_name : data.tool;
    if (typeof rawToolName !== 'string' || !rawToolName.trim()) {
      return {
        decision: 'deny',
        reason: 'AE Tool-First: отсутствует или некорректно обязательное имя инструмента tool_name (fail closed)'
      };
    }
    const toolName = rawToolName.trim();

    // Mandatory cwd verification
    const rawCwd = data.cwd !== undefined ? data.cwd : (options.cwd !== undefined ? options.cwd : process.cwd());
    if (typeof rawCwd !== 'string' || !rawCwd.trim()) {
      return {
        decision: 'deny',
        reason: 'AE Tool-First: отсутствует или некорректен cwd (fail closed)'
      };
    }

    const defaultRoot = path.resolve(__dirname, '..');
    const projectRoot = options.projectRoot || defaultRoot;

    // 1. Strict realpath canonical project scope (sibling-safe)
    const insideStatus = isInsideProject(projectRoot, rawCwd, options);
    if (insideStatus === null) {
      // Cannot verify realpath (missing path or resolution error) -> fail closed
      return {
        decision: 'deny',
        reason: 'AE Tool-First: cwd не существует или не может быть канонизирован через realpath (fail closed)'
      };
    }
    if (insideStatus === false) {
      return { decision: 'pass', reason: 'out of project scope' };
    }

    const isRepl = GATED_REPL_PATTERN.test(toolName);
    const isShell = GATED_SHELL_PATTERN.test(toolName);

    if (!isRepl && !isShell) {
      return { decision: 'pass', reason: 'unmonitored tool name' };
    }

    const { code, command, title } = extractInputFields(data.tool_input || data.input);

    // 2. Shell inspection
    if (isShell) {
      const hasSkyOrCuBypass = /@oai\/sky|(\bsky\b\s*(click|mouse|key|press|type|screenshot))|(\bnode\b.*(\bsky\b|node_repl|cua_repl))|codex-computer-use|desktop-automation/i.test(command);
      if (hasSkyOrCuBypass) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: прямой вызов Computer Use / sky / codex-computer-use через shell запрещен. Используйте типизированные MCP инструменты или утвержденный CLI.'
        };
      }
      return { decision: 'pass', reason: 'normal shell command' };
    }

    // 3. Exact harmless canary literal template check (NO arbitrary substring exemption)
    const normalizedCode = (code || '').trim();
    if (EXACT_HARMLESS_CANARY_TEMPLATES.has(normalizedCode)) {
      return { decision: 'pass', reason: 'read-only evaluator canary exemption' };
    }

    // 4. REPL setup / reset exemptions (without code)
    if (/^mcp__(node_repl__js_reset|cua_repl__js_reset)$/i.test(toolName)) {
      return { decision: 'pass', reason: 'repl reset exemption' };
    }
    if (/^mcp__node_repl__js_add_node_module_dir$/i.test(toolName)) {
      return { decision: 'pass', reason: 'repl setup exemption' };
    }

    // 5. Fallback Packet Extraction
    const extractionResult = extractFallbackPacket(title, code);
    if (!extractionResult) {
      return {
        decision: 'deny',
        reason: 'AE Tool-First: отсутствует классификация CU-capable вызова (fallback packet не найден в title или реальном начальном комментарии кода). Использование GUI требует объявления reason, primitive и evidence.'
      };
    }
    if (extractionResult.error) {
      return {
        decision: 'deny',
        reason: `AE Tool-First: синтаксическая ошибка fallback packet (${extractionResult.error}) (fail closed)`
      };
    }

    const packet = extractionResult.packet;
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
      return {
        decision: 'deny',
        reason: 'AE Tool-First: fallback packet не является объектом JSON (fail closed)'
      };
    }

    // 6. Direct Code GUI Shortcuts & Substitutions check (aware of legitimate first_unnamed_save)
    const shortcutCheck = checkCodeSubstitutions(code, packet);
    if (shortcutCheck.forbidden) {
      return {
        decision: 'deny',
        reason: shortcutCheck.reason
      };
    }

    // 7. Taxonomy reason verification
    if (typeof packet.reason !== 'string' || !VALID_REASONS.has(packet.reason.trim())) {
      const reasonVal = typeof packet.reason === 'string' ? packet.reason.trim() : String(packet.reason);
      return {
        decision: 'deny',
        reason: `AE Tool-First: недопустимая или отсутствующая категория fallback ("${reasonVal}"). Разрешены только: ${Array.from(VALID_REASONS).join(', ')}.`
      };
    }
    const reason = packet.reason.trim();

    // 8. Primitive verification
    if (typeof packet.primitive !== 'string' || !packet.primitive.trim()) {
      return {
        decision: 'deny',
        reason: 'AE Tool-First: отсутствует или не является строкой обязательное поле primitive (одна атомарная операция) в fallback packet.'
      };
    }
    const primitive = packet.primitive.trim().toLowerCase();

    // 9. Evidence verification
    if (typeof packet.evidence !== 'string' || !packet.evidence.trim()) {
      return {
        decision: 'deny',
        reason: 'AE Tool-First: отсутствует или не является строкой обязательная ссылка на evidence в fallback packet.'
      };
    }

    // 10. Known forbidden substitutions denied REGARDLESS of declared reason
    if (FORBIDDEN_SUBSTITUTION_PRIMITIVES.has(primitive)) {
      if (primitive.includes('reload')) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: запрещена замена штатного CLI reload через GUI (используйте scripts/cep-panel-cdp-smoke.js reload).'
        };
      }
      if (primitive.includes('open')) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: открытие проекта через GUI запрещено; используйте типизированный project lifecycle.'
        };
      }
      if (primitive.includes('new')) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: создание проекта через GUI запрещено; используйте типизированный project lifecycle.'
        };
      }
      if (primitive.includes('save')) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: именованное сохранение проекта через GUI запрещено; используйте типизированный project lifecycle (build_project_lifecycle_plan).'
        };
      }
      if (primitive.includes('timeline')) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: манипуляции таймлайном через GUI запрещены; используйте типизированные MCP инструменты.'
        };
      }
      if (primitive.includes('layer') || primitive.includes('comp') || primitive.includes('property')) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: создание и редактирование слоев/композиций через GUI запрещено; используйте типизированные MCP инструменты.'
        };
      }
      return {
        decision: 'deny',
        reason: `AE Tool-First: запрещенная операция GUI подмены "${primitive}".`
      };
    }

    // 11. Scoped validation per taxonomy reason
    if (reason === 'panel_bootstrap') {
      if (primitive !== 'open_closed_panel') {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: категория panel_bootstrap разрешает только открытие закрытой панели (open_closed_panel), но не reload или другие действия.'
        };
      }
    } else if (reason === 'visual_ui_only') {
      const allowedVisual = new Set(['observe_ui', 'inspect_third_party_plugin', 'click_third_party_plugin_ui']);
      if (!allowedVisual.has(primitive)) {
        return {
          decision: 'deny',
          reason: `AE Tool-First: visual_ui_only разрешает только визуальное наблюдение/клик стороннего плагина (${Array.from(allowedVisual).join(', ')}), без setters и мутаций.`
        };
      }
      if (/set_|create_|modify_|delete_/i.test(primitive) || /setValue|addLayer|save/i.test(code)) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: visual_ui_only не разрешает setters или мутации проекта.'
        };
      }
    } else if (reason === 'protected_confirmation') {
      const allowedConfirmation = new Set(['confirm_proposal_dialog', 'user_approval_wait']);
      if (!allowedConfirmation.has(primitive)) {
        return {
          decision: 'deny',
          reason: `AE Tool-First: protected_confirmation разрешает только подтверждение диалога (${Array.from(allowedConfirmation).join(', ')}).`
        };
      }

      // Must declare strict typed proposal pins
      const pins = packet.proposalPins || packet.pins;
      if (!pins || typeof pins !== 'object' || Array.isArray(pins)) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: protected_confirmation требует объекта proposalPins (actionId, instanceId/instanceUUID, revision, dryRunId, payloadHash/previewHash).'
        };
      }

      if (typeof pins.actionId !== 'string' || !ACTION_ID_REGEX.test(pins.actionId)) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: proposalPins.actionId обязан иметь generated форму act_ и 32 lowercase hex-символа.'
        };
      }

      const instanceUUID = pins.instanceUUID || pins.instanceId;
      if (typeof instanceUUID !== 'string' || !UUID_REGEX.test(instanceUUID.trim())) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: proposalPins.instanceId/instanceUUID обязан быть валидным UUID (8-4-4-4-12 hex).'
        };
      }

      if (typeof pins.revision !== 'number' || !Number.isInteger(pins.revision) || pins.revision <= 0) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: proposalPins.revision обязан быть положительным целым числом (> 0).'
        };
      }

      const dryRunId = pins.dryRunId !== undefined ? pins.dryRunId : pins.dryrunId;
      if (typeof dryRunId !== 'string' || !UUID_REGEX.test(dryRunId.trim())) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: proposalPins.dryRunId обязан быть валидным строковым UUID (boolean true не является идентификатором).'
        };
      }

      const planHash = pins.payloadHash || pins.previewHash || pins.planHash || pins.hash;
      if (typeof planHash !== 'string' || !SHA256_REGEX.test(planHash.trim())) {
        return {
          decision: 'deny',
          reason: 'AE Tool-First: proposalPins требует хеша формы sha256 (64 hex-символа: payloadHash, previewHash или planHash).'
        };
      }

      // No authority grant declaration: packet never bypasses CEP confirmation/dry-run gates
    } else if (reason === 'modal_blocker') {
      const allowedModal = new Set(['dismiss_system_dialog', 'dismiss_os_alert', 'dismiss_ae_modal']);
      if (!allowedModal.has(primitive)) {
        return {
          decision: 'deny',
          reason: `AE Tool-First: modal_blocker разрешает только закрытие системного диалога (${Array.from(allowedModal).join(', ')}).`
        };
      }
    } else if (reason === 'diagnostics') {
      const allowedDiag = new Set(['capture_ui_screenshot', 'ui_render_inspection']);
      if (!allowedDiag.has(primitive)) {
        return {
          decision: 'deny',
          reason: `AE Tool-First: diagnostics разрешает только диагностический снимок интерфейса (${Array.from(allowedDiag).join(', ')}).`
        };
      }
    } else if (reason === 'typed_gap') {
      const allowedGap = new Set(['first_unnamed_save', 'documented_gap_action']);
      if (!allowedGap.has(primitive)) {
        return {
          decision: 'deny',
          reason: `AE Tool-First: typed_gap разрешает только документированные пробелы (например, first_unnamed_save), а не произвольные операции.`
        };
      }
      if (primitive === 'first_unnamed_save') {
        const ev = packet.evidence || '';
        if (!/unnamed/i.test(ev) || !/(?:owned\s*fixture|fixture)/i.test(ev)) {
          return {
            decision: 'deny',
            reason: 'AE Tool-First: primitive first_unnamed_save требует evidence с подтверждением свежего безымянного состояния (fresh unnamed) и владения фикстурой (owned fixture).'
          };
        }
      }
    }

    return { decision: 'pass', reason: 'valid fallback packet' };
  } catch (err) {
    return {
      decision: 'deny',
      reason: `AE Tool-First: исключение при валидации pre-tool (${err && err.message ? err.message : String(err)}) (fail closed)`
    };
  }
}

/**
 * Emits synchronous deny JSON to stdout.
 */
function emitDeny(reason) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason || 'AE Tool-First: отсутствует допустимый fallback scope'
    }
  };
  process.stdout.write(JSON.stringify(output) + '\n');
}

/**
 * CLI execution entry point.
 */
function main() {
  let inputStr = '';
  try {
    inputStr = fs.readFileSync(0, 'utf-8');
  } catch (err) {
    emitDeny('AE Tool-First: ошибка чтения stdin (fail closed)');
    process.exit(0);
  }

  const result = evaluatePreToolUse(inputStr);
  if (result.decision === 'deny') {
    emitDeny(result.reason);
    process.exit(0);
  }

  // Pass: exit 0 without stdout
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluatePreToolUse,
  extractFallbackPacket,
  extractLeadingCommentPacket,
  parseKeyShortcut,
  extractShortcutsFromCode,
  checkCodeSubstitutions,
  isInsideProject,
  getCanonicalPath,
  VALID_REASONS,
  FORBIDDEN_SUBSTITUTION_PRIMITIVES,
  EXACT_HARMLESS_CANARY_TEMPLATES,
  GATED_REPL_PATTERN,
  GATED_SHELL_PATTERN
};
