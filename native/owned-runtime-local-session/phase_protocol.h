#pragma once

// LCP2 is a separate, CLOSED protocol. Nothing in this file selects, upgrades,
// auto-detects or grants authority to the frozen 128-byte LCSB protocol.
#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF) && defined(AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS)
#error Synthetic LCP2 proof must never be combined with installed broker seams.
#endif
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
#if AE_AGENT_PHASE_NATIVE_PANEL_PROFILE != 1 || !defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE) || AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE != 1
#error Native PANEL requires the separate exact synthetic native profile; no production panel issuer.
#endif
#endif
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF) && AE_AGENT_PHASE_SYNTHETIC_PROOF != 1
#error Synthetic proof requires the exact isolated macro value 1; no boolean fallback.
#endif
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
#if AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE != 1 || !defined(AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS) || AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS != 1
#error Native phase proof requires exact installed seams and profile value 1.
#endif
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF) || defined(AE_AGENT_FENCE_PREREQUISITE_TEST_ONLY) || defined(AE_AGENT_DURABILITY_PREREQUISITE_TEST_ONLY)
#error Native OS phase proof cannot use pure or prerequisite authority substitutes.
#endif
#endif
#if defined(AE_AGENT_PHASE_PRODUCTION_TARGET) && (defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE) || defined(AE_AGENT_PHASE_SYNTHETIC_PROOF))
#error Ordinary LocalSessionBroker target cannot compile a phase proof profile.
#endif
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
#if AE_AGENT_PHASE_TRUSTED_READ_PROFILE != 1 || !defined(AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS) || defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE) || defined(AE_AGENT_PHASE_SYNTHETIC_PROOF) || defined(AE_AGENT_PHASE_PRODUCTION_TARGET)
#error Trusted READ requires its separate exact installed target, never an ordinary or synthetic upgrade.
#endif
#endif

namespace local_session { class Broker; namespace trusted_read { class NativeClient; } }
namespace local_session::phase {

using Id = std::array<std::uint8_t, 16>;
using Digest = std::array<std::uint8_t, 32>;
constexpr std::size_t kHeaderBytes = 96;
constexpr std::size_t kMaximumFrameBytes = 4096;
constexpr std::size_t kMaximumPayloadBytes = 2048;
constexpr std::uint64_t kCallTtlMs = 30000;
constexpr std::uint64_t kSessionMaximumMs = 8ULL*60*60*1000;
constexpr std::size_t kCallRows = 32;
// The ordinary/synthetic ledger remains Call32. Only the separately compiled
// trusted target has the reviewed finite two-title capacity; no runtime switch.
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
constexpr std::size_t kLifetimeCallRows = 86;
constexpr std::uint64_t kLifetimeReadIssuances = 12;
#else
constexpr std::size_t kLifetimeCallRows = kCallRows;
constexpr std::uint64_t kLifetimeReadIssuances = kCallRows/3;
#endif
constexpr bool kProductionRuntimeEntryAvailable = false;
constexpr std::string_view kSchema = "ae-agent.owned-runtime-local-session.v2";

enum class Direction : std::uint8_t { ControllerToBroker=1, DaemonToBroker=2,
    BrokerToController=3, BrokerToDaemon=4 };
enum class FrameKind : std::uint8_t { Request=1, Reply=2, Event=3 };
enum class Status : std::uint16_t { Ok=0, Denied=1, RevalidationRequired=2,
    Unknown=3, Unavailable=4, Revoked=5, ExactExited=6 };
enum class Verb : std::uint16_t { Open=1, ReserveInitialLaunch=2, Status=3,
    Revoke=4, BeginCall=5, BeginBracket=6, AdoptBracket=7, RequestDrain=8,
    BootHello=17, ReadySnapshot=18, FirstActorObserved=19, Complete=20,
    DrainAck=21, ShutdownAck=22, Drain=33, Shutdown=34, VerifyIngress=40,
    BindCommand=41, ConsumeDispatch=42, GuardDelivery=43, RecordDelivery=44,
    ObserveServerGates=46, BindOriginalJob=47, BeginCompletionPoll=48,
    ObserveJobTerminal=49, ObserveMedia=50, FinishServerOnly=52,
    ObserveSameActorState=53, ReservePanelEffect=54, ObserveChallenge=65,
    PublishOwnCompletionReady=66, CompletionResultNotice=67 };
enum class CallKind : std::uint8_t { ServerOnly=1, Panel=2, BootstrapRead=3,
    Read=4, ExecutionPrep=5, Execute=6, Completion=7 };
enum class ToolCode : std::uint16_t { GetOwnedRuntimeStatus=1,
    EnsureOwnedRuntimeDaemon=2, SearchSolutions=3, GetSolution=4,
    EnsureAgentPanel=5, GetBridgeStatus=6, GetProjectInfo=7,
    BuildSolutionPlan=8,ProposeAiAgentPlan=9,RunAiAgentPlan=10,InspectTitleVariants=11,
    GetCompDetails=12,GetLayerDetails=13,InspectAmeTitleSources=14,EnqueueAmeTitleVariant=15,
    InspectAmeTitleQueueManifest=16,StartAmeTitleBatch=17,GetAmeTitleJobStatus=18,
    SaveCurrentNamedProject=19 };
enum class RouteCode : std::uint16_t { McpToolsCall=1 };
enum class ChildRole : std::uint16_t { BootstrapRead=1, Read=2,
    ExecutionPrep=3, Execute=4, Completion=5, PanelBootstrap=6 };
enum class DeliveryClass : std::uint8_t { BootstrapRead=1, Read=2,
    ExecutionPrep=3, Execute=4, Completion=5, PanelBootstrap=6 };
enum class DeliveryOutcome : std::uint8_t { Delivered=1, Unknown=2 };
enum class EffectDisposition : std::uint8_t { FreshCommitted=1,
    DuplicateReadback=2, ConsumedUnknown=3 };
enum class TerminalCode : std::uint16_t { Completed=1, Failed=2, Cancelled=3 };
enum class CompletionOperation : std::uint16_t { OriginalWrapperStatus=1, RetainedBridgeTalk=2 };
enum class ChallengePurpose : std::uint16_t { Readiness=1, SameActor=2, ServerGates=3, Completion=4 };

struct Header {
    Direction direction=Direction::ControllerToBroker;
    FrameKind kind=FrameKind::Request;
    Verb verb=Verb::Open;
    Status status=Status::Ok;
    std::uint32_t payloadBytes=0;
    std::uint64_t senderOrdinal=0, replyToOrdinal=0;
    Id channelNonce{}, sessionRef{}, generation{}, bootNonce{};
};
struct Frame {
    Header header{};
    std::array<std::uint8_t, kMaximumPayloadBytes> payload{};
};
enum class CodecError : std::uint8_t { None, NullBuffer, FrameLength, Magic,
    Version, Direction, Kind, Verb, Status, PayloadLength, Tag, Reserved,
    Ordinal, ReplyTo, Binding, Closed, Pending, Correlation };
struct VerbSpec {
    Verb verb;
    Direction requestDirection;
    FrameKind initiatingKind;
    std::uint16_t requestBytes; // BeginCall uses a closed tagged branch.
    std::uint16_t okReplyBytes;
};
struct ToolSpec {
    ToolCode tool;
    std::string_view exactName;
    CallKind kind;
    bool serverOnlyHandler; // Classification only; never production authority.
};
const VerbSpec* FindVerb(Verb verb) noexcept;
const ToolSpec* FindTool(ToolCode tool) noexcept;
CodecError ValidateFrame(const Frame& frame) noexcept;
CodecError DecodeFrame(const std::uint8_t* bytes, std::size_t length, Frame& out) noexcept;
CodecError EncodeFrame(const Frame& frame, std::uint8_t* bytes,
    std::size_t capacity, std::size_t& written) noexcept;

struct WireBindings { Id channelNonce{}, sessionRef{}, generation{}, bootNonce{}; };
enum class BindingStage : std::uint8_t { BeforeOpen, Open };

// Pure byte/correlation state, NOT a transport, Session, issuer or peer proof.
// A successful reply here conveys no OS/policy/ledger authority.
class WireChannel final {
public:
    WireChannel(Direction incoming, const WireBindings& bindings, BindingStage stage) noexcept;
    CodecError AcceptIncoming(const std::uint8_t* bytes, std::size_t length, Frame& out) noexcept;
    CodecError TrackOutgoing(const Frame& frame) noexcept;
    bool Closed() const noexcept { return closed_; }
    bool PendingBecameUnknown() const noexcept { return pendingUnknown_; }
private:
    struct Pending { bool present=false; Verb verb=Verb::Open; std::uint64_t ordinal=0; };
    CodecError CheckBindings(const Header& header) const noexcept;
    CodecError Close(CodecError error) noexcept;
    // Broker calls these only after the exact tracked reply was successfully
    // sent on the original pipe. Neither transition resets ordinals/pending.
    bool BindOpened(const Frame& sentReply, const Id& session, const Digest& installedScope) noexcept;
    bool AttachRuntime(const Frame& sentReply, const Id& generation, const Id& boot) noexcept;
    Direction incoming_, outgoing_;
    WireBindings bindings_;
    BindingStage stage_;
    std::uint64_t incomingOrdinal_=0, outgoingOrdinal_=0;
    Pending incomingPending_{}, outgoingPending_{};
    bool closed_=false, pendingUnknown_=false;
    Verb settledVerb_=Verb::Status;
    std::uint64_t settledReplyTo_=0, settledOutgoing_=0;
    bool openedBindingUsed_=false, runtimeBindingUsed_=false;
    friend class ::local_session::Broker;
    friend class ::local_session::trusted_read::NativeClient;
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
    friend class SyntheticPhaseProof;
#endif
};

struct BeginCallPayload {
    ToolCode tool=ToolCode::GetOwnedRuntimeStatus;
    CallKind kind=CallKind::ServerOnly;
    RouteCode route=RouteCode::McpToolsCall;
    Digest canonicalBodyHash{};
};
struct VerifyIngressPayload { Id callRef{}, ingressNonce{}; BeginCallPayload body{}; };
struct CallReply { Id callRef{}, ingressNonce{}; std::uint64_t expiresMono=0; Digest bindingHash{}; };
struct HandlerReply { Id permitRef{}, permitNonce{}; std::uint64_t expiresMono=0; Digest bindingHash{}; };
struct FirstActorPayload { Id grantRef{}, grantNonce{}, actorRef{};
    Digest actorHash{}, installedPanelHash{}, observationHash{}; };
CodecError ReadServerOnlyBegin(const Frame& frame, BeginCallPayload& out) noexcept;
CodecError ReadServerOnlyIngress(const Frame& frame, VerifyIngressPayload& out) noexcept;
CodecError ReadPanelBegin(const Frame& frame, BeginCallPayload& out) noexcept;
CodecError ReadPanelIngress(const Frame& frame, VerifyIngressPayload& out) noexcept;
CodecError ReadFirstActor(const Frame& frame, FirstActorPayload& out) noexcept;

// No public constructor/factory/setter or JSON/env input. Broker friendship is
// an issuer only when bound privately to the original broker's OS refresh port.
// The ordinary production entry never binds it. No script/grant/effect ports.
class VolatileServerLedger final {
public:
    ~VolatileServerLedger()=default;
    VolatileServerLedger(const VolatileServerLedger&)=delete;
    VolatileServerLedger& operator=(const VolatileServerLedger&)=delete;
    VolatileServerLedger(VolatileServerLedger&&)=delete;
    VolatileServerLedger& operator=(VolatileServerLedger&&)=delete;
private:
    enum class PeerRole : std::uint8_t { Controller, Daemon };
    struct PeerWitness final {
        PeerWitness()=default;
        PeerWitness(const PeerWitness&)=delete;
        PeerWitness& operator=(const PeerWitness&)=delete;
        PeerRole role=PeerRole::Controller;
        Id privateChannel{}, originalInstance{};
        Digest witnessHash{};
        bool alive=false;
    };
    enum class RowState : std::uint8_t { Empty, Begun, Verified, Finished, Unknown, ActorObserved };
    struct CallRow {
        RowState state=RowState::Empty;
        BeginCallPayload body{};
        CallReply call{};
        HandlerReply handler{};
        Digest resultHash{};
        std::uint64_t counter=0, policyEpoch=0, revocationEpoch=0;
        Id bracket{};
        std::uint8_t bracketIndex=0;
        Digest readHash{},actorHash{},observationHash{},sourceHash{};
        Digest executionScope{};
        Digest completionSelector{};std::uint16_t completionSlot=0;
        std::array<std::uint8_t,586> completionBinding{};
        std::uint64_t leaseEpoch=0,observedMono=0;
    };
    struct NativeBinding {
        WireBindings session{};
        Id brokerInstance{}, installation{}, lineage{};
        Digest scopeHash{}, policyHash{}, transportHash{}, sourceHash{};
        std::uint64_t openedMono=0, deadline=0, policyEpoch=0, revocationEpoch=0;
    };
    struct NativeRefreshPort {
        void* originalBroker=nullptr;
        bool (*refresh)(void*, std::uint64_t&) noexcept=nullptr;
        bool (*randomId)(void*, Id&) noexcept=nullptr;
    };
    // Private native-only authorization. Alias bytes locate this distinct
    // record; neither a HandlerReply nor a pure synthetic factory creates it.
    enum class ActorStage : std::uint8_t { Absent, Issued, AttemptSpent, Consumed, Noted, Published, ReplySent };
    struct PanelDefinition { Id actorRef{}; Digest actorHash{}, installedHash{}, definitionHash{}; };
    struct PanelGrant {
        Id ref{}, nonce{}; Digest authorizationHash{};
        std::size_t rowIndex=kLifetimeCallRows;
        std::uint64_t issuedMono=0, deadline=0;
        ActorStage stage=ActorStage::Absent;
        FirstActorPayload operation{};
        Id observationRef{};
        Digest consumeHash{}, noteHash{}, noteSource{}, noteConfig{};
        std::uint64_t consumeSequence=0, noteSequence=0;
    };
    Status BeginPanel(const PeerWitness& controller,const BeginCallPayload& body,
        std::uint64_t now,CallReply& out) noexcept;
    Status IssuePanel(const PeerWitness& daemon,const VerifyIngressPayload& body,
        std::uint64_t now,HandlerReply& out) noexcept;
    Digest PanelAuthorizationHash(const PanelGrant& grant) const noexcept;
    Digest PanelHandlerHash(const CallRow& row,const PanelGrant& grant) const noexcept;
    Digest PanelObservationHash(const FirstActorPayload& actor) const noexcept;
    bool PanelExact(const FirstActorPayload& actor) const noexcept;
    bool PanelRowExact() const noexcept;
    VolatileServerLedger() noexcept;
    bool InitializeNative(const NativeBinding& binding, const NativeRefreshPort& port,
        const Id& controllerInstance, const Digest& controllerWitness) noexcept;
    bool AttachNativeRuntime(const Id& generation, const Id& boot) noexcept;
    bool AttachNativeDaemon(const Id& channel, const Id& instance, const Digest& witness) noexcept;
    bool HasUnresolved() const noexcept;
    const HandlerReply* FinishedHandler(const Id& permit) const noexcept;
    Status Begin(const PeerWitness& controller, const BeginCallPayload& body,
        std::uint64_t now, CallReply& out) noexcept;
    Status Verify(const PeerWitness& daemon, const VerifyIngressPayload& body,
        std::uint64_t now, HandlerReply& out) noexcept;
    Status Finish(const PeerWitness& daemon, const Id& permit, const Digest& result,
        std::uint64_t now) noexcept;
    // READ-only native producers. The broker supplies its own observations;
    // no public constructor or caller snapshot can reach these methods.
    struct ReadObservation {
        Id target{};
        Digest actor{},source{},readiness{},context{};
        std::uint64_t ordinal=0,observedMono=0;
        std::uint32_t mask=0;
    };
    struct Bracket {
        Id ref{};
        Digest actor{},source{};
        std::uint64_t deadline=0,epoch=0;
        std::uint8_t next=1;
        bool active=false,consumed=false;
    };
    struct ReadAuthorization {
        Id ref{},originBracket{};
        Digest hash{},actor{},source{};
        std::uint64_t issuedMono=0,expiresMono=0,epoch=0;
    };
    Status BeginRead(const PeerWitness& controller,const BeginCallPayload& body,
        const Id& bracket,std::uint8_t index,const Digest& readHash,std::uint64_t now,CallReply& out) noexcept;
    Status VerifyRead(const PeerWitness& daemon,const VerifyIngressPayload& body,
        std::uint64_t now,HandlerReply& out) noexcept;
    Status BeginReadBracket(const PeerWitness& controller,const ReadObservation& observation,
        std::uint64_t now,Bracket& out) noexcept;
    Status AdoptReadBracket(const PeerWitness& controller,const Id& bracket,
        const ReadObservation& observation,std::uint64_t now,ReadAuthorization& out) noexcept;
    Status FinishLocalStatusRead(const PeerWitness& daemon,const Id& permit,
        const Digest& result,const ReadObservation& observation,std::uint64_t now) noexcept;
    Status FinishLocalProjectRead(const PeerWitness& daemon,const Id& permit,
        const Digest& result,const ReadObservation& observation,std::uint64_t now) noexcept;
    Status FinishLocalRead(const PeerWitness& daemon,const Id& permit,ToolCode tool,
        const Digest& result,const ReadObservation& observation,std::uint64_t now) noexcept;
    bool ReadRowCurrent(const CallRow& row,std::uint64_t now) const noexcept;
    Status BeginExecution(const PeerWitness& controller,const BeginCallPayload& body,const Digest& scope,const Digest& readHash,
        std::uint64_t now,CallReply& out)noexcept;
    Status IssueExecution(const PeerWitness& daemon,const VerifyIngressPayload& body,std::uint64_t now,HandlerReply& out)noexcept;
    bool ExecutionRowCurrent(const CallRow& row,std::uint64_t now)const noexcept;
    Digest ExecutionRowHash(const CallRow& row,bool handler)const noexcept;
    Status FinishExecution(const PeerWitness& daemon,const Id& handler,const Digest& result,std::uint64_t now)noexcept;
    Status BeginCompletion(const PeerWitness& controller,const BeginCallPayload& body,const Digest& selector,std::uint16_t slot,
        const std::array<std::uint8_t,586>& binding,std::uint64_t jobDeadline,std::uint64_t now,CallReply& out)noexcept;
    Status IssueCompletion(const PeerWitness& daemon,const VerifyIngressPayload& body,const std::array<std::uint8_t,586>& binding,std::uint64_t now,HandlerReply& out)noexcept;
    Status FinishCompletion(const PeerWitness& daemon,const Id& handler,const Digest& projection,const std::array<std::uint8_t,586>& binding,std::uint64_t now)noexcept;
    Digest CompletionRowHash(const CallRow& row,bool handler)const noexcept;
    bool CompletionRowCurrent(const CallRow& row,std::uint64_t now)const noexcept;
    bool ObservationCurrent(const ReadObservation& value,const Id& target,std::uint64_t now) const noexcept;
    Digest ReadRowHash(const CallRow& row,bool handler) const noexcept;
    Digest ReadAuthorizationHash(const ReadAuthorization& value,const Id& bracket) const noexcept;
    Status Guard(const PeerWitness& peer, PeerRole role, std::uint64_t& now) noexcept;
    Status DenyAndClose(Status status) noexcept;
    void Close() noexcept;
    Digest BindingHash(const CallRow& row, bool handler) const noexcept;
    bool available_=false, closed_=false;
    bool nativeBound_=false, nativeRuntimeAttached_=false, nativeDaemonAttached_=false;
    NativeBinding nativeBinding_{};
    NativeRefreshPort nativePort_{};
    PeerWitness controller_{}, daemon_{};
    WireBindings session_{};
    std::uint64_t sessionDeadline_=0, lastMono_=0, callCounter_=0;
    std::uint64_t policyEpoch_=0, revocationEpoch_=0;
    std::size_t usedRows_=0, handlerAdmissions_=0;
    std::array<CallRow, kLifetimeCallRows> rows_{}; // Never recycle or evict, even Finished.
    PanelDefinition panelDefinition_{};
    PanelGrant panel_{};
    Bracket bracket_{};
    ReadAuthorization read_{};
    ReadObservation readObservation_{};
    std::uint64_t leaseEpoch_=0,bracketEpoch_=0;
    bool firstPanelAttempt_=false, firstActorAttemptSpent_=false;
    friend class ::local_session::Broker;
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
    void InitializeSynthetic(std::uint64_t now) noexcept;
    Id SyntheticId(std::uint8_t domain, std::uint64_t counter) const noexcept;
    static Digest SyntheticDigest(const std::uint8_t* bytes, std::size_t length) noexcept;
    friend class SyntheticPhaseProof;
#endif
};
} // namespace local_session::phase
