// Included inside the original production broker. These rows are inaccessible
// to JSON/HTTP and never issue media reservations or touch foreign AME items.
struct SharedQueueRow final {
    Id ref{},start{},poll{},nonce{};Digest hash{},binding{},startReceipt{},pollBinding{};
    std::array<Digest,2> selectors{},wrappers{},terminals{};
    std::uint64_t deadline=0,nextOrdinal=1,activeOrdinal=0,nextPollAt=0,pollExpiry=0;
    std::uint16_t terminalMask=0,successMask=0;bool pending=false,unknown=false,ioSettled=false;
    struct Poll final {std::array<std::unique_ptr<NativeDispatchCommit>,2> commits{};std::array<NativeDispatchCommit::Observation,2> notes{};};
    std::vector<std::unique_ptr<Poll>> polls;
    std::array<std::unique_ptr<NativeDispatchCommit>,2> terminalCommits{};
    std::array<NativeDispatchCommit::Observation,2> terminalNotes{};
};
std::unique_ptr<SharedQueueRow> sharedQueue;
Id sharedQueueStart{};std::uint16_t sharedEnqueueMask=0,sharedOwnReadbackMask=0;
bool SharedQueueQuiescent()const noexcept{return !sharedEnqueueMask||(sharedQueue&&!sharedQueue->unknown&&!sharedQueue->pending&&sharedQueue->ioSettled&&sharedQueue->terminalMask==sharedEnqueueMask);}
Digest SharedQueuePollBinding(const SharedQueueRow& q,const Digest& input)const{Bytes b;Put(b,session);Put(b,generation);Put(b,bootNonce);Put(b,q.ref);Put(b,q.hash);Put(b,q.poll);Put(b,q.nonce);Put(b,input);detail::PutU64(b,q.activeOrdinal);detail::PutU64(b,q.pollExpiry);return TrustedHash("lcp2.production.shared-queue-poll.v1",b);}
Digest SharedQueueObservationJoin(const SharedQueueRow& q,const Digest& receipt,std::uint16_t terminal,std::uint16_t success)const{Bytes b;Put(b,session);Put(b,generation);Put(b,bootNonce);Put(b,q.ref);Put(b,q.hash);Put(b,q.poll);Put(b,q.pollBinding);Put(b,receipt);detail::PutU16(b,terminal);detail::PutU16(b,success);return TrustedHash("lcp2.production.shared-queue-factual-observation.v1",b);}
void SharedQueueStatus(const phase::Frame& request){
    if(!trusted_read::EmbeddedProfile().execution.SharedQueue()||!ControllerCurrent())Refuse("trusted_shared_status_original_controller_required");
    auto reply=Reply(request,true,phase::Status::Ok);Bytes bytes;detail::PutU16(bytes,1);detail::PutU16(bytes,sharedQueue?sharedQueue->terminalMask:0);detail::PutU16(bytes,sharedQueue?sharedQueue->successMask:0);
    const bool unknown=sharedQueue&&(sharedQueue->unknown||(sharedQueue->pending&&GetTickCount64()>=sharedQueue->pollExpiry)||(!sharedQueue->pending&&sharedQueue->terminalMask!=3&&sharedQueue->nextOrdinal>trusted_read::kSharedQueueMaximumPolls));
    detail::PutU16(bytes,!sharedQueue?0:unknown?3:sharedQueue->terminalMask==3&&!sharedQueue->pending&&sharedQueue->ioSettled?2:1);Put(bytes,sharedQueue?sharedQueue->ref:Id{});Put(bytes,sharedQueue?sharedQueue->binding:Digest{});
    for(std::size_t i=0;i<2;++i)Put(bytes,sharedQueue?sharedQueue->terminals[i]:Digest{});TrustedPayload(reply,bytes);Send(reply,true,true);
}
bool HandleSharedQueueFrame(const phase::Frame& request){
    const auto verb=request.header.verb;if(verb!=phase::Verb::BindSharedQueue&&verb!=phase::Verb::BeginSharedQueuePoll&&verb!=phase::Verb::ObserveSharedQueuePoll&&verb!=phase::Verb::AcknowledgeSharedQueueIo)return false;
    const auto& policy=trusted_read::EmbeddedProfile().execution;if(!policy.SharedQueue()||!WorkerCurrent()||!OriginalFloor(false)||effects.unknown)Refuse("trusted_shared_native_profile_required");
    const auto now=GetTickCount64();
    if(verb==phase::Verb::BindSharedQueue){
        auto& start=Ticket(TrustedField<16>(request,0));if(sharedQueue||sharedEnqueueMask!=3||sharedOwnReadbackMask!=3||sharedQueueStart!=start.ref||start.variantSlot!=2||start.effectOperation!=7||!start.executionDelivery||start.stage!=Project::Stage::Terminal||start.result!=TrustedField<32>(request,176)||detail::Zero(start.result)||now>=start.expiry||!LedgerIdle())Refuse("trusted_shared_original_START_pair_required");
        for(const auto& debt:restoreDebts)if(!debt||debt->state!=RestoreDebt::State::Restored||debt->actor!=actor)Refuse("trusted_shared_restore_before_observation_required");
        auto q=std::make_unique<SharedQueueRow>();q->ref=detail::RandomId();q->start=start.ref;q->binding=TrustedField<32>(request,16);q->startReceipt=start.result;q->deadline=now+(std::min)(policy.jobDeadlineMs,sessionDeadline-now);
        Bytes grant;Put(grant,session);Put(grant,generation);Put(grant,bootNonce);Put(grant,q->ref);Put(grant,q->start);Put(grant,q->binding);Put(grant,q->startReceipt);
        for(std::size_t i=0;i<2;++i){q->selectors[i]=TrustedField<32>(request,48+32*i);q->wrappers[i]=TrustedField<32>(request,112+32*i);Put(grant,q->selectors[i]);Put(grant,q->wrappers[i]);}
        detail::PutU64(grant,q->deadline);q->hash=TrustedHash("lcp2.production.shared-queue-observation-grant.v1",grant);auto reply=Reply(request,false,phase::Status::Ok);Bytes b;Put(b,q->ref);Put(b,q->hash);detail::PutU64(b,q->deadline);detail::PutU32(b,trusted_read::kSharedQueueMaximumPolls);sharedQueue=std::move(q);TrustedPayload(reply,b);Send(reply,false,true);return true;
    }
    if(!sharedQueue||sharedQueue->ref!=TrustedField<16>(request,0)||sharedQueue->unknown||now>=sharedQueue->deadline)Refuse("trusted_shared_original_observer_required",0,true);auto& q=*sharedQueue;
    if(verb==phase::Verb::AcknowledgeSharedQueueIo){if(q.ioSettled||q.pending||q.terminalMask!=3||TrustedField<32>(request,16)!=q.binding||detail::Zero(TrustedField<32>(request,48))||!LedgerIdle())Refuse("trusted_shared_terminal_IO_ack_once",0,true);q.ioSettled=true;auto reply=Reply(request,false,phase::Status::Ok);TrustedPayload(reply,TrustedStatus(state,session));Send(reply,false,true);return true;}
    if(verb==phase::Verb::BeginSharedQueuePoll){
        if(q.pending||q.terminalMask==3||q.nextOrdinal>trusted_read::kSharedQueueMaximumPolls||TrustedNumber(request,16,8)!=q.nextOrdinal||now<q.nextPollAt||q.deadline-now<=10000||!LedgerIdle())Refuse("trusted_shared_poll_once_or_deadline",0,true);
        q.pending=true;q.activeOrdinal=q.nextOrdinal++;q.poll=detail::RandomId();q.nonce=detail::RandomId();q.pollExpiry=now+10000;q.pollBinding=SharedQueuePollBinding(q,TrustedField<32>(request,24));auto poll=std::make_unique<SharedQueueRow::Poll>();
        try{auto& start=Ticket(q.start);for(std::size_t i=0;i<2;++i){auto b=EffectBinding(start.command,start.execution,start.lease,q.hash,q.pollBinding,start.script,trusted_read::FixedSharedQueueObservationLeaf(policy,static_cast<std::uint16_t>(i)),2);b.variantSlot=2;b.target=q.binding;
                poll->commits[i]=std::unique_ptr<NativeDispatchCommit>(new NativeDispatchCommit(*store,cas,b,{this,CommitGuard,CommitFloor},effects));poll->notes[i]=poll->commits[i]->Commit(NativeDispatchCommit::ProofFault::None);if(!poll->notes[i].freshAppend||poll->notes[i].unknown)Refuse("trusted_shared_poll_precharge_unknown",0,true);}
            q.polls.push_back(std::move(poll));auto reply=Reply(request,false,phase::Status::Ok);Bytes b;Put(b,q.poll);Put(b,q.nonce);detail::PutU64(b,q.pollExpiry);Put(b,q.pollBinding);TrustedPayload(reply,b);Send(reply,false,true);return true;
        }catch(...){q.unknown=true;effects.unknown=true;throw;}
    }
    if(!q.pending||q.poll!=TrustedField<16>(request,16)||now>=q.pollExpiry||q.polls.empty())Refuse("trusted_shared_current_poll_required",0,true);
    const auto terminal=static_cast<std::uint16_t>(TrustedNumber(request,64,2)),success=static_cast<std::uint16_t>(TrustedNumber(request,66,2));const auto receipt=TrustedField<32>(request,32);
    if((terminal&q.terminalMask)!=q.terminalMask||(success&q.terminalMask)!=q.successMask||TrustedField<32>(request,68)!=SharedQueueObservationJoin(q,receipt,terminal,success))Refuse("trusted_shared_factual_terminal_join",0,true);
    try{auto& start=Ticket(q.start);const NativeDispatchCommit::Observation* last=&q.polls.back()->notes.back();
        for(std::size_t i=0;i<2;++i)if((terminal&(1u<<i))&&!(q.terminalMask&(1u<<i))){auto b=EffectBinding(start.command,start.execution,start.lease,q.hash,receipt,start.script,trusted_read::FixedSharedQueueObservationLeaf(policy,static_cast<std::uint16_t>(i+2)),17);b.variantSlot=static_cast<std::uint16_t>(i+1);b.target=q.wrappers[i];
            q.terminalCommits[i]=std::unique_ptr<NativeDispatchCommit>(new NativeDispatchCommit(*store,cas,b,{this,CommitGuard,CommitFloor},effects));q.terminalNotes[i]=q.terminalCommits[i]->Commit(NativeDispatchCommit::ProofFault::None);if(!q.terminalNotes[i].freshAppend||q.terminalNotes[i].unknown)Refuse("trusted_shared_terminal_note_unknown",0,true);
            Bytes own;Put(own,receipt);Put(own,q.wrappers[i]);detail::PutU16(own,static_cast<std::uint16_t>(i+1));q.terminals[i]=TrustedHash("lcp2.production.shared-own-native-terminal.v1",own);last=&q.terminalNotes[i];}
        q.terminalMask=terminal;q.successMask=success;q.pending=false;q.nextPollAt=now+trusted_read::kSharedQueuePollCadenceMs;auto reply=Reply(request,false,phase::Status::Ok);TrustedPayload(reply,EffectAck(q.poll,*last));Send(reply,false,true);return true;
    }catch(...){q.unknown=true;effects.unknown=true;throw;}
}
