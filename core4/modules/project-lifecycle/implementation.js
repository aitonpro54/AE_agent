'use strict';

const key = file => file.replace(/\\/g, '/').toLowerCase();

function build({ input, evidence }) {
  const destination = key(input.destination);
  if (!/^[a-z]:\/(?:[^/:*?"<>|\x00-\x1f]+\/)+[^/:*?"<>|\x00-\x1f]+\.aep$/.test(destination) ||
      destination.slice(3).split('/').some(part => /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/.test(part)) ||
      destination === key(input.projectId)) throw new Error('lifecycle_destination_path');
  if (input.action !== 'save-as' && evidence.dirty) throw new Error('lifecycle_clean_source_required');
  if (input.allowDirtyDestination !== undefined && input.action !== 'open') throw new Error('lifecycle_dirty_destination_policy');
  if (input.action === 'open' ? !/^[a-f0-9]{64}$/.test(input.expectedDestinationSha256) : input.expectedDestinationSha256 !== undefined)
    throw new Error('lifecycle_destination_hash');
  return { operationId: 'transition-project', input: { ...input, expectedRevision: evidence.revision,
    expectedSavedSha256: evidence.savedFileSha256, expectedFileStamp: evidence.fileStamp, checkpointRoot: evidence.checkpointRoot } };
}

module.exports = { build };
