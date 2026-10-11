#include "service_crypto.h"
#include "service_build_identity.h"
#include <ncrypt.h>
#include <sddl.h>
#include <memory>

namespace ame_service {
namespace {
constexpr const wchar_t* key_name = L"AEAgent.NativeSnapshot.InspectionIssuer.v2";
std::vector<unsigned char> Binary(std::string_view hex, std::size_t limit) {
    const auto decoded = UnhexBytes(hex, limit); return {decoded.begin(), decoded.end()};
}
std::string PublicKey(BCRYPT_KEY_HANDLE key) {
    DWORD count = 0; Require(BCryptExportKey(key, nullptr, BCRYPT_ECCPUBLIC_BLOB, nullptr, 0, &count, 0) == 0 && count == 72, "issuer_public_export_failed");
    std::string bytes(count, '\0'); Require(BCryptExportKey(key, nullptr, BCRYPT_ECCPUBLIC_BLOB, reinterpret_cast<PUCHAR>(bytes.data()), count, &count, 0) == 0, "issuer_public_export_failed");
    return HexBytes(bytes);
}
IssuerPin Pin(std::string blob) { return {Sha256Bytes(UnhexBytes(blob, 72)).substr(0, 32), std::move(blob)}; }
struct KeyStore {
    NCRYPT_PROV_HANDLE provider = 0;
    NCRYPT_KEY_HANDLE key = 0;
    KeyStore() { Require(NCryptOpenStorageProvider(&provider, MS_KEY_STORAGE_PROVIDER, 0) == ERROR_SUCCESS, "issuer_keystore_unavailable"); }
    ~KeyStore() { if (key) NCryptFreeObject(key); if (provider) NCryptFreeObject(provider); }
};
std::string StoredPublicKey(NCRYPT_KEY_HANDLE key) {
    DWORD count = 0; Require(NCryptExportKey(key, 0, BCRYPT_ECCPUBLIC_BLOB, nullptr, nullptr, 0, &count, 0) == ERROR_SUCCESS && count == 72, "issuer_public_export_failed");
    std::string bytes(count, '\0'); Require(NCryptExportKey(key, 0, BCRYPT_ECCPUBLIC_BLOB, nullptr, reinterpret_cast<PBYTE>(bytes.data()), count, &count, 0) == ERROR_SUCCESS, "issuer_public_export_failed");
    return HexBytes(bytes);
}
std::wstring WideAscii(std::string_view s) { return {s.begin(), s.end()}; }
void RequireKeyDacl(NCRYPT_KEY_HANDLE key) {
    DWORD size = 0; Require(NCryptGetProperty(key, NCRYPT_SECURITY_DESCR_PROPERTY, nullptr, 0, &size, DACL_SECURITY_INFORMATION) == ERROR_SUCCESS && size <= 8192, "issuer_dacl_unavailable");
    std::vector<unsigned char> storage(size);
    Require(NCryptGetProperty(key, NCRYPT_SECURITY_DESCR_PROPERTY, storage.data(), size, &size, DACL_SECURITY_INFORMATION) == ERROR_SUCCESS, "issuer_dacl_unavailable");
    LPWSTR text = nullptr;
    Require(ConvertSecurityDescriptorToStringSecurityDescriptorW(storage.data(), SDDL_REVISION_1, DACL_SECURITY_INFORMATION, &text, nullptr), "issuer_dacl_invalid");
    std::unique_ptr<wchar_t, decltype(&LocalFree)> owned(text, &LocalFree);
    Require(Utf8(text) == CurrentUserDacl(), "issuer_dacl_mismatch");
}
}
std::string Sha256Bytes(std::string_view bytes) {
    Require(bytes.size() <= 4 * 1024 * 1024, "digest_input_limit");
    unsigned char digest[32]{};
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    Require(BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) == 0, "hash_algorithm_unavailable");
    const auto status = BCryptHash(algorithm, nullptr, 0, reinterpret_cast<PUCHAR>(const_cast<char*>(bytes.data())),
        static_cast<ULONG>(bytes.size()), digest, sizeof(digest));
    BCryptCloseAlgorithmProvider(algorithm, 0); Require(status == 0, "hash_failed");
    return HexBytes({reinterpret_cast<const char*>(digest), sizeof(digest)});
}
std::uint64_t NowMs() {
    FILETIME time{}; GetSystemTimeAsFileTime(&time); ULARGE_INTEGER n{}; n.LowPart = time.dwLowDateTime; n.HighPart = time.dwHighDateTime;
    return n.QuadPart / 10000 - 11644473600000ULL;
}
IssuerPin CompiledIssuerPin() { return {SNAPSHOT_SERVICE_ISSUER_KEY_ID, SNAPSHOT_SERVICE_ISSUER_PUBLIC_BLOB_HEX}; }
bool CngVerifier::Verify(const IssuerPin& pin, std::string_view bytes, std::string_view signature) {
    if (!LowerHex(pin.public_blob_hex, 144) || !LowerHex(signature, 128) || pin.key_id != Pin(pin.public_blob_hex).key_id) return false;
    auto blob = Binary(pin.public_blob_hex, 72), sig = Binary(signature, 64), digest = Binary(Sha256Bytes(bytes), 32);
    BCRYPT_ALG_HANDLE algorithm = nullptr; BCRYPT_KEY_HANDLE key = nullptr;
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_ECDSA_P256_ALGORITHM, nullptr, 0) != 0) return false;
    bool valid = false;
    if (BCryptImportKeyPair(algorithm, nullptr, BCRYPT_ECCPUBLIC_BLOB, &key, blob.data(), static_cast<ULONG>(blob.size()), 0) == 0)
        valid = BCryptVerifySignature(key, nullptr, digest.data(), static_cast<ULONG>(digest.size()), sig.data(), static_cast<ULONG>(sig.size()), 0) == 0;
    if (key) BCryptDestroyKey(key); BCryptCloseAlgorithmProvider(algorithm, 0); return valid;
}
std::string CurrentUserDacl() {
    HANDLE token = nullptr; Require(OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token), "issuer_user_token_unavailable"); Handle owned(token);
    DWORD size = 0; GetTokenInformation(token, TokenUser, nullptr, 0, &size); Require(size > 0 && size <= 4096, "issuer_user_sid_invalid");
    std::vector<unsigned char> storage(size); Require(GetTokenInformation(token, TokenUser, storage.data(), size, &size), "issuer_user_sid_invalid");
    LPWSTR sid = nullptr; Require(ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(storage.data())->User.Sid, &sid), "issuer_user_sid_invalid");
    std::unique_ptr<wchar_t, decltype(&LocalFree)> text(sid, &LocalFree);
    return "D:P(A;;GA;;;SY)(A;;GA;;;" + Utf8(sid) + ")";
}
IssuerPin ProvisionIssuer() {
    KeyStore store;
    const auto existing = NCryptOpenKey(store.provider, &store.key, key_name, 0, NCRYPT_SILENT_FLAG);
    Require(existing == NTE_BAD_KEYSET || existing == NTE_NOT_FOUND, "issuer_already_exists_or_state_unknown_no_regeneration");
    Require(NCryptCreatePersistedKey(store.provider, &store.key, NCRYPT_ECDSA_P256_ALGORITHM, key_name, 0, 0) == ERROR_SUCCESS, "issuer_create_failed_no_retry");
    DWORD policy = 0;
    Require(NCryptSetProperty(store.key, NCRYPT_EXPORT_POLICY_PROPERTY, reinterpret_cast<PBYTE>(&policy), sizeof(policy), 0) == ERROR_SUCCESS, "issuer_export_policy_failed");
    const auto sddl = WideAscii(CurrentUserDacl()); PSECURITY_DESCRIPTOR descriptor = nullptr;
    Require(ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(), SDDL_REVISION_1, &descriptor, nullptr), "issuer_dacl_invalid");
    std::unique_ptr<void, decltype(&LocalFree)> owned(descriptor, &LocalFree);
    Require(NCryptSetProperty(store.key, NCRYPT_SECURITY_DESCR_PROPERTY, static_cast<PBYTE>(descriptor), GetSecurityDescriptorLength(descriptor),
        DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION) == ERROR_SUCCESS, "issuer_dacl_set_failed_no_retry");
    Require(NCryptFinalizeKey(store.key, NCRYPT_SILENT_FLAG) == ERROR_SUCCESS, "issuer_finalize_failed_no_retry");
    RequireKeyDacl(store.key); return Pin(StoredPublicKey(store.key));
}
std::string SignWithProvisionedIssuer(const IssuerPin& pin, std::string_view canonical_bytes) {
    Require(LowerHex(pin.key_id, 32) && LowerHex(pin.public_blob_hex, 144), "issuer_pin_missing_or_invalid");
    // Reject forbidden/noncanonical commands before opening persisted storage.
    (void)ParseSignedClaims(std::string(canonical_bytes) + "signature=" + std::string(128, '0') + '\n');
    KeyStore store; Require(NCryptOpenKey(store.provider, &store.key, key_name, 0, NCRYPT_SILENT_FLAG) == ERROR_SUCCESS, "issuer_not_provisioned");
    RequireKeyDacl(store.key); Require(Pin(StoredPublicKey(store.key)).key_id == pin.key_id && StoredPublicKey(store.key) == pin.public_blob_hex, "issuer_pin_mismatch");
    // Sign only exact allowlisted canonical schemas; no generic signing oracle.
    auto digest = Binary(Sha256Bytes(canonical_bytes), 32); DWORD size = 0;
    Require(NCryptSignHash(store.key, nullptr, digest.data(), static_cast<DWORD>(digest.size()), nullptr, 0, &size, NCRYPT_SILENT_FLAG) == ERROR_SUCCESS && size == 64, "issuer_sign_failed");
    std::string signature(size, '\0'); Require(NCryptSignHash(store.key, nullptr, digest.data(), static_cast<DWORD>(digest.size()), reinterpret_cast<PBYTE>(signature.data()), size, &size, NCRYPT_SILENT_FLAG) == ERROR_SUCCESS, "issuer_sign_failed");
    return HexBytes(signature);
}
EphemeralTestIssuer::EphemeralTestIssuer() {
    Require(BCryptOpenAlgorithmProvider(&algorithm_, BCRYPT_ECDSA_P256_ALGORITHM, nullptr, 0) == 0, "test_issuer_unavailable");
    if (BCryptGenerateKeyPair(algorithm_, &key_, 256, 0) != 0 || BCryptFinalizeKeyPair(key_, 0) != 0) {
        if (key_) BCryptDestroyKey(key_); BCryptCloseAlgorithmProvider(algorithm_, 0); algorithm_ = nullptr; key_ = nullptr; throw Failure("test_issuer_unavailable");
    }
}
EphemeralTestIssuer::~EphemeralTestIssuer() { if (key_) BCryptDestroyKey(key_); if (algorithm_) BCryptCloseAlgorithmProvider(algorithm_, 0); }
IssuerPin EphemeralTestIssuer::Pin() { return ame_service::Pin(PublicKey(key_)); }
std::string EphemeralTestIssuer::Sign(std::string_view bytes) {
    auto digest = Binary(Sha256Bytes(bytes), 32); DWORD size = 0;
    Require(BCryptSignHash(key_, nullptr, digest.data(), static_cast<ULONG>(digest.size()), nullptr, 0, &size, 0) == 0 && size == 64, "test_sign_failed");
    std::string signature(size, '\0'); Require(BCryptSignHash(key_, nullptr, digest.data(), static_cast<ULONG>(digest.size()), reinterpret_cast<PUCHAR>(signature.data()), size, &size, 0) == 0, "test_sign_failed"); return HexBytes(signature);
}
} // namespace ame_service
