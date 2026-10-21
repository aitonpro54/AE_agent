# Активация desktop product runtime

Этот административный переход нужен desktop 3.3.4, где сохранены legacy
registration/UNKNOWN и mixed maintenance policy, а laptop product-genesis
отсутствует. Он создаёт новый подписанный session root через существующий
reset engine. Laptop migration receipts, исторические source pins, global
`policy.json` и факт `legacyPresent=true` сохраняются.

## Операторский порядок

1. Завершить source review и scoped установку CEP 3.3.4. Старый AE без physical
   tracker должен быть закрыт пользователем. Само сообщение о закрытии ещё
   не является native proof.
2. Выполнить `node scripts/owned-runtime-product-activation.js dry-run`.
   Это только файловая инспекция: без native helper, HTTP, Git subprocess,
   запуска daemon, создания state или authority. Отчёт содержит digest,
   generation, source hash, число/объём metadata и явные оставшиеся blockers.
   Credentials, raw state и credential paths не выводятся.
3. Сохранить локальный scoped backup и return map из baseline manifest:
   exact относительные пути, исходные bytes/hashes и source/installed checkpoints.
   Private baseline доступен через `inspect()` модуля и затем в подписанном
   grant; публичный краткий отчёт его не раскрывает. Backup с config остаётся
   ignored/local и не публикуется. Перед применением hashes должны совпасть.
4. Для раннего native preflight sole controller может взять существующий
   `createDaemonNativeBackend().acquireController()`, прочитать generation только
   из verified `readDaemonRegistration()`, вызвать `probeProductActivation()`
   и освободить controller в `finally`. Это query-only; файловый dry-run
   самостоятельно native helper не запускает.
5. После проверки конкретного финального digest получить **отдельное явное
   согласие пользователя** на abandon прежней control/edit ownership для новой
   epoch. Затем выполнить закрытую команду
   `authorize --review-digest <sha256> --authorization-reference <current-chat-reference>`
   того же CLI. Общая просьба выпустить/установить версию, прежняя initial
   recovery authority и mixed policy этим согласием не являются.
6. `apply` не принимает paths/PID/generation. Под общим OS controller mutex он
   заново сравнивает exact baseline и дважды проверяет отсутствие старого exact
   daemon, свободный endpoint и отсутствие AE/CEP/native render owners. Alive,
   PID reuse, access denied, unknown и чужой listener запрещают запуск. Native
   helper повторяет owner census непосредственно перед первоначальным запуском
   и проверяет effective STATE/LOG/HARDCORE roots перед launch.
7. Reserved launch, registration, signed anchor и CAS current переиспользуют
   reset engine. До физического preflight результат — `reset_pending_preflight`.
   Новая CEP должна показать пустой/читаемый durable physical latch, сменить
   delivery epoch и выполнить настоящий узкий project read. Непустой или
   нечитаемый latch блокирует admission. Сохранение/изменение проекта не требуется.
8. `status` читает ту же once operation; это не live liveness proof. Для приёмки
   нужны обычный Connected status и настоящий typed project read после активации.

Once-key связан с исходными current bytes и registration, независимо от source.
Partial write, неизвестный launch, потерянный ACK и crash не дают второй launch.
`apply` после consumption возвращает read-back той же операции; исходные ошибки
и receipts не переписываются. Для неизвестного частичного initial activation
отдельный repair не подразумевается командой повторного apply.

## Baseline и полномочия

Manifest связывает source census, config/credential fingerprint, current и
registration, exact legacy anchors/initial capability, lifecycle/edit state,
panel control, bootstrap, native ledger, AME jobs/outputs/global START/sequences,
idempotency, title-export metadata и autonomy preference. Отсутствующие fixed
namespaces также закреплены. Foreign maintenance/admin namespace, partial admin
records, aliases/reparse/hardlinks и превышение budgets приводят к отказу.
STATE/LOG/HARDCORE redirects проверяются в inherited env, fixed config и effective
native launch environment; произвольные runtime roots не принимаются.

Production hardcore producer пишет только immediate `<session>/session.json`.
Manifest закрепляет root/child namespace и этот файл либо его отсутствие.
Вложенные старые smoke workspaces с собственными redirected logs/settings/backups
не читаются как production sessions; их архивы не обходятся рекурсивно. Generated
media, AEP и exports в metadata manifest не включаются и не изменяются.

Budgets основаны на измеренном desktop history: plan-runs — 575 canonical UUID
JSON / 136 362 410 bytes, idempotency — 46 132 713 bytes. Поэтому plan records имеют
отдельный предел 192 MiB/4096 files/16 MiB на файл; остальные control metadata —
64 MiB. Только exact idempotency JSONL допускает streaming до 64 MiB с buffer
512 KiB; общий предел 256 MiB, 8192 entries, depth 9. FD и pathname проверяются
по dev/ino/size/mtime/ctime до/после чтения, включая parent/realpath. Рост,
replacement и alias не становятся новым допустимым baseline. Увеличение лимитов
или исключение текущего долга требует отдельного разбора, не очистки history.

Disposition сохраняет `oldOutcome:unknown_preserved`, `oldExitProven:false`,
`oldExternalEffectsAdjudicated:false`, `replayAllowed:false`. Original current
переключается только предусмотренным CAS; остальные прежние files/bytes остаются
на месте. Новый grant касается control/edit новой epoch. Он не наследует
`native_fixture_disposition`: bridge completion cleanup, lifecycle и reconciler
отклоняют его даже при прежней mixed policy. Ресурсные fences могут продолжать
блокировать отдельный output/job. Policy и старый native путь не ослабляются.

## Последующее восстановление и возврат к исходникам

Обычные shutdown/restart/ensure новой lineage требуют настоящих held-handle exit
и подписанной succession. Historical activation/grant не истекают при чтении
status/stop/lineage и не становятся разрешением повторить initial apply.

Для нового crash reset необходим отдельный операторский `authorize` существующего
`mcp-server/owned-runtime-product-session-reset.js`. На activated origin он создаёт
HMAC generation-policy, связанную с exact current/registration. Grant предыдущей
generation и initial activation grant не подходят. Reset снова требует absence,
CAS и физического project preflight; подписанная origin chain сохраняется.
Failed-start recovery принимает только прежний точный consumed operation/grant и
проверенные отсутствие/never-registered candidate. Неизвестный partial остаётся
readback-only. Старый unactivated legacy не получает такого reset path. Pure
product v1 contracts сохраняются.

Source rollback checkpoint desktop:
`checkpoint/ae-agent-3.3.2-before-3.3.4` →
`4e7efc8526f35d83a4d36144608076d545f0b65d`.
Laptop checkpoint ведёт на `1d246ae5a94238a54dadd5f2d01e9eb2eaf986ae`.
Локальный exact desktop panel archive —
`.codex-runtime/release-3.3.4/desktop-3.3.2-cep.zip`; фактически прежняя установленная
3.3.1 — `installed-before/` и `installed-before-manifest.json` в том же каталоге.
Это разные checkpoints; их не следует подменять друг другом.

Перед возвратом source/panel работающий новый daemon останавливается поддержанным
3.3.4 graceful shutdown с read-back exit. Затем сохраняются новые session records
и локальные изменения и возвращаются выбранные exact source/panel bytes. При
UNKNOWN остановки сначала выясняется исход, возврат не выполняется вслепую.
Old baseline уже был мёртвым legacy runtime: source rollback не восстанавливает
его exit/control authority. Нельзя просто вернуть старый current поверх новой
сессии или пересоздать историческую authority. Обратная runtime migration —
отдельный reviewed scope; старый код может оставить новую lineage admission
закрытой, и этот отказ сохраняется.
