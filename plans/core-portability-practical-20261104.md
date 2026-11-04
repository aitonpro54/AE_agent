# Практический перенос Core: MSI ↔ десктоп

4 ноября 2026. Исходная точка `b88c651`. По прямому поручению пользователя
довести существующий перенос между двумя Windows-машинами; облако исключено,
Titles/Slideshow остаются на паузе. Основной writer/координатор — текущий чат MSI.

## Цель и границы

Получить воспроизводимый перенос выбранного commit/состава и штатное обновление
без ручного ремонта конфигурации. Использовать существующие package/installer/
stop/update/inspect/enable; новые механизмы вводить только для доказанного
препятствия. Наличие восьми критериев P1–P8 не требует восьми новых подсистем.

## Последовательность

1. Сверить текущие средства, собрать выбранный пакет, определить доступ к
   десктопу и его фактическую среду/checkout/установку без изменений.
2. Сопоставить оба checkout и сохранить чужую работу; подготовить передачу
   выбранного кода и пакета без local state/credentials. Применить существующий
   initial-install либо owner-update по фактам целевой установки. Не выполнять
   повторную установку на MSI ради уже совпадающего package hash.
3. На обеих машинах проверить configured client и новую разрешённую typed
   read-only inspection; затем вернуть реальную инженерную дельту обратно.
   Для каждой живой операции получать свежий preflight и нужные runtime grants.
4. Выполнить только необходимые повторные/негативные проверки затронутых
   границ, сохранить bindings и единый отчёт P1–P8.

## Progress

- [x] Современный source-flow проверен read-only; источник — существующие
  `core4/tools/package-installable.js`, `package-standalone-installer.js`,
  `install-core4.js`, `maintain-owner.js`, `standalone-installer.js`.
- [x] На MSI собран manual/owner package `cdf7338f…` (80 файлов) и standalone
  `85c3d95a…` (98 хешируемых файлов); оба совпали с принятым B6 составом.
- [x] Получен configured `core_status`: MSI, cdf package, ready, без
  pending/UNKNOWN/ledger/ownership fault. CEP disconnected; native read не было.
  Это наблюдение в блоке подготовки, не бессрочная свежесть runtime.
- [x] После добавления подключения обнаружен DESKTOP-32974QF:
  `remote-control:env_e_6aaa3f0513c483209c3eb84d29674988`.
- [x] Найден существующий Core-чат «Найти следы переноса на десктоп»
  `01a186f7-9c1b-7513-a89e-cef10752eba1`, статус notLoaded, cwd Core.
- [x] Пользователь прямо разрешил использовать существующий чат для переноса;
  два адресных read-only поручения выполнены, без source/config/install writes.
- [x] Десктоп: Windows 26200.9711, тот же Node24.15.0/SHA и Git2.54.0,
  Codex MSIX26.1027.6604.0; AE26.3/CEP12.0.1 установлены, AE закрыт.
  Legacy checkout чистый, `codex/core-migration`/`1f5b820`; Core4 root отсутствует,
  порты3457/3456/8787 свободны. Kumo/legacy сохранены.
- [x] MSI подтвердил общую Git-историю; опубликованный `2b28513` и desktop
  `1f5b820` являются предками текущего MSI HEAD.
- [ ] Передача Git и проверка точного CEP target, initial install/read-back;
  фактический round-trip и P1–P8.

Первое конкретное поручение подготовлено в ignored файле
`.codex-runtime/portability-practical-20261104/desktop-readonly-task.txt`:
только версии, Git status, безопасные installation bindings и AE/CEP metadata;
никаких установок, запуска AE, MCP/JSX или правок.

## Decision Log

- Явно выбирать `--composition manual --runtime owner`: default builder — stdio.
- Приёмка69/71 историческая для77a860e. После V2 installer текущие48covered/23open;
  11 полных desktop named PASS,21changed integrations deferred,2Titles held.
- Стандартные APPDATA/LOCALAPPDATA на MSI присутствуют. Их гипотетическое
  отсутствие и явные paths standalone не объявляются причиной большой переделки.
- Десктоп подключён как хост, но прямого remote shell tool здесь нет. Доступный
  исполнительный путь — существующий remote-чат. `send_message_to_thread`
  требовал прямого разрешения пользователя; оно теперь получено для этапов
  переноса, повторного общего запроса на каждый follow-up не требуется.
- Передавать код существующим Git через новую ветку `codex/core-portability-20261104`
  без force push; сохранить исходную ветку десктопа и его ignored/local files.
  Ограниченный аудит HEAD/новой истории не обнаружил фактических credential
  literals; snapshots содержат только историческое evidence, не импорт state.
- Уточнение target: в дополнительном запросе было ошибочно указано
  `com.aeagent.core4`. Реальное имя из pinned manifest — `com.codex.aeagentcore4`.
  Отсутствие точного target подтверждено по pinned manifest в трёх CEP-каталогах.
- Старые ошибки плана 28 октября и прежние PID/транзакции не задают текущую
  authority. Новые startup/update операции и продуктовая разработка не запускались.

## Validation

- Build package/standalone и штатные verifiers PASS, package hashes совпали;
  production source/config/install изменений 0, новые test-suite runs 0.
- Точное evidence — [подготовительный блок](../docs/evidence/core-portability-practical-20261104.json).
- P1 подтверждён только в локальной части; P1–P8 в двухмашинном объёме остаются
  открыты. [Двухмашинный preflight](../docs/evidence/core-portability-preflight-20261104.json)
  принят. Следующий шаг — безопасная доставка выбранного commit и dry-run.

## Desktop quoted-config V2 — 4 ноября

### Progress

- Git-доставка f576 принята; docs-only79b fast-forward сохранил две dirty source SHA.
- V2 bounded installer fix и11fullnamed checks PASS; config manual edits0.
- Packagecdf/80 unchanged, standalone5d5d1aa4e95d31465c733dbc68ccf3dacba23c5b7fabea1de6811e616c792cdf/98 verified; actual-config dry-run PASS.
- [Focused receipt](core-portability-quoted-config-20261104.md), [evidence](../docs/evidence/core-portability-quoted-config-20261104.json).

### Decision Log

- Исходный FAIL остаётся в delivery-attempt-01, новый PASS его не стирает.
- V1REVISE → V2independent ACCEPT/6scopedcases, затем11full desktop checks.
- Следующее направление: desktop fix → MSI, затем настоящая CLI regression delta → desktop. Установка отдельно.

### Validation

- Current48covered/23open; прежние69current — только исторический срез77a860e.
- 71keys/snapshot215/supplemental текущие;32changed/39same,21deferred не запускались.
- Protected config/legacy hashes unchanged; actors observed terminal. Native/configured/full release/P1–P8 открыты.

## MSI: приём desktop fix и обратная дельта

### Progress

`f857f2d` получен с сохранением истории. SHA двух source-файлов, 11portable raw logs, их summaries/names и71keys сверены. Добавлена полезная CLI regression delta: quoted legacy/env и decoded local paths. Полный named46/46PASS, оба builds/verifiers и foreign-CWD dry-run PASS; identities совпали с desktop.

### Decision Log

Не переустанавливать уже совпадающий runtimecdf наMSI. После истечения gen2 два вызова отказали до dispatch; свежий exact transfergen3 → одно native read → release. Старые UNKNOWN/settled IDs не повторялись.

### Validation

[MSI evidence](../docs/evidence/core-portability-msi-roundtrip-20261104.json): receiver9→11 с exact prefix, ledger/AEP unchanged; installed owner ready/peer connected, pending/UNKNOWN/fault0, holder null. Current48/open23; следующая операция — вернуть commit на desktop и установить штатным CLI, затем configured native proof.

## Desktop: initial installation — 4 ноября

### Progress

MSI commit `0b78aac` принят fast-forward. Адресный CLIcase1 и полный documentation1 PASS; README приведён к bounded quoted TOML контракту. Package cdf/80 и standalone5d5/98 verified. Initial CLI apply выполнен ровно один раз; новый desktop installationId `installation-e0e81ad5-6bce-451c-8cfd-8e2ec14f3700`. Runtime80/CEP7 и конфигурация прочитаны обратно. Repeat foreign-CWD dry-run сохранил точные bytes всех98 наблюдавшихся файлов. [Evidence](../docs/evidence/core-portability-desktop-installed-20261104.json).

### Decision Log

Первый observer ошибочно ожидал отсутствующее поле descriptor.runtimeModel. Исходный diagnostic сохранён; исправлено только read-only наблюдение через runtimeBinding и transaction clientBinding. Установка не повторялась. Legacy/global config сохранены, ручных config edits0. Отсутствие Core4 в меню уже запущенного AE пока не объявляется дефектом версии.

### Validation

71 current keys, только documentation изменён; snapshot215, supplemental33. Current48/open23 сохранены:36 прежних exact reuse +10 desktop +1 MSI +1 documentation. CLIcase1 не заменяет MSI full46. Configured/native proof ещё не получен; следующий шаг — targeted MCP refresh и initial CEP discovery, затем один typed read/release. P1–P8/full release открыты, Titles/Slideshow на паузе, cloud исключён.

## Desktop: CEP discovery и effective configuration — 4 ноября

### Progress

После защиты наблюдавшегося пустого Untitled Project штатно завершён exact AE612/birth13:03:13Z и выполнен один normal launch. Новый PID28156/birth13:23:21.533736Z, та же26.3.0.87. Панель появилась в Extensions и открыта; статус «Ожидание Core для проверки сеанса». [Evidence](../docs/evidence/core-portability-desktop-cep-discovery-20261104.json).

### Decision Log

Отсутствие панели до restart не является доказательством бага AE. Disk-cache informational warning закрыт, настройки не менялись. Начать заново/reset/adoption не нажимались. CLI mcp get/list в точном cwd видит Core4 enabled и правильные paths; global trusted binding совпадает с cwd точно, включая регистр. Это config proof, не configured runtime proof. Global config/trust/security без изменений.

### Validation

Core4 tools в свежем inventory отсутствуют; UI MCPs показывает4 сервера безCore4 и не предлагает адресный reload. Существующий app-server7060 без --listen, поддерживаемый endpoint reload доступными tools не опубликован; cwd app-server не наблюдён. Не выполнялись stdin interception, speculative TCP или подменный stdio client. Конкретный blocker — недоступный supported targeted MCP reload/отсутствие Core4 tools в runtime этого чата. Configured/native inspection0; source keys48/23 без изменений. После появления tools нужен fresh status/contract и acquire/connect/one read/release.

## Desktop: адресный service refresh preflight

### Progress

Runtime UUID совпал с единственным active local Codex chat «Найти следы переноса на десктоп». Полный snapshot341 unarchived Codex entries/7pages:1active,340notLoaded. Exact child7060/birth09:29:14.751034Z — parent текущего shell; его parent — main ChatGPT16720/birth09:29:06.024344Z. ProjectId теперь наблюдён, прежнее предположение projectId=null не используется. [Evidence](../docs/evidence/core-portability-desktop-service-refresh-preflight-20261104.json).

### Decision Log

Штатный existing app-server proxy отказал10050 до initialize, requests0. Read-only анализ текущего app.asar обнаружил, что local stdio transport не обещает supportsReconnect; точный runtime wrapper не опубликован. Гарантированный auto-relaunch после внешнего завершения child не доказан. По ограничению поручения child не завершался, main app/AE/owner не затрагивались, sidecar не запускался.

### Validation

State production содержит только origin.json; наших submitted/native commands0, новых UNKNOWN0; это не подмена недоступного core_status. Configured/native proof остаётся открытым именно из-за отсутствия supported reload/restart с доказанным восстановлением текущего клиента. Новых tests/source changes нет,71keys/48covered/23open прежние.
