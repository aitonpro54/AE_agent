#pragma once
#include <node_api.h>
#include "local_session_http_transport.h"
namespace local_session::trusted_read {
class HttpTransportBinding final {
public:
    // Internal addon composition. No input JS factory supplies an owner.
    static napi_value Role(napi_env env,std::shared_ptr<HttpTransportOwner> original);
    static std::shared_ptr<HttpTransportOwner> Owner(napi_env env,napi_value role);
    static std::shared_ptr<AcceptedConnection> Connection(napi_env env,napi_value role,napi_value cap);
    static void AssertRequestStream(napi_env env,napi_value role,napi_value cap,napi_value request);
    // C++ composition only; not a JavaScript export.
    static std::shared_ptr<FixedHttpListener> Listen(HttpTransportOwner& owner);
};
}
