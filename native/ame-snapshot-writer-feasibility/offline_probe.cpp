// ONE offline AppContainer/DACL candidate. No AE/AME/UI, services or fallback.
#include "win32_probe.h"
#include "feasibility_identity.h" // generated only in the fresh ignored run
#include <aclapi.h>
#include <userenv.h>
#include <iostream>
#include <map>
#include <memory>

namespace {
using namespace feasibility;
std::string Luid(const LUID& value) { return std::to_string(static_cast<std::uint32_t>(value.HighPart)) + ":" + std::to_string(value.LowPart); }
std::vector<unsigned char> Information(HANDLE token, TOKEN_INFORMATION_CLASS type) {
    DWORD size = 0; SetLastError(ERROR_SUCCESS);
    const bool unexpected = GetTokenInformation(token, type, nullptr, 0, &size) != FALSE;
    const DWORD sizing_error = GetLastError();
    if (!unexpected && sizing_error != ERROR_INSUFFICIENT_BUFFER) throw Failure("token_information_size:class=" + std::to_string(type), sizing_error);
    Invariant(!unexpected && size > 0 && size <= 1048576, "token_information_size_invalid");
    std::vector<unsigned char> bytes(size);
    if (!GetTokenInformation(token, type, bytes.data(), size, &size)) throw Failure("token_information:class=" + std::to_string(type), GetLastError()); return bytes;
}
template<typename T> T Scalar(HANDLE token, TOKEN_INFORMATION_CLASS type) {
    T value{}; DWORD returned = 0;
    // Fixed-size classes (notably TokenElevation) require their exact buffer;
    // a NULL/zero sizing call can return ERROR_BAD_LENGTH rather than 122.
    if (!GetTokenInformation(token, type, &value, sizeof(value), &returned)) throw Failure("token_fixed_information:class=" + std::to_string(type), GetLastError());
    Invariant(returned == sizeof(value), "token_fixed_information_size"); return value;
}
std::string Groups(HANDLE token, TOKEN_INFORMATION_CLASS type) {
    const auto bytes = Information(token, type); const auto groups = reinterpret_cast<const TOKEN_GROUPS*>(bytes.data());
    std::vector<std::string> values;
    for (DWORD i = 0; i < groups->GroupCount; ++i) values.push_back(Sid(groups->Groups[i].Sid) + ":" + std::to_string(groups->Groups[i].Attributes));
    std::sort(values.begin(), values.end()); std::string result = "[";
    for (const auto& value : values) { if (result.size() > 1) result += ','; result += Json(value); } return result + ']';
}
struct TokenState {
    bool app_container = false;
    std::string package, user, group, authentication, token_id, integrity, privileges, groups, restricted, capabilities;
    DWORD token_type = 0, impersonation_level = 0, elevated = 0;
    std::string JsonValue() const {
        return "{\"isAppContainer\":" + Bool(app_container) + ",\"packageSid\":" + Json(package) + ",\"userSid\":" + Json(user) +
            ",\"primaryGroupSid\":" + Json(group) + ",\"authenticationId\":" + Json(authentication) + ",\"tokenId\":" + Json(token_id) +
            ",\"integritySid\":" + Json(integrity) + ",\"privileges\":" + privileges + ",\"groups\":" + groups +
            ",\"restrictedSids\":" + restricted + ",\"capabilities\":" + capabilities + ",\"tokenType\":" + std::to_string(token_type) +
            ",\"impersonationLevel\":" + std::to_string(impersonation_level) + ",\"elevated\":" + std::to_string(elevated) + "}";
    }
    bool PreservedBy(const TokenState& other) const {
        return app_container == other.app_container && package == other.package && user == other.user && group == other.group &&
            authentication == other.authentication && integrity == other.integrity && privileges == other.privileges && groups == other.groups &&
            restricted == other.restricted && capabilities == other.capabilities && elevated == other.elevated;
    }
};
TokenState InspectToken(HANDLE token) {
    TokenState state; state.app_container = Scalar<DWORD>(token, TokenIsAppContainer) != 0;
    if (state.app_container) { const auto bytes = Information(token, TokenAppContainerSid); state.package = Sid(reinterpret_cast<const TOKEN_APPCONTAINER_INFORMATION*>(bytes.data())->TokenAppContainer); }
    { const auto bytes = Information(token, TokenUser); state.user = Sid(reinterpret_cast<const TOKEN_USER*>(bytes.data())->User.Sid); }
    { const auto bytes = Information(token, TokenPrimaryGroup); state.group = Sid(reinterpret_cast<const TOKEN_PRIMARY_GROUP*>(bytes.data())->PrimaryGroup); }
    { const auto bytes = Information(token, TokenIntegrityLevel); state.integrity = Sid(reinterpret_cast<const TOKEN_MANDATORY_LABEL*>(bytes.data())->Label.Sid); }
    const auto statistics = Scalar<TOKEN_STATISTICS>(token, TokenStatistics);
    state.authentication = Luid(statistics.AuthenticationId); state.token_id = Luid(statistics.TokenId);
    state.token_type = static_cast<DWORD>(statistics.TokenType);
    if (statistics.TokenType == TokenImpersonation) state.impersonation_level = static_cast<DWORD>(Scalar<SECURITY_IMPERSONATION_LEVEL>(token, TokenImpersonationLevel));
    state.elevated = Scalar<TOKEN_ELEVATION>(token, TokenElevation).TokenIsElevated;
    { const auto bytes = Information(token, TokenPrivileges); const auto privileges = reinterpret_cast<const TOKEN_PRIVILEGES*>(bytes.data());
        std::vector<std::string> values;
        for (DWORD i = 0; i < privileges->PrivilegeCount; ++i) values.push_back(Luid(privileges->Privileges[i].Luid) + ":" + std::to_string(privileges->Privileges[i].Attributes));
        std::sort(values.begin(), values.end()); state.privileges = "[";
        for (const auto& value : values) { if (state.privileges.size() > 1) state.privileges += ','; state.privileges += Json(value); } state.privileges += ']';
    }
    state.groups = Groups(token, TokenGroups); state.restricted = Groups(token, TokenRestrictedSids); state.capabilities = Groups(token, TokenCapabilities);
    return state;
}
struct Result {
    std::string outcome = "not_started", error_operation, profile_name, package_sid, root, image_hash, descriptor;
    DWORD error_code = 0, child_pid = 0, launch_error = 0, process_exit = STILL_ACTIVE;
    std::uint64_t child_created_ms = 0;
    HRESULT create_hr = E_UNEXPECTED, delete_hr = E_UNEXPECTED;
    bool profile_created = false, profile_delete_attempted = false, child_created = false, child_cleanup_complete = true, child_terminated = false;
    bool ownership_verified = false, claim_created = false;
    DWORD child_cleanup_error = 0;
    bool token_gate_reached = false, tokens_preserved = false, access_check_reached = false, acl_asymmetry = false;
    bool private_directory_created = false, private_file_written = false, thread_changed = false, prior_thread_present = false, thread_restored = false;
    DWORD restore_error = 0;
    std::string normal_token = "null", normal_duplicate = "null", app_token = "null", app_duplicate = "null", prior_thread_token = "null";
    std::vector<std::string> checks, actual_checks;
    std::string JsonValue() const {
        std::string value = "{\"schema\":\"ae-agent.native-writer-feasibility.v1\",\"offline\":true,\"readiness\":false,\"production\":false,\"sdkCapabilityChanged\":false,\"aepWriteDispatches\":0,\"snapshotWriterReady\":false,\"runNonce\":" + Json(FEASIBILITY_NONCE) +
            ",\"compiledOwnedRoot\":" + Json(FEASIBILITY_OWNED_ROOT) + ",\"ownerMarkerSha256\":" + Json(FEASIBILITY_OWNER_MARKER_SHA256) +
            ",\"ownershipBindingVerified\":" + Bool(ownership_verified) + ",\"singleUseClaimCreated\":" + Bool(claim_created) + ",\"rootMetadataIsolation\":\"UNVERIFIED\"" +
            ",\"rootPath\":" + Json(root) + ",\"outcome\":" + Json(outcome) + ",\"errorOperation\":" + Json(error_operation) + ",\"errorCode\":" + std::to_string(error_code) +
            ",\"profileName\":" + Json(profile_name) + ",\"packageSid\":" + Json(package_sid) + ",\"profileCreateHresult\":" + std::to_string(static_cast<std::uint32_t>(create_hr)) +
            ",\"profileCreatedByThisRun\":" + Bool(profile_created) + ",\"profileDeleteAttempted\":" + Bool(profile_delete_attempted) + ",\"profileDeleteHresult\":" + std::to_string(static_cast<std::uint32_t>(delete_hr)) +
            ",\"childCreatedByThisRun\":" + Bool(child_created) + ",\"childPid\":" + std::to_string(child_pid) + ",\"childProcessCreatedUnixMs\":" + std::to_string(child_created_ms) +
            ",\"childImageSha256\":" + Json(image_hash) + ",\"childLaunchWin32Error\":" + std::to_string(launch_error) + ",\"childCleanupComplete\":" + Bool(child_cleanup_complete) +
            ",\"childTerminatedUsingOwnedHandle\":" + Bool(child_terminated) + ",\"childCleanupWin32Error\":" + std::to_string(child_cleanup_error) + ",\"childExitCode\":" + std::to_string(process_exit) +
            ",\"inheritHandles\":false,\"capabilitiesRequested\":0,\"tokenGateReached\":" + Bool(token_gate_reached) + ",\"duplicateTokenIdentityPreserved\":" + Bool(tokens_preserved) +
            ",\"normalToken\":" + normal_token + ",\"normalImpersonationDuplicate\":" + normal_duplicate + ",\"appContainerToken\":" + app_token + ",\"appContainerImpersonationDuplicate\":" + app_duplicate +
            ",\"securityDescriptorSddl\":" + Json(descriptor) + ",\"accessCheckScope\":\"in-memory discretionary check; no kernel MIC proof\",\"accessCheckReached\":" + Bool(access_check_reached) +
            ",\"aclAsymmetryProven\":" + Bool(acl_asymmetry) + ",\"privateOutputDirectoryCreated\":" + Bool(private_directory_created) + ",\"privateOutputFileWritten\":" + Bool(private_file_written) +
            ",\"setThreadTokenCalled\":" + Bool(thread_changed) + ",\"priorThreadTokenPresent\":" + Bool(prior_thread_present) + ",\"priorThreadToken\":" + prior_thread_token +
            ",\"priorThreadTokenRestoredExactly\":" + Bool(thread_restored) + ",\"threadRestoreWin32Error\":" + std::to_string(restore_error) +
            ",\"normalUserWriteAceAdded\":false,\"fallbackAttempted\":false,\"launchAclScope\":[\"fresh run root read/execute\",\"own TokenHolder.exe read/execute\"],\"accessChecks\":[";
        for (size_t i = 0; i < checks.size(); ++i) { if (i) value += ','; value += checks[i]; }
        value += "],\"actualOwnedObjectChecks\":[";
        for (size_t i = 0; i < actual_checks.size(); ++i) { if (i) value += ','; value += actual_checks[i]; }
        return value + "],\"timestampUnixMs\":" + std::to_string(NowMs()) + "}\n";
    }
};
struct OwnedProfile {
    PSID sid = nullptr;
    ~OwnedProfile() { if (sid) FreeSid(sid); }
};
struct OwnedChild {
    Handle process, thread;
    void Cleanup(Result& result) noexcept {
        if (process.value == INVALID_HANDLE_VALUE) return;
        result.child_cleanup_complete = false;
        DWORD waited = WaitForSingleObject(process.value, 0);
        if (waited == WAIT_TIMEOUT) {
            if (TerminateProcess(process.value, 0xAE01)) result.child_terminated = true;
            else result.child_cleanup_error = GetLastError();
            waited = WaitForSingleObject(process.value, 5000);
        }
        if (waited == WAIT_OBJECT_0) {
            if (GetExitCodeProcess(process.value, &result.process_exit)) result.child_cleanup_complete = true;
            else result.child_cleanup_error = GetLastError();
        } else if (waited == WAIT_FAILED) result.child_cleanup_error = GetLastError();
        else if (!result.child_cleanup_error) result.child_cleanup_error = ERROR_TIMEOUT;
        thread.Close(); process.Close(); // No PID lookup/attachment/other process.
    }
};
struct ThreadContext {
    Result& result; Handle prior; TokenState prior_state; bool active = false, attempted = false;
    explicit ThreadContext(Result& r) : result(r) {
        HANDLE token = nullptr;
        if (OpenThreadToken(GetCurrentThread(), TOKEN_QUERY | TOKEN_IMPERSONATE, TRUE, &token)) {
            prior = Handle(token); prior_state = InspectToken(prior.value); result.prior_thread_present = true; result.prior_thread_token = prior_state.JsonValue();
        } else { const DWORD error = GetLastError(); if (error != ERROR_NO_TOKEN) throw Failure("prior_thread_token_unavailable", error); }
    }
    bool SamePrior() noexcept {
        HANDLE token = nullptr;
        if (!OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, TRUE, &token)) return prior.value == INVALID_HANDLE_VALUE && GetLastError() == ERROR_NO_TOKEN;
        Handle read(token);
        if (prior.value == INVALID_HANDLE_VALUE) return false;
        try { const auto state = InspectToken(read.value); return state.token_id == prior_state.token_id && state.PreservedBy(prior_state) && state.impersonation_level == prior_state.impersonation_level; }
        catch (...) { return false; }
    }
    void Enter(HANDLE token, const TokenState& expected) {
        result.thread_changed = true; Need(SetThreadToken(nullptr, token), "set_owned_appcontainer_thread_token"); active = true;
        HANDLE read = nullptr; Need(OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, TRUE, &read), "read_active_thread_token"); Handle current(read);
        const auto actual = InspectToken(current.value); Invariant(expected.PreservedBy(actual) && expected.token_id == actual.token_id, "active_thread_token_mismatch");
    }
    bool Restore() noexcept {
        if (attempted) return result.thread_restored;
        attempted = true;
        if (active) {
            const BOOL ok = prior.value != INVALID_HANDLE_VALUE ? SetThreadToken(nullptr, prior.value) : RevertToSelf();
            if (!ok) { result.restore_error = GetLastError(); return false; }
            active = false;
        }
        result.thread_restored = SamePrior(); if (!result.thread_restored) result.restore_error = ERROR_INVALID_STATE;
        return result.thread_restored;
    }
    ~ThreadContext() { if (!attempted) Restore(); } // One exact restoration, never fallback/retry.
};
void GrantPackageReadExecute(const std::wstring& path, PSID package) {
    PACL previous = nullptr, updated = nullptr; PSECURITY_DESCRIPTOR descriptor = nullptr;
    const DWORD read = GetNamedSecurityInfoW(const_cast<LPWSTR>(path.c_str()), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, &previous, nullptr, &descriptor);
    if (read != ERROR_SUCCESS) throw Failure("read_new_owned_launch_acl", read);
    LocalMemory old_memory; old_memory.value = descriptor; LocalMemory new_memory;
    Invariant(previous && IsValidAcl(previous), "launch_acl_must_be_nonnull");
    EXPLICIT_ACCESSW permission{}; permission.grfAccessPermissions = FILE_GENERIC_READ | FILE_GENERIC_EXECUTE;
    permission.grfAccessMode = GRANT_ACCESS; permission.grfInheritance = NO_INHERITANCE;
    permission.Trustee.TrusteeForm = TRUSTEE_IS_SID; permission.Trustee.TrusteeType = TRUSTEE_IS_UNKNOWN; permission.Trustee.ptstrName = static_cast<LPWSTR>(package);
    const DWORD merge = SetEntriesInAclW(1, &permission, previous, &updated); if (merge != ERROR_SUCCESS) throw Failure("merge_exact_package_read_execute", merge); new_memory.value = updated;
    const DWORD applied = SetNamedSecurityInfoW(const_cast<LPWSTR>(path.c_str()), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, nullptr, nullptr, updated, nullptr);
    if (applied != ERROR_SUCCESS) throw Failure("apply_only_new_owned_launch_acl", applied);
}
Handle Duplicate(HANDLE original) {
    HANDLE duplicate = nullptr; Need(DuplicateTokenEx(original, TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_IMPERSONATE, nullptr,
        SecurityImpersonation, TokenImpersonation, &duplicate), "duplicate_security_impersonation_token"); return Handle(duplicate);
}
struct AccessResult { bool api = false, allowed = false; DWORD desired = 0, granted = 0, error = 0, privilege_count = 0; };
AccessResult CheckAccess(PSECURITY_DESCRIPTOR descriptor, HANDLE token, DWORD desired, const char* name, const char* kind, Result& result) {
    GENERIC_MAPPING mapping{FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_GENERIC_EXECUTE, FILE_ALL_ACCESS};
    MapGenericMask(&desired, &mapping); std::vector<unsigned char> privileges(4096, 0);
    DWORD privilege_size = static_cast<DWORD>(privileges.size()), granted = 0; BOOL allowed = FALSE;
    SetLastError(ERROR_SUCCESS); const BOOL api = AccessCheck(descriptor, token, desired, &mapping,
        reinterpret_cast<PPRIVILEGE_SET>(privileges.data()), &privilege_size, &granted, &allowed);
    const DWORD error = GetLastError(); AccessResult observed{api != FALSE, allowed != FALSE, desired, granted, error, 0};
    if (api) observed.privilege_count = reinterpret_cast<const PRIVILEGE_SET*>(privileges.data())->PrivilegeCount;
    result.checks.push_back("{\"case\":" + Json(name) + ",\"token\":" + Json(kind) + ",\"mappedDesiredAccess\":" + std::to_string(desired) +
        ",\"apiCallSucceeded\":" + Bool(observed.api) + ",\"accessStatus\":" + Bool(observed.allowed) + ",\"grantedAccess\":" + std::to_string(granted) +
        ",\"win32Error\":" + std::to_string(error) + ",\"privilegesUsed\":" + std::to_string(observed.privilege_count) + "}");
    if (!observed.api) throw Failure("access_check_api_failed", error); return observed;
}
void ActualOpenCheck(const std::wstring& path, DWORD access, DWORD disposition, DWORD flags, const char* test, Result& result) {
    SetLastError(ERROR_SUCCESS); Handle open(CreateFileW(path.c_str(), access, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, disposition,
        flags | FILE_FLAG_OPEN_REPARSE_POINT, nullptr)); const DWORD error = GetLastError(); const bool denied = open.value == INVALID_HANDLE_VALUE;
    result.actual_checks.push_back("{\"case\":" + Json(test) + ",\"opened\":" + Bool(!denied) + ",\"win32Error\":" + std::to_string(error) + "}");
    Invariant(denied && error == ERROR_ACCESS_DENIED, "actual_owned_object_access_not_denied");
}
void ActualOwnedWrites(const std::wstring& root, PSECURITY_DESCRIPTOR descriptor, HANDLE app, const TokenState& app_state, ThreadContext& context, Result& result) {
    // This branch is reachable ONLY after the two-token in-memory asymmetry gate.
    const auto private_path = root + L"\\private-output";
    SECURITY_ATTRIBUTES attributes{sizeof(attributes), descriptor, FALSE};
    Need(CreateDirectoryW(private_path.c_str(), &attributes), "create_new_private_candidate_directory"); result.private_directory_created = true;
    const auto outsider_path = root + L"\\owned-outsider-marker.bin";
    { auto writer = NewFile(outsider_path); WriteFlush(writer.value, "outside marker bytes\n"); }
    Handle outsider(CreateFileW(outsider_path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr)); Need(outsider.value != INVALID_HANDLE_VALUE, "own_outside_marker_read");
    const auto outsider_before = ReadBytes(outsider.value);
    context.Enter(app, app_state);
    ActualOpenCheck(outsider_path, GENERIC_WRITE, OPEN_EXISTING, 0, "app_outside_owned_marker_write", result);
    const auto part = private_path + L"\\data.bin.part", final = private_path + L"\\data.bin";
    Handle writer(CreateFileW(part.c_str(), GENERIC_READ | GENERIC_WRITE | DELETE, FILE_SHARE_READ, nullptr, CREATE_NEW,
        FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr)); Need(writer.value != INVALID_HANDLE_VALUE, "app_create_new_inherited_acl_file");
    VerifyRegular(writer.value, part, false); WriteFlush(writer.value, "private candidate bytes\n");
    const size_t size = final.size() * sizeof(wchar_t);
    std::vector<unsigned char> storage(sizeof(FILE_RENAME_INFO) + size + sizeof(wchar_t), 0); auto rename = reinterpret_cast<FILE_RENAME_INFO*>(storage.data());
    rename->ReplaceIfExists = FALSE; rename->RootDirectory = nullptr; rename->FileNameLength = static_cast<DWORD>(size);
    std::copy(final.begin(), final.end(), rename->FileName);
    Need(SetFileInformationByHandle(writer.value, FileRenameInfo, rename, static_cast<DWORD>(storage.size())), "app_same_handle_owned_file_rename");
    VerifyRegular(writer.value, final, false); Need(FlushFileBuffers(writer.value), "app_owned_rename_flush");
    Invariant(ReadBytes(writer.value) == "private candidate bytes\n", "app_written_bytes_readback"); result.private_file_written = true;
    Handle reader(CreateFileW(final.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING,
        FILE_FLAG_OPEN_REPARSE_POINT, nullptr)); Need(reader.value != INVALID_HANDLE_VALUE, "app_read_only_reconciliation_handle");
    writer.Close(); // Ordinary tests now exercise ACL, without a producer sharing denial.
    Invariant(context.Restore(), "exact_prior_thread_restoration_failed");
    ActualOpenCheck(private_path + L"\\normal-insertion.marker", GENERIC_WRITE, CREATE_NEW, 0, "normal_private_child_insertion", result);
    ActualOpenCheck(private_path, WRITE_DAC, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, "normal_private_directory_write_dac", result);
    ActualOpenCheck(final, GENERIC_WRITE, OPEN_EXISTING, 0, "normal_private_file_write", result);
    Invariant(ReadBytes(reader.value) == "private candidate bytes\n" && ReadBytes(outsider.value) == outsider_before, "owned_private_and_outsider_bytes_preserved");
    result.outcome = "offline_acl_asymmetry_and_owned_write_observed";
}
void Execute(const std::wstring& root, OwnedProfile& profile, OwnedChild& child, Result& result) {
    ThreadContext context(result);
    HANDLE process_token = nullptr; Need(OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_IMPERSONATE, &process_token), "own_normal_process_token");
    Handle normal(process_token); const auto normal_state = InspectToken(normal.value); result.normal_token = normal_state.JsonValue();
    Invariant(!normal_state.app_container, "normal_parent_must_not_be_appcontainer");
    if (result.prior_thread_present) Invariant(context.prior_state.user == normal_state.user && context.prior_state.authentication == normal_state.authentication, "prior_thread_identity_not_supported");
    auto normal_duplicate = Duplicate(normal.value); const auto normal_copy = InspectToken(normal_duplicate.value); result.normal_duplicate = normal_copy.JsonValue();
    Invariant(normal_state.PreservedBy(normal_copy) && normal_copy.impersonation_level == SecurityImpersonation, "normal_duplicate_identity_changed");
    const auto image_path = root + L"\\TokenHolder.exe";
    Handle image(CreateFileW(image_path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    Need(image.value != INVALID_HANDLE_VALUE, "own_compiled_child_image_read"); VerifyRegular(image.value, image_path, false); result.image_hash = Hash(image.value);
    Invariant(result.image_hash == FEASIBILITY_TOKEN_HOLDER_SHA256, "compiled_child_image_sha256_mismatch_before_profile");
    result.profile_name = "AEAgentProbe" + std::string(FEASIBILITY_NONCE);
    const auto profile_name = Wide(result.profile_name);
    result.create_hr = CreateAppContainerProfile(profile_name.c_str(), L"AE Agent offline feasibility", L"Disposable own token holder; no AE or user project", nullptr, 0, &profile.sid);
    if (FAILED(result.create_hr)) throw Failure("create_unique_appcontainer_profile_no_attach", static_cast<DWORD>(result.create_hr));
    result.profile_created = true; result.package_sid = Sid(profile.sid);
    GrantPackageReadExecute(root, profile.sid); GrantPackageReadExecute(image_path, profile.sid);
    Invariant(Hash(image.value) == result.image_hash, "owned_child_image_changed_after_acl");
    SIZE_T attribute_size = 0; SetLastError(ERROR_SUCCESS);
    const BOOL sizing = InitializeProcThreadAttributeList(nullptr, 1, 0, &attribute_size);
    Invariant(!sizing && GetLastError() == ERROR_INSUFFICIENT_BUFFER && attribute_size > 0, "process_attribute_size");
    std::vector<unsigned char> attribute_storage(attribute_size, 0); auto attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attribute_storage.data());
    Need(InitializeProcThreadAttributeList(attributes, 1, 0, &attribute_size), "initialize_process_attributes");
    struct AttributeCleanup { LPPROC_THREAD_ATTRIBUTE_LIST value; ~AttributeCleanup() { DeleteProcThreadAttributeList(value); } } attribute_cleanup{attributes};
    SECURITY_CAPABILITIES capabilities{}; capabilities.AppContainerSid = profile.sid;
    Need(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, &capabilities, sizeof(capabilities), nullptr, nullptr), "exact_profile_security_capabilities");
    STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup); startup.lpAttributeList = attributes;
    PROCESS_INFORMATION process{}; std::wstring command = L"\"" + image_path + L"\""; command.push_back(L'\0');
    const BOOL launched = CreateProcessW(image_path.c_str(), command.data(), nullptr, nullptr, FALSE,
        EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, nullptr, root.c_str(), &startup.StartupInfo, &process);
    if (!launched) { result.launch_error = GetLastError(); throw Failure("launch_own_appcontainer_child_no_fallback", result.launch_error); }
    child.process = Handle(process.hProcess); child.thread = Handle(process.hThread); result.child_created = true; result.child_pid = process.dwProcessId;
    Invariant(GetProcessId(child.process.value) == result.child_pid, "owned_child_process_identity");
    FILETIME created{}, ended{}, kernel{}, user{}; Need(GetProcessTimes(child.process.value, &created, &ended, &kernel, &user), "own_child_process_created_time"); result.child_created_ms = FileTimeMs(created);
    wchar_t actual_image[32768]; DWORD image_size = 32768; Need(QueryFullProcessImageNameW(child.process.value, 0, actual_image, &image_size), "own_child_image_identity");
    Invariant(_wcsicmp(std::wstring(actual_image, image_size).c_str(), image_path.c_str()) == 0, "child_image_path_mismatch");
    HANDLE app_token = nullptr; Need(OpenProcessToken(child.process.value, TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_IMPERSONATE, &app_token), "own_child_token_query_duplicate_impersonate");
    Handle app(app_token); const auto app_state = InspectToken(app.value); result.app_token = app_state.JsonValue(); result.token_gate_reached = true;
    Invariant(app_state.app_container && app_state.package == result.package_sid && app_state.user == normal_state.user && app_state.authentication == normal_state.authentication,
        "appcontainer_package_or_authenticated_identity_mismatch");
    auto app_duplicate = Duplicate(app.value); const auto app_copy = InspectToken(app_duplicate.value); result.app_duplicate = app_copy.JsonValue();
    Invariant(app_state.PreservedBy(app_copy) && app_copy.impersonation_level == SecurityImpersonation && app_copy.token_type == TokenImpersonation, "appcontainer_duplicate_identity_changed");
    result.tokens_preserved = true;
    // Candidate is deliberately package-only WRITE. OWNER RIGHTS grants only RC,
    // suppressing the normal owner's implicit WRITE_DAC. No normal-user write ACE.
    result.descriptor = "O:" + normal_state.user + "G:" + normal_state.group + "D:P(A;OICI;RC;;;OW)(A;OICI;FA;;;" + result.package_sid + ")";
    PSECURITY_DESCRIPTOR descriptor = nullptr; Need(ConvertStringSecurityDescriptorToSecurityDescriptorW(Wide(result.descriptor).c_str(), SDDL_REVISION_1, &descriptor, nullptr), "candidate_in_memory_security_descriptor");
    LocalMemory descriptor_memory; descriptor_memory.value = descriptor;
    Invariant(IsValidSecurityDescriptor(descriptor), "candidate_descriptor_invalid");
    BOOL present = FALSE, defaulted = FALSE; PACL dacl = nullptr;
    Need(GetSecurityDescriptorDacl(descriptor, &present, &dacl, &defaulted), "candidate_dacl_read");
    Invariant(present && dacl && IsValidAcl(dacl) && dacl->AceCount == 2, "candidate_exact_two_ace_dacl_required");
    result.access_check_reached = true;
    std::map<std::string, AccessResult> normal_checks, app_checks;
    const std::vector<std::pair<const char*, DWORD>> cases = {{"directory.add_file", FILE_ADD_FILE}, {"file.write_data", FILE_WRITE_DATA}, {"file.generic_write", GENERIC_WRITE},
        {"directory.write_dac", WRITE_DAC}, {"directory.delete", DELETE}, {"owner.read_control", READ_CONTROL}};
    for (const auto& test : cases) {
        normal_checks[test.first] = CheckAccess(descriptor, normal_duplicate.value, test.second, test.first, "normal", result);
        app_checks[test.first] = CheckAccess(descriptor, app_duplicate.value, test.second, test.first, "appcontainer", result);
    }
    result.acl_asymmetry = !normal_checks.at("directory.add_file").allowed && app_checks.at("directory.add_file").allowed &&
        !normal_checks.at("file.write_data").allowed && app_checks.at("file.write_data").allowed && !normal_checks.at("directory.write_dac").allowed;
    if (!result.acl_asymmetry) {
        result.outcome = "acl_asymmetry_failed"; // Expected dual-principal intersection blocker.
        Invariant(!result.thread_changed && !result.private_directory_created, "negative_gate_must_precede_impersonation_and_private_acl");
    } else ActualOwnedWrites(root, descriptor, app_duplicate.value, app_copy, context, result);
    Invariant(context.Restore(), "exact_prior_thread_context_not_preserved");
}
}
std::string EarlyRefusal(const Failure& failure) {
    // No path supplied by a caller is used for writes, including refusal receipts.
    return "{\"schema\":\"ae-agent.writer-feasibility-guard-refusal.v1\",\"outcome\":\"early_refusal\",\"phase\":\"before_native_claim\",\"errorOperation\":" + Json(failure.what()) +
        ",\"errorCode\":" + std::to_string(failure.code) + ",\"runNonce\":" + Json(FEASIBILITY_NONCE) + ",\"compiledOwnedRoot\":" + Json(FEASIBILITY_OWNED_ROOT) +
        ",\"ownerMarkerSha256\":" + Json(FEASIBILITY_OWNER_MARKER_SHA256) + ",\"nativeFileWrites\":0,\"profileCreateCalls\":0,\"aclMutationCalls\":0,\"childCreateCalls\":0," +
        "\"privateOutputWrites\":0,\"setThreadTokenCalls\":0,\"rootMetadataIsolation\":\"UNVERIFIED\",\"readiness\":false,\"production\":false,\"aepWriteDispatches\":0}\n";
}
int wmain(int argc, wchar_t**) {
    Result result; OwnedProfile profile; OwnedChild child; Handle receipt, attempt, owner_marker;
    std::wstring root; std::vector<Handle> directories;
    // Read-only admission. The full root, marker bytes/hash and nonce were fixed
    // BEFORE compilation. Basename matching and an arbitrary root CLI are absent.
    try {
        Invariant(argc == 1, "native_arguments_forbidden");
        root = Canonical(Wide(FEASIBILITY_OWNED_ROOT));
        Invariant(_wcsicmp(ModulePath().c_str(), (root + L"\\OfflineProbe.exe").c_str()) == 0, "compiled_owned_root_mismatch");
        result.root = Utf8(root); directories = HoldDirectories(root);
        const auto marker_path = root + L"\\run-owner.json";
        owner_marker = Handle(CreateFileW(marker_path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
            FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
        Need(owner_marker.value != INVALID_HANDLE_VALUE, "compiled_owner_marker_open");
        VerifyRegular(owner_marker.value, marker_path, false);
        Invariant(Hash(owner_marker.value) == FEASIBILITY_OWNER_MARKER_SHA256 && ReadBytes(owner_marker.value) == FEASIBILITY_OWNER_MARKER_JSON,
            "compiled_owner_marker_hash_or_nonce_mismatch");
        result.ownership_verified = true;
        // CREATE_NEW is the durable native single-use claim. Failed collisions
        // write nothing. Hold this producer for the whole operation; no replay.
        attempt = Handle(CreateFileW((root + L"\\execution.attempt.json").c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ,
            nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr));
        Need(attempt.value != INVALID_HANDLE_VALUE, "native_single_use_claim_create_new");
        result.claim_created = true;
    } catch (const Failure& failure) { std::cout << EarlyRefusal(failure); return 10; }
    catch (const std::exception& failure) { std::cout << EarlyRefusal(Failure(failure.what(), ERROR_UNHANDLED_EXCEPTION)); return 10; }
    try {
        VerifyRegular(attempt.value, root + L"\\execution.attempt.json", false);
        WriteFlush(attempt.value, "{\"schema\":\"ae-agent.writer-feasibility-attempt.v2\",\"nonce\":" + Json(FEASIBILITY_NONCE) + ",\"ownerMarkerSha256\":" + Json(FEASIBILITY_OWNER_MARKER_SHA256) +
            ",\"compiledOwnedRoot\":" + Json(FEASIBILITY_OWNED_ROOT) + ",\"pid\":" + std::to_string(GetCurrentProcessId()) + ",\"noReplay\":true}\n");
        receipt = NewFile(root + L"\\probe.result.json"); // Pre-acquired own receipt handle survives a restore failure.
        try { Execute(root, profile, child, result); }
        catch (const Failure& failure) { result.outcome = "candidate_blocked"; result.error_operation = failure.what(); result.error_code = failure.code; }
        catch (const std::exception& failure) { result.outcome = "candidate_blocked"; result.error_operation = failure.what(); result.error_code = ERROR_UNHANDLED_EXCEPTION; }
        child.Cleanup(result); // Owned handle only, after all Execute token handles closed.
        if (result.profile_created && result.child_cleanup_complete) {
            result.profile_delete_attempted = true; result.delete_hr = DeleteAppContainerProfile(Wide(result.profile_name).c_str());
        }
        const auto serialized = result.JsonValue();
        WriteFlush(receipt.value, serialized);
        std::cout << serialized;
        const bool cleanup = result.child_cleanup_complete && (!result.profile_created || (result.profile_delete_attempted && SUCCEEDED(result.delete_hr)));
        return cleanup ? 0 : 2;
    } catch (const Failure& failure) {
        child.Cleanup(result);
        if (result.profile_created && result.child_cleanup_complete && !result.profile_delete_attempted) { result.profile_delete_attempted = true; result.delete_hr = DeleteAppContainerProfile(Wide(result.profile_name).c_str()); }
        result.outcome = "candidate_blocked"; result.error_operation = failure.what(); result.error_code = failure.code;
        std::cerr << result.JsonValue(); return 3;
    } catch (const std::exception& failure) { std::cerr << "offline_probe_unhandled:" << failure.what() << '\n'; return 4; }
}
