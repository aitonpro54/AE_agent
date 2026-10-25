"use strict";

// Deployment selection is configuration, never proof of authority. In
// particular, an experimental package directory cannot select a transport.
const KEY = "AE_AGENT_DEPLOYMENT_MODE";
const PRODUCT = "product", INITIAL_OWNED = "initial-owned";
function fail(code) { throw Object.assign(new Error(code), {code}); }
function deploymentMode(env = process.env, argv = process.argv) {
  const selectors = Object.keys(env).filter(key => /^AE_AGENT_DEPLOYMENT_MODE$/i.test(key));
  if (selectors.length > 1 || selectors.some(key => key !== KEY)) fail("owned_deployment_mode_invalid");
  const value = env[KEY];
  if (value !== undefined && value !== PRODUCT && value !== INITIAL_OWNED)
    fail("owned_deployment_mode_invalid");
  const census = argv.length === 3 && argv[2] === "--trusted-read-source-census";
  if (census && value === PRODUCT) fail("owned_deployment_mode_conflict");
  const mode = value || (census ? INITIAL_OWNED : PRODUCT);
  if (mode === PRODUCT && Object.keys(env).some(key => /^AE_AGENT_(?:TRUSTED_READ_|LOCAL_SESSION_)/i.test(key)))
    fail("owned_deployment_explicit_initial_owned_required");
  return mode;
}
module.exports = {KEY, PRODUCT, INITIAL_OWNED, deploymentMode};
