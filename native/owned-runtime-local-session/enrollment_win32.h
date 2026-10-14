#pragma once
#include <array>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace initial_fence { class Factory; class InternalFencedIo; }
namespace initial_durability { class Store; }
namespace local_session {
namespace trusted_read { class NativeClient; }
namespace production { class OriginalSealWitness;class SetupCreator; }
using Id = std::array<unsigned char,16>;
using Digest = std::array<unsigned char,32>;
struct Result {
    bool ok=false, unknown=false, unavailable=false;
    std::string code="closed";
    std::uint32_t win32Error=0;
};
struct ObjectPin {
    Id volumeGuid{}, fileId{};
    std::uint64_t serial=0;
    std::wstring canonicalPath;
};
namespace reviewed {
// Fixed classification of the combined source policy. No bit issues a command,
// manual declaration, settings cap, completion watcher or mutable operation.
constexpr std::uint16_t kReadCapabilities=0x001f,kCombinedExecutionCapabilities=0x07ff;
// This shape is a build contract, not an input API. The sole profile comes from
// local_session_installation_pins.h, generated/reviewed by the fixed entry owner.
struct File { std::vector<std::wstring> components; ObjectPin pin; Digest sha256{}; };
struct Inventory { std::vector<std::wstring> components; bool absent=false; ObjectPin pin; };
struct Profile {
    std::wstring canonicalVolumeAnchor;
    std::vector<std::wstring> repositoryComponents, runtimeComponents;
    std::vector<ObjectPin> repositoryAncestors, runtimeAncestors;
    ObjectPin repository, runtime;
    std::wstring userSid;
    Id installation{}, lineage{}, launchTarget{}, stopTarget{}, actorTarget{};
    Digest authorizationAudit{}, policyHash{}, sourceSetHash{};
    std::uint64_t policyEpoch=0, maximumSessionMs=0, maximumLeaseMs=0;
    // Ordinary profiles retain the exact READ mask. The separately sealed
    // combined profile additionally classifies prep/execute/completion/media/
    // settings/restoration; every actual right still comes from private rows.
    std::uint16_t capabilities=0;
    bool enabled=false;
    std::vector<File> sourceFiles;
    File node, controllerImage;
    std::vector<Inventory> inventories;
    // Pins below are required for broker open. Fixed provisioning never supplies
    // replacement identities. A later reviewed build records original creation IDs.
    ObjectPin installationFile, policyFile, lockFile, journal;
};
const Profile& EmbeddedProfile();
}

class Broker;
class ContinuityPort;
class OriginalDaemon;
class InstalledEnrollment final {
public:
    ~InstalledEnrollment();
    InstalledEnrollment(const InstalledEnrollment&)=delete;
    InstalledEnrollment& operator=(const InstalledEnrollment&)=delete;
private:
    struct Data;
    explicit InstalledEnrollment(std::unique_ptr<Data> data);
    static std::unique_ptr<InstalledEnrollment> OpenFixed(Result& result);
    static std::unique_ptr<InstalledEnrollment> OpenProductionFixed(
        const std::shared_ptr<production::OriginalSealWitness>& original,Result& result);
    static Result ProvisionFixedCreator();
    Result Fresh(bool lockHeld) const;
    const reviewed::Profile& Profile() const;
    void* BorrowedRuntime() const;
    void* BorrowedJournal() const;
    // Exact launched script, selected only from the mandatory original held pin.
    const std::wstring& CheckedBridgeEntry() const;
    // Compatibility strings are derived only from the three original witnesses.
    // Retained no-follow aliases do not replace canonical profile authority.
    struct LaunchLocators { std::wstring node,bridge,repository; };
    const LaunchLocators& PrepareFixedLaunchLocators();
    void CheckFixedLaunchLocators() const;
    std::wstring CheckedOriginalLaunchImage(void* originalProcess) const;
    // Copied strings/digests are diagnostics. Only this original live object can
    // be passed to installed fence/store factories; JSON cannot reconstruct it.
    Digest Scope() const;
    Digest LaunchKey() const;
    std::unique_ptr<Data> data_;
    friend class Broker;
    friend class ContinuityPort;
    friend class OriginalDaemon;
    friend class initial_fence::Factory;
    friend class initial_durability::Store;
    friend Result ProvisionFixedEnrollmentOverOriginalStdio();
    friend class trusted_read::NativeClient;
    friend class production::SetupCreator;
};
// Closed --enroll-fixed creator entry: no input selectors or serialized authority.
// A bounded binary observation is emitted while all FILE_CREATE handles remain
// held. One nonce/birth/frame-hash ACK on original stdin permits their closure.
Result ProvisionFixedEnrollmentOverOriginalStdio();

namespace detail {
class Held final {
public:
    Held()=default; explicit Held(void* handle);
    ~Held(); Held(Held&& other) noexcept; Held& operator=(Held&& other) noexcept;
    Held(const Held&)=delete; Held& operator=(const Held&)=delete;
    void* Get() const noexcept; void* Take() noexcept; bool Valid() const noexcept;
private: void* handle_=nullptr;
};
struct Failure { std::string code; std::uint32_t error=0; bool unknown=false, unavailable=false; };
[[noreturn]] void Refuse(const char* code,std::uint32_t error=0,bool unknown=false,bool unavailable=false);
Digest Hash(const std::vector<unsigned char>& bytes);
Id RandomId();
bool Zero(const Id& value); bool Zero(const Digest& value);
bool SamePin(const ObjectPin& a,const ObjectPin& b);
ObjectPin ReadPin(void* handle,bool directory,std::uint64_t* length=nullptr);
Held Relative(void* parent,const std::wstring& component,bool directory,bool create=false,bool write=false,bool exclusive=false,bool stableRead=false);
std::vector<unsigned char> ReadExact(void* handle,std::size_t limit);
std::wstring ProcessSid(void* process);
std::wstring ProcessImage(void* process);
std::uint64_t ProcessBirth(void* process);
bool ProcessLive(void* process);
std::string Hex(const Id& value); std::string Hex(const Digest& value);
void PutU16(std::vector<unsigned char>& bytes,std::uint16_t value);
void PutU32(std::vector<unsigned char>& bytes,std::uint32_t value);
void PutU64(std::vector<unsigned char>& bytes,std::uint64_t value);
void PutPin(std::vector<unsigned char>& bytes,const ObjectPin& pin);
// Shared byte encoders/inventory checks. No enrollment or authority is created
// from their returned bytes; production setup reuses the ordinary exact format.
std::vector<unsigned char> ProductionPolicyBytes(const reviewed::Profile& profile);
std::vector<unsigned char> ProductionInstallationBytes(const reviewed::Profile& profile,const ObjectPin& lock,const ObjectPin& journal);
void AssertEmptyDirectory(void* originalDirectory);
void AssertRuntimeInventory(void* originalRuntime);
}
} // namespace local_session
