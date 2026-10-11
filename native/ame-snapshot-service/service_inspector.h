#pragma once
#include "service_authorization.h"
#include "AEConfig.h"
#include "AE_GeneralPlug.h"
#include "SPBasic.h"

namespace ame_service {
// All suite acquisition and reads occur inside the guarded main-thread idle.
// No caller script, save, setter, render, capture or fixture interface exists.
// Revision uses one fixed compile-time read-only script, never caller input.
std::string InspectOnMainThread(SPBasicSuite*, AEGP_PluginID, unsigned long main_thread,
    const VerifiedInspectTicket&, const std::atomic<bool>* canceled = nullptr);
}
