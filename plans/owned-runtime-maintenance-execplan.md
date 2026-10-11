# План: обслуживание принадлежащих runtime и окон

**Статус на 12 октября:** офлайн-веха кода завершена (worktree commit `dd52857`); live admission и восстановление панели pending. S1 retirement и signed переход S1→S2 доказаны. Текущий S2 PID29760 / generation `83e86583-fe0c-42a2-975c-0dcc6019504e` жив, source77 `1e660e4da5976594e5602afae3fdc42d55456cfb1133becabf04e24d1ce139ff`, панель отключена, admission закрыт.

## Progress

- **Фаза 1:** commit `73740fa` добавил lookup-only witness для точной закрытой пары; `scope=inspection_only`, `admissionGuardReleased=false`, общие ledger/admission/capture/publish не менялись. Focused36/36, recovery50/50, maintenance15/15, node/rules/diff и независимый read-only review PASS.
- **Фаза 2:** commit `dd52857` добавил точный S2 maintenance CLI/PowerShell, archive-only reader, supervisor/sourceStable dispatch и полный registry. Complete staged91 = future runtime80 + один helper `f35` + 10 ROOT raw support files; runtime80 SHA `9ab8a3a11aed1a09661573ab75daecd4f073778f7cef7df866e1853061ce473f`. Исправленный suite47 PASS, PS AST/pure C#20/nativeCalls0, node5/rules/diff PASS, Sol/ultra review без P1/P2. Старая staged81 неполнота исправлена; registry80 не менялся.
- **Live:** единственный genuine readonly inspect `69a07a5e-6442-4c33-8a01-6abfe4c86e3c`, session54989, естественно завершился exit1: `owned_s2_maintenance_history_unknown`, `replayAllowed=false`; chunk `f33c51`. Сохранённый результат: `.codex-runtime/panel-cycle-live/69a07a5e-6442-4c33-8a01-6abfe4c86e3c/result.json`. Drain/authorize/retire не отправлялись; retirement operation `97f7ade2-d3c3-4c95-9060-533e13157973` не использован. Нельзя утверждать завершение дочерней операции: native RPC не имеет общего timeout, PowerShell history reader ждёт по 30 секунд, timeout классифицируется `history_unknown`, а `Dispose` child не завершает.
- **Сверка 19:22:14Z:** ROOT остаётся source77 без изменений; controller lock, effect directories/journals обеих операций и source acquisition отсутствуют. S2 PID29760 жив и отключён; pending/inflight/edit отсутствуют, `lastPanelInfo=null`. Четыре защищённых процесса AE33840/10984/46636 и AME42840 живы, их birth identities совпали. Дополнительный readonly census не нашёл inspect/helper processes, но не является доказательством исторического child exit. Чужие данные, grants и UNKNOWN outcomes сохранены.
- Сохранены sealed S2 CAP `19646` и единственный reload `92581`; исходный `bcfe6e2e-ecbd-4d82-98b2-6a2a615f93e4` остаётся `UNKNOWN/noReplay`, `nativeExecutionProven=false`. Предыдущие typed refresh отказ и pre-phase `fixture_prephase_issuer_not_isolated` остаются историческими фактами. Старый worktree `owned-panel-recovery` (`8cc2201`) и S1 journals/source snapshots нужны историческим readers.

## Decision Log

- Новый live blocker по этой проверке сохраняем без расширения сегодняшнего scope. Не повторять inspect/drain/retire на основании неизвестного результата; завтра начать с ограниченной read-only диагностики `CheckHistory`, времён ожидания и pipe handshake до нового inspect/любого drain.
- ROOT source77 не менять до положительных same-held-HANDLE exit proof и seal. Только после них возможны точный reviewed overlay deploy из staged91, source80 read-back и штатный ensure S3.
- После S3 продолжение требует genuine full guard refresh, обычного Connect и настоящего actor poll, свежего native/full refresh, официального чтения исходного результата и readiness read-back. CAP/reload не пересоздавать; synthetic poll, replay, raw bypass, закрытие primary AE/AME и изменение/сохранение AE-проекта запрещены.
- По итогам этого блока панель/disposition adoption, S2→S3, обычный owned restart/cleanup, R2/R3 acceptance и M3/M4 остаются pending. Live readiness не заявляется.

## Validation

- Офлайн фаза 2: corrected targeted47 PASS, PowerShell AST/pure C#20/nativeCalls0, node5, `npm.cmd run check:rules`, `git diff --check`; независимый финальный review без P1/P2. Это проверяет код и границы, не runtime authority.
- Live inspect: natural outer exit1 и точная ошибка `history_unknown`; без replay/force. Fresh read-only state подтвердил неизменность ROOT/S2 и защищённых процессов, отсутствие lock/effect/acquisition artifacts; отсутствие дочернего процесса сейчас не доказывает его исторический exit.
- Для завершающей документационной правки запускаются только `npm.cmd run check:rules` и `git diff --check`. Product suites, deploy, live/UI/API действия и commit не входят в эту правку.
