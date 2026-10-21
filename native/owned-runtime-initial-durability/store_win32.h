#pragma once
#if !defined(AE_AGENT_DURABILITY_PREREQUISITE_TEST_ONLY) && !defined(AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS)
#error No production factory, issuer, effect permit or admission exists in this prerequisite.
#endif
#if defined(AE_AGENT_DURABILITY_PREREQUISITE_TEST_ONLY) && defined(AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS)
#error Installed and prerequisite proof profiles must never be mixed.
#endif
#include "../owned-runtime-initial-fence/fence_win32.h"
#include <array>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace initial_durability {
using Id = std::array<unsigned char, 16>;
using Digest = std::array<unsigned char, 32>;
enum class RecordType : std::uint16_t { Genesis=1, OwnerEpoch=2, Consume=3, Observation=4, Note=5 };
enum class EffectClass : std::uint16_t { Launch=1, Dispatch=2, Stop=3 };
enum class Outcome : std::uint16_t { Ack=1, Unknown=2, Observed=3 };
struct Cas { std::uint64_t sequence=0, epoch=0; Digest head{}; };
// Closed semantic request. Sequence/owner/scope/stable key are never caller fields.
struct ClosedRecord {
    RecordType type=RecordType::Note;
    EffectClass effect=EffectClass::Launch;
    Id target{};
    Digest consumedHash{};
    Outcome outcome=Outcome::Unknown;
    Digest sourceDigest{}, configDigest{};
};
struct Result {
    bool ok=false, unknown=false, unavailable=false, consumptionRecorded=false;
    std::string code="closed", persistence="none";
    Cas current;
    Digest scope{}, genesis{}, recordHash{};
    Id lineage{}, owner{};
    std::uint64_t createAttempts=0, writeAttempts=0, flushAttempts=0;
    std::uint32_t win32Error=0;
    bool syntheticFault=false, actualHandleError=false, actualPartialWrite=false;
    std::vector<Digest> spentKeys;
};
class Store final : private initial_fence::InternalFencedAction {
public:
    ~Store();
    Store(const Store&)=delete; Store& operator=(const Store&)=delete;
    // Immutable generated fixture selection. No runtime pathname/pins/floor/PID.
#ifdef AE_AGENT_DURABILITY_PREREQUISITE_TEST_ONLY
    static std::unique_ptr<Store> CreateApprovedTestStore(const std::string& instance,
        initial_fence::Factory& factory, initial_fence::RootLease& root,
        initial_fence::FenceLease& fence, Result& result);
#endif
    Result Inspect();
    Result InitializeGenesis(const Cas& expected);
    Result AcquireOwnerEpoch(const Cas& expected);
    Result AppendOnce(const Cas& expected, const ClosedRecord& record);
    Result ReconcilePending();
    Result RunPrivateSeamProof();
    Result RunPrivateMoveProof(bool destination);
    Result RunPrivateBoundsProof();
private:
#ifdef AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS
    static std::unique_ptr<Store> CreateInstalledStore(
        local_session::InstalledEnrollment& enrollment, local_session::ContinuityPort& continuity,
        initial_fence::Factory& factory, initial_fence::RootLease& root,
        initial_fence::FenceLease& fence, Result& result);
    friend class local_session::Broker;
#endif
    struct Data;
    explicit Store(std::unique_ptr<Data> data);
    std::unique_ptr<Data> data_;
    Result Execute(int operation, const Cas& expected, const ClosedRecord& record);
    initial_fence::Result Run(initial_fence::InternalFencedIo& io) override;
};
std::string JsonResult(const std::string& operation, const Result& result);
} // namespace initial_durability
