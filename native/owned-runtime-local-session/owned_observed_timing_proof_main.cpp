// Isolated source proof for a pure helper; no NativeClient/production factories.
#if !defined(AE_AGENT_PHASE_SYNTHETIC_TIMING_PROOF) || AE_AGENT_PHASE_SYNTHETIC_TIMING_PROOF != 1
#error Explicit synthetic timing proof opt-in required.
#endif
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || defined(AE_AGENT_PRODUCTION_SOURCE_HEADERS) || defined(AE_AGENT_PHASE_PRODUCTION_SOURCE_HEADERS) || defined(PRODUCTION_SOURCE_HEADERS) || defined(AE_AGENT_PHASE_PRODUCTION_TARGET)
#error Production profiles and production source headers are forbidden in the synthetic timing proof main.
#endif
#include "owned_observed_timing.h"
#include <array>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <limits>

namespace {
namespace timing = local_session::trusted_read::observed_timing;
unsigned checks = 0, failures = 0;
void Check(bool value, const char* name) {
    ++checks;
    if (!value) { ++failures; std::cerr << "FAILED: " << name << '\n'; }
}
struct PositiveFixtureV1 final {
    std::uint64_t rate, delta, duration, startTime;
    std::uint32_t frames, numerator, denominator;
    std::int32_t start;
    bool getter;
};
// Literal fixtures computed with the separate Node BigInt oracle, checked by
// rational predecessor/successor rounding cells. No production encoder derives
// these expected literals at C++ proof runtime.
constexpr std::array<PositiveFixtureV1,30> positives{{
// ORACLE_POSITIVE_BEGIN
    {0x4038000000000000ULL,0x3fa5555555555555ULL,0x3fc5555555555555ULL,0x3fe6aaaaaaaaaaaaULL,4,24,1,17,true},
    {0x4038000000000000ULL,0x3fa5555555555555ULL,0x407554aaaaaaaaaaULL,0xbfe6aaaaaaaaaaaaULL,8191,24,1,-17,true},
    {0x4038000000000000ULL,0x3fa5555555555555ULL,0x3fcaaaaaaaaaaaaaULL,0x0000000000000000ULL,5,24,1,123,false},
    {0x4039000000000000ULL,0x3fa47ae147ae147bULL,0x3fc47ae147ae147bULL,0x3fe5c28f5c28f5c3ULL,4,25,1,17,true},
    {0x4039000000000000ULL,0x3fa47ae147ae147bULL,0x40747a3d70a3d70aULL,0xbfe5c28f5c28f5c3ULL,8191,25,1,-17,true},
    {0x4039000000000000ULL,0x3fa47ae147ae147bULL,0x3fc999999999999aULL,0x0000000000000000ULL,5,25,1,123,false},
    {0x403e000000000000ULL,0x3fa1111111111111ULL,0x3fc1111111111111ULL,0x3fe2222222222222ULL,4,30,1,17,true},
    {0x403e000000000000ULL,0x3fa1111111111111ULL,0x4071108888888888ULL,0xbfe2222222222222ULL,8191,30,1,-17,true},
    {0x403e000000000000ULL,0x3fa1111111111111ULL,0x3fc5555555555555ULL,0x0000000000000000ULL,5,30,1,123,false},
    {0x4049000000000000ULL,0x3f947ae147ae147bULL,0x3fb47ae147ae147bULL,0x3fd5c28f5c28f5c3ULL,4,50,1,17,true},
    {0x4049000000000000ULL,0x3f947ae147ae147bULL,0x40647a3d70a3d70aULL,0xbfd5c28f5c28f5c3ULL,8191,50,1,-17,true},
    {0x4049000000000000ULL,0x3f947ae147ae147bULL,0x3fb999999999999aULL,0x0000000000000000ULL,5,50,1,123,false},
    {0x404e000000000000ULL,0x3f91111111111111ULL,0x3fb1111111111111ULL,0x3fd2222222222222ULL,4,60,1,17,true},
    {0x404e000000000000ULL,0x3f91111111111111ULL,0x4061108888888888ULL,0xbfd2222222222222ULL,8191,60,1,-17,true},
    {0x404e000000000000ULL,0x3f91111111111111ULL,0x3fb5555555555555ULL,0x0000000000000000ULL,5,60,1,123,false},
    {0x4037f9dcb5112287ULL,0x3fa55acb6f46508eULL,0x3fc55acb6f46508eULL,0x3fe6b078263ab597ULL,4,24000,1001,17,true},
    {0x4037f9dcb5112287ULL,0x3fa55acb6f46508eULL,0x40755a2098ead65bULL,0xbfe6b078263ab597ULL,8191,24000,1001,-17,true},
    {0x4037f9dcb5112287ULL,0x3fa55acb6f46508eULL,0x3fcab17e4b17e4b2ULL,0x0000000000000000ULL,5,24000,1001,123,false},
    {0x403df853e2556b28ULL,0x3fa1156f8c384072ULL,0x3fc1156f8c384072ULL,0x3fe226c684fbc479ULL,4,30000,1001,17,true},
    {0x403df853e2556b28ULL,0x3fa1156f8c384072ULL,0x407114e6e0bbdeb0ULL,0xbfe226c684fbc479ULL,8191,30000,1001,-17,true},
    {0x403df853e2556b28ULL,0x3fa1156f8c384072ULL,0x3fc55acb6f46508eULL,0x0000000000000000ULL,5,30000,1001,123,false},
    {0x404df853e2556b28ULL,0x3f91156f8c384072ULL,0x3fb1156f8c384072ULL,0x3fd226c684fbc479ULL,4,60000,1001,17,true},
    {0x404df853e2556b28ULL,0x3f91156f8c384072ULL,0x406114e6e0bbdeb0ULL,0xbfd226c684fbc479ULL,8191,60000,1001,-17,true},
    {0x404df853e2556b28ULL,0x3f91156f8c384072ULL,0x3fb55acb6f46508eULL,0x0000000000000000ULL,5,60000,1001,123,false},
    {0x403df853e2556b27ULL,0x3fa1156f8c384072ULL,0x3fc1156f8c384072ULL,0x3fe226c684fbc479ULL,4,30000,1001,17,true},
    {0x403df853e2556b27ULL,0x3fa1156f8c384072ULL,0x407114e6e0bbdeb0ULL,0xbfe226c684fbc479ULL,8191,30000,1001,-17,true},
    {0x403df853e2556b27ULL,0x3fa1156f8c384072ULL,0x3fc55acb6f46508eULL,0x0000000000000000ULL,5,30000,1001,123,false},
    {0x404df853e2556b27ULL,0x3f91156f8c384072ULL,0x3fb1156f8c384072ULL,0x3fd226c684fbc479ULL,4,60000,1001,17,true},
    {0x404df853e2556b27ULL,0x3f91156f8c384072ULL,0x406114e6e0bbdeb0ULL,0xbfd226c684fbc479ULL,8191,60000,1001,-17,true},
    {0x404df853e2556b27ULL,0x3f91156f8c384072ULL,0x3fb55acb6f46508eULL,0x0000000000000000ULL,5,60000,1001,123,false},
// ORACLE_POSITIVE_END
}};
struct OutsideFixtureV1 final { std::uint64_t rate, delta, below, above; };
constexpr std::array<OutsideFixtureV1,10> outside{{
// ORACLE_OUTSIDE_BEGIN
    {0x4038000000000000ULL,0x3fa5555555555555ULL,0x3fc0000000000000ULL,0x4075555555555555ULL},
    {0x4039000000000000ULL,0x3fa47ae147ae147bULL,0x3fbeb851eb851eb8ULL,0x40747ae147ae147bULL},
    {0x403e000000000000ULL,0x3fa1111111111111ULL,0x3fb999999999999aULL,0x4071111111111111ULL},
    {0x4049000000000000ULL,0x3f947ae147ae147bULL,0x3faeb851eb851eb8ULL,0x40647ae147ae147bULL},
    {0x404e000000000000ULL,0x3f91111111111111ULL,0x3fa999999999999aULL,0x4061111111111111ULL},
    {0x4037f9dcb5112287ULL,0x3fa55acb6f46508eULL,0x3fc004189374bc6aULL,0x40755acb6f46508eULL},
    {0x403df853e2556b28ULL,0x3fa1156f8c384072ULL,0x3fb9a027525460abULL,0x4071156f8c384072ULL},
    {0x404df853e2556b28ULL,0x3f91156f8c384072ULL,0x3fa9a027525460abULL,0x4061156f8c384072ULL},
    {0x403df853e2556b27ULL,0x3fa1156f8c384072ULL,0x3fb9a027525460abULL,0x4071156f8c384072ULL},
    {0x404df853e2556b27ULL,0x3f91156f8c384072ULL,0x3fa9a027525460abULL,0x4061156f8c384072ULL},
// ORACLE_OUTSIDE_END
}};
timing::ObservedTimingInput Input(const PositiveFixtureV1& f) {
    return {f.rate,f.delta,f.duration,f.startTime,f.getter,f.start};
}
bool SameInput(const timing::ObservedTimingInput& a, const timing::ObservedTimingInput& b) {
    return a.frameRateBits == b.frameRateBits && a.frameDurationBits == b.frameDurationBits && a.durationBits == b.durationBits &&
        a.displayStartTimeBits == b.displayStartTimeBits && a.hasDisplayStartFrame == b.hasDisplayStartFrame && a.displayStartFrame == b.displayStartFrame;
}
bool Closed(const timing::ResolvedObservedRootTimingV1& result) {
    return !result.supported && result.frameCount == 0 && result.rateNumerator == 0 && result.rateDenominator == 0 &&
        result.alphaIndices == std::array<std::uint32_t,3>{0,0,0} && SameInput(result.observed,{}) &&
        result.resolvedDisplayStartFrame == 0 && result.displayStartEvidence == timing::DisplayStartEvidenceV1::None;
}
void ArithmeticCases() {
    struct LimbFixture final { std::uint64_t mantissa; std::uint32_t factor; std::uint64_t low, high; };
    const std::array<LimbFixture,5> limbs{{
        {0x1fffffffffffffULL,4294967295u,0xffdfffff00000001ULL,0x00000000001fffffULL},
        {0x15555555555555ULL,2147483648u,0xaaaaaaaa80000000ULL,0x00000000000aaaaaULL},
        {0x1fffffffffffffULL,8191u,0xffdfffffffffe001ULL,0x0000000000000003ULL},
        {0x10000000000001ULL,3u,0x0030000000000003ULL,0},
        {0x10000000000003ULL,3u,0x0030000000000009ULL,0}
    }};
    for (const auto& fixture : limbs) {
        const auto value = timing::detail::MultiplyMantissaV1(fixture.mantissa,fixture.factor);
        Check(value.low == fixture.low && value.high == fixture.high, "independent exact two-limb multiplication");
    }
    std::uint64_t value = 0;
    Check(timing::detail::RoundPositiveProductV1(0x3ff0000000000001ULL,3,value) && value == 0x4008000000000002ULL, "odd exact midpoint rounds upward to even");
    Check(timing::detail::RoundPositiveProductV1(0x3ff0000000000003ULL,3,value) && value == 0x4008000000000004ULL, "even exact midpoint rounds downward");
    Check(timing::detail::RoundPositiveProductV1(0x3fa5555555555555ULL,3,value) && value == 0x3fc0000000000000ULL, "RN-even significand carry into exponent");
    Check(timing::detail::RoundPositiveProductV1(0x3fa5555555555555ULL,0,value) && value == 0, "canonical positive zero factor");
    constexpr std::uint64_t sentinel = 0x123456789abcdef0ULL;
    for (const std::uint64_t invalid : {0ULL,1ULL,0xbfa5555555555555ULL,0x7ff0000000000000ULL,0x7ff8000000000001ULL}) {
        value = sentinel;
        Check(!timing::detail::RoundPositiveProductV1(invalid,4,value) && value == sentinel, "invalid product input preserves output");
    }
    value = sentinel;
    Check(!timing::detail::RoundPositiveProductV1(0x7fefffffffffffffULL,2,value) && value == sentinel, "product exponent overflow preserves output");
    Check(timing::detail::RoundSignedProductV1(0x3fa5555555555555ULL,std::numeric_limits<std::int32_t>::max(),value) &&
        value == 0x41955555552aaaaaULL, "signed32 maximum exact canonical product");
    Check(timing::detail::RoundSignedProductV1(0x3fa5555555555555ULL,std::numeric_limits<std::int32_t>::min(),value) &&
        value == 0xc195555555555555ULL, "signed32 minimum exact canonical product without negation overflow");
}
void PositiveCases() {
    for (const auto& fixture : positives) {
        const auto input = Input(fixture); const auto result = timing::ResolveObservedRootTimingV1(input);
        Check(result.supported && result.frameCount == fixture.frames && result.rateNumerator == fixture.numerator &&
            result.rateDenominator == fixture.denominator, "all ten FPS representations with literal N4/N8191 and signed start");
        const std::array<std::uint32_t,3> expected = fixture.frames == 8191 ? std::array<std::uint32_t,3>{2047,4095,6143} : std::array<std::uint32_t,3>{1,2,3};
        Check(result.alphaIndices == expected && result.alphaIndices[0] < result.alphaIndices[1] &&
            result.alphaIndices[1] < result.alphaIndices[2] && result.alphaIndices[2] < fixture.frames, "literal quartile samples distinct and in range");
        Check(SameInput(result.observed,input), "original IEEE64 bits and actual getter flag retained");
        Check(result.resolvedDisplayStartFrame == (fixture.getter ? fixture.start : 0) &&
            result.displayStartEvidence == (fixture.getter ? timing::DisplayStartEvidenceV1::ObservedSigned32Getter : timing::DisplayStartEvidenceV1::DerivedFromPositiveZeroTime),
            "actual signed32 getter versus derived positive-zero evidence");
    }
    auto input = Input(positives[0]); input.displayStartFrame = 0; input.displayStartTimeBits = 0;
    const auto zero = timing::ResolveObservedRootTimingV1(input);
    Check(zero.supported && zero.displayStartEvidence == timing::DisplayStartEvidenceV1::ObservedSigned32Getter, "actual zero getter preserves actual evidence");
    input.displayStartFrame = std::numeric_limits<std::int32_t>::max(); input.displayStartTimeBits = 0x41955555552aaaaaULL;
    Check(timing::ResolveObservedRootTimingV1(input).supported, "resolver signed32 maximum start");
    input.displayStartFrame = std::numeric_limits<std::int32_t>::min(); input.displayStartTimeBits = 0xc195555555555555ULL;
    Check(timing::ResolveObservedRootTimingV1(input).supported, "resolver signed32 minimum negative start");
}
void RefusalCases() {
    for (std::size_t i = 0; i < outside.size(); ++i) {
        auto input = Input(positives[i*3]);
        input.durationBits = outside[i].below; Check(Closed(timing::ResolveObservedRootTimingV1(input)), "N3 no partial resolved evidence");
        input.durationBits = outside[i].above; Check(Closed(timing::ResolveObservedRootTimingV1(input)), "N8192 profile ceiling closed");
        input = Input(positives[i*3]); input.frameRateBits += 2; Check(Closed(timing::ResolveObservedRootTimingV1(input)), "unknown FPS ULP neighbor closed");
        input = Input(positives[i*3]); ++input.frameRateBits;
        Check(i == 8 || i == 9 ? timing::ResolveObservedRootTimingV1(input).supported : Closed(timing::ResolveObservedRootTimingV1(input)),
            "only two exact reviewed reciprocal upper neighbors supported");
        input = Input(positives[i*3]); --input.frameRateBits;
        Check(i == 6 || i == 7 ? timing::ResolveObservedRootTimingV1(input).supported : Closed(timing::ResolveObservedRootTimingV1(input)),
            "only two exact reviewed reciprocal lower neighbors supported");
        input = Input(positives[i*3]); ++input.frameDurationBits; Check(Closed(timing::ResolveObservedRootTimingV1(input)), "unknown reciprocal duration neighbor closed");
        input = Input(positives[i*3]); --input.frameDurationBits; Check(Closed(timing::ResolveObservedRootTimingV1(input)), "unknown lower reciprocal duration neighbor closed");
        input = Input(positives[i*3]); ++input.durationBits; Check(Closed(timing::ResolveObservedRootTimingV1(input)), "off-grid duration ULP closed");
        input = Input(positives[i*3]); ++input.displayStartTimeBits; Check(Closed(timing::ResolveObservedRootTimingV1(input)), "getter/time mismatch closed");
        input = Input(positives[i*3]); input.hasDisplayStartFrame = false; Check(Closed(timing::ResolveObservedRootTimingV1(input)), "absent getter nonzero start closed");
    }
    const std::array<std::uint64_t,8> invalid{{0,0x8000000000000000ULL,1,0xbfc5555555555555ULL,
        0x7ff0000000000000ULL,0xfff0000000000000ULL,0x7ff8000000000001ULL,0xfff8000000000001ULL}};
    for (const auto value : invalid) {
        auto input = Input(positives[0]); input.durationBits = value;
        Check(Closed(timing::ResolveObservedRootTimingV1(input)), "negative/zero/subnormal/nonfinite duration closed");
        input = Input(positives[0]); input.frameRateBits = value;
        Check(Closed(timing::ResolveObservedRootTimingV1(input)), "negative/zero/subnormal/nonfinite FPS closed");
        input = Input(positives[0]); input.frameDurationBits = value;
        Check(Closed(timing::ResolveObservedRootTimingV1(input)), "negative/zero/subnormal/nonfinite frame duration closed");
    }
    for (const std::uint64_t start : {0x8000000000000000ULL,0x7ff0000000000000ULL,0xfff0000000000000ULL,0x7ff8000000000001ULL}) {
        auto input = Input(positives[0]); input.displayStartFrame = 0; input.displayStartTimeBits = start;
        Check(Closed(timing::ResolveObservedRootTimingV1(input)), "zero getter rejects negative zero and nonfinite start time");
        input.hasDisplayStartFrame = false;
        Check(Closed(timing::ResolveObservedRootTimingV1(input)), "absent getter accepts only actual positive zero time");
    }
    auto input = Input(positives[0]); input.frameRateBits = 0x403df851eb851eb8ULL;
    Check(Closed(timing::ResolveObservedRootTimingV1(input)), "arbitrary decimal 29.97 representation is not approved");
    input = Input(positives[0]); input.frameDurationBits = outside[1].delta;
    Check(Closed(timing::ResolveObservedRootTimingV1(input)), "individually known FPS and duration cannot be mismatched");
}
void UniqueGridCases() {
    bool exactPairsUnique = true;
    unsigned reviewedReciprocalAlternates = 0;
    const auto& pairs = timing::detail::kApprovedTimingPairsV1;
    for (std::size_t i = 0; i < pairs.size(); ++i) for (std::size_t j = i+1; j < pairs.size(); ++j) {
        if (pairs[i].frameRateBits == pairs[j].frameRateBits && pairs[i].frameDurationBits == pairs[j].frameDurationBits) exactPairsUnique = false;
        if (pairs[i].frameDurationBits == pairs[j].frameDurationBits) {
            if (pairs[i].numerator != pairs[j].numerator || pairs[i].denominator != pairs[j].denominator ||
                pairs[i].frameRateBits != pairs[j].frameRateBits+1) exactPairsUnique = false;
            ++reviewedReciprocalAlternates;
        }
    }
    Check(exactPairsUnique && reviewedReciprocalAlternates == 2, "unique exact bit-pair keys and exactly two consistent reciprocal alternates");
    for (const auto& pair : timing::detail::kApprovedTimingPairsV1) {
        std::uint64_t previous = 0;
        bool unique = true;
        for (std::uint32_t n = 4; n <= 8191; ++n) {
            std::uint64_t value = 0;
            if (!timing::detail::RoundPositiveProductV1(pair.frameDurationBits,n,value) || value <= previous) unique = false;
            previous = value;
        }
        Check(unique, "full finite N grid strictly increasing, no ambiguous canonical duration");
    }
}
} // namespace
int main(int count, char**) {
    if (count != 1) { std::cerr << "This isolated synthetic proof accepts no inputs or service operations.\n"; return 2; }
    ArithmeticCases(); PositiveCases(); RefusalCases(); UniqueGridCases();
    std::cout << "{\"schema\":\"ae-agent.owned-observed-timing-cpp-proof.v1\",\"syntheticOnly\":true,\"runtimeAuthority\":false,\"checks\":"
        << checks << ",\"failures\":" << failures << ",\"actualNativeObservationsProved\":false,\"rootIdentityProved\":false,\"c1OrderingProved\":false}\n";
    return failures ? 1 : 0;
}
