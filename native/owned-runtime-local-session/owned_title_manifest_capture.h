#pragma once
#include "ame_native_log_capture.h"
#include <algorithm>
#include <cmath>
#include <set>

namespace local_session::trusted_read::capture {
// Factual validation only; this function cannot issue a Manifest or READ cap.
// The NativeClient caller must supply its retained actual completed getter row.
struct SelectedTextState final {std::uint64_t id=0,index=0;std::string name,text;bool enabled=false;};
struct FirstTwoSelection final {std::uint64_t comp=0,revision=0;std::string compName,projectFile;std::array<SelectedTextState,2> states{};};
inline bool Boolean(const Json& value){if(value.kind!=Json::Kind::Boolean)detail::Refuse("trusted_manifest_boolean_required");return value.scalar=="true";}
inline void Fields(const Json& value,std::initializer_list<const char*> names){if(value.kind!=Json::Kind::Object||value.keys.size()!=names.size())detail::Refuse("trusted_manifest_exact_fields_required");for(const auto* name:names)(void)value.Field(name);}
inline const std::vector<Json>& Array(const Json& value,std::size_t maximum){if(value.kind!=Json::Kind::Array||value.children.size()>maximum)detail::Refuse("trusted_manifest_array_bound");return value.children;}
struct ReadCurrentIdentity final {std::uint64_t comp=0,root=0;std::array<std::uint64_t,2> selected{};std::string guid;};
inline std::uint64_t ReadCurrentPositiveId(const Json& value){if(value.kind!=Json::Kind::Number)detail::Refuse("trusted_c6_current_id_number_required");const auto id=value.Unsigned();if(!id||id>9007199254740991ULL)detail::Refuse("trusted_c6_current_id_positive_required");return id;}
// A factual shape/graph join, never an owner or baseline issuer. The separate
// NativeClient comparison supplies IDs and GUID from its retained own manifest.
inline ReadCurrentIdentity OriginalReadCurrentIdentity(const Json& state){
    Fields(state,{"graph","sourceGuid","selectedTextLayerIds","compItemId","rootCompItemId","projectFile","revision","dirty","uiBaseline"});
    ReadCurrentIdentity identity;identity.comp=ReadCurrentPositiveId(state.Field("compItemId"));identity.root=ReadCurrentPositiveId(state.Field("rootCompItemId"));
    const auto& selected=Array(state.Field("selectedTextLayerIds"),2);if(selected.size()!=2)detail::Refuse("trusted_c6_current_selected_pair_required");
    for(std::size_t i=0;i<2;++i)identity.selected[i]=ReadCurrentPositiveId(selected[i]);if(identity.selected[0]==identity.selected[1])detail::Refuse("trusted_c6_current_selected_pair_unique_required");
    identity.guid=state.Field("sourceGuid").Text();if(identity.guid.size()!=36)detail::Refuse("trusted_c6_current_guid_required");bool nonzero=false;
    for(std::size_t i=0;i<identity.guid.size();++i){const auto c=identity.guid[i];if(i==8||i==13||i==18||i==23){if(c!='-')detail::Refuse("trusted_c6_current_guid_required");}
        else{if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))detail::Refuse("trusted_c6_current_guid_required");if(c!='0')nonzero=true;}}
    if(!nonzero)detail::Refuse("trusted_c6_current_guid_required");const auto& graph=state.Field("graph");
    if(identity.comp!=ReadCurrentPositiveId(graph.Field("variantCompItemId"))||identity.root!=ReadCurrentPositiveId(graph.Field("rootCompItemId")))detail::Refuse("trusted_c6_current_graph_identity_join");
    const auto& controlled=Array(graph.Field("controlled"),2);if(controlled.size()!=2)detail::Refuse("trusted_c6_current_controlled_pair_required");std::array<bool,2> found{};
    for(const auto& row:controlled){const auto id=ReadCurrentPositiveId(row.Field("id"));std::size_t at=2;for(std::size_t i=0;i<2;++i)if(id==identity.selected[i])at=i;
        if(at==2||found[at])detail::Refuse("trusted_c6_current_controlled_pair_join");found[at]=true;}
    return identity;
}
inline bool OriginalReadCurrentIdentityMatches(const Json& state,std::uint64_t ownComp,std::uint64_t ownRoot,
    const std::array<std::uint64_t,2>& ownSelected,const std::string& originalGuid)noexcept{try{
    const auto actual=OriginalReadCurrentIdentity(state);auto guid=originalGuid;for(auto& c:guid)if(c>='A'&&c<='F')c=static_cast<char>(c-'A'+'a');
    return ownComp&&ownRoot&&ownSelected[0]&&ownSelected[1]&&ownSelected[0]!=ownSelected[1]&&
        actual.comp==ownComp&&actual.root==ownRoot&&actual.selected==ownSelected&&actual.guid==guid;
}catch(...){return false;}}
inline std::pair<std::size_t,bool> TextCoverage(const std::string& text){std::size_t units=0;bool nonblank=false;
    for(std::size_t at=0;at<text.size();){const auto first=static_cast<unsigned char>(text[at++]);std::uint32_t code=first;unsigned extra=0;
        if(first>=0xf0){code=first&7u;extra=3;}else if(first>=0xe0){code=first&15u;extra=2;}else if(first>=0xc0){code=first&31u;extra=1;}
        if(extra>text.size()-at)detail::Refuse("trusted_manifest_text_utf8_refused");for(unsigned i=0;i<extra;++i)code=(code<<6)|(static_cast<unsigned char>(text[at++])&63u);
        units+=code>=0x10000?2u:1u;if(units>4096||code==0)detail::Refuse("trusted_manifest_text_units_refused");
        const bool blank=(code>=9&&code<=13)||code==0x20||code==0xa0||code==0x1680||(code>=0x2000&&code<=0x200a)||code==0x2028||code==0x2029||code==0x202f||code==0x205f||code==0x3000||code==0xfeff;
        if(!blank)nonblank=true;
    }return {units,nonblank};}
inline void ValidateInventoryCensus(const Json& inventory){
    Fields(inventory,{"schema","projectFile","dirty","revision","compItemId","compName","numLayers","numProjectItems","projectItemRows","allLayerRows","layerRows","usedFonts","characterCount","usageCount"});
    if(inventory.Field("schema").Text()!="ae-agent.owned-first-two-text-inventory.v2"||Boolean(inventory.Field("dirty")))detail::Refuse("trusted_manifest_clean_census_required");
    const auto total=inventory.Field("numLayers").Unsigned(),projectTotal=inventory.Field("numProjectItems").Unsigned();
    const auto& project=Array(inventory.Field("projectItemRows"),1000);const auto& all=Array(inventory.Field("allLayerRows"),1000);const auto& texts=Array(inventory.Field("layerRows"),1000);
    if(total>1000||projectTotal>1000||all.size()!=total||project.size()!=projectTotal)detail::Refuse("trusted_manifest_complete_census_required");
    std::set<std::uint64_t> projectIds,allIds,textIds;std::size_t compMatches=0,textCount=0;
    for(std::size_t i=0;i<project.size();++i){const auto& row=project[i];Fields(row,{"id","index","name","comp"});const auto id=row.Field("id").Unsigned();
        if(!id||row.Field("index").Unsigned()!=i+1||!projectIds.insert(id).second)detail::Refuse("trusted_manifest_project_item_identity_refused");
        const auto& name=row.Field("name").Text();const bool comp=Boolean(row.Field("comp"));
        if(id==inventory.Field("compItemId").Unsigned()){if(!comp||name!=inventory.Field("compName").Text())detail::Refuse("trusted_manifest_project_comp_census_join_refused");++compMatches;}}
    if(compMatches!=1)detail::Refuse("trusted_manifest_project_comp_census_join_refused");
    for(std::size_t i=0;i<all.size();++i){const auto& row=all[i];Fields(row,{"id","index","name","textLayer","enabled","locked","guide","solo","inPoint","outPoint","sourceId","sourceText","sourceTextExpression","sourceTextKeys"});
        const auto id=row.Field("id").Unsigned();if(!id||row.Field("index").Unsigned()!=i+1||!allIds.insert(id).second)detail::Refuse("trusted_manifest_all_layer_identity_refused");
        (void)row.Field("name").Text();for(const auto* flag:{"enabled","locked","guide","solo"})(void)Boolean(row.Field(flag));
        if(row.Field("outPoint").Real()<=row.Field("inPoint").Real())detail::Refuse("trusted_manifest_all_layer_range_refused");
        if(row.Field("sourceId").kind!=Json::Kind::Null&&!row.Field("sourceId").Unsigned())detail::Refuse("trusted_manifest_all_layer_source_refused");
        if(Boolean(row.Field("textLayer"))){++textCount;(void)row.Field("sourceText").Text();(void)Boolean(row.Field("sourceTextExpression"));(void)row.Field("sourceTextKeys").Unsigned();}
        else if(row.Field("sourceText").kind!=Json::Kind::Null||row.Field("sourceTextExpression").kind!=Json::Kind::Null||row.Field("sourceTextKeys").kind!=Json::Kind::Null)detail::Refuse("trusted_manifest_nontext_census_refused");}
    if(texts.size()!=textCount)detail::Refuse("trusted_manifest_text_census_incomplete");
    for(const auto& row:texts){const auto index=row.Field("index").Unsigned(),id=row.Field("id").Unsigned();
        if(!index||index>all.size()||!textIds.insert(id).second)detail::Refuse("trusted_manifest_text_census_identity_refused");const auto& actual=all[static_cast<std::size_t>(index-1)];
        if(!Boolean(actual.Field("textLayer"))||actual.Field("id").Unsigned()!=id||actual.Field("name").Text()!=row.Field("name").Text()||actual.Field("sourceText").Text()!=row.Field("sourceText").Text()||
            actual.Field("sourceTextKeys").Unsigned()!=row.Field("sourceTextKeys").Unsigned()||actual.Field("inPoint").Real()!=row.Field("inPoint").Real()||actual.Field("outPoint").Real()!=row.Field("outPoint").Real())detail::Refuse("trusted_manifest_text_census_join_refused");
        for(const auto* flag:{"enabled","locked","guide","solo","sourceTextExpression"})if(Boolean(actual.Field(flag))!=Boolean(row.Field(flag)))detail::Refuse("trusted_manifest_text_census_flags_refused");}
}
inline void RequireUniqueCompName(const Json& inventory){std::size_t matches=0;for(const auto& row:Array(inventory.Field("projectItemRows"),1000))
    if(Boolean(row.Field("comp"))&&row.Field("name").Text()==inventory.Field("compName").Text()){if(row.Field("id").Unsigned()!=inventory.Field("compItemId").Unsigned())detail::Refuse("trusted_manifest_project_comp_name_ambiguous");++matches;}
    if(matches!=1)detail::Refuse("trusted_manifest_project_comp_name_ambiguous");}
inline FirstTwoSelection FirstTwoObserved(const Json& inventory,double rangeStart,double rangeEnd){
    ValidateInventoryCensus(inventory);RequireUniqueCompName(inventory);
    if(!std::isfinite(rangeStart)||!std::isfinite(rangeEnd)||rangeEnd<=rangeStart)detail::Refuse("trusted_manifest_clean_range_required");
    FirstTwoSelection selected;selected.projectFile=inventory.Field("projectFile").Text();selected.comp=inventory.Field("compItemId").Unsigned();selected.compName=inventory.Field("compName").Text();selected.revision=inventory.Field("revision").Unsigned();
    if(selected.projectFile.empty()||!selected.comp||selected.compName.empty())detail::Refuse("trusted_manifest_project_comp_required");
    const auto total=inventory.Field("numLayers").Unsigned();if(total>1000||inventory.Field("characterCount").Unsigned()>65536||inventory.Field("usageCount").Unsigned()>12000)detail::Refuse("trusted_manifest_inventory_bound");
    const auto& rows=Array(inventory.Field("layerRows"),1000);const auto& fonts=Array(inventory.Field("usedFonts"),1000);std::set<std::uint64_t> ids,indices,fontIds;std::uint64_t usages=0,chars=0,previousIndex=0;
    for(const auto& entry:fonts){Fields(entry,{"font","usedAt"});const auto& font=entry.Field("font");Fields(font,{"id","postScriptName","isSubstitute"});
        if(!font.Field("id").Unsigned()||font.Field("postScriptName").Text().empty()||!fontIds.insert(font.Field("id").Unsigned()).second)detail::Refuse("trusted_manifest_font_identity_refused");
        (void)Boolean(font.Field("isSubstitute"));const auto& at=Array(entry.Field("usedAt"),12000);usages+=at.size();if(usages>12000)detail::Refuse("trusted_manifest_usage_bound");
        for(const auto& use:at){Fields(use,{"layerID","layerTimeD"});if(!use.Field("layerID").Unsigned())detail::Refuse("trusted_manifest_usage_identity_refused");(void)use.Field("layerTimeD").Real();}}
    std::size_t chosen=0;
    for(const auto& row:rows){Fields(row,{"id","index","name","enabled","locked","guide","solo","inPoint","outPoint","sourceText","sourceTextExpression","sourceTextKeys","fontAtChar"});
        const auto id=row.Field("id").Unsigned(),index=row.Field("index").Unsigned();if(!id||!index||index>total||index<=previousIndex||!ids.insert(id).second||!indices.insert(index).second)detail::Refuse("trusted_manifest_layer_identity_refused");previousIndex=index;
        const auto& text=row.Field("sourceText").Text();const auto coverage=TextCoverage(text);const auto& charFonts=Array(row.Field("fontAtChar"),4096);if(charFonts.size()!=coverage.first)detail::Refuse("trusted_manifest_character_coverage_refused");chars+=charFonts.size();if(chars>65536)detail::Refuse("trusted_manifest_character_bound");
        (void)Boolean(row.Field("enabled"));(void)Boolean(row.Field("locked"));(void)Boolean(row.Field("guide"));(void)Boolean(row.Field("solo"));(void)Boolean(row.Field("sourceTextExpression"));(void)row.Field("sourceTextKeys").Unsigned();
        const auto in=row.Field("inPoint").Real(),out=row.Field("outPoint").Real();if(out<=in)detail::Refuse("trusted_manifest_layer_range_refused");
        if(chosen==2||!coverage.second)continue;
        // Do not skip a selected first/second row after a failed predicate and
        // silently choose a later layer. First two nonblank direct text states
        // either both qualify or the complete operation remains closed.
        if(Boolean(row.Field("locked"))||Boolean(row.Field("guide"))||Boolean(row.Field("solo"))||Boolean(row.Field("sourceTextExpression"))||row.Field("sourceTextKeys").Unsigned()!=0||
            out<=rangeStart||in>=rangeEnd||charFonts.empty())detail::Refuse("trusted_manifest_first_two_qualification_refused");
        for(const auto& charFont:charFonts){const auto fontId=charFont.Unsigned();const Json* actual=nullptr;for(const auto& entry:fonts)if(entry.Field("font").Field("id").Unsigned()==fontId){actual=&entry;break;}
            if(!actual||Boolean(actual->Field("font").Field("isSubstitute")))detail::Refuse("trusted_manifest_selected_font_missing_or_substitute");
            bool used=false;for(const auto& at:Array(actual->Field("usedAt"),12000))if(at.Field("layerID").Unsigned()==id)used=true;if(!used)detail::Refuse("trusted_manifest_selected_font_usage_join_refused");}
        selected.states[chosen++]={id,index,row.Field("name").Text(),text,Boolean(row.Field("enabled"))};
    }
    if(chosen!=2||selected.states[0].text==selected.states[1].text||chars!=inventory.Field("characterCount").Unsigned()||usages!=inventory.Field("usageCount").Unsigned())detail::Refuse("trusted_manifest_first_two_distinct_complete_required");
    return selected;
}
}
