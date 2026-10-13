#pragma once
#include "local_session_win32.h"

namespace local_session {
class PreparedLifecycleGrant final {
public:
    ~PreparedLifecycleGrant()=default;
    PreparedLifecycleGrant(const PreparedLifecycleGrant&)=delete;
    PreparedLifecycleGrant& operator=(const PreparedLifecycleGrant&)=delete;
private:
    static constexpr std::uint64_t kFixedDispositionGraceMs=10ULL*60*1000;
    PreparedLifecycleGrant(const Id& generation,const Id& boot,const Digest& consumed,
        std::uint64_t issuedAt,std::uint64_t sessionDeadline,std::uint64_t dispositionDeadline);
    static std::unique_ptr<PreparedLifecycleGrant> Prepare(const Id& generation,
        const Id& boot,const Digest& consumed,std::uint64_t originalSessionDeadline);
    bool EffectClockLive() const;
    Digest BindingHash() const;
    const Id generation_,boot_;
    const Digest consumed_;
    const std::uint64_t issuedAt_,sessionDeadline_,dispositionDeadline_;
    friend class Broker;
    friend class OriginalDaemon;
};
// Constructible only by the broker after durable launch consumption. Never opens
// a target by client PID, adopts an existing process, or terminates AE/AME.
class OriginalDaemon final {
public:
    ~OriginalDaemon();
    OriginalDaemon(const OriginalDaemon&)=delete;
    OriginalDaemon& operator=(const OriginalDaemon&)=delete;
private:
    struct Data;
    explicit OriginalDaemon(std::unique_ptr<Data> data);
    static std::unique_ptr<OriginalDaemon> Launch(InstalledEnrollment& enrollment,
        const Id& generation,const Id& bootNonce,const Id& channelNonce,const std::wstring& daemonPipe,
#if defined(AE_AGENT_PHASE_NATIVE_SYNTHETIC_PROFILE)
        const Id& phaseSession,
#endif
        std::unique_ptr<PreparedLifecycleGrant> lifecycleGrant,Result& result);
    bool MatchesPeer(void* pipe) const;
    bool Live() const;
    bool ExactExit(std::uint32_t& exitCode) const;
    bool AbortUnadmitted(Result& result);
    bool LifecycleEffectAllowed() const;
    void MarkAdmitted() noexcept;
    void* BorrowedOriginalProcess() const;
    std::uint64_t Birth() const;
    const Id& OriginalInstance() const;
    Digest PhaseWitness(void* originalPipe,const Id& session,const Id& channel) const;
    std::unique_ptr<Data> data_;
    friend class Broker;
};
} // namespace local_session
