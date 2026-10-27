# Core4 — восстановление владельца без истории команд

27 октября 2026. Отдельный небольшой repair внутри порученного создания и установки Core4. После project-local отключения MCP клиент Codex завершил собственный Node PID15396 и оставил broker/receiver owner markers. Root не выполнял force kill. Штатный installer сохранил отказ при этих markers.

## Progress

- [x] Read-only proof: прежний PID и HTTP3457 отсутствуют; собственных Core4 процессов не обнаружено. Broker ledger отсутствует, completion journal содержит только один valid origin record, native команд не было.
- [x] Архитектор дал GO только для private zero-dispatch перехода. Единственный writer реализовал standalone operator CLI и temp-only tests; root остаётся sole installed controller.
- [x] Независимый authority review V2 — ACCEPT. Перед actual apply root проверяет exact source hash и формирует witness из собственных launch/stop observations; затем inspect и apply с exact proof hash.
- [ ] Actual переход и read-back записаны в основном [плане установки](core-4.0.0-installable.md).

## Decision Log

`core4/tools/recover-zero-dispatch-owner.js` не входит в runtime package, startup, installer или public MCP. Он допускает только отсутствие broker ledger и ровно один valid receiver origin, пустой receiver marker, известный старый broker PID/token и trusted root provenance. Fresh ESRCH/no-own-process/no-listener proof и повторный CAS выполняются под install.lock → broker-owner.gate. Два exact markers перемещаются в собственный новый transaction archive с durable intent/completion; journal, origins и receiver store identity сохраняются. Любая история команд, UNKNOWN, неизвестный процесс, reparse entry, ошибка или изменение proof закрывает переход. Частичная операция оставляет transaction/gates без автоматического retry/rollback.

## Validation

- Dedicated **8/8 PASS**, включая pure inspect, exact archive/read-back, wrong proof, живой/неизвестный PID, другой собственный runtime/listener, ledger/begin/unknown/torn journal, path/provenance/CAS и частичную rename failure. Regression dangling ledger junction закрывает review P2: только ENOENT от lstat означает отсутствие.
- Frozen evidence: `C:/Users/Ant/AppData/Local/Temp/core4-zero-dispatch-v2-RgTbJQ/summary.json` и `recovery.raw.log`. CLI SHA-256 `81cd123c6cdd647f416df245891059fcb9014a2ec483331cb8b5f5348d9f6728`; test `fe699f11365147d87cfbaf9b2d61de418764fb507bc2f65371b96add3398d5a8`. Root сверяет эти bytes перед применением. У writer actual installed reads/OS probes/native calls0; reviewer ничего не запускал и не изменял. Это не general recovery и не full-release certification.
- Root witness/evidence находятся в ignored `snapshots/core4-live-proof/II/`; credential values туда не выводятся. Runtime/manual milestone II и его timing delta продолжаются отдельно.
