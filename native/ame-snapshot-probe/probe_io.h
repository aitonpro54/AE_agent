#pragma once
// Original probe code. Licensed Adobe SDK files remain outside this repository.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <cstdint>
#include <array>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>
#ifdef PROBE_OFFLINE_HARNESS
#include <functional>
#endif

namespace probe {
struct Failure : std::runtime_error { using std::runtime_error::runtime_error; };
struct Handle {
    HANDLE value = INVALID_HANDLE_VALUE;
    Handle() = default;
    explicit Handle(HANDLE h) : value(h) {}
    ~Handle();
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    Handle(Handle&& other) noexcept;
    Handle& operator=(Handle&& other) noexcept;
};
using Fields = std::map<std::string, std::string>;
std::string Utf8(const std::wstring& value);
std::wstring Wide(const std::string& value);
std::string Json(const std::string& value);
std::string Sha256(const std::string& bytes);
std::string RandomToken();
std::uint64_t NowMs();
bool LowerHex(const std::string& value, size_t length);
Fields ParseFields(const std::string& bytes);
void ExactKeys(const Fields& fields, const std::vector<std::string>& keys);
std::uint64_t Decimal(const std::string& value);
std::wstring Canonical(const std::wstring& path);
std::wstring ModulePath(HMODULE module);
std::string FileHash(const std::wstring& path);
Handle LockReadFile(const std::wstring& path);
// Path-only host save has no verified continuously held safe destination writer.
// This build has no override and dispatches neither fixture mutations nor AEP saves.
[[noreturn]] void RequireProjectWriteContract();

struct FileIdentity {
    std::uint64_t volume = 0;
    std::array<unsigned char, 16> file_id{};
    bool operator==(const FileIdentity& other) const { return volume == other.volume && file_id == other.file_id; }
};
#ifdef PROBE_OFFLINE_HARNESS
enum class PublicationStage { AfterPrecheck, AfterFlushBeforeRename };
using PublicationInterleaving = std::function<void(PublicationStage, const std::wstring&, const std::wstring&)>;
#endif

// Holds EVERY directory component without FILE_SHARE_DELETE for the process lifetime.
// These locks protect directory identity, not child insertion by a filesystem writer.
// Control receipts retain their READ|WRITE|DELETE producer handle with SHARE_READ.
class OwnedRoot {
    struct RetainedFile { Handle handle; FileIdentity identity; std::string sha256; };
    std::wstring path_;
    std::vector<Handle> directories_;
    Handle owner_;
    std::map<std::wstring, RetainedFile> retained_files_;
    std::set<std::wstring> attempted_publications_;
#ifdef PROBE_OFFLINE_HARNESS
    PublicationInterleaving publication_interleaving_;
#endif
public:
    explicit OwnedRoot(const std::wstring& path, const std::string& nonce);
    const std::wstring& path() const { return path_; }
    std::wstring Child(const std::wstring& basename) const;
    bool Exists(const std::wstring& basename) const;
    std::string Read(const std::wstring& basename) const;
    void WriteNew(const std::wstring& basename, const std::string& bytes);
    std::string Hash(const std::wstring& basename) const;
    void Claim(const std::string& receipt);
#ifdef PROBE_OFFLINE_HARNESS
    // Deterministic interleavings exist only in the separate offline executable.
    void InterleavePublicationForTest(PublicationInterleaving hook) { publication_interleaving_ = std::move(hook); }
#endif
};
struct Binding {
    std::string nonce, challenge, build_sha, root_path;
    std::uint64_t pid = 0, process_created_ms = 0;
};
struct Ack {
    std::string operation, fixture, expected_sha, request_id, attempt_id;
    bool restore_dirty = false;
    std::uint64_t expires_ms = 0;
};
// Strict, closed schema. No scripts, executable arguments or caller output paths.
Ack ValidateAck(const Fields& fields, const Binding& binding,
                const std::string& operation, const std::string& expected_sha,
                std::uint64_t now_ms);
std::string ProvenanceJson(const Ack& ack);
} // namespace probe
