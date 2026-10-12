# Продолжение безопасного cold recovery — 12 октября 2026

По явному поручению пользователя текущие helper-блоки завершены; следующий
этап начинается в новом чате. Новый чат автоматически не создавался.

## Цель и сохранённое состояние

Завершить безопасный non-exit переход после исчезновения daemon и восстановить
существующую CEP-панель, сохраняя прежние UNKNOWN/noReplay. Не закрывать,
не сохранять и не переоткрывать AE-проект; не повторять старые отправки.

- ROOT: `C:\Users\Ant\Documents\Codex\AE_agent`, ветка `codex/release-3.3.1`.
  HEAD перед фиксацией этой передачи: `1bfb00b6f36c6d6a0fb20fd3d43770631f034b77`.
- StagedWT: `C:\Users\Ant\.codex\worktrees\daemon-cold-recovery\AE_agent`,
  ветка `codex/daemon-cold-recovery-20261012`, рабочий commit
  `412bcc4ad5f745a0e51e376a79bbfb2cbc1be3d7` (14 собственных файлов).
  Это проверенный промежуточный код с оставшимся pin blocker, не deploy-ready.
- ROOT сохранил 77 исходных raw pins:
  `1e660e4da5976594e5602afae3fdc42d55456cfb1133becabf04e24d1ce139ff`.
  Materialization остановлена до первой записи; provision, cold consume,
  deployment, новый launch и panel actions не выполнялись.
- S2 generation `83e86583-fe0c-42a2-975c-0dcc6019504e`, старый PID29760.
  Наблюдавшееся отсутствие процесса не является historical exit/seal proof.
- Старые `69a07a5e-6442-4c33-8a01-6abfe4c86e3c` и
  `bcfe6e2e-ecbd-4d82-98b2-6a2a615f93e4` остаются UNKNOWN/noReplay;
  CAP19646 и Page.reload92581 не повторять. Их записи/keys/registrations сохранять.
- AE PID37220, birth `2026-10-12T09:24:42.662964+05:00` — прежнее наблюдение,
  требующее новой genuine native проверки перед live. CEP inspect 04:34:16Z
  видел существующую панель 3.3.1, emergencyDisabled=true, autostart=0.
  Это не свежий idle/eligibility proof.
- ROOT содержит чужие незавершённые правки AGENTS/model-routing/common-title
  и новые AME grant-файлы. Не включать их в общий stage/reset/cleanup.

## Завершённые проверки

Журнал P2 закрыт: known directories, intent/ACK raw pins повторно проверяются;
перед shutdown требуется exact ACK из durable drain-readback. Пять новых
отрицательных случаев дали shutdownCalls=closeCalls=launchCalls=0.

Один guarded NEW2 run: 6 smokes, 5 PASS, 1 FAIL, timeout=0. Cold recovery —
89 проверок/18 fixtures; native offline AST/mock — 36; service — 33;
lifecycle — 63; panel bootstrap — 74. Supervisor отказал
`owned_fixed_config_unavailable` на границе private config: это не PASS.
Старый supervisor91 с mocked historical validator не является real proof.
Native/live runtime effects=0; panel HTTP использовал loopback fixtures.

Guard focused65 и независимое bounded review закрыли unsafe-child P2.
WT `check:rules`, syntax11 JS и diff-check прошли. Fixture-процессы и их children
отсутствовали при сверке `2026-10-12T09:57:59Z`. Все helper-блоки завершены.

Пакет: ROOT `.codex-runtime/cold-offline-flash-20261012/`:

- `snapshot-20261012T094206Z-4f78ce95`: manifest
  `a43f54cd95522eee3255849011b6259ddd07c56f79c7938a25b134b754b8df89`, guard
  `9c22e643fc560d7dd76595201a53d40e70cecd6d8d4304af03b0c7614fb55bb5`.
- `validation/summary.json` SHA
  `2b66b2947ce2336c8f3df60cdc397abddfcc55c7462881e0783ffed0fcc230b5`;
  `results.json` SHA
  `e5bb43276f53e19dff2863d9d712462992226c857b807a966380fe3d613e0c81`.
- `BASE/protected-before.json` — old-state integrity pins;
  `BASE/stage-byte-materialization.json` — отказ до копирования.
- `BASE/run-reviewed-cli.py`, SHA
  `1558f4762dab253192ad7f0336131649d4441b6f48225b94197bbf6dbb7293ed`,
  фиксирует private raw output/UNKNOWN до запуска; ещё ни разу не выполнялся.
  Старые snapshots/manifests/guards сохранять; не подменять исходный baseline.

## Решение Ultra и следующий блок

Обнаружено: bootstrap существует в ROOT и изменён в WT, но отсутствует в
signed source77 и runtimeNamedHashSet79. Текущий OVERLAY из восьми имён даёт
union80; CLI provision видит семь и не развернул бы bootstrap-fix.

Принят вариант A, ещё не реализован:

Перед новым review сверить фактический runtime UUID нового чата и user-scope
binding: текущий fixed CLI содержит thread UUID исходного чата. Не угадывать
новый UUID и не переименовывать исторические authorization/intent records.

1. Вернуть WT `mcp-server/ae-agent-panel-bootstrap.js` точными ROOT bytes.
   Удалить bootstrap из `cold.OVERLAY` и closed native PS allowlist.
   Итог буквально: sourceBefore77 → stage/sourceAfter79,
   overlay7 = пять прежних + два новых файла. Не добавлять фиктивный old pin
   или `oldSha256:null` для уже существующего файла.
2. В pinned `owned-runtime-cold.js` / `bridge-daemon.js` добавить cold facade
   `ensure/snapshot/isBusy`. Проверить существующий exact target дважды,
   actual AE PID/birth/path, installed assets, CDP endpoint/URL и actor identity.
   Нужны фиксированные read-only inventory/fetch callbacks и общий deadline.
3. Сохранить validateInput/assertIdle, busy/admission и тот же service.lock wx.
   Pending/unknown, record_failure/project_read_unknown, lock, drift, несколько
   AE или отсутствие страницы дают отказ без stale cleanup и переписывания
   attempt. Не создавать новый attempt/reload/native panel-open.
4. Disconnected success: connect_required/existing_page_verified/noReplay.
   Это observation; maintenanceTarget.nativeControlIdle не даёт eligibility.
   Authority остаётся pinned cold/bridge и обычной полной guard-chain.
5. Scoped tests/review нового diff, node/rules/diff; отдельный собственный
   commit. Только затем materialize retained ROOT77 non-overlay raw bytes
   в WT, сохраняя reviewed overlay. Прежняя карта: 59 EOL-различий и один
   существующий ROOT common-title content diff; проверить заново. Не stage
   скопированный чужой common/support код. Не ослаблять strict provision.
6. После byte/pin review parent как единственный live controller запускает
   фиксированный CLI: provision → genuine preflight/preservation/deploy →
   один ordinary launch → registration/edge/pointer/readback. Consumed/unknown
   операция допускает только readback того же UUID, без нового launch.
7. Затем normal full guards → result lookup нового durable Connect UUID →
   обычный bridge.connect один раз → actual actor poll → fresh guards/result →
   независимый typed project-info. Не обходить unresolved eligibility,
   не применять fake overrides/force/direct HTTP или повторный reload.

Исполнитель следующего safety/integration блока — Sol 6.1 XHigh; архитектура
Ultra завершена read-only. Новые инструкции ролей обязательны: Sol High для
обычной scoped реализации/валидации, Luna High для механических блоков.
В текущем runtime alias ae_implementer отсутствовал; использован fresh worker
с explicit gpt-6.1-sol/high и актуальными инструкциями роли.
Flash разрешён для подходящих bounded категорий только configured High;
единственный точный AGY validation grant уже добавлен и verified.
Повторно разрешения того же scope не спрашивать; actual runtime gates сохраняются.
