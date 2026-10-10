#pragma once
#include "probe_io.h"

namespace probe {
// Protocol 2 is deliberately independent from the unsigned ACK protocol 1.
std::string CanonicalSignedFields(const Fields& fields);
void VerifySignedFields(const Fields& fields, const std::string& key);
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
