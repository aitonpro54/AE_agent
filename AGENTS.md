# AE Agent Core 4.1.1 — устанавливаемое ядро

## Рабочий каталог

С 27 октября 2026 по поручению пользователя единственный рабочий корень Core —
`C:/Users/Ant/Documents/Codex/AE_agent_core`. Все дальнейшие чтения, изменения,
проверки и команды Git для Core выполнять отсюда. Прежний каталог
`C:/Users/Ant/Documents/Codex/AI Coverage Agent/AI Agent Core` освобождён и больше
не используется. Исторические пути в evidence и планах сохраняют provenance;
перенос исходников не переключает установленный MCP/CEP или runtime authority.

## Текущий scope и правила

**6 ноября, канал Core 4.1.1 на MSI восстановлен для прогона Titles.**
История исходного чтения с `UNKNOWN` архивирована побайтно. Тестовая копия
открыта в AE 12140, штатная перепривязка и свежий read-back прошли. Для слоя
13 в comp 1 подготовлена замена `BASE_B` → `Титры на MSI`, dry-run прошёл.
Lease освобождён, очередь пуста, pending/UNKNOWN/fault отсутствуют. Для записи
требуется нативное подтверждение. [Прогон на пилоте](plans/titles-end-to-end-msi-20261105.md#6-ноября-прогон-на-пилоте-core-411).

**6 ноября, пилот модульности установлен на MSI.** `manual-titles-variants/owner`
`23d2a039…` из `9b2a04b` включён штатным обновлением. Свежий MCP из
действующей настройки подтвердил CEP `file://` и прочитал текущий пустой проект.
Lease освобождён. AE 32632 сохранён, панель открыта. Клиент, уже загруженный в
чате обновления, возвращал `owner_unavailable`. Десктоп остался на прежней
установке. [Приёмка пилота на MSI](plans/core-4.0.0-installable.md#6-ноября-пилот-модульности-на-msi).

**6 ноября, предыдущая установка Core 4.1.1 на MSI.** Состав `manual-titles-variants/owner`
обновлён до `a7caf4dc…` через штатный stop/update/enable. В открытой панели
показана 4.1.1, свежий configured MCP подтвердил `file://` и прочитал comp 4193
с освобождением lease. Текущий AE 26160 сохранил открытый AEP, меню процесса
держит прежнюю подпись до перезапуска. Ветка `codex/ae-agent-core-4.1.1`,
тег `v4.1.1`. [Приёмка MSI](plans/core-4.0.0-installable.md#6-ноября-публикация-core-411-на-msi).

**6 ноября, Titles на MSI.** Реальный `TITR_ALL_VARIANTS_FHD` прошёл путь от двух
заданных титров до анимированного MP4 через штатную очередь AE. Кадры входа,
удержания и выхода сверены после декодирования. Слой 4594 остаётся выбранным,
временное задание и comp 4595 сняты. Исход `UNKNOWN` финализации установлен
по исходной квитанции и свежему нативному чтению, журнал архивирован без
повтора. Core 4.1.0 `manual-titles-variants/owner` обновлён до `dc7e5386…`.
На отдельном задании 4630 штатные постановка и финализация получили `succeeded`,
свежее чтение совпало, lease освобождён, pending/UNKNOWN/fault отсутствуют.
Отдельный AME выпуск открыт. `exportItem` запустил общую очередь, её 11 строк
восстановлены, появился прерванный внешний `01.mov`, тестовый AME файл отсутствует.
На отдельном нативном стенде 4665 принят перенос активного Stroke и `IN`
с сохранением пользовательской метки. Найден исходный Zodostudio (comp 4193,
layer 4208). В отдельной копии AE создал дубликат 9200 с Advanced 3D. Core
сверил эффекты, аниматоры и `IN`, подтвердил видимость 9200 и скрытие 4208.
Все 612 декодированных кадров совпали с архивным эталоном. Typed `derive`
для 3D открыт. Для отдельного AME выхода проверены исходные хеши и свободный
путь, план вернул `dispatch=false`.
Десктоп отложен.
[Матрица и квитанции](plans/titles-end-to-end-msi-20261105.md#матрица-приёмки-msi).

**5 ноября, T3b Titles проверен на MSI:** штатный клиент пакета `01f21c77…`
(`manual-layout/owner`, Core 4.1.0) измерил 14 вариантов в собственной comp 14,
восстановил скрытый слой 27 и применил выбранные пять строк к слою 26.
Две подтверждённые команды закрыты, исходные receipts и свежие read-back
совпали. Кадр `00:00:01:00` проверен. Профиль — статичный однородный 2D point
text с заливкой. Lease освобождён, pending/UNKNOWN/fault нет, AEP на диске
совпадает по SHA. Stop `c26e7572…` и update `bfb4ebe6…` завершены, повторов не
требуется. Десктоп отложен. [Итог T3](plans/external-products-titles-20261029.md#t3b-нативная-приёмка-на-msi).

**5 ноября, T3a Titles на MSI:** автономный CLI разбирает один многострочный
титр, готовит варианты переносов и рассчитывает scale/position по переданным
замерам. Все 18 тестов Titles прошли. [План T3](plans/external-products-titles-20261029.md#t3-многострочный-титр-в-рамке).

**5 ноября, C1b и наследие Titles:** `titles-current-target` теперь можно
поставить отдельно и собрать с проверенной базой Core 4.1 `manual/owner`.
Новый standalone закрепляет исходный пакет и использует штатное остановленное
обновление. На MSI TEMP проверены отказы, update/enable и сохранение журналов.
Рабочая установка Core 4.1.0 используется как прежде. Сводный пакет правил
Titles из десктопного `d4b29fe` принят на MSI вместе с каталогом источников
в `25c1129`. Следующий сценарий Titles — один многострочный титр в заданной
рамке с проверкой кадра. Десктоп в текущем этапе использован для чтения наследия.
[C1b](plans/core-capability-supply-c1b-20261105.md) ·
[Сводный пакет Titles](docs/titles-consolidated-package-20261105.md) ·
[Каталог исходников](docs/titles-legacy-inventory-20261105.md).

**5 ноября, Titles возобновлён и проверен на MSI:** обе отложенные проверки
исходников Titles и 8 тестов внешнего компилятора прошли. На Core 4.1.0 одна
замена `BASE_B` → `TITLES 4.1` на собственном B6-стенде (comp 1, layer 13)
подтверждена в нативном диалоге. Исходный receipt, свежий read-back текста и
16 полей стиля, кадр и хеш сохранённого AEP сверены. Lease освобождён.
Перепривязка AE `c5bf67e2…` завершена через `readopt-finish` и `readopt-enable`,
первый `host_or_managed_writer_changed` отказал до мутации. Settled IDs не
повторять. Срез ограничен поддерживаемым однородным слоем, проверка старых
шаблонов с недоступным цветом обводки и нативный Titles на десктопе открыты.
Slideshow остаётся отложенным. [T2 и результаты](plans/titles-live-20261029.md#5-ноября-titles-на-core-410).

**5 ноября, текущая основная версия Core — 4.1.0.** Ветка `codex/ae-agent-core-4.1.0`,
тег `v4.1.0`. По поручению пользователя обновлён только MSI. Панель **AE Agent Core 4.1.0**
открыта и подключена в After Effects. Один typed read пустого проекта через свежий
клиент из effective MCP config прошёл, lease освобождён. При установке текущий
чат ещё держал прежний MCP-клиент. Десктоп остаётся на 4.0.0 до отдельного поручения.
[План и результаты](plans/core-4.0.0-installable.md#5-ноября-публикация-core-410).

**5 ноября, переносимость выбранной пары принята по P1–P8:** одинаковые
manual/owner package1f8c…/80 иstandalone18f247…/98 установлены на MSI и
DESKTOP-32974QF; оба штатных клиента подтвердили Origin `file://` и одно
native-чтение с освобождением управления. Actual repeat9157 и следующий
перенос/applya88c сохранили identities, историю, preferences и соседний config.
Ручных правок config0. Независимый read-only review ACCEPT.
Source69/71 актуальны; две dedicated Titles и native product acceptance
Titles/Slideshow остаются на паузе, full release=false. Cloud/shared user assets
и полностью фоновый relaunch Codex не заявляются. Новых live действий этот итог
не назначает; settled IDs не повторять. Предыдущие checkpoints ниже — история.
[Итог](docs/core-portability-final-two-host-result-20261104.md),
[manifest](docs/core-release-manifest-20261103.json).

**4 ноября, desktop: configured Origin/native PASS для 1f8c:** клиент 9260 → owner 1652; authenticated `physical.peer.origin` содержит строку `file://`, connected=true. Одна typed project-inspection пустого AE 26.3x87 завершена, lease generation 1 освобождён. Receiver 3→5, исходные 2325 байт сохранены; holder=null, pending/UNKNOWN/fault отсутствуют. Descriptor/client/origins/history/config, 39 preferences и 9 legacy-файлов сохранены. Новых install/build/tests/restart/mutation нет. Coverage source осталось 69/71, две проверки Titles удержаны. [Evidence](docs/evidence/core-portability-desktop-origin-native-20261104.json), [план](plans/core-portability-desktop-origin-native-20261104.md). Итоговую P1–P8 матрицу после проверки receipt завершает координатор.

**4 ноября, финальная проверка MSI пройдена:** штатный клиент6744 загрузил пакет
1f8c… и запустил owner29764. Подтверждён Origin `file://`; одна native inspection
`cda9b638…` выполнена, управление generation2 освобождено. Receiver11→13
с точным прежним prefix; ledger, AEP,29 файлов настроек и1755 защищённых файлов
сохранены. Старый app-server13592 завершён один раз; новый2244 наблюдён позднее,
автоматический перезапуск не доказан. Первый запрос с лишними полями отклонён
до dispatch, журнал тогда не изменился. Source69/71 актуальны, Titles/Slideshow
на паузе. Остались подключение desktop, его финальные Origin/native проверки
и сводный итог P1–P8. Повторять установки не требуется.
[Evidence](docs/evidence/core-portability-msi-origin-native-20261104.json).

**4 ноября, актуальная source-приёмка завершена:** 69/71 current exact-key PASS,
36reuse+33fresh fullcanonical named. Открыты только2dedicatedTitles подпаузой;
remainingбезhold0. В source25блоке26attempts:25PASS и1stageENOENTbeforefixture,
исправленный exacthistoricalCODEcopy и freshattempt02; oldFAIL сохранён.
Все собственные runners exited,71keys/215sourcefiles/33supplemental exact.
Пакет1f8c установлен наMSI/desktop; configuredclient/service refresh и final
nativeOriginproof ещё open. Install/stop/updateIDs settled, не повторять.
[Актуальное evidence](docs/evidence/core-portability-current-source-20261104.json).

**4 ноября, Origin runtime установлен на обеих машинах:** MSI stop`a9823995…`,
update`3a052303…`,enable settled по1; desktop apply`a88c79aa…` settled. Не повторять.
Package1f8c…/80,distribution18f247…/98 verified; localidentity/history/prefs/AEP
сохранены. Configured clients покаCDFcached, finalnative/Origin proof open.
Source25queue продолжается, после неё нужен штатный client/service refresh;
не прерывать текущие тесты ради restart. Remotehost сейчас недоступен.
[MSI checkpoint](docs/evidence/core-portability-msi-origin-installed-20261104.json).

**4 ноября, desktop1f8c installed/read-back PASS, activation blocked:** e75реальнаяdelta получена;1f8c/80 иstandalone18f247/98 verified, однаapplya88c79aa, lineage→9157/initial сохранена. NewprojectMCPargs1f8c правильные, но текущийthinclient32372 остаётсяCDF/owner_unavailable; freshclient/Origin/native ещёнет. Receiverprefix3,origins/configforeign/global/prefs/legacy preserved. Не повторятьapplya88c/9157/82b илиstop139. [Checkpoint](plans/core-portability-desktop-origin-installed-20261104.md), [evidence](docs/evidence/core-portability-desktop-origin-installed-20261104.json). Source44/71;e75 queue25+Titles2 уparent.


**4 ноября, строгие P2/P5 продолжаются:** actual same-CDF repeat9157 выполнен1раз,
identity/origins/history/preferences сохранены; intermediate activation не выполнялась.
P2 candidate добавляет authenticated physical.peer.origin без изменения gates.8full
named PASS; source current44/71,25remaining integrations выполняются,2Titlesheld.
Candidate package1f8c…/80,distribution18f2…/98 verified; installed proof ещё нужен
на обеих машинах. Старые outcomes иCDFclientcache refusal не replay.
[Активный план](plans/core-portability-final-gates-20261104.md).

**4 ноября, P5 actual repeat/read-back PASS, reconnect pending:** один stop13977dd6 → resume/runtimeStartedfalse → ordinary standalone apply9157e280; installationId/stateDir/origins/runtime80/CEP6/history/preferences/config/legacy сохранены. Credentials штатно rotated; receiver prefix3 точен, AE28156 прежний. Старый MCP thin client32372 возвращает owner_unavailable; supported targeted control не найден, native после repeat0. CDF activation не выполнялась; принято ждать actual P2 successor transfer и затем один fresh configured final-package proof. До next packet STOP. Не повторять apply9157. [Checkpoint](plans/core-portability-p5-repeat-20261104.md), [evidence](docs/evidence/core-portability-p5-repeat-20261104.json). P5/P2 ещё open.


**4 ноября, практический перенос Core принят:** MSI↔DESKTOP-32974QF, реальная
source-дельта в обе стороны, одинаковые cdf/80 иstandalone5d5/98, desktop initial
install1 и configured native read обеих машин PASS. Manual config edits0; local
identities/state/credentials не переносились, обе leases released, UNKNOWN/fault0.
Bounded practical блок завершён. Strict P2 literal HTTP Origin/P5 production repeat
остаются open, P1–P8/full release не сертифицированы; current source48/71,21integration
и2Titles held открыты. Titles/Slideshow на паузе, облако вне scope.
[Итог и рабочий путь](docs/core-portability-two-host-result-20261104.md). Ниже — checkpoints с собственным provenance.

**4 ноября, desktop configured native PASS:** namespace Core4 появился в текущем чате без нашего restart app-server. Fresh status/contract → acquire/connect/one typed project-inspection/release завершены; AE26.3x87,numItems0. Owner25516 ready, peer connected, holder=null,pending/UNKNOWN/fault0; receiver origin+begin+complete3records/one settled command. Desktop этап install/configured/native завершён; P1–P8/full release открыты. [Evidence](docs/evidence/core-portability-desktop-configured-native-20261104.json).


**4 ноября, desktop CEP discovery PASS:** после одного normal AE restart панель Core4 появилась и открыта, AE26.3.0.87/PID28156; проект пустой. CLI exact-cwd config видит enabledCore4 и exact trusted binding, но текущий runtime toolsCore4 не публикует. Supported targeted reload существующего app-server доступными API/UI не найден; configured/native pending. [Диагностика](docs/evidence/core-portability-desktop-cep-discovery-20261104.json).


**4 ноября, desktop initial install подтверждён:** MSI `0b78aac` принят; CLIcase1 и documentation1 PASS, cdf/80 и5d5/98 verified. Штатный initial apply ровно1, новый desktop installationId; read-back runtime80/CEP7 и repeat foreign-CWD dry-run PASS. Observer diagnostic сохранён, apply не повторён. Current48/open23; configured/native pending. [Checkpoint](docs/evidence/core-portability-desktop-installed-20261104.json). Следующий шаг — targeted MCP refresh/CEP discovery и один configured native read/release.


**4 ноября, MSI принял desktop fix и проверил обратную дельту:** `f857f2d`
получен fast-forward; SHA двух source-файлов и 11 исходных stdout сверены.
CLI-регрессия расширена quoted legacy/env и local paths; полный named46/46PASS.
Current **48 covered / 23 open**:37прежних exact reuse +10desktop +1MSI;
21deferred integration и2dedicated Titles held. Новая дельта меняет только
installable-runtime/lifecycle-simulation keys. Сборки cdf/80 и standalone5d5d1aa4…/98
на двух машинах совпали; MSI foreign-CWD dry-run PASS, manual config edits0.
Fresh configured native own-AEP read PASS: receiver9→11/exact prefix,
ledger/AEP unchanged, controller released. MSI reinstall0: runtime прежний.
Далее вернуть дельту на desktop и выполнить initial install/configured native.
P1–P8/full release открыты. [Evidence](docs/evidence/core-portability-msi-roundtrip-20261104.json).

**4 ноября, активен практический перенос MSI ↔ десктоп:** прямое поручение
пользователя снимает прежнюю отсрочку двухмашинной работы; Titles/Slideshow
остаются на паузе, облако исключено. Собран прежний manual/owner package
cdf7338f…/distribution85c3d95a…; повторная установка MSI не требуется ради
совпадающих bytes. Подключён DESKTOP-32974QF; пользователь прямо разрешил
использовать существующий Core-чат для этапов переноса. Read-only preflight:
legacy checkout1f5b820 чистый, Core4 root отсутствует, Node/Git совпали с MSI,
AE26.3 закрыт, порты3457/3456/8787 свободны; Kumo/legacy сохранены.
Первая доставка f576bc7 на десктоп воспроизвела cdf/80 и85c/98; dry-run
отказал до записей на валидных quoted TOML headers старого config. V2 source fix проверен
11fullnamed checks и actual-config dry-run без ручного ремонта config. На MSI уже прошла новая
configured native inspection собственного B6 AEP в AE26.3x87; lease released,
pending/UNKNOWN/fault0, AEP unchanged. Desktop V2 source delta уже принята на MSI;
обратная CLI-дельта проверена, desktop actual install ещё впереди.
P1–P8 ещё открыты. [Практический план](plans/core-portability-practical-20261104.md).

**4 ноября, постоянный контракт новых модулей:** переносимость десктоп ↔ MSI
обязательна для каждого нового и изменяемого модуля и последующих версий Core,
без повторного общего согласования с пользователем. Включать упаковку,
обнаружение локальной среды и адресные проверки переносимости в готовность
модуля; штатный перенос должен выполнять необходимые шаги без ручного ремонта
конфигурации пользователем. Неизменённое evidence переиспользовать, затронутые
границы проверять самостоятельно в разрешённом scope. Первая приёмка P1–P8
выбранного пакета и пары сред завершена; новые/изменённые модули получают
необходимые адресные проверки. Полностью фоновый relaunch Codex не доказан;
облако сейчас вне scope.
[Постоянное правило модулей](docs/portability.md#новые-модули-и-последующие-версии).

**Историческая source-приёмка на77a860e:** 35 принятых запусков /38named checks и69exact-key результата относились к прежним bytes. После V2 installer это не current утверждение; актуальные48covered/23open приведены выше. Titles/Slideshow на паузе, full release не заявляется. [Исторический план](plans/core-release-execution-20261103.md).

**3 ноября, актуальный release-manifest подготовлен:** по прямому поручению
пользователя учтены все 71 Core checks: 31 exact-key reuse, ещё 2 отдельным
byte-command-bound reuse; 38 требуют current evidence. Из открытых 36 без
продуктового hold, две dedicated Titles под паузой; shared Core с зависимостями
Titles не исключён. Прежние 27 deferred — подмножество полного inventory.
JSON содержит ключи, команды/cwd, evidence и gates; 29 source batch candidates
не запланированы и не исполняются автоматически. Tests/live/build/install/
config/network/Argon/push/PR в этом блоке нет; `releaseCertified=false`.
Titles/Slideshow остаются на паузе, runtime/package/map не менялись.
[План и реестр](plans/core-release-manifest-20261103.md),
[машиночитаемый manifest](docs/core-release-manifest-20261103.json).
Исторические snapshots ниже не дают текущую runtime authority.

**3 ноября, сверка остаточной приёмки базы:** по поручению пользователя
сверены пробелы перед возвращением к продуктам. B1–B7 приняты в прежних пределах;
Все 15 ключей принятого B6 совпали с текущими исходниками. В изученном evidence
для 19 интеграционных проверок B6 и ещё 8 из B3 нет current PASS.
Отдельное native прерывание finisher остаётся дополнительным наблюдением,
не препятствием принятой ограниченной базе. Найден пробел release-manifest:
`check:release` содержит 6 тестовых файлов, команды 55 из 71 проверок карты
указывают на другие файлы; это статический факт, не результат тестирования.
Перед full release нужен полный manifest применимых проверок/reuse/remaining.
Новых live действий эта сверка не назначает; Titles/Slideshow остаются на паузе.
[Реестр решений и границы](plans/core-base-remaining-acceptance-20261103.md).
Исторические записи ниже сохраняют provenance, не текущие runtime pins.

**3 ноября, MCP/Codex maintenance завершён:** по прямому выбору пользователя
«Вернуться к MCP/Codex maintenance» историческая пауза снята. Свежие configured
status/diagnostics и effective CLI config PASS: Corecdf7338f… enabled/timeout120,
same owner27100/bootb76c6e87…, CEP connected, pending/UNKNOWN/fault0, controller free.
App-server16688/birth639292921882045310 прежний; CodexMSIX26.1027.3384.0,
CLI0.166.0-alpha.5.1. В ограниченном окне345 log records текущего чата WARN/ERROR0;
узкая MCP/Core-выборка пуста.143protected files+bindings/AEP/current7/1+UNKNOWN26/20
exact unchanged. Ремонт/restart/config/auth/AE commands0; исторический deferred
service refresh больше не нужен, ожидающих действий нет. Прежний28148 settled,
не повторять. Current chat01a1a098-6ee6-7af1-8ca5-7b03adfbcec5 подтверждён
metadata/read_thread; старые chat IDs и PID не дают authority. Titles/Slideshow
остаются на паузе; завершение maintenance не вводит новую паузу этой работы.
[План и evidence](plans/core-codex-mcp-maintenance-20261103.md).
Записи ниже сохраняют историю прежних scope и checkpoints.

**3 ноября, B7 configuredcdf и сводная база приняты:** обычный текущий MCP
уже используетcdf7338f…, без restart/config/service refresh. Same owner27100/
birth639293110869903720/bootb76c6e87…, sameAE30024, один3457, CEP connected.
Explicit sessionce977de2… acquire generation1 → exact-contract fresh native
project-inspection own saved AEP/1item → release PASS. Receiver7/prefix5 exact,
ledger1 unchanged;143protected state/archive files+descriptor/client/config/AEP
unchanged, UNKNOWN26/20 exact preserved. Все15source keys прежние. Наблюдались
3cdf thin-client processes при существующем app-server16688; их не завершали и
не приписывали им дополнительные writer leases. Ограниченная матрица B1–B7
сведена с отдельными current/historical/source границами; full release/deferred
closures/portability открыты. MCP/Codex maintenance и Titles/Slideshow остаются
на паузе; B7 не требует новых live операций или повторов settled IDs.
[Актуальная матрица/evidence](docs/core-base-b7-configured-matrix-20261103.md).

**3 ноября, B6 native delivery/recovery завершён:** на installedcdf7338f…
наблюдалась native confirmation command7c78e9fb…/task0558d0cf…/proposalc477c55e…
own comp1/layer13/BASE_A→BASE_B. Exact owner15616 stopped1 после mutate begin;
run ipc_outcome_uncertain, replay0. Original confirmation Yes1 после owner death;
late callback дал UI owner_recovery_required, receiver26/ledger20 exact unchanged.
Own AEP saved/reopened SHA b6eaea7e…; fresh typed read-back BASE_B PASS.
Новый reset `2fecd11c-faef-4651-9f27-e88e4498fb20` attempts1, exactAE21960 exited;
UNKNOWN26/20 archived exact. Sessionce977de2…/old8fe denied/new acquire1/fresh
project baseline/manual read/release PASS; current5receiver/1ledger settled.
Fresh readopt `cd5bb102-b620-4e03-bd11-f7a73e37890e` enabled, AE30024 exact;
не повторять эти IDs, также install stopf41dbe21…/update806719be…. Final standard
owner27100/birth639293110869903720/bootb76c6e87… ready, auto CEP, один3457,
pending/UNKNOWN/fault0.140protected files+config/bindings/AEP intact after intentional
adoption change; old archives14/52 preserved. No native packet capture: refusal
наблюдался по UI/pinned callback path. Configuredcdf/full release/portability open;
MCP/Codex maintenance и Titles/Slideshow на паузе. Source15keys exact unchanged.
[Checkpoint/evidence](docs/core-base-b6-native-recovery-20261103.md).

**3 ноября, B6 установлен:** packagecdf7338f…/distribution85c3d95a… штатно
installed/enabled, exact80runtime/7CEP verified. Новый stop
`f41dbe21-504a-447b-92d4-f66694dadc91` и update
`806719be-fe2b-4d8c-a31e-f27e191ddf57` settled, primary attempts1; не повторять.
Config diff — только согласованный args-path.145protected files unchanged across
update; после новой inspection receiver23/prefix21 exact, ledger15/prefix11 exact.
Own CEP close/open1, auto connected; sameAE21960/AEP3d19acd0… untouched.
Fresh standard owner15616/birth639293094416076820/bootbed482de… ready. Prepared
task0558d0cf…/proposalc477c55e… на comp1/layer13/BASE_A→BASE_B, runAttempts0;
root держит единственный client/controller и продолжает native scenario.
Configured proof нового package не заявлен; MCP/Codex services не перезапускались.
[Evidence](docs/evidence/core-base-b6-installed-20261103.json).

**3 ноября, узкое разрешение на B6 update:** пользователь выбрал «Установить и
обновить только путь Core». Разрешена штатная установка подготовленного
packagecdf7338f… и замена только args-path существующего Core MCP entry
21a884fa…→cdf7338f…. Остальное обслуживание и перезапуски MCP/Codex остаются
на паузе; native proof — новым штатным клиентом. Новый stop/update с новыми IDs,
сохранением journals/архивов/session/adoption/AEP; прежние settled IDs не повторять.
Эта запись уточняет историческое ожидание разрешения ниже.

**3 ноября, B6 source fix принят:** один native run task2e0d60d4…/proposal
c4ec0189… остановился host_probe_failed до intent/send, commands0; не replay.
Причина воспроизведена в owner-like scrubbed env: PowerShell startup требует
USERPROFILE. Один runtime file получает native os.userInfo().homedir; fail-closed
и fixed query/4с/AE gates сохранены. Две regression cases и четыре named test budgets;
15checks/330unique cases (87fresh/243exact current-key reuse)/55boundaries PASS, current keys сверены.
Три cancelled timeout batches не приняты; полные affected checks прошли заново.
Candidatecdf7338f…/distribution85c3d95a… (80/98) built/verified/dry-run; actual install0.
Установка меняет одну args-line Core MCP entry; explicit pause MCP/Codex config
требует узкого уточнения перед actual update. Native delivery/mutation/recovery
нового B6 ещё открыты; Core/AE не faulted.
[Scope/evidence](docs/core-base-b6-windows-probe-20261103.md).

**3 ноября, B6 native fixture/re-adoption:** own test AEP
`snapshots/core-base-b6-recovery-native-20261103.aep`/SHA3d19acd0… создан/сохранён1раз
адресным gated setup; comp1/layer13/BASE_A, full native style proof с active
fill/stroke PASS, исходный empty AEP8299fd9f… untouched. Новый штатный stop/readopt
`b25b5fef-ebed-406d-bf24-6e7e6cee13b5` certified/applied/enabled, attempts1;
не повторять. Adoption currentAE21960/own test path, package21a884fa… прежний.
Новый configured owner22188/birth639292940466114520/booted18a535… ready, auto peer,
receiver15settled/ledger1evidence unchanged across readopt; bindings/AEP preserved.
Native mutation/fault/reset нового B6 ещё0. Следующий шаг по
[focused плану](plans/core-base-delivery-recovery-20261103.md) — fresh
inspect/build/propose/dry-run и native confirmation на этой единственной own цели.
Это тест базы, Titles development и MCP/Codex maintenance остаются отложенными.
[Evidence](docs/evidence/core-base-b6-fixture-readoption-20261103.json).

**3 ноября, configured B4 подтверждён без maintenance:** текущий штатный MCP уже
загрузил21a884fa…/owner16712/birth639292930363178560/bootb85c94a9…; один3457,
CEP auto connected, sameAE21960. Malformed contract отказ до submit и fresh
native saved empty project read/release generation1 PASS.11settled events/
prefix9 exact, bindings/origins/adoption/session/baseline/14+52archives/AEP unchanged.
MCP/Codex restart/config/install/reset/AE restart/save/mutation0. Service maintenance
остаётся отложенным, configured B4 больше его не требует. Следующий bounded блок —
[native delivery/recovery](plans/core-base-delivery-recovery-20261103.md) на отдельном
own test AEP; Titles development на паузе, existing text executor только тест базы.
[Evidence](docs/evidence/core-base-b4-configured-20261103.json).

**3 ноября, активный следующий scope подтверждён пользователем:** продолжать
доводку базы — доставка, поздние ответы и recovery. Titles/Slideshow и MCP/Codex
maintenance остаются отложенными. B5 test-only: составной production HTTP receiver
+ VM dispatcher,14fresh cases/55boundaries PASS; UNKNOWN journal побайтно сохранён,
старый completion отвергнут новым receiver. Runtime/CEP/package не изменялись,
установка не нужна. Это TEMP/VM, native delivery/late callback и mutation recovery
не доказаны. Далее свежий штатный Core/CEP preflight в разрешённом scope без
restart/config MCP/Codex, затем адресный native scenario на own test AEP.
[Scope](docs/core-base-b5-channel-composition-20261103.md).

**3 ноября, уточнение пользователя: MCP/Codex maintenance отложен.**
Поручение самому нажимать нужные кнопки относится прежде всего к панели и
After Effects; эти действия root выполняет самостоятельно в разрешённом scope.
Перезапуски/перенастройку MCP и Codex пока не продолжать. Возвращаться к ним
по новому прямому поручению, а не по общему «продолжай». Configured B4 proof
остаётся отложенным; просить пользователя нажимать кнопки панели/AE не требуется.
До уточнения уже запущенный helper один раз завершил exact app-server28148;
первый guard отказал до воздействия из-за точности CIM/native birth. Helper
завершён, повторов/ожидающих действий нет. В свежем read-only snapshot старые
28148/2708/6340 отсутствуют, listener3457 отсутствует; причина выхода Core6340
не наблюдалась. AE21960 прежний, AEP/bindings/session/history9events/архивы целы.
После уточнения MCP вызовов/start/restart/config changes0. Наличие нового
app-server16688 не объявляется configured proof. [Evidence](docs/evidence/core-base-b4-service-refresh-deferred-20261103.json).
Следующие записи о планируемом service refresh — история до этого уточнения.

**3 ноября, B4 installed:** source1e9a63a/package21a884fa…/
distribution41d4812c… (80/98) штатно installed/enabled. Stopf36e04ce… и
update7b18829f… settled с attempts1; их не повторять. Owner6340/birth
639292876604263210/bootd396603c… ready, один3457, old25380 gone. CEP close/open1,
auto connected; та же AE21960. Standard missing-contract refusal7events exact
и native correct read/release1 PASS, current9settled/prefix7 exact; защищённые
файлы/session/baseline/14+52archives/AEP unchanged. RestartAE/save/mutation/reset0.
Configured oldclient2708/package327faaac… пока owner_unavailable. UI project
MCP row disabled; следующий шаг — scoped service app-server28148 refresh после
этого checkpoint, затем fresh configured proof. Current runtime chat
01a1a034-0635-7712-95b2-a41d743f398c подтверждён metadata; других active chats
не наблюдалось. Не использовать старый chat01a19c6c… как текущий и не создавать
новый. [B4 evidence](docs/evidence/core-base-b4-installed-20261103.json).

**3 ноября, B4 source принят по «Продолжай дальше»:** missing/malformed
inspection contractId отказывает до runtime invoke, без ложного UNKNOWN;
nextAction=get_module_contract и discovery schema уточнены.13checks/214fresh
cases/55boundaries PASS, включая настоящий TEMP owner/IPC/stdio;2runtime files
изменены. Package21a884fa…/distribution41d4812c… (80/98) built/verified/dry-run,
actual installed327faaac… пока прежний. Далее новая штатная stop/update/enable
и configured proof; old settled IDs не повторять. Titles/Slideshow на паузе.
[B4 scope/evidence](docs/core-base-b4-request-validation-20261103.md).

**3 ноября, configured proof после restart Codex завершён:** первый configured
status загрузил327faaac…/owner25380/birth639292859519548860/bootceb47b71…;
один3457, old31404 absent (причина выхода не наблюдалась). CEP подключилась сама.
Старый sessionaeddb9ee… отклонён; explicit current8fe8b332… acquire, fresh direct
project-inspection того же saved empty AE21960 и release generation3 PASS.
Current receiver5settled/SHA9dcf0a43…/prefix3 exact; оба архива14/52events и8reset
records exact, bindings/origins/adoption/absent ledger/AEP unchanged. Несколько
ошибок вызова до submit не добавили journal events; actual native read один.
Install/reset/AE restart/save/mutation0 в этом блоке. Ограниченная приёмка базы
B1/B2/B3 завершена; L0 research уже завершён. Delivery/late callback wire,
recovery принятой mutation, Titles/full release/portability остаются открытыми.
Titles/Slideshow автоматически не возобновлять; следующий продуктовый этап
определяется отдельным поручением. [Evidence](docs/evidence/core-base-b3-configured-20261103.json),
[актуальный checkpoint](plans/core-base-installed-checkpoint-20261102.md).
Ни install, ни settled reset/stop/update/enable не повторять.

Ниже — предшествующие snapshots, сохраняющие provenance.

**3 ноября, UI-действия выполняет агент:** пользователь прямо поручил самому
нажимать необходимые кнопки и не передавать ему ручные действия панели/перезапусков.
Root выполняет разрешённые действия через штатный API или доступный UI, включая
служебное обновление MCP-клиента Codex. Это не меняет auth/AE gates, sole controller,
защиту пользовательской работы и no-replay. Прежние ожидания ручного нажатия ниже
заменены этим поручением. UNKNOWN reset69facd01… уже отправлен агентом один раз
через существующий authenticated panel protocol; exact old AE9472 gone, новый
AE21960 открыл тот же own saved test AEP. Old UNKNOWN14events/SHA638fbd1b… archived
exact; session8fe8b332…/fresh native baseline/release PASS. Configured proof ещё
нужен; install/reset69facd01/idle9b128005 повторять нельзя.

**3 ноября, B3c установлен:** source `0cddee2` принят
(721unique cases/42checks/55boundaries). Package327faaac…/distribution4975c36a…
(80runtime/98bundle) штатно установлен и enabled. Stop
`49b423d9-7763-433b-808d-0048264ba491` и update
`af65ee78-03e7-4c19-8a6b-3783e19879d1` завершены; прерванный90с wrapper
восстановлен original pre-ready inspect/finish без повторного owner-update.
Эти settled IDs не повторять, markers не чистить. New standard client загрузил
327faaac, owner15584/birth639292661152752430/boot16749b0f… ready, один3457.
Собственная новая CEP открыта/автоматически connected; native direct project
read saved empty test AEP PASS, lease1 released. History52settled/prefix50 exact,
origins/adoption/ledger/AEP preserved. AE9472 прежний, restart/mutation0.
Native idle reset `9b128005-8e75-43a0-80ff-f800326c83c6` завершён после
одного пользовательского нажатия: sessionaeddb9ee…, old15584 gone/new30888,
same AE9472 без restart; exact52events archived. Missing/old session acquire
отклонены; explicit acquire/fresh native baseline/release PASS, new3events.
Затем на том же own AEP воспроизведён read UNKNOWN: exact Node30888 остановлен
один раз после journal begin inspect-facaa741…; ipc_outcome_uncertain,14events/
SHA638fbd1b… без terminal. Diagnostic owner19452, queue не открыта. Delivery в
AE не наблюдалась; mutation/late-callback proof не заявлен. Для отдельного
UNKNOWN reset запрошено новое пользовательское нажатие; computer-use не адресует
CEPHtmlEngine child. Затем exact old AE exit/архив/fresh session baseline.
Configured MCP всё ещё old2fb/owner_unavailable; нужен Restart MCP после
установки, install повторять не нужно. Далее native idle/UNKNOWN reset,
fresh session/baseline и configured proof. Точные pins — checkpoint.

**2 ноября, installed checkpoint B1/B2:** source commits `264522c`/`2d08c71`
приняты адресными checks; штатно установлен package `2fb5aebe…`, distribution
`d8d77c38…`. Standard thin client → CEP → native project-inspection, known rejected
read и auto reconnect после96с без Core проверены. Последний owner19892/один3457,
AE9472/пустой проект, peer connected, pending/UNKNOWN/fault0; history44events с
точным prefix36, origins/adoption/ledger preserved. После restart Codex configured
package2fb5aebe/owner24160 ready, fresh project-inspection пустого AE9472 PASS;
lease1 released, pending/UNKNOWN/fault0. History46events/prefix44 exact,
bindings/origins/adoption/ledger unchanged; install повторять не нужно.
B3a1–a4/b1/b2 source приняты; B3b3 production startup/readonly driver/panel
reset/session ack/baseline/package composition принят 721unique cases (212fresh/509exact reuse)/
42checks/41batches, boundaries55. Candidate327faaac…/distribution4975c36a…
(80runtime/98bundle) built/verified/dry-run; actual installed2fb5aebe прежний.
Свежий configured preflight owner24160/AE9472 PASS; два новых reads,50settled
events/prefix46 exact, protected/bindings unchanged. Пустой проект сохранён
как собственный snapshots/core-base-b3-native-20261103.aep/SHA8299fd9f….
Далее B3c: новый штатный stop/update/enable, native panel idle/UNKNOWN reset
и свежая session/baseline; затем последующие задачи действующего плана.
3ноября первый configured status после≥3460с idle сохранил owner24160/тот же boot,
peer connected, pending/UNKNOWN/fault0; один3457,46events/protected files unchanged.
Исходный Argon
plan review получен2ноября21:19, verdict revise; шесть замечаний локально разобраны,
контракт уточнён, повторных отправок нет. Debugger unattached остался историей
предыдущего retrieval. Актуальные IDs, действия и предел proof —
[checkpoint](plans/core-base-installed-checkpoint-20261102.md). История ниже
сохраняет provenance; она не выдаёт authority новому AE или B3 reset.

**2 ноября, уточнение пользователя в чате `01a19c49-8b10-7fe2-af4b-ce58f19219d5`:**
в базу добавлен обязательный режим «Начать заново»: прекратить прежнюю работу,
исключить позднее исполнение старых команд, сохранить неизвестные исходы в истории
и начать новую работу от свежего состояния AE без обязательного выяснения каждого
старого UNKNOWN. Это новый штатный механизм, не удаление journals/locks/fences.
Активная последовательность — B1 → B2 → B3 → installed-проверка;
[обновлённый промпт](plans/core-base-continuation-prompt-20261102.md).
Для разработки и отладки базы разрешены необходимые создание/изменение/сохранение
тестовых AEP, сохранение текущей работы для её защиты, перезапуски AE/CEP/Core
и штатные package/install действия без повторного общего запроса разрешения.
Адресные диагностические JSX допустимы через поддержанный путь с техническими
gates; собственные временные тестовые данные можно удалять/пересоздавать.
Пользовательские исходники и несохранённую работу защищать копией/сохранением,
не уничтожать молча. Один live-контроллер, проверка точной цели, запрет replay и
сохранность истории действуют; B3 должен штатно прекращать действие старых
ограничений после доказанного прекращения старого исполнения, не подменять исход.
Это уточнение заменяет прежние scope-запреты ниже на новый AEP/save/restart/raw
для отладки базы; исторические evidence и запрет повторять settled transactions
сохраняются. Titles/Slideshow и новый транспорт в эту работу не добавлены.

**1 ноября, новое прямое поручение:** Titles/Slideshow отложены. Активен
[план базы без Titles](plans/core-base-reliability-20261101.md): сначала research
готовых MCP и два отдельно заказанных диалога Argon (план базы / сравнение решений),
затем подключение, восстановление, диагностика с конечной матрицей проверок.
Отслеживание смены проекта — отдельное feasibility research без реализации.
Исторический R5 Titles ниже не возобновлять автоматически. Общую базу проверять
существующей project-inspection, без ремонта типографики. Не объявлять read-only
proof приёмкой mutation или всего выпуска.

С 30 октября 2026 текущий приоритет — [устойчивый запуск и восстановление
Core/CEP](plans/core-cep-lifecycle-20261030.md). Организационный coordinator/writer —
чат `01a18cce-e909-72d1-a327-07743704304e`; прежний T2-маршрут не возобновлять
автоматически. Titles сохранён как проверочный сценарий, развитие продуктов
следует после этого этапа. Выбрана модель одного installation-scoped Core owner
с тонкими stdio clients и явным controller lease. 31 октября client resilience
source1a6d442 принят186selectedPASS; interrupted owner pre-ready recovery587b49f —
209selectedPASS. Original stop`b99e2f80…` и update`88e4a61e…` штатно завершены через
новый inspect/finish и explicit enable с тем же original payload/credentials.
Installed package теперь`cc2f0713…`; helper distribution`6ae8960f…`. Owner2600 ready,
один listener3457, peer connected, pending/UNKNOWN/faults нет. Первый cold standard
status6108.60мс прошёл с первого запроса; два клиента/EOF/parent exit сохранили owner.
Journal18events, prefix16events/origins/adoption неизменны. AE26308 не перезапускался,
собственная CEP закрыта/открыта1раз для установки; project changes/save/mutation0.
После restart первый configured core_status новогоcc2f успешен: client22952,
owner6716 ready, один listener3457. Old2600 отсутствует; completed HMAC recovery
4abb9cb7/readyfd7af275 связывают exact PID/birth/boot. History/config/origins/adoption
unchanged, pending/UNKNOWN/faults0. AE26308 прежний. После runtime_wait_expired
пользователь нажал «Подключить»: configured peer connected/inspectionAvailable.
Новый cc2f read-only project-inspection прочитал0items/несохранённый проект,
authority/continuity=false; explicit lease generation1 освобождён. Журнал теперь
20events: begin19/complete20 ровно этой inspection, prefix18 прежний2a7d8b23…;
current SHA262a0934…, origins/config/adoption unchanged. Mutation/save/restart0.
Первый configured status после314.85с
idle прошёл с первого вызова за62мс, same owner/boot, pending/UNKNOWN/faults0.
Второй configured first-call после1194.008с idle с подключённой CEP прошёл за65мс;
тот же owner/boot/peer, history20events/config/origins/adoption unchanged.
Wire reconnect отдельно не трассировался. Следующий инженерный шаг — штатная
fresh host re-adoption: current absent-only adopt-host не заменяет existing adoption.
Активный [re-adoption план](plans/core-cep-r3-host-readoption-20261031.md): один
Argon plan review получен/revise и локально разобран; source slice1 private
evidence/lease adapter принят212PASS/9checks composed coverage и independent ACCEPT.
Private transaction core2–4 теперь принят253PASS/12current checks:7fresh checks
и5exact unchanged reuse, independent code/test ACCEPT. Включён historical terminal
receipt после normal owner startup; current runtime/history/barrier не объявляются
проверенными и authority не выдаётся. Lease доступен только после canonical claim.
CLI slice5 принят338unique PASS/19current checks, с9fresh batches и exact reuse;
общий routing/artifact case counted once. Runtime packagecc2f/70files unchanged.
Official helper outputc787e013… записан/полностью проверен, CLI commit8ce5a58.
Actual новый stop`c4c0af30-1260-4e72-b875-74084ae1d0b3`/certify/readopt/explicit enable
завершён. Adoption теперьAE26308/SHA666c79a6…, old4a453b0f… archived. Первый
configured status6388мс/первый вызов: owner9584 ready, boot04d9b162…, один3457;
old6716 absent. HMAC11phase records/owner, descriptor/client/config/origins/AEP
unchanged, journal24settled/prefix16/18/20 preserved, gates/ledger/pending/UNKNOWN0.
AE restart/save/mutation0. После runtime_wait_expired пользователь снова нажал
Connect: same owner9584, configured29мс, peer/inspectionAvailable=true. Fresh
project-inspection подтвердила Text_1_1/comp218/layer219 на current test-copy.
После штатного core_connect один Titles inspect завершился rejected/inspection_failed;
журнал28settled/prefix24 unchanged, controller gen2 released, pending/UNKNOWN0.
Raw/native mutation не выполнялись. Активный узкий [R5 engineering block](plans/core4-titles-inspection-20261101.md)
устанавливает безопасную диагностику причины, затем Titles compiler/native gate/read-back.
Его source freeze02 теперь принят192unique PASS/7Core checks+product8,
boundaries44 и independent ACCEPT. CharacterRange/full dormant colors proof,
finite read diagnostics и server-created taskId; owner gates/registry unchanged.
Принятый срез: packagebe9afe99…/distribution5de01291… (70runtime/87bundle).
Official output5de01291… записан/verified. Новый stop`f1b8ca9c-66c7-4b9b-b9a9-0974ea04faf8`
и update`90539075-ff4c-459c-a659-ecfdbb521c7f`/explicit enable завершены; installed
package теперьbe9afe99…, descriptor50bd6835…/client94d94d77…/configca895a00….
Штатный installer один раз выдал original-new split credentials, dual old/new
HMAC8records и exact70runtime/7CEP bytes проверены. Origins/adoption666c79a6…/
28settled journal/AEP preserved, gates/ledger/pending/UNKNOWN0. Own CEP close/open1
для установки, новая панель автоматически connected. Real standard clients27816/
16028 exit0, owner23816 ready/boot44f3b34a…, один3457, old9584 absent. Это пока
standard proof до restart: configured oldcc2f далowner_unavailable. Пользователь
перезапустил Codex; первый configured status успешно загрузилbe9afe99. Owner16772/
birth639290764154052560/boot805165c7… ready, один3457;5clients текущие/stalecc2f0,
old23816 absent. HMAC recovery6b6a3d4c…/readyec7594f2… и exact archives/current
replacement подтверждены. Причина выхода23816 не наблюдалась, survival не заявлен.
После user Connect same16772/peerpanel-60fa36ee… connected, explicit acquire1/
core_connect available=true. Fresh project-inspection exact comp218/layer219 PASS;
Titles terminal rejected/titles_missing_stroke_color, command7f249231…/executor6d84….
Original durable reply/finite diagnostic сверены;32settled events/prefix28 preserved,
config/origins/adoption/AEP unchanged, ledger/gates/pending/UNKNOWN/faults0, lease1
released. Actual new build/run/mutation0. Active R5 разбирает native CharacterRange
missing color без fake/default/drop proof и без raw/style probes; source/install
до принятого решения не менять. Source tests не подменяют native.
На паузе1ноября по прямому «завтра… пока сворачивай». Bounded review подтвердил
отсутствие доказанного read-only fallback; строгий профиль не ослаблен. Один
соседний кандидат comp231/layer232 также missing_stroke_color; journal36settled/
SHA a3996201…/prefix32 exact, lease3 released, mutation/save0. Test-only8cases
добавлены в manual-runtime.test.js:59selectedPASS, root verified76deps/181прочий
Core file unchanged. Packagebe9afe99 прежний, новый install не нужен. Новый
минимальный AEP только предложен; разрешение на его save/новую цель НЕ получено.
До пользовательского продолжения новых live действий не делать.
AE restart/save/mutation0. Не повторять f1b8/9053/c4c0/old transactions и не чистить
markers. Full release/deferred closures не переобъявлять PASS.
Не повторять c4c0af30 и old transactions; markers не чистить.
Standalone proof не подменяет configured.
**Settled stop/update/recovery/enable не повторять,
markers не чистить.** [Installed recovery](plans/core-cep-r3-owner-preready-20261031.md)
содержит source/installed evidence и оставшиеся R5 проверки.
Прежний configured project-inspection package8a79 прочитал пустой несохранённый
проект без authority/continuity. Старая adoption6492 не заменяет current host
witness/новую adoption перед исполнением. Эта запись не выдаёт runtime authority.
Точный [installed checkpoint](plans/core-cep-checkpoint-installed-20261031.md)
содержит settled IDs и следующий read-only шаг; migration/update не повторять.
Эта запись не выдаёт runtime authority и не снимает pending/UNKNOWN/fences.

В общей схеме Argon достаточно одного review на самостоятельный этап, затем
замечания проверяются/исправляются и подтверждаются локально. Уже данное поручение
на первые review следующих самостоятельных этапов сохраняет силу; автоматического
второго result/fix/final review нет. Не создавать новые точки согласия для уже
разрешённой работы.

Цель: самостоятельно работающее минимальное ядро Codex → MCP → typed bridge → After Effects и независимо подключаемые рабочие пакеты. Текущий план: `plans/core-4.0.0.md`; `plans/core-migration.md` сохраняет историю исходной базы 3.3.5 и незавершённого cutover.

С 29 октября 2026 пользователь принял архитектуру внешних workflow-продуктов:
активный план — `plans/external-products-titles-20261029.md`. Titles/Slideshow
владеют заданиями, шаблонами и compiler вне `core4/`; пакеты операций AE владеют
typed исполнением, Core — общим допуском/очередью/журналом. Первый pilot —
`products/titles/` поверх существующего MCP, без второго broker и нового SDK.
Фактическая двусторонняя приёмка переносимости отложена пользователем на финал
выбранного функционального состава; правила переносимого кода действуют сейчас.

## Постоянное правило: Argon review

Для любого проекта и этапа Argon review не является обязательной парой «ревью плана → ревью результата», условием продолжения после исправлений или gate объявления выпуска. В рамках явного поручения можно выбрать не более одного ограниченного ревью на подходящем этапе и по подходящему предмету. Затем владелец задачи локально разбирает замечания в разрешённом scope, проверяет их адресными evidence, применяет подтверждённые исправления и подтверждает их релевантными локальными техническими проверками. Повторное обращение к Argon допустимо только по новому явному поручению пользователя; запрос Argon на повтор, изменение boundary или готовность выпуска сами по себе его не разрешают. Это правило не меняет gates авторизации и AE, запрет повтора при неизвестном исходе отправки, требования к техническим проверкам или действующие ограничения доступа.

## Постоянное архитектурное правило: десктоп ↔ MSI

Двусторонняя переносимость разработки и обновлений — обязательное свойство всего
**AE Agent Core**, независимо от номера версии и рабочего названия Core4.
Крупные архитектурные блоки, модули и проверяемый инженерный контекст должны
переноситься между десктопом и MSI без повторной ручной настройки после первичной
подготовки поддерживаемой среды. Переносимость — обязательный критерий готовности
текущего среза и последующих изменений, затрагивающих эту границу.

Нормативный контракт и измеримая приёмка — [docs/portability.md](docs/portability.md).
Код/контракты/пакет отделены от локальных путей, MCP/CEP-конфигурации, credentials
и runtime state; локальные привязки обнаруживает, проверяет и создаёт штатный
installer. Не вводить ветки предметной логики по имени компьютера, ручные правки
исходников/конфига на каждом переносе или скрытый fallback. Состояние исполнения,
authority, pending/UNKNOWN и fences не переносятся как разрешение продолжить
команды на другой машине. Проверка на одной машине не доказывает совместимость
второй. До фактического round-trip результата критерий остаётся открытым.

## Активный устанавливаемый срез

Текущий срез: `plans/core-4.0.0-installable.md`. Пользователь прямо поручил создать и поставить собственную4.0.0 из имеющейся разработки: runtime/IPC/CEP/package/installer и выбранный manual current-target путь без C++ SDK. Root — единственный live/CEP/UI-контроллер. Автоматический lifecycle/grant-контракт M2b сохраняется; fake production epoch, public injection/issuance и перенос legacy authority запрещены. Ручное подтверждение текущей совпадающей цели не объявляется continuity прежней incarnation.

- Работать по-русски, сохранять чужие изменения; один writer на ресурс и один live-контроллер.
- Typed inspection → deterministic build → server-owned proposal → dry-run → подтверждение по риску → read-back. Private brands, grants, ownership, checkpoint и UNKNOWN/no-replay обязательны.
- В базе 3.3.5 builders: `get_plan_builder_contract` → `build_solution_plan`; в Core4 — module discovery/`get_module_contract` и стабильный generic plan API. Recipe search tools исключены. Старый cutover protocol `docs/core-cutover-package.md` — сохранённый пакет без разрешения actual switch; разработка Core4 от него не зависит.
- Raw JSX, destructive и save сохраняют отдельные ручные gates. Файловый доступ не выдаёт runtime authority.
- Codeburn — отдельный внешний MCP для аналитики расхода.
- Старый `AE_agent` — неизменяемый источник provenance; runtime state, credentials, `.git` и зависимости не копировать. Целевые package/install/config изменения для новой4.0.0 теперь явно поручены; historical cutover старого runtime не выполнять.
- AME сохранён без новых работ и проверок. Новое поручение разрешает необходимую проверку собственной установки4.0.0; оно не разрешает перезапуск AE, обход pending/UNKNOWN/fences, raw/destructive/save или изменение пользовательского AEP ради удобства установки.
- Новый контур — `core4/`, без imports старых `bridge-daemon`/adapter и без монолитного fallback. Его проверки выбираются `node core4/tools/validate-diff.js <changed-path> --run`, boundaries — `npm.cmd --prefix core4 run check:boundaries`; M1 fixtures — `npm.cmd --prefix core4 test`. Полная release-проверка — отдельное явное действие. Старые `check:rules`/`smoke:core-runtime` проверяют только изменённую исходную базу 3.3.5; не повторять их из-за правки Core4. `git diff --check` сохраняется. Offline stub не является live proof.
- Завершённые этапы фиксировать небольшим commit и обновлять Progress / Decision Log / Validation текущего плана.

## Рабочие заказы и разработка продукта

- Для сложных инженерных этапов доступен [ручной Argon review workflow](docs/argon-review-workflow.md); ограничения и состояние MSI описаны там и в статусе bridge-проекта.

- Назначение задачи определяется явным scope, а не cwd. Титры, слайды, монтаж и другие пользовательские работы ведут собственный рабочий контекст и результаты. Остановка чата, изменение ТЗ, ручная доработка или обычная рабочая проблема сами по себе не создают product milestone, архитектурное решение или условие запуска AE Agent.
- Progress / Decision Log / Validation продуктового плана и milestone commits относятся к разработке AE Agent. Исправление инструмента выделяется в явный engineering block: scope, изменения, relevant verification и продуктовое решение. Рабочий заказ нельзя молча превращать в разработку продукта. Текущий перенос Core — такой engineering block.
- Новые plan-run records содержат описательный `recordContext`: purpose/lifetime/context/project/resource bindings. Обычный runner явно использует default `user_work/work_context`; engineering и технические проверки указывают `development/product_change` или `technical_check/ephemeral_check` явно. Старые записи без metadata остаются `unclassified`; назначение не угадывается по cwd или UUID. Контракт — `docs/record-context.md`.
- Purpose не является authority и не снимает UNKNOWN, ownership/revisions/checkpoints или fences общих ресурсов. Новый чат/UUID и отмена заказа не доказывают отмену уже отправленной команды. История рабочих заказов остаётся legacy; Core startup зависит от своего origin и действующего состояния/ограничений общих ресурсов, а не от архивной истории работы.
