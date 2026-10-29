# plans/core-post-reinstall-audit-20261029.md

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: c8062662c5f1e43271b6fdac2022cbe62d56ae1a8f88cab14376e49c255a51fa
Classification: INTERNAL; source code/documentation only.

## Source lines 1-109

```text
1: # Аудит Core после переустановки внешней среды
2: 
3: 29 октября 2026. Baseline `769e5bc`, рабочий корень `AE_agent_core`.
4: Поручение пользователя: проверить накопившиеся исправления после переустановки,
5: быстрое обычное подключение, исходные функции и модульность; убрать только
6: доказанные излишества. Одно Argon review допустимо после локальной работы.
7: 
8: ## Scope и исходные факты
9: 
10: Это engineering-аудит существующего Core, а не полный release или перенос
11: на вторую машину. Root — единственный live/CEP/UI controller и writer.
12: Пользователь сначала назвал6.3, затем6.2 и отдельно подтвердил **After Effects26.2**.
13: Файл фактически запущенного AfterFX сообщает ProductVersion/FileVersion 26.3.
14: Переустановка и улучшение работы — пользовательское наблюдение, не доказанная
15: первопричина всех прежних отказов.
16: 
17: ## Progress
18: 
19: - [x] Проверены intent, основной и installable планы, история `0131ab3..769e5bc`.
20: - [x] Установленный пакет `f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90`
21:   прошёл штатный read-only verifier descriptor/origins/release/CEP/Node.
22: - [x] Свежий process census: AE PID18992; Core PID5280, parent — текущий
23:   configured app-server PID14720; exact argv указывают на f548. Порт3457 занят им.
24: - [x] Визуально подтверждён пустой Untitled Project без dirty marker. Панель
25:   Core4 открыта через Window → Extensions; на снимке примерно через818мс после
26:   клика уже «Подключено к Core 4.0.0». Это один UI observation, не benchmark.
27: - [x] M1/modularity suites:108/108PASS; boundaries21PASS.
28: - [x] Baseline connection/startup/installer:41panel +19recovery +23installable
29:   +3human-window =86PASS, exit0. Runtime source оставался baseline до завершения.
30: - [x] Временная установка реальным installer воспроизвела `lineage_depth`:
31:   initial+17same-package updates; apply успешен всегда, resolve исходного
32:   descriptor успешен на0–15переходах и отвергается на16–17.
33: - [x] Удалён произвольный предел16descriptors: private lazy snapshot имён
34:   transaction files + запрет повторного transactionId ограничивают обход
35:   фактически существующей историей. Schema/hash/path/release/MAC/lease прежние.
36:   Нет нового API, cache, миграции истории или ослабления UNKNOWN.
37: - [x] Завершена адресная проверка:18неизменённых сценариев scoped suite PASS;
38:   единственный упавший expanded scenario после исправления тестового cache
39:   повторно PASS. Не заявляется единый полный19/19прогон финального test файла.
40: - [x] Source/audit milestone зафиксирован: `1ec34536e8ea6b90e6c005c8068646ef72d41ac2`.
41: - [ ] Подготовить и передать единственное Argon review по текущему поручению.
42: - [ ] Получить и локально разобрать ответ Argon без повторного review.
43: 
44: ## Разбор прежних изменений
45: 
46: | Группа | Решение и основание |
47: | --- | --- |
48: | ES3 reserved words/JSON, CIM, MCP `_meta`, direct-main exports, native TOML paths, installer cwd | Сохранить: исправляют воспроизведённые ошибки кода/совместимости, независимо от версии AE. |
49: | Exact Origin/MAC, private grants, owners, durable intent, UNKNOWN/no-replay | Сохранить: это контракт безопасности исполнения, не обход аварии AE. |
50: | `duplicate_peer` bounded reconnect | Сохранить: включается только после точного отказа duplicate peer. У обычного подключения нет искусственной начальной задержки; свежий UI успех это подтверждает в одном запуске. |
51: | `check-core4-endpoint` | Опциональная диагностика с нулевым payload; не находится в runtime closure и не доказывает связь с AE. |
52: | capture/dispose/zero-dispatch и XV/XVI launchers | Операторские/исторические инструменты; не входят в обычный connect. Повторно не запускать ради новой проверки. Удаление не ускорит штатный runtime. |
53: | historical disposition/lineage reader | Нужен для уже сохранённой истории и no-replay. Обнаружен отдельный дефект глубины; нельзя лечить удалением journal/history/подписей. |
54: 
55: ## Decision Log
56: 
57: - Полезные исправления не откатываются на основании одной гипотезы об AE.
58:   Новые recovery launchers, перенос state и обход occupied owner не создаются.
59: - Реальный native вызов в этой сессии пока невозможен через configured client:
60:   Core4 отсутствует в доступном tool inventory. Одна bounded попытка existing
61:   app-server proxy отказала до initialize (`os10050`, stdout0). Второй runtime
62:   не запускался. UI Connected не объявляется MCP→AE inspection PASS.
63: - Повторный UI снимок через376с также показывает Connected; это наблюдение
64:   в двух точках времени, не мониторинг без разрывов. Пакет f548 не заменялся.
65: - Private snapshot допускает максимум `|S|` рёбер и `|S|+1`descriptors:
66:   каждое ребро требует имя из первоначального снимка и ещё не использованный ID.
67:   Добавление файлов во время обхода не расширяет `S`. Имена не являются доверием:
68:   каждый прочитанный файл/descriptor/release проходит прежнюю проверку.
69:   Время и память растут с историей; постоянная стоимость не обещается.
70: - Первое расширение регрессии выявило ошибку самого теста: после намеренной
71:   порчи synthetic cache новый startup корректно отказал `immutable_runtime_integrity`.
72:   Тест теперь отдельно проверяет историческое чтение при испорченном cache,
73:   восстанавливает ровно test bytes и лишь затем запускает установленный child.
74:   Runtime integrity не ослаблена; исходный неуспех сохранён в diagnostic log.
75: - Модульность самого Broker покрыта M1: запуск без пакетов, локальные pins,
76:   выбранная closure, независимость worker/engine. **Устанавливаемая композиция
77:   ещё не выполняет весь intent**: `stdio-entry`, packager и installer жёстко
78:   требуют `titles-current-target`; `check:boundaries` не охватывает runtime.
79:   Это известный открытый архитектурный долг, а не результат внешней аварии.
80:   Следующий отдельный блок — декларативная композиция admitted assets и реальная
81:   установка read-only Core без titles/engine, с сохранением admission semantics.
82: - Manual text mutation/adoption, automatic lifecycle provider и переносимость
83:   P1–P8 не принимаются по UI подключению или offline тестам. Пользовательский
84:   AEP, raw JSX, save/reopen/destructive и AME в этом аудите не затрагиваются.
85: 
86: ## Validation
87: 
88: Локальные логи: `snapshots/core4-live-proof/XVII-post-reinstall-audit-20261029/`.
89: `modularity-m1.log`: `npm.cmd --prefix core4 test`,108PASS, exit0.
90: `check:boundaries`:21source units, liveCalls0.
91: `baseline-scoped.log`:86PASS (41+19+23+3), exit0, baseline runtime source.
92: `inventory-negative.log`:1PASS; отсутствующая transaction, late file и настоящий
93: junction отвергаются, после восстановления новый вызов проходит без cache.
94: `deep-history-diagnostic.log`: ожидаемо не принят; тест дошёл до18transactions,
95: но startup отказал из-за намеренно испорченного тестового cache.
96: `final-scoped.log`:18/19PASS, exit1; единственный отказ — описанная выше
97: ошибка расширенного теста, runtime source уже окончательный.
98: `deep-history-final.log`: исправленный первый сценарий PASS, exit0;
99: 17updates после recovery,18рёбер к исходному descriptor, installed direct-main
100: и standalone store, original UNKNOWN/duplicate no-replay, late ACK, tamper,
101: дополнительный UNKNOWN и сохранение gates. Остальные18случаев не менялись;
102: их результаты переиспользованы без повторного полного прогона.
103: Независимое bounded source review двухфайлового diff: блокирующих дефектов нет;
104: ограничение стоимости по размеру истории сохранено явно.
105: Детерминированная сборка60files: `e07346dc0ffefc01b582ae9f332aeac1b4ca6b78c7d101126a2eaee64821264b`;
106: повторный build/verifyPackage совпал. Candidate сохранён локально, не установлен.
107: Final `git diff --check` и повторный installed verifier f548 PASS.
108: Reproduction выполнен на temp-only installation, Node24.15.0, f548; actual AE
109: commands0. Live proof ограничен открытием панели и UI Connected.
```

