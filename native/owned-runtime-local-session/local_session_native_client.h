#pragma once
#include "enrollment_win32.h"
#include "phase_protocol.h"
#include "local_session_http_transport.h"
#include "trusted_execution.h"
#include <map>
#include <mutex>

namespace local_session { class PreparedLifecycleGrant; }
namespace local_session::trusted_read {
// Build-embedded fixed locators and source identities. The reviewed artifact
// sealing record is deliberately separate from source/Node pins (no self hash).
enum class Role : std::uint8_t { Controller=1,Daemon=2 };
enum class SourceCategory : std::uint8_t { FileDefault=1,NodeDefault=2,NodeCompileZero=3,InternalThis=4 };
enum class ContextSlot : std::uint8_t { None=0,Default=1,Internal=2 };
struct Source final {
    std::uint16_t selector=0;reviewed::File file;Digest compiled{};std::string url;
    // Zero role/category/length cannot grant admission. Both role inventories
    // and their complete byte sums are fixed before the original C1.
    std::uint8_t roles=0;SourceCategory category{};ContextSlot contextSlot{};
    std::uint32_t endLine=0,endColumn=0,length=0;
    std::uint64_t utf8ByteLength=0;
};
struct LoadedSource final {
    std::uint16_t selector=0;SourceCategory category{};ContextSlot contextSlot{};
    std::string scriptId,url,scriptLanguage,sourceMapURL,embedderName;
    std::uint32_t executionContextId=0,startLine=0,startColumn=0,endLine=0,endColumn=0,length=0;
    bool hasSourceURL=false,isModule=false,isLiveEdit=false,scriptAuxPresent=false,scriptAuxDefault=false,contextPresent=false;
    std::uint32_t contextId=0;std::u16string contextUniqueId,contextName,contextOrigin;
    bool contextAuxDefault=false;
    std::string correlationScriptId,correlationFunction,correlationUrl;
    std::uint32_t correlationLine=0,correlationColumn=0;
    Digest reportedHash{};std::vector<unsigned char> source;
};
struct CepSource final {std::uint16_t selector=0;std::string url;Digest compiled{};std::uint32_t startLine=0,startColumn=0,endLine=0,endColumn=0,length=0;std::uint64_t utf8ByteLength=0;bool diagnostic=false,hasSourceURL=false,isModule=false,isLiveEdit=false;};
struct LoadedCepSource final {std::uint16_t selector=0;std::string scriptId,url,sourceMapURL;std::uint32_t contextId=0,startLine=0,startColumn=0,endLine=0,endColumn=0,length=0;bool hasSourceURL=false,isModule=false,isLiveEdit=false;std::vector<unsigned char> source;};
struct CepCapture final {std::string targetId,frameId,contextUniqueId,contextOrigin,panelInstance,panelConnection,panelGeneration,panelChatSession;std::uint32_t contextId=0;std::uint64_t panelEpoch=0;std::vector<LoadedCepSource> sources;Digest catalog{};std::vector<unsigned char> actualQuiescence;};
struct Profile final {
    reviewed::File broker,addon,adapter,ae;
    std::vector<reviewed::File> cepImages,panelFiles;
    std::vector<Source> nodeSources;
    std::uint64_t controllerSourceBytes=0,daemonSourceBytes=0;
    std::vector<CepSource> cepSources;std::uint64_t cepSourceBytes=0;std::string cdpTargetUrl,cepContextOrigin,cepDiagnostic;
    ObjectPin panelRoot,panelBootstrapRoot;
    reviewed::File sealedArtifacts,transport;
    std::wstring repository,brokerLocator,addonLocator,nodeLocator,adapterLocator,aeLocator,panelBootstrapLocator;
    std::uint16_t bridgePort=3456,cdpPort=8870;
    // Exact reviewed bootstrap/startup closure and fixed project leaf are
    // compiled before C1. These are source commitments, never tool arguments.
    Digest panelBootstrapDescriptor{},panelBootstrapTemplateHash{},projectLeaf{};
    std::string projectScript;
    Digest projectScriptHash{};
    ExecutionPolicy execution;
};
const Profile& EmbeddedProfile(); // only a reviewed generated native header

enum class CapKind : std::uint8_t { Call=1,Handler=2,Bracket=3,Read=4,
    Challenge=5,ActorTarget=6,Observation=7,Command=8,Selected=9,Delivery=10,Terminal=11,Preactor=12,Disposition=13,Bootstrap=14,
    Manifest=15,ExecutionGate=16,AmeProcess=17,OriginalJob=18,CompletionPoll=19,Media=20,Settings=21,Restoration=22,OwnedCheckpoint=23,OwnedCleanCopy=24,OwnedSavedSnapshot=25,RestorationProgram=26 };
class NativeClient;
struct RestorationProgramCapture;
struct ProjectCapture;
class NativeExecutionBinding;
struct ObservationCapture;
struct HttpRequestFields final {
    std::string method,url,host,origin,token,adapter,toolLocatorHex;
    std::string panelConnection,panelGeneration,panelInstance;
    std::uint64_t panelEpoch=0;
    bool originPresent=false,parserComplete=false,aborted=false;
    std::vector<unsigned char> body;
};
class AuthenticatedRequest final {
public:
    AuthenticatedRequest(const AuthenticatedRequest&)=delete;AuthenticatedRequest& operator=(const AuthenticatedRequest&)=delete;
private:
    AuthenticatedRequest(NativeClient* original,std::shared_ptr<AcceptedConnection> connection,HttpRequestFields fields,bool panel,
        HttpRequestIoSnapshot originalIo,bool idleCandidate):
        owner_(original),connection_(std::move(connection)),fields_(std::move(fields)),panel_(panel),ioAtRetain_(originalIo),idleCandidate_(idleCandidate){}
    NativeClient* const owner_;const std::shared_ptr<AcceptedConnection> connection_;const HttpRequestFields fields_;const bool panel_;
    const HttpRequestIoSnapshot ioAtRetain_;const bool idleCandidate_;
    std::atomic<bool> handlerSpent_{false},responseTerminal_{false},unknown_{false};
    std::atomic<bool> idleDisqualified_{false};bool cleanupAttempted_=false;
    friend class NativeClient;
};
class Capability final {
public:
    ~Capability()=default;
    Capability(const Capability&)=delete;Capability& operator=(const Capability&)=delete;
private:
    Capability(NativeClient* owner,CapKind kind,const phase::Frame& frame);
    NativeClient* const owner_;
    const CapKind kind_;
    phase::Frame frame_{};
    std::shared_ptr<ProjectCapture> project_;
    std::shared_ptr<ObservationCapture> observation_;
    std::shared_ptr<ExecutionCapture> execution_;
    std::shared_ptr<AmeOriginalJob> job_;
    std::shared_ptr<AmeOriginalProcess> ame_;
    std::shared_ptr<OriginalMediaCapture> media_;
    std::shared_ptr<RestorationProgramCapture> restorationProgram_;
    std::shared_ptr<NativeTitleManifest> manifest_;
    std::shared_ptr<AuthenticatedRequest> ingress_; // retained original, never serialized
    std::uint16_t ownedFileSlot_=0;
    bool spent_=false;
    friend class NativeClient;
};
// Actual inherited Windows objects; numbers in the private creation environment
// only locate these objects. No constructor takes a PID or serialized receipt.
struct Bootstrap final {
    detail::Held originalPeer,originalController,input,output;
    phase::WireBindings bindings{};
    std::wstring pipe;
    // Transferred commitment from the original broker, not a reconstructed
    // PreparedLifecycleGrant or independently recomputed consumed-launch hash.
    std::uint64_t lifecycleIssuedAt=0,sessionDeadline=0,dispositionDeadline=0;
    Digest lifecycleBinding{};
    void* failedBootstrapWriter=nullptr; // checked close UNKNOWN, never retried
    Bootstrap()=default;Bootstrap(Bootstrap&&)=default;
    Bootstrap(const Bootstrap&)=delete;Bootstrap& operator=(const Bootstrap&)=delete;
};
struct ProjectDescriptor final {Id command{},execution{},lease{};std::string script;std::uint64_t expiresMono=0;};
// User intent is a typed selector and exact canonical tool bytes. It cannot
// carry project/actor/server-gate observations or manufacture a manifest.
struct ExecutionIntent final {phase::ToolCode tool{};phase::CallKind kind{};std::uint16_t slot=0;ExecutionLeaf leaf{};
    std::vector<unsigned char> canonicalBody;};
struct PanelReceipt final {Id command{},execution{},lease{};std::string panelConnection,panelGeneration;bool success=false;std::vector<unsigned char> result;};
Bootstrap ReceiveBootstrapFixed(Role receiver);
void SendBrokerBootstrapFixed(Bootstrap& original,const std::wstring& pipe,const Id& nonce);
// Used only by the original broker's consumed fixed daemon creation. All child
// creations in this module use the same restricted-inheritance critical section.
struct CreatedChild final {
    detail::Held process,thread;
    std::unique_ptr<Bootstrap> bootstrap;
    std::vector<void*> failedCloseHandles;
    Result status;
};

class NativeClient final : public HttpTransportOwner {
public:
    ~NativeClient();
    NativeClient(const NativeClient&)=delete;NativeClient& operator=(const NativeClient&)=delete;
    static std::unique_ptr<NativeClient> OpenControllerFixed();
    static std::unique_ptr<NativeClient> BindOriginalDaemonFixed();
    Role GetRole()const noexcept;
    void AssertCurrent() override;
    void AssertCapabilityCurrent(const std::shared_ptr<Capability>& cap);
    void AssertLoadedNodeCurrent();
    void AssertOriginalDispositionCurrent();
    std::shared_ptr<Capability> PollOriginalEvent();
    const char* OriginalEventKind(const std::shared_ptr<Capability>& event);
    void AcknowledgeOriginalDisposition(const std::shared_ptr<Capability>& event);
    void InvalidateLoadedNodeProof()noexcept;
    void InvalidateLoadedCepProof()noexcept;
    std::uint16_t HttpFixedPort()const noexcept override;
    bool OriginalCleanupCurrent(HttpCleanupOperation operation)noexcept override;
    bool ReadRevokedKnown()const noexcept override;
    // Native-only owner registration, never exported by the N-API surface.
    void BindHttpOwnerFixed(HttpTransportOwner& original);
    bool CheckOriginalHttpCleanup(HttpTransportOwner& original,HttpCleanupOperation operation)noexcept;
    void RevokeOnce()noexcept;
    phase::Frame Open();
    phase::Frame Ensure();
    phase::Frame Status();
    // Original START continuation only; none of these observations issue a cap.
    void ArmOriginalCompletionWaitFixed(const std::shared_ptr<Capability>& originalStart);
    phase::Frame WaitOriginalCompletionNoticeFixed(std::uint16_t slot);
    void CancelOriginalCompletionWaitFixed(std::uint16_t slot)noexcept;
    phase::Frame PublishOwnCompletionReadyFixed(const std::shared_ptr<Capability>& ownTerminal);
    std::shared_ptr<Capability> BeginCompletionFixed(std::uint16_t slot,const std::vector<unsigned char>& exactCanonicalBody);
    std::shared_ptr<Capability> VerifyCompletionToolFixed(const std::shared_ptr<AuthenticatedRequest>& originalRequest);
    std::vector<unsigned char> FinishOriginalCompletionFixed(const std::shared_ptr<Capability>& ownHandler);
    void CompleteOriginalCompletionResponseFixed(const std::shared_ptr<Capability>& ownHandler);
    std::shared_ptr<Capability> BeginPanel();
    std::shared_ptr<Capability> BeginBracket();
    std::shared_ptr<Capability> BeginRead(phase::ToolCode tool,const std::shared_ptr<Capability>& authorization);
    std::shared_ptr<Capability> BeginExecutionFixed(const ExecutionIntent& intent,const std::shared_ptr<Capability>& authorization);
    std::shared_ptr<Capability> BeginServerOnlyFixed(phase::ToolCode tool,const std::vector<unsigned char>& canonicalBody);
    std::shared_ptr<Capability> AdoptBracket(const std::shared_ptr<Capability>& bracket);
    // Incoming HTTP locators are compared against the original native ledger.
    // They are not exposed as a general connect/frame/issuer operation.
    std::shared_ptr<Capability> VerifyTool(const std::vector<unsigned char>& privateLocator,phase::ToolCode tool);
    std::vector<unsigned char> ToolLocator(const std::shared_ptr<Capability>& call);
    std::shared_ptr<Capability> TakeChallenge(const std::shared_ptr<Capability>& target);
    std::shared_ptr<Capability> SubmitObservation(const std::shared_ptr<Capability>& challenge,
        const std::shared_ptr<Capability>& observation);
    std::shared_ptr<Capability> ObserveActor(const std::shared_ptr<Capability>& handler,
        const std::shared_ptr<Capability>& observation);
    std::shared_ptr<Capability> BindProjectFixed(const std::shared_ptr<Capability>& handler);
    ProjectDescriptor DescribeProject(const std::shared_ptr<Capability>& project);
    std::shared_ptr<Capability> SelectProject(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& actualRequest);
    std::shared_ptr<Capability> GuardProject(const std::shared_ptr<Capability>& selected);
    void RecordProjectDelivery(const std::shared_ptr<Capability>& delivery,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualResponse);
    void RecordProjectSubmission(const std::shared_ptr<Capability>& project,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualBody);
    std::shared_ptr<Capability> CaptureProjectResultFixed(const std::shared_ptr<Capability>& project,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualBody);
    const std::vector<unsigned char>& OriginalRequestBody(const std::shared_ptr<AuthenticatedRequest>& request);
    std::shared_ptr<Capability> FinishStatus(const std::shared_ptr<Capability>& handler,const Digest& result);
    std::shared_ptr<Capability> CaptureOriginalAeFixed();
    void AssertPreactorCurrent(const std::shared_ptr<Capability>& preactor);
    const Profile& BootstrapObserverDefinition(const std::shared_ptr<Capability>& preactor);
    std::shared_ptr<Capability> ReservePanelBootstrapFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& preactor);
    void LaunchPanelBootstrapFixed(const std::shared_ptr<Capability>& bootstrap,const std::shared_ptr<Capability>& preactor);
    void AssertBootstrapSettled();
    std::shared_ptr<Capability> CaptureOriginalAeCepFixed();
    std::shared_ptr<Capability> CaptureObservationFixed(const std::shared_ptr<Capability>& target,
        const std::shared_ptr<Capability>& challenge,const std::shared_ptr<AuthenticatedRequest>& request,const CepCapture& actual);
    const Profile& CepObserverDefinition(const std::shared_ptr<Capability>& target);
    phase::Frame ObservationChallengeDescriptor(const std::shared_ptr<Capability>& challenge);
    std::vector<unsigned char> PreparationQuiescenceDescriptorFixed(const std::shared_ptr<Capability>& challenge);
    void AssertCapturedCurrent(const std::shared_ptr<Capability>& target);
    std::vector<Source> NodeSourceInventory()const;
    std::uint64_t NodeSourceByteBudget()const;
    std::vector<reviewed::File> PanelSourceInventory()const;
    std::vector<unsigned char> FixedTransport();
    std::vector<unsigned char> FixedDaemonTransport();
    std::uint64_t MonotonicNow()const;
    std::vector<unsigned char> OriginalDeadlineProjectionFixed(const std::shared_ptr<Capability>& command={});
    bool Unknown()const noexcept;
    std::unique_ptr<FixedHttpListener> OpenHttpListenerFixed();
    // Called only for an original native accepted connection after HTTP auth.
    // The tuple is observed from that retained socket, never caller supplied.
    void AssertSocketPeer(AcceptedConnection& connection);
    void AuthenticateSocketRequest(AcceptedConnection& connection,const std::string& token,bool panel);
    std::shared_ptr<AuthenticatedRequest> RetainAuthenticatedRequest(std::shared_ptr<AcceptedConnection> connection,HttpRequestFields fields);
    std::shared_ptr<Capability> VerifyTool(const std::shared_ptr<AuthenticatedRequest>& request,phase::ToolCode tool);
    std::shared_ptr<Capability> VerifyExecutionTool(const std::shared_ptr<AuthenticatedRequest>& request,phase::ToolCode tool);
    std::shared_ptr<Capability> VerifyServerOnlyTool(const std::shared_ptr<AuthenticatedRequest>& request,phase::ToolCode tool);
    const std::vector<unsigned char>& OriginalServerOnlyBody(const std::shared_ptr<Capability>& handler);
    std::shared_ptr<Capability> FinishServerOnlyFixed(const std::shared_ptr<Capability>& handler,const std::vector<unsigned char>& actualResult);
    std::shared_ptr<Capability> CaptureOriginalAmeFixed();
    std::shared_ptr<Capability> BindOriginalJobFixed(const std::shared_ptr<Capability>& successfulStartTerminal);
    std::vector<unsigned char> ReadSharedQueueStateFixed();
    void AcknowledgeSharedQueueIoFixed(const std::shared_ptr<Capability>& original);
    std::vector<unsigned char> OriginalCompletionPollDescriptorFixed(const std::shared_ptr<Capability>& originalJob);
    ProjectDescriptor DescribeOriginalCompletionPollFixed(const std::shared_ptr<Capability>& originalPoll);
    std::shared_ptr<Capability> SelectOriginalCompletionPollFixed(const std::shared_ptr<Capability>& originalPoll,const std::shared_ptr<AuthenticatedRequest>& actualRequest);
    void RecordOriginalCompletionPollDeliveryFixed(const std::shared_ptr<Capability>& originalPoll,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actual);
    bool IsOriginalCompletionPoll(const std::shared_ptr<Capability>& command);
    std::vector<unsigned char> OriginalCompletionFactsFixed(const std::shared_ptr<Capability>& originalJob);
    void AbandonOriginalCompletionPollFixed(const std::shared_ptr<Capability>& originalPoll);
    std::vector<unsigned char> AmeSourceInspectionDescriptorFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame);
    std::vector<unsigned char> AmeDeliveryDescriptorFixed(const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame);
    bool IsAmeCommand(const std::shared_ptr<Capability>& command);
    std::vector<unsigned char> AmeCommandFactsFixed(const std::shared_ptr<Capability>& command);
    std::vector<unsigned char> AmeQueuePreparationFactsFixed(const std::shared_ptr<Capability>& originalQueueTerminal);
    void AssertAmeCommandCurrentFixed(const std::shared_ptr<Capability>& command);
    std::shared_ptr<Capability> ExecuteOwnedCheckpointFixed(const std::shared_ptr<Capability>& gate);
    std::vector<unsigned char> DescribeOwnedCheckpointFixed(const std::shared_ptr<Capability>& checkpoint);
    std::shared_ptr<Capability> ExecuteOwnedCleanCopyFixed(const std::shared_ptr<Capability>& gate);
    std::vector<unsigned char> DescribeOwnedCleanCopyFixed(const std::shared_ptr<Capability>& copy);
    std::vector<unsigned char> StageOperationDescriptorFixed(const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& workingCopy);
    bool IsStageCommand(const std::shared_ptr<Capability>& command);
    bool IsRestorationCommand(const std::shared_ptr<Capability>& command);
    std::shared_ptr<Capability> CaptureOwnedSavedSnapshotFixed(const std::shared_ptr<Capability>& successfulStageTerminal);
    std::vector<unsigned char> DescribeOwnedSavedSnapshotFixed(const std::shared_ptr<Capability>& snapshot);
    std::shared_ptr<Capability> CaptureSelectionFixed(const std::shared_ptr<Capability>& projectRead,const std::shared_ptr<Capability>& compRead,const std::shared_ptr<Capability>& rootRead);
    std::vector<unsigned char> DescribeSelectionFixed(const std::shared_ptr<Capability>& selection);
    std::shared_ptr<Capability> CaptureManifestFixed(const std::shared_ptr<Capability>& selection,const std::shared_ptr<Capability>& graphRead);
    std::vector<unsigned char> ExecutionPreparationDescriptorFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead);
    std::vector<unsigned char> ExecutionGateDescriptorFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,
        const std::shared_ptr<Capability>& proposal,const std::shared_ptr<Capability>& dryRun,const std::shared_ptr<Capability>& currentRead,const std::shared_ptr<AuthenticatedRequest>& panelRequest);
    std::vector<unsigned char> ManualExecutionPreflightFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead);
    void AcceptOriginalManualAdoptFixed(const std::shared_ptr<Capability>& proposal,const std::shared_ptr<Capability>& dryRun,
        const std::shared_ptr<AuthenticatedRequest>& originalRequest);
    std::vector<unsigned char> RestorationProgramDescriptorFixed(const std::shared_ptr<Capability>& stageGate,const std::shared_ptr<Capability>& workingCopy);
    std::vector<unsigned char> RestorationDeliveryDescriptorFixed(const std::shared_ptr<Capability>& restoreGate,const std::shared_ptr<Capability>& program);
    std::vector<unsigned char> RestorationDebtFactsFixed();
    std::vector<unsigned char> RestorationQuiescenceDescriptorFixed(const std::shared_ptr<Capability>& challenge);
    std::vector<unsigned char> PreparationResultDescriptorFixed(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual);
    bool IsPreparationCommand(const std::shared_ptr<Capability>& command);
    const std::vector<unsigned char>& OriginalExecutionBody(const std::shared_ptr<Capability>& handler);
    ProjectDescriptor DescribeExecution(const std::shared_ptr<Capability>& command);
    phase::ToolCode ExecutionToolForCommand(const std::shared_ptr<Capability>& command);
    std::shared_ptr<Capability> SelectExecution(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& actualRequest);
    std::shared_ptr<Capability> GuardExecution(const std::shared_ptr<Capability>& selected);
    void RecordExecutionDelivery(const std::shared_ptr<Capability>& delivery,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualResponse);
    void RecordExecutionSubmission(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualBody);
    std::shared_ptr<Capability> CaptureExecutionResultFixed(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualBody);
    void CompleteAuthenticatedResponse(const std::shared_ptr<AuthenticatedRequest>& request,std::uint32_t status,const std::vector<unsigned char>& bytes);
    void CompleteOriginalIdleRequestCleanup(const std::shared_ptr<AuthenticatedRequest>& request);
    void FailAuthenticatedResponse(const std::shared_ptr<AuthenticatedRequest>& request)noexcept;
    void AssertFixedDaemonModule(const std::wstring& actualFilename);
    void BindLoadedNodeProof(const std::vector<LoadedSource>& sources);
private:
    struct Data;
    // Only the original broker's consumed daemon launch can use enrollment's
    // private held-source seam; no caller-facing creation operation exists.
    static CreatedChild CreateOriginalDaemonFixed(InstalledEnrollment& enrollment,
        const phase::WireBindings& binding,const std::wstring& pipe,void* originalController,
        const PreparedLifecycleGrant& lifecycle);
    static CreatedChild CreateFixedChild(Role childRole,
        const std::shared_ptr<production::OriginalSealWitness>& original,
        const phase::WireBindings& binding,const std::wstring& pipe,
        InstalledEnrollment* enrollment,const PreparedLifecycleGrant* lifecycle,void* originalController);
    friend class ::local_session::OriginalDaemon;
    explicit NativeClient(std::unique_ptr<Data> data);
    phase::Frame Exchange(phase::Verb verb,const std::vector<unsigned char>& payload,bool lifecycle=false);
    void RetainOriginalCompletionNoticeLocked(const phase::Frame& notice);
    std::vector<unsigned char> OriginalCompletionProjectionFixed(std::uint16_t slot)const;
    std::shared_ptr<Capability> Own(CapKind kind,const phase::Frame& frame);
    Capability& Require(const std::shared_ptr<Capability>& cap,CapKind kind);
    void RequireRole(Role role);
    bool CheckOriginalHttpCleanupLocked(HttpTransportOwner& original,HttpCleanupOperation operation)noexcept;
    void AssertOriginalJobObservationCurrent(const std::shared_ptr<AmeOriginalJob>& original);
    bool SharedQueuedJobCurrent(const std::shared_ptr<AmeOriginalJob>& original);
    std::shared_ptr<Capability> BindSharedQueueFixed(const std::shared_ptr<Capability>& terminal);
    void AssertSharedQueueObservationCurrent();
    void AssertSharedQueueResponseIoCurrent();
    std::vector<unsigned char> SharedQueuePollDescriptorFixed(const std::shared_ptr<Capability>& original);
    std::shared_ptr<Capability> BeginSharedQueuePollFixed(const std::shared_ptr<Capability>& original,const std::string& source,const std::string& body);
    std::shared_ptr<Capability> CaptureSharedQueueObservationFixed(const std::shared_ptr<Capability>& poll,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual);
    // Only the fixed N-API producer may deliver generated source captured from
    // the retained main-module getter. No JS method accepts source/result JSON.
    std::shared_ptr<Capability> BindReadonlyExecutionFixed(const std::shared_ptr<Capability>& handler,const std::string& originalGeneratedSource);
    std::shared_ptr<Capability> BindPreparationDeliveryFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,
        const std::shared_ptr<Capability>& currentRead,const std::string& originalGeneratedSource);
    std::shared_ptr<Capability> CapturePreparationResultFixed(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& request,
        const PanelReceipt& actual,const std::vector<unsigned char>& originalGetterProof);
    std::shared_ptr<Capability> ProjectPreparationReadFixed(const std::shared_ptr<Capability>& preparationTerminal);
    std::shared_ptr<Capability> CaptureExecutionPreparationFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead,const std::vector<unsigned char>& originalGetterProof);
    std::shared_ptr<Capability> CaptureServerGatesFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,
        const std::shared_ptr<Capability>& proposal,const std::shared_ptr<Capability>& dryRun,const std::shared_ptr<Capability>& currentRead,const std::shared_ptr<AuthenticatedRequest>& panelRequest,const std::vector<unsigned char>& originalGetterProof);
    NativeTitleManifest& RequireExecutionBaseline(const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead);
    NativeTitleManifest& RequireFixedExecutionCurrent(const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead,
        std::uint16_t slot,ExecutionLeaf leaf);
    std::vector<unsigned char> StageDescriptorFixed(const std::shared_ptr<Capability>& stageGate,const std::shared_ptr<Capability>& workingCopy,bool requireProgram);
    std::shared_ptr<Capability> CaptureRestorationProgramFixed(const std::shared_ptr<Capability>& stageGate,const std::shared_ptr<Capability>& workingCopy,const std::string& originalProgramPrefix,const std::string& originalProgramSuffix);
    std::shared_ptr<Capability> BindRestorationDeliveryFixed(const std::shared_ptr<Capability>& restoreGate,const std::shared_ptr<Capability>& program,const std::string& originalGeneratedSource);
    void AssertRestorationDispatchCurrent(const std::shared_ptr<ProjectCapture>& original);
    void ValidateOriginalRestorationResult(const std::shared_ptr<ProjectCapture>& original,const std::vector<unsigned char>& actualResult);
    void CaptureProjectReadCurrentFixed(const std::shared_ptr<ProjectCapture>& original,const std::vector<unsigned char>& actualResult);
    std::shared_ptr<Capability> ExecuteOwnedFileFixed(const std::shared_ptr<Capability>& gate,ExecutionLeaf leaf);
    std::shared_ptr<Capability> BindStageDeliveryFixed(const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& workingCopy,const std::string& originalGeneratedSource);
    void AssertStageDispatchCurrent(const std::shared_ptr<ProjectCapture>& original);
    void ValidateOriginalStageResult(const std::shared_ptr<ProjectCapture>& original,const std::vector<unsigned char>& actualResult);
    std::shared_ptr<Capability> BindAmeSourceInspectionFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame,
        const std::string& originalGeneratedSource,const std::string& originalBridgeTalkBody);
    std::shared_ptr<Capability> BindAmeDeliveryFixed(const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame,
        const std::string& originalGeneratedSource,const std::string& originalBridgeTalkBody);
    std::shared_ptr<Capability> BindAmeCommandFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame,
        const std::string& originalGeneratedSource,const std::string& originalBridgeTalkBody,bool sourceInspection);
    void AssertAmeDispatchCurrent(const std::shared_ptr<ProjectCapture>& original);
    void ValidateOriginalAmeResult(const std::shared_ptr<ProjectCapture>& original,const std::vector<unsigned char>& actualResult);
    void CommitOriginalAmeResult(const std::shared_ptr<ProjectCapture>& original,const std::shared_ptr<Capability>& terminal);
    void CaptureOriginalAmeManualReservationFixed(const std::shared_ptr<Capability>& command,const std::vector<unsigned char>& originalGetterReceipt);
    std::shared_ptr<Capability> BeginOriginalCompletionPollFixed(const std::shared_ptr<Capability>& originalJob,const std::string& originalScript,const std::string& originalBridgeTalkBody);
    std::shared_ptr<Capability> CaptureOriginalJobObservationFixed(const std::shared_ptr<Capability>& originalPoll,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actual);
    void AssertOriginalCompletionPollCurrent(const std::shared_ptr<Capability>& originalPoll);
    void AssertOriginalAmeUniqueCurrent(const std::shared_ptr<AmeOriginalJob>& originalJob);
    std::shared_ptr<Capability> SelectOwnCommand(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& actualRequest,bool inspection);
    std::shared_ptr<Capability> GuardOwnCommand(const std::shared_ptr<Capability>& selected,bool inspection);
    void RecordOwnDelivery(const std::shared_ptr<Capability>& delivery,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualResponse,bool inspection);
    void RecordOwnSubmission(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualBody,bool inspection);
    std::shared_ptr<Capability> CaptureOwnResultFixed(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& actualRequest,const PanelReceipt& actualBody,bool inspection);
    friend class OriginalMediaCapture;
    friend class NativeExecutionBinding;
    std::unique_ptr<Data> data_;
};
} // namespace local_session::trusted_read
