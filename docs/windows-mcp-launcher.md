# Запуск stdio MCP без консольного окна

Локальные клиенты Codex и Antigravity запускали `node.exe` с
`mcp-server/mcp-adapter.js` напрямую. При новых подключениях Windows мог создавать
видимое консольное окно. Для этих двух настроек установлен небольшой WinExe
`ae-mcp-launcher.exe`: служебный Node создаётся с `CREATE_NO_WINDOW`, поэтому
окно отсутствует. Это выбранный вариант скрытого запуска вместо сворачивания.
Активные подключения не перезапускались.

Исходник: `scripts/windows-mcp-launcher.cs`. Он передаёт три исходных stdio
handle напрямую, без декодирования, буферизации или добавления текста в stdout.
Окружение и рабочий каталог наследуются, exit code возвращается клиенту.
Аргументы экранируются по правилам Windows CRT; executable должен быть задан
абсолютным путём. Ошибки запуска возвращают 126 и короткое сообщение в stderr.

Windows 10+ `PROC_THREAD_ATTRIBUTE_JOB_LIST` включает дочерний процесс в private
job атомарно при создании. Закрытие launcher завершает adapter. Private job
имеет `SILENT_BREAKAWAY_OK`, чтобы не захватить общий daemon, который adapter
может запустить отдельно. Условия внешнего job клиента сохраняются; launcher
не ослабляет их и не обходит отказ ОС. В child наследуются только три stdio
handle, сам job handle остаётся у launcher.

## Сборка и проверка

Из корня репозитория в Windows PowerShell:

```powershell
& .\scripts\build-windows-mcp-launcher.ps1
python -X utf8 scripts/windows-mcp-launcher-smoke.py
```

Сборка использует штатный x64 C# compiler .NET Framework 4 и создаёт ignored
`.codex-runtime/windows-mcp-launcher/ae-mcp-launcher.exe`. Пересобирать следует,
когда этот launcher не используется подключением. Smoke запускает только
временные Python dummy процессы; AE и настоящий MCP adapter не запускаются.
Проверяются binary stdio/EOF/exit code, argv/env/cwd, отсутствие консоли и видимых
окон, сохранность фокуса, отмена launcher и сохранность отдельного потомка.
Эти же сценарии выполняются внутри внешнего job. Результат и hashes записываются
в `.codex-runtime/windows-mcp-launcher/smoke-report.json`.

## Локальные настройки

На этой машине изменены только `command` и `args` сервера `after-effects`:

- Codex: `AE_agent/.codex/config.toml`.
- Antigravity: `~/.gemini/config/mcp_config.json`.

`command` теперь указывает на собранный launcher, а `args` содержат прежний
абсолютный путь `node.exe`, затем прежний путь `mcp-adapter.js`. Остальные поля,
включая env и таймауты, сохранены. Backup до правки и semantic read-back находятся
локально в `.codex-runtime/windows-mcp-launcher/{backups,config-readback.json}`.
Для отката достаточно вернуть прежний Node в `command` и убрать его из `args`;
перед восстановлением backup нужно сверить последующие ручные изменения.

Настройки применятся при следующем подключении клиента. Offline smoke доказывает
контракт launcher; новый реальный MCP handshake и запуск из GUI клиентов в этом
изменении не проверялись. Штатные активные процессы не завершались.

Win32 контракт: [process creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags),
[HANDLE_LIST и JOB_LIST](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute).
