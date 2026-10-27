# Core4 — создание устанавливаемого runtime на MSI

27 октября 2026, baseline `35f4c90`, ветка `codex/ae-agent-core-4.0.0`. Пользователь прямо поручил создавать новую версию здесь после запроса установить4.0.0. Готовый дистрибутив не требуется от другого компьютера: текущие исходники — база разработки. Этот блок заменяет прежнюю остановку перед созданием реальной интеграции.

## Цель и scope

Получить установочный пакет4.0.0 из нашего Core4: настоящий stdio MCP, внешний Node, локальный аутентифицированный канал к CEP, компактная панель4.0.0, диагностика и выбранный typed manual current-target путь для текста. Continuous-incarnation API остаются закрытыми без своего настоящего provider. Версия3.3.3 не переименовывается в4.0.0; legacy daemon/adapter не импортируются.

[Ручной прототип](core-4.0.0-cep-project-safety.md) и [readiness-контракт](../docs/core4-readiness-preflight.md) переиспользуются как проверенные границы, их offline evidence не выдаётся за live proof. C++ SDK, AME, Argon/desktop-пересылки и старый cutover protocol сюда не входят.

Разрешены source/runtime/panel/installer, адресные проверки, детерминированная упаковка, stage/backup/read-back и целевая установка собственного Core4. Root — единственный installed/runtime/CEP/UI-контроллер; один writer `core4/**` и не более двух helpers. Старая установка и её данные сохраняются. Новые install-scoped role credentials создаются отдельно и не попадают в Git/package/public response. Raw executable ingress, public grant Boolean, fake production lifecycle, replay после UNKNOWN и автоматическое снятие fences запрещены.

Пользовательский AEP, save/reopen/destructive и перезапуск AE не выполняются ради установки. Test-copy: `snapshots/core4-host-validation/022dad73-ca31-4013-88fe-bf001ae91011/titr_01_ame_product_20261015.aep`, source SHA-256 `9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f`.

## Последовательные working milestones

1. **Package/status/inspect.** Production composition root `runtime/stdio-entry.js`, реальный HTTP long-poll peer внешнего Node и pure CEP browser, fixed reviewed executor registry, MCP status без lifecycle и bounded typed inspection/discovery. Отдельный CEP bundle `com.codex.aeagentcore4`, видимое имя AE Agent Core4.0.0. Receiver/store во внешнем Node; browser не исполняет Core через embedded Node17. Installer публикует immutable release по manifest hashes, отдельные credentials и project MCP entry, сохраняет state origin/fences. После scoped subprocess/IPC/VM/package/installer regressions — bounded review, commit и root install/read-back.
2. **Typed manual current-target.** Отдельный optional `titles-current-target` package/contract с target без sessionId. Private branded policy вне domain-neutral Core; engine-optional single-step path и versioned resource scope. Generic inspect→build→proposal→dry-run→run; fresh native confirm, single setter и local transaction receipt verifier. Durable preimage checkpoint покрывает точный текст/объявленный style, не весь AEP; recovery требует нового typed proposal/подтверждения. Политика выбирается trusted composition/admitted pin, не public Boolean. Default automatic epoch gates сохраняются. После scoped regressions/review обновить пакет и установленную копию.
3. **Фактическая приёмка.** Correlated MCP handshake, exact Node/install/CEP identities, status/admission coverage, одна разрешённая read-only инспекция через installed IPC. Для mutation — актуальные resource/ownership/physical gates и native confirmation. Если running AE не позволяет загрузить новую панель без сохранения/перезапуска, не закрывать его автоматически и не объявлять offline PASS живым результатом; независимая source/packaging работа продолжается.

Между пунктами не нужны новый чат и повторное разрешение на уже порученную разработку/установку. Каждый пакет самостоятельно запускает свой разрешённый scope. После первого status-only результата работа продолжается ко второму пункту.

## Progress

- [x] Подтверждены user GO, исходники и чистый baseline; поиск внешнего дистрибутива прекращён.
- [x] `ae_architect` дал bounded source design GO; `ae_scout` проверил CEP/runtime facts. Root владеет планами/commit.
- [x] Единственный `ae_implementer` получил source ownership `core4/**` и последовательные milestones I/II.
- [x] I source реализован: отдельная CEP-панель/HTTP peer/stdio entrypoint, `project-inspection` через generic module API, package/installer/rollback. Initial dedicated actual-component checks7/7 PASS; final freeze ожидает адресных review repairs.
- [x] Реализованы runtime/panel/package/installer и scoped validation I; frozenI_V4 принят независимым review.
- [x] Подготовлены первый локальный milestone commit и immutable distribution I; дальнейшая работа продолжается ко II.
- [ ] Выполнены target install/read-back и real status/connectivity proof.
- [ ] Реализован и проверен manual typed workflow II без fake epoch.
- [ ] Обновлены пакет/установка и фактическая приёмка; оставшиеся ограничения записаны точно.

## Decision Log

- Предыдущее требование принести готовую4.0.0 с десктопа было ошибкой порядка работы: интеграцию предстоит создать из имеющейся разработки. Новое поручение даёт source/build/install scope; прежний offline-запрет не запрещает этот отдельно порученный блок.
- IPC выбран HTTP long-poll: установленная browser CEP-панель уже использует HTTP, а embedded Node CEP12 имеет17.7.1; внешний Node20+ не помещается туда по предположению. Новый внешний runtime использует конкретный проверенный absolute Node path/hash без PATH/npm install, без detached daemon/native C# launcher.
- Во фреймах только fixed reviewed asset key/phase и typed payload, не source/path/function. Durable begin предшествует выдаче команды, physical latch — eval, callback receipt — POST, clear latch — correlated durable completion ACK. Browser storage не объявляется fsync-защитой. Timeout/reload/loss сохраняют UNKNOWN/no-replay.
- Panel и control credentials разделены; свежие challenge/epoch/sequence связывают peer/controller/package. Loopback Host/Origin проверяются, null Origin без credentials/MAC не доверяется, wildcard CORS не вводится. Diagnostic role не получает execution authority.
- Resource fences относятся к реально общим machine/process/file resources. UNKNOWN другого компьютера не является очередью этого AE; одинаковый путь/новый UUID сами по себе разделения не доказывают. Actual identity и локальный physical state устанавливаются отдельно; архивная рабочая история не становится startup dependency.
- Checkpoint/verifier новой manual policy явно versioned: local transaction receipt подтверждает именно эту транзакцию, поздний отдельный inspect — новая observation, а не continuity или снятие UNKNOWN. Full-project protection при необходимости сохраняет save gate.
- Read-only native result имеет собственный `observationVersion`, а не прячет project metadata в `protected` старого snapshot. Missing host JSON/registry даёт явный known read refusal без raw fallback. Generic inspection сверяет moduleId+contractId; новый отдельный публичный `inspect_project` не вводится.
- Root визуально наблюдал единственное окно AE26.2: пустой `Untitled Project.aep`, project items/comp отсутствуют; окно было развёрнуто из minimized, проект не менялся. CEPHtmlEngine на диске12.0.1; PlayerDebugMode12 уже1, security settings не менялись. Read-only CDP inventory2029: один target, legacy AE Agent target не обнаружен. Эти факты не объявляются global AE queue idle.
- Независимый I reviewV2 нашёл2P1/1P2: extra extensionless release file мог загрузиться до проверки; orphan Broker ownership допускал отдельную physical inspection; TOML edit мог поглотить indented соседнюю entry. До установки обязательны exact closure/pre-import verification, общий fail-closed physical guard и bounded TOML edit/regressions. Дополнительно apply должен принимать exact reviewed package hash. Writer исправляет только эти адресные места, II до frozen package не публикуется.
- I_V4 закрыл findings, включая последующее связывание фактического entry root с verified release и повторный descriptor CAS под startup gate. Импорт package code происходит только после проверки closure/identity. Missing/wrong reviewed hash запрещает apply до записи. Прежние marker/fence/ledger не удаляются для старта/установки.
- II actual provider будет отдельным private Windows probe/adoption/reservation, не публичным Boolean: actual hostname/PID/birth/executable + stable installation/state owner + authenticated peer + exact approval/checkpoint + durable reservation. Coverage ограничен cooperating Core4 lane/current native-confirm target; global AE idle и отсутствие всех сторонних actors не обещаются. Known conflicting obligations блокируют отправку; native confirm повторно сверяет текущую цель. Root adoption привязывает процесс/разрешённую test-copy, но не является grant на setter или project epoch.

## Validation

### I — source/package, до actual установки

- Итоговый `installable-runtime` batch — **13/13 PASS**: real stdio child+HTTP+VM, auth/role/origin/epoch/replay/size, durable begin/receipt/ACK/latch, crash/reopen/no-replay, known host JSON refusal, package/install/rollback/stable origins, closure injection/junction, orphan owner/corrupt ledger/unresolved intent, TOML preservation, expected package hash и stale entry/descriptor race. Native AE calls0. Earlier7/11 перекрываются итоговыми13 и не суммируются.
- Selected existing consumers на прежнем I freeze: Core36/36, photo3/3, titles4/4 PASS. Их code/dependency bytes не менялись последующими runtime/test-only fixes, повтор не выполнялся. Полный raw stdout этого прежнего subprocess не сохранён (первый chunk был truncated); evidence содержит точные counts/commands и ограничения, а не заявление полного raw TAP. Current full-release PASS отсутствует; audit-repairs/cep-transport/lifecycle-simulation имеют explicit deferred coverage selection.
- Boundaries20, JS syntax, XML и diff checks PASS. `core/stdio.js` меняет только private serverInfo option, default metadata прежнего M1 сохраняется; Core artifact resealed только для actual stdio bytes. Чужие module/engine/protocol pins не обновлялись.
- Frozen source/evidence: `C:/Users/Ant/AppData/Local/Temp/core4-ready-I-V4-AenV3N/` (`summary.json`, `selection.json`, `installable-runtime.raw.log`, `boundaries.raw.log`, `diff-check.raw.log`, `package.json`). Root независимо сверил22 changed source hashes: mismatches0. Все48 package file hashes и exact file set сверены; packageHash `cf07e3189d88c4921f779b806b5dc45c8a305cd9c4bc27d898b3903678327f04` пересчитан независимо. Reviewer выполнил bounded source review и address review fixes: **ACCEPT**, открытых P1/P2 нет; tests/live не запускал.
- Root повторно собрал детерминированный пакет в `dist/core4/4.0.0-readonly-cf07e3189d88/core4-4.0.0.json`: тот же packageHash/48 files, file SHA-256 `786d2a741ce5ec100ef8f7b87d637b51178559ae87494a322278e19a6a70ca6f`. Рядом `distribution.json` и standalone installer closure (3 reviewed files с hashes). Эти generated artifacts игнорируются Git.
- Root dry-run на actual MSI paths прошёл: внешний Node `C:\Program Files\nodejs\node.exe`, v24.15.0, SHA-256 `3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5`; Core4 install/CEP/project config до установки отсутствуют. CLI требует exact native Node path; первая запись с `/` была отвергнута `node_path_not_exact` до изменений, corrected native-path dry-run PASS.
- Номер4.0.0 не является release certification: `releaseCertified:false`, actual installed/host proof записывается отдельно после source commit. Full-release suite не запускалась. До завершения II этот пакет имеет feature scope status/read-only inspection.
