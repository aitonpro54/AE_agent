'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSeries, prepareSeriesWrite } = require('../src/series');

const target = { projectId: 'C:\\fixtures\\title-copy.aep', compId: 80 };
const white = [1, 1, 1];
const regular = { font: 'ArialMT', fontSize: 60, tracking: 20, fill: white };
const job = {
  schemaVersion: 'series-1', target,
  source: '1. А. Б. Ветров\n"Север"\n\n№2\nМ. Полякова\nВечерняя программа\n«Дорога к северному морю\nи огни далёкого города»',
  profile: { id: 'titr-copy', titleCase: 'uppercase', frame: 'guides', leading: 95, justification: 'center', minimumScale: 0.6,
    roles: { author: regular, caption: { ...regular, fontSize: 44 }, title: { ...regular, font: 'Arial-BoldMT', fontSize: 95 } } },
  titles: [
    { number: 1, name: 'Титр 01', slot: 'title-01', format: 'author-title', candidateId: 'base' },
    { number: 2, name: 'Титр 02', slot: 'title-02', format: 'author-caption-title', candidateId: 'override', lineBreaks: { title: [4] } },
  ],
};
const modulePin = 'a'.repeat(64);
const contract = { moduleId: 'text-layer', operationId: 'write-point-text', contractId: 'b'.repeat(64), modulePin };
const snapshot = { target, size: [1920, 1080], layers: [],
  guides: [{ axis: 'x', position: 1740 }, { axis: 'y', position: 200 }, { axis: 'x', position: 180 }, { axis: 'y', position: 880 }] };
const inspection = { snapshot, modulePin, evidenceRef: 'evidence-native', synthetic: false };

test('numbered source becomes two exact jobs with separate rubric styles and an explicit break', () => {
  const series = prepareSeries(job, inspection);
  assert.equal(series.source, job.source);
  assert.deepEqual(series.frame, { left: 180, top: 200, width: 1560, height: 680 });
  assert.equal(series.titles[0].input.text, 'А.Б. Ветров\n«СЕВЕР»');
  const long = series.titles[1].input;
  assert.equal(long.text, 'М. Полякова\nВечерняя программа\n«ДОРОГА К СЕВЕРНОМУ МОРЮ\nИ ОГНИ ДАЛЁКОГО ГОРОДА»');
  assert.deepEqual(long.ranges.map(range => range.fontSize), [60, 44, 95, 95]);
  assert.equal(long.ranges.at(-1).end, long.text.length);
  assert.deepEqual(long.ranges.map(range => long.text.slice(range.start, range.end)).join(''), long.text);
});

test('series compiler uses fresh evidence and an explicit layer ID to edit exactly one title', () => {
  const created = prepareSeriesWrite(job, { number: 1 }, contract, inspection);
  assert.equal(created.steps[0].input.layerId, undefined);
  const withLayers = { ...inspection, snapshot: { ...snapshot, layers: [
    { slot: 'title-01', layerId: 81, name: 'Титр 01' }, { slot: 'title-02', layerId: 82, name: 'Титр 02' },
  ] } };
  assert.throws(() => prepareSeriesWrite(job, { number: 1 }, contract, withLayers), /series_target/);
  assert.throws(() => prepareSeriesWrite(job, { number: 1, layerId: 82 }, contract, withLayers), /series_target/);
  const edit = prepareSeriesWrite(job, { number: 1, layerId: 81 }, contract, withLayers);
  assert.equal(edit.steps.length, 1);
  assert.equal(edit.steps[0].input.layerId, 81);
  assert.equal(edit.steps[0].evidenceRef, withLayers.evidenceRef);
});

test('ambiguous guides, duplicate slots, stale module and unrelated project are rejected', () => {
  assert.throws(() => prepareSeries(job, { snapshot: { ...snapshot, guides: snapshot.guides.slice(0, 3) } }), /series_guides/);
  assert.throws(() => prepareSeries({ ...job, titles: [job.titles[0], { ...job.titles[1], slot: 'title-01' }] }, inspection), /series_count/);
  assert.throws(() => prepareSeriesWrite(job, { number: 1 }, contract, { ...inspection, modulePin: 'stale' }), /series_contract/);
  assert.throws(() => prepareSeries(job, { snapshot: { ...snapshot, target: { ...target, compId: 17 } } }), /series_inspection/);
});
