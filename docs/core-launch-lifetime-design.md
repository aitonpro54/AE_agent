# Lifetime при завершении launch owner

Статус: root принял focused revision. Frozen harness d1df6f62667e0e47f395d0868ec0ffa5f5f89d81bd7aafeef94ccae62d9024a2 и case0589f811…/SHA bbf64c39f88434256f0b11ae7e9a46d6db9cece96485ba698a63766e722d4ad8 прошли independent read-only safety review. Actual probe0589 завершён назначенными High/root: owner tool exit0, root observer retained SAMEHANDLE post-completion WAIT_TIMEOUT +5458ms, затем WAIT_OBJECT_0/exit27 и observer tool exit0. Receipt `.codex-runtime/core-launch-lifetime/0589f811-2fb3-4b7d-96d0-f6a89457b56b/lifetime-result.json`, SHA `d0133a6e30b81a5cef5658af0cd10f33c329210159b0fb1efc4d28308180498e`. Это fixture PASS, не production launch authority.

## Наблюдения и решение

Старый probe4af33140… сделал один CreateProcess через production C# с explicit CREATE_BREAKAWAY_FROM_JOB. Native IsProcessInJob(child,NULL)=true вызвал прежний literal job-free отказ до candidate. Старый FAIL/incomplete сохраняется. Heartbeat до89631ms и self-exit-intent16:24:06.618Z поддерживают вывод о продолжении работы fixture после owner tool completion, но не заменяют SAME-HANDLE exit proof. Причина старого Core UNKNOWN не установлена.

Membership сообщает association, а не политику lifetime: KILL_ON_JOB_CLOSE действует при закрытии последнего HANDLE job; nested jobs могут сохраняться после breakaway. Поэтому наличие Job не является самостоятельным отказом или доказательством безопасности. [IsProcessInJob](https://learn.microsoft.com/en-us/windows/win32/api/jobapi/nf-jobapi-isprocessinjob), [job limits](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information).

Принят revised invariant: **exact child переживает фактическое завершение launch owner и его tool session, остаётся жив минимум5000ms после подтверждения события, затем observer получает WAIT_OBJECT_0/exit27 на том же заранее захваченном HANDLE конечной fixture**. Job membership — обязательный native diagnostic; query error не подменяется false. Старый gate не считается пройденным: действует явно reviewed revision.

Это bounded доказательство конкретного owner/tool-completion route, а не гарантия против произвольного будущего host/job termination или бесконечной работы. Broker/service/task/parent spoof/host-policy changes сейчас не нужны. Broker рассматривается отдельно только при фактическом провале revised test либо необходимости более сильного контракта.

## Один конечный harmless probe

1. Новый UUID/case, TTL90000ms/selfexit27, observer deadline110000ms, survivalIntervalMs5000. Все файлы под test-owned Core_repair/.codex-runtime/core-launch-lifetime/<UUID>. Exact Node/script/helper/harness/C# pins, argv/actual-parent/expiry/containment/once остаются обязательными. Нет Core keys/3456/AE/AME/protected state.
2. Один CreateProcess, без fallback. Returned HANDLE сохраняется немедленно до identity/job/candidate checks. Candidate содержит actual boolean membership; true не вызывает ранний отказ. Independent observer ДО owner release захватывает QUERY+SYNCHRONIZE HANDLE и сверяет exact birth/image/hash/argv/candidate.
3. После captured ack owner закрывает только свой HANDLE и штатно завершает invocation. Root создаёт completion marker ТОЛЬКО по фактическому завершению owner exec tool. Owner stdout, owner-closing, EOF и self-exit-intent этого не доказывают.
4. Observer валидирует marker, затем выполняет НОВЫЙ SAME-HANDLE WAIT_TIMEOUT. Stopwatch измеряет >=5000ms с повторными identity/wait checks; последний fresh wait также обязан быть WAIT_TIMEOUT/signaled=false/exitCode=null. Предварительный wait до marker не засчитывается.
5. Затем тот же HANDLE должен дать WAIT_OBJECT_0/exit27 в пределах deadline. Self-exit-intent лишь дополнительно связывает nonce/PID/TTL. Result закрепляет case/candidate/ack/completion/survival/terminal refs, actual membership и fixtureOnly=true/productionAcceptance=false/oldCoreCauseProven=false.
6. Missing/foreign/torn marker, drift, query error, ранний exit, неполный interval, потерянный HANDLE, другой exit code или timeout — FAIL/incomplete. PID reopen/heartbeat/absence не ремонтируют proof. Cleanup только selfexit и закрытие собственных HANDLE; никакого kill/job termination. Старую consumed попытку не повторять.

## Production: survival и настоящая pair

Fixture PASS — prerequisite одного accepted loss replacement, не самостоятельная capability. Production implementation и actual fresh gates имеют отдельный review. Возможный Start расходует binding; lifetime failure не разрешает повтор Start/register/current/new generation.

До source/.gemini redirect проверить actual production owner/tool-release survival, сохранив pair gate:

1. После actual registration/current, **при закрытом admission и до activation**, independent observer захватывает read-only HANDLE exact current generation, пока launch owner удерживает pair/HANDLE. Никаких Start/register/current операций.
2. Owner проверяет actual observer identity/liveness/argv и делает supported committed release; это не exit. Root фиксирует actual owner exec tool exit0 отдельным completion marker. Observer получает новую реальную Source→Core pair и сохраняет заранее открытый HANDLE. Release/acquire gap не объявляется непрерывной lease; busy/abandoned/unexpected state закрывают продолжение.
3. Fixed observer mode работает с EXISTING registered generation. Старый migration/resume selector не используется. Observer release до завершённых survival/adoption/redirect/readbacks запрещён в JS и native; EOF/transport UNKNOWN не закрывает owner pipe автоматически.
4. Под новой pair после completion marker — новый SAME-HANDLE WAIT_TIMEOUT, полный5000ms survival, authenticated same-generation status/admission closed и fresh source/Core/resource/asset/local/physical guards. Native observation ещё не открывает admission; отдельная accepted survival binding завершает проверки. Production terminal exit не ожидается.
5. Затем fresh generation-specific challenge/activation/adoption. Под ТОЙ ЖЕ pair — новый post-adoption current actor/activation-bound panel witness, authenticated readiness queue/native/edit/bootstrap checks, source absence и final guards; только после них адресный redirect с backup/CAS/read-back. После законных writes старый source config/key/proof не startup dependency: проверяются ожидаемые новые paths/env/token roles, текущие Core guards и все остальные pinned resources.
6. После `finish-redirect`/readbacks observer штатно освобождает pair/HANDLE и завершает tool. Затем host MCP reconnect/handshake может приобрести ordinary controller и прочитать тот же registered generation. До redirect pair не отпускать; новый host transport до actual typed read-back не объявлять принятым.

Конкретные команды и witness schemas: [owned-loss runbook](core-owned-loss-runbook.md). Канонический порядок выше supersedes прежнюю формулировку activation-before-observer.

## Два уровня code binding

Probe фиксирует полный helper SHA как provenance фактической проверки. Перенос proof разрешён при неизменном extracted production C# SHA b0b1e2455d4e955388403ccb68b935ac10f25b1fc4df44fe613182e22924448a, фиксированных creation flags/attributes/NUL handles, Node/pwsh runtime identities и проверенном invocation context. Fixture argv/env и допустимый production argv/env contract различаются явно; proof относится к lifetime primitive, не к startup поведению произвольной программы.

Final helper full SHA может измениться из-за loss-authority wiring. Он отдельно закрепляется final runtime manifest/source pins и reviewed call path: тот же tested StartIndependent, immediate HANDLE retention, проверенный job diagnostic, fixed argv/env, no fallback/duplicate Start. Полный helper не выдаётся за буквально протестированный, если менялся.

Изменение C#/creation/handle/flags/attributes/runtime/launch context либо inability доказать equivalent reviewed call path требует нового finite probe. Прочие helper wiring изменения сами по себе не требуют повторного90s. Actual production survival read-back остаётся обязательным.

Architect выполнил только design/read-only review; High — owner finite fixture, root — независимый observer и внешний completion marker. Тест завершён, ownership освобождён для handoff. Original Core и его состояние этим блоком не менялись.
