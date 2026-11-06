'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { prepareLayout, fitLayout } = require('../src/layout');
const { prepareLayoutBuild } = require('../src/layout-native');
const { hash } = require('../src/compiler');
const example = require('../examples/multiline-title.json');

test('prepares one numbered block with distinct roles, preserving source and explicit frame', () => {
  const source = '\r\n № 7\r\n\r\nА. Б.\u00a0Ветров, М. В. Полякова\r\nПостановка театральной студии\r\n“Дорога к северному морю\r\nи огни далёкого города”\r\n';
  const result = prepareLayout({ ...example, source });
  assert.equal(result.source, source);
  assert.equal(result.number, 7);
  assert.deepEqual(result.frame, example.frame);
  assert.deepEqual(result.rubrics, [
    { role: 'author', text: 'А.Б. Ветров, М.В. Полякова' },
    { role: 'caption', text: 'Постановка театральной студии' },
    { role: 'title', text: '«ДОРОГА К СЕВЕРНОМУ МОРЮ И ОГНИ ДАЛЁКОГО ГОРОДА»' },
  ]);
  assert.deepEqual(result.candidates[0], { id: 'base', lines: result.rubrics });
});

test('keeps a short two-line title, preserves unquoted text, and handles nested quotes', () => {
  const job = { ...example, format: 'author-title', titleCase: 'preserve' };
  const short = prepareLayout({ ...job, source: 'А. Б. Ветров\nСеверо-запад 🎭' });
  assert.equal(short.number, null);
  assert.deepEqual(short.candidates, [{ id: 'base', lines: [
    { role: 'author', text: 'А.Б. Ветров' },
    { role: 'title', text: 'Северо-запад 🎭' },
  ] }]);
  const nested = prepareLayout({ ...job, source: '12) А. Б. Ветров\n«Студия «Север»\nи её история»' });
  assert.equal(nested.number, 12);
  assert.equal(nested.rubrics[1].text, '«Студия «Север» и её история»');
});

test('generates distinct deterministic variants without deleting text or splitting initials and connectors', () => {
  const source = 'А. Б. Ветров, М. В. Полякова, Е. И. Соколова\nПостановка театральной студии нового города и его друзей\nДорога к северному морю и огни далёкого города';
  const job = { ...example, source };
  const { rubrics, candidates } = prepareLayout(job);
  assert.deepEqual(prepareLayout(job).candidates, candidates);
  assert.equal(candidates.length, 19);
  assert.equal(new Set(candidates.map(variant => JSON.stringify(variant.lines))).size, candidates.length);
  for (const variant of candidates) {
    assert.ok(variant.lines.length <= 5);
    for (const rubric of rubrics) {
      const lines = variant.lines.filter(line => line.role === rubric.role).map(line => line.text);
      assert.equal(lines.join(' '), rubric.text);
      for (const text of lines.slice(0, -1)) {
        assert.doesNotMatch(text, /(?: К| И|[А-ЯЁ]\.)$/u);
        if (rubric.role === 'author') assert.match(text, /,$/u);
      }
    }
  }
  assert.ok(candidates.some(variant => variant.lines.filter(line => line.role === 'caption').length === 2));
});

test('pins a manual line break to this title without changing its words', () => {
  const source = 'А. Б. Ветров\nУлица далёкого города и старый причал';
  const job = { ...example, format: 'author-title', titleCase: 'preserve', source };
  const result = prepareLayout({ ...job, lineBreaks: { title: [3, 5] } });
  assert.deepEqual(result.candidates, [{ id: 'override', lines: [
    { role: 'author', text: 'А.Б. Ветров' },
    { role: 'title', text: 'Улица далёкого города' },
    { role: 'title', text: 'и старый' },
    { role: 'title', text: 'причал' },
  ] }]);
  for (const lineBreaks of [{ title: [4] }, { title: [5, 3] }, { caption: [1] }, { author: [1] }, { title: [6] }, {}]) {
    assert.throws(() => prepareLayout({ ...job, lineBreaks }), /layout_override/);
  }
  assert.throws(() => prepareLayout({ ...job, lineBreaks: { title: [1, 2, 3, 5] } }), /layout_line_limit/);
});

test('reports missing, ambiguous or malformed input and rejects unsupported frame geometry', () => {
  for (const source of ['Автор\nЗаголовок', 'Автор\nПояснение\nДлинный заголовок\nЕщё строка']) {
    assert.throws(() => prepareLayout({ ...example, source }), /layout_rubric_count/);
  }
  for (const source of ['1. Автор\nНазвание\n2. Автор\nДругое название', 'Автор\n\nНазвание']) {
    assert.throws(() => prepareLayout({ ...example, source }), /layout_multiple_blocks/);
  }
  for (const [source, code] of [
    ['Автор\nПояснение\n«Заголовок', /layout_unclosed_quote/],
    ['Автор\nПояснение\n« »', /layout_empty_rubric/],
    ['Автор\nПояснение\n\ud800', /layout_source/],
    ['Автор\nПояснение\nНазвание\u0000', /layout_source/],
    ['а'.repeat(769), /layout_source/],
  ]) assert.throws(() => prepareLayout({ ...example, source }), code);
  for (const frame of [null, { ...example.frame, rotation: 15 }, { ...example.frame, width: 0 },
    { ...example.frame, height: Infinity }, { ...example.frame, left: -1 }, { ...example.frame, width: 1e6 }]) {
    assert.throws(() => prepareLayout({ ...example, frame }), /layout_frame/);
  }
});

test('the public CLI produces layout JSON and accepts only its documented flag', () => {
  const cwd = path.resolve(__dirname, '..');
  const args = ['cli.js', 'prepare-layout', '--job', 'examples/multiline-title.json'];
  const run = (...rest) => spawnSync(process.execPath, [...args, ...rest], { cwd, encoding: 'utf8' });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), prepareLayout(example));
  const invalid = run('--inspection', 'inspection.json');
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.deepEqual(JSON.parse(invalid.stderr), { error: 'usage' });
});

function fitFixture() {
  const job = {
    ...example, format: 'author-title', source: 'А. Б. Ветров\nДорога к северному морю и огни',
    frame: { left: 10, top: 20, width: 100, height: 60 },
    fit: { padding: 5, preferredScale: 1, minimumScale: 0.65 },
  };
  const preview = prepareLayout(job);
  return { job, measurements: {
    layoutId: preview.layoutId, geometry: 'unparented-unrotated-2d-point-text', anchor: [2, -3],
    samples: [
      { id: 'base', bounds: { left: -20, top: -10, width: 180, height: 30 } },
      { id: 'alternative-1', bounds: { left: -30, top: -20, width: 100, height: 40 } },
      { id: 'alternative-2', bounds: { left: -40, top: -40, width: 90, height: 100 } },
    ],
  } };
}

test('Titles layout builds measure and apply inputs for the current public Core contract', () => {
  const publicContract = require('../../../core4/modules/titles-point-layout/contract.json');
  const artifact = require('../../../core4/modules/titles-point-layout/artifact.json');
  const admission = require('../../../core4/config/admissions/titles-point-layout.json');
  const { build } = require('../../../core4/modules/titles-point-layout/implementation');
  const { check } = require('../../../core4/protocol/schema');
  const { job, measurements } = fitFixture();
  const contract = { contractId: '1'.repeat(64), moduleId: publicContract.moduleId, operationId: publicContract.operationId,
    contract: publicContract, modulePin: hash(artifact), admissionPin: hash(admission) };
  const target = { projectId: 'C:/fixture/titles.aep', compId: 7, layerId: 10 };
  const inspection = { evidenceRef: 'evidence-11111111-1111-4111-8111-111111111111', modulePin: contract.modulePin, synthetic: false,
    snapshot: { target, role: 'measure', comp: [800, 450], style: 'fixture-style', time: 1, revision: 'fixture-measure' } };
  const measure = prepareLayoutBuild('measure', job, target, contract, inspection).steps[0];
  check(publicContract.inputSchema, build({ input: measure.input, evidence: inspection.snapshot }).input);
  const after = { ...inspection.snapshot, layoutId: measurements.layoutId, samples: measurements.samples };
  const output = { ...target, layerId: 11 };
  const outputInspection = { ...inspection, snapshot: { ...inspection.snapshot, target: output, role: 'apply', anchor: measurements.anchor } };
  const task = { taskId: 'task-11111111-1111-4111-8111-111111111111', reset: false, commands: [{ state: 'succeeded',
    modulePin: contract.modulePin, target, after, commandId: 'command-11111111-1111-4111-8111-111111111111' }] };
  const apply = prepareLayoutBuild('apply', job, output, contract, outputInspection, task).steps[0];
  check(publicContract.inputSchema, build({ input: apply.input, evidence: outputInspection.snapshot }).input);
  assert.equal(apply.input.candidateId, 'alternative-1');
  assert.throws(() => prepareLayoutBuild('measure', job, target, { ...contract, modulePin: '0'.repeat(64) }, inspection), /incompatible_contract/);
});

test('fits measured bounds along both axes and centers them with the original anchor', () => {
  const { job, measurements } = fitFixture();
  const result = fitLayout(job, measurements);
  assert.equal(result.status, 'fit');
  assert.equal(result.candidateId, 'alternative-1');
  assert.equal(result.scale, 0.9);
  assert.deepEqual(result.position, [43.8, 47.3]);
  assert.deepEqual(result.projectedBounds, { left: 15, top: 32, width: 90, height: 36 });
  assert.deepEqual(fitLayout(job, { ...measurements, samples: [...measurements.samples].reverse() }), result);
});

test('preserves the base if it fits at the preferred scale, and reports an undersized fit', () => {
  const { job, measurements } = fitFixture();
  const enough = { ...job, fit: { ...job.fit, preferredScale: 0.5, minimumScale: 0.4 } };
  const base = fitLayout(enough, measurements);
  assert.equal(base.candidateId, 'base');
  assert.equal(base.scale, 0.5);
  const tooSmall = { ...job, fit: { ...job.fit, minimumScale: 0.95 } };
  assert.deepEqual(fitLayout(tooSmall, measurements), {
    status: 'below_minimum_scale', layoutId: measurements.layoutId, candidateId: 'alternative-1', scale: 0.9,
  });
});

test('rejects stale layout, missing or duplicated measurements, unsupported geometry and degenerate fits', () => {
  const { job, measurements } = fitFixture();
  const stale = { ...job, frame: { ...job.frame, left: 11 } };
  assert.throws(() => fitLayout(stale, measurements), /layout_measurement_stale/);
  assert.throws(() => fitLayout({ ...job, source: job.source + ' вдали' }, measurements), /layout_measurement_stale/);
  assert.throws(() => fitLayout(job, { ...measurements, geometry: 'parented-3d' }), /layout_measurement_geometry/);
  for (const samples of [measurements.samples.slice(1), [measurements.samples[0], ...measurements.samples.slice(0, 2)],
    [{ id: 'unexpected', bounds: measurements.samples[0].bounds }, ...measurements.samples.slice(1)],
    [{ id: 'base', bounds: { ...measurements.samples[0].bounds, width: 0 } }, ...measurements.samples.slice(1)]]) {
    assert.throws(() => fitLayout(job, { ...measurements, samples }), /layout_measurement/);
  }
  for (const fit of [undefined, { ...job.fit, padding: 30 }, { ...job.fit, minimumScale: 2 }]) {
    assert.throws(() => fitLayout({ ...job, fit }, measurements), /layout_fit_preferences/);
  }
});

test('fit CLI works from a foreign current directory with explicit UTF-8 files', t => {
  const { job, measurements } = fitFixture();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'titles-layout-'));
  t.after(() => { fs.unlinkSync(path.join(cwd, 'job.json')); fs.unlinkSync(path.join(cwd, 'measurements.json')); fs.rmdirSync(cwd); });
  fs.writeFileSync(path.join(cwd, 'job.json'), JSON.stringify(job));
  fs.writeFileSync(path.join(cwd, 'measurements.json'), JSON.stringify(measurements));
  const cli = path.resolve(__dirname, '../cli.js');
  const result = spawnSync(process.execPath, [cli, 'fit-layout', '--job', 'job.json', '--measurements', 'measurements.json'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), fitLayout(job, measurements));
  assert.deepEqual(fs.readdirSync(cwd).sort(), ['job.json', 'measurements.json']);
});
