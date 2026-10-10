// Real Win32 safety checks; no Adobe host, plugin loading or project actions.
#include "probe_io.h"
#include "fixture_grant.h"
#include "fixture_program.h"
#include "probe_idle_dispatch.h"
#include <iostream>
#include <functional>
#include <winioctl.h>

namespace {
int passed = 0;
int adversarial_interleavings = 0, guard_refusals = 0;
int guard_fixture_dispatches = 0, guard_script_saves = 0, guard_native_saves = 0;
std::vector<std::string> checks;
std::map<std::string, DWORD> refusal_errors;
void Require(bool value, const char* test) { if (!value) throw probe::Failure(std::string("test_failed:") + test); ++passed; checks.emplace_back(test); }
void Reject(const char* name, const std::function<void()>& work) { bool rejected = false; try { work(); } catch (const probe::Failure&) { rejected = true; } Require(rejected, name); }
std::string SignedBody(const std::string& envelope, const std::string& key) {
    const std::string prefix = "{\"body\":\"";
    if (envelope.rfind(prefix, 0) != 0) throw probe::Failure("test_receipt_envelope_prefix");
    std::string body;
    for (size_t i = prefix.size(); i < envelope.size(); ++i) {
        char c = envelope[i];
        if (c == '"') {
            if (probe::SignedFixtureReceipt(body, key) != envelope) throw probe::Failure("test_receipt_mac_or_closed_envelope");
            return body;
        }
        if (c == '\\') {
            if (++i >= envelope.size() || (envelope[i] != '\\' && envelope[i] != '"')) throw probe::Failure("test_receipt_unexpected_escape");
            c = envelope[i];
        }
        body += c;
    }
    throw probe::Failure("test_receipt_unterminated_body");
}
void KernelRefusal(bool succeeded, const char* test) {
    const DWORD error = GetLastError(); refusal_errors[test] = error;
    // MoveFileEx reports ACCESS_DENIED for some protected replacement paths;
    // identity/byte readback additionally proves that no replacement occurred.
    Require(!succeeded && (error == ERROR_SHARING_VIOLATION || error == ERROR_ACCESS_DENIED), test);
}
probe::Handle ExternalRead(const std::wstring& path) {
    // Node/libuv's read sharing is compatible with the protected producer handle.
    probe::Handle h(CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    if (h.value == INVALID_HANDLE_VALUE) throw probe::Failure("external_read_open"); return h;
}
probe::FileIdentity FileId(const std::wstring& path) {
    auto h = ExternalRead(path); FILE_ID_INFO data{};
    if (!GetFileInformationByHandleEx(h.value, FileIdInfo, &data, sizeof(data))) throw probe::Failure("external_file_id");
    probe::FileIdentity out; out.volume = data.VolumeSerialNumber;
    std::copy(std::begin(data.FileId.Identifier), std::end(data.FileId.Identifier), out.file_id.begin()); return out;
}
std::string ExternalBytes(const std::wstring& path) {
    auto h = ExternalRead(path); char bytes[1024]; DWORD got = 0;
    if (!ReadFile(h.value, bytes, sizeof(bytes), &got, nullptr)) throw probe::Failure("external_read_bytes"); return std::string(bytes, got);
}
void ExternalWriteNew(const std::wstring& path, const std::string& bytes) {
    probe::Handle h(CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr));
    if (h.value == INVALID_HANDLE_VALUE) throw probe::Failure("outsider_create_new"); DWORD wrote = 0;
    if (!WriteFile(h.value, bytes.data(), static_cast<DWORD>(bytes.size()), &wrote, nullptr) || wrote != bytes.size() || !FlushFileBuffers(h.value)) throw probe::Failure("outsider_write_flush");
}
void GuardRefusal() {
    bool refused = false;
    try {
        probe::RequireProjectWriteContract();
        ++guard_fixture_dispatches; ++guard_script_saves; ++guard_native_saves;
    } catch (const probe::Failure& e) { refused = std::string(e.what()) == "destination_write_contract_unverified"; }
    Require(refused, "exact_unverified_destination_refusal"); ++guard_refusals;
    Require(guard_fixture_dispatches == 0 && guard_script_saves == 0 && guard_native_saves == 0, "guard_dispatch_zero");
}
void Junction(const std::wstring& link, const std::wstring& target) {
    Require(CreateDirectoryW(link.c_str(), nullptr) != 0, "junction_directory");
    probe::Handle h(CreateFileW(link.c_str(), GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    if (h.value == INVALID_HANDLE_VALUE) throw probe::Failure("junction_open");
    const std::wstring substitute = L"\\??\\" + target;
    struct Buffer { DWORD tag; WORD length, reserved, substitute_offset, substitute_length, print_offset, print_length; wchar_t paths[1024]; } data{};
    data.tag = IO_REPARSE_TAG_MOUNT_POINT;
    data.substitute_length = static_cast<WORD>(substitute.size() * 2);
    data.print_offset = static_cast<WORD>((substitute.size() + 1) * 2);
    data.print_length = static_cast<WORD>(target.size() * 2);
    std::copy(substitute.begin(), substitute.end(), data.paths);
    std::copy(target.begin(), target.end(), data.paths + substitute.size() + 1);
    data.length = static_cast<WORD>(8 + (substitute.size() + target.size() + 2) * 2);
    DWORD got = 0;
    Require(DeviceIoControl(h.value, FSCTL_SET_REPARSE_POINT, &data, data.length + 8, nullptr, 0, &got, nullptr) != 0, "real_junction_fixture");
}
}
int wmain(int argc, wchar_t** argv) {
    try {
        if (argc != 2) throw probe::Failure("only_owned_test_parent_argument");
        const auto parent = probe::Canonical(argv[1]);
        probe::Binding binding{std::string(32, 'a'), std::string(32, 'b'), std::string(64, 'c'), probe::Utf8(parent), 1234, 1770000000000ULL};
        const std::uint64_t now = 1770000001000ULL; const std::string expected(64, 'd');
        probe::Fields good{{"protocol","1"},{"nonce",binding.nonce},{"challenge",binding.challenge},{"pid","1234"},{"process_created_unix_ms",std::to_string(binding.process_created_ms)},{"plugin_sha256",binding.build_sha},{"root_path",binding.root_path},{"operation","snapshot"},{"expected_sha256",expected},{"fixture","saved-dirty"},{"restore_dirty","0"},{"request_id","request-123"},{"attempt_id","attempt-123"},{"expires_unix_ms",std::to_string(now+60000)}};
        auto validate = [&](const probe::Fields& f) { return probe::ValidateAck(f, binding, "snapshot", expected, now); };
        Require(validate(good).operation == "snapshot", "bound_ack");
        for (const auto& key : {"nonce", "challenge", "pid", "process_created_unix_ms", "plugin_sha256", "root_path", "operation", "expected_sha256"}) {
            auto bad = good; bad[key] += "x"; Reject(key, [&] { validate(bad); });
        }
        auto bad = good; bad["expires_unix_ms"] = std::to_string(now); Reject("expired", [&] { validate(bad); });
        bad = good; bad["expires_unix_ms"] = std::to_string(now + 300001); Reject("long_expiry", [&] { validate(bad); });
        bad = good; bad["script"] = "app.project.save(...)"; Reject("caller_jsx", [&] { validate(bad); });
        bad = good; bad["fixture"] = "user-project"; Reject("external_fixture", [&] { validate(bad); });
        bad = good; bad["request_id"] = ""; Reject("missing_provenance", [&] { validate(bad); });
        bad = good; bad["restore_dirty"] = "true"; Reject("invalid_dirty_flag", [&] { validate(bad); });
        Reject("duplicate_fields", [] { probe::ParseFields("nonce=a\nnonce=b\n"); });
        Reject("nul_injection", [] { probe::ParseFields(std::string("nonce=a\0b\n", 10)); });
        Reject("unterminated_manifest", [] { probe::ParseFields("nonce=a"); });
        Reject("overflow", [] { probe::Decimal("18446744073709551616"); });
        Reject("path_traversal", [&] { probe::Canonical(parent + L"\\..\\elsewhere"); });
        Reject("unc", [] { probe::Canonical(L"\\\\localhost\\c$\\probe"); });
        Require(probe::Sha256("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "real_sha256");
        Require(probe::Wide(probe::Utf8(L"Русский путь 🧪")) == L"Русский путь 🧪", "unicode_paths");
        // P1: insert ordinary file, hardlink or real junction AFTER an absence
        // precheck. The shared production guard refuses all three fixture kinds
        // before either AEP writer or the fixture mutation program can dispatch.
        for (const auto& fixture : {L"saved-clean", L"saved-dirty", L"untitled-dirty"}) {
            (void)fixture;
            for (const auto& name : {L"source.aep", L"snapshot.aep"}) {
                for (int insertion = 0; insertion < 3; ++insertion) {
                    const auto attack_nonce = probe::RandomToken();
                    const auto attack_path = parent + L"\\probe-" + probe::Wide(attack_nonce);
                    Require(CreateDirectoryW(attack_path.c_str(), nullptr) != 0, "destination_interleaving_root");
                    probe::OwnedRoot attacked(attack_path, attack_nonce);
                    const auto outsider_dir = parent + L"\\outsider-" + probe::Wide(attack_nonce);
                    Require(CreateDirectoryW(outsider_dir.c_str(), nullptr) != 0, "outsider_directory");
                    const auto outsider = outsider_dir + L"\\original.txt";
                    ExternalWriteNew(outsider, "outsider bytes must not change");
                    const auto outsider_id = FileId(outsider);
                    Require(!attacked.Exists(name), "destination_absence_precheck");
                    if (insertion == 0) ExternalWriteNew(attacked.Child(name), "inserted destination bytes");
                    else if (insertion == 1) Require(CreateHardLinkW(attacked.Child(name).c_str(), outsider.c_str(), nullptr) != 0, "postcheck_destination_hardlink");
                    else Junction(attacked.Child(name), outsider_dir);
                    ++adversarial_interleavings; GuardRefusal();
                    Require(ExternalBytes(outsider) == "outsider bytes must not change" && FileId(outsider) == outsider_id, "outsider_bytes_and_identity_unchanged");
                    if (insertion == 0) Require(ExternalBytes(attacked.Child(name)) == "inserted destination bytes", "inserted_destination_unchanged");
                    Require(!attacked.Exists(L"fixture.attempt.json") && !attacked.Exists(L"snapshot.attempt.json"), "no_fixture_or_save_attempt_dispatch");
                }
            }
        }
        const auto nonce = probe::RandomToken();
        const auto root_path = parent + L"\\probe-" + probe::Wide(nonce);
        Require(CreateDirectoryW(root_path.c_str(), nullptr) != 0, "exclusive_test_root");
        probe::OwnedRoot root(root_path, nonce);
        root.WriteNew(L"launch.manifest", "protocol=1\n"); root.Claim("offline owner\n");
        root.WriteNew(L"snapshot.attempt.json", "{\"reserved\":true}\n");
        Reject("attempt_replay", [&] { root.WriteNew(L"snapshot.attempt.json", "{}\n"); });
        Require(root.Read(L"snapshot.attempt.json") == "{\"reserved\":true}\n", "attempt_not_overwritten");
        Require(!root.Exists(L"snapshot.attempt.json.part"), "published_attempt_no_partial");
        root.WriteNew(L"blocked.json.part", "unknown interrupted writer");
        Reject("unknown_partial_not_replayed", [&] { root.WriteNew(L"blocked.json", "{}\n"); });
        Require(!root.Exists(L"blocked.json"), "unknown_partial_did_not_publish");
        Reject("child_traversal", [&] { root.Child(L"..\\snapshot.aep"); });
        ExternalWriteNew(root.Child(L"real.txt"), "fixture bytes");
        Require(CreateHardLinkW(root.Child(L"alias.txt").c_str(), root.Child(L"real.txt").c_str(), nullptr) != 0, "hardlink_fixture");
        Reject("hardlink_read", [&] { root.Read(L"alias.txt"); });
        Reject("root_reuse", [&] { probe::OwnedRoot again(root_path, nonce); again.Claim("repeat\n"); });
        const auto junction_nonce = probe::RandomToken();
        const auto junction_path = parent + L"\\probe-" + probe::Wide(junction_nonce);
        Junction(junction_path, root_path);
        Reject("actual_reparse_root", [&] { probe::OwnedRoot aliased(junction_path, junction_nonce); });
        Require(RemoveDirectoryW(junction_path.c_str()) != 0, "remove_only_owned_junction");
        // An owner cannot be deleted/renamed while the process holds its reservation.
        Require(DeleteFileW(root.Child(L"owner.lock").c_str()) == 0 && GetLastError() == ERROR_SHARING_VIOLATION, "owner_lock_durable_held");
        Require(MoveFileW(root_path.c_str(), (root_path + L"-moved").c_str()) == 0, "root_rename_refused");
        // P2: the exact protected producer is open before/after flush, across
        // same-handle rename and for every subsequent internal read/hash.
        probe::FileIdentity part_id;
        root.InterleavePublicationForTest([&](probe::PublicationStage stage, const std::wstring& part, const std::wstring&) {
            if (stage != probe::PublicationStage::AfterFlushBeforeRename) return;
            ++adversarial_interleavings; part_id = FileId(part);
            Require(ExternalBytes(part) == "protected receipt\n", "same_handle_flushed_bytes_observed");
            KernelRefusal(DeleteFileW(part.c_str()) != 0, "part_delete_after_flush_refused");
            KernelRefusal(MoveFileW(part.c_str(), (part + L".stolen").c_str()) != 0, "part_rename_after_flush_refused");
            const auto replacement = part + L".outsider"; ExternalWriteNew(replacement, "replacement bytes");
            KernelRefusal(MoveFileExW(replacement.c_str(), part.c_str(), MOVEFILE_REPLACE_EXISTING) != 0, "part_replace_after_flush_refused");
            probe::Handle write(CreateFileW(part.c_str(), GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
            KernelRefusal(write.value != INVALID_HANDLE_VALUE, "part_write_or_reparse_handle_refused");
            Require(FileId(part) == part_id && ExternalBytes(part) == "protected receipt\n", "part_original_identity_and_bytes_retained");
        });
        root.WriteNew(L"protected.json", "protected receipt\n");
        root.InterleavePublicationForTest({});
        Require(FileId(root.Child(L"protected.json")) == part_id && root.Read(L"protected.json") == "protected receipt\n", "published_same_identity_internal_read");
        Require(root.Hash(L"protected.json") == probe::Sha256("protected receipt\n"), "published_internal_hash_same_handle");
        Require(ExternalBytes(root.Child(L"protected.json")) == "protected receipt\n", "node_compatible_external_read_sharing");
        Require(DeleteFileW(root.Child(L"protected.json").c_str()) == 0 && GetLastError() == ERROR_SHARING_VIOLATION, "published_receipt_lifetime_delete_refused");
        // A formerly used SHARE_READ-only read handle cannot reopen this producer.
        Reject("old_read_share_incompatible", [&] { probe::LockReadFile(root.Child(L"protected.json")); });
        // Insert final target after precheck: same-handle no-replace rename must
        // fail, retain the original .part, and permanently refuse replay.
        probe::FileIdentity collision_part_id;
        root.InterleavePublicationForTest([&](probe::PublicationStage stage, const std::wstring& part, const std::wstring& final) {
            if (stage != probe::PublicationStage::AfterFlushBeforeRename) return;
            ++adversarial_interleavings; collision_part_id = FileId(part); ExternalWriteNew(final, "outsider target");
        });
        Reject("final_insert_after_flush_no_replace", [&] { root.WriteNew(L"collision.json", "original pending bytes"); });
        root.InterleavePublicationForTest({});
        Require(ExternalBytes(root.Child(L"collision.json")) == "outsider target", "collision_outsider_target_unchanged");
        Require(FileId(root.Child(L"collision.json.part")) == collision_part_id && root.Read(L"collision.json.part") == "original pending bytes", "failed_publication_original_part_held");
        Require(DeleteFileW(root.Child(L"collision.json.part").c_str()) == 0 && GetLastError() == ERROR_SHARING_VIOLATION, "failed_publication_part_lifetime_held");
        Require(DeleteFileW(root.Child(L"collision.json").c_str()) != 0, "remove_only_outsider_collision_target");
        Reject("failed_publication_terminal_replay", [&] { root.WriteNew(L"collision.json", "replay bytes"); });
        Require(!root.Exists(L"collision.json"), "terminal_replay_did_not_publish");
        // A .part inserted after precheck cannot be adopted or overwritten.
        root.InterleavePublicationForTest([&](probe::PublicationStage stage, const std::wstring& part, const std::wstring&) {
            if (stage != probe::PublicationStage::AfterPrecheck) return;
            ++adversarial_interleavings; ExternalWriteNew(part, "unknown outsider part");
        });
        Reject("part_insert_after_precheck_create_new", [&] { root.WriteNew(L"unknown.json", "producer bytes"); });
        root.InterleavePublicationForTest({});
        Require(ExternalBytes(root.Child(L"unknown.json.part")) == "unknown outsider part" && !root.Exists(L"unknown.json"), "unknown_part_untouched_no_publication");
        Require(DeleteFileW(root.Child(L"unknown.json.part").c_str()) != 0, "remove_only_unknown_outsider_part");
        Reject("unknown_part_terminal_replay", [&] { root.WriteNew(L"unknown.json", "replay bytes"); });
        // A producer inode that gains an external hardlink must fail its regular
        // single-link identity recheck; the original held file is still protected.
        probe::FileIdentity linked_part_id;
        root.InterleavePublicationForTest([&](probe::PublicationStage stage, const std::wstring& part, const std::wstring&) {
            if (stage != probe::PublicationStage::AfterFlushBeforeRename) return;
            ++adversarial_interleavings; linked_part_id = FileId(part);
            Require(CreateHardLinkW((part + L".alias").c_str(), part.c_str(), nullptr) != 0, "part_hardlink_interleaving");
        });
        Reject("part_gained_hardlink_refused", [&] { root.WriteNew(L"linked.json", "single producer bytes"); });
        root.InterleavePublicationForTest({});
        Require(FileId(root.Child(L"linked.json.part")) == linked_part_id && ExternalBytes(root.Child(L"linked.json.part")) == "single producer bytes", "hardlink_refusal_retained_original_identity_bytes");
        Require(!root.Exists(L"linked.json"), "hardlink_refusal_no_publication");
        const int legacy_checks = passed;
        if (legacy_checks != 215) throw probe::Failure("legacy_215_guard_cases_changed");
        const std::string key(64, '0'), stage(32, 'e');
        Require(probe::Hmac256(key, "native-fixture-v2") == "8ec3a95879a19162478dde827e38cba929853ea8ceb36d55d6a067e29316b311", "signed_js_cpp_hmac_vector");
        probe::Fields signed_good{{"protocol","2"},{"nonce",binding.nonce},{"challenge",binding.challenge},{"pid","1234"},
            {"process_created_unix_ms",std::to_string(binding.process_created_ms)},{"plugin_sha256",binding.build_sha},
            {"root_path",binding.root_path},{"operation","snapshot"},{"expected_sha256",expected},{"fixture","saved-dirty"},
            {"restore_dirty","0"},{"stage_id",stage},{"action_id","action-fixture"},{"revision","2"},
            {"payload_sha256",std::string(64,'f')},{"run_id","12345678-1234-1234-1234-123456789012"},
            {"checkpoint_sha256",std::string(64,'1')},{"contract_version","ae-agent.3.3.1"},{"expires_unix_ms",std::to_string(now+60000)}};
        auto seal = [&](probe::Fields f) { f["mac"] = probe::Hmac256(key, probe::CanonicalSignedFields(f)); return f; };
        auto signed_validate = [&](const probe::Fields& f) { return probe::ValidateFixtureGrant(f, binding, key, "snapshot", expected, stage, "saved-dirty", now); };
        signed_good = seal(signed_good);
        Require(signed_validate(signed_good).revision == 2, "signed_valid_bound_grant");
        Reject("unsigned_ack_cannot_authorize_v2", [&] { signed_validate(good); });
        for (const auto& entry : signed_good) {
            auto changed = signed_good; changed[entry.first] += "x";
            Reject(("signed_tamper_" + entry.first).c_str(), [&] { signed_validate(changed); });
        }
        for (const auto& name : {"nonce", "challenge", "pid", "process_created_unix_ms", "plugin_sha256", "root_path", "operation", "expected_sha256", "stage_id", "fixture"}) {
            auto changed = signed_good;
            changed[name] = (std::string(name) == "pid" || std::string(name) == "process_created_unix_ms") ? "999" : "other";
            changed = seal(changed);
            Reject(("signed_resigned_stale_" + std::string(name)).c_str(), [&] { signed_validate(changed); });
        }
        for (const auto& name : {"action_id", "revision", "payload_sha256", "run_id", "checkpoint_sha256", "contract_version"}) {
            auto changed = signed_good; changed[name] = "?"; changed = seal(changed);
            Reject(("signed_bad_provenance_" + std::string(name)).c_str(), [&] { signed_validate(changed); });
        }
        for (const auto expiry : {now, now + 300001}) {
            auto changed = signed_good; changed["expires_unix_ms"] = std::to_string(expiry); changed = seal(changed);
            Reject("signed_invalid_expiry", [&] { signed_validate(changed); });
        }
        auto extra = signed_good; extra["script"] = "caller jsx"; extra = seal(extra);
        Reject("signed_caller_script_schema", [&] { signed_validate(extra); });
        extra = signed_good; extra["output_path"] = "C:\\caller.aep"; extra = seal(extra);
        Reject("signed_caller_path_schema", [&] { signed_validate(extra); });
        for (const auto& kind : {"saved-clean", "saved-dirty", "untitled-dirty"}) for (const auto& op : {"create-fixture", "snapshot", "stage-variants"}) {
            auto f = signed_good; f["fixture"] = kind; f["operation"] = op; f = seal(f);
            auto g = probe::ValidateFixtureGrant(f, binding, key, op, expected, stage, kind, now);
            Require(g.fixture == kind && g.operation == op, "signed_fixed_fixture_phase");
            if (std::string(op) != "snapshot") {
                f["restore_dirty"] = "1"; f = seal(f);
                Reject("signed_dirty_only_snapshot", [&] { probe::ValidateFixtureGrant(f, binding, key, op, expected, stage, kind, now); });
            }
        }
        auto consumed = signed_validate(signed_good);
        probe::ConsumeFixtureGrant(root, consumed);
        Require(root.Read(L"signed-snapshot.consumed.json").find("consumed_before_dispatch") != std::string::npos, "signed_durable_consume_receipt");
        Reject("signed_consume_replay_terminal", [&] { probe::ConsumeFixtureGrant(root, consumed); });
        Require(DeleteFileW(root.Child(L"signed-snapshot.consumed.json").c_str()) == 0 && GetLastError() == ERROR_SHARING_VIOLATION, "signed_consumed_receipt_held");
        root.WriteFixtureAsset(L"fixture.bmp", fixture_program::Bitmap(false));
        Require(root.Hash(L"fixture.bmp") == probe::Sha256(fixture_program::Bitmap(false)), "signed_owned_bmp_hash");
        { probe::Handle imported(CreateFileW(root.Child(L"fixture.bmp").c_str(), GENERIC_READ, 0, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
          Require(imported.value != INVALID_HANDLE_VALUE, "signed_asset_writer_released_for_host_import"); }
        Reject("signed_asset_no_overwrite", [&] { root.WriteFixtureAsset(L"fixture.bmp", "overwrite"); });
        Reject("signed_asset_no_arbitrary_name", [&] { root.WriteFixtureAsset(L"caller.bmp", "caller"); });
        const int signed_checks = passed - legacy_checks;
        if (signed_checks != 65) throw probe::Failure("signed_65_guard_cases_changed");
        const int before_startup = passed;
        const auto startup_now = probe::NowMs();
        const std::string plugin_path = probe::Utf8(parent + L"\\owned-probe.aex"),
            executable_path = "C:\\Program Files\\Adobe\\AfterFX.exe", executable_sha(64, '2');
        auto launch_fields = [&](const probe::Binding& b) {
            return seal(probe::Fields{{"protocol", "2"}, {"nonce", b.nonce}, {"plugin_path", plugin_path},
                {"plugin_sha256", b.build_sha}, {"root_path", b.root_path}, {"stage_id", stage},
                {"role", "capture"}, {"fixture", "saved-dirty"}, {"executable_path", executable_path},
                {"executable_sha256", executable_sha}, {"source_root", b.root_path}, {"baseline_sha256", std::string(64, '0')},
                {"expires_unix_ms", std::to_string(startup_now - 1)}});
        };
        // Use the production trust/time gates and refusal writer against real
        // OwnedRoot handles. EntryPoint and Adobe suites/hooks are NOT executed.
        auto trust_launch = [&](const probe::Fields& f, const probe::Binding& b) {
            return probe::ValidateFixtureLaunch(f, b, key, plugin_path, executable_path, executable_sha);
        };
        const auto untrusted_nonce = probe::RandomToken();
        const auto untrusted_path = parent + L"\\probe-" + probe::Wide(untrusted_nonce);
        Require(CreateDirectoryW(untrusted_path.c_str(), nullptr) != 0, "startup_untrusted_test_root");
        probe::OwnedRoot untrusted_root(untrusted_path, untrusted_nonce);
        auto untrusted_binding = binding; untrusted_binding.nonce = untrusted_nonce; untrusted_binding.root_path = probe::Utf8(untrusted_path);
        const auto untrusted_launch = launch_fields(untrusted_binding);
        int untrusted_trust_returns = 0;
        auto refuse_untrusted = [&](const probe::Fields& f) {
            // A failed trust gate must not advance to Claim or refusal publication.
            auto verified = trust_launch(f, untrusted_binding);
            ++untrusted_trust_returns;
            untrusted_root.Claim("unexpected owner\n");
            probe::WriteFixtureStartupRefusal(untrusted_root, untrusted_binding, verified, key, "offline-build", "unexpected", false);
        };
        for (const auto& entry : untrusted_launch) {
            auto forged = untrusted_launch; forged[entry.first] += "x";
            Reject(("startup_forged_" + entry.first).c_str(), [&] { refuse_untrusted(forged); });
            Require(untrusted_trust_returns == 0 && !untrusted_root.Exists(L"owner.lock") && !untrusted_root.Exists(L"signed-refusal.json") &&
                !untrusted_root.Exists(L"signed-refusal.json.part"), "startup_untrusted_no_claim_or_refusal");
        }
        for (const auto& name : {"protocol", "nonce", "plugin_path", "plugin_sha256", "root_path", "executable_path", "executable_sha256",
            "stage_id", "role", "fixture", "source_root", "baseline_sha256", "expires_unix_ms"}) {
            auto malformed = untrusted_launch; malformed[name] = "invalid"; malformed = seal(malformed);
            Reject(("startup_resigned_invalid_" + std::string(name)).c_str(), [&] { refuse_untrusted(malformed); });
            Require(untrusted_trust_returns == 0 && !untrusted_root.Exists(L"owner.lock") && !untrusted_root.Exists(L"signed-refusal.json") &&
                !untrusted_root.Exists(L"signed-refusal.json.part"), "startup_invalid_descriptor_no_claim_or_refusal");
        }
        auto launch_extra = untrusted_launch; launch_extra["script"] = "caller jsx"; launch_extra = seal(launch_extra);
        Reject("startup_caller_jsx_schema", [&] { refuse_untrusted(launch_extra); });
        Require(untrusted_trust_returns == 0 && !untrusted_root.Exists(L"owner.lock") && !untrusted_root.Exists(L"signed-refusal.json"), "startup_unknown_field_no_claim_or_refusal");
        // Boundary checks retain the existing five-minute ceiling, with no
        // deadline/TTL extension after authenticating a delayed host startup.
        auto boundary = trust_launch(untrusted_launch, untrusted_binding);
        Require(boundary.expires_ms == startup_now - 1, "startup_expired_descriptor_trusted_for_control_only");
        for (const auto expiry : {startup_now - 1, startup_now, startup_now + 300001}) {
            boundary.expires_ms = expiry;
            Reject("startup_expiry_host_authorization_closed", [&] { probe::RequireFixtureLaunchFresh(boundary, startup_now); });
        }
        boundary.expires_ms = startup_now + 300000; probe::RequireFixtureLaunchFresh(boundary, startup_now);
        Require(boundary.expires_ms == startup_now + 300000, "startup_exact_ttl_ceiling_unchanged");
        for (const auto& kind : {"saved-clean", "saved-dirty", "untitled-dirty"}) {
            auto f = untrusted_launch; f["fixture"] = kind; f = seal(f);
            Require(trust_launch(f, untrusted_binding).fixture == kind, "startup_closed_fixture_kinds");
        }
        Reject("startup_invalid_session_key_no_trust", [&] {
            probe::ValidateFixtureLaunch(untrusted_launch, untrusted_binding, "invalid", plugin_path, executable_path, executable_sha);
        });
        Reject("startup_unclaimed_control_refusal_forbidden", [&] {
            probe::WriteFixtureExpiredLaunchRefusal(untrusted_root, untrusted_binding,
                trust_launch(untrusted_launch, untrusted_binding), key, executable_sha, expected, startup_now);
        });
        Require(!untrusted_root.Exists(L"owner.lock") && !untrusted_root.Exists(L"signed-refusal.json") &&
            !untrusted_root.Exists(L"signed-bootstrap-refusal.json") && !untrusted_root.Exists(L"signed-bootstrap-refusal.json.part"),
            "startup_unclaimed_and_untrusted_no_output_files");
        int startup_refusals = 0, startup_host_authorizations = 0;
        for (int scenario = 0; scenario < 3; ++scenario) {
            const auto boot_nonce = probe::RandomToken();
            const auto boot_path = parent + L"\\probe-" + probe::Wide(boot_nonce);
            Require(CreateDirectoryW(boot_path.c_str(), nullptr) != 0, "startup_trusted_test_root");
            probe::OwnedRoot boot_root(boot_path, boot_nonce);
            auto child = binding; child.nonce = boot_nonce; child.root_path = probe::Utf8(boot_path);
            child.challenge = probe::RandomToken(); child.pid = GetCurrentProcessId();
            FILETIME created{}, exited{}, kernel{}, user{};
            Require(GetProcessTimes(GetCurrentProcess(), &created, &exited, &kernel, &user) != 0, "startup_exact_child_birth_read");
            ULARGE_INTEGER birth; birth.LowPart = created.dwLowDateTime; birth.HighPart = created.dwHighDateTime;
            child.process_created_ms = birth.QuadPart / 10000 - 11644473600000ULL;
            auto f = launch_fields(child);
            if (scenario == 1) { // Valid stage descriptor, absent source: expiry must win before source access.
                f["role"] = "stage"; f["source_root"] = probe::Utf8(parent + L"\\probe-" + probe::Wide(probe::RandomToken()));
                const std::string stage_bytes = "offline exact owned baseline identity";
                ExternalWriteNew(boot_root.Child(L"baseline.aep"), stage_bytes);
                f["baseline_sha256"] = probe::Sha256(stage_bytes); f = seal(f);
            }
            if (scenario == 2) { f["expires_unix_ms"] = std::to_string(startup_now + 60000); f = seal(f); }
            auto manifest_bytes = probe::CanonicalSignedFields(f) + "mac=" + f.at("mac") + "\n";
            if (scenario == 0) {
                std::string crlf; for (char c : manifest_bytes) { if (c == '\n') crlf += '\r'; crlf += c; }
                manifest_bytes = crlf;
            }
            boot_root.WriteNew(L"launch.manifest", manifest_bytes);
            bool owned = false, refused = false, reached_source_or_suites = false;
            probe::FixtureLaunch verified;
            const std::string expected_reason = scenario == 2 ? "suite_unavailable_no_fallback" : "signed_launch_expired";
            try {
                verified = trust_launch(probe::ParseFields(boot_root.Read(L"launch.manifest")), child);
                if (verified.role == "stage") boot_root.ClaimStage("offline exact child owner\n", verified.baseline_sha);
                else boot_root.Claim("offline exact child owner\n");
                owned = true;
                probe::RequireFixtureLaunchFresh(verified, startup_now);
                // Inject a pre-hook suite failure without acquiring Adobe suites.
                if (scenario == 2) throw probe::Failure("suite_unavailable_no_fallback");
                reached_source_or_suites = true; ++startup_host_authorizations;
            } catch (const probe::Failure& e) {
                Require(owned && std::string(e.what()) == expected_reason, "startup_trusted_failure_exact_reason_after_claim");
                if (scenario == 0) {
                    auto incomplete = child; incomplete.challenge.clear();
                    Reject("startup_refusal_requires_exact_challenge_before_write", [&] {
                        probe::WriteFixtureExpiredLaunchRefusal(boot_root, incomplete, verified, key, executable_sha,
                            probe::Sha256(manifest_bytes), startup_now);
                    });
                    Require(!boot_root.Exists(L"signed-bootstrap-refusal.json") && !boot_root.Exists(L"signed-bootstrap-refusal.json.part"),
                        "startup_incomplete_binding_no_refusal_file");
                }
                if (scenario == 2) probe::WriteFixtureStartupRefusal(boot_root, child, verified, key, "offline-build", e.what(), false);
                else probe::WriteFixtureExpiredLaunchRefusal(boot_root, child, verified, key, executable_sha,
                    probe::Sha256(boot_root.Read(L"launch.manifest")), startup_now);
                refused = true; ++startup_refusals;
            }
            Require(refused && !reached_source_or_suites, "startup_refusal_before_source_or_suites_or_hooks");
            const wchar_t* receipt_name = scenario == 2 ? L"signed-refusal.json" : L"signed-bootstrap-refusal.json";
            const auto bytes = boot_root.Read(receipt_name), body = SignedBody(bytes, key);
            Require(body.find("\"reason\":" + probe::Json(expected_reason)) != std::string::npos, "startup_signed_reason_and_mac_published");
            Require(body.find("\"challenge\":" + probe::Json(child.challenge)) != std::string::npos &&
                body.find("\"pid\":" + std::to_string(child.pid)) != std::string::npos &&
                body.find("\"processCreatedUnixMs\":" + std::to_string(child.process_created_ms)) != std::string::npos, "startup_refusal_exact_child_identity");
            Require(body.find("\"rootPath\":" + probe::Json(child.root_path)) != std::string::npos &&
                body.find("\"pluginSha256\":" + probe::Json(child.build_sha)) != std::string::npos, "startup_refusal_root_and_module_binding");
            Require(body.find("\"nativeSaveDispatches\":0") != std::string::npos && body.find("\"fixtureMutationDispatches\":0") != std::string::npos &&
                body.find("\"replayAllowed\":false") != std::string::npos && (scenario != 2 ||
                (body.find("\"projectApiReadDispatches\":0") != std::string::npos && body.find("\"projectMutationDispatchCount\":0") != std::string::npos &&
                body.find("\"phaseDispatchCount\":0") != std::string::npos && body.find("\"saveCalled\":false") != std::string::npos &&
                body.find("\"idleHookRegistrationAttempted\":false") != std::string::npos)),
                "startup_refusal_zero_project_save_phase_and_no_replay");
            if (scenario != 2) Require(body.find("\"suitesAcquired\":false") != std::string::npos &&
                body.find("\"executableSha256\":" + probe::Json(executable_sha)) != std::string::npos &&
                body.find("\"manifestSha256\":" + probe::Json(probe::Sha256(boot_root.Read(L"launch.manifest")))) != std::string::npos &&
                body.find("\"expiresUnixMs\":" + std::to_string(verified.expires_ms)) != std::string::npos &&
                body.find("\"refusedAtUnixMs\":" + std::to_string(startup_now)) != std::string::npos &&
                !boot_root.Exists(L"signed-refusal.json"), "startup_expired_only_historical_closed_channel");
            if (scenario == 0) Require(probe::Sha256(manifest_bytes) != probe::Sha256(probe::CanonicalSignedFields(f) + "mac=" + f.at("mac") + "\n"),
                "startup_manifest_sha_uses_exact_crlf_read_bytes");
            if (scenario == 2) {
                Reject("startup_fresh_launch_cannot_publish_expired_channel", [&] {
                    probe::WriteFixtureExpiredLaunchRefusal(boot_root, child, verified, key, executable_sha, probe::Sha256(manifest_bytes), startup_now);
                });
                Require(!boot_root.Exists(L"signed-bootstrap-refusal.json") && !boot_root.Exists(L"signed-bootstrap-refusal.json.part"),
                    "startup_fresh_launch_no_historical_channel");
            }
            Require(body.find(key) == std::string::npos, "startup_refusal_key_not_serialized");
            Require(DeleteFileW(boot_root.Child(receipt_name).c_str()) == 0 && GetLastError() == ERROR_SHARING_VIOLATION,
                "startup_refusal_producer_handle_held");
            Require(DeleteFileW(boot_root.Child(L"owner.lock").c_str()) == 0 && GetLastError() == ERROR_SHARING_VIOLATION, "startup_claim_handle_held");
            Reject("startup_refusal_terminal_no_republication", [&] {
                if (scenario == 2) probe::WriteFixtureStartupRefusal(boot_root, child, verified, key, "offline-build", "retry", false);
                else probe::WriteFixtureExpiredLaunchRefusal(boot_root, child, verified, key, executable_sha,
                    probe::Sha256(boot_root.Read(L"launch.manifest")), startup_now);
            });
            Require(boot_root.Read(receipt_name) == bytes, "startup_refusal_bytes_unchanged_after_replay");
        }
        Require(startup_refusals == 3 && startup_host_authorizations == 0, "startup_harness_all_refusals_before_host_authorization");
        const int startup_checks = passed - before_startup;
        const int before_root_contract = passed;
        const std::string stage_baseline = "fixed offline stage baseline", stage_baseline_sha = probe::Sha256(stage_baseline);
        // The controller's server metadata belongs outside the native root.
        // No caller-defined allowlist can expand the closed Claim contracts.
        for (const auto& extra_name : {L"baseline.aep", L"server-owner.json", L"server-launch-attempt.json", L"unexpected.json"}) {
            const auto token = probe::RandomToken();
            const auto candidate_path = parent + L"\\probe-" + probe::Wide(token);
            Require(CreateDirectoryW(candidate_path.c_str(), nullptr) != 0, "claim_contract_capture_test_root");
            probe::OwnedRoot candidate(candidate_path, token);
            ExternalWriteNew(candidate.Child(L"launch.manifest"), "protocol=1\n");
            ExternalWriteNew(candidate.Child(extra_name), stage_baseline);
            Reject("claim_capture_or_legacy_rejects_every_extra_file", [&] { candidate.Claim("unexpected owner\n"); });
            Require(!candidate.Exists(L"owner.lock"), "claim_capture_extra_file_no_owner");
        }
        for (const auto& extra_name : {L"server-owner.json", L"server-launch-attempt.json", L"unexpected.json"}) {
            const auto token = probe::RandomToken();
            const auto candidate_path = parent + L"\\probe-" + probe::Wide(token);
            Require(CreateDirectoryW(candidate_path.c_str(), nullptr) != 0, "claim_contract_stage_test_root");
            probe::OwnedRoot candidate(candidate_path, token);
            ExternalWriteNew(candidate.Child(L"launch.manifest"), "protocol=2\n");
            ExternalWriteNew(candidate.Child(L"baseline.aep"), stage_baseline);
            ExternalWriteNew(candidate.Child(extra_name), "server or unrelated metadata");
            Reject("claim_stage_rejects_every_extra_file", [&] { candidate.ClaimStage("unexpected owner\n", stage_baseline_sha); });
            Require(!candidate.Exists(L"owner.lock"), "claim_stage_extra_file_no_owner");
        }
        for (int altered = 0; altered < 3; ++altered) {
            const auto token = probe::RandomToken();
            const auto candidate_path = parent + L"\\probe-" + probe::Wide(token);
            Require(CreateDirectoryW(candidate_path.c_str(), nullptr) != 0, "claim_contract_changed_stage_root");
            probe::OwnedRoot candidate(candidate_path, token);
            ExternalWriteNew(candidate.Child(L"launch.manifest"), "protocol=2\n");
            if (altered == 1) ExternalWriteNew(candidate.Child(L"baseline.aep"), "changed baseline after server descriptor hash");
            if (altered == 2) {
                const auto outsider = parent + L"\\baseline-outsider-" + probe::Wide(token);
                ExternalWriteNew(outsider, stage_baseline);
                Require(CreateHardLinkW(candidate.Child(L"baseline.aep").c_str(), outsider.c_str(), nullptr) != 0, "claim_stage_hardlink_fixture");
            }
            Reject("claim_stage_missing_changed_or_linked_baseline_before_owner", [&] { candidate.ClaimStage("unexpected owner\n", stage_baseline_sha); });
            Require(!candidate.Exists(L"owner.lock"), "claim_stage_invalid_baseline_no_owner");
        }
        const auto stage_token = probe::RandomToken();
        const auto stage_path = parent + L"\\probe-" + probe::Wide(stage_token);
        Require(CreateDirectoryW(stage_path.c_str(), nullptr) != 0, "claim_contract_exact_stage_root");
        probe::OwnedRoot stage_root(stage_path, stage_token);
        ExternalWriteNew(stage_root.Child(L"launch.manifest"), "protocol=2\n");
        ExternalWriteNew(stage_root.Child(L"baseline.aep"), stage_baseline);
        const auto stage_baseline_id = FileId(stage_root.Child(L"baseline.aep"));
        stage_root.ClaimStage("offline exact stage owner\n", stage_baseline_sha);
        Require(stage_root.Exists(L"owner.lock") && stage_root.Hash(L"baseline.aep") == stage_baseline_sha &&
            FileId(stage_root.Child(L"baseline.aep")) == stage_baseline_id, "claim_stage_exact_two_files_same_pinned_baseline");
        KernelRefusal(DeleteFileW(stage_root.Child(L"baseline.aep").c_str()) != 0, "claim_stage_pinned_baseline_delete_refused");
        probe::Handle baseline_overwrite(CreateFileW(stage_root.Child(L"baseline.aep").c_str(), GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
        KernelRefusal(baseline_overwrite.value != INVALID_HANDLE_VALUE, "claim_stage_pinned_baseline_write_refused");
        Require(stage_root.Hash(L"baseline.aep") == stage_baseline_sha && FileId(stage_root.Child(L"baseline.aep")) == stage_baseline_id,
            "claim_stage_baseline_identity_bytes_unchanged");
        Require(CreateHardLinkW((stage_path + L"\\baseline-alias.aep").c_str(), stage_root.Child(L"baseline.aep").c_str(), nullptr) != 0,
            "claim_stage_postclaim_hardlink_fixture");
        Reject("claim_stage_postclaim_baseline_identity_recheck", [&] { stage_root.Hash(L"baseline.aep"); });
        Require(DeleteFileW(stage_root.Child(L"owner.lock").c_str()) == 0 && GetLastError() == ERROR_SHARING_VIOLATION,
            "claim_stage_owner_handle_still_held_after_baseline_refusal");
        const int root_contract_checks = passed - before_root_contract;
        const int before_idle_dispatch = passed;
        auto idle_fields = signed_good; idle_fields["operation"] = "stage-variants"; idle_fields["restore_dirty"] = "0";
        idle_fields = seal(idle_fields);
        const auto idle_grant = probe::ValidateFixtureGrant(idle_fields, binding, key, "stage-variants", expected, stage, "saved-dirty", now);
        // Exercise the production gate with real durable consume/publication.
        // OpenProjectFromPath is a callback double that pumps idle before return;
        // no Adobe suite, idle hook, AEP opening or host mutation runs here.
        for (int failure_mode = 0; failure_mode < 4; ++failure_mode) {
            const auto token = probe::RandomToken();
            const auto candidate_path = parent + L"\\probe-" + probe::Wide(token);
            Require(CreateDirectoryW(candidate_path.c_str(), nullptr) != 0, "idle_dispatch_owned_stage_root");
            probe::OwnedRoot candidate(candidate_path, token);
            ExternalWriteNew(candidate.Child(L"launch.manifest"), "protocol=2\n");
            ExternalWriteNew(candidate.Child(L"baseline.aep"), stage_baseline);
            candidate.ClaimStage("offline idle stage owner\n", stage_baseline_sha);
            probe::IdleDispatchGate gate;
            int preflights = 0, consumes = 0, opens = 0, outputs = 0, refusals = 0, deferred = 0, publication_callbacks = 0;
            bool terminal = false, refusal_publication_failed = false;
            std::string first_reason;
            std::function<void()> idle;
            const auto OpenProjectFromPath = [&] {
                ++opens;
                Require(ExternalBytes(candidate.Child(L"baseline.aep")) == stage_baseline, "idle_dispatch_pinned_baseline_readable_offline");
                idle(); // deterministic host message-pump reentry
                if (failure_mode == 1) throw probe::Failure("OpenOwnedStageBaseline:17");
                if (failure_mode == 2) throw 17;
            };
            idle = [&] {
                const bool entered = gate.Run([&] {
                    if (terminal) return;
                    ++preflights; ++consumes;
                    probe::ConsumeFixtureGrant(candidate, idle_grant);
                    auto baseline_pin = probe::LockReadFile(candidate.Child(L"baseline.aep"));
                    OpenProjectFromPath();
                    ++outputs;
                    candidate.WriteNew(L"signed-variants.json", probe::SignedFixtureReceipt("{\"status\":\"offline_callback_completed\"}", key));
                    terminal = true;
                }, [&](const char* reason) noexcept {
                    ++refusals; terminal = true;
                    try {
                        first_reason = reason;
                        candidate.WriteNew(L"signed-refusal.json", probe::SignedFixtureReceipt("{\"status\":\"refused_or_unknown\",\"reason\":" + probe::Json(reason) + ",\"replayAllowed\":false}", key));
                    } catch (...) { refusal_publication_failed = true; }
                });
                if (!entered) ++deferred;
            };
            candidate.InterleavePublicationForTest([&](probe::PublicationStage publication, const std::wstring&, const std::wstring& final) {
                if (publication != probe::PublicationStage::AfterFlushBeforeRename) return;
                ++publication_callbacks; idle();
                if (failure_mode == 3 && final == candidate.Child(L"signed-variants.json")) ExternalWriteNew(final, "untouched competing receipt");
            });
            idle();
            candidate.InterleavePublicationForTest({});
            Require(preflights == 1 && consumes == 1 && opens == 1, "idle_dispatch_nested_before_preflight_consume_or_open");
            Require(deferred == (failure_mode == 3 ? 4 : 3) && publication_callbacks == (failure_mode == 3 ? 3 : 2), "idle_dispatch_open_and_receipt_callbacks_deferred");
            Require(candidate.Read(L"signed-stage-variants.consumed.json").find("consumed_before_dispatch") != std::string::npos &&
                !candidate.Exists(L"signed-stage-variants.consumed.json.part"), "idle_dispatch_consume_receipt_single_publication");
            Require(terminal && !refusal_publication_failed && refusals == (failure_mode == 0 ? 0 : 1) &&
                outputs == (failure_mode == 1 || failure_mode == 2 ? 0 : 1), "idle_dispatch_one_terminal_outcome");
            if (failure_mode == 0) {
                Require(!candidate.Exists(L"signed-refusal.json") && candidate.Exists(L"signed-variants.json"), "idle_dispatch_success_no_false_replay_refusal");
            } else {
                Require(failure_mode == 1 ? first_reason == "OpenOwnedStageBaseline:17" : failure_mode == 2 ?
                    first_reason == "unknown_native_exception" : first_reason.rfind("receipt_absolute_only_publish_no_replace_no_replay:win32=", 0) == 0,
                    "idle_dispatch_original_open_or_publication_cause_retained");
                const auto refusal = SignedBody(candidate.Read(L"signed-refusal.json"), key);
                Require(refusal.find(probe::Json(first_reason)) != std::string::npos && refusal.find("receipt_attempt_terminal_no_replay") == std::string::npos,
                    "idle_dispatch_signed_first_reason_not_nested_consume");
            }
            if (failure_mode == 3) Require(ExternalBytes(candidate.Child(L"signed-variants.json")) == "untouched competing receipt" &&
                candidate.Exists(L"signed-variants.json.part"), "idle_dispatch_failed_publication_preserves_outsider_and_part");
            idle(); // gate resets after success/exception, while Terminal prevents replay
            Require(deferred == (failure_mode == 3 ? 4 : 3) && preflights == 1 && consumes == 1 && opens == 1 &&
                refusals == (failure_mode == 0 ? 0 : 1), "idle_dispatch_raii_reset_terminal_tick_no_replay");
            Require(candidate.Hash(L"baseline.aep") == stage_baseline_sha, "idle_dispatch_claimed_baseline_unchanged");
        }
        const int idle_dispatch_checks = passed - before_idle_dispatch;
        std::cout << "{\"offline\":true,\"hostLoaded\":false,\"legacyProtocolChecks\":" << legacy_checks << ",\"signedFixtureChecks\":" << signed_checks
            << ",\"startupDiagnosticsChecks\":" << startup_checks << ",\"nativeRootContractChecks\":" << root_contract_checks
            << ",\"idleDispatchChecks\":" << idle_dispatch_checks << ",\"idleHarnessScope\":\"production C++ gate with callback-double OpenProjectFromPath and real receipt publication; Adobe suites/hooks not executed\""
            << ",\"startupHarnessScope\":\"shared C++ trust/time gates and signed refusal publication; EntryPoint/Adobe suites/hooks not executed\",\"startupHarnessRefusals\":" << startup_refusals
            << ",\"startupHarnessHostAuthorizations\":" << startup_host_authorizations << ",\"passed\":" << passed << ",\"status\":\"passed\",\"adversarialInterleavings\":" << adversarial_interleavings << ",\"destinationGuardRefusals\":" << guard_refusals << ",\"guardHarnessFixtureDispatches\":" << guard_fixture_dispatches << ",\"guardHarnessExtendScriptSaves\":" << guard_script_saves << ",\"guardHarnessNativeSaves\":" << guard_native_saves << ",\"destinationWriteContract\":\"destination_write_contract_unverified\",\"liveSemantics\":\"UNVERIFIED\",\"checks\":[";
        for (size_t i = 0; i < checks.size(); ++i) { if (i) std::cout << ','; std::cout << probe::Json(checks[i]); }
        std::cout << "],\"controlReceiptPublication\":\"same-held-handle FileRenameInfo absolute-only no-replace\",\"rootMetadataIsolation\":\"UNVERIFIED\",\"win32RefusalErrors\":{";
        size_t error_index = 0;
        for (const auto& error : refusal_errors) { if (error_index++) std::cout << ','; std::cout << probe::Json(error.first) << ':' << error.second; }
        std::cout << "}}\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "{\"offline\":true,\"hostLoaded\":false,\"status\":\"failed\",\"passed\":" << passed
            << ",\"lastCompleted\":" << probe::Json(checks.empty() ? "none" : checks.back()) << ",\"reason\":" << probe::Json(e.what())
            << ",\"adversarialInterleavings\":" << adversarial_interleavings << ",\"destinationGuardRefusals\":" << guard_refusals
            << ",\"guardHarnessFixtureDispatches\":" << guard_fixture_dispatches << ",\"guardHarnessExtendScriptSaves\":" << guard_script_saves
            << ",\"guardHarnessNativeSaves\":" << guard_native_saves << ",\"destinationWriteContract\":\"destination_write_contract_unverified\",\"liveSemantics\":\"UNVERIFIED\"}\n";
        return 1;
    }
}
