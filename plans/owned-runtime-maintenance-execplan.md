# План: штатное обслуживание принадлежащих runtime и окон

**Статус: R1 complete; R2/R3 in progress; общая acceptance не заявляется.** Архитектура закрыта Sol/ultra. R1 реализует узкое закрытие disposable fixture children; R2 отвечает за согласование `UNKNOWN`, R3 — за lifecycle owned daemon/panel. Защищённые AE/AME, пользовательские проекты и неизвестные native outcomes остаются за отдельными gates.

## Progress

- **R1 complete.** Семь принятых файлов добавляют typed lifecycle, pinned Win32 backend, закрытый CLI и offline/native smokes. R1 закрыл только два disposable fixture children; original run `8a14a6e6-603f-4439-9c1b-2e0ba93b1ed8` остаётся `UNKNOWN/noReplay`, `nativeExecutionProven=false`, `admissionReleased=false`.
- Fresh root inspection `2026-10-11T09:32Z` подтвердил original profile generation `root-original-witness-20261011-v1`, canonical pins, protected inventory и exact kernel identities. Ввиду 29 неоднозначных top-level windows graceful close был skipped. Exact held-handle `TerminateProcess` получил `WAIT_OBJECT_0`/exit 137 для PID 4520 в `09:32:03.700Z` и PID 30748 в `09:32:52.002Z`. Два original-observer retirement-proof файла валидны; они не меняют outcome исходного native run и не доказывают admission release.
- После закрытий passive inspect подтвердил daemon PID 40528 (birth `07:13:06.2984298Z`) живым; защищённые AE PID 33840/10984 и AME PID 42840 сохранили exact identities. Profile/canonical bytes остались неизменны. Историческая запись inspector `processExited=false` — retirement audit старого inspect, а не опровержение новых original-observer proofs. R2/R3 продолжаются; M3/M4 exports не приняты.

## Decision Log

- R1 — узкий native shutdown по `runId`/`stageId`, никогда по caller PID/path. Перед эффектом требуются strict owned descriptor и launch witness, exact kernel PID + lossless FILETIME + image/SHA + protected inventory, затем durable one-shot intent. Закрывать только точное окно по held HANDLE, дождаться ограниченный срок и получить retirement proof от обоих children. Force допустим только для disposable owned fixture при ясной policy и на том же удерживаемом HANDLE. Любая неизвестность сохраняет `UNKNOWN/noReplay`. Старый `inspect.processExited` — только retirement audit, не исходный kernel proof.
- R2 — согласованное programmatic `UNKNOWN` disposition без удаления/перезаписи исходных receipt, identity или canonical bytes. Использовать private trusted sidecar и свежий capture/actor/runtime; требовать реальные exits обоих children. Legacy branch остаётся отдельным. Внутри разрешённого housekeeping persistent owned-runtime policy снимает только повторный human gate; технические predicates и прочие gates сохраняются.
- R3 — штатные drain/shutdown/ensure/restart daemon и panel controller, scoped reload/reconnect/refresh и автоматические cleanup hooks через поддержанные tools/API/CLI. Запрещены blind retry/reload и restart primary. Для legacy daemon без graceful route: переход только exact owned daemon после исходных durable proofs и idle, с честной фиксацией forced transition. Будущий authenticated shutdown требует durable ack/`server.close`; внешний CLI ждёт фактический exit.
- Executor map: architecture — `ae_architect` Sol 6.1/ultra (закрыто); R1 implementation — Sol/xhigh по прямому выбору пользователя без Flash, closing review — Sol/high PASS после двух исправлений (потеря фактического exit и актуальная credential config). Root — единственный live controller; один writer на ресурс. R2/R3 остаются отдельными блоками.

## Этапы и приёмка

1. **R1 Native shutdown primitive — complete.** Contract, 61 offline checks, 10 hidden-Windows native scenarios, 24 JS/PowerShell parser-parity checks и exact held-handle exits для двух disposable children. Unknown outcomes, retries и primary identities остаются защищены.
2. **R2 UNKNOWN disposition — in progress.** Согласовать только additive sidecar/state transition, сохраняя оригинальные receipt/identity/canonical bytes. Проверять coherent capture, actor/runtime freshness и обе original-observer retirement proofs; `UNKNOWN/noReplay` сохранять при любом неразрешённом факте.
3. **R3 Runtime lifecycle — in progress.** Добавить поддержанные drain/stop/ensure/restart/reconnect hooks, scoped reload и автоматическую уборку только зафиксированных owned resources. Сохранить idle/pending/inflight gates, durable shutdown ack и ожидание exit; не выполнять primary restart, blind retry или broad reload.

Каждый блок — отдельный reviewable milestone. До его приёмки должны пройти осмысленные negative contract cases, релевантные syntax/rules/diff checks и scoped smoke; live proof опирается на точный disposable fixture и fresh read-back. Сначала сверять фактическое состояние после любого unknown результата, никогда не переигрывать неизвестную отправку. Commit возможен только после завершения соответствующего milestone и при соблюдении проектных правил.

## Validation

- R1 validation: lifecycle offline 61 PASS; hidden-Windows integration 10 PASS; JS/PowerShell parser parity 24 PASS; JS syntax (5), PowerShell parser, rules и scoped seven-file diff checks PASS. Checks не являются native AE operation success.
- Live R1 accepted: original observer proofs обеих exact fixture identities подтверждены после single-force exits. Runtime credential source — только `.codex/config.toml` `[mcp_servers."after-effects".env]` с раздельными automation/panel tokens; `.env` fallback отсутствует. SHA-256 native helper `a441d268a8997c378ededcbc01b1220e8beb3d7bdf83e8396621180f391e1ccb`.
- R2/R3 не приняты. Для исходного run сохранены `UNKNOWN/noReplay`, `nativeExecutionProven=false`, `admissionReleased=false`; live inspection не завершало native operation и не освобождало admission. Commit этого R1 блока включает семь принятых файлов и три плана, без ignored profiles/proofs.
