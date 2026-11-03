'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
// Windows/JSX здесь обслуживаются локальной имитацией, без настоящего AE.
test('mock', () => {
  const mock = { app: { project: { numItems: 3 } }, process: { platform: 'win32' } };
  const result = vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'executor.jsx'), 'utf8'), mock);
  assert.equal(result, 3);
});
