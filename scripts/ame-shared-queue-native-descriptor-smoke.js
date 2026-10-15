"use strict";

// Cross-source contract check, not execution/compilation of the native descriptor.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { generator, fixture } = require("./ame-title-jobs-completion-order-smoke");
const nativePath = path.join(__dirname, "../native/owned-runtime-local-session/local_session_native_client.cpp");
const source = fs.readFileSync(process.argv.includes("--native-stdin") ? 0 : nativePath, "utf8");
const begin = source.indexOf("Bytes NativeClient::AmeSourceInspectionDescriptorFixed("), end = source.indexOf("Bytes NativeClient::AmeDeliveryDescriptorFixed(", begin);
assert(begin >= 0 && end > begin, "actual native descriptor boundaries required");
const descriptor = source.slice(begin, end), queueStart = descriptor.indexOf("if(queue){auto actual="), queueEnd = descriptor.indexOf("\n    const auto text=", queueStart);
assert(queueStart >= 0 && queueEnd > queueStart, "actual queue argument block required");
const queueBlock = descriptor.slice(queueStart, queueEnd);
// Bind the VM descriptor fixture to the precise private native source field,
// and require the assignment to remain inside both queue and SharedQueue guards.
const batchAssignment = queueBlock.match(/if\(policy\.SharedQueue\(\)\)\{actual\.keys\.push_back\("batchId"\);const auto (\w+)=ManifestQuote\(job->(\w+)\);actual\.children\.push_back\(ManifestJson\(Bytes\(\1\.begin\(\),\1\.end\(\)\)\)\);\}/);
assert(batchAssignment, "shared queue descriptor must serialize the original batchId under its SharedQueue guard");
assert.equal(batchAssignment[2], "batchId_", "batchId must come from the retained native job");
assert.equal((descriptor.match(/keys\.push_back\("batchId"\)/g) || []).length, 1, "no unguarded/legacy batchId assignment");
assert(descriptor.includes('job->batchId_=policy.SharedQueue()&&slot==2?data_->originalJobs[0]->batchId_:'), "slot 2 must retain the original shared batch");

const generate = generator();
function queueArgs(f, shared, count) {
  const { batchId, ...args } = f.base;
  // This models just the source-asserted native field join. The receiver below
  // is the actual product-generated script; C++ serialization remains untested.
  const nativeJob = { batchId_: batchId };
  return { ...args, operation: "queue", sourcePath: f.items[count - 1].source,
    jobIds: f.items.slice(0, count).map(item => item.jobId), ...(shared ? { batchId: nativeJob[batchAssignment[2]] } : {}) };
}
for (const count of [1, 2]) {
  const f = fixture(generate), args = queueArgs(f, true, count), read = f.run(args);
  assert.equal(read.code, "owned_queue_observed"); assert.equal(read.queue.expectedJobs.length, count);
  assert.deepEqual(read.queue.expectedJobs.map(job => job.handleKey), args.jobIds);
  assert(read.queue.expectedJobs.every(job => job.nativeAssociationVerified));
  const { batchId, ...missingBatch } = args;
  assert.equal(f.run(missingBatch).code, "owned_queue_entry_unavailable", "missing original batch must fail closed");
  assert.equal(f.run({ ...args, batchId: "foreign-batch" }).code, "owned_queue_entry_unavailable", "foreign batch must fail closed");
  f.assertNoReplay(); console.log(`PASS shared own-prefix ${count}: native source join + actual receiver VM, missing/foreign batch rejected`);
}
const legacy = fixture(generate, false), legacyArgs = queueArgs(legacy, false, 1);
assert.equal(Object.hasOwn(legacyArgs, "batchId"), false); assert.equal(Object.hasOwn(legacyArgs, "queueMode"), false);
assert.equal(legacy.run(legacyArgs).code, "owned_queue_observed"); legacy.assertNoReplay();
console.log("PASS legacy queue retains its existing descriptor fields");
console.log("native-descriptor: 3 passed; offline cross-source/VM only; native build/runtime NOTRUN; no product imports/live calls");
