#if !defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) || AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF != 1
#error "Isolated HTTP transport proof is a distinct authority=false target."
#endif
#if defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || defined(AE_AGENT_PHASE_PRODUCTION_TARGET)
#error "Production authority is forbidden in the isolated transport fixture."
#endif
#include <windows.h>
#include "local_session_http_node_api.h"
#include "local_session_http_transport_proof_pins.h"
#include <array>
#include <memory>
#include <string>

namespace {
using namespace local_session;using namespace local_session::trusted_read;
void Check(napi_status status){if(status!=napi_ok)detail::Refuse("http_proof_napi_refused");}
std::string String(napi_env env,napi_value value,std::size_t maximum){std::size_t length=0;Check(napi_get_value_string_utf8(env,value,nullptr,0,&length));if(length>maximum)detail::Refuse("http_proof_string_limit");std::vector<char> bytes(length+1,0);std::size_t written=0;Check(napi_get_value_string_utf8(env,value,bytes.data(),bytes.size(),&written));if(written!=length)detail::Refuse("http_proof_string_read");return std::string(bytes.data(),length);}
struct Owner final : HttpTransportOwner {
    detail::Held original,image;ObjectPin imagePin;Digest imageHash{};std::uint64_t birth=0;std::wstring sid,imagePath;
    Owner(){HANDLE actual=nullptr;if(!DuplicateHandle(GetCurrentProcess(),GetCurrentProcess(),GetCurrentProcess(),&actual,PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,0))detail::Refuse("http_proof_original_self_handle_required",GetLastError());original=detail::Held(actual);
        birth=detail::ProcessBirth(original.Get());sid=detail::ProcessSid(original.Get());imagePath=detail::ProcessImage(original.Get());const auto& expected=local_session_http_proof_reviewed::kNode;
        if(imagePath!=expected.pin.canonicalPath||sid!=local_session_http_proof_reviewed::kSid)detail::Refuse("http_proof_pinned_node_identity_refused");image=detail::Held(CreateFileW(imagePath.c_str(),FILE_READ_DATA|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));if(!image.Valid())detail::Refuse("http_proof_original_image_required",GetLastError());imagePin=detail::ReadPin(image.Get(),false);imageHash=detail::Hash(detail::ReadExact(image.Get(),134217728));if(!detail::SamePin(imagePin,expected.pin)||imageHash!=expected.sha256)detail::Refuse("http_proof_pinned_node_bytes_refused");AssertCurrent();}
    void AssertCurrent()override{if(!detail::ProcessLive(original.Get())||detail::ProcessBirth(original.Get())!=birth||detail::ProcessSid(original.Get())!=sid||detail::ProcessImage(original.Get())!=imagePath||!detail::SamePin(detail::ReadPin(image.Get(),false),imagePin))detail::Refuse("http_proof_original_owner_changed");}
    std::uint16_t HttpFixedPort()const noexcept override{return 23456;}
    bool OriginalCleanupCurrent(HttpCleanupOperation operation)noexcept override{try{
        if(operation!=HttpCleanupOperation::EndNoPayload&&operation!=HttpCleanupOperation::Close)return false;AssertCurrent();return true;
    }catch(...){return false;}}
    bool ReadRevokedKnown()const noexcept override{return false;}
};
constexpr napi_type_tag kRequestTag{0x5e442408f169430cULL,0x9b73530f3b4bc2d5ULL};
struct Request final {std::shared_ptr<HttpTransportOwner> owner;std::shared_ptr<AcceptedConnection> connection;napi_ref req=nullptr;std::uint64_t ordinal=0;bool finished=false;};
struct Fixture final {std::vector<napi_ref> used;bool opened=false;};
napi_value Capture(napi_env env,napi_callback_info info){try{std::array<napi_value,3> args{};std::size_t count=args.size();napi_value role=nullptr;void* pointer=nullptr;Check(napi_get_cb_info(env,info,&count,args.data(),&role,&pointer));if(count!=2)detail::Refuse("http_proof_capture_arguments");auto& fixture=*static_cast<Fixture*>(pointer);auto owner=HttpTransportBinding::Owner(env,role);HttpTransportBinding::AssertRequestStream(env,role,args[0],args[1]);
    for(auto used:fixture.used){napi_value previous=nullptr;bool equal=false;Check(napi_get_reference_value(env,used,&previous));Check(napi_strict_equals(env,previous,args[1],&equal));if(equal)detail::Refuse("http_proof_request_duplicate");}if(fixture.used.size()>=192)detail::Refuse("http_proof_request_budget");
    napi_value headers=nullptr,token=nullptr,host=nullptr;Check(napi_get_named_property(env,args[1],"headers",&headers));Check(napi_get_named_property(env,headers,"x-ae-bridge-token",&token));Check(napi_get_named_property(env,headers,"host",&host));if(String(env,token,64)!="proof-automation"||String(env,host,64)!="127.0.0.1:23456")detail::Refuse("http_proof_authentication_refused");
    auto request=std::make_unique<Request>();request->owner=owner;request->connection=HttpTransportBinding::Connection(env,role,args[0]);request->ordinal=request->connection->NextRequest();Check(napi_create_reference(env,args[1],1,&request->req));napi_ref used=nullptr;Check(napi_create_reference(env,args[1],1,&used));fixture.used.push_back(used);
    napi_value result=nullptr;Check(napi_create_object(env,&result));Check(napi_type_tag_object(env,result,&kRequestTag));Check(napi_wrap(env,result,request.get(),[](napi_env e,void* p,void*){auto* value=static_cast<Request*>(p);if(value->req)napi_delete_reference(e,value->req);delete value;},nullptr,nullptr));(void)request.release();return result;
    }catch(const detail::Failure& failure){napi_throw_error(env,failure.code.c_str(),failure.code.c_str());return nullptr;}}
napi_value Finish(napi_env env,napi_callback_info info){try{std::array<napi_value,4> args{};std::size_t count=args.size();napi_value role=nullptr;Check(napi_get_cb_info(env,info,&count,args.data(),&role,nullptr));if(count!=3)detail::Refuse("http_proof_finish_arguments");bool tagged=false;Check(napi_check_object_type_tag(env,args[0],&kRequestTag,&tagged));void* pointer=nullptr;if(!tagged||napi_unwrap(env,args[0],&pointer)!=napi_ok||!pointer)detail::Refuse("http_proof_original_request_cap_required");auto& request=*static_cast<Request*>(pointer);if(request.owner.get()!=HttpTransportBinding::Owner(env,role).get()||request.finished)detail::Refuse("http_proof_terminal_once");
    std::uint32_t status=0;Check(napi_get_value_uint32(env,args[1],&status));bool buffer=false;Check(napi_is_buffer(env,args[2],&buffer));void* bytes=nullptr;std::size_t length=0;if(!buffer)detail::Refuse("http_proof_response_buffer_required");Check(napi_get_buffer_info(env,args[2],&bytes,&length));if(status<100||status>599||length>1048576)detail::Refuse("http_proof_response_shape");request.owner->AssertCurrent();request.connection->AssertCurrent();request.finished=true;
    napi_value value=nullptr;Check(napi_get_undefined(env,&value));return value;
    }catch(const detail::Failure& failure){napi_throw_error(env,failure.code.c_str(),failure.code.c_str());return nullptr;}}
napi_value Cleanup(napi_env env,napi_callback_info info){try{std::size_t count=1;napi_value argument=nullptr,role=nullptr;void* pointer=nullptr;Check(napi_get_cb_info(env,info,&count,&argument,&role,&pointer));auto& fixture=*static_cast<Fixture*>(pointer);
    if(count||fixture.opened)detail::Refuse("http_proof_cleanup_fixed_once");fixture.opened=true;auto owner=HttpTransportBinding::Owner(env,role);if(!RunHttpCleanupFaultsFixed(*owner))detail::Refuse("http_proof_cleanup_failed");napi_value value=nullptr;Check(napi_get_boolean(env,true,&value));return value;
    }catch(const detail::Failure& failure){napi_throw_error(env,failure.code.c_str(),failure.code.c_str());return nullptr;}}
napi_value CloseFailure(napi_env env,napi_callback_info info){try{std::size_t count=1;napi_value argument=nullptr,role=nullptr;void* pointer=nullptr;Check(napi_get_cb_info(env,info,&count,&argument,&role,&pointer));auto& fixture=*static_cast<Fixture*>(pointer);
    if(count||fixture.opened)detail::Refuse("http_proof_close_failure_fixed_once");fixture.opened=true;auto owner=HttpTransportBinding::Owner(env,role);if(!RunHttpCloseFailureFaultsFixed(owner))detail::Refuse("http_proof_close_failure_failed");napi_value value=nullptr;Check(napi_get_boolean(env,true,&value));return value;
    }catch(const detail::Failure& failure){napi_throw_error(env,failure.code.c_str(),failure.code.c_str());return nullptr;}}
napi_value RevokeFaults(napi_env env,napi_callback_info info){try{std::size_t count=1;napi_value argument=nullptr,role=nullptr;void* pointer=nullptr;Check(napi_get_cb_info(env,info,&count,&argument,&role,&pointer));auto& fixture=*static_cast<Fixture*>(pointer);
    if(count||fixture.opened)detail::Refuse("http_proof_revoke_faults_fixed_once");fixture.opened=true;auto owner=HttpTransportBinding::Owner(env,role);if(!RunHttpRevokeFaultsFixed(owner))detail::Refuse("http_proof_revoke_faults_failed");napi_value value=nullptr;Check(napi_get_boolean(env,true,&value));return value;
    }catch(const detail::Failure& failure){napi_throw_error(env,failure.code.c_str(),failure.code.c_str());return nullptr;}}
napi_value IdleWriteFaults(napi_env env,napi_callback_info info){try{std::size_t count=1;napi_value argument=nullptr,role=nullptr;void* pointer=nullptr;Check(napi_get_cb_info(env,info,&count,&argument,&role,&pointer));auto& fixture=*static_cast<Fixture*>(pointer);
    if(count||fixture.opened)detail::Refuse("http_proof_idle_write_fixed_once");fixture.opened=true;auto owner=HttpTransportBinding::Owner(env,role);if(!RunHttpIdleWriteFaultsFixed(owner))detail::Refuse("http_proof_idle_write_failed");napi_value value=nullptr;Check(napi_get_boolean(env,true,&value));return value;
    }catch(const detail::Failure& failure){napi_throw_error(env,failure.code.c_str(),failure.code.c_str());return nullptr;}}
napi_value Open(napi_env env,napi_callback_info info){try{std::size_t count=1;napi_value argument=nullptr;void* pointer=nullptr;Check(napi_get_cb_info(env,info,&count,&argument,nullptr,&pointer));auto& fixture=*static_cast<Fixture*>(pointer);if(count||fixture.opened)detail::Refuse("http_proof_fixed_factory_once");fixture.opened=true;std::uint32_t version=0;Check(napi_get_version(env,&version));if(version<8)detail::Refuse("http_proof_napi_baseline");auto role=HttpTransportBinding::Role(env,std::make_shared<Owner>());
    auto* cleanupOnce=new Fixture();auto* closeFailureOnce=new Fixture();auto* revokeOnce=new Fixture();auto* idleWriteOnce=new Fixture();const napi_property_descriptor methods[]={{"retainAuthenticatedRequest",nullptr,Capture,nullptr,nullptr,nullptr,napi_default,&fixture},{"completeAuthenticatedResponse",nullptr,Finish,nullptr,nullptr,nullptr,napi_default,nullptr},{"cleanupFaultsFixed",nullptr,Cleanup,nullptr,nullptr,nullptr,napi_default,cleanupOnce},{"closeFailureFaultsFixed",nullptr,CloseFailure,nullptr,nullptr,nullptr,napi_default,closeFailureOnce},{"revokeFaultsFixed",nullptr,RevokeFaults,nullptr,nullptr,nullptr,napi_default,revokeOnce},{"idleWriteFaultsFixed",nullptr,IdleWriteFaults,nullptr,nullptr,nullptr,napi_default,idleWriteOnce}};Check(napi_define_properties(env,role,6,methods));Check(napi_add_env_cleanup_hook(env,[](void* value){delete static_cast<Fixture*>(value);},cleanupOnce));Check(napi_add_env_cleanup_hook(env,[](void* value){delete static_cast<Fixture*>(value);},closeFailureOnce));Check(napi_add_env_cleanup_hook(env,[](void* value){delete static_cast<Fixture*>(value);},revokeOnce));Check(napi_add_env_cleanup_hook(env,[](void* value){delete static_cast<Fixture*>(value);},idleWriteOnce));return role;
    }catch(const detail::Failure& failure){napi_throw_error(env,failure.code.c_str(),failure.code.c_str());return nullptr;}}
napi_value Init(napi_env env,napi_value exports){auto* fixture=new Fixture();napi_property_descriptor method{"openFixedProofTransport",nullptr,Open,nullptr,nullptr,nullptr,napi_default,fixture};Check(napi_define_properties(env,exports,1,&method));napi_value authority=nullptr;Check(napi_get_boolean(env,false,&authority));Check(napi_set_named_property(env,exports,"productionAuthority",authority));
    Check(napi_add_env_cleanup_hook(env,[](void* pointer){delete static_cast<Fixture*>(pointer);},fixture));return exports;}
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
