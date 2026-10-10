#include "service_win32.h"
#include <bcrypt.h>
#include <ShlObj.h>
#include <algorithm>
#include <limits>
#include <memory>

namespace ame_service {
namespace {
std::string Hex(const unsigned char* bytes, std::size_t count) {
    constexpr char digits[] = "0123456789abcdef";
    std::string out; out.reserve(count * 2);
    for (std::size_t i = 0; i < count; ++i) { out += digits[bytes[i] >> 4]; out += digits[bytes[i] & 15]; }
    return out;
}
struct Hash {
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    BCRYPT_HASH_HANDLE hash = nullptr;
    std::vector<unsigned char> object;
    Hash() {
        try {
            Require(BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) == 0, "hash_algorithm_unavailable");
            DWORD size = 0, got = 0;
            Require(BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&size), sizeof(size), &got, 0) == 0 &&
                got == sizeof(size) && size > 0 && size < 65536, "hash_object_size_invalid");
            object.resize(size);
            Require(BCryptCreateHash(algorithm, &hash, object.data(), size, nullptr, 0, 0) == 0, "hash_create_failed");
        } catch (...) {
            if (hash) BCryptDestroyHash(hash);
            if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
            throw;
        }
    }
    ~Hash() { if (hash) BCryptDestroyHash(hash); if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0); }
};
std::uint64_t Birth(HANDLE process) {
    FILETIME created{}, exited{}, kernel{}, user{};
    Require(GetProcessTimes(process, &created, &exited, &kernel, &user) != FALSE, "process_birth_unavailable");
    ULARGE_INTEGER value{}; value.LowPart = created.dwLowDateTime; value.HighPart = created.dwHighDateTime;
    Require(value.QuadPart != 0, "process_birth_invalid"); return value.QuadPart;
}
void DirectoryNotReparse(const std::wstring& path, std::vector<Handle>& handles) {
    Handle handle(CreateFileW(path.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    Require(handle.get() != INVALID_HANDLE_VALUE, "receipt_directory_open_failed");
    FILE_ATTRIBUTE_TAG_INFO attributes{};
    Require(GetFileInformationByHandleEx(handle.get(), FileAttributeTagInfo, &attributes, sizeof(attributes)) &&
        (attributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) && !(attributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT),
        "receipt_directory_reparse_refused");
    handles.push_back(std::move(handle));
}
void CheckAncestors(const std::wstring& path, std::vector<Handle>& handles) {
    Require(path.size() >= 3 && path[1] == L':' && path[2] == L'\\' && path.size() <= 32000, "receipt_known_folder_invalid");
    DirectoryNotReparse(path.substr(0, 3), handles);
    for (std::size_t i = 3; i < path.size(); ++i)
        if (path[i] == L'\\') DirectoryNotReparse(path.substr(0, i), handles);
    DirectoryNotReparse(path, handles);
}
}
std::string Utf8(const std::wstring& text) {
    Require(text.size() <= 32768, "unicode_path_too_long");
    if (text.empty()) return {};
    const auto count = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    Require(count > 0, "unicode_path_invalid"); std::string value(count, '\0');
    Require(WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), value.data(), count, nullptr, nullptr) == count,
        "unicode_path_conversion_failed"); return value;
}
std::wstring ModulePath(HMODULE module) {
    std::wstring path(32768, L'\0'); const auto count = GetModuleFileNameW(module, path.data(), static_cast<DWORD>(path.size()));
    Require(count > 0 && count < path.size(), "module_path_unavailable"); path.resize(count); return path;
}
std::string FileSha256(const std::wstring& path) {
    Handle file(CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    Require(file.get() != INVALID_HANDLE_VALUE, "identity_image_open_failed");
    FILE_ATTRIBUTE_TAG_INFO attributes{}; LARGE_INTEGER size{};
    Require(GetFileInformationByHandleEx(file.get(), FileAttributeTagInfo, &attributes, sizeof(attributes)) &&
        !(attributes.FileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY)) &&
        GetFileSizeEx(file.get(), &size) && size.QuadPart > 0 && size.QuadPart <= 1024LL * 1024 * 1024, "identity_image_invalid");
    Hash hash; std::vector<unsigned char> buffer(65536); std::uint64_t total = 0;
    for (;;) {
        DWORD read = 0; Require(ReadFile(file.get(), buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr), "identity_image_read_failed");
        if (!read) break;
        total += read; Require(total <= static_cast<std::uint64_t>(size.QuadPart), "identity_image_changed");
        Require(BCryptHashData(hash.hash, buffer.data(), read, 0) == 0, "identity_hash_failed");
    }
    Require(total == static_cast<std::uint64_t>(size.QuadPart), "identity_image_changed");
    unsigned char digest[32]{}; Require(BCryptFinishHash(hash.hash, digest, sizeof(digest), 0) == 0, "identity_hash_failed");
    return Hex(digest, sizeof(digest));
}
std::string RandomChallenge() {
    unsigned char bytes[32]{};
    Require(BCryptGenRandom(nullptr, bytes, sizeof(bytes), BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0, "boot_challenge_unavailable");
    return Hex(bytes, sizeof(bytes)); // public freshness marker, never a credential
}
ProcessIdentity ObserveProcess(std::uint32_t pid) {
    Require(pid != 0, "invalid_pid");
    Handle process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, pid));
    Require(process.get() != INVALID_HANDLE_VALUE && process.get() != nullptr, "process_identity_unavailable");
    const auto birth = Birth(process.get());
    std::wstring path(32768, L'\0'); DWORD count = static_cast<DWORD>(path.size());
    Require(QueryFullProcessImageNameW(process.get(), 0, path.data(), &count) && count > 0 && count < path.size(), "process_image_path_unavailable");
    path.resize(count); const auto sha = FileSha256(path);
    Require(Birth(process.get()) == birth && WaitForSingleObject(process.get(), 0) == WAIT_TIMEOUT, "process_identity_stale");
    return {pid, std::to_string(birth), Utf8(path), sha};
}
ProcessIdentity ObservePipeClient(HANDLE pipe, const ProcessIdentity& expected_local_host) {
    ULONG server = 0, client = 0;
    Require(GetNamedPipeServerProcessId(pipe, &server) && GetNamedPipeClientProcessId(pipe, &client), "pipe_peer_pid_unavailable");
    Require(server == GetCurrentProcessId() && SameProcess(ObserveProcess(server), expected_local_host), "pipe_local_host_mismatch");
    return ObserveProcess(client);
}
ProcessIdentity ObservePipeServer(HANDLE pipe, const ProcessIdentity& expected_local_daemon) {
    ULONG server = 0, client = 0;
    Require(GetNamedPipeServerProcessId(pipe, &server) && GetNamedPipeClientProcessId(pipe, &client), "pipe_peer_pid_unavailable");
    Require(client == GetCurrentProcessId() && SameProcess(ObserveProcess(client), expected_local_daemon), "pipe_local_daemon_mismatch");
    return ObserveProcess(server);
}
void PublicBootReceipt::Publish(const ServiceIdentity& identity) {
    Require(files_.empty() && directories_.empty(), "boot_receipt_publication_already_attempted");
    const auto bytes = PublicIdentityJson(identity);
    PWSTR folder = nullptr;
    Require(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_DONT_VERIFY, nullptr, &folder) == S_OK && folder, "user_data_folder_unavailable");
    const std::unique_ptr<wchar_t, decltype(&CoTaskMemFree)> owned_folder(folder, &CoTaskMemFree);
    std::wstring root(folder); CheckAncestors(root, directories_);
    for (const auto* child : {L"AEAgent", L"native-snapshot-service", L"identities"}) {
        root += L"\\"; root += child;
        if (!CreateDirectoryW(root.c_str(), nullptr)) Require(GetLastError() == ERROR_ALREADY_EXISTS, "receipt_directory_create_failed");
        DirectoryNotReparse(root, directories_);
    }
    const std::wstring challenge(identity.challenge.begin(), identity.challenge.end());
    const auto pending = root + L"\\" + challenge + L".pending";
    const auto birth = std::wstring(identity.host.birth_100ns.begin(), identity.host.birth_100ns.end());
    const auto target = root + L"\\" + std::to_wstring(identity.host.pid) + L"-" + birth + L"-" + challenge + L".identity.json";
    Handle file(CreateFileW(pending.c_str(), GENERIC_WRITE | DELETE | FILE_READ_ATTRIBUTES, FILE_SHARE_READ, nullptr, CREATE_NEW,
        FILE_ATTRIBUTE_READONLY | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    Require(file.get() != INVALID_HANDLE_VALUE, "boot_receipt_exclusive_create_failed");
    BY_HANDLE_FILE_INFORMATION info{};
    Require(GetFileInformationByHandle(file.get(), &info) && info.nNumberOfLinks == 1 &&
        !(info.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)), "boot_receipt_file_invalid");
    DWORD written = 0;
    Require(bytes.size() <= 131072 && WriteFile(file.get(), bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) &&
        written == bytes.size() && FlushFileBuffers(file.get()), "boot_receipt_write_failed");
    const auto size = offsetof(FILE_RENAME_INFO, FileName) + target.size() * sizeof(wchar_t);
    std::vector<unsigned char> storage(size, 0); auto rename = reinterpret_cast<FILE_RENAME_INFO*>(storage.data());
    rename->ReplaceIfExists = FALSE; rename->RootDirectory = nullptr;
    rename->FileNameLength = static_cast<DWORD>(target.size() * sizeof(wchar_t));
    std::copy(target.begin(), target.end(), rename->FileName);
    Require(SetFileInformationByHandle(file.get(), FileRenameInfo, rename, static_cast<DWORD>(storage.size())), "boot_receipt_publish_failed_no_retry");
    files_.push_back(std::move(file)); // retain held read-share handle for process lifetime
}
} // namespace ame_service
