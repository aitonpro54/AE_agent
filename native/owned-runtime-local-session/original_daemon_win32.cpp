#include "original_daemon_win32.h"
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
#include "local_session_native_client.h"
#endif
#include <windows.h>
#include <algorithm>
#include <limits>
#include <utility>

namespace local_session {
namespace {
using detail::Refuse;
#if !defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
std::wstring WideHex(const Id& value){const auto text=detail::Hex(value);return std::wstring(text.begin(),text.end());}
std::wstring Quote(const std::wstring& value){if(value.empty()||value.find(L'\0')!=std::wstring::npos)Refuse("fixed_argument_invalid");std::wstring quoted=L"\"";std::size_t slashes=0;for(wchar_t c:value){if(c==L'\\'){++slashes;continue;}if(c==L'\"'){quoted.append(slashes*2+1,L'\\');quoted+=c;}else{quoted.append(slashes,L'\\');quoted+=c;}slashes=0;}quoted.append(slashes*2,L'\\');quoted+=L'\"';return quoted;}
std::vector<wchar_t> Environment(const Id& generation,const Id& boot,const Id& nonce,const std::wstring& pipe
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
    ,const Id& phaseSession
#endif
){
    wchar_t system[32761]{};const UINT n=GetWindowsDirectoryW(system,32761);if(!n||n>=32761)Refuse("windows_directory_unavailable",GetLastError());
    std::vector<std::wstring> values={L"AE_AGENT_LOCAL_SESSION_BOOT="+WideHex(boot),L"AE_AGENT_LOCAL_SESSION_GENERATION="+WideHex(generation),L"AE_AGENT_LOCAL_SESSION_NONCE="+WideHex(nonce),L"AE_AGENT_LOCAL_SESSION_PIPE="+pipe,L"SystemRoot="+std::wstring(system,n)};
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
    if(detail::Zero(phaseSession))Refuse("phase_session_locator_absent");
    values.push_back(L"AE_AGENT_LOCAL_SESSION_REF="+WideHex(phaseSession));
#endif
    std::sort(values.begin(),values.end());std::vector<wchar_t> block;for(const auto& value:values){block.insert(block.end(),value.begin(),value.end());block.push_back(L'\0');}block.push_back(L'\0');return block;
}
#endif
}
PreparedLifecycleGrant::PreparedLifecycleGrant(const Id& generation,const Id& boot,const Digest& consumed,std::uint64_t issuedAt,std::uint64_t sessionDeadline,std::uint64_t dispositionDeadline)
    :generation_(generation),boot_(boot),consumed_(consumed),issuedAt_(issuedAt),sessionDeadline_(sessionDeadline),dispositionDeadline_(dispositionDeadline){}
std::unique_ptr<PreparedLifecycleGrant> PreparedLifecycleGrant::Prepare(const Id& generation,const Id& boot,const Digest& consumed,std::uint64_t originalSessionDeadline){
    const auto now=GetTickCount64();
    if(detail::Zero(generation)||detail::Zero(boot)||detail::Zero(consumed)||originalSessionDeadline<=now||originalSessionDeadline-now>kMaximumSessionMs||originalSessionDeadline>std::numeric_limits<std::uint64_t>::max()-kFixedDispositionGraceMs)Refuse("prepared_lifecycle_bounds_refused");
    // Issued exactly once before original CreateProcess. READ/token/activity and
    // controller revoke never rewrite either immutable deadline or the bindings.
    return std::unique_ptr<PreparedLifecycleGrant>(new PreparedLifecycleGrant(generation,boot,consumed,now,originalSessionDeadline,originalSessionDeadline+kFixedDispositionGraceMs));
}
bool PreparedLifecycleGrant::EffectClockLive()const{const auto now=GetTickCount64();return now>=issuedAt_&&now<dispositionDeadline_;}
struct OriginalDaemon::Data {
    InstalledEnrollment& enrollment;detail::Held process,thread;
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    std::unique_ptr<trusted_read::Bootstrap> bootstrap;
    std::vector<void*> failedCloseHandles;
#endif
    DWORD originalPid=0;std::uint64_t birth=0;
    std::unique_ptr<PreparedLifecycleGrant> grant;
    Id generation{},boot{},originalInstance=detail::RandomId();Digest consumed{};std::wstring sid,image;
    bool admitted=false,abortConsumed=false,unknown=false;
    Data(InstalledEnrollment& e,const Id& g,const Id& b,std::unique_ptr<PreparedLifecycleGrant> prepared):enrollment(e),grant(std::move(prepared)),generation(g),boot(b){if(grant)consumed=grant->consumed_;}
};
OriginalDaemon::OriginalDaemon(std::unique_ptr<Data> data):data_(std::move(data)){}
OriginalDaemon::~OriginalDaemon(){
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    // A failed original creation keeps its process/thread/bootstrap and immutable
    // lifecycle grant until this broker's actual exit; destruction is no retry.
    if(data_&&data_->unknown&&(data_->process.Valid()||!data_->failedCloseHandles.empty()))(void)data_.release();
#endif
}
std::unique_ptr<OriginalDaemon> OriginalDaemon::Launch(InstalledEnrollment& enrollment,const Id& generation,const Id& bootNonce,const Id& channelNonce,const std::wstring& daemonPipe,
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    const Id& phaseSession,
#endif
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    void* originalController,
#endif
    std::unique_ptr<PreparedLifecycleGrant> lifecycleGrant,Result& result){
    auto data=std::make_unique<Data>(enrollment,generation,bootNonce,std::move(lifecycleGrant));auto target=std::unique_ptr<OriginalDaemon>(new OriginalDaemon(std::move(data)));auto& d=*target->data_;
    try{const auto& p=enrollment.Profile();const auto now=GetTickCount64();if(!d.grant||d.grant->generation_!=generation||d.grant->boot_!=bootNonce||detail::Zero(d.grant->consumed_)||detail::Zero(channelNonce)||!d.grant->EffectClockLive()||now>=d.grant->sessionDeadline_||!enrollment.Fresh(true).ok)Refuse("prepared_lifecycle_grant_refused");
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
        if(detail::Zero(phaseSession)||!originalController||!detail::ProcessLive(originalController)||
            detail::ProcessSid(originalController)!=p.userSid||detail::ProcessImage(originalController)!=p.controllerImage.pin.canonicalPath)
            Refuse("trusted_original_controller_launch_binding_refused");
        const phase::WireBindings binding{channelNonce,phaseSession,generation,bootNonce};
        auto created=trusted_read::NativeClient::CreateOriginalDaemonFixed(enrollment,binding,daemonPipe,originalController,*d.grant);
        // Preserve the returned originals and anonymous bootstrap before any
        // post-creation check. This cannot reconstruct ownership from a PID.
        d.process=std::move(created.process);d.thread=std::move(created.thread);d.bootstrap=std::move(created.bootstrap);d.failedCloseHandles=std::move(created.failedCloseHandles);
        if(!created.status.ok){d.unknown=true;result=std::move(created.status);if(!d.process.Valid())return nullptr;return target;}
        d.originalPid=GetProcessId(d.process.Get());d.birth=detail::ProcessBirth(d.process.Get());d.sid=detail::ProcessSid(d.process.Get());
        d.image=enrollment.CheckedOriginalLaunchImage(d.process.Get());
        if(!d.originalPid||!d.birth||d.sid!=p.userSid||d.image!=p.node.pin.canonicalPath||!d.bootstrap||
            !detail::ProcessLive(d.process.Get())||!enrollment.Fresh(true).ok||!d.grant->EffectClockLive()||GetTickCount64()>=d.grant->sessionDeadline_)
            Refuse("trusted_original_creation_identity_or_late_guard",0,true);
        result.ok=true;result.code="original_creation_handles_held";
#else
        const std::wstring canonicalScript=enrollment.CheckedBridgeEntry();const auto& locators=enrollment.PrepareFixedLaunchLocators();const std::wstring node=locators.node,script=locators.bridge;
        // Synthetic proof enrolls its own repository containing a fixed fixture
        // script at this exact name. It never points this entry at the real daemon.
        const std::wstring command=Quote(node)+L" "+Quote(script);
        std::vector<wchar_t> mutableCommand(command.begin(),command.end());mutableCommand.push_back(L'\0');auto environment=Environment(generation,bootNonce,channelNonce,daemonPipe
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
            ,phaseSession
#endif
        );STARTUPINFOW startup{};startup.cb=sizeof(startup);PROCESS_INFORMATION original{};
        // Consumption and bounded lifecycle grant exist already. No root/fence/
        // journal/stdin HANDLE inheritance, shell, ambient argv or PATH resolution.
        enrollment.CheckFixedLaunchLocators();if(!enrollment.Fresh(true).ok||enrollment.CheckedBridgeEntry()!=canonicalScript||!d.grant->EffectClockLive()||GetTickCount64()>=d.grant->sessionDeadline_)Refuse("original_precreate_guard_closed",0,true);
        if(!CreateProcessW(node.c_str(),mutableCommand.data(),nullptr,nullptr,FALSE,CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT|CREATE_NO_WINDOW,environment.data(),locators.repository.c_str(),&startup,&original))Refuse("create_process_consumed_failure",GetLastError(),true);
        d.process=detail::Held(original.hProcess);d.thread=detail::Held(original.hThread);d.originalPid=original.dwProcessId;
        d.birth=detail::ProcessBirth(d.process.Get());d.sid=detail::ProcessSid(d.process.Get());d.image=enrollment.CheckedOriginalLaunchImage(d.process.Get());enrollment.CheckFixedLaunchLocators();if(!d.birth||d.sid!=p.userSid||d.image!=p.node.pin.canonicalPath||!detail::ProcessLive(d.process.Get())||!enrollment.Fresh(true).ok||!d.grant->EffectClockLive()||GetTickCount64()>=d.grant->sessionDeadline_)Refuse("original_creation_identity_or_late_guard",0,true);
        if(ResumeThread(d.thread.Get())==static_cast<DWORD>(-1))Refuse("original_resume_unknown",GetLastError(),true);result.ok=true;result.code="original_creation_handles_held";
#endif
    }catch(const detail::Failure& failure){d.unknown=true;result={false,true,failure.unavailable,failure.code,failure.error};if(!d.process.Valid())return nullptr;}
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
    catch(...){d.unknown=true;result.ok=false;result.unknown=true;result.code="trusted_original_launch_exception";if(!d.process.Valid())return nullptr;}
#endif
    // A successful CreateProcess with later UNKNOWN retains both original handles
    // and the prepared lifecycle grant. It is never replayed or replaced by PID.
    return target;
}
bool OriginalDaemon::MatchesPeer(void* pipe)const{const auto& d=*data_;if(!d.process.Valid()||!d.birth)return false;ULONG peer=0;if(!GetNamedPipeClientProcessId(pipe,&peer)||peer!=d.originalPid)return false;return detail::ProcessLive(d.process.Get())&&detail::ProcessBirth(d.process.Get())==d.birth&&detail::ProcessSid(d.process.Get())==d.sid&&detail::ProcessImage(d.process.Get())==d.image;}
bool OriginalDaemon::Live()const{return data_->process.Valid()&&detail::ProcessLive(data_->process.Get());}
bool OriginalDaemon::ExactExit(std::uint32_t& exitCode)const{const auto& d=*data_;if(!d.process.Valid())return false;const DWORD wait=WaitForSingleObject(d.process.Get(),0);if(wait==WAIT_TIMEOUT)return false;if(wait!=WAIT_OBJECT_0)Refuse("original_exit_wait_failed",wait==WAIT_FAILED?GetLastError():0,true);DWORD code=0;if(!GetExitCodeProcess(d.process.Get(),&code))Refuse("original_exit_code_failed",GetLastError(),true);exitCode=code;return true;}
bool OriginalDaemon::LifecycleEffectAllowed()const{return data_->grant&&data_->grant->EffectClockLive();}
bool OriginalDaemon::AbortUnadmitted(Result& result){auto& d=*data_;if(d.admitted){result.unavailable=true;result.code="admitted_requires_drain";return false;}if(d.abortConsumed){result.code="abort_consumed_observe_original_only";return true;}if(!d.process.Valid()||!d.enrollment.Fresh(true).ok||!LifecycleEffectAllowed()){result={false,true,false,"original_abort_guard_closed",0};return false;}
    d.abortConsumed=true; // Once only; unknown TerminateProcess result is never replayed.
    if(!TerminateProcess(d.process.Get(),0x4c435342)){d.unknown=true;result={false,true,false,"original_abort_send_unknown",GetLastError()};return false;}result.ok=true;result.code="original_abort_sent_wait_required";return true;
}
void OriginalDaemon::MarkAdmitted()noexcept{data_->admitted=true;}
void* OriginalDaemon::BorrowedOriginalProcess()const{return data_->process.Get();}
std::uint64_t OriginalDaemon::Birth()const{return data_->birth;}
const Id& OriginalDaemon::OriginalInstance()const{return data_->originalInstance;}
Digest OriginalDaemon::PhaseWitness(void* pipe,const Id& session,const Id& channel)const{
    const auto& d=*data_;if(!MatchesPeer(pipe)||detail::Zero(session)||detail::Zero(channel)||!d.enrollment.Fresh(true).ok)
        Refuse("original_daemon_phase_witness_closed");
    std::vector<unsigned char> bytes;const char* domain="native-original-daemon-peer.v2";
    for(const char* at=domain;*at;++at)bytes.push_back(static_cast<unsigned char>(*at));
    detail::PutU64(bytes,d.originalPid);detail::PutU64(bytes,d.birth);
    for(const auto* value:{&d.originalInstance,&session,&channel,&d.generation,&d.boot})bytes.insert(bytes.end(),value->begin(),value->end());
    bytes.insert(bytes.end(),d.consumed.begin(),d.consumed.end());
    for(const auto* text:{&d.sid,&d.image}){detail::PutU16(bytes,static_cast<std::uint16_t>(text->size()));for(wchar_t c:*text)detail::PutU16(bytes,static_cast<std::uint16_t>(c));}
    return detail::Hash(bytes);
}
} // namespace local_session
