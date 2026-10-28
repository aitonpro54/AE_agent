# Локальный разбор единственного review native read recovery

28 октября 2026. Reviewed target — `80cc242fc7bc444d726223b39091bdee56879b37`.
Ответ Argon/Aiton/High получен: 27 577 bytes,
SHA-256 `f115c6b1df8615fc9a07e92611ebb4cf4349a904738d88be82b7fd962e1fa893`.
Raw response и payload не изменяются. Один upload, один send, повторов 0.

## Verdict и привязка

Внешний verdict — conditional go. Target, оба plan digests, request и payload
совпали с показанными в ответе значениями. Это declared string binding и
заявление модели о прочтении; независимого пересчёта хешей моделью не доказано.
Root отдельно сверил source hashes, 422 exact excerpt lines, bytes payload и
разделение external/local-only. Внешний ответ остаётся недоверенным evidence.

## Findings

Локальная проверка на этом шаге — адресный source argument по reviewed snapshot,
а не воспроизведение ещё не существующей реализации. Приоритеты сохранены как
риски реализации. Known означает учтённое открытое требование, а не готовый fix.

| ID | Внешний / локальный приоритет | Статус и новизна | Адресное evidence | Решение и следующая проверка |
| --- | --- | --- | --- | --- |
| NRR-PLAN-01 | P1 / P1 | Уже учтён, known-open | `80cc242:core4/integrations/cep/http-peer.js:13,72-74`; unified plan D | Historical ACK должен идти после channel auth и до current-package correlation, по exact old binding/pins/result и fixed disposition. Rotation/recover/ACK-loss tests; не promote UNKNOWN. |
| NRR-PLAN-02 | P1 / P1 | Подтверждён как обязательное сопряжение, known-open | `80cc242:core4/integrations/cep/completion-store.js:45,55,76` | Единый внутренний settled predicate во всех трёх местах; ownership/fault не смешивать с settled history. Descriptor context обязателен для fixed validator. Проверить reopen/begin/close/no replay, не только startup. |
| NRR-PLAN-03a | P1 / P1 | Подтверждён, new operational requirement | `80cc242:core4/cep/js/panel.js:3,15`; installer:74,78 | После обновления явно загрузить новый view CEP с сохранением localStorage. Connect старого in-memory cfg не считается reload. Новый restart AE не разрешён. |
| NRR-PLAN-03b | P1 / P1 | Уже учтён, known-open | capture plan: no ACK; `poll-dispatcher.js:16-18,22` | После durable capture вернуть детерминированный отказ `capture_recorded_no_ack`; latch должен остаться byte-identical. Проверить настоящий dispatcher + panel, eval/poll/ACK 0. |
| NRR-PLAN-03c | P1 / P1 | Подтверждён как уточнение, new | `panel.js:20`; `poll-dispatcher.js:22` | Ограничить ожидание completion после link; отсутствие cached result не угадывать. На timeout collector завершает evidence-only попытку без retry. |
| NRR-PLAN-04a | P2 / P2 | Подтверждён, new defect | `80cc242:core4/tools/install-core4.js:130-139` | Apply сейчас снимает install.lock в finally даже после partial visible switch. В C исправить fail-closed retention и проверить failure до/после switch; аналогично проверить rollback, не менять его вслепую. |
| NRR-PLAN-04b | P2 / P2 | Уже учтён для capture; расширение проверено как нужное для update | `80cc242:core4/runtime/stdio-entry.js:36-47`; capture plan п.1 | A проверяет actual CEP7 files отдельно. В C/D fixed installation verification должно закрывать несогласованный descriptor/release/CEP, а не полагаться на один release hash. |
| NRR-PLAN-05a | P2 / P2 | Подтверждён, known-open race | `80cc242:completion-store.js:12,41,76`; installer:84,111 | Старый runtime между B/C создаст новый closed owner. Удержать exclusive install lease через B→C в одном parent-owned контуре; публичный skipLock/Boolean не вводить. Не удалять вновь появившийся owner ради продолжения. |
| NRR-PLAN-05b | P2 / P2 | Уже учтён, known-open | unified B; capture plan preflight | Exact empty owner, journal preimage/tail и отсутствие obligations перепроверяются под gates перед archival. Нужны CAS/race/crash tests. A marker вообще не перемещает. |
| NRR-PLAN-06 | P3 / P3 | Уже учтён, known-open | `80cc242:stdio-entry.js:39`; installer rollback:141-165; unified C | Явная descriptor v2/schema/predecessor validation во всех применимых bootstrap readers/operators. Target rollback должен поддерживать persisted receiver format; иначе отказ до visible switch. UUID/hash/cycle/depth/token-rotation tests. |

Формулировка «необратимо заблокирует» в NRR-PLAN-02 не принимается буквально:
это закрытая lane, требующая поддержанного recovery, а не доказанная необратимость.
Технический риск удержания owner от этого остаётся.

## Дополнительные рекомендации и evidence limits

- Проверка packageHash/executorHash исторического receipt уже предусмотрена
  unified планом; отсутствие packageHash в старом command нельзя компенсировать
  текущими pins. Исторические pins берутся из проверенного capture/lineage.
- Panel MAC не является подписью AE. Нужна совокупность verified old closure,
  original managed-child correlation, наблюдения позднего correlated completion
  и actual cached result. Одно root narrative observation не заменяет transcript.
- Root восстановил из истории полный original managed command output и сверил
  шесть локальных evidence files: PID30248, receiver identity, request5,
  delivered status6, timeout и status8 UNKNOWN, exit0. Это provenance без authority.
- Текущий actual cached result остаётся неизвестным. Missing/wrong result или
  недостаточная provenance блокируют B–D, даже при внешнем go.
- Old reader обязан закрыться на новом record. Rollback, новые package metadata
  и сохранность достижимых transactions/releases проверяются адресно.
- Исторический Node не исполнять. Offline PASS не является live proof или
  desktop↔MSI round-trip. Root sole live controller; restart/save/raw/mutation 0.

## Локальное решение и порядок работы

1. Начать source-реализацию только A: standalone builtin-only collector,
   собственные fixtures/validation route. Старый установленный runtime не менять.
2. После scoped tests и локального source review Root может один раз запустить
   capture и обычное переподключение существующей панели. Eval, ACK, poll и
   изменение receiver journal/owner запрещены.
3. Лишь при actual durable receipt и полной eligibility продолжить source B–D.
   Parent technical authorization/disposition/install/native не выводятся из go.
4. Реализация findings проверяется локально; второго Argon review не будет.

## Validation

- Review raw hash/bindings и approved payload повторно сверяются перед принятием.
- Source implementation/tests/live recovery на момент этого решения — 0.
- Source ES3 milestone `cd95b26` сохраняет свои 42 scoped PASS; они не переносятся
  на будущие collector/lineage/reader bytes.
- `git diff --cached --check`: 55 trailing-whitespace warnings только внутри
  неизменяемого raw `response.txt`; они сохранены ради exact response SHA-256.
  Для остальных файлов этого milestone diff check PASS. Raw текст не форматируется.
