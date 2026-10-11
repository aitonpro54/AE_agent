// Actual Win32 IPC unit test. Every endpoint belongs to this executable and
// uses a fresh offline-test name; never starts/connects the resident service.
#include "offline_transport_smoke.h"
#include "service_transport.h"
#include <chrono>
#include <memory>
#include <stdexcept>

namespace {
unsigned checks = 0, pairs = 0;
void Check(bool value) { if (!value) throw std::runtime_error("offline_transport_contract_failed"); ++checks; }
struct PipePair {
    std::wstring name;
    ame_service::Handle server, stop;
    std::unique_ptr<ame_service::Handle> client;
    PipePair() : name(std::wstring(L"\\\\.\\pipe\\AEAgent.NativeSnapshot.OfflineAckTest.") + [] { const auto nonce = ame_service::RandomChallenge(); return std::wstring(nonce.begin(), nonce.end()); }()),
        server(CreateNamedPipeW(name.c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1,
            static_cast<DWORD>(ame_service::kMaxResponseBytes), static_cast<DWORD>(ame_service::kMaxExchangeBytes), 1000, nullptr)),
        stop(CreateEventW(nullptr, TRUE, FALSE, nullptr)) {
        ame_service::Require(server.get() != INVALID_HANDLE_VALUE && stop.get(), "offline_pipe_create_failed");
        client = std::make_unique<ame_service::Handle>(CreateFileW(name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr,
            OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr));
        ame_service::Require(client->get() != INVALID_HANDLE_VALUE, "offline_pipe_client_failed");
        // Opening our client before ConnectNamedPipe is the documented
        // ERROR_PIPE_CONNECTED interleaving; no foreign instance/retry.
        ame_service::Handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr));
        ame_service::Require(event.get() != nullptr, "offline_pipe_event_failed");
        OVERLAPPED connected{}; connected.hEvent = event.get();
        const auto ok = ConnectNamedPipe(server.get(), &connected);
        ame_service::Require(ok || GetLastError() == ERROR_PIPE_CONNECTED, "offline_pipe_connect_failed");
        DWORD mode = PIPE_READMODE_MESSAGE;
        ame_service::Require(SetNamedPipeHandleState(client->get(), &mode, nullptr, nullptr), "offline_pipe_message_mode_failed");
        ++pairs;
    }
};
// Only the invalid/no-ACK cases use this bounded raw peer. Valid delayed-read
// runs both exact production delivery helpers, including kernel peer checks.
void Message(HANDLE pipe, bool write, std::string& bytes, DWORD limit) {
    if (!write) bytes.resize(limit);
    ame_service::Handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr));
    ame_service::Require(event.get() != nullptr, "offline_pipe_event_failed");
    OVERLAPPED io{}; io.hEvent = event.get(); DWORD count = 0;
    const auto ok = write ? WriteFile(pipe, bytes.data(), static_cast<DWORD>(bytes.size()), &count, &io) :
        ReadFile(pipe, bytes.data(), limit, &count, &io);
    if (!ok) {
        ame_service::Require(GetLastError() == ERROR_IO_PENDING, "offline_peer_io_failed");
        if (WaitForSingleObject(event.get(), 1500) != WAIT_OBJECT_0) {
            CancelIoEx(pipe, &io); GetOverlappedResult(pipe, &io, &count, TRUE);
            throw ame_service::Failure("offline_peer_io_timeout");
        }
        ame_service::Require(GetOverlappedResult(pipe, &io, &count, FALSE), "offline_peer_io_failed");
    }
    ame_service::Require(count > 0 && (!write || count == bytes.size()), "offline_peer_io_incomplete");
    if (!write) bytes.resize(count);
}
enum class Case { DelayedRead, Refusal, Cancel, Timeout, WrongNonce, WrongChallenge, WrongHash, MissingLf, ExtraKey, Oversized };
void Exchange(Case scenario, const ame_service::ProcessIdentity& self) {
    using namespace ame_service;
    PipePair pipe;
    const std::string nonce = scenario == Case::Refusal ? "" : std::string(64, 'a');
    const std::string challenge(64, 'b');
    const std::string response = "{\"status\":\"" + std::string(scenario == Case::Refusal ? "refused" : "unit_only") +
        "\",\"payload\":\"" + std::string(2048, 'x') + "\"}\n";
    Handle finished(CreateEventW(nullptr, TRUE, FALSE, nullptr)); Require(finished.get() != nullptr, "offline_pipe_event_failed");
    bool acked = false; std::string server_reason, client_reason;
    const auto started = GetTickCount64();
    std::thread worker([&] {
        try { SendResponseAndWaitForAck(pipe.server.get(), response, nonce, challenge, self, self,
            pipe.stop.get(), started + kResponseAckTtlMs); acked = true; }
        catch (const std::exception& error) { server_reason = error.what(); }
        DisconnectNamedPipe(pipe.server.get()); SetEvent(finished.get());
    });
    try {
        DWORD available = 0;
        while (!available && GetTickCount64() < started + 700) {
            Require(PeekNamedPipe(pipe.client->get(), nullptr, 0, nullptr, &available, nullptr), "offline_response_lost_before_read");
            if (!available) Require(WaitForSingleObject(finished.get(), 5) == WAIT_TIMEOUT, "offline_disconnected_before_read");
        }
        Check(available == response.size());
        Check(WaitForSingleObject(finished.get(), 0) == WAIT_TIMEOUT);
        if (scenario == Case::DelayedRead || scenario == Case::Refusal) {
            // The response is already buffered, but the reader waits. The old
            // immediate DisconnectNamedPipe implementation loses these bytes.
            Check(WaitForSingleObject(finished.get(), 100) == WAIT_TIMEOUT);
            Check(ReceiveResponseAndAck(pipe.client->get(), nonce, challenge, self, self, pipe.stop.get(),
                started + kResponseAckTtlMs) == response);
        } else {
            std::string read; Message(pipe.client->get(), false, read, static_cast<DWORD>(kMaxResponseBytes)); Check(read == response);
            Check(WaitForSingleObject(finished.get(), 0) == WAIT_TIMEOUT);
            if (scenario == Case::Cancel) SetEvent(pipe.stop.get());
            else if (scenario != Case::Timeout) {
                auto ack = ResponseAck(nonce, challenge, read);
                if (scenario == Case::WrongNonce) ack[ack.find("nonce=") + 6] = '0';
                if (scenario == Case::WrongChallenge) ack[ack.find("challenge=") + 10] = '0';
                if (scenario == Case::WrongHash) { auto& digit = ack[ack.find("response_sha256=") + 16]; digit = digit == '0' ? '1' : '0'; }
                if (scenario == Case::MissingLf) ack.pop_back();
                if (scenario == Case::ExtraKey) ack += "extra=1\n";
                if (scenario == Case::Oversized) ack.assign(kMaxResponseAckBytes + 1, 'x');
                Message(pipe.client->get(), true, ack, static_cast<DWORD>(kMaxResponseAckBytes + 1));
            }
        }
    } catch (const std::exception& error) { client_reason = error.what(); SetEvent(pipe.stop.get()); }
    const auto completed = WaitForSingleObject(finished.get(), 1800);
    if (completed != WAIT_OBJECT_0) SetEvent(pipe.stop.get());
    worker.join(); // production I/O above has a finite deadline and stop event
    Check(completed == WAIT_OBJECT_0); Check(client_reason.empty());
    if (scenario == Case::DelayedRead || scenario == Case::Refusal) { Check(acked); Check(server_reason.empty()); }
    else {
        Check(!acked);
        Check(server_reason == (scenario == Case::Cancel || scenario == Case::Timeout || scenario == Case::Oversized ?
            "pipe_io_timeout_or_failure_no_replay" : "response_ack_mismatch_no_replay"));
        if (scenario == Case::Timeout) Check(GetTickCount64() - started >= kResponseAckTtlMs);
        Check(GetTickCount64() - started < 2500);
    }
}
void PeerAndFreshness(const ame_service::ProcessIdentity& self) {
    using namespace ame_service;
    PipePair pipe; auto wrong = self; ++wrong.pid;
    const auto refuses = [&](auto work, const char* reason) {
        std::string actual; try { work(); } catch (const std::exception& error) { actual = error.what(); } Check(actual == reason);
    };
    const std::string response = "{\"status\":\"unit_only\"}\n", nonce(64, 'a'), challenge(64, 'b');
    refuses([&] { SendResponseAndWaitForAck(pipe.server.get(), response, nonce, challenge, self, wrong, pipe.stop.get(), GetTickCount64() + 1000); }, "pipe_peer_changed");
    refuses([&] { ReceiveResponseAndAck(pipe.client->get(), nonce, challenge, self, wrong, pipe.stop.get(), GetTickCount64() + 1000); }, "pipe_server_identity_changed");
    SetEvent(pipe.stop.get());
    refuses([&] { SendResponseAndWaitForAck(pipe.server.get(), response, nonce, challenge, self, self, pipe.stop.get(), GetTickCount64() + 1000); }, "pipe_io_timeout_or_failure_no_replay");
    ResetEvent(pipe.stop.get());
    refuses([&] { SendResponseAndWaitForAck(pipe.server.get(), response, nonce, challenge, self, self, pipe.stop.get(), GetTickCount64()); }, "pipe_io_timeout_or_failure_no_replay");
    DWORD available = 0; Check(PeekNamedPipe(pipe.client->get(), nullptr, 0, nullptr, &available, nullptr) && available == 0);
    DisconnectNamedPipe(pipe.server.get());
}
}
OfflineTransportSmokeResult RunOfflineTransportSmoke() {
    const auto self = ame_service::ObserveProcess(GetCurrentProcessId());
    for (const auto scenario : {Case::DelayedRead, Case::Refusal, Case::Cancel, Case::Timeout, Case::WrongNonce,
        Case::WrongChallenge, Case::WrongHash, Case::MissingLf, Case::ExtraKey, Case::Oversized}) Exchange(scenario, self);
    PeerAndFreshness(self); return {checks, pairs};
}
