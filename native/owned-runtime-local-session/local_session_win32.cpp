#include "local_session_win32.h"
#include "original_daemon_win32.h"
#include "native_dispatch_commit.h"
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
#include "local_session_native_panel_case.h"
#else
#include "local_session_native_phase_case.h"
#endif
#endif
#ifndef AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS
#error Private installed fence/store seams must be reviewed before this target builds.
#endif
#include "../owned-runtime-initial-fence/fence_win32.h"
#include "../owned-runtime-initial-durability/store_win32.h"
#include <windows.h>
#include <sddl.h>
#include <algorithm>
#include <cstddef>
#include <cstring>
#include <iomanip>
#include <limits>
#include <sstream>
#include <type_traits>
#include <utility>

namespace local_session {
namespace {
using detail::Held;using detail::Refuse;using Bytes=std::vector<unsigned char>;
std::string AsciiPipeLocator(const std::wstring& name){
    std::string result;result.reserve(name.size());
    for(wchar_t c:name){const auto value=static_cast<std::uint32_t>(c);if(value<0x20||value>0x7e)Refuse("internal_pipe_name_not_printable_ascii");result.push_back(static_cast<char>(c));}
    return result;
}
void FailureDiagnostic(const char* stage,const Result& result) noexcept{
    // Diagnostic observations cannot change disposition or the original failure.
    // Two fixed call sites emit at most one short record each; no locator/nonce.
    try{const std::string text="{\"schema\":\"ae-agent.local-broker.failure-observation.v1\",\"brokerDisposition\":\"UNKNOWN\",\"stage\":\""+std::string(stage)+"\",\"result\":"+ResultJson(result)+"}\n";if(text.size()>2048)return;DWORD written=0;WriteFile(GetStdHandle(STD_ERROR_HANDLE),text.data(),static_cast<DWORD>(text.size()),&written,nullptr);}catch(...){}
}
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
void CheckFloorInventory(void* journal,const FloorSnapshot& floor){
    alignas(FILE_ID_BOTH_DIR_INFO) std::array<unsigned char,65536> buffer{};std::vector<std::wstring> names;bool restart=true;
    for(;;){const auto kind=restart?FileIdBothDirectoryRestartInfo:FileIdBothDirectoryInfo;restart=false;if(!GetFileInformationByHandleEx(journal,kind,buffer.data(),static_cast<DWORD>(buffer.size()))){if(GetLastError()==ERROR_NO_MORE_FILES)break;Refuse("floor_inventory_query_failed",GetLastError());}
        std::size_t offset=0;for(;;){if(offset+offsetof(FILE_ID_BOTH_DIR_INFO,FileName)>buffer.size())Refuse("floor_inventory_malformed");const auto* entry=reinterpret_cast<const FILE_ID_BOTH_DIR_INFO*>(buffer.data()+offset);if(entry->FileNameLength%2||entry->FileNameLength>buffer.size()-offset - offsetof(FILE_ID_BOTH_DIR_INFO,FileName))Refuse("floor_inventory_malformed");const std::wstring name(entry->FileName,entry->FileNameLength/2);
            if(name!=L"."&&name!=L".."){if(names.size()>=256||std::find(names.begin(),names.end(),name)!=names.end())Refuse("floor_inventory_limit_or_duplicate");names.push_back(name);}if(!entry->NextEntryOffset)break;if(entry->NextEntryOffset<offsetof(FILE_ID_BOTH_DIR_INFO,FileName)||entry->NextEntryOffset>buffer.size()-offset)Refuse("floor_inventory_malformed");offset+=entry->NextEntryOffset;}
    }
    for(std::uint64_t n=1;n<=floor.sequence;++n){const auto exact=SlotName(n);const auto found=std::find(names.begin(),names.end(),exact);if(found==names.end())Refuse("floor_inventory_missing_original");names.erase(found);}
    if(!names.empty()&&(!floor.pending.exists||names.size()!=1||names.front()!=SlotName(floor.pending.slot)))Refuse("floor_inventory_unexplained_tail");
    if(floor.pending.exists&&!detail::Zero(floor.pending.createdFileId)&&names.empty())Refuse("floor_inventory_missing_created_slot");
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
    ~PrivatePipe(){DWORD ignored=0;if(connecting_){CancelIoEx(pipe_.Get(),&connect_);GetOverlappedResult(pipe_.Get(),&connect_,&ignored,TRUE);}if(readPending_){CancelIoEx(pipe_.Get(),&read_);GetOverlappedResult(pipe_.Get(),&read_,&ignored,TRUE);}if(pipe_.Valid()&&!endpointClosed_)DisconnectNamedPipe(pipe_.Get());}
    bool PollConnect(){if(closed_)return false;if(connected_)return true;if(!connecting_)return false;DWORD n=0;if(GetOverlappedResult(pipe_.Get(),&connect_,&n,FALSE)){connecting_=false;connected_=true;return true;}const DWORD e=GetLastError();if(e==ERROR_IO_INCOMPLETE)return false;Close();return false;}
    bool Poll(Message& message){if(!connected_||closed_)return false;if(!readPending_){read_=OVERLAPPED{};read_.hEvent=event_.Get();ResetEvent(event_.Get());DWORD n=0;BOOL success=ReadFile(pipe_.Get(),buffer_.data(),static_cast<DWORD>(buffer_.size()),&n,&read_);if(success){message=Decode(Bytes(buffer_.begin(),buffer_.begin()+n));return true;}if(GetLastError()!=ERROR_IO_PENDING){Close();return false;}readPending_=true;}
        DWORD n=0;if(!GetOverlappedResult(pipe_.Get(),&read_,&n,FALSE)){if(GetLastError()==ERROR_IO_INCOMPLETE)return false;Close();return false;}readPending_=false;message=Decode(Bytes(buffer_.begin(),buffer_.begin()+n));return true;
    }
    bool PollBytes(Bytes& bytes){if(!connected_||closed_)return false;if(!readPending_){read_=OVERLAPPED{};read_.hEvent=event_.Get();ResetEvent(event_.Get());DWORD n=0;const BOOL success=ReadFile(pipe_.Get(),buffer_.data(),static_cast<DWORD>(buffer_.size()),&n,&read_);if(success){bytes.assign(buffer_.begin(),buffer_.begin()+n);return true;}if(GetLastError()!=ERROR_IO_PENDING){Close();return false;}readPending_=true;}
        DWORD n=0;if(!GetOverlappedResult(pipe_.Get(),&read_,&n,FALSE)){if(GetLastError()==ERROR_IO_INCOMPLETE)return false;Close();return false;}readPending_=false;bytes.assign(buffer_.begin(),buffer_.begin()+n);return true;
    }
    bool SendBytes(const Bytes& bytes){if(!connected_||closed_||bytes.empty()||bytes.size()>buffer_.size())return false;Held done(CreateEventW(nullptr,TRUE,FALSE,nullptr));if(!done.Valid()){Close();return false;}OVERLAPPED io{};io.hEvent=done.Get();DWORD n=0;const BOOL sent=WriteFile(pipe_.Get(),bytes.data(),static_cast<DWORD>(bytes.size()),&n,&io);if(!sent){if(GetLastError()!=ERROR_IO_PENDING){Close();return false;}const DWORD wait=WaitForSingleObject(done.Get(),1000);if(wait!=WAIT_OBJECT_0){CancelIoEx(pipe_.Get(),&io);GetOverlappedResult(pipe_.Get(),&io,&n,TRUE);Close();return false;}if(!GetOverlappedResult(pipe_.Get(),&io,&n,FALSE)){Close();return false;}}if(n!=bytes.size()){Close();return false;}return true;}
    void CloseOriginalEndpoint(){if(endpointClosed_)return;endpointClosed_=true;closed_=true;DWORD ignored=0;if(readPending_){CancelIoEx(pipe_.Get(),&read_);GetOverlappedResult(pipe_.Get(),&read_,&ignored,TRUE);readPending_=false;}connected_=false;
        // Transfer only this original endpoint out of RAII before one checked
        // close. Failure retains its exact raw value; no destructor retry/adoption.
        originalEndpointCloseUnknown_=pipe_.Take();if(!CloseHandle(originalEndpointCloseUnknown_)){const DWORD error=GetLastError();Refuse("original_phase_endpoint_close_unknown",error,true);}originalEndpointCloseUnknown_=nullptr;
    }
    bool Send(const Message& message){if(!connected_||closed_)return false;const Bytes bytes=Encode(message);Held done(CreateEventW(nullptr,TRUE,FALSE,nullptr));if(!done.Valid()){Close();return false;}OVERLAPPED io{};io.hEvent=done.Get();DWORD n=0;const BOOL sent=WriteFile(pipe_.Get(),bytes.data(),static_cast<DWORD>(bytes.size()),&n,&io);if(!sent){if(GetLastError()!=ERROR_IO_PENDING){Close();return false;}const DWORD wait=WaitForSingleObject(done.Get(),1000);if(wait!=WAIT_OBJECT_0){CancelIoEx(pipe_.Get(),&io);GetOverlappedResult(pipe_.Get(),&io,&n,TRUE);Close();return false;}if(!GetOverlappedResult(pipe_.Get(),&io,&n,FALSE)){Close();return false;}}if(n!=bytes.size()){Close();return false;}return true;}
    void Close(){closed_=true;}
    bool Closed()const{return closed_;}bool Connected()const{return connected_;}
    void* Handle()const{return pipe_.Get();}const std::wstring& Name()const{return name_;}
private:
    std::wstring name_;Held pipe_,event_;void* originalEndpointCloseUnknown_=nullptr;OVERLAPPED connect_{},read_{};std::array<unsigned char,4096> buffer_{};
    bool connecting_=false,connected_=false,readPending_=false,closed_=false,endpointClosed_=false;
};
class OriginalController final {
public:
    OriginalController(void* pipe,const reviewed::Profile& p){ULONG pid=0;if(!GetNamedPipeClientProcessId(pipe,&pid)||!pid)Refuse("controller_peer_query_failed",GetLastError());original_=Held(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,pid));if(!original_.Valid())Refuse("original_controller_open_failed",GetLastError());pid_=pid;birth_=detail::ProcessBirth(original_.Get());sid_=detail::ProcessSid(original_.Get());image_=detail::ProcessImage(original_.Get());if(sid_!=p.userSid||image_!=p.controllerImage.pin.canonicalPath||!detail::ProcessLive(original_.Get()))Refuse("controller_peer_binding_refused");ULONG still=0;if(!GetNamedPipeClientProcessId(pipe,&still)||still!=pid_||detail::ProcessBirth(original_.Get())!=birth_)Refuse("controller_peer_race");}
    bool Live(void* pipe)const{ULONG peer=0;return GetNamedPipeClientProcessId(pipe,&peer)&&peer==pid_&&detail::ProcessLive(original_.Get())&&detail::ProcessBirth(original_.Get())==birth_&&detail::ProcessSid(original_.Get())==sid_&&detail::ProcessImage(original_.Get())==image_;}
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
    bool DifferentOriginalPeer(void* pipe)const{ULONG peer=0;return GetNamedPipeClientProcessId(pipe,&peer)&&peer&&peer!=pid_;}
#endif
    const Id& Instance()const{return instance_;}
    Digest PhaseWitness(void* pipe,const Id& channel,const Digest& approvedImageHash)const{if(!Live(pipe)||detail::Zero(channel)||detail::Zero(approvedImageHash))Refuse("original_controller_phase_witness_closed");Bytes bytes;const char* domain="native-original-controller-peer.v2";for(const char* at=domain;*at;++at)bytes.push_back(static_cast<unsigned char>(*at));detail::PutU64(bytes,pid_);detail::PutU64(bytes,birth_);Put(bytes,instance_);Put(bytes,channel);Put(bytes,approvedImageHash);for(const auto* text:{&sid_,&image_}){detail::PutU16(bytes,static_cast<std::uint16_t>(text->size()));for(wchar_t c:*text)detail::PutU16(bytes,static_cast<std::uint16_t>(c));}return detail::Hash(bytes);}
private:Held original_;ULONG pid_=0;std::uint64_t birth_=0;std::wstring sid_,image_;Id instance_=detail::RandomId();
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
bool ContinuityPort::MatchesBinding(InstalledEnrollment& enrollment,initial_fence::Factory& factory,initial_fence::RootLease& root,initial_fence::FenceLease& fence)const{
    const auto& d=*data_;return !d.closed && d.thread==GetCurrentThreadId()
        && &d.enrollment==&enrollment && &d.factory==&factory && &d.root==&root && &d.fence==&fence;
}
bool ContinuityPort::Guard(initial_fence::InternalFencedIo& io){auto& d=*data_;if(d.closed||d.entered||d.thread!=GetCurrentThreadId()){d.closed=true;return false;}d.entered=true;
    try{const auto guarded=io.StageGuard();void* borrowed=io.BorrowedRoot();const auto original=d.factory.Observe(d.root,d.fence);if(!guarded.ok||!borrowed||!io.MatchesBinding(d.factory,d.root,d.fence)||!original.ok||original.sessionRef!=d.originalFenceRef||!d.enrollment.Fresh(true).ok||!detail::SamePin(detail::ReadPin(borrowed,true),d.enrollment.Profile().runtime))Refuse("production_continuity_fence_changed");
        Held journal=detail::Relative(borrowed,L"journal",true);if(!detail::SamePin(detail::ReadPin(journal.Get(),true),d.enrollment.Profile().journal)||d.floor.scope!=d.enrollment.Scope()||d.floor.originalSlotIds.size()!=d.floor.sequence||d.floor.originalFrameHashes.size()!=d.floor.sequence||d.floor.sequence>256)Refuse("production_floor_changed");
        if(!d.floor.sequence&&(d.floor.epoch||!detail::Zero(d.floor.head)||!detail::Zero(d.floor.genesis)||!detail::Zero(d.floor.owner)))Refuse("production_empty_floor_changed");
        CheckFloorInventory(journal.Get(),d.floor);Digest previous{};Id owner{};std::uint64_t epoch=0;
        for(std::uint64_t n=1;n<=d.floor.sequence;++n){if(!io.StageGuard().ok)Refuse("production_prefix_guard_lost");const auto slot=IndependentlyRead(journal.Get(),n);const auto index=static_cast<std::size_t>(n-1);if(slot.fileId!=d.floor.originalSlotIds[index]||slot.hash!=d.floor.originalFrameHashes[index]||slot.scope!=d.floor.scope||slot.lineage!=d.enrollment.Profile().lineage||slot.previous!=previous)Refuse("production_floor_prefix_changed");
            if(n==1){if(slot.type!=1||slot.epoch||!detail::Zero(slot.owner)||!detail::Zero(slot.genesis)||slot.hash!=d.floor.genesis)Refuse("production_genesis_changed");}
            else{if(slot.genesis!=d.floor.genesis)Refuse("production_genesis_reference_changed");if(slot.type==2){if(epoch==std::numeric_limits<std::uint64_t>::max()||slot.epoch!=epoch+1||detail::Zero(slot.owner))Refuse("production_owner_epoch_changed");}else if(slot.type==1||!epoch||slot.epoch!=epoch||slot.owner!=owner)Refuse("production_committed_epoch_changed");}
            previous=slot.hash;epoch=slot.epoch;owner=slot.owner;if(n==d.floor.sequence&&(slot.hash!=d.floor.head||slot.epoch!=d.floor.epoch||slot.owner!=d.floor.owner))Refuse("production_floor_head_changed");}
        if(!io.StageGuard().ok||!d.enrollment.Fresh(true).ok)Refuse("production_final_floor_guard_lost");d.entered=false;return true;
    }catch(const detail::Failure&){d.entered=false;d.closed=true;return false;}catch(...){d.entered=false;d.closed=true;throw;}
}
const FloorSnapshot& ContinuityPort::Floor()const{return data_->floor;}
const Id& ContinuityPort::AcquisitionOwner()const{return data_->acquisitionOwner;}
bool ContinuityPort::RegisterPending(initial_fence::InternalFencedIo& io,const FloorSnapshot::Pending& pending){auto& d=*data_;if(!Guard(io)||!pending.exists||d.floor.pending.exists||d.floor.sequence==256||pending.sequence!=d.floor.sequence||pending.epoch!=d.floor.epoch||pending.head!=d.floor.head||pending.slot!=d.floor.sequence+1||pending.type<1||pending.type>5||!detail::Zero(pending.createdFileId)||detail::Zero(pending.frameHash)||detail::Zero(pending.semanticKey)||IsSpent(pending.semanticKey))return false;
    if(pending.type==1){if(d.floor.sequence||d.floor.epoch||!detail::Zero(pending.owner))return false;}
    else if(pending.type==2){if(!d.floor.sequence||d.floor.epoch==std::numeric_limits<std::uint64_t>::max()||pending.owner!=d.acquisitionOwner||pending.owner==d.floor.owner)return false;}
    else if(!d.floor.epoch||pending.owner!=d.acquisitionOwner||pending.owner!=d.floor.owner)return false;
    if(!io.StageGuard().ok)return false;d.floor.pending=pending;if(pending.type==3)d.spent.push_back(pending.semanticKey);return true;
}
bool ContinuityPort::BindCreatedSlot(initial_fence::InternalFencedIo& io,void* originalFile){auto& d=*data_;if(!Guard(io)||!d.floor.pending.exists||!detail::Zero(d.floor.pending.createdFileId))return false;try{std::uint64_t length=0;const auto pin=detail::ReadPin(originalFile,false,&length);const auto& journal=d.enrollment.Profile().journal;if(length||detail::Zero(pin.fileId)||pin.volumeGuid!=journal.volumeGuid||pin.serial!=journal.serial||pin.canonicalPath!=journal.canonicalPath+L"\\"+SlotName(d.floor.pending.slot))return false;
        if(!io.StageGuard().ok)return false;Held independent=detail::Relative(d.enrollment.BorrowedJournal(),SlotName(d.floor.pending.slot),false);if(!detail::SamePin(detail::ReadPin(independent.Get(),false),pin)||!io.StageGuard().ok||!d.enrollment.Fresh(true).ok)return false;d.floor.pending.createdFileId=pin.fileId;return true;
    }catch(const detail::Failure&){return false;}}
bool ContinuityPort::ObserveAndAdvance(initial_fence::InternalFencedIo& io,bool originalFlushObserved){auto& d=*data_;if(!Guard(io)||!d.floor.pending.exists||detail::Zero(d.floor.pending.createdFileId))return false;const auto pending=d.floor.pending;try{Held journal=detail::Relative(io.BorrowedRoot(),L"journal",true);if(!detail::SamePin(detail::ReadPin(journal.Get(),true),d.enrollment.Profile().journal)||!io.StageGuard().ok)Refuse("production_readback_journal_changed");const auto slot=IndependentlyRead(journal.Get(),pending.slot);if(slot.fileId!=pending.createdFileId||slot.scope!=d.floor.scope||slot.lineage!=d.enrollment.Profile().lineage||slot.hash!=pending.frameHash||slot.key!=pending.semanticKey||slot.type!=pending.type||slot.previous!=d.floor.head||slot.owner!=pending.owner||slot.sequence!=d.floor.sequence+1)Refuse("production_pending_conflict");if(pending.type==1){if(d.floor.sequence||slot.epoch||!detail::Zero(slot.genesis)||!detail::Zero(slot.owner))Refuse("production_genesis_conflict");}else if(pending.type==2){if(!d.floor.sequence||slot.genesis!=d.floor.genesis||d.floor.epoch==std::numeric_limits<std::uint64_t>::max()||slot.epoch!=d.floor.epoch+1||slot.owner!=d.acquisitionOwner)Refuse("production_owner_conflict");}else if(slot.genesis!=d.floor.genesis||!d.floor.epoch||slot.epoch!=d.floor.epoch||slot.owner!=d.floor.owner)Refuse("production_epoch_conflict");if(!io.StageGuard().ok||!d.enrollment.Fresh(true).ok)Refuse("production_readback_guard_lost");
        // Independent native observation, then floor advancement+pending clear in
        // one same-thread critical section. No client ACK, wait, callback or IO here.
        // Reserve bounded vectors before changing either list, then commit the
        // original ID and exact frame hash together with the new head.
        d.floor.originalSlotIds.reserve(static_cast<std::size_t>(slot.sequence));d.floor.originalFrameHashes.reserve(static_cast<std::size_t>(slot.sequence));
        d.floor.originalSlotIds.push_back(slot.fileId);d.floor.originalFrameHashes.push_back(slot.hash);d.floor.sequence=slot.sequence;d.floor.epoch=slot.epoch;d.floor.head=slot.hash;d.floor.owner=slot.owner;if(slot.type==1)d.floor.genesis=slot.hash;d.floor.pending=FloorSnapshot::Pending{};
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
    // UNKNOWN is an irreversible disposition, independent of a later factual
    // exit of the one original HANDLE. An abort consumes protocol observation;
    // only that HANDLE and the original prepared clock remain while awaiting it.
    bool unknownDisposition=false,originalExitObserved=false,awaitingOriginalExit=false;
    std::uint32_t originalExitCode=0;
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
    void Unknown(){unknownDisposition=true;state=State::Unknown;}
    void Revoke(){controllerRevoked=true;if(!unknownDisposition&&!originalExitObserved)state=State::Revoked;}
    bool ObserveOriginalExit(){if(originalExitObserved)return true;if(!daemon||!daemon->ExactExit(originalExitCode))return false;originalExitObserved=true;if(!unknownDisposition)state=State::ExactExited;return true;}
    // Zero is only this broker's terminal observation; it grants no admission.
    int ExitDisposition()const{return unknownDisposition?2:0;}
    bool ControllerLive(){if(controllerRevoked||!controller||controllerPipe->Closed()||!controller->Live(controllerPipe->Handle())){Revoke();return false;}if(openedAt&&GetTickCount64()>=sessionDeadline){Revoke();return false;}return true;}
    Message Reply(std::uint16_t verb,std::uint64_t ordinal){Message message;message.verb=verb;message.ordinal=ordinal;message.channelNonce=controllerNonce;message.generation=generation;message.bootNonce=bootNonce;message.readinessEpoch=static_cast<std::uint64_t>(state);return message;}
    void ControllerMessage(const Message& m){
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
        (void)m;Refuse("legacy_controller_entry_unavailable_in_phase_target");
#else
        if(m.channelNonce!=controllerNonce||m.ordinal==0||controllerOrdinal==std::numeric_limits<std::uint64_t>::max()||m.ordinal!=controllerOrdinal+1||!detail::Zero(m.generation)||!detail::Zero(m.bootNonce)||!detail::Zero(m.reference)||!detail::Zero(m.digest)||m.readinessEpoch||m.readinessMask)Refuse("controller_closed_message_refused");controllerOrdinal=m.ordinal;
        if(m.verb==static_cast<std::uint16_t>(ControllerVerb::Revoke)){Revoke();controllerPipe->Send(Reply(m.verb,m.ordinal));return;}
        if(m.verb==static_cast<std::uint16_t>(ControllerVerb::Status)){controllerPipe->Send(Reply(m.verb,m.ordinal));return;}
        if(!ControllerLive()||!Guard())Refuse("controller_guard_closed");
        if(m.verb==static_cast<std::uint16_t>(ControllerVerb::Open)){if(state!=State::Closed||openedAt)Refuse("controller_open_already_consumed");openedAt=GetTickCount64();const auto limit=enrollment->Profile().maximumSessionMs;if(openedAt>std::numeric_limits<std::uint64_t>::max()-limit)Refuse("session_deadline_overflow");sessionDeadline=openedAt+limit;state=State::SessionOpen;}
        else if(m.verb==static_cast<std::uint16_t>(ControllerVerb::ReserveInitialLaunch)){
            if(state!=State::SessionOpen||daemon)Refuse("initial_launch_not_available");initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;record.effect=initial_durability::EffectClass::Launch;record.target=enrollment->Profile().launchTarget;const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;if(!consumed.ok||!consumed.consumptionRecorded||consumed.unknown){Unknown();Refuse("initial_launch_consumption_unknown",consumed.win32Error,true);}launchRecord=consumed.recordHash;state=State::LaunchReserved;
            // Durable consumption precedes this one prepared original grant.
            // Its fixed 10-minute disposition grace survives READ/session expiry
            // and EOF. No renew/token/activity or replacement controller changes it.
            auto lifecycle=PreparedLifecycleGrant::Prepare(generation,bootNonce,launchRecord,sessionDeadline);
            if(!ControllerLive()||!Guard()){Unknown();Refuse("consumed_launch_late_guard_closed",0,true);}Result launched;daemon=OriginalDaemon::Launch(*enrollment,generation,bootNonce,daemonNonce,daemonPipe->Name(),std::move(lifecycle),launched);if(!daemon||!launched.ok){Unknown();FailureDiagnostic("original_launch_result",launched);Refuse("original_launch_unknown",launched.win32Error,true);}state=State::TargetHeld;
        }else Refuse("controller_verb_refused");controllerPipe->Send(Reply(m.verb,m.ordinal));
#endif
    }
    void DaemonMessage(const Message& m){if(!daemon||!daemon->MatchesPeer(daemonPipe->Handle())||m.channelNonce!=daemonNonce||m.generation!=generation||m.bootNonce!=bootNonce||!m.ordinal||daemonOrdinal==std::numeric_limits<std::uint64_t>::max()||m.ordinal!=daemonOrdinal+1||!Guard())Refuse("original_daemon_message_refused");daemonOrdinal=m.ordinal;
        if(m.verb==static_cast<std::uint16_t>(DaemonVerb::BootHello)){if(state!=State::TargetHeld||!detail::Zero(m.reference)||!detail::Zero(m.digest)||m.readinessEpoch||m.readinessMask)Refuse("daemon_boot_refused");state=State::RegisteredReadClosed;}
        else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::ReadySnapshot)){if(state==State::TargetHeld||m.readinessEpoch<=readinessEpoch||m.readinessMask&~kAllQuiescent||!detail::Zero(m.reference)||!detail::Zero(m.digest))Refuse("daemon_readiness_refused");readinessEpoch=m.readinessEpoch;readinessMask=m.readinessMask;}
        else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::FirstActorObserved)){if(controllerRevoked||state!=State::RegisteredReadClosed||!panelGrantIssued||GetTickCount64()>=panelGrantDeadline||everActor||detail::Zero(m.reference)||detail::Zero(m.digest)||m.readinessEpoch||m.readinessMask)Refuse("first_actor_refused");everActor=true;initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;record.effect=initial_durability::EffectClass::Dispatch;record.target=enrollment->Profile().actorTarget;const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;if(!consumed.ok||consumed.unknown){Unknown();Refuse("first_actor_consumption_unknown",consumed.win32Error,true);}record={};record.type=initial_durability::RecordType::Note;record.sourceDigest=m.digest;Bytes binding;Put(binding,generation);Put(binding,bootNonce);Put(binding,m.reference);record.configDigest=detail::Hash(binding);const auto observed=store->AppendOnce(cas,record);cas=observed.current;if(!observed.ok||observed.unknown){Unknown();Refuse("first_actor_observation_unknown",observed.win32Error,true);}actor=m.reference;state=State::ActorBound;
            // No READ/execution grant is minted here. L4 requires a fresh bracket.
        }else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::Complete)){Refuse("completion_port_unavailable_before_l4");}
        else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::DrainAck)){if(!drainSent||drainAcknowledged||m.reference!=stopRef||m.readinessEpoch<=readinessEpoch||m.readinessMask!=kAllQuiescent||!detail::Zero(m.digest))Refuse("drain_ack_refused");readinessEpoch=m.readinessEpoch;readinessMask=m.readinessMask;drainAcknowledged=true;}
        else if(m.verb==static_cast<std::uint16_t>(DaemonVerb::ShutdownAck)){if(!stopConsumed||m.reference!=stopRef||m.readinessEpoch||m.readinessMask||!detail::Zero(m.digest))Refuse("shutdown_ack_refused"); /* ACK is not exit. */}
        else Refuse("daemon_verb_refused");
    }
    bool Teardown(){if(!daemon)return controllerRevoked;if(awaitingOriginalExit||!controllerRevoked)return false;
        // L3 never admits AE work. Abort only the original unadmitted daemon;
        // future L4 admission uses independent drain/readiness/consumed shutdown.
        Result aborted;if(Guard()&&daemon->AbortUnadmitted(aborted)){awaitingOriginalExit=true;return false;}
        if(!aborted.unavailable){Unknown();return false;}
        if(!daemon->LifecycleEffectAllowed()||daemonPipe->Closed()||!daemon->MatchesPeer(daemonPipe->Handle())||!Guard()){Unknown();return false;}
        if(!drainSent){stopRef=detail::RandomId();drainSent=true;readinessMask=0;Message drain;drain.verb=33;drain.ordinal=1;drain.channelNonce=daemonNonce;drain.generation=generation;drain.bootNonce=bootNonce;drain.reference=stopRef;if(!daemon->LifecycleEffectAllowed()||!daemonPipe->Send(drain)){Unknown();return false;}return false;}
        if(!drainAcknowledged||readinessMask!=kAllQuiescent||stopConsumed)return false;initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;record.effect=initial_durability::EffectClass::Stop;record.target=enrollment->Profile().stopTarget;const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;stopConsumed=true;stopRecord=consumed.recordHash;if(!consumed.ok||consumed.unknown||!Guard()||!daemon->LifecycleEffectAllowed()){Unknown();return false;}Message stop;stop.verb=34;stop.ordinal=2;stop.channelNonce=daemonNonce;stop.generation=generation;stop.bootNonce=bootNonce;stop.reference=stopRef;stop.digest=stopRecord;if(!daemon->LifecycleEffectAllowed()||!daemonPipe->Send(stop))Unknown();return false;
    }
};
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
namespace {
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
namespace fixture_case=local_session_native_panel_case;
constexpr std::uint16_t NativeCaseValue(){return static_cast<std::uint16_t>(fixture_case::kCase);}
static_assert(NativeCaseValue()>=1&&NativeCaseValue()<=8,"Closed native panel compile case required.");
static_assert(fixture_case::kSessionMs==900000&&fixture_case::kGrantMs==600000&&fixture_case::kPositiveMs==65000&&
    fixture_case::kExpiredMs==601000&&fixture_case::kBody=="{\"args\":{},\"name\":\"ensure_ae_agent_panel\"}","Reviewed fixed panel fixture changed.");
#else
namespace fixture_case=local_session_native_phase_case;
using NativeCase=fixture_case::Case;
constexpr std::uint16_t NativeCaseValue(){return static_cast<std::uint16_t>(fixture_case::kCase);}
constexpr bool KnownNativeCase(){return NativeCaseValue()==1||NativeCaseValue()==2||NativeCaseValue()==3||
    NativeCaseValue()==17||NativeCaseValue()==18||NativeCaseValue()==19||NativeCaseValue()==20;}
static_assert(KnownNativeCase(),"Unknown native phase fixture case; no runtime selector.");
static_assert(static_cast<std::uint16_t>(NativeCase::ServerStatus)==1&&static_cast<std::uint16_t>(NativeCase::ServerSearch)==2&&
    static_cast<std::uint16_t>(NativeCase::ServerSolution)==3&&static_cast<std::uint16_t>(NativeCase::CommitFresh)==17&&
    static_cast<std::uint16_t>(NativeCase::CommitDuplicate)==18&&static_cast<std::uint16_t>(NativeCase::CommitReplyLost)==19&&
    static_cast<std::uint16_t>(NativeCase::CommitGuardClosed)==20,"Closed case enum changed.");
static_assert(fixture_case::kBodies.size()==3&&fixture_case::kBodies[0].tool==1&&fixture_case::kBodies[1].tool==3&&
    fixture_case::kBodies[2].tool==4&&fixture_case::kBodies[0].canonical=="{\"args\":{},\"name\":\"get_owned_runtime_status\"}"&&
    fixture_case::kBodies[1].canonical=="{\"args\":{\"limit\":1,\"query\":\"guarded project lifecycle\"},\"name\":\"search_solutions\"}"&&
    fixture_case::kBodies[2].canonical=="{\"args\":{\"id\":\"guarded-project-lifecycle\"},\"name\":\"get_solution\"}","Exact reviewed canonical fixture bodies required.");
const fixture_case::Body& SelectedBody(){const auto value=NativeCaseValue();return fixture_case::kBodies[static_cast<std::size_t>(value>=1&&value<=3?value-1:0)];}
#endif
Digest TextHash(std::string_view value){return detail::Hash(Bytes(value.begin(),value.end()));}
Digest NativeHash(const char* domain,const Bytes& fields){Bytes bytes;for(const char* at=domain;*at;++at)bytes.push_back(static_cast<unsigned char>(*at));bytes.insert(bytes.end(),fields.begin(),fields.end());return detail::Hash(bytes);}
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
Digest PanelDomainHash(std::string_view domain,const Bytes& fields){Bytes bytes;detail::PutU16(bytes,static_cast<std::uint16_t>(domain.size()));
    bytes.insert(bytes.end(),domain.begin(),domain.end());Put(bytes,fields);return detail::Hash(bytes);}
static_assert(!std::is_default_constructible_v<phase::VolatileServerLedger>&&!std::is_copy_constructible_v<phase::VolatileServerLedger>&&
    !std::is_move_constructible_v<phase::VolatileServerLedger>,"No public issuer/authority copies.");
#endif
void Payload(phase::Frame& frame,const Bytes& bytes){if(bytes.size()>phase::kMaximumPayloadBytes)Refuse("native_phase_payload_overflow");frame.header.payloadBytes=static_cast<std::uint32_t>(bytes.size());std::copy(bytes.begin(),bytes.end(),frame.payload.begin());}
Bytes StatusPayload(State state,const Id& session){Bytes bytes;detail::PutU16(bytes,static_cast<std::uint16_t>(state));Put(bytes,session);return bytes;}
Bytes CallPayload(const phase::CallReply& call){Bytes bytes;Put(bytes,call.callRef);Put(bytes,call.ingressNonce);detail::PutU64(bytes,call.expiresMono);Put(bytes,call.bindingHash);return bytes;}
Bytes HandlerPayload(const phase::HandlerReply& handler){Bytes bytes;Put(bytes,handler.permitRef);Put(bytes,handler.permitNonce);detail::PutU64(bytes,handler.expiresMono);Put(bytes,handler.bindingHash);return bytes;}
}
struct Broker::PhaseData final : Broker::Data {
    phase::VolatileServerLedger ledger;
    std::unique_ptr<phase::WireChannel> controllerWire,daemonWire;
    std::unique_ptr<NativeDispatchCommit> privateCommit;
    NativeDispatchCommit::Observation noteObservation{};
    Id phaseSession=detail::RandomId(),brokerInstance=detail::RandomId(),launchRef=detail::RandomId();
    Digest controllerWitness{},daemonWitness{},transportBinding{},expectedSource{},lifecycleBinding{};
    std::uint64_t phaseLastMono=0,nativeGuardChecks=0;
    bool openedBound=false,runtimeBound=false,daemonBound=false,finished=false,endpointCloseAttempted=false;
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
    std::uint64_t actorOrdinal=0,actorObservedMono=0;std::size_t acceptedActorReplies=0;
    std::size_t panelCodecChecks=0,panelPrivatePredicateChecks=0;
    bool syntheticActorFault=false,actorConsumeAck=false,actorNoteAck=false,actorPublished=false;
    void PanelCodecContractChecks(){
        const auto require=[&](bool exact){if(!exact)Refuse("native_panel_codec_contract_closed");++panelCodecChecks;};
        phase::Frame call{};call.header.verb=phase::Verb::BeginCall;call.header.senderOrdinal=1;call.header.channelNonce.fill(1);
        call.header.payloadBytes=37;call.payload[0]=5;call.payload[2]=2;call.payload[3]=1;
        const auto bodyHash=TextHash(fixture_case::kBody);std::copy(bodyHash.begin(),bodyHash.end(),call.payload.begin()+5);
        phase::BeginCallPayload parsed{};require(phase::ReadPanelBegin(call,parsed)==phase::CodecError::None&&parsed.canonicalBodyHash==bodyHash);
        for(const auto offset:{0u,2u,3u}){auto wrong=call;wrong.payload[offset]=0xff;require(phase::ReadPanelBegin(wrong,parsed)!=phase::CodecError::None);}
        auto wrong=call;wrong.header.direction=phase::Direction::DaemonToBroker;require(phase::ReadPanelBegin(wrong,parsed)!=phase::CodecError::None);
        wrong=call;wrong.header.payloadBytes=38;require(phase::ReadPanelBegin(wrong,parsed)!=phase::CodecError::None);
        wrong=call;wrong.header.verb=static_cast<phase::Verb>(65535);require(phase::ReadPanelBegin(wrong,parsed)!=phase::CodecError::None);
        phase::Frame ingress{};ingress.header=call.header;ingress.header.direction=phase::Direction::DaemonToBroker;
        ingress.header.verb=phase::Verb::VerifyIngress;ingress.header.payloadBytes=69;std::fill_n(ingress.payload.begin(),32,std::uint8_t{1});
        std::copy_n(call.payload.begin(),37,ingress.payload.begin()+32);phase::VerifyIngressPayload verified{};
        require(phase::ReadPanelIngress(ingress,verified)==phase::CodecError::None&&verified.body.canonicalBodyHash==bodyHash);
        for(const auto offset:{32u,34u,35u}){wrong=ingress;wrong.payload[offset]=0xff;require(phase::ReadPanelIngress(wrong,verified)!=phase::CodecError::None);}
        wrong=ingress;wrong.header.payloadBytes=70;require(phase::ReadPanelIngress(wrong,verified)!=phase::CodecError::None);
        wrong=ingress;wrong.header.direction=phase::Direction::ControllerToBroker;require(phase::ReadPanelIngress(wrong,verified)!=phase::CodecError::None);
        phase::Frame observe{};observe.header=ingress.header;observe.header.verb=phase::Verb::FirstActorObserved;observe.header.payloadBytes=144;
        std::fill_n(observe.payload.begin(),144,std::uint8_t{1});phase::FirstActorPayload actorBody{};require(phase::ReadFirstActor(observe,actorBody)==phase::CodecError::None);
        for(const auto range:{std::pair<std::size_t,std::size_t>{0,16},{16,16},{32,16},{48,32},{80,32},{112,32}}){wrong=observe;
            std::fill_n(wrong.payload.begin()+static_cast<std::ptrdiff_t>(range.first),range.second,std::uint8_t{0});require(phase::ReadFirstActor(wrong,actorBody)!=phase::CodecError::None);}
        wrong=observe;wrong.header.payloadBytes=145;require(phase::ReadFirstActor(wrong,actorBody)!=phase::CodecError::None);
        wrong=observe;wrong.header.direction=phase::Direction::ControllerToBroker;require(phase::ReadFirstActor(wrong,actorBody)!=phase::CodecError::None);
        wrong=observe;wrong.header.senderOrdinal=std::numeric_limits<std::uint64_t>::max();require(phase::ReadFirstActor(wrong,actorBody)!=phase::CodecError::None);
        std::array<std::uint8_t,phase::kMaximumFrameBytes> bytes{};std::size_t length=0;require(phase::EncodeFrame(observe,bytes.data(),bytes.size(),length)==phase::CodecError::None);
        phase::Frame decoded{};require(phase::DecodeFrame(bytes.data(),length+1,decoded)!=phase::CodecError::None);require(phase::DecodeFrame(bytes.data(),length-1,decoded)!=phase::CodecError::None);
        phase::WireBindings binding{};binding.channelNonce.fill(1);binding.sessionRef.fill(2);binding.generation.fill(3);binding.bootNonce.fill(4);
        observe.header.channelNonce=binding.channelNonce;observe.header.sessionRef=binding.sessionRef;observe.header.generation=binding.generation;observe.header.bootNonce=binding.bootNonce;
        for(std::size_t i=0;i<4;++i){wrong=observe;if(i==0)wrong.header.channelNonce[0]^=1;if(i==1)wrong.header.sessionRef[0]^=1;
            if(i==2)wrong.header.generation[0]^=1;if(i==3)wrong.header.bootNonce[0]^=1;phase::WireChannel wire(phase::Direction::DaemonToBroker,binding,phase::BindingStage::Open);
            require(phase::EncodeFrame(wrong,bytes.data(),bytes.size(),length)==phase::CodecError::None&&wire.AcceptIncoming(bytes.data(),length,decoded)==phase::CodecError::Binding);}
        // This separate unbound private object exercises absence, not authority.
        // It never receives InitializeNative/InitializeSynthetic or OS ports.
        phase::VolatileServerLedger unbound;phase::CallReply noCall{};phase::HandlerReply noHandler{};
        require(unbound.BeginPanel(unbound.controller_,parsed,0,noCall)==phase::Status::Unavailable);
        require(unbound.IssuePanel(unbound.daemon_,verified,0,noHandler)==phase::Status::Unavailable);
        require(!unbound.PanelExact(actorBody)&&!unbound.firstPanelAttempt_&&!unbound.firstActorAttemptSpent_);
    }
    void PanelPrivatePredicateChecks(){phase::FirstActorPayload expected{};expected.grantRef=ledger.panel_.ref;expected.grantNonce=ledger.panel_.nonce;
        expected.actorRef=ledger.panelDefinition_.actorRef;expected.actorHash=ledger.panelDefinition_.actorHash;expected.installedPanelHash=ledger.panelDefinition_.installedHash;
        expected.observationHash=ledger.PanelObservationHash(expected);if(!ledger.PanelExact(expected))Refuse("native_panel_private_predicate_closed",0,true);
        ++panelPrivatePredicateChecks;
        for(std::size_t i=0;i<6;++i){auto wrong=expected;if(i==0)wrong.grantRef[0]^=1;if(i==1)wrong.grantNonce[0]^=1;if(i==2)wrong.actorRef[0]^=1;
            if(i==3)wrong.actorHash[0]^=1;if(i==4)wrong.installedPanelHash[0]^=1;if(i==5)wrong.observationHash[0]^=1;
            if(ledger.PanelExact(wrong))Refuse("native_panel_private_substitution_accepted",0,true);++panelPrivatePredicateChecks;}
    }
#endif
    void InitializePhase(){
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
        PanelCodecContractChecks();
#endif
        Initialize();phase::WireBindings binding{};binding.channelNonce=controllerNonce;
        controllerWire=std::make_unique<phase::WireChannel>(phase::Direction::ControllerToBroker,binding,phase::BindingStage::BeforeOpen);
        for(const auto& file:enrollment->Profile().sourceFiles)if(file.components==std::vector<std::wstring>{L"mcp-server",L"bridge-daemon.js"})expectedSource=file.sha256;
        if(detail::Zero(expectedSource)||controllerWire->Closed())Refuse("native_phase_original_source_or_channel_closed");
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
        if(enrollment->Profile().maximumSessionMs!=fixture_case::kSessionMs)Refuse("native_panel_fixed_session_closed");
        ledger.panelDefinition_.actorRef=fixture_case::kActorRef;ledger.panelDefinition_.actorHash=TextHash(fixture_case::kActorDefinition);
        ledger.panelDefinition_.installedHash=TextHash(fixture_case::kPanelDefinition);
        Bytes definition;Put(definition,ledger.panelDefinition_.actorRef);Put(definition,ledger.panelDefinition_.actorHash);Put(definition,ledger.panelDefinition_.installedHash);
        Put(definition,expectedSource);ledger.panelDefinition_.definitionHash=PanelDomainHash("lcp2.native.synthetic-panel-definition.v2",definition);
#endif
    }
    bool FreshController(){if(unknownDisposition||!ControllerLive()||!Guard())return false;
        const auto now=GetTickCount64();if(now<phaseLastMono||(openedAt&&now>=sessionDeadline))return false;phaseLastMono=now;
        if(openedBound&&(enrollment->Scope()!=ledger.nativeBinding_.scopeHash||enrollment->Profile().policyHash!=ledger.nativeBinding_.policyHash||
            enrollment->Profile().policyEpoch!=ledger.nativeBinding_.policyEpoch||enrollment->Profile().installation!=ledger.nativeBinding_.installation||
            enrollment->Profile().lineage!=ledger.nativeBinding_.lineage||controllerNonce!=ledger.session_.channelNonce||phaseSession!=ledger.session_.sessionRef||
            controller->Instance()!=ledger.controller_.originalInstance||
            controller->PhaseWitness(controllerPipe->Handle(),controllerNonce,enrollment->Profile().controllerImage.sha256)!=controllerWitness))return false;
        const auto& floor=continuity->Floor();return !floor.pending.exists&&floor.sequence==cas.sequence&&floor.epoch==cas.epoch&&
            floor.head==cas.head&&floor.scope==enrollment->Scope()&&continuity->MatchesBinding(*enrollment,*factory,root,fence)&&
            (!openedAt||GetTickCount64()<sessionDeadline);
    }
    bool SharedOriginalPeersFloor(){if(!openedBound||!runtimeBound||!daemon||!daemonPipe->Connected()||daemonPipe->Closed()||
            !FreshController()||!daemon->MatchesPeer(daemonPipe->Handle())||!daemon->LifecycleEffectAllowed())return false;
        if(generation!=ledger.session_.generation||bootNonce!=ledger.session_.bootNonce)return false;
        if(daemonBound&&(daemon->OriginalInstance()!=ledger.daemon_.originalInstance||daemonNonce!=ledger.daemon_.privateChannel||
            daemon->PhaseWitness(daemonPipe->Handle(),phaseSession,daemonNonce)!=daemonWitness))return false;
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
        if(!controller->DifferentOriginalPeer(daemonPipe->Handle())||nativeGuardChecks==std::numeric_limits<std::uint64_t>::max())return false;
        ++nativeGuardChecks;
#endif
        return true;
    }
    bool FreshBoth(){return SharedOriginalPeersFloor()&&(state==State::TargetHeld||state==State::RegisteredReadClosed)&&!everActor&&!panelGrantIssued;}
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
    bool PanelChannelsCurrent(phase::Verb verb,std::uint64_t ordinal)const{
        if(!controllerWire||!daemonWire||controllerWire->Closed()||daemonWire->Closed()||controllerWire->PendingBecameUnknown()||
            daemonWire->PendingBecameUnknown()||controllerWire->incomingPending_.present||controllerWire->outgoingPending_.present||
            daemonWire->outgoingPending_.present||daemonWire->incomingOrdinal_!=ordinal)return false;
        const phase::WireBindings c{controllerNonce,phaseSession,generation,bootNonce},d{daemonNonce,phaseSession,generation,bootNonce};
        const auto exact=[](const phase::WireBindings& a,const phase::WireBindings& b){return a.channelNonce==b.channelNonce&&a.sessionRef==b.sessionRef&&a.generation==b.generation&&a.bootNonce==b.bootNonce;};
        if(!exact(controllerWire->bindings_,c)||!exact(daemonWire->bindings_,d))return false;
        return daemonWire->incomingPending_.present?(daemonWire->incomingPending_.verb==verb&&daemonWire->incomingPending_.ordinal==ordinal):
            (daemonWire->settledVerb_==verb&&daemonWire->settledReplyTo_==ordinal&&daemonWire->settledOutgoing_==daemonWire->outgoingOrdinal_);
    }
    bool PanelIssuedGuard(){const auto& p=ledger.panel_;if(!daemonBound||!SharedOriginalPeersFloor()||ledger.closed_||
        state!=State::RegisteredReadClosed||everActor||!panelGrantIssued||!ledger.firstPanelAttempt_||ledger.firstActorAttemptSpent_||
        p.stage!=phase::VolatileServerLedger::ActorStage::Issued||!ledger.PanelRowExact()||GetTickCount64()>=p.deadline||
        panelGrantDeadline!=p.deadline||enrollment->Profile().sourceSetHash!=ledger.nativeBinding_.sourceHash)return false;
        return true;
    }
    bool PanelIssuePresend(){if(!PanelIssuedGuard()||!PanelChannelsCurrent(phase::Verb::VerifyIngress,daemonWire->incomingOrdinal_))return false;
        const auto now=GetTickCount64();const auto wait=NativeCaseValue()==4?fixture_case::kExpiredMs:NativeCaseValue()==1?fixture_case::kPositiveMs:0;
        return now<ledger.rows_[ledger.panel_.rowIndex].call.expiresMono&&sessionDeadline>now&&sessionDeadline-now>wait+5000&&
            ledger.panel_.deadline-ledger.panel_.issuedMono==fixture_case::kGrantMs;}
    bool PanelCurrentActorGuard(){const auto& p=ledger.panel_;if(!actorOrdinal||!daemonBound||!SharedOriginalPeersFloor()||ledger.closed_||
        !panelGrantIssued||panelGrantDeadline!=p.deadline||!ledger.firstActorAttemptSpent_||!ledger.PanelExact(p.operation)||
        !PanelChannelsCurrent(phase::Verb::FirstActorObserved,actorOrdinal)||GetTickCount64()>=p.deadline||
        enrollment->Profile().sourceSetHash!=ledger.nativeBinding_.sourceHash)return false;
        using Stage=phase::VolatileServerLedger::ActorStage;
        if(p.stage==Stage::AttemptSpent)return state==State::RegisteredReadClosed&&!everActor&&!actorPublished;
        const auto& floor=continuity->Floor();if(!actorConsumeAck||detail::Zero(p.consumeHash)||p.consumeSequence!=4||
            floor.originalFrameHashes.size()<4||floor.originalFrameHashes[3]!=p.consumeHash)return false;
        if(p.stage==Stage::Consumed)return state==State::RegisteredReadClosed&&!everActor&&!actorPublished&&cas.sequence==4&&cas.head==p.consumeHash;
        if(!actorNoteAck||detail::Zero(p.noteHash)||p.noteSequence!=5||cas.sequence!=5||cas.head!=p.noteHash||
            floor.originalFrameHashes.size()!=5||floor.originalFrameHashes[4]!=p.noteHash)return false;
        if(p.stage==Stage::Noted)return state==State::RegisteredReadClosed&&!everActor&&!actorPublished;
        return p.stage==Stage::Published&&state==State::ActorBound&&everActor&&actorPublished&&actor==p.operation.actorRef&&
            ledger.rows_[p.rowIndex].state==phase::VolatileServerLedger::RowState::ActorObserved;
    }
#endif
    static bool Refresh(void* original,std::uint64_t& now)noexcept{try{auto& d=*static_cast<PhaseData*>(original);
        if(!d.daemonBound||!d.FreshBoth()||d.controllerWire->Closed()||!d.daemonWire||d.daemonWire->Closed()||
            d.nativeGuardChecks==std::numeric_limits<std::uint64_t>::max())return false;
        ++d.nativeGuardChecks;now=GetTickCount64();return now>=d.phaseLastMono&&now<d.sessionDeadline;
    }catch(...){return false;}}
    static bool Random(void* original,phase::Id& id)noexcept{try{auto& d=*static_cast<PhaseData*>(original);
        if(d.unknownDisposition||d.controllerRevoked)return false;id=detail::RandomId();return !detail::Zero(id);
    }catch(...){return false;}}
    static bool CommitGuard(void* original)noexcept{std::uint64_t now=0;return Refresh(original,now);}
    static bool CommitFloor(void* original,const initial_durability::Cas& expected,const Digest& record)noexcept{try{auto& d=*static_cast<PhaseData*>(original);
        if(!d.FreshBoth())return false;const auto& floor=d.continuity->Floor();return !floor.pending.exists&&floor.sequence==expected.sequence&&
            floor.epoch==expected.epoch&&floor.head==expected.head&&floor.head==record&&
            !floor.originalFrameHashes.empty()&&floor.originalFrameHashes.back()==record&&
            floor.originalSlotIds.size()==floor.sequence&&floor.originalFrameHashes.size()==floor.sequence;
    }catch(...){return false;}}
    void CloseLedger(bool unknown){if(unknown||ledger.HasUnresolved())Unknown();ledger.Close();Revoke();}
    phase::Frame Reply(const phase::Frame& request,bool controllerPeer,phase::Status status){phase::Frame reply{};
        reply.header.direction=controllerPeer?phase::Direction::BrokerToController:phase::Direction::BrokerToDaemon;
        reply.header.kind=phase::FrameKind::Reply;reply.header.verb=request.header.verb;reply.header.status=status;
        auto& wire=controllerPeer?*controllerWire:*daemonWire;
        if(wire.outgoingOrdinal_==std::numeric_limits<std::uint64_t>::max())Refuse("native_phase_reply_ordinal_overflow",0,true);
        reply.header.senderOrdinal=wire.outgoingOrdinal_+1;reply.header.replyToOrdinal=request.header.senderOrdinal;
        reply.header.channelNonce=wire.bindings_.channelNonce;reply.header.sessionRef=wire.bindings_.sessionRef;
        reply.header.generation=wire.bindings_.generation;reply.header.bootNonce=wire.bindings_.bootNonce;return reply;
    }
    void Send(phase::Frame& reply,bool controllerPeer,bool positiveGuard){auto& wire=controllerPeer?*controllerWire:*daemonWire;
        auto& pipe=controllerPeer?*controllerPipe:*daemonPipe;std::array<std::uint8_t,phase::kMaximumFrameBytes> encoded{};std::size_t size=0;
        if(phase::EncodeFrame(reply,encoded.data(),encoded.size(),size)!=phase::CodecError::None||wire.TrackOutgoing(reply)!=phase::CodecError::None)
            Refuse("native_phase_reply_codec_closed",0,true);
        if(positiveGuard){bool guarded=daemonBound?FreshBoth():FreshController();
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
            if(reply.header.verb==phase::Verb::VerifyIngress)guarded=PanelIssuePresend();
            if(reply.header.verb==phase::Verb::FirstActorObserved)guarded=PanelCurrentActorGuard();
#endif
            if(!guarded)Refuse("native_phase_presend_guard_closed",0,true);
            const auto now=GetTickCount64();if(now>=sessionDeadline)Refuse("native_phase_presend_deadline_closed",0,true);
            if(reply.header.verb==phase::Verb::BeginCall||reply.header.verb==phase::Verb::VerifyIngress||reply.header.verb==phase::Verb::FinishServerOnly){
                Id ref{};std::copy_n(reply.payload.begin(),16,ref.begin());bool exact=false;
                for(const auto& row:ledger.rows_){const bool matched=reply.header.verb==phase::Verb::BeginCall?row.call.callRef==ref:row.handler.permitRef==ref;
                    if(matched&&row.state!=phase::VolatileServerLedger::RowState::Empty&&now<row.call.expiresMono){exact=true;break;}}
                if(!exact)Refuse("native_phase_presend_call_expired",0,true);
            }
        }
        if(!pipe.SendBytes(Bytes(encoded.begin(),encoded.begin()+static_cast<std::ptrdiff_t>(size)))){
            wire.Close(phase::CodecError::Closed);CloseLedger(true);Refuse("native_phase_reply_send_unknown",0,true);
        }
    }
    void ControllerFrame(const phase::Frame& request){const auto verb=request.header.verb;
        if(verb==phase::Verb::Status){auto reply=Reply(request,true,phase::Status::Ok);Payload(reply,StatusPayload(state,openedBound?phaseSession:Id{}));Send(reply,true,false);return;}
        if(verb==phase::Verb::Revoke){CloseLedger(false);auto reply=Reply(request,true,phase::Status::Ok);Payload(reply,StatusPayload(state,openedBound?phaseSession:Id{}));Send(reply,true,false);controllerWire->Close(phase::CodecError::Closed);return;}
        if(!FreshController())Refuse("native_phase_controller_guard_closed");
        if(verb==phase::Verb::Open){if(openedBound||openedAt||state!=State::Closed)Refuse("native_phase_open_once_closed");
            openedAt=GetTickCount64();const auto limit=enrollment->Profile().maximumSessionMs;
            if(openedAt>std::numeric_limits<std::uint64_t>::max()-limit)Refuse("native_phase_deadline_overflow");sessionDeadline=openedAt+limit;
            controllerWitness=controller->PhaseWitness(controllerPipe->Handle(),controllerNonce,enrollment->Profile().controllerImage.sha256);
            Bytes transport;Put(transport,controllerNonce);Put(transport,controllerWitness);Put(transport,brokerInstance);Put(transport,enrollment->LaunchKey());
            transportBinding=NativeHash("native-original-controller-transport.v2",transport);const auto scope=enrollment->Scope();
            if(detail::Zero(scope)||detail::Zero(transportBinding))Refuse("native_phase_scope_binding_closed");
            auto reply=Reply(request,true,phase::Status::Ok);Bytes payload;Put(payload,phaseSession);detail::PutU64(payload,openedAt);detail::PutU64(payload,sessionDeadline);
            Put(payload,enrollment->Profile().policyHash);detail::PutU64(payload,enrollment->Profile().policyEpoch);detail::PutU64(payload,0);
            Put(payload,controllerWitness);Put(payload,transportBinding);Put(payload,scope);Payload(reply,payload);
            // C1 bytes144..175 are native original InstalledEnrollment::Scope.
            // The old zero bindings remain until this single send succeeds.
            Send(reply,true,true);phase::VolatileServerLedger::NativeBinding binding{};binding.session.channelNonce=controllerNonce;
            binding.session.sessionRef=phaseSession;binding.brokerInstance=brokerInstance;binding.installation=enrollment->Profile().installation;
            binding.lineage=enrollment->Profile().lineage;binding.scopeHash=scope;binding.policyHash=enrollment->Profile().policyHash;
            binding.transportHash=transportBinding;binding.openedMono=openedAt;binding.deadline=sessionDeadline;binding.policyEpoch=enrollment->Profile().policyEpoch;
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
            binding.sourceHash=enrollment->Profile().sourceSetHash;
#endif
            if(!FreshController()||scope!=enrollment->Scope()||!ledger.InitializeNative(binding,{this,Refresh,Random},controller->Instance(),controllerWitness)||
                !controllerWire->BindOpened(reply,phaseSession,scope))Refuse("native_phase_open_binding_unknown",0,true);
            openedBound=true;state=State::SessionOpen;return;
        }
        if(verb==phase::Verb::ReserveInitialLaunch){if(!openedBound||runtimeBound||daemon||state!=State::SessionOpen)Refuse("native_phase_launch_once_closed");
            initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;
            record.effect=initial_durability::EffectClass::Launch;record.target=enrollment->Profile().launchTarget;
            const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;
            if(!consumed.ok||consumed.unknown||consumed.unavailable||!consumed.consumptionRecorded||consumed.code!="appended"||
                consumed.persistence!="os_flush_ack_and_readback")Refuse("native_phase_launch_consumed_unknown",consumed.win32Error,true);
            launchRecord=consumed.recordHash;state=State::LaunchReserved;auto lifecycle=PreparedLifecycleGrant::Prepare(generation,bootNonce,launchRecord,sessionDeadline);
            lifecycleBinding=lifecycle->BindingHash();if(!FreshController())Refuse("native_phase_launch_late_guard_unknown",0,true);
            Result launched;daemon=OriginalDaemon::Launch(*enrollment,generation,bootNonce,daemonNonce,daemonPipe->Name(),phaseSession,std::move(lifecycle),launched);
            if(!daemon||!launched.ok)Refuse("native_phase_original_launch_unknown",launched.win32Error,true);state=State::TargetHeld;
            auto reply=Reply(request,true,phase::Status::Ok);Bytes payload;payload.push_back(1);Put(payload,launchRef);Put(payload,launchRecord);
            detail::PutU64(payload,cas.sequence);detail::PutU64(payload,cas.epoch);Put(payload,cas.head);Put(payload,generation);Put(payload,bootNonce);Put(payload,lifecycleBinding);Payload(reply,payload);
            Send(reply,true,true);if(!FreshController()||!controllerWire->AttachRuntime(reply,generation,bootNonce)||
                !ledger.AttachNativeRuntime(generation,bootNonce))Refuse("native_phase_runtime_binding_unknown",0,true);
            phase::WireBindings binding{daemonNonce,phaseSession,generation,bootNonce};
            daemonWire=std::make_unique<phase::WireChannel>(phase::Direction::DaemonToBroker,binding,phase::BindingStage::Open);
            runtimeBound=true;return;
        }
        if(verb==phase::Verb::BeginCall){phase::BeginCallPayload body{};phase::CallReply call{};phase::Status status=phase::Status::Unavailable;
            if(!daemonBound)status=phase::Status::Unavailable;
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
            else if(phase::ReadPanelBegin(request,body)!=phase::CodecError::None||body.canonicalBodyHash!=TextHash(fixture_case::kBody))status=phase::Status::Denied;
            else status=ledger.BeginPanel(ledger.controller_,body,GetTickCount64(),call);
#else
            else if(phase::ReadServerOnlyBegin(request,body)!=phase::CodecError::None)status=phase::Status::Denied;
            else if(body.tool!=static_cast<phase::ToolCode>(SelectedBody().tool)||body.canonicalBodyHash!=TextHash(SelectedBody().canonical))status=phase::Status::Denied;
            else status=ledger.Begin(ledger.controller_,body,GetTickCount64(),call);
#endif
            auto reply=Reply(request,true,status);if(status==phase::Status::Ok)Payload(reply,CallPayload(call));Send(reply,true,status==phase::Status::Ok);
            if(status==phase::Status::Denied||status==phase::Status::Unknown||status==phase::Status::Revoked)CloseLedger(status==phase::Status::Unknown);return;
        }
        // No PANEL/READ/execution/completion/lifecycle phase issuer is implemented.
        auto reply=Reply(request,true,phase::Status::Unavailable);Send(reply,true,false);
    }
#if !defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
    void ExercisePrivateNote(){if(NativeCaseValue()<17)return;
        NativeDispatchCommit::Binding binding{};binding.broker=brokerInstance;binding.installation=enrollment->Profile().installation;
        binding.lineage=enrollment->Profile().lineage;binding.session=phaseSession;binding.generation=generation;binding.boot=bootNonce;
        binding.command=detail::RandomId();binding.execution=detail::RandomId();binding.lease=detail::RandomId();binding.scope=enrollment->Scope();
        binding.runtime=daemonWitness;binding.actor=TextHash("synthetic.fixture.actor.absent.v1");binding.authorization=TextHash("synthetic.private.note.no.grant.v1");
        binding.body=TextHash(SelectedBody().canonical);binding.finalScript=TextHash("synthetic.private.note.no.script.v1");
        binding.target=daemonWitness;Bytes owner;Put(owner,continuity->Floor().owner);binding.owner=NativeHash("native-private-note-owner.v2",owner);
        Bytes fenceBinding;Put(fenceBinding,enrollment->LaunchKey());Put(fenceBinding,launchRecord);Put(fenceBinding,continuity->Floor().genesis);
        detail::PutU64(fenceBinding,cas.epoch);Put(fenceBinding,continuity->Floor().owner);binding.fence=NativeHash("native-private-note-launch-fence.v2",fenceBinding);
        binding.allowedLeaf=TextHash("synthetic.private.note.fixed.leaf.v1");
        privateCommit=std::unique_ptr<NativeDispatchCommit>(new NativeDispatchCommit(*store,cas,binding,{this,CommitGuard,CommitFloor}));
        // This separate proof cannot abort an admitted target, including a lost
        // private receipt. It creates no wire effect grant/delivery permit.
        daemon->MarkAdmitted();NativeDispatchCommit::ProofFault fault=NativeDispatchCommit::ProofFault::None;
        if(NativeCaseValue()==19)fault=NativeDispatchCommit::ProofFault::PrivateReplyLost;
        if(NativeCaseValue()==20)fault=NativeDispatchCommit::ProofFault::BeforeAppendGuardClosed;
        noteObservation=privateCommit->Commit(fault);if(NativeCaseValue()==18&&!noteObservation.unknown)noteObservation=privateCommit->ObserveDuplicate();
        if(noteObservation.unknown)Unknown();
    }
#endif
    void FinishOriginalFixture(){if(endpointCloseAttempted)Refuse("native_phase_fixture_endpoint_close_once",0,true);
        endpointCloseAttempted=true;finished=true;ledger.Close();daemonWire->Close(phase::CodecError::Closed);
        // The pinned zero-effect fixture waits for this original endpoint EOF,
        // then exits itself. No Drain/Shutdown wire or AbortUnadmitted is issued.
        daemonPipe->CloseOriginalEndpoint();awaitingOriginalExit=true;
    }
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
    bool ActorAppendExact(const initial_durability::Cas& before,const initial_durability::Result& result,bool consume){
        if(!before.sequence||before.sequence==std::numeric_limits<std::uint64_t>::max()||!result.ok||result.unknown||result.unavailable||
            result.code!="appended"||result.persistence!="os_flush_ack_and_readback"||result.consumptionRecorded!=consume||
            result.current.sequence!=before.sequence+1||result.current.epoch!=before.epoch||detail::Zero(result.recordHash)||
            result.current.head!=result.recordHash||result.scope!=enrollment->Scope()||result.lineage!=enrollment->Profile().lineage)return false;
        const auto& f=continuity->Floor();return !f.pending.exists&&f.sequence==result.current.sequence&&f.epoch==result.current.epoch&&
            f.head==result.recordHash&&f.owner==result.owner&&f.genesis==result.genesis&&f.originalSlotIds.size()==f.sequence&&
            f.originalFrameHashes.size()==f.sequence&&f.originalFrameHashes.back()==result.recordHash&&
            f.originalFrameHashes[static_cast<std::size_t>(before.sequence-1)]==before.head;
    }
    void ObservePanelActor(const phase::Frame& request){phase::FirstActorPayload body{};
        actorObservedMono=GetTickCount64();
        const bool exact=phase::ReadFirstActor(request,body)==phase::CodecError::None&&PanelIssuedGuard()&&ledger.PanelExact(body)&&
            PanelChannelsCurrent(phase::Verb::FirstActorObserved,request.header.senderOrdinal)&&!actorOrdinal&&!actorPublished;
        if(!exact){auto reply=Reply(request,false,phase::Status::Denied);Send(reply,false,false);FinishOriginalFixture();return;}
        // No payload-selected guard/fault/state. Seal the one original request
        // and spend the actor attempt before the first irreversible append.
        auto& p=ledger.panel_;actorOrdinal=request.header.senderOrdinal;p.operation=body;
        ledger.firstActorAttemptSpent_=true;p.stage=phase::VolatileServerLedger::ActorStage::AttemptSpent;
        if(!PanelCurrentActorGuard())Refuse("native_panel_actor_preconsume_guard_unknown",0,true);
        initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;
        record.effect=initial_durability::EffectClass::Dispatch;record.target=enrollment->Profile().actorTarget;
        auto before=cas;const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;
        if(!ActorAppendExact(before,consumed,true))Refuse("native_panel_actor_consume_unknown",consumed.win32Error,true);
        p.consumeHash=consumed.recordHash;p.consumeSequence=cas.sequence;actorConsumeAck=true;p.stage=phase::VolatileServerLedger::ActorStage::Consumed;
        if(NativeCaseValue()==6){syntheticActorFault=true;Refuse("synthetic_panel_guard_loss_after_consume",0,true);}
        if(!PanelCurrentActorGuard())Refuse("native_panel_actor_afterconsume_guard_unknown",0,true);
        const auto& row=ledger.rows_[p.rowIndex];Bytes descriptor;Put(descriptor,enrollment->Scope());Put(descriptor,enrollment->Profile().policyHash);
        Put(descriptor,controllerWitness);Put(descriptor,daemonWitness);Put(descriptor,transportBinding);Put(descriptor,phaseSession);Put(descriptor,generation);
        Put(descriptor,bootNonce);Put(descriptor,row.call.callRef);Put(descriptor,row.body.canonicalBodyHash);Put(descriptor,p.ref);Put(descriptor,p.nonce);
        Put(descriptor,p.authorizationHash);Put(descriptor,body.actorRef);Put(descriptor,body.actorHash);Put(descriptor,body.installedPanelHash);
        Put(descriptor,body.observationHash);Put(descriptor,p.consumeHash);detail::PutU64(descriptor,p.issuedMono);detail::PutU64(descriptor,p.deadline);
        p.noteSource=PanelDomainHash("lcp2.native.first-actor.note.v2",descriptor);Bytes binding;Put(binding,p.noteSource);Put(binding,p.consumeHash);
        Put(binding,launchRecord);Put(binding,continuity->Floor().genesis);detail::PutU64(binding,cas.epoch);Put(binding,continuity->Floor().owner);
        p.noteConfig=PanelDomainHash("lcp2.native.first-actor.consumed.v2",binding);
        p.observationRef=detail::RandomId();if(detail::Zero(p.observationRef)||!PanelCurrentActorGuard())Refuse("native_panel_actor_prenote_guard_unknown",0,true);
        record={};record.type=initial_durability::RecordType::Note;record.sourceDigest=p.noteSource;record.configDigest=p.noteConfig;
        before=cas;const auto observed=store->AppendOnce(cas,record);cas=observed.current;
        if(!ActorAppendExact(before,observed,false))Refuse("native_panel_actor_note_unknown",observed.win32Error,true);
        p.noteHash=observed.recordHash;p.noteSequence=cas.sequence;actorNoteAck=true;p.stage=phase::VolatileServerLedger::ActorStage::Noted;
        if(!PanelCurrentActorGuard())Refuse("native_panel_actor_postnote_guard_unknown",0,true);
        if(NativeCaseValue()==7){syntheticActorFault=true;Refuse("synthetic_panel_reply_loss_after_note",0,true);}
        // Publication is once-only and keeps all READ/command/effect paths closed.
        actor=body.actorRef;everActor=true;actorPublished=true;state=State::ActorBound;
        ledger.rows_[p.rowIndex].state=phase::VolatileServerLedger::RowState::ActorObserved;p.stage=phase::VolatileServerLedger::ActorStage::Published;
        readinessEpoch=0;readinessMask=0; // No actor-dependent permit/bracket exists in this profile.
        if(!PanelCurrentActorGuard())Refuse("native_panel_actor_published_guard_unknown",0,true);
        auto reply=Reply(request,false,phase::Status::Ok);Bytes payload;payload.push_back(1);Put(payload,p.observationRef);Put(payload,p.noteHash);
        detail::PutU64(payload,p.noteSequence);detail::PutU64(payload,cas.epoch);Put(payload,cas.head);Put(payload,actor);Put(payload,body.actorHash);
        Payload(reply,payload);Send(reply,false,true);++acceptedActorReplies;p.stage=phase::VolatileServerLedger::ActorStage::ReplySent;
        if(NativeCaseValue()!=5&&NativeCaseValue()!=8)FinishOriginalFixture(); // Two independent N4 variants.
    }
#endif
    void DaemonFrame(const phase::Frame& request){
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
        if(request.header.verb==phase::Verb::FirstActorObserved){if(!SharedOriginalPeersFloor())Refuse("native_panel_original_actor_peer_closed",0,true);ObservePanelActor(request);return;}
        if(request.header.verb==phase::Verb::FinishServerOnly){auto reply=Reply(request,false,phase::Status::Denied);Send(reply,false,false);CloseLedger(false);return;}
#endif
        if(!FreshBoth())Refuse("native_phase_original_daemon_guard_closed");
        if(request.header.verb==phase::Verb::BootHello){if(daemonBound||state!=State::TargetHeld||request.header.payloadBytes!=32||
                !std::equal(expectedSource.begin(),expectedSource.end(),request.payload.begin()))Refuse("native_phase_boot_source_binding_closed");
            daemonWitness=daemon->PhaseWitness(daemonPipe->Handle(),phaseSession,daemonNonce);
            if(!ledger.AttachNativeDaemon(daemonNonce,daemon->OriginalInstance(),daemonWitness))Refuse("native_phase_daemon_binding_closed",0,true);
            daemonBound=true;state=State::RegisteredReadClosed;std::uint64_t now=0;if(!Refresh(this,now))Refuse("native_phase_registration_guard_closed",0,true);
            auto reply=Reply(request,false,phase::Status::Ok);Payload(reply,StatusPayload(state,phaseSession));Send(reply,false,true);return;
        }
        if(request.header.verb==phase::Verb::VerifyIngress){phase::VerifyIngressPayload body{};phase::HandlerReply handler{};
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
            const auto status=phase::ReadPanelIngress(request,body)==phase::CodecError::None&&body.body.canonicalBodyHash==TextHash(fixture_case::kBody)?
                ledger.IssuePanel(ledger.daemon_,body,GetTickCount64(),handler):phase::Status::Denied;
            if(status==phase::Status::Ok){panelGrantIssued=true;panelGrantDeadline=ledger.panel_.deadline;}
            if(status==phase::Status::Ok)PanelPrivatePredicateChecks();
#else
            const auto status=phase::ReadServerOnlyIngress(request,body)==phase::CodecError::None?
                ledger.Verify(ledger.daemon_,body,GetTickCount64(),handler):phase::Status::Denied;
#endif
            auto reply=Reply(request,false,status);if(status==phase::Status::Ok)Payload(reply,HandlerPayload(handler));Send(reply,false,status==phase::Status::Ok);
            if(status!=phase::Status::Ok)CloseLedger(status==phase::Status::Unknown);return;
        }
#if !defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
        if(request.header.verb==phase::Verb::FinishServerOnly){Id permit{};Digest result{};
            std::copy_n(request.payload.begin(),16,permit.begin());std::copy_n(request.payload.begin()+16,32,result.begin());
            const auto status=ledger.Finish(ledger.daemon_,permit,result,GetTickCount64());auto reply=Reply(request,false,status);
            if(status==phase::Status::Ok){const auto* handler=ledger.FinishedHandler(permit);if(!handler)Refuse("native_phase_finished_handler_missing",0,true);
                Bytes payload;Put(payload,handler->permitRef);Put(payload,handler->permitNonce);Put(payload,result);Payload(reply,payload);}
            Send(reply,false,status==phase::Status::Ok);
            if(status!=phase::Status::Ok){CloseLedger(status==phase::Status::Unknown);return;}
            // SERVER_ONLY settles without a journal effect. Only after its exact
            // successful reply does the independent private Note exercise begin.
            ExercisePrivateNote();FinishOriginalFixture();return;
        }
#endif
        auto reply=Reply(request,false,phase::Status::Unavailable);Send(reply,false,false);
    }
    void TerminalObservation(){
#if defined(AE_AGENT_PHASE_NATIVE_PANEL_PROFILE)
        const auto& p=ledger.panel_;std::size_t completed=0;for(const auto& row:ledger.rows_)if(row.state==phase::VolatileServerLedger::RowState::ActorObserved)++completed;
        std::ostringstream out;out<<"{\"schema\":\"ae-agent.native-panel.synthetic-terminal.v1\",\"protocol\":\"LCP2\",\"proofCase\":"<<NativeCaseValue()
            <<",\"authorityMode\":\"local_controller_session\",\"genuineChatIdentity\":false,\"productionAdmission\":false,\"executionAdmission\":false,\"readAdmission\":false,\"replayAllowed\":false"
            <<",\"brokerDisposition\":\""<<(unknownDisposition?"UNKNOWN":"EXACT_EXITED")<<"\",\"issuedPanelGrant\":"<<(panelGrantIssued?"true":"false")
            <<",\"actorAttemptSpent\":"<<(ledger.firstActorAttemptSpent_?"true":"false")<<",\"actorBound\":"<<(actorPublished?"true":"false")
            <<",\"acceptedActorReplies\":"<<acceptedActorReplies<<",\"terminalPanelRows\":"<<completed<<",\"callRows\":"<<ledger.usedRows_
            <<",\"nativeGuardChecks\":"<<nativeGuardChecks<<",\"originalDaemonExactExit\":"<<(originalExitObserved?"true":"false")<<",\"originalDaemonExitCode\":"<<originalExitCode
            <<",\"panelCodecChecks\":"<<panelCodecChecks<<",\"panelPrivatePredicateChecks\":"<<panelPrivatePredicateChecks
            <<",\"journalSequence\":"<<cas.sequence<<",\"journalHead\":\""<<detail::Hex(cas.head)<<"\",\"actorConsumeAck\":"<<(actorConsumeAck?"true":"false")
            <<",\"actorNoteAck\":"<<(actorNoteAck?"true":"false")<<",\"syntheticFault\":"<<(syntheticActorFault?"true":"false")
            <<",\"actualProcessCrash\":false,\"actualPipeLoss\":false,\"effects\":0,\"sessionOpenedMono\":"<<openedAt<<",\"sessionDeadline\":"<<sessionDeadline
            <<",\"grantIssuedMono\":"<<p.issuedMono<<",\"grantDeadline\":"<<p.deadline<<",\"actorObservedMono\":"<<actorObservedMono
            <<",\"callExpiry\":"<<(ledger.usedRows_?ledger.rows_[0].call.expiresMono:0)<<",\"handlerExpiry\":"<<(ledger.usedRows_?ledger.rows_[0].handler.expiresMono:0)
            <<",\"consumeHash\":\""<<detail::Hex(p.consumeHash)<<"\",\"noteHash\":\""<<detail::Hex(p.noteHash)<<"\",\"noteSource\":\""<<detail::Hex(p.noteSource)
            <<"\",\"noteConfig\":\""<<detail::Hex(p.noteConfig)<<"\",\"daemonStdioCoverage\":\"NOT_CAPTURED\"}\n";
#else
        std::size_t completed=0;for(const auto& row:ledger.rows_)if(row.state==phase::VolatileServerLedger::RowState::Finished)++completed;
        std::ostringstream out;out<<"{\"schema\":\"ae-agent.native-phase.synthetic-terminal.v1\",\"protocol\":\"LCP2\",\"proofCase\":"<<NativeCaseValue()
            <<",\"authorityMode\":\"local_controller_session\",\"genuineChatIdentity\":false,\"executionAdmission\":false,\"productionAdmission\":false"
            <<",\"brokerDisposition\":\""<<(unknownDisposition?"UNKNOWN":"EXACT_EXITED")<<"\",\"handlerAdmissions\":"<<ledger.handlerAdmissions_
            <<",\"finishedRows\":"<<completed<<",\"nativeGuardChecks\":"<<nativeGuardChecks<<",\"originalDaemonExactExit\":"<<(originalExitObserved?"true":"false")
            <<",\"originalDaemonExitCode\":"<<originalExitCode<<",\"journalSequence\":"<<cas.sequence<<",\"journalHead\":\""<<detail::Hex(cas.head)<<"\",\"noteProof\":{"
            <<"\"code\":\""<<noteObservation.code<<"\",\"latched\":"<<(noteObservation.latched?"true":"false")<<",\"freshAppend\":"<<(noteObservation.freshAppend?"true":"false")
            <<",\"duplicateReadback\":"<<(noteObservation.duplicateReadback?"true":"false")<<",\"unknown\":"<<(noteObservation.unknown?"true":"false")
            <<",\"priorFloorVerified\":"<<(noteObservation.priorFloorVerified?"true":"false")<<",\"appendAckVerified\":"<<(noteObservation.appendAckVerified?"true":"false")
            <<",\"syntheticFault\":"<<(noteObservation.syntheticFault?"true":"false")<<",\"descriptorHash\":\""<<detail::Hex(noteObservation.descriptorHash)
            <<"\",\"configDigest\":\""<<detail::Hex(noteObservation.configDigest)<<"\",\"recordHash\":\""<<detail::Hex(noteObservation.recordHash)
            <<"\",\"deliveryPermitIssued\":false,\"actualPartialWrite\":false,\"actualProcessCrash\":false},\"replayAllowed\":false}\n";
#endif
        const auto text=out.str();DWORD written=0;if(text.size()>4096||!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),text.data(),static_cast<DWORD>(text.size()),&written,nullptr)||written!=text.size())
            Refuse("native_phase_terminal_observation_send_unknown",GetLastError(),true);
    }
};
int Broker::RunPhaseFixed(){try{auto owned=std::make_unique<PhaseData>();auto& d=*owned;d.InitializePhase();
        const auto locator=AsciiPipeLocator(d.controllerPipe->Name());std::string hello="{\"schema\":\"ae-agent.local-broker.locator.v2\",\"protocol\":\"LCP2\",\"pipe\":\"";
        for(char c:locator){if(c=='\\')hello+='\\';hello+=c;}hello+="\",\"nonce\":\""+detail::Hex(d.controllerNonce)+"\",\"authorityMode\":\"local_controller_session\",\"genuineChatIdentity\":false,\"executionAdmission\":false}\n";
        DWORD written=0;if(!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),hello.data(),static_cast<DWORD>(hello.size()),&written,nullptr)||written!=hello.size())Refuse("native_phase_locator_send_unknown",GetLastError(),true);
        const auto waitingAt=GetTickCount64();bool failureReported=false;
        const auto fail=[&](const detail::Failure& failure){d.CloseLedger(true);if(!failureReported){failureReported=true;FailureDiagnostic("native_phase_loop_caught_failure",{false,true,failure.unavailable,failure.code,failure.error});}
            if(d.daemonBound&&!d.endpointCloseAttempted){try{d.endpointCloseAttempted=true;d.daemonPipe->CloseOriginalEndpoint();d.awaitingOriginalExit=true;}catch(...){d.Unknown();}}};
        for(;;){try{if(d.ObserveOriginalExit()){if(!d.finished||d.ledger.HasUnresolved())d.Unknown();d.ledger.Close();d.TerminalObservation();return d.ExitDisposition();}
                if(d.daemon&&!d.daemon->LifecycleEffectAllowed()){d.Unknown();return 2;}
                if(!d.finished&&!d.controllerRevoked){if(d.controllerPipe->PollConnect()&&!d.controller)d.controller=std::make_unique<OriginalController>(d.controllerPipe->Handle(),d.enrollment->Profile());
                    if(d.controller){if(!d.ControllerLive())d.CloseLedger(false);Bytes bytes;if(d.controllerPipe->PollBytes(bytes)){phase::Frame request{};
                        if(d.controllerWire->AcceptIncoming(bytes.data(),bytes.size(),request)!=phase::CodecError::None)Refuse("native_phase_controller_decode_closed",0,true);d.ControllerFrame(request);}
                        if(d.controllerPipe->Closed())d.CloseLedger(false);
                    }else if(GetTickCount64()-waitingAt>=60000)d.CloseLedger(false);}
                if(!d.finished&&!d.controllerRevoked&&d.daemonWire&&d.daemonPipe->PollConnect()){if(!d.daemon||!d.daemon->MatchesPeer(d.daemonPipe->Handle()))Refuse("native_phase_unbound_daemon_peer");
                    Bytes bytes;if(d.daemonPipe->PollBytes(bytes)){phase::Frame request{};if(d.daemonWire->AcceptIncoming(bytes.data(),bytes.size(),request)!=phase::CodecError::None)
                        Refuse("native_phase_daemon_decode_closed",0,true);d.DaemonFrame(request);}if(d.daemonPipe->Closed()&&!d.finished)Refuse("native_phase_daemon_eof_unknown",0,true);}
                if(d.controllerRevoked&&!d.daemon)return d.ExitDisposition();
                if(d.controllerRevoked&&d.daemon&&!d.awaitingOriginalExit){if(d.daemonBound){d.FinishOriginalFixture();}
                    else{Result abort;if(d.Guard()&&d.daemon->AbortUnadmitted(abort))d.awaitingOriginalExit=true;else d.Unknown();}}
            }catch(const detail::Failure& failure){fail(failure);}Sleep(5);
        }
    }catch(const detail::Failure& failure){const auto text=ResultJson({false,true,failure.unavailable,failure.code,failure.error})+"\n";DWORD written=0;WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),text.data(),static_cast<DWORD>(text.size()),&written,nullptr);return 2;}}
#endif
Broker::Broker(std::unique_ptr<Data> d):data_(std::move(d)){}Broker::~Broker()=default;
int Broker::RunFixed(){
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
    return RunPhaseFixed();
#else
    try{auto data=std::make_unique<Data>();data->Initialize();Broker broker(std::move(data));auto& d=*broker.data_;const std::wstring name=d.controllerPipe->Name();const std::string locator=AsciiPipeLocator(name);const std::string nonce=detail::Hex(d.controllerNonce);std::string hello="{\"schema\":\"ae-agent.local-broker.locator.v2\",\"pipe\":\"";for(char c:locator){if(c=='\\')hello+='\\';hello+=c;}hello+="\",\"nonce\":\""+nonce+"\",\"authorityMode\":\"local_controller_session\",\"genuineChatIdentity\":false,\"executionAdmission\":false}\n";DWORD n=0;if(!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),hello.data(),static_cast<DWORD>(hello.size()),&n,nullptr)||n!=hello.size())Refuse("broker_locator_send_unknown",GetLastError(),true);
        const auto waitingAt=GetTickCount64();bool failureReported=false;
        const auto caughtFailure=[&](const detail::Failure& failure){d.Unknown();d.Revoke();if(!failureReported){failureReported=true;FailureDiagnostic("broker_loop_caught_failure",Result{false,failure.unknown,failure.unavailable,failure.code,failure.error});}};
        const auto originalDisposition=[&](){
            // Never depends on pipe admission, controller liveness or a fresh
            // enrollment/floor guard. Exact exit remains observable after expiry.
            try{if(d.ObserveOriginalExit())return d.ExitDisposition();}catch(const detail::Failure& failure){caughtFailure(failure);}
            // This existing query is backed solely by the immutable preissued
            // disposition clock. Expiry ends only this broker, with no target IO.
            if(d.daemon&&!d.daemon->LifecycleEffectAllowed()){d.Unknown();d.Revoke();return 2;}return -1;
        };
        for(;;){int terminal=originalDisposition();if(terminal>=0)return terminal;
            try{if(d.controllerPipe->PollConnect()&&!d.controller)d.controller=std::make_unique<OriginalController>(d.controllerPipe->Handle(),d.enrollment->Profile());if(d.controller){d.ControllerLive();Message m;if(d.controllerPipe->Poll(m))d.ControllerMessage(m);if(d.controllerPipe->Closed())d.Revoke();}else if(GetTickCount64()-waitingAt>=60000)d.Revoke();
                // No daemon protocol can restore authority after our once-only
                // abort. Its expected dead peer/EOF is not a protocol failure;
                // the independent original HANDLE observation decides exit.
                if(!d.awaitingOriginalExit){if(d.daemonPipe->PollConnect()){if(!d.daemon||!d.daemon->MatchesPeer(d.daemonPipe->Handle()))Refuse("unbound_daemon_pipe_peer");Message m;if(d.daemonPipe->Poll(m))d.DaemonMessage(m);}if(d.daemonPipe->Closed()&&d.daemon)d.Unknown();}
            }catch(const detail::Failure& failure){caughtFailure(failure);}
            // Protocol failure cannot starve lifecycle observation or teardown.
            terminal=originalDisposition();if(terminal>=0)return terminal;
            try{if(d.Teardown())return d.ExitDisposition();}catch(const detail::Failure& failure){caughtFailure(failure);}
            terminal=originalDisposition();if(terminal>=0)return terminal;Sleep(5);
        }
    }catch(const detail::Failure& failure){const Result result{false,failure.unknown,failure.unavailable,failure.code,failure.error};const std::string text=ResultJson(result)+"\n";DWORD n=0;WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),text.data(),static_cast<DWORD>(text.size()),&n,nullptr);return 2;}
#endif
}
std::string ResultJson(const Result& result){std::ostringstream out;out<<"{\"schema\":\"ae-agent.local-broker.result.v2\",\"ok\":"<<(result.ok?"true":"false")<<",\"unknown\":"<<(result.unknown?"true":"false")<<",\"unavailable\":"<<(result.unavailable?"true":"false")<<",\"code\":\""<<result.code<<"\",\"win32Error\":"<<result.win32Error<<",\"authorityMode\":\"local_controller_session\",\"genuineChatIdentity\":false,\"executionAdmission\":false,\"replayAllowed\":false}";return out.str();}
} // namespace local_session
