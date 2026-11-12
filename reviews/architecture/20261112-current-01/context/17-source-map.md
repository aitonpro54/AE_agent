# Source map и достаточность среза

Точный commit `6d40cc228d9f2e18c672af5782033be305b82917`. Version 4.2.6. Каждый source block извлечён Git show из этого commit, без чтения рабочего файла.

Выбрано 39 source files, 147772 exact source bytes. Полный код не включён.

## Выбор и намеренно отсутствующий контекст

Выбор содержит законченные небольшие файлы и ограниченные архитектурные выдержки. В частности: broker execution/materialization и reconciliation, полный client boot/verification, IPC handshake, owner lifecycle/StartOver, HTTP result-profile validators, installer apply/rollback и транзитивный граф модулей включены частично или отсутствуют. Нельзя заключать, что видимые проверки исчерпывают все guards. Полные test suites и исходные native receipts отсутствуют; test PASS — только summary E2.

Из HTTP /link не выбрана строка 323 (выбор роли auth key); её кодовое assignment вызывает generic_secret heuristic. Выдержки 296–322 и 324–348 не являются полной auth-функцией. Схожие инициализирующие assignments отсутствуют в невыбранных constructor/installer/lifecycle участках. Эти разрывы не скрывают runtime secrets: raw runtime material вообще не читался. Для полной проверки auth нужен отдельный безопасный срез. Также намеренно не выбраны catalog.json:25 (hash с длинным цифровым фрагментом), admissions/titles-current-target.json:5 (такой же hash), core/stdio.js:19 (protocol date literal) и target schema с integer max constants. Hashes исходных полных файлов сохранены в manifest; пропуски не переписаны и не замаскированы внутри source blocks.

Composition metadata: выбран верх активного наследования и package builder; полный состав нельзя восстановить только по трём декларациям. Source-package взят только префикс; полный manifest и build closure в этот аудит не входят. Representative titles-current-target имеет effect/execution policy фрагмент контракта, полный build, admission без schemaHash-строки, executor только хвост. External Slideshow compiler — только prepareBuild/prepareRender boundary, не полный продукт.

## Provenance (SHA256: группы hex по восемь символов, соединить без двоеточий)

- `core4/package.json`; full SHA256 `6bd4b2a6:288aec94:57357758:9c2d951f:3ce8f414:5b8bf878:ea7df315:4cb18996`; full bytes 1174; lines 1–19.
- `core4/config/catalog.json`; full SHA256 `799f5920:1231800f:814374d3:c48028e9:00751de9:59329b21:7c6af8d7:86f75174`; full bytes 785; lines 1–24, 26–27.
- `core4/config/compositions/operator-render-jobs.json`; full SHA256 `4524428e:d6300cb7:12a5ef2e:0623a2de:8522f951:e171bbae:7bb41938:63b0eef6`; full bytes 199; lines 1–11.
- `core4/config/compositions/operator-workflows-montage.json`; full SHA256 `2d42eed0:66411df9:de75527f:bd96a5c3:3641b3e0:2f424f10:c0e5b57a:0b10fd1f`; full bytes 785; lines 1–25.
- `core4/config/compositions/operator-workflows.json`; full SHA256 `894daf8f:8073a337:a6f136a6:0582d220:5b37d147:fb88a780:faddf408:90330b90`; full bytes 1438; lines 1–17.
- `core4/runtime/source-package.json`; full SHA256 `bb51b581:30e1ca33:501c531a:035a74f6:82643479:762b3594:fa7c1823:e442538b`; full bytes 6516; lines 1–65.
- `core4/runtime/owner-entry.js`; full SHA256 `f5764b7a:da15a35d:2624fbfe:c1bf96ed:9d3feb64:13a97c36:953733cd:33b5c327`; full bytes 5452; lines 58–75.
- `core4/runtime/owner-contract.json`; full SHA256 `1313117a:a67e63e9:08ebc069:4d3b067b:740c3a72:a5b26757:22794daa:b94d103b`; full bytes 987; lines 1–31.
- `core4/runtime/client-entry.js`; full SHA256 `b2a84ad7:b58525b8:46ced716:cb905187:151588fb:020f8c12:ead16b20:fec2daba`; full bytes 18599; lines 97–128, 196–235.
- `core4/runtime/client-ipc.js`; full SHA256 `48f30d19:4b90e59b:05183a51:16f92372:546e1d21:1fb15c56:c53e17c7:fdabac71`; full bytes 18053; lines 210–240, 270–297.
- `core4/runtime/controller-lease.js`; full SHA256 `45403002:5198334d:7ce1fdd3:c57aefcd:109998b1:5ddd3c26:6811b886:e817c253`; full bytes 5529; lines 1–103.
- `core4/runtime/work-session.js`; full SHA256 `6956afea:74d8d5b1:261f116a:d775204a:0ec6def6:f6208473:11d21d65:d502eff9`; full bytes 9883; lines 23–78.
- `core4/core/authority.js`; full SHA256 `2ac5bd1f:d69a0c9a:98e271dd:bf2ab775:9293d1a7:2cda5e73:232e5d1d:27cbb04e`; full bytes 4772; lines 1–59.
- `core4/runtime/attachment-owner.js`; full SHA256 `ee66a3b8:48143aed:defa8651:fc5c63a9:f4cf124d:15229be0:647b57d4:0317e875`; full bytes 18857; lines 59–100, 195–224.
- `core4/core/broker.js`; full SHA256 `259384bb:b699742a:ccd5c61e:e123723c:295f2c40:52a76c25:895ef83e:a1a9c460`; full bytes 44608; lines 18–37, 39–56, 92–123, 165–258, 387–426.
- `core4/core/ledger.js`; full SHA256 `a52aff8b:a051a879:0cf620a9:a44081f2:772e2725:7f477dc5:562fc458:8c842402`; full bytes 2535; lines 1–52.
- `core4/core/state-lock.js`; full SHA256 `4e515580:ec7ceb03:cc7a7a5d:789048ae:e9bf0e9a:7866d4cf:0ee10895:8ff58e23`; full bytes 6101; lines 58–99.
- `core4/runtime/owner-lifecycle.js`; full SHA256 `c9d9328e:7e3ffdee:86f4ece7:e4ea45a1:3e0e472d:52c99a9f:d4e75fda:070e9f5b`; full bytes 45398; lines 298–330, 352–375.
- `core4/core/stdio.js`; full SHA256 `e48f5565:3cb38670:32851e6f:e91c7637:151de96a:f01e9a96:6aebf565:3787c401`; full bytes 3660; lines 1–18, 20–45.
- `core4/runtime/client-stdio.js`; full SHA256 `3996fb79:0334c289:efe0ea25:626e2419:e0943290:0da46e2f:cf55000b:2998fb16`; full bytes 10796; lines 82–109.
- `core4/protocol/codec.js`; full SHA256 `64057672:c5c9123e:1c3e5f49:c2b448d7:04e1cdbc:99d8c1d5:f1ee3892:b09810c1`; full bytes 1360; lines 1–20.
- `core4/protocol/dispatch.js`; full SHA256 `d9fd64ad:c931d32f:65ab0b57:104afce7:f199f5e1:ce96f17c:f00e19fc:1d95645d`; full bytes 904; lines 1–14.
- `core4/core/receiver.js`; full SHA256 `3a3fcdd3:d783e309:e8ff9e06:8e4b0749:add8430f:1e0b5308:87998e05:7d0836c2`; full bytes 3521; lines 1–52.
- `core4/integrations/cep/host-dispatcher.js`; full SHA256 `57db0822:461593d2:2540a139:abd126dc:f67b85b5:da57c5ff:288d2f44:b2f5784c`; full bytes 3712; lines 1–52.
- `core4/integrations/cep/http-peer.js`; full SHA256 `d0d6081d:f5b814e3:64b795c0:f0808710:1fd9db82:19ede64a:29e999a0:4bdf1bb0`; full bytes 53581; lines 157–178, 296–322, 324–348.
- `core4/runtime/stdio-entry.js`; full SHA256 `456a936c:20c41e6e:8ac82ae0:a617525c:04278142:3eb4ba9e:773e24a6:2ca25a6e`; full bytes 69585; lines 264–293.
- `core4/cep/js/poll-dispatcher.js`; full SHA256 `3199bbd8:b98bc1d7:8c74e278:f6bf2da3:b405575f:4709468d:70758f7d:f582e065`; full bytes 14848; lines 23–66, 88–118.
- `core4/tools/package-installable.js`; full SHA256 `c31d2830:d2b36cf8:79289ecc:5eb610d5:baf8d9d4:20f215d3:11d36fd7:5aff1804`; full bytes 10119; lines 1–115.
- `core4/worker.js`; full SHA256 `7f536cdc:fd03b397:1e129278:0ba5d32c:250a9c28:e8c50e19:d65df70a:3e5d1703`; full bytes 2244; lines 1–39.
- `core4/tools/install-core4.js`; full SHA256 `a64b61d4:be78a1d3:0247488f:f09e8d66:987608df:0b315d1b:610fe17f:e9e93c11`; full bytes 61792; lines 339–374, 376–386, 453–479.
- `core4/runtime/adobe-child-environment.js`; full SHA256 `0db59905:46fb91ee:f36e943a:ab5739ce:8243b2ac:cb1209a9:3d097c04:b84ecfa9`; full bytes 2285; lines 1–24.
- `core4/runtime/ae-panel-startup.js`; full SHA256 `7c188730:1b23f49d:5deedf97:2bebde42:c527682a:c68bf0f3:c7f9584c:717ceba6`; full bytes 26224; lines 87–118, 230–262.
- `core4/modules/titles-current-target/artifact.json`; full SHA256 `daea352b:270666fa:b332739c:34d413e7:d2fdc021:db026bc3:5a5cf939:2552c9cc`; full bytes 406; lines 1–11.
- `core4/modules/titles-current-target/contract.json`; full SHA256 `318a5d60:21bc9469:0323ab00:ca324c69:4c6b66dd:520a2898:9eda8764:3c1d3ce0`; full bytes 3748; lines 160–182.
- `core4/modules/titles-current-target/implementation.js`; full SHA256 `1b31cd96:b475f6af:3e286fdd:5c009d46:e09b18b2:71db88ce:951e9ec8:d7fc580b`; full bytes 372; lines 1–6.
- `core4/modules/titles-current-target/executor.jsx`; full SHA256 `f439be6d:f6abb5a3:de9372c8:5c91e895:a05283e8:d15d5378:4d9e7ba8:08701eb4`; full bytes 9714; lines 70–106.
- `core4/config/admissions/titles-current-target.json`; full SHA256 `c6adbebb:9ad8b919:e91c0de2:c773e933:9be9922a:8ddac50b:55d51515:0c4dd68c`; full bytes 631; lines 1–4, 6–12.
- `products/titles/src/compiler.js`; full SHA256 `765c625b:4dca5c31:29ded67b:5c6b99b3:64279dea:e3378823:a575b91d:338d99ba`; full bytes 5645; lines 1–94.
- `products/slideshow/compiler.js`; full SHA256 `fc854c08:dd826fab:c0d0bd62:36ac73c0:b4140ab4:9d7981fb:1c74696f:ec3cb22e`; full bytes 12056; lines 150–186.

## Источники summary evidence

- `docs/evidence/core-single-install-cutover-20261112.json`; full SHA256 `6c679a4d:399dc0e7:d644ccec:0079eb8a:9b6c0fbc:e4e29b80:12aac51c:0086fda1`; full bytes 10273; только E1–E5 пересказ, raw не включён.
- `plans/core-ae-panel-startup-20261111.md`; full SHA256 `2c2d42fd:10ae0b5a:e9ce4147:8f120c07:043c3265:1c1855dc:53187727:b8ad466c`; full bytes 55962; только E1–E5 пересказ, raw не включён.
- `plans/core-msix-layer-recovery-20261112.md`; full SHA256 `5fde49da:f45ddad7:5ba58cee:b6dc0c77:5030aaa8:a9124f23:7aaf8993:828725db`; full bytes 12345; только E1–E5 пересказ, raw не включён.
