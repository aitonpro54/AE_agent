"use strict";

// Embedded typed read only. UXP documentation is not proof of ExtendScript support.
const aeReadSupport = `
  function __codexCompDynamicLinkEvidence(comp) {
    var project = app.project;
    var identity = {itemId:comp.id,itemIndex:__codexProjectIndexForItem(comp),name:comp.name};
    function snapshot() {
      var file = null, revision = null;
      try { file = project.file ? project.file.fsName : null; } catch (_) {}
      try {
        var raw = project.revision;
        if (typeof raw === "number" && isFinite(raw) && Math.floor(raw) === raw && raw >= 0 && raw <= 9007199254740991) revision = raw;
      } catch (_) {}
      return {file:file,revision:revision};
    }
    var before = snapshot();
    function unavailable(reason) {
      return {ok:false,code:"capability_unavailable",capability:"CompItem.dynamicLinkGUID",reason:reason,comp:identity,project:before};
    }
    if (typeof before.file !== "string" || !before.file) return unavailable("saved_project_unavailable");
    if (before.revision === null) return unavailable("project_revision_unavailable");
    var guid;
    try { guid = comp.dynamicLinkGUID; } catch (_) { return unavailable("property_read_failed"); }
    if (guid === undefined || guid === null) return unavailable("property_unavailable");
    if (typeof guid !== "string" || guid.length !== 36 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(guid) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(guid)) return unavailable("invalid_guid");
    var after = snapshot();
    if (app.project !== project || after.file !== before.file || after.revision !== before.revision) {
      return {ok:false,code:"stale_project",comp:identity,project:before};
    }
    return {ok:true,dynamicLinkGUID:guid,project:before};
  }
`;

module.exports = { aeReadSupport };
