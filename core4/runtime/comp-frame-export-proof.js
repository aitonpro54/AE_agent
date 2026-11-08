'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonical, fail } = require('../protocol/json');
const { plainPath, samePath } = require('./project-save-proof');
const { inspectPngBuffer, DEFAULT_MAX_PNG_BYTES } = require('./png-proof');

function output(input) {
  if (!path.isAbsolute(input.projectId) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.png$/.test(input.fileName) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(input.fileName)) fail('frame_export_filename');
  const file = path.join(path.dirname(input.projectId), 'frames-output', input.fileName);
  plainPath(path.dirname(file), true);
  return file;
}

function readPng(file, expectedBytes) {
  const { resolved, info } = plainPath(file);
  if (info.size !== BigInt(expectedBytes) || info.size < 1n || info.size > BigInt(DEFAULT_MAX_PNG_BYTES)) fail('frame_export_png_size');
  const assertSame = current => {
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].some(key => current[key] !== info[key])) fail('frame_export_png_changed');
  };
  const fd = fs.openSync(resolved, 'r');
  try {
    assertSame(fs.fstatSync(fd, { bigint: true }));
    const bytes = Buffer.allocUnsafe(expectedBytes);
    for (let offset = 0; offset < bytes.length;) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) fail('frame_export_png_size');
      offset += count;
    }
    assertSame(fs.fstatSync(fd, { bigint: true }));
    assertSame(plainPath(file).info);
    return inspectPngBuffer(bytes);
  } finally { fs.closeSync(fd); }
}

const proof = {
  beforeReservation({ input }) {
    if (fs.lstatSync(output(input), { throwIfNoEntry: false })) fail('frame_export_exists');
  }
};

function validateResult({ input, before }, after) {
  const { output: written, ...snapshot } = after;
  const file = output(input);
  if (canonical(snapshot) !== canonical(before) || !written || typeof written.file !== 'string' || !samePath(path.normalize(written.file), file) ||
      written.frame !== input.frame || !Number.isSafeInteger(written.bytes) || written.bytes < 1) fail('frame_export_result');
  const png = readPng(file, written.bytes);
  if (!png.complete || png.width !== before.width || png.height !== before.height) fail('frame_export_png');
}

module.exports = { proof, validateResult };
