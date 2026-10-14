#pragma once
#include "enrollment_win32.h"
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace local_session::trusted_read {
class NativeClient;
class OriginalMediaCapture;
}

namespace local_session::trusted_read::media_children {
enum class Operation : std::uint8_t { Metadata,Packets,FullDecode,Alpha0,Alpha1,Alpha2 };
enum class GuardPhase : std::uint8_t {
    BeforeLatch,BeforeCreate,BeforeResume,Poll,FinalReadback,CleanupOriginal,CleanupPoll
};

// A private factual producer, never an issuer or a caller-command interface.
// The original native owner supplies and retains both exact borrowed HANDLEs,
// its reservation and callback context until HasOriginalDebt() is false. The
// guard synchronously checks original session/job/source/policy/floor/deadline;
// BeforeLatch/BeforeCreate enforce its irreversible D49 operation-once charge.
// Cleanup phases use the owner's independent original-only disposition guard.
class OriginalChild final {
public:
    ~OriginalChild();
    OriginalChild(const OriginalChild&)=delete;
    OriginalChild& operator=(const OriginalChild&)=delete;
private:
    enum class Status : std::uint8_t { Refused,Unknown,Closed };
    struct Inputs final {
        void* toolImageHandle=nullptr;
        reviewed::File tool;
        void* outputHandle=nullptr;
        ObjectPin outputPin;
        Digest outputHash{},outputSelector{};
        Operation operation=Operation::Metadata;
        std::uint32_t rateNumerator=0,rateDenominator=0,frameCount=0,width=0,height=0,alphaIndex=0;
        Id session{};
        std::uint16_t slot=0;
        Digest stableChildKey{};
        bool (*guard)(void*,Operation,GuardPhase)=nullptr;
        void* guardContext=nullptr;
    };
    struct Facts final {
        Status status=Status::Refused;
        std::string code="media_child_not_attempted";
        std::uint32_t win32Error=0,originalPid=0,originalThreadId=0,exitCode=0;
        std::uint64_t originalBirth=0,stdoutObservedBytes=0,stderrObservedBytes=0;
        ObjectPin originalImagePin;
        std::wstring originalImageQuery;
        // imageMatched compares the original process image query with the
        // retained reviewed disk image object/hash, not loaded-module bytes.
        bool attempted=false,created=false,resumed=false,imageMatched=false,exitObserved=false;
        bool stdoutEof=false,stderrEof=false,stdoutOverflow=false,stderrOverflow=false;
        // Refers only to this producer's owned original handles. The caller's
        // exact borrowed tool/output HANDLEs remain retained by its owner.
        bool closedOriginalHandles=false,cancelAttempted=false,cancelSent=false,timedOut=false;
        std::vector<unsigned char> stdoutBytes,stderrBytes;
    };
    struct Data;
    explicit OriginalChild(Inputs inputs);
    // CaptureOnce never retries a refused, partial or UNKNOWN attempt. Closed
    // is factual lifecycle closure, including nonzero exit. Semantic acceptance
    // additionally requires exit0, both EOF, exact byte bounds/image/source and
    // the native owner's packet/metadata/alpha/PNG checks.
    const Facts& CaptureOnce() noexcept;
    const Facts& DispositionFacts() const noexcept;
    bool HasOriginalDebt() const noexcept;
    // One bounded factual poll; no new child and no PID lookup/adoption. UNKNOWN
    // stays UNKNOWN even when a later disposition observes actual closure.
    const Facts& PollOriginalForDisposition() noexcept;
    // Explicit once-only cancellation of this exact original decoder HANDLE.
    // Never kills a job, AE or AME, and never silently runs from the destructor.
    const Facts& CancelOriginalOnce() noexcept;
    std::unique_ptr<Data> data_;
    friend class ::local_session::trusted_read::OriginalMediaCapture;
    friend class ::local_session::trusted_read::NativeClient;
};
} // namespace local_session::trusted_read::media_children
