// Narrow stable N-API ABI resolved from the hosting Node executable. No npm,
// node.lib, copied runtime or foreign helper process owns the pipe connection.
#include "service_transport.h"
#include <stdexcept>

namespace {
using Env = struct napi_env__*;
using Value = struct napi_value__*;
using Info = struct napi_callback_info__*;
using Callback = Value(__cdecl*)(Env, Info);
struct Api {
    int(__cdecl* info)(Env, Info, size_t*, Value*, Value*, void**);
    int(__cdecl* string)(Env, Value, char*, size_t, size_t*);
    int(__cdecl* create_string)(Env, const char*, size_t, Value*);
    int(__cdecl* create_function)(Env, const char*, size_t, Callback, void*, Value*);
    int(__cdecl* set)(Env, Value, const char*, Value);
    int(__cdecl* fail)(Env, const char*, const char*);
    template<typename T> T Get(const char* name) {
        const auto address = GetProcAddress(GetModuleHandleW(nullptr), name);
        ame_service::Require(address != nullptr, "node_napi_abi_unavailable"); return reinterpret_cast<T>(address);
    }
    Api() : info(Get<decltype(info)>("napi_get_cb_info")), string(Get<decltype(string)>("napi_get_value_string_utf8")),
        create_string(Get<decltype(create_string)>("napi_create_string_utf8")), create_function(Get<decltype(create_function)>("napi_create_function")),
        set(Get<decltype(set)>("napi_set_named_property")), fail(Get<decltype(fail)>("napi_throw_error")) {}
};
Api* api = nullptr;
std::vector<std::string> Args(Env env, Info info, std::size_t expected) {
    Value values[3]{}; std::size_t count = 3; ame_service::Require(api->info(env, info, &count, values, nullptr, nullptr) == 0 && count == expected, "adapter_argument_count_invalid");
    std::vector<std::string> result;
    for (std::size_t i = 0; i < count; ++i) {
        std::size_t size = 0; ame_service::Require(api->string(env, values[i], nullptr, 0, &size) == 0 && size <= ame_service::kMaxSignedBytes, "adapter_string_invalid");
        std::string text(size + 1, '\0'); std::size_t got = 0; ame_service::Require(api->string(env, values[i], text.data(), text.size(), &got) == 0 && got == size, "adapter_string_invalid");
        text.resize(size); result.push_back(std::move(text));
    }
    return result;
}
template<typename Work> Value Invoke(Env env, Work work) {
    try { const auto text = work(); Value value = nullptr; ame_service::Require(api->create_string(env, text.data(), text.size(), &value) == 0, "adapter_result_failed"); return value; }
    catch (const std::exception& error) { api->fail(env, "NATIVE_INSPECTION_CLOSED", error.what()); return nullptr; }
    catch (...) { api->fail(env, "NATIVE_INSPECTION_CLOSED", "adapter_failure"); return nullptr; }
}
Value Identity(Env env, Info info) {
    return Invoke(env, [&] {
        (void)Args(env, info, 0); const auto self = ame_service::ObserveProcess(GetCurrentProcessId());
        return "{\"pid\":" + std::to_string(self.pid) + ",\"birth100ns\":" + ame_service::Json(self.birth_100ns) +
            ",\"imagePath\":" + ame_service::Json(self.image_path) + ",\"imageSha256\":" + ame_service::Json(self.image_sha256) + "}";
    });
}
Value Sign(Env env, Info info) { return Invoke(env, [&] { const auto args = Args(env, info, 1); return ame_service::SignWithProvisionedIssuer(ame_service::CompiledIssuerPin(), args[0]); }); }
Value Exchange(Env env, Info info) { return Invoke(env, [&] { const auto args = Args(env, info, 2); return ame_service::ExchangeOnVerifiedPipe(args[0], args[1]); }); }
}
extern "C" __declspec(dllexport) Value __cdecl napi_register_module_v1(Env env, Value exports) {
    try {
        api = new Api(); // module remains resident for Node lifetime
        for (const auto& entry : {std::pair<const char*, Callback>{"selfIdentity", Identity}, {"sign", Sign}, {"exchange", Exchange}}) {
            Value value = nullptr; ame_service::Require(api->create_function(env, entry.first, static_cast<size_t>(-1), entry.second, nullptr, &value) == 0 && api->set(env, exports, entry.first, value) == 0, "adapter_export_failed");
        }
        return exports;
    } catch (...) { return nullptr; }
}
extern "C" __declspec(dllexport) int __cdecl node_api_module_get_api_version_v1() { return 1; }
