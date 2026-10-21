#pragma once
#include <array>
#include <cstdint>

namespace local_session::trusted_read::observed_timing {
// Frozen FullObservedRootRangeV1 + QuartileFramesV1 arithmetic only. Root/target
// identity, native observations, C1 ordering and packet issuance belong to the
// caller. This helper cannot parse JSON, attest observations or issue authority.
constexpr std::uint32_t kMinimumObservedRootFramesV1 = 4;
// Frozen 1 MiB packet profile: floor((1048576 - 128 envelope) / 128 span)
// gives 8191. This is a ceiling only; packet IO/ownership is not implemented here.
constexpr std::uint32_t kMaximumObservedRootFramesV1 = 8191;
struct ObservedTimingInput final {
    std::uint64_t frameRateBits = 0;
    std::uint64_t frameDurationBits = 0;
    std::uint64_t durationBits = 0;
    std::uint64_t displayStartTimeBits = 0;
    bool hasDisplayStartFrame = false;
    std::int32_t displayStartFrame = 0;
};
enum class DisplayStartEvidenceV1 : std::uint8_t {
    None = 0,
    ObservedSigned32Getter = 1,
    DerivedFromPositiveZeroTime = 2
};
struct ResolvedObservedRootTimingV1 final {
    bool supported = false;
    std::uint32_t frameCount = 0;
    std::uint32_t rateNumerator = 0;
    std::uint32_t rateDenominator = 0;
    std::array<std::uint32_t, 3> alphaIndices{};
    ObservedTimingInput observed{};
    std::int32_t resolvedDisplayStartFrame = 0;
    DisplayStartEvidenceV1 displayStartEvidence = DisplayStartEvidenceV1::None;
};
namespace detail {
struct ApprovedTimingPairV1 final {
    std::uint64_t frameRateBits, frameDurationBits;
    std::uint32_t numerator, denominator;
};
inline constexpr std::array<ApprovedTimingPairV1, 10> kApprovedTimingPairsV1{{
    {0x4038000000000000ULL,0x3fa5555555555555ULL,24,1},
    {0x4039000000000000ULL,0x3fa47ae147ae147bULL,25,1},
    {0x403e000000000000ULL,0x3fa1111111111111ULL,30,1},
    {0x4049000000000000ULL,0x3f947ae147ae147bULL,50,1},
    {0x404e000000000000ULL,0x3f91111111111111ULL,60,1},
    {0x4037f9dcb5112287ULL,0x3fa55acb6f46508eULL,24000,1001},
    {0x403df853e2556b28ULL,0x3fa1156f8c384072ULL,30000,1001},
    {0x404df853e2556b28ULL,0x3f91156f8c384072ULL,60000,1001},
    {0x403df853e2556b27ULL,0x3fa1156f8c384072ULL,30000,1001},
    {0x404df853e2556b27ULL,0x3f91156f8c384072ULL,60000,1001}
}};
struct TwoLimbProductV1 final { std::uint64_t low = 0, high = 0; };
inline TwoLimbProductV1 MultiplyMantissaV1(std::uint64_t mantissa, std::uint32_t factor) noexcept {
    // mantissa <= 2^53-1 and factor <= 2^32-1. Each multiplication fits
    // uint64; the resulting <=85-bit integer retains every product bit.
    const auto lowProduct = (mantissa & 0xffffffffULL) * factor;
    const auto highProduct = (mantissa >> 32) * factor;
    const auto low = lowProduct + (highProduct << 32);
    return {low,(highProduct >> 32) + (low < lowProduct ? 1ULL : 0ULL)};
}
inline unsigned BitLengthV1(std::uint64_t value) noexcept {
    unsigned count = 0;
    while (value) { ++count; value >>= 1; }
    return count;
}
inline bool RoundPositiveProductV1(std::uint64_t positiveNormalBits, std::uint32_t factor, std::uint64_t& out) noexcept {
    // Exact dyadic product followed by a single round-to-nearest/ties-to-even.
    // No host floating-point operations, epsilon or intermediate double.
    const auto exponentField = static_cast<unsigned>((positiveNormalBits >> 52) & 0x7ffULL);
    if ((positiveNormalBits >> 63) || exponentField == 0 || exponentField == 0x7ff) return false;
    if (!factor) { out = 0; return true; }
    const auto mantissa = (positiveNormalBits & 0x000fffffffffffffULL) | 0x0010000000000000ULL;
    const auto product = MultiplyMantissaV1(mantissa,factor);
    const unsigned length = product.high ? 64 + BitLengthV1(product.high) : BitLengthV1(product.low);
    if (!length || length > 85) return false;
    int exponent = static_cast<int>(exponentField) - 1023 - 52 + static_cast<int>(length) - 1;
    std::uint64_t rounded = 0;
    if (length <= 53) {
        rounded = product.low << (53 - length);
    } else {
        // length<=85, so shift is in [1,32]. Low limb contains all discarded
        // bits; high limb contributes to the retained 53-bit significand.
        const unsigned shift = length - 53;
        rounded = (product.low >> shift) | (product.high << (64 - shift));
        const auto discarded = product.low & ((1ULL << shift) - 1);
        const auto halfway = 1ULL << (shift - 1);
        if (discarded > halfway || (discarded == halfway && (rounded & 1ULL))) ++rounded;
        if (rounded == 0x0020000000000000ULL) { rounded >>= 1; ++exponent; }
    }
    // Approved durations and bounded integer factors always remain normal.
    // Keep this internal arithmetic fail-closed for other/overflowing inputs.
    if (exponent < -1022 || exponent > 1023 || rounded < 0x0010000000000000ULL || rounded >= 0x0020000000000000ULL) return false;
    out = (static_cast<std::uint64_t>(exponent + 1023) << 52) | (rounded & 0x000fffffffffffffULL);
    return true;
}
inline bool RoundSignedProductV1(std::uint64_t durationBits, std::int32_t factor, std::uint64_t& out) noexcept {
    const bool negative = factor < 0;
    // int32 minimum is representable after widening; do not negate int32.
    const auto magnitude = static_cast<std::uint32_t>(negative ? -static_cast<std::int64_t>(factor) : factor);
    std::uint64_t value = 0;
    if (!RoundPositiveProductV1(durationBits,magnitude,value)) return false;
    out = value | (negative ? 0x8000000000000000ULL : 0ULL);
    return true;
}
} // namespace detail

inline ResolvedObservedRootTimingV1 ResolveObservedRootTimingV1(const ObservedTimingInput& input) noexcept {
    const detail::ApprovedTimingPairV1* pair = nullptr;
    for (const auto& approved : detail::kApprovedTimingPairsV1) {
        if (input.frameRateBits == approved.frameRateBits && input.frameDurationBits == approved.frameDurationBits) { pair = &approved; break; }
    }
    if (!pair || (input.durationBits >> 63) || !(input.durationBits & 0x7fffffffffffffffULL) ||
        ((input.durationBits >> 52) & 0x7ffULL) == 0x7ffULL) return {};
    std::uint64_t expectedStart = 0;
    DisplayStartEvidenceV1 startEvidence = DisplayStartEvidenceV1::None;
    if (input.hasDisplayStartFrame) {
        if (!detail::RoundSignedProductV1(pair->frameDurationBits,input.displayStartFrame,expectedStart) || expectedStart != input.displayStartTimeBits) return {};
        startEvidence = DisplayStartEvidenceV1::ObservedSigned32Getter;
    } else {
        // Only observed +0 permits S=0 without the optional signed32 getter.
        // The stored value in an absent getter is ignored, never claimed actual.
        if (input.displayStartTimeBits != 0) return {};
        startEvidence = DisplayStartEvidenceV1::DerivedFromPositiveZeroTime;
    }
    std::uint32_t found = 0;
    for (std::uint32_t n = kMinimumObservedRootFramesV1; n <= kMaximumObservedRootFramesV1; ++n) {
        std::uint64_t canonical = 0;
        if (!detail::RoundPositiveProductV1(pair->frameDurationBits,n,canonical)) return {};
        if (canonical == input.durationBits) {
            if (found) return {}; // exact canonical match must be unique
            found = n;
        }
    }
    if (!found) return {};
    ResolvedObservedRootTimingV1 result;
    result.frameCount = found;
    result.rateNumerator = pair->numerator;
    result.rateDenominator = pair->denominator;
    result.alphaIndices = {found/4,found/2,(3*found)/4};
    if (!(result.alphaIndices[0] < result.alphaIndices[1] && result.alphaIndices[1] < result.alphaIndices[2] && result.alphaIndices[2] < found)) return {};
    result.observed = input;
    result.resolvedDisplayStartFrame = input.hasDisplayStartFrame ? input.displayStartFrame : 0;
    result.displayStartEvidence = startEvidence;
    result.supported = true;
    return result;
}
} // namespace local_session::trusted_read::observed_timing
