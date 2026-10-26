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
    if (/require\s*\(\s*['"][^'"]*(?:modules\/|plan-engine\/|bridge-daemon|core-tool-dispatch)/.test(source)) fail('core_domain_import', file);
    if (/require\s*\(\s*[^'"\s]/.test(source)) fail('computed_core_import', file);
    checked++;
  }
  return { checked, model: 'reviewed-local-code; conservative source guard; not OS sandbox', liveCalls: 0 };
}
if (require.main === module) { try { console.log(JSON.stringify(checkBoundaries())); } catch (e) { console.error(e.code || e.message); process.exitCode = 1; } }
module.exports = { checkBoundaries, files };
