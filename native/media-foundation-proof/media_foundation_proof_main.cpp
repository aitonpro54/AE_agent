// Synthetic shared-header regression proof. Never binds a runtime or factory.
#if !defined(AE_AGENT_MEDIA_FOUNDATION_SYNTHETIC_PROOF) || AE_AGENT_MEDIA_FOUNDATION_SYNTHETIC_PROOF != 1
#error Explicit synthetic proof opt-in required.
#endif
#if defined(AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || defined(AE_AGENT_PHASE_PRODUCTION_TARGET) || defined(AE_AGENT_PHASE_TRUSTED_READ_SETUP)
#error Installed, production and setup profiles are forbidden in the synthetic proof.
#endif
#include "../owned-runtime-local-session/ame_native_rgba_png.h"
#include "../owned-runtime-local-session/ame_pe_mapped_span.h"
#include "../owned-runtime-local-session/trusted_execution_budget.h"
#include <array>
#include <cerrno>
#include <cstring>
#include <exception>
#include <fcntl.h>
#include <filesystem>
#include <io.h>
#include <iostream>
#include <share.h>
#include <sstream>
#include <string>
#include <string_view>
#include <sys/stat.h>

namespace {
namespace pixels = local_session::trusted_read::media_pixels;
namespace pe = local_session::trusted_read::pe;
using local_session::trusted_read::ExecutionCost;
using local_session::trusted_read::FixedTwoTitleCosts;
unsigned checks = 0;
unsigned failures = 0;
void Check(bool ok, const char* label) {
    ++checks;
    if (!ok) { ++failures; std::cerr << "FAILED: " << label << '\n'; }
}
bool SameFacts(const pixels::AlphaFacts& a, const pixels::AlphaFacts& b) {
    return a.pixels == b.pixels && a.transparent == b.transparent && a.opaque == b.opaque &&
        a.partial == b.partial && a.foreground == b.foreground && a.alphaSum == b.alphaSum &&
        a.minimum == b.minimum && a.maximum == b.maximum;
}
bool SameSpan(const pe::SectionSpan& a, const pe::SectionSpan& b) {
    return a.rva == b.rva && a.mappedBytes == b.mappedBytes && a.rawOffset == b.rawOffset && a.rawBytes == b.rawBytes;
}
void BudgetCases() {
    using namespace local_session::trusted_read;
    Check(kTwoTitleCalls == 86 && kTwoTitlePreparedScopes == 11 && kTwoTitleReadIssuances == 12 &&
        kTwoTitlePollsPerJob == 10 && kTwoTitleStartupExternal == 32 && kTwoTitleMediaChildren == 6 &&
        kTwoTitleAlphaSamples == 3 && kTwoTitleRenewalOpportunities == 10 && kTwoTitleMediaMaximumMs == 540000,
        "finite two-title constants");
    const std::array<ExecutionCost, 11> vectors{{FixedTwoTitleCosts::Startup(), FixedTwoTitleCosts::InitialRead(),
        FixedTwoTitleCosts::Preparation(), FixedTwoTitleCosts::Checkpoint(), FixedTwoTitleCosts::CleanCopy(),
        FixedTwoTitleCosts::Delivery(), FixedTwoTitleCosts::Poll(), FixedTwoTitleCosts::Terminal(),
        FixedTwoTitleCosts::Media(), FixedTwoTitleCosts::Teardown(), FixedTwoTitleCosts::Full()}};
    const std::array<ExecutionCost, 11> known{{{1,32,64,32,0,0},{37,26,26,0,0,0},{35,42,42,0,0,0},
        {1,2,2,0,0,0},{1,1,1,0,0,0},{1,2,2,0,0,0},{0,2,2,0,0,0},{1,1,1,0,1,0},
        {0,7,7,0,1,0},{0,16,16,0,0,16},{86,192,224,32,4,16}}};
    for (std::size_t i = 0; i < vectors.size(); ++i) Check(vectors[i].Same(known[i]) && vectors[i].Fits(), "fixed cost vector");
    ExecutionCost total{};
    bool exact = total.Plus(vectors[0], total) && total.Plus(vectors[1], total) && total.Plus(vectors[2], total) && total.Plus(vectors[3], total);
    for (unsigned title = 0; title < 2; ++title) {
        exact = exact && total.Plus(vectors[4], total);
        for (unsigned delivery = 0; delivery < 4; ++delivery) exact = exact && total.Plus(vectors[5], total);
        for (unsigned poll = 0; poll < kTwoTitlePollsPerJob; ++poll) exact = exact && total.Plus(vectors[6], total);
        exact = exact && total.Plus(vectors[7], total) && total.Plus(vectors[8], total);
    }
    exact = exact && total.Plus(vectors[9], total);
    Check(exact && total.Same(known[10]), "full budget composition with output aliasing");
    const ExecutionCost zero{};
    Check(zero.Empty() && !total.Empty(), "empty cost");
    const std::array<std::uint16_t ExecutionCost::*, 6> fields{{&ExecutionCost::calls, &ExecutionCost::external,
        &ExecutionCost::store, &ExecutionCost::service, &ExecutionCost::terminalMedia, &ExecutionCost::teardown}};
    const std::array<std::uint16_t, 6> limits{{86,192,256,32,16,16}};
    const ExecutionCost sentinel{1,2,3,4,5,6};
    for (std::size_t i = 0; i < fields.size(); ++i) {
        ExecutionCost boundary{}; boundary.*fields[i] = limits[i];
        ExecutionCost output = sentinel;
        Check(boundary.Fits() && zero.Plus(boundary, output) && output.Same(boundary), "each exact budget ceiling");
        ++(boundary.*fields[i]); output = sentinel;
        Check(!boundary.Fits() && !zero.Plus(boundary, output) && output.Same(sentinel), "each overlimit leaves full output unchanged");
        ExecutionCost overflow{}; overflow.*fields[i] = 65535;
        ExecutionCost increment{}; increment.*fields[i] = 1; output = sentinel;
        Check(!overflow.Plus(increment, output) && output.Same(sentinel), "each arithmetic overflow leaves full output unchanged");
        output = overflow;
        Check(!output.Plus(increment, output) && output.Same(overflow), "overflow aliasing preserves input/output");
    }
}
void PeCases() {
    pe::SectionSpan span{};
    const auto valid = [&](std::uint32_t bytes, std::uint32_t next = 12288, std::uint32_t image = 16384) {
        return pe::SectionMappedSpan(4096, bytes, 512, 512, next, image, 1024, 512, 4096, 512, span);
    };
    Check(valid(6000) && span.mappedBytes == 8192, "mapped virtual and alignment tail");
    std::vector<unsigned char> file(1024, 0), expected; file[512] = 0x48; file[513] = 0x90; file[1023] = 0xa5;
    Check(pe::ExpectedSection(file, span, expected) && expected.size() == 8192 && expected[0] == 0x48 &&
        expected[1] == 0x90 && expected[511] == 0xa5 && expected[512] == 0 && expected.back() == 0, "raw copy and full zero-fill");
    auto changed = expected; changed[6000] = 0x90; Check(changed != expected, "synthetic virtual tail mismatch");
    changed = expected; changed.back() = 0x90; Check(changed != expected, "synthetic aligned tail mismatch");
    const auto retained = span;
    Check(!valid(0xffffffff) && SameSpan(span, retained), "overflow span no publication");
    Check(!valid(6000, 8192) && SameSpan(span, retained), "next RVA overlap");
    Check(!valid(6000, 8192, 8192) && SameSpan(span, retained), "SizeOfImage overlap");
    Check(!pe::SectionMappedSpan(4096,6000,512,1024,12288,16384,1024,512,4096,512,span) && SameSpan(span, retained), "truncated raw image");
    Check(!pe::SectionMappedSpan(4096,6000,512,512,12288,16384,1024,512,6144,512,span) && SameSpan(span, retained), "unsupported alignment");
    Check(!pe::SectionMappedSpan(4096,6000,0,512,12288,16384,1024,512,4096,512,span) && SameSpan(span, retained), "raw headers alias");
    Check(!pe::SectionMappedSpan(4096,6000,512,512,12288,16384,8192,8192,4096,512,span) && SameSpan(span, retained), "mapped headers overlap");
    auto invalidSpan = retained; invalidSpan.rawBytes = invalidSpan.mappedBytes + 1;
    changed = {1,2,3}; const auto sentinel = changed;
    Check(!pe::ExpectedSection(file, invalidSpan, changed) && changed == sentinel, "expected section refusal preserves output");
    invalidSpan = retained; invalidSpan.mappedBytes = 16777217;
    Check(!pe::ExpectedSection(file, invalidSpan, changed) && changed == sentinel, "expected section fixed maximum");
    changed = expected; const std::uint64_t delta = 0x140000000ULL;
    std::memcpy(changed.data() + 1024, &delta, sizeof(delta));
    Check(pe::NormalizeDir64(changed, 1024, delta) && changed == expected, "DIR64 normalization in virtual tail");
    Check(!pe::NormalizeDir64(changed, changed.size() - 7, delta) && changed == expected, "truncated DIR64 preserves bytes");
    Check(!pe::NormalizeDir64(changed, static_cast<std::size_t>(-1), delta) && changed == expected, "DIR64 offset overflow");
    const std::vector<pe::SectionSpan> measured{{4096,8192,512,512}};
    Check(pe::ExecutableRegionMeasured(4096,8192,16384,measured), "synthetic full RX span");
    Check(!pe::ExecutableRegionMeasured(0,4096,16384,measured), "RX headers refused");
    Check(!pe::ExecutableRegionMeasured(12288,4096,16384,measured), "RX data refused");
    Check(!pe::ExecutableRegionMeasured(4096,12288,16384,measured), "RX code-data cross refused");
    const std::vector<pe::SectionSpan> gap{{4096,4096,512,512},{12288,4096,512,512}};
    Check(!pe::ExecutableRegionMeasured(8192,4096,16384,gap), "RX gap refused");
    Check(!pe::ExecutableRegionMeasured(4096,12288,16384,gap), "RX region spanning gap refused");
    Check(!pe::ExecutableRegionMeasured(4096,16384,16384,measured), "RX outside image refused");
    Check(!pe::ExecutableRegionMeasured(4096,0,16384,measured) && !pe::ExecutableRegionMeasured(4096,4096,16384,{}), "zero region and absent measurement refused");
    const std::vector<pe::SectionSpan> contiguous{{4096,4096,512,512},{8192,4096,512,512}};
    Check(pe::ExecutableRegionMeasured(4096,8192,16384,contiguous), "contiguous measured spans cover region");
    for (const std::uint32_t protection : {0x10u,0x20u}) Check(pe::ApprovedExecutableProtection(protection), "approved synthetic protection value");
    for (const std::uint32_t protection : {0u,0x01u,0x02u,0x04u,0x08u,0x40u,0x80u,0x110u,0x120u,0x220u})
        Check(!pe::ApprovedExecutableProtection(protection), "unapproved writable/guard/modifier protection value");
}
const std::vector<unsigned char> tiny{255,0,0,0,0,255,0,64,0,0,255,128,255,255,255,255};
void PngCases() {
    std::vector<unsigned char> png; pixels::AlphaFacts facts;
    Check(pixels::EncodeRgba(tiny,2,2,png,facts) && png.size() == 86, "exact 2x2 PNG");
    pixels::AlphaFacts known; known.pixels = 4; known.transparent = 1; known.opaque = 1; known.partial = 2;
    known.foreground = 3; known.alphaSum = 447; known.minimum = 0; known.maximum = 255;
    Check(SameFacts(facts,known), "all alpha facts from retained bytes");
    const unsigned char digits[]{'1','2','3','4','5','6','7','8','9'};
    Check(pixels::Crc32(digits,sizeof(digits)) == 0xcbf43926u && pixels::Crc32(nullptr,0) == 0, "independent CRC32 vectors");
    Check(pixels::Adler32({'W','i','k','i','p','e','d','i','a'}) == 0x11e60398u && pixels::Adler32({}) == 1, "independent Adler32 vectors");
    const auto retained = png; const auto retainedFacts = facts;
    const auto refused = [&](const std::vector<unsigned char>& input, std::uint32_t w, std::uint32_t h) {
        return !pixels::EncodeRgba(input,w,h,png,facts) && png == retained && SameFacts(facts,retainedFacts);
    };
    auto truncated = tiny; truncated.pop_back(); Check(refused(truncated,2,2), "truncated RGBA preserves PNG and every fact");
    auto extra = tiny; extra.push_back(0); Check(refused(extra,2,2), "excess RGBA preserves PNG and every fact");
    Check(refused({},0,0) && refused(tiny,0,2) && refused(tiny,2,0), "zero dimensions");
    Check(refused(tiny,8193,1) && refused(tiny,1,8193), "dimension ceilings");
    Check(refused(tiny,8192,8192), "RGBA byte ceiling refusal before allocation");
    Check(refused(tiny,0xffffffffu,0xffffffffu), "wide dimension arithmetic refusal");
    for (const unsigned char alpha : {static_cast<unsigned char>(0),static_cast<unsigned char>(1),static_cast<unsigned char>(255)}) {
        Check(pixels::EncodeRgba({17,23,42,alpha},1,1,png,facts) && facts.pixels == 1 && facts.alphaSum == alpha &&
            facts.minimum == alpha && facts.maximum == alpha && facts.transparent == (alpha == 0 ? 1u : 0u) &&
            facts.opaque == (alpha == 255 ? 1u : 0u) && facts.partial == (alpha != 0 && alpha != 255 ? 1u : 0u) &&
            facts.foreground == (alpha != 0 ? 1u : 0u), "minimum image and alpha class");
    }
}
std::string Hex32(std::uint32_t value) {
    constexpr char hex[] = "0123456789abcdef"; std::string out(8,'0');
    for (unsigned i = 0; i < 8; ++i) out[i] = hex[(value >> (28 - i * 4)) & 15];
    return out;
}
bool ExclusiveWrite(const std::filesystem::path& path, const unsigned char* data, std::size_t size) {
    int fd = -1;
    if (_wsopen_s(&fd,path.c_str(),_O_WRONLY|_O_CREAT|_O_EXCL|_O_BINARY,_SH_DENYRW,_S_IREAD|_S_IWRITE) != 0) return false;
    bool ok = true;
    for (std::size_t at = 0; at < size;) {
        const auto count = static_cast<unsigned>(std::min<std::size_t>(size-at,65536));
        const int written = _write(fd,data+at,count);
        if (written <= 0) { ok = false; break; }
        at += static_cast<std::size_t>(written);
    }
    return _close(fd) == 0 && ok;
}
void FactsJson(std::ostream& out, const pixels::AlphaFacts& f) {
    out << "{\"pixels\":" << f.pixels << ",\"transparent\":" << f.transparent << ",\"opaque\":" << f.opaque
        << ",\"partial\":" << f.partial << ",\"foreground\":" << f.foreground << ",\"alphaSum\":" << f.alphaSum
        << ",\"minimum\":" << static_cast<unsigned>(f.minimum) << ",\"maximum\":" << static_cast<unsigned>(f.maximum) << '}';
}
struct Fixture final { const char* name; std::uint32_t width, height; bool exact; };
int Fixtures(const std::filesystem::path& dir) {
    // Caller supplies an existing unique empty directory. No directory creation,
    // arbitrary input media, overwrite, deletion, process or service operation.
    if (!dir.is_absolute() || !std::filesystem::is_directory(dir) || !std::filesystem::is_empty(dir)) {
        std::cerr << "Fixture output must be an existing absolute empty directory.\n"; return 2;
    }
    const std::array<Fixture,4> cases{{{"exact-2x2.png",2,2,true},{"stored-block-boundary.png",8192,2,false},
        {"fhd-pattern.png",1920,1080,false},{"maximum-rgba.png",8192,2048,false}}};
    std::ostringstream manifest;
    manifest << "{\"schema\":\"ae-agent.media-foundation-fixtures.v1\",\"syntheticOnly\":true,\"authority\":false,\"factory\":false,\"aeCalls\":0,\"fixtures\":[";
    bool first = true;
    for (const auto& fixture : cases) {
        std::vector<unsigned char> rgba;
        if (fixture.exact) rgba = tiny;
        else {
            rgba.resize(static_cast<std::size_t>(fixture.width)*fixture.height*4);
            for (std::uint32_t y = 0; y < fixture.height; ++y) for (std::uint32_t x = 0; x < fixture.width; ++x) {
                const auto at = (static_cast<std::size_t>(y)*fixture.width+x)*4;
                rgba[at] = static_cast<unsigned char>((x*17u+y*3u)&255u);
                rgba[at+1] = static_cast<unsigned char>((x*5u+y*29u)&255u);
                rgba[at+2] = static_cast<unsigned char>((x^y)&255u);
                rgba[at+3] = static_cast<unsigned char>((x+y)&255u);
            }
        }
        std::vector<unsigned char> png; pixels::AlphaFacts facts;
        if (!pixels::EncodeRgba(rgba,fixture.width,fixture.height,png,facts) || !ExclusiveWrite(dir/fixture.name,png.data(),png.size())) {
            std::cerr << "Fixture creation failed; inspect actual directory before any retry.\n"; return 3;
        }
        if (!first) manifest << ',';
        first = false;
        manifest << "{\"file\":\"" << fixture.name << "\",\"width\":" << fixture.width << ",\"height\":" << fixture.height
            << ",\"pattern\":\"" << (fixture.exact ? "exact-2x2-v1" : "xy-rgba-v1") << "\",\"rgbaBytes\":" << rgba.size()
            << ",\"pngBytes\":" << png.size() << ",\"rgbaCrc32\":\"" << Hex32(pixels::Crc32(rgba.data(),rgba.size()))
            << "\",\"pngCrc32\":\"" << Hex32(pixels::Crc32(png.data(),png.size())) << "\",\"alpha\":";
        FactsJson(manifest,facts); manifest << '}';
    }
    std::vector<unsigned char> untouched{1,2,3}; const auto retained = untouched; pixels::AlphaFacts f, original = f;
    const bool refused = !pixels::EncodeRgba({},8192,8192,untouched,f) && untouched == retained && SameFacts(f,original);
    if (!refused) return 4;
    manifest << "],\"refusals\":[{\"width\":8192,\"height\":8192,\"accepted\":false,\"outputAndFactsUnchanged\":true}]}\n";
    const auto json = manifest.str();
    if (!ExclusiveWrite(dir/L"fixtures.json",reinterpret_cast<const unsigned char*>(json.data()),json.size())) {
        std::cerr << "Manifest exclusive creation failed; inspect directory before retry.\n"; return 5;
    }
    std::cout << json; return 0;
}
} // namespace
int wmain(int count, wchar_t** arguments) {
    try {
        if (count == 3 && std::wstring_view(arguments[1]) == L"--fixtures") return Fixtures(std::filesystem::path(arguments[2]));
        if (count != 1) { std::cerr << "Only no arguments or --fixtures <absolute empty directory> is supported.\n"; return 2; }
        BudgetCases(); PeCases(); PngCases();
        std::cout << "{\"schema\":\"ae-agent.media-foundation-proof.v1\",\"syntheticOnly\":true,\"authority\":false,\"factory\":false,\"aeCalls\":0,\"checks\":"
            << checks << ",\"failures\":" << failures << ",\"osLoadedPeProof\":false,\"nativeProducerProof\":false,\"renderProof\":false}\n";
        return failures == 0 ? 0 : 1;
    } catch (const std::exception&) {
        std::cerr << "Synthetic proof exception; inspect actual outputs before retry.\n"; return 6;
    }
}
