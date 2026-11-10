'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');
const { hash } = require('../protocol/json');
const { harness } = require('./fixtures/manual-http-runtime');

const { lifecycleEnvironment, original, working, blank, mediaBytes } = require('./fixtures/project-lifecycle-host');

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

function renderInput(f, render = {}) {
  return { ...f.target, action: 'stage-render-copy', destination: f.destination,
    render: { compId: 20, fps: '30000/1001', audio: false, output: path.join(f.h.dir, 'master.mp4'), ...render } };
}

test('project-lifecycle stages the only enabled render row on a saved copy and binds the output and media', async t => {
  const f = await flow(t, { flags: { clean: true, allowRenderCopy: true }, confirm: ({ message, state }) => {
    assert.equal(state.currentFile, state.projectId);
    assert.equal(state.queue.length, 2);
    assert.match(message, /compId 20/);
    assert.match(message, /\[201, 289\)/);
    assert.ok(message.includes(path.join(path.dirname(state.projectId), 'master.mp4')));
    return true;
  } });
  const input = renderInput(f, { startFrame: 151, endFrameExclusive: 239 });
  const result = await f.h.broker.run(await f.prepare(input));
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const [command] = f.h.broker.ledger.commands(), { after } = command;
  assert.equal(after.currentProject, f.destination);
  assert.equal(after.dirty, false);
  assert.equal(after.savedFileSha256, hash(fs.readFileSync(f.destination)));
  assert.deepEqual(fs.readFileSync(after.transition.checkpoint.path), original);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
  const { target, queue, media, output, scratchOutput } = after.renderJob;
  assert.deepEqual(target, { compId: 20, compName: 'Сборка 1', queueIndex: 3, frames: 88,
    width: 640, height: 400, fps: '30000/1001', audio: false, timeline: { startFrame: 50, frameCount: 720 },
    range: { startFrame: 201, endFrameExclusive: 289 } });
  assert.deepEqual(queue, [{ index: 1, name: 'Сборка 1', status: 'Unqueued' }, { index: 2, name: 'Архив', status: 'Done' },
    { index: 3, name: 'Сборка 1', status: 'Queued', compId: 20, format: 'H.264', frames: 720, startFrame: 50 }]);
  assert.equal(media.length, 1);
  assert.equal(media[0].path, f.h.state.media);
  assert.equal(media[0].sha256, hash(mediaBytes));
  assert.equal(output, input.render.output);
  assert.equal(scratchOutput, path.join(path.dirname(f.destination), 'core4-r1-scratch.mp4'));
  assert.ok(!fs.existsSync(output) && !fs.existsSync(scratchOutput));
  assert.equal(f.h.state.writes, 2);
  assert.equal(f.h.confirmations, 1);
});

test('project-lifecycle render-copy permission defaults to closed and existing output refuses before reservation', async t => {
  const legacy = await flow(t, { flags: { clean: true } });
  const rejected = await legacy.h.broker.run(await legacy.prepare(renderInput(legacy)));
  assert.equal(rejected.code, 'lifecycle_render_policy');
  assert.equal(fs.existsSync(path.dirname(legacy.destination)), false);
  assert.equal(legacy.h.confirmations, 0);
  const f = await flow(t, { flags: { clean: true, allowRenderCopy: true } });
  const input = renderInput(f);
  fs.writeFileSync(input.render.output, 'keep me');
  const occupied = await f.h.broker.run(await f.prepare(input));
  assert.equal(occupied.code, 'lifecycle_render_output');
  assert.equal(fs.readFileSync(input.render.output, 'utf8'), 'keep me');
  assert.equal(fs.existsSync(path.dirname(f.destination)), false);
  assert.equal(f.h.confirmations, 0);
});

test('project-lifecycle render-copy refuses unsupported media and changes during the local confirmation', async t => {
  const differentRate = await flow(t, { flags: { clean: true, allowRenderCopy: true } });
  const wrongRate = await differentRate.h.broker.run(await differentRate.prepare(renderInput(differentRate, { fps: '30/1' })));
  assert.equal(wrongRate.message, 'lifecycle_render_timeline');
  assert.equal(differentRate.h.state.writes, 0);
  for (const [flag, code] of [['sequence', 'lifecycle_render_media_kind'], ['missing', 'lifecycle_render_missing_media'], ['proxy', 'lifecycle_render_proxy']]) {
    const f = await flow(t, { flags: { clean: true, allowRenderCopy: true, [flag]: true } });
    const result = await f.h.broker.run(await f.prepare(renderInput(f)));
    assert.equal(result.code, 'executor_rejected');
    assert.equal(result.message, code);
    assert.equal(f.h.state.writes, 0);
    assert.equal(f.h.confirmations, 0);
  }
  const f = await flow(t, { flags: { clean: true, allowRenderCopy: true }, confirm: ({ state }) => {
    fs.appendFileSync(state.media, ' media changed');
    return true;
  } });
  const changed = await f.h.broker.run(await f.prepare(renderInput(f)));
  assert.equal(changed.code, 'executor_rejected');
  assert.equal(changed.message, 'stale_target');
  assert.equal(f.h.state.writes, 0);
  assert.equal(f.h.state.queue[0].render, true);
  assert.equal(f.h.confirmations, 1);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
});

test('project-lifecycle render-copy failure after Save As remains UNKNOWN and cannot replay', async t => {
  for (const [flag, writes, rows] of [['wrongCopyTarget', 1, 2], ['noTemplate', 1, 3], ['failCopySave', 2, 3]]) {
    const f = await flow(t, { flags: { clean: true, allowRenderCopy: true, [flag]: true } });
    const input = renderInput(f);
    const run = await f.prepare(input);
    const result = await f.h.broker.run(run);
    assert.equal(result.code, 'manual_effect_unknown', JSON.stringify(result));
    const [command] = f.h.broker.ledger.commands();
    assert.equal(command.state, 'UNKNOWN');
    const saved = path.join(f.h.installation.stateDir, 'project-save-checkpoints', command.checkpoint.ref + '.aep');
    assert.deepEqual(fs.readFileSync(saved), original);
    assert.deepEqual(fs.readFileSync(f.target.projectId), original);
    assert.equal(fs.existsSync(input.render.output), false);
    assert.equal(f.h.state.currentFile, f.destination);
    assert.equal(f.h.state.queue.length, rows);
    await assert.rejects(f.h.broker.run(run), /fresh_dryrun_required/);
    await assert.rejects(f.prepare(input), /controller_unresolved/);
    assert.equal(f.h.state.writes, writes);
  }
});

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

test('project-lifecycle explicit dirty Open confirms, preserves disk bytes and exposes the native dirty state', async t => {
  const f = await flow(t, { flags: { clean: true, dirtyAfterOpen: true }, confirm: ({ message }) => {
    assert.match(message, /отметит открытый проект как изменённый/);
    assert.match(message, /Открытие выполняется без сохранения/);
    return true;
  } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const input = { ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working), allowDirtyDestination: true };
  const result = await f.h.broker.run(await f.prepare(input));
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const [command] = f.h.broker.ledger.commands();
  assert.equal(command.physicalInput.allowDirtyDestination, true);
  assert.equal(command.after.dirty, true);
  assert.equal(result.outputs.transition.dirty, true);
  assert.equal(command.after.savedFileSha256, hash(working));
  const fresh = (await f.inspect({ ...f.target, projectId: destination })).snapshot;
  assert.equal(fresh.currentProject, destination);
  assert.equal(fresh.dirty, true);
  assert.equal(fresh.revision, command.after.revision);
  assert.equal(fresh.inventory, command.after.inventory);
  assert.equal(fresh.savedFileSha256, command.after.savedFileSha256);
  const checkpoint = command.after.transition.checkpoint.path;
  for (const [file, expected] of [[f.target.projectId, original], [checkpoint, original], [destination, working], [checkpoint.replace(/\.aep$/, '.open.aep'), working]]) {
    assert.deepEqual(fs.readFileSync(file), expected);
  }
  assert.equal(f.h.state.opens, 1);
  assert.equal(f.h.state.writes, 0);
});

test('project-lifecycle dirty Open defaults to the clean-destination gate', async t => {
  const f = await flow(t, { flags: { clean: true, dirtyAfterOpen: true }, confirm: ({ message }) => {
    assert.doesNotMatch(message, /отметит открытый проект как изменённый/);
    return true;
  } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const result = await f.h.broker.run(await f.prepare({ ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) }));
  assert.equal(result.code, 'lifecycle_open_destination_dirty');
  assert.equal(f.h.broker.ledger.commands()[0].state, 'UNKNOWN');
  assert.equal(f.h.peer.status().lastCommandOutcome.queue, 'fenced');
  assert.equal(f.h.state.opens, 1);
  assert.equal(f.h.state.writes, 0);
});

test('project-lifecycle dirty destination opt-in is exclusive to Open and still needs a clean source', async t => {
  const f = await flow(t);
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  await assert.rejects(f.prepare({ ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working), allowDirtyDestination: true }), /lifecycle_clean_source_required/);
  await assert.rejects(f.prepare({ ...f.target, action: 'save-as', destination: f.destination, allowDirtyDestination: true }), /lifecycle_dirty_destination_policy/);
  f.h.state.project.dirty = false;
  await assert.rejects(f.prepare({ ...f.target, action: 'create', destination: f.destination, allowDirtyDestination: false }), /lifecycle_dirty_destination_policy/);
  assert.equal(f.h.confirmations, 0);
  assert.equal(f.h.state.opens, 0);
  assert.equal(f.h.state.writes, 0);
});

test('project-lifecycle only Open receives the longer callback and Broker deadline', async t => {
  const options = { flags: { clean: true, holdMutationCallback: true }, callbackTimeout: 150, callerTimeout: 220,
    projectOpenTimeout: 1000, projectOpenTransportTimeout: 1200 };
  const f = await flow(t, options);
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const input = { ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) };
  const running = f.h.broker.run(await f.prepare(input));
  const deadline = Date.now() + 2000;
  while (!f.h.state.releaseMutationCallback && Date.now() < deadline) await pause(5);
  assert.equal(typeof f.h.state.releaseMutationCallback, 'function');
  await pause(250);
  assert.equal(f.h.peer.status().pending.stage, 'handed_to_poll');
  f.h.state.releaseMutationCallback();
  assert.equal((await running).state, 'succeeded');

  const ordinary = await flow(t, options);
  const result = await ordinary.h.broker.run(await ordinary.prepare());
  assert.equal(result.code, 'host_callback_timeout');
  assert.equal(ordinary.h.broker.ledger.commands()[0].state, 'UNKNOWN');
  assert.equal(ordinary.h.peer.status().pending, null);
});

test('project-lifecycle Open timeout keeps UNKNOWN when the original callback later arrives', async t => {
  const f = await flow(t, { flags: { clean: true, holdMutationCallback: true }, callbackTimeout: 150, callerTimeout: 220,
    projectOpenTimeout: 330, projectOpenTransportTimeout: 450 });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const input = { ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) };
  const run = await f.prepare(input);
  const result = await f.h.broker.run(run);
  assert.equal(result.code, 'host_callback_timeout');
  assert.equal(f.h.peer.status().lastCommandOutcome.queue, 'fenced');
  await assert.rejects(f.h.state.releaseMutationCallback(), /unknown_no_promotion/);
  await assert.rejects(f.prepare(input), /controller_unresolved/);
  assert.equal(f.h.broker.ledger.commands()[0].state, 'UNKNOWN');
  const records = fs.readFileSync(path.join(f.h.installation.stateDir, 'receiver', 'completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.filter(row => row.commandId === f.h.broker.ledger.commands()[0].commandId).map(row => row.type), ['begin', 'unknown']);
  assert.equal(f.h.state.opens, 1);
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

test('project-lifecycle records the destination checkpoint stage when native read throws before open', async t => {
  const f = await flow(t, { flags: { clean: true, throwDestinationCheckpointRead: true } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const input = { ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working) };
  const result = await f.h.broker.run(await f.prepare(input));
  const code = 'lifecycle_native_destination_checkpoint_error';
  assert.equal(result.code, 'executor_rejected');
  assert.equal(result.message, code);
  const [command] = f.h.broker.ledger.commands();
  assert.equal(command.state, 'rejected');
  assert.equal(f.h.peer.status().lastCommandOutcome.code, code);
  assert.equal(f.h.peer.status().lastCommandOutcome.queue, 'idle');
  assert.equal(f.h.confirmations, 1);
  assert.equal(f.h.state.opens, 0);
  assert.equal(f.h.state.currentFile, f.target.projectId);
  const checkpoint = path.join(f.h.state.stateDir, 'project-save-checkpoints', command.checkpoint.ref);
  assert.deepEqual(fs.readFileSync(checkpoint + '.aep'), original);
  assert.deepEqual(fs.readFileSync(checkpoint + '.open.aep'), working);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
  assert.deepEqual(fs.readFileSync(destination), working);
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
  const input = { ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working), allowDirtyDestination: true };
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
  const f = await flow(t, { flags: { clean: true, dirtyAfterOpen: true, diskChangedAfterOpen: true } });
  const destination = path.join(f.h.dir, 'Saved target.aep');
  fs.writeFileSync(destination, working);
  const result = await f.h.broker.run(await f.prepare({ ...f.target, action: 'open', destination, expectedDestinationSha256: hash(working), allowDirtyDestination: true }));
  assert.equal(result.code, 'lifecycle_disk_proof_unavailable');
  const outcome = f.h.peer.status().lastCommandOutcome;
  assert.equal(outcome.queue, 'fenced');
  assert.deepEqual(outcome.openObservation, { currentProject: destination, dirty: true, diskVerified: false });
  const [command] = f.h.broker.ledger.commands();
  assert.equal(command.state, 'UNKNOWN');
  const saved = path.join(f.h.installation.stateDir, 'project-save-checkpoints', command.checkpoint.ref);
  assert.deepEqual(fs.readFileSync(saved + '.aep'), original);
  assert.deepEqual(fs.readFileSync(saved + '.open.aep'), working);
  assert.equal(f.h.state.opens, 1);
});
