'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, bounded, parse, canonical, id, fail, sameDispatch } = require('../../core/receiver-api');
// No automatic orphan/PID recovery. An abandoned owner permits proof reads only.
function openCompletionStore({ directory, io = fs }) {
  if (!directory || !path.isAbsolute(directory)) fail('explicit_receiver_store_required');
  io.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'completions.ndjson'), ownerFile = path.join(directory, 'owner');
  let owner, closed = false, fault = false, events = [], identity;
  const records = new Map();
  try { owner = io.openSync(ownerFile, 'wx'); } catch (e) { if (e.code !== 'EEXIST') throw e; closed = true; }
  function append(event) {
    if (closed || fault || owner === undefined) fail('receiver_lane_closed');
    const body = { ...event, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' };
    const record = { ...body, recordHash: hash(body) }, line = bounded(record) + '\n';
    let fd;
    try {
      fd = io.openSync(file, 'a');
      if (io.writeSync(fd, line) !== Buffer.byteLength(line)) fail('receiver_short_write');
      io.fsyncSync(fd); io.closeSync(fd); fd = undefined;
    } catch (e) { fault = true; closed = true; throw e; }
    finally { if (fd !== undefined) { try { io.closeSync(fd); } catch { fault = true; closed = true; } } }
    events.push(record); return record;
  }
  try {
    if (io.existsSync(file)) {
      const data = io.readFileSync(file, 'utf8');
      if (!data || !data.endsWith('\n')) fail('receiver_store_corrupt');
      for (const line of data.trimEnd().split('\n')) {
        const event = parse(line), { recordHash, ...body } = event;
        if (event.seq !== events.length + 1 || event.previousHash !== (events.at(-1)?.recordHash || 'origin') || recordHash !== hash(body)) fail('receiver_store_corrupt');
        if (!events.length) { if (event.type !== 'origin' || typeof event.identity !== 'string') fail('receiver_store_corrupt'); identity = event.identity; }
        else if (event.type === 'begin') {
          if (records.has(event.commandId) || event.originalBinding.receiverStoreIdentity !== identity || !sameDispatch(event.originalBinding, event.originalBinding) || event.commandDigest !== hash(event.command)) fail('receiver_store_corrupt');
          records.set(event.commandId, { state: 'ongoing', command: event.command, originalBinding: event.originalBinding });
        } else if (event.type === 'complete' || event.type === 'unknown') {
          const prior = records.get(event.commandId);
          if (!prior || prior.state !== 'ongoing') fail('receiver_store_corrupt');
          records.set(event.commandId, { ...prior, state: event.type === 'complete' ? 'completed' : 'unknown', ...(event.response ? { response: event.response } : {}) });
        } else fail('receiver_store_corrupt');
        events.push(event);
      }
    } else { identity = id('receiver-store'); append({ type: 'origin', identity }); }
    if ([...records.values()].some(r => r.state !== 'completed')) closed = true;
  } catch { fault = true; closed = true; }
  return Object.freeze({
    get identity() { return identity; },
    get closed() { return closed || fault; },
    get fault() { return fault; },
    has(commandId) { return records.has(commandId); },
    get(commandId) { if (fault) return undefined; const value = records.get(commandId); return value && JSON.parse(canonical(value)); },
    begin(command, originalBinding) {
      if (records.has(command.commandId)) fail('duplicate_command_no_replay');
      if (closed || fault || [...records.values()].some(r => r.state !== 'completed')) fail('receiver_lane_closed');
      if (!sameDispatch(originalBinding, originalBinding) || originalBinding.receiverStoreIdentity !== identity) fail('receiver_store_binding');
      append({ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding });
      records.set(command.commandId, { state: 'ongoing', command: JSON.parse(canonical(command)), originalBinding });
    },
    complete(commandId, response) {
      const record = records.get(commandId); if (!record || record.state !== 'ongoing') fail('receiver_completion_order');
      append({ type: 'complete', commandId, response });
      records.set(commandId, { ...record, state: 'completed', response: JSON.parse(canonical(response)) });
    },
    unknown(commandId) {
      const record = records.get(commandId);
      if (record?.state === 'ongoing' && !fault && !closed) {
        try { append({ type: 'unknown', commandId }); records.set(commandId, { ...record, state: 'unknown' }); } finally { closed = true; }
      }
    },
    close() {
      closed = true;
      // Retain the owner marker whenever physical lifetime or durability is ambiguous.
      if (owner !== undefined) {
        io.closeSync(owner); owner = undefined;
        if (!fault && [...records.values()].every(r => r.state === 'completed')) io.unlinkSync(ownerFile);
      }
    }
  });
}
module.exports = { openCompletionStore, sourceHash: hash(fs.readFileSync(__filename)) };
