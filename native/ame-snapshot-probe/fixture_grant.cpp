#include "fixture_grant.h"
#include <algorithm>

namespace probe {
static void Need(bool ok, const char* code) { if (!ok) throw Failure(code); }
std::string CanonicalSignedFields(const Fields& f) {
    std::string bytes;
    for (const auto& entry : f) if (entry.first != "mac") bytes += entry.first + "=" + entry.second + "\n";
    // Reuse the bounded closed line grammar. Canonical bytes always use LF.
    (void)ParseFields(bytes); return bytes;
}
void VerifySignedFields(const Fields& f, const std::string& key) {
    Need(f.count("mac") && LowerHex(f.at("mac"), 64), "signed_mac_required");
    const auto actual = Hmac256(key, CanonicalSignedFields(f));
    unsigned char difference = 0;
    for (size_t i = 0; i < actual.size(); ++i) difference |= actual[i] ^ f.at("mac")[i];
    Need(difference == 0, "signed_mac_mismatch");
}
static bool Id(const std::string& s) {
    return s.size() >= 8 && s.size() <= 128 && std::all_of(s.begin(), s.end(), [](char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '.';
    });
}
FixtureGrant ValidateFixtureGrant(const Fields& f, const Binding& b, const std::string& key,
    const std::string& operation, const std::string& fingerprint, const std::string& stage,
    const std::string& fixture, std::uint64_t now) {
    ExactKeys(f, {"protocol", "operation", "stage_id", "nonce", "challenge", "pid", "process_created_unix_ms",
        "plugin_sha256", "root_path", "expected_sha256", "fixture", "restore_dirty", "expires_unix_ms",
        "action_id", "revision", "payload_sha256", "run_id", "checkpoint_sha256", "contract_version", "mac"});
    VerifySignedFields(f, key);
    Need(f.at("protocol") == "2" && f.at("nonce") == b.nonce && f.at("challenge") == b.challenge &&
        f.at("plugin_sha256") == b.build_sha && f.at("root_path") == b.root_path &&
        Decimal(f.at("pid")) == b.pid && Decimal(f.at("process_created_unix_ms")) == b.process_created_ms, "fixture_grant_child_binding");
    Need(LowerHex(stage, 32) && f.at("stage_id") == stage && f.at("operation") == operation &&
        LowerHex(fingerprint, 64) && f.at("expected_sha256") == fingerprint && f.at("fixture") == fixture, "fixture_grant_phase_or_stale");
    Need(fixture == "saved-clean" || fixture == "saved-dirty" || fixture == "untitled-dirty", "fixture_grant_kind");
    Need(operation == "create-fixture" || operation == "snapshot" || operation == "stage-variants", "fixture_grant_operation");
    const auto expiry = Decimal(f.at("expires_unix_ms"));
    Need(expiry > now && expiry - now <= 300000, "fixture_grant_expiry");
    Need(Id(f.at("action_id")) && Id(f.at("run_id")) && LowerHex(f.at("payload_sha256"), 64) &&
        LowerHex(f.at("checkpoint_sha256"), 64) && Id(f.at("contract_version")), "fixture_grant_provenance");
    Need(f.at("restore_dirty") == "0" || f.at("restore_dirty") == "1", "fixture_grant_dirty_flag");
    Need(operation == "snapshot" || f.at("restore_dirty") == "0", "fixture_grant_dirty_phase");
    FixtureGrant g; g.operation = operation; g.stage_id = stage; g.fixture = fixture; g.action_id = f.at("action_id");
    g.run_id = f.at("run_id"); g.payload_sha = f.at("payload_sha256"); g.checkpoint_sha = f.at("checkpoint_sha256");
    g.contract_version = f.at("contract_version"); g.revision = Decimal(f.at("revision")); g.expires_ms = expiry;
    g.restore_dirty = f.at("restore_dirty") == "1"; g.mac = f.at("mac"); return g;
}
std::string FixtureGrant::ReceiptJson() const {
    return "{\"operation\":" + Json(operation) + ",\"stageId\":" + Json(stage_id) + ",\"actionId\":" + Json(action_id) +
        ",\"revision\":" + std::to_string(revision) + ",\"runId\":" + Json(run_id) + ",\"payloadSha256\":" + Json(payload_sha) +
        ",\"checkpointSha256\":" + Json(checkpoint_sha) + ",\"contractVersion\":" + Json(contract_version) +
        ",\"expiresUnixMs\":" + std::to_string(expires_ms) + ",\"grantMac\":" + Json(mac) + "}";
}
void ConsumeFixtureGrant(OwnedRoot& root, const FixtureGrant& g) {
    root.WriteNew(Wide("signed-" + g.operation + ".consumed.json"),
        "{\"schema\":\"ae-agent.native-fixture-consume.v2\",\"status\":\"consumed_before_dispatch\",\"replayAllowed\":false,\"grant\":" + g.ReceiptJson() + "}\n");
}
} // namespace probe
