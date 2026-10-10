// Real Win32 safety checks; no Adobe host, plugin loading or project actions.
#include "probe_io.h"
#include "fixture_grant.h"
#include "fixture_program.h"
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
        std::cout << "{\"offline\":true,\"hostLoaded\":false,\"legacyProtocolChecks\":" << legacy_checks << ",\"signedFixtureChecks\":" << passed - legacy_checks << ",\"passed\":" << passed << ",\"status\":\"passed\",\"adversarialInterleavings\":" << adversarial_interleavings << ",\"destinationGuardRefusals\":" << guard_refusals << ",\"guardHarnessFixtureDispatches\":" << guard_fixture_dispatches << ",\"guardHarnessExtendScriptSaves\":" << guard_script_saves << ",\"guardHarnessNativeSaves\":" << guard_native_saves << ",\"destinationWriteContract\":\"destination_write_contract_unverified\",\"liveSemantics\":\"UNVERIFIED\",\"checks\":[";
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
