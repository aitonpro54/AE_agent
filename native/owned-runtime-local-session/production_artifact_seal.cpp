#include "production_artifact_seal.h"
#include <windows.h>
#include <winternl.h>
#include <objbase.h>
#include <algorithm>
#include <cstring>
#include <limits>
#include <set>
#include "production_vendor_build_inputs.h"
#if defined(AE_AGENT_PHASE_TRUSTED_READ_SETUP)
#if AE_AGENT_PHASE_TRUSTED_READ_SETUP != 1 || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
#error "Original pre-prepare setup is a separate exact target, never runtime enrollment."
#endif
#include "local_session_installation_pins.h"
#else
#include "local_session_production_artifact_pins.h"
#endif

namespace local_session::production {
namespace {
using Bytes=std::vector<unsigned char>;using detail::Held;using detail::Refuse;
constexpr std::size_t kRecordMax=16384,kArtifactMax=6,kDependencyMax=160;
constexpr std::size_t kBuildManifestMax=131072,kBuildInputMax=1024,kGeneratedHeaderMax=4194304;
template<class T> void Put(Bytes& b,const T& a){b.insert(b.end(),a.begin(),a.end());}
void U32(Bytes& b,std::uint32_t n){detail::PutU16(b,static_cast<std::uint16_t>(n));detail::PutU16(b,static_cast<std::uint16_t>(n>>16));}
Digest Domain(const char* domain,const Bytes& bytes){Bytes input(domain,domain+std::strlen(domain));input.push_back(0);Put(input,bytes);return detail::Hash(input);}
Digest SidHash(const std::wstring& sid){Bytes b;for(wchar_t c:sid)detail::PutU16(b,static_cast<std::uint16_t>(c));return Domain("lcs.production.sid.v1",b);}
struct Reader final {const Bytes& b;std::size_t at=0;
    void Size(std::size_t n){if(at>b.size()||n>b.size()-at)Refuse("production_seal_record_truncated");}
    std::uint64_t Number(std::size_t n){Size(n);std::uint64_t value=0;for(std::size_t i=0;i<n;++i)value|=static_cast<std::uint64_t>(b[at++])<<(8*i);return value;}
    template<std::size_t N> std::array<unsigned char,N> Fixed(){Size(N);std::array<unsigned char,N> value{};std::copy_n(b.data()+at,N,value.begin());at+=N;return value;}
    ObjectPin Pin(const std::wstring& path){ObjectPin pin;pin.volumeGuid=Fixed<16>();pin.serial=Number(8);pin.fileId=Fixed<16>();pin.canonicalPath=path;if(detail::Zero(pin.volumeGuid)||detail::Zero(pin.fileId)||!pin.serial)Refuse("production_seal_empty_pin");return pin;}
};
struct Witness final {Held handle;ObjectPin pin;bool directory;};
// Every capture validates its expected physical/canonical binding. Only a
// duplicate read-only owner is released; all unique original parents stay held.
std::size_t RetainParent(Held incoming,const ObjectPin& captured,std::vector<Witness>& parents){
    if(!incoming.Valid())Refuse("production_parent_original_required");const auto actual=detail::ReadPin(incoming.Get(),true);
    if(actual.canonicalPath!=captured.canonicalPath||!detail::SamePin(actual,captured))Refuse("production_parent_capture_changed");
    for(std::size_t i=0;i<parents.size();++i){const auto& retained=parents[i];if(CompareStringOrdinal(retained.pin.canonicalPath.c_str(),static_cast<int>(retained.pin.canonicalPath.size()),actual.canonicalPath.c_str(),static_cast<int>(actual.canonicalPath.size()),TRUE)!=CSTR_EQUAL)continue;
        const auto current=detail::ReadPin(retained.handle.Get(),true);
        if(!retained.directory||retained.pin.canonicalPath!=actual.canonicalPath||current.canonicalPath!=actual.canonicalPath||
            !detail::SamePin(retained.pin,actual)||!detail::SamePin(current,actual))Refuse("production_parent_original_binding_changed");
        if(!CloseHandle(static_cast<HANDLE>(incoming.Get())))Refuse("production_parent_duplicate_close_unknown",GetLastError(),true);
        (void)incoming.Take();return i;
    }
    parents.push_back({std::move(incoming),actual,true});return parents.size()-1;
}
ObjectPin VendorPin(void* handle,const vendor::Definition& fixed){if(GetFileType(handle)!=FILE_TYPE_DISK)Refuse("production_vendor_not_disk");
    FILE_ATTRIBUTE_TAG_INFO attributes{};FILE_STANDARD_INFO standard{};FILE_ID_INFO identity{};
    if(!GetFileInformationByHandleEx(handle,FileAttributeTagInfo,&attributes,sizeof(attributes))||!GetFileInformationByHandleEx(handle,FileStandardInfo,&standard,sizeof(standard))||!GetFileInformationByHandleEx(handle,FileIdInfo,&identity,sizeof(identity)))Refuse("production_vendor_identity_query_failed",GetLastError());
    constexpr DWORD forbidden=FILE_ATTRIBUTE_REPARSE_POINT|FILE_ATTRIBUTE_OFFLINE|FILE_ATTRIBUTE_RECALL_ON_OPEN|FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS|FILE_ATTRIBUTE_DIRECTORY;
    DWORD flags=0;if(!GetHandleInformation(handle,&flags)||(flags&HANDLE_FLAG_INHERIT)||(attributes.FileAttributes&forbidden)||standard.Directory||standard.DeletePending||standard.NumberOfLinks!=fixed.links||standard.EndOfFile.QuadPart!=fixed.bytes)Refuse("production_vendor_shape_refused");
    wchar_t filesystem[32]{};if(!GetVolumeInformationByHandleW(handle,nullptr,0,nullptr,nullptr,nullptr,filesystem,32)||std::wstring(filesystem)!=L"NTFS")Refuse("production_vendor_volume_refused",GetLastError());
    wchar_t canonical[32761]{};const DWORD count=GetFinalPathNameByHandleW(handle,canonical,32761,FILE_NAME_NORMALIZED|VOLUME_NAME_GUID);
    if(!count||count>=32761||std::wstring(canonical,count)!=fixed.path)Refuse("production_vendor_canonical_refused",GetLastError());
    ObjectPin pin;pin.canonicalPath=fixed.path;GUID guid{};if(CLSIDFromString(pin.canonicalPath.substr(10,38).c_str(),&guid)!=S_OK)Refuse("production_vendor_guid_refused");
    std::memcpy(pin.volumeGuid.data(),&guid,16);pin.serial=identity.VolumeSerialNumber;std::memcpy(pin.fileId.data(),identity.FileId.Identifier,16);Bytes serialized;detail::PutPin(serialized,pin);
    if(serialized!=Bytes(fixed.pin.begin(),fixed.pin.end()))Refuse("production_vendor_physical_pin_refused");return pin;}
Bytes VendorReadBytes(void* handle,const vendor::Definition& fixed){const auto before=VendorPin(handle,fixed);LARGE_INTEGER start{};if(!SetFilePointerEx(handle,start,nullptr,FILE_BEGIN))Refuse("production_vendor_read_seek_failed",GetLastError());
    Bytes bytes(fixed.bytes);DWORD count=0;if(!ReadFile(handle,bytes.data(),fixed.bytes,&count,nullptr)||count!=fixed.bytes||!detail::SamePin(VendorPin(handle,fixed),before)||detail::Hash(bytes)!=fixed.hash)Refuse("production_vendor_read_changed",GetLastError());return bytes;}
Held VendorRelative(void* parent,const std::wstring& component){
    // Same-parent final component only. Generic Relative retains links==1.
    using NtCreate=NTSTATUS(NTAPI*)(PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES,PIO_STATUS_BLOCK,PLARGE_INTEGER,ULONG,ULONG,ULONG,ULONG,PVOID,ULONG);
    const auto address=GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtCreateFile");NtCreate create=nullptr;std::memcpy(&create,&address,sizeof(create));if(!create)Refuse("production_vendor_native_open_unavailable");
    if(component.empty()||component.find_first_of(L"\\/:")!=std::wstring::npos||component.size()>255)Refuse("production_vendor_component_refused");
    UNICODE_STRING name{};name.Buffer=const_cast<PWSTR>(component.c_str());name.Length=static_cast<USHORT>(component.size()*sizeof(wchar_t));name.MaximumLength=name.Length;
    OBJECT_ATTRIBUTES object{};object.Length=sizeof(object);object.RootDirectory=parent;object.ObjectName=&name;object.Attributes=0x40;IO_STATUS_BLOCK io{};HANDLE actual=nullptr;
    if(create(&actual,FILE_READ_DATA|FILE_READ_ATTRIBUTES|SYNCHRONIZE,&object,&io,nullptr,FILE_ATTRIBUTE_NORMAL,FILE_SHARE_READ,1u,0x00200000|0x00000020|0x40u,nullptr,0)<0)Refuse("production_vendor_relative_open_refused");
    Held original(actual);if(!original.Valid()||!SetHandleInformation(actual,HANDLE_FLAG_INHERIT,0))Refuse("production_vendor_original_handle_refused",GetLastError());return original;}
struct VendorWitness final {Held handle;ObjectPin pin;const vendor::Definition* fixed;const std::vector<Witness>* parentOwners;std::size_t parentIndex;std::wstring component;
    void Fresh()const{if(!fixed||vendor::Find(fixed->selector)!=fixed||!parentOwners||parentIndex>=parentOwners->size())Refuse("production_vendor_parent_owner_refused");
        const auto& parent=(*parentOwners)[parentIndex];const std::wstring path=fixed->path;const auto slash=path.find_last_of(L'\\');
        if(slash==std::wstring::npos||!parent.directory||parent.pin.canonicalPath!=path.substr(0,slash)||component!=path.substr(slash+1)||
            !detail::SamePin(detail::ReadPin(parent.handle.Get(),true),parent.pin))Refuse("production_vendor_parent_binding_changed");
        if(!detail::SamePin(VendorPin(handle.Get(),*fixed),pin))Refuse("production_vendor_held_pin_changed");
        (void)VendorReadBytes(handle.Get(),*fixed);auto named=VendorRelative(parent.handle.Get(),component);if(!detail::SamePin(VendorPin(named.Get(),*fixed),pin))Refuse("production_vendor_named_pin_changed");(void)VendorReadBytes(named.Get(),*fixed);}};
void VendorFresh(const std::vector<VendorWitness>& held){if(held.size()>3)Refuse("production_vendor_witness_bound");std::set<std::uint16_t> selectors;for(const auto& witness:held){if(!witness.fixed||!selectors.insert(witness.fixed->selector).second)Refuse("production_vendor_duplicate_witness");witness.Fresh();}}
VendorWitness OpenVendor(const BuildInput& row,std::vector<Witness>& parents){const auto* fixed=vendor::Find(row.code);Bytes expected;detail::PutPin(expected,row.file.pin);
    std::array<unsigned char,40> provided{};if(expected.size()!=provided.size())Refuse("production_vendor_pin_length_refused");std::copy(expected.begin(),expected.end(),provided.begin());
    if(!fixed||!vendor::ExactRow(*fixed,row.code,row.file.pin.canonicalPath,provided,row.file.sha256,fixed->bytes,fixed->links))Refuse("production_vendor_compiled_row_refused");
    const std::wstring path=fixed->path;Held volume(CreateFileW(path.substr(0,49).c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!volume.Valid())Refuse("production_vendor_volume_open_failed",GetLastError());const auto pin=detail::ReadPin(volume.Get(),true);std::size_t parent=RetainParent(std::move(volume),pin,parents),at=49;
    while(true){const auto end=path.find(L'\\',at);if(end==std::wstring::npos)break;auto ancestor=detail::Relative(parents[parent].handle.Get(),path.substr(at,end-at),true);const auto identity=detail::ReadPin(ancestor.Get(),true);parent=RetainParent(std::move(ancestor),identity,parents);at=end+1;}
    const auto component=path.substr(at);auto original=VendorRelative(parents[parent].handle.Get(),component);const auto physical=VendorPin(original.Get(),*fixed);(void)VendorReadBytes(original.Get(),*fixed);
    return {std::move(original),physical,fixed,&parents,parent,component};}
std::wstring SelectorPath(const reviewed::Profile& p,const std::vector<std::wstring>& components){if(components.empty()||components.size()>32)Refuse("production_selector_invalid");std::wstring result=p.repository.canonicalPath;
    for(const auto& c:components){if(c.empty()||c==L"."||c==L".."||c.find_first_of(L"\\/:")!=std::wstring::npos||c.find(L'\0')!=std::wstring::npos)Refuse("production_selector_invalid");result+=L"\\"+c;}return result;}
Held Root(const reviewed::Profile& p,std::vector<Witness>& parents){if(p.repositoryAncestors.size()!=p.repositoryComponents.size()+1)Refuse("production_repository_ancestors_invalid");
    Held volume(CreateFileW(p.canonicalVolumeAnchor.c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!volume.Valid()||!detail::SamePin(detail::ReadPin(volume.Get(),true),p.repositoryAncestors[0]))Refuse("production_original_volume_refused");std::size_t parent=RetainParent(std::move(volume),p.repositoryAncestors[0],parents);
    for(std::size_t i=0;i<p.repositoryComponents.size();++i){auto next=detail::Relative(parents[parent].handle.Get(),p.repositoryComponents[i],true);if(!detail::SamePin(detail::ReadPin(next.Get(),true),p.repositoryAncestors[i+1]))Refuse("production_original_repository_refused");parent=RetainParent(std::move(next),p.repositoryAncestors[i+1],parents);}
    if(!detail::SamePin(parents[parent].pin,p.repository))Refuse("production_original_repository_refused");HANDLE duplicated=nullptr;
    if(!DuplicateHandle(GetCurrentProcess(),parents[parent].handle.Get(),GetCurrentProcess(),&duplicated,0,FALSE,DUPLICATE_SAME_ACCESS))Refuse("production_repository_duplicate_failed",GetLastError());return Held(duplicated);}
Held Open(void* root,const std::vector<std::wstring>& components,bool directory,std::vector<Witness>& parents,bool create=false){if(components.empty()||components.size()>32)Refuse("production_selector_invalid");void* parent=root;
    for(std::size_t i=0;i+1<components.size();++i){auto next=detail::Relative(parent,components[i],true);const auto pin=detail::ReadPin(next.Get(),true);parent=parents[RetainParent(std::move(next),pin,parents)].handle.Get();}
    return detail::Relative(parent,components.back(),directory,create,create,false,!directory&&!create);}
Held Absolute(const ObjectPin& expected,bool directory,std::vector<Witness>& parents,bool requirePin=true){const auto& path=expected.canonicalPath;if(path.size()<50||path.substr(0,11)!=L"\\\\?\\Volume{"||path[48]!=L'\\')Refuse("production_canonical_witness_required");
    Held volume(CreateFileW(path.substr(0,49).c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));if(!volume.Valid())Refuse("production_dependency_volume_refused",GetLastError());auto pin=detail::ReadPin(volume.Get(),true);std::size_t at=49;void* parent=parents[RetainParent(std::move(volume),pin,parents)].handle.Get();Held actual;
    while(at<path.size()){const auto end=path.find(L'\\',at);const bool childDirectory=end!=std::wstring::npos||directory;auto item=detail::Relative(parent,path.substr(at,end==std::wstring::npos?path.size()-at:end-at),childDirectory,false,false,false,!childDirectory);
        if(end==std::wstring::npos){actual=std::move(item);break;}const auto identity=detail::ReadPin(item.Get(),true);parent=parents[RetainParent(std::move(item),identity,parents)].handle.Get();at=end+1;}
    if(!actual.Valid())Refuse("production_original_absolute_pin_refused");const auto observed=detail::ReadPin(actual.Get(),directory);
    if(observed.canonicalPath!=path||(requirePin&&!detail::SamePin(observed,expected)))Refuse("production_original_absolute_pin_refused");return actual;}
void HeldFresh(const std::vector<Witness>& held){for(const auto& w:held)if(!detail::SamePin(detail::ReadPin(w.handle.Get(),w.directory),w.pin))Refuse("production_original_witness_changed");}
void Validate(const StaticDefinition& d,bool prepared){const auto& p=d.enrollment;
    if(detail::Zero(d.fixedProfileHash)||detail::Zero(d.staticCodeHash)||detail::Zero(d.transportProfileHash)||detail::Zero(p.installation)||detail::Zero(p.lineage)||detail::Zero(p.policyHash)||p.sourceSetHash!=d.staticCodeHash||p.userSid!=detail::ProcessSid(GetCurrentProcess())||d.artifacts.size()<3||d.artifacts.size()>kArtifactMax||d.dependencies.size()<10||d.dependencies.size()>kDependencyMax)Refuse("production_static_profile_refused");
    std::uint16_t prior=0;for(const auto& item:d.artifacts){if(item.code<=prior||item.code>6)Refuse("production_artifact_roles_refused");prior=item.code;SelectorPath(p,item.components);}if(d.artifacts[0].code!=1||d.artifacts[1].code!=2||d.artifacts[2].code!=3)Refuse("production_mandatory_artifact_roles_missing");
    prior=0;bool controller=false,daemon=false;std::size_t panels=0;for(const auto& item:d.dependencies){if(item.code<=prior||detail::Zero(item.file.sha256)||detail::Zero(item.file.pin.fileId))Refuse("production_dependency_set_refused");prior=item.code;
        if(item.code==1){controller=true;if(item.file.sha256!=p.node.sha256||!detail::SamePin(item.file.pin,p.node.pin))Refuse("production_controller_node_refused");}
        else if(item.code==2){daemon=true;if(item.file.sha256!=p.node.sha256||!detail::SamePin(item.file.pin,p.node.pin))Refuse("production_daemon_node_refused");}
        else if(item.code>=1024&&item.code<1032)++panels;
        else if(item.code<259||item.code>=384)Refuse("production_unknown_dependency_selector");}
    if(!controller||!daemon||panels!=8)Refuse("production_dependency_closure_incomplete");
    if(d.automationCredential.sha256==d.panelCredential.sha256||detail::Zero(d.automationCredential.sha256)||detail::Zero(d.panelCredential.sha256))Refuse("production_credentials_not_separate");
    if(d.dependencies.size()+3>kDependencyMax||d.buildInputs.size()<6||d.buildInputs.size()>kBuildInputMax||!detail::Zero(d.buildInputManifest.sha256))Refuse("production_build_input_definition_refused");
    if(!prepared&&detail::Zero(d.buildInputManifest.pin.fileId))Refuse("production_build_manifest_physical_definition_refused");
    const bool host=std::any_of(d.artifacts.begin(),d.artifacts.end(),[](const Selector& item){return item.code==4;});prior=0;std::set<std::wstring> paths;
    for(std::size_t i=0;i<d.buildInputs.size();++i){const auto& item=d.buildInputs[i];const auto mandatory=host?7u:6u;
        if(item.code<=prior||(i<mandatory?item.code!=i+1:item.code<16)||!paths.insert(item.file.pin.canonicalPath).second)Refuse("production_build_input_selector_set_refused");prior=item.code;
        if((!prepared||item.code>=4)&&(detail::Zero(item.file.pin.fileId)||!item.file.pin.serial||detail::Zero(item.file.pin.volumeGuid)))Refuse("production_build_input_physical_definition_refused");
        // The single normalized field and serialized M hashes never appear
        // as expected raw content inside their own upstream definition.
        if(item.code<=3&&!detail::Zero(item.file.sha256))Refuse("production_build_input_self_hash_refused");
        if(item.file.pin.canonicalPath==d.buildInputManifest.pin.canonicalPath)Refuse("production_manifest_upstream_cycle_refused");
        if(item.code<=3)for(const auto& dependency:d.dependencies)if(dependency.file.pin.canonicalPath==item.file.pin.canonicalPath)Refuse("production_generated_static_exclusion_refused");
    }
}
void Header(Bytes& b,const char* magic,std::uint16_t version,std::uint16_t kind,std::uint32_t length){b.assign(magic,magic+8);detail::PutU16(b,version);detail::PutU16(b,kind);U32(b,length);}
struct NormalizedHeader final {Digest logical{},ownField{};};
NormalizedHeader NormalizeHeader(const Bytes& raw){
    constexpr char marker[]="// LCS_GENERATED_BUILD_INPUTS_SHA256_V1\n";
    constexpr char declaration[]="inline constexpr char kExpectedGeneratedBuildInputsHashHex[65] = \"";
    if(raw.empty()||raw.size()>kGeneratedHeaderMax||std::find(raw.begin(),raw.end(),0)!=raw.end()||std::find(raw.begin(),raw.end(),'\r')!=raw.end()||
        (raw.size()>=3&&raw[0]==0xef&&raw[1]==0xbb&&raw[2]==0xbf))Refuse("production_generated_header_encoding_refused");
    const std::string text(raw.begin(),raw.end());const auto markerAt=text.find(marker),declarationAt=text.find(declaration);
    if(markerAt==std::string::npos||declarationAt!=markerAt+sizeof(marker)-1||
        (markerAt&&text[markerAt-1]!='\n')||text.find(marker,markerAt+1)!=std::string::npos||
        text.find(declaration,declarationAt+1)!=std::string::npos)Refuse("production_generated_header_single_field_refused");
    const auto fieldAt=declarationAt+sizeof(declaration)-1;
    if(fieldAt+67>text.size()||text.compare(fieldAt+64,3,"\";\n")!=0)Refuse("production_generated_header_field_width_refused");
    NormalizedHeader result;for(std::size_t i=0;i<32;++i){unsigned byte=0;for(std::size_t j=0;j<2;++j){const char c=text[fieldAt+i*2+j];
        const unsigned digit=c>='0'&&c<='9'?static_cast<unsigned>(c-'0'):c>='a'&&c<='f'?static_cast<unsigned>(c-'a'+10):16u;
        if(digit>15)Refuse("production_generated_header_lowercase_hex_refused");byte=(byte<<4)|digit;}result.ownField[i]=static_cast<unsigned char>(byte);}
    Bytes logical=raw;std::fill_n(logical.begin()+static_cast<std::ptrdiff_t>(fieldAt),64,static_cast<unsigned char>(0));
    Bytes input;U32(input,static_cast<std::uint32_t>(raw.size()));Put(input,logical);
    result.logical=Domain("lcs.production.generated-header-normalized.v1",input);return result;
}
struct BuildObservation final {Bytes manifest;Digest generated{};std::vector<Dependency> rawMetadata;};
BuildObservation ReconstructBuildInputs(const StaticDefinition& d,const ObjectPin& anchor,bool setup,
    std::vector<Witness>& parents,std::vector<Witness>& files,std::vector<VendorWitness>& vendors){
    BuildObservation result;const auto size=124+76*d.buildInputs.size();if(size>kBuildManifestMax)Refuse("production_build_input_length_refused");
    Header(result.manifest,"OWNLBI01",1,1,static_cast<std::uint32_t>(size));Put(result.manifest,d.fixedProfileHash);Put(result.manifest,d.staticCodeHash);detail::PutPin(result.manifest,anchor);
    detail::PutU16(result.manifest,static_cast<std::uint16_t>(d.buildInputs.size()));detail::PutU16(result.manifest,0);Digest ownField{};
    std::set<std::wstring> identities;
    for(const auto& expected:d.buildInputs){const auto* fixedVendor=vendor::Find(expected.code);VendorWitness special{};Held original;ObjectPin pin;Bytes raw;
        if(fixedVendor){special=OpenVendor(expected,parents);pin=special.pin;raw=VendorReadBytes(special.handle.Get(),*fixedVendor);}
        else{original=Absolute(expected.file.pin,false,parents,!setup||expected.code>=4);pin=detail::ReadPin(original.Get(),false);raw=detail::ReadExact(original.Get(),expected.code==1?kGeneratedHeaderMax:134217728);}
        if(raw.empty())Refuse("production_build_input_empty_refused");
        // Paths already have unique selectors. Physical aliases also refuse;
        // replacing a generated identity cannot be hidden behind a second name.
        Bytes physical;detail::PutPin(physical,pin);const std::wstring identity(physical.begin(),physical.end());if(!identities.insert(identity).second)Refuse("production_build_input_physical_alias_refused");
        const auto rawHash=detail::Hash(raw);Digest digest=rawHash;if(expected.code==1){const auto header=NormalizeHeader(raw);digest=header.logical;ownField=header.ownField;}
        if(expected.code>=4&&!detail::Zero(expected.file.sha256)&&rawHash!=expected.file.sha256)Refuse("production_build_input_expected_bytes_refused");
        detail::PutU16(result.manifest,expected.code);detail::PutU16(result.manifest,0);detail::PutPin(result.manifest,pin);Put(result.manifest,digest);
        if(expected.code<=3){reviewed::File metadata{expected.file.components,pin,rawHash};result.rawMetadata.push_back({static_cast<std::uint16_t>(255+expected.code),std::move(metadata)});}
        if(fixedVendor)vendors.push_back(std::move(special));else files.push_back({std::move(original),pin,false});
    }
    if(result.manifest.size()!=size||result.rawMetadata.size()!=3)Refuse("production_build_input_internal_length_refused");
    result.generated=Domain("lcs.production.generated-build-inputs.logical.v1",result.manifest);
    if(detail::Zero(result.generated)||ownField!=result.generated)Refuse("production_generated_header_own_commitment_refused");HeldFresh(parents);HeldFresh(files);VendorFresh(vendors);return result;
}
void CheckBuildManifest(const Bytes& bytes,const StaticDefinition& d,const ObjectPin& anchor,const BuildObservation& actual){
    if(bytes.size()<124||bytes.size()>kBuildManifestMax)Refuse("production_build_input_manifest_length_refused");Reader reader{bytes};const std::array<unsigned char,8> magic={'O','W','N','L','B','I','0','1'};
    if(reader.Fixed<8>()!=magic||reader.Number(2)!=1||reader.Number(2)!=1||reader.Number(4)!=bytes.size()||reader.Fixed<32>()!=d.fixedProfileHash||
        reader.Fixed<32>()!=d.staticCodeHash||!detail::SamePin(reader.Pin(anchor.canonicalPath),anchor)||reader.Number(2)!=d.buildInputs.size()||reader.Number(2))Refuse("production_build_input_static_binding_refused");
    if(bytes.size()!=124+76*d.buildInputs.size())Refuse("production_build_input_exact_count_refused");
    for(const auto& expected:d.buildInputs){if(reader.Number(2)!=expected.code||reader.Number(2))Refuse("production_build_input_selector_order_refused");
        (void)reader.Pin(expected.file.pin.canonicalPath);(void)reader.Fixed<32>();}
    if(reader.at!=bytes.size()||bytes!=actual.manifest)Refuse("production_build_input_original_reconstruction_refused");
}
std::vector<Dependency> RawDependencies(const StaticDefinition& d,const BuildObservation& build){auto result=d.dependencies;result.insert(result.end(),build.rawMetadata.begin(),build.rawMetadata.end());
    std::sort(result.begin(),result.end(),[](const Dependency& a,const Dependency& b){return a.code<b.code;});return result;}
#if defined(AE_AGENT_PHASE_TRUSTED_READ_SETUP)
void WriteNew(Held& file,const Bytes& bytes){std::uint64_t length=0;const auto pin=detail::ReadPin(file.Get(),false,&length);if(length||bytes.empty()||bytes.size()>kRecordMax)Refuse("production_anchor_not_original_empty",0,true);DWORD count=0;
    if(!WriteFile(file.Get(),bytes.data(),static_cast<DWORD>(bytes.size()),&count,nullptr)||count!=bytes.size()||!FlushFileBuffers(file.Get())||!detail::SamePin(detail::ReadPin(file.Get(),false),pin)||detail::ReadExact(file.Get(),kRecordMax)!=bytes)Refuse("production_seal_write_unknown",GetLastError(),true);}
Bytes ReadOwnedStage(HANDLE input,std::uint64_t deadline){for(;;){DWORD available=0;if(!PeekNamedPipe(input,nullptr,0,nullptr,&available,nullptr)||available>80)Refuse("production_setup_stdin_unknown",GetLastError(),true);if(available==80)break;if(GetTickCount64()>=deadline)Refuse("production_setup_stage_timeout",WAIT_TIMEOUT,true);Sleep(5);}
    Bytes bytes(80);DWORD count=0;if(!ReadFile(input,bytes.data(),80,&count,nullptr)||count!=80)Refuse("production_setup_stage_read_unknown",GetLastError(),true);return bytes;}
void CheckStage(const Bytes& b,const char* magic,std::uint16_t kind,const Id& nonce,std::uint64_t birth,const Digest& hash){Reader r{b};const std::array<unsigned char,8> wanted={static_cast<unsigned char>(magic[0]),static_cast<unsigned char>(magic[1]),static_cast<unsigned char>(magic[2]),static_cast<unsigned char>(magic[3]),static_cast<unsigned char>(magic[4]),static_cast<unsigned char>(magic[5]),static_cast<unsigned char>(magic[6]),static_cast<unsigned char>(magic[7])};
    if(r.Fixed<8>()!=wanted||r.Number(2)!=1||r.Number(2)!=kind||r.Number(4)!=80||r.Fixed<16>()!=nonce||r.Number(8)!=birth||r.Fixed<32>()!=hash||r.Number(8)!=0)Refuse("production_setup_stage_binding_unknown",0,true);}
void Send(HANDLE output,const Bytes& bytes){DWORD count=0;if(bytes.size()>16384||!WriteFile(output,bytes.data(),static_cast<DWORD>(bytes.size()),&count,nullptr)||count!=bytes.size())Refuse("production_setup_send_unknown",GetLastError(),true);}
#endif
}
#if !defined(AE_AGENT_PHASE_TRUSTED_READ_SETUP)
const Definition& EmbeddedDefinition(){return local_session_production_reviewed::kDefinition;}
struct OriginalSealWitness::Data final {
    reviewed::Profile resolved;std::vector<Witness> parents,files;std::vector<VendorWitness> vendors;Held root,anchor;ObjectPin originalAnchor;Digest recordHash{};
    std::vector<Artifact> artifacts;Bytes record;
    bool Fresh()const{try{HeldFresh(parents);HeldFresh(files);VendorFresh(vendors);return detail::SamePin(detail::ReadPin(anchor.Get(),false),originalAnchor)&&detail::ReadExact(anchor.Get(),kRecordMax)==record;}catch(...){return false;}}
};
OriginalSealWitness::OriginalSealWitness(std::unique_ptr<Data> data):data_(std::move(data)){}
OriginalSealWitness::~OriginalSealWitness()=default;
bool OriginalSealWitness::Fresh()const noexcept{return data_->Fresh();}
const reviewed::Profile& OriginalSealWitness::ResolvedEnrollment()const noexcept{return data_->resolved;}
const Digest& OriginalSealWitness::RecordHash()const noexcept{return data_->recordHash;}
const reviewed::File& OriginalSealWitness::ArtifactFile(ArtifactRole role)const{for(const auto& artifact:data_->artifacts)if(artifact.role==static_cast<std::uint16_t>(role))return artifact.file;Refuse("production_exact_artifact_role_missing");}
std::shared_ptr<OriginalSealWitness> OriginalSealWitness::OpenFixed(Result& result){try{
    const auto& definition=EmbeddedDefinition();Validate(definition,false);auto data=std::make_unique<Data>();data->resolved=definition.enrollment;data->root=Root(data->resolved,data->parents);
    data->anchor=Open(data->root.Get(),definition.anchorComponents,false,data->parents);data->originalAnchor=detail::ReadPin(data->anchor.Get(),false);
    constexpr auto compiledGenerated=DecodeGeneratedBuildInputsHash(local_session_production_reviewed::kExpectedGeneratedBuildInputsHashHex);
    if(detail::Zero(compiledGenerated)||definition.generatedBuildInputsHash!=compiledGenerated||!detail::SamePin(data->originalAnchor,definition.anchor))Refuse("production_original_anchor_or_compiled_build_refused");
    const auto build=ReconstructBuildInputs(definition,data->originalAnchor,false,data->parents,data->files,data->vendors);if(build.generated!=compiledGenerated)Refuse("production_compiled_build_input_commitment_refused");
    auto manifest=Absolute(definition.buildInputManifest.pin,false,data->parents);CheckBuildManifest(detail::ReadExact(manifest.Get(),kBuildManifestMax),definition,data->originalAnchor,build);
    data->files.push_back({std::move(manifest),definition.buildInputManifest.pin,false});const auto dependencies=RawDependencies(definition,build);
    data->record=detail::ReadExact(data->anchor.Get(),kRecordMax);Reader r{data->record};
    const std::array<unsigned char,8> magic={'O','W','N','L','C','P','A','1'};
    if(r.Fixed<8>()!=magic||r.Number(2)!=1||r.Number(2)!=1||r.Number(4)!=data->record.size())Refuse("production_artifact_record_header_refused");
    if(r.Fixed<16>()!=data->resolved.installation||r.Fixed<16>()!=data->resolved.lineage||r.Fixed<32>()!=definition.fixedProfileHash||r.Fixed<32>()!=data->resolved.policyHash||r.Number(8)!=data->resolved.policyEpoch||r.Fixed<32>()!=definition.staticCodeHash||r.Fixed<32>()!=definition.generatedBuildInputsHash)Refuse("production_artifact_static_binding_refused");
    const std::array<const ObjectPin*,4> originalRoots={&definition.anchor,&data->resolved.repository,&data->resolved.runtime,&definition.setupNamespace};
    for(const auto* pin:originalRoots)if(!detail::SamePin(r.Pin(pin->canonicalPath),*pin))Refuse("production_artifact_original_root_refused");
    if(r.Fixed<32>()!=SidHash(data->resolved.userSid))Refuse("production_artifact_sid_refused");
    data->resolved.installationFile=r.Pin(data->resolved.runtime.canonicalPath+L"\\.initial-owned-local.installation");data->resolved.policyFile=r.Pin(data->resolved.runtime.canonicalPath+L"\\.initial-owned-local.policy");data->resolved.lockFile=r.Pin(data->resolved.runtime.canonicalPath+L"\\.initial-owned-fence.lock");data->resolved.journal=r.Pin(data->resolved.runtime.canonicalPath+L"\\journal");
    const auto installationHash=r.Fixed<32>(),policyHash=r.Fixed<32>();
    if(r.Number(2)!=definition.artifacts.size()||r.Number(2))Refuse("production_artifact_count_refused");
    for(const auto& selector:definition.artifacts){if(r.Number(2)!=selector.code||r.Number(2))Refuse("production_artifact_role_order_refused");reviewed::File file;file.components=selector.components;file.pin=r.Pin(SelectorPath(data->resolved,selector.components));file.sha256=r.Fixed<32>();
        auto actual=Open(data->root.Get(),file.components,false,data->parents);if(!detail::SamePin(detail::ReadPin(actual.Get(),false),file.pin)||detail::Hash(detail::ReadExact(actual.Get(),134217728))!=file.sha256)Refuse("production_artifact_original_bytes_refused");data->files.push_back({std::move(actual),file.pin,false});data->artifacts.push_back({selector.code,std::move(file)});}
    if(r.Number(2)!=dependencies.size()||r.Number(2))Refuse("production_dependency_count_refused");
    for(const auto& expected:dependencies){if(r.Number(2)!=expected.code||r.Number(2)||!detail::SamePin(r.Pin(expected.file.pin.canonicalPath),expected.file.pin)||r.Fixed<32>()!=expected.file.sha256)Refuse("production_dependency_pin_refused");}
    for(const auto* file:{&definition.automationCredential,&definition.panelCredential})if(!detail::SamePin(r.Pin(file->pin.canonicalPath),file->pin)||r.Fixed<32>()!=file->sha256)Refuse("production_credential_binding_refused");
    if(r.Fixed<32>()!=definition.transportProfileHash||r.at+32!=data->record.size())Refuse("production_transport_or_tail_refused");
    const Bytes preceding(data->record.begin(),data->record.begin()+static_cast<std::ptrdiff_t>(r.at));if(r.Fixed<32>()!=Domain("lcs.production.artifact-record.v1",preceding))Refuse("production_artifact_integrity_refused");
    // Hold every dependency and credential original; external absolute entries
    // are opened through their exact canonical no-reparse ancestors below.
    for(const auto& expected:dependencies){auto actual=Absolute(expected.file.pin,false,data->parents);if(detail::Hash(detail::ReadExact(actual.Get(),134217728))!=expected.file.sha256)Refuse("production_dependency_original_bytes_refused");data->files.push_back({std::move(actual),expected.file.pin,false});}
    for(const auto* expected:{&definition.automationCredential,&definition.panelCredential}){auto actual=Absolute(expected->pin,false,data->parents);const auto bytes=detail::ReadExact(actual.Get(),16384);
        if(detail::Hash(bytes)!=expected->sha256)Refuse("production_transport_build_input_bytes_refused");data->files.push_back({std::move(actual),expected->pin,false});}
    auto installation=Absolute(data->resolved.installationFile,false,data->parents),policy=Absolute(data->resolved.policyFile,false,data->parents);
    if(detail::Hash(detail::ReadExact(installation.Get(),16384))!=installationHash||detail::Hash(detail::ReadExact(policy.Get(),16384))!=policyHash||policyHash!=data->resolved.policyHash)Refuse("production_original_enrollment_bytes_refused");
    data->files.push_back({std::move(installation),data->resolved.installationFile,false});data->files.push_back({std::move(policy),data->resolved.policyFile,false});
    auto setup=Absolute(definition.setupNamespace,true,data->parents);(void)RetainParent(std::move(setup),definition.setupNamespace,data->parents);
    data->recordHash=detail::Hash(data->record);if(!data->Fresh())Refuse("production_seal_late_guard_refused");result={true,false,false,"production_original_seal_open",0};return std::shared_ptr<OriginalSealWitness>(new OriginalSealWitness(std::move(data)));
}catch(const detail::Failure& failure){result={false,failure.unknown,failure.unavailable,failure.code,failure.error};return nullptr;}}
#endif
#if defined(AE_AGENT_PHASE_TRUSTED_READ_SETUP)
class SetupCreator final {
public:
    static Result Run(){bool created=false;try{
        const auto& d=local_session_reviewed::kSetupDefinition;Validate(d,true);const auto& p=d.enrollment;
        const HANDLE input=GetStdHandle(STD_INPUT_HANDLE),output=GetStdHandle(STD_OUTPUT_HANDLE);
        if(!input||!output||input==INVALID_HANDLE_VALUE||output==INVALID_HANDLE_VALUE||input==output||GetFileType(input)!=FILE_TYPE_PIPE||GetFileType(output)!=FILE_TYPE_PIPE)Refuse("production_original_setup_stdio_required");
        DWORD available=0,outputSize=0,inputSize=0;if(!PeekNamedPipe(input,nullptr,0,nullptr,&available,nullptr)||available||!GetNamedPipeInfo(output,nullptr,&outputSize,&inputSize,nullptr)||std::max(outputSize,inputSize)<1024)Refuse("production_original_setup_stdio_shape");
        const auto birth=detail::ProcessBirth(GetCurrentProcess());const Id nonce=detail::RandomId();const auto imagePath=detail::ProcessImage(GetCurrentProcess());
        Held image(CreateFileW(imagePath.c_str(),FILE_READ_DATA|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));if(!image.Valid())Refuse("production_original_setup_image_required",GetLastError());
        const auto imagePin=detail::ReadPin(image.Get(),false);const auto imageSha=detail::Hash(detail::ReadExact(image.Get(),134217728));
        std::vector<Witness> parents,files;std::vector<VendorWitness> vendors;auto root=Root(p,parents);auto runtime=Absolute(p.runtime,true,parents);detail::AssertEmptyDirectory(runtime.Get());
        auto setup=Absolute(d.setupNamespace,true,parents);
        if(SelectorPath(p,d.anchorComponents).substr(0,SelectorPath(p,d.anchorComponents).find_last_of(L'\\'))!=d.setupNamespace.canonicalPath)Refuse("production_anchor_namespace_refused");
        for(const auto& expected:d.dependencies){auto file=Absolute(expected.file.pin,false,parents);if(detail::Hash(detail::ReadExact(file.Get(),134217728))!=expected.file.sha256)Refuse("production_setup_source_changed");files.push_back({std::move(file),expected.file.pin,false});}
        for(const auto* credential:{&d.automationCredential,&d.panelCredential}){auto file=Absolute(credential->pin,false,parents);if(detail::Hash(detail::ReadExact(file.Get(),4096))!=credential->sha256)Refuse("production_setup_credential_changed");files.push_back({std::move(file),credential->pin,false});}
        auto anchor=Open(root.Get(),d.anchorComponents,false,parents,true);created=true;std::uint64_t length=0;const auto anchorPin=detail::ReadPin(anchor.Get(),false,&length);if(length)Refuse("production_created_anchor_not_empty",0,true);
        const auto fresh=[&](){if(GetStdHandle(STD_INPUT_HANDLE)!=input||GetStdHandle(STD_OUTPUT_HANDLE)!=output||detail::ProcessBirth(GetCurrentProcess())!=birth||detail::ProcessSid(GetCurrentProcess())!=p.userSid||detail::ProcessImage(GetCurrentProcess())!=imagePath||!detail::SamePin(detail::ReadPin(image.Get(),false),imagePin)||detail::Hash(detail::ReadExact(image.Get(),134217728))!=imageSha||!detail::SamePin(detail::ReadPin(anchor.Get(),false),anchorPin))Refuse("production_setup_original_changed",0,true);HeldFresh(parents);HeldFresh(files);VendorFresh(vendors);};
        Bytes prepare;Header(prepare,"OWNLCP01",1,0,424);Put(prepare,nonce);detail::PutU64(prepare,birth);Put(prepare,p.installation);Put(prepare,p.lineage);Put(prepare,d.staticCodeHash);Put(prepare,p.policyHash);detail::PutPin(prepare,anchorPin);detail::PutPin(prepare,d.setupNamespace);detail::PutPin(prepare,imagePin);Put(prepare,imageSha);Put(prepare,d.fixedProfileHash);detail::PutPin(prepare,p.node.pin);Put(prepare,p.node.sha256);Put(prepare,SidHash(p.userSid));if(prepare.size()!=424)Refuse("production_prepare_internal_size",0,true);
        fresh();Send(output,prepare);const auto preparedAt=GetTickCount64();if(preparedAt>std::numeric_limits<std::uint64_t>::max()-3600000)Refuse("production_prepare_deadline_overflow",0,true);
        const auto sealRequest=ReadOwnedStage(input,preparedAt+3600000);fresh();CheckStage(sealRequest,"OWNLCPS1",3,nonce,birth,detail::Hash(prepare));
        Bytes artifactSection;detail::PutU16(artifactSection,static_cast<std::uint16_t>(d.artifacts.size()));detail::PutU16(artifactSection,0);
        for(const auto& selector:d.artifacts){auto file=Open(root.Get(),selector.components,false,parents);const auto pin=detail::ReadPin(file.Get(),false);const auto bytes=detail::ReadExact(file.Get(),134217728);
            // All declared artifacts are exact x64 PE images; malformed output
            // cannot be sealed as a helper/addon merely because it has bytes.
            if(bytes.size()<64||bytes[0]!='M'||bytes[1]!='Z')Refuse("production_artifact_pe_refused",0,true);Reader pe{bytes};pe.at=60;const auto offset=pe.Number(4);if(offset>bytes.size()-24)Refuse("production_artifact_pe_refused",0,true);pe.at=static_cast<std::size_t>(offset);if(pe.Number(4)!=0x00004550||pe.Number(2)!=0x8664)Refuse("production_artifact_architecture_refused",0,true);
            if(selector.code==3&&(!detail::SamePin(pin,imagePin)||detail::Hash(bytes)!=imageSha))Refuse("production_original_setup_role_changed",0,true);
            detail::PutU16(artifactSection,selector.code);detail::PutU16(artifactSection,0);detail::PutPin(artifactSection,pin);Put(artifactSection,detail::Hash(bytes));files.push_back({std::move(file),pin,false});}
        const auto build=ReconstructBuildInputs(d,anchorPin,true,parents,files,vendors);const auto generatedHash=build.generated;const auto dependencies=RawDependencies(d,build);
        auto buildInput=Open(root.Get(),d.buildInputManifest.components,false,parents);const auto buildPin=detail::ReadPin(buildInput.Get(),false);const auto buildBytes=detail::ReadExact(buildInput.Get(),kBuildManifestMax);
        CheckBuildManifest(buildBytes,d,anchorPin,build);files.push_back({std::move(buildInput),buildPin,false});
        fresh();detail::AssertEmptyDirectory(runtime.Get());
        auto lock=detail::Relative(runtime.Get(),L".initial-owned-fence.lock",false,true,true,true);auto journal=detail::Relative(runtime.Get(),L"journal",true,true,true);
        auto installation=detail::Relative(runtime.Get(),L".initial-owned-local.installation",false,true,true),policy=detail::Relative(runtime.Get(),L".initial-owned-local.policy",false,true,true);
        const auto lockPin=detail::ReadPin(lock.Get(),false),journalPin=detail::ReadPin(journal.Get(),true),installationPin=detail::ReadPin(installation.Get(),false),policyPin=detail::ReadPin(policy.Get(),false);
        const auto installationBytes=detail::ProductionInstallationBytes(p,lockPin,journalPin),policyBytes=detail::ProductionPolicyBytes(p);if(detail::Hash(policyBytes)!=p.policyHash)Refuse("production_static_policy_bytes_refused",0,true);WriteNew(installation,installationBytes);WriteNew(policy,policyBytes);
        Bytes record;Header(record,"OWNLCPA1",1,1,0);Put(record,p.installation);Put(record,p.lineage);Put(record,d.fixedProfileHash);Put(record,p.policyHash);detail::PutU64(record,p.policyEpoch);Put(record,d.staticCodeHash);Put(record,generatedHash);
        for(const auto* pin:{&anchorPin,&p.repository,&p.runtime,&d.setupNamespace})detail::PutPin(record,*pin);Put(record,SidHash(p.userSid));
        for(const auto* pin:{&installationPin,&policyPin,&lockPin,&journalPin})detail::PutPin(record,*pin);Put(record,detail::Hash(installationBytes));Put(record,detail::Hash(policyBytes));Put(record,artifactSection);
        detail::PutU16(record,static_cast<std::uint16_t>(dependencies.size()));detail::PutU16(record,0);for(const auto& dependency:dependencies){detail::PutU16(record,dependency.code);detail::PutU16(record,0);detail::PutPin(record,dependency.file.pin);Put(record,dependency.file.sha256);}
        for(const auto* credential:{&d.automationCredential,&d.panelCredential}){detail::PutPin(record,credential->pin);Put(record,credential->sha256);}Put(record,d.transportProfileHash);
        if(record.size()+32>kRecordMax)Refuse("production_artifact_record_limit",0,true);const auto total=static_cast<std::uint32_t>(record.size()+32);for(unsigned i=0;i<4;++i)record[12+i]=static_cast<unsigned char>(total>>(8*i));Put(record,Domain("lcs.production.artifact-record.v1",record));fresh();WriteNew(anchor,record);
        const auto finalFresh=[&](){fresh();detail::AssertRuntimeInventory(runtime.Get());detail::AssertEmptyDirectory(journal.Get());std::uint64_t lockLength=0;
            if(!detail::SamePin(detail::ReadPin(lock.Get(),false,&lockLength),lockPin)||lockLength||!detail::SamePin(detail::ReadPin(journal.Get(),true),journalPin)||!detail::SamePin(detail::ReadPin(installation.Get(),false),installationPin)||!detail::SamePin(detail::ReadPin(policy.Get(),false),policyPin)||detail::ReadExact(installation.Get(),16384)!=installationBytes||detail::ReadExact(policy.Get(),16384)!=policyBytes||detail::ReadExact(anchor.Get(),kRecordMax)!=record)Refuse("production_sealed_original_records_changed",0,true);};
        Bytes final;Header(final,"OWNLCP02",2,1,752);Put(final,nonce);detail::PutU64(final,birth);Put(final,p.installation);Put(final,p.lineage);Put(final,p.policyHash);
        for(const auto* pin:{&p.repository,&p.runtime,&installationPin,&policyPin,&lockPin,&journalPin})detail::PutPin(final,*pin);Put(final,detail::Hash(installationBytes));Put(final,detail::Hash(policyBytes));detail::PutPin(final,imagePin);Put(final,imageSha);
        if(final.size()!=480)Refuse("production_final_ordinary_prefix_size",0,true);detail::PutPin(final,anchorPin);Put(final,detail::Hash(record));Put(final,d.staticCodeHash);Put(final,generatedHash);Put(final,Domain("lcs.production.artifact-set.v1",artifactSection));Put(final,d.fixedProfileHash);detail::PutPin(final,d.setupNamespace);Put(final,SidHash(p.userSid));if(final.size()!=752)Refuse("production_final_internal_size",0,true);
        finalFresh();Send(output,final);const auto sentAt=GetTickCount64();if(sentAt>std::numeric_limits<std::uint64_t>::max()-30000)Refuse("production_final_deadline_overflow",0,true);
        const auto ack=ReadOwnedStage(input,sentAt+30000);CheckStage(ack,"OWNLCA01",2,nonce,birth,detail::Hash(final));finalFresh();DWORD extra=0;if(!PeekNamedPipe(input,nullptr,0,nullptr,&extra,nullptr)||extra)Refuse("production_final_stdio_changed",GetLastError(),true);
        return {true,false,false,"production_original_artifact_seal_acknowledged",0};
    }catch(const detail::Failure& failure){return {false,created||failure.unknown,failure.unavailable,failure.code,failure.error};}}
};
Result PrepareAndSealFixedOverOriginalStdio(){return SetupCreator::Run();}
#endif
} // namespace local_session::production
