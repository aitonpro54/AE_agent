'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const original = Buffer.from('RIFX saved source');
const working = Buffer.from('RIFX edited source in memory');
const blank = Buffer.from('RIFX empty project');
const mediaBytes = Buffer.from('fixture media');

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
      return { fsName: dir, exists: fs.existsSync(dir), getFiles: () => fs.readdirSync(dir) };
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
    constructor(id = 20, name = 'Сборка') {
      Object.assign(this, { id, name, numLayers: 2, width: 640, height: 400, duration: 24.024024024024,
        frameDuration: 0.03336670003337, displayStartFrame: 50, useProxy: false, hasAudio: false });
    }
  }
  class FileSource { constructor(file) { this.file = file; this.isStill = !state.flags.sequence; } }
  class SolidSource {}
  class FootageItem {
    constructor(file) {
      Object.assign(this, { id: 42, name: 'Media', file, footageMissing: !!state.flags.missing,
        useProxy: false, mainSource: new FileSource(file), proxySource: state.flags.proxy ? {} : null });
    }
  }
  const RQItemStatus = { QUEUED: 1, UNQUEUED: 2, NEEDS_OUTPUT: 3, DONE: 4, RENDERING: 5, USER_STOPPED: 6, ERR_STOPPED: 7 };
  const comp = new CompItem(20, 'Сборка 1'), rows = [];
  const assertCopy = () => assert.notEqual(state.currentFile, state.projectId, 'queue writes must target a different AEP');
  function queueItem(comp, status) {
    const om = { templates: state.flags.noTemplate ? [] : ['H.264 - Match Render Settings - 15 Mbps'],
      applyTemplate() { assertCopy(); }, getSettings() { return { Format: 'H.264', 'Output Audio': 'On (if comp has audio)' }; } };
    let render = status === RQItemStatus.QUEUED;
    return { comp, status, templates: ['Best Settings'], numOutputModules: 1, outputModule: () => om,
      applyTemplate() { assertCopy(); }, get render() { return render; },
      set render(value) { assertCopy(); render = value; this.status = value ? RQItemStatus.QUEUED : RQItemStatus.UNQUEUED; }
    };
  }
  if (state.flags.allowRenderCopy) {
    state.media = path.join(path.dirname(state.projectId), 'still.png');
    fs.writeFileSync(state.media, mediaBytes);
    rows.push(queueItem(comp, RQItemStatus.QUEUED), queueItem(new CompItem(21, 'Архив'), RQItemStatus.DONE));
    state.queue = rows;
  }
  const project = {
    get file() { return state.currentFile ? new File(state.currentFile) : null; },
    revision: 7, dirty: !state.flags.clean, renderQueue: { rendering: false, get numItems() { return rows.length; },
      item: index => rows[index - 1], items: { add(comp) {
        assertCopy();
        const row = queueItem(comp, RQItemStatus.UNQUEUED);
        rows.push(row);
        return row;
      } }, render() { assert.fail('stage must not start a render'); } },
    numItems: state.flags.allowRenderCopy ? 3 : state.flags.items || 1,
    item: index => state.flags.allowRenderCopy ? index === 1 ? comp : index === 2 ? rows[1].comp : new FootageItem(new File(state.media)) :
      new CompItem(19 + index, state.flags.wideInventory ? 'Сборка'.repeat(45) + index : 'Сборка ' + index),
    itemByID: id => id === comp.id ? comp : null,
    save(file) {
      state.writes++;
      if (!file) {
        assertCopy();
        if (state.flags.failCopySave) return false;
        file = this.file;
      }
      fs.writeFileSync(file.fsName, this.numItems === 0 ? blank : working);
      state.currentFile = file.fsName;
      this.dirty = false;
      if (state.flags.wrongCopyTarget) comp.width += 2;
      return !state.flags.uncertain;
    }
  };
  state.project = project;
  return { app: { project, beginUndoGroup: assertCopy, endUndoGroup: assertCopy, newProject() {
    state.creates++;
    state.currentFile = null;
    Object.assign(project, { dirty: false, numItems: 0, revision: 1 });
    return project;
  }, open(file) {
    state.opens++;
    state.currentFile = file.fsName;
    Object.assign(project, { dirty: state.flags.dirtyAfterOpen === true, numItems: state.flags.afterOpenItems || 1, revision: 1 });
    if (state.flags.partialOpen) { project.dirty = true; throw new Error('injected failure after switch'); }
    if (state.flags.diskChangedAfterOpen) fs.writeFileSync(file.fsName, Buffer.alloc(working.length, 65));
    return project;
  } }, CompItem, FootageItem, FileSource, SolidSource, File, RQItemStatus, GetSettingsFormat: { STRING: 1 }, PostRenderAction: { NONE: 0 } };
}

module.exports = { lifecycleEnvironment, original, working, blank, mediaBytes };
