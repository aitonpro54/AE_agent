'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const original = Buffer.from('RIFX saved source');
const working = Buffer.from('RIFX edited source in memory');
const blank = Buffer.from('RIFX empty project');

function lifecycleEnvironment(state) {
  fs.writeFileSync(state.projectId, original);
  Object.assign(state, { currentFile: state.projectId, writes: 0, creates: 0, opens: 0 });
  class File {
    constructor(file) { this.fsName = path.normalize(file); }
    get exists() { return fs.existsSync(this.fsName); }
    get modified() { return new Date(Math.floor(fs.statSync(this.fsName).mtimeMs / 1000) * 1000); }
    get length() { return fs.statSync(this.fsName).size; }
    get parent() {
      const dir = path.dirname(this.fsName);
      return { exists: fs.existsSync(dir), getFiles: () => fs.readdirSync(dir) };
    }
    open(mode) { assert.equal(mode, 'r'); assert.equal(this.encoding, 'BINARY'); this.fd = fs.openSync(this.fsName, 'r'); return true; }
    seek(offset, mode) { assert.equal(mode, 0); this.offset = offset; return true; }
    read(count) {
      if (state.flags.throwDestinationCheckpointRead && this.fsName.endsWith('.open.aep')) {
        throw new Error('injected File.read failure at ' + this.fsName);
      }
      const buffer = Buffer.alloc(count), actual = fs.readSync(this.fd, buffer, 0, count, this.offset);
      this.offset += actual;
      return buffer.toString('latin1', 0, actual);
    }
    close() { fs.closeSync(this.fd); }
  }
  class CompItem {
    constructor(id = 20, name = 'Сборка') { this.id = id; this.name = name; this.numLayers = 2; }
  }
  const project = {
    get file() { return state.currentFile ? new File(state.currentFile) : null; },
    revision: 7, dirty: !state.flags.clean, renderQueue: { rendering: false }, numItems: state.flags.items || 1,
    item: index => new CompItem(19 + index, state.flags.wideInventory ? 'Сборка'.repeat(45) + index : 'Сборка ' + index),
    save(file) {
      state.writes++;
      fs.writeFileSync(file.fsName, this.numItems === 0 ? blank : working);
      state.currentFile = file.fsName;
      this.dirty = false;
      return !state.flags.uncertain;
    }
  };
  state.project = project;
  return { app: { project, newProject() {
    state.creates++;
    state.currentFile = null;
    Object.assign(project, { dirty: false, numItems: 0, revision: 1 });
    return project;
  }, open(file) {
    state.opens++;
    state.currentFile = file.fsName;
    Object.assign(project, { dirty: false, numItems: state.flags.afterOpenItems || 1, revision: 1 });
    if (state.flags.partialOpen) { project.dirty = true; throw new Error('injected failure after switch'); }
    if (state.flags.diskChangedAfterOpen) fs.writeFileSync(file.fsName, Buffer.alloc(working.length, 65));
    return project;
  } }, CompItem, File };
}

module.exports = { lifecycleEnvironment, original, working, blank };
