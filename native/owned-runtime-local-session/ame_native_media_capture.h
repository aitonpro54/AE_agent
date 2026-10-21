#pragma once
#include "trusted_execution.h"
#include "ame_native_media_children.h"
#include "ame_native_rgba_png.h"
#include <array>

namespace local_session::trusted_read {
// NativeClient alone supplies its already accepted full D49 reservation and
// original source/job lifetime through the synchronous guard. This producer
// collects facts; it cannot issue completion/media/settings caps or authority.
class OriginalMediaCapture final {
public:
    ~OriginalMediaCapture();OriginalMediaCapture(const OriginalMediaCapture&)=delete;
    OriginalMediaCapture& operator=(const OriginalMediaCapture&)=delete;
private:
    enum class Status : std::uint8_t {Refused,Unknown,Closed};
    struct Inputs final {
        void* outputHandle=nullptr;ObjectPin outputPin;Digest outputHash{},outputSelector{};
        void* outputRootHandle=nullptr;ObjectPin outputRootPin;
        void* ffmpegImageHandle=nullptr;void* ffprobeImageHandle=nullptr;
        reviewed::File ffmpeg,ffprobe;
        std::uint32_t rateNumerator=0,rateDenominator=0,frameCount=0,width=0,height=0;
        std::array<std::uint32_t,3> alphaIndices{};
        std::array<std::wstring,3> previewNames{};
        Id session{};std::uint16_t slot=0;std::array<Digest,6> stableChildKeys{};
        bool (*guard)(void*,media_children::Operation,media_children::GuardPhase)=nullptr;
        void* guardContext=nullptr;
    };
    struct PreviewFacts final {
        std::uint32_t frameIndex=0;std::wstring name;ObjectPin pin;Digest hash{},rgbaHash{},binding{};
        std::uint64_t bytes=0;media_pixels::AlphaFacts pixels;
        bool created=false,flushed=false,readonly=false,namedReadback=false,originalReadWitnessHeld=false;
    };
    struct PacketFacts final {
        std::uint64_t position=0,bytes=0;std::array<unsigned char,12> header{};
    };
    struct Facts final {
        Status status=Status::Refused;std::string code="native_media_not_attempted";std::uint32_t win32Error=0;
        bool attempted=false,timedOut=false,metadataVerified=false,packetsVerified=false,fullDecodeVerified=false;
        bool encodedFormatHqAlphaVerified=false,hqConfigurationVerified=false;
        ObjectPin outputPin;Digest outputHash{},outputSelector{},metadataHash{},packetJsonHash{},packetHeadersHash{};
        std::string containerFamily,pixelFormat,colorSpace;
        std::uint32_t rateNumerator=0,rateDenominator=0,frameCount=0,width=0,height=0;
        std::uint64_t outputBytes=0,metadataBytes=0,packetJsonBytes=0,issuedMs=0,finishedMs=0;
        std::array<bool,6> enteredOperations{};
        // Pointers to retained original child facts, not copies/JSON or callers'
        // decoder claims. They stay valid for this collector's original lifetime.
        std::array<const media_children::OriginalChild::Facts*,6> childFacts{};
        std::vector<PacketFacts> packets;
        std::array<PreviewFacts,3> previews{};
    };
    struct Data;
    explicit OriginalMediaCapture(Inputs inputs);
    const Facts& CaptureOnce() noexcept;
    const Facts& DispositionFacts() const noexcept;
    bool HasOriginalDebt() const noexcept;
    bool HasPreviewWitnesses() const noexcept;
    const Facts& PollOriginalForDisposition() noexcept;
    const Facts& CancelOriginalOnce() noexcept;
    const Facts& RetirePreviewWitnessesOnce() noexcept;
    // Every exact borrowed HANDLE and the callback context must outlive both
    // child/artifact debt and the separate readonly preview witness obligation.
    // NativeClient retains this collector through visual review and explicitly
    // retires witnesses in independent lifecycle; destruction never kills a
    // child, closes held witnesses silently, or retries an effect.
    std::unique_ptr<Data> data_;friend class NativeClient;
};
}
