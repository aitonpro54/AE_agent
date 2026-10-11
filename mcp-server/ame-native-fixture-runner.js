"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile,spawn } = require("node:child_process");
const grant = require("./ame-native-fixture-grant");
const ledger = require("./native-fixture-attempt-ledger");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const INSPECT = "inspect_ame_native_fixture_result";
const INSPECT_ATTEMPT="inspect_native_fixture_attempt";
// Both launch and later reads use the exact same kernel handle source. FILETIME
// remains an Int64/decimal string until its lossless seven-digit UTC rendering;
// neither Process.StartTime nor CIM's shorter birth value participates.
const KERNEL_PROCESS_IDENTITY = `
using System;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
public sealed class FixtureKernelIdentity {
  public int pid { get; set; }
  public string path { get; set; }
  public long createdUnixMs { get; set; }
  public string createdAt { get; set; }
  public string createdFileTime { get; set; }
}
public static class FixtureKernelProcess {
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern uint GetProcessId(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
  public static FixtureKernelIdentity ReadIdentity(IntPtr handle) {
    uint pid = GetProcessId(handle);
    if (pid == 0 || pid > Int32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error());
    long created, exited, kernel, user;
    if (!GetProcessTimes(handle, out created, out exited, out kernel, out user)) throw new Win32Exception(Marshal.GetLastWin32Error());
    StringBuilder image = new StringBuilder(32768); uint size = (uint)image.Capacity;
    if (!QueryFullProcessImageName(handle, 0, image, ref size)) throw new Win32Exception(Marshal.GetLastWin32Error());
    DateTime birth = DateTime.FromFileTimeUtc(created);
    return new FixtureKernelIdentity { pid = (int)pid, path = image.ToString(),
      createdUnixMs = new DateTimeOffset(birth).ToUnixTimeMilliseconds(),
      createdAt = birth.ToString("o", CultureInfo.InvariantCulture),
      createdFileTime = created.ToString(CultureInfo.InvariantCulture) };
  }
  public static int ReadExitCode(IntPtr handle) {
    // An application may itself exit with 259. Only the signaled held handle,
    // rather than that ambiguous numeric value, establishes termination.
    if (WaitForSingleObject(handle, 0) != 0) throw new InvalidOperationException("fixture_exit_handle_not_signaled");
    uint code;
    if (!GetExitCodeProcess(handle, out code)) throw new Win32Exception(Marshal.GetLastWin32Error());
    return unchecked((int)code);
  }
}`;
const KERNEL_PROCESS_SETUP = "Add-Type -TypeDefinition '" + KERNEL_PROCESS_IDENTITY.replace(/'/g,"''") + "'";
function fail(code) { throw Object.assign(new Error(code), { code }); }
function writeOnce(file, bytes) {
  const fd = fs.openSync(file, "wx");
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function safeDirectory(directory) {
  for (let p = path.resolve(directory); ; p = path.dirname(p)) {
    const s = fs.lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink() || fs.realpathSync(p).toLowerCase() !== p.toLowerCase()) fail("fixture_runner_parent_identity");
    if (path.dirname(p) === p) break;
  }
}
function readRegular(file) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase()) fail("fixture_runner_file_identity");
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) fail("fixture_runner_file_changed");
  return bytes;
}
function queryWindows(script, env = process.env) {
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise((resolve, reject) => execFile(executable, ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, env, timeout: 15000, maxBuffer: 16384, encoding: "utf8" }, (error, out) => {
      if (error) return reject(Object.assign(new Error("fixture_native_process_query_failed"), { code: "fixture_native_process_query_failed" }));
      try { resolve(JSON.parse(out.replace(/^\uFEFF/, "").trim())); } catch (_) { reject(new Error("fixture_native_process_query_invalid")); }
    }));
}
async function inspectProcess(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) fail("fixture_runner_pid_invalid");
  return queryWindows(`$ErrorActionPreference='Stop'; ${KERNEL_PROCESS_SETUP}; $p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if(!$p){'null';exit}; try{$h=$p.Handle; [FixtureKernelProcess]::ReadIdentity($h) | ConvertTo-Json -Compress}finally{$p.Dispose()}`);
}
async function launchChild(descriptor, environment) {
  // A new AE instance, hidden at launch. No -r, arbitrary JSX, GUI actions or
  // Render Queue operation. Only the startup-loaded fixed native fixture runs.
  const env = { ...process.env, ...environment, AE_AGENT_NATIVE_FIXTURE_EXECUTABLE: descriptor.executablePath };
  for (const name of Object.keys(env)) if (/^AE_BRIDGE_.*TOKEN$|^AE_BRIDGE_DEV_ADMIN$|^AE_M100_ALLOW_DIRECT_TOOL_EXECUTION$/i.test(name)) delete env[name];
  // This observer retains the exact process handle from launch through exit.
  // A lost observer or daemon crash leaves admission closed; PID absence/reuse
  // never becomes an exit proof. It performs no termination or project action.
  const script=["$ErrorActionPreference='Stop'",
    KERNEL_PROCESS_SETUP,
    "$p=Start-Process -FilePath $env:AE_AGENT_NATIVE_FIXTURE_EXECUTABLE -ArgumentList '-m' -WindowStyle Hidden -PassThru",
    "$h=$p.Handle; $opened=[DateTimeOffset]::UtcNow; $identity=[FixtureKernelProcess]::ReadIdentity($h); $verified=[DateTimeOffset]::UtcNow",
    "@{type='launch';process=$identity} | ConvertTo-Json -Compress; [Console]::Out.Flush()",
    "$wait=[FixtureKernelProcess]::WaitForSingleObject($h,[uint32]::MaxValue); if($wait -ne 0){throw 'fixture_wait_failed'}; $code=[FixtureKernelProcess]::ReadExitCode($h)",
    "@{type='exit';process=$identity;proof=@{kind='held_process_handle_signaled';handleOpenedAt=$opened.ToString('o');identityVerifiedAt=$verified.ToString('o');observedAt=[DateTimeOffset]::UtcNow.ToString('o');waitResult='WAIT_OBJECT_0';exitCode=[int]$code}} | ConvertTo-Json -Depth 4 -Compress; [Console]::Out.Flush(); $p.Dispose()"
  ].join(";\n");
  const executable=path.join(process.env.SystemRoot || "C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
  return new Promise((resolve,reject)=> {
    const observer=spawn(executable,["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});
    let buffer="", launched=null, settled=false, finishExit;
    const retirement=new Promise(r=>{finishExit=r;});
    observer.stdout.setEncoding("utf8");observer.stdout.on("data",chunk=> {
      buffer+=chunk;if(buffer.length>16384){if(!settled)reject(Error("fixture_runner_launch_unknown"));finishExit(null);return;}
      let newline;
      while((newline=buffer.indexOf("\n"))>=0) {
        const line=buffer.slice(0,newline).replace(/^\uFEFF/,"").trim();buffer=buffer.slice(newline+1);if(!line)continue;
        try {const row=JSON.parse(line);
          if(row.type==="launch" && !launched){launched=row.process;settled=true;resolve({pid:launched.pid,process:launched,retirement});}
          else if(row.type==="exit" && launched && ledger.same(row.process,launched))finishExit({schema:"ae-agent.native-fixture-retirement-proof.v1",process:row.process,proof:row.proof,nativeExecutionProven:false});
          else finishExit(null);
        } catch(_){if(!settled)reject(Error("fixture_runner_launch_unknown"));finishExit(null);}
      }
    });
    // Never forward native launch environment or PowerShell stderr to logs/tools.
    observer.stderr.resume();observer.on("error",()=>{if(!settled)reject(Error("fixture_runner_launch_unknown"));finishExit(null);});
    observer.on("close",()=>{if(!settled)reject(Error("fixture_runner_launch_unknown"));finishExit(null);});
  });
}

function buildArtifacts(repoRoot) {
  if (process.platform !== "win32") fail("fixture_runner_windows_only");
  const builds = path.join(repoRoot, ".codex-runtime", "ame-native-prerequisites", "native-probe-build");
  safeDirectory(builds);
  const candidates = [];
  for (const name of fs.readdirSync(builds)) {
    if (!/^build-[a-f0-9]{32}$/.test(name)) continue;
    const file = path.join(builds, name, "build-receipt.json");
    if (!fs.existsSync(file)) continue;
    try {
      const r = JSON.parse(readRegular(file));
      if (r.schema !== "ae-agent.native-probe-build.v2" || r.signedFixturePathCompiled !== true || r.sourceHashesStableAcrossBuild !== true ||
          r.protocolSmokeExitCode !== 0 || !Array.isArray(r.sourceFiles) || !r.sourceFiles.length || r.protocolSmoke?.legacyProtocolChecks !== 215 || r.protocolSmoke?.signedFixtureChecks < 50 ||
          r.fixtureGrantSmoke?.status !== "passed" || r.fixtureGrantSmoke?.passed < 63) continue;
      if (r.sourceFiles.some(s => {
        const source = path.resolve(repoRoot, s.path);
        return !source.toLowerCase().startsWith(repoRoot.toLowerCase() + path.sep) || sha(readRegular(source)) !== s.sha256;
      })) continue;
      const binary = path.join(builds, name, "bin", "AEAgentSnapshotProbe.aex");
      if (path.resolve(r.binaryPath) !== binary || sha(readRegular(binary)) !== r.binarySha256) continue;
      candidates.push({ receipt: r, receiptPath: file, binary });
    } catch (_) { /* A partial, stale or altered build is not a launch candidate. */ }
  }
  candidates.sort((a, b) => Date.parse(b.receipt.timestampUtc) - Date.parse(a.receipt.timestampUtc));
  if (!candidates.length) fail("fixture_runner_current_signed_build_required");
  const selected = candidates[0];
  const support = "C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files";
  const executablePath = path.join(support, "AfterFX.exe"), pluginDirectory = path.join(support, "Plug-ins");
  safeDirectory(pluginDirectory);
  for (const name of ["index.html", "panel.js", "native-probe-startup-guard.js"]) {
    const source = path.join(repoRoot, "cep-panel", name);
    const installed = path.join(process.env.APPDATA || "", "Adobe", "CEP", "extensions", "com.codex.aemcpbridge", name);
    if (sha(readRegular(source)) !== sha(readRegular(installed))) fail("fixture_runner_installed_cep_guard_required");
  }
  return { ...selected, executablePath, executableSha256: sha(readRegular(executablePath)),
    pluginPath: path.join(pluginDirectory, "AEAgentSnapshotProbe.aex"), pluginSha256: selected.receipt.binarySha256 };
}

function createExecutor(deps) {
  const root = path.resolve(deps.repoRoot), ownedParent = path.join(root, ".codex-runtime", "ame-native-fixtures");
  const descriptors = new Map(), launches = new Map(), capabilities = new WeakMap();
  const privateChildren=new Map();
  const verifiedResults = new Map();
  let executing = false;
  const readProcess = deps.inspectProcess || inspectProcess;
  const issuer = grant.createFixtureGrantIssuer({ ...deps, ownedParent,
    getOwnedChild: id => descriptors.get(id),
    inspectProcess: async (descriptor, binding) => {
      const known = launches.get(descriptor);
      if (!known || known.pid !== binding.pid) return false;
      const observed = await readProcess(binding.pid);
      return Boolean(observed && known.process && ledger.sameProcess(observed,known.process) && observed.pid === binding.pid && observed.createdUnixMs === binding.processCreatedUnixMs &&
        observed.path.toLowerCase() === descriptor.executablePath.toLowerCase());
    },
    consumeAttempt: async attempt => {
      const descriptor = Array.from(descriptors.values()).find(value => value.stageId === attempt.stageId && value.nonce === attempt.nonce);
      if (!descriptor) fail("fixture_runner_attempt_owner_missing");
      ledger.writeOnce(ledger.fileFor(root,descriptor.stageId,`consumed-${attempt.operation}`),attempt); return true;
    }
  });
  async function authorize(context) {
    deps.assertManualIngress(context);
    const recovery=require("./native-fixture-prephase-recovery"),brand=typeof deps.prephaseRecoveryReaders==="function" ? await recovery.bindAdmission(context,deps.prephaseRecoveryReaders()) : null;
    ledger.assertAdmission(root,null,{brand,context});
    const capability = Object.freeze({});
    capabilities.set(capability, { context, recoveryBrand:brand,issuerCapability: await issuer.authorize(context) }); return capability;
  }
  function assertAuthorization(capability, args) {
    const entry = capabilities.get(capability);
    if (!entry || JSON.stringify(grant.validateInput(args)) !== JSON.stringify(grant.validateInput(entry.context.args))) fail("fixture_runner_authorization_required");
    deps.assertManualIngress(entry.context); return entry;
  }
  async function execute(args, capability) {
    const entry = assertAuthorization(capability, args);
    if (executing) fail("fixture_runner_busy");
    ledger.assertAdmission(root,null,{brand:entry.recoveryBrand,context:entry.context});
    executing = true; capabilities.delete(capability);
    const children = [];
    try {
      const artifacts = (deps.getArtifacts || buildArtifacts)(root);
      if (!fs.existsSync(ownedParent)) fs.mkdirSync(ownedParent);
      safeDirectory(ownedParent);
      // The image is inert in ordinary AE. Install only this exact owned build;
      // never overwrite an existing different file or use an official installer.
      if (!fs.existsSync(artifacts.pluginPath)) writeOnce(artifacts.pluginPath, readRegular(artifacts.binary));
      if (sha(readRegular(artifacts.pluginPath)) !== artifacts.pluginSha256) fail("fixture_runner_plugin_installation_changed");
      let captureReceipt;
      for (const role of ["capture", "stage"]) {
        deps.assertManualIngress(entry.context);
        const nonce = crypto.randomBytes(16).toString("hex"), stageId = crypto.randomBytes(16).toString("hex");
        const descriptor = Object.freeze({ nonce, stageId, role, rootPath: path.join(ownedParent, `probe-${nonce}`),
          pluginPath: artifacts.pluginPath, pluginSha256: artifacts.pluginSha256,
          executablePath: artifacts.executablePath, executableSha256: artifacts.executableSha256 });
        require("./native-fixture-prephase-recovery").assertDescriptor(entry.recoveryBrand,entry.context,root,descriptor);
        fs.mkdirSync(descriptor.rootPath); safeDirectory(descriptor.rootPath);
        ledger.writeOnce(ledger.fileFor(root,stageId,"owner"),{ schema: "ae-agent.native-fixture-owner.v2",
          rootPath: descriptor.rootPath, nonce, stageId, role });
        if (role === "stage") {
          const baseline = readRegular(captureReceipt.baselinePath);
          if (sha(baseline) !== captureReceipt.baselineSha256) fail("fixture_runner_baseline_changed");
          writeOnce(path.join(descriptor.rootPath, "baseline.aep"), baseline);
        }
        descriptors.set(stageId, descriptor);
        const prepared = await issuer.prepareChild(entry.issuerCapability, stageId);
        privateChildren.set(stageId,prepared.child);
        writeOnce(path.join(descriptor.rootPath, "launch.manifest"), prepared.manifestBytes);
        ledger.reserve(root,descriptor,entry.context,prepared.manifestBytes);
        const manifestExpiry=Number(/(?:^|\n)expires_unix_ms=(\d+)\n/.exec(String(prepared.manifestBytes))?.[1]) || Infinity;
        const launched = await (deps.launchChild || launchChild)(descriptor, prepared.environment);
        if (!launched || !Number.isSafeInteger(launched.pid) || launched.pid < 1) { issuer.markUnknown(prepared.child); fail("fixture_runner_launch_unknown"); }
        launches.set(descriptor, { pid: launched.pid });
        const owned = { descriptor, child: prepared.child, pid: launched.pid, terminal: false }; children.push(owned);
        // A post-launch lookup cannot reconstruct the original held identity.
        // Keep its lossless canonical ISO7 witness and exit listener before any
        // later read/refusal, so identity drift still leaves recoverable evidence.
        if (!launched.process || launched.process.pid!==launched.pid) fail("fixture_runner_launch_identity_required");
        const trustedIdentity=ledger.processIdentity(launched.process,descriptor);
        launches.set(descriptor,{pid:launched.pid,process:trustedIdentity});
        if (launched.retirement) Promise.resolve(launched.retirement).then(proof=> {
          if (!proof) return;
          try {ledger.validateRetirement(proof,trustedIdentity);ledger.writeOnce(ledger.fileFor(root,stageId,"retirement-proof"),proof);} catch (_) { /* fail closed; no retirement audit */ }
        },()=>{ /* A lost observer never becomes an exit proof. */ });
        ledger.launch(root,descriptor,trustedIdentity);
        const processInfo=await readProcess(launched.pid);
        if (!ledger.sameProcess(trustedIdentity,processInfo)) fail("fixture_runner_launch_identity_changed");
        const waitReceipt = async filename => {
          // Waiting does not renew the signed manifest or manual M100 authority.
          const deadline = Math.min(Date.now() + (filename==="signed-boot.json" ? 300000 : 90000),manifestExpiry,Date.parse(entry.context.record.proposalExpiresAt) || Infinity);
          while (Date.now() < deadline) {
            deps.assertManualIngress(entry.context);
            const file = path.join(descriptor.rootPath, filename);
            if (fs.existsSync(file)) return issuer.acceptReceipt(prepared.child, readRegular(file).toString("utf8"));
            const refusal = path.join(descriptor.rootPath, "signed-refusal.json");
            if (fs.existsSync(refusal)) return issuer.acceptReceipt(prepared.child, readRegular(refusal).toString("utf8"));
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          issuer.markUnknown(prepared.child); fail("fixture_runner_receipt_unknown_no_replay");
        };
        await waitReceipt("signed-boot.json");
        const phases = role === "capture" ? [["create-fixture", "signed-fixture.json"], ["snapshot", "signed-snapshot.json"]] : [["stage-variants", "signed-variants.json"]];
        let verified;
        for (const [operation, receiptName] of phases) {
          const phase = await issuer.issuePhase(prepared.child, operation);
          writeOnce(path.join(descriptor.rootPath, phase.filename), phase.bytes);
          verified = await waitReceipt(receiptName);
        }
        owned.terminal = true;
        if (role === "capture") captureReceipt = verified.receipt;
        else {
          for (const output of verified.receipt.outputs) if (sha(readRegular(output.path)) !== output.sha256) fail("fixture_runner_variant_file_changed");
          const result = { ok: true, schema: grant.SCHEMA, fixtureKind: args.fixtureKind, productionBackend: false,
            currentUserProjectMutation: false, mainProjectCheckpointScope: "on_disk_saved_file_only",
            nativeFixtureSnapshot: captureReceipt, nativeFixtureVariants: verified.receipt,
            outputFiles: verified.receipt.outputs, nativeSubmissionAttempted: false,
            childProcesses: children.map(value => ({ pid: value.pid, rootPath: value.descriptor.rootPath, terminalReceiptVerified: value.terminal })),
            automaticRetryAllowed: false, buildId: artifacts.receipt.buildId, evidenceId: crypto.randomUUID(),
            authorization: { runId: entry.context.runId, proposalId: entry.context.record.actionId } };
          ledger.complete(root,entry.context.runId,children,verified.receipt.outputs);
          verifiedResults.set(result.evidenceId, { hash: sha(JSON.stringify(result)), payload: JSON.parse(JSON.stringify(result)) });
          return result;
        }
      }
      fail("fixture_runner_incomplete");
    } catch (error) {
      for (const owned of children) {issuer.markUnknown(owned.child);ledger.unknown(root,owned.descriptor,error.code || error.message);}
      error.nativeAttempts=children.map(owned=>({stageId:owned.descriptor.stageId,role:owned.descriptor.role,runId:entry.context.runId,replayAllowed:false}));
      throw error;
    } finally {
      // Keep processes and roots intact for reconciliation. No general process
      // termination, recursive cleanup, project save/reopen or unknown retry.
      executing = false;
    }
  }
  function verifyResult(payload) {
    if (!payload || verifiedResults.get(payload.evidenceId)?.hash !== sha(JSON.stringify(payload))) fail("fixture_runner_unverified_result");
    if (sha(readRegular(payload.nativeFixtureSnapshot.baselinePath)) !== payload.nativeFixtureSnapshot.baselineSha256 ||
        payload.outputFiles.some(output => sha(readRegular(output.path)) !== output.sha256)) fail("fixture_runner_verified_files_changed");
    return { ok: true, scope: "signed_owned_fixture_copy_and_reopened_variants", currentUserProjectMutation: false,
      productionBackend: false, sourcePathAndDirtyPreserved: true, outputsHashVerified: true,
      mediaProof: "not_inspected", ameSubmission: "not_attempted" };
  }
  async function inspectResult(args) {
    if (!args || Object.keys(args).length !== 1 || typeof args.evidenceId !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(args.evidenceId)) fail("fixture_result_invalid_selector");
    const cached = verifiedResults.get(args.evidenceId);
    if (!cached) fail("fixture_runner_verified_result_unavailable");
    const payload = cached.payload, verification = verifyResult(payload), observed = [];
    for (const receipt of [payload.nativeFixtureSnapshot, payload.nativeFixtureVariants]) {
      const child = payload.childProcesses.find(value => value.pid === receipt.pid);
      const descriptor = Array.from(descriptors.values()).find(value => value.rootPath === child?.rootPath);
      const processInfo = await readProcess(receipt.pid);
      if (!descriptor || !processInfo || processInfo.pid !== receipt.pid || processInfo.createdUnixMs !== receipt.processCreatedUnixMs ||
          processInfo.path.toLowerCase() !== descriptor.executablePath.toLowerCase() ||
          sha(readRegular(descriptor.pluginPath)) !== descriptor.pluginSha256 ||
          sha(readRegular(descriptor.executablePath)) !== descriptor.executableSha256) fail("fixture_runner_evidence_process_changed");
      observed.push({ pid: processInfo.pid, createdUnixMs: processInfo.createdUnixMs, role: descriptor.role });
    }
    // The producer cache exists only in this daemon after signed receipt checks.
    // This separate read verifies current files/processes; it proves the owned
    // snapshot operation at its native receipts, not a current-user capture.
    verifyResult(payload);
    return { ok: true, schema: "ae-agent.native-fixture-readback.v1", evidenceId: payload.evidenceId,
      authorization: payload.authorization, buildId: payload.buildId, fixtureKind: payload.fixtureKind,
      verification, sourceBefore: payload.nativeFixtureSnapshot.sourceBefore, sourceAfter: payload.nativeFixtureSnapshot.sourceAfter,
      baselinePath: payload.nativeFixtureSnapshot.baselinePath, baselineSha256: payload.nativeFixtureSnapshot.baselineSha256,
      outputs: payload.outputFiles, childProcesses: observed, observedAt: new Date().toISOString(),
      producer: "private_signed_fixture_cache", productionBackend: false, currentUserProjectMutation: false,
      mediaProof: "not_inspected", ameSubmission: "not_attempted" };
  }
  function quiescence() {
    return { executing, pendingCount: launches.size, descriptorCount: descriptors.size,
      outstandingAttempts:ledger.outstanding(root),replayAllowed:false };
  }
  function attemptIdentity(stageId) {
    const d=descriptors.get(stageId), p=d && launches.get(d)?.process;
    return d && p ? {descriptor:JSON.parse(JSON.stringify(d)),process:JSON.parse(JSON.stringify(p)),executing,replayAllowed:false} : null;
  }
  function hasAttempt(stageId) {return descriptors.has(stageId) || privateChildren.has(stageId);}
  async function inspectAttempt(args) {
    if(!args || Object.keys(args).sort().join(",")!=="stageId" || !ledger.TOKEN.test(args.stageId || ""))fail("fixture_attempt_invalid_selector");
    const d=descriptors.get(args.stageId),child=privateChildren.get(args.stageId);
    const reservation=ledger.read(ledger.fileFor(root,args.stageId,"reservation")),launch=ledger.read(ledger.fileFor(root,args.stageId,"launch")),unknown=ledger.read(ledger.fileFor(root,args.stageId,"unknown"));
    if(!reservation)fail("fixture_attempt_durable_reservation_unavailable");
    let bootstrapRefusal=null;
    if(d && child && launches.has(d)) {
      const file=path.join(d.rootPath,"signed-bootstrap-refusal.json");
      if(fs.existsSync(file))bootstrapRefusal=await issuer.verifyBootstrapRefusal(child,readRegular(file).toString("utf8"));
    }
    const retired=ledger.validRetirement(root,reservation.value.descriptor),completed=ledger.validCompletion(root,reservation.value.descriptor,reservation);
    return {schema:"ae-agent.native-fixture-attempt-readback.v1",stageId:args.stageId,reservation,launch,unknown,bootstrapRefusal,
      verificationScope:child ? "current_private_issuer_and_durable_ledger" : "durable_ledger_only_private_key_unavailable",historicalOutcome:unknown ? "unknown" : "not_inferred",nativeExecutionProven:false,
      endpointInert:completed || bootstrapRefusal?.endpointInert===true,nativeAdmissionBlocked:!retired && !completed,processExited:retired,replayAllowed:false};
  }
  return { authorize, assertAuthorization, execute, verifyResult, inspectResult, inspectAttempt,quiescence,attemptIdentity,hasAttempt };
}

const tool = { name: grant.TOOL_NAME, description: "Manual CEP-only native snapshot experiment on two server-owned empty AE children. Creates fixed test fixtures, captures current unsaved state, saves two independent variants and reopens them for read-back. Does not mutate the current user project, render, enqueue in AME, claim a production snapshot backend or replay unknown phases.",
  inputSchema: { type: "object", additionalProperties: false, required: ["fixtureKind"], properties: {
    fixtureKind: { type: "string", enum: ["saved-clean", "saved-dirty", "untitled-dirty"] }, restoreDirty: { type: "boolean", default: false }
  } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } };
const inspectTool = { name: INSPECT, description: "Read independent evidence for one private signed native fixture result in the current daemon, rechecking saved file hashes, exact owned child birth and native images. No replay, render, AME enqueue or current-user snapshot claim.",
  inputSchema: { type: "object", additionalProperties: false, required: ["evidenceId"], properties: { evidenceId: { type: "string", format: "uuid" } } },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false } };
const inspectAttemptTool={name:INSPECT_ATTEMPT,description:"Read one durable fixture attempt and independently verify an expired signed bootstrap refusal using the current private issuer. Does not renew authority, replay a phase, terminate a process or infer the historical mutation outcome. Process retirement requires an audited exact held-handle exit proof.",inputSchema:{type:"object",additionalProperties:false,required:["stageId"],properties:{stageId:{type:"string",pattern:"^[a-f0-9]{32}$"}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}};
module.exports = { INSPECT,INSPECT_ATTEMPT,createExecutor, tool, inspectTool,inspectAttemptTool, buildArtifacts, writeOnce, readRegular,inspectProcess };
