#include "enrollment_win32.h"
#include <windows.h>
#include <winternl.h>
#include <sddl.h>
#include <bcrypt.h>
#include <objbase.h>
#include <algorithm>
#include <cstring>
#include <limits>
#include <set>
#include <stdexcept>
#include <utility>

// No checked-in default or runtime selector. This reviewed, build-embedded header
// supplies local_session_reviewed::kProfile. Changing it cannot clear consumption.
#include "local_session_installation_pins.h"

namespace local_session {
namespace detail {
Held::Held(void* h):handle_(h) {}
Held::~Held(){if(Valid()&&!CloseHandle(handle_))std::terminate();}
Held::Held(Held&& other) noexcept:handle_(other.Take()){}
Held& Held::operator=(Held&& other) noexcept {if(this!=&other){if(Valid()&&!CloseHandle(handle_))std::terminate();handle_=other.Take();}return *this;}
void* Held::Get() const noexcept{return handle_;}
void* Held::Take() noexcept {void* h=handle_;handle_=nullptr;return h;}
bool Held::Valid()const noexcept{return handle_&&handle_!=INVALID_HANDLE_VALUE;}
[[noreturn]] void Refuse(const char* code,std::uint32_t error,bool unknown,bool unavailable){throw Failure{code,error,unknown,unavailable};}
template<std::size_t N> bool AllZero(const std::array<unsigned char,N>& a){return std::all_of(a.begin(),a.end(),[](unsigned char c){return c==0;});}
bool Zero(const Id& a){return AllZero(a);}bool Zero(const Digest& a){return AllZero(a);}
template<std::size_t N> std::string ToHex(const std::array<unsigned char,N>& a){constexpr char alphabet[]="0123456789abcdef";std::string s(N*2,'0');for(std::size_t i=0;i<N;++i){s[i*2]=alphabet[a[i]>>4];s[i*2+1]=alphabet[a[i]&15];}return s;}
std::string Hex(const Id& a){return ToHex(a);}std::string Hex(const Digest& a){return ToHex(a);}
void PutU16(std::vector<unsigned char>& b,std::uint16_t n){b.push_back(static_cast<unsigned char>(n));b.push_back(static_cast<unsigned char>(n>>8));}
void PutU64(std::vector<unsigned char>& b,std::uint64_t n){for(unsigned i=0;i<8;++i)b.push_back(static_cast<unsigned char>(n>>(8*i)));}
template<class A> void Put(std::vector<unsigned char>& b,const A& a){b.insert(b.end(),a.begin(),a.end());}
void PutPin(std::vector<unsigned char>& b,const ObjectPin& p){Put(b,p.volumeGuid);PutU64(b,p.serial);Put(b,p.fileId);}
Digest Hash(const std::vector<unsigned char>& b){
    BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE handle=nullptr;Digest result{};DWORD objectLength=0,returned=0;
    if(b.size()>std::numeric_limits<ULONG>::max()||BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)Refuse("hash_unavailable");
    if(BCryptGetProperty(algorithm,BCRYPT_OBJECT_LENGTH,reinterpret_cast<PUCHAR>(&objectLength),sizeof(objectLength),&returned,0)<0){BCryptCloseAlgorithmProvider(algorithm,0);Refuse("hash_unavailable");}
    std::vector<unsigned char> object(objectLength);NTSTATUS status=BCryptCreateHash(algorithm,&handle,object.data(),objectLength,nullptr,0,0);
    if(status>=0)status=BCryptHashData(handle,const_cast<PUCHAR>(b.data()),static_cast<ULONG>(b.size()),0);
    if(status>=0)status=BCryptFinishHash(handle,result.data(),static_cast<ULONG>(result.size()),0);
    if(handle)BCryptDestroyHash(handle);BCryptCloseAlgorithmProvider(algorithm,0);if(status<0)Refuse("hash_failed");return result;
}
Id RandomId(){Id id{};if(BCryptGenRandom(nullptr,id.data(),static_cast<ULONG>(id.size()),BCRYPT_USE_SYSTEM_PREFERRED_RNG)<0||Zero(id))Refuse("random_unavailable");return id;}
bool SamePath(const std::wstring& a,const std::wstring& b){return CompareStringOrdinal(a.c_str(),static_cast<int>(a.size()),b.c_str(),static_cast<int>(b.size()),TRUE)==CSTR_EQUAL;}
bool SamePin(const ObjectPin& a,const ObjectPin& b){return a.volumeGuid==b.volumeGuid&&a.serial==b.serial&&a.fileId==b.fileId&&SamePath(a.canonicalPath,b.canonicalPath);}
bool Component(const std::wstring& name){return !name.empty()&&name!=L"."&&name!=L".."&&name.size()<=255&&name.find_first_of(L"\\/:") ==std::wstring::npos&&name.find(L'\0')==std::wstring::npos;}
bool Anchor(const std::wstring& name){if(name.size()!=49||name.substr(0,11)!=L"\\\\?\\Volume{"||name[47]!=L'}'||name[48]!=L'\\')return false;GUID guid{};return CLSIDFromString(name.substr(10,38).c_str(),&guid)==S_OK;}
ObjectPin ReadPin(void* h,bool directory,std::uint64_t* length){
    if(GetFileType(h)!=FILE_TYPE_DISK)Refuse("not_disk");FILE_ATTRIBUTE_TAG_INFO attributes{};FILE_STANDARD_INFO standard{};FILE_ID_INFO identity{};
    if(!GetFileInformationByHandleEx(h,FileAttributeTagInfo,&attributes,sizeof(attributes))||!GetFileInformationByHandleEx(h,FileStandardInfo,&standard,sizeof(standard))||!GetFileInformationByHandleEx(h,FileIdInfo,&identity,sizeof(identity)))Refuse("identity_query_failed",GetLastError());
    constexpr DWORD forbidden=FILE_ATTRIBUTE_REPARSE_POINT|FILE_ATTRIBUTE_OFFLINE|FILE_ATTRIBUTE_RECALL_ON_OPEN|FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;
    if((attributes.FileAttributes&forbidden)||((attributes.FileAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0)!=directory||static_cast<bool>(standard.Directory)!=directory||standard.DeletePending||(!directory&&standard.NumberOfLinks!=1)||standard.EndOfFile.QuadPart<0)Refuse("object_shape_refused");
    if(directory){FILE_CASE_SENSITIVE_INFO sensitive{};if(!GetFileInformationByHandleEx(h,FileCaseSensitiveInfo,&sensitive,sizeof(sensitive)))Refuse("case_query_failed",GetLastError());if(sensitive.Flags&FILE_CS_FLAG_CASE_SENSITIVE_DIR)Refuse("case_sensitive_refused");}
    wchar_t fs[32]{};if(!GetVolumeInformationByHandleW(h,nullptr,0,nullptr,nullptr,nullptr,fs,32))Refuse("volume_query_failed",GetLastError());if(std::wstring(fs)!=L"NTFS")Refuse("not_local_ntfs");
    wchar_t canonical[32761]{};const DWORD n=GetFinalPathNameByHandleW(h,canonical,32761,FILE_NAME_NORMALIZED|VOLUME_NAME_GUID);if(!n||n>=32761)Refuse("canonical_query_failed",GetLastError());
    ObjectPin pin;pin.canonicalPath.assign(canonical,n);if(pin.canonicalPath.size()<49||!Anchor(pin.canonicalPath.substr(0,49)))Refuse("canonical_volume_refused");
    GUID guid{};if(CLSIDFromString(pin.canonicalPath.substr(10,38).c_str(),&guid)!=S_OK)Refuse("guid_invalid");std::memcpy(pin.volumeGuid.data(),&guid,16);pin.serial=identity.VolumeSerialNumber;std::memcpy(pin.fileId.data(),identity.FileId.Identifier,16);
    if(Zero(pin.fileId))Refuse("empty_file_identity");if(length)*length=static_cast<std::uint64_t>(standard.EndOfFile.QuadPart);return pin;
}
using NtCreate=NTSTATUS(NTAPI*)(PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES,PIO_STATUS_BLOCK,PLARGE_INTEGER,ULONG,ULONG,ULONG,ULONG,PVOID,ULONG);
using NtError=ULONG(NTAPI*)(NTSTATUS);
Held Relative(void* parent,const std::wstring& component,bool directory,bool create,bool write,bool exclusive,bool stableRead){
    if(!parent||!Component(component))Refuse("single_component_required");const HMODULE ntdll=GetModuleHandleW(L"ntdll.dll");const FARPROC createAddress=GetProcAddress(ntdll,"NtCreateFile"),errorAddress=GetProcAddress(ntdll,"RtlNtStatusToDosError");NtCreate call=nullptr;NtError error=nullptr;std::memcpy(&call,&createAddress,sizeof(call));std::memcpy(&error,&errorAddress,sizeof(error));if(!call||!error)Refuse("nt_api_unavailable");
    UNICODE_STRING name{};name.Buffer=const_cast<PWSTR>(component.c_str());name.Length=static_cast<USHORT>(component.size()*sizeof(wchar_t));name.MaximumLength=name.Length;OBJECT_ATTRIBUTES object{};object.Length=sizeof(object);object.RootDirectory=parent;object.ObjectName=&name;object.Attributes=0x40;IO_STATUS_BLOCK io{};HANDLE h=nullptr;
    const ACCESS_MASK access=FILE_READ_ATTRIBUTES|SYNCHRONIZE|(directory?FILE_LIST_DIRECTORY:FILE_READ_DATA)|(write?(directory?FILE_ADD_FILE|FILE_ADD_SUBDIRECTORY:FILE_WRITE_DATA):0);
    const ULONG share=exclusive?0u:((write||stableRead)?FILE_SHARE_READ:FILE_SHARE_READ|FILE_SHARE_WRITE);
    const NTSTATUS status=call(&h,access,&object,&io,nullptr,FILE_ATTRIBUTE_NORMAL,share,create?2u:1u,0x00200000|0x00000020|(directory?1u:0x40u),nullptr,0);
    if(status<0)Refuse(create?"create_new_refused":"relative_open_refused",error(status),create);
    try{Held held(h);if(!held.Valid()||!SetHandleInformation(h,HANDLE_FLAG_INHERIT,0))Refuse("native_handle_invalid",GetLastError(),create);ReadPin(h,directory);return held;}
    catch(detail::Failure failure){if(create)failure.unknown=true;throw failure;}
}
std::vector<unsigned char> ReadExact(void* h,std::size_t limit){std::uint64_t length=0;ReadPin(h,false,&length);if(length>limit||length>std::numeric_limits<DWORD>::max())Refuse("file_size_limit");LARGE_INTEGER start{};if(!SetFilePointerEx(h,start,nullptr,FILE_BEGIN))Refuse("read_seek_failed",GetLastError());std::vector<unsigned char> bytes(static_cast<std::size_t>(length));DWORD n=0;if(!ReadFile(h,bytes.data(),static_cast<DWORD>(bytes.size()),&n,nullptr)||n!=bytes.size())Refuse("read_exact_failed",GetLastError());return bytes;}
std::wstring ProcessSid(void* process){HANDLE token=nullptr;if(!OpenProcessToken(process,TOKEN_QUERY,&token))Refuse("process_token_failed",GetLastError());Held held(token);DWORD length=0;GetTokenInformation(token,TokenUser,nullptr,0,&length);if(GetLastError()!=ERROR_INSUFFICIENT_BUFFER||length<sizeof(TOKEN_USER)||length>65536)Refuse("sid_query_failed",GetLastError());std::vector<unsigned char> bytes(length);if(!GetTokenInformation(token,TokenUser,bytes.data(),length,&length))Refuse("sid_query_failed",GetLastError());const TOKEN_USER* user=reinterpret_cast<const TOKEN_USER*>(bytes.data());if(!IsValidSid(user->User.Sid))Refuse("sid_invalid");LPWSTR text=nullptr;if(!ConvertSidToStringSidW(user->User.Sid,&text))Refuse("sid_format_failed",GetLastError());std::wstring result(text);LocalFree(text);return result;}
std::wstring ProcessImage(void* process){wchar_t path[32761]{};DWORD n=32761;if(!QueryFullProcessImageNameW(process,0,path,&n)||!n)Refuse("process_image_failed",GetLastError());Held image(CreateFileW(path,FILE_READ_ATTRIBUTES,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));if(!image.Valid())Refuse("process_image_open_failed",GetLastError());return ReadPin(image.Get(),false).canonicalPath;}
std::uint64_t ProcessBirth(void* process){FILETIME born{},exit{},kernel{},user{};if(!GetProcessTimes(process,&born,&exit,&kernel,&user))Refuse("process_birth_failed",GetLastError());return(static_cast<std::uint64_t>(born.dwHighDateTime)<<32)|born.dwLowDateTime;}
bool ProcessLive(void* process){const DWORD wait=WaitForSingleObject(process,0);if(wait==WAIT_FAILED)Refuse("process_wait_failed",GetLastError());return wait==WAIT_TIMEOUT;}
} // namespace detail
namespace reviewed {const Profile& EmbeddedProfile(){return local_session_reviewed::kProfile;}}
namespace {
using detail::Held;using detail::Refuse;
constexpr wchar_t kInstallation[]=L".initial-owned-local.installation";
constexpr wchar_t kPolicy[]=L".initial-owned-local.policy";
constexpr wchar_t kLock[]=L".initial-owned-fence.lock";
constexpr wchar_t kJournal[]=L"journal";
struct Witness {Held handle;ObjectPin original;bool directory=true;};
struct OrdinalPathLess {
    bool operator()(const std::wstring& a,const std::wstring& b)const{
        const int compared=CompareStringOrdinal(a.c_str(),static_cast<int>(a.size()),b.c_str(),static_cast<int>(b.size()),TRUE);
        if(!compared)Refuse("source_selector_comparison_failed",GetLastError());return compared==CSTR_LESS_THAN;
    }
};
void Check(Held& h,const ObjectPin& pin,bool directory){if(!detail::SamePin(detail::ReadPin(h.Get(),directory),pin))Refuse("original_identity_changed");}
std::vector<Witness> Walk(const reviewed::Profile& p,const std::vector<std::wstring>& components,const std::vector<ObjectPin>& pins){
    if(!detail::Anchor(p.canonicalVolumeAnchor)||pins.size()!=components.size()+1)Refuse("embedded_root_contract_invalid");std::vector<Witness> held;
    Held anchor(CreateFileW(p.canonicalVolumeAnchor.c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));if(!anchor.Valid())Refuse("volume_anchor_open_failed",GetLastError());Check(anchor,pins.front(),true);held.push_back({std::move(anchor),pins.front(),true});
    for(std::size_t i=0;i<components.size();++i){Held next=detail::Relative(held.back().handle.Get(),components[i],true);Check(next,pins[i+1],true);held.push_back({std::move(next),pins[i+1],true});}return held;
}
Held OpenFile(void* root,const reviewed::File& file,std::vector<Witness>& ancestors){if(file.components.empty()||file.components.size()>32)Refuse("embedded_file_contract_invalid");void* parent=root;for(std::size_t i=0;i+1<file.components.size();++i){Held h=detail::Relative(parent,file.components[i],true);ObjectPin pin=detail::ReadPin(h.Get(),true);ancestors.push_back({std::move(h),pin,true});parent=ancestors.back().handle.Get();}Held fileHandle=detail::Relative(parent,file.components.back(),false,false,false,false,true);Check(fileHandle,file.pin,false);if(detail::Hash(detail::ReadExact(fileHandle.Get(),134217728))!=file.sha256)Refuse("source_pin_changed");return fileHandle;}
void EmptyInventory(void* h){alignas(FILE_ID_BOTH_DIR_INFO) std::array<unsigned char,65536> buffer{};bool first=true;std::size_t count=0;for(;;){const FILE_INFO_BY_HANDLE_CLASS kind=first?FileIdBothDirectoryRestartInfo:FileIdBothDirectoryInfo;first=false;if(!GetFileInformationByHandleEx(h,kind,buffer.data(),static_cast<DWORD>(buffer.size()))){if(GetLastError()==ERROR_NO_MORE_FILES)return;Refuse("inventory_query_failed",GetLastError());}std::size_t offset=0;for(;;){if(offset+offsetof(FILE_ID_BOTH_DIR_INFO,FileName)>buffer.size())Refuse("inventory_malformed");const auto* item=reinterpret_cast<const FILE_ID_BOTH_DIR_INFO*>(buffer.data()+offset);if(item->FileNameLength%2||item->FileNameLength>buffer.size()-offset-offsetof(FILE_ID_BOTH_DIR_INFO,FileName))Refuse("inventory_malformed");const std::wstring name(item->FileName,item->FileNameLength/2);if(name!=L"."&&name!=L".."){if(++count>256)Refuse("inventory_limit");Refuse("foreign_or_prior_inventory");}if(!item->NextEntryOffset)break;if(item->NextEntryOffset<offsetof(FILE_ID_BOTH_DIR_INFO,FileName)||item->NextEntryOffset>buffer.size()-offset)Refuse("inventory_malformed");offset+=item->NextEntryOffset;}}}
std::vector<unsigned char> PolicyBytes(const reviewed::Profile& p){std::vector<unsigned char> b={'O','W','N','L','P','O','L','2'};detail::PutU64(b,p.policyEpoch);detail::PutU16(b,p.capabilities);b.push_back(p.enabled?1:0);detail::PutU64(b,p.maximumSessionMs);detail::PutU64(b,p.maximumLeaseMs);b.insert(b.end(),p.authorizationAudit.begin(),p.authorizationAudit.end());b.insert(b.end(),p.lineage.begin(),p.lineage.end());for(wchar_t c:p.userSid)detail::PutU16(b,static_cast<std::uint16_t>(c));return b;}
std::vector<unsigned char> InstallationBytes(const reviewed::Profile& p,const ObjectPin& lock,const ObjectPin& journal){std::vector<unsigned char>b={'O','W','N','L','I','N','S','2'};b.insert(b.end(),p.installation.begin(),p.installation.end());b.insert(b.end(),p.lineage.begin(),p.lineage.end());detail::PutPin(b,p.repository);detail::PutPin(b,p.runtime);detail::PutPin(b,lock);detail::PutPin(b,journal);return b;}
void WriteNew(Held& h,const std::vector<unsigned char>& bytes){std::uint64_t length=0;const auto original=detail::ReadPin(h.Get(),false,&length);if(length||bytes.empty()||bytes.size()>16384)Refuse("provision_record_invalid",0,true);DWORD written=0;if(!WriteFile(h.Get(),bytes.data(),static_cast<DWORD>(bytes.size()),&written,nullptr)||written!=bytes.size())Refuse("provision_write_unknown",GetLastError(),true);if(!FlushFileBuffers(h.Get()))Refuse("provision_flush_unknown",GetLastError(),true);if(!detail::SamePin(detail::ReadPin(h.Get(),false),original)||detail::ReadExact(h.Get(),16384)!=bytes)Refuse("provision_readback_unknown",0,true);}
void RuntimeInventory(void* root){
    const std::set<std::wstring> expected={kInstallation,kPolicy,kLock,kJournal};
    std::set<std::wstring> observed;alignas(FILE_ID_BOTH_DIR_INFO) std::array<unsigned char,65536> buffer{};bool restart=true;
    for(;;){const auto kind=restart?FileIdBothDirectoryRestartInfo:FileIdBothDirectoryInfo;restart=false;
        if(!GetFileInformationByHandleEx(root,kind,buffer.data(),static_cast<DWORD>(buffer.size()))){if(GetLastError()==ERROR_NO_MORE_FILES)break;Refuse("runtime_inventory_query_failed",GetLastError());}
        std::size_t offset=0;for(;;){if(offset+offsetof(FILE_ID_BOTH_DIR_INFO,FileName)>buffer.size())Refuse("runtime_inventory_malformed");const auto* entry=reinterpret_cast<const FILE_ID_BOTH_DIR_INFO*>(buffer.data()+offset);
            if(entry->FileNameLength%2||entry->FileNameLength>buffer.size()-offset-offsetof(FILE_ID_BOTH_DIR_INFO,FileName))Refuse("runtime_inventory_malformed");
            const std::wstring name(entry->FileName,entry->FileNameLength/2);if(name!=L"."&&name!=L".."){if(!expected.count(name)||!observed.insert(name).second||observed.size()>4)Refuse("runtime_inventory_foreign");}
            if(!entry->NextEntryOffset)break;if(entry->NextEntryOffset<offsetof(FILE_ID_BOTH_DIR_INFO,FileName)||entry->NextEntryOffset>buffer.size()-offset)Refuse("runtime_inventory_malformed");offset+=entry->NextEntryOffset;
        }
    }
    if(observed!=expected)Refuse("runtime_inventory_partial");
}
}
struct InstalledEnrollment::Data {
    const reviewed::Profile& profile;
    std::vector<Witness> repository,runtime,sourceParents,inventory;
    std::vector<Held> sourceFiles;
    Held installation,policy,journal;
    Digest scope{},launchKey{};
    std::size_t bridgeEntryIndex=std::numeric_limits<std::size_t>::max();
    explicit Data(const reviewed::Profile& p):profile(p){}
    void Bases(){
        const auto& p=profile;
        if(detail::Zero(p.installation)||detail::Zero(p.lineage)||detail::Zero(p.launchTarget)||detail::Zero(p.stopTarget)||detail::Zero(p.actorTarget)||p.policyEpoch==0||p.capabilities!=0x001f||!p.enabled||p.maximumSessionMs==0||p.maximumSessionMs>8ULL*60*60*1000||p.maximumLeaseMs==0||p.maximumLeaseMs>60000||p.userSid!=detail::ProcessSid(GetCurrentProcess()))Refuse("embedded_policy_or_sid_refused");
        if(p.sourceFiles.empty()||p.sourceFiles.size()>128||p.inventories.size()>32||p.inventories.size()<6)Refuse("embedded_inventory_or_source_contract_invalid");
        std::set<std::wstring,OrdinalPathLess> selectors;
        const std::vector<std::wstring> exactBridge={L"mcp-server",L"bridge-daemon.js"};
        for(std::size_t i=0;i<p.sourceFiles.size();++i){
            const auto& file=p.sourceFiles[i];if(file.components.empty()||file.components.size()>32)Refuse("source_selector_invalid");
            std::wstring selector;for(const auto& part:file.components){if(!detail::Component(part))Refuse("source_selector_invalid");if(!selector.empty())selector+=L'\\';selector+=part;}
            if(!selectors.insert(selector).second)Refuse("duplicate_source_selector");
            if(!detail::SamePath(file.pin.canonicalPath,p.repository.canonicalPath+L"\\"+selector))Refuse("source_canonical_selector_mismatch");
            if(file.components==exactBridge){
                if(bridgeEntryIndex!=std::numeric_limits<std::size_t>::max())Refuse("duplicate_bridge_entry");
                if(detail::Zero(file.pin.fileId)||detail::Zero(file.sha256))Refuse("mandatory_bridge_entry_pin_missing");bridgeEntryIndex=i;
            }
        }
        // Completeness is checked from the closed selectors, never sourceSetHash.
        // This refusal happens before provisioning or any process creation.
        if(bridgeEntryIndex==std::numeric_limits<std::size_t>::max())Refuse("mandatory_bridge_entry_missing");
        repository=Walk(p,p.repositoryComponents,p.repositoryAncestors);runtime=Walk(p,p.runtimeComponents,p.runtimeAncestors);
        Check(repository.back().handle,p.repository,true);Check(runtime.back().handle,p.runtime,true);
        for(const auto& file:p.sourceFiles)sourceFiles.push_back(OpenFile(repository.back().handle.Get(),file,sourceParents));
        sourceFiles.push_back(OpenFile(repository.front().handle.Get(),p.node,sourceParents));sourceFiles.push_back(OpenFile(repository.front().handle.Get(),p.controllerImage,sourceParents));
    }
    void Inventory(){for(const auto& entry:profile.inventories){if(entry.components.empty()||entry.components.size()>32)Refuse("inventory_contract_invalid");void* parent=repository.back().handle.Get();bool absent=false;for(std::size_t i=0;i<entry.components.size();++i){try{Held h=detail::Relative(parent,entry.components[i],true);ObjectPin pin=detail::ReadPin(h.Get(),true);inventory.push_back({std::move(h),pin,true});parent=inventory.back().handle.Get();}catch(const detail::Failure& failure){if(entry.absent&&(failure.error==ERROR_FILE_NOT_FOUND||failure.error==ERROR_PATH_NOT_FOUND)){absent=true;break;}throw;}}if(entry.absent&&!absent)Refuse("prior_inventory_present");if(!entry.absent){if(absent||!detail::SamePin(detail::ReadPin(parent,true),entry.pin))Refuse("inventory_pin_changed");EmptyInventory(parent);}}}
};
InstalledEnrollment::InstalledEnrollment(std::unique_ptr<Data> d):data_(std::move(d)){}InstalledEnrollment::~InstalledEnrollment()=default;
std::unique_ptr<InstalledEnrollment> InstalledEnrollment::OpenFixed(Result& result){try{auto d=std::make_unique<Data>(reviewed::EmbeddedProfile());d->Bases();d->Inventory();void* root=d->runtime.back().handle.Get();d->installation=detail::Relative(root,kInstallation,false,false,false,false,true);Check(d->installation,d->profile.installationFile,false);d->policy=detail::Relative(root,kPolicy,false,false,false,false,true);Check(d->policy,d->profile.policyFile,false);d->journal=detail::Relative(root,kJournal,true);Check(d->journal,d->profile.journal,true);if(detail::ReadExact(d->policy.Get(),16384)!=PolicyBytes(d->profile)||detail::Hash(PolicyBytes(d->profile))!=d->profile.policyHash||detail::ReadExact(d->installation.Get(),16384)!=InstallationBytes(d->profile,d->profile.lockFile,d->profile.journal))Refuse("enrollment_record_changed");
    std::vector<unsigned char> scope;scope.insert(scope.end(),d->profile.installation.begin(),d->profile.installation.end());detail::PutPin(scope,d->profile.repository);detail::PutPin(scope,d->profile.runtime);detail::PutPin(scope,d->profile.journal);detail::PutPin(scope,d->profile.lockFile);d->scope=detail::Hash(scope);
    RuntimeInventory(root);Held lockWitness=detail::Relative(root,kLock,false);std::uint64_t lockSize=0;if(!detail::SamePin(detail::ReadPin(lockWitness.Get(),false,&lockSize),d->profile.lockFile)||lockSize)Refuse("original_empty_lock_required");
    std::vector<unsigned char> launch;launch.insert(launch.end(),d->profile.installation.begin(),d->profile.installation.end());detail::PutU16(launch,static_cast<std::uint16_t>(d->profile.userSid.size()));for(wchar_t c:d->profile.userSid)detail::PutU16(launch,static_cast<std::uint16_t>(c));detail::PutU64(launch,d->profile.runtime.serial);launch.insert(launch.end(),d->profile.runtime.fileId.begin(),d->profile.runtime.fileId.end());launch.insert(launch.end(),d->profile.lineage.begin(),d->profile.lineage.end());d->launchKey=detail::Hash(launch);result.ok=true;result.code="fixed_enrollment_open";return std::unique_ptr<InstalledEnrollment>(new InstalledEnrollment(std::move(d)));
}catch(const detail::Failure& f){result={false,f.unknown,f.unavailable,f.code,f.error};}return nullptr;}
Result InstalledEnrollment::ProvisionFixed(){Result result;bool created=false;try{Data d(reviewed::EmbeddedProfile());d.Bases();d.Inventory();EmptyInventory(d.runtime.back().handle.Get());void* root=d.runtime.back().handle.Get();Held lock=detail::Relative(root,kLock,false,true,true,true);created=true;std::uint64_t size=0;const ObjectPin lockPin=detail::ReadPin(lock.Get(),false,&size);if(size)Refuse("created_lock_not_empty",0,true);Held journal=detail::Relative(root,kJournal,true,true,true);const ObjectPin journalPin=detail::ReadPin(journal.Get(),true);EmptyInventory(journal.Get());Held installation=detail::Relative(root,kInstallation,false,true,true);Held policy=detail::Relative(root,kPolicy,false,true,true);
    // Creation's exclusive original empty lock is the kernel exclusion. Every
    // ancestor/source witness remains held; no cleanup or auto retry on partial.
    for(const auto& witness:d.repository)if(!detail::SamePin(detail::ReadPin(witness.handle.Get(),true),witness.original))Refuse("provision_ancestor_changed",0,true);
    for(const auto& witness:d.runtime)if(!detail::SamePin(detail::ReadPin(witness.handle.Get(),true),witness.original))Refuse("provision_ancestor_changed",0,true);
    WriteNew(installation,InstallationBytes(d.profile,lockPin,journalPin));WriteNew(policy,PolicyBytes(d.profile));if(!detail::SamePin(detail::ReadPin(lock.Get(),false,&size),lockPin)||size)Refuse("provision_lock_changed",0,true);result.ok=true;result.code="provisioned_original_ids_require_reviewed_pin_capture";
}catch(const detail::Failure& f){result={false,created||f.unknown,f.unavailable,f.code,f.error};}return result;}
Result InstalledEnrollment::Fresh(bool lockHeld)const{
    Result result;
    try{
        const auto& d=*data_;if(!lockHeld)Refuse("actual_fence_required");
        if(detail::ProcessSid(GetCurrentProcess())!=d.profile.userSid)Refuse("broker_sid_changed");
        for(const auto& w:d.repository)if(!detail::SamePin(detail::ReadPin(w.handle.Get(),true),w.original))Refuse("repository_identity_changed");
        for(const auto& w:d.runtime)if(!detail::SamePin(detail::ReadPin(w.handle.Get(),true),w.original))Refuse("runtime_identity_changed");
        for(const auto& w:d.sourceParents)if(!detail::SamePin(detail::ReadPin(w.handle.Get(),true),w.original))Refuse("source_parent_changed");
        if(d.sourceFiles.size()!=d.profile.sourceFiles.size()+2)Refuse("source_witness_count_changed");
        for(std::size_t i=0;i<d.profile.sourceFiles.size();++i)if(!detail::SamePin(detail::ReadPin(d.sourceFiles[i].Get(),false),d.profile.sourceFiles[i].pin))Refuse("source_witness_changed");
        if(!detail::SamePin(detail::ReadPin(d.sourceFiles[d.sourceFiles.size()-2].Get(),false),d.profile.node.pin)||!detail::SamePin(detail::ReadPin(d.sourceFiles.back().Get(),false),d.profile.controllerImage.pin))Refuse("executable_witness_changed");
        RuntimeInventory(d.runtime.back().handle.Get());
        if(!detail::SamePin(detail::ReadPin(d.installation.Get(),false),d.profile.installationFile)||!detail::SamePin(detail::ReadPin(d.policy.Get(),false),d.profile.policyFile)||!detail::SamePin(detail::ReadPin(d.journal.Get(),true),d.profile.journal)||detail::ReadExact(d.policy.Get(),16384)!=PolicyBytes(d.profile)||detail::ReadExact(d.installation.Get(),16384)!=InstallationBytes(d.profile,d.profile.lockFile,d.profile.journal))Refuse("enrollment_changed");
        result.ok=true;result.code="enrollment_original_live";
    }catch(const detail::Failure& f){result={false,f.unknown,f.unavailable,f.code,f.error};}
    return result;
}
const reviewed::Profile& InstalledEnrollment::Profile()const{return data_->profile;}
void* InstalledEnrollment::BorrowedRuntime()const{return data_->runtime.back().handle.Get();}
void* InstalledEnrollment::BorrowedJournal()const{return data_->journal.Get();}
const std::wstring& InstalledEnrollment::CheckedBridgeEntry()const{
    const auto& d=*data_;if(d.bridgeEntryIndex>=d.profile.sourceFiles.size()||d.bridgeEntryIndex>=d.sourceFiles.size())Refuse("mandatory_bridge_entry_unavailable");
    const auto& approved=d.profile.sourceFiles[d.bridgeEntryIndex];
    if(approved.components!=std::vector<std::wstring>{L"mcp-server",L"bridge-daemon.js"}||!detail::SamePath(approved.pin.canonicalPath,d.profile.repository.canonicalPath+L"\\mcp-server\\bridge-daemon.js")||!detail::SamePin(detail::ReadPin(d.sourceFiles[d.bridgeEntryIndex].Get(),false),approved.pin))Refuse("mandatory_bridge_entry_changed");
    // The original read-only witness refuses SHARE_WRITE/SHARE_DELETE for its
    // full lifetime. Its initial full digest check cannot be replaced by metadata.
    return approved.pin.canonicalPath;
}
Digest InstalledEnrollment::Scope()const{return data_->scope;}Digest InstalledEnrollment::LaunchKey()const{return data_->launchKey;}
Result ProvisionFixedEnrollment(){return InstalledEnrollment::ProvisionFixed();}
} // namespace local_session
