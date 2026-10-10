#include "probe_io.h"
#include <bcrypt.h>
#include <algorithm>
#include <limits>
#pragma comment(lib, "bcrypt.lib")

namespace probe {
Handle::~Handle() { if (value != INVALID_HANDLE_VALUE && value != nullptr) CloseHandle(value); }
Handle::Handle(Handle&& other) noexcept : value(other.value) { other.value = INVALID_HANDLE_VALUE; }
Handle& Handle::operator=(Handle&& other) noexcept {
    if (this != &other) {
        if (value != INVALID_HANDLE_VALUE && value != nullptr) CloseHandle(value);
        value = other.value; other.value = INVALID_HANDLE_VALUE;
    }
    return *this;
}
static void Require(bool ok, const char* reason) { if (!ok) throw Failure(reason); }
std::string Utf8(const std::wstring& value) {
    if (value.empty()) return {};
    int n = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    Require(n > 0, "invalid_utf16");
    std::string out(n, '\0');
    Require(WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), out.data(), n, nullptr, nullptr) == n, "utf8_conversion");
    return out;
}
std::wstring Wide(const std::string& value) {
    if (value.empty()) return {};
    int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
    Require(n > 0, "invalid_utf8");
    std::wstring out(n, L'\0');
    Require(MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), out.data(), n) == n, "utf16_conversion");
    return out;
}
std::string Json(const std::string& value) {
    (void)Wide(value); // also validates caller UTF-8
    std::string out = "\"";
    const char* hex = "0123456789abcdef";
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') { out += '\\'; out += static_cast<char>(c); }
        else if (c < 32) { out += "\\u00"; out += hex[c >> 4]; out += hex[c & 15]; }
        else out += static_cast<char>(c);
    }
    return out + "\"";
}
static std::string Hex(const unsigned char* bytes, size_t count) {
    const char* hex = "0123456789abcdef";
    std::string out; out.reserve(count * 2);
    for (size_t i = 0; i < count; ++i) { out += hex[bytes[i] >> 4]; out += hex[bytes[i] & 15]; }
    return out;
}
class Hasher {
    BCRYPT_ALG_HANDLE algorithm_ = nullptr;
    BCRYPT_HASH_HANDLE hash_ = nullptr;
    std::vector<unsigned char> object_;
public:
    explicit Hasher(const std::string& key = {}) {
        Require(BCryptOpenAlgorithmProvider(&algorithm_, BCRYPT_SHA256_ALGORITHM, nullptr, key.empty() ? 0 : BCRYPT_ALG_HANDLE_HMAC_FLAG) >= 0, "sha_provider");
        DWORD size = 0, got = 0;
        if (BCryptGetProperty(algorithm_, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&size), sizeof(size), &got, 0) < 0) { BCryptCloseAlgorithmProvider(algorithm_, 0); throw Failure("sha_object"); }
        object_.resize(size);
        if (BCryptCreateHash(algorithm_, &hash_, object_.data(), size, key.empty() ? nullptr : reinterpret_cast<PUCHAR>(const_cast<char*>(key.data())), static_cast<ULONG>(key.size()), 0) < 0) { BCryptCloseAlgorithmProvider(algorithm_, 0); throw Failure("sha_create"); }
    }
    ~Hasher() { if (hash_) BCryptDestroyHash(hash_); if (algorithm_) BCryptCloseAlgorithmProvider(algorithm_, 0); }
    void Add(const void* bytes, DWORD count) { Require(BCryptHashData(hash_, reinterpret_cast<PUCHAR>(const_cast<void*>(bytes)), count, 0) >= 0, "sha_add"); }
    std::string Finish() { unsigned char digest[32]; Require(BCryptFinishHash(hash_, digest, 32, 0) >= 0, "sha_finish"); return Hex(digest, 32); }
};
std::string Sha256(const std::string& bytes) { Require(bytes.size() <= MAXDWORD, "sha_too_large"); Hasher h; h.Add(bytes.data(), static_cast<DWORD>(bytes.size())); return h.Finish(); }
std::string Hmac256(const std::string& hex, const std::string& bytes) {
    Require(LowerHex(hex, 64) && bytes.size() <= MAXDWORD, "hmac_input");
    std::string key; key.reserve(32);
    auto nibble = [](char c) { return c <= '9' ? c - '0' : c - 'a' + 10; };
    for (size_t i = 0; i < hex.size(); i += 2) key += static_cast<char>((nibble(hex[i]) << 4) | nibble(hex[i + 1]));
    Hasher h(key); h.Add(bytes.data(), static_cast<DWORD>(bytes.size())); return h.Finish();
}
std::string RandomToken() { unsigned char b[16]; Require(BCryptGenRandom(nullptr, b, sizeof(b), BCRYPT_USE_SYSTEM_PREFERRED_RNG) >= 0, "nonce_rng"); return Hex(b, sizeof(b)); }
std::uint64_t NowMs() { FILETIME t; GetSystemTimeAsFileTime(&t); ULARGE_INTEGER u; u.LowPart = t.dwLowDateTime; u.HighPart = t.dwHighDateTime; return u.QuadPart / 10000 - 11644473600000ULL; }
bool LowerHex(const std::string& value, size_t length) { return value.size() == length && std::all_of(value.begin(), value.end(), [](char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }); }
std::uint64_t Decimal(const std::string& s) {
    Require(!s.empty() && s.size() <= 20 && !(s.size() > 1 && s[0] == '0'), "invalid_decimal");
    std::uint64_t n = 0;
    for (char c : s) { Require(c >= '0' && c <= '9', "invalid_decimal"); Require(n <= (std::numeric_limits<std::uint64_t>::max() - (c - '0')) / 10, "decimal_overflow"); n = n * 10 + c - '0'; }
    return n;
}
Fields ParseFields(const std::string& bytes) {
    Require(!bytes.empty() && bytes.size() <= 32768 && bytes.back() == '\n', "manifest_size_or_termination");
    (void)Wide(bytes);
    Fields fields;
    size_t start = 0;
    while (start < bytes.size()) {
        size_t end = bytes.find('\n', start);
        std::string line = bytes.substr(start, end - start);
        if (!line.empty() && line.back() == '\r') line.pop_back();
        size_t sep = line.find('=');
        Require(sep > 0 && sep != std::string::npos, "manifest_line");
        std::string key = line.substr(0, sep), value = line.substr(sep + 1);
        Require(key.size() <= 64 && !value.empty(), "manifest_key_value");
        for (char c : key) Require((c >= 'a' && c <= 'z') || c == '_' || (c >= '0' && c <= '9'), "manifest_key");
        for (unsigned char c : value) Require(c >= 32 && c != 127, "manifest_control_character");
        Require(fields.emplace(key, value).second && fields.size() <= 24, "duplicate_or_many_fields");
        start = end + 1;
    }
    return fields;
}
void ExactKeys(const Fields& fields, const std::vector<std::string>& keys) { Require(fields.size() == keys.size(), "manifest_schema"); for (const auto& key : keys) Require(fields.count(key) == 1, "manifest_schema"); }
std::wstring Canonical(const std::wstring& path) {
    Require(path.size() > 3 && path.size() < 220 && path[1] == L':' && path[2] == L'\\' && ((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z')), "local_absolute_path_required");
    Require(path.find(L'/') == std::wstring::npos && path.find(L':', 2) == std::wstring::npos, "path_syntax");
    wchar_t out[32768]; DWORD count = GetFullPathNameW(path.c_str(), 32768, out, nullptr);
    Require(count > 0 && count < 32768, "canonical_path");
    std::wstring canonical(out, count);
    Require(_wcsicmp(path.c_str(), canonical.c_str()) == 0 && path.back() != L'\\', "path_not_canonical");
    size_t start = 3;
    while (start < path.size()) {
        size_t end = path.find(L'\\', start); if (end == std::wstring::npos) end = path.size();
        auto part = path.substr(start, end - start);
        Require(!part.empty() && part.back() != L'.' && part.back() != L' ', "path_component");
        Require(part.find_first_of(L"*?\"<>|") == std::wstring::npos, "path_component");
        start = end + 1;
    }
    return canonical;
}
static void VerifyHandle(HANDLE handle, const std::wstring& path, bool directory) {
    Require(handle != INVALID_HANDLE_VALUE, "file_open");
    BY_HANDLE_FILE_INFORMATION info{};
    Require(GetFileInformationByHandle(handle, &info) != 0, "file_info");
    Require(!(info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) && !!(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == directory, "reparse_or_wrong_type");
    if (!directory) Require(info.nNumberOfLinks == 1, "hardlink_refused");
    wchar_t out[32768]; DWORD n = GetFinalPathNameByHandleW(handle, out, 32768, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
    Require(n > 4 && n < 32768 && std::wstring(out, 4) == L"\\\\?\\", "final_path");
    const std::wstring actual(out + 4, n - 4);
    if (_wcsicmp(actual.c_str(), path.c_str()) != 0) throw Failure("final_path_mismatch:expected=" + Utf8(path) + ";actual=" + Utf8(actual));
}
std::wstring ModulePath(HMODULE module) { wchar_t b[32768]; DWORD n = GetModuleFileNameW(module, b, 32768); Require(n && n < 32768, "module_path"); return Canonical(std::wstring(b, n)); }
static Handle ReadHandle(const std::wstring& path) { Handle h(CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr)); VerifyHandle(h.value, path, false); return h; }
Handle LockReadFile(const std::wstring& path) { return ReadHandle(Canonical(path)); }
[[noreturn]] void RequireProjectWriteContract() { throw Failure("destination_write_contract_unverified"); }
static FileIdentity Identity(HANDLE handle) {
    FILE_ID_INFO info{}; Require(GetFileInformationByHandleEx(handle, FileIdInfo, &info, sizeof(info)) != 0, "file_identity");
    FileIdentity identity; identity.volume = info.VolumeSerialNumber;
    std::copy(std::begin(info.FileId.Identifier), std::end(info.FileId.Identifier), identity.file_id.begin()); return identity;
}
static void Rewind(HANDLE handle) { LARGE_INTEGER zero{}; Require(SetFilePointerEx(handle, zero, nullptr, FILE_BEGIN) != 0, "file_seek_zero"); }
static std::string HashHandle(HANDLE handle) {
    Rewind(handle); Hasher hasher;
    std::vector<char> b(65536); DWORD got = 0;
    do { Require(ReadFile(handle, b.data(), static_cast<DWORD>(b.size()), &got, nullptr) != 0, "hash_read"); if (got) hasher.Add(b.data(), got); } while (got);
    return hasher.Finish();
}
std::string FileHash(const std::wstring& path) { auto h = ReadHandle(Canonical(path)); return HashHandle(h.value); }
OwnedRoot::OwnedRoot(const std::wstring& path, const std::string& nonce) : path_(Canonical(path)) {
    Require(LowerHex(nonce, 32), "invalid_boot_nonce");
    Require(path_.substr(path_.find_last_of(L'\\') + 1) == L"probe-" + Wide(nonce), "root_nonce_leaf_required");
    size_t end = 3;
    for (;;) {
        std::wstring component = path_.substr(0, end);
        const DWORD access = FILE_READ_ATTRIBUTES | (end == path_.size() ? FILE_LIST_DIRECTORY : 0);
        Handle h(CreateFileW(component.c_str(), access, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
        VerifyHandle(h.value, component, true); directories_.push_back(std::move(h));
        if (end == path_.size()) break;
        end = path_.find(L'\\', end + (end == 3 ? 0 : 1));
        if (end == std::wstring::npos) end = path_.size();
    }
}
std::wstring OwnedRoot::Child(const std::wstring& basename) const { Require(!basename.empty() && basename.find_first_of(L"\\/:*?\"<>|") == std::wstring::npos && basename.back() != L'.' && basename.back() != L' ' && basename != L"..", "child_basename"); return path_ + L"\\" + basename; }
bool OwnedRoot::Exists(const std::wstring& basename) const { DWORD attrs = GetFileAttributesW(Child(basename).c_str()); if (attrs != INVALID_FILE_ATTRIBUTES) return true; DWORD e = GetLastError(); Require(e == ERROR_FILE_NOT_FOUND, "unexpected_file_status"); return false; }
std::string OwnedRoot::Read(const std::wstring& basename) const {
    const auto retained = retained_files_.find(basename);
    Handle opened; HANDLE handle = INVALID_HANDLE_VALUE;
    if (retained != retained_files_.end()) {
        handle = retained->second.handle.value; VerifyHandle(handle, Child(basename), false);
        Require(Identity(handle) == retained->second.identity, "retained_file_identity_changed");
    } else { opened = ReadHandle(Child(basename)); handle = opened.value; }
    Rewind(handle); LARGE_INTEGER n; Require(GetFileSizeEx(handle, &n) && n.QuadPart > 0 && n.QuadPart <= 32768, "control_file_size");
    std::string bytes(static_cast<size_t>(n.QuadPart), '\0'); DWORD got = 0;
    Require(ReadFile(handle, bytes.data(), static_cast<DWORD>(bytes.size()), &got, nullptr) && got == bytes.size(), "control_file_read");
    if (retained != retained_files_.end()) Require(Sha256(bytes) == retained->second.sha256, "retained_file_bytes_changed");
    return bytes;
}
static void WriteAndFlush(HANDLE handle, const std::string& bytes) {
    Require(bytes.size() <= MAXDWORD, "receipt_size");
    DWORD wrote = 0; Require(WriteFile(handle, bytes.data(), static_cast<DWORD>(bytes.size()), &wrote, nullptr) && wrote == bytes.size(), "receipt_write");
    Require(FlushFileBuffers(handle) != 0, "receipt_flush");
}
void OwnedRoot::WriteFixtureAsset(const std::wstring& basename, const std::string& bytes) {
    Require(basename == L"fixture.bmp" || basename == L"proxy.bmp", "fixed_fixture_asset_only");
    Require(attempted_publications_.emplace(basename).second && !Exists(basename), "asset_exists_no_replay");
    const auto target = Child(basename);
    Handle h(CreateFileW(target.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, CREATE_NEW,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr));
    VerifyHandle(h.value, target, false); WriteAndFlush(h.value, bytes);
    Require(HashHandle(h.value) == Sha256(bytes), "asset_same_handle_bytes");
}
void OwnedRoot::WriteNew(const std::wstring& basename, const std::string& bytes) {
    Require(attempted_publications_.emplace(basename).second, "receipt_attempt_terminal_no_replay");
    Require(!Exists(basename), "receipt_exists_no_replay");
    const auto temporary_name = basename + L".part", temporary = Child(temporary_name), final = Child(basename);
#ifdef PROBE_OFFLINE_HARNESS
    if (publication_interleaving_) publication_interleaving_(PublicationStage::AfterPrecheck, temporary, final);
#endif
    Require(retained_files_.count(temporary_name) == 0 && retained_files_.count(basename) == 0, "receipt_retained_collision");
    // Allocate ownership before opening: every successfully created handle remains
    // retained even if validation, flush or publication later fails.
    auto inserted = retained_files_.emplace(temporary_name, RetainedFile{});
    auto& retained = inserted.first->second;
    retained.handle = Handle(CreateFileW(temporary.c_str(), GENERIC_READ | GENERIC_WRITE | DELETE,
        FILE_SHARE_READ, nullptr, CREATE_NEW,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr));
    Require(retained.handle.value != INVALID_HANDLE_VALUE, "receipt_part_collision_no_replay");
    VerifyHandle(retained.handle.value, temporary, false);
    retained.identity = Identity(retained.handle.value); retained.sha256 = Sha256(bytes);
    WriteAndFlush(retained.handle.value, bytes);
    Require(HashHandle(retained.handle.value) == retained.sha256, "receipt_same_handle_bytes");
#ifdef PROBE_OFFLINE_HARNESS
    if (publication_interleaving_) publication_interleaving_(PublicationStage::AfterFlushBeforeRename, temporary, final);
#endif
    VerifyHandle(retained.handle.value, temporary, false);
    Require(Identity(retained.handle.value) == retained.identity && HashHandle(retained.handle.value) == retained.sha256, "receipt_prepublication_identity_or_bytes");
    // Immutable absolute-only publication mode, under trusted stable root/ancestors.
    // This is NOT fallback from the independently tested root-relative API.
    const size_t name_bytes = final.size() * sizeof(wchar_t);
    // Keep a NUL-terminated capacity for the Win32 wrapper; length excludes NUL.
    // A length-only buffer can expose reused suffix bytes to its path conversion.
    std::vector<unsigned char> rename_storage(sizeof(FILE_RENAME_INFO) + name_bytes + sizeof(wchar_t), 0);
    auto rename = reinterpret_cast<FILE_RENAME_INFO*>(rename_storage.data());
    rename->ReplaceIfExists = FALSE; rename->RootDirectory = nullptr;
    rename->FileNameLength = static_cast<DWORD>(name_bytes);
    std::copy(final.begin(), final.end(), rename->FileName);
    // The producer remains open across publication, with no path-based close/move gap.
    if (!SetFileInformationByHandle(retained.handle.value, FileRenameInfo, rename,
        static_cast<DWORD>(rename_storage.size()))) {
        const DWORD error = GetLastError();
        throw Failure("receipt_absolute_only_publish_no_replace_no_replay:win32=" + std::to_string(error));
    }
    auto node = retained_files_.extract(inserted.first); node.key() = basename;
    auto published = retained_files_.insert(std::move(node));
    const auto& held = published.position->second;
    VerifyHandle(held.handle.value, final, false);
    Require(Identity(held.handle.value) == held.identity && HashHandle(held.handle.value) == held.sha256, "receipt_postpublication_identity_or_bytes");
    Require(FlushFileBuffers(held.handle.value) != 0, "receipt_postpublication_flush");
}
std::string OwnedRoot::Hash(const std::wstring& basename) const {
    const auto retained = retained_files_.find(basename);
    if (retained == retained_files_.end()) return FileHash(Child(basename));
    VerifyHandle(retained->second.handle.value, Child(basename), false);
    Require(Identity(retained->second.handle.value) == retained->second.identity, "retained_file_identity_changed");
    auto sha = HashHandle(retained->second.handle.value);
    Require(sha == retained->second.sha256, "retained_file_bytes_changed"); return sha;
}
void OwnedRoot::Claim(const std::string& receipt) {
    // A bootstrap root must be new and contain exactly its controller launch manifest.
    WIN32_FIND_DATAW data{}; HANDLE find = FindFirstFileW((path_ + L"\\*").c_str(), &data); Require(find != INVALID_HANDLE_VALUE, "root_enumeration");
    bool good = true; size_t count = 0;
    do { std::wstring name(data.cFileName); if (name == L"." || name == L"..") continue; ++count; if (name != L"launch.manifest" || data.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) good = false; } while (FindNextFileW(find, &data));
    DWORD e = GetLastError(); FindClose(find); Require(good && count == 1 && e == ERROR_NO_MORE_FILES, "root_not_fresh_exclusive");
    owner_ = Handle(CreateFileW(Child(L"owner.lock").c_str(), GENERIC_READ | GENERIC_WRITE, 0,
        nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr));
    VerifyHandle(owner_.value, Child(L"owner.lock"), false);
    WriteAndFlush(owner_.value, receipt); // held with no sharing until host exit
}
static bool Id(const std::string& value) { return value.size() >= 8 && value.size() <= 128 && std::all_of(value.begin(), value.end(), [](char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.'; }); }
Ack ValidateAck(const Fields& f, const Binding& b, const std::string& operation, const std::string& expected, std::uint64_t now) {
    ExactKeys(f, {"protocol", "nonce", "challenge", "pid", "process_created_unix_ms", "plugin_sha256", "root_path", "operation", "expected_sha256", "fixture", "restore_dirty", "request_id", "attempt_id", "expires_unix_ms"});
    Require(f.at("protocol") == "1" && f.at("nonce") == b.nonce && f.at("challenge") == b.challenge && f.at("plugin_sha256") == b.build_sha && f.at("root_path") == b.root_path && Decimal(f.at("pid")) == b.pid && Decimal(f.at("process_created_unix_ms")) == b.process_created_ms, "ack_binding_mismatch");
    Require(f.at("operation") == operation && f.at("expected_sha256") == expected && LowerHex(expected, 64), "ack_operation_or_stale");
    auto expiry = Decimal(f.at("expires_unix_ms")); Require(expiry > now && expiry - now <= 300000, "ack_expired_or_too_far");
    Require(Id(f.at("request_id")) && Id(f.at("attempt_id")), "ack_provenance_missing");
    Require(f.at("fixture") == "saved-clean" || f.at("fixture") == "saved-dirty" || f.at("fixture") == "untitled-dirty", "unknown_fixture");
    Require(f.at("restore_dirty") == "0" || f.at("restore_dirty") == "1", "dirty_experiment_flag");
    Require(operation == "snapshot" || f.at("restore_dirty") == "0", "dirty_experiment_wrong_stage");
    Ack ack; ack.operation = operation; ack.fixture = f.at("fixture"); ack.expected_sha = expected; ack.request_id = f.at("request_id"); ack.attempt_id = f.at("attempt_id"); ack.expires_ms = expiry; ack.restore_dirty = f.at("restore_dirty") == "1"; return ack;
}
std::string ProvenanceJson(const Ack& ack) { return "{\"operation\":" + Json(ack.operation) + ",\"preparedWorkflowRequestId\":" + Json(ack.request_id) + ",\"preparedWorkflowAttemptId\":" + Json(ack.attempt_id) + ",\"expiresUnixMs\":" + std::to_string(ack.expires_ms) + ",\"fixture\":" + Json(ack.fixture) + ",\"expectedSha256\":" + Json(ack.expected_sha) + ",\"restoreDirtyExperiment\":" + (ack.restore_dirty ? "true" : "false") + "}"; }
} // namespace probe
