"use strict";

const PROVIDER_KINDS = [
  "openai-api",
  "openai-codex-cli",
  "claude-api",
  "gemini-api",
  "openrouter-api",
  "local-ollama"
];

const AGENT_PROVIDER_KIND = {
  "openai-api": "openai-api",
  "openai-cli": "openai-codex-cli",
  "claude-api": "claude-api",
  "gemini-api": "gemini-api",
  openrouter: "openrouter-api",
  "ollama-local": "local-ollama"
};

const PROVIDER_COPY = {
  "openai-api": {
    billingLabel: "OpenAI API billing",
    authLabel: "OpenAI API key",
    authDescription: "Uses an OpenAI API key and normal API billing. It does not use ChatGPT subscription allowance.",
    setupActionLabel: "Save API key",
    secretEnvNames: ["OPENAI_API_KEY"],
    secretStorage: "bridge-local-secret-store"
  },
  "openai-codex-cli": {
    billingLabel: "ChatGPT/Codex CLI subscription",
    authLabel: "Codex CLI ChatGPT sign-in",
    authDescription: "Uses the installed Codex CLI after ChatGPT sign-in. No OpenAI API key is used in this mode.",
    setupActionLabel: "Sign in with ChatGPT",
    secretEnvNames: [],
    secretStorage: "none"
  },
  "claude-api": {
    billingLabel: "Anthropic API billing",
    authLabel: "Anthropic API key",
    authDescription: "Uses the Anthropic Messages API. It is separate from ChatGPT subscription allowance.",
    setupActionLabel: "Save API key",
    secretEnvNames: ["ANTHROPIC_API_KEY"],
    secretStorage: "bridge-local-secret-store"
  },
  "gemini-api": {
    billingLabel: "Google Gemini API billing",
    authLabel: "Gemini API key",
    authDescription: "Uses the Google Gemini generateContent API. It is separate from ChatGPT subscription allowance.",
    setupActionLabel: "Save API key",
    secretEnvNames: ["GEMINI_API_KEY"],
    secretStorage: "bridge-local-secret-store"
  },
  "openrouter-api": {
    billingLabel: "OpenRouter API billing",
    authLabel: "OpenRouter API key",
    authDescription: "Uses OpenRouter API billing, including :free models and the openrouter/free router when selected.",
    setupActionLabel: "Save API key",
    secretEnvNames: ["OPENROUTER_API_KEY"],
    secretStorage: "bridge-local-secret-store"
  },
  "local-ollama": {
    billingLabel: "Local Ollama",
    authLabel: "No API key",
    authDescription: "Uses the local Ollama daemon on 127.0.0.1:11434. No provider API key is stored.",
    setupActionLabel: "Detect Ollama",
    secretEnvNames: [],
    secretStorage: "none"
  }
};

function compactString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength || 1000);
}

function providerKindForAgent(agent) {
  if (!agent) return "";
  if (agent.providerKind && PROVIDER_KINDS.includes(agent.providerKind)) return agent.providerKind;
  if (AGENT_PROVIDER_KIND[agent.id]) return AGENT_PROVIDER_KIND[agent.id];
  if (agent.apiStyle === "codex-cli") return "openai-codex-cli";
  if (agent.apiStyle === "anthropic") return "claude-api";
  if (agent.apiStyle === "gemini") return "gemini-api";
  if (agent.provider === "openrouter") return "openrouter-api";
  if (agent.apiStyle === "ollama") return "local-ollama";
  if (agent.provider === "openai") return "openai-api";
  return compactString(agent.provider || agent.id || "custom-provider", 80);
}

function providerCopy(providerKind) {
  return PROVIDER_COPY[providerKind] || {
    billingLabel: "Custom provider billing",
    authLabel: "Provider setup",
    authDescription: "Custom provider configured through the local bridge.",
    setupActionLabel: "Configure provider",
    secretEnvNames: [],
    secretStorage: "custom"
  };
}

function providerContractForAgent(agent) {
  const providerKind = providerKindForAgent(agent);
  const copy = providerCopy(providerKind);
  const storesSecret = copy.secretStorage === "bridge-local-secret-store";
  return {
    providerKind,
    readinessVersion: "provider-readiness.v1",
    billingLabel: copy.billingLabel,
    authLabel: copy.authLabel,
    authDescription: copy.authDescription,
    setupActionLabel: copy.setupActionLabel,
    secretStorage: {
      mode: copy.secretStorage,
      storesSecret,
      envNames: copy.secretEnvNames.slice(),
      browserLocalStorage: storesSecret ? "forbidden" : "not_used"
    },
    readinessStates: [
      "not_configured",
      "missing_dependency",
      "needs_auth",
      "ready",
      "rate_limited",
      "error"
    ]
  };
}

function modelIdsFromStatus(agent, status) {
  const remoteModels = status && Array.isArray(status.remoteModels) ? status.remoteModels : [];
  const remoteIds = remoteModels.map((model) => typeof model === "string" ? model : model && (model.id || model.name)).filter(Boolean);
  if (remoteIds.length) return remoteIds;
  return Array.isArray(agent && agent.models) ? agent.models.slice() : [];
}

function safeProviderMessage(providerError, fallback) {
  return compactString(
    providerError && (providerError.message || providerError.safeMessage || providerError.rawProviderMessage) || fallback,
    600
  ) || "Provider is not ready.";
}

function providerReadinessFromStatus(agent, status) {
  const providerKind = providerKindForAgent(agent);
  const contract = providerContractForAgent(agent);
  const providerError = status && status.providerError || agent && agent.providerError || null;
  const codexStatus = status && status.codexStatus || agent && agent.codexStatus || null;
  const base = {
    providerKind,
    checkedAt: status && status.checkedAt || null
  };

  if (status && (status.canChat || status.status === "ready")) {
    return {
      ...base,
      state: "ready",
      modelIds: modelIdsFromStatus(agent, status),
      billingLabel: contract.billingLabel
    };
  }

  if (providerError && providerError.code === "rate_limited") {
    return {
      ...base,
      state: "rate_limited",
      retryAfterMs: providerError.retryAfterMs || null
    };
  }

  if (providerKind === "openai-codex-cli") {
    if (codexStatus && codexStatus.installed === false) {
      return {
        ...base,
        state: "missing_dependency",
        dependency: "codex"
      };
    }
    if (codexStatus && codexStatus.installed && codexStatus.loggedIn === false) {
      return {
        ...base,
        state: "needs_auth"
      };
    }
  }

  if (providerKind === "local-ollama" && status && status.reachable === false) {
    return {
      ...base,
      state: "missing_dependency",
      dependency: "ollama"
    };
  }

  if (providerError && providerError.code === "missing_auth") {
    return {
      ...base,
      state: "needs_auth"
    };
  }

  if (status && status.configured === false) {
    return {
      ...base,
      state: agent && agent.requiresApiKey ? "needs_auth" : "not_configured"
    };
  }

  if (!agent || agent && agent.baseUrl === "") {
    return {
      ...base,
      state: "not_configured"
    };
  }

  return {
    ...base,
    state: "error",
    code: providerError && providerError.code ? providerError.code : compactString(status && status.status || "provider_error", 120),
    safeMessage: safeProviderMessage(providerError, status && status.error || agent && agent.error || "")
  };
}

module.exports = {
  PROVIDER_KINDS,
  providerContractForAgent,
  providerCopy,
  providerKindForAgent,
  providerReadinessFromStatus
};
