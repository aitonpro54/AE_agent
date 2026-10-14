#if !defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || AE_AGENT_PHASE_TRUSTED_READ_PROFILE != 1
#error "Production Node client requires its exact separate reviewed profile."
#endif
#include <node_api.h>
#include "local_session_native_client.h"
#include "local_session_http_node_api.h"
#include "ame_native_log_capture.h"
#include "ame_native_json_limits.h"
#include "owned_preparation_quiescence.h"
#include "owned_title_manifest_capture.h"
#include <array>
#include <algorithm>
#include <string>
#include <cmath>
#include <limits>

namespace local_session::trusted_read {
class NativeExecutionBinding final {
public:
    static std::shared_ptr<Capability> BindFixed(NativeClient& original,const std::shared_ptr<Capability>& handler,const std::string& retainedGetterSource){
        return original.BindReadonlyExecutionFixed(handler,retainedGetterSource);
    }
    static std::shared_ptr<Capability> BindPreparationFixed(NativeClient& original,const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,
        const std::shared_ptr<Capability>& currentRead,const std::string& source){return original.BindPreparationDeliveryFixed(handler,manifest,currentRead,source);}
    static std::shared_ptr<Capability> RestorationProgramFixed(NativeClient& original,const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& copy,const std::string& prefix,const std::string& suffix){return original.CaptureRestorationProgramFixed(gate,copy,prefix,suffix);}
    static std::shared_ptr<Capability> BindRestorationFixed(NativeClient& original,const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& program,const std::string& source){return original.BindRestorationDeliveryFixed(gate,program,source);}
    static std::shared_ptr<Capability> BindStageFixed(NativeClient& original,const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& copy,const std::string& source){return original.BindStageDeliveryFixed(gate,copy,source);}
    static std::shared_ptr<Capability> BindAmeFixed(NativeClient& original,const std::shared_ptr<Capability>& origin,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame,const std::string& source,const std::string& body,bool inspection){return inspection?original.BindAmeSourceInspectionFixed(origin,snapshot,ame,source,body):original.BindAmeDeliveryFixed(origin,snapshot,ame,source,body);}
    static void AmeReservationFixed(NativeClient& original,const std::shared_ptr<Capability>& command,const std::vector<unsigned char>& receipt){original.CaptureOriginalAmeManualReservationFixed(command,receipt);}
    static std::shared_ptr<Capability> CompletionPollFixed(NativeClient& original,const std::shared_ptr<Capability>& job,const std::string& source,const std::string& body){return original.BeginOriginalCompletionPollFixed(job,source,body);}
    static std::shared_ptr<Capability> PreparationResultFixed(NativeClient& original,const std::shared_ptr<Capability>& command,const std::shared_ptr<AuthenticatedRequest>& request,
        const PanelReceipt& result,const std::vector<unsigned char>& proof){return original.CapturePreparationResultFixed(command,request,result,proof);}
    static std::shared_ptr<Capability> PreparationReadFixed(NativeClient& original,const std::shared_ptr<Capability>& terminal){return original.ProjectPreparationReadFixed(terminal);}
    static std::shared_ptr<Capability> PreparationFixed(NativeClient& original,const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,
        const std::shared_ptr<Capability>& currentRead,const std::vector<unsigned char>& retainedGetterProof){return original.CaptureExecutionPreparationFixed(handler,manifest,currentRead,retainedGetterProof);}
    static std::shared_ptr<Capability> GatesFixed(NativeClient& original,const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,
        const std::shared_ptr<Capability>& proposal,const std::shared_ptr<Capability>& dryRun,const std::shared_ptr<Capability>& currentRead,const std::shared_ptr<AuthenticatedRequest>& panelRequest,
        const std::vector<unsigned char>& retainedGetterProof){return original.CaptureServerGatesFixed(handler,manifest,proposal,dryRun,currentRead,panelRequest,retainedGetterProof);}
};
}
namespace {
using namespace local_session;using namespace local_session::trusted_read;
using Bytes=std::vector<unsigned char>;
using capture::kOriginalResultBytes;using capture::kOriginalResultNodes;using capture::kOriginalResultDepth;
constexpr napi_type_tag kCapabilityTag{0x48c996025a6847ceULL,0xb2c446582e65cf1cULL};
constexpr napi_type_tag kRequestTag{0x6517f9755a6a4d92ULL,0xad2876f8b6dc2b34ULL};
enum class Operation:std::uintptr_t{Assert=1,Open,Ensure,Status,BeginPanel,BeginBracket,BeginRead,AdoptBracket,Locator,
    TakeChallenge,CaptureTarget,AssertTarget,NodeInventory,PanelInventory,Transport,LoadedNode,InvalidateSource,Revoke,CapturePreactor,RetainRequest,CompleteResponse,FailResponse,VerifyTool,
    DispositionCurrent,PollEvent,EventKind,AckDisposition,CaptureStatus,BindProject,DescribeProject,SelectProject,GuardProject,SubmitProject,CaptureProjectResult,
    CepInventory,InvalidateCep,CaptureObservation,SubmitObservation,ObserveActor,DaemonTransport,AssertPreactor,ReserveBootstrap,LaunchBootstrap,BootstrapSettled,PreactorInventory,CompleteIdleCleanup,
    BeginExecution,VerifyExecution,CaptureAme,BeginServerOnly,VerifyServerOnly,CaptureServerOnly,
    BindExecution,DescribeExecution,SelectExecution,GuardExecution,SubmitExecution,CaptureExecutionResult,CaptureSelection,DescribeSelection,CaptureManifest,CapturePreparation,CaptureGates,BindPreparationDelivery,AcceptManualAdopt,DeadlineProjection,
    BindStageDelivery,CaptureStageResult,ExecuteCheckpoint,ExecuteCleanCopy,DescribeCheckpoint,DescribeCleanCopy,DescribeSavedSnapshot,ManualPreflight,PreissueRestoration,BindRestorationDelivery,CaptureRestorationResult,DescribeRestorationDebt,BindAmeInspection,BindAmeDelivery,CaptureAmeResult,DescribeAmeCommand,BindOriginalJob,AmeQueueFacts,AssertAmeCommand,CaptureAmeReservation,BeginCompletionPoll,DescribeCompletionPoll,SelectCompletionPoll,CompletionFacts,AbandonCompletionPoll};
struct RequestBox;
struct Instance final {std::shared_ptr<NativeClient> native;std::vector<std::shared_ptr<RequestBox>> requests;napi_ref statusGetter=nullptr,observationGetter=nullptr,quiescenceGetter=nullptr,serverOnlyGetter=nullptr,readonlyScriptGetter=nullptr,preparationGetter=nullptr,executionGateGetter=nullptr,preparationScriptGetter=nullptr,stageScriptGetter=nullptr,restorationProgramGetter=nullptr,restorationScriptGetter=nullptr,ameScriptGetter=nullptr,ameReservationGetter=nullptr;bool pending=false;};
struct RequestBox final {std::shared_ptr<Instance> owner;std::shared_ptr<AuthenticatedRequest> request;std::shared_ptr<Capability> delivery;napi_ref originalRequest=nullptr;bool executionDelivery=false,completionDelivery=false,terminal=false,cleanupAttempted=false,cleanupFailure=false;};
struct RequestObject final {std::shared_ptr<RequestBox> original;};
// HttpTransportBinding owns this original object. Its common HTTP operations
// cannot listen/read/write before the native loaded-source gate has closed.
class HttpOwner final:public HttpTransportOwner {
public:
    explicit HttpOwner(std::shared_ptr<Instance> instance):instance_(std::move(instance)){if(instance_->native->GetRole()==Role::Daemon)instance_->native->BindHttpOwnerFixed(*this);}
    void AssertCurrent()override{if(instance_->native->GetRole()!=Role::Daemon)detail::Refuse("trusted_http_original_daemon_required");instance_->native->AssertLoadedNodeCurrent();}
    std::uint16_t HttpFixedPort()const noexcept override{return instance_->native->HttpFixedPort();}
    bool OriginalCleanupCurrent(HttpCleanupOperation operation)noexcept override{return instance_->native->CheckOriginalHttpCleanup(*this,operation);}
    bool ReadRevokedKnown()const noexcept override{return instance_->native->ReadRevokedKnown();}
    const std::shared_ptr<Instance>& InstanceOwned()const noexcept{return instance_;}
private:std::shared_ptr<Instance> instance_;
};
struct CapBox final {std::shared_ptr<Instance> owner;std::shared_ptr<Capability> cap;};
void Check(napi_status status){if(status!=napi_ok)detail::Refuse("trusted_node_api_refused");}
napi_value Undefined(napi_env env){napi_value value=nullptr;Check(napi_get_undefined(env,&value));return value;}
bool Tagged(napi_env env,napi_value value){bool tagged=false;return value&&napi_check_object_type_tag(env,value,&kCapabilityTag,&tagged)==napi_ok&&tagged;}
std::shared_ptr<Instance> Original(napi_env env,napi_value role){const auto owner=std::dynamic_pointer_cast<HttpOwner>(HttpTransportBinding::Owner(env,role));if(!owner)detail::Refuse("trusted_original_node_instance_required");return owner->InstanceOwned();}
std::shared_ptr<Capability> Cap(napi_env env,napi_value value,const std::shared_ptr<Instance>& owner){void* pointer=nullptr;
    if(!Tagged(env,value)||napi_unwrap(env,value,&pointer)!=napi_ok||!pointer)detail::Refuse("trusted_opaque_node_capability_required");
    const auto& box=*static_cast<CapBox*>(pointer);if(box.owner.get()!=owner.get())detail::Refuse("trusted_foreign_node_capability_refused");return box.cap;
}
napi_value Wrap(napi_env env,const std::shared_ptr<Instance>& owner,std::shared_ptr<Capability> cap){if(!cap)detail::Refuse("trusted_native_capability_missing");
    auto box=std::make_unique<CapBox>();box->owner=owner;box->cap=std::move(cap);napi_value value=nullptr;Check(napi_create_object(env,&value));Check(napi_type_tag_object(env,value,&kCapabilityTag));
    Check(napi_wrap(env,value,box.get(),[](napi_env,void* data,void*){delete static_cast<CapBox*>(data);},nullptr,nullptr));(void)box.release();return value;
}
std::string String(napi_env env,napi_value value,std::size_t maximum){std::size_t count=0;Check(napi_get_value_string_utf8(env,value,nullptr,0,&count));if(count>maximum)detail::Refuse("trusted_node_string_limit");
    std::vector<char> bytes(count+1,0);std::size_t written=0;Check(napi_get_value_string_utf8(env,value,bytes.data(),bytes.size(),&written));if(written!=count)detail::Refuse("trusted_node_string_read");return std::string(bytes.data(),count);
}
Bytes Buffer(napi_env env,napi_value value,std::size_t maximum,bool empty=false){bool isBuffer=false;Check(napi_is_buffer(env,value,&isBuffer));if(!isBuffer)detail::Refuse("trusted_node_original_bytes_required");void* pointer=nullptr;std::size_t count=0;Check(napi_get_buffer_info(env,value,&pointer,&count));if((!empty&&!count)||count>maximum)detail::Refuse("trusted_node_bytes_limit");if(!count)return {};const auto* bytes=static_cast<unsigned char*>(pointer);return Bytes(bytes,bytes+count);}
std::string Utf8(napi_env env,const std::wstring& text){napi_value value=nullptr;Check(napi_create_string_utf16(env,reinterpret_cast<const char16_t*>(text.data()),text.size(),&value));return String(env,value,32760);}
std::string Hex(const Digest& digest){constexpr char digits[]="0123456789abcdef";std::string value;value.reserve(64);for(const auto byte:digest){value+=digits[byte>>4];value+=digits[byte&15];}return value;}
void Property(napi_env env,napi_value object,const char* name,napi_value value){Check(napi_set_named_property(env,object,name,value));}
void Text(napi_env env,napi_value object,const char* name,const std::string& text){napi_value value=nullptr;Check(napi_create_string_utf8(env,text.c_str(),text.size(),&value));Property(env,object,name,value);}
void Number(napi_env env,napi_value object,const char* name,std::uint32_t number){napi_value value=nullptr;Check(napi_create_uint32(env,number,&value));Property(env,object,name,value);}
void Boolean(napi_env env,napi_value object,const char* name,bool flag){napi_value value=nullptr;Check(napi_get_boolean(env,flag,&value));Property(env,object,name,value);}
void SafeNumber(napi_env env,napi_value object,const char* name,std::uint64_t number){if(number>9007199254740991ULL)detail::Refuse("trusted_node_safe_number_refused");
    napi_value value=nullptr;Check(napi_create_double(env,static_cast<double>(number),&value));Property(env,object,name,value);}
napi_value OwnProperty(napi_env env,napi_value object,const char* name){napi_value key=nullptr,value=nullptr;bool present=false;Check(napi_create_string_utf8(env,name,NAPI_AUTO_LENGTH,&key));
    Check(napi_has_own_property(env,object,key,&present));if(!present)detail::Refuse("trusted_loaded_node_field_absent");Check(napi_get_property(env,object,key,&value));return value;}
bool Present(napi_env env,napi_value object,const char* name){napi_value key=nullptr;bool present=false;Check(napi_create_string_utf8(env,name,NAPI_AUTO_LENGTH,&key));Check(napi_has_own_property(env,object,key,&present));return present;}
void ExactKeys(napi_env env,napi_value object,const std::vector<const char*>& wanted){napi_value keys=nullptr;Check(napi_get_all_property_names(env,object,napi_key_own_only,napi_key_all_properties,napi_key_numbers_to_strings,&keys));
    std::uint32_t count=0;Check(napi_get_array_length(env,keys,&count));if(count!=wanted.size())detail::Refuse("trusted_loaded_node_extra_or_missing_field");for(const auto* key:wanted)(void)OwnProperty(env,object,key);}
std::uint32_t Unsigned(napi_env env,napi_value value){double number=0;Check(napi_get_value_double(env,value,&number));if(!std::isfinite(number)||number<0||std::floor(number)!=number||number>std::numeric_limits<std::uint32_t>::max())detail::Refuse("trusted_loaded_node_unsigned_refused");return static_cast<std::uint32_t>(number);}
std::uint64_t SafeUnsigned(napi_env env,napi_value value){double number=0;Check(napi_get_value_double(env,value,&number));if(!std::isfinite(number)||number<0||std::floor(number)!=number||number>9007199254740991.0)detail::Refuse("trusted_actual_safe_number_refused");return static_cast<std::uint64_t>(number);}
bool Flag(napi_env env,napi_value value){bool flag=false;Check(napi_get_value_bool(env,value,&flag));return flag;}
std::u16string Utf16(napi_env env,napi_value value,std::size_t maximum){std::size_t length=0;Check(napi_get_value_string_utf16(env,value,nullptr,0,&length));if(length>maximum)detail::Refuse("trusted_loaded_context_string_limit");
    std::vector<char16_t> bytes(length+1,0);std::size_t written=0;Check(napi_get_value_string_utf16(env,value,bytes.data(),bytes.size(),&written));if(written!=length)detail::Refuse("trusted_loaded_context_string_read");return std::u16string(bytes.data(),length);}
Digest DigestHex(napi_env env,napi_value value){const auto text=String(env,value,64);if(text.size()!=64)detail::Refuse("trusted_loaded_node_hash_required");Digest digest{};
    const auto nibble=[](char c)->unsigned{if(c>='0'&&c<='9')return static_cast<unsigned>(c-'0');if(c>='a'&&c<='f')return static_cast<unsigned>(c-'a'+10);detail::Refuse("trusted_loaded_node_hash_required");};
    for(std::size_t i=0;i<digest.size();++i)digest[i]=static_cast<unsigned char>((nibble(text[i*2])<<4)|nibble(text[i*2+1]));return digest;}
const char* CategoryName(SourceCategory category){switch(category){case SourceCategory::FileDefault:return "FILE_DEFAULT";case SourceCategory::NodeDefault:return "NODE_DEFAULT";case SourceCategory::NodeCompileZero:return "NODE_COMPILE_ZERO";case SourceCategory::InternalThis:return "INTERNAL_THIS";default:detail::Refuse("trusted_loaded_node_category_required");}}
SourceCategory Category(napi_env env,napi_value value){const auto name=String(env,value,32);for(const auto category:{SourceCategory::FileDefault,SourceCategory::NodeDefault,SourceCategory::NodeCompileZero,SourceCategory::InternalThis})if(name==CategoryName(category))return category;detail::Refuse("trusted_loaded_node_category_required");}
const char* SlotName(ContextSlot slot){switch(slot){case ContextSlot::None:return "NONE";case ContextSlot::Default:return "DEFAULT";case ContextSlot::Internal:return "INTERNAL";default:detail::Refuse("trusted_loaded_context_slot_required");}}
ContextSlot Slot(napi_env env,napi_value value){const auto name=String(env,value,16);for(const auto slot:{ContextSlot::None,ContextSlot::Default,ContextSlot::Internal})if(name==SlotName(slot))return slot;detail::Refuse("trusted_loaded_context_slot_required");}
LoadedSource LoadedRecord(napi_env env,napi_value row,std::size_t byteLimit){LoadedSource value;
    std::vector<const char*> keys={"selector","category","contextSlot","scriptId","url","executionContextId","hasSourceURL","isModule","isLiveEdit","scriptLanguage","startLine","startColumn","endLine","endColumn","length","hash","sourceMapURL","embedderName","stackTrace","source"};
    value.scriptAuxPresent=Present(env,row,"executionContextAuxData");value.contextPresent=Present(env,row,"context");if(value.scriptAuxPresent)keys.push_back("executionContextAuxData");if(value.contextPresent)keys.push_back("context");ExactKeys(env,row,keys);
    const auto property=[&](const char* name){return OwnProperty(env,row,name);};const auto selector=Unsigned(env,property("selector"));if(!selector||selector>65535)detail::Refuse("trusted_loaded_node_selector_refused");value.selector=static_cast<std::uint16_t>(selector);
    value.category=Category(env,property("category"));value.contextSlot=Slot(env,property("contextSlot"));value.scriptId=String(env,property("scriptId"),256);value.url=String(env,property("url"),131040);
    value.executionContextId=Unsigned(env,property("executionContextId"));value.hasSourceURL=Flag(env,property("hasSourceURL"));value.isModule=Flag(env,property("isModule"));value.isLiveEdit=Flag(env,property("isLiveEdit"));
    value.scriptLanguage=String(env,property("scriptLanguage"),32);value.startLine=Unsigned(env,property("startLine"));value.startColumn=Unsigned(env,property("startColumn"));value.endLine=Unsigned(env,property("endLine"));value.endColumn=Unsigned(env,property("endColumn"));value.length=Unsigned(env,property("length"));
    value.reportedHash=DigestHex(env,property("hash"));value.sourceMapURL=String(env,property("sourceMapURL"),131040);value.embedderName=String(env,property("embedderName"),131040);value.source=Buffer(env,property("source"),byteLimit);
    if(value.scriptAuxPresent){const auto aux=property("executionContextAuxData");ExactKeys(env,aux,{"isDefault"});value.scriptAuxDefault=Flag(env,OwnProperty(env,aux,"isDefault"));}
    if(value.contextPresent){const auto context=property("context");ExactKeys(env,context,{"id","uniqueId","origin","name","auxData"});value.contextId=Unsigned(env,OwnProperty(env,context,"id"));
        value.contextUniqueId=Utf16(env,OwnProperty(env,context,"uniqueId"),256);value.contextOrigin=Utf16(env,OwnProperty(env,context,"origin"),32760);value.contextName=Utf16(env,OwnProperty(env,context,"name"),32760);
        const auto aux=OwnProperty(env,context,"auxData");ExactKeys(env,aux,{"isDefault"});value.contextAuxDefault=Flag(env,OwnProperty(env,aux,"isDefault"));}
    const auto stack=property("stackTrace");ExactKeys(env,stack,{"callFrames"});const auto frames=OwnProperty(env,stack,"callFrames");bool array=false;Check(napi_is_array(env,frames,&array));std::uint32_t count=0;Check(napi_get_array_length(env,frames,&count));if(!array||count!=1)detail::Refuse("trusted_loaded_node_correlation_frame_required");
    napi_value frame=nullptr;Check(napi_get_element(env,frames,0,&frame));ExactKeys(env,frame,{"functionName","scriptId","url","lineNumber","columnNumber"});value.correlationFunction=String(env,OwnProperty(env,frame,"functionName"),256);value.correlationScriptId=String(env,OwnProperty(env,frame,"scriptId"),256);
    value.correlationUrl=String(env,OwnProperty(env,frame,"url"),32760);value.correlationLine=Unsigned(env,OwnProperty(env,frame,"lineNumber"));value.correlationColumn=Unsigned(env,OwnProperty(env,frame,"columnNumber"));return value;
}
std::shared_ptr<RequestBox> OriginalRequest(napi_env env,napi_value value,const std::shared_ptr<Instance>& owner){bool tag=false;void* pointer=nullptr;
    Check(napi_check_object_type_tag(env,value,&kRequestTag,&tag));if(!tag||napi_unwrap(env,value,&pointer)!=napi_ok||!pointer)detail::Refuse("trusted_actual_request_cap_required");
    auto original=static_cast<RequestObject*>(pointer)->original;if(!original||original->owner.get()!=owner.get()||!original->request||original->terminal)detail::Refuse("trusted_foreign_or_spent_request_cap");return original;
}
napi_value WrapRequest(napi_env env,std::shared_ptr<RequestBox> original){auto wrapper=std::make_unique<RequestObject>();wrapper->original=std::move(original);napi_value value=nullptr;Check(napi_create_object(env,&value));Check(napi_type_tag_object(env,value,&kRequestTag));
    Check(napi_wrap(env,value,wrapper.get(),[](napi_env,void* pointer,void*){delete static_cast<RequestObject*>(pointer);},nullptr,nullptr));(void)wrapper.release();return value;}
std::string Uuid(const Id& id){constexpr char digits[]="0123456789abcdef";std::string value;value.reserve(36);for(std::size_t i=0;i<id.size();++i){if(i==4||i==6||i==8||i==10)value+='-';value+=digits[id[i]>>4];value+=digits[id[i]&15];}return value;}
Id OriginalUuid(napi_env env,napi_value value){const auto text=String(env,value,36);if(text.size()!=36)detail::Refuse("trusted_actual_receipt_uuid_refused");Id id{};std::size_t at=0;
    for(std::size_t i=0;i<16;++i){if(i==4||i==6||i==8||i==10){if(text[at++]!='-')detail::Refuse("trusted_actual_receipt_uuid_refused");}unsigned byte=0;for(unsigned j=0;j<2;++j){const auto c=text[at++];const auto digit=c>='0'&&c<='9'?static_cast<unsigned>(c-'0'):c>='a'&&c<='f'?static_cast<unsigned>(c-'a'+10):16u;if(digit>15)detail::Refuse("trusted_actual_receipt_uuid_refused");byte=(byte<<4)|digit;}id[i]=static_cast<unsigned char>(byte);}if(detail::Zero(id))detail::Refuse("trusted_actual_receipt_uuid_refused");return id;}
napi_value ParseOriginalJson(napi_env env,const Bytes& bytes){if(bytes.empty()||bytes.size()>1048576)detail::Refuse("trusted_actual_json_limit");napi_value global=nullptr,json=nullptr,parse=nullptr,text=nullptr,value=nullptr;
    // Validate these exact retained UTF-8 bytes before JS can collapse duplicate
    // keys or replace malformed code units. Applies to both outer CEP receipts
    // and their embedded wrapped result strings, with independent finite caps.
    (void)capture::ParseOriginalJson(bytes,kOriginalResultBytes,kOriginalResultNodes,kOriginalResultDepth);
    Check(napi_get_global(env,&global));Check(napi_get_named_property(env,global,"JSON",&json));Check(napi_get_named_property(env,json,"parse",&parse));Check(napi_create_string_utf8(env,reinterpret_cast<const char*>(bytes.data()),bytes.size(),&text));Check(napi_call_function(env,json,parse,1,&text,&value));return value;}
Bytes SerializeOriginalJson(napi_env env,napi_value value){napi_value global=nullptr,json=nullptr,stringify=nullptr,serialized=nullptr;Check(napi_get_global(env,&global));Check(napi_get_named_property(env,global,"JSON",&json));Check(napi_get_named_property(env,json,"stringify",&stringify));Check(napi_call_function(env,json,stringify,1,&value,&serialized));const auto text=String(env,serialized,1048576);return Bytes(text.begin(),text.end());}
bool OriginalNull(napi_env env,napi_value value){napi_valuetype type=napi_undefined;Check(napi_typeof(env,value,&type));return type==napi_null;}
void OriginalNullableText(napi_env env,napi_value value,std::size_t maximum){if(!OriginalNull(env,value)){const auto text=String(env,value,maximum);if(text.find('\0')!=std::string::npos)detail::Refuse("trusted_actual_project_text_refused");}}
bool OriginalHasOwn(napi_env env,napi_value value,const char* name){napi_value key=nullptr;Check(napi_create_string_utf8(env,name,NAPI_AUTO_LENGTH,&key));bool present=false;Check(napi_has_own_property(env,value,key,&present));return present;}
double OriginalFinite(napi_env env,napi_value value){double number=0;Check(napi_get_value_double(env,value,&number));if(!std::isfinite(number))detail::Refuse("trusted_actual_read_number_refused");return number;}
std::uint32_t OriginalArrayBound(napi_env env,napi_value value,std::uint32_t maximum){bool array=false;Check(napi_is_array(env,value,&array));if(!array)detail::Refuse("trusted_actual_read_array_required");std::uint32_t count=0;Check(napi_get_array_length(env,value,&count));if(count>maximum)detail::Refuse("trusted_actual_read_array_bound");return count;}
void OriginalIdentity(napi_env env,napi_value value){if(!SafeUnsigned(env,OwnProperty(env,value,"itemId"))||!Unsigned(env,OwnProperty(env,value,"itemIndex"))||String(env,OwnProperty(env,value,"name"),131040).find('\0')!=std::string::npos)detail::Refuse("trusted_actual_read_comp_identity_refused");}
void OriginalLayerIdentity(napi_env env,napi_value value){if(!SafeUnsigned(env,OwnProperty(env,value,"id"))||!Unsigned(env,OwnProperty(env,value,"index"))||String(env,OwnProperty(env,value,"name"),131040).find('\0')!=std::string::npos)detail::Refuse("trusted_actual_read_layer_identity_refused");(void)Flag(env,OwnProperty(env,value,"enabled"));}
void OriginalReadonlyResult(napi_env env,napi_value value,phase::ToolCode tool){
    if((tool==phase::ToolCode::RunAiAgentPlan||tool==phase::ToolCode::InspectAmeTitleSources||tool==phase::ToolCode::InspectAmeTitleQueueManifest)&&String(env,OwnProperty(env,value,"schema"),64)=="ae-agent.owned-native-ame-receipt.v1"){
        ExactKeys(env,value,{"schema","descriptorSha25664","before","after","send"});(void)DigestHex(env,OwnProperty(env,value,"descriptorSha25664"));const auto send=OwnProperty(env,value,"send");ExactKeys(env,send,{"schema","code","requestNonce","callback","responseBody"});
        if(String(env,OwnProperty(env,send,"schema"),64)!="ae-agent-ame-title-send.v1"||String(env,OwnProperty(env,send,"code"),64)!="result"||String(env,OwnProperty(env,send,"callback"),64)!="result")detail::Refuse("trusted_original_ame_send_unknown");(void)OriginalUuid(env,OwnProperty(env,send,"requestNonce"));const auto raw=String(env,OwnProperty(env,send,"responseBody"),524288);(void)capture::ParseOriginalJson(Bytes(raw.begin(),raw.end()),524288,kOriginalResultNodes,kOriginalResultDepth);
        for(const auto* name:{"before","after"}){const auto parsed=capture::ParseOriginalJson(SerializeOriginalJson(env,OwnProperty(env,value,name)),kOriginalResultBytes,kOriginalResultNodes,kOriginalResultDepth);(void)capture::OriginalReadCurrentIdentity(parsed);}return;
    }
    if(tool==phase::ToolCode::RunAiAgentPlan){const bool restore=String(env,OwnProperty(env,value,"schema"),64)=="ae-agent.owned-native-restoration-result.v1";
        if(restore)ExactKeys(env,value,{"schema","operation","slot","sourceProjectFile","before","reopened","after","ui"});else ExactKeys(env,value,{"schema","operation","slot","sourceProjectFile","workingProjectFile","snapshotProjectFile","before","working","postSave"});
        if((!restore&&String(env,OwnProperty(env,value,"schema"),64)!="ae-agent.owned-native-stage-result.v1")||String(env,OwnProperty(env,value,"operation"),16)!=(restore?"restore":"stage")||Unsigned(env,OwnProperty(env,value,"slot"))<1||Unsigned(env,OwnProperty(env,value,"slot"))>2)detail::Refuse("trusted_original_stage_result_scope");
        (void)String(env,OwnProperty(env,value,"sourceProjectFile"),131040);if(!restore)for(const auto* path:{"workingProjectFile","snapshotProjectFile"})(void)String(env,OwnProperty(env,value,path),131040);
        const std::array<const char*,3> records=restore?std::array<const char*,3>{{"before","reopened","after"}}:std::array<const char*,3>{{"before","working","postSave"}};
        for(const auto* name:records){const auto row=OwnProperty(env,value,name);ExactKeys(env,row,{"graph","sourceGuid","selectedTextLayerIds","compItemId","rootCompItemId","projectFile","revision","dirty","uiBaseline"});
            OriginalReadonlyResult(env,OwnProperty(env,row,"graph"),phase::ToolCode::InspectTitleVariants);if(Flag(env,OwnProperty(env,row,"dirty")))detail::Refuse("trusted_original_stage_result_dirty");
            if(!SafeUnsigned(env,OwnProperty(env,row,"compItemId"))||!SafeUnsigned(env,OwnProperty(env,row,"rootCompItemId")))detail::Refuse("trusted_original_stage_result_identity");(void)SafeUnsigned(env,OwnProperty(env,row,"revision"));(void)String(env,OwnProperty(env,row,"projectFile"),131040);
            const auto ids=OwnProperty(env,row,"selectedTextLayerIds");if(OriginalArrayBound(env,ids,2)!=2)detail::Refuse("trusted_original_stage_result_two_ids");for(std::uint32_t i=0;i<2;++i){napi_value id=nullptr;Check(napi_get_element(env,ids,i,&id));if(!SafeUnsigned(env,id))detail::Refuse("trusted_original_stage_result_layer_id");}
            (void)OriginalUuid(env,OwnProperty(env,row,"sourceGuid"));}return;
    }
    if(tool==phase::ToolCode::GetCompDetails){
        const bool dynamic=OriginalHasOwn(env,value,"dynamicLinkGUID");if(dynamic!=OriginalHasOwn(env,value,"project"))detail::Refuse("trusted_actual_read_dynamic_link_pair_refused");
        std::vector<const char*> fields={"itemIndex","itemId","name","type","width","height","pixelAspect","duration","workAreaStart","workAreaDuration","frameRate","displayStartTime","resolutionFactor","displayStartFrame","displayStartFrameSupported","preserveNestedFrameRate","time","bgColor","motionBlur","numLayers","selectedLayerIndices","layersReturned","layersTruncated","markers","layers"};
        if(dynamic){fields.push_back("dynamicLinkGUID");fields.push_back("project");}if(OriginalHasOwn(env,value,"ownedTitleInventory"))fields.push_back("ownedTitleInventory");if(OriginalHasOwn(env,value,"ownedObservedTiming"))fields.push_back("ownedObservedTiming");if(OriginalHasOwn(env,value,"ownedUiBaseline"))fields.push_back("ownedUiBaseline");if(OriginalHasOwn(env,value,"ownedCurrentStageState"))fields.push_back("ownedCurrentStageState");ExactKeys(env,value,fields);
        OriginalIdentity(env,value);if(String(env,OwnProperty(env,value,"type"),16)!="comp"||!Unsigned(env,OwnProperty(env,value,"width"))||!Unsigned(env,OwnProperty(env,value,"height")))detail::Refuse("trusted_actual_read_comp_dimensions_refused");
        for(const char* field:{"pixelAspect","duration","workAreaStart","workAreaDuration","frameRate","displayStartTime","time"})(void)OriginalFinite(env,OwnProperty(env,value,field));
        for(const char* field:{"displayStartFrameSupported","preserveNestedFrameRate","motionBlur","layersTruncated"})(void)Flag(env,OwnProperty(env,value,field));
        const auto layers=OwnProperty(env,value,"layers");const auto count=OriginalArrayBound(env,layers,1000),total=Unsigned(env,OwnProperty(env,value,"numLayers"));
        if(Unsigned(env,OwnProperty(env,value,"layersReturned"))!=count||count>total)detail::Refuse("trusted_actual_read_comp_layer_count_refused");
        for(std::uint32_t i=0;i<count;++i){napi_value layer=nullptr;Check(napi_get_element(env,layers,i,&layer));OriginalLayerIdentity(env,layer);}
        (void)OriginalArrayBound(env,OwnProperty(env,value,"selectedLayerIndices"),1000);if(dynamic)(void)String(env,OwnProperty(env,value,"dynamicLinkGUID"),128);
        return;
    }
    if(tool==phase::ToolCode::GetLayerDetails){
        ExactKeys(env,value,{"comp","layer","transform","camera","text","effects","masks","markers","propertyTree","propertyTreeTruncated","protectedProperties","geometry"});
        const auto comp=OwnProperty(env,value,"comp");ExactKeys(env,comp,{"itemIndex","itemId","name","frameRate","time","numLayers"});OriginalIdentity(env,comp);
        (void)OriginalFinite(env,OwnProperty(env,comp,"frameRate"));(void)OriginalFinite(env,OwnProperty(env,comp,"time"));(void)Unsigned(env,OwnProperty(env,comp,"numLayers"));
        OriginalLayerIdentity(env,OwnProperty(env,value,"layer"));for(const char* field:{"effects","masks","propertyTree","protectedProperties"})(void)OriginalArrayBound(env,OwnProperty(env,value,field),2000);
        const auto markers=OwnProperty(env,value,"markers");ExactKeys(env,markers,{"count","returned","truncated","items"});
        const auto markerCount=OriginalArrayBound(env,OwnProperty(env,markers,"items"),50);if(Unsigned(env,OwnProperty(env,markers,"returned"))!=markerCount||Unsigned(env,OwnProperty(env,markers,"count"))<markerCount)detail::Refuse("trusted_actual_read_layer_marker_count_refused");
        (void)Flag(env,OwnProperty(env,markers,"truncated"));
        (void)Flag(env,OwnProperty(env,value,"propertyTreeTruncated"));return;
    }
    if(tool==phase::ToolCode::InspectTitleVariants){
        std::vector<const char*> fields={"projectFile","revision","rootCompItemId","variantCompItemId","frameDuration","duration","controlled","graph","queue","templates"};
        if(OriginalHasOwn(env,value,"matteDependencies"))fields.push_back("matteDependencies");if(OriginalHasOwn(env,value,"ownedTitleInventories"))fields.push_back("ownedTitleInventories");if(OriginalHasOwn(env,value,"ownedObservedTimings"))fields.push_back("ownedObservedTimings");ExactKeys(env,value,fields);
        const auto file=String(env,OwnProperty(env,value,"projectFile"),131040);if(file.empty()||file.find('\0')!=std::string::npos||!SafeUnsigned(env,OwnProperty(env,value,"rootCompItemId"))||!SafeUnsigned(env,OwnProperty(env,value,"variantCompItemId")))detail::Refuse("trusted_actual_title_snapshot_identity_refused");
        (void)SafeUnsigned(env,OwnProperty(env,value,"revision"));if(OriginalFinite(env,OwnProperty(env,value,"frameDuration"))<=0||OriginalFinite(env,OwnProperty(env,value,"duration"))<=0)detail::Refuse("trusted_actual_title_snapshot_range_refused");
        const auto controlled=OwnProperty(env,value,"controlled"),graph=OwnProperty(env,value,"graph");const auto count=OriginalArrayBound(env,controlled,64);
        if(!count||!OriginalArrayBound(env,graph,100))detail::Refuse("trusted_actual_title_snapshot_graph_empty");
        for(std::uint32_t i=0;i<count;++i){napi_value layer=nullptr;Check(napi_get_element(env,controlled,i,&layer));ExactKeys(env,layer,{"id","index","name","enabled","text"});OriginalLayerIdentity(env,layer);(void)String(env,OwnProperty(env,layer,"text"),131040);}
        (void)OriginalArrayBound(env,OwnProperty(env,value,"queue"),200);const auto templates=OwnProperty(env,value,"templates");ExactKeys(env,templates,{"renderSettings","outputModule","gap"});
        (void)OriginalArrayBound(env,OwnProperty(env,templates,"renderSettings"),1024);(void)OriginalArrayBound(env,OwnProperty(env,templates,"outputModule"),1024);
        if(OriginalHasOwn(env,value,"matteDependencies"))(void)OriginalArrayBound(env,OwnProperty(env,value,"matteDependencies"),1000);
        if(OriginalHasOwn(env,value,"ownedTitleInventories"))(void)OriginalArrayBound(env,OwnProperty(env,value,"ownedTitleInventories"),100);if(OriginalHasOwn(env,value,"ownedObservedTimings"))(void)OriginalArrayBound(env,OwnProperty(env,value,"ownedObservedTimings"),100);return;
    }
    detail::Refuse("trusted_original_readonly_result_tool_refused");
}
PanelReceipt OriginalPanelReceipt(napi_env env,napi_value actual,bool delivery,bool submitted,napi_value* validatedResult=nullptr,phase::ToolCode boundTool=phase::ToolCode::GetProjectInfo){PanelReceipt result;
    if(delivery){if(!Flag(env,OwnProperty(env,actual,"ok")))detail::Refuse("trusted_actual_delivery_response_refused");actual=OwnProperty(env,actual,"command");result.success=true;}
    if(Unsigned(env,OwnProperty(env,actual,"contractVersion"))!=2)detail::Refuse("trusted_actual_receipt_version_refused");
    result.command=OriginalUuid(env,OwnProperty(env,actual,"id"));result.execution=OriginalUuid(env,OwnProperty(env,actual,"executionId"));result.lease=OriginalUuid(env,OwnProperty(env,actual,"leaseId"));
    const auto owner=delivery?OwnProperty(env,actual,"leaseOwner"):actual;
    result.panelConnection=String(env,OwnProperty(env,owner,"panelConnectionId"),256);result.panelGeneration=String(env,OwnProperty(env,owner,"panelGeneration"),256);
    if(result.panelConnection.empty()||result.panelGeneration.empty()||result.panelConnection.find('\0')!=std::string::npos||result.panelGeneration.find('\0')!=std::string::npos)detail::Refuse("trusted_actual_receipt_panel_identity_refused");
    if(delivery){const auto text=String(env,OwnProperty(env,actual,"script"),1048576);result.result=Bytes(text.begin(),text.end());}
    else if(!submitted){result.success=Flag(env,OwnProperty(env,actual,"ok"));if(!result.success)detail::Refuse("trusted_actual_project_result_failed");const auto text=String(env,OwnProperty(env,actual,"result"),1048576);
        const auto wrapper=ParseOriginalJson(env,Bytes(text.begin(),text.end()));ExactKeys(env,wrapper,{"ok","result"});if(!Flag(env,OwnProperty(env,wrapper,"ok")))detail::Refuse("trusted_actual_project_wrapper_failed");const auto project=OwnProperty(env,wrapper,"result");
        if(boundTool!=phase::ToolCode::GetProjectInfo){OriginalReadonlyResult(env,project,boundTool);result.result=SerializeOriginalJson(env,project);if(validatedResult)*validatedResult=project;return result;}
        std::vector<const char*> projectFields={"file","bitsPerChannel","numItems","activeItemName","activeItemType","framesCountType","framesCountTypeValue","framesCountStartFrame","revision","supported"};if(OriginalHasOwn(env,project,"ownedReadCurrent"))projectFields.push_back("ownedReadCurrent");ExactKeys(env,project,projectFields);
        if(OriginalHasOwn(env,project,"ownedReadCurrent")){if(!EmbeddedProfile().execution.enabled||EmbeddedProfile().execution.selectionMode!=TitleSelectionMode::FirstTwoObservedTextStatesV1||EmbeddedProfile().execution.rangeMode!=TitleRangeMode::FullObservedRootRangeV1)detail::Refuse("trusted_actual_c6_production_profile_required");const auto envelope=OwnProperty(env,project,"ownedReadCurrent");ExactKeys(env,envelope,{"schema","state"});if(String(env,OwnProperty(env,envelope,"schema"),64)!="ae-agent.owned-read-current.v1")detail::Refuse("trusted_actual_c6_current_schema");const auto state=OwnProperty(env,envelope,"state");ExactKeys(env,state,{"graph","sourceGuid","selectedTextLayerIds","compItemId","rootCompItemId","projectFile","revision","dirty","uiBaseline"});OriginalReadonlyResult(env,OwnProperty(env,state,"graph"),phase::ToolCode::InspectTitleVariants);(void)OriginalUuid(env,OwnProperty(env,state,"sourceGuid"));
            (void)capture::OriginalReadCurrentIdentity(capture::ParseOriginalJson(SerializeOriginalJson(env,state),kOriginalResultBytes,kOriginalResultNodes,kOriginalResultDepth));
            if(Flag(env,OwnProperty(env,state,"dirty")))detail::Refuse("trusted_actual_c6_current_dirty");if(String(env,OwnProperty(env,project,"file"),131040)!=String(env,OwnProperty(env,state,"projectFile"),131040)||SafeUnsigned(env,OwnProperty(env,project,"revision"))!=SafeUnsigned(env,OwnProperty(env,state,"revision")))detail::Refuse("trusted_actual_c6_basic_current_join");}
        (void)Unsigned(env,OwnProperty(env,project,"numItems"));OriginalNullableText(env,OwnProperty(env,project,"file"),131040);
        OriginalNullableText(env,OwnProperty(env,project,"activeItemName"),1048576);OriginalNullableText(env,OwnProperty(env,project,"activeItemType"),1024);
        OriginalNullableText(env,OwnProperty(env,project,"framesCountType"),64);OriginalNullableText(env,OwnProperty(env,project,"framesCountTypeValue"),64);
        const auto bits=OwnProperty(env,project,"bitsPerChannel");if(!OriginalNull(env,bits)){const auto number=Unsigned(env,bits);if(number!=8&&number!=16&&number!=32)detail::Refuse("trusted_actual_project_bpc_refused");}
        const auto start=OwnProperty(env,project,"framesCountStartFrame");if(!OriginalNull(env,start)&&Unsigned(env,start)>1)detail::Refuse("trusted_actual_project_start_frame_refused");
        const auto support=OwnProperty(env,project,"supported");ExactKeys(env,support,{"revision"});const bool supported=Flag(env,OwnProperty(env,support,"revision"));const auto revision=OwnProperty(env,project,"revision");
        if(supported){(void)SafeUnsigned(env,revision);}else if(!OriginalNull(env,revision))detail::Refuse("trusted_actual_project_revision_refused");
        result.result=SerializeOriginalJson(env,project);if(validatedResult)*validatedResult=project;}
    return result;}
HttpRequestFields RequestFields(napi_env env,napi_value request,napi_value body){HttpRequestFields fields;
    fields.parserComplete=Flag(env,OwnProperty(env,request,"complete"));fields.aborted=Flag(env,OwnProperty(env,request,"aborted"));
    if(!fields.parserComplete||fields.aborted)detail::Refuse("trusted_actual_http_parser_completion_required");
    fields.method=String(env,OwnProperty(env,request,"method"),16);fields.url=String(env,OwnProperty(env,request,"url"),8192);fields.body=Buffer(env,body,1048576,true);
    const auto headers=OwnProperty(env,request,"rawHeaders");bool array=false;Check(napi_is_array(env,headers,&array));if(!array)detail::Refuse("trusted_actual_http_headers_required");std::uint32_t count=0;Check(napi_get_array_length(env,headers,&count));if(!count||(count&1u)||count>128)detail::Refuse("trusted_actual_http_headers_limit");
    std::map<std::string,std::string> actual;for(std::uint32_t i=0;i<count;i+=2){napi_value name=nullptr,value=nullptr;Check(napi_get_element(env,headers,i,&name));Check(napi_get_element(env,headers,i+1,&value));auto key=String(env,name,256);const auto text=String(env,value,8192);
        for(auto& c:key){if(c>='A'&&c<='Z')c=static_cast<char>(c-'A'+'a');else if(!((c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'))detail::Refuse("trusted_actual_http_header_name_refused");}
        if(key.empty()||text.find_first_of("\r\n")!=std::string::npos||text.find('\0')!=std::string::npos||!actual.emplace(key,text).second)detail::Refuse("trusted_actual_http_duplicate_header_refused");}
    const auto header=[&](const char* name){const auto found=actual.find(name);return found==actual.end()?std::string{}:found->second;};
    fields.host=header("host");fields.origin=header("origin");fields.originPresent=actual.find("origin")!=actual.end();fields.token=header("x-ae-bridge-token");fields.adapter=header("x-ae-mcp-adapter");fields.toolLocatorHex=header("x-ae-initial-call");
    if(fields.method=="GET"&&(fields.url.substr(0,13)=="/bridge/next?"||fields.url.substr(0,18)=="/bridge/heartbeat?")){napi_value global=nullptr,constructor=nullptr,url=nullptr,location=nullptr,base=nullptr;Check(napi_get_global(env,&global));Check(napi_get_named_property(env,global,"URL",&constructor));
        Check(napi_create_string_utf8(env,fields.url.c_str(),fields.url.size(),&location));Check(napi_create_string_utf8(env,"http://127.0.0.1:3456",NAPI_AUTO_LENGTH,&base));const napi_value arguments[]={location,base};Check(napi_new_instance(env,constructor,2,arguments,&url));napi_value parameters=nullptr,getAll=nullptr;Check(napi_get_named_property(env,url,"searchParams",&parameters));Check(napi_get_named_property(env,parameters,"getAll",&getAll));
        const auto query=[&](const char* key){napi_value name=nullptr,values=nullptr;Check(napi_create_string_utf8(env,key,NAPI_AUTO_LENGTH,&name));Check(napi_call_function(env,parameters,getAll,1,&name,&values));std::uint32_t length=0;Check(napi_get_array_length(env,values,&length));if(length!=1)detail::Refuse("trusted_actual_panel_query_identity_required");napi_value value=nullptr;Check(napi_get_element(env,values,0,&value));return String(env,value,256);};
        fields.panelConnection=query("panelConnectionId");fields.panelGeneration=query("panelGeneration");fields.panelInstance=query("panelInstanceId");const auto epoch=query("panelLifecycleEpoch");
        if(epoch.empty()||epoch.size()>16)detail::Refuse("trusted_actual_panel_epoch_refused");for(const auto digit:epoch){if(digit<'0'||digit>'9'||fields.panelEpoch>(9007199254740991ULL-static_cast<unsigned>(digit-'0'))/10)detail::Refuse("trusted_actual_panel_epoch_refused");fields.panelEpoch=fields.panelEpoch*10+static_cast<unsigned>(digit-'0');}}
    return fields;
}
napi_value Error(napi_env env,const std::string& code,bool unknown){napi_value message=nullptr,error=nullptr;Check(napi_create_string_utf8(env,code.c_str(),code.size(),&message));Check(napi_create_error(env,nullptr,message,&error));Property(env,error,"code",message);Boolean(env,error,"unknown",unknown);return error;}
napi_value Summary(napi_env env,const phase::Frame& frame){napi_value value=nullptr;Check(napi_create_object(env,&value));Text(env,value,"schema",std::string(phase::kSchema));
    Text(env,value,"authorityMode","local_controller_session");Boolean(env,value,"genuineChatIdentity",false);Boolean(env,value,"replayAllowed",false);
    if(frame.header.verb==phase::Verb::Status||frame.header.verb==phase::Verb::Revoke){Number(env,value,"state",static_cast<std::uint32_t>(frame.payload[0]|(static_cast<unsigned>(frame.payload[1])<<8)));}
    Number(env,value,"operation",static_cast<std::uint32_t>(frame.header.verb));return value;
}
phase::ToolCode Tool(napi_env env,napi_value value,bool panel=false){const auto name=String(env,value,64);if(name=="get_bridge_status")return phase::ToolCode::GetBridgeStatus;if(name=="get_project_info")return phase::ToolCode::GetProjectInfo;if(panel&&name=="ensure_ae_agent_panel")return phase::ToolCode::EnsureAgentPanel;detail::Refuse("trusted_exact_read_tool_required");}
phase::ToolCode ExecutionTool(napi_env env,napi_value value){const auto name=String(env,value,64);
    for(std::uint16_t code=8;code<=17;++code){const auto tool=static_cast<phase::ToolCode>(code);const auto* fixed=phase::FindTool(tool);
        if(fixed&&fixed->exactName==name)return tool;}detail::Refuse("trusted_exact_execution_tool_required");}
phase::ToolCode ServerOnlyTool(napi_env env,napi_value value){const auto name=String(env,value,64);if(name=="search_solutions")return phase::ToolCode::SearchSolutions;
    if(name=="get_solution")return phase::ToolCode::GetSolution;detail::Refuse("trusted_exact_server_only_tool_required");}
void CheckExecutionBody(const Bytes& bytes,phase::ToolCode tool){const auto parsed=capture::ParseOriginalJson(bytes,1048576,4096);const auto* fixed=phase::FindTool(tool);
    if(!fixed||parsed.kind!=capture::Json::Kind::Object||parsed.keys!=std::vector<std::string>{"args","name"}||
        parsed.Field("name").Text()!=fixed->exactName||parsed.Field("args").kind!=capture::Json::Kind::Object)detail::Refuse("trusted_execution_canonical_object_required");}
ExecutionIntent ParseExecutionIntent(napi_env env,napi_value value){ExactKeys(env,value,{"name","kind","slot","leaf","canonicalBody"});ExecutionIntent intent;
    intent.tool=ExecutionTool(env,OwnProperty(env,value,"name"));const auto kind=Unsigned(env,OwnProperty(env,value,"kind")),slot=Unsigned(env,OwnProperty(env,value,"slot")),leaf=Unsigned(env,OwnProperty(env,value,"leaf"));
    if(kind<5||kind>6||slot>2||!((leaf>=4&&leaf<=8)||leaf==14||leaf==15))detail::Refuse("trusted_execution_intent_selector_refused");
    intent.kind=static_cast<phase::CallKind>(kind);intent.slot=static_cast<std::uint16_t>(slot);intent.leaf=static_cast<ExecutionLeaf>(leaf);
    if(!FixedExecutionIntentAllowed(intent.tool,intent.kind,intent.slot,intent.leaf))detail::Refuse("trusted_execution_tool_scope_refused");
    intent.canonicalBody=Buffer(env,OwnProperty(env,value,"canonicalBody"),1048576,true);CheckExecutionBody(intent.canonicalBody,intent.tool);return intent;}
struct Work final {std::shared_ptr<Instance> owner;Operation operation;std::shared_ptr<Capability> input,second,output;phase::ToolCode tool=phase::ToolCode::GetBridgeStatus;phase::Frame frame{};
    ExecutionIntent intent;Bytes canonicalBody;napi_async_work work=nullptr;napi_deferred deferred=nullptr;std::string error;bool unknown=false;};
void Execute(napi_env,void* pointer){auto& work=*static_cast<Work*>(pointer);try{auto& client=*work.owner->native;switch(work.operation){
    case Operation::Open:work.frame=client.Open();break;case Operation::Ensure:work.frame=client.Ensure();break;case Operation::Status:work.frame=client.Status();break;
    case Operation::BeginPanel:work.output=client.BeginPanel();break;case Operation::BeginBracket:work.output=client.BeginBracket();break;
    case Operation::BeginRead:work.output=client.BeginRead(work.tool,work.input);break;case Operation::AdoptBracket:work.output=client.AdoptBracket(work.input);break;
    case Operation::BeginExecution:work.output=client.BeginExecutionFixed(work.intent,work.input);break;
    case Operation::BeginServerOnly:work.output=client.BeginServerOnlyFixed(work.tool,work.canonicalBody);break;
    case Operation::TakeChallenge:work.output=client.TakeChallenge(work.input);break;case Operation::CaptureTarget:work.output=client.CaptureOriginalAeCepFixed();break;
    case Operation::CapturePreactor:work.output=client.CaptureOriginalAeFixed();break;
    case Operation::CaptureAme:work.output=client.CaptureOriginalAmeFixed();break;
    case Operation::ExecuteCheckpoint:work.output=client.ExecuteOwnedCheckpointFixed(work.input);break;
    case Operation::ExecuteCleanCopy:work.output=client.ExecuteOwnedCleanCopyFixed(work.input);break;
    case Operation::BindOriginalJob:work.output=client.BindOriginalJobFixed(work.input);break;
    case Operation::LaunchBootstrap:client.LaunchPanelBootstrapFixed(work.input,work.second);break;
    case Operation::SubmitObservation:work.output=client.SubmitObservation(work.input,work.second);break;
    case Operation::ObserveActor:work.output=client.ObserveActor(work.input,work.second);break;
    case Operation::AckDisposition:client.AcknowledgeOriginalDisposition(work.input);break;
    case Operation::Revoke:client.RevokeOnce();if(client.Unknown())detail::Refuse("trusted_original_revoke_unknown",0,true);break;
    default:detail::Refuse("trusted_node_async_operation_refused");}
    if(work.operation==Operation::AckDisposition)client.AssertOriginalDispositionCurrent();
    else if(work.operation!=Operation::Revoke){client.AssertCurrent();if(work.output&&work.operation!=Operation::SubmitObservation)client.AssertCapabilityCurrent(work.output);}
    }catch(const detail::Failure& failure){work.error=failure.code;work.unknown=failure.unknown;}catch(...){work.error="trusted_node_async_unknown";work.unknown=true;}}
void Complete(napi_env env,napi_status status,void* pointer){std::unique_ptr<Work> work(static_cast<Work*>(pointer));work->owner->pending=false;
    try{if(status!=napi_ok&&work->error.empty()){work->error="trusted_node_async_cancelled_unknown";work->unknown=true;}
        if(work->error.empty()&&work->operation==Operation::AckDisposition)work->owner->native->AssertOriginalDispositionCurrent();
        else if(work->error.empty()&&work->operation!=Operation::Revoke){work->owner->native->AssertCurrent();if(work->output&&work->operation!=Operation::SubmitObservation)work->owner->native->AssertCapabilityCurrent(work->output);}
        if(!work->error.empty())Check(napi_reject_deferred(env,work->deferred,Error(env,work->error,work->unknown)));
        else Check(napi_resolve_deferred(env,work->deferred,work->output?Wrap(env,work->owner,work->output):work->operation==Operation::Revoke||work->operation==Operation::AckDisposition||work->operation==Operation::LaunchBootstrap?Undefined(env):Summary(env,work->frame)));
    }catch(const detail::Failure& failure){napi_reject_deferred(env,work->deferred,Error(env,failure.code,failure.unknown));}
    catch(...){napi_reject_deferred(env,work->deferred,Error(env,"trusted_node_completion_unknown",true));}napi_delete_async_work(env,work->work);
}
napi_value Async(napi_env env,std::unique_ptr<Work> work){if(work->owner->pending)detail::Refuse("trusted_node_serial_operation_required");work->owner->pending=true;
    napi_value promise=nullptr,name=nullptr;try{Check(napi_create_promise(env,&work->deferred,&promise));Check(napi_create_string_utf8(env,"owned-original-native",NAPI_AUTO_LENGTH,&name));
        Check(napi_create_async_work(env,nullptr,name,Execute,Complete,work.get(),&work->work));Check(napi_queue_async_work(env,work->work));(void)work.release();return promise;
    }catch(...){work->owner->pending=false;if(work->work)napi_delete_async_work(env,work->work);throw;}}
bool Null(napi_env env,napi_value value){napi_valuetype type=napi_undefined;Check(napi_typeof(env,value,&type));return type==napi_null;}
void EmptyArray(napi_env env,napi_value value){bool array=false;Check(napi_is_array(env,value,&array));std::uint32_t count=0;if(!array)detail::Refuse("trusted_actual_empty_inventory_required");Check(napi_get_array_length(env,value,&count));if(count)detail::Refuse("trusted_actual_inventory_not_idle");}
void SameOriginalProposalPins(napi_env env,napi_value actual,napi_value expected){
    ExactKeys(env,actual,{"instanceId","revision","actionId","requestId","actionKind","payloadRef","payloadHash","previewHash","projectFile","expiresAt","riskLevel","riskPolicyVersion","surface","sessionId"});
    ExactKeys(env,expected,{"instanceId","revision","actionId","requestId","actionKind","payloadRef","payloadHash","previewHash","projectFile","expiresAt","riskLevel","riskPolicyVersion","surface","sessionId"});
    const auto observed=capture::ParseOriginalJson(SerializeOriginalJson(env,actual),1048576,4096),original=capture::ParseOriginalJson(SerializeOriginalJson(env,expected),1048576,4096);
    if(!capture::OriginalProposalPinsEqual(observed,original))detail::Refuse("trusted_actual_foreign_or_stale_proposal_pins");
}
Bytes DaemonQuiescence(napi_env env,const std::shared_ptr<Instance>& owner,napi_value expectedPins=nullptr,bool completedHistory=false){if(!owner->quiescenceGetter)detail::Refuse("trusted_fixed_quiescence_getter_required");owner->native->AssertLoadedNodeCurrent();
    owner->native->AssertBootstrapSettled();
    napi_value global=nullptr,getter=nullptr,result=nullptr;Check(napi_get_global(env,&global));Check(napi_get_reference_value(env,owner->quiescenceGetter,&getter));Check(napi_call_function(env,global,getter,0,nullptr,&result));
    ExactKeys(env,result,{"schema","pendingCommands","inflightCommands","editSessions","lifecyclePending","lifecycleBlocked","proposals","proposalPins","bootstrapPending","nativeExecuting","cleanupPending","childrenPending","restorationDebt"});
    if(String(env,OwnProperty(env,result,"schema"),64)!="ae-agent.owned-initial-private-quiescence.v1"||Flag(env,OwnProperty(env,result,"lifecycleBlocked")))detail::Refuse("trusted_actual_daemon_quiescence_refused");
    for(const auto* key:{"pendingCommands","inflightCommands","editSessions","lifecyclePending","bootstrapPending","nativeExecuting","cleanupPending","childrenPending"})if(Unsigned(env,OwnProperty(env,result,key)))detail::Refuse("trusted_actual_daemon_not_quiescent");
    if(SerializeOriginalJson(env,OwnProperty(env,result,"restorationDebt"))!=SerializeOriginalJson(env,ParseOriginalJson(env,owner->native->RestorationDebtFactsFixed())))detail::Refuse("trusted_actual_restoration_debt_facts_mismatch");
    const auto count=Unsigned(env,OwnProperty(env,result,"proposals"));const auto pins=capture::ParseOriginalJson(SerializeOriginalJson(env,OwnProperty(env,result,"proposalPins")),1048576,4096);
    capture::Json original;if(expectedPins)original=capture::ParseOriginalJson(SerializeOriginalJson(env,expectedPins),1048576,4096);
    if(completedHistory?(!expectedPins||!capture::CompletedProposalQuiescenceMatches(count,pins,original)):!capture::PreparationProposalQuiescenceMatches(count,pins,expectedPins?&original:nullptr))detail::Refuse("trusted_actual_preparation_proposal_count_or_pins");
    owner->native->AssertLoadedNodeCurrent();return SerializeOriginalJson(env,result);
}
void PanelQuiescence(napi_env env,napi_value state,CepCapture& capture,napi_value expectedPins=nullptr){
    if(String(env,OwnProperty(env,state,"protocolVersion"),64)!="ae-agent.panel-actions.v1"||Flag(env,OwnProperty(env,state,"busy"))||Flag(env,OwnProperty(env,state,"reconciliationRequired"))||
        String(env,OwnProperty(env,state,"actionStorage"),32)!="ready"||!Null(env,OwnProperty(env,state,"activeAction"))||!Null(env,OwnProperty(env,state,"recoveryTransport")))detail::Refuse("trusted_actual_panel_not_quiescent");
    EmptyArray(env,OwnProperty(env,state,"unresolvedActions"));
    for(const auto* key:{"humanSettlementLookupPending","ameFixtureDispositionLookupPending","nativeFixtureAbandonmentLookupPending","nativeFixtureAdmissionRefusalLookupPending"})if(Flag(env,OwnProperty(env,state,key)))detail::Refuse("trusted_actual_panel_lookup_pending");
    if(Flag(env,OwnProperty(env,OwnProperty(env,state,"trustedGuardRefresh"),"pending"))||Flag(env,OwnProperty(env,OwnProperty(env,state,"chat"),"inFlight"))||Flag(env,OwnProperty(env,OwnProperty(env,state,"usage"),"inFlight")))detail::Refuse("trusted_actual_panel_native_control_pending");
    capture.panelInstance=String(env,OwnProperty(env,state,"panelInstanceId"),256);capture.panelGeneration=String(env,OwnProperty(env,state,"panelGeneration"),256);capture.panelEpoch=SafeUnsigned(env,OwnProperty(env,state,"panelLifecycleEpoch"));
    capture.panelConnection=String(env,OwnProperty(env,OwnProperty(env,state,"bridgeConnection"),"panelConnectionId"),256);
    // Local CEP routing selector from the same actual before/after snapshot.
    // It is not a human/chat identity attestation and is never read from adopt.
    const auto chat=OwnProperty(env,state,"chat");if(Present(env,chat,"sessionId")&&!Null(env,OwnProperty(env,chat,"sessionId")))capture.panelChatSession=String(env,OwnProperty(env,chat,"sessionId"),256);
    if(!Flag(env,OwnProperty(env,state,"running"))||!Flag(env,OwnProperty(env,state,"connected"))||capture.panelInstance.empty()||capture.panelGeneration.empty()||capture.panelConnection.empty())detail::Refuse("trusted_actual_panel_connection_required");
    const auto plan=OwnProperty(env,state,"plan");if(Present(env,plan,"pins")&&!Null(env,OwnProperty(env,plan,"pins"))){
        if(!expectedPins)detail::Refuse("trusted_actual_panel_proposal_present");SameOriginalProposalPins(env,OwnProperty(env,plan,"pins"),expectedPins);}
}
LoadedCepSource CepRecord(napi_env env,napi_value row,const CepSource& fixed){LoadedCepSource value;ExactKeys(env,row,{"selector","scriptId","url","executionContextId","startLine","startColumn","endLine","endColumn","length","hasSourceURL","isModule","isLiveEdit","sourceMapURL","source"});
    const auto selector=Unsigned(env,OwnProperty(env,row,"selector"));if(!selector||selector>65535)detail::Refuse("trusted_actual_cep_selector_refused");value.selector=static_cast<std::uint16_t>(selector);value.scriptId=String(env,OwnProperty(env,row,"scriptId"),128);value.url=String(env,OwnProperty(env,row,"url"),131040);
    value.contextId=Unsigned(env,OwnProperty(env,row,"executionContextId"));value.startLine=Unsigned(env,OwnProperty(env,row,"startLine"));value.startColumn=Unsigned(env,OwnProperty(env,row,"startColumn"));value.endLine=Unsigned(env,OwnProperty(env,row,"endLine"));value.endColumn=Unsigned(env,OwnProperty(env,row,"endColumn"));value.length=Unsigned(env,OwnProperty(env,row,"length"));
    value.hasSourceURL=Flag(env,OwnProperty(env,row,"hasSourceURL"));value.isModule=Flag(env,OwnProperty(env,row,"isModule"));value.isLiveEdit=Flag(env,OwnProperty(env,row,"isLiveEdit"));value.sourceMapURL=String(env,OwnProperty(env,row,"sourceMapURL"),131040);value.source=Buffer(env,OwnProperty(env,row,"source"),static_cast<std::size_t>(fixed.utf8ByteLength));return value;}
struct CaptureWork final {std::shared_ptr<Instance> owner;std::shared_ptr<Capability> target,challenge;napi_deferred deferred=nullptr;Bytes before,preparationQuiescence,restorationQuiescence;bool settled=false,completedHistory=false;};
using CaptureHolder=std::shared_ptr<CaptureWork>;
void FinalizeCapture(napi_env,void* pointer,void*){delete static_cast<CaptureHolder*>(pointer);}
napi_value CaptureComplete(napi_env env,napi_callback_info info){std::size_t count=1;napi_value actual=nullptr;void* pointer=nullptr;
    try{Check(napi_get_cb_info(env,info,&count,&actual,nullptr,&pointer));if(!pointer)detail::Refuse("trusted_fixed_capture_completion_required");auto& work=**static_cast<CaptureHolder*>(pointer);if(work.settled)return Undefined(env);work.settled=true;
        auto& client=*work.owner->native;client.AssertCapturedCurrent(work.target);(void)client.ObservationChallengeDescriptor(work.challenge);if(count!=1)detail::Refuse("trusted_fixed_capture_result_required");
        ExactKeys(env,actual,{"request","capture"});std::shared_ptr<RequestBox> request;const auto original=OwnProperty(env,actual,"request");for(const auto& candidate:work.owner->requests)if(!candidate->terminal&&candidate->originalRequest&&candidate->request){napi_value held=nullptr;bool same=false;Check(napi_get_reference_value(env,candidate->originalRequest,&held));Check(napi_strict_equals(env,original,held,&same));if(same){if(request)detail::Refuse("trusted_actual_capture_request_ambiguous");request=candidate;}}
        if(!request)detail::Refuse("trusted_actual_capture_original_request_required");const auto captured=OwnProperty(env,actual,"capture");ExactKeys(env,captured,{"targetId","frameId","contextId","contextUniqueId","contextOrigin","records","value"});CepCapture proof;
        proof.targetId=String(env,OwnProperty(env,captured,"targetId"),128);proof.frameId=String(env,OwnProperty(env,captured,"frameId"),128);proof.contextId=Unsigned(env,OwnProperty(env,captured,"contextId"));proof.contextUniqueId=String(env,OwnProperty(env,captured,"contextUniqueId"),256);proof.contextOrigin=String(env,OwnProperty(env,captured,"contextOrigin"),32760);
        const auto& definition=client.CepObserverDefinition(work.target);const auto rows=OwnProperty(env,captured,"records");bool array=false;Check(napi_is_array(env,rows,&array));std::uint32_t length=0;Check(napi_get_array_length(env,rows,&length));if(!array||length!=definition.cepSources.size())detail::Refuse("trusted_actual_cep_closure_count_refused");proof.sources.reserve(length);
        for(std::uint32_t i=0;i<length;++i){napi_value row=nullptr;Check(napi_get_element(env,rows,i,&row));proof.sources.push_back(CepRecord(env,row,definition.cepSources[i]));}
        const auto value=OwnProperty(env,captured,"value");ExactKeys(env,value,{"challenge","protocolVersion","before","catalog","after"});if(String(env,OwnProperty(env,value,"protocolVersion"),64)!="ae-agent.panel-actions.v1")detail::Refuse("trusted_actual_panel_protocol_refused");
        const auto issued=client.ObservationChallengeDescriptor(work.challenge);const auto echoed=OwnProperty(env,value,"challenge");ExactKeys(env,echoed,{"ref","purpose","target"});
        const auto idHex=[](const unsigned char* bytes){Digest padded{};std::copy(bytes,bytes+16,padded.begin());return Hex(padded).substr(0,32);};
        if(String(env,OwnProperty(env,echoed,"ref"),32)!=idHex(issued.payload.data())||Unsigned(env,OwnProperty(env,echoed,"purpose"))!=(static_cast<unsigned>(issued.payload[16])|(static_cast<unsigned>(issued.payload[17])<<8))||String(env,OwnProperty(env,echoed,"target"),32)!=idHex(issued.payload.data()+18))detail::Refuse("trusted_actual_cep_echo_mismatch");
        if(client.PreparationQuiescenceDescriptorFixed(work.challenge)!=work.preparationQuiescence)detail::Refuse("trusted_preparation_quiescence_original_context_changed");
        napi_value expectedPins=nullptr;if(work.preparationQuiescence.size()>2)expectedPins=OwnProperty(env,ParseOriginalJson(env,work.preparationQuiescence),"pins");
        const auto before=OwnProperty(env,value,"before"),after=OwnProperty(env,value,"after");PanelQuiescence(env,before,proof,expectedPins);CepCapture afterPanel;PanelQuiescence(env,after,afterPanel,expectedPins);
        if(proof.panelInstance!=afterPanel.panelInstance||proof.panelConnection!=afterPanel.panelConnection||proof.panelGeneration!=afterPanel.panelGeneration||proof.panelEpoch!=afterPanel.panelEpoch||proof.panelChatSession!=afterPanel.panelChatSession)detail::Refuse("trusted_actual_panel_changed_during_capture");
        const auto catalog=OwnProperty(env,value,"catalog");Check(napi_is_array(env,catalog,&array));Check(napi_get_array_length(env,catalog,&length));if(!array||!length||length>256)detail::Refuse("trusted_actual_panel_catalog_required");
        for(std::uint32_t i=0;i<length;++i){napi_value row=nullptr;Check(napi_get_element(env,catalog,i,&row));const auto reasons=OwnProperty(env,OwnProperty(env,row,"availability"),"reasonCodes");Check(napi_is_array(env,reasons,&array));std::uint32_t countReasons=0;Check(napi_get_array_length(env,reasons,&countReasons));if(!array||countReasons>16)detail::Refuse("trusted_actual_panel_catalog_reasons_refused");
            for(std::uint32_t j=0;j<countReasons;++j){napi_value reason=nullptr;Check(napi_get_element(env,reasons,j,&reason));if(String(env,reason,128)=="trusted_guard_refresh_pending")detail::Refuse("trusted_actual_panel_lookup_pending");}}
        proof.catalog=detail::Hash(SerializeOriginalJson(env,catalog));
        if(client.RestorationQuiescenceDescriptorFixed(work.challenge)!=work.restorationQuiescence)detail::Refuse("trusted_actual_restoration_debt_last_await_drift");
        proof.actualQuiescence=work.before;proof.actualQuiescence.insert(proof.actualQuiescence.end(),work.restorationQuiescence.begin(),work.restorationQuiescence.end());const auto afterDaemon=DaemonQuiescence(env,work.owner,expectedPins,work.completedHistory);proof.actualQuiescence.insert(proof.actualQuiescence.end(),afterDaemon.begin(),afterDaemon.end());
        const auto beforeBytes=SerializeOriginalJson(env,before),afterBytes=SerializeOriginalJson(env,after);proof.actualQuiescence.insert(proof.actualQuiescence.end(),beforeBytes.begin(),beforeBytes.end());proof.actualQuiescence.insert(proof.actualQuiescence.end(),afterBytes.begin(),afterBytes.end());
        client.AssertCapturedCurrent(work.target);(void)client.ObservationChallengeDescriptor(work.challenge);auto capability=client.CaptureObservationFixed(work.target,work.challenge,request->request,proof);work.owner->pending=false;Check(napi_resolve_deferred(env,work.deferred,Wrap(env,work.owner,std::move(capability))));return Undefined(env);
    }catch(const detail::Failure& failure){if(pointer){auto& work=**static_cast<CaptureHolder*>(pointer);work.owner->pending=false;work.owner->native->InvalidateLoadedCepProof();napi_reject_deferred(env,work.deferred,Error(env,failure.code,failure.unknown));}return Undefined(env);}
    catch(...){if(pointer){auto& work=**static_cast<CaptureHolder*>(pointer);work.owner->pending=false;work.owner->native->InvalidateLoadedNodeProof();napi_reject_deferred(env,work.deferred,Error(env,"trusted_fixed_capture_unknown",true));}return Undefined(env);}}
napi_value CaptureRejected(napi_env env,napi_callback_info info){std::size_t count=1;napi_value actual=nullptr;void* pointer=nullptr;if(napi_get_cb_info(env,info,&count,&actual,nullptr,&pointer)!=napi_ok||!pointer)return nullptr;auto& work=**static_cast<CaptureHolder*>(pointer);if(!work.settled){work.settled=true;work.owner->pending=false;work.owner->native->InvalidateLoadedCepProof();napi_reject_deferred(env,work.deferred,Error(env,"trusted_fixed_capture_failed",false));}return Undefined(env);}
napi_value CaptureAsync(napi_env env,const std::shared_ptr<Instance>& owner,const std::shared_ptr<Capability>& target,const std::shared_ptr<Capability>& challenge){if(owner->pending||!owner->observationGetter)detail::Refuse("trusted_fixed_observation_getter_required");
    owner->native->AssertCapturedCurrent(target);const auto issued=owner->native->ObservationChallengeDescriptor(challenge);auto work=std::make_shared<CaptureWork>();work->owner=owner;work->target=target;work->challenge=challenge;
    work->restorationQuiescence=owner->native->RestorationQuiescenceDescriptorFixed(challenge);work->preparationQuiescence=owner->native->PreparationQuiescenceDescriptorFixed(challenge);napi_value expectedPins=nullptr;
    if(work->preparationQuiescence.size()>2){const auto descriptor=ParseOriginalJson(env,work->preparationQuiescence);expectedPins=OwnProperty(env,descriptor,"pins");if(OriginalHasOwn(env,descriptor,"mode"))work->completedHistory=String(env,OwnProperty(env,descriptor,"mode"),64)=="completed_original_d20";}work->before=DaemonQuiescence(env,owner,expectedPins,work->completedHistory);
    napi_value promise=nullptr,argument=nullptr;Check(napi_create_promise(env,&work->deferred,&promise));Check(napi_create_object(env,&argument));const auto idHex=[](const unsigned char* bytes){Digest padded{};std::copy(bytes,bytes+16,padded.begin());return Hex(padded).substr(0,32);};Text(env,argument,"ref",idHex(issued.payload.data()));Number(env,argument,"purpose",static_cast<unsigned>(issued.payload[16])|(static_cast<unsigned>(issued.payload[17])<<8));Text(env,argument,"target",idHex(issued.payload.data()+18));
    owner->pending=true;try{napi_value global=nullptr,getter=nullptr,result=nullptr,then=nullptr;Check(napi_get_global(env,&global));Check(napi_get_reference_value(env,owner->observationGetter,&getter));owner->native->AssertCapturedCurrent(target);Check(napi_call_function(env,global,getter,1,&argument,&result));bool isPromise=false;Check(napi_is_promise(env,result,&isPromise));if(!isPromise)detail::Refuse("trusted_fixed_observation_promise_required");Check(napi_get_named_property(env,result,"then",&then));
        napi_value callbacks[2]{};const napi_callback functions[]={CaptureComplete,CaptureRejected};for(std::size_t i=0;i<2;++i){auto holder=std::make_unique<CaptureHolder>(work);Check(napi_create_function(env,"owned-native-capture",NAPI_AUTO_LENGTH,functions[i],holder.get(),&callbacks[i]));Check(napi_add_finalizer(env,callbacks[i],holder.get(),FinalizeCapture,nullptr,nullptr));(void)holder.release();}
        napi_value ignored=nullptr;Check(napi_call_function(env,result,then,2,callbacks,&ignored));return promise;
    }catch(...){owner->pending=false;owner->native->InvalidateLoadedCepProof();throw;}}
struct ReadonlyScriptWork final {std::shared_ptr<Instance> owner;std::shared_ptr<Capability> handler,manifest,currentRead;Bytes preparationDescriptor;napi_deferred deferred=nullptr;bool settled=false,preparation=false,stage=false,restoration=false,ame=false,ameInspection=false,completion=false;};
using ReadonlyScriptHolder=std::shared_ptr<ReadonlyScriptWork>;
void FinalizeReadonlyScript(napi_env,void* pointer,void*){delete static_cast<ReadonlyScriptHolder*>(pointer);}
napi_value ReadonlyScriptComplete(napi_env env,napi_callback_info info){std::size_t count=1;napi_value actual=nullptr;void* pointer=nullptr;
    try{Check(napi_get_cb_info(env,info,&count,&actual,nullptr,&pointer));if(!pointer)detail::Refuse("trusted_original_readonly_source_completion_required");
        auto& work=**static_cast<ReadonlyScriptHolder*>(pointer);if(work.settled)return Undefined(env);work.settled=true;auto& client=*work.owner->native;
        client.AssertCapabilityCurrent(work.handler);if(count!=1)detail::Refuse("trusted_original_readonly_source_result_required");
        std::string expectedName="run_ai_agent_plan";if(work.completion)expectedName="get_ame_title_job_status";else if(work.ameInspection){const auto descriptor=ParseOriginalJson(env,work.preparationDescriptor);expectedName=String(env,OwnProperty(env,descriptor,"operation"),16)=="sources"?"inspect_ame_title_sources":"inspect_ame_title_queue_manifest";}else if(!work.ame&&!work.stage&&!work.restoration){const auto original=work.preparation?OwnProperty(env,ParseOriginalJson(env,work.preparationDescriptor),"request"):ParseOriginalJson(env,client.OriginalExecutionBody(work.handler));expectedName=String(env,OwnProperty(env,original,"name"),64);}
        ExactKeys(env,actual,work.ame?std::vector<const char*>{"name","script","scriptSha25664","bridgeTalkBody"}:std::vector<const char*>{"name","script","scriptSha25664"});const auto name=String(env,OwnProperty(env,actual,"name"),64);
        const auto source=String(env,OwnProperty(env,actual,"script"),1048576);if(name!=expectedName||source.empty()||source.find('\0')!=std::string::npos||
            String(env,OwnProperty(env,actual,"scriptSha25664"),64)!=Hex(detail::Hash(Bytes(source.begin(),source.end()))))detail::Refuse("trusted_original_readonly_source_name_or_hash_refused");
        client.AssertCapabilityCurrent(work.handler);if(work.preparation&&client.ExecutionPreparationDescriptorFixed(work.handler,work.manifest,work.currentRead)!=work.preparationDescriptor)detail::Refuse("trusted_original_preparation_source_context_changed");
        if(work.stage&&client.StageOperationDescriptorFixed(work.handler,work.manifest)!=work.preparationDescriptor)detail::Refuse("trusted_original_stage_source_context_changed");
        if(work.restoration&&client.RestorationDeliveryDescriptorFixed(work.handler,work.manifest)!=work.preparationDescriptor)detail::Refuse("trusted_original_restore_source_context_changed");
        if(work.ame&&(work.completion?client.OriginalCompletionPollDescriptorFixed(work.handler):work.ameInspection?client.AmeSourceInspectionDescriptorFixed(work.handler,work.manifest,work.currentRead):client.AmeDeliveryDescriptorFixed(work.handler,work.manifest,work.currentRead))!=work.preparationDescriptor)detail::Refuse("trusted_original_ame_source_last_await_drift");
        const auto command=work.completion?NativeExecutionBinding::CompletionPollFixed(client,work.handler,source,String(env,OwnProperty(env,actual,"bridgeTalkBody"),524288)):work.ame?NativeExecutionBinding::BindAmeFixed(client,work.handler,work.manifest,work.currentRead,source,String(env,OwnProperty(env,actual,"bridgeTalkBody"),524288),work.ameInspection):work.restoration?NativeExecutionBinding::BindRestorationFixed(client,work.handler,work.manifest,source):work.stage?NativeExecutionBinding::BindStageFixed(client,work.handler,work.manifest,source):work.preparation?NativeExecutionBinding::BindPreparationFixed(client,work.handler,work.manifest,work.currentRead,source):NativeExecutionBinding::BindFixed(client,work.handler,source);client.AssertCapabilityCurrent(command);
        work.owner->pending=false;Check(napi_resolve_deferred(env,work.deferred,Wrap(env,work.owner,command)));return Undefined(env);
    }catch(const detail::Failure& failure){if(pointer){auto& work=**static_cast<ReadonlyScriptHolder*>(pointer);work.owner->pending=false;work.owner->native->InvalidateLoadedNodeProof();napi_reject_deferred(env,work.deferred,Error(env,failure.code,failure.unknown));}return Undefined(env);}
    catch(...){if(pointer){auto& work=**static_cast<ReadonlyScriptHolder*>(pointer);work.owner->pending=false;work.owner->native->InvalidateLoadedNodeProof();napi_reject_deferred(env,work.deferred,Error(env,"trusted_original_readonly_source_unknown",true));}return Undefined(env);}}
napi_value ReadonlyScriptRejected(napi_env env,napi_callback_info info){std::size_t count=1;napi_value actual=nullptr;void* pointer=nullptr;
    if(napi_get_cb_info(env,info,&count,&actual,nullptr,&pointer)!=napi_ok||!pointer)return nullptr;auto& work=**static_cast<ReadonlyScriptHolder*>(pointer);
    if(!work.settled){work.settled=true;work.owner->pending=false;work.owner->native->InvalidateLoadedNodeProof();napi_reject_deferred(env,work.deferred,Error(env,"trusted_original_readonly_source_failed",false));}return Undefined(env);}
napi_value BindReadonlyExecutionAsync(napi_env env,const std::shared_ptr<Instance>& owner,const std::shared_ptr<Capability>& handler){
    if(owner->pending||!owner->readonlyScriptGetter)detail::Refuse("trusted_fixed_readonly_source_getter_required");auto& client=*owner->native;
    const auto original=client.OriginalExecutionBody(handler);const auto argument=ParseOriginalJson(env,original);client.AssertCapabilityCurrent(handler);
    // This discriminator is native embedded policy, never an HTTP caller field.
    const auto selectionMode=EmbeddedProfile().execution.selectionMode;
    if(selectionMode!=TitleSelectionMode::FirstTwoObservedTextStatesV1&&selectionMode!=TitleSelectionMode::ExactNamedVariants)detail::Refuse("trusted_readonly_selection_mode_refused");
    Text(env,argument,"titleSelectionMode",selectionMode==TitleSelectionMode::FirstTwoObservedTextStatesV1?"first_two_observed_text_states_v1":"exact_named_variants");
    const auto rangeMode=EmbeddedProfile().execution.rangeMode;if(rangeMode!=TitleRangeMode::FrozenLiteralRange&&rangeMode!=TitleRangeMode::FullObservedRootRangeV1)detail::Refuse("trusted_readonly_range_mode_refused");
    Text(env,argument,"titleRangeMode",rangeMode==TitleRangeMode::FullObservedRootRangeV1?"full_observed_root_range_v1":"frozen_literal_range");
    auto work=std::make_shared<ReadonlyScriptWork>();work->owner=owner;work->handler=handler;napi_value promise=nullptr;Check(napi_create_promise(env,&work->deferred,&promise));
    owner->pending=true;try{napi_value global=nullptr,getter=nullptr,result=nullptr,then=nullptr;Check(napi_get_global(env,&global));Check(napi_get_reference_value(env,owner->readonlyScriptGetter,&getter));
        client.AssertCapabilityCurrent(handler);Check(napi_call_function(env,global,getter,1,&argument,&result));bool isPromise=false;Check(napi_is_promise(env,result,&isPromise));
        if(!isPromise)detail::Refuse("trusted_fixed_readonly_source_promise_required");Check(napi_get_named_property(env,result,"then",&then));
        napi_value callbacks[2]{};const napi_callback functions[]={ReadonlyScriptComplete,ReadonlyScriptRejected};for(std::size_t i=0;i<2;++i){auto holder=std::make_unique<ReadonlyScriptHolder>(work);
            Check(napi_create_function(env,"owned-readonly-source",NAPI_AUTO_LENGTH,functions[i],holder.get(),&callbacks[i]));Check(napi_add_finalizer(env,callbacks[i],holder.get(),FinalizeReadonlyScript,nullptr,nullptr));(void)holder.release();}
        napi_value ignored=nullptr;Check(napi_call_function(env,result,then,2,callbacks,&ignored));return promise;
    }catch(...){owner->pending=false;owner->native->InvalidateLoadedNodeProof();throw;}}
napi_value BindPreparationDeliveryAsync(napi_env env,const std::shared_ptr<Instance>& owner,const std::shared_ptr<Capability>& handler,const std::shared_ptr<Capability>& manifest,const std::shared_ptr<Capability>& currentRead){
    if(owner->pending||!owner->preparationScriptGetter)detail::Refuse("trusted_fixed_preparation_source_getter_required");auto& client=*owner->native;
    auto work=std::make_shared<ReadonlyScriptWork>();work->owner=owner;work->handler=handler;work->manifest=manifest;work->currentRead=currentRead;work->preparation=true;
    work->preparationDescriptor=client.ExecutionPreparationDescriptorFixed(handler,manifest,currentRead);napi_value argument=nullptr;Check(napi_create_object(env,&argument));
    Property(env,argument,"descriptor",ParseOriginalJson(env,work->preparationDescriptor));Text(env,argument,"descriptorSha25664",Hex(detail::Hash(work->preparationDescriptor)));
    napi_value promise=nullptr;Check(napi_create_promise(env,&work->deferred,&promise));owner->pending=true;
    try{napi_value global=nullptr,getter=nullptr,result=nullptr,then=nullptr;Check(napi_get_global(env,&global));Check(napi_get_reference_value(env,owner->preparationScriptGetter,&getter));
        client.AssertCapabilityCurrent(handler);Check(napi_call_function(env,global,getter,1,&argument,&result));bool isPromise=false;Check(napi_is_promise(env,result,&isPromise));
        if(!isPromise)detail::Refuse("trusted_fixed_preparation_source_promise_required");Check(napi_get_named_property(env,result,"then",&then));
        napi_value callbacks[2]{};const napi_callback functions[]={ReadonlyScriptComplete,ReadonlyScriptRejected};for(std::size_t i=0;i<2;++i){auto holder=std::make_unique<ReadonlyScriptHolder>(work);
            Check(napi_create_function(env,"owned-preparation-source",NAPI_AUTO_LENGTH,functions[i],holder.get(),&callbacks[i]));Check(napi_add_finalizer(env,callbacks[i],holder.get(),FinalizeReadonlyScript,nullptr,nullptr));(void)holder.release();}
        napi_value ignored=nullptr;Check(napi_call_function(env,result,then,2,callbacks,&ignored));return promise;
    }catch(...){owner->pending=false;owner->native->InvalidateLoadedNodeProof();throw;}}
napi_value BindStageDeliveryAsync(napi_env env,const std::shared_ptr<Instance>& owner,const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& copy){
    if(owner->pending||!owner->stageScriptGetter)detail::Refuse("trusted_fixed_stage_source_getter_required");auto& client=*owner->native;auto work=std::make_shared<ReadonlyScriptWork>();
    work->owner=owner;work->handler=gate;work->manifest=copy;work->stage=true;work->preparationDescriptor=client.StageOperationDescriptorFixed(gate,copy);
    napi_value argument=nullptr;Check(napi_create_object(env,&argument));Property(env,argument,"descriptor",ParseOriginalJson(env,work->preparationDescriptor));Text(env,argument,"descriptorSha25664",Hex(detail::Hash(work->preparationDescriptor)));
    napi_value promise=nullptr;Check(napi_create_promise(env,&work->deferred,&promise));owner->pending=true;
    try{napi_value global=nullptr,getter=nullptr,result=nullptr,then=nullptr;Check(napi_get_global(env,&global));Check(napi_get_reference_value(env,owner->stageScriptGetter,&getter));
        client.AssertCapabilityCurrent(gate);Check(napi_call_function(env,global,getter,1,&argument,&result));bool isPromise=false;Check(napi_is_promise(env,result,&isPromise));if(!isPromise)detail::Refuse("trusted_fixed_stage_source_promise_required");
        Check(napi_get_named_property(env,result,"then",&then));napi_value callbacks[2]{};const napi_callback functions[]={ReadonlyScriptComplete,ReadonlyScriptRejected};
        for(std::size_t i=0;i<2;++i){auto holder=std::make_unique<ReadonlyScriptHolder>(work);Check(napi_create_function(env,"owned-stage-source",NAPI_AUTO_LENGTH,functions[i],holder.get(),&callbacks[i]));Check(napi_add_finalizer(env,callbacks[i],holder.get(),FinalizeReadonlyScript,nullptr,nullptr));(void)holder.release();}
        napi_value ignored=nullptr;Check(napi_call_function(env,result,then,2,callbacks,&ignored));return promise;
    }catch(...){owner->pending=false;owner->native->InvalidateLoadedNodeProof();throw;}}
napi_value CaptureRestorationProgram(napi_env env,const std::shared_ptr<Instance>& owner,const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& copy){
    if(owner->pending||!owner->restorationProgramGetter||!owner->restorationScriptGetter)detail::Refuse("trusted_original_usable_restore_getters_required");auto& client=*owner->native;
    const auto descriptor=client.RestorationProgramDescriptorFixed(gate,copy);napi_value argument=nullptr,getter=nullptr,global=nullptr,result=nullptr;Check(napi_create_object(env,&argument));Property(env,argument,"descriptor",ParseOriginalJson(env,descriptor));Text(env,argument,"descriptorSha25664",Hex(detail::Hash(descriptor)));
    Check(napi_get_reference_value(env,owner->restorationProgramGetter,&getter));Check(napi_get_global(env,&global));owner->pending=true;
    try{Check(napi_call_function(env,global,getter,1,&argument,&result));bool promise=false;Check(napi_is_promise(env,result,&promise));if(promise)detail::Refuse("trusted_restore_preissue_synchronous_source_required");ExactKeys(env,result,{"name","prefix","suffix"});
        if(String(env,OwnProperty(env,result,"name"),64)!="run_ai_agent_plan")detail::Refuse("trusted_restore_preissue_tool_required");const auto prefix=String(env,OwnProperty(env,result,"prefix"),1048576),suffix=String(env,OwnProperty(env,result,"suffix"),1048576);
        if(client.RestorationProgramDescriptorFixed(gate,copy)!=descriptor)detail::Refuse("trusted_restore_preissue_context_changed");auto cap=NativeExecutionBinding::RestorationProgramFixed(client,gate,copy,prefix,suffix);owner->pending=false;return Wrap(env,owner,cap);
    }catch(...){owner->pending=false;client.InvalidateLoadedNodeProof();throw;}
}
napi_value BindRestorationDeliveryAsync(napi_env env,const std::shared_ptr<Instance>& owner,const std::shared_ptr<Capability>& gate,const std::shared_ptr<Capability>& program){
    if(owner->pending||!owner->restorationScriptGetter)detail::Refuse("trusted_fixed_restore_source_getter_required");auto& client=*owner->native;auto work=std::make_shared<ReadonlyScriptWork>();work->owner=owner;work->handler=gate;work->manifest=program;work->restoration=true;
    work->preparationDescriptor=client.RestorationDeliveryDescriptorFixed(gate,program);napi_value argument=nullptr;Check(napi_create_object(env,&argument));Property(env,argument,"descriptor",ParseOriginalJson(env,work->preparationDescriptor));Text(env,argument,"descriptorSha25664",Hex(detail::Hash(work->preparationDescriptor)));
    napi_value promise=nullptr;Check(napi_create_promise(env,&work->deferred,&promise));owner->pending=true;
    try{napi_value global=nullptr,getter=nullptr,result=nullptr,then=nullptr;Check(napi_get_global(env,&global));Check(napi_get_reference_value(env,owner->restorationScriptGetter,&getter));client.AssertCapabilityCurrent(gate);Check(napi_call_function(env,global,getter,1,&argument,&result));bool isPromise=false;Check(napi_is_promise(env,result,&isPromise));if(!isPromise)detail::Refuse("trusted_fixed_restore_source_promise_required");Check(napi_get_named_property(env,result,"then",&then));
        napi_value callbacks[2]{};const napi_callback functions[]={ReadonlyScriptComplete,ReadonlyScriptRejected};for(std::size_t i=0;i<2;++i){auto holder=std::make_unique<ReadonlyScriptHolder>(work);Check(napi_create_function(env,"owned-restore-source",NAPI_AUTO_LENGTH,functions[i],holder.get(),&callbacks[i]));Check(napi_add_finalizer(env,callbacks[i],holder.get(),FinalizeReadonlyScript,nullptr,nullptr));(void)holder.release();}
        napi_value ignored=nullptr;Check(napi_call_function(env,result,then,2,callbacks,&ignored));return promise;
    }catch(...){owner->pending=false;client.InvalidateLoadedNodeProof();throw;}
}
napi_value BindAmeAsync(napi_env env,const std::shared_ptr<Instance>& owner,const std::shared_ptr<Capability>& origin,const std::shared_ptr<Capability>& snapshot,const std::shared_ptr<Capability>& ame,bool inspection,bool completion=false){
    if(owner->pending||!owner->ameScriptGetter)detail::Refuse("trusted_fixed_ame_source_getter_required");auto& client=*owner->native;auto work=std::make_shared<ReadonlyScriptWork>();work->owner=owner;work->handler=origin;work->manifest=snapshot;work->currentRead=ame;work->ame=true;work->ameInspection=inspection;
    work->completion=completion;work->preparationDescriptor=completion?client.OriginalCompletionPollDescriptorFixed(origin):inspection?client.AmeSourceInspectionDescriptorFixed(origin,snapshot,ame):client.AmeDeliveryDescriptorFixed(origin,snapshot,ame);napi_value argument=nullptr;Check(napi_create_object(env,&argument));Property(env,argument,"descriptor",ParseOriginalJson(env,work->preparationDescriptor));Text(env,argument,"descriptorSha25664",Hex(detail::Hash(work->preparationDescriptor)));
    napi_value promise=nullptr;Check(napi_create_promise(env,&work->deferred,&promise));owner->pending=true;
    try{napi_value global=nullptr,getter=nullptr,result=nullptr,then=nullptr;Check(napi_get_global(env,&global));Check(napi_get_reference_value(env,owner->ameScriptGetter,&getter));client.AssertCapabilityCurrent(origin);Check(napi_call_function(env,global,getter,1,&argument,&result));bool isPromise=false;Check(napi_is_promise(env,result,&isPromise));if(!isPromise)detail::Refuse("trusted_fixed_ame_source_promise_required");Check(napi_get_named_property(env,result,"then",&then));
        napi_value callbacks[2]{};const napi_callback functions[]={ReadonlyScriptComplete,ReadonlyScriptRejected};for(std::size_t i=0;i<2;++i){auto holder=std::make_unique<ReadonlyScriptHolder>(work);Check(napi_create_function(env,"owned-ame-source",NAPI_AUTO_LENGTH,functions[i],holder.get(),&callbacks[i]));Check(napi_add_finalizer(env,callbacks[i],holder.get(),FinalizeReadonlyScript,nullptr,nullptr));(void)holder.release();}napi_value ignored=nullptr;Check(napi_call_function(env,result,then,2,callbacks,&ignored));return promise;
    }catch(...){owner->pending=false;client.InvalidateLoadedNodeProof();throw;}
}
napi_value Dispatch(napi_env env,napi_callback_info info){try{std::array<napi_value,6> arguments{};std::size_t count=0;napi_value role=nullptr;void* data=nullptr;
    Check(napi_get_cb_info(env,info,&count,nullptr,&role,&data));if(count>arguments.size())detail::Refuse("trusted_node_extra_arguments_refused");
    const auto actualCount=count;count=arguments.size();Check(napi_get_cb_info(env,info,&count,arguments.data(),&role,&data));if(count!=actualCount)detail::Refuse("trusted_node_arguments_changed");
    const auto operation=static_cast<Operation>(reinterpret_cast<std::uintptr_t>(data));auto owner=Original(env,role);auto& client=*owner->native;
    if(operation==Operation::Assert){if(count>1)detail::Refuse("trusted_node_assert_arguments");if(count){napi_valuetype type=napi_undefined;Check(napi_typeof(env,arguments[0],&type));if(type!=napi_undefined)client.AssertCapabilityCurrent(Cap(env,arguments[0],owner));else client.AssertCurrent();}else client.AssertCurrent();return Undefined(env);}
    if(operation==Operation::InvalidateSource){if(count)detail::Refuse("trusted_node_source_close_arguments");client.InvalidateLoadedNodeProof();return Undefined(env);}
    if(operation==Operation::InvalidateCep){if(count)detail::Refuse("trusted_cep_source_close_arguments");client.InvalidateLoadedCepProof();return Undefined(env);}
    if(operation==Operation::DispositionCurrent||operation==Operation::PollEvent||operation==Operation::EventKind||operation==Operation::AckDisposition){
        const std::size_t expected=operation==Operation::EventKind||operation==Operation::AckDisposition?1u:0u;if(count!=expected)detail::Refuse("trusted_original_event_arguments");client.AssertOriginalDispositionCurrent();
        if(operation==Operation::DispositionCurrent)return Undefined(env);
        if(operation==Operation::PollEvent){if(owner->pending)detail::Refuse("trusted_original_event_during_request_refused");auto event=client.PollOriginalEvent();if(event)return Wrap(env,owner,std::move(event));napi_value value=nullptr;Check(napi_get_null(env,&value));return value;}
        auto event=Cap(env,arguments[0],owner);if(operation==Operation::EventKind){napi_value value=nullptr;const auto* kind=client.OriginalEventKind(event);Check(napi_create_string_utf8(env,kind,NAPI_AUTO_LENGTH,&value));return value;}
        auto work=std::make_unique<Work>();work->owner=owner;work->operation=operation;work->input=std::move(event);return Async(env,std::move(work));}
    if(operation==Operation::CompleteIdleCleanup){if(count!=1)detail::Refuse("trusted_original_idle_cleanup_arguments");auto original=OriginalRequest(env,arguments[0],owner);
        if(original->delivery||original->cleanupAttempted||original->cleanupFailure)detail::Refuse("trusted_original_idle_request_spent");
        // Native alone admits the exact B33 request. A deterministic PENDING
        // failure has consumed no terminal attempt and retains the same cap.
        try{client.CompleteOriginalIdleRequestCleanup(original->request);original->cleanupAttempted=true;}
        catch(const detail::Failure& failure){if(failure.code!="trusted_original_idle_cleanup_pending"){original->cleanupFailure=true;client.FailAuthenticatedResponse(original->request);}throw;}
        catch(...){original->cleanupFailure=true;client.FailAuthenticatedResponse(original->request);throw;}
        try{Check(napi_delete_reference(env,original->originalRequest));original->originalRequest=nullptr;original->terminal=true;return Undefined(env);}
        catch(...){original->cleanupFailure=true;client.FailAuthenticatedResponse(original->request);throw;}}
    client.AssertCurrent();
    if(operation==Operation::AssertPreactor){if(count!=1)detail::Refuse("trusted_preactor_arguments");client.AssertPreactorCurrent(Cap(env,arguments[0],owner));return Undefined(env);}
    if(operation==Operation::PreactorInventory){if(count!=1)detail::Refuse("trusted_preactor_inventory_arguments");const auto& definition=client.BootstrapObserverDefinition(Cap(env,arguments[0],owner));napi_value value=nullptr;
        Check(napi_create_object(env,&value));Text(env,value,"targetUrl",definition.cdpTargetUrl);Number(env,value,"port",definition.cdpPort);return value;}
    if(operation==Operation::BootstrapSettled){if(count)detail::Refuse("trusted_bootstrap_settled_arguments");client.AssertBootstrapSettled();return Undefined(env);}
    if(operation==Operation::ReserveBootstrap){if(count!=2||owner->pending)detail::Refuse("trusted_bootstrap_reserve_arguments");auto handler=Cap(env,arguments[0],owner),preactor=Cap(env,arguments[1],owner);
        (void)DaemonQuiescence(env,owner);client.AssertPreactorCurrent(preactor);return Wrap(env,owner,client.ReservePanelBootstrapFixed(handler,preactor));}
    if(operation==Operation::LaunchBootstrap){if(count!=2||owner->pending)detail::Refuse("trusted_bootstrap_launch_arguments");auto work=std::make_unique<Work>();work->owner=owner;work->operation=operation;
        work->input=Cap(env,arguments[0],owner);work->second=Cap(env,arguments[1],owner);client.AssertPreactorCurrent(work->second);return Async(env,std::move(work));}
    if(operation==Operation::CepInventory){if(count!=1)detail::Refuse("trusted_fixed_cep_inventory_arguments");const auto& definition=client.CepObserverDefinition(Cap(env,arguments[0],owner));napi_value value=nullptr,rows=nullptr;Check(napi_create_object(env,&value));Check(napi_create_array(env,&rows));std::uint32_t at=0;
        for(const auto& source:definition.cepSources){napi_value row=nullptr;Check(napi_create_object(env,&row));Number(env,row,"selector",source.selector);Text(env,row,"url",source.url);Text(env,row,"compiledSha256",Hex(source.compiled));Number(env,row,"startLine",source.startLine);Number(env,row,"startColumn",source.startColumn);Number(env,row,"endLine",source.endLine);Number(env,row,"endColumn",source.endColumn);Number(env,row,"length",source.length);SafeNumber(env,row,"utf8ByteLength",source.utf8ByteLength);Boolean(env,row,"diagnostic",source.diagnostic);Boolean(env,row,"hasSourceURL",source.hasSourceURL);Boolean(env,row,"isModule",source.isModule);Boolean(env,row,"isLiveEdit",source.isLiveEdit);Check(napi_set_element(env,rows,at++,row));}
        Property(env,value,"rows",rows);Text(env,value,"targetUrl",definition.cdpTargetUrl);Text(env,value,"origin",definition.cepContextOrigin);Text(env,value,"diagnostic",definition.cepDiagnostic);Number(env,value,"port",definition.cdpPort);SafeNumber(env,value,"totalByteLength",definition.cepSourceBytes);client.AssertLoadedNodeCurrent();return value;}
    if(operation==Operation::CaptureObservation){if(count!=2)detail::Refuse("trusted_fixed_observation_capture_arguments");return CaptureAsync(env,owner,Cap(env,arguments[0],owner),Cap(env,arguments[1],owner));}
    if(operation==Operation::SubmitObservation||operation==Operation::ObserveActor){if(count!=2)detail::Refuse("trusted_original_observation_arguments");auto work=std::make_unique<Work>();work->owner=owner;work->operation=operation;work->input=Cap(env,arguments[0],owner);work->second=Cap(env,arguments[1],owner);return Async(env,std::move(work));}
    if(operation==Operation::RetainRequest){if(count!=3)detail::Refuse("trusted_actual_request_capture_arguments");client.AssertLoadedNodeCurrent();
        auto connection=HttpTransportBinding::Connection(env,role,arguments[0]);HttpTransportBinding::AssertRequestStream(env,role,arguments[0],arguments[1]);auto fields=RequestFields(env,arguments[1],arguments[2]);
        owner->requests.erase(std::remove_if(owner->requests.begin(),owner->requests.end(),[](const auto& request){return request->terminal;}),owner->requests.end());if(owner->requests.size()>=192)detail::Refuse("trusted_actual_request_reference_budget");
        for(const auto& request:owner->requests)if(request->originalRequest){napi_value actual=nullptr;Check(napi_get_reference_value(env,request->originalRequest,&actual));bool same=false;Check(napi_strict_equals(env,actual,arguments[1],&same));if(same)detail::Refuse("trusted_actual_request_capture_once");}
        auto original=std::make_shared<RequestBox>();original->owner=owner;Check(napi_create_reference(env,arguments[1],1,&original->originalRequest));owner->requests.push_back(original);
        try{original->request=client.RetainAuthenticatedRequest(std::move(connection),std::move(fields));return WrapRequest(env,original);}
        catch(...){if(!original->request){if(napi_delete_reference(env,original->originalRequest)==napi_ok){original->originalRequest=nullptr;owner->requests.pop_back();}}
            else client.FailAuthenticatedResponse(original->request);throw;}}
    if(operation==Operation::VerifyTool){if(count!=2)detail::Refuse("trusted_actual_request_tool_arguments");auto original=OriginalRequest(env,arguments[0],owner);return Wrap(env,owner,client.VerifyTool(original->request,Tool(env,arguments[1],true)));}
    if(operation==Operation::VerifyExecution){if(count!=2||owner->pending)detail::Refuse("trusted_execution_request_arguments");auto original=OriginalRequest(env,arguments[0],owner);
        const auto tool=ExecutionTool(env,arguments[1]);CheckExecutionBody(client.OriginalRequestBody(original->request),tool);client.AssertLoadedNodeCurrent();
        return Wrap(env,owner,client.VerifyExecutionTool(original->request,tool));}
    if(operation==Operation::BeginExecution){if(count!=2||owner->pending)detail::Refuse("trusted_execution_begin_arguments");auto work=std::make_unique<Work>();
        work->owner=owner;work->operation=operation;work->input=Cap(env,arguments[0],owner);work->intent=ParseExecutionIntent(env,arguments[1]);
        client.AssertCapabilityCurrent(work->input);return Async(env,std::move(work));}
    if(operation==Operation::BeginServerOnly){if(count!=2||owner->pending)detail::Refuse("trusted_server_only_begin_arguments");auto work=std::make_unique<Work>();
        work->owner=owner;work->operation=operation;work->tool=ServerOnlyTool(env,arguments[0]);work->canonicalBody=Buffer(env,arguments[1],1048576,true);
        CheckExecutionBody(work->canonicalBody,work->tool);return Async(env,std::move(work));}
    if(operation==Operation::VerifyServerOnly){if(count!=2||owner->pending)detail::Refuse("trusted_server_only_request_arguments");auto original=OriginalRequest(env,arguments[0],owner);
        const auto tool=ServerOnlyTool(env,arguments[1]);CheckExecutionBody(client.OriginalRequestBody(original->request),tool);client.AssertLoadedNodeCurrent();
        return Wrap(env,owner,client.VerifyServerOnlyTool(original->request,tool));}
    if(operation==Operation::CaptureServerOnly){if(count!=1||owner->pending||!owner->serverOnlyGetter)detail::Refuse("trusted_server_only_result_producer_required");
        auto handler=Cap(env,arguments[0],owner);const auto bytes=client.OriginalServerOnlyBody(handler);napi_value request=ParseOriginalJson(env,bytes),getter=nullptr,global=nullptr,value=nullptr;
        Check(napi_get_reference_value(env,owner->serverOnlyGetter,&getter));Check(napi_get_global(env,&global));client.AssertCapabilityCurrent(handler);
        Check(napi_call_function(env,global,getter,1,&request,&value));bool promise=false;Check(napi_is_promise(env,value,&promise));if(promise)detail::Refuse("trusted_server_only_synchronous_result_required");
        ExactKeys(env,value,{"content","isError"});if(Flag(env,OwnProperty(env,value,"isError")))detail::Refuse("trusted_server_only_successful_result_required");
        const auto content=OwnProperty(env,value,"content");bool array=false;Check(napi_is_array(env,content,&array));std::uint32_t length=0;
        if(!array)detail::Refuse("trusted_server_only_result_content_required");Check(napi_get_array_length(env,content,&length));if(length!=1)detail::Refuse("trusted_server_only_result_content_required");
        napi_value row=nullptr;Check(napi_get_element(env,content,0,&row));ExactKeys(env,row,{"type","text"});if(String(env,OwnProperty(env,row,"type"),16)!="text")detail::Refuse("trusted_server_only_result_text_required");
        (void)String(env,OwnProperty(env,row,"text"),1048576);
        const auto actual=SerializeOriginalJson(env,value);client.AssertCapabilityCurrent(handler);const auto terminal=client.FinishServerOnlyFixed(handler,actual);
        napi_value result=nullptr;Check(napi_create_object(env,&result));Property(env,result,"terminal",Wrap(env,owner,terminal));Property(env,result,"value",value);return result;}
    if(operation==Operation::BindExecution){if(count!=1)detail::Refuse("trusted_readonly_execution_bind_arguments");return BindReadonlyExecutionAsync(env,owner,Cap(env,arguments[0],owner));}
    if(operation==Operation::BindPreparationDelivery){if(count!=3)detail::Refuse("trusted_preparation_delivery_bind_arguments");return BindPreparationDeliveryAsync(env,owner,Cap(env,arguments[0],owner),Cap(env,arguments[1],owner),Cap(env,arguments[2],owner));}
    if(operation==Operation::DescribeRestorationDebt){if(count)detail::Refuse("trusted_restore_debt_facts_arguments");return ParseOriginalJson(env,client.RestorationDebtFactsFixed());}
    if(operation==Operation::PreissueRestoration){if(count!=2)detail::Refuse("trusted_restore_preissue_arguments");return CaptureRestorationProgram(env,owner,Cap(env,arguments[0],owner),Cap(env,arguments[1],owner));}
    if(operation==Operation::BindRestorationDelivery){if(count!=2)detail::Refuse("trusted_restore_delivery_arguments");return BindRestorationDeliveryAsync(env,owner,Cap(env,arguments[0],owner),Cap(env,arguments[1],owner));}
    if(operation==Operation::BindStageDelivery){if(count!=2)detail::Refuse("trusted_stage_delivery_bind_arguments");return BindStageDeliveryAsync(env,owner,Cap(env,arguments[0],owner),Cap(env,arguments[1],owner));}
    if(operation==Operation::BindAmeInspection||operation==Operation::BindAmeDelivery){if(count!=3)detail::Refuse("trusted_ame_bind_arguments");return BindAmeAsync(env,owner,Cap(env,arguments[0],owner),Cap(env,arguments[1],owner),Cap(env,arguments[2],owner),operation==Operation::BindAmeInspection);}
    if(operation==Operation::DescribeAmeCommand){if(count!=1||owner->pending)detail::Refuse("trusted_ame_command_facts_arguments");return ParseOriginalJson(env,client.AmeCommandFactsFixed(Cap(env,arguments[0],owner)));}
    if(operation==Operation::AmeQueueFacts){if(count!=1||owner->pending)detail::Refuse("trusted_ame_queue_facts_arguments");return ParseOriginalJson(env,client.AmeQueuePreparationFactsFixed(Cap(env,arguments[0],owner)));}
    if(operation==Operation::AssertAmeCommand){if(count!=1||owner->pending)detail::Refuse("trusted_ame_guarded_command_arguments");client.AssertAmeCommandCurrentFixed(Cap(env,arguments[0],owner));return Undefined(env);}
    if(operation==Operation::CaptureAmeReservation){if(count!=1||owner->pending||!owner->ameReservationGetter)detail::Refuse("trusted_ame_original_marker_getter_required");const auto command=Cap(env,arguments[0],owner);client.AssertAmeCommandCurrentFixed(command);const auto descriptor=client.AmeCommandFactsFixed(command);napi_value argument=ParseOriginalJson(env,descriptor),global=nullptr,getter=nullptr,result=nullptr;Check(napi_get_global(env,&global));Check(napi_get_reference_value(env,owner->ameReservationGetter,&getter));owner->pending=true;
        try{Check(napi_call_function(env,global,getter,1,&argument,&result));bool promise=false;Check(napi_is_promise(env,result,&promise));if(promise)detail::Refuse("trusted_ame_original_marker_synchronous_getter_required");const auto actual=SerializeOriginalJson(env,result);if(client.AmeCommandFactsFixed(command)!=descriptor)detail::Refuse("trusted_ame_original_marker_context_changed");NativeExecutionBinding::AmeReservationFixed(client,command,actual);owner->pending=false;return Undefined(env);}catch(...){owner->pending=false;throw;}}
    if(operation==Operation::BindOriginalJob){if(count!=1||owner->pending)detail::Refuse("trusted_d47_arguments");auto work=std::make_unique<Work>();work->owner=owner;work->operation=operation;work->input=Cap(env,arguments[0],owner);return Async(env,std::move(work));}
    if(operation==Operation::BeginCompletionPoll){if(count!=1||owner->pending)detail::Refuse("trusted_d48_arguments");return BindAmeAsync(env,owner,Cap(env,arguments[0],owner),nullptr,nullptr,false,true);}
    if(operation==Operation::DescribeCompletionPoll){if(count!=1||owner->pending)detail::Refuse("trusted_original_poll_descriptor_arguments");const auto project=client.DescribeOriginalCompletionPollFixed(Cap(env,arguments[0],owner));napi_value value=nullptr;Check(napi_create_object(env,&value));Text(env,value,"id",Uuid(project.command));Text(env,value,"executionId",Uuid(project.execution));Text(env,value,"leaseId",Uuid(project.lease));Text(env,value,"script",project.script);SafeNumber(env,value,"expiresMono",project.expiresMono);Number(env,value,"contractVersion",2);return value;}
    if(operation==Operation::CompletionFacts){if(count!=1||owner->pending)detail::Refuse("trusted_original_completion_facts_arguments");return ParseOriginalJson(env,client.OriginalCompletionFactsFixed(Cap(env,arguments[0],owner)));}
    if(operation==Operation::AbandonCompletionPoll){if(count!=1||owner->pending)detail::Refuse("trusted_original_poll_abandon_arguments");client.AbandonOriginalCompletionPollFixed(Cap(env,arguments[0],owner));return Undefined(env);}
    if(operation==Operation::SelectCompletionPoll){if(count!=2||owner->pending)detail::Refuse("trusted_original_poll_select_arguments");const auto cap=Cap(env,arguments[0],owner);auto request=OriginalRequest(env,arguments[1],owner);auto selected=client.SelectOriginalCompletionPollFixed(cap,request->request);request->delivery=selected;request->completionDelivery=true;return Wrap(env,owner,std::move(selected));}
    if(operation==Operation::ManualPreflight){if(count!=3||owner->pending)detail::Refuse("trusted_original_manual_preflight_arguments");const auto bytes=client.ManualExecutionPreflightFixed(Cap(env,arguments[0],owner),Cap(env,arguments[1],owner),Cap(env,arguments[2],owner));return ParseOriginalJson(env,bytes);}
    if(operation==Operation::DeadlineProjection){if(count>1||owner->pending)detail::Refuse("trusted_original_deadline_projection_arguments");const auto bytes=client.OriginalDeadlineProjectionFixed(count?Cap(env,arguments[0],owner):std::shared_ptr<Capability>{});return ParseOriginalJson(env,bytes);}
    if(operation==Operation::AcceptManualAdopt){if(count!=3||owner->pending)detail::Refuse("trusted_original_manual_adopt_arguments");const auto request=OriginalRequest(env,arguments[2],owner);
        if(request->terminal||request->delivery)detail::Refuse("trusted_original_manual_adopt_request_spent");client.AcceptOriginalManualAdoptFixed(Cap(env,arguments[0],owner),Cap(env,arguments[1],owner),request->request);return Undefined(env);}
    if(operation==Operation::ExecuteCheckpoint||operation==Operation::ExecuteCleanCopy){if(count!=1||owner->pending)detail::Refuse("trusted_owned_file_execute_arguments");auto work=std::make_unique<Work>();work->owner=owner;work->operation=operation;work->input=Cap(env,arguments[0],owner);return Async(env,std::move(work));}
    if(operation==Operation::DescribeCheckpoint||operation==Operation::DescribeCleanCopy||operation==Operation::DescribeSavedSnapshot){if(count!=1||owner->pending)detail::Refuse("trusted_owned_file_descriptor_arguments");const auto cap=Cap(env,arguments[0],owner);
        const auto bytes=operation==Operation::DescribeCheckpoint?client.DescribeOwnedCheckpointFixed(cap):operation==Operation::DescribeCleanCopy?client.DescribeOwnedCleanCopyFixed(cap):client.DescribeOwnedSavedSnapshotFixed(cap);return ParseOriginalJson(env,bytes);}
    if(operation==Operation::CapturePreparation||operation==Operation::CaptureGates){const bool gates=operation==Operation::CaptureGates;
        if(count!=(gates?6u:3u)||owner->pending||!(gates?owner->executionGateGetter:owner->preparationGetter))detail::Refuse("trusted_execution_fixed_capture_arguments");
        auto handler=Cap(env,arguments[0],owner),manifest=Cap(env,arguments[1],owner),currentRead=Cap(env,arguments[gates?4:2],owner);
        std::shared_ptr<Capability> proposal,dryRun;std::shared_ptr<RequestBox> panel;
        if(gates){proposal=Cap(env,arguments[2],owner);dryRun=Cap(env,arguments[3],owner);panel=OriginalRequest(env,arguments[5],owner);if(panel->terminal||panel->delivery)detail::Refuse("trusted_execution_original_manual_request_spent");}
        const auto descriptor=gates?client.ExecutionGateDescriptorFixed(handler,manifest,proposal,dryRun,currentRead,panel->request):client.ExecutionPreparationDescriptorFixed(handler,manifest,currentRead);
        napi_value argument=nullptr,getter=nullptr,global=nullptr,value=nullptr;Check(napi_create_object(env,&argument));Property(env,argument,"descriptor",ParseOriginalJson(env,descriptor));Text(env,argument,"descriptorSha25664",Hex(detail::Hash(descriptor)));
        Check(napi_get_reference_value(env,gates?owner->executionGateGetter:owner->preparationGetter,&getter));Check(napi_get_global(env,&global));owner->pending=true;
        try{client.AssertCapabilityCurrent(handler);Check(napi_call_function(env,global,getter,1,&argument,&value));bool promise=false;Check(napi_is_promise(env,value,&promise));if(promise)detail::Refuse("trusted_execution_fixed_synchronous_getter_required");
            const auto proof=SerializeOriginalJson(env,value);(void)capture::ParseOriginalJson(proof,kOriginalResultBytes,kOriginalResultNodes,kOriginalResultDepth);client.AssertCapabilityCurrent(handler);
            auto capability=gates?NativeExecutionBinding::GatesFixed(client,handler,manifest,proposal,dryRun,currentRead,panel->request,proof):NativeExecutionBinding::PreparationFixed(client,handler,manifest,currentRead,proof);
            owner->pending=false;if(gates)return Wrap(env,owner,capability);napi_value result=nullptr;Check(napi_create_object(env,&result));Property(env,result,"terminal",Wrap(env,owner,capability));Property(env,result,"value",OwnProperty(env,value,"result"));return result;
        }catch(...){owner->pending=false;throw;}}
    if(operation==Operation::CaptureSelection){if(count!=3||owner->pending)detail::Refuse("trusted_original_selection_arguments");return Wrap(env,owner,client.CaptureSelectionFixed(Cap(env,arguments[0],owner),Cap(env,arguments[1],owner),Cap(env,arguments[2],owner)));}
    if(operation==Operation::DescribeSelection){if(count!=1||owner->pending)detail::Refuse("trusted_original_selection_descriptor_arguments");const auto bytes=client.DescribeSelectionFixed(Cap(env,arguments[0],owner));client.AssertLoadedNodeCurrent();return ParseOriginalJson(env,bytes);}
    if(operation==Operation::CaptureManifest){if(count!=2||owner->pending)detail::Refuse("trusted_original_manifest_arguments");return Wrap(env,owner,client.CaptureManifestFixed(Cap(env,arguments[0],owner),Cap(env,arguments[1],owner)));}
    if(operation==Operation::CaptureStatus){if(count!=1||!owner->statusGetter||owner->pending)detail::Refuse("trusted_actual_status_producer_required");auto handler=Cap(env,arguments[0],owner);client.AssertLoadedNodeCurrent();client.AssertCapabilityCurrent(handler);
        (void)DaemonQuiescence(env,owner);
        napi_value getter=nullptr,global=nullptr,status=nullptr;Check(napi_get_reference_value(env,owner->statusGetter,&getter));Check(napi_get_global(env,&global));
        // Native invokes the captured fixed main-module getter itself. No caller
        // result JSON, function, digest or receipt is accepted by this producer.
        Check(napi_call_function(env,global,getter,0,nullptr,&status));client.AssertLoadedNodeCurrent();client.AssertCapabilityCurrent(handler);
        bool promise=false;Check(napi_is_promise(env,status,&promise));if(promise)detail::Refuse("trusted_synchronous_status_getter_required");
        if(!Flag(env,OwnProperty(env,status,"ok"))||String(env,OwnProperty(env,status,"server"),64)!="codex-ae-mcp-bridge"||String(env,OwnProperty(env,status,"version"),16)!="3.3.1"||
            String(env,OwnProperty(env,status,"protocolVersion"),32)!="2025-03-26"||String(env,OwnProperty(env,status,"host"),32)!="127.0.0.1"||Unsigned(env,OwnProperty(env,status,"port"))!=3456||
            !Flag(env,OwnProperty(env,status,"panelConnected"))||Unsigned(env,OwnProperty(env,status,"pendingCommands"))||!Null(env,OwnProperty(env,status,"activeEditSession")))detail::Refuse("trusted_actual_local_status_refused");
        EmptyArray(env,OwnProperty(env,status,"inflightCommands"));(void)DaemonQuiescence(env,owner);
        napi_value json=nullptr,stringify=nullptr,serialized=nullptr;Check(napi_get_named_property(env,global,"JSON",&json));Check(napi_get_named_property(env,json,"stringify",&stringify));Check(napi_call_function(env,json,stringify,1,&status,&serialized));
        const auto bytes=String(env,serialized,1048576);if(bytes.empty()||bytes[0]!='{')detail::Refuse("trusted_actual_status_object_required");client.AssertLoadedNodeCurrent();
        const auto terminal=client.FinishStatus(handler,detail::Hash(Bytes(bytes.begin(),bytes.end())));napi_value result=nullptr;Check(napi_create_object(env,&result));Property(env,result,"terminal",Wrap(env,owner,terminal));Property(env,result,"value",status);return result;}
    if(operation==Operation::BindProject){if(count!=1||owner->pending)detail::Refuse("trusted_fixed_project_bind_arguments");return Wrap(env,owner,client.BindProjectFixed(Cap(env,arguments[0],owner)));}
    if(operation==Operation::DescribeProject||operation==Operation::DescribeExecution){if(count!=1)detail::Refuse("trusted_original_project_descriptor_arguments");const auto cap=Cap(env,arguments[0],owner);
        const auto project=operation==Operation::DescribeExecution?client.DescribeExecution(cap):client.DescribeProject(cap);napi_value value=nullptr;Check(napi_create_object(env,&value));
        Text(env,value,"id",Uuid(project.command));Text(env,value,"executionId",Uuid(project.execution));Text(env,value,"leaseId",Uuid(project.lease));Text(env,value,"script",project.script);SafeNumber(env,value,"expiresMono",project.expiresMono);Number(env,value,"contractVersion",2);return value;}
    if(operation==Operation::SelectProject||operation==Operation::GuardProject||operation==Operation::SubmitProject||operation==Operation::CaptureProjectResult||
        operation==Operation::SelectExecution||operation==Operation::GuardExecution||operation==Operation::SubmitExecution||operation==Operation::CaptureExecutionResult||operation==Operation::CaptureStageResult||operation==Operation::CaptureRestorationResult||operation==Operation::CaptureAmeResult){if(count!=2||owner->pending)detail::Refuse("trusted_actual_project_operation_arguments");
        const auto project=Cap(env,arguments[0],owner);const auto request=OriginalRequest(env,arguments[1],owner);client.AssertLoadedNodeCurrent();
        if(operation==Operation::SelectProject)return Wrap(env,owner,client.SelectProject(project,request->request));
        if(operation==Operation::SelectExecution)return Wrap(env,owner,client.SelectExecution(project,request->request));
        if(operation==Operation::GuardProject){auto delivery=client.GuardProject(project);request->delivery=delivery;return Wrap(env,owner,std::move(delivery));}
        if(operation==Operation::GuardExecution){auto delivery=client.GuardExecution(project);request->delivery=delivery;request->executionDelivery=true;return Wrap(env,owner,std::move(delivery));}
        const bool submission=operation==Operation::SubmitProject||operation==Operation::SubmitExecution;
        const bool stage=operation==Operation::CaptureStageResult,restoration=operation==Operation::CaptureRestorationResult;
        if(stage&&!client.IsStageCommand(project))detail::Refuse("trusted_original_stage_result_command_required");
        if(restoration&&!client.IsRestorationCommand(project))detail::Refuse("trusted_original_restore_result_command_required");
        const bool ame=operation==Operation::CaptureAmeResult;if(ame&&!client.IsAmeCommand(project))detail::Refuse("trusted_original_exact_ame_result_method_required");
        if(operation==Operation::CaptureExecutionResult&&(client.IsStageCommand(project)||client.IsRestorationCommand(project)||client.IsAmeCommand(project)))detail::Refuse("trusted_original_exact_stage_result_method_required");
        const auto boundTool=operation==Operation::CaptureExecutionResult||operation==Operation::SubmitExecution||stage||restoration||ame?client.ExecutionToolForCommand(project):phase::ToolCode::GetProjectInfo;
        const auto actual=ParseOriginalJson(env,client.OriginalRequestBody(request->request));napi_value validated=nullptr;const auto receipt=OriginalPanelReceipt(env,actual,false,submission,&validated,boundTool);client.AssertLoadedNodeCurrent();
        if(operation==Operation::SubmitProject){client.RecordProjectSubmission(project,request->request,receipt);return Undefined(env);}
        if(operation==Operation::SubmitExecution){client.RecordExecutionSubmission(project,request->request,receipt);return Undefined(env);}
        std::shared_ptr<Capability> terminal;const bool preparation=operation==Operation::CaptureExecutionResult&&client.IsPreparationCommand(project);
        if(preparation){if(!owner->preparationGetter)detail::Refuse("trusted_original_preparation_result_getter_required");const auto descriptor=client.PreparationResultDescriptorFixed(project,request->request,receipt);
            napi_value argument=nullptr,getter=nullptr,global=nullptr,proofValue=nullptr;Check(napi_create_object(env,&argument));Property(env,argument,"descriptor",ParseOriginalJson(env,descriptor));Text(env,argument,"descriptorSha25664",Hex(detail::Hash(descriptor)));
            Check(napi_get_reference_value(env,owner->preparationGetter,&getter));Check(napi_get_global(env,&global));owner->pending=true;
            try{Check(napi_call_function(env,global,getter,1,&argument,&proofValue));bool promise=false;Check(napi_is_promise(env,proofValue,&promise));if(promise)detail::Refuse("trusted_original_preparation_synchronous_result_required");
                const auto proof=SerializeOriginalJson(env,proofValue);terminal=NativeExecutionBinding::PreparationResultFixed(client,project,request->request,receipt,proof);owner->pending=false;}
            catch(...){owner->pending=false;throw;}}
        else terminal=operation==Operation::CaptureExecutionResult||stage||restoration||ame?client.CaptureExecutionResultFixed(project,request->request,receipt):client.CaptureProjectResultFixed(project,request->request,receipt);
        napi_value result=nullptr;Check(napi_create_object(env,&result));Property(env,result,"terminal",Wrap(env,owner,terminal));Property(env,result,"value",validated);
        if(preparation)Property(env,result,"readTerminal",Wrap(env,owner,NativeExecutionBinding::PreparationReadFixed(client,terminal)));
        if(stage)Property(env,result,"savedSnapshot",Wrap(env,owner,client.CaptureOwnedSavedSnapshotFixed(terminal)));
        if(operation==Operation::CaptureExecutionResult){const auto mode=EmbeddedProfile().execution.selectionMode;
            if(mode!=TitleSelectionMode::FirstTwoObservedTextStatesV1&&mode!=TitleSelectionMode::ExactNamedVariants)detail::Refuse("trusted_readonly_selection_mode_refused");
            Text(env,result,"titleSelectionMode",mode==TitleSelectionMode::FirstTwoObservedTextStatesV1?"first_two_observed_text_states_v1":"exact_named_variants");}
        return result;}
    if(operation==Operation::CompleteResponse||operation==Operation::FailResponse){if(count!=(operation==Operation::CompleteResponse?3u:1u))detail::Refuse("trusted_actual_response_arguments");auto original=OriginalRequest(env,arguments[0],owner);
        if(operation==Operation::FailResponse){client.FailAuthenticatedResponse(original->request);return Undefined(env);}
        try{const auto bytes=Buffer(env,arguments[2],1048576,true);if(original->delivery){if(Unsigned(env,arguments[1])!=200)detail::Refuse("trusted_actual_delivery_response_status",0,true);const auto receipt=OriginalPanelReceipt(env,ParseOriginalJson(env,bytes),true,false);client.AssertLoadedNodeCurrent();
                if(original->completionDelivery)client.RecordOriginalCompletionPollDeliveryFixed(original->delivery,original->request,receipt);else if(original->executionDelivery)client.RecordExecutionDelivery(original->delivery,original->request,receipt);else client.RecordProjectDelivery(original->delivery,original->request,receipt);}
            client.CompleteAuthenticatedResponse(original->request,Unsigned(env,arguments[1]),bytes);Check(napi_delete_reference(env,original->originalRequest));original->originalRequest=nullptr;original->terminal=true;return Undefined(env);}
        catch(...){client.FailAuthenticatedResponse(original->request);throw;}}
    if(operation==Operation::NodeInventory||operation==Operation::PanelInventory){if(count)detail::Refuse("trusted_node_inventory_arguments");napi_value array=nullptr;Check(napi_create_array(env,&array));std::uint32_t at=0;
        if(operation==Operation::NodeInventory){for(const auto& source:client.NodeSourceInventory()){napi_value row=nullptr;Check(napi_create_object(env,&row));Number(env,row,"selector",source.selector);Text(env,row,"url",source.url);Text(env,row,"path",Utf8(env,source.file.pin.canonicalPath));Text(env,row,"compiledSha256",Hex(source.compiled));
                Text(env,row,"category",CategoryName(source.category));Text(env,row,"contextSlot",SlotName(source.contextSlot));Number(env,row,"endLine",source.endLine);Number(env,row,"endColumn",source.endColumn);Number(env,row,"length",source.length);SafeNumber(env,row,"utf8ByteLength",source.utf8ByteLength);Check(napi_set_element(env,array,at++,row));}
            napi_value inventory=nullptr;Check(napi_create_object(env,&inventory));Property(env,inventory,"rows",array);SafeNumber(env,inventory,"totalByteLength",client.NodeSourceByteBudget());client.AssertCurrent();return inventory;}
        for(const auto& file:client.PanelSourceInventory()){napi_value row=nullptr;Check(napi_create_object(env,&row));Text(env,row,"path",Utf8(env,file.pin.canonicalPath));Text(env,row,"rawSha256",Hex(file.sha256));Check(napi_set_element(env,array,at++,row));}client.AssertCurrent();return array;}
    if(operation==Operation::Transport||operation==Operation::DaemonTransport){if(count)detail::Refuse("trusted_node_transport_arguments");const auto bytes=operation==Operation::DaemonTransport?client.FixedDaemonTransport():client.FixedTransport();napi_value value=nullptr;void* copied=nullptr;Check(napi_create_buffer_copy(env,bytes.size(),bytes.data(),&copied,&value));client.AssertCurrent();return value;}
    if(operation==Operation::LoadedNode){if(count!=1)detail::Refuse("trusted_loaded_node_arguments");bool array=false;Check(napi_is_array(env,arguments[0],&array));if(!array)detail::Refuse("trusted_loaded_node_records_required");std::uint32_t length=0;Check(napi_get_array_length(env,arguments[0],&length));const auto fixed=client.NodeSourceInventory();if(!length||length!=fixed.size())detail::Refuse("trusted_loaded_node_record_limit");
        std::vector<LoadedSource> records;records.reserve(length);for(std::uint32_t i=0;i<length;++i){napi_value row=nullptr;Check(napi_get_element(env,arguments[0],i,&row));records.push_back(LoadedRecord(env,row,static_cast<std::size_t>(fixed[i].utf8ByteLength)));}
        client.BindLoadedNodeProof(records);
        if(client.GetRole()==Role::Daemon){napi_value global=nullptr,process=nullptr,main=nullptr;Check(napi_get_global(env,&global));Check(napi_get_named_property(env,global,"process",&process));main=OwnProperty(env,process,"mainModule");
            const auto filename=Utf16(env,OwnProperty(env,main,"filename"),32760);client.AssertFixedDaemonModule(std::wstring(filename.begin(),filename.end()));const auto exports=OwnProperty(env,main,"exports");
            const std::pair<const char*,napi_ref*> getters[]={{"ownedTrustedReadStatus",&owner->statusGetter},{"ownedTrustedReadObserve",&owner->observationGetter},{"ownedTrustedReadQuiescence",&owner->quiescenceGetter},{"ownedTrustedServerOnlyResult",&owner->serverOnlyGetter},{"ownedTrustedReadonlyScript",&owner->readonlyScriptGetter},{"ownedTrustedExecutionPreparation",&owner->preparationGetter},{"ownedTrustedExecutionGates",&owner->executionGateGetter},{"ownedTrustedPreparationScript",&owner->preparationScriptGetter},{"ownedTrustedStageScript",&owner->stageScriptGetter},{"ownedTrustedRestorationProgram",&owner->restorationProgramGetter},{"ownedTrustedRestorationScript",&owner->restorationScriptGetter},{"ownedTrustedAmeScript",&owner->ameScriptGetter},{"ownedTrustedAmeManualReservation",&owner->ameReservationGetter}};
            for(const auto& fixedGetter:getters){const auto getter=OwnProperty(env,exports,fixedGetter.first);napi_valuetype type=napi_undefined;Check(napi_typeof(env,getter,&type));if(type!=napi_function||*fixedGetter.second)detail::Refuse("trusted_fixed_main_getter_required");Check(napi_create_reference(env,getter,1,fixedGetter.second));}client.AssertLoadedNodeCurrent();}
        return Undefined(env);}
    if(operation==Operation::Locator){if(count!=1)detail::Refuse("trusted_node_locator_arguments");const auto bytes=client.ToolLocator(Cap(env,arguments[0],owner));napi_value value=nullptr;void* copied=nullptr;Check(napi_create_buffer_copy(env,bytes.size(),bytes.data(),&copied,&value));client.AssertCurrent();return value;}
    if(operation==Operation::AssertTarget){if(count!=1)detail::Refuse("trusted_node_target_arguments");client.AssertCapturedCurrent(Cap(env,arguments[0],owner));return Undefined(env);}
    const std::size_t expected=operation==Operation::BeginRead?2:operation==Operation::AdoptBracket||operation==Operation::TakeChallenge?1:0;if(count!=expected)detail::Refuse("trusted_node_typed_arguments");
    auto work=std::make_unique<Work>();work->owner=owner;work->operation=operation;if(expected)work->input=Cap(env,arguments[0],owner);if(operation==Operation::BeginRead)work->tool=Tool(env,arguments[1]);return Async(env,std::move(work));
    }catch(const detail::Failure& failure){napi_throw(env,Error(env,failure.code,failure.unknown));return nullptr;}catch(...){napi_throw_error(env,"trusted_node_api_unknown","trusted_node_api_unknown");return nullptr;}}
struct Factories final {bool controller=false,daemon=false;};
napi_value Factory(napi_env env,napi_callback_info info){try{std::size_t count=1;napi_value argument=nullptr;void* data=nullptr;Check(napi_get_cb_info(env,info,&count,&argument,nullptr,&data));if(count)detail::Refuse("trusted_node_fixed_factory_arguments");
    void* pointer=nullptr;Check(napi_get_instance_data(env,&pointer));auto* factories=static_cast<Factories*>(pointer);if(!factories)detail::Refuse("trusted_node_factory_state_missing");
    const bool daemon=reinterpret_cast<std::uintptr_t>(data)==2;auto& consumed=daemon?factories->daemon:factories->controller;if(consumed)detail::Refuse("trusted_node_original_factory_once");
    const napi_node_version* version=nullptr;Check(napi_get_node_version(env,&version));std::uint32_t napi=0;Check(napi_get_version(env,&napi));if(!version||version->major!=24||version->minor!=19||version->patch!=0||napi<8)detail::Refuse("trusted_node_current_runtime_refused");
    consumed=true;auto instance=std::make_shared<Instance>();instance->requests.reserve(192);instance->native=daemon?std::shared_ptr<NativeClient>(NativeClient::BindOriginalDaemonFixed()):std::shared_ptr<NativeClient>(NativeClient::OpenControllerFixed());
    auto role=HttpTransportBinding::Role(env,std::make_shared<HttpOwner>(instance));
    const std::pair<const char*,Operation> methods[]={{"assertSessionCurrent",Operation::Assert},{"open",Operation::Open},{"ensure",Operation::Ensure},{"status",Operation::Status},
        {"beginPanel",Operation::BeginPanel},{"beginBracket",Operation::BeginBracket},{"beginRead",Operation::BeginRead},{"adoptBracket",Operation::AdoptBracket},{"toolLocator",Operation::Locator},
        {"beginExecutionFixed",Operation::BeginExecution},{"verifyExecutionTool",Operation::VerifyExecution},
        {"bindExecutionFixed",Operation::BindExecution},{"bindPreparationDeliveryFixed",Operation::BindPreparationDelivery},{"describeExecution",Operation::DescribeExecution},{"selectExecution",Operation::SelectExecution},{"guardExecution",Operation::GuardExecution},
        {"describeRestorationDebtFixed",Operation::DescribeRestorationDebt},{"preissueRestorationFixed",Operation::PreissueRestoration},{"bindRestorationDeliveryFixed",Operation::BindRestorationDelivery},{"captureRestorationResultFixed",Operation::CaptureRestorationResult},{"bindStageDeliveryFixed",Operation::BindStageDelivery},{"captureStageResultFixed",Operation::CaptureStageResult},
        {"manualExecutionPreflightFixed",Operation::ManualPreflight},
        {"executeOwnedCheckpointFixed",Operation::ExecuteCheckpoint},{"executeOwnedCleanCopyFixed",Operation::ExecuteCleanCopy},{"describeOwnedCheckpointFixed",Operation::DescribeCheckpoint},{"describeOwnedCleanCopyFixed",Operation::DescribeCleanCopy},{"describeOwnedSavedSnapshotFixed",Operation::DescribeSavedSnapshot},
        {"recordExecutionSubmission",Operation::SubmitExecution},{"captureExecutionResultFixed",Operation::CaptureExecutionResult},
        {"captureOriginalAmeFixed",Operation::CaptureAme},
        {"bindAmeSourceInspectionFixed",Operation::BindAmeInspection},{"bindAmeDeliveryFixed",Operation::BindAmeDelivery},{"captureAmeResultFixed",Operation::CaptureAmeResult},{"ameCommandFactsFixed",Operation::DescribeAmeCommand},{"bindOriginalJobFixed",Operation::BindOriginalJob},
        {"ameQueuePreparationFactsFixed",Operation::AmeQueueFacts},{"assertAmeCommandCurrentFixed",Operation::AssertAmeCommand},{"captureOriginalAmeManualReservationFixed",Operation::CaptureAmeReservation},
        {"beginOriginalCompletionPollFixed",Operation::BeginCompletionPoll},{"describeOriginalCompletionPollFixed",Operation::DescribeCompletionPoll},{"selectOriginalCompletionPollFixed",Operation::SelectCompletionPoll},{"originalCompletionFactsFixed",Operation::CompletionFacts},
        {"abandonOriginalCompletionPollFixed",Operation::AbandonCompletionPoll},
        {"captureSelectionFixed",Operation::CaptureSelection},{"describeSelectionFixed",Operation::DescribeSelection},{"captureManifestFixed",Operation::CaptureManifest},
        {"captureExecutionPreparationFixed",Operation::CapturePreparation},{"captureServerGatesFixed",Operation::CaptureGates},{"acceptOriginalManualAdoptFixed",Operation::AcceptManualAdopt},{"originalDeadlineProjectionFixed",Operation::DeadlineProjection},
        {"beginServerOnlyFixed",Operation::BeginServerOnly},{"verifyServerOnlyTool",Operation::VerifyServerOnly},{"captureServerOnlyResultFixed",Operation::CaptureServerOnly},
        {"takeChallenge",Operation::TakeChallenge},{"captureOriginalAeFixed",Operation::CapturePreactor},{"captureOriginalAeCepFixed",Operation::CaptureTarget},{"assertCapturedCurrent",Operation::AssertTarget},{"nodeSourceInventory",Operation::NodeInventory},
        {"panelSourceInventory",Operation::PanelInventory},{"fixedTransport",Operation::Transport},{"bindLoadedNodeProof",Operation::LoadedNode},{"invalidateLoadedNodeProof",Operation::InvalidateSource},{"revokeOnce",Operation::Revoke},
        {"cepSourceInventory",Operation::CepInventory},{"invalidateLoadedCepProof",Operation::InvalidateCep},{"captureObservationFixed",Operation::CaptureObservation},{"submitObservation",Operation::SubmitObservation},{"observeActor",Operation::ObserveActor},
        {"fixedDaemonTransport",Operation::DaemonTransport},
        {"assertPreactorCurrent",Operation::AssertPreactor},{"preactorObserverDefinition",Operation::PreactorInventory},{"reservePanelBootstrapFixed",Operation::ReserveBootstrap},{"launchPanelBootstrapFixed",Operation::LaunchBootstrap},{"assertBootstrapSettled",Operation::BootstrapSettled},
        {"retainAuthenticatedRequest",Operation::RetainRequest},{"completeAuthenticatedResponse",Operation::CompleteResponse},{"failAuthenticatedResponse",Operation::FailResponse},{"verifyTool",Operation::VerifyTool},{"captureLocalStatusFixed",Operation::CaptureStatus},
        {"completeOriginalIdleRequestCleanup",Operation::CompleteIdleCleanup},
        {"bindProjectFixed",Operation::BindProject},{"describeProject",Operation::DescribeProject},{"selectProject",Operation::SelectProject},{"guardProject",Operation::GuardProject},{"recordProjectSubmission",Operation::SubmitProject},{"captureProjectResultFixed",Operation::CaptureProjectResult},
        {"assertOriginalDispositionCurrent",Operation::DispositionCurrent},{"pollOriginalEvent",Operation::PollEvent},{"originalEventKind",Operation::EventKind},{"acknowledgeOriginalDisposition",Operation::AckDisposition}};
    for(const auto& method:methods){napi_property_descriptor descriptor{method.first,nullptr,Dispatch,nullptr,nullptr,nullptr,napi_default,reinterpret_cast<void*>(static_cast<std::uintptr_t>(method.second))};Check(napi_define_properties(env,role,1,&descriptor));}return role;
    }catch(const detail::Failure& failure){napi_throw(env,Error(env,failure.code,failure.unknown));return nullptr;}catch(...){napi_throw_error(env,"trusted_node_factory_unknown","trusted_node_factory_unknown");return nullptr;}}
napi_value Init(napi_env env,napi_value exports){auto state=std::make_unique<Factories>();Check(napi_set_instance_data(env,state.get(),[](napi_env,void* pointer,void*){delete static_cast<Factories*>(pointer);},nullptr));(void)state.release();
    const napi_property_descriptor methods[]={{"openControllerFixed",nullptr,Factory,nullptr,nullptr,nullptr,napi_default,reinterpret_cast<void*>(1)},
        {"bindOriginalDaemonFixed",nullptr,Factory,nullptr,nullptr,nullptr,napi_default,reinterpret_cast<void*>(2)}};Check(napi_define_properties(env,exports,2,methods));return exports;
}
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
