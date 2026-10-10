// Pure C++ offline protocol/hook harness. All host/daemon facts are synthetic.
// Does not load an AEX, call EntryPoint, Adobe suites/hooks or Win32 IPC helpers.
#include "service_protocol.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <stdexcept>

namespace {
unsigned checks = 0;
void Check(bool value) { if (!value) throw std::runtime_error("offline_contract_failed"); ++checks; }
template<typename Work> void Refuses(Work work, const char* expected) {
    bool refused = false;
    try { work(); } catch (const ame_service::Failure& error) { refused = error.reason == std::string(expected); }
    Check(refused);
}
ame_service::ServiceIdentity SyntheticIdentity() {
    return {{1234, "134040000000000001", "C:\\Synthetic\\AfterFX.exe", std::string(64, 'a')},
        "C:\\Synthetic\\AEAgentSnapshotService.aex", std::string(64, 'b'), "build-" + std::string(32, 'c'),
        std::string(64, 'd'), std::string(64, 'e')};
}
std::string Frame(const ame_service::ServiceIdentity& identity, const std::string& operation = "identity") {
    return "schema=ae-agent.snapshot-service.request.v1\noperation=" + operation + "\nnonce=" + std::string(64, 'f') +
        "\nchallenge=" + identity.challenge + "\nhost_pid=" + std::to_string(identity.host.pid) +
        "\nhost_birth_100ns=" + identity.host.birth_100ns + "\nhost_image_sha256=" + identity.host.image_sha256 +
        "\nplugin_sha256=" + identity.plugin_sha256 + "\nbuild_id=" + identity.build_id + "\nsdk_archive_sha256=" + identity.sdk_archive_sha256 + "\n";
}
std::string Replace(std::string input, const std::string& old, const std::string& replacement) {
    const auto at = input.find(old); Check(at != std::string::npos); input.replace(at, old.size(), replacement); return input;
}
std::string Nonce(unsigned value) {
    std::ostringstream out; out << std::hex << std::setfill('0') << std::setw(64) << value; return out.str();
}
void Protocol() {
    using namespace ame_service;
    const auto identity = SyntheticIdentity(); const auto frame = Frame(identity);
    const ProcessIdentity daemon{4321, "134040000000000002", "C:\\Synthetic\\fixed-node.exe", std::string(64, '1')};
    const FixedDaemonEnrollment enrollment{daemon, identity.host, identity.plugin_sha256};
    const auto public_json = PublicIdentityJson(identity);
    for (const auto* proof : {"\"productionReady\":false", "\"ipcListenerStarted\":false", "\"snapshot_mutation\":false",
        "\"project_inspect\":false", "\"read_only_identity\":true", "\"authenticated\":false", "\"birth100ns\":\"134040000000000001\""})
        Check(public_json.find(proof) != std::string::npos);
    Check(std::string(ProductionAuthorizationGap()) == kAuthorizationGap);
    for (const auto* operation : {"identity", "inspect", "capture"}) {
        const auto current = Frame(identity, operation);
        auto request = ParseRequest(current); RequireTarget(request, identity);
        const auto no_enrollment = RejectCandidate(current, identity, {}, nullptr);
        Check(no_enrollment.find(kAuthorizationGap) != std::string::npos);
        Check(no_enrollment.find("\"mutationAttempted\":false") != std::string::npos);
        Check(no_enrollment.find("\"projectFactsExposed\":false") != std::string::npos);
        const auto forged_enrollment = RejectCandidate(current, identity, daemon, &enrollment);
        Check(forged_enrollment.find(kAuthorizationGap) != std::string::npos); // exact match still lacks issuer
        Check(forged_enrollment.find(std::string(64, 'f')) != std::string::npos); // exact nonce echo
    }
    for (unsigned field = 0; field < 4; ++field) {
        auto wrong = daemon;
        if (field == 0) ++wrong.pid;
        if (field == 1) wrong.birth_100ns = "134040000000000003";
        if (field == 2) wrong.image_path = "C:\\Synthetic\\other-node.exe";
        if (field == 3) wrong.image_sha256[0] = '2';
        Check(!SameProcess(wrong, daemon));
        Refuses([&] { RejectCandidate(frame, identity, wrong, &enrollment); }, "fixed_daemon_identity_mismatch");
    }
    auto wrong_host = enrollment; ++wrong_host.host.pid;
    Refuses([&] { RejectCandidate(frame, identity, daemon, &wrong_host); }, "fixed_daemon_identity_mismatch");
    auto wrong_plugin = enrollment; wrong_plugin.plugin_sha256[0] = '0';
    Refuses([&] { RejectCandidate(frame, identity, daemon, &wrong_plugin); }, "fixed_daemon_identity_mismatch");
    for (unsigned field = 0; field < 7; ++field) {
        auto request = ParseRequest(frame);
        if (field == 0) request.challenge[0] = '0';
        if (field == 1) ++request.host_pid;
        if (field == 2) request.host_birth_100ns = "134040000000000002";
        if (field == 3) request.host_image_sha256[0] = '0';
        if (field == 4) request.plugin_sha256[0] = '0';
        if (field == 5) request.build_id[6] = '0';
        if (field == 6) request.sdk_archive_sha256[0] = '0';
        Refuses([&] { RequireTarget(request, identity); }, "service_identity_binding_mismatch");
    }
    Refuses([&] { ParseRequest(""); }, "request_size_or_framing_invalid");
    Refuses([&] { ParseRequest(frame.substr(0, frame.size() - 1)); }, "request_size_or_framing_invalid");
    Refuses([&] { ParseRequest(std::string(kMaxRequestBytes, 'a') + "\n"); }, "request_size_or_framing_invalid");
    for (const char bad : {'\0', '\r', '\t', static_cast<char>(0x80)}) {
        auto invalid = frame; invalid[20] = bad;
        Refuses([&] { ParseRequest(invalid); }, "request_noncanonical_byte");
    }
    Refuses([&] { ParseRequest(frame + "extra=1\n"); }, "request_exact_schema_required");
    Refuses([&] { ParseRequest(frame + "nonce=" + std::string(64, 'f') + "\n"); }, "request_exact_schema_required");
    Refuses([&] { ParseRequest(Replace(frame, "schema=ae-agent.snapshot-service.request.v1", "schema=fixture-v2")); }, "request_exact_schema_required");
    Refuses([&] { ParseRequest(Replace(frame, "operation=identity", "operation=save")); }, "operation_not_supported");
    Refuses([&] { ParseRequest(Replace(frame, "operation=identity", "operation=identity=extra")); }, "request_value_invalid");
    Refuses([&] { ParseRequest(Replace(frame, "nonce=" + std::string(64, 'f'), "nonce=")); }, "request_value_invalid");
    for (const auto bad : {std::string(63, 'f'), std::string(65, 'f'), std::string(64, 'F'), std::string(64, 'g')})
        Refuses([&] { ParseRequest(Replace(frame, "nonce=" + std::string(64, 'f'), "nonce=" + bad)); }, "request_nonce_challenge_invalid");
    for (const auto* bad : {"0", "01234", "-1", "1.0", "1e3", " 1234", "18446744073709551616"})
        Refuses([&] { ParseRequest(Replace(frame, "host_pid=1234", std::string("host_pid=") + bad)); },
            std::string(bad) == "18446744073709551616" ? "identity_decimal_overflow" : "invalid_decimal_identity");
    Refuses([&] { ParseRequest(Replace(frame, "host_pid=1234", "host_pid=4294967296")); }, "invalid_pid");
    Refuses([&] { ParseRequest(Replace(frame, "host_birth_100ns=134040000000000001", "host_birth_100ns=1340400000000000000.1")); }, "invalid_decimal_identity");
    for (const auto key : {"host_image_sha256", "plugin_sha256", "sdk_archive_sha256"}) {
        auto invalid = frame; const auto at = invalid.find(std::string(key) + "="); Check(at != std::string::npos);
        invalid[at + std::string(key).size() + 1] = 'G';
        Refuses([&] { ParseRequest(invalid); }, "request_hash_invalid");
    }
    Refuses([&] { ParseRequest(Replace(frame, "build_id=build-", "build_id=fixture-")); }, "invalid_build_id");
    Refuses([&] { ParseRequest(Replace(frame, "challenge=", "nonce=")); }, "request_exact_schema_required");
    Check(Json("a\"\\\n") == "\"a\\\"\\\\\\u000a\"");
}
void HooksAndMailbox() {
    using namespace ame_service;
    IdleDispatchGate gate; unsigned work = 0, refusals = 0;
    const auto refuse = [&](const char*) noexcept { ++refusals; };
    Check(gate.Run([&] {
        ++work;
        Check(!gate.Run([&] { ++work; }, refuse));
    }, refuse));
    Check(work == 1 && refusals == 0);
    Check(gate.Run([&] { throw Failure("synthetic_throw"); }, [&](const char* reason) noexcept {
        ++refusals;
        if (std::string_view(reason) != "synthetic_throw") std::terminate();
        if (gate.Run([&] { ++work; }, refuse)) std::terminate();
    }));
    Check(refusals == 1 && work == 1);
    Check(gate.Run([&] { ++work; }, refuse)); // RAII released after exception
    Check(work == 2);
    Check(gate.Run([] { throw 42; }, refuse));
    Check(refusals == 2);
    RequestMailbox mailbox; auto request = ParseRequest(Frame(SyntheticIdentity())); Request popped;
    Check(!mailbox.Pop(popped)); Check(mailbox.Push(request)); Check(!mailbox.Push(request));
    Check(mailbox.Pop(popped)); Check(popped.nonce == request.nonce); Check(!mailbox.Push(request));
    for (unsigned i = 1; i <= kMaxQueuedRequests; ++i) { request.nonce = Nonce(i); Check(mailbox.Push(request)); }
    request.nonce = Nonce(5); Check(!mailbox.Push(request)); // capacity refusal does not consume nonce
    Check(mailbox.Pop(popped)); Check(mailbox.Push(request));
    mailbox.Close(); Check(!mailbox.Pop(popped)); request.nonce = Nonce(6); Check(!mailbox.Push(request));
    RequestMailbox ledger;
    for (unsigned i = 0; i < RequestMailbox::kMaxNonces; ++i) {
        request.nonce = Nonce(i); Check(ledger.Push(request)); Check(ledger.Pop(popped));
    }
    request.nonce = Nonce(999); Check(!ledger.Push(request)); Check(!ledger.Pop(popped));
    request.nonce = Nonce(1000); Check(!ledger.Push(request)); // fail closed at ledger bound
    RequestMailbox invalid; request.nonce = "short";
    Refuses([&] { invalid.Push(request); }, "mailbox_nonce_invalid");
}
}
int main() {
    try {
        Protocol(); HooksAndMailbox();
        std::cout << "{\"status\":\"passed\",\"checks\":" << checks << ",\"offline\":true,\"hostLoaded\":false,"
            "\"syntheticHostFacts\":true,\"projectWrites\":0,\"exports\":0,\"productionReady\":false,"
            "\"authorizationGap\":\"production_authorization_not_implemented\","
            "\"scope\":\"production C++ protocol/mailbox/RAII gate; synthetic process facts; EntryPoint, Adobe suites/hooks, Win32 peer/receipt helpers NOT executed\"}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cout << "{\"status\":\"failed\",\"checks\":" << checks << ",\"reason\":" << ame_service::Json(error.what()) << "}\n";
        return 1;
    }
}
