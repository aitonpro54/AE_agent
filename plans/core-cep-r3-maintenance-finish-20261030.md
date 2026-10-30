# R3d2a: явное завершение interrupted resume

30 октября 2026. Baseline `5039c49a031b6a75175590922bf24725cf660121`.
Финальная validation выполняется поверх B1 commit`9ca310f67074f09e52203852bc39750beb5ddf1e`.
[Maintenance](core-cep-r3-maintenance-20261030.md) и [панель](core-cep-r4-panel-20261030.md)
завершены source commits `5b6cc6c`/`5039c49`, общий frozen packet329PASS.
Installed manual3f92, Core/AE/AEP и их authority не менялись.

## Scope

Следующий небольшой блок закрывает pending resume, который R3d1 намеренно
оставляет stopped/fenced. Нужен explicit finish только для однозначных сохранённых
фаз того же stop/resume intent, descriptor/package/origins/client и settled history.
Новые AE команды/RPC не отправляются; старые grants/refs не восстанавливаются.
Решение для staged installer/update и first legacy migration — отдельный R3d2b.

## Решение перед реализацией

- Original stop/resume intent, operation IDs, credentials и target сохраняются.
  Не создаётся новый plan/новые keys вместо незавершённого действия.
- Finish требует fresh full-role proof, fixed HTTP election, same-machine exact
  PID/birth death proof прежнего operator, strict current phase/tree/metadata CAS,
  settled combined receiver/ledger и отсутствия execution/lifecycle markers.
- Прерывание самого finish тоже должно распознаваться после следующего падения.
  Нужен bounded sealed continuation provenance; неподписанный JSON, UUID или
  отсутствие файла не заменяют capability/process-death/phase proof.
  Выбран linear chain immutable finish-attempt records: parent/original-intent
  hashes, новый actor PID/birth и source/target gate facts; fork/cycle/budget refuse.
  Каждый intent публикуется до своих mutations; новая process incarnation не
  перепубликует gate с прежним PID/birth. Gate takeover использует exact old inode
  archive и atomic replacement без отсутствующего install-gate window.
- Только допустимые known prefixes первоначального resume: до/после публикации
  mutex gates/lease facts, completion и source/archive barrier transition. Чужой
  marker, fork/лишний файл, contradiction, corrupt record, изменённый receipt,
  unresolved outcome или неизвестный process observation сохраняют fence.
- Barrier снимается только после durable completion и exact archive/read-back;
  gate cleanup следует после него. Original history не очищается и не меняется.
- Первый срез даёт forward finish; broad rollback/update/legacy process-stop сюда
  не добавляются. Отказ finish сохраняет stopped состояние без ручного cleanup.
- Recovery code берётся из новой полностью проверенной standalone distribution
  с explicit expected distribution/current-package hashes. Установленный старый
  release читается как данные. Произвольный JSON с полем verified не становится
  private capability; code provenance проверяется до trusted imports.

## Допустимые фазы

| Сохранённые факты | Действие explicit finish |
| --- | --- |
| Valid intent, stop barrier,0/1/2 attributed gates, completion отсутствует | Завершить lease facts/commit под новым actor |
| Valid completion и stop barrier | Только exact archive/read-back barrier |
| Barrier и archive существуют | Допускается лишь доказанный same-inode/same-bytes hardlink prefix |
| Archive и completion, source barrier отсутствует | Только exact dead attributed lease cleanup |
| Записаны lease facts, gate исчез до completion | Fence: это не известный release prefix |
| Изменённая history/metadata, missing both, unknown actor, fork/corruption | Отказ без mutation |

## Progress

- [x] R3d1/R4 зафиксированы и evidence сохранено.
- [x] Bounded phase table/API и scoped implementation packet приняты.
- [x] Реализация и32component/6operator tests; старые22maintenance/7standalone и
  routing5PASS. Все части bounded source review ACCEPT, открытых P1/P2 нет.
- [x] Parent221selectedPASS, source freeze и milestone note для commit.
- [ ] R3d2b2 stopped certification/update/first legacy migration; B1 staging уже
  зафиксирован отдельно.

## Decision Log

Lifecycle-only continuation допускает завершение подтверждённой файловой фазы.
Она не повторяет принятую AE/RPC операцию и не создаёт новый execution owner.
Повторный crash не должен терять указатель на предыдущий continuation intent.

## Validation

`snapshots/core4-lifecycle/20261031/A/summary.json`,
run`9a165759-ba42-4b80-8437-1c4f2762b5b0`: **221/221PASS**,16checks/15batches,
sourceUnchanged=true. Boundaries41/liveCalls0,9changed JS syntax и diff check PASS.
Full release не запускалась; deferred coverage отражена в selection/summary.

Worker evidence сохранён рядом: exact10files/hashes,67component/operator/compat
PASS и5routingPASS. Process births в component fixtures синтетические; filesystem
prefixes/Windows rename/hardlink/CAS настоящие TEMP. Operator tests доказывают
проверку NEW distribution, opaque bootstrap brand, отсутствие imports установленного
poisoned source, pins/closure refusals и native port0 finally cleanup с synthetic
finish callback. Полный installed CLI finish/nativeCIM transaction не заявляется.

CLI surface в проверенной standalone distribution: `maintenance-inspect` и
`maintenance-finish`, explicit distribution/current-package hashes, installation,
operation ID и expected proof hash для action. Runtime source выбирается из новой
проверенной distribution, установленный release читается только как данные.
Граница continuation —16records; budget exhaustion сохраняет fence.

Installed recovery, actual update/AE dispatch и Windows job lifetime не проверены.

## Продолжение соседнего этапа

Для R3d2b выбрана full CEP staging перед visible switch с atomic rename; до stop
обязателен same-volume preflight CEP↔backup/stage. Config stage остаётся adjacent
конфигу. Transaction JSONv2/историческая lineage сохраняются, private switch metadata
связывает prepared plan/lease и exact old/new bytes. Interrupted mixed switch
потребует dedicated recovery capability, а не public JSON rehydration plan brand.
