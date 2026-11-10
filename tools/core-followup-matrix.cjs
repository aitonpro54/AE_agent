'use strict';

// Воспроизводимый реестр MSI. Построение реестра не запускает AE.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash, canonical } = require('../core4/protocol/json');
const { selectChecks } = require('../core4/tools/validate-diff');

const repo = path.resolve(__dirname, '..');
const mapPath = 'core4/config/validation-map.json';
const currentSource = 'docs/evidence/core-portability-current-source-20261104.json';
const historical = 'docs/core-release-manifest-20261103.json';
const json = file => JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'));
const sha = file => hash(fs.readFileSync(path.join(repo, file)));
const same = (a, b) => canonical(a) === canonical(b);

function matrix() {
  const map = json(mapPath), earlier = json(currentSource), manifest = json(historical);
  const inventory = selectChecks(map.owners.map(owner => owner.prefix)).checks;
  if (!same(inventory.map(x => x.check).sort(), Object.keys(map.checkDependencies).sort())) {
    throw Error('Неполный инвентарь validation-map');
  }
  const checks = inventory.map(({ check, command, evidenceKey, dependencies }) => {
    const old = earlier.checks.find(x => x.check === check && x.evidenceKey === evidenceKey &&
      x.result === 'PASS' && x.fullCheckAccepted && same(x.command, command) && x.sourceHost === 'MSI' &&
      x.log && fs.existsSync(path.join(repo, x.log)) && x.logHash === sha(x.log));
    return { check, command, evidenceKey, dependencyCount: dependencies.length, cwd: 'core4',
      environment: 'MSI Windows; Node ' + process.versions.node + '; изолированные TEMP и профили для свежих прогонов',
      historical: manifest.checks.some(x => x.check === check) ? historical : null,
      status: old ? 'reuse-exact-key' : 'pending-current',
      evidence: old ? { file: currentSource, log: old.log, sha256: old.logHash } : null };
  }).sort((a, b) => a.check.localeCompare(b.check, 'en'));
  return { schemaVersion: 1, baseline: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    registry: { file: mapPath, sha256: sha(mapPath) }, releaseCertified: false, checks,
    required: [
      ['titles-tests', 'products/titles', ['node', '--test']],
      ['slideshow-tests', 'products/slideshow', ['node', '--test']],
      ['visual-review-temp', 'core4', ['node', '--test', 'test/visual-review.test.js']],
      ['boundaries', 'core4', ['node', 'tools/check-boundaries.js']],
      ['offline-visual-bundle', 'core4', ['node', 'tools/package-visual-review.js']],
      ['frame-slot-temp', 'core4', ['node', 'tools/package-capability.js', 'pack/compose']],
      ['combined-and-minimal-packages', 'core4', ['node', 'tools/package-installable.js']],
      ['combined-standalone', 'core4', ['node', 'tools/package-standalone-installer.js']],
      ['no-r1-early-refusal', 'TEMP', ['MCP', 'stage-render-copy']],
      ['installed-update-and-cold-owner', 'MSI', ['maintain-owner', 'owner-update', 'update-inspect', 'update-enable', 'core_status']],
      ['native-png', 'MSI', ['MCP', 'save-comp-frame-png']],
      ['native-titles-r1', 'MSI', ['MCP', 'write-point-text', 'save-current-project', 'stage-render-copy', 'render_job_finalize']],
      ['native-slideshow-s1-r1', 'MSI', ['MCP', 'photo-placeholder', 'save-current-project', 'stage-render-copy', 'render_job_finalize']],
      ['native-review-and-cross-job-refusal', 'MSI', ['node', 'core4/tools/visual-review.js', 'prepare/seal']],
      ['final-history-and-release', 'MSI', ['MCP', 'core_status', 'render_job_status']]
    ].map(([check, cwd, command]) => ({ check, cwd, command, status: 'pending-current', evidence: null })),
    excluded: [
      { check: 'native-advanced-3d', reason: 'За пределами поручения.' },
      { check: 'native-ame', reason: 'За пределами поручения. Source-регрессия при наличии остаётся в реестре.' },
      { check: 'new-slideshow-templates-and-r1-formats', reason: 'Проверяются прежние S1 и R1.' },
      { check: 'desktop-and-p2', reason: 'Приёмка проводится на MSI; P2 закрыт.' }
    ] };
}

if (require.main === module) console.log(JSON.stringify(matrix(), null, 2));
module.exports = { matrix };
