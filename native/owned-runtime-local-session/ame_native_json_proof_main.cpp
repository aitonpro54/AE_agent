// Isolated actual-parser proof. Compile with only ame_native_log_capture.cpp
// and a generated getter_result_fixtures.h from the offline fixture script.
#if !defined(AE_AGENT_PHASE_SYNTHETIC_JSON_PROOF) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || defined(AE_AGENT_PRODUCTION_SOURCE_HEADERS)
#error This parser proof cannot be built as an installed/trusted production role.
#endif
#include "ame_native_log_capture.h"
#include "ame_native_json_limits.h"
#include "owned_preparation_quiescence.h"
#include "owned_title_manifest_capture.h"
#include <iostream>
#include <string>
#include "getter_result_fixtures.h"

namespace local_session::detail {
[[noreturn]] void Refuse(const char* code,std::uint32_t error,bool unknown,bool unavailable){throw Failure{code,error,unknown,unavailable};}
// The parser is factual. This proof cannot call the wrapper's hashing path or
// construct any fabricated hash, lifetime, process, Store, grant or receipt.
Digest Hash(const std::vector<unsigned char>&){Refuse("synthetic_json_hashing_path_closed");}
}
namespace {
using namespace local_session::trusted_read::capture;
std::size_t checks=0,failed=0;
void Check(bool ok,const char* name){++checks;if(!ok){++failed;std::cerr<<"FAIL isolated actual JSON parser: "<<name<<'\n';}}
std::vector<unsigned char> Decode(const GetterJsonFixture& fixture){std::vector<unsigned char> out;unsigned value=0,bits=0;bool padding=false;
    for(std::size_t chunk=0;chunk<fixture.chunkCount;++chunk)for(const char* p=fixture.chunks[chunk];*p;++p){const auto c=*p;if(c=='='){padding=true;continue;}if(padding)local_session::detail::Refuse("synthetic_base64_padding_refused");
        const unsigned digit=c>='A'&&c<='Z'?static_cast<unsigned>(c-'A'):c>='a'&&c<='z'?static_cast<unsigned>(c-'a'+26):c>='0'&&c<='9'?static_cast<unsigned>(c-'0'+52):c=='+'?62u:c=='/'?63u:64u;
        if(digit>63)local_session::detail::Refuse("synthetic_base64_digit_refused");value=(value<<6)|digit;bits+=6;if(bits>=8){bits-=8;out.push_back(static_cast<unsigned char>(value>>bits));}}
    return out;
}
bool Parse(const std::vector<unsigned char>& bytes,std::size_t byteLimit=kOriginalResultBytes,std::size_t nodeLimit=kOriginalResultNodes,std::size_t depthLimit=kOriginalResultDepth){
    try{(void)ParseOriginalJson(bytes,byteLimit,nodeLimit,depthLimit);return true;}catch(const local_session::detail::Failure&){return false;}
}
std::vector<unsigned char> Bytes(const std::string& text){return {text.begin(),text.end()};}
}
int main(){try{
    for(const auto& fixture:kGetterJsonFixtures)Check(Parse(Decode(fixture))==fixture.accepted,fixture.name);
    Check(Parse(Bytes(std::string(12,'[')+"0"+std::string(12,']')),1048576,4096,12),"input_depth12_unchanged");
    Check(!Parse(Bytes(std::string(13,'[')+"0"+std::string(13,']')),1048576,4096,12),"input_depth13_closed");
    Check(Parse(Bytes("[0,0]"),100,3,12),"exact_small_node_limit");Check(!Parse(Bytes("[0,0]"),100,2,12),"above_small_node_limit");
    Check(!Parse(Bytes("0"),100,3,33),"unsupported_config_depth33");
    Check(!Parse(Bytes("{\"a\":1,\"\\u0061\":2}")),"escaped_duplicate_exact_native_parser");
    Check(!Parse(Bytes("{\"a\\u0000b\":1}")),"nul_object_key");Check(!Parse(Bytes("\"\\ud800\"")),"unpaired_surrogate");
    Check(!Parse(Bytes("{}{}")),"trailing_json");
    // Copy the same valid synthetic getter bytes through both boundaries. The
    // production node API invokes this exact parser before each JS parse.
    const auto embedded=Decode(kGetterJsonFixtures[0]);const auto parsed=ParseOriginalJson(embedded,kOriginalResultBytes,kOriginalResultNodes,kOriginalResultDepth);
    Check(parsed.Field("ok").scalar=="true"&&parsed.Field("result").Field("layers").children.size()==1000,"actual_comp1000_native_fields");
    const auto pins=ParseOriginalJson(Bytes("{\"instanceId\":\"instance\",\"revision\":1,\"actionId\":\"action\",\"requestId\":\"request\",\"actionKind\":\"ae_tool\",\"payloadRef\":\"payload\",\"payloadHash\":\"sha256:payload\",\"previewHash\":\"sha256:preview\",\"projectFile\":\"C:\\\\owned\\\\source.aep\",\"expiresAt\":\"2026-10-14T12:00:00.000Z\",\"riskLevel\":\"mutating\",\"riskPolicyVersion\":\"m100-risk-v1\",\"surface\":\"cep-panel\",\"sessionId\":\"\"}"),1048576,4096);
    const Json noPins;Check(PreparationProposalQuiescenceMatches(0,noPins,nullptr),"ordinary_actual_zero_proposals");
    Check(!PreparationProposalQuiescenceMatches(1,pins,nullptr),"ordinary_READ_cannot_exclude_proposal");
    Check(PreparationProposalQuiescenceMatches(1,pins,&pins),"own_exact_one_proposal_predicate_only");
    Check(!PreparationProposalQuiescenceMatches(2,pins,&pins),"two_proposals_closed");Check(!PreparationProposalQuiescenceMatches(0,pins,&pins),"missing_original_proposal_closed");
    Check(!PreparationProposalQuiescenceMatches(1,noPins,&pins),"missing_actual_pins_closed");
    for(std::size_t i=0;i<pins.keys.size();++i){auto changed=pins;changed.children[i].scalar=pins.keys[i]=="revision"?"2":"foreign";
        Check(!PreparationProposalQuiescenceMatches(1,changed,&pins),pins.keys[i].c_str());}
    auto extra=pins;extra.keys.push_back("ready");extra.children.push_back(Json{});Check(!OriginalProposalPinsEqual(extra,pins),"foreign_ready_pins_closed");
    auto missing=pins;missing.keys.pop_back();missing.children.pop_back();Check(!OriginalProposalPinsEqual(missing,pins),"missing_pin_field_closed");
    auto wrong=pins;wrong.children[1].scalar="0";Check(!OriginalProposalPinsEqual(wrong,pins),"zero_revision_closed");
    auto stringRevision=pins;stringRevision.children[1].kind=Json::Kind::String;Check(!OriginalProposalPinsEqual(stringRevision,pins),"string_actual_revision_closed");
    Check(!OriginalProposalPinsEqual(pins,stringRevision),"string_expected_revision_closed");
    auto boolRevision=pins;boolRevision.children[1].kind=Json::Kind::Boolean;boolRevision.children[1].scalar="true";Check(!OriginalProposalPinsEqual(boolRevision,pins),"boolean_revision_closed");
    auto fractionRevision=pins;fractionRevision.children[1].scalar="1.5";Check(!OriginalProposalPinsEqual(fractionRevision,pins),"fractional_revision_closed");
    Check(CompletedProposalQuiescenceMatches(0,pins,pins),"completed_original_D20_pins_pending_zero");
    Check(!CompletedProposalQuiescenceMatches(1,pins,pins),"completed_history_cannot_exclude_pending_one");
    Check(!CompletedProposalQuiescenceMatches(2,pins,pins),"completed_history_cannot_hide_two_proposals");
    Check(!CompletedProposalQuiescenceMatches(0,noPins,pins),"completed_history_missing_actual_pins_closed");
    for(std::size_t i=0;i<pins.keys.size();++i){auto changed=pins;changed.children[i].scalar=pins.keys[i]=="revision"?"2":"foreign";Check(!CompletedProposalQuiescenceMatches(0,changed,pins),"completed_history_foreign_pin_closed");}
    Check(!CompletedProposalQuiescenceMatches(0,extra,pins),"completed_history_extra_ready_closed");
    Check(!CompletedProposalQuiescenceMatches(0,stringRevision,pins),"completed_history_string_revision_closed");
    const std::string ownGuid="12345678-1234-4234-9234-123456789abc";
    const std::array<std::uint64_t,2> ownPair{{11,12}};
    const auto current=ParseOriginalJson(Bytes("{\"graph\":{\"rootCompItemId\":1,\"variantCompItemId\":1,\"controlled\":[{\"id\":12},{\"id\":11}]},\"sourceGuid\":\""+ownGuid+"\",\"selectedTextLayerIds\":[11,12],\"compItemId\":1,\"rootCompItemId\":1,\"projectFile\":\"C:/owned/source.aep\",\"revision\":2,\"dirty\":false,\"uiBaseline\":{}}"),1048576,4096);
    const auto identityMatches=[&](const Json& actual){return OriginalReadCurrentIdentityMatches(actual,1,1,ownPair,ownGuid);};
    const auto changedField=[](Json& value,const char* name)->Json&{for(std::size_t i=0;i<value.keys.size();++i)if(value.keys[i]==name)return value.children[i];local_session::detail::Refuse("synthetic_current_fixture_field_missing");};
    Check(identityMatches(current),"C6_own_original_root_equals_target_identity");
    Check(OriginalReadCurrentIdentityMatches(current,1,1,ownPair,"12345678-1234-4234-9234-123456789ABC"),"C6_original_receipt_guid_hex_case_normalized");
    auto foreignGuid=current;changedField(foreignGuid,"sourceGuid").scalar="22345678-1234-4234-9234-123456789abc";Check(!identityMatches(foreignGuid),"C6_valid_foreign_guid_closed");
    for(const auto* key:{"compItemId","rootCompItemId"})for(const auto* value:{"0","999"}){auto changed=current;changedField(changed,key).scalar=value;Check(!identityMatches(changed),key);}
    for(std::size_t i=0;i<2;++i){auto changed=current;changedField(changed,"selectedTextLayerIds").children[i].scalar="999";Check(!identityMatches(changed),"C6_foreign_selected_id_closed");}
    auto duplicatePair=current;changedField(duplicatePair,"selectedTextLayerIds").children[1].scalar="11";Check(!identityMatches(duplicatePair),"C6_duplicate_selected_id_closed");
    auto zeroPair=current;changedField(zeroPair,"selectedTextLayerIds").children[0].scalar="0";Check(!identityMatches(zeroPair),"C6_zero_selected_id_closed");
    auto missingPair=current;changedField(missingPair,"selectedTextLayerIds").children.pop_back();Check(!identityMatches(missingPair),"C6_missing_selected_id_closed");
    auto reversedPair=current;std::swap(changedField(reversedPair,"selectedTextLayerIds").children[0],changedField(reversedPair,"selectedTextLayerIds").children[1]);Check(!identityMatches(reversedPair),"C6_pair_order_drift_closed");
    auto extraPair=current;changedField(extraPair,"selectedTextLayerIds").children.push_back(current.Field("selectedTextLayerIds").children[0]);Check(!identityMatches(extraPair),"C6_extra_selected_id_closed");
    for(const auto* key:{"compItemId","rootCompItemId"}){auto changed=current;changedField(changed,key).kind=Json::Kind::String;Check(!identityMatches(changed),"C6_string_comp_or_root_id_closed");}
    auto stringPair=current;changedField(stringPair,"selectedTextLayerIds").children[0].kind=Json::Kind::String;Check(!identityMatches(stringPair),"C6_string_selected_id_closed");
    auto fractionPair=current;changedField(fractionPair,"selectedTextLayerIds").children[0].scalar="11.5";Check(!identityMatches(fractionPair),"C6_fraction_selected_id_closed");
    for(const auto* key:{"variantCompItemId","rootCompItemId"}){auto changed=current;changedField(changedField(changed,"graph"),key).scalar="999";Check(!identityMatches(changed),"C6_state_graph_identity_drift_closed");}
    auto foreignControlled=current;changedField(changedField(foreignControlled,"graph"),"controlled").children[0].children[0].scalar="999";Check(!identityMatches(foreignControlled),"C6_graph_foreign_controlled_id_closed");
    auto duplicateControlled=current;changedField(changedField(duplicateControlled,"graph"),"controlled").children[0].children[0].scalar="11";Check(!identityMatches(duplicateControlled),"C6_graph_duplicate_controlled_id_closed");
    auto foreignWhole=current;changedField(foreignWhole,"compItemId").scalar="201";changedField(foreignWhole,"rootCompItemId").scalar="201";
    changedField(changedField(foreignWhole,"graph"),"variantCompItemId").scalar="201";changedField(changedField(foreignWhole,"graph"),"rootCompItemId").scalar="201";
    Check(!identityMatches(foreignWhole),"C6_self_consistent_foreign_graph_cannot_replace_own_original");
    Check(!OriginalReadCurrentIdentityMatches(current,1,1,ownPair,"22345678-1234-4234-9234-123456789abc"),"C6_expected_guid_is_original_receipt_operand");
    auto differentRoot=current;changedField(differentRoot,"rootCompItemId").scalar="2";changedField(changedField(differentRoot,"graph"),"rootCompItemId").scalar="2";
    Check(OriginalReadCurrentIdentityMatches(differentRoot,1,2,ownPair,ownGuid),"C6_factual_identity_helper_also_accepts_exact_distinct_root");
    std::cout<<"{\"schema\":\"ae-agent.native-json-parser-proof.v1\",\"checks\":"<<checks<<",\"failed\":"<<failed<<",\"productionAuthority\":false,\"actualEffects\":0}\n";
    return failed?1:0;
}catch(const local_session::detail::Failure& error){std::cerr<<error.code<<'\n';return 2;}catch(...){std::cerr<<"isolated_json_proof_unexpected_failure\n";return 3;}}
