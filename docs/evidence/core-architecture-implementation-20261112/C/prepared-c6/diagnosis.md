# Exact f548: cancelled test observation budget

Source/read-only diagnosis only. Original result remains FAIL/cancelled=1,
exitCode=1. No rerun, replay, cleanup, source checkout write or live AE action.

Batch35 stdout ends with both timeout30009ms and the complete exactTransition
JSON; test-process duration33498ms, runner33561ms. Transition returned after child
exit0, signed disposition verification, exact original UNKNOWN preservation,
duplicateNoReplay, lateAckCount2, peer close and additional UNKNOWN fence checks.
Thus the observed failure is the30s test observation deadline, not a hung actor
or an underlying guard failure. This completed async output is not reclassified
as a passed Node test.

Immutable artifact in stdout:343626bytes,
SHA dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8,
package f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90.

Observed isolated root `core4-native-capture-As9w1E` was created
2026-11-12T14:53:43.5267835Z (batch began14:53:43.376Z). Original provenance hash
matches f548; expected and actual current candidate both
cd0d96228f2ba674b08373adf60c95e05e01eefbe64f5333839ff9c433323f7c.
Descriptor version2. Journal types:
origin,begin,unknown,terminal-read-failure-disposition,begin,complete,begin,unknown.
Exactly one disposition; final command additional-unknown. Install/broker lock
absent. Receiver owner marker remains intentionally for the final additional
UNKNOWN, as asserted by transition source. Nothing removed or resumed.

Settlement readback: original batch PID14960 absent; read-only Win32_Process
query found0 Node command lines matching this exact fixture-root basename.
No unrelated processes were controlled. Child exit is also awaited in the driver
before the observed returned result. TEMP roots remain evidence.

Prepared fix: only exact-f548 test timeout30s→90s, matching the existing portable
installed transition budget. All exact artifact hashes, A_HASH/DRIVER_HASH,
protocol, guards and production timeouts remain unchanged. Only node --check
is allowed in this prep block; fresh acceptance rerun belongs to root after apply.

C5 clarification: the4.2.2 legacy registry patch preserves its existing catalog
revision as an opaque reader tag; it does not invoke selectedCatalogRevision or
claim a regenerated legacy identity. Unversioned4.2.2 policy is not fed into the
packaging-only policy2 preimage generator.
