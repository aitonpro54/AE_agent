#pragma once
#include "service_protocol.h"
#include <memory>
#include <vector>

namespace ame_service {
inline constexpr std::size_t kMaxSignedBytes = 16384;
inline constexpr std::size_t kMaxExchangeBytes = 65536;
inline constexpr std::uint64_t kInspectTtlMs = 10000;
inline constexpr std::uint64_t kEnrollmentTtlMs = 60000;
inline constexpr std::size_t kMaxInspectItems = 256, kMaxInspectLayers = 1024, kMaxInspectGraphBytes = 1048576;
struct IssuerPin { std::string key_id, public_blob_hex; };
struct SignedClaims {
    std::string purpose, key_id, nonce;
    ServiceIdentity service;
    ProcessIdentity daemon;
    std::string generation, source_sha256; // provenance, NOT loaded-JS attestation
    std::uint64_t issued_ms = 0, expires_ms = 0;
    std::string expected_path, action_id, proposal_revision, payload_sha256;
    std::string preview_sha256, dry_run_sha256, run_id, enrollment_sha256;
    std::string signature_hex, signed_bytes;
};
SignedClaims ParseSignedClaims(std::string_view bytes);
std::string EncodeSignedClaims(const SignedClaims& claims); // no signature
std::string HexBytes(std::string_view bytes);
std::string UnhexBytes(std::string_view hex, std::size_t max_bytes);
std::uint64_t CanonicalUnsigned(std::string_view text, bool allow_zero = false);

// Only the pinned verifier can manufacture a dispatchable ticket. Plain parsed
// claims and old Request/FixedDaemonEnrollment are never capabilities.
class VerifiedInspectTicket final {
    SignedClaims claims_;
    explicit VerifiedInspectTicket(SignedClaims claims) : claims_(std::move(claims)) {}
    friend class AuthorizationVerifier;
public:
    VerifiedInspectTicket(const VerifiedInspectTicket&) = delete;
    VerifiedInspectTicket& operator=(const VerifiedInspectTicket&) = delete;
    VerifiedInspectTicket(VerifiedInspectTicket&&) noexcept = default;
    const SignedClaims& Claims() const noexcept { return claims_; }
};
class SignatureVerifier {
public:
    virtual ~SignatureVerifier() = default;
    virtual bool Verify(const IssuerPin&, std::string_view bytes, std::string_view signature_hex) = 0;
    virtual std::string Digest(std::string_view bytes) = 0;
};
class AuthorizationVerifier final {
    IssuerPin pin_;
    ServiceIdentity service_;
    SignatureVerifier& crypto_;
    std::unique_ptr<SignedClaims> enrollment_;
    std::vector<std::string> used_nonces_;
    bool closed_ = false;
    void Validate(const SignedClaims&, const ProcessIdentity&, std::uint64_t, std::string_view purpose);
public:
    AuthorizationVerifier(IssuerPin pin, ServiceIdentity service, SignatureVerifier& crypto);
    VerifiedInspectTicket VerifyExchange(std::string_view enrollment_bytes, std::string_view inspect_bytes,
        const ProcessIdentity& kernel_peer, std::uint64_t now_ms);
    void Close() noexcept { closed_ = true; }
};
struct InspectionSnapshot {
    std::string path, handle_identity, revision, graph_json, graph_sha256;
    bool dirty = false, complete = false;
    std::size_t item_count = 0, layer_count = 0;
};
// Shared with the actual reader: overflow refuses the whole inspection.
void RequireInspectionItemCount(std::size_t count);
void RequireInspectionFresh(const VerifiedInspectTicket&, std::uint64_t now_ms, const std::atomic<bool>* canceled = nullptr);
void RequireStableInspection(const InspectionSnapshot& before, const InspectionSnapshot& after,
    const VerifiedInspectTicket& ticket);
std::string InspectResponse(const VerifiedInspectTicket&, const InspectionSnapshot&);
std::string InspectRefusal(std::string_view nonce, std::string_view challenge, const char* reason);
} // namespace ame_service
