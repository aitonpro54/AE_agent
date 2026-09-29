# Выделение agy-bridge в отдельный проект

Дата: 2026-09-29. Перенос завершён. Новый локальный Git-проект:
`C:/Users/Ant/Documents/Codex/agy-bridge`, ветка `codex/standalone-bridge`,
коммит `8ba505d`. Отправки в remote не было.

## Границы и файлы

Исходный код взят из VideoScout `22d750c`. Там сохранена его история;
в новом репозитории — общий `scripts/agy_bridge.py`, все исходные core tests,
новые проверки конфигурации, `README.md`, `AGENTS.md`, контракт и `WORK_LOG.md`.
В production code больше нет абсолютных путей к рабочим каталогам Ant/AE/VideoScout.
Установка зависимостей, новый сервис, очередь и API-шлюз не требуются.

В AE Agent добавлен `config/agy-bridge.json`; `docs/model-routing.md` и действующий
skill `~/.codex/skills/antigravity-cli/SKILL.md` переключены на новый путь.
Модель/effort, workspace и state_dir задаются клиентским config. Относительные
пути считаются от config-файла, а не от cwd. State_dir должен оставаться внутри
корня клиента и не совпадать с ним. Run/status требуют явного `--config`.

В VideoScout коммит `5a38481`: прежний `scripts/agy_bridge.py` заменён тонким
запускателем; добавлен `config/agy-bridge.json`, обновлены клиентские документы
и tests запускателя. Core tests перенесены в новый проект, а не удалены: AST
всех 20 исходных тестовых методов совпадает с исходником.

Старые VideoScout команды `run task.json`, `status TASK_ID` и
`status TASK_ID --profile ae-agent` сохранены. Клиентский legacy AE-профиль нужен
только для обратной совместимости; новый AE Agent не зависит от checkout VideoScout.
Если новый bridge переместится, VideoScout принимает `AGY_BRIDGE_HOME` — путь
к корню checkout. При его отсутствии используется текущая относительная раскладка;
при отсутствии файлов — явная ошибка, без резервной старой копии core.

Исходные ветки AE Agent `codex/release-3.1.0` и VideoScout `codex/agy-contract`
не переключались. Baseline AE `f40fe71`, VideoScout `22d750c`. Существовавшие
пользовательские untracked AE-файлы сохранены и не включены в коммиты.

## Проверки

- Standalone: `python -X utf8 -m unittest discover -s tests -v` — **27 PASS**.
  Сюда входят 20 перенесённых и новые config/CLI/status/Unicode/path tests.
- VideoScout: полный стандартный suite — **127 tests, OK, 1 skipped**;
  пропуск `test_directory_symlink_escape`: Windows не разрешает создание symlink.
  В suite входят шесть новых тестов совместимого запускателя.
- `py_compile` изменённых Python, `git diff --check` и
  `npm.cmd run check:rules` AE Agent — PASS. JavaScript не менялся.
- Старый task `luna-flash-live-20260929-01` успешно прочитан напрямую и через
  VideoScout wrapper, conversation `3642e8ab-63c9-4e9a-9e54-135e33b46603` сохранён.
- SHA-256 всех **58 прежних state JSON** совпали до и после миграции.
- **Реальный AE direct smoke:** task `standalone-ae-20260929-04`, conversation
  `c883792a-08b6-42a2-9a2a-49947decdb3e`. Flash создал изолированный маркер;
  побайтная проверка точного UTF-8 содержимого — PASS.
- **Реальный VideoScout legacy wrapper smoke:** task `standalone-vs-20260929-01`,
  conversation `aeb50fbd-6e6f-4314-9d99-20efe4952700`. Маркер создан, точное
  UTF-8 содержимое независимо проверено — PASS.
- В обоих live init подтверждён `gemini-3.8-flash-high`. Отдельный effective
  effort agy не раскрывает, поле null; AE config явно задаёт high.
  Bridge сообщает validation_status=not_run: отдельная приёмка записана родителем
  в `acceptance.json`, не подменяется самим artifact_verification.

Первый standalone suite нашёл две ошибки CLI и неверный Unicode task-ID fixture.
После одного цикла исправления Flash все tests прошли; ASCII task-ID контракт
не расширялся ради fixture. Двойной конфликтующий `--config` отклоняется.

Живые проверки имели промежуточные отказы, не засчитанные как успех:

1. AE-01: model preflight не подтвердил доступность; state/модель/артефакт не запускались.
2. AE-02: Flash попытался читать внешнюю документацию bridge; read_file auto-denied.
   Артефакта не было. Следующая задача использовала только собственный input fixture;
   запрещённая документация не читалась, grants не расширялись.
3. AE-03: Antigravity вернул `FAILED_PRECONDITION: User location is not supported
   for the API use`. Результат failed, артефакта нет. После успешного независимого
   VS-запуска выполнена AE-04 с новым ID. Сеть/auth/provider не менялись.

Не проводились AE-write, AE/MCP/UI, render, full-intake и платные API. В live
marker logs были только файловые tools. Исходная реализация выполнена Flash в
отдельном workspace `agy-bridge` (conversation `2c39ffc7-0250-4511-b9d8-1b0acdcf20a5`);
родитель определил границы, обновил клиентов и независимо проверил результат.
Новые grants, зависимости, провайдеры или фоновые процессы не добавлялись.

## Где улучшать и как запускать

Работайте в новом [проекте agy-bridge](C:/Users/Ant/Documents/Codex/agy-bridge/README.md).
Общий код, контракт и tests теперь меняются там. Клиентские config остаются
в своих репозиториях; runtime state/logs не перенесены в общий проект.

Из AE Agent:

```powershell
python -X utf8 ..\agy-bridge\scripts\agy_bridge.py --config config\agy-bridge.json run .codex-runtime\task.json
python -X utf8 ..\agy-bridge\scripts\agy_bridge.py --config config\agy-bridge.json status TASK_ID --profile ae-agent
```

Из VideoScout/Code прежняя команда не меняется:

```powershell
.\.venv\Scripts\python.exe -X utf8 scripts/agy_bridge.py run local/verification/task.json
```

## Evidence и откат

Локальные файлы: AE `.codex-runtime/bridge-extraction/acceptance.json`,
`prior-states.json`, Flash/correction NDJSON, пакеты/результаты и
`backups/manifest.json`; новый repo `.codex-runtime/tests-corrected.txt`;
VideoScout `local/agy-extraction-tests.txt`. Runtime не закоммичен.

После завершения задач и сверки pending откатите клиентские коммиты через
`git revert`, сохраняя более поздние пользовательские правки: VideoScout
`5a38481`, AE — коммит этой записи (`git log -1 -- docs/agy-bridge-extraction.md`).
Это восстановит исходную реализацию в VideoScout и прежние клиентские команды.
Верните только изменённый `antigravity-cli/SKILL.md` из backup, указанного в manifest.
Новый standalone repo и его agy workspace можно оставить; удалять их для отката
не требуется. Ни reset, ни массовое восстановление общих настроек не нужны.
