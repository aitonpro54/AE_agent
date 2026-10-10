#pragma once
// Standalone Win32 feasibility support; no AE SDK, bridge or production API.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <bcrypt.h>
#include <sddl.h>
#include <algorithm>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

namespace feasibility {
struct Failure : std::runtime_error {
    DWORD code;
    Failure(const std::string& operation, DWORD value) : std::runtime_error(operation), code(value) {}
};
inline void Need(bool value, const char* operation) { if (!value) throw Failure(operation, GetLastError()); }
inline void Invariant(bool value, const char* operation) { if (!value) throw Failure(operation, ERROR_INVALID_DATA); }
struct Handle {
    HANDLE value = INVALID_HANDLE_VALUE;
    Handle() = default;
    explicit Handle(HANDLE v) : value(v) {}
    ~Handle() { Close(); }
    void Close() { if (value != nullptr && value != INVALID_HANDLE_VALUE) CloseHandle(value); value = INVALID_HANDLE_VALUE; }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    Handle(Handle&& other) noexcept : value(other.value) { other.value = INVALID_HANDLE_VALUE; }
    Handle& operator=(Handle&& other) noexcept { if (this != &other) { Close(); value = other.value; other.value = INVALID_HANDLE_VALUE; } return *this; }
};
struct LocalMemory {
    void* value = nullptr;
    ~LocalMemory() { if (value) LocalFree(value); }
};
inline std::string Utf8(const std::wstring& text) {
    if (text.empty()) return {};
    const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    Need(size > 0, "utf8_size"); std::string result(size, '\0');
    Need(WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), result.data(), size, nullptr, nullptr) == size, "utf8_conversion"); return result;
}
inline std::wstring Wide(const std::string& text) {
    if (text.empty()) return {};
    const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), nullptr, 0);
    Need(size > 0, "wide_size"); std::wstring result(size, L'\0');
    Need(MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), result.data(), size) == size, "wide_conversion"); return result;
}
inline std::string Json(const std::string& text) {
    (void)Wide(text); std::string result = "\""; const char* hex = "0123456789abcdef";
    for (unsigned char c : text) {
        if (c == '"' || c == '\\') { result += '\\'; result += static_cast<char>(c); }
        else if (c < 32) { result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15]; }
        else result += static_cast<char>(c);
    }
    return result + '"';
}
inline std::string Bool(bool value) { return value ? "true" : "false"; }
inline std::string Sid(PSID sid) {
    Invariant(sid && IsValidSid(sid), "invalid_sid"); LPWSTR value = nullptr;
    Need(ConvertSidToStringSidW(sid, &value) != FALSE, "sid_to_string"); LocalMemory memory; memory.value = value; return Utf8(value);
}
inline std::uint64_t FileTimeMs(const FILETIME& time) {
    ULARGE_INTEGER value; value.LowPart = time.dwLowDateTime; value.HighPart = time.dwHighDateTime;
    return value.QuadPart / 10000 - 11644473600000ULL;
}
inline std::uint64_t NowMs() { FILETIME time; GetSystemTimeAsFileTime(&time); return FileTimeMs(time); }
inline std::wstring Canonical(const std::wstring& path) {
    Invariant(path.size() > 3 && path.size() < 240 && path[1] == ':' && path[2] == '\\' &&
        path.find(L'/') == std::wstring::npos && path.find(L':', 2) == std::wstring::npos && path.find(L'\0') == std::wstring::npos, "local_canonical_path_required");
    wchar_t output[32768]; const DWORD size = GetFullPathNameW(path.c_str(), 32768, output, nullptr);
    Need(size > 0 && size < 32768, "canonical_path"); const std::wstring result(output, size);
    Invariant(_wcsicmp(path.c_str(), result.c_str()) == 0 && path.back() != '\\', "canonical_path_mismatch");
    return result;
}
inline std::wstring ModulePath() {
    wchar_t output[32768]; const DWORD size = GetModuleFileNameW(nullptr, output, 32768);
    Need(size > 0 && size < 32768, "own_module_path"); return Canonical(std::wstring(output, size));
}
inline void VerifyRegular(HANDLE handle, const std::wstring& path, bool directory) {
    Invariant(handle != INVALID_HANDLE_VALUE && handle != nullptr, "valid_file_handle_required");
    BY_HANDLE_FILE_INFORMATION info{}; Need(GetFileInformationByHandle(handle, &info) != FALSE, "file_information");
    Invariant(!(info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) && !!(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == directory,
        "regular_nonreparse_object_required");
    if (!directory) Invariant(info.nNumberOfLinks == 1, "single_link_file_required");
    wchar_t output[32768]; const DWORD size = GetFinalPathNameByHandleW(handle, output, 32768, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
    Need(size > 4 && size < 32768, "handle_final_path");
    Invariant(_wcsicmp(std::wstring(output, size).c_str(), (L"\\\\?\\" + path).c_str()) == 0, "handle_path_mismatch");
}
inline std::vector<Handle> HoldDirectories(const std::wstring& path) {
    std::vector<Handle> held; size_t end = 3;
    for (;;) {
        const auto component = path.substr(0, end);
        Handle handle(CreateFileW(component.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
            OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
        Need(handle.value != INVALID_HANDLE_VALUE, "open_directory_component"); VerifyRegular(handle.value, component, true); held.push_back(std::move(handle));
        if (end == path.size()) break;
        end = path.find(L'\\', end + (end == 3 ? 0 : 1)); if (end == std::wstring::npos) end = path.size();
    }
    return held;
}
inline Handle NewFile(const std::wstring& path) {
    Handle file(CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_NEW,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr));
    Need(file.value != INVALID_HANDLE_VALUE, "exclusive_new_file_no_replay"); VerifyRegular(file.value, path, false); return file;
}
inline void WriteFlush(HANDLE file, const std::string& bytes) {
    Invariant(bytes.size() <= MAXDWORD, "file_bytes_limit"); DWORD written = 0;
    Need(WriteFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) && written == bytes.size(), "write_file");
    Need(FlushFileBuffers(file) != FALSE, "flush_file");
}
inline std::string ReadBytes(HANDLE file) {
    LARGE_INTEGER zero{}, size{}; Need(SetFilePointerEx(file, zero, nullptr, FILE_BEGIN), "read_seek");
    Need(GetFileSizeEx(file, &size), "read_size"); Invariant(size.QuadPart >= 0 && size.QuadPart <= 65536, "bounded_read_required");
    std::string bytes(static_cast<size_t>(size.QuadPart), '\0'); DWORD read = 0;
    Need(ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr) && read == bytes.size(), "read_file"); return bytes;
}
inline std::string Hash(HANDLE file) {
    BCRYPT_ALG_HANDLE algorithm = nullptr; BCRYPT_HASH_HANDLE hash = nullptr; DWORD size = 0, returned = 0;
    Invariant(BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) >= 0, "hash_algorithm");
    struct Cleanup { BCRYPT_ALG_HANDLE& algorithm; BCRYPT_HASH_HANDLE& hash; ~Cleanup() { if (hash) BCryptDestroyHash(hash); if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0); } } cleanup{algorithm, hash};
    Invariant(BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&size), sizeof(size), &returned, 0) >= 0, "hash_object_size");
    std::vector<unsigned char> object(size);
    Invariant(BCryptCreateHash(algorithm, &hash, object.data(), size, nullptr, 0, 0) >= 0, "hash_create");
    LARGE_INTEGER zero{}; Need(SetFilePointerEx(file, zero, nullptr, FILE_BEGIN), "hash_seek");
    unsigned char bytes[65536]; DWORD read = 0;
    do {
        Need(ReadFile(file, bytes, sizeof(bytes), &read, nullptr), "hash_read");
        if (read) Invariant(BCryptHashData(hash, bytes, read, 0) >= 0, "hash_add");
    } while (read);
    unsigned char digest[32]; Invariant(BCryptFinishHash(hash, digest, sizeof(digest), 0) >= 0, "hash_finish");
    const char* hex = "0123456789abcdef"; std::string result;
    for (const auto value : digest) { result += hex[value >> 4]; result += hex[value & 15]; } return result;
}
} // namespace feasibility
