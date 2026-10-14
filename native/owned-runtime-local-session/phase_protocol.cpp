#include "phase_protocol.h"
#include <algorithm>
#include <initializer_list>
#include <limits>

namespace local_session::phase {
namespace {
constexpr std::uint16_t kVariableBytes=0xffff;
constexpr std::array<VerbSpec,
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
32
#else
30
#endif
> kVerbs{{
    {Verb::Open,Direction::ControllerToBroker,FrameKind::Request,0,176},
    {Verb::ReserveInitialLaunch,Direction::ControllerToBroker,FrameKind::Request,0,161},
    {Verb::Status,Direction::ControllerToBroker,FrameKind::Request,0,18},
    {Verb::Revoke,Direction::ControllerToBroker,FrameKind::Request,0,18},
    {Verb::BeginCall,Direction::ControllerToBroker,FrameKind::Request,kVariableBytes,72},
    {Verb::BeginBracket,Direction::ControllerToBroker,FrameKind::Request,0,33},
    {Verb::AdoptBracket,Direction::ControllerToBroker,FrameKind::Request,16,72},
    {Verb::RequestDrain,Direction::ControllerToBroker,FrameKind::Request,0,129},
    {Verb::BootHello,Direction::DaemonToBroker,FrameKind::Request,32,18},
    {Verb::ReadySnapshot,Direction::DaemonToBroker,FrameKind::Request,276,56},
    {Verb::FirstActorObserved,Direction::DaemonToBroker,FrameKind::Request,144,145},
    {Verb::Complete,Direction::DaemonToBroker,FrameKind::Request,98,97},
    {Verb::DrainAck,Direction::DaemonToBroker,FrameKind::Request,80,18},
    {Verb::ShutdownAck,Direction::DaemonToBroker,FrameKind::Request,64,18},
    {Verb::Drain,Direction::BrokerToDaemon,FrameKind::Event,64,0},
    {Verb::Shutdown,Direction::BrokerToDaemon,FrameKind::Event,64,0},
    {Verb::VerifyIngress,Direction::DaemonToBroker,FrameKind::Request,69,72},
    {Verb::BindCommand,Direction::DaemonToBroker,FrameKind::Request,205,72},
    {Verb::ConsumeDispatch,Direction::DaemonToBroker,FrameKind::Request,96,113},
    {Verb::GuardDelivery,Direction::DaemonToBroker,FrameKind::Request,176,72},
    {Verb::RecordDelivery,Direction::DaemonToBroker,FrameKind::Request,81,97},
    {Verb::ObserveServerGates,Direction::DaemonToBroker,FrameKind::Request,228,72},
    {Verb::BindOriginalJob,Direction::DaemonToBroker,FrameKind::Request,112,60},
    {Verb::BeginCompletionPoll,Direction::DaemonToBroker,FrameKind::Request,58,72},
    {Verb::ObserveJobTerminal,Direction::DaemonToBroker,FrameKind::Request,96,97},
    {Verb::ObserveMedia,Direction::DaemonToBroker,FrameKind::Request,96,97},
    {Verb::FinishServerOnly,Direction::DaemonToBroker,FrameKind::Request,48,64},
    {Verb::ObserveSameActorState,Direction::DaemonToBroker,FrameKind::Request,112,18},
    {Verb::ReservePanelEffect,Direction::DaemonToBroker,FrameKind::Request,72,113},
    {Verb::ObserveChallenge,Direction::BrokerToDaemon,FrameKind::Event,34,0},
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    {Verb::PublishOwnCompletionReady,Direction::DaemonToBroker,FrameKind::Request,324,20},
    {Verb::CompletionResultNotice,Direction::BrokerToController,FrameKind::Event,52,0},
#endif
    // No spare verb slots, aliases or protocol negotiation entries.
}};
constexpr std::array<ToolSpec,
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
19
#else
7
#endif
> kTools{{
    {ToolCode::GetOwnedRuntimeStatus,"get_owned_runtime_status",CallKind::ServerOnly,true},
    {ToolCode::EnsureOwnedRuntimeDaemon,"ensure_owned_runtime_daemon",CallKind::ServerOnly,false},
    {ToolCode::SearchSolutions,"search_solutions",CallKind::ServerOnly,true},
    {ToolCode::GetSolution,"get_solution",CallKind::ServerOnly,true},
    {ToolCode::EnsureAgentPanel,"ensure_ae_agent_panel",CallKind::Panel,false},
    {ToolCode::GetBridgeStatus,"get_bridge_status",CallKind::Read,false},
    {ToolCode::GetProjectInfo,"get_project_info",CallKind::Read,false},
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    {ToolCode::BuildSolutionPlan,"build_solution_plan",CallKind::ExecutionPrep,false},
    {ToolCode::ProposeAiAgentPlan,"propose_ai_agent_plan",CallKind::ExecutionPrep,false},
    {ToolCode::RunAiAgentPlan,"run_ai_agent_plan",CallKind::Execute,false},
    {ToolCode::InspectTitleVariants,"inspect_title_variants",CallKind::ExecutionPrep,false},
    {ToolCode::GetCompDetails,"get_comp_details",CallKind::ExecutionPrep,false},
    {ToolCode::GetLayerDetails,"get_layer_details",CallKind::ExecutionPrep,false},
    {ToolCode::InspectAmeTitleSources,"inspect_ame_title_sources",CallKind::ExecutionPrep,false},
    {ToolCode::EnqueueAmeTitleVariant,"enqueue_ame_title_variant",CallKind::Execute,false},
    {ToolCode::InspectAmeTitleQueueManifest,"inspect_ame_title_queue_manifest",CallKind::ExecutionPrep,false},
    {ToolCode::StartAmeTitleBatch,"start_ame_title_batch",CallKind::Execute,false},
    {ToolCode::GetAmeTitleJobStatus,"get_ame_title_job_status",CallKind::Completion,false},
    {ToolCode::SaveCurrentNamedProject,"save_current_named_project",CallKind::Execute,false},
#endif
}};
static_assert(kHeaderBytes==96 && kHeaderBytes+kMaximumPayloadBytes<=kMaximumFrameBytes);

std::uint16_t U16(const std::uint8_t* p) noexcept {
    return static_cast<std::uint16_t>(p[0] | (static_cast<std::uint16_t>(p[1])<<8));
}
std::uint32_t U32(const std::uint8_t* p) noexcept {
    std::uint32_t value=0;
    for (unsigned i=0;i<4;++i) value|=static_cast<std::uint32_t>(p[i])<<(8*i);
    return value;
}
std::uint64_t U64(const std::uint8_t* p) noexcept {
    std::uint64_t value=0;
    for (unsigned i=0;i<8;++i) value|=static_cast<std::uint64_t>(p[i])<<(8*i);
    return value;
}
void W16(std::uint8_t* p, std::uint16_t value) noexcept {
    for (unsigned i=0;i<2;++i) p[i]=static_cast<std::uint8_t>(value>>(8*i));
}
void W32(std::uint8_t* p, std::uint32_t value) noexcept {
    for (unsigned i=0;i<4;++i) p[i]=static_cast<std::uint8_t>(value>>(8*i));
}
void W64(std::uint8_t* p, std::uint64_t value) noexcept {
    for (unsigned i=0;i<8;++i) p[i]=static_cast<std::uint8_t>(value>>(8*i));
}
bool Zero(const std::uint8_t* p, std::size_t count) noexcept {
    for (std::size_t i=0;i<count;++i) if (p[i]!=0) return false;
    return true;
}
template<std::size_t N> bool Zero(const std::array<std::uint8_t,N>& a) noexcept {
    return Zero(a.data(),a.size());
}
Direction Reverse(Direction direction) noexcept {
    switch (direction) {
    case Direction::ControllerToBroker:return Direction::BrokerToController;
    case Direction::BrokerToController:return Direction::ControllerToBroker;
    case Direction::DaemonToBroker:return Direction::BrokerToDaemon;
    case Direction::BrokerToDaemon:return Direction::DaemonToBroker;
    default:return static_cast<Direction>(0);
    }
}
bool KnownKind(std::uint8_t kind) noexcept { return kind>=1 && kind<=7; }
bool Compatible(ToolCode tool, CallKind kind) noexcept {
    const auto* spec=FindTool(tool);
    return spec && (spec->kind==kind ||
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
        (tool==ToolCode::RunAiAgentPlan&&kind==CallKind::ExecutionPrep)||
#endif
        (spec->kind==CallKind::Read && kind==CallKind::BootstrapRead));
}
std::size_t BeginBytes(std::uint8_t kind) noexcept {
    switch (static_cast<CallKind>(kind)) {
    case CallKind::ServerOnly:case CallKind::Panel:return 37;
    case CallKind::BootstrapRead:return 54;
    case CallKind::Read:return 69;
    case CallKind::ExecutionPrep:case CallKind::Execute:return 101;
    case CallKind::Completion:return 77;
    default:return 0;
    }
}
CodecError CheckBody(const std::uint8_t* p) noexcept {
    if (!KnownKind(p[2]) || !Compatible(static_cast<ToolCode>(U16(p)),
        static_cast<CallKind>(p[2])) || U16(p+3)!=static_cast<std::uint16_t>(RouteCode::McpToolsCall))
        return CodecError::Tag;
    if (Zero(p+5,32)) return CodecError::Tag;
    return CodecError::None;
}
bool HasEffectAck(Verb verb) noexcept {
    switch (verb) {
    case Verb::ReserveInitialLaunch:case Verb::RequestDrain:case Verb::FirstActorObserved:
    case Verb::Complete:case Verb::ConsumeDispatch:case Verb::RecordDelivery:
    case Verb::ObserveJobTerminal:case Verb::ObserveMedia:case Verb::ReservePanelEffect:return true;
    default:return false;
    }
}
bool ReplyIsUnknown(const Frame& frame) noexcept {
    return frame.header.kind==FrameKind::Reply && (frame.header.status==Status::Unknown ||
        (frame.header.status==Status::Ok && HasEffectAck(frame.header.verb) &&
            frame.payload[0]==static_cast<std::uint8_t>(EffectDisposition::ConsumedUnknown)));
}
CodecError CheckPayload(const Frame& frame) noexcept {
    const auto* p=frame.payload.data();
    const auto verb=frame.header.verb;
    if (frame.header.kind==FrameKind::Reply) {
        if (frame.header.status!=Status::Ok) return CodecError::None; // Exact empty error branch.
        if (HasEffectAck(verb)) {
            if (p[0]<1 || p[0]>3 || Zero(p+1,16) || Zero(p+17,32) ||
                U64(p+49)==0 || U64(p+57)==0 || Zero(p+65,32)) return CodecError::Tag;
            if (verb==Verb::ConsumeDispatch || verb==Verb::ReservePanelEffect) {
                // Factual duplicate/unknown may not carry a fresh late-guard nonce.
                if ((p[0]==1)==Zero(p+97,16)) return CodecError::Tag;
            }
        }
        switch (verb) {
        case Verb::Status:
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
            if ((U16(p)&0xfc00u)!=0 || (U16(p)&0xffu)>8 ||
                ((U16(p)&0x300u)!=0 && ((U16(p)&0xffu)!=5 || Zero(p+2,16)))) return CodecError::Tag;
            break;
#endif
        case Verb::Revoke:case Verb::BootHello:case Verb::DrainAck:
        case Verb::ShutdownAck:case Verb::ObserveSameActorState:
            if (U16(p)>8) return CodecError::Tag;
            break;
        case Verb::Open:
            if (Zero(p,16) || U64(p+24)<=U64(p+16) || Zero(p+32,32) ||
                U64(p+24)-U64(p+16)>kSessionMaximumMs || U64(p+64)==0 ||
                Zero(p+80,32) || Zero(p+112,32)) return CodecError::Tag;
            break;
        case Verb::BeginBracket:
            if (Zero(p,16) || U64(p+16)==0 || p[24]!=1 || U64(p+25)==0) return CodecError::Tag;
            break;
        case Verb::AdoptBracket:
            if (Zero(p,16) || Zero(p+16,32) || U64(p+56)<=U64(p+48) ||
                U64(p+56)-U64(p+48)>60000 || U64(p+64)==0) return CodecError::Tag;
            break;
        case Verb::BeginCall:case Verb::VerifyIngress:case Verb::BindCommand:
        case Verb::GuardDelivery:case Verb::ObserveServerGates:case Verb::BeginCompletionPoll:
            if (Zero(p,16) || Zero(p+16,16) || U64(p+32)==0 || Zero(p+40,32)) return CodecError::Tag;
            break;
        case Verb::ReadySnapshot:
            if (Zero(p,16) || U64(p+16)==0 || Zero(p+24,32)) return CodecError::Tag;
            break;
        case Verb::ReserveInitialLaunch:
            if (Zero(p+97,16) || Zero(p+113,16) || Zero(p+129,32)) return CodecError::Tag;
            break;
        case Verb::RequestDrain:
            if (Zero(p+97,16) || Zero(p+113,16)) return CodecError::Tag;
            break;
        case Verb::FirstActorObserved:
            if (Zero(p+97,16) || Zero(p+113,32)) return CodecError::Tag;
            break;
        case Verb::BindOriginalJob:
            if (Zero(p,16) || Zero(p+16,32) || U64(p+48)==0 || U32(p+56)==0 || U32(p+56)>48) return CodecError::Tag;
            break;
        case Verb::FinishServerOnly:
            if (Zero(p,16) || Zero(p+16,16) || Zero(p+32,32)) return CodecError::Tag;
            break;
        case Verb::PublishOwnCompletionReady:
            if (U16(p)<1 || U16(p)>2 || U16(p+2)!=1 || Zero(p+4,16)) return CodecError::Tag;
            break;
        default:break;
        }
        return CodecError::None;
    }
    switch (verb) {
    case Verb::AdoptBracket:
        if (Zero(p,16)) return CodecError::Tag;
        break;
    case Verb::BootHello:
        if (Zero(p,32)) return CodecError::Tag;
        break;
    case Verb::BeginCall: {
        const auto body=CheckBody(p);
        if (body!=CodecError::None) return body;
        switch (static_cast<CallKind>(p[2])) {
        case CallKind::BootstrapRead:
            if (Zero(p+37,16) || p[53]<1 || p[53]>3) return CodecError::Tag;
            break;
        case CallKind::Read:
            if (Zero(p+37,32)) return CodecError::Tag;
            break;
        case CallKind::ExecutionPrep:case CallKind::Execute:
            if (Zero(p+37,32) || Zero(p+69,32)) return CodecError::Tag;
            break;
        case CallKind::Completion:
            if (Zero(p+37,32) || U64(p+69)==0) return CodecError::Tag;
            break;
        default:break;
        }
        break;
    }
    case Verb::VerifyIngress:
        if (Zero(p,16) || Zero(p+16,16)) return CodecError::Tag;
        return CheckBody(p+32);
    case Verb::ReadySnapshot:
        if (Zero(p,16) || U64(p+16)==0 || Zero(p+24,32)) return CodecError::Tag;
        if ((U32(p+272)&~std::uint32_t{0x7f})!=0) return CodecError::Reserved;
        break;
    case Verb::FirstActorObserved:
        if (Zero(p,16) || Zero(p+16,16) || Zero(p+32,16) || Zero(p+48,32) ||
            Zero(p+80,32) || Zero(p+112,32)) return CodecError::Tag;
        break;
    case Verb::Complete:
        if (Zero(p,16) || Zero(p+16,16) || Zero(p+32,32) || U16(p+64)<1 ||
            U16(p+64)>3 || Zero(p+66,32)) return CodecError::Tag;
        break;
    case Verb::DrainAck:
        if (Zero(p,16) || Zero(p+16,16) || Zero(p+32,16) || Zero(p+48,32)) return CodecError::Tag;
        break;
    case Verb::ShutdownAck:
        if (Zero(p,16) || Zero(p+16,16) || Zero(p+32,32)) return CodecError::Tag;
        break;
    case Verb::BindCommand:
        if (U64(p+32)==0 || !FindTool(static_cast<ToolCode>(U16(p+40))) ||
            U16(p+42)<1 || U16(p+42)>6 || p[204]<1 || p[204]>6 ||
            U16(p+42)!=p[204] || Zero(p+140,32)) return CodecError::Tag;
        // Only the exact AME leaves may carry their generated message body hash.
        if (!Zero(p+172,32)
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
            && static_cast<ToolCode>(U16(p+40))!=ToolCode::InspectAmeTitleSources&&static_cast<ToolCode>(U16(p+40))!=ToolCode::EnqueueAmeTitleVariant&&
            static_cast<ToolCode>(U16(p+40))!=ToolCode::InspectAmeTitleQueueManifest&&static_cast<ToolCode>(U16(p+40))!=ToolCode::StartAmeTitleBatch&&static_cast<ToolCode>(U16(p+40))!=ToolCode::GetAmeTitleJobStatus
#endif
        ) return CodecError::Reserved;
        break;
    case Verb::RecordDelivery:
        if (p[48]<1 || p[48]>2) return CodecError::Tag;
        break;
    case Verb::ObserveServerGates:
        // This codec does not issue gates. The original broker compares all
        // native-produced commitments and the exact purpose3 pending row.
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
        if(U32(p+192)!=0x00ff||Zero(p,16)||Zero(p+16,16)||Zero(p+32,32)||Zero(p+64,32)||Zero(p+96,32)||Zero(p+128,32)||Zero(p+160,32)||Zero(p+196,32))return CodecError::Tag;
#else
        if (U32(p+192)!=0) return CodecError::Reserved;
#endif
        break;
    case Verb::BindOriginalJob:
        // D47 layout is fixed before source freeze. These commitments still
        // require an independently retained native START/job producer.
        if (Zero(p,16) || Zero(p+16,32) || Zero(p+48,32) || Zero(p+80,32)) return CodecError::Tag;
        break;
    case Verb::BeginCompletionPoll:
        if (Zero(p,16) || U64(p+16)==0 || Zero(p+24,32) || U16(p+56)<1 || U16(p+56)>2) return CodecError::Tag;
        break;
    case Verb::ObserveJobTerminal:case Verb::ObserveMedia:
        if (Zero(p,16) || Zero(p+16,16) || Zero(p+32,32) || Zero(p+64,32)) return CodecError::Tag;
        break;
    case Verb::ReservePanelEffect:
        if (U64(p+16)==0) return CodecError::Tag;
        break;
    case Verb::ObserveChallenge:
        if (U16(p+16)<1 || U16(p+16)>4) return CodecError::Tag;
        break;
    case Verb::PublishOwnCompletionReady:
        if (U16(p)<1 || U16(p)>2 || U16(p+2)!=1 || Zero(p+4,16) || Zero(p+20,32) ||
            Zero(p+52,32) || Zero(p+180,32) || Zero(p+284,32) || U64(p+316)==0) return CodecError::Tag;
        break;
    case Verb::CompletionResultNotice:
        if (U16(p)<1 || U16(p)>2 || (U16(p+2)!=1 && U16(p+2)!=2) || Zero(p+4,16) || Zero(p+20,32)) return CodecError::Tag;
        break;
    case Verb::FinishServerOnly:
        if (Zero(p,16) || Zero(p+16,32)) return CodecError::Tag;
        break;
    default:break;
    }
    return CodecError::None;
}

// SHA-256 for private binary row commitments only. This is NOT a JSON parser,
// peer verifier or authentication primitive. Canonical body hashes arrive from
// the two private peers and are compared; no caller hash grants authority.
std::uint32_t Ror(std::uint32_t v,unsigned n) noexcept { return (v>>n)|(v<<(32-n)); }
Digest Sha256(const std::uint8_t* bytes, std::size_t length) noexcept {
    constexpr std::array<std::uint32_t,64> k{{
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    }};
    std::array<std::uint32_t,8> h{{0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
        0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19}};
    const std::size_t blocks=(length+9+63)/64;
    const auto bits=static_cast<std::uint64_t>(length)*8;
    for (std::size_t block=0;block<blocks;++block) {
        std::array<std::uint8_t,64> chunk{};
        for (std::size_t i=0;i<64;++i) {
            const auto at=block*64+i;
            if (at<length) chunk[i]=bytes[at];
            else if (at==length) chunk[i]=0x80;
            if (at>=blocks*64-8) chunk[i]=static_cast<std::uint8_t>(bits>>(8*(blocks*64-1-at)));
        }
        std::array<std::uint32_t,64> w{};
        for (std::size_t i=0;i<16;++i) w[i]=(static_cast<std::uint32_t>(chunk[4*i])<<24)|
            (static_cast<std::uint32_t>(chunk[4*i+1])<<16)|
            (static_cast<std::uint32_t>(chunk[4*i+2])<<8)|chunk[4*i+3];
        for (std::size_t i=16;i<64;++i) {
            const auto a=w[i-15], b=w[i-2];
            w[i]=w[i-16]+(Ror(a,7)^Ror(a,18)^(a>>3))+w[i-7]+(Ror(b,17)^Ror(b,19)^(b>>10));
        }
        auto a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],q=h[7];
        for (std::size_t i=0;i<64;++i) {
            const auto t1=q+(Ror(e,6)^Ror(e,11)^Ror(e,25))+((e&f)^(~e&g))+k[i]+w[i];
            const auto t2=(Ror(a,2)^Ror(a,13)^Ror(a,22))+((a&b)^(a&c)^(b&c));
            q=g;g=f;f=e;e=d+t1;d=c;c=b;b=a;a=t1+t2;
        }
        h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=q;
    }
    Digest result{};
    for (std::size_t i=0;i<8;++i) for (unsigned j=0;j<4;++j)
        result[4*i+j]=static_cast<std::uint8_t>(h[i]>>(24-8*j));
    return result;
}
} // namespace

const VerbSpec* FindVerb(Verb verb) noexcept {
    for (const auto& spec:kVerbs) if (spec.verb==verb) return &spec;
    return nullptr;
}
const ToolSpec* FindTool(ToolCode tool) noexcept {
    for (const auto& spec:kTools) if (spec.tool==tool) return &spec;
    return nullptr;
}
CodecError ValidateFrame(const Frame& frame) noexcept {
    const auto& h=frame.header;
    const auto direction=static_cast<std::uint8_t>(h.direction);
    if (direction<1 || direction>4) return CodecError::Direction;
    if (h.kind!=FrameKind::Request && h.kind!=FrameKind::Reply && h.kind!=FrameKind::Event) return CodecError::Kind;
    if (static_cast<std::uint16_t>(h.status)>6) return CodecError::Status;
    if (h.senderOrdinal==0 || h.senderOrdinal==std::numeric_limits<std::uint64_t>::max()) return CodecError::Ordinal;
    if (Zero(h.channelNonce) || Zero(h.generation)!=Zero(h.bootNonce)) return CodecError::Binding;
    if (h.payloadBytes>kMaximumPayloadBytes || kHeaderBytes+h.payloadBytes>kMaximumFrameBytes) return CodecError::PayloadLength;
    const auto* spec=FindVerb(h.verb);
    if (!spec) return CodecError::Verb;
    std::size_t expected=spec->requestBytes;
    if (h.kind==FrameKind::Reply) {
        if (spec->initiatingKind!=FrameKind::Request) return CodecError::Kind;
        if (h.direction!=Reverse(spec->requestDirection)) return CodecError::Direction;
        if (h.replyToOrdinal==0 || h.replyToOrdinal==std::numeric_limits<std::uint64_t>::max()) return CodecError::ReplyTo;
        expected=h.status==Status::Ok ? spec->okReplyBytes : 0;
    } else {
        if (h.kind!=spec->initiatingKind) return CodecError::Kind;
        if (h.direction!=spec->requestDirection) return CodecError::Direction;
        if (h.status!=Status::Ok) return CodecError::Status;
        if (h.replyToOrdinal!=0) return CodecError::ReplyTo;
        if (h.verb==Verb::BeginCall) {
            if (h.payloadBytes<3) return CodecError::PayloadLength;
            expected=BeginBytes(frame.payload[2]);
            if (expected==0) return CodecError::Tag;
        }
    }
    if (h.payloadBytes!=expected) return CodecError::PayloadLength;
    if (!Zero(frame.payload.data()+h.payloadBytes,kMaximumPayloadBytes-h.payloadBytes)) return CodecError::Reserved;
    return CheckPayload(frame);
}
CodecError DecodeFrame(const std::uint8_t* bytes, std::size_t length, Frame& out) noexcept {
    if (!bytes) return CodecError::NullBuffer;
    if (length<kHeaderBytes || length>kMaximumFrameBytes) return CodecError::FrameLength;
    if (bytes[0]!='L' || bytes[1]!='C' || bytes[2]!='P' || bytes[3]!='2') return CodecError::Magic;
    if (U16(bytes+4)!=2) return CodecError::Version;
    Frame candidate{};
    auto& h=candidate.header;
    h.direction=static_cast<Direction>(bytes[6]);h.kind=static_cast<FrameKind>(bytes[7]);
    h.verb=static_cast<Verb>(U16(bytes+8));h.status=static_cast<Status>(U16(bytes+10));
    h.payloadBytes=U32(bytes+12);h.senderOrdinal=U64(bytes+16);h.replyToOrdinal=U64(bytes+24);
    if (h.payloadBytes>kMaximumPayloadBytes || length!=kHeaderBytes+h.payloadBytes) return CodecError::FrameLength;
    std::copy_n(bytes+32,16,h.channelNonce.begin());std::copy_n(bytes+48,16,h.sessionRef.begin());
    std::copy_n(bytes+64,16,h.generation.begin());std::copy_n(bytes+80,16,h.bootNonce.begin());
    std::copy_n(bytes+kHeaderBytes,h.payloadBytes,candidate.payload.begin());
    const auto error=ValidateFrame(candidate);
    if (error!=CodecError::None) return error;
    out=candidate;
    return CodecError::None;
}
CodecError EncodeFrame(const Frame& frame, std::uint8_t* bytes,
    std::size_t capacity, std::size_t& written) noexcept {
    written=0;
    const auto error=ValidateFrame(frame);
    if (error!=CodecError::None) return error;
    if (!bytes) return CodecError::NullBuffer;
    const auto length=kHeaderBytes+frame.header.payloadBytes;
    if (capacity<length) return CodecError::FrameLength;
    bytes[0]='L';bytes[1]='C';bytes[2]='P';bytes[3]='2';W16(bytes+4,2);
    const auto& h=frame.header;
    bytes[6]=static_cast<std::uint8_t>(h.direction);bytes[7]=static_cast<std::uint8_t>(h.kind);
    W16(bytes+8,static_cast<std::uint16_t>(h.verb));W16(bytes+10,static_cast<std::uint16_t>(h.status));
    W32(bytes+12,h.payloadBytes);W64(bytes+16,h.senderOrdinal);W64(bytes+24,h.replyToOrdinal);
    std::copy(h.channelNonce.begin(),h.channelNonce.end(),bytes+32);
    std::copy(h.sessionRef.begin(),h.sessionRef.end(),bytes+48);
    std::copy(h.generation.begin(),h.generation.end(),bytes+64);
    std::copy(h.bootNonce.begin(),h.bootNonce.end(),bytes+80);
    std::copy_n(frame.payload.begin(),h.payloadBytes,bytes+kHeaderBytes);
    written=length;
    return CodecError::None;
}

WireChannel::WireChannel(Direction incoming,const WireBindings& bindings,BindingStage stage) noexcept:
    incoming_(incoming),outgoing_(Reverse(incoming)),bindings_(bindings),stage_(stage) {
    closed_=outgoing_==static_cast<Direction>(0) || CheckBindings(Header{incoming,
        FrameKind::Request,Verb::Status,Status::Ok,0,1,0,bindings.channelNonce,
        bindings.sessionRef,bindings.generation,bindings.bootNonce})!=CodecError::None;
}
CodecError WireChannel::CheckBindings(const Header& h) const noexcept {
    if (stage_!=BindingStage::BeforeOpen && stage_!=BindingStage::Open) return CodecError::Binding;
    if (Zero(bindings_.channelNonce) || Zero(bindings_.generation)!=Zero(bindings_.bootNonce)) return CodecError::Binding;
    if (stage_==BindingStage::BeforeOpen && (!Zero(bindings_.sessionRef) ||
        !Zero(bindings_.generation) || !Zero(bindings_.bootNonce))) return CodecError::Binding;
    if (stage_==BindingStage::Open && Zero(bindings_.sessionRef)) return CodecError::Binding;
    if (h.channelNonce!=bindings_.channelNonce || h.sessionRef!=bindings_.sessionRef ||
        h.generation!=bindings_.generation || h.bootNonce!=bindings_.bootNonce) return CodecError::Binding;
    if (stage_==BindingStage::BeforeOpen && h.verb!=Verb::Open && h.verb!=Verb::Status && h.verb!=Verb::Revoke)
        return CodecError::Binding;
    return CodecError::None;
}
CodecError WireChannel::Close(CodecError error) noexcept {
    pendingUnknown_=pendingUnknown_ || incomingPending_.present || outgoingPending_.present;
    closed_=true;
    return error;
}
CodecError WireChannel::AcceptIncoming(const std::uint8_t* bytes,std::size_t length,Frame& out) noexcept {
    if (closed_) return CodecError::Closed;
    Frame frame{};
    const auto error=DecodeFrame(bytes,length,frame);
    if (error!=CodecError::None) return Close(error);
    const auto& h=frame.header;
    if (h.direction!=incoming_) return Close(CodecError::Direction);
    const auto binding=CheckBindings(h);
    if (binding!=CodecError::None) return Close(binding);
    if (incomingOrdinal_==std::numeric_limits<std::uint64_t>::max() ||
        h.senderOrdinal!=incomingOrdinal_+1) return Close(CodecError::Ordinal);
    if (h.kind==FrameKind::Reply) {
        if (!outgoingPending_.present || outgoingPending_.verb!=h.verb ||
            outgoingPending_.ordinal!=h.replyToOrdinal) return Close(CodecError::Correlation);
    } else if (h.kind==FrameKind::Request && incomingPending_.present) return Close(CodecError::Pending);
    // Only fully decoded, bound and correlated frames advance either ledger.
    incomingOrdinal_=h.senderOrdinal;
    if (h.kind==FrameKind::Reply) outgoingPending_={};
    else if (h.kind==FrameKind::Request) incomingPending_={true,h.verb,h.senderOrdinal};
    if (ReplyIsUnknown(frame)) { pendingUnknown_=true;closed_=true; }
    out=frame;
    return CodecError::None;
}
CodecError WireChannel::TrackOutgoing(const Frame& frame) noexcept {
    if (closed_) return CodecError::Closed;
    const auto error=ValidateFrame(frame);
    if (error!=CodecError::None) return Close(error);
    const auto& h=frame.header;
    if (h.direction!=outgoing_) return Close(CodecError::Direction);
    const auto binding=CheckBindings(h);
    if (binding!=CodecError::None) return Close(binding);
    if (outgoingOrdinal_==std::numeric_limits<std::uint64_t>::max() ||
        h.senderOrdinal!=outgoingOrdinal_+1) return Close(CodecError::Ordinal);
    if (h.kind==FrameKind::Request && outgoingPending_.present) return Close(CodecError::Pending);
    if (h.kind==FrameKind::Reply && (!incomingPending_.present || incomingPending_.verb!=h.verb ||
        incomingPending_.ordinal!=h.replyToOrdinal)) return Close(CodecError::Correlation);
    outgoingOrdinal_=h.senderOrdinal;
    if (h.kind==FrameKind::Request) outgoingPending_={true,h.verb,h.senderOrdinal};
    else if (h.kind==FrameKind::Reply) {
        incomingPending_={};settledVerb_=h.verb;settledReplyTo_=h.replyToOrdinal;
        settledOutgoing_=h.senderOrdinal;
    }
    if (ReplyIsUnknown(frame)) { pendingUnknown_=true;closed_=true; }
    return CodecError::None;
}

bool WireChannel::BindOpened(const Frame& sent,const Id& session,const Digest& installedScope) noexcept {
    const auto& h=sent.header;
    if (closed_ || openedBindingUsed_ || stage_!=BindingStage::BeforeOpen || Zero(session) || Zero(installedScope) ||
        h.payloadBytes!=176 || !std::equal(session.begin(),session.end(),sent.payload.begin()) ||
        !std::equal(installedScope.begin(),installedScope.end(),sent.payload.begin()+144) ||
        incomingPending_.present || outgoingPending_.present || h.kind!=FrameKind::Reply ||
        h.status!=Status::Ok || h.verb!=Verb::Open || settledVerb_!=h.verb ||
        h.replyToOrdinal!=settledReplyTo_ || h.replyToOrdinal!=incomingOrdinal_ ||
        h.senderOrdinal!=settledOutgoing_ || h.senderOrdinal!=outgoingOrdinal_ ||
        CheckBindings(h)!=CodecError::None) { Close(CodecError::Binding);return false; }
    bindings_.sessionRef=session;stage_=BindingStage::Open;openedBindingUsed_=true;return true;
}
bool WireChannel::AttachRuntime(const Frame& sent,const Id& generation,const Id& boot) noexcept {
    const auto& h=sent.header;
    if (closed_ || runtimeBindingUsed_ || stage_!=BindingStage::Open || !openedBindingUsed_ ||
        h.payloadBytes!=161 || !std::equal(generation.begin(),generation.end(),sent.payload.begin()+97) ||
        !std::equal(boot.begin(),boot.end(),sent.payload.begin()+113) ||
        !Zero(bindings_.generation) || !Zero(bindings_.bootNonce) || Zero(generation) || Zero(boot) ||
        incomingPending_.present || outgoingPending_.present || h.kind!=FrameKind::Reply ||
        h.status!=Status::Ok || h.verb!=Verb::ReserveInitialLaunch || settledVerb_!=h.verb ||
        h.replyToOrdinal!=settledReplyTo_ || h.replyToOrdinal!=incomingOrdinal_ ||
        h.senderOrdinal!=settledOutgoing_ || h.senderOrdinal!=outgoingOrdinal_ ||
        CheckBindings(h)!=CodecError::None) { Close(CodecError::Binding);return false; }
    bindings_.generation=generation;bindings_.bootNonce=boot;runtimeBindingUsed_=true;return true;
}

CodecError ReadServerOnlyBegin(const Frame& frame,BeginCallPayload& out) noexcept {
    const auto error=ValidateFrame(frame);
    if (error!=CodecError::None) return error;
    if (frame.header.verb!=Verb::BeginCall || frame.header.kind!=FrameKind::Request ||
        frame.payload[2]!=static_cast<std::uint8_t>(CallKind::ServerOnly)) return CodecError::Tag;
    BeginCallPayload body{};
    body.tool=static_cast<ToolCode>(U16(frame.payload.data()));body.kind=CallKind::ServerOnly;
    body.route=static_cast<RouteCode>(U16(frame.payload.data()+3));
    std::copy_n(frame.payload.data()+5,32,body.canonicalBodyHash.begin());out=body;
    return CodecError::None;
}
CodecError ReadServerOnlyIngress(const Frame& frame,VerifyIngressPayload& out) noexcept {
    const auto error=ValidateFrame(frame);
    if (error!=CodecError::None) return error;
    if (frame.header.verb!=Verb::VerifyIngress || frame.header.kind!=FrameKind::Request ||
        frame.payload[34]!=static_cast<std::uint8_t>(CallKind::ServerOnly)) return CodecError::Tag;
    VerifyIngressPayload body{};
    std::copy_n(frame.payload.data(),16,body.callRef.begin());
    std::copy_n(frame.payload.data()+16,16,body.ingressNonce.begin());
    body.body.tool=static_cast<ToolCode>(U16(frame.payload.data()+32));body.body.kind=CallKind::ServerOnly;
    body.body.route=static_cast<RouteCode>(U16(frame.payload.data()+35));
    std::copy_n(frame.payload.data()+37,32,body.body.canonicalBodyHash.begin());out=body;
    return CodecError::None;
}
CodecError ReadPanelBegin(const Frame& frame,BeginCallPayload& out) noexcept {
    const auto error=ValidateFrame(frame);if(error!=CodecError::None)return error;
    if(frame.header.direction!=Direction::ControllerToBroker||frame.header.verb!=Verb::BeginCall||
        frame.header.kind!=FrameKind::Request||frame.header.payloadBytes!=37||
        U16(frame.payload.data())!=static_cast<std::uint16_t>(ToolCode::EnsureAgentPanel)||
        frame.payload[2]!=static_cast<std::uint8_t>(CallKind::Panel)||
        U16(frame.payload.data()+3)!=static_cast<std::uint16_t>(RouteCode::McpToolsCall))return CodecError::Tag;
    BeginCallPayload body{};body.tool=ToolCode::EnsureAgentPanel;body.kind=CallKind::Panel;
    std::copy_n(frame.payload.data()+5,32,body.canonicalBodyHash.begin());out=body;return CodecError::None;
}
CodecError ReadPanelIngress(const Frame& frame,VerifyIngressPayload& out) noexcept {
    const auto error=ValidateFrame(frame);if(error!=CodecError::None)return error;
    if(frame.header.direction!=Direction::DaemonToBroker||frame.header.verb!=Verb::VerifyIngress||
        frame.header.kind!=FrameKind::Request||frame.header.payloadBytes!=69||
        U16(frame.payload.data()+32)!=static_cast<std::uint16_t>(ToolCode::EnsureAgentPanel)||
        frame.payload[34]!=static_cast<std::uint8_t>(CallKind::Panel)||
        U16(frame.payload.data()+35)!=static_cast<std::uint16_t>(RouteCode::McpToolsCall))return CodecError::Tag;
    VerifyIngressPayload body{};body.body.tool=ToolCode::EnsureAgentPanel;body.body.kind=CallKind::Panel;
    std::copy_n(frame.payload.data(),16,body.callRef.begin());std::copy_n(frame.payload.data()+16,16,body.ingressNonce.begin());
    std::copy_n(frame.payload.data()+37,32,body.body.canonicalBodyHash.begin());out=body;return CodecError::None;
}
CodecError ReadFirstActor(const Frame& frame,FirstActorPayload& out) noexcept {
    const auto error=ValidateFrame(frame);if(error!=CodecError::None)return error;
    if(frame.header.direction!=Direction::DaemonToBroker||frame.header.kind!=FrameKind::Request||
        frame.header.verb!=Verb::FirstActorObserved||frame.header.payloadBytes!=144)return CodecError::Tag;
    FirstActorPayload body{};std::copy_n(frame.payload.data(),16,body.grantRef.begin());
    std::copy_n(frame.payload.data()+16,16,body.grantNonce.begin());std::copy_n(frame.payload.data()+32,16,body.actorRef.begin());
    std::copy_n(frame.payload.data()+48,32,body.actorHash.begin());std::copy_n(frame.payload.data()+80,32,body.installedPanelHash.begin());
    std::copy_n(frame.payload.data()+112,32,body.observationHash.begin());out=body;return CodecError::None;
}

VolatileServerLedger::VolatileServerLedger() noexcept=default;
bool VolatileServerLedger::InitializeNative(const NativeBinding& binding,const NativeRefreshPort& port,
    const Id& controllerInstance,const Digest& controllerWitness) noexcept {
    if (available_ || closed_ || nativeBound_ || usedRows_ || !port.originalBroker || !port.refresh ||
        !port.randomId || Zero(binding.session.channelNonce) || Zero(binding.session.sessionRef) ||
        !Zero(binding.session.generation) || !Zero(binding.session.bootNonce) ||
        Zero(binding.brokerInstance) || Zero(binding.installation) || Zero(binding.lineage) ||
        Zero(binding.scopeHash) || Zero(binding.policyHash) || Zero(binding.transportHash) ||
        Zero(controllerInstance) || Zero(controllerWitness) || !binding.policyEpoch ||
        binding.deadline<=binding.openedMono || binding.deadline-binding.openedMono>kSessionMaximumMs) {
        Close();return false;
    }
    nativeBinding_=binding;nativePort_=port;session_=binding.session;
    controller_.role=PeerRole::Controller;controller_.privateChannel=binding.session.channelNonce;
    controller_.originalInstance=controllerInstance;controller_.witnessHash=controllerWitness;
    policyEpoch_=binding.policyEpoch;revocationEpoch_=binding.revocationEpoch;
    sessionDeadline_=binding.deadline;lastMono_=binding.openedMono;nativeBound_=true;available_=true;
    return true;
}
bool VolatileServerLedger::AttachNativeRuntime(const Id& generation,const Id& boot) noexcept {
    if (!nativeBound_ || closed_ || nativeRuntimeAttached_ || usedRows_ || Zero(generation) || Zero(boot)) {
        Close();return false;
    }
    session_.generation=generation;session_.bootNonce=boot;nativeRuntimeAttached_=true;return true;
}
bool VolatileServerLedger::AttachNativeDaemon(const Id& channel,const Id& instance,const Digest& witness) noexcept {
    if (!nativeBound_ || !nativeRuntimeAttached_ || closed_ || nativeDaemonAttached_ || usedRows_ ||
        Zero(channel) || Zero(instance) || Zero(witness)) { Close();return false; }
    daemon_.role=PeerRole::Daemon;daemon_.privateChannel=channel;
    daemon_.originalInstance=instance;daemon_.witnessHash=witness;nativeDaemonAttached_=true;return true;
}
bool VolatileServerLedger::HasUnresolved() const noexcept {
    for (const auto& row:rows_) if (row.state==RowState::Begun || row.state==RowState::Verified ||
        row.state==RowState::Unknown) return true;
    return false;
}
const HandlerReply* VolatileServerLedger::FinishedHandler(const Id& permit) const noexcept {
    for (const auto& row:rows_) if (row.state==RowState::Finished && row.handler.permitRef==permit)
        return &row.handler;
    return nullptr;
}
void VolatileServerLedger::Close() noexcept {
    closed_=true;
    for (auto& row:rows_) if (row.state==RowState::Begun || row.state==RowState::Verified) row.state=RowState::Unknown;
}
Status VolatileServerLedger::DenyAndClose(Status status) noexcept { Close();return status; }
Status VolatileServerLedger::Guard(const PeerWitness& peer,PeerRole role,std::uint64_t& now) noexcept {
    if (!available_) return Status::Unavailable;
    if (closed_) return Status::Revoked;
    const auto* original=role==PeerRole::Controller ? &controller_ : &daemon_;
    if (&peer!=original || peer.role!=role || Zero(peer.privateChannel) ||
        Zero(peer.originalInstance) || Zero(peer.witnessHash)) return DenyAndClose(Status::Denied);
    if (nativeBound_) {
        if (!nativeRuntimeAttached_ || !nativeDaemonAttached_) return Status::Unavailable;
        std::uint64_t fresh=0;
        if (!nativePort_.originalBroker || !nativePort_.refresh ||
            !nativePort_.refresh(nativePort_.originalBroker,fresh)) return DenyAndClose(Status::Unknown);
        now=fresh; // OS clock, never the method argument, is authoritative here.
    } else {
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
        if (!controller_.alive || !daemon_.alive) return DenyAndClose(Status::Revoked);
#else
        return Status::Unavailable;
#endif
    }
    if (now<lastMono_) return DenyAndClose(Status::Unknown);
    if (now>=sessionDeadline_) return DenyAndClose(Status::RevalidationRequired);
    lastMono_=now;
    return Status::Ok;
}
Status VolatileServerLedger::Begin(const PeerWitness& controller,const BeginCallPayload& body,
    std::uint64_t now,CallReply& out) noexcept {
    const auto guarded=Guard(controller,PeerRole::Controller,now);
    if (guarded!=Status::Ok) return guarded;
    const auto* tool=FindTool(body.tool);
    if (!tool || body.kind!=CallKind::ServerOnly || tool->kind!=CallKind::ServerOnly ||
        body.route!=RouteCode::McpToolsCall || Zero(body.canonicalBodyHash)) return DenyAndClose(Status::Denied);
    if (!tool->serverOnlyHandler) return Status::Unavailable;
    if (usedRows_>=kLifetimeCallRows || callCounter_==std::numeric_limits<std::uint64_t>::max() ||
        now>std::numeric_limits<std::uint64_t>::max()-kCallTtlMs) return DenyAndClose(Status::Unknown);
    CallRow row{};row.state=RowState::Begun;row.body=body;row.counter=callCounter_+1;
    row.policyEpoch=policyEpoch_;row.revocationEpoch=revocationEpoch_;
    if (nativeBound_) {
        if (!nativePort_.randomId(nativePort_.originalBroker,row.call.callRef) ||
            !nativePort_.randomId(nativePort_.originalBroker,row.call.ingressNonce) ||
            Zero(row.call.callRef) || Zero(row.call.ingressNonce) || row.call.callRef==row.call.ingressNonce)
            return DenyAndClose(Status::Unknown);
        for (const auto& previous:rows_) if (previous.state!=RowState::Empty &&
            (previous.call.callRef==row.call.callRef || previous.call.ingressNonce==row.call.ingressNonce))
            return DenyAndClose(Status::Unknown);
    } else {
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
        row.call.callRef=SyntheticId(0x40,row.counter);row.call.ingressNonce=SyntheticId(0x41,row.counter);
#else
        (void)out;return Status::Unavailable;
#endif
    }
    row.call.expiresMono=std::min(now+kCallTtlMs,sessionDeadline_);
    row.call.bindingHash=BindingHash(row,false);
    const auto finalGuard=Guard(controller,PeerRole::Controller,now);
    if(finalGuard!=Status::Ok)return finalGuard;
    if(now>=row.call.expiresMono)return DenyAndClose(Status::Denied);
    rows_[usedRows_]=row;++usedRows_;++callCounter_;out=row.call;
    return Status::Ok;
}
Status VolatileServerLedger::Verify(const PeerWitness& daemon,const VerifyIngressPayload& body,
    std::uint64_t now,HandlerReply& out) noexcept {
    const auto guarded=Guard(daemon,PeerRole::Daemon,now);
    if (guarded!=Status::Ok) return guarded;
    CallRow* matched=nullptr;
    for (auto& row:rows_) if (row.state!=RowState::Empty && row.call.callRef==body.callRef) { matched=&row;break; }
    if (!matched || matched->state!=RowState::Begun || matched->call.ingressNonce!=body.ingressNonce ||
        matched->body.tool!=body.body.tool || matched->body.kind!=body.body.kind ||
        matched->body.route!=body.body.route || matched->body.canonicalBodyHash!=body.body.canonicalBodyHash ||
        matched->policyEpoch!=policyEpoch_ || matched->revocationEpoch!=revocationEpoch_ ||
        matched->call.bindingHash!=BindingHash(*matched,false) ||
        now>=matched->call.expiresMono) return DenyAndClose(Status::Denied);
    if (nativeBound_) {
        if (!nativePort_.randomId(nativePort_.originalBroker,matched->handler.permitRef) ||
            !nativePort_.randomId(nativePort_.originalBroker,matched->handler.permitNonce) ||
            Zero(matched->handler.permitRef) || Zero(matched->handler.permitNonce) ||
            matched->handler.permitRef==matched->handler.permitNonce) return DenyAndClose(Status::Unknown);
        for (const auto& previous:rows_) if (&previous!=matched && previous.state!=RowState::Empty &&
            (previous.handler.permitRef==matched->handler.permitRef ||
             previous.handler.permitNonce==matched->handler.permitNonce)) return DenyAndClose(Status::Unknown);
    } else {
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
        matched->handler.permitRef=SyntheticId(0x42,matched->counter);
        matched->handler.permitNonce=SyntheticId(0x43,matched->counter);
#else
        (void)out;return Status::Unavailable;
#endif
    }
    matched->handler.expiresMono=matched->call.expiresMono;
    matched->handler.bindingHash=BindingHash(*matched,true);
    const auto finalGuard=Guard(daemon,PeerRole::Daemon,now);
    if(finalGuard!=Status::Ok)return finalGuard;
    if(now>=matched->call.expiresMono)return DenyAndClose(Status::Denied);
    matched->state=RowState::Verified;++handlerAdmissions_;out=matched->handler;
    return Status::Ok;
}
Status VolatileServerLedger::Finish(const PeerWitness& daemon,const Id& permit,const Digest& result,
    std::uint64_t now) noexcept {
    const auto guarded=Guard(daemon,PeerRole::Daemon,now);
    if (guarded!=Status::Ok) return guarded;
    for (auto& row:rows_) if (row.state!=RowState::Empty && row.handler.permitRef==permit) {
        if (row.body.kind!=CallKind::ServerOnly || row.state!=RowState::Verified || row.policyEpoch!=policyEpoch_ ||
            row.revocationEpoch!=revocationEpoch_ ||
            row.call.bindingHash!=BindingHash(row,false) ||
            row.handler.bindingHash!=BindingHash(row,true) ||
            row.handler.expiresMono!=row.call.expiresMono ||
            now>=row.call.expiresMono || now>=row.handler.expiresMono || Zero(result))
            return DenyAndClose(Status::Denied);
        const auto finalGuard=Guard(daemon,PeerRole::Daemon,now);
        if(finalGuard!=Status::Ok)return finalGuard;
        if(now>=row.call.expiresMono)return DenyAndClose(Status::Denied);
        row.resultHash=result;row.state=RowState::Finished;return Status::Ok;
    }
    return DenyAndClose(Status::Denied);
}
Status VolatileServerLedger::BeginPanel(const PeerWitness& controller,const BeginCallPayload& body,
    std::uint64_t now,CallReply& out) noexcept {
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const auto guarded=Guard(controller,PeerRole::Controller,now);if(guarded!=Status::Ok)return guarded;
    if(!nativeBound_||firstPanelAttempt_||firstActorAttemptSpent_||HasUnresolved()||
        body.tool!=ToolCode::EnsureAgentPanel||body.kind!=CallKind::Panel||body.route!=RouteCode::McpToolsCall||
        Zero(body.canonicalBodyHash)||
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
        Zero(panelDefinition_.actorRef)||Zero(panelDefinition_.actorHash)||
#endif
        Zero(panelDefinition_.installedHash)||Zero(panelDefinition_.definitionHash))return DenyAndClose(Status::Denied);
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    constexpr std::string_view canonical="{\"args\":{},\"name\":\"ensure_ae_agent_panel\"}";
    if(!Zero(panelDefinition_.actorRef)||!Zero(panelDefinition_.actorHash)||
        body.canonicalBodyHash!=Sha256(reinterpret_cast<const std::uint8_t*>(canonical.data()),canonical.size()))return DenyAndClose(Status::Denied);
#endif
    if(usedRows_>=kLifetimeCallRows||callCounter_==std::numeric_limits<std::uint64_t>::max()||
        now>std::numeric_limits<std::uint64_t>::max()-kCallTtlMs)return DenyAndClose(Status::Unknown);
    CallRow row{};row.state=RowState::Begun;row.body=body;row.counter=callCounter_+1;
    row.policyEpoch=policyEpoch_;row.revocationEpoch=revocationEpoch_;
    if(!nativePort_.randomId(nativePort_.originalBroker,row.call.callRef)||
        !nativePort_.randomId(nativePort_.originalBroker,row.call.ingressNonce)||Zero(row.call.callRef)||
        Zero(row.call.ingressNonce)||row.call.callRef==row.call.ingressNonce)return DenyAndClose(Status::Unknown);
    for(const auto& previous:rows_)if(previous.state!=RowState::Empty&&
        (previous.call.callRef==row.call.callRef||previous.call.ingressNonce==row.call.ingressNonce))return DenyAndClose(Status::Unknown);
    row.call.expiresMono=std::min(now+kCallTtlMs,sessionDeadline_);row.call.bindingHash=BindingHash(row,false);
    const auto finalGuard=Guard(controller,PeerRole::Controller,now);if(finalGuard!=Status::Ok)return finalGuard;
    if(now>=row.call.expiresMono)return DenyAndClose(Status::Denied);
    rows_[usedRows_]=row;++usedRows_;++callCounter_;out=row.call;return Status::Ok;
#else
    (void)controller;(void)body;(void)now;(void)out;return Status::Unavailable;
#endif
}
Status VolatileServerLedger::IssuePanel(const PeerWitness& daemon,const VerifyIngressPayload& body,
    std::uint64_t now,HandlerReply& out) noexcept {
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const auto guarded=Guard(daemon,PeerRole::Daemon,now);if(guarded!=Status::Ok)return guarded;
    CallRow* row=nullptr;std::size_t index=0;for(;index<usedRows_;++index)if(rows_[index].call.callRef==body.callRef){row=&rows_[index];break;}
    if(!nativeBound_||firstPanelAttempt_||firstActorAttemptSpent_||!row||row->state!=RowState::Begun||
        row->body.kind!=CallKind::Panel||row->body.tool!=ToolCode::EnsureAgentPanel||row->body.route!=RouteCode::McpToolsCall||
        row->call.ingressNonce!=body.ingressNonce||row->body.tool!=body.body.tool||row->body.kind!=body.body.kind||
        row->body.route!=body.body.route||row->body.canonicalBodyHash!=body.body.canonicalBodyHash||
        row->policyEpoch!=policyEpoch_||row->revocationEpoch!=revocationEpoch_||row->call.bindingHash!=BindingHash(*row,false)||
        now>=row->call.expiresMono)return DenyAndClose(Status::Denied);
    for(const auto& other:rows_)if(&other!=row&&(other.state==RowState::Begun||other.state==RowState::Verified||other.state==RowState::Unknown))return DenyAndClose(Status::Denied);
    if(now>std::numeric_limits<std::uint64_t>::max()-600000)return DenyAndClose(Status::Unknown);
    firstPanelAttempt_=true; // Irreversible before IDs, association or send.
    if(!nativePort_.randomId(nativePort_.originalBroker,row->handler.permitRef)||
        !nativePort_.randomId(nativePort_.originalBroker,row->handler.permitNonce)||Zero(row->handler.permitRef)||
        Zero(row->handler.permitNonce)||row->handler.permitRef==row->handler.permitNonce)return DenyAndClose(Status::Unknown);
    for(const auto& other:rows_)if(&other!=row&&other.state!=RowState::Empty&&
        (other.handler.permitRef==row->handler.permitRef||other.handler.permitNonce==row->handler.permitNonce))return DenyAndClose(Status::Unknown);
    row->handler.expiresMono=row->call.expiresMono;panel_.ref=row->handler.permitRef;panel_.nonce=row->handler.permitNonce;
    panel_.rowIndex=index;panel_.issuedMono=now;panel_.deadline=std::min(now+600000,sessionDeadline_);
    panel_.authorizationHash=PanelAuthorizationHash(panel_);row->handler.bindingHash=PanelHandlerHash(*row,panel_);
    const auto finalGuard=Guard(daemon,PeerRole::Daemon,now);if(finalGuard!=Status::Ok)return finalGuard;
    if(now>=row->call.expiresMono||now>=panel_.deadline)return DenyAndClose(Status::Denied);
    row->state=RowState::Verified;panel_.stage=ActorStage::Issued;++handlerAdmissions_;out=row->handler;return Status::Ok;
#else
    (void)daemon;(void)body;(void)now;(void)out;return Status::Unavailable;
#endif
}
Digest VolatileServerLedger::PanelAuthorizationHash(const PanelGrant& grant) const noexcept {
    if(!nativeBound_||grant.rowIndex>=usedRows_)return {};
    const auto& row=rows_[grant.rowIndex];std::array<std::uint8_t,1024> binary{};std::size_t at=0;
    const std::string_view domain="lcp2.native.panel-grant.v2";W16(binary.data(),static_cast<std::uint16_t>(domain.size()));at=2;
    for(char c:domain)binary[at++]=static_cast<std::uint8_t>(c);
    const auto append=[&](const auto& value)noexcept{std::copy(value.begin(),value.end(),binary.begin()+static_cast<std::ptrdiff_t>(at));at+=value.size();};
    append(nativeBinding_.brokerInstance);append(nativeBinding_.installation);append(nativeBinding_.lineage);
    append(nativeBinding_.scopeHash);append(nativeBinding_.policyHash);append(nativeBinding_.transportHash);append(nativeBinding_.sourceHash);
    append(session_.channelNonce);append(session_.sessionRef);append(session_.generation);append(session_.bootNonce);
    append(controller_.privateChannel);append(controller_.originalInstance);append(controller_.witnessHash);
    append(daemon_.privateChannel);append(daemon_.originalInstance);append(daemon_.witnessHash);
    append(row.call.callRef);append(row.call.ingressNonce);append(row.call.bindingHash);append(row.body.canonicalBodyHash);
    append(grant.ref);append(grant.nonce);append(panelDefinition_.definitionHash);append(panelDefinition_.installedHash);
#if !defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    // The synthetic profile has an actor at issuance. The production bootstrap
    // grants only the static installed closure; its first actor is bound later
    // by the original daemon's separately measured post-open observation.
    append(panelDefinition_.actorRef);append(panelDefinition_.actorHash);
#endif
    for(auto value:{row.counter,policyEpoch_,revocationEpoch_,nativeBinding_.openedMono,sessionDeadline_,grant.issuedMono,grant.deadline}){W64(binary.data()+at,value);at+=8;}
    return Sha256(binary.data(),at);
}
Digest VolatileServerLedger::PanelHandlerHash(const CallRow& row,const PanelGrant& grant) const noexcept {
    std::array<std::uint8_t,160> binary{};const std::string_view domain="lcp2.native.panel-handler.v2";std::size_t at=2;
    W16(binary.data(),static_cast<std::uint16_t>(domain.size()));for(char c:domain)binary[at++]=static_cast<std::uint8_t>(c);
    for(const auto& value:{row.call.bindingHash,grant.authorizationHash}){std::copy(value.begin(),value.end(),binary.begin()+static_cast<std::ptrdiff_t>(at));at+=value.size();}
    return Sha256(binary.data(),at);
}
Digest VolatileServerLedger::PanelObservationHash(const FirstActorPayload& actor) const noexcept {
    std::array<std::uint8_t,400> binary{};const std::string_view domain="lcp2.native.first-actor.observation.v2";std::size_t at=2;
    W16(binary.data(),static_cast<std::uint16_t>(domain.size()));for(char c:domain)binary[at++]=static_cast<std::uint8_t>(c);
    const auto append=[&](const auto& value)noexcept{std::copy(value.begin(),value.end(),binary.begin()+static_cast<std::ptrdiff_t>(at));at+=value.size();};
    append(nativeBinding_.scopeHash);append(nativeBinding_.policyHash);append(session_.sessionRef);append(session_.generation);append(session_.bootNonce);
    append(actor.grantRef);append(actor.grantNonce);append(actor.actorRef);append(actor.actorHash);append(actor.installedPanelHash);return Sha256(binary.data(),at);
}
bool VolatileServerLedger::PanelExact(const FirstActorPayload& actor) const noexcept {
    return nativeBound_&&firstPanelAttempt_&&panel_.stage!=ActorStage::Absent&&actor.grantRef==panel_.ref&&actor.grantNonce==panel_.nonce&&
        actor.actorRef==panelDefinition_.actorRef&&actor.actorHash==panelDefinition_.actorHash&&actor.installedPanelHash==panelDefinition_.installedHash&&
        actor.observationHash==PanelObservationHash(actor)&&PanelRowExact();
}
bool VolatileServerLedger::PanelRowExact() const noexcept {
    if(!nativeBound_||closed_||panel_.rowIndex>=usedRows_||panel_.authorizationHash!=PanelAuthorizationHash(panel_))return false;
    const auto& row=rows_[panel_.rowIndex];if(row.body.kind!=CallKind::Panel||row.body.tool!=ToolCode::EnsureAgentPanel||
        row.body.route!=RouteCode::McpToolsCall||row.policyEpoch!=policyEpoch_||row.revocationEpoch!=revocationEpoch_||
        row.call.bindingHash!=BindingHash(row,false)||row.handler.permitRef!=panel_.ref||row.handler.permitNonce!=panel_.nonce||
        row.handler.expiresMono!=row.call.expiresMono||row.handler.bindingHash!=PanelHandlerHash(row,panel_))return false;
    for(std::size_t i=0;i<usedRows_;++i)if(i!=panel_.rowIndex&&(rows_[i].state==RowState::Begun||rows_[i].state==RowState::Verified||rows_[i].state==RowState::Unknown))return false;
    return row.state==RowState::Verified||row.state==RowState::ActorObserved;
}
bool VolatileServerLedger::ObservationCurrent(const ReadObservation& value,const Id& target,std::uint64_t now)const noexcept {
    return nativeBound_&&!closed_&&value.target==target&&value.ordinal&&value.observedMono<=now&&
        now-value.observedMono<=10000&&value.mask==0x7f&&!Zero(value.actor)&&!Zero(value.context)&&
        !Zero(value.readiness)&&value.actor==panelDefinition_.actorHash&&value.source==nativeBinding_.sourceHash;
}
Digest VolatileServerLedger::ReadRowHash(const CallRow& row,bool handler)const noexcept {
    std::array<std::uint8_t,512> bytes{};std::size_t at=0;
    const std::string_view domain=handler?"lcp2.native.read-handler.v2":"lcp2.native.read-call.v2";
    W16(bytes.data(),static_cast<std::uint16_t>(domain.size()));at=2;for(char c:domain)bytes[at++]=static_cast<std::uint8_t>(c);
    const auto put=[&](const auto& value)noexcept{std::copy(value.begin(),value.end(),bytes.begin()+static_cast<std::ptrdiff_t>(at));at+=value.size();};
    put(BindingHash(row,handler));put(row.bracket);bytes[at++]=row.bracketIndex;put(row.readHash);put(row.actorHash);put(row.sourceHash);
    W64(bytes.data()+at,row.leaseEpoch);at+=8;return Sha256(bytes.data(),at);
}
Digest VolatileServerLedger::ReadAuthorizationHash(const ReadAuthorization& value,const Id& bracket)const noexcept {
    std::array<std::uint8_t,512> bytes{};std::size_t at=0;const std::string_view domain="lcp2.native.read-authorization.v2";
    W16(bytes.data(),static_cast<std::uint16_t>(domain.size()));at=2;for(char c:domain)bytes[at++]=static_cast<std::uint8_t>(c);
    const auto put=[&](const auto& item)noexcept{std::copy(item.begin(),item.end(),bytes.begin()+static_cast<std::ptrdiff_t>(at));at+=item.size();};
    put(value.ref);put(bracket);put(value.actor);put(value.source);put(nativeBinding_.scopeHash);put(nativeBinding_.policyHash);
    put(nativeBinding_.transportHash);put(session_.sessionRef);put(session_.generation);put(session_.bootNonce);
    for(const auto n:{value.issuedMono,value.expiresMono,value.epoch,policyEpoch_,revocationEpoch_,sessionDeadline_}){W64(bytes.data()+at,n);at+=8;}
    return Sha256(bytes.data(),at);
}
bool VolatileServerLedger::ReadRowCurrent(const CallRow& row,std::uint64_t now)const noexcept {
    if(!nativeBound_||closed_||now>=sessionDeadline_||now>=row.call.expiresMono||
        row.policyEpoch!=policyEpoch_||row.revocationEpoch!=revocationEpoch_||row.actorHash!=panelDefinition_.actorHash||
        row.sourceHash!=nativeBinding_.sourceHash||row.call.bindingHash!=ReadRowHash(row,false))return false;
    if(row.body.kind==CallKind::BootstrapRead)return bracket_.active&&!bracket_.consumed&&row.bracket==bracket_.ref&&
        row.bracketIndex==bracket_.next&&row.bracketIndex>=1&&row.bracketIndex<=3&&now<bracket_.deadline;
    return row.body.kind==CallKind::Read&&row.leaseEpoch==read_.epoch&&row.readHash==read_.hash&&
        !Zero(read_.hash)&&read_.hash==ReadAuthorizationHash(read_,read_.originBracket)&&now<read_.expiresMono;
}
Status VolatileServerLedger::BeginReadBracket(const PeerWitness& controller,const ReadObservation& observation,
    std::uint64_t now,Bracket& out)noexcept {
    const auto status=Guard(controller,PeerRole::Controller,now);if(status!=Status::Ok)return status;
    if(!nativeBound_||panel_.stage!=ActorStage::ReplySent||HasUnresolved()||bracket_.active||
        !ObservationCurrent(observation,session_.sessionRef,now))return Status::Denied;
    if(bracketEpoch_>=kLifetimeReadIssuances||now>std::numeric_limits<std::uint64_t>::max()-kCallTtlMs)
        return DenyAndClose(Status::Unknown);
    Bracket value{};if(!nativePort_.randomId(nativePort_.originalBroker,value.ref)||Zero(value.ref))return DenyAndClose(Status::Unknown);
    value.actor=observation.actor;value.source=observation.source;value.deadline=std::min(now+kCallTtlMs,sessionDeadline_);
    value.epoch=bracketEpoch_+1;value.active=true;
    const auto last=Guard(controller,PeerRole::Controller,now);if(last!=Status::Ok)return last;
    if(now>=value.deadline||!ObservationCurrent(observation,session_.sessionRef,now))return Status::Denied;
    bracket_=value;++bracketEpoch_;readObservation_=observation;out=bracket_;return Status::Ok;
}
Status VolatileServerLedger::BeginRead(const PeerWitness& controller,const BeginCallPayload& body,
    const Id& bracket,std::uint8_t index,const Digest& readHash,std::uint64_t now,CallReply& out)noexcept {
    const auto status=Guard(controller,PeerRole::Controller,now);if(status!=Status::Ok)return status;
    if(!nativeBound_||panel_.stage!=ActorStage::ReplySent||HasUnresolved()||body.route!=RouteCode::McpToolsCall||
        (body.tool!=ToolCode::GetBridgeStatus&&body.tool!=ToolCode::GetProjectInfo))return Status::Denied;
    const std::string_view canonical=body.tool==ToolCode::GetBridgeStatus?
        "{\"args\":{},\"name\":\"get_bridge_status\"}":"{\"args\":{},\"name\":\"get_project_info\"}";
    if(body.canonicalBodyHash!=Sha256(reinterpret_cast<const std::uint8_t*>(canonical.data()),canonical.size()))return Status::Denied;
    if(usedRows_>=kLifetimeCallRows||callCounter_==std::numeric_limits<std::uint64_t>::max()||now>std::numeric_limits<std::uint64_t>::max()-kCallTtlMs)
        return DenyAndClose(Status::Unknown);
    CallRow row{};row.body=body;row.state=RowState::Begun;row.counter=callCounter_+1;row.policyEpoch=policyEpoch_;
    row.revocationEpoch=revocationEpoch_;row.actorHash=panelDefinition_.actorHash;row.sourceHash=nativeBinding_.sourceHash;
    if(body.kind==CallKind::BootstrapRead){
        if(!bracket_.active||bracket_.consumed||bracket!=bracket_.ref||index!=bracket_.next||index<1||index>3||
            now>=bracket_.deadline||!Zero(readHash)||body.tool!=(index==2?ToolCode::GetProjectInfo:ToolCode::GetBridgeStatus))return Status::Denied;
        row.bracket=bracket;row.bracketIndex=index;row.call.expiresMono=std::min(now+kCallTtlMs,bracket_.deadline);
    }else if(body.kind==CallKind::Read){
        if(!Zero(bracket)||index||readHash!=read_.hash||Zero(readHash)||read_.hash!=ReadAuthorizationHash(read_,read_.originBracket)||now>=read_.expiresMono)
            return Status::RevalidationRequired;
        row.readHash=readHash;row.leaseEpoch=read_.epoch;row.call.expiresMono=std::min(now+kCallTtlMs,read_.expiresMono);
    }else return Status::Denied;
    if(!nativePort_.randomId(nativePort_.originalBroker,row.call.callRef)||!nativePort_.randomId(nativePort_.originalBroker,row.call.ingressNonce)||
        Zero(row.call.callRef)||Zero(row.call.ingressNonce)||row.call.callRef==row.call.ingressNonce)return DenyAndClose(Status::Unknown);
    for(const auto& previous:rows_)if(previous.state!=RowState::Empty&&(previous.call.callRef==row.call.callRef||previous.call.ingressNonce==row.call.ingressNonce))return DenyAndClose(Status::Unknown);
    row.call.bindingHash=ReadRowHash(row,false);const auto last=Guard(controller,PeerRole::Controller,now);if(last!=Status::Ok)return last;
    if(!ReadRowCurrent(row,now))return Status::Denied;rows_[usedRows_++]=row;++callCounter_;out=row.call;return Status::Ok;
}
Status VolatileServerLedger::VerifyRead(const PeerWitness& daemon,const VerifyIngressPayload& body,std::uint64_t now,HandlerReply& out)noexcept {
    const auto status=Guard(daemon,PeerRole::Daemon,now);if(status!=Status::Ok)return status;
    CallRow* row=nullptr;for(auto& value:rows_)if(value.state!=RowState::Empty&&value.call.callRef==body.callRef){row=&value;break;}
    if(!row||row->state!=RowState::Begun||row->call.ingressNonce!=body.ingressNonce||row->body.tool!=body.body.tool||
        row->body.kind!=body.body.kind||row->body.route!=body.body.route||row->body.canonicalBodyHash!=body.body.canonicalBodyHash||!ReadRowCurrent(*row,now))return Status::Denied;
    if(!nativePort_.randomId(nativePort_.originalBroker,row->handler.permitRef)||!nativePort_.randomId(nativePort_.originalBroker,row->handler.permitNonce)||
        Zero(row->handler.permitRef)||Zero(row->handler.permitNonce)||row->handler.permitRef==row->handler.permitNonce)return DenyAndClose(Status::Unknown);
    row->handler.expiresMono=row->call.expiresMono;row->handler.bindingHash=ReadRowHash(*row,true);
    const auto last=Guard(daemon,PeerRole::Daemon,now);if(last!=Status::Ok)return last;if(!ReadRowCurrent(*row,now))return Status::Denied;
    row->state=RowState::Verified;++handlerAdmissions_;out=row->handler;return Status::Ok;
}
Digest VolatileServerLedger::ExecutionRowHash(const CallRow& row,bool handler)const noexcept {
    std::array<std::uint8_t,128> bytes{};constexpr std::string_view domain="lcp2.native.execution-row.v1";std::size_t at=0;
    for(const char c:domain)bytes[at++]=static_cast<std::uint8_t>(c);const auto base=ReadRowHash(row,handler);
    for(const auto& hash:{base,row.executionScope}){std::copy(hash.begin(),hash.end(),bytes.begin()+static_cast<std::ptrdiff_t>(at));at+=hash.size();}return Sha256(bytes.data(),at);
}
bool VolatileServerLedger::ExecutionRowCurrent(const CallRow& row,std::uint64_t now)const noexcept {
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    return nativeBound_&&!closed_&&Compatible(row.body.tool,row.body.kind)&&(row.body.kind==CallKind::ExecutionPrep||row.body.kind==CallKind::Execute)&&
        !Zero(row.executionScope)&&row.body.route==RouteCode::McpToolsCall&&row.policyEpoch==policyEpoch_&&row.revocationEpoch==revocationEpoch_&&
        row.actorHash==panelDefinition_.actorHash&&row.sourceHash==nativeBinding_.sourceHash&&row.readHash==read_.hash&&row.leaseEpoch==read_.epoch&&
        !Zero(read_.hash)&&now>=read_.issuedMono&&now<read_.expiresMono&&now<sessionDeadline_&&now<row.call.expiresMono&&
        row.call.bindingHash==ExecutionRowHash(row,false);
#else
    (void)row;(void)now;return false;
#endif
}
Status VolatileServerLedger::BeginExecution(const PeerWitness& controller,const BeginCallPayload& body,const Digest& scope,const Digest& readHash,
    std::uint64_t now,CallReply& out)noexcept {
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const auto guarded=Guard(controller,PeerRole::Controller,now);if(guarded!=Status::Ok)return guarded;
    if(!nativeBound_||!Compatible(body.tool,body.kind)||(body.kind!=CallKind::ExecutionPrep&&body.kind!=CallKind::Execute)||body.route!=RouteCode::McpToolsCall||
        Zero(body.canonicalBodyHash)||Zero(scope)||Zero(readHash)||readHash!=read_.hash||read_.actor!=panelDefinition_.actorHash||read_.source!=nativeBinding_.sourceHash||
        now<read_.issuedMono||now>=read_.expiresMono||HasUnresolved())return Status::Denied;
    if(usedRows_>=kLifetimeCallRows||callCounter_==std::numeric_limits<std::uint64_t>::max()||now>std::numeric_limits<std::uint64_t>::max()-kCallTtlMs)return DenyAndClose(Status::Unknown);
    CallRow row{};row.state=RowState::Begun;row.body=body;row.executionScope=scope;row.readHash=readHash;row.actorHash=read_.actor;row.sourceHash=read_.source;row.leaseEpoch=read_.epoch;
    row.counter=callCounter_+1;row.policyEpoch=policyEpoch_;row.revocationEpoch=revocationEpoch_;
    if(!nativePort_.randomId(nativePort_.originalBroker,row.call.callRef)||!nativePort_.randomId(nativePort_.originalBroker,row.call.ingressNonce)||
        Zero(row.call.callRef)||Zero(row.call.ingressNonce)||row.call.callRef==row.call.ingressNonce)return DenyAndClose(Status::Unknown);
    for(const auto& previous:rows_)if(previous.state!=RowState::Empty&&(previous.call.callRef==row.call.callRef||previous.call.ingressNonce==row.call.ingressNonce))return DenyAndClose(Status::Unknown);
    row.call.expiresMono=std::min(now+kCallTtlMs,std::min(read_.expiresMono,sessionDeadline_));row.call.bindingHash=ExecutionRowHash(row,false);
    const auto finalGuard=Guard(controller,PeerRole::Controller,now);if(finalGuard!=Status::Ok)return finalGuard;if(!ExecutionRowCurrent(row,now))return Status::Denied;
    rows_[usedRows_]=row;++usedRows_;++callCounter_;out=row.call;return Status::Ok;
#else
    (void)controller;(void)body;(void)scope;(void)readHash;(void)now;(void)out;return Status::Unavailable;
#endif
}
Status VolatileServerLedger::IssueExecution(const PeerWitness& daemon,const VerifyIngressPayload& body,std::uint64_t now,HandlerReply& out)noexcept {
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const auto guarded=Guard(daemon,PeerRole::Daemon,now);if(guarded!=Status::Ok)return guarded;CallRow* row=nullptr;
    for(auto& original:rows_)if(original.state!=RowState::Empty&&original.call.callRef==body.callRef){row=&original;break;}
    // D40's unchanged base body cannot replace the saved C5 execution tail.
    if(!row||row->state!=RowState::Begun||row->call.ingressNonce!=body.ingressNonce||row->body.tool!=body.body.tool||row->body.kind!=body.body.kind||
        row->body.route!=body.body.route||row->body.canonicalBodyHash!=body.body.canonicalBodyHash||!ExecutionRowCurrent(*row,now))return Status::Denied;
    if(!nativePort_.randomId(nativePort_.originalBroker,row->handler.permitRef)||!nativePort_.randomId(nativePort_.originalBroker,row->handler.permitNonce)||
        Zero(row->handler.permitRef)||Zero(row->handler.permitNonce)||row->handler.permitRef==row->handler.permitNonce)return DenyAndClose(Status::Unknown);
    for(const auto& previous:rows_)if(&previous!=row&&previous.state!=RowState::Empty&&(previous.handler.permitRef==row->handler.permitRef||previous.handler.permitNonce==row->handler.permitNonce))return DenyAndClose(Status::Unknown);
    row->handler.expiresMono=row->call.expiresMono;row->handler.bindingHash=ExecutionRowHash(*row,true);const auto finalGuard=Guard(daemon,PeerRole::Daemon,now);if(finalGuard!=Status::Ok)return finalGuard;
    if(!ExecutionRowCurrent(*row,now))return Status::Denied;row->state=RowState::Verified;++handlerAdmissions_;out=row->handler;return Status::Ok;
#else
    (void)daemon;(void)body;(void)now;(void)out;return Status::Unavailable;
#endif
}
Status VolatileServerLedger::FinishExecution(const PeerWitness& daemon,const Id& handler,const Digest& result,std::uint64_t now)noexcept {
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const auto guarded=Guard(daemon,PeerRole::Daemon,now);if(guarded!=Status::Ok)return guarded;CallRow* row=nullptr;
    for(auto& original:rows_)if(original.handler.permitRef==handler&&original.state==RowState::Verified){if(row)return DenyAndClose(Status::Unknown);row=&original;}
    if(!row||Zero(result)||!ExecutionRowCurrent(*row,now)||row->handler.bindingHash!=ExecutionRowHash(*row,true)||row->handler.expiresMono!=row->call.expiresMono)return Status::Denied;
    const auto finalGuard=Guard(daemon,PeerRole::Daemon,now);if(finalGuard!=Status::Ok)return finalGuard;if(!ExecutionRowCurrent(*row,now))return Status::Denied;
    row->resultHash=result;row->state=RowState::Finished;return Status::Ok;
#else
    (void)daemon;(void)handler;(void)result;(void)now;return Status::Unavailable;
#endif
}
Digest VolatileServerLedger::CompletionRowHash(const CallRow& row,bool handler)const noexcept {
    std::array<std::uint8_t,1024> bytes{};std::size_t at=0;constexpr char domain[]="lcp2.native.broker-selected-completion-row.v1";
    for(const char c:domain)bytes[at++]=static_cast<std::uint8_t>(c);
    const auto put=[&](const auto& field)noexcept{std::copy(field.begin(),field.end(),bytes.begin()+static_cast<std::ptrdiff_t>(at));at+=field.size();};
    put(BindingHash(row,handler));put(row.completionSelector);W16(bytes.data()+at,row.completionSlot);at+=2;W64(bytes.data()+at,1);at+=8;put(row.completionBinding);return Sha256(bytes.data(),at);
}
bool VolatileServerLedger::CompletionRowCurrent(const CallRow& row,std::uint64_t now)const noexcept {
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    return nativeBound_&&!closed_&&row.body.tool==ToolCode::GetAmeTitleJobStatus&&row.body.kind==CallKind::Completion&&row.body.route==RouteCode::McpToolsCall&&
        row.completionSlot>=1&&row.completionSlot<=2&&!Zero(row.completionSelector)&&row.actorHash==panelDefinition_.actorHash&&row.sourceHash==nativeBinding_.sourceHash&&
        row.policyEpoch==policyEpoch_&&row.revocationEpoch==revocationEpoch_&&now<row.call.expiresMono&&now<sessionDeadline_&&row.call.bindingHash==CompletionRowHash(row,false);
#else
    (void)row;(void)now;return false;
#endif
}
Status VolatileServerLedger::BeginCompletion(const PeerWitness& controller,const BeginCallPayload& body,const Digest& selector,std::uint16_t slot,
    const std::array<std::uint8_t,586>& binding,std::uint64_t jobDeadline,std::uint64_t now,CallReply& out)noexcept {
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const auto guarded=Guard(controller,PeerRole::Controller,now);if(guarded!=Status::Ok)return guarded;
    if(body.tool!=ToolCode::GetAmeTitleJobStatus||body.kind!=CallKind::Completion||body.route!=RouteCode::McpToolsCall||Zero(body.canonicalBodyHash)||Zero(selector)||slot<1||slot>2||
        HasUnresolved()||now>=jobDeadline||usedRows_>=kLifetimeCallRows||callCounter_==std::numeric_limits<std::uint64_t>::max()||now>std::numeric_limits<std::uint64_t>::max()-kCallTtlMs)return Status::Denied;
    CallRow row{};row.state=RowState::Begun;row.body=body;row.completionSlot=slot;row.completionSelector=selector;row.completionBinding=binding;row.actorHash=panelDefinition_.actorHash;row.sourceHash=nativeBinding_.sourceHash;
    row.counter=callCounter_+1;row.policyEpoch=policyEpoch_;row.revocationEpoch=revocationEpoch_;
    if(!nativePort_.randomId(nativePort_.originalBroker,row.call.callRef)||!nativePort_.randomId(nativePort_.originalBroker,row.call.ingressNonce)||Zero(row.call.callRef)||Zero(row.call.ingressNonce)||row.call.callRef==row.call.ingressNonce)return DenyAndClose(Status::Unknown);
    for(const auto& previous:rows_)if(previous.state!=RowState::Empty&&(previous.call.callRef==row.call.callRef||previous.call.ingressNonce==row.call.ingressNonce))return DenyAndClose(Status::Unknown);
    row.call.expiresMono=std::min(now+kCallTtlMs,std::min(jobDeadline,sessionDeadline_));row.call.bindingHash=CompletionRowHash(row,false);
    const auto finalGuard=Guard(controller,PeerRole::Controller,now);if(finalGuard!=Status::Ok)return finalGuard;if(!CompletionRowCurrent(row,now))return DenyAndClose(Status::Unknown);
    rows_[usedRows_]=row;++usedRows_;++callCounter_;out=row.call;return Status::Ok;
#else
    (void)controller;(void)body;(void)selector;(void)slot;(void)binding;(void)jobDeadline;(void)now;(void)out;return Status::Unavailable;
#endif
}
Status VolatileServerLedger::IssueCompletion(const PeerWitness& daemon,const VerifyIngressPayload& body,const std::array<std::uint8_t,586>& binding,std::uint64_t now,HandlerReply& out)noexcept {
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const auto guarded=Guard(daemon,PeerRole::Daemon,now);if(guarded!=Status::Ok)return guarded;CallRow* row=nullptr;
    for(auto& candidate:rows_)if(candidate.state!=RowState::Empty&&candidate.call.callRef==body.callRef){if(row)return DenyAndClose(Status::Unknown);row=&candidate;}
    if(!row||row->state!=RowState::Begun||row->completionBinding!=binding||row->call.ingressNonce!=body.ingressNonce||row->body.tool!=body.body.tool||row->body.kind!=body.body.kind||row->body.route!=body.body.route||row->body.canonicalBodyHash!=body.body.canonicalBodyHash||!CompletionRowCurrent(*row,now))return Status::Denied;
    if(!nativePort_.randomId(nativePort_.originalBroker,row->handler.permitRef)||!nativePort_.randomId(nativePort_.originalBroker,row->handler.permitNonce)||Zero(row->handler.permitRef)||Zero(row->handler.permitNonce)||row->handler.permitRef==row->handler.permitNonce)return DenyAndClose(Status::Unknown);
    for(const auto& previous:rows_)if(&previous!=row&&previous.state!=RowState::Empty&&(previous.handler.permitRef==row->handler.permitRef||previous.handler.permitNonce==row->handler.permitNonce))return DenyAndClose(Status::Unknown);
    row->handler.expiresMono=row->call.expiresMono;row->handler.bindingHash=CompletionRowHash(*row,true);const auto finalGuard=Guard(daemon,PeerRole::Daemon,now);if(finalGuard!=Status::Ok)return finalGuard;if(!CompletionRowCurrent(*row,now))return DenyAndClose(Status::Unknown);
    row->state=RowState::Verified;++handlerAdmissions_;out=row->handler;return Status::Ok;
#else
    (void)daemon;(void)body;(void)binding;(void)now;(void)out;return Status::Unavailable;
#endif
}
Status VolatileServerLedger::FinishCompletion(const PeerWitness& daemon,const Id& handler,const Digest& projection,const std::array<std::uint8_t,586>& binding,std::uint64_t now)noexcept {
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const auto guarded=Guard(daemon,PeerRole::Daemon,now);if(guarded!=Status::Ok)return guarded;CallRow* row=nullptr;
    for(auto& candidate:rows_)if(candidate.state==RowState::Verified&&candidate.handler.permitRef==handler){if(row)return DenyAndClose(Status::Unknown);row=&candidate;}
    if(!row||row->completionBinding!=binding||Zero(projection)||!CompletionRowCurrent(*row,now)||row->handler.bindingHash!=CompletionRowHash(*row,true)||row->handler.expiresMono!=row->call.expiresMono)return Status::Denied;
    const auto finalGuard=Guard(daemon,PeerRole::Daemon,now);if(finalGuard!=Status::Ok)return finalGuard;if(!CompletionRowCurrent(*row,now))return DenyAndClose(Status::Unknown);row->resultHash=projection;row->state=RowState::Finished;return Status::Ok;
#else
    (void)daemon;(void)handler;(void)projection;(void)binding;(void)now;return Status::Unavailable;
#endif
}
Status VolatileServerLedger::FinishLocalStatusRead(const PeerWitness& daemon,const Id& permit,const Digest& result,
    const ReadObservation& observation,std::uint64_t now)noexcept {
    return FinishLocalRead(daemon,permit,ToolCode::GetBridgeStatus,result,observation,now);
}
Status VolatileServerLedger::FinishLocalProjectRead(const PeerWitness& daemon,const Id& permit,const Digest& result,
    const ReadObservation& observation,std::uint64_t now)noexcept {
    // Only the original broker's independently validated D20 terminal path
    // calls this method. D52 cannot choose Tool7 through a supplied kind/code.
    return FinishLocalRead(daemon,permit,ToolCode::GetProjectInfo,result,observation,now);
}
Status VolatileServerLedger::FinishLocalRead(const PeerWitness& daemon,const Id& permit,ToolCode tool,const Digest& result,
    const ReadObservation& observation,std::uint64_t now)noexcept {
    const auto status=Guard(daemon,PeerRole::Daemon,now);if(status!=Status::Ok)return status;
    CallRow* row=nullptr;for(auto& value:rows_)if(value.state!=RowState::Empty&&value.handler.permitRef==permit){row=&value;break;}
    if(!row||row->body.tool!=tool||row->state!=RowState::Verified||Zero(result)||!ReadRowCurrent(*row,now)||
        row->handler.bindingHash!=ReadRowHash(*row,true)||row->handler.expiresMono!=row->call.expiresMono||
        !ObservationCurrent(observation,permit,now))return Status::Denied;
    const auto last=Guard(daemon,PeerRole::Daemon,now);if(last!=Status::Ok)return last;
    if(!ReadRowCurrent(*row,now)||!ObservationCurrent(observation,permit,now))return Status::Denied;
    row->resultHash=result;row->observationHash=observation.readiness;row->observedMono=observation.observedMono;row->state=RowState::Finished;
    readObservation_=observation;if(row->body.kind==CallKind::BootstrapRead)++bracket_.next;return Status::Ok;
}
Status VolatileServerLedger::AdoptReadBracket(const PeerWitness& controller,const Id& bracket,const ReadObservation& observation,
    std::uint64_t now,ReadAuthorization& out)noexcept {
    const auto status=Guard(controller,PeerRole::Controller,now);if(status!=Status::Ok)return status;
    if(!nativeBound_||!bracket_.active||bracket_.consumed||bracket!=bracket_.ref||bracket_.next!=4||now>=bracket_.deadline||
        HasUnresolved()||!ObservationCurrent(observation,session_.sessionRef,now))return Status::Denied;
    std::uint64_t previous=0;for(std::uint8_t index=1;index<=3;++index){const CallRow* row=nullptr;
        for(const auto& value:rows_)if(value.bracket==bracket&&value.bracketIndex==index){if(row)return DenyAndClose(Status::Unknown);row=&value;}
        if(!row||row->state!=RowState::Finished||Zero(row->resultHash)||Zero(row->observationHash)||row->observedMono>now||now-row->observedMono>10000||
            row->body.kind!=CallKind::BootstrapRead||row->body.tool!=(index==2?ToolCode::GetProjectInfo:ToolCode::GetBridgeStatus)||
            row->actorHash!=bracket_.actor||row->sourceHash!=bracket_.source||(previous&&row->counter!=previous+1))return Status::Denied;
        previous=row->counter;
    }
    if(leaseEpoch_==std::numeric_limits<std::uint64_t>::max()||now>std::numeric_limits<std::uint64_t>::max()-60000)return DenyAndClose(Status::Unknown);
    ReadAuthorization value{};if(!nativePort_.randomId(nativePort_.originalBroker,value.ref)||Zero(value.ref))return DenyAndClose(Status::Unknown);
    value.originBracket=bracket;value.actor=bracket_.actor;value.source=bracket_.source;value.epoch=leaseEpoch_+1;value.issuedMono=now;
    value.expiresMono=std::min(now+60000,sessionDeadline_);value.hash=ReadAuthorizationHash(value,bracket);
    const auto last=Guard(controller,PeerRole::Controller,now);if(last!=Status::Ok)return last;
    if(now>=value.expiresMono||!ObservationCurrent(observation,session_.sessionRef,now))return Status::Denied;
    bracket_.consumed=true;bracket_.active=false;read_=value;++leaseEpoch_;out=value;return Status::Ok;
}
Digest VolatileServerLedger::BindingHash(const CallRow& row,bool handler) const noexcept {
    std::array<std::uint8_t,1024> binary{};
    std::size_t at=0;
    const std::string_view domain=nativeBound_ ? (handler ? "lcp2.native.handler.v2" : "lcp2.native.call.v2") :
        (handler ? "lcp2.synthetic.handler.v1" : "lcp2.synthetic.call.v1");
    // u16-length domain, fixed explicit LE fields. No struct casts/padding.
    W16(binary.data(),static_cast<std::uint16_t>(domain.size()));at=2;
    for (const auto c:domain) binary[at++]=static_cast<std::uint8_t>(c);
    const auto append=[&binary,&at](const auto& value) noexcept {
        std::copy(value.begin(),value.end(),binary.begin()+static_cast<std::ptrdiff_t>(at));at+=value.size();
    };
    append(session_.channelNonce);append(session_.sessionRef);append(session_.generation);append(session_.bootNonce);
    append(controller_.privateChannel);append(controller_.originalInstance);append(controller_.witnessHash);
    append(daemon_.privateChannel);append(daemon_.originalInstance);append(daemon_.witnessHash);
    if (nativeBound_) {
        append(nativeBinding_.brokerInstance);append(nativeBinding_.installation);append(nativeBinding_.lineage);
        append(nativeBinding_.scopeHash);append(nativeBinding_.policyHash);append(nativeBinding_.transportHash);
        W64(binary.data()+at,nativeBinding_.openedMono);at+=8;
    }
    append(row.call.callRef);append(row.call.ingressNonce);append(row.body.canonicalBodyHash);
    W16(binary.data()+at,static_cast<std::uint16_t>(row.body.tool));at+=2;
    binary[at++]=static_cast<std::uint8_t>(row.body.kind);
    W16(binary.data()+at,static_cast<std::uint16_t>(row.body.route));at+=2;
    for (const auto value:{row.counter,row.policyEpoch,row.revocationEpoch,row.call.expiresMono,sessionDeadline_}) {
        W64(binary.data()+at,value);at+=8;
    }
    if (handler) { append(row.handler.permitRef);append(row.handler.permitNonce); }
    return Sha256(binary.data(),at);
}
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
Digest VolatileServerLedger::SyntheticDigest(const std::uint8_t* bytes,std::size_t length) noexcept {
    return Sha256(bytes,length);
}
Id VolatileServerLedger::SyntheticId(std::uint8_t domain,std::uint64_t counter) const noexcept {
    Id id{};id[0]=0x53;id[1]=0x59;id[2]=0x4e;id[3]=domain;W64(id.data()+8,counter);return id;
}
void VolatileServerLedger::InitializeSynthetic(std::uint64_t now) noexcept {
    // Test-only deterministic locators. No PID/HANDLE/OS identity/policy issuer.
    // Re-initialization is forbidden even inside this isolated synthetic target.
    if (available_ || closed_ || usedRows_!=0 || now>std::numeric_limits<std::uint64_t>::max()-60000) { Close();return; }
    controller_.role=PeerRole::Controller;daemon_.role=PeerRole::Daemon;
    controller_.privateChannel=SyntheticId(1,1);daemon_.privateChannel=SyntheticId(2,1);
    controller_.originalInstance=SyntheticId(3,1);daemon_.originalInstance=SyntheticId(4,1);
    controller_.witnessHash.fill(0x31);daemon_.witnessHash.fill(0x32);
    controller_.alive=true;daemon_.alive=true;
    session_.channelNonce=SyntheticId(5,1);session_.sessionRef=SyntheticId(6,1);
    session_.generation=SyntheticId(7,1);session_.bootNonce=SyntheticId(8,1);
    lastMono_=now;sessionDeadline_=now+60000;policyEpoch_=1;revocationEpoch_=0;available_=true;
}
#endif
} // namespace local_session::phase
