'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, bounded, parse, canonical, id, fail, sameDispatch } = require('../../core/receiver-api');
const { validateDisposition } = require('../../runtime/native-read-disposition');
// No automatic orphan/PID recovery. An abandoned owner permits proof reads only.
function openCompletionStore({ directory, io = fs, installationContext, ownerToken }) {
  if (!directory || !path.isAbsolute(directory)) fail('explicit_receiver_store_required');
  if (ownerToken !== undefined && (typeof ownerToken !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(ownerToken))) fail('receiver_owner_token');
  io.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'completions.ndjson'), ownerFile = path.join(directory, 'owner');
  let owner, ownerStat, closed = false, fault = false, events = [], identity;
  const ownerBytes = ownerToken === undefined ? Buffer.alloc(0) : Buffer.from(canonical({ version: 1, pid: process.pid, token: ownerToken }));
  const ownerFields = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
  const sameOwnerStat = (a, b) => ownerFields.every(k => String(a[k]) === String(b[k]));
  function checkOwner(file, fd) {
    const held = io.fstatSync(fd, { bigint: true }), named = io.lstatSync(file, { bigint: true });
    if (!held.isFile() || !named.isFile() || named.isSymbolicLink() || io.realpathSync(file) !== file || held.size !== BigInt(ownerBytes.length) || !sameOwnerStat(held, named)) fail('receiver_owner_changed');
    const bytes = Buffer.alloc(ownerBytes.length + 1); let offset = 0, count;
    while (offset < bytes.length && (count = io.readSync(fd, bytes, offset, bytes.length - offset, offset))) offset += count;
    if (offset !== ownerBytes.length || !bytes.subarray(0, offset).equals(ownerBytes) || !sameOwnerStat(held, io.fstatSync(fd, { bigint: true })) || !sameOwnerStat(held, io.lstatSync(file, { bigint: true }))) fail('receiver_owner_changed');
    return held;
  }
  const records = new Map();
  const isSettled = record => record.state === 'completed' || record.state === 'unknown' && !!record.terminalDisposition;
  try {
    if (ownerToken === undefined) owner = io.openSync(ownerFile, 'wx');
    else {
      const stage = ownerFile + '.stage-' + ownerToken;
      owner = io.openSync(stage, 'wx+');
      if (io.writeSync(owner, ownerBytes) !== ownerBytes.length) fail('receiver_owner_short_write');
      io.fsyncSync(owner); checkOwner(stage, owner);
      io.linkSync(stage, ownerFile); checkOwner(stage, owner); checkOwner(ownerFile, owner);
      io.unlinkSync(stage);
    }
    // Hardlink publication/unlink can change timestamps; pin the final inode.
    ownerStat = ownerToken === undefined ? io.fstatSync(owner, { bigint: true }) : checkOwner(ownerFile, owner);
  } catch (e) { if (owner !== undefined) { fault = true; closed = true; } else if (e.code === 'EEXIST') closed = true; else throw e; }
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
      const lines = data.slice(0, -1).split('\n');
      for (const line of lines) {
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
        } else if (event.type === 'terminal-read-failure-disposition') {
          const prior = records.get(event.commandId);
          if (!prior || prior.state !== 'unknown' || prior.terminalDisposition || !installationContext || Object.keys(installationContext).some(key => !['descriptorPath', 'cepDir'].includes(key))) fail('receiver_disposition_context');
          const semantic = validateDisposition(event, { ...installationContext, journalPrefixBytes: Buffer.from(lines.slice(0, 3).join('\n') + '\n') });
          if (canonical(prior.command) !== canonical(semantic.command) || canonical(prior.originalBinding) !== canonical(semantic.binding)) fail('receiver_disposition_binding');
          records.set(event.commandId, { ...prior, terminalDisposition: { version: 1, pins: semantic.pins, result: semantic.result } });
        } else fail('receiver_store_corrupt');
        events.push(event);
      }
    } else { identity = id('receiver-store'); append({ type: 'origin', identity }); }
    if ([...records.values()].some(r => !isSettled(r))) closed = true;
  } catch { fault = true; closed = true; }
  return Object.freeze({
    get identity() { return identity; },
    get closed() { return closed || fault; },
    get fault() { return fault; },
    has(commandId) { return records.has(commandId); },
    get(commandId) { if (fault) return undefined; const value = records.get(commandId); return value && JSON.parse(canonical(value)); },
    begin(command, originalBinding) {
      if (records.has(command.commandId)) fail('duplicate_command_no_replay');
      if (closed || fault || [...records.values()].some(r => !isSettled(r))) fail('receiver_lane_closed');
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
        let reader;
        try {
          if (!fault && [...records.values()].every(isSettled)) {
            const named = io.lstatSync(ownerFile, { bigint: true });
            if (!named.isFile() || named.isSymbolicLink() || io.realpathSync(ownerFile) !== ownerFile || !sameOwnerStat(ownerStat, named) || !sameOwnerStat(ownerStat, io.fstatSync(owner, { bigint: true }))) fail('receiver_owner_changed');
            reader = io.openSync(ownerFile, 'r');
            if (!sameOwnerStat(ownerStat, io.fstatSync(reader, { bigint: true }))) fail('receiver_owner_changed');
            const bytes = Buffer.alloc(ownerBytes.length + 1); let offset = 0, count;
            while (offset < bytes.length && (count = io.readSync(reader, bytes, offset, bytes.length - offset, offset))) offset += count;
            if (offset !== ownerBytes.length || !bytes.subarray(0, offset).equals(ownerBytes) || !sameOwnerStat(ownerStat, io.fstatSync(reader, { bigint: true })) || !sameOwnerStat(ownerStat, io.lstatSync(ownerFile, { bigint: true }))) fail('receiver_owner_changed');
            const closing = owner; owner = undefined; io.closeSync(closing);
            const after = checkOwner(ownerFile, reader);
            // Closing the published write FD may flush Windows hardlink ctime.
            // Pin that update only after exact content and stable inode checks.
            if (ownerFields.filter(k => k !== 'ctimeNs').some(k => String(ownerStat[k]) !== String(after[k]))) fail('receiver_owner_changed');
            ownerStat = after;
            const current = io.lstatSync(ownerFile, { bigint: true });
            if (current.isSymbolicLink() || io.realpathSync(ownerFile) !== ownerFile || !sameOwnerStat(ownerStat, current)) fail('receiver_owner_changed');
            io.unlinkSync(ownerFile);
          }
        } catch { fault = true; }
        finally {
          if (reader !== undefined) { try { io.closeSync(reader); } catch { fault = true; } }
          if (owner !== undefined) { const closing = owner; owner = undefined; try { io.closeSync(closing); } catch { fault = true; } }
        }
      }
    }
  });
}
module.exports = { openCompletionStore, sourceHash: hash(fs.readFileSync(__filename)) };
