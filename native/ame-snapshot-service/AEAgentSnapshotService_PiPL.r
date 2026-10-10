#include "AEConfig.h"
resource 'PiPL' (16000) {
    {
        Kind { AEGP },
        Name { "AE Agent Dormant Snapshot Service" },
        Category { "General Plugin" },
        Version { 65536 },
#if defined(AE_OS_WIN) && defined(AE_PROC_INTELx64)
        CodeWin64X86 { "EntryPointFunc" },
#else
    #error Snapshot service foundation supports Windows x64 only
#endif
    }
};
