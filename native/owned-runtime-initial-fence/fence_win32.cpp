#include "fence_win32.h"

#include <windows.h>
#include <winternl.h>
#include <algorithm>
#include <array>
#include <cstring>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <utility>
#include <vector>

// Generated exclusively by the parent proof driver from independent live handles.
// No checked-in default, configuration reader or production fallback exists.
#include "fence_expected_pins.h"

namespace initial_fence {
namespace {
constexpr wchar_t kLockName[] = L".initial-owned-fence.lock";
constexpr ULONG kNtFileOpen = 1;
constexpr ULONG kNtOpenReparsePoint = 0x00200000;
constexpr ULONG kNtSynchronousNonalert = 0x00000020;
constexpr ULONG kObjectCaseInsensitive = 0x00000040;
constexpr std::size_t kMaxPathChars = 32760;

class Handle final {
public:
    Handle() = default;
    explicit Handle(HANDLE value) noexcept : value_(value) {}
    ~Handle() { Close(); }
    Handle(Handle&& other) noexcept : value_(other.Take()) {}
    Handle& operator=(Handle&& other) noexcept {
        if (this != &other) { Close(); value_ = other.Take(); }
        return *this;
    }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    HANDLE Get() const noexcept { return value_; }
    bool Valid() const noexcept { return value_ != nullptr && value_ != INVALID_HANDLE_VALUE; }
    DWORD Close() noexcept {
        const HANDLE old = Take();
        if (old == nullptr || old == INVALID_HANDLE_VALUE) { return ERROR_SUCCESS; }
        if (CloseHandle(old)) { return ERROR_SUCCESS; }
        return GetLastError();
    }
private:
    HANDLE Take() noexcept { const HANDLE old = value_; value_ = nullptr; return old; }
    HANDLE value_ = nullptr;
};

// Stable logical object identity across moves. Lifetime cannot be reconstructed
// from an OS handle number, pathname, string ref or serialized identity.
struct Token final { bool live = true; };
struct Witness final { Handle handle; Identity identity; };

Result Error(const char* code, DWORD win32 = 0, NTSTATUS status = 0) {
    Result result;
    result.code = code;
    result.win32Error = win32;
    result.ntStatus = static_cast<std::uint32_t>(status);
    return result;
}

bool EqualPath(const std::wstring& left, const std::wstring& right) {
    return CompareStringOrdinal(left.c_str(), static_cast<int>(left.size()),
        right.c_str(), static_cast<int>(right.size()), TRUE) == CSTR_EQUAL;
}

std::string HexBytes(const BYTE* bytes, std::size_t size) {
    constexpr char digits[] = "0123456789abcdef";
    std::string value(size * 2, '0');
    for (std::size_t i = 0; i < size; ++i) {
        value[i * 2] = digits[bytes[i] >> 4];
        value[i * 2 + 1] = digits[bytes[i] & 15];
    }
    return value;
}

std::string HexSerial(ULONGLONG serial) {
    std::array<BYTE, 8> bytes{};
    for (std::size_t i = 0; i < bytes.size(); ++i) {
        bytes[bytes.size() - 1 - i] = static_cast<BYTE>(serial & 255);
        serial >>= 8;
    }
    return HexBytes(bytes.data(), bytes.size());
}

bool EqualIdentity(const Identity& left, const Identity& right) {
    return EqualPath(left.volumeGuid, right.volumeGuid)
        && left.volumeSerialHex == right.volumeSerialHex && left.fileIdHex == right.fileIdHex
        && EqualPath(left.canonicalPath, right.canonicalPath);
}

bool MatchesPin(const Identity& identity, const test_pins::Pin& pin) {
    return identity.volumeSerialHex == pin.serialHex && identity.fileIdHex == pin.fileIdHex
        && EqualPath(identity.canonicalPath, pin.canonicalPath);
}

Result ReadIdentity(HANDLE handle, Identity& identity) {
    SetLastError(ERROR_SUCCESS);
    if (GetFileType(handle) != FILE_TYPE_DISK) { return Error("not_disk", GetLastError()); }
    FILE_ID_INFO id{};
    if (!GetFileInformationByHandleEx(handle, FileIdInfo, &id, sizeof(id))) {
        return Error("file_id_query_failed", GetLastError());
    }
    std::vector<wchar_t> path(kMaxPathChars + 1);
    const DWORD length = GetFinalPathNameByHandleW(handle, path.data(),
        static_cast<DWORD>(path.size()), FILE_NAME_NORMALIZED | VOLUME_NAME_GUID);
    if (length == 0) { return Error("canonical_query_failed", GetLastError()); }
    if (length >= path.size() || length > kMaxPathChars) { return Error("canonical_truncated"); }
    identity.canonicalPath.assign(path.data(), length);
    // Exact Volume{GUID} anchor shape; subdirectories cannot masquerade as volume roots.
    const auto& canonical = identity.canonicalPath;
    if (canonical.size() < 49 || canonical.compare(0, 11, L"\\\\?\\Volume{") != 0
        || canonical[47] != L'}' || canonical[48] != L'\\') {
        return Error("canonical_not_volume_guid");
    }
    for (std::size_t i = 11; i < 47; ++i) {
        const wchar_t ch = canonical[i];
        if (i == 19 || i == 24 || i == 29 || i == 34) {
            if (ch != L'-') { return Error("canonical_invalid_guid"); }
        } else if (!((ch >= L'0' && ch <= L'9') || (ch >= L'a' && ch <= L'f')
            || (ch >= L'A' && ch <= L'F'))) { return Error("canonical_invalid_guid"); }
    }
    identity.volumeGuid = canonical.substr(0, 49);
    identity.volumeSerialHex = HexSerial(id.VolumeSerialNumber);
    identity.fileIdHex = HexBytes(id.FileId.Identifier, sizeof(id.FileId.Identifier));
    return Result{};
}

Result DirectoryIdentity(HANDLE handle, Identity& identity, bool invalidCaseQuery) {
    FILE_ATTRIBUTE_TAG_INFO attributes{};
    if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &attributes, sizeof(attributes))) {
        return Error("attribute_query_failed", GetLastError());
    }
    constexpr DWORD forbidden = FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_OFFLINE
        | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;
    if ((attributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0
        || (attributes.FileAttributes & forbidden) != 0) { return Error("directory_attributes_refused"); }
    FILE_STANDARD_INFO standard{};
    if (!GetFileInformationByHandleEx(handle, FileStandardInfo, &standard, sizeof(standard))) {
        return Error("standard_query_failed", GetLastError());
    }
    if (!standard.Directory || standard.DeletePending) { return Error("directory_standard_refused"); }
    FILE_CASE_SENSITIVE_INFO sensitivity{};
    if (invalidCaseQuery) {
        // A real failing Windows query. The original held witness remains valid.
        HANDLE duplicate = nullptr;
        if (!DuplicateHandle(GetCurrentProcess(), handle, GetCurrentProcess(), &duplicate,
            0, FALSE, DUPLICATE_SAME_ACCESS)) { return Error("test_duplicate_failed", GetLastError()); }
        if (!CloseHandle(duplicate)) { return Error("test_duplicate_close_failed", GetLastError()); }
        if (!GetFileInformationByHandleEx(duplicate, FileCaseSensitiveInfo, &sensitivity, sizeof(sensitivity))) {
            return Error("case_query_failed", GetLastError());
        }
        return Error("test_invalid_handle_unexpected_success");
    }
    if (!GetFileInformationByHandleEx(handle, FileCaseSensitiveInfo, &sensitivity, sizeof(sensitivity))) {
        return Error("case_query_failed", GetLastError());
    }
    // FILE_CASE_SENSITIVE_INFO.Flags bit 0: FILE_CS_FLAG_CASE_SENSITIVE_DIR.
    if ((sensitivity.Flags & 1UL) != 0) { return Error("case_sensitive_directory"); }
    std::array<wchar_t, 32> filesystem{};
    if (!GetVolumeInformationByHandleW(handle, nullptr, 0, nullptr, nullptr, nullptr,
        filesystem.data(), static_cast<DWORD>(filesystem.size()))) {
        return Error("volume_query_failed", GetLastError());
    }
    if (std::wstring(filesystem.data()) != L"NTFS") { return Error("unsupported_filesystem"); }
    return ReadIdentity(handle, identity);
}

Result LockIdentity(HANDLE handle, const Identity& root, Identity& identity, bool invalidQuery) {
    FILE_ATTRIBUTE_TAG_INFO attributes{};
    if (invalidQuery) {
        HANDLE duplicate = nullptr;
        if (!DuplicateHandle(GetCurrentProcess(), handle, GetCurrentProcess(), &duplicate,
            0, FALSE, DUPLICATE_SAME_ACCESS)) { return Error("test_duplicate_failed", GetLastError()); }
        if (!CloseHandle(duplicate)) { return Error("test_duplicate_close_failed", GetLastError()); }
        if (!GetFileInformationByHandleEx(duplicate, FileAttributeTagInfo, &attributes, sizeof(attributes))) {
            return Error("attribute_query_failed", GetLastError());
        }
        return Error("test_invalid_handle_unexpected_success");
    }
    if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &attributes, sizeof(attributes))) {
        return Error("attribute_query_failed", GetLastError());
    }
    constexpr DWORD forbidden = FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT
        | FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;
    if ((attributes.FileAttributes & forbidden) != 0) { return Error("lock_attributes_refused"); }
    FILE_STANDARD_INFO standard{};
    if (!GetFileInformationByHandleEx(handle, FileStandardInfo, &standard, sizeof(standard))) {
        return Error("standard_query_failed", GetLastError());
    }
    if (standard.Directory || standard.DeletePending || standard.EndOfFile.QuadPart != 0
        || standard.NumberOfLinks != 1) { return Error("lock_standard_refused"); }
    Result result = ReadIdentity(handle, identity);
    if (!result.code.empty()) { return result; }
    std::wstring expectedPath = root.canonicalPath;
    if (expectedPath.back() != L'\\') { expectedPath += L'\\'; }
    expectedPath += kLockName;
    if (!EqualPath(identity.volumeGuid, root.volumeGuid)
        || identity.volumeSerialHex != root.volumeSerialHex
        || !EqualPath(identity.canonicalPath, expectedPath)) { return Error("lock_identity_changed"); }
    return Result{};
}

struct ParsedPath { std::wstring drivePath; std::vector<std::wstring> components; };

Result ParsePath(const std::wstring& input, ParsedPath& parsed) {
    if (input.empty() || input.size() > kMaxPathChars || input.find(L'\0') != std::wstring::npos) {
        return Error("invalid_root_spelling");
    }
    std::wstring path = input;
    if (path.compare(0, 4, L"\\\\?\\") == 0) { path.erase(0, 4); }
    if (path.size() < 3 || !((path[0] >= L'A' && path[0] <= L'Z')
        || (path[0] >= L'a' && path[0] <= L'z')) || path[1] != L':' || path[2] != L'\\') {
        return Error("invalid_root_spelling");
    }
    if (path.find(L':', 2) != std::wstring::npos || path.find(L'/') != std::wstring::npos) {
        return Error("invalid_root_spelling");
    }
    if (path.size() > 3 && path.back() == L'\\') { path.pop_back(); }
    if (path.size() > 3 && path.back() == L'\\') { return Error("invalid_root_spelling"); }
    std::size_t offset = 3;
    while (offset < path.size()) {
        const std::size_t end = path.find(L'\\', offset);
        const auto component = path.substr(offset, end == std::wstring::npos ? end : end - offset);
        if (component.empty() || component == L"." || component == L".."
            || component.back() == L'.' || component.back() == L' '
            || component.find_first_of(L"<>\"|?*") != std::wstring::npos) {
            return Error("invalid_root_spelling");
        }
        for (const wchar_t ch : component) { if (ch < 32) { return Error("invalid_root_spelling"); } }
        parsed.components.push_back(component);
        if (end == std::wstring::npos) { break; }
        offset = end + 1;
    }
    parsed.drivePath = path;
    return Result{};
}

using NtCreateFileFn = NTSTATUS(NTAPI*)(PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES,
    PIO_STATUS_BLOCK, PLARGE_INTEGER, ULONG, ULONG, ULONG, ULONG, PVOID, ULONG);
using NtErrorFn = ULONG(NTAPI*)(NTSTATUS);

Result RelativeOpen(HANDLE parent, const std::wstring& component, ACCESS_MASK access,
    ULONG sharing, Handle& output) {
    if (component.empty() || component.find_first_of(L"\\/:\0") != std::wstring::npos
        || component.size() > 255) { return Error("invalid_component"); }
    const HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
    if (ntdll == nullptr) { return Error("nt_api_unavailable", GetLastError()); }
    // memcpy avoids incompatible-function-cast warnings under /W4 /WX.
    const FARPROC createAddress = GetProcAddress(ntdll, "NtCreateFile");
    const FARPROC errorAddress = GetProcAddress(ntdll, "RtlNtStatusToDosError");
    NtCreateFileFn create = nullptr;
    NtErrorFn translate = nullptr;
    static_assert(sizeof(create) == sizeof(createAddress), "function pointer ABI");
    std::memcpy(&create, &createAddress, sizeof(create));
    std::memcpy(&translate, &errorAddress, sizeof(translate));
    if (create == nullptr || translate == nullptr) { return Error("nt_api_unavailable", GetLastError()); }
    UNICODE_STRING name{};
    name.Buffer = const_cast<PWSTR>(component.c_str());
    name.Length = static_cast<USHORT>(component.size() * sizeof(wchar_t));
    name.MaximumLength = name.Length;
    OBJECT_ATTRIBUTES attributes{};
    attributes.Length = sizeof(attributes);
    attributes.RootDirectory = parent;
    attributes.ObjectName = &name;
    attributes.Attributes = kObjectCaseInsensitive;
    IO_STATUS_BLOCK io{};
    HANDLE handle = nullptr;
    const NTSTATUS status = create(&handle, access, &attributes, &io, nullptr,
        FILE_ATTRIBUTE_NORMAL, sharing, kNtFileOpen, kNtOpenReparsePoint | kNtSynchronousNonalert,
        nullptr, 0);
    if (status < 0) { return Error("relative_open_failed", translate(status), status); }
    if (handle == nullptr || handle == INVALID_HANDLE_VALUE) { return Error("relative_open_invalid_handle"); }
    output = Handle(handle);
    if (!SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0)) {
        return Error("inheritance_clear_failed", GetLastError());
    }
    return Result{};
}

std::string Utf8(const std::wstring& input) {
    if (input.empty()) { return {}; }
    const int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, input.data(),
        static_cast<int>(input.size()), nullptr, 0, nullptr, nullptr);
    if (length <= 0) { throw std::runtime_error("utf8 conversion failed"); }
    std::string output(static_cast<std::size_t>(length), '\0');
    if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, input.data(),
        static_cast<int>(input.size()), output.data(), length, nullptr, nullptr) != length) {
        throw std::runtime_error("utf8 conversion failed");
    }
    return output;
}

std::string JsonString(const std::string& input) {
    std::string value = "\"";
    constexpr char digits[] = "0123456789abcdef";
    for (const unsigned char ch : input) {
        if (ch == '"' || ch == '\\') { value += '\\'; value += static_cast<char>(ch); }
        else if (ch < 32) {
            value += "\\u00"; value += digits[ch >> 4]; value += digits[ch & 15];
        } else { value += static_cast<char>(ch); }
    }
    return value + '"';
}

std::string JsonIdentity(const Identity& identity) {
    return "{\"volumeGuid\":" + JsonString(Utf8(identity.volumeGuid))
        + ",\"volumeSerialHex\":" + JsonString(identity.volumeSerialHex)
        + ",\"fileIdHex\":" + JsonString(identity.fileIdHex)
        + ",\"canonicalPath\":" + JsonString(Utf8(identity.canonicalPath)) + "}";
}
} // namespace

struct RootLease::Data {
    ~Data() { if (rootToken) { rootToken->live = false; } }
    std::shared_ptr<Token> factoryToken;
    std::shared_ptr<Token> rootToken;
    std::vector<Witness> witnesses;
    std::size_t runRootIndex = 0;
    bool live = false;
};
struct FenceLease::Data {
    ~Data() { if (fenceToken) { fenceToken->live = false; } }
    std::shared_ptr<Token> factoryToken;
    std::shared_ptr<Token> rootToken;
    std::shared_ptr<Token> fenceToken = std::make_shared<Token>();
    Handle handle;
    Identity identity;
    std::string ref;
};
struct Factory::RootConfig {
    ParsedPath path;
    ParsedPath expectedRunPath;
    const test_pins::Pin* fixture = nullptr;
    const test_pins::Slot* slot = nullptr;
};
struct Factory::Data {
    explicit Data(std::unique_ptr<RootConfig> value) : config(std::move(value)) {}
    std::unique_ptr<RootConfig> config;
    std::shared_ptr<Token> token = std::make_shared<Token>();
    std::weak_ptr<Token> openedRootToken;
    std::weak_ptr<Token> activeFenceToken;
    std::uint64_t counter = 0;
    std::uint64_t lockWriteOpenAttempts = 0;
    std::uint64_t publishedAcquisitions = 0;
    bool opened = false;
    bool closed = false;
    bool cleanupUnknown = false;
    bool hookUsed = false;
    Result Pause(const char* stage, const std::wstring& component = L"") {
        const auto& slot = *config->slot;
        if (hookUsed || std::string(slot.pauseStage) != stage
            || (!std::wstring(slot.pauseComponent).empty() && !EqualPath(component, slot.pauseComponent))) {
            return Result{};
        }
        hookUsed = true;
        const std::wstring base = slot.eventBase;
        Handle ready(OpenEventW(EVENT_MODIFY_STATE, FALSE, (base + L"-ready").c_str()));
        Handle resume(OpenEventW(SYNCHRONIZE, FALSE, (base + L"-resume").c_str()));
        if (!ready.Valid() || !resume.Valid()) { return Error("test_pause_event_failed", GetLastError()); }
        if (!SetEvent(ready.Get())) { return Error("test_pause_signal_failed", GetLastError()); }
        const DWORD wait = WaitForSingleObject(resume.Get(), 15000);
        if (wait != WAIT_OBJECT_0) { return Error("test_pause_wait_failed", wait == WAIT_FAILED ? GetLastError() : ERROR_TIMEOUT); }
        return Result{};
    }
};

RootLease::RootLease() = default;
RootLease::~RootLease() = default;
RootLease::RootLease(RootLease&&) noexcept = default;
RootLease& RootLease::operator=(RootLease&&) noexcept = default;
FenceLease::FenceLease() = default;
FenceLease::~FenceLease() = default;
FenceLease::FenceLease(FenceLease&&) noexcept = default;
FenceLease& FenceLease::operator=(FenceLease&&) noexcept = default;
Factory::Factory(std::unique_ptr<RootConfig> config) : data_(std::make_unique<Data>(std::move(config))) {}
Factory::~Factory() { data_->token->live = false; }

std::unique_ptr<Factory> Factory::CreateApprovedTestFactory(
    const std::wstring& spelling, const std::string& instance, Result& result) {
    auto config = std::make_unique<RootConfig>();
    result = ParsePath(spelling, config->path);
    if (!result.code.empty()) { result.terminal = true; return nullptr; }
    for (const auto& slot : test_pins::kSlots) {
        if (instance == slot.instanceId) { config->slot = &slot; break; }
    }
    if (config->slot == nullptr || config->slot->fixtureIndex >= std::size(test_pins::kFixtures)) {
        result = Error("unapproved_factory_instance"); result.terminal = true; return nullptr;
    }
    config->fixture = &test_pins::kFixtures[config->slot->fixtureIndex];
    ParsedPath approved;
    result = ParsePath(config->fixture->drivePath, approved);
    if (!result.code.empty() || !EqualPath(approved.drivePath, config->path.drivePath)) {
        result = Error("unapproved_fixture"); result.terminal = true; return nullptr;
    }
    result = ParsePath(test_pins::kRunRoot.drivePath, config->expectedRunPath);
    if (!result.code.empty() || config->expectedRunPath.components.empty()
        || config->path.components.size() <= config->expectedRunPath.components.size()
        || config->fixture->serialHex[0] == '\0' || config->fixture->fileIdHex[0] == '\0'
        || test_pins::kRunRoot.serialHex[0] == '\0' || test_pins::kRunRoot.fileIdHex[0] == '\0') {
        result = Error("missing_original_pins"); result.terminal = true; return nullptr;
    }
    for (std::size_t i = 0; i < config->expectedRunPath.components.size(); ++i) {
        if (!EqualPath(config->path.components[i], config->expectedRunPath.components[i])) {
            result = Error("fixture_outside_run_root"); result.terminal = true; return nullptr;
        }
    }
    if (!EqualPath(config->path.drivePath.substr(0, 3), config->expectedRunPath.drivePath.substr(0, 3))) {
        result = Error("fixture_outside_run_root"); result.terminal = true; return nullptr;
    }
    return std::unique_ptr<Factory>(new Factory(std::move(config)));
}

Result Factory::Describe(RootLease& root, FenceLease& fence) const {
    // Supplied references never define the actual resource state. In particular
    // an alternate empty/moved-from lease cannot hide the original live fence.
    static_cast<void>(root);
    static_cast<void>(fence);
    Result result;
    result.lockWriteOpenAttempts = data_->lockWriteOpenAttempts;
    result.publishedAcquisitions = data_->publishedAcquisitions;
    const auto actualRoot = data_->openedRootToken.lock();
    const auto actualFence = data_->activeFenceToken.lock();
    const bool rootLive = actualRoot && actualRoot->live;
    const bool fenceLive = actualFence && actualFence->live;
    result.fenceState = data_->cleanupUnknown || (fenceLive && !rootLive) ? "UNKNOWN" :
        (rootLive ? (fenceLive ? "FENCE_HELD" : "ROOT_HELD") : "CLOSED");
    return result;
}

Result Factory::CheckBinding(RootLease& root, FenceLease& fence) const {
    if ((root.data_ && root.data_->factoryToken.get() != data_->token.get())
        || (fence.data_ && fence.data_->factoryToken.get() != data_->token.get())) {
        Result result = Describe(root, fence);
        result.code = "foreign_lease_reference";
        return result;
    }
    const auto actualRoot = data_->openedRootToken.lock();
    const auto actualFence = data_->activeFenceToken.lock();
    if ((actualRoot && (!root.data_ || root.data_->rootToken.get() != actualRoot.get()))
        || (!actualRoot && root.data_)
        || (actualFence && actualFence->live
            && (!fence.data_ || fence.data_->fenceToken.get() != actualFence.get()))
        || ((!actualFence || !actualFence->live) && fence.data_)
        || (fence.data_ && (!root.data_ || fence.data_->rootToken.get() != root.data_->rootToken.get()))) {
        Result result = Describe(root, fence);
        result.code = "invalid_lease_reference";
        return result;
    }
    return Result{};
}

Result Factory::Dispose(RootLease& root, FenceLease& fence) {
    Result binding = CheckBinding(root, fence);
    if (!binding.code.empty()) { return binding; }
    // Invalidate references before closing any native handle. Never rebind/retry.
    DWORD closeError = 0;
    if (fence.data_) {
        fence.data_->ref.clear();
        fence.data_->fenceToken->live = false;
        data_->activeFenceToken.reset();
        closeError = fence.data_->handle.Close();
        fence.data_.reset();
    }
    if (root.data_) {
        root.data_->live = false;
        root.data_->rootToken->live = false;
        data_->openedRootToken.reset();
        for (auto it = root.data_->witnesses.rbegin(); it != root.data_->witnesses.rend(); ++it) {
            const DWORD error = it->handle.Close();
            if (closeError == 0) { closeError = error; }
        }
        root.data_.reset();
    }
    data_->closed = true;
    if (closeError != 0) { data_->cleanupUnknown = true; }
    Result result = Describe(root, fence);
    result.ok = closeError == 0;
    result.code = closeError == 0 ? "disposed" : "cleanup_unknown";
    result.win32Error = closeError;
    result.terminal = closeError != 0;
    return result;
}

Result Factory::Fail(RootLease& root, FenceLease& fence, const Result& failure) {
    const Result cleanup = Dispose(root, fence);
    Result result = failure;
    result.terminal = true;
    result.fenceState = cleanup.fenceState;
    result.hasRootIdentity = false;
    result.hasLockIdentity = false;
    result.sessionRef.clear();
    result.lockWriteOpenAttempts = data_->lockWriteOpenAttempts;
    result.publishedAcquisitions = data_->publishedAcquisitions;
    return result;
}

Result Factory::OpenRoot(RootLease& root, FenceLease& fence) {
    Result binding = CheckBinding(root, fence);
    if (!binding.code.empty()) { return binding; }
    if (data_->opened || data_->closed || root.data_ || fence.data_) {
        Result result = Describe(root, fence); result.code = "factory_already_used"; return result;
    }
    data_->opened = true;
    root.data_ = std::make_unique<RootLease::Data>();
    root.data_->factoryToken = data_->token;
    root.data_->rootToken = std::make_shared<Token>();
    data_->openedRootToken = root.data_->rootToken;
    root.data_->runRootIndex = data_->config->expectedRunPath.components.size();
    const std::wstring driveRoot = data_->config->path.drivePath.substr(0, 3);
    std::array<wchar_t, 1024> device{};
    const std::wstring drive = driveRoot.substr(0, 2);
    if (QueryDosDeviceW(drive.c_str(), device.data(), static_cast<DWORD>(device.size())) == 0) {
        return Fail(root, fence, Error("drive_query_failed", GetLastError()));
    }
    if (std::wstring(device.data()).compare(0, 22, L"\\Device\\HarddiskVolume") != 0
        || GetDriveTypeW(driveRoot.c_str()) == DRIVE_REMOTE) {
        return Fail(root, fence, Error("subst_or_remote_root"));
    }
    std::array<wchar_t, 64> volume{};
    if (!GetVolumeNameForVolumeMountPointW(driveRoot.c_str(), volume.data(), static_cast<DWORD>(volume.size()))) {
        return Fail(root, fence, Error("volume_anchor_query_failed", GetLastError()));
    }
    Witness anchor;
    anchor.handle = Handle(CreateFileW(volume.data(), FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
        FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    if (!anchor.handle.Valid()) { return Fail(root, fence, Error("volume_anchor_open_failed", GetLastError())); }
    Result result = DirectoryIdentity(anchor.handle.Get(), anchor.identity, false);
    if (!result.code.empty()) { return Fail(root, fence, result); }
    if (!EqualPath(anchor.identity.canonicalPath, anchor.identity.volumeGuid)
        || !EqualPath(anchor.identity.volumeGuid, volume.data())) {
        return Fail(root, fence, Error("not_directory_volume_root"));
    }
    root.data_->witnesses.push_back(std::move(anchor));
    for (const auto& component : data_->config->path.components) {
        result = data_->Pause("before_component", component);
        if (!result.code.empty()) { return Fail(root, fence, result); }
        Witness witness;
        result = RelativeOpen(root.data_->witnesses.back().handle.Get(), component,
            FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
            FILE_SHARE_READ | FILE_SHARE_WRITE, witness.handle);
        if (!result.code.empty()) { return Fail(root, fence, result); }
        const bool leaf = root.data_->witnesses.size() == data_->config->path.components.size();
        result = DirectoryIdentity(witness.handle.Get(), witness.identity,
            leaf && data_->config->slot->invalidateCaseQuery);
        if (!result.code.empty()) { return Fail(root, fence, result); }
        root.data_->witnesses.push_back(std::move(witness));
        const auto& actual = root.data_->witnesses.back().identity;
        if (root.data_->witnesses.size() - 1 == root.data_->runRootIndex
            && !MatchesPin(actual, test_pins::kRunRoot)) {
            return Fail(root, fence, Error("root_identity_changed"));
        }
        if (leaf && !MatchesPin(actual, *data_->config->fixture)) {
            return Fail(root, fence, Error("root_identity_changed"));
        }
        result = data_->Pause("after_component", component);
        if (!result.code.empty()) { return Fail(root, fence, result); }
    }
    root.data_->live = true;
    result = Validate(root, fence, false);
    return result;
}

Result Factory::Validate(RootLease& root, FenceLease& fence, bool checkFence) {
    Result binding = CheckBinding(root, fence);
    if (!binding.code.empty()) { return binding; }
    if (data_->closed || !root.data_ || !root.data_->live
        || root.data_->factoryToken.get() != data_->token.get()) {
        return Fail(root, fence, Error("invalid_root_reference"));
    }
    for (std::size_t i = 0; i < root.data_->witnesses.size(); ++i) {
        Identity fresh;
        Result result = DirectoryIdentity(root.data_->witnesses[i].handle.Get(), fresh, false);
        if (!result.code.empty()) { return Fail(root, fence, result); }
        if (!EqualIdentity(fresh, root.data_->witnesses[i].identity)
            || (i == root.data_->runRootIndex && !MatchesPin(fresh, test_pins::kRunRoot))
            || (i == root.data_->witnesses.size() - 1 && !MatchesPin(fresh, *data_->config->fixture))) {
            return Fail(root, fence, Error("root_identity_changed"));
        }
    }
    if (checkFence && fence.data_) {
        if (fence.data_->factoryToken.get() != data_->token.get()
            || fence.data_->rootToken.get() != root.data_->rootToken.get()
            || fence.data_->ref.empty() || !fence.data_->handle.Valid()) {
            return Fail(root, fence, Error("invalid_fence_reference"));
        }
        Identity fresh;
        Result result = LockIdentity(fence.data_->handle.Get(), root.data_->witnesses.back().identity, fresh, false);
        if (!result.code.empty()) { return Fail(root, fence, result); }
        if (!EqualIdentity(fresh, fence.data_->identity)) { return Fail(root, fence, Error("lock_identity_changed")); }
    }
    Result result = Describe(root, fence);
    result.ok = true;
    result.code = "observed";
    result.hasRootIdentity = true;
    result.rootIdentity = root.data_->witnesses.back().identity;
    if (fence.data_) {
        result.hasLockIdentity = true;
        result.lockIdentity = fence.data_->identity;
        result.sessionRef = fence.data_->ref;
    }
    return result;
}

Result Factory::Observe(RootLease& root, FenceLease& fence) { return Validate(root, fence, true); }

Result Factory::TryAcquire(RootLease& root, FenceLease& fence) {
    Result result = Validate(root, fence, true);
    if (!result.ok) { return result; }
    if (fence.data_) {
        result = Describe(root, fence); result.code = "already_acquired"; return result;
    }
    if (data_->counter == std::numeric_limits<std::uint64_t>::max()) {
        return Fail(root, fence, Error("acquisition_counter_exhausted"));
    }
    result = data_->Pause("before_lock");
    if (!result.code.empty()) { return Fail(root, fence, result); }
    // The last pause cannot make validation stale: repeat immediately before WRITE_DATA.
    result = Validate(root, fence, false);
    if (!result.ok) { return result; }
    auto candidate = std::make_unique<FenceLease::Data>();
    candidate->factoryToken = data_->token;
    candidate->rootToken = root.data_->rootToken;
    ++data_->lockWriteOpenAttempts;
    result = RelativeOpen(root.data_->witnesses.back().handle.Get(), kLockName,
        FILE_READ_DATA | FILE_WRITE_DATA | FILE_READ_ATTRIBUTES | SYNCHRONIZE, 0, candidate->handle);
    if (!result.code.empty()) {
        if (result.win32Error == ERROR_SHARING_VIOLATION) {
            Result busy = Describe(root, fence); busy.code = "fence_busy";
            busy.win32Error = result.win32Error; busy.ntStatus = result.ntStatus; return busy;
        }
        return Fail(root, fence, result);
    }
    // Install privately before any failing hook so explicit Dispose checks its closure.
    fence.data_ = std::move(candidate);
    data_->activeFenceToken = fence.data_->fenceToken;
    result = data_->Pause("after_lock");
    if (!result.code.empty()) { return Fail(root, fence, result); }
    result = LockIdentity(fence.data_->handle.Get(), root.data_->witnesses.back().identity,
        fence.data_->identity, data_->config->slot->invalidateLockQuery);
    if (!result.code.empty()) { return Fail(root, fence, result); }
    result = data_->Pause("before_publish");
    if (!result.code.empty()) { return Fail(root, fence, result); }
    result = Validate(root, fence, false);
    if (!result.ok) { return result; }
    Identity fresh;
    result = LockIdentity(fence.data_->handle.Get(), root.data_->witnesses.back().identity, fresh, false);
    if (!result.code.empty()) { return Fail(root, fence, result); }
    if (!EqualIdentity(fresh, fence.data_->identity)) { return Fail(root, fence, Error("lock_identity_changed")); }
    ++data_->counter;
    fence.data_->ref = std::string(data_->config->slot->instanceId) + ":" + std::to_string(data_->counter);
    ++data_->publishedAcquisitions;
    result = Validate(root, fence, true);
    if (result.ok) { result.code = "acquired"; }
    return result;
}

Result Factory::LiveCheck(RootLease& root, FenceLease& fence, const std::string& ref) {
    const std::string prefix = std::string(data_->config->slot->instanceId) + ":";
    if (ref.compare(0, prefix.size(), prefix) != 0) {
        Result result = Describe(root, fence); result.code = "foreign_session_ref"; return result;
    }
    if (!fence.data_ || ref != fence.data_->ref) {
        Result result = Describe(root, fence); result.code = "stale_session_ref"; return result;
    }
    Result result = Validate(root, fence, true);
    if (result.ok) { result.code = "checked"; }
    return result;
}

Result Factory::Release(RootLease& root, FenceLease& fence, const std::string& ref) {
    Result result = LiveCheck(root, fence, ref);
    if (!result.ok) { return result; }
    fence.data_->ref.clear();
    fence.data_->fenceToken->live = false;
    data_->activeFenceToken.reset();
    const DWORD error = fence.data_->handle.Close();
    fence.data_.reset();
    if (error != 0) {
        data_->cleanupUnknown = true;
        return Fail(root, fence, Error("cleanup_unknown", error));
    }
    result = Validate(root, fence, false);
    if (result.ok) { result.code = "released"; }
    return result;
}

bool Factory::CrashProofEnabled() const noexcept { return data_->config->slot->crashProof; }
bool Factory::SuppressFirstAcquireAck() const noexcept { return data_->config->slot->lostAcquireAck; }
bool Factory::BindingProofEnabled() const noexcept { return data_->config->slot->bindingProof; }

Result Factory::RunBindingProof(RootLease& root, FenceLease& fence) {
    if (!BindingProofEnabled()) {
        Result result = Describe(root, fence); result.code = "binding_proof_unavailable"; return result;
    }
    Result initial = Validate(root, fence, true);
    if (!initial.ok) { return initial; }
    if (!fence.data_) { Result result = Describe(root, fence); result.code = "no_active_session"; return result; }
    const std::string ref = fence.data_->ref;
    RootLease movedRoot(std::move(root));
    FenceLease movedFence(std::move(fence));
    FenceLease alternateFence;
    std::vector<BindingProofStep> steps;
    bool passed = true;
    const auto record = [&steps, &passed](const char* operation, const Result& result, bool expectedOk) {
        steps.push_back(BindingProofStep{operation, result.ok, result.code, result.fenceState});
        if (result.ok != expectedOk || result.fenceState != "FENCE_HELD"
            || (!expectedOk && result.code != "invalid_lease_reference")) { passed = false; }
    };
    record("observe_alternate", Observe(movedRoot, alternateFence), false);
    record("dispose_alternate", Dispose(movedRoot, alternateFence), false);
    record("observe_moved_from_root", Observe(root, movedFence), false);
    record("dispose_moved_from_root", Dispose(root, movedFence), false);
    record("observe_moved_from_fence", Observe(movedRoot, fence), false);
    record("dispose_moved_from_fence", Dispose(movedRoot, fence), false);
    record("observe_moved_objects", Observe(movedRoot, movedFence), true);
    record("check_moved_objects", LiveCheck(movedRoot, movedFence, ref), true);
    // Restore the original CLI variables, preserving the logical object identity.
    root = std::move(movedRoot);
    fence = std::move(movedFence);
    Result result = Validate(root, fence, true);
    if (!result.ok) { return result; }
    result.bindingProof = std::move(steps);
    if (!passed || result.sessionRef != ref) {
        Result failure = Error("binding_proof_failed");
        failure.bindingProof = std::move(result.bindingProof);
        return Fail(root, fence, failure);
    }
    result.code = "binding_checked";
    return result;
}

std::string JsonResult(const std::string& operation, const Result& result) {
    std::ostringstream output;
    output << "{\"schema\":\"ae-agent.initial-fence-prerequisite.v1\","
        << "\"scope\":\"windows_identity_fence_prerequisite\",\"productionAuthority\":false,"
        << "\"issuerStatus\":\"unavailable\",\"admission\":false,\"ok\":" << (result.ok ? "true" : "false")
        << ",\"operation\":" << JsonString(operation) << ",\"code\":" << JsonString(result.code)
        << ",\"fenceState\":" << JsonString(result.fenceState)
        << ",\"win32Error\":" << result.win32Error << ",\"ntStatus\":" << result.ntStatus
        << ",\"testTrace\":{\"lockWriteOpenAttempts\":" << result.lockWriteOpenAttempts
        << ",\"publishedAcquisitions\":" << result.publishedAcquisitions << "}";
    if (result.ok && result.hasRootIdentity) { output << ",\"rootIdentity\":" << JsonIdentity(result.rootIdentity); }
    if (result.ok && result.hasLockIdentity) { output << ",\"lockIdentity\":" << JsonIdentity(result.lockIdentity); }
    if (result.ok && !result.sessionRef.empty()) {
        output << ",\"activeSessionRef\":" << JsonString(result.sessionRef);
        if (operation == "acquire") { output << ",\"sessionRef\":" << JsonString(result.sessionRef); }
    }
    if (!result.bindingProof.empty()) {
        output << ",\"bindingProof\":[";
        bool first = true;
        for (const auto& step : result.bindingProof) {
            if (!first) { output << ','; }
            first = false;
            output << "{\"operation\":" << JsonString(step.operation) << ",\"ok\":" << (step.ok ? "true" : "false")
                << ",\"code\":" << JsonString(step.code) << ",\"fenceState\":" << JsonString(step.fenceState) << '}';
        }
        output << ']';
    }
    output << '}';
    return output.str();
}
} // namespace initial_fence
