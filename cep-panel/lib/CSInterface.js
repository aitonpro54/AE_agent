/* Minimal CSInterface shim for evalScript. */
(function () {
  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    if (!window.__adobe_cep__ || typeof window.__adobe_cep__.evalScript !== "function") {
      callback("ERROR: __adobe_cep__.evalScript is not available");
      return;
    }
    window.__adobe_cep__.evalScript(script, callback);
  };

  window.CSInterface = CSInterface;
})();
