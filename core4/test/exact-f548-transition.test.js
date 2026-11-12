'use strict';
const test = require('node:test');
// Match the portable transition's Windows TEMP IO observation budget. Exact
// artifact/pins and production deadlines are unchanged; this is not a retry.
test('exact-f548-transition code artifact to readonly with fresh synthetic state', { timeout: 90000 }, async () => {
  console.log(JSON.stringify(await require('./fixtures/exact-f548-transition').exactTransition()));
});
