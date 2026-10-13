#pragma once
#include "enrollment_win32.h"
#include <deque>

namespace initial_fence { class RootLease; class FenceLease; }
namespace local_session {
struct FloorSnapshot {
    Digest scope{}, genesis{}, head{};
    std::uint64_t sequence=0, epoch=0;
    Id owner{};
    std::vector<Id> originalSlotIds;
    std::vector<Digest> originalFrameHashes;
    struct Pending {
        bool exists=false;
        std::uint64_t sequence=0, epoch=0, slot=0;
        Digest head{}, semanticKey{}, frameHash{};
        Id owner{};
        Id createdFileId{};
        std::uint16_t type=0;
    } pending;
};
// Private same-process authority port. It never sends stdio messages or accepts a
// client floor/ACK. Only guarded independent native read-back advances the floor.
class ContinuityPort final {
public:
    ~ContinuityPort();
    ContinuityPort(const ContinuityPort&)=delete;
    ContinuityPort& operator=(const ContinuityPort&)=delete;
private:
    struct Data;
    ContinuityPort(InstalledEnrollment& enrollment,initial_fence::Factory& factory,
        initial_fence::RootLease& root,initial_fence::FenceLease& fence);
    bool MatchesBinding(InstalledEnrollment& enrollment,initial_fence::Factory& factory,
        initial_fence::RootLease& root,initial_fence::FenceLease& fence) const;
    bool Guard(initial_fence::InternalFencedIo& io);
    const FloorSnapshot& Floor() const;
    const Id& AcquisitionOwner() const;
    bool RegisterPending(initial_fence::InternalFencedIo& io,const FloorSnapshot::Pending& pending);
    bool BindCreatedSlot(initial_fence::InternalFencedIo& io,void* borrowedOriginalCreatedFile);
    bool ObserveAndAdvance(initial_fence::InternalFencedIo& io,bool originalFlushObserved);
    bool Reconcile(initial_fence::InternalFencedIo& io);
    bool IsSpent(const Digest& key) const;
    void Close() noexcept;
    std::unique_ptr<Data> data_;
    friend class Broker;
    friend class initial_durability::Store;
};

enum class ControllerVerb : std::uint16_t { Open=1,ReserveInitialLaunch=2,Status=3,Revoke=4 };
enum class DaemonVerb : std::uint16_t { BootHello=17,ReadySnapshot=18,FirstActorObserved=19,
    Complete=20,DrainAck=21,ShutdownAck=22 };
enum class State : std::uint16_t { Closed=0,SessionOpen=1,LaunchReserved=2,TargetHeld=3,
    RegisteredReadClosed=4,ActorBound=5,Revoked=6,Unknown=7,ExactExited=8 };
// Exact fixed-size private frame v2. No pathname/PID/executable/evidence record.
// Integers encoded individually as LE; never raw struct serialization.
struct Message {
    std::uint16_t verb=0;
    std::uint64_t ordinal=0;
    Id channelNonce{}, generation{}, bootNonce{}, reference{};
    Digest digest{};
    std::uint64_t readinessEpoch=0;
    std::uint32_t readinessMask=0;
};
constexpr std::uint32_t kAllQuiescent=0x7f; // pending/inflight/edit/project/native/job/child
constexpr std::uint64_t kMaximumSessionMs=8ULL*60*60*1000;
constexpr std::uint64_t kMaximumReadLeaseMs=60000;

class Broker final {
public:
    ~Broker();
    Broker(const Broker&)=delete; Broker& operator=(const Broker&)=delete;
    static int RunFixed();
private:
    struct Data;
    explicit Broker(std::unique_ptr<Data> data);
    std::unique_ptr<Data> data_;
};
std::string ResultJson(const Result& result);
} // namespace local_session
