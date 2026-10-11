// Startup-resident read-only service; default empty issuer pin stays dormant.
// No fixture ENV, menus, caller JSX, exports or snapshot/save dispatch.
#include "service_protocol.h"
#include "service_win32.h"
#include "service_transport.h"
#include "service_inspector.h"
#include "AEConfig.h"
#include "AE_GeneralPlug.h"
#include "SPBasic.h"
#include "service_build_identity.h" // exclusively generated in ignored build root
#include <memory>

namespace {
using ame_service::Require;
struct RegisterSuiteLease {
    SPBasicSuite* basic = nullptr;
    const AEGP_RegisterSuite5* suite = nullptr;
    explicit RegisterSuiteLease(SPBasicSuite* value) : basic(value) {
        const void* acquired = nullptr;
        Require(basic && basic->AcquireSuite(kAEGPRegisterSuite, kAEGPRegisterSuiteVersion5, &acquired) == kSPNoError && acquired,
            "register_suite_unavailable_no_fallback");
        suite = static_cast<const AEGP_RegisterSuite5*>(acquired);
    }
    ~RegisterSuiteLease() { if (suite) basic->ReleaseSuite(kAEGPRegisterSuite, kAEGPRegisterSuiteVersion5); }
};
struct State {
    SPBasicSuite* basic = nullptr;
    AEGP_PluginID plugin_id = 0;
    DWORD main_thread = 0;
    HMODULE module = nullptr;
    std::atomic<bool> stopped{false};
    bool startup_failed = false;
    bool identity_attempted = false;
    bool idle_registered = false;
    ame_service::IdleDispatchGate idle_dispatch;
    ame_service::ServiceIdentity identity;
    ame_service::PublicBootReceipt boot_receipt;
    ame_service::VerifiedInspectionMailbox mailbox;
    std::unique_ptr<ame_service::ResidentTransport> transport;
    void Refuse(const char*) noexcept {
        // No public exception text/paths/logs, no dialogs and no retry. A failed
        // metadata publication does not authorize alternate transport or work.
        stopped.store(true, std::memory_order_release);
        mailbox.Close();
        if (transport) transport->Stop();
    }
    void Tick() {
        Require(GetCurrentThreadId() == main_thread, "idle_main_thread_mismatch");
        if (stopped.load(std::memory_order_acquire) || startup_failed || !idle_registered) return;
        if (identity_attempted) {
            const auto job = mailbox.Pop(); if (!job) return;
            { std::lock_guard<std::mutex> lock(job->mutex); if (job->canceled) return; }
            std::string response;
            try { response = ame_service::InspectOnMainThread(basic, plugin_id, main_thread, job->ticket, &job->canceled); }
            catch (const std::exception& error) { response = ame_service::InspectRefusal(job->ticket.Claims().nonce, identity.challenge, error.what()); }
            catch (...) { response = ame_service::InspectRefusal(job->ticket.Claims().nonce, identity.challenge, "native_inspection_failed"); }
            std::lock_guard<std::mutex> lock(job->mutex);
            if (!job->canceled) { job->response = std::move(response); job->completed = true; job->completion.notify_all(); }
            return;
        }
        identity_attempted = true; // terminal on any partial/unknown publication
        identity.host = ame_service::ObserveProcess(GetCurrentProcessId());
        const auto executable = ame_service::ModulePath(nullptr);
        const auto separator = executable.find_last_of(L'\\');
        Require(separator != std::wstring::npos && _wcsicmp(executable.substr(separator + 1).c_str(), L"AfterFX.exe") == 0,
            "wrong_host_executable");
        const auto plugin = ame_service::ModulePath(module);
        identity.plugin_path = ame_service::Utf8(plugin);
        identity.plugin_sha256 = ame_service::FileSha256(plugin);
        identity.build_id = SNAPSHOT_SERVICE_BUILD_ID;
        identity.sdk_archive_sha256 = SNAPSHOT_SERVICE_SDK_ARCHIVE_SHA256;
        identity.challenge = ame_service::RandomChallenge();
        boot_receipt.Publish(identity);
        const auto pin = ame_service::CompiledIssuerPin();
        if (pin.key_id.empty() && pin.public_blob_hex.empty()) return; // default build stays dormant
        transport = std::make_unique<ame_service::ResidentTransport>(pin, identity, mailbox);
        transport->Start(); // missing/invalid signed enrollment cannot produce a ticket
    }
};
// Retain callback refcons for process lifetime: the SDK has no unregister hook.
// Do not delete during Death (or an error after registration), where a nested
// callback could still refer to the object. The OS releases handles at exit.
State* g_state = nullptr;
A_Err Idle(AEGP_GlobalRefcon, AEGP_IdleRefcon refcon, A_long* max_sleep) {
    if (max_sleep) *max_sleep = 60;
    const auto state = reinterpret_cast<State*>(refcon);
    if (!state) return A_Err_NONE;
    state->idle_dispatch.Run([&] { state->Tick(); }, [&](const char* reason) noexcept { state->Refuse(reason); });
    return A_Err_NONE;
}
A_Err Death(AEGP_GlobalRefcon, AEGP_DeathRefcon refcon) {
    const auto state = reinterpret_cast<State*>(refcon);
    if (state) state->Refuse("host_shutdown");
    return A_Err_NONE;
}
}
extern "C" __declspec(dllexport) A_Err EntryPointFunc(SPBasicSuite* basic, A_long, A_long,
    AEGP_PluginID plugin_id, AEGP_GlobalRefcon* global) {
    if (global) *global = nullptr;
    if (g_state) { if (global) *global = reinterpret_cast<AEGP_GlobalRefcon>(g_state); return A_Err_NONE; }
    std::unique_ptr<State> state;
    bool registration_attempted = false;
    try {
        state = std::make_unique<State>(); state->main_thread = GetCurrentThreadId(); state->basic = basic; state->plugin_id = plugin_id;
        Require(GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            reinterpret_cast<LPCWSTR>(&EntryPointFunc), &state->module), "own_module_handle_unavailable");
        RegisterSuiteLease registration(basic); // only startup suite use: hook registration
        registration_attempted = true;
        Require(registration.suite->AEGP_RegisterDeathHook(plugin_id, Death, reinterpret_cast<AEGP_DeathRefcon>(state.get())) == A_Err_NONE,
            "death_hook_registration_failed");
        Require(registration.suite->AEGP_RegisterIdleHook(plugin_id, Idle, reinterpret_cast<AEGP_IdleRefcon>(state.get())) == A_Err_NONE,
            "idle_hook_registration_failed");
        state->idle_registered = true;
        g_state = state.release(); if (global) *global = reinterpret_cast<AEGP_GlobalRefcon>(g_state);
    } catch (...) {
        if (state && registration_attempted) {
            state->startup_failed = true; state->Refuse("startup_registration_failed");
            g_state = state.release(); if (global) *global = reinterpret_cast<AEGP_GlobalRefcon>(g_state);
        }
    }
    return A_Err_NONE; // dormant failure never blocks host startup or opens UI
}
