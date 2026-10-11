#pragma once
#include "service_crypto.h"
#include <condition_variable>
#include <deque>
#include <thread>

namespace ame_service {
inline constexpr std::size_t kMaxResponseBytes = 2 * 1024 * 1024;
inline constexpr std::size_t kMaxResponseAckBytes = 512;
inline constexpr std::uint64_t kResponseAckTtlMs = 1000;
// Transport receipt only: confirms the same peer read these response bytes;
// does not grant authority or signify semantic acceptance of an inspection.
std::string ResponseAck(std::string_view nonce, std::string_view challenge, std::string_view response);
void SendResponseAndWaitForAck(HANDLE pipe, const std::string& response, std::string_view nonce, std::string_view challenge,
    const ProcessIdentity& local_host, const ProcessIdentity& peer, HANDLE stop, std::uint64_t deadline);
std::string ReceiveResponseAndAck(HANDLE pipe, std::string_view nonce, std::string_view challenge,
    const ProcessIdentity& local_daemon, const ProcessIdentity& host, HANDLE stop, std::uint64_t deadline);
std::wstring ServicePipeName(const ServiceIdentity&);
std::string ExchangeOnVerifiedPipe(std::string_view enrollment_bytes, std::string_view inspect_bytes);
struct PendingInspection final {
    VerifiedInspectTicket ticket;
    std::mutex mutex;
    std::condition_variable completion;
    std::atomic<bool> canceled{false};
    bool completed = false;
    std::string response;
    explicit PendingInspection(VerifiedInspectTicket&& value) : ticket(std::move(value)) {}
};
class VerifiedInspectionMailbox final {
    std::mutex mutex_;
    std::deque<std::shared_ptr<PendingInspection>> queue_;
    bool closed_ = false;
public:
    std::shared_ptr<PendingInspection> Submit(VerifiedInspectTicket&& ticket);
    std::shared_ptr<PendingInspection> Pop();
    void Close() noexcept;
};
// State owns this for host process lifetime, just like registered hook refcons.
// Its worker never calls Adobe. Only main-thread idle consumes verified tickets.
class ResidentTransport final {
    CngVerifier crypto_;
    ServiceIdentity identity_;
    AuthorizationVerifier verifier_;
    VerifiedInspectionMailbox& mailbox_;
    Handle stop_;
    std::thread worker_;
    void Worker() noexcept;
public:
    ResidentTransport(IssuerPin, ServiceIdentity, VerifiedInspectionMailbox&);
    void Start();
    void Stop() noexcept;
    ~ResidentTransport();
};
} // namespace ame_service
