#pragma once
#include "owned_title_manifest_capture.h"
#include "owned_observed_timing.h"
#include <cstring>
#include <limits>

namespace local_session::trusted_read::capture {
// Factual validation of one original getter result. No JSON constructor can
// issue authority; NativeClient joins this with its retained completed command.
inline std::uint64_t ObservedDoubleBits(double value){
    static_assert(sizeof(double)==sizeof(std::uint64_t)&&std::numeric_limits<double>::is_iec559,"binary64 required");
    if(!std::isfinite(value)||(value==0&&std::signbit(value)))detail::Refuse("trusted_observed_nonfinite_or_negative_zero");
    std::uint64_t bits=0;std::memcpy(&bits,&value,sizeof(bits));return bits;
}
inline double ObservedDouble(std::uint64_t bits){double value=0;std::memcpy(&value,&bits,sizeof(value));return value;}
inline std::uint64_t ObservedAuthorityBits(const Json& field){
    const auto& text=field.Text();if(text.empty()||text.size()>40)detail::Refuse("trusted_observed_precision17_bound");
    // Every supported frozen timing value is in the fixed-decimal part of
    // ECMAScript toPrecision(17). Reject exponents and non-17 digit forms.
    std::size_t at=text[0]=='-'?1u:0u,dot=std::string::npos,significant=0;bool nonzero=false;
    if(at==text.size())detail::Refuse("trusted_observed_precision17_shape");const auto first=at;
    for(;at<text.size();++at){const auto c=text[at];if(c=='.'){if(dot!=std::string::npos||at==first||at+1==text.size())detail::Refuse("trusted_observed_precision17_shape");dot=at;continue;}
        if(c<'0'||c>'9')detail::Refuse("trusted_observed_precision17_shape");if(c!='0')nonzero=true;if(nonzero)++significant;}
    if(dot==std::string::npos||(dot-first>1&&text[first]=='0')||(!nonzero?text!="0.0000000000000000":significant!=17))detail::Refuse("trusted_observed_precision17_shape");
    return ObservedDoubleBits(field.Real());
}
inline std::uint64_t ObservedNumberBits(const Json& field){if(field.kind!=Json::Kind::Number)detail::Refuse("trusted_observed_number_kind_required");return ObservedDoubleBits(field.Real());}
inline observed_timing::ResolvedObservedRootTimingV1 CaptureObservedTiming(const Json& value){
    Fields(value,{"schema","compItemId","compName","width","height","frameRate","frameDuration","duration","displayStartTime","displayStartFrame"});
    if(value.Field("schema").Text()!="ae-agent.owned-observed-root-timing.v1"||value.Field("compName").Text().empty())detail::Refuse("trusted_observed_timing_schema_refused");
    for(const auto* key:{"compItemId","width","height"})if(value.Field(key).kind!=Json::Kind::Number||!value.Field(key).Unsigned())detail::Refuse("trusted_observed_timing_identity_refused");
    if(value.Field("width").Unsigned()>8192||value.Field("height").Unsigned()>8192)detail::Refuse("trusted_observed_timing_dimensions_refused");
    observed_timing::ObservedTimingInput input;input.frameRateBits=ObservedAuthorityBits(value.Field("frameRate"));input.frameDurationBits=ObservedAuthorityBits(value.Field("frameDuration"));
    input.durationBits=ObservedAuthorityBits(value.Field("duration"));input.displayStartTimeBits=ObservedAuthorityBits(value.Field("displayStartTime"));
    const auto& display=value.Field("displayStartFrame");if(display.kind!=Json::Kind::Null){if(display.kind!=Json::Kind::Number)detail::Refuse("trusted_observed_display_frame_kind_refused");
        const auto n=display.Real();if(n<std::numeric_limits<std::int32_t>::min()||n>std::numeric_limits<std::int32_t>::max()||std::floor(n)!=n||(n==0&&std::signbit(n)))detail::Refuse("trusted_observed_display_frame_refused");
        input.hasDisplayStartFrame=true;input.displayStartFrame=static_cast<std::int32_t>(n);}
    const auto resolved=observed_timing::ResolveObservedRootTimingV1(input);if(!resolved.supported)detail::Refuse("trusted_observed_timing_profile_refused");return resolved;
}
inline bool ObservedTimingSame(const observed_timing::ResolvedObservedRootTimingV1& first,const observed_timing::ResolvedObservedRootTimingV1& second)noexcept{
    const auto& a=first.observed;const auto& b=second.observed;return first.supported&&second.supported&&a.frameRateBits==b.frameRateBits&&a.frameDurationBits==b.frameDurationBits&&
        a.durationBits==b.durationBits&&a.displayStartTimeBits==b.displayStartTimeBits&&a.hasDisplayStartFrame==b.hasDisplayStartFrame&&a.displayStartFrame==b.displayStartFrame&&
        first.frameCount==second.frameCount&&first.rateNumerator==second.rateNumerator&&first.rateDenominator==second.rateDenominator&&first.alphaIndices==second.alphaIndices&&
        first.resolvedDisplayStartFrame==second.resolvedDisplayStartFrame&&first.displayStartEvidence==second.displayStartEvidence;
}
inline observed_timing::ResolvedObservedRootTimingV1 ObservedTimingCompJoin(const Json& timing,const Json& comp,bool graph){
    const auto resolved=CaptureObservedTiming(timing);if(timing.Field("compItemId").Unsigned()!=comp.Field(graph?"id":"itemId").Unsigned()||timing.Field("compName").Text()!=comp.Field("name").Text()||
        timing.Field("width").Unsigned()!=comp.Field("width").Unsigned()||timing.Field("height").Unsigned()!=comp.Field("height").Unsigned()||ObservedNumberBits(comp.Field("duration"))!=resolved.observed.durationBits)
        detail::Refuse("trusted_observed_actual_comp_join_refused");
    if(graph){if(ObservedNumberBits(comp.Field("frameDuration"))!=resolved.observed.frameDurationBits)detail::Refuse("trusted_observed_graph_frame_duration_drift");}
    else if(ObservedNumberBits(comp.Field("frameRate"))!=resolved.observed.frameRateBits||ObservedNumberBits(comp.Field("displayStartTime"))!=resolved.observed.displayStartTimeBits||
        Boolean(comp.Field("displayStartFrameSupported"))!=resolved.observed.hasDisplayStartFrame||(resolved.observed.hasDisplayStartFrame&&ObservedNumberBits(comp.Field("displayStartFrame"))!=ObservedDoubleBits(static_cast<double>(resolved.observed.displayStartFrame))))
        detail::Refuse("trusted_observed_actual_timing_drift");
    return resolved;
}
}
