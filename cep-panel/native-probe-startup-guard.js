"use strict";

(function (root, factory) {
  if (typeof window === "undefined" && typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  var guardDefinition = factory();
  function showState(state) {
    var allowed = state.status === "allowed";
    var connect = root.document.getElementById("connectButton");
    if (connect) connect.disabled = !allowed;
    if (allowed) return;
    var message = state.status === "pending" ? "Проверяю процесс After Effects перед подключением…"
      : state.code === "native_probe_host" ? "Native test process: подключение AE Agent отключено."
      : "Процесс After Effects не подтверждён: подключение AE Agent отключено.";
    var status = root.document.getElementById("status"), help = root.document.getElementById("bridgeHelp");
    if (status) status.textContent = message;
    if (help) help.textContent = message;
    var badge = root.document.getElementById("badge");
    if (badge) badge.textContent = "offline";
  }
  var guard = guardDefinition.create({
    readHost:function (done) { new root.CSInterface().evalScript(guardDefinition.HOST_ENV_SCRIPT, done); },
    setTimer:function (fn, ms) { return setTimeout(fn, ms); },
    clearTimer:function (id) { clearTimeout(id); },
    onState:showState
  });
  Object.defineProperty(root, "AEAgentHostStartupGuard", {value:guard,writable:false,configurable:false,enumerable:true});
  // panel-actions restores/persists shared receipts at load time. Load both
  // modules only after the current AE host confirms it is outside a probe.
  guard.whenReady(function (state) {
    if (state.status !== "allowed") return;
    function loadAsset(file, next) {
      var script = root.document.createElement("script");
      script.src = "./" + file + "?v=" + encodeURIComponent(root.__aeAgentAssetVersion || "");
      script.onload = next || function () {};
      script.onerror = function () {
        var status = root.document.getElementById("status");
        if (status) status.textContent = "Не удалось загрузить AE Agent: " + file;
      };
      (root.document.head || root.document.body).appendChild(script);
    }
    loadAsset("panel-actions.js", function () { loadAsset("panel.js"); });
  });
})(typeof window !== "undefined" ? window : this, function () {
  var CONTRACT = "ae-agent-host-startup.v1";
  // Fixed read in the actual host, never renderer process.env. No environment
  // values, paths or nonce are returned to CEP, logs, storage or the bridge.
  var HOST_ENV_SCRIPT = '(function(){try{var r=$.getenv("AE_AGENT_NATIVE_PROBE_ROOT");var n=$.getenv("AE_AGENT_NATIVE_PROBE_NONCE");'
    + 'if((r==="" || r===null || typeof r==="undefined") && (n==="" || n===null || typeof n==="undefined"))'
    + 'return "' + CONTRACT + ':normal";return "' + CONTRACT + ':native-probe";'
    + '}catch(_){return "' + CONTRACT + ':read-error";}}())';
  function create(options) {
    var state = {contract:CONTRACT,status:"pending",code:"host_environment_pending"};
    var waiters = [], timer = null;
    function snapshot() { return {contract:state.contract,status:state.status,code:state.code}; }
    function notify() { if (typeof options.onState === "function") options.onState(snapshot()); }
    function settle(status, code) {
      if (state.status !== "pending") return;
      state = {contract:CONTRACT,status:status,code:code};
      if (timer !== null) options.clearTimer(timer);
      notify();
      var callbacks = waiters; waiters = [];
      for (var i = 0; i < callbacks.length; i += 1) callbacks[i](snapshot());
    }
    var api = Object.freeze({
      isAllowed:function () { return state.status === "allowed"; },
      snapshot:snapshot,
      whenReady:function (done) { if (state.status === "pending") waiters.push(done); else done(snapshot()); }
    });
    notify();
    timer = options.setTimer(function () { settle("blocked", "host_environment_timeout"); }, 5000);
    try {
      options.readHost(function (response) {
        if (response === CONTRACT + ":normal") settle("allowed", "normal_host");
        else if (response === CONTRACT + ":native-probe") settle("blocked", "native_probe_host");
        else settle("blocked", "host_environment_unverified");
      });
    } catch (_) { settle("blocked", "host_environment_read_failed"); }
    return api;
  }
  return {create:create,HOST_ENV_SCRIPT:HOST_ENV_SCRIPT,CONTRACT:CONTRACT};
});
