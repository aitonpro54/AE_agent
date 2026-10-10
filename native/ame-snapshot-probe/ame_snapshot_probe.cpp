// Disposable, offline-buildable experiment. NOT a production snapshot backend.
// No menus, UI callbacks, executeCommand, render/AME, or caller-provided JSX.
#include "probe_io.h"
#include "fixture_grant.h"
#include "fixture_program.h"
#include "AEConfig.h"
#include "AE_GeneralPlug.h" // also includes AE_GeneralPlugOld.h (CompSuite12)
#include "AE_AdvEffectSuites.h"
#include "SPBasic.h"
#include "probe_build_identity.h" // generated in ignored build directory
#include <algorithm>
#include <memory>
#include <set>
#include <sstream>
#include <cmath>
#include <iomanip>
#include <limits>
#include <locale>
#include <type_traits>

namespace {
using probe::Failure;
void Need(bool value, const char* reason) { if (!value) throw Failure(reason); }
void AE(A_Err e, const char* operation) { if (e != A_Err_NONE) throw Failure(std::string(operation) + ":" + std::to_string(e)); }
template<typename T> std::string Number(T value) {
    if constexpr (std::is_floating_point_v<T>) {
        Need(std::isfinite(value), "nonfinite_host_number");
        std::ostringstream out; out.imbue(std::locale::classic()); out << std::setprecision(std::numeric_limits<T>::max_digits10) << value; return out.str();
    } else return std::to_string(value);
}
template<typename T> std::string Pointer(T value) { return Number(reinterpret_cast<std::uintptr_t>(value)); }
std::string Bool(bool value) { return value ? "true" : "false"; }
std::string Time(const A_Time& t) { return "{\"value\":" + Number(t.value) + ",\"scale\":" + Number(t.scale) + "}"; }
std::wstring Env(const wchar_t* name) { DWORD n = GetEnvironmentVariableW(name, nullptr, 0); if (!n || n > 32768) return {}; std::wstring out(n, L'\0'); DWORD got = GetEnvironmentVariableW(name, out.data(), n); Need(got && got < n, "env_read"); out.resize(got); return out; }
std::uint64_t ProcessCreated() { FILETIME created{}, exited{}, kernel{}, user{}; Need(GetProcessTimes(GetCurrentProcess(), &created, &exited, &kernel, &user) != 0, "process_created_time"); ULARGE_INTEGER n; n.LowPart = created.dwLowDateTime; n.HighPart = created.dwHighDateTime; return n.QuadPart / 10000 - 11644473600000ULL; }

struct Suites {
    SPBasicSuite* basic = nullptr;
    const AEGP_ProjSuite6* project = nullptr;
    const AEGP_MemorySuite1* memory = nullptr;
    const AEGP_RegisterSuite5* registration = nullptr;
    const AEGP_ItemSuite9* item = nullptr;
    const AEGP_CompSuite12* comp = nullptr;
    const AEGP_LayerSuite9* layer = nullptr;
    const AEGP_FootageSuite5* footage = nullptr;
    const AEGP_UtilitySuite6* utility = nullptr;
    const AEGP_CollectionSuite2* collection = nullptr;
    const PF_AdvAppSuite2* dirty = nullptr;
    std::vector<std::pair<const char*, A_long>> acquired;
    template<typename T> void Get(const char* name, A_long version, const T*& destination) {
        const void* suite = nullptr;
        Need(basic && basic->AcquireSuite(name, version, &suite) == kSPNoError && suite, "suite_unavailable_no_fallback");
        destination = static_cast<const T*>(suite); acquired.emplace_back(name, version);
    }
    void Required() {
        Get(kAEGPRegisterSuite, kAEGPRegisterSuiteVersion5, registration);
        Get(kAEGPProjSuite, kAEGPProjSuiteVersion6, project);
        Get(kAEGPMemorySuite, kAEGPMemorySuiteVersion1, memory);
        Get(kAEGPItemSuite, kAEGPItemSuiteVersion9, item);
        Get(kAEGPCompSuite, kAEGPCompSuiteVersion12, comp);
        Get(kAEGPLayerSuite, kAEGPLayerSuiteVersion9, layer);
        Get(kAEGPFootageSuite, kAEGPFootageSuiteVersion5, footage);
        Get(kAEGPUtilitySuite, kAEGPUtilitySuiteVersion6, utility);
        Get(kAEGPCollectionSuite, kAEGPCollectionSuiteVersion2, collection);
    }
    ~Suites() { if (basic) for (auto i = acquired.rbegin(); i != acquired.rend(); ++i) basic->ReleaseSuite(i->first, i->second); }
};
struct Memory {
    const AEGP_MemorySuite1* suite;
    AEGP_MemHandle handle = nullptr;
    explicit Memory(const AEGP_MemorySuite1* s) : suite(s) {}
    ~Memory() { if (handle) suite->AEGP_FreeMemHandle(handle); }
    std::string Text(bool utf16) {
        if (!handle) return {};
        AEGP_MemSize size = 0; AE(suite->AEGP_GetMemHandleSize(handle, &size), "GetMemHandleSize");
        Need(size > 0 && size <= 1048576 && (!utf16 || size % 2 == 0), "host_string_size");
        void* p = nullptr; AE(suite->AEGP_LockMemHandle(handle, &p), "LockMemHandle");
        std::string text;
        try {
            Need(p != nullptr, "host_string_null");
            if (utf16) { auto s = static_cast<const wchar_t*>(p); size_t limit = size / sizeof(wchar_t); size_t n = 0; while (n < limit && s[n]) ++n; Need(n < limit, "host_utf16_unterminated"); text = probe::Utf8(std::wstring(s, n)); }
            else { auto s = static_cast<const char*>(p); size_t n = 0; while (n < size && s[n]) ++n; Need(n < size, "host_utf8_unterminated"); text.assign(s, n); (void)probe::Wide(text); }
        } catch (...) { suite->AEGP_UnlockMemHandle(handle); throw; }
        AE(suite->AEGP_UnlockMemHandle(handle), "UnlockMemHandle"); return text;
    }
};
struct Snapshot {
    AEGP_ProjectH handle = nullptr;
    std::string path, graph_json, graph_sha, revision, evidence;
    bool dirty = false;
    size_t items = 0, comps = 0, layers = 0;
    std::vector<std::string> names, comments, media_paths;
    std::vector<A_long> sources;
    std::string IdentityJson() const { return "{\"projectHandle\":" + probe::Json(Pointer(handle)) + ",\"path\":" + probe::Json(path) + ",\"dirty\":" + Bool(dirty) + ",\"fixtureCanonicalSha256\":" + probe::Json(graph_sha) + ",\"extendscriptRevisionObserved\":" + probe::Json(revision) + ",\"observedState\":" + graph_json + (evidence.empty() ? "" : ",\"fixtureEvidence\":" + probe::Json(evidence) + ",\"fixedMainName\":\"Main\",\"fixedNestedName\":\"AEAgent Fixture Nested\",\"rootCompositionCount\":1") + "}"; }
    std::string ApprovalSha() const { return probe::Sha256(IdentityJson()); }
};
enum class Phase { InspectAck, FixtureAck, SnapshotAck, Terminal };
struct State {
    Suites suites;
    AEGP_PluginID plugin_id = 0;
    std::unique_ptr<probe::OwnedRoot> root;
    probe::Binding binding;
    std::string plugin_path;
    Phase phase = Phase::InspectAck;
    Snapshot boot;
    std::string fixture_kind;
    std::uint64_t deadline = 0;
    A_long driver_major = 0, driver_minor = 0;
    bool signed_fixture = false, mutation_dispatched = false, dirty_restored = false;
    std::string session_key, stage_id, role, source_root_path, baseline_sha;
    std::unique_ptr<probe::OwnedRoot> source_root;
    probe::Handle original_source_pin;
    std::string original_source_sha;
    probe::FixtureGrant first_grant;
    unsigned variant = 0, native_saves = 0, fixture_dispatches = 0;
    std::string Base() const {
        if (signed_fixture) return "\"schema\":\"ae-agent.native-fixture-probe.v2\",\"hostLoaded\":true,\"readiness\":false,\"productionAuthorization\":false,\"legacyUnsignedWrites\":\"closed\",\"ownershipContract\":\"trusted cooperative owned root and stable ancestors\",\"replayAllowed\":false,\"role\":" + probe::Json(role) + ",\"fixture\":" + probe::Json(fixture_kind) + ",\"stageId\":" + probe::Json(stage_id) + ",\"nonce\":" + probe::Json(binding.nonce) + ",\"challenge\":" + probe::Json(binding.challenge) + ",\"pid\":" + Number(binding.pid) + ",\"processCreatedUnixMs\":" + Number(binding.process_created_ms) + ",\"pluginSha256\":" + probe::Json(binding.build_sha) + ",\"rootPath\":" + probe::Json(binding.root_path) + ",\"buildId\":" + probe::Json(PROBE_BUILD_ID) + ",\"nativeSaveDispatches\":" + Number(native_saves) + ",\"fixtureMutationDispatches\":" + Number(fixture_dispatches) + ",\"timestampUnixMs\":" + Number(probe::NowMs());
        return "\"schema\":\"ae-agent.native-snapshot-probe.v1\",\"offlineProbe\":true,\"readiness\":false,\"productionAuthorization\":false,\"destinationWriteContract\":\"destination_write_contract_unverified\",\"rootMetadataIsolation\":\"UNVERIFIED\",\"saveCalled\":false,\"projectMutationDispatchCount\":0,\"outputProofAvailable\":false,\"nonce\":" + probe::Json(binding.nonce) + ",\"challenge\":" + probe::Json(binding.challenge) + ",\"pid\":" + Number(binding.pid) + ",\"processCreatedUnixMs\":" + Number(binding.process_created_ms) + ",\"pluginPath\":" + probe::Json(plugin_path) + ",\"pluginSha256\":" + probe::Json(binding.build_sha) + ",\"buildId\":" + probe::Json(PROBE_BUILD_ID) + ",\"sdkArchiveSha256\":" + probe::Json(PROBE_SDK_ARCHIVE_SHA256) + ",\"timestampUnixMs\":" + Number(probe::NowMs());
    }
    void Receipt(const wchar_t* name, const std::string& json) {
        const auto body = "{" + Base() + "," + json + "}";
        root->WriteNew(name, signed_fixture ? "{\"body\":" + probe::Json(body) + ",\"mac\":" + probe::Json(probe::Hmac256(session_key, body)) + "}\n" : body + "\n");
    }
    std::string Revision() {
        const char* compiled = "(function(){if(!app.project||typeof app.project.revision!=='number')throw Error('revision unavailable');return String(app.project.revision);})()";
        A_Boolean available = FALSE; AE(suites.utility->AEGP_IsScriptingAvailable(&available), "IsScriptingAvailable"); Need(available, "scripting_unavailable");
        Memory result(suites.memory), error(suites.memory);
        AE(suites.utility->AEGP_ExecuteScript(plugin_id, compiled, FALSE, &result.handle, &error.handle), "ExecuteReadOnlyRevisionScript");
        Need(error.Text(false).empty(), "fixed_script_host_error"); return result.Text(false);
    }
    std::string FixedScript(const std::string& compiled, bool mutates) {
        A_Boolean available = FALSE; AE(suites.utility->AEGP_IsScriptingAvailable(&available), "IsScriptingAvailable"); Need(available, "scripting_unavailable");
        if (mutates) { mutation_dispatched = true; ++fixture_dispatches; }
        Memory result(suites.memory), error(suites.memory);
        AE(suites.utility->AEGP_ExecuteScript(plugin_id, compiled.c_str(), FALSE, &result.handle, &error.handle), "ExecuteFixedFixtureScript");
        Need(error.Text(false).empty(), "fixed_fixture_script_host_error"); return result.Text(false);
    }
    void FixtureEvidence(Snapshot& snapshot, unsigned expected_variant) {
        snapshot.evidence = FixedScript(fixture_program::Evidence(fixture_kind, expected_variant), false);
        auto e = probe::ParseFields(snapshot.evidence);
        probe::ExactKeys(e, {"sentinel", "variant", "media_path", "proxy_path", "use_proxy", "main_name", "nested_name", "root_comp_count"});
        Need(e.at("main_name") == "Main" && e.at("nested_name") == "AEAgent Fixture Nested" && e.at("root_comp_count") == "1", "fixture_unique_root_comp_required");
        Need(e.at("media_path") == source_root_path + "\\fixture.bmp", "fixture_media_outside_owned_source");
        Need(e.at("proxy_path") == "NONE" || e.at("proxy_path") == source_root_path + "\\proxy.bmp", "fixture_proxy_outside_owned_source");
        Need(e.at("proxy_path") == "NONE" ? e.at("use_proxy") == "0" : e.at("use_proxy") == "1", "fixture_proxy_flag_mismatch");
        auto& media_root = source_root ? *source_root : *root;
        Need(media_root.Hash(L"fixture.bmp") == probe::Sha256(fixture_program::Bitmap(false)) &&
            media_root.Hash(L"proxy.bmp") == probe::Sha256(fixture_program::Bitmap(true)), "fixture_media_bytes_changed");
    }
    std::string ItemText(AEGP_ItemH item, bool comment) {
        Memory name(suites.memory);
        if (comment) AE(suites.item->AEGP_GetItemComment(item, &name.handle), "GetItemComment");
        else AE(suites.item->AEGP_GetItemName(plugin_id, item, &name.handle), "GetItemName");
        return name.Text(true);
    }
    A_long ItemId(AEGP_ItemH item) { if (!item) return 0; A_long id = 0; AE(suites.item->AEGP_GetItemID(item, &id), "GetItemID"); return id; }
    std::string FootagePath(AEGP_FootageH footage) {
        A_long files = 0, per_frame = 0; AE(suites.footage->AEGP_GetFootageNumFiles(footage, &files, &per_frame), "GetFootageNumFiles");
        Need(files == 1 && per_frame == 1, "only_single_file_fixture_media");
        Memory path(suites.memory); AE(suites.footage->AEGP_GetFootagePath(footage, 0, AEGP_FOOTAGE_MAIN_FILE_INDEX, &path.handle), "GetFootagePath"); return path.Text(true);
    }
    Snapshot Capture() {
        Snapshot out; A_long projects = 0; AE(suites.project->AEGP_GetNumProjects(&projects), "GetNumProjects"); Need(projects == 1, "one_project_required");
        AE(suites.project->AEGP_GetProjectByIndex(0, &out.handle), "GetProjectByIndex"); Need(out.handle != nullptr, "no_project");
        Memory path(suites.memory); AE(suites.project->AEGP_GetProjectPath(out.handle, &path.handle), "GetProjectPath"); out.path = path.Text(true);
        A_Boolean dirty = FALSE; AE(suites.project->AEGP_ProjectIsDirty(out.handle, &dirty), "ProjectIsDirty"); out.dirty = dirty != FALSE;
        // Fixed read-only script. revision is an observed host token, not an invented native/public undo revision.
        out.revision = Revision();
        (void)probe::Decimal(out.revision);
        AEGP_ItemH active = nullptr, project_root = nullptr;
        AE(suites.item->AEGP_GetActiveItem(&active), "GetActiveItem");
        AE(suites.project->AEGP_GetProjectRootFolder(out.handle, &project_root), "GetProjectRootFolder");
        AEGP_LayerH active_layer = nullptr; AE(suites.layer->AEGP_GetActiveLayer(&active_layer), "GetActiveLayer");
        AEGP_LayerIDVal active_layer_id = 0; if (active_layer) AE(suites.layer->AEGP_GetLayerID(active_layer, &active_layer_id), "GetActiveLayerID");
        std::string graph = "{\"activeItemId\":" + Number(ItemId(active)) + ",\"activeLayerId\":" + Number(active_layer_id) + ",\"items\":[";
        AEGP_ItemH current = nullptr; AE(suites.item->AEGP_GetFirstProjItem(out.handle, &current), "GetFirstProjItem");
        std::set<AEGP_ItemH> seen; bool comma = false;
        while (current) {
            Need(seen.insert(current).second && seen.size() <= 16, "item_graph_cycle_or_foreign_size");
            if (current != project_root) {
                ++out.items; if (comma) graph += ','; comma = true;
                AEGP_ItemType type = AEGP_ItemType_NONE; AEGP_ItemFlags flags = 0; A_Boolean selected = FALSE;
                A_long width = 0, height = 0; A_Time duration{}, time{}; AEGP_ItemH parent = nullptr; AEGP_ItemViewP view = nullptr;
                AE(suites.item->AEGP_GetItemType(current, &type), "GetItemType");
                const bool fixture_folder = signed_fixture && type == AEGP_ItemType_FOLDER;
                Need(type == AEGP_ItemType_COMP || type == AEGP_ItemType_FOOTAGE || fixture_folder, "fixture_has_foreign_item_type");
                AE(suites.item->AEGP_GetItemFlags(current, &flags), "GetItemFlags"); AE(suites.item->AEGP_IsItemSelected(current, &selected), "IsItemSelected");
                if (!fixture_folder) {
                    AE(suites.item->AEGP_GetItemDimensions(current, &width, &height), "GetItemDimensions"); AE(suites.item->AEGP_GetItemDuration(current, &duration), "GetItemDuration"); AE(suites.item->AEGP_GetItemCurrentTime(current, &time), "GetItemCurrentTime");
                    AE(suites.item->AEGP_GetItemMRUView(current, &view), "GetItemMRUView");
                }
                AE(suites.item->AEGP_GetItemParentFolder(current, &parent), "GetItemParentFolder");
                std::string name = ItemText(current, false), comment = ItemText(current, true); out.names.push_back(name); out.comments.push_back(comment);
                Need(!fixture_folder || (name == "AEAgent Fixture Dependencies" && parent == project_root), "fixture_folder_exact_identity_required");
                graph += "{\"id\":" + Number(ItemId(current)) + ",\"type\":" + Number(type) + ",\"name\":" + probe::Json(name) + ",\"comment\":" + probe::Json(comment) + ",\"parentId\":" + Number(parent == project_root ? 0 : ItemId(parent)) + ",\"flags\":" + Number(flags) + ",\"selected\":" + Bool(selected != FALSE) + ",\"width\":" + Number(width) + ",\"height\":" + Number(height) + ",\"duration\":" + Time(duration) + ",\"time\":" + Time(time) + ",\"mruViewHandle\":" + probe::Json(Pointer(view));
                if (type == AEGP_ItemType_FOOTAGE) {
                    AEGP_FootageH main = nullptr; AE(suites.footage->AEGP_GetMainFootageFromItem(current, &main), "GetMainFootageFromItem");
                    std::string file = FootagePath(main); out.media_paths.push_back(file); graph += ",\"mainFootagePath\":" + probe::Json(file);
                }
                if (flags & AEGP_ItemFlag_HAS_PROXY) {
                    AEGP_FootageH proxy = nullptr; AE(suites.footage->AEGP_GetProxyFootageFromItem(current, &proxy), "GetProxyFootageFromItem");
                    std::string file = FootagePath(proxy); out.media_paths.push_back(file); graph += ",\"proxyFootagePath\":" + probe::Json(file);
                }
                if (type == AEGP_ItemType_COMP) {
                    ++out.comps; AEGP_CompH comp = nullptr; AE(suites.comp->AEGP_GetCompFromItem(current, &comp), "GetCompFromItem");
                    AEGP_CompFlags comp_flags = 0; AEGP_DownsampleFactor downsample{}; A_FpLong framerate = 0; A_Time work_start{}, work_duration{}, display_start{};
                    AE(suites.comp->AEGP_GetCompFlags(comp, &comp_flags), "GetCompFlags"); AE(suites.comp->AEGP_GetCompDownsampleFactor(comp, &downsample), "GetCompDownsampleFactor"); AE(suites.comp->AEGP_GetCompFramerate(comp, &framerate), "GetCompFramerate");
                    AE(suites.comp->AEGP_GetCompWorkAreaStart(comp, &work_start), "GetCompWorkAreaStart"); AE(suites.comp->AEGP_GetCompWorkAreaDuration(comp, &work_duration), "GetCompWorkAreaDuration"); AE(suites.comp->AEGP_GetCompDisplayStartTime(comp, &display_start), "GetCompDisplayStartTime");
                    graph += ",\"compFlags\":" + Number(comp_flags) + ",\"downsampleX\":" + Number(downsample.xS) + ",\"downsampleY\":" + Number(downsample.yS) + ",\"framerate\":" + Number(framerate) + ",\"workStart\":" + Time(work_start) + ",\"workDuration\":" + Time(work_duration) + ",\"displayStart\":" + Time(display_start);
                    A_long count = 0; AE(suites.layer->AEGP_GetCompNumLayers(comp, &count), "GetCompNumLayers"); Need(count >= 0 && count <= 4, "foreign_layer_count");
                    graph += ",\"layers\":[";
                    for (A_long i = 0; i < count; ++i) {
                        ++out.layers; AEGP_LayerH layer = nullptr; AE(suites.layer->AEGP_GetCompLayerByIndex(comp, i, &layer), "GetCompLayerByIndex");
                        AEGP_LayerIDVal id = 0; AEGP_ItemH source = nullptr; AEGP_LayerFlags layer_flags = 0; A_Time layer_time{}, in_point{}, layer_duration{};
                        AE(suites.layer->AEGP_GetLayerID(layer, &id), "GetLayerID"); AE(suites.layer->AEGP_GetLayerSourceItem(layer, &source), "GetLayerSourceItem"); AE(suites.layer->AEGP_GetLayerFlags(layer, &layer_flags), "GetLayerFlags"); AE(suites.layer->AEGP_GetLayerCurrentTime(layer, AEGP_LTimeMode_CompTime, &layer_time), "GetLayerCurrentTime");
                        AE(suites.layer->AEGP_GetLayerInPoint(layer, AEGP_LTimeMode_CompTime, &in_point), "GetLayerInPoint"); AE(suites.layer->AEGP_GetLayerDuration(layer, AEGP_LTimeMode_CompTime, &layer_duration), "GetLayerDuration");
                        Memory layer_name(suites.memory); AE(suites.layer->AEGP_GetLayerName(plugin_id, layer, &layer_name.handle, nullptr), "GetLayerName"); std::string nameL = layer_name.Text(true); out.names.push_back(nameL); out.sources.push_back(ItemId(source));
                        if (i) graph += ',';
                        graph += "{\"id\":" + Number(id) + ",\"name\":" + probe::Json(nameL) + ",\"sourceId\":" + Number(ItemId(source)) + ",\"flags\":" + Number(layer_flags) + ",\"time\":" + Time(layer_time) + ",\"inPoint\":" + Time(in_point) + ",\"duration\":" + Time(layer_duration) + "}";
                    }
                    graph += "],\"selectedLayerIds\":[";
                    AEGP_Collection2H selection = nullptr; AE(suites.comp->AEGP_GetNewCollectionFromCompSelection(plugin_id, comp, &selection), "GetCompSelection");
                    try {
                        A_u_long countS = 0; AE(suites.collection->AEGP_GetCollectionNumItems(selection, &countS), "GetCollectionNumItems"); Need(countS <= 4, "foreign_selection_count");
                        for (A_u_long i = 0; i < countS; ++i) {
                            AEGP_CollectionItemV2 entry{}; AE(suites.collection->AEGP_GetCollectionItemByIndex(selection, i, &entry), "GetCollectionItemByIndex");
                            Need(entry.type == AEGP_CollectionItemType_LAYER, "parameter_selection_unverified"); AEGP_LayerIDVal id = 0; AE(suites.layer->AEGP_GetLayerID(entry.u.layer.layerH, &id), "GetSelectedLayerID"); if (i) graph += ','; graph += Number(id);
                        }
                    } catch (...) { suites.collection->AEGP_DisposeCollection(selection); throw; }
                    AE(suites.collection->AEGP_DisposeCollection(selection), "DisposeCollection"); graph += ']';
                }
                graph += '}';
            }
            AEGP_ItemH next = nullptr; AE(suites.item->AEGP_GetNextProjItem(out.handle, current, &next), "GetNextProjItem"); current = next;
        }
        out.graph_json = graph + "]}"; out.graph_sha = probe::Sha256(out.graph_json); return out;
    }
    probe::Ack ReadAck(const wchar_t* name, const std::string& operation, const std::string& sha) { return probe::ValidateAck(probe::ParseFields(root->Read(name)), binding, operation, sha, probe::NowMs()); }
    void Inspect(const probe::Ack& ack) {
        boot = Capture(); Need(boot.path.empty() && !boot.dirty && boot.items == 0, "refuse_current_user_project_requires_empty_clean_untitled");
        fixture_kind = ack.fixture;
        Receipt(L"boot.json", "\"status\":\"empty_boot_inspected\",\"provenance\":" + probe::ProvenanceJson(ack) + ",\"baseline\":" + boot.IdentityJson() + ",\"approvalSha256\":" + probe::Json(boot.ApprovalSha()) + ",\"fixtureCreationEnabled\":false");
        phase = Phase::FixtureAck;
    }
    void CreateFixture(const probe::Ack& ack) {
        Need(ack.fixture == fixture_kind, "fixture_kind_changed");
        // Refuse BEFORE project inspection/script dispatch, media creation, import,
        // layers, source save or dirty restoration. Applies to ALL fixture kinds.
        // Fresh owned directories cannot reserve a writable child path for a
        // path-only host writer. No unsupported override exists in this build.
        probe::RequireProjectWriteContract();
    }
    void Save(const probe::Ack&) {
        // Future semantic probe boundary; this phase is unreachable in this build.
        // A supported safe writer route must be reviewed before any AEP dispatch.
        probe::RequireProjectWriteContract();
    }
    probe::FixtureGrant SignedGrant(const wchar_t* name, const std::string& operation, const std::string& fingerprint) {
        auto g = probe::ValidateFixtureGrant(probe::ParseFields(root->Read(name)), binding, session_key,
            operation, fingerprint, stage_id, fixture_kind, probe::NowMs());
        if (!first_grant.action_id.empty()) Need(g.action_id == first_grant.action_id && g.revision == first_grant.revision &&
            g.run_id == first_grant.run_id && g.payload_sha == first_grant.payload_sha &&
            g.checkpoint_sha == first_grant.checkpoint_sha && g.contract_version == first_grant.contract_version, "fixture_grant_execution_changed");
        return g;
    }
    void NativeSaveAs(const Snapshot& snapshot, const wchar_t* basename) {
        Need(!root->Exists(basename), "owned_save_destination_exists_no_replay");
        const auto path = root->Child(basename); mutation_dispatched = true; ++native_saves;
        AE(suites.project->AEGP_SaveProjectAs(snapshot.handle, reinterpret_cast<const A_UTF16Char*>(path.c_str())), "SaveOwnedFixtureAs");
        (void)root->Hash(basename); // regular, non-reparse, single-link same-path file
    }
    void StartSigned() {
        boot = Capture(); Need(boot.path.empty() && !boot.dirty && boot.items == 0, "signed_child_requires_empty_clean_untitled");
        const auto fingerprint = role == "capture" ? boot.ApprovalSha() : probe::Sha256(boot.ApprovalSha() + ":" + baseline_sha);
        Receipt(L"signed-boot.json", "\"status\":\"empty_owned_child_waiting_signed_grant\",\"baseline\":" + boot.IdentityJson() +
            ",\"approvalSha256\":" + probe::Json(fingerprint) + ",\"baselineInputSha256\":" + probe::Json(baseline_sha));
        phase = Phase::FixtureAck;
    }
    void CreateSignedFixture(const probe::FixtureGrant& grant) {
        Need(role == "capture" && Capture().ApprovalSha() == boot.ApprovalSha(), "fixture_boot_changed");
        // No filesystem asset, script, save or dirty dispatch before durable consume.
        probe::ConsumeFixtureGrant(*root, grant); first_grant = grant;
        root->WriteFixtureAsset(L"fixture.bmp", fixture_program::Bitmap(false));
        root->WriteFixtureAsset(L"proxy.bmp", fixture_program::Bitmap(true));
        FixedScript(fixture_program::Create(binding.root_path), true);
        auto fixture = Capture();
        if (fixture_kind != "untitled-dirty") NativeSaveAs(fixture, L"source.aep");
        if (fixture_kind != "saved-clean") FixedScript(fixture_program::SetSentinel(fixture_kind), true);
        boot = Capture(); FixtureEvidence(boot, 0);
        Need(boot.path == (fixture_kind == "untitled-dirty" ? "" : probe::Utf8(root->Child(L"source.aep"))) &&
            boot.dirty == (fixture_kind != "saved-clean"), "fixture_source_identity_or_dirty_mismatch");
        if (!boot.path.empty()) { original_source_pin = probe::LockReadFile(probe::Wide(boot.path)); original_source_sha = root->Hash(L"source.aep"); }
        Receipt(L"signed-fixture.json", "\"status\":\"source_fixture_ready\",\"grant\":" + grant.ReceiptJson() +
            ",\"source\":" + boot.IdentityJson() + ",\"sourceFileSha256\":" + probe::Json(original_source_sha) +
            ",\"approvalSha256\":" + probe::Json(boot.ApprovalSha()) + ",\"layerSwitchDispatches\":0");
        phase = Phase::SnapshotAck;
    }
    void SnapshotSignedFixture(const probe::FixtureGrant& grant) {
        Need(role == "capture", "snapshot_capture_role_required");
        auto before = Capture(); FixtureEvidence(before, 0);
        Need(before.ApprovalSha() == boot.ApprovalSha(), "fixture_source_changed_before_snapshot");
        Need(!root->Exists(L"baseline.aep"), "snapshot_destination_exists_no_replay");
        probe::ConsumeFixtureGrant(*root, grant);
        const auto path = root->Child(L"baseline.aep"); mutation_dispatched = true; ++native_saves;
        AE(suites.project->AEGP_SaveProjectToPath(before.handle, reinterpret_cast<const A_UTF16Char*>(path.c_str())), "SaveFixtureBaselineToPath");
        auto after = Capture(); FixtureEvidence(after, 0);
        // Never repair path drift by save-as or reload: that would destroy dirty memory.
        Need(before.handle == after.handle && before.path == after.path && before.graph_sha == after.graph_sha &&
            before.evidence == after.evidence, "snapshot_changed_source_path_or_observed_state");
        if (before.dirty && !after.dirty && grant.restore_dirty) {
            suites.Get(kPFAdvAppSuite, kPFAdvAppSuiteVersion2, suites.dirty);
            mutation_dispatched = true;
            AE(suites.dirty->PF_SetProjectDirty(), "RestoreOwnedFixtureDirtyFlag"); dirty_restored = true;
            after = Capture(); FixtureEvidence(after, 0);
        }
        Need(before.handle == after.handle && before.path == after.path && before.dirty == after.dirty &&
            before.graph_sha == after.graph_sha && before.evidence == after.evidence, "snapshot_source_preservation_failed");
        Need(original_source_sha.empty() || root->Hash(L"source.aep") == original_source_sha, "snapshot_overwrote_source_file");
        const auto output_sha = root->Hash(L"baseline.aep");
        Receipt(L"signed-snapshot.json", "\"status\":\"fixture_baseline_saved_source_preserved\",\"grant\":" + grant.ReceiptJson() +
            ",\"sourceBefore\":" + before.IdentityJson() + ",\"sourceAfter\":" + after.IdentityJson() +
            ",\"baselineSha256\":" + probe::Json(output_sha) + ",\"baselinePath\":" + probe::Json(probe::Utf8(path)) +
            ",\"dirtyRestored\":" + Bool(dirty_restored) + ",\"layerSwitchDispatches\":0,\"undoHistoryPreservation\":\"NOT_CLAIMED\"");
        phase = Phase::Terminal;
    }
    void StageSignedVariants(const probe::FixtureGrant& grant) {
        Need(role == "stage" && Capture().ApprovalSha() == boot.ApprovalSha() && root->Hash(L"baseline.aep") == baseline_sha,
            "stage_boot_or_baseline_changed");
        Need(!root->Exists(L"variant-01.aep") && !root->Exists(L"variant-02.aep"), "variant_destination_exists_no_replay");
        probe::ConsumeFixtureGrant(*root, grant); first_grant = grant;
        auto baseline_pin = probe::LockReadFile(root->Child(L"baseline.aep"));
        AEGP_ProjectH opened = nullptr; const auto input = root->Child(L"baseline.aep"); mutation_dispatched = true;
        AE(suites.project->AEGP_OpenProjectFromPath(reinterpret_cast<const A_UTF16Char*>(input.c_str()), &opened), "OpenOwnedStageBaseline");
        auto baseline = Capture(); Need(baseline.handle == opened && !baseline.dirty, "stage_baseline_not_clean"); FixtureEvidence(baseline, 0);
        std::string outputs = "[";
        for (unsigned i = 1; i <= 2; ++i) {
            variant = i; FixedScript(fixture_program::SelectVariant(i), true);
            auto current = Capture(); FixtureEvidence(current, i);
            const wchar_t* name = i == 1 ? L"variant-01.aep" : L"variant-02.aep";
            NativeSaveAs(current, name); const auto output_sha = root->Hash(name);
            AEGP_ProjectH reopened = nullptr; const auto output_path = root->Child(name);
            AE(suites.project->AEGP_OpenProjectFromPath(reinterpret_cast<const A_UTF16Char*>(output_path.c_str()), &reopened), "ReopenOwnedFixtureVariant");
            auto readback = Capture(); FixtureEvidence(readback, i);
            Need(readback.handle == reopened && !readback.dirty && readback.path == probe::Utf8(output_path) &&
                root->Hash(name) == output_sha && root->Hash(L"baseline.aep") == baseline_sha, "variant_reopen_or_baseline_preservation_failed");
            if (i != 1) outputs += ',';
            outputs += "{\"variant\":" + Number(i) + ",\"path\":" + probe::Json(probe::Utf8(output_path)) + ",\"sha256\":" + probe::Json(output_sha) +
                ",\"reopened\":true,\"readback\":" + readback.IdentityJson() + "}";
        }
        Receipt(L"signed-variants.json", "\"status\":\"two_owned_variants_reopened\",\"grant\":" + grant.ReceiptJson() +
            ",\"baselineSha256\":" + probe::Json(baseline_sha) + ",\"outputs\":" + outputs + "],\"ameSubmissionAttempted\":false");
        phase = Phase::Terminal;
    }
    void Tick() {
        if (phase == Phase::Terminal) return;
        Need(probe::NowMs() < deadline, "probe_idle_deadline");
        if (signed_fixture) {
            // Unsigned legacy ACKs never authorize a signed-fixture write.
            Need(!root->Exists(L"fixture.ack") && !root->Exists(L"snapshot.ack") && !root->Exists(L"native.ack"), "unsigned_ack_forbidden_in_signed_child");
            if (phase == Phase::InspectAck) StartSigned();
            else if (phase == Phase::FixtureAck && role == "capture" && root->Exists(L"signed-create-fixture.grant"))
                CreateSignedFixture(SignedGrant(L"signed-create-fixture.grant", "create-fixture", boot.ApprovalSha()));
            else if (phase == Phase::SnapshotAck && root->Exists(L"signed-snapshot.grant"))
                SnapshotSignedFixture(SignedGrant(L"signed-snapshot.grant", "snapshot", boot.ApprovalSha()));
            else if (phase == Phase::FixtureAck && role == "stage" && root->Exists(L"signed-stage-variants.grant"))
                StageSignedVariants(SignedGrant(L"signed-stage-variants.grant", "stage-variants", probe::Sha256(boot.ApprovalSha() + ":" + baseline_sha)));
            return;
        }
        if (phase == Phase::InspectAck && root->Exists(L"native.ack")) Inspect(ReadAck(L"native.ack", "inspect-empty", probe::Sha256("native-handshake:" + binding.challenge)));
        else if (phase == Phase::FixtureAck && root->Exists(L"fixture.ack")) CreateFixture(ReadAck(L"fixture.ack", "create-fixture", boot.ApprovalSha()));
        // No transition to SnapshotAck exists while the destination writer is unverified.
        else if (phase == Phase::SnapshotAck && root->Exists(L"snapshot.ack")) Save(ReadAck(L"snapshot.ack", "snapshot", boot.ApprovalSha()));
    }
    void Refuse(const std::string& reason) noexcept {
        phase = Phase::Terminal;
        try { Receipt(signed_fixture ? L"signed-refusal.json" : L"refusal.json", "\"status\":\"refused_or_unknown\",\"reason\":" + probe::Json(reason) + ",\"fixtureMutationMayHaveOccurred\":" + Bool(mutation_dispatched) + ",\"replayAllowed\":false"); } catch (...) { /* no retry or dialog */ }
    }
};
// Process-lifetime state; AE unload never runs work. The hook becomes inert at Terminal.
State* g_state = nullptr;
A_Err Idle(AEGP_GlobalRefcon, AEGP_IdleRefcon refcon, A_long* max_sleep) {
    auto s = reinterpret_cast<State*>(refcon); if (max_sleep) *max_sleep = 60;
    try { s->Tick(); } catch (const std::exception& e) { s->Refuse(e.what()); } catch (...) { s->Refuse("unknown_native_exception"); }
    return A_Err_NONE;
}
} // namespace

extern "C" __declspec(dllexport) A_Err EntryPointFunc(SPBasicSuite* basic, A_long major, A_long minor, AEGP_PluginID plugin_id, AEGP_GlobalRefcon* global) {
    if (global) *global = nullptr;
    // No env => no acquisition, hook registration, filesystem activity or project read.
    try {
        auto root_path = Env(L"AE_AGENT_NATIVE_PROBE_ROOT"), nonce_w = Env(L"AE_AGENT_NATIVE_PROBE_NONCE");
        if (root_path.empty() || nonce_w.empty()) return A_Err_NONE;
        auto state = std::make_unique<State>(); state->binding.nonce = probe::Utf8(nonce_w);
        Need(probe::LowerHex(state->binding.nonce, 32), "invalid_boot_nonce");
        auto executable = probe::ModulePath(nullptr); Need(_wcsicmp(executable.substr(executable.find_last_of(L'\\') + 1).c_str(), L"AfterFX.exe") == 0, "wrong_host_executable");
        state->root = std::make_unique<probe::OwnedRoot>(root_path, state->binding.nonce);
        HMODULE module = nullptr; Need(GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, reinterpret_cast<LPCWSTR>(&EntryPointFunc), &module) != 0, "own_module_handle");
        state->plugin_path = probe::Utf8(probe::ModulePath(module)); state->binding.build_sha = probe::FileHash(probe::Wide(state->plugin_path));
        auto manifest = probe::ParseFields(state->root->Read(L"launch.manifest"));
        state->signed_fixture = manifest.at("protocol") == "2";
        if (state->signed_fixture) {
            probe::ExactKeys(manifest, {"protocol", "nonce", "plugin_path", "plugin_sha256", "root_path", "stage_id", "role", "fixture",
                "executable_path", "executable_sha256", "source_root", "baseline_sha256", "expires_unix_ms", "mac"});
            state->session_key = probe::Utf8(Env(L"AE_AGENT_NATIVE_FIXTURE_KEY"));
            Need(probe::LowerHex(state->session_key, 64), "child_session_key_required");
            SetEnvironmentVariableW(L"AE_AGENT_NATIVE_FIXTURE_KEY", nullptr); // retain only in this state
            probe::VerifySignedFields(manifest, state->session_key);
            const auto expiry = probe::Decimal(manifest.at("expires_unix_ms")), now = probe::NowMs();
            Need(expiry > now && expiry - now <= 300000, "signed_launch_expired");
            Need(manifest.at("executable_path") == probe::Utf8(executable) && manifest.at("executable_sha256") == probe::FileHash(executable), "signed_host_image_mismatch");
            state->stage_id = manifest.at("stage_id"); state->role = manifest.at("role"); state->fixture_kind = manifest.at("fixture");
            state->source_root_path = manifest.at("source_root"); state->baseline_sha = manifest.at("baseline_sha256");
            Need(probe::LowerHex(state->stage_id, 32) && (state->role == "capture" || state->role == "stage") &&
                (state->fixture_kind == "saved-clean" || state->fixture_kind == "saved-dirty" || state->fixture_kind == "untitled-dirty") &&
                probe::LowerHex(state->baseline_sha, 64), "signed_launch_scope");
            if (state->role == "capture") Need(state->source_root_path == probe::Utf8(state->root->path()) &&
                state->baseline_sha == std::string(64, '0'), "capture_launch_source");
            else {
                const auto source_path = probe::Canonical(probe::Wide(state->source_root_path));
                const auto leaf = source_path.substr(source_path.find_last_of(L'\\') + 1);
                Need(leaf.size() == 38 && leaf.substr(0, 6) == L"probe-" && source_path != state->root->path(), "stage_source_owned_leaf");
                state->source_root = std::make_unique<probe::OwnedRoot>(source_path, probe::Utf8(leaf.substr(6)));
                Need(state->root->Hash(L"baseline.aep") == state->baseline_sha && state->source_root->Hash(L"baseline.aep") == state->baseline_sha, "stage_baseline_binding_mismatch");
            }
        } else probe::ExactKeys(manifest, {"protocol", "nonce", "plugin_path", "plugin_sha256", "root_path"});
        Need((manifest.at("protocol") == "1" || state->signed_fixture) && manifest.at("nonce") == state->binding.nonce && manifest.at("plugin_path") == state->plugin_path && manifest.at("plugin_sha256") == state->binding.build_sha && manifest.at("root_path") == probe::Utf8(state->root->path()), "launch_manifest_binding_mismatch");
        state->binding.challenge = probe::RandomToken(); state->binding.pid = GetCurrentProcessId(); state->binding.process_created_ms = ProcessCreated(); state->binding.root_path = probe::Utf8(state->root->path());
        state->plugin_id = plugin_id; state->driver_major = major; state->driver_minor = minor; state->deadline = probe::NowMs() + 1800000;
        state->root->Claim("{" + state->Base() + ",\"status\":\"exclusive_native_owner\"}\n");
        state->suites.basic = basic;
        try { state->suites.Required(); }
        catch (const std::exception& e) { state->Refuse(e.what()); return A_Err_NONE; }
        if (!state->signed_fixture) state->Receipt(L"handshake.json", "\"status\":\"native_identity_waiting_ack_no_project_actions\",\"driverMajor\":" + Number(major) + ",\"driverMinor\":" + Number(minor) + ",\"rootPath\":" + probe::Json(state->binding.root_path) + ",\"inspectApprovalSha256\":" + probe::Json(probe::Sha256("native-handshake:" + state->binding.challenge)) + ",\"suites\":{\"ProjSuite6\":9,\"CompSuite12\":26,\"MemorySuite1\":1,\"RegisterSuite5\":6,\"ItemSuite9\":14,\"LayerSuite9\":15,\"FootageSuite5\":11,\"UtilitySuite6\":13,\"CollectionSuite2\":2}");
        AE(state->suites.registration->AEGP_RegisterIdleHook(plugin_id, Idle, reinterpret_cast<AEGP_IdleRefcon>(state.get())), "RegisterIdleHook");
        g_state = state.release(); if (global) *global = reinterpret_cast<AEGP_GlobalRefcon>(g_state);
    } catch (...) { /* fail closed before registration; never display host dialogs */ }
    return A_Err_NONE;
}
