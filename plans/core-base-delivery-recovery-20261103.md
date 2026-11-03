# База Core — native доставка, поздний ответ и recovery

3 ноября 2026. Продолжение основного плана по прямому выбору пользователя:
«Дальше доводить базу: доставка, поздние ответы и recovery».
Root — единственный controller/writer. Пользователь разрешил штатный B6 update
с изменением только args-path Core MCP entry; остальные MCP/Codex restart/config
и разработка Titles/Slideshow остаются отложенными. Existing manual text executor можно
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

- B6 packagecdf7338f… установлен/enabled: новый stopf41dbe21… и update806719be…
  settled с primary attempts1.80runtime/7CEP exact;145protected files preserved.
  MCP-config изменил только согласованный args-path. Own CEP close/open1,
  auto connected, sameAE21960/AEP3d19acd0…. Новый standard owner15616/bootbed482de….
  Native inspection comp1/layer13/BASE_A PASS; prepared task0558d0cf…/
  proposalc477c55e…, runAttempts0. Далее — пункты4–6 без replay прежних IDs.
  [Installed evidence](../docs/evidence/core-base-b6-installed-20261103.json).
- Пользователь разрешил установку подготовленного packagecdf7338f… и обновление
  только пути Core-клиента. Новый preflight подтвердил owner22188/booted18a535…,
  connected CEP, pending/UNKNOWN/fault0; installed21a884fa… прежний до update.
- B6 source fix принят: 15checks/330unique cases (87fresh/243exact current-key reuse)/55boundaries PASS. Один runtime file
  восстанавливает native USERPROFILE только для fixed PowerShell probe в scrubbed
  owner env. Две regression cases; четыре named test budgets изменены после
  подтверждённых timeout, все assertions сохранены. Failed batches не приняты;
  полные affected checks прошли заново.
  [Scope/evidence](../docs/core-base-b6-windows-probe-20261103.md).
- Первая native typed run task2e0d60d4…/proposalc4ec0189… отказала host_probe_failed
  до intent/send, commands0; original run не повторяется. Client released/exit0.
  Prepared-only task3d683015… не отправлялся. Native modal/fault/mutation0.
- Candidatecdf7338f…/distribution85c3d95a… (80/98) built/verified/dry-run. Actual
  install0; штатное обновление меняет одну args-line существующего Core MCP entry,
  что требует узкого уточнения в связи с паузой MCP/Codex config. После разрешённой
  поставки — fresh inspection/build/proposal и native сценарий пунктов4–6.

- Own fixture создан адресным gated JSX один раз и сохранён отдельно:
  `snapshots/core-base-b6-recovery-native-20261103.aep`/SHA3d19acd0…,
  comp1/layer13, текстBASE_A, реальные active fill/stroke. Native typed manual
  inspection приняла полный style proof; project-inspection подтвердила1item/1layer.
  Исходный пустой AEP8299fd9f… сохранён без изменений; setup не является typed proof.
- Новая штатная re-adoption `b25b5fef-ebed-406d-bf24-6e7e6cee13b5`:
  stop/certify/readopt-apply/enable settled, все primary attempts1. Adoption теперь
  exactAE21960/birth2026-11-03T06:03:11.2075250Z и own test path. Package21a884fa…,
  descriptor/client/config/receiver15settled/ledger1event/AEP unchanged across metadata
  operation. Fresh configured owner22188/birth639292940466114520/booted18a535…,
  peer auto connected, activity clean. Эту settled operation не повторять.
  [Evidence](../docs/evidence/core-base-b6-fixture-readoption-20261103.json).

- B5 составной TEMP HTTP/VM срез принят commit `4a88129`:14fresh cases,
  55boundaries, production delta0.
- Штатный configured B4 уже доступен без maintenance: owner16712, package21a884fa…,
  auto CEP connect, malformed contract отказ и fresh native project read PASS;
  controller generation1 released. Receiver11settled/prefix9 exact; protected
  files/bindings/archives/AEP unchanged. Дальше — собственный test fixture.
- Read-only inventory debugger2029 относится к чужому Automation Blocks. Наш
  panel debugger не включён; чужой target не использован для injection/control.

## Decision Log

- Установка выполнена по явному узкому ответу пользователя. MCP/Codex services
  остаются без refresh/restart. Новый thin client — standard proof; он не
  переобъявляется configured proof. Prepared proposal поддерживает lease renew;
  dry-run будет свежим непосредственно перед единственной run отправкой.
- Блок ведёт root: штатная поставка и native fault/recovery образуют одну цепочку
  live ownership, поэтому controller и writer не передаются помощнику. Разрешение
  args-path не возобновляет MCP/Codex service refresh; proof выполняется новым
  штатным thin client, configured proof нового package отдельно не обещается.
- Тестовые timeout не выдаются за production defect. Изменяются только бюджеты
  четырёх named tests; прочие проверки и guards сохранены. Accepted9/212 reuse
  разрешён после сравнения exact current keys; прерванный failed check не принят.

- Pre-submit host probe отказ не является UNKNOWN принятой mutation. Fault helper
  не запускался. Source-исправление env-причины подтверждено; далее новая package
  поставка и fresh proposal/inspection. Не отправлять прежний run повторно.

- Старый host adoption не соответствует новому AE/test path; перед mutation
  выполнена существующая stopped re-adoption, без bypass provider и без package/
  MCP/Codex config changes. Typed native inspect нового target не ослабляет
  исторический missing dormant color отказ и не возобновляет Titles development.

- Configured B4 пробел снят обычным текущим клиентом; отложенный service refresh
  для этого не выполнялся и не возобновляется. Причина выхода старого owner6340
  по новым observations не устанавливается.
- Наблюдаемый native confirmation предпочтителен вмешательству в evalScript:
  фиксированный installed asset, local risk gate и original callback сохраняются.
- Проверка text operation — инструментирование базового recovery, не разработка
  Titles; отказы полного native proof не исправлять типографическим fallback.

## Validation

- Installed80runtime/7CEP verified; protected bindings/session/adoption/AEP и
  все прежние start-over records/архивы145files сохранены через update.
  Последующая inspection добавила только begin22/complete23; prefix21 exact.
  Ledger15/prefix11 exact — metadata подготовки, mutation intent0.
- Итоговое evidence содержит15current keys/commands, результаты полных checks,
  exact reused prefix и hashes всех логов; cancelled/failed batches исключены.
  [Scope и состояние source-проверок](../docs/core-base-b6-windows-probe-20261103.md).

- Actual owner-like env reproduction: baseline FAIL, one-field native profile
  correction PASS, оба без AE команд. Результаты и regression/tests зафиксированы
  в постоянном source evidence. Closing status подтвердил прежний owner/boot,
  connected peer, pending/UNKNOWN/fault0; receiver21/prefix15 exact, ledger11/prefix1
  exact без физических command intents/reservations, protected bindings/AEP intact.

- Fixture native inspection и fixed Windows probe PASS; штатный helper distribution
 41d4812c… verified. Stop certificate a4f8d170…; exact witness/phase proofs завершили
  enable. Новый configured owner22188 читает ту же session/history15+1, auto peer
  connection. Сохранность six bindings/history/AEP проверена helper orchestration.

- Configured read выполнен один раз; journal добавил только begin10/complete11.
  Malformed contract не создал physical command. Два защищённых архива14/52events,
  current session/baseline/origins/adoption/absent ledger и AEP hashes сохранены.
- Нативная доставка/late callback/fault/mutation/reset нового этапа пока0.
