# 13-startup-boundary

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/runtime/ae-panel-startup.js:87–118`
Полный файл SHA256 (hex groups, concatenate) `7c188730:1b23f49d:5deedf97:2bebde42:c527682a:c68bf0f3:c7f9584c:717ceba6`; Git blob `01bff3d0:ddf32de8:a2cb99b5:a090c476:ffe10f64`. Выдержка: строки 87–118, 4281 bytes.

```javascript
function createAePanelStartup({ installation, expectedIdentity, peerStatus, assertIdle, reverify = () => {}, preflight = collisionPreflight, scan = scanWindows, readiness = require('./ae-readiness').observeAeWindows, environment = adobeEnvironment, observeSubmission = require('./windows-owner-process').observeOwnerProcess, launch = dispatch, now = Date.now, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  const root = path.join(installation.stateDir, 'panel-startup'); let busy = false, activeOperationId = null;
  function read(file) { try { return JSON.parse(bytes(file)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
  function binding() {
    // Stopped readoption intentionally retains a preparation hardlink to this
    // DATA record. It is only a locator here, never adoption/project authority.
    // Only this fixed leaf permits stable hardlinks; all ancestors/code/state
    // receipts still use the strict default path guard.
    let a;
    try { a = JSON.parse(bytes(path.join(installation.stateDir, 'host-adoption.json'), { linkedData: true, maxBytes: 64 * 1024 })); }
    catch (error) { if (error.code === 'ENOENT') throw new Error('startup_executable_binding_required'); throw error; }
    const h = a?.host;
    if (a?.version !== 1 || a.installationId !== installation.installationId || a.machineId !== installation.machineId || h?.machineId !== installation.machineId ||
        !h || !path.isAbsolute(h.executablePath) || path.basename(h.executablePath).toLowerCase() !== 'afterfx.exe' || !/^[a-f0-9]{64}$/.test(h.executableHash)) throw new Error('startup_executable_binding_required');
    if (hash(bytes(h.executablePath)) !== h.executableHash) throw new Error('startup_executable_changed');
    return h;
  }
  function panel() { const p = peerStatus().peer; return p.connected && p.registryReady !== false && canonical(p.acceptedIdentity) === canonical(expectedIdentity) ? p : null; }
  function freshPanel(attempt) { const current = panel(), previous = attempt.initialPeer; return current && (!previous || current.peerId !== previous.peerId || current.identityEpoch !== previous.identityEpoch || current.identityObservedAt > previous.identityObservedAt) ? current : null; }
  function hostMatches(actual, expected) { return actual.pid === expected.pid && actual.birth === expected.birth && path.resolve(actual.executablePath).toLowerCase() === path.resolve(expected.executablePath).toLowerCase(); }
  function guiHost(directory) { const saved = read(path.join(directory, 'gui-host.json')); if (!saved) return null; if (Object.keys(saved).sort().join(',') !== 'birth,executableHash,executablePath,pid' || !Number.isSafeInteger(saved.pid) || saved.pid < 1 || typeof saved.birth !== 'string' || !Number.isFinite(Date.parse(saved.birth)) || typeof saved.executablePath !== 'string' || !path.isAbsolute(saved.executablePath) || !/^[a-f0-9]{64}$/.test(saved.executableHash)) throw new Error('startup_gui_identity_unproven'); return { pid: saved.pid, birth: saved.birth, executablePath: saved.executablePath }; }
  function bootEntered(directory, attempt) { return fs.existsSync(path.join(directory, attempt.dispatchProtocol === 3 ? 'bootstrap-dispatch-entered.json' : 'dispatch-entered.json')); }
  function preparationOnly(directory, attempt) {
    if (attempt && ![2, 3].includes(attempt.dispatchProtocol) || fs.existsSync(path.join(directory, 'dispatch-entered.json')) || fs.existsSync(path.join(directory, 'gui-launch-entered.json')) || fs.existsSync(path.join(directory, 'bootstrap-dispatch-entered.json'))) return false;
    plain(directory, true);
    return fs.readdirSync(directory).every(name => /^(?:attempt\.json|request\.json|bootstrap\.jsx|result\.json)(?:\.stage-[a-f0-9-]{36})?$/.test(name));
  }
  function rejectPrepared(directory, attempt) {
    if (preparationOnly(directory, attempt) && !read(path.join(directory, 'result.json'))) durable(path.join(directory, 'result.json'), { outcome: 'rejected', code: 'rejected_before_dispatch' });
  }
  function blockedBeforeBootstrap(directory, attempt, host, reason) {
    durable(path.join(directory, 'result.json'), { outcome: 'blocked', code: 'blocked_before_bootstrap', reason, coldHostStarted: true, host: { ...host, executableHash: attempt.executableHash } });
```

## `core4/runtime/ae-panel-startup.js:230–262`
Полный файл SHA256 (hex groups, concatenate) `7c188730:1b23f49d:5deedf97:2bebde42:c527682a:c68bf0f3:c7f9584c:717ceba6`; Git blob `01bff3d0:ddf32de8:a2cb99b5:a090c476:ffe10f64`. Выдержка: строки 230–262, 3663 bytes.

```javascript
      if (original && panel()) { durable(path.join(directory, 'result.json'), { outcome: 'ready', code: 'already_authenticated', host, peer: panel() }); return status({ operationId: value.operationId }); }
      recheck(); const env = environment(h.executablePath), before = await scan(); if (before.length !== 1 || !hostMatches(before[0], host)) throw new Error('startup_process_changed'); current();
      durable(path.join(directory, 'bootstrap-dispatch-entered.json'), { operationId: value.operationId, packageHash: installation.packageHash, requestHash: attempt.requestHash, bootstrapHash: attempt.bootstrapHash }); current(); bootstrapCalled = true;
      const submission = await launch(h.executablePath, ['-r', path.join(directory, 'bootstrap.jsx')], { windowsHide: true, env });
      if (Number.isSafeInteger(submission?.pid) && submission.pid > 0) durable(path.join(directory, 'bootstrap-submission.json'), { pid: submission.pid });
      while (now() < deadline) {
        context.assertCurrent(); assertIdle({ operationId: value.operationId });
        const current = await scan();
        if (current.length === 2 && submission?.pid && current.some(p => hostMatches(p, host)) && current.some(p => p.pid === submission.pid && path.resolve(p.executablePath).toLowerCase() === path.resolve(h.executablePath).toLowerCase())) {
          // Known forwarding CLI may be transiently visible. It is never a
          // second accepted host and cannot establish readiness until it exits.
          await wait(Math.min(500, Math.max(1, deadline - now()))); continue;
        }
        if (current.length > 1 || current.length === 1 && !hostMatches(current[0], host)) throw new Error('startup_process_changed');
        const ack = status({ operationId: value.operationId }).ack;
        if (ack && !assetsMatch(directory, attempt)) throw new Error('startup_binding_changed');
        if (ack?.code === 'expired_before_menu') return await reconcile({ operationId: value.operationId });
        if (ack?.code === 'requires_host_restart') { durable(path.join(directory, 'result.json'), { outcome: 'blocked', code: 'requires_host_restart' }); return status({ operationId: value.operationId }); }
        if (current.length === 1 && ack?.code === 'menu_executed' && freshPanel(attempt)) {
          durable(path.join(directory, 'result.json'), { outcome: 'ready', code: 'authenticated_panel', host: current[0], peer: freshPanel(attempt) }); return status({ operationId: value.operationId });
        }
        await wait(Math.min(500, Math.max(1, deadline - now())));
      }
      return status({ operationId: value.operationId });
    } catch (e) {
      if (recorded && !bootstrapCalled && coldHost) { try { blockedBeforeBootstrap(directory, attempt, coldHost, e.message); return status({ operationId: value.operationId }); } catch {} }
      if (recorded && !guiCalled && !bootstrapCalled) { try { if (!read(path.join(directory, 'result.json'))) durable(path.join(directory, 'result.json'), { outcome: 'rejected', code: 'rejected_before_dispatch', reason: e.message }); return status({ operationId: value.operationId }); } catch {} }
      return { operationId: value.operationId, outcome: guiCalled || bootstrapCalled ? 'unknown' : 'blocked', code: guiCalled || bootstrapCalled ? 'startup_outcome_unresolved' : /^startup_/.test(e.message) ? e.message : 'startup_unavailable', coldHostStarted: !!coldHost, nativeVerified: false };
    } finally { busy = false; activeOperationId = null; }
  }
  return { ensure, status, observe, activity };
}
module.exports = { createAePanelStartup, validateStartupInput: input, collisionPreflight, ownsRegistryBootstrap };
```
