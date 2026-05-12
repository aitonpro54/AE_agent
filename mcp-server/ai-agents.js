"use strict";

const http = require("http");
const https = require("https");

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const DEFAULT_OPENROUTER_FREE_MODELS = [
  DEFAULT_OPENROUTER_MODEL,
  "openrouter/free",
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free"
];
const DEFAULT_TIMEOUT_MS = Number(process.env.AE_AGENT_HTTP_TIMEOUT_MS || 45000);
const DEFAULT_MODEL_LIST_TIMEOUT_MS = Number(process.env.AE_AGENT_MODEL_LIST_TIMEOUT_MS || 3500);
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

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function envValue(name) {
  return name ? process.env[name] || "" : "";
}

function readApiKey(config) {
  return config.apiKey || envValue(config.apiKeyEnv);
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
      id: "openrouter",
      label: "OpenRouter",
      provider: "openrouter",
      apiStyle: "openai",
      baseUrl: trimTrailingSlash(process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL),
      apiKey: openRouterApiKey,
      apiKeyEnv: "OPENROUTER_API_KEY",
      model: openRouterModel,
      models: openRouterModels,
      requiresApiKey: true,
      free: openRouterModel.indexOf(":free") >= 0 || openRouterModel === "openrouter/free",
      notes: "Defaults to a top free OpenRouter model. Supports regular models, :free variants, and the openrouter/free router."
    },
    {
      id: "ollama-local",
      label: "Ollama Local",
      provider: "ollama",
      apiStyle: "ollama",
      baseUrl: trimTrailingSlash(process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL),
      apiKey: "",
      apiKeyEnv: "",
      model: ollamaModel,
      models: ollamaModels,
      requiresApiKey: false,
      free: true,
      notes: "Uses the local Ollama daemon and lists installed models from /api/tags."
    }
  ];

  if (process.env.OLLAMA_CLOUD_BASE_URL || process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_CLOUD_MODEL) {
    agents.push({
      id: "ollama-cloud",
      label: "Ollama Cloud",
      provider: "ollama-cloud",
      apiStyle: "openai",
      baseUrl: trimTrailingSlash(process.env.OLLAMA_CLOUD_BASE_URL || ""),
      apiKey: process.env.OLLAMA_CLOUD_API_KEY || "",
      apiKeyEnv: "OLLAMA_CLOUD_API_KEY",
      model: compactString(process.env.OLLAMA_CLOUD_MODEL || "", 200),
      models: splitList(process.env.OLLAMA_CLOUD_MODELS),
      requiresApiKey: true,
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
      apiStyle: "openai",
      baseUrl: "",
      apiKey: "",
      apiKeyEnv: "",
      model: "",
      models: [],
      requiresApiKey: false,
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
  if (!agent.baseUrl) return false;
  if (agent.requiresApiKey && !readApiKey(agent)) return false;
  return true;
}

function canListModelsWithoutApiKey(agent) {
  return agent && agent.provider === "openrouter" && Boolean(agent.baseUrl);
}

function publicAgent(agent, extra) {
  return {
    id: agent.id,
    label: agent.label,
    provider: agent.provider,
    apiStyle: agent.apiStyle,
    baseUrl: agent.baseUrl,
    model: agent.model || null,
    models: Array.isArray(agent.models) ? agent.models : [],
    configured: isAgentConfigured(agent),
    requiresApiKey: Boolean(agent.requiresApiKey),
    apiKeyEnv: agent.apiKeyEnv || null,
    free: Boolean(agent.free),
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
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "Codex AE MCP Bridge";
  }
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

async function fetchAgentModels(agent, options) {
  const allowUnauthenticatedModelList = Boolean(options && options.allowUnauthenticatedModelList);
  if (!isAgentConfigured(agent) && !(allowUnauthenticatedModelList && canListModelsWithoutApiKey(agent))) {
    return {
      reachable: false,
      error: agent.requiresApiKey ? `Set ${agent.apiKeyEnv || "the provider API key"}.` : "Agent is not configured.",
      models: []
    };
  }

  const timeoutMs = options && options.timeoutMs ? options.timeoutMs : DEFAULT_MODEL_LIST_TIMEOUT_MS;
  const freeOnly = Boolean(options && options.freeOnly);

  if (agent.apiStyle === "ollama") {
    const response = await requestJson("GET", joinUrl(agent.baseUrl, "/api/tags"), undefined, {}, timeoutMs);
    return {
      reachable: true,
      models: normalizeOllamaModels(response.body)
    };
  }

  const response = await requestJson("GET", joinUrl(agent.baseUrl, "/models"), undefined, openAiHeaders(agent), timeoutMs);
  return {
    reachable: true,
    models: normalizeOpenAiModels(response.body, freeOnly)
  };
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
  const model = compactString((args && args.model) || agent.model, 200);
  const checkedAt = new Date().toISOString();
  const freeOnly = boolArg(args, "freeOnly", false);
  const checkModels = boolArg(args, "checkModels", true);
  const timeoutMs = args && args.timeoutMs ? Number(args.timeoutMs) : DEFAULT_MODEL_LIST_TIMEOUT_MS;
  const configured = isAgentConfigured(agent);

  if (!configured) {
    const error = agent.requiresApiKey
      ? `Set ${agent.apiKeyEnv || "the provider API key"} before using ${agent.label}.`
      : `${agent.label} is not configured.`;
    return {
      checkedAt,
      agent: publicAgent(agent),
      model: model || null,
      configured: false,
      reachable: false,
      modelAvailable: false,
      modelSource: null,
      canChat: false,
      status: "not_configured",
      error
    };
  }

  if (!model) {
    return {
      checkedAt,
      agent: publicAgent(agent),
      model: null,
      configured: true,
      reachable: null,
      modelAvailable: false,
      modelSource: null,
      canChat: false,
      status: "missing_model",
      error: `model is required for ${agent.label}.`
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
    const modelState = await fetchAgentModels(agent, { freeOnly, timeoutMs });
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
    const error = canChat
      ? null
      : modelAvailable
        ? modelState.error || `${agent.label} is not reachable.`
        : `Model ${model} was not found in ${agent.label}'s model list.`;

    return {
      checkedAt,
      agent: publicAgent(agent, {
        reachable,
        modelCount: remoteModels.length,
        remoteModels: remoteModels.slice(0, 200)
      }),
      model,
      configured: true,
      reachable,
      modelAvailable,
      modelSource,
      modelCount: remoteModels.length,
      remoteModels: remoteModels.slice(0, 200),
      canChat,
      status: canChat ? "ready" : modelAvailable ? "unreachable" : "model_not_found",
      error
    };
  } catch (error) {
    return {
      checkedAt,
      agent: publicAgent(agent, {
        reachable: false,
        modelCount: 0,
        remoteModels: [],
        error: error.message || String(error)
      }),
      model,
      configured: true,
      reachable: false,
      modelAvailable: false,
      modelSource: null,
      modelCount: 0,
      remoteModels: [],
      canChat: false,
      status: "unreachable",
      error: error.message || String(error)
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
        allowUnauthenticatedModelList: true
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
      enriched.push({
        ...publicAgent(agent, {
          reachable: modelState.reachable,
          modelCount: remoteModels.length,
          remoteModels: remoteModels.slice(0, 200)
        }),
        selectedModel: agent.model || null,
        modelAvailable,
        modelSource,
        canChat,
        status: canChat ? "ready" : configured ? "model_not_found" : "not_configured",
        error: canChat
          ? null
          : configured
            ? modelState.error || `Model ${agent.model} was not found in ${agent.label}'s model list.`
            : agent.requiresApiKey
              ? `Set ${agent.apiKeyEnv || "the provider API key"} before using ${agent.label}.`
              : `${agent.label} is not configured.`
      });
    } catch (error) {
      enriched.push(publicAgent(agent, {
        reachable: false,
        modelAvailable: false,
        canChat: false,
        status: "error",
        modelCount: 0,
        remoteModels: [],
        error: error.message || String(error)
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

function normalizeOpenAiChatResponse(agent, requestedModel, body, includeRawResponse) {
  const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
  const message = choice && choice.message ? choice.message : {};
  const text = assistantTextFromContent(message.content);
  const result = {
    agent: publicAgent(agent),
    model: body.model || requestedModel,
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
  const text = assistantTextFromContent(message.content);
  const result = {
    agent: publicAgent(agent),
    model: body.model || requestedModel,
    text,
    message: {
      role: message.role || "assistant",
      content: text
    },
    finishReason: body.done_reason || null,
    usage: {
      promptEvalCount: body.prompt_eval_count || null,
      evalCount: body.eval_count || null
    }
  };
  if (includeRawResponse) result.rawResponse = body;
  return result;
}

async function chatWithAgent(args) {
  args = args || {};
  const agent = findAgent(args.agentId || args.agent || args.provider);
  const model = compactString(args.model || agent.model, 200);
  const skipReadinessCheck = boolArg(args, "skipReadinessCheck", false);
  const readiness = skipReadinessCheck
    ? await checkAgentReadiness({ ...args, agentId: agent.id, model, checkModels: false })
    : await checkAgentReadiness({ ...args, agentId: agent.id, model });
  if (!readiness.canChat) {
    const error = new Error(readiness.error || `${agent.label} is not ready for chat.`);
    error.readiness = readiness;
    throw error;
  }

  const messages = normalizeMessages(args || {});
  const temperature = maybeNumber(args.temperature, "temperature");
  const maxTokens = maybeNumber(args.maxTokens || args.max_tokens, "maxTokens");
  const includeRawResponse = Boolean(args.includeRawResponse);
  const timeoutMs = maybeNumber(args.timeoutMs, "timeoutMs") || DEFAULT_TIMEOUT_MS;

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
}

module.exports = {
  agentSummary,
  checkAgentReadiness,
  chatWithAgent,
  listAgents
};
