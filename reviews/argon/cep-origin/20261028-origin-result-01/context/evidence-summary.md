# Сводка реализации Origin-патча и evidence

## Привязки

- Base: `aa1659819d3d9e1c51e87326d314f805a775334c` (source до patch совпадает с baseline plan-review `b42942afa92df0bcdb293ada05214f4ac13a3ed3`).
- Target source commit: `30311539ce2b2eb091d19c179667e513217e41cc`.
- Exact diff: `git diff aa1659819d3d9e1c51e87326d314f805a775334c 30311539ce2b2eb091d19c179667e513217e41cc -- core4`; изменены только `core4/README.md`, `core4/cep/js/panel.js`, `core4/integrations/cep/http-peer.js`, `core4/test/installable-runtime.test.js`.
- `core4/integrations/cep/peer-protocol.js` включён полностью и не изменён; SHA-256 на base и target одинаков.

## Сводка фактических изменений

HTTP peer теперь сначала проверяет точный IPv4 loopback Host/peer, затем ровно один Origin из allowlist `null` и `file://`; выбранный `corsOrigin` применяется к success/error/OPTIONS с `Vary: Origin` и без wildcard/credentials. Origin входит в выдаваемый challenge; `/link` требует совпадения с сохранённым challenge до дальнейшего принятия peer. `peer.origin` берётся из сохранённого challenge; post-link Origin проверяется общим auth guard до изменения sequence/lastSeen/pending/completion/ACK. Panel проверяет challenge.origin до HMAC/link и подписывает исходный полный challenge. Signed-body schema не расширена.

## Пять plan-review findings и локальное disposition

| Finding | Result evidence / disposition |
| --- | --- |
| `CEP-ORIGIN-PLAN-01` | `http-peer.js:27,30-32,103`: ingress guard назначает corsOrigin только после Host/Origin проверки, и ответам соответствует этот Origin. Тест `installable-runtime exact CEP Origin ingress and CORS success/error/OPTIONS matrix at Node HTTP boundary` проверяет success/error/OPTIONS, wrong Host и дубликаты. |
| `CEP-ORIGIN-PLAN-02` | `http-peer.js:45-49,54-55`: one-time stored challenge origin привязан на link; signed requests сравнивают peer.origin до sequence/lastSeen. Оба `Origin-bound challenge and peer preserve auth/sequence/pending/ACK` режима проверяют cross-origin отказ, тот же envelope/sequence после отказа и no-pending/no-ACK effects. Чужой `/link` сжигает одноразовый nonce, но peer не меняет. |
| `CEP-ORIGIN-PLAN-03` | Протокол намеренно оставлен прежним: hash `peer-protocol.js` совпадает base/target. В обеих Origin ветвях тест с extra `body.origin` получает `unexpected_field`. |
| `CEP-ORIGIN-PLAN-04` | Test helper `installable-runtime.test.js:29-35` явно задаёт Origin, method, headers/rawHeaders, удаляет missing header и использует `agent:false`; тестовая матрица включает OPTIONS 204, missing и сырые duplicate Origin lines. |
| `CEP-ORIGIN-PLAN-05` | `panel.js:14-16`: проверка challenge origin идёт до link/HMAC; тест `installable-runtime panel VM/WebCrypto shim validates challenge Origin before signing or link and signs full original challenge` проверяет положительный и отрицательный путь. |

Source reviewer дал read-only `ACCEPT` без actionable findings по сообщению root; это controller-provided evidence, а не приложенный независимый отчёт.

## Validation evidence freeze

Итоговый файл `validate-diff-02.stdout.txt` — точная копия полного Node test-runner **spec stdout**, не TAP: installable-runtime 20/20, manual-runtime 12/12, documentation 1/1; fail/skipped 0. В stdout есть одна scanner-совместимая длительность `duration_ms 10837.0721` (строка 462), числовое время выполнения тестов, не PII.

- installable-runtime: `node --test --test-name-pattern=installable-runtime test/installable-runtime.test.js`; evidence key `0fec7e93a3ea4605dcf86f5551f723272245b9b3c24feecd85067def0e6e640e`.
- manual-runtime: `node --test --test-name-pattern=manual-runtime test/manual-runtime.test.js`; evidence key `2e144affd7e68a3499256b83f240e6c563bd8abeb7b8b341dcb0a10d29cb1b13`.
- documentation: `node --test --test-name-pattern=documentation test/core4.test.js`; evidence key `204f058f382989a174b9e5d55cf05b874ab00a0b9e31c7f5840a147da00e2882`.
- Boundaries: 21 source units PASS, `liveCalls: 0`; log SHA-256 `4fe58209f99b184b26f779291af142ad56d22a5b9fb84c552e337ca7cc5df3e4`.
- Syntax/diff: three `node --check` files plus `git diff --check` PASS; log SHA-256 `8d9726741a6e8698d97e3aa99f6358f428104c453fac9dcf33db8ce5d65aa954`.
- Validation mode is scoped/selected-artifacts-only. Deferred current-closure checks: `windows-cim-probe`, `zero-dispatch-recovery`, `human-window`, `audit-repairs`, `cep-transport`, `lifecycle-simulation`; full release is not certified.
- Earlier focused attempts failed on HTTP reuse `ECONNRESET`, then test-side VM/canonical mismatches. They were resolved in the helper (`agent:false`) and by using the production poll-dispatcher canonical in the VM; production auth/timeouts/gates were not relaxed. The three targeted-attempt logs stay local; final passing stdout is included.

## Package candidate and release boundary

Two `buildPackage` + `verifyPackage` runs were byte-identical. Root independently checked 5 source hashes and all 56 package files and rebuilt candidate byte-identically. Package hash `6c94efb678b9a56861b18e762076da7b38824bbbe30233770c4133ff81edc696`; candidate file SHA-256 `fd4320d1f0e95540dce83515fffaf21c92bbdac09f82303005d305930f5caad3`; 56 files, 286740 bytes. Candidate is not installed. Against installed package `0aea…`, only packaged `http-peer.js` and `panel.js` differ.

## Открытые границы

Нет browser/CORS proof: Node tests задают Origin вручную; VM/WebCrypto/fetch проверки offline. Node HTTP parser сам убирает стандартный surrounding OWS, отдельного wire-level OWS rejection нет. Отдельный timing-specific activePoll probe отсутствует, хотя общий auth guard расположен до side effects. Не сделаны desktop/MSI round-trip P1–P8, install/read-back, full release и deferred integrations. Ни один из этих offline результат-review материалов не доказывает installed success.
