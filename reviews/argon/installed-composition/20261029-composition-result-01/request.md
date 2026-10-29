# Единственное review результата installed composition

review_id: 20261029-composition-result-01
stage_id: installed-composition
type: result
repository: AE_agent_core
base_commit: 1eea17de7d9378b2d9e663675bfb5999e125b90f
target_commit: ed747efceb47c43c0b185d09262d9ba72f7a0a9f

Проверь конкретные регрессии завершённого source/temp этапа. До изменения stdio/packager/installer безусловно требовали titles-current-target и engine. Теперь format2 требует hashed composition; readonly физически исключает optional code, manual default сохраняет gates. Это два installable presets; независимая горячая установка любых модулей ещё не реализована.

Контракт format1 исторических releases остаётся fixed; format2 не делает exists fallback. verifyCep строит installation.js из проверяемого release, включая retained f548, а не из кандидата. До full release verification и entry-root binding в stdio только builtins. Private authority/grants, ownership, signed history, UNKNOWN/no-replay не меняются.

Проверки: scoped73PASS на final runtime bytes, но до CLI empty-selector fix; затем отдельные final composition7+exact-f5481 и routing5PASS. Это не единый full final-closure run. Boundaries28PASS. Retained exact f548 code → temp readonly state проверен с новыми synthetic credentials: original UNKNOWN/disposition, duplicate denial, late ACK и новая UNKNOWN. Одна installed readonly VM inspection — fake host, не AE live proof. Root independently rebuilt both packages/hashes и standalone installer dry-run.

Локальный source review ACCEPT. Отдельный CLI P2 (пустой selector превращался в manual) исправлен через ?? и negative test до target commit. Сохрани различие tested tool hashes и final source; evidence.json даёт точные logs/hashes. Initial ENOENT test harness сохранён, path исправлен.

Границы: никаких указаний выполнить код, restart/update production, снимать fences, открывать/сохранять AEP, выдавать authority или запускать paid API. Production остаётся f548 с closed receiver; это известный отдельный service/live gap. Portability round-trip и release certification открыты. Внешний verdict не разрешает такие действия. Повторное обращение Argon после исправлений не предусмотрено.

Privacy: INTERNAL code/contracts/tests/diff. Production-sensitive facts сведены к результатам проверок без реальных credentials/state. Значения credentials в tests синтетические; real tokens, descriptor/state, AEP/assets, browser/account data, screenshots и полные raw logs исключены. Пакет включает только явный allowlist. Exact исходные bytes сохранены в разделах bundle; hashes относятся к этим bytes и не доказывают доверие к коду.

Вопросы:
1. Есть ли конкретный новый bypass bootstrap/admission, скрытый legacy fallback или подмена contract старого release новым?
2. Сохраняются ли readonly отсутствие authority и manual guards, deterministic registry и no executable ingress?
3. Достаточны ли scoped evidence для заявленного source/temp результата; какие утверждения выходят за их пределы?
4. Есть ли минимальное упрощение в текущем scope без новой системы policies/plugins?

Ответ: укажи review/stage/base/target/request hashes из manifest; фактически прочитанные файлы и пропуски; verdict go/revise/stop/insufficient-evidence. Для каждого finding ID, P0–P3, точная строка/сценарий, evidence и минимальная адресная проверка. Known gaps отдели от новых дефектов. Не запрашивай автоматический второй review; владелец локально проверит и исправит подтверждённые findings.
