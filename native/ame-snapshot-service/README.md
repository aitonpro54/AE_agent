# Dormant resident snapshot service — foundation v1

Отдельный AEGP/AEX для штатной загрузки при старте собственного процесса AE.
Не используется fixture probe, его ENV, HMAC-ключи или временный manifest.
Эта реализация **не готова к production snapshot/export**.

## Контракт текущего этапа

`EntryPointFunc` приобретает только `RegisterSuite5` версии 6, регистрирует
death/idle hooks и освобождает suite через RAII. Refcon остаётся живым до выхода
процесса: unregister API отсутствует, ошибку после регистрации нельзя лечить
удалением состояния. Idle проверяет поток entrypoint и держит atomic RAII gate
на протяжении работы и отказа; вложенный callback ничего не выполняет. Death
закрывает будущую работу. Нет menus, JSX или project/RQ/AME suites.

При первом успешном idle получается OS/module identity: PID, **полный FILETIME
birth как десятичная строка**, путь и SHA-256 executable, путь/SHA-256 AEX,
build ID, заявленный SDK archive SHA-256, случайный публичный boot challenge.
Далее публикуется одна информационная JSON-квитанция в фиксированном
`FOLDERID_LocalAppData/AEAgent/native-snapshot-service/identities`.
Публикация использует CREATE_NEW, held file handle, flush и абсолютный
FileRenameInfo без замены; файл readonly, handle удерживается до выхода.
Пути проекта, сведения о композициях и секреты туда не попадают.

**Boot receipt не аутентифицирован и не является enrollment или разрешением**.
Same-user ACL/readonly атрибуты не защищают от враждебного пользователя того же
аккаунта. Не принимать receipt как источник полномочий. Нет обхода через ENV,
смену pipe name, caller-supplied bool или fixture key. После ошибки публикации
нет replay/fallback; отсутствие receipt означает неизвестный/неуспешный boot.

Capabilities разделены: `read_only_identity=true` означает только публичную
OS/module identity. `project_inspect=false`, `snapshot_mutation=false`,
`productionReady=false`. Reason: `production_authorization_not_implemented`.

## Закрытый transport seam и точный typed gap

В v1 **нет listener и IPC worker**, входящие запросы не принимаются. Это
намеренная граница: production issuer, pinned ECDSA-P256 verification и
фиксированный daemon enrollment ещё отсутствуют. Будущий bounded worker может
передавать только проверенные typed requests в `RequestMailbox`; AE suite calls
допускаются только в main-thread idle. Mailbox ограничен четырьмя запросами и
64 nonce за срок процесса, далее закрывается; повторный nonce не забывается.
Текущий mailbox не имеет production producer/dispatcher и не делает AE calls.

Подготовленный canonical wire frame имеет ровно 10 ключей, фиксированный порядок,
ASCII/LF, обязательный конечный LF, максимум 2048 байт:

```text
schema=ae-agent.snapshot-service.request.v1
operation=identity|inspect|capture
nonce=<64 lowercase hex>
challenge=<exact 64 lowercase hex from this boot>
host_pid=<canonical nonzero uint32 decimal>
host_birth_100ns=<exact nonzero uint64 decimal string>
host_image_sha256=<64 lowercase hex>
plugin_sha256=<64 lowercase hex>
build_id=build-<32 lowercase hex>
sdk_archive_sha256=<64 lowercase hex>
```

Parser отвергает extra/duplicate/missing keys, NUL/CR/Unicode, неверный hash,
неполную/переполненную birth/PID и неподдерживаемую operation. Все identity поля
сверяются с resident state. `RejectCandidate` никогда не авторизует даже точное
совпадение caller-supplied enrollment; возвращает machine-readable refusal с
точным nonce/challenge, без фактов проекта и попыток записи. Malformed/mismatched
frame выбрасывает typed reason до любого dispatch.

`ObservePipeClient`/`ObservePipeServer` — только Win32 identity helpers для будущего
доверенного transport: обе стороны проверяют `GetNamedPipeServerProcessId` и
`GetNamedPipeClientProcessId`, local counterpart, full birth, image path/hash,
живость процесса. Они не создают pipe и не предоставляют authority. До открытия
listener нужен issuer-signed fixed Node/daemon identity, подтверждённый pinned
ECDSA-P256 key через CNG, точное host/AEX binding, freshness/replay/expiry checks.
Доверенный enrollment нельзя получить из произвольного Node, public tool,
переменной среды, boot receipt или пользовательского поля запроса. Private
issuer/UI grant flow, host ephemeral receipt key и public ledger — следующий
отдельный этап; здесь ключи не создаются и не выдаются.

## Сборка и ограниченная проверка

`scripts/ame-native-service-build.ps1 -OfflineSmokeOnly` собирает и выполняет
только pure C++ `OfflineProtocolSmoke.exe`. Без switch helper дополнительно
собирает AEX, **не устанавливает/загружает/запускает AE**. Каждый запуск требует
новый `build-<32hex>` в ignored `.codex-runtime/.../native-service-build`.
Source/SDK/toolchain hashes сверяются до/после, в receipt записываются ordered
source digest, resolved compiler/linker/resource compiler, бинарные hash,
register ABI и точный scope проверки. Supplied SDK archive hash не выдаётся за
повторно измеренный архив. Receipt имеет стабильную структуру; byte-reproducible
AEX build здесь не заявляется.

Smoke использует **синтетические host/daemon identities**. Проверяет отказ всех
operations даже при точном forged enrollment, смену любого target/peer поля,
schema/nonce/decimal bounds, capacity/replay/ledger exhaustion, nested idle и
RAII release после исключений. Это не вызов EntryPoint/Adobe suites/hooks,
Win32 peer/receipt helpers и не live proof. Для фактической загрузки понадобится
отдельный normal startup собственного AE без fixture ENV; hotload существующего
primary AE этим этапом не предусмотрен.
