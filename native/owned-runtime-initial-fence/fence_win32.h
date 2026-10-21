#pragma once

#if !defined(AE_AGENT_FENCE_PREREQUISITE_TEST_ONLY) && !defined(AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS)
#error This prerequisite has no production factory or authority port.
#endif
#if defined(AE_AGENT_FENCE_PREREQUISITE_TEST_ONLY) && defined(AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS)
#error Installed and prerequisite proof profiles must never be mixed.
#endif

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace initial_durability { class Store; }
namespace local_session { class InstalledEnrollment; class ContinuityPort; class Broker; }
namespace initial_fence {

// Correlation/evidence only. There is no exported OS handle or issuer capability.
struct Identity {
    std::wstring volumeGuid;
    std::wstring canonicalPath;
    std::string volumeSerialHex;
    std::string fileIdHex;
};

struct BindingProofStep {
    std::string operation;
    bool ok = false;
    std::string code;
    std::string fenceState;
};

struct Result {
    bool ok = false;
    bool terminal = false;
    std::string code;
    std::string fenceState = "CLOSED";
    std::uint32_t win32Error = 0;
    std::uint32_t ntStatus = 0;
    bool hasRootIdentity = false;
    bool hasLockIdentity = false;
    Identity rootIdentity;
    Identity lockIdentity;
    std::string sessionRef;
    // Test-only observations, never authority. Useful for pre-WRITE refusals.
    std::uint64_t lockWriteOpenAttempts = 0;
    std::uint64_t volumeAnchorOpenAttempts = 0;
    std::uint64_t publishedAcquisitions = 0;
    // Layered property proof, not a positive root/fence capability.
    bool hasLockPropertyProof = false;
    Identity lockPropertyIdentity;
    std::uint32_t lockFileAttributes = 0;
    std::uint32_t lockReparseTag = 0;
    std::string lockVerifierCode;
    std::vector<BindingProofStep> bindingProof;
};

class Factory;
class InternalFencedIo;
class InternalFencedAction {
public:
    virtual ~InternalFencedAction() = default;
    virtual Result Run(InternalFencedIo& io) = 0;
};

class RootLease final {
public:
    RootLease();
    ~RootLease();
    RootLease(RootLease&&) noexcept;
    RootLease& operator=(RootLease&&) noexcept;
    RootLease(const RootLease&) = delete;
    RootLease& operator=(const RootLease&) = delete;
private:
    struct Data;
    std::unique_ptr<Data> data_;
    friend class Factory;
    friend class InternalFencedIo;
};

class FenceLease final {
public:
    FenceLease();
    ~FenceLease();
    FenceLease(FenceLease&&) noexcept;
    FenceLease& operator=(FenceLease&&) noexcept;
    FenceLease(const FenceLease&) = delete;
    FenceLease& operator=(const FenceLease&) = delete;
private:
    struct Data;
    std::unique_ptr<Data> data_;
    friend class Factory;
    friend class InternalFencedIo;
};

class Factory final {
public:
    ~Factory();
    Factory(const Factory&) = delete;
    Factory& operator=(const Factory&) = delete;
    // The sole test entry: strings select immutable slots/pins in a build header.
    // Missing header/pins cannot be supplied by argv, ENV, JSON, MCP or HTTP.
#ifdef AE_AGENT_FENCE_PREREQUISITE_TEST_ONLY
    static std::unique_ptr<Factory> CreateApprovedTestFactory(
        const std::wstring& rootSpelling, const std::string& instance, Result& result);
    // Private proof entry: instance selects only immutable generated pins.
    // No runtime root, GUID, drive, policy or serialized identity input.
    static std::unique_ptr<Factory> CreateApprovedCanonicalTestFactory(
        const std::string& instance, Result& result);
#endif
    Result OpenRoot(RootLease& root, FenceLease& fence);
    Result Observe(RootLease& root, FenceLease& fence);
    Result TryAcquire(RootLease& root, FenceLease& fence);
    Result LiveCheck(RootLease& root, FenceLease& fence, const std::string& ref);
    Result Release(RootLease& root, FenceLease& fence, const std::string& ref);
    Result Dispose(RootLease& root, FenceLease& fence);
    bool CrashProofEnabled() const noexcept;
    bool SuppressFirstAcquireAck() const noexcept;
    bool BindingProofEnabled() const noexcept;
    Result RunBindingProof(RootLease& root, FenceLease& fence);
    Result RunCanonicalLockPropertyProof(RootLease& root, FenceLease& fence);
private:
#ifdef AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS
    // The original retained native enrollment is the sole entry. No selector,
    // copied pin, PID, root spelling or serialized evidence can create a factory.
    static std::unique_ptr<Factory> CreateInstalledFactory(
        local_session::InstalledEnrollment& enrollment, Result& result);
    friend class local_session::Broker;
#endif
    struct RootConfig;
    struct Data;
    explicit Factory(std::unique_ptr<RootConfig> config);
    std::unique_ptr<Data> data_;
    Result Validate(RootLease& root, FenceLease& fence, bool checkFence);
    Result Fail(RootLease& root, FenceLease& fence, const Result& failure);
    Result Describe(RootLease& root, FenceLease& fence) const;
    Result CheckBinding(RootLease& root, FenceLease& fence) const;
    // Same-process synchronous serial port; callers must not use these leases
    // concurrently. Reentry/move/release/dispose/reacquire are rejected while
    // the callback is active. The borrowed context is absent from the CLI.
    Result WithLiveFence(RootLease& root, FenceLease& fence, InternalFencedAction& action);
    friend class InternalFencedIo;
    friend class initial_durability::Store;
};

class InternalFencedIo final {
public:
    InternalFencedIo(const InternalFencedIo&) = delete;
    InternalFencedIo& operator=(const InternalFencedIo&) = delete;
private:
    InternalFencedIo(Factory& factory, RootLease& root, FenceLease& fence);
    ~InternalFencedIo();
    struct Data;
    std::unique_ptr<Data> data_;
    Result StageGuard();
    void* BorrowedRoot(); // Never owned, duplicated, inherited or returned by Store.
    bool MatchesBinding(Factory& factory, RootLease& root, FenceLease& fence);
    friend class Factory;
    friend class initial_durability::Store;
    friend class local_session::ContinuityPort;
};

std::string JsonResult(const std::string& operation, const Result& result);

} // namespace initial_fence
