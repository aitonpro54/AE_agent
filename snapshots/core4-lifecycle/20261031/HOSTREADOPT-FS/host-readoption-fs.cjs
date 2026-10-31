'use strict';

// Bounded, builtins-only Windows filesystem observation for host-readoption.
// All payloads and directories are self-created under os.tmpdir(); only this
// script and its sanitized JSON report are retained in the repository.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const outputPath = path.join(__dirname, 'report.json');
const fields = ['dev', 'ino', 'mode', 'nlink', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const toPlain = (stat) => Object.fromEntries(fields.map((key) => [key, String(stat[key])]));
const sameIdentity = (a, b) => String(a.dev) === String(b.dev) && String(a.ino) === String(b.ino);
const read = (p) => fs.readFileSync(p, 'utf8');

function makeCase(label, recentlyFreedName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-readoption-fs-'));
  const oldPath = path.join(dir, 'target.bin');
  const archivePath = path.join(dir, 'old-archive.bin');
  const anchorPath = path.join(dir, 'new-anchor.bin');
  const stagePath = path.join(dir, 'replacement-stage.bin');
  const observations = [];
  const previousByName = new Map();
  const aliasMap = (stageAlias) => ({
    oldOriginal: fs.existsSync(oldPath) && sameIdentity(fs.statSync(oldPath, { bigint: true }), fs.statSync(archivePath, { bigint: true }))
      ? ['target', 'oldArchive'] : (fs.existsSync(archivePath) ? ['oldArchive'] : []),
    replacement: [
      ...(fs.existsSync(anchorPath) ? ['newAnchor'] : []),
      ...(fs.existsSync(stagePath) ? [stageAlias] : []),
      ...(fs.existsSync(oldPath) && fs.existsSync(anchorPath) && sameIdentity(fs.statSync(oldPath, { bigint: true }), fs.statSync(anchorPath, { bigint: true })) ? ['target'] : []),
    ],
  });
  const take = (point, entries, aliases) => {
    const stamps = Object.fromEntries(Object.entries(entries).map(([name, source]) => [
      name,
      source && source.kind === 'fd'
        ? toPlain(fs.fstatSync(source.fd, { bigint: true }))
        : (source ? toPlain(fs.statSync(source.path, { bigint: true })) : null),
    ]));
    const deltas = {};
    for (const [name, stamp] of Object.entries(stamps)) {
      const prior = previousByName.get(name);
      if (stamp && prior) deltas[name] = Object.fromEntries(fields.map((field) => [field, { from: prior[field], to: stamp[field], changed: prior[field] !== stamp[field] }]));
      if (stamp) previousByName.set(name, stamp);
    }
    observations.push({ point, aliases, stamps, deltas });
  };

  fs.writeFileSync(oldPath, 'OLD-ORIGINAL\n', { flag: 'wx' });
  const oldReadFd = fs.openSync(oldPath, 'r');
  take('old-initial', { oldPath: { path: oldPath }, oldRetainedReadFd: { kind: 'fd', fd: oldReadFd } }, { target: ['oldOriginal'], oldArchive: [], replacement: [] });

  fs.linkSync(oldPath, archivePath);
  take('old-linked-to-archive', { target: { path: oldPath }, oldArchive: { path: archivePath }, oldRetainedReadFd: { kind: 'fd', fd: oldReadFd } }, { target: ['oldOriginal'], oldArchive: ['oldOriginal'], replacement: [] });

  fs.writeFileSync(anchorPath, 'NEW-IMMUTABLE-ANCHOR\n', { flag: 'wx' });
  const anchorReadFd = fs.openSync(anchorPath, 'r');
  take('new-anchor-initial', { newAnchor: { path: anchorPath }, newAnchorRetainedReadFd: { kind: 'fd', fd: anchorReadFd } }, { target: ['oldOriginal'], oldArchive: ['oldOriginal'], newAnchor: ['replacement'], replacement: ['newAnchor'] });

  fs.linkSync(anchorPath, stagePath);
  take('anchor-linked-to-stage', { newAnchor: { path: anchorPath }, stage: { path: stagePath }, newAnchorRetainedReadFd: { kind: 'fd', fd: anchorReadFd } }, { target: ['oldOriginal'], oldArchive: ['oldOriginal'], replacement: ['newAnchor', 'stage'] });

  const operations = [];
  if (!recentlyFreedName) {
    try {
      fs.renameSync(stagePath, oldPath);
      operations.push({ operation: 'rename-over-existing-while-old-read-fd-open', result: 'success' });
    } catch (error) {
      operations.push({ operation: 'rename-over-existing-while-old-read-fd-open', result: 'error', code: error.code, name: error.name });
    }
    take('after-rename-attempt-with-old-read-fd-open', {
      target: { path: oldPath }, oldArchive: { path: archivePath }, newAnchor: { path: anchorPath },
      stageName: fs.existsSync(stagePath) ? { path: stagePath } : null,
      oldRetainedReadFd: { kind: 'fd', fd: oldReadFd }, newAnchorRetainedReadFd: { kind: 'fd', fd: anchorReadFd },
    }, { target: ['oldOriginal'], oldArchive: ['oldOriginal'], replacement: ['newAnchor', 'stage'] });
  }

  fs.closeSync(oldReadFd);
  take('after-old-read-fd-close-before-name-release-or-rename', {
    target: { path: oldPath }, oldArchive: { path: archivePath }, newAnchor: { path: anchorPath }, stage: { path: stagePath },
    newAnchorRetainedReadFd: { kind: 'fd', fd: anchorReadFd },
  }, { target: ['oldOriginal'], oldArchive: ['oldOriginal'], replacement: ['newAnchor', 'stage'] });
  if (recentlyFreedName) {
    fs.unlinkSync(oldPath);
    operations.push({ operation: 'unlink-target-before-rename', result: 'success' });
    take('after-target-unlink-before-rename', { oldArchive: { path: archivePath }, newAnchor: { path: anchorPath }, stage: { path: stagePath }, newAnchorRetainedReadFd: { kind: 'fd', fd: anchorReadFd } }, { target: [], oldArchive: ['oldOriginal'], replacement: ['newAnchor', 'stage'] });
  }
  if (fs.existsSync(stagePath)) {
    fs.renameSync(stagePath, oldPath);
    operations.push({ operation: recentlyFreedName ? 'rename-into-recently-freed-target' : 'rename-over-existing-after-old-read-fd-close', result: 'success' });
  }
  take(recentlyFreedName ? 'stage-renamed-into-recently-freed-target' : 'stage-renamed-over-existing-target', {
    target: { path: oldPath }, oldArchive: { path: archivePath }, newAnchor: { path: anchorPath },
    stageName: fs.existsSync(stagePath) ? { path: stagePath } : null,
    newAnchorRetainedReadFd: { kind: 'fd', fd: anchorReadFd },
  }, { target: ['replacement'], oldArchive: ['oldOriginal'], newAnchor: ['replacement'], stage: [] });

  fs.closeSync(anchorReadFd);
  take('after-anchor-read-fd-close', { target: { path: oldPath }, oldArchive: { path: archivePath }, newAnchor: { path: anchorPath } }, { target: ['replacement'], oldArchive: ['oldOriginal'], newAnchor: ['replacement'] });

  const targetFresh = fs.openSync(oldPath, 'r');
  const archiveFresh = fs.openSync(archivePath, 'r');
  const anchorFresh = fs.openSync(anchorPath, 'r');
  const freshBytes = { target: read(oldPath), oldArchive: read(archivePath), newAnchor: read(anchorPath) };
  take('fresh-read-target-archive-anchor', {
    targetPath: { path: oldPath }, oldArchivePath: { path: archivePath }, newAnchorPath: { path: anchorPath },
    targetFreshReadFd: { kind: 'fd', fd: targetFresh }, archiveFreshReadFd: { kind: 'fd', fd: archiveFresh }, anchorFreshReadFd: { kind: 'fd', fd: anchorFresh },
  }, { target: ['replacement'], oldArchive: ['oldOriginal'], newAnchor: ['replacement'] });
  fs.closeSync(targetFresh); fs.closeSync(archiveFresh); fs.closeSync(anchorFresh);

  const named = (point) => observations.find((item) => item.point === point);
  const oldInit = named('old-initial').stamps.oldPath;
  const archived = named('old-linked-to-archive').stamps.oldArchive;
  const anchorInit = named('new-anchor-initial').stamps.newAnchor;
  const targetFinal = named('fresh-read-target-archive-anchor').stamps.targetPath;
  const archiveFinal = named('fresh-read-target-archive-anchor').stamps.oldArchivePath;
  const anchorFinal = named('fresh-read-target-archive-anchor').stamps.newAnchorPath;
  const expectedNlinks = recentlyFreedName
    ? { initial: { old: 1 }, afterOldLink: { old: 2 }, afterAnchorLink: { old: 2, replacement: 2 }, afterRename: { old: 1, replacement: 2 }, afterClose: { old: 1, replacement: 2 } }
    : { initial: { old: 1 }, afterOldLink: { old: 2 }, afterAnchorLink: { old: 2, replacement: 2 }, afterRename: { old: 1, replacement: 2 }, afterClose: { old: 1, replacement: 2 } };
  const checks = {
    targetHasNewBytes: freshBytes.target === 'NEW-IMMUTABLE-ANCHOR\n',
    archiveHasOldBytes: freshBytes.oldArchive === 'OLD-ORIGINAL\n',
    anchorBytesUnchanged: freshBytes.newAnchor === 'NEW-IMMUTABLE-ANCHOR\n',
    targetAndAnchorSameIdentity: sameIdentity(targetFinal, anchorFinal),
    archiveRetainsOldInitialIdentity: sameIdentity(oldInit, archiveFinal) && sameIdentity(oldInit, archived),
    targetDiffersFromOldIdentity: !sameIdentity(targetFinal, oldInit),
    expectedNlinkSequenceObserved: observations[0].stamps.oldPath.nlink === '1'
      && named('old-linked-to-archive').stamps.target.nlink === '2'
      && named('anchor-linked-to-stage').stamps.newAnchor.nlink === '2'
      && named(recentlyFreedName ? 'stage-renamed-into-recently-freed-target' : 'stage-renamed-over-existing-target').stamps.target.nlink === '2'
      && named(recentlyFreedName ? 'stage-renamed-into-recently-freed-target' : 'stage-renamed-over-existing-target').stamps.oldArchive.nlink === '1',
  };
  return { label, recentlyFreedName, operations, observations, expectedNlinks, freshBytes, checks, pass: Object.values(checks).every(Boolean) };
}

function makePriorAnchorCase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-readoption-fs-'));
  const target = path.join(dir, 'target.bin');
  const priorAnchor = path.join(dir, 'prior-anchor.bin');
  const archive = path.join(dir, 'old-archive.bin');
  const newAnchor = path.join(dir, 'new-anchor.bin');
  const stage = path.join(dir, 'replacement-stage.bin');
  const observations = [];
  const previousByName = new Map();
  const take = (point, entries, aliases) => {
    const stamps = Object.fromEntries(Object.entries(entries).map(([name, source]) => [
      name, source.kind === 'fd' ? toPlain(fs.fstatSync(source.fd, { bigint: true })) : toPlain(fs.statSync(source.path, { bigint: true })),
    ]));
    const deltas = {};
    for (const [name, stamp] of Object.entries(stamps)) {
      const prior = previousByName.get(name);
      if (prior) deltas[name] = Object.fromEntries(fields.map((field) => [field, { from: prior[field], to: stamp[field], changed: prior[field] !== stamp[field] }]));
      previousByName.set(name, stamp);
    }
    observations.push({ point, aliases, stamps, deltas });
  };
  fs.writeFileSync(target, 'OLD-PRIOR-ANCHOR\n', { flag: 'wx' });
  fs.linkSync(target, priorAnchor);
  const oldFd = fs.openSync(target, 'r');
  take('old-target-with-prior-anchor-initial', { target: { path: target }, priorAnchor: { path: priorAnchor }, oldRetainedReadFd: { kind: 'fd', fd: oldFd } }, { oldOriginal: ['target', 'priorAnchor'] });
  fs.linkSync(target, archive);
  take('third-old-alias-added', { target: { path: target }, priorAnchor: { path: priorAnchor }, archive: { path: archive }, oldRetainedReadFd: { kind: 'fd', fd: oldFd } }, { oldOriginal: ['target', 'priorAnchor', 'archive'] });
  fs.writeFileSync(newAnchor, 'NEW-PRIOR-ANCHOR-CASE\n', { flag: 'wx' });
  const newFd = fs.openSync(newAnchor, 'r');
  fs.linkSync(newAnchor, stage);
  take('replacement-stage-linked', { oldTarget: { path: target }, priorAnchor: { path: priorAnchor }, archive: { path: archive }, newAnchor: { path: newAnchor }, stage: { path: stage }, oldRetainedReadFd: { kind: 'fd', fd: oldFd }, newAnchorRetainedReadFd: { kind: 'fd', fd: newFd } }, { oldOriginal: ['target', 'priorAnchor', 'archive'], replacement: ['newAnchor', 'stage'] });
  fs.closeSync(oldFd);
  fs.renameSync(stage, target);
  take('replacement-renamed-over-existing-target', { target: { path: target }, priorAnchor: { path: priorAnchor }, archive: { path: archive }, newAnchor: { path: newAnchor }, newRetainedReadFd: { kind: 'fd', fd: newFd } }, { oldOriginal: ['priorAnchor', 'archive'], replacement: ['target', 'newAnchor'] });
  fs.closeSync(newFd);
  take('after-read-fd-close', { target: { path: target }, priorAnchor: { path: priorAnchor }, archive: { path: archive }, newAnchor: { path: newAnchor } }, { oldOriginal: ['priorAnchor', 'archive'], replacement: ['target', 'newAnchor'] });
  const bytes = { target: read(target), priorAnchor: read(priorAnchor), archive: read(archive), newAnchor: read(newAnchor) };
  const initial = observations[0].stamps.target;
  const afterThirdLink = observations[1].stamps.target;
  const afterReplace = observations[3].stamps.priorAnchor;
  const checks = {
    oldIdentityNlinkIs2Then3Then2: initial.nlink === '2' && afterThirdLink.nlink === '3' && afterReplace.nlink === '2',
    priorAnchorAndArchiveRetainOldIdentity: sameIdentity(initial, observations[3].stamps.archive) && sameIdentity(initial, afterReplace),
    targetAndNewAnchorShareReplacementIdentity: sameIdentity(observations[3].stamps.target, observations[4].stamps.newAnchor),
    targetAndNewAnchorBytesUnchanged: bytes.target === 'NEW-PRIOR-ANCHOR-CASE\n' && bytes.newAnchor === bytes.target,
    oldAliasesRetainOriginalBytes: bytes.priorAnchor === 'OLD-PRIOR-ANCHOR\n' && bytes.archive === bytes.priorAnchor,
    replacementNlinkIs2: observations[3].stamps.target.nlink === '2',
  };
  return {
    label: 'replace-existing-target-with-prior-old-anchor',
    priorAnchorAlreadyPresent: true,
    operations: [{ operation: 'hardlink-old-target-to-prior-anchor', result: 'success' }, { operation: 'hardlink-old-target-to-archive', result: 'success' }, { operation: 'close-retained-old-read-fd', result: 'success' }, { operation: 'rename-stage-over-existing-target', result: 'success' }],
    expectedNlinks: { oldOriginal: { initialTargetAndPriorAnchor: 2, afterArchiveAliasAdded: 3, afterTargetReplacement: 2 }, replacement: { afterStageLink: 2, afterRename: 2 } },
    observations, bytes, checks, pass: Object.values(checks).every(Boolean),
  };
}

let report;
try {
  const statfs = fs.statfsSync(os.tmpdir(), { bigint: true });
  const cases = [makeCase('replace-existing-target', false), makeCase('rename-into-recently-freed-target', true), makePriorAnchorCase()];
  const pass = cases.every((item) => item.pass);
  report = {
    schema: 'host-readoption-fs-observation/v1',
    recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check', context: 'host-readoption filesystem semantics; self-created tiny files only' },
    environment: {
      platform: process.platform, release: os.release(), arch: process.arch, node: process.version,
      filesystemObservation: { source: 'fs.statfsSync(os.tmpdir())', type: String(statfs.type), bsize: String(statfs.bsize), blocks: String(statfs.blocks), note: 'Windows Node statfs type value retained verbatim; no external filesystem-identification tool used.' },
      tempLocationDisclosure: 'One or more fresh os.mkdtempSync directories under os.tmpdir(); absolute paths intentionally omitted.',
    },
    cases,
    conclusion: pass ? 'PASS: observed hardlink/rename identity, alias nlink, retained-read-FD behavior, and bytes matched assertions in all bounded cases.' : 'REFUSAL: one or more explicit filesystem assertions failed; inspect collected stamps and checks.',
    limits: [
      'Single Windows host, volume, Node build, and short run; this is not cross-machine portability evidence.',
      'Only tiny regular files and built-in Node fs calls were exercised; no directory replacement, crash/power-loss, concurrent writers, ACLs, antivirus filters, network filesystems, or Core lifecycle code.',
      'Timestamps are collected as reported by Node/Windows; no normalization or inference beyond exact recorded fields.',
      'No installed runtime, project, After Effects, MCP, process control, or user data was accessed or changed.',
    ],
  };
} catch (error) {
  report = {
    schema: 'host-readoption-fs-observation/v1',
    recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check', context: 'host-readoption filesystem semantics; self-created tiny files only' },
    environment: { platform: process.platform, node: process.version, arch: process.arch },
    conclusion: 'REFUSAL: experiment aborted before a complete set of observations.',
    error: { name: error && error.name, code: error && error.code, message: error && error.message },
    limits: ['Partial temp files may remain under os.tmpdir(); paths are intentionally omitted from the report.'],
  };
}

const json = `${JSON.stringify(report, null, 2)}\n`;
try {
  fs.writeFileSync(outputPath, json, { encoding: 'utf8', flag: 'wx' });
} catch (error) {
  process.stderr.write(`Unable to create report.json with wx (${error.code || error.name}).\n`);
  process.exitCode = 2;
}
process.stdout.write(`${report.conclusion}\n`);
if (report.conclusion.startsWith('REFUSAL:') || process.exitCode) process.exitCode = process.exitCode || 1;
