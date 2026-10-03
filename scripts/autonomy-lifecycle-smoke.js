"use strict";
const assert=require("assert/strict"),fs=require("fs"),os=require("os"),path=require("path");
const {createAutonomousSessionManager}=require("../mcp-server/autonomous-session");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ae-autonomy-lifecycle-"));
try {
  const statePath=path.join(dir,"preference.json");
  const panel={panelConnectionId:"panel-1",panelGeneration:"1",seenAt:Date.now()};
  const manager=createAutonomousSessionManager({statePath,panelState:()=>panel});
  manager.observePanel(panel);
  const before=manager.authorization(),bytes=fs.readFileSync(statePath);
  assert(before && before.authorized);
  const invalidated=manager.invalidateProjectContext();
  assert.equal(invalidated.desiredEnabled,true);
  assert.equal(invalidated.connectionReady,false);
  assert.equal(manager.authorization(),null);
  assert.deepEqual(fs.readFileSync(statePath),bytes);
  manager.observePanel(panel);
  assert.notEqual(manager.authorization().sessionHash,before.sessionHash);
  manager.revoke(panel);
  const disabledBytes=fs.readFileSync(statePath);
  manager.invalidateProjectContext();manager.observePanel(panel);
  assert.equal(manager.publicStatus().desiredEnabled,false);
  assert.equal(manager.authorization(),null);
  assert.deepEqual(fs.readFileSync(statePath),disabledBytes);
  console.log("autonomy lifecycle: PASS; runtime authority invalidated, enabled/off preference preserved.");
} finally {
  if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep) || !path.basename(dir).startsWith("ae-autonomy-lifecycle-")) throw new Error("Unsafe fixture cleanup");
  fs.rmSync(dir,{recursive:true,force:true});
}
