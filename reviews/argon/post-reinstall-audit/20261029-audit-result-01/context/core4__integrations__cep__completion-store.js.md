# core4/integrations/cep/completion-store.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: c5678e98b6eea7cb0ad7db605b4bd9a5a4f73080bb1e32f60c6a99420e904835
Classification: INTERNAL; source code/documentation only.

## Source lines 1-68

```text
1: 'use strict';
2: const fs = require('node:fs');
3: const path = require('node:path');
4: const { hash, bounded, parse, canonical, id, fail, sameDispatch } = require('../../core/receiver-api');
5: const { validateDisposition } = require('../../runtime/native-read-disposition');
6: // No automatic orphan/PID recovery. An abandoned owner permits proof reads only.
7: function openCompletionStore({ directory, io = fs, installationContext }) {
8:   if (!directory || !path.isAbsolute(directory)) fail('explicit_receiver_store_required');
9:   io.mkdirSync(directory, { recursive: true });
10:   const file = path.join(directory, 'completions.ndjson'), ownerFile = path.join(directory, 'owner');
11:   let owner, closed = false, fault = false, events = [], identity;
12:   const records = new Map();
13:   const isSettled = record => record.state === 'completed' || record.state === 'unknown' && !!record.terminalDisposition;
14:   try { owner = io.openSync(ownerFile, 'wx'); } catch (e) { if (e.code !== 'EEXIST') throw e; closed = true; }
15:   function append(event) {
16:     if (closed || fault || owner === undefined) fail('receiver_lane_closed');
17:     const body = { ...event, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' };
18:     const record = { ...body, recordHash: hash(body) }, line = bounded(record) + '\n';
19:     let fd;
20:     try {
21:       fd = io.openSync(file, 'a');
22:       if (io.writeSync(fd, line) !== Buffer.byteLength(line)) fail('receiver_short_write');
23:       io.fsyncSync(fd); io.closeSync(fd); fd = undefined;
24:     } catch (e) { fault = true; closed = true; throw e; }
25:     finally { if (fd !== undefined) { try { io.closeSync(fd); } catch { fault = true; closed = true; } } }
26:     events.push(record); return record;
27:   }
28:   try {
29:     if (io.existsSync(file)) {
30:       const data = io.readFileSync(file, 'utf8');
31:       if (!data || !data.endsWith('\n')) fail('receiver_store_corrupt');
32:       const lines = data.slice(0, -1).split('\n');
33:       for (const line of lines) {
34:         const event = parse(line), { recordHash, ...body } = event;
35:         if (event.seq !== events.length + 1 || event.previousHash !== (events.at(-1)?.recordHash || 'origin') || recordHash !== hash(body)) fail('receiver_store_corrupt');
36:         if (!events.length) { if (event.type !== 'origin' || typeof event.identity !== 'string') fail('receiver_store_corrupt'); identity = event.identity; }
37:         else if (event.type === 'begin') {
38:           if (records.has(event.commandId) || event.originalBinding.receiverStoreIdentity !== identity || !sameDispatch(event.originalBinding, event.originalBinding) || event.commandDigest !== hash(event.command)) fail('receiver_store_corrupt');
39:           records.set(event.commandId, { state: 'ongoing', command: event.command, originalBinding: event.originalBinding });
40:         } else if (event.type === 'complete' || event.type === 'unknown') {
41:           const prior = records.get(event.commandId);
42:           if (!prior || prior.state !== 'ongoing') fail('receiver_store_corrupt');
43:           records.set(event.commandId, { ...prior, state: event.type === 'complete' ? 'completed' : 'unknown', ...(event.response ? { response: event.response } : {}) });
44:         } else if (event.type === 'terminal-read-failure-disposition') {
45:           const prior = records.get(event.commandId);
46:           if (!prior || prior.state !== 'unknown' || prior.terminalDisposition || !installationContext || Object.keys(installationContext).some(key => !['descriptorPath', 'cepDir'].includes(key))) fail('receiver_disposition_context');
47:           const semantic = validateDisposition(event, { ...installationContext, journalPrefixBytes: Buffer.from(lines.slice(0, 3).join('\n') + '\n') });
48:           if (canonical(prior.command) !== canonical(semantic.command) || canonical(prior.originalBinding) !== canonical(semantic.binding)) fail('receiver_disposition_binding');
49:           records.set(event.commandId, { ...prior, terminalDisposition: { version: 1, pins: semantic.pins, result: semantic.result } });
50:         } else fail('receiver_store_corrupt');
51:         events.push(event);
52:       }
53:     } else { identity = id('receiver-store'); append({ type: 'origin', identity }); }
54:     if ([...records.values()].some(r => !isSettled(r))) closed = true;
55:   } catch { fault = true; closed = true; }
56:   return Object.freeze({
57:     get identity() { return identity; },
58:     get closed() { return closed || fault; },
59:     get fault() { return fault; },
60:     has(commandId) { return records.has(commandId); },
61:     get(commandId) { if (fault) return undefined; const value = records.get(commandId); return value && JSON.parse(canonical(value)); },
62:     begin(command, originalBinding) {
63:       if (records.has(command.commandId)) fail('duplicate_command_no_replay');
64:       if (closed || fault || [...records.values()].some(r => !isSettled(r))) fail('receiver_lane_closed');
65:       if (!sameDispatch(originalBinding, originalBinding) || originalBinding.receiverStoreIdentity !== identity) fail('receiver_store_binding');
66:       append({ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding });
67:       records.set(command.commandId, { state: 'ongoing', command: JSON.parse(canonical(command)), originalBinding });
68:     },
```

