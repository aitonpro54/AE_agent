#include "service_crypto.h"
#include <iostream>
#include <string>
int wmain(int argc, wchar_t** argv) {
    try {
        ame_service::Require(argc == 2 && std::wstring(argv[1]) == L"--provision", "explicit_provision_command_required");
        const auto pin = ame_service::ProvisionIssuer();
        std::cout << "{\"schema\":\"ae-agent.snapshot-service.issuer-pin.v2\",\"keyId\":" << ame_service::Json(pin.key_id)
            << ",\"publicBlobHex\":" << ame_service::Json(pin.public_blob_hex) << ",\"privateKeyExported\":false,\"noAutomaticRegeneration\":true}\n";
        return 0;
    } catch (const std::exception& error) { std::cout << "{\"status\":\"refused\",\"reason\":" << ame_service::Json(error.what()) << "}\n"; return 1; }
}
