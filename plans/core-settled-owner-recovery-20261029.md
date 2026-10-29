# MSI: восстановление receiver ownership и установка f548

29 октября 2026, baseline `92783dd`. Прямое поручение пользователя:
«Продолжай: безопасно восстанови ownership для receiver/owner и доведи установку
Core4 до конца». Рабочий root — `C:/Users/Ant/Documents/Codex/AE_agent_core`.

## Scope

Одна локальная операция над точным сохранившимся receiver marker установленного
fa9e и установка уже проверенного f548. История UNKNOWN/terminal disposition,
origins, journal и пользовательский AEP сохраняются. Root — sole live controller;
специалист пишет private helper и fixtures в ignored evidence XV. Source Core4,
общий startup/installer и zero-dispatch recovery не расширяются этим оператором.

## Progress

- [x] Свежий configured status: managed24688, receiver closed/unknown=true,
  fault=false, pending=null; broker fault=false/unresolved=[], worker pending0.
- [x] Подтверждены точные6identity поля receiver и broker, hashes защищённых
  файлов; прежние21872/26568 отсутствуют. Current24688 родился05:29:35.8144150UTC.
- [x] Scope recovery явно привязан к прямому поручению пользователя и точному
  наблюдаемому receiver marker; автоматическое generic recovery не вводится.
- [x] Helper/fixtures завершены:46/46PASS; независимое source review ACCEPT,
  открытых P1/P2 нет. Root actual inspect отказал до lease/intent при живом24688.
- [ ] Runtime штатно освобождён; operator inspect и apply прошли под lease.
- [ ] Архив marker, установленный f548, config/CEP/Node/state прочитаны обратно.
- [ ] Новый configured handshake/status подтвердил открытый receiver. Живая
  CEP/AE приёмка остаётся отдельно от файловой установки.

## Decision Log

- Receiver marker пустой: PID/token создателя в нём нет. Timestamp согласуется
  с историческим21872, но не является доказательством авторства. Recovery
  допускается только для зафиксированной идентичности по прямому поручению,
  полному settled journal/lineage и свежему отсутствию runtime/endpoint под lease.
- Journal8events: origin, begin, unknown, terminal-read-failure-disposition,
  begin, complete, begin, complete. Исходный UNKNOWN не переписывается и не
  повторяется. Existing zero-dispatch operator требует single-origin и здесь
  неприменим. Нельзя адаптировать witness так, чтобы скрыть отправленные команды.
- Broker после штатного закрытия может отсутствовать. Если exact текущий marker
 24688 остался, нужен отдельный pinned hash/identity и fresh dead PID/census;
  живой/reused/неизвестный PID или любые новые bytes закрывают операцию.
- Архивирование и штатный applyInstall выполняются под одним install lease,
  с удерживаемым file handle/identity CAS, durable intent и no-replay. Любая
  неопределённость после intent сохраняет gates и evidence.
- Core4 disconnect не завершает managed stdio lifetime. Existing control proxy
  ранее отказал10050; неизменный отказ не повторяется, force kill не применяется.
  Если штатное освобождение из сеанса недоступно, root готовит весь проверенный
  offline launcher до необходимого ручного закрытия Codex. Подготовка не является
  фактической установкой.

## Validation

- Evidence: `snapshots/core4-live-proof/XV-settled-owner-recovery-20261029/`.
  Root observation/status/authorization не содержат credentials и не являются
  runtime grant. Apply/native/owner changes0 на исходном снимке.
- Предыдущий диагностический блок: [XIV](core-msi-panel-reconnect-20261029.md).
  Неизменные candidate/runtime проверки не повторяются без причины; новые
  проверки относятся к operator gates/CAS/retention и actual read-back.
- Final helper SHA-256 `805831546dd2443044d0371f1f67953b332ad7adbe6a41e6d9590e425cecfb0e`;
  tests `42a8f8858e5638562a9df4999949e4734436aab7f93e39c70de2115da560c992`;
  launcher `17be880caf1202451f242094d11bd548f0d4524f8a781374093b8cc8fef40da4`.
 46offline tests и Node syntax PASS. Fixtures используют real install-lease и
  journal parser, но semantic validator/installer/process probes подменены;
  это проверка orchestration, без installed reads/actual apply у writer.
- Reviewer ACCEPT на этих hashes. Два замечания устранены: post-rename6identity
  фиксируется до fsync; archivesCAS повторяется после последнего await probes
  перед apply. Regression ловит ABA при fsync, final process probe и после apply;
  pre-submit изменения не допускают вызов installer и сохраняют gates.
- Root final actual inspect06:07:49UTC: blocked/recovery_known_pid_not_dead,
  stageprocess_probe, exit1; leaseRetained=false/recoveryIntentStarted=false.
  Protected hashes и все6identity/bytes обоих markers прежние, install gates и
  transaction не создавались. `root-final-inspect-readback.json`; actual apply0.

## Подготовленный ручной переход

Единственный оставшийся шаг для освобождения текущего managed24688 — полностью
штатно закрыть Codex. Затем запустить из Проводника
`snapshots/core4-live-proof/XV-settled-owner-recovery-20261029/INSTALL-CORE4.cmd`.
Использовать новый XV launcher, не прежний XIV. Он вычисляет fresh inspect proof,
архивирует exact observed markers под lease, вызывает один штатный installer
apply и проверяет результат. Не открывать Codex до результата. При SUCCESS
открыть Codex и продолжить configured read-back; при BLOCKED/UNKNOWN сохранить
новый report, не повторять и не удалять gates. Это технический ручной переход
из-за недоступного shutdown managed stdio в текущем host, не новое согласование.
Фактическое восстановление/установка пока не выполнены и не объявляются PASS.

## Исправление формата launcher — 29 октября 2026

### Progress

- [x] Ошибка с нового screenshot воспроизведена настоящим Windows `cmd /d /c`
  на byte-identical копии launcher рядом с безопасной Node-подменой. Исходный
  UTF-8 файл имел22LF и0CRLF. `cmd` выполнял обрывки строк, включая
  `4_RECOVERY_RESULT` и `eport.json`; Node-подмена не вызывалась, batch ошибочно
  завершался с0. Это отдельная доказанная причина нового screenshot.
- [x] В `XV/INSTALL-CORE4.cmd` заменены только LF→CRLF, русский текст и команды
  прежние. Оригинал сохранён как `INSTALL-CORE4.cmd.lf-original`.
- [x] Исправленный byte-identical launcher проверен на подмене с кодами0/1/7:
  ровно один вызов с аргументом `run`, правильная SUCCESS/BLOCKED ветка,
  точный exit code, читаемый русский текст, stderr пуст. Проверены пробелы в
  пути `%~dp0`, очистка NODE_OPTIONS/NODE_PATH и завершение после pause.

### Decision Log

- Исправление ограничено форматом локальной operational обёртки. Helper,
  candidate, installer, evidence pins, gates и правила no-replay не меняются.
  Тестируется фактический batch parser, без запуска настоящего `run`/`inspect`,
  AE, MCP или installer. Product suites/full release здесь нерелевантны.
- После повторного открытия Codex broker принадлежит новому PID2752; его
  bytes/identity отличаются от исходного24688. Подмена baseline не выполнялась.
  Helper по-прежнему допускает отсутствие broker после штатного завершения;
  если новый marker останется, exact-CAS guard должен отказать до intent.
  Этот отказ нельзя обходить повтором, удалением marker или расширением pins.
- Свежий read-back: отчётов recovery нет, transaction/intent и install gates
  отсутствуют. Это вместе с воспроизведением подтверждает отказ batch до
  восстановления. Закрытие Codex и запуск исправленного launcher остаются
  подготовленным ручным переходом; actual install/live proof ещё не получены.

### Validation

- `test-launcher-format.cjs` / `launcher-format-validation.json`: исходный
  screenshot воспроизведён с0stub calls; все3исправленных сценария PASS.
  Изменены только22line endings:1086→1108bytes. Новый launcher SHA-256
  `df8e54c1c24b5093e1182338c1e7827e10aa3b8775609573b8fda4a7e930a499`;
  прежний `17be880c…` выше относится к сохранённому LF-оригиналу.
- `root-launcher-format-readback.json`,06:20:29UTC: все5protected hashes и
  полная receiver identity/bytes прежние; installed packagefa9e, gates,
  broker ledger и `.next` отсутствуют. Broker изменён новым runtime, что явно
  отражено в отчёте; общая неизменность всех markers не заявляется.
- Actual recovery/apply/native dispatch0 в этом диагностическом блоке;
  helper/tests hashes `80583154…`/`42a8f885…` прежние. Их46offline checks и
  независимое review не повторяются из-за изменения только batch line endings.
