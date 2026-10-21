#pragma once
// Reviewed compile-bound zero-effect fixture. These are synthetic declarations,
// never production installed-panel pins or actual CEP observation/OS identity.
#include <array>
#include <cstdint>
#include <string_view>
namespace local_session_native_panel_case {
enum class Case : std::uint16_t { DelayedPositive=1, NoGrant=2, ForeignNonce=3,
    ExpiredGrant=4, SecondActor=5, AfterConsumeGuardLoss=6, AfterNoteReplyLoss=7, ExactReplay=8 };
inline constexpr std::uint64_t kSessionMs=900000, kGrantMs=600000, kPositiveMs=65000, kExpiredMs=601000;
inline constexpr std::string_view kBody="{\"args\":{},\"name\":\"ensure_ae_agent_panel\"}";
inline constexpr std::string_view kPanelDefinition="lcp2.synthetic.installed-panel.definition.v1.zero-effects";
inline constexpr std::string_view kActorDefinition="lcp2.synthetic.first-actor.definition.v1.zero-effects";
inline constexpr std::array<std::uint8_t,16> kActorRef{{0x53,0x59,0x4e,0x54,0x48,0x50,0x41,0x4e,0x45,0x4c,0x41,0x43,0x54,0x4f,0x52,0x31}};
}
