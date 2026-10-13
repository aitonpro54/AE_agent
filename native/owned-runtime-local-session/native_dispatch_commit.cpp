#include "native_dispatch_commit.h"
#include <algorithm>
#include <limits>

namespace local_session {
namespace {
using Bytes=std::vector<unsigned char>;
template<class A> void Put(Bytes& bytes,const A& value){bytes.insert(bytes.end(),value.begin(),value.end());}
void Domain(Bytes& bytes,const char* value){for(const char* at=value;*at;++at)bytes.push_back(static_cast<unsigned char>(*at));}
bool SameCas(const initial_durability::Cas& a,const initial_durability::Cas& b){return a.sequence==b.sequence&&a.epoch==b.epoch&&a.head==b.head;}
}
NativeDispatchCommit::NativeDispatchCommit(initial_durability::Store& store,initial_durability::Cas& cas,
    const Binding& binding,const Port& port):store_(store),cas_(cas),binding_(binding),port_(port){}
bool NativeDispatchCommit::Guard()const noexcept{return port_.originalBroker&&port_.guard&&port_.floor&&port_.guard(port_.originalBroker);}
Bytes NativeDispatchCommit::Descriptor()const{
    Bytes bytes;Domain(bytes,"native-dispatch-descriptor.v2");
    Put(bytes,binding_.scope);Put(bytes,binding_.broker);Put(bytes,binding_.installation);Put(bytes,binding_.lineage);
    Put(bytes,binding_.session);Put(bytes,binding_.generation);Put(bytes,binding_.boot);Put(bytes,binding_.runtime);
    Put(bytes,binding_.actor);Put(bytes,binding_.authorization);Put(bytes,binding_.body);
    detail::PutU64(bytes,binding_.nativeOrdinal);detail::PutU16(bytes,binding_.variantSlot);detail::PutU16(bytes,binding_.operation);
    Put(bytes,binding_.allowedLeaf);Put(bytes,binding_.command);Put(bytes,binding_.execution);Put(bytes,binding_.lease);
    Put(bytes,binding_.finalScript);Put(bytes,binding_.target);Put(bytes,binding_.owner);return bytes;
}
Digest NativeDispatchCommit::StableKey()const{
    Bytes bytes;Domain(bytes,"native-dispatch-stable-effect.v2");Put(bytes,binding_.scope);
    Put(bytes,binding_.installation);Put(bytes,binding_.lineage);detail::PutU16(bytes,binding_.variantSlot);
    Put(bytes,binding_.allowedLeaf);detail::PutU16(bytes,binding_.operation);return detail::Hash(bytes);
}
void NativeDispatchCommit::CloseUnknown(const char* code)noexcept{
    observation_.unknown=true;observation_.code=code;
    observation_.sequence=cas_.sequence;observation_.epoch=cas_.epoch;observation_.head=cas_.head;
}
NativeDispatchCommit::Observation NativeDispatchCommit::Commit(ProofFault fault){
    if(entered_||selected_||observation_.latched||observation_.unknown){CloseUnknown("private_commit_no_replay");return observation_;}
    entered_=true;
    try{
        // The first exercise has one fixed synthetic leaf. These nonzero labels
        // are commitments to fixture data, not actor/READ/execution grants.
        if(detail::Zero(binding_.scope)||detail::Zero(binding_.broker)||detail::Zero(binding_.installation)||
            detail::Zero(binding_.lineage)||detail::Zero(binding_.session)||detail::Zero(binding_.generation)||
            detail::Zero(binding_.boot)||detail::Zero(binding_.runtime)||detail::Zero(binding_.actor)||
            detail::Zero(binding_.authorization)||detail::Zero(binding_.body)||detail::Zero(binding_.finalScript)||
            detail::Zero(binding_.target)||detail::Zero(binding_.owner)||detail::Zero(binding_.fence)||
            detail::Zero(binding_.allowedLeaf)||detail::Zero(binding_.command)||detail::Zero(binding_.execution)||
            detail::Zero(binding_.lease)||binding_.nativeOrdinal!=externalCommits_+1||!binding_.operation||
            externalCommits_>=kExternalCap||cas_.sequence>kTotalSlots-kFinalReserve-1||
            kFixedRemainingLifecycle>kTotalSlots-(cas_.sequence+1)||!Guard()){
            CloseUnknown("private_commit_preflight_closed");entered_=false;return observation_;
        }
        observation_.priorFloorVerified=true;stableKey_=StableKey();if(detail::Zero(stableKey_)){CloseUnknown("private_commit_stable_key_invalid");entered_=false;return observation_;}
        for(const auto& key:latchedKeys_)if(key==stableKey_){CloseUnknown("private_commit_stable_key_spent");entered_=false;return observation_;}
        note_.type=initial_durability::RecordType::Note;note_.sourceDigest=detail::Hash(Descriptor());
        Bytes config;Domain(config,"native-dispatch-consumed.v2");Put(config,note_.sourceDigest);
        Put(config,binding_.fence);Put(config,stableKey_);note_.configDigest=detail::Hash(config);
        observation_.descriptorHash=note_.sourceDigest;observation_.configDigest=note_.configDigest;
        // Irreversible latch precedes AppendOnce; every failure retains this row.
        selected_=true;latchedKeys_[static_cast<std::size_t>(externalCommits_)]=stableKey_;
        ++externalCommits_;observation_.latched=true;
        if(fault==ProofFault::BeforeAppendGuardClosed){observation_.syntheticFault=true;CloseUnknown("synthetic_guard_closed_before_append");entered_=false;return observation_;}
        if(!Guard()){CloseUnknown("private_commit_late_guard_closed");entered_=false;return observation_;}
        const auto before=cas_;const auto stored=store_.AppendOnce(before,note_);cas_=stored.current;
        observation_.recordHash=stored.recordHash;
        observation_.sequence=cas_.sequence;observation_.epoch=cas_.epoch;observation_.head=cas_.head;
        if(!stored.ok||stored.unknown||stored.unavailable||stored.code!="appended"||
            stored.persistence!="os_flush_ack_and_readback"||stored.consumptionRecorded||
            before.sequence==std::numeric_limits<std::uint64_t>::max()||cas_.sequence!=before.sequence+1||
            cas_.epoch!=before.epoch||detail::Zero(stored.recordHash)||cas_.head!=stored.recordHash||
            !Guard()||!port_.floor(port_.originalBroker,cas_,stored.recordHash)){
            CloseUnknown("private_note_append_unknown");entered_=false;return observation_;
        }
        observation_.freshAppend=true;observation_.appendAckVerified=true;observation_.code="appended";
        if(fault==ProofFault::PrivateReplyLost){observation_.syntheticFault=true;CloseUnknown("synthetic_private_commit_reply_lost");}
        entered_=false;return observation_;
    }catch(...){CloseUnknown("private_note_exception_unknown");entered_=false;return observation_;}
}
NativeDispatchCommit::Observation NativeDispatchCommit::ObserveDuplicate(){
    if(entered_||duplicateObserved_||!selected_||!observation_.freshAppend||observation_.unknown||!Guard()){
        CloseUnknown("private_duplicate_observation_closed");return observation_;
    }
    duplicateObserved_=true;entered_=true;
    try{
        const auto before=cas_;const auto stored=store_.AppendOnce(before,note_);cas_=stored.current;
        if(!stored.ok||stored.unknown||stored.unavailable||stored.code!="duplicate_readback"||
            stored.persistence!="readback_only"||stored.consumptionRecorded||!SameCas(before,cas_)||
            stored.recordHash!=observation_.recordHash||!Guard()||
            !port_.floor(port_.originalBroker,cas_,stored.recordHash))CloseUnknown("private_duplicate_readback_unknown");
        else{observation_.duplicateReadback=true;observation_.code="duplicate_readback";}
    }catch(...){CloseUnknown("private_duplicate_exception_unknown");}
    entered_=false;return observation_;
}
} // namespace local_session
