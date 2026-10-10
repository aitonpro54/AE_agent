#pragma once
#include <atomic>
#include <exception>
#include <type_traits>

namespace probe {
// Adobe calls can pump another idle callback before the owning callback returns.
// Keep the gate held across work AND refusal publication; a nested callback must
// not inspect the project, consume a grant, or turn the first error into replay.
class IdleDispatchGate {
    std::atomic_flag in_flight_ = ATOMIC_FLAG_INIT;
public:
    template<typename Work, typename Refuse>
    bool Run(Work&& work, Refuse&& refuse) noexcept {
        static_assert(std::is_nothrow_invocable_v<Refuse, const char*>, "idle refusal callback must be noexcept");
        if (in_flight_.test_and_set(std::memory_order_acquire)) return false;
        struct Release {
            std::atomic_flag& flag;
            ~Release() { flag.clear(std::memory_order_release); }
        } release{in_flight_};
        try { work(); }
        catch (const std::exception& e) { refuse(e.what()); }
        catch (...) { refuse("unknown_native_exception"); }
        return true;
    }
};
} // namespace probe
