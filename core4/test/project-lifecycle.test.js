'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash } = require('../protocol/json');
const { harness } = require('./fixtures/manual-http-runtime');

const { lifecycleEnvironment, original, working, blank } = require('./fixtures/project-lifecycle-host');

async function flow(t, options = {}) {
  const h = await harness({ lifecycleEnvironment, ...options });
  t.after(() => h.close());
  const moduleId = 'project-lifecycle', { contractId } = h.broker.getContract({ moduleId });
  const target = { projectId: h.state.projectId, sessionId: h.installation.installationId };
  const destination = path.join(h.dir, 'Копия проекта', 'Сборка.aep');
  const inspect = (at = target) => h.broker.inspect({ moduleId, contractId, target: at });
  const prepare = async (input = { ...target, destination, action: 'save-as' }) => {
    const evidence = await inspect();
    const plan = await h.broker.build({ oneStep: true, steps: [{ stepId: 'transition', moduleId, contractId, evidenceRef: evidence.evidenceRef, input }] });
    const proposal = h.broker.propose({ buildId: plan.buildId });
    const dry = await h.broker.dryrun({ proposalId: proposal.proposalId });
    return { proposalId: proposal.proposalId, dryrunRef: dry.dryrunRef, taskId: plan.taskId };
  };
  return { h, target, destination, inspect, prepare };
}

test('project-lifecycle Save As preserves saved source and activates the new AEP with current edits', async t => {
  const f = await flow(t, { confirm: ({ message, state }) => {
    assert.ok(message.includes(state.projectId));
    assert.match(message, /Копия проекта/);
    return true;
  } });
  const result = await f.h.broker.run(await f.prepare());
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const { after } = f.h.broker.ledger.commands()[0];
  assert.equal(after.currentProject, f.destination);
  assert.equal(after.savedFileSha256, hash(working));
  assert.equal(after.transition.sourceSha256, hash(original));
  assert.deepEqual(fs.readFileSync(after.transition.checkpoint.path), original);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
  assert.deepEqual(fs.readFileSync(f.destination), working);
  assert.equal((await f.inspect({ ...f.target, projectId: f.destination })).snapshot.dirty, false);
  assert.equal(f.h.state.writes, 1);
});

test('project-lifecycle refuses an occupied directory and a destination created during confirmation', async t => {
  const f = await flow(t, { confirm: ({ state }) => {
    fs.writeFileSync(path.join(path.dirname(state.projectId), 'Копия проекта', 'Сборка.aep'), 'another writer');
    return true;
  } });
  const occupied = path.join(f.h.dir, 'occupied');
  fs.mkdirSync(occupied);
  const args = { ...f.target, action: 'save-as', destination: path.join(occupied, 'Work.aep') };
  const first = await f.h.broker.run(await f.prepare(args));
  assert.equal(first.code, 'lifecycle_new_directory_required', JSON.stringify(first));
  assert.equal(f.h.confirmations, 0);
  const second = await f.h.broker.run(await f.prepare());
  assert.equal(second.code, 'executor_rejected', JSON.stringify(second));
  assert.equal(second.message, 'stale_target');
  assert.equal(f.h.state.writes, 0);
  assert.equal(fs.readFileSync(f.destination, 'utf8'), 'another writer');
});

test('project-lifecycle rejects proposals from a previous host binding and fences uncertain writes', async t => {
  const f = await flow(t, { flags: { uncertain: true } });
  const payload = await f.prepare();
  const file = path.join(f.h.state.stateDir, 'host-adoption.json');
  const adoption = JSON.parse(fs.readFileSync(file));
  fs.writeFileSync(file, JSON.stringify({ ...adoption, rootObservationDigest: 'a'.repeat(64) }));
  const prior = await f.h.broker.run(payload);
  assert.equal(prior.code, 'execution_policy_changed', JSON.stringify(prior));
  assert.equal(f.h.state.writes, 0);
  await f.h.broker.run(await f.prepare());
  assert.equal(f.h.broker.ledger.commands()[0].state, 'UNKNOWN');
  assert.equal(f.h.state.writes, 1);
  await assert.rejects(f.prepare(), /controller_unresolved/);
});

test('project-lifecycle creates and verifies an empty named AEP after a clean source', async t => {
  const f = await flow(t, { flags: { clean: true }, confirm: ({ message }) => {
    assert.match(message, /Создать пустой AEP/); return true;
  } });
  const input = { ...f.target, action: 'create', destination: f.destination };
  const result = await f.h.broker.run(await f.prepare(input));
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  assert.equal(f.h.state.creates, 1);
  assert.deepEqual(fs.readFileSync(f.destination), blank);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
  assert.equal(f.h.broker.ledger.commands()[0].after.inventory, '[]');
});

test('project-lifecycle refuses to create from a dirty source before preparing a destination', async t => {
  const f = await flow(t);
  await assert.rejects(f.prepare({ ...f.target, action: 'create', destination: f.destination }), /lifecycle_clean_source_required/);
  assert.equal(fs.existsSync(path.dirname(f.destination)), false);
  assert.equal(f.h.state.creates, 0);
});

test('project-lifecycle opens the exact existing AEP and verifies both saved hashes', async t => {
  const f = await flow(t, { flags: { clean: true } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const input = { ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) };
  const result = await f.h.broker.run(await f.prepare(input));
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  assert.equal(f.h.state.opens, 1);
  assert.equal(f.h.state.writes, 0);
  assert.deepEqual(fs.readFileSync(destination), working);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
  assert.equal(f.h.broker.ledger.commands()[0].after.currentProject, destination);
});

test('project-lifecycle refuses a wrong or changed opening target and retains the original project', async t => {
  const f = await flow(t, { flags: { clean: true }, confirm: ({ state }) => {
    fs.writeFileSync(path.join(path.dirname(state.projectId), 'Saved target.aep'), Buffer.alloc(working.length, 65));
    return true;
  } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const input = { ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) };
  const wrong = await f.h.broker.run(await f.prepare({ ...input, expectedDestinationSha256: hash(original) }));
  assert.equal(wrong.code, 'lifecycle_destination_hash');
  assert.equal(f.h.confirmations, 0);
  const changed = await f.h.broker.run(await f.prepare(input));
  assert.equal(changed.code, 'executor_rejected');
  assert.equal(changed.message, 'lifecycle_disk_changed');
  assert.equal(f.h.state.opens, 0);
  assert.equal(f.h.state.currentFile, f.target.projectId);
});

test('project-lifecycle compares the complete compact inventory above 1079 items and fails closed above its text budget', async t => {
  const f = await flow(t, { flags: { items: 1080 } });
  const { snapshot } = await f.inspect();
  assert.equal(JSON.parse(snapshot.inventory).length, 1080);
  const result = await f.h.broker.run(await f.prepare());
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  assert.equal(result.outputs.transition.inventory, snapshot.inventory);
  t.diagnostic('lifecycle inventory bytes=' + Buffer.byteLength(snapshot.inventory));
  const wide = await flow(t, { flags: { items: 1080, wideInventory: true } });
  await assert.rejects(wide.inspect(), /inspection_result_budget/);
  assert.equal(wide.h.state.writes, 0);
});

test('project-lifecycle partial open preserves both disk checkpoints and blocks replay', async t => {
  const f = await flow(t, { flags: { clean: true, partialOpen: true } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const input = { ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) };
  const run = await f.prepare(input);
  const result = await f.h.broker.run(run);
  assert.equal(result.state, 'stopped');
  assert.equal(result.code, 'lifecycle_open_destination_dirty');
  const [command] = f.h.broker.ledger.commands();
  assert.equal(command.state, 'UNKNOWN');
  assert.equal(f.h.peer.status().lastCommandOutcome.code, 'lifecycle_open_destination_dirty');
  assert.equal(f.h.peer.status().lastCommandOutcome.queue, 'fenced');
  const checkpoints = path.join(f.h.installation.stateDir, 'project-save-checkpoints');
  const file = path.join(checkpoints, command.checkpoint.ref + '.aep');
  assert.deepEqual(fs.readFileSync(file), original);
  assert.deepEqual(fs.readFileSync(file.replace(/\.aep$/, '.open.aep')), working);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
  assert.deepEqual(fs.readFileSync(destination), working);
  assert.equal(f.h.state.currentFile, destination);
  await assert.rejects(f.h.broker.run(run), /fresh_dryrun_required/);
  await assert.rejects(f.prepare(input), /controller_unresolved/);
  assert.equal(f.h.state.opens, 1);
});

test('project-lifecycle reports an already switched AEP when its post-open inventory exceeds the limit', async t => {
  const f = await flow(t, { flags: { clean: true, afterOpenItems: 2049 } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const result = await f.h.broker.run(await f.prepare({ ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) }));
  assert.equal(result.code, 'lifecycle_open_destination_clean');
  assert.equal(f.h.peer.status().lastCommandOutcome.queue, 'fenced');
  assert.equal(f.h.broker.ledger.commands()[0].state, 'UNKNOWN');
  assert.equal(f.h.state.currentFile, destination);
  assert.equal(f.h.state.opens, 1);
});

test('project-lifecycle retains the authenticated open observation after disk proof fails', async t => {
  const f = await flow(t, { flags: { clean: true, diskChangedAfterOpen: true } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const result = await f.h.broker.run(await f.prepare({ ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) }));
  assert.equal(result.code, 'lifecycle_disk_proof_unavailable');
  const outcome = f.h.peer.status().lastCommandOutcome;
  assert.equal(outcome.queue, 'fenced');
  assert.deepEqual(outcome.openObservation, { currentProject: destination, dirty: false, diskVerified: false });
  const [command] = f.h.broker.ledger.commands();
  assert.equal(command.state, 'UNKNOWN');
  const saved = path.join(f.h.installation.stateDir, 'project-save-checkpoints', command.checkpoint.ref);
  assert.deepEqual(fs.readFileSync(saved + '.aep'), original);
  assert.deepEqual(fs.readFileSync(saved + '.open.aep'), working);
  assert.equal(f.h.state.opens, 1);
});
