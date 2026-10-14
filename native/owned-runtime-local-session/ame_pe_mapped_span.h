#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <utility>
#include <vector>

namespace local_session::trusted_read::pe {
// Pure bounds/bytes only. The actual owner still observes its original HANDLE,
// page protections, source pins, headers and memory before/after this check.
struct SectionSpan final {std::uint32_t rva=0,mappedBytes=0,rawOffset=0,rawBytes=0;};
inline bool SectionMappedSpan(std::uint32_t rva,std::uint32_t virtualBytes,std::uint32_t rawOffset,std::uint32_t rawBytes,
    std::uint32_t nextRva,std::uint32_t imageBytes,std::size_t fileBytes,std::uint32_t headersBytes,
    std::uint32_t sectionAlignment,std::uint32_t fileAlignment,SectionSpan& out)noexcept{
    const auto power=[](std::uint32_t value){return value&&!(value&(value-1));};
    if(!power(sectionAlignment)||sectionAlignment<4096||sectionAlignment>1048576||!power(fileAlignment)||fileAlignment<512||fileAlignment>65536||
        sectionAlignment<fileAlignment||!imageBytes||imageBytes>268435456||imageBytes%sectionAlignment||!headersBytes||headersBytes>fileBytes||headersBytes>imageBytes||
        !rva||rva%sectionAlignment||rva>=imageBytes||nextRva<=rva||nextRva>imageBytes||nextRva%sectionAlignment||
        (rawBytes&&(rawOffset<headersBytes||rawOffset%fileAlignment||rawBytes%fileAlignment))||rawOffset>fileBytes||rawBytes>fileBytes-rawOffset)return false;
    const auto round=[&](std::uint64_t count){return (count+sectionAlignment-1)/sectionAlignment*sectionAlignment;};
    const auto content=std::max(virtualBytes,rawBytes);const auto mapped=round(content);
    if(!content||rva<round(headersBytes)||mapped>std::numeric_limits<std::uint32_t>::max()||mapped>imageBytes-rva||mapped>nextRva-rva)return false;
    out={rva,static_cast<std::uint32_t>(mapped),rawOffset,rawBytes};return true;
}
inline bool ExpectedSection(const std::vector<unsigned char>& file,const SectionSpan& span,std::vector<unsigned char>& out){
    if(!span.mappedBytes||span.mappedBytes>16777216||span.rawBytes>span.mappedBytes||span.rawOffset>file.size()||span.rawBytes>file.size()-span.rawOffset)return false;
    std::vector<unsigned char> expected(span.mappedBytes,0);std::copy_n(file.begin()+span.rawOffset,span.rawBytes,expected.begin());out=std::move(expected);return true;
}
inline bool NormalizeDir64(std::vector<unsigned char>& memory,std::size_t at,std::uint64_t delta)noexcept{
    if(at>memory.size()||sizeof(std::uint64_t)>memory.size()-at)return false;std::uint64_t value=0;std::memcpy(&value,memory.data()+at,sizeof(value));value-=delta;
    std::memcpy(memory.data()+at,&value,sizeof(value));return true;
}
inline bool ApprovedExecutableProtection(std::uint32_t actual)noexcept{return actual==0x10||actual==0x20;}
inline bool ExecutableRegionMeasured(std::uint64_t regionBase,std::uint64_t regionBytes,std::uint64_t imageBytes,const std::vector<SectionSpan>& measured)noexcept{
    if(!regionBytes||regionBase>=imageBytes||regionBytes>imageBytes-regionBase||measured.empty())return false;
    const auto end=regionBase+regionBytes;auto cursor=regionBase;
    for(const auto& span:measured){if(!span.mappedBytes||span.rva>=imageBytes||span.mappedBytes>imageBytes-span.rva)return false;
        const auto spanEnd=static_cast<std::uint64_t>(span.rva)+span.mappedBytes;if(spanEnd<=cursor)continue;if(span.rva>cursor)return false;
        cursor=std::min(end,spanEnd);if(cursor==end)return true;}
    return false;
}
} // namespace local_session::trusted_read::pe
