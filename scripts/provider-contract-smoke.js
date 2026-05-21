"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkAgentReadiness, launchCodexLogin, listAgents } = require("../mcp-server/ai-agents");

const EXPECTED_OPENAI_CLI_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2"
];

const EXPECTED_PROVIDER_AGENT_ORDER = [
  "openai-api",
  "openai-cli",
  "gemini-api",
  "claude-api",
  "openrouter"
];

const MANAGED_ENV = [
  "CODEX_CLI_PATH",
  "CODEX_PATH",
  "CODEX_CLI_MODEL",
  "OPENAI_CLI_MODEL",
  "CODEX_CLI_MODELS",
  "OPENAI_CLI_MODELS",
  "OPENAI_API_KEY",
  "OPENAI_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_MODELS"
];

function saveEnv() {
  const saved = {};
  for (const name of MANAGED_ENV) {
    saved[name] = Object.prototype.hasOwnProperty.call(process.env, name)
      ? process.env[name]
      : undefined;
  }
  return saved;
}

function restoreEnv(saved) {
  for (const name of MANAGED_ENV) {
    if (saved[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = saved[name];
    }
  }
}

function setEnv(name, value) {
  if (value === null || value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withFakeNodeCodex(loginExitCode, loginText, callback) {
  const oldCwd = process.cwd();
  const oldCodexCliPath = Object.prototype.hasOwnProperty.call(process.env, "CODEX_CLI_PATH")
    ? process.env.CODEX_CLI_PATH
    : undefined;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-fake-codex-"));
  const loginScript = [
    "if (process.argv[2] !== \"status\") {",
    "  console.error(\"Unsupported fake Codex login command\");",
    "  process.exit(2);",
    "}",
    `console.log(${JSON.stringify(loginText)});`,
    `process.exit(${Number(loginExitCode) || 0});`
  ].join("\n");
  fs.writeFileSync(path.join(tempDir, "login"), loginScript, "utf8");

  try {
    process.chdir(tempDir);
    setEnv("CODEX_CLI_PATH", process.execPath);
    return await callback();
  } finally {
    process.chdir(oldCwd);
    setEnv("CODEX_CLI_PATH", oldCodexCliPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function findAgent(agents, id) {
  const agent = agents.find((item) => item.id === id);
  assert(agent, `Missing agent ${id}`);
  return agent;
}

async function main() {
  const saved = saveEnv();
  try {
    setEnv("CODEX_CLI_PATH", "definitely-missing-codex-cli-for-provider-contract-smoke.exe");
    setEnv("CODEX_PATH", null);
    setEnv("CODEX_CLI_MODEL", null);
    setEnv("OPENAI_CLI_MODEL", null);
    setEnv("CODEX_CLI_MODELS", null);
    setEnv("OPENAI_CLI_MODELS", null);
    setEnv("OPENAI_API_KEY", "");
    setEnv("OPENAI_KEY", "");
    setEnv("GEMINI_API_KEY", "");
    setEnv("GOOGLE_API_KEY", "");
    setEnv("ANTHROPIC_API_KEY", "");
    setEnv("CLAUDE_API_KEY", "");
    setEnv("OPENROUTER_API_KEY", "");
    setEnv("OPENROUTER_KEY", "");
    setEnv("OPENROUTER_MODEL", null);
    setEnv("OPENROUTER_MODELS", null);

    const listed = await listAgents({});
    const providerAgentIds = listed.agents
      .map((item) => item.id)
      .filter((id) => EXPECTED_PROVIDER_AGENT_ORDER.includes(id));
    assert.strictEqual(new Set(providerAgentIds).size, EXPECTED_PROVIDER_AGENT_ORDER.length);
    assert.deepStrictEqual(providerAgentIds, EXPECTED_PROVIDER_AGENT_ORDER);

    const openAiApi = findAgent(listed.agents, "openai-api");
    const openAiCli = findAgent(listed.agents, "openai-cli");
    const geminiApi = findAgent(listed.agents, "gemini-api");
    const claudeApi = findAgent(listed.agents, "claude-api");
    const openRouter = findAgent(listed.agents, "openrouter");

    assert.strictEqual(openAiApi.providerGroup, "openai");
    assert.strictEqual(openAiApi.authMode, "api");
    assert.strictEqual(openAiApi.transport, "openai-chat-completions");
    assert.deepStrictEqual(openAiApi.uiModes, ["api"]);
    assert.strictEqual(openAiApi.requiresApiKey, true);
    assert.strictEqual(openAiApi.canSaveKey, true);
    assert.strictEqual(openAiApi.setupAction, "save_api_key");
    assert.strictEqual(openAiApi.configured, false);

    assert.strictEqual(openAiCli.providerGroup, "openai");
    assert.strictEqual(openAiCli.authMode, "cli");
    assert.strictEqual(openAiCli.transport, "codex-cli");
    assert.deepStrictEqual(openAiCli.uiModes, ["cli"]);
    assert.strictEqual(openAiCli.requiresApiKey, false);
    assert.strictEqual(openAiCli.canSaveKey, false);
    assert.strictEqual(openAiCli.setupAction, "codex_login");
    assert.strictEqual(openAiCli.configured, false);
    assert(openAiCli.codexStatus, "OpenAI CLI should expose codexStatus");
    assert.strictEqual(openAiCli.codexStatus.installed, false);
    assert.strictEqual(openAiCli.codexStatus.loggedIn, false);
    assert(openAiCli.codexStatus.versionCheck, "OpenAI CLI status should include version diagnostics");
    assert.deepStrictEqual(openAiCli.codexStatus.versionCheck.args, ["--version"]);
    assert.strictEqual(openAiCli.codexStatus.loginStatusCheck, null);

    const cliModelIds = openAiCli.modelOptions.map((item) => item.id);
    assert.deepStrictEqual(cliModelIds, EXPECTED_OPENAI_CLI_MODELS);
    assert(!cliModelIds.includes("Codex Auto Review"));
    assert(!cliModelIds.includes("codex-auto-review"));

    assert.strictEqual(geminiApi.providerGroup, "gemini");
    assert.strictEqual(geminiApi.authMode, "api");
    assert.strictEqual(geminiApi.transport, "gemini-generate-content");
    assert.strictEqual(geminiApi.requiresApiKey, true);
    assert.strictEqual(geminiApi.canSaveKey, true);
    assert.strictEqual(geminiApi.setupAction, "save_api_key");
    assert.strictEqual(geminiApi.configured, false);
    assert(geminiApi.modelOptions.some((item) => item.id === "gemini-2.5-flash"));

    assert.strictEqual(claudeApi.providerGroup, "claude");
    assert.strictEqual(claudeApi.authMode, "api");
    assert.strictEqual(claudeApi.transport, "anthropic-messages");
    assert.strictEqual(claudeApi.requiresApiKey, true);
    assert.strictEqual(claudeApi.canSaveKey, true);
    assert.strictEqual(claudeApi.setupAction, "save_api_key");
    assert.strictEqual(claudeApi.configured, false);
    assert(claudeApi.modelOptions.some((item) => item.id === "claude-sonnet-4-20250514"));

    assert.strictEqual(openRouter.providerGroup, "openrouter");
    assert.strictEqual(openRouter.authMode, "api");
    assert.strictEqual(openRouter.transport, "openai-chat-completions");
    assert.deepStrictEqual(openRouter.uiModes, ["api"]);
    assert.strictEqual(openRouter.requiresApiKey, true);
    assert.strictEqual(openRouter.canSaveKey, true);
    assert.strictEqual(openRouter.setupAction, "save_api_key");
    assert.strictEqual(openRouter.configured, false);
    assert(openRouter.models.some((item) => item.indexOf(":free") >= 0 || item === "openrouter/free"));

    const readiness = await checkAgentReadiness({
      agentId: "openai-cli",
      model: "gpt-5.5"
    });
    assert.strictEqual(readiness.canChat, false);
    assert.strictEqual(readiness.configured, false);
    assert.match(readiness.error, /Codex CLI was not found|run codex login/i);
    assert(readiness.agent.codexStatus.versionCheck, "Readiness should echo Codex CLI version diagnostics");

    let missingCliSetupError = null;
    try {
      launchCodexLogin({
        agentId: "openai-cli",
        action: "codex_login",
        dryRun: true
      });
    } catch (error) {
      missingCliSetupError = error;
    }
    assert(missingCliSetupError, "Missing Codex CLI should block setup launch.");
    assert.strictEqual(missingCliSetupError.status.installed, false);

    let fakeNotLoggedIn = null;
    await withFakeNodeCodex(1, "Not logged in from fake Codex", async () => {
      const fakeListed = await listAgents({});
      const fakeCli = findAgent(fakeListed.agents, "openai-cli");
      assert.strictEqual(fakeCli.codexStatus.installed, true);
      assert.strictEqual(fakeCli.codexStatus.loggedIn, false);
      assert.strictEqual(fakeCli.codexStatus.versionCheck.status, 0);
      assert.strictEqual(fakeCli.codexStatus.loginStatusCheck.status, 1);
      assert.match(fakeCli.codexStatus.loginStatusCheck.output, /Not logged in from fake Codex/);

      const fakeReadiness = await checkAgentReadiness({
        agentId: "openai-cli",
        model: "gpt-5.5"
      });
      assert.strictEqual(fakeReadiness.canChat, false);
      assert.strictEqual(fakeReadiness.configured, false);
      assert.strictEqual(fakeReadiness.agent.codexStatus.loginStatusCheck.status, 1);
      fakeNotLoggedIn = fakeReadiness.agent.codexStatus;
    });

    let fakeLoggedIn = null;
    await withFakeNodeCodex(0, "Logged in from fake Codex", async () => {
      const fakeReadiness = await checkAgentReadiness({
        agentId: "openai-cli",
        model: "gpt-5.5"
      });
      assert.strictEqual(fakeReadiness.configured, true);
      assert.strictEqual(fakeReadiness.reachable, true);
      assert.strictEqual(fakeReadiness.modelAvailable, true);
      assert.strictEqual(fakeReadiness.canChat, true);
      assert.strictEqual(fakeReadiness.status, "ready");
      assert.strictEqual(fakeReadiness.agent.codexStatus.loginStatusCheck.status, 0);
      assert.match(fakeReadiness.agent.codexStatus.loginStatusCheck.output, /Logged in from fake Codex/);
      fakeLoggedIn = fakeReadiness.agent.codexStatus;
    });

    let unsupportedSetupError = null;
    try {
      launchCodexLogin({
        agentId: "openai-api",
        action: "codex_login",
        dryRun: true
      });
    } catch (error) {
      unsupportedSetupError = error;
    }
    assert(unsupportedSetupError, "OpenAI API must not launch Codex login.");
    assert.match(unsupportedSetupError.message, /Unsupported setup action/);

    console.log(JSON.stringify({
      ok: true,
      checked: {
        openAiApi: {
          authMode: openAiApi.authMode,
          setupAction: openAiApi.setupAction,
          requiresApiKey: openAiApi.requiresApiKey
        },
        openAiCli: {
          authMode: openAiCli.authMode,
          setupAction: openAiCli.setupAction,
          requiresApiKey: openAiCli.requiresApiKey,
          models: cliModelIds,
          missingCliError: readiness.error,
          setupLaunchBlocked: missingCliSetupError.status.status,
          missingCliVersionCheck: openAiCli.codexStatus.versionCheck.status,
          fakeNotLoggedInLoginCheck: fakeNotLoggedIn.loginStatusCheck.status,
          fakeLoggedInLoginCheck: fakeLoggedIn.loginStatusCheck.status
        },
        geminiApi: {
          authMode: geminiApi.authMode,
          setupAction: geminiApi.setupAction,
          requiresApiKey: geminiApi.requiresApiKey,
          model: geminiApi.model
        },
        claudeApi: {
          authMode: claudeApi.authMode,
          setupAction: claudeApi.setupAction,
          requiresApiKey: claudeApi.requiresApiKey,
          model: claudeApi.model
        },
        openRouter: {
          authMode: openRouter.authMode,
          setupAction: openRouter.setupAction,
          requiresApiKey: openRouter.requiresApiKey,
          models: openRouter.models
        }
      }
    }, null, 2));
  } finally {
    restoreEnv(saved);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
