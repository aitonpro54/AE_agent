'use strict';
// Private embedding seam. Never exported by stdio/MCP. OS-user hostile code is outside M1.
// A real trusted session/grant issuer is intentionally absent from this offline distribution.
const { fail } = require('../protocol/json');
const ports = new WeakSet();
const lifecycles = new WeakSet();
function brandLifecycleBinding(binding) {
  if (!binding || binding.kind !== 'project-incarnation' || binding.lifecycleVerified !== true || !binding.sessionId || !binding.projectId) fail('lifecycle_binding');
  const value = Object.freeze({ ...binding }); lifecycles.add(value); return value;
}
function validateLifecycleBinding(binding) { return !!binding && lifecycles.has(binding); }
function brandAuthorityPort(port) {
  if (!port || typeof port.authorize !== 'function') fail('authority_port');
  ports.add(port); return port;
}
function validatePort(port) { if (!ports.has(port)) fail('untrusted_authority_port'); return port; }
module.exports = { brandAuthorityPort, validatePort, brandLifecycleBinding, validateLifecycleBinding };
