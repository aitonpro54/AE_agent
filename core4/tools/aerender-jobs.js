'use strict';

const runner = require('../runtime/aerender-jobs');

function createJobs(root, identity, listRenderers) {
  return runner.createJobs(root, identity, listRenderers, __filename);
}

if (require.main === module) {
  runner.main(__filename).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { createJobs };
