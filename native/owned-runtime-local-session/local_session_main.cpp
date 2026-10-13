#include "local_session_win32.h"
#include <windows.h>
#include <string>

int wmain(int argc,wchar_t** argv){
    // Closed named entry points only. Runtime root/PID/policy/exe/record selectors
    // are absent. Enrollment never performs launch; initialize/status never ensure.
    if(argc==2&&std::wstring(argv[1])==L"--broker")return local_session::Broker::RunFixed();
    if(argc==2&&std::wstring(argv[1])==L"--enroll-fixed"){
        // The creator first emits its fixed binary observation and consumes one
        // original-stdin ACK while creation handles are held. This terminal JSON
        // is diagnostic only and follows closure of those original handles.
        const auto result=local_session::ProvisionFixedEnrollmentOverOriginalStdio();
        const std::string text=local_session::ResultJson(result)+"\n";
        DWORD written=0;
        if(!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),text.data(),static_cast<DWORD>(text.size()),&written,nullptr)||written!=text.size())return 3;
        return result.ok?0:2;
    }
    return 2;
}
