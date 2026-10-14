#include "ame_uia_observer.h"
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <Windows.h>
#include <objbase.h>
#include <ole2.h>
#include <UIAutomation.h>
#include <TlHelp32.h>
#include <sddl.h>
#include <bcrypt.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <utility>
#include <vector>

namespace local_session::ame_observer {
namespace {
struct Closed final {const char* code;DWORD error=0;};
[[noreturn]] void Refuse(const char* code,DWORD error=0){throw Closed{code,error};}
class Handle final {public:explicit Handle(HANDLE h=nullptr):h_(h){}~Handle(){if(h_&&h_!=INVALID_HANDLE_VALUE)CloseHandle(h_);}
    Handle(Handle&& original)noexcept:h_(original.h_){original.h_=nullptr;}
    Handle(const Handle&)=delete;Handle& operator=(const Handle&)=delete;HANDLE Get()const{return h_;}bool Valid()const{return h_&&h_!=INVALID_HANDLE_VALUE;}
private:HANDLE h_;};
template<class T> class Com final {public:~Com(){if(value_)value_->Release();}T** Out(){return &value_;}T* Get()const{return value_;}T* operator->()const{return value_;}
    T* Detach()noexcept{auto* original=value_;value_=nullptr;return original;}
    void Reset(T* original)noexcept{if(value_)value_->Release();value_=original;}
    Com()=default;Com(const Com&)=delete;Com& operator=(const Com&)=delete;
private:T* value_=nullptr;};
struct Variant final {VARIANT value{};Variant(){VariantInit(&value);}~Variant(){VariantClear(&value);}};
struct Array final {SAFEARRAY* value=nullptr;~Array(){if(value)SafeArrayDestroy(value);}};
struct Apartment final {Apartment(){const auto hr=CoInitializeEx(nullptr,COINIT_MULTITHREADED);if(FAILED(hr))Refuse("ame_uia_com_initialize_failed",static_cast<DWORD>(hr));}
    ~Apartment(){CoUninitialize();}};
std::string Utf8(const wchar_t* text,std::size_t count){if(!count)return {};if(count>kPropertyTextLimit)Refuse("ame_uia_property_text_limit");
    const int bytes=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,text,static_cast<int>(count),nullptr,0,nullptr,nullptr);if(bytes<=0)Refuse("ame_uia_property_encoding_failed",GetLastError());
    std::string result(static_cast<std::size_t>(bytes),'\0');if(WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,text,static_cast<int>(count),result.data(),bytes,nullptr,nullptr)!=bytes)Refuse("ame_uia_property_encoding_failed",GetLastError());return result;}
std::string Json(const std::string& text){std::string result="\"";constexpr char hex[]="0123456789abcdef";for(const unsigned char c:text){if(c=='"'||c=='\\'){result+='\\';result+=static_cast<char>(c);}
    else if(c<32){result+="\\u00";result+=hex[c>>4];result+=hex[c&15];}else result+=static_cast<char>(c);}return result+'"';}
std::string Hex(const unsigned char* bytes,std::size_t count){constexpr char hex[]="0123456789abcdef";std::string value;value.reserve(count*2);for(std::size_t i=0;i<count;++i){value+=hex[bytes[i]>>4];value+=hex[bytes[i]&15];}return value;}
std::string Number(std::uint64_t number){return std::to_string(number);}
std::uint64_t Birth(HANDLE process){FILETIME created{},exit{},kernel{},user{};if(!GetProcessTimes(process,&created,&exit,&kernel,&user))Refuse("ame_uia_original_birth_unavailable",GetLastError());
    return (static_cast<std::uint64_t>(created.dwHighDateTime)<<32)|created.dwLowDateTime;}
std::wstring Image(HANDLE process){std::array<wchar_t,32768> value{};DWORD count=static_cast<DWORD>(value.size());if(!QueryFullProcessImageNameW(process,0,value.data(),&count)||!count)Refuse("ame_uia_original_image_unavailable",GetLastError());return {value.data(),count};}
std::wstring Sid(HANDLE process){HANDLE raw=nullptr;if(!OpenProcessToken(process,TOKEN_QUERY,&raw))Refuse("ame_uia_original_sid_unavailable",GetLastError());Handle token(raw);DWORD count=0;
    GetTokenInformation(token.Get(),TokenUser,nullptr,0,&count);if(!count||count>65536)Refuse("ame_uia_original_sid_size_refused",GetLastError());std::vector<unsigned char> bytes(count);
    if(!GetTokenInformation(token.Get(),TokenUser,bytes.data(),count,&count))Refuse("ame_uia_original_sid_unavailable",GetLastError());wchar_t* text=nullptr;
    if(!ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(bytes.data())->User.Sid,&text))Refuse("ame_uia_original_sid_unavailable",GetLastError());
    std::wstring result;try{result=text;}catch(...){LocalFree(text);throw;}LocalFree(text);return result;}
struct Candidate final {Handle process;DWORD pid;std::uint64_t birth;std::wstring image,sid;
    explicit Candidate(Handle&& original):process(std::move(original)),pid(GetProcessId(process.Get())),birth(Birth(process.Get())),image(Image(process.Get())),sid(Sid(process.Get())){
        if(!pid||_wcsicmp(image.c_str(),kAmeImage)!=0||sid!=Sid(GetCurrentProcess()))Refuse("ame_uia_candidate_identity_refused");}
    void Fresh()const{if(WaitForSingleObject(process.Get(),0)!=WAIT_TIMEOUT||GetProcessId(process.Get())!=pid||Birth(process.Get())!=birth||Image(process.Get())!=image||Sid(process.Get())!=sid)
        Refuse("ame_uia_original_candidate_changed");}};
struct HashProvider final {BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;std::vector<unsigned char> object;
    void Initialize(){if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)Refuse("ame_uia_hash_provider_failed");DWORD length=0,used=0;
        if(BCryptGetProperty(algorithm,BCRYPT_OBJECT_LENGTH,reinterpret_cast<PUCHAR>(&length),sizeof(length),&used,0)<0||!length||length>65536)Refuse("ame_uia_hash_provider_failed");object.resize(length);
        if(BCryptCreateHash(algorithm,&hash,object.data(),length,nullptr,0,0)<0)Refuse("ame_uia_hash_provider_failed");}
    ~HashProvider(){if(hash)BCryptDestroyHash(hash);if(algorithm)BCryptCloseAlgorithmProvider(algorithm,0);}};
std::string FileCandidate(const wchar_t* path){Handle file(CreateFileW(path,FILE_READ_DATA|FILE_READ_ATTRIBUTES,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!file.Valid())Refuse("ame_uia_disk_candidate_open_failed",GetLastError());FILE_ATTRIBUTE_TAG_INFO attributes{};FILE_STANDARD_INFO standard{};FILE_ID_INFO id{};
    if(!GetFileInformationByHandleEx(file.Get(),FileAttributeTagInfo,&attributes,sizeof(attributes))||!GetFileInformationByHandleEx(file.Get(),FileStandardInfo,&standard,sizeof(standard))||
        !GetFileInformationByHandleEx(file.Get(),FileIdInfo,&id,sizeof(id))||standard.Directory||standard.DeletePending||(attributes.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)||
        standard.EndOfFile.QuadPart<=0||standard.EndOfFile.QuadPart>134217728)Refuse("ame_uia_disk_candidate_metadata_refused",GetLastError());
    HashProvider hash;hash.Initialize();std::array<unsigned char,65536> bytes{};std::uint64_t readTotal=0;for(;;){DWORD count=0;if(!ReadFile(file.Get(),bytes.data(),static_cast<DWORD>(bytes.size()),&count,nullptr))Refuse("ame_uia_disk_candidate_read_failed",GetLastError());
        if(!count)break;if(count>134217728-readTotal||BCryptHashData(hash.hash,bytes.data(),count,0)<0)Refuse("ame_uia_disk_candidate_read_failed");readTotal+=count;}
    FILE_ID_INFO afterId{};FILE_STANDARD_INFO afterStandard{};std::array<unsigned char,32> digest{};
    if(readTotal!=static_cast<std::uint64_t>(standard.EndOfFile.QuadPart)||!GetFileInformationByHandleEx(file.Get(),FileIdInfo,&afterId,sizeof(afterId))||
        !GetFileInformationByHandleEx(file.Get(),FileStandardInfo,&afterStandard,sizeof(afterStandard))||afterStandard.DeletePending||afterStandard.EndOfFile.QuadPart!=standard.EndOfFile.QuadPart||
        afterId.VolumeSerialNumber!=id.VolumeSerialNumber||memcmp(afterId.FileId.Identifier,id.FileId.Identifier,16)!=0||BCryptFinishHash(hash.hash,digest.data(),static_cast<ULONG>(digest.size()),0)<0)
        Refuse("ame_uia_disk_candidate_changed",GetLastError());
    return "{\"locator\":"+Json(Utf8(path,wcslen(path)))+",\"fileId\":"+Json(Hex(id.FileId.Identifier,16))+",\"volumeSerial\":"+Json(Number(id.VolumeSerialNumber))+",\"bytes\":"+Number(readTotal)+",\"sha256\":"+Json(Hex(digest.data(),digest.size()))+",\"numberOfLinks\":"+Number(standard.NumberOfLinks)+",\"sameHeldRead\":true,\"authority\":false}";}
struct Windows final {const Candidate& candidate;std::vector<HWND> roots;bool overflow=false;};
BOOL CALLBACK Enumerate(HWND window,LPARAM argument){auto& value=*reinterpret_cast<Windows*>(argument);DWORD pid=0;GetWindowThreadProcessId(window,&pid);
    if(pid==value.candidate.pid&&IsWindowVisible(window)){if(value.roots.size()>=kWindowLimit){value.overflow=true;return FALSE;}value.roots.push_back(window);}return TRUE;}
struct Capture final {const Candidate& candidate;std::uint64_t started;std::uint32_t count=0,textBytes=0;bool truncated=false;std::vector<std::string> nodes;
    void Boundary()const{candidate.Fresh();const auto now=GetTickCount64();if(now<started||now-started>=kDiagnosticDeadlineMs)Refuse("ame_uia_diagnostic_deadline_elapsed");}
    std::string Property(IUIAutomationElement* element,PROPERTYID property){Boundary();Variant value;const auto hr=element->GetCurrentPropertyValue(property,&value.value);Boundary();
        if(FAILED(hr))return "{\"present\":false,\"hresult\":"+Number(static_cast<DWORD>(hr))+"}";
        if(value.value.vt==VT_BSTR){const auto text=Utf8(value.value.bstrVal,SysStringLen(value.value.bstrVal));if(text.size()>kTotalTextLimit-textBytes)Refuse("ame_uia_total_text_limit");textBytes+=static_cast<std::uint32_t>(text.size());return "{\"present\":true,\"type\":\"BSTR\",\"value\":"+Json(text)+"}";}
        if(value.value.vt==VT_BOOL)return std::string("{\"present\":true,\"type\":\"BOOL\",\"value\":")+(value.value.boolVal==VARIANT_TRUE?"true":"false")+"}";
        if(value.value.vt==VT_I4)return "{\"present\":true,\"type\":\"I4\",\"value\":"+std::to_string(value.value.lVal)+"}";
        if(value.value.vt==VT_UI4)return "{\"present\":true,\"type\":\"UI4\",\"value\":"+Number(value.value.ulVal)+"}";
        if(value.value.vt==VT_R8&&std::isfinite(value.value.dblVal))return "{\"present\":true,\"type\":\"R8\",\"value\":"+std::to_string(value.value.dblVal)+"}";
        return "{\"present\":false,\"variantType\":"+Number(value.value.vt)+"}";}
    std::string RuntimeId(IUIAutomationElement* element){Array id;Boundary();const auto hr=element->GetRuntimeId(&id.value);Boundary();if(FAILED(hr)||!id.value||SafeArrayGetDim(id.value)!=1)return "null";
        LONG lower=0,upper=-1;VARTYPE type=VT_EMPTY;if(FAILED(SafeArrayGetVartype(id.value,&type))||type!=VT_I4||FAILED(SafeArrayGetLBound(id.value,1,&lower))||FAILED(SafeArrayGetUBound(id.value,1,&upper))||
            upper<lower||static_cast<std::int64_t>(upper)-lower>=32)Refuse("ame_uia_runtime_id_refused");std::string json="[";
        for(LONG at=lower;at<=upper;++at){LONG component=0;if(FAILED(SafeArrayGetElement(id.value,&at,&component)))Refuse("ame_uia_runtime_id_refused");if(at!=lower)json+=',';json+=std::to_string(component);}return json+']';}
    void Walk(IUIAutomationTreeWalker* walker,IUIAutomationElement* element,std::uint32_t depth,std::uint32_t parent,std::uint32_t window){
        Boundary();if(count>=kElementLimit){truncated=true;return;}int reportedPid=0;const auto pidHr=element->get_CurrentProcessId(&reportedPid);Boundary();if(FAILED(pidHr)||reportedPid!=static_cast<int>(candidate.pid))Refuse("ame_uia_provider_process_refused",static_cast<DWORD>(pidHr));
        const auto own=count++;std::string json="{\"index\":"+Number(own)+",\"parent\":"+(parent==UINT32_MAX?std::string("null"):Number(parent))+",\"windowIndex\":"+Number(window)+",\"depth\":"+Number(depth)+",\"providerProcessId\":"+std::to_string(reportedPid)+",\"runtimeId\":"+RuntimeId(element);
        for(const auto& pair:std::array<std::pair<const char*,PROPERTYID>,18>{{{"name",UIA_NamePropertyId},{"automationId",UIA_AutomationIdPropertyId},{"className",UIA_ClassNamePropertyId},{"frameworkId",UIA_FrameworkIdPropertyId},
            {"controlType",UIA_ControlTypePropertyId},{"enabled",UIA_IsEnabledPropertyId},{"offscreen",UIA_IsOffscreenPropertyId},{"nativeWindowHandle",UIA_NativeWindowHandlePropertyId},
            {"value",UIA_ValueValuePropertyId},{"valueReadOnly",UIA_ValueIsReadOnlyPropertyId},{"selectionItemSelected",UIA_SelectionItemIsSelectedPropertyId},{"toggleState",UIA_ToggleToggleStatePropertyId},
            {"legacyAvailable",UIA_IsLegacyIAccessiblePatternAvailablePropertyId},{"legacyName",UIA_LegacyIAccessibleNamePropertyId},{"legacyValue",UIA_LegacyIAccessibleValuePropertyId},
            {"legacyDescription",UIA_LegacyIAccessibleDescriptionPropertyId},{"legacyRole",UIA_LegacyIAccessibleRolePropertyId},{"legacyState",UIA_LegacyIAccessibleStatePropertyId}}})json+=","+Json(pair.first)+":"+Property(element,pair.second);
        nodes.push_back(json+'}');Com<IUIAutomationElement> child;Boundary();const auto childHr=walker->GetFirstChildElement(element,child.Out());Boundary();if(FAILED(childHr))Refuse("ame_uia_child_read_failed",static_cast<DWORD>(childHr));
        if(depth>=kDepthLimit){if(child.Get())truncated=true;return;}
        while(child.Get()){Walk(walker,child.Get(),depth+1,own,window);if(count>=kElementLimit){truncated=true;return;}Com<IUIAutomationElement> next;Boundary();const auto nextHr=walker->GetNextSiblingElement(child.Get(),next.Out());Boundary();if(FAILED(nextHr))Refuse("ame_uia_sibling_read_failed",static_cast<DWORD>(nextHr));
            // Each Com remains unique; moving the returned interface avoids
            // duplicate release or an unbounded provider reference chain.
            IUIAutomationElement* raw=next.Detach();child.Reset(raw);}
    }};
}
PassiveResult CapturePassiveFeasibilityFixed(PassiveView view){try{if(view!=PassiveView::Control&&view!=PassiveView::Raw)Refuse("ame_uia_fixed_passive_view_required");
    const auto started=GetTickCount64();Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0));if(!snapshot.Valid())Refuse("ame_uia_process_diagnostics_failed",GetLastError());
    PROCESSENTRY32W row{};row.dwSize=sizeof(row);std::unique_ptr<Candidate> candidate;std::uint32_t processCount=0;if(!Process32FirstW(snapshot.Get(),&row))Refuse("ame_uia_process_diagnostics_failed",GetLastError());
    do{if(++processCount>4096)Refuse("ame_uia_process_diagnostics_limit");if(_wcsicmp(row.szExeFile,L"Adobe Media Encoder.exe")!=0)continue;
        Handle original(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|PROCESS_QUERY_INFORMATION|PROCESS_VM_READ|SYNCHRONIZE,FALSE,row.th32ProcessID));
        if(!original.Valid())Refuse("ame_uia_candidate_access_denied",GetLastError());auto own=std::make_unique<Candidate>(std::move(original));if(candidate)Refuse("ame_uia_candidate_ambiguous");candidate=std::move(own);
    }while(Process32NextW(snapshot.Get(),&row));if(GetLastError()!=ERROR_NO_MORE_FILES)Refuse("ame_uia_process_diagnostics_failed",GetLastError());if(!candidate)Refuse("ame_uia_candidate_absent");candidate->Fresh();
    const auto image=FileCandidate(kAmeImage),diskExporter=FileCandidate(kDxvModule);Handle modules(CreateToolhelp32Snapshot(TH32CS_SNAPMODULE|TH32CS_SNAPMODULE32,candidate->pid));if(!modules.Valid())Refuse("ame_uia_module_diagnostics_failed",GetLastError());
    MODULEENTRY32W module{};module.dwSize=sizeof(module);unsigned loadedDxv=0,moduleCount=0;if(!Module32FirstW(modules.Get(),&module))Refuse("ame_uia_module_diagnostics_failed",GetLastError());
    do{if(++moduleCount>4096)Refuse("ame_uia_module_diagnostics_limit");if(_wcsicmp(module.szExePath,kDxvModule)==0)++loadedDxv;}while(Module32NextW(modules.Get(),&module));if(GetLastError()!=ERROR_NO_MORE_FILES||loadedDxv>1)Refuse("ame_uia_module_diagnostics_ambiguous",GetLastError());candidate->Fresh();
    Windows windows{*candidate,{},false};SetLastError(ERROR_SUCCESS);const bool enumerated=EnumWindows(Enumerate,reinterpret_cast<LPARAM>(&windows))!=FALSE;
    if(!enumerated&&!windows.overflow)Refuse("ame_uia_window_enumeration_failed",GetLastError());candidate->Fresh();if(windows.roots.empty())Refuse("ame_uia_window_absent");if(windows.overflow)Refuse("ame_uia_window_limit");
    Apartment apartment;Com<IUIAutomation> automation;const auto hr=CoCreateInstance(__uuidof(CUIAutomation),nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(automation.Out()));if(FAILED(hr))Refuse("ame_uia_provider_unavailable",static_cast<DWORD>(hr));
    Com<IUIAutomationTreeWalker> walker;const auto walkerHr=view==PassiveView::Raw?automation->get_RawViewWalker(walker.Out()):automation->get_ControlViewWalker(walker.Out());
    if(FAILED(walkerHr)||!walker.Get())Refuse("ame_uia_walker_unavailable",static_cast<DWORD>(walkerHr));
    Capture capture{*candidate,started};std::string roots="[";for(std::size_t i=0;i<windows.roots.size();++i){const auto window=windows.roots[i];capture.Boundary();DWORD pid=0;GetWindowThreadProcessId(window,&pid);if(pid!=candidate->pid)Refuse("ame_uia_original_window_changed");
        Com<IUIAutomationElement> root;const auto rootHr=automation->ElementFromHandle(window,root.Out());capture.Boundary();if(FAILED(rootHr)||!root.Get())Refuse("ame_uia_root_unavailable",static_cast<DWORD>(rootHr));if(i)roots+=',';
        roots+="{\"index\":"+Number(i)+",\"hwnd\":"+Json(Number(reinterpret_cast<std::uintptr_t>(window)))+",\"ownerPid\":"+Number(pid)+"}";capture.Walk(walker.Get(),root.Get(),0,UINT32_MAX,static_cast<std::uint32_t>(i));
        GetWindowThreadProcessId(window,&pid);if(!IsWindow(window)||pid!=candidate->pid)Refuse("ame_uia_original_window_changed");}roots+=']';capture.Boundary();
    std::string nodes="[";for(std::size_t i=0;i<capture.nodes.size();++i){if(i)nodes+=',';nodes+=capture.nodes[i];}nodes+=']';
    const auto identity="{\"pid\":"+Number(candidate->pid)+",\"birthFileTime\":"+Json(Number(candidate->birth))+",\"image\":"+image+",\"sid\":"+Json(Utf8(candidate->sid.c_str(),candidate->sid.size()))+",\"sameOriginalHandleFresh\":true,\"authority\":false}";
    return {"{\"schema\":\"ae-agent.ame-uia-passive-feasibility.v1\",\"ok\":true,\"authority\":false,\"view\":"+Json(view==PassiveView::Raw?"raw":"control")+",\"jobAssociated\":false,\"settingsVerified\":false,\"frozenParametersVerified\":false,\"actions\":0,\"nativeFactories\":0,\"process\":"+identity+
        ",\"diskExporter\":"+diskExporter+",\"loadedDxvCandidateCount\":"+Number(loadedDxv)+",\"loadedModuleJobBinding\":false,\"windows\":"+roots+",\"elements\":"+nodes+",\"elementCount\":"+Number(capture.count)+",\"textBytes\":"+Number(capture.textBytes)+",\"truncated\":"+(capture.truncated?"true":"false")+",\"complete\":"+(capture.truncated?"false":"true")+",\"elapsedMs\":"+Number(GetTickCount64()-started)+"}",!capture.truncated};
}catch(const Closed& failure){return {"{\"schema\":\"ae-agent.ame-uia-passive-feasibility.v1\",\"ok\":false,\"authority\":false,\"settingsVerified\":false,\"actions\":0,\"nativeFactories\":0,\"code\":"+Json(failure.code)+",\"win32OrHresult\":"+Number(failure.error)+"}",false};}}
}
