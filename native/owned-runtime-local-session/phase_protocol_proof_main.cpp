#include "phase_protocol.h"
#include <algorithm>
#include <array>
#include <iostream>
#include <initializer_list>
#include <limits>
#include <type_traits>

#if !defined(AE_AGENT_PHASE_SYNTHETIC_PROOF)
#error This entry point is exclusively an isolated synthetic codec/ledger proof.
#endif

namespace local_session::phase {
class SyntheticPhaseProof final {
public:
    static int Run();
private:
    static void Check(bool condition,const char* label);
    static WireBindings Bindings();
    static Frame Request(Verb verb,std::uint64_t ordinal=1);
    static Frame Reply(Verb verb,Status status=Status::Ok,std::uint64_t ordinal=1,
        std::uint64_t replyTo=1);
    static std::size_t Bytes(const Frame& frame,std::array<std::uint8_t,kMaximumFrameBytes>& bytes);
    static CodecError Receive(WireChannel& channel,const Frame& frame);
    static BeginCallPayload Body(ToolCode tool=ToolCode::SearchSolutions);
    static VerifyIngressPayload Ingress(const CallReply& call,const BeginCallPayload& body);
    static void CodecCases();
    static void CorrelationCases();
    static void LedgerCases();
    static std::size_t checks_,failed_;
};
std::size_t SyntheticPhaseProof::checks_=0;
std::size_t SyntheticPhaseProof::failed_=0;
namespace {
void Put16(std::uint8_t* p,std::uint16_t value) {
    p[0]=static_cast<std::uint8_t>(value);p[1]=static_cast<std::uint8_t>(value>>8);
}
void Put32(std::uint8_t* p,std::uint32_t value) {
    for (unsigned i=0;i<4;++i) p[i]=static_cast<std::uint8_t>(value>>(8*i));
}
void Put64(std::uint8_t* p,std::uint64_t value) {
    for (unsigned i=0;i<8;++i) p[i]=static_cast<std::uint8_t>(value>>(8*i));
}
Id FilledId(std::uint8_t value) { Id id{};id.fill(value);return id; }
Digest FilledHash(std::uint8_t value) { Digest hash{};hash.fill(value);return hash; }
constexpr std::array<Verb,30> kAllVerbs{{Verb::Open,Verb::ReserveInitialLaunch,Verb::Status,
    Verb::Revoke,Verb::BeginCall,Verb::BeginBracket,Verb::AdoptBracket,Verb::RequestDrain,
    Verb::BootHello,Verb::ReadySnapshot,Verb::FirstActorObserved,Verb::Complete,Verb::DrainAck,
    Verb::ShutdownAck,Verb::Drain,Verb::Shutdown,Verb::VerifyIngress,Verb::BindCommand,
    Verb::ConsumeDispatch,Verb::GuardDelivery,Verb::RecordDelivery,Verb::ObserveServerGates,
    Verb::BindOriginalJob,Verb::BeginCompletionPoll,Verb::ObserveJobTerminal,Verb::ObserveMedia,
    Verb::FinishServerOnly,Verb::ObserveSameActorState,Verb::ReservePanelEffect,Verb::ObserveChallenge}};
}
void SyntheticPhaseProof::Check(bool condition,const char* label) {
    ++checks_;
    if (!condition) { ++failed_;std::cerr<<"FAIL synthetic-only: "<<label<<'\n'; }
}
WireBindings SyntheticPhaseProof::Bindings() {
    return {FilledId(1),FilledId(2),FilledId(3),FilledId(4)};
}
Frame SyntheticPhaseProof::Request(Verb verb,std::uint64_t ordinal) {
    Frame frame{};const auto* spec=FindVerb(verb);
    if (!spec) return frame;
    const auto binding=Bindings();
    frame.header={spec->requestDirection,spec->initiatingKind,verb,Status::Ok,
        verb==Verb::BeginCall ? std::uint32_t{37} : spec->requestBytes,ordinal,0,
        binding.channelNonce,binding.sessionRef,binding.generation,binding.bootNonce};
    auto* p=frame.payload.data();std::fill_n(p,frame.header.payloadBytes,std::uint8_t{0x11});
    switch (verb) {
    case Verb::BeginCall:Put16(p,3);p[2]=1;Put16(p+3,1);break;
    case Verb::VerifyIngress:Put16(p+32,3);p[34]=1;Put16(p+35,1);break;
    case Verb::ReadySnapshot:Put32(p+272,0x7f);break;
    case Verb::Complete:Put16(p+64,1);break;
    case Verb::BindCommand:
        Put16(p+40,6);Put16(p+42,1);p[204]=1;std::fill_n(p+172,32,std::uint8_t{0});break;
    case Verb::RecordDelivery:p[48]=1;break;
    case Verb::ObserveServerGates:Put32(p+192,0);break;
    case Verb::BeginCompletionPoll:Put16(p+56,1);break;
    case Verb::ObserveChallenge:Put16(p+16,1);break;
    default:break;
    }
    return frame;
}
Frame SyntheticPhaseProof::Reply(Verb verb,Status status,std::uint64_t ordinal,std::uint64_t replyTo) {
    Frame frame=Request(verb,ordinal);const auto* spec=FindVerb(verb);
    frame.payload.fill(0);frame.header.kind=FrameKind::Reply;frame.header.status=status;
    frame.header.replyToOrdinal=replyTo;
    frame.header.direction=spec->requestDirection==Direction::ControllerToBroker ?
        Direction::BrokerToController : Direction::BrokerToDaemon;
    frame.header.payloadBytes=status==Status::Ok ? spec->okReplyBytes : 0;
    auto* p=frame.payload.data();std::fill_n(p,frame.header.payloadBytes,std::uint8_t{0x11});
    if (status!=Status::Ok) return frame;
    switch (verb) {
    case Verb::Open:Put64(p+16,100);Put64(p+24,60100);break;
    case Verb::Status:case Verb::Revoke:case Verb::BootHello:case Verb::DrainAck:
    case Verb::ShutdownAck:case Verb::ObserveSameActorState:Put16(p,1);break;
    case Verb::BeginBracket:p[24]=1;break;
    case Verb::AdoptBracket:Put64(p+48,100);Put64(p+56,60100);break;
    case Verb::BindOriginalJob:Put32(p+56,48);break;
    case Verb::ReserveInitialLaunch:case Verb::RequestDrain:case Verb::FirstActorObserved:
    case Verb::Complete:case Verb::ConsumeDispatch:case Verb::RecordDelivery:
    case Verb::ObserveJobTerminal:case Verb::ObserveMedia:case Verb::ReservePanelEffect:p[0]=1;break;
    default:break;
    }
    return frame;
}
std::size_t SyntheticPhaseProof::Bytes(const Frame& frame,std::array<std::uint8_t,kMaximumFrameBytes>& bytes) {
    std::size_t written=0;
    Check(EncodeFrame(frame,bytes.data(),bytes.size(),written)==CodecError::None,"fixture encodes");
    return written;
}
CodecError SyntheticPhaseProof::Receive(WireChannel& channel,const Frame& frame) {
    std::array<std::uint8_t,kMaximumFrameBytes> bytes{};const auto size=Bytes(frame,bytes);
    Frame decoded{};return channel.AcceptIncoming(bytes.data(),size,decoded);
}
BeginCallPayload SyntheticPhaseProof::Body(ToolCode tool) {
    return {tool,CallKind::ServerOnly,RouteCode::McpToolsCall,FilledHash(0x45)};
}
VerifyIngressPayload SyntheticPhaseProof::Ingress(const CallReply& call,const BeginCallPayload& body) {
    return {call.callRef,call.ingressNonce,body};
}
void SyntheticPhaseProof::CodecCases() {
    Check(kHeaderBytes==96 && kMaximumFrameBytes==4096 && kMaximumPayloadBytes==2048,"exact envelope caps");
    for (const auto verb:kAllVerbs) {
        const auto request=Request(verb);std::array<std::uint8_t,kMaximumFrameBytes> bytes{};
        const auto size=Bytes(request,bytes);Frame parsed{};
        Check(size==kHeaderBytes+request.header.payloadBytes,"header has no native padding");
        Check(DecodeFrame(bytes.data(),size,parsed)==CodecError::None && parsed.header.verb==verb &&
            parsed.payload==request.payload,"closed table request roundtrip");
        auto wrongDirection=request;
        wrongDirection.header.direction=request.header.direction==Direction::ControllerToBroker ?
            Direction::DaemonToBroker : Direction::ControllerToBroker;
        Check(ValidateFrame(wrongDirection)==CodecError::Direction,"closed table direction");
        if (request.header.kind==FrameKind::Event) {
            auto wrongKind=request;wrongKind.header.kind=FrameKind::Reply;
            Check(ValidateFrame(wrongKind)==CodecError::Kind,"event cannot become reply");
            continue;
        }
        for (std::uint16_t code=0;code<=6;++code) {
            const auto reply=Reply(verb,static_cast<Status>(code));const auto replySize=Bytes(reply,bytes);
            Check(DecodeFrame(bytes.data(),replySize,parsed)==CodecError::None,"closed reply status branch roundtrip");
            if (code!=0) {
                auto extra=reply;extra.header.payloadBytes=1;extra.payload[0]=1;
                Check(ValidateFrame(extra)==CodecError::PayloadLength,"error branch forbids positive grant bytes");
            }
        }
    }
    const auto request=Request(Verb::BeginCall);std::array<std::uint8_t,kMaximumFrameBytes> bytes{};
    const auto size=Bytes(request,bytes);
    Check(bytes[0]=='L' && bytes[1]=='C' && bytes[2]=='P' && bytes[3]=='2' && bytes[4]==2 &&
        bytes[5]==0 && bytes[6]==1 && bytes[7]==1 && bytes[8]==5 && bytes[12]==37 &&
        bytes[16]==1 && bytes[24]==0 && bytes[32]==1 && bytes[48]==2 && bytes[64]==3 && bytes[80]==4,
        "independent exact LE offsets");
    for (std::size_t partial=0;partial<size;++partial) {
        Frame untouched{};untouched.header.senderOrdinal=777;
        Check(DecodeFrame(bytes.data(),partial,untouched)!=CodecError::None &&
            untouched.header.senderOrdinal==777,"every partial frame rejected before output/state");
    }
    Frame parsed{};bytes[size]=0;
    Check(DecodeFrame(bytes.data(),size+1,parsed)==CodecError::FrameLength,"trailing zero is not padding");
    bytes[size]=0x7f;
    Check(DecodeFrame(bytes.data(),size+1,parsed)==CodecError::FrameLength,"extra nonzero frame refused");
    auto malformed=bytes;malformed[2]='S';malformed[3]='B';
    Check(DecodeFrame(malformed.data(),128,parsed)==CodecError::Magic,"LCSB baseline not auto-detected");
    malformed=bytes;malformed[4]=1;
    Check(DecodeFrame(malformed.data(),size,parsed)==CodecError::Version,"version mismatch");
    malformed=bytes;malformed[6]=0;
    Check(DecodeFrame(malformed.data(),size,parsed)==CodecError::Direction,"unknown direction");
    malformed=bytes;malformed[7]=4;
    Check(DecodeFrame(malformed.data(),size,parsed)==CodecError::Kind,"unknown frame kind");
    malformed=bytes;Put16(malformed.data()+8,9);
    Check(DecodeFrame(malformed.data(),size,parsed)==CodecError::Verb,"unknown verb");
    malformed=bytes;Put16(malformed.data()+10,7);
    Check(DecodeFrame(malformed.data(),size,parsed)==CodecError::Status,"unknown status");
    malformed=bytes;Put64(malformed.data()+24,1);
    Check(DecodeFrame(malformed.data(),size,parsed)==CodecError::ReplyTo,"request has no replyTo");
    for (const auto badOrdinal:{std::uint64_t{0},std::numeric_limits<std::uint64_t>::max()}) {
        malformed=bytes;Put64(malformed.data()+16,badOrdinal);
        Check(DecodeFrame(malformed.data(),size,parsed)==CodecError::Ordinal,"zero/overflow sender ordinal");
    }
    for (const auto oversized:{std::uint32_t{2049},std::uint32_t{4096},std::uint32_t{0xffffffff}}) {
        malformed=bytes;Put32(malformed.data()+12,oversized);
        Check(DecodeFrame(malformed.data(),size,parsed)==CodecError::FrameLength,"payload size checked before copy");
    }
    Check(DecodeFrame(bytes.data(),kMaximumFrameBytes+1,parsed)==CodecError::FrameLength,"frame cap before read");
    Check(DecodeFrame(nullptr,size,parsed)==CodecError::NullBuffer,"null buffer");
    auto extra=request;extra.payload[37]=1;
    Check(ValidateFrame(extra)==CodecError::Reserved,"unused in-memory tail cannot encode as hidden padding");
    for (const auto kind:{std::uint8_t{0},std::uint8_t{8}}) {
        auto tagged=request;tagged.payload[2]=kind;
        Check(ValidateFrame(tagged)==CodecError::Tag,"unknown call kind");
    }
    auto tagged=request;Put16(tagged.payload.data(),0xffff);
    Check(ValidateFrame(tagged)==CodecError::Tag,"unknown tool code");
    tagged=request;Put16(tagged.payload.data()+3,2);
    Check(ValidateFrame(tagged)==CodecError::Tag,"alternate route refused");
    tagged=request;tagged.payload[2]=2;
    Check(ValidateFrame(tagged)==CodecError::Tag,"registered tool kind cannot be substituted");
    tagged=Request(Verb::ReadySnapshot);Put32(tagged.payload.data()+272,0x80);
    Check(ValidateFrame(tagged)==CodecError::Reserved,"unknown readiness flag");
    tagged=Request(Verb::BindCommand);tagged.payload[204]=7;
    Check(ValidateFrame(tagged)==CodecError::Tag,"unknown delivery tag");
    tagged=Request(Verb::BindCommand);tagged.payload[172]=1;
    Check(ValidateFrame(tagged)==CodecError::Reserved,"non-AME body hash padding must be zero");
    tagged=Request(Verb::ObserveServerGates);Put32(tagged.payload.data()+192,1);
    Check(ValidateFrame(tagged)==CodecError::Reserved,"gate mask port unavailable");
    tagged=Reply(Verb::ConsumeDispatch);tagged.payload[0]=2;
    Check(ValidateFrame(tagged)==CodecError::Tag,"duplicate durable readback cannot issue late guard");
    std::fill_n(tagged.payload.data()+97,16,std::uint8_t{0});
    Check(ValidateFrame(tagged)==CodecError::None,"duplicate is only factual wire disposition");
    std::size_t written=99;bytes.fill(0x55);
    Check(EncodeFrame(request,bytes.data(),kHeaderBytes,written)==CodecError::FrameLength && written==0 &&
        bytes[0]==0x55,"short output leaves bytes and length unchanged");
    BeginCallPayload begin{};VerifyIngressPayload ingress{};
    Check(ReadServerOnlyBegin(request,begin)==CodecError::None && begin.tool==ToolCode::SearchSolutions,
        "typed begin extracted after full validation");
    Check(ReadServerOnlyIngress(Request(Verb::VerifyIngress),ingress)==CodecError::None &&
        ingress.body.canonicalBodyHash==FilledHash(0x11),"typed ingress extracted after full validation");
    auto read=request;read.header.payloadBytes=69;Put16(read.payload.data(),6);read.payload[2]=4;
    std::fill_n(read.payload.data()+37,32,std::uint8_t{0x22});
    Check(ValidateFrame(read)==CodecError::None && ReadServerOnlyBegin(read,begin)==CodecError::Tag,
        "READ schema recognized but no server-only handler admission");
    const std::array<std::uint8_t,3> abc{{'a','b','c'}};
    const Digest expected{{0xba,0x78,0x16,0xbf,0x8f,0x01,0xcf,0xea,0x41,0x41,0x40,0xde,0x5d,0xae,0x22,0x23,
        0xb0,0x03,0x61,0xa3,0x96,0x17,0x7a,0x9c,0xb4,0x10,0xff,0x61,0xf2,0x00,0x15,0xad}};
    Check(VolatileServerLedger::SyntheticDigest(abc.data(),abc.size())==expected,"SHA256 known vector, no authority");
    const Digest emptyExpected{{0xe3,0xb0,0xc4,0x42,0x98,0xfc,0x1c,0x14,0x9a,0xfb,0xf4,0xc8,0x99,0x6f,0xb9,0x24,
        0x27,0xae,0x41,0xe4,0x64,0x9b,0x93,0x4c,0xa4,0x95,0x99,0x1b,0x78,0x52,0xb8,0x55}};
    Check(VolatileServerLedger::SyntheticDigest(abc.data(),0)==emptyExpected,"SHA256 empty known vector");
    constexpr std::string_view multi="abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    std::array<std::uint8_t,56> multiBytes{};
    for (std::size_t i=0;i<multi.size();++i) multiBytes[i]=static_cast<std::uint8_t>(multi[i]);
    const Digest multiExpected{{0x24,0x8d,0x6a,0x61,0xd2,0x06,0x38,0xb8,0xe5,0xc0,0x26,0x93,0x0c,0x3e,0x60,0x39,
        0xa3,0x3c,0xe4,0x59,0x64,0xff,0x21,0x67,0xf6,0xec,0xed,0xd4,0x19,0xdb,0x06,0xc1}};
    Check(VolatileServerLedger::SyntheticDigest(multiBytes.data(),multiBytes.size())==multiExpected,
        "SHA256 padding spans two blocks, no authority");
}
void SyntheticPhaseProof::CorrelationCases() {
    const auto request=Request(Verb::BeginCall);const auto ack=Reply(Verb::BeginCall,Status::Unavailable);
    {
        WireChannel client(Direction::BrokerToController,Bindings(),BindingStage::Open);
        Check(client.TrackOutgoing(request)==CodecError::None && Receive(client,ack)==CodecError::None,
            "one exact pending request/reply");
        Check(Receive(client,Reply(Verb::BeginCall,Status::Unavailable,2))==CodecError::Correlation &&
            client.Closed(),"duplicate ACK with new ordinal cannot clear a second request");
    }
    for (unsigned variant=0;variant<6;++variant) {
        WireChannel client(Direction::BrokerToController,Bindings(),BindingStage::Open);
        Check(client.TrackOutgoing(request)==CodecError::None,"pending request starts");
        auto wrong=ack;
        switch (variant) {
        case 0:wrong.header.replyToOrdinal=2;break;
        case 1:wrong=Reply(Verb::Status,Status::Unavailable);break;
        case 2:wrong.header.channelNonce[0]^=1;break;
        case 3:wrong.header.sessionRef[0]^=1;break;
        case 4:wrong.header.generation[0]^=1;break;
        case 5:wrong.header.bootNonce[0]^=1;break;
        default:break;
        }
        Check(Receive(client,wrong)!=CodecError::None && client.Closed() && client.PendingBecameUnknown(),
            "wrong reply/binding closes unresolved request as UNKNOWN");
        Check(client.TrackOutgoing(request)==CodecError::Closed,"closed channel never reopens");
    }
    {
        WireChannel client(Direction::BrokerToController,Bindings(),BindingStage::Open);
        Check(Receive(client,ack)==CodecError::Correlation,"unsolicited ACK");
    }
    {
        WireChannel client(Direction::BrokerToController,Bindings(),BindingStage::Open);
        Check(client.TrackOutgoing(request)==CodecError::None &&
            Receive(client,Reply(Verb::BeginCall,Status::Unknown))==CodecError::None &&
            client.Closed() && client.PendingBecameUnknown(),"matched UNKNOWN reply is factual closure, no new RPC");
    }
    {
        WireChannel client(Direction::BrokerToController,Bindings(),BindingStage::Open);
        Check(client.TrackOutgoing(request)==CodecError::None,"first pending only");
        Check(client.TrackOutgoing(Request(Verb::BeginCall,2))==CodecError::Pending &&
            client.PendingBecameUnknown(),"second concurrent RPC refused");
    }
    {
        WireChannel broker(Direction::ControllerToBroker,Bindings(),BindingStage::Open);
        Check(Receive(broker,Request(Verb::BeginCall,2))==CodecError::Ordinal,"ordinal gap before state");
    }
    {
        WireChannel broker(Direction::ControllerToBroker,Bindings(),BindingStage::Open);
        Check(Receive(broker,request)==CodecError::None && broker.TrackOutgoing(ack)==CodecError::None,
            "incoming pending request has exact outgoing reply");
        Check(Receive(broker,request)==CodecError::Ordinal,"request ordinal reuse");
    }
    {
        WireChannel client(Direction::BrokerToController,Bindings(),BindingStage::Open);
        Check(client.TrackOutgoing(request)==CodecError::None && Receive(client,ack)==CodecError::None,
            "matched ACK once");
        Check(Receive(client,ack)==CodecError::Ordinal,"literal duplicate ACK");
    }
    {
        WireChannel client(Direction::BrokerToController,Bindings(),BindingStage::Open);
        Check(client.TrackOutgoing(request)==CodecError::None,"partial ACK pending");
        std::array<std::uint8_t,kMaximumFrameBytes> bytes{};const auto size=Bytes(ack,bytes);Frame out{};
        Check(client.AcceptIncoming(bytes.data(),size-1,out)==CodecError::FrameLength &&
            client.PendingBecameUnknown(),"partial ACK conservatively UNKNOWN");
    }
    {
        WireChannel client(Direction::BrokerToController,Bindings(),BindingStage::Open);
        Check(client.TrackOutgoing(request)==CodecError::None,"trailing ACK pending");
        std::array<std::uint8_t,kMaximumFrameBytes> bytes{};const auto size=Bytes(ack,bytes);Frame out{};
        Check(client.AcceptIncoming(bytes.data(),size+1,out)==CodecError::FrameLength &&
            client.PendingBecameUnknown(),"extra ACK conservatively UNKNOWN");
    }
    {
        WireBindings before{};before.channelNonce=FilledId(1);
        WireChannel channel(Direction::ControllerToBroker,before,BindingStage::BeforeOpen);
        auto pre=request;pre.header.sessionRef={};pre.header.generation={};pre.header.bootNonce={};
        Check(Receive(channel,pre)==CodecError::Binding,"BeginCall before Open refused");
        WireChannel bad(Direction::ControllerToBroker,Bindings(),BindingStage::BeforeOpen);
        Check(bad.Closed(),"nonzero session bindings before Open refused");
    }
    {
        WireChannel channel(Direction::BrokerToController,Bindings(),BindingStage::Open);
        channel.outgoingOrdinal_=std::numeric_limits<std::uint64_t>::max()-1;
        auto overflow=request;overflow.header.senderOrdinal=std::numeric_limits<std::uint64_t>::max();
        Check(channel.TrackOutgoing(overflow)==CodecError::Ordinal,"ordinal exhaustion no wrap");
    }
    {
        WireChannel daemon(Direction::BrokerToDaemon,Bindings(),BindingStage::Open);
        Check(daemon.TrackOutgoing(Request(Verb::VerifyIngress))==CodecError::None,"daemon request pending");
        Check(Receive(daemon,Request(Verb::ObserveChallenge))==CodecError::None,"explicit lifecycle event while RPC pending");
        Check(Receive(daemon,Reply(Verb::VerifyIngress,Status::Unavailable,2))==CodecError::None,
            "event shares outbound stream but never substitutes for reply");
    }
}
void SyntheticPhaseProof::LedgerCases() {
    static_assert(!std::is_default_constructible_v<VolatileServerLedger>);
    static_assert(!std::is_copy_constructible_v<VolatileServerLedger>);
    static_assert(!std::is_move_constructible_v<VolatileServerLedger>);
    Check(!kProductionRuntimeEntryAvailable,"production runtime entry remains CLOSED");
    {
        VolatileServerLedger closed;CallReply call{};
        Check(closed.Begin(closed.controller_,Body(),100,call)==Status::Unavailable &&
            closed.usedRows_==0 && closed.handlerAdmissions_==0,"default private constructor has no authority");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok && ledger.handlerAdmissions_==0,
            "controller Begin never admits handler before daemon match");
        Check(ledger.Verify(ledger.daemon_,Ingress(call,Body()),101,handler)==Status::Ok &&
            ledger.handlerAdmissions_==1,"two exact synthetic peers permit one SERVER_ONLY handler");
        Check(call.bindingHash!=handler.bindingHash,"separate phase commitment domains");
        Check(ledger.Finish(ledger.daemon_,handler.permitRef,FilledHash(0x66),102)==Status::Ok &&
            ledger.rows_[0].state==VolatileServerLedger::RowState::Finished,"exact server-only result closes row");
        Check(ledger.Finish(ledger.daemon_,handler.permitRef,FilledHash(0x66),103)==Status::Denied &&
            ledger.handlerAdmissions_==1,"terminal replay creates no second handler");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok,"finish before ingress fixture begins");
        Check(ledger.Finish(ledger.daemon_,call.callRef,FilledHash(0x66),101)==Status::Denied &&
            ledger.handlerAdmissions_==0,"terminal phase cannot skip two-peer ingress");
    }
    for (unsigned variant=0;variant<9;++variant) {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok &&
            ledger.Verify(ledger.daemon_,Ingress(call,Body()),101,handler)==Status::Ok,
            "post-Verify drift fixture has one exact synthetic handler permit");
        switch (variant) {
        case 0:++ledger.policyEpoch_;break;
        case 1:++ledger.revocationEpoch_;break;
        case 2:ledger.session_.generation[0]^=1;break;
        case 3:ledger.controller_.witnessHash[0]^=1;break;
        case 4:ledger.daemon_.witnessHash[0]^=1;break;
        case 5:ledger.rows_[0].call.bindingHash[0]^=1;break;
        case 6:ledger.rows_[0].handler.bindingHash[0]^=1;break;
        case 7:ledger.rows_[0].handler.permitNonce[0]^=1;break;
        case 8:++ledger.rows_[0].handler.expiresMono;break;
        default:break;
        }
        Check(ledger.Finish(ledger.daemon_,handler.permitRef,FilledHash(0x66),102)==Status::Denied &&
            ledger.handlerAdmissions_==1 && ledger.closed_ &&
            ledger.rows_[0].state==VolatileServerLedger::RowState::Unknown &&
            ledger.rows_[0].resultHash==Digest{},
            "post-Verify epoch/original binding/commitment drift cannot accept terminal result");
    }
    for (unsigned variant=0;variant<10;++variant) {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok,"malformed ingress fixture begins");
        auto ingress=Ingress(call,Body());
        switch (variant) {
        case 0:ingress.callRef[0]^=1;break;
        case 1:ingress.ingressNonce[0]^=1;break;
        case 2:ingress.body.canonicalBodyHash[0]^=1;break;
        case 3:ingress.body.tool=ToolCode::GetSolution;break;
        case 4:ingress.body.kind=CallKind::Read;break;
        case 5:ingress.body.route=static_cast<RouteCode>(2);break;
        case 6:++ledger.policyEpoch_;break;
        case 7:++ledger.revocationEpoch_;break;
        case 8:ledger.session_.generation[0]^=1;break;
        case 9:ledger.daemon_.witnessHash[0]^=1;break;
        default:break;
        }
        Check(ledger.Verify(ledger.daemon_,ingress,101,handler)==Status::Denied &&
            ledger.handlerAdmissions_==0 && ledger.closed_ &&
            ledger.rows_[0].state==VolatileServerLedger::RowState::Unknown,
            "mismatch/digest/phase/epoch/runtime drift gives zero handler admissions");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply a{},b{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,a)==Status::Ok &&
            ledger.Begin(ledger.controller_,Body(),101,b)==Status::Ok,"two bounded call rows");
        auto cross=Ingress(a,Body());cross.ingressNonce=b.ingressNonce;
        Check(ledger.Verify(ledger.daemon_,cross,102,handler)==Status::Denied &&
            ledger.handlerAdmissions_==0,"cross-call nonce cannot match another row");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok,"forged peer fixture begins");
        VolatileServerLedger::PeerWitness forged;
        forged.role=ledger.daemon_.role;forged.privateChannel=ledger.daemon_.privateChannel;
        forged.originalInstance=ledger.daemon_.originalInstance;forged.witnessHash=ledger.daemon_.witnessHash;forged.alive=true;
        Check(ledger.Verify(forged,Ingress(call,Body()),101,handler)==Status::Denied &&
            ledger.handlerAdmissions_==0,"copied synthetic fields do not reconstruct original private peer row");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok,"wrong peer role fixture begins");
        Check(ledger.Verify(ledger.controller_,Ingress(call,Body()),101,handler)==Status::Denied &&
            ledger.handlerAdmissions_==0,"controller cannot impersonate daemon");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);ledger.daemon_.alive=false;CallReply call{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Revoked &&
            ledger.usedRows_==0 && ledger.handlerAdmissions_==0,"one peer only never admits call/handler");
    }
    for (const auto expiry:{std::uint64_t{30100},std::uint64_t{60100}}) {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok,"expiry fixture begins");
        Check(ledger.Verify(ledger.daemon_,Ingress(call,Body()),expiry,handler)!=Status::Ok &&
            ledger.handlerAdmissions_==0,"call/session deadline exact boundary denies handler");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};
        Check(ledger.Begin(ledger.controller_,Body(),99,call)==Status::Unknown && ledger.handlerAdmissions_==0,
            "monotonic rollback closes admission");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok &&
            ledger.Verify(ledger.daemon_,Ingress(call,Body()),101,handler)==Status::Ok,"replay fixture matched once");
        Check(ledger.Verify(ledger.daemon_,Ingress(call,Body()),102,handler)==Status::Denied &&
            ledger.handlerAdmissions_==1,"ingress replay never admits handler twice");
    }
    for (const auto tool:{ToolCode::GetOwnedRuntimeStatus,ToolCode::GetSolution}) {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(tool),100,call)==Status::Ok &&
            ledger.Verify(ledger.daemon_,Ingress(call,Body(tool)),101,handler)==Status::Ok,
            "other exact pure SERVER_ONLY tool codes");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};
        Check(ledger.Begin(ledger.controller_,Body(ToolCode::EnsureOwnedRuntimeDaemon),100,call)==Status::Unavailable &&
            ledger.usedRows_==0 && ledger.handlerAdmissions_==0,"daemon launch control remains unavailable");
    }
    for (const auto kind:{CallKind::Panel,CallKind::BootstrapRead,CallKind::Read,
        CallKind::ExecutionPrep,CallKind::Execute,CallKind::Completion}) {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};auto body=Body();body.kind=kind;
        Check(ledger.Begin(ledger.controller_,body,100,call)==Status::Denied &&
            ledger.usedRows_==0 && ledger.handlerAdmissions_==0,"all non-server-only kinds have no port");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);
        for (std::size_t i=0;i<kCallRows;++i) {
            CallReply call{};HandlerReply handler{};const auto now=100+static_cast<std::uint64_t>(i)*3;
            Check(ledger.Begin(ledger.controller_,Body(),now,call)==Status::Ok &&
                ledger.Verify(ledger.daemon_,Ingress(call,Body()),now+1,handler)==Status::Ok &&
                ledger.Finish(ledger.daemon_,handler.permitRef,FilledHash(0x77),now+2)==Status::Ok,
                "bounded rows can finish without eviction");
        }
        CallReply overflow{};
        Check(ledger.Begin(ledger.controller_,Body(),300,overflow)==Status::Unknown &&
            ledger.usedRows_==kCallRows && ledger.handlerAdmissions_==kCallRows && ledger.closed_,
            "ledger exhaustion never reuses finished row or increases budget");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};
        for (std::size_t i=0;i<kCallRows;++i)
            Check(ledger.Begin(ledger.controller_,Body(),100+static_cast<std::uint64_t>(i),call)==Status::Ok,
                "unresolved call rows remain allocated");
        Check(ledger.Begin(ledger.controller_,Body(),200,call)==Status::Unknown &&
            ledger.usedRows_==kCallRows && ledger.handlerAdmissions_==0,"unresolved ledger rows never evicted");
        for (const auto& row:ledger.rows_)
            Check(row.state==VolatileServerLedger::RowState::Unknown,"exhaustion retains unresolved UNKNOWN rows");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);ledger.callCounter_=std::numeric_limits<std::uint64_t>::max();
        CallReply call{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Unknown && ledger.usedRows_==0,
            "call counter cannot overflow");
    }
    {
        const auto maximum=std::numeric_limits<std::uint64_t>::max();VolatileServerLedger ledger;
        ledger.InitializeSynthetic(maximum-60001);CallReply call{};
        Check(ledger.Begin(ledger.controller_,Body(),maximum-20000,call)==Status::Unknown && ledger.usedRows_==0,
            "native TTL addition cannot overflow");
    }
    {
        VolatileServerLedger ledger;ledger.InitializeSynthetic(100);CallReply call{};HandlerReply handler{};
        Check(ledger.Begin(ledger.controller_,Body(),100,call)==Status::Ok,"EOF fixture begins");
        ledger.controller_.alive=false;
        Check(ledger.Verify(ledger.daemon_,Ingress(call,Body()),101,handler)==Status::Revoked &&
            ledger.handlerAdmissions_==0,"original controller EOF closes pending call");
        ledger.InitializeSynthetic(102);
        Check(ledger.closed_ && ledger.Verify(ledger.daemon_,Ingress(call,Body()),103,handler)==Status::Revoked,
            "new synthetic initialization cannot revive closed private rows");
    }
}
int SyntheticPhaseProof::Run() {
    std::cout<<"SYNTHETIC LCP2 codec/volatile SERVER_ONLY ledger proof ONLY; "
        "productionAuthority=false; OS/held-peer authority=NOT_TESTED; AE effects=0\n";
    CodecCases();CorrelationCases();LedgerCases();
    std::cout<<"synthetic_checks="<<checks_<<" failed="<<failed_<<" productionRuntimeEntry=CLOSED\n";
    return failed_==0 ? 0 : 1;
}
} // namespace local_session::phase
int main() { return local_session::phase::SyntheticPhaseProof::Run(); }
