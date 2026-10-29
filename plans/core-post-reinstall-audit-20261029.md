# Аудит Core после переустановки внешней среды

29 октября 2026. Baseline `769e5bc`, рабочий корень `AE_agent_core`.
Поручение пользователя: проверить накопившиеся исправления после переустановки,
быстрое обычное подключение, исходные функции и модульность; убрать только
доказанные излишества. Одно Argon review допустимо после локальной работы.

## Scope и исходные факты

Это engineering-аудит существующего Core, а не полный release или перенос
на вторую машину. Root — единственный live/CEP/UI controller и writer.
Пользователь сначала назвал6.3, затем6.2 и отдельно подтвердил **After Effects26.2**.
Файл фактически запущенного AfterFX сообщает ProductVersion/FileVersion 26.3.
Переустановка и улучшение работы — пользовательское наблюдение, не доказанная
первопричина всех прежних отказов.

## Progress

- [x] Проверены intent, основной и installable планы, история `0131ab3..769e5bc`.
- [x] Установленный пакет `f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90`
  прошёл штатный read-only verifier descriptor/origins/release/CEP/Node.
- [x] Свежий process census: AE PID18992; Core PID5280, parent — текущий
  configured app-server PID14720; exact argv указывают на f548. Порт3457 занят им.
- [x] Визуально подтверждён пустой Untitled Project без dirty marker. Панель
  Core4 открыта через Window → Extensions; на снимке примерно через818мс после
  клика уже «Подключено к Core 4.0.0». Это один UI observation, не benchmark.
- [x] M1/modularity suites:108/108PASS; boundaries21PASS.
- [x] Baseline connection/startup/installer:41panel +19recovery +23installable
  +3human-window =86PASS, exit0. Runtime source оставался baseline до завершения.
- [x] Временная установка реальным installer воспроизвела `lineage_depth`:
  initial+17same-package updates; apply успешен всегда, resolve исходного
  descriptor успешен на0–15переходах и отвергается на16–17.
- [x] Удалён произвольный предел16descriptors: private lazy snapshot имён
  transaction files + запрет повторного transactionId ограничивают обход
  фактически существующей историей. Schema/hash/path/release/MAC/lease прежние.
  Нет нового API, cache, миграции истории или ослабления UNKNOWN.
- [x] Завершена адресная проверка:18неизменённых сценариев scoped suite PASS;
  единственный упавший expanded scenario после исправления тестового cache
  повторно PASS. Не заявляется единый полный19/19прогон финального test файла.
- [x] Source/audit milestone зафиксирован: `1ec34536e8ea6b90e6c005c8068646ef72d41ac2`.
- [ ] Подготовить и передать единственное Argon review по текущему поручению.
- [ ] Получить и локально разобрать ответ Argon без повторного review.

## Разбор прежних изменений

| Группа | Решение и основание |
| --- | --- |
| ES3 reserved words/JSON, CIM, MCP `_meta`, direct-main exports, native TOML paths, installer cwd | Сохранить: исправляют воспроизведённые ошибки кода/совместимости, независимо от версии AE. |
| Exact Origin/MAC, private grants, owners, durable intent, UNKNOWN/no-replay | Сохранить: это контракт безопасности исполнения, не обход аварии AE. |
| `duplicate_peer` bounded reconnect | Сохранить: включается только после точного отказа duplicate peer. У обычного подключения нет искусственной начальной задержки; свежий UI успех это подтверждает в одном запуске. |
| `check-core4-endpoint` | Опциональная диагностика с нулевым payload; не находится в runtime closure и не доказывает связь с AE. |
| capture/dispose/zero-dispatch и XV/XVI launchers | Операторские/исторические инструменты; не входят в обычный connect. Повторно не запускать ради новой проверки. Удаление не ускорит штатный runtime. |
| historical disposition/lineage reader | Нужен для уже сохранённой истории и no-replay. Обнаружен отдельный дефект глубины; нельзя лечить удалением journal/history/подписей. |

## Decision Log

- Полезные исправления не откатываются на основании одной гипотезы об AE.
  Новые recovery launchers, перенос state и обход occupied owner не создаются.
- Реальный native вызов в этой сессии пока невозможен через configured client:
  Core4 отсутствует в доступном tool inventory. Одна bounded попытка existing
  app-server proxy отказала до initialize (`os10050`, stdout0). Второй runtime
  не запускался. UI Connected не объявляется MCP→AE inspection PASS.
- Повторный UI снимок через376с также показывает Connected; это наблюдение
  в двух точках времени, не мониторинг без разрывов. Пакет f548 не заменялся.
- Private snapshot допускает максимум `|S|` рёбер и `|S|+1`descriptors:
  каждое ребро требует имя из первоначального снимка и ещё не использованный ID.
  Добавление файлов во время обхода не расширяет `S`. Имена не являются доверием:
  каждый прочитанный файл/descriptor/release проходит прежнюю проверку.
  Время и память растут с историей; постоянная стоимость не обещается.
- Первое расширение регрессии выявило ошибку самого теста: после намеренной
  порчи synthetic cache новый startup корректно отказал `immutable_runtime_integrity`.
  Тест теперь отдельно проверяет историческое чтение при испорченном cache,
  восстанавливает ровно test bytes и лишь затем запускает установленный child.
  Runtime integrity не ослаблена; исходный неуспех сохранён в diagnostic log.
- Модульность самого Broker покрыта M1: запуск без пакетов, локальные pins,
  выбранная closure, независимость worker/engine. **Устанавливаемая композиция
  ещё не выполняет весь intent**: `stdio-entry`, packager и installer жёстко
  требуют `titles-current-target`; `check:boundaries` не охватывает runtime.
  Это известный открытый архитектурный долг, а не результат внешней аварии.
  Следующий отдельный блок — декларативная композиция admitted assets и реальная
  установка read-only Core без titles/engine, с сохранением admission semantics.
- Manual text mutation/adoption, automatic lifecycle provider и переносимость
  P1–P8 не принимаются по UI подключению или offline тестам. Пользовательский
  AEP, raw JSX, save/reopen/destructive и AME в этом аудите не затрагиваются.

## Validation

Локальные логи: `snapshots/core4-live-proof/XVII-post-reinstall-audit-20261029/`.
`modularity-m1.log`: `npm.cmd --prefix core4 test`,108PASS, exit0.
`check:boundaries`:21source units, liveCalls0.
`baseline-scoped.log`:86PASS (41+19+23+3), exit0, baseline runtime source.
`inventory-negative.log`:1PASS; отсутствующая transaction, late file и настоящий
junction отвергаются, после восстановления новый вызов проходит без cache.
`deep-history-diagnostic.log`: ожидаемо не принят; тест дошёл до18transactions,
но startup отказал из-за намеренно испорченного тестового cache.
`final-scoped.log`:18/19PASS, exit1; единственный отказ — описанная выше
ошибка расширенного теста, runtime source уже окончательный.
`deep-history-final.log`: исправленный первый сценарий PASS, exit0;
17updates после recovery,18рёбер к исходному descriptor, installed direct-main
и standalone store, original UNKNOWN/duplicate no-replay, late ACK, tamper,
дополнительный UNKNOWN и сохранение gates. Остальные18случаев не менялись;
их результаты переиспользованы без повторного полного прогона.
Независимое bounded source review двухфайлового diff: блокирующих дефектов нет;
ограничение стоимости по размеру истории сохранено явно.
Детерминированная сборка60files: `e07346dc0ffefc01b582ae9f332aeac1b4ca6b78c7d101126a2eaee64821264b`;
повторный build/verifyPackage совпал. Candidate сохранён локально, не установлен.
Final `git diff --check` и повторный installed verifier f548 PASS.
Reproduction выполнен на temp-only installation, Node24.15.0, f548; actual AE
commands0. Live proof ограничен открытием панели и UI Connected.
