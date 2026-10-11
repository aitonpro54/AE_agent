// Offline protocol/authorization harness. All host/daemon facts are synthetic.
// Genuine in-memory CNG ECDSA-P256; own temporary IPC unit, no persisted key,
// resident endpoint, AEX load or Adobe dispatch.
#include "service_protocol.h"
#include "service_transport.h"
#include "offline_transport_smoke.h"
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
std::string Signed(const ame_service::SignedClaims& claims, ame_service::EphemeralTestIssuer& issuer) {
    const auto bytes = ame_service::EncodeSignedClaims(claims);
    return bytes + "signature=" + issuer.Sign(bytes) + '\n';
}
void Authorization() {
    using namespace ame_service;
    EphemeralTestIssuer issuer, foreign; const auto pin = issuer.Pin(); CngVerifier crypto;
    const auto compiled = CompiledIssuerPin();
    Check((compiled.key_id.empty() && compiled.public_blob_hex.empty()) ||
        (LowerHex(compiled.key_id, 32) && LowerHex(compiled.public_blob_hex, 144) &&
            Sha256Bytes(UnhexBytes(compiled.public_blob_hex, 72)).substr(0, 32) == compiled.key_id));
    const auto service = SyntheticIdentity();
    const ProcessIdentity daemon{4321, "134040000000000002", "C:\\Synthetic\\fixed-node.exe", std::string(64, '1')};
    SignedClaims enrollment; enrollment.purpose = "enrollment"; enrollment.key_id = pin.key_id;
    enrollment.service = service; enrollment.daemon = daemon; enrollment.nonce = Nonce(10000);
    enrollment.generation = std::string(32, '2'); enrollment.source_sha256 = std::string(64, '3');
    enrollment.issued_ms = 2000; enrollment.expires_ms = 62000;
    const auto enrollment_bytes = Signed(enrollment, issuer);
    SignedClaims inspect = enrollment; inspect.purpose = "inspect"; inspect.nonce = Nonce(1);
    inspect.issued_ms = 2500; inspect.expires_ms = 8000; inspect.expected_path = "C:\\Synthetic\\saved.aep";
    inspect.action_id = "manual-action-1"; inspect.proposal_revision = "3";
    inspect.payload_sha256 = std::string(64, '4'); inspect.preview_sha256 = std::string(64, '5');
    inspect.dry_run_sha256 = std::string(64, '6'); inspect.run_id = "manual-run-1";
    inspect.enrollment_sha256 = crypto.Digest(enrollment_bytes);
    const auto inspect_bytes = Signed(inspect, issuer);
    const auto parsed = ParseSignedClaims(inspect_bytes);
    Check(crypto.Verify(pin, parsed.signed_bytes, parsed.signature_hex));
    Check(!crypto.Verify(foreign.Pin(), parsed.signed_bytes, parsed.signature_hex));
    Check(!crypto.Verify({}, parsed.signed_bytes, parsed.signature_hex));
    Check(!crypto.Verify(pin, parsed.signed_bytes + 'x', parsed.signature_hex));
    Check(!crypto.Verify(pin, parsed.signed_bytes, std::string(128, '0')));
    Refuses([&] { AuthorizationVerifier unprovisioned({}, service, crypto); }, "issuer_pin_missing_or_invalid");
    AuthorizationVerifier verifier(pin, service, crypto);
    auto ticket = verifier.VerifyExchange(enrollment_bytes, inspect_bytes, daemon, 3000);
    Check(ticket.Claims().action_id == inspect.action_id && ticket.Claims().proposal_revision == inspect.proposal_revision);
    Refuses([&] { verifier.VerifyExchange(enrollment_bytes, inspect_bytes, daemon, 3000); }, "authorization_nonce_replay");
    // Every signed binding field is changed WITHOUT resigning: actual CNG must
    // reject even syntactically valid altered action/revision/manual hashes.
    for (unsigned field = 0; field < 24; ++field) {
        auto wrong = inspect;
        switch (field) {
        case 0: ++wrong.service.host.pid; break;
        case 1: wrong.service.host.birth_100ns = "134040000000000003"; break;
        case 2: wrong.service.host.image_path = "C:\\Synthetic\\other.exe"; break;
        case 3: wrong.service.host.image_sha256[0] = '0'; break;
        case 4: wrong.service.plugin_path = "C:\\Synthetic\\other.aex"; break;
        case 5: wrong.service.plugin_sha256[0] = '0'; break;
        case 6: wrong.service.build_id[6] = '0'; break;
        case 7: wrong.service.sdk_archive_sha256[0] = '0'; break;
        case 8: wrong.service.challenge[0] = '0'; break;
        case 9: ++wrong.daemon.pid; break;
        case 10: wrong.daemon.birth_100ns = "134040000000000004"; break;
        case 11: wrong.daemon.image_path = "C:\\Synthetic\\other-node.exe"; break;
        case 12: wrong.daemon.image_sha256[0] = '0'; break;
        case 13: wrong.action_id += "-changed"; break;
        case 14: wrong.proposal_revision = "4"; break;
        case 15: wrong.payload_sha256[0] = '0'; break;
        case 16: wrong.preview_sha256[0] = '0'; break;
        case 17: wrong.dry_run_sha256[0] = '0'; break;
        case 18: wrong.run_id += "-changed"; break;
        case 19: wrong.expected_path = "C:\\Synthetic\\other.aep"; break;
        case 20: wrong.generation[0] = '0'; break;
        case 21: wrong.source_sha256[0] = '0'; break;
        case 22: wrong.enrollment_sha256[0] = '0'; break;
        case 23: wrong.nonce = Nonce(2); break;
        }
        AuthorizationVerifier changed(pin, service, crypto);
        const auto altered = EncodeSignedClaims(wrong) + "signature=" + parsed.signature_hex + '\n';
        Refuses([&] { changed.VerifyExchange(enrollment_bytes, altered, daemon, 3000); }, "issuer_signature_invalid");
    }
    // Also test target and kernel peer binding WITH valid issuer signatures.
    for (unsigned field = 0; field < 9; ++field) {
        auto wrong = inspect;
        if (field == 0) ++wrong.service.host.pid;
        if (field == 1) wrong.service.host.birth_100ns = "134040000000000003";
        if (field == 2) wrong.service.host.image_path = "C:\\Synthetic\\other.exe";
        if (field == 3) wrong.service.host.image_sha256[0] = '0';
        if (field == 4) wrong.service.plugin_path = "C:\\Synthetic\\other.aex";
        if (field == 5) wrong.service.plugin_sha256[0] = '0';
        if (field == 6) wrong.service.build_id[6] = '0';
        if (field == 7) wrong.service.sdk_archive_sha256[0] = '0';
        if (field == 8) wrong.service.challenge[0] = '0';
        AuthorizationVerifier changed(pin, service, crypto);
        Refuses([&] { changed.VerifyExchange(enrollment_bytes, Signed(wrong, issuer), daemon, 3000); }, "service_identity_binding_mismatch");
    }
    for (unsigned field = 0; field < 4; ++field) {
        auto peer = daemon;
        if (field == 0) ++peer.pid;
        if (field == 1) peer.birth_100ns = "134040000000000003";
        if (field == 2) peer.image_path = "C:\\Synthetic\\other-node.exe";
        if (field == 3) peer.image_sha256[0] = '0';
        AuthorizationVerifier changed(pin, service, crypto);
        Refuses([&] { changed.VerifyExchange(enrollment_bytes, inspect_bytes, peer, 3000); }, "fixed_daemon_identity_mismatch");
    }
    for (unsigned field = 0; field < 4; ++field) {
        auto wrong = inspect;
        if (field == 0) wrong.generation[0] = '0';
        if (field == 1) wrong.source_sha256[0] = '0';
        if (field == 2) wrong.enrollment_sha256[0] = '0';
        if (field == 3) { wrong.issued_ms = 60000; wrong.expires_ms = 63000; }
        AuthorizationVerifier changed(pin, service, crypto);
        Refuses([&] { changed.VerifyExchange(enrollment_bytes, Signed(wrong, issuer), daemon, field == 3 ? 60500 : 3000); }, "enrollment_binding_mismatch");
    }
    for (unsigned field = 0; field < 4; ++field) {
        auto wrong = inspect;
        if (field == 0) wrong.issued_ms = 3001;
        if (field == 1) wrong.expires_ms = 3000;
        if (field == 2) wrong.expires_ms = wrong.issued_ms;
        if (field == 3) wrong.expires_ms = wrong.issued_ms + kInspectTtlMs + 1;
        AuthorizationVerifier changed(pin, service, crypto);
        Refuses([&] { changed.VerifyExchange(enrollment_bytes, Signed(wrong, issuer), daemon, 3000); }, "authorization_expired_or_ttl_invalid");
    }
    auto overttl = enrollment; overttl.expires_ms = overttl.issued_ms + kEnrollmentTtlMs + 1;
    Refuses([&] { AuthorizationVerifier changed(pin, service, crypto); changed.VerifyExchange(Signed(overttl, issuer), inspect_bytes, daemon, 3000); }, "authorization_expired_or_ttl_invalid");
    for (const auto* purpose : {"capture", "save", "raw", "identity", "autonomous"}) {
        auto wrong = inspect; wrong.purpose = purpose;
        Refuses([&] { ParseSignedClaims(Signed(wrong, issuer)); }, "signed_purpose_forbidden");
    }
    Refuses([&] { ParseSignedClaims(Replace(inspect_bytes, "autonomous=false", "autonomous=true")); }, "autonomous_inspect_forbidden");
    Refuses([&] { ParseSignedClaims(inspect_bytes + "extra=1\n"); }, "signed_exact_schema_required");
    Refuses([&] { ParseSignedClaims(inspect_bytes.substr(0, inspect_bytes.size() - 1)); }, "signed_frame_limit");
    Refuses([&] { ParseSignedClaims(Replace(inspect_bytes, "proposal_revision=3", "proposal_revision=03")); }, "noncanonical_unsigned");
    auto invalid_enrollment = enrollment; invalid_enrollment.action_id = "forbidden";
    Refuses([&] { ParseSignedClaims(Signed(invalid_enrollment, issuer)); }, "enrollment_scope_invalid");
    auto same_nonce = inspect; same_nonce.nonce = enrollment.nonce;
    Refuses([&] { AuthorizationVerifier changed(pin, service, crypto); changed.VerifyExchange(enrollment_bytes, Signed(same_nonce, issuer), daemon, 3000); }, "authorization_nonce_replay");
    // Renewal preserves daemon/provenance and all used nonces, including old
    // enrollment nonces. A process/source/generation change needs a new boot.
    auto renewed = enrollment; renewed.nonce = Nonce(10001); renewed.issued_ms = 65000; renewed.expires_ms = 125000;
    const auto renewed_bytes = Signed(renewed, issuer);
    auto renewed_inspect = inspect; renewed_inspect.nonce = Nonce(2); renewed_inspect.issued_ms = 66000; renewed_inspect.expires_ms = 71000;
    renewed_inspect.enrollment_sha256 = crypto.Digest(renewed_bytes);
    const auto renewed_inspect_bytes = Signed(renewed_inspect, issuer);
    auto renewal_ticket = verifier.VerifyExchange(renewed_bytes, renewed_inspect_bytes, daemon, 67000);
    Check(renewal_ticket.Claims().enrollment_sha256 == crypto.Digest(renewed_bytes));
    Refuses([&] { verifier.VerifyExchange(enrollment_bytes, inspect_bytes, daemon, 67000); }, "authorization_expired_or_ttl_invalid");
    for (const auto nonce : {inspect.nonce, enrollment.nonce, renewed.nonce}) {
        auto replay = renewed_inspect; replay.nonce = nonce;
        Refuses([&] { verifier.VerifyExchange(renewed_bytes, Signed(replay, issuer), daemon, 67000); }, "authorization_nonce_replay");
    }
    for (unsigned field = 0; field < 3; ++field) {
        auto other = renewed; other.nonce = Nonce(10002); other.issued_ms = 66000; other.expires_ms = 126000;
        auto peer = daemon;
        if (field == 0) { ++peer.pid; other.daemon = peer; }
        if (field == 1) other.generation[0] = '0';
        if (field == 2) other.source_sha256[0] = '0';
        const auto other_bytes = Signed(other, issuer); auto other_inspect = renewed_inspect; other_inspect.nonce = Nonce(3);
        other_inspect.daemon = peer; other_inspect.generation = other.generation; other_inspect.source_sha256 = other.source_sha256;
        other_inspect.enrollment_sha256 = crypto.Digest(other_bytes);
        Refuses([&] { verifier.VerifyExchange(other_bytes, Signed(other_inspect, issuer), peer, 67000); }, "enrollment_already_fixed");
    }
    auto rollback = renewed; rollback.nonce = Nonce(10003); rollback.issued_ms = 64000; rollback.expires_ms = 124000;
    const auto rollback_bytes = Signed(rollback, issuer); auto rollback_inspect = renewed_inspect; rollback_inspect.nonce = Nonce(3);
    rollback_inspect.enrollment_sha256 = crypto.Digest(rollback_bytes);
    Refuses([&] { verifier.VerifyExchange(rollback_bytes, Signed(rollback_inspect, issuer), daemon, 67000); }, "enrollment_renewal_not_monotonic");
    std::atomic<bool> canceled{false}; RequireInspectionFresh(ticket, 3000, &canceled); ++checks;
    canceled.store(true); Refuses([&] { RequireInspectionFresh(ticket, 3000, &canceled); }, "inspection_canceled");
    canceled.store(false); Refuses([&] { RequireInspectionFresh(ticket, 8000, &canceled); }, "inspection_expired");
    InspectionSnapshot baseline; baseline.path = inspect.expected_path; baseline.handle_identity = "synthetic-handle";
    baseline.revision = "3"; baseline.graph_json = "{\"items\":[]}"; baseline.graph_sha256 = crypto.Digest(baseline.graph_json);
    baseline.complete = true; baseline.item_count = 256;
    RequireStableInspection(baseline, baseline, ticket); ++checks;
    const auto response = InspectResponse(ticket, baseline);
    for (const auto* proof : {"\"fullProjectContext\":false", "\"maxItems\":256", "\"saveDispatches\":0", "\"captureDispatches\":0", "\"callerJsxDispatches\":0"}) Check(response.find(proof) != std::string::npos);
    for (const auto count : {257u, 465u}) { auto overflow = baseline; overflow.item_count = count;
        Refuses([&] { RequireInspectionItemCount(count); }, "inspection_item_limit");
        Refuses([&] { RequireStableInspection(overflow, overflow, ticket); }, "inspection_item_limit");
        Refuses([&] { InspectResponse(ticket, overflow); }, "inspection_item_limit");
    }
    for (unsigned field = 0; field < 5; ++field) { auto stale = baseline;
        if (field == 0) stale.handle_identity += "-changed";
        if (field == 1) stale.revision = "4";
        if (field == 2) stale.dirty = true;
        if (field == 3) stale.graph_json += ' ';
        if (field == 4) stale.graph_sha256[0] = '0';
        Refuses([&] { RequireStableInspection(baseline, stale, ticket); }, "inspection_stale");
    }
    auto untitled = baseline; untitled.path.clear(); Refuses([&] { RequireStableInspection(untitled, baseline, ticket); }, "untitled_project_denied");
    auto incomplete = baseline; incomplete.complete = false; Refuses([&] { RequireStableInspection(incomplete, baseline, ticket); }, "inspection_coverage_incomplete");
    Refuses([&] { InspectResponse(ticket, incomplete); }, "inspection_coverage_incomplete");
    VerifiedInspectionMailbox mailbox; AuthorizationVerifier queued(pin, service, crypto);
    std::shared_ptr<PendingInspection> pending;
    for (unsigned n = 1; n <= kMaxQueuedRequests; ++n) { auto next = inspect; next.nonce = Nonce(100 + n);
        pending = mailbox.Submit(queued.VerifyExchange(enrollment_bytes, Signed(next, issuer), daemon, 3000)); Check(!pending->canceled.load());
    }
    auto excess = inspect; excess.nonce = Nonce(105);
    Refuses([&] { mailbox.Submit(queued.VerifyExchange(enrollment_bytes, Signed(excess, issuer), daemon, 3000)); }, "inspection_mailbox_closed_or_full");
    Refuses([&] { queued.VerifyExchange(enrollment_bytes, Signed(excess, issuer), daemon, 3000); }, "authorization_nonce_replay");
    auto popped = mailbox.Pop(); Check(popped != nullptr); popped->canceled.store(true);
    Refuses([&] { RequireInspectionFresh(popped->ticket, 3000, &popped->canceled); }, "inspection_canceled");
    mailbox.Close(); Check(pending->canceled.load() && !mailbox.Pop());
    AuthorizationVerifier ledger(pin, service, crypto);
    for (unsigned n = 1; n < RequestMailbox::kMaxNonces; ++n) { auto next = inspect; next.nonce = Nonce(n);
        auto consumed = ledger.VerifyExchange(enrollment_bytes, Signed(next, issuer), daemon, 3000); Check(consumed.Claims().nonce == next.nonce);
    }
    auto exhausted = inspect; exhausted.nonce = Nonce(999);
    Refuses([&] { ledger.VerifyExchange(enrollment_bytes, Signed(exhausted, issuer), daemon, 3000); }, "authorization_nonce_capacity");
    Refuses([&] { ledger.VerifyExchange(enrollment_bytes, Signed(exhausted, issuer), daemon, 3000); }, "authorization_closed");
    verifier.Close(); Refuses([&] { verifier.VerifyExchange(renewed_bytes, renewed_inspect_bytes, daemon, 67000); }, "authorization_closed");
}
}
int main() {
    try {
        Protocol(); HooksAndMailbox(); Authorization();
        const auto transport = RunOfflineTransportSmoke();
        std::cout << "{\"status\":\"passed\",\"checks\":" << checks + transport.checks <<
            ",\"protocolAuthorizationChecks\":" << checks << ",\"transportChecks\":" << transport.checks <<
            ",\"temporaryPipePairs\":" << transport.temporary_pipe_pairs << ",\"actualWin32IpcUnit\":true,\"productionPipeConnected\":false,\"productionListenerStarted\":false,"
            "\"offline\":true,\"hostLoaded\":false,"
            "\"syntheticHostFacts\":true,\"projectWrites\":0,\"exports\":0,\"productionReady\":false,"
            "\"authorizationContract\":\"issuer_signed_enrollment_inspect_v2\",\"genuineCngSignatures\":true,\"persistedIssuerProvisioned\":false,"
            "\"compiledIssuerPinned\":" << (ame_service::CompiledIssuerPin().key_id.empty() ? "false" : "true") << ',' <<
            "\"productionWorkerStarted\":false,\"graphOverflowRefused\":true,"
            "\"scope\":\"C++ protocol/auth/mailbox/RAII; genuine ephemeral CNG; synthetic host/graph; actual Win32 IPC/peer helpers on unique own test endpoints only; EntryPoint, Adobe suites/hooks and boot receipt helpers NOT executed\"}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cout << "{\"status\":\"failed\",\"checks\":" << checks << ",\"reason\":" << ame_service::Json(error.what()) << "}\n";
        return 1;
    }
}
