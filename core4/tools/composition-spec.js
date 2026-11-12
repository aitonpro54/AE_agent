'use strict';
// Trusted source tooling shim. Standalone packaging supplies its own pure bytes
// in this reserved tooling slot, independently of the candidate runtime file.
module.exports = require('../runtime/composition-spec.js');
