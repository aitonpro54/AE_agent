#include "phase_protocol.h"
#include <algorithm>
#include <initializer_list>
#include <limits>

namespace local_session::phase {
namespace {
constexpr std::uint16_t kVariableBytes=0xffff;
constexpr std::array<VerbSpec, 30> kVerbs{{
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
    // No spare verb slots, aliases or protocol negotiation entries.
}};
constexpr std::array<ToolSpec, 7> kTools{{
    {ToolCode::GetOwnedRuntimeStatus,"get_owned_runtime_status",CallKind::ServerOnly,true},
    {ToolCode::EnsureOwnedRuntimeDaemon,"ensure_owned_runtime_daemon",CallKind::ServerOnly,false},
    {ToolCode::SearchSolutions,"search_solutions",CallKind::ServerOnly,true},
    {ToolCode::GetSolution,"get_solution",CallKind::ServerOnly,true},
    {ToolCode::EnsureAgentPanel,"ensure_ae_agent_panel",CallKind::Panel,false},
    {ToolCode::GetBridgeStatus,"get_bridge_status",CallKind::Read,false},
    {ToolCode::GetProjectInfo,"get_project_info",CallKind::Read,false},
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
        case Verb::Status:case Verb::Revoke:case Verb::BootHello:case Verb::DrainAck:
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
        // No AME tool code is registered in this first closed build map.
        if (!Zero(p+172,32)) return CodecError::Reserved;
        break;
    case Verb::RecordDelivery:
        if (p[48]<1 || p[48]>2) return CodecError::Tag;
        break;
    case Verb::ObserveServerGates:
        // Gate interpretation/issuance is unavailable; no unreviewed mask is admitted.
        if (U32(p+192)!=0) return CodecError::Reserved;
        break;
    case Verb::BeginCompletionPoll:
        if (U64(p+16)==0 || U16(p+56)<1 || U16(p+56)>2) return CodecError::Tag;
        break;
    case Verb::ReservePanelEffect:
        if (U64(p+16)==0) return CodecError::Tag;
        break;
    case Verb::ObserveChallenge:
        if (U16(p+16)<1 || U16(p+16)>4) return CodecError::Tag;
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
    else if (h.kind==FrameKind::Reply) incomingPending_={};
    if (ReplyIsUnknown(frame)) { pendingUnknown_=true;closed_=true; }
    return CodecError::None;
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

VolatileServerLedger::VolatileServerLedger() noexcept=default;
void VolatileServerLedger::Close() noexcept {
    closed_=true;
    for (auto& row:rows_) if (row.state==RowState::Begun || row.state==RowState::Verified) row.state=RowState::Unknown;
}
Status VolatileServerLedger::DenyAndClose(Status status) noexcept { Close();return status; }
Status VolatileServerLedger::Guard(const PeerWitness& peer,PeerRole role,std::uint64_t now) noexcept {
#if !defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
    (void)peer;(void)role;(void)now;
    return Status::Unavailable; // No production original-held-peer issuer yet.
#else
    if (!available_) return Status::Unavailable;
    if (closed_) return Status::Revoked;
    const auto* original=role==PeerRole::Controller ? &controller_ : &daemon_;
    if (&peer!=original || peer.role!=role || Zero(peer.privateChannel) ||
        Zero(peer.originalInstance) || Zero(peer.witnessHash)) return DenyAndClose(Status::Denied);
    if (!controller_.alive || !daemon_.alive) return DenyAndClose(Status::Revoked);
    if (now<lastMono_) return DenyAndClose(Status::Unknown);
    if (now>=sessionDeadline_) return DenyAndClose(Status::RevalidationRequired);
    lastMono_=now;
    return Status::Ok;
#endif
}
Status VolatileServerLedger::Begin(const PeerWitness& controller,const BeginCallPayload& body,
    std::uint64_t now,CallReply& out) noexcept {
    const auto guarded=Guard(controller,PeerRole::Controller,now);
    if (guarded!=Status::Ok) return guarded;
    const auto* tool=FindTool(body.tool);
    if (!tool || body.kind!=CallKind::ServerOnly || tool->kind!=CallKind::ServerOnly ||
        body.route!=RouteCode::McpToolsCall || Zero(body.canonicalBodyHash)) return DenyAndClose(Status::Denied);
    if (!tool->serverOnlyHandler) return Status::Unavailable;
    if (usedRows_==kCallRows || callCounter_==std::numeric_limits<std::uint64_t>::max() ||
        now>std::numeric_limits<std::uint64_t>::max()-kCallTtlMs) return DenyAndClose(Status::Unknown);
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
    CallRow row{};row.state=RowState::Begun;row.body=body;row.counter=callCounter_+1;
    row.policyEpoch=policyEpoch_;row.revocationEpoch=revocationEpoch_;
    row.call.callRef=SyntheticId(0x40,row.counter);row.call.ingressNonce=SyntheticId(0x41,row.counter);
    row.call.expiresMono=std::min(now+kCallTtlMs,sessionDeadline_);
    row.call.bindingHash=BindingHash(row,false);
    rows_[usedRows_]=row;++usedRows_;++callCounter_;out=row.call;
    return Status::Ok;
#else
    (void)out;return Status::Unavailable; // No production nonce/held-peer issuer exists.
#endif
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
#if defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
    matched->handler.permitRef=SyntheticId(0x42,matched->counter);
    matched->handler.permitNonce=SyntheticId(0x43,matched->counter);
    matched->handler.expiresMono=matched->call.expiresMono;
    matched->handler.bindingHash=BindingHash(*matched,true);
    matched->state=RowState::Verified;++handlerAdmissions_;out=matched->handler;
    return Status::Ok;
#else
    (void)out;return Status::Unavailable;
#endif
}
Status VolatileServerLedger::Finish(const PeerWitness& daemon,const Id& permit,const Digest& result,
    std::uint64_t now) noexcept {
    const auto guarded=Guard(daemon,PeerRole::Daemon,now);
    if (guarded!=Status::Ok) return guarded;
    for (auto& row:rows_) if (row.state!=RowState::Empty && row.handler.permitRef==permit) {
        if (row.state!=RowState::Verified || row.policyEpoch!=policyEpoch_ ||
            row.revocationEpoch!=revocationEpoch_ ||
            row.call.bindingHash!=BindingHash(row,false) ||
            row.handler.bindingHash!=BindingHash(row,true) ||
            row.handler.expiresMono!=row.call.expiresMono ||
            now>=row.call.expiresMono || now>=row.handler.expiresMono || Zero(result))
            return DenyAndClose(Status::Denied);
        row.resultHash=result;row.state=RowState::Finished;return Status::Ok;
    }
    return DenyAndClose(Status::Denied);
}
Digest VolatileServerLedger::BindingHash(const CallRow& row,bool handler) const noexcept {
    std::array<std::uint8_t,512> binary{};
    std::size_t at=0;
    const std::string_view domain=handler ? "lcp2.synthetic.handler.v1" : "lcp2.synthetic.call.v1";
    // u16-length domain, fixed explicit LE fields. No struct casts/padding.
    W16(binary.data(),static_cast<std::uint16_t>(domain.size()));at=2;
    for (const auto c:domain) binary[at++]=static_cast<std::uint8_t>(c);
    const auto append=[&binary,&at](const auto& value) noexcept {
        std::copy(value.begin(),value.end(),binary.begin()+static_cast<std::ptrdiff_t>(at));at+=value.size();
    };
    append(session_.channelNonce);append(session_.sessionRef);append(session_.generation);append(session_.bootNonce);
    append(controller_.privateChannel);append(controller_.originalInstance);append(controller_.witnessHash);
    append(daemon_.privateChannel);append(daemon_.originalInstance);append(daemon_.witnessHash);
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
