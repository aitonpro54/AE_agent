#include "AEConfig.h"
resource 'PiPL' (16000) {
    {
        Kind { AEGP },
        Name { "AE Agent Disposable Snapshot Probe" },
        Category { "General Plugin" },
        Version { 196608 },
#if defined(AE_OS_WIN) && defined(AE_PROC_INTELx64)
        CodeWin64X86 { "EntryPointFunc" },
#else
    #error This disposable probe supports Windows x64 only
#endif
    }
};
