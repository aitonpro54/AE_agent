# Production driver общей очереди AME

Этот driver собирает и запечатывает production профиль `SharedTwoTitleQueue85`.
Он не запускает C1/controller, AE/AME или очередь. `sealed_creator_closed` означает
только проверенный build/seal; live приёмка выполняется отдельно исходным root.
Никаких media/decoder/PNG/D49/D50 операций в generated policy нет.

Обязательные входы перед Collect:

1. SOURCE STOP всех runtime/native/build-driver файлов и точный commit.
2. Два actual passive Node24.19 census исходных controller/daemon entrypoints,
   с `authority:false`, `nativeFactories:0`, exit0 и EOF. Discovery при WIP после
   изменения source closure повторяется root до final Collect.
3. Actual CEP script snapshot нужной страницы. Коллектор не вызывает evaluate,
   не вводит diagnostic и не отбрасывает неизвестные скрипты. Anonymous source
   в текущей странице закрывает assemble; root сверяет штатный reload и повторяет
   сбор. Единственный будущий diagnostic row — точный source-owned
   `CEP_STATE_DECLARATION` из observer, а не выдуманное live наблюдение.
4. Точные пути Node, SDK, MSBuild, AE, AME, AEP, EPR, CEP image/panel, отдельные
   automation/panel credential файлы и controller transport JSON. Последний имеет
   ровно `automationToken`, `host:"127.0.0.1"`, `port:3456`; token равен байтам
   automation credential. Секреты не выводятся.
5. Проверенный closed external compiler input manifest v2: path/bytes/links/SHA
   для tool/import/include/link входов. Все фактические preprocess/imports,
   sourceDependencies и linker read tlog должны входить в planned M.
6. Свежие scoped output/pins/runtime/setup/snapshots/output/bootstrap namespaces.
   В примере шесть inventory directories — реальные пустые task-owned каталоги.
   Они удовлетворяют structural native inventory predicate и не утверждают
   отсутствие исторических runtime namespaces. Для absent entries root указывает
   нужные существующие policy selectors; Collector проверяет фактическое отсутствие.

`config.example.json` содержит пути текущей задачи и один обязательный placeholder
`sourceStopCommit` текущего checkpoint. Root копирует его в ignored runtime, сверяет фактический commit,
проверяет ожидаемые имена comp/root и locator strings. Имена являются ожиданием
build profile; actual AE identity впервые проверяется native READ.

Пример root команд (переменные путей — обычные строки, без секретов):

```powershell
$sqRepo = 'C:/Users/Ant/Documents/Codex/AE_agent'
$sqNode = 'C:/Users/Ant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$sqCli = Join-Path $sqRepo 'scripts/shared-queue-build/cli.js'
$sqConfig = Join-Path $sqRepo '.codex-runtime/shared-queue-20261015/config.json'
$sqCep = Join-Path $sqRepo '.codex-runtime/shared-queue-20261015/cep-source-census.json'
& $sqNode --expose-internals $sqCli cep-census 'file:///C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.codex.aemcpbridge/index.html' $sqCep
& (Join-Path $sqRepo 'scripts/owned-runtime-shared-queue-build.ps1') -Action Collect -InputFile $sqConfig -InputSha256 (Get-FileHash -LiteralPath $sqConfig -Algorithm SHA256).Hash
```

Collect выполняет actual no-follow Windows pin observations, сохраняет 64-bit
serial как decimal string, строит header/M tables, role/TU lists, source policy
и exact pure project program. Он не импортирует main entry как исполняемый модуль:
нужные named fixed factories извлекаются из AST и выполняется только генератор
строки. Все actual pins имеют ненулевые identities; нулевые SHA существуют лишь
у upstream self-referential header rows1..3 и M согласно native build contract.
Final binary identities разрешаются оригинальным seal witness, поэтому их
generated locator selectors не выдаются за заранее известные pins.

Collect и Validate запускают Node children: при их UNKNOWN также сохраняется
исходный root PowerShell owner. CompileOnly и BuildAndSeal обязательно выполняются
через dot-source в сохраняемом root PowerShell owner; закрывающийся после ошибки
короткий shell для них запрещён.
До prepare обязателен CompileOnly всех трёх ролей на тех же inputs:

```powershell
$sqDriver = Join-Path $sqRepo 'scripts/owned-runtime-shared-queue-build.ps1'
$sqManifest = Join-Path $sqRepo '.codex-runtime/shared-queue-20261015/production-build/production-build-inputs.json'
. $sqDriver -Action CompileOnly -InputFile $sqManifest -InputSha256 (Get-FileHash -LiteralPath $sqManifest -Algorithm SHA256).Hash -RootReviewedDriverSha256 (Get-FileHash -LiteralPath $sqDriver -Algorithm SHA256).Hash
```

CompileOnly создаёт артефакты только в build output, проверяет preprocess/imports,
точные TU/includes и linker read tracking. Он не копирует файлы в fixed root,
не запускает creator и не создаёт seal. В preflight header ещё нет late anchor/D;
такой binary никогда не используется для runtime admission. BuildAndSeal требует
его успешный receipt с тем же input SHA и заново собирает final роли после actual
prepare. Имена preflight/seal логов различаются; они работают в одном buildout,
с прежними generated file IDs и fixed artifact selectors.

BuildAndSeal выполняется **в новом сохраняемом root PowerShell owner**, через
dot-source, с текущим SHA reviewed driver. Root сохраняет этот process/session
до CLOSED или фактического выяснения UNKNOWN:

```powershell
$sqDriver = Join-Path $sqRepo 'scripts/owned-runtime-shared-queue-build.ps1'
$sqManifest = Join-Path $sqRepo '.codex-runtime/shared-queue-20261015/production-build/production-build-inputs.json'
. $sqDriver -Action BuildAndSeal -InputFile $sqManifest -InputSha256 (Get-FileHash -LiteralPath $sqManifest -Algorithm SHA256).Hash -RootReviewedDriverSha256 (Get-FileHash -LiteralPath $sqDriver -Algorithm SHA256).Hash
```

Driver удерживает originals входов и creator process/stdio. Порядок фиксирован:
setup headers → creator compile → prepare424 → actual anchor → final headers/M
→ final addon+broker compile → seal request80 → final752 → ACK80 → exit0+EOF.
После seal request compile запрещён. Header/M файлы обновляются на прежних file IDs;
`M` и normalized header digest повторяют native little-endian/domain format.
После final compile driver сверяет реальные PE artifacts и перед ACK проверяет
nonce/birth, исходные pins, profile/source/policy/M/artifact-set/SID commitments
и фактические bytes anchor. Native creator независимо держит и проверяет originals.

CreateProcess получает обычные DOS locators: reviewed `build.msbuildLocator` и
обычный destination locator созданного creator. Canonical volume paths сохраняются
в physical pins. До запуска alias открывается и сравнивается с held image pin/SHA;
после запуска image запрашивается через исходный process HANDLE и снова связывается
с тем же pin. PID reopen и fallback locator отсутствуют. `Win32Exception(87)`
с подтверждённым отсутствием process association записывается как `NOT_CREATED`,
с `originalHandleAcquired:false`; это отличается от UNKNOWN. Остальные ошибки
создания, отсутствие ясного результата и ошибки post-create проверки удерживают
исходный owner и не повторяют Start. Start intent/refusal/started receipts находятся
рядом с соответствующими stdout/stderr logs.

`$global:SharedQueueBuildOwner` хранит UNKNOWN originals. Timeout не закрывает
stdio, не убивает процесс, не открывает его по PID и не повторяет операцию.
Не закрывать owner shell и не запускать заново driver над этой namespace.
После CLOSED root получает `build-and-seal-receipt.json`, final frames, generated
headers/M, actual artifact pins и compiler observations в scoped output.

Офлайн-проверка codec/source generator:

```powershell
node --expose-internals scripts/shared-queue-build/smoke.js
```

Она не запускает Inspector/CDP, native compiler, factories, creator или приложения.
