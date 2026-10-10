#pragma once
#include <atomic>
#include <cstdint>
#include <deque>
#include <exception>
#include <mutex>
#include <string>
#include <string_view>
#include <type_traits>

namespace ame_service {
inline constexpr std::size_t kMaxRequestBytes = 2048;
inline constexpr std::size_t kMaxQueuedRequests = 4;
inline constexpr const char* kAuthorizationGap = "production_authorization_not_implemented";

struct Failure final : std::exception {
    const char* reason;
    explicit Failure(const char* value) noexcept : reason(value) {}
    const char* what() const noexcept override { return reason; }
};
void Require(bool condition, const char* reason);
bool LowerHex(std::string_view text, std::size_t length) noexcept;
std::string Json(std::string_view text);

// Birth is the exact unsigned FILETIME decimal string, never milliseconds or a
// floating point JSON number. PID alone is not an identity.
struct ProcessIdentity {
    std::uint32_t pid = 0;
    std::string birth_100ns;
    std::string image_path;
    std::string image_sha256;
};
struct ServiceIdentity {
    ProcessIdentity host;
    std::string plugin_path;
    std::string plugin_sha256;
    std::string build_id;
    std::string sdk_archive_sha256;
    std::string challenge;
};
bool SameProcess(const ProcessIdentity& a, const ProcessIdentity& b) noexcept;
void ValidateIdentity(const ServiceIdentity& identity);
std::string PublicIdentityJson(const ServiceIdentity& identity);

enum class Operation { Identity, Inspect, Capture };
struct Request {
    Operation operation = Operation::Identity;
    std::string nonce;
    std::string challenge;
    std::uint32_t host_pid = 0;
    std::string host_birth_100ns;
    std::string host_image_sha256;
    std::string plugin_sha256;
    std::string build_id;
    std::string sdk_archive_sha256;
};
Request ParseRequest(std::string_view bytes);
void RequireTarget(const Request& request, const ServiceIdentity& identity);
std::string RefusalJson(const Request& request, const char* reason);

// A wire-supplied enrollment, caller-supplied path, same-user ACL, or public boot
// receipt NEVER provides authority. No enrollment verifier exists in v1.
// Keep this typed seam closed until pinned-key issuer verification is implemented.
struct FixedDaemonEnrollment {
    ProcessIdentity daemon;
    ProcessIdentity host;
    std::string plugin_sha256;
};
const char* ProductionAuthorizationGap() noexcept;
std::string RejectCandidate(std::string_view bytes, const ServiceIdentity& identity,
    const ProcessIdentity& observed_peer, const FixedDaemonEnrollment* enrollment);

// Future worker -> main-thread mailbox; no endpoint and no production caller in
// v1. Capacity and nonce replay protection hold for the process lifetime; once
// the bounded nonce ledger fills the mailbox closes instead of forgetting.
class RequestMailbox {
    std::mutex mutex_;
    std::deque<Request> queue_;
    std::deque<std::string> nonces_;
    bool closed_ = false;
public:
    static constexpr std::size_t kMaxNonces = 64;
    bool Push(const Request& request);
    bool Pop(Request& request);
    void Close() noexcept;
};

// Same atomic RAII semantics as the probe, independently owned by the service.
// The flag is held across exception/refusal publication; nested idle callbacks
// cannot consume a second request, publish twice, or reopen the service.
class IdleDispatchGate {
    std::atomic_flag in_flight_ = ATOMIC_FLAG_INIT;
public:
    template<typename Work, typename Refuse>
    bool Run(Work&& work, Refuse&& refuse) noexcept {
        static_assert(std::is_nothrow_invocable_v<Refuse, const char*>);
        if (in_flight_.test_and_set(std::memory_order_acquire)) return false;
        struct Release {
            std::atomic_flag& flag;
            ~Release() { flag.clear(std::memory_order_release); }
        } release{in_flight_};
        try { work(); }
        catch (const std::exception& e) { refuse(e.what()); }
        catch (...) { refuse("unknown_native_exception"); }
        return true;
    }
};
} // namespace ame_service
