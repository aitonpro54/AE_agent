'use strict';

function build({ input, evidence }) {
  return { operationId: 'save-current-project', input: { ...input,
    expectedRevision: evidence.revision, expectedSavedSha256: evidence.savedFileSha256,
    expectedFileStamp: evidence.fileStamp, checkpointRoot: evidence.checkpointRoot } };
}

module.exports = { build };
