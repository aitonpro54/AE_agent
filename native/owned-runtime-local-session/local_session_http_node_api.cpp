#include "local_session_http_node_api.h"
#include <algorithm>
#include <array>
#include <cstring>
#include <string>

namespace local_session::trusted_read {
namespace {
constexpr napi_type_tag kRoleTag{0x7b3e4a86cb224173ULL,0xa4da20cd679b4602ULL},kObjectTag{0xee725c36e9ec49acULL,0x8617ae8941b0931fULL};
enum class ObjectKind {Listener,Connection};
enum class Operation : std::uintptr_t {Assert=1,Listen,Accept,Read,Write,End,CloseConnection,CloseListener,Peer,Brand};
struct RoleBox final {std::shared_ptr<HttpTransportOwner> owner;bool listening=false;};
struct ObjectBox final {ObjectKind kind;std::shared_ptr<HttpTransportOwner> owner;std::shared_ptr<FixedHttpListener> listener;std::shared_ptr<AcceptedConnection> connection;napi_ref stream=nullptr;bool branded=false;};
void Check(napi_status status){if(status!=napi_ok)detail::Refuse("trusted_napi_operation_failed");}
napi_value Undefined(napi_env env){napi_value v=nullptr;Check(napi_get_undefined(env,&v));return v;}
napi_value Error(napi_env env,const std::string& code,bool unknown){napi_value message=nullptr,error=nullptr,value=nullptr;Check(napi_create_string_utf8(env,code.c_str(),code.size(),&message));Check(napi_create_error(env,nullptr,message,&error));Check(napi_set_named_property(env,error,"code",message));Check(napi_get_boolean(env,unknown,&value));Check(napi_set_named_property(env,error,"unknown",value));return error;}
bool Tagged(napi_env env,napi_value value,const napi_type_tag& tag){bool result=false;return value&&napi_check_object_type_tag(env,value,&tag,&result)==napi_ok&&result;}
RoleBox& ReadRole(napi_env env,napi_value value){void* p=nullptr;if(!Tagged(env,value,kRoleTag)||napi_unwrap(env,value,&p)!=napi_ok||!p)detail::Refuse("trusted_original_http_owner_required");return *static_cast<RoleBox*>(p);}
ObjectBox& Object(napi_env env,napi_value value,HttpTransportOwner* owner,ObjectKind kind){void* p=nullptr;if(!Tagged(env,value,kObjectTag)||napi_unwrap(env,value,&p)!=napi_ok||!p)detail::Refuse("trusted_original_http_cap_required");auto& object=*static_cast<ObjectBox*>(p);if(object.owner.get()!=owner||object.kind!=kind)detail::Refuse("trusted_foreign_http_cap_refused");return object;}
void FinalizeObject(napi_env env,void* data,void*){auto* object=static_cast<ObjectBox*>(data);if(object->stream){napi_delete_reference(env,object->stream);object->stream=nullptr;}
    // Destruction itself may be the first close attempt. Check its actual
    // outcome before releasing the original owner or listener lifetime.
    if(object->connection)object->connection->CloseOnce();if(object->listener)object->listener->CloseOnce();
    if(object->connection&&object->connection->Unknown())return;if(object->listener&&object->listener->Unknown())return;delete object;}
napi_value Wrap(napi_env env,std::unique_ptr<ObjectBox> object){napi_value value=nullptr;Check(napi_create_object(env,&value));Check(napi_type_tag_object(env,value,&kObjectTag));Check(napi_wrap(env,value,object.get(),FinalizeObject,nullptr,nullptr));(void)object.release();return value;}
struct Work final {napi_env env;Operation operation;std::shared_ptr<HttpTransportOwner> owner;std::shared_ptr<FixedHttpListener> listener;std::shared_ptr<AcceptedConnection> connection;
    std::vector<unsigned char> bytes;napi_async_work work=nullptr;napi_deferred deferred=nullptr;std::string error;bool unknown=false;};
void Execute(napi_env,void* pointer){auto& work=*static_cast<Work*>(pointer);try{switch(work.operation){
    case Operation::Accept:work.connection=work.listener->Accept();break;
    case Operation::Read:work.bytes=work.connection->Read();break;
    case Operation::Write:work.connection->Write(work.bytes);break;
    case Operation::End:work.connection->End();break;
    case Operation::CloseConnection:work.connection->CloseOnce();if(work.connection->Unknown())detail::Refuse("trusted_socket_close_unknown",0,true);break;
    case Operation::CloseListener:work.listener->CloseOnce();if(work.listener->Unknown())detail::Refuse("trusted_listener_close_unknown",0,true);break;
    default:detail::Refuse("trusted_napi_http_work_refused");}
    }catch(const detail::Failure& failure){work.error=failure.code;work.unknown=failure.unknown;}catch(...){work.error="trusted_napi_http_unknown";work.unknown=true;}}
void Complete(napi_env env,napi_status status,void* pointer){std::unique_ptr<Work> work(static_cast<Work*>(pointer));try{if(status!=napi_ok&&work->error.empty()){work->error="trusted_napi_http_cancelled";work->unknown=true;}
    if(!work->error.empty())Check(napi_reject_deferred(env,work->deferred,Error(env,work->error,work->unknown)));
    else{napi_value value=Undefined(env);if(work->operation==Operation::Accept){auto object=std::make_unique<ObjectBox>();object->kind=ObjectKind::Connection;object->owner=work->owner;object->connection=work->connection;value=Wrap(env,std::move(object));}
        else if(work->operation==Operation::Read){void* copied=nullptr;Check(napi_create_buffer_copy(env,work->bytes.size(),work->bytes.data(),&copied,&value));}Check(napi_resolve_deferred(env,work->deferred,value));}
    }catch(...){napi_throw_error(env,"trusted_napi_http_completion_unknown","trusted_napi_http_completion_unknown");}napi_delete_async_work(env,work->work);}
napi_value Async(napi_env env,std::unique_ptr<Work> work){napi_value promise=nullptr,name=nullptr;work->env=env;Check(napi_create_promise(env,&work->deferred,&promise));Check(napi_create_string_utf8(env,"owned-original-socket",NAPI_AUTO_LENGTH,&name));Check(napi_create_async_work(env,nullptr,name,Execute,Complete,work.get(),&work->work));Check(napi_queue_async_work(env,work->work));(void)work.release();return promise;}
napi_value Dispatch(napi_env env,napi_callback_info info){try{std::array<napi_value,3> args{};std::size_t count=args.size();napi_value self=nullptr;void* data=nullptr;Check(napi_get_cb_info(env,info,&count,args.data(),&self,&data));auto& role=ReadRole(env,self);const auto operation=static_cast<Operation>(reinterpret_cast<std::uintptr_t>(data));
    if(operation==Operation::Assert){if(count)detail::Refuse("trusted_http_assert_arguments");role.owner->AssertCurrent();return Undefined(env);}
    if(operation==Operation::Listen){if(count||role.listening)detail::Refuse("trusted_http_listener_once");role.owner->AssertCurrent();role.listening=true;auto object=std::make_unique<ObjectBox>();object->kind=ObjectKind::Listener;object->owner=role.owner;object->listener=HttpTransportBinding::Listen(*role.owner);return Wrap(env,std::move(object));}
    const bool listener=operation==Operation::Accept||operation==Operation::CloseListener;const std::size_t expected=operation==Operation::Write||operation==Operation::Brand?2:1;if(count!=expected)detail::Refuse("trusted_http_cap_arguments");auto& object=Object(env,args[0],role.owner.get(),listener?ObjectKind::Listener:ObjectKind::Connection);
    if(operation==Operation::Brand){if(object.branded)detail::Refuse("trusted_original_stream_once");napi_valuetype type=napi_undefined;Check(napi_typeof(env,args[1],&type));if(type!=napi_object)detail::Refuse("trusted_original_stream_object_required");object.connection->AssertCurrent();object.branded=true;
        // The live server/request already owns its stream. A weak reference
        // preserves exact identity without stream -> connection -> stream GC cycle.
        Check(napi_create_reference(env,args[1],0,&object.stream));return Undefined(env);}
    if(operation==Operation::Peer){object.connection->AssertCurrent();const auto& p=object.connection->Peer();napi_value result=nullptr,value=nullptr;Check(napi_create_object(env,&result));
        for(const auto* name:{"localAddress","remoteAddress"}){Check(napi_create_string_utf8(env,"127.0.0.1",NAPI_AUTO_LENGTH,&value));Check(napi_set_named_property(env,result,name,value));}
        Check(napi_create_uint32(env,p.localPort,&value));Check(napi_set_named_property(env,result,"localPort",value));Check(napi_create_uint32(env,p.remotePort,&value));Check(napi_set_named_property(env,result,"remotePort",value));return result;}
    auto work=std::make_unique<Work>();work->operation=operation;work->owner=role.owner;work->listener=object.listener;work->connection=object.connection;
    if(operation==Operation::CloseConnection&&object.stream){Check(napi_delete_reference(env,object.stream));object.stream=nullptr;}
    if(operation==Operation::Write){bool buffer=false;Check(napi_is_buffer(env,args[1],&buffer));if(!buffer)detail::Refuse("trusted_socket_write_buffer_required");void* bytes=nullptr;std::size_t length=0;Check(napi_get_buffer_info(env,args[1],&bytes,&length));if(!length||length>65536)detail::Refuse("trusted_socket_write_limit");const auto* begin=static_cast<unsigned char*>(bytes);work->bytes.assign(begin,begin+length);}return Async(env,std::move(work));
    }catch(const detail::Failure& failure){napi_throw(env,Error(env,failure.code,failure.unknown));return nullptr;}catch(...){napi_throw_error(env,"trusted_napi_http_unknown","trusted_napi_http_unknown");return nullptr;}}
}
std::shared_ptr<FixedHttpListener> HttpTransportBinding::Listen(HttpTransportOwner& owner){return std::shared_ptr<FixedHttpListener>(new FixedHttpListener(owner));}
napi_value HttpTransportBinding::Role(napi_env env,std::shared_ptr<HttpTransportOwner> original){if(!original)detail::Refuse("trusted_http_original_owner_required");napi_value object=nullptr;Check(napi_create_object(env,&object));auto box=std::make_unique<RoleBox>();box->owner=std::move(original);Check(napi_type_tag_object(env,object,&kRoleTag));Check(napi_wrap(env,object,box.get(),[](napi_env,void* pointer,void*){delete static_cast<RoleBox*>(pointer);},nullptr,nullptr));(void)box.release();
    const std::array<std::pair<const char*,Operation>,10> methods={{{"assertCurrent",Operation::Assert},{"openHttpListenerFixed",Operation::Listen},{"acceptFixed",Operation::Accept},{"connectionRead",Operation::Read},{"connectionWrite",Operation::Write},{"connectionEnd",Operation::End},{"connectionClose",Operation::CloseConnection},{"closeHttpListenerFixed",Operation::CloseListener},{"connectionPeer",Operation::Peer},{"brandHttpStream",Operation::Brand}}};
    for(const auto& method:methods){napi_property_descriptor descriptor{method.first,nullptr,Dispatch,nullptr,nullptr,nullptr,napi_default,reinterpret_cast<void*>(static_cast<std::uintptr_t>(method.second))};Check(napi_define_properties(env,object,1,&descriptor));}return object;}
std::shared_ptr<HttpTransportOwner> HttpTransportBinding::Owner(napi_env env,napi_value role){return ReadRole(env,role).owner;}
std::shared_ptr<AcceptedConnection> HttpTransportBinding::Connection(napi_env env,napi_value role,napi_value cap){auto owner=Owner(env,role);return Object(env,cap,owner.get(),ObjectKind::Connection).connection;}
void HttpTransportBinding::AssertRequestStream(napi_env env,napi_value role,napi_value cap,napi_value request){auto owner=Owner(env,role);auto& object=Object(env,cap,owner.get(),ObjectKind::Connection);if(!object.stream)detail::Refuse("trusted_original_stream_brand_required");napi_value stream=nullptr,actual=nullptr;Check(napi_get_reference_value(env,object.stream,&stream));if(!stream)detail::Refuse("trusted_original_stream_collected");Check(napi_get_named_property(env,request,"socket",&actual));bool equal=false;Check(napi_strict_equals(env,stream,actual,&equal));if(!equal)detail::Refuse("trusted_foreign_http_request_stream");object.connection->AssertCurrent();}
} // namespace local_session::trusted_read
