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
FixtureLaunch ValidateFixtureLaunch(const Fields& f, const Binding& b, const std::string& key,
    const std::string& plugin_path, const std::string& executable_path, const std::string& executable_sha) {
    ExactKeys(f, {"protocol", "nonce", "plugin_path", "plugin_sha256", "root_path", "stage_id", "role", "fixture",
        "executable_path", "executable_sha256", "source_root", "baseline_sha256", "expires_unix_ms", "mac"});
    Need(LowerHex(key, 64), "child_session_key_required");
    VerifySignedFields(f, key);
    Need(f.at("protocol") == "2" && LowerHex(b.nonce, 32) && LowerHex(b.build_sha, 64) &&
        f.at("nonce") == b.nonce && f.at("plugin_path") == plugin_path &&
        f.at("plugin_sha256") == b.build_sha && f.at("root_path") == b.root_path, "launch_manifest_binding_mismatch");
    Need(LowerHex(executable_sha, 64) && f.at("executable_path") == executable_path &&
        f.at("executable_sha256") == executable_sha, "signed_host_image_mismatch");
    FixtureLaunch launch; launch.stage_id = f.at("stage_id"); launch.role = f.at("role"); launch.fixture = f.at("fixture");
    launch.source_root = f.at("source_root"); launch.baseline_sha = f.at("baseline_sha256");
    Need(LowerHex(launch.stage_id, 32) && (launch.role == "capture" || launch.role == "stage") &&
        (launch.fixture == "saved-clean" || launch.fixture == "saved-dirty" || launch.fixture == "untitled-dirty") &&
        LowerHex(launch.baseline_sha, 64), "signed_launch_scope");
    if (launch.role == "capture") Need(launch.source_root == b.root_path && launch.baseline_sha == std::string(64, '0'), "capture_launch_source");
    else {
        // Validate the descriptor's source shape without opening or reading the
        // source project. Source handles and baseline hashes require freshness.
        const auto source = Canonical(Wide(launch.source_root));
        const auto leaf = source.substr(source.find_last_of(L'\\') + 1);
        Need(Utf8(source) == launch.source_root && leaf.size() == 38 && leaf.substr(0, 6) == L"probe-" &&
            LowerHex(Utf8(leaf.substr(6)), 32) && source != Canonical(Wide(b.root_path)), "stage_source_owned_leaf");
    }
    launch.expires_ms = Decimal(f.at("expires_unix_ms"));
    return launch;
}
void RequireFixtureLaunchFresh(const FixtureLaunch& launch, std::uint64_t now) {
    Need(launch.expires_ms > now && launch.expires_ms - now <= 300000, "signed_launch_expired");
}
std::string SignedFixtureReceipt(const std::string& body, const std::string& key) {
    return "{\"body\":" + Json(body) + ",\"mac\":" + Json(Hmac256(key, body)) + "}\n";
}
void WriteFixtureStartupRefusal(OwnedRoot& root, const Binding& b, const FixtureLaunch& launch,
    const std::string& key, const std::string& build_id, const std::string& reason, bool hook_attempted) {
    Need(root.Claimed(), "startup_refusal_exclusive_claim_required");
    Need(LowerHex(b.nonce, 32) && LowerHex(b.challenge, 32) && LowerHex(b.build_sha, 64) &&
        b.pid != 0 && b.process_created_ms != 0 && b.root_path == Utf8(root.path()), "startup_refusal_child_binding");
    const auto body = "{\"schema\":\"ae-agent.native-fixture-probe.v2\",\"hostLoaded\":true,\"readiness\":false,\"productionAuthorization\":false,\"legacyUnsignedWrites\":\"closed\",\"ownershipContract\":\"trusted cooperative owned root and stable ancestors\",\"replayAllowed\":false,\"role\":" + Json(launch.role) +
        ",\"fixture\":" + Json(launch.fixture) + ",\"stageId\":" + Json(launch.stage_id) + ",\"nonce\":" + Json(b.nonce) +
        ",\"challenge\":" + Json(b.challenge) + ",\"pid\":" + std::to_string(b.pid) + ",\"processCreatedUnixMs\":" + std::to_string(b.process_created_ms) +
        ",\"pluginSha256\":" + Json(b.build_sha) + ",\"rootPath\":" + Json(b.root_path) + ",\"buildId\":" + Json(build_id) +
        ",\"nativeSaveDispatches\":0,\"fixtureMutationDispatches\":0,\"timestampUnixMs\":" + std::to_string(NowMs()) +
        ",\"status\":\"refused_or_unknown\",\"reason\":" + Json(reason) +
        ",\"startupRefusal\":true,\"projectApiReadDispatches\":0,\"projectMutationDispatchCount\":0,\"saveCalled\":false,\"phaseDispatchCount\":0,\"fixtureMutationMayHaveOccurred\":false,\"idleHookRegistrationAttempted\":" + (hook_attempted ? "true}" : "false}");
    root.WriteNew(L"signed-refusal.json", SignedFixtureReceipt(body, key));
}
void WriteFixtureExpiredLaunchRefusal(OwnedRoot& root, const Binding& b, const FixtureLaunch& launch,
    const std::string& key, const std::string& executable_sha, const std::string& manifest_sha, std::uint64_t refused_at) {
    Need(root.Claimed(), "bootstrap_refusal_exclusive_claim_required");
    Need(LowerHex(b.nonce, 32) && LowerHex(b.challenge, 32) && LowerHex(b.build_sha, 64) &&
        b.pid != 0 && b.process_created_ms != 0 && b.root_path == Utf8(root.path()), "bootstrap_refusal_child_binding");
    Need(LowerHex(executable_sha, 64) && LowerHex(manifest_sha, 64) && launch.expires_ms <= refused_at,
        "bootstrap_refusal_requires_expired_bound_manifest");
    const auto body = "{\"schema\":\"ae-agent.native-fixture-bootstrap-refusal.v1\",\"status\":\"bootstrap_refused_before_suite_acquisition\",\"reason\":\"signed_launch_expired\",\"hostLoaded\":true,\"productionAuthorization\":false,\"readiness\":false,\"role\":" + Json(launch.role) +
        ",\"fixture\":" + Json(launch.fixture) + ",\"stageId\":" + Json(launch.stage_id) + ",\"rootPath\":" + Json(b.root_path) +
        ",\"nonce\":" + Json(b.nonce) + ",\"challenge\":" + Json(b.challenge) + ",\"pluginSha256\":" + Json(b.build_sha) +
        ",\"executableSha256\":" + Json(executable_sha) + ",\"pid\":" + std::to_string(b.pid) + ",\"processCreatedUnixMs\":" + std::to_string(b.process_created_ms) +
        ",\"manifestSha256\":" + Json(manifest_sha) + ",\"expiresUnixMs\":" + std::to_string(launch.expires_ms) +
        ",\"refusedAtUnixMs\":" + std::to_string(refused_at) + ",\"suitesAcquired\":false,\"fixtureMutationDispatches\":0,\"nativeSaveDispatches\":0,\"replayAllowed\":false}";
    root.WriteNew(L"signed-bootstrap-refusal.json", SignedFixtureReceipt(body, key));
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
