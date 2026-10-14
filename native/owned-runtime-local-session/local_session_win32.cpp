#include "local_session_win32.h"
#include "original_daemon_win32.h"
#include "native_dispatch_commit.h"
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
#include "local_session_native_client.h"
#include "production_artifact_seal.h"
#endif
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
SlotObservation ReadOriginalSlot(void* original,std::uint64_t n){
    SlotObservation slot;slot.fileId=detail::ReadPin(original,false).fileId;const Bytes bytes=detail::ReadExact(original,16384);if(bytes.size()<228)Refuse("floor_partial_slot",0,true);Reader read{bytes};if(read.Fixed<8>()!=std::array<unsigned char,8>{'O','W','N','J','R','N','0','1'}||read.Number(2)!=1)Refuse("floor_frame_version",0,true);slot.type=static_cast<std::uint16_t>(read.Number(2));if(slot.type<1||slot.type>5||read.Number(4)!=bytes.size())Refuse("floor_frame_type_length",0,true);slot.scope=read.Fixed<32>();slot.lineage=read.Fixed<16>();slot.genesis=read.Fixed<32>();slot.sequence=read.Number(8);slot.epoch=read.Number(8);slot.owner=read.Fixed<16>();slot.previous=read.Fixed<32>();slot.key=read.Fixed<32>();const auto payload=read.Number(4);if(payload>4096||read.offset+payload+32!=bytes.size())Refuse("floor_frame_payload",0,true);read.offset+=static_cast<std::size_t>(payload);slot.hash=read.Fixed<32>();read.End();if(slot.sequence!=n||detail::Hash(Bytes(bytes.begin(),bytes.end()-32))!=slot.hash)Refuse("floor_frame_hash_or_slot",0,true);return slot;
}
SlotObservation IndependentlyRead(void* journal,std::uint64_t n){
    Held witness=detail::Relative(journal,SlotName(n),false);return ReadOriginalSlot(witness.Get(),n);
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
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
// Separate original LCP2 endpoints. Legacy LCSB IO/cleanup remains unchanged.
// Any unsettled operation or failed close retains this original state until
// broker exit; no stack OVERLAPPED, unbounded wait or destructor retry exists.
class TrustedPipe final {
    struct Io final {
        Held event;OVERLAPPED overlapped{};std::array<unsigned char,4096> bytes{};
        bool pending=false,cancelled=false;
        Io():event(CreateEventW(nullptr,TRUE,FALSE,nullptr)){if(!event.Valid())Refuse("trusted_pipe_event_create_refused",GetLastError());overlapped.hEvent=event.Get();}
    };
    struct Data final {
        std::wstring name;Held pipe;std::unique_ptr<Io> connect,read;
        std::vector<std::unique_ptr<Io>> unsettled;std::vector<void*> failedClose;
        bool connected=false,closed=false,unknown=false,closeAttempted=false;
        explicit Data(std::wstring n):name(std::move(n)){unsettled.reserve(1);failedClose.reserve(4);}
    };
    std::unique_ptr<Data> data_;
    bool Settle(Io& io,bool cancel)noexcept {
        if(!io.pending)return true;
        if(cancel&&!io.cancelled){io.cancelled=true;if(!CancelIoEx(data_->pipe.Get(),&io.overlapped)&&GetLastError()!=ERROR_NOT_FOUND)return false;}
        const auto wait=WaitForSingleObject(io.event.Get(),1000);if(wait!=WAIT_OBJECT_0)return false;
        DWORD bytes=0;if(!GetOverlappedResult(data_->pipe.Get(),&io.overlapped,&bytes,FALSE)&&GetLastError()!=ERROR_OPERATION_ABORTED)return false;
        io.pending=false;return true;
    }
    bool CloseHandleOnce(Held& held)noexcept {
        if(!held.Valid())return true;void* exact=held.Take();if(CloseHandle(exact))return true;
        data_->failedClose.push_back(exact);data_->unknown=true;return false;
    }
public:
    TrustedPipe(const std::wstring& name,const std::wstring& sid):data_(std::make_unique<Data>(name)){
        try{data_->connect=std::make_unique<Io>();data_->read=std::make_unique<Io>();
            const std::wstring sddl=L"D:P(A;;GA;;;"+sid+L")";PSECURITY_DESCRIPTOR descriptor=nullptr;
            if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(),SDDL_REVISION_1,&descriptor,nullptr))Refuse("trusted_pipe_acl_refused",GetLastError());
            SECURITY_ATTRIBUTES security{sizeof(security),descriptor,FALSE};data_->pipe=Held(CreateNamedPipeW(name.c_str(),
                PIPE_ACCESS_DUPLEX|FILE_FLAG_FIRST_PIPE_INSTANCE|FILE_FLAG_OVERLAPPED,PIPE_TYPE_MESSAGE|PIPE_READMODE_MESSAGE|PIPE_WAIT|PIPE_REJECT_REMOTE_CLIENTS,
                1,4096,4096,0,&security));const auto error=GetLastError();LocalFree(descriptor);
            if(!data_->pipe.Valid())Refuse("trusted_pipe_original_create_refused",error);
            const auto connected=ConnectNamedPipe(data_->pipe.Get(),&data_->connect->overlapped);
            if(connected)data_->connected=true;else{const auto e=GetLastError();if(e==ERROR_PIPE_CONNECTED)data_->connected=true;
                else if(e==ERROR_IO_PENDING)data_->connect->pending=true;else Refuse("trusted_pipe_original_connect_refused",e);}
        }catch(...){data_->unknown=true;(void)data_.release();throw;}
    }
    ~TrustedPipe(){if(data_&&!CloseOnce())(void)data_.release();}
    bool PollConnect(){auto& d=*data_;if(d.closed||d.unknown)return false;if(d.connected)return true;DWORD count=0;
        if(!d.connect->pending)return false;if(GetOverlappedResult(d.pipe.Get(),&d.connect->overlapped,&count,FALSE)){d.connect->pending=false;d.connected=true;return true;}
        const auto error=GetLastError();if(error==ERROR_IO_INCOMPLETE)return false;
        if(error!=ERROR_OPERATION_ABORTED&&error!=ERROR_BROKEN_PIPE&&error!=ERROR_NO_DATA){d.unknown=true;return false;}
        d.connect->pending=false;d.closed=true;return false;
    }
    bool PollBytes(Bytes& bytes){auto& d=*data_;if(!d.connected||d.closed||d.unknown)return false;auto& io=*d.read;DWORD count=0;
        if(!io.pending){io.overlapped={};io.overlapped.hEvent=io.event.Get();ResetEvent(io.event.Get());
            if(ReadFile(d.pipe.Get(),io.bytes.data(),static_cast<DWORD>(io.bytes.size()),&count,&io.overlapped)){bytes.assign(io.bytes.begin(),io.bytes.begin()+count);return true;}
            const auto error=GetLastError();if(error==ERROR_IO_PENDING){io.pending=true;return false;}
            d.closed=true;if(error!=ERROR_BROKEN_PIPE&&error!=ERROR_NO_DATA)d.unknown=true;return false;}
        if(GetOverlappedResult(d.pipe.Get(),&io.overlapped,&count,FALSE)){io.pending=false;bytes.assign(io.bytes.begin(),io.bytes.begin()+count);return true;}
        const auto error=GetLastError();if(error==ERROR_IO_INCOMPLETE)return false;d.closed=true;
        if(error!=ERROR_OPERATION_ABORTED&&error!=ERROR_BROKEN_PIPE&&error!=ERROR_NO_DATA){d.unknown=true;return false;}
        io.pending=false;return false;
    }
    bool SendBytes(const Bytes& bytes){auto& d=*data_;if(!d.connected||d.closed||d.unknown||bytes.empty()||bytes.size()>4096)return false;
        auto io=std::make_unique<Io>();std::copy(bytes.begin(),bytes.end(),io->bytes.begin());DWORD count=0;
        if(!WriteFile(d.pipe.Get(),io->bytes.data(),static_cast<DWORD>(bytes.size()),&count,&io->overlapped)){
            if(GetLastError()!=ERROR_IO_PENDING){d.closed=true;d.unknown=true;d.unsettled.push_back(std::move(io));return false;}io->pending=true;
            const auto wait=WaitForSingleObject(io->event.Get(),1000);
            if(wait!=WAIT_OBJECT_0){d.closed=true;d.unknown=true;Settle(*io,true);d.unsettled.push_back(std::move(io));return false;}
            if(!GetOverlappedResult(d.pipe.Get(),&io->overlapped,&count,FALSE)){d.closed=true;d.unknown=true;io->pending=false;d.unsettled.push_back(std::move(io));return false;}io->pending=false;
        }
        if(count!=bytes.size()){d.closed=true;d.unknown=true;d.unsettled.push_back(std::move(io));return false;}
        if(!CloseHandleOnce(io->event)){d.closed=true;return false;}return true;
    }
    bool CloseOnce()noexcept{auto& d=*data_;if(d.closeAttempted)return !d.unknown;d.closeAttempted=true;d.closed=true;
        if(d.unknown||!d.unsettled.empty()||!Settle(*d.connect,true)||!Settle(*d.read,true)){d.unknown=true;return false;}
        const bool pipe=CloseHandleOnce(d.pipe);if(!pipe)return false;
        const bool connect=CloseHandleOnce(d.connect->event),read=CloseHandleOnce(d.read->event);return connect&&read&&!d.unknown;
    }
    bool Closed()const noexcept{return data_->closed;}
    bool Connected()const noexcept{return data_->connected;}
    bool Unknown()const noexcept{return data_->unknown;}
    void* Handle()const noexcept{return data_->pipe.Get();}
    const std::wstring& Name()const noexcept{return data_->name;}
};
#endif
class OriginalController final {
public:
    OriginalController(void* pipe,const reviewed::Profile& p){ULONG pid=0;if(!GetNamedPipeClientProcessId(pipe,&pid)||!pid)Refuse("controller_peer_query_failed",GetLastError());original_=Held(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,pid));if(!original_.Valid())Refuse("original_controller_open_failed",GetLastError());pid_=pid;birth_=detail::ProcessBirth(original_.Get());sid_=detail::ProcessSid(original_.Get());image_=detail::ProcessImage(original_.Get());if(sid_!=p.userSid||image_!=p.controllerImage.pin.canonicalPath||!detail::ProcessLive(original_.Get()))Refuse("controller_peer_binding_refused");ULONG still=0;if(!GetNamedPipeClientProcessId(pipe,&still)||still!=pid_||detail::ProcessBirth(original_.Get())!=birth_)Refuse("controller_peer_race");}
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    OriginalController(Held original,const reviewed::Profile& p):original_(std::move(original)){
        if(!original_.Valid())Refuse("trusted_original_controller_required");pid_=GetProcessId(original_.Get());birth_=detail::ProcessBirth(original_.Get());
        sid_=detail::ProcessSid(original_.Get());image_=detail::ProcessImage(original_.Get());
        if(!pid_||!birth_||sid_!=p.userSid||image_!=p.controllerImage.pin.canonicalPath||!Current())Refuse("trusted_original_controller_identity_refused");
    }
    bool Current()const{try{return original_.Valid()&&detail::ProcessLive(original_.Get())&&GetProcessId(original_.Get())==pid_&&
        detail::ProcessBirth(original_.Get())==birth_&&detail::ProcessSid(original_.Get())==sid_&&detail::ProcessImage(original_.Get())==image_;}catch(...){return false;}}
    void* BorrowedOriginalProcess()const noexcept{return original_.Get();}
#endif
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
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    struct Trusted;
    static int RunTrustedFixed();
#endif
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
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
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
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
namespace {
void TrustedPayload(phase::Frame& frame,const Bytes& bytes){if(bytes.size()>phase::kMaximumPayloadBytes)Refuse("trusted_payload_bound");
    frame.header.payloadBytes=static_cast<std::uint32_t>(bytes.size());std::copy(bytes.begin(),bytes.end(),frame.payload.begin());}
Bytes TrustedStatus(State state,const Id& session){Bytes bytes;detail::PutU16(bytes,static_cast<std::uint16_t>(state));Put(bytes,session);return bytes;}
Digest TrustedHash(const char* domain,const Bytes& fields){Bytes bytes;for(const char* at=domain;*at;++at)bytes.push_back(static_cast<unsigned char>(*at));bytes.push_back(0);Put(bytes,fields);return detail::Hash(bytes);}
template<std::size_t N>std::array<unsigned char,N> TrustedField(const phase::Frame& frame,std::size_t at){
    if(at+N>frame.header.payloadBytes)Refuse("trusted_field_bounds");std::array<unsigned char,N> value{};std::copy_n(frame.payload.begin()+static_cast<std::ptrdiff_t>(at),N,value.begin());return value;}
std::uint64_t TrustedNumber(const phase::Frame& frame,std::size_t at,std::size_t width){if(width>8||at+width>frame.header.payloadBytes)Refuse("trusted_number_bounds");
    std::uint64_t value=0;for(std::size_t i=0;i<width;++i)value|=static_cast<std::uint64_t>(frame.payload[at+i])<<(i*8);return value;}
Bytes TrustedCall(const phase::CallReply& call){Bytes bytes;Put(bytes,call.callRef);Put(bytes,call.ingressNonce);detail::PutU64(bytes,call.expiresMono);Put(bytes,call.bindingHash);return bytes;}
Bytes TrustedHandler(const phase::HandlerReply& handler){Bytes bytes;Put(bytes,handler.permitRef);Put(bytes,handler.permitNonce);detail::PutU64(bytes,handler.expiresMono);Put(bytes,handler.bindingHash);return bytes;}
}
struct Broker::Data::Trusted final : Broker::Data {
    std::shared_ptr<production::OriginalSealWitness> originalSeal;
    std::unique_ptr<trusted_read::Bootstrap> inherited;
    std::unique_ptr<OriginalController> originalController;
    Held originalSelf;std::uint64_t originalSelfBirth=0;std::wstring originalSelfImage,originalSelfSid;
    std::unique_ptr<TrustedPipe> controlled,worker;
    std::unique_ptr<phase::WireChannel> controlWire,workerWire;
    phase::VolatileServerLedger ledger;
    NativeDispatchCommit::Lifetime effects;
    Id session=detail::RandomId(),brokerInstance=detail::RandomId(),launchRef=detail::RandomId();
    Digest controllerWitness{},daemonWitness{},transportBinding{},lifecycleBinding{};
    std::uint64_t lastMono=0;bool opened=false,runtimeBound=false,daemonBound=false,journalStarted=false;
    bool drainRequested=false,shutdownSent=false,shutdownAcknowledged=false;
    struct Challenge {Id ref{},target{};phase::ChallengePurpose purpose=phase::ChallengePurpose::Readiness;
        std::uint64_t issued=0,ordinal=0;bool pending=false;};
    Challenge challenge;phase::VolatileServerLedger::ReadObservation observation{};
    Digest observationTransport{},observationSnapshot{};Id observationActor{};std::uint64_t observationGeneration=0,lastObservationOrdinal=0;
    bool sameActor=false,panelEffectSpent=false;phase::Frame deferredController{};bool controllerDeferred=false;
    struct Project {enum class Stage:std::uint8_t{Bound,Selected,Guarded,Delivered,Terminal,Unknown};
        Id ref{},nonce{},handler{},command{},execution{},lease{},delivery{},deliveryNonce{},lateNonce{};
        Digest script{},body{},leaf{},binding{},selection{},guard{},receipt{},result{};
        std::uint64_t expiry=0,ordinal=0;bool inspection=false,preparationDelivery=false,executionDelivery=false;
        Id executionAuthority{};std::uint16_t variantSlot=0,effectOperation=2;bool nativeFile=false;Stage stage=Stage::Bound;NativeDispatchCommit::Observation note{};
        std::unique_ptr<NativeDispatchCommit> commit;};
    std::vector<std::unique_ptr<Project>> projects;
    // These are actual source-bound preparation terminals, not D46 authorities.
    // A scope is never recycled, and caller C5 hashes cannot mark it prepared.
    Digest preparedBuild{};bool preparationFailed=false;
    struct PreparedScope final {Digest scope{},proposal{},dryRun{};std::uint64_t issued=0;bool failed=false,executionBegun=false;};
    // One whole-manifest Build precedes scoped Propose+dry-run+Execute groups.
    // Group capacity is separately frozen, independent of the Call ceiling.
    std::array<std::unique_ptr<PreparedScope>,trusted_read::kTwoTitlePreparedScopes> preparedScopes{};
    struct ExecutionAuthority final {Id ref{},nonce{},call{},handler{};Digest scope{},proposal{},dryRun{},project{},leaves{},observation{},binding{};
        std::uint64_t expiry=0;bool consumed=false;};
    std::vector<std::unique_ptr<ExecutionAuthority>> executionAuthorities;
    struct OriginalJobRow final {enum class Stage:std::uint8_t{Armed,Polling,Terminal,Media,Unknown};Stage stage=Stage::Armed;
        Id ref{},startTicket{},handler{},poll{},pollNonce{};Digest hash{},selector{},processWrapper{},startReceipt{},terminalReceipt{},mediaReceipt{},pollBinding{};
        std::uint64_t issued=0,deadline=0,nextOrdinal=1,activeOrdinal=0,nextPollAt=0;std::uint32_t maximumPolls=0;std::uint16_t slot=0;
        Id actor{},terminal{};Digest observationCommit{},terminalJoin{},reservation{};
        bool pollAttempted=false,terminalAttempted=false,mediaReserved=false;
        struct PollAttempt final {Id ref{},nonce{};Digest input{},binding{};std::uint64_t ordinal=0,expiry=0;bool observed=false;
            std::array<std::unique_ptr<NativeDispatchCommit>,2> commits{};std::array<NativeDispatchCommit::Observation,2> notes{};};
        std::vector<std::unique_ptr<PollAttempt>> polls;
        std::array<std::unique_ptr<NativeDispatchCommit>,7> terminalCommits{};
        std::array<NativeDispatchCommit::Observation,7> terminalNotes{};
        std::array<Digest,6> mediaKeys{};
        std::uint64_t reservationSequence=0,reservationEpoch=0;Digest reservationHead{};};
    std::array<std::unique_ptr<OriginalJobRow>,2> originalJobs{};
    struct RestoreDebt final {enum class State:std::uint8_t{Selected,StageTerminal,Restored,Unknown};State state=State::Selected;Id stageTicket{},actor{};Digest scope{},stageResult{},stageReceipt{};std::uint16_t slot=0;};
    std::array<std::unique_ptr<RestoreDebt>,2> restoreDebts{};
    struct RestrictedRead final {Id readRef{},bracket{},stageTicket{},projectTicket{};Digest readHash{},scope{},stageResult{},projectResult{};std::uint64_t epoch=0;std::uint16_t slot=0;};
    std::vector<RestrictedRead> restrictedReads;Id restorationBracket{};std::uint16_t restorationBracketSlot=0;
    std::uint16_t EligibleRestoreBracket()const{std::uint16_t selected=0;for(const auto& debt:restoreDebts){if(!debt||debt->state==RestoreDebt::State::Restored)continue;if(selected||debt->state!=RestoreDebt::State::StageTerminal||debt->actor!=actor||detail::Zero(debt->stageResult)||detail::Zero(debt->stageReceipt))Refuse("trusted_restore_bracket_debt_unknown");selected=debt->slot;}
        if(selected){for(const auto& job:originalJobs)if(job&&job->stage!=OriginalJobRow::Stage::Media)Refuse("trusted_restore_bracket_job_media_not_quiescent");
            // A known enqueue without its completed media-bound START cannot
            // be hidden by the absence of a D47 row; no renew between them.
            for(const auto& ticket:projects)if(ticket->executionDelivery&&ticket->variantSlot==selected&&ticket->effectOperation==static_cast<std::uint16_t>(trusted_read::ExecutionLeaf::EnqueueAme)){
                if(!originalJobs[selected-1]||originalJobs[selected-1]->stage!=OriginalJobRow::Stage::Media)Refuse("trusted_restore_bracket_enqueue_start_pending");}}
        return selected;
    }
    const RestrictedRead* Restriction(const Digest& hash)const noexcept{for(const auto& value:restrictedReads)if(value.readHash==hash)return &value;return nullptr;}

    struct CleanupPrefix final {
        Held journal;std::array<Held,256> slots{};std::array<void*,257> failedClose{};
        ObjectPin journalPin;std::array<ObjectPin,256> pins{};FloorSnapshot floor;
        bool acquired=false,releaseAttempted=false,released=false,unknown=false;
        ~CleanupPrefix(){if(!released){(void)journal.Take();for(auto& slot:slots)(void)slot.Take();}}
        bool SameHeld()const noexcept{try{if(!acquired||released||unknown||releaseAttempted||floor.pending.exists||floor.sequence>256||
                !journal.Valid()||!detail::SamePin(detail::ReadPin(journal.Get(),true),journalPin))return false;
            for(std::size_t i=0;i<static_cast<std::size_t>(floor.sequence);++i)if(!slots[i].Valid()||!detail::SamePin(detail::ReadPin(slots[i].Get(),false),pins[i])||
                pins[i].fileId!=floor.originalSlotIds[i]||ReadOriginalSlot(slots[i].Get(),i+1).hash!=floor.originalFrameHashes[i])return false;
            return true;
        }catch(...){return false;}}
        bool ReleaseOnce()noexcept{if(releaseAttempted)return released&&!unknown;releaseAttempted=true;
            for(std::size_t i=0;i<static_cast<std::size_t>(floor.sequence);++i){if(!slots[i].Valid()){unknown=true;return false;}void* original=slots[i].Take();
                if(!CloseHandle(original)){failedClose[i]=original;unknown=true;return false;}}
            if(!journal.Valid()){unknown=true;return false;}void* original=journal.Take();if(!CloseHandle(original)){failedClose[256]=original;unknown=true;return false;}
            released=true;return true;
        }
    };
    std::unique_ptr<CleanupPrefix> cleanupPrefix;
    void HoldCleanupPrefix(){if(cleanupPrefix||drainSent||drainAcknowledged||!WorkerCurrent(true))Refuse("trusted_cleanup_prefix_once_refused",0,true);
        cleanupPrefix=std::make_unique<CleanupPrefix>();auto& retained=*cleanupPrefix;retained.floor=continuity->Floor();
        if(retained.floor.pending.exists||retained.floor.sequence>256||retained.floor.originalSlotIds.size()!=retained.floor.sequence||
            retained.floor.originalFrameHashes.size()!=retained.floor.sequence)Refuse("trusted_cleanup_prefix_floor_refused",0,true);
        retained.journal=detail::Relative(enrollment->BorrowedRuntime(),L"journal",true,false,false,false,true);retained.journalPin=detail::ReadPin(retained.journal.Get(),true);
        if(!detail::SamePin(retained.journalPin,enrollment->Profile().journal))Refuse("trusted_cleanup_original_journal_refused",0,true);
        for(std::size_t i=0;i<static_cast<std::size_t>(retained.floor.sequence);++i){retained.slots[i]=detail::Relative(retained.journal.Get(),SlotName(i+1),false,false,false,false,true);
            retained.pins[i]=detail::ReadPin(retained.slots[i].Get(),false);if(retained.pins[i].fileId!=retained.floor.originalSlotIds[i]||
                ReadOriginalSlot(retained.slots[i].Get(),i+1).hash!=retained.floor.originalFrameHashes[i])Refuse("trusted_cleanup_original_prefix_refused",0,true);}
        retained.acquired=true;if(!retained.SameHeld()||!WorkerCurrent(true))Refuse("trusted_cleanup_prefix_late_guard_refused",0,true);
    }
    bool CleanupPrefixCurrent()const noexcept{if(!cleanupPrefix||!cleanupPrefix->SameHeld())return false;const auto& original=cleanupPrefix->floor;const auto& now=continuity->Floor();
        return !now.pending.exists&&now.sequence==original.sequence&&now.epoch==original.epoch&&now.head==original.head&&now.genesis==original.genesis&&now.owner==original.owner&&
            now.scope==original.scope&&now.originalSlotIds==original.originalSlotIds&&now.originalFrameHashes==original.originalFrameHashes;}
    void InitializeTrusted(){Result accepted;originalSeal=production::OriginalSealWitness::OpenFixed(accepted);
        if(!originalSeal)Refuse(accepted.code.c_str(),accepted.win32Error,accepted.unknown,accepted.unavailable);
        // Receive and check the actual original inherited MCP object first.
        // No journal/fence creation or first-peer PID adoption precedes this.
        projects.reserve(phase::kLifetimeCallRows);inherited=std::make_unique<trusted_read::Bootstrap>(trusted_read::ReceiveBootstrapFixed(trusted_read::Role::Controller));
        enrollment=InstalledEnrollment::OpenProductionFixed(originalSeal,accepted);
        if(!enrollment)Refuse(accepted.code.c_str(),accepted.win32Error,accepted.unknown,accepted.unavailable);
        originalController=std::make_unique<OriginalController>(std::move(inherited->originalPeer),enrollment->Profile());controllerNonce=inherited->bindings.channelNonce;
        HANDLE self=nullptr;if(!DuplicateHandle(GetCurrentProcess(),GetCurrentProcess(),GetCurrentProcess(),&self,PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,0))
            Refuse("trusted_broker_original_self_duplicate_failed",GetLastError());originalSelf=Held(self);originalSelfBirth=detail::ProcessBirth(originalSelf.Get());
        originalSelfSid=detail::ProcessSid(originalSelf.Get());originalSelfImage=detail::ProcessImage(originalSelf.Get());
        if(!SelfCurrent()||originalSelfImage!=originalSeal->ArtifactFile(production::ArtifactRole::Broker).pin.canonicalPath||
            originalSelfSid!=enrollment->Profile().userSid||detail::Zero(controllerNonce))Refuse("trusted_broker_original_self_refused");
        initial_fence::Result fenced;factory=initial_fence::Factory::CreateInstalledFactory(*enrollment,fenced);
        if(!factory||!factory->OpenRoot(root,fence).ok||!factory->TryAcquire(root,fence).ok)Refuse("trusted_broker_original_fence_refused");
        continuity=std::unique_ptr<ContinuityPort>(new ContinuityPort(*enrollment,*factory,root,fence));initial_durability::Result stored;
        store=initial_durability::Store::CreateInstalledStore(*enrollment,*continuity,*factory,root,fence,stored);
        if(!store)Refuse(stored.code.c_str(),stored.win32Error,stored.unknown,stored.unavailable);
        stored=store->Inspect();if(!stored.ok||stored.unknown||stored.unavailable||stored.current.sequence||stored.current.epoch||!detail::Zero(stored.current.head))
            Refuse("trusted_broker_nonempty_root_unavailable",stored.win32Error,stored.unknown,true);cas=stored.current;
        controlled=std::make_unique<TrustedPipe>(PipeName(enrollment->LaunchKey(),controllerNonce,L"controller"),enrollment->Profile().userSid);
        worker=std::make_unique<TrustedPipe>(PipeName(enrollment->LaunchKey(),daemonNonce,L"daemon"),enrollment->Profile().userSid);
        controlWire=std::make_unique<phase::WireChannel>(phase::Direction::ControllerToBroker,inherited->bindings,phase::BindingStage::BeforeOpen);
        if(!OriginalFloor(false))Refuse("trusted_broker_initial_floor_refused");
        trusted_read::SendBrokerBootstrapFixed(*inherited,controlled->Name(),controllerNonce);
    }
    bool SelfCurrent()const noexcept{try{return originalSelf.Valid()&&originalSelfBirth&&detail::ProcessLive(originalSelf.Get())&&
        GetProcessId(originalSelf.Get())==GetCurrentProcessId()&&detail::ProcessBirth(originalSelf.Get())==originalSelfBirth&&
        detail::ProcessSid(originalSelf.Get())==originalSelfSid&&detail::ProcessImage(originalSelf.Get())==originalSelfImage;}catch(...){return false;}}
    bool OriginalFloor(bool lifecycle)noexcept{try{const auto now=GetTickCount64();if(now<lastMono||unknownDisposition||!SelfCurrent()||!originalSeal||!originalSeal->Fresh()||
            !enrollment||!Guard()||!continuity->MatchesBinding(*enrollment,*factory,root,fence))return false;lastMono=now;
        const auto& floor=continuity->Floor();if(floor.pending.exists||floor.sequence!=cas.sequence||floor.epoch!=cas.epoch||floor.head!=cas.head||floor.scope!=enrollment->Scope())return false;
        if(lifecycle)return daemon&&daemon->LifecycleEffectAllowed();
        return !controllerRevoked&&originalController&&originalController->Current()&&(!opened||now<sessionDeadline);
    }catch(...){return false;}}
    bool ControllerCurrent()noexcept{return controlled&&controlled->Connected()&&!controlled->Closed()&&!controlled->Unknown()&&
        originalController&&originalController->Live(controlled->Handle())&&OriginalFloor(false);}
    bool WorkerCurrent(bool lifecycle=false)noexcept{try{if(!runtimeBound||!daemon||!worker||!worker->Connected()||worker->Closed()||worker->Unknown()||
            !daemon->MatchesPeer(worker->Handle())||!OriginalFloor(lifecycle))return false;
        return !daemonBound||(daemon->OriginalInstance()==ledger.daemon_.originalInstance&&daemonNonce==ledger.daemon_.privateChannel&&
            daemon->PhaseWitness(worker->Handle(),session,daemonNonce)==daemonWitness);
    }catch(...){return false;}}
    static bool Refresh(void* pointer,std::uint64_t& now)noexcept{try{auto& d=*static_cast<Trusted*>(pointer);
        if(!d.ControllerCurrent()||(d.daemonBound&&!d.WorkerCurrent()))return false;now=GetTickCount64();return now>=d.lastMono&&now<d.sessionDeadline;
    }catch(...){return false;}}
    static bool Random(void* pointer,Id& id)noexcept{try{auto& d=*static_cast<Trusted*>(pointer);if(!d.ControllerCurrent()||(d.daemonBound&&!d.WorkerCurrent()))return false;
        id=detail::RandomId();return !detail::Zero(id);}catch(...){return false;}}
    void StartJournal(){if(journalStarted||opened||cas.sequence||!ControllerCurrent())Refuse("trusted_c1_once_refused");journalStarted=true;
        const auto genesis=store->InitializeGenesis({});cas=genesis.current;if(!genesis.ok||genesis.unknown||genesis.unavailable)Refuse("trusted_c1_genesis_unknown",genesis.win32Error,true);
        if(!ControllerCurrent())Refuse("trusted_c1_genesis_late_guard_unknown",0,true);const auto owner=store->AcquireOwnerEpoch(cas);cas=owner.current;
        if(!owner.ok||owner.unknown||owner.unavailable||!ControllerCurrent())Refuse("trusted_c1_owner_unknown",owner.win32Error,true);
    }
    phase::Frame Reply(const phase::Frame& request,bool controllerPeer,phase::Status status){auto& wire=controllerPeer?*controlWire:*workerWire;
        if(wire.outgoingOrdinal_==std::numeric_limits<std::uint64_t>::max())Refuse("trusted_reply_ordinal_unknown",0,true);
        phase::Frame reply{};reply.header.direction=controllerPeer?phase::Direction::BrokerToController:phase::Direction::BrokerToDaemon;
        reply.header.kind=phase::FrameKind::Reply;reply.header.verb=request.header.verb;reply.header.status=status;
        reply.header.senderOrdinal=wire.outgoingOrdinal_+1;reply.header.replyToOrdinal=request.header.senderOrdinal;
        reply.header.channelNonce=wire.bindings_.channelNonce;reply.header.sessionRef=wire.bindings_.sessionRef;
        reply.header.generation=wire.bindings_.generation;reply.header.bootNonce=wire.bindings_.bootNonce;return reply;
    }
    void Send(phase::Frame& frame,bool controllerPeer,bool admitted,bool lifecycle=false){auto& wire=controllerPeer?*controlWire:*workerWire;auto& pipe=controllerPeer?*controlled:*worker;
        std::array<unsigned char,phase::kMaximumFrameBytes> bytes{};std::size_t count=0;
        if(phase::EncodeFrame(frame,bytes.data(),bytes.size(),count)!=phase::CodecError::None||wire.TrackOutgoing(frame)!=phase::CodecError::None)
            Refuse("trusted_send_codec_unknown",0,true);
        if(admitted&&!(controllerPeer?ControllerCurrent():WorkerCurrent(lifecycle)))Refuse("trusted_send_last_guard_unknown",0,true);
        if(!pipe.SendBytes(Bytes(bytes.begin(),bytes.begin()+static_cast<std::ptrdiff_t>(count))))Refuse("trusted_send_once_unknown",0,true);
    }
    void Open(const phase::Frame& request){if(opened||openedAt||state!=State::Closed||!ControllerCurrent())Refuse("trusted_c1_once_refused");StartJournal();
        openedAt=GetTickCount64();const auto limit=enrollment->Profile().maximumSessionMs;
        if(limit!=kMaximumSessionMs||openedAt>std::numeric_limits<std::uint64_t>::max()-limit)Refuse("trusted_c1_fixed_deadline_refused",0,true);sessionDeadline=openedAt+limit;
        controllerWitness=originalController->PhaseWitness(controlled->Handle(),controllerNonce,enrollment->Profile().controllerImage.sha256);
        Bytes transport;Put(transport,controllerNonce);Put(transport,controllerWitness);Put(transport,brokerInstance);Put(transport,enrollment->LaunchKey());
        transportBinding=TrustedHash("lcp2.production.original-controller-transport.v1",transport);const auto scope=enrollment->Scope();
        auto reply=Reply(request,true,phase::Status::Ok);Bytes payload;Put(payload,session);detail::PutU64(payload,openedAt);detail::PutU64(payload,sessionDeadline);
        Put(payload,enrollment->Profile().policyHash);detail::PutU64(payload,enrollment->Profile().policyEpoch);detail::PutU64(payload,0);Put(payload,controllerWitness);Put(payload,transportBinding);Put(payload,scope);
        TrustedPayload(reply,payload);Send(reply,true,true);
        phase::VolatileServerLedger::NativeBinding binding{};binding.session={controllerNonce,session,{},{}};binding.brokerInstance=brokerInstance;
        binding.installation=enrollment->Profile().installation;binding.lineage=enrollment->Profile().lineage;binding.scopeHash=scope;
        binding.policyHash=enrollment->Profile().policyHash;binding.transportHash=transportBinding;binding.sourceHash=enrollment->Profile().sourceSetHash;
        binding.openedMono=openedAt;binding.deadline=sessionDeadline;binding.policyEpoch=enrollment->Profile().policyEpoch;
        if(!ControllerCurrent()||!ledger.InitializeNative(binding,{this,Refresh,Random},originalController->Instance(),controllerWitness)||
            !controlWire->BindOpened(reply,session,scope))Refuse("trusted_c1_binding_unknown",0,true);opened=true;state=State::SessionOpen;
    }
    void Launch(const phase::Frame& request){if(!opened||runtimeBound||daemon||state!=State::SessionOpen||!ControllerCurrent())Refuse("trusted_launch_once_refused");
        initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;record.effect=initial_durability::EffectClass::Launch;record.target=enrollment->Profile().launchTarget;
        const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;
        if(!consumed.ok||consumed.unknown||consumed.unavailable||!consumed.consumptionRecorded||consumed.persistence!="os_flush_ack_and_readback")
            Refuse("trusted_launch_consumed_unknown",consumed.win32Error,true);launchRecord=consumed.recordHash;state=State::LaunchReserved;
        auto lifecycle=PreparedLifecycleGrant::Prepare(generation,bootNonce,launchRecord,sessionDeadline);lifecycleBinding=lifecycle->BindingHash();
        if(!ControllerCurrent())Refuse("trusted_launch_late_guard_unknown",0,true);Result launched;
        daemon=OriginalDaemon::Launch(*enrollment,generation,bootNonce,daemonNonce,worker->Name(),session,originalController->BorrowedOriginalProcess(),std::move(lifecycle),launched);
        if(!daemon||!launched.ok)Refuse("trusted_original_launch_unknown",launched.win32Error,true);state=State::TargetHeld;
        auto reply=Reply(request,true,phase::Status::Ok);Bytes payload;payload.push_back(1);Put(payload,launchRef);Put(payload,launchRecord);
        detail::PutU64(payload,cas.sequence);detail::PutU64(payload,cas.epoch);Put(payload,cas.head);Put(payload,generation);Put(payload,bootNonce);Put(payload,lifecycleBinding);
        TrustedPayload(reply,payload);Send(reply,true,true);
        if(!ControllerCurrent()||!controlWire->AttachRuntime(reply,generation,bootNonce)||!ledger.AttachNativeRuntime(generation,bootNonce))Refuse("trusted_runtime_binding_unknown",0,true);
        workerWire=std::make_unique<phase::WireChannel>(phase::Direction::DaemonToBroker,phase::WireBindings{daemonNonce,session,generation,bootNonce},phase::BindingStage::Open);runtimeBound=true;
    }
    void Boot(const phase::Frame& request){if(daemonBound||state!=State::TargetHeld||!WorkerCurrent()||request.header.payloadBytes!=32||
            !std::equal(enrollment->Profile().sourceSetHash.begin(),enrollment->Profile().sourceSetHash.end(),request.payload.begin()))Refuse("trusted_d17_original_source_refused");
        daemonWitness=daemon->PhaseWitness(worker->Handle(),session,daemonNonce);
        if(!ledger.AttachNativeDaemon(daemonNonce,daemon->OriginalInstance(),daemonWitness))Refuse("trusted_d17_binding_unknown",0,true);
        Bytes installed;for(const auto& file:trusted_read::EmbeddedProfile().panelFiles){detail::PutPin(installed,file.pin);Put(installed,file.sha256);}
        ledger.panelDefinition_.installedHash=TrustedHash("lcp2.production.installed-panel-closure.v1",installed);
        Bytes definition;Put(definition,ledger.panelDefinition_.installedHash);Put(definition,enrollment->Profile().sourceSetHash);Put(definition,enrollment->Profile().policyHash);
        ledger.panelDefinition_.definitionHash=TrustedHash("lcp2.production.bootstrap-definition.v1",definition);
        daemonBound=true;state=State::RegisteredReadClosed;auto reply=Reply(request,false,phase::Status::Ok);TrustedPayload(reply,TrustedStatus(state,session));Send(reply,false,true);
    }
    bool LedgerIdle(const Id& excluded={})const noexcept{if(effects.unknown||ledger.closed_||controllerDeferred)return false;
        for(const auto& row:ledger.rows_)if(row.state==phase::VolatileServerLedger::RowState::Unknown||
            ((row.state==phase::VolatileServerLedger::RowState::Begun||row.state==phase::VolatileServerLedger::RowState::Verified)&&row.handler.permitRef!=excluded))return false;
        for(const auto& p:projects)if(p->stage!=Project::Stage::Terminal&&p->handler!=excluded)return false;return true;}
    bool ReadCurrent(const Id& target)noexcept{const auto now=GetTickCount64();return everActor&&sameActor&&!challenge.pending&&WorkerCurrent()&&
        ledger.ObservationCurrent(observation,target,now)&&observationActor==actor&&LedgerIdle(target);}
    ExecutionAuthority* Authority(const Id& ref)noexcept{for(auto& row:executionAuthorities)if(row->ref==ref)return row.get();return nullptr;}
    bool ExecutionCurrent(const ExecutionAuthority& authority,bool consumed=true)noexcept{const auto now=GetTickCount64();auto* row=Handler(authority.handler);
        // D46 does not retarget the prior READ observation. Preserve the READ
        // predicate and join EXEC to that exact fresh original observation.
        return row&&authority.consumed==consumed&&row->body.kind==phase::CallKind::Execute&&row->state==phase::VolatileServerLedger::RowState::Verified&&
            row->call.callRef==authority.call&&row->executionScope==authority.scope&&row->call.expiresMono==authority.expiry&&now<authority.expiry&&
            everActor&&sameActor&&!challenge.pending&&WorkerCurrent()&&ledger.ExecutionRowCurrent(*row,now)&&
            ledger.ObservationCurrent(observation,observation.target,now)&&observationActor==actor&&LedgerIdle(authority.handler);}
    bool ProjectCurrent(const Project& ticket)noexcept{if(!ticket.executionDelivery)return ReadCurrent(ticket.handler);
        const auto* authority=Authority(ticket.executionAuthority);return authority&&authority->handler==ticket.handler&&authority->scope==ticket.leaf&&ExecutionCurrent(*authority);}
    void ChallengeTarget(const Id& target,phase::ChallengePurpose purpose){if(challenge.pending||detail::Zero(target))Refuse("trusted_challenge_once_refused");
        const bool completion=purpose==phase::ChallengePurpose::Completion;
        if(!WorkerCurrent(completion))Refuse("trusted_challenge_original_guard_refused");
        if(purpose==phase::ChallengePurpose::ServerGates){phase::VolatileServerLedger::CallRow* row=nullptr;for(auto& candidate:ledger.rows_)if(candidate.call.callRef==target){row=&candidate;break;}
            if(!row||row->body.kind!=phase::CallKind::Execute||row->state!=phase::VolatileServerLedger::RowState::Verified||!ledger.ExecutionRowCurrent(*row,GetTickCount64()))Refuse("trusted_server_gate_challenge_row_refused");}
        else if(completion){OriginalJobRow* job=nullptr;for(auto& original:originalJobs)if(original&&original->ref==target){job=original.get();break;}
            if(!job||job->stage!=OriginalJobRow::Stage::Polling||!job->activeOrdinal||GetTickCount64()>=job->deadline)Refuse("trusted_completion_challenge_row_refused");}
        else if(purpose!=phase::ChallengePurpose::Readiness&&purpose!=phase::ChallengePurpose::SameActor)Refuse("trusted_challenge_purpose_refused");
        challenge={detail::RandomId(),target,purpose,GetTickCount64(),workerWire->outgoingOrdinal_+1,true};if(!completion&&purpose!=phase::ChallengePurpose::ServerGates)sameActor=false;
        phase::Frame event{};event.header.direction=phase::Direction::BrokerToDaemon;event.header.kind=phase::FrameKind::Event;event.header.verb=phase::Verb::ObserveChallenge;
        event.header.senderOrdinal=challenge.ordinal;event.header.channelNonce=daemonNonce;event.header.sessionRef=session;event.header.generation=generation;event.header.bootNonce=bootNonce;
        Bytes bytes;Put(bytes,challenge.ref);detail::PutU16(bytes,static_cast<std::uint16_t>(purpose));Put(bytes,target);TrustedPayload(event,bytes);Send(event,false,true,completion);
    }
    void CloseAdmission(bool unknown)noexcept{if(unknown||effects.unknown||ledger.HasUnresolved()){Unknown();effects.unknown=true;}
        Revoke();ledger.Close();challenge.pending=false;sameActor=false;controllerDeferred=false;}
    void ControllerFrame(const phase::Frame& request){const auto verb=request.header.verb;
        if(verb==phase::Verb::Status){auto reply=Reply(request,true,phase::Status::Ok);TrustedPayload(reply,TrustedStatus(state,opened?session:Id{}));Send(reply,true,false);return;}
        if(verb==phase::Verb::Revoke||verb==phase::Verb::RequestDrain){drainRequested=true;
            // Reply is tracked before revocation. It cannot restore admission.
            auto reply=Reply(request,true,phase::Status::Ok);Bytes bytes=verb==phase::Verb::RequestDrain?Bytes(129,0):TrustedStatus(state,opened?session:Id{});
            if(verb==phase::Verb::RequestDrain){if(!opened||!daemonBound)Refuse("trusted_drain_before_runtime_refused");bytes[0]=1;
                std::copy(launchRef.begin(),launchRef.end(),bytes.begin()+1);std::copy(launchRecord.begin(),launchRecord.end(),bytes.begin()+17);
                for(std::size_t i=0;i<8;++i){bytes[49+i]=static_cast<unsigned char>(cas.sequence>>(i*8));bytes[57+i]=static_cast<unsigned char>(cas.epoch>>(i*8));}
                std::copy(cas.head.begin(),cas.head.end(),bytes.begin()+65);std::copy(lifecycleBinding.begin(),lifecycleBinding.end(),bytes.begin()+97);}
            TrustedPayload(reply,bytes);Send(reply,true,false);CloseAdmission(false);return;}
        if(!ControllerCurrent()||controllerDeferred)Refuse("trusted_controller_admission_refused");
        if(verb==phase::Verb::Open){Open(request);return;}if(verb==phase::Verb::ReserveInitialLaunch){Launch(request);return;}
        if(!daemonBound||!WorkerCurrent())Refuse("trusted_controller_runtime_absent");
        if(verb==phase::Verb::BeginCall){phase::BeginCallPayload body{};phase::CallReply call{};phase::Status status=phase::Status::Denied;
            if(request.header.payloadBytes>=37){body.tool=static_cast<phase::ToolCode>(TrustedNumber(request,0,2));body.kind=static_cast<phase::CallKind>(request.payload[2]);
                body.route=static_cast<phase::RouteCode>(TrustedNumber(request,3,2));body.canonicalBodyHash=TrustedField<32>(request,5);
                if(body.kind==phase::CallKind::ServerOnly&&phase::ReadServerOnlyBegin(request,body)==phase::CodecError::None)status=ledger.Begin(ledger.controller_,body,GetTickCount64(),call);
                else if(body.kind==phase::CallKind::Panel&&phase::ReadPanelBegin(request,body)==phase::CodecError::None&&state==State::RegisteredReadClosed&&!everActor)
                    status=ledger.BeginPanel(ledger.controller_,body,GetTickCount64(),call);
                else if((body.kind==phase::CallKind::BootstrapRead||body.kind==phase::CallKind::Read)&&ReadCurrent(observation.target)){
                    Id bracket{};Digest read{};std::uint8_t index=0;if(body.kind==phase::CallKind::BootstrapRead){bracket=TrustedField<16>(request,37);index=request.payload[53];}
                    else{read=TrustedField<32>(request,37);if(Restriction(read))Refuse("trusted_restoration_read_ordinary_tool_refused");}status=ledger.BeginRead(ledger.controller_,body,bracket,index,read,GetTickCount64(),call);}
                else if(body.kind==phase::CallKind::ExecutionPrep||body.kind==phase::CallKind::Execute){trusted_read::ExecutionCost worst;
                    if(trusted_read::EmbeddedProfile().execution.Validate(worst)&&ReadCurrent(observation.target)){
                        const auto scope=TrustedField<32>(request,37);const auto* restriction=Restriction(TrustedField<32>(request,69));if(restriction){const auto& debt=restoreDebts[restriction->slot-1];if(scope!=restriction->scope||!debt||debt->state!=RestoreDebt::State::StageTerminal||debt->stageTicket!=restriction->stageTicket||debt->stageResult!=restriction->stageResult||restriction->epoch!=ledger.read_.epoch||restriction->readRef!=ledger.read_.ref||EligibleRestoreBracket()!=restriction->slot)Refuse("trusted_restoration_read_exact_scope_refused");}
                        bool admittedScope=body.kind==phase::CallKind::ExecutionPrep&&
                            trusted_read::FixedExecutionScopeAllowed(trusted_read::EmbeddedProfile().execution,body.tool,body.kind,scope)&&!preparationFailed;
                        if(body.kind==phase::CallKind::Execute)for(const auto& original:preparedScopes)if(original&&original->scope==scope&&!original->failed&&!original->executionBegun&&
                            !preparationFailed&&!detail::Zero(preparedBuild)&&!detail::Zero(original->proposal)&&!detail::Zero(original->dryRun)&&
                            trusted_read::FixedExecutionScopeAllowed(trusted_read::EmbeddedProfile().execution,body.tool,body.kind,scope)){admittedScope=true;break;}
                        if(admittedScope){status=ledger.BeginExecution(ledger.controller_,body,scope,TrustedField<32>(request,69),GetTickCount64(),call);
                            if(status==phase::Status::Ok&&body.kind==phase::CallKind::Execute){auto* prepared=Preparation(scope);if(!prepared)Refuse("trusted_preparation_scope_late_unknown",0,true);prepared->executionBegun=true;}}}}}
            auto reply=Reply(request,true,status);if(status==phase::Status::Ok)TrustedPayload(reply,TrustedCall(call));Send(reply,true,status==phase::Status::Ok);return;}
        if(verb==phase::Verb::BeginBracket||verb==phase::Verb::AdoptBracket){if(!everActor||!LedgerIdle()||challenge.pending)Refuse("trusted_bracket_quiescence_refused");const auto restoreSlot=EligibleRestoreBracket();
            if(verb==phase::Verb::BeginBracket){restorationBracketSlot=restoreSlot;restorationBracket={};}else if(restoreSlot!=restorationBracketSlot||(restoreSlot&&TrustedField<16>(request,0)!=restorationBracket))Refuse("trusted_restore_bracket_original_join");
            deferredController=request;controllerDeferred=true;ChallengeTarget(session,phase::ChallengePurpose::Readiness);return;}
        auto reply=Reply(request,true,phase::Status::Unavailable);Send(reply,true,false);
    }
    void FinishDeferred(){if(!controllerDeferred||!ReadCurrentDeferred())return;const auto request=deferredController;controllerDeferred=false;
        auto reply=Reply(request,true,phase::Status::Denied);Bytes bytes;
        if(request.header.verb==phase::Verb::BeginBracket){phase::VolatileServerLedger::Bracket value{};reply.header.status=ledger.BeginReadBracket(ledger.controller_,observation,GetTickCount64(),value);
            if(reply.header.status==phase::Status::Ok){if(restorationBracketSlot)restorationBracket=value.ref;Put(bytes,value.ref);detail::PutU64(bytes,value.deadline);bytes.push_back(value.next);detail::PutU64(bytes,value.epoch);}}
        else{phase::VolatileServerLedger::ReadAuthorization value{};reply.header.status=ledger.AdoptReadBracket(ledger.controller_,TrustedField<16>(request,0),observation,GetTickCount64(),value);
            if(reply.header.status==phase::Status::Ok){if(restorationBracketSlot){const auto slot=EligibleRestoreBracket();if(slot!=restorationBracketSlot||value.originBracket!=restorationBracket||restrictedReads.size()>=12)Refuse("trusted_restore_read_issuance_original_bracket");
                const auto& debt=*restoreDebts[slot-1];Project* middle=nullptr;for(const auto& ticket:projects){const auto* row=Handler(ticket->handler);if(row&&row->bracket==restorationBracket&&row->bracketIndex==2){if(middle)Refuse("trusted_restore_read_project_ambiguous");middle=ticket.get();}}
                if(!middle||middle->stage!=Project::Stage::Terminal||detail::Zero(middle->result))Refuse("trusted_restore_read_actual_middle_terminal_required");RestrictedRead restriction;restriction.readRef=value.ref;restriction.readHash=value.hash;restriction.epoch=value.epoch;restriction.bracket=restorationBracket;restriction.slot=slot;restriction.scope=trusted_read::FixedExecutionScope(trusted_read::EmbeddedProfile().execution,slot,trusted_read::ExecutionLeaf::RestoreBaseline);restriction.stageTicket=debt.stageTicket;restriction.stageResult=debt.stageResult;restriction.projectTicket=middle->ref;restriction.projectResult=middle->result;restrictedReads.push_back(restriction);}
            Put(bytes,value.ref);Put(bytes,value.hash);detail::PutU64(bytes,value.issuedMono);detail::PutU64(bytes,value.expiresMono);detail::PutU64(bytes,value.epoch);}}
        if(reply.header.status==phase::Status::Ok)TrustedPayload(reply,bytes);Send(reply,true,reply.header.status==phase::Status::Ok);
    }
    bool ReadCurrentDeferred()noexcept{const auto pending=controllerDeferred;controllerDeferred=false;const auto ready=ReadCurrent(session);controllerDeferred=pending;return ready;}
    phase::VolatileServerLedger::CallRow* Handler(const Id& ref)noexcept{for(auto& row:ledger.rows_)if(row.state!=phase::VolatileServerLedger::RowState::Empty&&row.handler.permitRef==ref)return &row;return nullptr;}
    PreparedScope* Preparation(const Digest& scope)noexcept{for(auto& original:preparedScopes)if(original&&original->scope==scope)return original.get();return nullptr;}
    Digest PreparationTerminal(const phase::VolatileServerLedger::CallRow& row,const Digest& result,std::uint16_t terminal){Bytes fields;
        Put(fields,row.handler.bindingHash);Put(fields,row.executionScope);Put(fields,result);detail::PutU16(fields,terminal);Put(fields,session);Put(fields,enrollment->Profile().policyHash);
        return TrustedHash("lcp2.production.preparation-terminal.v1",fields);}
    Project& Ticket(const Id& ref){for(auto& p:projects)if(p->ref==ref||p->delivery==ref)return *p;Refuse("trusted_own_project_ticket_refused");}
    static bool CommitGuard(void* pointer)noexcept{auto& d=*static_cast<Trusted*>(pointer);return d.WorkerCurrent()&&!d.effects.unknown;}
    static bool CommitFloor(void* pointer,const initial_durability::Cas& expected,const Digest& record)noexcept{try{auto& d=*static_cast<Trusted*>(pointer);
        if(!d.WorkerCurrent())return false;const auto& f=d.continuity->Floor();return !f.pending.exists&&f.sequence==expected.sequence&&f.epoch==expected.epoch&&
            f.head==expected.head&&f.head==record&&!f.originalFrameHashes.empty()&&f.originalFrameHashes.back()==record;}catch(...){return false;}}
    Bytes EffectAck(const Id& ref,const NativeDispatchCommit::Observation& note,const Id* nonce=nullptr){Bytes bytes;bytes.push_back(1);Put(bytes,ref);Put(bytes,note.recordHash);
        detail::PutU64(bytes,note.sequence);detail::PutU64(bytes,note.epoch);Put(bytes,note.head);if(nonce)Put(bytes,*nonce);return bytes;}
    NativeDispatchCommit::Binding EffectBinding(const Id& command,const Id& execution,const Id& lease,const Digest& authorization,
        const Digest& body,const Digest& script,const Digest& leaf,std::uint16_t operation){NativeDispatchCommit::Binding b{};
        b.broker=brokerInstance;b.installation=enrollment->Profile().installation;b.lineage=enrollment->Profile().lineage;b.session=session;b.generation=generation;b.boot=bootNonce;
        b.command=command;b.execution=execution;b.lease=lease;b.scope=enrollment->Scope();b.runtime=enrollment->Profile().sourceSetHash;
        b.actor=operation==3?ledger.panelDefinition_.installedHash:observation.actor;b.authorization=authorization;b.body=body;b.finalScript=script;b.allowedLeaf=leaf;
        b.target=operation==3?ledger.panelDefinition_.definitionHash:observation.context;Bytes owner;Put(owner,continuity->AcquisitionOwner());b.owner=TrustedHash("lcp2.production.original-owner.v1",owner);
        const auto observed=factory->Observe(root,fence);if(!observed.ok)Refuse("trusted_effect_fence_refused");Bytes original;Put(original,observed.sessionRef);
        b.fence=TrustedHash("lcp2.production.original-fence.v1",original);b.nativeOrdinal=effects.attempts+1;b.operation=operation;return b;
    }
    Digest OriginalPollBinding(const OriginalJobRow& job,const OriginalJobRow::PollAttempt& poll)const{Bytes bytes;Put(bytes,session);Put(bytes,generation);Put(bytes,bootNonce);Put(bytes,job.ref);Put(bytes,job.hash);Put(bytes,job.selector);Put(bytes,job.processWrapper);Put(bytes,job.startReceipt);Put(bytes,job.actor);Put(bytes,poll.ref);Put(bytes,poll.nonce);Put(bytes,poll.input);detail::PutU64(bytes,poll.ordinal);detail::PutU64(bytes,poll.expiry);return TrustedHash("lcp2.production.original-current-poll.v1",bytes);}
    Digest OriginalTerminalJoin(const OriginalJobRow& job,const Digest& receipt,bool successful)const{Bytes bytes;Put(bytes,session);Put(bytes,generation);Put(bytes,bootNonce);Put(bytes,job.ref);Put(bytes,job.hash);Put(bytes,job.selector);Put(bytes,job.processWrapper);Put(bytes,job.startReceipt);Put(bytes,job.actor);Put(bytes,job.poll);Put(bytes,job.pollNonce);Put(bytes,job.pollBinding);detail::PutU64(bytes,job.activeOrdinal);Put(bytes,receipt);return TrustedHash(successful?"lcp2.production.original-successful-terminal.v1":"lcp2.production.original-nonterminal-observation.v1",bytes);}
    void AcceptOriginalTerminalAndReserveMedia(OriginalJobRow& job,const Digest& receipt,const Digest& join){
        const auto& policy=trusted_read::EmbeddedProfile().execution;const auto now=GetTickCount64();auto& start=Ticket(job.startTicket);
        if(job.terminalAttempted||job.mediaReserved||job.stage!=OriginalJobRow::Stage::Polling||job.actor!=actor||join!=OriginalTerminalJoin(job,receipt,true)||detail::Zero(receipt)||
            !OriginalFloor(false)||effects.unknown||effects.attempts>176-7||cas.sequence>256-16-7||now>=job.deadline||job.deadline-now<trusted_read::kTwoTitleMediaMaximumMs||now>=sessionDeadline||sessionDeadline-now<trusted_read::kTwoTitleMediaMaximumMs)
            Refuse("trusted_d49_original_terminal_precharge_closed",0,true);
        // These are minimum restoration reserves; full workflow dynamic fit is
        // a separate CLOSED production gate, never inferred from this floor.
        std::uint64_t restoreExternal=0,restoreStore=0;for(const auto& debt:restoreDebts)if(debt&&debt->state!=RestoreDebt::State::Restored){if(debt->state!=RestoreDebt::State::StageTerminal)Refuse("trusted_d49_restore_debt_unknown",0,true);restoreExternal+=policy.restoration.external;restoreStore+=policy.restoration.store;}
        if(restoreExternal>176-(effects.attempts+7)||restoreStore>256-16-(cas.sequence+7))Refuse("trusted_d49_restoration_reserve_closed",0,true);
        job.terminalAttempted=true;daemon->MarkAdmitted();Bytes chain;Put(chain,job.ref);Put(chain,job.hash);Put(chain,job.pollBinding);Put(chain,receipt);Put(chain,join);
        try{
            for(std::size_t index=0;index<job.terminalCommits.size();++index){
                if(!OriginalFloor(false)||job.actor!=actor||GetTickCount64()>=job.deadline||job.terminalCommits[index])Refuse("trusted_d49_precharge_transition_closed",0,true);
                const auto purpose=static_cast<std::uint16_t>(index+2);auto binding=EffectBinding(start.command,start.execution,start.lease,job.hash,join,
                    index?policy.mediaProducerHash:start.script,trusted_read::FixedOriginalCompletionLeaf(policy,job.slot,purpose),index?std::uint16_t{13}:std::uint16_t{12});binding.variantSlot=job.slot;binding.actor=ledger.panelDefinition_.actorHash;binding.target=job.selector;
                job.terminalCommits[index]=std::unique_ptr<NativeDispatchCommit>(new NativeDispatchCommit(*store,cas,binding,{this,CommitGuard,CommitFloor},effects));
                job.terminalNotes[index]=job.terminalCommits[index]->Commit(NativeDispatchCommit::ProofFault::None);
                const auto& note=job.terminalNotes[index];if(!note.latched||!note.freshAppend||note.unknown||!note.priorFloorVerified||!note.appendAckVerified||note.head!=cas.head||note.sequence!=cas.sequence||note.epoch!=cas.epoch||!OriginalFloor(false))Refuse("trusted_d49_partial_precharge_unknown",0,true);
                Put(chain,note.recordHash);detail::PutU64(chain,note.sequence);detail::PutU64(chain,note.epoch);Put(chain,note.head);
                if(index)job.mediaKeys[index-1]=job.terminalCommits[index]->StableKey();
            }
            if(!OriginalFloor(false)||effects.unknown||GetTickCount64()>=job.deadline)Refuse("trusted_d49_final_precharge_floor_unknown",0,true);
            job.reservation=TrustedHash("lcp2.production.original-six-media-reservation.v1",chain);job.reservationSequence=cas.sequence;job.reservationEpoch=cas.epoch;job.reservationHead=cas.head;
            job.terminal=detail::RandomId();job.terminalReceipt=receipt;job.terminalJoin=join;job.mediaReserved=true;job.stage=OriginalJobRow::Stage::Terminal;
        }catch(...){job.stage=OriginalJobRow::Stage::Unknown;effects.unknown=true;throw;}
    }
    bool LedgerIdleLifecycle()const noexcept{if(effects.unknown||challenge.pending||controllerDeferred||ledger.HasUnresolved())return false;
        for(const auto& p:projects)if(p->stage!=Project::Stage::Terminal)return false;return true;}
    void WorkerFrame(const phase::Frame& request);
    bool Lifecycle();
};
void Broker::Data::Trusted::WorkerFrame(const phase::Frame& request){const auto verb=request.header.verb;
    const bool lifecycle=verb==phase::Verb::DrainAck||verb==phase::Verb::ShutdownAck;
    if(!WorkerCurrent(lifecycle))Refuse("trusted_worker_original_guard_refused",0,true);
    if(verb==phase::Verb::BootHello){Boot(request);return;}
    if(lifecycle){if(!drainSent||TrustedField<16>(request,0)!=stopRef||TrustedField<16>(request,16)!=generation)Refuse("trusted_lifecycle_ack_refused",0,true);
        if(verb==phase::Verb::DrainAck){if(drainAcknowledged||shutdownSent||TrustedField<16>(request,32)!=bootNonce||
                TrustedField<32>(request,48)!=lifecycleBinding||!LedgerIdleLifecycle()||!CleanupPrefixCurrent())Refuse("trusted_drain_ack_quiescence_refused",0,true);drainAcknowledged=true;}
        else{if(!shutdownSent||shutdownAcknowledged||TrustedField<32>(request,32)!=stopRecord)Refuse("trusted_shutdown_ack_refused",0,true);shutdownAcknowledged=true;awaitingOriginalExit=true;}
        auto reply=Reply(request,false,phase::Status::Ok);TrustedPayload(reply,TrustedStatus(state,session));Send(reply,false,true,true);
        // The full native floor has guarded receipt and the actual ACK reply.
        // Only now may the same held prefix close, once, before Stop Append.
        if(verb==phase::Verb::DrainAck&&(!CleanupPrefixCurrent()||!OriginalFloor(true)||!cleanupPrefix->ReleaseOnce()))Refuse("trusted_cleanup_prefix_release_unknown",0,true);return;}
    if(controllerRevoked||unknownDisposition||!daemonBound||drainSent)Refuse("trusted_worker_admission_closed");
    if(verb==phase::Verb::VerifyIngress){phase::VerifyIngressPayload body{};phase::HandlerReply handler{};phase::Status status=phase::Status::Denied;
        body.callRef=TrustedField<16>(request,0);body.ingressNonce=TrustedField<16>(request,16);body.body.tool=static_cast<phase::ToolCode>(TrustedNumber(request,32,2));
        body.body.kind=static_cast<phase::CallKind>(request.payload[34]);body.body.route=static_cast<phase::RouteCode>(TrustedNumber(request,35,2));body.body.canonicalBodyHash=TrustedField<32>(request,37);
        if(body.body.kind==phase::CallKind::ServerOnly&&phase::ReadServerOnlyIngress(request,body)==phase::CodecError::None)status=ledger.Verify(ledger.daemon_,body,GetTickCount64(),handler);
        else if(body.body.kind==phase::CallKind::Panel&&phase::ReadPanelIngress(request,body)==phase::CodecError::None)status=ledger.IssuePanel(ledger.daemon_,body,GetTickCount64(),handler);
        else if(body.body.kind==phase::CallKind::BootstrapRead||body.body.kind==phase::CallKind::Read)status=ledger.VerifyRead(ledger.daemon_,body,GetTickCount64(),handler);
        else if(body.body.kind==phase::CallKind::ExecutionPrep||body.body.kind==phase::CallKind::Execute)status=ledger.IssueExecution(ledger.daemon_,body,GetTickCount64(),handler);
        if(status==phase::Status::Ok&&body.body.kind==phase::CallKind::Panel){panelGrantIssued=true;panelGrantDeadline=ledger.panel_.deadline;}
        const bool readonlyPreparation=body.body.kind==phase::CallKind::ExecutionPrep&&(body.body.tool==phase::ToolCode::GetCompDetails||body.body.tool==phase::ToolCode::GetLayerDetails||body.body.tool==phase::ToolCode::InspectTitleVariants||body.body.tool==phase::ToolCode::InspectAmeTitleSources||body.body.tool==phase::ToolCode::InspectAmeTitleQueueManifest||body.body.tool==phase::ToolCode::RunAiAgentPlan);
        if(status==phase::Status::Ok&&(body.body.kind==phase::CallKind::BootstrapRead||body.body.kind==phase::CallKind::Read||readonlyPreparation))ChallengeTarget(handler.permitRef,phase::ChallengePurpose::Readiness);
        if(status==phase::Status::Ok&&body.body.kind==phase::CallKind::Execute)ChallengeTarget(body.callRef,phase::ChallengePurpose::ServerGates);
        auto reply=Reply(request,false,status);if(status==phase::Status::Ok)TrustedPayload(reply,TrustedHandler(handler));Send(reply,false,status==phase::Status::Ok);return;}
    if(verb==phase::Verb::ObserveServerGates){const auto call=TrustedField<16>(request,0);phase::VolatileServerLedger::CallRow* row=nullptr;
        for(auto& candidate:ledger.rows_)if(candidate.call.callRef==call&&candidate.body.kind==phase::CallKind::Execute){if(row)Refuse("trusted_execution_call_ambiguous",0,true);row=&candidate;}
        const auto now=GetTickCount64();auto* prepared=row?Preparation(row->executionScope):nullptr;
        if(!row||row->state!=phase::VolatileServerLedger::RowState::Verified||!ledger.ExecutionRowCurrent(*row,now)||!prepared||prepared->failed||!prepared->executionBegun||
            !challenge.pending||challenge.purpose!=phase::ChallengePurpose::ServerGates||challenge.target!=call||challenge.ref!=TrustedField<16>(request,16)||
            now<challenge.issued||now-challenge.issued>10000||TrustedNumber(request,192,4)!=trusted_read::kExecutionGateMask||
            TrustedField<32>(request,32)!=prepared->proposal||TrustedField<32>(request,64)!=prepared->dryRun||detail::Zero(TrustedField<32>(request,96))||
            detail::Zero(TrustedField<32>(request,128))||detail::Zero(TrustedField<32>(request,160))||executionAuthorities.size()>=phase::kLifetimeCallRows)
            Refuse("trusted_execution_actual_gates_refused");
        for(const auto& original:executionAuthorities)if(original->call==call||original->handler==row->handler.permitRef)Refuse("trusted_execution_gates_once_refused");
        Bytes actual(request.payload.begin(),request.payload.begin()+196);Put(actual,row->handler.bindingHash);Put(actual,row->executionScope);Put(actual,session);
        Put(actual,enrollment->Profile().policyHash);if(TrustedField<32>(request,196)!=TrustedHash("lcp2.production.actual-server-gates.v1",actual))Refuse("trusted_execution_gate_commitment_refused");
        auto owned=std::make_unique<ExecutionAuthority>();owned->ref=detail::RandomId();owned->nonce=detail::RandomId();owned->call=call;owned->handler=row->handler.permitRef;
        owned->scope=row->executionScope;owned->proposal=prepared->proposal;owned->dryRun=prepared->dryRun;owned->project=TrustedField<32>(request,96);owned->leaves=TrustedField<32>(request,128);
        owned->observation=TrustedField<32>(request,160);owned->expiry=row->call.expiresMono;
        Bytes binding;Put(binding,TrustedField<32>(request,196));Put(binding,owned->ref);Put(binding,owned->nonce);detail::PutU64(binding,owned->expiry);
        owned->binding=TrustedHash("lcp2.production.execution-authority.v1",binding);
        // This transfers the source-bound producer's exact observations. It
        // neither promotes public M100 JSON nor manufactures a new READ lease.
        if(!WorkerCurrent()||!ledger.ExecutionRowCurrent(*row,GetTickCount64()))Refuse("trusted_execution_gates_late_refused");challenge.pending=false;
        auto reply=Reply(request,false,phase::Status::Ok);Bytes bytes;Put(bytes,owned->ref);Put(bytes,owned->nonce);detail::PutU64(bytes,owned->expiry);Put(bytes,owned->binding);
        executionAuthorities.push_back(std::move(owned));TrustedPayload(reply,bytes);Send(reply,false,true);return;}
    if(verb==phase::Verb::ReadySnapshot){const auto now=GetTickCount64();const auto ordinal=TrustedNumber(request,16,8),observed=TrustedNumber(request,168,8),epoch=TrustedNumber(request,256,8);
        const auto target=TrustedField<16>(request,152);if(!challenge.pending||challenge.purpose!=phase::ChallengePurpose::Readiness||
            TrustedField<16>(request,0)!=challenge.ref||target!=challenge.target||now<challenge.issued||now-challenge.issued>10000||
            !ordinal||ordinal<=lastObservationOrdinal||observed>now||now-observed>10000||!epoch||TrustedNumber(request,264,8)!=epoch||
            TrustedNumber(request,272,4)!=kAllQuiescent||TrustedField<32>(request,88)!=enrollment->Profile().sourceSetHash||
            detail::Zero(TrustedField<32>(request,56))||detail::Zero(TrustedField<32>(request,120))||detail::Zero(TrustedField<32>(request,176))||
            detail::Zero(TrustedField<16>(request,208))||detail::Zero(TrustedField<32>(request,224)))Refuse("trusted_readiness_challenge_refused");
        Bytes fields(request.payload.begin()+56,request.payload.begin()+272);Put(fields,challenge.ref);detail::PutU64(fields,ordinal);
        if(TrustedField<32>(request,24)!=TrustedHash("lcp2.production.actor-readiness-snapshot.v1",fields))Refuse("trusted_readiness_binding_refused");
        if(everActor&&(TrustedField<16>(request,208)!=actor||TrustedField<32>(request,56)!=ledger.panelDefinition_.actorHash))Refuse("trusted_actor_readiness_changed");
        if(!everActor&&(target!=ledger.panel_.ref||!panelEffectSpent||ledger.panel_.stage!=phase::VolatileServerLedger::ActorStage::Issued))Refuse("trusted_pre_actor_readiness_refused");
        observation={target,TrustedField<32>(request,56),TrustedField<32>(request,88),TrustedField<32>(request,224),TrustedField<32>(request,120),ordinal,observed,kAllQuiescent};
        observationActor=TrustedField<16>(request,208);observationTransport=TrustedField<32>(request,176);observationSnapshot=TrustedField<32>(request,24);
        observationGeneration=epoch;lastObservationOrdinal=ordinal;challenge.pending=false;
        ChallengeTarget(target,phase::ChallengePurpose::SameActor);auto reply=Reply(request,false,phase::Status::Ok);Bytes bytes;Put(bytes,challenge.ref);detail::PutU64(bytes,ordinal);Put(bytes,observationSnapshot);
        TrustedPayload(reply,bytes);Send(reply,false,true);return;}
    if(verb==phase::Verb::ObserveSameActorState){const auto now=GetTickCount64();if(!challenge.pending||challenge.purpose!=phase::ChallengePurpose::SameActor||
            TrustedField<16>(request,0)!=challenge.ref||TrustedField<16>(request,16)!=challenge.target||challenge.target!=observation.target||
            TrustedField<32>(request,32)!=observation.actor||TrustedField<32>(request,64)!=observation.context||TrustedNumber(request,96,8)!=observation.observedMono||
            TrustedNumber(request,104,8)!=observationGeneration||now<challenge.issued||now-challenge.issued>10000||now<observation.observedMono||now-observation.observedMono>10000)
            Refuse("trusted_same_actor_challenge_refused");challenge.pending=false;sameActor=true;
        auto reply=Reply(request,false,phase::Status::Ok);TrustedPayload(reply,TrustedStatus(state,session));Send(reply,false,true);FinishDeferred();return;}
    if(verb==phase::Verb::ReservePanelEffect){const auto ref=TrustedField<16>(request,0);const auto& profile=trusted_read::EmbeddedProfile();
        if(panelEffectSpent||everActor||state!=State::RegisteredReadClosed||!ledger.PanelRowExact()||ledger.panel_.stage!=phase::VolatileServerLedger::ActorStage::Issued||
            ref!=ledger.panel_.ref||TrustedNumber(request,16,8)!=effects.attempts+1||GetTickCount64()>=ledger.panel_.deadline||
            detail::Zero(profile.panelBootstrapDescriptor)||TrustedField<32>(request,24)!=profile.panelBootstrapDescriptor||detail::Zero(TrustedField<16>(request,56))||!LedgerIdle(ref)||cas.sequence>237)
            Refuse("trusted_bootstrap_descriptor_refused");
        panelEffectSpent=true;daemon->MarkAdmitted();const auto* row=Handler(ref);if(!row)Refuse("trusted_bootstrap_handler_absent",0,true);
        const auto b=EffectBinding(ref,ledger.panel_.nonce,TrustedField<16>(request,56),ledger.panel_.authorizationHash,row->body.canonicalBodyHash,
            profile.panelBootstrapDescriptor,profile.panelBootstrapDescriptor,3);NativeDispatchCommit commit(*store,cas,b,{this,CommitGuard,CommitFloor},effects);
        const auto note=commit.Commit(NativeDispatchCommit::ProofFault::None);if(!note.freshAppend||note.unknown)Refuse("trusted_bootstrap_note_unknown",0,true);
        ChallengeTarget(ref,phase::ChallengePurpose::Readiness);const auto nonce=detail::RandomId();auto reply=Reply(request,false,phase::Status::Ok);TrustedPayload(reply,EffectAck(ref,note,&nonce));Send(reply,false,true);return;}
    if(verb==phase::Verb::FirstActorObserved){phase::FirstActorPayload value{};if(phase::ReadFirstActor(request,value)!=phase::CodecError::None||everActor||!panelEffectSpent||
            !sameActor||challenge.pending||value.grantRef!=ledger.panel_.ref||value.grantNonce!=ledger.panel_.nonce||value.actorRef!=observationActor||
            value.actorHash!=observation.actor||value.installedPanelHash!=ledger.panelDefinition_.installedHash||GetTickCount64()>=ledger.panel_.deadline||cas.sequence>238)
            Refuse("trusted_first_actor_own_observation_refused");
        ledger.panelDefinition_.actorRef=value.actorRef;ledger.panelDefinition_.actorHash=value.actorHash;
        if(!ledger.PanelExact(value))Refuse("trusted_first_actor_binding_refused");ledger.firstActorAttemptSpent_=true;ledger.panel_.stage=phase::VolatileServerLedger::ActorStage::AttemptSpent;
        ledger.panel_.operation=value;daemon->MarkAdmitted();initial_durability::ClosedRecord consume;consume.type=initial_durability::RecordType::Consume;
        consume.effect=initial_durability::EffectClass::Dispatch;consume.target=enrollment->Profile().actorTarget;const auto result=store->AppendOnce(cas,consume);cas=result.current;
        if(!result.ok||result.unknown||!result.consumptionRecorded||result.persistence!="os_flush_ack_and_readback"||!WorkerCurrent())Refuse("trusted_actor_consumed_unknown",0,true);
        ledger.panel_.consumeHash=result.recordHash;ledger.panel_.consumeSequence=cas.sequence;ledger.panel_.stage=phase::VolatileServerLedger::ActorStage::Consumed;
        initial_durability::ClosedRecord note;note.type=initial_durability::RecordType::Note;note.sourceDigest=value.observationHash;note.configDigest=observationSnapshot;
        const auto noted=store->AppendOnce(cas,note);cas=noted.current;if(!noted.ok||noted.unknown||noted.persistence!="os_flush_ack_and_readback"||!WorkerCurrent())Refuse("trusted_actor_note_unknown",0,true);
        ledger.panel_.noteHash=noted.recordHash;ledger.panel_.noteSequence=cas.sequence;ledger.panel_.noteSource=note.sourceDigest;ledger.panel_.noteConfig=note.configDigest;
        ledger.panel_.stage=phase::VolatileServerLedger::ActorStage::Published;actor=value.actorRef;everActor=true;state=State::ActorBound;
        ledger.rows_[ledger.panel_.rowIndex].state=phase::VolatileServerLedger::RowState::ActorObserved;
        auto reply=Reply(request,false,phase::Status::Ok);Bytes bytes;bytes.push_back(1);Put(bytes,ledger.panel_.consumeHash);Put(bytes,ledger.panel_.noteHash);
        detail::PutU64(bytes,ledger.panel_.consumeSequence);detail::PutU64(bytes,ledger.panel_.noteSequence);Put(bytes,cas.head);Put(bytes,ledger.panel_.ref);Put(bytes,actor);
        TrustedPayload(reply,bytes);Send(reply,false,true);ledger.panel_.stage=phase::VolatileServerLedger::ActorStage::ReplySent;return;}
    if(verb==phase::Verb::BindCommand){const auto inputRef=TrustedField<16>(request,0);auto* row=Handler(inputRef);auto* authority=row?nullptr:Authority(inputRef);const auto now=GetTickCount64();
        if(authority)row=Handler(authority->handler);const auto handler=row?row->handler.permitRef:Id{};
        const bool execution=authority&&row&&row->body.kind==phase::CallKind::Execute;
        const bool preparation=row&&row->body.kind==phase::CallKind::ExecutionPrep&&row->body.tool==phase::ToolCode::RunAiAgentPlan;
        const bool ameInspection=row&&row->body.kind==phase::CallKind::ExecutionPrep&&(row->body.tool==phase::ToolCode::InspectAmeTitleSources||row->body.tool==phase::ToolCode::InspectAmeTitleQueueManifest);
        const bool inspection=row&&row->body.kind==phase::CallKind::ExecutionPrep&&(row->body.tool==phase::ToolCode::GetCompDetails||row->body.tool==phase::ToolCode::GetLayerDetails||row->body.tool==phase::ToolCode::InspectTitleVariants||ameInspection||preparation);
        const auto expectedLeaf=execution?authority->scope:preparation||ameInspection?row->executionScope:inspection?trusted_read::FixedExecutionScope(trusted_read::EmbeddedProfile().execution,0,trusted_read::ExecutionLeaf::Inspect):trusted_read::EmbeddedProfile().projectLeaf;
        const auto expectedRole=execution?4u:inspection?3u:row&&row->body.kind==phase::CallKind::BootstrapRead?1u:2u;
        const auto* prepared=preparation?Preparation(row->executionScope):nullptr;
        if(!row||row->state!=phase::VolatileServerLedger::RowState::Verified||(!inspection&&!execution&&row->body.tool!=phase::ToolCode::GetProjectInfo)||
            !(inspection||execution?ledger.ExecutionRowCurrent(*row,now):ledger.ReadRowCurrent(*row,now))||
            (execution?authority->nonce:row->handler.permitNonce)!=TrustedField<16>(request,16)||row->handler.expiresMono!=TrustedNumber(request,32,8)||
            TrustedNumber(request,40,2)!=static_cast<std::uint16_t>(row->body.tool)||TrustedNumber(request,42,2)!=expectedRole||
            TrustedField<32>(request,108)!=expectedLeaf||detail::Zero(expectedLeaf)||(inspection&&row->executionScope!=expectedLeaf)||
            (execution?!ExecutionCurrent(*authority,false):!ReadCurrent(handler))||
            (preparation&&(!prepared||prepared->failed||prepared->executionBegun||detail::Zero(prepared->proposal)||!detail::Zero(prepared->dryRun)))||
            projects.size()>=phase::kLifetimeCallRows)Refuse("trusted_project_bind_row_refused");
        auto ticket=std::make_unique<Project>();ticket->ref=detail::RandomId();ticket->nonce=detail::RandomId();ticket->handler=handler;
        ticket->command=TrustedField<16>(request,44);ticket->execution=TrustedField<16>(request,60);ticket->lease=TrustedField<16>(request,76);
        if(detail::Zero(ticket->command)||detail::Zero(ticket->execution)||detail::Zero(ticket->lease)||!detail::Zero(TrustedField<16>(request,92)))Refuse("trusted_project_ids_refused");
        for(const auto& other:projects)if(other->handler==handler||other->command==ticket->command||other->execution==ticket->execution||other->lease==ticket->lease)Refuse("trusted_project_ids_spent");
        ticket->inspection=inspection||execution;ticket->preparationDelivery=preparation;ticket->executionDelivery=execution;
        if(execution){const auto& policy=trusted_read::EmbeddedProfile().execution;bool selected=false;
            for(std::uint16_t slot=0;slot<=2;++slot)for(const auto leaf:{trusted_read::ExecutionLeaf::OwnedCheckpoint,trusted_read::ExecutionLeaf::CleanCopy,trusted_read::ExecutionLeaf::StageVariant,trusted_read::ExecutionLeaf::EnqueueAme,trusted_read::ExecutionLeaf::StartAme,trusted_read::ExecutionLeaf::RestoreBaseline}){
                if(trusted_read::FixedExecutionIntentAllowed(row->body.tool,phase::CallKind::Execute,slot,leaf)&&trusted_read::FixedExecutionScope(policy,slot,leaf)==expectedLeaf){
                    if(selected)Refuse("trusted_execution_scope_ambiguous");selected=true;ticket->variantSlot=slot;ticket->effectOperation=static_cast<std::uint16_t>(leaf);
                    ticket->nativeFile=leaf==trusted_read::ExecutionLeaf::OwnedCheckpoint||leaf==trusted_read::ExecutionLeaf::CleanCopy;}}
            if(!selected)Refuse("trusted_execution_closed_scope_refused");ticket->executionAuthority=authority->ref;authority->consumed=true;}
        ticket->script=TrustedField<32>(request,140);ticket->body=row->body.canonicalBodyHash;ticket->leaf=TrustedField<32>(request,108);ticket->expiry=row->call.expiresMono;
        Bytes binding(request.payload.begin(),request.payload.begin()+172);Put(binding,session);Put(binding,observationSnapshot);Put(binding,ticket->ref);Put(binding,ticket->nonce);
        ticket->binding=TrustedHash("lcp2.production.project-ticket.v1",binding);auto reply=Reply(request,false,phase::Status::Ok);Bytes bytes;Put(bytes,ticket->ref);Put(bytes,ticket->nonce);
        detail::PutU64(bytes,ticket->expiry);Put(bytes,ticket->binding);projects.push_back(std::move(ticket));TrustedPayload(reply,bytes);Send(reply,false,true);return;}
    if(verb==phase::Verb::ConsumeDispatch){auto& ticket=Ticket(TrustedField<16>(request,0));if(ticket.stage!=Project::Stage::Bound||
            ticket.nonce!=TrustedField<16>(request,16)||ticket.binding!=TrustedField<32>(request,32)||!ProjectCurrent(ticket)||GetTickCount64()>=ticket.expiry)
            Refuse("trusted_project_selection_refused");Bytes selected;Put(selected,ticket.binding);Put(selected,observationSnapshot);Put(selected,observation.context);Put(selected,observationTransport);
        ticket.selection=TrustedHash("lcp2.production.project-selected.v1",selected);if(ticket.selection!=TrustedField<32>(request,64))Refuse("trusted_project_selected_binding_refused");
        if(ticket.executionDelivery&&ticket.variantSlot&&ticket.effectOperation==static_cast<std::uint16_t>(trusted_read::ExecutionLeaf::StageVariant)){if(restoreDebts[ticket.variantSlot-1])Refuse("trusted_stage_original_restore_debt_once");auto debt=std::make_unique<RestoreDebt>();debt->slot=ticket.variantSlot;debt->stageTicket=ticket.ref;debt->scope=ticket.leaf;debt->actor=actor;restoreDebts[ticket.variantSlot-1]=std::move(debt);}
        if(ticket.executionDelivery&&ticket.variantSlot&&ticket.effectOperation==static_cast<std::uint16_t>(trusted_read::ExecutionLeaf::RestoreBaseline)){const auto& debt=restoreDebts[ticket.variantSlot-1];if(!debt||debt->state!=RestoreDebt::State::StageTerminal||debt->actor!=actor||detail::Zero(debt->stageResult))Refuse("trusted_restore_original_stage_terminal_required");}
        ticket.stage=Project::Stage::Selected;daemon->MarkAdmitted();const auto* row=Handler(ticket.handler);if(!row)Refuse("trusted_project_selected_handler_absent",0,true);
        const auto* authority=ticket.executionDelivery?Authority(ticket.executionAuthority):nullptr;
        auto binding=EffectBinding(ticket.command,ticket.execution,ticket.lease,authority?authority->binding:row->handler.bindingHash,ticket.body,ticket.script,ticket.leaf,ticket.effectOperation);
        binding.variantSlot=ticket.variantSlot;if(authority)binding.target=authority->project;
        ticket.ordinal=binding.nativeOrdinal;ticket.commit=std::unique_ptr<NativeDispatchCommit>(new NativeDispatchCommit(*store,cas,binding,{this,CommitGuard,CommitFloor},effects));
        ticket.note=ticket.commit->Commit(NativeDispatchCommit::ProofFault::None);if(!ticket.note.freshAppend||ticket.note.unknown){ticket.stage=Project::Stage::Unknown;Refuse("trusted_project_note_unknown",0,true);}
        ticket.lateNonce=detail::RandomId();auto reply=Reply(request,false,phase::Status::Ok);TrustedPayload(reply,EffectAck(ticket.ref,ticket.note,&ticket.lateNonce));Send(reply,false,true);return;}
    if(verb==phase::Verb::GuardDelivery){auto& ticket=Ticket(TrustedField<16>(request,0));if(ticket.stage!=Project::Stage::Selected||ticket.lateNonce!=TrustedField<16>(request,16)||
            ticket.note.recordHash!=TrustedField<32>(request,32)||ticket.handler!=TrustedField<16>(request,64)||actor!=TrustedField<16>(request,80)||
            ticket.selection!=TrustedField<32>(request,96)||observation.context!=TrustedField<32>(request,128)||ticket.expiry!=TrustedNumber(request,160,8)||
            observation.ordinal!=TrustedNumber(request,168,8)||!ProjectCurrent(ticket)||GetTickCount64()>=ticket.expiry)Refuse("trusted_project_last_guard_unknown",0,true);
        ticket.delivery=detail::RandomId();ticket.deliveryNonce=detail::RandomId();Bytes fields;Put(fields,ticket.delivery);Put(fields,ticket.deliveryNonce);Put(fields,ticket.selection);
        Put(fields,ticket.note.recordHash);detail::PutU64(fields,ticket.expiry);ticket.guard=TrustedHash("lcp2.production.project-delivery-guard.v1",fields);ticket.stage=Project::Stage::Guarded;
        auto reply=Reply(request,false,phase::Status::Ok);Bytes bytes;Put(bytes,ticket.delivery);Put(bytes,ticket.deliveryNonce);detail::PutU64(bytes,ticket.expiry);Put(bytes,ticket.guard);
        TrustedPayload(reply,bytes);Send(reply,false,true);return;}
    if(verb==phase::Verb::RecordDelivery){auto& ticket=Ticket(TrustedField<16>(request,0));if(ticket.stage!=Project::Stage::Guarded||ticket.deliveryNonce!=TrustedField<16>(request,16)||
            ticket.command!=TrustedField<16>(request,32)||ticket.guard!=TrustedField<32>(request,49)||request.payload[48]!=1||!ProjectCurrent(ticket))
            {ticket.stage=Project::Stage::Unknown;Refuse("trusted_project_delivery_unknown",0,true);}
        ticket.stage=Project::Stage::Delivered;Bytes receipt;Put(receipt,ticket.guard);Put(receipt,ticket.command);Put(receipt,ticket.execution);Put(receipt,ticket.lease);Put(receipt,observationTransport);
        // A native file operation has no panel HTTP delivery/receipt. Its
        // original producer owns the FILE_CREATE witness; D20 binds actual
        // file hash/identity. Keep the two receipt domains distinct.
        ticket.receipt=TrustedHash(ticket.nativeFile?"lcp2.production.native-file-effect-delivered.v1":"lcp2.production.project-delivered.v1",receipt);auto reply=Reply(request,false,phase::Status::Ok);auto bytes=EffectAck(ticket.ref,ticket.note);
        std::copy(ticket.receipt.begin(),ticket.receipt.end(),bytes.begin()+17);TrustedPayload(reply,bytes);Send(reply,false,true);return;}
    if(verb==phase::Verb::Complete){auto* preparedRow=Handler(TrustedField<16>(request,0));
        if(preparedRow&&preparedRow->body.kind==phase::CallKind::ExecutionPrep){const auto result=TrustedField<32>(request,32);const auto terminal=static_cast<std::uint16_t>(TrustedNumber(request,64,2));
            if(preparedRow->call.callRef!=TrustedField<16>(request,16)||(terminal!=1&&terminal!=2)||detail::Zero(result)||!ledger.ExecutionRowCurrent(*preparedRow,GetTickCount64())||
                TrustedField<32>(request,66)!=PreparationTerminal(*preparedRow,result,terminal))Refuse("trusted_preparation_original_terminal_refused");
            PreparedScope* scope=Preparation(preparedRow->executionScope);const auto tool=preparedRow->body.tool;
            if(tool==phase::ToolCode::BuildSolutionPlan){if(!detail::Zero(preparedBuild)||preparationFailed||preparedRow->executionScope!=trusted_read::FixedExecutionScope(trusted_read::EmbeddedProfile().execution,0,trusted_read::ExecutionLeaf::Inspect))
                    Refuse("trusted_preparation_build_once_refused");}
            else if(tool==phase::ToolCode::ProposeAiAgentPlan){if(scope||preparationFailed||detail::Zero(preparedBuild))Refuse("trusted_preparation_proposal_order_refused");std::size_t index=0;while(index<preparedScopes.size()&&preparedScopes[index])++index;
                if(index==preparedScopes.size())Refuse("trusted_preparation_scope_budget");auto owned=std::make_unique<PreparedScope>();owned->scope=preparedRow->executionScope;owned->issued=GetTickCount64();
                preparedScopes[index]=std::move(owned);scope=preparedScopes[index].get();}
            else if(tool==phase::ToolCode::RunAiAgentPlan){if(!scope||scope->failed||preparationFailed||detail::Zero(preparedBuild)||detail::Zero(scope->proposal)||!detail::Zero(scope->dryRun))
                    Refuse("trusted_preparation_receipt_order_refused");}
            Project* originalDelivery=nullptr;if(tool==phase::ToolCode::RunAiAgentPlan){for(auto& ticket:projects)if(ticket->handler==preparedRow->handler.permitRef&&ticket->preparationDelivery){
                    if(originalDelivery)Refuse("trusted_preparation_delivery_ambiguous",0,true);originalDelivery=ticket.get();}
                if(!originalDelivery||originalDelivery->stage!=Project::Stage::Delivered||originalDelivery->leaf!=preparedRow->executionScope||!ProjectCurrent(*originalDelivery))Refuse("trusted_preparation_actual_delivery_required",0,true);}
            if(ledger.FinishExecution(ledger.daemon_,preparedRow->handler.permitRef,result,GetTickCount64())!=phase::Status::Ok)Refuse("trusted_preparation_terminal_row_unknown",0,true);
            if(tool==phase::ToolCode::BuildSolutionPlan){if(terminal!=1)preparationFailed=true;else preparedBuild=result;}
            else if(scope){if(terminal!=1)scope->failed=true;else if(tool==phase::ToolCode::ProposeAiAgentPlan)scope->proposal=result;else if(tool==phase::ToolCode::RunAiAgentPlan)scope->dryRun=result;}
            if(originalDelivery){originalDelivery->result=result;originalDelivery->stage=Project::Stage::Terminal;}
            auto reply=Reply(request,false,phase::Status::Ok);Bytes bytes;bytes.push_back(1);Put(bytes,preparedRow->handler.permitRef);Put(bytes,result);
            detail::PutU64(bytes,cas.sequence);detail::PutU64(bytes,cas.epoch);Put(bytes,cas.head);TrustedPayload(reply,bytes);Send(reply,false,true);return;}
        Project* ticket=nullptr;for(auto& p:projects)if(p->command==TrustedField<16>(request,0)){if(ticket)Refuse("trusted_terminal_command_ambiguous",0,true);ticket=p.get();}
        if(!ticket||ticket->stage!=Project::Stage::Delivered||ticket->execution!=TrustedField<16>(request,16)||ticket->receipt!=TrustedField<32>(request,66)||
            TrustedNumber(request,64,2)!=1||!ProjectCurrent(*ticket))Refuse("trusted_project_terminal_unknown",0,true);
        const auto hash=TrustedField<32>(request,32);const auto status=ticket->inspection?ledger.FinishExecution(ledger.daemon_,ticket->handler,hash,GetTickCount64()):ledger.FinishLocalProjectRead(ledger.daemon_,ticket->handler,hash,observation,GetTickCount64());
        if(status!=phase::Status::Ok){ticket->stage=Project::Stage::Unknown;Refuse("trusted_project_terminal_row_unknown",0,true);}ticket->result=hash;ticket->stage=Project::Stage::Terminal;
        if(ticket->executionDelivery&&ticket->variantSlot){const auto operation=static_cast<trusted_read::ExecutionLeaf>(ticket->effectOperation);if(operation==trusted_read::ExecutionLeaf::StageVariant||operation==trusted_read::ExecutionLeaf::RestoreBaseline){auto& debt=restoreDebts[ticket->variantSlot-1];if(!debt||debt->actor!=actor)Refuse("trusted_restore_terminal_original_debt",0,true);if(operation==trusted_read::ExecutionLeaf::StageVariant){if(debt->stageTicket!=ticket->ref||debt->state!=RestoreDebt::State::Selected)Refuse("trusted_stage_terminal_original_debt",0,true);debt->stageResult=hash;debt->stageReceipt=ticket->receipt;debt->state=RestoreDebt::State::StageTerminal;}else{if(debt->state!=RestoreDebt::State::StageTerminal||detail::Zero(debt->stageResult)||detail::Zero(debt->stageReceipt))Refuse("trusted_restore_terminal_stage_join",0,true);debt->state=RestoreDebt::State::Restored;}}}
        auto reply=Reply(request,false,phase::Status::Ok);auto bytes=EffectAck(ticket->ref,ticket->note);std::copy(hash.begin(),hash.end(),bytes.begin()+17);TrustedPayload(reply,bytes);Send(reply,false,true);return;}
    if(verb==phase::Verb::BindOriginalJob){auto& start=Ticket(TrustedField<16>(request,0));const auto& policy=trusted_read::EmbeddedProfile().execution;const auto now=GetTickCount64();
        const auto slot=start.variantSlot;const auto* handler=Handler(start.handler);const auto* authority=Authority(start.executionAuthority);
        if(slot<1||slot>2||!start.executionDelivery||start.stage!=Project::Stage::Terminal||start.effectOperation!=static_cast<std::uint16_t>(trusted_read::ExecutionLeaf::StartAme)||
            !handler||handler->body.kind!=phase::CallKind::Execute||handler->body.tool!=phase::ToolCode::RunAiAgentPlan||!authority||authority->handler!=start.handler||authority->scope!=start.leaf||!authority->consumed||
            originalJobs[slot-1]||detail::Zero(start.receipt)||start.result!=TrustedField<32>(request,80)||detail::Zero(start.result)||
            now>=start.expiry||now>=sessionDeadline||!policy.jobDeadlineMs||!policy.completionPollsPerJob||policy.completionPollsPerJob>trusted_read::kTwoTitlePollsPerJob||
            !ReadCurrent(observation.target)||!OriginalFloor(false))Refuse("trusted_d47_original_START_terminal_required");
        if(slot==2&&(!originalJobs[0]||originalJobs[0]->stage!=OriginalJobRow::Stage::Media))Refuse("trusted_d47_slot2_before_media_terminal");
        const auto& debt=restoreDebts[slot-1];if(!debt||debt->actor!=actor||debt->state!=RestoreDebt::State::StageTerminal||detail::Zero(debt->stageResult))Refuse("trusted_d47_own_stage_debt_required");
        std::size_t enqueued=0;for(const auto& candidate:projects)if(candidate->executionDelivery&&candidate->variantSlot==slot&&candidate->effectOperation==static_cast<std::uint16_t>(trusted_read::ExecutionLeaf::EnqueueAme)){
            if(candidate->stage!=Project::Stage::Terminal||detail::Zero(candidate->result)||detail::Zero(candidate->receipt))Refuse("trusted_d47_original_enqueue_unknown");++enqueued;}
        if(enqueued!=1)Refuse("trusted_d47_original_enqueue_required");auto job=std::make_unique<OriginalJobRow>();job->slot=slot;job->ref=detail::RandomId();job->startTicket=start.ref;job->handler=start.handler;
        job->selector=TrustedField<32>(request,16);job->processWrapper=TrustedField<32>(request,48);job->startReceipt=start.result;job->issued=now;job->maximumPolls=policy.completionPollsPerJob;job->actor=actor;job->nextPollAt=now;
        const auto remaining=sessionDeadline-now;job->deadline=now+(std::min)(policy.jobDeadlineMs,remaining);Bytes grant;Put(grant,session);Put(grant,generation);Put(grant,bootNonce);Put(grant,job->ref);Put(grant,start.ref);
        Put(grant,job->selector);Put(grant,job->processWrapper);Put(grant,job->startReceipt);detail::PutU64(grant,job->issued);detail::PutU64(grant,job->deadline);detail::PutU32(grant,job->maximumPolls);detail::PutU16(grant,slot);
        job->hash=TrustedHash("lcp2.production.original-completion-grant.v1",grant);auto reply=Reply(request,false,phase::Status::Ok);Bytes bytes;Put(bytes,job->ref);Put(bytes,job->hash);detail::PutU64(bytes,job->deadline);detail::PutU32(bytes,job->maximumPolls);
        originalJobs[slot-1]=std::move(job);TrustedPayload(reply,bytes);Send(reply,false,true);return;}
    if(verb==phase::Verb::BeginCompletionPoll){OriginalJobRow* job=nullptr;for(auto& own:originalJobs)if(own&&own->ref==TrustedField<16>(request,0))job=own.get();const auto now=GetTickCount64();const auto& policy=trusted_read::EmbeddedProfile().execution;
        if(!job||job->stage!=OriginalJobRow::Stage::Armed||job->actor!=actor||job->terminalAttempted||job->mediaReserved||job->nextOrdinal>job->maximumPolls||job->maximumPolls!=trusted_read::kTwoTitlePollsPerJob||
            TrustedNumber(request,16,8)!=job->nextOrdinal||TrustedNumber(request,56,2)!=static_cast<std::uint16_t>(phase::CompletionOperation::OriginalWrapperStatus)||now<job->nextPollAt||now>=job->deadline||
            job->deadline-now<=10000+trusted_read::kTwoTitleMediaMaximumMs||effects.unknown||effects.attempts>176-2||cas.sequence>256-16-2||!OriginalFloor(false)||!LedgerIdle())Refuse("trusted_d48_original_poll_admission_closed",0,true);
        auto attempt=std::make_unique<OriginalJobRow::PollAttempt>();attempt->ordinal=job->nextOrdinal;attempt->input=TrustedField<32>(request,24);attempt->ref=detail::RandomId();attempt->nonce=detail::RandomId();attempt->expiry=now+10000;attempt->binding=OriginalPollBinding(*job,*attempt);
        job->stage=OriginalJobRow::Stage::Polling;job->activeOrdinal=job->nextOrdinal++;job->poll=attempt->ref;job->pollNonce=attempt->nonce;job->pollBinding=attempt->binding;job->observationCommit=attempt->input;job->polls.push_back(std::move(attempt));auto& poll=*job->polls.back();daemon->MarkAdmitted();
        try{auto& start=Ticket(job->startTicket);for(std::size_t index=0;index<poll.commits.size();++index){auto binding=EffectBinding(start.command,start.execution,start.lease,job->hash,poll.input,poll.input,trusted_read::FixedOriginalCompletionLeaf(policy,job->slot,static_cast<std::uint16_t>(index)),2);binding.variantSlot=job->slot;binding.actor=ledger.panelDefinition_.actorHash;binding.target=job->selector;
                poll.commits[index]=std::unique_ptr<NativeDispatchCommit>(new NativeDispatchCommit(*store,cas,binding,{this,CommitGuard,CommitFloor},effects));poll.notes[index]=poll.commits[index]->Commit(NativeDispatchCommit::ProofFault::None);if(!poll.notes[index].freshAppend||poll.notes[index].unknown||!OriginalFloor(false))Refuse("trusted_d48_partial_poll_precharge_unknown",0,true);}
            Bytes bytes;Put(bytes,poll.ref);Put(bytes,poll.nonce);detail::PutU64(bytes,poll.expiry);Put(bytes,poll.binding);auto reply=Reply(request,false,phase::Status::Ok);TrustedPayload(reply,bytes);Send(reply,false,true);return;
        }catch(...){job->stage=OriginalJobRow::Stage::Unknown;effects.unknown=true;throw;}}
    if(verb==phase::Verb::ObserveJobTerminal){OriginalJobRow* job=nullptr;for(auto& own:originalJobs)if(own&&own->ref==TrustedField<16>(request,0))job=own.get();const auto now=GetTickCount64();
        if(!job||job->stage!=OriginalJobRow::Stage::Polling||job->actor!=actor||job->poll!=TrustedField<16>(request,16)||job->polls.empty()||job->polls.back()->observed||job->polls.back()->ref!=job->poll||
            job->polls.back()->binding!=job->pollBinding||job->activeOrdinal!=job->polls.back()->ordinal||now>=job->polls.back()->expiry||!OriginalFloor(false))Refuse("trusted_d49_current_original_poll_required",0,true);
        auto& poll=*job->polls.back();poll.observed=true;const auto receipt=TrustedField<32>(request,32),join=TrustedField<32>(request,64);auto reply=Reply(request,false,phase::Status::Ok);Bytes bytes;
        try{if(join==OriginalTerminalJoin(*job,receipt,true)){AcceptOriginalTerminalAndReserveMedia(*job,receipt,join);bytes=EffectAck(job->terminal,job->terminalNotes.back());std::copy(job->reservation.begin(),job->reservation.end(),bytes.begin()+17);}
            else{if(join!=OriginalTerminalJoin(*job,receipt,false))Refuse("trusted_d49_foreign_terminal_join",0,true);job->stage=OriginalJobRow::Stage::Armed;job->nextPollAt=now+trusted_read::EmbeddedProfile().execution.completionCadenceMs;bytes=EffectAck(job->poll,poll.notes.back());std::copy(receipt.begin(),receipt.end(),bytes.begin()+17);}
            if(!OriginalFloor(false))Refuse("trusted_d49_original_reply_floor_unknown",0,true);TrustedPayload(reply,bytes);Send(reply,false,true);return;
        }catch(...){job->stage=OriginalJobRow::Stage::Unknown;effects.unknown=true;throw;}}
    if(verb==phase::Verb::FinishServerOnly){const auto ref=TrustedField<16>(request,0);const auto result=TrustedField<32>(request,16);auto* row=Handler(ref);phase::Status status=phase::Status::Denied;
        if(row&&row->body.kind==phase::CallKind::ServerOnly)status=ledger.Finish(ledger.daemon_,ref,result,GetTickCount64());
        else if(row&&row->body.tool==phase::ToolCode::GetBridgeStatus&&(row->body.kind==phase::CallKind::BootstrapRead||row->body.kind==phase::CallKind::Read)&&ReadCurrent(ref))
            status=ledger.FinishLocalStatusRead(ledger.daemon_,ref,result,observation,GetTickCount64());
        auto reply=Reply(request,false,status);if(status==phase::Status::Ok){Bytes bytes;Put(bytes,ref);Put(bytes,row->handler.permitNonce);Put(bytes,result);TrustedPayload(reply,bytes);}Send(reply,false,status==phase::Status::Ok);return;}
    auto reply=Reply(request,false,phase::Status::Unavailable);Send(reply,false,false);
}
bool Broker::Data::Trusted::Lifecycle(){
    // The exact returned original HANDLE is observed independently of every
    // admission/source/actor/pipe gate. ACK never substitutes for actual exit.
    if(ObserveOriginalExit()){if(!awaitingOriginalExit||ledger.HasUnresolved())Unknown();return true;}
    if(!daemon)return controllerRevoked;
    if(!daemon->LifecycleEffectAllowed()){Unknown();return true;}
    if(!controllerRevoked&&!drainRequested)return false;
    if(!effects.admitted){if(awaitingOriginalExit)return false;Result aborted;
        if(!OriginalFloor(true)||!daemon->AbortUnadmitted(aborted)){Unknown();return false;}awaitingOriginalExit=true;return false;}
    if(unknownDisposition||!daemonBound||!WorkerCurrent(true))return false;
    if(!drainSent){HoldCleanupPrefix();drainSent=true;stopRef=detail::RandomId();phase::Frame event{};event.header.direction=phase::Direction::BrokerToDaemon;
        event.header.kind=phase::FrameKind::Event;event.header.verb=phase::Verb::Drain;event.header.senderOrdinal=workerWire->outgoingOrdinal_+1;
        event.header.channelNonce=daemonNonce;event.header.sessionRef=session;event.header.generation=generation;event.header.bootNonce=bootNonce;
        Bytes bytes;Put(bytes,stopRef);Put(bytes,generation);Put(bytes,lifecycleBinding);TrustedPayload(event,bytes);Send(event,false,true,true);return false;}
    if(!drainAcknowledged||shutdownSent||!LedgerIdleLifecycle())return false;
    if(!cleanupPrefix||!cleanupPrefix->released||cleanupPrefix->unknown)Refuse("trusted_cleanup_prefix_not_released",0,true);
    // Reserve is a single durable consumed Stop followed by one native ordinal.
    // Actor absence, controller EOF and expired READ do not alter this clock.
    stopConsumed=true;initial_durability::ClosedRecord record;record.type=initial_durability::RecordType::Consume;record.effect=initial_durability::EffectClass::Stop;
    record.target=enrollment->Profile().stopTarget;const auto consumed=store->AppendOnce(cas,record);cas=consumed.current;stopRecord=consumed.recordHash;
    if(!consumed.ok||consumed.unknown||!consumed.consumptionRecorded||consumed.persistence!="os_flush_ack_and_readback"||!OriginalFloor(true))Refuse("trusted_stop_consumed_unknown",0,true);
    shutdownSent=true;phase::Frame event{};event.header.direction=phase::Direction::BrokerToDaemon;event.header.kind=phase::FrameKind::Event;event.header.verb=phase::Verb::Shutdown;
    event.header.senderOrdinal=workerWire->outgoingOrdinal_+1;event.header.channelNonce=daemonNonce;event.header.sessionRef=session;event.header.generation=generation;event.header.bootNonce=bootNonce;
    Bytes bytes;Put(bytes,stopRef);Put(bytes,bootNonce);Put(bytes,stopRecord);TrustedPayload(event,bytes);Send(event,false,true,true);return false;
}
int Broker::Data::RunTrustedFixed(){std::unique_ptr<Trusted> owned;
    try{owned=std::make_unique<Trusted>();auto& d=*owned;d.InitializeTrusted();const auto start=GetTickCount64();bool reported=false;
        const auto fail=[&](const char* code,std::uint32_t error){d.CloseAdmission(true);if(!reported){reported=true;
            FailureDiagnostic("trusted_broker_loop_unknown",{false,true,false,code,error});}};
        for(;;){try{if(d.Lifecycle()){const auto disposition=d.ExitDisposition();
                    if(!d.originalExitObserved&&d.daemon)(void)owned.release();return disposition;}
                if(!d.controllerRevoked){if(d.controlled->PollConnect()){
                        if(!d.originalController->Live(d.controlled->Handle()))Refuse("trusted_competing_first_controller_refused");
                        Bytes bytes;if(d.controlled->PollBytes(bytes)){phase::Frame request{};if(d.controlWire->AcceptIncoming(bytes.data(),bytes.size(),request)!=phase::CodecError::None)
                                Refuse("trusted_controller_wire_unknown",0,true);d.ControllerFrame(request);}
                        if(d.controlled->Closed()||!d.originalController->Current()||(d.opened&&GetTickCount64()>=d.sessionDeadline))d.CloseAdmission(d.controlled->Unknown());
                    }else if(d.controlled->Closed()||!d.originalController->Current()||GetTickCount64()-start>=30000)d.CloseAdmission(d.controlled->Unknown());}
                // This continues after revocation; admission methods cannot use
                // the independent clock, but D21/D22 may settle their own events.
                if(d.runtimeBound&&d.worker->PollConnect()){
                    if(!d.daemon||!d.daemon->MatchesPeer(d.worker->Handle()))Refuse("trusted_competing_worker_refused",0,true);
                    Bytes bytes;if(d.worker->PollBytes(bytes)){phase::Frame request{};if(d.workerWire->AcceptIncoming(bytes.data(),bytes.size(),request)!=phase::CodecError::None)
                            Refuse("trusted_worker_wire_unknown",0,true);d.WorkerFrame(request);}
                    if(d.worker->Closed()&&!d.awaitingOriginalExit)Refuse("trusted_original_worker_eof_unknown",0,true);}
                if(d.controllerDeferred&&d.challenge.pending&&GetTickCount64()-d.challenge.issued>10000)Refuse("trusted_observation_timeout_unknown",0,true);
            }catch(const detail::Failure& failure){fail(failure.code.c_str(),failure.error);}catch(...){fail("trusted_broker_late_exception_unknown",0);}
            if(d.Lifecycle()){const auto disposition=d.ExitDisposition();if(!d.originalExitObserved&&d.daemon)(void)owned.release();return disposition;}Sleep(5);
        }
    }catch(const detail::Failure& failure){if(owned&&owned->daemon){owned->CloseAdmission(true);(void)owned.release();}
        FailureDiagnostic("trusted_broker_initial_refused",{false,true,failure.unavailable,failure.code,failure.error});return 2;
    }catch(...){if(owned&&owned->daemon){owned->CloseAdmission(true);(void)owned.release();}return 2;}
}
#endif
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
    NativeDispatchCommit::Lifetime commitLifetime;
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
        privateCommit=std::unique_ptr<NativeDispatchCommit>(new NativeDispatchCommit(*store,cas,binding,{this,CommitGuard,CommitFloor},commitLifetime));
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
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    return Data::RunTrustedFixed();
#elif defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
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
