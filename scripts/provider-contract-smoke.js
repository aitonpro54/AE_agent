"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkAgentReadiness, chatWithAgent, launchCodexLogin, listAgents } = require("../mcp-server/ai-agents");

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
  "OPENAI_MODEL",
  "OPENAI_MODELS",
  "OPENAI_API_KEY",
  "OPENAI_KEY",
  "GEMINI_MODEL",
  "GEMINI_MODELS",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "CLAUDE_MODEL",
  "ANTHROPIC_MODEL",
  "CLAUDE_MODELS",
  "ANTHROPIC_MODELS",
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_FREE_MODEL",
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

async function withFakeCmdCodex(loginExitCode, loginText, callback) {
  const oldCodexCliPath = Object.prototype.hasOwnProperty.call(process.env, "CODEX_CLI_PATH")
    ? process.env.CODEX_CLI_PATH
    : undefined;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-fake-codex-cmd-"));
  const shimScriptPath = path.join(tempDir, "codex-shim.js");
  const shimCmdPath = path.join(tempDir, "codex.cmd");
  const capturePath = path.join(tempDir, "exec-capture.json");
  const shimScript = [
    "const fs = require(\"fs\");",
    "const args = process.argv.slice(2);",
    "if (args[0] === \"--version\") {",
    "  console.log(\"codex-cli fake-cmd\");",
    "  process.exit(0);",
    "}",
    "if (args[0] === \"login\" && args[1] === \"status\") {",
    `  console.log(${JSON.stringify(loginText)});`,
    `  process.exit(${Number(loginExitCode) || 0});`,
    "}",
    "if (args[0] === \"exec\") {",
    "  let stdin = \"\";",
    "  process.stdin.setEncoding(\"utf8\");",
    "  process.stdin.on(\"data\", (chunk) => { stdin += chunk; });",
    "  process.stdin.on(\"end\", () => {",
    `    fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args, stdin }), \"utf8\");`,
    "    console.log(JSON.stringify({ type: \"thread.started\", thread_id: \"fake-cmd-thread\" }));",
    "    console.log(JSON.stringify({ type: \"turn.started\" }));",
    "    console.log(JSON.stringify({ type: \"item.completed\", item: { type: \"agent_message\", text: \"FAKE CMD CHAT OK\" } }));",
    "    console.log(JSON.stringify({ type: \"turn.completed\", usage: { input_tokens: stdin.length, output_tokens: 4 } }));",
    "  });",
    "  return;",
    "}",
    "console.error(\"Unsupported fake Codex command: \" + args.join(\" \"));",
    "process.exit(2);"
  ].join("\n");
  const shimCmd = [
    "@echo off",
    `"${process.execPath}" "%~dp0codex-shim.js" %*`
  ].join("\r\n");
  fs.writeFileSync(shimScriptPath, shimScript, "utf8");
  fs.writeFileSync(shimCmdPath, shimCmd, "utf8");

  try {
    setEnv("CODEX_CLI_PATH", shimCmdPath);
    return await callback(shimCmdPath, capturePath);
  } finally {
    setEnv("CODEX_CLI_PATH", oldCodexCliPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function findAgent(agents, id) {
  const agent = agents.find((item) => item.id === id);
  assert(agent, `Missing agent ${id}`);
  return agent;
}

function assertNonEmptyString(value, label) {
  assert.strictEqual(typeof value, "string", `${label} should be a string`);
  assert(value.trim(), `${label} should not be empty`);
}

function assertModelOptionsShape(agent, label) {
  assert(Array.isArray(agent.modelOptions), `${label} should expose modelOptions`);
  assert(agent.modelOptions.length > 0, `${label} should expose at least one model option`);
  assert(Array.isArray(agent.models), `${label} should expose models`);
  const optionIds = agent.modelOptions.map((item, index) => {
    assert(item && typeof item === "object", `${label} model option ${index} should be an object`);
    assertNonEmptyString(item.id, `${label} model option ${index}.id`);
    assertNonEmptyString(item.name || item.id, `${label} model option ${index}.name`);
    return item.id;
  });
  assert.deepStrictEqual(agent.models, optionIds, `${label} models should mirror modelOptions ids`);
  assert.strictEqual(new Set(optionIds).size, optionIds.length, `${label} model ids should be unique`);
  assert(agent.models.includes(agent.model), `${label} selected model should be in models`);
}

function assertModelsShape(agent, label) {
  assert(Array.isArray(agent.models), `${label} should expose models`);
  assert(agent.models.length > 0, `${label} should expose at least one model`);
  for (const [index, model] of agent.models.entries()) {
    assertNonEmptyString(model, `${label} model ${index}`);
  }
  assert.strictEqual(new Set(agent.models).size, agent.models.length, `${label} model ids should be unique`);
  assert(agent.models.includes(agent.model), `${label} selected model should be in models`);
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
    setEnv("OPENAI_MODEL", null);
    setEnv("OPENAI_MODELS", null);
    setEnv("OPENAI_API_KEY", "");
    setEnv("OPENAI_KEY", "");
    setEnv("GEMINI_MODEL", null);
    setEnv("GEMINI_MODELS", null);
    setEnv("GEMINI_API_KEY", "");
    setEnv("GOOGLE_API_KEY", "");
    setEnv("CLAUDE_MODEL", null);
    setEnv("ANTHROPIC_MODEL", null);
    setEnv("CLAUDE_MODELS", null);
    setEnv("ANTHROPIC_MODELS", null);
    setEnv("ANTHROPIC_API_KEY", "");
    setEnv("CLAUDE_API_KEY", "");
    setEnv("OPENROUTER_API_KEY", "");
    setEnv("OPENROUTER_KEY", "");
    setEnv("OPENROUTER_MODEL", null);
    setEnv("OPENROUTER_FREE_MODEL", null);
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
    assertModelOptionsShape(openAiApi, "OpenAI API");

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
    assertModelOptionsShape(openAiCli, "OpenAI CLI");
    assert(!openAiCli.models.includes("Codex Auto Review"));
    assert(!openAiCli.models.includes("codex-auto-review"));

    assert.strictEqual(geminiApi.providerGroup, "gemini");
    assert.strictEqual(geminiApi.authMode, "api");
    assert.strictEqual(geminiApi.transport, "gemini-generate-content");
    assert.strictEqual(geminiApi.requiresApiKey, true);
    assert.strictEqual(geminiApi.canSaveKey, true);
    assert.strictEqual(geminiApi.setupAction, "save_api_key");
    assert.strictEqual(geminiApi.configured, false);
    assertModelOptionsShape(geminiApi, "Gemini API");

    assert.strictEqual(claudeApi.providerGroup, "claude");
    assert.strictEqual(claudeApi.authMode, "api");
    assert.strictEqual(claudeApi.transport, "anthropic-messages");
    assert.strictEqual(claudeApi.requiresApiKey, true);
    assert.strictEqual(claudeApi.canSaveKey, true);
    assert.strictEqual(claudeApi.setupAction, "save_api_key");
    assert.strictEqual(claudeApi.configured, false);
    assertModelOptionsShape(claudeApi, "Claude API");

    assert.strictEqual(openRouter.providerGroup, "openrouter");
    assert.strictEqual(openRouter.authMode, "api");
    assert.strictEqual(openRouter.transport, "openai-chat-completions");
    assert.deepStrictEqual(openRouter.uiModes, ["api"]);
    assert.strictEqual(openRouter.requiresApiKey, true);
    assert.strictEqual(openRouter.canSaveKey, true);
    assert.strictEqual(openRouter.setupAction, "save_api_key");
    assert.strictEqual(openRouter.configured, false);
    assertModelsShape(openRouter, "OpenRouter");

    setEnv("CODEX_CLI_MODEL", "codex-smoke-selected");
    setEnv("CODEX_CLI_MODELS", "codex-smoke-a,codex-smoke-selected");
    setEnv("OPENAI_MODEL", "openai-smoke-selected");
    setEnv("OPENAI_MODELS", "openai-smoke-a,openai-smoke-selected");
    setEnv("GEMINI_MODEL", "gemini-smoke-selected");
    setEnv("GEMINI_MODELS", "gemini-smoke-a,gemini-smoke-selected");
    setEnv("CLAUDE_MODEL", "claude-smoke-selected");
    setEnv("CLAUDE_MODELS", "claude-smoke-a,claude-smoke-selected");
    setEnv("OPENROUTER_MODEL", "openrouter-smoke-selected");
    setEnv("OPENROUTER_MODELS", "openrouter-smoke-a,openrouter-smoke-selected");
    const overrideListed = await listAgents({});
    assert.deepStrictEqual(findAgent(overrideListed.agents, "openai-cli").models, ["codex-smoke-a", "codex-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "openai-cli").model, "codex-smoke-selected");
    assert.deepStrictEqual(findAgent(overrideListed.agents, "openai-api").models, ["openai-smoke-a", "openai-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "openai-api").model, "openai-smoke-selected");
    assert.deepStrictEqual(findAgent(overrideListed.agents, "gemini-api").models, ["gemini-smoke-a", "gemini-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "gemini-api").model, "gemini-smoke-selected");
    assert.deepStrictEqual(findAgent(overrideListed.agents, "claude-api").models, ["claude-smoke-a", "claude-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "claude-api").model, "claude-smoke-selected");
    assert.deepStrictEqual(findAgent(overrideListed.agents, "openrouter").models, ["openrouter-smoke-a", "openrouter-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "openrouter").model, "openrouter-smoke-selected");
    setEnv("CODEX_CLI_MODEL", null);
    setEnv("CODEX_CLI_MODELS", null);
    setEnv("OPENAI_MODEL", null);
    setEnv("OPENAI_MODELS", null);
    setEnv("GEMINI_MODEL", null);
    setEnv("GEMINI_MODELS", null);
    setEnv("CLAUDE_MODEL", null);
    setEnv("CLAUDE_MODELS", null);
    setEnv("OPENROUTER_MODEL", null);
    setEnv("OPENROUTER_MODELS", null);

    const readiness = await checkAgentReadiness({
      agentId: "openai-cli",
      model: openAiCli.model
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
        model: fakeCli.model
      });
      assert.strictEqual(fakeReadiness.canChat, false);
      assert.strictEqual(fakeReadiness.configured, false);
      assert.strictEqual(fakeReadiness.agent.codexStatus.loginStatusCheck.status, 1);
      fakeNotLoggedIn = fakeReadiness.agent.codexStatus;
    });

    let fakeLoggedIn = null;
    await withFakeNodeCodex(0, "Logged in from fake Codex", async () => {
      const fakeListed = await listAgents({});
      const fakeCli = findAgent(fakeListed.agents, "openai-cli");
      const fakeReadiness = await checkAgentReadiness({
        agentId: "openai-cli",
        model: fakeCli.model
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

    let fakeCmdLoggedIn = null;
    if (process.platform === "win32") {
      await withFakeCmdCodex(0, "Logged in from fake cmd Codex", async (shimCmdPath, capturePath) => {
        const fakeListed = await listAgents({});
        const fakeCli = findAgent(fakeListed.agents, "openai-cli");
        const fakeReadiness = await checkAgentReadiness({
          agentId: "openai-cli",
          model: fakeCli.model
        });
        assert.strictEqual(fakeCli.codexStatus.command, shimCmdPath);
        assert.strictEqual(fakeCli.codexStatus.versionCheck.invokedCommand, "cmd.exe");
        assert.strictEqual(fakeCli.codexStatus.loginStatusCheck.invokedCommand, "cmd.exe");
        assert.strictEqual(fakeReadiness.configured, true);
        assert.strictEqual(fakeReadiness.canChat, true);
        assert.strictEqual(fakeReadiness.status, "ready");
        assert.match(fakeReadiness.agent.codexStatus.loginStatusCheck.output, /Logged in from fake cmd Codex/);
        const longPrompt = `Return fake response for stdin path.\n${"x".repeat(12000)}`;
        const chat = await chatWithAgent({
          agentId: "openai-cli",
          model: fakeCli.model,
          prompt: longPrompt,
          timeoutMs: 10000,
          includeRawResponse: true
        });
        assert.strictEqual(chat.text, "FAKE CMD CHAT OK");
        const captured = JSON.parse(fs.readFileSync(capturePath, "utf8"));
        assert.strictEqual(captured.args[0], "exec");
        assert.strictEqual(captured.args[captured.args.length - 1], "-");
        assert(captured.args.includes("--json"), "Expected Codex CLI JSONL mode.");
        assert(captured.args.includes("--sandbox"), "Expected Codex CLI sandbox flag.");
        assert(!captured.args.includes(longPrompt), "OpenAI CLI prompt must not be passed as an argv value.");
        assert(captured.stdin.includes(longPrompt), "OpenAI CLI prompt should be piped through stdin.");
        assert(captured.stdin.length > 12000, "Expected long prompt to survive stdin piping.");
        fakeCmdLoggedIn = {
          ...fakeReadiness.agent.codexStatus,
          stdinPromptLength: captured.stdin.length,
          chatText: chat.text
        };
      });
    }

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
          modelCount: openAiCli.models.length,
          missingCliError: readiness.error,
          setupLaunchBlocked: missingCliSetupError.status.status,
          missingCliVersionCheck: openAiCli.codexStatus.versionCheck.status,
          fakeNotLoggedInLoginCheck: fakeNotLoggedIn.loginStatusCheck.status,
          fakeLoggedInLoginCheck: fakeLoggedIn.loginStatusCheck.status,
          fakeCmdLoggedInLoginCheck: fakeCmdLoggedIn ? fakeCmdLoggedIn.loginStatusCheck.status : "not_applicable"
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
