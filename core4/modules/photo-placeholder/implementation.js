'use strict';
function build({ input, evidence }) {
  return { operationId: 'replace-source', input: { ...input, expectedRevision: evidence.revision, expectedOldSourceId: evidence.sourceId } };
}
module.exports = { build };
