#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#include "service_protocol.h"
#include <vector>

namespace ame_service {
class Handle {
    HANDLE value_ = INVALID_HANDLE_VALUE;
public:
    explicit Handle(HANDLE value = INVALID_HANDLE_VALUE) noexcept : value_(value) {}
    ~Handle() { if (value_ != INVALID_HANDLE_VALUE && value_) CloseHandle(value_); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    Handle(Handle&& other) noexcept : value_(other.value_) { other.value_ = INVALID_HANDLE_VALUE; }
    HANDLE get() const noexcept { return value_; }
};
std::string Utf8(const std::wstring& text);
std::wstring ModulePath(HMODULE module);
std::string FileSha256(const std::wstring& path);
std::string RandomChallenge();
ProcessIdentity ObserveProcess(std::uint32_t pid);
// Server endpoint observes the actual client; client endpoint observes the
// actual server. Both also bind the local counterpart. No trust from pipe name.
ProcessIdentity ObservePipeClient(HANDLE pipe, const ProcessIdentity& expected_local_host);
ProcessIdentity ObservePipeServer(HANDLE pipe, const ProcessIdentity& expected_local_daemon);

// Informational, not authenticated. One no-replace publication in a fixed
// KnownFolder path. No configurable project path, ENV or request data involved.
class PublicBootReceipt {
    std::vector<Handle> directories_;
    std::vector<Handle> files_;
public:
    void Publish(const ServiceIdentity& identity);
};
} // namespace ame_service
