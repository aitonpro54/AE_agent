#include "local_session_win32.h"
#include "original_daemon_win32.h"
#ifndef AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS
#error Private installed fence/store seams must be reviewed before this target builds.
#endif
#include "../owned-runtime-initial-fence/fence_win32.h"
#include "../owned-runtime-initial-durability/store_win32.h"
#include <windows.h>
#include <sddl.h>
#include <algorithm>
#include <cstring>
#include <iomanip>
#include <limits>
#include <sstream>
#include <utility>

namespace local_session {
namespace {
using detail::Held;using detail::Refuse;using Bytes=std::vector<unsigned char>;
template<class A> void Put(Bytes& b,const A& a){b.insert(b.end(),a.begin(),a.end());}
void U32(Bytes& b,std::uint32_t n){for(unsigned i=0;i<4;++i)b.push_back(static_cast<unsigned char>(n>>(8*i)));}
struct Reader {
    const Bytes& bytes;std::size_t offset=0;
    std::uint64_t Number(std::size_t n){if(offset>bytes.size()||n>bytes.size()-offset||n>8)Refuse("wire_truncated");std::uint64_t value=0;for(std::size_t i=0;i<n;++i)value|=static_cast<std::uint64_t>(bytes[offset++])<<(i*8);return value;}
    template<std::size_t N> std::array<unsigned char,N> Fixed(){if(offset>bytes.size()||N>bytes.size()-offset)Refuse("wire_truncated");std::array<unsigned char,N> value{};std::copy_n(bytes.begin()+static_cast<std::ptrdiff_t>(offset),N,value.begin());offset+=N;return value;}
    void End(){if(offset!=bytes.size())Refuse("wire_extra_fields");}
};
struct SlotObservation {std::uint16_t type=0;std::uint64_t sequence=0,epoch=0;Id lineage{},owner{},fileId{};Digest scope{},genesis{},previous{},key{},hash{};};
std::wstring SlotName(std::uint64_t n){if(!n||n>256)Refuse("floor_slot_limit");std::wostringstream name;name<<std::setfill(L'0')<<std::setw(20)<<n<<L".rec";return name.str();}
SlotObservation IndependentlyRead(void* journal,std::uint64_t n){
    Held witness=detail::Relative(journal,SlotName(n),false);SlotObservation slot;slot.fileId=detail::ReadPin(witness.Get(),false).fileId;const Bytes bytes=detail::ReadExact(witness.Get(),16384);if(bytes.size()<228)Refuse("floor_partial_slot",0,true);Reader read{bytes};if(read.Fixed<8>()!=std::array<unsigned char,8>{'O','W','N','J','R','N','0','1'}||read.Number(2)!=1)Refuse("floor_frame_version",0,true);slot.type=static_cast<std::uint16_t>(read.Number(2));if(slot.type<1||slot.type>5||read.Number(4)!=bytes.size())Refuse("floor_frame_type_length",0,true);slot.scope=read.Fixed<32>();slot.lineage=read.Fixed<16>();slot.genesis=read.Fixed<32>();slot.sequence=read.Number(8);slot.epoch=read.Number(8);slot.owner=read.Fixed<16>();slot.previous=read.Fixed<32>();slot.key=read.Fixed<32>();const auto payload=read.Number(4);if(payload>4096||read.offset+payload+32!=bytes.size())Refuse("floor_frame_payload",0,true);read.offset+=static_cast<std::size_t>(payload);slot.hash=read.Fixed<32>();read.End();if(slot.sequence!=n||detail::Hash(Bytes(bytes.begin(),bytes.end()-32))!=slot.hash)Refuse("floor_frame_hash_or_slot",0,true);return slot;
}
constexpr std::size_t kWireSize=128;
Bytes Encode(const Message& m){Bytes b={'L','C','S','B'};detail::PutU16(b,2);detail::PutU16(b,m.verb);detail::PutU64(b,m.ordinal);Put(b,m.channelNonce);Put(b,m.generation);Put(b,m.bootNonce);Put(b,m.reference);Put(b,m.digest);detail::PutU64(b,m.readinessEpoch);U32(b,m.readinessMask);U32(b,0);if(b.size()!=kWireSize)Refuse("internal_wire_size");return b;}
Message Decode(const Bytes& b){if(b.size()!=kWireSize)Refuse("wire_size_refused");Reader r{b};if(r.Fixed<4>()!=std::array<unsigned char,4>{'L','C','S','B'}||r.Number(2)!=2)Refuse("wire_version_refused");Message m;m.verb=static_cast<std::uint16_t>(r.Number(2));m.ordinal=r.Number(8);m.channelNonce=r.Fixed<16>();m.generation=r.Fixed<16>();m.bootNonce=r.Fixed<16>();m.reference=r.Fixed<16>();m.digest=r.Fixed<32>();m.readinessEpoch=r.Number(8);m.readinessMask=static_cast<std::uint32_t>(r.Number(4));if(r.Number(4)!=0)Refuse("wire_reserved_fields");r.End();return m;}
std::wstring PipeName(const Digest& launchKey,const Id& nonce,const wchar_t* role){const std::string key=detail::Hex(launchKey),random=detail::Hex(nonce);return L"\\\\.\\pipe\\AEAgent.LocalSession."+std::wstring(key.begin(),key.end())+L"."+std::wstring(role)+L"."+std::wstring(random.begin(),random.end());}
class PrivatePipe final {
public:
    PrivatePipe(const std::wstring& name,const std::wstring& sid):name_(name){
        const std::wstring sddl=L"D:P(A;;GA;;;"+sid+L")";PSECURITY_DESCRIPTOR descriptor=nullptr;if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(),SDDL_REVISION_1,&descriptor,nullptr))Refuse("pipe_acl_failed",GetLastError());SECURITY_ATTRIBUTES security{sizeof(security),descriptor,FALSE};
        pipe_=Held(CreateNamedPipeW(name.c_str(),PIPE_ACCESS_DUPLEX|FILE_FLAG_FIRST_PIPE_INSTANCE|FILE_FLAG_OVERLAPPED,PIPE_TYPE_MESSAGE|PIPE_READMODE_MESSAGE|PIPE_WAIT|PIPE_REJECT_REMOTE_CLIENTS,1,4096,4096,0,&security));const DWORD error=pipe_.Valid()?0:GetLastError();LocalFree(descriptor);if(!pipe_.Valid())Refuse("pipe_first_instance_refused",error);event_=Held(CreateEventW(nullptr,TRUE,FALSE,nullptr));if(!event_.Valid())Refuse("pipe_event_failed",GetLastError());connect_.hEvent=event_.Get();BOOL connected=ConnectNamedPipe(pipe_.Get(),&connect_);if(connected)connected_=true;else{const DWORD e=GetLastError();if(e==ERROR_PIPE_CONNECTED)connected_=true;else if(e!=ERROR_IO_PENDING)Refuse("pipe_connect_failed",e);else connecting_=true;}
    }
    ~PrivatePipe(){DWORD ignored=0;if(connecting_){CancelIoEx(pipe_.Get(),&connect_);GetOverlappedResult(pipe_.Get(),&connect_,&ignored,TRUE);}if(readPending_){CancelIoEx(pipe_.Get(),&read_);GetOverlappedResult(pipe_.Get(),&read_,&ignored,TRUE);}if(pipe_.Valid())DisconnectNamedPipe(pipe_.Get());}
    bool PollConnect(){if(closed_)return false;if(connected_)return true;if(!connecting_)return false;DWORD n=0;if(GetOverlappedResult(pipe_.Get(),&connect_,&n,FALSE)){connecting_=false;connected_=true;return true;}const DWORD e=GetLastError();if(e==ERROR_IO_INCOMPLETE)return false;Close();return false;}
    bool Poll(Message& message){if(!connected_||closed_)return false;if(!readPending_){read_=OVERLAPPED{};read_.hEvent=event_.Get();ResetEvent(event_.Get());DWORD n=0;BOOL success=ReadFile(pipe_.Get(),buffer_.data(),static_cast<DWORD>(buffer_.size()),&n,&read_);if(success){message=Decode(Bytes(buffer_.begin(),buffer_.begin()+n));return true;}if(GetLastError()!=ERROR_IO_PENDING){Close();return false;}readPending_=true;}
        DWORD n=0;if(!GetOverlappedResult(pipe_.Get(),&read_,&n,FALSE)){if(GetLastError()==ERROR_IO_INCOMPLETE)return false;Close();return false;}readPending_=false;message=Decode(Bytes(buffer_.begin(),buffer_.begin()+n));return true;
    }
    bool Send(const Message& message){if(!connected_||closed_)return false;const Bytes bytes=Encode(message);Held done(CreateEventW(nullptr,TRUE,FALSE,nullptr));if(!done.Valid()){Close();return false;}OVERLAPPED io{};io.hEvent=done.Get();DWORD n=0;const BOOL sent=WriteFile(pipe_.Get(),bytes.data(),static_cast<DWORD>(bytes.size()),&n,&io);if(!sent){if(GetLastError()!=ERROR_IO_PENDING){Close();return false;}const DWORD wait=WaitForSingleObject(done.Get(),1000);if(wait!=WAIT_OBJECT_0){CancelIoEx(pipe_.Get(),&io);GetOverlappedResult(pipe_.Get(),&io,&n,TRUE);Close();return false;}if(!GetOverlappedResult(pipe_.Get(),&io,&n,FALSE)){Close();return false;}}if(n!=bytes.size()){Close();return false;}return true;}
    void Close(){closed_=true;}
    bool Closed()const{return closed_;}bool Connected()const{return connected_;}
    void* Handle()const{return pipe_.Get();}const std::wstring& Name()const{return name_;}
private:
    std::wstring name_;Held pipe_,event_;OVERLAPPED connect_{},read_{};std::array<unsigned char,4096> buffer_{};
    bool connecting_=false,connected_=false,readPending_=false,closed_=false;
};
class OriginalController final {
public:
    OriginalController(void* pipe,const reviewed::Profile& p){ULONG pid=0;if(!GetNamedPipeClientProcessId(pipe,&pid)||!pid)Refuse("controller_peer_query_failed",GetLastError());original_=Held(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,pid));if(!original_.Valid())Refuse("original_controller_open_failed",GetLastError());pid_=pid;birth_=detail::ProcessBirth(original_.Get());sid_=detail::ProcessSid(original_.Get());image_=detail::ProcessImage(original_.Get());if(sid_!=p.userSid||image_!=p.controllerImage.pin.canonicalPath||!detail::ProcessLive(original_.Get()))Refuse("controller_peer_binding_refused");ULONG still=0;if(!GetNamedPipeClientProcessId(pipe,&still)||still!=pid_||detail::ProcessBirth(original_.Get())!=birth_)Refuse("controller_peer_race");}
    bool Live(void* pipe)const{ULONG peer=0;return GetNamedPipeClientProcessId(pipe,&peer)&&peer==pid_&&detail::ProcessLive(original_.Get())&&detail::ProcessBirth(original_.Get())==birth_&&detail::ProcessSid(original_.Get())==sid_&&detail::ProcessImage(original_.Get())==image_;}
private:Held original_;ULONG pid_=0;std::uint64_t birth_=0;std::wstring sid_,image_;
};
} // namespace

struct ContinuityPort::Data {
    InstalledEnrollment& enrollment;initial_fence::Factory& factory;initial_fence::RootLease& root;initial_fence::FenceLease& fence;
    FloorSnapshot floor;std::vector<Digest> spent;Id acquisitionOwner=detail::RandomId();std::string originalFenceRef;
    bool closed=false,entered=false;DWORD thread=GetCurrentThreadId();
    Data(InstalledEnrollment& e,initial_fence::Factory& f,initial_fence::RootLease& r,initial_fence::FenceLease& l):enrollment(e),factory(f),root(r),fence(l){floor.scope=e.Scope();const auto observed=f.Observe(r,l);if(!observed.ok||observed.sessionRef.empty())Refuse("continuity_original_fence_required");originalFenceRef=observed.sessionRef;}
};
ContinuityPort::ContinuityPort(InstalledEnrollment& e,initial_fence::Factory& f,initial_fence::RootLease& r,initial_fence::FenceLease& l):data_(std::make_unique<Data>(e,f,r,l)){}
ContinuityPort::~ContinuityPort()=default;
bool ContinuityPort::Guard(initial_fence::InternalFencedIo& io){auto& d=*data_;if(d.closed||d.entered||d.thread!=GetCurrentThreadId()){d.closed=true;return false;}d.entered=true;try{const auto guarded=io.StageGuard();void* borrowed=io.BorrowedRoot();const auto original=d.factory.Observe(d.root,d.fence);if(!guarded.ok||!borrowed||!io.MatchesBinding(d.factory,d.root,d.fence)||!original.ok||original.sessionRef!=d.originalFenceRef||!d.enrollment.Fresh(true).ok||!detail::SamePin(detail::ReadPin(borrowed,true),d.enrollment.Profile().runtime))Refuse("production_continuity_fence_changed");Held journal=detail::Relative(borrowed,L"journal",true);if(!detail::SamePin(detail::ReadPin(journal.Get(),true),d.enrollment.Profile().journal)||d.floor.originalSlotIds.size()!=d.floor.sequence||d.floor.sequence>256)Refuse("production_floor_changed");Digest previous{};for(std::uint64_t n=1;n<=d.floor.sequence;++n){const auto slot=IndependentlyRead(journal.Get(),n);if(slot.fileId!=d.floor.originalSlotIds[static_cast<std::size_t>(n-1)]||slot.scope!=d.floor.scope||slot.lineage!=d.enrollment.Profile().lineage||slot.previous!=previous||(n==1?slot.type!=1:slot.genesis!=d.floor.genesis))Refuse("production_floor_prefix_changed");previous=slot.hash;if(n==d.floor.sequence&&(slot.hash!=d.floor.head||slot.epoch!=d.floor.epoch||slot.owner!=d.floor.owner))Refuse("production_floor_head_changed");}d.entered=false;return true;}catch(const detail::Failure&){d.entered=false;d.closed=true;return false;}}
const FloorSnapshot& ContinuityPort::Floor()const{return data_->floor;}
const Id& ContinuityPort::AcquisitionOwner()const{return data_->acquisitionOwner;}
bool ContinuityPort::RegisterPending(initial_fence::InternalFencedIo& io,const FloorSnapshot::Pending& pending){auto& d=*data_;if(!Guard(io)||d.floor.pending.exists||d.floor.sequence==256||pending.sequence!=d.floor.sequence||pending.epoch!=d.floor.epoch||pending.head!=d.floor.head||pending.slot!=d.floor.sequence+1||pending.type<1||pending.type>5||!detail::Zero(pending.createdFileId)||detail::Zero(pending.frameHash)||detail::Zero(pending.semanticKey)||IsSpent(pending.semanticKey)||(pending.type==1?!detail::Zero(pending.owner):pending.owner!=d.acquisitionOwner))return false;d.floor.pending=pending;if(pending.type==3)d.spent.push_back(pending.semanticKey);return true;}
bool ContinuityPort::BindCreatedSlot(initial_fence::InternalFencedIo& io,void* originalFile){auto& d=*data_;if(!Guard(io)||!d.floor.pending.exists||!detail::Zero(d.floor.pending.createdFileId))return false;try{std::uint64_t length=0;const auto pin=detail::ReadPin(originalFile,false,&length);const auto& journal=d.enrollment.Profile().journal;if(length||pin.volumeGuid!=journal.volumeGuid||pin.serial!=journal.serial||pin.canonicalPath!=journal.canonicalPath+L"\\"+SlotName(d.floor.pending.slot))return false;Held independent=detail::Relative(d.enrollment.BorrowedJournal(),SlotName(d.floor.pending.slot),false);if(!detail::SamePin(detail::ReadPin(independent.Get(),false),pin)||!io.StageGuard().ok)return false;d.floor.pending.createdFileId=pin.fileId;return true;}catch(const detail::Failure&){return false;}}
bool ContinuityPort::ObserveAndAdvance(initial_fence::InternalFencedIo& io,bool originalFlushObserved){auto& d=*data_;if(!Guard(io)||!d.floor.pending.exists||detail::Zero(d.floor.pending.createdFileId))return false;const auto pending=d.floor.pending;try{Held journal=detail::Relative(io.BorrowedRoot(),L"journal",true);const auto slot=IndependentlyRead(journal.Get(),pending.slot);if(slot.fileId!=pending.createdFileId||slot.scope!=d.floor.scope||slot.lineage!=d.enrollment.Profile().lineage||slot.hash!=pending.frameHash||slot.key!=pending.semanticKey||slot.type!=pending.type||slot.previous!=d.floor.head||slot.owner!=pending.owner)Refuse("production_pending_conflict");if(pending.type==1){if(d.floor.sequence||slot.epoch||!detail::Zero(slot.genesis)||!detail::Zero(slot.owner))Refuse("production_genesis_conflict");}else if(pending.type==2){if(!d.floor.sequence||d.floor.epoch==std::numeric_limits<std::uint64_t>::max()||slot.epoch!=d.floor.epoch+1||detail::Zero(slot.owner))Refuse("production_owner_conflict");}else if(!d.floor.epoch||slot.epoch!=d.floor.epoch||slot.owner!=d.floor.owner)Refuse("production_epoch_conflict");if(!io.StageGuard().ok||!d.enrollment.Fresh(true).ok)Refuse("production_readback_guard_lost");
        // Independent native observation, then floor advancement+pending clear in
        // one same-thread critical section. No client ACK, wait, callback or IO here.
        d.floor.originalSlotIds.push_back(slot.fileId);d.floor.sequence=slot.sequence;d.floor.epoch=slot.epoch;d.floor.head=slot.hash;d.floor.owner=slot.owner;if(slot.type==1)d.floor.genesis=slot.hash;d.floor.pending=FloorSnapshot::Pending{};
        (void)originalFlushObserved;return true;
    }catch(const detail::Failure&){return false;} // pending/spent remain intact
}
bool ContinuityPort::Reconcile(initial_fence::InternalFencedIo& io){return ObserveAndAdvance(io,false);}
bool ContinuityPort::IsSpent(const Digest& key)const{return std::find(data_->spent.begin(),data_->spent.end(),key)!=data_->spent.end();}
void ContinuityPort::Close()noexcept{data_->closed=true;}

struct Broker::Data {
    std::unique_ptr<InstalledEnrollment> enrollment;std::unique_ptr<initial_fence::Factory> factory;
    initial_fence::RootLease root;initial_fence::FenceLease fence;
    std::unique_ptr<ContinuityPort> continuity;std::unique_ptr<initial_durability::Store> store;
    std::unique_ptr<PrivatePipe> controllerPipe,daemonPipe;std::unique_ptr<OriginalController> controller;
    std::unique_ptr<OriginalDaemon> daemon;
    Id controllerNonce=detail::RandomId(),daemonNonce=detail::RandomId(),generation=detail::RandomId(),bootNonce=detail::RandomId(),actor{},stopRef{};
    State state=State::Closed;bool controllerRevoked=false,everActor=false,stopConsumed=false,drainSent=false,drainAcknowledged=false;
    // Filled only by the future private L4 panel phase port. Daemon registration
    // and ensure-daemon never mint this separate grant; no caller bool can set it.
    bool panelGrantIssued=false;std::uint64_t panelGrantDeadline=0;
    std::uint64_t controllerOrdinal=0,daemonOrdinal=0,openedAt=0,sessionDeadline=0,readinessEpoch=0;
    std::uint32_t readinessMask=0;Digest launchRecord{},stopRecord{};initial_durability::Cas cas;
    void Initialize(){Result result;enrollment=InstalledEnrollment::OpenFixed(result);if(!enrollment)Refuse(result.code.c_str(),result.win32Error,result.unknown,result.unavailable);
        initial_fence::Result fenced;factory=initial_fence::Factory::CreateInstalledFactory(*enrollment,fenced);if(!factory)Refuse(fenced.code.c_str(),fenced.win32Error);if(!factory->OpenRoot(root,fence).ok||!factory->TryAcquire(root,fence).ok)Refuse("installed_fence_closed");continuity=std::unique_ptr<ContinuityPort>(new ContinuityPort(*enrollment,*factory,root,fence));initial_durability::Result stored;store=initial_durability::Store::CreateInstalledStore(*enrollment,*continuity,*factory,root,fence,stored);if(!store)Refuse(stored.code.c_str(),stored.win32Error);stored=store->Inspect();if(!stored.ok)Refuse("installed_store_closed",stored.win32Error,stored.unknown);if(stored.current.sequence)Refuse("broker_continuity_not_recoverable",0,false,true);
        stored=store->InitializeGenesis({});if(!stored.ok)Refuse("installed_genesis_closed",stored.win32Error,true);cas=stored.current;stored=store->AcquireOwnerEpoch(cas);if(!stored.ok)Refuse("installed_owner_closed",stored.win32Error,true);cas=stored.current;
        controllerPipe=std::make_unique<PrivatePipe>(PipeName(enrollment->LaunchKey(),controllerNonce,L"controller"),enrollment->Profile().userSid);daemonPipe=std::make_unique<PrivatePipe>(PipeName(enrollment->LaunchKey(),daemonNonce,L"daemon"),enrollment->Profile().userSid);
    }
    bool Guard(){const auto observed=factory->Observe(root,fence);if(!observed.ok||!factory->LiveCheck(root,fence,observed.sessionRef).ok||!enrollment->Fresh(true).ok)return false;const auto checked=store->Inspect();return checked.ok&&!checked.unknown&&!checked.unavailable&&checked.current.sequence==cas.sequence&&checked.current.epoch==cas.epoch&&checked.current.head==cas.head;}
    void Revoke(){controllerRevoked=true;if(state!=State::Unknown&&state!=State::ExactExited)state=State::Revoked;}
    bool ControllerLive(){if(controllerRevoked||!controller||controllerPipe->Closed()||!controller->Live(controllerPipe->Handle())){Revoke();return false;}if(openedAt&&GetTickCount64()>=sessionDeadline){Revoke();return false;}return true;}
    Message Reply(std::uint16_t verb,std::uint64_t ordinal){Message message;message.verb=verb;message.ordinal=ordinal;message.channelNonce=controllerNonce;message.generation=generation;message.bootNonce=bootNonce;message.readinessEpoch=static_cast<std::uint64_t>(state);return message;}
    void ControllerMessage(const Message& m){if(m.channelNonce!=controllerNonce||m.ordinal==0||controllerOrdinal==std::numeric_limits<std::uint64_t>::max()||m.ordinal!=controllerOrdinal+1||!detail::Zero(m.generation)||!detail::Zero(m.bootNonce)||!detail::Zero(m.reference)||!detail::Zero(m.digest)||m.readinessEpoch||m.readinessMask)Refuse("controller_closed_message_refused");controllerOrdinal=m.ordinal;
        if(m.verb==static_cast<std::uint16_t>(ControllerVerb::Revoke)){Revoke();controllerPipe->Send(Reply(m.verb,m.ordinal));return;}
        if(m.verb==static_cast<std::uint16_t>(ControllerVerb::Status)){controllerPipe->Send(Reply(m.verb,m.ordinal));return;}
        if(!ControllerLive()||!Guard())Refuse("controller_guard_closed");
        if(m.verb==static_cast<std::uint16_t>(ControllerVerb::Open)){if(state!=State::Closed||openedAt)Refuse("controller_open_already_consumed");openedAt=GetTickCount64();const auto limit=enrollment->Profile().maximumSessionMs;if(openedAt>std::numeric_limits<std::uint64_t>::max()-limit)Refuse("session_deadline_overflow");sessionDeadline=openedAt+limit;state=State::SessionOpen;}
        else if(m.verb==static_cast<std::uint16_t>(ControllerVerb::ReserveInitialLaunch)){
            if(state!=State::SessionOpen||daemon)Refuse("initial_launch_not_available");initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;record.effect=initial_durability::EffectClass::Launch;record.target=enrollment->Profile().launchTarget;const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;if(!consumed.ok||!consumed.consumptionRecorded||consumed.unknown){state=State::Unknown;Refuse("initial_launch_consumption_unknown",consumed.win32Error,true);}launchRecord=consumed.recordHash;state=State::LaunchReserved;
            // Durable consumption precedes this one prepared original grant.
            // Its fixed 10-minute disposition grace survives READ/session expiry
            // and EOF. No renew/token/activity or replacement controller changes it.
            auto lifecycle=PreparedLifecycleGrant::Prepare(generation,bootNonce,launchRecord,sessionDeadline);
            if(!ControllerLive()||!Guard()){state=State::Unknown;Refuse("consumed_launch_late_guard_closed",0,true);}Result launched;daemon=OriginalDaemon::Launch(*enrollment,generation,bootNonce,daemonNonce,daemonPipe->Name(),std::move(lifecycle),launched);if(!daemon||!launched.ok){state=State::Unknown;Refuse("original_launch_unknown",launched.win32Error,true);}state=State::TargetHeld;
        }else Refuse("controller_verb_refused");controllerPipe->Send(Reply(m.verb,m.ordinal));
    }
    void DaemonMessage(const Message& m){if(!daemon||!daemon->MatchesPeer(daemonPipe->Handle())||m.channelNonce!=daemonNonce||m.generation!=generation||m.bootNonce!=bootNonce||!m.ordinal||daemonOrdinal==std::numeric_limits<std::uint64_t>::max()||m.ordinal!=daemonOrdinal+1||!Guard())Refuse("original_daemon_message_refused");daemonOrdinal=m.ordinal;
        if(m.verb==static_cast<std::uint16_t>(DaemonVerb::BootHello)){if(state!=State::TargetHeld||!detail::Zero(m.reference)||!detail::Zero(m.digest)||m.readinessEpoch||m.readinessMask)Refuse("daemon_boot_refused");state=State::RegisteredReadClosed;}
        else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::ReadySnapshot)){if(state==State::TargetHeld||m.readinessEpoch<=readinessEpoch||m.readinessMask&~kAllQuiescent||!detail::Zero(m.reference)||!detail::Zero(m.digest))Refuse("daemon_readiness_refused");readinessEpoch=m.readinessEpoch;readinessMask=m.readinessMask;}
        else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::FirstActorObserved)){if(controllerRevoked||state!=State::RegisteredReadClosed||!panelGrantIssued||GetTickCount64()>=panelGrantDeadline||everActor||detail::Zero(m.reference)||detail::Zero(m.digest)||m.readinessEpoch||m.readinessMask)Refuse("first_actor_refused");everActor=true;initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;record.effect=initial_durability::EffectClass::Dispatch;record.target=enrollment->Profile().actorTarget;const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;if(!consumed.ok||consumed.unknown){state=State::Unknown;Refuse("first_actor_consumption_unknown",consumed.win32Error,true);}record={};record.type=initial_durability::RecordType::Note;record.sourceDigest=m.digest;Bytes binding;Put(binding,generation);Put(binding,bootNonce);Put(binding,m.reference);record.configDigest=detail::Hash(binding);const auto observed=store->AppendOnce(cas,record);cas=observed.current;if(!observed.ok||observed.unknown){state=State::Unknown;Refuse("first_actor_observation_unknown",observed.win32Error,true);}actor=m.reference;state=State::ActorBound;
            // No READ/execution grant is minted here. L4 requires a fresh bracket.
        }else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::Complete)){Refuse("completion_port_unavailable_before_l4");}
        else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::DrainAck)){if(!drainSent||drainAcknowledged||m.reference!=stopRef||m.readinessEpoch<=readinessEpoch||m.readinessMask!=kAllQuiescent||!detail::Zero(m.digest))Refuse("drain_ack_refused");readinessEpoch=m.readinessEpoch;readinessMask=m.readinessMask;drainAcknowledged=true;}
        else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::ShutdownAck)){if(!stopConsumed||m.reference!=stopRef||m.readinessEpoch||m.readinessMask||!detail::Zero(m.digest))Refuse("shutdown_ack_refused"); /* ACK is not exit. */}
        else Refuse("daemon_verb_refused");
    }
    bool Teardown(){if(!daemon)return controllerRevoked;std::uint32_t exit=0;if(daemon->ExactExit(exit)){state=State::ExactExited;return true;}if(!controllerRevoked)return false;
        // L3 never admits AE work. Abort only the original unadmitted daemon;
        // future L4 admission uses independent drain/readiness/consumed shutdown.
        Result aborted;if(Guard()&&daemon->AbortUnadmitted(aborted))return false;
        if(!aborted.unavailable){state=State::Unknown;return false;}
        if(!daemon->LifecycleEffectAllowed()||daemonPipe->Closed()||!daemon->MatchesPeer(daemonPipe->Handle())||!Guard()){state=State::Unknown;return false;}
        if(!drainSent){stopRef=detail::RandomId();drainSent=true;readinessMask=0;Message drain;drain.verb=33;drain.ordinal=1;drain.channelNonce=daemonNonce;drain.generation=generation;drain.bootNonce=bootNonce;drain.reference=stopRef;if(!daemon->LifecycleEffectAllowed()||!daemonPipe->Send(drain)){state=State::Unknown;return false;}return false;}
        if(!drainAcknowledged||readinessMask!=kAllQuiescent||stopConsumed)return false;initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;record.effect=initial_durability::EffectClass::Stop;record.target=enrollment->Profile().stopTarget;const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;stopConsumed=true;stopRecord=consumed.recordHash;if(!consumed.ok||consumed.unknown||!Guard()||!daemon->LifecycleEffectAllowed()){state=State::Unknown;return false;}Message stop;stop.verb=34;stop.ordinal=2;stop.channelNonce=daemonNonce;stop.generation=generation;stop.bootNonce=bootNonce;stop.reference=stopRef;stop.digest=stopRecord;if(!daemon->LifecycleEffectAllowed()||!daemonPipe->Send(stop))state=State::Unknown;return false;
    }
};
Broker::Broker(std::unique_ptr<Data> d):data_(std::move(d)){}Broker::~Broker()=default;
int Broker::RunFixed(){try{auto data=std::make_unique<Data>();data->Initialize();Broker broker(std::move(data));auto& d=*broker.data_;const std::wstring name=d.controllerPipe->Name();const std::string locator(name.begin(),name.end());const std::string nonce=detail::Hex(d.controllerNonce);std::string hello="{\"schema\":\"ae-agent.local-broker.locator.v2\",\"pipe\":\"";for(char c:locator){if(c=='\\')hello+='\\';hello+=c;}hello+="\",\"nonce\":\""+nonce+"\",\"authorityMode\":\"local_controller_session\",\"genuineChatIdentity\":false,\"executionAdmission\":false}\n";DWORD n=0;if(!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),hello.data(),static_cast<DWORD>(hello.size()),&n,nullptr)||n!=hello.size())Refuse("broker_locator_send_unknown",GetLastError(),true);
        const auto waitingAt=GetTickCount64();for(;;){try{if(d.controllerPipe->PollConnect()&&!d.controller)d.controller=std::make_unique<OriginalController>(d.controllerPipe->Handle(),d.enrollment->Profile());if(d.controller){d.ControllerLive();Message m;if(d.controllerPipe->Poll(m))d.ControllerMessage(m);if(d.controllerPipe->Closed())d.Revoke();}else if(GetTickCount64()-waitingAt>=60000)d.Revoke();
            if(d.daemonPipe->PollConnect()){if(!d.daemon||!d.daemon->MatchesPeer(d.daemonPipe->Handle()))Refuse("unbound_daemon_pipe_peer");Message m;if(d.daemonPipe->Poll(m))d.DaemonMessage(m);}if(d.daemonPipe->Closed()&&d.daemon)d.state=State::Unknown;if(d.Teardown())return 0;
        }catch(const detail::Failure&){d.Revoke();d.state=State::Unknown;if(!d.daemon)return 2;}Sleep(5);}
    }catch(const detail::Failure& failure){const Result result{false,failure.unknown,failure.unavailable,failure.code,failure.error};const std::string text=ResultJson(result)+"\n";DWORD n=0;WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),text.data(),static_cast<DWORD>(text.size()),&n,nullptr);return 2;}}
std::string ResultJson(const Result& result){std::ostringstream out;out<<"{\"schema\":\"ae-agent.local-broker.result.v2\",\"ok\":"<<(result.ok?"true":"false")<<",\"unknown\":"<<(result.unknown?"true":"false")<<",\"unavailable\":"<<(result.unavailable?"true":"false")<<",\"code\":\""<<result.code<<"\",\"win32Error\":"<<result.win32Error<<",\"authorityMode\":\"local_controller_session\",\"genuineChatIdentity\":false,\"executionAdmission\":false,\"replayAllowed\":false}";return out.str();}
} // namespace local_session
