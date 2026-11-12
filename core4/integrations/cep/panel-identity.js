'use strict';
const crypto = require('node:crypto');
const MARKER = /var loadedPanelIdentity = (\{[^\n]+\}); \/\/ CORE4_LOADED_IDENTITY/;
const EMPTY = { protocolVersion: 1, productVersion: '4.2.7', panelBuildId: '0'.repeat(64), extensionId: 'com.codex.aeagentcore4.panel', registryBuildId: '0'.repeat(64) };
const INPUTS = ['cep/js/panel.js', 'cep/js/poll-dispatcher.js', 'cep/jsx/registry.jsx', 'cep/index.html', 'cep/panel.css', 'cep/CSXS/manifest.xml'];
function identity(read) {
  // The hashed manifest selects only the two releases that require this identity.
  // Preserve the original 4.2.6 normalization when verifying issued packages.
  const manifest = /^<\?xml version="1.0" encoding="UTF-8"\?>\r?\n<ExtensionManifest Version="7.0" ExtensionBundleId="com.codex.aeagentcore4" ExtensionBundleVersion="(4\.2\.[67])" ExtensionBundleName="AE Agent Core \1">\r?\n/.exec(read('cep/CSXS/manifest.xml').toString('utf8'));
  if (!manifest) throw new Error('panel_identity_version');
  const empty = { ...EMPTY, productVersion: manifest[1] };
  const digest = crypto.createHash('sha256');
  for (const file of INPUTS) {
    let source = read(file).toString('utf8');
    if (file === INPUTS[0]) {
      if (!MARKER.test(source)) throw new Error('panel_identity_slot');
      source = source.replace(MARKER, 'var loadedPanelIdentity = ' + JSON.stringify(empty) + '; // CORE4_LOADED_IDENTITY');
    }
    digest.update(file + '\0' + Buffer.byteLength(source) + '\0' + source);
  }
  const registry = read('cep/jsx/registry.jsx').toString('utf8'), match = /var registryBuildId="([a-f0-9]{64})";\/\*CORE4_REGISTRY_ID\*\//.exec(registry);
  if (!match || crypto.createHash('sha256').update(registry.replace(match[1] + '";/*CORE4_REGISTRY_ID*/', '0'.repeat(64) + '";/*CORE4_REGISTRY_ID*/')).digest('hex') !== match[1]) throw new Error('registry_identity_integrity');
  return { ...empty, panelBuildId: digest.digest('hex'), registryBuildId: match[1] };
}
function stamp(source, value) { if (!MARKER.test(source)) throw new Error('panel_identity_slot'); return source.replace(MARKER, 'var loadedPanelIdentity = ' + JSON.stringify(value) + '; // CORE4_LOADED_IDENTITY'); }
function verify(read) {
  const expected = identity(read), match = read(INPUTS[0]).toString('utf8').match(MARKER);
  if (!match || JSON.stringify(JSON.parse(match[1])) !== JSON.stringify(expected)) throw new Error('panel_identity_integrity');
  return expected;
}
module.exports = { identity, stamp, verify };
