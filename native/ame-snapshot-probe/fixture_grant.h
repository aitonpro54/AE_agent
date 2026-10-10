#pragma once
#include "probe_io.h"

namespace probe {
// Protocol 2 is deliberately independent from the unsigned ACK protocol 1.
std::string CanonicalSignedFields(const Fields& fields);
void VerifySignedFields(const Fields& fields, const std::string& key);
// Trust is established independently of time: an expired, authentic descriptor
// can authorize a bound control refusal, never a host/project operation.
struct FixtureLaunch {
    std::string stage_id, role, fixture, source_root, baseline_sha;
    std::uint64_t expires_ms = 0;
};
FixtureLaunch ValidateFixtureLaunch(const Fields& fields, const Binding& binding,
    const std::string& key, const std::string& plugin_path,
    const std::string& executable_path, const std::string& executable_sha);
void RequireFixtureLaunchFresh(const FixtureLaunch& launch, std::uint64_t now_ms);
// Shared by startup refusals and normal signed control receipts. No key bytes
// are serialized. Publication still uses OwnedRoot's held-handle safeguards.
std::string SignedFixtureReceipt(const std::string& body, const std::string& key);
// Caller must hold an exclusive Claim obtained only after ValidateFixtureLaunch.
// This control-only refusal never extends the descriptor's host authority.
void WriteFixtureStartupRefusal(OwnedRoot& root, const Binding& binding,
    const FixtureLaunch& launch, const std::string& key, const std::string& build_id,
    const std::string& reason, bool hook_registration_attempted);
// Separate historical channel: only a trusted descriptor already expired at
// refused_at_ms, before any Adobe suite acquisition. It cannot become a grant.
void WriteFixtureExpiredLaunchRefusal(OwnedRoot& root, const Binding& binding,
    const FixtureLaunch& launch, const std::string& key, const std::string& executable_sha,
    const std::string& manifest_sha, std::uint64_t refused_at_ms);
struct FixtureGrant {
    std::string operation, stage_id, fixture, action_id, run_id, payload_sha,
        checkpoint_sha, contract_version, mac;
    std::uint64_t revision = 0, expires_ms = 0;
    bool restore_dirty = false;
    std::string ReceiptJson() const;
};
FixtureGrant ValidateFixtureGrant(const Fields& fields, const Binding& binding,
    const std::string& key, const std::string& operation, const std::string& fingerprint,
    const std::string& stage_id, const std::string& fixture, std::uint64_t now_ms);
// Flush a CREATE_NEW receipt before any AE/fixture writer. Failed publication or
// crash after consume is terminal/unknown; the caller must never retry that phase.
void ConsumeFixtureGrant(OwnedRoot& root, const FixtureGrant& grant);
} // namespace probe
