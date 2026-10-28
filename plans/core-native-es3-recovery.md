# Native ES3 compatibility и незавершённая read-only inspection

28 октября 2026. Продолжение установки AE Agent Core, baseline source3031153.
Root остаётся единственным live-контроллером. Одно Argon review на самостоятельный
этап и локальная проверка исправлений — действующая схема; второго review нет.

## Progress

- [x] Package6c94 установлен:56release/7CEP files и stable origins проверены.
- [x] По явному разрешению пользователя после неудачного Alt+F4 завершён только
  старый пустой PID27832 с проверенным birth; новый AE PID20108 запущен без AEP.
- [x] Собственная обновлённая панель показывает «Подключено к Core4.0.0»;
  installed stdio подтверждает authenticated peer.connected=true.
- [x] Одна реальная read-only inspection доставлена; AE выдал reserved-word
  syntax error154. Callback timeout сохранил UNKNOWN, чтение не повторялось.
- [x] Source defect исправлен и независимо reviewed ACCEPT: `'protected'` key,
 7 bracket accesses, scoped artifact/admission/catalogRevision.42selected checks,
  boundaries21/syntax/diff PASS; full generated registry проходит ES3 parser.
- [ ] Подготовлен и реализован корректный отдельный reconciliation путь для
  первоначального direct read-only UNKNOWN; нет разрешения сбрасывать state.
- [ ] После корректного reconciliation обновлён ES3 package и получен успешный
  native read. Current installation6c94, candidate947 не установлен.

## Decision Log

- Native callback request5 использовал свежий contractId из actual reply3.
  Request4 с опечаткой CID получил definite `contract_required` до dispatch;
  исправленный запрос — единственная native попытка, не replay UNKNOWN.
- Direct inspection command `inspect-2a2b1fcf-fa87-46fd-a990-0cd26689aa1c` был
  delivered=true; timeout вернул `host_callback_timeout`. Оригинальный scope —
  project-inspection/inspect, effect none. Mutation/save/raw commands0.
- После timeout root закрыл только информационную syntax modal. Поздний callback
  привёл панель к `unknown_no_promotion`: сервер проверил authentication/correlation,
  но не принял result и не снял UNKNOWN. Pending=null не означает разрешённый исход.
- Первичная ошибка — compiled registry154, источник
  `core4/modules/titles-current-target/executor.jsx:43`: unquoted `protected`.
  Парсится весь combined registry, поэтому ошибка manual asset блокирует read-only
  asset. Современный Node VM её пропустил; ES3 grammar regression теперь обязательна.
- Исправление не меняет JSON key/schema/CAS/confirmation/readback semantics.
  Core/protocol/engine/другие модули и admissions остались byte-identical;
  catalog меняет только revision. Package собирается штатно, registry не патчится.
- Отдельный dev-test child использует shipped Node Acorn через --expose-internals,
  ecmaVersion3/allowReserved never; production Node/CEP flags не менялись,
  dependencies не устанавливались. Отсутствие parser закрывает тест.
- Root штатно закрыл proof MCP child30248 после pending=null, exit0; UNKNOWN
  остаётся в исходном receiver store. Owner/journal/fences не удаляются, новых
  origins/grants/AE-restarts не создаётся. Project MCP остаётся disabled на время
  технической блокировки; configured Codex-client не считается проверенным.
- После exit0 в receiver сохранился owner marker вместе с begin/UNKNOWN.
  Он не удалён и не объявлен свободным по отсутствию процесса. Это не подходит
  под прежний zero-dispatch retirement, который требует единственный origin.

## Validation

- Actual proof log: ignored `snapshots/core4-live-proof/IV-origin-portability-20261028/installed-proof-1793180928337/`.
  Initialize1/status2/contract3 успешны, request4 refused, request5 timeout,
  statuses6–8 фиксируют delivery/UNKNOWN. Это connection proof, не native read PASS.
- Baseline registry cbbd38477def9489bc0f8e153a48f19a419b788fdbc924114bc92e6cd6982c59
  воспроизвёл Acorn ES3 error `protected` на154:51. Corrected registry
  ca09e5947906a42407280a49875c77062dd8dcde022afe3311aa74eeaa85e921 — grammar PASS.
- Final scoped checks: manual12/installable21/catalog2/photo3/titles4 =42PASS;
  source reviewer ACCEPT без actionable findings, read-only/tests0/live0.
- Exact source/pin hashes, полный stdout, selection/deferred:
  ignored `snapshots/core4-live-proof/V-native-es3-20261028/`.
- Root independently built candidate56files/286800bytes:
  packageHash947273c68be367cc36a27c3738c2a076493d5b7fdca4d876ff0944a087452c14,
  fileSHAd566bb3a2f33a5f6cd8e54ada0ae45ebfd3fee2d554515b9bedc15fb81488b95;
  `dist/core4/4.0.0-es3-947273c68be3/core4-4.0.0.json`. Не установлен.
- AE host APIs после ES3 fix, live acceptance, desktop↔MSI P1–P8 и full release
  не подтверждены. Source/package PASS не разрешает существующий runtime UNKNOWN.

## Следующий ограниченный инженерный блок

Direct facade.inspect не создаёт Broker task/ledger command. Поэтому существующий
reconcile_task его не обслуживает; zero-dispatch recovery неприменим к begin/UNKNOWN.
Поддержанного seam для корректного снятия этого fence сейчас нет.

1. Спроектировать capture оригинального authenticated callback receipt через
   existing browser recovery БЕЗ eval: полная валидация/durable evidence, lane
   остаётся закрытым. Нельзя угадывать readFailure code по одной modal.
2. Eligibility ограничить exact original command/binding/pins/controller/channel/
   store/installation, project-inspection/inspect и проверенной effect-none closure.
   Доказать terminal callback/physical settlement и отсутствие других obligations.
3. Предусмотреть отдельную parent-owned одноразовую техническую авторизацию
   exact proof digest и атомарный operator с exclusive ownership/CAS/durability.
   Не public Boolean, не произвольный receipt и не переносимый grant.
4. UNKNOWN оставить неизменяемой историей/no-replay. Только явно проверенная
   disposition verified terminal read failure может быть основанием нового
   admission. Текущий reader такого состояния не поддерживает; нужен отдельный
   версионированный контракт, старый runtime остаётся fail-closed.
5. Не делать generic store.closed=false, reset/delete/new origin, повтор inspect
   или установку поверх fence ради видимости успеха. Это подготовленный scope,
   не реализованная recovery authority и не разрешение применить operator.
