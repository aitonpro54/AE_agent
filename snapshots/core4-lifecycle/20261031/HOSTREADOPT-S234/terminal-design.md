# Terminal receipt после завершённого enable

31 октября 2026. Confirmed P2 в freeze03, отдельное локальное уточнение F04/H08.
Root поднял normal-owner race; writer и независимый reviewer подтвердили source.
Это не новая Argon отправка и не приёмка будущей реализации.

## Дефект и evidence

Transaction:240 после release вызывает readState; тот вызывает s.base до phase
enabled. Certificate port:283–290 требует current stopped markers/history.
Execute:261 вызывает checked раньше terminal no-op:272. Живой прежний helper,
новый startup gate/ready markers либо новые history events могут вызвать false
failure после уже совершённого enable.

`terminal-before-fix/` содержит1TEMPtest/3states, которые **ожидаемо воспроизводят
дефект**, а не доказывают исправление: actor_not_dead, inode_changed и
stopped_certification_changed, все zero-write. Actual installation/3457=false;
использованы реальные TEMP owner lifecycle/stores. Original canonical aliases0,
new canonical startup gate1, inode отличается; helper election listener удержан.
Report SHA3f0b928d…/rawSHAc9ed1519… проверены root. Frozen11source не менялись.

## Принятая локальная граница исправления

- Проверить HMAC/schema original readopt records, bounded prior/actor chain и
  связность completed→enable-intent→enable-ready→enabled. Сохранить exact phase
  tree/inode/preparation inventories, original certificate/receipt/lifecycle refs.
- Проверить protected descriptor/origin/anchor/client/package через existing
  context/snapshot(false), pinned old archive/replacement/current adoption и
  archived original stop. Normal certificate brand из JSON не создаётся.
- Доказать отсутствие **original role aliases**: original anchors exact bytes/
  inode, nlink вернулся к baseline, canonical dev/ino не original. Новый startup
  или foreign gate — opaque текущий объект, не lease input. Direct lstat не
  следует symlink; ancestor paths сохраняют plain-path guard.
- Original both/install-only prefix остаётся strict pending recovery. Никакого
  освобождения чужих gates, новых attempts/actors, publish/lease/authority в
  historical terminal ветке. Original alias extra-link/corruption — отказ.
- Historical terminal выбирается до current stopped-marker/history и actor-death
  guards. Допустимы только inspect и enable-finish с exact proof как read-only
  no-op; enableTail после собственного release возвращает такой же receipt.
  Остальные входы не получают terminal evidence как stopped authority.
- Результат явно currentRuntimeObserved=false/currentHistoryObserved=false и
  authority=false. Более поздний barrier другой transaction также не удаляется
  и не объявляется отсутствующим. Это phase исходной operation, не оценка
  текущего состояния Core/AE.

## Проверка после реализации

Нужны startup gate после реального last unlink, ready owner/stores/new history,
live original finisher, foreign byte-equal inode untouched, subsequent barrier,
original partial release/death guards и extra original aliases. Forged receipts,
byte-equal replaced inode, phase extras/protected drift отказывают без записей.
Independent review относится к новому delta; старый frozen PASS его не покрывает.
Reuse baseline разрешён только для unchanged dependencies/commands/evidenceKeys.
Корректный design может потребовать narrow certificate-port delta; тогда его
current-key regressions выполняются заново. Existing runtime/package не меняются.
