#pragma once
#include <cstdint>
#include <string>

namespace local_session::ame_observer {
// Fixed passive diagnostics, not a job/settings issuer. This same bounded
// property reader can be used only inside an original-created helper later.
// A caller-provided HANDLE or serialized report never creates a native cap.
constexpr std::uint32_t kWindowLimit=8,kElementLimit=256,kDepthLimit=6;
constexpr std::uint32_t kPropertyTextLimit=512,kTotalTextLimit=65536;
constexpr std::uint64_t kDiagnosticDeadlineMs=8000;
constexpr wchar_t kAmeImage[]=L"C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe";
constexpr wchar_t kDxvModule[]=L"C:\\Program Files\\Adobe\\Common\\Plug-ins\\7.0\\MediaCore\\Resolume DXV\\DXV3MediaCoreExport.prm";
struct PassiveResult final {std::string json;bool complete=false;};
enum class PassiveView : std::uint8_t {Control=1,Raw=2};
// This routine performs only diagnostic candidate lookup and actual property
// reads. All potentially blocking provider calls are in the helper process,
// which the parent must retain on UNKNOWN; the elapsed checks cannot interrupt
// a COM call. No activation/invoke/selection/value-set or job creation exists.
PassiveResult CapturePassiveFeasibilityFixed(PassiveView view);
}
