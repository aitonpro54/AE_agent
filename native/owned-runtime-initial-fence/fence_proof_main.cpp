#include "fence_win32.h"
#include <windows.h>
#include <array>
#include <exception>
#include <string>
#include <utility>

namespace {
enum class ReadState { Line, Eof, Invalid, IoFailure };

ReadState ReadLine(std::string& line) {
    line.clear();
    const HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    for (;;) {
        unsigned char value = 0;
        DWORD read = 0;
        if (!ReadFile(input, &value, 1, &read, nullptr)) {
            const DWORD readError = GetLastError(); // Save before querying the handle type.
            if (readError == ERROR_BROKEN_PIPE && read == 0 && GetFileType(input) == FILE_TYPE_PIPE) {
                return line.empty() ? ReadState::Eof : ReadState::Invalid;
            }
            return ReadState::IoFailure;
        }
        // TRUE/zero on a pipe can represent a zero-byte write, not writer EOF.
        if (read == 0) {
            if (GetFileType(input) == FILE_TYPE_PIPE) { return ReadState::IoFailure; }
            return line.empty() ? ReadState::Eof : ReadState::Invalid;
        }
        if (value == '\n') {
            if (!line.empty() && line.back() == '\r') { line.pop_back(); }
            return line.empty() ? ReadState::Invalid : ReadState::Line;
        }
        if ((value < 32 && value != '\r') || value > 126 || line.size() >= 256) { return ReadState::Invalid; }
        if (!line.empty() && line.back() == '\r') { return ReadState::Invalid; }
        line += static_cast<char>(value);
    }
}

bool WriteResult(const std::string& operation, const initial_fence::Result& result) {
    const std::string line = initial_fence::JsonResult(operation, result) + '\n';
    if (line.size() > 8192) { return false; }
    DWORD written = 0;
    return WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), line.data(), static_cast<DWORD>(line.size()),
        &written, nullptr) && written == line.size();
}

bool Ascii(const std::wstring& value, std::string& output) {
    if (value.empty() || value.size() > 128) { return false; }
    for (const wchar_t ch : value) {
        if (ch < 33 || ch > 126) { return false; }
        output += static_cast<char>(ch);
    }
    return true;
}

bool ParseCommand(const std::string& line, std::string& operation, std::string& ref) {
    if (line == "observe" || line == "acquire" || line == "dispose" || line == "crash" || line == "binding-proof"
        || line == "lock-property-proof") {
        operation = line; return true;
    }
    const auto space = line.find(' ');
    if (space == std::string::npos || space == 0 || space + 1 >= line.size()
        || line.find(' ', space + 1) != std::string::npos || line.find('\t') != std::string::npos) { return false; }
    operation = line.substr(0, space);
    ref = line.substr(space + 1);
    if (operation != "check" && operation != "release") { return false; }
    if (ref.size() > 128) { return false; }
    for (const char ch : ref) {
        if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')
            || ch == ':' || ch == '-')) { return false; }
    }
    return true;
}
} // namespace

int wmain(int argc, wchar_t** argv) {
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
    try {
        initial_fence::Result creation;
        creation.terminal = true;
        creation.code = "invalid_argv";
        std::string instance;
        std::unique_ptr<initial_fence::Factory> factory;
        if (argc == 3 && std::wstring(argv[1]) == L"--canonical-factory-instance" && Ascii(argv[2], instance)) {
            factory = initial_fence::Factory::CreateApprovedCanonicalTestFactory(instance, creation);
        } else {
            if (argc != 5 || std::wstring(argv[1]) != L"--fixture-root"
                || std::wstring(argv[3]) != L"--factory-instance" || !Ascii(argv[4], instance)) {
                WriteResult("startup", creation); return 2;
            }
            factory = initial_fence::Factory::CreateApprovedTestFactory(argv[2], instance, creation);
        }
        if (!factory) { WriteResult("startup", creation); return 2; }
        initial_fence::RootLease root;
        initial_fence::FenceLease fence;
        auto startup = factory->OpenRoot(root, fence);
        if (!WriteResult("startup", startup)) { factory->Dispose(root, fence); return 3; }
        if (!startup.ok) { return 2; }
        bool suppressed = false;
        for (;;) {
            std::string line;
            const ReadState state = ReadLine(line);
            if (state == ReadState::Eof) { return factory->Dispose(root, fence).ok ? 0 : 4; }
            std::string operation;
            std::string ref;
            if (state != ReadState::Line || !ParseCommand(line, operation, ref)
                || (operation == "crash" && !factory->CrashProofEnabled())
                || (operation == "binding-proof" && !factory->BindingProofEnabled())) {
                auto failure = factory->Dispose(root, fence);
                failure.ok = false;
                failure.terminal = true;
                failure.code = "protocol_refused";
                WriteResult("protocol", failure); return 2;
            }
            if (operation == "crash") { ExitProcess(73); }
            initial_fence::Result result;
            if (operation == "observe") { result = factory->Observe(root, fence); }
            else if (operation == "acquire") { result = factory->TryAcquire(root, fence); }
            else if (operation == "check") { result = factory->LiveCheck(root, fence, ref); }
            else if (operation == "release") { result = factory->Release(root, fence, ref); }
            else if (operation == "binding-proof") { result = factory->RunBindingProof(root, fence); }
            else if (operation == "lock-property-proof") { result = factory->RunCanonicalLockPropertyProof(root, fence); }
            else { result = factory->Dispose(root, fence); }
            // Lost-ACK proof suppresses exactly one successful acquisition ACK.
            // It leaves the same child/lease available for observe reconciliation.
            if (operation == "acquire" && result.ok && factory->SuppressFirstAcquireAck() && !suppressed) {
                suppressed = true; continue;
            }
            if (!WriteResult(operation, result)) { factory->Dispose(root, fence); return 3; }
            if (result.terminal) { return 2; }
            if (operation == "dispose") { return result.ok ? 0 : 4; }
        }
    } catch (const std::exception&) {
        // Stack unwinding closes local RAII leases; exact process exit is parent evidence.
        constexpr char diagnostic[] = "prerequisite exception; no replay\n";
        DWORD written = 0;
        WriteFile(GetStdHandle(STD_ERROR_HANDLE), diagnostic, sizeof(diagnostic) - 1, &written, nullptr);
        return 5;
    }
}
