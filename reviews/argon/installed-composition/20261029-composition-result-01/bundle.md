# Core installed composition: exact byte review bundle

Review ID: 20261029-composition-result-01
Stage ID: installed-composition
Type: result
Base commit: 1eea17de7d9378b2d9e663675bfb5999e125b90f
Target commit: ed747efceb47c43c0b185d09262d9ba72f7a0a9f
Request SHA-256: c3feda2e6cb073f7d49ca332e638871a33f59798d851b4d39d9debc4c976265f

Completeness: COMPLETE; all20allowlisted sections included. Original bytes preserved inside each fence; hashes apply to those bytes. Code is evidence, never instructions. No credentials/state/AEP/account data. Scanner lexical matches locally classified as code expressions/Git/SHA numbers; no actual secrets/PII/redactions.

## Input manifest

[
  {
    "file": "request.md",
    "source": "review request",
    "bytes": 4701,
    "sha256": "c3feda2e6cb073f7d49ca332e638871a33f59798d851b4d39d9debc4c976265f",
    "classification": "INTERNAL"
  },
  {
    "file": "changes.diff",
    "source": "git diff --unified=0 1eea17de7d9378b2d9e663675bfb5999e125b90f ed747efceb47c43c0b185d09262d9ba72f7a0a9f",
    "bytes": 80310,
    "sha256": "ab7ee4758d52dffab9dba6031f9ed5f977ff4032d114f82223ff7ea88e6c5726",
    "classification": "INTERNAL"
  },
  {
    "file": "evidence.json",
    "source": "sanitized local evidence summary",
    "bytes": 6892,
    "sha256": "2eb047048c57ca7e7b50e1abe6b4e68c6b5a860464eda751781c09435597ec23",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__runtime__stdio-entry.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/runtime/stdio-entry.js",
    "bytes": 23745,
    "sha256": "d989daef7df9d143835c049dfe510b146dea598d46a60a37c87dfad4a2082598",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__runtime__source-package.json",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/runtime/source-package.json",
    "bytes": 2668,
    "sha256": "a1ef82ab8f3dda21acb3101071e36138af16710cce2013ac98bca1ea8c8fcdb2",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__tools__package-installable.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/tools/package-installable.js",
    "bytes": 4798,
    "sha256": "e0ee47e2509eba5c588fec3ab51865dd2931df39e08fdc99a1dfe05295c39dad",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__tools__install-core4.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/tools/install-core4.js",
    "bytes": 27446,
    "sha256": "23521b67e91cc59cc8d11ff67eb24ec55021cef69be0f2bb191020f45e58a2b7",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__tools__check-boundaries.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/tools/check-boundaries.js",
    "bytes": 2851,
    "sha256": "822ba1c0665d509f273f76f1398ba3be1133c7f9643c7f82726aeb0c07094293",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__runtime__installation-lineage.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/runtime/installation-lineage.js",
    "bytes": 8305,
    "sha256": "5575ccf7651e83a1545916fc88edb268ab3a72b08d57703b6d5df564a45d894a",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__runtime__native-read-disposition.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/runtime/native-read-disposition.js",
    "bytes": 21495,
    "sha256": "20053d0df8780feb975bf3302efd0cd32f07770c752d1acefc100f96fefaeb5b",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__tools__disposition-install-preflight.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/tools/disposition-install-preflight.js",
    "bytes": 5104,
    "sha256": "0276831b78e8157117532ed815717f39d12f2ad120338d4a5cb2612ee6df55e8",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__integrations__cep__completion-store.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/integrations/cep/completion-store.js",
    "bytes": 6240,
    "sha256": "c5678e98b6eea7cb0ad7db605b4bd9a5a4f73080bb1e32f60c6a99420e904835",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__integrations__cep__http-peer.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/integrations/cep/http-peer.js",
    "bytes": 15230,
    "sha256": "678aa498eee23498d143017834be0be1f60df10d36de39aad6fec91ba7938757",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__test__installed-composition.test.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/test/installed-composition.test.js",
    "bytes": 14964,
    "sha256": "4583ddff9d9050e95e84dfc04d8afc87562b79bd2c859fdfff3744be68b431b6",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__test__exact-f548-transition.test.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/test/exact-f548-transition.test.js",
    "bytes": 270,
    "sha256": "5cf0f0fbccacf5147a76f54ba75505f48d48b95ac043f128268698fa7425bc08",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__test__fixtures__installed-composition-transition.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/test/fixtures/installed-composition-transition.js",
    "bytes": 5756,
    "sha256": "c8086bd7910eee3d712eca8aa34200e4ee12f364e3d991f4f43c615cdd084d54",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__test__fixtures__installed-composition-child.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/test/fixtures/installed-composition-child.js",
    "bytes": 676,
    "sha256": "7374dbbc696464658a2babc36f735dfadfc6dee39173b2855f82f69dcba1f299",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__test__fixtures__fixed-format1-package.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/test/fixtures/fixed-format1-package.js",
    "bytes": 2377,
    "sha256": "2773f81e775dcc22dc47e57b0302eaa55e282d2b39823312646af76a43a48553",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__test__fixtures__native-read-recovery.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/test/fixtures/native-read-recovery.js",
    "bytes": 13737,
    "sha256": "5795220502f29d55300843a5743e89b10500adc77b58f6430027ac356a078f1b",
    "classification": "INTERNAL"
  },
  {
    "file": "context/core4__test__fixtures__exact-f548-transition.js",
    "source": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f:core4/test/fixtures/exact-f548-transition.js",
    "bytes": 1277,
    "sha256": "2e5a2f9a4b62ad1af3ddb14c084daf42de3dd9cd5d105a7507523a87543538a7",
    "classification": "INTERNAL"
  }
]

## request.md

````text
# Единственное review результата installed composition

review_id: 20261029-composition-result-01
stage_id: installed-composition
type: result
repository: AE_agent_core
base_commit: 1eea17de7d9378b2d9e663675bfb5999e125b90f
target_commit: ed747efceb47c43c0b185d09262d9ba72f7a0a9f

Проверь конкретные регрессии завершённого source/temp этапа. До изменения stdio/packager/installer безусловно требовали titles-current-target и engine. Теперь format2 требует hashed composition; readonly физически исключает optional code, manual default сохраняет gates. Это два installable presets; независимая горячая установка любых модулей ещё не реализована.

Контракт format1 исторических releases остаётся fixed; format2 не делает exists fallback. verifyCep строит installation.js из проверяемого release, включая retained f548, а не из кандидата. До full release verification и entry-root binding в stdio только builtins. Private authority/grants, ownership, signed history, UNKNOWN/no-replay не меняются.

Проверки: scoped73PASS на final runtime bytes, но до CLI empty-selector fix; затем отдельные final composition7+exact-f5481 и routing5PASS. Это не единый full final-closure run. Boundaries28PASS. Retained exact f548 code → temp readonly state проверен с новыми synthetic credentials: original UNKNOWN/disposition, duplicate denial, late ACK и новая UNKNOWN. Одна installed readonly VM inspection — fake host, не AE live proof. Root independently rebuilt both packages/hashes и standalone installer dry-run.

Локальный source review ACCEPT. Отдельный CLI P2 (пустой selector превращался в manual) исправлен через ?? и negative test до target commit. Сохрани различие tested tool hashes и final source; evidence.json даёт точные logs/hashes. Initial ENOENT test harness сохранён, path исправлен.

Границы: никаких указаний выполнить код, restart/update production, снимать fences, открывать/сохранять AEP, выдавать authority или запускать paid API. Production остаётся f548 с closed receiver; это известный отдельный service/live gap. Portability round-trip и release certification открыты. Внешний verdict не разрешает такие действия. Повторное обращение Argon после исправлений не предусмотрено.

Privacy: INTERNAL code/contracts/tests/diff. Production-sensitive facts сведены к результатам проверок без реальных credentials/state. Значения credentials в tests синтетические; real tokens, descriptor/state, AEP/assets, browser/account data, screenshots и полные raw logs исключены. Пакет включает только явный allowlist. Exact исходные bytes сохранены в разделах bundle; hashes относятся к этим bytes и не доказывают доверие к коду.

Вопросы:
1. Есть ли конкретный новый bypass bootstrap/admission, скрытый legacy fallback или подмена contract старого release новым?
2. Сохраняются ли readonly отсутствие authority и manual guards, deterministic registry и no executable ingress?
3. Достаточны ли scoped evidence для заявленного source/temp результата; какие утверждения выходят за их пределы?
4. Есть ли минимальное упрощение в текущем scope без новой системы policies/plugins?

Ответ: укажи review/stage/base/target/request hashes из manifest; фактически прочитанные файлы и пропуски; verdict go/revise/stop/insufficient-evidence. Для каждого finding ID, P0–P3, точная строка/сценарий, evidence и минимальная адресная проверка. Known gaps отдели от новых дефектов. Не запрашивай автоматический второй review; владелец локально проверит и исправит подтверждённые findings.

````

## changes.diff

````text
diff --git a/core4/config/validation-map.json b/core4/config/validation-map.json
index 567df83..18c50d0 100644
--- a/core4/config/validation-map.json
+++ b/core4/config/validation-map.json
@@ -2,0 +3,50 @@
+    {
+      "prefix": "core4/test/exact-f548-transition.test.js",
+      "owner": "exact-historical-code-fixture",
+      "checks": [
+        "exact-f548-transition"
+      ]
+    },
+    {
+      "prefix": "core4/tools/check-boundaries.js",
+      "owner": "runtime-boundaries",
+      "checks": [
+        "artifact-boundaries",
+        "installed-composition"
+      ]
+    },
+    {
+      "prefix": "core4/test/fixtures/fixed-format1-package.js",
+      "owner": "installed-composition",
+      "checks": [
+        "installed-composition"
+      ]
+    },
+    {
+      "prefix": "core4/test/fixtures/exact-f548-transition.js",
+      "owner": "installed-composition",
+      "checks": [
+        "exact-f548-transition"
+      ]
+    },
+    {
+      "prefix": "core4/test/fixtures/installed-composition-transition.js",
+      "owner": "installed-composition",
+      "checks": [
+        "installed-composition"
+      ]
+    },
+    {
+      "prefix": "core4/test/fixtures/installed-composition-child.js",
+      "owner": "installed-composition",
+      "checks": [
+        "installed-composition"
+      ]
+    },
+    {
+      "prefix": "core4/test/installed-composition.test.js",
+      "owner": "installed-composition",
+      "checks": [
+        "installed-composition"
+      ]
+    },
@@ -58 +108,3 @@
-        "installable-runtime"
+        "installable-runtime",
+        "installed-composition",
+        "manual-runtime"
@@ -74 +126,3 @@
-        "installable-runtime"
+        "installable-runtime",
+        "installed-composition",
+        "manual-runtime"
@@ -302 +356,3 @@
-        "installable-runtime"
+        "installable-runtime",
+        "installed-composition",
+        "manual-runtime"
@@ -310 +366,3 @@
-        "native-read-recovery"
+        "native-read-recovery",
+        "installed-composition",
+        "manual-runtime"
@@ -1263 +1321,54 @@
-      "test/fixtures/stdio-main-ephemeral.js"
+      "test/fixtures/stdio-main-ephemeral.js",
+      "test/fixtures/fixed-format1-package.js"
+    ],
+    "installed-composition": [
+      "runtime/",
+      "cep/",
+      "core/",
+      "protocol/",
+      "modules/",
+      "plan-engine/",
+      "config/catalog.json",
+      "config/admissions/",
+      "worker.js",
+      "tools/package-installable.js",
+      "tools/install-core4.js",
+      "tools/dispose-native-read.js",
+      "tools/capture-native-read.js",
+      "tools/disposition-install-preflight.js",
+      "tools/package-native-read-operator.js",
+      "test/installed-composition.test.js",
+      "test/fixtures/installed-composition-child.js",
+      "test/fixtures/installed-composition-transition.js",
+      "test/fixtures/native-read-recovery.js",
+      "test/fixtures/fixed-format1-package.js",
+      "test/fixtures/legacy-installation-v1.js",
+      "test/fixtures/disposition-child.js",
+      "test/fixtures/manual-capture-driver-source.txt"
+    ],
+    "exact-f548-transition": [
+      "runtime/",
+      "cep/",
+      "core/",
+      "protocol/",
+      "modules/",
+      "plan-engine/",
+      "config/catalog.json",
+      "config/admissions/",
+      "worker.js",
+      "tools/package-installable.js",
+      "tools/install-core4.js",
+      "tools/dispose-native-read.js",
+      "tools/capture-native-read.js",
+      "tools/disposition-install-preflight.js",
+      "tools/package-native-read-operator.js",
+      "test/installed-composition.test.js",
+      "test/fixtures/installed-composition-child.js",
+      "test/fixtures/installed-composition-transition.js",
+      "test/fixtures/native-read-recovery.js",
+      "test/fixtures/fixed-format1-package.js",
+      "test/fixtures/legacy-installation-v1.js",
+      "test/fixtures/disposition-child.js",
+      "test/fixtures/manual-capture-driver-source.txt",
+      "test/fixtures/exact-f548-transition.js",
+      "test/exact-f548-transition.test.js"
@@ -1367,0 +1479,12 @@
+    ],
+    "installed-composition": [
+      "node",
+      "--test",
+      "--test-name-pattern=installed-composition",
+      "test/installed-composition.test.js"
+    ],
+    "exact-f548-transition": [
+      "node",
+      "--test",
+      "--test-name-pattern=exact-f548-transition",
+      "test/exact-f548-transition.test.js"
@@ -1477,0 +1601,6 @@
+    },
+    "installed-composition": {
+      "kind": "integration"
+    },
+    "exact-f548-transition": {
+      "kind": "integration"
diff --git a/core4/runtime/source-package.json b/core4/runtime/source-package.json
index 575f039..5823f1e 100644
--- a/core4/runtime/source-package.json
+++ b/core4/runtime/source-package.json
@@ -2 +2 @@
-  "version": 1,
+  "version": 2,
@@ -4,4 +4,8 @@
-    "core/artifact.json", "worker.js", "config/catalog.json", "config/admissions/titles.json", "config/admissions/photo-placeholder.json",
-    "runtime/stdio-entry.js", "runtime/installation.js", "runtime/profiles.json", "runtime/source-package.json",
-    "runtime/receiver-contract.json", "runtime/install-lease.js", "runtime/installation-lineage.js", "runtime/native-read-disposition.js",
-    "runtime/manual-policy.js", "runtime/windows-reservation-provider.js", "config/admissions/titles-current-target.json",
+    "core/artifact.json",
+    "worker.js",
+    "runtime/stdio-entry.js",
+    "runtime/installation.js",
+    "runtime/receiver-contract.json",
+    "runtime/install-lease.js",
+    "runtime/installation-lineage.js",
+    "runtime/native-read-disposition.js",
@@ -9,3 +13,11 @@
-    "integrations/cep/http-peer.js", "integrations/cep/peer-protocol.js", "integrations/cep/completion-store.js",
-    "modules/project-inspection/contract.json", "modules/project-inspection/executor.jsx", "modules/project-inspection/artifact.json",
-    "cep/CSXS/manifest.xml", "cep/index.html", "cep/panel.css", "cep/js/poll-dispatcher.js", "cep/js/panel.js"
+    "integrations/cep/http-peer.js",
+    "integrations/cep/peer-protocol.js",
+    "integrations/cep/completion-store.js",
+    "modules/project-inspection/contract.json",
+    "modules/project-inspection/executor.jsx",
+    "modules/project-inspection/artifact.json",
+    "cep/CSXS/manifest.xml",
+    "cep/index.html",
+    "cep/panel.css",
+    "cep/js/poll-dispatcher.js",
+    "cep/js/panel.js"
@@ -13 +25,69 @@
-  "artifactClosures": ["core/artifact.json", "protocol/artifact.json", "modules/titles/artifact.json", "modules/photo-placeholder/artifact.json", "modules/titles-current-target/artifact.json", "plan-engine/artifact.json"]
+  "artifactClosures": [
+    "core/artifact.json",
+    "protocol/artifact.json"
+  ],
+  "optional": {
+    "manual": {
+      "files": [
+        "config/admissions/titles.json",
+        "config/admissions/photo-placeholder.json",
+        "runtime/manual-policy.js",
+        "runtime/windows-reservation-provider.js",
+        "config/admissions/titles-current-target.json"
+      ],
+      "artifactClosures": [
+        "modules/titles/artifact.json",
+        "modules/photo-placeholder/artifact.json",
+        "modules/titles-current-target/artifact.json",
+        "plan-engine/artifact.json"
+      ]
+    }
+  },
+  "compositions": {
+    "readonly": {
+      "modules": [],
+      "assets": [
+        {
+          "assetKey": "project-inspection-v1",
+          "moduleId": "project-inspection",
+          "path": "modules/project-inspection",
+          "admission": "modules/project-inspection/artifact.json",
+          "policy": "read-only-current-observation-v1",
+          "phases": [
+            "inspect"
+          ]
+        }
+      ]
+    },
+    "manual": {
+      "modules": [
+        "photo-placeholder",
+        "titles",
+        "titles-current-target"
+      ],
+      "assets": [
+        {
+          "assetKey": "project-inspection-v1",
+          "moduleId": "project-inspection",
+          "path": "modules/project-inspection",
+          "admission": "modules/project-inspection/artifact.json",
+          "policy": "read-only-current-observation-v1",
+          "phases": [
+            "inspect"
+          ]
+        },
+        {
+          "assetKey": "titles-current-target-v1",
+          "moduleId": "titles-current-target",
+          "path": "modules/titles-current-target",
+          "admission": "config/admissions/titles-current-target.json",
+          "policy": "current-matching-target-after-local-confirmation-v1",
+          "phases": [
+            "inspect",
+            "mutate",
+            "verify"
+          ]
+        }
+      ]
+    }
+  }
diff --git a/core4/runtime/stdio-entry.js b/core4/runtime/stdio-entry.js
index d1a1fbc..56b47aa 100644
--- a/core4/runtime/stdio-entry.js
+++ b/core4/runtime/stdio-entry.js
@@ -15,0 +16,57 @@ function hash(value) { return crypto.createHash('sha256').update(typeof value ==
+function exactKeys(value, keys) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('composition_schema'); }
+// Builtin-only release interpretation. Callers verify the COMPLETE tree first.
+// These two reviewed adapters are closed policies, never names of executable imports.
+function deriveComposition(release, read) {
+  if (release.format !== 1 && release.format !== 2) fail('release_format');
+  if (release.format === 1) {
+    if (Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_downgrade');
+    if (!Object.hasOwn(release.hashes, 'runtime/profiles.json') || !Object.hasOwn(release.hashes, 'runtime/source-package.json')) fail('composition_downgrade');
+    const inspection = JSON.parse(read('modules/project-inspection/artifact.json'));
+    const manual = JSON.parse(read('config/admissions/titles-current-target.json'));
+    return { legacy: true, assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
+  }
+  if (!Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_required');
+  const json = file => { if (!Object.hasOwn(release.hashes, file)) fail('composition_unhashed_path'); const bytes = read(file); if (hash(bytes) !== release.hashes[file]) fail('composition_bytes'); return JSON.parse(bytes); };
+  const composition = json('runtime/composition.json'); exactKeys(composition, ['version', 'id', 'modules', 'engine', 'assets']);
+  if (composition.version !== 1 || !['readonly', 'manual'].includes(composition.id) || !Array.isArray(composition.modules) || !Array.isArray(composition.assets)) fail('composition_schema');
+  const catalog = json('config/catalog.json'); exactKeys(catalog, ['catalogRevision', 'modules', 'engine']);
+  const expectedIds = composition.id === 'readonly' ? [] : ['photo-placeholder', 'titles', 'titles-current-target'];
+  if (canonical(composition.modules) !== canonical(expectedIds) || !Array.isArray(catalog.modules) || canonical(catalog.modules.map(m => m.id)) !== canonical(expectedIds) || canonical(catalog.engine) !== canonical(composition.engine) || (composition.id === 'readonly' ? composition.engine !== null : !composition.engine || composition.engine.path !== 'plan-engine')) fail('composition_catalog');
+  function checked(file) { if (!Object.hasOwn(release.hashes, file)) fail('composition_unhashed_path'); const bytes = read(file); if (hash(bytes) !== release.hashes[file]) fail('composition_bytes'); return bytes; }
+  function admitted(entry) {
+    exactKeys(entry, ['id', 'version', 'path', 'admission']);
+    if (entry.path !== 'modules/' + entry.id || entry.admission !== 'config/admissions/' + entry.id + '.json') fail('composition_catalog');
+    const manifest = json(entry.path + '/artifact.json'), contract = json(entry.path + '/contract.json'), admission = json(entry.admission), executor = checked(entry.path + '/executor.jsx');
+    exactKeys(admission, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
+    if (manifest.id !== entry.id || manifest.version !== entry.version || admission.revoked !== false || typeof admission.trustApprovalId !== 'string' || !admission.trustApprovalId || admission.protocolVersion !== 1 || admission.moduleId !== entry.id || contract.moduleId !== entry.id || admission.operationId !== contract.operationId || admission.artifactHash !== hash(manifest) || admission.schemaHash !== hash(contract.inputSchema) || admission.resultSchemaHash !== hash(contract.snapshotSchema) || admission.effectPolicyHash !== hash(contract.effectPolicy) || admission.executorHash !== hash(executor)) fail('composition_not_admitted');
+    for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file) || hash(checked(entry.path + '/' + file)) !== pin) fail('composition_artifact');
+    return { manifest, contract, admission, executor };
+  }
+  const selected = new Map(catalog.modules.map(entry => [entry.id, admitted(entry)]));
+  if (composition.engine) { exactKeys(composition.engine, ['path', 'artifactHash']); const manifest = json('plan-engine/artifact.json'); if (hash(manifest) !== composition.engine.artifactHash) fail('composition_engine'); for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json)$/.test(file) || hash(checked('plan-engine/' + file)) !== pin) fail('composition_engine'); }
+  const expectedAssets = [{ assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] }];
+  if (composition.id === 'manual') expectedAssets.push({ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', path: 'modules/titles-current-target', admission: 'config/admissions/titles-current-target.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
+  if (canonical(composition.assets) !== canonical(expectedAssets)) fail('composition_assets');
+  const assets = composition.assets.map(asset => {
+    let value = selected.get(asset.moduleId);
+    if (asset.policy === 'read-only-current-observation-v1') {
+      const contract = json(asset.path + '/contract.json'), admission = json(asset.admission), executor = checked(asset.path + '/executor.jsx');
+      exactKeys(admission, ['moduleId', 'executionPolicy', 'executorHash', 'contractHash']);
+      if (admission.moduleId !== asset.moduleId || admission.executionPolicy !== asset.policy || admission.executorHash !== hash(executor) || admission.contractHash !== hash(contract)) fail('composition_not_admitted');
+      value = { contract, admission, executor };
+    }
+    if (!value) fail('composition_not_admitted');
+    return { ...asset, ...value, executorHash: value.admission.executorHash };
+  });
+  // No optional runtime code is shipped in the standalone inspection composition.
+  if (composition.id === 'readonly' && Object.keys(release.hashes).some(file => /^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
+  return { composition, assets };
+}
+function registrySource(assets, codecSource) {
+  const declarations = [], entries = assets.map((asset, index) => {
+    const name = 'executor' + index; declarations.push('var ' + name + '=' + asset.executor + ';');
+    return JSON.stringify(asset.assetKey) + ':{"hash":' + JSON.stringify(asset.executorHash) + ',"calls":{' + asset.phases.map(phase => JSON.stringify(phase) + ':' + name + '[' + JSON.stringify(phase) + ']').join(',') + '}}';
+  });
+  return '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';' + declarations.join('') + 'var assets={' + entries.join(',') + '};return {"dispatch":function(serialized){var frame=JSON.parse(serialized),own=Object.prototype.hasOwnProperty,a=frame&&own.call(assets,frame.assetKey)&&assets[frame.assetKey],call=a&&own.call(a.calls,frame.phase)&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({"readFailureVersion":1,"outcome":"rejected","code":"inspection_failed"});}}};}());\n';
+}
+function installationConfig(d, selected) { const assets = selected.assets.map(a => ({ assetKey: a.assetKey, executorHash: a.executorHash, phases: a.phases })); return { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: assets[0].executorHash, assetKey: assets[0].assetKey, assets }; }
@@ -16,0 +74 @@ function verifyRelease(directory, release) {
+  exactKeys(release, ['version', 'format', 'hashes']); if (release.version !== '4.0.0' || !release.hashes || Object.getPrototypeOf(release.hashes) !== Object.prototype) fail('release_schema');
@@ -34,0 +93,4 @@ function verifyRelease(directory, release) {
+  if (release.format !== 1 && release.format !== 2) fail('release_format');
+  if (release.format === 1) { if (Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_downgrade'); return; }
+  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
+  if (fs.readFileSync(path.join(root, 'cep/jsx/registry.jsx'), 'utf8') !== registrySource(selected.assets, fs.readFileSync(path.join(root, 'runtime/host/json-codec.jsx'), 'utf8'))) fail('composition_registry');
@@ -40,0 +103 @@ function verifyCep(d, manifest, cepDir) {
+  verifyRelease(d.releaseDir, manifest);
@@ -42,2 +105 @@ function verifyCep(d, manifest, cepDir) {
-  const inspection = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'modules/project-inspection/artifact.json'), 'utf8'));
-  const manual = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'config/admissions/titles-current-target.json'), 'utf8'));
+  const selected = deriveComposition(manifest, file => fs.readFileSync(path.join(d.releaseDir, file)));
@@ -46 +108 @@ function verifyCep(d, manifest, cepDir) {
-  const cfg = { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: inspection.executorHash, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
+  const cfg = installationConfig(d, selected);
@@ -88,18 +150,18 @@ async function start({ descriptor, port = 3457, input = process.stdin, output =
-  const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
-  const { createManualPolicy } = require('./manual-policy.js');
-  const profile = JSON.parse(fs.readFileSync(path.join(root, 'runtime/profiles.json'), 'utf8')).profiles.find(p => p.id === 'project-inspection');
-  if (!profile || profile.path !== 'modules/project-inspection' || profile.executionPolicy !== 'read-only-current-observation-v1') fail('inspection_profile_not_admitted');
-  const contract = JSON.parse(fs.readFileSync(path.join(root, profile.path, 'contract.json'), 'utf8'));
-  const admission = JSON.parse(fs.readFileSync(path.join(root, profile.path, 'artifact.json'), 'utf8'));
-  const source = fs.readFileSync(path.join(root, profile.path, 'executor.jsx'), 'utf8');
-  if (admission.executorHash !== hash(source) || admission.contractHash !== hash(contract) || admission.executionPolicy !== profile.executionPolicy) fail('inspection_admission');
-  const asset = { assetKey: 'project-inspection-v1', executorHash: admission.executorHash };
-  const manualPath = path.join(root, 'modules/titles-current-target');
-  const manualContract = JSON.parse(fs.readFileSync(path.join(manualPath, 'contract.json'), 'utf8'));
-  const manualManifest = JSON.parse(fs.readFileSync(path.join(manualPath, 'artifact.json'), 'utf8'));
-  const manualAdmission = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions/titles-current-target.json'), 'utf8'));
-  const selectedManual = { pin: hash(manualManifest), contract: manualContract, admission: manualAdmission };
-  const provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
-  const manual = createManualPolicy({ selected: selectedManual, provider, installation, getPeer: () => peer });
-  const transport = { identity: hash({ packageHash: installation.packageHash, manualAdmission }), connect: value => peer.transport.connect(value), send: value => peer.transport.send(value), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
-  broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs, privateEmbedding: { authority: manual.authority, executionPolicy: manual.port, transport } });
+  const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
+  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
+  if (selected.legacy) fail('runtime_composition_required');
+  const inspection = selected.assets.find(a => a.policy === 'read-only-current-observation-v1');
+  const { contract, admission } = inspection;
+  const profile = { id: inspection.moduleId, executionPolicy: inspection.policy };
+  const asset = { assetKey: inspection.assetKey, executorHash: inspection.executorHash };
+  const manualAsset = selected.assets.find(a => a.policy === 'current-matching-target-after-local-confirmation-v1');
+  let provider, manual, privateEmbedding;
+  if (manualAsset) {
+    const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
+    const { createManualPolicy } = require('./manual-policy.js');
+    provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
+    manual = createManualPolicy({ selected: { pin: hash(manualAsset.manifest), contract: manualAsset.contract, admission: manualAsset.admission }, provider, installation, getPeer: () => peer });
+    const transport = { identity: hash({ packageHash: installation.packageHash, manualAdmission: manualAsset.admission }), connect: value => peer.transport.connect(value), send: value => peer.transport.send(value), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
+    privateEmbedding = { authority: manual.authority, executionPolicy: manual.port, transport };
+  }
+  broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs, ...(privateEmbedding ? { privateEmbedding } : {}) });
@@ -112 +174 @@ async function start({ descriptor, port = 3457, input = process.stdin, output =
-  peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets: [{ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', operationId: manualContract.operationId, executorHash: manualAdmission.executorHash, resultProfile: 'manual-text-v1' }], timeout: PRODUCTION_TIMING.callbackTimeoutMs, port, admissionGuard, installationContext: { descriptorPath: descriptor } });
+  peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets: manualAsset ? [{ assetKey: manualAsset.assetKey, moduleId: manualAsset.moduleId, operationId: manualAsset.contract.operationId, executorHash: manualAsset.executorHash, resultProfile: 'manual-text-v1' }] : [], timeout: PRODUCTION_TIMING.callbackTimeoutMs, port, admissionGuard, installationContext: { descriptorPath: descriptor } });
@@ -115 +177,2 @@ async function start({ descriptor, port = 3457, input = process.stdin, output =
-  facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.0.0', installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: peer.status(), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual.policyId, resourceProvider: provider.status(), externalLegacyCoverage: 'unobserved' });
+  const physical = () => { const value = peer.status(); return { ...value, inspectionAvailable: !broker.closed && !broker.stateLock.error && !broker.ledger.corrupt && !broker.ledger.unresolved().length && value.peer.connected && !value.storeClosed && !value.storeFault && !value.pending }; };
+  facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.0.0', composition: selected.composition.id, installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: physical(), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual?.policyId || null, resourceProvider: provider ? provider.status() : null, ...(manual ? {} : { mutationAvailable: false }), externalLegacyCoverage: 'unobserved' });
@@ -117 +180 @@ async function start({ descriptor, port = 3457, input = process.stdin, output =
-  facade.connect = async () => ({ ...await broker.connect(), automaticLifecycle: 'unavailable', physical: peer.status() });
+  facade.connect = async () => ({ ...(manual ? await broker.connect() : { available: physical().inspectionAvailable, reason: physical().inspectionAvailable ? null : 'physical_inspection_unavailable', mutationAvailable: false }), automaticLifecycle: 'unavailable', physical: physical() });
@@ -139 +202 @@ async function start({ descriptor, port = 3457, input = process.stdin, output =
-module.exports = { start, verifyInstallation, verifyRelease, verifyCep, PRODUCTION_TIMING };
+module.exports = { start, verifyInstallation, verifyRelease, verifyCep, deriveComposition, registrySource, installationConfig, PRODUCTION_TIMING };
diff --git a/core4/test/exact-f548-transition.test.js b/core4/test/exact-f548-transition.test.js
new file mode 100644
index 0000000..863caac
--- /dev/null
+++ b/core4/test/exact-f548-transition.test.js
@@ -0,0 +1,5 @@
+'use strict';
+const test = require('node:test');
+test('exact-f548-transition code artifact to readonly with fresh synthetic state', { timeout: 30000 }, async () => {
+  console.log(JSON.stringify(await require('./fixtures/exact-f548-transition').exactTransition()));
+});
diff --git a/core4/test/fixtures/exact-f548-transition.js b/core4/test/fixtures/exact-f548-transition.js
new file mode 100644
index 0000000..855baf0
--- /dev/null
+++ b/core4/test/fixtures/exact-f548-transition.js
@@ -0,0 +1,15 @@
+'use strict';
+// Explicit historical CODE artifact only. All credentials/state are fresh temp data.
+const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
+const { hash } = require('../../protocol/json');
+const file = path.resolve(__dirname, '../../..', 'dist/core4/4.0.0-panel-reconnect-f54863dbb69b/core4-4.0.0.json');
+async function exactTransition() {
+  const bytes = fs.readFileSync(file), pkg = JSON.parse(bytes);
+  assert.equal(bytes.length, 343626); assert.equal(hash(bytes), 'dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8');
+  assert.equal(pkg.packageHash, 'f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90'); assert.equal(hash(pkg.release), pkg.packageHash);
+  require('../../tools/package-installable').verifyPackage(pkg);
+  const result = await require('./installed-composition-transition').transition(pkg);
+  return { evidence: 'exact-historical-code/temp-synthetic-state', artifact: file, artifactBytes: bytes.length, artifactSha256: hash(bytes), ...result };
+}
+if (require.main === module) exactTransition().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.code || error.stack); process.exitCode = 1; });
+module.exports = { exactTransition };
diff --git a/core4/test/fixtures/fixed-format1-package.js b/core4/test/fixtures/fixed-format1-package.js
new file mode 100644
index 0000000..7fce478
--- /dev/null
+++ b/core4/test/fixtures/fixed-format1-package.js
@@ -0,0 +1,17 @@
+'use strict';
+// Portable semantic legacy fixture, NOT the byte-identical historical f548 build.
+// Current reviewed code bytes retain the fixed format1 two-asset CEP contract.
+const { buildPackage, verifyPackage } = require('../../tools/package-installable');
+const { hash, canonical } = require('../../protocol/json');
+function fixedFormat1Package() {
+  const pkg = structuredClone(buildPackage());
+  delete pkg.files['runtime/composition.json']; delete pkg.release.hashes['runtime/composition.json']; pkg.release.format = 1;
+  const add = (file, value) => { const bytes = typeof value === 'string' ? value : canonical(value); pkg.files[file] = Buffer.from(bytes).toString('base64'); pkg.release.hashes[file] = hash(bytes); };
+  add('runtime/profiles.json', { profiles: [{ id: 'project-inspection', path: 'modules/project-inspection', executionPolicy: 'read-only-current-observation-v1' }] });
+  add('runtime/source-package.json', { version: 1, files: Object.keys(pkg.files).sort(), artifactClosures: [] });
+  const read = file => Buffer.from(pkg.files[file], 'base64').toString();
+  const inspection = JSON.parse(read('modules/project-inspection/artifact.json')), manual = JSON.parse(read('config/admissions/titles-current-target.json'));
+  add('cep/jsx/registry.jsx', '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + read('runtime/host/json-codec.jsx') + ';var executor=' + read('modules/project-inspection/executor.jsx') + ';var manual=' + read('modules/titles-current-target/executor.jsx') + ';var assets={"project-inspection-v1":{hash:"' + inspection.executorHash + '",calls:{inspect:executor.inspect}},"titles-current-target-v1":{hash:"' + manual.executorHash + '",calls:{inspect:manual.inspect,mutate:manual.mutate,verify:manual.verify}}};return {dispatch:function(serialized){var frame=JSON.parse(serialized),a=frame&&assets[frame.assetKey],call=a&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:"inspection_failed"});}}};}());\n');
+  pkg.packageHash = hash(pkg.release); return verifyPackage(pkg);
+}
+module.exports = { fixedFormat1Package };
diff --git a/core4/test/fixtures/installed-composition-child.js b/core4/test/fixtures/installed-composition-child.js
new file mode 100644
index 0000000..9aadb5d
--- /dev/null
+++ b/core4/test/fixtures/installed-composition-child.js
@@ -0,0 +1,11 @@
+'use strict';
+// Test preload: real installed direct-main entry, ephemeral listener, cache report.
+// No runtime production flags, credentials or provider injection.
+const net = require('node:net');
+const listen = net.Server.prototype.listen;
+net.Server.prototype.listen = function (port, host, ...rest) {
+  if (port !== 3457 || host !== '127.0.0.1') throw new Error('fixture_unexpected_listener');
+  this.once('listening', () => process.send({ event: 'listening', port: this.address().port }));
+  return listen.call(this, 0, host, ...rest);
+};
+process.on('message', value => { if (value === 'cache') process.send({ event: 'cache', modules: Object.keys(require.cache) }); });
diff --git a/core4/test/fixtures/installed-composition-transition.js b/core4/test/fixtures/installed-composition-transition.js
new file mode 100644
index 0000000..acdac03
--- /dev/null
+++ b/core4/test/fixtures/installed-composition-transition.js
@@ -0,0 +1,36 @@
+'use strict';
+const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
+const { fork } = require('node:child_process');
+const { recoveryFixture } = require('./native-read-recovery');
+const { canonical, hash } = require('../../protocol/json');
+const { openCompletionStore } = require('../../integrations/cep/completion-store');
+const { createHttpPeer } = require('../../integrations/cep/http-peer');
+const { mac } = require('../../integrations/cep/peer-protocol');
+const http = require('node:http');
+async function transition(historicalPackage) {
+  const f = await recoveryFixture({ historicalPackage, selector: 'readonly' }), prefix = fs.readFileSync(f.journal);
+  const child = fork(path.join(__dirname, 'disposition-child.js'), [f.fixtureFile], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true }); let stderr = '', done;
+  child.stdout.resume(); child.stderr.on('data', b => { stderr += b; });
+  child.on('message', message => { if (message.event === 'native_read_disposition_authorization') { const { event, ...body } = message; child.send({ ...body, decision: 'approve' }); } if (message.event === 'fixture_result') done = message.value; });
+  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); assert.equal(code, 0, stderr); assert.equal(done.packageHash, f.candidate.packageHash);
+  const d = require('../../runtime/installation').verifyInstallation(f.args.descriptor), events = fs.readFileSync(f.journal).toString().trimEnd().split('\n').map(JSON.parse);
+  assert.equal(JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'runtime/composition.json'))).id, 'readonly'); assert.ok(fs.readFileSync(f.journal).subarray(0, prefix.length).equals(prefix)); assert.equal(events[2].type, 'unknown'); assert.equal(events[3].type, 'terminal-read-failure-disposition');
+  const options = { descriptorPath: f.args.descriptor, journalPrefixBytes: prefix }, reader = require('../../runtime/native-read-disposition'); assert.ok(reader.validateDisposition(events[3], options));
+  const bad = structuredClone(events[3]); bad.controlMac = '0'.repeat(64); assert.throws(() => reader.validateDisposition(bad, options));
+  const store = openCompletionStore({ directory: f.receiver, installationContext: { descriptorPath: f.args.descriptor } }); assert.equal(store.closed, false); assert.equal(store.fault, false); assert.equal(store.get(f.command.commandId).state, 'unknown'); assert.ok(store.get(f.command.commandId).terminalDisposition); assert.throws(() => store.begin(f.command, f.binding), /duplicate_command_no_replay/); store.close();
+  // A late ACK authenticates with the new panel role secret but preserves old pins.
+  const peer = createHttpPeer({ installation: d, directory: f.receiver, port: 0, asset: { assetKey: 'project-inspection-v1', executorHash: f.command.executorHash }, installationContext: { descriptorPath: f.args.descriptor } }); await peer.listen();
+  function raw(route, value) { return new Promise((resolve, reject) => { const request = http.request('http://127.0.0.1:' + peer.status().port + route, { method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => { let data = ''; response.on('data', b => { data += b; }); response.on('end', () => resolve({ status: response.statusCode, value: JSON.parse(data) })); }); request.on('error', reject); request.end(canonical(value)); }); }
+  try {
+    const challenge = (await raw('/challenge', { role: 'panel' })).value, peerId = 'transition-fixture'; assert.equal((await raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, d.panelToken) })).status, 200);
+    const payload = { commandId: f.command.commandId, originalBinding: f.binding, pins: f.pins, result: { readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' } };
+    const before = fs.readFileSync(f.journal);
+    for (let sequence = 1; sequence <= 2; sequence++) { const body = { epoch: challenge.epoch, peerId, sequence, method: 'POST', path: '/complete', payload }, response = await raw('/complete', { body, mac: mac(body, d.panelToken) }); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, d.panelToken)); }
+    assert.ok(before.equals(fs.readFileSync(f.journal)));
+  } finally { await peer.close(); }
+  const prior = fs.readFileSync(f.journal).toString().trimEnd().split('\n').map(JSON.parse), command = { ...f.command, commandId: 'additional-unknown' }, binding = require('../../protocol/dispatch').dispatchBinding(command, f.binding.receiverStoreIdentity); let tail = prior.at(-1);
+  for (const entry of [{ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding: binding }, { type: 'unknown', commandId: command.commandId }]) { const body = { ...entry, seq: tail.seq + 1, previousHash: tail.recordHash }; tail = { ...body, recordHash: hash(body) }; fs.appendFileSync(f.journal, canonical(tail) + '\n'); }
+  const closed = openCompletionStore({ directory: f.receiver, installationContext: { descriptorPath: f.args.descriptor } }); assert.equal(closed.closed, true); assert.equal(closed.fault, false); assert.ok(closed.get(f.command.commandId).terminalDisposition); closed.close(); assert.ok(fs.existsSync(f.owner));
+  return { historicalPackageHash: f.pkg.packageHash, candidatePackageHash: f.candidate.packageHash, historicalFormat: f.pkg.release.format, candidateFormat: f.candidate.release.format, signedDisposition: true, originalUnknownPreserved: true, duplicateNoReplay: true, lateAckCount: 2, additionalUnknownClosesStore: true, nativeCalls: 0, productionCalls: 0 };
+}
+module.exports = { transition };
diff --git a/core4/test/fixtures/native-read-recovery.js b/core4/test/fixtures/native-read-recovery.js
index 63872b0..54b6d7e 100644
--- a/core4/test/fixtures/native-read-recovery.js
+++ b/core4/test/fixtures/native-read-recovery.js
@@ -8 +8 @@ const {buildOperatorPackage,writeOperatorPackage}=require('../../tools/package-n
-function fixture() {
+function fixture({ historicalPackage } = {}) {
@@ -10 +10 @@ function fixture() {
-  const pkg = buildPackage(), config = path.join(directory, 'project/.codex/config.toml');
+  const pkg = historicalPackage || require('./fixed-format1-package').fixedFormat1Package(), config = path.join(directory, 'project/.codex/config.toml');
@@ -46,2 +46,2 @@ function mac(value,secret){return crypto.createHmac('sha256',secret).update(cano
-async function recoveryFixture(){
-  const f=fixture(),producerDriver=path.join(__dirname,'manual-capture-driver-source.txt'),inspection=path.join(f.evidenceRoot,'capture-inspection.json'),initial=await createCapture(f.probes).inspect(f.args);fs.writeFileSync(inspection,JSON.stringify({at:new Date().toISOString(),...initial},null,2)+'\n');
+async function recoveryFixture(options = {}){
+  const f=fixture(options),producerDriver=path.join(__dirname,'manual-capture-driver-source.txt'),inspection=path.join(f.evidenceRoot,'capture-inspection.json'),initial=await createCapture(f.probes).inspect(f.args);fs.writeFileSync(inspection,JSON.stringify({at:new Date().toISOString(),...initial},null,2)+'\n');
@@ -62 +62 @@ async function recoveryFixture(){
-  const candidate=structuredClone(buildPackage()),css=Buffer.from(candidate.files['cep/panel.css'],'base64').toString()+'\n/* recovery fixture candidate */\n';candidate.files['cep/panel.css']=Buffer.from(css).toString('base64');candidate.release.hashes['cep/panel.css']=hash(css);candidate.packageHash=hash(candidate.release);
+  const candidate=structuredClone(buildPackage(undefined, options.selector || 'manual')),css=Buffer.from(candidate.files['cep/panel.css'],'base64').toString()+'\n/* recovery fixture candidate */\n';candidate.files['cep/panel.css']=Buffer.from(css).toString('base64');candidate.release.hashes['cep/panel.css']=hash(css);candidate.packageHash=hash(candidate.release);
diff --git a/core4/test/installable-runtime.test.js b/core4/test/installable-runtime.test.js
index 8f2e958..3d32f73 100644
--- a/core4/test/installable-runtime.test.js
+++ b/core4/test/installable-runtime.test.js
@@ -163 +163 @@ function installerCliFixture() {
-  for (const relative of ['package.json', 'tools/install-core4.js', 'tools/package-installable.js', 'protocol/json.js', 'runtime/install-lease.js']) {
+  for (const relative of ['package.json', 'tools/install-core4.js', 'tools/package-installable.js', 'protocol/json.js', 'runtime/install-lease.js', 'runtime/stdio-entry.js']) {
diff --git a/core4/test/installed-composition.test.js b/core4/test/installed-composition.test.js
new file mode 100644
index 0000000..7a2fbc3
--- /dev/null
+++ b/core4/test/installed-composition.test.js
@@ -0,0 +1,124 @@
+'use strict';
+const test = require('node:test'), assert = require('node:assert/strict');
+const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), http = require('node:http');
+const { fork, spawnSync } = require('node:child_process');
+const { once } = require('node:events');
+const { hash, canonical } = require('../protocol/json');
+const { buildPackage, verifyPackage } = require('../tools/package-installable');
+const { planInstall, applyInstall } = require('../tools/install-core4');
+const { verifyInstallation, verifyRelease, verifyCep } = require('../runtime/installation');
+const { mac } = require('../integrations/cep/peer-protocol');
+const root = path.resolve(__dirname, '..');
+const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'core4-composition-'));
+test('installed-composition portable fixed-format1 transition to readonly preserves signed history and no replay', { timeout: 30000 }, async () => {
+  const result = await require('./fixtures/installed-composition-transition').transition(); assert.equal(result.historicalFormat, 1); assert.equal(result.candidateFormat, 2);
+});
+function install(pkg) {
+  const directory = temp(), args = { pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'config.toml'), machineId: os.hostname() };
+  const applied = applyInstall(planInstall(args)); return { directory, args, descriptor: applied.descriptorPath, d: verifyInstallation(applied.descriptorPath) };
+}
+function edit(pkg, file, transform) {
+  const value = JSON.parse(Buffer.from(pkg.files[file], 'base64')); transform(value); const bytes = canonical(value);
+  pkg.files[file] = Buffer.from(bytes).toString('base64'); pkg.release.hashes[file] = hash(bytes); pkg.packageHash = hash(pkg.release); return pkg;
+}
+function rpcChild(f) {
+  const child = fork(path.join(f.d.releaseDir, 'runtime/stdio-entry.js'), ['--installation', f.descriptor], { execArgv: ['--require', path.join(__dirname, 'fixtures/installed-composition-child.js')], stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true, cwd: os.tmpdir() });
+  let buffer = '', stderr = '', next = 0; const pending = new Map();
+  child.stdout.on('data', bytes => { buffer += bytes; while (buffer.includes('\n')) { const n = buffer.indexOf('\n'), value = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(value.id)?.(value); pending.delete(value.id); } });
+  child.stderr.on('data', b => { stderr += b; });
+  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.stdin.write(canonical({ jsonrpc: '2.0', id, method, params }) + '\n'); });
+  const call = async (name, payload = {}) => { const response = await rpc('tools/call', { name, arguments: { payload } }); if (response.error) throw new Error(response.error.message); return JSON.parse(response.result.content[0].text); };
+  const message = event => new Promise(resolve => { const handler = value => { if (value.event === event) { child.off('message', handler); resolve(value); } }; child.on('message', handler); });
+  return { child, rpc, call, message, async close() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; assert.equal(stderr, ''); } };
+}
+function raw(port, route, value) { return new Promise((resolve, reject) => { const request = http.request('http://127.0.0.1:' + port + route, { method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => { let bytes = ''; response.on('data', b => { bytes += b; }); response.on('end', () => resolve({ status: response.statusCode, value: JSON.parse(bytes) })); }); request.on('error', reject); request.end(canonical(value)); }); }
+async function panel(port, d) {
+  const challenge = (await raw(port, '/challenge', { role: 'panel' })).value, peerId = 'composition-fixture';
+  const linked = await raw(port, '/link', { challenge, peerId, proof: mac({ challenge, peerId }, d.panelToken) }); assert.equal(linked.status, 200); let sequence = 0;
+  return async (route, payload) => { const body = { epoch: challenge.epoch, peerId, sequence: ++sequence, method: 'POST', path: route, payload }; const response = await raw(port, route, { body, mac: mac(body, d.panelToken) }); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, d.panelToken)); return response.value.body.payload; };
+}
+test('installed-composition deterministic packages, fixed ES3 registries, admission pins and physical closure', () => {
+  for (const selector of ['manual', 'readonly']) {
+    const pkg = buildPackage(root, selector); assert.equal(pkg.packageHash, buildPackage(root, selector).packageHash); assert.equal(verifyPackage(pkg), pkg); assert.equal(pkg.release.format, 2);
+    const composition = JSON.parse(Buffer.from(pkg.files['runtime/composition.json'], 'base64'));
+    assert.equal(composition.id, selector); assert.equal(composition.engine === null, selector === 'readonly');
+    if (selector === 'readonly') assert.ok(Object.keys(pkg.files).every(file => !/^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file)));
+    const source = Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString();
+    const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});console.log('ES3 PASS');";
+    const parsed = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: source, encoding: 'utf8', windowsHide: true }); assert.equal(parsed.status, 0, parsed.stderr);
+    const context = vm.createContext({ JSON: undefined, Object, Error }); vm.runInContext(source, context);
+    for (const phase of ['constructor', 'toString', '__proto__']) assert.throws(() => vm.runInContext('AECore4Host.dispatch(' + JSON.stringify(canonical({ assetKey: composition.assets[0].assetKey, phase, pins: { executorHash: JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64')).executorHash } })) + ')', context), /fixed_asset_binding/);
+  }
+  assert.equal(buildPackage().packageHash, buildPackage(root, 'manual').packageHash); assert.throws(() => buildPackage(root, 'other'), /composition_selector/);
+});
+test('installed-composition build CLI selects readonly/manual and rejects ambiguous options without output', () => {
+  const directory = temp(), cli = path.join(root, 'tools/package-installable.js');
+  for (const selector of ['readonly', 'manual', null]) {
+    const file = path.join(directory, (selector || 'default') + '.json'), args = ['--output', file, ...(selector ? ['--composition', selector] : [])];
+    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(fs.readFileSync(file)).packageHash, buildPackage(root, selector || 'manual').packageHash);
+  }
+  let index = 0;
+  for (const options of [['--composition', ''], ['--composition', 'other'], ['--composition', 'readonly', '--composition', 'manual'], ['--unknown', 'readonly'], ['--composition'], ['--output', 'relative.json']]) {
+    const file = path.join(directory, 'denied-' + index++ + '.json'), result = spawnSync(process.execPath, [cli, '--output', file, ...options], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 1); assert.equal(fs.existsSync(file), false);
+  }
+});
+test('installed-composition unknown/missing/corrupt/duplicate/path/phase/catalog/admission/downgrade failures', () => {
+  const make = () => structuredClone(buildPackage());
+  const mutations = [
+    p => { p.release.format = 99; p.packageHash = hash(p.release); },
+    p => { delete p.files['runtime/composition.json']; delete p.release.hashes['runtime/composition.json']; p.packageHash = hash(p.release); },
+    p => { p.files['runtime/composition.json'] = Buffer.from('{}').toString('base64'); },
+    p => edit(p, 'runtime/composition.json', c => { c.version = 2; }),
+    p => edit(p, 'runtime/composition.json', c => { c.extra = true; }),
+    p => edit(p, 'runtime/composition.json', c => { c.assets.push(c.assets[0]); }),
+    p => edit(p, 'runtime/composition.json', c => { c.modules.push(c.modules[0]); }),
+    p => edit(p, 'runtime/composition.json', c => { c.assets[0].path = '../outside'; }),
+    p => edit(p, 'runtime/composition.json', c => { c.assets[0].phases = ['mutate']; }),
+    p => edit(p, 'runtime/composition.json', c => { c.assets[0].policy = 'other'; }),
+    p => edit(p, 'config/catalog.json', c => { c.modules.pop(); }),
+    p => edit(p, 'config/admissions/titles-current-target.json', c => { c.revoked = true; }),
+    p => edit(p, 'config/admissions/titles-current-target.json', c => { c.executorHash = '0'.repeat(64); }),
+    p => { p.release.format = 1; p.packageHash = hash(p.release); },
+    p => { p.release.format = 1; delete p.files['runtime/composition.json']; delete p.release.hashes['runtime/composition.json']; p.packageHash = hash(p.release); }
+  ];
+  for (const mutate of mutations) { const pkg = make(); mutate(pkg); assert.throws(() => verifyPackage(pkg)); }
+  const readonly = buildPackage(root, 'readonly'); edit(readonly, 'config/catalog.json', c => { c.engine = { path: 'plan-engine', artifactHash: '0'.repeat(64) }; }); assert.throws(() => verifyPackage(readonly), /composition_catalog/);
+});
+test('installed-composition installed readonly child initialize/status/discovery/contract and native fake VM inspection', { timeout: 15000 }, async () => {
+  const pkg = buildPackage(root, 'readonly'), f = install(pkg), h = rpcChild(f); let nativeCalls = 0;
+  try {
+    const listening = await h.message('listening'); assert.notEqual(listening.port, 3457);
+    assert.equal((await h.rpc('initialize')).result.serverInfo.name, 'ae-agent-core4');
+    let status = await h.call('core_status'); assert.equal(status.composition, 'readonly'); assert.equal(status.manualPolicy, null); assert.equal(status.resourceProvider, null); assert.equal(status.mutationAvailable, false); assert.equal(status.physical.inspectionAvailable, false); assert.equal(status.automaticLifecycle, 'unavailable');
+    assert.deepEqual((await h.call('list_modules')).modules.map(m => m.id), ['project-inspection']);
+    const contract = await h.call('get_module_contract', { moduleId: 'project-inspection' }); assert.equal(contract.contract.buildSupported, false);
+    await assert.rejects(h.call('get_module_contract', { moduleId: 'titles' }), /module_unavailable/);
+    await assert.rejects(h.call('build_solution_plan', { contractId: contract.contractId }), /read_only_module_build_unsupported/);
+    const call = await panel(listening.port, f.d);
+    status = await h.call('core_status'); assert.equal(status.physical.inspectionAvailable, true); assert.equal(status.connection, 'unavailable');
+    const connected = await h.call('core_connect'); assert.equal(connected.available, true); assert.equal(connected.mutationAvailable, false);
+    function CompItem() { this.id = 7; this.name = 'Synthetic comp'; this.numLayers = 0; this.duration = 5; }
+    const comp = new CompItem(), context = vm.createContext({ JSON: undefined, Math, Error, CompItem, app: { version: 'synthetic', project: { file: null, numItems: 1, item: () => comp } } });
+    vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
+    const pending = h.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
+    const polled = await call('/poll', {}); assert.ok(polled.command); nativeCalls++;
+    const result = JSON.parse(vm.runInContext('AECore4Host.dispatch(' + JSON.stringify(canonical(polled.command)) + ')', context)); assert.equal(result.readFailureVersion, undefined);
+    await call('/complete', { commandId: polled.command.commandId, originalBinding: polled.command.originalBinding, pins: polled.command.pins, result });
+    assert.equal((await pending).authority, false); assert.equal(nativeCalls, 1);
+    const cacheReply = h.message('cache'); h.child.send('cache'); const loaded = (await cacheReply).modules;
+    assert.ok(loaded.every(file => !/[\\/](manual-policy|windows-reservation-provider)\.js$|[\\/]plan-engine[\\/]|[\\/]modules[\\/](titles|photo-placeholder)/.test(file)));
+  } finally { await h.close(); }
+});
+test('installed-composition actual manual installed child retains module discovery and manual gated policy', { timeout: 15000 }, async () => {
+  const f = install(buildPackage()), h = rpcChild(f);
+  try { await h.message('listening'); const status = await h.call('core_status'); assert.equal(status.composition, 'manual'); assert.equal(status.manualPolicy, 'current-matching-target-after-local-confirmation-v1'); assert.ok(status.resourceProvider); assert.equal(status.automaticLifecycle, 'unavailable'); assert.deepEqual((await h.call('list_modules')).modules.map(m => m.id), ['photo-placeholder', 'titles', 'titles-current-target', 'project-inspection']); assert.equal((await h.call('get_module_contract', { moduleId: 'titles-current-target' })).operationId, 'set-current-text'); }
+  finally { await h.close(); }
+});
+test('installed-composition installed format2 corruption/missing composition rejects before imports and legacy format1 generic verification stays generic', () => {
+  const f = install(buildPackage(root, 'readonly')), composition = path.join(f.d.releaseDir, 'runtime/composition.json'), bytes = fs.readFileSync(composition);
+  const rejectedChild = pattern => { const result = spawnSync(process.execPath, [path.join(f.d.releaseDir, 'runtime/stdio-entry.js'), '--installation', f.descriptor], { input: '', encoding: 'utf8', timeout: 5000, windowsHide: true }); assert.equal(result.status, 1); assert.match(result.stderr, pattern); assert.equal(result.stdout, ''); };
+  fs.writeFileSync(composition, '{}'); assert.throws(() => verifyInstallation(f.descriptor), /installed_release_bytes/); rejectedChild(/installed_release_bytes/); fs.writeFileSync(composition, bytes);
+  fs.renameSync(composition, composition + '.missing'); assert.throws(() => verifyInstallation(f.descriptor), /release_tree_mismatch/); rejectedChild(/release_tree_mismatch/); fs.renameSync(composition + '.missing', composition);
+  const dir = temp(), source = 'historical generic release'; fs.writeFileSync(path.join(dir, 'data'), source); const release = { version: '4.0.0', format: 1, hashes: { data: hash(source) } }; fs.writeFileSync(path.join(dir, 'release.json'), canonical(release)); assert.doesNotThrow(() => verifyRelease(dir, release));
+  assert.throws(() => verifyCep(f.d, { ...JSON.parse(fs.readFileSync(path.join(f.d.releaseDir, 'release.json'))), format: 99 }, f.d.cepDir));
+});
diff --git a/core4/tools/check-boundaries.js b/core4/tools/check-boundaries.js
index 8a29562..bd70c5f 100644
--- a/core4/tools/check-boundaries.js
+++ b/core4/tools/check-boundaries.js
@@ -24,0 +25,10 @@ function checkBoundaries(root = path.resolve(__dirname, '..')) {
+  for (const file of files(path.join(root, 'runtime')).filter(f => f.endsWith('.js'))) {
+    const source = fs.readFileSync(file, 'utf8');
+    if (/require\s*\(\s*[^'"\s]/.test(source) || /require\s*\(\s*['"][^'"]*(?:bridge-daemon|modules\/|plan-engine\/|core-tool-dispatch)/.test(source)) fail('runtime_domain_import', file);
+    if (path.basename(file) === 'stdio-entry.js') {
+      const prefix = source.slice(0, source.indexOf('async function start('));
+      for (const match of prefix.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!match[1].startsWith('node:')) fail('unverified_entry_import', file);
+      if (!source.includes('if (manualAsset) {') || source.indexOf("require('./manual-policy.js')") < source.indexOf('if (manualAsset) {') || source.indexOf("require('./windows-reservation-provider.js')") < source.indexOf('if (manualAsset) {')) fail('runtime_optional_policy_import', file);
+    }
+    checked++;
+  }
diff --git a/core4/tools/install-core4.js b/core4/tools/install-core4.js
index 974d7a6..5ff0580 100644
--- a/core4/tools/install-core4.js
+++ b/core4/tools/install-core4.js
@@ -7,0 +8 @@ const { verifyPackage } = require('./package-installable');
+const { deriveComposition, installationConfig } = require('../runtime/stdio-entry.js');
@@ -112,2 +113 @@ function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, ma
-  const inspection = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64'));
-  const manualAdmission = JSON.parse(Buffer.from(pkg.files['config/admissions/titles-current-target.json'], 'base64'));
+  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
@@ -115 +115 @@ function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, ma
-  cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical({ installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: inspection.executorHash, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manualAdmission.executorHash, phases: ['inspect', 'mutate', 'verify'] }] }) + ';\n').toString('base64');
+  cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical(installationConfig(d, selected)) + ';\n').toString('base64');
diff --git a/core4/tools/package-installable.js b/core4/tools/package-installable.js
index 1296fe3..a665db9 100644
--- a/core4/tools/package-installable.js
+++ b/core4/tools/package-installable.js
@@ -5 +5,3 @@ const { hash, canonical, fail } = require('../protocol/json');
-function buildPackage(root = path.resolve(__dirname, '..')) {
+const { deriveComposition, registrySource } = require('../runtime/stdio-entry.js');
+function buildPackage(root = path.resolve(__dirname, '..'), selector = 'manual') {
+  if (!['readonly', 'manual'].includes(selector)) fail('composition_selector');
@@ -7,2 +9,3 @@ function buildPackage(root = path.resolve(__dirname, '..')) {
-  const paths = new Set(spec.files);
-  for (const relative of spec.artifactClosures) {
+  const optional = selector === 'manual' ? spec.optional.manual : { files: [], artifactClosures: [] };
+  const paths = new Set([...spec.files, ...optional.files]);
+  for (const relative of [...spec.artifactClosures, ...optional.artifactClosures]) {
@@ -23,9 +26,11 @@ function buildPackage(root = path.resolve(__dirname, '..')) {
-  const release = { version: '4.0.0', format: 1, hashes };
-  const inspection = JSON.parse(Buffer.from(files['modules/project-inspection/artifact.json'], 'base64'));
-  const source = Buffer.from(files['modules/project-inspection/executor.jsx'], 'base64').toString('utf8');
-  const manual = JSON.parse(Buffer.from(files['config/admissions/titles-current-target.json'], 'base64'));
-  const manualSource = Buffer.from(files['modules/titles-current-target/executor.jsx'], 'base64').toString('utf8');
-  const codecSource = Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8');
-  const registry = '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';var executor=' + source + ';var manual=' + manualSource + ';var assets={"project-inspection-v1":{hash:"' + inspection.executorHash + '",calls:{inspect:executor.inspect}},"titles-current-target-v1":{hash:"' + manual.executorHash + '",calls:{inspect:manual.inspect,mutate:manual.mutate,verify:manual.verify}}};return {dispatch:function(serialized){var frame=JSON.parse(serialized),a=frame&&assets[frame.assetKey],call=a&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:"inspection_failed"});}}};}());\n';
-  files['cep/jsx/registry.jsx'] = Buffer.from(registry).toString('base64'); hashes['cep/jsx/registry.jsx'] = hash(registry);
-  return { packageHash: hash(release), release, files };
+  const release = { version: '4.0.0', format: 2, hashes };
+  const original = JSON.parse(fs.readFileSync(path.join(root, 'config/catalog.json'), 'utf8'));
+  const { modules, assets } = spec.compositions[selector];
+  if (modules.some(id => original.modules.filter(m => m.id === id).length !== 1)) fail('composition_catalog');
+  const catalog = { catalogRevision: original.catalogRevision, modules: modules.map(id => original.modules.find(m => m.id === id)), engine: selector === 'manual' ? original.engine : null };
+  const composition = { version: 1, id: selector, modules, engine: catalog.engine, assets };
+  const add = (file, source) => { const bytes = typeof source === 'string' ? source : canonical(source); files[file] = Buffer.from(bytes).toString('base64'); hashes[file] = hash(bytes); };
+  add('config/catalog.json', catalog); add('runtime/composition.json', composition);
+  const selected = deriveComposition(release, file => Buffer.from(files[file], 'base64'));
+  add('cep/jsx/registry.jsx', registrySource(selected.assets, Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8')));
+  return verifyPackage({ packageHash: hash(release), release, files });
@@ -37,0 +43,2 @@ function verifyPackage(pkg) {
+  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
+  if (!selected.legacy && Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8') !== registrySource(selected.assets, Buffer.from(pkg.files['runtime/host/json-codec.jsx'], 'base64').toString('utf8'))) fail('composition_registry');
@@ -41 +48,6 @@ if (require.main === module) {
-  try { const args = process.argv.slice(2); if (args.length !== 2 || args[0] !== '--output' || !path.isAbsolute(args[1])) fail('absolute_output_required'); const pkg = buildPackage(); fs.writeFileSync(args[1], canonical(pkg), { flag: 'wx' }); console.log(JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).length, output: args[1] })); } catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
+  try {
+    const args = process.argv.slice(2), options = {};
+    for (let n = 0; n < args.length; n += 2) { const key = args[n]; if (!['--output', '--composition'].includes(key) || Object.hasOwn(options, key) || typeof args[n + 1] !== 'string' || args[n + 1].startsWith('--')) fail('package_options'); options[key] = args[n + 1]; }
+    if (!options['--output'] || !path.isAbsolute(options['--output'])) fail('absolute_output_required');
+    const pkg = buildPackage(undefined, options['--composition'] ?? 'manual'); fs.writeFileSync(options['--output'], canonical(pkg), { flag: 'wx' }); console.log(JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).length, composition: options['--composition'] ?? 'manual', output: options['--output'] }));
+  } catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
diff --git a/docs/core-installed-composition.md b/docs/core-installed-composition.md
new file mode 100644
index 0000000..5e7e825
--- /dev/null
+++ b/docs/core-installed-composition.md
@@ -0,0 +1,48 @@
+# Устанавливаемые составы Core
+
+Начиная с этого среза package release имеет `format:2` и обязательный
+`runtime/composition.json`, включённый в manifest hashes. Версия installation
+descriptor остаётся 2; это другой контракт, чем format пакета.
+
+Доступны два состава, выбираемые при сборке:
+
+- `readonly`: Core, CEP и bounded `project-inspection`. Рабочие модули,
+  их admissions, plan-engine, manual-policy и Windows reservation provider
+  физически отсутствуют. Broker не получает authority; доступность inspection
+  отдельно отражается в physical status. Automatic lifecycle отсутствует.
+- `manual` — default: прежние рабочие пакеты и engine, inspection и existing
+  current-target adapter. Наличие adapter/контракта не выдаёт mutation grant:
+  сохраняются proposal/dry-run, fresh native confirmation, ownership,
+  checkpoint, read-back и UNKNOWN/no-replay.
+
+Из корня репозитория в PowerShell:
+
+```powershell
+node core4/tools/package-installable.js --composition readonly --output (Join-Path $env:TEMP 'core4-readonly.json')
+node core4/tools/package-installable.js --composition manual --output (Join-Path $env:TEMP 'core4-manual.json')
+```
+
+`--output` требует абсолютный новый путь; существующий файл не перезаписывается.
+Без `--composition` собирается manual. Эти команды создают пакет, не запускают
+MCP, CEP или AE. Установка использует прежний installer с точным reviewed
+packageHash и проверками текущего runtime/state.
+
+Состав задаёт modules/catalog, engine и selected assets. Доступны только
+существующие reviewed policy adapters; произвольные имена policy или source в
+runtime frames не принимаются. Pins выводятся из проверенных artifact/admission
+bytes. Registry собирается детерминированно из выбранных executor bytes и
+проверяется вместе с полным release tree до imports runtime.
+
+Старый `format:1` сохраняет fixed контракт своей CEP-конфигурации. Новый
+verifier использует format именно проверяемого release, включая historical
+install preflight; состав кандидата не заменяет контракт старого f548.
+Для format2 отсутствие composition/hash, подмена registry, несовпадение
+catalog/admission и неизвестный формат означают отказ, без if-exists fallback.
+Signed history, original UNKNOWN и disposition не переписываются при смене
+состава.
+
+Этот этап создаёт два устанавливаемых состава. Независимая установка/горячая
+замена произвольных рабочих пакетов остаётся последующей работой; она не
+заявляется по наличию build-time selector. Temp/VM proof не является live AE
+приёмкой. Production installation и переносимость двух машин подтверждаются
+отдельно. Текущий [план и evidence](../plans/core-installed-composition-20261029.md).
diff --git a/plans/core-4.0.0-installable.md b/plans/core-4.0.0-installable.md
index e6860d0..e749105 100644
--- a/plans/core-4.0.0-installable.md
+++ b/plans/core-4.0.0-installable.md
@@ -6,0 +7,7 @@
+**Текущий source-блок:** [декларативная устанавливаемая композиция](core-installed-composition-20261029.md).
+Цель — отдельный read-only состав без рабочих modules/engine и сохранение
+manual состава с теми же gates; release-specific verifyCep покрывает fixed f548.
+Configured tools текущего чата доступны. Native inspection/install пока не
+выполняются: receiver storeClosed=true, stale marker требует отдельного
+обслуживания с проверкой владельца и истории, без replay. Installed f548 сохранён.
+
diff --git a/plans/core-4.0.0.md b/plans/core-4.0.0.md
index fa6eea5..e87e04f 100644
--- a/plans/core-4.0.0.md
+++ b/plans/core-4.0.0.md
@@ -2,0 +3,8 @@
+**Текущий source-блок, 29 октября 2026:**
+[декларативная устанавливаемая композиция](core-installed-composition-20261029.md).
+Configured Core4 tools доступны; status/discovery/contract прочитаны в текущем
+чате. Installed f548 пока не меняется: receiver store закрыт, marker старше
+нынешнего MCP, pending/unresolved пусты, историческая UNKNOWN имеет disposition.
+Native read при закрытом store не отправляется. Следующие записи сохраняют
+историю завершённого аудита и прежних установок.
+
diff --git a/plans/core-installed-composition-20261029.md b/plans/core-installed-composition-20261029.md
new file mode 100644
index 0000000..f292ddd
--- /dev/null
+++ b/plans/core-installed-composition-20261029.md
@@ -0,0 +1,114 @@
+# Декларативная устанавливаемая композиция Core
+
+29 октября 2026. Baseline `1eea17d`; продолжение завершённого
+[аудита](core-post-reinstall-audit-20261029.md). Цель — устанавливаемый read-only
+Core без обязательных рабочих пакетов и plan engine, при сохранении текущего
+manual состава и исторической проверки установок.
+
+## Scope
+
+Source/runtime/package/installer и адресные temp-only проверки. Root —
+единственный live controller; архитектурный помощник завершил read-only разбор,
+одному implementer передан ownership `core4/**`; root ведёт планы/evidence/review.
+Изменения production state, owner markers, AE/AEP и повтор прежних команд в
+этот source-блок не входят. Полная release-проверка и приёмка второй машины
+не выполняются.
+
+## Progress
+
+- [x] Прочитаны актуальные планы, scoped инструкции и история коммитов.
+- [x] Configured tools Core4 доступны: status, diagnostics, discovery и contract
+  прочитаны через MCP текущего чата. Installed package остаётся f548.
+- [x] Зафиксирован live blocker: CEP disconnected, receiver storeClosed=true,
+  unknown=true, pending=null, storeFault=false, unresolved=[]; PID25840.
+  Журнал содержит восемь событий: исходная UNKNOWN с terminal disposition и
+  два complete. Marker receiver создан 09:09:53UTC, текущий MCP — 11:08:28UTC.
+  Это признаки оставшегося marker, а не разрешение его удалить.
+- [x] Определить минимальный release-specific контракт композиции.
+- [x] Новый source verifier проверил actual installed f548 и exact retained
+  f548 package; descriptor/journal bytes не изменились, native/install0.
+- [x] Убрать обязательные imports/closures/admissions manual titles и engine
+  из read-only состава, сохранив server-owned admission и fixed registry.
+- [x] Проверить standalone read-only install/start/discovery и переход с fixed
+  f548 с сохранением signed disposition, original UNKNOWN и no-replay.
+- [x] Выполнить адресные проверки, собрать детерминированные candidates;
+  независимое source review ACCEPT, найденный CLI P2 исправлен локально.
+- [ ] Зафиксировать source milestone, получить одно ограниченное Argon review
+  результата и разобрать findings локально без повторного review.
+
+## Decision Log
+
+- `unknown` в текущем HTTP status означает закрытый store; одного этого Boolean
+  недостаточно для вывода о незавершённом native исполнении. Native inspection
+  не отправляется при закрытом store. Новый runtime не запускается.
+- Старый adopted host PID31452 отличается от фактического AE PID18992.
+  Старые resource bindings не принимаются как текущая incarnation.
+- Ожидаемые CEP bytes определяются контрактом именно проверяемого release:
+  current verifier обязан понимать fixed f548 в historical install path.
+  Отсутствующий новый manifest не превращается в разрешённый legacy fallback.
+- Hash/manifest сам по себе не выдаёт admission или mutation authority.
+  Рабочие пакеты остаются optional, automatic lifecycle unavailable.
+- Новый release `format:2` требует hashed `runtime/composition.json`; `format:1`
+  проверяется по прежнему fixed контракту двух assets. Выбор формата не зависит
+  от наличия файла. До полного release verification и entry-root binding
+  stdio-entry импортирует только builtins; исторический entry не исполняется.
+- `readonly` и `manual` выбираются при сборке; default остаётся manual.
+  Readonly package физически исключает рабочие modules/admissions, plan-engine,
+  manual-policy и windows-reservation-provider. Broker работает без authority,
+  facade inspection сохраняет прежние owner/ledger/unresolved guards.
+- Selected assets получают pins из проверенных artifact/admission bytes;
+  policy adapters ограничены двумя существующими контрактами. Unknown/duplicate
+  assets, catalog mismatch, отсутствующий manifest и downgrade отвергаются.
+- Portable fixed-format1 fixture и temp proof с exact retained f548 package —
+  разные доказательства. В обоих случаях credentials/state создаются заново;
+  production journal и ключи не копируются. Старые MAC/seals не переписываются.
+- Source review первоначальных пяти файлов — ACCEPT. Tiny CLI review обнаружил
+  пустой selector, превращавшийся через `||` в manual; заменён на `??` и добавлен
+  negative CLI case. Это локальное review, не дополнительное обращение к Argon.
+- Выбор двух установочных presets не объявляется независимой горячей установкой
+  любых рабочих пакетов. Этот последующий пункт intent остаётся открытым.
+
+## Validation
+
+Пока только read-only preflight текущей установки: configured MCP metadata,
+discovery/contract; descriptor SHA256
+`67202b2e5e75e462eb3631757e035f512a86dc5f78db6af1b17355e84ea4419e`;
+receiver journal SHA256
+`0354eb5e308336776e85963efb5c940534fb3c2b94ea2d7b53feb9e69e21fb7f`.
+Actual AE commands0, install0, state mutations0.
+
+`snapshots/core4-live-proof/XVIII-installed-composition-20261029/`:
+`configured-preflight.json` — ответ configured status с реальным покрытием;
+`root-legacy-verification.json` — новый verifier против installed format1,
+retained packageHash f548 совпал, 60 package files, descriptor/journal unchanged.
+Это read-only совместимость verifier; фактический переход на format2 ещё не принят.
+
+### Source/temp milestone
+
+- `implementation/scoped-final.log`: exit0, **73/73 PASS** — recovery19,
+  installable23, composition7, manual12, human-window3, routing/boundaries9.
+  Runtime bytes окончательные; packager CLI имел hash `f33a4bf…` до исправления
+  empty selector. После CLI/test/routing delta этот прогон не переименовывается
+  в единый final-closure PASS.
+- `implementation/composition-cli-final.log`: final CLI, **7+1 PASS** в двух
+  отдельных suites (composition и exact f548). `routing-final.log`:5PASS.
+  `boundaries-final.log`:28unitsPASS; `diff-check-final.log`:exit0.
+- Portable format1 fixture и exact f548 artifact проверены раздельно. Последний:
+  343626bytes, SHA256 `dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8`.
+  Temp transition сохраняет signed disposition/original UNKNOWN/no-replay;
+  два late ACK не меняют journal, дополнительная UNKNOWN закрывает lane.
+  Исходный ENOENT test harness сохранён; исправлен только относительный путь.
+- Новый runtime реально запущен в temp installed child: stdio discovery/contract,
+  ephemeral HTTP и одна native fake VM inspection. Это **не live AE**.
+- Root независимо пересобрал пакеты дважды и сверил каждый file/manifest hash:
+  readonly40files — `c14436485c1889e2ff98b0582bded0cff5e96c03be6c448d69ca15202d2578f4`;
+  manual59files — `e945f12b5ac42cf1fb945b5db92f1fd537210c743fd09e952f283c8754b91af0`.
+  `coreIdentity` прежний: `c70a07d36c5db55cd9e4683729c52bc3f9d381503bcd83e1d3d67b21b93c9fb7`.
+- В `dist/core4/4.0.0-composition-{readonly-c14436485c18,manual-e945f12b5ac4}/`
+  сохранены immutable package/distribution и standalone installer closure6.
+  Root dry-run обоих exact distributions в temp workspace/env PASS, installRoot
+  и config не созданы. Evidence: `root-packages.json`,
+  `root-distribution-dry-run.json`, `implementation/implementation-summary.json`.
+
+Production остаётся f548; actual install/native0. Release certification,
+manual AE mutation, automatic lifecycle и round-trip P1–P8 не подтверждаются.

````

## evidence.json

````text
{
  "baseCommit": "1eea17de7d9378b2d9e663675bfb5999e125b90f",
  "targetCommit": "ed747efceb47c43c0b185d09262d9ba72f7a0a9f",
  "validation": [
    {
      "log": "scoped-final.log",
      "exit": 0,
      "checks": {
        "native-read-recovery": 19,
        "installable-runtime": 23,
        "installed-composition": 7,
        "manual-runtime": 12,
        "human-window": 3,
        "validation-routing/artifact-boundaries": 9
      },
      "totalPass": 73,
      "packagerSha256": "f33a4bf2225e99c75ebb1e6a872d17eb4e4d45de602d4be609cf307b8643094e",
      "note": "Before CLI empty-selector fix. Runtime source final; later change only CLI nullish default and test/routing deltas."
    },
    {
      "log": "composition-cli-final.log",
      "exit": 0,
      "checks": {
        "installed-composition": 7,
        "exact-f548-transition": 1
      },
      "note": "Final CLI source; actual installed child inspection is synthetic native VM, not live AE."
    },
    {
      "log": "routing-final.log",
      "exit": 0,
      "checks": {
        "validation-routing": 5
      }
    },
    {
      "log": "boundaries-final.log",
      "exit": 0,
      "checked": 28,
      "model": "reviewed-local-code; conservative source guard; not OS sandbox"
    },
    {
      "log": "diff-check-final.log",
      "exit": 0
    }
  ],
  "logHashes": [
    {
      "file": "boundaries-final.log",
      "sha256": "d4dafcb0ab88edf56bf2df315363046b28fe85287b5feb089257176271ffcb59"
    },
    {
      "file": "boundaries.log",
      "sha256": "d4dafcb0ab88edf56bf2df315363046b28fe85287b5feb089257176271ffcb59"
    },
    {
      "file": "composition-cli-final.log",
      "sha256": "175f8267f3851723c3d8f643b2bec5a24410c9502391f81f1a034a7e809d37c2"
    },
    {
      "file": "diff-check-final.log",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "file": "diff-check.log",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "file": "exact-f548-transition-final.log",
      "sha256": "ba7f9721dd0048d160dce9695dc38c5861a4430d21a1638ad8627c06073761ca"
    },
    {
      "file": "exact-f548-transition.log",
      "sha256": "f9695faf05f66e1534d9f1c85595980b932f630345db7bd6fd6005a9967c0767"
    },
    {
      "file": "routing-final.log",
      "sha256": "e73b3e63e00ec5e769372f4b392ea8c88462514a37604dca8944d06e7d1acf21"
    },
    {
      "file": "scoped-final.log",
      "sha256": "7d598e2caa82b1d73c684d2023180c1c6971ade2d2a6f529fd758a2b9daecf45"
    }
  ],
  "sourceHashes": [
    {
      "file": "core4/config/validation-map.json",
      "sha256": "3e1b55c88412fdc37edb95082d1c8df26abe8f2647844440c6ede07816a0992e"
    },
    {
      "file": "core4/runtime/source-package.json",
      "sha256": "a1ef82ab8f3dda21acb3101071e36138af16710cce2013ac98bca1ea8c8fcdb2"
    },
    {
      "file": "core4/runtime/stdio-entry.js",
      "sha256": "d989daef7df9d143835c049dfe510b146dea598d46a60a37c87dfad4a2082598"
    },
    {
      "file": "core4/test/fixtures/native-read-recovery.js",
      "sha256": "5795220502f29d55300843a5743e89b10500adc77b58f6430027ac356a078f1b"
    },
    {
      "file": "core4/test/installable-runtime.test.js",
      "sha256": "1352b6a0e979cc6ecd47e23c73e3e718740141bba50d211006f0a19dda7fa7a6"
    },
    {
      "file": "core4/tools/check-boundaries.js",
      "sha256": "822ba1c0665d509f273f76f1398ba3be1133c7f9643c7f82726aeb0c07094293"
    },
    {
      "file": "core4/tools/install-core4.js",
      "sha256": "23521b67e91cc59cc8d11ff67eb24ec55021cef69be0f2bb191020f45e58a2b7"
    },
    {
      "file": "core4/tools/package-installable.js",
      "sha256": "e0ee47e2509eba5c588fec3ab51865dd2931df39e08fdc99a1dfe05295c39dad"
    },
    {
      "file": "core4/test/fixtures/exact-f548-transition.js",
      "sha256": "2e5a2f9a4b62ad1af3ddb14c084daf42de3dd9cd5d105a7507523a87543538a7"
    },
    {
      "file": "core4/test/fixtures/fixed-format1-package.js",
      "sha256": "2773f81e775dcc22dc47e57b0302eaa55e282d2b39823312646af76a43a48553"
    },
    {
      "file": "core4/test/fixtures/installed-composition-child.js",
      "sha256": "7374dbbc696464658a2babc36f735dfadfc6dee39173b2855f82f69dcba1f299"
    },
    {
      "file": "core4/test/fixtures/installed-composition-transition.js",
      "sha256": "c8086bd7910eee3d712eca8aa34200e4ee12f364e3d991f4f43c615cdd084d54"
    },
    {
      "file": "core4/test/installed-composition.test.js",
      "sha256": "4583ddff9d9050e95e84dfc04d8afc87562b79bd2c859fdfff3744be68b431b6"
    },
    {
      "file": "core4/test/exact-f548-transition.test.js",
      "sha256": "5cf0f0fbccacf5147a76f54ba75505f48d48b95ac043f128268698fa7425bc08"
    }
  ],
  "historicalCodeArtifact": {
    "file": "dist/core4/4.0.0-panel-reconnect-f54863dbb69b/core4-4.0.0.json",
    "bytes": 343626,
    "sha256": "dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8",
    "packageHash": "f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90",
    "credentialsAndState": "fresh synthetic temp-only"
  },
  "harnessFailure": {
    "log": "exact-f548-transition.log",
    "error": "Initial code-artifact relative path ENOENT before any install; fixed test harness path, final proof is separate."
  },
  "packages": [
    {
      "composition": "readonly",
      "packageHash": "c14436485c1889e2ff98b0582bded0cff5e96c03be6c448d69ca15202d2578f4",
      "packageFileSha256": "e20908d8d8f16c8b3d9bad611a5fae7c9312610ad9e59ce5b25e5d816ea3d897",
      "packageBytes": 275422,
      "packageFiles": 40
    },
    {
      "composition": "manual",
      "packageHash": "e945f12b5ac42cf1fb945b5db92f1fd537210c743fd09e952f283c8754b91af0",
      "packageFileSha256": "330a8538d7301760f4c400cc03fe22d3f43ea53332c24002f22490e05e46a23c",
      "packageBytes": 355138,
      "packageFiles": 59
    }
  ],
  "rootVerification": {
    "sourceHashes": 14,
    "logHashes": 9,
    "mismatches": 0,
    "deterministicBuilds": true,
    "independentPackageFileAndManifestHashes": true,
    "standaloneInstallerTempDryRun": "both exit0; no installRoot/config created",
    "installedF548Verifier": "PASS; descriptor/journal unchanged"
  },
  "gaps": [
    "No production installation/state/credentials/MCP/AE/CEP/UI or port3457 access.",
    "No live AE proof, release certification or second-machine/round-trip portability proof.",
    "Scoped73 result intentionally not relabelled as full final-closure PASS after CLI/test routing delta; final targeted checks above.",
    "Production receiver closed with no pending/unresolved; not repaired or restarted.",
    "Standalone dynamic package installation/hot swap remains future work; this stage supplies two aggregate installable presets."
  ],
  "privacy": "INTERNAL code/tests; production observations summarized; no actual credentials/state/PII/AEP/assets/full raw logs or browser data."
}

````

## context/core4__runtime__stdio-entry.js

````text
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PRODUCTION_TIMING = Object.freeze({ callerTimeoutMs: 100000, callbackTimeoutMs: 90000, mcpToolTimeoutSec: 120 });
// ONLY builtins are loaded until the entire installed release is verified.
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_installation_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
function exactKeys(value, keys) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('composition_schema'); }
// Builtin-only release interpretation. Callers verify the COMPLETE tree first.
// These two reviewed adapters are closed policies, never names of executable imports.
function deriveComposition(release, read) {
  if (release.format !== 1 && release.format !== 2) fail('release_format');
  if (release.format === 1) {
    if (Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_downgrade');
    if (!Object.hasOwn(release.hashes, 'runtime/profiles.json') || !Object.hasOwn(release.hashes, 'runtime/source-package.json')) fail('composition_downgrade');
    const inspection = JSON.parse(read('modules/project-inspection/artifact.json'));
    const manual = JSON.parse(read('config/admissions/titles-current-target.json'));
    return { legacy: true, assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
  }
  if (!Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_required');
  const json = file => { if (!Object.hasOwn(release.hashes, file)) fail('composition_unhashed_path'); const bytes = read(file); if (hash(bytes) !== release.hashes[file]) fail('composition_bytes'); return JSON.parse(bytes); };
  const composition = json('runtime/composition.json'); exactKeys(composition, ['version', 'id', 'modules', 'engine', 'assets']);
  if (composition.version !== 1 || !['readonly', 'manual'].includes(composition.id) || !Array.isArray(composition.modules) || !Array.isArray(composition.assets)) fail('composition_schema');
  const catalog = json('config/catalog.json'); exactKeys(catalog, ['catalogRevision', 'modules', 'engine']);
  const expectedIds = composition.id === 'readonly' ? [] : ['photo-placeholder', 'titles', 'titles-current-target'];
  if (canonical(composition.modules) !== canonical(expectedIds) || !Array.isArray(catalog.modules) || canonical(catalog.modules.map(m => m.id)) !== canonical(expectedIds) || canonical(catalog.engine) !== canonical(composition.engine) || (composition.id === 'readonly' ? composition.engine !== null : !composition.engine || composition.engine.path !== 'plan-engine')) fail('composition_catalog');
  function checked(file) { if (!Object.hasOwn(release.hashes, file)) fail('composition_unhashed_path'); const bytes = read(file); if (hash(bytes) !== release.hashes[file]) fail('composition_bytes'); return bytes; }
  function admitted(entry) {
    exactKeys(entry, ['id', 'version', 'path', 'admission']);
    if (entry.path !== 'modules/' + entry.id || entry.admission !== 'config/admissions/' + entry.id + '.json') fail('composition_catalog');
    const manifest = json(entry.path + '/artifact.json'), contract = json(entry.path + '/contract.json'), admission = json(entry.admission), executor = checked(entry.path + '/executor.jsx');
    exactKeys(admission, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
    if (manifest.id !== entry.id || manifest.version !== entry.version || admission.revoked !== false || typeof admission.trustApprovalId !== 'string' || !admission.trustApprovalId || admission.protocolVersion !== 1 || admission.moduleId !== entry.id || contract.moduleId !== entry.id || admission.operationId !== contract.operationId || admission.artifactHash !== hash(manifest) || admission.schemaHash !== hash(contract.inputSchema) || admission.resultSchemaHash !== hash(contract.snapshotSchema) || admission.effectPolicyHash !== hash(contract.effectPolicy) || admission.executorHash !== hash(executor)) fail('composition_not_admitted');
    for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file) || hash(checked(entry.path + '/' + file)) !== pin) fail('composition_artifact');
    return { manifest, contract, admission, executor };
  }
  const selected = new Map(catalog.modules.map(entry => [entry.id, admitted(entry)]));
  if (composition.engine) { exactKeys(composition.engine, ['path', 'artifactHash']); const manifest = json('plan-engine/artifact.json'); if (hash(manifest) !== composition.engine.artifactHash) fail('composition_engine'); for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json)$/.test(file) || hash(checked('plan-engine/' + file)) !== pin) fail('composition_engine'); }
  const expectedAssets = [{ assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] }];
  if (composition.id === 'manual') expectedAssets.push({ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', path: 'modules/titles-current-target', admission: 'config/admissions/titles-current-target.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
  if (canonical(composition.assets) !== canonical(expectedAssets)) fail('composition_assets');
  const assets = composition.assets.map(asset => {
    let value = selected.get(asset.moduleId);
    if (asset.policy === 'read-only-current-observation-v1') {
      const contract = json(asset.path + '/contract.json'), admission = json(asset.admission), executor = checked(asset.path + '/executor.jsx');
      exactKeys(admission, ['moduleId', 'executionPolicy', 'executorHash', 'contractHash']);
      if (admission.moduleId !== asset.moduleId || admission.executionPolicy !== asset.policy || admission.executorHash !== hash(executor) || admission.contractHash !== hash(contract)) fail('composition_not_admitted');
      value = { contract, admission, executor };
    }
    if (!value) fail('composition_not_admitted');
    return { ...asset, ...value, executorHash: value.admission.executorHash };
  });
  // No optional runtime code is shipped in the standalone inspection composition.
  if (composition.id === 'readonly' && Object.keys(release.hashes).some(file => /^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
  return { composition, assets };
}
function registrySource(assets, codecSource) {
  const declarations = [], entries = assets.map((asset, index) => {
    const name = 'executor' + index; declarations.push('var ' + name + '=' + asset.executor + ';');
    return JSON.stringify(asset.assetKey) + ':{"hash":' + JSON.stringify(asset.executorHash) + ',"calls":{' + asset.phases.map(phase => JSON.stringify(phase) + ':' + name + '[' + JSON.stringify(phase) + ']').join(',') + '}}';
  });
  return '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';' + declarations.join('') + 'var assets={' + entries.join(',') + '};return {"dispatch":function(serialized){var frame=JSON.parse(serialized),own=Object.prototype.hasOwnProperty,a=frame&&own.call(assets,frame.assetKey)&&assets[frame.assetKey],call=a&&own.call(a.calls,frame.phase)&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({"readFailureVersion":1,"outcome":"rejected","code":"inspection_failed"});}}};}());\n';
}
function installationConfig(d, selected) { const assets = selected.assets.map(a => ({ assetKey: a.assetKey, executorHash: a.executorHash, phases: a.phases })); return { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: assets[0].executorHash, assetKey: assets[0].assetKey, assets }; }
function verifyRelease(directory, release) {
  exactKeys(release, ['version', 'format', 'hashes']); if (release.version !== '4.0.0' || !release.hashes || Object.getPrototypeOf(release.hashes) !== Object.prototype) fail('release_schema');
  const root = path.resolve(directory), expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes || {})) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('release_path');
    expectedFiles.add(relative);
    for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(directory, relative) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory || !expectedDirs.delete(relative)) fail('release_tree_mismatch');
    for (const item of fs.readdirSync(directory)) {
      const file = path.join(directory, item), rel = relative ? relative + '/' + item : item, child = fs.lstatSync(file);
      if (child.isSymbolicLink() || fs.realpathSync(file) !== file) fail('release_tree_mismatch');
      if (child.isDirectory()) visit(file, rel);
      else if (!child.isFile() || !expectedFiles.delete(rel)) fail('release_tree_mismatch');
      else if (rel === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[rel]) fail('installed_release_bytes');
    }
  }
  visit(root, ''); if (expectedFiles.size || expectedDirs.size) fail('release_tree_mismatch');
  if (release.format !== 1 && release.format !== 2) fail('release_format');
  if (release.format === 1) { if (Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_downgrade'); return; }
  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
  if (fs.readFileSync(path.join(root, 'cep/jsx/registry.jsx'), 'utf8') !== registrySource(selected.assets, fs.readFileSync(path.join(root, 'runtime/host/json-codec.jsx'), 'utf8'))) fail('composition_registry');
}
function assertPlainPath(file, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('installation_path');
  const stat = fs.lstatSync(file); if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(file) !== file || (directory ? !stat.isDirectory() : !stat.isFile())) fail('installation_path');
}
function verifyCep(d, manifest, cepDir) {
  verifyRelease(d.releaseDir, manifest);
  assertPlainPath(cepDir, true); if (path.basename(cepDir) !== 'com.codex.aeagentcore4') fail('installation_cep_scope');
  const selected = deriveComposition(manifest, file => fs.readFileSync(path.join(d.releaseDir, file)));
  const expected = Object.fromEntries(Object.entries(manifest.hashes).filter(([file]) => file.startsWith('cep/')).map(([file, digest]) => [file.slice(4), digest]));
  if (Object.keys(expected).length !== 6) fail('installation_cep_closure');
  const cfg = installationConfig(d, selected);
  expected['installation.js'] = hash('window.Core4Installation=' + canonical(cfg) + ';\n');
  const files = new Set(Object.keys(expected)), dirs = new Set(['']); for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  function visit(directory, relative) { assertPlainPath(directory, true); if (!dirs.delete(relative)) fail('installation_cep_tree'); for (const name of fs.readdirSync(directory)) { const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); assertPlainPath(file, stat.isDirectory()); if (stat.isDirectory()) visit(file, rel); else if (!files.delete(rel) || hash(fs.readFileSync(file)) !== expected[rel]) fail('installation_cep_bytes'); } }
  visit(cepDir, ''); if (files.size || dirs.size) fail('installation_cep_tree');
}
function verifyInstallation(file, options = {}) {
  if (Object.keys(options).some(key => key !== 'cepDir')) fail('installation_verifier_options');
  const { cepDir } = options;
  if (!path.isAbsolute(file)) fail('absolute_descriptor_required');
  assertPlainPath(file);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(d.version) || !path.isAbsolute(d.installRoot) || file !== path.join(d.installRoot, 'installation.json') || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) || d.stateDir !== path.join(d.installRoot, 'state/production') || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !d.installationId || d.panelToken === d.controlToken || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken)) fail('installation_descriptor');
  if (d.version === 2) {
    const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', 'cepDir', 'receiverFormatVersion', 'predecessor'];
    if (Object.keys(d).length !== keys.length || keys.some(key => !Object.hasOwn(d, key)) || !path.isAbsolute(d.cepDir) || d.receiverFormatVersion !== 2) fail('installation_descriptor_v2');
    if (d.predecessor !== null && (!d.predecessor || Object.keys(d.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.predecessor.transactionId) || !/^[a-f0-9]{64}$/.test(d.predecessor.previousDescriptorHash))) fail('installation_predecessor');
  }
  assertPlainPath(path.join(d.installRoot, 'origin.json')); assertPlainPath(path.join(d.stateDir, 'origin.json'));
  const origin = JSON.parse(fs.readFileSync(path.join(d.installRoot, 'origin.json'), 'utf8'));
  const anchor = JSON.parse(fs.readFileSync(path.join(d.stateDir, 'origin.json'), 'utf8'));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('installation_origin_mismatch');
  if ((path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20)) fail('external_node_mismatch');
  const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  if (hash(manifest) !== d.packageHash) fail('installation_package_hash');
  verifyRelease(d.releaseDir, manifest);
  if (d.version === 2) { const receiver = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'runtime/receiver-contract.json'), 'utf8')); if (receiver.version !== 1 || receiver.descriptorVersion !== 2 || receiver.journalFormat !== d.receiverFormatVersion || receiver.terminalReadFailureDispositionVersion !== 1) fail('installation_receiver_contract'); verifyCep(d, manifest, d.cepDir); }
  else if (cepDir) verifyCep(d, manifest, cepDir);
  return Object.freeze(d);
}
async function start({ descriptor, port = 3457, input = process.stdin, output = process.stdout } = {}) {
  const installation = verifyInstallation(descriptor), root = installation.releaseDir;
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(root)) fail('installation_entry_root_mismatch');
  const installGate = path.join(installation.installRoot, 'install.lock');
  const startupGate = fs.openSync(installGate, 'wx');
  let broker, peer;
  try {
  if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');
  const { Broker } = require('../core/broker.js');
  const { serve } = require('../core/stdio.js');
  const { exact, id } = require('../protocol/json.js');
  const { createHttpPeer } = require('../integrations/cep/http-peer.js');
  const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
  if (selected.legacy) fail('runtime_composition_required');
  const inspection = selected.assets.find(a => a.policy === 'read-only-current-observation-v1');
  const { contract, admission } = inspection;
  const profile = { id: inspection.moduleId, executionPolicy: inspection.policy };
  const asset = { assetKey: inspection.assetKey, executorHash: inspection.executorHash };
  const manualAsset = selected.assets.find(a => a.policy === 'current-matching-target-after-local-confirmation-v1');
  let provider, manual, privateEmbedding;
  if (manualAsset) {
    const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
    const { createManualPolicy } = require('./manual-policy.js');
    provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
    manual = createManualPolicy({ selected: { pin: hash(manualAsset.manifest), contract: manualAsset.contract, admission: manualAsset.admission }, provider, installation, getPeer: () => peer });
    const transport = { identity: hash({ packageHash: installation.packageHash, manualAdmission: manualAsset.admission }), connect: value => peer.transport.connect(value), send: value => peer.transport.send(value), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
    privateEmbedding = { authority: manual.authority, executionPolicy: manual.port, transport };
  }
  broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs, ...(privateEmbedding ? { privateEmbedding } : {}) });
  const admissionGuard = command => {
    if (broker.closed) fail('broker_closed');
    if (broker.stateLock.error) fail(broker.stateLock.error);
    if (broker.ledger.corrupt) fail('ledger_corrupt');
    if (broker.ledger.unresolved().some(c => c.commandId !== command?.commandId)) fail('controller_unresolved');
  };
  peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets: manualAsset ? [{ assetKey: manualAsset.assetKey, moduleId: manualAsset.moduleId, operationId: manualAsset.contract.operationId, executorHash: manualAsset.executorHash, resultProfile: 'manual-text-v1' }] : [], timeout: PRODUCTION_TIMING.callbackTimeoutMs, port, admissionGuard, installationContext: { descriptorPath: descriptor } });
  const contractId = hash({ packageHash: installation.packageHash, admission, contract }); let closed = false;
  const facade = Object.create(broker);
  const physical = () => { const value = peer.status(); return { ...value, inspectionAvailable: !broker.closed && !broker.stateLock.error && !broker.ledger.corrupt && !broker.ledger.unresolved().length && value.peer.connected && !value.storeClosed && !value.storeFault && !value.pending }; };
  facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.0.0', composition: selected.composition.id, installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: physical(), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual?.policyId || null, resourceProvider: provider ? provider.status() : null, ...(manual ? {} : { mutationAvailable: false }), externalLegacyCoverage: 'unobserved' });
  facade.diagnostics = () => ({ ...broker.diagnostics(), ...facade.status() });
  facade.connect = async () => ({ ...(manual ? await broker.connect() : { available: physical().inspectionAvailable, reason: physical().inspectionAvailable ? null : 'physical_inspection_unavailable', mutationAvailable: false }), automaticLifecycle: 'unavailable', physical: physical() });
  facade.disconnect = async () => ({ disconnected: false, reason: 'physical_link_owned_by_stdio_lifetime', physical: peer.status() });
  facade.listModules = value => { const result = broker.listModules(value); return { ...result, modules: [...result.modules, { id: profile.id, version: '4.0.0', executionPolicy: profile.executionPolicy }] }; };
  facade.getContract = value => { if (value.moduleId !== profile.id) return broker.getContract(value); exact(value, ['moduleId']); return { contractId, moduleId: profile.id, operationId: contract.operationId, modulePin: hash(admission), contract: JSON.parse(canonical(contract)) }; };
  facade.inspect = async value => {
    if (value.contractId !== contractId) return broker.inspect(value);
    exact(value, ['moduleId', 'contractId', 'target']);
    if (value.moduleId !== profile.id) fail('contract_identity');
    const result = await peer.inspect(value.target || {});
    if (result.observation?.readFailureVersion === 1) fail(result.observation.code || 'inspection_failed');
    return { evidenceRef: id('observation'), moduleId: profile.id, contractId, ...result, authority: false };
  };
  facade.build = value => { if (value.contractId === contractId || value.steps?.some(s => s.contractId === contractId)) fail('read_only_module_build_unsupported'); return broker.build(value); };
  facade.close = async () => { if (closed) return; closed = true; await peer.close(); await broker.close(); };
  try { await peer.listen(); } catch (e) { await facade.close(); throw e; }
  serve(facade, input, output, { serverInfo: { name: 'ae-agent-core4', version: '4.0.0' } });
  return { close: facade.close, status: facade.status };
  } catch (e) { if (peer) await peer.close(); if (broker) await broker.close(); throw e; }
  finally { fs.closeSync(startupGate); fs.unlinkSync(installGate); }
}
// Direct-main start imports the historical reader synchronously. Publish these
// builtin verifiers first so its installation.js import sees initialized exports.
module.exports = { start, verifyInstallation, verifyRelease, verifyCep, deriveComposition, registrySource, installationConfig, PRODUCTION_TIMING };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--installation') { process.stderr.write('Explicit --installation ABSOLUTE_DESCRIPTOR required.\n'); process.exitCode = 2; }
  else start({ descriptor: args[1] }).then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
  }).catch(e => { process.stderr.write((e.code || 'runtime_start_failed') + '\n'); process.exitCode = 1; });
}

````

## context/core4__runtime__source-package.json

````text
{
  "version": 2,
  "files": [
    "core/artifact.json",
    "worker.js",
    "runtime/stdio-entry.js",
    "runtime/installation.js",
    "runtime/receiver-contract.json",
    "runtime/install-lease.js",
    "runtime/installation-lineage.js",
    "runtime/native-read-disposition.js",
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
    "manual": {
      "files": [
        "config/admissions/titles.json",
        "config/admissions/photo-placeholder.json",
        "runtime/manual-policy.js",
        "runtime/windows-reservation-provider.js",
        "config/admissions/titles-current-target.json"
      ],
      "artifactClosures": [
        "modules/titles/artifact.json",
        "modules/photo-placeholder/artifact.json",
        "modules/titles-current-target/artifact.json",
        "plan-engine/artifact.json"
      ]
    }
  },
  "compositions": {
    "readonly": {
      "modules": [],
      "assets": [
        {
          "assetKey": "project-inspection-v1",
          "moduleId": "project-inspection",
          "path": "modules/project-inspection",
          "admission": "modules/project-inspection/artifact.json",
          "policy": "read-only-current-observation-v1",
          "phases": [
            "inspect"
          ]
        }
      ]
    },
    "manual": {
      "modules": [
        "photo-placeholder",
        "titles",
        "titles-current-target"
      ],
      "assets": [
        {
          "assetKey": "project-inspection-v1",
          "moduleId": "project-inspection",
          "path": "modules/project-inspection",
          "admission": "modules/project-inspection/artifact.json",
          "policy": "read-only-current-observation-v1",
          "phases": [
            "inspect"
          ]
        },
        {
          "assetKey": "titles-current-target-v1",
          "moduleId": "titles-current-target",
          "path": "modules/titles-current-target",
          "admission": "config/admissions/titles-current-target.json",
          "policy": "current-matching-target-after-local-confirmation-v1",
          "phases": [
            "inspect",
            "mutate",
            "verify"
          ]
        }
      ]
    }
  }
}

````

## context/core4__tools__package-installable.js

````text
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { deriveComposition, registrySource } = require('../runtime/stdio-entry.js');
function buildPackage(root = path.resolve(__dirname, '..'), selector = 'manual') {
  if (!['readonly', 'manual'].includes(selector)) fail('composition_selector');
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'runtime/source-package.json'), 'utf8'));
  const optional = selector === 'manual' ? spec.optional.manual : { files: [], artifactClosures: [] };
  const paths = new Set([...spec.files, ...optional.files]);
  for (const relative of [...spec.artifactClosures, ...optional.artifactClosures]) {
    paths.add(relative);
    const artifact = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    for (const file of Object.keys(artifact.hashes)) {
      const location = relative.startsWith('modules/') || relative.startsWith('plan-engine/') ? path.posix.join(path.posix.dirname(relative), file) : file;
      if (hash(fs.readFileSync(path.join(root, location))) !== artifact.hashes[file]) fail('package_artifact_mismatch');
      paths.add(location);
    }
  }
  const hashes = {}, files = {};
  for (const relative of [...paths].sort()) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) fail('package_closure_forbidden');
    const full = path.resolve(root, relative); if (fs.realpathSync(full) !== full) fail('package_symlink');
    const bytes = fs.readFileSync(full); hashes[relative] = hash(bytes); files[relative] = bytes.toString('base64');
  }
  const release = { version: '4.0.0', format: 2, hashes };
  const original = JSON.parse(fs.readFileSync(path.join(root, 'config/catalog.json'), 'utf8'));
  const { modules, assets } = spec.compositions[selector];
  if (modules.some(id => original.modules.filter(m => m.id === id).length !== 1)) fail('composition_catalog');
  const catalog = { catalogRevision: original.catalogRevision, modules: modules.map(id => original.modules.find(m => m.id === id)), engine: selector === 'manual' ? original.engine : null };
  const composition = { version: 1, id: selector, modules, engine: catalog.engine, assets };
  const add = (file, source) => { const bytes = typeof source === 'string' ? source : canonical(source); files[file] = Buffer.from(bytes).toString('base64'); hashes[file] = hash(bytes); };
  add('config/catalog.json', catalog); add('runtime/composition.json', composition);
  const selected = deriveComposition(release, file => Buffer.from(files[file], 'base64'));
  add('cep/jsx/registry.jsx', registrySource(selected.assets, Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8')));
  return verifyPackage({ packageHash: hash(release), release, files });
}
function verifyPackage(pkg) {
  if (pkg.packageHash !== hash(pkg.release) || pkg.release.version !== '4.0.0' || canonical(Object.keys(pkg.files).sort()) !== canonical(Object.keys(pkg.release.hashes).sort())) fail('package_integrity');
  for (const [relative, data] of Object.entries(pkg.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || path.isAbsolute(relative) || /^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || hash(Buffer.from(data, 'base64')) !== pkg.release.hashes[relative]) fail('package_integrity');
  }
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (!selected.legacy && Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8') !== registrySource(selected.assets, Buffer.from(pkg.files['runtime/host/json-codec.jsx'], 'base64').toString('utf8'))) fail('composition_registry');
  return pkg;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let n = 0; n < args.length; n += 2) { const key = args[n]; if (!['--output', '--composition'].includes(key) || Object.hasOwn(options, key) || typeof args[n + 1] !== 'string' || args[n + 1].startsWith('--')) fail('package_options'); options[key] = args[n + 1]; }
    if (!options['--output'] || !path.isAbsolute(options['--output'])) fail('absolute_output_required');
    const pkg = buildPackage(undefined, options['--composition'] ?? 'manual'); fs.writeFileSync(options['--output'], canonical(pkg), { flag: 'wx' }); console.log(JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).length, composition: options['--composition'] ?? 'manual', output: options['--output'] }));
  } catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
}
module.exports = { buildPackage, verifyPackage };

````

## context/core4__tools__install-core4.js

````text
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { hash, canonical, fail } = require('../protocol/json');
const { verifyPackage } = require('./package-installable');
const { deriveComposition, installationConfig } = require('../runtime/stdio-entry.js');
const { acquireInstallLease, assertInstallLease, ownedLeaseGates, checkpointInstallLease, retainInstallLease, releaseInstallLease } = require('../runtime/install-lease');
const BUNDLE = 'com.codex.aeagentcore4';
const preparedPlans = new WeakMap();
function planDigest(plan) { return hash({ transactionId: plan.transactionId, package: plan.pkg, origin: plan.origin, descriptor: plan.descriptor, descriptorPath: plan.descriptorPath, configPath: plan.configPath, nextConfig: plan.nextConfig, cepDir: plan.cepDir, cep: plan.cep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCep: plan.previousCep, baseline: plan.baseline }); }
function assertPreparedInstallPlan(plan) {
  const entry = plan && preparedPlans.get(plan); if (!entry || entry.digest !== planDigest(plan)) fail('prepared_install_plan_brand_or_changed');
  return Object.freeze({ transactionId: plan.transactionId, packageHash: plan.pkg.packageHash, appliedDescriptorHash: hash(canonical(plan.descriptor)), previousDescriptorHash: plan.baseline.descriptor, preparedPlanHash: entry.digest, preparedStateHash: entry.prepared?.hash || null });
}
function prepareInstallPlan(plan, { lease }) {
  const fingerprint = assertPreparedInstallPlan(plan), scope = { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath };
  assertInstallLease(lease, scope); const entry = preparedPlans.get(plan);
  if (!entry.prepared) {
    const directory = path.join(scope.installRoot, 'transactions', plan.transactionId + '-prepared');
    const payload = { version: 1, transactionId: plan.transactionId, preparedPlanHash: fingerprint.preparedPlanHash, package: plan.pkg, origin: plan.origin, descriptorBytes: Buffer.from(canonical(plan.descriptor)).toString('base64'), descriptorPath: plan.descriptorPath, configPath: plan.configPath, configBytes: Buffer.from(plan.nextConfig).toString('base64'), cepDir: plan.cepDir, cep: plan.cep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCep: plan.previousCep, baseline: plan.baseline };
    try {
      const parent = path.dirname(directory); if (!fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink() || fs.realpathSync(parent) !== parent) fail('prepared_install_path');
      fs.mkdirSync(directory, { recursive: false });
      if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) fail('prepared_install_path');
      durable(path.join(directory, 'prepared.json'), canonical(payload));
      durable(path.join(directory, 'descriptor.json'), canonical(plan.descriptor));
      entry.prepared = { directory, hash: hash(canonical(payload)), descriptorHash: fingerprint.appliedDescriptorHash };
    } catch (e) { retainInstallLease(lease); e.preparedDirectory = directory; e.leaseRetained = true; throw e; }
  }
  return assertDurablePreparedInstallPlan(plan, { lease });
}
function assertDurablePreparedInstallPlan(plan, { lease }) {
  assertPreparedInstallPlan(plan); assertInstallLease(lease, { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath });
  const prepared = preparedPlans.get(plan).prepared; if (!prepared) fail('prepared_install_state_required');
  const plain = file => { const s = fs.lstatSync(file); return s.isFile() && !s.isSymbolicLink() && !s.reparsePoint && fs.realpathSync(file) === file; };
  if (fs.lstatSync(prepared.directory).isSymbolicLink() || fs.realpathSync(prepared.directory) !== prepared.directory || canonical(fs.readdirSync(prepared.directory).sort()) !== canonical(['descriptor.json', 'prepared.json']) || !plain(path.join(prepared.directory, 'prepared.json')) || !plain(path.join(prepared.directory, 'descriptor.json')) || hash(fs.readFileSync(path.join(prepared.directory, 'prepared.json'))) !== prepared.hash || hash(fs.readFileSync(path.join(prepared.directory, 'descriptor.json'))) !== prepared.descriptorHash) { retainInstallLease(lease); fail('prepared_install_state_changed'); }
  return assertPreparedInstallPlan(plan);
}
function durable(file, data, flag = 'wx') { fs.mkdirSync(path.dirname(file), { recursive: true }); const fd = fs.openSync(file, flag); try { if (fs.writeSync(fd, data) !== Buffer.byteLength(data)) fail('install_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function bytes(file) { return fs.existsSync(file) ? fs.readFileSync(file) : null; }
function snapshot(directory) {
  if (!fs.existsSync(directory)) return null;
  const result = {};
  function visit(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isSymbolicLink()) fail('install_symlink'); if (item.isDirectory()) visit(file); else result[path.relative(directory, file).replace(/\\/g, '/')] = fs.readFileSync(file).toString('base64'); } }
  visit(directory); return result;
}
function treeHash(value) { return hash(value); }
function restoreTree(directory, data) { fs.mkdirSync(directory, { recursive: true }); for (const [relative, b64] of Object.entries(data || {})) durable(path.join(directory, relative), Buffer.from(b64, 'base64')); }
function configText(previous, descriptor, nodePath, entry) {
  const text = previous ? previous.toString('utf8') : '';
  if (Buffer.byteLength(text) > 1024 * 1024 || previous && !Buffer.from(text, 'utf8').equals(previous) || text.includes('"""') || text.includes("'''")) fail('config_syntax_requires_review');
  const headers = []; let offset = 0, currentTable = '';
  // Deliberately bounded TOML subset: bare dotted tables and single-line values.
  // Unsupported table syntax is rejected BEFORE any installation writes.
  for (const line of text.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) {
    if (/^[ \t]*\[/.test(line)) {
      const parsed = /^[ \t]*\[[ \t]*([A-Za-z0-9_-]+(?:[ \t]*\.[ \t]*[A-Za-z0-9_-]+)*)[ \t]*\][ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.exec(line);
      if (!parsed) fail('config_syntax_requires_review');
      currentTable = parsed[1].split('.').map(part => part.trim()).join('.');
      if (currentTable.startsWith('mcp_servers.after-effects-core4.')) fail('config_core4_nested_requires_review');
      headers.push({ name: currentTable, start: offset, end: offset + line.length, line });
    } else if (/^[ \t]*mcp_servers[ \t]*\.[ \t]*after-effects-core4[ \t]*[.=]/.test(line) || currentTable === 'mcp_servers' && /^[ \t]*["']?after-effects-core4["']?[ \t]*=/.test(line)) fail('config_ambiguous_core4');
    offset += line.length;
  }
  const matches = headers.filter(h => h.name === 'mcp_servers.after-effects-core4'); if (matches.length > 1) fail('config_ambiguous_core4');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  // TOML basic strings accept JSON's escaped backslashes. Preserve native path
  // bytes: the installed verifier deliberately rejects noncanonical spellings.
  const body = 'command = ' + JSON.stringify(nodePath) + newline + 'args = ' + JSON.stringify([entry, '--installation', descriptor]) + newline;
  if (!matches.length) return text + (text && !text.endsWith('\n') ? newline : '') + newline + '[mcp_servers.after-effects-core4]' + newline + 'tool_timeout_sec = 120' + newline + body;
  const own = matches[0], following = headers.find(h => h.start > own.start);
  const ownBody = text.slice(own.end, following ? following.start : text.length), preferences = [], timeouts = [];
  for (const line of ownBody.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) if (/^[ \t]*(?:enabled|"enabled"|'enabled')[ \t]*=/.test(line)) {
    if (!/^[ \t]*(?:enabled|"enabled"|'enabled')[ \t]*=[ \t]*(?:true|false)[ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.test(line)) fail('config_enabled_preference_requires_review');
    preferences.push(line);
  }
  for (const line of ownBody.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) if (/^[ \t]*(?:tool_timeout_sec|"tool_timeout_sec"|'tool_timeout_sec')[ \t]*=/.test(line)) {
    if (!/^[ \t]*(?:tool_timeout_sec|"tool_timeout_sec"|'tool_timeout_sec')[ \t]*=[ \t]*[1-9][0-9]*[ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.test(line)) fail('config_timeout_preference_requires_review');
    timeouts.push(line);
  }
  if (preferences.length > 1) fail('config_duplicate_enabled_preference');
  if (timeouts.length > 1) fail('config_duplicate_timeout_preference');
  const preference = preferences.length ? preferences[0] + (preferences[0].endsWith('\n') ? '' : newline) : '';
  const timeout = timeouts.length ? timeouts[0] + (timeouts[0].endsWith('\n') ? '' : newline) : 'tool_timeout_sec = 120' + newline;
  return text.slice(0, own.end) + (own.line.endsWith('\n') ? '' : newline) + preference + timeout + body + text.slice(following ? following.start : text.length);
}
function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, machineId }) {
  verifyPackage(pkg);
  const receiverContract = pkg.files['runtime/receiver-contract.json'] && JSON.parse(Buffer.from(pkg.files['runtime/receiver-contract.json'], 'base64'));
  if (!receiverContract || receiverContract.version !== 1 || receiverContract.descriptorVersion !== 2 || receiverContract.journalFormat !== 2 || receiverContract.terminalReadFailureDispositionVersion !== 1) fail('candidate_receiver_contract_unsupported');
  for (const value of [nodePath, installRoot, extensionsDir, configPath]) if (!path.isAbsolute(value)) fail('absolute_install_paths_required');
  if (path.basename(installRoot).toLowerCase() !== 'aeagentcore4' || path.basename(path.join(extensionsDir, BUNDLE)) !== BUNDLE) fail('install_scope');
  nodePath = path.resolve(nodePath);
  const resolvedNode = fs.realpathSync(nodePath); if (resolvedNode !== nodePath) fail('node_path_not_exact');
  if (path.resolve(process.execPath).toLowerCase() !== nodePath.toLowerCase()) fail('installer_candidate_node_must_be_current_process');
  const version = process.version;
  if (!/^v(2\d|[3-9]\d)\./.test(version)) fail('node_20_required');
  const releaseDir = path.join(installRoot, 'releases', pkg.packageHash), descriptor = path.join(installRoot, 'installation.json'), stateDir = path.join(installRoot, 'state', 'production'), cepDir = path.join(extensionsDir, BUNDLE);
  const originBytes = bytes(path.join(installRoot, 'origin.json')), anchorBytes = bytes(path.join(stateDir, 'origin.json'));
  if (!!originBytes !== !!anchorBytes || (originBytes && !originBytes.equals(anchorBytes))) fail('stable_state_origin_missing_or_mismatch');
  if (!originBytes && (fs.existsSync(descriptor) || fs.existsSync(cepDir) || fs.existsSync(stateDir))) fail('existing_installation_without_origin');
  const origin = originBytes ? JSON.parse(originBytes) : { version: 1, installationId: 'installation-' + crypto.randomUUID(), machineId: machineId || os.hostname(), createdAt: new Date().toISOString() };
  if (origin.machineId !== (machineId || os.hostname())) fail('machine_origin_mismatch');
  const previousDescriptor = bytes(descriptor), previousConfig = bytes(configPath), previousCep = snapshot(cepDir);
  if (previousDescriptor) {
    const old = JSON.parse(previousDescriptor); if (old.installationId !== origin.installationId || old.installRoot !== installRoot || old.stateDir !== stateDir) fail('installation_identity_mismatch');
    if (old.version === 2 && old.cepDir !== cepDir) fail('installation_cep_binding_change_unsupported');
  }
  const transactionId = crypto.randomUUID();
  const d = { version: 2, installRoot, installationId: origin.installationId, machineId: origin.machineId, packageHash: pkg.packageHash, releaseDir, stateDir, nodePath, nodeHash: hash(fs.readFileSync(nodePath)), nodeVersion: version, panelToken: crypto.randomBytes(32).toString('hex'), controlToken: crypto.randomBytes(32).toString('hex'), cepDir, receiverFormatVersion: 2, predecessor: previousDescriptor ? { transactionId, previousDescriptorHash: hash(previousDescriptor) } : null };
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  const cep = Object.fromEntries(Object.entries(pkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, data]) => [f.slice(4), data]));
  cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical(installationConfig(d, selected)) + ';\n').toString('base64');
  const nextConfig = configText(previousConfig, descriptor, nodePath, path.join(releaseDir, 'runtime/stdio-entry.js'));
  const plan = { pkg, origin, transactionId, descriptor: d, descriptorPath: descriptor, configPath, nextConfig, cepDir, cep, previousDescriptor, previousConfig, previousCep, baseline: { config: previousConfig ? hash(previousConfig) : null, descriptor: previousDescriptor ? hash(previousDescriptor) : null, cep: treeHash(previousCep) } };
  preparedPlans.set(plan, { digest: planDigest(plan), prepared: null }); return plan;
}
function assertBaseline(plan) { if ((bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || (bytes(plan.descriptorPath) ? hash(bytes(plan.descriptorPath)) : null) !== plan.baseline.descriptor || treeHash(snapshot(plan.cepDir)) !== plan.baseline.cep) fail('install_baseline_changed'); }
function entryExists(file) { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function assertRuntimeStopped(stateDir, { lease, descriptorPath, cepDir, plan } = {}) {
  const scope = { installRoot: path.resolve(stateDir, '../..'), stateDir, descriptorPath };
  const owned = lease ? (assertInstallLease(lease, scope), ownedLeaseGates(lease)) : new Map();
  for (const relative of ['broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) {
    const file = path.join(stateDir, relative);
    if (entryExists(file) && !(relative === 'broker/broker-owner.gate' && owned.has(file) && fs.readFileSync(file).equals(owned.get(file)))) fail('runtime_state_owned_or_unknown');
  }
  const ledger = path.join(stateDir, 'broker/ledger.ndjson');
  if (entryExists(ledger)) {
    const stat = fs.lstatSync(ledger); if (stat.isSymbolicLink() || fs.realpathSync(ledger) !== ledger) fail('runtime_ledger_unknown');
    const { Ledger } = require('../core/ledger'); const value = new Ledger(ledger); if (value.corrupt || value.unresolved().length) fail('runtime_ledger_unresolved');
  }
  if (entryExists(path.join(stateDir, 'receiver/completions.ndjson'))) {
    const options = { directory: path.join(stateDir, 'receiver'), descriptorPath, cepDir };
    if (plan) require('./disposition-install-preflight').assertPreparedReceiverJournalSettled({ ...options, plan, lease });
    else require('../runtime/native-read-disposition').assertReceiverJournalSettled(options);
  }
}
function checkRelease(directory, release) {
  const expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('immutable_release_mismatch');
    expectedFiles.add(relative); for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(dir, rel) {
    const stat = fs.lstatSync(dir); if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(dir) !== dir || !expectedDirs.delete(rel)) fail('immutable_release_mismatch');
    for (const item of fs.readdirSync(dir)) {
      const file = path.join(dir, item), relative = rel ? rel + '/' + item : item, stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || fs.realpathSync(file) !== file) fail('immutable_release_mismatch');
      if (stat.isDirectory()) visit(file, relative);
      else if (!stat.isFile() || !expectedFiles.delete(relative)) fail('immutable_release_mismatch');
      else if (relative === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[relative]) fail('immutable_release_mismatch');
    }
  }
  visit(path.resolve(directory), ''); if (expectedFiles.size || expectedDirs.size) fail('immutable_release_mismatch');
}
function applyInstall(plan, { lease: borrowed } = {}) {
  let fingerprint = assertPreparedInstallPlan(plan);
  assertBaseline(plan);
  const d = plan.descriptor; fs.mkdirSync(d.installRoot, { recursive: true });
  const scope = { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath: plan.descriptorPath };
  const lease = borrowed || acquireInstallLease(scope); assertInstallLease(lease, scope);
  let txnFile, txn, writes = false;
  try {
    assertBaseline(plan);
    if (d.version !== 2 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(plan.transactionId) || (plan.previousDescriptor ? canonical(d.predecessor) !== canonical({ transactionId: plan.transactionId, previousDescriptorHash: hash(plan.previousDescriptor) }) : d.predecessor !== null)) fail('install_lineage_plan');
    assertRuntimeStopped(d.stateDir, { lease, descriptorPath: plan.descriptorPath, cepDir: plan.cepDir, plan });
    writes = true;
    fs.mkdirSync(path.join(d.installRoot, 'transactions'), { recursive: true });
    fingerprint = prepareInstallPlan(plan, { lease });
    checkpointInstallLease(lease, 'installing');
    // State is stable across reinstall and rollback; no cleanup/reclaim is performed.
    if (!fs.existsSync(path.join(d.installRoot, 'origin.json'))) {
      writes = true;
      durable(path.join(d.installRoot, 'origin.json'), canonical(plan.origin));
      durable(path.join(d.stateDir, 'origin.json'), canonical(plan.origin));
    }
    if (!fs.existsSync(d.releaseDir)) {
      writes = true;
      const stage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
      for (const [relative, b64] of Object.entries(plan.pkg.files)) durable(path.join(stage, relative), Buffer.from(b64, 'base64'));
      durable(path.join(stage, 'release.json'), canonical(plan.pkg.release)); checkRelease(stage, plan.pkg.release); fs.renameSync(stage, d.releaseDir);
    }
    checkRelease(d.releaseDir, plan.pkg.release);
    const transactionId = plan.transactionId; txnFile = path.join(d.installRoot, 'transactions', transactionId + '.json');
    const backupCep = path.join(d.installRoot, 'transactions', transactionId + '-cep');
    txn = { version: 2, transactionId, preparedPlanHash: fingerprint.preparedPlanHash, preparedStateHash: fingerprint.preparedStateHash, installRoot: d.installRoot, descriptorPath: plan.descriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, backupCep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCepHash: treeHash(plan.previousCep), appliedDescriptorHash: hash(canonical(d)), appliedConfigHash: hash(plan.nextConfig), appliedCepHash: treeHash(plan.cep), stateDir: d.stateDir };
    writes = true;
    durable(txnFile, canonical(txn));
    // Last CAS before any visible switch. Unknown filesystem outcomes are not retried.
    assertBaseline(plan);
    if (fs.existsSync(plan.cepDir)) fs.renameSync(plan.cepDir, backupCep);
    restoreTree(plan.cepDir, plan.cep);
    durable(plan.descriptorPath + '.next', canonical(d));
    durable(plan.configPath + '.core4-next', plan.nextConfig);
    fs.renameSync(plan.descriptorPath + '.next', plan.descriptorPath);
    fs.renameSync(plan.configPath + '.core4-next', plan.configPath);
    if (hash(bytes(plan.descriptorPath)) !== txn.appliedDescriptorHash || hash(bytes(plan.configPath)) !== txn.appliedConfigHash || treeHash(snapshot(plan.cepDir)) !== txn.appliedCepHash) fail('install_readback_mismatch');
    require('../runtime/installation').verifyInstallation(plan.descriptorPath); checkpointInstallLease(lease, 'installed');
    return { installed: true, packageHash: d.packageHash, installationId: d.installationId, descriptorPath: plan.descriptorPath, transactionFile: txnFile, stateDir: d.stateDir, requiresPanelOpen: true, requiresMcpReconnect: true, liveProof: false };
  } catch (e) { if (writes) { retainInstallLease(lease); e.leaseRetained = true; if (txnFile) e.transactionFile = txnFile; } throw e; }
  finally { if (!borrowed) { const state = assertInstallLease(lease, scope); if (!state.retained) releaseInstallLease(lease); } }
}
function rollback(file) {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(t.version) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(t.transactionId) || !path.isAbsolute(t.installRoot) || path.basename(t.installRoot).toLowerCase() !== 'aeagentcore4' || t.descriptorPath !== path.join(t.installRoot, 'installation.json') || t.backupCep !== path.join(t.installRoot, 'transactions', t.transactionId + '-cep') || path.basename(t.cepDir) !== BUNDLE || path.resolve(file) !== path.join(t.installRoot, 'transactions', t.transactionId + '.json') || fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== path.resolve(file)) fail('rollback_scope');
  if (hash(bytes(t.descriptorPath)) !== t.appliedDescriptorHash || hash(bytes(t.configPath)) !== t.appliedConfigHash || treeHash(snapshot(t.cepDir)) !== t.appliedCepHash) fail('rollback_baseline_changed');
  const scope = { installRoot: t.installRoot, stateDir: t.stateDir, descriptorPath: t.descriptorPath }, lease = acquireInstallLease(scope); let writes = false;
  try {
    assertRuntimeStopped(t.stateDir, { lease, descriptorPath: t.descriptorPath, cepDir: t.cepDir });
    const priorBytes = t.previousDescriptor === null ? null : Buffer.from(t.previousDescriptor, 'base64'), target = priorBytes && JSON.parse(priorBytes);
    if (priorBytes && priorBytes.toString('base64') !== t.previousDescriptor) fail('rollback_previous_bytes');
    require('../runtime/native-read-disposition').assertRollbackReaderCompatible({ directory: path.join(t.stateDir, 'receiver'), target });
    if (target && (target.nodePath !== process.execPath || target.nodeHash !== hash(fs.readFileSync(process.execPath)))) fail('rollback_node_binding_unsupported');
    if (t.previousCepHash !== treeHash(fs.existsSync(t.backupCep) ? snapshot(t.backupCep) : null)) fail('rollback_backup_mismatch');
    checkpointInstallLease(lease, 'installing');
    // Move only the exact owned bundle. Keep recoverable applied files as evidence.
    writes = true;
    fs.renameSync(t.cepDir, path.join(t.installRoot, 'transactions', t.transactionId + '-applied-cep'));
    if (fs.existsSync(t.backupCep)) fs.renameSync(t.backupCep, t.cepDir);
    for (const [target, prior] of [[t.descriptorPath, t.previousDescriptor], [t.configPath, t.previousConfig]]) {
      if (prior === null) fs.unlinkSync(target);
      else { durable(target + '.rollback', Buffer.from(prior, 'base64')); fs.renameSync(target + '.rollback', target); }
    }
    if (t.previousDescriptor !== null) require('../runtime/installation').verifyInstallation(t.descriptorPath, { cepDir: t.cepDir });
    checkpointInstallLease(lease, 'installed');
    return { rolledBack: true, transactionId: t.transactionId, statePreserved: true, liveProof: false };
  } catch (e) { if (writes) { retainInstallLease(lease); e.leaseRetained = true; e.transactionFile = file; } throw e; }
  finally { const state = assertInstallLease(lease, scope); if (!state.retained) releaseInstallLease(lease); }
}
function sourceWorkspace(explicit) {
  // Source checkout layout is the discovery contract; neither CWD nor machine
  // identity selects a configuration target. Standalone copies need --workspace.
  const workspaceRoot = explicit === undefined ? path.resolve(__dirname, '../..') : explicit;
  if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot) || path.resolve(workspaceRoot) !== workspaceRoot) fail('workspace_absolute_exact_path_required');
  try {
    const marker = path.join(workspaceRoot, 'core4/package.json'), installer = path.join(workspaceRoot, 'core4/tools/install-core4.js');
    if (explicit === undefined && __filename !== installer) fail('workspace_source_layout_required');
    if (!fs.lstatSync(workspaceRoot).isDirectory() || fs.realpathSync(workspaceRoot) !== workspaceRoot || ![marker, installer].every(file => fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && fs.realpathSync(file) === file) || JSON.parse(fs.readFileSync(marker, 'utf8')).name !== 'ae-agent-core4') fail('workspace_source_layout_required');
  } catch { fail('workspace_source_layout_required'); }
  return { workspaceRoot, workspaceSource: explicit === undefined ? 'installer-location' : 'explicit-workspace', installerPath: __filename };
}
function defaults(pkg, nodePath, workspaceRoot) { return { pkg, nodePath, installRoot: path.join(process.env.LOCALAPPDATA, 'AEAgentCore4'), extensionsDir: path.join(process.env.APPDATA, 'Adobe/CEP/extensions'), configPath: path.join(workspaceRoot, '.codex/config.toml') }; }
if (require.main === module) {
  try {
    const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1];
    if (args[0] === 'rollback' && args.length === 2) console.log(canonical(rollback(path.resolve(args[1]))));
    else {
      const flags = args.slice(1).filter((_, index) => index % 2 === 0);
      if (!['dry-run', 'apply'].includes(args[0]) || args.length % 2 !== 1 || flags.some(f => !['--package', '--node', '--workspace', '--expected-package-hash'].includes(f)) || new Set(flags).size !== flags.length || !flags.includes('--package') || args[0] === 'apply' && !flags.includes('--expected-package-hash')) fail('usage_install_mode_package_node_expected_hash');
      const pkg = verifyPackage(JSON.parse(fs.readFileSync(get('--package'), 'utf8')));
      if (flags.includes('--expected-package-hash') && (!/^[a-f0-9]{64}$/.test(get('--expected-package-hash')) || pkg.packageHash !== get('--expected-package-hash'))) fail('reviewed_package_hash_mismatch');
      const workspace = sourceWorkspace(flags.includes('--workspace') ? get('--workspace') : undefined);
      const plan = planInstall(defaults(pkg, flags.includes('--node') ? get('--node') : process.execPath, workspace.workspaceRoot));
      console.log(canonical(args[0] === 'apply' ? applyInstall(plan) : { dryRun: true, ...workspace, packageHash: pkg.packageHash, expectedPackageHash: pkg.packageHash, releaseDir: plan.descriptor.releaseDir, descriptorPath: plan.descriptorPath, stateDir: plan.descriptor.stateDir, cepDir: plan.cepDir, configPath: plan.configPath, nodePath: plan.descriptor.nodePath, nodeVersion: plan.descriptor.nodeVersion, nodeHash: plan.descriptor.nodeHash, baseline: plan.baseline, liveProof: false }));
    }
  } catch (e) { console.error(canonical({ error: e.code || 'install_failed', ...(e.transactionFile ? { transactionFile: e.transactionFile } : {}) })); process.exitCode = 1; }
}
module.exports = { planInstall, assertPreparedInstallPlan, prepareInstallPlan, assertDurablePreparedInstallPlan, applyInstall, rollback, snapshot, configText, checkRelease };

````

## context/core4__tools__check-boundaries.js

````text
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { reviewCode } = require('../core/artifacts');
const { fail } = require('../protocol/json');
function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(directory, e.name)) : [path.join(directory, e.name)]); }
function checkBoundaries(root = path.resolve(__dirname, '..')) {
  let checked = 0;
  for (const directory of ['modules', 'plan-engine']) for (const file of files(path.join(root, directory)).filter(f => f.endsWith('.js'))) { reviewCode(fs.readFileSync(file, 'utf8')); checked++; }
  for (const file of files(path.join(root, 'core')).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (/require\s*\(\s*['"][^'"]*(?:modules\/|plan-engine\/|integrations\/|bridge-daemon|core-tool-dispatch)/.test(source)) fail('core_domain_import', file);
    if (/require\s*\(\s*[^'"\s]/.test(source)) fail('computed_core_import', file);
    checked++;
  }
  const integration = path.join(root, 'integrations');
  if (fs.existsSync(integration)) for (const file of files(integration).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1].includes('/core/') && match[1] !== '../../core/receiver-api') fail('integration_private_core_import', file);
      if (/bridge-daemon|modules\/|plan-engine\//.test(match[1])) fail('integration_domain_import', file);
    }
    checked++;
  }
  for (const file of files(path.join(root, 'runtime')).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (/require\s*\(\s*[^'"\s]/.test(source) || /require\s*\(\s*['"][^'"]*(?:bridge-daemon|modules\/|plan-engine\/|core-tool-dispatch)/.test(source)) fail('runtime_domain_import', file);
    if (path.basename(file) === 'stdio-entry.js') {
      const prefix = source.slice(0, source.indexOf('async function start('));
      for (const match of prefix.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!match[1].startsWith('node:')) fail('unverified_entry_import', file);
      if (!source.includes('if (manualAsset) {') || source.indexOf("require('./manual-policy.js')") < source.indexOf('if (manualAsset) {') || source.indexOf("require('./windows-reservation-provider.js')") < source.indexOf('if (manualAsset) {')) fail('runtime_optional_policy_import', file);
    }
    checked++;
  }
  return { checked, model: 'reviewed-local-code; conservative source guard; not OS sandbox', liveCalls: 0 };
}
if (require.main === module) { try { console.log(JSON.stringify(checkBoundaries())); } catch (e) { console.error(e.code || e.message); process.exitCode = 1; } }
module.exports = { checkBoundaries, files };

````

## context/core4__runtime__installation-lineage.js

````text
'use strict';
// Historical descriptors/releases are DATA. Never run a historical Node or entry.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyInstallation, verifyRelease, verifyCep } = require('./installation');
const { assertInstallLease } = require('./install-lease');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('lineage_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function read(file) { if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('lineage_path'); const s = fs.lstatSync(file); if (!s.isFile() || s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file) fail('lineage_path'); const b = fs.readFileSync(file); if (b.length > 8 * 1024 * 1024 || !Buffer.from(b.toString('utf8')).equals(b)) fail('lineage_bytes'); return b; }
function historicalDescriptor(bytes, anchor) {
  const d = JSON.parse(bytes.toString('utf8'));
  const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', ...(d.version === 2 ? ['cepDir', 'receiverFormatVersion', 'predecessor'] : [])];
  if (Object.keys(d).length !== keys.length || keys.some(k => !Object.hasOwn(d, k))) fail('lineage_descriptor_schema');
  if (![1, 2].includes(d.version) || d.installRoot !== anchor.installRoot || d.installationId !== anchor.installationId || d.machineId !== anchor.machineId || d.stateDir !== anchor.stateDir || !/^[a-f0-9]{64}$/.test(d.packageHash) || d.releaseDir !== path.join(anchor.installRoot, 'releases', d.packageHash) || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !/^v(2\d|[3-9]\d)\./.test(d.nodeVersion) || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken) || d.panelToken === d.controlToken) fail('lineage_descriptor_binding');
  if (d.version === 1 && Object.hasOwn(d, 'predecessor')) fail('lineage_legacy_predecessor');
  if (d.version === 2 && (d.receiverFormatVersion !== 2 || !path.isAbsolute(d.cepDir) || !Object.hasOwn(d, 'predecessor'))) fail('lineage_descriptor_v2');
  if (d.version === 2 && d.predecessor !== null && (!d.predecessor || Object.keys(d.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.predecessor.transactionId) || !/^[a-f0-9]{64}$/.test(d.predecessor.previousDescriptorHash))) fail('lineage_predecessor');
  const release = JSON.parse(read(path.join(d.releaseDir, 'release.json')));
  if (hash(release) !== d.packageHash) fail('lineage_package_binding'); verifyRelease(d.releaseDir, release);
  return { descriptor: Object.freeze(d), descriptorHash: hash(bytes), release };
}
function resolve({ descriptorPath, descriptorHash, cepDir }, preparedCurrent) {
  if (!/^[a-f0-9]{64}$/.test(descriptorHash)) fail('lineage_target_required');
  const current = preparedCurrent || verifyInstallation(descriptorPath, { ...(cepDir ? { cepDir } : {}) }), anchor = current;
  let bytes = read(descriptorPath), childEdge = null, transactionNames;
  const hashes = new Set(), transactionIds = new Set(), edges = [];
  while (true) {
    const node = historicalDescriptor(bytes, anchor), d = node.descriptor;
    if (hashes.has(node.descriptorHash)) fail('lineage_cycle'); hashes.add(node.descriptorHash);
    if (node.descriptorHash === descriptorHash) return Object.freeze({ current, historical: node, edgeFromHistorical: childEdge, edges: Object.freeze(edges) });
    if (d.version !== 2 || d.predecessor === null) fail('lineage_target_unreachable');
    const p = d.predecessor;
    if (!p || Object.keys(p).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.transactionId) || !/^[a-f0-9]{64}$/.test(p.previousDescriptorHash) || transactionIds.has(p.transactionId)) fail('lineage_predecessor');
    if (!transactionNames) {
      const directory = path.join(anchor.installRoot, 'transactions'), stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(directory) !== directory) fail('lineage_path');
      // A private, single-call snapshot bounds the traversal by existing history,
      // not by the lifetime number of updates. Each edge consumes one unique ID;
      // later files cannot extend the walk. Membership is not trust: read/hash/
      // schema checks below still verify every referenced transaction and release.
      transactionNames = new Set(fs.readdirSync(directory).filter(name => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(name)));
    }
    if (!transactionNames.has(p.transactionId + '.json')) fail('lineage_transaction_not_in_snapshot');
    transactionIds.add(p.transactionId);
    const file = path.join(anchor.installRoot, 'transactions', p.transactionId + '.json'), t = JSON.parse(read(file));
    if (t.version !== 2 || t.transactionId !== p.transactionId || t.installRoot !== anchor.installRoot || t.stateDir !== anchor.stateDir || t.descriptorPath !== descriptorPath || t.appliedDescriptorHash !== node.descriptorHash || typeof t.previousDescriptor !== 'string') fail('lineage_transaction_binding');
    const previous = Buffer.from(t.previousDescriptor, 'base64');
    if (previous.toString('base64') !== t.previousDescriptor || hash(previous) !== p.previousDescriptorHash) fail('lineage_previous_bytes');
    if (!/^[a-f0-9]{64}$/.test(t.preparedPlanHash) || !/^[a-f0-9]{64}$/.test(t.preparedStateHash)) fail('lineage_prepared_plan');
    childEdge = Object.freeze({ transactionId: t.transactionId, childDescriptorHash: node.descriptorHash, childPackageHash: d.packageHash, parentDescriptorHash: p.previousDescriptorHash, preparedPlanHash: t.preparedPlanHash, preparedStateHash: t.preparedStateHash, childNodePath: d.nodePath, childNodeHash: d.nodeHash, childNodeVersion: d.nodeVersion, childCepDir: d.cepDir }); edges.push(childEdge); bytes = previous;
  }
}
function resolveHistoricalInstallation(options) {
  if (Object.keys(options).some(k => !['descriptorPath', 'descriptorHash', 'cepDir'].includes(k))) fail('lineage_runtime_options');
  return resolve(options);
}
function resolveHistoricalForInstall({ descriptorPath, descriptorHash, cepDir, lease, plan }) {
  const d = JSON.parse(read(descriptorPath)); assertInstallLease(lease, { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath });
  // Same private plan, held lease and already-running candidate Node are all
  // mandatory. No Boolean selects weaker runtime verification.
  const fingerprint = require('../tools/install-core4').assertPreparedInstallPlan(plan), c = plan.descriptor;
  if (descriptorPath !== path.join(d.installRoot, 'installation.json') || plan.descriptorPath !== descriptorPath || c.nodePath !== process.execPath || c.nodeHash !== hash(fs.readFileSync(process.execPath)) || c.nodeVersion !== process.version || fingerprint.previousDescriptorHash !== hash(read(descriptorPath))) fail('lineage_install_candidate');
  const node = historicalDescriptor(read(descriptorPath), d), origin = JSON.parse(read(path.join(d.installRoot, 'origin.json'))), anchor = JSON.parse(read(path.join(d.stateDir, 'origin.json')));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId || d.stateDir !== path.join(d.installRoot, 'state/production')) fail('lineage_origin');
  verifyCep(d, node.release, d.version === 2 ? d.cepDir : cepDir);
  return resolve({ descriptorPath, descriptorHash, cepDir }, node.descriptor);
}
module.exports = { resolveHistoricalInstallation, resolveHistoricalForInstall };

````

## context/core4__runtime__native-read-disposition.js

````text
'use strict';
// Fixed semantic reader. No issuance/sign-proof API and no caller validator.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveHistoricalInstallation } = require('./installation-lineage');
const SOURCE_A = 'f3c51cd62a04a09cc8aaf6a0dd4564319c6d7809c2ff132bdb134ba04956120e';
const EXECUTOR = '787a1cc3b2a084a7a2bed11008def8be75aa61e889f48a1469c3db0b7056e019';
const CONTRACT = 'cd0e85894e11e2e070cb73113321b24dfca95b00aa934364313f04319ea6dc5a';
const DISPATCHER = '741824cffa897c8c3f04a9f8f54b81fc3b0fd45c68c5dd4a6afd59e9a3075006';
const DOMAIN = 'AECore4/old-control/terminal-read-failure-disposition/v1';
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('disposition_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail('disposition_schema'); }
function equal(a, b, code = 'disposition_binding') { if (canonical(a) !== canonical(b)) fail(code); }
function validMac(value, actual, secret) { if (typeof actual !== 'string' || !HASH.test(actual)) return false; return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(crypto.createHmac('sha256', secret).update(canonical(value)).digest('hex'))); }
function read(file, max = 64 * 1024 * 1024) { const s = fs.lstatSync(file); if (!s.isFile() || s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file) fail('disposition_path'); const b = fs.readFileSync(file); if (b.length > max) fail('disposition_budget'); return b; }
function decodePrefix(encoded) { if (typeof encoded !== 'string') fail('disposition_prefix'); const b = Buffer.from(encoded, 'base64'); if (b.length > 128 * 1024 || b.toString('base64') !== encoded) fail('disposition_prefix'); return b; }
function parseJournalBytes(bytes) {
  const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes) || !text || !text.endsWith('\n')) fail('disposition_journal_bytes');
  const lines = text.slice(0, -1).split('\n'), events = [];
  for (const line of lines) { if (!line || Buffer.byteLength(line) > 256 * 1024) fail('disposition_journal_budget'); const event = JSON.parse(line), { recordHash, ...body } = event; if (event.seq !== events.length + 1 || event.previousHash !== (events.at(-1)?.recordHash || 'origin') || recordHash !== hash(body)) fail('disposition_journal_hash'); events.push(event); }
  return { events, lines };
}
function fixedPrefix(bytes) {
  const parsed = parseJournalBytes(bytes); if (parsed.events.length !== 3) fail('disposition_prefix_scope');
  const [origin, begin, unknown] = parsed.events;
  exact(origin, ['type', 'identity', 'seq', 'previousHash', 'recordHash']); exact(begin, ['type', 'commandId', 'commandDigest', 'command', 'originalBinding', 'seq', 'previousHash', 'recordHash']); exact(unknown, ['type', 'commandId', 'seq', 'previousHash', 'recordHash']);
  const c = begin.command; exact(c, ['protocolVersion', 'controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'phase', 'payloadHash', 'payload']);
  exact(c.payload, Object.hasOwn(c.payload, 'compId') ? ['compId'] : []);
  if (Object.hasOwn(c.payload, 'compId') && (!Number.isSafeInteger(c.payload.compId) || c.payload.compId < 1)) fail('disposition_payload');
  if (origin.type !== 'origin' || typeof origin.identity !== 'string' || !origin.identity || begin.type !== 'begin' || unknown.type !== 'unknown' || c.protocolVersion !== 1 || c.moduleId !== 'project-inspection' || c.operationId !== 'inspect' || c.phase !== 'inspect' || c.executorHash !== EXECUTOR || c.commandId !== begin.commandId || unknown.commandId !== c.commandId || c.payloadHash !== hash(canonical(c.payload)) || begin.commandDigest !== hash(c)) fail('disposition_effect_scope');
  const keys = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase']; if (keys.some(k => typeof c[k] !== 'string' || !c[k])) fail('disposition_command');
  const binding = { ...Object.fromEntries(keys.map(k => [k, c[k]])), receiverStoreIdentity: origin.identity }; equal(begin.originalBinding, { ...binding, receiptRef: hash(binding) });
  return { origin, begin, unknown, command: c, binding: begin.originalBinding };
}
function validateCaptureSeal(seal, historical, journalPrefixBytes) {
  exact(seal, ['version', 'sourceAHash', 'historicalDescriptorHash', 'oldCepDir', 'journalPrefix', 'capture', 'facts', 'candidate', 'ownerObservation']);
  if (seal.version !== 1 || seal.sourceAHash !== SOURCE_A || seal.historicalDescriptorHash !== historical.descriptorHash || !path.isAbsolute(seal.oldCepDir)) fail('disposition_seal');
  const prefix = decodePrefix(seal.journalPrefix); if (journalPrefixBytes && !prefix.equals(journalPrefixBytes)) fail('disposition_prefix_changed'); const original = fixedPrefix(prefix), d = historical.descriptor, release = historical.release;
  const owner = seal.ownerObservation; exact(owner, ['version', 'path', 'dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs']);
  if (owner.version !== 1 || owner.path !== path.join(d.stateDir, 'receiver/owner') || owner.size !== '0' || ['dev', 'ino', 'birthtimeNs', 'mtimeNs', 'ctimeNs'].some(k => typeof owner[k] !== 'string' || !/^(0|[1-9][0-9]*)$/.test(owner[k])) || owner.ino === '0' || owner.birthtimeNs === '0') fail('disposition_owner_observation');
  const receipt = seal.capture; exact(receipt, ['version', 'purpose', 'proofHash', 'proof', 'transcript', 'result', 'evidenceOnly', 'authority', 'unknownUnchanged']);
  if (receipt.version !== 1 || receipt.purpose !== 'native-read-evidence-capture-v1' || receipt.evidenceOnly !== true || receipt.authority !== false || receipt.unknownUnchanged !== true || receipt.proofHash !== hash(receipt.proof)) fail('disposition_capture');
  equal(receipt.result, { readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' }, 'disposition_failure_profile');
  const p = receipt.proof, admission = JSON.parse(read(path.join(d.releaseDir, 'modules/project-inspection/artifact.json'))), contract = JSON.parse(read(path.join(d.releaseDir, 'modules/project-inspection/contract.json')));
  if (hash(contract) !== CONTRACT || admission.contractHash !== CONTRACT || admission.executorHash !== EXECUTOR || release.hashes['modules/project-inspection/executor.jsx'] !== EXECUTOR || release.hashes['cep/js/poll-dispatcher.js'] !== DISPATCHER || contract.effectPolicy.effect !== 'none' || contract.effectPolicy.continuity !== false || contract.buildSupported !== false || contract.executionPolicy !== 'read-only-current-observation-v1') fail('disposition_fixed_asset');
  const pins = { packageHash: d.packageHash, installationId: d.installationId, executorHash: EXECUTOR };
  if (p.version !== 1 || p.purpose !== receipt.purpose || p.operatorHash !== SOURCE_A || p.descriptorHash !== historical.descriptorHash || p.installationId !== d.installationId || p.machineId !== d.machineId || p.packageHash !== d.packageHash || p.receiverStoreIdentity !== original.origin.identity || p.journalHash !== hash(prefix) || p.journalTailHash !== original.unknown.recordHash || p.commandDigest !== original.begin.commandDigest || p.contractId !== hash({ packageHash: d.packageHash, admission, contract })) fail('disposition_original_proof');
  equal(p.originalBinding, original.binding); equal(p.pins, pins);
  const protectedHashes = p.protectedHashes; if (!protectedHashes || protectedHashes[path.join(d.installRoot, 'installation.json')] !== historical.descriptorHash || protectedHashes[d.nodePath] !== d.nodeHash || protectedHashes[path.join(d.stateDir, 'receiver/completions.ndjson')] !== hash(prefix) || protectedHashes[path.join(d.stateDir, 'receiver/owner')] !== hash(Buffer.alloc(0))) fail('disposition_past_bindings');
  // Only stable origins are checked on disk. Old config/CEP/cache/Node/workspace
  // paths are signed past observations, never current admission dependencies.
  for (const file of [path.join(d.installRoot, 'origin.json'), path.join(d.stateDir, 'origin.json')]) if (hash(read(file)) !== protectedHashes[file]) fail('disposition_stable_origin');
  const oldCep = Object.fromEntries(Object.entries(release.hashes).filter(([file]) => file.startsWith('cep/')).map(([file, digest]) => [file.slice(4), digest]));
  const manual = JSON.parse(read(path.join(d.releaseDir, 'config/admissions/titles-current-target.json')));
  const cfg = { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: EXECUTOR, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: EXECUTOR, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
  oldCep['installation.js'] = hash('window.Core4Installation=' + canonical(cfg) + ';\n'); if (Object.keys(oldCep).length !== 7) fail('disposition_old_cep');
  for (const [file, digest] of Object.entries(oldCep)) if (protectedHashes[path.join(seal.oldCepDir, file)] !== digest) fail('disposition_old_cep');
  if (!Array.isArray(receipt.transcript) || receipt.transcript.length !== 3) fail('disposition_transcript');
  const [challenge, link, complete] = receipt.transcript; exact(challenge, ['route', 'request', 'response']); exact(link, ['route', 'request', 'response']); exact(complete, ['route', 'request', 'response']);
  equal(challenge.request, { role: 'panel' }); if (challenge.route !== '/challenge' || link.route !== '/link' || complete.route !== '/complete') fail('disposition_routes');
  const q = challenge.response; exact(q, ['nonce', 'epoch', 'role', 'origin', 'packageHash', 'installationId', 'executorHash', 'controllerId', 'purpose', 'receiverStoreIdentity', 'commandDigest', 'journalTailHash']);
  if (!HASH.test(q.nonce) || !q.epoch.startsWith('capture-') || q.epoch === original.command.channelEpoch || !['null', 'file://'].includes(q.origin) || q.role !== 'panel' || q.purpose !== receipt.purpose || q.receiverStoreIdentity !== original.origin.identity || q.commandDigest !== p.commandDigest || q.journalTailHash !== p.journalTailHash) fail('disposition_capture_channel');
  equal({ packageHash: q.packageHash, installationId: q.installationId, executorHash: q.executorHash }, pins);
  exact(link.request, ['challenge', 'peerId', 'proof']); equal(link.request.challenge, q); if (typeof link.request.peerId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(link.request.peerId) || !validMac({ challenge: q, peerId: link.request.peerId }, link.request.proof, d.panelToken)) fail('disposition_panel_link_mac');
  exact(link.response, ['body', 'mac']); equal(link.response.body, { linked: true, epoch: q.epoch, peerId: link.request.peerId, controllerId: q.controllerId, pins, receiverStoreIdentity: original.origin.identity, laneClosed: true }); if (!validMac(link.response.body, link.response.mac, d.panelToken)) fail('disposition_panel_response_mac');
  exact(complete.request, ['body', 'mac']); const body = complete.request.body; exact(body, ['epoch', 'peerId', 'sequence', 'method', 'path', 'payload']);
  if (body.epoch !== q.epoch || body.peerId !== link.request.peerId || body.sequence !== 1 || body.method !== 'POST' || body.path !== '/complete' || !validMac(body, complete.request.mac, d.panelToken)) fail('disposition_panel_receipt_mac');
  equal(body.payload, { commandId: original.command.commandId, originalBinding: original.binding, pins, result: receipt.result }); equal(complete.response, { error: 'capture_recorded_no_ack' });
  const facts = seal.facts; exact(facts, ['version', 'witnessHash', 'sourceThread', 'sourceTurn', 'sourceCommandItem', 'originalManagedPid', 'originalManagedExitCode', 'originalDelivered', 'originalTimeout', 'mutatingCommands', 'files', 'producer']);
  if (facts.version !== 1 || facts.witnessHash !== p.provenanceHash || !HASH.test(facts.witnessHash) || facts.originalManagedPid !== p.managedPid || !Number.isSafeInteger(facts.originalManagedPid) || facts.originalManagedPid < 1 || facts.originalManagedExitCode !== 0 || facts.originalDelivered !== true || facts.originalTimeout !== 'host_callback_timeout' || facts.mutatingCommands !== 0 || ['sourceThread', 'sourceTurn', 'sourceCommandItem'].some(k => typeof facts[k] !== 'string' || !facts[k])) fail('disposition_provenance_facts');
  const fileNames = ['context.json', 'requests.jsonl', 'stdio.raw.jsonl', 'exit.jsonl', 'original-managed-command-evidence.json', 'original-receiver-journal.jsonl'].sort();
  if (!Array.isArray(facts.files) || canonical(facts.files.map(f => f.name).sort()) !== canonical(fileNames)) fail('disposition_provenance_files'); for (const file of facts.files) { exact(file, ['name', 'sha256']); if (!HASH.test(file.sha256)) fail('disposition_provenance_files'); }
  if (facts.files.find(f => f.name === 'original-receiver-journal.jsonl').sha256 !== hash(prefix)) fail('disposition_provenance_journal');
  const producer = facts.producer; exact(producer, ['driverHash', 'sourceAHash', 'pid', 'exitCode', 'globalTimeoutMs', 'completionTimeoutMs', 'contextHash', 'stdoutHash', 'exitHash']);
  if (producer.driverHash !== 'b763348b9a6139b2b6bd143a1cc25bc38b3bc3c2ca50d37ca584d2a34691196a' || producer.sourceAHash !== SOURCE_A || !Number.isSafeInteger(producer.pid) || producer.pid < 1 || producer.exitCode !== 0 || producer.globalTimeoutMs !== 600000 || producer.completionTimeoutMs !== 15000 || ['contextHash', 'stdoutHash', 'exitHash'].some(k => !HASH.test(producer[k]))) fail('disposition_producer_facts');
  exact(seal.candidate, ['packageHash', 'installRoot', 'stateDir', 'descriptorPath', 'cepDir', 'nodePath', 'nodeHash', 'nodeVersion']);
  if (!HASH.test(seal.candidate.packageHash) || seal.candidate.installRoot !== d.installRoot || seal.candidate.stateDir !== d.stateDir || seal.candidate.descriptorPath !== path.join(d.installRoot, 'installation.json') || seal.candidate.cepDir !== seal.oldCepDir || !path.isAbsolute(seal.candidate.nodePath) || !HASH.test(seal.candidate.nodeHash) || !/^v(2\d|[3-9]\d)\./.test(seal.candidate.nodeVersion)) fail('disposition_candidate');
  return Object.freeze({ command: original.command, binding: original.binding, pins, result: receipt.result, journalPrefixHash: hash(prefix), journalTailHash: original.unknown.recordHash });
}
function inspectSealedDispositionFacts(event, { historical, journalPrefixBytes }) {
  exact(event, ['type', 'dispositionVersion', 'commandId', 'seal', 'authorization', 'controlMac', 'seq', 'previousHash', 'recordHash']);
  if (event.type !== 'terminal-read-failure-disposition' || event.dispositionVersion !== 1 || event.seq !== 4) fail('disposition_event');
  const semantic = validateCaptureSeal(event.seal, historical, journalPrefixBytes), a = event.authorization;
  exact(a, ['domain', 'version', 'operation', 'proofHash', 'nonce', 'operatorClosureHash', 'installationId', 'receiverStoreIdentity', 'commandId', 'journalPrefixHash', 'journalTailHash', 'historicalDescriptorHash', 'candidatePackageHash', 'installTransactionId', 'appliedDescriptorHash', 'preparedPlanHash', 'preparedStateHash', 'dispositionTransactionId']);
  if (a.domain !== DOMAIN || a.version !== 1 || a.operation !== 'terminal-read-failure-disposition-and-install' || a.proofHash !== hash(event.seal) || !HASH.test(a.nonce) || !HASH.test(a.operatorClosureHash) || a.installationId !== historical.descriptor.installationId || a.receiverStoreIdentity !== semantic.binding.receiverStoreIdentity || a.commandId !== semantic.command.commandId || a.journalPrefixHash !== semantic.journalPrefixHash || a.journalTailHash !== semantic.journalTailHash || a.historicalDescriptorHash !== historical.descriptorHash || a.candidatePackageHash !== event.seal.candidate.packageHash || !UUID.test(a.installTransactionId) || !UUID.test(a.dispositionTransactionId) || !HASH.test(a.appliedDescriptorHash) || !HASH.test(a.preparedPlanHash) || !HASH.test(a.preparedStateHash) || event.commandId !== a.commandId || event.previousHash !== a.journalTailHash || !validMac({ domain: DOMAIN, seal: event.seal, authorization: a }, event.controlMac, historical.descriptor.controlToken)) fail('disposition_control_authorization');
  // Pure facts/crypto inspection only. This return is not runtime settlement.
  return Object.freeze({ semantic, authorization: a });
}
function verifyDispositionInstallEdge(event, edge) {
  const a = event.authorization, c = event.seal.candidate;
  if (!edge || edge.transactionId !== a.installTransactionId || edge.childPackageHash !== a.candidatePackageHash || edge.childDescriptorHash !== a.appliedDescriptorHash || edge.preparedPlanHash !== a.preparedPlanHash || edge.preparedStateHash !== a.preparedStateHash || edge.childNodePath !== c.nodePath || edge.childNodeHash !== c.nodeHash || edge.childNodeVersion !== c.nodeVersion || edge.childCepDir !== c.cepDir) fail('disposition_install_lineage');
}
function validateDisposition(event, options = {}) {
  if (Object.keys(options).some(key => !['descriptorPath', 'cepDir', 'journalPrefixBytes'].includes(key))) fail('runtime_disposition_context');
  const { descriptorPath, cepDir, journalPrefixBytes } = options;
  const resolved = resolveHistoricalInstallation({ descriptorPath, descriptorHash: event.seal.historicalDescriptorHash, cepDir });
  if (resolved.current.version !== 2) fail('disposition_runtime_v2_required');
  const inspected = inspectSealedDispositionFacts(event, { historical: resolved.historical, journalPrefixBytes }); verifyDispositionInstallEdge(event, resolved.edgeFromHistorical); return inspected.semantic;
}
function assertReceiverJournalSettled(options) {
  if (Object.keys(options).some(key => !['directory', 'descriptorPath', 'cepDir'].includes(key))) fail('runtime_disposition_context');
  const { directory, descriptorPath, cepDir } = options;
  const parsed = parseJournalBytes(read(path.join(directory, 'completions.ndjson'))), records = new Map(); let identity;
  for (const event of parsed.events) {
    if (event.type === 'origin') { if (event.seq !== 1 || typeof event.identity !== 'string' || !event.identity) fail('receiver_store_corrupt'); identity = event.identity; }
    else if (event.type === 'begin') {
      if (!identity || records.has(event.commandId) || event.commandId !== event.command?.commandId || event.commandDigest !== hash(event.command)) fail('receiver_store_corrupt');
      const fields = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase'], binding = { ...Object.fromEntries(fields.map(k => [k, event.command[k]])), receiverStoreIdentity: identity };
      equal(event.originalBinding, { ...binding, receiptRef: hash(binding) }, 'receiver_store_corrupt'); records.set(event.commandId, { state: 'ongoing' });
    }
    else if (event.type === 'complete' || event.type === 'unknown') { const prior = records.get(event.commandId); if (prior?.state !== 'ongoing') fail('receiver_store_corrupt'); prior.state = event.type === 'complete' ? 'completed' : 'unknown'; }
    else if (event.type === 'terminal-read-failure-disposition') { const prior = records.get(event.commandId); if (prior?.state !== 'unknown' || prior.settled) fail('receiver_store_corrupt'); validateDisposition(event, { descriptorPath, cepDir, journalPrefixBytes: Buffer.from(parsed.lines.slice(0, 3).join('\n') + '\n') }); prior.settled = true; }
    else fail('receiver_store_corrupt');
  }
  if ([...records.values()].some(r => r.state !== 'completed' && !r.settled)) fail('runtime_receiver_unresolved');
}
function assertRollbackReaderCompatible({ directory, target }) {
  const file = path.join(directory, 'completions.ndjson'); if (!fs.existsSync(file)) return;
  const { events } = parseJournalBytes(read(file));
  if (!target && events.length > 1) fail('rollback_reader_unsupported');
  if (events.some(e => e.type === 'terminal-read-failure-disposition')) {
    if (!target || target.version !== 2 || target.receiverFormatVersion !== 2) fail('rollback_reader_unsupported');
    const manifest = JSON.parse(read(path.join(target.releaseDir, 'release.json'))); if (hash(manifest) !== target.packageHash) fail('rollback_target_package');
    const contract = JSON.parse(read(path.join(target.releaseDir, 'runtime/receiver-contract.json'))); if (hash(read(path.join(target.releaseDir, 'runtime/receiver-contract.json'))) !== manifest.hashes['runtime/receiver-contract.json'] || contract.version !== 1 || contract.descriptorVersion !== 2 || contract.journalFormat !== 2 || contract.terminalReadFailureDispositionVersion !== 1) fail('rollback_reader_unsupported');
  }
}
module.exports = { validateCaptureSeal, inspectSealedDispositionFacts, verifyDispositionInstallEdge, validateDisposition, parseJournalBytes, assertReceiverJournalSettled, assertRollbackReaderCompatible };

````

## context/core4__tools__disposition-install-preflight.js

````text
'use strict';
// Installer-only port. Runtime/store never imports this module or accepts a
// pending-plan flag. Both lease AND the same prepared-plan object are required.
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { assertInstallLease } = require('../runtime/install-lease');
const { resolveHistoricalForInstall } = require('../runtime/installation-lineage');
const { inspectSealedDispositionFacts, verifyDispositionInstallEdge, parseJournalBytes } = require('../runtime/native-read-disposition');
function inspectPreparedDisposition(event, { descriptorPath, cepDir, journalPrefixBytes, plan, lease }) {
  // Lazy require avoids a module-init cycle; this is always the same module
  // instance that produced the in-memory plan, never JSON rehydration.
  const fingerprint = require('./install-core4').assertPreparedInstallPlan(plan);
  const scope = { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath };
  const held = assertInstallLease(lease, scope);
  if (descriptorPath !== plan.descriptorPath || cepDir !== plan.cepDir) fail('prepared_disposition_scope');
  const resolved = resolveHistoricalForInstall({ descriptorPath, descriptorHash: event.seal.historicalDescriptorHash, cepDir, lease, plan });
  const data = inspectSealedDispositionFacts(event, { historical: resolved.historical, journalPrefixBytes });
  if (resolved.edgeFromHistorical) verifyDispositionInstallEdge(event, resolved.edgeFromHistorical);
  else {
    require('./install-core4').assertDurablePreparedInstallPlan(plan, { lease });
    const a = data.authorization;
    if (resolved.historical.descriptorHash !== hash(fs.readFileSync(descriptorPath)) || fingerprint.transactionId !== a.installTransactionId || fingerprint.packageHash !== a.candidatePackageHash || fingerprint.appliedDescriptorHash !== a.appliedDescriptorHash || fingerprint.previousDescriptorHash !== a.historicalDescriptorHash || fingerprint.preparedPlanHash !== a.preparedPlanHash || fingerprint.preparedStateHash !== a.preparedStateHash || !['validated', 'disposition-appended', 'receiver-archived'].includes(held.phase)) fail('prepared_disposition_plan_mismatch');
    const candidate = event.seal.candidate, d = plan.descriptor;
    if (candidate.installRoot !== d.installRoot || candidate.stateDir !== d.stateDir || candidate.cepDir !== d.cepDir || candidate.nodePath !== d.nodePath || candidate.nodeHash !== d.nodeHash || candidate.nodeVersion !== d.nodeVersion) fail('prepared_disposition_candidate');
  }
  return Object.freeze({ facts: data.semantic, requiresInstallSwitch: !resolved.edgeFromHistorical });
}
function assertPreparedReceiverJournalSettled({ directory, descriptorPath, cepDir, plan, lease }) {
  require('./install-core4').assertPreparedInstallPlan(plan);
  const held = assertInstallLease(lease, { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath });
  const bytes = fs.readFileSync(path.join(directory, 'completions.ndjson')), parsed = parseJournalBytes(bytes), records = new Map(); let identity;
  for (const event of parsed.events) {
    if (event.type === 'origin') { if (event.seq !== 1 || typeof event.identity !== 'string') fail('receiver_store_corrupt'); identity = event.identity; }
    else if (event.type === 'begin') {
      if (records.has(event.commandId) || event.commandDigest !== hash(event.command) || event.originalBinding?.receiverStoreIdentity !== identity) fail('receiver_store_corrupt');
      const fields = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase'], binding = { ...Object.fromEntries(fields.map(k => [k, event.command[k]])), receiverStoreIdentity: identity };
      if (canonical(event.originalBinding) !== canonical({ ...binding, receiptRef: hash(binding) })) fail('receiver_store_corrupt'); records.set(event.commandId, { state: 'ongoing' });
    } else if (event.type === 'unknown' || event.type === 'complete') { const prior = records.get(event.commandId); if (prior?.state !== 'ongoing') fail('receiver_store_corrupt'); prior.state = event.type === 'complete' ? 'completed' : 'unknown'; }
    else if (event.type === 'terminal-read-failure-disposition') {
      const prior = records.get(event.commandId); if (prior?.state !== 'unknown' || prior.admittedForInstall) fail('receiver_store_corrupt');
      const checked = inspectPreparedDisposition(event, { descriptorPath, cepDir, plan, lease, journalPrefixBytes: Buffer.from(parsed.lines.slice(0, 3).join('\n') + '\n') });
      if (checked.requiresInstallSwitch && (held.phase !== 'receiver-archived' || held.checkpoint?.journalHash !== hash(bytes))) fail('prepared_disposition_archive_not_certified');
      prior.admittedForInstall = true;
    } else fail('receiver_store_corrupt');
  }
  if ([...records.values()].some(r => r.state !== 'completed' && !r.admittedForInstall)) fail('runtime_receiver_unresolved');
}
module.exports = { inspectPreparedDisposition, assertPreparedReceiverJournalSettled };

````

## context/core4__integrations__cep__completion-store.js

````text
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, bounded, parse, canonical, id, fail, sameDispatch } = require('../../core/receiver-api');
const { validateDisposition } = require('../../runtime/native-read-disposition');
// No automatic orphan/PID recovery. An abandoned owner permits proof reads only.
function openCompletionStore({ directory, io = fs, installationContext }) {
  if (!directory || !path.isAbsolute(directory)) fail('explicit_receiver_store_required');
  io.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'completions.ndjson'), ownerFile = path.join(directory, 'owner');
  let owner, closed = false, fault = false, events = [], identity;
  const records = new Map();
  const isSettled = record => record.state === 'completed' || record.state === 'unknown' && !!record.terminalDisposition;
  try { owner = io.openSync(ownerFile, 'wx'); } catch (e) { if (e.code !== 'EEXIST') throw e; closed = true; }
  function append(event) {
    if (closed || fault || owner === undefined) fail('receiver_lane_closed');
    const body = { ...event, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' };
    const record = { ...body, recordHash: hash(body) }, line = bounded(record) + '\n';
    let fd;
    try {
      fd = io.openSync(file, 'a');
      if (io.writeSync(fd, line) !== Buffer.byteLength(line)) fail('receiver_short_write');
      io.fsyncSync(fd); io.closeSync(fd); fd = undefined;
    } catch (e) { fault = true; closed = true; throw e; }
    finally { if (fd !== undefined) { try { io.closeSync(fd); } catch { fault = true; closed = true; } } }
    events.push(record); return record;
  }
  try {
    if (io.existsSync(file)) {
      const data = io.readFileSync(file, 'utf8');
      if (!data || !data.endsWith('\n')) fail('receiver_store_corrupt');
      const lines = data.slice(0, -1).split('\n');
      for (const line of lines) {
        const event = parse(line), { recordHash, ...body } = event;
        if (event.seq !== events.length + 1 || event.previousHash !== (events.at(-1)?.recordHash || 'origin') || recordHash !== hash(body)) fail('receiver_store_corrupt');
        if (!events.length) { if (event.type !== 'origin' || typeof event.identity !== 'string') fail('receiver_store_corrupt'); identity = event.identity; }
        else if (event.type === 'begin') {
          if (records.has(event.commandId) || event.originalBinding.receiverStoreIdentity !== identity || !sameDispatch(event.originalBinding, event.originalBinding) || event.commandDigest !== hash(event.command)) fail('receiver_store_corrupt');
          records.set(event.commandId, { state: 'ongoing', command: event.command, originalBinding: event.originalBinding });
        } else if (event.type === 'complete' || event.type === 'unknown') {
          const prior = records.get(event.commandId);
          if (!prior || prior.state !== 'ongoing') fail('receiver_store_corrupt');
          records.set(event.commandId, { ...prior, state: event.type === 'complete' ? 'completed' : 'unknown', ...(event.response ? { response: event.response } : {}) });
        } else if (event.type === 'terminal-read-failure-disposition') {
          const prior = records.get(event.commandId);
          if (!prior || prior.state !== 'unknown' || prior.terminalDisposition || !installationContext || Object.keys(installationContext).some(key => !['descriptorPath', 'cepDir'].includes(key))) fail('receiver_disposition_context');
          const semantic = validateDisposition(event, { ...installationContext, journalPrefixBytes: Buffer.from(lines.slice(0, 3).join('\n') + '\n') });
          if (canonical(prior.command) !== canonical(semantic.command) || canonical(prior.originalBinding) !== canonical(semantic.binding)) fail('receiver_disposition_binding');
          records.set(event.commandId, { ...prior, terminalDisposition: { version: 1, pins: semantic.pins, result: semantic.result } });
        } else fail('receiver_store_corrupt');
        events.push(event);
      }
    } else { identity = id('receiver-store'); append({ type: 'origin', identity }); }
    if ([...records.values()].some(r => !isSettled(r))) closed = true;
  } catch { fault = true; closed = true; }
  return Object.freeze({
    get identity() { return identity; },
    get closed() { return closed || fault; },
    get fault() { return fault; },
    has(commandId) { return records.has(commandId); },
    get(commandId) { if (fault) return undefined; const value = records.get(commandId); return value && JSON.parse(canonical(value)); },
    begin(command, originalBinding) {
      if (records.has(command.commandId)) fail('duplicate_command_no_replay');
      if (closed || fault || [...records.values()].some(r => !isSettled(r))) fail('receiver_lane_closed');
      if (!sameDispatch(originalBinding, originalBinding) || originalBinding.receiverStoreIdentity !== identity) fail('receiver_store_binding');
      append({ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding });
      records.set(command.commandId, { state: 'ongoing', command: JSON.parse(canonical(command)), originalBinding });
    },
    complete(commandId, response) {
      const record = records.get(commandId); if (!record || record.state !== 'ongoing') fail('receiver_completion_order');
      append({ type: 'complete', commandId, response });
      records.set(commandId, { ...record, state: 'completed', response: JSON.parse(canonical(response)) });
    },
    unknown(commandId) {
      const record = records.get(commandId);
      if (record?.state === 'ongoing' && !fault && !closed) {
        try { append({ type: 'unknown', commandId }); records.set(commandId, { ...record, state: 'unknown' }); } finally { closed = true; }
      }
    },
    close() {
      closed = true;
      // Retain the owner marker whenever physical lifetime or durability is ambiguous.
      if (owner !== undefined) {
        io.closeSync(owner); owner = undefined;
        if (!fault && [...records.values()].every(isSettled)) io.unlinkSync(ownerFile);
      }
    }
  });
}
module.exports = { openCompletionStore, sourceHash: hash(fs.readFileSync(__filename)) };

````

## context/core4__integrations__cep__http-peer.js

````text
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { hash, canonical, parse, bounded, exact, fail, id, dispatchBinding, decode, encode, envelope } = require('../../core/receiver-api');
const { openCompletionStore } = require('./completion-store');
const { mac, validMac, requestBody } = require('./peer-protocol');
function createHttpPeer({ installation, directory, asset, additionalAssets = [], port = 3457, timeout = 30000, pollTimeout = 15000, admissionGuard = () => {}, installationContext }) {
  const store = openCompletionStore({ directory, installationContext });
  const epoch = id('http'), controllerId = id('controller');
  let peer = null, pending = null, closed = false, activePoll = null;
  const challenges = new Map();
  const assets = new Map([asset, ...additionalAssets].map(a => [a.executorHash, a])); let brokerBinding;
  const pins = Object.freeze({ packageHash: installation.packageHash, executorHash: asset.executorHash, installationId: installation.installationId });
  const commandPins = command => ({ ...pins, executorHash: command.executorHash });
  function disconnect(reason) { if (pending) { store.unknown(pending.command.commandId); pending.reject(Object.assign(new Error(reason), { code: reason })); clearTimeout(pending.timer); pending = null; } }
  function frame() { return pending && !pending.delivered ? { assetKey: assets.get(pending.command.executorHash).assetKey, phase: pending.command.phase, typedPayload: pending.command.payload, commandId: pending.command.commandId, originalBinding: pending.binding, pins: commandPins(pending.command) } : null; }
  function deliver() { if (activePoll && frame()) { const poll = activePoll; activePoll = null; const value = frame(); pending.delivered = true; poll(value); } }
  function status() { return { listening: server.listening, port: server.address()?.port || port, peer: peer ? { connected: Date.now() - peer.lastSeen < 45000, peerId: peer.peerId } : { connected: false }, receiverStoreIdentity: store.identity || null, storeClosed: store.closed, storeFault: store.fault, pending: pending ? { commandId: pending.command.commandId, delivered: pending.delivered } : null, unknown: store.closed, automaticLifecycle: 'unavailable', externalLegacyCoverage: 'unobserved' }; }
  function reply(res, statusCode, value, origin) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) }); res.end(bounded(value));
  }
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    let corsOrigin;
    try {
      if (closed || req.headers.host !== '127.0.0.1:' + server.address().port || req.socket.remoteAddress !== '127.0.0.1') fail('loopback_host_required');
      // Package-owned CEP file origins. They are accepted only with fresh role-secret MAC;
      // never wildcard CORS, cookies, unauthenticated status or source ingress.
      if ((origin !== 'null' && origin !== 'file://') || req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'origin').length !== 1) fail('cep_origin_required');
      corsOrigin = origin;
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': corsOrigin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }); res.end(); return; }
      if (req.method !== 'POST') fail('post_required');
      let bytes = 0, chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 256 * 1024) fail('frame_too_large'); chunks.push(chunk); }
      const input = parse(Buffer.concat(chunks));
      if (req.url === '/challenge') {
        exact(input, ['role']); if (!['panel', 'control'].includes(input.role)) fail('role_required');
        for (const [key, c] of challenges) if (Date.now() - c.time > 10000) challenges.delete(key);
        if (challenges.size >= 16) fail('challenge_backpressure');
        const nonce = crypto.randomBytes(32).toString('hex'); const value = { nonce, epoch, role: input.role, origin: corsOrigin, ...pins, controllerId };
        challenges.set(nonce, { value, time: Date.now() }); reply(res, 200, value, corsOrigin); return;
      }
      if (req.url === '/link') {
        exact(input, ['challenge', 'peerId', 'proof']); const challenge = challenges.get(input.challenge?.nonce); challenges.delete(input.challenge?.nonce);
        const role = challenge?.value.role, secret = role === 'panel' ? installation.panelToken : installation.controlToken;
        if (!challenge || origin !== challenge.value.origin || Date.now() - challenge.time > 10000 || canonical(input.challenge) !== canonical(challenge.value) || typeof input.peerId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.peerId) || !validMac({ challenge: input.challenge, peerId: input.peerId }, input.proof, secret)) fail('peer_auth');
        if (role !== 'panel') fail('panel_role_required');
        if (peer && (Date.now() - peer.lastSeen < 45000 || pending)) fail('duplicate_peer');
        peer = { peerId: input.peerId, origin: challenge.value.origin, sequence: 0, lastSeen: Date.now() };
        const body = { linked: true, epoch, peerId: peer.peerId, controllerId, pins, receiverStoreIdentity: store.identity, laneClosed: store.closed };
        reply(res, 200, { body, mac: mac(body, secret) }, corsOrigin); return;
      }
      exact(input, ['body', 'mac']); const b = requestBody(input.body);
      if (!peer || origin !== peer.origin || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, installation.panelToken)) fail('peer_auth_or_replay');
      peer.sequence = b.sequence; peer.lastSeen = Date.now();
      function signed(payload) { const body = { epoch, peerId: peer.peerId, sequence: b.sequence, payload }; reply(res, 200, { body, mac: mac(body, installation.panelToken) }, corsOrigin); }
      if (req.url === '/poll') {
        exact(b.payload, []); if (activePoll) fail('concurrent_poll');
        if (pending && !pending.delivered) { try { admissionGuard(pending.command); } catch (e) { disconnect(e.code || 'physical_admission_closed'); throw e; } }
        if (frame()) { const value = frame(); pending.delivered = true; signed({ command: value }); return; }
        await new Promise(resolve => {
          const timer = setTimeout(() => { if (activePoll === finish) activePoll = null; signed({ command: null }); resolve(); }, pollTimeout);
          const finish = value => { clearTimeout(timer); signed({ command: value }); resolve(); };
          activePoll = finish;
          res.on('close', () => { if (activePoll === finish) { activePoll = null; clearTimeout(timer); resolve(); } });
        }); return;
      }
      if (req.url === '/complete') {
        exact(b.payload, ['commandId', 'originalBinding', 'pins', 'result']);
        const c = store.get(b.payload.commandId);
        // Current-channel MAC/Origin/sequence already passed above. Historical
        // pins/result come only from a fixed verified disposition, before the
        // normal current-package correlation. No promotion/event/eval occurs.
        if (c?.state === 'unknown' && c.terminalDisposition) {
          if (canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(c.terminalDisposition.pins) !== canonical(b.payload.pins) || canonical(c.terminalDisposition.result) !== canonical(b.payload.result)) fail('historical_completion_correlation');
          signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return;
        }
        if (!c || canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(b.payload.pins) !== canonical(commandPins(c.command))) fail('completion_correlation');
        if (c.state === 'completed') { if (canonical(c.response.result) !== canonical(b.payload.result)) fail('completion_conflict'); signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return; }
        if (!pending || c.state !== 'ongoing' || !pending.delivered || pending.command.commandId !== b.payload.commandId) fail('unknown_no_promotion');
        const result = b.payload.result;
        const selectedAsset = assets.get(c.command.executorHash);
        if (result.readFailureVersion === 1) {
          exact(result, ['readFailureVersion', 'outcome', 'code']);
          if (result.outcome !== 'rejected' || !['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable'].includes(result.code)) fail('inspection_result');
        } else if (selectedAsset.resultProfile === 'manual-text-v1') {
          if (c.command.phase === 'mutate') {
            exact(result, ['outcome', 'snapshot', 'code', 'transactionReceipt']);
            if (result.outcome === 'unknown') { disconnect('manual_effect_unknown'); fail('manual_effect_unknown'); }
            if (!['applied', 'rejected'].includes(result.outcome)) fail('manual_result');
          } else { exact(result, ['target', 'revision', 'text', 'protected']); if (!result.target || typeof result.revision !== 'string' || typeof result.text !== 'string' || typeof result.protected !== 'string') fail('manual_snapshot'); }
        } else {
          // Private asset-selected versioned observation profile. No caller chooses
          // the validator and no lifecycle/session is manufactured for discovery.
          exact(result, ['observationVersion', 'target', 'project', 'compositions', 'layers', 'truncated', 'aeVersion']);
          if (result.observationVersion !== 1 || !result.target || !result.project || !Array.isArray(result.compositions) || result.compositions.length > 50 || !Array.isArray(result.layers) || result.layers.length > 100 || typeof result.truncated !== 'boolean' || typeof result.aeVersion !== 'string') fail('inspection_result');
          exact(result.target, ['projectId', 'compId']); exact(result.project, ['name', 'numItems', 'saved']);
          if (result.target.projectId !== null && typeof result.target.projectId !== 'string' || result.target.compId !== null && (!Number.isSafeInteger(result.target.compId) || result.target.compId < 1) || typeof result.project.name !== 'string' || !Number.isSafeInteger(result.project.numItems) || result.project.numItems < 0 || typeof result.project.saved !== 'boolean') fail('inspection_result');
          for (const item of result.compositions) { exact(item, ['compId', 'name', 'numLayers', 'duration']); if (!Number.isSafeInteger(item.compId) || item.compId < 1 || typeof item.name !== 'string' || !Number.isSafeInteger(item.numLayers) || item.numLayers < 0 || typeof item.duration !== 'number' || item.duration < 0) fail('inspection_result'); }
          for (const item of result.layers) { exact(item, ['layerId', 'index', 'name', 'textLayer']); if (!Number.isSafeInteger(item.layerId) || item.layerId < 1 || !Number.isSafeInteger(item.index) || item.index < 1 || typeof item.name !== 'string' || typeof item.textLayer !== 'boolean') fail('inspection_result'); }
        }
        const response = { protocolVersion: 1, commandId: c.command.commandId, executorHash: c.command.executorHash, payloadHash: c.command.payloadHash, result }; store.complete(b.payload.commandId, response);
        const done = pending; pending = null; clearTimeout(done.timer);
        signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } });
        if (result.readFailureVersion === 1) done.reject(Object.assign(new Error(result.code || 'inspection_failed'), { code: result.code || 'inspection_failed' })); else done.resolve(done.broker ? response : { observation: result, originalBinding: c.originalBinding, pins: commandPins(c.command), continuity: false });
        return;
      }
      fail('unknown_peer_route');
    } catch (e) { reply(res, e.code === 'frame_too_large' ? 413 : 403, { error: e.code || 'peer_request_failed' }, corsOrigin); }
  });
  function submit(command, broker = false) {
    const selected = assets.get(command.executorHash);
    if (!selected || selected.moduleId && (selected.moduleId !== command.moduleId || selected.operationId !== command.operationId) || !['inspect', 'mutate', 'verify'].includes(command.phase) || command.phase !== 'inspect' && selected.resultProfile !== 'manual-text-v1') fail('http_asset_not_admitted');
    admissionGuard(command);
    if (closed || store.closed) fail('receiver_lane_closed'); if (!peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); if (pending) fail('physical_lane_pending');
    const binding = dispatchBinding(command, store.identity); store.begin(command, binding);
    return new Promise((resolve, reject) => { pending = { command, binding, resolve, reject, broker, delivered: false, timer: setTimeout(() => disconnect('host_callback_timeout'), timeout) }; deliver(); });
  }
  return Object.freeze({
    status,
    identity: hash({ packageHash: installation.packageHash, assets: [...assets.values()] }),
    transport: Object.freeze({
      async connect(value) { if (store.closed || !peer || Date.now() - peer.lastSeen > 45000) fail('panel_unavailable'); exact(value, ['controllerId', 'channelEpoch', 'secret']); brokerBinding = Object.freeze({ ...value }); return { receiverStoreIdentity: store.identity }; },
      async send(frame) { if (!brokerBinding) fail('transport_disconnected'); const command = envelope(decode(frame, brokerBinding.secret)); if (command.controllerId !== brokerBinding.controllerId || command.channelEpoch !== brokerBinding.channelEpoch) fail('controller_binding'); return encode(await submit(command, true), brokerBinding.secret); },
      async completion(commandId) { if (!brokerBinding) fail('transport_disconnected'); const c = store.get(commandId); return encode({ commandId, state: c?.state || 'unknown', ...(c?.originalBinding ? { originalBinding: c.originalBinding } : {}), ...(c?.response ? { response: c.response } : {}) }, brokerBinding.secret); },
      async disconnect() { if (pending) fail('physical_lane_pending'); brokerBinding = undefined; }
    }),
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return status(); },
    inspect(payload = {}) {
      exact(payload, ['compId']); if (payload.compId !== undefined && (!Number.isSafeInteger(payload.compId) || payload.compId < 1)) fail('invalid_comp_id');
      const command = { protocolVersion: 1, controllerId, channelEpoch: epoch, commandId: id('inspect'), moduleId: 'project-inspection', operationId: 'inspect', executorHash: asset.executorHash, phase: 'inspect', payloadHash: hash(canonical(payload)), payload };
      return submit(command);
    },
    async close() { closed = true; disconnect('runtime_closed'); if (activePoll) { const poll = activePoll; activePoll = null; poll(null); } await new Promise(resolve => server.close(resolve)); store.close(); }
  });
}
module.exports = { createHttpPeer };

````

## context/core4__test__installed-composition.test.js

````text
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), http = require('node:http');
const { fork, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { hash, canonical } = require('../protocol/json');
const { buildPackage, verifyPackage } = require('../tools/package-installable');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { verifyInstallation, verifyRelease, verifyCep } = require('../runtime/installation');
const { mac } = require('../integrations/cep/peer-protocol');
const root = path.resolve(__dirname, '..');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'core4-composition-'));
test('installed-composition portable fixed-format1 transition to readonly preserves signed history and no replay', { timeout: 30000 }, async () => {
  const result = await require('./fixtures/installed-composition-transition').transition(); assert.equal(result.historicalFormat, 1); assert.equal(result.candidateFormat, 2);
});
function install(pkg) {
  const directory = temp(), args = { pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'config.toml'), machineId: os.hostname() };
  const applied = applyInstall(planInstall(args)); return { directory, args, descriptor: applied.descriptorPath, d: verifyInstallation(applied.descriptorPath) };
}
function edit(pkg, file, transform) {
  const value = JSON.parse(Buffer.from(pkg.files[file], 'base64')); transform(value); const bytes = canonical(value);
  pkg.files[file] = Buffer.from(bytes).toString('base64'); pkg.release.hashes[file] = hash(bytes); pkg.packageHash = hash(pkg.release); return pkg;
}
function rpcChild(f) {
  const child = fork(path.join(f.d.releaseDir, 'runtime/stdio-entry.js'), ['--installation', f.descriptor], { execArgv: ['--require', path.join(__dirname, 'fixtures/installed-composition-child.js')], stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true, cwd: os.tmpdir() });
  let buffer = '', stderr = '', next = 0; const pending = new Map();
  child.stdout.on('data', bytes => { buffer += bytes; while (buffer.includes('\n')) { const n = buffer.indexOf('\n'), value = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(value.id)?.(value); pending.delete(value.id); } });
  child.stderr.on('data', b => { stderr += b; });
  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.stdin.write(canonical({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const call = async (name, payload = {}) => { const response = await rpc('tools/call', { name, arguments: { payload } }); if (response.error) throw new Error(response.error.message); return JSON.parse(response.result.content[0].text); };
  const message = event => new Promise(resolve => { const handler = value => { if (value.event === event) { child.off('message', handler); resolve(value); } }; child.on('message', handler); });
  return { child, rpc, call, message, async close() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; assert.equal(stderr, ''); } };
}
function raw(port, route, value) { return new Promise((resolve, reject) => { const request = http.request('http://127.0.0.1:' + port + route, { method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => { let bytes = ''; response.on('data', b => { bytes += b; }); response.on('end', () => resolve({ status: response.statusCode, value: JSON.parse(bytes) })); }); request.on('error', reject); request.end(canonical(value)); }); }
async function panel(port, d) {
  const challenge = (await raw(port, '/challenge', { role: 'panel' })).value, peerId = 'composition-fixture';
  const linked = await raw(port, '/link', { challenge, peerId, proof: mac({ challenge, peerId }, d.panelToken) }); assert.equal(linked.status, 200); let sequence = 0;
  return async (route, payload) => { const body = { epoch: challenge.epoch, peerId, sequence: ++sequence, method: 'POST', path: route, payload }; const response = await raw(port, route, { body, mac: mac(body, d.panelToken) }); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, d.panelToken)); return response.value.body.payload; };
}
test('installed-composition deterministic packages, fixed ES3 registries, admission pins and physical closure', () => {
  for (const selector of ['manual', 'readonly']) {
    const pkg = buildPackage(root, selector); assert.equal(pkg.packageHash, buildPackage(root, selector).packageHash); assert.equal(verifyPackage(pkg), pkg); assert.equal(pkg.release.format, 2);
    const composition = JSON.parse(Buffer.from(pkg.files['runtime/composition.json'], 'base64'));
    assert.equal(composition.id, selector); assert.equal(composition.engine === null, selector === 'readonly');
    if (selector === 'readonly') assert.ok(Object.keys(pkg.files).every(file => !/^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file)));
    const source = Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString();
    const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});console.log('ES3 PASS');";
    const parsed = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: source, encoding: 'utf8', windowsHide: true }); assert.equal(parsed.status, 0, parsed.stderr);
    const context = vm.createContext({ JSON: undefined, Object, Error }); vm.runInContext(source, context);
    for (const phase of ['constructor', 'toString', '__proto__']) assert.throws(() => vm.runInContext('AECore4Host.dispatch(' + JSON.stringify(canonical({ assetKey: composition.assets[0].assetKey, phase, pins: { executorHash: JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64')).executorHash } })) + ')', context), /fixed_asset_binding/);
  }
  assert.equal(buildPackage().packageHash, buildPackage(root, 'manual').packageHash); assert.throws(() => buildPackage(root, 'other'), /composition_selector/);
});
test('installed-composition build CLI selects readonly/manual and rejects ambiguous options without output', () => {
  const directory = temp(), cli = path.join(root, 'tools/package-installable.js');
  for (const selector of ['readonly', 'manual', null]) {
    const file = path.join(directory, (selector || 'default') + '.json'), args = ['--output', file, ...(selector ? ['--composition', selector] : [])];
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(fs.readFileSync(file)).packageHash, buildPackage(root, selector || 'manual').packageHash);
  }
  let index = 0;
  for (const options of [['--composition', ''], ['--composition', 'other'], ['--composition', 'readonly', '--composition', 'manual'], ['--unknown', 'readonly'], ['--composition'], ['--output', 'relative.json']]) {
    const file = path.join(directory, 'denied-' + index++ + '.json'), result = spawnSync(process.execPath, [cli, '--output', file, ...options], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 1); assert.equal(fs.existsSync(file), false);
  }
});
test('installed-composition unknown/missing/corrupt/duplicate/path/phase/catalog/admission/downgrade failures', () => {
  const make = () => structuredClone(buildPackage());
  const mutations = [
    p => { p.release.format = 99; p.packageHash = hash(p.release); },
    p => { delete p.files['runtime/composition.json']; delete p.release.hashes['runtime/composition.json']; p.packageHash = hash(p.release); },
    p => { p.files['runtime/composition.json'] = Buffer.from('{}').toString('base64'); },
    p => edit(p, 'runtime/composition.json', c => { c.version = 2; }),
    p => edit(p, 'runtime/composition.json', c => { c.extra = true; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets.push(c.assets[0]); }),
    p => edit(p, 'runtime/composition.json', c => { c.modules.push(c.modules[0]); }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].path = '../outside'; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].phases = ['mutate']; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].policy = 'other'; }),
    p => edit(p, 'config/catalog.json', c => { c.modules.pop(); }),
    p => edit(p, 'config/admissions/titles-current-target.json', c => { c.revoked = true; }),
    p => edit(p, 'config/admissions/titles-current-target.json', c => { c.executorHash = '0'.repeat(64); }),
    p => { p.release.format = 1; p.packageHash = hash(p.release); },
    p => { p.release.format = 1; delete p.files['runtime/composition.json']; delete p.release.hashes['runtime/composition.json']; p.packageHash = hash(p.release); }
  ];
  for (const mutate of mutations) { const pkg = make(); mutate(pkg); assert.throws(() => verifyPackage(pkg)); }
  const readonly = buildPackage(root, 'readonly'); edit(readonly, 'config/catalog.json', c => { c.engine = { path: 'plan-engine', artifactHash: '0'.repeat(64) }; }); assert.throws(() => verifyPackage(readonly), /composition_catalog/);
});
test('installed-composition installed readonly child initialize/status/discovery/contract and native fake VM inspection', { timeout: 15000 }, async () => {
  const pkg = buildPackage(root, 'readonly'), f = install(pkg), h = rpcChild(f); let nativeCalls = 0;
  try {
    const listening = await h.message('listening'); assert.notEqual(listening.port, 3457);
    assert.equal((await h.rpc('initialize')).result.serverInfo.name, 'ae-agent-core4');
    let status = await h.call('core_status'); assert.equal(status.composition, 'readonly'); assert.equal(status.manualPolicy, null); assert.equal(status.resourceProvider, null); assert.equal(status.mutationAvailable, false); assert.equal(status.physical.inspectionAvailable, false); assert.equal(status.automaticLifecycle, 'unavailable');
    assert.deepEqual((await h.call('list_modules')).modules.map(m => m.id), ['project-inspection']);
    const contract = await h.call('get_module_contract', { moduleId: 'project-inspection' }); assert.equal(contract.contract.buildSupported, false);
    await assert.rejects(h.call('get_module_contract', { moduleId: 'titles' }), /module_unavailable/);
    await assert.rejects(h.call('build_solution_plan', { contractId: contract.contractId }), /read_only_module_build_unsupported/);
    const call = await panel(listening.port, f.d);
    status = await h.call('core_status'); assert.equal(status.physical.inspectionAvailable, true); assert.equal(status.connection, 'unavailable');
    const connected = await h.call('core_connect'); assert.equal(connected.available, true); assert.equal(connected.mutationAvailable, false);
    function CompItem() { this.id = 7; this.name = 'Synthetic comp'; this.numLayers = 0; this.duration = 5; }
    const comp = new CompItem(), context = vm.createContext({ JSON: undefined, Math, Error, CompItem, app: { version: 'synthetic', project: { file: null, numItems: 1, item: () => comp } } });
    vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
    const pending = h.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
    const polled = await call('/poll', {}); assert.ok(polled.command); nativeCalls++;
    const result = JSON.parse(vm.runInContext('AECore4Host.dispatch(' + JSON.stringify(canonical(polled.command)) + ')', context)); assert.equal(result.readFailureVersion, undefined);
    await call('/complete', { commandId: polled.command.commandId, originalBinding: polled.command.originalBinding, pins: polled.command.pins, result });
    assert.equal((await pending).authority, false); assert.equal(nativeCalls, 1);
    const cacheReply = h.message('cache'); h.child.send('cache'); const loaded = (await cacheReply).modules;
    assert.ok(loaded.every(file => !/[\\/](manual-policy|windows-reservation-provider)\.js$|[\\/]plan-engine[\\/]|[\\/]modules[\\/](titles|photo-placeholder)/.test(file)));
  } finally { await h.close(); }
});
test('installed-composition actual manual installed child retains module discovery and manual gated policy', { timeout: 15000 }, async () => {
  const f = install(buildPackage()), h = rpcChild(f);
  try { await h.message('listening'); const status = await h.call('core_status'); assert.equal(status.composition, 'manual'); assert.equal(status.manualPolicy, 'current-matching-target-after-local-confirmation-v1'); assert.ok(status.resourceProvider); assert.equal(status.automaticLifecycle, 'unavailable'); assert.deepEqual((await h.call('list_modules')).modules.map(m => m.id), ['photo-placeholder', 'titles', 'titles-current-target', 'project-inspection']); assert.equal((await h.call('get_module_contract', { moduleId: 'titles-current-target' })).operationId, 'set-current-text'); }
  finally { await h.close(); }
});
test('installed-composition installed format2 corruption/missing composition rejects before imports and legacy format1 generic verification stays generic', () => {
  const f = install(buildPackage(root, 'readonly')), composition = path.join(f.d.releaseDir, 'runtime/composition.json'), bytes = fs.readFileSync(composition);
  const rejectedChild = pattern => { const result = spawnSync(process.execPath, [path.join(f.d.releaseDir, 'runtime/stdio-entry.js'), '--installation', f.descriptor], { input: '', encoding: 'utf8', timeout: 5000, windowsHide: true }); assert.equal(result.status, 1); assert.match(result.stderr, pattern); assert.equal(result.stdout, ''); };
  fs.writeFileSync(composition, '{}'); assert.throws(() => verifyInstallation(f.descriptor), /installed_release_bytes/); rejectedChild(/installed_release_bytes/); fs.writeFileSync(composition, bytes);
  fs.renameSync(composition, composition + '.missing'); assert.throws(() => verifyInstallation(f.descriptor), /release_tree_mismatch/); rejectedChild(/release_tree_mismatch/); fs.renameSync(composition + '.missing', composition);
  const dir = temp(), source = 'historical generic release'; fs.writeFileSync(path.join(dir, 'data'), source); const release = { version: '4.0.0', format: 1, hashes: { data: hash(source) } }; fs.writeFileSync(path.join(dir, 'release.json'), canonical(release)); assert.doesNotThrow(() => verifyRelease(dir, release));
  assert.throws(() => verifyCep(f.d, { ...JSON.parse(fs.readFileSync(path.join(f.d.releaseDir, 'release.json'))), format: 99 }, f.d.cepDir));
});

````

## context/core4__test__exact-f548-transition.test.js

````text
'use strict';
const test = require('node:test');
test('exact-f548-transition code artifact to readonly with fresh synthetic state', { timeout: 30000 }, async () => {
  console.log(JSON.stringify(await require('./fixtures/exact-f548-transition').exactTransition()));
});

````

## context/core4__test__fixtures__installed-composition-transition.js

````text
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { fork } = require('node:child_process');
const { recoveryFixture } = require('./native-read-recovery');
const { canonical, hash } = require('../../protocol/json');
const { openCompletionStore } = require('../../integrations/cep/completion-store');
const { createHttpPeer } = require('../../integrations/cep/http-peer');
const { mac } = require('../../integrations/cep/peer-protocol');
const http = require('node:http');
async function transition(historicalPackage) {
  const f = await recoveryFixture({ historicalPackage, selector: 'readonly' }), prefix = fs.readFileSync(f.journal);
  const child = fork(path.join(__dirname, 'disposition-child.js'), [f.fixtureFile], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true }); let stderr = '', done;
  child.stdout.resume(); child.stderr.on('data', b => { stderr += b; });
  child.on('message', message => { if (message.event === 'native_read_disposition_authorization') { const { event, ...body } = message; child.send({ ...body, decision: 'approve' }); } if (message.event === 'fixture_result') done = message.value; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); assert.equal(code, 0, stderr); assert.equal(done.packageHash, f.candidate.packageHash);
  const d = require('../../runtime/installation').verifyInstallation(f.args.descriptor), events = fs.readFileSync(f.journal).toString().trimEnd().split('\n').map(JSON.parse);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'runtime/composition.json'))).id, 'readonly'); assert.ok(fs.readFileSync(f.journal).subarray(0, prefix.length).equals(prefix)); assert.equal(events[2].type, 'unknown'); assert.equal(events[3].type, 'terminal-read-failure-disposition');
  const options = { descriptorPath: f.args.descriptor, journalPrefixBytes: prefix }, reader = require('../../runtime/native-read-disposition'); assert.ok(reader.validateDisposition(events[3], options));
  const bad = structuredClone(events[3]); bad.controlMac = '0'.repeat(64); assert.throws(() => reader.validateDisposition(bad, options));
  const store = openCompletionStore({ directory: f.receiver, installationContext: { descriptorPath: f.args.descriptor } }); assert.equal(store.closed, false); assert.equal(store.fault, false); assert.equal(store.get(f.command.commandId).state, 'unknown'); assert.ok(store.get(f.command.commandId).terminalDisposition); assert.throws(() => store.begin(f.command, f.binding), /duplicate_command_no_replay/); store.close();
  // A late ACK authenticates with the new panel role secret but preserves old pins.
  const peer = createHttpPeer({ installation: d, directory: f.receiver, port: 0, asset: { assetKey: 'project-inspection-v1', executorHash: f.command.executorHash }, installationContext: { descriptorPath: f.args.descriptor } }); await peer.listen();
  function raw(route, value) { return new Promise((resolve, reject) => { const request = http.request('http://127.0.0.1:' + peer.status().port + route, { method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => { let data = ''; response.on('data', b => { data += b; }); response.on('end', () => resolve({ status: response.statusCode, value: JSON.parse(data) })); }); request.on('error', reject); request.end(canonical(value)); }); }
  try {
    const challenge = (await raw('/challenge', { role: 'panel' })).value, peerId = 'transition-fixture'; assert.equal((await raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, d.panelToken) })).status, 200);
    const payload = { commandId: f.command.commandId, originalBinding: f.binding, pins: f.pins, result: { readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' } };
    const before = fs.readFileSync(f.journal);
    for (let sequence = 1; sequence <= 2; sequence++) { const body = { epoch: challenge.epoch, peerId, sequence, method: 'POST', path: '/complete', payload }, response = await raw('/complete', { body, mac: mac(body, d.panelToken) }); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, d.panelToken)); }
    assert.ok(before.equals(fs.readFileSync(f.journal)));
  } finally { await peer.close(); }
  const prior = fs.readFileSync(f.journal).toString().trimEnd().split('\n').map(JSON.parse), command = { ...f.command, commandId: 'additional-unknown' }, binding = require('../../protocol/dispatch').dispatchBinding(command, f.binding.receiverStoreIdentity); let tail = prior.at(-1);
  for (const entry of [{ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding: binding }, { type: 'unknown', commandId: command.commandId }]) { const body = { ...entry, seq: tail.seq + 1, previousHash: tail.recordHash }; tail = { ...body, recordHash: hash(body) }; fs.appendFileSync(f.journal, canonical(tail) + '\n'); }
  const closed = openCompletionStore({ directory: f.receiver, installationContext: { descriptorPath: f.args.descriptor } }); assert.equal(closed.closed, true); assert.equal(closed.fault, false); assert.ok(closed.get(f.command.commandId).terminalDisposition); closed.close(); assert.ok(fs.existsSync(f.owner));
  return { historicalPackageHash: f.pkg.packageHash, candidatePackageHash: f.candidate.packageHash, historicalFormat: f.pkg.release.format, candidateFormat: f.candidate.release.format, signedDisposition: true, originalUnknownPreserved: true, duplicateNoReplay: true, lateAckCount: 2, additionalUnknownClosesStore: true, nativeCalls: 0, productionCalls: 0 };
}
module.exports = { transition };

````

## context/core4__test__fixtures__installed-composition-child.js

````text
'use strict';
// Test preload: real installed direct-main entry, ephemeral listener, cache report.
// No runtime production flags, credentials or provider injection.
const net = require('node:net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (port, host, ...rest) {
  if (port !== 3457 || host !== '127.0.0.1') throw new Error('fixture_unexpected_listener');
  this.once('listening', () => process.send({ event: 'listening', port: this.address().port }));
  return listen.call(this, 0, host, ...rest);
};
process.on('message', value => { if (value === 'cache') process.send({ event: 'cache', modules: Object.keys(require.cache) }); });

````

## context/core4__test__fixtures__fixed-format1-package.js

````text
'use strict';
// Portable semantic legacy fixture, NOT the byte-identical historical f548 build.
// Current reviewed code bytes retain the fixed format1 two-asset CEP contract.
const { buildPackage, verifyPackage } = require('../../tools/package-installable');
const { hash, canonical } = require('../../protocol/json');
function fixedFormat1Package() {
  const pkg = structuredClone(buildPackage());
  delete pkg.files['runtime/composition.json']; delete pkg.release.hashes['runtime/composition.json']; pkg.release.format = 1;
  const add = (file, value) => { const bytes = typeof value === 'string' ? value : canonical(value); pkg.files[file] = Buffer.from(bytes).toString('base64'); pkg.release.hashes[file] = hash(bytes); };
  add('runtime/profiles.json', { profiles: [{ id: 'project-inspection', path: 'modules/project-inspection', executionPolicy: 'read-only-current-observation-v1' }] });
  add('runtime/source-package.json', { version: 1, files: Object.keys(pkg.files).sort(), artifactClosures: [] });
  const read = file => Buffer.from(pkg.files[file], 'base64').toString();
  const inspection = JSON.parse(read('modules/project-inspection/artifact.json')), manual = JSON.parse(read('config/admissions/titles-current-target.json'));
  add('cep/jsx/registry.jsx', '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + read('runtime/host/json-codec.jsx') + ';var executor=' + read('modules/project-inspection/executor.jsx') + ';var manual=' + read('modules/titles-current-target/executor.jsx') + ';var assets={"project-inspection-v1":{hash:"' + inspection.executorHash + '",calls:{inspect:executor.inspect}},"titles-current-target-v1":{hash:"' + manual.executorHash + '",calls:{inspect:manual.inspect,mutate:manual.mutate,verify:manual.verify}}};return {dispatch:function(serialized){var frame=JSON.parse(serialized),a=frame&&assets[frame.assetKey],call=a&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:"inspection_failed"});}}};}());\n');
  pkg.packageHash = hash(pkg.release); return verifyPackage(pkg);
}
module.exports = { fixedFormat1Package };

````

## context/core4__test__fixtures__native-read-recovery.js

````text
'use strict';
// Synthetic test-only installation/provenance model, never AE attestation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {hash,canonical}=require('../../protocol/json');const {dispatchBinding}=require('../../protocol/dispatch');
const {buildPackage}=require('../../tools/package-installable');const {planInstall}=require('../../tools/install-core4');
const {legacyV1Data}=require('./legacy-installation-v1');const {createCapture}=require('../../tools/capture-native-read');
const {buildOperatorPackage,writeOperatorPackage}=require('../../tools/package-native-read-operator');
function fixture({ historicalPackage } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-native-capture-')), evidenceRoot = path.join(directory, 'evidence'); fs.mkdirSync(evidenceRoot);
  const pkg = historicalPackage || require('./fixed-format1-package').fixedFormat1Package(), config = path.join(directory, 'project/.codex/config.toml');
  const plan = planInstall({ pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: config, machineId: os.hostname() });
  const installed = legacyV1Data(plan), descriptor = installed.descriptorPath, d = JSON.parse(fs.readFileSync(descriptor)), receiver = path.join(d.stateDir, 'receiver'), broker = path.join(d.stateDir, 'broker'); fs.mkdirSync(receiver); fs.mkdirSync(broker);
  // Real Broker constructor layout, including one stale identity. Contents are
  // copied as fixture DATA and deliberately never imported from this cache.
  const core = JSON.parse(Buffer.from(pkg.files['core/artifact.json'], 'base64')), stalePkg = structuredClone(pkg), staleCore = structuredClone(core);
  const staleSource = Buffer.from(stalePkg.files['core/broker.js'], 'base64').toString() + '\n// inert historical fixture code copy\n'; stalePkg.files['core/broker.js'] = Buffer.from(staleSource).toString('base64'); staleCore.hashes['core/broker.js'] = hash(staleSource);
  const staleManifestBytes = JSON.stringify(staleCore, null, 2) + '\n'; stalePkg.files['core/artifact.json'] = Buffer.from(staleManifestBytes).toString('base64'); stalePkg.release.hashes['core/broker.js'] = hash(staleSource); stalePkg.release.hashes['core/artifact.json'] = hash(staleManifestBytes); stalePkg.packageHash = hash(stalePkg.release);
  const staleRelease = path.join(d.installRoot, 'releases', stalePkg.packageHash); for (const [file, encoded] of Object.entries(stalePkg.files)) { const target = path.join(staleRelease, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(encoded, 'base64')); } fs.writeFileSync(path.join(staleRelease, 'release.json'), canonical(stalePkg.release));
  const cacheRoot = path.join(broker, 'artifacts'), caches = [hash(core), hash(staleCore)];
  for (const [index, identity] of caches.entries()) for (const file of Object.keys(core.hashes)) { const target = path.join(cacheRoot, 'core-' + identity, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from((index ? stalePkg : pkg).files[file], 'base64')); }
  const admission = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64')), contract = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/contract.json'], 'base64'));
  const command = { protocolVersion: 1, controllerId: 'original-controller', channelEpoch: 'original-http-epoch', commandId: 'inspect-original', moduleId: 'project-inspection', operationId: 'inspect', executorHash: admission.executorHash, phase: 'inspect', payloadHash: hash(canonical({})), payload: {} };
  const identity = 'receiver-store-offline-fixture', binding = dispatchBinding(command, identity), events = [];
  function event(value) { const body = { ...value, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; events.push({ ...body, recordHash: hash(body) }); }
  event({ type: 'origin', identity }); event({ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding: binding }); event({ type: 'unknown', commandId: command.commandId });
  const journal = path.join(receiver, 'completions.ndjson'), owner = path.join(receiver, 'owner'); fs.writeFileSync(journal, events.map(canonical).join('\n') + '\n'); fs.writeFileSync(owner, '');
  const start = new Date(Date.now() - 60000).toISOString(), end = new Date(Date.now() - 30000).toISOString(), pid = 123456789;
  const contractId = hash({ packageHash: d.packageHash, admission, contract });
  const status = { pid, installation: { installationId: d.installationId, packageHash: d.packageHash, machineId: d.machineId }, ledgerFault: false, ownershipFault: null, unresolved: [], worker: { pid: null, pending: 0 }, physical: { receiverStoreIdentity: identity, storeFault: false, storeClosed: false, pending: null, unknown: false } };
  const content = value => ({ result: { content: [{ type: 'text', text: canonical(value) }], isError: false } });
  const request = (id, name, payload) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: payload ? { payload } : {} } });
  const requests = [request(2, 'core_status'), request(3, 'get_module_contract', { moduleId: 'project-inspection' }), request(4, 'inspect_module_target', { moduleId: 'project-inspection', contractId: 'invalid', target: {} }), request(5, 'inspect_module_target', { moduleId: 'project-inspection', contractId, target: {} }), request(6, 'core_status'), request(8, 'core_status')];
  const replies = [{ id: 2, ...content(status) }, { id: 3, ...content({ contract, contractId, modulePin: hash(admission) }) }, { id: 4, error: { message: 'contract_required' } }, { id: 6, ...content({ ...status, physical: { ...status.physical, pending: { commandId: command.commandId, delivered: true } } }) }, { id: 5, error: { message: 'host_callback_timeout' } }, { id: 8, ...content({ ...status, physical: { ...status.physical, storeClosed: true, unknown: true } }) }];
  const managed = { sourceThread: 'fixture-thread', sourceTurn: 'fixture-turn', item: { type: 'commandExecution', id: 'fixture-command-item', command: d.nodePath + ' original-client.js ' + d.packageHash, cwd: evidenceRoot, status: 'completed', exitCode: 0, output: { truncated: false, text: JSON.stringify({ proof: 'child_started', pid, packageHash: d.packageHash }) } } };
  const evidence = { 'context.json': JSON.stringify({ at: start, packageHash: d.packageHash, automaticNativeDispatch: false, recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check' } }), 'requests.jsonl': requests.map(canonical).join('\n') + '\n', 'stdio.raw.jsonl': replies.map(canonical).join('\n') + '\n', 'exit.jsonl': canonical({ at: end, code: 0, signal: null }) + '\n', 'original-managed-command-evidence.json': JSON.stringify(managed), 'original-receiver-journal.jsonl': fs.readFileSync(journal) };
  for (const [name, bytes] of Object.entries(evidence)) fs.writeFileSync(path.join(evidenceRoot, name), bytes);
  const provenance = path.join(evidenceRoot, 'provenance.json'), witness = { version: 1, evidenceOnly: true, authority: false, sourceThread: managed.sourceThread, sourceTurn: managed.sourceTurn, sourceCommandItem: managed.item.id, managedProcess: { pid, contextBeforeSpawn: start, endedByUtc: end, exitCode: 0, packageHash: d.packageHash }, installationId: d.installationId, receiverStoreIdentity: identity, journalHash: hash(fs.readFileSync(journal)), originalCommand: command, originalBinding: binding, observations: { preDispatchStatus: 2, contractReply: 3, definiteRefusal: 4, soleDispatchedRequest: 5, deliveredStatus: 6, postTimeoutStatus: 8, successfulNativeReads: 0, mutatingCommands: 0 }, files: Object.keys(evidence).map(file => ({ file, sha256: hash(fs.readFileSync(path.join(evidenceRoot, file))) })) };
  fs.writeFileSync(provenance, canonical(witness));
  const args = { descriptor, provenance, cepDir: plan.cepDir, config, evidenceRoot }, probes = { probePid: () => 'dead', probePort: () => 'absent', probeProcesses: async (_, __, paths) => ({ version: 1, matchedPids: [], pathsChecked: paths.length, observedAt: new Date().toISOString() }) };
  const pins = { packageHash: d.packageHash, installationId: d.installationId, executorHash: command.executorHash }, frame = { assetKey: 'project-inspection-v1', phase: 'inspect', typedPayload: {}, commandId: command.commandId, originalBinding: binding, pins };
  function bytes() { return Object.fromEntries([descriptor, config, journal, owner, path.join(d.installRoot, 'origin.json'), path.join(d.stateDir, 'origin.json'), ...caches.flatMap(identity => Object.keys(core.hashes).map(file => path.join(cacheRoot, 'core-' + identity, file))), ...Object.keys(pkg.files).filter(f => f.startsWith('cep/')).map(f => path.join(plan.cepDir, f.slice(4))), path.join(plan.cepDir, 'installation.js')].map(f => [f, fs.readFileSync(f).toString('base64')])); }
  return { directory, evidenceRoot, pkg, args, d, probes, witness, command, binding, pins, frame, journal, owner, broker, receiver, cacheRoot, caches, core, stalePkg, staleRelease, bytes, gates: [path.join(d.installRoot, 'install.lock'), path.join(broker, 'broker-owner.gate')] };
}
function raw(port, route, value) { return new Promise((resolve,reject)=>{const req=http.request('http://127.0.0.1:'+port+route,{method:'POST',agent:false,headers:{Origin:'file://','Content-Type':'application/json'}},res=>{let s='';res.on('data',b=>s+=b);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(s)}));});req.on('error',reject);req.end(canonical(value));}); }
function mac(value,secret){return crypto.createHmac('sha256',secret).update(canonical(value)).digest('hex');}
async function recoveryFixture(options = {}){
  const f=fixture(options),producerDriver=path.join(__dirname,'manual-capture-driver-source.txt'),inspection=path.join(f.evidenceRoot,'capture-inspection.json'),initial=await createCapture(f.probes).inspect(f.args);fs.writeFileSync(inspection,JSON.stringify({at:new Date().toISOString(),...initial},null,2)+'\n');
  const op=createCapture({...f.probes,port:0}),started=new Date().toISOString(),pending=op.capture({...f.args,expectedProofHash:initial.proofHash}),observed=pending.then(value=>({value}),error=>({error}));
  for(let n=0;n<1000&&!op.status().listening;n++){const out=await Promise.race([observed,new Promise(r=>setTimeout(()=>r(null),5))]);if(out)throw out.error||new Error('fixture_capture_ended');}
  const port=op.status().port,challenge=(await raw(port,'/challenge',{role:'panel'})).value,peerId='fixture-recovery';
  const linked=await raw(port,'/link',{challenge,peerId,proof:mac({challenge,peerId},f.d.panelToken)});if(linked.status!==200)throw new Error('fixture_link');
  const payload={commandId:f.command.commandId,originalBinding:f.binding,pins:f.pins,result:{readFailureVersion:1,outcome:'rejected',code:'host_registry_unavailable'}},body={epoch:challenge.epoch,peerId,sequence:1,method:'POST',path:'/complete',payload};
  const response=await raw(port,'/complete',{body,mac:mac(body,f.d.panelToken)});if(response.value.error!=='capture_recorded_no_ack')throw new Error('fixture_capture_no_ack');
  const result=await pending,capture=path.join(result.transaction,'receipt.json'),producerSession=path.join(f.evidenceRoot,'manual-live-fixture');fs.mkdirSync(producerSession);
  const meta={version:1,at:started,driverHash:hash(fs.readFileSync(producerDriver)),operatorHash:initial.proof.operatorHash,inspectionHash:hash(fs.readFileSync(inspection)),proofHash:initial.proofHash,packageHash:f.d.packageHash,descriptorHash:hash(fs.readFileSync(f.args.descriptor)),recordContext:{purpose:'technical_check',lifetime:'ephemeral_check',context:'original cached read receipt, one human button action'},globalTimeoutMs:600000,completionTimeoutMs:15000,automaticNativeDispatch:false,ackAllowed:false,authority:false};
  fs.writeFileSync(path.join(producerSession,'context.json'),JSON.stringify(meta,null,2)+'\n');
  // Supervisor endpoint label models the exact root output format; actual fixture
  // HTTP above is explicitly ephemeral and is not a production3457/live proof.
  fs.writeFileSync(path.join(producerSession,'stdout.raw.log'),canonical({event:'capture_listening',port:3457,proofHash:initial.proofHash,transaction:result.transaction,manualWaitMs:600000})+'\n'+canonical(result)+'\n');
  fs.writeFileSync(path.join(producerSession,'exit.json'),canonical({at:new Date().toISOString(),pid:333333331,code:0,signal:null})+'\n');
  const bundle=buildOperatorPackage(),operatorRoot=path.join(f.directory,'operator');writeOperatorPackage(operatorRoot,bundle);
  const candidate=structuredClone(buildPackage(undefined, options.selector || 'manual')),css=Buffer.from(candidate.files['cep/panel.css'],'base64').toString()+'\n/* recovery fixture candidate */\n';candidate.files['cep/panel.css']=Buffer.from(css).toString('base64');candidate.release.hashes['cep/panel.css']=hash(css);candidate.packageHash=hash(candidate.release);
  const packageFile=path.join(f.directory,'candidate.json');fs.writeFileSync(packageFile,canonical(candidate));
  const args={...f.args,capture,producerSession,producerDriver,inspection,package:packageFile,expectedPackageHash:candidate.packageHash};
  const config={operatorRoot,operatorHash:bundle.operatorHash,args};const fixtureFile=path.join(f.directory,'operator-fixture.json');fs.writeFileSync(fixtureFile,canonical(config));
  return {...f,capture,producerSession,producerDriver,inspection,operatorRoot,operatorHash:bundle.operatorHash,candidate,args,fixtureFile};
}
module.exports={recoveryFixture};

````

## context/core4__test__fixtures__exact-f548-transition.js

````text
'use strict';
// Explicit historical CODE artifact only. All credentials/state are fresh temp data.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { hash } = require('../../protocol/json');
const file = path.resolve(__dirname, '../../..', 'dist/core4/4.0.0-panel-reconnect-f54863dbb69b/core4-4.0.0.json');
async function exactTransition() {
  const bytes = fs.readFileSync(file), pkg = JSON.parse(bytes);
  assert.equal(bytes.length, 343626); assert.equal(hash(bytes), 'dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8');
  assert.equal(pkg.packageHash, 'f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90'); assert.equal(hash(pkg.release), pkg.packageHash);
  require('../../tools/package-installable').verifyPackage(pkg);
  const result = await require('./installed-composition-transition').transition(pkg);
  return { evidence: 'exact-historical-code/temp-synthetic-state', artifact: file, artifactBytes: bytes.length, artifactSha256: hash(bytes), ...result };
}
if (require.main === module) exactTransition().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.code || error.stack); process.exitCode = 1; });
module.exports = { exactTransition };

````

