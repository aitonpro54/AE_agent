'use strict';
const test = require('node:test');
test('exact-f548-transition code artifact to readonly with fresh synthetic state', { timeout: 30000 }, async () => {
  console.log(JSON.stringify(await require('./fixtures/exact-f548-transition').exactTransition()));
});
