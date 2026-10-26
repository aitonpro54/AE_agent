'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { bounded, parse, fail, hash } = require('../protocol/json');
class Ledger {
  constructor(file) {
    this.file = file; this.events = []; fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      // A torn final record is never discarded: diagnostic startup only, mutations fail closed.
      this.corrupt = data.length > 0 && !data.endsWith('\n');
      for (const line of data.split('\n').filter(Boolean)) {
        try {
          const event = parse(line), { recordHash, ...body } = event;
          if (event.seq !== this.events.length + 1 || event.previousHash !== (this.events.at(-1)?.recordHash || 'origin') || recordHash !== hash(body)) this.corrupt = true;
          this.events.push(event);
        } catch { this.corrupt = true; }
      }
    }
  }
  append(event) {
    if (this.writeGuard && !this.writeGuard()) fail('broker_closed');
    if (this.ownerFault) fail(this.ownerFault);
    if (this.corrupt) fail('ledger_corrupt');
    const body = { ...event, seq: this.events.length + 1, previousHash: this.events.at(-1)?.recordHash || 'origin' };
    const line = bounded({ ...body, recordHash: hash(body) }) + '\n';
    let fd;
    try {
      fd = fs.openSync(this.file, 'a');
      if (fs.writeSync(fd, line) !== Buffer.byteLength(line)) fail('ledger_short_write');
      fs.fsyncSync(fd);
    } catch (e) { this.corrupt = true; throw e; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) { this.corrupt = true; throw e; } } }
    this.events.push(JSON.parse(line)); return this.events.at(-1);
  }
  task(taskId) {
    let task = { taskId, epoch: 0, reset: false };
    for (const e of this.events) if (e.taskId === taskId && e.type === 'task') task = { taskId, epoch: e.epoch, reset: e.reset };
    return task;
  }
  commands(taskId) {
    const map = new Map();
    for (const e of this.events) {
      if (e.type === 'intent') map.set(e.commandId, { ...e, state: 'UNKNOWN' });
      if (e.type === 'command' && map.has(e.commandId)) Object.assign(map.get(e.commandId), e);
    }
    return [...map.values()].filter(c => !taskId || c.taskId === taskId);
  }
  unresolved() { return this.commands().filter(c => !['succeeded', 'rejected'].includes(c.state)); }
  workflow(workflowId) { return this.events.filter(e => e.type === 'engine' && e.workflowId === workflowId).map(e => e.event); }
}
module.exports = { Ledger };
