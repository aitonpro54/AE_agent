#include "service_protocol.h"
#include <array>
#include <limits>

namespace ame_service {
void Require(bool condition, const char* reason) { if (!condition) throw Failure(reason); }
bool LowerHex(std::string_view text, std::size_t length) noexcept {
    if (text.size() != length) return false;
    for (const auto c : text) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
    return true;
}
namespace {
std::uint64_t Decimal(std::string_view text) {
    Require(!text.empty() && text.size() <= 20 && text[0] != '0', "invalid_decimal_identity");
    std::uint64_t value = 0;
    for (const auto c : text) {
        Require(c >= '0' && c <= '9', "invalid_decimal_identity");
        const auto digit = static_cast<unsigned>(c - '0');
        Require(value <= (std::numeric_limits<std::uint64_t>::max() - digit) / 10, "identity_decimal_overflow");
        value = value * 10 + digit;
    }
    return value;
}
bool BuildId(std::string_view value) noexcept {
    return value.size() == 38 && value.substr(0, 6) == "build-" && LowerHex(value.substr(6), 32);
}
void ValidateProcess(const ProcessIdentity& process) {
    Require(process.pid != 0, "invalid_pid");
    (void)Decimal(process.birth_100ns);
    Require(!process.image_path.empty() && process.image_path.size() <= 32768,
        "invalid_process_image_path");
    Require(LowerHex(process.image_sha256, 64), "invalid_process_image_sha256");
}
}
std::string Json(std::string_view text) {
    std::string out = "\"";
    constexpr char hex[] = "0123456789abcdef";
    for (const unsigned char c : text) {
        if (c == '"' || c == '\\') { out += '\\'; out += static_cast<char>(c); }
        else if (c < 32) { out += "\\u00"; out += hex[c >> 4]; out += hex[c & 15]; }
        else out += static_cast<char>(c);
    }
    return out + '"';
}
bool SameProcess(const ProcessIdentity& a, const ProcessIdentity& b) noexcept {
    return a.pid == b.pid && a.birth_100ns == b.birth_100ns &&
        a.image_path == b.image_path && a.image_sha256 == b.image_sha256;
}
void ValidateIdentity(const ServiceIdentity& identity) {
    ValidateProcess(identity.host);
    Require(!identity.plugin_path.empty() && identity.plugin_path.size() <= 32768, "invalid_plugin_path");
    Require(LowerHex(identity.plugin_sha256, 64), "invalid_plugin_sha256");
    Require(BuildId(identity.build_id), "invalid_build_id");
    Require(LowerHex(identity.sdk_archive_sha256, 64), "invalid_sdk_archive_sha256");
    Require(LowerHex(identity.challenge, 64), "invalid_service_challenge");
}
std::string PublicIdentityJson(const ServiceIdentity& identity) {
    ValidateIdentity(identity);
    return "{\"schema\":\"ae-agent.snapshot-service.identity.v1\",\"status\":\"dormant\","
        "\"productionReady\":false,\"authenticated\":false,\"projectFactsExposed\":false,"
        "\"ipcListenerStarted\":false,\"reason\":" + Json(kAuthorizationGap) +
        ",\"capabilities\":{\"read_only_identity\":true,\"project_inspect\":false,\"snapshot_mutation\":false},"
        "\"host\":{\"pid\":" + std::to_string(identity.host.pid) + ",\"birth100ns\":" + Json(identity.host.birth_100ns) +
        ",\"imagePath\":" + Json(identity.host.image_path) + ",\"imageSha256\":" + Json(identity.host.image_sha256) +
        "},\"pluginPath\":" + Json(identity.plugin_path) + ",\"pluginSha256\":" + Json(identity.plugin_sha256) +
        ",\"buildId\":" + Json(identity.build_id) + ",\"sdkArchiveSha256\":" + Json(identity.sdk_archive_sha256) +
        ",\"challenge\":" + Json(identity.challenge) + "}\n";
}
Request ParseRequest(std::string_view bytes) {
    Require(!bytes.empty() && bytes.size() <= kMaxRequestBytes && bytes.back() == '\n', "request_size_or_framing_invalid");
    // Canonical ASCII LF frame; CR, NUL, Unicode, duplicate/extra/missing keys,
    // separators and alternate decimal spellings are rejected before dispatch.
    for (const unsigned char c : bytes) Require(c == '\n' || (c >= 32 && c <= 126), "request_noncanonical_byte");
    constexpr std::array<std::string_view, 10> keys{{"schema", "operation", "nonce", "challenge", "host_pid",
        "host_birth_100ns", "host_image_sha256", "plugin_sha256", "build_id", "sdk_archive_sha256"}};
    std::array<std::string_view, 10> values{};
    std::size_t offset = 0;
    for (std::size_t index = 0; index < keys.size(); ++index) {
        const auto end = bytes.find('\n', offset);
        Require(end != std::string_view::npos, "request_exact_schema_required");
        const auto line = bytes.substr(offset, end - offset);
        const auto separator = line.find('=');
        Require(separator != std::string_view::npos && line.substr(0, separator) == keys[index], "request_exact_schema_required");
        values[index] = line.substr(separator + 1);
        Require(!values[index].empty() && values[index].find('=') == std::string_view::npos, "request_value_invalid");
        offset = end + 1;
    }
    Require(offset == bytes.size() && values[0] == "ae-agent.snapshot-service.request.v1", "request_exact_schema_required");
    Request request;
    if (values[1] == "identity") request.operation = Operation::Identity;
    else if (values[1] == "inspect") request.operation = Operation::Inspect;
    else if (values[1] == "capture") request.operation = Operation::Capture;
    else throw Failure("operation_not_supported");
    Require(LowerHex(values[2], 64) && LowerHex(values[3], 64), "request_nonce_challenge_invalid");
    request.nonce = values[2]; request.challenge = values[3];
    const auto pid = Decimal(values[4]);
    Require(pid <= std::numeric_limits<std::uint32_t>::max(), "invalid_pid");
    request.host_pid = static_cast<std::uint32_t>(pid);
    (void)Decimal(values[5]); request.host_birth_100ns = values[5];
    Require(LowerHex(values[6], 64) && LowerHex(values[7], 64) && LowerHex(values[9], 64), "request_hash_invalid");
    Require(BuildId(values[8]), "invalid_build_id");
    request.host_image_sha256 = values[6]; request.plugin_sha256 = values[7];
    request.build_id = values[8]; request.sdk_archive_sha256 = values[9];
    return request;
}
void RequireTarget(const Request& r, const ServiceIdentity& i) {
    ValidateIdentity(i);
    Require(r.challenge == i.challenge && r.host_pid == i.host.pid && r.host_birth_100ns == i.host.birth_100ns &&
        r.host_image_sha256 == i.host.image_sha256 && r.plugin_sha256 == i.plugin_sha256 &&
        r.build_id == i.build_id && r.sdk_archive_sha256 == i.sdk_archive_sha256, "service_identity_binding_mismatch");
}
std::string RefusalJson(const Request& request, const char* reason) {
    return "{\"schema\":\"ae-agent.snapshot-service.response.v1\",\"status\":\"refused\",\"nonce\":" + Json(request.nonce) +
        ",\"challenge\":" + Json(request.challenge) + ",\"reason\":" + Json(reason) +
        ",\"projectFactsExposed\":false,\"mutationAttempted\":false,\"replayAllowed\":false}\n";
}
const char* ProductionAuthorizationGap() noexcept { return kAuthorizationGap; }
std::string RejectCandidate(std::string_view bytes, const ServiceIdentity& identity,
    const ProcessIdentity& observed_peer, const FixedDaemonEnrollment* enrollment) {
    const auto request = ParseRequest(bytes);
    RequireTarget(request, identity);
    if (!enrollment) return RefusalJson(request, kAuthorizationGap);
    ValidateProcess(observed_peer); ValidateProcess(enrollment->daemon); ValidateProcess(enrollment->host);
    Require(SameProcess(observed_peer, enrollment->daemon) && SameProcess(identity.host, enrollment->host) &&
        enrollment->plugin_sha256 == identity.plugin_sha256, "fixed_daemon_identity_mismatch");
    // Even a matching candidate is not signed verified enrollment. Do not add
    // a caller-controlled bool/key/ENV bypass here.
    return RefusalJson(request, kAuthorizationGap);
}
bool RequestMailbox::Push(const Request& request) {
    Require(LowerHex(request.nonce, 64), "mailbox_nonce_invalid");
    std::lock_guard<std::mutex> lock(mutex_);
    if (closed_ || queue_.size() >= kMaxQueuedRequests) return false;
    for (const auto& nonce : nonces_) if (nonce == request.nonce) return false;
    if (nonces_.size() >= kMaxNonces) { closed_ = true; queue_.clear(); return false; }
    nonces_.push_back(request.nonce);
    try { queue_.push_back(request); }
    catch (...) { closed_ = true; queue_.clear(); throw; } // never forget a possibly consumed nonce
    return true;
}
bool RequestMailbox::Pop(Request& request) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (closed_ || queue_.empty()) return false;
    request = std::move(queue_.front()); queue_.pop_front(); return true;
}
void RequestMailbox::Close() noexcept {
    std::lock_guard<std::mutex> lock(mutex_); closed_ = true; queue_.clear();
}
} // namespace ame_service
