'use strict';

function build({ input, evidence }) {
  if (input.mode !== evidence.role) throw new Error('layout_layer_role');
  const { frame, fit } = input;
  if (frame.left + frame.width > evidence.comp[0] || frame.top + frame.height > evidence.comp[1] ||
      Math.min(frame.width, frame.height) - 2 * fit.padding < 1 || fit.minimumScale > fit.preferredScale) {
    throw new Error('layout_frame');
  }
  const measure = input.mode === 'measure';
  const applyFields = ['text', 'candidateId', 'measurementCommandId', 'scale', 'position'];
  if (measure ? !input.candidates || applyFields.some(key => key in input) :
    'candidates' in input || applyFields.some(key => !(key in input))) throw new Error('layout_mode_fields');
  if (!/^[a-f0-9]{64}$/.test(input.layoutId)) throw new Error('layout_id');
  const candidates = measure ? input.candidates : [{ id: input.candidateId, text: input.text }];
  if (new Set(candidates.map(candidate => candidate.id)).size !== candidates.length) throw new Error('layout_candidate_id');
  for (const candidate of candidates) {
    const lines = candidate.text.split('\n');
    if (!/^(base|override|alternative-(?:[1-9]|1[0-8]))$/.test(candidate.id) || lines.length > 5 ||
        lines.some(line => !line.trim() || /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/.test(line))) {
      throw new Error('layout_candidate');
    }
  }
  return { operationId: 'measure-or-apply-point-layout', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };
