#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <vector>
#include <utility>

namespace local_session::trusted_read::media_pixels {
// Pure retained-pixel conversion, no IO/child/dependency/capability. The fixed
// original Alpha operation owns dimensions/index, stdout and artifact effects.
constexpr std::size_t kMaximumRgbaBytes=67108864;
constexpr std::size_t kMaximumPngBytes=67200000;
struct AlphaFacts final {std::uint64_t pixels=0,transparent=0,opaque=0,partial=0,foreground=0,alphaSum=0;
    std::uint8_t minimum=255,maximum=0;};
inline std::uint32_t Crc32(const unsigned char* bytes,std::size_t count)noexcept{
    std::uint32_t crc=0xffffffff;for(std::size_t i=0;i<count;++i){crc^=bytes[i];for(unsigned bit=0;bit<8;++bit)crc=(crc>>1)^(0xedb88320u&static_cast<std::uint32_t>(-static_cast<std::int32_t>(crc&1)));}return crc^0xffffffff;
}
inline std::uint32_t Adler32(const std::vector<unsigned char>& bytes)noexcept{
    std::uint32_t a=1,b=0;for(const auto byte:bytes){a=(a+byte)%65521;b=(b+a)%65521;}return (b<<16)|a;
}
inline void Be32(std::vector<unsigned char>& bytes,std::uint32_t value){for(unsigned byte=0;byte<4;++byte)bytes.push_back(static_cast<unsigned char>(value>>(24-byte*8)));}
inline void Chunk(std::vector<unsigned char>& png,const char* type,const std::vector<unsigned char>& payload){
    Be32(png,static_cast<std::uint32_t>(payload.size()));const auto start=png.size();for(unsigned i=0;i<4;++i)png.push_back(static_cast<unsigned char>(type[i]));
    png.insert(png.end(),payload.begin(),payload.end());Be32(png,Crc32(png.data()+start,4+payload.size()));
}
inline bool EncodeRgba(const std::vector<unsigned char>& rgba,std::uint32_t width,std::uint32_t height,std::vector<unsigned char>& out,AlphaFacts& facts){
    const auto pixels=static_cast<std::uint64_t>(width)*height;if(!width||!height||width>8192||height>8192||pixels>kMaximumRgbaBytes/4||rgba.size()!=pixels*4)return false;
    AlphaFacts observed;observed.pixels=pixels;for(std::size_t i=3;i<rgba.size();i+=4){const auto alpha=rgba[i];observed.minimum=std::min(observed.minimum,alpha);observed.maximum=std::max(observed.maximum,alpha);
        observed.alphaSum+=alpha;if(!alpha)++observed.transparent;else{++observed.foreground;if(alpha==255)++observed.opaque;else ++observed.partial;}}
    const auto rowBytes=static_cast<std::size_t>(width)*4;std::vector<unsigned char> scanlines;scanlines.reserve(rgba.size()+height);
    for(std::uint32_t row=0;row<height;++row){scanlines.push_back(0);const auto at=static_cast<std::size_t>(row)*rowBytes;scanlines.insert(scanlines.end(),rgba.begin()+at,rgba.begin()+at+rowBytes);}
    // zlib + finite stored DEFLATE blocks. No dynamic compressor or additional
    // process. Every PNG row is filter0 with exactly the retained RGBA pixels.
    std::vector<unsigned char> deflate{0x78,0x01};deflate.reserve(scanlines.size()+6+5*((scanlines.size()+65534)/65535));
    for(std::size_t at=0;at<scanlines.size();){const auto count=std::min<std::size_t>(65535,scanlines.size()-at);const auto length=static_cast<std::uint16_t>(count),complement=static_cast<std::uint16_t>(~length);
        deflate.push_back(static_cast<unsigned char>(at+count==scanlines.size()?1:0));deflate.push_back(static_cast<unsigned char>(length));deflate.push_back(static_cast<unsigned char>(length>>8));
        deflate.push_back(static_cast<unsigned char>(complement));deflate.push_back(static_cast<unsigned char>(complement>>8));deflate.insert(deflate.end(),scanlines.begin()+at,scanlines.begin()+at+count);at+=count;}
    Be32(deflate,Adler32(scanlines));std::vector<unsigned char> png{137,80,78,71,13,10,26,10},ihdr;Be32(ihdr,width);Be32(ihdr,height);
    ihdr.insert(ihdr.end(),{8,6,0,0,0});Chunk(png,"IHDR",ihdr);Chunk(png,"IDAT",deflate);Chunk(png,"IEND",{});
    if(png.size()>kMaximumPngBytes)return false;out=std::move(png);facts=observed;return true;
}
} // namespace local_session::trusted_read::media_pixels
