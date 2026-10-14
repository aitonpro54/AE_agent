#pragma once
#include "trusted_execution.h"
#include <string_view>

namespace local_session::trusted_read::capture {
// Bounded factual parser shared by the fixed wrapper log and native-owned
// decoder stdout. Parsing JSON cannot construct any job/media/settings cap.
struct Json final {
    enum class Kind:std::uint8_t{Null,Boolean,Number,String,Array,Object};Kind kind=Kind::Null;
    std::string scalar;std::vector<std::string> keys;std::vector<Json> children;
    const Json& Field(std::string_view name)const;
    const Json* Optional(std::string_view name)const noexcept;
    std::uint64_t Unsigned()const;
    double Real()const;
    const std::string& Text()const;
};
// Input/log callers retain depth12. Actual getter results select their separate
// finite result profile explicitly; there is no global permissive fallback.
Json ParseOriginalJson(const std::vector<unsigned char>& bytes,std::size_t maximumBytes,std::size_t maximumNodes,std::size_t maximumDepth=12);
struct VideoParameters final {std::uint32_t width=0,height=0,fpsNumerator=0,fpsDenominator=0,pixelNumerator=0,pixelDenominator=0;
    bool highQualityTokenObserved=false,alphaTokenObserved=false;};
struct ParsedWrapperLog final {bool supported=false,videoObserved=false;const char* code="unsupported_log_schema";
    Digest rawHash{};std::uint64_t bytes=0;std::vector<std::string> summary;VideoParameters video;};
ParsedWrapperLog ParseOriginalWrapperLog(const std::vector<unsigned char>& bytes);
}
