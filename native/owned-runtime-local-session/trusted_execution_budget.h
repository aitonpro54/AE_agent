#pragma once
#include <cstdint>
#include <limits>

namespace local_session::trusted_read {
// Arithmetic for the reviewed, finite two-title source profile. This header
// cannot issue a capability, bind a runtime or attest an observed footprint.
constexpr std::uint16_t kTwoTitleCalls=86;
constexpr std::uint16_t kTwoTitlePreparedScopes=11;
constexpr std::uint16_t kTwoTitleReadIssuances=12;
constexpr std::uint16_t kTwoTitlePollsPerJob=10;
constexpr std::uint16_t kTwoTitleStartupExternal=32;
constexpr std::uint16_t kTwoTitleMediaChildren=6;
constexpr std::uint16_t kTwoTitleAlphaSamples=3;
constexpr std::uint16_t kTwoTitleRenewalOpportunities=10;
constexpr std::uint64_t kTwoTitleMediaMaximumMs=540000;

struct ExecutionCost final {
    std::uint16_t calls=0,external=0,store=0,service=0,terminalMedia=0,teardown=0;
    constexpr bool Fits()const noexcept{return calls<=kTwoTitleCalls&&external<=192&&store<=256&&service<=32&&terminalMedia<=16&&teardown<=16;}
    constexpr bool Empty()const noexcept{return !calls&&!external&&!store&&!service&&!terminalMedia&&!teardown;}
    constexpr bool Same(const ExecutionCost& rhs)const noexcept{return calls==rhs.calls&&external==rhs.external&&store==rhs.store&&service==rhs.service&&terminalMedia==rhs.terminalMedia&&teardown==rhs.teardown;}
    bool Plus(const ExecutionCost& rhs,ExecutionCost& result)const noexcept{
        const auto add=[](std::uint16_t a,std::uint16_t b,std::uint16_t& out){if(b>std::numeric_limits<std::uint16_t>::max()-a)return false;out=static_cast<std::uint16_t>(a+b);return true;};
        ExecutionCost value;if(!add(calls,rhs.calls,value.calls)||!add(external,rhs.external,value.external)||!add(store,rhs.store,value.store)||
            !add(service,rhs.service,value.service)||!add(terminalMedia,rhs.terminalMedia,value.terminalMedia)||!add(teardown,rhs.teardown,value.teardown)||!value.Fits())return false;
        result=value;return true;
    }
};
struct FixedTwoTitleCosts final {
    static constexpr ExecutionCost Startup(){return {1,32,64,32,0,0};}
    static constexpr ExecutionCost InitialRead(){return {37,26,26,0,0,0};}
    static constexpr ExecutionCost Preparation(){return {35,42,42,0,0,0};}
    static constexpr ExecutionCost Checkpoint(){return {1,2,2,0,0,0};}
    static constexpr ExecutionCost CleanCopy(){return {1,1,1,0,0,0};}
    static constexpr ExecutionCost Delivery(){return {1,2,2,0,0,0};}
    static constexpr ExecutionCost Poll(){return {0,2,2,0,0,0};}
    static constexpr ExecutionCost Terminal(){return {1,1,1,0,1,0};}
    static constexpr ExecutionCost Media(){return {0,7,7,0,1,0};}
    static constexpr ExecutionCost Teardown(){return {0,16,16,0,0,16};}
    static constexpr ExecutionCost Full(){return {86,192,224,32,4,16};}
};
} // namespace local_session::trusted_read
