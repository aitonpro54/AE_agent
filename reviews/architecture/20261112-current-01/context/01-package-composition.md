# 01-package-composition

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/package.json:1–19`
Полный файл SHA256 (hex groups, concatenate) `6bd4b2a6:288aec94:57357758:9c2d951f:3ce8f414:5b8bf878:ea7df315:4cb18996`; Git blob `5ca5a34b:0c1b6eec:43586811:96346cb5:b88f7cc6`. Выдержка: строки 1–19, 1174 bytes.

```json
{
  "name": "ae-agent-core4",
  "version": "4.2.6",
  "private": true,
  "description": "Independent Core4 broker, external Node runtime and isolated CEP panel",
  "scripts": {
    "start": "node runtime/stdio-entry.js",
    "test:installable": "node --test test/installable-runtime.test.js",
    "test:manual-runtime": "node --test test/manual-runtime.test.js",
    "package:installable": "node tools/package-installable.js",
    "test": "node --test test/core4.test.js test/modules/titles.test.js test/modules/photo-placeholder.test.js test/lifecycle-simulation.test.js test/audit-repairs.test.js",
    "test:repairs": "node --test test/audit-repairs.test.js",
    "test:cep": "node --test test/integration/cep-transport.test.js",
    "check:boundaries": "node tools/check-boundaries.js",
    "check:scoped": "node tools/validate-diff.js",
    "check:release": "node tools/check-boundaries.js && node --test test/core4.test.js test/modules/titles.test.js test/modules/photo-placeholder.test.js test/integration/cep-transport.test.js test/lifecycle-simulation.test.js test/audit-repairs.test.js",
    "test:lifecycle": "node --test test/lifecycle-simulation.test.js"
  }
}
```

## `core4/config/catalog.json:1–24`
Полный файл SHA256 (hex groups, concatenate) `799f5920:1231800f:814374d3:c48028e9:00751de9:59329b21:7c6af8d7:86f75174`; Git blob `237495fe:fc739c28:af142adf:e07a72df:805531f2`. Выдержка: строки 1–24, 692 bytes.

```json
{
  "catalogRevision": "update-photo-placeholder-af7a9f92fc21e32321544ed21d139cb5af0415d249c9d8f3cee389b585aca655",
  "modules": [
    {
      "id": "photo-placeholder",
      "version": "4.0.0-m1",
      "path": "modules/photo-placeholder",
      "admission": "config/admissions/photo-placeholder.json"
    },
    {
      "id": "titles",
      "version": "4.0.0-m1",
      "path": "modules/titles",
      "admission": "config/admissions/titles.json"
    },
    {
      "id": "titles-current-target",
      "version": "4.0.0",
      "path": "modules/titles-current-target",
      "admission": "config/admissions/titles-current-target.json"
    }
  ],
  "engine": {
    "path": "plan-engine",
```

## `core4/config/catalog.json:26–27`
Полный файл SHA256 (hex groups, concatenate) `799f5920:1231800f:814374d3:c48028e9:00751de9:59329b21:7c6af8d7:86f75174`; Git blob `237495fe:fc739c28:af142adf:e07a72df:805531f2`. Выдержка: строки 26–27, 6 bytes.

```json
  }
}
```

## `core4/config/compositions/operator-render-jobs.json:1–11`
Полный файл SHA256 (hex groups, concatenate) `4524428e:d6300cb7:12a5ef2e:0623a2de:8522f951:e171bbae:7bb41938:63b0eef6`; Git blob `0c881e72:6921188d:abea7668:6b2f4dd3:74a3b203`. Выдержка: строки 1–11, 199 bytes.

```json
{
  "parent": "operator-workflows-montage",
  "modules": [],
  "assets": [],
  "profiles": {},
  "capabilities": { "render-jobs": 1 },
  "bundle": {
    "files": [],
    "artifactClosures": []
  }
}
```

## `core4/config/compositions/operator-workflows-montage.json:1–25`
Полный файл SHA256 (hex groups, concatenate) `2d42eed0:66411df9:de75527f:bd96a5c3:3641b3e0:2f424f10:c0e5b57a:0b10fd1f`; Git blob `8957dfdb:4cd83f05:7bd52a15:bb88a1aa:16a384d8`. Выдержка: строки 1–25, 785 bytes.

```json
{
  "parent": "operator-frame-export",
  "modules": ["layer-overlay"],
  "assets": [
    {
      "assetKey": "layer-overlay-v1",
      "moduleId": "layer-overlay",
      "path": "modules/layer-overlay",
      "admission": "config/admissions/layer-overlay.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "layer-overlay": {
      "operationId": "duplicate-and-replace-still",
      "resultProfile": "layer-overlay-v1",
      "operatorConfirmation": "registry-v1"
    }
  },
  "bundle": {
    "files": ["runtime/montage-mandate.js", "runtime/layer-overlay-proof.js", "config/admissions/layer-overlay.json"],
    "artifactClosures": ["modules/layer-overlay/artifact.json"]
  }
}
```

## `core4/config/compositions/operator-workflows.json:1–17`
Полный файл SHA256 (hex groups, concatenate) `894daf8f:8073a337:a6f136a6:0582d220:5b37d147:fb88a780:faddf408:90330b90`; Git blob `866d7322:d1d917aa:f626d3e5:0a75bfe1:eff62a97`. Выдержка: строки 1–17, 1438 bytes.

```json
{
  "parent": "manual-media-layers",
  "modules": [],
  "assets": [],
  "profiles": {
    "titles-point-layout": { "operationId": "measure-or-apply-point-layout", "resultProfile": "manual-point-layout-v1", "operatorConfirmation": "registry-v1" },
    "text-layer": { "operationId": "write-point-text", "resultProfile": "owned-text-layer-v1", "operatorConfirmation": "registry-v1" },
    "text-variant": { "operationId": "stage-text-variant", "resultProfile": "owned-text-variant-v1", "operatorConfirmation": "registry-v1" },
    "comp-render": { "operationId": "render-text-variant", "resultProfile": "owned-comp-render-v1", "operatorConfirmation": "registry-v1" },
    "project-assembly": { "operationId": "assemble-composition", "resultProfile": "owned-project-assembly-v1", "operatorConfirmation": "registry-v1" },
    "project-save": { "operationId": "save-current-project", "resultProfile": "current-project-save-v1", "operatorConfirmation": "registry-v1" },
    "project-lifecycle": { "operationId": "transition-project", "resultProfile": "project-lifecycle-v1", "operatorConfirmation": "registry-v1" },
    "media-import": { "operationId": "ingest-footage", "resultProfile": "media-import-v1", "operatorConfirmation": "registry-v1" },
    "layer-insert": { "operationId": "insert-footage-layer", "resultProfile": "layer-insert-v1", "operatorConfirmation": "registry-v1" }
  },
  "bundle": { "files": [], "artifactClosures": [] }
}
```

## `core4/runtime/source-package.json:1–65`
Полный файл SHA256 (hex groups, concatenate) `bb51b581:30e1ca33:501c531a:035a74f6:82643479:762b3594:fa7c1823:e442538b`; Git blob `728db4a0:e47bae9a:54c4b2ae:1dd8d54b:22eef01b`. Выдержка: строки 1–65, 2090 bytes.

```json
{
  "version": 3,
  "files": [
    "core/artifact.json",
    "worker.js",
    "runtime/stdio-entry.js",
    "runtime/installation.js",
    "runtime/receiver-contract.json",
    "runtime/install-lease.js",
    "runtime/installation-lineage.js",
    "runtime/native-read-disposition.js",
    "runtime/ae-readiness.js",
    "integrations/cep/panel-identity.js",
    "runtime/render-job-history.js",
    "runtime/render-job-maintenance.js",
    "runtime/host/json-codec.jsx",
    "integrations/cep/http-peer.js",
    "integrations/cep/peer-protocol.js",
    "integrations/cep/completion-store.js",
    "modules/project-inspection/contract.json",
    "modules/project-inspection/executor.jsx",
    "modules/project-inspection/artifact.json",
    "cep/CSXS/manifest.xml",
    "cep/index.html",
    "cep/panel.css",
    "cep/js/poll-dispatcher.js",
    "cep/js/panel.js"
  ],
  "artifactClosures": [
    "core/artifact.json",
    "protocol/artifact.json"
  ],
  "optional": {
    "owner": {
      "files": [
        "runtime/adobe-child-environment.js",
        "runtime/ae-panel-startup.js",
        "runtime/host/ensure-panel.jsx",
        "runtime/owner-contract.json",
        "runtime/owner-entry.js",
        "runtime/client-entry.js",
        "runtime/client-ipc.js",
        "runtime/client-stdio.js",
        "runtime/controller-lease.js",
        "runtime/attachment-owner.js",
        "runtime/owner-lifecycle.js",
        "runtime/recovery-inspection.js",
        "runtime/windows-owner-process.js",
        "runtime/owner-maintenance.js",
        "runtime/start-over-inspection.js",
        "runtime/start-over-process.js",
        "runtime/start-over-state.js",
        "runtime/start-over-barrier.js",
        "runtime/start-over-archive.js",
        "runtime/start-over-finisher.js",
        "runtime/work-session.js",
        "runtime/start-over-panel-control.js",
        "runtime/start-over-driver.js",
        "runtime/owner-launch.js"
      ]
    },
    "manual": {
      "files": [
        "config/admissions/titles.json",
        "config/admissions/photo-placeholder.json",
```
