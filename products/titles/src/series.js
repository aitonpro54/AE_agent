'use strict';
const { prepareLayout } = require('./layout');

const NUMBERED = /^(?:№\s*(\d{1,3})[.)]?|(\d{1,3})[.)])(?:\s+|$)/u;
const ROLES = ['author', 'caption', 'title'];
const isRecord = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => Number.isSafeInteger(value) && value > 0;

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function fields(value, required, optional = []) {
  return isRecord(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function numberedBlocks(source) {
  if (typeof source !== 'string' || source.length > 8000) fail('series_source');
  const blocks = new Map();
  let current;
  for (const line of source.split(/\r\n|[\r\n]/u)) {
    const marker = line.trim().match(NUMBERED);
    if (marker) {
      current = Number(marker[1] ?? marker[2]);
      if (!id(current) || blocks.has(current)) fail('series_number');
      blocks.set(current, [line]);
    } else if (current) blocks.get(current).push(line);
    else if (line.trim()) fail('series_number');
  }
  if (!blocks.size || blocks.size > 10) fail('series_count');
  return new Map([...blocks].map(([number, lines]) => [number, lines.join('\n').trim()]));
}

function guideFrame(guides) {
  if (!Array.isArray(guides) || guides.length !== 4 ||
      guides.some(guide => !guide || !['x', 'y'].includes(guide.axis) || !Number.isFinite(guide.position))) fail('series_guides');
  const [left, right] = guides.filter(guide => guide.axis === 'x').map(guide => guide.position).sort((a, b) => a - b);
  const [top, bottom] = guides.filter(guide => guide.axis === 'y').map(guide => guide.position).sort((a, b) => a - b);
  if (!(right > left && bottom > top)) fail('series_guides');
  return { left, top, width: right - left, height: bottom - top };
}

function prepareSeries(job, inspection) {
  if (!fields(job, ['schemaVersion', 'source', 'target', 'profile', 'titles']) || job.schemaVersion !== 'series-1' ||
      !fields(job.target, ['projectId', 'compId']) || !id(job.target.compId) ||
      typeof job.target.projectId !== 'string' || !job.target.projectId) fail('series_job');
  const { profile, titles, target } = job;
  const observed = inspection?.snapshot;
  if (!observed || observed.target?.projectId !== target.projectId || observed.target?.compId !== target.compId ||
      !Array.isArray(observed.layers) || !Array.isArray(observed.size) || observed.size.length !== 2 ||
      observed.size.some(value => !Number.isFinite(value) || value < 1)) fail('series_inspection');
  if (!fields(profile, ['id', 'frame', 'roles', 'titleCase', 'leading', 'justification', 'minimumScale']) ||
      typeof profile.id !== 'string' || !profile.id ||
      !fields(profile.roles, ROLES) || ROLES.some(role => !fields(profile.roles[role],
        ['font', 'fontSize', 'tracking'], ['fallbackFont', 'fill', 'stroke'])) ||
      !['left', 'center', 'right'].includes(profile.justification) || !Number.isFinite(profile.leading) ||
      profile.leading < 1 || profile.leading > 3000 || !Number.isFinite(profile.minimumScale) ||
      profile.minimumScale < 0.05 || profile.minimumScale > 1) fail('series_profile');
  const frame = profile.frame === 'guides' ? guideFrame(observed.guides) : profile.frame;
  if (!frame || frame.left + frame.width > observed.size[0] || frame.top + frame.height > observed.size[1]) fail('series_frame');
  const blocks = numberedBlocks(job.source);
  if (!Array.isArray(titles) || titles.length !== blocks.size ||
      new Set(titles.map(title => title?.number)).size !== titles.length ||
      new Set(titles.map(title => title?.slot)).size !== titles.length) fail('series_count');
  const entries = titles.map(title => {
    if (!fields(title, ['number', 'slot', 'name', 'format', 'candidateId'], ['lineBreaks']) ||
        !blocks.has(title.number) || !/^[a-z][a-z0-9-]{0,39}$/.test(title.slot ?? '') ||
        typeof title.name !== 'string' || !title.name || title.name.length > 100) fail('series_title');
    const layout = prepareLayout({ schemaVersion: 'layout-1', source: blocks.get(title.number), format: title.format,
      titleCase: profile.titleCase, frame, ...(title.lineBreaks === undefined ? {} : { lineBreaks: title.lineBreaks }) });
    const selected = layout.candidates.find(candidate => candidate.id === title.candidateId);
    if (!selected) fail('series_candidate');
    const text = selected.lines.map(line => line.text).join('\n');
    let start = 0;
    const ranges = selected.lines.map(({ role, text: line }, index) => {
      const end = start + line.length + (index === selected.lines.length - 1 ? 0 : 1);
      const range = { ...profile.roles[role], start, end };
      start = end;
      return range;
    });
    return { number: title.number, slot: title.slot, name: title.name, selected: selected.id, layout,
      input: { ...target, slot: title.slot, name: title.name, text, ranges, leading: profile.leading,
        justification: profile.justification, placement: { frame, minimumScale: profile.minimumScale } } };
  });
  return { schemaVersion: 'series-1', profileId: profile.id, target, source: job.source, frame, titles: entries };
}

function prepareSeriesWrite(job, selection, contract, inspection) {
  if (!fields(selection, ['number'], ['layerId']) || !id(selection.number) ||
      Object.hasOwn(selection, 'layerId') && !id(selection.layerId)) fail('series_selection');
  if (contract?.moduleId !== 'text-layer' || contract.operationId !== 'write-point-text' ||
      typeof contract.contractId !== 'string' || !/^[a-f0-9]{64}$/.test(contract.contractId) ||
      contract.modulePin !== inspection?.modulePin || typeof inspection.evidenceRef !== 'string' ||
      !inspection.evidenceRef || inspection.synthetic !== false) fail('series_contract');
  const series = prepareSeries(job, inspection);
  const title = series.titles.find(entry => entry.number === selection.number);
  if (!title) fail('series_selection');
  const layer = inspection.snapshot.layers.find(entry => entry.slot === title.slot);
  if (selection.layerId === undefined ? layer : !layer || layer.layerId !== selection.layerId || layer.name !== title.name || layer.issue) fail('series_target');
  return { oneStep: true, steps: [{ stepId: 'title-' + title.number, moduleId: contract.moduleId, contractId: contract.contractId,
    evidenceRef: inspection.evidenceRef, input: { ...title.input, ...(layer ? { layerId: layer.layerId } : {}) } }] };
}

module.exports = { prepareSeries, prepareSeriesWrite };
