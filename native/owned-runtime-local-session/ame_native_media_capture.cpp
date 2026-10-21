#include "ame_native_media_capture.h"
#include "ame_native_log_capture.h"
#include <windows.h>
#include <winternl.h>
#include <bcrypt.h>
#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstring>
#include <limits>
#include <string_view>
#include <utility>

namespace local_session::trusted_read {
namespace {
using detail::Held;using detail::Refuse;
using Operation=media_children::Operation;using GuardPhase=media_children::GuardPhase;
constexpr std::size_t kJsonBytes=1048576,kMaximumFrames=8191;
constexpr std::uint64_t kSafeInteger=9007199254740991,kToolBytes=134217728,kJobMs=540000;
constexpr std::array<std::uint64_t,6> kOperationMs{{30000,30000,120000,120000,120000,120000}};
bool Valid(void* handle)noexcept{return handle&&handle!=INVALID_HANDLE_VALUE;}
bool SameText(const std::wstring& a,const std::wstring& b){return CompareStringOrdinal(a.c_str(),static_cast<int>(a.size()),b.c_str(),static_cast<int>(b.size()),TRUE)==CSTR_EQUAL;}
bool Component(const std::wstring& name){return !name.empty()&&name.size()<=255&&name!=L"."&&name!=L".."&&name.back()!=L' '&&name.back()!=L'.'&&
    name.find_first_of(L"\\/:")==std::wstring::npos&&name.find(L'\0')==std::wstring::npos;}
bool Suffix(const std::wstring& name,const wchar_t* suffix,std::size_t count){return name.size()>count&&SameText(name.substr(name.size()-count),suffix);}
std::uint64_t Positive(const capture::Json& value,std::uint64_t maximum=kSafeInteger){
    const auto result=value.Unsigned();if(!result||result>maximum)Refuse("native_media_positive_integer_refused",0,true);return result;
}
std::uint32_t Gcd(std::uint32_t a,std::uint32_t b){while(b){const auto remainder=a%b;a=b;b=remainder;}return a;}
std::pair<std::uint32_t,std::uint32_t> Rational(const capture::Json& value){
    const auto& text=value.Text();const auto slash=text.find('/');
    if(text.empty()||text.size()>21||slash==std::string::npos||!slash||slash+1==text.size()||text.find('/',slash+1)!=std::string::npos)
        Refuse("native_media_exact_rational_refused",0,true);
    std::uint32_t p=0,q=0;const auto first=std::from_chars(text.data(),text.data()+slash,p),second=std::from_chars(text.data()+slash+1,text.data()+text.size(),q);
    if(first.ec!=std::errc{}||first.ptr!=text.data()+slash||second.ec!=std::errc{}||second.ptr!=text.data()+text.size()||!p||!q)
        Refuse("native_media_exact_rational_refused",0,true);
    const auto divisor=Gcd(p,q);return {p/divisor,q/divisor};
}
std::uint32_t Le32(const unsigned char* bytes)noexcept{return static_cast<std::uint32_t>(bytes[0])|(static_cast<std::uint32_t>(bytes[1])<<8)|
    (static_cast<std::uint32_t>(bytes[2])<<16)|(static_cast<std::uint32_t>(bytes[3])<<24);}
void Domain(std::vector<unsigned char>& bytes,std::string_view domain){bytes.insert(bytes.end(),domain.begin(),domain.end());}
void PutDigest(std::vector<unsigned char>& bytes,const Digest& digest){bytes.insert(bytes.end(),digest.begin(),digest.end());}
void PutName(std::vector<unsigned char>& bytes,const std::wstring& name){detail::PutU16(bytes,static_cast<std::uint16_t>(name.size()));for(const auto c:name)detail::PutU16(bytes,static_cast<std::uint16_t>(c));}
// Same original borrowed object, bounded retained buffer, exact synchronous
// position restoration. NativeClient serializes all other HANDLE consumers.
Digest HashHeld(void* handle,std::uint64_t maximum,std::uint64_t deadline){
    std::uint64_t length=0;const auto original=detail::ReadPin(handle,false,&length);
    if(!length||length>maximum)Refuse("native_media_held_hash_bound_refused",0,true);
    LARGE_INTEGER zero{},saved{};if(!SetFilePointerEx(handle,zero,&saved,FILE_CURRENT))Refuse("native_media_original_position_failed",GetLastError(),true);
    BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;DWORD count=0,returned=0;std::vector<unsigned char> object;Digest result{};
    const auto close=[&]()noexcept{if(hash)BCryptDestroyHash(hash);if(algorithm)BCryptCloseAlgorithmProvider(algorithm,0);};
    const auto clock=[&](){if(GetTickCount64()>=deadline)Refuse("native_media_composite_deadline_unknown",WAIT_TIMEOUT,true);};
    try{
        clock();if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0||
            BCryptGetProperty(algorithm,BCRYPT_OBJECT_LENGTH,reinterpret_cast<PUCHAR>(&count),sizeof(count),&returned,0)<0||returned!=sizeof(count)||!count||count>1048576)
            Refuse("native_media_hash_provider_failed",0,true);
        object.resize(count);if(BCryptCreateHash(algorithm,&hash,object.data(),count,nullptr,0,0)<0)Refuse("native_media_hash_create_failed",0,true);
        if(!SetFilePointerEx(handle,zero,nullptr,FILE_BEGIN))Refuse("native_media_original_hash_seek_failed",GetLastError(),true);
        std::array<unsigned char,65536> bytes{};std::uint64_t at=0;
        while(at<length){clock();const auto wanted=static_cast<DWORD>(std::min<std::uint64_t>(bytes.size(),length-at));DWORD read=0;
            if(!ReadFile(handle,bytes.data(),wanted,&read,nullptr)||read!=wanted)Refuse("native_media_original_hash_read_failed",GetLastError(),true);
            if(BCryptHashData(hash,bytes.data(),read,0)<0)Refuse("native_media_hash_update_failed",0,true);at+=read;}
        if(BCryptFinishHash(hash,result.data(),static_cast<ULONG>(result.size()),0)<0)Refuse("native_media_hash_finish_failed",0,true);
        if(!SetFilePointerEx(handle,saved,nullptr,FILE_BEGIN))Refuse("native_media_original_position_restore_failed",GetLastError(),true);
        std::uint64_t after=0;if(!detail::SamePin(detail::ReadPin(handle,false,&after),original)||after!=length)Refuse("native_media_original_hash_identity_changed",0,true);
        clock();close();return result;
    }catch(...){const bool restored=SetFilePointerEx(handle,saved,nullptr,FILE_BEGIN)!=FALSE;close();
        if(!restored)Refuse("native_media_original_position_restore_unknown",GetLastError(),true);throw;}
}
struct RootWitnesses final {
    std::vector<Held> handles;std::vector<ObjectPin> pins;bool complete=false;
    void Open(void* original,const ObjectPin& expected){
        if(!detail::SamePin(detail::ReadPin(original,true),expected)||expected.canonicalPath.size()<=49)Refuse("native_media_root_witness_refused",0,true);
        const auto anchor=expected.canonicalPath.substr(0,49);
        Held root(CreateFileW(anchor.c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        if(!root.Valid()||!SetHandleInformation(root.Get(),HANDLE_FLAG_INHERIT,0))Refuse("native_media_root_anchor_failed",GetLastError(),true);
        const auto rootPin=detail::ReadPin(root.Get(),true);if(rootPin.volumeGuid!=expected.volumeGuid||rootPin.serial!=expected.serial)Refuse("native_media_root_volume_changed",0,true);
        handles.push_back(std::move(root));pins.push_back(rootPin);std::size_t at=49;
        for(;;){const auto next=expected.canonicalPath.find(L'\\',at);const auto component=expected.canonicalPath.substr(at,next==std::wstring::npos?next:next-at);
            if(!Component(component)||handles.size()>32)Refuse("native_media_root_components_refused",0,true);
            Held child=detail::Relative(handles.back().Get(),component,true);const auto pin=detail::ReadPin(child.Get(),true);
            handles.push_back(std::move(child));pins.push_back(pin);if(next==std::wstring::npos)break;at=next+1;}
        if(!detail::SamePin(pins.back(),expected))Refuse("native_media_root_original_join_failed",0,true);complete=true;Fresh(expected);
    }
    void Fresh(const ObjectPin& expected)const{
        if(!complete||handles.empty()||handles.size()!=pins.size())Refuse("native_media_root_witness_incomplete",0,true);
        for(std::size_t i=0;i<handles.size();++i)if(!detail::SamePin(detail::ReadPin(handles[i].Get(),true),pins[i]))Refuse("native_media_root_ancestor_changed",0,true);
        if(!detail::SamePin(detail::ReadPin(handles.back().Get(),true),expected))Refuse("native_media_root_original_changed",0,true);
    }
    bool HeldAny()const noexcept{for(const auto& handle:handles)if(handle.Valid())return true;return false;}
};
} // namespace

struct OriginalMediaCapture::Data final {
    struct Artifact final {Held write,transition,read;bool complete=false;};
    explicit Data(Inputs value):inputs(std::move(value)){facts.code.reserve(128);}
    const Inputs inputs;Facts facts;
    std::array<std::unique_ptr<media_children::OriginalChild>,6> children{};
    std::array<Artifact,3> artifacts{};RootWitnesses root;
    std::array<std::uint64_t,6> operationDeadline{};
    std::uint64_t jobDeadline=0;bool entered=false,unknown=false,failedClose=false,retireEntered=false;
    void Unknown(const char* code,std::uint32_t error=0)noexcept{
        unknown=true;facts.status=Status::Unknown;facts.win32Error=error;facts.encodedFormatHqAlphaVerified=false;
        if(error==WAIT_TIMEOUT)facts.timedOut=true;try{facts.code=code;}catch(...){}
    }
    bool Debt()const noexcept{
        if(failedClose)return true;for(const auto& child:children)if(child&&child->HasOriginalDebt())return true;
        for(const auto& artifact:artifacts)if(artifact.write.Valid()||(!artifact.complete&&(artifact.transition.Valid()||artifact.read.Valid())))return true;
        return !root.complete&&root.HeldAny();
    }
    bool PreviewHeld()const noexcept{
        for(const auto& artifact:artifacts)if(artifact.transition.Valid()||artifact.read.Valid())return true;return root.HeldAny();
    }
    void Clock(Operation operation){const auto index=static_cast<std::size_t>(operation);const auto now=GetTickCount64();
        if(index>=operationDeadline.size()||!facts.enteredOperations[index]||!operationDeadline[index]||now>=operationDeadline[index]||now>=jobDeadline)
            Refuse("native_media_composite_deadline_unknown",WAIT_TIMEOUT,true);}
    static bool Forward(void* context,Operation operation,GuardPhase phase){
        auto& self=*static_cast<Data*>(context);const bool cleanup=phase==GuardPhase::CleanupOriginal||phase==GuardPhase::CleanupPoll;
        if(static_cast<std::size_t>(operation)>=self.children.size())Refuse("native_media_guard_operation_refused",0,true);
        if(!cleanup)self.Clock(operation);
        if(!self.inputs.guard(self.inputs.guardContext,operation,phase))return false;
        if(!cleanup)self.Clock(operation);return true;
    }
    void Guard(Operation operation,GuardPhase phase){if(!Forward(this,operation,phase))Refuse("native_media_original_guard_unknown",0,true);}
    void Validate(){
        if(!Valid(inputs.outputHandle)||!Valid(inputs.outputRootHandle)||!Valid(inputs.ffmpegImageHandle)||!Valid(inputs.ffprobeImageHandle)||!inputs.guard||!inputs.guardContext||
            detail::Zero(inputs.outputHash)||detail::Zero(inputs.outputSelector)||detail::Zero(inputs.ffmpeg.sha256)||detail::Zero(inputs.ffprobe.sha256)||detail::Zero(inputs.session)||
            inputs.slot<1||inputs.slot>2||!inputs.rateNumerator||!inputs.rateDenominator||Gcd(inputs.rateNumerator,inputs.rateDenominator)!=1||
            inputs.frameCount<4||inputs.frameCount>kMaximumFrames||!inputs.width||!inputs.height||inputs.width>8192||inputs.height>8192||
            static_cast<std::uint64_t>(inputs.width)*inputs.height*4>media_pixels::kMaximumRgbaBytes)
            Refuse("native_media_fixed_inputs_refused");
        const auto slash=inputs.outputPin.canonicalPath.find_last_of(L'\\');
        if(slash==std::wstring::npos||!Suffix(inputs.outputPin.canonicalPath.substr(slash+1),L".mov",4)||
            !SameText(inputs.outputPin.canonicalPath.substr(0,slash),inputs.outputRootPin.canonicalPath))Refuse("native_media_fixed_mov_selector_refused");
        for(const auto* tool:{&inputs.ffmpeg,&inputs.ffprobe}){
            if(tool->components.empty()||tool->components.size()>32)Refuse("native_media_fixed_tool_selector_refused");
            for(const auto& component:tool->components)if(!Component(component))Refuse("native_media_fixed_tool_component_refused");
            const auto leaf=tool->pin.canonicalPath.find_last_of(L'\\');const auto expected=tool==&inputs.ffmpeg?L"ffmpeg.exe":L"ffprobe.exe";
            if(leaf==std::wstring::npos||!SameText(tool->components.back(),expected)||!SameText(tool->pin.canonicalPath.substr(leaf+1),expected))Refuse("native_media_fixed_tool_leaf_refused");
        }
        if(inputs.outputHandle==inputs.ffmpegImageHandle||inputs.outputHandle==inputs.ffprobeImageHandle||inputs.ffmpegImageHandle==inputs.ffprobeImageHandle)
            Refuse("native_media_distinct_original_files_refused");
        for(std::size_t i=0;i<3;++i){if(inputs.alphaIndices[i]>=inputs.frameCount||!Component(inputs.previewNames[i])||!Suffix(inputs.previewNames[i],L".png",4))Refuse("native_media_fixed_preview_refused");
            for(std::size_t before=0;before<i;++before)if(inputs.alphaIndices[i]==inputs.alphaIndices[before]||SameText(inputs.previewNames[i],inputs.previewNames[before]))Refuse("native_media_preview_distinctness_refused");}
        for(std::size_t i=0;i<6;++i){if(detail::Zero(inputs.stableChildKeys[i]))Refuse("native_media_stable_child_key_refused");
            for(std::size_t before=0;before<i;++before)if(inputs.stableChildKeys[i]==inputs.stableChildKeys[before])Refuse("native_media_stable_child_key_duplicate");}
    }
    void InputFacts(Operation operation,bool hashes){
        std::uint64_t length=0;if(!detail::SamePin(detail::ReadPin(inputs.outputHandle,false,&length),inputs.outputPin)||!length||
            (facts.outputBytes&&facts.outputBytes!=length)||!detail::SamePin(detail::ReadPin(inputs.outputRootHandle,true),inputs.outputRootPin)||
            !detail::SamePin(detail::ReadPin(inputs.ffmpegImageHandle,false),inputs.ffmpeg.pin)||!detail::SamePin(detail::ReadPin(inputs.ffprobeImageHandle,false),inputs.ffprobe.pin))
            Refuse("native_media_original_inputs_changed",0,true);
        if(!facts.outputBytes)facts.outputBytes=length;if(root.complete)root.Fresh(inputs.outputRootPin);
        if(hashes&&(HashHeld(inputs.outputHandle,std::numeric_limits<std::uint64_t>::max(),operationDeadline[static_cast<std::size_t>(operation)])!=inputs.outputHash||
            HashHeld(inputs.ffmpegImageHandle,kToolBytes,operationDeadline[static_cast<std::size_t>(operation)])!=inputs.ffmpeg.sha256||
            HashHeld(inputs.ffprobeImageHandle,kToolBytes,operationDeadline[static_cast<std::size_t>(operation)])!=inputs.ffprobe.sha256))Refuse("native_media_original_hash_changed",0,true);
        Clock(operation);
    }
    void Boundary(Operation operation){Guard(operation,GuardPhase::FinalReadback);InputFacts(operation,false);Clock(operation);}
    const media_children::OriginalChild::Facts& Child(Operation operation){
        const auto index=static_cast<std::size_t>(operation);if(index>=children.size()||facts.enteredOperations[index])Refuse("native_media_operation_once_refused",0,true);
        const auto now=GetTickCount64();if(now>=jobDeadline||now>std::numeric_limits<std::uint64_t>::max()-kOperationMs[index])Refuse("native_media_composite_deadline_unknown",WAIT_TIMEOUT,true);
        // The same deadline covers child, parser, pixels, PNG, artifact IO and
        // final source read-back. The child's internal clock adds no free time.
        operationDeadline[index]=std::min(jobDeadline,now+kOperationMs[index]);facts.enteredOperations[index]=true;
        media_children::OriginalChild::Inputs child;child.operation=operation;
        child.toolImageHandle=index<2?inputs.ffprobeImageHandle:inputs.ffmpegImageHandle;child.tool=index<2?inputs.ffprobe:inputs.ffmpeg;
        child.outputHandle=inputs.outputHandle;child.outputPin=inputs.outputPin;child.outputHash=inputs.outputHash;child.outputSelector=inputs.outputSelector;
        child.rateNumerator=inputs.rateNumerator;child.rateDenominator=inputs.rateDenominator;child.frameCount=inputs.frameCount;child.width=inputs.width;child.height=inputs.height;
        child.alphaIndex=index<3?0:inputs.alphaIndices[index-3];child.session=inputs.session;child.slot=inputs.slot;child.stableChildKey=inputs.stableChildKeys[index];
        child.guard=Forward;child.guardContext=this;children[index]=std::unique_ptr<media_children::OriginalChild>(new media_children::OriginalChild(std::move(child)));
        facts.childFacts[index]=&children[index]->DispositionFacts();facts.attempted=true;const auto& actual=children[index]->CaptureOnce();
        if(actual.status!=media_children::OriginalChild::Status::Closed||!actual.created||!actual.resumed||!actual.imageMatched||!actual.exitObserved||actual.exitCode||
            !actual.stdoutEof||!actual.stderrEof||actual.stdoutOverflow||actual.stderrOverflow||!actual.closedOriginalHandles||actual.cancelAttempted||children[index]->HasOriginalDebt())
            Refuse("native_media_original_child_not_accepted",actual.win32Error,true);
        Boundary(operation);return actual;
    }
    void Metadata(const media_children::OriginalChild::Facts& child){
        const auto parsed=capture::ParseOriginalJson(child.stdoutBytes,kJsonBytes,2048,12);
        const auto& format=parsed.Field("format"),streams=parsed.Field("streams");
        facts.containerFamily=format.Field("format_name").Text();
        const auto expectedDuration=static_cast<double>(inputs.frameCount)*inputs.rateDenominator/inputs.rateNumerator;
        const auto containerDuration=format.Field("duration").Real();
        // FFmpeg's MOV-compatible demuxer family, never exclusive QuickTime
        // brand attestation. The exact native output selector also has .mov.
        if((facts.containerFamily!="mov"&&facts.containerFamily!="mov,mp4,m4a,3gp,3g2,mj2")||!std::isfinite(expectedDuration)||expectedDuration<=0||
            containerDuration<=0||std::abs(containerDuration-expectedDuration)>0.25||
            streams.kind!=capture::Json::Kind::Array||streams.children.empty()||streams.children.size()>32)Refuse("native_media_mov_stream_inventory_refused",0,true);
        const capture::Json* video=nullptr;std::vector<std::uint64_t> indices;
        for(const auto& stream:streams.children){const auto index=stream.Field("index").Unsigned();if(index>31||std::find(indices.begin(),indices.end(),index)!=indices.end())Refuse("native_media_stream_index_refused",0,true);
            indices.push_back(index);if(stream.Field("codec_type").Text()=="video"){if(video)Refuse("native_media_one_video_required",0,true);video=&stream;}}
        if(!video||video->Field("codec_name").Text()!="dxv"||Positive(video->Field("width"),8192)!=inputs.width||Positive(video->Field("height"),8192)!=inputs.height||
            Positive(video->Field("nb_read_frames"),kMaximumFrames)!=inputs.frameCount||Rational(video->Field("avg_frame_rate"))!=std::make_pair(inputs.rateNumerator,inputs.rateDenominator)||
            Rational(video->Field("r_frame_rate"))!=std::make_pair(inputs.rateNumerator,inputs.rateDenominator))Refuse("native_media_exact_dxv_stream_join_refused",0,true);
        if(const auto* declared=video->Optional("nb_frames")){if(declared->kind!=capture::Json::Kind::String||declared->scalar!="N/A")if(Positive(*declared,kMaximumFrames)!=inputs.frameCount)Refuse("native_media_declared_count_mismatch",0,true);}
        // Reuse the accepted JS duration predicate with its fixed 0.25s bound.
        // Missing/N/A stream duration is supported; no caller tolerance/range.
        // Duration never substitutes for exact counted N and rational p/q.
        if(const auto* duration=video->Optional("duration")){
            if(duration->kind!=capture::Json::Kind::String||duration->scalar!="N/A"){
                const auto actual=duration->Real();if(actual<=0||std::abs(actual-expectedDuration)>0.25)Refuse("native_media_video_duration_mismatch",0,true);}}
        facts.pixelFormat=video->Field("pix_fmt").Text();facts.colorSpace=video->Field("color_space").Text();
        if(facts.pixelFormat.empty()||facts.pixelFormat.size()>64||facts.colorSpace!="ycgco")Refuse("native_media_fixed_yg10_conversion_refused",0,true);
        facts.metadataHash=detail::Hash(child.stdoutBytes);facts.metadataBytes=child.stdoutBytes.size();facts.width=inputs.width;facts.height=inputs.height;
        facts.rateNumerator=inputs.rateNumerator;facts.rateDenominator=inputs.rateDenominator;facts.frameCount=inputs.frameCount;
        Boundary(Operation::Metadata);InputFacts(Operation::Metadata,true);Boundary(Operation::Metadata);facts.metadataVerified=true;
    }
    void Packets(const media_children::OriginalChild::Facts& child){
        if(!facts.metadataVerified)Refuse("native_media_metadata_precedes_packet_binding",0,true);
        const auto parsed=capture::ParseOriginalJson(child.stdoutBytes,kJsonBytes,3*kMaximumFrames+2,12);
        if(parsed.kind!=capture::Json::Kind::Object||parsed.keys.size()!=1||parsed.keys[0]!="packets")Refuse("native_media_packet_only_schema_refused",0,true);
        const auto& array=parsed.Field("packets");if(array.kind!=capture::Json::Kind::Array||array.children.size()!=inputs.frameCount)Refuse("native_media_complete_packet_count_refused",0,true);
        facts.packets.reserve(inputs.frameCount);
        for(const auto& row:array.children){if(row.kind!=capture::Json::Kind::Object||row.keys.size()!=2||!row.Optional("pos")||!row.Optional("size"))Refuse("native_media_packet_fields_refused",0,true);
            PacketFacts packet;packet.position=Positive(row.Field("pos"));packet.bytes=Positive(row.Field("size"));
            if(packet.bytes<13||packet.position>=facts.outputBytes||packet.bytes>facts.outputBytes-packet.position)Refuse("native_media_packet_file_bound_refused",0,true);facts.packets.push_back(packet);}
        std::vector<const PacketFacts*> sorted;sorted.reserve(facts.packets.size());for(const auto& packet:facts.packets)sorted.push_back(&packet);
        std::sort(sorted.begin(),sorted.end(),[](const PacketFacts* a,const PacketFacts* b){return a->position<b->position;});
        std::uint64_t end=0;for(const auto* packet:sorted){if(packet->position<end)Refuse("native_media_packet_overlap_refused",0,true);end=packet->position+packet->bytes;}
        LARGE_INTEGER zero{},saved{};if(!SetFilePointerEx(inputs.outputHandle,zero,&saved,FILE_CURRENT))Refuse("native_media_packet_original_position_failed",GetLastError(),true);
        std::vector<unsigned char> inventory;Domain(inventory,"native.original.dxv3.yg10.packet-inventory.v1");detail::PutPin(inventory,inputs.outputPin);PutDigest(inventory,inputs.outputHash);
        PutDigest(inventory,inputs.outputSelector);PutDigest(inventory,inputs.stableChildKeys[1]);detail::PutU32(inventory,inputs.frameCount);
        try{
            for(auto& packet:facts.packets){Boundary(Operation::Packets);LARGE_INTEGER position{};position.QuadPart=static_cast<LONGLONG>(packet.position);
                if(!SetFilePointerEx(inputs.outputHandle,position,nullptr,FILE_BEGIN))Refuse("native_media_packet_original_seek_failed",GetLastError(),true);
                DWORD read=0;if(!ReadFile(inputs.outputHandle,packet.header.data(),static_cast<DWORD>(packet.header.size()),&read,nullptr)||read!=packet.header.size())Refuse("native_media_packet_header_read_failed",GetLastError(),true);
                // Reviewed FFmpeg n9.0.2 MKBETAG is read LE. Do not replace this
                // integer with ASCII bytes 'YG10': that would reverse the tag.
                if(Le32(packet.header.data())!=0x59473130u||static_cast<int>(packet.header[4])-1!=3||Le32(packet.header.data()+8)!=packet.bytes-12)
                    Refuse("native_media_dxv3_yg10_header_refused",0,true);
                detail::PutU64(inventory,packet.position);detail::PutU64(inventory,packet.bytes);inventory.insert(inventory.end(),packet.header.begin(),packet.header.end());}
            if(!SetFilePointerEx(inputs.outputHandle,saved,nullptr,FILE_BEGIN))Refuse("native_media_packet_original_position_restore_failed",GetLastError(),true);
        }catch(...){if(!SetFilePointerEx(inputs.outputHandle,saved,nullptr,FILE_BEGIN))Refuse("native_media_packet_original_position_restore_unknown",GetLastError(),true);throw;}
        facts.packetJsonHash=detail::Hash(child.stdoutBytes);facts.packetJsonBytes=child.stdoutBytes.size();facts.packetHeadersHash=detail::Hash(inventory);
        Boundary(Operation::Packets);InputFacts(Operation::Packets,true);Boundary(Operation::Packets);facts.packetsVerified=true;
    }
    bool Close(Held& held)noexcept{
        if(failedClose)return false;if(!held.Valid())return true;
        if(!CloseHandle(held.Get())){failedClose=true;Unknown("native_media_original_file_close_unknown",GetLastError());return false;}(void)held.Take();return true;
    }
    void CreateArtifact(std::size_t sample){
        const auto operation=static_cast<Operation>(sample+3);auto& artifact=artifacts[sample];auto& preview=facts.previews[sample];Boundary(operation);
        if(!root.complete){root.Open(inputs.outputRootHandle,inputs.outputRootPin);Boundary(operation);}
        using NtCreate=NTSTATUS(NTAPI*)(PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES,PIO_STATUS_BLOCK,PLARGE_INTEGER,ULONG,ULONG,ULONG,ULONG,PVOID,ULONG);
        using NtError=ULONG(NTAPI*)(NTSTATUS);const HMODULE module=GetModuleHandleW(L"ntdll.dll");const auto createAddress=GetProcAddress(module,"NtCreateFile"),errorAddress=GetProcAddress(module,"RtlNtStatusToDosError");
        NtCreate create=nullptr;NtError error=nullptr;std::memcpy(&create,&createAddress,sizeof(create));std::memcpy(&error,&errorAddress,sizeof(error));
        if(!create||!error)Refuse("native_media_fixed_file_create_api_unavailable",0,true);
        const auto& name=inputs.previewNames[sample];UNICODE_STRING component{};component.Buffer=const_cast<PWSTR>(name.c_str());component.Length=static_cast<USHORT>(name.size()*sizeof(wchar_t));component.MaximumLength=component.Length;
        OBJECT_ATTRIBUTES attributes{};attributes.Length=sizeof(attributes);attributes.RootDirectory=root.handles.back().Get();attributes.ObjectName=&component;attributes.Attributes=0x40;
        IO_STATUS_BLOCK io{};HANDLE original=nullptr;Boundary(operation);
        const NTSTATUS status=create(&original,FILE_READ_DATA|FILE_WRITE_DATA|FILE_READ_ATTRIBUTES|FILE_WRITE_ATTRIBUTES|SYNCHRONIZE,&attributes,&io,nullptr,
            FILE_ATTRIBUTE_NORMAL,FILE_SHARE_READ,2u,0x00200000|0x00000020|0x40u,nullptr,0);
        // Retain the original creation HANDLE before any post-create query.
        // FILE_CREATE is fixed, never OPEN_ALWAYS/TRUNCATE/rewrite/retry.
        artifact.write=Held(original);preview.created=artifact.write.Valid();
        if(status<0||!artifact.write.Valid())Refuse("native_media_preview_original_create_unknown",status<0?error(status):ERROR_INVALID_HANDLE,true);
        if(io.Information!=2u||!SetHandleInformation(artifact.write.Get(),HANDLE_FLAG_INHERIT,0))Refuse("native_media_preview_original_create_receipt_refused",GetLastError(),true);
        std::uint64_t length=0;preview.pin=detail::ReadPin(artifact.write.Get(),false,&length);
        if(length||!SameText(preview.pin.canonicalPath,inputs.outputRootPin.canonicalPath+L"\\"+name))Refuse("native_media_preview_original_empty_join_refused",0,true);
        Boundary(operation);
    }
    void Alpha(std::size_t sample,const media_children::OriginalChild::Facts& child){
        const auto operation=static_cast<Operation>(sample+3);auto& preview=facts.previews[sample];auto& artifact=artifacts[sample];
        if(!facts.metadataVerified||!facts.packetsVerified||!facts.fullDecodeVerified)Refuse("native_media_alpha_binding_preconditions_refused",0,true);
        Boundary(operation);std::vector<unsigned char> png;media_pixels::AlphaFacts pixels;
        if(child.stdoutBytes.size()!=static_cast<std::uint64_t>(inputs.width)*inputs.height*4||!media_pixels::EncodeRgba(child.stdoutBytes,inputs.width,inputs.height,png,pixels)||
            !pixels.transparent||!pixels.foreground||pixels.minimum!=0||!pixels.maximum)Refuse("native_media_exact_alpha_pixels_refused",0,true);
        Boundary(operation);preview.frameIndex=inputs.alphaIndices[sample];preview.name=inputs.previewNames[sample];preview.pixels=pixels;
        preview.rgbaHash=detail::Hash(child.stdoutBytes);preview.hash=detail::Hash(png);preview.bytes=png.size();CreateArtifact(sample);
        for(std::size_t at=0;at<png.size();){Boundary(operation);const auto count=static_cast<DWORD>(std::min<std::size_t>(65536,png.size()-at));DWORD written=0;
            if(!WriteFile(artifact.write.Get(),png.data()+at,count,&written,nullptr)||written!=count)Refuse("native_media_preview_original_write_unknown",GetLastError(),true);at+=written;}
        Boundary(operation);if(!FlushFileBuffers(artifact.write.Get()))Refuse("native_media_preview_original_flush_unknown",GetLastError(),true);preview.flushed=true;Boundary(operation);
        if(!detail::SamePin(detail::ReadPin(artifact.write.Get(),false),preview.pin)||detail::ReadExact(artifact.write.Get(),media_pixels::kMaximumPngBytes)!=png)
            Refuse("native_media_preview_original_bytes_refused",0,true);Boundary(operation);
        FILE_ATTRIBUTE_TAG_INFO tag{};if(!GetFileInformationByHandleEx(artifact.write.Get(),FileAttributeTagInfo,&tag,sizeof(tag)))Refuse("native_media_preview_attributes_failed",GetLastError(),true);
        FILE_BASIC_INFO readonly{};readonly.FileAttributes=(tag.FileAttributes&~FILE_ATTRIBUTE_NORMAL)|FILE_ATTRIBUTE_READONLY;
        Boundary(operation);if(!SetFileInformationByHandle(artifact.write.Get(),FileBasicInfo,&readonly,sizeof(readonly)))Refuse("native_media_preview_readonly_unknown",GetLastError(),true);
        if(!GetFileInformationByHandleEx(artifact.write.Get(),FileAttributeTagInfo,&tag,sizeof(tag))||!(tag.FileAttributes&FILE_ATTRIBUTE_READONLY))Refuse("native_media_preview_readonly_readback_refused",GetLastError(),true);
        preview.readonly=true;Boundary(operation);
        // A read-only named transition witness prevents deletion while closing
        // the original write file object. StableRead then excludes new writers;
        // both exact physical read witnesses survive through Root visual review.
        artifact.transition=detail::Relative(root.handles.back().Get(),preview.name,false);
        if(!detail::SamePin(detail::ReadPin(artifact.transition.Get(),false),preview.pin))Refuse("native_media_preview_named_transition_refused",0,true);
        Boundary(operation);if(!Close(artifact.write))Refuse("native_media_preview_write_close_unknown",facts.win32Error,true);Boundary(operation);
        artifact.read=detail::Relative(root.handles.back().Get(),preview.name,false,false,false,false,true);
        if(!detail::SamePin(detail::ReadPin(artifact.read.Get(),false),preview.pin)||detail::ReadExact(artifact.read.Get(),media_pixels::kMaximumPngBytes)!=png)
            Refuse("native_media_preview_named_bytes_refused",0,true);
        if(!GetFileInformationByHandleEx(artifact.read.Get(),FileAttributeTagInfo,&tag,sizeof(tag))||!(tag.FileAttributes&FILE_ATTRIBUTE_READONLY))Refuse("native_media_preview_named_readonly_refused",GetLastError(),true);
        Boundary(operation);if(HashHeld(artifact.read.Get(),media_pixels::kMaximumPngBytes,operationDeadline[sample+3])!=preview.hash)Refuse("native_media_preview_named_hash_refused",0,true);
        Boundary(operation);InputFacts(operation,true);Boundary(operation);
        std::vector<unsigned char> binding;Domain(binding,"native.original.alpha.preview.v1");binding.insert(binding.end(),inputs.session.begin(),inputs.session.end());detail::PutU16(binding,inputs.slot);
        PutDigest(binding,inputs.stableChildKeys[sample+3]);PutDigest(binding,inputs.outputSelector);detail::PutPin(binding,inputs.outputPin);PutDigest(binding,inputs.outputHash);
        detail::PutPin(binding,inputs.outputRootPin);detail::PutPin(binding,preview.pin);PutDigest(binding,preview.hash);PutDigest(binding,preview.rgbaHash);PutName(binding,preview.name);
        detail::PutU32(binding,preview.frameIndex);detail::PutU32(binding,inputs.width);detail::PutU32(binding,inputs.height);detail::PutU32(binding,child.originalPid);detail::PutU64(binding,child.originalBirth);
        preview.binding=detail::Hash(binding);Boundary(operation);preview.namedReadback=true;preview.originalReadWitnessHeld=true;artifact.complete=true;
    }
    void CloseArtifact(std::size_t sample)noexcept{
        auto& artifact=artifacts[sample];Close(artifact.write);Close(artifact.read);Close(artifact.transition);
        facts.previews[sample].originalReadWitnessHeld=artifact.read.Valid()||artifact.transition.Valid();
    }
    void CloseRoot()noexcept{for(auto& handle:root.handles)Close(handle);}
};

OriginalMediaCapture::OriginalMediaCapture(Inputs inputs):data_(std::make_unique<Data>(std::move(inputs))){}
OriginalMediaCapture::~OriginalMediaCapture(){
    // NativeClient must retain this collector and all borrowed/context lifetimes
    // through debt resolution AND explicit preview retirement. No silent kill,
    // file deletion, witness closure, adoption or release claim from destruction.
    if(data_&&(data_->Debt()||data_->PreviewHeld()))(void)data_.release();
}
const OriginalMediaCapture::Facts& OriginalMediaCapture::DispositionFacts()const noexcept{return data_->facts;}
bool OriginalMediaCapture::HasOriginalDebt()const noexcept{return data_->Debt();}
bool OriginalMediaCapture::HasPreviewWitnesses()const noexcept{return data_->PreviewHeld();}
const OriginalMediaCapture::Facts& OriginalMediaCapture::CaptureOnce()noexcept{
    auto& d=*data_;if(d.entered)return d.facts;d.entered=true;
    try{
        d.Validate();const auto now=GetTickCount64();if(now>std::numeric_limits<std::uint64_t>::max()-kJobMs)Refuse("native_media_job_clock_bound_refused");
        d.facts.issuedMs=now;d.jobDeadline=now+kJobMs;d.facts.outputPin=d.inputs.outputPin;d.facts.outputHash=d.inputs.outputHash;d.facts.outputSelector=d.inputs.outputSelector;
        const auto& metadata=d.Child(Operation::Metadata);d.Metadata(metadata);
        const auto& packets=d.Child(Operation::Packets);d.Packets(packets);
        if(!d.facts.metadataVerified||!d.facts.packetsVerified)Refuse("native_media_decode_preconditions_refused",0,true);
        const auto& decoded=d.Child(Operation::FullDecode);if(!decoded.stdoutBytes.empty())Refuse("native_media_null_decode_stdout_refused",0,true);
        d.Boundary(Operation::FullDecode);d.InputFacts(Operation::FullDecode,true);d.Boundary(Operation::FullDecode);d.facts.fullDecodeVerified=true;
        // FullDecode null CLI yields actual exit0/EOF, not a decodedFrames or
        // progress-end claim. Count N comes from the original Metadata decoder.
        for(std::size_t sample=0;sample<3;++sample){const auto& actual=d.Child(static_cast<Operation>(sample+3));d.Alpha(sample,actual);}
        if(d.Debt())Refuse("native_media_original_debt_remains",0,true);
        d.facts.finishedMs=GetTickCount64();if(d.facts.finishedMs>=d.jobDeadline)Refuse("native_media_composite_deadline_unknown",WAIT_TIMEOUT,true);
        d.facts.status=Status::Closed;d.facts.code="native_media_original_facts_closed";d.facts.encodedFormatHqAlphaVerified=true;
    }catch(const detail::Failure& failure){
        if(!d.facts.attempted&&!failure.unknown){d.facts.status=Status::Refused;d.facts.win32Error=failure.error;try{d.facts.code=failure.code;}catch(...){};}
        else d.Unknown(failure.code.c_str(),failure.error);
    }catch(...){d.Unknown("native_media_original_exception_unknown");}
    return d.facts;
}
const OriginalMediaCapture::Facts& OriginalMediaCapture::PollOriginalForDisposition()noexcept{
    auto& d=*data_;
    try{
        for(auto& child:d.children)if(child&&child->HasOriginalDebt())(void)child->PollOriginalForDisposition();
        if(!d.failedClose){for(std::size_t sample=0;sample<3;++sample)if(!d.artifacts[sample].complete&&
            (d.artifacts[sample].write.Valid()||d.artifacts[sample].read.Valid()||d.artifacts[sample].transition.Valid())){
            d.Guard(static_cast<Operation>(sample+3),GuardPhase::CleanupPoll);d.CloseArtifact(sample);}
            if(!d.root.complete&&d.root.HeldAny()){d.Guard(Operation::Alpha0,GuardPhase::CleanupPoll);d.CloseRoot();}}
    }catch(const detail::Failure& failure){d.Unknown(failure.code.c_str(),failure.error);}
    catch(...){d.Unknown("native_media_original_disposition_unknown");}
    return d.facts;
}
const OriginalMediaCapture::Facts& OriginalMediaCapture::CancelOriginalOnce()noexcept{
    auto& d=*data_;
    for(auto& child:d.children)if(child&&child->HasOriginalDebt()){
        const auto& actual=child->CancelOriginalOnce();if(actual.cancelAttempted||actual.status==media_children::OriginalChild::Status::Unknown)d.Unknown("native_media_original_cancel_disposition_required",actual.win32Error);}
    return d.facts;
}
const OriginalMediaCapture::Facts& OriginalMediaCapture::RetirePreviewWitnessesOnce()noexcept{
    auto& d=*data_;if(d.retireEntered||!d.PreviewHeld())return d.facts;d.retireEntered=true;
    try{
        if(d.Debt())Refuse("native_media_preview_retirement_requires_quiescent_original_io",0,true);
        for(std::size_t sample=0;sample<3;++sample)if(d.artifacts[sample].read.Valid()||d.artifacts[sample].transition.Valid()){
            d.Guard(static_cast<Operation>(sample+3),GuardPhase::CleanupPoll);d.CloseArtifact(sample);if(d.failedClose)return d.facts;}
        if(d.root.HeldAny()){d.Guard(Operation::Alpha0,GuardPhase::CleanupPoll);d.CloseRoot();}
    }catch(const detail::Failure& failure){d.Unknown(failure.code.c_str(),failure.error);}
    catch(...){d.Unknown("native_media_preview_original_retirement_unknown");}
    return d.facts;
}
} // namespace local_session::trusted_read
