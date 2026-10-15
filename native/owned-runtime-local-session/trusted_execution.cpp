#include "trusted_execution.h"
#include <algorithm>
#include <limits>
#include <cwchar>

namespace local_session::trusted_read {
namespace {
bool FixedOutputComponent(const std::wstring& value,const wchar_t* extension)noexcept{
    if(value.empty()||value.size()>255||value==L"."||value==L".."||value.back()==L'.'||value.back()==L' '||
        value.find_first_of(L"\\/:*?\"<>|")!=std::wstring::npos||value.find(L'\0')!=std::wstring::npos)return false;
    for(const auto c:value)if(c<32)return false;const auto length=std::char_traits<wchar_t>::length(extension);
    return value.size()>length&&_wcsicmp(value.c_str()+value.size()-length,extension)==0;
}
bool SamePhysicalObject(const ObjectPin& a,const ObjectPin& b)noexcept{return a.serial==b.serial&&a.fileId==b.fileId;}
}
Digest FixedEncodedMappingDescriptor()noexcept{return {0x45,0xfd,0x6a,0x5f,0x73,0x66,0x9a,0xcd,0xed,0x39,0x15,0x18,0xc2,0x9c,0x1b,0xe1,0xa1,0x71,0xa2,0xbe,0xdd,0x44,0xed,0xb2,0x0b,0x9c,0xe5,0xc4,0xb8,0x94,0x2f,0xa9};}
bool FixedAmeTargetSpecifier(const std::string& target)noexcept{
    if(target.size()<7||target.size()>11||target.compare(0,4,"ame-")!=0)return false;const auto dot=target.find('.',4);
    if(dot==std::string::npos||dot<5||dot>7||target.size()-dot-1<1||target.size()-dot-1>3)return false;
    for(std::size_t i=4;i<target.size();++i)if(i!=dot&&(target[i]<'0'||target[i]>'9'))return false;return true;
}
Digest FixedSharedQueueObservationLeaf(const ExecutionPolicy& policy,std::uint16_t purpose){
    ExecutionCost worst;if(!policy.SharedQueue()||!policy.Validate(worst)||purpose>3)detail::Refuse("trusted_shared_observation_leaf_refused");
    std::vector<unsigned char> bytes;constexpr char domain[]="lcp2.production.shared-queue-native-observation.v1";bytes.insert(bytes.end(),domain,domain+sizeof(domain)-1);
    for(const auto* value:{&policy.policyHash,&policy.typedProducerHash,&policy.ame.sha256,&policy.preset.sha256})bytes.insert(bytes.end(),value->begin(),value->end());
    detail::PutPin(bytes,policy.snapshotRoot);detail::PutPin(bytes,policy.outputRoot);detail::PutU16(bytes,purpose);return detail::Hash(bytes);
}
Digest FixedOriginalCompletionLeaf(const ExecutionPolicy& policy,std::uint16_t slot,std::uint16_t purpose){
    // 0/1 are the two private poll reads; 2 is terminal; 3..8 are the six
    // composite media operations Metadata/Packets/Decode/Alpha0/1/2.
    if(slot<1||slot>2||purpose>8||detail::Zero(policy.policyHash)||detail::Zero(policy.typedProducerHash)||detail::Zero(policy.mediaProducerHash)||detail::Zero(policy.pngEncoderHash))detail::Refuse("trusted_original_completion_leaf_refused");
    std::vector<unsigned char> bytes;constexpr char domain[]="lcp2.production.fixed-original-completion-leaf.v1";bytes.insert(bytes.end(),domain,domain+sizeof(domain)-1);
    for(const auto* digest:{&policy.policyHash,&policy.typedProducerHash,&policy.mediaProducerHash,&policy.pngEncoderHash})bytes.insert(bytes.end(),digest->begin(),digest->end());
    detail::PutU16(bytes,slot);detail::PutU16(bytes,purpose);detail::PutPin(bytes,policy.outputRoot);
    for(const auto* file:{&policy.ffprobe,&policy.ffmpeg}){detail::PutPin(bytes,file->pin);bytes.insert(bytes.end(),file->sha256.begin(),file->sha256.end());}
    const auto& variant=policy.variants[slot-1];for(const auto* name:{&variant.outputName,&variant.previewNames[0],&variant.previewNames[1],&variant.previewNames[2]}){if(name->size()>255)detail::Refuse("trusted_original_completion_name_bound");detail::PutU16(bytes,static_cast<std::uint16_t>(name->size()));for(const auto c:*name)detail::PutU16(bytes,static_cast<std::uint16_t>(c));}
    return detail::Hash(bytes);
}
bool FixedExecutionIntentAllowed(phase::ToolCode tool,phase::CallKind kind,std::uint16_t slot,ExecutionLeaf leaf)noexcept{
    if(slot>2)return false;using phase::ToolCode;using phase::CallKind;
    const bool titleEffect=slot&&leaf>=ExecutionLeaf::StageVariant&&leaf<=ExecutionLeaf::RestoreBaseline;
    const bool checkpoint=!slot&&leaf==ExecutionLeaf::OwnedCheckpoint;
    const bool cleanCopy=slot&&leaf==ExecutionLeaf::CleanCopy;
    const bool effect=titleEffect||checkpoint||cleanCopy;
    if(kind==CallKind::ExecutionPrep){switch(tool){
        case ToolCode::BuildSolutionPlan:return !slot&&leaf==ExecutionLeaf::Inspect;
        case ToolCode::ProposeAiAgentPlan:case ToolCode::RunAiAgentPlan:return effect;
        case ToolCode::InspectTitleVariants:case ToolCode::GetCompDetails:case ToolCode::GetLayerDetails:return !slot&&leaf==ExecutionLeaf::Inspect;
        case ToolCode::InspectAmeTitleSources:case ToolCode::InspectAmeTitleQueueManifest:return slot&&leaf==ExecutionLeaf::Inspect;
        default:return false;}}
    if(kind!=CallKind::Execute||!effect)return false;switch(tool){
        case ToolCode::RunAiAgentPlan:return leaf==ExecutionLeaf::StageVariant||leaf==ExecutionLeaf::RestoreBaseline||checkpoint||cleanCopy||
            (slot&&(leaf==ExecutionLeaf::EnqueueAme||leaf==ExecutionLeaf::StartAme));
        case ToolCode::EnqueueAmeTitleVariant:return leaf==ExecutionLeaf::EnqueueAme;
        case ToolCode::StartAmeTitleBatch:return leaf==ExecutionLeaf::StartAme;
        default:return false;}
}
Digest FixedExecutionScope(const ExecutionPolicy& policy,std::uint16_t slot,ExecutionLeaf leaf){
    const bool ordinary=leaf>=ExecutionLeaf::Inspect&&leaf<=ExecutionLeaf::RestoreBaseline&&(slot||leaf==ExecutionLeaf::Inspect);
    const bool checkpoint=!slot&&leaf==ExecutionLeaf::OwnedCheckpoint;
    const bool copy=slot&&leaf==ExecutionLeaf::CleanCopy;
    if(detail::Zero(policy.policyHash)||detail::Zero(policy.typedProducerHash)||slot>2||(!ordinary&&!checkpoint&&!copy)||
        policy.checkpointName!=L"titr_all-source-checkpoint.aep"||!FixedOutputComponent(policy.checkpointName,L".aep")||
        policy.snapshotRoot.canonicalPath.empty()||policy.snapshotRoot.canonicalPath.size()>32760||detail::Zero(policy.snapshotRoot.fileId)||
        (checkpoint&&detail::Zero(policy.checkpointLeaf))||(copy&&detail::Zero(policy.cleanCopyLeaf)))detail::Refuse("trusted_fixed_execution_scope_refused");
    std::vector<unsigned char> bytes;constexpr char domain[]="lcp2.production.fixed-execution-selector.v1";bytes.insert(bytes.end(),domain,domain+sizeof(domain)-1);
    bytes.insert(bytes.end(),policy.policyHash.begin(),policy.policyHash.end());bytes.insert(bytes.end(),policy.typedProducerHash.begin(),policy.typedProducerHash.end());
    // Every fixed operation commits this one pre-C1 source operand. A changed
    // checkpoint name/root cannot retain an old prepared scope or effect key.
    detail::PutU16(bytes,static_cast<std::uint16_t>(policy.checkpointName.size()));for(const auto c:policy.checkpointName)detail::PutU16(bytes,static_cast<std::uint16_t>(c));
    detail::PutU16(bytes,static_cast<std::uint16_t>(policy.snapshotRoot.canonicalPath.size()));for(const auto c:policy.snapshotRoot.canonicalPath)detail::PutU16(bytes,static_cast<std::uint16_t>(c));
    detail::PutPin(bytes,policy.snapshotRoot); // exact volume GUID + serial + FileId, forty bytes
    detail::PutU16(bytes,static_cast<std::uint16_t>(policy.rangeMode));detail::PutU16(bytes,static_cast<std::uint16_t>(policy.sampleMode));
    if(policy.ameTargetSpecifier.size()>11)detail::Refuse("trusted_fixed_ame_target_bound");detail::PutU16(bytes,static_cast<std::uint16_t>(policy.ameTargetSpecifier.size()));bytes.insert(bytes.end(),policy.ameTargetSpecifier.begin(),policy.ameTargetSpecifier.end());
    for(const auto* path:{&policy.manualQueueReservationRoot.canonicalPath,&policy.manualQueueReservationLocator}){if(path->size()>32760)detail::Refuse("trusted_fixed_manual_queue_root_bound");detail::PutU16(bytes,static_cast<std::uint16_t>(path->size()));for(const auto c:*path)detail::PutU16(bytes,static_cast<std::uint16_t>(c));}detail::PutPin(bytes,policy.manualQueueReservationRoot);
    for(const auto& variant:policy.variants)for(const auto* name:{&variant.workingName,&variant.snapshotName}){
        if(name->size()>255)detail::Refuse("trusted_fixed_copy_name_bound");detail::PutU16(bytes,static_cast<std::uint16_t>(name->size()));for(const auto c:*name)detail::PutU16(bytes,static_cast<std::uint16_t>(c));}
    if(checkpoint)bytes.insert(bytes.end(),policy.checkpointLeaf.begin(),policy.checkpointLeaf.end());
    if(copy)bytes.insert(bytes.end(),policy.cleanCopyLeaf.begin(),policy.cleanCopyLeaf.end());
    detail::PutU16(bytes,slot);detail::PutU16(bytes,static_cast<std::uint16_t>(leaf));return detail::Hash(bytes);
}
bool FixedExecutionScopeMatches(const ExecutionPolicy& policy,const Digest& scope)noexcept{try{
    if(detail::Zero(scope))return false;if(FixedExecutionScope(policy,0,ExecutionLeaf::Inspect)==scope)return true;
    if(FixedExecutionScope(policy,0,ExecutionLeaf::OwnedCheckpoint)==scope)return true;
    for(std::uint16_t slot=1;slot<=2;++slot)for(const auto leaf:{ExecutionLeaf::Inspect,ExecutionLeaf::StageVariant,ExecutionLeaf::EnqueueAme,ExecutionLeaf::StartAme,ExecutionLeaf::RestoreBaseline,ExecutionLeaf::CleanCopy})
        if(FixedExecutionScope(policy,slot,leaf)==scope)return true;return false;
}catch(...){return false;}}
bool FixedExecutionScopeAllowed(const ExecutionPolicy& policy,phase::ToolCode tool,phase::CallKind kind,const Digest& scope)noexcept{try{
    if(detail::Zero(scope))return false;for(std::uint16_t slot=0;slot<=2;++slot)for(const auto leaf:{ExecutionLeaf::Inspect,ExecutionLeaf::StageVariant,ExecutionLeaf::EnqueueAme,ExecutionLeaf::StartAme,ExecutionLeaf::RestoreBaseline,ExecutionLeaf::OwnedCheckpoint,ExecutionLeaf::CleanCopy})
        if(!(policy.SharedQueue()&&leaf==ExecutionLeaf::StartAme&&slot!=2)&&FixedExecutionIntentAllowed(tool,kind,slot,leaf)&&FixedExecutionScope(policy,slot,leaf)==scope)return true;return false;
}catch(...){return false;}}
bool ExecutionPolicy::Validate(ExecutionCost& fullLifetimeWorst)const noexcept{try{
    const bool queue=SharedQueue();
    if(!enabled||(!queue&&budgetProfile!=ExecutionBudgetProfile::FrozenTwoTitle86)||(!queue&&hqCriterion!=HqCriterion::EncodedDxv3HqAlpha)||(queue&&hqCriterion!=HqCriterion::None)||
        detail::Zero(policyHash)||detail::Zero(typedProducerHash)||detail::Zero(restorationLeaf)||detail::Zero(checkpointLeaf)||detail::Zero(cleanCopyLeaf)||
        (!queue&&(detail::Zero(mediaProducerHash)||detail::Zero(pngEncoderHash)||completionPollsPerJob!=kTwoTitlePollsPerJob||completionCadenceMs==0||jobDeadlineMs<=kTwoTitleMediaMaximumMs||completionCadenceMs>(jobDeadlineMs-kTwoTitleMediaMaximumMs)/completionPollsPerJob))||
        (queue&&(!detail::Zero(mediaProducerHash)||!detail::Zero(pngEncoderHash)||completionPollsPerJob||completionCadenceMs||jobDeadlineMs<=kSharedQueueMaximumPolls*kSharedQueuePollCadenceMs+10000))||jobDeadlineMs>phase::kSessionMaximumMs||
        !FixedAmeTargetSpecifier(ameTargetSpecifier)||snapshotRoot.canonicalPath.empty()||outputRoot.canonicalPath.empty()||detail::Zero(snapshotRoot.fileId)||detail::Zero(outputRoot.fileId)||manualQueueReservationRoot.canonicalPath.empty()||detail::Zero(manualQueueReservationRoot.fileId)||manualQueueReservationLocator.empty()||manualQueueReservationLocator.find(L'\0')!=std::wstring::npos||
        (snapshotRoot.canonicalPath==outputRoot.canonicalPath||SamePhysicalObject(snapshotRoot,outputRoot))||SamePhysicalObject(manualQueueReservationRoot,snapshotRoot)||SamePhysicalObject(manualQueueReservationRoot,outputRoot)||manualQueueReservationRoot.canonicalPath.size()>32760||manualQueueReservationLocator.size()>32760||snapshotLocator.empty()||outputLocator.empty()||ameLocator.empty())return false;
    if(selectionMode!=TitleSelectionMode::ExactNamedVariants&&selectionMode!=TitleSelectionMode::FirstTwoObservedTextStatesV1)return false;
    const bool observed=rangeMode==TitleRangeMode::FullObservedRootRangeV1;
    if((observed&&(selectionMode!=TitleSelectionMode::FirstTwoObservedTextStatesV1||sampleMode!=AlphaSampleMode::QuartileFramesV1||variants[0].rootName!=variants[0].compName))||
        (!observed&&(rangeMode!=TitleRangeMode::FrozenLiteralRange||sampleMode!=AlphaSampleMode::FrozenLiteralIndices)))return false;
    if(sourceProjectLocator.empty()||sourceProjectLocator.find(L'\0')!=std::wstring::npos||sourceProjectLocator.size()>32760||
        checkpointName!=L"titr_all-source-checkpoint.aep"||!FixedOutputComponent(checkpointName,L".aep")||snapshotRoot.canonicalPath.size()>32760)return false;
    if(variants[0].workingName!=L"titr_all-first-working.aep"||variants[1].workingName!=L"titr_all-second-working.aep")return false;
    for(const auto* file:queue?std::vector<const reviewed::File*>{&sourceProject,&ame,&preset}:std::vector<const reviewed::File*>{&sourceProject,&ame,&preset,&dxvExporter,&ffmpeg,&ffprobe})if(detail::Zero(file->pin.fileId)||detail::Zero(file->sha256)||file->pin.canonicalPath.empty())return false;
    if(queue?(!detail::Zero(encodedMappingDescriptor)||!encodedMappingVersion.empty()||!ffmpeg.pin.canonicalPath.empty()||!ffprobe.pin.canonicalPath.empty()||!settingsHelper.pin.canonicalPath.empty()):encodedMappingDescriptor!=FixedEncodedMappingDescriptor()||encodedMappingVersion!=kEncodedMappingVersion)return false;
    for(const auto& variant:variants){if(variant.variantId.empty()||variant.rootName.empty()||variant.compName.empty()||variant.controlledLayerNames.size()>64||
            (selectionMode==TitleSelectionMode::ExactNamedVariants&&(variant.controlledLayerNames.empty()||variant.activeLayerNames.empty()))||
            (selectionMode==TitleSelectionMode::FirstTwoObservedTextStatesV1&&(!variant.controlledLayerNames.empty()||!variant.activeLayerNames.empty()))||
            !FixedOutputComponent(variant.workingName,L".aep")||!FixedOutputComponent(variant.snapshotName,L".aep")||!FixedOutputComponent(variant.outputName,L".mov")||
            (observed?(variant.frameStart||variant.frameEnd||variant.frameRateNumerator||variant.frameRateDenominator):(variant.frameEnd<=variant.frameStart||!variant.frameRateNumerator||!variant.frameRateDenominator)))return false;
        for(std::size_t i=0;i<variant.controlledLayerNames.size();++i){if(variant.controlledLayerNames[i].empty()||std::find(variant.controlledLayerNames.begin(),variant.controlledLayerNames.begin()+static_cast<std::ptrdiff_t>(i),variant.controlledLayerNames[i])!=variant.controlledLayerNames.begin()+static_cast<std::ptrdiff_t>(i))return false;}
        for(std::size_t i=0;i<variant.activeLayerNames.size();++i){if(std::find(variant.controlledLayerNames.begin(),variant.controlledLayerNames.end(),variant.activeLayerNames[i])==variant.controlledLayerNames.end()||
                std::find(variant.activeLayerNames.begin(),variant.activeLayerNames.begin()+static_cast<std::ptrdiff_t>(i),variant.activeLayerNames[i])!=variant.activeLayerNames.begin()+static_cast<std::ptrdiff_t>(i))return false;}
        for(std::size_t i=0;!queue&&i<kTwoTitleAlphaSamples;++i){if(!FixedOutputComponent(variant.previewNames[i],L".png")||(observed?variant.alphaFrameIndices[i]!=0:variant.alphaFrameIndices[i]>=variant.frameEnd-variant.frameStart))return false;
            for(std::size_t j=0;j<i;++j)if((!observed&&variant.alphaFrameIndices[j]==variant.alphaFrameIndices[i])||_wcsicmp(variant.previewNames[j].c_str(),variant.previewNames[i].c_str())==0)return false;}}
    if(variants[0].variantId==variants[1].variantId||_wcsicmp(variants[0].snapshotName.c_str(),variants[1].snapshotName.c_str())==0||_wcsicmp(variants[0].outputName.c_str(),variants[1].outputName.c_str())==0||
        variants[0].rootName!=variants[1].rootName||variants[0].compName!=variants[1].compName||variants[0].controlledLayerNames!=variants[1].controlledLayerNames)return false;
    const std::array<const std::wstring*,5> aepNames{&checkpointName,&variants[0].workingName,&variants[1].workingName,&variants[0].snapshotName,&variants[1].snapshotName};
    for(std::size_t i=0;i<aepNames.size();++i)for(std::size_t j=0;j<i;++j)if(_wcsicmp(aepNames[i]->c_str(),aepNames[j]->c_str())==0)return false;
    if(selectionMode==TitleSelectionMode::FirstTwoObservedTextStatesV1&&(variants[0].frameStart!=variants[1].frameStart||variants[0].frameEnd!=variants[1].frameEnd||
        variants[0].frameRateNumerator!=variants[1].frameRateNumerator||variants[0].frameRateDenominator!=variants[1].frameRateDenominator))return false;
    if(queue){for(const auto& variant:variants)for(std::size_t i=0;i<kTwoTitleAlphaSamples;++i)if(!variant.previewNames[i].empty()||variant.alphaFrameIndices[i])return false;}
    else for(const auto& first:variants[0].previewNames)for(const auto& second:variants[1].previewNames)if(_wcsicmp(first.c_str(),second.c_str())==0)return false;
    if(!startup.Same(FixedTwoTitleCosts::Startup())||!initialRead.Same(FixedTwoTitleCosts::InitialRead())||!preparation.Same(FixedTwoTitleCosts::Preparation())||
        !checkpoint.Same(FixedTwoTitleCosts::Checkpoint())||!cleanCopy.Same(FixedTwoTitleCosts::CleanCopy())||!stage.Same(FixedTwoTitleCosts::Delivery())||
        !enqueued.Same(FixedTwoTitleCosts::Delivery())||!start.Same(FixedTwoTitleCosts::Delivery())||!restoration.Same(FixedTwoTitleCosts::Delivery())||
        (!queue&&(!poll.Same(FixedTwoTitleCosts::Poll())||!terminal.Same(FixedTwoTitleCosts::Terminal())||!media.Same(FixedTwoTitleCosts::Media())))||(queue&&(!poll.Same(FixedSharedQueueCosts::Poll())||!media.Empty()||!terminal.Same(FixedSharedQueueCosts::Terminal())))||!finalTeardown.Same(FixedTwoTitleCosts::Teardown()))return false;
    // File-HQ is an alternative criterion, not a synthetic used-settings
    // observation. Its disabled settings operations must have exactly zero
    // cost and cannot silently issue a SettingsCap or consume extra Calls.
    if(!queuedSettings.Empty()||!usedSettings.Empty())return false;
    ExecutionCost total;if(!total.Plus(startup,total)||!total.Plus(initialRead,total)||!total.Plus(preparation,total)||!total.Plus(checkpoint,total))return false;
    for(unsigned slot=0;slot<2;++slot){for(const auto* cost:queue?std::vector<const ExecutionCost*>{&cleanCopy,&stage,&enqueued,&terminal,&restoration}:std::vector<const ExecutionCost*>{&cleanCopy,&stage,&enqueued,&start,&terminal,&media,&restoration})if(!total.Plus(*cost,total))return false;
        for(std::uint32_t ordinal=0;ordinal<completionPollsPerJob;++ordinal)if(!total.Plus(poll,total))return false;}
    if(queue&&!total.Plus(start,total))return false;
    if(queue)for(std::uint16_t ordinal=0;ordinal<kSharedQueueMaximumPolls;++ordinal)if(!total.Plus(poll,total))return false;
    if(total.external>192-16||total.store>256-16||!total.Plus(finalTeardown,total)||!total.Same(queue?FixedSharedQueueCosts::Full():FixedTwoTitleCosts::Full()))return false;fullLifetimeWorst=total;return true;
}catch(...){return false;}}
}
