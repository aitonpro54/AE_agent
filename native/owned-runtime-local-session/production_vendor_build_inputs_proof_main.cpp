#if !defined(AE_AGENT_PHASE_SYNTHETIC_VENDOR_PROOF) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || defined(AE_AGENT_PRODUCTION_SOURCE_HEADERS)
#error Only an isolated factual vendor-row predicate proof is permitted.
#endif
#include "production_vendor_build_inputs.h"
#include <iostream>
int main(){using namespace local_session::production::vendor;std::size_t checks=0,failed=0;
    const auto check=[&](bool condition,const char* label){++checks;if(!condition){++failed;std::cerr<<"FAIL vendor-row predicate: "<<label<<'\n';}};
    for(const auto& row:kRows){check(Find(row.selector)==&row,"exact_private_selector");check(ExactRow(row,row.selector,row.path,row.pin,row.hash,row.bytes,row.links),"exact_private_row");
        auto pin=row.pin;pin.back()^=1;check(!ExactRow(row,row.selector,row.path,pin,row.hash,row.bytes,row.links),"foreign_pin");auto hash=row.hash;hash.back()^=1;
        check(!ExactRow(row,row.selector,row.path,row.pin,hash,row.bytes,row.links),"foreign_hash");check(!ExactRow(row,static_cast<std::uint16_t>(row.selector+1),row.path,row.pin,row.hash,row.bytes,row.links),"wrong_selector");
        check(!ExactRow(row,row.selector,std::wstring(row.path)+L".alias",row.pin,row.hash,row.bytes,row.links),"path_alias");check(!ExactRow(row,row.selector,row.path,row.pin,row.hash,row.bytes+1,row.links),"wrong_bytes");
        for(const auto links:{0u,1u,4u})check(!ExactRow(row,row.selector,row.path,row.pin,row.hash,row.bytes,links),"nonexact_links");
    }
    for(const auto selector:{0u,16u,1019u,1023u,65535u})check(Find(static_cast<std::uint16_t>(selector))==nullptr,"all_other_selectors_closed");
    std::cout<<"{\"schema\":\"ae-agent.vendor-build-input-predicate-proof.v1\",\"checks\":"<<checks<<",\"failed\":"<<failed<<",\"productionAuthority\":false,\"actualEffects\":0}\n";return failed?1:0;
}
