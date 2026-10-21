#include "ame_native_log_capture.h"
#include <windows.h>
#include <algorithm>
#include <charconv>
#include <cmath>
#include <limits>
#include <set>

namespace local_session::trusted_read::capture {
namespace {
using detail::Refuse;
class Reader final {
public:
    Reader(const std::vector<unsigned char>& bytes,std::size_t maximumBytes,std::size_t maximumNodes,std::size_t maximumDepth):bytes_(bytes),limit_(maximumNodes),depthLimit_(maximumDepth){
        if(bytes.empty()||bytes.size()>maximumBytes||bytes.size()>static_cast<std::size_t>(std::numeric_limits<int>::max())||!maximumNodes||
            !maximumDepth||maximumDepth>32||!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,reinterpret_cast<const char*>(bytes.data()),static_cast<int>(bytes.size()),nullptr,0))Refuse("trusted_native_json_utf8_or_bound_refused");}
    Json Parse(){auto value=Value(0);Space();if(at_!=bytes_.size())Refuse("trusted_native_json_trailing_refused");return value;}
private:
    const std::vector<unsigned char>& bytes_;std::size_t at_=0,nodes_=0,limit_=0,depthLimit_=0;
    void Space(){while(at_<bytes_.size()&&(bytes_[at_]==' '||bytes_[at_]=='\t'||bytes_[at_]=='\r'||bytes_[at_]=='\n'))++at_;}
    bool Take(unsigned char byte){Space();if(at_<bytes_.size()&&bytes_[at_]==byte){++at_;return true;}return false;}
    void Exact(std::string_view text){for(const char byte:text)if(at_>=bytes_.size()||bytes_[at_++]!=static_cast<unsigned char>(byte))Refuse("trusted_native_json_literal_refused");}
    static void Utf8(std::string& value,std::uint32_t code){if(code<=0x7f)value+=static_cast<char>(code);else if(code<=0x7ff){value+=static_cast<char>(0xc0|(code>>6));value+=static_cast<char>(0x80|(code&0x3f));}
        else if(code<=0xffff){value+=static_cast<char>(0xe0|(code>>12));value+=static_cast<char>(0x80|((code>>6)&0x3f));value+=static_cast<char>(0x80|(code&0x3f));}
        else{value+=static_cast<char>(0xf0|(code>>18));value+=static_cast<char>(0x80|((code>>12)&0x3f));value+=static_cast<char>(0x80|((code>>6)&0x3f));value+=static_cast<char>(0x80|(code&0x3f));}}
    std::uint32_t Hex4(){std::uint32_t value=0;for(unsigned i=0;i<4;++i){if(at_==bytes_.size())Refuse("trusted_native_json_escape_refused");const auto c=bytes_[at_++];
        const unsigned digit=c>='0'&&c<='9'?static_cast<unsigned>(c-'0'):c>='a'&&c<='f'?static_cast<unsigned>(c-'a'+10):c>='A'&&c<='F'?static_cast<unsigned>(c-'A'+10):16;
        if(digit>15)Refuse("trusted_native_json_escape_refused");value=(value<<4)|digit;}return value;}
    std::string String(){if(!Take('"'))Refuse("trusted_native_json_string_refused");std::string value;
        while(at_<bytes_.size()){const auto c=bytes_[at_++];if(c=='"')return value;if(c<0x20)Refuse("trusted_native_json_string_control_refused");
            if(c!='\\')value+=static_cast<char>(c);else{if(at_==bytes_.size())Refuse("trusted_native_json_escape_refused");const auto escaped=bytes_[at_++];
                switch(escaped){case '"':case '\\':case '/':value+=static_cast<char>(escaped);break;case 'b':value+='\b';break;case 'f':value+='\f';break;case 'n':value+='\n';break;case 'r':value+='\r';break;case 't':value+='\t';break;
                case 'u':{auto code=Hex4();if(code>=0xd800&&code<=0xdbff){if(at_+2>bytes_.size()||bytes_[at_]!='\\'||bytes_[at_+1]!='u')Refuse("trusted_native_json_surrogate_refused");at_+=2;const auto low=Hex4();
                    if(low<0xdc00||low>0xdfff)Refuse("trusted_native_json_surrogate_refused");code=0x10000+((code-0xd800)<<10)+(low-0xdc00);}
                    else if(code>=0xdc00&&code<=0xdfff)Refuse("trusted_native_json_surrogate_refused");Utf8(value,code);break;}
                default:Refuse("trusted_native_json_escape_refused");}}
            if(value.size()>bytes_.size())Refuse("trusted_native_json_string_bound_refused");}
        Refuse("trusted_native_json_string_eof_refused");}
    Json Value(unsigned depth){Space();if(depth>depthLimit_||at_==bytes_.size()||nodes_==limit_)Refuse("trusted_native_json_node_bound_refused");++nodes_;Json value;const auto c=bytes_[at_];
        if(c=='{'){++at_;value.kind=Json::Kind::Object;if(Take('}'))return value;std::set<std::string> seen;do{auto key=String();if(key.find('\0')!=std::string::npos||
                !seen.insert(key).second)Refuse("trusted_native_json_duplicate_key_refused");
                if(!Take(':'))Refuse("trusted_native_json_colon_refused");value.keys.push_back(std::move(key));value.children.push_back(Value(depth+1));}while(Take(','));if(!Take('}'))Refuse("trusted_native_json_object_eof_refused");return value;}
        if(c=='['){++at_;value.kind=Json::Kind::Array;if(Take(']'))return value;do{value.children.push_back(Value(depth+1));}while(Take(','));if(!Take(']'))Refuse("trusted_native_json_array_eof_refused");return value;}
        if(c=='"'){value.kind=Json::Kind::String;value.scalar=String();return value;}
        if(c=='n'){Exact("null");return value;}if(c=='t'||c=='f'){value.kind=Json::Kind::Boolean;if(c=='t'){Exact("true");value.scalar="true";}else{Exact("false");value.scalar="false";}return value;}
        const auto begin=at_;if(c=='-')++at_;if(at_==bytes_.size())Refuse("trusted_native_json_number_refused");
        if(bytes_[at_]=='0')++at_;else{if(bytes_[at_]<'1'||bytes_[at_]>'9')Refuse("trusted_native_json_number_refused");while(at_<bytes_.size()&&bytes_[at_]>='0'&&bytes_[at_]<='9')++at_;}
        if(at_<bytes_.size()&&bytes_[at_]=='.'){++at_;const auto digit=at_;while(at_<bytes_.size()&&bytes_[at_]>='0'&&bytes_[at_]<='9')++at_;if(digit==at_)Refuse("trusted_native_json_number_refused");}
        if(at_<bytes_.size()&&(bytes_[at_]=='e'||bytes_[at_]=='E')){++at_;if(at_<bytes_.size()&&(bytes_[at_]=='+'||bytes_[at_]=='-'))++at_;const auto digit=at_;
            while(at_<bytes_.size()&&bytes_[at_]>='0'&&bytes_[at_]<='9')++at_;if(digit==at_)Refuse("trusted_native_json_number_refused");}
        value.kind=Json::Kind::Number;value.scalar.assign(reinterpret_cast<const char*>(bytes_.data()+begin),at_-begin);(void)value.Real();return value;
    }
};
std::uint32_t Decimal(std::string_view text){if(text.empty()||text.size()>10)return 0;std::uint32_t value=0;const auto parsed=std::from_chars(text.data(),text.data()+text.size(),value);
    return parsed.ec==std::errc{}&&parsed.ptr==text.data()+text.size()?value:0;}
bool Video(std::string_view text,VideoParameters& video){constexpr std::string_view prefix=" - Video: ";if(text.substr(0,prefix.size())!=prefix)return false;text.remove_prefix(prefix.size());
    const auto x=text.find('x'),p=text.find("p ");if(x==std::string_view::npos||p==std::string_view::npos||p<=x+1)return false;
    video.width=Decimal(text.substr(0,x));video.height=Decimal(text.substr(x+1,p-x-1));text.remove_prefix(p+2);const auto fps=text.find(" fps ");if(fps==std::string_view::npos)return false;
    const auto rate=text.substr(0,fps);const auto dot=rate.find('.');if(dot==std::string_view::npos){video.fpsNumerator=Decimal(rate);video.fpsDenominator=1;}
    else{if(rate.find('.',dot+1)!=std::string_view::npos||rate.size()-dot-1>3||dot==0||dot+1==rate.size())return false;std::string digits(rate);digits.erase(dot,1);
        video.fpsNumerator=Decimal(digits);video.fpsDenominator=1;for(std::size_t i=dot+1;i<rate.size();++i)video.fpsDenominator*=10;}
    text.remove_prefix(fps+5);const auto colon=text.find(':'),space=text.find(' ');if(colon==std::string_view::npos||space==std::string_view::npos||space<=colon+1)return false;
    video.pixelNumerator=Decimal(text.substr(0,colon));video.pixelDenominator=Decimal(text.substr(colon+1,space-colon-1));text.remove_prefix(space+1);
    video.highQualityTokenObserved=text=="High Quality, With Alpha";video.alphaTokenObserved=video.highQualityTokenObserved;
    return video.width&&video.height&&video.fpsNumerator&&video.fpsDenominator&&video.pixelNumerator&&video.pixelDenominator&&video.highQualityTokenObserved;
}
}
const Json* Json::Optional(std::string_view name)const noexcept{if(kind!=Kind::Object||keys.size()!=children.size())return nullptr;for(std::size_t i=0;i<keys.size();++i)if(keys[i]==name)return &children[i];return nullptr;}
const Json& Json::Field(std::string_view name)const{const auto* value=Optional(name);if(!value)detail::Refuse("trusted_native_json_required_field_absent");return *value;}
const std::string& Json::Text()const{if(kind!=Kind::String)detail::Refuse("trusted_native_json_text_required");return scalar;}
std::uint64_t Json::Unsigned()const{if((kind!=Kind::String&&kind!=Kind::Number)||scalar.empty())detail::Refuse("trusted_native_json_unsigned_required");
    std::uint64_t value=0;const auto parsed=std::from_chars(scalar.data(),scalar.data()+scalar.size(),value);if(parsed.ec!=std::errc{}||parsed.ptr!=scalar.data()+scalar.size())detail::Refuse("trusted_native_json_unsigned_refused");return value;}
double Json::Real()const{if((kind!=Kind::String&&kind!=Kind::Number)||scalar.empty())detail::Refuse("trusted_native_json_real_required");double value=0;
    const auto parsed=std::from_chars(scalar.data(),scalar.data()+scalar.size(),value);if(parsed.ec!=std::errc{}||parsed.ptr!=scalar.data()+scalar.size()||!std::isfinite(value))detail::Refuse("trusted_native_json_real_refused");return value;}
Json ParseOriginalJson(const std::vector<unsigned char>& bytes,std::size_t maximumBytes,std::size_t maximumNodes,std::size_t maximumDepth){return Reader(bytes,maximumBytes,maximumNodes,maximumDepth).Parse();}
ParsedWrapperLog ParseOriginalWrapperLog(const std::vector<unsigned char>& bytes){ParsedWrapperLog result;result.bytes=bytes.size();if(bytes.empty()||bytes.size()>65536){result.code="raw_log_empty_or_bound_refused";return result;}
    result.rawHash=detail::Hash(bytes);try{const auto root=ParseOriginalJson(bytes,65536,64);if(root.kind!=Json::Kind::Object||root.keys.size()!=3)return result;
        const auto& time=root.Field("time");if(time.kind==Json::Kind::Number)(void)time.Real();else if(time.kind!=Json::Kind::String||time.scalar.size()>256)return result;
        if(root.Field("error").kind!=Json::Kind::String)return result;const auto& summary=root.Field("summary");if(summary.kind!=Json::Kind::Array||summary.children.size()>32)return result;
        bool sawVideo=false;for(const auto& line:summary.children){const auto& text=line.Text();if(text.find('\0')!=std::string::npos)return result;result.summary.push_back(text);
            if(text.substr(0,9)==" - Video:"){if(sawVideo){result.code="duplicate_video_parameter_section";return result;}sawVideo=true;if(!Video(text,result.video)){result.code="unsupported_video_parameter_section";return result;}result.videoObserved=true;}}
        result.supported=true;result.code=result.videoObserved?"parsed_video_observation_only":"video_parameter_section_absent";return result;
    }catch(const detail::Failure&){result.code="malformed_or_unsupported_log_schema";return result;}
}
}
