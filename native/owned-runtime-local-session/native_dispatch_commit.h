#pragma once
#include "enrollment_win32.h"
#include "../owned-runtime-initial-durability/store_win32.h"
#include <array>

namespace local_session {
// A broker-private Note commitment, never a Store Consume selector or delivery
// permit. Only the separate installed synthetic entry exercises this first port.
class NativeDispatchCommit final {
public:
    ~NativeDispatchCommit()=default;
    NativeDispatchCommit(const NativeDispatchCommit&)=delete;
    NativeDispatchCommit& operator=(const NativeDispatchCommit&)=delete;
private:
    struct Binding {
        Id broker{}, installation{}, lineage{}, session{}, generation{}, boot{};
        Id command{}, execution{}, lease{};
        Digest scope{}, runtime{}, actor{}, authorization{}, body{}, finalScript{};
        Digest target{}, owner{}, fence{}, allowedLeaf{};
        std::uint16_t variantSlot=0, operation=1;
        std::uint64_t nativeOrdinal=1;
    };
    // Owned by the original broker for its entire lifetime. Neither a new
    // descriptor nor a READ renewal constructs a new budget or clears a key.
    struct Lifetime final {
        static constexpr std::size_t kExternalCap=192;
        std::uint64_t attempts=0;
        std::array<Digest,kExternalCap> keys{};
        bool admitted=false,unknown=false;
        Lifetime()=default;
        Lifetime(const Lifetime&)=delete;
        Lifetime& operator=(const Lifetime&)=delete;
    };
    struct Port {
        void* originalBroker=nullptr;
        bool (*guard)(void*) noexcept=nullptr;
        bool (*floor)(void*, const initial_durability::Cas&, const Digest&) noexcept=nullptr;
    };
    struct Observation {
        bool latched=false, freshAppend=false, duplicateReadback=false, unknown=false;
        bool priorFloorVerified=false, appendAckVerified=false, syntheticFault=false;
        Digest descriptorHash{}, configDigest{}, recordHash{}, head{};
        std::uint64_t sequence=0, epoch=0;
        const char* code="not_exercised";
    };
    enum class ProofFault : std::uint8_t { None, BeforeAppendGuardClosed, PrivateReplyLost };
    NativeDispatchCommit(initial_durability::Store& store,initial_durability::Cas& cas,
        const Binding& binding,const Port& port,Lifetime& lifetime);
    Observation Commit(ProofFault fault);
    Observation ObserveDuplicate();
    void CloseUnknown(const char* code) noexcept;
    std::vector<unsigned char> Descriptor() const;
    Digest StableKey() const;
    bool Guard() const noexcept;
    initial_durability::Store& store_;
    initial_durability::Cas& cas_;
    const Binding binding_;
    const Port port_;
    Lifetime& lifetime_;
    initial_durability::ClosedRecord note_{};
    Observation observation_{};
    Digest stableKey_{};
    bool entered_=false, selected_=false, duplicateObserved_=false;
    // Fixed ceilings, no row recycling, UUID/source/proposal budget reset.
    static constexpr std::uint64_t kTotalSlots=256, kFinalReserve=16, kExternalCap=192;
    static constexpr std::uint64_t kFixedRemainingLifecycle=16;
    friend class Broker;
};
} // namespace local_session
