#pragma once
#include "ame_native_log_capture.h"
#include <array>

namespace local_session::trusted_read::capture {
// Pure comparison only. The original NativeClient selects expected pins from
// its retained Propose row and challenge; these functions issue no exclusion,
// READ, capability, caller-JSON ownership or runtime authority.
inline bool OriginalProposalPinsEqual(const Json& actual,const Json& expected)noexcept{try{
    constexpr std::array<std::string_view,14> keys={"instanceId","revision","actionId","requestId","actionKind","payloadRef","payloadHash","previewHash","projectFile","expiresAt","riskLevel","riskPolicyVersion","surface","sessionId"};
    for(const auto* value:{&actual,&expected}){if(value->kind!=Json::Kind::Object||value->keys.size()!=keys.size()||value->children.size()!=keys.size())return false;
        for(const auto key:keys){const auto* field=value->Optional(key);if(!field)return false;
            if(key=="revision"){if(field->kind!=Json::Kind::Number)return false;const auto revision=field->Unsigned();if(!revision||revision>9007199254740991ULL)return false;}
            else{const auto& text=field->Text();if(text.size()>(key=="projectFile"?32760u:256u)||(text.empty()&&key!="sessionId")||text.find('\0')!=std::string::npos)return false;}}
        if(value->Field("surface").Text()!="cep-panel"||value->Field("actionKind").Text()!="ae_tool"||value->Field("riskLevel").Text()!="mutating")return false;}
    for(const auto key:keys)if(key=="revision"?actual.Field(key).Unsigned()!=expected.Field(key).Unsigned():actual.Field(key).Text()!=expected.Field(key).Text())return false;
    return true;
}catch(...){return false;}}
inline bool PreparationProposalQuiescenceMatches(std::uint64_t actualCount,const Json& actualPins,const Json* originalExpectedPins)noexcept{
    if(!originalExpectedPins)return actualCount==0&&actualPins.kind==Json::Kind::Null;
    return actualCount==1&&OriginalProposalPinsEqual(actualPins,*originalExpectedPins);
}
// This comparison is not a pending exclusion. Only NativeClient's retained
// original successful D20/gate producer selects the historical expected pins.
inline bool CompletedProposalQuiescenceMatches(std::uint64_t actualCount,const Json& actualPins,const Json& originalCompletedPins)noexcept{
    return actualCount==0&&OriginalProposalPinsEqual(actualPins,originalCompletedPins);
}
}
