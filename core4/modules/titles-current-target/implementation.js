'use strict';
function build({ input, evidence }) {
  if (/[\r\n]/.test(input.text) || input.text.length === 0) { const e = new Error('single-line nonempty title required'); e.code = 'unsupported'; throw e; }
  return { operationId: 'set-current-text', input: { ...input, expectedRevision: evidence.revision, expectedText: evidence.text } };
}
module.exports = { build };
