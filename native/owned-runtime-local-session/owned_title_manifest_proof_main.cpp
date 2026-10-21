#if !defined(AE_AGENT_PHASE_SYNTHETIC_MANIFEST_PROOF) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || defined(AE_AGENT_PRODUCTION_SOURCE_HEADERS)
#error Only an isolated factual predicate proof is permitted.
#endif
#include "owned_title_manifest_capture.h"
#include "ame_native_json_limits.h"
#include <iostream>
#include <cstring>
#include "owned_title_inventory_fixtures.h"
namespace local_session::detail {
[[noreturn]] void Refuse(const char* code,std::uint32_t error,bool unknown,bool unavailable){throw Failure{code,error,unknown,unavailable};}
Digest Hash(const std::vector<unsigned char>&){Refuse("synthetic_manifest_hashing_path_closed");}
}
int main(){std::size_t checked=0,failed=0;for(const auto& fixture:kInventoryFixtures){bool accepted=false;try{
    const auto* begin=reinterpret_cast<const unsigned char*>(fixture.raw);const std::vector<unsigned char> bytes(begin,begin+std::strlen(fixture.raw));
    const auto parsed=local_session::trusted_read::capture::ParseOriginalJson(bytes,1048576,524288,32);
    const auto selected=local_session::trusted_read::capture::FirstTwoObserved(parsed,0,10);accepted=selected.states[0].id!=selected.states[1].id;
}catch(const local_session::detail::Failure&){}catch(...){std::cerr<<"unexpected manifest predicate failure\n";return 2;}
    ++checked;if(accepted!=fixture.accepted){++failed;std::cerr<<"FAIL factual first-two predicate: "<<fixture.name<<'\n';}}
    std::cout<<"{\"schema\":\"ae-agent.first-two-native-predicate-proof.v1\",\"checks\":"<<checked<<",\"failed\":"<<failed<<",\"productionAuthority\":false,\"actualEffects\":0}\n";return failed?1:0;
}
