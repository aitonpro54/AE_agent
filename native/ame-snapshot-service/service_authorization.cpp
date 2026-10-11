#include "service_authorization.h"
#include <array>
#include <limits>

namespace ame_service {
std::uint64_t CanonicalUnsigned(std::string_view text, bool allow_zero) {
    Require(!text.empty() && text.size() <= 20 && (text == "0" ? allow_zero : text.front() != '0'), "noncanonical_unsigned");
    std::uint64_t value = 0;
    for (const char c : text) {
        Require(c >= '0' && c <= '9', "noncanonical_unsigned");
        const auto digit = static_cast<unsigned>(c - '0');
        Require(value <= (std::numeric_limits<std::uint64_t>::max() - digit) / 10, "unsigned_overflow");
        value = value * 10 + digit;
    }
    return value;
}
std::string HexBytes(std::string_view bytes) {
    constexpr char digits[] = "0123456789abcdef";
    std::string out; out.reserve(bytes.size() * 2);
    for (const unsigned char c : bytes) { out += digits[c >> 4]; out += digits[c & 15]; }
    return out;
}
std::string UnhexBytes(std::string_view hex, std::size_t max_bytes) {
    Require(hex.size() % 2 == 0 && hex.size() / 2 <= max_bytes && LowerHex(hex, hex.size()), "noncanonical_hex_bytes");
    const auto digit = [](char c) { return c <= '9' ? c - '0' : c - 'a' + 10; };
    std::string out; out.reserve(hex.size() / 2);
    for (std::size_t i = 0; i < hex.size(); i += 2) out += static_cast<char>((digit(hex[i]) << 4) | digit(hex[i + 1]));
    return out;
}
namespace {
constexpr std::array<const char*, 31> keys{{"schema", "purpose", "key_id", "nonce", "challenge", "host_pid",
    "host_birth_100ns", "host_image_path_hex", "host_image_sha256", "plugin_path_hex", "plugin_sha256", "build_id",
    "sdk_archive_sha256", "daemon_pid", "daemon_birth_100ns", "daemon_image_path_hex", "daemon_image_sha256",
    "generation", "source_sha256", "issued_ms", "expires_ms", "expected_path_hex", "action_id_hex", "proposal_revision",
    "payload_sha256", "preview_sha256", "dry_run_sha256", "run_id_hex", "enrollment_sha256", "autonomous", "signature"}};
std::string Field(const std::string& value) { return value.empty() ? "-" : HexBytes(value); }
std::string Decode(std::string_view value) {
    auto out = value == "-" ? "" : UnhexBytes(value, 2048);
    for (const unsigned char c : out) Require(c >= 32 && c != 127, "decoded_control_byte");
    return out;
}
void Path(const std::string& path) {
    Require(path.size() > 3 && path.size() <= 2048 && path[1] == ':' && path[2] == '\\' &&
        path.find('/') == std::string::npos && path.find("\\..") == std::string::npos &&
        path.find("\\.\\") == std::string::npos && path.find(':', 2) == std::string::npos, "absolute_saved_path_required");
}
void Process(const ProcessIdentity& identity) {
    Require(identity.pid != 0, "invalid_pid"); (void)CanonicalUnsigned(identity.birth_100ns);
    Path(identity.image_path); Require(LowerHex(identity.image_sha256, 64), "invalid_process_image_sha256");
}
}
std::string EncodeSignedClaims(const SignedClaims& c) {
    const std::array<std::string, 30> values{{"ae-agent.snapshot-service.authorization.v2", c.purpose, c.key_id, c.nonce,
        c.service.challenge, std::to_string(c.service.host.pid), c.service.host.birth_100ns, Field(c.service.host.image_path),
        c.service.host.image_sha256, Field(c.service.plugin_path), c.service.plugin_sha256, c.service.build_id,
        c.service.sdk_archive_sha256, std::to_string(c.daemon.pid), c.daemon.birth_100ns, Field(c.daemon.image_path),
        c.daemon.image_sha256, c.generation, c.source_sha256, std::to_string(c.issued_ms), std::to_string(c.expires_ms),
        Field(c.expected_path), Field(c.action_id), c.proposal_revision.empty() ? "-" : c.proposal_revision,
        c.payload_sha256.empty() ? "-" : c.payload_sha256, c.preview_sha256.empty() ? "-" : c.preview_sha256,
        c.dry_run_sha256.empty() ? "-" : c.dry_run_sha256, Field(c.run_id),
        c.enrollment_sha256.empty() ? "-" : c.enrollment_sha256, "false"}};
    std::string out;
    for (std::size_t i = 0; i < values.size(); ++i) out += std::string(keys[i]) + '=' + values[i] + '\n';
    Require(out.size() + 139 <= kMaxSignedBytes, "signed_frame_limit"); return out;
}
SignedClaims ParseSignedClaims(std::string_view bytes) {
    Require(!bytes.empty() && bytes.size() <= kMaxSignedBytes && bytes.back() == '\n', "signed_frame_limit");
    for (const unsigned char c : bytes) Require(c == '\n' || (c >= 32 && c <= 126), "signed_noncanonical_byte");
    std::array<std::string_view, 31> v{}; std::size_t offset = 0, signed_end = 0;
    for (std::size_t i = 0; i < keys.size(); ++i) {
        const auto end = bytes.find('\n', offset); Require(end != std::string_view::npos, "signed_exact_schema_required");
        const auto line = bytes.substr(offset, end - offset);
        const auto separator = line.find('=');
        Require(separator != std::string_view::npos && line.substr(0, separator) == keys[i], "signed_exact_schema_required");
        v[i] = line.substr(separator + 1);
        Require(!v[i].empty() && v[i].find('=') == std::string_view::npos, "signed_value_invalid");
        if (i == 30) signed_end = offset;
        offset = end + 1;
    }
    Require(offset == bytes.size() && v[0] == "ae-agent.snapshot-service.authorization.v2", "signed_exact_schema_required");
    Require(v[1] == "enrollment" || v[1] == "inspect", "signed_purpose_forbidden");
    SignedClaims c; c.purpose = v[1]; c.key_id = v[2]; c.nonce = v[3]; c.service.challenge = v[4];
    Require(LowerHex(c.key_id, 32) && LowerHex(c.nonce, 64), "signed_key_nonce_invalid");
    const auto host_pid = CanonicalUnsigned(v[5]), daemon_pid = CanonicalUnsigned(v[13]);
    Require(host_pid <= UINT32_MAX && daemon_pid <= UINT32_MAX, "invalid_pid");
    c.service.host = {static_cast<std::uint32_t>(host_pid), std::string(v[6]), Decode(v[7]), std::string(v[8])};
    c.service.plugin_path = Decode(v[9]); c.service.plugin_sha256 = v[10]; c.service.build_id = v[11]; c.service.sdk_archive_sha256 = v[12];
    c.daemon = {static_cast<std::uint32_t>(daemon_pid), std::string(v[14]), Decode(v[15]), std::string(v[16])};
    ValidateIdentity(c.service); Process(c.service.host); Path(c.service.plugin_path); Process(c.daemon);
    c.generation = v[17]; c.source_sha256 = v[18]; Require(LowerHex(c.generation, 32) && LowerHex(c.source_sha256, 64), "daemon_generation_invalid");
    c.issued_ms = CanonicalUnsigned(v[19]); c.expires_ms = CanonicalUnsigned(v[20]);
    c.expected_path = Decode(v[21]); c.action_id = Decode(v[22]); c.proposal_revision = v[23] == "-" ? "" : std::string(v[23]);
    c.payload_sha256 = v[24] == "-" ? "" : std::string(v[24]); c.preview_sha256 = v[25] == "-" ? "" : std::string(v[25]);
    c.dry_run_sha256 = v[26] == "-" ? "" : std::string(v[26]); c.run_id = Decode(v[27]); c.enrollment_sha256 = v[28] == "-" ? "" : std::string(v[28]);
    Require(v[29] == "false", "autonomous_inspect_forbidden");
    Require(LowerHex(v[30], 128), "signature_encoding_invalid"); c.signature_hex = v[30]; c.signed_bytes = bytes.substr(0, signed_end);
    if (c.purpose == "enrollment") {
        Require(c.expected_path.empty() && c.action_id.empty() && c.proposal_revision.empty() && c.payload_sha256.empty() &&
            c.preview_sha256.empty() && c.dry_run_sha256.empty() && c.run_id.empty() && c.enrollment_sha256.empty(), "enrollment_scope_invalid");
    } else {
        Path(c.expected_path); Require(!c.action_id.empty() && !c.run_id.empty(), "manual_context_missing");
        (void)CanonicalUnsigned(c.proposal_revision);
        Require(LowerHex(c.payload_sha256, 64) && LowerHex(c.preview_sha256, 64) && LowerHex(c.dry_run_sha256, 64) &&
            LowerHex(c.enrollment_sha256, 64), "manual_context_hash_invalid");
    }
    Require(EncodeSignedClaims(c) == c.signed_bytes, "signed_noncanonical_encoding"); return c;
}
AuthorizationVerifier::AuthorizationVerifier(IssuerPin pin, ServiceIdentity service, SignatureVerifier& crypto)
    : pin_(std::move(pin)), service_(std::move(service)), crypto_(crypto) {
    ValidateIdentity(service_);
    Require(LowerHex(pin_.key_id, 32) && LowerHex(pin_.public_blob_hex, 144), "issuer_pin_missing_or_invalid");
}
void AuthorizationVerifier::Validate(const SignedClaims& c, const ProcessIdentity& peer, std::uint64_t now, std::string_view purpose) {
    Require(c.purpose == purpose && c.key_id == pin_.key_id, "issuer_key_or_purpose_mismatch");
    Require(crypto_.Verify(pin_, c.signed_bytes, c.signature_hex), "issuer_signature_invalid");
    Require(SameProcess(c.service.host, service_.host) && c.service.plugin_path == service_.plugin_path &&
        c.service.plugin_sha256 == service_.plugin_sha256 && c.service.build_id == service_.build_id &&
        c.service.sdk_archive_sha256 == service_.sdk_archive_sha256 && c.service.challenge == service_.challenge, "service_identity_binding_mismatch");
    Require(SameProcess(c.daemon, peer), "fixed_daemon_identity_mismatch");
    const auto ttl = purpose == "inspect" ? kInspectTtlMs : kEnrollmentTtlMs;
    Require(c.issued_ms <= now && now < c.expires_ms && c.expires_ms > c.issued_ms && c.expires_ms - c.issued_ms <= ttl,
        "authorization_expired_or_ttl_invalid");
}
VerifiedInspectTicket AuthorizationVerifier::VerifyExchange(std::string_view enrollment_bytes, std::string_view inspect_bytes,
    const ProcessIdentity& peer, std::uint64_t now) {
    Require(!closed_, "authorization_closed");
    auto e = ParseSignedClaims(enrollment_bytes); auto i = ParseSignedClaims(inspect_bytes);
    Validate(e, peer, now, "enrollment"); Validate(i, peer, now, "inspect");
    Require(i.generation == e.generation && i.source_sha256 == e.source_sha256 && i.expires_ms <= e.expires_ms &&
        i.enrollment_sha256 == crypto_.Digest(enrollment_bytes), "enrollment_binding_mismatch");
    const bool new_enrollment = !enrollment_ || enrollment_->signed_bytes != e.signed_bytes;
    if (enrollment_) {
        Require(SameProcess(enrollment_->daemon, e.daemon) && enrollment_->generation == e.generation &&
            enrollment_->source_sha256 == e.source_sha256, "enrollment_already_fixed");
        if (new_enrollment) Require(e.issued_ms > enrollment_->issued_ms && e.expires_ms > enrollment_->expires_ms,
            "enrollment_renewal_not_monotonic");
    }
    Require(i.nonce != e.nonce, "authorization_nonce_replay");
    for (const auto& used : used_nonces_) Require(used != i.nonce && (!new_enrollment || used != e.nonce), "authorization_nonce_replay");
    const auto required = new_enrollment ? 2u : 1u;
    if (used_nonces_.size() + required > RequestMailbox::kMaxNonces) { closed_ = true; throw Failure("authorization_nonce_capacity"); }
    // Keep old enrollment and inspect nonces even after renewal/cancellation.
    try {
        if (new_enrollment) used_nonces_.push_back(e.nonce);
        used_nonces_.push_back(i.nonce); // never forgotten, including timeouts/refusals
        if (new_enrollment) enrollment_ = std::make_unique<SignedClaims>(e);
    } catch (...) { closed_ = true; throw; }
    return VerifiedInspectTicket(std::move(i));
}
void RequireInspectionItemCount(std::size_t count) { Require(count <= kMaxInspectItems, "inspection_item_limit"); }
void RequireInspectionFresh(const VerifiedInspectTicket& ticket, std::uint64_t now, const std::atomic<bool>* canceled) {
    Require(!canceled || !canceled->load(std::memory_order_acquire), "inspection_canceled");
    Require(now < ticket.Claims().expires_ms, "inspection_expired");
}
void RequireStableInspection(const InspectionSnapshot& a, const InspectionSnapshot& b, const VerifiedInspectTicket& ticket) {
    Require(!a.path.empty() && !b.path.empty(), "untitled_project_denied");
    Require(a.path == ticket.Claims().expected_path && b.path == ticket.Claims().expected_path, "saved_project_path_mismatch");
    Require(a.complete && b.complete && !a.handle_identity.empty() && !a.revision.empty() && !b.revision.empty(), "inspection_coverage_incomplete");
    Require(!a.graph_json.empty() && !b.graph_json.empty() && LowerHex(a.graph_sha256, 64) && LowerHex(b.graph_sha256, 64), "inspection_coverage_incomplete");
    RequireInspectionItemCount(a.item_count); RequireInspectionItemCount(b.item_count);
    Require(a.layer_count <= kMaxInspectLayers && b.layer_count <= kMaxInspectLayers &&
        a.graph_json.size() <= kMaxInspectGraphBytes && b.graph_json.size() <= kMaxInspectGraphBytes, "inspection_coverage_limit");
    (void)CanonicalUnsigned(a.revision, true); (void)CanonicalUnsigned(b.revision, true);
    Require(a.handle_identity == b.handle_identity && a.revision == b.revision && a.dirty == b.dirty &&
        a.graph_json == b.graph_json && a.graph_sha256 == b.graph_sha256 &&
        a.item_count == b.item_count && a.layer_count == b.layer_count, "inspection_stale");
}
std::string InspectResponse(const VerifiedInspectTicket& t, const InspectionSnapshot& s) {
    RequireStableInspection(s, s, t);
    return "{\"schema\":\"ae-agent.snapshot-service.response.v2\",\"status\":\"inspected\",\"nonce\":" + Json(t.Claims().nonce) +
        ",\"challenge\":" + Json(t.Claims().service.challenge) + ",\"path\":" + Json(s.path) + ",\"projectHandle\":" + Json(s.handle_identity) +
        ",\"projectRevision\":" + Json(s.revision) + ",\"dirty\":" + (s.dirty ? "true" : "false") +
        ",\"coverage\":{\"scope\":\"bounded_project_graph\",\"completeWithinScope\":true,\"fullProjectContext\":false,"
        "\"maxItems\":256,\"maxLayers\":1024,\"maxGraphBytes\":1048576,\"itemCount\":" + std::to_string(s.item_count) +
        ",\"layerCount\":" + std::to_string(s.layer_count) +
        ",\"included\":[\"item_identity_parent_selection_flags\",\"active_item_layer_ids\",\"item_time_dimensions_mru_view_handle\","
        "\"comp_timing_flags_downsample\",\"layer_identity_source_switches_timing\",\"plain_source_text_at_current_time\",\"footage_proxy_file_links\"],"
        "\"notInspected\":[\"effects\",\"keyframes\",\"expressions\",\"text_formatting\",\"render_queue\",\"viewer_settings\",\"undo_history\"]},"
        "\"graphSha256\":" + Json(s.graph_sha256) + ",\"graph\":" + s.graph_json +
        ",\"mutationAttempted\":false,\"saveDispatches\":0,\"captureDispatches\":0,\"callerJsxDispatches\":0}\n";
}
std::string InspectRefusal(std::string_view nonce, std::string_view challenge, const char* reason) {
    return "{\"schema\":\"ae-agent.snapshot-service.response.v2\",\"status\":\"refused\",\"nonce\":" + Json(nonce) +
        ",\"challenge\":" + Json(challenge) + ",\"reason\":" + Json(reason) + ",\"projectFactsExposed\":false,\"mutationAttempted\":false}\n";
}
} // namespace ame_service
