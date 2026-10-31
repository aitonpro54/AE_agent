# R3d2b2: подтверждение остановки и обновление

31 октября 2026. Продолжение по прямому поручению пользователя:
«Продолжай с checkpoint: подтверждение остановленной установки, затем обновление
и переход на новую версию». Baseline `7a4804b`; прежний coordinator завершил turn.
Текущий чат продолжает engineering block и остаётся единственным live controller.

## Цель и границы

1. Подтвердить interrupted stop без запуска execution owner: durable desired-stop,
   fresh process-death proof, settled combined history и exact CAS. Собственный
   certificate certifier не объявляется receipt умершего owner.
2. Связать prepared installer plan, тот же branded lease и stopped certificate;
   полный staging/config-last, ротация credentials с сохранением signed history,
   typed stopped barrier и отдельное explicit enable. Mixed switch получает
   отдельную recovery capability, без восстановления normal plan brand из JSON.
3. Выполнить первый переход manual3f92 через verified operator: install-only gate
   до root stop, retained native process identity, fresh death/CAS, retirement
   только известных legacy markers и broker gate под тем же lease.
4. Проверить новую configured MCP/CEP установку и штатный lifecycle в разрешённом
   составе. AE restart/save/raw/destructive и full release сюда не добавляются.

## Progress

- [x] Git/checkpoint сверены; tracked baseline clean, чужой `.codex-attachments/`
  сохранён. Live changes до завершения source/TEMP проверки не начаты.
- [x] Fresh configured Core status: PID12432, manual3f92, pending0/unresolved[],
  receiver storeClosed/unknown=true, peer disconnected. Runtime действует прежний.
- [x] Read-only OS/source: сохранённый AE6492 отсутствует; active Core incarnation
  birth `2026-10-31T08:33:47.599304Z`. Три source profile hashes совпадают с
  [maintenance](core-cep-r3-maintenance-20261030.md); receiver journal SHA256
  `4cfe881718e7255829785e57b604304493b319ba6e68d597074a98454e146f45` неизменён.
- [x] Stopped certification source: commit `573a8fd`, immutable184selectedPASS,
  independent bounded review fixes и source unchanged;
  [milestone](core-cep-r3-stopped-certification-20261031.md).
- [x] Stopped update/forward recovery и explicit enable/finish, initial legacy
  normal+recovery пути: immutable354selectedPASS, bounded review fixes приняты.
- [x] First legacy migration, новая установка, read-back и explicit enable.
- [x] Standard installed stdio clients: ready owner9812, singleton/EOF proof.
- [ ] Configured-client read-back после ручного Codex restart.

Финальная source closure: UPDATE4 run`e0a8f3d4-5ae6-495b-bf01-890d50a75d1f`,
354PASS,0FAIL,23checks/22batches, sourceUnchanged=true. 17 успешных batches
переиспользованы только по exact evidence keys из сохранённых UPDATE2/3 runs.
Normal initial legacy путь проверен shared module brands: stop→prepare→apply,
original keys/history; соответствующий stage-guard defect исправлен.

Проверенная distribution:
`6bb31d5c1b30ac8b1c26fc491d83a130fb172ac159a696af20d56eaff2fa20fc`,
runtime package`8a79e069313f4cf55198a1bfbf0741ef3952579ae091edb8d22697d22cb409a8`.
Прежнюю distribution`32be85da…` не применять. Реальный dry-run подтвердил native
paths/volume/config и original baseline; production runtime bytes между bundles
одинаковы, исправлен installer-only helper.
Original installed descriptor SHA256
`be339768da4ec60f10a2aceb8f0614774c02a4b3dd9cc138fb07281e21632103`.
Runtime остаётся manual3f92, PID12432; actual stop/install/enable0. Real read-only
legacy preflight PASS, native birth`639290324275993049`, journal unchanged. Перед
actual action снова получить fresh configured status и original baseline.

Certifier имеет собственный184PASS source milestone. Числа разных packets не
складываются как уникальные tests; installed proof следует отдельной записью.

## Decision Log

- Нормальный lifecycle constructor не используется для interrupted-stop
  certification: его election/startup семантика не должна создавать нового owner.
- Новый private certifier переиспользует существующие ready/recovery guards;
  unknown/foreign/corrupt facts сохраняют fence.
- Certifier/operator distribution проверяется до imports. Установленный старый
  release читается как данные, его source не импортируется новым operator.
- Argon не создаёт обязательного gate: внешний пакет/отправка этим продолжением
  не запускаются. Независимые bounded source reviews и local checks относятся
  к своему exact source scope.
- Сохранённая host adoption не подтверждает живой AE: перед будущим исполнением
  нужна свежая matching host identity, без наследования старой authority.
- Native handle проверяется по полному `GetProcessTimes`/`.StartTime` birth ticks:
  CIM CreationDate теряет долю микросекунды и не подставляется вместо них.
- Legacy operator закрывает только exact pinned manual3f92 profile, проверяет
  constructor-closed receiver, свежий root status, native identity/CLI/listener,
  immutable baseline и initial install-only lease. Один root stop предшествует
  promotion того же lease и архивированию двух известных markers. Ни process EOF,
  ни неизвестный результат не разрешают повтор stop. Тесты этого operator используют
  synthetic admitted profile/probes; real handle проверен только на disposable Node.
- Pre-ready legacy crash finish и dedicated staging используют отдельный private
  capability без normal plan brand. Known partial CEP stage дозаполняется только
  после exact subset проверки; чужие/modified files/dirs сохраняют fence.
- Финализированный legacy stopped capability допускает installer-owned stages
  только под тем же branded lease в installing phase; LIVE metadata/history,
  config bytes/inode, CEP baseline, stage bytes, records/gates проверяются вновь.
  До stop действует строгий baseline, неизвестный client.next даёт stop0/gate0.
- Owner pre-ready без switch-ready остаётся fail-closed; отдельный abort не
  добавлялся. Это known-open граница, не скрытый rollback или готовность release.
- В official OpenAI documentation проверен поддерживаемый путь Settings → MCP
  servers → Restart. Наличие кнопки/обновление configured transport требуется
  подтвердить на установленном приложении; отдельный shell stdio probe не заменит
  configured-client evidence.

## Validation

`snapshots/core4-lifecycle/20261031/UPDATE4/summary.json`:354PASS/0FAIL,
23selectedchecks/22batches,18changedfiles,17JSsyntax и diff PASS, boundaries43/live0.
Две независимые TEMP test batches выполнялись параллельно; источник — immutable
export573a8fd плюс exact changed files. Hashes/evidence keys/raw logs и explicit
deferred coverage сохранены; full release и job lifetime не заявлены.

Source review подтвердило исправления: full-sized intent reader, known partial
CEP stage continuation, exact legacy gate/barrier CAS, post-retirement certification
CAS и normal legacy staged admission. New6normal-flow/29legacy/28update cases
входят в final selection. Native retained handle проверен на disposable Node;
legacy process/profile fixtures синтетические. Реальный initial legacy preflight
подтверждён отдельно, без stop/dispatch.

## Installed result

Source commit`867f506`, certification`573a8fd`. Migration
`19ebf044-9314-416c-b146-04d49472d61c`, update transaction
`49a5ec88-50fd-4b6d-8f26-edf265fc080c` settled: updated=true/update-stopped, затем
fresh inspect switchIndex5 и explicit enabled=true/runtimeStarted=false.
Original Core12432 остановлен через retained native handle, receipt state stopped.
Ни один AE dispatch, restart AE, save или изменение AEP не выполнялись.

Новая installation/client/CEP release проверена; installation identity и оба origin
hashes сохранены, receiver journal тот же16events/SHA2564cfe8817…f45. После enable
Core PID9812 стартовал штатным client-entry; ready=true, ownershipFault=null,
ledgerFault=false, unresolved=[], physical pending=null/storeClosed=false/unknown=false.
Два stdio clients видят тот же PID, EOF обоих оставляет owner alive. Это standalone
proof; configured-client proof им не подменяется.

Первый cold status исчерпал attach deadline и вернул owner_unavailable, пока owner
заканчивал boot. Fresh observer затем подключился к уже active9812 без второго
owner/ручного ремонта. Это open R5 timing observation, не потерянная mutation.
Старт AE/actual CEP и MSIX/app lifetime ещё не приняты.

Configured core_status после update дал Transport closed. UI toggle пользователь
не смог переключить; предложен ручной restart Codex. Config verified enabled=true,
command Node24 и args указывают на новый client-entry/core-client.json; hash
`e72411106e8ebc66e02788acd33c8a31011b1036d8ec8748ce6937f1761ece9f`.
Installed receipts/санитизированные наблюдения —
`snapshots/core4-lifecycle/20261031/INSTALLED/`. Native journals/keys/полные runtime
transactions остаются только в machine-local installation и не копировались сюда.

Следующий шаг — [checkpoint](core-cep-checkpoint-installed-20261031.md), без повторного
stop/update/enable. Actual configured proof пока pending, AE/AEP unchanged.
