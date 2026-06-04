# Validation Lanes

Generated lane files live here. Each lane is intentionally minimal, reproducible, and non-mutating unless a future milestone explicitly approves a broader validation mode.

The default generated lane checks readability, static safety signals, and Node syntax for `.js`, `.mjs`, and `.cjs` candidates. It does not execute arbitrary candidate behavior.

Candidates with external runtime risk signals such as network, credential, or
live-runtime access require an explicit safe lane before they can leave
`blocked`. The lane must include `external_risk_coverage.approved: true`, a
strategy of `mock`, `dry-run`, `read-only-fixture`, or `static-fixture`, and
evidence explaining why the lane does not require live services, secrets,
source writes, or unsafe candidate execution.
