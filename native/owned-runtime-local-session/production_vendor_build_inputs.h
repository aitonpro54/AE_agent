#pragma once
#include "enrollment_win32.h"
#include <string_view>

namespace local_session::production::vendor {
// Three independent source-reviewed literal Windows build-control rows. These
// selectors apply only to ReconstructBuildInputs, never runtime images/source,
// credentials, generic ReadPin/Relative or a caller-selected multi-link file.
struct Definition final {std::uint16_t selector;const wchar_t* path;std::array<unsigned char,40> pin;Digest hash;std::uint32_t bytes,links;};
constexpr unsigned HexDigit(char c){return c>='0'&&c<='9'?static_cast<unsigned>(c-'0'):c>='A'&&c<='F'?static_cast<unsigned>(c-'A'+10):c>='a'&&c<='f'?static_cast<unsigned>(c-'a'+10):255u;}
template<std::size_t N> constexpr std::array<unsigned char,N> Literal(const char(&text)[2*N+1]){std::array<unsigned char,N> result{};for(std::size_t i=0;i<N;++i)result[i]=static_cast<unsigned char>((HexDigit(text[i*2])<<4)|HexDigit(text[i*2+1]));return result;}
inline constexpr Definition kRows[]={
    {1020,L"\\\\?\\Volume{c3c972fd-0862-442d-9c16-be619b003f4d}\\Windows\\System32\\tzres.dll",Literal<40>("FD72C9C362082D449C16BE619B003F4DE353213E1CF9BA59B5710D0000000A000000000000000000"),Literal<32>("1398CF1D866E49A8BA351E2A30A7803B50C8B595D17F776ABE8D2EC4A9C6FB10"),12288,2},
    {1021,L"\\\\?\\Volume{c3c972fd-0862-442d-9c16-be619b003f4d}\\Windows\\Globalization\\Sorting\\SortDefault.nls",Literal<40>("FD72C9C362082D449C16BE619B003F4DE353213E1CF9BA5991C50000000001000000000000000000"),Literal<32>("5710C47F5C5C745854E11FC06C8D349CD61D084F5A90937396E88AB762298B67"),3385740,2},
    {1022,L"\\\\?\\Volume{c3c972fd-0862-442d-9c16-be619b003f4d}\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\Microsoft.Xaml.targets",Literal<40>("FD72C9C362082D449C16BE619B003F4DE353213E1CF9BA5969CD0000000001000000000000000000"),Literal<32>("C7901713049B86EDA6842A8AABA45DAAABB560BD1AE1C4AF711DD6D2FC916AF0"),19892,3}
};
constexpr const Definition* Find(std::uint16_t selector){for(const auto& row:kRows)if(row.selector==selector)return &row;return nullptr;}
inline bool ExactRow(const Definition& approved,std::uint16_t selector,std::wstring_view path,const std::array<unsigned char,40>& pin,const Digest& hash,std::uint64_t bytes,std::uint32_t links)noexcept{
    return selector==approved.selector&&path==approved.path&&pin==approved.pin&&hash==approved.hash&&bytes==approved.bytes&&links==approved.links;
}
}
