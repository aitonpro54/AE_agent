# База Core — native доставка, поздний ответ и recovery

3 ноября 2026. Продолжение основного плана по прямому выбору пользователя:
«Дальше доводить базу: доставка, поздние ответы и recovery».
Root — единственный controller/writer. MCP/Codex restart/config и разработка
Titles/Slideshow остаются отложенными. Существующий manual text executor можно
использовать только как тестовую операцию базы, без изменения его style proof.

## Последовательность и критерии

1. Сохранить configured B4 checkpoint: malformed contract отказ до submit,
   fresh exact-contract native read/release, prefix9 и protected files intact.
2. Подготовить отдельный own saved test AEP из пустого базового проекта. Создать
   одну comp/один static text; задать реальные fill/stroke через UI. Не использовать
   пользовательские источники, не ослаблять native inspection и не менять executor.
   Инспекция должна назвать точные saved project/comp/layer и принять полный proof.
3. Пройти штатные build/propose/dry-run и действующие ownership/checkpoint gates.
   При отказе выяснить конкретную boundary; не обходить adoption/lease/authority.
4. Использовать existing native confirmation как наблюдение доставленной команды.
   До fault записать exact commandId/task/proposal и owner PID/birth/boot; сохранить
   test AEP и исходные journals. Не воспроизводить старые settled команды.
   На собственной цели допустим один адресный owner fault, пока AE показывает
   именно confirmation этой новой команды. Смерть exact old Node должна быть
   доказана до любого recovery; исход команды не угадывается по timeout.
5. Подтверждение той же original native команды, если используется в сценарии,
   допускает ровно одну тестовую mutation. Не отправлять её второй раз. Проверить
   текст в AE; поздний reply не должен превращать старый UNKNOWN в success.
   Если подтверждение отклонено, не считать это proof applied mutation recovery.
6. Новый B3 reset — отдельный server-owned intent, не повтор9b128005/69facd01.
   Сохранить own test AEP, выполнить required exact AE exit, архивировать прежнюю
   историю штатным finisher, открыть тот же test AEP и получить новую session/
   explicit control/fresh baseline. Старые outcomes и no-replay сохранить.

Успех этапа требует observed native delivery, честного исхода позднего ответа,
отдельного read-back результата и штатного возвращения к новой базе. Для принятой
mutation явно указать applied/unknown и границу saved/reopened. Отдельные части
можно фиксировать как checkpoints; offline/VM и pre-submit rejection не являются
native mutation proof. При недоступном поддержанном пути оставить точный пробел,
продолжая независимые проверки без нового транспорта или скрытого ingress.

## Progress

- B5 составной TEMP HTTP/VM срез принят commit `4a88129`:14fresh cases,
  55boundaries, production delta0.
- Штатный configured B4 уже доступен без maintenance: owner16712, package21a884fa…,
  auto CEP connect, malformed contract отказ и fresh native project read PASS;
  controller generation1 released. Receiver11settled/prefix9 exact; protected
  files/bindings/archives/AEP unchanged. Дальше — собственный test fixture.
- Read-only inventory debugger2029 относится к чужому Automation Blocks. Наш
  panel debugger не включён; чужой target не использован для injection/control.

## Decision Log

- Configured B4 пробел снят обычным текущим клиентом; отложенный service refresh
  для этого не выполнялся и не возобновляется. Причина выхода старого owner6340
  по новым observations не устанавливается.
- Наблюдаемый native confirmation предпочтителен вмешательству в evalScript:
  фиксированный installed asset, local risk gate и original callback сохраняются.
- Проверка text operation — инструментирование базового recovery, не разработка
  Titles; отказы полного native proof не исправлять типографическим fallback.

## Validation

- Configured read выполнен один раз; journal добавил только begin10/complete11.
  Malformed contract не создал physical command. Два защищённых архива14/52events,
  current session/baseline/origins/adoption/absent ledger и AEP hashes сохранены.
- Нативная доставка/late callback/fault/mutation/reset нового этапа пока0.
