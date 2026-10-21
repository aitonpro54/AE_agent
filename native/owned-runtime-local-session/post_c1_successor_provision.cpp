#include "post_c1_successor_provision.h"
#include <windows.h>
#include <winternl.h>
#include <aclapi.h>
#include <sddl.h>
#include <algorithm>
#include <cstring>
#include <set>
#include <utility>

namespace local_session::post_c1 {
namespace {
using Bytes=std::vector<unsigned char>;using detail::Held;using detail::Refuse;
constexpr std::size_t kClosedLimit=16384;
template<class T>void Put(Bytes& out,const T& value){out.insert(out.end(),value.begin(),value.end());}
Digest Domain(const char* name,const Bytes& body){Bytes bytes(name,name+std::strlen(name));bytes.push_back(0);Put(bytes,body);return detail::Hash(bytes);}
void Text(Bytes& out,const std::wstring& text){if(text.empty()||text.size()>32760||text.find(L'\0')!=std::wstring::npos)Refuse("post_c1_text_refused");detail::PutU16(out,static_cast<std::uint16_t>(text.size()));for(wchar_t c:text)detail::PutU16(out,static_cast<std::uint16_t>(c));}
void PathPin(Bytes& out,const ObjectPin& pin){detail::PutPin(out,pin);Text(out,pin.canonicalPath);}
void File(Bytes& out,const ClosedFile& file){PathPin(out,file.file.pin);Put(out,file.file.sha256);detail::PutU64(out,file.bytes);}
Digest SidHash(const std::wstring& sid){Bytes bytes;for(wchar_t c:sid)detail::PutU16(bytes,static_cast<std::uint16_t>(c));return Domain("lcs.production.sid.v1",bytes);}
bool Physical(const ObjectPin& a,const ObjectPin& b){return a.volumeGuid==b.volumeGuid&&a.serial==b.serial&&a.fileId==b.fileId;}
void PinValid(const ObjectPin& pin){if(detail::Zero(pin.volumeGuid)||detail::Zero(pin.fileId)||!pin.serial||pin.canonicalPath.size()<50||pin.canonicalPath.substr(0,11)!=L"\\\\?\\Volume{"||pin.canonicalPath[48]!=L'\\')Refuse("post_c1_physical_pin_required");}
struct Reader final {const Bytes& bytes;std::size_t at=0;
    void Need(std::size_t n){if(at>bytes.size()||n>bytes.size()-at)Refuse("post_c1_record_truncated");}
    std::uint64_t Number(std::size_t n){Need(n);std::uint64_t out=0;for(std::size_t i=0;i<n;++i)out|=static_cast<std::uint64_t>(bytes[at++])<<(i*8);return out;}
    template<std::size_t N>std::array<unsigned char,N> Fixed(){Need(N);std::array<unsigned char,N> out{};std::copy_n(bytes.data()+at,N,out.begin());at+=N;return out;}
    Bytes Part(std::size_t n){Need(n);Bytes out(bytes.begin()+static_cast<std::ptrdiff_t>(at),bytes.begin()+static_cast<std::ptrdiff_t>(at+n));at+=n;return out;}
    ObjectPin Pin(){ObjectPin out;out.volumeGuid=Fixed<16>();out.serial=Number(8);out.fileId=Fixed<16>();if(detail::Zero(out.volumeGuid)||detail::Zero(out.fileId)||!out.serial)Refuse("post_c1_record_empty_pin");return out;}
    void End(){if(at!=bytes.size())Refuse("post_c1_record_trailing");}
};
void Header(Reader& r,const char* magic,std::uint16_t version,std::size_t bytes){const auto actual=r.Fixed<8>();if(!std::equal(actual.begin(),actual.end(),magic)||r.Number(2)!=version||r.Number(2)!=1||r.Number(4)!=bytes)Refuse("post_c1_record_header_refused");}
void ExpectPin(Reader& r,const ObjectPin& expected){if(!Physical(r.Pin(),expected))Refuse("post_c1_record_pin_mismatch");}
void Nonzero(const Digest& digest){if(detail::Zero(digest))Refuse("post_c1_record_empty_hash");}
void ValidateSpec(const Specification& s,const reviewed::Profile& next,const ObjectPin& setup){
    if(s.operatorKind!=kExplicitLocalOperator||s.userSid!=next.userSid||s.userSid!=detail::ProcessSid(GetCurrentProcess())||detail::Zero(s.operatorAuthorization)||s.operatorAuthorization!=next.authorizationAudit||
        detail::Zero(s.installation)||detail::Zero(s.lineage)||detail::Zero(s.scopeHash)||s.installation==next.installation||s.lineage==next.lineage||!detail::SamePin(s.repository,next.repository)||detail::SamePin(s.runtime,next.runtime)||detail::SamePin(s.runtime,setup))Refuse("post_c1_local_operator_specification_refused");
    for(const auto* pin:{&s.repository,&s.runtime,&s.lock,&s.journal})PinValid(*pin);
    if(s.runtime.canonicalPath.rfind(s.repository.canonicalPath+L"\\",0)!=0||s.lock.canonicalPath!=s.runtime.canonicalPath+L"\\.initial-owned-fence.lock"||s.journal.canonicalPath!=s.runtime.canonicalPath+L"\\journal")Refuse("post_c1_predecessor_namespace_refused");
    if(s.installationFile.file.pin.canonicalPath!=s.runtime.canonicalPath+L"\\.initial-owned-local.installation"||s.policyFile.file.pin.canonicalPath!=s.runtime.canonicalPath+L"\\.initial-owned-local.policy"||
        s.records[0].file.pin.canonicalPath!=s.journal.canonicalPath+L"\\00000000000000000001.rec"||s.records[1].file.pin.canonicalPath!=s.journal.canonicalPath+L"\\00000000000000000002.rec"||s.seal.file.pin.canonicalPath.rfind(s.repository.canonicalPath+L"\\",0)!=0)Refuse("post_c1_closed_file_selector_refused");
    for(const auto* f:{&s.seal,&s.installationFile,&s.policyFile,&s.records[0],&s.records[1]}){PinValid(f->file.pin);if(detail::Zero(f->file.sha256)||!f->bytes||f->bytes>kClosedLimit)Refuse("post_c1_closed_file_definition_refused");}
    if(s.installationFile.bytes!=200||s.records[0].bytes!=458||s.records[1].bytes!=244||s.specificationHash!=SpecificationHash(s))Refuse("post_c1_closed_specification_hash_refused");
    Bytes scope;Put(scope,s.installation);for(const auto* pin:{&s.repository,&s.runtime,&s.journal,&s.lock})detail::PutPin(scope,*pin);if(detail::Hash(scope)!=s.scopeHash)Refuse("post_c1_closed_scope_refused");
}
struct Sid final {PSID value=nullptr;explicit Sid(const std::wstring& text){if(!ConvertStringSidToSidW(text.c_str(),&value))Refuse("post_c1_sid_invalid",GetLastError());}~Sid(){if(value)LocalFree(value);}};
constexpr bool AclControlPermitted(SECURITY_DESCRIPTOR_CONTROL control,bool privateDirectory){return (control&SE_DACL_PRESENT)&&(!privateDirectory||(control&SE_DACL_PROTECTED));}
static_assert(AclControlPermitted(SE_DACL_PRESENT,false),"shared repository and inherited intent need a present DACL");
static_assert(!AclControlPermitted(0,false),"missing DACL refuses even shared repository");
static_assert(!AclControlPermitted(SE_DACL_PRESENT,true),"private parent cannot inherit an ancestor's future grants");
static_assert(AclControlPermitted(SE_DACL_PRESENT|SE_DACL_PROTECTED,true),"protected private parent supported");
constexpr ACCESS_MASK kForeignWrites=GENERIC_ALL|GENERIC_WRITE|WRITE_DAC|WRITE_OWNER|DELETE|FILE_WRITE_DATA|FILE_APPEND_DATA|FILE_WRITE_EA|FILE_WRITE_ATTRIBUTES|FILE_DELETE_CHILD;
constexpr bool ForeignWriteRefused(ACCESS_MASK mask,BYTE flags,bool trusted){return !(flags&INHERIT_ONLY_ACE)&&(mask&kForeignWrites)&&!trusted;}
static_assert(ForeignWriteRefused(0x1301ff,0,false),"observed foreign Modify ACE refuses private history");
static_assert(ForeignWriteRefused(FILE_DELETE_CHILD,0,false)&&ForeignWriteRefused(DELETE,0,false),"both parent and file deletion rights refuse");
static_assert(ForeignWriteRefused(WRITE_DAC|WRITE_OWNER,0,false),"foreign ACL rewriting refuses");
static_assert(!ForeignWriteRefused(FILE_GENERIC_READ,0,false),"read-only foreign access is not write authority");
static_assert(!ForeignWriteRefused(FILE_ALL_ACCESS,INHERIT_ONLY_ACE,false)&&!ForeignWriteRefused(FILE_ALL_ACCESS,0,true),"inherit-only and trusted ACE behavior preserved");
void CheckAcl(void* handle,const std::wstring& sid,bool privateDirectory,bool strictWrites){
    Sid own(sid);PSID owner=nullptr;PACL acl=nullptr;PSECURITY_DESCRIPTOR descriptor=nullptr;
    const DWORD status=GetSecurityInfo(handle,SE_FILE_OBJECT,OWNER_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION,&owner,nullptr,&acl,nullptr,&descriptor);
    if(status!=ERROR_SUCCESS)Refuse("post_c1_acl_query_refused",status);struct Release{PSECURITY_DESCRIPTOR p;~Release(){if(p)LocalFree(p);}}release{descriptor};
    if(!owner||!EqualSid(owner,own.value)||!acl||!IsValidAcl(acl))Refuse("post_c1_owner_or_null_dacl_refused");
    SECURITY_DESCRIPTOR_CONTROL control=0;DWORD revision=0;if(!GetSecurityDescriptorControl(descriptor,&control,&revision))Refuse("post_c1_acl_control_query_refused",GetLastError());
    if(!AclControlPermitted(control,privateDirectory))Refuse("post_c1_private_parent_dacl_unprotected");
    // The shared checkout is an identity/source container, not the private
    // durable-intent parent. Its original pin is independently checked in Fresh.
    if(!strictWrites)return;
    std::array<unsigned char,SECURITY_MAX_SID_SIZE> system{},administrators{};DWORD systemBytes=static_cast<DWORD>(system.size()),adminBytes=static_cast<DWORD>(administrators.size());
    if(!CreateWellKnownSid(WinLocalSystemSid,nullptr,system.data(),&systemBytes)||!CreateWellKnownSid(WinBuiltinAdministratorsSid,nullptr,administrators.data(),&adminBytes))Refuse("post_c1_system_sid_refused",GetLastError());
    for(DWORD i=0;i<acl->AceCount;++i){void* raw=nullptr;if(!GetAce(acl,i,&raw))Refuse("post_c1_ace_query_refused",GetLastError());const auto* header=static_cast<const ACE_HEADER*>(raw);if(header->AceFlags&INHERIT_ONLY_ACE)continue;
        if(header->AceType==ACCESS_DENIED_ACE_TYPE)continue;if(header->AceType!=ACCESS_ALLOWED_ACE_TYPE||header->AceSize<sizeof(ACCESS_ALLOWED_ACE))Refuse("post_c1_ace_type_refused");
        const auto* ace=static_cast<const ACCESS_ALLOWED_ACE*>(raw);const auto trustee=const_cast<DWORD*>(&ace->SidStart);if(!IsValidSid(trustee)||GetLengthSid(trustee)>header->AceSize- offsetof(ACCESS_ALLOWED_ACE,SidStart))Refuse("post_c1_ace_sid_refused");
        if(ForeignWriteRefused(ace->Mask,header->AceFlags,EqualSid(trustee,own.value)||EqualSid(trustee,system.data())||EqualSid(trustee,administrators.data())))Refuse("post_c1_foreign_write_acl_refused");
    }
}
void OwnAcl(void* handle,const std::wstring& sid,bool privateDirectory=false){CheckAcl(handle,sid,privateDirectory,true);}
Held Relative(void* parent,const std::wstring& name,bool directory,ACCESS_MASK access,ULONG share,bool create=false,bool* durableEffect=nullptr){
    using NtCreate=NTSTATUS(NTAPI*)(PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES,PIO_STATUS_BLOCK,PLARGE_INTEGER,ULONG,ULONG,ULONG,ULONG,PVOID,ULONG);
    using ToError=ULONG(NTAPI*)(NTSTATUS);NtCreate open=nullptr;ToError error=nullptr;auto address=GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtCreateFile");std::memcpy(&open,&address,sizeof(open));address=GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"RtlNtStatusToDosError");std::memcpy(&error,&address,sizeof(error));
    if(!open||!error||name.empty()||name.size()>255||name==L"."||name==L".."||name.find_first_of(L"\\/:")!=std::wstring::npos)Refuse("post_c1_relative_selector_refused");
    UNICODE_STRING text{};text.Buffer=const_cast<PWSTR>(name.c_str());text.Length=static_cast<USHORT>(name.size()*2);text.MaximumLength=text.Length;OBJECT_ATTRIBUTES object{};object.Length=sizeof(object);object.RootDirectory=parent;object.ObjectName=&text;object.Attributes=0x40;IO_STATUS_BLOCK io{};HANDLE handle=nullptr;
    const NTSTATUS status=open(&handle,access|FILE_READ_ATTRIBUTES|READ_CONTROL|SYNCHRONIZE,&object,&io,nullptr,FILE_ATTRIBUTE_NORMAL,share,create?2u:1u,0x00200000u|0x20u|(directory?1u:0x40u),nullptr,0);
    if(status<0){const auto win32=error(status);if(create&&(win32==ERROR_FILE_EXISTS||win32==ERROR_ALREADY_EXISTS))Refuse("post_c1_successor_intent_consumed",win32,false,true);Refuse(create?"post_c1_successor_intent_create_refused":"post_c1_original_open_refused",win32,create);}
    if(create&&durableEffect)*durableEffect=true;
    Held result(handle);if(!result.Valid()||!SetHandleInformation(handle,HANDLE_FLAG_INHERIT,0))Refuse("post_c1_original_handle_refused",GetLastError(),create);detail::ReadPin(handle,directory);return result;
}
struct Parent final {Held handle;ObjectPin pin;};
Held Absolute(const ObjectPin& expected,bool directory,std::vector<Parent>& parents){PinValid(expected);const auto& path=expected.canonicalPath;
    Held volume(CreateFileW(path.substr(0,49).c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|READ_CONTROL|SYNCHRONIZE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!volume.Valid())Refuse("post_c1_volume_open_refused",GetLastError());auto pin=detail::ReadPin(volume.Get(),true);parents.push_back({std::move(volume),pin});void* parent=parents.back().handle.Get();std::size_t at=49;
    for(;;){const auto end=path.find(L'\\',at);const bool branch=end!=std::wstring::npos;auto item=Relative(parent,path.substr(at,branch?end-at:std::wstring::npos),branch||directory,branch||directory?FILE_LIST_DIRECTORY:FILE_READ_DATA,branch||directory?FILE_SHARE_READ|FILE_SHARE_WRITE:FILE_SHARE_READ);
        if(!branch){if(!detail::SamePin(detail::ReadPin(item.Get(),directory),expected))Refuse("post_c1_original_pin_refused");return item;}pin=detail::ReadPin(item.Get(),true);parents.push_back({std::move(item),pin});parent=parents.back().handle.Get();at=end+1;}
}
void Inventory(void* original,const std::set<std::wstring>& expected,bool detectIntent=false){
    std::set<std::wstring> seen;alignas(FILE_ID_BOTH_DIR_INFO)std::array<unsigned char,65536> buffer{};bool first=true;
    for(;;){const auto kind=first?FileIdBothDirectoryRestartInfo:FileIdBothDirectoryInfo;first=false;if(!GetFileInformationByHandleEx(original,kind,buffer.data(),static_cast<DWORD>(buffer.size()))){if(GetLastError()==ERROR_NO_MORE_FILES)break;Refuse("post_c1_inventory_query_refused",GetLastError());}
        std::size_t offset=0;for(;;){if(offset+offsetof(FILE_ID_BOTH_DIR_INFO,FileName)>buffer.size())Refuse("post_c1_inventory_malformed");const auto* row=reinterpret_cast<const FILE_ID_BOTH_DIR_INFO*>(buffer.data()+offset);if(row->FileNameLength%2||row->FileNameLength>buffer.size()-offset- offsetof(FILE_ID_BOTH_DIR_INFO,FileName))Refuse("post_c1_inventory_malformed");const std::wstring name(row->FileName,row->FileNameLength/2);
            if(name!=L"."&&name!=L".."){if(detectIntent&&name==kIntentName)Refuse("post_c1_successor_intent_consumed",0,false,true);if(!expected.count(name)||!seen.insert(name).second)Refuse("post_c1_foreign_inventory_refused");}
            if(!row->NextEntryOffset)break;if(row->NextEntryOffset<offsetof(FILE_ID_BOTH_DIR_INFO,FileName)||row->NextEntryOffset>buffer.size()-offset)Refuse("post_c1_inventory_malformed");offset+=row->NextEntryOffset;}
    }if(seen!=expected)Refuse("post_c1_missing_inventory_refused");
}
const std::set<std::wstring> kRuntime={L".initial-owned-local.installation",L".initial-owned-local.policy",L".initial-owned-fence.lock",L"journal"};
const std::set<std::wstring> kJournal={L"00000000000000000001.rec",L"00000000000000000002.rec"};
Bytes ReadClosed(void* handle,const ClosedFile& expected,const std::wstring& sid){std::uint64_t size=0;if(!detail::SamePin(detail::ReadPin(handle,false,&size),expected.file.pin)||size!=expected.bytes)Refuse("post_c1_closed_file_pin_or_size_refused");OwnAcl(handle,sid);auto bytes=detail::ReadExact(handle,kClosedLimit);if(bytes.size()!=expected.bytes||detail::Hash(bytes)!=expected.file.sha256)Refuse("post_c1_closed_file_bytes_refused");return bytes;}
struct Frame final {Digest scope{},genesis{},previous{},key{},hash{};Id lineage{},owner{};std::uint64_t sequence=0,epoch=0;std::uint16_t type=0;Bytes payload;};
Frame FrameBytes(const Bytes& bytes){Reader r{bytes};const auto magic=r.Fixed<8>();if(magic!=std::array<unsigned char,8>{'O','W','N','J','R','N','0','1'}||r.Number(2)!=1)Refuse("post_c1_frame_header_refused");Frame f;f.type=static_cast<std::uint16_t>(r.Number(2));if(r.Number(4)!=bytes.size())Refuse("post_c1_frame_length_refused");f.scope=r.Fixed<32>();f.lineage=r.Fixed<16>();f.genesis=r.Fixed<32>();f.sequence=r.Number(8);f.epoch=r.Number(8);f.owner=r.Fixed<16>();f.previous=r.Fixed<32>();f.key=r.Fixed<32>();const auto length=r.Number(4);if(length>kClosedLimit)Refuse("post_c1_frame_payload_refused");f.payload=r.Part(static_cast<std::size_t>(length));f.hash=r.Fixed<32>();r.End();if(detail::Hash(Bytes(bytes.begin(),bytes.end()-32))!=f.hash)Refuse("post_c1_frame_integrity_refused");return f;}
void ValidateFrames(const Specification& s,const Bytes& genesis,const Bytes& owner){const auto a=FrameBytes(genesis),b=FrameBytes(owner);
    if(a.type!=1||a.sequence!=1||a.epoch||!detail::Zero(a.genesis)||!detail::Zero(a.previous)||!detail::Zero(a.owner)||a.scope!=s.scopeHash||a.lineage!=s.lineage||a.payload.size()!=230||
        b.type!=2||b.sequence!=2||b.epoch!=1||b.genesis!=a.hash||b.previous!=a.hash||b.scope!=a.scope||b.lineage!=a.lineage||detail::Zero(b.owner)||b.payload!=Bytes(b.owner.begin(),b.owner.end()))Refuse("post_c1_exact_genesis_owner_chain_required");
    Bytes scope;Put(scope,s.installation);for(const auto* pin:{&s.repository,&s.runtime,&s.journal,&s.lock})detail::PutPin(scope,*pin);if(!std::equal(scope.begin(),scope.end(),a.payload.begin()))Refuse("post_c1_genesis_scope_payload_refused");
    Reader selectors{a.payload};selectors.at=scope.size();const auto launch=selectors.Fixed<16>();if(detail::Zero(launch)||selectors.Number(2)!=2||selectors.Number(2)!=2)Refuse("post_c1_genesis_selectors_refused");const auto actor=selectors.Fixed<16>();if(detail::Zero(actor)||actor==launch||selectors.Number(2)!=3)Refuse("post_c1_genesis_selectors_refused");const auto stop=selectors.Fixed<16>();selectors.End();if(detail::Zero(stop)||stop==actor||stop==launch)Refuse("post_c1_genesis_selectors_refused");
    Bytes key;detail::PutU16(key,1);Put(key,a.scope);if(detail::Hash(key)!=a.key)Refuse("post_c1_genesis_key_refused");key.clear();detail::PutU16(key,2);Put(key,b.scope);Put(key,b.lineage);detail::PutU64(key,0);Put(key,b.payload);if(detail::Hash(key)!=b.key)Refuse("post_c1_owner_key_refused");
}
std::wstring ParentPath(const std::wstring& path){const auto at=path.find_last_of(L'\\');if(at==std::wstring::npos||at<49)Refuse("post_c1_parent_path_refused");return path.substr(0,at);}
// Historical seal parsing deliberately does not reopen or bless old source and
// build inputs as current. It proves the exact enrollment/closed-prefix binding.
ObjectPin ValidateEnrollment(const Specification& s,const Bytes& installation,const Bytes& policy,const Bytes& seal){
    Reader i{installation};if(i.Fixed<8>()!=std::array<unsigned char,8>{'O','W','N','L','I','N','S','2'}||i.Fixed<16>()!=s.installation||i.Fixed<16>()!=s.lineage)Refuse("post_c1_installation_binding_refused");
    for(const auto* pin:{&s.repository,&s.runtime,&s.lock,&s.journal})ExpectPin(i,*pin);i.End();
    Reader p{policy};if(p.Fixed<8>()!=std::array<unsigned char,8>{'O','W','N','L','P','O','L','2'})Refuse("post_c1_policy_header_refused");
    const auto epoch=p.Number(8);if(!epoch||p.Number(2)!=reviewed::kCombinedExecutionCapabilities||p.Number(1)!=1||p.Number(8)!=28800000||p.Number(8)!=60000)Refuse("post_c1_policy_shape_refused");
    Nonzero(p.Fixed<32>());if(p.Fixed<16>()!=s.lineage)Refuse("post_c1_policy_lineage_refused");for(wchar_t c:s.userSid)if(p.Number(2)!=static_cast<std::uint16_t>(c))Refuse("post_c1_policy_sid_refused");p.End();
    Reader r{seal};if(r.Fixed<8>()!=std::array<unsigned char,8>{'O','W','N','L','C','P','A','1'})Refuse("post_c1_seal_header_refused");const auto version=r.Number(2);
    if((version!=1&&version!=2)||r.Number(2)!=1||r.Number(4)!=seal.size()||r.Fixed<16>()!=s.installation||r.Fixed<16>()!=s.lineage)Refuse("post_c1_seal_static_refused");
    Nonzero(r.Fixed<32>());if(r.Fixed<32>()!=detail::Hash(policy)||r.Number(8)!=epoch)Refuse("post_c1_seal_policy_refused");Nonzero(r.Fixed<32>());Nonzero(r.Fixed<32>());
    for(const auto* pin:{&s.seal.file.pin,&s.repository,&s.runtime})ExpectPin(r,*pin);auto setup=r.Pin();setup.canonicalPath=ParentPath(s.seal.file.pin.canonicalPath);PinValid(setup);
    if(s.seal.file.pin.canonicalPath!=setup.canonicalPath+L"\\production-artifacts.seal"||ParentPath(setup.canonicalPath)!=ParentPath(s.runtime.canonicalPath)||r.Fixed<32>()!=SidHash(s.userSid))Refuse("post_c1_seal_namespace_or_sid_refused");
    for(const auto* pin:{&s.installationFile.file.pin,&s.policyFile.file.pin,&s.lock,&s.journal})ExpectPin(r,*pin);
    if(r.Fixed<32>()!=detail::Hash(installation)||r.Fixed<32>()!=detail::Hash(policy))Refuse("post_c1_seal_enrollment_hash_refused");
    for(unsigned table=0;table<2;++table){const auto count=r.Number(2);if(count<(table?10u:3u)||count>(table?768u:6u)||r.Number(2))Refuse("post_c1_seal_table_refused");std::uint64_t prior=0;
        for(std::uint64_t n=0;n<count;++n){const auto code=r.Number(2);if(code<=prior||r.Number(2)||(table==0&&(code>6||(n<3&&code!=n+1))))Refuse("post_c1_seal_table_order_refused");prior=code;(void)r.Pin();Nonzero(r.Fixed<32>());}}
    for(unsigned n=0;n<2;++n){(void)r.Pin();Nonzero(r.Fixed<32>());}Nonzero(r.Fixed<32>());
    if(version==2){Nonzero(r.Fixed<32>());Nonzero(r.Fixed<32>());(void)r.Pin();Nonzero(r.Fixed<32>());}
    if(r.at+32!=seal.size())Refuse("post_c1_seal_tail_refused");const Bytes preceding(seal.begin(),seal.begin()+static_cast<std::ptrdiff_t>(r.at));
    if(r.Fixed<32>()!=Domain(version==1?"lcs.production.artifact-record.v1":"lcs.production.artifact-record.v2",preceding))Refuse("post_c1_seal_integrity_refused");r.End();return setup;
}
struct History final {
    Specification spec;std::vector<Parent> parents;Held repository,runtime,fence,journal,seal,installation,policy,first,second,setup;ObjectPin setupPin;Bytes sealBytes,installationBytes,policyBytes,firstBytes,secondBytes;
    static std::unique_ptr<History> Open(const Specification& s,const reviewed::Profile& next,const ObjectPin& nextSetup,bool exclusive){
        ValidateSpec(s,next,nextSetup);auto h=std::make_unique<History>();h->spec=s;h->repository=Absolute(s.repository,true,h->parents);h->runtime=Absolute(s.runtime,true,h->parents);
        // No generic/shared lock witness is opened before this ORIGINAL fence.
        h->fence=Relative(h->runtime.Get(),L".initial-owned-fence.lock",false,FILE_READ_DATA,exclusive?0u:FILE_SHARE_READ);
        std::uint64_t length=0;if(!detail::SamePin(detail::ReadPin(h->fence.Get(),false,&length),s.lock)||length)Refuse("post_c1_original_empty_fence_required");
        h->journal=Relative(h->runtime.Get(),L"journal",true,FILE_LIST_DIRECTORY,FILE_SHARE_READ|FILE_SHARE_WRITE);
        if(!detail::SamePin(detail::ReadPin(h->journal.Get(),true),s.journal))Refuse("post_c1_original_journal_required");
        Inventory(h->runtime.Get(),exclusive?kRuntime:RuntimeWithIntent(),exclusive);Inventory(h->journal.Get(),kJournal);
        h->seal=Absolute(s.seal.file.pin,false,h->parents);h->installation=Relative(h->runtime.Get(),L".initial-owned-local.installation",false,FILE_READ_DATA,FILE_SHARE_READ);h->policy=Relative(h->runtime.Get(),L".initial-owned-local.policy",false,FILE_READ_DATA,FILE_SHARE_READ);
        h->first=Relative(h->journal.Get(),L"00000000000000000001.rec",false,FILE_READ_DATA,FILE_SHARE_READ);h->second=Relative(h->journal.Get(),L"00000000000000000002.rec",false,FILE_READ_DATA,FILE_SHARE_READ);
        h->sealBytes=ReadClosed(h->seal.Get(),s.seal,s.userSid);h->installationBytes=ReadClosed(h->installation.Get(),s.installationFile,s.userSid);h->policyBytes=ReadClosed(h->policy.Get(),s.policyFile,s.userSid);h->firstBytes=ReadClosed(h->first.Get(),s.records[0],s.userSid);h->secondBytes=ReadClosed(h->second.Get(),s.records[1],s.userSid);
        h->setupPin=ValidateEnrollment(s,h->installationBytes,h->policyBytes,h->sealBytes);h->setup=Absolute(h->setupPin,true,h->parents);ValidateFrames(s,h->firstBytes,h->secondBytes);h->Fresh(!exclusive);return h;
    }
    static std::set<std::wstring> RuntimeWithIntent(){auto names=kRuntime;names.insert(kIntentName);return names;}
    void Fresh(bool hasIntent)const{
        for(const auto& p:parents)if(!detail::SamePin(detail::ReadPin(p.handle.Get(),true),p.pin))Refuse("post_c1_original_parent_changed");
        if(!detail::SamePin(detail::ReadPin(repository.Get(),true),spec.repository))Refuse("post_c1_original_root_changed");CheckAcl(repository.Get(),spec.userSid,false,false);
        for(const auto& row:std::array<std::pair<void*,const ObjectPin*>,3>{{{runtime.Get(),&spec.runtime},{journal.Get(),&spec.journal},{setup.Get(),&setupPin}}}){
            if(!detail::SamePin(detail::ReadPin(row.first,true),*row.second))Refuse("post_c1_original_root_changed");OwnAcl(row.first,spec.userSid,true);}
        std::uint64_t size=0;if(!detail::SamePin(detail::ReadPin(fence.Get(),false,&size),spec.lock)||size)Refuse("post_c1_original_fence_changed");OwnAcl(fence.Get(),spec.userSid);
        if(ReadClosed(seal.Get(),spec.seal,spec.userSid)!=sealBytes||ReadClosed(installation.Get(),spec.installationFile,spec.userSid)!=installationBytes||ReadClosed(policy.Get(),spec.policyFile,spec.userSid)!=policyBytes||ReadClosed(first.Get(),spec.records[0],spec.userSid)!=firstBytes||ReadClosed(second.Get(),spec.records[1],spec.userSid)!=secondBytes)Refuse("post_c1_closed_history_changed");
        Inventory(runtime.Get(),hasIntent?RuntimeWithIntent():kRuntime,!hasIntent);Inventory(journal.Get(),kJournal);
    }
};
Bytes IntentBytes(const Specification& s,const reviewed::Profile& next,const ObjectPin& setup,const Digest& fixed,const Digest& code,const reviewed::File& creator,std::uint64_t birth,const Id& nonce){
    if(!birth||detail::Zero(nonce)||detail::Zero(creator.sha256)||detail::Zero(fixed)||detail::Zero(code))Refuse("post_c1_intent_creator_required");PinValid(creator.pin);
    Bytes bytes={'O','W','N','L','C','S','I','1'};detail::PutU16(bytes,1);detail::PutU16(bytes,1);detail::PutU32(bytes,static_cast<std::uint32_t>(kIntentBytes));
    Put(bytes,StableIntentKey(s));Put(bytes,s.specificationHash);Put(bytes,s.installation);Put(bytes,s.lineage);Put(bytes,s.scopeHash);Put(bytes,next.installation);Put(bytes,next.lineage);
    for(const auto* pin:{&next.repository,&next.runtime,&setup})detail::PutPin(bytes,*pin);Put(bytes,next.policyHash);Put(bytes,code);Put(bytes,fixed);Put(bytes,next.authorizationAudit);detail::PutPin(bytes,creator.pin);Put(bytes,creator.sha256);detail::PutU64(bytes,birth);Put(bytes,nonce);Put(bytes,SidHash(s.userSid));
    if(bytes.size()!=kIntentBytes-32)Refuse("post_c1_intent_width_refused");Put(bytes,Domain("lcs.production.closed-predecessor-intent.v1",bytes));return bytes;
}
void ValidateBinding(const Specification& s,const Binding& b){if(b.specificationHash!=s.specificationHash||b.key!=StableIntentKey(s)||detail::Zero(b.intentSha256)||b.intent.canonicalPath!=s.runtime.canonicalPath+L"\\"+kIntentName)Refuse("post_c1_actual_binding_refused");PinValid(b.intent);}
void IntentFresh(void* handle,const Specification& s,const Binding& b,const Bytes& expected){std::uint64_t size=0;if(!detail::SamePin(detail::ReadPin(handle,false,&size),b.intent)||size!=kIntentBytes||detail::ReadExact(handle,kIntentBytes)!=expected||detail::Hash(expected)!=b.intentSha256)Refuse("post_c1_original_intent_changed");OwnAcl(handle,s.userSid);}
} // namespace
std::vector<unsigned char> SpecificationBytes(const Specification& s){Bytes bytes;detail::PutU16(bytes,1);detail::PutU16(bytes,s.operatorKind);Put(bytes,s.installation);Put(bytes,s.lineage);Put(bytes,s.scopeHash);Put(bytes,s.operatorAuthorization);Text(bytes,s.userSid);for(const auto* pin:{&s.repository,&s.runtime,&s.lock,&s.journal})PathPin(bytes,*pin);for(const auto* file:{&s.seal,&s.installationFile,&s.policyFile,&s.records[0],&s.records[1]})File(bytes,*file);return bytes;}
Digest SpecificationHash(const Specification& s){return Domain("lcs.production.closed-predecessor-specification.v1",SpecificationBytes(s));}
Digest StableIntentKey(const Specification& s){Bytes bytes;detail::PutU16(bytes,1);Text(bytes,s.userSid);detail::PutPin(bytes,s.repository);detail::PutPin(bytes,s.runtime);Put(bytes,s.installation);Put(bytes,s.lineage);return Domain("lcs.production.closed-predecessor-successor-key.v1",bytes);}
std::vector<unsigned char> BindingBytes(const Binding& binding){Bytes bytes;Put(bytes,binding.specificationHash);Put(bytes,binding.key);detail::PutPin(bytes,binding.intent);Put(bytes,binding.intentSha256);if(bytes.size()!=kBindingBytes)Refuse("post_c1_binding_width_refused");return bytes;}
struct CreatorGrant::Data final {std::unique_ptr<History> history;Held image,intent;reviewed::File creator;Binding binding;Bytes bytes;std::uint64_t birth=0;Id nonce{};
    void Fresh()const{if(detail::ProcessBirth(GetCurrentProcess())!=birth||detail::ProcessSid(GetCurrentProcess())!=history->spec.userSid||detail::ProcessImage(GetCurrentProcess())!=creator.pin.canonicalPath||!detail::SamePin(detail::ReadPin(image.Get(),false),creator.pin)||detail::Hash(detail::ReadExact(image.Get(),134217728))!=creator.sha256)Refuse("post_c1_original_creator_changed");history->Fresh(true);IntentFresh(intent.Get(),history->spec,binding,bytes);}
};
CreatorGrant::CreatorGrant(std::unique_ptr<Data> data):data_(std::move(data)){}
CreatorGrant::~CreatorGrant()=default;
std::unique_ptr<CreatorGrant> CreatorGrant::Consume(const Specification& s,const reviewed::Profile& next,const ObjectPin& setup,const Digest& fixed,const Digest& code,void* originalImage,std::uint64_t birth,const Id& nonce,bool& durableEffect){
    auto data=std::make_unique<Data>();data->birth=birth;data->nonce=nonce;data->creator.pin=detail::ReadPin(originalImage,false);data->creator.sha256=detail::Hash(detail::ReadExact(originalImage,134217728));
    if(detail::ProcessBirth(GetCurrentProcess())!=birth||detail::ProcessImage(GetCurrentProcess())!=data->creator.pin.canonicalPath)Refuse("post_c1_same_creator_required");HANDLE copy=nullptr;
    if(!DuplicateHandle(GetCurrentProcess(),originalImage,GetCurrentProcess(),&copy,0,FALSE,DUPLICATE_SAME_ACCESS))Refuse("post_c1_creator_original_duplicate_refused",GetLastError());data->image=Held(copy);
    data->history=History::Open(s,next,setup,true);data->bytes=IntentBytes(s,next,setup,fixed,code,data->creator,birth,nonce);data->history->Fresh(false);
    // The very first effect consumes this old installation, even if no new
    // anchor is ever created. Existing/partial intent is never opened for write.
    data->intent=Relative(data->history->runtime.Get(),kIntentName,false,FILE_READ_DATA|FILE_WRITE_DATA,FILE_SHARE_READ,true,&durableEffect);
    try{std::uint64_t length=0;const auto pin=detail::ReadPin(data->intent.Get(),false,&length);if(length)Refuse("post_c1_created_intent_not_empty",0,true);OwnAcl(data->intent.Get(),s.userSid);DWORD written=0;
        if(!WriteFile(data->intent.Get(),data->bytes.data(),static_cast<DWORD>(data->bytes.size()),&written,nullptr)||written!=data->bytes.size()||!FlushFileBuffers(data->intent.Get()))Refuse("post_c1_intent_durable_write_unknown",GetLastError(),true);
        data->binding={s.specificationHash,StableIntentKey(s),pin,detail::Hash(data->bytes)};ValidateBinding(s,data->binding);data->Fresh();return std::unique_ptr<CreatorGrant>(new CreatorGrant(std::move(data)));
    }catch(detail::Failure failure){failure.unknown=true;throw failure;}
}
const Binding& CreatorGrant::ActualBinding()const{AssertFresh();return data_->binding;}
void CreatorGrant::AssertFresh()const{data_->Fresh();}
struct BindingWitness::Data final {std::unique_ptr<History> history;Held intent;Binding binding;Bytes bytes;void Fresh()const{history->Fresh(true);IntentFresh(intent.Get(),history->spec,binding,bytes);}};
BindingWitness::BindingWitness(std::unique_ptr<Data> data):data_(std::move(data)){}
BindingWitness::~BindingWitness()=default;
std::unique_ptr<BindingWitness> BindingWitness::Open(const Specification& s,const Binding& b,const reviewed::Profile& next,const ObjectPin& setup,const Digest& fixed,const Digest& code,const reviewed::File& creator){
    ValidateBinding(s,b);auto data=std::make_unique<Data>();data->history=History::Open(s,next,setup,false);data->binding=b;data->intent=Relative(data->history->runtime.Get(),kIntentName,false,FILE_READ_DATA,FILE_SHARE_READ);const auto raw=detail::ReadExact(data->intent.Get(),kIntentBytes);
    Reader r{raw};Header(r,"OWNLCSI1",1,kIntentBytes);r.at=496;const auto birth=r.Number(8);const auto nonce=r.Fixed<16>();data->bytes=IntentBytes(s,next,setup,fixed,code,creator,birth,nonce);
    if(raw!=data->bytes)Refuse("post_c1_historical_intent_binding_refused");data->Fresh();return std::unique_ptr<BindingWitness>(new BindingWitness(std::move(data)));
}
bool BindingWitness::Fresh()const noexcept{try{data_->Fresh();return true;}catch(...){return false;}}
} // namespace local_session::post_c1
