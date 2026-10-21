#pragma once
#include "enrollment_win32.h"
#include <atomic>
#include <memory>
#include <mutex>

namespace local_session::trusted_read {
class NativeClient;
struct HttpSocketLifetime;
struct HttpAcceptedOriginal;
enum class HttpCleanupOperation : std::uint8_t { EndNoPayload=1,Close=2 };
class HttpTransportOwner {
public:
    virtual ~HttpTransportOwner()=default;
    virtual void AssertCurrent()=0;
    virtual std::uint16_t HttpFixedPort()const noexcept=0;
    virtual bool OriginalCleanupCurrent(HttpCleanupOperation operation)noexcept=0;
    virtual bool ReadRevokedKnown()const noexcept=0;
protected:
    HttpTransportOwner()=default;
};
// These values are OS observations of an original accepted SOCKET. They never
// construct a connection and are not exported to JavaScript as a handle.
struct SocketPeer final { std::uint32_t localAddress=0,remoteAddress=0;std::uint16_t localPort=0,remotePort=0; };
// Private native observations only; no JS producer can supply or serialize them.
struct HttpRequestIoSnapshot final {
    std::uint64_t writeAttemptOrdinal=0,pendingWrite=0;bool closed=false,closeConfirmed=false,unknown=false;
    const HttpTransportOwner* owner=nullptr;const HttpAcceptedOriginal* original=nullptr;const HttpSocketLifetime* lifetime=nullptr;
    std::uintptr_t originalSocket=0;std::uint8_t originalStage=0;
};
class AcceptedConnection final {
public:
    ~AcceptedConnection();
    AcceptedConnection(const AcceptedConnection&)=delete;
    AcceptedConnection& operator=(const AcceptedConnection&)=delete;
    std::vector<unsigned char> Read();
    void Write(const std::vector<unsigned char>& bytes);
    void End();
    void CloseOnce()noexcept;
    void AssertCurrent();
    const SocketPeer& Peer()const noexcept{return peer_;}
    std::uint64_t NextRequest();
    bool Unknown()const noexcept;
    bool Closed()const noexcept{return closed_.load();}
private:
    HttpRequestIoSnapshot CaptureRequestIoSnapshot()const;
    bool ConfirmOriginalRequestIoSnapshot(const HttpRequestIoSnapshot& snapshot,std::uint64_t atRetain)const noexcept;
    void ReserveWriteWork();
    void ReconcileWriteWork()noexcept;
    void BeginPayloadWriteAttempt();
    void RetainIoUnknown()noexcept;
    AcceptedConnection(HttpTransportOwner& owner,const std::shared_ptr<HttpSocketLifetime>& lifetime,
        const std::shared_ptr<HttpAcceptedOriginal>& original,const SocketPeer& peer);
    HttpTransportOwner& owner_;const SocketPeer peer_;std::uintptr_t socket_;
    std::shared_ptr<HttpSocketLifetime> lifetime_;std::shared_ptr<HttpAcceptedOriginal> original_;
    std::mutex closeIo_,readIo_,writeIo_,requestIo_;std::atomic<bool> closed_{false},unknown_{false};
    // Metadata is never held across owner guards, serial, OS calls, or waits.
    // NativeClient may take it under serial without an inverse serial->I/O edge.
    mutable std::mutex metadata_;std::uint64_t writeAttemptOrdinal_=0,pendingWrite_=0;
    std::atomic<bool> closeConfirmed_{false};
    bool ended_=false;std::uint64_t requests_=0;
    friend class FixedHttpListener;
    friend class HttpTransportBinding;
    friend class NativeClient;
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
    friend bool RunHttpIdleWriteFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner);
#endif
};
class FixedHttpListener final {
public:
    ~FixedHttpListener();
    FixedHttpListener(const FixedHttpListener&)=delete;
    FixedHttpListener& operator=(const FixedHttpListener&)=delete;
    std::shared_ptr<AcceptedConnection> Accept();
    void AssertCurrent();
    void CloseOnce()noexcept;
    bool Unknown()const noexcept;
    bool Closed()const noexcept{return closed_.load();}
private:
    void RetainIoUnknown()noexcept;
    explicit FixedHttpListener(HttpTransportOwner& owner);
    HttpTransportOwner& owner_;std::uintptr_t socket_;std::mutex io_;
    bool winsock_=false;std::atomic<bool> closed_{false},unknown_{false};
    std::shared_ptr<HttpSocketLifetime> lifetime_;
    friend class NativeClient;
    friend class HttpTransportBinding;
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
    friend bool RunHttpCleanupFaultsFixed(HttpTransportOwner& originalOwner);
    friend bool RunHttpCloseFailureFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner);
    friend bool RunHttpRevokeFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner);
    friend bool RunHttpIdleWriteFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner);
#endif
};
} // namespace local_session::trusted_read
#if defined(AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF) && AE_AGENT_HTTP_TRANSPORT_ISOLATED_PROOF == 1
namespace local_session::trusted_read {
// One fixed, finite authority=false cleanup probe; no caller fault selector.
bool RunHttpCleanupFaultsFixed(HttpTransportOwner& originalOwner);
bool RunHttpCloseFailureFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner);
bool RunHttpRevokeFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner);
bool RunHttpIdleWriteFaultsFixed(const std::shared_ptr<HttpTransportOwner>& originalOwner);
}
#endif
