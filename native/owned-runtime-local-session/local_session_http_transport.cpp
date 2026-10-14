#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include "local_session_http_transport.h"
#include <algorithm>
#include <limits>

namespace local_session::trusted_read {
enum class CloseStage:std::uint8_t {Open,Closing,Closed,Unknown};
struct HttpAcceptedOriginal final {
    std::uintptr_t socket;std::atomic<CloseStage> stage{CloseStage::Open};std::weak_ptr<AcceptedConnection> connection;
    explicit HttpAcceptedOriginal(std::uintptr_t value):socket(value){}
};
struct HttpSocketLifetime final {
    std::atomic<bool> unknown{false};std::vector<std::shared_ptr<HttpAcceptedOriginal>> originals;
    std::uintptr_t listenerOriginal=static_cast<std::uintptr_t>(INVALID_SOCKET);
    // UNKNOWN originals survive connection/listener destruction. Only the
    // original process exit releases their OS identities; no close is replayed.
    std::shared_ptr<HttpSocketLifetime> retainedUnknown;
};
namespace {
using detail::Refuse;
constexpr std::size_t kChunk=65536,kConnections=64,kRequests=192;
constexpr std::uint64_t kIoMs=1000;
void RetainUnknown(const std::shared_ptr<HttpSocketLifetime>& lifetime)noexcept{
    if(!lifetime->unknown.exchange(true))lifetime->retainedUnknown=lifetime;
}
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
enum class CleanupFault {None,CreateSocket,BeforeUnique,AfterUnique,AfterShared,AfterVector,AcceptedClose,End};
enum class RevokePoint {None,BeforeAccept,AfterAccept,BeforeRead,AfterRead,BeforeWrite,AfterWrite};
RevokePoint revokePoint=RevokePoint::None;std::atomic<bool>* revokeTarget=nullptr;
void RevokeAt(RevokePoint point){if(revokePoint==point&&revokeTarget){*revokeTarget=true;revokePoint=RevokePoint::None;}}
#define HTTP_REVOKE_AT(point) RevokeAt(RevokePoint::point)
struct CleanupCount {std::atomic<std::uint64_t> accepted{0},acceptedSucceeded{0},startup{0},cleanup{0},ended{0},listener{0},acceptIo{0},recvIo{0},sendIo{0};};
CleanupFault cleanupFault=CleanupFault::None;CleanupCount cleanupCount;
void Fault(CleanupFault point){if(cleanupFault==point){cleanupFault=CleanupFault::None;Refuse("http_proof_cleanup_injected");}}
#define HTTP_CLEANUP_FAULT(point) Fault(CleanupFault::point)
#define HTTP_IO_ATTEMPT(name) (++cleanupCount.name)
#else
#define HTTP_CLEANUP_FAULT(point) ((void)0)
#define HTTP_REVOKE_AT(point) ((void)0)
#define HTTP_IO_ATTEMPT(name) ((void)0)
#endif
int CloseAccepted(SOCKET original)noexcept{
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
    ++cleanupCount.accepted;
    if(cleanupFault==CleanupFault::AcceptedClose){cleanupFault=CleanupFault::None;WSASetLastError(WSAEFAULT);return SOCKET_ERROR;}
#endif
    const int result=closesocket(original);
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
    if(result==0)++cleanupCount.acceptedSucceeded;
#endif
    return result;
}
class AcceptedSocketGuard final {
public:
    AcceptedSocketGuard(HttpTransportOwner& owner,SOCKET original,const std::shared_ptr<HttpSocketLifetime>& lifetime,const std::shared_ptr<HttpAcceptedOriginal>& record):owner_(owner),original_(original),lifetime_(lifetime),record_(record){}
    ~AcceptedSocketGuard(){if(original_!=INVALID_SOCKET){if(lifetime_->unknown.load())return;
        if(!owner_.OriginalCleanupCurrent(HttpCleanupOperation::Close)){if(!owner_.ReadRevokedKnown()){record_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}return;}
        record_->stage=CloseStage::Closing;if(CloseAccepted(original_)!=0){record_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}else record_->stage=CloseStage::Closed;}}
    void Transfer()noexcept{original_=INVALID_SOCKET;}
    AcceptedSocketGuard(const AcceptedSocketGuard&)=delete;
private:HttpTransportOwner& owner_;SOCKET original_;std::shared_ptr<HttpSocketLifetime> lifetime_;std::shared_ptr<HttpAcceptedOriginal> record_;
};
SOCKET Exact(std::uintptr_t value){return static_cast<SOCKET>(value);}
void WaitSocket(SOCKET socket,bool write,std::uint64_t deadline,HttpTransportOwner* owner=nullptr){
    for(;;){if(owner)owner->AssertCurrent();const auto now=GetTickCount64();if(now>=deadline)Refuse("trusted_socket_timeout",WSAETIMEDOUT);
        fd_set ready{},errors{};FD_ZERO(&ready);FD_ZERO(&errors);FD_SET(socket,&ready);FD_SET(socket,&errors);
        const auto left=std::min<std::uint64_t>(deadline-now,100);timeval timeout{};timeout.tv_usec=static_cast<long>(left*1000);
        const int result=select(0,write?nullptr:&ready,write?&ready:nullptr,&errors,&timeout);
        if(result==SOCKET_ERROR)Refuse("trusted_socket_select_unknown",static_cast<std::uint32_t>(WSAGetLastError()),true);
        if(FD_ISSET(socket,&errors))Refuse("trusted_socket_error_unknown",0,true);if(FD_ISSET(socket,&ready))return;
    }
}
SocketPeer Observe(SOCKET socket){sockaddr_in local{},remote{};int length=sizeof(local);
    if(getsockname(socket,reinterpret_cast<sockaddr*>(&local),&length)!=0||length!=sizeof(local)||local.sin_family!=AF_INET)Refuse("trusted_socket_local_unknown",static_cast<std::uint32_t>(WSAGetLastError()),true);
    length=sizeof(remote);if(getpeername(socket,reinterpret_cast<sockaddr*>(&remote),&length)!=0||length!=sizeof(remote)||remote.sin_family!=AF_INET)Refuse("trusted_socket_peer_unknown",static_cast<std::uint32_t>(WSAGetLastError()),true);
    if(local.sin_addr.s_addr!=htonl(INADDR_LOOPBACK)||remote.sin_addr.s_addr!=htonl(INADDR_LOOPBACK))Refuse("trusted_socket_non_loopback",0,true);
    return {local.sin_addr.s_addr,remote.sin_addr.s_addr,ntohs(local.sin_port),ntohs(remote.sin_port)};
}
bool Same(const SocketPeer& a,const SocketPeer& b){return a.localAddress==b.localAddress&&a.remoteAddress==b.remoteAddress&&a.localPort==b.localPort&&a.remotePort==b.remotePort;}
}
AcceptedConnection::AcceptedConnection(HttpTransportOwner& owner,const std::shared_ptr<HttpSocketLifetime>& lifetime,const std::shared_ptr<HttpAcceptedOriginal>& original,const SocketPeer& peer):owner_(owner),peer_(peer),socket_(original->socket),lifetime_(lifetime),original_(original){}
AcceptedConnection::~AcceptedConnection(){CloseOnce();}
bool AcceptedConnection::Unknown()const noexcept{return unknown_.load()||lifetime_->unknown.load();}
void AcceptedConnection::RetainIoUnknown()noexcept{unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}
void AcceptedConnection::AssertCurrent(){if(closed_.load()||Unknown())Refuse("trusted_original_socket_closed",0,Unknown());
    try{owner_.AssertCurrent();if(!Same(peer_,Observe(Exact(socket_))))Refuse("trusted_original_socket_changed",0,true);}
    catch(const detail::Failure& failure){if(failure.unknown||!owner_.ReadRevokedKnown()){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}throw;}
    catch(...){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);throw;}}
std::vector<unsigned char> AcceptedConnection::Read(){std::lock_guard<std::mutex> lock(readIo_);AssertCurrent();std::vector<unsigned char> bytes(kChunk);
    try{WaitSocket(Exact(socket_),false,GetTickCount64()+kIoMs,&owner_);HTTP_REVOKE_AT(BeforeRead);AssertCurrent();
        HTTP_IO_ATTEMPT(recvIo);const int count=recv(Exact(socket_),reinterpret_cast<char*>(bytes.data()),static_cast<int>(bytes.size()),0);HTTP_REVOKE_AT(AfterRead);
        if(count==SOCKET_ERROR)Refuse("trusted_socket_read_unknown",static_cast<std::uint32_t>(WSAGetLastError()),true);
        // Reconcile the actual recv before the normal guard. A known revoke
        // discards consumed bytes (including EOF), never returns a payload.
        AssertCurrent();bytes.resize(static_cast<std::size_t>(count));return bytes;
    }catch(const detail::Failure& failure){if(failure.unknown||(failure.error!=WSAETIMEDOUT&&!owner_.ReadRevokedKnown())){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}throw;}
    catch(...){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);throw;}}
void AcceptedConnection::Write(const std::vector<unsigned char>& bytes){std::lock_guard<std::mutex> lock(writeIo_);AssertCurrent();if(bytes.empty()||bytes.size()>kChunk||ended_)Refuse("trusted_socket_write_shape");
    const auto deadline=GetTickCount64()+kIoMs;std::size_t sent=0;try{while(sent<bytes.size()){WaitSocket(Exact(socket_),true,deadline,&owner_);HTTP_REVOKE_AT(BeforeWrite);AssertCurrent();
        HTTP_IO_ATTEMPT(sendIo);const int count=send(Exact(socket_),reinterpret_cast<const char*>(bytes.data()+sent),static_cast<int>(bytes.size()-sent),0);const int error=count==SOCKET_ERROR?WSAGetLastError():0;HTTP_REVOKE_AT(AfterWrite);
        if(count==SOCKET_ERROR&&error==WSAEWOULDBLOCK){AssertCurrent();continue;}
        if(count<=0)Refuse("trusted_socket_write_unknown",static_cast<std::uint32_t>(error),true);sent+=static_cast<std::size_t>(count);AssertCurrent();}
    }catch(const detail::Failure& failure){if(failure.unknown||(!owner_.ReadRevokedKnown()&&(sent||failure.error!=WSAETIMEDOUT))){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}throw;}
    catch(...){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);throw;}}
void AcceptedConnection::End(){std::lock_guard<std::mutex> lock(writeIo_);
    if(Unknown())Refuse("trusted_original_socket_closed",0,true);if(ended_)return;
    if(closed_.load())Refuse("trusted_original_socket_closed");
    if(socket_!=original_->socket||original_->stage.load()!=CloseStage::Open){RetainIoUnknown();Refuse("trusted_original_end_identity_unknown",0,true);}
    if(!owner_.OriginalCleanupCurrent(HttpCleanupOperation::EndNoPayload)){
        if(!owner_.ReadRevokedKnown()){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}Refuse("trusted_original_end_cleanup_refused",0,Unknown());}
    ended_=true;
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
    ++cleanupCount.ended;if(cleanupFault==CleanupFault::End){cleanupFault=CleanupFault::None;unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);Refuse("trusted_socket_end_unknown",WSAEFAULT,true);}
#endif
    if(shutdown(Exact(socket_),SD_SEND)!=0){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);Refuse("trusted_socket_end_unknown",static_cast<std::uint32_t>(WSAGetLastError()),true);}}
std::uint64_t AcceptedConnection::NextRequest(){std::lock_guard<std::mutex> lock(requestIo_);AssertCurrent();if(requests_>=kRequests)Refuse("trusted_socket_request_budget",0,true);return ++requests_;}
void AcceptedConnection::CloseOnce()noexcept{std::lock_guard<std::mutex> closeLock(closeIo_);if(closed_.load())return;std::scoped_lock lock(readIo_,writeIo_,requestIo_);
    if(Unknown())return;
    if(socket_!=original_->socket||original_->stage.load()!=CloseStage::Open){RetainIoUnknown();return;}
    if(!owner_.OriginalCleanupCurrent(HttpCleanupOperation::Close)){
        if(!owner_.ReadRevokedKnown()){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}return;}
    // Only a permitted actual attempt consumes CloseOnce. Waiting for B33
    // leaves the original open; UNKNOWN never permits a close bypass.
    closed_=true;original_->stage=CloseStage::Closing;
    if(CloseAccepted(Exact(socket_))!=0){unknown_=true;original_->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}
    else{socket_=static_cast<std::uintptr_t>(INVALID_SOCKET);original_->stage=CloseStage::Closed;}}
FixedHttpListener::FixedHttpListener(HttpTransportOwner& owner):owner_(owner),socket_(static_cast<std::uintptr_t>(INVALID_SOCKET)),lifetime_(std::make_shared<HttpSocketLifetime>()){
    owner_.AssertCurrent();WSADATA data{};if(WSAStartup(MAKEWORD(2,2),&data)!=0)Refuse("trusted_winsock_unavailable");winsock_=true;
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
    ++cleanupCount.startup;
#endif
    try{if(data.wVersion!=MAKEWORD(2,2))Refuse("trusted_winsock_unavailable");HTTP_CLEANUP_FAULT(CreateSocket);
        SOCKET original=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(original==INVALID_SOCKET)Refuse("trusted_listener_create_failed",static_cast<std::uint32_t>(WSAGetLastError()));socket_=static_cast<std::uintptr_t>(original);lifetime_->listenerOriginal=socket_;
        const BOOL exclusive=TRUE;if(setsockopt(original,SOL_SOCKET,SO_EXCLUSIVEADDRUSE,reinterpret_cast<const char*>(&exclusive),sizeof(exclusive))!=0)Refuse("trusted_listener_exclusive_failed",static_cast<std::uint32_t>(WSAGetLastError()));
        sockaddr_in address{};address.sin_family=AF_INET;address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);address.sin_port=htons(owner_.HttpFixedPort());
        if(bind(original,reinterpret_cast<const sockaddr*>(&address),sizeof(address))!=0||listen(original,16)!=0)Refuse("trusted_fixed_listener_unavailable",static_cast<std::uint32_t>(WSAGetLastError()));
        u_long nonblocking=1;if(ioctlsocket(original,FIONBIO,&nonblocking)!=0)Refuse("trusted_listener_mode_failed",static_cast<std::uint32_t>(WSAGetLastError()));AssertCurrent();
    }catch(...){CloseOnce();throw;}}
FixedHttpListener::~FixedHttpListener(){CloseOnce();}
bool FixedHttpListener::Unknown()const noexcept{return unknown_.load()||lifetime_->unknown.load();}
void FixedHttpListener::RetainIoUnknown()noexcept{unknown_=true;RetainUnknown(lifetime_);}
void FixedHttpListener::AssertCurrent(){if(closed_||Unknown())Refuse("trusted_native_listener_closed",0,Unknown());
    try{owner_.AssertCurrent();sockaddr_in local{};int length=sizeof(local);
        if(getsockname(Exact(socket_),reinterpret_cast<sockaddr*>(&local),&length)!=0||length!=sizeof(local)||local.sin_family!=AF_INET||local.sin_addr.s_addr!=htonl(INADDR_LOOPBACK)||ntohs(local.sin_port)!=owner_.HttpFixedPort())Refuse("trusted_native_listener_changed",0,true);}
    catch(const detail::Failure& failure){if(failure.unknown||!owner_.ReadRevokedKnown()){unknown_=true;RetainUnknown(lifetime_);}throw;}
    catch(...){unknown_=true;RetainUnknown(lifetime_);throw;}}
std::shared_ptr<AcceptedConnection> FixedHttpListener::Accept(){std::lock_guard<std::mutex> lock(io_);AssertCurrent();
    auto& originals=lifetime_->originals;originals.erase(std::remove_if(originals.begin(),originals.end(),[](const auto& original){return original->stage.load()==CloseStage::Closed;}),originals.end());if(originals.size()>=kConnections)Refuse("trusted_native_connection_budget");
    try{WaitSocket(Exact(socket_),false,GetTickCount64()+kIoMs,&owner_);HTTP_REVOKE_AT(BeforeAccept);AssertCurrent();sockaddr_in remote{};int length=sizeof(remote);
        auto record=std::make_shared<HttpAcceptedOriginal>(static_cast<std::uintptr_t>(INVALID_SOCKET));lifetime_->originals.push_back(record);
        HTTP_IO_ATTEMPT(acceptIo);const SOCKET original=accept(Exact(socket_),reinterpret_cast<sockaddr*>(&remote),&length);const int error=original==INVALID_SOCKET?WSAGetLastError():0;HTTP_REVOKE_AT(AfterAccept);
        if(original==INVALID_SOCKET){record->stage=CloseStage::Closed;if(error==WSAEWOULDBLOCK){AssertCurrent();Refuse("trusted_native_accept_failed",static_cast<std::uint32_t>(error));}Refuse("trusted_native_accept_unknown",static_cast<std::uint32_t>(error),true);}
        record->socket=static_cast<std::uintptr_t>(original);AcceptedSocketGuard guard(owner_,original,lifetime_,record);
        AssertCurrent();u_long nonblocking=1;if(ioctlsocket(original,FIONBIO,&nonblocking)!=0){record->stage=CloseStage::Unknown;RetainUnknown(lifetime_);Refuse("trusted_native_accepted_mode_failed",static_cast<std::uint32_t>(WSAGetLastError()),true);}
        SocketPeer observed{};try{observed=Observe(original);if(observed.localPort!=owner_.HttpFixedPort())Refuse("trusted_native_accept_port",0,true);}
        catch(...){record->stage=CloseStage::Unknown;RetainUnknown(lifetime_);throw;}
        HTTP_CLEANUP_FAULT(BeforeUnique);auto unique=std::unique_ptr<AcceptedConnection>(new AcceptedConnection(owner_,lifetime_,record,observed));guard.Transfer();
        HTTP_CLEANUP_FAULT(AfterUnique);auto value=std::shared_ptr<AcceptedConnection>(std::move(unique));HTTP_CLEANUP_FAULT(AfterShared);
        record->connection=value;HTTP_CLEANUP_FAULT(AfterVector);AssertCurrent();return value;
    }catch(const detail::Failure& failure){if(failure.unknown||(failure.error!=WSAETIMEDOUT&&failure.error!=WSAEWOULDBLOCK&&!owner_.ReadRevokedKnown()&&failure.code!="http_proof_cleanup_injected")){unknown_=true;RetainUnknown(lifetime_);}throw;}
    catch(...){unknown_=true;RetainUnknown(lifetime_);throw;}}
void FixedHttpListener::CloseOnce()noexcept{std::lock_guard<std::mutex> lock(io_);if(closed_.load()||Unknown())return;
    if(Exact(socket_)!=INVALID_SOCKET&&socket_!=lifetime_->listenerOriginal){RetainIoUnknown();return;}
    if(!owner_.OriginalCleanupCurrent(HttpCleanupOperation::Close)){if(!owner_.ReadRevokedKnown()){unknown_=true;RetainUnknown(lifetime_);}return;}
    for(const auto& record:lifetime_->originals){if(auto value=record->connection.lock())value->CloseOnce();
        else if(record->stage.load()==CloseStage::Open){
            if(!owner_.OriginalCleanupCurrent(HttpCleanupOperation::Close)){if(!owner_.ReadRevokedKnown()){record->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}return;}
            record->stage=CloseStage::Closing;if(CloseAccepted(Exact(record->socket))!=0){record->stage=CloseStage::Unknown;RetainUnknown(lifetime_);}else record->stage=CloseStage::Closed;}
        if(record->stage.load()!=CloseStage::Closed)return;}
    if(Unknown())return;
    if(!owner_.OriginalCleanupCurrent(HttpCleanupOperation::Close)){if(!owner_.ReadRevokedKnown()){unknown_=true;RetainUnknown(lifetime_);}return;}
    if(Exact(socket_)!=INVALID_SOCKET){
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
        ++cleanupCount.listener;
#endif
        if(closesocket(Exact(socket_))!=0){unknown_=true;RetainUnknown(lifetime_);return;}socket_=static_cast<std::uintptr_t>(INVALID_SOCKET);}
    if(winsock_&&!Unknown()){
        if(!owner_.OriginalCleanupCurrent(HttpCleanupOperation::Close)){if(!owner_.ReadRevokedKnown()){unknown_=true;RetainUnknown(lifetime_);}return;}
        if(WSACleanup()!=0){unknown_=true;RetainUnknown(lifetime_);}else{winsock_=false;
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
            ++cleanupCount.cleanup;
#endif
        }}closed_=true;}
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
bool RunHttpCleanupFaultsFixed(HttpTransportOwner& originalOwner){
    struct CleanupOwner final:HttpTransportOwner{HttpTransportOwner& original;explicit CleanupOwner(HttpTransportOwner& value):original(value){}
        void AssertCurrent()override{original.AssertCurrent();}std::uint16_t HttpFixedPort()const noexcept override{return 23457;}
        bool OriginalCleanupCurrent(HttpCleanupOperation op)noexcept override{return original.OriginalCleanupCurrent(op);}
        bool ReadRevokedKnown()const noexcept override{return original.ReadRevokedKnown();}} owner(originalOwner);
    struct ClientSocket final{SOCKET original=INVALID_SOCKET;~ClientSocket(){if(original!=INVALID_SOCKET)closesocket(original);}};
    for(const auto point:{CleanupFault::CreateSocket,CleanupFault::BeforeUnique,CleanupFault::AfterUnique,CleanupFault::AfterShared,CleanupFault::AfterVector}){
        const auto starts=cleanupCount.startup.load(),ends=cleanupCount.cleanup.load(),closes=cleanupCount.accepted.load(),successes=cleanupCount.acceptedSucceeded.load();
        bool injected=false;std::unique_ptr<FixedHttpListener> listener;ClientSocket client;
        try{if(point==CleanupFault::CreateSocket)cleanupFault=point;listener=std::unique_ptr<FixedHttpListener>(new FixedHttpListener(owner));
            client.original=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(client.original==INVALID_SOCKET)Refuse("http_proof_cleanup_client_create");
            u_long nonblocking=1;if(ioctlsocket(client.original,FIONBIO,&nonblocking)!=0)Refuse("http_proof_cleanup_client_mode");
            sockaddr_in target{};target.sin_family=AF_INET;target.sin_addr.s_addr=htonl(INADDR_LOOPBACK);target.sin_port=htons(owner.HttpFixedPort());
            if(connect(client.original,reinterpret_cast<const sockaddr*>(&target),sizeof(target))==SOCKET_ERROR){if(WSAGetLastError()!=WSAEWOULDBLOCK)Refuse("http_proof_cleanup_client_connect");WaitSocket(client.original,true,GetTickCount64()+kIoMs);}
            cleanupFault=point;(void)listener->Accept();
        }catch(const detail::Failure& failure){if(failure.code!="http_proof_cleanup_injected")throw;injected=true;}
        // Close the fixture client before Winsock cleanup; it never enters the
        // accepted-socket counters or a production transport capability.
        if(client.original!=INVALID_SOCKET){const SOCKET exact=client.original;client.original=INVALID_SOCKET;if(closesocket(exact)!=0)Refuse("http_proof_cleanup_client_close");}
        if(listener){listener->CloseOnce();if(listener->Unknown())Refuse("http_proof_cleanup_listener_unknown");listener.reset();}
        const std::uint64_t expected=point==CleanupFault::CreateSocket?0u:1u;
        if(!injected||cleanupFault!=CleanupFault::None||cleanupCount.startup.load()!=starts+1||cleanupCount.cleanup.load()!=ends+1||cleanupCount.accepted.load()!=closes+expected||cleanupCount.acceptedSucceeded.load()!=successes+expected)Refuse("http_proof_cleanup_once_or_balance_failed");
    }return true;
}
bool RunHttpCloseFailureFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner){
    if(!originalOwner)Refuse("http_proof_close_original_owner_required");
    struct CloseOwner final:HttpTransportOwner {
        std::shared_ptr<HttpTransportOwner> original;const std::uint16_t port;
        CloseOwner(std::shared_ptr<HttpTransportOwner> value,std::uint16_t fixedPort):original(std::move(value)),port(fixedPort){}
        void AssertCurrent()override{original->AssertCurrent();}std::uint16_t HttpFixedPort()const noexcept override{return port;}
        bool OriginalCleanupCurrent(HttpCleanupOperation op)noexcept override{return original->OriginalCleanupCurrent(op);}
        bool ReadRevokedKnown()const noexcept override{return original->ReadRevokedKnown();}
    };
    struct Retained final {std::shared_ptr<HttpTransportOwner> owner;std::shared_ptr<HttpAcceptedOriginal> original;};
    struct ClientSocket final{SOCKET original=INVALID_SOCKET;~ClientSocket(){if(original!=INVALID_SOCKET)closesocket(original);}};
    for(const bool destruction:{false,true}){
        const auto starts=cleanupCount.startup.load(),ends=cleanupCount.cleanup.load(),closes=cleanupCount.accepted.load(),successes=cleanupCount.acceptedSucceeded.load();
        auto owner=std::make_shared<CloseOwner>(originalOwner,static_cast<std::uint16_t>(destruction?23459:23458));
        auto listener=std::unique_ptr<FixedHttpListener>(new FixedHttpListener(*owner));ClientSocket client;
        client.original=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(client.original==INVALID_SOCKET)Refuse("http_proof_close_client_create");
        u_long nonblocking=1;if(ioctlsocket(client.original,FIONBIO,&nonblocking)!=0)Refuse("http_proof_close_client_mode");
        sockaddr_in target{};target.sin_family=AF_INET;target.sin_addr.s_addr=htonl(INADDR_LOOPBACK);target.sin_port=htons(owner->HttpFixedPort());
        if(connect(client.original,reinterpret_cast<const sockaddr*>(&target),sizeof(target))==SOCKET_ERROR){if(WSAGetLastError()!=WSAEWOULDBLOCK)Refuse("http_proof_close_client_connect");WaitSocket(client.original,true,GetTickCount64()+kIoMs);}
        auto connection=listener->Accept();if(listener->lifetime_->originals.size()!=1)Refuse("http_proof_close_original_count");
        auto record=listener->lifetime_->originals.front();const auto exactOriginal=record->socket;std::weak_ptr<HttpSocketLifetime> lifetime=listener->lifetime_;
        // Establish process-lifetime retention before the injected UNKNOWN.
        (void)new Retained{owner,record};
        cleanupFault=CleanupFault::AcceptedClose;
        if(destruction)connection.reset();else{connection->CloseOnce();connection->CloseOnce();if(!connection->Unknown())Refuse("http_proof_close_connection_unknown_missing");connection.reset();}
        if(!listener->Unknown()||!record->connection.expired()||record->stage.load()!=CloseStage::Unknown||record->socket!=exactOriginal||Exact(exactOriginal)==INVALID_SOCKET)Refuse("http_proof_close_unknown_retention_failed");
        bool denied=false;try{(void)listener->Accept();}catch(const detail::Failure& failure){denied=failure.code=="trusted_native_listener_closed"&&failure.unknown;}
        if(!denied)Refuse("http_proof_close_accept_after_unknown");
        if(client.original!=INVALID_SOCKET){const SOCKET exact=client.original;client.original=INVALID_SOCKET;if(closesocket(exact)!=0)Refuse("http_proof_close_client_close");}
        listener->CloseOnce();listener->CloseOnce();if(!listener->Unknown())Refuse("http_proof_close_listener_unknown_missing");listener.reset();
        if(lifetime.expired()||record->stage.load()!=CloseStage::Unknown||record->socket!=exactOriginal||cleanupFault!=CleanupFault::None||cleanupCount.startup.load()!=starts+1||cleanupCount.cleanup.load()!=ends||cleanupCount.accepted.load()!=closes+1||cleanupCount.acceptedSucceeded.load()!=successes)Refuse("http_proof_close_unknown_once_or_balance_failed");
        // Fixed authority=false injection skipped the OS accepted close. Keep
        // the original owner and SOCKET identity until this exact child exits.
    }return true;
}
bool RunHttpRevokeFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner){
    if(!originalOwner)Refuse("http_proof_revoke_original_owner_required");
    // This fixed authority=false owner models the transferred predicate only.
    // It never authenticates B33, a broker floor, or a production enrollment.
    struct RevokeOwner final:HttpTransportOwner {
        std::shared_ptr<HttpTransportOwner> original;std::atomic<bool> revoked{false};const std::uint16_t port;
        bool b33=true,source=true,clock=true,generation=true,own=true;
        RevokeOwner(std::shared_ptr<HttpTransportOwner> value,std::uint16_t fixedPort):original(std::move(value)),port(fixedPort){}
        bool OriginalValid()const noexcept{return source&&clock&&generation&&own&&original->OriginalCleanupCurrent(HttpCleanupOperation::Close);}
        void AssertCurrent()override{original->AssertCurrent();if(!OriginalValid())Refuse("http_proof_revoke_original_changed");if(revoked)Refuse("http_proof_read_revoked_known");}
        std::uint16_t HttpFixedPort()const noexcept override{return port;}
        bool OriginalCleanupCurrent(HttpCleanupOperation op)noexcept override{return
            (op==HttpCleanupOperation::EndNoPayload||op==HttpCleanupOperation::Close)&&OriginalValid()&&(!revoked||b33);}
        bool ReadRevokedKnown()const noexcept override{return OriginalValid()&&revoked;}
    };
    struct ClientSocket final{SOCKET original=INVALID_SOCKET;~ClientSocket(){if(original!=INVALID_SOCKET)closesocket(original);}
        void Close(){if(original!=INVALID_SOCKET){const auto exact=original;original=INVALID_SOCKET;if(closesocket(exact)!=0)Refuse("http_proof_revoke_client_close");}}};
    enum class Case {Idle,BeforeAccept,AfterAccept,BeforeRead,AfterRead,BeforeWrite,AfterWrite,NoB33,FinalizerNoB33,FinalizerRevoked,Source,Clock,Generation,ForeignOwner,EndUnknown};
    std::uint16_t port=23460;
    for(const auto scenario:{Case::Idle,Case::BeforeAccept,Case::AfterAccept,Case::BeforeRead,Case::AfterRead,Case::BeforeWrite,Case::AfterWrite,Case::NoB33,Case::FinalizerNoB33,Case::FinalizerRevoked,Case::Source,Case::Clock,Case::Generation,Case::ForeignOwner,Case::EndUnknown}){
        const auto starts=cleanupCount.startup.load(),ends=cleanupCount.cleanup.load(),closes=cleanupCount.accepted.load(),endings=cleanupCount.ended.load(),listeners=cleanupCount.listener.load();
        auto owner=std::make_shared<RevokeOwner>(originalOwner,port++);auto listener=std::unique_ptr<FixedHttpListener>(new FixedHttpListener(*owner));ClientSocket client;
        client.original=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(client.original==INVALID_SOCKET)Refuse("http_proof_revoke_client_create");
        u_long nonblocking=1;if(ioctlsocket(client.original,FIONBIO,&nonblocking)!=0)Refuse("http_proof_revoke_client_mode");
        sockaddr_in target{};target.sin_family=AF_INET;target.sin_addr.s_addr=htonl(INADDR_LOOPBACK);target.sin_port=htons(owner->HttpFixedPort());
        if(connect(client.original,reinterpret_cast<const sockaddr*>(&target),sizeof(target))==SOCKET_ERROR){if(WSAGetLastError()!=WSAEWOULDBLOCK)Refuse("http_proof_revoke_client_connect");WaitSocket(client.original,true,GetTickCount64()+kIoMs);}
        std::shared_ptr<AcceptedConnection> connection;bool denied=false;
        const bool acceptStage=scenario==Case::BeforeAccept||scenario==Case::AfterAccept;
        const bool readStage=scenario==Case::BeforeRead||scenario==Case::AfterRead;
        const bool writeStage=scenario==Case::BeforeWrite||scenario==Case::AfterWrite;
        if(acceptStage){revokeTarget=&owner->revoked;revokePoint=scenario==Case::BeforeAccept?RevokePoint::BeforeAccept:RevokePoint::AfterAccept;
            const auto attempts=cleanupCount.acceptIo.load();try{connection=listener->Accept();}catch(const detail::Failure& failure){denied=!failure.unknown&&failure.code=="http_proof_read_revoked_known";}
            const auto expected=scenario==Case::BeforeAccept?0u:1u;if(connection||!denied||cleanupCount.acceptIo.load()!=attempts+expected)Refuse("http_proof_revoke_accept_effect_mismatch");}
        else{connection=listener->Accept();if(!connection||connection->NextRequest()!=1)Refuse("http_proof_revoke_normal_request_missing");}
        if(readStage){const char bytes[]="original-owned-read";WaitSocket(client.original,true,GetTickCount64()+kIoMs);
            if(send(client.original,bytes,static_cast<int>(sizeof(bytes)),0)!=static_cast<int>(sizeof(bytes)))Refuse("http_proof_revoke_client_send");
            revokeTarget=&owner->revoked;revokePoint=scenario==Case::BeforeRead?RevokePoint::BeforeRead:RevokePoint::AfterRead;
            const auto attempts=cleanupCount.recvIo.load();try{(void)connection->Read();}catch(const detail::Failure& failure){denied=!failure.unknown&&failure.code=="http_proof_read_revoked_known";}
            const auto expected=scenario==Case::BeforeRead?0u:1u;if(!denied||cleanupCount.recvIo.load()!=attempts+expected)Refuse("http_proof_revoke_recv_effect_mismatch");}
        if(writeStage){revokeTarget=&owner->revoked;revokePoint=scenario==Case::BeforeWrite?RevokePoint::BeforeWrite:RevokePoint::AfterWrite;
            const auto attempts=cleanupCount.sendIo.load();try{connection->Write(std::vector<unsigned char>(kChunk,'x'));}catch(const detail::Failure& failure){denied=!failure.unknown&&failure.code=="http_proof_read_revoked_known";}
            const auto expected=scenario==Case::BeforeWrite?0u:1u;if(!denied||cleanupCount.sendIo.load()!=attempts+expected)Refuse("http_proof_revoke_send_effect_mismatch");}
        revokeTarget=nullptr;if(revokePoint!=RevokePoint::None)Refuse("http_proof_revoke_point_not_consumed");
        if(scenario==Case::Source||scenario==Case::Clock||scenario==Case::Generation||scenario==Case::ForeignOwner||scenario==Case::EndUnknown){
            // All negatives retain the real originals. The fixture never
            // repairs a source/clock/owner failure to replay a close.
            (void)new std::shared_ptr<HttpTransportOwner>(owner);
            auto record=listener->lifetime_->originals.front();const auto exactAccepted=record->socket,exactListener=listener->lifetime_->listenerOriginal;
            std::weak_ptr<HttpSocketLifetime> retained=listener->lifetime_;
            if(scenario==Case::Source)owner->source=false;if(scenario==Case::Clock)owner->clock=false;
            if(scenario==Case::Generation)owner->generation=false;if(scenario==Case::ForeignOwner)owner->own=false;
            if(scenario==Case::EndUnknown){cleanupFault=CleanupFault::End;try{connection->End();}catch(const detail::Failure& failure){denied=failure.unknown;}
                if(!denied||cleanupFault!=CleanupFault::None)Refuse("http_proof_revoke_end_unknown_missing");
                denied=false;try{connection->End();}catch(const detail::Failure& failure){denied=failure.unknown;}if(!denied)Refuse("http_proof_revoke_end_unknown_replay");}
            connection->CloseOnce();connection->CloseOnce();listener->CloseOnce();listener->CloseOnce();
            if(!connection->Unknown()||!listener->Unknown()||connection->Closed()||listener->Closed()||
                cleanupCount.accepted.load()!=closes||cleanupCount.listener.load()!=listeners||cleanupCount.cleanup.load()!=ends||
                cleanupCount.ended.load()!=endings+(scenario==Case::EndUnknown?1u:0u))Refuse("http_proof_revoke_negative_close_bypass");
            // Repeated destructor/finalizer equivalents must not add effects.
            connection.reset();listener.reset();client.Close();
            auto held=retained.lock();if(!held||held->listenerOriginal!=exactListener||record->socket!=exactAccepted||record->stage.load()!=CloseStage::Unknown)Refuse("http_proof_revoke_original_identity_not_retained");
            if(cleanupCount.accepted.load()!=closes||cleanupCount.listener.load()!=listeners||cleanupCount.cleanup.load()!=ends)Refuse("http_proof_revoke_unknown_finalizer_replay");continue;
        }
        owner->revoked=true;
        if(listener->Unknown()||(connection&&connection->Unknown()))Refuse("http_proof_revoke_fabricated_unknown");
        if(connection){denied=false;try{(void)connection->NextRequest();}catch(const detail::Failure& failure){denied=!failure.unknown&&failure.code=="http_proof_read_revoked_known";}
            if(!denied)Refuse("http_proof_revoke_new_request_accepted");}
        if(scenario==Case::NoB33||scenario==Case::FinalizerNoB33){owner->b33=false;
            denied=false;try{connection->End();}catch(const detail::Failure& failure){denied=!failure.unknown&&failure.code=="trusted_original_end_cleanup_refused";}
            connection->CloseOnce();connection->CloseOnce();listener->CloseOnce();listener->CloseOnce();
            if(!denied||connection->Unknown()||listener->Unknown()||connection->Closed()||listener->Closed()||cleanupCount.ended.load()!=endings||
                cleanupCount.accepted.load()!=closes||cleanupCount.listener.load()!=listeners||cleanupCount.cleanup.load()!=ends)Refuse("http_proof_revoke_no_b33_effect_or_unknown");
            if(scenario==Case::FinalizerNoB33){connection.reset();listener->CloseOnce();if(listener->Unknown()||cleanupCount.accepted.load()!=closes)Refuse("http_proof_revoke_pending_finalizer_effect");}
            owner->b33=true;
        }
        if(connection){connection->End();connection->End();if(cleanupCount.ended.load()!=endings+1)Refuse("http_proof_revoke_end_replay");
            if(scenario==Case::FinalizerRevoked)connection.reset();else{connection->CloseOnce();connection->CloseOnce();if(!connection->Closed()||connection->Unknown())Refuse("http_proof_revoke_cleanup_not_closed");connection.reset();}}
        client.Close();listener->CloseOnce();listener->CloseOnce();if(listener->Unknown()||!listener->Closed())Refuse("http_proof_revoke_listener_not_closed");listener.reset();
        const auto expected=scenario==Case::BeforeAccept?0u:1u;
        if(cleanupCount.startup.load()!=starts+1||cleanupCount.cleanup.load()!=ends+1||cleanupCount.accepted.load()!=closes+expected||cleanupCount.listener.load()!=listeners+1)Refuse("http_proof_revoke_close_once_or_balance");
    }return true;
}
#endif
} // namespace local_session::trusted_read
