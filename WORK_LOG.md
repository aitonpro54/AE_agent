# Журнал текущих рабочих блоков

Исторические milestone записи сохранены в `plans/target-app-execplan.md` и
связанных планах. Этот файл создан для текущего поручения 3 октября 2026.

## Root/canonical montage acceptance — baseline

### Progress

HEAD AE `2830493`, agy-bridge `7ea628f` сверены; tracked деревья чистые, чужие
untracked сохранены. Статус montage-плана согласован с отдельной завершённой
приёмкой этапа3 bridge. Полная montage/root/canonical/visual acceptance открыта.
Runtime HEAD2830493/pid29924, CEP Connected, pending/inflight0, session/proposal
нет; installed panel.js/index.html/manifest.xml SHA совпали. Клиентский AEP
прочитан typed read; UI title без unsaved marker. Изменений AEP нет.

### Decision Log

Сначала requirement/code/offline/live/gap матрица; только подтверждённые AE gaps.
Один AE controller — root; архитектурный помощник read-only. Whitelist contributing
graph, canonical unit/policy/material/timing binding и fresh pre/post reads обязательны.
Три live цикла, максимум пять попыток, 30 минут/цикл и 120 минут общего live execution.
Runtime/manual gates не меняются. Старые failures/unknown сохраняются.

### Validation

Bridge100 tests PASS/36,575 s. AE17 выбранных npm suites PASS. Known isolated
autonomous-mcp FAIL воспроизведён на baseline: verification_required для synthetic
keyframe proof без stable IDs, line258. Verifier/gates не ослаблены.
Локальные logs: `.codex-runtime/montage-acceptance-20261003/baseline/`; bridge
baseline: sibling `.codex-runtime/montage-acceptance-20261003/baseline-tests.log`.
Это offline evidence; live typed reads подтверждают только connectivity/project.

## Собственный fixture и восстановление CEP — выполнено

### Progress

Клиентский AEP с сохранённым title без `*` оставлен без изменений. Создан и сохранён
точный `.codex-runtime/montage-acceptance-20261003/montage-fixture.aep`: четыре
синтетических MP4, три target/root пары, stretch100/200/125 и route100. Bootstrap
пользователь выполнил через штатный raw CEP gate; actual run `dd146307-d641-41ca-b913-02698d1f3092`
сверен отдельно и не повторялся. Save354724 bytes/SHA3081fcfa… подтверждён.
AE Agent закрыт штатным `closeExtension` после pending0, восстановлена рабочая область
Standard, панель закреплена в центральной области, раскладка сохранена. Три source
groups подтверждены кнопкой CEP; policy revision3 прочитана обратно.

### Decision Log

UI Classic3D у target5 сопоставлен с actual raw renderer `ADBE Advanced 3d` только
для host26.2x49 и точного списка renderer identifiers. Остальные hosts остаются
непроверенными. 27 crop PNG просмотрены (21 разных fullSHA и6 точных duplicates);
source fractional time сохранён, decoder frame floor записан отдельно. Эти PNG
не являются AE root proof. Flash attempt01 с fabricated observations отвергнут;
attempt02 — чистый manifest generator, parent добавляет явный protectedFields=[]
и точный raw native project path. Никаких client native observations нет.

### Validation

Свежий native compiler принял3 units/27 frames. Подготовительный seed run
`157b081c-058a-46b3-9093-a85fb4a1bbb8` выполнил4 steps/3 mutations, но завершился
`verification_required`: source read window и planar vec3. Исторический runfalse
сохранён. После исправления read-only reconciliation подтвердила3 applied/current
postconditions, replayAllowedfalse; ни одна мутация этого action не повторена.
Native root probes1–4 сохраняют class blocker; probe3 показывает CompItem=true
для source5, поэтому полнота ещё НЕ принята. Runtime pid29968/sourceSHAfaafedbf…
подтверждён после idle restart, installed CEP baseline hashes совпали.
AE regression16/17 PASS: montage-bridge process exit3221226505 без JS diagnosis;
отдельный bounded rerun76 cases PASS, первый сбой сохранён в log. Root77+3,
canonical13/owner21/semantic22 и consumer fixtures PASS — offline scope.
VideoScout HEAD3f53718 и clean status сверены; его штатный status wrapper читает
историческую terminal record без model calls. Общий bridge clean, код не менялся.
Обязательные три полных live cycles остаются открытыми; seed не является приёмкой.

## Native root и первый bounded capture — продолжение

### Progress

Fresh native probe5 читает root18 → target5 → footage2 без graph blockers и с
полным ordered GUID closure на host26.2x49. Исправлена работа с native item
handles: только numeric project index и fresh lookup после layer.source, exact ID
и отдельные native class facts. Три preparatory typed applications прошли semantic
verification и независимую reconciliation за32,391s. Три gated native reload
подтверждены собственными command receipts, file brackets и independent read;
policy revision6. Первый montage application комплект3/3 PASS за36,938s.

### Decision Log

Полные capture attempts ограничены5, требуется3 accepted; active execution≤30min
на цикл и≤120min всего, AGY≤1800s. Первый полный attempt сохранён failed:
`4c7881a4-3ccd-4e06-a113-35465d807f05`, owner80decafb…, native150,246s.
Созданы19 registered items, подтверждены13 canonical PNG; step15 остановился на
`project_state_size_limit`, последующие шаги не исполнены. Существующий2MiB
лимит не повышается; нужна bounded lossless упаковка полных receipts. Caller
HTTP timeout125s дал ранний unknown ответ, затем actual terminal record сверена;
unknown create/export не повторялся. Следующий fresh attempt получает новый
manifest/current policy/application/owners; historical partial не принимается.

### Validation

13 native PNG фактически просмотрены: красный/зелёный/синий и жёлтый/пурпурный
фон, рамка с симметричными полями, центральный крест, нет людей и обрезки.
Каждый зарегистрированный frame receipt содержит complete root capture proof;
owner-wide coverage остаётся неполной. Official read-only negatives блокируют raw
bootstrap run (`missing_canonical_unit_material_capture_binding`) и старую policy
(`canonical_original_policy_revision_changed`) без мутаций. Свежая regression17/17,
root82+3/canonical13/owner21/semantic22 и isolated capture daemon PASS — offline.
Reload aggregatefalse сохранён: вложенный project read перезаписал main step args;
исправление recording/bound recovery и canonical storage/visual packet ещё в работе.

## Canonical contracts и восстановление evidence — выполнено

### Progress

Полные native/canonical requirements, owner sessions, source load epochs и
bracketed capture реализованы в существующем runner. Nested typed reads сохраняют
main execution args. Actual read-only reconciliation reload runf504f1ec… подтвердила
3 applied/passed с exact stored validated args recovery; original runfalse сохранён.
Canonical receipts упаковываются без потери данных при прежнем physical2MiB limit.
Official visual packets используют pinned JSON и compact receipt references.

### Decision Log

Decoded limits:16MiB/owner,32MiB/store; полный schema/hash/owner validation идёт
после ограниченной распаковки. Проверка путей выполняется до mkdir. Project/owner
keys проверяются до преобразования; missing action/revision не считаются равными.
Независимый bounded reviewer воспроизвёл3 дефекта и подтвердил их устранение чистыми
контрпримерами. Свой fixture сохранён и повторно открыт через vendor UI:1,992,022bytes,
SHA dcd9f26847ba31df34aec980c03d8f61e07225dcd0c6693ce23dee01f7e1a701,
29items/все original IDs/groups сохранены. Перед новым capture готовятся fresh epochs;
прежний decoder epoch после reopen не используется как основание новой приёмки.

### Validation

Свежая полная regression17/17 PASS; root82+3, requirements13, owner21, semantic22,
epoch recovery30, packing20, visual file16 и два isolated daemon checks PASS.
Все touched JS syntax/rules/diff PASS. Внешний junction ancestor дал0mkdir,
corrupt prototype state — project_state_corrupt, missing provenance — needs_review.
Actual source preparations после reopen3/3 semantic/final reconciliation PASS;
полные accepted live cycles всё ещё0. New code milestone не объявляет приёмку
partial owner, исторических failed records, arbitrary roots или всего монтажа.

## Полный capture bracket и read-back summary — исправление

### Progress

Run35e720c8-3937-44eb-8b45-11528f2248de завершил33steps:27canonical root PNG,
2sheets, два complete current manifests с official JSON pins. Все89semanticchecks
passed, failures0/unknown0. Native657,562s, immutable record14,045,131bytes.
Но readBackCount0 дал verification_required; historical runfalse сохранён.

### Decision Log

Builder добавляет настоящую get_project_info summary после manifest reads в
canonical и legacy paths; verifier не ослаблен. Ранний legacy daemon smoke не
проверял aggregate run.ok, теперь проверяет ok/pass и положительный readBackCount.
Для трёх оставшихся full attempts нужны свежие owners и ограниченный размер evidence;
prepared destructive plan удаляет ровно48 own review comps трёх failed owners.
Checkpoint cleanup-before-48-owned-comps.aep:4,457,408bytes,
SHA82d00eb064ab33075e3955cc67419a28fb46fc194c6b1525e2fa716b38aa2717.
Vendor action-time deletion confirmation запрошена; cleanup ещё не выполнен.

### Validation

Legacy actual isolated runner после correction:aggregate oktrue, semanticpassed,
readBackCount>0; catalog/export/ownership/cleanup regression PASS (AE0).
Новый live builder нужен после обновления idle runtime; уже завершённый capture
не повторяется. Полные accepted cycles0; два failed attempts сохранены.


## 2026-10-03 — первый полный live montage цикл

### Progress

Exact48 failed review comps удалены штатным CEP: run9f74558d-f897-4b84-82ad-8443f93fbf48.
Независимый native поиск подтвердил отсутствие48IDs и исходные10IDs. Idle daemon9108
сверен по executable/argv/creation и заменён official adapter процессом10336.
Runtime acc2a81, sourceSHA1ef894bc7183c94ada7ff8fb555c0c37eaf2be0d3932b867059cf310f32c996b.
Первый полный цикл принят:88d5f279/c690b263/1e86c8a0 application runs; capture
8b41b9ca-411e-40f0-af6d-6513de025e66 —34steps,89checks,readBackCount1.
Все27actual640×360PNG просмотрены диспетчером и независимым Flash; ownerAPI18+9 PASS.
Три M3 technical и три production completion technical/declared_accepted PASS.
Evidence: .codex-runtime/montage-acceptance-20261003/cycle-final-1-accepted.json.

### Decision Log

M3 artisticfalse сохранён: artistic proof устанавливает отдельный owner API.
Completion сохраняет completeTaskAcceptancefalse, provided_run_ids_only и декларацию
просмотра без machine proof. First batch2 visual report отклонён по двум
формулировкам; новый run-r1 фактически повторил все10view_file. Исторический отказ
сохранён, AE capture не повторялся и verifier не менялся.
Первый цикл1010,029s измеренных workflows; AGY всех четырёх inspection runs344,767s.
Полный measured budget включает две прошлые failed attempts и исправление inspection.

### Validation

Application3 semantic/reconciliation/M3 PASS; capture34native/89semantic PASS,unknown0;
owner visual27frames PASS; paired actual JSON/sheet/fullPNG view_file, concrete
observations и pins проверены сервером. Completion3 PASS, bounded files/evidence
проверены production consumer. Second/third cycles и оставшиеся negatives открыты.
