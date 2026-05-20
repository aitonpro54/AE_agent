# M115 SDK Docs-Audit Real Write Cutover Spec

## Цель

M115 выполняет первый реальный `SDKThread` write через write-capable runner, но только в `docs-audit` scope и только в один заранее запланированный Markdown output.

## Разрешенный cutover

- Operation envelope `version`: `1`
- Operation envelope `scope`: `docs-audit`
- Operation envelope `mode`: `sdk-write`
- Единственный planned output path: `.codex-audit/115-sdk-docs-audit-sdk-thread-output.md`
- Auto-commit: запрещен

## Safety contract

- Operation envelope валидируется до создания SDK thread.
- `sdk-write` отклоняется для любого scope кроме `docs-audit`.
- Planned paths должны проходить общий path policy и M115 exact allowlist.
- SDK prompt ограничивает работу единственным planned output path.
- Runner снимает pre/post git snapshots и запускает `git diff --check`.
- Runner hard-stops, если SDK turn меняет что-либо вне planned path плюс явно разрешенных M115 implementation/report files.
- Contract smoke проверяет `sdk-write` envelope validation локально и не запускает реальный SDK write.

## Запрещено в M115

- external-provider validation
- OpenAI CLI planner validation
- mutating-live
- live CEP / AE smoke tests
- tenant-policy bypass
- production code edits
- CEP panel edits
- network diagnostics
- package installation
- auto-commit
