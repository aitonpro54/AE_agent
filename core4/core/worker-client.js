'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { bounded, parse, MAX_FRAME, id, fail, exact, hash } = require('../protocol/json');
class WorkerClient {
  constructor({ timeout = 1500, runtime } = {}) { this.timeout = timeout; this.runtime = runtime; this.epoch = 0; this.pending = new Map(); this.imports = []; }
  start() {
    if (this.child) return;
    if (!this.runtime) fail('immutable_worker_runtime_required');
    for (const [file, digest] of Object.entries(this.runtime.hashes)) if (hash(fs.readFileSync(path.join(this.runtime.path, file))) !== digest) fail('immutable_runtime_integrity');
    this.epoch++; const epoch = this.epoch;
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'LANG'].filter(key => typeof process.env[key] === 'string').map(key => [key, process.env[key]]));
    this.environmentKeys = Object.keys(env);
    const child = spawn(process.execPath, [path.join(this.runtime.path, 'worker.js')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
    this.child = child; let buffer = '';
    child.stdout.on('data', data => {
      buffer += data.toString('utf8');
      if (Buffer.byteLength(buffer) > MAX_FRAME && !buffer.includes('\n')) return this.stop('worker_frame_too_large');
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try {
          const reply = parse(line); exact(reply, ['protocolVersion', 'requestId', 'workerEpoch', 'taskId', 'taskEpoch', 'result', 'error', 'loaded']);
          const p = this.pending.get(reply.requestId);
          if (!p || reply.workerEpoch !== epoch || reply.workerEpoch !== p.message.workerEpoch || reply.taskId !== p.message.taskId || reply.taskEpoch !== p.message.taskEpoch || reply.protocolVersion !== 1) { this.lateReplies = (this.lateReplies || 0) + 1; continue; }
          clearTimeout(p.timer); this.pending.delete(reply.requestId); this.imports = reply.loaded || this.imports;
          if (reply.error) p.reject(Object.assign(new Error(reply.error.message), { code: reply.error.code })); else p.resolve(reply.result);
        } catch (e) { this.stop(e.code || 'malformed_worker_ipc'); return; }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => { if (this.child === child) this.stop('worker_exit'); });
    child.on('exit', () => { if (this.child === child) this.stop('worker_exit'); });
  }
  request({ taskId, taskEpoch, method, componentPins, payload }) {
    if (this.pending.size >= 32) fail('worker_backpressure'); this.start();
    const message = { protocolVersion: 1, requestId: id('job'), workerEpoch: this.epoch, taskId, taskEpoch, method, componentPins, payload };
    const line = bounded(message) + '\n';
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop('worker_timeout'), this.timeout);
      this.pending.set(message.requestId, { message, resolve, reject, timer });
      this.child.stdin.write(line, error => { if (error) this.stop('worker_write_failed'); });
    });
  }
  resetTask(taskId, epoch) {
    for (const [key, p] of this.pending) if (p.message.taskId === taskId && p.message.taskEpoch < epoch) { clearTimeout(p.timer); p.reject(Object.assign(new Error('task_reset'), { code: 'stale_task_epoch' })); this.pending.delete(key); }
  }
  stop(code = 'worker_recycled') {
    const child = this.child; this.child = null;
    if (child) { child.stdin.destroy(); child.kill(); }
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Object.assign(new Error(code), { code })); }
    this.pending.clear();
  }
  status() { return { pid: this.child?.pid || null, epoch: this.epoch, pending: this.pending.size, loaded: this.imports, lateReplies: this.lateReplies || 0 }; }
}
module.exports = { WorkerClient };
