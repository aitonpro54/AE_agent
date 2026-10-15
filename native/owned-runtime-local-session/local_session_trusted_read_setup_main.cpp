#if !defined(AE_AGENT_PHASE_TRUSTED_READ_SETUP) || AE_AGENT_PHASE_TRUSTED_READ_SETUP != 1 || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE)
#error "Separate accepted pre-prepare creator only."
#endif
#include "production_artifact_seal.h"
#include <windows.h>
#include <string>
int wmain(int argc,wchar_t** argv){
    if(argc!=2||std::wstring(argv[1])!=L"--prepare-and-seal-fixed")return 2;
    // Only binary original-stdio prepare/seal/final/ACK records are emitted.
    // No JSON enrollment, root selector, runtime factory or automatic launch.
    const auto result=local_session::production::PrepareAndSealFixedOverOriginalStdio();
    if(!result.ok){
        std::string code=result.code;
        if(code.empty()||code.size()>96||code.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789_")!=std::string::npos)code="production_setup_refused";
        const std::string diagnostic="production_setup_failure code="+code+" win32="+std::to_string(result.win32Error)+" unknown="+(result.unknown?"1":"0")+" unavailable="+(result.unavailable?"1":"0")+"\n";
        const HANDLE error=GetStdHandle(STD_ERROR_HANDLE);DWORD written=0;
        if(error&&error!=INVALID_HANDLE_VALUE)(void)WriteFile(error,diagnostic.data(),static_cast<DWORD>(diagnostic.size()),&written,nullptr);
    }
    return result.ok?0:2;
}
