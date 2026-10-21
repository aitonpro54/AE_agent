#if !defined(AE_AGENT_PHASE_SYNTHETIC_OBSERVED_CAPTURE_PROOF) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || defined(AE_AGENT_PRODUCTION_SOURCE_HEADERS)
#error This factual capture proof cannot enable an installed production role.
#endif
#include "owned_observed_timing_capture.h"
#include <iostream>
#include "observed_timing_capture_fixtures.h"
namespace local_session::detail {
[[noreturn]] void Refuse(const char* code,std::uint32_t error,bool unknown,bool unavailable){throw Failure{code,error,unknown,unavailable};}
Digest Hash(const std::vector<unsigned char>&){Refuse("synthetic_observed_capture_hash_closed");}
}
int main(){using namespace local_session::trusted_read::capture;unsigned checks=0,failed=0;
    for(const auto& fixture:kObservedTimingCaptureFixtures){bool accepted=false;try{const std::string text=fixture.raw;const auto input=ParseOriginalJson({text.begin(),text.end()},1048576,4096);
            Fields(input,{"timing","comp"});const auto resolved=ObservedTimingCompJoin(input.Field("timing"),input.Field("comp"),false);
            accepted=resolved.frameCount==fixture.n&&resolved.rateNumerator==fixture.p&&resolved.rateDenominator==fixture.q&&resolved.alphaIndices==std::array<std::uint32_t,3>{fixture.n/4,fixture.n/2,(3*fixture.n)/4};
        }catch(const local_session::detail::Failure&){}catch(...){std::cerr<<"unexpected observed capture fixture failure\n";return 2;}
        ++checks;if(accepted!=fixture.accepted){++failed;std::cerr<<"FAIL "<<fixture.name<<'\n';}}
    std::cout<<"{\"schema\":\"ae-agent.native-observed-capture-proof.v1\",\"checks\":"<<checks<<",\"failed\":"<<failed<<",\"nativeAuthority\":false,\"effects\":0}\n";return failed?1:0;
}
