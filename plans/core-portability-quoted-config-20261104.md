# Quoted TOML: адресное исправление installer на десктопе

4 ноября 2026, DESKTOP-32974QF. Tested baseline `f576bc72`, затем docs-only fast-forward `79b0567`; две source SHA неизменны. [Полное evidence](../docs/evidence/core-portability-quoted-config-20261104.json).

## Progress

- [x] Прежний dry-run FAIL сохранён: валидные TOML headers `[mcp_servers."after-effects"]` и его `.env` отвергались bounded parser.
- [x] Проверенный V2 patch SHA `a602e8931b7b20dbc9a85333c71af66ccfc61b449726e549b517fe996bc04014` применён только к installer/test.
- [x] Все 11 полных canonical named checks выполнены серийно, без FAIL/cancelled/SKIP и внешних deadlines.
- [x] Package cdf/80 неизменен; standalone `5d5d1aa4e95d31465c733dbc68ccf3dacba23c5b7fabea1de6811e616c792cdf`/98 verified. Реальный project-config dry-run из foreign CWD PASS.
- [ ] Вернуть source fix на MSI, затем настоящую test/CLI regression delta обратно на desktop.

## Decision Log

- V1 получил REVISE; V2 independent source review ACCEPT и 6/6 scoped regressions на MSI — исторический bounded review, не замена полных checks. На desktop приняты полные named runs.
- Принимаются только ASCII bare-key segments bare/quoted без escapes; alias identity и fail-closed неоднозначность сохранены. Общий TOML parser/dependencies не добавлялись.
- Config manual edits0. Legacy disabled/env bytes сохранены; actual install/AE/Core/MCP startup/reset/adoption0.
- Прежняя приёмка69/71 относится к77a860e. Сейчас48covered/23open;21changed integrations не запускались, обе dedicated Titles held.

## Validation

- Selector71:32changed/39same. Manual-runtime — unchanged exact-key reuse. Все свежие commands/keys/names/summary/log SHA и cleanup limits — в JSON. Named counts не суммируются как global unique.
- Planned TOML проверен Python tomllib через stdin; old config не сохранён в evidence. Legacy/global/project SHA и CEP tree unchanged, old FAIL report immutable.
- Это source/TEMP и dry-run proof; configured/native/P1–P8/full release не заявляются.
