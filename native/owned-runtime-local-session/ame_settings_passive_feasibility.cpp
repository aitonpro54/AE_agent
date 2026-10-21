#include "ame_uia_observer.h"
#include <cstdio>
#include <cstring>
int main(int argc,char** argv){if(argc!=2||(strcmp(argv[1],"--passive-feasibility")!=0&&strcmp(argv[1],"--passive-raw-feasibility")!=0)){std::fputs("{\"ok\":false,\"authority\":false,\"code\":\"ame_uia_fixed_passive_arguments_required\"}\n",stdout);return 2;}
    const auto view=strcmp(argv[1],"--passive-raw-feasibility")==0?local_session::ame_observer::PassiveView::Raw:local_session::ame_observer::PassiveView::Control;
    try{const auto result=local_session::ame_observer::CapturePassiveFeasibilityFixed(view);if(std::fwrite(result.json.data(),1,result.json.size(),stdout)!=result.json.size()||std::fputc('\n',stdout)==EOF||std::fflush(stdout)!=0)return 3;return result.complete?0:2;}
    catch(...){std::fputs("{\"ok\":false,\"authority\":false,\"code\":\"ame_uia_passive_native_unknown\"}\n",stdout);return 3;}}
