#pragma once
#include "fixture_program.h"

namespace probe {
// Fixed compiled experiment contract; not a caller-selectable dirty override.
inline constexpr const char* OwnedFixtureReopenContract = "ae-agent.native-owned-fixture-reopen.v1";
inline constexpr const char* OwnedFixtureReadbackSchema = "ae-agent.native-owned-fixture-readback.v1";
inline constexpr const char* FixedFixtureEvidenceSchema = "ae-agent.native-fixed-fixture-evidence.v1";
inline void RequireFixedFixtureEvidence(const Fields& e, const std::string& kind, unsigned variant,
    const std::string& source_root, const std::string& media_sha, const std::string& proxy_sha) {
    ExactKeys(e, {"sentinel", "variant", "media_path", "proxy_path", "use_proxy", "main_name", "nested_name", "root_comp_count",
        "item_count", "nested_layer_count", "main_layer_count", "title_01_text", "title_02_text", "title_01_enabled", "title_02_enabled",
        "sentinel_enabled", "nested_enabled", "image_enabled", "main_id", "nested_id", "media_id", "folder_id", "nested_source_id", "image_source_id"});
    const auto need = [](bool ok, const char* reason) { if (!ok) throw Failure(reason); };
    need(variant <= 2 && (kind == "saved-clean" || kind == "saved-dirty" || kind == "untitled-dirty"), "fixture_fixed_scope_required");
    need(e.at("sentinel") == fixture_program::Sentinel(kind) && e.at("variant") == std::to_string(variant) &&
        e.at("main_name") == "Main" && e.at("nested_name") == "AEAgent Fixture Nested" && e.at("root_comp_count") == "1" &&
        e.at("item_count") == "4" && e.at("nested_layer_count") == "3" && e.at("main_layer_count") == "2", "fixture_fixed_graph_required");
    need(e.at("title_01_text") == "Fixture title 01" && e.at("title_02_text") == "Fixture title 02" &&
        e.at("title_01_enabled") == (variant != 2 ? "1" : "0") && e.at("title_02_enabled") == (variant == 2 ? "1" : "0") &&
        e.at("sentinel_enabled") == "1" && e.at("nested_enabled") == "1" && e.at("image_enabled") == "1", "fixture_fixed_text_visibility_required");
    std::set<std::uint64_t> ids;
    for (const auto& key : {"main_id", "nested_id", "media_id", "folder_id"}) {
        const auto id = Decimal(e.at(key)); need(id > 0 && ids.insert(id).second, "fixture_fixed_item_ids_required");
    }
    need(e.at("nested_source_id") == e.at("nested_id") && e.at("image_source_id") == e.at("media_id"), "fixture_fixed_links_required");
    need(e.at("media_path") == source_root + "\\fixture.bmp" && e.at("proxy_path") == source_root + "\\proxy.bmp" &&
        e.at("use_proxy") == "1", "fixture_fixed_media_proxy_paths_required");
    need(media_sha == Sha256(fixture_program::Bitmap(false)) && proxy_sha == Sha256(fixture_program::Bitmap(true)), "fixture_media_bytes_changed");
}
inline std::string FixedFixtureEvidenceJson(const std::string& evidence, const std::string& media_sha, const std::string& proxy_sha) {
    return "{\"schema\":" + Json(FixedFixtureEvidenceSchema) + ",\"inspection\":\"compiled-read-only-fixed-fixture\",\"fields\":" +
        Json(evidence) + ",\"mediaSha256\":" + Json(media_sha) + ",\"proxySha256\":" + Json(proxy_sha) + ",\"verified\":true}";
}
} // namespace probe
