#pragma once
#include "enrollment_win32.h"
#include "phase_protocol.h"
#include "trusted_execution_budget.h"
#include "owned_observed_timing.h"
#include <array>
#include <memory>

namespace local_session::trusted_read {
class NativeClient;class Capability;class AuthenticatedRequest;struct ProjectCapture;
// Source-selected operations. Proposal IDs, script hashes, UUIDs and polling
// ordinals bind an attempt; none of them change these stable effect keys.
enum class ExecutionLeaf : std::uint16_t {Inspect=4,StageVariant=5,EnqueueAme=6,StartAme=7,
    RestoreBaseline=8,SettingsQueued=9,SettingsUsed=10,CompletionPoll=11,JobTerminal=12,MediaTerminal=13,
    OwnedCheckpoint=14,CleanCopy=15};
constexpr std::uint32_t kExecutionGateMask=0x00ff;
enum class FrozenParameterSemantics : std::uint8_t {Unverified=0,OriginalEncodingJobParameters=1};
enum class HqCriterion : std::uint8_t {None=0,EncodedDxv3HqAlpha=1,FrozenUsedSettings=2};
Digest FixedEncodedMappingDescriptor()noexcept;
constexpr const char* kEncodedMappingVersion="FFmpeg-n9.0.2-DXV3-YG10-HQ-alpha-v1";
struct UiaFieldSelector final {std::wstring automationId,className,name;std::uint32_t controlType=0;};
struct AmeSettingsDescriptor final {
    Digest descriptorHash{},semanticMappingHash{};std::wstring locale,exporterFormat;
    UiaFieldSelector originalQueueRow,jobSource,jobOutput,jobComp,jobRange,jobPreset,actualFormat,actualCompression,actualAlpha,parameterRevision,frozenParameterState;
    std::wstring highQualityValue,alphaValue,frozenParameterValue;
    FrozenParameterSemantics parameterSemantics=FrozenParameterSemantics::Unverified;
    std::uint32_t maximumWindows=0,maximumElements=0,maximumDepth=0,maximumBytes=0;
    std::uint64_t deadlineMs=0;
};
struct VariantSelector final {std::wstring variantId,rootName,compName;std::vector<std::wstring> controlledLayerNames,activeLayerNames;
    std::wstring workingName,snapshotName,outputName;std::array<std::wstring,kTwoTitleAlphaSamples> previewNames{};
    std::array<std::uint32_t,kTwoTitleAlphaSamples> alphaFrameIndices{};
    std::uint32_t frameStart=0,frameEnd=0,frameRateNumerator=0,frameRateDenominator=0;};
enum class ExecutionBudgetProfile : std::uint8_t {None=0,FrozenTwoTitle86=1};
enum class TitleSelectionMode : std::uint8_t {ExactNamedVariants=1,FirstTwoObservedTextStatesV1=2};
enum class TitleRangeMode : std::uint8_t {FrozenLiteralRange=1,FullObservedRootRangeV1=2};
enum class AlphaSampleMode : std::uint8_t {FrozenLiteralIndices=1,QuartileFramesV1=2};
struct ExecutionPolicy final {
    bool enabled=false;ExecutionBudgetProfile budgetProfile=ExecutionBudgetProfile::None;
    TitleSelectionMode selectionMode=TitleSelectionMode::ExactNamedVariants;
    TitleRangeMode rangeMode=TitleRangeMode::FrozenLiteralRange;AlphaSampleMode sampleMode=AlphaSampleMode::FrozenLiteralIndices;
    Digest policyHash{},typedProducerHash{},restorationLeaf{},checkpointLeaf{},cleanCopyLeaf{},mediaProducerHash{},pngEncoderHash{};
    HqCriterion hqCriterion=HqCriterion::None;Digest encodedMappingDescriptor{};std::string encodedMappingVersion;
    std::string ameTargetSpecifier;
    std::array<VariantSelector,2> variants{};reviewed::File sourceProject,ame,preset,dxvExporter,ffmpeg,ffprobe,settingsHelper;
    std::wstring sourceProjectLocator,checkpointName;
    ObjectPin snapshotRoot,outputRoot,manualQueueReservationRoot;std::wstring snapshotLocator,outputLocator,ameLocator,settingsHelperLocator,manualQueueReservationLocator;
    AmeSettingsDescriptor settings;std::uint32_t completionPollsPerJob=0;std::uint64_t completionCadenceMs=0,jobDeadlineMs=0;
    // Each row is an exact source-owned operation cost; zero/missing and any
    // excess fail before effects. Six existing media child invocations per job.
    ExecutionCost preparation,checkpoint,cleanCopy,stage,enqueued,start,queuedSettings,usedSettings,poll,terminal,media,restoration,startup,initialRead,finalTeardown;
    bool Validate(ExecutionCost& fullLifetimeWorst)const noexcept;
};
// A closed operation selector, not an actor/project/M100 attestation. Dynamic
// identities are captured by the private daemon producer after Call admission.
Digest FixedExecutionScope(const ExecutionPolicy& policy,std::uint16_t slot,ExecutionLeaf leaf);
bool FixedExecutionScopeMatches(const ExecutionPolicy& policy,const Digest& scope)noexcept;
bool FixedExecutionIntentAllowed(phase::ToolCode tool,phase::CallKind kind,std::uint16_t slot,ExecutionLeaf leaf)noexcept;
bool FixedExecutionScopeAllowed(const ExecutionPolicy& policy,phase::ToolCode tool,phase::CallKind kind,const Digest& scope)noexcept;
bool FixedAmeTargetSpecifier(const std::string& target)noexcept;
// Fixed source selectors only; no capability or job/proposal/ordinal input.
Digest FixedOriginalCompletionLeaf(const ExecutionPolicy& policy,std::uint16_t slot,std::uint16_t purpose);
struct NativeTitleLayer final {std::uint64_t id=0;std::wstring name;Digest contentHash{};bool enabled=false;};
struct NativeTitleState final {ObjectPin project;Digest projectHash{},revision{},graphHash{},owner{};std::uint64_t rootId=0,compId=0;
    std::uint32_t width=0,height=0,frameStart=0,frameCount=0,rateNumerator=0,rateDenominator=0;
    bool savedClean=false;TitleRangeMode rangeMode=TitleRangeMode::FrozenLiteralRange;AlphaSampleMode sampleMode=AlphaSampleMode::FrozenLiteralIndices;
    observed_timing::ResolvedObservedRootTimingV1 observedTiming{};
    std::vector<NativeTitleLayer> controlled;std::vector<ObjectPin> dependencies;};
class OriginalMediaCapture;
// Retained preparation/gate facts belong to one original native instance.
// The fixed main-module getter is the only producer seam; no public JSON
// constructor or caller-supplied result/ready bit reaches this row.
class ExecutionCapture final {
private:
    explicit ExecutionCapture(NativeClient* original):owner_(original){}
    NativeClient* const owner_;
    enum class Stage:std::uint8_t{Prepared,Authorized,Unknown};
    Stage stage=Stage::Prepared;phase::ToolCode tool{};std::uint16_t slot=0;ExecutionLeaf leaf{};
    Digest scope{},result{},manifest{},proposal{},dryRun{},project{},leaves{},observation{};
    Id call{},handler{},actor{};std::uint64_t issued=0,expiry=0;
    std::vector<unsigned char> originalProof;
    std::string originalPanelConnection,originalPanelGeneration,originalPanelInstance,originalPanelSession;
    std::uint64_t originalPanelEpoch=0;bool panelAdopted=false;
    std::shared_ptr<Capability> originalHandler,originalManifest,currentRead,proposalTerminal,dryRunTerminal;
    std::shared_ptr<AuthenticatedRequest> originalPanelRequest;
    friend class NativeClient;
};
class NativeTitleManifest final {
private:
    enum class Stage:std::uint8_t{SelectionCaptured,Complete,Unknown};
    explicit NativeTitleManifest(NativeClient* owner):owner_(owner){}
    NativeClient* const owner_;Stage stage_=Stage::SelectionCaptured;
    NativeTitleState state_;std::array<std::uint64_t,2> selectedIds_{};std::array<std::string,2> selectedTexts_{};
    std::uint64_t nativeRevision_=0,capturedAt_=0;Digest sourceInventoryHash_{},graphReceipt_{},selectionCommit_{};
    std::vector<unsigned char> originalUiBaseline_;
    std::shared_ptr<Capability> projectRead_,compRead_,rootRead_,graphRead_;
    friend class NativeClient;
};
class AmeOriginalProcess final {
private:
    explicit AmeOriginalProcess(NativeClient* owner):owner_(owner){}
    NativeClient* const owner_;detail::Held process_,image_,exporterFile_;std::vector<detail::Held> sourceAncestors_;
    reviewed::File imagePin_,exporterPin_;std::wstring sid_;std::uint32_t pid_=0;std::uint64_t birth_=0;
    std::uintptr_t exporterBase_=0;std::uint64_t exporterSize_=0;Digest loadedExecutableSections_{};
    bool Current()const noexcept;
    bool unknown_=false;friend class NativeClient;friend class OriginalMediaCapture;
};
class AmeOriginalJob final {
private:
    enum class Stage:std::uint8_t{SourcePending,SourceInspected,EnqueueSelected,Enqueued,StartSelected,Started,SuccessfulTerminal,MediaAccepted,Unknown};
    explicit AmeOriginalJob(NativeClient* owner):owner_(owner){}
    NativeClient* const owner_;std::shared_ptr<AmeOriginalProcess> process_;std::shared_ptr<Capability> startDelivery_;
    std::shared_ptr<Capability> enqueuedTerminal_,startTerminal_,sourceInspection_,savedSnapshot_,sourceHandler_,queueHandler_,queueInspection_;
    Id originalActor_{};std::string batchId_,wrapperHandle_,enqueueRequestNonce_,nativeSessionNonce_,sourceRequestNonce_,sourceOperationBinding_,targetSpecifier_;
    std::string enqueueOperationBinding_,startRequestNonce_,startOperationBinding_,presetPath_,processBinding_,presetIdentity_,presetId_;
    bool probeNonceNull_=true,sourceBound_=false,queueBound_=false;Digest sourceScriptHash_{},sourceBodyHash_{};std::string queueRequestNonce_,queueOperationBinding_;std::vector<unsigned char> queueResult_;
    detail::Held source_,preset_,outputRoot_;ObjectPin sourcePin_,presetPin_,outputRootPin_;
    std::vector<detail::Held> fileAncestors_;
    std::vector<unsigned char> queueManifest_,manualReservationBytes_;Digest queueManifestHash_{},manualReservationHash_{};
    detail::Held manualReservation_,manualReservationRoot_;ObjectPin manualReservationPin_;bool manualReservationAttempted_=false;
    Digest sourceHash_{},presetHash_{},selector_{},wrapperBinding_{},startReceipt_{},terminalReceipt_{},grantHash_{};
    Id session_{},generation_{},boot_{},jobRef_{},terminalRef_{};std::uint16_t slot_=0;
    std::string sourceGuid_,wrapperNonce_,sourcePath_,outputPath_;std::wstring outputName_;
    std::uint32_t width_=0,height_=0,frameCount_=0,rateNumerator_=0,rateDenominator_=0;
    std::vector<std::uint32_t> alphaIndices_;std::uint64_t issued_=0,deadline_=0,nextPoll_=1;
    std::uint16_t rawReadAllowance_=0,mediaChildAllowance_=0;Stage stage_=Stage::SourcePending;
    struct MediaReservation final {Id terminal{},poll{};Digest hash{},head{},outputHash{};ObjectPin outputPin;std::array<Digest,6> keys{};std::array<bool,6> spent{};
        std::uint64_t sequence=0,epoch=0;bool complete=false,unknown=false;};
    std::unique_ptr<MediaReservation> mediaReservation_;detail::Held output_;ObjectPin outputPin_;Digest outputHash_{};
    std::shared_ptr<Capability> pendingPoll_,acceptedTerminal_;Id pollRef_{},pollNonce_{},pollRequestNonce_{};Digest pollBinding_{},pollCommit_{};
    std::array<unsigned char,272> acceptedTerminalFactualOpening_{};Digest terminalResultHash_{};
    bool publicationSpent_=false,published_=false,officialFinish_=false,officialResponseVerified_=false,officialCleanupSpent_=false,mediaBarrierCleared_=false;
    std::shared_ptr<Capability> officialHandler_;
    std::shared_ptr<ProjectCapture> preparingPoll_;
    std::uint64_t activePoll_=0,pollExpiry_=0,nextPollAt_=0,finalPoll_=0;bool pollPreparing_=false,terminalAttempted_=false;
    bool mediaAttempted_=false,d47Attempted_=false,unknown_=false;friend class NativeClient;friend class OriginalMediaCapture;
};
// Native only: no public constructor/fromJSON/boolean setter or issuer. UIA
// feasibility reports and technically valid media JSON cannot instantiate it.
class AmeSettingsCapture final {
public:AmeSettingsCapture(const AmeSettingsCapture&)=delete;AmeSettingsCapture& operator=(const AmeSettingsCapture&)=delete;
private:
    explicit AmeSettingsCapture(NativeClient* owner):owner_(owner){}
    NativeClient* const owner_;std::shared_ptr<AmeOriginalJob> job_;std::shared_ptr<AmeOriginalProcess> process_;
    std::shared_ptr<Capability> observationRight_;Digest selector{},descriptor{},raw{},exporter{},preset{},parameters{},startBinding{};
    std::uint16_t slot=0;std::uint64_t capturedAt=0,ordinal=0,deadline=0;
    bool observedQueued=false,usedFrozenParameters=false,highQuality=false,alpha=false,spent=false,unknown=false;
    friend class NativeClient;
};
}
