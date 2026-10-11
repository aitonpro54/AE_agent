#pragma once
#include "service_authorization.h"
#include "service_win32.h"
#include <bcrypt.h>

namespace ame_service {
std::string Sha256Bytes(std::string_view bytes);
std::uint64_t NowMs();
IssuerPin CompiledIssuerPin();
class CngVerifier final : public SignatureVerifier {
public:
    bool Verify(const IssuerPin&, std::string_view, std::string_view) override;
    std::string Digest(std::string_view bytes) override { return Sha256Bytes(bytes); }
};
// Fixed current-user nonexportable CNG key. Provision is a separate explicit
// administrative action, NEVER an open/sign fallback or startup side effect.
IssuerPin ProvisionIssuer();
std::string SignWithProvisionedIssuer(const IssuerPin&, std::string_view canonical_bytes);
std::string CurrentUserDacl();
class EphemeralTestIssuer final {
    BCRYPT_ALG_HANDLE algorithm_ = nullptr;
    BCRYPT_KEY_HANDLE key_ = nullptr;
public:
    EphemeralTestIssuer();
    ~EphemeralTestIssuer();
    EphemeralTestIssuer(const EphemeralTestIssuer&) = delete;
    EphemeralTestIssuer& operator=(const EphemeralTestIssuer&) = delete;
    IssuerPin Pin();
    std::string Sign(std::string_view bytes);
};
} // namespace ame_service
