// Minimal real Win32 capability repro. NOT an AE/receipt acceptance test.
// Every invocation creates a fresh ignored root; no retry/fallback of its rename.
#include "probe_io.h"
#include <cstddef>
#include <iostream>
#include <vector>

namespace {
void Need(bool ok, const char* reason) { if (!ok) throw probe::Failure(reason); }
std::wstring FinalPath(HANDLE h) {
    wchar_t path[32768]; DWORD size = GetFinalPathNameByHandleW(h, path, 32768, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
    Need(size > 4 && size < 32768, "repro_final_path"); return std::wstring(path, size);
}
FILE_ID_INFO Identity(HANDLE h) {
    FILE_ID_INFO info{}; Need(GetFileInformationByHandleEx(h, FileIdInfo, &info, sizeof(info)) != 0, "repro_file_id"); return info;
}
std::string Read(HANDLE h) {
    LARGE_INTEGER zero{}; Need(SetFilePointerEx(h, zero, nullptr, FILE_BEGIN) != 0, "repro_seek");
    char bytes[128]; DWORD size = 0; Need(ReadFile(h, bytes, sizeof(bytes), &size, nullptr) != 0, "repro_read"); return std::string(bytes, size);
}
}
int wmain(int argc, wchar_t** argv) {
    try {
        Need(argc == 2, "repro_requires_owned_build_parent");
        const auto parent = probe::Canonical(argv[1]);
        const auto path = parent + L"\\relative-" + probe::Wide(probe::RandomToken());
        Need(CreateDirectoryW(path.c_str(), nullptr) != 0, "repro_fresh_directory");
        constexpr DWORD root_access = FILE_READ_ATTRIBUTES | FILE_LIST_DIRECTORY;
        probe::Handle root(CreateFileW(path.c_str(), root_access, FILE_SHARE_READ | FILE_SHARE_WRITE,
            nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
        Need(root.value != INVALID_HANDLE_VALUE && GetFileType(root.value) == FILE_TYPE_DISK, "repro_root_handle");
        BY_HANDLE_FILE_INFORMATION root_info{};
        Need(GetFileInformationByHandle(root.value, &root_info) != 0 &&
            (root_info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) && !(root_info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT), "repro_root_regular_directory");
        const auto root_final = FinalPath(root.value);
        Need(root_final == L"\\\\?\\" + path, "repro_root_canonical_path");
        const auto part = path + L"\\receipt.json.part";
        probe::Handle producer(CreateFileW(part.c_str(), GENERIC_READ | GENERIC_WRITE | DELETE,
            FILE_SHARE_READ, nullptr, CREATE_NEW,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr));
        Need(producer.value != INVALID_HANDLE_VALUE, "repro_new_producer_handle");
        const std::string bytes = "held producer bytes\n"; DWORD written = 0;
        Need(WriteFile(producer.value, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) &&
            written == bytes.size() && FlushFileBuffers(producer.value), "repro_write_flush");
        const auto before_id = Identity(producer.value);
        Need(Read(producer.value) == bytes, "repro_same_handle_pre_read");
        const std::wstring name = L"receipt.json";
        const DWORD name_bytes = static_cast<DWORD>(name.size() * sizeof(wchar_t)); // excludes NUL
        // Include a zero terminator in capacity while retaining exact non-NUL byte length.
        std::vector<unsigned char> storage(sizeof(FILE_RENAME_INFO) + name_bytes + sizeof(wchar_t), 0);
        auto rename = reinterpret_cast<FILE_RENAME_INFO*>(storage.data());
        rename->ReplaceIfExists = FALSE; rename->RootDirectory = root.value;
        rename->FileNameLength = name_bytes;
        std::copy(name.begin(), name.end(), rename->FileName);
        const bool renamed = SetFileInformationByHandle(producer.value, FileRenameInfo, rename,
            static_cast<DWORD>(storage.size())) != 0;
        const DWORD rename_error = renamed ? ERROR_SUCCESS : GetLastError();
        const auto after_id = Identity(producer.value);
        const bool same_id = before_id.VolumeSerialNumber == after_id.VolumeSerialNumber &&
            std::equal(std::begin(before_id.FileId.Identifier), std::end(before_id.FileId.Identifier), std::begin(after_id.FileId.Identifier));
        const bool same_bytes = Read(producer.value) == bytes;
        const auto after_path = FinalPath(producer.value);
        Need(same_id && same_bytes, "repro_producer_changed");
        std::cout << "{\"schema\":\"ae-agent.relative-rename-repro.v1\",\"offline\":true,\"hostLoaded\":false,\"acceptance\":false,\"rootPath\":" << probe::Json(probe::Utf8(path))
            << ",\"rootCanonicalPath\":" << probe::Json(probe::Utf8(root_final)) << ",\"rootDesiredAccess\":" << root_access
            << ",\"rootHandleValid\":true,\"rootDirectory\":true,\"rootReparse\":false,\"rootHandle\":" << reinterpret_cast<std::uintptr_t>(root.value)
            << ",\"pointerSize\":" << sizeof(void*) << ",\"wcharSize\":" << sizeof(wchar_t)
            << ",\"renameStructSize\":" << sizeof(FILE_RENAME_INFO) << ",\"renameStructAlignment\":" << alignof(FILE_RENAME_INFO)
            << ",\"rootDirectoryOffset\":" << offsetof(FILE_RENAME_INFO, RootDirectory)
            << ",\"fileNameLengthOffset\":" << offsetof(FILE_RENAME_INFO, FileNameLength)
            << ",\"fileNameOffset\":" << offsetof(FILE_RENAME_INFO, FileName)
            << ",\"bufferAlignmentRemainder\":" << (reinterpret_cast<std::uintptr_t>(storage.data()) % alignof(FILE_RENAME_INFO))
            << ",\"fileName\":" << probe::Json(probe::Utf8(name)) << ",\"fileNameLengthBytes\":" << name_bytes
            << ",\"bufferSizeBytes\":" << storage.size() << ",\"nulCapacityIncluded\":true,\"replaceIfExists\":false"
            << ",\"renameSucceeded\":" << (renamed ? "true" : "false") << ",\"renameWin32Error\":" << rename_error
            << ",\"producerIdentityPreserved\":true,\"producerBytesPreserved\":true,\"producerPathAfter\":" << probe::Json(probe::Utf8(after_path))
            << ",\"fallbackAttempted\":false,\"replayAttempted\":false}\n";
        return 0;
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
