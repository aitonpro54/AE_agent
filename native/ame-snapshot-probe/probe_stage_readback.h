#pragma once
#include "probe_io.h"
#include "fixture_reopen_contract.h"

namespace probe {
// Facts from the fixed owned-file reopen, not permission to repair a project.
// ProjSuite6 does not promise a clean dirty flag after OpenProjectFromPath.
// The legacy Require stays clean-only. The separately versioned fixed fixture
// guard requires verified semantics and observations instead of claiming clean.
struct StageProjectReadback {
    unsigned variant = 0; // 0 = baseline; 1/2 = fixed variant reopen
    std::uintptr_t opened_handle = 0, observed_handle = 0;
    std::string expected_path, observed_path, expected_file_sha, observed_file_sha;
    std::string expected_baseline_sha, observed_baseline_sha, graph_sha, revision;
    bool dirty = false, file_hash_observed = false, baseline_hash_observed = false;
    bool fixture_evidence_verified = false;
    std::uintptr_t inspected_handle = 0;
    std::string inspected_path;
    bool dirty_after_inspection = false, inspection_observed = false;

    bool HandleMatches() const { return opened_handle != 0 && opened_handle == observed_handle; }
    bool PathMatches() const { return !expected_path.empty() && expected_path == observed_path; }
    bool FileHashMatches() const { return file_hash_observed && LowerHex(expected_file_sha, 64) && expected_file_sha == observed_file_sha; }
    bool BaselineHashMatches() const { return baseline_hash_observed && LowerHex(expected_baseline_sha, 64) && expected_baseline_sha == observed_baseline_sha; }
    // Only the exact owned file may expose fixture facts. This read-only probe
    // does not authorize staging; every guard must still be called afterwards.
    template<typename ReadOnlyEvidence>
    void VerifyFixtureEvidence(ReadOnlyEvidence&& inspect) {
        fixture_evidence_verified = false;
        if (!HandleMatches() || !PathMatches() || !FileHashMatches() || !BaselineHashMatches()) return;
        inspect();
        fixture_evidence_verified = true;
    }
    const char* FailureReason() const {
        const bool baseline = variant == 0;
        if (!HandleMatches()) return baseline ? "stage_baseline_project_handle_mismatch" : "variant_reopen_project_handle_mismatch";
        if (dirty) return baseline ? "stage_baseline_dirty" : "variant_reopen_dirty";
        if (!PathMatches()) return baseline ? "stage_baseline_project_path_mismatch" : "variant_reopen_project_path_mismatch";
        if (!file_hash_observed) return baseline ? "stage_baseline_file_hash_unobserved" : "variant_reopen_output_hash_unobserved";
        if (!FileHashMatches()) return baseline ? "stage_baseline_bytes_changed" : "variant_reopen_output_bytes_changed";
        if (!baseline_hash_observed) return baseline ? "stage_baseline_preservation_hash_unobserved" : "variant_reopen_baseline_hash_unobserved";
        if (!BaselineHashMatches()) return baseline ? "stage_baseline_preservation_failed" : "variant_reopen_baseline_preservation_failed";
        return nullptr;
    }
    void Require() const { if (const auto reason = FailureReason()) throw Failure(reason); }
    const char* OwnedFixtureFailureReason() const {
        const bool baseline = variant == 0;
        if (variant > 2) return "fixture_fixed_variant_required";
        if (!HandleMatches()) return baseline ? "stage_baseline_project_handle_mismatch" : "variant_reopen_project_handle_mismatch";
        if (!PathMatches()) return baseline ? "stage_baseline_project_path_mismatch" : "variant_reopen_project_path_mismatch";
        if (!file_hash_observed) return baseline ? "stage_baseline_file_hash_unobserved" : "variant_reopen_output_hash_unobserved";
        if (!FileHashMatches()) return baseline ? "stage_baseline_bytes_changed" : "variant_reopen_output_bytes_changed";
        if (!baseline_hash_observed) return baseline ? "stage_baseline_preservation_hash_unobserved" : "variant_reopen_baseline_hash_unobserved";
        if (!BaselineHashMatches()) return baseline ? "stage_baseline_preservation_failed" : "variant_reopen_baseline_preservation_failed";
        if (!fixture_evidence_verified) return baseline ? "stage_baseline_fixture_evidence_unverified" : "variant_reopen_fixture_evidence_unverified";
        if (!inspection_observed) return baseline ? "stage_baseline_inspection_unobserved" : "variant_reopen_inspection_unobserved";
        if (inspected_handle != opened_handle || inspected_path != expected_path)
            return baseline ? "stage_baseline_inspection_identity_mismatch" : "variant_reopen_inspection_identity_mismatch";
        if (!LowerHex(graph_sha, 64) || revision.empty()) return "fixture_readback_observations_incomplete";
        (void)Decimal(revision);
        return nullptr;
    }
    void RequireOwnedFixture() const { if (const auto reason = OwnedFixtureFailureReason()) throw Failure(reason); }
    std::string DiagnosticsJson() const { return DiagnosticsJsonFor("ae-agent.native-stage-readback.v1", true, FailureReason()); }
    std::string OwnedFixtureDiagnosticsJson() const { return DiagnosticsJsonFor(OwnedFixtureReadbackSchema, false, OwnedFixtureFailureReason()); }
private:
    std::string DiagnosticsJsonFor(const char* schema, bool clean_required, const char* reason) const {
        const auto boolean = [](bool value) { return value ? "true" : "false"; };
        return "{\"schema\":" + Json(schema) + ",\"operation\":" + Json(variant == 0 ? "open-baseline" : "reopen-variant") +
            ",\"variantIndex\":" + std::to_string(variant) + ",\"readbackCompleted\":true,\"openedProjectHandle\":" + Json(std::to_string(opened_handle)) +
            ",\"observedProjectHandle\":" + Json(std::to_string(observed_handle)) + ",\"projectHandleMatches\":" + boolean(HandleMatches()) +
            ",\"expectedPath\":" + Json(expected_path) + ",\"observedPath\":" + Json(observed_path) + ",\"projectPathMatches\":" + boolean(PathMatches()) +
            ",\"dirty\":" + boolean(dirty) + ",\"cleanRequired\":" + boolean(clean_required) + ",\"expectedFileSha256\":" + Json(expected_file_sha) +
            ",\"fileSha256Observed\":" + (file_hash_observed ? Json(observed_file_sha) : "null") + ",\"fileHashObserved\":" + boolean(file_hash_observed) +
            ",\"fileHashMatches\":" + boolean(FileHashMatches()) + ",\"expectedBaselineSha256\":" + Json(expected_baseline_sha) +
            ",\"baselineSha256Observed\":" + (baseline_hash_observed ? Json(observed_baseline_sha) : "null") + ",\"baselineHashObserved\":" + boolean(baseline_hash_observed) +
            ",\"baselineHashMatches\":" + boolean(BaselineHashMatches()) + ",\"fixtureCanonicalSha256Observed\":" + Json(graph_sha) +
            ",\"extendscriptRevisionObserved\":" + Json(revision) + ",\"fixtureEvidenceVerified\":" + boolean(fixture_evidence_verified) +
            ",\"dirtyAfterOpen\":" + boolean(dirty) + ",\"dirtyAfterReadOnlyInspection\":" + (inspection_observed ? boolean(dirty_after_inspection) : "null") +
            ",\"inspectionObserved\":" + boolean(inspection_observed) + ",\"inspectedProjectHandle\":" + Json(std::to_string(inspected_handle)) +
            ",\"inspectedPath\":" + Json(inspected_path) +
            ",\"failedPredicate\":" + (reason ? Json(reason) : "null") + "}";
    }
};
} // namespace probe
