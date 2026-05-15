"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const OPENAI_MODEL_OPTIONS = [
  { id: "gpt-5.5", name: "GPT-5.5" },
  { id: "gpt-5.4", name: "GPT-5.4" },
  { id: "gpt-5.4-mini", name: "GPT-5.4-Mini" },
  { id: "gpt-5.3-codex", name: "GPT-5.3-Codex" },
  { id: "gpt-5.3-codex-spark", name: "GPT-5.3-Codex-Spark" },
  { id: "gpt-5.2", name: "GPT-5.2" }
];
const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const DEFAULT_CODEX_CLI_MODEL = "gpt-5.5";
const GEMINI_MODEL_OPTIONS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }
];
const CLAUDE_MODEL_OPTIONS = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
  { id: "claude-opus-4-1-20250805", name: "Claude Opus 4.1" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
  { id: "claude-3-7-sonnet-20250219", name: "Claude Sonnet 3.7" },
  { id: "claude-3-5-haiku-20241022", name: "Claude Haiku 3.5" }
];
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const DEFAULT_OPENROUTER_FREE_MODELS = [
  DEFAULT_OPENROUTER_MODEL,
  "openrouter/free",
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free"
];
const DEFAULT_TIMEOUT_MS = Number(process.env.AE_AGENT_HTTP_TIMEOUT_MS || 45000);
const DEFAULT_CODEX_CLI_TIMEOUT_MS = Number(process.env.AE_CODEX_CLI_TIMEOUT_MS || 120000);
const DEFAULT_MODEL_LIST_TIMEOUT_MS = Number(process.env.AE_AGENT_MODEL_LIST_TIMEOUT_MS || 3500);
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || "2023-06-01";
const PROVIDER_ERROR_STATUSES = {
  missing_auth: "missing_auth",
  not_configured: "not_configured",
  missing_model: "missing_model",
  model_unavailable: "model_unavailable",
  network_failure: "network_failure",
  rate_limited: "rate_limited",
  malformed_response: "malformed_response",
  provider_error: "provider_error"
};
const DEFAULT_SYSTEM_PROMPT = process.env.AE_AGENT_SYSTEM_PROMPT || [
  "You are an assistant inside a local Adobe After Effects bridge.",
  "Answer in the user's language.",
  "Do not claim you changed the After Effects project unless a separate AE automation tool was executed."
].join(" ");

function compactString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength || 2000);
}

function boolArg(args, name, fallback) {
  if (!args || args[name] === undefined || args[name] === null || args[name] === "") return fallback;
  const value = args[name];
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function modelDisplayName(modelId) {
  const text = compactString(modelId, 200);
  const known = OPENAI_MODEL_OPTIONS.find((item) => item.id === text || item.name === text);
  if (known) return known.name;
  return text;
}

function modelOptionsFromList(value, fallbackOptions, selectedModel) {
  const configured = splitList(value);
  const options = configured.length
    ? configured.map((id) => ({ id, name: modelDisplayName(id) }))
    : fallbackOptions.map((item) => ({ id: item.id, name: item.name || item.id }));
  if (selectedModel && !options.some((item) => item.id === selectedModel)) {
    options.unshift({ id: selectedModel, name: modelDisplayName(selectedModel) });
  }
  return options;
}

function modelIds(options) {
  return (options || []).map((item) => {
    if (typeof item === "string") return item;
    return item.id || item.name;
  }).filter(Boolean);
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function envValue(name) {
  return name ? process.env[name] || "" : "";
}

function readApiKey(config) {
  return config.apiKey || envValue(config.apiKeyEnv);
}

function codexCommand() {
  return compactString(process.env.CODEX_CLI_PATH || process.env.CODEX_PATH || "codex", 500);
}

function explicitCodexCommand() {
  return compactString(process.env.CODEX_CLI_PATH || process.env.CODEX_PATH || "", 500);
}

function uniqueStrings(values) {
  const output = [];
  for (const value of values || []) {
    const text = compactString(value, 500);
    if (text && !output.includes(text)) output.push(text);
  }
  return output;
}

function defaultLocalAppData() {
  if (process.env.LOCALAPPDATA) return process.env.LOCALAPPDATA;
  if (process.env.USERPROFILE) return path.join(process.env.USERPROFILE, "AppData", "Local");
  return "";
}

function codexCommandCandidates() {
  const explicit = explicitCodexCommand();
  if (explicit) return [explicit];

  const candidates = ["codex"];
  if (process.platform === "win32") {
    const localAppData = defaultLocalAppData();
    if (localAppData) {
      candidates.push(path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe"));
    }
  }
  return uniqueStrings(candidates);
}

function syncCommand(command, args, timeoutMs) {
  try {
    return spawnSync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs || 3500,
      windowsHide: true
    });
  } catch (error) {
    return { error };
  }
}

function commandLooksMissing(result) {
  const error = result && result.error ? result.error : null;
  return Boolean(
    error && (error.code === "ENOENT" || error.code === "ENOTDIR") ||
    result && (result.status === 127 || result.status === 9009)
  );
}

function commandCheckDetails(command, args, result, maxOutput) {
  const error = result && result.error ? result.error : null;
  return {
    command,
    args: Array.isArray(args) ? args.slice() : [],
    status: typeof (result && result.status) === "number" ? result.status : null,
    signal: result && result.signal ? result.signal : null,
    errorCode: error && error.code ? String(error.code) : null,
    errorMessage: error && error.message ? compactString(error.message, 300) : null,
    output: compactString([result && result.stdout, result && result.stderr].filter(Boolean).join(" "), maxOutput || 500) || null
  };
}

function getCodexCliStatus() {
  const versionArgs = ["--version"];
  const candidates = codexCommandCandidates();
  const attemptedVersionChecks = [];
  let command = candidates[0] || codexCommand();
  let version = null;
  let versionCheck = null;

  for (const candidate of candidates) {
    if (candidate !== "codex" && !fs.existsSync(candidate)) {
      const missing = { error: Object.assign(new Error(`Missing file: ${candidate}`), { code: "ENOENT" }) };
      attemptedVersionChecks.push(commandCheckDetails(candidate, versionArgs, missing, 300));
      continue;
    }
    const candidateVersion = syncCommand(candidate, versionArgs, 3000);
    const candidateCheck = commandCheckDetails(candidate, versionArgs, candidateVersion, 300);
    attemptedVersionChecks.push(candidateCheck);
    if (!candidateVersion.error && !commandLooksMissing(candidateVersion)) {
      command = candidate;
      version = candidateVersion;
      versionCheck = candidateCheck;
      break;
    }
  }

  if (!version) {
    version = { error: Object.assign(new Error("Codex CLI was not found."), { code: "ENOENT" }) };
    versionCheck = attemptedVersionChecks[0] || commandCheckDetails(command, versionArgs, version, 300);
  }

  const versionText = compactString([version.stdout, version.stderr].filter(Boolean).join(" "), 300);
  if (commandLooksMissing(version)) {
    return {
      installed: false,
      loggedIn: false,
      command,
      version: null,
      versionCheck,
      attemptedVersionChecks,
      loginStatusCheck: null,
      status: "missing",
      error: "Codex CLI was not found. Install Codex, restart the bridge, or set CODEX_CLI_PATH."
    };
  }

  const loginArgs = ["login", "status"];
  const login = syncCommand(command, loginArgs, 3500);
  const loginStatusCheck = commandCheckDetails(command, loginArgs, login, 500);
  const loginText = compactString([login.stdout, login.stderr].filter(Boolean).join(" "), 500);
  const loggedIn = login.status === 0;
  return {
    installed: true,
    loggedIn,
    command,
    version: versionText || null,
    versionCheck,
    attemptedVersionChecks,
    loginStatusCheck,
    status: loggedIn ? "ready" : "not_logged_in",
    error: loggedIn ? null : (loginText || "Run codex login and sign in with ChatGPT.")
  };
}

function quoteWindowsCmdArg(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function spawnCodexLogin(command) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", [
      "/d",
      "/s",
      "/c",
      `start "Codex ChatGPT Sign-In" ${quoteWindowsCmdArg(command)} login`
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
  }

  return spawn(command, ["login"], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
}

function launchCodexLogin(args) {
  const agent = findAgent(args && (args.agentId || args.agent || args.provider || "openai-cli"));
  const action = compactString((args && args.action) || agent.setupAction || "codex_login", 80);
  const dryRun = boolArg(args, "dryRun", false);
  if (agent.id !== "openai-cli" || agent.apiStyle !== "codex-cli" || action !== "codex_login") {
    throw new Error("Unsupported setup action. Only OpenAI CLI ChatGPT sign-in can be launched from the panel.");
  }

  const status = agent.codexStatus || getCodexCliStatus();
  if (!status.installed) {
    const error = new Error(status.error || "Codex CLI was not found.");
    error.status = status;
    throw error;
  }

  if (dryRun) {
    return {
      launched: false,
      dryRun: true,
      action,
      agent: publicAgent(agent, { codexStatus: status }),
      codexStatus: status,
      message: "Codex ChatGPT sign-in can be launched from the panel."
    };
  }

  const child = spawnCodexLogin(status.command || codexCommand());
  child.unref();
  return {
    launched: true,
    dryRun: false,
    pid: child.pid || null,
    action,
    agent: publicAgent(agent, { codexStatus: status }),
    codexStatus: status,
    message: "Codex ChatGPT sign-in started. Finish sign-in in the opened Codex/browser window, then refresh or check the model."
  };
}

function configurationError(agent) {
  if (!agent) return "Agent is not configured.";
  if (agent.apiStyle === "codex-cli") {
    const status = agent.codexStatus || getCodexCliStatus();
    if (!status.installed) return status.error || "Codex CLI was not found.";
    if (!status.loggedIn) return "Run codex login and sign in with ChatGPT before using OpenAI CLI.";
    return status.error || "Codex CLI is not ready.";
  }
  if (agent.requiresApiKey) {
    return `Set ${agent.apiKeyEnv || "the provider API key"} before using ${agent.label}.`;
  }
  return `${agent.label} is not configured.`;
}

function providerErrorStatus(code) {
  return PROVIDER_ERROR_STATUSES[code] || PROVIDER_ERROR_STATUSES.provider_error;
}

function providerSetupHint(agent, code) {
  if (!agent) return null;
  if (code === "missing_auth") {
    if (agent.apiStyle === "codex-cli") {
      return "Run codex login, finish ChatGPT sign-in, then check the model again.";
    }
    if (agent.requiresApiKey) {
      return `Save a valid ${agent.apiKeyEnv || "provider API key"} for ${agent.label}.`;
    }
  }
  if (code === "not_configured") {
    return agent.setupAction === "detect_ollama"
      ? `Start ${agent.label}, then check the model again.`
      : `Finish setup for ${agent.label}, then check the model again.`;
  }
  if (code === "model_unavailable") {
    return "Refresh the model list or choose a model that this provider exposes.";
  }
  if (code === "network_failure") {
    return agent.apiStyle === "ollama"
      ? "Start Ollama or check the local service URL."
      : "Check the provider endpoint and network connection.";
  }
  if (code === "rate_limited") {
    return "Wait and retry, or choose another provider/model.";
  }
  if (code === "malformed_response") {
    return "Try another model or verify the provider is compatible with this transport.";
  }
  return null;
}

function providerErrorRetryable(code, httpStatus) {
  if (code === "network_failure" || code === "rate_limited") return true;
  if (code === "provider_error" && httpStatus >= 500) return true;
  return false;
}

function providerErrorMessage(agent, code, rawMessage, options) {
  const label = agent && agent.label ? agent.label : "Provider";
  const model = compactString(options && options.model, 240);
  const raw = compactString(rawMessage, 600);
  const hint = providerSetupHint(agent, code);
  const httpStatus = Number(options && options.httpStatus) || 0;

  if (code === "missing_auth") {
    if (!httpStatus && raw) return raw;
    return `${label} rejected authentication. ${hint || "Check provider credentials."}`;
  }
  if (code === "not_configured") {
    return raw || `${label} is not configured.`;
  }
  if (code === "missing_model") {
    return raw || `Choose a model before using ${label}.`;
  }
  if (code === "model_unavailable") {
    return model
      ? `Model ${model} is not available from ${label}. ${hint || ""}`.trim()
      : `${label} could not find the requested model. ${hint || ""}`.trim();
  }
  if (code === "network_failure") {
    return `${label} is unreachable${agent && agent.baseUrl ? ` at ${agent.baseUrl}` : ""}. ${hint || "Check the provider connection."}`;
  }
  if (code === "rate_limited") {
    return `${label} rate limit was reached. ${hint || "Wait and retry."}`;
  }
  if (code === "malformed_response") {
    return `${label} returned an unexpected response${raw ? `: ${raw}` : "."}`;
  }
  return raw ? `${label} provider error: ${raw}` : `${label} provider error.`;
}

function buildProviderError(agent, code, rawMessage, options) {
  const normalizedCode = PROVIDER_ERROR_STATUSES[code] ? code : "provider_error";
  const httpStatus = Number(options && options.httpStatus) || null;
  const providerError = {
    code: normalizedCode,
    status: providerErrorStatus(normalizedCode),
    message: providerErrorMessage(agent, normalizedCode, rawMessage, { ...(options || {}), httpStatus }),
    setupHint: providerSetupHint(agent, normalizedCode),
    retryable: providerErrorRetryable(normalizedCode, httpStatus || 0),
    httpStatus,
    provider: agent && agent.provider ? agent.provider : null,
    agentId: agent && agent.id ? agent.id : null,
    model: compactString(options && options.model, 240) || null,
    phase: compactString(options && options.phase, 80) || null,
    rawProviderMessage: compactString(rawMessage, 600) || null
  };
  return providerError;
}

function attachProviderError(error, providerError) {
  const normalized = error instanceof Error ? error : new Error(providerError.message);
  normalized.message = providerError.message;
  normalized.providerError = providerError;
  return normalized;
}

function configurationProviderError(agent, message, options) {
  const code = agent && (agent.requiresApiKey || agent.apiStyle === "codex-cli")
    ? "missing_auth"
    : "not_configured";
  return buildProviderError(agent, code, message, options || {});
}

function providerErrorCodeFromHttpStatus(statusCode, phase) {
  const status = Number(statusCode) || 0;
  if (status === 401 || status === 403) return "missing_auth";
  if (status === 404 && phase === "chat") return "model_unavailable";
  if (status === 408) return "network_failure";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

function providerErrorCodeFromMessage(message) {
  const text = String(message || "");
  if (/rate limit|rate-limit|too many requests|quota exceeded/i.test(text)) return "rate_limited";
  if (/api key|auth|unauthori[sz]ed|forbidden|permission denied|codex login|sign in/i.test(text)) return "missing_auth";
  if (/model[^.]{0,80}(not found|unavailable|unsupported|does not exist)|unknown model/i.test(text)) return "model_unavailable";
  if (/timed out|timeout|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|network error|fetch failed/i.test(text)) return "network_failure";
  if (/assistant message|unexpected response|malformed response|invalid provider response|invalid json/i.test(text)) return "malformed_response";
  return null;
}

function providerErrorCodeFromError(error, options) {
  if (error && error.providerError && error.providerError.code) return error.providerError.code;
  const statusCode = Number(error && error.statusCode) || 0;
  if (statusCode) return providerErrorCodeFromHttpStatus(statusCode, options && options.phase);
  const systemCode = compactString(error && error.code, 80);
  if (["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT"].includes(systemCode)) {
    return "network_failure";
  }
  return providerErrorCodeFromMessage(error && error.message) || "provider_error";
}

function normalizeProviderError(agent, error, options) {
  if (error && error.providerError) return error;
  const httpStatus = Number(error && error.statusCode) || null;
  const rawMessage = error && error.message ? error.message : String(error || "Provider request failed.");
  const code = options && options.code
    ? options.code
    : providerErrorCodeFromError(error, { ...(options || {}), httpStatus });
  const providerError = buildProviderError(agent, code, rawMessage, { ...(options || {}), httpStatus });
  if (error && error.response !== undefined) providerError.response = error.response;
  return attachProviderError(error instanceof Error ? error : new Error(rawMessage), providerError);
}

function malformedProviderResponseError(agent, model, detail) {
  const providerError = buildProviderError(agent, "malformed_response", detail || "Missing assistant text.", {
    phase: "chat",
    model
  });
  return attachProviderError(new Error(providerError.message), providerError);
}

function requireAssistantText(agent, model, text, detail) {
  if (String(text || "").trim()) return text;
  throw malformedProviderResponseError(agent, model, detail);
}

function parseCustomAgents() {
  const raw = process.env.AE_AGENT_PROVIDERS_JSON;
  if (!raw || !raw.trim()) return [];

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("AE_AGENT_PROVIDERS_JSON must be a JSON array.");
  }

  return parsed.map((item, index) => {
    const id = compactString(item.id || `custom-${index + 1}`, 80);
    const apiStyle = compactString(item.apiStyle || item.kind || "openai", 40);
    const provider = compactString(item.provider || apiStyle, 80);
    const baseUrl = trimTrailingSlash(item.baseUrl || item.url || "");
    if (!baseUrl) throw new Error(`Custom agent ${id} is missing baseUrl.`);

    return {
      id,
      label: compactString(item.label || item.name || id, 120),
      provider,
      apiStyle,
      baseUrl,
      apiKey: item.apiKey || "",
      apiKeyEnv: compactString(item.apiKeyEnv || "", 80),
      model: compactString(item.model || "", 200),
      models: splitList(Array.isArray(item.models) ? item.models.join(",") : item.models),
      requiresApiKey: Boolean(item.requiresApiKey),
      free: Boolean(item.free),
      notes: compactString(item.notes || "Custom provider from AE_AGENT_PROVIDERS_JSON.", 400)
    };
  });
}

function defaultAgents() {
  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
  const openAiModel = compactString(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL, 200);
  const openAiModels = modelOptionsFromList(process.env.OPENAI_MODELS, OPENAI_MODEL_OPTIONS, openAiModel);
  const codexStatus = getCodexCliStatus();
  const codexCliModel = compactString(process.env.CODEX_CLI_MODEL || process.env.OPENAI_CLI_MODEL || DEFAULT_CODEX_CLI_MODEL, 200);
  const codexCliModels = modelOptionsFromList(process.env.CODEX_CLI_MODELS || process.env.OPENAI_CLI_MODELS, OPENAI_MODEL_OPTIONS, codexCliModel);
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  const geminiModel = compactString(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, 200);
  const geminiModels = modelOptionsFromList(process.env.GEMINI_MODELS, GEMINI_MODEL_OPTIONS, geminiModel);
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "";
  const claudeModel = compactString(process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL, 200);
  const claudeModels = modelOptionsFromList(process.env.CLAUDE_MODELS || process.env.ANTHROPIC_MODELS, CLAUDE_MODEL_OPTIONS, claudeModel);
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || "";
  const openRouterModel = compactString(
    process.env.OPENROUTER_MODEL || process.env.OPENROUTER_FREE_MODEL || DEFAULT_OPENROUTER_MODEL,
    200
  );
  const configuredOpenRouterModels = splitList(process.env.OPENROUTER_MODELS);
  const openRouterModels = configuredOpenRouterModels.length
    ? configuredOpenRouterModels
    : DEFAULT_OPENROUTER_FREE_MODELS.slice();
  if (!openRouterModels.includes(openRouterModel)) openRouterModels.unshift(openRouterModel);

  const ollamaModel = compactString(process.env.OLLAMA_MODEL || "gemma4:latest", 200);
  const ollamaModels = splitList(process.env.OLLAMA_MODELS);
  if (!ollamaModels.includes(ollamaModel)) ollamaModels.unshift(ollamaModel);

  const agents = [
    {
      id: "openai-api",
      label: "OpenAI API",
      provider: "openai",
      providerGroup: "openai",
      authMode: "api",
      transport: "openai-chat-completions",
      uiModes: ["api"],
      apiStyle: "openai",
      baseUrl: trimTrailingSlash(process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL),
      apiKey: openAiApiKey,
      apiKeyEnv: "OPENAI_API_KEY",
      model: openAiModel,
      models: modelIds(openAiModels),
      modelOptions: openAiModels,
      requiresApiKey: true,
      canSaveKey: true,
      setupAction: "save_api_key",
      free: false,
      notes: "Uses OpenAI API billing. This is separate from ChatGPT subscription access."
    },
    {
      id: "openai-cli",
      label: "OpenAI CLI",
      provider: "openai",
      providerGroup: "openai",
      authMode: "cli",
      transport: "codex-cli",
      uiModes: ["cli"],
      apiStyle: "codex-cli",
      baseUrl: "",
      apiKey: "",
      apiKeyEnv: "",
      model: codexCliModel,
      models: modelIds(codexCliModels),
      modelOptions: codexCliModels,
      requiresApiKey: false,
      canSaveKey: false,
      setupAction: "codex_login",
      codexStatus,
      free: false,
      notes: "Uses the local Codex CLI after codex login with ChatGPT. No OpenAI API key is used."
    },
    {
      id: "gemini-api",
      label: "Gemini API",
      provider: "gemini",
      providerGroup: "gemini",
      authMode: "api",
      transport: "gemini-generate-content",
      uiModes: ["api"],
      apiStyle: "gemini",
      baseUrl: trimTrailingSlash(process.env.GEMINI_BASE_URL || DEFAULT_GEMINI_BASE_URL),
      apiKey: geminiApiKey,
      apiKeyEnv: "GEMINI_API_KEY",
      model: geminiModel,
      models: modelIds(geminiModels),
      modelOptions: geminiModels,
      requiresApiKey: true,
      canSaveKey: true,
      setupAction: "save_api_key",
      free: false,
      notes: "Uses the Google Gemini API generateContent endpoint. This is separate from ChatGPT subscription access."
    },
    {
      id: "claude-api",
      label: "Claude API",
      provider: "claude",
      providerGroup: "claude",
      authMode: "api",
      transport: "anthropic-messages",
      uiModes: ["api"],
      apiStyle: "anthropic",
      baseUrl: trimTrailingSlash(process.env.ANTHROPIC_BASE_URL || process.env.CLAUDE_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL),
      apiKey: anthropicApiKey,
      apiKeyEnv: "ANTHROPIC_API_KEY",
      model: claudeModel,
      models: modelIds(claudeModels),
      modelOptions: claudeModels,
      requiresApiKey: true,
      canSaveKey: true,
      setupAction: "save_api_key",
      free: false,
      notes: "Uses the Anthropic Messages API. This is separate from ChatGPT subscription access."
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      provider: "openrouter",
      providerGroup: "openrouter",
      authMode: "api",
      transport: "openai-chat-completions",
      uiModes: ["api"],
      apiStyle: "openai",
      baseUrl: trimTrailingSlash(process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL),
      apiKey: openRouterApiKey,
      apiKeyEnv: "OPENROUTER_API_KEY",
      model: openRouterModel,
      models: openRouterModels,
      requiresApiKey: true,
      canSaveKey: true,
      setupAction: "save_api_key",
      free: openRouterModel.indexOf(":free") >= 0 || openRouterModel === "openrouter/free",
      notes: "Defaults to a top free OpenRouter model. Supports regular models, :free variants, and the openrouter/free router."
    },
    {
      id: "ollama-local",
      label: "Ollama Local",
      provider: "ollama",
      providerGroup: "local",
      authMode: "local",
      transport: "ollama-chat",
      uiModes: ["local"],
      apiStyle: "ollama",
      baseUrl: trimTrailingSlash(process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL),
      apiKey: "",
      apiKeyEnv: "",
      model: ollamaModel,
      models: ollamaModels,
      requiresApiKey: false,
      canSaveKey: false,
      setupAction: "detect_ollama",
      free: true,
      notes: "Uses the local Ollama daemon and lists installed models from /api/tags."
    }
  ];

  if (process.env.OLLAMA_CLOUD_BASE_URL || process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_CLOUD_MODEL) {
    agents.push({
      id: "ollama-cloud",
      label: "Ollama Cloud",
      provider: "ollama-cloud",
      providerGroup: "local",
      authMode: "api",
      transport: "openai-chat-completions",
      uiModes: ["api"],
      apiStyle: "openai",
      baseUrl: trimTrailingSlash(process.env.OLLAMA_CLOUD_BASE_URL || ""),
      apiKey: process.env.OLLAMA_CLOUD_API_KEY || "",
      apiKeyEnv: "OLLAMA_CLOUD_API_KEY",
      model: compactString(process.env.OLLAMA_CLOUD_MODEL || "", 200),
      models: splitList(process.env.OLLAMA_CLOUD_MODELS),
      requiresApiKey: true,
      canSaveKey: true,
      setupAction: "save_api_key",
      free: false,
      notes: "OpenAI-compatible Ollama cloud endpoint. Set OLLAMA_CLOUD_BASE_URL and OLLAMA_CLOUD_API_KEY."
    });
  }

  try {
    return agents.concat(parseCustomAgents());
  } catch (error) {
    agents.push({
      id: "custom-config-error",
      label: "Custom provider config error",
      provider: "custom",
      providerGroup: "custom",
      authMode: "custom",
      transport: "openai-chat-completions",
      uiModes: ["api"],
      apiStyle: "openai",
      baseUrl: "",
      apiKey: "",
      apiKeyEnv: "",
      model: "",
      models: [],
      requiresApiKey: false,
      canSaveKey: false,
      setupAction: "fix_custom_config",
      free: false,
      notes: error.message || String(error)
    });
    return agents;
  }
}

function allAgents() {
  const seen = new Set();
  return defaultAgents().filter((agent) => {
    if (!agent.id || seen.has(agent.id)) return false;
    seen.add(agent.id);
    return true;
  });
}

function isAgentConfigured(agent) {
  if (agent.apiStyle === "codex-cli") {
    const status = agent.codexStatus || getCodexCliStatus();
    return Boolean(status.installed && status.loggedIn);
  }
  if (!agent.baseUrl) return false;
  if (agent.requiresApiKey && !readApiKey(agent)) return false;
  return true;
}

function canListModelsWithoutApiKey(agent) {
  if (!agent) return false;
  if (agent.apiStyle === "codex-cli") return true;
  return agent.provider === "openrouter" && Boolean(agent.baseUrl);
}

function publicAgent(agent, extra) {
  return {
    id: agent.id,
    label: agent.label,
    provider: agent.provider,
    providerGroup: agent.providerGroup || agent.provider,
    authMode: agent.authMode || null,
    transport: agent.transport || agent.apiStyle || null,
    uiModes: Array.isArray(agent.uiModes) ? agent.uiModes : [],
    apiStyle: agent.apiStyle,
    baseUrl: agent.baseUrl,
    model: agent.model || null,
    models: Array.isArray(agent.models) ? agent.models : [],
    modelOptions: Array.isArray(agent.modelOptions) ? agent.modelOptions : null,
    configured: isAgentConfigured(agent),
    requiresApiKey: Boolean(agent.requiresApiKey),
    apiKeyEnv: agent.apiKeyEnv || null,
    canSaveKey: Boolean(agent.canSaveKey),
    setupAction: agent.setupAction || null,
    free: Boolean(agent.free),
    codexStatus: agent.apiStyle === "codex-cli" ? agent.codexStatus || getCodexCliStatus() : null,
    notes: agent.notes || null,
    ...(extra || {})
  };
}

function agentSummary() {
  return allAgents().map((agent) => ({
    id: agent.id,
    label: agent.label,
    provider: agent.provider,
    model: agent.model || null,
    configured: isAgentConfigured(agent),
    requiresApiKey: Boolean(agent.requiresApiKey),
    apiKeyEnv: agent.apiKeyEnv || null
  }));
}

function findAgent(agentId) {
  const id = compactString(agentId || process.env.AE_DEFAULT_AGENT || "openrouter", 80);
  const agent = allAgents().find((item) => item.id === id);
  if (!agent) {
    throw new Error(`Unknown agent: ${id}`);
  }
  return agent;
}

function normalizeRequestedModel(agent, requestedModel) {
  const requested = compactString(requestedModel || agent.model, 240);
  if (!requested) return "";
  const options = Array.isArray(agent.modelOptions) ? agent.modelOptions : [];
  const lower = requested.toLowerCase();
  const matched = options.find((item) => {
    return String(item.id || "").toLowerCase() === lower || String(item.name || "").toLowerCase() === lower;
  });
  return matched ? matched.id : requested;
}

function joinUrl(baseUrl, pathName) {
  const base = `${trimTrailingSlash(baseUrl)}/`;
  const relative = String(pathName || "").replace(/^\/+/, "");
  return new URL(relative, base).toString();
}

function requestJson(method, requestUrl, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(requestUrl);
    const transport = url.protocol === "https:" ? https : http;
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const requestHeaders = {
      accept: "application/json",
      ...(headers || {})
    };

    if (payload !== undefined) {
      requestHeaders["content-type"] = "application/json";
      requestHeaders["content-length"] = Buffer.byteLength(body);
    }

    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers: requestHeaders,
      timeout: timeoutMs || DEFAULT_TIMEOUT_MS
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = responseBody ? JSON.parse(responseBody) : {};
        } catch (_error) {
          parsed = { text: responseBody };
        }

        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          let message = `HTTP ${res.statusCode || 0} from ${requestUrl}`;
          if (parsed && parsed.error) {
            message = typeof parsed.error === "string"
              ? parsed.error
              : parsed.error.message || message;
          }
          const error = new Error(
            message
          );
          error.statusCode = res.statusCode || 0;
          error.response = parsed;
          reject(error);
          return;
        }

        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs || DEFAULT_TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function openAiHeaders(agent) {
  const headers = {};
  const apiKey = readApiKey(agent);
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (agent.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL || "http://127.0.0.1:3456";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "AE Agent";
  }
  return headers;
}

function geminiHeaders(agent) {
  const headers = {};
  const apiKey = readApiKey(agent);
  if (apiKey) headers["x-goog-api-key"] = apiKey;
  return headers;
}

function anthropicHeaders(agent) {
  const headers = {
    "anthropic-version": ANTHROPIC_VERSION
  };
  const apiKey = readApiKey(agent);
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

function normalizeOpenAiModels(body, freeOnly) {
  const data = body && Array.isArray(body.data) ? body.data : [];
  return data
    .filter((model) => {
      if (!freeOnly) return true;
      if (String(model.id || "").indexOf(":free") >= 0 || String(model.id || "") === "openrouter/free") return true;
      const pricing = model.pricing || {};
      return String(pricing.prompt || "") === "0" && String(pricing.completion || "") === "0";
    })
    .map((model) => ({
      id: model.id,
      name: model.name || model.id,
      contextLength: model.context_length || model.contextLength || null,
      pricing: model.pricing || null
    }))
    .filter((model) => model.id);
}

function normalizeOllamaModels(body) {
  const models = body && Array.isArray(body.models) ? body.models : [];
  return models
    .map((model) => ({
      id: model.model || model.name,
      name: model.name || model.model,
      size: model.size || null,
      modifiedAt: model.modified_at || null,
      details: model.details || null
    }))
    .filter((model) => model.id);
}

function normalizeGeminiModels(body) {
  const models = body && Array.isArray(body.models) ? body.models : [];
  return models
    .filter((model) => {
      const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
      return !methods.length || methods.includes("generateContent");
    })
    .map((model) => {
      const id = String(model.baseModelId || model.name || "").replace(/^models\//, "");
      return {
        id,
        name: model.displayName || id,
        inputTokenLimit: model.inputTokenLimit || null,
        outputTokenLimit: model.outputTokenLimit || null
      };
    })
    .filter((model) => model.id);
}

function normalizeAnthropicModels(body) {
  const models = body && Array.isArray(body.data) ? body.data : [];
  return models
    .map((model) => ({
      id: model.id,
      name: model.display_name || model.displayName || model.id,
      createdAt: model.created_at || null
    }))
    .filter((model) => model.id);
}

async function fetchAgentModels(agent, options) {
  const allowUnauthenticatedModelList = Boolean(options && options.allowUnauthenticatedModelList);
  if (!isAgentConfigured(agent) && !(allowUnauthenticatedModelList && canListModelsWithoutApiKey(agent))) {
    const error = configurationError(agent);
    return {
      reachable: false,
      error,
      providerError: configurationProviderError(agent, error, {
        phase: "setup",
        model: options && options.model ? options.model : agent.model
      }),
      models: []
    };
  }

  const timeoutMs = options && options.timeoutMs ? options.timeoutMs : DEFAULT_MODEL_LIST_TIMEOUT_MS;
  const freeOnly = Boolean(options && options.freeOnly);

  if (agent.apiStyle === "codex-cli") {
    const status = getCodexCliStatus();
    agent.codexStatus = status;
    return {
      reachable: status.installed,
      error: status.installed ? null : status.error,
      models: Array.isArray(agent.modelOptions) ? agent.modelOptions : modelIds(agent.models).map((id) => ({ id, name: id }))
    };
  }

  try {
    if (agent.apiStyle === "ollama") {
      const response = await requestJson("GET", joinUrl(agent.baseUrl, "/api/tags"), undefined, {}, timeoutMs);
      return {
        reachable: true,
        models: normalizeOllamaModels(response.body)
      };
    }

    if (agent.apiStyle === "gemini") {
      const response = await requestJson("GET", joinUrl(agent.baseUrl, "/models"), undefined, geminiHeaders(agent), timeoutMs);
      return {
        reachable: true,
        models: normalizeGeminiModels(response.body)
      };
    }

    if (agent.apiStyle === "anthropic") {
      const response = await requestJson("GET", joinUrl(agent.baseUrl, "/models"), undefined, anthropicHeaders(agent), timeoutMs);
      return {
        reachable: true,
        models: normalizeAnthropicModels(response.body)
      };
    }

    const response = await requestJson("GET", joinUrl(agent.baseUrl, "/models"), undefined, openAiHeaders(agent), timeoutMs);
    return {
      reachable: true,
      models: normalizeOpenAiModels(response.body, freeOnly)
    };
  } catch (error) {
    throw normalizeProviderError(agent, error, {
      phase: "models",
      model: options && options.model ? options.model : agent.model
    });
  }
}

function modelIdMatches(model, requestedModel) {
  const requested = compactString(requestedModel, 240);
  if (!requested || !model) return false;
  return model.id === requested || model.name === requested;
}

function isOpenRouterRouterModel(agent, model) {
  return agent.provider === "openrouter" && model === "openrouter/free";
}

async function checkAgentReadiness(args) {
  const agent = findAgent(args && (args.agentId || args.agent || args.provider));
  const model = normalizeRequestedModel(agent, (args && args.model) || agent.model);
  const checkedAt = new Date().toISOString();
  const freeOnly = boolArg(args, "freeOnly", false);
  const checkModels = boolArg(args, "checkModels", true);
  const timeoutMs = args && args.timeoutMs ? Number(args.timeoutMs) : DEFAULT_MODEL_LIST_TIMEOUT_MS;
  const configured = isAgentConfigured(agent);

  if (!configured) {
    const error = configurationError(agent);
    const providerError = configurationProviderError(agent, error, {
      phase: "setup",
      model: model || null
    });
    return {
      checkedAt,
      agent: publicAgent(agent, { providerError }),
      model: model || null,
      configured: false,
      reachable: false,
      modelAvailable: false,
      modelSource: null,
      canChat: false,
      status: providerError.status,
      error: providerError.message,
      providerError
    };
  }

  if (!model) {
    const providerError = buildProviderError(agent, "missing_model", `model is required for ${agent.label}.`, {
      phase: "setup",
      model: null
    });
    return {
      checkedAt,
      agent: publicAgent(agent, { providerError }),
      model: null,
      configured: true,
      reachable: null,
      modelAvailable: false,
      modelSource: null,
      canChat: false,
      status: providerError.status,
      error: providerError.message,
      providerError
    };
  }

  if (!checkModels) {
    return {
      checkedAt,
      agent: publicAgent(agent),
      model,
      configured: true,
      reachable: null,
      modelAvailable: true,
      modelSource: "not_checked",
      canChat: true,
      status: "ready_unverified",
      error: null
    };
  }

  try {
    const modelState = await fetchAgentModels(agent, { freeOnly, timeoutMs, model });
    const remoteModels = Array.isArray(modelState.models) ? modelState.models : [];
    const hasRemoteList = remoteModels.length > 0;
    let modelAvailable = agent.apiStyle === "ollama"
      ? remoteModels.some((remoteModel) => modelIdMatches(remoteModel, model))
      : !hasRemoteList || remoteModels.some((remoteModel) => modelIdMatches(remoteModel, model));
    let modelSource = hasRemoteList ? "remote_list" : "empty_remote_list";

    if (!modelAvailable && isOpenRouterRouterModel(agent, model)) {
      modelAvailable = true;
      modelSource = "openrouter_router";
    }

    const reachable = modelState.reachable !== false;
    const canChat = configured && reachable && modelAvailable;
    let providerError = null;
    if (!canChat) {
      if (modelState.providerError) {
        providerError = modelState.providerError;
      } else if (!modelAvailable) {
        providerError = buildProviderError(agent, "model_unavailable", `Model ${model} was not found in ${agent.label}'s model list.`, {
          phase: "models",
          model
        });
      } else {
        providerError = buildProviderError(agent, "network_failure", modelState.error || `${agent.label} is not reachable.`, {
          phase: "models",
          model
        });
      }
    }
    const error = providerError ? providerError.message : null;

    return {
      checkedAt,
      agent: publicAgent(agent, {
        reachable,
        modelCount: remoteModels.length,
        remoteModels: remoteModels.slice(0, 200),
        providerError
      }),
      model,
      configured: true,
      reachable,
      modelAvailable,
      modelSource,
      modelCount: remoteModels.length,
      remoteModels: remoteModels.slice(0, 200),
      canChat,
      status: canChat ? "ready" : providerError ? providerError.status : "provider_error",
      error,
      providerError
    };
  } catch (error) {
    const normalizedError = normalizeProviderError(agent, error, {
      phase: "models",
      model
    });
    const providerError = normalizedError.providerError;
    return {
      checkedAt,
      agent: publicAgent(agent, {
        reachable: false,
        modelCount: 0,
        remoteModels: [],
        error: providerError.message,
        providerError
      }),
      model,
      configured: true,
      reachable: false,
      modelAvailable: false,
      modelSource: null,
      modelCount: 0,
      remoteModels: [],
      canChat: false,
      status: providerError.status,
      error: providerError.message,
      providerError
    };
  }
}

async function listAgents(args) {
  const includeModels = Boolean(args && (args.includeModels === true || args.includeModels === "true" || args.includeModels === "1"));
  const freeOnly = Boolean(args && (args.freeOnly === true || args.freeOnly === "true" || args.freeOnly === "1"));
  const timeoutMs = args && args.timeoutMs ? Number(args.timeoutMs) : DEFAULT_MODEL_LIST_TIMEOUT_MS;
  const agents = allAgents();

  if (!includeModels) {
    return {
      defaultAgentId: process.env.AE_DEFAULT_AGENT || "openrouter",
      agents: agents.map((agent) => publicAgent(agent))
    };
  }

  const enriched = [];
  for (const agent of agents) {
    try {
      const modelState = await fetchAgentModels(agent, {
        freeOnly,
        timeoutMs,
        allowUnauthenticatedModelList: true,
        model: agent.model
      });
      const remoteModels = modelState.models || [];
      let modelAvailable = agent.apiStyle === "ollama"
        ? remoteModels.some((remoteModel) => modelIdMatches(remoteModel, agent.model))
        : !remoteModels.length || remoteModels.some((remoteModel) => modelIdMatches(remoteModel, agent.model));
      let modelSource = remoteModels.length ? "remote_list" : "empty_remote_list";
      if (!modelAvailable && isOpenRouterRouterModel(agent, agent.model)) {
        modelAvailable = true;
        modelSource = "openrouter_router";
      }
      const configured = isAgentConfigured(agent);
      const canChat = configured && modelState.reachable !== false && modelAvailable;
      let providerError = null;
      if (!canChat) {
        if (!configured) {
          providerError = modelState.providerError || configurationProviderError(agent, configurationError(agent), {
            phase: "setup",
            model: agent.model
          });
        } else if (modelState.providerError) {
          providerError = modelState.providerError;
        } else if (!modelAvailable) {
          providerError = buildProviderError(agent, "model_unavailable", `Model ${agent.model} was not found in ${agent.label}'s model list.`, {
            phase: "models",
            model: agent.model
          });
        } else {
          providerError = buildProviderError(agent, "network_failure", modelState.error || `${agent.label} is not reachable.`, {
            phase: "models",
            model: agent.model
          });
        }
      }
      enriched.push({
        ...publicAgent(agent, {
          reachable: modelState.reachable,
          modelCount: remoteModels.length,
          remoteModels: remoteModels.slice(0, 200),
          providerError
        }),
        selectedModel: agent.model || null,
        modelAvailable,
        modelSource,
        canChat,
        status: canChat ? "ready" : providerError ? providerError.status : "provider_error",
        error: providerError ? providerError.message : null,
        providerError
      });
    } catch (error) {
      const normalizedError = normalizeProviderError(agent, error, {
        phase: "models",
        model: agent.model
      });
      const providerError = normalizedError.providerError;
      enriched.push(publicAgent(agent, {
        reachable: false,
        modelAvailable: false,
        canChat: false,
        status: providerError.status,
        modelCount: 0,
        remoteModels: [],
        error: providerError.message,
        providerError
      }));
    }
  }

  return {
    defaultAgentId: process.env.AE_DEFAULT_AGENT || "openrouter",
    agents: enriched
  };
}

function normalizeMessages(args) {
  let messages = [];
  if (Array.isArray(args.messages)) {
    messages = args.messages
      .filter((message) => message && message.role && message.content !== undefined)
      .map((message) => ({
        role: compactString(message.role, 40),
        content: typeof message.content === "string" ? message.content : JSON.stringify(message.content)
      }));
  } else {
    const prompt = compactString(args.prompt || args.message || "", 20000);
    if (!prompt) throw new Error("prompt or messages is required.");
    messages = [{ role: "user", content: prompt }];
  }

  const hasSystem = messages.some((message) => message.role === "system");
  const explicitSystem = compactString(args.system || "", 12000);
  if (explicitSystem && !hasSystem) {
    messages.unshift({ role: "system", content: explicitSystem });
  } else if (!hasSystem && args.useDefaultSystemPrompt !== false && args.useDefaultSystemPrompt !== "false") {
    messages.unshift({ role: "system", content: DEFAULT_SYSTEM_PROMPT });
  }

  if (!messages.some((message) => message.role === "user")) {
    throw new Error("At least one user message is required.");
  }

  return messages.slice(-40);
}

function maybeNumber(value, name) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number.`);
  return number;
}

function assistantTextFromContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part.text === "string") return part.text;
      if (part && typeof part.content === "string") return part.content;
      return "";
    }).join("");
  }
  if (content === null || content === undefined) return "";
  return String(content);
}

function codexPromptFromMessages(messages) {
  const lines = [
    "You are the assistant for a local Adobe After Effects panel.",
    "Answer only the user's request. Do not edit files or run shell commands.",
    "If the user asks for an After Effects project change, return the requested plan or answer text; the bridge will handle execution separately.",
    "",
    "Conversation:"
  ];
  for (const message of messages) {
    const role = message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "User";
    lines.push(`${role}: ${message.content}`);
  }
  return lines.join("\n");
}

function codexItemText(item) {
  if (!item || typeof item !== "object") return "";
  if (item.type === "agent_message" && typeof item.text === "string") return item.text;
  if (item.type === "message" && item.role === "assistant") return assistantTextFromContent(item.content || item.text);
  if (item.role === "assistant") return assistantTextFromContent(item.content || item.text);
  return "";
}

function parseCodexJsonl(stdout) {
  const events = [];
  const assistantTexts = [];
  const errors = [];
  const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let event = null;
    try {
      event = JSON.parse(line);
    } catch (_error) {
      continue;
    }
    events.push(event);
    if (event.type === "error" && event.message) errors.push(event.message);
    const itemText = codexItemText(event.item);
    if (itemText) assistantTexts.push(itemText);
    const directText = codexItemText(event);
    if (directText) assistantTexts.push(directText);
  }
  return {
    events,
    text: assistantTexts.length ? assistantTexts[assistantTexts.length - 1] : "",
    errors,
    threadId: events.find((event) => event.thread_id) ? events.find((event) => event.thread_id).thread_id : null,
    usage: events.reduce((usage, event) => event && event.usage ? event.usage : usage, null)
  };
}

function runCodexCli(agent, model, messages, options) {
  const status = getCodexCliStatus();
  if (!status.installed) return Promise.reject(new Error(status.error || "Codex CLI was not found."));
  if (!status.loggedIn) return Promise.reject(new Error("Run codex login and sign in with ChatGPT before using OpenAI CLI."));

  const prompt = codexPromptFromMessages(messages);
  const command = status.command || codexCommand();
  const args = [
    "exec",
    "--ephemeral",
    "--json",
    "--sandbox",
    "read-only",
    "--model",
    model,
    "--cd",
    process.cwd(),
    prompt
  ];
  const timeoutMs = options && options.timeoutMs ? options.timeoutMs : DEFAULT_CODEX_CLI_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      child.kill();
      reject(new Error(`Codex CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const parsed = parseCodexJsonl(stdout);
      if (code !== 0) {
        const message = parsed.errors.length ? parsed.errors[parsed.errors.length - 1] : compactString(stderr || stdout || `Codex CLI exited with ${code}.`, 1000);
        reject(new Error(message));
        return;
      }
      if (!parsed.text) {
        reject(new Error(compactString(stderr || "Codex CLI did not return an assistant message.", 1000)));
        return;
      }
      resolve({
        agent: publicAgent(agent),
        model,
        text: parsed.text,
        message: {
          role: "assistant",
          content: parsed.text
        },
        finishReason: "completed",
        usage: parsed.usage,
        codexThreadId: parsed.threadId,
        rawResponse: options && options.includeRawResponse ? { stdout, stderr, events: parsed.events } : undefined
      });
    });
  });
}

function normalizeOpenAiChatResponse(agent, requestedModel, body, includeRawResponse) {
  const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
  const message = choice && choice.message ? choice.message : {};
  const text = requireAssistantText(agent, requestedModel, assistantTextFromContent(message.content), "Missing assistant message content.");
  const result = {
    agent: publicAgent(agent),
    model: body && body.model ? body.model : requestedModel,
    text,
    message: {
      role: message.role || "assistant",
      content: text
    },
    finishReason: choice ? choice.finish_reason || null : null,
    usage: body.usage || null
  };
  if (includeRawResponse) result.rawResponse = body;
  return result;
}

function normalizeOllamaChatResponse(agent, requestedModel, body, includeRawResponse) {
  const message = body && body.message ? body.message : {};
  const text = requireAssistantText(agent, requestedModel, assistantTextFromContent(message.content), "Missing Ollama assistant message content.");
  const result = {
    agent: publicAgent(agent),
    model: body && body.model ? body.model : requestedModel,
    text,
    message: {
      role: message.role || "assistant",
      content: text
    },
    finishReason: body && body.done_reason ? body.done_reason : null,
    usage: {
      promptEvalCount: body && body.prompt_eval_count ? body.prompt_eval_count : null,
      evalCount: body && body.eval_count ? body.eval_count : null
    }
  };
  if (includeRawResponse) result.rawResponse = body;
  return result;
}

function splitSystemAndConversation(messages) {
  const system = [];
  const conversation = [];
  for (const message of messages || []) {
    if (message.role === "system") {
      system.push(message.content);
    } else {
      conversation.push(message);
    }
  }
  return {
    system: system.filter(Boolean).join("\n\n"),
    conversation
  };
}

function geminiGeneratePath(model) {
  const id = String(model || "").replace(/^models\//, "");
  return `/models/${encodeURIComponent(id)}:generateContent`;
}

function geminiPayloadFromMessages(messages, options) {
  const split = splitSystemAndConversation(messages);
  const payload = {
    contents: split.conversation.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content || "") }]
    }))
  };
  if (split.system) {
    payload.systemInstruction = {
      parts: [{ text: split.system }]
    };
  }

  const generationConfig = {};
  if (options.temperature !== null) generationConfig.temperature = options.temperature;
  if (options.maxTokens !== null) generationConfig.maxOutputTokens = Math.max(1, Math.floor(options.maxTokens));
  if (Object.keys(generationConfig).length) payload.generationConfig = generationConfig;
  return payload;
}

function normalizeGeminiChatResponse(agent, requestedModel, body, includeRawResponse) {
  const candidate = body && Array.isArray(body.candidates) ? body.candidates[0] : null;
  const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
  const text = requireAssistantText(
    agent,
    requestedModel,
    parts.map((part) => part && part.text ? part.text : "").join(""),
    "Missing Gemini candidate text."
  );
  const result = {
    agent: publicAgent(agent),
    model: requestedModel,
    text,
    message: {
      role: "assistant",
      content: text
    },
    finishReason: candidate ? candidate.finishReason || null : null,
    usage: body && body.usageMetadata ? body.usageMetadata : null
  };
  if (includeRawResponse) result.rawResponse = body;
  return result;
}

function anthropicPayloadFromMessages(model, messages, options) {
  const split = splitSystemAndConversation(messages);
  const payload = {
    model,
    max_tokens: options.maxTokens !== null ? Math.max(1, Math.floor(options.maxTokens)) : 4096,
    messages: split.conversation.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "")
    }))
  };
  if (split.system) payload.system = split.system;
  if (options.temperature !== null) payload.temperature = options.temperature;
  return payload;
}

function normalizeAnthropicChatResponse(agent, requestedModel, body, includeRawResponse) {
  const content = body && Array.isArray(body.content) ? body.content : [];
  const text = requireAssistantText(
    agent,
    requestedModel,
    content.map((part) => part && part.type === "text" ? part.text || "" : "").join(""),
    "Missing Anthropic text content."
  );
  const result = {
    agent: publicAgent(agent),
    model: body && body.model ? body.model : requestedModel,
    text,
    message: {
      role: body && body.role ? body.role : "assistant",
      content: text
    },
    finishReason: body && body.stop_reason ? body.stop_reason : null,
    usage: body && body.usage ? body.usage : null
  };
  if (includeRawResponse) result.rawResponse = body;
  return result;
}

async function chatWithAgent(args) {
  args = args || {};
  const agent = findAgent(args.agentId || args.agent || args.provider);
  const model = normalizeRequestedModel(agent, args.model || agent.model);
  const skipReadinessCheck = boolArg(args, "skipReadinessCheck", false);
  const readiness = skipReadinessCheck
    ? await checkAgentReadiness({ ...args, agentId: agent.id, model, checkModels: false })
    : await checkAgentReadiness({ ...args, agentId: agent.id, model });
  if (!readiness.canChat) {
    const error = new Error(readiness.error || `${agent.label} is not ready for chat.`);
    error.readiness = readiness;
    if (readiness.providerError) error.providerError = readiness.providerError;
    throw error;
  }

  const messages = normalizeMessages(args || {});
  const temperature = maybeNumber(args.temperature, "temperature");
  const maxTokens = maybeNumber(args.maxTokens || args.max_tokens, "maxTokens");
  const includeRawResponse = Boolean(args.includeRawResponse);
  const timeoutMs = maybeNumber(args.timeoutMs, "timeoutMs") || DEFAULT_TIMEOUT_MS;

  try {
    if (agent.apiStyle === "codex-cli") {
      const result = await runCodexCli(agent, model, messages, {
        timeoutMs: maybeNumber(args.timeoutMs, "timeoutMs") || DEFAULT_CODEX_CLI_TIMEOUT_MS,
        includeRawResponse
      });
      if (!includeRawResponse) delete result.rawResponse;
      return {
        ...result,
        readiness
      };
    }

    if (agent.apiStyle === "ollama") {
      const body = {
        model,
        messages,
        stream: false
      };
      if (temperature !== null) body.options = { temperature };
      const response = await requestJson("POST", joinUrl(agent.baseUrl, "/api/chat"), body, {}, timeoutMs);
      return {
        ...normalizeOllamaChatResponse(agent, model, response.body, includeRawResponse),
        readiness
      };
    }

    if (agent.apiStyle === "gemini") {
      const body = geminiPayloadFromMessages(messages, { temperature, maxTokens });
      const response = await requestJson("POST", joinUrl(agent.baseUrl, geminiGeneratePath(model)), body, geminiHeaders(agent), timeoutMs);
      return {
        ...normalizeGeminiChatResponse(agent, model, response.body, includeRawResponse),
        readiness
      };
    }

    if (agent.apiStyle === "anthropic") {
      const body = anthropicPayloadFromMessages(model, messages, { temperature, maxTokens });
      const response = await requestJson("POST", joinUrl(agent.baseUrl, "/messages"), body, anthropicHeaders(agent), timeoutMs);
      return {
        ...normalizeAnthropicChatResponse(agent, model, response.body, includeRawResponse),
        readiness
      };
    }

    const body = {
      model,
      messages,
      stream: false
    };
    if (temperature !== null) body.temperature = temperature;
    if (maxTokens !== null) body.max_tokens = Math.max(1, Math.floor(maxTokens));
    if (args.reasoning) body.reasoning = args.reasoning;
    if (args.reasoning_effort) body.reasoning_effort = args.reasoning_effort;

    const response = await requestJson("POST", joinUrl(agent.baseUrl, "/chat/completions"), body, openAiHeaders(agent), timeoutMs);
    return {
      ...normalizeOpenAiChatResponse(agent, model, response.body, includeRawResponse),
      readiness
    };
  } catch (error) {
    const normalizedError = normalizeProviderError(agent, error, {
      phase: "chat",
      model
    });
    normalizedError.readiness = readiness;
    throw normalizedError;
  }
}

module.exports = {
  agentSummary,
  checkAgentReadiness,
  chatWithAgent,
  launchCodexLogin,
  listAgents
};
