#include "local_session_native_client.h"
#include <winsock2.h>
#include <windows.h>
#include <iphlpapi.h>
#include <tlhelp32.h>
#include <shellapi.h>
#include <algorithm>
#include <cstring>
#include <cstdio>
#include <deque>
#include <limits>
#include <type_traits>
#include <set>
#include <map>
#include <utility>
#include "local_session_trusted_read_pins.h"
#include "production_artifact_seal.h"
#include "original_daemon_win32.h"
#include "ame_pe_mapped_span.h"
#include "owned_title_manifest_capture.h"
#include "owned_observed_timing_capture.h"
#include "ame_native_json_limits.h"
#include "ame_native_rgba_png.h"
#include "ame_native_media_children.h"

namespace local_session::trusted_read {
namespace {
using Bytes=std::vector<unsigned char>;
using detail::Held;using detail::Refuse;
std::mutex creationCriticalSection;
constexpr std::uint64_t kIoMs=1000;
template<class T> void Put(Bytes& out,const T& value){out.insert(out.end(),value.begin(),value.end());}
std::uint64_t Number(const unsigned char* p,std::size_t n){std::uint64_t value=0;for(std::size_t i=0;i<n;++i)value|=static_cast<std::uint64_t>(p[i])<<(i*8);return value;}
template<std::size_t N> std::array<unsigned char,N> Fixed(const unsigned char* p){std::array<unsigned char,N> value{};std::copy_n(p,N,value.begin());return value;}
Digest TextHash(const char* text){return detail::Hash(Bytes(text,text+std::strlen(text)));}
Digest DomainHash(const char* domain,const Bytes& fields){Bytes bytes(domain,domain+std::strlen(domain));bytes.push_back(0);Put(bytes,fields);return detail::Hash(bytes);}
std::wstring Quote(const std::wstring& value){
    if(value.empty()||value.find(L'\0')!=std::wstring::npos)Refuse("trusted_fixed_argument_invalid");
    std::wstring out=L"\"";std::size_t slashes=0;
    for(wchar_t c:value){if(c==L'\\'){++slashes;continue;}out.append(c==L'\"'?slashes*2+1:slashes,L'\\');slashes=0;out+=c;}
    out.append(slashes*2,L'\\');out+=L'\"';return out;
}
std::wstring HandleText(HANDLE value){return std::to_wstring(reinterpret_cast<std::uintptr_t>(value));}
HANDLE InheritedLocator(const wchar_t* key){
    wchar_t text[32]{};const DWORD n=GetEnvironmentVariableW(key,text,32);
    if(!n||n>=32)Refuse("trusted_original_bootstrap_locator_missing");
    std::uintptr_t value=0;for(DWORD i=0;i<n;++i){if(text[i]<L'0'||text[i]>L'9'||value>(std::numeric_limits<std::uintptr_t>::max()-9)/10)Refuse("trusted_original_bootstrap_locator_invalid");value=value*10+static_cast<unsigned>(text[i]-L'0');}
    HANDLE handle=reinterpret_cast<HANDLE>(value);DWORD flags=0;
    if(!handle||handle==INVALID_HANDLE_VALUE||!GetHandleInformation(handle,&flags)||(flags&HANDLE_FLAG_INHERIT)==0)
        Refuse("trusted_original_bootstrap_object_missing",GetLastError());
    if(!SetHandleInformation(handle,HANDLE_FLAG_INHERIT,0))Refuse("trusted_original_bootstrap_inheritance_close_unknown",GetLastError(),true);
    return handle;
}
struct CheckedFile final {
    std::vector<Held> parents;Held file;reviewed::File approved;
    explicit CheckedFile(const reviewed::File& input):approved(input){
        const auto& name=input.pin.canonicalPath;
        if(name.size()<50||name.substr(0,11)!=L"\\\\?\\Volume{"||name[48]!=L'\\')Refuse("trusted_canonical_file_required");
        const auto anchor=name.substr(0,49);
        parents.emplace_back(CreateFileW(anchor.c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,
            FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        if(!parents.back().Valid())Refuse("trusted_volume_open_refused",GetLastError());detail::ReadPin(parents.back().Get(),true);
        std::size_t at=49;while(at<name.size()){
            const auto end=name.find(L'\\',at);const bool directory=end!=std::wstring::npos;
            const auto component=name.substr(at,directory?end-at:name.size()-at);
            if(component.empty()||component==L"."||component==L".."||component.find_first_of(L"/:")!=std::wstring::npos)Refuse("trusted_component_refused");
            auto object=detail::Relative(parents.back().Get(),component,directory,false,false,false,true);
            if(directory)parents.push_back(std::move(object));else file=std::move(object);
            if(!directory)break;at=end+1;
        }
        if(!file.Valid()||!detail::SamePin(detail::ReadPin(file.Get(),false),input.pin)||detail::Hash(detail::ReadExact(file.Get(),134217728))!=input.sha256)
            Refuse("trusted_file_pin_or_bytes_refused");
    }
    bool Current()const{
        try{return file.Valid()&&detail::SamePin(detail::ReadPin(file.Get(),false),approved.pin)&&
            std::all_of(parents.begin(),parents.end(),[](const Held& value){detail::ReadPin(value.Get(),true);return true;});}
        catch(...){return false;}
    }
};
struct Process final {
    Held handle;DWORD pid=0;std::uint64_t birth=0;std::wstring sid,image;
    Process(Held original,const reviewed::File& approved,const std::wstring& expectedSid):handle(std::move(original)){
        if(!handle.Valid())Refuse("trusted_original_process_required");pid=GetProcessId(handle.Get());birth=detail::ProcessBirth(handle.Get());
        sid=detail::ProcessSid(handle.Get());image=detail::ProcessImage(handle.Get());
        if(!pid||!birth||sid!=expectedSid||image!=approved.pin.canonicalPath||!Current())Refuse("trusted_original_process_identity_refused");
    }
    bool Current()const{try{return detail::ProcessLive(handle.Get())&&GetProcessId(handle.Get())==pid&&detail::ProcessBirth(handle.Get())==birth&&
        detail::ProcessSid(handle.Get())==sid&&detail::ProcessImage(handle.Get())==image;}catch(...){return false;}}
};
struct CheckedDirectory final {
    std::vector<Held> parents;Held directory;ObjectPin approved;
    explicit CheckedDirectory(const ObjectPin& pin):approved(pin){const auto& name=pin.canonicalPath;
        if(name.size()<50||name.substr(0,11)!=L"\\\\?\\Volume{"||name[48]!=L'\\'||detail::Zero(pin.fileId))Refuse("trusted_bootstrap_namespace_pin_required");
        parents.emplace_back(CreateFileW(name.substr(0,49).c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,
            FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        if(!parents.back().Valid())Refuse("trusted_bootstrap_namespace_anchor_refused",GetLastError());detail::ReadPin(parents.back().Get(),true);
        std::size_t at=49;while(at<name.size()){const auto end=name.find(L'\\',at);const auto part=name.substr(at,end==std::wstring::npos?name.size()-at:end-at);
            if(part.empty()||part==L"."||part==L".."||part.find_first_of(L"/:")!=std::wstring::npos)Refuse("trusted_bootstrap_namespace_component_refused");
            auto next=detail::Relative(parents.back().Get(),part,true,false,end==std::wstring::npos,false,false);
            if(end==std::wstring::npos){directory=std::move(next);break;}parents.push_back(std::move(next));at=end+1;}
        if(!directory.Valid()||!detail::SamePin(detail::ReadPin(directory.Get(),true),approved))Refuse("trusted_bootstrap_namespace_changed");
    }
    bool Current()const noexcept{try{return directory.Valid()&&detail::SamePin(detail::ReadPin(directory.Get(),true),approved)&&
        std::all_of(parents.begin(),parents.end(),[](const Held& h){detail::ReadPin(h.Get(),true);return true;});}catch(...){return false;}}
};
constexpr char kPanelBootstrapTemplate[]=R"JSX((function () {
  if (typeof app === "undefined" || typeof app.findMenuCommandId !== "function" || typeof app.executeCommand !== "function") throw new Error("owned_bootstrap_api_unavailable");
  var commandId = app.findMenuCommandId("AE Agent 3.3.1");
  if (typeof commandId !== "number" || !isFinite(commandId) || commandId <= 0 || Math.floor(commandId) !== commandId) throw new Error("owned_bootstrap_menu_unavailable");
  app.executeCommand(commandId);
}());
)JSX";
struct BootstrapHelper final {
    Held writer,process,thread,job;HANDLE failedWriter=nullptr;
    std::unique_ptr<CheckedFile> source;Id attempt{},preactorRef{};std::uint64_t deadline=0,birth=0;
    bool launched=false,settled=false;
};
Bytes PipeReadBounded(HANDLE pipe,std::size_t count){
    if(GetFileType(pipe)!=FILE_TYPE_PIPE||!count||count>4096)Refuse("trusted_original_bootstrap_pipe_refused");
    Bytes bytes(count);const auto deadline=GetTickCount64()+kIoMs;DWORD available=0;
    while(true){if(!PeekNamedPipe(pipe,nullptr,0,nullptr,&available,nullptr))Refuse("trusted_original_bootstrap_read_unknown",GetLastError(),true);
        if(available>=count)break;if(GetTickCount64()>=deadline)Refuse("trusted_original_bootstrap_read_timeout",0,true);Sleep(1);}
    DWORD read=0;if(!ReadFile(pipe,bytes.data(),static_cast<DWORD>(count),&read,nullptr)||read!=count)Refuse("trusted_original_bootstrap_read_partial",GetLastError(),true);return bytes;
}
void PipeWriteInitial(HANDLE pipe,const Bytes& bytes){
    // Exactly one <=4096-byte write to an original empty 8192-byte bootstrap
    // pipe. No peer-controlled stream or second write can fill this buffer.
    if(GetFileType(pipe)!=FILE_TYPE_PIPE||bytes.empty()||bytes.size()>4096)Refuse("trusted_original_bootstrap_write_refused");
    DWORD written=0;if(!WriteFile(pipe,bytes.data(),static_cast<DWORD>(bytes.size()),&written,nullptr)||written!=bytes.size())Refuse("trusted_original_bootstrap_write_unknown",GetLastError(),true);
}
void PipeRequireEofBounded(HANDLE pipe){
    const auto deadline=GetTickCount64()+kIoMs;DWORD available=0;
    for(;;){if(!PeekNamedPipe(pipe,nullptr,0,nullptr,&available,nullptr)){
            if(GetLastError()==ERROR_BROKEN_PIPE)return;Refuse("trusted_bootstrap_eof_unknown",GetLastError(),true);}
        if(available)Refuse("trusted_bootstrap_trailing_bytes",0,true);
        if(GetTickCount64()>=deadline)Refuse("trusted_bootstrap_eof_timeout",0,true);Sleep(1);}
}
Bytes BootstrapBody(const phase::WireBindings& binding,const std::wstring& pipe,const Bytes& lifecycleTail={}){
    if(pipe.size()>512||(!lifecycleTail.empty()&&lifecycleTail.size()!=56))Refuse("trusted_bootstrap_pipe_length_refused");Bytes out={'L','T','R','B',1,static_cast<unsigned char>(lifecycleTail.empty()?0:1),0,0};
    Put(out,binding.channelNonce);Put(out,binding.sessionRef);Put(out,binding.generation);Put(out,binding.bootNonce);
    Put(out,reviewed::EmbeddedProfile().sourceSetHash);detail::PutU16(out,static_cast<std::uint16_t>(pipe.size()));
    for(wchar_t c:pipe)detail::PutU16(out,static_cast<std::uint16_t>(c));out.insert(out.end(),lifecycleTail.begin(),lifecycleTail.end());return out;
}
std::vector<wchar_t> CreationEnvironment(HANDLE peer,HANDLE input,HANDLE output,HANDLE controller){
    wchar_t windows[32761]{};const UINT n=GetWindowsDirectoryW(windows,32761);if(!n||n>=32761)Refuse("trusted_system_root_unavailable");
    std::vector<std::wstring> values={L"AE_AGENT_TRUSTED_READ_BOOT_INPUT="+HandleText(input),L"AE_AGENT_TRUSTED_READ_BOOT_OUTPUT="+HandleText(output),
        L"AE_AGENT_TRUSTED_READ_BOOT_PEER="+HandleText(peer),L"SystemRoot="+std::wstring(windows,n)};
    if(controller)values.push_back(L"AE_AGENT_TRUSTED_READ_BOOT_CONTROLLER="+HandleText(controller));
    std::sort(values.begin(),values.end());std::vector<wchar_t> block;for(const auto& value:values){block.insert(block.end(),value.begin(),value.end());block.push_back(0);}block.push_back(0);return block;
}
struct Io final {OVERLAPPED state{};Held event;Bytes bytes;bool pending=false;
    explicit Io(std::size_t size):event(CreateEventW(nullptr,TRUE,FALSE,nullptr)),bytes(size){if(!event.Valid())Refuse("trusted_io_event_refused");state.hEvent=event.Get();}};
std::vector<MIB_TCPROW_OWNER_PID> TcpRows(){
    DWORD bytes=0;const DWORD first=GetExtendedTcpTable(nullptr,&bytes,FALSE,AF_INET,TCP_TABLE_OWNER_PID_ALL,0);
    if(first!=ERROR_INSUFFICIENT_BUFFER||bytes<sizeof(MIB_TCPTABLE_OWNER_PID)||bytes>524288)Refuse("trusted_tcp_table_unavailable");
    Bytes buffer(bytes);if(GetExtendedTcpTable(buffer.data(),&bytes,FALSE,AF_INET,TCP_TABLE_OWNER_PID_ALL,0)!=NO_ERROR)Refuse("trusted_tcp_table_changed");
    const auto* table=reinterpret_cast<const MIB_TCPTABLE_OWNER_PID*>(buffer.data());
    if(table->dwNumEntries>4096||sizeof(DWORD)+static_cast<std::size_t>(table->dwNumEntries)*sizeof(MIB_TCPROW_OWNER_PID)>bytes)Refuse("trusted_tcp_table_budget");
    return {table->table,table->table+table->dwNumEntries};
}
std::uint16_t Port(DWORD value){return ntohs(static_cast<u_short>(value));}
}
const Profile& EmbeddedProfile(){return local_session_trusted_read_reviewed::kProfile;}
Capability::Capability(NativeClient* owner,CapKind kind,const phase::Frame& frame):owner_(owner),kind_(kind),frame_(frame){}
CreatedChild NativeClient::CreateFixedChild(Role childRole,const std::shared_ptr<production::OriginalSealWitness>& originalSeal,
    const phase::WireBindings& binding,const std::wstring& pipe,InstalledEnrollment* enrollment,
    const PreparedLifecycleGrant* lifecycle,void* originalController){
    std::lock_guard<std::mutex> creationLock(creationCriticalSection);
    if(!originalSeal||!originalSeal->Fresh()||detail::Zero(binding.channelNonce))Refuse("trusted_creation_original_seal_required");
    const bool daemon=childRole==Role::Daemon;const auto& resolved=originalSeal->ResolvedEnrollment();const auto& fixed=EmbeddedProfile();
    if(childRole!=Role::Controller&&!daemon)Refuse("trusted_creation_fixed_role_required");
    const auto& approved=daemon?resolved.node:originalSeal->ArtifactFile(production::ArtifactRole::Broker);
    const auto& creator=daemon?originalSeal->ArtifactFile(production::ArtifactRole::Broker):resolved.controllerImage;
    CheckedFile executable(approved);
    const std::wstring image=daemon?fixed.nodeLocator:fixed.brokerLocator;
    const std::wstring command=Quote(image)+(daemon?L" "+Quote(enrollment?enrollment->CheckedBridgeEntry():L""):L" --trusted-read-broker");
    const auto boundary=[&](){
        if(!originalSeal->Fresh()||!executable.Current()||!detail::ProcessBirth(GetCurrentProcess())||
            detail::ProcessSid(GetCurrentProcess())!=resolved.userSid||detail::ProcessImage(GetCurrentProcess())!=creator.pin.canonicalPath)
            Refuse("trusted_creation_source_or_original_owner_closed");
        if(!daemon){if(enrollment||lifecycle||originalController||!pipe.empty()||!detail::Zero(binding.sessionRef)||!detail::Zero(binding.generation)||!detail::Zero(binding.bootNonce))
                Refuse("trusted_broker_creation_binding_refused");return;}
        const auto now=GetTickCount64();
        if(!enrollment||!lifecycle||!enrollment->Fresh(true).ok||!originalController||!detail::ProcessLive(originalController)||
            detail::ProcessSid(originalController)!=resolved.userSid||detail::ProcessImage(originalController)!=resolved.controllerImage.pin.canonicalPath||
            detail::ProcessBirth(originalController)>detail::ProcessBirth(GetCurrentProcess())||pipe.empty()||pipe.size()>512||detail::Zero(binding.sessionRef)||
            lifecycle->generation_!=binding.generation||lifecycle->boot_!=binding.bootNonce||detail::Zero(lifecycle->consumed_)||detail::Zero(binding.generation)||detail::Zero(binding.bootNonce)||
            !lifecycle->issuedAt_||lifecycle->issuedAt_>=lifecycle->sessionDeadline_||lifecycle->sessionDeadline_-lifecycle->issuedAt_>28800000||
            lifecycle->sessionDeadline_>std::numeric_limits<std::uint64_t>::max()-600000||lifecycle->dispositionDeadline_!=lifecycle->sessionDeadline_+600000||
            now<lifecycle->issuedAt_||now>=lifecycle->sessionDeadline_||now>=lifecycle->dispositionDeadline_)
            Refuse("trusted_daemon_original_lifecycle_closed");
    };
    static_assert(std::is_nothrow_move_constructible_v<CreatedChild>&&std::is_nothrow_move_assignable_v<CreatedChild>,"Original creation ownership transfer must not throw.");
    boundary();CreatedChild result;result.status.code.reserve(256);result.failedCloseHandles.reserve(5);result.bootstrap=std::make_unique<Bootstrap>();
    // Every allocation needed to retain a returned original happens before
    // CreateProcess. Late failures return this exact owner without replay.
    SECURITY_ATTRIBUTES security{sizeof(security),nullptr,TRUE};HANDLE childInputRaw=nullptr,parentOutputRaw=nullptr,parentInputRaw=nullptr,childOutputRaw=nullptr,peerRaw=nullptr;
    if(!CreatePipe(&childInputRaw,&parentOutputRaw,&security,8192))Refuse("trusted_bootstrap_input_create_refused",GetLastError());
    Held childInput(childInputRaw);result.bootstrap->output=Held(parentOutputRaw);
    if(!CreatePipe(&parentInputRaw,&childOutputRaw,&security,8192))Refuse("trusted_bootstrap_output_create_refused",GetLastError());
    result.bootstrap->input=Held(parentInputRaw);Held childOutput(childOutputRaw);
    if(!SetHandleInformation(result.bootstrap->input.Get(),HANDLE_FLAG_INHERIT,0)||!SetHandleInformation(result.bootstrap->output.Get(),HANDLE_FLAG_INHERIT,0)||
        !DuplicateHandle(GetCurrentProcess(),GetCurrentProcess(),GetCurrentProcess(),&peerRaw,PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,TRUE,0))
        Refuse("trusted_original_peer_duplicate_refused",GetLastError());
    Held peer(peerRaw),controller;SIZE_T size=0;InitializeProcThreadAttributeList(nullptr,1,0,&size);if(!size||size>65536)Refuse("trusted_handle_list_size_refused");
    std::vector<unsigned char> memory(size);auto* list=reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(memory.data());
    if(!InitializeProcThreadAttributeList(list,1,0,&size))Refuse("trusted_handle_list_create_refused",GetLastError());
    struct Attributes final {LPPROC_THREAD_ATTRIBUTE_LIST value;~Attributes(){DeleteProcThreadAttributeList(value);}} attributes{list};
    if(daemon){HANDLE duplicate=nullptr;if(!DuplicateHandle(GetCurrentProcess(),originalController,GetCurrentProcess(),&duplicate,PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,TRUE,0))
            Refuse("trusted_original_controller_duplicate_failed",GetLastError());controller=Held(duplicate);}
    std::array<HANDLE,4> inherit={peer.Get(),childInput.Get(),childOutput.Get(),controller.Get()};
    if(!UpdateProcThreadAttribute(list,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,inherit.data(),(daemon?4u:3u)*sizeof(HANDLE),nullptr,nullptr))
        Refuse("trusted_handle_list_refused",GetLastError());
    STARTUPINFOEXW startup{};startup.StartupInfo.cb=sizeof(startup);startup.lpAttributeList=list;
    auto environment=CreationEnvironment(peer.Get(),childInput.Get(),childOutput.Get(),controller.Get());
    Bytes lifecycleTail;Digest originalLifecycleBinding{};
    if(daemon){originalLifecycleBinding=lifecycle->BindingHash();if(detail::Zero(originalLifecycleBinding))Refuse("trusted_original_lifecycle_binding_refused");
        detail::PutU64(lifecycleTail,lifecycle->issuedAt_);detail::PutU64(lifecycleTail,lifecycle->sessionDeadline_);detail::PutU64(lifecycleTail,lifecycle->dispositionDeadline_);Put(lifecycleTail,originalLifecycleBinding);}
    std::vector<wchar_t> argv(command.begin(),command.end());argv.push_back(0);const auto bootstrap=BootstrapBody(binding,pipe,lifecycleTail);boundary();
    PROCESS_INFORMATION original{};const BOOL created=CreateProcessW(image.c_str(),argv.data(),nullptr,nullptr,TRUE,
        CREATE_SUSPENDED|CREATE_NO_WINDOW|CREATE_UNICODE_ENVIRONMENT|EXTENDED_STARTUPINFO_PRESENT,
        environment.data(),fixed.repository.c_str(),&startup.StartupInfo,&original);const DWORD creationError=GetLastError();
    result.process=Held(original.hProcess);result.thread=Held(original.hThread);
    for(auto* value:{&peer,&childInput,&childOutput,&controller}){if(!value->Valid())continue;HANDLE exact=value->Take();
        if(!CloseHandle(exact)){result.failedCloseHandles.push_back(exact);result.status.unknown=true;result.status.win32Error=GetLastError();}}
    if(!created){result.status.unknown=result.status.unknown||result.process.Valid()||result.thread.Valid();result.status.code="trusted_original_create_refused";result.status.win32Error=creationError;return result;}
    if(result.status.unknown){result.status.code="trusted_inheritable_close_unknown";return result;}
    try{
        // Inspect only the actual returned, still suspended original. Source,
        // creator, binding and the immutable original clock are checked again
        // immediately before the single Resume; no caller callback is involved.
        const auto birth=detail::ProcessBirth(result.process.Get());
        if(!result.process.Valid()||!result.thread.Valid()||GetProcessId(result.process.Get())!=original.dwProcessId||!birth||
            birth<detail::ProcessBirth(GetCurrentProcess())||detail::ProcessSid(result.process.Get())!=resolved.userSid||
            detail::ProcessImage(result.process.Get())!=approved.pin.canonicalPath||!detail::ProcessLive(result.process.Get()))
            Refuse("trusted_suspended_original_identity_refused",0,true);
        boundary();if(daemon&&lifecycle->BindingHash()!=originalLifecycleBinding)Refuse("trusted_original_lifecycle_binding_changed",0,true);
        // The complete packet fits the original empty 8192-byte pipe. The child
        // is still suspended, so no partially read packet can become admission.
        PipeWriteInitial(result.bootstrap->output.Get(),bootstrap);
        HANDLE writer=result.bootstrap->output.Take();if(!CloseHandle(writer)){
            result.failedCloseHandles.push_back(writer);Refuse("trusted_bootstrap_writer_close_unknown",GetLastError(),true);}
        boundary();if(daemon&&lifecycle->BindingHash()!=originalLifecycleBinding)Refuse("trusted_original_lifecycle_binding_changed",0,true);
        const auto resumed=ResumeThread(result.thread.Get());if(resumed!=1)Refuse("trusted_original_resume_unknown",resumed==static_cast<DWORD>(-1)?GetLastError():0,true);
        boundary();
        result.status.ok=true;result.status.code="trusted_original_child_created";
    }catch(const detail::Failure& failure){result.status.unknown=true;result.status.unavailable=failure.unavailable;result.status.win32Error=failure.error;result.status.code=failure.code;}
    catch(...){result.status.unknown=true;result.status.code="trusted_original_creation_exception";}
    return result;
}
Bootstrap ReceiveBootstrapFixed(Role receiver){
    if(receiver!=Role::Controller&&receiver!=Role::Daemon)Refuse("trusted_bootstrap_fixed_receiver_required");
    auto retained=std::make_unique<Bootstrap>();auto& result=*retained;
    try{result.originalPeer=Held(InheritedLocator(L"AE_AGENT_TRUSTED_READ_BOOT_PEER"));
    result.input=Held(InheritedLocator(L"AE_AGENT_TRUSTED_READ_BOOT_INPUT"));result.output=Held(InheritedLocator(L"AE_AGENT_TRUSTED_READ_BOOT_OUTPUT"));
    if(receiver==Role::Daemon)result.originalController=Held(InheritedLocator(L"AE_AGENT_TRUSTED_READ_BOOT_CONTROLLER"));
    Result sealResult;const auto seal=production::OriginalSealWitness::OpenFixed(sealResult);if(!seal)Refuse(sealResult.code.c_str(),sealResult.win32Error,sealResult.unknown,sealResult.unavailable);
    const auto& file=receiver==Role::Controller?seal->ResolvedEnrollment().controllerImage:seal->ArtifactFile(production::ArtifactRole::Broker);
    Process original(std::move(result.originalPeer),file,reviewed::EmbeddedProfile().userSid);ULONG creator=0;
    if(!GetNamedPipeServerProcessId(result.input.Get(),&creator)||creator!=original.pid||!original.Current())Refuse("trusted_inherited_peer_channel_refused");
    result.originalPeer=std::move(original.handle);
    const auto header=PipeReadBounded(result.input.Get(),106);
    if(!std::equal(header.begin(),header.begin()+8,std::array<unsigned char,8>{'L','T','R','B',1,static_cast<unsigned char>(receiver==Role::Daemon?1:0),0,0}.begin())||
        Fixed<32>(header.data()+72)!=reviewed::EmbeddedProfile().sourceSetHash)Refuse("trusted_inherited_bootstrap_source_refused");
    result.bindings={Fixed<16>(header.data()+8),Fixed<16>(header.data()+24),Fixed<16>(header.data()+40),Fixed<16>(header.data()+56)};
    const auto length=Number(header.data()+104,2);if(length>512||detail::Zero(result.bindings.channelNonce))Refuse("trusted_inherited_bootstrap_binding_refused");
    if(length){const auto chars=PipeReadBounded(result.input.Get(),static_cast<std::size_t>(length)*2);for(std::size_t i=0;i<length;++i)result.pipe+=static_cast<wchar_t>(Number(chars.data()+i*2,2));}
    if(receiver==Role::Controller&&(!result.pipe.empty()||!detail::Zero(result.bindings.sessionRef)||!detail::Zero(result.bindings.generation)||!detail::Zero(result.bindings.bootNonce)))Refuse("trusted_controller_bootstrap_tail_refused");
    if(receiver==Role::Daemon&&(result.pipe.empty()||detail::Zero(result.bindings.sessionRef)||detail::Zero(result.bindings.generation)||detail::Zero(result.bindings.bootNonce)))Refuse("trusted_daemon_bootstrap_tail_refused");
    if(receiver==Role::Daemon){const auto tail=PipeReadBounded(result.input.Get(),56);
        result.lifecycleIssuedAt=Number(tail.data(),8);result.sessionDeadline=Number(tail.data()+8,8);result.dispositionDeadline=Number(tail.data()+16,8);result.lifecycleBinding=Fixed<32>(tail.data()+24);
        const auto now=GetTickCount64();if(!result.lifecycleIssuedAt||result.lifecycleIssuedAt>=result.sessionDeadline||result.sessionDeadline-result.lifecycleIssuedAt>28800000||
            result.sessionDeadline>std::numeric_limits<std::uint64_t>::max()-600000||result.dispositionDeadline!=result.sessionDeadline+600000||detail::Zero(result.lifecycleBinding)||
            now<result.lifecycleIssuedAt||now>=result.sessionDeadline)Refuse("trusted_inherited_lifecycle_clock_refused",0,true);}
    PipeRequireEofBounded(result.input.Get());
    if(receiver==Role::Daemon){Process controller(std::move(result.originalController),seal->ResolvedEnrollment().controllerImage,seal->ResolvedEnrollment().userSid);if(controller.birth>original.birth)Refuse("trusted_inherited_controller_creation_order");result.originalController=std::move(controller.handle);}
    return std::move(result);
    }catch(...){(void)retained.release();throw;}
}
void SendBrokerBootstrapFixed(Bootstrap& original,const std::wstring& pipe,const Id& nonce){
    if(nonce!=original.bindings.channelNonce||pipe.empty()||pipe.size()>512||!detail::ProcessLive(original.originalPeer.Get()))Refuse("trusted_broker_bootstrap_late_guard");
    PipeWriteInitial(original.output.Get(),BootstrapBody(original.bindings,pipe));
    HANDLE writer=original.output.Take();if(!CloseHandle(writer)){
        original.failedBootstrapWriter=writer;
        Refuse("trusted_broker_bootstrap_writer_close_unknown",GetLastError(),true);}
}
CreatedChild NativeClient::CreateOriginalDaemonFixed(InstalledEnrollment& enrollment,const phase::WireBindings& binding,const std::wstring& pipe,
    void* originalController,const PreparedLifecycleGrant& lifecycle){
    if(!enrollment.Fresh(true).ok)Refuse("trusted_daemon_precreate_source_guard");Result opened;
    auto original=production::OriginalSealWitness::OpenFixed(opened);if(!original||!original->Fresh())Refuse("trusted_daemon_original_seal_closed");
    const auto& resolved=original->ResolvedEnrollment();const auto& installed=enrollment.Profile();
    if(resolved.installation!=installed.installation||resolved.lineage!=installed.lineage||resolved.policyHash!=installed.policyHash||
        resolved.sourceSetHash!=installed.sourceSetHash||resolved.policyEpoch!=installed.policyEpoch||!detail::SamePin(resolved.runtime,installed.runtime)||
        !detail::SamePin(resolved.repository,installed.repository))Refuse("trusted_daemon_original_enrollment_mismatch");
    return CreateFixedChild(Role::Daemon,original,binding,pipe,&enrollment,&lifecycle,originalController);
}
struct ProjectCapture final {
    enum class Stage {Bound,Selected,Guarded,Delivered,Submitted,Terminal,Unknown};
    Stage stage=Stage::Bound;Id command{},execution{},lease{},handler{},actor{};
    Digest script{},snapshot{},context{},transport{},selection{},receipt{};
    std::uint64_t expiry=0,observationOrdinal=0,terminalMono=0;
    std::string panelConnection,panelGeneration;
    phase::ToolCode tool=phase::ToolCode::GetProjectInfo;bool inspection=false,preparationDelivery=false,readProjected=false,stageDelivery=false,restorationDelivery=false,restorationReadOnly=false,originalBaselineCurrent=false;std::uint16_t savedCurrentSlot=0,restoredCurrentSlot=0;
    std::string originalScript;Bytes originalResult;Digest operationScope{};std::shared_ptr<AmeOriginalJob> originalAmeJob;
    bool ameSourceDelivery=false,ameEnqueueDelivery=false,ameStartDelivery=false,ameCompletionDelivery=false;Digest originalBridgeTalkHash{};std::string originalBridgeTalkBody;
    std::shared_ptr<Capability> originalHandler,originalManifest,baselineRead,executionGate,workingCopy,restorationProgram;Bytes preparationDescriptor;
    std::shared_ptr<AuthenticatedRequest> deliveryRequest;
};
struct RestorationProgramCapture final {
    explicit RestorationProgramCapture(NativeClient* original):owner(original){}
    NativeClient* const owner;std::uint16_t slot=0;Digest restoreScope{},manifest{},prefixHash{};Bytes descriptor,restoredAfter;std::string originalPrefix,originalSuffix;
    std::shared_ptr<Capability> stageGate,workingCopy,originalManifest;std::shared_ptr<ProjectCapture> restoreCommand;
    Id actor{};bool bound=false,effectSelected=false,completed=false,unknown=false;
};
struct ObservationCapture final {Id challenge{},target{},actorRef{};phase::ChallengePurpose purpose{};Digest actor{},context{},transport{},snapshot{},readiness{};
    std::uint64_t ordinal=0,observed=0,generation=0,panelEpoch=0;std::string panelConnection,panelGeneration,panelInstance,panelChatSession;};
namespace {
template<class T> T PeValue(const Bytes& bytes,std::size_t offset){if(offset>bytes.size()||sizeof(T)>bytes.size()-offset)Refuse("trusted_exporter_pe_bounds_refused");T value{};std::memcpy(&value,bytes.data()+offset,sizeof(T));return value;}
Bytes OriginalMemory(HANDLE original,std::uintptr_t address,std::size_t count,std::uintptr_t originalBase,bool executable=false){if(!address||!count||count>16777216||address>std::numeric_limits<std::uintptr_t>::max()-count)Refuse("trusted_exporter_memory_bounds_refused");
    for(std::size_t at=0;at<count;){MEMORY_BASIC_INFORMATION region{};if(VirtualQueryEx(original,reinterpret_cast<const void*>(address+at),&region,sizeof(region))!=sizeof(region)||
            region.State!=MEM_COMMIT||region.Type!=MEM_IMAGE||reinterpret_cast<std::uintptr_t>(region.AllocationBase)!=originalBase||!region.RegionSize||
            (region.Protect&(PAGE_GUARD|PAGE_NOACCESS))||(executable&&region.Protect!=PAGE_EXECUTE&&region.Protect!=PAGE_EXECUTE_READ))Refuse("trusted_exporter_original_image_region_refused",GetLastError());
        const auto base=reinterpret_cast<std::uintptr_t>(region.BaseAddress);if(base>address+at||region.RegionSize>std::numeric_limits<std::uintptr_t>::max()-base||base+region.RegionSize<=address+at)
            Refuse("trusted_exporter_image_region_bounds_refused");at+=std::min(count-at,static_cast<std::size_t>(base+region.RegionSize-(address+at)));}
    Bytes bytes(count);SIZE_T actual=0;if(!ReadProcessMemory(original,reinterpret_cast<const void*>(address),bytes.data(),count,&actual)||actual!=count)Refuse("trusted_exporter_original_memory_unavailable",GetLastError());return bytes;}
Digest OriginalExporterPages(HANDLE original,std::uintptr_t loadedBase,std::uint64_t loadedSize,const std::vector<pe::SectionSpan>& measured){
    static_assert(PAGE_EXECUTE==0x10&&PAGE_EXECUTE_READ==0x20,"Exact Windows executable protection map required");
    if(!loadedBase||!loadedSize||loadedSize>268435456||loadedBase>std::numeric_limits<std::uintptr_t>::max()-loadedSize||measured.empty())Refuse("trusted_exporter_image_census_bounds_refused");
    Bytes census;std::uint64_t at=0;std::uint32_t regions=0;
    while(at<loadedSize){if(++regions>65536)Refuse("trusted_exporter_image_census_region_bound");MEMORY_BASIC_INFORMATION region{};
        if(VirtualQueryEx(original,reinterpret_cast<const void*>(loadedBase+at),&region,sizeof(region))!=sizeof(region)||!region.RegionSize)
            Refuse("trusted_exporter_image_census_query_refused",GetLastError());
        const auto base=reinterpret_cast<std::uintptr_t>(region.BaseAddress);if(base>loadedBase+at||region.RegionSize>std::numeric_limits<std::uintptr_t>::max()-base||base+region.RegionSize<=loadedBase+at)
            Refuse("trusted_exporter_image_census_region_bounds_refused");
        if(region.State==MEM_COMMIT&&(region.Type!=MEM_IMAGE||reinterpret_cast<std::uintptr_t>(region.AllocationBase)!=loadedBase))Refuse("trusted_exporter_image_census_private_remap_refused");
        if(region.Protect&0xf0){if(region.State!=MEM_COMMIT||region.Type!=MEM_IMAGE||reinterpret_cast<std::uintptr_t>(region.AllocationBase)!=loadedBase||
                !pe::ApprovedExecutableProtection(region.Protect)||base<loadedBase||
                !pe::ExecutableRegionMeasured(base-loadedBase,region.RegionSize,loadedSize,measured))Refuse("trusted_exporter_unmeasured_or_writable_executable_region_refused");}
        detail::PutU64(census,base);detail::PutU64(census,region.RegionSize);detail::PutU64(census,reinterpret_cast<std::uintptr_t>(region.AllocationBase));
        detail::PutU64(census,region.State);detail::PutU64(census,region.Type);detail::PutU64(census,region.Protect);detail::PutU64(census,region.AllocationProtect);
        at+=std::min(loadedSize-at,static_cast<std::uint64_t>(base+region.RegionSize-(loadedBase+at)));}
    return DomainHash("lcp2.production.original-exporter-whole-image-page-census.v1",census);
}
Digest OriginalExporterCode(HANDLE original,HANDLE heldFile,std::uintptr_t loadedBase,std::uint64_t loadedSize){
    const auto originalBirth=detail::ProcessBirth(original);const auto originalPid=GetProcessId(original);const auto originalPin=detail::ReadPin(heldFile,false);
    if(!originalPid||!detail::ProcessLive(original))Refuse("trusted_exporter_original_process_refused");
    const auto file=detail::ReadExact(heldFile,67108864);const auto sourceHash=detail::Hash(file);const auto dos=PeValue<IMAGE_DOS_HEADER>(file,0);
    if(dos.e_magic!=IMAGE_DOS_SIGNATURE||dos.e_lfanew<0)Refuse("trusted_exporter_pe_dos_refused");const auto ntOffset=static_cast<std::size_t>(dos.e_lfanew);
    const auto nt=PeValue<IMAGE_NT_HEADERS64>(file,ntOffset);
    if(nt.Signature!=IMAGE_NT_SIGNATURE||nt.FileHeader.Machine!=IMAGE_FILE_MACHINE_AMD64||nt.OptionalHeader.Magic!=IMAGE_NT_OPTIONAL_HDR64_MAGIC||
        nt.FileHeader.SizeOfOptionalHeader!=sizeof(IMAGE_OPTIONAL_HEADER64)||!nt.FileHeader.NumberOfSections||nt.FileHeader.NumberOfSections>96||
        nt.OptionalHeader.SizeOfImage!=loadedSize||loadedSize>268435456||loadedBase>std::numeric_limits<std::uintptr_t>::max()-loadedSize||nt.OptionalHeader.NumberOfRvaAndSizes<=IMAGE_DIRECTORY_ENTRY_BASERELOC)
        Refuse("trusted_exporter_pe_profile_refused");
    if(!loadedBase||!loadedSize||sizeof(dos)>loadedSize||ntOffset>loadedSize||sizeof(nt)>loadedSize-ntOffset)Refuse("trusted_exporter_pe_header_image_bounds_refused");
    const auto remoteDos=OriginalMemory(original,loadedBase,sizeof(dos),loadedBase);
    if(std::memcmp(remoteDos.data(),&dos,sizeof(dos))!=0)Refuse("trusted_exporter_loaded_dos_header_changed");
    const auto remote=OriginalMemory(original,loadedBase+ntOffset,sizeof(IMAGE_NT_HEADERS64),loadedBase);
    if(std::memcmp(remote.data(),&nt,sizeof(nt))!=0)Refuse("trusted_exporter_loaded_header_changed");
    const auto sectionsOffset=ntOffset+sizeof(DWORD)+sizeof(IMAGE_FILE_HEADER)+nt.FileHeader.SizeOfOptionalHeader;
    const auto sectionsBytes=static_cast<std::size_t>(nt.FileHeader.NumberOfSections)*sizeof(IMAGE_SECTION_HEADER);
    if(sectionsOffset>file.size()||sectionsBytes>file.size()-sectionsOffset||sectionsOffset>nt.OptionalHeader.SizeOfHeaders||sectionsBytes>nt.OptionalHeader.SizeOfHeaders-sectionsOffset||
        sectionsOffset>loadedSize||sectionsBytes>loadedSize-sectionsOffset)Refuse("trusted_exporter_pe_section_table_bounds_refused");
    const auto remoteSections=OriginalMemory(original,loadedBase+sectionsOffset,sectionsBytes,loadedBase);
    if(!std::equal(remoteSections.begin(),remoteSections.end(),file.begin()+sectionsOffset))Refuse("trusted_exporter_loaded_section_headers_changed");
    std::vector<IMAGE_SECTION_HEADER> sections;for(std::uint16_t i=0;i<nt.FileHeader.NumberOfSections;++i){const auto section=PeValue<IMAGE_SECTION_HEADER>(file,sectionsOffset+static_cast<std::size_t>(i)*sizeof(IMAGE_SECTION_HEADER));
        if(section.VirtualAddress>loadedSize||section.SizeOfRawData>loadedSize-section.VirtualAddress||section.PointerToRawData>file.size()||section.SizeOfRawData>file.size()-section.PointerToRawData)
            Refuse("trusted_exporter_pe_section_refused");sections.push_back(section);}
    std::vector<pe::SectionSpan> spans;spans.reserve(sections.size());
    for(std::size_t i=0;i<sections.size();++i){const auto& section=sections[i];pe::SectionSpan span;
        const auto next=i+1<sections.size()?sections[i+1].VirtualAddress:nt.OptionalHeader.SizeOfImage;
        if(!pe::SectionMappedSpan(section.VirtualAddress,section.Misc.VirtualSize,section.PointerToRawData,section.SizeOfRawData,next,
                nt.OptionalHeader.SizeOfImage,file.size(),nt.OptionalHeader.SizeOfHeaders,nt.OptionalHeader.SectionAlignment,nt.OptionalHeader.FileAlignment,span))
            Refuse("trusted_exporter_pe_mapped_span_refused");
        for(std::size_t prior=0;prior<i;++prior)if(section.SizeOfRawData&&sections[prior].SizeOfRawData&&
            section.PointerToRawData<static_cast<std::uint64_t>(sections[prior].PointerToRawData)+sections[prior].SizeOfRawData&&
            sections[prior].PointerToRawData<static_cast<std::uint64_t>(section.PointerToRawData)+section.SizeOfRawData)Refuse("trusted_exporter_pe_raw_section_overlap_refused");
        spans.push_back(span);}
    std::vector<pe::SectionSpan> measured;for(std::size_t i=0;i<sections.size();++i)if(sections[i].Characteristics&IMAGE_SCN_MEM_EXECUTE)measured.push_back(spans[i]);
    const auto beforePages=OriginalExporterPages(original,loadedBase,loadedSize,measured);
    const auto offsetForRva=[&](std::uint32_t rva,std::size_t count){for(const auto& section:sections)if(rva>=section.VirtualAddress&&rva-section.VirtualAddress<=section.SizeOfRawData&&
            count<=section.SizeOfRawData-(rva-section.VirtualAddress))return static_cast<std::size_t>(section.PointerToRawData)+(rva-section.VirtualAddress);Refuse("trusted_exporter_pe_rva_refused");};
    std::vector<std::uint32_t> relocated;const auto& directory=nt.OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_BASERELOC];
    if(directory.Size){if(directory.Size>1048576||directory.VirtualAddress>loadedSize||directory.Size>loadedSize-directory.VirtualAddress)Refuse("trusted_exporter_pe_relocation_directory_bounds_refused");
        const auto offset=offsetForRva(directory.VirtualAddress,directory.Size);std::size_t at=0;
        while(at<directory.Size){if(sizeof(IMAGE_BASE_RELOCATION)>directory.Size-at)Refuse("trusted_exporter_pe_relocation_block_truncated");
            const auto block=PeValue<IMAGE_BASE_RELOCATION>(file,offset+at);if(block.VirtualAddress%4096||block.SizeOfBlock<sizeof(block)||block.SizeOfBlock>directory.Size-at||
                (block.SizeOfBlock-sizeof(block))%sizeof(std::uint16_t))Refuse("trusted_exporter_pe_relocation_refused");
            for(std::size_t entry=sizeof(block);entry<block.SizeOfBlock;entry+=2){const auto value=PeValue<std::uint16_t>(file,offset+at+entry);const auto type=value>>12;
                if(type==IMAGE_REL_BASED_ABSOLUTE)continue;if(type!=IMAGE_REL_BASED_DIR64||block.VirtualAddress>std::numeric_limits<std::uint32_t>::max()-(value&0xfff))Refuse("trusted_exporter_pe_relocation_type_refused");
                const auto rva=block.VirtualAddress+(value&0xfff);bool mapped=false;for(const auto& span:spans)if(rva>=span.rva&&rva-span.rva<=span.mappedBytes&&sizeof(std::uint64_t)<=span.mappedBytes-(rva-span.rva))mapped=true;
                if(!mapped||rva>loadedSize||sizeof(std::uint64_t)>loadedSize-rva)Refuse("trusted_exporter_pe_relocation_image_bounds_refused");
                for(const auto prior:relocated)if(static_cast<std::uint64_t>(rva)<static_cast<std::uint64_t>(prior)+8&&static_cast<std::uint64_t>(prior)<static_cast<std::uint64_t>(rva)+8)
                    Refuse("trusted_exporter_pe_relocation_overlap_refused");
                if(relocated.size()>=65536)Refuse("trusted_exporter_pe_relocation_count_refused");relocated.push_back(rva);}
            at+=block.SizeOfBlock;}}
    Bytes commitment;detail::PutU64(commitment,loadedSize);const auto delta=static_cast<std::uint64_t>(loadedBase)-nt.OptionalHeader.ImageBase;unsigned codeSections=0;std::size_t codeBytes=0;
    for(std::size_t i=0;i<sections.size();++i){const auto& section=sections[i];const auto& span=spans[i];if(!(section.Characteristics&IMAGE_SCN_MEM_EXECUTE))continue;
        if(section.Characteristics&IMAGE_SCN_MEM_WRITE)Refuse("trusted_exporter_writable_code_refused");
        if(span.mappedBytes>16777216-codeBytes)Refuse("trusted_exporter_executable_byte_bound");codeBytes+=span.mappedBytes;
        Bytes expected;if(!pe::ExpectedSection(file,span,expected))Refuse("trusted_exporter_expected_full_span_refused");
        auto memory=OriginalMemory(original,loadedBase+span.rva,span.mappedBytes,loadedBase,true);const auto beforeMemory=memory;
        for(const auto rva:relocated)if(rva>=span.rva&&rva-span.rva<span.mappedBytes){if(!pe::NormalizeDir64(memory,rva-span.rva,delta))Refuse("trusted_exporter_code_relocation_bounds_refused");}
        if(memory!=expected)Refuse("trusted_exporter_loaded_full_code_span_changed");
        if(OriginalMemory(original,loadedBase+span.rva,span.mappedBytes,loadedBase,true)!=beforeMemory)Refuse("trusted_exporter_loaded_code_changed_during_capture");
        detail::PutU64(commitment,span.rva);detail::PutU64(commitment,span.mappedBytes);detail::PutU64(commitment,span.rawBytes);Put(commitment,detail::Hash(memory));++codeSections;}
    if(!codeSections)Refuse("trusted_exporter_executable_sections_absent");
    if(OriginalExporterPages(original,loadedBase,loadedSize,measured)!=beforePages||OriginalMemory(original,loadedBase,sizeof(dos),loadedBase)!=remoteDos||OriginalMemory(original,loadedBase+ntOffset,sizeof(IMAGE_NT_HEADERS64),loadedBase)!=remote||
        OriginalMemory(original,loadedBase+sectionsOffset,sectionsBytes,loadedBase)!=remoteSections||
        !detail::SamePin(detail::ReadPin(heldFile,false),originalPin)||detail::Hash(detail::ReadExact(heldFile,67108864))!=sourceHash||
        !detail::ProcessLive(original)||GetProcessId(original)!=originalPid||detail::ProcessBirth(original)!=originalBirth)Refuse("trusted_exporter_after_memory_source_guard_refused");
    Put(commitment,beforePages);return DomainHash("lcp2.production.original-exporter-full-mapped-executable-sections.v3",commitment);
}
std::pair<std::uintptr_t,std::uint64_t> OriginalExporterModule(DWORD pid,const reviewed::File& exporter){Held modules(CreateToolhelp32Snapshot(TH32CS_SNAPMODULE|TH32CS_SNAPMODULE32,pid));
    if(!modules.Valid())Refuse("trusted_exporter_original_module_inventory_unavailable",GetLastError());MODULEENTRY32W row{};row.dwSize=sizeof(row);
    if(!Module32FirstW(modules.Get(),&row))Refuse("trusted_exporter_original_module_inventory_unavailable",GetLastError());std::pair<std::uintptr_t,std::uint64_t> found{};unsigned count=0;
    const auto separator=exporter.pin.canonicalPath.find_last_of(L'\\');if(separator==std::wstring::npos)Refuse("trusted_exporter_fixed_name_refused");const auto basename=exporter.pin.canonicalPath.substr(separator+1);
    do{if(++count>1024)Refuse("trusted_exporter_module_inventory_bound");if(_wcsicmp(row.szModule,basename.c_str())==0){if(found.first)Refuse("trusted_exporter_loaded_module_ambiguous");
            Held image(CreateFileW(row.szExePath,GENERIC_READ|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
            if(!image.Valid()||!detail::SamePin(detail::ReadPin(image.Get(),false),exporter.pin)||detail::Hash(detail::ReadExact(image.Get(),134217728))!=exporter.sha256)Refuse("trusted_exporter_loaded_module_source_refused");
            found={reinterpret_cast<std::uintptr_t>(row.modBaseAddr),row.modBaseSize};}row.dwSize=sizeof(row);}while(Module32NextW(modules.Get(),&row));
    if(GetLastError()!=ERROR_NO_MORE_FILES||!found.first||!found.second)Refuse("trusted_exporter_original_module_absent_or_unknown",GetLastError());return found;
}
}
bool AmeOriginalProcess::Current()const noexcept{try{
    if(unknown_||!process_.Valid()||!image_.Valid()||!exporterFile_.Valid()||!detail::ProcessLive(process_.Get())||detail::ProcessBirth(process_.Get())!=birth_||
        GetProcessId(process_.Get())!=pid_||detail::ProcessSid(process_.Get())!=sid_||detail::ProcessImage(process_.Get())!=imagePin_.pin.canonicalPath||
        !detail::SamePin(detail::ReadPin(image_.Get(),false),imagePin_.pin)||detail::Hash(detail::ReadExact(image_.Get(),134217728))!=imagePin_.sha256||
        !detail::SamePin(detail::ReadPin(exporterFile_.Get(),false),exporterPin_.pin)||detail::Hash(detail::ReadExact(exporterFile_.Get(),67108864))!=exporterPin_.sha256)return false;
    for(const auto& parent:sourceAncestors_)if(!parent.Valid())return false;else detail::ReadPin(parent.Get(),true);
    const auto module=OriginalExporterModule(pid_,exporterPin_);return module.first==exporterBase_&&module.second==exporterSize_&&
        OriginalExporterCode(process_.Get(),exporterFile_.Get(),exporterBase_,exporterSize_)==loadedExecutableSections_&&detail::ProcessLive(process_.Get())&&detail::ProcessBirth(process_.Get())==birth_;
}catch(...){return false;}}
struct NativeClient::Data final {
    Role role;std::mutex serial;std::unique_ptr<InstalledEnrollment> enrollment;
    std::shared_ptr<production::OriginalSealWitness> originalSeal;
    std::vector<std::unique_ptr<CheckedFile>> files;
    std::unique_ptr<Process> self,peer,controller;Held originalThread,pipe;
    std::unique_ptr<Bootstrap> bootstrap;
    std::unique_ptr<CreatedChild> originalChild;
    std::unique_ptr<phase::WireChannel> wire;
    std::vector<std::unique_ptr<Io>> unsettled;
    std::deque<phase::Frame> challenges;
    std::unique_ptr<Process> preactor;std::vector<std::unique_ptr<Process>> captured;
    std::unique_ptr<CheckedDirectory> bootstrapDirectory;std::unique_ptr<BootstrapHelper> panelHelper;
    DWORD listenerPid=0;std::uint64_t lastMono=0,outgoing=0;
    std::array<std::uint16_t,27> capIssued{};
    std::uint16_t ancillaryServices=0;std::map<Digest,unsigned> manualGroupServices;bool firstPanelNextRetained=false,startupNullCurrentRetained=false;
    std::vector<std::shared_ptr<AuthenticatedRequest>> requests;
    std::atomic<bool> revoked{false},unknown{false},actorClosed{false};
    bool opened=false,ensured=false,loadedSources=false,httpOpened=false,preactorAttempted=false,actorAttempted=false;
    std::vector<HANDLE> failedCloseHandles;
    bool drainObserved=false,drainAcknowledged=false,shutdownObserved=false,shutdownAcknowledged=false;
    Id dispositionRef{};
    Digest observationSnapshot{},observationContext{},observationTransport{},observationActorHash{};
    Id observationActor{},observationTarget{};std::uint64_t observationOrdinal=0,observationMono=0,sourceGeneration=0;
    std::string panelConnection,panelGeneration,panelInstance,panelChatSession;std::uint64_t panelEpoch=0;
    std::vector<std::shared_ptr<ProjectCapture>> projects;
    std::vector<std::shared_ptr<ExecutionCapture>> executionCaptures;
    std::vector<std::weak_ptr<Capability>> executionHandlers,readHandlers,proposalTerminals;std::shared_ptr<Capability> lastCompletedGate;phase::Frame lastCompletedTerminal{};
    std::shared_ptr<NativeTitleManifest> titleManifest;
    std::shared_ptr<Capability> titleSelection;
    std::shared_ptr<AmeOriginalProcess> ame;bool ameCaptureAttempted=false;
    struct CheckpointFile final {enum class Stage:std::uint8_t{Reserved,Created,Accepted,Unknown};Stage stage=Stage::Reserved;
        std::shared_ptr<Capability> gate;std::unique_ptr<CheckedFile> file;std::unique_ptr<CheckedDirectory> root;Held writer;
        ObjectPin createdPin;Digest sourceHash{},receipt{},terminal{};Id ref{};Bytes result;std::wstring name;std::uint16_t slot=0;bool effectSelected=false;};
    std::unique_ptr<CheckpointFile> checkpoint;
    std::array<std::unique_ptr<CheckpointFile>,2> cleanCopies{};
    // Issued before D42 of the one fixed Stage. This row records a known
    // restoration obligation; no current READ or JSON echo can clear it.
    struct RestorationDebt final {enum class State:std::uint8_t{Preissued,Selected,StageTerminal,Restored,Unknown};State state=State::Preissued;
        std::uint16_t slot=0;std::shared_ptr<Capability> stageGate,workingCopy;std::shared_ptr<ProjectCapture> stageCommand;
        Bytes exactDescriptor,stageResult;Digest descriptorHash{},stageTerminal{};Id actor{};bool effectSelected=false;};
    std::array<std::unique_ptr<RestorationDebt>,2> restorationDebts{};
    // No producer assigns these until the actual typed Restore consumer is
    // bound. A bookkeeping debt cannot make the Stage effect reachable.
    std::array<std::shared_ptr<Capability>,2> preissuedRestorationPrograms{};
    struct SavedSnapshot final {std::shared_ptr<Capability> stageTerminal,workingCopy;std::unique_ptr<CheckedFile> file;std::unique_ptr<CheckedDirectory> root;
        ObjectPin pin;Digest hash{},stageReceipt{};Id terminalRef{};std::uint16_t slot=0;std::uint64_t compId=0,rootId=0,revision=0;std::string guid;Bytes actualPostSave;bool unknown=false;};
    std::array<std::unique_ptr<SavedSnapshot>,2> savedSnapshots{};
    std::array<std::shared_ptr<AmeOriginalJob>,2> originalJobs{};
    std::array<std::shared_ptr<AmeOriginalJob>,2> ameSourceJobs{};std::string ownAmeWrapperNonce;
    std::array<std::shared_ptr<Capability>,2> restorationReceipts{};std::array<Bytes,2> restoredSourceReadbacks{};
    std::string cepTarget,cepFrame,cepContextUniqueId;std::uint32_t cepContextId=0;
    std::vector<std::string> cepStaticScriptIds;std::set<std::string> cepDiagnosticIds;
    Id preactorRef{};bool bootstrapEffectSpent=false;
    HttpTransportOwner* httpOwner=nullptr;phase::WireBindings cleanupBindings{};Digest cleanupBinding{};
    explicit Data(Role own):role(own){}
    void OwnCurrentNode(){const auto& expected=originalSeal->ResolvedEnrollment();const auto& fixed=EmbeddedProfile();
        HANDLE original=nullptr;if(!DuplicateHandle(GetCurrentProcess(),GetCurrentProcess(),GetCurrentProcess(),&original,PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,0))Refuse("trusted_original_current_node_duplicate_failed",GetLastError());
        self=std::make_unique<Process>(Held(original),expected.node,expected.userSid);
        for(const wchar_t* key:{L"NODE_OPTIONS",L"NODE_PATH"}){wchar_t value[1]{};SetLastError(ERROR_SUCCESS);const auto count=GetEnvironmentVariableW(key,value,1);if(count||GetLastError()!=ERROR_ENVVAR_NOT_FOUND)Refuse("trusted_original_node_preload_environment_refused");}
        int argc=0;wchar_t** arguments=CommandLineToArgvW(GetCommandLineW(),&argc);if(!arguments)Refuse("trusted_original_node_command_line_unavailable",GetLastError());
        std::wstring wanted=role==Role::Controller?fixed.adapterLocator:std::wstring{};
        if(role==Role::Daemon)for(const auto& source:expected.sourceFiles)if(source.components==std::vector<std::wstring>{L"mcp-server",L"bridge-daemon.js"}){
            if(!wanted.empty())Refuse("trusted_original_daemon_entry_ambiguous");wanted=source.pin.canonicalPath;}
        const bool exact=argc==2&&arguments[0]&&arguments[1]&&_wcsicmp(arguments[0],fixed.nodeLocator.c_str())==0&&std::wstring(arguments[1])==wanted;
        LocalFree(arguments);if(!exact)Refuse("trusted_original_node_fixed_entry_required");
    }
    void Files(){const auto& p=EmbeddedProfile();Result result;originalSeal=production::OriginalSealWitness::OpenFixed(result);if(!originalSeal)Refuse(result.code.c_str(),result.win32Error,result.unknown,result.unavailable);
        ExecutionCost combinedWorst;if(originalSeal->ResolvedEnrollment().capabilities!=reviewed::kCombinedExecutionCapabilities||!p.execution.Validate(combinedWorst))Refuse("trusted_combined_execution_policy_not_frozen");
        for(const auto* file:{&originalSeal->ResolvedEnrollment().node,&originalSeal->ArtifactFile(production::ArtifactRole::Broker),&originalSeal->ArtifactFile(production::ArtifactRole::Addon),&p.adapter,&p.transport})files.push_back(std::make_unique<CheckedFile>(*file));
        if(role==Role::Daemon)files.push_back(std::make_unique<CheckedFile>(p.execution.sourceProject));
        for(const auto& source:p.nodeSources){if(source.selector==0||detail::Zero(source.compiled)||source.url.empty()||!source.roles||(source.roles&~3u)||!source.utf8ByteLength||
                source.utf8ByteLength>static_cast<std::uint64_t>(std::numeric_limits<int>::max()))Refuse("trusted_loaded_source_definition_invalid");
            if((source.roles&static_cast<unsigned>(role))&&!source.file.components.empty())files.push_back(std::make_unique<CheckedFile>(source.file));}
        const auto& definition=production::EmbeddedDefinition();for(const auto* credential:{&definition.automationCredential,&definition.panelCredential})files.push_back(std::make_unique<CheckedFile>(*credential));
        if(role==Role::Daemon){bootstrapDirectory=std::make_unique<CheckedDirectory>(p.panelBootstrapRoot);detail::AssertEmptyDirectory(bootstrapDirectory->directory.Get());}
        if(p.bridgePort!=3456||p.cdpPort!=8870||p.nodeSources.empty()||p.nodeSources.size()>65535||p.panelFiles.size()!=8||
            !(role==Role::Controller?p.controllerSourceBytes:p.daemonSourceBytes)||reviewed::EmbeddedProfile().maximumSessionMs!=28800000||reviewed::EmbeddedProfile().maximumLeaseMs!=60000)
            Refuse("trusted_fixed_profile_refused");
    }
    bool Current(bool lifecycle=false){const auto now=GetTickCount64();if(now<lastMono||(!lifecycle&&(revoked||actorClosed))||unknown||!originalSeal||!originalSeal->Fresh()||!self||!self->Current()||!peer||!peer->Current()||!pipe.Valid()||
            !std::all_of(files.begin(),files.end(),[](const auto& file){return file->Current();})||
            (bootstrapDirectory&&!bootstrapDirectory->Current())||(panelHelper&&panelHelper->source&&!panelHelper->source->Current()))return false;
        if(role==Role::Daemon&&(!bootstrap||!bootstrap->lifecycleIssuedAt||now<bootstrap->lifecycleIssuedAt||now>=(lifecycle?bootstrap->dispositionDeadline:bootstrap->sessionDeadline)))return false;
        ULONG pid=0;if(!GetNamedPipeServerProcessId(pipe.Get(),&pid)||pid!=peer->pid)return false;lastMono=now;return true;}
    void Connect(const std::wstring& name,const phase::WireBindings& binding,phase::BindingStage stage){
        pipe=Held(CreateFileW(name.c_str(),GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_EXISTING,FILE_FLAG_OVERLAPPED,nullptr));
        if(!pipe.Valid())Refuse("trusted_original_pipe_open_refused",GetLastError());DWORD mode=PIPE_READMODE_MESSAGE;
        if(!SetNamedPipeHandleState(pipe.Get(),&mode,nullptr,nullptr))Refuse("trusted_original_pipe_mode_refused",GetLastError());
        wire=std::make_unique<phase::WireChannel>(role==Role::Controller?phase::Direction::BrokerToController:phase::Direction::BrokerToDaemon,binding,stage);
        if(!Current()||wire->Closed())Refuse("trusted_original_server_peer_refused");
    }
    Bytes Transfer(bool write,const Bytes& input){
        auto io=std::make_unique<Io>(write?input.size():phase::kMaximumFrameBytes);if(write)io->bytes=input;DWORD count=0;
        const BOOL immediate=write?WriteFile(pipe.Get(),io->bytes.data(),static_cast<DWORD>(io->bytes.size()),&count,&io->state):
            ReadFile(pipe.Get(),io->bytes.data(),static_cast<DWORD>(io->bytes.size()),&count,&io->state);
        if(!immediate){if(GetLastError()!=ERROR_IO_PENDING){unknown=true;Refuse("trusted_original_io_unknown",GetLastError(),true);}io->pending=true;
            const DWORD wait=WaitForSingleObject(io->event.Get(),static_cast<DWORD>(kIoMs));
            if(wait!=WAIT_OBJECT_0){CancelIoEx(pipe.Get(),&io->state);
                const DWORD settled=WaitForSingleObject(io->event.Get(),static_cast<DWORD>(kIoMs));
                if(settled==WAIT_OBJECT_0){DWORD ignored=0;GetOverlappedResult(pipe.Get(),&io->state,&ignored,FALSE);io->pending=false;}
                else unsettled.push_back(std::move(io));unknown=true;Refuse("trusted_original_io_timeout_no_replay",0,true);}
            if(!GetOverlappedResult(pipe.Get(),&io->state,&count,FALSE)){io->pending=false;unknown=true;Refuse("trusted_original_io_settlement_unknown",GetLastError(),true);}io->pending=false;
        }
        if(!count||(write&&count!=input.size())){unknown=true;Refuse("trusted_original_io_partial",0,true);}io->bytes.resize(count);return io->bytes;
    }
};
NativeClient::NativeClient(std::unique_ptr<Data> data):data_(std::move(data)){}
NativeClient::~NativeClient(){
    // GC is never an implicit revoke, retry, abort or stop. Unknown overlapped
    // buffers and live original ownership remain retained until process exit.
    if(data_){const bool liveOriginal=(data_->originalChild&&data_->originalChild->process.Valid()&&WaitForSingleObject(data_->originalChild->process.Get(),0)!=WAIT_OBJECT_0)||
            (data_->peer&&data_->peer->handle.Valid()&&WaitForSingleObject(data_->peer->handle.Get(),0)!=WAIT_OBJECT_0)||
            (data_->panelHelper&&data_->panelHelper->process.Valid()&&!data_->panelHelper->settled);
        if(!data_->revoked||data_->unknown||!data_->unsettled.empty()||liveOriginal)(void)data_.release();}
}
std::unique_ptr<NativeClient> NativeClient::OpenControllerFixed(){
    auto d=std::make_unique<Data>(Role::Controller);d->Files();Result result;d->enrollment=InstalledEnrollment::OpenProductionFixed(d->originalSeal,result);
    if(!d->enrollment)Refuse(result.code.c_str(),result.win32Error,result.unknown,result.unavailable);
    d->OwnCurrentNode();
    try{
    phase::WireBindings binding{};binding.channelNonce=detail::RandomId();
    d->originalChild=std::make_unique<CreatedChild>();*d->originalChild=CreateFixedChild(Role::Controller,d->originalSeal,binding,L"",nullptr,nullptr,nullptr);
    if(!d->originalChild->status.ok){d->unknown=d->originalChild->status.unknown||d->originalChild->process.Valid();
        Refuse(d->originalChild->status.code.c_str(),d->originalChild->status.win32Error,d->unknown,d->originalChild->status.unavailable);}
    HANDLE peerQuery=nullptr;if(!DuplicateHandle(GetCurrentProcess(),d->originalChild->process.Get(),GetCurrentProcess(),&peerQuery,
        PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,0))Refuse("trusted_created_broker_query_duplicate_failed",GetLastError(),true);
    // Query duplication does not replace the retained returned creation HANDLE.
    d->peer=std::make_unique<Process>(Held(peerQuery),d->originalSeal->ArtifactFile(production::ArtifactRole::Broker),reviewed::EmbeddedProfile().userSid);
    d->bootstrap=std::move(d->originalChild->bootstrap);
    const auto header=PipeReadBounded(d->bootstrap->input.Get(),106);if(!std::equal(header.begin(),header.begin()+8,std::array<unsigned char,8>{'L','T','R','B',1,0,0,0}.begin())||
        Fixed<16>(header.data()+8)!=binding.channelNonce||!detail::Zero(Fixed<16>(header.data()+24))||!detail::Zero(Fixed<16>(header.data()+40))||!detail::Zero(Fixed<16>(header.data()+56))||Fixed<32>(header.data()+72)!=reviewed::EmbeddedProfile().sourceSetHash)
        Refuse("trusted_original_broker_bootstrap_mismatch",0,true);
    const auto length=Number(header.data()+104,2);if(!length||length>512)Refuse("trusted_original_broker_pipe_locator_refused",0,true);
    const auto chars=PipeReadBounded(d->bootstrap->input.Get(),static_cast<std::size_t>(length)*2);std::wstring pipe;
    for(std::size_t i=0;i<length;++i)pipe+=static_cast<wchar_t>(Number(chars.data()+i*2,2));
    PipeRequireEofBounded(d->bootstrap->input.Get());
    d->Connect(pipe,binding,phase::BindingStage::BeforeOpen);return std::unique_ptr<NativeClient>(new NativeClient(std::move(d)));
    }catch(...){if(d){d->unknown=true;(void)d.release();}throw;}
}
std::unique_ptr<NativeClient> NativeClient::BindOriginalDaemonFixed(){
    // The broker already owns the exclusive fence lock. The daemon uses its
    // original sealed witness and inherited originals, never a second lock open.
    auto d=std::make_unique<Data>(Role::Daemon);d->Files();
    try{d->OwnCurrentNode();auto bootstrap=std::make_unique<Bootstrap>(ReceiveBootstrapFixed(Role::Daemon));
    d->peer=std::make_unique<Process>(std::move(bootstrap->originalPeer),d->originalSeal->ArtifactFile(production::ArtifactRole::Broker),reviewed::EmbeddedProfile().userSid);
    d->controller=std::make_unique<Process>(std::move(bootstrap->originalController),d->originalSeal->ResolvedEnrollment().controllerImage,reviewed::EmbeddedProfile().userSid);
    d->bootstrap=std::move(bootstrap);d->Connect(d->bootstrap->pipe,d->bootstrap->bindings,phase::BindingStage::Open);
    auto client=std::unique_ptr<NativeClient>(new NativeClient(std::move(d)));Bytes body;Put(body,reviewed::EmbeddedProfile().sourceSetHash);
    if(GetTickCount64()<client->data_->bootstrap->lifecycleIssuedAt||GetTickCount64()>=client->data_->bootstrap->sessionDeadline)Refuse("trusted_daemon_registration_clock_closed",0,true);
    client->Exchange(phase::Verb::BootHello,body);return client;
    }catch(...){if(d){d->unknown=true;(void)d.release();}throw;}
}
Role NativeClient::GetRole()const noexcept{return data_->role;}
std::uint16_t NativeClient::HttpFixedPort()const noexcept{return EmbeddedProfile().bridgePort;}
bool NativeClient::Unknown()const noexcept{return data_->unknown;}
std::uint64_t NativeClient::MonotonicNow()const{return GetTickCount64();}
Bytes NativeClient::OriginalDeadlineProjectionFixed(const std::shared_ptr<Capability>& command){
    RequireRole(Role::Daemon);AssertOriginalDispositionCurrent();const auto now=GetTickCount64();
    if(!data_->bootstrap||now>=data_->bootstrap->sessionDeadline||data_->bootstrap->sessionDeadline-now>28800000)Refuse("trusted_original_session_deadline_closed");
    std::string text="{\"remainingSessionMs\":"+std::to_string(data_->bootstrap->sessionDeadline-now);
    if(command){if(command->owner_!=this||!command->project_||command->spent_||command->project_->stage==ProjectCapture::Stage::Unknown||
            std::find(data_->projects.begin(),data_->projects.end(),command->project_)==data_->projects.end()||now>=command->project_->expiry||command->project_->expiry-now>30000)
            Refuse("trusted_original_command_deadline_closed");
        text+=",\"remainingCommandMs\":"+std::to_string(std::min(command->project_->expiry,data_->bootstrap->sessionDeadline)-now);}
    text+='}';return Bytes(text.begin(),text.end());
}
void NativeClient::AssertCurrent(){std::lock_guard<std::mutex> lock(data_->serial);if(!data_->Current())Refuse("trusted_original_client_guard_closed",0,data_->unknown);}
void NativeClient::AssertCapabilityCurrent(const std::shared_ptr<Capability>& cap){AssertCurrent();if(!cap||cap->owner_!=this||cap->spent_)Refuse("trusted_own_current_capability_required");
    if(cap->ingress_)(void)OriginalRequestBody(cap->ingress_);
    if(cap->kind_==CapKind::AmeProcess&&(!cap->ame_||cap->ame_->owner_!=this||cap->ame_!=data_->ame||!cap->ame_->Current()))Refuse("trusted_original_ame_capability_changed");
    if(cap->kind_==CapKind::OriginalJob)AssertOriginalJobObservationCurrent(cap->job_);
    if(cap->kind_==CapKind::CompletionPoll)AssertOriginalCompletionPollCurrent(cap);
    if(cap->kind_==CapKind::RestorationProgram){const auto& program=cap->restorationProgram_;
        if(!program||program->owner!=this||program->unknown||program->completed||program->slot<1||program->slot>2||program->actor!=data_->observationActor||data_->preissuedRestorationPrograms[program->slot-1]!=cap||
            !data_->titleManifest||program->manifest!=data_->titleManifest->state_.graphHash||detail::Hash(Bytes(program->originalPrefix.begin(),program->originalPrefix.end()))!=program->prefixHash)Refuse("trusted_own_preissued_restore_program_changed");
        if(!program->workingCopy||program->workingCopy->owner_!=this||program->workingCopy->kind_!=CapKind::OwnedCleanCopy||program->workingCopy->ownedFileSlot_!=program->slot)Refuse("trusted_own_restore_working_cap_changed");}
    if(cap->kind_==CapKind::Restoration){const auto& program=cap->restorationProgram_;
        if(!program||program->owner!=this||program->unknown||!program->completed||program->slot<1||program->slot>2||data_->restorationReceipts[program->slot-1]!=cap||!cap->project_||cap->project_!=program->restoreCommand||
            cap->project_->stage!=ProjectCapture::Stage::Terminal||cap->project_->originalResult.empty()||!data_->restorationDebts[program->slot-1]||data_->restorationDebts[program->slot-1]->state!=Data::RestorationDebt::State::Restored)Refuse("trusted_own_successful_restore_receipt_required");}
    if(cap->kind_==CapKind::OwnedCheckpoint||cap->kind_==CapKind::OwnedCleanCopy){
        if(cap->kind_==CapKind::OwnedCleanCopy&&(cap->ownedFileSlot_<1||cap->ownedFileSlot_>2))Refuse("trusted_own_copy_slot_refused");
        const auto& row=cap->kind_==CapKind::OwnedCheckpoint?data_->checkpoint:data_->cleanCopies[cap->ownedFileSlot_-1];
        if(!row||row->stage!=Data::CheckpointFile::Stage::Accepted||!row->file||!row->root||!row->root->Current()||!row->file->Current()||
            Fixed<16>(cap->frame_.payload.data()+1)!=row->ref||detail::Hash(detail::ReadExact(row->file->file.Get(),134217728))!=row->sourceHash)
            Refuse("trusted_own_immutable_checkpoint_changed");
        const auto& expected=cap->kind_==CapKind::OwnedCheckpoint?EmbeddedProfile().execution.checkpointName:EmbeddedProfile().execution.variants[cap->ownedFileSlot_-1].workingName;
        if(row->slot!=cap->ownedFileSlot_||row->name!=expected)Refuse("trusted_own_file_fixed_selector_changed");auto named=detail::Relative(row->root->directory.Get(),expected,false,false,false,false,true);
        if(!detail::SamePin(detail::ReadPin(named.Get(),false),row->createdPin)||detail::Hash(detail::ReadExact(named.Get(),134217728))!=row->sourceHash)Refuse("trusted_own_checkpoint_named_object_changed");}
    if(cap->kind_==CapKind::ExecutionGate){const auto& row=cap->execution_;
        if(!row||row->owner_!=this||row->stage!=ExecutionCapture::Stage::Authorized||row->actor!=data_->observationActor||GetTickCount64()>=row->expiry||
            std::find(data_->executionCaptures.begin(),data_->executionCaptures.end(),row)==data_->executionCaptures.end()||!row->originalPanelRequest||row->originalPanelRequest->unknown_)
            Refuse("trusted_execution_own_current_gate_required");
        (void)OriginalRequestBody(row->originalPanelRequest);(void)RequireFixedExecutionCurrent(row->originalManifest,row->currentRead,row->slot,row->leaf);}
    if(cap->kind_==CapKind::OwnedSavedSnapshot){if(cap->ownedFileSlot_<1||cap->ownedFileSlot_>2)Refuse("trusted_owned_saved_snapshot_slot");const auto& saved=data_->savedSnapshots[cap->ownedFileSlot_-1];
        if(!saved||saved->unknown||!saved->file||!saved->root||!saved->file->Current()||!saved->root->Current()||saved->terminalRef!=Fixed<16>(cap->frame_.payload.data()+1)||
            detail::Hash(detail::ReadExact(saved->file->file.Get(),134217728))!=saved->hash)Refuse("trusted_owned_saved_snapshot_changed");
        auto named=detail::Relative(saved->root->directory.Get(),EmbeddedProfile().execution.variants[saved->slot-1].snapshotName,false,false,false,false,true);
        if(!detail::SamePin(detail::ReadPin(named.Get(),false),saved->pin)||detail::Hash(detail::ReadExact(named.Get(),134217728))!=saved->hash)Refuse("trusted_owned_saved_snapshot_named_changed");}
    std::uint64_t expires=0;switch(cap->kind_){case CapKind::Call:case CapKind::Handler:expires=Number(cap->frame_.payload.data()+32,8);break;
        case CapKind::Bracket:expires=Number(cap->frame_.payload.data()+16,8);break;case CapKind::Read:expires=Number(cap->frame_.payload.data()+56,8);break;default:break;}
    if(expires&&GetTickCount64()>=expires)Refuse("trusted_own_native_capability_expired");}
void NativeClient::AssertLoadedNodeCurrent(){AssertCurrent();std::lock_guard<std::mutex> lock(data_->serial);if(!data_->loadedSources)Refuse("trusted_loaded_node_source_gate_closed");}
void NativeClient::AssertOriginalDispositionCurrent(){RequireRole(Role::Daemon);std::lock_guard<std::mutex> lock(data_->serial);
    if(!data_->loadedSources||!data_->Current(true))Refuse("trusted_original_disposition_clock_or_source_closed",0,true);}
void NativeClient::InvalidateLoadedNodeProof()noexcept{std::lock_guard<std::mutex> lock(data_->serial);data_->unknown=true;}
void NativeClient::InvalidateLoadedCepProof()noexcept{std::lock_guard<std::mutex> lock(data_->serial);data_->actorClosed=true;}
void NativeClient::RequireRole(Role role){if(data_->role!=role)Refuse("trusted_original_role_refused");}
void NativeClient::BindHttpOwnerFixed(HttpTransportOwner& original){RequireRole(Role::Daemon);std::lock_guard<std::mutex> lock(data_->serial);
    if(data_->httpOwner||!data_->Current())Refuse("trusted_original_http_owner_once");data_->httpOwner=&original;}
bool NativeClient::ReadRevokedKnown()const noexcept{try{std::lock_guard<std::mutex> lock(data_->serial);const auto now=GetTickCount64();
    return data_->role==Role::Daemon&&!data_->unknown&&data_->loadedSources&&data_->bootstrap&&now>=data_->lastMono&&
        now>=data_->bootstrap->lifecycleIssuedAt&&now<data_->bootstrap->dispositionDeadline&&
        data_->originalSeal&&data_->originalSeal->Fresh()&&data_->self&&data_->self->Current()&&data_->peer&&data_->peer->Current()&&
        data_->pipe.Valid()&&data_->wire&&!data_->wire->Closed()&&
        std::all_of(data_->files.begin(),data_->files.end(),[](const auto& file){return file->Current();})&&
        (!data_->bootstrapDirectory||data_->bootstrapDirectory->Current())&&(!data_->panelHelper||!data_->panelHelper->source||data_->panelHelper->source->Current())&&
        (data_->revoked||data_->actorClosed||now>=data_->bootstrap->sessionDeadline);
}catch(...){return false;}}
bool NativeClient::OriginalCleanupCurrent(HttpCleanupOperation operation)noexcept{return CheckOriginalHttpCleanup(*this,operation);}
bool NativeClient::CheckOriginalHttpCleanup(HttpTransportOwner& original,HttpCleanupOperation operation)noexcept{try{
    std::lock_guard<std::mutex> lock(data_->serial);return CheckOriginalHttpCleanupLocked(original,operation);
}catch(...){return false;}}
bool NativeClient::CheckOriginalHttpCleanupLocked(HttpTransportOwner& original,HttpCleanupOperation operation)noexcept{try{
    if((operation!=HttpCleanupOperation::EndNoPayload&&operation!=HttpCleanupOperation::Close)||
        data_->role!=Role::Daemon||data_->httpOwner!=&original||data_->unknown||!data_->loadedSources||!data_->bootstrap||!data_->wire||
        data_->wire->Closed()||!data_->originalSeal||!data_->originalSeal->Fresh()||!data_->self||!data_->self->Current()||
        !data_->peer||!data_->peer->Current()||!data_->pipe.Valid()||
        !std::all_of(data_->files.begin(),data_->files.end(),[](const auto& file){return file->Current();})||
        (data_->bootstrapDirectory&&!data_->bootstrapDirectory->Current())||(data_->panelHelper&&data_->panelHelper->source&&!data_->panelHelper->source->Current()))return false;
    const auto now=GetTickCount64();const auto& clock=*data_->bootstrap;
    if(!clock.lifecycleIssuedAt||now<data_->lastMono||now<clock.lifecycleIssuedAt||now>=clock.dispositionDeadline)return false;
    ULONG server=0;if(!GetNamedPipeServerProcessId(data_->pipe.Get(),&server)||server!=data_->peer->pid)return false;
    const bool knownRevoke=data_->revoked||data_->actorClosed||now>=clock.sessionDeadline;
    if(knownRevoke){const auto& binding=data_->wire->bindings_;
        // B33 authenticates the broker's continuously held prefix bracket. The
        // client verifies its exact transfer; it does not inspect current tail.
        if(!data_->drainObserved||data_->drainAcknowledged||data_->shutdownObserved||detail::Zero(data_->dispositionRef)||
            data_->cleanupBinding!=clock.lifecycleBinding||detail::Zero(data_->cleanupBinding)||
            data_->cleanupBindings.channelNonce!=binding.channelNonce||data_->cleanupBindings.sessionRef!=binding.sessionRef||
            data_->cleanupBindings.generation!=binding.generation||data_->cleanupBindings.bootNonce!=binding.bootNonce||
            detail::Zero(binding.channelNonce)||detail::Zero(binding.sessionRef)||detail::Zero(binding.generation)||detail::Zero(binding.bootNonce))return false;
    }
    data_->lastMono=now;return true;
}catch(...){return false;}}
Capability& NativeClient::Require(const std::shared_ptr<Capability>& cap,CapKind kind){if(!cap||cap->owner_!=this||cap->kind_!=kind||cap->spent_)Refuse("trusted_own_native_capability_required");if(cap->ingress_)(void)OriginalRequestBody(cap->ingress_);return *cap;}
std::shared_ptr<Capability> NativeClient::Own(CapKind kind,const phase::Frame& frame){
    // Issued caps remain spent after release. Each fixed Call row issues at most
    // one Call/Handler/Command/Selected/Delivery, two observation challenges and
    // observations, and two factual terminal projections of one completion.
    // A delivery ACK is retained internally and issues no unused terminal cap.
    // The production Call ceiling does not enlarge the independently frozen
    // bracket/read or effect-group ceilings.
    constexpr std::uint16_t calls=kTwoTitleCalls,brackets=kTwoTitleReadIssuances;
    std::uint16_t limit=0;switch(kind){case CapKind::Call:case CapKind::Handler:case CapKind::Command:case CapKind::Selected:case CapKind::Delivery:limit=calls;break;
        case CapKind::Challenge:case CapKind::Observation:limit=2*calls+4*brackets;break;
        case CapKind::Terminal:limit=2*calls;break;
        case CapKind::Bracket:case CapKind::Read:limit=brackets;break;case CapKind::ActorTarget:case CapKind::Preactor:case CapKind::Bootstrap:case CapKind::AmeProcess:case CapKind::Manifest:limit=1;break;
        case CapKind::ExecutionGate:limit=calls;break;case CapKind::OriginalJob:case CapKind::Media:case CapKind::Restoration:case CapKind::OwnedSavedSnapshot:case CapKind::RestorationProgram:limit=2;break;case CapKind::Settings:limit=4;break;
        case CapKind::CompletionPoll:if(EmbeddedProfile().execution.completionPollsPerJob!=kTwoTitlePollsPerJob)Refuse("trusted_completion_poll_definition_refused");limit=2*kTwoTitlePollsPerJob;break;
        case CapKind::Disposition:limit=2;break;case CapKind::OwnedCheckpoint:limit=1;break;case CapKind::OwnedCleanCopy:limit=2;break;default:Refuse("trusted_native_capability_kind_refused");}
    auto& issued=data_->capIssued[static_cast<std::size_t>(kind)];if(issued>=limit)Refuse("trusted_native_capability_budget",0,true);++issued;
    return std::shared_ptr<Capability>(new Capability(this,kind,frame));
}
phase::Frame NativeClient::Exchange(phase::Verb verb,const Bytes& payload,bool lifecycle){
    std::lock_guard<std::mutex> lock(data_->serial);if((lifecycle&&verb!=phase::Verb::DrainAck&&verb!=phase::Verb::ShutdownAck)||!data_->Current(lifecycle)||payload.size()>phase::kMaximumPayloadBytes||data_->outgoing==std::numeric_limits<std::uint64_t>::max())Refuse("trusted_original_exchange_closed",0,data_->unknown);
    phase::Frame request{};request.header.direction=data_->role==Role::Controller?phase::Direction::ControllerToBroker:phase::Direction::DaemonToBroker;
    request.header.verb=verb;request.header.senderOrdinal=data_->outgoing+1;request.header.payloadBytes=static_cast<std::uint32_t>(payload.size());
    request.header.channelNonce=data_->wire->bindings_.channelNonce;request.header.sessionRef=data_->wire->bindings_.sessionRef;request.header.generation=data_->wire->bindings_.generation;request.header.bootNonce=data_->wire->bindings_.bootNonce;
    std::copy(payload.begin(),payload.end(),request.payload.begin());std::array<unsigned char,phase::kMaximumFrameBytes> encoded{};std::size_t count=0;
    if(phase::EncodeFrame(request,encoded.data(),encoded.size(),count)!=phase::CodecError::None||data_->wire->TrackOutgoing(request)!=phase::CodecError::None)Refuse("trusted_original_request_codec_refused");
    ++data_->outgoing;data_->Transfer(true,Bytes(encoded.begin(),encoded.begin()+static_cast<std::ptrdiff_t>(count)));
    for(unsigned events=0;events<3;++events){const auto bytes=data_->Transfer(false,{});phase::Frame reply{};
        if(data_->wire->AcceptIncoming(bytes.data(),bytes.size(),reply)!=phase::CodecError::None){data_->unknown=true;Refuse("trusted_original_reply_correlation_unknown",0,true);}
        if(reply.header.kind==phase::FrameKind::Event){if(reply.header.verb!=phase::Verb::ObserveChallenge||data_->challenges.size()>=1){data_->unknown=true;Refuse("trusted_original_event_refused",0,true);}data_->challenges.push_back(reply);continue;}
        if(reply.header.status!=phase::Status::Ok){if(reply.header.status==phase::Status::Unknown)data_->unknown=true;
            Refuse(reply.header.status==phase::Status::RevalidationRequired?"trusted_read_revalidation_required":"trusted_original_native_refused",0,data_->unknown);}
        if(!data_->Current(lifecycle)){data_->unknown=true;Refuse("trusted_original_reply_late_guard_unknown",0,true);}return reply;
    }
    data_->unknown=true;Refuse("trusted_original_reply_event_budget",0,true);
}
std::shared_ptr<Capability> NativeClient::PollOriginalEvent(){AssertOriginalDispositionCurrent();std::lock_guard<std::mutex> lock(data_->serial);
    if(!data_->challenges.empty()){auto event=data_->challenges.front();data_->challenges.pop_front();return Own(CapKind::Challenge,event);}
    DWORD available=0;if(!PeekNamedPipe(data_->pipe.Get(),nullptr,0,nullptr,&available,nullptr)){data_->unknown=true;Refuse("trusted_original_event_pipe_eof_unknown",GetLastError(),true);}
    if(!available)return {};const auto bytes=data_->Transfer(false,{});phase::Frame event{};
    if(data_->wire->AcceptIncoming(bytes.data(),bytes.size(),event)!=phase::CodecError::None||event.header.kind!=phase::FrameKind::Event){data_->unknown=true;Refuse("trusted_original_event_correlation_unknown",0,true);}
    if(event.header.verb==phase::Verb::ObserveChallenge){if(data_->drainObserved)Refuse("trusted_observation_after_original_drain",0,true);return Own(CapKind::Challenge,event);}
    if(event.header.verb==phase::Verb::Drain){if(data_->drainObserved||data_->shutdownObserved||!data_->bootstrap||Fixed<16>(event.payload.data()+16)!=data_->wire->bindings_.generation||
            Fixed<32>(event.payload.data()+32)!=data_->bootstrap->lifecycleBinding||detail::Zero(Fixed<16>(event.payload.data())))Refuse("trusted_original_drain_commit_refused",0,true);
        data_->drainObserved=true;data_->revoked=true;data_->dispositionRef=Fixed<16>(event.payload.data());data_->cleanupBindings=data_->wire->bindings_;
        data_->cleanupBinding=Fixed<32>(event.payload.data()+32);return Own(CapKind::Disposition,event);}
    if(event.header.verb==phase::Verb::Shutdown){if(!data_->drainAcknowledged||data_->shutdownObserved||Fixed<16>(event.payload.data())!=data_->dispositionRef||
            Fixed<16>(event.payload.data()+16)!=data_->wire->bindings_.bootNonce||detail::Zero(Fixed<32>(event.payload.data()+32)))Refuse("trusted_original_shutdown_commit_refused",0,true);
        data_->shutdownObserved=true;return Own(CapKind::Disposition,event);}
    data_->unknown=true;Refuse("trusted_original_event_kind_refused",0,true);
}
const char* NativeClient::OriginalEventKind(const std::shared_ptr<Capability>& cap){AssertOriginalDispositionCurrent();if(!cap||cap->owner_!=this||cap->spent_)Refuse("trusted_original_event_cap_required");
    if(cap->kind_==CapKind::Challenge&&cap->frame_.header.verb==phase::Verb::ObserveChallenge)return "observation";
    if(cap->kind_==CapKind::Disposition&&cap->frame_.header.verb==phase::Verb::Drain)return "drain";
    if(cap->kind_==CapKind::Disposition&&cap->frame_.header.verb==phase::Verb::Shutdown)return "shutdown";Refuse("trusted_original_event_cap_required");
}
void NativeClient::AcknowledgeOriginalDisposition(const std::shared_ptr<Capability>& cap){AssertOriginalDispositionCurrent();auto& own=Require(cap,CapKind::Disposition);
    if(!data_->challenges.empty()||std::any_of(data_->requests.begin(),data_->requests.end(),[](const auto& request){return request->unknown_||!request->responseTerminal_;}))Refuse("trusted_original_disposition_pending_request");
    // This is an original-child outcome check under the disposition lifetime,
    // independent of actor/READ liveness. Neither an ACK nor CLI completion
    // substitutes for this exact retained helper and its actual child set.
    if(data_->panelHelper&&data_->panelHelper->launched){const auto& helper=*data_->panelHelper;JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
        if(!helper.settled||!helper.process.Valid()||!helper.job.Valid()||WaitForSingleObject(helper.process.Get(),0)!=WAIT_OBJECT_0||
            detail::ProcessBirth(helper.process.Get())!=helper.birth||!QueryInformationJobObject(helper.job.Get(),JobObjectBasicAccountingInformation,&accounting,sizeof(accounting),nullptr)||
            accounting.ActiveProcesses!=0)Refuse("trusted_original_disposition_helper_pending",0,true);}
    Bytes body;Put(body,data_->dispositionRef);Put(body,data_->wire->bindings_.generation);
    const bool drain=own.frame_.header.verb==phase::Verb::Drain;
    if(drain){if(!data_->drainObserved||data_->drainAcknowledged)Refuse("trusted_original_drain_ack_once");Put(body,data_->wire->bindings_.bootNonce);Put(body,data_->bootstrap->lifecycleBinding);}
    else{if(own.frame_.header.verb!=phase::Verb::Shutdown||!data_->drainAcknowledged||!data_->shutdownObserved||data_->shutdownAcknowledged)Refuse("trusted_original_shutdown_ack_once");Put(body,Fixed<32>(own.frame_.payload.data()+32));}
    own.spent_=true;
    try{Exchange(drain?phase::Verb::DrainAck:phase::Verb::ShutdownAck,body,true);if(drain)data_->drainAcknowledged=true;else data_->shutdownAcknowledged=true;}
    catch(...){data_->unknown=true;throw;}
}
phase::Frame NativeClient::Open(){RequireRole(Role::Controller);if(data_->opened||!data_->loadedSources)Refuse("trusted_original_open_source_gate");const auto reply=Exchange(phase::Verb::Open,{});
    data_->wire->bindings_.sessionRef=Fixed<16>(reply.payload.data());data_->wire->stage_=phase::BindingStage::Open;data_->opened=true;return reply;}
phase::Frame NativeClient::Ensure(){RequireRole(Role::Controller);if(!data_->opened||data_->ensured)Refuse("trusted_original_ensure_once");data_->ensured=true;
    const auto reply=Exchange(phase::Verb::ReserveInitialLaunch,{});data_->wire->bindings_.generation=Fixed<16>(reply.payload.data()+97);data_->wire->bindings_.bootNonce=Fixed<16>(reply.payload.data()+113);return reply;}
phase::Frame NativeClient::Status(){RequireRole(Role::Controller);return Exchange(phase::Verb::Status,{});}
void NativeClient::RevokeOnce()noexcept{try{if(data_->revoked)return;if(data_->role==Role::Controller&&!data_->unknown)Exchange(phase::Verb::Revoke,{});
    data_->revoked=true;if(data_->pipe.Valid()){HANDLE exact=data_->pipe.Take();if(!CloseHandle(exact)){data_->unknown=true;data_->failedCloseHandles.push_back(exact);}}}catch(...){data_->revoked=true;data_->unknown=true;}}
Bytes Body(phase::ToolCode tool,phase::CallKind kind){const char* canonical=tool==phase::ToolCode::GetBridgeStatus?"{\"args\":{},\"name\":\"get_bridge_status\"}":
    tool==phase::ToolCode::GetProjectInfo?"{\"args\":{},\"name\":\"get_project_info\"}":"{\"args\":{},\"name\":\"ensure_ae_agent_panel\"}";
    Bytes body;detail::PutU16(body,static_cast<std::uint16_t>(tool));body.push_back(static_cast<unsigned char>(kind));detail::PutU16(body,1);Put(body,TextHash(canonical));return body;}
std::shared_ptr<Capability> NativeClient::BeginPanel(){RequireRole(Role::Controller);const auto body=Body(phase::ToolCode::EnsureAgentPanel,phase::CallKind::Panel);auto result=Own(CapKind::Call,Exchange(phase::Verb::BeginCall,body));std::copy(body.begin(),body.end(),result->frame_.payload.begin()+72);return result;}
std::shared_ptr<Capability> NativeClient::BeginBracket(){RequireRole(Role::Controller);return Own(CapKind::Bracket,Exchange(phase::Verb::BeginBracket,{}));}
std::shared_ptr<Capability> NativeClient::BeginRead(phase::ToolCode tool,const std::shared_ptr<Capability>& authorization){RequireRole(Role::Controller);
    if(tool!=phase::ToolCode::GetBridgeStatus&&tool!=phase::ToolCode::GetProjectInfo)Refuse("trusted_exact_read_tool_required");
    if(!authorization||authorization->owner_!=this||authorization->spent_||(authorization->kind_!=CapKind::Bracket&&authorization->kind_!=CapKind::Read))Refuse("trusted_own_read_authorization_required");
    const bool bracket=authorization->kind_==CapKind::Bracket;Bytes body=Body(tool,bracket?phase::CallKind::BootstrapRead:phase::CallKind::Read);
    if(bracket){const auto index=authorization->frame_.payload[24];if(index<1||index>3||tool!=(index==2?phase::ToolCode::GetProjectInfo:phase::ToolCode::GetBridgeStatus))Refuse("trusted_exact_bracket_read_required");
        body.insert(body.end(),authorization->frame_.payload.begin(),authorization->frame_.payload.begin()+16);body.push_back(index);}
    else body.insert(body.end(),authorization->frame_.payload.begin()+16,authorization->frame_.payload.begin()+48);
    auto result=Own(CapKind::Call,Exchange(phase::Verb::BeginCall,body));
    // This advances only the client's next locator. The original broker still
    // requires the previous row's actual terminal before issuing any next Call.
    if(bracket)++authorization->frame_.payload[24];
    // Keep the canonical branch in the own immutable cap's unused tail. It is
    // never inferred from a public tool name or a serialized result receipt.
    std::copy(body.begin(),body.begin()+37,result->frame_.payload.begin()+72);return result;
}
std::shared_ptr<Capability> NativeClient::BeginExecutionFixed(const ExecutionIntent& intent,const std::shared_ptr<Capability>& authorization){
    RequireRole(Role::Controller);AssertLoadedNodeCurrent();auto& read=Require(authorization,CapKind::Read);AssertCapabilityCurrent(authorization);
    const auto* tool=phase::FindTool(intent.tool);ExecutionCost worst;const auto& policy=EmbeddedProfile().execution;
    if(!tool||!policy.Validate(worst)||!FixedExecutionIntentAllowed(intent.tool,intent.kind,intent.slot,intent.leaf)||
        intent.canonicalBody.empty()||intent.canonicalBody.size()>1048576||std::find(intent.canonicalBody.begin(),intent.canonicalBody.end(),0)!=intent.canonicalBody.end())
        Refuse("trusted_execution_intent_refused");
    const std::string suffix=",\"name\":\""+std::string(tool->exactName)+"\"}";
    constexpr char prefix[]="{\"args\":{";
    if(intent.canonicalBody.size()<sizeof(prefix)-1+suffix.size()+1||
        !std::equal(prefix,prefix+sizeof(prefix)-1,intent.canonicalBody.begin())||
        !std::equal(suffix.begin(),suffix.end(),intent.canonicalBody.end()-static_cast<std::ptrdiff_t>(suffix.size())))
        Refuse("trusted_execution_canonical_body_refused");
    Bytes body;detail::PutU16(body,static_cast<std::uint16_t>(intent.tool));body.push_back(static_cast<unsigned char>(intent.kind));
    detail::PutU16(body,static_cast<std::uint16_t>(phase::RouteCode::McpToolsCall));Put(body,detail::Hash(intent.canonicalBody));
    Put(body,FixedExecutionScope(policy,intent.slot,intent.leaf));body.insert(body.end(),read.frame_.payload.begin()+16,read.frame_.payload.begin()+48);
    AssertCapabilityCurrent(authorization);auto result=Own(CapKind::Call,Exchange(phase::Verb::BeginCall,body));
    // The broker retains the entire101B tail. D40 remains69B and cannot replace
    // scope/READ fields with a caller hash. The private cap keeps the same bytes.
    std::copy(body.begin(),body.end(),result->frame_.payload.begin()+72);return result;
}
std::shared_ptr<Capability> NativeClient::BeginServerOnlyFixed(phase::ToolCode tool,const Bytes& canonicalBody){RequireRole(Role::Controller);AssertLoadedNodeCurrent();
    const auto* selected=phase::FindTool(tool);if(!selected||!selected->serverOnlyHandler||(tool!=phase::ToolCode::SearchSolutions&&tool!=phase::ToolCode::GetSolution)||
        canonicalBody.empty()||canonicalBody.size()>1048576)Refuse("trusted_server_only_fixed_tool_refused");
    Bytes body;detail::PutU16(body,static_cast<std::uint16_t>(tool));body.push_back(static_cast<unsigned char>(phase::CallKind::ServerOnly));
    detail::PutU16(body,static_cast<std::uint16_t>(phase::RouteCode::McpToolsCall));Put(body,detail::Hash(canonicalBody));
    auto result=Own(CapKind::Call,Exchange(phase::Verb::BeginCall,body));std::copy(body.begin(),body.end(),result->frame_.payload.begin()+72);return result;
}
std::shared_ptr<Capability> NativeClient::AdoptBracket(const std::shared_ptr<Capability>& cap){RequireRole(Role::Controller);auto& own=Require(cap,CapKind::Bracket);
    const auto reply=Exchange(phase::Verb::AdoptBracket,Bytes(own.frame_.payload.begin(),own.frame_.payload.begin()+16));own.spent_=true;return Own(CapKind::Read,reply);}
Bytes NativeClient::ToolLocator(const std::shared_ptr<Capability>& cap){RequireRole(Role::Controller);auto& own=Require(cap,CapKind::Call);AssertCurrent();
    Bytes out(own.frame_.payload.begin(),own.frame_.payload.begin()+32);out.insert(out.end(),own.frame_.payload.begin()+72,own.frame_.payload.begin()+109);own.spent_=true;return out;}
std::shared_ptr<Capability> NativeClient::VerifyTool(const Bytes& locator,phase::ToolCode tool){RequireRole(Role::Daemon);
    if(locator.size()!=69||Number(locator.data()+32,2)!=static_cast<std::uint16_t>(tool)||tool<phase::ToolCode::EnsureAgentPanel||tool>phase::ToolCode::GetProjectInfo)Refuse("trusted_exact_tool_locator_refused");
    auto result=Own(CapKind::Handler,Exchange(phase::Verb::VerifyIngress,locator));std::copy(locator.begin()+32,locator.end(),result->frame_.payload.begin()+72);data_->readHandlers.push_back(result);return result;}
std::shared_ptr<Capability> NativeClient::TakeChallenge(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);
    if(!cap||cap->owner_!=this||cap->spent_||(cap->kind_!=CapKind::Handler&&cap->kind_!=CapKind::Challenge))Refuse("trusted_challenge_target_refused");
    if(data_->challenges.size()!=1)Refuse("trusted_own_challenge_missing");auto frame=data_->challenges.front();data_->challenges.pop_front();
    if(Fixed<16>(frame.payload.data()+18)!=Fixed<16>(cap->frame_.payload.data()))Refuse("trusted_challenge_target_mismatch");return Own(CapKind::Challenge,frame);}
std::shared_ptr<Capability> NativeClient::BindProjectFixed(const std::shared_ptr<Capability>& cap){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& own=Require(cap,CapKind::Handler);const auto& profile=EmbeddedProfile();
    if(Number(own.frame_.payload.data()+72,2)!=7||profile.projectScript.empty()||profile.projectScript.size()>1048576||detail::Zero(profile.projectLeaf)||
        detail::Hash(Bytes(profile.projectScript.begin(),profile.projectScript.end()))!=profile.projectScriptHash||detail::Zero(data_->observationSnapshot)||
        !data_->observationOrdinal||GetTickCount64()<data_->observationMono||GetTickCount64()-data_->observationMono>10000||data_->projects.size()>=kTwoTitleCalls)Refuse("trusted_project_bind_refused");
    auto project=std::make_shared<ProjectCapture>();project->originalHandler=cap;project->command=detail::RandomId();project->execution=detail::RandomId();project->lease=detail::RandomId();
    project->handler=Fixed<16>(own.frame_.payload.data());project->script=profile.projectScriptHash;project->snapshot=data_->observationSnapshot;
    project->context=data_->observationContext;project->transport=data_->observationTransport;project->actor=data_->observationActor;
    project->observationOrdinal=data_->observationOrdinal;project->panelConnection=data_->panelConnection;project->panelGeneration=data_->panelGeneration;
    data_->projects.push_back(project); // original private state is retained before the wire effect
    Bytes body;Put(body,Fixed<16>(own.frame_.payload.data()));Put(body,Fixed<16>(own.frame_.payload.data()+16));detail::PutU64(body,Number(own.frame_.payload.data()+32,8));detail::PutU16(body,7);
    const auto role=own.frame_.payload[74]==3?1u:2u;detail::PutU16(body,static_cast<std::uint16_t>(role));Put(body,project->command);Put(body,project->execution);Put(body,project->lease);
    Put(body,Id{});Put(body,profile.projectLeaf);Put(body,project->script);body.resize(204,0);body.push_back(static_cast<unsigned char>(role));
    try{auto result=Own(CapKind::Command,Exchange(phase::Verb::BindCommand,body));project->expiry=Number(result->frame_.payload.data()+32,8);result->project_=project;result->ingress_=own.ingress_;return result;}
    catch(...){project->stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}
}
ProjectDescriptor NativeClient::DescribeProject(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(!cap||cap->owner_!=this||!cap->project_||cap->project_->inspection||cap->project_->stage==ProjectCapture::Stage::Unknown)Refuse("trusted_original_project_required");const auto& p=*cap->project_;
    return {p.command,p.execution,p.lease,EmbeddedProfile().projectScript,p.expiry};}
const Bytes& NativeClient::OriginalRequestBody(const std::shared_ptr<AuthenticatedRequest>& request){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(!request||request->owner_!=this||request->unknown_||request->responseTerminal_)Refuse("trusted_actual_request_required");
    AuthenticateSocketRequest(*request->connection_,request->fields_.token,request->panel_);return request->fields_.body;}
std::shared_ptr<Capability> NativeClient::SelectProject(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request){return SelectOwnCommand(cap,request,false);}
std::shared_ptr<Capability> NativeClient::SelectExecution(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request){return SelectOwnCommand(cap,request,true);}
void NativeClient::AssertStageDispatchCurrent(const std::shared_ptr<ProjectCapture>& original){
    if(!original||!original->stageDelivery||!original->executionGate||!original->workingCopy||!original->executionGate->execution_)Refuse("trusted_original_stage_dispatch_row_required");
    AssertLoadedNodeCurrent();const auto row=original->executionGate->execution_;const auto slot=row->slot;
    if(row->owner_!=this||slot<1||slot>2||row->leaf!=ExecutionLeaf::StageVariant||row->stage!=ExecutionCapture::Stage::Authorized||GetTickCount64()>=row->expiry||
        row->actor!=data_->observationActor||original->actor!=row->actor||original->handler!=row->handler||
        !data_->restorationDebts[slot-1]||data_->restorationDebts[slot-1]->stageCommand!=original||data_->restorationDebts[slot-1]->state==Data::RestorationDebt::State::Unknown||
        data_->restorationDebts[slot-1]->descriptorHash!=detail::Hash(original->preparationDescriptor))Refuse("trusted_original_stage_dispatch_current_refused");
    AssertCapabilityCurrent(original->workingCopy);(void)OriginalRequestBody(row->originalPanelRequest);(void)OriginalRequestBody(row->originalHandler->ingress_);
    (void)RequireExecutionBaseline(original->originalManifest,original->baselineRead);const auto& working=*data_->cleanCopies[slot-1];
    if(!data_->checkpoint||!data_->checkpoint->file||!data_->checkpoint->file->Current()||!data_->checkpoint->root->Current()||
        detail::Hash(detail::ReadExact(data_->checkpoint->file->file.Get(),134217728))!=EmbeddedProfile().execution.sourceProject.sha256||
        !working.root->Current()||!working.file->Current()||detail::Hash(detail::ReadExact(working.file->file.Get(),134217728))!=working.sourceHash)
        Refuse("trusted_original_stage_checkpoint_or_working_changed",0,true);
}
std::shared_ptr<Capability> NativeClient::SelectOwnCommand(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,bool inspection){RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Command);
    (void)OriginalRequestBody(request);if(!request->panel_||request->fields_.method!="GET"||request->fields_.url.substr(0,13)!="/bridge/next?"||!own.project_||own.project_->inspection!=inspection||own.project_->stage!=ProjectCapture::Stage::Bound)Refuse("trusted_project_actual_selection_required");
    request->idleDisqualified_.store(true,std::memory_order_release); // irreversible before D42 or any Exchange
    auto& p=*own.project_;if(p.stageDelivery)AssertStageDispatchCurrent(own.project_);if(p.restorationDelivery)AssertRestorationDispatchCurrent(own.project_);if(p.originalAmeJob)AssertAmeDispatchCurrent(own.project_);
    if(p.observationOrdinal!=data_->observationOrdinal||p.snapshot!=data_->observationSnapshot||p.context!=data_->observationContext||p.transport!=data_->observationTransport)Refuse("trusted_project_observation_changed");
    Bytes selected;Put(selected,Fixed<32>(own.frame_.payload.data()+40));Put(selected,p.snapshot);Put(selected,p.context);Put(selected,p.transport);p.selection=DomainHash("lcp2.production.project-selected.v1",selected);
    Bytes body(own.frame_.payload.begin(),own.frame_.payload.begin()+32);Put(body,Fixed<32>(own.frame_.payload.data()+40));Put(body,p.selection);
    if(p.stageDelivery){auto& debt=*data_->restorationDebts[p.executionGate->execution_->slot-1];if(debt.effectSelected)Refuse("trusted_original_stage_effect_once");debt.effectSelected=true;debt.state=Data::RestorationDebt::State::Selected;}
    if(p.restorationDelivery){const auto program=p.restorationProgram->restorationProgram_;if(program->effectSelected)Refuse("trusted_original_restore_effect_once");program->effectSelected=true;}
    if(p.ameEnqueueDelivery){auto& job=*p.originalAmeJob;if(job.stage_!=AmeOriginalJob::Stage::SourceInspected||data_->originalJobs[job.slot_-1])Refuse("trusted_original_ame_enqueue_once");job.stage_=AmeOriginalJob::Stage::EnqueueSelected;data_->originalJobs[job.slot_-1]=p.originalAmeJob;}
    if(p.ameStartDelivery){auto& job=*p.originalAmeJob;if(job.stage_!=AmeOriginalJob::Stage::Enqueued)Refuse("trusted_original_ame_START_once");job.stage_=AmeOriginalJob::Stage::StartSelected;}
    own.spent_=true;p.stage=ProjectCapture::Stage::Selected;p.deliveryRequest=request;
    try{auto result=Own(CapKind::Selected,Exchange(phase::Verb::ConsumeDispatch,body));result->project_=own.project_;result->ingress_=own.ingress_;return result;}catch(...){p.stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}}
std::shared_ptr<Capability> NativeClient::GuardProject(const std::shared_ptr<Capability>& cap){return GuardOwnCommand(cap,false);}
std::shared_ptr<Capability> NativeClient::GuardExecution(const std::shared_ptr<Capability>& cap){return GuardOwnCommand(cap,true);}
std::shared_ptr<Capability> NativeClient::GuardOwnCommand(const std::shared_ptr<Capability>& cap,bool inspection){RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Selected);
    if(!own.project_||own.project_->inspection!=inspection||own.project_->stage!=ProjectCapture::Stage::Selected)Refuse("trusted_project_selected_required");auto& p=*own.project_;(void)OriginalRequestBody(p.deliveryRequest);
    if(p.stageDelivery)AssertStageDispatchCurrent(own.project_);if(p.restorationDelivery)AssertRestorationDispatchCurrent(own.project_);if(p.originalAmeJob)AssertAmeDispatchCurrent(own.project_);
    Bytes body(own.frame_.payload.begin()+1,own.frame_.payload.begin()+17);Put(body,Fixed<16>(own.frame_.payload.data()+97));Put(body,Fixed<32>(own.frame_.payload.data()+17));
    Put(body,p.handler);Put(body,p.actor);Put(body,p.selection);Put(body,p.context);detail::PutU64(body,p.expiry);detail::PutU64(body,p.observationOrdinal);
    own.spent_=true;p.stage=ProjectCapture::Stage::Guarded;try{auto result=Own(CapKind::Delivery,Exchange(phase::Verb::GuardDelivery,body));result->project_=own.project_;result->ingress_=own.ingress_;return result;}catch(...){p.stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}}
void NativeClient::RecordProjectDelivery(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){RecordOwnDelivery(cap,request,actual,false);}
void NativeClient::RecordExecutionDelivery(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){RecordOwnDelivery(cap,request,actual,true);}
void NativeClient::RecordOwnDelivery(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual,bool inspection){RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Delivery);
    if(!own.project_||own.project_->inspection!=inspection)Refuse("trusted_original_project_required");auto& p=*own.project_;(void)OriginalRequestBody(request);
    const auto& actualScript=inspection?p.originalScript:EmbeddedProfile().projectScript;
    if(p.stage!=ProjectCapture::Stage::Guarded||p.deliveryRequest!=request||!actual.success||actual.command!=p.command||actual.execution!=p.execution||actual.lease!=p.lease||
        actual.panelConnection!=p.panelConnection||actual.panelGeneration!=p.panelGeneration||actual.result!=Bytes(actualScript.begin(),actualScript.end()))Refuse("trusted_actual_project_delivery_mismatch",0,true);
    Bytes body(own.frame_.payload.begin(),own.frame_.payload.begin()+32);Put(body,p.command);body.push_back(1);Put(body,Fixed<32>(own.frame_.payload.data()+40));own.spent_=true;
    try{const auto result=Exchange(phase::Verb::RecordDelivery,body);p.receipt=Fixed<32>(result.payload.data()+17);p.stage=ProjectCapture::Stage::Delivered;}
    catch(...){p.stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}}
void NativeClient::RecordProjectSubmission(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){RecordOwnSubmission(cap,request,actual,false);}
void NativeClient::RecordExecutionSubmission(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){RecordOwnSubmission(cap,request,actual,true);}
void NativeClient::RecordOwnSubmission(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual,bool inspection){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(!cap||cap->owner_!=this||!cap->project_||cap->project_->inspection!=inspection)Refuse("trusted_original_project_required");auto& p=*cap->project_;(void)OriginalRequestBody(request);
    if(cap->ingress_)(void)OriginalRequestBody(cap->ingress_);
    if(p.stage!=ProjectCapture::Stage::Delivered||!request->panel_||request->fields_.url!="/bridge/submitted"||request->fields_.method!="POST"||actual.command!=p.command||actual.execution!=p.execution||actual.lease!=p.lease||
        actual.panelConnection!=p.panelConnection||actual.panelGeneration!=p.panelGeneration||GetTickCount64()>=p.expiry)Refuse("trusted_actual_project_submission_mismatch",0,true);
    p.stage=ProjectCapture::Stage::Submitted;}
std::shared_ptr<Capability> NativeClient::CaptureProjectResultFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){return CaptureOwnResultFixed(cap,request,actual,false);}
std::shared_ptr<Capability> NativeClient::CaptureExecutionResultFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){return CaptureOwnResultFixed(cap,request,actual,true);}
std::shared_ptr<Capability> NativeClient::CaptureOwnResultFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual,bool inspection){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(IsOriginalCompletionPoll(cap)){if(!inspection)Refuse("trusted_original_poll_exact_result_route");return CaptureOriginalJobObservationFixed(cap,request,actual);}
    if(!cap||cap->owner_!=this||!cap->project_||cap->project_->inspection!=inspection)Refuse("trusted_original_project_required");auto& p=*cap->project_;(void)OriginalRequestBody(request);
    if(cap->ingress_)(void)OriginalRequestBody(cap->ingress_);
    if(p.stage!=ProjectCapture::Stage::Submitted||!request->panel_||request->fields_.url!="/bridge/result"||request->fields_.method!="POST"||!actual.success||actual.command!=p.command||actual.execution!=p.execution||actual.lease!=p.lease||
        actual.panelConnection!=p.panelConnection||actual.panelGeneration!=p.panelGeneration||actual.result.empty()||actual.result.size()>1048576||GetTickCount64()>=p.expiry)Refuse("trusted_actual_project_terminal_mismatch",0,true);
    if(!inspection)CaptureProjectReadCurrentFixed(cap->project_,actual.result);
    if(p.stageDelivery)ValidateOriginalStageResult(cap->project_,actual.result);if(p.restorationDelivery)ValidateOriginalRestorationResult(cap->project_,actual.result);
    if(p.originalAmeJob){try{ValidateOriginalAmeResult(cap->project_,actual.result);}catch(...){p.originalAmeJob->unknown_=true;p.originalAmeJob->stage_=AmeOriginalJob::Stage::Unknown;p.stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}}
    Bytes body;Put(body,p.command);Put(body,p.execution);Put(body,detail::Hash(actual.result));detail::PutU16(body,1);Put(body,p.receipt);p.stage=ProjectCapture::Stage::Terminal;
    try{auto result=Own(CapKind::Terminal,Exchange(phase::Verb::Complete,body));p.originalResult=actual.result;p.terminalMono=GetTickCount64();result->project_=cap->project_;
        if(p.stageDelivery){auto& debt=*data_->restorationDebts[p.executionGate->execution_->slot-1];debt.state=Data::RestorationDebt::State::StageTerminal;debt.stageResult=actual.result;debt.stageTerminal=detail::Hash(actual.result);}
        if(p.originalAmeJob)CommitOriginalAmeResult(cap->project_,result);
        if(p.stageDelivery||p.restorationDelivery||p.ameEnqueueDelivery||p.ameStartDelivery){data_->lastCompletedGate=p.executionGate;data_->lastCompletedTerminal=result->frame_;}
        if(p.restorationDelivery){const auto program=p.restorationProgram->restorationProgram_;program->completed=true;data_->restoredSourceReadbacks[program->slot-1]=program->restoredAfter;auto restored=Own(CapKind::Restoration,result->frame_);restored->ownedFileSlot_=program->slot;restored->project_=cap->project_;restored->restorationProgram_=program;data_->restorationReceipts[program->slot-1]=restored;data_->restorationDebts[program->slot-1]->state=Data::RestorationDebt::State::Restored;p.restorationProgram->spent_=true;}return result;
    }catch(...){p.stage=ProjectCapture::Stage::Unknown;if(p.stageDelivery||p.restorationDelivery)data_->restorationDebts[p.executionGate->execution_->slot-1]->state=Data::RestorationDebt::State::Unknown;if(p.restorationDelivery)p.restorationProgram->restorationProgram_->unknown=true;if(p.originalAmeJob){p.originalAmeJob->unknown_=true;p.originalAmeJob->stage_=AmeOriginalJob::Stage::Unknown;}data_->unknown=true;throw;}}
std::shared_ptr<Capability> NativeClient::FinishStatus(const std::shared_ptr<Capability>& cap,const Digest& result){RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Handler);
    if(Number(own.frame_.payload.data()+72,2)!=6)Refuse("trusted_d52_status_only");Bytes body(own.frame_.payload.begin(),own.frame_.payload.begin()+16);Put(body,result);
    own.spent_=true;return Own(CapKind::Terminal,Exchange(phase::Verb::FinishServerOnly,body));}
std::vector<Source> NativeClient::NodeSourceInventory()const{std::vector<Source> result;
    for(const auto& source:EmbeddedProfile().nodeSources)if(source.roles&static_cast<unsigned>(data_->role))result.push_back(source);return result;}
std::uint64_t NativeClient::NodeSourceByteBudget()const{return data_->role==Role::Controller?EmbeddedProfile().controllerSourceBytes:EmbeddedProfile().daemonSourceBytes;}
std::vector<reviewed::File> NativeClient::PanelSourceInventory()const{return EmbeddedProfile().panelFiles;}
Bytes NativeClient::FixedTransport(){AssertCurrent();for(const auto& file:data_->files)if(file->approved.pin.fileId==EmbeddedProfile().transport.pin.fileId)return detail::ReadExact(file->file.Get(),16384);Refuse("trusted_fixed_transport_missing");}
Bytes NativeClient::FixedDaemonTransport(){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    const auto credential=[&](const reviewed::File& expected){for(const auto& file:data_->files)if(detail::SamePin(file->approved.pin,expected.pin)){const auto bytes=detail::ReadExact(file->file.Get(),4096);std::string escaped;
            for(const auto byte:bytes){if(byte<33||byte>126)Refuse("trusted_fixed_credential_header_bytes_refused");if(byte=='"'||byte=='\\')escaped+='\\';escaped+=static_cast<char>(byte);}return escaped;}Refuse("trusted_fixed_credential_missing");};
    const auto automation=credential(production::EmbeddedDefinition().automationCredential),panel=credential(production::EmbeddedDefinition().panelCredential);
    if(automation.empty()||panel.empty()||automation==panel)Refuse("trusted_fixed_credentials_not_distinct");const auto text=std::string("{\"automationToken\":\"")+automation+"\",\"panelToken\":\""+panel+"\",\"host\":\"127.0.0.1\",\"port\":3456}";AssertLoadedNodeCurrent();return Bytes(text.begin(),text.end());}
std::shared_ptr<Capability> NativeClient::CaptureOriginalAeFixed(){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(data_->preactorAttempted)Refuse("trusted_original_preactor_capture_once");data_->preactorAttempted=true;
    const auto& p=EmbeddedProfile();Held snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0));if(!snapshot.Valid())Refuse("trusted_native_process_inventory_unavailable",GetLastError());
    PROCESSENTRY32W row{};row.dwSize=sizeof(row);if(!Process32FirstW(snapshot.Get(),&row))Refuse("trusted_native_process_inventory_unavailable",GetLastError());
    DWORD ae=0;std::size_t count=0;do{if(++count>4096)Refuse("trusted_native_process_inventory_budget");if(_wcsicmp(row.szExeFile,L"AfterFX.exe")==0){if(ae)Refuse("trusted_ae_ambiguous");ae=row.th32ProcessID;}row.dwSize=sizeof(row);}while(Process32NextW(snapshot.Get(),&row));
    if(GetLastError()!=ERROR_NO_MORE_FILES)Refuse("trusted_native_process_inventory_unknown",GetLastError());if(!ae)Refuse("trusted_ae_absent");
    auto file=std::make_unique<CheckedFile>(p.ae);auto original=std::make_unique<Process>(Held(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,ae)),p.ae,reviewed::EmbeddedProfile().userSid);
    AssertLoadedNodeCurrent();if(!original->Current())Refuse("trusted_original_preactor_changed");const auto ref=detail::RandomId();{
        std::lock_guard<std::mutex> lock(data_->serial);data_->files.push_back(std::move(file));data_->preactor=std::move(original);data_->preactorRef=ref;}
    phase::Frame value{};std::copy(ref.begin(),ref.end(),value.payload.begin());return Own(CapKind::Preactor,value);
}
void NativeClient::AssertPreactorCurrent(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Preactor);AssertLoadedNodeCurrent();
    if(!data_->preactor||!data_->preactor->Current()||Fixed<16>(own.frame_.payload.data())!=data_->preactorRef)Refuse("trusted_original_preactor_changed");}
const Profile& NativeClient::BootstrapObserverDefinition(const std::shared_ptr<Capability>& cap){AssertPreactorCurrent(cap);const auto& profile=EmbeddedProfile();
    if(profile.cdpPort!=8870||profile.cdpTargetUrl.empty()||profile.panelFiles.size()!=8)Refuse("trusted_fixed_preactor_observer_definition_required");return profile;}
std::shared_ptr<Capability> NativeClient::ReservePanelBootstrapFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<Capability>& preactor){
    RequireRole(Role::Daemon);auto& handler=Require(cap,CapKind::Handler);AssertPreactorCurrent(preactor);const auto& profile=EmbeddedProfile();
    if(Number(handler.frame_.payload.data()+72,2)!=5||handler.frame_.payload[74]!=2||data_->bootstrapEffectSpent||data_->actorAttempted||!data_->bootstrapDirectory||
        !data_->bootstrapDirectory->Current()||detail::Zero(profile.panelBootstrapDescriptor)||profile.aeLocator.empty()||profile.panelBootstrapLocator.empty()||
        profile.panelBootstrapTemplateHash!=detail::Hash(Bytes(kPanelBootstrapTemplate,kPanelBootstrapTemplate+sizeof(kPanelBootstrapTemplate)-1)))Refuse("trusted_fixed_bootstrap_definition_refused");
    detail::AssertEmptyDirectory(data_->bootstrapDirectory->directory.Get());AssertCapabilityCurrent(cap);
    auto retained=std::make_unique<BootstrapHelper>();retained->attempt=detail::RandomId();retained->preactorRef=data_->preactorRef;
    retained->deadline=Number(handler.frame_.payload.data()+32,8);{std::lock_guard<std::mutex> lock(data_->serial);data_->panelHelper=std::move(retained);}
    Bytes body;Put(body,Fixed<16>(handler.frame_.payload.data()));detail::PutU64(body,1);Put(body,profile.panelBootstrapDescriptor);Put(body,data_->panelHelper->attempt);
    // This is the profile's first external effect. Broker verifies ordinal 1,
    // the exact idle Panel row, then latches admission before Note/ACK.
    data_->bootstrapEffectSpent=true;try{auto result=Own(CapKind::Bootstrap,Exchange(phase::Verb::ReservePanelEffect,body));result->ingress_=handler.ingress_;return result;}
    catch(...){std::lock_guard<std::mutex> lock(data_->serial);data_->unknown=true;throw;}
}
void NativeClient::LaunchPanelBootstrapFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<Capability>& preactor){
    RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Bootstrap);AssertPreactorCurrent(preactor);
    if(!data_->bootstrapEffectSpent||!data_->panelHelper||data_->panelHelper->launched||data_->actorAttempted||!data_->captured.empty())Refuse("trusted_fixed_bootstrap_launch_once");
    auto& retained=*data_->panelHelper;const auto& profile=EmbeddedProfile();const auto boundary=[&](){AssertPreactorCurrent(preactor);if(own.ingress_)(void)OriginalRequestBody(own.ingress_);
        if(GetTickCount64()>=retained.deadline||retained.preactorRef!=data_->preactorRef||!data_->bootstrapDirectory||!data_->bootstrapDirectory->Current()||
            (retained.source&&!retained.source->Current()))Refuse("trusted_bootstrap_last_source_or_clock_guard",0,true);};
    own.spent_=true;
    try{boundary();detail::AssertEmptyDirectory(data_->bootstrapDirectory->directory.Get());
        const auto prefix=std::string("// owned fixed bootstrap; attempt=")+detail::Hex(retained.attempt)+"; session="+detail::Hex(data_->wire->bindings_.sessionRef)+
            "; generation="+detail::Hex(data_->wire->bindings_.generation)+"; boot="+detail::Hex(data_->wire->bindings_.bootNonce)+"; deadline="+std::to_string(retained.deadline)+"\n";
        Bytes script(prefix.begin(),prefix.end());script.insert(script.end(),kPanelBootstrapTemplate,kPanelBootstrapTemplate+sizeof(kPanelBootstrapTemplate)-1);
        retained.writer=detail::Relative(data_->bootstrapDirectory->directory.Get(),L"panel-bootstrap-once.jsx",false,true,true,true);
        std::uint64_t length=0;const auto created=detail::ReadPin(retained.writer.Get(),false,&length);if(length||script.empty()||script.size()>16384||
            created.canonicalPath!=profile.panelBootstrapRoot.canonicalPath+L"\\panel-bootstrap-once.jsx")Refuse("trusted_bootstrap_created_source_refused",0,true);
        DWORD written=0;if(!WriteFile(retained.writer.Get(),script.data(),static_cast<DWORD>(script.size()),&written,nullptr)||written!=script.size()||
            !FlushFileBuffers(retained.writer.Get())||!detail::SamePin(detail::ReadPin(retained.writer.Get(),false),created)||detail::ReadExact(retained.writer.Get(),16384)!=script)
            Refuse("trusted_bootstrap_source_write_unknown",GetLastError(),true);
        HANDLE writer=retained.writer.Take();if(!CloseHandle(writer)){retained.failedWriter=writer;Refuse("trusted_bootstrap_source_close_unknown",GetLastError(),true);}
        reviewed::File generated;generated.pin=created;generated.sha256=detail::Hash(script);auto generatedSource=std::make_unique<CheckedFile>(generated);
        {std::lock_guard<std::mutex> lock(data_->serial);retained.source=std::move(generatedSource);}
        CheckedFile executable(profile.ae);Held alias(CreateFileW(profile.aeLocator.c_str(),FILE_READ_DATA|FILE_READ_ATTRIBUTES,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        Held scriptAlias(CreateFileW(profile.panelBootstrapLocator.c_str(),FILE_READ_DATA|FILE_READ_ATTRIBUTES,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        if(!alias.Valid()||!scriptAlias.Valid()||!detail::SamePin(detail::ReadPin(alias.Get(),false),profile.ae.pin)||
            !detail::SamePin(detail::ReadPin(scriptAlias.Get(),false),created)||detail::Hash(detail::ReadExact(scriptAlias.Get(),16384))!=generated.sha256)Refuse("trusted_bootstrap_fixed_alias_refused",0,true);
        retained.job=Held(CreateJobObjectW(nullptr,nullptr));if(!retained.job.Valid())Refuse("trusted_bootstrap_original_job_create_refused",GetLastError(),true);
        // No kill-on-close, breakaway, termination or adopted application PID.
        // The job observes only this returned original and its future children.
        const auto command=Quote(profile.aeLocator)+L" -r "+Quote(profile.panelBootstrapLocator);std::vector<wchar_t> argv(command.begin(),command.end());argv.push_back(0);
        wchar_t windows[32761]{};const UINT count=GetWindowsDirectoryW(windows,32761);if(!count||count>=32761)Refuse("trusted_bootstrap_system_root_refused",0,true);
        const auto systemRoot=L"SystemRoot="+std::wstring(windows,count);std::vector<wchar_t> environment(systemRoot.begin(),systemRoot.end());environment.push_back(0);environment.push_back(0);
        STARTUPINFOW startup{};startup.cb=sizeof(startup);PROCESS_INFORMATION original{};
        std::unique_lock<std::mutex> creationLock(creationCriticalSection);boundary();
        const BOOL createdProcess=CreateProcessW(profile.aeLocator.c_str(),argv.data(),nullptr,nullptr,FALSE,CREATE_SUSPENDED|CREATE_NO_WINDOW|CREATE_UNICODE_ENVIRONMENT,
            environment.data(),profile.repository.c_str(),&startup,&original);const auto error=GetLastError();retained.process=Held(original.hProcess);retained.thread=Held(original.hThread);
        retained.launched=createdProcess||retained.process.Valid()||retained.thread.Valid();
        if(!createdProcess||!retained.process.Valid()||!retained.thread.Valid())Refuse("trusted_bootstrap_original_create_unknown",error,true);
        retained.birth=detail::ProcessBirth(retained.process.Get());if(GetProcessId(retained.process.Get())!=original.dwProcessId||!retained.birth||retained.birth<data_->self->birth||
            detail::ProcessSid(retained.process.Get())!=reviewed::EmbeddedProfile().userSid||detail::ProcessImage(retained.process.Get())!=profile.ae.pin.canonicalPath||
            !detail::ProcessLive(retained.process.Get())||!AssignProcessToJobObject(retained.job.Get(),retained.process.Get()))Refuse("trusted_bootstrap_suspended_original_refused",GetLastError(),true);
        boundary();if(!executable.Current()||!detail::SamePin(detail::ReadPin(scriptAlias.Get(),false),created))Refuse("trusted_bootstrap_preresume_source_changed",0,true);
        const auto resumed=ResumeThread(retained.thread.Get());if(resumed!=1)Refuse("trusted_bootstrap_original_resume_unknown",resumed==static_cast<DWORD>(-1)?GetLastError():0,true);
        creationLock.unlock();
        for(;;){boundary();const auto wait=WaitForSingleObject(retained.process.Get(),0);if(wait==WAIT_FAILED)Refuse("trusted_bootstrap_original_wait_unknown",GetLastError(),true);
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};if(!QueryInformationJobObject(retained.job.Get(),JobObjectBasicAccountingInformation,&accounting,sizeof(accounting),nullptr))Refuse("trusted_bootstrap_original_children_unknown",GetLastError(),true);
            if(wait==WAIT_OBJECT_0&&accounting.ActiveProcesses==0){DWORD exit=0;if(!GetExitCodeProcess(retained.process.Get(),&exit)||exit!=0||detail::ProcessBirth(retained.process.Get())!=retained.birth)
                    Refuse("trusted_bootstrap_original_exit_refused",GetLastError(),true);retained.settled=true;break;}Sleep(5);}
        boundary(); // CLI exit is observed; executed/readiness proof is still G2.
    }catch(...){std::lock_guard<std::mutex> lock(data_->serial);data_->unknown=true;throw;}
}
void NativeClient::AssertBootstrapSettled(){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();if(data_->panelHelper&&data_->panelHelper->launched){auto& original=*data_->panelHelper;
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};if(!original.settled||!original.process.Valid()||WaitForSingleObject(original.process.Get(),0)!=WAIT_OBJECT_0||
        !original.job.Valid()||!QueryInformationJobObject(original.job.Get(),JobObjectBasicAccountingInformation,&accounting,sizeof(accounting),nullptr)||accounting.ActiveProcesses!=0)
        Refuse("trusted_bootstrap_original_children_pending",0,data_->unknown);}}
std::shared_ptr<Capability> NativeClient::CaptureOriginalAeCepFixed(){RequireRole(Role::Daemon);AssertCurrent();
    if(!data_->preactor||!data_->preactor->Current())Refuse("trusted_original_preactor_required");
    if(data_->actorAttempted)Refuse("trusted_original_actor_capture_once");data_->actorAttempted=true;const auto& p=EmbeddedProfile();
    Held snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0));if(!snapshot.Valid())Refuse("trusted_native_process_inventory_unavailable",GetLastError());
    std::map<DWORD,PROCESSENTRY32W> entries;PROCESSENTRY32W row{};row.dwSize=sizeof(row);
    if(!Process32FirstW(snapshot.Get(),&row))Refuse("trusted_native_process_inventory_unavailable",GetLastError());
    do{if(entries.size()>=4096)Refuse("trusted_native_process_inventory_budget");entries.emplace(row.th32ProcessID,row);row.dwSize=sizeof(row);}while(Process32NextW(snapshot.Get(),&row));
    if(GetLastError()!=ERROR_NO_MORE_FILES)Refuse("trusted_native_process_inventory_unknown",GetLastError());DWORD ae=0;
    for(const auto& entry:entries)if(_wcsicmp(entry.second.szExeFile,L"AfterFX.exe")==0){if(ae)Refuse("trusted_ae_ambiguous");ae=entry.first;}
    if(!ae||ae!=data_->preactor->pid||!data_->preactor->Current())Refuse("trusted_original_ae_changed");
    std::vector<std::unique_ptr<Process>> captured;
    std::vector<std::unique_ptr<CheckedFile>> capturedFiles;for(const auto& image:p.cepImages)capturedFiles.push_back(std::make_unique<CheckedFile>(image));
    for(const auto& entry:entries){const reviewed::File* image=nullptr;for(const auto& approved:p.cepImages){const auto at=approved.pin.canonicalPath.find_last_of(L'\\');
            if(at!=std::wstring::npos&&_wcsicmp(entry.second.szExeFile,approved.pin.canonicalPath.substr(at+1).c_str())==0){if(image)Refuse("trusted_cep_image_ambiguous");image=&approved;}}
        if(!image)continue;DWORD current=entry.first;std::uint64_t childBirth=std::numeric_limits<std::uint64_t>::max();std::vector<std::unique_ptr<Process>> chain;
        for(unsigned depth=0;depth<8&&current!=ae;++depth){auto found=entries.find(current);if(found==entries.end())break;
            const reviewed::File* approved=nullptr;for(const auto& candidate:p.cepImages)if(_wcsicmp(found->second.szExeFile,candidate.pin.canonicalPath.substr(candidate.pin.canonicalPath.find_last_of(L'\\')+1).c_str())==0)approved=&candidate;
            if(!approved)break;CheckedFile checked(*approved);auto originalCep=std::make_unique<Process>(Held(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,current)),*approved,reviewed::EmbeddedProfile().userSid);
            if(originalCep->birth>childBirth)Refuse("trusted_cep_creation_order_refused");childBirth=originalCep->birth;current=found->second.th32ParentProcessID;chain.push_back(std::move(originalCep));}
        if(current!=ae)continue;if(childBirth<data_->preactor->birth)Refuse("trusted_cep_ae_creation_order_refused");
        for(auto& process:chain)if(std::none_of(captured.begin(),captured.end(),[&](const auto& old){return old->pid==process->pid;}))captured.push_back(std::move(process));
    }
    DWORD listener=0;
    for(const auto& tcp:TcpRows())if(tcp.dwState==MIB_TCP_STATE_LISTEN&&tcp.dwLocalAddr==htonl(INADDR_LOOPBACK)&&Port(tcp.dwLocalPort)==p.cdpPort){
        if(listener||std::none_of(captured.begin(),captured.end(),[&](const auto& process){return process->pid==tcp.dwOwningPid;}))Refuse("trusted_cdp_listener_not_original_cep");listener=tcp.dwOwningPid;}
    if(!listener)Refuse("trusted_original_cdp_listener_absent");{std::lock_guard<std::mutex> lock(data_->serial);for(auto& file:capturedFiles)data_->files.push_back(std::move(file));
        data_->captured=std::move(captured);data_->listenerPid=listener;}phase::Frame value{};value.header.verb=phase::Verb::ObserveSameActorState;
    value.header.payloadBytes=112;const auto ref=detail::RandomId();std::copy(ref.begin(),ref.end(),value.payload.begin());return Own(CapKind::ActorTarget,value);
}
void NativeClient::AssertCapturedCurrent(const std::shared_ptr<Capability>& cap){Require(cap,CapKind::ActorTarget);AssertCurrent();
    if(!data_->preactor||!data_->preactor->Current()||data_->captured.empty()||!std::all_of(data_->captured.begin(),data_->captured.end(),[](const auto& p){return p->Current();}))Refuse("trusted_original_ae_cep_changed");
    unsigned matches=0;for(const auto& tcp:TcpRows())if(tcp.dwState==MIB_TCP_STATE_LISTEN&&tcp.dwLocalAddr==htonl(INADDR_LOOPBACK)&&Port(tcp.dwLocalPort)==EmbeddedProfile().cdpPort){if(tcp.dwOwningPid!=data_->listenerPid)Refuse("trusted_original_cdp_listener_changed");++matches;}
    if(matches!=1)Refuse("trusted_original_cdp_listener_ambiguous");
}
const Profile& NativeClient::CepObserverDefinition(const std::shared_ptr<Capability>& target){AssertCapturedCurrent(target);AssertLoadedNodeCurrent();const auto& p=EmbeddedProfile();
    if(p.cdpTargetUrl.empty()||p.cepContextOrigin.empty()||p.cepDiagnostic.empty()||p.cepSources.empty()||!p.cepSourceBytes)Refuse("trusted_fixed_cep_inventory_missing");return p;}
phase::Frame NativeClient::ObservationChallengeDescriptor(const std::shared_ptr<Capability>& cap){AssertLoadedNodeCurrent();auto& challenge=Require(cap,CapKind::Challenge);
    if(challenge.frame_.header.verb!=phase::Verb::ObserveChallenge||challenge.frame_.header.payloadBytes!=34||detail::Zero(Fixed<16>(challenge.frame_.payload.data()))||
        (Number(challenge.frame_.payload.data()+16,2)!=1&&Number(challenge.frame_.payload.data()+16,2)!=2))Refuse("trusted_original_observation_challenge_required");return challenge.frame_;}
std::shared_ptr<Capability> NativeClient::CaptureObservationFixed(const std::shared_ptr<Capability>& target,const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const CepCapture& actual){
    const auto challenge=ObservationChallengeDescriptor(cap);const auto& profile=CepObserverDefinition(target);(void)OriginalRequestBody(request);
    if(!request->panel_||request->fields_.method!="GET"||request->fields_.url.substr(0,13)!="/bridge/next?"||request->fields_.panelConnection!=actual.panelConnection||
        request->fields_.panelGeneration!=actual.panelGeneration||request->fields_.panelInstance!=actual.panelInstance||request->fields_.panelEpoch!=actual.panelEpoch||
        actual.panelConnection.empty()||actual.panelGeneration.empty()||actual.panelInstance.empty()||actual.panelEpoch>9007199254740991ULL||
        actual.targetId.empty()||actual.frameId.empty()||!actual.contextId||actual.contextUniqueId.empty()||actual.contextOrigin!=profile.cepContextOrigin||
        actual.sources.size()!=profile.cepSources.size()||detail::Zero(actual.catalog)||actual.actualQuiescence.empty()||actual.actualQuiescence.size()>1048576)Refuse("trusted_actual_cep_capture_refused");
    std::set<std::string> ids,urls;std::vector<std::string> staticIds;std::string diagnosticId;std::uint64_t total=0;Bytes sourceBinding;
    for(std::size_t i=0;i<actual.sources.size();++i){const auto& expected=profile.cepSources[i];const auto& observed=actual.sources[i];
        if(!expected.selector||observed.selector!=expected.selector||observed.scriptId.empty()||!ids.insert(observed.scriptId).second||observed.url!=expected.url||
            (!expected.diagnostic&&!urls.insert(observed.url).second)||observed.contextId!=actual.contextId||observed.startLine!=expected.startLine||observed.startColumn!=expected.startColumn||observed.endLine!=expected.endLine||
            observed.endColumn!=expected.endColumn||observed.length!=expected.length||observed.hasSourceURL!=expected.hasSourceURL||observed.isModule!=expected.isModule||observed.isLiveEdit!=expected.isLiveEdit||
            !observed.sourceMapURL.empty()||!expected.utf8ByteLength||observed.source.size()!=expected.utf8ByteLength||total>profile.cepSourceBytes||observed.source.size()>profile.cepSourceBytes-total||detail::Hash(observed.source)!=expected.compiled)Refuse("trusted_cep_compiled_source_changed");
        if(observed.source.size()>static_cast<std::size_t>(std::numeric_limits<int>::max()))Refuse("trusted_cep_source_utf8_limit");
        const int units=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,reinterpret_cast<const char*>(observed.source.data()),static_cast<int>(observed.source.size()),nullptr,0);
        if(units<=0||static_cast<std::uint32_t>(units)!=observed.length)Refuse("trusted_cep_source_utf8_extent_refused");
        total+=observed.source.size();detail::PutU16(sourceBinding,expected.selector);Put(sourceBinding,expected.compiled);
        if(expected.diagnostic){if(!diagnosticId.empty()||observed.source!=Bytes(profile.cepDiagnostic.begin(),profile.cepDiagnostic.end()))Refuse("trusted_cep_diagnostic_source_refused");diagnosticId=observed.scriptId;}
        else staticIds.push_back(observed.scriptId);
    }
    if(total!=profile.cepSourceBytes||diagnosticId.empty()||data_->cepDiagnosticIds.count(diagnosticId))Refuse("trusted_cep_source_closure_refused");
    Bytes contextFields(actual.targetId.begin(),actual.targetId.end());contextFields.push_back(0);Put(contextFields,actual.frameId);contextFields.push_back(0);Put(contextFields,actual.contextUniqueId);detail::PutU64(contextFields,actual.contextId);Put(contextFields,sourceBinding);
    const auto context=DomainHash("lcp2.production.loaded-cep-context.v1",contextFields);
    Bytes actorFields;detail::PutU64(actorFields,data_->preactor->birth);detail::PutU64(actorFields,data_->preactor->pid);Put(actorFields,context);Put(actorFields,actual.panelInstance);actorFields.push_back(0);Put(actorFields,actual.panelConnection);actorFields.push_back(0);Put(actorFields,actual.panelGeneration);detail::PutU64(actorFields,actual.panelEpoch);Put(actorFields,actual.catalog);
    for(const auto& process:data_->captured){detail::PutU64(actorFields,process->pid);detail::PutU64(actorFields,process->birth);}
    const auto actorHash=DomainHash("lcp2.production.original-cep-actor.v1",actorFields);
    if(data_->sourceGeneration){if(data_->cepTarget!=actual.targetId||data_->cepFrame!=actual.frameId||data_->cepContextId!=actual.contextId||data_->cepContextUniqueId!=actual.contextUniqueId||data_->cepStaticScriptIds!=staticIds||data_->observationActorHash!=actorHash)Refuse("trusted_cep_original_generation_changed");}
    else{data_->cepTarget=actual.targetId;data_->cepFrame=actual.frameId;data_->cepContextId=actual.contextId;data_->cepContextUniqueId=actual.contextUniqueId;data_->cepStaticScriptIds=std::move(staticIds);data_->observationActor=detail::RandomId();data_->observationActorHash=actorHash;data_->sourceGeneration=1;}
    data_->cepDiagnosticIds.insert(diagnosticId);const auto& peer=request->connection_->Peer();Bytes transport;detail::PutU64(transport,peer.localAddress);detail::PutU64(transport,peer.remoteAddress);detail::PutU64(transport,peer.localPort);detail::PutU64(transport,peer.remotePort);Put(transport,actorHash);
    auto capture=std::make_shared<ObservationCapture>();capture->challenge=Fixed<16>(challenge.payload.data());capture->purpose=static_cast<phase::ChallengePurpose>(Number(challenge.payload.data()+16,2));capture->target=Fixed<16>(challenge.payload.data()+18);
    capture->actorRef=data_->observationActor;capture->actor=actorHash;capture->context=context;capture->transport=DomainHash("lcp2.production.actual-panel-transport.v1",transport);capture->observed=GetTickCount64();capture->generation=data_->sourceGeneration;
    if(data_->observationOrdinal==std::numeric_limits<std::uint64_t>::max())Refuse("trusted_observation_ordinal_overflow");capture->ordinal=data_->observationOrdinal+1;capture->panelConnection=actual.panelConnection;capture->panelGeneration=actual.panelGeneration;capture->panelInstance=actual.panelInstance;capture->panelEpoch=actual.panelEpoch;capture->panelChatSession=actual.panelChatSession;
    Bytes readiness;Put(readiness,actual.catalog);Put(readiness,sourceBinding);Put(readiness,detail::Hash(actual.actualQuiescence));detail::PutU64(readiness,0x7f);capture->readiness=DomainHash("lcp2.production.actual-quiescence.v1",readiness);
    Bytes fields;Put(fields,capture->actor);Put(fields,data_->originalSeal->ResolvedEnrollment().sourceSetHash);Put(fields,capture->context);Put(fields,capture->target);detail::PutU64(fields,capture->observed);Put(fields,capture->transport);Put(fields,capture->actorRef);Put(fields,capture->readiness);detail::PutU64(fields,capture->generation);detail::PutU64(fields,capture->generation);Put(fields,capture->challenge);detail::PutU64(fields,capture->ordinal);
    capture->snapshot=DomainHash("lcp2.production.actor-readiness-snapshot.v1",fields);AssertCapturedCurrent(target);(void)OriginalRequestBody(request);phase::Frame frame=challenge;auto own=Own(CapKind::Observation,frame);own->observation_=std::move(capture);return own;
}
std::shared_ptr<Capability> NativeClient::SubmitObservation(const std::shared_ptr<Capability>& challengeCap,const std::shared_ptr<Capability>& observationCap){AssertLoadedNodeCurrent();auto& challenge=Require(challengeCap,CapKind::Challenge);auto& own=Require(observationCap,CapKind::Observation);
    if(!own.observation_)Refuse("trusted_original_observation_capture_required");const auto& observed=*own.observation_;const auto now=GetTickCount64();
    if(observed.challenge!=Fixed<16>(challenge.frame_.payload.data())||observed.target!=Fixed<16>(challenge.frame_.payload.data()+18)||static_cast<unsigned>(observed.purpose)!=Number(challenge.frame_.payload.data()+16,2)||now<observed.observed||now-observed.observed>10000)Refuse("trusted_observation_challenge_mismatch");
    Bytes body;phase::Verb verb=phase::Verb::ReadySnapshot;
    if(observed.purpose==phase::ChallengePurpose::Readiness){Put(body,observed.challenge);detail::PutU64(body,observed.ordinal);Put(body,observed.snapshot);Put(body,observed.actor);Put(body,data_->originalSeal->ResolvedEnrollment().sourceSetHash);Put(body,observed.context);Put(body,observed.target);detail::PutU64(body,observed.observed);Put(body,observed.transport);Put(body,observed.actorRef);Put(body,observed.readiness);detail::PutU64(body,observed.generation);detail::PutU64(body,observed.generation);detail::PutU16(body,0x7f);detail::PutU16(body,0);}
    else{if(observed.purpose!=phase::ChallengePurpose::SameActor||observed.target!=data_->observationTarget||observed.actor!=data_->observationActorHash||observed.context!=data_->observationContext)Refuse("trusted_same_actor_capture_mismatch");
        verb=phase::Verb::ObserveSameActorState;Put(body,observed.challenge);Put(body,observed.target);Put(body,data_->observationActorHash);Put(body,data_->observationContext);detail::PutU64(body,data_->observationMono);detail::PutU64(body,data_->sourceGeneration);}
    challenge.spent_=true;own.spent_=true;own.frame_=Exchange(verb,body);
    // This is the retained consumed observation witness. It cannot pass
    // Require/AssertCapabilityCurrent or submit again; no cap is revived.
    if(verb==phase::Verb::ReadySnapshot){std::lock_guard<std::mutex> lock(data_->serial);
        try{if(!data_->Current())Refuse("trusted_original_observation_publication_closed",0,true);
            data_->observationTarget=observed.target;data_->observationSnapshot=observed.snapshot;data_->observationContext=observed.context;data_->observationTransport=observed.transport;data_->observationOrdinal=observed.ordinal;data_->observationMono=observed.observed;
            data_->panelConnection=observed.panelConnection;data_->panelGeneration=observed.panelGeneration;data_->panelInstance=observed.panelInstance;data_->panelEpoch=observed.panelEpoch;data_->panelChatSession=observed.panelChatSession;
        }catch(...){data_->unknown=true;throw;}}
    return observationCap;
}
std::shared_ptr<Capability> NativeClient::ObserveActor(const std::shared_ptr<Capability>& handlerCap,const std::shared_ptr<Capability>& observationCap){AssertLoadedNodeCurrent();auto& handler=Require(handlerCap,CapKind::Handler);
    if(!observationCap||observationCap->owner_!=this||observationCap->kind_!=CapKind::Observation||!observationCap->spent_||!observationCap->observation_||observationCap->frame_.header.verb!=phase::Verb::ObserveSameActorState||Number(handler.frame_.payload.data()+72,2)!=5)Refuse("trusted_original_first_actor_capture_required");
    const auto& observed=*observationCap->observation_;const auto now=GetTickCount64();if(now<observed.observed||now-observed.observed>10000||observed.actorRef!=data_->observationActor||observed.actor!=data_->observationActorHash||observed.context!=data_->observationContext||observed.generation!=data_->sourceGeneration)Refuse("trusted_original_first_actor_capture_stale");
    const auto& p=data_->originalSeal->ResolvedEnrollment();Bytes installed;for(const auto& file:EmbeddedProfile().panelFiles){detail::PutPin(installed,file.pin);Put(installed,file.sha256);}const auto installedHash=DomainHash("lcp2.production.installed-panel-closure.v1",installed);
    Bytes scope;Put(scope,p.installation);detail::PutPin(scope,p.repository);detail::PutPin(scope,p.runtime);detail::PutPin(scope,p.journal);detail::PutPin(scope,p.lockFile);Bytes proof;const char* domain="lcp2.native.first-actor.observation.v2";detail::PutU16(proof,static_cast<std::uint16_t>(std::strlen(domain)));Put(proof,std::string(domain));Put(proof,detail::Hash(scope));Put(proof,p.policyHash);Put(proof,data_->wire->bindings_.sessionRef);Put(proof,data_->wire->bindings_.generation);Put(proof,data_->wire->bindings_.bootNonce);
    Bytes body(handler.frame_.payload.begin(),handler.frame_.payload.begin()+32);Put(body,data_->observationActor);Put(body,data_->observationActorHash);Put(body,installedHash);Put(proof,body);Put(body,detail::Hash(proof));handler.spent_=true;return Own(CapKind::Terminal,Exchange(phase::Verb::FirstActorObserved,body));}
void NativeClient::BindLoadedNodeProof(const std::vector<LoadedSource>& sources){AssertCurrent();std::lock_guard<std::mutex> lock(data_->serial);const auto expected=NodeSourceInventory();
    if(data_->loadedSources||sources.size()!=expected.size()||sources.empty())Refuse("trusted_loaded_node_closure_refused");
    const auto totalExpected=data_->role==Role::Controller?EmbeddedProfile().controllerSourceBytes:EmbeddedProfile().daemonSourceBytes;
    std::uint64_t total=0;std::map<std::string,bool> urls,scriptIds;std::map<std::uint16_t,bool> selectors;
    const LoadedSource* defaultContext=nullptr;const LoadedSource* internalContext=nullptr;const LoadedSource* inspectorRow=nullptr;
    for(std::size_t i=0;i<sources.size();++i){const auto& row=sources[i];const auto& fixed=expected[i];
        if(row.selector!=fixed.selector||row.category!=fixed.category||row.contextSlot!=fixed.contextSlot||row.url!=fixed.url||row.scriptId.empty()||row.scriptId.size()>256||
            !urls.emplace(row.url,true).second||!scriptIds.emplace(row.scriptId,true).second||!selectors.emplace(row.selector,true).second||
            row.hasSourceURL||row.isModule||row.isLiveEdit||row.scriptLanguage!="JavaScript"||row.startLine||row.startColumn||!row.sourceMapURL.empty()||row.embedderName!=row.url||
            row.endLine!=fixed.endLine||row.endColumn!=fixed.endColumn||row.length!=fixed.length||row.source.size()!=fixed.utf8ByteLength||row.source.empty()||
            row.source.size()>static_cast<std::size_t>(std::numeric_limits<int>::max())||detail::Hash(row.source)!=fixed.compiled||row.reportedHash!=fixed.compiled)
            Refuse("trusted_loaded_node_exact_metadata_or_bytes_refused");
        if(total>totalExpected||row.source.size()>totalExpected-total)Refuse("trusted_loaded_node_total_length_refused");total+=row.source.size();
        const int units=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,reinterpret_cast<const char*>(row.source.data()),static_cast<int>(row.source.size()),nullptr,0);
        if(units<=0||static_cast<std::uint32_t>(units)!=row.length)Refuse("trusted_loaded_node_utf8_extent_refused");
        if(row.category==SourceCategory::NodeCompileZero){if(row.contextSlot!=ContextSlot::None||row.executionContextId||row.scriptAuxPresent||row.contextPresent||row.contextId||
                !row.contextUniqueId.empty()||!row.contextName.empty()||!row.contextOrigin.empty()||row.url.rfind("node:",0)!=0)Refuse("trusted_loaded_node_zero_category_refused");}
        else{const bool internal=row.category==SourceCategory::InternalThis;
            if((row.category!=SourceCategory::FileDefault&&row.category!=SourceCategory::NodeDefault&&!internal)||
                row.contextSlot!=(internal?ContextSlot::Internal:ContextSlot::Default)||!row.executionContextId||!row.scriptAuxPresent||row.scriptAuxDefault==internal||
                !row.contextPresent||row.contextId!=row.executionContextId||row.contextUniqueId.empty()||row.contextUniqueId.size()>256||!row.contextOrigin.empty()||row.contextAuxDefault==internal)
                Refuse("trusted_loaded_node_registered_context_refused");
            auto*& same=internal?internalContext:defaultContext;
            if(same&&(same->contextId!=row.contextId||same->contextUniqueId!=row.contextUniqueId||same->contextName!=row.contextName))Refuse("trusted_loaded_node_slot_identity_changed");same=&row;
            if(internal){if(row.url!="evalmachine.<anonymous>"||row.contextName!=u"internal"||row.source!=Bytes({'t','h','i','s'})||row.endLine||row.endColumn!=4||row.length!=4)Refuse("trusted_loaded_node_internal_this_refused");}
            else if(row.category==SourceCategory::NodeDefault){if(row.url.rfind("node:",0)!=0||!fixed.file.components.empty())Refuse("trusted_loaded_node_default_category_refused");}
            else if(fixed.file.components.empty()||row.url.rfind("node:",0)==0)Refuse("trusted_loaded_node_file_category_refused");
        }
        if(row.url=="node:inspector"){if(row.category!=SourceCategory::NodeDefault||inspectorRow)Refuse("trusted_loaded_node_inspector_row_refused");inspectorRow=&row;}
    }
    if(total!=totalExpected||!defaultContext||!inspectorRow||(internalContext&&(internalContext->contextId==defaultContext->contextId||internalContext->contextUniqueId==defaultContext->contextUniqueId)))
        Refuse("trusted_loaded_node_slot_closure_refused");
    for(const auto& row:sources)if(row.correlationScriptId!=inspectorRow->scriptId||row.correlationFunction!="post"||row.correlationUrl!="node:inspector"||row.correlationLine!=138||row.correlationColumn!=21)
        Refuse("trusted_loaded_node_initial_correlation_refused");
    // Inspector metadata is validated as private producer evidence. It is not an
    // independent native attestation of historical Inspector event provenance.
    if(!data_->Current())Refuse("trusted_loaded_node_late_guard");data_->loadedSources=true;
}
std::unique_ptr<FixedHttpListener> NativeClient::OpenHttpListenerFixed(){RequireRole(Role::Daemon);AssertCurrent();{
    std::lock_guard<std::mutex> lock(data_->serial);if(!data_->loadedSources||data_->httpOpened)Refuse("trusted_original_http_source_gate");if(!data_->httpOwner)data_->httpOwner=this;else if(data_->httpOwner!=this)Refuse("trusted_original_http_owner_mismatch");data_->httpOpened=true;}
    return std::unique_ptr<FixedHttpListener>(new FixedHttpListener(*this));
}
void NativeClient::AssertSocketPeer(AcceptedConnection& connection){RequireRole(Role::Daemon);AssertCurrent();connection.AssertCurrent();const auto& observed=connection.Peer();DWORD local=0,remote=0;
    for(const auto& row:TcpRows())if(row.dwState==MIB_TCP_STATE_ESTAB&&row.dwLocalAddr==observed.localAddress&&row.dwRemoteAddr==observed.remoteAddress){
        if(Port(row.dwLocalPort)==observed.localPort&&Port(row.dwRemotePort)==observed.remotePort){if(local)Refuse("trusted_accepted_socket_local_ambiguous");local=row.dwOwningPid;}
        if(Port(row.dwLocalPort)==observed.remotePort&&Port(row.dwRemotePort)==observed.localPort){if(remote)Refuse("trusted_accepted_socket_peer_ambiguous");remote=row.dwOwningPid;}}
    if(local!=GetCurrentProcessId()||!remote)Refuse("trusted_accepted_socket_original_owner_refused");
    const bool controller=data_->controller&&data_->controller->pid==remote&&data_->controller->Current();
    const bool cep=std::any_of(data_->captured.begin(),data_->captured.end(),[&](const auto& original){return original->pid==remote&&original->Current();});
    if(!controller&&!cep)Refuse("trusted_accepted_socket_original_peer_refused");connection.AssertCurrent();
}
void NativeClient::AuthenticateSocketRequest(AcceptedConnection& connection,const std::string& token,bool panel){AssertSocketPeer(connection);
    const auto& expected=panel?production::EmbeddedDefinition().panelCredential:production::EmbeddedDefinition().automationCredential;
    const CheckedFile* credential=nullptr;for(const auto& file:data_->files)if(detail::SamePin(file->approved.pin,expected.pin))credential=file.get();
    if(!credential||token.empty()||token.size()>4096)Refuse("trusted_accepted_authentication_refused");const auto bytes=detail::ReadExact(credential->file.Get(),4096);
    // Exact source bytes, no trimming/JSON/env fallback. Credentials remain
    // separate from request/actor/session authorization.
    if(token.size()!=bytes.size()||!std::equal(bytes.begin(),bytes.end(),token.begin()))Refuse("trusted_accepted_authentication_refused");
    const auto& peer=connection.Peer();DWORD pid=0;for(const auto& row:TcpRows())if(row.dwState==MIB_TCP_STATE_ESTAB&&row.dwLocalAddr==peer.remoteAddress&&Port(row.dwLocalPort)==peer.remotePort&&row.dwRemoteAddr==peer.localAddress&&Port(row.dwRemotePort)==peer.localPort){if(pid)Refuse("trusted_authenticated_peer_ambiguous");pid=row.dwOwningPid;}
    if(panel){if(data_->captured.empty()||std::none_of(data_->captured.begin(),data_->captured.end(),[&](const auto& original){return original->pid==pid&&original->Current();}))Refuse("trusted_authenticated_panel_peer_refused");}
    else if(!data_->controller||data_->controller->pid!=pid||!data_->controller->Current())Refuse("trusted_authenticated_mcp_peer_refused");
}
namespace {
bool FixedIdleQuery(const HttpRequestFields& fields){
    if(!fields.parserComplete||fields.aborted||fields.method!="GET"||!fields.body.empty()||fields.url.substr(0,13)!="/bridge/next?")return false;
    std::map<std::string,std::string> values;std::size_t at=13;
    const auto nibble=[](char c)->int{if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;if(c>='A'&&c<='F')return c-'A'+10;return -1;};
    while(at<fields.url.size()){const auto end=fields.url.find('&',at);const auto item=fields.url.substr(at,end==std::string::npos?std::string::npos:end-at);const auto equal=item.find('=');
        if(equal==std::string::npos)return false;const auto key=item.substr(0,equal);
        if(key!="panelConnectionId"&&key!="panelGeneration"&&key!="panelInstanceId"&&key!="panelLifecycleEpoch"&&key!="projectFile")return false;
        std::string decoded;const auto encoded=item.substr(equal+1);decoded.reserve(encoded.size());for(std::size_t i=0;i<encoded.size();++i){char c=encoded[i];
            if(c=='%'){if(i+2>=encoded.size())return false;const auto high=nibble(encoded[i+1]),low=nibble(encoded[i+2]);if(high<0||low<0)return false;c=static_cast<char>((high<<4)|low);i+=2;}
            else if(c=='+')c=' ';if(c=='\0')return false;decoded.push_back(c);}
        if(!decoded.empty()&&MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,decoded.data(),static_cast<int>(decoded.size()),nullptr,0)<=0)return false;
        if(!values.emplace(key,std::move(decoded)).second)return false;if(end==std::string::npos)break;at=end+1;if(at==fields.url.size())return false;
    }
    if(values.size()!=5||fields.panelConnection.empty()||fields.panelGeneration.empty()||fields.panelInstance.empty()||fields.panelConnection.size()>256||fields.panelGeneration.size()>256||fields.panelInstance.size()>256||
        values["panelConnectionId"]!=fields.panelConnection||values["panelGeneration"]!=fields.panelGeneration||values["panelInstanceId"]!=fields.panelInstance)return false;
    const auto& epoch=values["panelLifecycleEpoch"];if(epoch.empty()||epoch.size()>16)return false;std::uint64_t number=0;
    for(const char digit:epoch){if(digit<'0'||digit>'9'||number>(9007199254740991ULL-static_cast<unsigned>(digit-'0'))/10)return false;number=number*10+static_cast<unsigned>(digit-'0');}
    return number==fields.panelEpoch;
}
}
std::shared_ptr<AuthenticatedRequest> NativeClient::RetainAuthenticatedRequest(std::shared_ptr<AcceptedConnection> connection,HttpRequestFields fields){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();if(!connection||fields.body.size()>1048576||fields.url.empty()||fields.url.size()>8192||fields.url[0]!='/'||fields.url.find('#')!=std::string::npos||
        !fields.parserComplete||fields.aborted||
        (fields.host!="127.0.0.1:3456"&&fields.host!="localhost:3456")||
        (fields.originPresent&&fields.origin!="null"&&fields.origin!="file://"&&fields.origin!="http://127.0.0.1:3456"&&fields.origin!="http://localhost:3456"))Refuse("trusted_authenticated_host_origin_refused");
    const auto query=fields.url.find('?');const auto path=fields.url.substr(0,query);bool panel=false;
    if(path=="/mcp/tools/call"){if(fields.method!="POST"||query!=std::string::npos||fields.adapter!="codex-stdio-v1"||fields.toolLocatorHex.size()!=138)Refuse("trusted_authenticated_tool_route_refused");}
    else{panel=true;const bool fixedGet=fields.method=="GET"&&(path=="/bridge/next"||path=="/bridge/heartbeat"||path=="/health"||path=="/status"||path=="/agents"||path=="/usage"||path=="/agents/plan/current"||path=="/autonomy/session"||path=="/placeholder/protection"||
            path=="/human-guard-settlement/lookup"||path=="/ame/fixture-ui-disposition/lookup"||path=="/ame/native-fixture-abandonment/lookup"||path=="/ame/native-fixture-prephase-recovery/lookup"||path=="/ame/native-fixture-admission-refusal/lookup");
        const bool ownManual=EmbeddedProfile().execution.enabled&&(path=="/agents/plan/adopt"||path=="/agents/plan/run"||path=="/agents/ame/title-start/run");
        const bool fixedPost=fields.method=="POST"&&query==std::string::npos&&(path=="/bridge/submitted"||path=="/bridge/result"||path=="/bridge/heartbeat"||path=="/tools/call"||ownManual);
        if(!fixedGet&&!fixedPost)Refuse("trusted_authenticated_panel_route_refused");
        if(!fields.toolLocatorHex.empty()||!fields.adapter.empty()||(fields.method=="GET"&&!fields.body.empty()))Refuse("trusted_authenticated_panel_header_refused");
        if(query!=std::string::npos&&fields.url.substr(query).find("token")!=std::string::npos)Refuse("trusted_authenticated_query_credential_refused");}
    AuthenticateSocketRequest(*connection,fields.token,panel);AssertLoadedNodeCurrent();connection->AssertCurrent();
    const auto originalIo=connection->CaptureRequestIoSnapshot();std::lock_guard<std::mutex> lock(data_->serial);
    if(!data_->loadedSources||!data_->Current())Refuse("trusted_authenticated_original_retention_closed",0,data_->unknown);
    data_->requests.erase(std::remove_if(data_->requests.begin(),data_->requests.end(),[](const auto& request){return request->responseTerminal_&&!request->unknown_;}),data_->requests.end());
    if(data_->requests.size()>=192)Refuse("trusted_authenticated_request_retention_budget");
    if(panel&&path=="/bridge/next")data_->firstPanelNextRetained=true;
    const bool service=panel&&path!="/bridge/next"&&path!="/bridge/heartbeat"&&path!="/bridge/submitted"&&path!="/bridge/result"&&
        path!="/agents/plan/run"&&path!="/agents/ame/title-start/run";
    if(service){if(data_->ancillaryServices>=32)Refuse("trusted_lifetime_ancillary_service_budget");
        if(EmbeddedProfile().execution.enabled&&(path=="/agents/plan/current"||path=="/agents/plan/adopt")){
            std::shared_ptr<ExecutionCapture> proposal;
            for(const auto& row:data_->executionCaptures)if(row->tool==phase::ToolCode::ProposeAiAgentPlan&&row->stage==ExecutionCapture::Stage::Prepared)proposal=row;
            bool completedDry=false;if(proposal)for(const auto& row:data_->executionCaptures)if(row->tool==phase::ToolCode::RunAiAgentPlan&&row->stage==ExecutionCapture::Stage::Prepared&&
                row->originalManifest==proposal->originalManifest&&row->scope==proposal->scope&&row->issued>=proposal->issued&&row->actor==data_->observationActor)completedDry=true;
            if(!proposal&&path=="/agents/plan/current"&&!data_->firstPanelNextRetained&&!data_->startupNullCurrentRetained)data_->startupNullCurrentRetained=true;
            else{if(!proposal||!completedDry||proposal->actor!=data_->observationActor)Refuse("trusted_original_group_service_receipts_required");
                const unsigned bit=path=="/agents/plan/current"?1u:2u;auto& used=data_->manualGroupServices[proposal->scope];
                if((used&bit)||(bit==2u&&!(used&1u))||data_->manualGroupServices.size()>kTwoTitlePreparedScopes)Refuse("trusted_original_group_service_once");used|=bit;}
        }
        ++data_->ancillaryServices;
    }
    const bool idleCandidate=panel&&FixedIdleQuery(fields)&&data_->sourceGeneration&&fields.panelConnection==data_->panelConnection&&fields.panelGeneration==data_->panelGeneration&&
        fields.panelInstance==data_->panelInstance&&fields.panelEpoch==data_->panelEpoch&&originalIo.owner==data_->httpOwner&&originalIo.original&&originalIo.lifetime&&
        !originalIo.closed&&!originalIo.closeConfirmed&&!originalIo.unknown&&originalIo.pendingWrite==0;
    auto request=std::shared_ptr<AuthenticatedRequest>(new AuthenticatedRequest(this,std::move(connection),std::move(fields),panel,originalIo,idleCandidate));data_->requests.push_back(request);return request;
}
std::shared_ptr<Capability> NativeClient::VerifyTool(const std::shared_ptr<AuthenticatedRequest>& request,phase::ToolCode tool){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();if(!request||request->owner_!=this||request->panel_||request->handlerSpent_||request->responseTerminal_||request->unknown_)Refuse("trusted_authenticated_original_request_required");
    const auto expected=Body(tool,phase::CallKind::Read);const char* canonical=tool==phase::ToolCode::GetBridgeStatus?"{\"args\":{},\"name\":\"get_bridge_status\"}":
        tool==phase::ToolCode::GetProjectInfo?"{\"args\":{},\"name\":\"get_project_info\"}":tool==phase::ToolCode::EnsureAgentPanel?"{\"args\":{},\"name\":\"ensure_ae_agent_panel\"}":nullptr;
    if(!canonical||request->fields_.body!=Bytes(canonical,canonical+std::strlen(canonical)))Refuse("trusted_authenticated_canonical_tool_body_refused");
    Bytes locator;locator.reserve(69);const auto& text=request->fields_.toolLocatorHex;
    const auto nibble=[](char c)->unsigned{if(c>='0'&&c<='9')return static_cast<unsigned>(c-'0');if(c>='a'&&c<='f')return static_cast<unsigned>(c-'a'+10);Refuse("trusted_authenticated_tool_locator_refused");};
    for(std::size_t i=0;i<text.size();i+=2)locator.push_back(static_cast<unsigned char>((nibble(text[i])<<4)|nibble(text[i+1])));
    if(locator.size()!=69||!std::equal(expected.begin(),expected.begin()+2,locator.begin()+32)||!std::equal(expected.begin()+3,expected.end(),locator.begin()+35))Refuse("trusted_authenticated_tool_branch_refused");
    AuthenticateSocketRequest(*request->connection_,request->fields_.token,false);request->handlerSpent_=true;
    try{auto result=VerifyTool(locator,tool);result->ingress_=request;return result;}catch(...){request->unknown_=true;throw;}
}
std::shared_ptr<Capability> NativeClient::VerifyExecutionTool(const std::shared_ptr<AuthenticatedRequest>& request,phase::ToolCode tool){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();const auto* selected=phase::FindTool(tool);
    if(!selected||!request||request->owner_!=this||request->panel_||request->handlerSpent_||request->responseTerminal_||request->unknown_||
        request->fields_.method!="POST"||request->fields_.url!="/mcp/tools/call"||request->fields_.toolLocatorHex.size()!=138||
        request->fields_.body.empty()||request->fields_.body.size()>1048576)Refuse("trusted_execution_actual_request_refused");
    Bytes locator;locator.reserve(69);const auto& text=request->fields_.toolLocatorHex;
    const auto nibble=[](char c)->unsigned{if(c>='0'&&c<='9')return static_cast<unsigned>(c-'0');if(c>='a'&&c<='f')return static_cast<unsigned>(c-'a'+10);Refuse("trusted_execution_locator_refused");};
    for(std::size_t i=0;i<text.size();i+=2)locator.push_back(static_cast<unsigned char>((nibble(text[i])<<4)|nibble(text[i+1])));
    const auto kind=static_cast<phase::CallKind>(locator[34]);
    if(Number(locator.data()+32,2)!=static_cast<std::uint16_t>(tool)||Number(locator.data()+35,2)!=static_cast<std::uint16_t>(phase::RouteCode::McpToolsCall)||
        (kind!=phase::CallKind::ExecutionPrep&&kind!=phase::CallKind::Execute)||
        (selected->kind!=kind&&!(tool==phase::ToolCode::RunAiAgentPlan&&kind==phase::CallKind::ExecutionPrep))||
        Fixed<32>(locator.data()+37)!=detail::Hash(request->fields_.body))Refuse("trusted_execution_actual_body_or_kind_refused");
    AuthenticateSocketRequest(*request->connection_,request->fields_.token,false);request->handlerSpent_=true;
    try{auto result=Own(CapKind::Handler,Exchange(phase::Verb::VerifyIngress,locator));
        std::copy(locator.begin()+32,locator.end(),result->frame_.payload.begin()+72);
        std::copy(locator.begin(),locator.begin()+16,result->frame_.payload.begin()+109);result->ingress_=request;data_->executionHandlers.push_back(result);return result;}
    catch(...){request->unknown_=true;throw;}
}
std::shared_ptr<Capability> NativeClient::VerifyServerOnlyTool(const std::shared_ptr<AuthenticatedRequest>& request,phase::ToolCode tool){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();const auto* selected=phase::FindTool(tool);
    if(!selected||!selected->serverOnlyHandler||(tool!=phase::ToolCode::SearchSolutions&&tool!=phase::ToolCode::GetSolution)||!request||request->owner_!=this||request->panel_||
        request->handlerSpent_||request->responseTerminal_||request->unknown_||request->fields_.method!="POST"||request->fields_.url!="/mcp/tools/call"||request->fields_.toolLocatorHex.size()!=138)
        Refuse("trusted_server_only_actual_request_refused");
    Bytes locator;locator.reserve(69);const auto& text=request->fields_.toolLocatorHex;const auto nibble=[](char c)->unsigned{
        if(c>='0'&&c<='9')return static_cast<unsigned>(c-'0');if(c>='a'&&c<='f')return static_cast<unsigned>(c-'a'+10);Refuse("trusted_server_only_locator_refused");};
    for(std::size_t i=0;i<text.size();i+=2)locator.push_back(static_cast<unsigned char>((nibble(text[i])<<4)|nibble(text[i+1])));
    if(Number(locator.data()+32,2)!=static_cast<std::uint16_t>(tool)||locator[34]!=static_cast<unsigned char>(phase::CallKind::ServerOnly)||
        Number(locator.data()+35,2)!=static_cast<std::uint16_t>(phase::RouteCode::McpToolsCall)||Fixed<32>(locator.data()+37)!=detail::Hash(request->fields_.body))
        Refuse("trusted_server_only_actual_body_refused");
    AuthenticateSocketRequest(*request->connection_,request->fields_.token,false);request->handlerSpent_=true;
    try{auto result=Own(CapKind::Handler,Exchange(phase::Verb::VerifyIngress,locator));std::copy(locator.begin()+32,locator.end(),result->frame_.payload.begin()+72);result->ingress_=request;return result;}
    catch(...){request->unknown_=true;throw;}
}
const Bytes& NativeClient::OriginalServerOnlyBody(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Handler);AssertCapabilityCurrent(cap);
    const auto tool=static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2));if(own.frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::ServerOnly)||
        (tool!=phase::ToolCode::SearchSolutions&&tool!=phase::ToolCode::GetSolution)||!own.ingress_)Refuse("trusted_original_server_only_handler_required");return OriginalRequestBody(own.ingress_);}
const Bytes& NativeClient::OriginalExecutionBody(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Handler);AssertCapabilityCurrent(cap);
    const auto tool=static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2));
    if(own.frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::ExecutionPrep)||!own.ingress_||
        (tool!=phase::ToolCode::GetCompDetails&&tool!=phase::ToolCode::GetLayerDetails&&tool!=phase::ToolCode::InspectTitleVariants))Refuse("trusted_original_readonly_execution_handler_required");
    const auto& actual=OriginalRequestBody(own.ingress_);if(Fixed<32>(own.frame_.payload.data()+77)!=detail::Hash(actual))Refuse("trusted_original_execution_body_changed");return actual;}
namespace {Bytes ManifestCanonical(const capture::Json& value);}
std::shared_ptr<Capability> NativeClient::BindReadonlyExecutionFixed(const std::shared_ptr<Capability>& cap,const std::string& originalGeneratedSource){
    const auto& originalBody=OriginalExecutionBody(cap);auto& own=Require(cap,CapKind::Handler);const auto& profile=EmbeddedProfile();ExecutionCost worst;
    const auto now=GetTickCount64();if(!profile.execution.Validate(worst)||originalGeneratedSource.empty()||originalGeneratedSource.size()>1048576||
        originalGeneratedSource.find('\0')!=std::string::npos||detail::Zero(data_->observationSnapshot)||data_->observationTarget!=Fixed<16>(own.frame_.payload.data())||
        !data_->observationOrdinal||now<data_->observationMono||now-data_->observationMono>10000||data_->projects.size()>=kTwoTitleCalls)
        Refuse("trusted_readonly_execution_source_bind_refused");
    if(profile.execution.selectionMode==TitleSelectionMode::FirstTwoObservedTextStatesV1&&Number(own.frame_.payload.data()+72,2)==static_cast<std::uint16_t>(phase::ToolCode::InspectTitleVariants)){
        if(!data_->titleSelection)Refuse("trusted_own_first_two_selection_before_graph_required");
        const auto body=capture::ParseOriginalJson(originalBody,1048576,4096);const auto expected=DescribeSelectionFixed(data_->titleSelection);
        if(ManifestCanonical(body.Field("args"))!=expected)Refuse("trusted_actual_graph_request_selection_mismatch");
    }
    auto capture=std::make_shared<ProjectCapture>();capture->inspection=true;capture->tool=static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2));
    capture->command=detail::RandomId();capture->execution=detail::RandomId();capture->lease=detail::RandomId();capture->handler=Fixed<16>(own.frame_.payload.data());
    capture->originalScript=originalGeneratedSource;capture->script=detail::Hash(Bytes(originalGeneratedSource.begin(),originalGeneratedSource.end()));
    capture->operationScope=FixedExecutionScope(profile.execution,0,ExecutionLeaf::Inspect);capture->snapshot=data_->observationSnapshot;
    capture->context=data_->observationContext;capture->transport=data_->observationTransport;capture->actor=data_->observationActor;capture->observationOrdinal=data_->observationOrdinal;
    capture->panelConnection=data_->panelConnection;capture->panelGeneration=data_->panelGeneration;data_->projects.push_back(capture);
    Bytes body(own.frame_.payload.begin(),own.frame_.payload.begin()+40);detail::PutU16(body,static_cast<std::uint16_t>(capture->tool));
    detail::PutU16(body,static_cast<std::uint16_t>(phase::ChildRole::ExecutionPrep));Put(body,capture->command);Put(body,capture->execution);Put(body,capture->lease);Put(body,Id{});
    Put(body,capture->operationScope);Put(body,capture->script);body.resize(204,0);body.push_back(static_cast<unsigned char>(phase::DeliveryClass::ExecutionPrep));
    AssertCapabilityCurrent(cap);own.spent_=true;
    try{auto result=Own(CapKind::Command,Exchange(phase::Verb::BindCommand,body));capture->expiry=Number(result->frame_.payload.data()+32,8);result->project_=capture;result->ingress_=own.ingress_;return result;}
    catch(...){capture->stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}
}
namespace {
std::wstring ManifestWide(const std::string& text){if(text.empty()||text.size()>131040||text.find('\0')!=std::string::npos)Refuse("trusted_manifest_text_path_refused");
    const auto count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),nullptr,0);if(count<=0||count>32760)Refuse("trusted_manifest_utf8_refused");
    std::wstring result(static_cast<std::size_t>(count),L'\0');if(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),result.data(),count)!=count)Refuse("trusted_manifest_utf8_refused");return result;}
std::string ManifestUtf8(const std::wstring& text){if(text.empty()||text.size()>32760||text.find(L'\0')!=std::wstring::npos)Refuse("trusted_manifest_wide_refused");
    const auto count=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),nullptr,0,nullptr,nullptr);if(count<=0)Refuse("trusted_manifest_wide_refused");
    std::string result(static_cast<std::size_t>(count),'\0');if(WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),result.data(),count,nullptr,nullptr)!=count)Refuse("trusted_manifest_wide_refused");return result;}
std::string ManifestQuote(const std::string& text){std::string result="\"";constexpr char digits[]="0123456789abcdef";for(const auto raw:text){const auto c=static_cast<unsigned char>(raw);
    if(c=='"'||c=='\\'){result+='\\';result+=static_cast<char>(c);}else if(c<32){result+="\\u00";result+=digits[c>>4];result+=digits[c&15];}else result+=static_cast<char>(c);}return result+'"';}
Bytes ManifestCanonical(const capture::Json& value){using Kind=capture::Json::Kind;std::string text;
    if(value.kind==Kind::Object){text="{";std::vector<std::size_t> order(value.keys.size());for(std::size_t i=0;i<order.size();++i)order[i]=i;
        std::sort(order.begin(),order.end(),[&](std::size_t a,std::size_t b){return value.keys[a]<value.keys[b];});
        for(std::size_t i=0;i<order.size();++i){if(i)text+=',';text+=ManifestQuote(value.keys[order[i]]);text+=':';const auto bytes=ManifestCanonical(value.children[order[i]]);text.append(bytes.begin(),bytes.end());}text+='}';
    }else if(value.kind==Kind::Array){text="[";for(std::size_t i=0;i<value.children.size();++i){if(i)text+=',';const auto bytes=ManifestCanonical(value.children[i]);text.append(bytes.begin(),bytes.end());}text+=']';}
    else if(value.kind==Kind::String)text=ManifestQuote(value.scalar);else if(value.kind==Kind::Null)text="null";else text=value.scalar;
    if(text.size()>1048576)Refuse("trusted_manifest_canonical_bound");return Bytes(text.begin(),text.end());}
capture::Json ManifestJson(const Bytes& bytes){return capture::ParseOriginalJson(bytes,capture::kOriginalResultBytes,capture::kOriginalResultNodes,capture::kOriginalResultDepth);}
void ManifestLayerCensusJoin(const capture::Json& result,const capture::Json& inventory,bool graph){
    capture::ValidateInventoryCensus(inventory);const auto& census=capture::Array(inventory.Field("allLayerRows"),1000);const auto& layers=capture::Array(result.Field("layers"),1000);
    if(layers.size()!=census.size()||(!graph&&result.Field("numLayers").Unsigned()!=census.size()))Refuse("trusted_manifest_actual_all_layer_census_count_refused");
    for(std::size_t i=0;i<layers.size();++i){const auto& actual=layers[i];const auto& row=census[i];
        if(actual.Field("id").Unsigned()!=row.Field("id").Unsigned()||actual.Field("index").Unsigned()!=row.Field("index").Unsigned()||actual.Field("name").Text()!=row.Field("name").Text())Refuse("trusted_manifest_actual_all_layer_census_identity_refused");
        for(const auto* flag:{"enabled","locked"})if(capture::Boolean(actual.Field(flag))!=capture::Boolean(row.Field(flag)))Refuse("trusted_manifest_actual_all_layer_census_flags_refused");
        if(graph){for(const auto* flag:{"guide","solo"})if(capture::Boolean(actual.Field(flag))!=capture::Boolean(row.Field(flag)))Refuse("trusted_manifest_actual_graph_census_flags_refused");
            if(actual.Field("sourceId").kind!=row.Field("sourceId").kind||(actual.Field("sourceId").kind!=capture::Json::Kind::Null&&actual.Field("sourceId").Unsigned()!=row.Field("sourceId").Unsigned()))Refuse("trusted_manifest_actual_graph_source_join_refused");}
        else{if(capture::Boolean(actual.Field("textLayer"))!=capture::Boolean(row.Field("textLayer"))||actual.Field("inPoint").Real()!=row.Field("inPoint").Real()||actual.Field("outPoint").Real()!=row.Field("outPoint").Real())Refuse("trusted_manifest_actual_text_class_or_range_refused");
            if(capture::Boolean(row.Field("textLayer"))&&actual.Field("text").Field("text").Text()!=row.Field("sourceText").Text())Refuse("trusted_manifest_actual_source_text_join_refused");}
    }
}
using CopyIds=std::map<std::uint64_t,std::uint64_t>;
capture::Json& MutableField(capture::Json& object,const char* key){for(std::size_t i=0;i<object.keys.size();++i)if(object.keys[i]==key)return object.children[i];Refuse("trusted_copy_required_field_missing");}
std::uint64_t CopyInteger(const capture::Json& value){if(value.kind!=capture::Json::Kind::Number)Refuse("trusted_copy_number_kind_required");const auto number=value.Unsigned();if(number>9007199254740991ull)Refuse("trusted_copy_integer_bound");return number;}
void CopySetInteger(capture::Json& value,std::uint64_t number){value.kind=capture::Json::Kind::Number;value.scalar=std::to_string(number);value.keys.clear();value.children.clear();}
void CopySetText(capture::Json& value,const std::string& text){value.kind=capture::Json::Kind::String;value.scalar=text;value.keys.clear();value.children.clear();}
void CopyMerge(CopyIds& ids,std::uint64_t before,std::uint64_t after){if(!before||!after)Refuse("trusted_copy_identity_zero");const auto found=ids.find(before);
    if(found!=ids.end()){if(found->second!=after)Refuse("trusted_copy_identity_mapping_drift");return;}for(const auto& prior:ids)if(prior.second==after)Refuse("trusted_copy_identity_mapping_ambiguous");ids.emplace(before,after);}
std::uint64_t CopyMapped(const CopyIds& ids,std::uint64_t before){const auto found=ids.find(before);if(found==ids.end())Refuse("trusted_copy_identity_mapping_missing");return found->second;}
void CopyInventoryJoin(const capture::Json& before,const capture::Json& after,const std::array<std::uint64_t,2>& selected,std::uint16_t slot,bool target,CopyIds& projects,CopyIds& layers,bool originalRestore=false){
    capture::ValidateInventoryCensus(before);capture::ValidateInventoryCensus(after);
    if(CopyInteger(before.Field("numProjectItems"))!=CopyInteger(after.Field("numProjectItems"))||CopyInteger(before.Field("numLayers"))!=CopyInteger(after.Field("numLayers"))||
        before.Field("compName").Text()!=after.Field("compName").Text()||(!originalRestore&&before.Field("projectFile").Text()==after.Field("projectFile").Text()))Refuse("trusted_copy_complete_inventory_shape_changed");
    auto expected=before;CopySetText(MutableField(expected,"projectFile"),after.Field("projectFile").Text());CopySetInteger(MutableField(expected,"revision"),CopyInteger(after.Field("revision")));
    const auto& bp=capture::Array(before.Field("projectItemRows"),1000);const auto& ap=capture::Array(after.Field("projectItemRows"),1000);
    for(std::size_t i=0;i<bp.size();++i){if(CopyInteger(bp[i].Field("index"))!=i+1||CopyInteger(ap[i].Field("index"))!=i+1||bp[i].Field("name").Text()!=ap[i].Field("name").Text()||capture::Boolean(bp[i].Field("comp"))!=capture::Boolean(ap[i].Field("comp")))Refuse("trusted_copy_project_census_changed");
        CopyMerge(projects,CopyInteger(bp[i].Field("id")),CopyInteger(ap[i].Field("id")));CopySetInteger(MutableField(MutableField(expected,"projectItemRows").children[i],"id"),CopyInteger(ap[i].Field("id")));}
    CopySetInteger(MutableField(expected,"compItemId"),CopyMapped(projects,CopyInteger(before.Field("compItemId"))));
    const auto& bl=capture::Array(before.Field("allLayerRows"),1000);const auto& al=capture::Array(after.Field("allLayerRows"),1000);
    for(std::size_t i=0;i<bl.size();++i){CopyMerge(layers,CopyInteger(bl[i].Field("id")),CopyInteger(al[i].Field("id")));auto& row=MutableField(expected,"allLayerRows").children[i];
        CopySetInteger(MutableField(row,"id"),CopyInteger(al[i].Field("id")));auto& source=MutableField(row,"sourceId");if(source.kind!=capture::Json::Kind::Null)CopySetInteger(source,CopyMapped(projects,CopyInteger(source)));
        if(target&&slot&&(CopyInteger(bl[i].Field("id"))==selected[0]||CopyInteger(bl[i].Field("id"))==selected[1]))MutableField(row,"enabled").scalar=CopyInteger(bl[i].Field("id"))==selected[slot-1]?"true":"false";}
    // Every contributing character keeps its actual face/substitution fact.
    // Font IDs are re-observed after open; changing an ID needs an unambiguous
    // PS-name dictionary. This is not a font-binary attestation.
    CopyIds fonts;const auto& bf=capture::Array(before.Field("usedFonts"),1000);const auto& af=capture::Array(after.Field("usedFonts"),1000);
    if(bf.size()!=af.size())Refuse("trusted_copy_font_dictionary_changed");
    for(const auto& entry:bf){const auto& font=entry.Field("font");const auto oldId=CopyInteger(font.Field("id"));const capture::Json* matching=nullptr;std::size_t nameBefore=0,nameAfter=0;
        for(const auto& row:bf)if(row.Field("font").Field("postScriptName").Text()==font.Field("postScriptName").Text())++nameBefore;
        for(const auto& row:af){const auto& candidate=row.Field("font");if(candidate.Field("postScriptName").Text()==font.Field("postScriptName").Text()){++nameAfter;
            if(CopyInteger(candidate.Field("id"))==oldId||!matching)matching=&candidate;}}
        if(!matching||capture::Boolean(matching->Field("isSubstitute"))!=capture::Boolean(font.Field("isSubstitute"))||
            (CopyInteger(matching->Field("id"))!=oldId&&(nameBefore!=1||nameAfter!=1)))Refuse("trusted_copy_font_face_mapping_ambiguous");CopyMerge(fonts,oldId,CopyInteger(matching->Field("id")));}
    const auto& bt=capture::Array(before.Field("layerRows"),1000);const auto& at=capture::Array(after.Field("layerRows"),1000);if(bt.size()!=at.size())Refuse("trusted_copy_text_census_changed");
    for(std::size_t i=0;i<bt.size();++i){auto& row=MutableField(expected,"layerRows").children[i];const auto oldId=CopyInteger(bt[i].Field("id"));CopySetInteger(MutableField(row,"id"),CopyMapped(layers,oldId));
        if(target&&slot&&(oldId==selected[0]||oldId==selected[1]))MutableField(row,"enabled").scalar=oldId==selected[slot-1]?"true":"false";
        for(auto& font:MutableField(row,"fontAtChar").children)CopySetInteger(font,CopyMapped(fonts,CopyInteger(font)));}
    // usedAt outside this contributing graph is factual census, not a copied
    // layer-ID preservation claim. Validate complete counts/selected usage via
    // FirstTwoObserved below; compare every contributing row's character face.
    MutableField(expected,"usedFonts")=after.Field("usedFonts");
    if(ManifestCanonical(expected)!=ManifestCanonical(after))Refuse("trusted_copy_inventory_content_or_visibility_changed");
}
capture::Json CopyGraphTransform(const capture::Json& original,const CopyIds& projects,const CopyIds& layers,const std::array<std::uint64_t,2>& selected,std::uint16_t slot,const std::string& file,std::uint64_t revision,const std::string& parent=""){
    auto result=original;if(result.kind==capture::Json::Kind::Array){for(auto& child:result.children)child=CopyGraphTransform(child,projects,layers,selected,slot,file,revision,parent);return result;}
    if(result.kind!=capture::Json::Kind::Object)return result;
    const auto* ownId=original.Optional("id");for(std::size_t i=0;i<result.keys.size();++i){const auto& key=result.keys[i];auto& value=result.children[i];
        if(key=="ownedTitleInventories"||key=="ownedObservedTimings")continue;
        if(key=="projectFile"){CopySetText(value,file);continue;}if(key=="revision"){CopySetInteger(value,revision);continue;}
        if(key=="id"){CopySetInteger(value,CopyMapped(parent=="graph"||parent=="source"?projects:layers,CopyInteger(value)));continue;}
        if(key=="rootCompItemId"||key=="variantCompItemId"||key=="compItemId"||key=="ownerCompItemId"||key=="sourceId"){if(value.kind!=capture::Json::Kind::Null)CopySetInteger(value,CopyMapped(projects,CopyInteger(value)));continue;}
        if(key=="trackMatteLayerId"||key=="consumerLayerId"||key=="controlledLayerId"){if(value.kind!=capture::Json::Kind::Null)CopySetInteger(value,CopyMapped(layers,CopyInteger(value)));continue;}
        if(key=="enabled"&&slot&&ownId&&(CopyInteger(*ownId)==selected[0]||CopyInteger(*ownId)==selected[1])){value.scalar=CopyInteger(*ownId)==selected[slot-1]?"true":"false";continue;}
        value=CopyGraphTransform(value,projects,layers,selected,slot,file,revision,key);
    }return result;
}
void CopyGraphJoin(const capture::Json& before,const capture::Json& after,const std::array<std::uint64_t,2>& selected,std::uint16_t slot,const std::string& expectedFile,bool originalRestore=false){
    const auto& bg=capture::Array(before.Field("graph"),100);const auto& ag=capture::Array(after.Field("graph"),100),bi=capture::Array(before.Field("ownedTitleInventories"),100),ai=capture::Array(after.Field("ownedTitleInventories"),100);
    if(bg.empty()||bg.size()!=ag.size()||bi.size()!=bg.size()||ai.size()!=bg.size()||after.Field("projectFile").Text()!=expectedFile||slot>2)Refuse("trusted_copy_full_graph_shape_changed");CopyIds projects,layers;
    for(std::size_t i=0;i<bg.size();++i){ManifestLayerCensusJoin(ag[i],ai[i],true);if(CopyInteger(bg[i].Field("id"))!=CopyInteger(bi[i].Field("compItemId"))||CopyInteger(ag[i].Field("id"))!=CopyInteger(ai[i].Field("compItemId")))Refuse("trusted_copy_graph_inventory_comp_join");
        CopyInventoryJoin(bi[i],ai[i],selected,slot,CopyInteger(bg[i].Field("id"))==CopyInteger(before.Field("variantCompItemId")),projects,layers,originalRestore);}
    auto expected=CopyGraphTransform(before,projects,layers,selected,slot,expectedFile,CopyInteger(after.Field("revision")));
    MutableField(expected,"ownedTitleInventories")=after.Field("ownedTitleInventories");const auto& bt=capture::Array(before.Field("ownedObservedTimings"),100);const auto& at=capture::Array(after.Field("ownedObservedTimings"),100);
    if(bt.size()!=bg.size()||at.size()!=bg.size())Refuse("trusted_copy_graph_timing_count");auto& timing=MutableField(expected,"ownedObservedTimings");
    for(std::size_t i=0;i<bt.size();++i)if(bt[i].kind!=capture::Json::Kind::Null)CopySetInteger(MutableField(timing.children[i],"compItemId"),CopyMapped(projects,CopyInteger(bt[i].Field("compItemId"))));
    auto& controlled=MutableField(expected,"controlled").children;std::sort(controlled.begin(),controlled.end(),[](const auto& a,const auto& b){return CopyInteger(a.Field("id"))<CopyInteger(b.Field("id"));});
    if(expected.Optional("matteDependencies")){auto& mattes=MutableField(expected,"matteDependencies").children;std::sort(mattes.begin(),mattes.end(),[](const auto& a,const auto& b){const auto ac=CopyInteger(a.Field("ownerCompItemId")),bc=CopyInteger(b.Field("ownerCompItemId"));return ac!=bc?ac<bc:CopyInteger(a.Field("consumerLayerId"))<CopyInteger(b.Field("consumerLayerId"));});}
    if(ManifestCanonical(expected)!=ManifestCanonical(after))Refuse("trusted_copy_full_graph_content_changed");
    std::size_t targets=0;for(const auto& inventory:ai)if(CopyInteger(inventory.Field("compItemId"))==CopyInteger(after.Field("variantCompItemId"))){const auto actual=capture::FirstTwoObserved(inventory,0,after.Field("duration").Real());
        if(actual.states[0].id!=CopyMapped(layers,selected[0])||actual.states[1].id!=CopyMapped(layers,selected[1]))Refuse("trusted_copy_first_two_correspondence_changed");++targets;}if(targets!=1)Refuse("trusted_copy_unique_target_required");
}
std::size_t OriginalResultDepth(const capture::Json& value){std::size_t maximum=0;for(const auto& child:value.children)maximum=std::max(maximum,OriginalResultDepth(child));return maximum+1;}
std::size_t StageGraphResultUpperBound(const capture::Json& value){
    // Decimal IDs/revisions may change after open. Bound the complete actual
    // result before D42, including all three intrinsic graph snapshots. This
    // does not enlarge the independent 1MiB original-result parser envelope.
    if(value.kind==capture::Json::Kind::Number)return 32;
    if(value.kind!=capture::Json::Kind::Array&&value.kind!=capture::Json::Kind::Object)return ManifestCanonical(value).size();
    std::size_t bytes=2;for(std::size_t i=0;i<value.children.size();++i){if(i)++bytes;if(value.kind==capture::Json::Kind::Object)bytes+=ManifestQuote(value.keys[i]).size()+1;
        const auto child=StageGraphResultUpperBound(value.children[i]);if(child>1048576||bytes>1048576-child)Refuse("trusted_stage_result_upper_bound");bytes+=child;}return bytes;
}
void ValidateOriginalUiBaseline(const capture::Json& ui,const capture::Json& inventory){
    capture::Fields(ui,{"schema","projectFile","dirty","activeItem","viewerKind","projectSelectionIds","items","comps"});
    if(ui.Field("schema").Text()!="ae-agent.owned-native-ui-baseline.v1"||capture::Boolean(ui.Field("dirty"))||ui.Field("projectFile").Text()!=inventory.Field("projectFile").Text())Refuse("trusted_ui_original_project_join");
    const auto& items=capture::Array(ui.Field("items"),1000);const auto& projectRows=capture::Array(inventory.Field("projectItemRows"),1000);
    if(items.size()!=projectRows.size()||items.size()!=CopyInteger(inventory.Field("numProjectItems")))Refuse("trusted_ui_complete_project_census_required");
    std::map<std::uint64_t,std::string> itemKinds;std::set<std::uint64_t> compIds,layerIds;std::map<std::uint64_t,const capture::Json*> comps;
    for(std::size_t i=0;i<items.size();++i){const auto& item=items[i];capture::Fields(item,{"index","id","name","kind"});const auto id=CopyInteger(item.Field("id"));const auto kind=item.Field("kind").Text();
        if(!id||CopyInteger(item.Field("index"))!=i+1||id!=CopyInteger(projectRows[i].Field("id"))||CopyInteger(projectRows[i].Field("index"))!=i+1||
            item.Field("name").Text()!=projectRows[i].Field("name").Text()||(kind!="comp"&&kind!="footage"&&kind!="folder")||
            (kind=="comp")!=capture::Boolean(projectRows[i].Field("comp"))||!itemKinds.emplace(id,kind).second)Refuse("trusted_ui_project_identity_join");
        if(kind=="comp")compIds.insert(id);}
    const auto& rows=capture::Array(ui.Field("comps"),1000);if(rows.size()!=compIds.size())Refuse("trusted_ui_all_original_comps_required");std::size_t totalLayers=0;
    for(const auto& row:rows){capture::Fields(row,{"index","id","name","time","numLayers","layers","selectedLayerIds"});const auto id=CopyInteger(row.Field("id")),index=CopyInteger(row.Field("index"));
        if(!compIds.count(id)||!index||index>items.size()||CopyInteger(items[index-1].Field("id"))!=id||items[index-1].Field("name").Text()!=row.Field("name").Text()||!comps.emplace(id,&row).second)Refuse("trusted_ui_comp_identity_join");
        (void)capture::ObservedAuthorityBits(row.Field("time"));const auto& layers=capture::Array(row.Field("layers"),1000);
        if(layers.size()!=CopyInteger(row.Field("numLayers"))||totalLayers>1000-layers.size())Refuse("trusted_ui_total_layer_census_bound");totalLayers+=layers.size();std::map<std::uint64_t,bool> selected;
        for(std::size_t i=0;i<layers.size();++i){const auto& layer=layers[i];capture::Fields(layer,{"index","id","name","kind","selected"});const auto layerId=CopyInteger(layer.Field("id"));const auto kind=layer.Field("kind").Text();
            if(!layerId||CopyInteger(layer.Field("index"))!=i+1||!layerIds.insert(layerId).second||(kind!="text"&&kind!="shape"&&kind!="camera"&&kind!="light"&&kind!="av"))Refuse("trusted_ui_layer_identity_join");
            selected.emplace(layerId,capture::Boolean(layer.Field("selected")));}
        std::set<std::uint64_t> observedSelected;for(const auto& selectedId:capture::Array(row.Field("selectedLayerIds"),1000)){const auto layerId=CopyInteger(selectedId);
            if(!layerId||!selected.count(layerId)||!selected.at(layerId)||!observedSelected.insert(layerId).second)Refuse("trusted_ui_selected_layers_join");}
        for(const auto& layer:selected)if(layer.second!=(observedSelected.count(layer.first)!=0))Refuse("trusted_ui_selected_layer_census_incomplete");
    }
    std::set<std::uint64_t> selectedItems;for(const auto& selected:capture::Array(ui.Field("projectSelectionIds"),1000)){const auto id=CopyInteger(selected);if(!id||!itemKinds.count(id)||!selectedItems.insert(id).second)Refuse("trusted_ui_project_selection_join");}
    const auto& active=ui.Field("activeItem");if(active.kind!=capture::Json::Kind::Null){capture::Fields(active,{"kind","id","openInViewerAvailable","viewerSetActiveAvailable"});const auto id=CopyInteger(active.Field("id"));
        if(!id||!itemKinds.count(id)||itemKinds.at(id)!=active.Field("kind").Text())Refuse("trusted_ui_active_item_join");(void)capture::Boolean(active.Field("openInViewerAvailable"));(void)capture::Boolean(active.Field("viewerSetActiveAvailable"));}
    const auto viewer=ui.Field("viewerKind").Text();if(viewer!="none"&&viewer!="composition"&&viewer!="footage"&&viewer!="layer")Refuse("trusted_ui_viewer_kind");
    const auto target=CopyInteger(inventory.Field("compItemId"));if(!comps.count(target))Refuse("trusted_ui_target_comp_census_missing");
    const auto& targetRows=capture::Array(comps.at(target)->Field("layers"),1000);const auto& ordinary=capture::Array(inventory.Field("allLayerRows"),1000);
    if(targetRows.size()!=ordinary.size())Refuse("trusted_ui_target_layer_census_join");for(std::size_t i=0;i<ordinary.size();++i)if(CopyInteger(targetRows[i].Field("id"))!=CopyInteger(ordinary[i].Field("id"))||
        CopyInteger(targetRows[i].Field("index"))!=CopyInteger(ordinary[i].Field("index"))||targetRows[i].Field("name").Text()!=ordinary[i].Field("name").Text()||
        (targetRows[i].Field("kind").Text()=="text")!=capture::Boolean(ordinary[i].Field("textLayer")))Refuse("trusted_ui_target_layer_identity_join");
}
bool OriginalUiRestoreSupported(const capture::Json& ui){const auto& active=ui.Field("activeItem");if(active.kind==capture::Json::Kind::Null)return false;
    if(!capture::Boolean(active.Field("openInViewerAvailable"))||!capture::Boolean(active.Field("viewerSetActiveAvailable")))return false;
    const auto kind=active.Field("kind").Text(),viewer=ui.Field("viewerKind").Text();return (kind=="comp"&&viewer=="composition")||(kind=="footage"&&viewer=="footage");}
}
std::shared_ptr<Capability> NativeClient::CaptureSelectionFixed(const std::shared_ptr<Capability>& projectRead,const std::shared_ptr<Capability>& compRead,const std::shared_ptr<Capability>& rootRead){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();const auto& policy=EmbeddedProfile().execution;
    if(policy.selectionMode!=TitleSelectionMode::FirstTwoObservedTextStatesV1||data_->titleManifest)Refuse("trusted_first_two_selection_once_required");
    const auto completed=[&](const std::shared_ptr<Capability>& cap,phase::ToolCode tool)->ProjectCapture&{auto& own=Require(cap,CapKind::Terminal);AssertCapabilityCurrent(cap);
        if(!own.project_||own.project_->tool!=tool||own.project_->stage!=ProjectCapture::Stage::Terminal||own.project_->originalResult.empty()||!own.project_->terminalMono||
            own.project_->actor!=data_->observationActor||GetTickCount64()<own.project_->terminalMono||GetTickCount64()-own.project_->terminalMono>30000||
            std::find(data_->projects.begin(),data_->projects.end(),own.project_)==data_->projects.end())Refuse("trusted_manifest_original_completed_read_required");return *own.project_;};
    auto& project=completed(projectRead,phase::ToolCode::GetProjectInfo);auto& comp=completed(compRead,phase::ToolCode::GetCompDetails);auto& root=completed(rootRead,phase::ToolCode::GetCompDetails);
    if(comp.terminalMono<project.terminalMono||root.terminalMono<project.terminalMono)Refuse("trusted_manifest_project_read_order_refused");
    const auto source=ManifestJson(project.originalResult),target=ManifestJson(comp.originalResult),rootResult=ManifestJson(root.originalResult);
    const auto& support=source.Field("supported");if(!capture::Boolean(support.Field("revision")))Refuse("trusted_manifest_native_revision_required");
    const auto& variant=policy.variants[0];const bool observedRange=policy.rangeMode==TitleRangeMode::FullObservedRootRangeV1;
    observed_timing::ResolvedObservedRootTimingV1 resolved;
    if(observedRange){resolved=capture::ObservedTimingCompJoin(rootResult.Field("ownedObservedTiming"),rootResult,false);
        const auto targetTiming=capture::ObservedTimingCompJoin(target.Field("ownedObservedTiming"),target,false);
        if(rootResult.Field("itemId").Unsigned()!=target.Field("itemId").Unsigned()||!capture::ObservedTimingSame(resolved,targetTiming))Refuse("trusted_observed_same_root_target_timing_required");}
    const double start=observedRange?0:static_cast<double>(variant.frameStart)*variant.frameRateDenominator/variant.frameRateNumerator;
    const double end=observedRange?capture::ObservedDouble(resolved.observed.durationBits):static_cast<double>(variant.frameEnd)*variant.frameRateDenominator/variant.frameRateNumerator;
    const auto selected=capture::FirstTwoObserved(target.Field("ownedTitleInventory"),start,end);
    const double rate=observedRange?capture::ObservedDouble(resolved.observed.frameRateBits):static_cast<double>(variant.frameRateNumerator)/variant.frameRateDenominator;
    if((!observedRange&&(std::abs(rootResult.Field("frameRate").Real()-rate)>0.000001||std::abs(target.Field("frameRate").Real()-rate)>0.000001||end>rootResult.Field("duration").Real()+0.0000001))||
        rootResult.Field("width").Unsigned()>8192||rootResult.Field("height").Unsigned()>8192||rootResult.Field("width").Unsigned()*rootResult.Field("height").Unsigned()>media_pixels::kMaximumRgbaBytes/4||
        !rootResult.Field("width").Unsigned()||!rootResult.Field("height").Unsigned())Refuse("trusted_manifest_actual_framing_refused");
    if(source.Field("file").Text()!=selected.projectFile||source.Field("revision").Unsigned()!=selected.revision||
        ManifestWide(selected.projectFile)!=policy.sourceProjectLocator||ManifestWide(selected.compName)!=variant.compName||selected.comp!=target.Field("itemId").Unsigned()||
        ManifestWide(target.Field("name").Text())!=variant.compName||ManifestWide(rootResult.Field("name").Text())!=variant.rootName||
        capture::Boolean(target.Field("layersTruncated"))||target.Field("layersReturned").Unsigned()!=target.Field("numLayers").Unsigned()||
        capture::Array(target.Field("layers"),1000).size()!=target.Field("numLayers").Unsigned())Refuse("trusted_manifest_exact_project_target_or_inventory_refused");
    const auto& rootInventory=rootResult.Field("ownedTitleInventory");if(rootInventory.Field("projectFile").Text()!=selected.projectFile||rootInventory.Field("revision").Unsigned()!=selected.revision||capture::Boolean(rootInventory.Field("dirty"))||
        rootInventory.Field("compItemId").Unsigned()!=rootResult.Field("itemId").Unsigned()||!rootResult.Field("itemId").Unsigned())Refuse("trusted_manifest_root_read_join_refused");
    const auto& targetInventory=target.Field("ownedTitleInventory");
    ValidateOriginalUiBaseline(target.Field("ownedUiBaseline"),targetInventory);ValidateOriginalUiBaseline(rootResult.Field("ownedUiBaseline"),rootInventory);
    if(ManifestCanonical(target.Field("ownedUiBaseline"))!=ManifestCanonical(rootResult.Field("ownedUiBaseline")))Refuse("trusted_manifest_original_ui_changed_between_reads");
    if(observedRange&&detail::Hash(ManifestCanonical(targetInventory))!=detail::Hash(ManifestCanonical(rootInventory)))Refuse("trusted_observed_same_comp_inventory_drift");
    if(targetInventory.Field("numProjectItems").Unsigned()!=source.Field("numItems").Unsigned()||rootInventory.Field("numProjectItems").Unsigned()!=source.Field("numItems").Unsigned())Refuse("trusted_manifest_project_item_census_count_refused");
    ManifestLayerCensusJoin(target,targetInventory,false);ManifestLayerCensusJoin(rootResult,rootInventory,false);capture::RequireUniqueCompName(rootInventory);
    // The approved display locator is a selector. Physical identity/hash remain
    // the authority: read this exact observed file and join it to the held pin.
    Held observed(CreateFileW(policy.sourceProjectLocator.c_str(),GENERIC_READ|FILE_READ_ATTRIBUTES,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!observed.Valid()||!detail::SamePin(detail::ReadPin(observed.Get(),false),policy.sourceProject.pin)||detail::Hash(detail::ReadExact(observed.Get(),134217728))!=policy.sourceProject.sha256)Refuse("trusted_manifest_original_project_file_join_refused");
    auto manifest=std::shared_ptr<NativeTitleManifest>(new NativeTitleManifest(this));manifest->state_.project=policy.sourceProject.pin;manifest->state_.projectHash=policy.sourceProject.sha256;
    manifest->nativeRevision_=selected.revision;manifest->state_.revision=detail::Hash(Bytes(source.Field("revision").scalar.begin(),source.Field("revision").scalar.end()));manifest->state_.owner=data_->observationActorHash;
    manifest->state_.rootId=rootResult.Field("itemId").Unsigned();manifest->state_.compId=selected.comp;manifest->state_.savedClean=true;
    manifest->state_.width=static_cast<std::uint32_t>(rootResult.Field("width").Unsigned());manifest->state_.height=static_cast<std::uint32_t>(rootResult.Field("height").Unsigned());
    manifest->state_.rangeMode=policy.rangeMode;manifest->state_.sampleMode=policy.sampleMode;manifest->state_.observedTiming=resolved;
    manifest->state_.frameStart=observedRange?0:variant.frameStart;manifest->state_.frameCount=observedRange?resolved.frameCount:variant.frameEnd-variant.frameStart;
    manifest->state_.rateNumerator=observedRange?resolved.rateNumerator:variant.frameRateNumerator;manifest->state_.rateDenominator=observedRange?resolved.rateDenominator:variant.frameRateDenominator;
    manifest->capturedAt_=GetTickCount64();manifest->projectRead_=projectRead;manifest->compRead_=compRead;manifest->rootRead_=rootRead;manifest->sourceInventoryHash_=detail::Hash(ManifestCanonical(target.Field("ownedTitleInventory")));
    manifest->originalUiBaseline_=ManifestCanonical(target.Field("ownedUiBaseline"));
    for(std::size_t i=0;i<2;++i){const auto& state=selected.states[i];manifest->selectedIds_[i]=state.id;manifest->selectedTexts_[i]=state.text;
        manifest->state_.controlled.push_back({state.id,ManifestWide(state.name),detail::Hash(Bytes(state.text.begin(),state.text.end())),state.enabled});}
    Bytes joined;Put(joined,manifest->state_.projectHash);Put(joined,manifest->state_.revision);Put(joined,manifest->state_.owner);Put(joined,manifest->sourceInventoryHash_);
    Put(joined,detail::Hash(root.originalResult));Put(joined,policy.policyHash);detail::PutU64(joined,manifest->state_.rootId);detail::PutU64(joined,manifest->state_.compId);
    for(const auto id:manifest->selectedIds_)detail::PutU64(joined,id);manifest->selectionCommit_=DomainHash("lcp2.native.first-two-selection.v1",joined);
    AssertLoadedNodeCurrent();if(!detail::SamePin(detail::ReadPin(observed.Get(),false),policy.sourceProject.pin)||detail::Hash(detail::ReadExact(observed.Get(),134217728))!=policy.sourceProject.sha256)Refuse("trusted_manifest_source_changed_during_capture");
    auto cap=Own(CapKind::Manifest,compRead->frame_);cap->manifest_=manifest;data_->titleManifest=manifest;data_->titleSelection=cap;return cap;
}
Bytes NativeClient::DescribeSelectionFixed(const std::shared_ptr<Capability>& selection){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& own=Require(selection,CapKind::Manifest);
    if(!own.manifest_||own.manifest_->owner_!=this||own.manifest_!=data_->titleManifest||own.manifest_->stage_!=NativeTitleManifest::Stage::SelectionCaptured)Refuse("trusted_own_selection_required");
    const auto& m=*own.manifest_;const auto& policy=EmbeddedProfile().execution;std::array<std::uint64_t,2> ids=m.selectedIds_;std::sort(ids.begin(),ids.end());
    std::string body="{\"controlledLayerIds\":["+std::to_string(ids[0])+","+std::to_string(ids[1])+"],\"expectedProjectFile\":"+ManifestQuote(ManifestUtf8(policy.sourceProjectLocator))+
        ",\"rootCompItemId\":"+std::to_string(m.state_.rootId)+",\"variantCompItemId\":"+std::to_string(m.state_.compId)+",\"variants\":[";
    for(std::size_t i=0;i<2;++i){if(i)body+=',';body+="{\"activeLayerIds\":["+std::to_string(m.selectedIds_[i])+"],\"outputFileName\":"+ManifestQuote(ManifestUtf8(policy.variants[i].outputName))+
        ",\"variantId\":"+ManifestQuote(ManifestUtf8(policy.variants[i].variantId))+"}";}body+="]}";return Bytes(body.begin(),body.end());
}
std::shared_ptr<Capability> NativeClient::CaptureManifestFixed(const std::shared_ptr<Capability>& selection,const std::shared_ptr<Capability>& graphRead){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& own=Require(selection,CapKind::Manifest);auto& graphCap=Require(graphRead,CapKind::Terminal);const auto& policy=EmbeddedProfile().execution;
    if(!own.manifest_||own.manifest_->owner_!=this||own.manifest_!=data_->titleManifest||own.manifest_->stage_!=NativeTitleManifest::Stage::SelectionCaptured||
        !graphCap.project_||graphCap.project_->tool!=phase::ToolCode::InspectTitleVariants||graphCap.project_->stage!=ProjectCapture::Stage::Terminal||graphCap.project_->actor!=data_->observationActor||
        graphCap.project_->terminalMono<own.manifest_->capturedAt_||GetTickCount64()<graphCap.project_->terminalMono||GetTickCount64()-graphCap.project_->terminalMono>30000||
        std::find(data_->projects.begin(),data_->projects.end(),graphCap.project_)==data_->projects.end())Refuse("trusted_manifest_original_graph_read_required");
    auto& m=*own.manifest_;const auto graph=ManifestJson(graphCap.project_->originalResult);
    if(graph.Field("projectFile").Text()!=ManifestUtf8(policy.sourceProjectLocator)||graph.Field("revision").Unsigned()!=m.nativeRevision_||graph.Field("rootCompItemId").Unsigned()!=m.state_.rootId||
        graph.Field("variantCompItemId").Unsigned()!=m.state_.compId)Refuse("trusted_manifest_source_graph_join_refused");
    const auto& variants=policy.variants;const bool observedRange=policy.rangeMode==TitleRangeMode::FullObservedRootRangeV1;
    const double start=observedRange?0:static_cast<double>(variants[0].frameStart)*variants[0].frameRateDenominator/variants[0].frameRateNumerator;
    const double end=observedRange?capture::ObservedDouble(m.state_.observedTiming.observed.durationBits):static_cast<double>(variants[0].frameEnd)*variants[0].frameRateDenominator/variants[0].frameRateNumerator;
    const auto& inventories=capture::Array(graph.Field("ownedTitleInventories"),100);const auto& nodes=capture::Array(graph.Field("graph"),100);if(nodes.empty()||inventories.size()!=nodes.size())Refuse("trusted_manifest_complete_graph_inventory_required");
    const std::vector<capture::Json>* timings=nullptr;if(observedRange){timings=&capture::Array(graph.Field("ownedObservedTimings"),100);
        if(timings->size()!=nodes.size()||m.state_.rootId!=m.state_.compId||capture::ObservedNumberBits(graph.Field("duration"))!=m.state_.observedTiming.observed.durationBits||
            capture::ObservedNumberBits(graph.Field("frameDuration"))!=m.state_.observedTiming.observed.frameDurationBits)Refuse("trusted_observed_graph_root_timing_join_refused");}
    const capture::Json* target=nullptr;std::size_t total=0,targetCount=0,rootCount=0;
    for(std::size_t i=0;i<nodes.size();++i){const auto& node=nodes[i];const auto& inventory=inventories[i];const auto id=node.Field("id").Unsigned();const auto& layers=capture::Array(node.Field("layers"),1000);
        ManifestLayerCensusJoin(node,inventory,true);
        if(timings){if(id==m.state_.rootId){const auto actualTiming=capture::ObservedTimingCompJoin((*timings)[i],node,true);
                if(!capture::ObservedTimingSame(actualTiming,m.state_.observedTiming))Refuse("trusted_observed_graph_timing_drift");}
            else if((*timings)[i].kind!=capture::Json::Kind::Null)Refuse("trusted_observed_graph_foreign_root_timing");}
        total+=layers.size();if(total>1000||id!=inventory.Field("compItemId").Unsigned()||layers.size()!=inventory.Field("numLayers").Unsigned()||inventory.Field("projectFile").Text()!=graph.Field("projectFile").Text()||
            inventory.Field("revision").Unsigned()!=m.nativeRevision_||capture::Boolean(inventory.Field("dirty")))Refuse("trusted_manifest_graph_inventory_drift_refused");
        if(id==m.state_.rootId)++rootCount;if(id==m.state_.compId){++targetCount;target=&inventory;}
    }
    if(!target||targetCount!=1||rootCount!=1||detail::Hash(ManifestCanonical(*target))!=m.sourceInventoryHash_)Refuse("trusted_manifest_unique_root_target_or_baseline_drift");const auto actual=capture::FirstTwoObserved(*target,start,end);
    for(std::size_t i=0;i<2;++i)if(actual.states[i].id!=m.selectedIds_[i]||actual.states[i].text!=m.selectedTexts_[i]||actual.states[i].enabled!=m.state_.controlled[i].enabled)Refuse("trusted_manifest_selection_readback_drift");
    const auto& controlled=capture::Array(graph.Field("controlled"),2);if(controlled.size()!=2)Refuse("trusted_manifest_controlled_pair_required");std::set<std::uint64_t> matched;
    for(const auto& layer:controlled){const auto id=layer.Field("id").Unsigned();std::size_t index=2;for(std::size_t i=0;i<2;++i)if(m.selectedIds_[i]==id)index=i;
        if(index==2||!matched.insert(id).second||layer.Field("text").Text()!=m.selectedTexts_[index]||capture::Boolean(layer.Field("enabled"))!=m.state_.controlled[index].enabled)Refuse("trusted_manifest_controlled_result_join_refused");}
    m.state_.graphHash=detail::Hash(graphCap.project_->originalResult);m.graphReceipt_=Fixed<32>(graphRead->frame_.payload.data()+17);m.graphRead_=graphRead;
    AssertLoadedNodeCurrent();m.stage_=NativeTitleManifest::Stage::Complete;own.frame_=graphRead->frame_;return selection;
}
namespace {
std::pair<std::uint16_t,ExecutionLeaf> ExecutionSelector(const capture::Json& request,phase::ToolCode tool){
    if(tool==phase::ToolCode::BuildSolutionPlan)return {std::uint16_t{0},ExecutionLeaf::Inspect};
    if(tool==phase::ToolCode::InspectAmeTitleSources||tool==phase::ToolCode::InspectAmeTitleQueueManifest){const auto& args=request.Field("args");capture::Fields(args,{"variantSlot"});const auto slot=CopyInteger(args.Field("variantSlot"));if(slot<1||slot>2)Refuse("trusted_ame_inspection_exact_slot_required");return {static_cast<std::uint16_t>(slot),ExecutionLeaf::Inspect};}
    const auto& args=request.Field("args");const auto slot=args.Field("variantSlot").Unsigned();const auto& operation=args.Field("ownedTitleOperation").Text();
    ExecutionLeaf leaf{};if(operation=="checkpoint")leaf=ExecutionLeaf::OwnedCheckpoint;else if(operation=="clean_copy")leaf=ExecutionLeaf::CleanCopy;
    else if(operation=="stage")leaf=ExecutionLeaf::StageVariant;else if(operation=="enqueue")leaf=ExecutionLeaf::EnqueueAme;
    else if(operation=="start")leaf=ExecutionLeaf::StartAme;else if(operation=="restore")leaf=ExecutionLeaf::RestoreBaseline;else Refuse("trusted_execution_closed_operation_required");
    if(slot>2||(leaf==ExecutionLeaf::OwnedCheckpoint?slot!=0:slot==0))Refuse("trusted_execution_operation_slot_refused");return {static_cast<std::uint16_t>(slot),leaf};
}
Digest ExecutionProofDigest(const capture::Json& value){const auto& text=value.Text();if(text.size()!=64)Refuse("trusted_execution_proof_digest_required");Digest digest{};
    const auto nibble=[](char c)->unsigned{if(c>='0'&&c<='9')return static_cast<unsigned>(c-'0');if(c>='a'&&c<='f')return static_cast<unsigned>(c-'a'+10);Refuse("trusted_execution_proof_digest_required");};
    for(std::size_t i=0;i<32;++i)digest[i]=static_cast<unsigned char>((nibble(text[i*2])<<4)|nibble(text[i*2+1]));if(detail::Zero(digest))Refuse("trusted_execution_zero_proof_refused");return digest;
}
std::string ExecutionHex(const Digest& value){constexpr char digits[]="0123456789abcdef";std::string text;for(auto byte:value){text+=digits[byte>>4];text+=digits[byte&15];}return text;}
void ExecutionSourceProof(const capture::Json& proof,const Bytes& descriptor,const char* schema){capture::Fields(proof,{"schema","descriptorSha25664","projectSha25664","leavesSha25664","observationSha25664","result"});
    if(proof.Field("schema").Text()!=schema||ExecutionProofDigest(proof.Field("descriptorSha25664"))!=detail::Hash(descriptor))Refuse("trusted_execution_retained_getter_join_refused");
    const auto own=ManifestJson(descriptor);const auto project=std::string("{\"currentRead\":")+ManifestQuote(own.Field("currentReadSha25664").Text())+",\"file\":"+ManifestQuote(own.Field("projectFile").Text())+
        ",\"manifest\":"+ManifestQuote(own.Field("manifestSha25664").Text())+",\"revision\":"+std::to_string(own.Field("projectRevision").Unsigned())+"}";
    if(ExecutionProofDigest(proof.Field("projectSha25664"))!=detail::Hash(Bytes(project.begin(),project.end())))Refuse("trusted_execution_own_project_proof_mismatch");
    (void)ExecutionProofDigest(proof.Field("leavesSha25664"));(void)ExecutionProofDigest(proof.Field("observationSha25664"));
    if(proof.Field("result").kind!=capture::Json::Kind::Object)Refuse("trusted_execution_original_result_required");}
}
Bytes NativeClient::PreparationQuiescenceDescriptorFixed(const std::shared_ptr<Capability>& challenge){
    RequireRole(Role::Daemon);auto& own=Require(challenge,CapKind::Challenge);AssertLoadedNodeCurrent();const auto event=ObservationChallengeDescriptor(challenge);
    const auto purpose=Number(event.payload.data()+16,2);if(purpose!=static_cast<std::uint16_t>(phase::ChallengePurpose::Readiness)&&purpose!=static_cast<std::uint16_t>(phase::ChallengePurpose::SameActor))return Bytes{'{','}'};
    const auto target=Fixed<16>(event.payload.data()+18);std::shared_ptr<Capability> handler;
    for(const auto& weak:data_->executionHandlers){auto candidate=weak.lock();if(candidate&&!candidate->spent_&&Fixed<16>(candidate->frame_.payload.data())==target){if(handler)Refuse("trusted_preparation_quiescence_handler_ambiguous");handler=std::move(candidate);}}
    if(!handler||handler->frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::ExecutionPrep)||Number(handler->frame_.payload.data()+72,2)!=static_cast<std::uint16_t>(phase::ToolCode::RunAiAgentPlan)){
        std::shared_ptr<Capability> pending;for(const auto& weak:data_->proposalTerminals){auto cap=weak.lock();if(cap&&!cap->spent_&&cap->execution_&&cap->execution_->owner_==this&&cap->execution_->stage==ExecutionCapture::Stage::Prepared){if(pending)Refuse("trusted_quiescence_pending_proposal_ambiguous");pending=std::move(cap);}}
        std::shared_ptr<ExecutionCapture> original;bool completed=false;
        if(pending)original=pending->execution_;else if(data_->lastCompletedGate){const auto gate=data_->lastCompletedGate->execution_;if(!gate||gate->owner_!=this||gate->stage!=ExecutionCapture::Stage::Authorized||!gate->proposalTerminal||!gate->proposalTerminal->execution_||
                data_->lastCompletedTerminal.header.verb!=phase::Verb::Complete||data_->lastCompletedTerminal.header.status!=phase::Status::Ok||data_->lastCompletedTerminal.payload[0]!=1||detail::Zero(Fixed<32>(data_->lastCompletedTerminal.payload.data()+17)))Refuse("trusted_quiescence_original_completed_terminal_required");
            original=gate->proposalTerminal->execution_;if(gate->proposal!=original->result||gate->actor!=data_->observationActor||gate->originalManifest!=original->originalManifest)Refuse("trusted_quiescence_completed_gate_proposal_join");completed=true;}
        if(!original)return Bytes{'{','}'};if(original->owner_!=this||original->tool!=phase::ToolCode::ProposeAiAgentPlan||original->stage!=ExecutionCapture::Stage::Prepared||original->actor!=data_->observationActor||!original->originalManifest||original->originalManifest->manifest_!=data_->titleManifest||original->originalPanelConnection!=data_->panelConnection||original->originalPanelGeneration!=data_->panelGeneration||original->originalPanelInstance!=data_->panelInstance||original->originalPanelEpoch!=data_->panelEpoch)Refuse("trusted_quiescence_original_actor_source_changed");
        const auto proof=ManifestJson(original->originalProof);const auto pins=ManifestCanonical(proof.Field("result").Field("currentPlanPins"));const auto text="{\"pins\":"+std::string(pins.begin(),pins.end())+",\"mode\":"+ManifestQuote(completed?"completed_original_d20":"pending_original_proposal")+"}";return Bytes(text.begin(),text.end());
    }
    AssertCapabilityCurrent(handler);const auto bytes=OriginalRequestBody(handler->ingress_);if(Fixed<32>(handler->frame_.payload.data()+77)!=detail::Hash(bytes))Refuse("trusted_preparation_quiescence_original_body_drift");
    const auto request=ManifestJson(bytes);const auto& args=request.Field("args");capture::Fields(args,{"actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion","ownedTitleOperation","variantSlot","dryRun"});
    if(!capture::Boolean(args.Field("dryRun")))Refuse("trusted_preparation_quiescence_dry_run_required");const auto selected=ExecutionSelector(request,phase::ToolCode::RunAiAgentPlan);
    const auto scope=FixedExecutionScope(EmbeddedProfile().execution,selected.first,selected.second);std::shared_ptr<ExecutionCapture> proposal;
    for(const auto& row:data_->executionCaptures)if(row->stage==ExecutionCapture::Stage::Prepared&&row->tool==phase::ToolCode::ProposeAiAgentPlan&&row->scope==scope){if(proposal)Refuse("trusted_preparation_quiescence_proposal_ambiguous");proposal=row;}
    if(!proposal||proposal->owner_!=this||proposal->actor!=data_->observationActor||!proposal->originalManifest||!proposal->currentRead||
        proposal->slot!=selected.first||proposal->leaf!=selected.second||proposal->originalManifest->manifest_!=data_->titleManifest)Refuse("trusted_preparation_quiescence_own_proposal_required");
    const auto proof=ManifestJson(proposal->originalProof);const auto& result=proof.Field("result");const auto& pins=result.Field("currentPlanPins");
    capture::Fields(pins,{"instanceId","revision","actionId","requestId","actionKind","payloadRef","payloadHash","previewHash","projectFile","expiresAt","riskLevel","riskPolicyVersion","surface","sessionId"});
    const auto expectedFile=proposal->slot&&(proposal->leaf==ExecutionLeaf::EnqueueAme||proposal->leaf==ExecutionLeaf::StartAme||proposal->leaf==ExecutionLeaf::RestoreBaseline)?ManifestJson(data_->savedSnapshots[proposal->slot-1]->actualPostSave).Field("projectFile").Text():ManifestUtf8(EmbeddedProfile().execution.sourceProjectLocator);
    if(pins.Field("projectFile").Text()!=expectedFile||pins.Field("revision").Unsigned()==0||pins.Field("surface").Text()!="cep-panel"||pins.Field("actionKind").Text()!="ae_tool")Refuse("trusted_preparation_quiescence_original_pins_required");
    for(const auto* key:{"actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion"})if(args.Field(key).Text()!=pins.Field(key).Text()||result.Field(key).Text()!=pins.Field(key).Text())Refuse("trusted_preparation_quiescence_current_m100_mismatch");
    const auto actual=ManifestCanonical(pins);std::string text="{\"pins\":"+std::string(actual.begin(),actual.end())+"}";AssertCapabilityCurrent(handler);(void)own;
    return Bytes(text.begin(),text.end());
}
NativeTitleManifest& NativeClient::RequireExecutionBaseline(const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& own=Require(manifest,CapKind::Manifest);auto& read=Require(currentRead,CapKind::Terminal);AssertCapabilityCurrent(manifest);AssertCapabilityCurrent(currentRead);
    const auto now=GetTickCount64();if(!own.manifest_||own.manifest_->owner_!=this||own.manifest_!=data_->titleManifest||own.manifest_->stage_!=NativeTitleManifest::Stage::Complete||
        !read.project_||(read.project_->tool!=phase::ToolCode::GetCompDetails&&read.project_->tool!=phase::ToolCode::GetProjectInfo&&!read.project_->preparationDelivery)||read.project_->stage!=ProjectCapture::Stage::Terminal||read.project_->actor!=data_->observationActor||
        !read.project_->terminalMono||now<read.project_->terminalMono||now-read.project_->terminalMono>10000||
        std::find(data_->projects.begin(),data_->projects.end(),read.project_)==data_->projects.end())Refuse("trusted_execution_own_current_baseline_required");
    if(read.project_->originalBaselineCurrent&&read.project_->tool==phase::ToolCode::GetProjectInfo){const auto& m=*own.manifest_;if(!m.compRead_||!m.compRead_->project_)Refuse("trusted_c6_original_comp_receipt_required");
        const auto actual=ManifestJson(read.project_->originalResult);if(!capture::OriginalReadCurrentIdentityMatches(actual.Field("ownedReadCurrent").Field("state"),m.state_.compId,m.state_.rootId,m.selectedIds_,ManifestJson(m.compRead_->project_->originalResult).Field("dynamicLinkGUID").Text()))Refuse("trusted_c6_original_current_identity_drift");return *own.manifest_;}
    if(read.project_->restoredCurrentSlot){const auto slot=read.project_->restoredCurrentSlot;if(slot>2||!data_->restorationReceipts[slot-1]||data_->restoredSourceReadbacks[slot-1].empty())Refuse("trusted_private_restored_source_receipt_required");AssertCapabilityCurrent(data_->restorationReceipts[slot-1]);
        const auto actual=ManifestJson(read.project_->originalResult);const auto& state=read.project_->tool==phase::ToolCode::GetProjectInfo?actual.Field("ownedReadCurrent").Field("state"):actual.Field("ownedCurrentStageState");
        if(ManifestCanonical(state)!=data_->restoredSourceReadbacks[slot-1]||state.Field("projectFile").Text()!=ManifestUtf8(EmbeddedProfile().execution.sourceProjectLocator))Refuse("trusted_private_restored_source_current_drift");return *own.manifest_;}
    const auto actual=ManifestJson(read.project_->originalResult);const auto& inventory=actual.Field("ownedTitleInventory");ManifestLayerCensusJoin(actual,inventory,false);
    ValidateOriginalUiBaseline(actual.Field("ownedUiBaseline"),inventory);
    if(own.manifest_->originalUiBaseline_.empty()||ManifestCanonical(actual.Field("ownedUiBaseline"))!=own.manifest_->originalUiBaseline_)Refuse("trusted_execution_original_ui_baseline_drift");
    if(own.manifest_->state_.rangeMode==TitleRangeMode::FullObservedRootRangeV1&&!capture::ObservedTimingSame(capture::ObservedTimingCompJoin(actual.Field("ownedObservedTiming"),actual,false),own.manifest_->state_.observedTiming))Refuse("trusted_execution_observed_timing_baseline_drift");
    if(inventory.Field("projectFile").Text()!=ManifestUtf8(EmbeddedProfile().execution.sourceProjectLocator)||inventory.Field("revision").Unsigned()!=own.manifest_->nativeRevision_||
        inventory.Field("compItemId").Unsigned()!=own.manifest_->state_.compId||detail::Hash(ManifestCanonical(inventory))!=own.manifest_->sourceInventoryHash_)
        Refuse("trusted_execution_actual_baseline_drift_refused");return *own.manifest_;
}
void NativeClient::CaptureProjectReadCurrentFixed(const std::shared_ptr<ProjectCapture>& original,const Bytes& actualResult){
    AssertLoadedNodeCurrent();if(!original||original->inspection||original->stage!=ProjectCapture::Stage::Submitted||original->actor!=data_->observationActor)Refuse("trusted_original_c6_project_row_required",0,true);
    std::uint16_t eligible=0;for(std::size_t i=0;i<data_->restorationDebts.size();++i){const auto& debt=data_->restorationDebts[i];if(!debt||debt->state==Data::RestorationDebt::State::Restored)continue;
        if(eligible||debt->state!=Data::RestorationDebt::State::StageTerminal||!debt->effectSelected||debt->actor!=data_->observationActor||!data_->savedSnapshots[i]||data_->savedSnapshots[i]->unknown||!data_->preissuedRestorationPrograms[i]||!data_->preissuedRestorationPrograms[i]->restorationProgram_||data_->preissuedRestorationPrograms[i]->restorationProgram_->unknown||data_->preissuedRestorationPrograms[i]->restorationProgram_->bound)Refuse("trusted_c6_restoration_debt_unsupported",0,true);eligible=static_cast<std::uint16_t>(i+1);}
    const auto result=ManifestJson(actualResult);const auto* envelope=result.Optional("ownedReadCurrent");if(!eligible){std::uint16_t restored=0;for(std::size_t i=0;i<data_->restorationReceipts.size();++i)if(data_->restorationReceipts[i])restored=static_cast<std::uint16_t>(i+1);
        if(restored){if(!envelope||!original->originalHandler||original->originalHandler->frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::BootstrapRead))Refuse("trusted_c6_restored_original_fresh_bracket_required",0,true);capture::Fields(*envelope,{"schema","state"});const auto& state=envelope->Field("state");
            if(envelope->Field("schema").Text()!="ae-agent.owned-read-current.v1"||data_->restoredSourceReadbacks[restored-1].empty()||ManifestCanonical(state)!=data_->restoredSourceReadbacks[restored-1]||result.Field("file").Text()!=ManifestUtf8(EmbeddedProfile().execution.sourceProjectLocator)||CopyInteger(result.Field("revision"))!=CopyInteger(state.Field("revision")))Refuse("trusted_c6_restored_original_readback_drift",0,true);
            AssertCapabilityCurrent(data_->restorationReceipts[restored-1]);original->restoredCurrentSlot=restored;
        }else if(envelope){capture::Fields(*envelope,{"schema","state"});if(envelope->Field("schema").Text()!="ae-agent.owned-read-current.v1")Refuse("trusted_c6_current_envelope_schema",0,true);
            if(data_->titleManifest&&data_->titleManifest->stage_==NativeTitleManifest::Stage::Complete){const auto& manifest=*data_->titleManifest;const auto& state=envelope->Field("state");if(!manifest.graphRead_||!manifest.graphRead_->project_||!manifest.compRead_||!manifest.compRead_->project_||
                !capture::OriginalReadCurrentIdentityMatches(state,manifest.state_.compId,manifest.state_.rootId,manifest.selectedIds_,ManifestJson(manifest.compRead_->project_->originalResult).Field("dynamicLinkGUID").Text())||
                ManifestCanonical(state.Field("graph"))!=ManifestCanonical(ManifestJson(manifest.graphRead_->project_->originalResult))||ManifestCanonical(state.Field("uiBaseline"))!=manifest.originalUiBaseline_||state.Field("projectFile").Text()!=ManifestUtf8(EmbeddedProfile().execution.sourceProjectLocator)||CopyInteger(state.Field("revision"))!=manifest.nativeRevision_)Refuse("trusted_c6_original_current_manifest_drift",0,true);original->originalBaselineCurrent=true;}
        }return;}
    if(!original->originalHandler||original->originalHandler->frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::BootstrapRead))Refuse("trusted_c6_restore_original_bracket_required",0,true);
    if(!envelope)Refuse("trusted_c6_restore_current_envelope_required",0,true);capture::Fields(*envelope,{"schema","state"});if(envelope->Field("schema").Text()!="ae-agent.owned-read-current.v1")Refuse("trusted_c6_restore_current_schema",0,true);
    for(const auto& job:data_->originalJobs)if(job&&(job->unknown_||job->stage_!=AmeOriginalJob::Stage::MediaAccepted))Refuse("trusted_c6_restore_current_job_not_quiescent",0,true);
    const auto& state=envelope->Field("state");capture::Fields(state,{"graph","sourceGuid","selectedTextLayerIds","compItemId","rootCompItemId","projectFile","revision","dirty","uiBaseline"});const auto& saved=*data_->savedSnapshots[eligible-1];
    if(result.Field("file").Text()!=state.Field("projectFile").Text()||CopyInteger(result.Field("revision"))!=CopyInteger(state.Field("revision"))||ManifestCanonical(state)!=saved.actualPostSave||!saved.file->Current()||!saved.root->Current()||detail::Hash(detail::ReadExact(saved.file->file.Get(),134217728))!=saved.hash)Refuse("trusted_c6_restore_current_saved_stage_drift",0,true);
    auto named=detail::Relative(saved.root->directory.Get(),EmbeddedProfile().execution.variants[eligible-1].snapshotName,false,false,false,false,true);if(!detail::SamePin(detail::ReadPin(named.Get(),false),saved.pin)||detail::Hash(detail::ReadExact(named.Get(),134217728))!=saved.hash)Refuse("trusted_c6_restore_current_named_stage_drift",0,true);
    original->savedCurrentSlot=eligible;original->restorationReadOnly=true;
}
NativeTitleManifest& NativeClient::RequireFixedExecutionCurrent(const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead,std::uint16_t slot,ExecutionLeaf leaf){
    if(slot<1||slot>2||(leaf!=ExecutionLeaf::EnqueueAme&&leaf!=ExecutionLeaf::StartAme&&leaf!=ExecutionLeaf::RestoreBaseline))return RequireExecutionBaseline(manifest,currentRead);
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& own=Require(manifest,CapKind::Manifest);auto& read=Require(currentRead,CapKind::Terminal);
    AssertCapabilityCurrent(manifest);AssertCapabilityCurrent(currentRead);const auto& saved=data_->savedSnapshots[slot-1];const auto& debt=data_->restorationDebts[slot-1];const auto now=GetTickCount64();
    if(!own.manifest_||own.manifest_->owner_!=this||own.manifest_!=data_->titleManifest||own.manifest_->stage_!=NativeTitleManifest::Stage::Complete||
        !saved||saved->unknown||!debt||debt->state!=Data::RestorationDebt::State::StageTerminal||!debt->effectSelected||debt->actor!=data_->observationActor||
        !saved->stageTerminal||!saved->stageTerminal->project_||saved->stageTerminal->project_!=debt->stageCommand||!read.project_||
        read.project_->stage!=ProjectCapture::Stage::Terminal||read.project_->actor!=debt->actor||!read.project_->terminalMono||
        now<read.project_->terminalMono||now-read.project_->terminalMono>10000||read.project_->expiry<=now||
        (read.project_!=debt->stageCommand&&read.project_->savedCurrentSlot!=slot)||
        std::find(data_->projects.begin(),data_->projects.end(),read.project_)==data_->projects.end()||!saved->file||!saved->root||!saved->file->Current()||!saved->root->Current())
        Refuse("trusted_private_staged_current_lineage_required");
    if(read.project_->restorationReadOnly&&leaf!=ExecutionLeaf::RestoreBaseline)Refuse("trusted_restoration_only_read_scope_refused");
    const auto& variant=EmbeddedProfile().execution.variants[slot-1];auto named=detail::Relative(saved->root->directory.Get(),variant.snapshotName,false,false,false,false,true);
    if(!detail::SamePin(detail::ReadPin(named.Get(),false),saved->pin)||detail::Hash(detail::ReadExact(named.Get(),134217728))!=saved->hash||
        detail::Hash(detail::ReadExact(saved->file->file.Get(),134217728))!=saved->hash)Refuse("trusted_private_staged_current_file_changed");
    const auto expected=ManifestJson(saved->actualPostSave);
    if(read.project_==debt->stageCommand){const auto actual=ManifestJson(read.project_->originalResult);
        if(ManifestCanonical(actual.Field("postSave"))!=saved->actualPostSave||debt->stageTerminal!=detail::Hash(read.project_->originalResult))Refuse("trusted_private_staged_terminal_current_drift");
    }else if(read.project_->restorationReadOnly&&read.project_->tool==phase::ToolCode::GetProjectInfo){const auto actual=ManifestJson(read.project_->originalResult);const auto& envelope=actual.Field("ownedReadCurrent");capture::Fields(envelope,{"schema","state"});if(envelope.Field("schema").Text()!="ae-agent.owned-read-current.v1"||ManifestCanonical(envelope.Field("state"))!=saved->actualPostSave)Refuse("trusted_private_c6_staged_current_drift");
    }else{const auto actual=ManifestJson(read.project_->originalResult);ManifestLayerCensusJoin(actual,actual.Field("ownedTitleInventory"),false);
        if(ManifestCanonical(actual.Field("ownedCurrentStageState"))!=saved->actualPostSave||ManifestCanonical(actual.Field("ownedUiBaseline"))!=ManifestCanonical(expected.Field("uiBaseline")))Refuse("trusted_private_staged_current_full_graph_ui_drift");
        if(actual.Field("ownedTitleInventory").Field("projectFile").Text()!=expected.Field("projectFile").Text()||
            actual.Field("ownedTitleInventory").Field("revision").Unsigned()!=saved->revision||actual.Field("itemId").Unsigned()!=saved->compId||
            actual.Field("dynamicLinkGUID").Text()!=saved->guid||
            !capture::ObservedTimingSame(capture::ObservedTimingCompJoin(actual.Field("ownedObservedTiming"),actual,false),own.manifest_->state_.observedTiming))
            Refuse("trusted_private_staged_current_factual_comp_drift");
        std::size_t matches=0;for(const auto& inventory:capture::Array(expected.Field("graph").Field("ownedTitleInventories"),100))if(inventory.Field("compItemId").Unsigned()==saved->compId){
            if(ManifestCanonical(inventory)!=ManifestCanonical(actual.Field("ownedTitleInventory")))Refuse("trusted_private_staged_current_inventory_drift");++matches;}
        if(matches!=1)Refuse("trusted_private_staged_current_unique_comp_required");
    }
    return *own.manifest_;
}
Bytes NativeClient::ExecutionPreparationDescriptorFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead){
    auto& own=Require(handler,CapKind::Handler);AssertCapabilityCurrent(handler);
    const auto tool=static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2));if(!own.ingress_||own.frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::ExecutionPrep)||
        (tool!=phase::ToolCode::BuildSolutionPlan&&tool!=phase::ToolCode::ProposeAiAgentPlan&&tool!=phase::ToolCode::RunAiAgentPlan))Refuse("trusted_execution_preparation_handler_required");
    const auto& bytes=OriginalRequestBody(own.ingress_);if(detail::Hash(bytes)!=Fixed<32>(own.frame_.payload.data()+77))Refuse("trusted_execution_preparation_original_body_changed");
    const auto request=capture::ParseOriginalJson(bytes,1048576,4096);capture::Fields(request,{"name","args"});const auto selector=ExecutionSelector(request,tool);
    if(tool==phase::ToolCode::RunAiAgentPlan&&!capture::Boolean(request.Field("args").Field("dryRun")))Refuse("trusted_execution_actual_dry_run_required");
    if(!FixedExecutionIntentAllowed(tool,phase::CallKind::ExecutionPrep,selector.first,selector.second))Refuse("trusted_execution_preparation_fixed_scope_required");
    auto& m=RequireFixedExecutionCurrent(manifest,currentRead,selector.first,selector.second);
    const auto idHex=[](const Id& id){Digest padded{};std::copy(id.begin(),id.end(),padded.begin());return ExecutionHex(padded).substr(0,32);};
    const auto requestBytes=ManifestCanonical(request);std::string text="{\"purpose\":\"preparation\",\"callRef\":\""+idHex(Fixed<16>(own.frame_.payload.data()+109))+"\",\"handlerRef\":\""+idHex(Fixed<16>(own.frame_.payload.data()))+"\",\"request\":"+std::string(requestBytes.begin(),requestBytes.end())+
        ",\"slot\":"+std::to_string(selector.first)+",\"leaf\":"+std::to_string(static_cast<std::uint16_t>(selector.second))+",\"projectFile\":"+ManifestQuote(ManifestUtf8(EmbeddedProfile().execution.sourceProjectLocator))+
        ",\"projectRevision\":"+std::to_string(m.nativeRevision_)+",\"manifestSha25664\":\""+ExecutionHex(m.state_.graphHash)+"\",\"currentReadSha25664\":\""+ExecutionHex(Fixed<32>(currentRead->frame_.payload.data()+17))+"\",\"rangeMode\":\""+(m.state_.rangeMode==TitleRangeMode::FullObservedRootRangeV1?"full_observed_root_range_v1":"frozen_literal_range")+"\"}";
    const auto& policy=EmbeddedProfile().execution;
    std::string facts="{\"schema\":\"ae-agent.owned-runtime-initial-title-facts.v1\",\"sourceProject\":{\"file\":"+ManifestQuote(ManifestUtf8(policy.sourceProjectLocator))+",\"sha25664\":\""+ExecutionHex(m.state_.projectHash)+
        "\"},\"baseline\":{\"revision\":"+std::to_string(m.nativeRevision_)+",\"graphSha25664\":\""+ExecutionHex(m.state_.graphHash)+"\",\"rootCompItemId\":"+std::to_string(m.state_.rootId)+",\"variantCompItemId\":"+std::to_string(m.state_.compId)+",\"controlled\":[";
    if(m.state_.controlled.size()!=2)Refuse("trusted_execution_native_pair_facts_required");
    for(std::size_t i=0;i<2;++i){if(i)facts+=',';const auto& layer=m.state_.controlled[i];facts+="{\"id\":"+std::to_string(layer.id)+",\"contentSha25664\":\""+ExecutionHex(layer.contentHash)+"\",\"enabled\":"+(layer.enabled?"true":"false")+"}";}
    facts+=" ]},\"selectedTextLayerIDs\":["+std::to_string(m.selectedIds_[0])+","+std::to_string(m.selectedIds_[1])+"],\"variants\":[";
    for(std::size_t i=0;i<2;++i){if(i)facts+=',';const auto& variant=policy.variants[i];const auto prefix=policy.snapshotLocator+(policy.snapshotLocator.back()==L'\\'?L"":L"\\"),snapshot=prefix+variant.snapshotName,working=prefix+variant.workingName;
        facts+="{\"slot\":"+std::to_string(i+1)+",\"variantId\":"+ManifestQuote(ManifestUtf8(variant.variantId))+",\"workingProjectFile\":"+ManifestQuote(ManifestUtf8(working))+",\"snapshotProjectFile\":"+ManifestQuote(ManifestUtf8(snapshot))+
            ",\"outputFileName\":"+ManifestQuote(ManifestUtf8(variant.outputName))+",\"range\":{\"startFrame\":"+std::to_string(m.state_.frameStart)+",\"frameCount\":"+std::to_string(m.state_.frameCount)+
            ",\"fpsNumerator\":"+std::to_string(m.state_.rateNumerator)+",\"fpsDenominator\":"+std::to_string(m.state_.rateDenominator)+"}}";}
    facts+="],\"ame\":null}";text.pop_back();text+=",\"facts\":"+facts+"}";
    // The original panel/session association is captured in the same actual
    // observation as READ. It is never supplied by a later adopt or Run click.
    if(tool==phase::ToolCode::ProposeAiAgentPlan&&(data_->panelConnection.empty()||data_->panelGeneration.empty()||data_->panelInstance.empty()||
        data_->panelChatSession.empty()||data_->panelConnection.size()+1+data_->panelChatSession.size()>160||data_->panelChatSession.find('\0')!=std::string::npos))
        Refuse("trusted_original_proposal_panel_session_required");
    const auto session=data_->panelChatSession.empty()?std::string{}:data_->panelConnection+":"+data_->panelChatSession;
    text.pop_back();text+=",\"originalPanel\":{\"panelConnectionId\":"+ManifestQuote(data_->panelConnection)+",\"panelGeneration\":"+ManifestQuote(data_->panelGeneration)+
        ",\"panelInstanceId\":"+ManifestQuote(data_->panelInstance)+",\"panelLifecycleEpoch\":"+std::to_string(data_->panelEpoch)+",\"confirmationSessionId\":"+ManifestQuote(session)+"}}";
    if(currentRead->project_->restoredCurrentSlot){const auto slot=currentRead->project_->restoredCurrentSlot;const auto state=ManifestJson(data_->restoredSourceReadbacks[slot-1]);auto descriptor=ManifestJson(Bytes(text.begin(),text.end()));CopySetInteger(MutableField(descriptor,"projectRevision"),CopyInteger(state.Field("revision")));
        auto stage=ManifestJson(data_->preissuedRestorationPrograms[slot-1]->restorationProgram_->descriptor);MutableField(stage,"originalGraph")=state.Field("graph");MutableField(stage,"originalUi")=state.Field("uiBaseline");MutableField(stage,"selectedTextLayerIds")=state.Field("selectedTextLayerIds");
        std::size_t targets=0;for(const auto& inventory:capture::Array(state.Field("graph").Field("ownedTitleInventories"),100))if(CopyInteger(inventory.Field("compItemId"))==CopyInteger(state.Field("compItemId"))){MutableField(MutableField(stage,"originalComp"),"ownedTitleInventory")=inventory;++targets;}
        if(targets!=1)Refuse("trusted_private_restored_source_unique_target");CopySetText(MutableField(MutableField(stage,"originalComp"),"dynamicLinkGUID"),state.Field("sourceGuid").Text());
        const auto stageBytes=ManifestCanonical(stage),selectedBytes=ManifestCanonical(state.Field("selectedTextLayerIds"));const auto targetText="{\"schema\":\"ae-agent.owned-native-restored-source-target.v1\",\"slot\":"+std::to_string(selector.first)+",\"projectFile\":"+ManifestQuote(state.Field("projectFile").Text())+",\"compItemId\":"+std::to_string(CopyInteger(state.Field("compItemId")))+",\"rootCompItemId\":"+std::to_string(CopyInteger(state.Field("rootCompItemId")))+",\"revision\":"+std::to_string(CopyInteger(state.Field("revision")))+",\"sourceGuid\":"+ManifestQuote(state.Field("sourceGuid").Text())+",\"selectedTextLayerIds\":"+std::string(selectedBytes.begin(),selectedBytes.end())+",\"stageDescriptor\":"+std::string(stageBytes.begin(),stageBytes.end())+"}";
        descriptor.keys.push_back("currentTarget");descriptor.children.push_back(ManifestJson(Bytes(targetText.begin(),targetText.end())));return ManifestCanonical(descriptor);
    }
    if(selector.first&&(selector.second==ExecutionLeaf::EnqueueAme||selector.second==ExecutionLeaf::StartAme||selector.second==ExecutionLeaf::RestoreBaseline)){
        const auto& saved=*data_->savedSnapshots[selector.first-1];const auto post=ManifestJson(saved.actualPostSave);text.pop_back();
        text+=",\"currentTarget\":{\"schema\":\"ae-agent.owned-native-staged-current-target.v1\",\"slot\":"+std::to_string(selector.first)+",\"projectFile\":"+ManifestQuote(post.Field("projectFile").Text())+
            ",\"compItemId\":"+std::to_string(saved.compId)+",\"rootCompItemId\":"+std::to_string(saved.rootId)+",\"revision\":"+std::to_string(saved.revision)+",\"sourceGuid\":"+ManifestQuote(saved.guid)+"}}";
        // M100 target follows this own saved row, while the original manifest
        // and its baseline facts stay immutable.
        const auto program=data_->preissuedRestorationPrograms[selector.first-1];if(!program||!program->restorationProgram_||program->restorationProgram_->unknown)Refuse("trusted_private_staged_program_required");
        auto descriptor=ManifestJson(Bytes(text.begin(),text.end()));auto& target=MutableField(descriptor,"currentTarget");target.keys.push_back("stageDescriptor");target.children.push_back(ManifestJson(program->restorationProgram_->descriptor));target.keys.push_back("selectedTextLayerIds");target.children.push_back(post.Field("selectedTextLayerIds"));CopySetText(MutableField(descriptor,"projectFile"),post.Field("projectFile").Text());
        CopySetInteger(MutableField(descriptor,"projectRevision"),saved.revision);return ManifestCanonical(descriptor);
    }
    return Bytes(text.begin(),text.end());
}
std::shared_ptr<Capability> NativeClient::BindPreparationDeliveryFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead,const std::string& originalGeneratedSource){
    const auto descriptor=ExecutionPreparationDescriptorFixed(handler,manifest,currentRead);const auto parsed=ManifestJson(descriptor);auto& own=Require(handler,CapKind::Handler);
    const auto now=GetTickCount64();if(Number(own.frame_.payload.data()+72,2)!=static_cast<std::uint16_t>(phase::ToolCode::RunAiAgentPlan)||
        originalGeneratedSource.empty()||originalGeneratedSource.size()>1048576||originalGeneratedSource.find('\0')!=std::string::npos||
        detail::Zero(data_->observationSnapshot)||data_->observationTarget!=Fixed<16>(own.frame_.payload.data())||!data_->observationOrdinal||
        now<data_->observationMono||now-data_->observationMono>10000||data_->projects.size()>=kTwoTitleCalls)Refuse("trusted_preparation_original_delivery_bind_refused");
    auto p=std::make_shared<ProjectCapture>();p->inspection=true;p->preparationDelivery=true;p->tool=phase::ToolCode::RunAiAgentPlan;
    p->originalHandler=handler;p->originalManifest=manifest;p->baselineRead=currentRead;p->preparationDescriptor=descriptor;
    p->command=detail::RandomId();p->execution=detail::RandomId();p->lease=detail::RandomId();p->handler=Fixed<16>(own.frame_.payload.data());
    p->originalScript=originalGeneratedSource;p->script=detail::Hash(Bytes(originalGeneratedSource.begin(),originalGeneratedSource.end()));
    p->operationScope=FixedExecutionScope(EmbeddedProfile().execution,static_cast<std::uint16_t>(parsed.Field("slot").Unsigned()),static_cast<ExecutionLeaf>(parsed.Field("leaf").Unsigned()));
    p->snapshot=data_->observationSnapshot;p->context=data_->observationContext;p->transport=data_->observationTransport;p->actor=data_->observationActor;
    p->observationOrdinal=data_->observationOrdinal;p->panelConnection=data_->panelConnection;p->panelGeneration=data_->panelGeneration;data_->projects.push_back(p);
    Bytes body(own.frame_.payload.begin(),own.frame_.payload.begin()+40);detail::PutU16(body,static_cast<std::uint16_t>(p->tool));detail::PutU16(body,static_cast<std::uint16_t>(phase::ChildRole::ExecutionPrep));
    Put(body,p->command);Put(body,p->execution);Put(body,p->lease);Put(body,Id{});Put(body,p->operationScope);Put(body,p->script);body.resize(204,0);body.push_back(static_cast<unsigned char>(phase::DeliveryClass::ExecutionPrep));
    AssertCapabilityCurrent(handler);(void)RequireFixedExecutionCurrent(manifest,currentRead,static_cast<std::uint16_t>(parsed.Field("slot").Unsigned()),static_cast<ExecutionLeaf>(parsed.Field("leaf").Unsigned()));own.spent_=true;
    try{auto command=Own(CapKind::Command,Exchange(phase::Verb::BindCommand,body));p->expiry=Number(command->frame_.payload.data()+32,8);command->project_=p;command->ingress_=own.ingress_;return command;}
    catch(...){p->stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}
}
bool NativeClient::IsPreparationCommand(const std::shared_ptr<Capability>& command){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(!command||command->owner_!=this||!command->project_||std::find(data_->projects.begin(),data_->projects.end(),command->project_)==data_->projects.end())Refuse("trusted_original_preparation_command_required");
    return command->project_->preparationDelivery;
}
Bytes NativeClient::PreparationResultDescriptorFixed(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){
    if(!IsPreparationCommand(command))Refuse("trusted_original_preparation_delivery_required");auto& p=*command->project_;(void)OriginalRequestBody(request);if(command->ingress_)(void)OriginalRequestBody(command->ingress_);
    if(p.stage!=ProjectCapture::Stage::Submitted||p.tool!=phase::ToolCode::RunAiAgentPlan||!p.originalHandler||!p.originalManifest||!p.baselineRead||
        !request->panel_||request->fields_.url!="/bridge/result"||request->fields_.method!="POST"||!actual.success||actual.command!=p.command||actual.execution!=p.execution||actual.lease!=p.lease||
        actual.panelConnection!=p.panelConnection||actual.panelGeneration!=p.panelGeneration||actual.result.empty()||actual.result.size()>1048576||GetTickCount64()>=p.expiry)
        Refuse("trusted_actual_preparation_terminal_mismatch",0,true);
    const auto parsed=ManifestJson(p.preparationDescriptor);const auto slot=static_cast<std::uint16_t>(parsed.Field("slot").Unsigned());const auto leaf=static_cast<ExecutionLeaf>(parsed.Field("leaf").Unsigned());
    auto& manifest=RequireFixedExecutionCurrent(p.originalManifest,p.baselineRead,slot,leaf);const auto result=ManifestJson(actual.result);const auto& inventory=result.Field("ownedTitleInventory");ManifestLayerCensusJoin(result,inventory,false);ValidateOriginalUiBaseline(result.Field("ownedUiBaseline"),inventory);
    if(manifest.state_.rangeMode==TitleRangeMode::FullObservedRootRangeV1&&!capture::ObservedTimingSame(capture::ObservedTimingCompJoin(result.Field("ownedObservedTiming"),result,false),manifest.state_.observedTiming))Refuse("trusted_preparation_observed_timing_drift",0,true);
    if(slot&&(leaf==ExecutionLeaf::EnqueueAme||leaf==ExecutionLeaf::StartAme||leaf==ExecutionLeaf::RestoreBaseline)){
        const auto& saved=*data_->savedSnapshots[slot-1];const auto post=ManifestJson(saved.actualPostSave);const auto& state=result.Field("ownedCurrentStageState");
        if(ManifestCanonical(state)!=saved.actualPostSave||ManifestCanonical(result.Field("ownedUiBaseline"))!=ManifestCanonical(post.Field("uiBaseline"))||inventory.Field("projectFile").Text()!=post.Field("projectFile").Text()||
            CopyInteger(inventory.Field("revision"))!=saved.revision||CopyInteger(result.Field("itemId"))!=saved.compId||result.Field("dynamicLinkGUID").Text()!=saved.guid)Refuse("trusted_preparation_private_staged_current_drift",0,true);
        std::size_t target=0;for(const auto& row:capture::Array(post.Field("graph").Field("ownedTitleInventories"),100))if(CopyInteger(row.Field("compItemId"))==saved.compId){if(ManifestCanonical(row)!=ManifestCanonical(inventory))Refuse("trusted_preparation_private_stage_inventory_drift",0,true);++target;}
        if(target!=1)Refuse("trusted_preparation_private_stage_unique_target",0,true);p.savedCurrentSlot=slot;p.restorationReadOnly=p.baselineRead->project_->restorationReadOnly;
    }else if(p.baselineRead->project_->restoredCurrentSlot){const auto restoredSlot=p.baselineRead->project_->restoredCurrentSlot;const auto expected=ManifestJson(data_->restoredSourceReadbacks[restoredSlot-1]);if(ManifestCanonical(result.Field("ownedCurrentStageState"))!=data_->restoredSourceReadbacks[restoredSlot-1]||result.Field("dynamicLinkGUID").Text()!=expected.Field("sourceGuid").Text()||CopyInteger(result.Field("itemId"))!=CopyInteger(expected.Field("compItemId"))||ManifestCanonical(result.Field("ownedUiBaseline"))!=ManifestCanonical(expected.Field("uiBaseline")))Refuse("trusted_preparation_restored_source_current_drift",0,true);std::size_t target=0;for(const auto& row:capture::Array(expected.Field("graph").Field("ownedTitleInventories"),100))if(CopyInteger(row.Field("compItemId"))==CopyInteger(expected.Field("compItemId"))){if(ManifestCanonical(row)!=ManifestCanonical(inventory))Refuse("trusted_preparation_restored_source_inventory_drift",0,true);++target;}if(target!=1)Refuse("trusted_preparation_restored_source_unique_target",0,true);p.restoredCurrentSlot=restoredSlot;
    }else if(inventory.Field("projectFile").Text()!=ManifestUtf8(EmbeddedProfile().execution.sourceProjectLocator)||inventory.Field("revision").Unsigned()!=manifest.nativeRevision_||
        inventory.Field("compItemId").Unsigned()!=manifest.state_.compId||detail::Hash(ManifestCanonical(inventory))!=manifest.sourceInventoryHash_||ManifestCanonical(result.Field("ownedUiBaseline"))!=manifest.originalUiBaseline_)Refuse("trusted_preparation_actual_baseline_drift",0,true);
    const auto idHex=[](const Id& id){Digest padded{};std::copy(id.begin(),id.end(),padded.begin());return ExecutionHex(padded).substr(0,32);};
    std::string text(p.preparationDescriptor.begin(),p.preparationDescriptor.end());text.pop_back();text+=",\"delivery\":{\"commandRef\":\""+idHex(p.command)+"\",\"executionRef\":\""+idHex(p.execution)+"\",\"leaseRef\":\""+idHex(p.lease)+
        "\",\"receiptSha25664\":\""+ExecutionHex(p.receipt)+"\",\"scriptSha25664\":\""+ExecutionHex(p.script)+"\",\"resultSha25664\":\""+ExecutionHex(detail::Hash(actual.result))+"\"}}";
    return Bytes(text.begin(),text.end());
}
std::shared_ptr<Capability> NativeClient::CapturePreparationResultFixed(const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual,const Bytes& originalGetterProof){
    const auto descriptor=PreparationResultDescriptorFixed(command,request,actual);const auto proof=ManifestJson(originalGetterProof);ExecutionSourceProof(proof,descriptor,"ae-agent.owned-execution-preparation-proof.v1");
    auto& p=*command->project_;const auto parsed=ManifestJson(descriptor);const auto& h=*p.originalHandler;
    for(const auto& old:data_->executionCaptures)if(old->handler==p.handler)Refuse("trusted_preparation_original_delivery_once");
    if(data_->executionCaptures.size()>=1+3*kTwoTitlePreparedScopes)Refuse("trusted_preparation_original_delivery_budget");
    auto row=std::shared_ptr<ExecutionCapture>(new ExecutionCapture(this));row->tool=phase::ToolCode::RunAiAgentPlan;row->slot=static_cast<std::uint16_t>(parsed.Field("slot").Unsigned());row->leaf=static_cast<ExecutionLeaf>(parsed.Field("leaf").Unsigned());row->scope=p.operationScope;
    row->call=Fixed<16>(h.frame_.payload.data()+109);row->handler=p.handler;row->actor=p.actor;row->manifest=p.originalManifest->manifest_->state_.graphHash;
    row->project=ExecutionProofDigest(proof.Field("projectSha25664"));row->leaves=ExecutionProofDigest(proof.Field("leavesSha25664"));row->observation=ExecutionProofDigest(proof.Field("observationSha25664"));
    row->originalProof=originalGetterProof;row->result=detail::Hash(originalGetterProof);row->originalHandler=p.originalHandler;row->originalManifest=p.originalManifest;row->currentRead=p.baselineRead;row->issued=GetTickCount64();row->expiry=p.expiry;
    Bytes fields;Put(fields,Fixed<32>(h.frame_.payload.data()+40));Put(fields,row->scope);Put(fields,row->result);detail::PutU16(fields,1);Put(fields,data_->wire->bindings_.sessionRef);Put(fields,reviewed::EmbeddedProfile().policyHash);
    Bytes body;Put(body,row->handler);Put(body,row->call);Put(body,row->result);detail::PutU16(body,1);Put(body,DomainHash("lcp2.production.preparation-terminal.v1",fields));
    (void)PreparationResultDescriptorFixed(command,request,actual);data_->executionCaptures.push_back(row);p.stage=ProjectCapture::Stage::Terminal;
    try{auto terminal=Own(CapKind::Terminal,Exchange(phase::Verb::Complete,body));p.originalResult=actual.result;p.terminalMono=GetTickCount64();terminal->execution_=row;terminal->project_=command->project_;return terminal;}
    catch(...){row->stage=ExecutionCapture::Stage::Unknown;p.stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}
}
std::shared_ptr<Capability> NativeClient::ProjectPreparationReadFixed(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);auto& own=Require(cap,CapKind::Terminal);AssertCapabilityCurrent(cap);
    if(!own.execution_||own.execution_->owner_!=this||own.execution_->stage!=ExecutionCapture::Stage::Prepared||own.execution_->tool!=phase::ToolCode::RunAiAgentPlan||
        !own.project_||!own.project_->preparationDelivery||own.project_->stage!=ProjectCapture::Stage::Terminal||own.project_->readProjected||own.project_->originalResult.empty()||
        std::find(data_->projects.begin(),data_->projects.end(),own.project_)==data_->projects.end())Refuse("trusted_original_dry_read_projection_once");
    own.project_->readProjected=true;auto read=Own(CapKind::Terminal,own.frame_);read->project_=own.project_;return read;
}
std::shared_ptr<Capability> NativeClient::CaptureExecutionPreparationFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead,const Bytes& originalGetterProof){
    const auto descriptor=ExecutionPreparationDescriptorFixed(handler,manifest,currentRead);const auto proof=ManifestJson(originalGetterProof);ExecutionSourceProof(proof,descriptor,"ae-agent.owned-execution-preparation-proof.v1");
    auto& own=Require(handler,CapKind::Handler);const auto tool=static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2));const auto parsed=ManifestJson(descriptor);const auto slot=parsed.Field("slot").Unsigned();const auto leaf=static_cast<ExecutionLeaf>(parsed.Field("leaf").Unsigned());
    std::size_t preparations=0;for(const auto& existing:data_->executionCaptures)if(existing->stage!=ExecutionCapture::Stage::Authorized)++preparations;
    if(preparations>=1+2*kTwoTitlePreparedScopes)Refuse("trusted_execution_preparation_row_budget");
    for(const auto& row:data_->executionCaptures)if(row->handler==Fixed<16>(own.frame_.payload.data()))Refuse("trusted_execution_preparation_once_refused");
    auto row=std::shared_ptr<ExecutionCapture>(new ExecutionCapture(this));row->tool=tool;row->slot=static_cast<std::uint16_t>(slot);row->leaf=leaf;row->scope=FixedExecutionScope(EmbeddedProfile().execution,row->slot,leaf);
    row->call=Fixed<16>(own.frame_.payload.data()+109);row->handler=Fixed<16>(own.frame_.payload.data());row->actor=data_->observationActor;row->manifest=manifest->manifest_->state_.graphHash;
    row->project=ExecutionProofDigest(proof.Field("projectSha25664"));row->leaves=ExecutionProofDigest(proof.Field("leavesSha25664"));row->observation=ExecutionProofDigest(proof.Field("observationSha25664"));
    row->originalProof=originalGetterProof;row->result=detail::Hash(originalGetterProof);row->originalHandler=handler;row->originalManifest=manifest;row->currentRead=currentRead;row->issued=GetTickCount64();row->expiry=Number(own.frame_.payload.data()+32,8);
    row->originalPanelConnection=data_->panelConnection;row->originalPanelGeneration=data_->panelGeneration;row->originalPanelInstance=data_->panelInstance;
    row->originalPanelEpoch=data_->panelEpoch;row->originalPanelSession=data_->panelConnection+":"+data_->panelChatSession;
    Bytes fields;Put(fields,Fixed<32>(own.frame_.payload.data()+40));Put(fields,row->scope);Put(fields,row->result);detail::PutU16(fields,1);Put(fields,data_->wire->bindings_.sessionRef);Put(fields,reviewed::EmbeddedProfile().policyHash);
    Bytes body;Put(body,row->handler);Put(body,row->call);Put(body,row->result);detail::PutU16(body,1);Put(body,DomainHash("lcp2.production.preparation-terminal.v1",fields));
    AssertCapabilityCurrent(handler);(void)RequireFixedExecutionCurrent(manifest,currentRead,row->slot,row->leaf);data_->executionCaptures.push_back(row);own.spent_=true;
    try{auto terminal=Own(CapKind::Terminal,Exchange(phase::Verb::Complete,body));terminal->execution_=row;if(tool==phase::ToolCode::ProposeAiAgentPlan)data_->proposalTerminals.push_back(terminal);return terminal;}
    catch(...){row->stage=ExecutionCapture::Stage::Unknown;data_->unknown=true;throw;}
}
void NativeClient::AcceptOriginalManualAdoptFixed(const std::shared_ptr<Capability>& proposal,const std::shared_ptr<Capability>& dryRun,const std::shared_ptr<AuthenticatedRequest>& request){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& p=Require(proposal,CapKind::Terminal);auto& d=Require(dryRun,CapKind::Terminal);
    AssertCapabilityCurrent(proposal);AssertCapabilityCurrent(dryRun);
    if(!EmbeddedProfile().execution.enabled||!p.execution_||!d.execution_||p.execution_->owner_!=this||d.execution_->owner_!=this||
        p.execution_->tool!=phase::ToolCode::ProposeAiAgentPlan||d.execution_->tool!=phase::ToolCode::RunAiAgentPlan||
        p.execution_->stage!=ExecutionCapture::Stage::Prepared||d.execution_->stage!=ExecutionCapture::Stage::Prepared||p.execution_->panelAdopted||
        p.execution_->scope!=d.execution_->scope||p.execution_->originalManifest!=d.execution_->originalManifest||d.execution_->issued<p.execution_->issued||
        p.execution_->actor!=data_->observationActor||d.execution_->actor!=data_->observationActor||!d.project_||!d.project_->preparationDelivery||
        d.project_->stage!=ProjectCapture::Stage::Terminal||!d.project_->terminalMono||!d.project_->readProjected||
        !request||request->owner_!=this||!request->panel_||request->handlerSpent_||request->responseTerminal_||request->unknown_||
        request->fields_.method!="POST"||request->fields_.url!="/agents/plan/adopt")Refuse("trusted_original_manual_adopt_join_refused");
    AuthenticateSocketRequest(*request->connection_,request->fields_.token,true);const auto body=ManifestJson(OriginalRequestBody(request));
    capture::Fields(body,{"actionId","revision","panelConnectionId","panelGeneration","confirmationSessionId","panelInstanceId","panelLifecycleEpoch"});
    const auto& row=*p.execution_;
    if(body.Field("revision").kind!=capture::Json::Kind::Number||body.Field("panelLifecycleEpoch").kind!=capture::Json::Kind::Number||
        body.Field("panelConnectionId").Text()!=row.originalPanelConnection||body.Field("panelGeneration").Text()!=row.originalPanelGeneration||
        body.Field("panelInstanceId").Text()!=row.originalPanelInstance||body.Field("panelLifecycleEpoch").Unsigned()!=row.originalPanelEpoch||
        body.Field("confirmationSessionId").Text()!=row.originalPanelSession||row.originalPanelConnection!=data_->panelConnection||
        row.originalPanelGeneration!=data_->panelGeneration||row.originalPanelInstance!=data_->panelInstance||row.originalPanelEpoch!=data_->panelEpoch||
        row.originalPanelSession!=data_->panelConnection+":"+data_->panelChatSession)Refuse("trusted_original_manual_adopt_panel_changed");
    const auto proof=ManifestJson(row.originalProof);const auto& result=proof.Field("result");
    if(body.Field("actionId").Text()!=result.Field("actionId").Text()||body.Field("revision").Unsigned()!=result.Field("currentPlanPins").Field("revision").Unsigned())
        Refuse("trusted_original_manual_adopt_m100_changed");
    // Data-only adoption of the same completed receipt; no Call/Note, new
    // proposal, expiry extension or execution authority is created here.
    p.execution_->panelAdopted=true;request->handlerSpent_=true;
}
Bytes NativeClient::ManualExecutionPreflightFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead){
    RequireRole(Role::Daemon);auto& own=Require(handler,CapKind::Handler);AssertCapabilityCurrent(handler);
    if(own.frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::Execute)||!own.ingress_||Number(own.frame_.payload.data()+72,2)!=static_cast<std::uint16_t>(phase::ToolCode::RunAiAgentPlan))Refuse("trusted_original_manual_preflight_handler_required");
    const auto request=ManifestJson(OriginalRequestBody(own.ingress_));capture::Fields(request,{"name","args"});const auto& args=request.Field("args");
    capture::Fields(args,{"actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion","ownedTitleOperation","variantSlot","ownedTitleProgram"});
    const auto selector=ExecutionSelector(request,phase::ToolCode::RunAiAgentPlan);const auto& policy=EmbeddedProfile().execution;auto& m=RequireFixedExecutionCurrent(manifest,currentRead,selector.first,selector.second);
    if(!FixedExecutionIntentAllowed(phase::ToolCode::RunAiAgentPlan,phase::CallKind::Execute,selector.first,selector.second)||!m.state_.savedClean||
        !detail::SamePin(m.state_.project,policy.sourceProject.pin)||m.state_.projectHash!=policy.sourceProject.sha256)Refuse("trusted_original_manual_preflight_clean_source_required");
    const auto checkpointPath=policy.snapshotLocator+(policy.snapshotLocator.back()==L'\\'?L"":L"\\")+policy.checkpointName;
    const auto call=Fixed<16>(own.frame_.payload.data()+109);Digest padded{};std::copy(call.begin(),call.end(),padded.begin());const auto rawId=ExecutionHex(padded).substr(0,32);const auto callUuid=rawId.substr(0,8)+"-"+rawId.substr(8,4)+"-"+rawId.substr(12,4)+"-"+rawId.substr(16,4)+"-"+rawId.substr(20,12);
    const bool staged=selector.first&&(selector.second==ExecutionLeaf::EnqueueAme||selector.second==ExecutionLeaf::StartAme||selector.second==ExecutionLeaf::RestoreBaseline);const auto currentFile=staged?ManifestJson(data_->savedSnapshots[selector.first-1]->actualPostSave).Field("projectFile").Text():ManifestUtf8(policy.sourceProjectLocator);const auto currentHash=staged?data_->savedSnapshots[selector.first-1]->hash:m.state_.projectHash;const auto currentRevision=staged?data_->savedSnapshots[selector.first-1]->revision:m.nativeRevision_;
    const auto text="{\"schema\":\"ae-agent.owned-native-clean-source-preflight.v1\",\"callRef\":\""+rawId+"\",\"executionId\":"+ManifestQuote(callUuid)+",\"sourceFile\":"+ManifestQuote(currentFile)+",\"sourceSha25664\":\""+ExecutionHex(currentHash)+"\",\"originalSourceFile\":"+ManifestQuote(ManifestUtf8(policy.sourceProjectLocator))+",\"originalSourceSha25664\":\""+ExecutionHex(m.state_.projectHash)+
        "\",\"revision\":"+std::to_string(currentRevision)+",\"originalSourceRevision\":"+std::to_string(m.nativeRevision_)+",\"manifestSha25664\":\""+ExecutionHex(m.state_.graphHash)+"\",\"currentReadSha25664\":\""+ExecutionHex(Fixed<32>(currentRead->frame_.payload.data()+17))+
        "\",\"checkpointFile\":"+ManifestQuote(ManifestUtf8(checkpointPath))+",\"slot\":"+std::to_string(selector.first)+",\"leaf\":"+std::to_string(static_cast<std::uint16_t>(selector.second))+",\"checkpointCreated\":false,\"unsavedStateCaptured\":false,\"nativeAuthority\":false}";
    AssertCapabilityCurrent(handler);(void)RequireFixedExecutionCurrent(manifest,currentRead,selector.first,selector.second);return Bytes(text.begin(),text.end());
}
Bytes NativeClient::ExecutionGateDescriptorFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& proposal,const std::shared_ptr<Capability>& dryRun,const std::shared_ptr<Capability>& currentRead,const std::shared_ptr<AuthenticatedRequest>& panelRequest){
    auto& own=Require(handler,CapKind::Handler);AssertCapabilityCurrent(handler);auto& p=Require(proposal,CapKind::Terminal);auto& d=Require(dryRun,CapKind::Terminal);
    AssertCapabilityCurrent(proposal);AssertCapabilityCurrent(dryRun);if(!own.ingress_||own.frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::Execute)||!p.execution_||!d.execution_||
        p.execution_->owner_!=this||d.execution_->owner_!=this||p.execution_->stage!=ExecutionCapture::Stage::Prepared||d.execution_->stage!=ExecutionCapture::Stage::Prepared||p.execution_->tool!=phase::ToolCode::ProposeAiAgentPlan||d.execution_->tool!=phase::ToolCode::RunAiAgentPlan||
        p.execution_->originalManifest!=manifest||d.execution_->originalManifest!=manifest||p.execution_->scope!=d.execution_->scope||p.execution_->actor!=data_->observationActor||d.execution_->actor!=data_->observationActor||
        d.execution_->issued<p.execution_->issued||!d.execution_->currentRead||!d.execution_->currentRead->project_||
        currentRead->project_->terminalMono<d.execution_->currentRead->project_->terminalMono)Refuse("trusted_execution_own_preparation_join_required");
    const auto request=capture::ParseOriginalJson(OriginalRequestBody(own.ingress_),1048576,4096);const auto tool=static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2));const auto selector=ExecutionSelector(request,tool);auto& m=RequireFixedExecutionCurrent(manifest,currentRead,selector.first,selector.second);
    if(!FixedExecutionIntentAllowed(tool,phase::CallKind::Execute,selector.first,selector.second)||FixedExecutionScope(EmbeddedProfile().execution,selector.first,selector.second)!=p.execution_->scope)Refuse("trusted_execution_own_preparation_scope_mismatch");
    if(!panelRequest||panelRequest->owner_!=this||!panelRequest->panel_||panelRequest->responseTerminal_||panelRequest->handlerSpent_||panelRequest->unknown_||
        panelRequest->fields_.method!="POST"||(panelRequest->fields_.url!="/agents/plan/run"&&panelRequest->fields_.url!="/agents/ame/title-start/run"))Refuse("trusted_execution_original_manual_route_required");
    AuthenticateSocketRequest(*panelRequest->connection_,panelRequest->fields_.token,true);const auto panel=ManifestCanonical(capture::ParseOriginalJson(OriginalRequestBody(panelRequest),1048576,4096));const auto controller=ManifestCanonical(request);
    if(selector.second==ExecutionLeaf::StartAme){if(panelRequest->fields_.url!="/agents/ame/title-start/run"||selector.first<1||selector.first>2||!data_->ameSourceJobs[selector.first-1]||!d.project_)Refuse("trusted_ame_original_protected_START_route_required");const auto job=data_->ameSourceJobs[selector.first-1];const auto originalPanel=ManifestJson(panel);const auto& witness=originalPanel.Field("ameManualQueueWitness");capture::Fields(witness,{"acceptedDryRunId","declaration","manifestHash","panelConnectionId","panelGeneration","trustedGesture"});Digest dryId{};std::copy(d.project_->execution.begin(),d.project_->execution.end(),dryId.begin());
        if(job->queueManifest_.empty()||detail::Zero(job->queueManifestHash_)||witness.Field("acceptedDryRunId").Text()!=ExecutionHex(dryId).substr(0,32)||witness.Field("manifestHash").Text()!=ExecutionHex(job->queueManifestHash_)||witness.Field("panelConnectionId").Text()!=data_->panelConnection||witness.Field("panelGeneration").Text()!=data_->panelGeneration||!capture::Boolean(witness.Field("trustedGesture")))Refuse("trusted_ame_original_manual_raw_dry_witness_join");}
    else if(panelRequest->fields_.url!="/agents/plan/run")Refuse("trusted_non_START_original_manual_route_required");
    const auto preflight=ManualExecutionPreflightFixed(handler,manifest,currentRead);const bool staged=selector.first&&(selector.second==ExecutionLeaf::EnqueueAme||selector.second==ExecutionLeaf::StartAme||selector.second==ExecutionLeaf::RestoreBaseline);
    const auto currentFile=staged?ManifestJson(data_->savedSnapshots[selector.first-1]->actualPostSave).Field("projectFile").Text():ManifestUtf8(EmbeddedProfile().execution.sourceProjectLocator);const auto currentRevision=staged?data_->savedSnapshots[selector.first-1]->revision:m.nativeRevision_;
    std::string text="{\"purpose\":\"gates\",\"request\":"+std::string(controller.begin(),controller.end())+",\"panel\":"+std::string(panel.begin(),panel.end())+
        ",\"panelRoute\":"+ManifestQuote(panelRequest->fields_.url)+",\"slot\":"+std::to_string(selector.first)+",\"leaf\":"+std::to_string(static_cast<std::uint16_t>(selector.second))+
        ",\"projectFile\":"+ManifestQuote(currentFile)+",\"projectRevision\":"+std::to_string(currentRevision)+",\"cleanSourcePreflight\":"+std::string(preflight.begin(),preflight.end())+",\"manifestSha25664\":\""+ExecutionHex(m.state_.graphHash)+
        "\",\"currentReadSha25664\":\""+ExecutionHex(Fixed<32>(currentRead->frame_.payload.data()+17))+"\",\"proposalProof\":"+std::string(p.execution_->originalProof.begin(),p.execution_->originalProof.end())+
        ",\"dryRunProof\":"+std::string(d.execution_->originalProof.begin(),d.execution_->originalProof.end())+"}";if(text.size()>1048576)Refuse("trusted_execution_gate_descriptor_bound");return Bytes(text.begin(),text.end());
}
std::shared_ptr<Capability> NativeClient::CaptureServerGatesFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& proposal,const std::shared_ptr<Capability>& dryRun,const std::shared_ptr<Capability>& currentRead,const std::shared_ptr<AuthenticatedRequest>& panelRequest,const Bytes& originalGetterProof){
    const auto descriptor=ExecutionGateDescriptorFixed(handler,manifest,proposal,dryRun,currentRead,panelRequest);const auto proof=ManifestJson(originalGetterProof);ExecutionSourceProof(proof,descriptor,"ae-agent.owned-execution-gate-proof.v1");
    auto& own=Require(handler,CapKind::Handler);if(data_->challenges.size()!=1)Refuse("trusted_execution_original_gate_challenge_required");const auto challenge=data_->challenges.front();
    if(Number(challenge.payload.data()+16,2)!=static_cast<std::uint16_t>(phase::ChallengePurpose::ServerGates)||Fixed<16>(challenge.payload.data()+18)!=Fixed<16>(own.frame_.payload.data()+109))Refuse("trusted_execution_original_gate_challenge_mismatch");
    auto row=std::shared_ptr<ExecutionCapture>(new ExecutionCapture(this));row->tool=static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2));row->slot=proposal->execution_->slot;row->leaf=proposal->execution_->leaf;row->scope=proposal->execution_->scope;row->call=Fixed<16>(own.frame_.payload.data()+109);row->handler=Fixed<16>(own.frame_.payload.data());
    row->actor=data_->observationActor;row->manifest=manifest->manifest_->state_.graphHash;row->proposal=proposal->execution_->result;row->dryRun=dryRun->execution_->result;row->project=ExecutionProofDigest(proof.Field("projectSha25664"));row->leaves=ExecutionProofDigest(proof.Field("leavesSha25664"));row->observation=ExecutionProofDigest(proof.Field("observationSha25664"));row->originalProof=originalGetterProof;
    row->originalHandler=handler;row->originalManifest=manifest;row->currentRead=currentRead;row->proposalTerminal=proposal;row->dryRunTerminal=dryRun;row->originalPanelRequest=panelRequest;row->issued=GetTickCount64();row->expiry=Number(own.frame_.payload.data()+32,8);
    if(data_->executionCaptures.size()>=1+3*kTwoTitlePreparedScopes)Refuse("trusted_execution_gate_row_budget");for(const auto& existing:data_->executionCaptures)if(existing->call==row->call||
        (existing->stage==ExecutionCapture::Stage::Authorized&&existing->scope==row->scope))Refuse("trusted_execution_original_gate_once_refused");
    Bytes body;Put(body,row->call);Put(body,Fixed<16>(challenge.payload.data()));Put(body,row->proposal);Put(body,row->dryRun);Put(body,row->project);Put(body,row->leaves);Put(body,row->observation);detail::PutU32(body,kExecutionGateMask);
    Bytes actual=body;Put(actual,Fixed<32>(own.frame_.payload.data()+40));Put(actual,row->scope);Put(actual,data_->wire->bindings_.sessionRef);Put(actual,reviewed::EmbeddedProfile().policyHash);Put(body,DomainHash("lcp2.production.actual-server-gates.v1",actual));
    AssertCapabilityCurrent(handler);(void)RequireFixedExecutionCurrent(manifest,currentRead,row->slot,row->leaf);(void)ExecutionGateDescriptorFixed(handler,manifest,proposal,dryRun,currentRead,panelRequest);
    data_->executionCaptures.push_back(row);data_->challenges.pop_front();panelRequest->handlerSpent_=true;proposal->spent_=true;dryRun->spent_=true;
    try{auto gate=Own(CapKind::ExecutionGate,Exchange(phase::Verb::ObserveServerGates,body));row->stage=ExecutionCapture::Stage::Authorized;gate->execution_=row;return gate;}
    catch(...){row->stage=ExecutionCapture::Stage::Unknown;panelRequest->unknown_=true;data_->unknown=true;throw;}
}
Bytes NativeClient::StageOperationDescriptorFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<Capability>& workingCopy){return StageDescriptorFixed(cap,workingCopy,true);}
Bytes NativeClient::RestorationDebtFactsFixed(){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();std::uint16_t count=0,inFlight=0,unknown=0;std::string states="[";
    for(std::size_t i=0;i<data_->restorationDebts.size();++i){if(i)states+=',';const auto& debt=data_->restorationDebts[i];if(!debt){states+="null";continue;}const char* state=nullptr;
        switch(debt->state){case Data::RestorationDebt::State::Preissued:state="preissued";break;case Data::RestorationDebt::State::Selected:state="stage_in_flight";break;case Data::RestorationDebt::State::StageTerminal:state="known_outstanding";break;case Data::RestorationDebt::State::Restored:state="restored";break;case Data::RestorationDebt::State::Unknown:state="unknown";break;}
        states+=ManifestQuote(state);if(debt->state==Data::RestorationDebt::State::Restored)continue;++count;if(debt->state!=Data::RestorationDebt::State::StageTerminal)++inFlight;if(debt->state==Data::RestorationDebt::State::Unknown)++unknown;
        const auto& program=data_->preissuedRestorationPrograms[i];if(program&&program->restorationProgram_&&program->restorationProgram_->bound&&!program->restorationProgram_->completed){++inFlight;if(program->restorationProgram_->unknown)++unknown;}}
    states+=']';const auto text="{\"schema\":\"ae-agent.owned-native-restoration-debt-facts.v1\",\"count\":"+std::to_string(count)+",\"inFlight\":"+std::to_string(inFlight)+",\"unknown\":"+std::to_string(unknown)+",\"states\":"+states+",\"nativeAuthority\":false}";return Bytes(text.begin(),text.end());
}
Bytes NativeClient::RestorationQuiescenceDescriptorFixed(const std::shared_ptr<Capability>& challenge){
    RequireRole(Role::Daemon);const auto event=ObservationChallengeDescriptor(challenge);const auto facts=RestorationDebtFactsFixed();const auto parsed=ManifestJson(facts);const auto count=CopyInteger(parsed.Field("count"));if(!count)return facts;
    if(count!=1||CopyInteger(parsed.Field("inFlight"))||CopyInteger(parsed.Field("unknown")))Refuse("trusted_restoration_quiescence_in_flight_or_unknown");std::uint16_t slot=0;for(const auto& debt:data_->restorationDebts)if(debt&&debt->state!=Data::RestorationDebt::State::Restored)slot=debt->slot;
    if(slot<1||slot>2||!data_->preissuedRestorationPrograms[slot-1]||!data_->savedSnapshots[slot-1])Refuse("trusted_restoration_quiescence_own_program_required");AssertCapabilityCurrent(data_->preissuedRestorationPrograms[slot-1]);const auto& saved=*data_->savedSnapshots[slot-1];
    if(saved.unknown||!saved.file->Current()||!saved.root->Current()||detail::Hash(detail::ReadExact(saved.file->file.Get(),134217728))!=saved.hash)Refuse("trusted_restoration_quiescence_saved_source_changed");
    const auto target=Fixed<16>(event.payload.data()+18);bool prepActive=false,restoreOnly=target==data_->wire->bindings_.sessionRef;
    for(const auto& weak:data_->executionHandlers){const auto handler=weak.lock();if(!handler||handler->spent_||Fixed<16>(handler->frame_.payload.data())!=target)continue;
        const auto kind=static_cast<phase::CallKind>(handler->frame_.payload[74]);if(kind!=phase::CallKind::ExecutionPrep)Refuse("trusted_restoration_quiescence_foreign_handler");const auto request=ManifestJson(OriginalRequestBody(handler->ingress_));const auto selected=ExecutionSelector(request,static_cast<phase::ToolCode>(Number(handler->frame_.payload.data()+72,2)));
        if(selected.first!=slot||(selected.second!=ExecutionLeaf::EnqueueAme&&selected.second!=ExecutionLeaf::StartAme&&selected.second!=ExecutionLeaf::RestoreBaseline))Refuse("trusted_restoration_quiescence_exact_leaf_required");prepActive=selected.second!=ExecutionLeaf::RestoreBaseline;restoreOnly=selected.second==ExecutionLeaf::RestoreBaseline;
    }
    for(const auto& project:data_->projects)if(project->stage!=ProjectCapture::Stage::Terminal)Refuse("trusted_restoration_quiescence_project_not_terminal");
    if(!prepActive&&!restoreOnly){for(const auto& weak:data_->readHandlers){const auto handler=weak.lock();if(handler&&!handler->spent_&&Fixed<16>(handler->frame_.payload.data())==target){const auto kind=static_cast<phase::CallKind>(handler->frame_.payload[74]);restoreOnly=kind==phase::CallKind::BootstrapRead;}}}
    if(!prepActive&&!restoreOnly)Refuse("trusted_restoration_quiescence_original_context_required");for(const auto& job:data_->originalJobs)if(job&&(job->unknown_||(restoreOnly?job->stage_!=AmeOriginalJob::Stage::MediaAccepted:job->stage_!=AmeOriginalJob::Stage::Enqueued&&job->stage_!=AmeOriginalJob::Stage::MediaAccepted)))Refuse("trusted_restoration_quiescence_job_media_not_quiescent");return facts;
}
Bytes NativeClient::RestorationProgramDescriptorFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<Capability>& workingCopy){const auto descriptor=StageDescriptorFixed(cap,workingCopy,false);return ManifestCanonical(ManifestJson(descriptor));}
Bytes NativeClient::StageDescriptorFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<Capability>& workingCopy,bool requireProgram){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& gate=Require(cap,CapKind::ExecutionGate);auto& copy=Require(workingCopy,CapKind::OwnedCleanCopy);
    AssertCapabilityCurrent(cap);AssertCapabilityCurrent(workingCopy);const auto row=gate.execution_;const auto& policy=EmbeddedProfile().execution;
    if(!row||row->owner_!=this||row->stage!=ExecutionCapture::Stage::Authorized||row->tool!=phase::ToolCode::RunAiAgentPlan||row->leaf!=ExecutionLeaf::StageVariant||
        row->slot<1||row->slot>2||copy.ownedFileSlot_!=row->slot||!data_->checkpoint||data_->checkpoint->stage!=Data::CheckpointFile::Stage::Accepted||
        data_->restorationDebts[row->slot-1]||policy.selectionMode!=TitleSelectionMode::FirstTwoObservedTextStatesV1||policy.rangeMode!=TitleRangeMode::FullObservedRootRangeV1)
        Refuse("trusted_original_stage_scope_copy_or_debt_refused");
    const auto restoreProgram=data_->preissuedRestorationPrograms[row->slot-1];
    if(requireProgram&&(!restoreProgram||restoreProgram->owner_!=this||restoreProgram->kind_!=CapKind::RestorationProgram||restoreProgram->spent_||restoreProgram->ownedFileSlot_!=row->slot||!restoreProgram->restorationProgram_||restoreProgram->restorationProgram_->stageGate!=cap||restoreProgram->restorationProgram_->unknown||restoreProgram->restorationProgram_->bound||restoreProgram->restorationProgram_->completed))
        Refuse("trusted_original_usable_restore_program_required");
    auto& manifest=RequireExecutionBaseline(row->originalManifest,row->currentRead);const auto& ownCopy=*data_->cleanCopies[row->slot-1];
    if(manifest.originalUiBaseline_.empty()||!OriginalUiRestoreSupported(ManifestJson(manifest.originalUiBaseline_)))Refuse("trusted_original_ui_restoration_operand_unsupported");
    if(ownCopy.gate->execution_->originalManifest!=row->originalManifest||!manifest.graphRead_||!manifest.compRead_||!manifest.graphRead_->project_||!manifest.compRead_->project_||
        manifest.graphRead_->project_->originalResult.empty()||manifest.compRead_->project_->originalResult.empty())Refuse("trusted_original_stage_full_manifest_receipts_required");
    const auto& variant=policy.variants[row->slot-1];if(ownCopy.name!=variant.workingName||ownCopy.sourceHash!=policy.sourceProject.sha256||!ownCopy.root->Current()||!ownCopy.file->Current())
        Refuse("trusted_original_stage_working_file_changed");
    try{auto existing=detail::Relative(ownCopy.root->directory.Get(),variant.snapshotName,false,false,false,false,true);(void)existing;Refuse("trusted_stage_final_snapshot_already_exists");}
    catch(const detail::Failure& absent){if(absent.error!=ERROR_FILE_NOT_FOUND||absent.unknown)throw;}
    const auto path=[&](const std::wstring& name){return policy.snapshotLocator+(policy.snapshotLocator.back()==L'\\'?L"":L"\\")+name;};
    auto graphFacts=ManifestJson(manifest.graphRead_->project_->originalResult),compFacts=ManifestJson(manifest.compRead_->project_->originalResult),uiFacts=ManifestJson(manifest.originalUiBaseline_);std::array<std::uint64_t,2> selected=manifest.selectedIds_;
    if(row->currentRead->project_->restoredCurrentSlot){const auto restored=row->currentRead->project_->restoredCurrentSlot;const auto current=ManifestJson(data_->restoredSourceReadbacks[restored-1]);graphFacts=current.Field("graph");uiFacts=current.Field("uiBaseline");selected={{CopyInteger(current.Field("selectedTextLayerIds").children[0]),CopyInteger(current.Field("selectedTextLayerIds").children[1])}};
        if(!row->currentRead->project_->preparationDelivery)Refuse("trusted_stage_restored_source_actual_dry_required");compFacts=ManifestJson(row->currentRead->project_->originalResult);if(ManifestCanonical(compFacts.Field("ownedCurrentStageState"))!=data_->restoredSourceReadbacks[restored-1])Refuse("trusted_stage_restored_source_dry_readback_changed");}
    const auto originalGraph=ManifestCanonical(graphFacts),originalComp=ManifestCanonical(compFacts),originalUi=ManifestCanonical(uiFacts);
    if(OriginalResultDepth(graphFacts)+6>capture::kOriginalResultDepth||OriginalResultDepth(uiFacts)+6>capture::kOriginalResultDepth)Refuse("trusted_stage_restore_c6_result_depth_does_not_fit");const auto uiBound=StageGraphResultUpperBound(uiFacts),graphBound=StageGraphResultUpperBound(graphFacts);
    if(uiBound>1048576||graphBound>1048576-uiBound)Refuse("trusted_stage_ui_graph_result_bound");const auto resultBound=graphBound+uiBound;
    const auto wrapperBound=16384+3*(ManifestQuote(ManifestUtf8(policy.sourceProjectLocator)).size()+ManifestQuote(ManifestUtf8(path(variant.workingName))).size()+ManifestQuote(ManifestUtf8(path(variant.snapshotName))).size());
    if(wrapperBound>1048576||resultBound>(1048576-wrapperBound)/3)Refuse("trusted_stage_three_intrinsic_graphs_do_not_fit");
    std::string text="{\"schema\":\"ae-agent.owned-native-stage-descriptor.v1\",\"operation\":\"stage\",\"slot\":"+std::to_string(row->slot)+
        ",\"manifestSha25664\":\""+ExecutionHex(manifest.state_.graphHash)+"\",\"scopeSha25664\":\""+ExecutionHex(row->scope)+"\",\"sourceProjectFile\":"+ManifestQuote(ManifestUtf8(policy.sourceProjectLocator))+
        ",\"workingProjectFile\":"+ManifestQuote(ManifestUtf8(path(variant.workingName)))+",\"snapshotProjectFile\":"+ManifestQuote(ManifestUtf8(path(variant.snapshotName)))+
        ",\"rootName\":"+ManifestQuote(ManifestUtf8(variant.rootName))+",\"compName\":"+ManifestQuote(ManifestUtf8(variant.compName))+",\"selectedTextLayerIds\":["+
        std::to_string(selected[0])+","+std::to_string(selected[1])+"],\"originalComp\":"+std::string(originalComp.begin(),originalComp.end())+
        ",\"originalGraph\":"+std::string(originalGraph.begin(),originalGraph.end())+",\"originalUi\":"+std::string(originalUi.begin(),originalUi.end())+"}";
    if(text.size()>1048576)Refuse("trusted_original_stage_descriptor_bound");AssertCapabilityCurrent(cap);AssertCapabilityCurrent(workingCopy);(void)RequireExecutionBaseline(row->originalManifest,row->currentRead);
    return Bytes(text.begin(),text.end());
}
std::shared_ptr<Capability> NativeClient::CaptureRestorationProgramFixed(const std::shared_ptr<Capability>& stageGate,const std::shared_ptr<Capability>& workingCopy,const std::string& prefix,const std::string& suffix){
    const auto descriptor=RestorationProgramDescriptorFixed(stageGate,workingCopy);const auto row=stageGate->execution_;const auto slot=row->slot;
    if(prefix.empty()||suffix.empty()||prefix.size()>1048576||suffix.size()>1048576-prefix.size()||prefix.find('\0')!=std::string::npos||suffix.find('\0')!=std::string::npos||data_->preissuedRestorationPrograms[slot-1])Refuse("trusted_original_restore_preissue_once_or_source_bound");
    const auto d=ManifestJson(descriptor);const auto graphBytes=StageGraphResultUpperBound(d.Field("originalGraph")),uiBytes=StageGraphResultUpperBound(d.Field("originalUi"));
    std::size_t uiRows=capture::Array(d.Field("originalUi").Field("items"),1000).size();for(const auto& comp:capture::Array(d.Field("originalUi").Field("comps"),1000))uiRows+=capture::Array(comp.Field("layers"),1000).size();
    if(graphBytes>1048576/3||uiBytes>1048576/5||3*graphBytes+5*uiBytes+128*uiRows+32768>1048576)Refuse("trusted_original_restore_intrinsic_result_does_not_fit");
    auto program=std::make_shared<RestorationProgramCapture>(this);program->slot=slot;program->restoreScope=FixedExecutionScope(EmbeddedProfile().execution,slot,ExecutionLeaf::RestoreBaseline);
    program->manifest=row->manifest;program->descriptor=descriptor;program->originalPrefix=prefix;program->originalSuffix=suffix;program->prefixHash=detail::Hash(Bytes(prefix.begin(),prefix.end()));
    program->stageGate=stageGate;program->workingCopy=workingCopy;program->originalManifest=row->originalManifest;program->actor=row->actor;
    (void)RestorationProgramDescriptorFixed(stageGate,workingCopy);auto cap=Own(CapKind::RestorationProgram,stageGate->frame_);cap->ownedFileSlot_=slot;cap->restorationProgram_=program;data_->preissuedRestorationPrograms[slot-1]=cap;return cap;
}
Bytes NativeClient::RestorationDeliveryDescriptorFixed(const std::shared_ptr<Capability>& restoreGate,const std::shared_ptr<Capability>& programCap){
    RequireRole(Role::Daemon);auto& gate=Require(restoreGate,CapKind::ExecutionGate);auto& own=Require(programCap,CapKind::RestorationProgram);AssertCapabilityCurrent(restoreGate);AssertCapabilityCurrent(programCap);
    const auto row=gate.execution_;const auto program=own.restorationProgram_;if(!row||!program||program->owner!=this||program->unknown||program->bound||program->completed||program->slot<1||program->slot>2||
        row->slot!=program->slot||row->leaf!=ExecutionLeaf::RestoreBaseline||row->scope!=program->restoreScope||row->originalManifest!=program->originalManifest||row->manifest!=program->manifest||row->actor!=program->actor||program->actor!=data_->observationActor||
        data_->preissuedRestorationPrograms[program->slot-1]!=programCap)Refuse("trusted_original_restore_gate_preissue_join");
    const auto& debt=data_->restorationDebts[program->slot-1];const auto& saved=data_->savedSnapshots[program->slot-1];if(!debt||debt->state!=Data::RestorationDebt::State::StageTerminal||!debt->effectSelected||debt->stageGate!=program->stageGate||debt->workingCopy!=program->workingCopy||
        !saved||saved->unknown||!saved->file||!saved->root||!saved->file->Current()||!saved->root->Current()||data_->restorationReceipts[program->slot-1])Refuse("trusted_original_restore_saved_debt_required");
    for(const auto& job:data_->originalJobs)if(job&&(job->owner_!=this||job->unknown_||job->stage_!=AmeOriginalJob::Stage::MediaAccepted))Refuse("trusted_original_restore_job_not_quiescent");
    (void)RequireFixedExecutionCurrent(row->originalManifest,row->currentRead,row->slot,row->leaf);AssertCapabilityCurrent(program->workingCopy);
    auto named=detail::Relative(saved->root->directory.Get(),EmbeddedProfile().execution.variants[program->slot-1].snapshotName,false,false,false,false,true);
    if(!detail::SamePin(detail::ReadPin(named.Get(),false),saved->pin)||detail::Hash(detail::ReadExact(named.Get(),134217728))!=saved->hash||detail::Hash(detail::ReadExact(saved->file->file.Get(),134217728))!=saved->hash||
        !data_->checkpoint||!data_->checkpoint->file->Current()||!data_->checkpoint->root->Current()||detail::Hash(detail::ReadExact(data_->checkpoint->file->file.Get(),134217728))!=EmbeddedProfile().execution.sourceProject.sha256)Refuse("trusted_original_restore_held_source_changed");
    const auto original=ManifestJson(program->descriptor),expected=ManifestJson(saved->actualPostSave);const auto o=ManifestCanonical(original),e=ManifestCanonical(expected);
    const auto text="{\"schema\":\"ae-agent.owned-native-restoration-delivery.v1\",\"slot\":"+std::to_string(program->slot)+",\"restoreScopeSha25664\":\""+ExecutionHex(program->restoreScope)+"\",\"original\":"+std::string(o.begin(),o.end())+",\"expectedCurrent\":"+std::string(e.begin(),e.end())+"}";
    if(text.size()>1048576)Refuse("trusted_original_restore_descriptor_bound");return ManifestCanonical(ManifestJson(Bytes(text.begin(),text.end())));
}
std::shared_ptr<Capability> NativeClient::BindRestorationDeliveryFixed(const std::shared_ptr<Capability>& restoreGate,const std::shared_ptr<Capability>& programCap,const std::string& source){
    const auto descriptor=RestorationDeliveryDescriptorFixed(restoreGate,programCap);auto& gate=Require(restoreGate,CapKind::ExecutionGate);const auto row=gate.execution_;const auto program=programCap->restorationProgram_;
    if(source.size()>1048576||source.find('\0')!=std::string::npos||source.size()<program->originalPrefix.size()+program->originalSuffix.size()||source.compare(0,program->originalPrefix.size(),program->originalPrefix)!=0||
        source.compare(source.size()-program->originalSuffix.size(),program->originalSuffix.size(),program->originalSuffix)!=0||data_->projects.size()>=kTwoTitleCalls||!data_->observationOrdinal||
        GetTickCount64()<data_->observationMono||GetTickCount64()-data_->observationMono>10000)Refuse("trusted_original_restore_program_bytes_or_actor_refused");
    const auto middle=source.substr(program->originalPrefix.size(),source.size()-program->originalPrefix.size()-program->originalSuffix.size());
    if(ManifestCanonical(ManifestJson(Bytes(middle.begin(),middle.end())))!=descriptor)Refuse("trusted_original_restore_actual_script_operand_changed");
    auto project=std::make_shared<ProjectCapture>();project->inspection=true;project->restorationDelivery=true;project->tool=phase::ToolCode::RunAiAgentPlan;
    project->executionGate=restoreGate;project->workingCopy=program->workingCopy;project->restorationProgram=programCap;project->originalHandler=row->originalHandler;project->originalManifest=row->originalManifest;project->baselineRead=row->currentRead;
    project->preparationDescriptor=descriptor;project->command=detail::RandomId();project->execution=detail::RandomId();project->lease=detail::RandomId();project->handler=row->handler;
    project->originalScript=source;project->script=detail::Hash(Bytes(source.begin(),source.end()));project->operationScope=program->restoreScope;
    project->snapshot=data_->observationSnapshot;project->context=data_->observationContext;project->transport=data_->observationTransport;project->actor=row->actor;project->observationOrdinal=data_->observationOrdinal;project->panelConnection=data_->panelConnection;project->panelGeneration=data_->panelGeneration;
    program->bound=true;program->restoreCommand=project;data_->projects.push_back(project);
    Bytes bind(gate.frame_.payload.begin(),gate.frame_.payload.begin()+40);detail::PutU16(bind,static_cast<std::uint16_t>(row->tool));detail::PutU16(bind,static_cast<std::uint16_t>(phase::ChildRole::Execute));
    Put(bind,project->command);Put(bind,project->execution);Put(bind,project->lease);Put(bind,Id{});Put(bind,program->restoreScope);Put(bind,project->script);bind.resize(204,0);bind.push_back(static_cast<unsigned char>(phase::DeliveryClass::Execute));
    gate.spent_=true;try{auto command=Own(CapKind::Command,Exchange(phase::Verb::BindCommand,bind));project->expiry=Number(command->frame_.payload.data()+32,8);command->project_=project;command->ingress_=row->originalHandler->ingress_;return command;}
    catch(...){project->stage=ProjectCapture::Stage::Unknown;program->unknown=true;data_->restorationDebts[program->slot-1]->state=Data::RestorationDebt::State::Unknown;data_->unknown=true;throw;}
}
bool NativeClient::IsRestorationCommand(const std::shared_ptr<Capability>& command){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();if(!command||command->owner_!=this||!command->project_||std::find(data_->projects.begin(),data_->projects.end(),command->project_)==data_->projects.end())Refuse("trusted_original_restore_command_required");return command->project_->restorationDelivery;}
void NativeClient::AssertRestorationDispatchCurrent(const std::shared_ptr<ProjectCapture>& original){
    AssertLoadedNodeCurrent();if(!original||!original->restorationDelivery||!original->restorationProgram||!original->executionGate||!original->executionGate->execution_)Refuse("trusted_original_restore_dispatch_row_required");
    const auto program=original->restorationProgram->restorationProgram_;const auto row=original->executionGate->execution_;const auto now=GetTickCount64();
    if(!program||program->owner!=this||program->unknown||program->completed||!program->bound||program->restoreCommand!=original||row->owner_!=this||row->leaf!=ExecutionLeaf::RestoreBaseline||row->slot!=program->slot||row->scope!=program->restoreScope||
        row->actor!=data_->observationActor||original->actor!=program->actor||row->actor!=program->actor||row->stage!=ExecutionCapture::Stage::Authorized||now>=row->expiry||now>=original->expiry)Refuse("trusted_original_restore_dispatch_current_refused");
    const auto& debt=data_->restorationDebts[program->slot-1];const auto& saved=data_->savedSnapshots[program->slot-1];
    if(!debt||debt->state!=Data::RestorationDebt::State::StageTerminal||!debt->effectSelected||debt->stageGate!=program->stageGate||!saved||saved->unknown||!saved->file->Current()||!saved->root->Current())Refuse("trusted_original_restore_dispatch_debt_changed");
    for(const auto& job:data_->originalJobs)if(job&&(job->unknown_||job->stage_!=AmeOriginalJob::Stage::MediaAccepted))Refuse("trusted_original_restore_dispatch_active_job");
    AssertCapabilityCurrent(program->workingCopy);(void)RequireFixedExecutionCurrent(row->originalManifest,row->currentRead,row->slot,row->leaf);
    (void)OriginalRequestBody(row->originalPanelRequest);(void)OriginalRequestBody(row->originalHandler->ingress_);
}
std::shared_ptr<Capability> NativeClient::BindStageDeliveryFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<Capability>& workingCopy,const std::string& originalGeneratedSource){
    const auto descriptor=StageOperationDescriptorFixed(cap,workingCopy);auto& gate=Require(cap,CapKind::ExecutionGate);const auto row=gate.execution_;
    if(originalGeneratedSource.empty()||originalGeneratedSource.size()>1048576||originalGeneratedSource.find('\0')!=std::string::npos||data_->projects.size()>=kTwoTitleCalls||
        data_->observationActor!=row->actor||!data_->observationOrdinal||GetTickCount64()<data_->observationMono||GetTickCount64()-data_->observationMono>10000)
        Refuse("trusted_original_stage_source_or_actor_refused");
    auto project=std::make_shared<ProjectCapture>();project->inspection=true;project->stageDelivery=true;project->tool=phase::ToolCode::RunAiAgentPlan;
    project->executionGate=cap;project->workingCopy=workingCopy;project->originalHandler=row->originalHandler;project->originalManifest=row->originalManifest;project->baselineRead=row->currentRead;
    project->restorationProgram=data_->preissuedRestorationPrograms[row->slot-1];project->preparationDescriptor=descriptor;project->command=detail::RandomId();project->execution=detail::RandomId();project->lease=detail::RandomId();project->handler=row->handler;
    project->originalScript=originalGeneratedSource;project->script=detail::Hash(Bytes(originalGeneratedSource.begin(),originalGeneratedSource.end()));project->operationScope=row->scope;
    project->snapshot=data_->observationSnapshot;project->context=data_->observationContext;project->transport=data_->observationTransport;project->actor=row->actor;
    project->observationOrdinal=data_->observationOrdinal;project->panelConnection=data_->panelConnection;project->panelGeneration=data_->panelGeneration;
    auto debt=std::make_unique<Data::RestorationDebt>();debt->slot=row->slot;debt->stageGate=cap;debt->workingCopy=workingCopy;debt->stageCommand=project;debt->exactDescriptor=descriptor;
    debt->descriptorHash=detail::Hash(descriptor);debt->actor=row->actor;data_->restorationDebts[row->slot-1]=std::move(debt);data_->projects.push_back(project);
    Bytes bind(gate.frame_.payload.begin(),gate.frame_.payload.begin()+40);detail::PutU16(bind,static_cast<std::uint16_t>(row->tool));detail::PutU16(bind,static_cast<std::uint16_t>(phase::ChildRole::Execute));
    Put(bind,project->command);Put(bind,project->execution);Put(bind,project->lease);Put(bind,Id{});Put(bind,row->scope);Put(bind,project->script);bind.resize(204,0);bind.push_back(static_cast<unsigned char>(phase::DeliveryClass::Execute));
    gate.spent_=true;try{auto command=Own(CapKind::Command,Exchange(phase::Verb::BindCommand,bind));project->expiry=Number(command->frame_.payload.data()+32,8);command->project_=project;command->ingress_=row->originalHandler->ingress_;return command;}
    catch(...){project->stage=ProjectCapture::Stage::Unknown;data_->restorationDebts[row->slot-1]->state=Data::RestorationDebt::State::Unknown;data_->unknown=true;throw;}
}
bool NativeClient::IsStageCommand(const std::shared_ptr<Capability>& command){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(!command||command->owner_!=this||!command->project_||std::find(data_->projects.begin(),data_->projects.end(),command->project_)==data_->projects.end())Refuse("trusted_original_stage_command_required");return command->project_->stageDelivery;
}
namespace {
void OriginalRestoredUiJoin(const capture::Json& original,const capture::Json& after,const capture::Json& actualUi){
    capture::Fields(actualUi,{"before","after","projectItemIdMap","layerIdMap"});if(ManifestCanonical(actualUi.Field("after"))!=ManifestCanonical(after))Refuse("trusted_restore_actual_ui_readback_join",0,true);
    auto expected=original;CopyIds items,layers;const auto& beforeItems=capture::Array(original.Field("items"),1000);const auto& afterItems=capture::Array(after.Field("items"),1000);
    const auto& itemMap=capture::Array(actualUi.Field("projectItemIdMap"),1000);if(beforeItems.size()!=afterItems.size()||itemMap.size()!=beforeItems.size())Refuse("trusted_restore_ui_complete_item_mapping",0,true);
    for(std::size_t i=0;i<beforeItems.size();++i){capture::Fields(itemMap[i],{"originalId","reopenedId"});if(CopyInteger(itemMap[i].Field("originalId"))!=CopyInteger(beforeItems[i].Field("id"))||CopyInteger(itemMap[i].Field("reopenedId"))!=CopyInteger(afterItems[i].Field("id")))Refuse("trusted_restore_ui_original_item_mapping",0,true);
        CopyMerge(items,CopyInteger(beforeItems[i].Field("id")),CopyInteger(afterItems[i].Field("id")));CopySetInteger(MutableField(MutableField(expected,"items").children[i],"id"),CopyInteger(afterItems[i].Field("id")));}
    for(auto& id:MutableField(expected,"projectSelectionIds").children)CopySetInteger(id,CopyMapped(items,CopyInteger(id)));
    auto& active=MutableField(expected,"activeItem");if(active.kind!=capture::Json::Kind::Null)CopySetInteger(MutableField(active,"id"),CopyMapped(items,CopyInteger(active.Field("id"))));
    const auto& beforeComps=capture::Array(original.Field("comps"),1000);const auto& afterComps=capture::Array(after.Field("comps"),1000);const auto& layerMap=capture::Array(actualUi.Field("layerIdMap"),1000);
    if(beforeComps.size()!=afterComps.size())Refuse("trusted_restore_ui_complete_comp_mapping",0,true);std::size_t ordinal=0;
    for(std::size_t i=0;i<beforeComps.size();++i){const auto& before=beforeComps[i];const auto& current=afterComps[i];auto& comp=MutableField(expected,"comps").children[i];
        const auto oldComp=CopyInteger(before.Field("id")),newComp=CopyMapped(items,oldComp);if(newComp!=CopyInteger(current.Field("id")))Refuse("trusted_restore_ui_comp_mapping",0,true);CopySetInteger(MutableField(comp,"id"),newComp);
        const auto& oldLayers=capture::Array(before.Field("layers"),1000);const auto& newLayers=capture::Array(current.Field("layers"),1000);if(oldLayers.size()!=newLayers.size())Refuse("trusted_restore_ui_layer_count",0,true);
        for(std::size_t j=0;j<oldLayers.size();++j){if(ordinal>=layerMap.size())Refuse("trusted_restore_ui_layer_map_truncated",0,true);const auto& map=layerMap[ordinal++];capture::Fields(map,{"originalCompId","reopenedCompId","originalId","reopenedId"});
            const auto oldId=CopyInteger(oldLayers[j].Field("id")),newId=CopyInteger(newLayers[j].Field("id"));if(CopyInteger(map.Field("originalCompId"))!=oldComp||CopyInteger(map.Field("reopenedCompId"))!=newComp||CopyInteger(map.Field("originalId"))!=oldId||CopyInteger(map.Field("reopenedId"))!=newId)Refuse("trusted_restore_ui_actual_layer_map",0,true);
            CopyMerge(layers,oldId,newId);CopySetInteger(MutableField(MutableField(comp,"layers").children[j],"id"),newId);}
        for(auto& id:MutableField(comp,"selectedLayerIds").children)CopySetInteger(id,CopyMapped(layers,CopyInteger(id)));
    }
    if(ordinal!=layerMap.size()||ManifestCanonical(expected)!=ManifestCanonical(after))Refuse("trusted_restore_independent_all_ui_equality",0,true);
}
}
void NativeClient::ValidateOriginalRestorationResult(const std::shared_ptr<ProjectCapture>& original,const Bytes& actualResult){
    AssertLoadedNodeCurrent();if(!original||!original->restorationDelivery||original->stage!=ProjectCapture::Stage::Submitted||!original->restorationProgram||!original->executionGate||actualResult.empty())Refuse("trusted_restore_original_successful_result_required",0,true);
    const auto program=original->restorationProgram->restorationProgram_;const auto gate=original->executionGate->execution_;const auto now=GetTickCount64();
    if(!program||program->owner!=this||program->unknown||program->completed||!program->effectSelected||program->restoreCommand!=original||program->slot<1||program->slot>2||!gate||gate->actor!=data_->observationActor||program->actor!=gate->actor||now>=original->expiry)Refuse("trusted_restore_original_program_actor_join",0,true);
    const auto& debt=data_->restorationDebts[program->slot-1];const auto& saved=data_->savedSnapshots[program->slot-1];if(!debt||debt->state!=Data::RestorationDebt::State::StageTerminal||!saved||saved->unknown||data_->restorationReceipts[program->slot-1])Refuse("trusted_restore_original_live_debt_required",0,true);
    const auto descriptor=ManifestJson(original->preparationDescriptor),source=ManifestJson(program->descriptor),result=ManifestJson(actualResult);capture::Fields(result,{"schema","operation","slot","sourceProjectFile","before","reopened","after","ui"});
    if(result.Field("schema").Text()!="ae-agent.owned-native-restoration-result.v1"||result.Field("operation").Text()!="restore"||CopyInteger(result.Field("slot"))!=program->slot||result.Field("sourceProjectFile").Text()!=source.Field("sourceProjectFile").Text()||
        ManifestCanonical(result.Field("before"))!=saved->actualPostSave||ManifestCanonical(descriptor.Field("expectedCurrent"))!=saved->actualPostSave)Refuse("trusted_restore_actual_before_or_selector_changed",0,true);
    const auto validate=[&](const capture::Json& row){capture::Fields(row,{"graph","sourceGuid","selectedTextLayerIds","compItemId","rootCompItemId","projectFile","revision","dirty","uiBaseline"});
        if(capture::Boolean(row.Field("dirty"))||row.Field("projectFile").Text()!=source.Field("sourceProjectFile").Text()||row.Field("graph").Field("projectFile").Text()!=row.Field("projectFile").Text()||CopyInteger(row.Field("revision"))!=CopyInteger(row.Field("graph").Field("revision"))||
            CopyInteger(row.Field("compItemId"))!=CopyInteger(row.Field("graph").Field("variantCompItemId"))||CopyInteger(row.Field("rootCompItemId"))!=CopyInteger(row.Field("graph").Field("rootCompItemId")))Refuse("trusted_restore_actual_source_graph_join",0,true);
        const auto& ids=capture::Array(row.Field("selectedTextLayerIds"),2);if(ids.size()!=2||!CopyInteger(ids[0])||!CopyInteger(ids[1])||CopyInteger(ids[0])==CopyInteger(ids[1]))Refuse("trusted_restore_actual_pair_identity",0,true);
        std::size_t target=0;for(const auto& inventory:capture::Array(row.Field("graph").Field("ownedTitleInventories"),100))if(CopyInteger(inventory.Field("compItemId"))==CopyInteger(row.Field("compItemId"))){ValidateOriginalUiBaseline(row.Field("uiBaseline"),inventory);
            const auto pair=capture::FirstTwoObserved(inventory,0,row.Field("graph").Field("duration").Real());if(pair.states[0].id!=CopyInteger(ids[0])||pair.states[1].id!=CopyInteger(ids[1]))Refuse("trusted_restore_actual_pair_inventory",0,true);++target;}if(target!=1)Refuse("trusted_restore_unique_actual_target",0,true);
    };
    validate(result.Field("reopened"));validate(result.Field("after"));const std::array<std::uint64_t,2> selected{{CopyInteger(source.Field("selectedTextLayerIds").children[0]),CopyInteger(source.Field("selectedTextLayerIds").children[1])}};
    CopyGraphJoin(source.Field("originalGraph"),result.Field("reopened").Field("graph"),selected,0,source.Field("sourceProjectFile").Text(),true);
    CopyGraphJoin(source.Field("originalGraph"),result.Field("after").Field("graph"),selected,0,source.Field("sourceProjectFile").Text(),true);
    if(ManifestCanonical(result.Field("ui").Field("before"))!=ManifestCanonical(result.Field("reopened").Field("uiBaseline")))Refuse("trusted_restore_actual_reopened_ui_origin",0,true);
    OriginalRestoredUiJoin(source.Field("originalUi"),result.Field("after").Field("uiBaseline"),result.Field("ui"));
    // Re-reading the held originals and the exact named snapshot is intrinsic
    // completion evidence, before D20 and debt clear. No filename adoption.
    std::size_t sourcePins=0;for(const auto& file:data_->files)if(detail::SamePin(file->approved.pin,EmbeddedProfile().execution.sourceProject.pin)){if(!file->Current()||detail::Hash(detail::ReadExact(file->file.Get(),134217728))!=EmbeddedProfile().execution.sourceProject.sha256)Refuse("trusted_restore_original_source_hash_changed",0,true);++sourcePins;}
    if(sourcePins!=1||!saved->file->Current()||!saved->root->Current()||detail::Hash(detail::ReadExact(saved->file->file.Get(),134217728))!=saved->hash||!data_->checkpoint->root->Current()||!data_->checkpoint->file->Current()||detail::Hash(detail::ReadExact(data_->checkpoint->file->file.Get(),134217728))!=EmbeddedProfile().execution.sourceProject.sha256)Refuse("trusted_restore_physical_source_or_snapshot_changed",0,true);
    auto named=detail::Relative(saved->root->directory.Get(),EmbeddedProfile().execution.variants[program->slot-1].snapshotName,false,false,false,false,true);if(!detail::SamePin(detail::ReadPin(named.Get(),false),saved->pin)||detail::Hash(detail::ReadExact(named.Get(),134217728))!=saved->hash)Refuse("trusted_restore_named_snapshot_changed",0,true);
    AssertCapabilityCurrent(program->workingCopy);(void)OriginalRequestBody(gate->originalPanelRequest);(void)OriginalRequestBody(gate->originalHandler->ingress_);program->restoredAfter=ManifestCanonical(result.Field("after"));
}
void NativeClient::ValidateOriginalStageResult(const std::shared_ptr<ProjectCapture>& original,const Bytes& actualResult){
    AssertLoadedNodeCurrent();if(!original||!original->stageDelivery||original->stage!=ProjectCapture::Stage::Submitted||!original->executionGate||!original->executionGate->execution_||
        GetTickCount64()>=original->expiry||actualResult.empty())Refuse("trusted_stage_original_successful_result_required",0,true);
    const auto gate=original->executionGate->execution_;const auto slot=gate->slot;const auto& policy=EmbeddedProfile().execution;
    if(slot<1||slot>2||!data_->restorationDebts[slot-1]||data_->restorationDebts[slot-1]->stageCommand!=original||!data_->restorationDebts[slot-1]->effectSelected||
        data_->restorationDebts[slot-1]->state!=Data::RestorationDebt::State::Selected||gate->actor!=data_->observationActor||gate->stage!=ExecutionCapture::Stage::Authorized)
        Refuse("trusted_stage_original_debt_or_actor_join",0,true);
    const auto result=ManifestJson(actualResult),descriptor=ManifestJson(original->preparationDescriptor);
    capture::Fields(result,{"schema","operation","slot","sourceProjectFile","workingProjectFile","snapshotProjectFile","before","working","postSave"});
    if(result.Field("schema").Text()!="ae-agent.owned-native-stage-result.v1"||result.Field("operation").Text()!="stage"||CopyInteger(result.Field("slot"))!=slot)
        Refuse("trusted_stage_original_result_scope",0,true);
    for(const auto* path:{"sourceProjectFile","workingProjectFile","snapshotProjectFile"})if(result.Field(path).Text()!=descriptor.Field(path).Text())Refuse("trusted_stage_original_result_paths",0,true);
    const auto validate=[&](const capture::Json& row,const char* path){capture::Fields(row,{"graph","sourceGuid","selectedTextLayerIds","compItemId","rootCompItemId","projectFile","revision","dirty","uiBaseline"});
        if(capture::Boolean(row.Field("dirty"))||row.Field("projectFile").Text()!=descriptor.Field(path).Text()||row.Field("graph").Field("projectFile").Text()!=row.Field("projectFile").Text()||
            CopyInteger(row.Field("revision"))!=CopyInteger(row.Field("graph").Field("revision"))||CopyInteger(row.Field("compItemId"))!=CopyInteger(row.Field("graph").Field("variantCompItemId"))||
            CopyInteger(row.Field("rootCompItemId"))!=CopyInteger(row.Field("graph").Field("rootCompItemId")))Refuse("trusted_stage_original_result_record_join",0,true);
        const auto& ids=capture::Array(row.Field("selectedTextLayerIds"),2);if(ids.size()!=2||!CopyInteger(ids[0])||!CopyInteger(ids[1])||CopyInteger(ids[0])==CopyInteger(ids[1]))Refuse("trusted_stage_original_result_selected_ids",0,true);
        std::size_t targetCount=0;for(const auto& inventory:capture::Array(row.Field("graph").Field("ownedTitleInventories"),100))if(CopyInteger(inventory.Field("compItemId"))==CopyInteger(row.Field("compItemId"))){
            ValidateOriginalUiBaseline(row.Field("uiBaseline"),inventory);
            const auto selected=capture::FirstTwoObserved(inventory,0,row.Field("graph").Field("duration").Real());if(selected.states[0].id!=CopyInteger(ids[0])||selected.states[1].id!=CopyInteger(ids[1])||
                selected.revision!=CopyInteger(row.Field("revision"))||selected.projectFile!=row.Field("projectFile").Text())Refuse("trusted_stage_original_result_selection_census",0,true);++targetCount;}
        if(targetCount!=1)Refuse("trusted_stage_original_result_unique_target",0,true);};
    validate(result.Field("before"),"sourceProjectFile");validate(result.Field("working"),"workingProjectFile");validate(result.Field("postSave"),"snapshotProjectFile");
    auto originalGuid=descriptor.Field("originalComp").Field("dynamicLinkGUID").Text();std::transform(originalGuid.begin(),originalGuid.end(),originalGuid.begin(),[](unsigned char c){return static_cast<char>(c>='A'&&c<='F'?c-'A'+'a':c);});
    const auto& before=result.Field("before");if(ManifestCanonical(before.Field("graph"))!=ManifestCanonical(descriptor.Field("originalGraph"))||
        ManifestCanonical(before.Field("uiBaseline"))!=ManifestCanonical(descriptor.Field("originalUi"))||before.Field("sourceGuid").Text()!=originalGuid)
        Refuse("trusted_stage_actual_source_baseline_drift",0,true);
    const std::array<std::uint64_t,2> selected{{CopyInteger(descriptor.Field("selectedTextLayerIds").children[0]),CopyInteger(descriptor.Field("selectedTextLayerIds").children[1])}};
    CopyGraphJoin(before.Field("graph"),result.Field("working").Field("graph"),selected,0,descriptor.Field("workingProjectFile").Text());
    CopyGraphJoin(before.Field("graph"),result.Field("postSave").Field("graph"),selected,slot,descriptor.Field("snapshotProjectFile").Text());
    AssertCapabilityCurrent(original->workingCopy);if(!data_->checkpoint->root->Current()||!data_->checkpoint->file->Current()||
        detail::Hash(detail::ReadExact(data_->checkpoint->file->file.Get(),134217728))!=policy.sourceProject.sha256)Refuse("trusted_stage_actual_original_checkpoint_changed",0,true);
    (void)OriginalRequestBody(gate->originalPanelRequest);(void)OriginalRequestBody(gate->originalHandler->ingress_);
}
std::shared_ptr<Capability> NativeClient::CaptureOwnedSavedSnapshotFixed(const std::shared_ptr<Capability>& terminal){
    RequireRole(Role::Daemon);auto& own=Require(terminal,CapKind::Terminal);AssertCapabilityCurrent(terminal);const auto project=own.project_;
    if(!project||!project->stageDelivery||project->stage!=ProjectCapture::Stage::Terminal||!project->executionGate||!project->executionGate->execution_||!project->terminalMono||
        GetTickCount64()<project->terminalMono||GetTickCount64()-project->terminalMono>10000||GetTickCount64()>=project->expiry)Refuse("trusted_owned_saved_snapshot_successful_stage_terminal_required");
    const auto gate=project->executionGate->execution_;const auto slot=gate->slot;const auto& policy=EmbeddedProfile().execution;
    if(slot<1||slot>2||data_->savedSnapshots[slot-1]||!data_->restorationDebts[slot-1]||data_->restorationDebts[slot-1]->state!=Data::RestorationDebt::State::StageTerminal||
        data_->restorationDebts[slot-1]->stageCommand!=project||data_->restorationDebts[slot-1]->stageTerminal!=detail::Hash(project->originalResult))Refuse("trusted_owned_saved_snapshot_original_stage_join");
    auto saved=std::make_unique<Data::SavedSnapshot>();saved->slot=slot;saved->stageTerminal=terminal;saved->workingCopy=project->workingCopy;saved->terminalRef=Fixed<16>(own.frame_.payload.data()+1);
    const auto result=ManifestJson(project->originalResult);const auto& post=result.Field("postSave");saved->actualPostSave=ManifestCanonical(post);saved->guid=post.Field("sourceGuid").Text();
    saved->compId=CopyInteger(post.Field("compItemId"));saved->rootId=CopyInteger(post.Field("rootCompItemId"));saved->revision=CopyInteger(post.Field("revision"));saved->stageReceipt=project->receipt;
    saved->root=std::make_unique<CheckedDirectory>(policy.snapshotRoot);data_->savedSnapshots[slot-1]=std::move(saved);auto& retained=*data_->savedSnapshots[slot-1];
    try{auto file=detail::Relative(retained.root->directory.Get(),policy.variants[slot-1].snapshotName,false,false,false,false,true);std::uint64_t bytes=0;
        retained.pin=detail::ReadPin(file.Get(),false,&bytes);if(!bytes||bytes>134217728||retained.pin.canonicalPath!=policy.snapshotRoot.canonicalPath+L"\\"+policy.variants[slot-1].snapshotName||
            detail::SamePin(retained.pin,policy.sourceProject.pin)||detail::SamePin(retained.pin,data_->checkpoint->createdPin))Refuse("trusted_owned_saved_snapshot_physical_identity",0,true);
        for(const auto& working:data_->cleanCopies)if(working&&detail::SamePin(retained.pin,working->createdPin))Refuse("trusted_owned_saved_snapshot_working_alias",0,true);
        for(const auto& other:data_->savedSnapshots)if(other&&other.get()!=&retained&&!detail::Zero(other->pin.fileId)&&detail::SamePin(retained.pin,other->pin))Refuse("trusted_owned_saved_snapshot_other_slot_alias",0,true);
        const auto content=detail::ReadExact(file.Get(),134217728);if(content.size()!=bytes)Refuse("trusted_owned_saved_snapshot_read_length",0,true);retained.hash=detail::Hash(content);
        reviewed::File pinned;pinned.pin=retained.pin;pinned.sha256=retained.hash;retained.file=std::make_unique<CheckedFile>(pinned);auto named=detail::Relative(retained.root->directory.Get(),policy.variants[slot-1].snapshotName,false,false,false,false,true);
        if(!retained.root->Current()||!retained.file->Current()||!detail::SamePin(detail::ReadPin(named.Get(),false),retained.pin)||detail::Hash(detail::ReadExact(named.Get(),134217728))!=retained.hash||
            !detail::SamePin(detail::ReadPin(file.Get(),false),retained.pin)||detail::Hash(detail::ReadExact(file.Get(),134217728))!=retained.hash||GetTickCount64()>=project->expiry)
            Refuse("trusted_owned_saved_snapshot_original_named_readback",0,true);
        AssertCapabilityCurrent(project->workingCopy);AssertCapabilityCurrent(terminal);auto snapshot=Own(CapKind::OwnedSavedSnapshot,own.frame_);snapshot->ownedFileSlot_=slot;snapshot->project_=project;AssertCapabilityCurrent(snapshot);return snapshot;
    }catch(...){retained.unknown=true;data_->restorationDebts[slot-1]->state=Data::RestorationDebt::State::Unknown;data_->unknown=true;throw;}
}
Bytes NativeClient::DescribeOwnedSavedSnapshotFixed(const std::shared_ptr<Capability>& snapshot){RequireRole(Role::Daemon);(void)Require(snapshot,CapKind::OwnedSavedSnapshot);AssertCapabilityCurrent(snapshot);const auto& saved=*data_->savedSnapshots[snapshot->ownedFileSlot_-1];
    const auto& policy=EmbeddedProfile().execution;const auto path=policy.snapshotLocator+(policy.snapshotLocator.back()==L'\\'?L"":L"\\")+policy.variants[saved.slot-1].snapshotName;
    const auto text="{\"schema\":\"ae-agent.owned-native-saved-snapshot.v1\",\"slot\":"+std::to_string(saved.slot)+",\"file\":"+ManifestQuote(ManifestUtf8(path))+",\"sha25664\":\""+ExecutionHex(saved.hash)+
        "\",\"sourceGuid\":"+ManifestQuote(saved.guid)+",\"compItemId\":"+std::to_string(saved.compId)+",\"rootCompItemId\":"+std::to_string(saved.rootId)+",\"revision\":"+std::to_string(saved.revision)+
        ",\"stageReceiptSha25664\":\""+ExecutionHex(saved.stageReceipt)+"\",\"idsOrGuidPreserved\":false,\"replayAllowed\":false}";return Bytes(text.begin(),text.end());
}
std::shared_ptr<Capability> NativeClient::ExecuteOwnedCheckpointFixed(const std::shared_ptr<Capability>& cap){
    return ExecuteOwnedFileFixed(cap,ExecutionLeaf::OwnedCheckpoint);
}
std::shared_ptr<Capability> NativeClient::ExecuteOwnedCleanCopyFixed(const std::shared_ptr<Capability>& cap){
    return ExecuteOwnedFileFixed(cap,ExecutionLeaf::CleanCopy);
}
std::shared_ptr<Capability> NativeClient::ExecuteOwnedFileFixed(const std::shared_ptr<Capability>& cap,ExecutionLeaf leaf){
    // Native-only kernel. No N-API ingress is mapped until the complete fixed
    // EXEC/budget/restoration consumers are source-reviewed and bound.
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& gate=Require(cap,CapKind::ExecutionGate);AssertCapabilityCurrent(cap);const auto row=gate.execution_;
    const auto& policy=EmbeddedProfile().execution;ExecutionCost worst;const bool checkpoint=leaf==ExecutionLeaf::OwnedCheckpoint;
    if((!checkpoint&&leaf!=ExecutionLeaf::CleanCopy)||!policy.Validate(worst)||!row||row->owner_!=this||row->tool!=phase::ToolCode::RunAiAgentPlan||
        (checkpoint?row->slot!=0:row->slot<1||row->slot>2)||row->leaf!=leaf||row->scope!=FixedExecutionScope(policy,row->slot,leaf))Refuse("trusted_fixed_file_selector_required");
    auto& destination=checkpoint?data_->checkpoint:data_->cleanCopies[row->slot-1];if(destination)Refuse("trusted_fixed_file_once_required");
    const auto& name=checkpoint?policy.checkpointName:policy.variants[row->slot-1].workingName;
    if(!checkpoint){if(!data_->checkpoint||data_->checkpoint->stage!=Data::CheckpointFile::Stage::Accepted||!data_->checkpoint->file||!data_->checkpoint->file->Current())Refuse("trusted_copy_actual_checkpoint_before_file_required");
        if(row->slot==2&&(!data_->originalJobs[0]||data_->originalJobs[0]->stage_!=AmeOriginalJob::Stage::MediaAccepted||!data_->restorationReceipts[0]))Refuse("trusted_copy_slot2_requires_original_media_and_restoration");
        if(row->slot==2){AssertOriginalJobObservationCurrent(data_->originalJobs[0]);AssertCapabilityCurrent(data_->restorationReceipts[0]);}}
    auto& manifest=RequireExecutionBaseline(row->originalManifest,row->currentRead);if(!manifest.state_.savedClean||manifest.state_.projectHash!=policy.sourceProject.sha256||
        !detail::SamePin(manifest.state_.project,policy.sourceProject.pin))Refuse("trusted_checkpoint_actual_clean_RAM_source_required");
    auto original=std::make_unique<CheckedFile>(policy.sourceProject);const auto sourceBytes=detail::ReadExact(original->file.Get(),134217728);
    if(sourceBytes.empty()||detail::Hash(sourceBytes)!=policy.sourceProject.sha256)Refuse("trusted_checkpoint_original_source_bytes_refused");
    auto pending=std::make_unique<Data::CheckpointFile>();pending->gate=cap;pending->root=std::make_unique<CheckedDirectory>(policy.snapshotRoot);pending->sourceHash=policy.sourceProject.sha256;pending->name=name;pending->slot=row->slot;
    try{auto existing=detail::Relative(pending->root->directory.Get(),name,false,false,false,false,true);(void)existing;Refuse("trusted_checkpoint_destination_already_exists");}
    catch(const detail::Failure& absent){if(absent.error!=ERROR_FILE_NOT_FOUND||absent.unknown)throw;}
    const auto boundary=[&](){AssertLoadedNodeCurrent();if(row->owner_!=this||row->stage!=ExecutionCapture::Stage::Authorized||row->actor!=data_->observationActor||GetTickCount64()>=row->expiry||
        std::find(data_->executionCaptures.begin(),data_->executionCaptures.end(),row)==data_->executionCaptures.end()||!destination||destination->name!=name||destination->slot!=row->slot||!destination->root->Current()||!original->Current()||
        detail::Hash(detail::ReadExact(original->file.Get(),134217728))!=policy.sourceProject.sha256)Refuse("trusted_checkpoint_original_boundary_changed",0,true);
        (void)OriginalRequestBody(row->originalPanelRequest);(void)OriginalRequestBody(row->originalHandler->ingress_);(void)RequireExecutionBaseline(row->originalManifest,row->currentRead);};
    destination=std::move(pending);auto& created=*destination;gate.spent_=true;
    try{boundary();const auto command=detail::RandomId(),execution=detail::RandomId(),lease=detail::RandomId();
        Bytes program;Put(program,policy.policyHash);Put(program,policy.typedProducerHash);Put(program,checkpoint?policy.checkpointLeaf:policy.cleanCopyLeaf);detail::PutPin(program,policy.sourceProject.pin);Put(program,policy.sourceProject.sha256);
        detail::PutPin(program,policy.snapshotRoot);Put(program,ManifestUtf8(name));detail::PutU16(program,row->slot);detail::PutU16(program,static_cast<std::uint16_t>(leaf));Put(program,manifest.state_.graphHash);detail::PutU64(program,manifest.nativeRevision_);
        const auto leafProgram=DomainHash(checkpoint?"lcp2.production.fixed-clean-RAM-checkpoint.v1":"lcp2.production.fixed-clean-source-copy.v1",program);
        Bytes bind(gate.frame_.payload.begin(),gate.frame_.payload.begin()+40);detail::PutU16(bind,static_cast<std::uint16_t>(row->tool));detail::PutU16(bind,static_cast<std::uint16_t>(phase::ChildRole::Execute));
        Put(bind,command);Put(bind,execution);Put(bind,lease);Put(bind,Id{});Put(bind,row->scope);Put(bind,leafProgram);bind.resize(204,0);bind.push_back(static_cast<unsigned char>(phase::DeliveryClass::Execute));
        const auto bound=Exchange(phase::Verb::BindCommand,bind);boundary();
        Bytes selected;Put(selected,Fixed<32>(bound.payload.data()+40));Put(selected,data_->observationSnapshot);Put(selected,data_->observationContext);Put(selected,data_->observationTransport);
        const auto selection=DomainHash("lcp2.production.project-selected.v1",selected);Bytes consume(bound.payload.begin(),bound.payload.begin()+32);Put(consume,Fixed<32>(bound.payload.data()+40));Put(consume,selection);
        // D42 admission/stable-key latch, original Note and fresh floor ACK all
        // precede the first destination reservation, FILE_CREATE or byte write.
        created.effectSelected=true;const auto consumed=Exchange(phase::Verb::ConsumeDispatch,consume);boundary();
        Bytes guard(consumed.payload.begin()+1,consumed.payload.begin()+17);Put(guard,Fixed<16>(consumed.payload.data()+97));Put(guard,Fixed<32>(consumed.payload.data()+17));
        Put(guard,row->handler);Put(guard,data_->observationActor);Put(guard,selection);Put(guard,data_->observationContext);detail::PutU64(guard,row->expiry);detail::PutU64(guard,data_->observationOrdinal);
        const auto delivery=Exchange(phase::Verb::GuardDelivery,guard);boundary();
        created.writer=detail::Relative(created.root->directory.Get(),name,false,true,true,true);std::uint64_t size=0;
        created.createdPin=detail::ReadPin(created.writer.Get(),false,&size);if(size||created.createdPin.canonicalPath!=policy.snapshotRoot.canonicalPath+L"\\"+name)Refuse("trusted_checkpoint_created_identity_refused",0,true);
        DWORD written=0;if(!WriteFile(created.writer.Get(),sourceBytes.data(),static_cast<DWORD>(sourceBytes.size()),&written,nullptr)||written!=sourceBytes.size()||!FlushFileBuffers(created.writer.Get())||
            !detail::SamePin(detail::ReadPin(created.writer.Get(),false),created.createdPin)||detail::ReadExact(created.writer.Get(),134217728)!=sourceBytes)Refuse("trusted_checkpoint_original_write_unknown",GetLastError(),true);
        const auto writer=created.writer.Take();if(!CloseHandle(writer)){data_->failedCloseHandles.push_back(writer);Refuse("trusted_checkpoint_original_writer_close_unknown",GetLastError(),true);}
        reviewed::File approved;approved.pin=created.createdPin;approved.sha256=created.sourceHash;created.file=std::make_unique<CheckedFile>(approved);created.stage=Data::CheckpointFile::Stage::Created;boundary();
        // Separate native-file receipt domain. There is no PanelReceipt,
        // fabricated HTTP response/script/send, or caller-delivered file JSON.
        Bytes delivered(delivery.payload.begin(),delivery.payload.begin()+32);Put(delivered,command);delivered.push_back(static_cast<unsigned char>(phase::DeliveryOutcome::Delivered));Put(delivered,Fixed<32>(delivery.payload.data()+40));
        const auto accepted=Exchange(phase::Verb::RecordDelivery,delivered);created.receipt=Fixed<32>(accepted.payload.data()+17);boundary();
        Bytes result;Put(result,created.receipt);detail::PutPin(result,created.createdPin);Put(result,created.sourceHash);Put(result,manifest.state_.graphHash);detail::PutU64(result,manifest.nativeRevision_);
        detail::PutU16(result,row->slot);detail::PutU16(result,static_cast<std::uint16_t>(leaf));created.terminal=DomainHash(checkpoint?"lcp2.production.original-checkpoint-file-result.v1":"lcp2.production.original-clean-copy-file-result.v1",result);Bytes complete;Put(complete,command);Put(complete,execution);Put(complete,created.terminal);detail::PutU16(complete,1);Put(complete,created.receipt);
        const auto terminal=Exchange(phase::Verb::Complete,complete);boundary();created.ref=Fixed<16>(terminal.payload.data()+1);created.stage=Data::CheckpointFile::Stage::Accepted;data_->lastCompletedGate=cap;data_->lastCompletedTerminal=terminal;
        auto capability=Own(checkpoint?CapKind::OwnedCheckpoint:CapKind::OwnedCleanCopy,terminal);capability->ownedFileSlot_=row->slot;AssertCapabilityCurrent(capability);return capability;
    }catch(...){created.stage=Data::CheckpointFile::Stage::Unknown;data_->unknown=true;throw;}
}
Bytes NativeClient::DescribeOwnedCheckpointFixed(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);(void)Require(cap,CapKind::OwnedCheckpoint);AssertCapabilityCurrent(cap);const auto& row=*data_->checkpoint;
    const auto& policy=EmbeddedProfile().execution;const auto path=policy.snapshotLocator+(policy.snapshotLocator.back()==L'\\'?L"":L"\\")+policy.checkpointName;
    const auto result="{\"schema\":\"ae-agent.owned-native-clean-RAM-checkpoint.v1\",\"file\":"+ManifestQuote(ManifestUtf8(path))+",\"sha25664\":\""+ExecutionHex(row.sourceHash)+"\",\"receiptSha25664\":\""+ExecutionHex(row.receipt)+
        "\",\"nativeFileResultSha25664\":\""+ExecutionHex(row.terminal)+"\",\"unsavedStateCaptured\":false,\"replayAllowed\":false}";return Bytes(result.begin(),result.end());
}
Bytes NativeClient::DescribeOwnedCleanCopyFixed(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);(void)Require(cap,CapKind::OwnedCleanCopy);AssertCapabilityCurrent(cap);
    const auto& row=*data_->cleanCopies[cap->ownedFileSlot_-1];const auto& policy=EmbeddedProfile().execution;const auto path=policy.snapshotLocator+(policy.snapshotLocator.back()==L'\\'?L"":L"\\")+row.name;
    const auto result="{\"schema\":\"ae-agent.owned-native-clean-copy-file.v1\",\"slot\":"+std::to_string(row.slot)+",\"file\":"+ManifestQuote(ManifestUtf8(path))+",\"sha25664\":\""+ExecutionHex(row.sourceHash)+
        "\",\"receiptSha25664\":\""+ExecutionHex(row.receipt)+"\",\"nativeFileResultSha25664\":\""+ExecutionHex(row.terminal)+"\",\"ramOpened\":false,\"idsOrGuidPreserved\":false,\"replayAllowed\":false}";
    return Bytes(result.begin(),result.end());
}
ProjectDescriptor NativeClient::DescribeExecution(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(!cap||cap->owner_!=this||!cap->project_||!cap->project_->inspection||cap->project_->stage==ProjectCapture::Stage::Unknown)Refuse("trusted_original_readonly_execution_required");
    const auto& capture=*cap->project_;if(capture.originalScript.empty()||detail::Hash(Bytes(capture.originalScript.begin(),capture.originalScript.end()))!=capture.script)
        Refuse("trusted_original_execution_script_changed");return {capture.command,capture.execution,capture.lease,capture.originalScript,capture.expiry};}
phase::ToolCode NativeClient::ExecutionToolForCommand(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(!cap||cap->owner_!=this||!cap->project_||!cap->project_->inspection||cap->project_->stage==ProjectCapture::Stage::Unknown||
        std::find(data_->projects.begin(),data_->projects.end(),cap->project_)==data_->projects.end())Refuse("trusted_original_execution_command_tool_required");
    const auto tool=cap->project_->tool;if(cap->project_->preparationDelivery&&tool==phase::ToolCode::RunAiAgentPlan)return phase::ToolCode::GetCompDetails;
    if((cap->project_->stageDelivery||cap->project_->restorationDelivery||cap->project_->ameEnqueueDelivery||cap->project_->ameStartDelivery)&&tool==phase::ToolCode::RunAiAgentPlan)return tool;
    if(cap->project_->ameSourceDelivery&&(tool==phase::ToolCode::InspectAmeTitleSources||tool==phase::ToolCode::InspectAmeTitleQueueManifest))return tool;
    if(cap->project_->ameCompletionDelivery&&tool==phase::ToolCode::GetAmeTitleJobStatus)return tool;
    if(tool!=phase::ToolCode::GetCompDetails&&tool!=phase::ToolCode::GetLayerDetails&&tool!=phase::ToolCode::InspectTitleVariants)
        Refuse("trusted_original_execution_command_tool_refused");return tool;}
std::shared_ptr<Capability> NativeClient::FinishServerOnlyFixed(const std::shared_ptr<Capability>& cap,const Bytes& actualResult){
    (void)OriginalServerOnlyBody(cap);if(actualResult.empty()||actualResult.size()>1048576)Refuse("trusted_server_only_actual_result_bound");
    Bytes body(cap->frame_.payload.begin(),cap->frame_.payload.begin()+16);Put(body,detail::Hash(actualResult));AssertCapabilityCurrent(cap);cap->spent_=true;
    return Own(CapKind::Terminal,Exchange(phase::Verb::FinishServerOnly,body));
}
std::shared_ptr<Capability> NativeClient::CaptureOriginalAmeFixed(){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(data_->ameCaptureAttempted||data_->ame)Refuse("trusted_original_ame_capture_once");data_->ameCaptureAttempted=true;
    const auto& policy=EmbeddedProfile().execution;ExecutionCost worst;if(!policy.Validate(worst))Refuse("trusted_ame_fixed_policy_refused");
    CheckedFile executable(policy.ame),exporter(policy.dxvExporter);const auto slash=policy.ame.pin.canonicalPath.find_last_of(L'\\');
    if(slash==std::wstring::npos)Refuse("trusted_ame_fixed_executable_refused");const auto basename=policy.ame.pin.canonicalPath.substr(slash+1);
    Held snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0));if(!snapshot.Valid())Refuse("trusted_ame_original_inventory_unavailable",GetLastError());
    PROCESSENTRY32W row{};row.dwSize=sizeof(row);if(!Process32FirstW(snapshot.Get(),&row))Refuse("trusted_ame_original_inventory_unavailable",GetLastError());DWORD found=0;unsigned count=0;
    do{if(++count>4096)Refuse("trusted_ame_original_inventory_bound");if(_wcsicmp(row.szExeFile,basename.c_str())==0){if(found)Refuse("trusted_ame_original_process_ambiguous");found=row.th32ProcessID;}row.dwSize=sizeof(row);}while(Process32NextW(snapshot.Get(),&row));
    if(GetLastError()!=ERROR_NO_MORE_FILES||!found)Refuse("trusted_ame_original_process_absent_or_unknown",GetLastError());
    auto original=std::shared_ptr<AmeOriginalProcess>(new AmeOriginalProcess(this));
    original->process_=Held(OpenProcess(PROCESS_QUERY_INFORMATION|PROCESS_VM_READ|SYNCHRONIZE,FALSE,found));
    if(!original->process_.Valid())Refuse("trusted_ame_original_observation_rights_unavailable",GetLastError());
    original->pid_=GetProcessId(original->process_.Get());original->birth_=detail::ProcessBirth(original->process_.Get());original->sid_=detail::ProcessSid(original->process_.Get());
    original->imagePin_=policy.ame;original->exporterPin_=policy.dxvExporter;original->image_=std::move(executable.file);original->exporterFile_=std::move(exporter.file);
    for(auto& parent:executable.parents)original->sourceAncestors_.push_back(std::move(parent));for(auto& parent:exporter.parents)original->sourceAncestors_.push_back(std::move(parent));
    if(original->pid_!=found||!original->birth_||original->sid_!=reviewed::EmbeddedProfile().userSid||detail::ProcessImage(original->process_.Get())!=policy.ame.pin.canonicalPath||!detail::ProcessLive(original->process_.Get()))
        Refuse("trusted_ame_original_identity_refused");
    const auto module=OriginalExporterModule(found,policy.dxvExporter);original->exporterBase_=module.first;original->exporterSize_=module.second;
    original->loadedExecutableSections_=OriginalExporterCode(original->process_.Get(),original->exporterFile_.Get(),module.first,module.second);
    AssertLoadedNodeCurrent();if(!original->Current())Refuse("trusted_ame_original_loaded_source_changed");
    data_->ame=original;auto result=Own(CapKind::AmeProcess,{});result->ame_=std::move(original);return result;
}
namespace {
std::string AmeIdText(const Id& id){constexpr char digits[]="0123456789abcdef";std::string text;for(std::size_t i=0;i<id.size();++i){if(i==4||i==6||i==8||i==10)text+='-';text+=digits[id[i]>>4];text+=digits[id[i]&15];}return text;}
std::string AmeBirthText(std::uint64_t birth){FILETIME time{};time.dwLowDateTime=static_cast<DWORD>(birth);time.dwHighDateTime=static_cast<DWORD>(birth>>32);SYSTEMTIME value{};
    if(!birth||!FileTimeToSystemTime(&time,&value))Refuse("trusted_ame_original_birth_unavailable");char text[40]{};const auto count=sprintf_s(text,"%04u-%02u-%02uT%02u:%02u:%02u.%03uZ",static_cast<unsigned>(value.wYear),static_cast<unsigned>(value.wMonth),static_cast<unsigned>(value.wDay),static_cast<unsigned>(value.wHour),static_cast<unsigned>(value.wMinute),static_cast<unsigned>(value.wSecond),static_cast<unsigned>(value.wMilliseconds));if(count!=24)Refuse("trusted_ame_original_birth_format");return std::string(text,24);}
std::wstring AmeHeldDosPath(HANDLE original){const auto count=GetFinalPathNameByHandleW(original,nullptr,0,FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);if(count<7||count>32760)Refuse("trusted_ame_held_dos_alias_unavailable",GetLastError());std::wstring value(count,L'\0');
    const auto actual=GetFinalPathNameByHandleW(original,value.data(),count,FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);if(!actual||actual>=count)Refuse("trusted_ame_held_dos_alias_changed",GetLastError());value.resize(actual);
    if(value.compare(0,4,L"\\\\?\\")!=0||value.size()<7||value[5]!=L':'||value[6]!=L'\\')Refuse("trusted_ame_local_dos_alias_required");return value.substr(4);}
Held AmeOriginalDuplicate(HANDLE original){HANDLE copy=nullptr;if(!DuplicateHandle(GetCurrentProcess(),original,GetCurrentProcess(),&copy,0,FALSE,DUPLICATE_SAME_ACCESS))Refuse("trusted_ame_original_file_duplicate_failed",GetLastError());return Held(copy);}
std::string AmeCanonicalGuid(std::string value){if(value.size()!=36)Refuse("trusted_ame_actual_guid_required");bool nonzero=false;for(std::size_t i=0;i<value.size();++i){auto& c=value[i];if(i==8||i==13||i==18||i==23){if(c!='-')Refuse("trusted_ame_actual_guid_required");continue;}if(c>='A'&&c<='F')c=static_cast<char>(c-'A'+'a');if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))Refuse("trusted_ame_actual_guid_required");if(c!='0')nonzero=true;}if(!nonzero)Refuse("trusted_ame_actual_guid_required");return value;}
std::string AmeMessageLiteral(const std::string& body){std::string result="\"";constexpr char hex[]="0123456789abcdef";for(std::size_t i=0;i<body.size();++i){const auto c=static_cast<unsigned char>(body[i]);if(c=='"'||c=='\\'){result+='\\';result+=static_cast<char>(c);}else if(c=='\b')result+="\\b";else if(c=='\f')result+="\\f";else if(c=='\n')result+="\\n";else if(c=='\r')result+="\\r";else if(c=='\t')result+="\\t";else if(c<32){result+="\\u00";result+=hex[c>>4];result+=hex[c&15];}else if(c==0xe2&&i+2<body.size()&&static_cast<unsigned char>(body[i+1])==0x80&&(static_cast<unsigned char>(body[i+2])==0xa8||static_cast<unsigned char>(body[i+2])==0xa9)){result+=static_cast<unsigned char>(body[i+2])==0xa8?"\\u2028":"\\u2029";i+=2;}else result+=static_cast<char>(c);}return result+'"';}
}
Bytes NativeClient::AmeSourceInspectionDescriptorFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& own=Require(handler,CapKind::Handler);auto& savedCap=Require(snapshot,CapKind::OwnedSavedSnapshot);auto& process=Require(ame,CapKind::AmeProcess);
    AssertCapabilityCurrent(handler);AssertCapabilityCurrent(snapshot);AssertCapabilityCurrent(ame);const auto& policy=EmbeddedProfile().execution;ExecutionCost worst;
    const auto tool=static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2));const bool queue=tool==phase::ToolCode::InspectAmeTitleQueueManifest;
    if(!policy.Validate(worst)||own.frame_.payload[74]!=static_cast<unsigned char>(phase::CallKind::ExecutionPrep)||(tool!=phase::ToolCode::InspectAmeTitleSources&&!queue)||!own.ingress_||!process.ame_||process.ame_!=data_->ame)Refuse("trusted_ame_source_original_handler_required");
    const auto request=ManifestJson(OriginalRequestBody(own.ingress_));capture::Fields(request,{"name","args"});capture::Fields(request.Field("args"),{"variantSlot"});const auto slot=CopyInteger(request.Field("args").Field("variantSlot"));
    if(request.Field("name").Text()!=(queue?"inspect_ame_title_queue_manifest":"inspect_ame_title_sources")||slot<1||slot>2||savedCap.ownedFileSlot_!=slot||Fixed<32>(own.frame_.payload.data()+77)!=detail::Hash(OriginalRequestBody(own.ingress_)))Refuse("trusted_ame_source_own_slot_request_join");
    const auto& saved=*data_->savedSnapshots[slot-1];const auto& debt=data_->restorationDebts[slot-1];if(saved.unknown||!debt||debt->actor!=data_->observationActor||debt->state!=Data::RestorationDebt::State::StageTerminal||!data_->preissuedRestorationPrograms[slot-1])Refuse("trusted_ame_source_original_stage_debt_required");
    if(slot==2&&(!data_->originalJobs[0]||data_->originalJobs[0]->unknown_||data_->originalJobs[0]->stage_!=AmeOriginalJob::Stage::MediaAccepted||!data_->restorationReceipts[0]))Refuse("trusted_ame_source_slot2_before_media_restoration");
    auto& job=data_->ameSourceJobs[slot-1];if(queue&&(!job||job!=data_->originalJobs[slot-1]||job->stage_!=AmeOriginalJob::Stage::Enqueued||!job->enqueuedTerminal_||!job->sourceInspection_))Refuse("trusted_ame_queue_original_enqueue_required");
    if(!job){job=std::shared_ptr<AmeOriginalJob>(new AmeOriginalJob(this));try{job->slot_=static_cast<std::uint16_t>(slot);job->process_=process.ame_;job->savedSnapshot_=snapshot;job->sourceHandler_=handler;job->originalActor_=data_->observationActor;
        job->targetSpecifier_=policy.ameTargetSpecifier;job->sourceRequestNonce_=AmeIdText(detail::RandomId());job->batchId_=AmeIdText(detail::RandomId());job->wrapperHandle_=AmeIdText(detail::RandomId());job->enqueueRequestNonce_=AmeIdText(detail::RandomId());
        job->source_=AmeOriginalDuplicate(saved.file->file.Get());job->sourcePin_=saved.pin;job->sourceHash_=saved.hash;job->sourcePath_=ManifestJson(saved.actualPostSave).Field("projectFile").Text();job->sourceGuid_=saved.guid;
        CheckedFile preset(policy.preset);job->preset_=std::move(preset.file);job->presetPin_=policy.preset.pin;job->presetHash_=policy.preset.sha256;for(auto& parent:preset.parents)job->fileAncestors_.push_back(std::move(parent));
        CheckedDirectory output(policy.outputRoot);job->outputRoot_=std::move(output.directory);for(auto& parent:output.parents)job->fileAncestors_.push_back(std::move(parent));job->outputRootPin_=policy.outputRoot;
        const auto& variant=policy.variants[slot-1];job->outputName_=variant.outputName;job->outputPath_=ManifestUtf8(policy.outputLocator+(policy.outputLocator.back()==L'\\'?L"":L"\\")+variant.outputName);
        job->session_=data_->wire->bindings_.sessionRef;job->generation_=data_->wire->bindings_.generation;job->boot_=data_->wire->bindings_.bootNonce;
        Bytes binding;Put(binding,job->session_);Put(binding,job->generation_);Put(binding,job->boot_);Put(binding,FixedExecutionScope(policy,job->slot_,ExecutionLeaf::Inspect));Put(binding,job->sourceHash_);Put(binding,detail::Hash(Bytes(job->sourceRequestNonce_.begin(),job->sourceRequestNonce_.end())));job->sourceOperationBinding_=ExecutionHex(DomainHash("lcp2.production.original-AME-source-read.v1",binding));
        }catch(...){job->unknown_=true;throw;}
    }
    if(queue&&!job->queueHandler_){job->queueHandler_=handler;job->queueRequestNonce_=AmeIdText(detail::RandomId());Bytes fields;Put(fields,job->sourceHash_);Put(fields,job->session_);Put(fields,detail::Hash(Bytes(job->queueRequestNonce_.begin(),job->queueRequestNonce_.end())));job->queueOperationBinding_=ExecutionHex(DomainHash("lcp2.production.original-AME-queue-read.v1",fields));}
    if(job->owner_!=this||job->savedSnapshot_!=snapshot||job->process_!=process.ame_||job->originalActor_!=data_->observationActor||job->unknown_||
        (queue?(job->queueHandler_!=handler||job->queueBound_||job->stage_!=AmeOriginalJob::Stage::Enqueued):(job->sourceHandler_!=handler||job->sourceBound_||job->stage_!=AmeOriginalJob::Stage::SourcePending)))Refuse("trusted_ame_source_inspection_once_or_origin_changed");
    if(!job->source_.Valid()||!job->preset_.Valid()||!job->outputRoot_.Valid()||!detail::SamePin(detail::ReadPin(job->source_.Get(),false),job->sourcePin_)||detail::Hash(detail::ReadExact(job->source_.Get(),134217728))!=job->sourceHash_||!detail::SamePin(detail::ReadPin(job->preset_.Get(),false),job->presetPin_)||detail::Hash(detail::ReadExact(job->preset_.Get(),16777216))!=job->presetHash_||!detail::SamePin(detail::ReadPin(job->outputRoot_.Get(),true),job->outputRootPin_))Refuse("trusted_ame_inspection_original_files_changed");
    const auto post=ManifestCanonical(ManifestJson(saved.actualPostSave)),stage=ManifestCanonical(ManifestJson(data_->preissuedRestorationPrograms[slot-1]->restorationProgram_->descriptor));
    if(post.size()>(1048576-524288-32768)/2)Refuse("trusted_ame_full_current_envelope_does_not_fit");Bytes processFields;detail::PutU32(processFields,process.ame_->pid_);detail::PutU64(processFields,process.ame_->birth_);detail::PutPin(processFields,process.ame_->imagePin_.pin);Put(processFields,process.ame_->imagePin_.sha256);Put(processFields,process.ame_->loadedExecutableSections_);
    std::string args="{\"operation\":"+ManifestQuote(queue?"queue":"sources")+",\"ownedInitialDispatch\":true,\"targetSpecifier\":"+ManifestQuote(job->targetSpecifier_)+",\"timeoutMs\":10000,\"sourcePath\":"+ManifestQuote(job->sourcePath_)+",\"requestNonce\":"+ManifestQuote(queue?job->queueRequestNonce_:job->sourceRequestNonce_)+",\"operationBinding\":"+ManifestQuote(queue?job->queueOperationBinding_:job->sourceOperationBinding_)+",\"processBinding\":\""+ExecutionHex(DomainHash("lcp2.production.original-AME-process.v1",processFields))+"\"}";
    if(queue){auto actual=ManifestJson(Bytes(args.begin(),args.end()));actual.keys.push_back("boundNativeSessionNonce");const auto probe=ManifestQuote(job->nativeSessionNonce_);actual.children.push_back(job->probeNonceNull_?capture::Json{}:ManifestJson(Bytes(probe.begin(),probe.end())));actual.keys.push_back("retainedWrapperSessionNonce");const auto nonce=ManifestQuote(job->wrapperNonce_);actual.children.push_back(ManifestJson(Bytes(nonce.begin(),nonce.end())));
        actual.keys.push_back("jobIds");capture::Json ids;ids.kind=capture::Json::Kind::Array;for(std::size_t i=0;i<slot;++i){const auto& original=data_->originalJobs[i];if(!original||original->unknown_)Refuse("trusted_ame_queue_own_prefix_missing");const auto id=ManifestQuote(original->wrapperHandle_);ids.children.push_back(ManifestJson(Bytes(id.begin(),id.end())));}actual.children.push_back(ids);const auto encoded=ManifestCanonical(actual);args=std::string(encoded.begin(),encoded.end());}
    const auto text="{\"schema\":\"ae-agent.owned-native-ame-command.v1\",\"operation\":"+ManifestQuote(queue?"queue":"sources")+",\"slot\":"+std::to_string(slot)+",\"expectedCurrent\":"+std::string(post.begin(),post.end())+",\"stageDescriptor\":"+std::string(stage.begin(),stage.end())+",\"args\":"+args+"}";
    return ManifestCanonical(ManifestJson(Bytes(text.begin(),text.end())));
}
Bytes NativeClient::AmeDeliveryDescriptorFixed(const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& own=Require(gate,CapKind::ExecutionGate);auto& savedCap=Require(snapshot,CapKind::OwnedSavedSnapshot);auto& process=Require(ame,CapKind::AmeProcess);AssertCapabilityCurrent(gate);AssertCapabilityCurrent(snapshot);AssertCapabilityCurrent(ame);
    const auto row=own.execution_;const auto& policy=EmbeddedProfile().execution;if(!row||row->owner_!=this||row->tool!=phase::ToolCode::RunAiAgentPlan||row->slot<1||row->slot>2||(row->leaf!=ExecutionLeaf::EnqueueAme&&row->leaf!=ExecutionLeaf::StartAme)||savedCap.ownedFileSlot_!=row->slot)Refuse("trusted_ame_exact_outer_RunAI_scope_required");
    const auto job=data_->ameSourceJobs[row->slot-1];const auto& saved=*data_->savedSnapshots[row->slot-1];const bool start=row->leaf==ExecutionLeaf::StartAme;
    if(!job||job->owner_!=this||job->unknown_||job->savedSnapshot_!=snapshot||job->process_!=process.ame_||job->originalActor_!=row->actor||row->actor!=data_->observationActor||!job->sourceInspection_||
        job->targetSpecifier_!=policy.ameTargetSpecifier||(start?(job->stage_!=AmeOriginalJob::Stage::Enqueued||job!=data_->originalJobs[row->slot-1]||!job->queueInspection_||job->queueResult_.empty()):job->stage_!=AmeOriginalJob::Stage::SourceInspected))Refuse("trusted_ame_own_source_or_queue_receipt_required");
    (void)RequireFixedExecutionCurrent(row->originalManifest,row->currentRead,row->slot,row->leaf);(void)OriginalRequestBody(row->originalPanelRequest);(void)OriginalRequestBody(row->originalHandler->ingress_);
    if(row->slot==2&&(!data_->originalJobs[0]||data_->originalJobs[0]->unknown_||data_->originalJobs[0]->stage_!=AmeOriginalJob::Stage::MediaAccepted||!data_->restorationReceipts[0]))Refuse("trusted_ame_slot2_original_media_restore_required");
    if(!job->source_.Valid()||!job->preset_.Valid()||!job->outputRoot_.Valid()||!detail::SamePin(detail::ReadPin(job->source_.Get(),false),saved.pin)||detail::Hash(detail::ReadExact(job->source_.Get(),134217728))!=saved.hash||
        !detail::SamePin(detail::ReadPin(job->preset_.Get(),false),policy.preset.pin)||detail::Hash(detail::ReadExact(job->preset_.Get(),16777216))!=policy.preset.sha256||!detail::SamePin(detail::ReadPin(job->outputRoot_.Get(),true),policy.outputRoot))Refuse("trusted_ame_original_file_guards_changed");
    try{auto absent=detail::Relative(job->outputRoot_.Get(),job->outputName_,false,false,false,false,true);(void)absent;Refuse("trusted_ame_output_already_exists");}catch(const detail::Failure& failure){if(failure.error!=ERROR_FILE_NOT_FOUND||failure.unknown)throw;}
    if(data_->ownAmeWrapperNonce.empty()){if(row->slot!=1||start)Refuse("trusted_ame_original_wrapper_before_first_enqueue");data_->ownAmeWrapperNonce=AmeIdText(detail::RandomId());}job->wrapperNonce_=data_->ownAmeWrapperNonce;
    if(!data_->titleManifest||data_->titleManifest->stage_!=NativeTitleManifest::Stage::Complete)Refuse("trusted_ame_original_manifest_required");const auto& m=*data_->titleManifest;job->width_=m.state_.width;job->height_=m.state_.height;job->frameCount_=m.state_.frameCount;job->rateNumerator_=m.state_.rateNumerator;job->rateDenominator_=m.state_.rateDenominator;
    if(job->presetPath_.empty())job->presetPath_=ManifestUtf8(AmeHeldDosPath(job->preset_.Get()));Bytes processFields;detail::PutU32(processFields,job->process_->pid_);detail::PutU64(processFields,job->process_->birth_);detail::PutPin(processFields,job->process_->imagePin_.pin);Put(processFields,job->process_->imagePin_.sha256);Put(processFields,job->process_->loadedExecutableSections_);job->processBinding_=ExecutionHex(DomainHash("lcp2.production.original-AME-process.v1",processFields));
    if(job->presetId_.empty()){auto identity=job->presetPath_;for(auto& c:identity){if(static_cast<unsigned char>(c)>127)Refuse("trusted_ame_preset_registry_path_unsupported");if(c>='A'&&c<='Z')c=static_cast<char>(c-'A'+'a');}Bytes fields(identity.begin(),identity.end());fields.push_back(0);const auto digest=ExecutionHex(job->presetHash_);fields.insert(fields.end(),digest.begin(),digest.end());job->presetId_="amep_"+ExecutionHex(detail::Hash(fields)).substr(0,40);}
    if(job->presetIdentity_.empty()){Bytes presetFields;detail::PutPin(presetFields,job->presetPin_);Put(presetFields,job->presetHash_);job->presetIdentity_=ExecutionHex(DomainHash("lcp2.production.original-AME-preset.v1",presetFields));}
    const auto post=ManifestCanonical(ManifestJson(saved.actualPostSave)),stage=ManifestCanonical(ManifestJson(data_->preissuedRestorationPrograms[row->slot-1]->restorationProgram_->descriptor));if(post.size()>(1048576-524288-32768)/2)Refuse("trusted_ame_full_current_envelope_does_not_fit");
    const auto state=ManifestJson(saved.actualPostSave);const auto duration=state.Field("graph").Field("duration").scalar;const auto nonce=job->probeNonceNull_?std::string("null"):ManifestQuote(job->nativeSessionNonce_);
    if(start&&job->startRequestNonce_.empty()){job->startRequestNonce_=AmeIdText(detail::RandomId());Bytes fields;Put(fields,row->scope);Put(fields,job->sourceHash_);Put(fields,detail::Hash(job->queueResult_));Put(fields,detail::Hash(Bytes(job->startRequestNonce_.begin(),job->startRequestNonce_.end())));job->startOperationBinding_=ExecutionHex(DomainHash("lcp2.production.original-AME-START.v1",fields));}
    if(!start&&job->enqueueOperationBinding_.empty()){Bytes fields;Put(fields,row->scope);Put(fields,job->sourceHash_);Put(fields,job->presetHash_);Put(fields,detail::Hash(Bytes(job->wrapperHandle_.begin(),job->wrapperHandle_.end())));job->enqueueOperationBinding_=ExecutionHex(DomainHash("lcp2.production.original-AME-enqueue.v1",fields));}
    std::string args="{\"operation\":"+ManifestQuote(start?"start":"enqueue")+",\"ownedInitialDispatch\":true,\"ownedVariantSlot\":"+std::to_string(row->slot)+",\"targetSpecifier\":"+ManifestQuote(job->targetSpecifier_)+",\"timeoutMs\":10000,\"boundNativeSessionNonce\":"+nonce+
        ",\"batchId\":"+ManifestQuote(job->batchId_)+",\"jobId\":"+ManifestQuote(job->wrapperHandle_)+",\"sourcePath\":"+ManifestQuote(job->sourcePath_)+",\"sourceGuid\":"+ManifestQuote(job->sourceGuid_)+",\"presetPath\":"+ManifestQuote(job->presetPath_)+",\"presetIdentity\":"+ManifestQuote(job->presetIdentity_)+",\"processBinding\":"+ManifestQuote(job->processBinding_)+",\"outputPath\":"+ManifestQuote(job->outputPath_)+",\"requestNonce\":"+ManifestQuote(start?job->startRequestNonce_:job->enqueueRequestNonce_)+",\"operationBinding\":"+ManifestQuote(start?job->startOperationBinding_:job->enqueueOperationBinding_)+
        ",\"newWrapperSessionNonce\":"+ManifestQuote(job->wrapperNonce_)+",\"retainedWrapperSessionNonce\":"+ManifestQuote(job->wrapperNonce_)+",\"range\":{\"startSeconds\":0,\"endSeconds\":"+duration+"},\"ownedRangeMode\":\"full_observed_root_range_v1\",\"ownedObservedDuration\":"+duration+"}";
    if(start){if(job->queueManifest_.empty()||detail::Zero(job->queueManifestHash_))Refuse("trusted_ame_original_manual_manifest_required");auto actual=ManifestJson(Bytes(args.begin(),args.end()));const auto observed=ManifestJson(job->queueManifest_);actual.keys.push_back("manualQueueMode");const std::string mode="\"cep_user_declaration_v2\"";actual.children.push_back(ManifestJson(Bytes(mode.begin(),mode.end())));actual.keys.push_back("expectedJobs");actual.children.push_back(observed.Field("jobs"));actual.keys.push_back("completedOwnedPrefix");actual.children.push_back(observed.Field("completedOwnedPrefix"));actual.keys.push_back("jobIds");capture::Json ids;ids.kind=capture::Json::Kind::Array;const auto id=ManifestQuote(job->wrapperHandle_);ids.children.push_back(ManifestJson(Bytes(id.begin(),id.end())));actual.children.push_back(ids);const auto encoded=ManifestCanonical(actual);args=std::string(encoded.begin(),encoded.end());}
    const auto text="{\"schema\":\"ae-agent.owned-native-ame-command.v1\",\"operation\":"+ManifestQuote(start?"start":"enqueue")+",\"slot\":"+std::to_string(row->slot)+",\"expectedCurrent\":"+std::string(post.begin(),post.end())+",\"stageDescriptor\":"+std::string(stage.begin(),stage.end())+",\"args\":"+args+"}";return ManifestCanonical(ManifestJson(Bytes(text.begin(),text.end())));
}
std::shared_ptr<Capability> NativeClient::BindAmeSourceInspectionFixed(const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame,const std::string& source,const std::string& body){return BindAmeCommandFixed(handler,snapshot,ame,source,body,true);}
std::shared_ptr<Capability> NativeClient::BindAmeDeliveryFixed(const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame,const std::string& source,const std::string& body){return BindAmeCommandFixed(gate,snapshot,ame,source,body,false);}
std::shared_ptr<Capability> NativeClient::BindAmeCommandFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame,const std::string& source,const std::string& body,bool inspection){
    const auto descriptor=inspection?AmeSourceInspectionDescriptorFixed(cap,snapshot,ame):AmeDeliveryDescriptorFixed(cap,snapshot,ame);const auto parsed=ManifestJson(descriptor);auto& own=Require(cap,inspection?CapKind::Handler:CapKind::ExecutionGate);
    const auto slot=static_cast<std::uint16_t>(CopyInteger(parsed.Field("slot")));const auto job=data_->ameSourceJobs[slot-1];const auto now=GetTickCount64();
    if(!job||source.empty()||source.size()>1048576||body.empty()||body.size()>524288||source.find('\0')!=std::string::npos||body.find('\0')!=std::string::npos||
        detail::Zero(data_->observationSnapshot)||!data_->observationOrdinal||now<data_->observationMono||now-data_->observationMono>10000||data_->projects.size()>=kTwoTitleCalls)Refuse("trusted_ame_original_source_bind_bound");
    const auto literal=AmeMessageLiteral(body),commit=ExecutionHex(detail::Hash(descriptor));const auto position=source.find(literal);
    if(position==std::string::npos||source.find(literal,position+literal.size())!=std::string::npos||source.find(commit)==std::string::npos)Refuse("trusted_ame_full_wrapper_payload_commitment_required");
    auto p=std::make_shared<ProjectCapture>();p->inspection=true;p->ameSourceDelivery=inspection;p->ameEnqueueDelivery=!inspection&&parsed.Field("operation").Text()=="enqueue";p->ameStartDelivery=!inspection&&!p->ameEnqueueDelivery;
    p->tool=inspection?static_cast<phase::ToolCode>(Number(own.frame_.payload.data()+72,2)):phase::ToolCode::RunAiAgentPlan;p->originalAmeJob=job;p->preparationDescriptor=descriptor;p->originalBridgeTalkBody=body;p->originalBridgeTalkHash=detail::Hash(Bytes(body.begin(),body.end()));
    p->executionGate=inspection?nullptr:cap;p->originalHandler=inspection?cap:own.execution_->originalHandler;p->originalManifest=inspection?nullptr:own.execution_->originalManifest;p->baselineRead=inspection?nullptr:own.execution_->currentRead;
    p->command=detail::RandomId();p->execution=detail::RandomId();p->lease=detail::RandomId();p->handler=Fixed<16>(own.frame_.payload.data());p->originalScript=source;p->script=detail::Hash(Bytes(source.begin(),source.end()));
    p->operationScope=inspection?FixedExecutionScope(EmbeddedProfile().execution,slot,ExecutionLeaf::Inspect):own.execution_->scope;
    p->snapshot=data_->observationSnapshot;p->context=data_->observationContext;p->transport=data_->observationTransport;p->actor=data_->observationActor;p->observationOrdinal=data_->observationOrdinal;p->panelConnection=data_->panelConnection;p->panelGeneration=data_->panelGeneration;
    AssertAmeDispatchCurrent(p);if(inspection){if(p->tool==phase::ToolCode::InspectAmeTitleSources)job->sourceBound_=true;else job->queueBound_=true;}data_->projects.push_back(p);
    Bytes bind(own.frame_.payload.begin(),own.frame_.payload.begin()+40);detail::PutU16(bind,static_cast<std::uint16_t>(p->tool));detail::PutU16(bind,static_cast<std::uint16_t>(inspection?phase::ChildRole::ExecutionPrep:phase::ChildRole::Execute));
    Put(bind,p->command);Put(bind,p->execution);Put(bind,p->lease);Put(bind,Id{});Put(bind,p->operationScope);Put(bind,p->script);bind.resize(204,0);bind.push_back(static_cast<unsigned char>(inspection?phase::DeliveryClass::ExecutionPrep:phase::DeliveryClass::Execute));
    own.spent_=true;try{auto command=Own(CapKind::Command,Exchange(phase::Verb::BindCommand,bind));p->expiry=Number(command->frame_.payload.data()+32,8);command->project_=p;command->ingress_=p->originalHandler->ingress_;return command;}
    catch(...){p->stage=ProjectCapture::Stage::Unknown;job->unknown_=true;job->stage_=AmeOriginalJob::Stage::Unknown;data_->unknown=true;throw;}
}
void NativeClient::AssertOriginalAmeUniqueCurrent(const std::shared_ptr<AmeOriginalJob>& job){
    if(!job||job->owner_!=this||!job->process_||job->process_!=data_->ame||!job->process_->Current())Refuse("trusted_ame_original_process_for_census_required");const auto& policy=EmbeddedProfile().execution;
    const auto slash=policy.ame.pin.canonicalPath.find_last_of(L'\\');if(slash==std::wstring::npos)Refuse("trusted_ame_original_image_basename_required");const auto basename=policy.ame.pin.canonicalPath.substr(slash+1);Held census(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0));if(!census.Valid())Refuse("trusted_ame_current_process_census_unavailable",GetLastError());PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);if(!Process32FirstW(census.Get(),&entry))Refuse("trusted_ame_current_process_census_unavailable",GetLastError());unsigned count=0,matched=0;
    do{if(++count>4096)Refuse("trusted_ame_current_process_census_bound");if(_wcsicmp(entry.szExeFile,basename.c_str())==0){if(++matched!=1||entry.th32ProcessID!=job->process_->pid_)Refuse("trusted_ame_current_process_census_foreign_or_restart");}entry.dwSize=sizeof(entry);}while(Process32NextW(census.Get(),&entry));if(GetLastError()!=ERROR_NO_MORE_FILES||matched!=1)Refuse("trusted_ame_current_process_census_unknown_or_absent",GetLastError());
    if(!job->process_->Current())Refuse("trusted_ame_original_process_changed_after_census");
}
void NativeClient::AssertAmeDispatchCurrent(const std::shared_ptr<ProjectCapture>& original){
    if(original&&original->ameCompletionDelivery){const auto job=original->originalAmeJob;AssertOriginalJobObservationCurrent(job);AssertOriginalAmeUniqueCurrent(job);
        if(job->originalActor_!=data_->observationActor||job->targetSpecifier_!=EmbeddedProfile().execution.ameTargetSpecifier||!job->pendingPoll_||job->pendingPoll_->project_!=original||job->pendingPoll_->spent_||GetTickCount64()>=original->expiry||
            detail::Hash(Bytes(original->originalScript.begin(),original->originalScript.end()))!=original->script||detail::Hash(Bytes(original->originalBridgeTalkBody.begin(),original->originalBridgeTalkBody.end()))!=original->originalBridgeTalkHash)Refuse("trusted_original_poll_source_or_actor_changed",0,true);
        const auto& saved=data_->savedSnapshots[job->slot_-1];if(!saved||saved->unknown||!saved->file->Current()||!saved->root->Current()||saved->pin.fileId!=job->sourcePin_.fileId||saved->hash!=job->sourceHash_)Refuse("trusted_original_poll_saved_snapshot_changed",0,true);
        auto named=detail::Relative(saved->root->directory.Get(),EmbeddedProfile().execution.variants[job->slot_-1].snapshotName,false,false,false,false,true);if(!detail::SamePin(detail::ReadPin(named.Get(),false),saved->pin)||detail::Hash(detail::ReadExact(named.Get(),134217728))!=saved->hash)Refuse("trusted_original_poll_named_snapshot_changed",0,true);return;}
    AssertLoadedNodeCurrent();if(!original||!original->originalAmeJob)Refuse("trusted_ame_original_dispatch_required");const auto job=original->originalAmeJob;const auto slot=job->slot_;const auto& policy=EmbeddedProfile().execution;
    if(job->owner_!=this||slot<1||slot>2||data_->ameSourceJobs[slot-1]!=job||job->unknown_||job->stage_==AmeOriginalJob::Stage::Unknown||job->process_!=data_->ame||!job->process_||!job->process_->Current()||
        job->targetSpecifier_!=policy.ameTargetSpecifier||job->originalActor_!=data_->observationActor||original->actor!=job->originalActor_||job->session_!=data_->wire->bindings_.sessionRef||job->generation_!=data_->wire->bindings_.generation||job->boot_!=data_->wire->bindings_.bootNonce||
        !job->savedSnapshot_||!data_->savedSnapshots[slot-1]||data_->savedSnapshots[slot-1]->unknown||!data_->restorationDebts[slot-1]||data_->restorationDebts[slot-1]->state!=Data::RestorationDebt::State::StageTerminal||
        !data_->preissuedRestorationPrograms[slot-1]||data_->preissuedRestorationPrograms[slot-1]->restorationProgram_->unknown||data_->preissuedRestorationPrograms[slot-1]->restorationProgram_->completed)Refuse("trusted_ame_original_process_stage_or_actor_drift");
    // Re-observe the bounded census; a later same-name target never becomes
    // this original process. No foreign process HANDLE is opened or adopted.
    AssertOriginalAmeUniqueCurrent(job);
    AssertCapabilityCurrent(job->savedSnapshot_);const auto& saved=*data_->savedSnapshots[slot-1];CheckedFile preset(policy.preset);CheckedDirectory output(policy.outputRoot);
    CheckedFile originalSource(policy.sourceProject);const auto& working=data_->cleanCopies[slot-1];if(!originalSource.Current()||!data_->checkpoint||!data_->checkpoint->file||!data_->checkpoint->root||!data_->checkpoint->file->Current()||!data_->checkpoint->root->Current()||detail::Hash(detail::ReadExact(data_->checkpoint->file->file.Get(),134217728))!=policy.sourceProject.sha256||!working||!working->file||!working->root||!working->file->Current()||!working->root->Current()||detail::Hash(detail::ReadExact(working->file->file.Get(),134217728))!=working->sourceHash)Refuse("trusted_ame_original_source_checkpoint_working_drift");
    if(!preset.Current()||!output.Current()||!job->source_.Valid()||!job->preset_.Valid()||!job->outputRoot_.Valid()||!detail::SamePin(detail::ReadPin(job->source_.Get(),false),saved.pin)||detail::Hash(detail::ReadExact(job->source_.Get(),134217728))!=saved.hash||
        !detail::SamePin(detail::ReadPin(job->preset_.Get(),false),policy.preset.pin)||detail::Hash(detail::ReadExact(job->preset_.Get(),16777216))!=policy.preset.sha256||!detail::SamePin(detail::ReadPin(job->outputRoot_.Get(),true),policy.outputRoot)||
        job->sourcePin_.canonicalPath!=saved.pin.canonicalPath||job->sourceHash_!=saved.hash||AmeCanonicalGuid(job->sourceGuid_)!=AmeCanonicalGuid(saved.guid)||job->sourcePath_!=ManifestJson(saved.actualPostSave).Field("projectFile").Text()||
        ManifestCanonical(ManifestJson(original->preparationDescriptor).Field("expectedCurrent"))!=saved.actualPostSave||detail::Hash(Bytes(original->originalBridgeTalkBody.begin(),original->originalBridgeTalkBody.end()))!=original->originalBridgeTalkHash||
        detail::Hash(Bytes(original->originalScript.begin(),original->originalScript.end()))!=original->script)Refuse("trusted_ame_original_final_snapshot_or_script_drift");
    if(!job->presetPath_.empty()){const auto alias=AmeHeldDosPath(job->preset_.Get());if(ManifestUtf8(alias)!=job->presetPath_)Refuse("trusted_ame_original_preset_alias_changed");Held named(CreateFileW(alias.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));if(!named.Valid()||!detail::SamePin(detail::ReadPin(named.Get(),false),policy.preset.pin)||detail::Hash(detail::ReadExact(named.Get(),16777216))!=policy.preset.sha256)Refuse("trusted_ame_original_preset_named_drift");}
    if(job->manualReservationAttempted_){CheckedDirectory markerRoot(policy.manualQueueReservationRoot);if(!job->manualReservation_.Valid()||!job->manualReservationRoot_.Valid()||!markerRoot.Current()||!detail::SamePin(detail::ReadPin(job->manualReservationRoot_.Get(),true),policy.manualQueueReservationRoot)||!detail::SamePin(detail::ReadPin(job->manualReservation_.Get(),false),job->manualReservationPin_)||detail::Hash(detail::ReadExact(job->manualReservation_.Get(),1048576))!=job->manualReservationHash_)Refuse("trusted_ame_original_manual_marker_changed",0,true);auto named=detail::Relative(job->manualReservationRoot_.Get(),ManifestWide(job->batchId_+".json"),false,false,false,false,true);if(!detail::SamePin(detail::ReadPin(named.Get(),false),job->manualReservationPin_)||detail::ReadExact(named.Get(),1048576)!=job->manualReservationBytes_)Refuse("trusted_ame_original_manual_marker_named_changed",0,true);}
    if(!original->ameSourceDelivery){const auto gate=original->executionGate?original->executionGate->execution_:nullptr;if(!gate||gate->owner_!=this||gate->stage!=ExecutionCapture::Stage::Authorized||gate->tool!=phase::ToolCode::RunAiAgentPlan||gate->slot!=slot||gate->actor!=job->originalActor_||GetTickCount64()>=gate->expiry||
            gate->scope!=FixedExecutionScope(policy,slot,original->ameStartDelivery?ExecutionLeaf::StartAme:ExecutionLeaf::EnqueueAme))Refuse("trusted_ame_outer_original_RunAI_gate_drift");
        (void)RequireFixedExecutionCurrent(gate->originalManifest,gate->currentRead,slot,gate->leaf);(void)OriginalRequestBody(gate->originalPanelRequest);(void)OriginalRequestBody(gate->originalHandler->ingress_);
        if(original->ameEnqueueDelivery&&job->stage_!=AmeOriginalJob::Stage::SourceInspected&&job->stage_!=AmeOriginalJob::Stage::EnqueueSelected)Refuse("trusted_ame_enqueue_state_changed");
        if(original->ameStartDelivery&&(job->stage_!=AmeOriginalJob::Stage::Enqueued&&job->stage_!=AmeOriginalJob::Stage::StartSelected||!job->queueInspection_||job->queueResult_.empty()))Refuse("trusted_ame_START_queue_state_changed");
    }
}
namespace {
bool AmeProbeValid(const capture::Json& value){if(value.kind==capture::Json::Kind::Null)return true;if(value.kind!=capture::Json::Kind::String||value.scalar.empty()||value.scalar.size()>128)return false;for(const auto c:value.scalar)if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='_'||c=='-'))return false;return true;}
}
void NativeClient::ValidateOriginalAmeResult(const std::shared_ptr<ProjectCapture>& original,const Bytes& actualResult){
    AssertAmeDispatchCurrent(original);const auto job=original->originalAmeJob;const auto descriptor=ManifestJson(original->preparationDescriptor),envelope=ManifestJson(actualResult);capture::Fields(envelope,{"schema","descriptorSha25664","before","after","send"});
    if(envelope.Field("schema").Text()!="ae-agent.owned-native-ame-receipt.v1"||envelope.Field("descriptorSha25664").Text()!=ExecutionHex(detail::Hash(original->preparationDescriptor))||ManifestCanonical(envelope.Field("before"))!=ManifestCanonical(descriptor.Field("expectedCurrent"))||ManifestCanonical(envelope.Field("after"))!=ManifestCanonical(descriptor.Field("expectedCurrent")))Refuse("trusted_ame_actual_staged_RAM_readback_drift",0,true);
    const auto& send=envelope.Field("send");capture::Fields(send,{"schema","code","requestNonce","callback","responseBody"});const auto& args=descriptor.Field("args");const auto raw=send.Field("responseBody").Text();if(raw.empty()||raw.size()>524288||send.Field("schema").Text()!="ae-agent-ame-title-send.v1"||send.Field("callback").Text()!="result"||send.Field("code").Text()!="result"||send.Field("requestNonce").Text()!=args.Field("requestNonce").Text())Refuse("trusted_ame_original_BridgeTalk_result_unknown",0,true);
    // Raw duplicate-aware bounded parse precedes any field selection.
    const auto actual=ManifestJson(Bytes(raw.begin(),raw.end()));std::vector<const char*> keys={"schema","requestNonce","operationBinding","appSpecifier","sessionNonce","observedAt","code","nativeJobId","nativeAssociationVerified"};const auto operation=descriptor.Field("operation").Text();
    if(operation=="sources")keys.push_back("sourceGuids");else if(operation=="queue"){keys.push_back("batchRunning");keys.push_back("queue");}else{keys.push_back("batchRunning");keys.push_back("job");if(operation=="enqueue")keys.push_back("sourceGuids");else keys.push_back("start");}if(actual.kind!=capture::Json::Kind::Object||actual.keys.size()!=keys.size())Refuse("trusted_ame_exact_receiver_fields_required",0,true);for(const auto* key:keys)(void)actual.Field(key);
    if(actual.Field("schema").Text()!="ae-agent-ame-title-native.v1"||actual.Field("requestNonce").Text()!=args.Field("requestNonce").Text()||actual.Field("operationBinding").Text()!=args.Field("operationBinding").Text()||actual.Field("appSpecifier").Text()!=job->targetSpecifier_||!AmeProbeValid(actual.Field("sessionNonce"))||actual.Field("observedAt").kind!=capture::Json::Kind::Number||!CopyInteger(actual.Field("observedAt"))||actual.Field("nativeJobId").kind!=capture::Json::Kind::Null)Refuse("trusted_ame_original_receiver_origin_changed",0,true);
    if(operation!="sources"&&(job->probeNonceNull_?actual.Field("sessionNonce").kind!=capture::Json::Kind::Null:actual.Field("sessionNonce").kind!=capture::Json::Kind::String||actual.Field("sessionNonce").Text()!=job->nativeSessionNonce_))Refuse("trusted_ame_original_nullable_Probe_changed",0,true);
    if(operation=="sources"||operation=="enqueue"){std::size_t matches=0;for(const auto& guid:capture::Array(actual.Field("sourceGuids"),256))if(AmeCanonicalGuid(guid.Text())==AmeCanonicalGuid(job->sourceGuid_))++matches;if(matches!=1)Refuse("trusted_ame_exact_saved_snapshot_GUID_unavailable",0,true);}
    if(operation=="sources"){if(actual.Field("code").Text()!="sources_observed"||capture::Boolean(actual.Field("nativeAssociationVerified")))Refuse("trusted_ame_original_source_observation_required",0,true);
        if(job->slot_==2){const auto prior=data_->originalJobs[0];if(!prior||(prior->probeNonceNull_?actual.Field("sessionNonce").kind!=capture::Json::Kind::Null:actual.Field("sessionNonce").kind!=capture::Json::Kind::String||actual.Field("sessionNonce").Text()!=prior->nativeSessionNonce_))Refuse("trusted_ame_slot2_Probe_not_original",0,true);}return;}
    if(operation!="status"&&capture::Boolean(actual.Field("batchRunning")))Refuse("trusted_ame_original_batch_running",0,true);
    const auto validateEntry=[&](const capture::Json& entry,const std::shared_ptr<AmeOriginalJob>& expected,bool queued){capture::Fields(entry,{"handleKey","enqueueRequestNonce","retainedWrapperSessionNonce","sourcePath","sourceGuid","outputPath","presetIdentity","range","processBinding","nativeJobId","nativeAssociationVerified","status","nativeCompletionObserved","nativeResult","completionOrigin","eventObservedAt","hostCompletion","wrapperCompletion","readErrors","outputFiles","getEncodeProgress","getEncodeTime","rawLogCaptures","rawLogSnapshot"});
        if(!expected||expected->unknown_||entry.Field("handleKey").Text()!=expected->wrapperHandle_||entry.Field("enqueueRequestNonce").Text()!=expected->enqueueRequestNonce_||entry.Field("retainedWrapperSessionNonce").Text()!=data_->ownAmeWrapperNonce||entry.Field("sourcePath").Text()!=expected->sourcePath_||AmeCanonicalGuid(entry.Field("sourceGuid").Text())!=AmeCanonicalGuid(expected->sourceGuid_)||entry.Field("outputPath").Text()!=expected->outputPath_||entry.Field("presetIdentity").Text()!=expected->presetIdentity_||entry.Field("processBinding").Text()!=expected->processBinding_||entry.Field("nativeJobId").kind!=capture::Json::Kind::Null||!capture::Boolean(entry.Field("nativeAssociationVerified"))||!capture::Array(entry.Field("readErrors"),8).empty())Refuse("trusted_ame_original_EncoderWrapper_join_changed",0,true);
        const auto& output=capture::Array(entry.Field("outputFiles"),1);const auto& range=entry.Field("range");capture::Fields(range,{"startSeconds","endSeconds"});const auto state=ManifestJson(data_->savedSnapshots[expected->slot_-1]->actualPostSave);
        if(output.size()!=1||output[0].Text()!=expected->outputPath_||range.Field("startSeconds").Real()!=0||range.Field("endSeconds").Real()!=state.Field("graph").Field("duration").Real()||queued&&(entry.Field("status").Text()!="queued"||capture::Boolean(entry.Field("nativeCompletionObserved"))))Refuse("trusted_ame_original_output_range_or_queue_changed",0,true);
    };
    if(operation=="status"){validateEntry(actual.Field("job"),job,false);if(actual.Field("code").Text()!="job_observed"||!capture::Boolean(actual.Field("nativeAssociationVerified")))Refuse("trusted_original_wrapper_status_required",0,true);const auto& start=actual.Field("start");capture::Fields(start,{"requestNonce","accepted","invoked"});if(start.Field("requestNonce").Text()!=job->startRequestNonce_||!capture::Boolean(start.Field("accepted"))||!capture::Boolean(start.Field("invoked")))Refuse("trusted_original_poll_start_receipt_changed",0,true);return;}
    if(operation=="queue"){if(actual.Field("code").Text()!="owned_queue_observed"||capture::Boolean(actual.Field("nativeAssociationVerified")))Refuse("trusted_ame_original_queue_observation_required",0,true);const auto& queue=actual.Field("queue");capture::Fields(queue,{"expectedJobs","completedOwnedPrefix"});const auto& jobs=capture::Array(queue.Field("expectedJobs"),1),prefix=capture::Array(queue.Field("completedOwnedPrefix"),1);if(jobs.size()!=1||prefix.size()!=job->slot_-1)Refuse("trusted_ame_original_queue_census_size",0,true);
        validateEntry(jobs[0],job,true);if(!prefix.empty()){const auto prior=data_->originalJobs[0];if(!prior||prior->stage_!=AmeOriginalJob::Stage::MediaAccepted||!data_->restorationReceipts[0])Refuse("trusted_ame_original_queue_prefix_before_media_restore",0,true);validateEntry(prefix[0],prior,false);if(prefix[0].Field("status").Text()!="native_finished"||!capture::Boolean(prefix[0].Field("nativeCompletionObserved")))Refuse("trusted_ame_original_queue_prefix_incomplete",0,true);}return;}
    if(!capture::Boolean(actual.Field("nativeAssociationVerified")))Refuse("trusted_ame_original_native_association_required",0,true);validateEntry(actual.Field("job"),job,operation=="enqueue");
    if(operation=="enqueue"){if(actual.Field("code").Text()!="job_enqueued")Refuse("trusted_ame_original_enqueue_outcome_unknown",0,true);return;}
    capture::Fields(actual.Field("start"),{"requestNonce","invoked","accepted"});if(actual.Field("code").Text()!="batch_start_accepted"||actual.Field("start").Field("requestNonce").Text()!=job->startRequestNonce_||!capture::Boolean(actual.Field("start").Field("invoked"))||!capture::Boolean(actual.Field("start").Field("accepted")))Refuse("trusted_ame_original_START_outcome_unknown",0,true);
    if(!job->manualReservationAttempted_||!job->manualReservation_.Valid()||detail::Zero(job->manualReservationHash_))Refuse("trusted_ame_original_manual_marker_before_START_required",0,true);
}
void NativeClient::CommitOriginalAmeResult(const std::shared_ptr<ProjectCapture>& original,const std::shared_ptr<Capability>& terminal){
    auto& job=*original->originalAmeJob;const auto envelope=ManifestJson(original->originalResult);const auto raw=envelope.Field("send").Field("responseBody").Text();const auto actual=ManifestJson(Bytes(raw.begin(),raw.end()));
    if(original->ameSourceDelivery){if(original->tool==phase::ToolCode::InspectAmeTitleSources){job.probeNonceNull_=actual.Field("sessionNonce").kind==capture::Json::Kind::Null;job.nativeSessionNonce_=job.probeNonceNull_?std::string{}:actual.Field("sessionNonce").Text();for(const auto& guid:capture::Array(actual.Field("sourceGuids"),256))if(AmeCanonicalGuid(guid.Text())==AmeCanonicalGuid(job.sourceGuid_)){job.sourceGuid_=guid.Text();break;}job.sourceInspection_=terminal;job.sourceScriptHash_=original->script;job.sourceBodyHash_=original->originalBridgeTalkHash;job.stage_=AmeOriginalJob::Stage::SourceInspected;}
        else{job.queueInspection_=terminal;job.queueResult_=ManifestCanonical(actual.Field("queue"));}}
    if(original->ameEnqueueDelivery){job.enqueuedTerminal_=terminal;job.stage_=AmeOriginalJob::Stage::Enqueued;Bytes fields;detail::PutPin(fields,job.sourcePin_);Put(fields,job.sourceHash_);Put(fields,job.presetHash_);Put(fields,original->operationScope);Put(fields,original->script);Put(fields,original->originalBridgeTalkHash);job.selector_=DomainHash("lcp2.production.original-AME-selector.v1",fields);
        fields.clear();Put(fields,job.process_->imagePin_.sha256);detail::PutU32(fields,job.process_->pid_);detail::PutU64(fields,job.process_->birth_);Put(fields,job.process_->loadedExecutableSections_);Put(fields,job.session_);Put(fields,job.generation_);Put(fields,job.boot_);Put(fields,job.wrapperNonce_);Put(fields,job.wrapperHandle_);Put(fields,job.enqueueRequestNonce_);job.wrapperBinding_=DomainHash("lcp2.production.original-AME-wrapper.v1",fields);}
    if(original->ameStartDelivery){job.startTerminal_=terminal;job.startReceipt_=detail::Hash(original->originalResult);}
}
bool NativeClient::IsAmeCommand(const std::shared_ptr<Capability>& command){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();if(!command||command->owner_!=this||!command->project_||std::find(data_->projects.begin(),data_->projects.end(),command->project_)==data_->projects.end())Refuse("trusted_ame_original_command_required");return command->project_->originalAmeJob!=nullptr;}
void NativeClient::AssertAmeCommandCurrentFixed(const std::shared_ptr<Capability>& command){if(!IsAmeCommand(command)||command->project_->stage!=ProjectCapture::Stage::Guarded)Refuse("trusted_ame_original_D42_D43_required");AssertAmeDispatchCurrent(command->project_);}
Bytes NativeClient::AmeQueuePreparationFactsFixed(const std::shared_ptr<Capability>& originalQueueTerminal){RequireRole(Role::Daemon);auto& own=Require(originalQueueTerminal,CapKind::Terminal);AssertCapabilityCurrent(originalQueueTerminal);if(!own.project_||!own.project_->ameSourceDelivery||own.project_->tool!=phase::ToolCode::InspectAmeTitleQueueManifest||own.project_->stage!=ProjectCapture::Stage::Terminal||!own.project_->originalAmeJob)Refuse("trusted_ame_original_queue_terminal_required");const auto job=own.project_->originalAmeJob;
    if(job->queueInspection_!=originalQueueTerminal||job->unknown_||job->stage_!=AmeOriginalJob::Stage::Enqueued||data_->originalJobs[job->slot_-1]!=job||job->queueResult_.empty()||!job->process_->Current())Refuse("trusted_ame_original_queue_preparation_drift");
    if(job->queueManifest_.empty()){const auto queue=ManifestJson(job->queueResult_);const auto entry=[&](const std::shared_ptr<AmeOriginalJob>& expected,const capture::Json& observed,bool completed){
            if(!expected||expected->unknown_||expected->presetPath_.empty()||observed.Field("handleKey").Text()!=expected->wrapperHandle_)Refuse("trusted_ame_original_manual_manifest_entry");
            if(expected->presetId_.empty()){auto canonical=expected->presetPath_;for(auto& c:canonical){if(static_cast<unsigned char>(c)>127)Refuse("trusted_ame_preset_registry_path_unsupported");if(c>='A'&&c<='Z')c=static_cast<char>(c-'A'+'a');}Bytes key(canonical.begin(),canonical.end());key.push_back(0);const auto hash=ExecutionHex(expected->presetHash_);key.insert(key.end(),hash.begin(),hash.end());expected->presetId_="amep_"+ExecutionHex(detail::Hash(key)).substr(0,40);}
            const auto range=ManifestCanonical(observed.Field("range"));std::string text="{\"jobId\":"+ManifestQuote(expected->wrapperHandle_)+",\"handleKey\":"+ManifestQuote(expected->wrapperHandle_)+",\"enqueueRequestNonce\":"+ManifestQuote(expected->enqueueRequestNonce_)+",\"operationBinding\":"+ManifestQuote(expected->enqueueOperationBinding_)+",\"source\":{\"path\":"+ManifestQuote(expected->sourcePath_)+",\"sha25664\":\""+ExecutionHex(expected->sourceHash_)+"\",\"guid\":"+ManifestQuote(expected->sourceGuid_)+"},\"preset\":{\"path\":"+ManifestQuote(expected->presetPath_)+",\"sha25664\":\""+ExecutionHex(expected->presetHash_)+"\",\"id\":"+ManifestQuote(expected->presetId_)+"},\"outputPath\":"+ManifestQuote(expected->outputPath_)+",\"range\":"+std::string(range.begin(),range.end());
            if(completed){if(expected->stage_!=AmeOriginalJob::Stage::MediaAccepted||detail::Zero(expected->terminalReceipt_)||!expected->manualReservation_.Valid()||detail::Zero(expected->manualReservationHash_)||detail::Hash(detail::ReadExact(expected->manualReservation_.Get(),1048576))!=expected->manualReservationHash_)Refuse("trusted_ame_completed_prefix_original_marker_required");const auto& completion=observed.Field("hostCompletion");capture::Fields(completion,{"sourceFilePath","outputFilePath","result","observedAt"});if(completion.Field("sourceFilePath").Text()!=expected->sourcePath_||completion.Field("outputFilePath").Text()!=expected->outputPath_||completion.Field("result").Text()!="True"||!CopyInteger(completion.Field("observedAt")))Refuse("trusted_ame_completed_prefix_actual_completion");const auto encoded=ManifestCanonical(completion);text+=",\"batchId\":"+ManifestQuote(expected->batchId_)+",\"startReservationSha25664\":\""+ExecutionHex(expected->manualReservationHash_)+"\",\"completion\":"+std::string(encoded.begin(),encoded.end());}return text+"}";
        };
        const auto& rows=capture::Array(queue.Field("expectedJobs"),1),prefix=capture::Array(queue.Field("completedOwnedPrefix"),1);if(rows.size()!=1||prefix.size()!=job->slot_-1)Refuse("trusted_ame_manual_manifest_own_queue_count");const auto current=entry(job,rows[0],false),completed=prefix.empty()?std::string{}:entry(data_->originalJobs[0],prefix[0],true);const auto probe=job->probeNonceNull_?std::string("null"):ManifestQuote(job->nativeSessionNonce_);
        const auto text="{\"schema\":\"ae-agent-ame-manual-queue-manifest.v2\",\"targetSpecifier\":"+ManifestQuote(job->targetSpecifier_)+",\"batchId\":"+ManifestQuote(job->batchId_)+",\"process\":{\"pid\":"+std::to_string(job->process_->pid_)+",\"startedAt\":"+ManifestQuote(AmeBirthText(job->process_->birth_))+",\"path\":"+ManifestQuote(ManifestUtf8(AmeHeldDosPath(job->process_->image_.Get())))+"},\"processBinding\":"+ManifestQuote(job->processBinding_)+",\"nativeSessionNonce\":"+probe+",\"retainedWrapperSessionNonce\":"+ManifestQuote(job->wrapperNonce_)+",\"presetIdentity\":"+ManifestQuote(job->presetIdentity_)+",\"jobs\":["+current+"],\"completedOwnedPrefix\":["+completed+"]}";
        job->queueManifest_=ManifestCanonical(ManifestJson(Bytes(text.begin(),text.end())));job->queueManifestHash_=detail::Hash(job->queueManifest_);
    }
    std::string args="{\"targetSpecifier\":"+ManifestQuote(job->targetSpecifier_)+",\"expectedProcess\":{\"pid\":"+std::to_string(job->process_->pid_)+",\"startedAt\":"+ManifestQuote(AmeBirthText(job->process_->birth_))+"},\"timeoutMs\":10000,\"batchId\":"+ManifestQuote(job->batchId_)+",\"manualQueueMode\":\"cep_user_declaration_v2\",\"manualQueueManifestSha25664\":\""+ExecutionHex(job->queueManifestHash_)+"\",\"completedOwnedPrefix\":[";
    if(job->slot_==2){const auto& prior=*data_->originalJobs[0];args+="{\"batchId\":"+ManifestQuote(prior.batchId_)+",\"jobId\":"+ManifestQuote(prior.wrapperHandle_)+"}";}args+="]";if(!job->probeNonceNull_)args+=",\"expectedSessionNonce\":"+ManifestQuote(job->nativeSessionNonce_);args+="}";
    const auto text="{\"schema\":\"ae-agent.owned-native-ame-queue-preparation.v1\",\"slot\":"+std::to_string(job->slot_)+",\"manifest\":"+std::string(job->queueManifest_.begin(),job->queueManifest_.end())+",\"manifestSha25664\":\""+ExecutionHex(job->queueManifestHash_)+"\",\"args\":"+args+",\"nativeAuthority\":false}";return ManifestCanonical(ManifestJson(Bytes(text.begin(),text.end())));
}
Bytes NativeClient::AmeCommandFactsFixed(const std::shared_ptr<Capability>& command){if(!IsAmeCommand(command))Refuse("trusted_ame_original_command_facts_required");const auto& original=*command->project_;const auto& job=*original.originalAmeJob;
    if(job.unknown_||!job.process_||!job.process_->Current())Refuse("trusted_ame_original_facts_unknown");const auto& policy=EmbeddedProfile().execution;const auto file=policy.manualQueueReservationLocator+(policy.manualQueueReservationLocator.back()==L'\\'?L"":L"\\")+ManifestWide(job.batchId_+".json");
    const auto text="{\"schema\":\"ae-agent.owned-native-ame-command-facts.v1\",\"operation\":"+ManifestQuote(ManifestJson(original.preparationDescriptor).Field("operation").Text())+",\"slot\":"+std::to_string(job.slot_)+",\"descriptor\":"+std::string(original.preparationDescriptor.begin(),original.preparationDescriptor.end())+",\"expectedProcess\":{\"pid\":"+std::to_string(job.process_->pid_)+",\"startedAt\":"+ManifestQuote(AmeBirthText(job.process_->birth_))+"},\"reservationFile\":"+ManifestQuote(ManifestUtf8(file))+",\"sourceSha25664\":\""+ExecutionHex(job.sourceHash_)+"\",\"presetSha25664\":\""+ExecutionHex(job.presetHash_)+"\",\"presetId\":"+ManifestQuote(job.presetId_)+",\"bodySha25664\":\""+ExecutionHex(original.originalBridgeTalkHash)+"\",\"scriptSha25664\":\""+ExecutionHex(original.script)+"\",\"nativeAuthority\":false,\"replayAllowed\":false}";return Bytes(text.begin(),text.end());}
void NativeClient::CaptureOriginalAmeManualReservationFixed(const std::shared_ptr<Capability>& command,const Bytes& originalGetterReceipt){
    AssertAmeCommandCurrentFixed(command);const auto project=command->project_;const auto job=project->originalAmeJob;const auto& policy=EmbeddedProfile().execution;if(!project->ameStartDelivery||job->manualReservationAttempted_||job->manualReservation_.Valid())Refuse("trusted_ame_original_manual_reservation_once");job->manualReservationAttempted_=true;
    try{const auto proof=ManifestJson(originalGetterReceipt);capture::Fields(proof,{"schema","raw","rawSha25664"});if(proof.Field("schema").Text()!="ae-agent.owned-original-ame-manual-reservation.v1")Refuse("trusted_ame_original_manual_reservation_getter",0,true);const auto raw=proof.Field("raw").Text();if(raw.empty()||raw.size()>1048576)Refuse("trusted_ame_original_manual_marker_bound",0,true);
        auto root=std::make_unique<CheckedDirectory>(policy.manualQueueReservationRoot);if(!root->Current()||AmeHeldDosPath(root->directory.Get())!=policy.manualQueueReservationLocator)Refuse("trusted_ame_original_manual_root_selector",0,true);const auto name=ManifestWide(job->batchId_+".json");auto file=detail::Relative(root->directory.Get(),name,false,false,false,false,true);const auto bytes=detail::ReadExact(file.Get(),1048576);const auto hash=detail::Hash(bytes);
        if(bytes!=Bytes(raw.begin(),raw.end())||proof.Field("rawSha25664").Text()!=ExecutionHex(hash))Refuse("trusted_ame_original_manual_marker_readback",0,true);const auto marker=ManifestJson(bytes);const auto& receipt=marker.Field("manualQueueReceipt");const auto gate=project->executionGate->execution_;const auto controller=ManifestJson(OriginalRequestBody(gate->originalHandler->ingress_));const auto panel=ManifestJson(OriginalRequestBody(gate->originalPanelRequest));const auto& witness=panel.Field("ameManualQueueWitness");capture::Fields(witness,{"acceptedDryRunId","declaration","manifestHash","panelConnectionId","panelGeneration","trustedGesture"});
        const auto originalProposal=gate->proposalTerminal?gate->proposalTerminal->execution_:nullptr;
        if(!originalProposal||originalProposal->owner_!=this||originalProposal->stage!=ExecutionCapture::Stage::Prepared||originalProposal->tool!=phase::ToolCode::ProposeAiAgentPlan||
            originalProposal->result!=gate->proposal||originalProposal->result!=detail::Hash(originalProposal->originalProof)||originalProposal->scope!=gate->scope||originalProposal->slot!=gate->slot||originalProposal->leaf!=gate->leaf||
            originalProposal->actor!=gate->actor||originalProposal->originalManifest!=gate->originalManifest||std::find(data_->executionCaptures.begin(),data_->executionCaptures.end(),originalProposal)==data_->executionCaptures.end())
            Refuse("trusted_ame_original_manual_proposal_revision_join",0,true);
        const auto originalProposalProof=ManifestJson(originalProposal->originalProof);const auto& originalProposalPins=originalProposalProof.Field("result").Field("currentPlanPins");const auto originalRevision=CopyInteger(originalProposalPins.Field("revision"));
        if(!originalRevision||originalProposalPins.Field("actionId").Text()!=controller.Field("args").Field("actionId").Text()||originalProposalPins.Field("payloadHash").Text()!=controller.Field("args").Field("payloadHash").Text()||originalProposalPins.Field("previewHash").Text()!=controller.Field("args").Field("previewHash").Text())
            Refuse("trusted_ame_original_manual_proposal_revision_pins",0,true);
        if(marker.Field("schema").Text()!="ae-agent-ame-title-start-reservation.v1"||marker.Field("batchId").Text()!=job->batchId_||marker.Field("requestNonce").Text()!=job->startRequestNonce_||marker.Field("operationBinding").Text()!=job->startOperationBinding_||marker.Field("state").Text()!="unknown_outcome"||capture::Boolean(marker.Field("transportResolved"))||!capture::Boolean(marker.Field("lastDispatchGuardVerified"))||
            receipt.Field("batchId").Text()!=job->batchId_||receipt.Field("manifestHash").Text()!=ExecutionHex(job->queueManifestHash_)||ManifestCanonical(receipt.Field("manifest"))!=job->queueManifest_||receipt.Field("proofSource").Text()!="authenticated_cep_user_declaration"||capture::Boolean(receipt.Field("physicalHumanVerified"))||capture::Boolean(receipt.Field("nativeQueueCompositionVerified"))||
            receipt.Field("actionId").Text()!=controller.Field("args").Field("actionId").Text()||CopyInteger(receipt.Field("revision"))!=originalRevision||receipt.Field("payloadHash").Text()!=controller.Field("args").Field("payloadHash").Text()||receipt.Field("previewHash").Text()!=controller.Field("args").Field("previewHash").Text()||
            receipt.Field("runId").Text()!=AmeIdText(gate->call)||!gate->dryRunTerminal||!gate->dryRunTerminal->project_||receipt.Field("dryRunReceipt").Field("runId").Text()!=AmeIdText(gate->dryRunTerminal->project_->execution)||
            witness.Field("manifestHash").Text()!=ExecutionHex(job->queueManifestHash_)||!capture::Boolean(witness.Field("trustedGesture"))||receipt.Field("declaration").Text()!=witness.Field("declaration").Text()||receipt.Field("panelConnectionId").Text()!=data_->panelConnection||receipt.Field("panelGeneration").Text()!=data_->panelGeneration||witness.Field("panelConnectionId").Text()!=data_->panelConnection||witness.Field("panelGeneration").Text()!=data_->panelGeneration)
            Refuse("trusted_ame_original_manual_receipt_actor_scope_join",0,true);
        const auto pin=detail::ReadPin(file.Get(),false);if(pin.canonicalPath!=policy.manualQueueReservationRoot.canonicalPath+L"\\"+name)Refuse("trusted_ame_original_manual_marker_identity",0,true);auto named=detail::Relative(root->directory.Get(),name,false,false,false,false,true);
        if(!detail::SamePin(detail::ReadPin(named.Get(),false),pin)||detail::ReadExact(named.Get(),1048576)!=bytes||!root->Current())Refuse("trusted_ame_original_manual_marker_named_drift",0,true);job->manualReservationPin_=pin;job->manualReservationHash_=hash;job->manualReservationBytes_=bytes;job->manualReservation_=std::move(file);job->manualReservationRoot_=std::move(root->directory);for(auto& parent:root->parents)job->fileAncestors_.push_back(std::move(parent));AssertAmeCommandCurrentFixed(command);
    }catch(...){job->unknown_=true;job->stage_=AmeOriginalJob::Stage::Unknown;data_->unknown=true;throw;}
}
Bytes NativeClient::OriginalCompletionPollDescriptorFixed(const std::shared_ptr<Capability>& cap){auto& own=Require(cap,CapKind::OriginalJob);const auto job=own.job_;AssertOriginalJobObservationCurrent(job);AssertOriginalAmeUniqueCurrent(job);const auto now=GetTickCount64();
    if(!job||job->stage_!=AmeOriginalJob::Stage::Started||job->pendingPoll_||job->terminalAttempted_||job->mediaReservation_||job->nextPoll_>EmbeddedProfile().execution.completionPollsPerJob||now<job->nextPollAt_||job->deadline_-now<=10000+kTwoTitleMediaMaximumMs)Refuse("trusted_original_poll_prepare_closed");
    if(!job->preparingPoll_){auto project=std::make_shared<ProjectCapture>();project->inspection=true;project->ameCompletionDelivery=true;project->originalAmeJob=job;project->tool=phase::ToolCode::GetAmeTitleJobStatus;project->command=detail::RandomId();project->execution=detail::RandomId();project->lease=detail::RandomId();project->actor=job->originalActor_;project->panelConnection=data_->panelConnection;project->panelGeneration=data_->panelGeneration;project->expiry=now+10000;
        job->pollRequestNonce_=detail::RandomId();const auto original=ManifestJson(job->enqueuedTerminal_->project_->preparationDescriptor);auto descriptor=original;CopySetText(MutableField(descriptor,"operation"),"status");auto& args=MutableField(descriptor,"args");CopySetText(MutableField(args,"operation"),"status");CopySetText(MutableField(args,"requestNonce"),AmeIdText(job->pollRequestNonce_));
        Bytes operation;Put(operation,job->jobRef_);Put(operation,job->grantHash_);Put(operation,job->selector_);Put(operation,job->wrapperBinding_);detail::PutU64(operation,job->nextPoll_);Put(operation,job->pollRequestNonce_);Put(operation,job->originalActor_);CopySetText(MutableField(args,"operationBinding"),ExecutionHex(DomainHash("lcp2.production.original-status-operation.v1",operation)));
        project->preparationDescriptor=ManifestCanonical(descriptor);job->preparingPoll_=project;data_->projects.push_back(project);job->pollPreparing_=true;
    }
    if(job->preparingPoll_->stage!=ProjectCapture::Stage::Bound||now>=job->preparingPoll_->expiry)Refuse("trusted_original_poll_preparation_expired");return job->preparingPoll_->preparationDescriptor;
}
std::shared_ptr<Capability> NativeClient::BeginOriginalCompletionPollFixed(const std::shared_ptr<Capability>& originalJob,const std::string& source,const std::string& bridgeTalkBody){
    const auto descriptor=OriginalCompletionPollDescriptorFixed(originalJob);const auto job=originalJob->job_;const auto project=job->preparingPoll_;const auto now=GetTickCount64();
    if(source.empty()||source.size()>1048576||source.find('\0')!=std::string::npos||bridgeTalkBody.empty()||bridgeTalkBody.size()>524288||bridgeTalkBody.find('\0')!=std::string::npos||source.find(AmeMessageLiteral(bridgeTalkBody))==std::string::npos||source.find(ExecutionHex(detail::Hash(descriptor)))==std::string::npos)Refuse("trusted_original_poll_complete_script_binding");
    project->originalScript=source;project->script=detail::Hash(Bytes(source.begin(),source.end()));project->originalBridgeTalkBody=bridgeTalkBody;project->originalBridgeTalkHash=detail::Hash(Bytes(bridgeTalkBody.begin(),bridgeTalkBody.end()));
    Bytes commit;Put(commit,job->jobRef_);Put(commit,job->grantHash_);Put(commit,job->selector_);Put(commit,job->wrapperBinding_);Put(commit,job->sourceHash_);Put(commit,job->originalActor_);detail::PutU64(commit,job->nextPoll_);Put(commit,project->command);Put(commit,project->execution);Put(commit,project->lease);Put(commit,project->script);Put(commit,project->originalBridgeTalkHash);Put(commit,detail::Hash(descriptor));job->pollCommit_=DomainHash("lcp2.production.original-private-poll-observation.v1",commit);
    Bytes body;Put(body,job->jobRef_);detail::PutU64(body,job->nextPoll_);Put(body,job->pollCommit_);detail::PutU16(body,static_cast<std::uint16_t>(phase::CompletionOperation::OriginalWrapperStatus));job->activePoll_=job->nextPoll_++;job->pollPreparing_=false;
    try{AssertOriginalAmeUniqueCurrent(job);const auto reply=Exchange(phase::Verb::BeginCompletionPoll,body);job->pollRef_=Fixed<16>(reply.payload.data());job->pollNonce_=Fixed<16>(reply.payload.data()+16);job->pollExpiry_=Number(reply.payload.data()+32,8);job->pollBinding_=Fixed<32>(reply.payload.data()+40);
        const auto receivedNow=GetTickCount64();if(detail::Zero(job->pollRef_)||detail::Zero(job->pollNonce_)||job->pollExpiry_<=receivedNow||job->pollExpiry_-receivedNow>10000||job->pollExpiry_>=job->deadline_)Refuse("trusted_d48_original_reply_unknown",0,true);
        Bytes fields;Put(fields,job->session_);Put(fields,job->generation_);Put(fields,job->boot_);Put(fields,job->jobRef_);Put(fields,job->grantHash_);Put(fields,job->selector_);Put(fields,job->wrapperBinding_);Put(fields,job->startReceipt_);Put(fields,job->originalActor_);Put(fields,job->pollRef_);Put(fields,job->pollNonce_);Put(fields,job->pollCommit_);detail::PutU64(fields,job->activePoll_);detail::PutU64(fields,job->pollExpiry_);
        if(job->pollBinding_!=DomainHash("lcp2.production.original-current-poll.v1",fields))Refuse("trusted_d48_original_poll_binding_unknown",0,true);project->expiry=(std::min)(job->pollExpiry_,now+10000);
        auto poll=Own(CapKind::CompletionPoll,reply);poll->project_=project;poll->job_=job;job->pendingPoll_=poll;job->preparingPoll_.reset();AssertOriginalCompletionPollCurrent(poll);return poll;
    }catch(...){job->unknown_=true;job->stage_=AmeOriginalJob::Stage::Unknown;project->stage=ProjectCapture::Stage::Unknown;data_->unknown=true;throw;}
}
bool NativeClient::IsOriginalCompletionPoll(const std::shared_ptr<Capability>& cap){RequireRole(Role::Daemon);return cap&&cap->owner_==this&&cap->kind_==CapKind::CompletionPoll&&cap->project_&&cap->project_->ameCompletionDelivery&&std::find(data_->projects.begin(),data_->projects.end(),cap->project_)!=data_->projects.end();}
void NativeClient::AbandonOriginalCompletionPollFixed(const std::shared_ptr<Capability>& cap){if(!IsOriginalCompletionPoll(cap)||!cap->job_||cap->job_->pendingPoll_!=cap||cap->spent_)Refuse("trusted_original_poll_abandonment_owner_required");cap->spent_=true;cap->job_->unknown_=true;cap->job_->stage_=AmeOriginalJob::Stage::Unknown;cap->project_->stage=ProjectCapture::Stage::Unknown;data_->unknown=true;}
Bytes NativeClient::OriginalCompletionFactsFixed(const std::shared_ptr<Capability>& cap){const auto job=Require(cap,CapKind::OriginalJob).job_;AssertOriginalJobObservationCurrent(job);const auto now=GetTickCount64();const bool complete=job->stage_==AmeOriginalJob::Stage::SuccessfulTerminal&&job->acceptedTerminal_&&job->mediaReservation_&&job->mediaReservation_->complete&&!job->mediaReservation_->unknown;
    const auto remaining=job->nextPoll_<=kTwoTitlePollsPerJob?kTwoTitlePollsPerJob-job->nextPoll_+1:0;const auto wait=job->nextPollAt_>now?job->nextPollAt_-now:0;
    const auto text="{\"schema\":\"ae-agent.owned-original-completion-state.v1\",\"complete\":"+std::string(complete?"true":"false")+",\"remainingPolls\":"+std::to_string(remaining)+",\"nextPollDelayMs\":"+std::to_string(wait)+",\"remainingJobMs\":"+std::to_string(job->deadline_-now)+",\"nativeAuthority\":false}";return Bytes(text.begin(),text.end());}
void NativeClient::AssertOriginalCompletionPollCurrent(const std::shared_ptr<Capability>& cap){if(!IsOriginalCompletionPoll(cap)||cap->spent_||!cap->job_||cap->job_->pendingPoll_!=cap||cap->job_->pollRef_!=Fixed<16>(cap->frame_.payload.data())||cap->job_->pollNonce_!=Fixed<16>(cap->frame_.payload.data()+16)||cap->job_->activePoll_+1!=cap->job_->nextPoll_||GetTickCount64()>=cap->job_->pollExpiry_)Refuse("trusted_current_original_poll_required",0,true);AssertAmeDispatchCurrent(cap->project_);}
ProjectDescriptor NativeClient::DescribeOriginalCompletionPollFixed(const std::shared_ptr<Capability>& cap){AssertOriginalCompletionPollCurrent(cap);const auto& project=*cap->project_;ProjectDescriptor result;result.command=project.command;result.execution=project.execution;result.lease=project.lease;result.script=project.originalScript;result.expiresMono=project.expiry;return result;}
std::shared_ptr<Capability> NativeClient::SelectOriginalCompletionPollFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request){AssertOriginalCompletionPollCurrent(cap);const auto project=cap->project_;(void)OriginalRequestBody(request);
    if(project->stage!=ProjectCapture::Stage::Bound||!request->panel_||request->fields_.method!="GET"||request->fields_.url.rfind("/bridge/next?",0)!=0||request->responseTerminal_||request->unknown_)Refuse("trusted_original_poll_socket_once",0,true);project->deliveryRequest=request;project->stage=ProjectCapture::Stage::Guarded;return cap;}
void NativeClient::RecordOriginalCompletionPollDeliveryFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){AssertOriginalCompletionPollCurrent(cap);auto& project=*cap->project_;(void)OriginalRequestBody(request);
    if(project.stage!=ProjectCapture::Stage::Guarded||project.deliveryRequest!=request||!request->panel_||!actual.success||actual.command!=project.command||actual.execution!=project.execution||actual.lease!=project.lease||actual.result!=Bytes(project.originalScript.begin(),project.originalScript.end())||actual.panelConnection!=project.panelConnection||actual.panelGeneration!=project.panelGeneration)Refuse("trusted_original_poll_actual_delivery_mismatch",0,true);
    Bytes fields;Put(fields,cap->job_->pollBinding_);Put(fields,project.command);Put(fields,project.execution);Put(fields,project.lease);Put(fields,project.script);Put(fields,detail::Hash(request->fields_.body));project.receipt=DomainHash("lcp2.production.original-poll-actual-delivery.v1",fields);project.stage=ProjectCapture::Stage::Delivered;
}
std::shared_ptr<Capability> NativeClient::CaptureOriginalJobObservationFixed(const std::shared_ptr<Capability>& cap,const std::shared_ptr<AuthenticatedRequest>& request,const PanelReceipt& actual){AssertOriginalCompletionPollCurrent(cap);const auto project=cap->project_;const auto job=cap->job_;(void)OriginalRequestBody(request);
    if(project->stage!=ProjectCapture::Stage::Submitted||!request->panel_||request->fields_.url!="/bridge/result"||request->fields_.method!="POST"||!actual.success||actual.command!=project->command||actual.execution!=project->execution||actual.lease!=project->lease||actual.panelConnection!=project->panelConnection||actual.panelGeneration!=project->panelGeneration||actual.result.empty()||actual.result.size()>1048576)Refuse("trusted_original_poll_actual_result_required",0,true);
    try{ValidateOriginalAmeResult(project,actual.result);const auto envelope=ManifestJson(actual.result);const auto raw=envelope.Field("send").Field("responseBody").Text();const auto observed=ManifestJson(Bytes(raw.begin(),raw.end()));const auto& entry=observed.Field("job");const auto finished=capture::Boolean(entry.Field("nativeCompletionObserved"));bool successful=false;
        if(finished){const auto& completion=entry.Field("hostCompletion");capture::Fields(completion,{"sourceFilePath","outputFilePath","result","observedAt"});const auto eventAt=CopyInteger(completion.Field("observedAt")),seenAt=CopyInteger(observed.Field("observedAt"));
            const auto startEnvelope=ManifestJson(job->startTerminal_->project_->originalResult);const auto startRaw=startEnvelope.Field("send").Field("responseBody").Text();const auto startObserved=CopyInteger(ManifestJson(Bytes(startRaw.begin(),startRaw.end())).Field("observedAt"));
            if(entry.Field("status").Text()!="native_finished"||entry.Field("completionOrigin").Text()!="host_exact_paths"||completion.Field("sourceFilePath").Text()!=job->sourcePath_||completion.Field("outputFilePath").Text()!=job->outputPath_||completion.Field("result").Text()!="True"||eventAt<startObserved||eventAt>seenAt||entry.Field("nativeResult").Text()!="True")Refuse("trusted_original_poll_completion_not_successful",0,true);successful=true;
        }else if(entry.Field("status").Text()!="queued"&&entry.Field("status").Text()!="running")Refuse("trusted_original_poll_nonterminal_not_factual",0,true);
        Bytes factual;Put(factual,detail::Hash(actual.result));Put(factual,project->receipt);Put(factual,project->script);Put(factual,project->originalBridgeTalkHash);Put(factual,job->pollBinding_);Put(factual,detail::Hash(request->fields_.body));
        if(successful){if(job->terminalAttempted_||job->mediaReservation_||job->output_.Valid())Refuse("trusted_original_terminal_once",0,true);job->terminalAttempted_=true;job->output_=detail::Relative(job->outputRoot_.Get(),job->outputName_,false,false,false,false,true);std::uint64_t outputBytes=0;job->outputPin_=detail::ReadPin(job->output_.Get(),false,&outputBytes);
            if(!outputBytes||job->outputPin_.canonicalPath!=job->outputRootPin_.canonicalPath+L"\\"+job->outputName_)Refuse("trusted_original_terminal_output_selector",0,true);job->outputHash_=media_children::OriginalChild::HashOriginalOutputForOwner(job->output_.Get(),job->pollExpiry_);auto named=detail::Relative(job->outputRoot_.Get(),job->outputName_,false,false,false,false,true);if(!detail::SamePin(detail::ReadPin(named.Get(),false),job->outputPin_))Refuse("trusted_original_terminal_output_named_join",0,true);detail::PutPin(factual,job->outputPin_);Put(factual,job->outputHash_);detail::PutU64(factual,outputBytes);}
        const auto receipt=DomainHash("lcp2.production.original-poll-factual-receipt.v1",factual);Bytes join;Put(join,job->session_);Put(join,job->generation_);Put(join,job->boot_);Put(join,job->jobRef_);Put(join,job->grantHash_);Put(join,job->selector_);Put(join,job->wrapperBinding_);Put(join,job->startReceipt_);Put(join,job->originalActor_);Put(join,job->pollRef_);Put(join,job->pollNonce_);Put(join,job->pollBinding_);detail::PutU64(join,job->activePoll_);Put(join,receipt);const auto binding=DomainHash(successful?"lcp2.production.original-successful-terminal.v1":"lcp2.production.original-nonterminal-observation.v1",join);
        Bytes body;Put(body,job->jobRef_);Put(body,job->pollRef_);Put(body,receipt);Put(body,binding);AssertOriginalCompletionPollCurrent(cap);cap->spent_=true;const auto reply=Exchange(phase::Verb::ObserveJobTerminal,body);
        const auto ref=Fixed<16>(reply.payload.data()+1);const auto reserved=Fixed<32>(reply.payload.data()+17);const auto sequence=Number(reply.payload.data()+49,8),epoch=Number(reply.payload.data()+57,8);const auto head=Fixed<32>(reply.payload.data()+65);
        if(reply.payload[0]!=1||detail::Zero(ref)||detail::Zero(reserved)||!sequence||!epoch||detail::Zero(head)||GetTickCount64()>=job->pollExpiry_||(!successful&&(ref!=job->pollRef_||reserved!=receipt)))Refuse("trusted_d49_original_terminal_reply_unknown",0,true);
        project->originalResult=actual.result;project->terminalMono=GetTickCount64();project->stage=ProjectCapture::Stage::Terminal;auto terminal=Own(CapKind::Terminal,reply);terminal->project_=project;terminal->job_=job;
        if(successful){auto reservation=std::make_unique<AmeOriginalJob::MediaReservation>();reservation->terminal=ref;reservation->poll=job->pollRef_;reservation->hash=reserved;reservation->sequence=sequence;reservation->epoch=epoch;reservation->head=head;reservation->outputPin=job->outputPin_;reservation->outputHash=job->outputHash_;
            const auto& profile=data_->originalSeal->ResolvedEnrollment();Bytes scope;Put(scope,profile.installation);detail::PutPin(scope,profile.repository);detail::PutPin(scope,profile.runtime);detail::PutPin(scope,profile.journal);detail::PutPin(scope,profile.lockFile);const auto enrollmentScope=detail::Hash(scope);
            for(std::size_t index=0;index<reservation->keys.size();++index){Bytes key;constexpr char domain[]="native-dispatch-stable-effect.v2";key.insert(key.end(),domain,domain+sizeof(domain)-1);Put(key,enrollmentScope);Put(key,profile.installation);Put(key,profile.lineage);detail::PutU16(key,job->slot_);Put(key,FixedOriginalCompletionLeaf(EmbeddedProfile().execution,job->slot_,static_cast<std::uint16_t>(index+3)));detail::PutU16(key,13);reservation->keys[index]=detail::Hash(key);}
            reservation->complete=true;job->mediaReservation_=std::move(reservation);job->terminalRef_=ref;job->terminalReceipt_=receipt;job->finalPoll_=job->activePoll_;job->acceptedTerminal_=terminal;job->mediaChildAllowance_=6;job->stage_=AmeOriginalJob::Stage::SuccessfulTerminal;
        }else job->nextPollAt_=project->terminalMono+EmbeddedProfile().execution.completionCadenceMs;
        job->pendingPoll_.reset();return terminal;
    }catch(...){job->unknown_=true;job->stage_=AmeOriginalJob::Stage::Unknown;project->stage=ProjectCapture::Stage::Unknown;if(job->mediaReservation_)job->mediaReservation_->unknown=true;data_->unknown=true;throw;}
}
std::shared_ptr<Capability> NativeClient::BindOriginalJobFixed(const std::shared_ptr<Capability>& successfulStartTerminal){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();auto& terminal=Require(successfulStartTerminal,CapKind::Terminal);const auto project=terminal.project_;
    if(!project||project->stage!=ProjectCapture::Stage::Terminal||project->originalResult.empty()||!project->executionGate||!project->executionGate->execution_||
        project->executionGate->execution_->tool!=phase::ToolCode::RunAiAgentPlan||project->executionGate->execution_->leaf!=ExecutionLeaf::StartAme||
        !project->originalAmeJob||project->originalAmeJob->owner_!=this)Refuse("trusted_d47_original_successful_START_required");
    const auto job=project->originalAmeJob;const auto row=project->executionGate->execution_;const auto now=GetTickCount64();const auto& policy=EmbeddedProfile().execution;
    if(job->slot_<1||job->slot_>2||row->slot!=job->slot_||row->actor!=job->originalActor_||row->actor!=data_->observationActor||job->unknown_||job->d47Attempted_||
        job->stage_!=AmeOriginalJob::Stage::StartSelected||job->startTerminal_!=successfulStartTerminal||job->process_!=data_->ame||!job->process_||!job->process_->Current()||
        !job->enqueuedTerminal_||!job->enqueuedTerminal_->project_||job->enqueuedTerminal_->project_->stage!=ProjectCapture::Stage::Terminal||!job->sourceInspection_||!job->savedSnapshot_||!job->manualReservation_.Valid()||detail::Zero(job->manualReservationHash_)||
        data_->originalJobs[job->slot_-1]!=job||detail::Zero(job->selector_)||detail::Zero(job->wrapperBinding_)||detail::Zero(job->startReceipt_)||
        job->startReceipt_!=detail::Hash(project->originalResult)||!project->terminalMono||now<project->terminalMono||now-project->terminalMono>10000||now>=project->expiry||
        !policy.completionPollsPerJob||policy.completionPollsPerJob>kTwoTitlePollsPerJob||!policy.jobDeadlineMs||!data_->bootstrap||now>=data_->bootstrap->sessionDeadline)
        Refuse("trusted_d47_original_job_start_lineage_changed");
    if(job->slot_==2&&(!data_->originalJobs[0]||data_->originalJobs[0]->unknown_||data_->originalJobs[0]->stage_!=AmeOriginalJob::Stage::MediaAccepted))Refuse("trusted_d47_slot2_before_original_media");
    AssertCapabilityCurrent(job->savedSnapshot_);AssertCapabilityCurrent(job->sourceInspection_);(void)OriginalRequestBody(row->originalPanelRequest);(void)OriginalRequestBody(row->originalHandler->ingress_);
    if(!job->source_.Valid()||!job->preset_.Valid()||!job->outputRoot_.Valid()||!detail::SamePin(detail::ReadPin(job->source_.Get(),false),job->sourcePin_)||
        detail::Hash(detail::ReadExact(job->source_.Get(),134217728))!=job->sourceHash_||!detail::SamePin(detail::ReadPin(job->preset_.Get(),false),job->presetPin_)||
        detail::Hash(detail::ReadExact(job->preset_.Get(),16777216))!=job->presetHash_||!detail::SamePin(detail::ReadPin(job->outputRoot_.Get(),true),job->outputRootPin_))Refuse("trusted_d47_original_file_witness_changed");
    Bytes body;Put(body,Fixed<16>(terminal.frame_.payload.data()+1));Put(body,job->selector_);Put(body,job->wrapperBinding_);Put(body,job->startReceipt_);
    job->d47Attempted_=true;try{const auto reply=Exchange(phase::Verb::BindOriginalJob,body);const auto deadline=Number(reply.payload.data()+48,8),polls=Number(reply.payload.data()+56,4);
        if(deadline<=now||deadline>data_->bootstrap->sessionDeadline||deadline-now>policy.jobDeadlineMs||polls!=policy.completionPollsPerJob||detail::Zero(Fixed<16>(reply.payload.data()))||detail::Zero(Fixed<32>(reply.payload.data()+16)))Refuse("trusted_d47_original_completion_grant_reply",0,true);
        job->jobRef_=Fixed<16>(reply.payload.data());job->grantHash_=Fixed<32>(reply.payload.data()+16);job->issued_=now;job->deadline_=deadline;job->nextPoll_=1;job->mediaChildAllowance_=0;job->rawReadAllowance_=3;
        job->stage_=AmeOriginalJob::Stage::Started;auto cap=Own(CapKind::OriginalJob,reply);cap->job_=job;AssertOriginalJobObservationCurrent(job);return cap;
    }catch(...){job->unknown_=true;job->stage_=AmeOriginalJob::Stage::Unknown;data_->unknown=true;throw;}
}
void NativeClient::AssertOriginalJobObservationCurrent(const std::shared_ptr<AmeOriginalJob>& original){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    if(!original||original->owner_!=this||original->unknown_||!original->process_||original->process_!=data_->ame||!original->process_->Current()||
        original->session_!=data_->wire->bindings_.sessionRef||original->generation_!=data_->wire->bindings_.generation||original->boot_!=data_->wire->bindings_.bootNonce||
        detail::Zero(original->jobRef_)||detail::Zero(original->selector_)||detail::Zero(original->startReceipt_)||detail::Zero(original->grantHash_)||
        (original->stage_!=AmeOriginalJob::Stage::Started&&original->stage_!=AmeOriginalJob::Stage::SuccessfulTerminal&&original->stage_!=AmeOriginalJob::Stage::MediaAccepted)||
        !original->source_.Valid()||!original->preset_.Valid()||!original->outputRoot_.Valid()||
        !detail::SamePin(detail::ReadPin(original->source_.Get(),false),original->sourcePin_)||detail::Hash(detail::ReadExact(original->source_.Get(),134217728))!=original->sourceHash_||
        !detail::SamePin(detail::ReadPin(original->preset_.Get(),false),original->presetPin_)||detail::Hash(detail::ReadExact(original->preset_.Get(),16777216))!=original->presetHash_||
        !detail::SamePin(detail::ReadPin(original->outputRoot_.Get(),true),original->outputRootPin_)||
        !original->manualReservation_.Valid()||!original->manualReservationRoot_.Valid()||!detail::SamePin(detail::ReadPin(original->manualReservation_.Get(),false),original->manualReservationPin_)||detail::Hash(detail::ReadExact(original->manualReservation_.Get(),1048576))!=original->manualReservationHash_||!detail::SamePin(detail::ReadPin(original->manualReservationRoot_.Get(),true),EmbeddedProfile().execution.manualQueueReservationRoot)||
        original->slot_<1||original->slot_>2||data_->originalJobs[original->slot_-1]!=original||original->originalActor_!=data_->observationActor||original->targetSpecifier_!=EmbeddedProfile().execution.ameTargetSpecifier||
        !original->issued_||GetTickCount64()<original->issued_||GetTickCount64()>=original->deadline_)
        Refuse("trusted_original_job_observation_closed");
    AssertLoadedNodeCurrent();
}
void NativeClient::CompleteAuthenticatedResponse(const std::shared_ptr<AuthenticatedRequest>& request,std::uint32_t status,const Bytes& bytes){
    RequireRole(Role::Daemon);AssertLoadedNodeCurrent();if(!request||request->owner_!=this||request->responseTerminal_||request->unknown_||status<100||status>599||bytes.size()>1048576)Refuse("trusted_authenticated_response_terminal_refused");
    request->responseTerminal_=true;
}
void NativeClient::CompleteOriginalIdleRequestCleanup(const std::shared_ptr<AuthenticatedRequest>& request){
    RequireRole(Role::Daemon);if(!request||request->owner_!=this||!request->connection_)Refuse("trusted_original_idle_request_required");
    // Capture releases its metadata lock before client.serial. The repeated
    // Confirm below takes no I/O lock and never calls an owner guard.
    const auto actual=request->connection_->CaptureRequestIoSnapshot();std::lock_guard<std::mutex> lock(data_->serial);
    if(!request->idleCandidate_||request->idleDisqualified_.load(std::memory_order_acquire)||request->handlerSpent_||request->responseTerminal_||request->unknown_||request->cleanupAttempted_)
        Refuse("trusted_original_idle_request_ineligible");
    if(!data_->bootstrap||!data_->httpOwner||data_->httpOwner==this||!data_->loadedSources||data_->unknown)Refuse("trusted_original_idle_owner_or_source_closed",0,true);
    const auto samePanel=[&](){return data_->sourceGeneration&&request->fields_.panelConnection==data_->panelConnection&&request->fields_.panelGeneration==data_->panelGeneration&&
        request->fields_.panelInstance==data_->panelInstance&&request->fields_.panelEpoch==data_->panelEpoch;};
    if(!samePanel())Refuse("trusted_original_idle_panel_identity_changed",0,true);
    const auto now=GetTickCount64();const bool knownRevoke=data_->revoked||data_->actorClosed||now>=data_->bootstrap->sessionDeadline;
    if(!knownRevoke||!data_->drainObserved)Refuse("trusted_original_idle_cleanup_pending");
    if(!CheckOriginalHttpCleanupLocked(*data_->httpOwner,HttpCleanupOperation::Close))Refuse("trusted_original_idle_bracket_or_clock_closed",0,true);
    request->cleanupAttempted_=true; // consumed before any terminal state change
    try{const auto& original=request->ioAtRetain_;
        if(actual.owner!=data_->httpOwner||original.owner!=actual.owner||original.original!=actual.original||original.lifetime!=actual.lifetime||original.originalSocket!=actual.originalSocket||
            !request->connection_->ConfirmOriginalRequestIoSnapshot(actual,original.writeAttemptOrdinal)||!samePanel()||request->idleDisqualified_.load(std::memory_order_acquire)||request->unknown_||
            !CheckOriginalHttpCleanupLocked(*data_->httpOwner,HttpCleanupOperation::Close))Refuse("trusted_original_idle_terminal_unknown",0,true);
        request->responseTerminal_.store(true,std::memory_order_release);
    }catch(...){request->unknown_=true;data_->unknown=true;throw;}
}
void NativeClient::FailAuthenticatedResponse(const std::shared_ptr<AuthenticatedRequest>& request)noexcept{if(request&&request->owner_==this)request->unknown_=true;}
void NativeClient::AssertFixedDaemonModule(const std::wstring& filename){RequireRole(Role::Daemon);AssertLoadedNodeCurrent();
    const reviewed::File* expected=nullptr;for(const auto& file:data_->originalSeal->ResolvedEnrollment().sourceFiles)if(file.components==std::vector<std::wstring>{L"mcp-server",L"bridge-daemon.js"}){if(expected)Refuse("trusted_fixed_main_source_ambiguous");expected=&file;}
    if(!expected||filename.empty()||filename.find(L'\0')!=std::wstring::npos)Refuse("trusted_fixed_main_source_required");
    Held actual(CreateFileW(filename.c_str(),FILE_READ_DATA|FILE_READ_ATTRIBUTES,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!actual.Valid()||!detail::SamePin(detail::ReadPin(actual.Get(),false),expected->pin)||detail::Hash(detail::ReadExact(actual.Get(),134217728))!=expected->sha256)Refuse("trusted_fixed_main_source_refused");AssertLoadedNodeCurrent();
}
} // namespace local_session::trusted_read
