#pragma once
#include "enrollment_win32.h"
#include <array>
#include <memory>

namespace local_session::production { class SetupCreator; }
namespace local_session::post_c1 {
constexpr std::uint16_t kExplicitLocalOperator=1;
constexpr std::size_t kIntentBytes=584,kBindingBytes=136;
inline constexpr wchar_t kIntentName[]=L".initial-owned-successor.intent";
struct ClosedFile final {reviewed::File file;std::uint64_t bytes=0;};
// A compiled explicit local-operator specification, never a human/chat witness.
// Old source/build commitments are historical bytes, not current source claims.
struct Specification final {
    Id installation{},lineage{};Digest scopeHash{},specificationHash{};
    ObjectPin repository,runtime,lock,journal;
    ClosedFile seal,installationFile,policyFile;std::array<ClosedFile,2> records;
    std::wstring userSid;Digest operatorAuthorization{};
    std::uint16_t operatorKind=kExplicitLocalOperator;
};
struct Binding final {Digest specificationHash{},key{};ObjectPin intent;Digest intentSha256{};};
std::vector<unsigned char> SpecificationBytes(const Specification& specification);
Digest SpecificationHash(const Specification& specification);
Digest StableIntentKey(const Specification& specification);
std::vector<unsigned char> BindingBytes(const Binding& binding);
// Read-only historical binding. This type cannot create an intent or issue the
// creator's in-memory grant, and does not attest old floor/pending/exit state.
class BindingWitness final {
public:
    ~BindingWitness();BindingWitness(const BindingWitness&)=delete;BindingWitness& operator=(const BindingWitness&)=delete;
    static std::unique_ptr<BindingWitness> Open(const Specification&,const Binding&,const reviewed::Profile& successor,
        const ObjectPin& setup,const Digest& fixedProfile,const Digest& staticCode,const reviewed::File& creatorArtifact);
    bool Fresh()const noexcept;
private:
    struct Data;explicit BindingWitness(std::unique_ptr<Data>);std::unique_ptr<Data> data_;
};
class CreatorGrant final {
public:
    ~CreatorGrant();CreatorGrant(const CreatorGrant&)=delete;CreatorGrant& operator=(const CreatorGrant&)=delete;
private:
    struct Data;explicit CreatorGrant(std::unique_ptr<Data>);std::unique_ptr<Data> data_;
    static std::unique_ptr<CreatorGrant> Consume(const Specification&,const reviewed::Profile& successor,
        const ObjectPin& setup,const Digest& fixedProfile,const Digest& staticCode,void* originalImage,
        std::uint64_t originalBirth,const Id& originalNonce,bool& durableEffect);
    const Binding& ActualBinding()const;
    void AssertFresh()const;
    friend class local_session::production::SetupCreator;
};
} // namespace local_session::post_c1
