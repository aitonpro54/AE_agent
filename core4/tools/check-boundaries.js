'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { reviewCode } = require('../core/artifacts');
const { fail } = require('../protocol/json');
function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(directory, e.name)) : [path.join(directory, e.name)]); }
function checkBoundaries(root = path.resolve(__dirname, '..')) {
  let checked = 0;
  for (const directory of ['modules', 'plan-engine']) for (const file of files(path.join(root, directory)).filter(f => f.endsWith('.js'))) { reviewCode(fs.readFileSync(file, 'utf8')); checked++; }
  for (const file of files(path.join(root, 'core')).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (/require\s*\(\s*['"][^'"]*(?:modules\/|plan-engine\/|integrations\/|bridge-daemon|core-tool-dispatch)/.test(source)) fail('core_domain_import', file);
    if (/require\s*\(\s*[^'"\s]/.test(source)) fail('computed_core_import', file);
    checked++;
  }
  const integration = path.join(root, 'integrations');
  if (fs.existsSync(integration)) for (const file of files(integration).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1].includes('/core/') && match[1] !== '../../core/receiver-api') fail('integration_private_core_import', file);
      if (/bridge-daemon|modules\/|plan-engine\//.test(match[1])) fail('integration_domain_import', file);
    }
    checked++;
  }
  for (const file of files(path.join(root, 'runtime')).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (/require\s*\(\s*[^'"\s]/.test(source) || /require\s*\(\s*['"][^'"]*(?:bridge-daemon|modules\/|plan-engine\/|core-tool-dispatch)/.test(source)) fail('runtime_domain_import', file);
    if (path.basename(file) === 'stdio-entry.js') {
      const prefix = source.slice(0, source.indexOf('async function start('));
      for (const match of prefix.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!match[1].startsWith('node:')) fail('unverified_entry_import', file);
      if (!source.includes('if (manualAsset) {') || source.indexOf("require('./manual-policy.js')") < source.indexOf('if (manualAsset) {') || source.indexOf("require('./windows-reservation-provider.js')") < source.indexOf('if (manualAsset) {')) fail('runtime_optional_policy_import', file);
    }
    checked++;
  }
  return { checked, model: 'reviewed-local-code; conservative source guard; not OS sandbox', liveCalls: 0 };
}
if (require.main === module) { try { console.log(JSON.stringify(checkBoundaries())); } catch (e) { console.error(e.code || e.message); process.exitCode = 1; } }
module.exports = { checkBoundaries, files };
