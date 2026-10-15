#pragma once
#include "enrollment_win32.h"
#include "post_c1_successor_provision.h"
#include <optional>

namespace local_session::production {
enum class ArtifactRole : std::uint16_t { Addon=1,Broker=2,Provisioner=3,McpHost=4,NativeProbe=5,Reconnect=6 };
enum class DependencyKind : std::uint16_t { NodeController=1,NodeDaemon=2,SourceBase=256,PanelBase=1024 };
struct Selector final { std::uint16_t code=0;std::vector<std::wstring> components; };
struct Dependency final { std::uint16_t code=0;reviewed::File file; };
struct BuildInput final {std::uint16_t code=0;reviewed::File file;};
// Separate generated build input. Anchor pin is fixed before the final compile;
// no final binary SHA or seal content SHA is embedded here.
struct StaticDefinition {
    reviewed::Profile enrollment;
    ObjectPin setupNamespace;
    std::vector<std::wstring> setupComponents,anchorComponents;
    std::vector<ObjectPin> setupAncestors;
    Digest fixedProfileHash{},staticCodeHash{},transportProfileHash{};
    std::vector<Selector> artifacts;
    std::vector<Dependency> dependencies;
    // Exact, ordered, complete planned-role/TU build table. Selectors 1..6
    // are mandatory; 7 exists iff McpHost is compiled; remaining IDs >=16
    // are explicitly enumerated, never inferred from a numeric range.
    std::vector<BuildInput> buildInputs;
    reviewed::File automationCredential,panelCredential,buildInputManifest;
    std::optional<post_c1::Specification> closedPredecessor;
};
struct Definition final : StaticDefinition {ObjectPin anchor;Digest generatedBuildInputsHash{};std::optional<post_c1::Binding> closedPredecessorBinding;};
// Compiled only into the already accepted pre-prepare creator from selector3.
// It has no late anchor/D field and cannot provide runtime OpenFixed authority.
struct SetupDefinition final : StaticDefinition {};
const Definition& EmbeddedDefinition();
constexpr Digest DecodeGeneratedBuildInputsHash(const char (&hex)[65]) {
    Digest value{};if(hex[64]!='\0')throw "generated hash width";
    for(std::size_t i=0;i<32;++i){unsigned byte=0;for(std::size_t j=0;j<2;++j){const char c=hex[i*2+j];
        const unsigned n=c>='0'&&c<='9'?static_cast<unsigned>(c-'0'):c>='a'&&c<='f'?static_cast<unsigned>(c-'a'+10):16u;
        if(n>15)throw "generated hash lowercase hex";byte=(byte<<4)|n;}value[i]=static_cast<unsigned char>(byte);}return value;
}
struct Artifact final {std::uint16_t role=0;reviewed::File file;};
class OriginalSealWitness final {
public:
    ~OriginalSealWitness();
    OriginalSealWitness(const OriginalSealWitness&)=delete;
    OriginalSealWitness& operator=(const OriginalSealWitness&)=delete;
    static std::shared_ptr<OriginalSealWitness> OpenFixed(Result& result);
    bool Fresh()const noexcept;
    const reviewed::Profile& ResolvedEnrollment()const noexcept;
    const reviewed::File& ArtifactFile(ArtifactRole role)const;
    const Digest& RecordHash()const noexcept;
private:
    struct Data;explicit OriginalSealWitness(std::unique_ptr<Data> data);
    std::unique_ptr<Data> data_;
    friend class SetupCreator;
};
// Closed setup sequence. Original anchor creation HANDLE survives prepare,
// final build and seal. No path/hash/role selectors are input to this entry.
Result PrepareAndSealFixedOverOriginalStdio();
} // namespace local_session::production
