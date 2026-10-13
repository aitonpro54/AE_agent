#include "store_win32.h"
#include <windows.h>
#include <winternl.h>
#include <bcrypt.h>
#include <objbase.h>
#include <algorithm>
#include <cstddef>
#include <cstring>
#include <exception>
#include <iomanip>
#include <iterator>
#include <limits>
#include <set>
#include <sstream>
#include <stdexcept>
#include <utility>
#include "durability_expected_pins.h"

namespace initial_durability {
namespace {
using Bytes=std::vector<unsigned char>;
constexpr std::size_t kFrameLimit=16384, kPayloadLimit=4096, kSlotLimit=256, kAggregateLimit=4194304;
constexpr std::size_t kHeaderLength=196, kMinimumLength=kHeaderLength+32;
constexpr bool CounterCanAdvance(std::uint64_t value) {return value!=std::numeric_limits<std::uint64_t>::max();}
constexpr bool AggregateFits(std::size_t used,std::uint64_t length) {return used<=kAggregateLimit&&length<=kFrameLimit&&length<=kAggregateLimit-used;}
static_assert(!CounterCanAdvance(std::numeric_limits<std::uint64_t>::max()),"counter overflow refused");
static_assert(CounterCanAdvance(0),"first counter supported");
static_assert(!AggregateFits(kAggregateLimit,1)&&!AggregateFits(kAggregateLimit+1,0),"aggregate overflow refused");
static_assert(AggregateFits(kAggregateLimit-kFrameLimit,kFrameLimit),"last bounded frame fits");
constexpr wchar_t kJournal[]=L"journal";
struct Failure { std::string code; DWORD error=0; bool unavailable=false; };
[[noreturn]] void Refuse(const char* code, DWORD error=0, bool unavailable=false) { throw Failure{code,error,unavailable}; }
class Held final {
public:
    Held()=default; explicit Held(HANDLE h):h_(h){} ~Held(){if(Valid()&&!CloseHandle(h_)){std::terminate();}}
    Held(Held&& o) noexcept:h_(o.Take()){} Held& operator=(Held&& o) noexcept {if(this!=&o){if(Valid()&&!CloseHandle(h_)){std::terminate();}h_=o.Take();}return *this;}
    Held(const Held&)=delete; Held& operator=(const Held&)=delete;
    HANDLE Get() const{return h_;} bool Valid() const{return h_&&h_!=INVALID_HANDLE_VALUE;}
    HANDLE Take(){HANDLE h=h_;h_=nullptr;return h;}
private: HANDLE h_=nullptr;
};
std::string Hex(const unsigned char* p,std::size_t n){static constexpr char d[]="0123456789abcdef";std::string s(n*2,'0');for(std::size_t i=0;i<n;++i){s[2*i]=d[p[i]>>4];s[2*i+1]=d[p[i]&15];}return s;}
template<std::size_t N> std::string Hex(const std::array<unsigned char,N>& a){return Hex(a.data(),N);}
Bytes Unhex(const std::string& s){if(s.size()%2||s.size()>2*kFrameLimit)Refuse("wire_hex_invalid");Bytes b(s.size()/2);for(std::size_t i=0;i<s.size();++i){const char c=s[i];unsigned char v;if(c>='0'&&c<='9')v=static_cast<unsigned char>(c-'0');else if(c>='a'&&c<='f')v=static_cast<unsigned char>(c-'a'+10);else Refuse("wire_hex_invalid");b[i/2]=static_cast<unsigned char>((b[i/2]<<4)|v);}return b;}
template<std::size_t N> std::array<unsigned char,N> Fixed(const std::string& s){Bytes b=Unhex(s);if(b.size()!=N)Refuse("pin_length_invalid");std::array<unsigned char,N>a{};std::copy(b.begin(),b.end(),a.begin());return a;}
template<class A> bool Zero(const A& a){return std::all_of(a.begin(),a.end(),[](unsigned char c){return c==0;});}
void U16(Bytes& b,std::uint16_t n){b.push_back(static_cast<unsigned char>(n));b.push_back(static_cast<unsigned char>(n>>8));}
void U32(Bytes& b,std::uint32_t n){for(int i=0;i<4;++i)b.push_back(static_cast<unsigned char>(n>>(8*i)));}
void U64(Bytes& b,std::uint64_t n){for(int i=0;i<8;++i)b.push_back(static_cast<unsigned char>(n>>(8*i)));}
template<class A> void Put(Bytes& b,const A& a){b.insert(b.end(),a.begin(),a.end());}
struct Reader {
    const Bytes& b;std::size_t p=0;
    void Need(std::size_t n){if(p>b.size()||n>b.size()-p)Refuse("frame_truncated");}
    std::uint64_t Num(std::size_t n){Need(n);std::uint64_t v=0;for(std::size_t i=0;i<n;++i)v|=static_cast<std::uint64_t>(b[p++])<<(8*i);return v;}
    template<std::size_t N> std::array<unsigned char,N> Array(){Need(N);std::array<unsigned char,N>a{};std::copy_n(b.begin()+static_cast<std::ptrdiff_t>(p),N,a.begin());p+=N;return a;}
    Bytes Part(std::size_t n){Need(n);Bytes v(b.begin()+static_cast<std::ptrdiff_t>(p),b.begin()+static_cast<std::ptrdiff_t>(p+n));p+=n;return v;}
    void End(){if(p!=b.size())Refuse("frame_trailing_bytes");}
};
Digest Hash(const Bytes& b){BCRYPT_ALG_HANDLE alg=nullptr;BCRYPT_HASH_HANDLE h=nullptr;Digest out{};DWORD size=0,got=0;
    if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)Refuse("sha256_unavailable");
    if(BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,reinterpret_cast<PUCHAR>(&size),sizeof(size),&got,0)<0){BCryptCloseAlgorithmProvider(alg,0);Refuse("sha256_unavailable");}
    Bytes object(size);NTSTATUS status=BCryptCreateHash(alg,&h,object.data(),size,nullptr,0,0);
    if(status>=0)status=BCryptHashData(h,const_cast<PUCHAR>(b.data()),static_cast<ULONG>(b.size()),0);
    if(status>=0)status=BCryptFinishHash(h,out.data(),static_cast<ULONG>(out.size()),0);
    if(h)BCryptDestroyHash(h);BCryptCloseAlgorithmProvider(alg,0);if(status<0)Refuse("sha256_failed");return out;}
bool SamePath(const std::wstring& a,const std::wstring& b){return CompareStringOrdinal(a.c_str(),static_cast<int>(a.size()),b.c_str(),static_cast<int>(b.size()),TRUE)==CSTR_EQUAL;}
struct Pin {Id guid{},id{};std::uint64_t serial=0;std::wstring path;};
Pin ReadPin(HANDLE h,bool directory,std::uint64_t* length=nullptr){
    if(GetFileType(h)!=FILE_TYPE_DISK)Refuse("not_disk");FILE_ATTRIBUTE_TAG_INFO a{};FILE_STANDARD_INFO s{};FILE_ID_INFO id{};
    if(!GetFileInformationByHandleEx(h,FileAttributeTagInfo,&a,sizeof(a))||!GetFileInformationByHandleEx(h,FileStandardInfo,&s,sizeof(s))||!GetFileInformationByHandleEx(h,FileIdInfo,&id,sizeof(id)))Refuse("identity_query_failed",GetLastError());
    constexpr DWORD bad=FILE_ATTRIBUTE_REPARSE_POINT|FILE_ATTRIBUTE_OFFLINE|FILE_ATTRIBUTE_RECALL_ON_OPEN|FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;
    if((a.FileAttributes&bad)||((a.FileAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0)!=directory||s.DeletePending||static_cast<bool>(s.Directory)!=directory||(!directory&&s.NumberOfLinks!=1))Refuse("node_shape_refused");
    if(directory){FILE_CASE_SENSITIVE_INFO c{};if(!GetFileInformationByHandleEx(h,FileCaseSensitiveInfo,&c,sizeof(c)))Refuse("case_query_failed",GetLastError());if(c.Flags&FILE_CS_FLAG_CASE_SENSITIVE_DIR)Refuse("case_sensitive_refused");}
    wchar_t fs[32]{};if(!GetVolumeInformationByHandleW(h,nullptr,0,nullptr,nullptr,nullptr,fs,32))Refuse("fs_query_failed",GetLastError());if(std::wstring(fs)!=L"NTFS")Refuse("not_ntfs");
    std::vector<wchar_t> name(32761);DWORD n=GetFinalPathNameByHandleW(h,name.data(),static_cast<DWORD>(name.size()),FILE_NAME_NORMALIZED|VOLUME_NAME_GUID);if(!n||n>=name.size())Refuse("canonical_query_failed",GetLastError());
    Pin p;p.path.assign(name.data(),n);if(p.path.size()<49||p.path.substr(0,11)!=L"\\\\?\\Volume{"||p.path[47]!=L'}'||p.path[48]!=L'\\')Refuse("canonical_refused");
    const std::wstring guid=p.path.substr(10,38);GUID native{};if(CLSIDFromString(guid.c_str(),&native)!=S_OK)Refuse("guid_refused");std::memcpy(p.guid.data(),&native,16);p.serial=id.VolumeSerialNumber;std::memcpy(p.id.data(),id.FileId.Identifier,16);
    if(s.EndOfFile.QuadPart<0)Refuse("negative_file_length");if(length)*length=static_cast<std::uint64_t>(s.EndOfFile.QuadPart);return p;
}
template<class P> Pin ApprovedPin(const P& p){Pin out;out.path=p.canonicalPath;out.id=Fixed<16>(p.fileIdHex);out.serial=std::stoull(p.serialHex,nullptr,16);GUID g{};if(out.path.size()<49||CLSIDFromString(out.path.substr(10,38).c_str(),&g)!=S_OK)Refuse("pin_guid_invalid");std::memcpy(out.guid.data(),&g,16);return out;}
bool SamePin(const Pin& a,const Pin& b){return a.guid==b.guid&&a.serial==b.serial&&a.id==b.id&&SamePath(a.path,b.path);}
void PutPin(Bytes& b,const Pin& p){Put(b,p.guid);U64(b,p.serial);Put(b,p.id);}
using NtCreate=NTSTATUS(NTAPI*)(PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES,PIO_STATUS_BLOCK,PLARGE_INTEGER,ULONG,ULONG,ULONG,ULONG,PVOID,ULONG);
using NtError=ULONG(NTAPI*)(NTSTATUS);
Held Relative(HANDLE parent,const std::wstring& component,bool create,bool directory,bool write){
    if(component.empty()||component==L"."||component==L".."||component.size()>255||component.find_first_of(L"\\/:")!=std::wstring::npos||component.find(L'\0')!=std::wstring::npos)Refuse("component_refused");
    const HMODULE ntdll=GetModuleHandleW(L"ntdll.dll");FARPROC addr=GetProcAddress(ntdll,"NtCreateFile"),err=GetProcAddress(ntdll,"RtlNtStatusToDosError");NtCreate call=nullptr;NtError translate=nullptr;std::memcpy(&call,&addr,sizeof(call));std::memcpy(&translate,&err,sizeof(translate));if(!call||!translate)Refuse("nt_api_unavailable");
    UNICODE_STRING name{};name.Buffer=const_cast<PWSTR>(component.c_str());name.Length=static_cast<USHORT>(component.size()*2);name.MaximumLength=name.Length;
    OBJECT_ATTRIBUTES oa{};oa.Length=sizeof(oa);oa.RootDirectory=parent;oa.ObjectName=&name;oa.Attributes=0x40;IO_STATUS_BLOCK io{};HANDLE h=nullptr;
    const ACCESS_MASK access=FILE_READ_ATTRIBUTES|SYNCHRONIZE|(directory?FILE_LIST_DIRECTORY:FILE_READ_DATA)|(write?FILE_WRITE_DATA:0);
    const ULONG options=0x00200000|0x00000020|(directory?0x00000001:0x00000040);
    // Read witnesses share the existing writer's WRITE access; writer shares READ.
    // Neither opens with SHARE_DELETE. Only FILE_CREATE can mutate the namespace.
    const NTSTATUS status=call(&h,access,&oa,&io,nullptr,FILE_ATTRIBUTE_NORMAL,write?FILE_SHARE_READ:(FILE_SHARE_READ|FILE_SHARE_WRITE),create?2u:1u,options,nullptr,0);
    if(status<0)Refuse(create?"create_new_failed":"relative_open_failed",translate(status));Held held(h);if(!held.Valid())Refuse("invalid_native_handle");if(!SetHandleInformation(h,HANDLE_FLAG_INHERIT,0))Refuse("inheritance_clear_failed",GetLastError());return held;
}
std::wstring SlotName(std::uint64_t n){if(!n||n>kSlotLimit)Refuse("slot_limit");std::wostringstream s;s<<std::setw(20)<<std::setfill(L'0')<<n<<L".rec";return s.str();}
Bytes ReadBytes(HANDLE h,std::uint64_t length){if(length>kFrameLimit||length<kMinimumLength)Refuse("frame_length_refused");LARGE_INTEGER zero{};if(!SetFilePointerEx(h,zero,nullptr,FILE_BEGIN))Refuse("read_seek_failed",GetLastError());Bytes b(static_cast<std::size_t>(length));DWORD read=0;if(!ReadFile(h,b.data(),static_cast<DWORD>(b.size()),&read,nullptr)||read!=b.size())Refuse("readback_failed",GetLastError());return b;}
struct Frame {RecordType type{};Digest scope{},genesis{},previous{},key{},hash{};Id lineage{},owner{};std::uint64_t sequence=0,epoch=0;Bytes payload;};
Bytes Encode(const Frame& f){if(f.payload.size()>kPayloadLimit)Refuse("payload_limit");Bytes b={'O','W','N','J','R','N','0','1'};U16(b,1);U16(b,static_cast<std::uint16_t>(f.type));U32(b,static_cast<std::uint32_t>(kMinimumLength+f.payload.size()));Put(b,f.scope);Put(b,f.lineage);Put(b,f.genesis);U64(b,f.sequence);U64(b,f.epoch);Put(b,f.owner);Put(b,f.previous);Put(b,f.key);U32(b,static_cast<std::uint32_t>(f.payload.size()));Put(b,f.payload);Put(b,Hash(b));return b;}
Frame Decode(const Bytes& b){if(b.size()<kMinimumLength||b.size()>kFrameLimit)Refuse("frame_length_refused");Reader r{b};if(r.Array<8>()!=std::array<unsigned char,8>{'O','W','N','J','R','N','0','1'}||r.Num(2)!=1)Refuse("frame_version_refused");Frame f;const auto type=r.Num(2);if(type<1||type>5||r.Num(4)!=b.size())Refuse("frame_type_length_refused");f.type=static_cast<RecordType>(type);f.scope=r.Array<32>();f.lineage=r.Array<16>();f.genesis=r.Array<32>();f.sequence=r.Num(8);f.epoch=r.Num(8);f.owner=r.Array<16>();f.previous=r.Array<32>();f.key=r.Array<32>();const auto n=r.Num(4);if(n>kPayloadLimit||n+32!=b.size()-r.p)Refuse("payload_length_refused");f.payload=r.Part(static_cast<std::size_t>(n));f.hash=r.Array<32>();r.End();if(Hash(Bytes(b.begin(),b.end()-32))!=f.hash)Refuse("frame_hash_refused");return f;}
struct Pending {bool exists=false,createdBound=false;Cas expected;std::uint64_t slot=0;RecordType type{};Digest semantic{},hash{};Id owner{},createdId{};};
struct Floor {Digest scope{},genesis{},head{};std::uint64_t sequence=0,epoch=0;std::vector<Id> ids;Pending pending;Id owner{};};
bool SamePending(const Pending& a,const Pending& b){return a.exists==b.exists&&(!a.exists||(a.createdBound==b.createdBound&&a.createdId==b.createdId&&a.slot==b.slot&&a.type==b.type&&a.semantic==b.semantic&&a.hash==b.hash&&a.owner==b.owner&&a.expected.sequence==b.expected.sequence&&a.expected.epoch==b.expected.epoch&&a.expected.head==b.expected.head));}
Floor DecodeFloor(const std::string& text){Bytes b=Unhex(text);Reader r{b};Floor f;f.scope=r.Array<32>();f.genesis=r.Array<32>();f.sequence=r.Num(8);f.epoch=r.Num(8);f.head=r.Array<32>();const auto n=r.Num(2);if(n>kSlotLimit||n!=f.sequence)Refuse("floor_count_invalid");for(std::uint64_t i=0;i<n;++i)f.ids.push_back(r.Array<16>());f.owner=r.Array<16>();const auto pending=r.Num(1);if(pending>1)Refuse("floor_pending_invalid");if(pending){f.pending.exists=true;f.pending.expected.sequence=r.Num(8);f.pending.expected.epoch=r.Num(8);f.pending.expected.head=r.Array<32>();f.pending.slot=r.Num(8);const auto type=r.Num(2);if(type<1||type>5)Refuse("floor_pending_invalid");f.pending.type=static_cast<RecordType>(type);f.pending.semantic=r.Array<32>();f.pending.hash=r.Array<32>();f.pending.owner=r.Array<16>();const auto bound=r.Num(1);if(bound>1)Refuse("floor_created_binding_invalid");f.pending.createdBound=bound!=0;if(bound){f.pending.createdId=r.Array<16>();if(Zero(f.pending.createdId))Refuse("floor_created_binding_invalid");}}r.End();return f;}
class Continuity final {
public:
    explicit Continuity(HANDLE driver):driver_(driver){DWORD flags=0;if(!driver||driver==INVALID_HANDLE_VALUE||!GetHandleInformation(driver,&flags)||GetFileType(GetStdHandle(STD_INPUT_HANDLE))!=FILE_TYPE_PIPE||GetFileType(GetStdHandle(STD_OUTPUT_HANDLE))!=FILE_TYPE_PIPE)Refuse("continuity_unavailable",GetLastError(),true);}
    std::string Exchange(const std::string& verb,const std::string& fields){if(closed_)Refuse("continuity_closed",0,true);try{
        Live();if(counter_==std::numeric_limits<std::uint64_t>::max())Refuse("continuity_counter_exhausted",0,true);const std::string nonce=std::to_string(++counter_);
        const std::string request="P "+nonce+" "+verb+(fields.empty()?"":" "+fields)+"\n";if(request.size()>40000)Refuse("continuity_request_limit",0,true);DWORD n=0;
        if(!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),request.data(),static_cast<DWORD>(request.size()),&n,nullptr)||n!=request.size())Refuse("continuity_send_failed",GetLastError(),true);
        const ULONGLONG started=GetTickCount64();std::string line;for(;;){Live();DWORD available=0;if(!PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE),nullptr,0,nullptr,&available,nullptr))Refuse("continuity_broken",GetLastError(),true);if(!available){if(GetTickCount64()-started>=5000)Refuse("continuity_timeout",ERROR_TIMEOUT,true);Sleep(1);continue;}char c=0;DWORD got=0;if(!ReadFile(GetStdHandle(STD_INPUT_HANDLE),&c,1,&got,nullptr)||got!=1)Refuse("continuity_read_failed",GetLastError(),true);if(c=='\n')break;if(c<32||c>126||line.size()>=40000)Refuse("continuity_protocol_invalid",0,true);line+=c;}
        Live();const std::string prefix="Q "+nonce+" OK ";if(line.compare(0,prefix.size(),prefix)!=0)Refuse("continuity_refused",0,true);return line.substr(prefix.size());
    }catch(const Failure&){closed_=true;throw;}}
    void Live(){const DWORD wait=WaitForSingleObject(driver_,0);if(wait!=WAIT_TIMEOUT)Refuse("original_driver_not_live",wait==WAIT_FAILED?GetLastError():0,true);}
private:HANDLE driver_;bool closed_=false;std::uint64_t counter_=0;
};
bool SameCas(const Cas& a,const Cas& b){return a.sequence==b.sequence&&a.epoch==b.epoch&&a.head==b.head;}
Digest Stable(RecordType type,const Digest& scope,const Id& lineage,const Bytes& payload,std::uint64_t previousEpoch){Bytes b; if(type!=RecordType::Consume)U16(b,static_cast<std::uint16_t>(type));Put(b,scope);if(type!=RecordType::Genesis)Put(b,lineage);if(type==RecordType::OwnerEpoch)U64(b,previousEpoch);Put(b,payload);return Hash(b);}
} // namespace

struct Store::Data {
    initial_fence::Factory& factory;initial_fence::RootLease& root;initial_fence::FenceLease& fence;
    const durability_pins::Slot& slot;Pin journal;Bytes scopeBytes,selectors;Digest scope{};Id lineage{};
    Continuity port;bool unknown=false,entered=false;int operation=0;Cas expected;ClosedRecord request;Result result;
    std::vector<Frame> chain;std::vector<Pin> pins;std::vector<Digest> conservativeKeys;Floor floor;bool pendingAttempted=false;Id activeCreatedId{};std::uint64_t activeCreatedSequence=0;
    Data(initial_fence::Factory& f,initial_fence::RootLease& r,initial_fence::FenceLease& l,const durability_pins::Slot& s):factory(f),root(r),fence(l),slot(s),journal(ApprovedPin(durability_pins::kJournals[s.fixtureIndex])),port(s.withoutPort?nullptr:reinterpret_cast<HANDLE>(s.originalDriverHandle)){
        Put(scopeBytes,Fixed<16>(durability_pins::kInstallationIds[s.fixtureIndex]));PutPin(scopeBytes,ApprovedPin(durability_pins::kRunRoots[s.fixtureIndex]));PutPin(scopeBytes,ApprovedPin(durability_pins::kFixtures[s.fixtureIndex]));PutPin(scopeBytes,journal);PutPin(scopeBytes,ApprovedPin(durability_pins::kLocks[s.fixtureIndex]));scope=Hash(scopeBytes);
        selectors=Unhex(durability_pins::kSelectors[s.fixtureIndex]);Reader sr{selectors};sr.Array<16>();const auto count=sr.Num(2);if(count>16||selectors.size()!=18+count*18)Refuse("selector_table_invalid");Bytes previous;for(std::uint64_t i=0;i<count;++i){Bytes entry=sr.Part(18);Reader er{entry};const auto effect=er.Num(2);if(effect<2||effect>3||(!previous.empty()&&entry<=previous))Refuse("selector_table_invalid");previous=entry;}sr.End();lineage=Fixed<16>(durability_pins::kLineages[s.fixtureIndex]);if(Zero(lineage))Refuse("lineage_pin_invalid");
    }
    void Guard(initial_fence::InternalFencedIo& io,const char* stage){const auto f=io.StageGuard();if(!f.ok)Refuse("live_fence_lost",f.win32Error);const auto observed=factory.Observe(root,fence);if(!observed.ok||observed.sessionRef.empty())Refuse("live_fence_lost",observed.win32Error);
        Held currentJournal=Journal(io);
        const Floor previous=floor;floor=DecodeFloor(port.Exchange("guard",std::string(stage)+" "+observed.sessionRef+" "+Hex(scope)+" "+std::to_string(result.createAttempts)+" "+std::to_string(result.writeAttempts)+" "+std::to_string(result.flushAttempts)));if(floor.scope!=scope)Refuse("floor_scope_mismatch");
        if(!Zero(previous.scope)){if(floor.sequence<previous.sequence||floor.ids.size()<previous.ids.size()||!std::equal(previous.ids.begin(),previous.ids.end(),floor.ids.begin()))Refuse("live_floor_rollback");if(floor.sequence==previous.sequence&&(floor.head!=previous.head||floor.epoch!=previous.epoch||floor.genesis!=previous.genesis))Refuse("live_floor_changed");if(std::string(stage)!="input"&&(floor.sequence!=previous.sequence||floor.owner!=previous.owner||!SamePending(floor.pending,previous.pending)))Refuse("live_floor_stage_changed");}
        if(activeCreatedSequence){if(floor.pending.exists&&floor.pending.slot==activeCreatedSequence){if(!floor.pending.createdBound&&std::string(stage)=="before_created_witness")return;if(!floor.pending.createdBound||floor.pending.createdId!=activeCreatedId)Refuse("pending_created_binding_changed");}else if(floor.sequence<activeCreatedSequence||floor.ids.size()<activeCreatedSequence||floor.ids[static_cast<std::size_t>(activeCreatedSequence-1)]!=activeCreatedId)Refuse("created_slot_floor_changed");}}
    bool ConsumeFault() const {return operation==3&&request.type==RecordType::Consume;}
    void Fault(const char* stage){if(ConsumeFault()&&std::string(slot.crashStage)==stage)ExitProcess(73);}
    Held Journal(initial_fence::InternalFencedIo& io){const HANDLE parent=static_cast<HANDLE>(io.BorrowedRoot());if(!parent)Refuse("live_fence_lost");
        if(std::string(slot.ioFault)=="identity_query_failure"){FILE_ID_INFO id{};const BOOL queried=GetFileInformationByHandleEx(INVALID_HANDLE_VALUE,FileIdInfo,&id,sizeof(id));const DWORD error=queried?0:GetLastError();result.actualHandleError=true;if(queried)Refuse("test_invalid_query_unexpected_success");Refuse("identity_query_failed",error);}
        Held h=Relative(parent,kJournal,false,true,false);if(!SamePin(ReadPin(h.Get(),true),journal))Refuse("journal_identity_changed");return h;}
    Bytes Payload(const ClosedRecord& r){Bytes p;if(r.type==RecordType::Consume){if(!Zero(r.consumedHash)||!Zero(r.sourceDigest)||!Zero(r.configDigest)||r.outcome!=Outcome::Unknown)Refuse("closed_record_extra_fields");const auto cl=static_cast<std::uint16_t>(r.effect);if(cl<1||cl>3||Zero(r.target))Refuse("consume_selector_invalid");U16(p,cl);Put(p,r.target);bool allowed=false;if(cl==1){allowed=std::equal(r.target.begin(),r.target.end(),selectors.begin());}else{for(std::size_t offset=18;offset<selectors.size();offset+=18){if(std::equal(p.begin(),p.end(),selectors.begin()+static_cast<std::ptrdiff_t>(offset)))allowed=true;}}if(!allowed)Refuse("consume_selector_unapproved");}
        else if(r.type==RecordType::Observation){if(!Zero(r.target)||!Zero(r.sourceDigest)||!Zero(r.configDigest)||r.effect!=EffectClass::Launch)Refuse("closed_record_extra_fields");const auto outcome=static_cast<std::uint16_t>(r.outcome);if(outcome<1||outcome>3)Refuse("observation_invalid");Put(p,r.consumedHash);U16(p,outcome);bool found=false;for(const auto& f:chain)if(f.type==RecordType::Consume&&f.hash==r.consumedHash)found=true;if(!found)Refuse("observation_unknown_consumption");}
        else if(r.type==RecordType::Note){if(!Zero(r.target)||!Zero(r.consumedHash)||r.effect!=EffectClass::Launch||r.outcome!=Outcome::Unknown)Refuse("closed_record_extra_fields");Put(p,r.sourceDigest);Put(p,r.configDigest);}else Refuse("normal_append_type_refused");return p;}
    void Semantics(const Frame& f){if(f.scope!=scope||f.lineage!=lineage||f.sequence!=chain.size()+1||f.previous!=(chain.empty()?Digest{}:chain.back().hash))Refuse("chain_binding_invalid");
        if(f.type==RecordType::Genesis){Bytes p=scopeBytes;Put(p,selectors);if(!chain.empty()||f.sequence!=1||f.epoch||!Zero(f.genesis)||!Zero(f.owner)||f.payload!=p)Refuse("genesis_invalid");}
        else {if(chain.empty()||f.genesis!=chain.front().hash)Refuse("genesis_reference_invalid");const auto& old=chain.back();if(f.type==RecordType::OwnerEpoch){if(old.epoch==std::numeric_limits<std::uint64_t>::max()||f.epoch!=old.epoch+1||Zero(f.owner)||f.payload!=Bytes(f.owner.begin(),f.owner.end()))Refuse("owner_epoch_invalid");for(const auto& earlier:chain)if(earlier.type==RecordType::OwnerEpoch&&earlier.owner==f.owner)Refuse("owner_reused");}
            else {if(!old.epoch||f.epoch!=old.epoch||f.owner!=old.owner)Refuse("stale_record_owner");ClosedRecord r;r.type=f.type;Reader pr{f.payload};if(f.type==RecordType::Consume){r.effect=static_cast<EffectClass>(pr.Num(2));r.target=pr.Array<16>();}else if(f.type==RecordType::Observation){r.consumedHash=pr.Array<32>();r.outcome=static_cast<Outcome>(pr.Num(2));}else if(f.type==RecordType::Note){r.sourceDigest=pr.Array<32>();r.configDigest=pr.Array<32>();}else Refuse("record_type_invalid");pr.End();if(Payload(r)!=f.payload)Refuse("closed_payload_invalid");}}
        const Digest key=Stable(f.type,scope,lineage,f.type==RecordType::Genesis?Bytes{}:f.payload,chain.empty()?0:chain.back().epoch);if(f.key!=key)Refuse("stable_key_invalid");for(const auto& old:chain)if(old.key==f.key)Refuse("duplicate_key_in_inventory");
    }
    void Inventory(HANDLE journalHandle,std::vector<Held>& witnesses){chain.clear();pins.clear();std::set<std::uint64_t> names;alignas(FILE_ID_BOTH_DIR_INFO) std::array<unsigned char,65536> buffer{};bool restart=true;std::size_t aggregate=0,enumerated=0;
        for(;;){const auto cls=restart?FileIdBothDirectoryRestartInfo:FileIdBothDirectoryInfo;restart=false;if(!GetFileInformationByHandleEx(journalHandle,cls,buffer.data(),static_cast<DWORD>(buffer.size()))){const DWORD error=GetLastError();if(error==ERROR_NO_MORE_FILES)break;Refuse("inventory_query_failed",error);}std::size_t offset=0;
            for(;;){if(offset+offsetof(FILE_ID_BOTH_DIR_INFO,FileName)>buffer.size())Refuse("inventory_entry_invalid");const auto* item=reinterpret_cast<const FILE_ID_BOTH_DIR_INFO*>(buffer.data()+offset);if(item->FileNameLength%2||item->FileNameLength>buffer.size()-offset-offsetof(FILE_ID_BOTH_DIR_INFO,FileName))Refuse("inventory_name_invalid");const std::wstring name(item->FileName,item->FileNameLength/2);
                if(name!=L"."&&name!=L".."){if(++enumerated>kSlotLimit)Refuse("inventory_limit");if(name.size()!=24||name.substr(20)!=L".rec")Refuse("foreign_entry");std::uint64_t n=0;for(std::size_t i=0;i<20;++i){if(name[i]<L'0'||name[i]>L'9'||n>(std::numeric_limits<std::uint64_t>::max()-9)/10)Refuse("slot_name_invalid");n=n*10+static_cast<unsigned>(name[i]-L'0');}if(!n||n>kSlotLimit||!names.insert(n).second)Refuse("slot_name_invalid");}
                if(!item->NextEntryOffset)break;if(item->NextEntryOffset<offsetof(FILE_ID_BOTH_DIR_INFO,FileName)||item->NextEntryOffset>buffer.size()-offset)Refuse("inventory_entry_invalid");offset+=item->NextEntryOffset;}
        }
        for(std::uint64_t n=1;n<=names.size();++n){if(!names.count(n))Refuse("inventory_gap");Held h=Relative(journalHandle,SlotName(n),false,false,false);std::uint64_t length=0;Pin p=ReadPin(h.Get(),false,&length);if(!SamePath(p.path,journal.path+L"\\"+SlotName(n))||p.guid!=journal.guid||p.serial!=journal.serial)Refuse("slot_path_changed");if(!AggregateFits(aggregate,length))Refuse("aggregate_limit");aggregate+=static_cast<std::size_t>(length);Frame f=Decode(ReadBytes(h.Get(),length));Semantics(f);chain.push_back(std::move(f));pins.push_back(std::move(p));witnesses.push_back(std::move(h));}
    }
    Cas Current()const{Cas c;if(!chain.empty()){c.sequence=chain.back().sequence;c.epoch=chain.back().epoch;c.head=chain.back().hash;}return c;}
    void FloorCheck(bool allowPending){if(floor.scope!=scope||floor.ids.size()!=floor.sequence||chain.size()<floor.sequence)Refuse("floor_rollback");if(floor.sequence){const auto& prefix=chain[static_cast<std::size_t>(floor.sequence-1)];if(prefix.hash!=floor.head||prefix.epoch!=floor.epoch||chain.front().hash!=floor.genesis)Refuse("floor_prefix_changed");}else if(floor.epoch||!Zero(floor.genesis)||!Zero(floor.head))Refuse("initial_floor_invalid");for(std::size_t i=0;i<floor.ids.size();++i)if(pins[i].id!=floor.ids[i])Refuse("known_slot_replaced");
        if(floor.pending.exists){const auto& p=floor.pending;if(p.slot!=floor.sequence+1||!SameCas(p.expected,Cas{floor.sequence,floor.epoch,floor.head}))Refuse("pending_floor_invalid");if(!allowPending)Refuse("pending_unresolved");if(chain.size()!=p.slot)Refuse("pending_slot_missing_or_conflicting");if(!p.createdBound||pins.back().id!=p.createdId)Refuse("pending_slot_replaced_or_unbound");const auto& f=chain.back();if(f.hash!=p.hash||f.key!=p.semantic||f.type!=p.type||f.owner!=p.owner)Refuse("pending_slot_conflicting");}
        else if(chain.size()!=floor.sequence)Refuse("unexplained_tail");}
    void Fill(){result.current=Current();result.scope=scope;result.lineage=lineage;result.genesis=chain.empty()?Digest{}:chain.front().hash;result.owner=chain.empty()?Id{}:chain.back().owner;result.spentKeys=conservativeKeys;for(const auto& f:chain)if(f.type==RecordType::Consume&&std::find(result.spentKeys.begin(),result.spentKeys.end(),f.key)==result.spentKeys.end())result.spentKeys.push_back(f.key);if(floor.pending.exists&&floor.pending.type==RecordType::Consume&&std::find(result.spentKeys.begin(),result.spentKeys.end(),floor.pending.semantic)==result.spentKeys.end())result.spentKeys.push_back(floor.pending.semantic);}
};

Store::Store(std::unique_ptr<Data> d):data_(std::move(d)){} Store::~Store()=default;
std::unique_ptr<Store> Store::CreateApprovedTestStore(const std::string& instance,initial_fence::Factory& factory,initial_fence::RootLease& root,initial_fence::FenceLease& fence,Result& result){try{for(const auto& s:durability_pins::kSlots)if(instance==s.instanceId){if(s.fixtureIndex>=std::size(durability_pins::kJournals)||s.fixtureIndex>=std::size(durability_pins::kFixtures)||s.fixtureIndex>=std::size(durability_pins::kLocks)||s.fixtureIndex>=std::size(durability_pins::kRunRoots)||s.fixtureIndex>=std::size(durability_pins::kInstallationIds)||s.fixtureIndex>=std::size(durability_pins::kLineages)||s.fixtureIndex>=std::size(durability_pins::kSelectors))Refuse("missing_original_pins");return std::unique_ptr<Store>(new Store(std::make_unique<Data>(factory,root,fence,s)));}Refuse("unapproved_store_instance");}catch(const Failure& f){result.code=f.code;result.win32Error=f.error;result.unavailable=f.unavailable;}return nullptr;}
Result Store::Inspect(){return Execute(0,{},{});}Result Store::InitializeGenesis(const Cas& c){return Execute(1,c,{});}Result Store::AcquireOwnerEpoch(const Cas& c){return Execute(2,c,{});}Result Store::AppendOnce(const Cas& c,const ClosedRecord& r){return Execute(3,c,r);}Result Store::ReconcilePending(){return Execute(4,{},{});}Result Store::RunPrivateSeamProof(){return Execute(5,{},{});}Result Store::RunPrivateMoveProof(bool destination){return Execute(destination?7:6,{},{});}Result Store::RunPrivateBoundsProof(){return Execute(8,{},{});}
Result Store::Execute(int operation,const Cas& expected,const ClosedRecord& request){auto& d=*data_;if(d.entered){Result r;r.code="store_reentrant";return r;}d.entered=true;d.operation=operation;d.expected=expected;d.request=request;d.result=Result{};d.result.scope=d.scope;
    try{const auto fenced=d.factory.WithLiveFence(d.root,d.fence,*this);if(!fenced.ok){d.result.ok=false;d.result.code=fenced.code;d.result.win32Error=fenced.win32Error;if(d.result.createAttempts)d.unknown=true;}}catch(const Failure& f){d.result.ok=false;d.result.code=f.code;d.result.win32Error=f.error;d.result.unavailable=f.unavailable;if(d.result.createAttempts||d.floor.pending.exists)d.unknown=true;}catch(...){d.entered=false;throw;}d.Fill();d.result.unknown=d.unknown;d.entered=false;return d.result;}
initial_fence::Result Store::Run(initial_fence::InternalFencedIo& io){auto& d=*data_;initial_fence::Result accepted;accepted.ok=true;accepted.code="fenced_store_complete";
    try {
    d.Guard(io,"input");d.Fault("input");Held journal=d.Journal(io);std::vector<Held> witnesses;d.Inventory(journal.Get(),witnesses);
    if(d.operation==5){bool all=true;const auto observed=d.factory.Observe(d.root,d.fence);all&=!d.factory.Release(d.root,d.fence,observed.sessionRef).ok;all&=!d.factory.TryAcquire(d.root,d.fence).ok;all&=!d.factory.Dispose(d.root,d.fence).ok;all&=!d.factory.WithLiveFence(d.root,d.fence,*this).ok;initial_fence::RootLease alternateRoot;initial_fence::FenceLease alternateFence;all&=!d.factory.WithLiveFence(alternateRoot,d.fence,*this).ok;all&=!d.factory.WithLiveFence(d.root,alternateFence,*this).ok;d.result.ok=all;d.result.code=all?"private_seam_checked":"private_seam_failed";return accepted;}
    if(d.operation==6||d.operation==7){
        if(d.operation==6){initial_fence::RootLease movedRoot(std::move(d.root));initial_fence::FenceLease movedFence(std::move(d.fence));}
        else{initial_fence::RootLease emptyRoot;initial_fence::FenceLease emptyFence;d.root=std::move(emptyRoot);d.fence=std::move(emptyFence);}
        d.result.code="active_move_refused";return accepted;
    }
    if(d.operation==8){d.result.ok=!CounterCanAdvance(std::numeric_limits<std::uint64_t>::max())&&!AggregateFits(kAggregateLimit,1)&&AggregateFits(kAggregateLimit-kFrameLimit,kFrameLimit);d.result.code="bounds_unit_checked";d.result.syntheticFault=true;return accepted;}
    d.FloorCheck(d.operation==4);d.Fill();
    if(d.operation==4){if(!d.floor.pending.exists){if(d.pendingAttempted)Refuse("local_pending_without_exact_reconciliation");d.Guard(io,"before_readonly_ack");d.FloorCheck(false);d.result.ok=true;d.result.code="no_pending";d.result.persistence="readback_only";return accepted;}d.Guard(io,"before_reconcile");const std::string reply=d.port.Exchange("reconcile",Hex(d.chain.back().hash));d.floor=DecodeFloor(reply);d.FloorCheck(false);d.Guard(io,"before_readonly_ack");d.FloorCheck(false);d.unknown=false;d.pendingAttempted=false;d.result.ok=true;d.result.code="reconciled";d.result.recordHash=d.chain.back().hash;d.result.persistence="recovered_readback_only";return accepted;}
    if(d.operation==0){d.Guard(io,"before_readonly_ack");d.FloorCheck(false);d.result.ok=true;d.result.code=d.chain.empty()?"unprovisioned":"inspected";d.result.persistence="readback_only";return accepted;}
    if(d.unknown)Refuse("store_unknown_no_replay");
    Frame frame;frame.scope=d.scope;frame.lineage=d.lineage;frame.previous=d.Current().head;frame.sequence=d.Current().sequence+1;frame.epoch=d.Current().epoch;frame.genesis=d.chain.empty()?Digest{}:d.chain.front().hash;frame.owner=d.floor.owner;
    if(d.operation==1){if(!d.chain.empty())Refuse("already_provisioned");if(d.floor.pending.exists||d.floor.sequence||d.floor.epoch||!Zero(d.floor.genesis))Refuse("genesis_precondition_failed");frame.type=RecordType::Genesis;frame.owner={};frame.payload=d.scopeBytes;Put(frame.payload,d.selectors);}
    else if(d.operation==2){if(d.chain.empty()||Zero(d.floor.owner))Refuse("owner_precondition_failed");for(const auto& old:d.chain)if(old.type==RecordType::OwnerEpoch&&old.owner==d.floor.owner)Refuse("acquisition_already_committed");if(!CounterCanAdvance(frame.epoch))Refuse("epoch_overflow");++frame.epoch;frame.type=RecordType::OwnerEpoch;Put(frame.payload,frame.owner);}
    else{if(d.chain.empty()||!frame.epoch||Zero(d.floor.owner)||d.chain.back().owner!=d.floor.owner)Refuse("stale_owner");frame.type=d.request.type;frame.payload=d.Payload(d.request);}
    frame.key=Stable(frame.type,d.scope,d.lineage,frame.type==RecordType::Genesis?Bytes{}:frame.payload,d.Current().epoch);
    for(const auto& old:d.chain)if(old.key==frame.key){if(old.type!=frame.type||old.payload!=frame.payload)Refuse("stable_key_conflict");d.Guard(io,"before_readonly_ack");d.FloorCheck(false);d.result.ok=true;d.result.code="duplicate_readback";d.result.recordHash=old.hash;d.result.consumptionRecorded=old.type==RecordType::Consume;d.result.persistence="readback_only";return accepted;}
    if(!SameCas(d.expected,d.Current()))Refuse("stale_cas");if(!CounterCanAdvance(d.Current().sequence)||frame.sequence>kSlotLimit)Refuse("sequence_limit_or_overflow");d.Semantics(frame);Bytes bytes=Encode(frame);frame=Decode(bytes);
    d.Guard(io,"before_pending");d.Fault("before_pending");d.pendingAttempted=true;if(frame.type==RecordType::Consume&&std::find(d.conservativeKeys.begin(),d.conservativeKeys.end(),frame.key)==d.conservativeKeys.end())d.conservativeKeys.push_back(frame.key);d.floor=DecodeFloor(d.port.Exchange("pending",Hex(bytes.data(),bytes.size())));if(!d.floor.pending.exists||d.floor.pending.hash!=frame.hash||d.floor.pending.slot!=frame.sequence||d.floor.pending.semantic!=frame.key||!SameCas(d.floor.pending.expected,d.Current()))Refuse("pending_registration_mismatch");d.Fault("registered_before_create");
    d.Guard(io,"before_create");++d.result.createAttempts;Held file=Relative(journal.Get(),SlotName(frame.sequence),true,false,true);d.Guard(io,"created_open");d.Fault("unbound_create");const Pin originalCreated=ReadPin(file.Get(),false);d.activeCreatedId=originalCreated.id;d.activeCreatedSequence=frame.sequence;
    d.Guard(io,"before_created_witness");d.floor=DecodeFloor(d.port.Exchange("created",Hex(frame.hash)+" "+Hex(originalCreated.id)));if(!d.floor.pending.exists||d.floor.pending.hash!=frame.hash||!d.floor.pending.createdBound||d.floor.pending.createdId!=originalCreated.id)Refuse("created_slot_observation_mismatch");d.Guard(io,"after_create");d.Fault("after_create");
    d.Guard(io,"before_write");++d.result.writeAttempts;DWORD written=0;const bool partial=d.ConsumeFault()&&std::string(d.slot.crashStage)=="partial";const bool syntheticShort=d.ConsumeFault()&&std::string(d.slot.ioFault)=="synthetic_short_write";d.result.syntheticFault=syntheticShort;const DWORD wanted=static_cast<DWORD>((partial||syntheticShort)?bytes.size()/2:bytes.size());
    const BOOL wrote=WriteFile(file.Get(),bytes.data(),wanted,&written,nullptr);const DWORD writeError=wrote?0:GetLastError();d.result.actualPartialWrite=partial&&wrote&&written==wanted;d.Guard(io,"after_write");if(partial)ExitProcess(73);if(!wrote||written!=bytes.size())Refuse("write_unknown",writeError);d.Fault("full_write");
    d.Guard(io,"before_flush");d.Fault("pre_flush");++d.result.flushAttempts;BOOL flushed=FALSE;DWORD flushError=0;
    if(d.ConsumeFault()&&std::string(d.slot.ioFault)=="invalid_flush_handle"){HANDLE invalid=file.Take();if(!CloseHandle(invalid))std::terminate();flushed=FlushFileBuffers(invalid);flushError=flushed?0:GetLastError();d.result.actualHandleError=true;}
    else if(d.ConsumeFault()&&std::string(d.slot.ioFault)=="synthetic_flush_failure"){d.result.syntheticFault=true;flushError=ERROR_WRITE_FAULT;}
    else{flushed=FlushFileBuffers(file.Get());flushError=flushed?0:GetLastError();}
    d.Guard(io,"after_flush");if(!flushed)Refuse("flush_unknown",flushError);d.Fault("post_flush");
    d.Guard(io,"before_readback");if(d.ConsumeFault()&&std::string(d.slot.ioFault)=="synthetic_readback_failure"){d.result.syntheticFault=true;Refuse("readback_unknown",ERROR_READ_FAULT);}std::uint64_t length=0;const Pin pin=ReadPin(file.Get(),false,&length);if(!SamePin(pin,originalCreated)||length!=bytes.size()||ReadBytes(file.Get(),length)!=bytes)Refuse("readback_unknown");d.Guard(io,"after_readback");d.Fault("pre_ack");
    d.Guard(io,"before_witness");d.floor=DecodeFloor(d.port.Exchange("witness",Hex(frame.hash)+" "+Hex(pin.id)));d.Guard(io,"after_witness");d.Inventory(journal.Get(),witnesses);d.FloorCheck(false);
    d.Guard(io,"before_ack");d.Fault("publication");d.pendingAttempted=false;d.result.ok=true;d.result.code="appended";d.result.recordHash=frame.hash;d.result.consumptionRecorded=frame.type==RecordType::Consume;d.result.persistence="os_flush_ack_and_readback";return accepted;
    } catch(const Failure& failure) {
        // Local journal/file/read witnesses have unwound before the facade exits.
        // Expected backend refusal does not Dispose/reacquire inside the callback.
        d.result.ok=false;d.result.code=failure.code;d.result.win32Error=failure.error;d.result.unavailable=failure.unavailable;
        const bool inputRefusal=failure.code=="stale_cas"||failure.code=="stale_owner"||failure.code=="already_provisioned"||failure.code=="acquisition_already_committed"||failure.code=="owner_precondition_failed"||failure.code=="consume_selector_invalid"||failure.code=="consume_selector_unapproved"||failure.code=="closed_record_extra_fields"||failure.code=="observation_invalid"||failure.code=="observation_unknown_consumption"||failure.code=="normal_append_type_refused";
        if(d.result.createAttempts||d.pendingAttempted||d.floor.pending.exists||(!inputRefusal&&!failure.unavailable))d.unknown=true;
        return accepted;
    }
}
std::string JsonResult(const std::string& operation,const Result& r){std::ostringstream o;o<<"{\"schema\":\"ae-agent.initial-durability-prerequisite.v1\",\"scope\":\"windows_initial_durability_prerequisite\",\"productionAuthority\":false,\"issuerStatus\":\"unavailable\",\"admission\":false,\"replayAllowed\":false,\"mayDispatch\":false,\"operation\":\""<<operation<<"\",\"ok\":"<<(r.ok?"true":"false")<<",\"unknown\":"<<(r.unknown?"true":"false")<<",\"unavailable\":"<<(r.unavailable?"true":"false")<<",\"code\":\""<<r.code<<"\",\"persistence\":\""<<r.persistence<<"\",\"consumptionRecorded\":"<<(r.consumptionRecorded?"true":"false")<<",\"sequence\":\""<<r.current.sequence<<"\",\"epoch\":\""<<r.current.epoch<<"\",\"head\":\""<<Hex(r.current.head)<<"\",\"scopeHash\":\""<<Hex(r.scope)<<"\",\"genesisHash\":\""<<Hex(r.genesis)<<"\",\"lineageId\":\""<<Hex(r.lineage)<<"\",\"ownerId\":\""<<Hex(r.owner)<<"\",\"recordHash\":\""<<Hex(r.recordHash)<<"\",\"createAttempts\":\""<<r.createAttempts<<"\",\"writeAttempts\":\""<<r.writeAttempts<<"\",\"flushAttempts\":\""<<r.flushAttempts<<"\",\"win32Error\":"<<r.win32Error<<",\"syntheticFault\":"<<(r.syntheticFault?"true":"false")<<",\"actualHandleError\":"<<(r.actualHandleError?"true":"false")<<",\"actualPartialWrite\":"<<(r.actualPartialWrite?"true":"false")<<",\"spentKeys\":[";bool first=true;for(const auto& key:r.spentKeys){if(!first)o<<',';first=false;o<<'"'<<Hex(key)<<'"';}o<<"]}";return o.str();}
} // namespace initial_durability
