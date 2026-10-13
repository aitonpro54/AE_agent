#include "store_win32.h"
#include "durability_expected_pins.h"
#include <windows.h>
#include <algorithm>
#include <exception>
#include <string>

namespace {
bool Line(std::string& line){line.clear();for(;;){char ch=0;DWORD n=0;if(!ReadFile(GetStdHandle(STD_INPUT_HANDLE),&ch,1,&n,nullptr)||n!=1)return false;if(ch=='\n')return !line.empty();if(ch<32||ch>126||line.size()>=256)return false;line+=ch;}}
bool Reply(const std::string& operation,const initial_durability::Result& result){const std::string line="R "+initial_durability::JsonResult(operation,result)+"\n";DWORD n=0;return WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),line.data(),static_cast<DWORD>(line.size()),&n,nullptr)&&n==line.size();}
bool Ascii(const wchar_t* value,std::string& output){for(;*value;++value){if(*value<33||*value>126||output.size()>=128)return false;output+=static_cast<char>(*value);}return !output.empty();}
initial_durability::Id Target(const char* value){initial_durability::Id id{};const std::string text(value);if(text.size()!=32)throw std::exception();for(std::size_t i=0;i<32;++i){const char c=text[i];if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))throw std::exception();id[i/2]=static_cast<unsigned char>((id[i/2]<<4)|(c<='9'?c-'0':c-'a'+10));}return id;}
}
int wmain(int argc,wchar_t** argv){SetErrorMode(SEM_FAILCRITICALERRORS|SEM_NOGPFAULTERRORBOX|SEM_NOOPENFILEERRORBOX);
    try {std::string instance;initial_durability::Result result;
        if(argc!=3||std::wstring(argv[1])!=L"--approved-instance"||!Ascii(argv[2],instance)){result.code="invalid_argv";Reply("startup",result);return 2;}
        const durability_pins::Slot* slot=nullptr;for(const auto& s:durability_pins::kSlots)if(instance==s.instanceId)slot=&s;
        if(!slot){result.code="unapproved_instance";Reply("startup",result);return 2;}
        initial_fence::Result creation;auto factory=initial_fence::Factory::CreateApprovedCanonicalTestFactory(instance,creation);
        if(!factory){result.code=creation.code;result.win32Error=creation.win32Error;Reply("startup",result);return 2;}
        initial_fence::RootLease root;initial_fence::FenceLease fence;const auto opened=factory->OpenRoot(root,fence);
        if(!opened.ok){result.code=opened.code;result.win32Error=opened.win32Error;Reply("startup",result);return 2;}
        auto store=initial_durability::Store::CreateApprovedTestStore(instance,*factory,root,fence,result);
        if(!store){Reply("startup",result);factory->Dispose(root,fence);return 2;}
        result.ok=true;result.code="fixture_ready";if(!Reply("startup",result)){factory->Dispose(root,fence);return 3;}
        initial_durability::Cas cas;initial_durability::Digest consumed{};bool suppressed=false;
        for(;;){std::string command;if(!Line(command)){return factory->Dispose(root,fence).ok?0:4;}result=initial_durability::Result{};
            if(command=="acquire"||command=="release"||command=="dispose"){
                initial_fence::Result native;if(command=="acquire")native=factory->TryAcquire(root,fence);else if(command=="release"){const auto observed=factory->Observe(root,fence);native=factory->Release(root,fence,observed.sessionRef);}else native=factory->Dispose(root,fence);
                result.ok=native.ok;result.code=native.code;result.win32Error=native.win32Error;if(!Reply(command,result)){factory->Dispose(root,fence);return 3;}if(command=="dispose"||native.terminal)return result.ok?0:2;continue;
            }
            if(command=="inspect")result=store->Inspect();
            else if(command=="genesis")result=store->InitializeGenesis(cas);
            else if(command=="epoch")result=store->AcquireOwnerEpoch(cas);
            else if(command=="reconcile")result=store->ReconcilePending();
            else if(command=="seam-proof")result=store->RunPrivateSeamProof();
            else if(command=="move-source-proof"||command=="move-destination-proof")result=store->RunPrivateMoveProof(command=="move-destination-proof");
            else if(command=="bounds-proof")result=store->RunPrivateBoundsProof();
            else if(command=="invalid-root-ref"||command=="invalid-fence-ref"||command=="foreign-factory-ref"){
                initial_fence::RootLease alternateRoot;initial_fence::FenceLease alternateFence;
                auto alternateFactory=command=="foreign-factory-ref"?initial_fence::Factory::CreateApprovedCanonicalTestFactory(instance,creation):nullptr;
                auto alternateStore=initial_durability::Store::CreateApprovedTestStore(instance,alternateFactory?*alternateFactory:*factory,
                    command=="invalid-root-ref"?alternateRoot:root,command=="invalid-fence-ref"?alternateFence:fence,result);
                if(alternateStore)result=alternateStore->Inspect();
            }
            else if(command=="crash"){ExitProcess(73);}
            else {
                initial_durability::ClosedRecord record;
                if(command=="consume-launch"||command=="consume-dispatch"||command=="consume-stop"||command=="conflicting-consume"){
                    const bool launch=command=="consume-launch"||command=="conflicting-consume";
                    record.type=initial_durability::RecordType::Consume;record.effect=launch?initial_durability::EffectClass::Launch:(command=="consume-dispatch"?initial_durability::EffectClass::Dispatch:initial_durability::EffectClass::Stop);
                    record.target=Target(launch?durability_pins::kLaunchTargets[slot->fixtureIndex]:(command=="consume-dispatch"?durability_pins::kDispatchTargets[slot->fixtureIndex]:durability_pins::kStopTargets[slot->fixtureIndex]));
                    if(command=="conflicting-consume")record.sourceDigest[0]=1;
                }else if(command=="observation-unknown"||command=="observation-ack"){record.type=initial_durability::RecordType::Observation;record.consumedHash=consumed;record.outcome=command=="observation-unknown"?initial_durability::Outcome::Unknown:initial_durability::Outcome::Ack;}
                else if(command=="note"||command=="changed-note"||command=="stale-note"){record.type=initial_durability::RecordType::Note;record.sourceDigest[0]=command=="changed-note"?2:1;record.configDigest[0]=1;}
                else{result.code="protocol_refused";Reply("protocol",result);factory->Dispose(root,fence);return 2;}
                result=store->AppendOnce(command=="stale-note"?initial_durability::Cas{}:cas,record);
            }
            if(result.ok){cas=result.current;if(result.consumptionRecorded)consumed=result.recordHash;}
            if(command=="consume-launch"&&result.ok&&slot->suppressConsumeAck&&!suppressed){suppressed=true;continue;}
            if(!Reply(command,result)){factory->Dispose(root,fence);return 3;}
        }
    }catch(const std::exception&){return 5;}catch(...){return 6;}
}
