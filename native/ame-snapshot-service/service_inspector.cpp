#include "service_inspector.h"
#include "service_crypto.h"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <limits>
#include <locale>
#include <map>
#include <set>
#include <sstream>

namespace ame_service {
namespace {
constexpr auto max_items = kMaxInspectItems, max_layers = kMaxInspectLayers, max_graph = kMaxInspectGraphBytes;
void AE(A_Err error) { Require(error == A_Err_NONE, "native_read_failed"); }
template<typename T> std::string Number(T value) {
    if constexpr (std::is_floating_point_v<T>) {
        Require(std::isfinite(value), "host_nonfinite_number");
        std::ostringstream out; out.imbue(std::locale::classic()); out << std::setprecision(std::numeric_limits<T>::max_digits10) << value; return out.str();
    } else return std::to_string(value);
}
std::string Time(const A_Time& t) { Require(t.scale > 0, "host_time_scale_invalid"); return "{\"value\":" + Number(t.value) + ",\"scale\":" + Number(t.scale) + "}"; }
std::string Bool(A_Boolean value) { return value ? "true" : "false"; }
struct Suites {
    SPBasicSuite* basic;
    const AEGP_ProjSuite6* project = nullptr;
    const AEGP_MemorySuite1* memory = nullptr;
    const AEGP_ItemSuite9* item = nullptr;
    const AEGP_CompSuite12* comp = nullptr;
    const AEGP_LayerSuite9* layer = nullptr;
    const AEGP_FootageSuite5* footage = nullptr;
    const AEGP_UtilitySuite6* utility = nullptr;
    const AEGP_StreamSuite5* stream = nullptr;
    const AEGP_TextDocumentSuite1* text = nullptr;
    std::vector<std::pair<const char*, A_long>> acquired;
    explicit Suites(SPBasicSuite* b) : basic(b) {}
    template<typename T> void Get(const char* name, A_long version, const T*& destination) {
        const void* result = nullptr;
        Require(basic && basic->AcquireSuite(name, version, &result) == kSPNoError && result, "inspection_suite_unavailable_no_fallback");
        try { acquired.emplace_back(name, version); }
        catch (...) { basic->ReleaseSuite(name, version); throw; }
        destination = static_cast<const T*>(result);
    }
    void Acquire() {
        Get(kAEGPProjSuite, kAEGPProjSuiteVersion6, project); Get(kAEGPMemorySuite, kAEGPMemorySuiteVersion1, memory);
        Get(kAEGPItemSuite, kAEGPItemSuiteVersion9, item); Get(kAEGPCompSuite, kAEGPCompSuiteVersion12, comp);
        Get(kAEGPLayerSuite, kAEGPLayerSuiteVersion9, layer); Get(kAEGPFootageSuite, kAEGPFootageSuiteVersion5, footage);
        Get(kAEGPUtilitySuite, kAEGPUtilitySuiteVersion6, utility); Get(kAEGPStreamSuite, kAEGPStreamSuiteVersion5, stream);
        Get(kAEGPTextDocumentSuite, kAEGPTextDocumentSuiteVersion1, text);
    }
    ~Suites() { for (auto i = acquired.rbegin(); i != acquired.rend(); ++i) basic->ReleaseSuite(i->first, i->second); }
};
struct Memory {
    const AEGP_MemorySuite1* suite;
    AEGP_MemHandle handle = nullptr;
    explicit Memory(const AEGP_MemorySuite1* value) : suite(value) {}
    ~Memory() { if (handle) suite->AEGP_FreeMemHandle(handle); }
    std::string Text(bool utf16) {
        if (!handle) return {};
        AEGP_MemSize size = 0; AE(suite->AEGP_GetMemHandleSize(handle, &size));
        Require(size > 0 && size <= 16384 && (!utf16 || size % 2 == 0), "inspection_string_limit");
        void* pointer = nullptr; AE(suite->AEGP_LockMemHandle(handle, &pointer));
        std::string out;
        try {
            Require(pointer != nullptr, "host_string_null");
            if (utf16) {
                const auto data = static_cast<const wchar_t*>(pointer); const auto bound = size / sizeof(wchar_t);
                std::size_t count = 0; while (count < bound && data[count]) ++count;
                Require(count < bound, "host_string_unterminated"); out = Utf8({data, count});
            } else {
                const auto data = static_cast<const char*>(pointer); std::size_t count = 0; while (count < size && data[count]) ++count;
                Require(count < size, "host_string_unterminated"); out.assign(data, count);
            }
        } catch (...) { suite->AEGP_UnlockMemHandle(handle); throw; }
        AE(suite->AEGP_UnlockMemHandle(handle)); return out;
    }
};
struct Reader {
    Suites& s; AEGP_PluginID plugin;
    const std::atomic<bool>* canceled;
    void Fresh(const VerifiedInspectTicket& ticket) {
        RequireInspectionFresh(ticket, NowMs(), canceled);
    }
    std::string Revision() {
        // Fixed compile-time read only. No request data can enter this script.
        constexpr const char* script = "(function(){if(!app.project||typeof app.project.revision!=='number')throw Error('revision unavailable');return String(app.project.revision);})()";
        A_Boolean available = FALSE; AE(s.utility->AEGP_IsScriptingAvailable(&available)); Require(available, "revision_read_unavailable");
        Memory result(s.memory), error(s.memory); AE(s.utility->AEGP_ExecuteScript(plugin, script, FALSE, &result.handle, &error.handle));
        Require(error.Text(false).empty(), "revision_read_failed"); const auto revision = result.Text(false);
        (void)CanonicalUnsigned(revision, true); return revision;
    }
    A_long Id(AEGP_ItemH item) { if (!item) return 0; A_long id = 0; AE(s.item->AEGP_GetItemID(item, &id)); Require(id > 0, "item_id_invalid"); return id; }
    std::string Name(AEGP_ItemH item, bool comment) {
        Memory text(s.memory); if (comment) AE(s.item->AEGP_GetItemComment(item, &text.handle)); else AE(s.item->AEGP_GetItemName(plugin, item, &text.handle)); return text.Text(true);
    }
    std::string Footage(AEGP_FootageH footage) {
        Require(footage != nullptr, "footage_handle_missing"); AEGP_FootageSignature signature = 0; A_long count = 0, per_frame = 0;
        AE(s.footage->AEGP_GetFootageSignature(footage, &signature)); AE(s.footage->AEGP_GetFootageNumFiles(footage, &count, &per_frame));
        // Every external file is enumerated; unsupported generated footage and
        // sequence/auxiliary expansion fail rather than claiming completeness.
        Require(count >= 0 && count <= 64 && per_frame >= 0 && per_frame <= 8 &&
            (count == 0 ? per_frame == 0 : per_frame > 0), "footage_coverage_limit");
        std::string out = "{\"signature\":" + Number(signature) + ",\"filesPerFrame\":" + Number(per_frame) + ",\"files\":[";
        for (A_long frame = 0; frame < count; ++frame) for (A_long file = 0; file < per_frame; ++file) {
            Require(static_cast<std::size_t>(count) * per_frame <= 64, "footage_coverage_limit");
            Memory path(s.memory); AE(s.footage->AEGP_GetFootagePath(footage, frame, file, &path.handle));
            if (frame || file) out += ','; out += Json(path.Text(true));
        }
        return out + "]}";
    }
    std::string LayerText(AEGP_LayerH layer, const A_Time& time) {
        A_Boolean legal = FALSE; AE(s.stream->AEGP_IsStreamLegal(layer, AEGP_LayerStream_SOURCE_TEXT, &legal));
        if (!legal) return "null";
        AEGP_StreamRefH stream = nullptr; AE(s.stream->AEGP_GetNewLayerStream(plugin, layer, AEGP_LayerStream_SOURCE_TEXT, &stream));
        struct Stream { const AEGP_StreamSuite5* suite; AEGP_StreamRefH handle; ~Stream() { if (handle) suite->AEGP_DisposeStream(handle); } } lease{s.stream, stream};
        AEGP_StreamValue2 value{}; AE(s.stream->AEGP_GetNewStreamValue(plugin, stream, AEGP_LTimeMode_CompTime, &time, TRUE, &value));
        struct Value { const AEGP_StreamSuite5* suite; AEGP_StreamValue2& value; ~Value() { suite->AEGP_DisposeStreamValue(&value); } } owned{s.stream, value};
        Memory text(s.memory); AE(s.text->AEGP_GetNewText(plugin, value.val.text_documentH, &text.handle)); return Json(text.Text(true));
    }
    InspectionSnapshot Read(const VerifiedInspectTicket& ticket) {
        Fresh(ticket); InspectionSnapshot result; A_long projects = 0; AE(s.project->AEGP_GetNumProjects(&projects)); Require(projects == 1, "one_project_required");
        AEGP_ProjectH project = nullptr; AE(s.project->AEGP_GetProjectByIndex(0, &project)); Require(project, "project_handle_missing");
        result.handle_identity = Number(reinterpret_cast<std::uintptr_t>(project));
        Memory path(s.memory); AE(s.project->AEGP_GetProjectPath(project, &path.handle)); result.path = path.Text(true);
        Require(!result.path.empty(), "untitled_project_denied"); Require(result.path == ticket.Claims().expected_path, "saved_project_path_mismatch");
        A_Boolean dirty = FALSE; AE(s.project->AEGP_ProjectIsDirty(project, &dirty)); result.dirty = dirty != FALSE; result.revision = Revision();
        AEGP_ItemH root = nullptr, active = nullptr; AE(s.project->AEGP_GetProjectRootFolder(project, &root)); AE(s.item->AEGP_GetActiveItem(&active));
        AEGP_LayerH active_layer = nullptr; AE(s.layer->AEGP_GetActiveLayer(&active_layer)); AEGP_LayerIDVal active_layer_id = 0;
        if (active_layer) AE(s.layer->AEGP_GetLayerID(active_layer, &active_layer_id));
        std::map<A_long, std::string> nodes; std::set<AEGP_ItemH> seen; std::set<A_long> ids; std::vector<A_long> links; std::size_t layers = 0;
        AEGP_ItemH item = nullptr; AE(s.item->AEGP_GetFirstProjItem(project, &item));
        while (item) {
            Fresh(ticket); Require(seen.insert(item).second && seen.size() <= max_items + 1, "inspection_item_limit_or_cycle");
            if (item != root) {
                const auto id = Id(item); Require(ids.insert(id).second, "duplicate_item_id");
                RequireInspectionItemCount(ids.size());
                AEGP_ItemType type = AEGP_ItemType_NONE; AEGP_ItemFlags flags = 0; A_Boolean selected = FALSE; AEGP_ItemH parent = nullptr;
                AE(s.item->AEGP_GetItemType(item, &type)); Require(type == AEGP_ItemType_FOLDER || type == AEGP_ItemType_COMP || type == AEGP_ItemType_FOOTAGE, "inspection_item_type_uncovered");
                AE(s.item->AEGP_GetItemFlags(item, &flags)); AE(s.item->AEGP_IsItemSelected(item, &selected)); AE(s.item->AEGP_GetItemParentFolder(item, &parent));
                const auto parent_id = parent == root ? 0 : Id(parent); if (parent_id) links.push_back(parent_id);
                std::string node = "{\"id\":" + Number(id) + ",\"type\":" + Number(type) + ",\"name\":" + Json(Name(item, false)) +
                    ",\"comment\":" + Json(Name(item, true)) + ",\"parentId\":" + Number(parent_id) + ",\"flags\":" + Number(flags) + ",\"selected\":" + Bool(selected);
                if (type != AEGP_ItemType_FOLDER) {
                    A_long width = 0, height = 0; A_Time duration{}, time{}; AEGP_ItemViewP view = nullptr;
                    AE(s.item->AEGP_GetItemDimensions(item, &width, &height)); AE(s.item->AEGP_GetItemDuration(item, &duration)); AE(s.item->AEGP_GetItemCurrentTime(item, &time)); AE(s.item->AEGP_GetItemMRUView(item, &view));
                    node += ",\"width\":" + Number(width) + ",\"height\":" + Number(height) + ",\"duration\":" + Time(duration) + ",\"time\":" + Time(time) + ",\"viewHandle\":" + Json(Number(reinterpret_cast<std::uintptr_t>(view)));
                }
                if (type == AEGP_ItemType_FOOTAGE) { AEGP_FootageH main = nullptr; AE(s.footage->AEGP_GetMainFootageFromItem(item, &main)); node += ",\"mainFootage\":" + Footage(main); }
                if (flags & AEGP_ItemFlag_HAS_PROXY) { AEGP_FootageH proxy = nullptr; AE(s.footage->AEGP_GetProxyFootageFromItem(item, &proxy)); node += ",\"proxyFootage\":" + Footage(proxy); }
                if (type == AEGP_ItemType_COMP) {
                    AEGP_CompH comp = nullptr; AE(s.comp->AEGP_GetCompFromItem(item, &comp)); A_long count = 0; AE(s.layer->AEGP_GetCompNumLayers(comp, &count));
                    Require(count >= 0 && static_cast<std::size_t>(count) + layers <= max_layers, "inspection_layer_limit"); layers += count;
                    A_FpLong rate = 0; A_Time start{}, duration{}, display{}; AEGP_CompFlags comp_flags = 0; AEGP_DownsampleFactor downsample{};
                    AE(s.comp->AEGP_GetCompFramerate(comp, &rate)); AE(s.comp->AEGP_GetCompWorkAreaStart(comp, &start)); AE(s.comp->AEGP_GetCompWorkAreaDuration(comp, &duration));
                    AE(s.comp->AEGP_GetCompDisplayStartTime(comp, &display)); AE(s.comp->AEGP_GetCompFlags(comp, &comp_flags)); AE(s.comp->AEGP_GetCompDownsampleFactor(comp, &downsample));
                    node += ",\"compFlags\":" + Number(comp_flags) + ",\"framerate\":" + Number(rate) + ",\"workStart\":" + Time(start) + ",\"workDuration\":" + Time(duration) +
                        ",\"displayStart\":" + Time(display) + ",\"downsampleX\":" + Number(downsample.xS) + ",\"downsampleY\":" + Number(downsample.yS) + ",\"layers\":[";
                    for (A_long i = 0; i < count; ++i) {
                        Fresh(ticket); AEGP_LayerH layer = nullptr; AE(s.layer->AEGP_GetCompLayerByIndex(comp, i, &layer)); AEGP_ItemH source = nullptr; AEGP_LayerIDVal layer_id = 0;
                        AEGP_LayerFlags layer_flags = 0; A_Time time{}, in{}, length{}; A_Boolean video = FALSE, audio = FALSE;
                        AE(s.layer->AEGP_GetLayerID(layer, &layer_id)); AE(s.layer->AEGP_GetLayerSourceItem(layer, &source)); AE(s.layer->AEGP_GetLayerFlags(layer, &layer_flags));
                        AE(s.layer->AEGP_GetLayerCurrentTime(layer, AEGP_LTimeMode_CompTime, &time)); AE(s.layer->AEGP_GetLayerInPoint(layer, AEGP_LTimeMode_CompTime, &in)); AE(s.layer->AEGP_GetLayerDuration(layer, AEGP_LTimeMode_CompTime, &length));
                        AE(s.layer->AEGP_IsLayerVideoReallyOn(layer, &video)); AE(s.layer->AEGP_IsLayerAudioReallyOn(layer, &audio));
                        Memory name(s.memory); AE(s.layer->AEGP_GetLayerName(plugin, layer, &name.handle, nullptr)); const auto source_id = Id(source); if (source_id) links.push_back(source_id);
                        if (i) node += ',';
                        node += "{\"id\":" + Number(layer_id) + ",\"index\":" + Number(i) + ",\"name\":" + Json(name.Text(true)) + ",\"sourceId\":" + Number(source_id) + ",\"flags\":" + Number(layer_flags) +
                            ",\"videoReallyOn\":" + Bool(video) + ",\"audioReallyOn\":" + Bool(audio) + ",\"time\":" + Time(time) + ",\"inPoint\":" + Time(in) + ",\"duration\":" + Time(length) + ",\"sourceTextAtCurrentTime\":" + LayerText(layer, time) + "}";
                        Require(node.size() <= max_graph, "inspection_graph_limit");
                    }
                    node += ']';
                }
                node += '}'; nodes.emplace(id, std::move(node));
            }
            AEGP_ItemH next = nullptr; AE(s.item->AEGP_GetNextProjItem(project, item, &next)); item = next;
        }
        for (const auto link : links) Require(ids.count(link) != 0, "inspection_graph_reference_uncovered");
        const auto active_id = active == root ? 0 : Id(active); Require(active_id == 0 || ids.count(active_id), "active_item_uncovered");
        result.graph_json = "{\"scope\":\"all_project_items_nested_sources_layer_switches_text_at_current_time_footage_proxy_links\",\"activeItemId\":" + Number(active_id) + ",\"activeLayerId\":" + Number(active_layer_id) + ",\"items\":[";
        bool comma = false; for (const auto& node : nodes) { if (comma) result.graph_json += ','; comma = true; result.graph_json += node.second; Require(result.graph_json.size() <= max_graph, "inspection_graph_limit"); }
        result.graph_json += "]}"; Require(result.graph_json.size() <= max_graph, "inspection_graph_limit");
        result.item_count = ids.size(); result.layer_count = layers;
        result.graph_sha256 = Sha256Bytes(result.graph_json); result.complete = true; Fresh(ticket); return result;
    }
};
}
std::string InspectOnMainThread(SPBasicSuite* basic, AEGP_PluginID plugin, unsigned long main_thread, const VerifiedInspectTicket& ticket,
    const std::atomic<bool>* canceled) {
    Require(GetCurrentThreadId() == main_thread, "idle_main_thread_mismatch");
    RequireInspectionFresh(ticket, NowMs(), canceled);
    Suites suites(basic); suites.Acquire(); Reader reader{suites, plugin, canceled};
    const auto before = reader.Read(ticket), after = reader.Read(ticket);
    RequireStableInspection(before, after, ticket); RequireInspectionFresh(ticket, NowMs(), canceled);
    return InspectResponse(ticket, after);
}
} // namespace ame_service
