#include "ame_native_media_children.h"
#include <windows.h>
#include <bcrypt.h>
#include <algorithm>
#include <array>
#include <limits>
#include <utility>

namespace local_session::trusted_read::media_children {
namespace {
using detail::Held;
using detail::Refuse;
constexpr std::size_t kJsonBytes=1048576,kStderrBytes=65536,kRgbaBytes=67108864;
constexpr std::uint64_t kToolBytes=134217728;
constexpr DWORD kPipeBytes=16384;
constexpr std::array<std::uint64_t,6> kDeadlineMs{{30000,30000,120000,120000,120000,120000}};
bool Valid(HANDLE handle)noexcept{return handle&&handle!=INVALID_HANDLE_VALUE;}
bool SameText(const std::wstring& a,const std::wstring& b){
    return CompareStringOrdinal(a.c_str(),static_cast<int>(a.size()),b.c_str(),static_cast<int>(b.size()),TRUE)==CSTR_EQUAL;
}
bool Component(const std::wstring& value){
    return !value.empty()&&value.size()<=255&&value!=L"."&&value!=L".."&&
        value.find_first_of(L"\\/:")==std::wstring::npos&&value.find(L'\0')==std::wstring::npos;
}
void Clock(std::uint64_t deadline){if(GetTickCount64()>=deadline)Refuse("media_child_deadline_unknown",WAIT_TIMEOUT,true);}
std::wstring Quote(const std::wstring& value){
    if(value.empty()||value.find(L'\0')!=std::wstring::npos)Refuse("media_child_fixed_argument_refused");
    std::wstring quoted=L"\"";std::size_t slashes=0;
    for(const auto character:value){if(character==L'\\'){++slashes;continue;}
        if(character==L'\"'){quoted.append(slashes*2+1,L'\\');quoted+=character;}
        else{quoted.append(slashes,L'\\');quoted+=character;}slashes=0;}
    quoted.append(slashes*2,L'\\');quoted+=L'\"';return quoted;
}
std::wstring DosPath(void* original){
    wchar_t path[32761]{};const DWORD count=GetFinalPathNameByHandleW(original,path,32761,FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);
    if(!count||count>=32761)Refuse("media_child_original_locator_unavailable",GetLastError());
    std::wstring result(path,count);
    if(result.size()<8||result.substr(0,4)!=L"\\\\?\\"||result[5]!=L':'||result[6]!=L'\\'||
        !((result[4]>=L'A'&&result[4]<=L'Z')||(result[4]>=L'a'&&result[4]<=L'z')))
        Refuse("media_child_local_drive_locator_required");
    return result;
}
struct Locator final {
    std::wstring path,directory;
    std::vector<Held> ancestors;
    std::vector<ObjectPin> ancestorPins;
    Held file;
    ObjectPin filePin;
    void Open(void* original,const ObjectPin& expected){
        if(!detail::SamePin(detail::ReadPin(original,false),expected))Refuse("media_child_original_locator_pin_changed");
        path=DosPath(original);const auto split=path.find_last_of(L'\\');if(split<7)Refuse("media_child_original_locator_shape_refused");
        directory=path.substr(0,split);const auto anchor=path.substr(0,7);
        Held root(CreateFileW(anchor.c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,
            FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        if(!root.Valid()||!SetHandleInformation(root.Get(),HANDLE_FLAG_INHERIT,0))Refuse("media_child_locator_anchor_failed",GetLastError());
        const auto rootPin=detail::ReadPin(root.Get(),true);
        if(rootPin.volumeGuid!=expected.volumeGuid||rootPin.serial!=expected.serial)Refuse("media_child_locator_volume_changed");
        ancestors.push_back(std::move(root));ancestorPins.push_back(rootPin);
        std::size_t at=7;
        for(;;){const auto next=path.find(L'\\',at);const auto part=path.substr(at,next==std::wstring::npos?next:next-at);
            if(!Component(part)||ancestors.size()>32)Refuse("media_child_locator_component_refused");
            if(next==std::wstring::npos){file=detail::Relative(ancestors.back().Get(),part,false,false,false,false,true);filePin=detail::ReadPin(file.Get(),false);break;}
            Held child=detail::Relative(ancestors.back().Get(),part,true);const auto pin=detail::ReadPin(child.Get(),true);
            ancestors.push_back(std::move(child));ancestorPins.push_back(pin);at=next+1;
        }
        if(!detail::SamePin(filePin,expected))Refuse("media_child_locator_leaf_changed");Fresh();
    }
    void Fresh()const{
        if(ancestors.size()!=ancestorPins.size()||ancestors.empty()||!file.Valid())Refuse("media_child_locator_incomplete",0,true);
        for(std::size_t i=0;i<ancestors.size();++i)if(!detail::SamePin(detail::ReadPin(ancestors[i].Get(),true),ancestorPins[i]))Refuse("media_child_locator_ancestor_changed",0,true);
        if(!detail::SamePin(detail::ReadPin(file.Get(),false),filePin)||DosPath(file.Get())!=path)Refuse("media_child_locator_changed",0,true);
    }
};

// Streams the exact held disk object, restoring its original synchronous file
// pointer. Caller serializes this producer with all other uses of that HANDLE.
// No pathname reopen, unbounded retained movie buffer, or hash-created authority.
Digest HashHeld(void* original,std::uint64_t maximum,std::uint64_t deadline){
    std::uint64_t length=0;const auto pin=detail::ReadPin(original,false,&length);
    if(!length||length>maximum)Refuse("media_child_held_hash_bound_refused");
    LARGE_INTEGER zero{},saved{};if(!SetFilePointerEx(original,zero,&saved,FILE_CURRENT))Refuse("media_child_held_position_query_failed",GetLastError(),true);
    BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;Digest digest{};
    DWORD objectBytes=0,returned=0;std::vector<unsigned char> object;
    const auto release=[&]()noexcept{if(hash)BCryptDestroyHash(hash);if(algorithm)BCryptCloseAlgorithmProvider(algorithm,0);};
    try{
        Clock(deadline);
        if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0||
            BCryptGetProperty(algorithm,BCRYPT_OBJECT_LENGTH,reinterpret_cast<PUCHAR>(&objectBytes),sizeof(objectBytes),&returned,0)<0||
            returned!=sizeof(objectBytes)||!objectBytes||objectBytes>1048576)Refuse("media_child_hash_provider_failed",0,true);
        object.resize(objectBytes);
        if(BCryptCreateHash(algorithm,&hash,object.data(),objectBytes,nullptr,0,0)<0)Refuse("media_child_hash_create_failed",0,true);
        if(!SetFilePointerEx(original,zero,nullptr,FILE_BEGIN))Refuse("media_child_held_hash_seek_failed",GetLastError(),true);
        std::array<unsigned char,65536> bytes{};std::uint64_t at=0;
        while(at<length){Clock(deadline);const auto count=static_cast<DWORD>(std::min<std::uint64_t>(bytes.size(),length-at));DWORD read=0;
            if(!ReadFile(original,bytes.data(),count,&read,nullptr)||read!=count)Refuse("media_child_held_hash_read_failed",GetLastError(),true);
            if(BCryptHashData(hash,bytes.data(),read,0)<0)Refuse("media_child_hash_update_failed",0,true);at+=read;}
        if(BCryptFinishHash(hash,digest.data(),static_cast<ULONG>(digest.size()),0)<0)Refuse("media_child_hash_finish_failed",0,true);
        if(!SetFilePointerEx(original,saved,nullptr,FILE_BEGIN))Refuse("media_child_held_position_restore_failed",GetLastError(),true);
        std::uint64_t after=0;if(!detail::SamePin(detail::ReadPin(original,false,&after),pin)||after!=length)Refuse("media_child_held_hash_identity_changed",0,true);
        Clock(deadline);release();return digest;
    }catch(...){const bool restored=SetFilePointerEx(original,saved,nullptr,FILE_BEGIN)!=FALSE;release();
        if(!restored)Refuse("media_child_held_position_restore_unknown",GetLastError(),true);throw;}
}
std::vector<wchar_t> FixedEnvironment(){
    wchar_t windows[32761]{};const UINT count=GetWindowsDirectoryW(windows,32761);
    if(!count||count>=32761)Refuse("media_child_windows_directory_unavailable",GetLastError());
    // Finite literal environment. No ambient PATH, AV/FF/report/loader options,
    // caller values or optional flags. OS dependencies remain declared Source M
    // inputs; these disk/image checks do not attest arbitrary loaded modules.
    const std::array<std::wstring,2> values{{L"AV_LOG_FORCE_NOCOLOR=1",L"SystemRoot="+std::wstring(windows,count)}};
    std::vector<wchar_t> block;for(const auto& value:values){block.insert(block.end(),value.begin(),value.end());block.push_back(L'\0');}
    block.push_back(L'\0');return block;
}
std::vector<std::wstring> FixedArguments(Operation operation,const std::wstring& output,std::uint32_t alphaIndex){
    switch(operation){
    case Operation::Metadata:return {L"-v",L"error",L"-count_frames",L"-show_entries",
        L"format=duration,format_name:stream=index,codec_type,codec_name,width,height,pix_fmt,color_space,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,duration",
        L"-of",L"json",output};
    case Operation::Packets:return {L"-v",L"error",L"-select_streams",L"v:0",L"-show_packets",L"-show_entries",L"packet=pos,size",L"-of",L"json",output};
    case Operation::FullDecode:return {L"-nostdin",L"-v",L"error",L"-xerror",L"-i",output,L"-map",L"0:v:0",L"-map",L"0:a?",L"-fps_mode",L"passthrough",L"-f",L"null",L"-"};
    case Operation::Alpha0:case Operation::Alpha1:case Operation::Alpha2:
        // The existing accepted YG10 invocation, restricted to one native-owned
        // frame. Metadata/packet checks must establish YG10 before this row.
        return {L"-nostdin",L"-v",L"error",L"-xerror",L"-i",output,L"-map",L"0:v:0",L"-vf",
            L"select=eq(n\\,"+std::to_wstring(alphaIndex)+L"),zscale=matrixin=ycgco:matrix=gbr,format=gbrap,format=rgba",
            L"-fps_mode",L"passthrough",L"-frames:v",L"1",L"-f",L"rawvideo",L"pipe:1"};
    }
    Refuse("media_child_operation_refused");
}
struct AttributeList final {
    std::vector<unsigned char> bytes;LPPROC_THREAD_ATTRIBUTE_LIST list=nullptr;
    ~AttributeList(){if(list)DeleteProcThreadAttributeList(list);}
    void Initialize(const std::array<HANDLE,3>& handles){
        SIZE_T size=0;SetLastError(ERROR_SUCCESS);const BOOL unexpected=InitializeProcThreadAttributeList(nullptr,1,0,&size);
        if(unexpected||GetLastError()!=ERROR_INSUFFICIENT_BUFFER||!size||size>1048576)Refuse("media_child_attribute_size_failed",GetLastError());
        bytes.resize(size);auto* candidate=reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(bytes.data());
        if(!InitializeProcThreadAttributeList(candidate,1,0,&size))Refuse("media_child_attribute_initialize_failed",GetLastError());list=candidate;
        if(!UpdateProcThreadAttribute(list,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,const_cast<HANDLE*>(handles.data()),handles.size()*sizeof(HANDLE),nullptr,nullptr))Refuse("media_child_handle_list_failed",GetLastError());
    }
};
} // namespace

struct OriginalChild::Data final {
    explicit Data(Inputs value):inputs(std::move(value)){facts.code.reserve(128);}
    const Inputs inputs;Facts facts;
    Locator toolLocator,outputLocator;
    Held process,thread,job,processImage,input,stdoutRead,stdoutWrite,stderrRead,stderrWrite;
    std::uint64_t deadline=0,outputLength=0;std::size_t stdoutLimit=0;
    bool entered=false,unknown=false,failedClose=false,jobAssigned=false,cancelEntered=false;
    bool Debt()const noexcept{return (facts.created&&!facts.closedOriginalHandles)||failedClose;}
    void Unknown(const char* code,std::uint32_t error=0)noexcept{
        unknown=true;facts.status=Status::Unknown;facts.win32Error=error;
        if(error==WAIT_TIMEOUT){facts.timedOut=true;}
        try{facts.code=code;}catch(...){}
    }
    void Guard(GuardPhase phase){
        try{if(!inputs.guard||!inputs.guard(inputs.guardContext,inputs.operation,phase))Refuse("media_child_original_guard_unknown",0,true);}
        catch(detail::Failure failure){failure.unknown=true;throw failure;}
    }
    void Validate(){
        const auto operation=static_cast<std::size_t>(inputs.operation);
        if(operation>=kDeadlineMs.size()||!Valid(static_cast<HANDLE>(inputs.toolImageHandle))||!Valid(static_cast<HANDLE>(inputs.outputHandle))||
            !inputs.guard||!inputs.guardContext||detail::Zero(inputs.session)||inputs.slot<1||inputs.slot>2||detail::Zero(inputs.stableChildKey)||
            detail::Zero(inputs.outputHash)||detail::Zero(inputs.outputSelector)||detail::Zero(inputs.tool.sha256)||inputs.tool.components.empty()||inputs.tool.components.size()>32||
            !inputs.rateNumerator||!inputs.rateDenominator||inputs.frameCount<4||inputs.frameCount>8191||!inputs.width||!inputs.height||inputs.width>8192||inputs.height>8192)
            Refuse("media_child_fixed_inputs_refused");
        for(const auto& component:inputs.tool.components)if(!Component(component))Refuse("media_child_reviewed_tool_component_refused");
        const auto expected=operation<2?L"ffprobe.exe":L"ffmpeg.exe";
        const auto slash=inputs.tool.pin.canonicalPath.find_last_of(L'\\');
        if(slash==std::wstring::npos||!SameText(inputs.tool.components.back(),expected)||
            !SameText(inputs.tool.pin.canonicalPath.substr(slash+1),expected)||inputs.toolImageHandle==inputs.outputHandle)Refuse("media_child_fixed_tool_refused");
        const auto rgba=static_cast<std::uint64_t>(inputs.width)*inputs.height*4;
        if(rgba>kRgbaBytes||(operation>=3?inputs.alphaIndex>=inputs.frameCount:inputs.alphaIndex!=0))Refuse("media_child_fixed_frame_bound_refused");
        stdoutLimit=operation<2?kJsonBytes:operation==2?0:static_cast<std::size_t>(rgba);
    }
    void InputFacts(bool hashes){
        std::uint64_t length=0;
        if(!detail::SamePin(detail::ReadPin(inputs.toolImageHandle,false),inputs.tool.pin)||
            !detail::SamePin(detail::ReadPin(inputs.outputHandle,false,&length),inputs.outputPin)||!length||(outputLength&&length!=outputLength))
            Refuse("media_child_original_input_changed",0,true);
        if(!outputLength)outputLength=length;
        if(hashes&&(HashHeld(inputs.toolImageHandle,kToolBytes,deadline)!=inputs.tool.sha256||
            HashHeld(inputs.outputHandle,std::numeric_limits<std::uint64_t>::max(),deadline)!=inputs.outputHash))Refuse("media_child_original_hash_changed",0,true);
        if(toolLocator.file.Valid())toolLocator.Fresh();if(outputLocator.file.Valid())outputLocator.Fresh();
    }
    void OriginalTuple(){
        // These are the retained CreateProcess return handles, even when its
        // later image/assignment proof failed. Filling missing factual fields
        // from those same handles is observation, never PID rediscovery/adoption.
        if(!process.Valid()||!thread.Valid())Refuse("media_child_original_handles_incomplete",0,true);
        const auto pid=GetProcessId(process.Get()),tid=GetThreadId(thread.Get());const auto birth=detail::ProcessBirth(process.Get());
        if(!pid||!tid||!birth||GetProcessIdOfThread(thread.Get())!=pid||
            (facts.originalPid&&facts.originalPid!=pid)||(facts.originalThreadId&&facts.originalThreadId!=tid)||(facts.originalBirth&&facts.originalBirth!=birth))
            Refuse("media_child_original_tuple_changed",0,true);
        facts.originalPid=pid;facts.originalThreadId=tid;facts.originalBirth=birth;
    }
    void Identity(){
        OriginalTuple();
        if(!processImage.Valid()||!detail::SamePin(detail::ReadPin(processImage.Get(),false),inputs.tool.pin)){
            facts.imageMatched=false;Refuse("media_child_original_identity_changed",0,true);}
    }
    bool Close(Held& held)noexcept{
        // A failed close is quarantined with its remaining original handles.
        // Never repeat an unknown close or let a HANDLE value be reused/adopted.
        if(failedClose)return false;if(!held.Valid())return true;
        if(!CloseHandle(held.Get())){failedClose=true;Unknown("media_child_original_close_unknown",GetLastError());return false;}
        (void)held.Take();return true;
    }
    void CloseLocator(Locator& locator)noexcept{
        Close(locator.file);for(auto& ancestor:locator.ancestors)Close(ancestor);
    }
    void CloseResources()noexcept{
        Close(stdoutWrite);Close(stderrWrite);Close(input);Close(stdoutRead);Close(stderrRead);Close(thread);Close(process);Close(job);Close(processImage);
        CloseLocator(toolLocator);CloseLocator(outputLocator);
        facts.closedOriginalHandles=facts.created&&!failedClose;
    }
    void CreatePipes(){
        SECURITY_ATTRIBUTES security{sizeof(security),nullptr,TRUE};HANDLE read=nullptr,write=nullptr;
        const BOOL first=CreatePipe(&read,&write,&security,kPipeBytes);stdoutRead=Held(read);stdoutWrite=Held(write);
        if(!first||!stdoutRead.Valid()||!stdoutWrite.Valid()||!SetHandleInformation(stdoutRead.Get(),HANDLE_FLAG_INHERIT,0))Refuse("media_child_stdout_pipe_failed",GetLastError());
        read=nullptr;write=nullptr;const BOOL second=CreatePipe(&read,&write,&security,kPipeBytes);stderrRead=Held(read);stderrWrite=Held(write);
        if(!second||!stderrRead.Valid()||!stderrWrite.Valid()||!SetHandleInformation(stderrRead.Get(),HANDLE_FLAG_INHERIT,0))Refuse("media_child_stderr_pipe_failed",GetLastError());
        input=Held(CreateFileW(L"\\\\.\\NUL",GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,&security,OPEN_EXISTING,0,nullptr));
        if(!input.Valid()||GetFileType(input.Get())!=FILE_TYPE_CHAR)Refuse("media_child_fixed_stdin_failed",GetLastError());
    }
    void CaptureIdentity(){
        OriginalTuple();
        wchar_t image[32761]{};DWORD count=32761;
        if(!facts.originalPid||!facts.originalThreadId||!facts.originalBirth||!QueryFullProcessImageNameW(process.Get(),0,image,&count)||!count||count>=32761)
            Refuse("media_child_original_image_query_failed",GetLastError(),true);
        facts.originalImageQuery.assign(image,count);
        processImage=Held(CreateFileW(facts.originalImageQuery.c_str(),FILE_READ_DATA|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        if(!processImage.Valid()||!SetHandleInformation(processImage.Get(),HANDLE_FLAG_INHERIT,0))Refuse("media_child_original_image_open_failed",GetLastError(),true);
        facts.originalImagePin=detail::ReadPin(processImage.Get(),false);
        if(!detail::SamePin(facts.originalImagePin,inputs.tool.pin)||HashHeld(processImage.Get(),kToolBytes,deadline)!=inputs.tool.sha256)Refuse("media_child_original_image_mismatch",0,true);
        facts.imageMatched=true;Identity();
    }
    bool ReadPipe(Held& pipe,std::vector<unsigned char>& retained,std::size_t limit,std::uint64_t& observed,bool& eof,bool& overflow,bool disposition){
        if(eof)return false;DWORD available=0;
        if(!PeekNamedPipe(pipe.Get(),nullptr,0,nullptr,&available,nullptr)){
            if(GetLastError()==ERROR_BROKEN_PIPE){eof=true;return false;}Refuse("media_child_original_pipe_query_unknown",GetLastError(),true);}
        if(!available)return false;std::array<unsigned char,kPipeBytes> bytes{};DWORD count=0;
        if(!ReadFile(pipe.Get(),bytes.data(),std::min<DWORD>(available,kPipeBytes),&count,nullptr)||!count)Refuse("media_child_original_pipe_read_unknown",GetLastError(),true);
        if(observed>std::numeric_limits<std::uint64_t>::max()-count){overflow=true;observed=std::numeric_limits<std::uint64_t>::max();}
        else observed+=count;
        const auto keep=std::min<std::size_t>(count,limit-retained.size());retained.insert(retained.end(),bytes.begin(),bytes.begin()+keep);
        if(count!=keep){overflow=true;if(!disposition)Refuse("media_child_original_stream_bound_unknown",0,true);}
        return true;
    }
    bool Poll(GuardPhase phase,bool disposition){
        Guard(phase);if(!disposition)Clock(deadline);
        if(disposition)OriginalTuple();else{Identity();InputFacts(false);}
        const DWORD wait=WaitForSingleObject(process.Get(),0);
        if(wait==WAIT_OBJECT_0){DWORD exit=0;if(!GetExitCodeProcess(process.Get(),&exit))Refuse("media_child_original_exit_query_unknown",GetLastError(),true);
            if(facts.exitObserved&&facts.exitCode!=exit)Refuse("media_child_original_exit_changed",0,true);facts.exitObserved=true;facts.exitCode=exit;}
        else if(wait!=WAIT_TIMEOUT)Refuse("media_child_original_wait_unknown",wait==WAIT_FAILED?GetLastError():0,true);
        const bool out=ReadPipe(stdoutRead,facts.stdoutBytes,stdoutLimit,facts.stdoutObservedBytes,facts.stdoutEof,facts.stdoutOverflow,disposition);
        const bool err=ReadPipe(stderrRead,facts.stderrBytes,kStderrBytes,facts.stderrObservedBytes,facts.stderrEof,facts.stderrOverflow,disposition);
        if(!disposition)Clock(deadline);return out||err;
    }
    bool JobInactive(bool strict){
        if(!jobAssigned)return false;JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
        if(!QueryInformationJobObject(job.Get(),JobObjectBasicAccountingInformation,&accounting,sizeof(accounting),nullptr))Refuse("media_child_original_job_query_unknown",GetLastError(),true);
        if(strict&&accounting.TotalProcesses!=1)Refuse("media_child_original_job_count_unknown",0,true);return accounting.ActiveProcesses==0;
    }
};

OriginalChild::OriginalChild(Inputs inputs):data_(std::make_unique<Data>(std::move(inputs))){}
OriginalChild::~OriginalChild(){
    // No kill-on-close flag, implicit cancellation, wait, retry or release claim.
    // The native owner must keep this object, the borrowed original inputs and
    // guard context alive until disposition resolves debt. If that contract is
    // violated, preserve every remaining original rather than kill or disguise
    // release. Retention alone does not resolve debt or permit owner exit.
    if(data_&&data_->Debt())(void)data_.release();
}
const OriginalChild::Facts& OriginalChild::DispositionFacts()const noexcept{return data_->facts;}
bool OriginalChild::HasOriginalDebt()const noexcept{return data_->Debt();}
const OriginalChild::Facts& OriginalChild::CaptureOnce()noexcept{
    auto& d=*data_;if(d.entered)return d.facts;
    try{
        d.Validate();const auto now=GetTickCount64();const auto duration=kDeadlineMs[static_cast<std::size_t>(d.inputs.operation)];
        if(now>std::numeric_limits<std::uint64_t>::max()-duration)Refuse("media_child_clock_bound_refused");d.deadline=now+duration;
        d.Guard(GuardPhase::BeforeLatch);d.entered=true;d.facts.attempted=true;
        d.InputFacts(false);d.toolLocator.Open(d.inputs.toolImageHandle,d.inputs.tool.pin);d.outputLocator.Open(d.inputs.outputHandle,d.inputs.outputPin);
        d.InputFacts(true);d.CreatePipes();
        d.job=Held(CreateJobObjectW(nullptr,nullptr));if(!d.job.Valid())Refuse("media_child_private_job_create_failed",GetLastError(),true);
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_ACTIVE_PROCESS;limits.BasicLimitInformation.ActiveProcessLimit=1;
        if(!SetInformationJobObject(d.job.Get(),JobObjectExtendedLimitInformation,&limits,sizeof(limits)))Refuse("media_child_private_job_limits_failed",GetLastError(),true);
        const std::array<HANDLE,3> inherited{{d.input.Get(),d.stdoutWrite.Get(),d.stderrWrite.Get()}};AttributeList attributes;attributes.Initialize(inherited);
        STARTUPINFOEXW startup{};startup.StartupInfo.cb=sizeof(startup);startup.StartupInfo.dwFlags=STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput=inherited[0];startup.StartupInfo.hStdOutput=inherited[1];startup.StartupInfo.hStdError=inherited[2];startup.lpAttributeList=attributes.list;
        auto environment=FixedEnvironment();std::wstring command=Quote(d.toolLocator.path);
        for(const auto& argument:FixedArguments(d.inputs.operation,d.outputLocator.path,d.inputs.alphaIndex))command+=L" "+Quote(argument);
        if(command.size()>=32760)Refuse("media_child_fixed_command_bound_refused");std::vector<wchar_t> mutableCommand(command.begin(),command.end());mutableCommand.push_back(L'\0');
        d.Guard(GuardPhase::BeforeCreate);Clock(d.deadline);d.InputFacts(false);PROCESS_INFORMATION original{};
        const BOOL created=CreateProcessW(d.toolLocator.path.c_str(),mutableCommand.data(),nullptr,nullptr,TRUE,
            CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT|CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT,environment.data(),d.toolLocator.directory.c_str(),&startup.StartupInfo,&original);
        const DWORD error=created?ERROR_SUCCESS:GetLastError();d.process=Held(original.hProcess);d.thread=Held(original.hThread);
        d.facts.created=d.process.Valid()||d.thread.Valid();
        if(!created||!d.process.Valid()||!d.thread.Valid())Refuse("media_child_original_creation_unknown",error,true);
        d.facts.created=true;d.CaptureIdentity();
        if(!AssignProcessToJobObject(d.job.Get(),d.process.Get()))Refuse("media_child_original_job_assignment_unknown",GetLastError(),true);d.jobAssigned=true;
        BOOL member=FALSE;if(!IsProcessInJob(d.process.Get(),d.job.Get(),&member)||!member)Refuse("media_child_original_job_membership_unknown",GetLastError(),true);
        d.Guard(GuardPhase::BeforeResume);Clock(d.deadline);d.InputFacts(false);d.Identity();
        if(ResumeThread(d.thread.Get())!=1)Refuse("media_child_original_resume_unknown",GetLastError(),true);d.facts.resumed=true;
        if(!d.Close(d.stdoutWrite)||!d.Close(d.stderrWrite)||!d.Close(d.input))return d.facts;
        while(!(d.facts.exitObserved&&d.facts.stdoutEof&&d.facts.stderrEof)){
            const bool progress=d.Poll(GuardPhase::Poll,false);if(!progress)Sleep(5);
        }
        d.Guard(GuardPhase::FinalReadback);Clock(d.deadline);d.Identity();d.InputFacts(true);
        if(!d.JobInactive(true))Refuse("media_child_original_job_not_closed",0,true);
        d.Guard(GuardPhase::FinalReadback);Clock(d.deadline);
        if(d.facts.stdoutOverflow||d.facts.stderrOverflow||(static_cast<std::size_t>(d.inputs.operation)>=3&&d.facts.stdoutBytes.size()!=d.stdoutLimit))
            Refuse("media_child_original_capture_incomplete",0,true);
        d.CloseResources();Clock(d.deadline);if(!d.unknown){d.facts.status=Status::Closed;d.facts.code="media_child_original_closed";}
    }catch(const detail::Failure& failure){
        d.entered=true;
        if(!d.facts.attempted&&!failure.unknown){d.facts.status=Status::Refused;d.facts.win32Error=failure.error;try{d.facts.code=failure.code;}catch(...){};}
        else d.Unknown(failure.code.c_str(),failure.error);
        if(!d.facts.created)d.CloseResources();
    }catch(...){d.entered=true;d.Unknown("media_child_original_exception_unknown");if(!d.facts.created)d.CloseResources();}
    return d.facts;
}
const OriginalChild::Facts& OriginalChild::PollOriginalForDisposition()noexcept{
    auto& d=*data_;if(!d.Debt()||d.failedClose)return d.facts;
    try{
        if(!d.facts.created){d.Guard(GuardPhase::CleanupPoll);d.CloseResources();return d.facts;}
        // Dispose parent copies even when resume/assignment was UNKNOWN, so pipe
        // EOF represents the original child's copies rather than our own writes.
        d.Guard(GuardPhase::CleanupPoll);d.Close(d.stdoutWrite);d.Close(d.stderrWrite);d.Close(d.input);
        if(d.failedClose)return d.facts;
        (void)d.Poll(GuardPhase::CleanupPoll,true);
        if(d.facts.exitObserved&&d.facts.stdoutEof&&d.facts.stderrEof){
            // A failed assignment never transferred the child into this job;
            // original exit+EOF can still close the unused private job safely.
            if(d.jobAssigned&&!d.JobInactive(false))return d.facts;
            d.Guard(GuardPhase::CleanupPoll);d.CloseResources();
        }
    }catch(const detail::Failure& failure){d.Unknown(failure.code.c_str(),failure.error);}
    catch(...){d.Unknown("media_child_original_disposition_unknown");}
    return d.facts;
}
const OriginalChild::Facts& OriginalChild::CancelOriginalOnce()noexcept{
    auto& d=*data_;if(!d.Debt()||d.cancelEntered||d.failedClose)return d.facts;d.cancelEntered=true;
    try{
        if(!d.facts.created||!d.process.Valid())Refuse("media_child_cancel_requires_original_process",0,true);
        d.Guard(GuardPhase::CleanupOriginal);d.OriginalTuple();
        const DWORD wait=WaitForSingleObject(d.process.Get(),0);
        if(wait==WAIT_OBJECT_0)return PollOriginalForDisposition();
        if(wait!=WAIT_TIMEOUT)Refuse("media_child_cancel_original_wait_unknown",wait==WAIT_FAILED?GetLastError():0,true);
        d.facts.cancelAttempted=true;d.Unknown("media_child_original_cancel_disposition_required");
        // This single original process HANDLE was returned by our CreateProcess;
        // no PID lookup, descendants, job termination, user AE or user AME.
        if(!TerminateProcess(d.process.Get(),0x4d43434c))Refuse("media_child_original_cancel_send_unknown",GetLastError(),true);
        d.facts.cancelSent=true;
    }catch(const detail::Failure& failure){d.Unknown(failure.code.c_str(),failure.error);}
    catch(...){d.Unknown("media_child_original_cancel_unknown");}
    return d.facts;
}
Digest OriginalChild::HashOriginalOutputForOwner(void* original,std::uint64_t deadline){return HashHeld(original,std::numeric_limits<std::uint64_t>::max(),deadline);}
} // namespace local_session::trusted_read::media_children
