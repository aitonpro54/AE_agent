// Actual production FixedExecutionScope encoding, isolated from all factories.
// Hash deliberately throws its preimage: this proof creates no hash/grant.
#if !defined(AE_AGENT_PHASE_SYNTHETIC_SCOPE_PROOF) || defined(AE_AGENT_PHASE_TRUSTED_READ_PROFILE) || defined(AE_AGENT_PRODUCTION_SOURCE_HEADERS)
#error This scope proof cannot enable an installed/trusted production role.
#endif
#include "trusted_execution.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include "scope_pin_codec_fixtures.h"
namespace local_session::detail {
struct EncodedScope final {std::vector<unsigned char> bytes;};
[[noreturn]] void Refuse(const char* code,std::uint32_t error,bool unknown,bool unavailable){throw Failure{code,error,unknown,unavailable};}
bool Zero(const Id& value){return std::all_of(value.begin(),value.end(),[](unsigned char b){return b==0;});}
bool Zero(const Digest& value){return std::all_of(value.begin(),value.end(),[](unsigned char b){return b==0;});}
Digest Hash(const std::vector<unsigned char>& bytes){throw EncodedScope{bytes};}
}
namespace {
using namespace local_session;using namespace local_session::trusted_read;
std::size_t checks=0,failed=0;
void Check(bool ok,const char* label){++checks;if(!ok){++failed;std::cerr<<"FAIL scope pin encoding: "<<label<<'\n';}}
std::vector<unsigned char> Encode(const ExecutionPolicy& policy){try{(void)FixedExecutionScope(policy,0,ExecutionLeaf::OwnedCheckpoint);}catch(const detail::EncodedScope& encoded){return encoded.bytes;}catch(const detail::Failure&){return {};}return {};}
ExecutionPolicy Policy(){ExecutionPolicy policy;policy.policyHash[0]=1;policy.typedProducerHash[0]=2;policy.checkpointLeaf[0]=3;policy.checkpointName=L"titr_all-source-checkpoint.aep";
    policy.snapshotRoot.canonicalPath=L"\\\\?\\Volume{11111111-2222-3333-4444-555555555555}\\snapshot";policy.snapshotRoot.volumeGuid[0]=1;policy.snapshotRoot.serial=7;policy.snapshotRoot.fileId[0]=8;return policy;}
}
int main(){try{const auto base=Policy();const auto bytes=Encode(base);Check(!bytes.empty(),"valid fixed checkpoint reaches actual production encoding");
    auto changed=base;changed.snapshotRoot.serial=8;Check(Encode(changed)!=bytes,"serial change alters commitment with name/path/FileId unchanged");
    changed=base;changed.snapshotRoot.volumeGuid[0]=2;Check(Encode(changed)!=bytes,"volume GUID change alters commitment with serial/path/FileId unchanged");
    changed=base;changed.snapshotRoot.fileId[0]=9;Check(Encode(changed)!=bytes,"FileId change alters commitment");
    changed=base;changed.snapshotRoot.canonicalPath+=L"-other";Check(Encode(changed)!=bytes,"canonical root change alters commitment");
    changed=base;changed.checkpointName=L"runtime-uuid-checkpoint.aep";Check(Encode(changed).empty(),"unreviewed checkpoint name is CLOSED");
    changed=base;changed.checkpointName.clear();Check(Encode(changed).empty(),"absent checkpoint operand is CLOSED");
    changed=base;changed.snapshotRoot.canonicalPath.clear();Check(Encode(changed).empty(),"absent canonical root is CLOSED");
    changed=base;changed.snapshotRoot.canonicalPath=std::wstring(32761,L'x');Check(Encode(changed).empty(),"oversized root cannot truncate its length prefix");
    changed=base;changed.snapshotRoot.fileId={};Check(Encode(changed).empty(),"absent FileId is CLOSED");
    std::vector<unsigned char> pin;detail::PutPin(pin,base.snapshotRoot);Check(pin.size()==40,"actual retained production pin codec emits exactly forty bytes");
    Check(std::search(bytes.begin(),bytes.end(),pin.begin(),pin.end())!=bytes.end(),"scope contains exact full Pin40");
    std::vector<unsigned char> word;detail::PutU32(word,0xdeadbeefU);Check(word==std::vector<unsigned char>{0xef,0xbe,0xad,0xde},"actual D46 U32 codec emits four little-endian bytes");
    changed=base;changed.rangeMode=TitleRangeMode::FullObservedRootRangeV1;Check(Encode(changed)!=bytes,"range mode changes fixed scope with policy hash held");
    changed=base;changed.sampleMode=AlphaSampleMode::QuartileFramesV1;Check(Encode(changed)!=bytes,"sample algorithm changes fixed scope with policy hash held");
    std::cout<<"{\"schema\":\"ae-agent.execution-scope-pin-proof.v1\",\"checks\":"<<checks<<",\"failed\":"<<failed<<",\"ok\":"<<(failed?"false":"true")<<",\"actualProductionScopeEncoding\":true,\"actualSha256\":false,\"authority\":false,\"effects\":0}\n";return failed?1:0;
}catch(...){std::cerr<<"isolated scope encoding proof failed closed\n";return 2;}}
