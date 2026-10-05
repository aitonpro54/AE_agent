"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const FIXED_TIME = Date.now();
const EXPIRES_AT = new Date(FIXED_TIME + 600000).toISOString();
let testEnvironments = [];

// Parse CLI options: --panel <path>
function parseArgs() {
  const args = process.argv.slice(2);
  let panelPath = path.resolve(__dirname, "../cep-panel/panel.js");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--panel" && args[i + 1]) {
      panelPath = path.resolve(process.cwd(), args[i + 1]);
      i++;
    }
  }
  return { panelPath };
}

// Helper to create test action proposals adhering to M100 protocol
function makeActionProposal(actionId, confirmationToken, expiresAt) {
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  return {
    protocolVersion: "m100.v1",
    messageType: "action_proposal",
    status: "awaiting_confirmation",
    serverCreated: true,
    createdBy: "ae-agent-bridge",
    requestId: "req-" + actionId,
    actionId: actionId,
    risk: {
      level: "mutating",
      requiresConfirmation: true
    },
    action: {
      kind: "ae_tool",
      payloadRef: "payload-" + actionId,
      payloadHash: "sha256:" + hashA,
      previewHash: "sha256:" + hashB
    },
    confirmation: {
      required: true,
      state: "pending",
      riskPolicyVersion: "m100-risk-v1",
      surface: "cep-panel",
      proposalExpiresAt: expiresAt || EXPIRES_AT,
      // Only the private adoption response carries a confirmation token.
      ...(confirmationToken ? { confirmationToken } : {})
    }
  };
}

function makeCurrentPlan(actionId, revision, proposal, instanceId) {
  proposal = proposal || makeActionProposal(actionId, null);
  proposal.revision = typeof revision === "number" ? revision : 1;
  return {
    instanceId: instanceId || "inst-test",
    revision: typeof revision === "number" ? revision : 1,
    actionId: actionId,
    state: "pending",
    expiresAt: proposal.confirmation.proposalExpiresAt,
    project: {
      expectedFile: "test.aep",
      actualFile: "test.aep"
    },
    plan: {
      summary: "Plan for " + actionId,
      targetProject: { file: "test.aep" },
      steps: [
        { tool: "create_comp", args: { name: "Comp1" }, mutatesProject: true }
      ]
    },
    validation: {
      ok: true,
      stepCount: 1,
      mutatingCount: 1
    },
    // Server GET redacts token, so proposal defaults to tokenless
    proposal: proposal
  };
}

// Create a mock DOM and environment for panel.js inside a Node VM
function createPanelEnvironment(panelSource, options) {
  options = options || {};
  const elements = new Map();

  function getOrCreateElement(idOrTag) {
    if (!elements.has(idOrTag)) {
      const elListeners = {};
      const attrs = {};
      const classes = new Set();
      const children = [];
      const el = {
        id: idOrTag,
        tagName: (idOrTag || "div").toUpperCase(),
        value: "",
        textContent: "",
        className: "",
        style: {},
        checked: false,
        disabled: false,
        options: [],
        scrollHeight: 0,
        scrollTop: 0,
        parentNode: null,
        get firstChild() {
          return children[0] || null;
        },
        get childNodes() {
          return children;
        },
        addEventListener: function (evt, fn) {
          if (!elListeners[evt]) elListeners[evt] = [];
          elListeners[evt].push(fn);
        },
        removeEventListener: function (evt, fn) {
          if (!elListeners[evt]) return;
          elListeners[evt] = elListeners[evt].filter(f => f !== fn);
        },
        dispatchEvent: function (evt) {
          const type = evt && evt.type ? evt.type : evt;
          if (elListeners[type]) {
            for (const fn of elListeners[type]) {
              fn.call(el, evt);
            }
          }
        },
        click: function () {
          el.dispatchEvent({ type: "click", target: el });
        },
        setAttribute: function (k, v) {
          attrs[k] = String(v);
          if (k === "class") el.className = String(v);
        },
        getAttribute: function (k) {
          if (k === "class") return el.className;
          return attrs[k] !== undefined ? attrs[k] : null;
        },
        appendChild: function (child) {
          child.parentNode = el;
          children.push(child);
          if (el.tagName === "SELECT" && child.tagName === "OPTION") {
            el.options.push(child);
          }
          return child;
        },
        removeChild: function (child) {
          const idx = children.indexOf(child);
          if (idx >= 0) {
            children.splice(idx, 1);
            child.parentNode = null;
          }
          if (el.tagName === "SELECT") {
            el.options = el.options.filter(o => o !== child);
          }
          return child;
        },
        focus: function () {},
        scrollIntoView: function () {},
        classList: {
          add: function (cls) {
            classes.add(cls);
            el.className = Array.from(classes).join(" ");
          },
          remove: function (cls) {
            classes.delete(cls);
            el.className = Array.from(classes).join(" ");
          },
          contains: function (cls) {
            return classes.has(cls);
          }
        }
      };
      elements.set(idOrTag, el);
    }
    return elements.get(idOrTag);
  }

  const localStorageStore = new Map();
  const localStorage = {
    getItem: function (key) {
      return localStorageStore.has(key) ? localStorageStore.get(key) : null;
    },
    setItem: function (key, val) {
      localStorageStore.set(key, String(val));
    },
    removeItem: function (key) {
      localStorageStore.delete(key);
    },
    clear: function () {
      localStorageStore.clear();
    }
  };

  const document = {
    title: "",
    getElementById: function (id) {
      return getOrCreateElement(id);
    },
    createElement: function (tag) {
      return getOrCreateElement("created_" + tag + "_" + Math.random().toString(36).slice(2));
    },
    querySelectorAll: function () {
      return [];
    }
  };

  const inFlightRequests = [];
  const requestHistory = [];
  let reqIdGen = 0;

  function MockXMLHttpRequest() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = "";
    this.timeout = 0;
    this._headers = {};
    this._method = "";
    this._url = "";
    this.onreadystatechange = null;
    this.onerror = null;
    this.ontimeout = null;

    this.open = function (method, url) {
      this._method = method;
      this._url = url;
      this.readyState = 1;
    };

    this.setRequestHeader = function (k, v) {
      this._headers[k.toLowerCase()] = v;
    };

    this.send = function (data) {
      const reqRecord = {
        id: ++reqIdGen,
        method: this._method,
        url: this._url,
        path: this._url.replace(/^http:\/\/[^/]+/, ""),
        body: data ? JSON.parse(data) : null,
        headers: this._headers,
        xhr: this,
        completed: false,
        respond: function (status, body) {
          if (this.completed) return;
          if (this.path === "/agents/plan/current" && body && body.current) {
            assert(!body.current.proposal.confirmation.confirmationToken, "Public GET fixture must be tokenless");
          }
          this.completed = true;
          this.xhr.status = status;
          this.xhr.readyState = 4;
          this.xhr.responseText = typeof body === "string" ? body : JSON.stringify(body);
          const idx = inFlightRequests.indexOf(this);
          if (idx >= 0) inFlightRequests.splice(idx, 1);
          if (this.xhr.onreadystatechange) {
            this.xhr.onreadystatechange();
          }
        },
        error: function (message) {
          if (this.completed) return;
          this.completed = true;
          this.xhr.status = 0;
          this.xhr.readyState = 4;
          this.xhr.responseText = "";
          const idx = inFlightRequests.indexOf(this);
          if (idx >= 0) inFlightRequests.splice(idx, 1);
          if (this.xhr.onerror) {
            this.xhr.onerror(new Error(message || "Network error"));
          }
        },
        timeout: function () {
          if (this.completed) return;
          this.completed = true;
          this.xhr.status = 0;
          this.xhr.readyState = 4;
          this.xhr.responseText = "";
          const idx = inFlightRequests.indexOf(this);
          if (idx >= 0) inFlightRequests.splice(idx, 1);
          if (this.xhr.ontimeout) {
            this.xhr.ontimeout();
          }
        }
      };

      inFlightRequests.push(reqRecord);
      requestHistory.push(reqRecord);
    };
  }

  function CSInterface() {
    this.evalScript = function (script, cb) {
      if (cb) cb("");
    };
  }

  function Event(type, opts) {
    this.type = type;
    this.bubbles = !!(opts && opts.bubbles);
  }

  const window = {
    document: document,
    localStorage: localStorage,
    XMLHttpRequest: MockXMLHttpRequest,
    CSInterface: CSInterface,
    Event: Event,
    location: { href: "http://127.0.0.1:3456/index.html" },
    __adobe_cep__: null
  };

  // Freeze only the VM's Date.now; retain its constructible intrinsic Date.
  let frozenNow = options.frozenDate;
  const timers = new Map();
  let timerId = 0;

  const sandbox = {
    window: window,
    document: document,
    localStorage: localStorage,
    XMLHttpRequest: MockXMLHttpRequest,
    CSInterface: CSInterface,
    Event: Event,
    setTimeout: function (fn, delay) {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: function (id) { timers.delete(id); },
    __clockNow: function () { return frozenNow === undefined ? Date.now() : frozenNow; },
    Math: Math,
    JSON: JSON,
    Error: Error,
    console: console
  };

  const context = vm.createContext(sandbox);
  vm.runInContext("Date.now = __clockNow; delete __clockNow;", context);

  // Harness injects test-only accessors into the VM instance of the source
  // without modifying the production source file. Works for both new source and BEFORE snapshot.
  let executableSource = panelSource.replace(/\}\)\(\);\s*$/, `
    if (typeof window !== "undefined") {
      window.__aeAgentPlanOps = {
        refreshCurrentBridgePlan: function (options, onDone) {
          // BEFORE accepts only onDone; keep baseline failures in core assertions.
          if (refreshCurrentBridgePlan.length === 1) {
            return refreshCurrentBridgePlan(typeof options === "function" ? options : onDone);
          }
          return refreshCurrentBridgePlan(options, onDone);
        },
        runLastPlan: runLastPlan,
        getCurrentBridgePlan: function () { return currentBridgePlan; },
        setCurrentBridgePlan: function (p) { currentBridgePlan = p; },
        getLastPlanResult: function () { return lastPlanResult; },
        setLastPlanResult: function (r) { lastPlanResult = r; },
        getCurrentPlanSyncInFlight: function () { return currentPlanSyncInFlight; },
        getWaitingRefreshCount: function () { return typeof currentPlanSyncWaiters !== "undefined" ? currentPlanSyncWaiters.length : 0; },
        getPanelConnectionGeneration: function () { return panelConnectionGeneration; },
        connect: connect,
        disconnect: disconnect
      };
    }
  })();`);

  vm.runInContext(executableSource, context);

  const environment = {
    window: sandbox.window,
    planOps: sandbox.window.__aeAgentPlanOps,
    inFlightRequests: inFlightRequests,
    requestHistory: requestHistory,
    document: document,
    elements: elements,
    timers: timers,
    runTimer: function (predicate) {
      for (const [id, timer] of timers) {
        if (!predicate || predicate(timer)) {
          timers.delete(id);
          timer.fn();
          return true;
        }
      }
      return false;
    },
    setFrozenNow: function (t) {
      frozenNow = t;
    },
    popRequest: function (predicate) {
      for (let i = 0; i < inFlightRequests.length; i++) {
        if (!predicate || predicate(inFlightRequests[i])) {
          const req = inFlightRequests[i];
          return req;
        }
      }
      return null;
    }
  };
  testEnvironments.push(environment);
  return environment;
}

// -------------------------------------------------------------
// Test Scenarios
// -------------------------------------------------------------

function runTest(name, fn) {
  testEnvironments = [];
  try {
    fn();
    for (const env of testEnvironments) {
      const runs = env.requestHistory.filter(r => r.path === "/agents/plan/run");
      assert(runs.every(r => r.body.dryRun === true && r.body.confirm === false &&
        r.body.allowMutations === false && r.body.autoEditSession === false), "Smoke must never submit an automatic native run");
    }
    console.log(`[PASS] ${name}`);
    return true;
  } catch (err) {
    console.error(`[FAIL] ${name}:`);
    console.error(`       ${err.message.split("\n")[0]}`);
    return false;
  }
}

function beginOverlappedAdoption(panelSource) {
  const env = createPanelEnvironment(panelSource, { frozenDate: FIXED_TIME });
  const oldPlan = makeCurrentPlan("act-before", 1);
  env.planOps.setCurrentBridgePlan(oldPlan);
  env.planOps.setLastPlanResult({ plan: oldPlan.plan, planValidation: oldPlan.validation,
    requestId: oldPlan.proposal.requestId, m100ActionProposal: oldPlan.proposal });
  env.planOps.refreshCurrentBridgePlan();
  const oldReq = env.popRequest(r => r.path === "/agents/plan/current");
  env.planOps.runLastPlan(true, true);
  const adoptReq = env.popRequest(r => r.path === "/agents/plan/adopt");
  assert(adoptReq, "One explicit adoption must be requested");
  const adopted = makeCurrentPlan("act-adopted", 2, makeActionProposal("act-adopted", "confirm_" + "c".repeat(48)));
  adoptReq.respond(200, { ok: true, proposal: adopted.proposal, revision: adopted.revision,
    plan: adopted.plan, validation: adopted.validation });
  return { env, oldPlan, oldReq };
}

function runAllTests(panelPath) {
  console.log("=== CEP Plan Refresh Smoke Test ===");
  console.log(`Panel source: ${path.relative(process.cwd(), panelPath)}`);

  const panelSource = fs.readFileSync(panelPath, "utf8");

  // Verify that production source does NOT export __aeAgentPlanOps
  if (panelSource.includes("window.__aeAgentPlanOps")) {
    console.error("[FAIL] Production panel.js must not export test hook window.__aeAgentPlanOps");
    process.exit(1);
  }

  let passed = 0;
  let total = 0;

  // Scenario 1: Normal single refresh unchanged
  total++;
  if (runTest("normal single refresh unchanged", () => {
    const env = createPanelEnvironment(panelSource);
    let callbackCalls = 0;
    let callbackError = null;

    env.planOps.refreshCurrentBridgePlan(err => {
      callbackCalls++;
      callbackError = err;
    });

    const getReq = env.popRequest(r => r.path === "/agents/plan/current");
    assert(getReq, "Expected GET /agents/plan/current to be in flight");

    const plan = makeCurrentPlan("act-normal", 1);
    getReq.respond(200, { ok: true, current: plan });
    getReq.xhr.onreadystatechange();
    getReq.xhr.onerror();

    assert.strictEqual(callbackCalls, 1, "Callback should be called exactly once, including duplicate XHR events");
    assert.strictEqual(callbackError, null, "Callback error should be null");
    const current = env.planOps.getCurrentBridgePlan();
    assert(current, "Current bridge plan should be set");
    assert.strictEqual(current.actionId, "act-normal");
    assert.strictEqual(env.planOps.getCurrentPlanSyncInFlight(), false, "Sync should no longer be in flight");
  })) passed++;

  // Scenario 2: Deterministic frozen Date pre-adopt poll vs adoption refresh continuation (P1 test)
  // Ensures monotonic sequence barrier works even when Date.now() is completely frozen on the same millisecond.
  total++;
  if (runTest("deterministic frozen Date pre-adopt poll vs adoption refresh continuation", () => {
    const FROZEN_TIME = FIXED_TIME;
    const env = createPanelEnvironment(panelSource, { frozenDate: FROZEN_TIME });

    // Initial state: Proposal act480 unadopted
    const proposalA = makeActionProposal("act480", null);
    const planA = makeCurrentPlan("act480", 1, proposalA);
    env.planOps.setCurrentBridgePlan(planA);
    env.planOps.setLastPlanResult({
      plan: planA.plan,
      planValidation: planA.validation,
      requestId: proposalA.requestId,
      m100ActionProposal: proposalA
    });

    // 1. Pre-adopt poll starts GET /agents/plan/current (req 1) and remains in flight at frozen time
    env.planOps.refreshCurrentBridgePlan();
    const preAdoptGetReq = env.popRequest(r => r.path === "/agents/plan/current");
    assert(preAdoptGetReq, "Pre-adopt GET /agents/plan/current must be dispatched");

    // 2. User triggers Dry Run / adopt at the EXACT SAME frozen millisecond
    env.planOps.runLastPlan(true, true);

    const adoptReq = env.popRequest(r => r.path === "/agents/plan/adopt");
    assert(adoptReq, "POST /agents/plan/adopt should be dispatched");
    assert.strictEqual(adoptReq.body.actionId, "act480");

    // Server returns adopted proposal actac with private confirmationToken
    const token = "confirm_" + "c".repeat(48);
    const adoptedProposal = makeActionProposal("actac", token);
    const adoptedPlan = makeCurrentPlan("actac", 2, adoptedProposal);

    adoptReq.respond(200, {
      ok: true,
      proposal: adoptedProposal,
      plan: adoptedPlan.plan,
      validation: adoptedPlan.validation
    });

    // 3. Pre-adopt poll completes with stale data (act480) at the SAME frozen millisecond
    preAdoptGetReq.respond(200, { ok: true, current: planA });

    // In BEFORE snapshot: pre-adopt poll returned error "Обновление плана ещё выполняется"
    // and dropped continuation.
    // In NEW source: monotonic request barrier ensures fresh followup GET is dispatched.
    const followupGetReq = env.popRequest(r => r.path === "/agents/plan/current" && r.id !== preAdoptGetReq.id);
    assert(followupGetReq, "Expected fresh followup GET /agents/plan/current after adoption, but none was sent (continuation was dropped!)");

    // 4. Realistic server GET returns tokenless plan (confirmationToken redacted)
    const tokenlessServerPlan = makeCurrentPlan("actac", 2, makeActionProposal("actac", null));
    followupGetReq.respond(200, { ok: true, current: tokenlessServerPlan });

    // 5. Continuation executes runLastPlan(true, true), which issues POST /agents/plan/run with dryRun: true
    const runReq = env.popRequest(r => r.path === "/agents/plan/run");
    assert(runReq, "Expected POST /agents/plan/run dry-run continuation to be executed");
    assert.strictEqual(runReq.body.actionId, "actac", "Run must be for fresh adopted plan");
    assert.strictEqual(runReq.body.dryRun, true, "Must be dryRun: true");
    assert.strictEqual(runReq.body.confirm, false, "Must be confirm: false");
    assert.strictEqual(runReq.body.allowMutations, false, "Must be allowMutations: false");
    assert.strictEqual(runReq.body.autoEditSession, false, "Must be autoEditSession: false");
    assert.strictEqual(runReq.body.confirmationToken, undefined, "Dry-run must carry no mutation authority");
    assert.strictEqual(env.planOps.getLastPlanResult().m100ActionProposal.confirmation.confirmationToken, token,
      "Matched tokenless GET must retain exactly the private adoption token locally");

    // Count calls
    const adoptCalls = env.requestHistory.filter(r => r.path === "/agents/plan/adopt");
    const runCalls = env.requestHistory.filter(r => r.path === "/agents/plan/run");
    assert.strictEqual(adoptCalls.length, 1, "Exactly one adopt call must occur");
    assert.strictEqual(runCalls.length, 1, "Exactly one dry-run call must occur");
    assert.strictEqual(runCalls[0].body.confirm, false, "Zero mutating runs allowed");
  })) passed++;

  // Scenario 3: Stale null reply followed by realistic tokenless fresh GET preserves local token (P2 test)
  total++;
  if (runTest("older null response followed by tokenless fresh GET preserves local token and completes dry-run", () => {
    const env = createPanelEnvironment(panelSource);

    // Initial state: Proposal act480
    const proposalA = makeActionProposal("act480", null);
    const planA = makeCurrentPlan("act480", 1, proposalA);
    env.planOps.setCurrentBridgePlan(planA);
    env.planOps.setLastPlanResult({
      plan: planA.plan,
      planValidation: planA.validation,
      requestId: proposalA.requestId,
      m100ActionProposal: proposalA
    });

    // 1. Pre-adopt poll starts
    env.planOps.refreshCurrentBridgePlan();
    const staleReq = env.popRequest(r => r.path === "/agents/plan/current");
    assert(staleReq, "Stale in-flight req must exist");

    // 2. Adopt happens
    env.planOps.runLastPlan(true, true);
    const adoptReq = env.popRequest(r => r.path === "/agents/plan/adopt");
    assert(adoptReq, "Adopt req must exist");

    const token = "confirm_" + "f".repeat(48);
    const adoptedProposal = makeActionProposal("act_null_test", token);
    const adoptedPlan = makeCurrentPlan("act_null_test", 2, adoptedProposal);

    adoptReq.respond(200, {
      ok: true,
      proposal: adoptedProposal,
      plan: adoptedPlan.plan,
      validation: adoptedPlan.validation
    });

    // 3. Stale request completes with { current: null }
    // Must be completely discarded and must NOT clear local adopt token!
    staleReq.respond(200, { ok: true, current: null });

    const freshReq = env.popRequest(r => r.path === "/agents/plan/current" && r.id !== staleReq.id);
    assert(freshReq, "Fresh followup GET must be dispatched");

    // 4. Fresh GET returns tokenless plan
    const tokenlessPlan = makeCurrentPlan("act_null_test", 2, makeActionProposal("act_null_test", null));
    freshReq.respond(200, { ok: true, current: tokenlessPlan });

    // 5. Continuation runs and executes dry-run with preserved local token
    const runReq = env.popRequest(r => r.path === "/agents/plan/run");
    assert(runReq, "Dry run must execute even after stale null response");
    assert.strictEqual(runReq.body.actionId, "act_null_test");
    assert.strictEqual(runReq.body.dryRun, true);
  })) passed++;

  // Lifecycle tests call the real production functions with a fixed generation clock.
  total++;
  if (runTest("real disconnect releases waiter once and discards late old GET", () => {
    const env = createPanelEnvironment(panelSource, { frozenDate: FIXED_TIME });
    env.planOps.connect();
    const current = makeCurrentPlan("act-disconnected", 1);
    env.planOps.setCurrentBridgePlan(current);
    const errors = [];
    env.planOps.refreshCurrentBridgePlan(err => errors.push(err));
    const oldReq = env.popRequest(r => r.path === "/agents/plan/current");
    assert(oldReq, "Old current GET must exist");
    env.planOps.disconnect();
    assert.strictEqual(errors.length, 1, "Disconnect must release its pending waiter once");
    assert(errors[0], "Disconnected waiter must receive an error");
    oldReq.respond(200, { ok: true, current: makeCurrentPlan("act-late", 9) });
    assert.strictEqual(env.planOps.getCurrentBridgePlan(), current, "Late GET must not alter disconnected state");
    assert.strictEqual(errors.length, 1, "Late GET must not repeat its cancelled callback");
    assert.strictEqual(env.planOps.getCurrentPlanSyncInFlight(), false);
    assert.strictEqual(env.planOps.getWaitingRefreshCount(), 0);
  })) passed++;

  total++;
  if (runTest("real repeat Connect at fixed Date cannot overwrite new state, inflight or queue", () => {
    const env = createPanelEnvironment(panelSource, { frozenDate: FIXED_TIME });
    env.planOps.connect();
    let cancelled = 0;
    env.planOps.refreshCurrentBridgePlan(err => { assert(err); cancelled++; });
    const oldReq = env.popRequest(r => r.path === "/agents/plan/current");
    const generation = env.planOps.getPanelConnectionGeneration();
    env.planOps.connect();
    assert.strictEqual(env.planOps.getPanelConnectionGeneration(), generation, "Test must exercise a real timestamp collision");
    assert.strictEqual(cancelled, 1, "Repeat Connect must release old waiter once");
    const current = makeCurrentPlan("act-new-connection", 1);
    env.planOps.setCurrentBridgePlan(current);
    let coalesced = 0;
    let fresh = 0;
    env.planOps.refreshCurrentBridgePlan(err => { assert.ifError(err); coalesced++; });
    const newReq = env.popRequest(r => r.path === "/agents/plan/current" && r !== oldReq);
    env.planOps.refreshCurrentBridgePlan({ fresh: true }, err => { assert.ifError(err); fresh++; });
    assert(newReq, "New connection current GET must exist");
    oldReq.respond(200, { ok: true, current: null });
    assert.strictEqual(env.planOps.getCurrentBridgePlan(), current, "Old null GET must not clear new state");
    assert.strictEqual(env.planOps.getCurrentPlanSyncInFlight(), true, "Old GET must not release new request");
    assert.strictEqual(env.planOps.getWaitingRefreshCount(), 2, "Old GET must not drain new queue");
    assert.strictEqual(coalesced + fresh, 0, "Old GET must not settle new waiters");
    newReq.respond(200, { ok: true, current });
    assert.strictEqual(coalesced, 1);
    assert.strictEqual(fresh, 0);
    const followup = env.popRequest(r => r.path === "/agents/plan/current" && r !== oldReq && r !== newReq);
    assert(followup, "Fresh waiter must keep its own followup request");
    followup.respond(200, { ok: true, current });
    assert.strictEqual(fresh, 1);
    assert.strictEqual(cancelled, 1);
    assert.strictEqual(env.planOps.getWaitingRefreshCount(), 0);
    assert.strictEqual(env.requestHistory.filter(r => r.path === "/agents/plan/adopt" || r.path === "/agents/plan/run").length, 0);
  })) passed++;

  // Scenario 5: Multiple waiting callbacks with coalescing resolved exactly once
  total++;
  if (runTest("multiple waiting callbacks resolved exactly once", () => {
    const env = createPanelEnvironment(panelSource);

    // Req 1 starts
    env.planOps.refreshCurrentBridgePlan();
    const req1 = env.popRequest(r => r.path === "/agents/plan/current");
    assert(req1, "Req 1 must be dispatched");

    let cbACalls = 0;
    let cbBCalls = 0;
    let cbCCalls = 0;
    let cbDCalls = 0;

    // Caller A: coalesced with Req 1
    env.planOps.refreshCurrentBridgePlan(() => cbACalls++);
    // Caller B: requires fresh (after Req 1)
    env.planOps.refreshCurrentBridgePlan({ fresh: true }, () => cbBCalls++);
    // Caller C: coalesced with Req 1
    env.planOps.refreshCurrentBridgePlan(() => cbCCalls++);
    // Caller D: requires fresh (after Req 1)
    env.planOps.refreshCurrentBridgePlan({ fresh: true }, () => cbDCalls++);

    // Req 1 finishes
    const plan1 = makeCurrentPlan("act-1", 1);
    req1.respond(200, { ok: true, current: plan1 });

    assert.strictEqual(cbACalls, 1, "Callback A should be called once on Req 1 finish");
    assert.strictEqual(cbCCalls, 1, "Callback C should be called once on Req 1 finish");
    assert.strictEqual(cbBCalls, 0, "Callback B must wait for fresh followup");
    assert.strictEqual(cbDCalls, 0, "Callback D must wait for fresh followup");

    // Followup Req 2 should have been dispatched
    const req2 = env.popRequest(r => r.path === "/agents/plan/current" && r.id !== req1.id);
    assert(req2, "Followup Req 2 must be dispatched for fresh callers");

    const plan2 = makeCurrentPlan("act-2", 2);
    req2.respond(200, { ok: true, current: plan2 });

    assert.strictEqual(cbBCalls, 1, "Callback B should be called once on Req 2 finish");
    assert.strictEqual(cbDCalls, 1, "Callback D should be called once on Req 2 finish");

    // No extra GETs should be in flight
    assert.strictEqual(env.inFlightRequests.length, 0, "No pending requests should remain");
  })) passed++;

  // Scenario 6: Final fetch error releases all/error callbacks once without hang
  total++;
  if (runTest("final fetch error releases all callbacks once without hang", () => {
    const env = createPanelEnvironment(panelSource);

    // Req 1 starts
    env.planOps.refreshCurrentBridgePlan();
    const req1 = env.popRequest(r => r.path === "/agents/plan/current");

    let cbCalls = 0;
    let cbError = null;

    // Fresh caller queued
    env.planOps.refreshCurrentBridgePlan({ fresh: true }, err => {
      cbCalls++;
      cbError = err;
    });

    // Req 1 finishes
    req1.respond(200, { ok: true, current: makeCurrentPlan("act-1", 1) });

    // Followup GET is dispatched
    const req2 = env.popRequest(r => r.path === "/agents/plan/current" && r.id !== req1.id);
    assert(req2, "Followup GET must be dispatched");

    // Followup GET fails
    req2.error("Bridge connection failed");

    assert.strictEqual(cbCalls, 1, "Callback must be invoked exactly once on final error");
    assert(cbError, "Callback must receive error");
    assert.strictEqual(env.planOps.getWaitingRefreshCount(), 0, "Waiters queue must be cleared on final error");
  })) passed++;

  // Scenario 7: Canonical plan change fails closed and prevents auto-mutation or adopt loop
  total++;
  if (runTest("canonical plan change fails closed and prevents auto-mutation or adopt loop", () => {
    const env = createPanelEnvironment(panelSource);

    // Initial state: Proposal act480
    const proposalA = makeActionProposal("act480", null);
    const planA = makeCurrentPlan("act480", 1, proposalA);
    env.planOps.setCurrentBridgePlan(planA);
    env.planOps.setLastPlanResult({
      plan: planA.plan,
      planValidation: planA.validation,
      requestId: proposalA.requestId,
      m100ActionProposal: proposalA
    });

    // Pre-adopt poll
    env.planOps.refreshCurrentBridgePlan();
    const preAdoptReq = env.popRequest(r => r.path === "/agents/plan/current");

    // Adopt act480
    env.planOps.runLastPlan(true, true);
    const adoptReq = env.popRequest(r => r.path === "/agents/plan/adopt");

    const token = "confirm_" + "9".repeat(48);
    const adoptedProposal = makeActionProposal("act_adopted", token);
    const adoptedPlan = makeCurrentPlan("act_adopted", 2, adoptedProposal);

    adoptReq.respond(200, {
      ok: true,
      proposal: adoptedProposal,
      plan: adoptedPlan.plan,
      validation: adoptedPlan.validation
    });

    // Pre-adopt poll completes
    preAdoptReq.respond(200, { ok: true, current: planA });

    const followupReq = env.popRequest(r => r.path === "/agents/plan/current" && r.id !== preAdoptReq.id);
    assert(followupReq, "Followup GET must be dispatched");

    // Server returns completely DIFFERENT action (e.g. replaced by external actor)
    const unexpectedPlan = makeCurrentPlan("act_different", 3);
    followupReq.respond(200, { ok: true, current: unexpectedPlan });

    // Dry run must NOT be executed!
    const runReq = env.popRequest(r => r.path === "/agents/plan/run");
    assert.strictEqual(runReq, null, "Dry run must NOT execute when canonical plan changed away from adopted plan");

    // No auto-adopt loop
    const secondAdoptReq = env.popRequest(r => r.path === "/agents/plan/adopt");
    assert.strictEqual(secondAdoptReq, null, "Must NOT automatically loop adoption");

    // Status must indicate blocked/changed
    const statusEl = env.elements.get("planRunStatus");
    assert(statusEl && statusEl.textContent.includes("План на сервере изменился"), "Status must indicate plan changed on server");
  })) passed++;

  total++;
  if (runTest("offline callback reentry cannot fail or drain a newly started refresh", () => {
    const env = createPanelEnvironment(panelSource);
    let oldCalls = 0;
    const newErrors = [];
    env.planOps.refreshCurrentBridgePlan(err => {
      assert(err);
      oldCalls++;
      env.planOps.refreshCurrentBridgePlan({ fresh: true }, nextErr => newErrors.push(nextErr));
    });
    const oldReq = env.popRequest(r => r.path === "/agents/plan/current");
    oldReq.error();
    const nextReq = env.popRequest(r => r.path === "/agents/plan/current" && r !== oldReq);
    assert(nextReq, "Reentrant caller must start its own request");
    assert.strictEqual(oldCalls, 1);
    assert.strictEqual(newErrors.length, 0, "Old offline error must not fail the new waiter");
    assert.strictEqual(env.planOps.getWaitingRefreshCount(), 1);
    assert.strictEqual(env.planOps.getCurrentPlanSyncInFlight(), true);
    nextReq.respond(200, { ok: true, current: makeCurrentPlan("act-reentry", 1) });
    assert.strictEqual(newErrors.length, 1);
    assert.strictEqual(newErrors[0], null);
  })) passed++;

  total++;
  if (runTest("lifecycle reset during callback settlement cancels remaining old callbacks once", () => {
    const env = createPanelEnvironment(panelSource, { frozenDate: FIXED_TIME });
    env.planOps.connect();
    let firstCalls = 0;
    const laterErrors = [];
    env.planOps.refreshCurrentBridgePlan(err => {
      assert.ifError(err);
      firstCalls++;
      env.planOps.connect();
    });
    const req = env.popRequest(r => r.path === "/agents/plan/current");
    env.planOps.refreshCurrentBridgePlan(err => laterErrors.push(err));
    req.respond(200, { ok: true, current: makeCurrentPlan("act-ready", 1) });
    assert.strictEqual(firstCalls, 1);
    assert.strictEqual(laterErrors.length, 1);
    assert(laterErrors[0], "Remaining old callback must receive a lifecycle error");
  })) passed++;

  total++;
  if (runTest("repeat Connect releases post-adopt continuation and pending waiter without run or hang", () => {
    const { env, oldReq } = beginOverlappedAdoption(panelSource);
    const errors = [];
    env.planOps.refreshCurrentBridgePlan({ fresh: true }, err => errors.push(err));
    env.planOps.connect();
    assert.strictEqual(errors.length, 1, "Pending waiter must receive one cancellation");
    assert(errors[0], "Cancellation must report an error");
    assert.strictEqual(env.planOps.getWaitingRefreshCount(), 0);
    oldReq.respond(200, { ok: true, current: null });
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(env.planOps.getCurrentPlanSyncInFlight(), false);
    assert.strictEqual(env.requestHistory.filter(r => r.path === "/agents/plan/adopt").length, 1);
    assert.strictEqual(env.requestHistory.filter(r => r.path === "/agents/plan/run").length, 0);
    assert(env.elements.get("planRunStatus").textContent, "Cancelled continuation must report its blocked status");
  })) passed++;

  total++;
  if (runTest("Connect cancellation callback can start a new refresh without being overwritten", () => {
    const env = createPanelEnvironment(panelSource, { frozenDate: FIXED_TIME });
    env.planOps.connect();
    let cancelCalls = 0;
    const newErrors = [];
    env.planOps.refreshCurrentBridgePlan(err => {
      assert(err);
      cancelCalls++;
      env.planOps.refreshCurrentBridgePlan({ fresh: true }, newErr => newErrors.push(newErr));
    });
    const oldReq = env.popRequest(r => r.path === "/agents/plan/current");
    env.planOps.connect();
    const nextReq = env.popRequest(r => r.path === "/agents/plan/current" && r !== oldReq);
    assert.strictEqual(cancelCalls, 1);
    assert(nextReq, "Cancellation reentry must retain its new request");
    oldReq.error();
    assert.strictEqual(env.planOps.getCurrentPlanSyncInFlight(), true);
    assert.strictEqual(env.planOps.getWaitingRefreshCount(), 1);
    assert.strictEqual(newErrors.length, 0);
    nextReq.respond(200, { ok: true, current: makeCurrentPlan("act-after-cancel", 1) });
    assert.strictEqual(newErrors.length, 1);
    assert.strictEqual(newErrors[0], null);
  })) passed++;

  total++;
  if (runTest("late private adoption response after repeat Connect cannot change new state or continue", () => {
    const env = createPanelEnvironment(panelSource, { frozenDate: FIXED_TIME });
    env.planOps.connect();
    const oldPlan = makeCurrentPlan("act-before-connect", 1);
    env.planOps.setCurrentBridgePlan(oldPlan);
    env.planOps.setLastPlanResult({ plan: oldPlan.plan, planValidation: oldPlan.validation,
      requestId: oldPlan.proposal.requestId, m100ActionProposal: oldPlan.proposal });
    env.planOps.runLastPlan(true, true);
    const adoptReq = env.popRequest(r => r.path === "/agents/plan/adopt");
    assert(adoptReq, "Old adoption request must exist");
    env.planOps.connect();
    const nextPlan = makeCurrentPlan("act-after-connect", 1);
    const nextResult = { plan: nextPlan.plan, planValidation: nextPlan.validation,
      requestId: nextPlan.proposal.requestId, m100ActionProposal: nextPlan.proposal };
    env.planOps.setCurrentBridgePlan(nextPlan);
    env.planOps.setLastPlanResult(nextResult);
    const adopted = makeCurrentPlan("act-late-private", 2, makeActionProposal("act-late-private", "confirm_" + "a".repeat(48)));
    adoptReq.respond(200, { ok: true, proposal: adopted.proposal, revision: adopted.revision,
      plan: adopted.plan, validation: adopted.validation });
    assert.strictEqual(env.planOps.getCurrentBridgePlan(), nextPlan, "Late adoption must not change current state");
    assert.strictEqual(env.planOps.getLastPlanResult(), nextResult, "Late adoption must not replace new credentials");
    assert.strictEqual(env.requestHistory.filter(r => r.path === "/agents/plan/current" || r.path === "/agents/plan/run").length, 0,
      "Late adoption must not dispatch a continuation");
  })) passed++;

  const canonicalChanges = [
    ["instance", plan => { plan.instanceId = "inst-restarted"; }],
    ["higher revision", plan => { plan.revision = plan.proposal.revision = 3; }],
    ["lower revision", plan => { plan.revision = plan.proposal.revision = 1; }],
    ["proposal revision", plan => { plan.proposal.revision = 3; }],
    ["proposal action", plan => { plan.proposal.actionId = "act-unexpected"; }],
    ["request", plan => { plan.proposal.requestId = "req-replaced"; }],
    ["payload reference", plan => { plan.proposal.action.payloadRef = "payload-replaced"; }],
    ["action kind", plan => { plan.proposal.action.kind = "ae_jsx"; }],
    ["payload hash", plan => { plan.proposal.action.payloadHash = "sha256:" + "c".repeat(64); }],
    ["preview hash", plan => { plan.proposal.action.previewHash = "sha256:" + "d".repeat(64); }],
    ["project", plan => { plan.project.expectedFile = plan.plan.targetProject.file = "other.aep"; }],
    ["actual project", plan => { plan.project.actualFile = "other.aep"; }],
    ["plan project", plan => { plan.plan.targetProject.file = "other.aep"; }],
    ["expiry", plan => { plan.expiresAt = plan.proposal.confirmation.proposalExpiresAt = new Date(FIXED_TIME + 900000).toISOString(); }],
    ["expired", plan => { plan.expiresAt = plan.proposal.confirmation.proposalExpiresAt = new Date(FIXED_TIME - 1).toISOString(); }],
    ["snapshot expiry", plan => { plan.expiresAt = new Date(FIXED_TIME + 900000).toISOString(); }],
    ["current state", plan => { plan.state = "completed"; }],
    ["retired project", plan => { plan.lifecycleRetired = { transitionId: "transition-retired" }; }],
    ["current project gate", plan => { plan.lastRun = { errorCode: "project_target_mismatch" }; }],
    ["validation", plan => { plan.validation.ok = false; }]
  ];
  for (const [field, change] of canonicalChanges) {
    total++;
    if (runTest(`adopted ${field} change fails closed before dry-run`, () => {
      const { env, oldPlan, oldReq } = beginOverlappedAdoption(panelSource);
      oldReq.respond(200, { ok: true, current: oldPlan });
      const freshReq = env.popRequest(r => r.path === "/agents/plan/current" && r !== oldReq);
      assert(freshReq, "Adoption must require a fresh canonical GET");
      const canonical = makeCurrentPlan("act-adopted", 2);
      change(canonical);
      freshReq.respond(200, { ok: true, current: canonical });
      assert.strictEqual(env.requestHistory.filter(r => r.path === "/agents/plan/run").length, 0, "Changed canonical plan must not run");
      assert.strictEqual(env.requestHistory.filter(r => r.path === "/agents/plan/adopt").length, 1, "Changed canonical plan must not loop adoption");
      assert.strictEqual(env.planOps.getWaitingRefreshCount(), 0);
      assert(env.elements.get("planRunStatus").textContent.includes("План на сервере изменился"), "Canonical mismatch must be visible");
    })) passed++;
  }

  console.log(`\nResult: ${passed}/${total} passed`);
  if (passed === total) {
    console.log("All scenarios passed!");
    process.exit(0);
  } else {
    console.error(`Failed ${total - passed} scenario(s).`);
    process.exit(1);
  }
}

const { panelPath } = parseArgs();
runAllTests(panelPath);
