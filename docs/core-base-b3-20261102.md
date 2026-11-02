# B3: прекращение прежней работы и новый сеанс

Контракт до production write, 2 ноября 2026. Root — единственный writer и
live-controller. Реализация идёт в существующей installation-scoped композиции;
новый транспорт, Titles compiler и automatic project lifecycle не добавляются.

## Механизм

1. Явная команда «Начать заново» создаёт один durable reset intent с server-owned
   UUID, installation/package/descriptor bindings и точной identity прежнего owner.
   Повтор status/continue относится к тому же UUID. После intent admission заморожен;
   штатный maintenance stop закрывает owner после завершения его принятых callbacks.
   Ни планы, ни физические команды не переотправляются.
2. Finisher имеет полный installation-контекст и проверяет точную смерть прежнего
   Node owner, свободный endpoint и неизменность своего intent. При незавершённой
   или неизвестной физической работе он дополнительно требует прекращения всех
   процессов AE, наблюдавшихся при начале сброса. PID без birth не является proof.
   Если прежнее исполнение уже доказанно прекратилось, restart AE не требуется.
   Finisher сам не убивает AE и не закрывает несохранённый проект: показывает
   конкретное необходимое действие. Root защищает работу и выполняет разрешённый
   restart при installed-проверке.
3. После barrier proof и под исключительным файловым допуском finisher сохраняет
   прежние `broker/` и `receiver/` целиком в transaction history, вместе с точными
   runtime/maintenance markers. UNKNOWN остаётся UNKNOWN; manifest отдельно
   обозначает отказ от продолжения прежнего сеанса. Это не success/cancelled,
   не rollback AEP и не ручная очистка locks. Чужие/неатрибутированные markers,
   чужие ресурсы и повреждённые истории не разрешаются по одному имени файла.
4. Новый сеанс получает новый подписанный session ID, новые Broker/receiver
   stores и owner boot/lease. Старые proposals, tasks, ответы и attachment refs
   отсутствуют в исполняемом состоянии. Все прежние bytes и списки неизвестных
   исходов остаются доступны в reset history. Идентичность установки, credentials,
   origins и пользовательские файлы сохраняются.
5. Панель принимает session ID только из authenticated handshake. Её старый latch
   сохраняется под прежним session key; новый dispatcher не восстанавливает и
   не исполняет его. До свежей project-inspection новой работы с эффектами нет.
   Новая adoption после restart не означает continuity или mutation grant.
6. Фазы intent → stopped/barrier → archive → publish → baseline/ready фиксируются
   до перехода. Любое прерывание оставляет admission закрытым. Продолжение сверяет
   тот же intent, каждый источник/архив и уже совершённые rename; не угадывает
   промежуточное состояние и не создаёт второй сброс.

## Срезы и файлы

- B3a: private transaction/inspection module в `core4/runtime/`, собственные
  bounded component tests и selector registration. Без новой кнопки-заглушки.
- B3b: composition/owner entry, authenticated panel control, session key dispatcher,
  source package и штатный operator helper. Изменения packaging проверяются
  вместе с exact runtime closure. До этого installed runtime не менять.
- B3c: защита тестового AEP, штатный package/install, настоящий panel/Core reset и
  свежая configured project-inspection. Старые settled transactions не повторять.

## Адресная приёмка

Очередь до доставки; UNKNOWN и поздний результат; прерывание после каждого
архивирования/публикации; повтор continue того же сброса; чужой PID/birth/marker;
изменённый архив/intent; старый client/proposal/latch; свежая inspection до допуска
эффектов. В component tests допустимы только явно тестовые process observations;
production barriers проверяются штатным native probe без public injection.

Selector выбирается по фактическому diff каждого среза. Успешные exact closures
переиспользуются; full release и двусторонняя portability не объявляются закрытыми.
Статус этого документа: контракт выбран, B3 ещё не реализован и не установлен.
