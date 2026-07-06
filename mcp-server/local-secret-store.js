"use strict";

const fs = require("fs");
const path = require("path");

const SECRET_TARGETS = {
  "openai-api": { envName: "OPENAI_API_KEY", providerKind: "openai-api" },
  "gemini-api": { envName: "GEMINI_API_KEY", providerKind: "gemini-api" },
  "claude-api": { envName: "ANTHROPIC_API_KEY", providerKind: "claude-api" },
  openrouter: { envName: "OPENROUTER_API_KEY", providerKind: "openrouter-api" },
  "ollama-cloud": { envName: "OLLAMA_CLOUD_API_KEY", providerKind: "ollama-cloud-api" }
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonFileAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function secretTargetForAgent(agentId) {
  return SECRET_TARGETS[String(agentId || "").trim()] || null;
}

function assertSecretTarget(agentId) {
  const target = secretTargetForAgent(agentId);
  if (!target) {
    throw new Error("Secret storage is supported only for API-key provider modes.");
  }
  return target;
}

function maskSecretValue(value) {
  const text = String(value || "");
  if (!text) return "";
  const suffix = text.slice(-4);
  return `****${suffix}`;
}

function isSensitiveKey(key) {
  return /api[-_]?key|token|secret|authorization|password|credential/i.test(String(key || ""));
}

function redactSensitiveObject(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactSensitiveObject);
  if (typeof value !== "object") return value;
  const output = {};
  for (const key of Object.keys(value)) {
    const item = value[key];
    output[key] = isSensitiveKey(key)
      ? maskSecretValue(item)
      : redactSensitiveObject(item);
  }
  return output;
}

function createLocalSecretStore(options) {
  const file = path.resolve(options && options.file || path.join(process.cwd(), ".codex", "agent-secrets.json"));
  const env = options && options.env || process.env;

  function loadRaw() {
    const raw = readJsonFile(file);
    return raw && typeof raw === "object" ? raw : {};
  }

  function normalize(raw) {
    return {
      ...raw,
      apiKeys: raw.apiKeys && typeof raw.apiKeys === "object" ? raw.apiKeys : {}
    };
  }

  function saveRaw(value) {
    writeJsonFileAtomic(file, value);
  }

  function loadIntoEnv() {
    const secrets = normalize(loadRaw());
    for (const envName of Object.keys(secrets.apiKeys)) {
      if (!env[envName] && typeof secrets.apiKeys[envName] === "string" && secrets.apiKeys[envName]) {
        env[envName] = secrets.apiKeys[envName];
      }
    }
    return secrets;
  }

  function read(agentId) {
    const target = assertSecretTarget(agentId);
    const secrets = normalize(loadRaw());
    const value = secrets.apiKeys[target.envName] || env[target.envName] || "";
    return {
      agentId,
      providerKind: target.providerKind,
      apiKeyEnv: target.envName,
      exists: Boolean(value),
      keySuffix: value ? String(value).slice(-4) : null,
      masked: value ? maskSecretValue(value) : null,
      storage: {
        mode: "bridge-local-secret-store",
        file,
        browserLocalStorage: "forbidden"
      }
    };
  }

  function save(agentId, apiKey) {
    const target = assertSecretTarget(agentId);
    const key = String(apiKey || "").trim();
    if (!key) throw new Error("apiKey is required.");
    if (key.length < 12) throw new Error("apiKey looks too short.");
    const secrets = normalize(loadRaw());
    secrets.apiKeys[target.envName] = key;
    secrets.updatedAt = new Date().toISOString();
    saveRaw(secrets);
    env[target.envName] = key;
    return {
      action: "save",
      ...read(agentId)
    };
  }

  function remove(agentId) {
    const target = assertSecretTarget(agentId);
    const secrets = normalize(loadRaw());
    const existed = Boolean(secrets.apiKeys[target.envName] || env[target.envName]);
    delete secrets.apiKeys[target.envName];
    secrets.updatedAt = new Date().toISOString();
    saveRaw(secrets);
    delete env[target.envName];
    return {
      action: "delete",
      agentId,
      providerKind: target.providerKind,
      apiKeyEnv: target.envName,
      deleted: existed,
      exists: false,
      keySuffix: null,
      masked: null,
      storage: {
        mode: "bridge-local-secret-store",
        file,
        browserLocalStorage: "forbidden"
      }
    };
  }

  function rotate(agentId, apiKey) {
    return {
      ...save(agentId, apiKey),
      action: "rotate"
    };
  }

  return {
    file,
    loadIntoEnv,
    read,
    save,
    delete: remove,
    rotate
  };
}

module.exports = {
  SECRET_TARGETS,
  createLocalSecretStore,
  maskSecretValue,
  redactSensitiveObject,
  secretTargetForAgent
};
