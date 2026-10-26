'use strict';
// Explicit private-embedding SDK for optional receivers. Not a public MCP tool.
module.exports = Object.freeze({ ...require('../protocol/json'), ...require('../protocol/codec'), ...require('../protocol/dispatch'), createReceiver: require('./receiver').createReceiver, validateLifecycleBinding: require('./authority').validateLifecycleBinding });
