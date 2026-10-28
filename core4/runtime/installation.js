'use strict';
// The entry is builtin-only until start() verifies the complete installed tree.
const { verifyInstallation, verifyRelease, verifyCep } = require('./stdio-entry.js');
module.exports = { verifyInstallation, verifyRelease, verifyCep };
