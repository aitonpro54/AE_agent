#include "phase_protocol.h"
#include "trusted_execution_budget.h"
#include "ame_pe_mapped_span.h"
#include "ame_native_rgba_png.h"
#include <algorithm>
#include <array>
#include <iostream>
#include <initializer_list>
#include <limits>
#include <type_traits>
#include <utility>
#include <vector>

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
    static void BudgetCases();
    static void PeSpanCases();
    static void PngCases();
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
    // Exact D47..D50 request fields, independent of any production issuer.
    // Reject each absent semantic field before a broker consumer can observe it.
    for(const auto verb:{Verb::BindOriginalJob,Verb::BeginCompletionPoll,Verb::ObserveJobTerminal,Verb::ObserveMedia}){
        const std::vector<std::pair<std::size_t,std::size_t>> fields=verb==Verb::BindOriginalJob?
            std::vector<std::pair<std::size_t,std::size_t>>{{0,16},{16,32},{48,32},{80,32}}:
            verb==Verb::BeginCompletionPoll?std::vector<std::pair<std::size_t,std::size_t>>{{0,16},{16,8},{24,32},{56,2}}:
            std::vector<std::pair<std::size_t,std::size_t>>{{0,16},{16,16},{32,32},{64,32}};
        for(const auto& field:fields){auto missing=Request(verb);std::fill_n(missing.payload.data()+field.first,field.second,std::uint8_t{0});
            Check(ValidateFrame(missing)==CodecError::Tag,"D47..D50 missing exact request field refused");}
    }
    for(const auto operation:{std::uint16_t{3},std::numeric_limits<std::uint16_t>::max()}){auto wrong=Request(Verb::BeginCompletionPoll);
        Put16(wrong.payload.data()+56,operation);Check(ValidateFrame(wrong)==CodecError::Tag,"D48 closed observation operation refused");}
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
void SyntheticPhaseProof::BudgetCases(){
    using trusted_read::ExecutionCost;using trusted_read::FixedTwoTitleCosts;
    Check(kCallRows==32&&kLifetimeCallRows==32,"ordinary/synthetic Call32 is unchanged");
    Check(trusted_read::kTwoTitleCalls==86&&trusted_read::kTwoTitlePreparedScopes==11&&trusted_read::kTwoTitleReadIssuances==12&&
        trusted_read::kTwoTitlePollsPerJob==10&&trusted_read::kTwoTitleMediaChildren==6,"finite production object ceilings are independent");
    ExecutionCost total{};bool exact=total.Plus(FixedTwoTitleCosts::Startup(),total)&&total.Plus(FixedTwoTitleCosts::InitialRead(),total)&&
        total.Plus(FixedTwoTitleCosts::Preparation(),total)&&total.Plus(FixedTwoTitleCosts::Checkpoint(),total);
    for(unsigned slot=0;slot<2;++slot){exact=exact&&total.Plus(FixedTwoTitleCosts::CleanCopy(),total);
        for(unsigned delivery=0;delivery<4;++delivery)exact=exact&&total.Plus(FixedTwoTitleCosts::Delivery(),total);
        for(unsigned poll=0;poll<trusted_read::kTwoTitlePollsPerJob;++poll)exact=exact&&total.Plus(FixedTwoTitleCosts::Poll(),total);
        exact=exact&&total.Plus(FixedTwoTitleCosts::Terminal(),total)&&total.Plus(FixedTwoTitleCosts::Media(),total);}
    exact=exact&&total.Plus(FixedTwoTitleCosts::Teardown(),total);
    Check(exact&&total.Same(FixedTwoTitleCosts::Full()),"frozen two-title full vector is 86/192/224/32/4/16");
    const ExecutionCost zero{};Check(zero.Empty(),"encoded HQ does not allocate Settings operations");
    for(unsigned field=0;field<6;++field){ExecutionCost excessive=FixedTwoTitleCosts::Full();
        switch(field){case 0:excessive.calls=87;break;case 1:excessive.external=193;break;case 2:excessive.store=257;break;
            case 3:excessive.service=33;break;case 4:excessive.terminalMedia=17;break;default:excessive.teardown=17;break;}
        ExecutionCost unchanged{1,1,1,1,1,1};Check(!zero.Plus(excessive,unchanged)&&unchanged.Same({1,1,1,1,1,1}),"each excess refuses without publishing a partial sum");}
    ExecutionCost unchanged{1,1,1,1,1,1};const ExecutionCost overflow{65535,65535,65535,65535,65535,65535};
    Check(!overflow.Plus({1,1,1,1,1,1},unchanged)&&unchanged.Same({1,1,1,1,1,1}),"cost addition cannot wrap or mutate its output on refusal");
}
void SyntheticPhaseProof::PeSpanCases(){
    using trusted_read::pe::SectionSpan;using trusted_read::pe::SectionMappedSpan;using trusted_read::pe::ExpectedSection;using trusted_read::pe::NormalizeDir64;
    SectionSpan span{};const auto valid=[&](std::uint32_t virtualBytes,std::uint32_t next=12288,std::uint32_t image=16384){return SectionMappedSpan(4096,virtualBytes,512,512,next,image,1024,512,4096,512,span);};
    Check(valid(6000)&&span.mappedBytes==8192,"executable VirtualSize tail and alignment padding are inside measured mapped span");
    std::vector<unsigned char> file(1024,0),expected;file[512]=0x48;file[513]=0x90;
    Check(ExpectedSection(file,span,expected)&&expected.size()==8192&&expected[0]==0x48&&expected[511]==0&&expected[512]==0&&expected.back()==0,
        "full expected image copies raw bytes then zero fills virtual and alignment tails");
    auto changed=expected;changed[6000]=0x90;Check(changed!=expected,"mutated executable zero-filled VirtualSize tail is detected");
    changed=expected;changed.back()=0x90;Check(changed!=expected,"mutated executable aligned page tail is detected");
    const auto originalSpan=span;Check(!valid(0xffffffff)&&span.rva==originalSpan.rva&&span.mappedBytes==originalSpan.mappedBytes,"overflowing VirtualSize closes without publishing partial span");
    Check(!valid(6000,8192),"mapped span cannot cross next section RVA");Check(!valid(6000,8192,8192),"mapped span cannot cross SizeOfImage");
    Check(!SectionMappedSpan(4096,6000,512,1024,12288,16384,1024,512,4096,512,span),"raw span cannot exceed held source bytes");
    Check(!SectionMappedSpan(4096,6000,512,512,12288,16384,1024,512,6144,512,span),"unsupported section alignment is closed");
    Check(!SectionMappedSpan(4096,6000,0,512,12288,16384,1024,512,4096,512,span),"raw image cannot alias PE headers");
    Check(!SectionMappedSpan(4096,6000,512,512,12288,16384,1024,8192,4096,512,span),"mapped image cannot overlap declared headers");
    changed=expected;const std::uint64_t delta=0x140000000ULL;std::memcpy(changed.data()+1024,&delta,sizeof(delta));
    Check(NormalizeDir64(changed,1024,delta)&&changed==expected,"DIR64 relocation in zero-filled executable tail is normalized");
    const auto unchanged=changed;Check(!NormalizeDir64(changed,changed.size()-7,delta)&&changed==unchanged,"truncated DIR64 cannot cross mapped span or mutate bytes");
    const std::vector<SectionSpan> measured{{4096,8192,512,512}};
    Check(trusted_read::pe::ExecutableRegionMeasured(4096,8192,16384,measured),"approved measured RX region is wholly inside full code span");
    Check(!trusted_read::pe::ExecutableRegionMeasured(0,4096,16384,measured),"executable PE headers are not an approved measured code span");
    Check(!trusted_read::pe::ExecutableRegionMeasured(12288,4096,16384,measured),"non-executable PE data cannot acquire RX permission");
    Check(!trusted_read::pe::ExecutableRegionMeasured(4096,12288,16384,measured),"RX region crossing approved text into data is refused");
    const std::vector<SectionSpan> gap{{4096,4096,512,512},{12288,4096,512,512}};
    Check(!trusted_read::pe::ExecutableRegionMeasured(8192,4096,16384,gap),"RX image gap outside approved sections is refused");
    Check(!trusted_read::pe::ExecutableRegionMeasured(4096,12288,16384,gap),"one RX region cannot bridge an unmeasured image gap");
    Check(!trusted_read::pe::ExecutableRegionMeasured(4096,16384,16384,measured),"RX allocation cannot extend beyond held SizeOfImage");
    Check(trusted_read::pe::ApprovedExecutableProtection(0x10)&&trusted_read::pe::ApprovedExecutableProtection(0x20)&&
        !trusted_read::pe::ApprovedExecutableProtection(0x40)&&!trusted_read::pe::ApprovedExecutableProtection(0x80)&&!trusted_read::pe::ApprovedExecutableProtection(0x120),
        "writable-exec, copy-on-write-exec and guarded executable pages are refused");
}
void SyntheticPhaseProof::PngCases(){
    using namespace trusted_read::media_pixels;
    const std::vector<unsigned char> rgba{255,0,0,0,0,255,0,64,0,0,255,128,255,255,255,255};std::vector<unsigned char> png;AlphaFacts facts;
    Check(EncodeRgba(rgba,2,2,png,facts)&&png.size()==86,"pure retained RGBA encoder produces finite 2x2 RGBA PNG");
    Check(facts.pixels==4&&facts.transparent==1&&facts.opaque==1&&facts.partial==2&&facts.foreground==3&&facts.alphaSum==447&&facts.minimum==0&&facts.maximum==255,
        "actual retained alpha bytes determine exact transparent/foreground facts");
    const unsigned char known[]{'1','2','3','4','5','6','7','8','9'};
    Check(Crc32(known,sizeof(known))==0xcbf43926,"CRC32 matches fixed independent standard check vector");
    const std::vector<unsigned char> wikipedia{'W','i','k','i','p','e','d','i','a'};Check(Adler32(wikipedia)==0x11e60398,"zlib Adler32 matches fixed standard check vector");
    const auto before=png;const auto beforeFacts=facts;auto truncated=rgba;truncated.pop_back();Check(!EncodeRgba(truncated,2,2,png,facts)&&png==before&&facts.alphaSum==beforeFacts.alphaSum,
        "truncated decoder stdout cannot publish PNG or partial alpha facts");
    Check(!EncodeRgba(rgba,0,2,png,facts)&&png==before,"zero dimension is refused before publication");
    Check(!EncodeRgba(rgba,8193,1,png,facts)&&png==before,"dimension beyond frozen encoder bound is refused");
    Check(!EncodeRgba(rgba,8192,8192,png,facts)&&png==before,"RGBA allocation beyond fixed byte bound is refused");
}
int SyntheticPhaseProof::Run() {
    std::cout<<"SYNTHETIC LCP2 codec/volatile SERVER_ONLY ledger proof ONLY; "
        "productionAuthority=false; OS/held-peer authority=NOT_TESTED; AE effects=0\n";
    CodecCases();CorrelationCases();LedgerCases();BudgetCases();PeSpanCases();PngCases();
    std::cout<<"synthetic_checks="<<checks_<<" failed="<<failed_<<" productionRuntimeEntry=CLOSED\n";
    return failed_==0 ? 0 : 1;
}
} // namespace local_session::phase
int main(int count,char** arguments) {
    if(count==2&&std::string_view(arguments[1])=="--png-fixture"){
        const std::vector<unsigned char> rgba{255,0,0,0,0,255,0,64,0,0,255,128,255,255,255,255};std::vector<unsigned char> png;local_session::trusted_read::media_pixels::AlphaFacts facts;
        if(!local_session::trusted_read::media_pixels::EncodeRgba(rgba,2,2,png,facts))return 1;
        constexpr char hex[]="0123456789abcdef";std::cout<<"{\"authority\":false,\"nativeEffects\":0,\"width\":2,\"height\":2,\"pngHex\":\"";
        for(const auto byte:png)std::cout<<hex[byte>>4]<<hex[byte&15];std::cout<<"\"}\n";return 0;
    }
    if(count!=1)return 2;return local_session::phase::SyntheticPhaseProof::Run();
}
