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
    return result.ok?0:2;
}
