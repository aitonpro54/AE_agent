'use strict';

const fileKey = file => file.replace(/\\/g, '/').toLowerCase();

function build({ input, evidence }) {
  if (evidence.target.file === undefined) throw new Error('media_import_preflight_only');
  const file = fileKey(input.file);
  if (!/^[a-z]:\/(?:[^/:*?"<>|\x00-\x1f]+\/)*[^/:*?"<>|\x00-\x1f]+\.(?:jpe?g|png|tiff?|psd|mov|mp4|mxf|avi|wav|aiff?)$/.test(file) ||
      file.slice(3).split('/').some(part => /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/.test(part))) {
    throw new Error('media_import_path');
  }
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('media_import_digest');
  if (evidence.items.some(item => item.file && fileKey(item.file) === file)) throw new Error('media_already_imported');
  const expectedInventory = JSON.stringify(evidence.items.map(item => [item.id, item.name, item.file, item.kind]));
  const bytes = Buffer.byteLength(JSON.stringify(evidence));
  if (evidence.items.length >= 2048 || bytes > 88 * 1024 ||
      bytes + 2 * Buffer.byteLength(JSON.stringify(expectedInventory)) > 224 * 1024) throw new Error('inspection_result_budget');
  return { operationId: 'ingest-footage', input: { ...input, expectedRevision: evidence.revision, expectedInventory } };
}

module.exports = { build };
