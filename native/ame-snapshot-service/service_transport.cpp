#include "service_transport.h"
#include <sddl.h>
#include <chrono>
#include <memory>

namespace ame_service {
namespace {
struct Security {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    SECURITY_ATTRIBUTES attributes{sizeof(SECURITY_ATTRIBUTES), nullptr, FALSE};
    Security() {
        const auto sddl = CurrentUserDacl(); const std::wstring wide(sddl.begin(), sddl.end());
        Require(ConvertStringSecurityDescriptorToSecurityDescriptorW(wide.c_str(), SDDL_REVISION_1, &descriptor, nullptr), "pipe_dacl_invalid");
        attributes.lpSecurityDescriptor = descriptor;
    }
    ~Security() { if (descriptor) LocalFree(descriptor); }
};
bool WaitIo(HANDLE pipe, OVERLAPPED& overlapped, HANDLE stop, std::uint64_t deadline, DWORD& transferred) {
    HANDLE events[2]{overlapped.hEvent, stop};
    const auto now = GetTickCount64(); if (now >= deadline) { CancelIoEx(pipe, &overlapped); GetOverlappedResult(pipe, &overlapped, &transferred, TRUE); return false; }
    const auto wait = WaitForMultipleObjects(stop ? 2 : 1, events, FALSE, static_cast<DWORD>(deadline - now));
    if (wait != WAIT_OBJECT_0) {
        CancelIoEx(pipe, &overlapped); GetOverlappedResult(pipe, &overlapped, &transferred, TRUE); return false;
    }
    return GetOverlappedResult(pipe, &overlapped, &transferred, FALSE) != FALSE;
}
void Io(HANDLE pipe, bool write, std::string& bytes, std::size_t limit, HANDLE stop, std::uint64_t deadline) {
    Require(limit <= kMaxResponseBytes, "pipe_frame_limit");
    Require(GetTickCount64() < deadline && (!stop || WaitForSingleObject(stop, 0) == WAIT_TIMEOUT), "pipe_io_timeout_or_failure_no_replay");
    Require(!write || (!bytes.empty() && bytes.size() <= limit), "pipe_frame_limit");
    if (!write) bytes.resize(limit);
    Handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr)); Require(event.get() != nullptr, "pipe_event_failed");
    OVERLAPPED overlapped{}; overlapped.hEvent = event.get(); DWORD transferred = 0;
    const auto success = write ? WriteFile(pipe, bytes.data(), static_cast<DWORD>(bytes.size()), &transferred, &overlapped) :
        ReadFile(pipe, bytes.data(), static_cast<DWORD>(bytes.size()), &transferred, &overlapped);
    if (!success) Require(GetLastError() == ERROR_IO_PENDING && WaitIo(pipe, overlapped, stop, deadline, transferred), "pipe_io_timeout_or_failure_no_replay");
    Require(transferred > 0 && transferred <= limit && (!write || transferred == bytes.size()), "pipe_frame_incomplete");
    Require(GetTickCount64() < deadline && (!stop || WaitForSingleObject(stop, 0) == WAIT_TIMEOUT), "pipe_io_timeout_or_failure_no_replay");
    if (!write) bytes.resize(transferred);
}
std::pair<std::string, std::string> ParseExchange(std::string_view bytes) {
    Require(bytes.size() <= kMaxExchangeBytes && bytes.substr(0, 15) == "enrollment_hex=", "exchange_schema_invalid");
    const auto first = bytes.find('\n'); Require(first != std::string_view::npos, "exchange_schema_invalid");
    constexpr std::string_view second_key = "inspect_hex=";
    const auto remaining = bytes.substr(first + 1);
    Require(remaining.substr(0, second_key.size()) == second_key && !remaining.empty() && remaining.back() == '\n' &&
        remaining.find('\n') == remaining.size() - 1, "exchange_schema_invalid");
    return {UnhexBytes(bytes.substr(15, first - 15), kMaxSignedBytes), UnhexBytes(remaining.substr(second_key.size(), remaining.size() - second_key.size() - 1), kMaxSignedBytes)};
}
}
std::string ResponseAck(std::string_view nonce, std::string_view challenge, std::string_view response) {
    Require((nonce.empty() || LowerHex(nonce, 64)) && LowerHex(challenge, 64), "response_ack_binding_invalid");
    Require(!response.empty() && response.size() <= kMaxResponseBytes, "pipe_frame_limit");
    const auto ack = "schema=ae-agent.snapshot-service.transport-ack.v2\nnonce=" + std::string(nonce.empty() ? "-" : nonce) +
        "\nchallenge=" + std::string(challenge) + "\nresponse_sha256=" + Sha256Bytes(response) + '\n';
    Require(ack.size() <= kMaxResponseAckBytes, "response_ack_limit"); return ack;
}
void SendResponseAndWaitForAck(HANDLE pipe, const std::string& response, std::string_view nonce, std::string_view challenge,
    const ProcessIdentity& local_host, const ProcessIdentity& peer, HANDLE stop, std::uint64_t deadline) {
    const auto expected_ack = ResponseAck(nonce, challenge, response);
    Require(SameProcess(ObservePipeClient(pipe, local_host), peer), "pipe_peer_changed");
    auto bytes = response; Io(pipe, true, bytes, kMaxResponseBytes, stop, deadline);
    std::string ack; Io(pipe, false, ack, kMaxResponseAckBytes, stop, deadline);
    // Exact equality enforces ordered schema, LF, nonce/challenge/hash and no
    // duplicate/extra keys. Never disconnect immediately after a buffered write.
    Require(ack == expected_ack, "response_ack_mismatch_no_replay");
    Require(SameProcess(ObservePipeClient(pipe, local_host), peer), "pipe_peer_changed");
    Require(GetTickCount64() < deadline && (!stop || WaitForSingleObject(stop, 0) == WAIT_TIMEOUT), "pipe_io_timeout_or_failure_no_replay");
}
std::string ReceiveResponseAndAck(HANDLE pipe, std::string_view nonce, std::string_view challenge,
    const ProcessIdentity& local_daemon, const ProcessIdentity& host, HANDLE stop, std::uint64_t deadline) {
    Require(SameProcess(ObservePipeServer(pipe, local_daemon), host), "pipe_server_identity_changed");
    std::string response; Io(pipe, false, response, kMaxResponseBytes, stop, deadline);
    Require(SameProcess(ObservePipeServer(pipe, local_daemon), host), "pipe_server_identity_changed");
    auto ack = ResponseAck(nonce, challenge, response); Io(pipe, true, ack, kMaxResponseAckBytes, stop, deadline);
    return response; // ACK describes bytes read, regardless of response status.
}
std::wstring ServicePipeName(const ServiceIdentity& identity) {
    ValidateIdentity(identity);
    const auto name = "\\\\.\\pipe\\AEAgent.NativeSnapshot.v2." + std::to_string(identity.host.pid) + '.' + identity.host.birth_100ns + '.' + identity.challenge;
    return {name.begin(), name.end()};
}
std::shared_ptr<PendingInspection> VerifiedInspectionMailbox::Submit(VerifiedInspectTicket&& ticket) {
    std::lock_guard<std::mutex> lock(mutex_);
    Require(!closed_ && queue_.size() < kMaxQueuedRequests, "inspection_mailbox_closed_or_full");
    auto pending = std::make_shared<PendingInspection>(std::move(ticket)); queue_.push_back(pending); return pending;
}
std::shared_ptr<PendingInspection> VerifiedInspectionMailbox::Pop() {
    std::lock_guard<std::mutex> lock(mutex_); if (closed_ || queue_.empty()) return {};
    auto pending = queue_.front(); queue_.pop_front(); return pending;
}
void VerifiedInspectionMailbox::Close() noexcept {
    std::lock_guard<std::mutex> lock(mutex_); closed_ = true;
    for (const auto& pending : queue_) {
        std::lock_guard<std::mutex> job_lock(pending->mutex); pending->canceled = true; pending->completion.notify_all();
    }
    queue_.clear();
}
ResidentTransport::ResidentTransport(IssuerPin pin, ServiceIdentity identity, VerifiedInspectionMailbox& mailbox)
    : identity_(std::move(identity)), verifier_(std::move(pin), identity_, crypto_), mailbox_(mailbox),
    stop_(CreateEventW(nullptr, TRUE, FALSE, nullptr)) { Require(stop_.get() != nullptr, "worker_stop_event_failed"); }
ResidentTransport::~ResidentTransport() { Stop(); if (worker_.joinable()) worker_.join(); }
void ResidentTransport::Start() { Require(!worker_.joinable(), "worker_start_already_attempted"); worker_ = std::thread([this] { Worker(); }); }
void ResidentTransport::Stop() noexcept { SetEvent(stop_.get()); mailbox_.Close(); }
void ResidentTransport::Worker() noexcept {
    try {
        Security security;
        while (WaitForSingleObject(stop_.get(), 0) == WAIT_TIMEOUT) {
            Handle pipe(CreateNamedPipeW(ServicePipeName(identity_).c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
                PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1,
                static_cast<DWORD>(kMaxResponseBytes), static_cast<DWORD>(kMaxExchangeBytes), 10000, &security.attributes));
            Require(pipe.get() != INVALID_HANDLE_VALUE, "pipe_squatting_or_create_failure_closed");
            Handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr)); Require(event.get() != nullptr, "pipe_event_failed");
            OVERLAPPED connected{}; connected.hEvent = event.get(); DWORD transferred = 0;
            const auto success = ConnectNamedPipe(pipe.get(), &connected); const auto error = success ? ERROR_SUCCESS : GetLastError();
            if (!success && error != ERROR_PIPE_CONNECTED) {
                Require(error == ERROR_IO_PENDING, "pipe_connect_failed");
                HANDLE events[2]{event.get(), stop_.get()};
                if (WaitForMultipleObjects(2, events, FALSE, INFINITE) != WAIT_OBJECT_0) {
                    CancelIoEx(pipe.get(), &connected); GetOverlappedResult(pipe.get(), &connected, &transferred, TRUE); break;
                }
                Require(GetOverlappedResult(pipe.get(), &connected, &transferred, FALSE), "pipe_connect_failed");
            }
            std::string nonce, response; ProcessIdentity peer; bool peer_observed = false;
            try {
                peer = ObservePipeClient(pipe.get(), identity_.host); peer_observed = true;
                const auto deadline = GetTickCount64() + kInspectTtlMs;
                std::string bytes; Io(pipe.get(), false, bytes, kMaxExchangeBytes, stop_.get(), deadline);
                const auto exchange = ParseExchange(bytes); auto parsed = ParseSignedClaims(exchange.second); nonce = parsed.nonce;
                auto ticket = verifier_.VerifyExchange(exchange.first, exchange.second, peer, NowMs());
                auto job = mailbox_.Submit(std::move(ticket));
                std::unique_lock<std::mutex> lock(job->mutex);
                const auto now = NowMs();
                const auto ttl = job->ticket.Claims().expires_ms > now ? job->ticket.Claims().expires_ms - now : 0;
                job->completion.wait_for(lock, std::chrono::milliseconds(ttl), [&] { return job->completed || job->canceled.load() || WaitForSingleObject(stop_.get(), 0) != WAIT_TIMEOUT; });
                if (!job->completed || WaitForSingleObject(stop_.get(), 0) != WAIT_TIMEOUT) job->canceled.store(true, std::memory_order_release);
                Require(job->completed && !job->canceled, "inspection_timeout_or_shutdown_no_replay"); response = job->response;
                lock.unlock(); Require(SameProcess(ObservePipeClient(pipe.get(), identity_.host), peer), "pipe_peer_changed");
            } catch (const std::exception& error) { response = InspectRefusal(nonce, identity_.challenge, error.what()); }
            if (WaitForSingleObject(stop_.get(), 0) != WAIT_TIMEOUT) break;
            if (peer_observed) {
                try { SendResponseAndWaitForAck(pipe.get(), response, nonce, identity_.challenge,
                    identity_.host, peer, stop_.get(), GetTickCount64() + kResponseAckTtlMs); } catch (...) {}
            }
            // No FlushFileBuffers (can block forever waiting for an absent client).
            DisconnectNamedPipe(pipe.get());
        }
    } catch (...) { SetEvent(stop_.get()); mailbox_.Close(); }
    verifier_.Close();
}
std::string ExchangeOnVerifiedPipe(std::string_view enrollment_bytes, std::string_view inspect_bytes) {
    const auto e = ParseSignedClaims(enrollment_bytes), i = ParseSignedClaims(inspect_bytes);
    const auto self = ObserveProcess(GetCurrentProcessId()); Require(SameProcess(self, e.daemon) && SameProcess(self, i.daemon), "adapter_daemon_identity_mismatch");
    Require(i.expires_ms > NowMs(), "inspection_expired");
    // Signatures are verified on both ends; public boot JSON is only a candidate.
    CngVerifier verifier; const auto pin = CompiledIssuerPin();
    Require(verifier.Verify(pin, e.signed_bytes, e.signature_hex) && verifier.Verify(pin, i.signed_bytes, i.signature_hex), "issuer_signature_invalid");
    Handle pipe(CreateFileW(ServicePipeName(e.service).c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr));
    Require(pipe.get() != INVALID_HANDLE_VALUE, "native_pipe_unavailable_no_replay");
    Require(SameProcess(ObservePipeServer(pipe.get(), self), e.service.host), "pipe_server_identity_mismatch");
    // A file/module candidate is additionally measured; hashes remain provenance,
    // not a hostile same-user code-loading attestation.
    const auto plugin_path = e.service.plugin_path; const auto count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, plugin_path.data(), static_cast<int>(plugin_path.size()), nullptr, 0);
    Require(count > 0, "plugin_path_invalid"); std::wstring wide(count, L'\0'); MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, plugin_path.data(), static_cast<int>(plugin_path.size()), wide.data(), count);
    Require(FileSha256(wide) == e.service.plugin_sha256, "plugin_provenance_mismatch");
    DWORD mode = PIPE_READMODE_MESSAGE; Require(SetNamedPipeHandleState(pipe.get(), &mode, nullptr, nullptr), "pipe_message_mode_failed");
    auto bytes = "enrollment_hex=" + HexBytes(enrollment_bytes) + "\ninspect_hex=" + HexBytes(inspect_bytes) + '\n';
    Require(bytes.size() <= kMaxExchangeBytes, "exchange_frame_limit"); const auto deadline = GetTickCount64() + kInspectTtlMs;
    Io(pipe.get(), true, bytes, kMaxExchangeBytes, nullptr, deadline);
    return ReceiveResponseAndAck(pipe.get(), i.nonce, e.service.challenge, self, e.service.host, nullptr, deadline);
}
} // namespace ame_service
