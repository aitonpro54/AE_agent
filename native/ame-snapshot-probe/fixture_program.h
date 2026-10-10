#pragma once
#include "probe_io.h"
// All JSX below is compiled fixture code. Values inserted by native code are
// closed enums and paths derived from authenticated, locked owned roots.
namespace fixture_program {
inline std::string Bitmap(bool proxy) {
    std::string bytes(70, '\0');
    auto u32 = [&](size_t p, unsigned n) { for (size_t i = 0; i < 4; ++i) bytes[p + i] = static_cast<char>(n >> (8 * i)); };
    bytes[0] = 'B'; bytes[1] = 'M'; u32(2, 70); u32(10, 54); u32(14, 40); u32(18, 2); u32(22, 2);
    bytes[26] = 1; bytes[28] = 24; u32(34, 16);
    for (size_t row = 0; row < 2; ++row) for (size_t column = 0; column < 2; ++column) {
        const size_t p = 54 + row * 8 + column * 3;
        bytes[p] = 20; bytes[p + 1] = proxy ? 220 : 40; bytes[p + 2] = proxy ? 40 : 220;
    }
    return bytes;
}
inline std::string Sentinel(const std::string& kind) {
    return kind == "saved-clean" ? "PERSISTED_SENTINEL" : "UNSAVED_SENTINEL_" + kind;
}
inline std::string Create(const std::string& root) {
    return "(function(){var p=app.project;if(!p||p.numItems!==0)throw Error('fixture boot changed');"
        "var media=p.importFile(new ImportOptions(new File(" + probe::Json(root + "\\fixture.bmp") + ")));media.name='AEAgent Fixture Image';"
        "if(typeof media.setProxy==='function'){media.setProxy(new File(" + probe::Json(root + "\\proxy.bmp") + "));media.useProxy=true;}"
        "var folder=p.items.addFolder('AEAgent Fixture Dependencies');media.parentFolder=folder;"
        "var n=p.items.addComp('AEAgent Fixture Nested',640,360,1,2,25);n.parentFolder=folder;"
        "var a=n.layers.addText('Fixture title 01');a.name='TITLE_01';a.enabled=true;"
        "var b=n.layers.addText('Fixture title 02');b.name='TITLE_02';b.enabled=false;"
        "var s=n.layers.addText('PERSISTED_SENTINEL');s.name='SENTINEL';"
        "var m=p.items.addComp('Main',640,360,1,2,25);"
        "var image=m.layers.add(media);image.name='IMAGE';var nested=m.layers.add(n);nested.name='NESTED';"
        "m.time=0.4;m.workAreaStart=0.2;m.workAreaDuration=1.2;n.time=0.2;"
        "for(var i=1;i<=p.numItems;i++)p.item(i).selected=false;"
        "for(var j=1;j<=n.numLayers;j++)n.layer(j).selected=false;a.selected=true;m.selected=true;return 'fixture-created';})()";
}
inline std::string SetSentinel(const std::string& kind) {
    return "(function(){var p=app.project,n=null;for(var i=1;i<=p.numItems;i++)if(p.item(i).name==='AEAgent Fixture Nested')n=p.item(i);"
        "if(!n)throw Error('fixture nested missing');var s=n.layer('SENTINEL'),q=s.property('ADBE Text Properties').property('ADBE Text Document'),d=q.value;d.text=" + probe::Json(Sentinel(kind)) + ";q.setValue(d);s.name='SENTINEL';return 'sentinel-edited';})()";
}
inline std::string SelectVariant(unsigned variant) {
    return "(function(){var p=app.project,n=null;for(var i=1;i<=p.numItems;i++)if(p.item(i).name==='AEAgent Fixture Nested')n=p.item(i);"
        "if(!n||n.numLayers!==3)throw Error('fixture nested changed');n.layer('TITLE_01').enabled=" + std::string(variant == 1 ? "true" : "false") +
        ";n.layer('TITLE_02').enabled=" + std::string(variant == 2 ? "true" : "false") + ";return 'variant-selected';})()";
}
inline std::string Evidence(const std::string& kind, unsigned variant) {
    const bool first = variant != 2, second = variant == 2;
    return "(function(){var p=app.project,n=null,m=null,f=null,folder=null,roots=0;if(!p||p.numItems!==4)throw Error('fixture item count');"
        "for(var i=1;i<=p.numItems;i++){var x=p.item(i);if(x instanceof CompItem&&x.parentFolder===p.rootFolder)roots++;"
        "if(x.name==='AEAgent Fixture Nested')n=x;else if(x.name==='Main')m=x;else if(x.name==='AEAgent Fixture Image')f=x;else if(x.name==='AEAgent Fixture Dependencies')folder=x;else throw Error('foreign fixture item');}"
        "if(!n||!m||!f||!folder||!(folder instanceof FolderItem)||folder.parentFolder!==p.rootFolder||m.parentFolder!==p.rootFolder||n.parentFolder!==folder||f.parentFolder!==folder||roots!==1||"
        "n.numLayers!==3||m.numLayers!==2||m.layer('NESTED').source!==n||m.layer('IMAGE').source!==f)throw Error('fixture graph mismatch');"
        "var text=n.layer('SENTINEL').property('ADBE Text Properties').property('ADBE Text Document').value.text;"
        "if(text!==" + probe::Json(Sentinel(kind)) + "||n.layer('TITLE_01').enabled!==" + std::string(first ? "true" : "false") +
        "||n.layer('TITLE_02').enabled!==" + std::string(second ? "true" : "false") + ")throw Error('fixture sentinel or visibility mismatch');"
        "if(n.layer('TITLE_01').property('ADBE Text Properties').property('ADBE Text Document').value.text!=='Fixture title 01'||"
        "n.layer('TITLE_02').property('ADBE Text Properties').property('ADBE Text Document').value.text!=='Fixture title 02')throw Error('fixture text mismatch');"
        "if(!f.file)throw Error('fixture media missing');var proxy=(f.proxySource&&f.proxySource.file)?f.proxySource.file.fsName:'NONE';"
        "return 'sentinel='+text+'\\nvariant=" + std::to_string(variant) + "\\nmain_name=Main\\nnested_name=AEAgent Fixture Nested\\nroot_comp_count='+roots+'\\nmedia_path='+f.file.fsName+'\\nproxy_path='+proxy+'\\nuse_proxy='+(f.useProxy?'1':'0')+'\\n';})()";
}
} // namespace fixture_program
