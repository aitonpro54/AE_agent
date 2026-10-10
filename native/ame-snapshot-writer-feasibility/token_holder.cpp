// Own AppContainer child: no file/registry/network/UI writes or caller commands.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
int wmain(int argc, wchar_t**) {
    if (argc != 1) return ERROR_INVALID_PARAMETER;
    Sleep(30000); // Parent owns the returned process handle and normally ends earlier.
    return 0;
}
