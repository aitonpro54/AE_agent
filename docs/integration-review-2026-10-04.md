# Комплексная проверка AE Agent — 4 октября 2026

## Статус

Статус **COMPLETE** относится к запрошенной интеграционной проверке кода, исправлениям, offline matrix и пассивной live read-only верификации. Он не означает универсальную product acceptance, live mutation или художественную приёмку. Исторический исходный runtime baseline сохранён без переинтерпретации: `.codex-runtime/integration-audit-20261004/live-read-only-baseline.json` — PID 45404, source SHA `de4aaa9f…`, AE 26.2x49 connected, autonomy on, очереди пусты, edit session null. Проект empty/unnamed, dirty=false, revision 1; lifecycle private opt-in выключен.

## Исходные проверки и дефекты

Исходный HEAD `033a82e19a3d03b6792d6cfeffdc972e6b484b01`, ветка `codex/production-usage`. Из 26 последовательных offline/isolated команд прошли 24, две завершились ошибкой, пропусков и timeout не было. `check:rules` и `git diff --check` прошли. Полные результаты находятся в `.codex-runtime/integration-audit-20261004/baseline/results.json`.

Два failure оказались неполными тестовыми фикстурами. Easing-фикстура отправляла только keyframe indices и тип интерполяции, хотя production handler возвращает идентичность target, keyframe receipt и проверенные значения. Hardcore-фикстура не загружала production reconciliation helper и подменяла проверку успешного выполнения простым `run.ok`. Обе фикстуры исправлены без изменений production verifier или gates. Целевые `autonomous-mcp-smoke.js` и `hardcore-authority-smoke.js`, syntax обеих файлов и diff check прошли; Hardcore теперь включает сценарий применённой мутации с pending verification и требует reconciliation без повторного запуска. Логи: `.codex-runtime/integration-audit-20261004/fixture-fix/`.

Отдельно подтверждены два product defect: истёкшее ожидание теряет исторический `lastRun` при наличии exact pins (реальный proposal-state reproduction); visual builder проверяет только файл и число items, но не revision, хотя revision требуется документированным контрактом. Flash завершил запуск с socket failure и частичной записью; процессы проверены как exited, файлы сверены, claim освобождён. Sol 6.1/high закончил тот же bounded scope. Транспортный результат остаётся unknown, не принят как успех.

## Финальная offline матрица

После фиксов последовательно выполнены все исходные 26 команд и четыре дополнительные команды с подтверждённой изоляцией: **30 PASS, 0 FAIL, 0 SKIP, 0 timeout**. Extras запускали временные loopback daemon/adapter; prompt-optimization использовал локальный capture-provider, а `smoke-test.js` записал synthetic artifacts в ignored `logs/hardcore-sessions/smoke-*`. Порт 3456 и live runtime не опрашивались и не менялись. Runner, 30 отдельных stdout/stderr и полный source-hash manifest: `.codex-runtime/integration-audit-20261004/final/results.json`; scope review там же.

После уплотнения плана `npm.cmd run check:rules` прошёл; `node --check` прошёл для всех семи изменённых JS; `git diff --check` прошёл. Группы проверяли текущий source checkout, runner HEAD остался `033a82e`; manifest SHA-256 включает изменённые source/test файлы. Проверенный checkpoint кода и тестов: `5447ab24415216b0ebc9b64b90a71174cc38b152`.

## Пассивная live read-only сверка checkpoint

Родитель как единственный live controller проверил старый idle daemon PID 45404 (queues 0, edit null, current plan null), подтвердил точный source process и остановил его. Новый resident MCP adapter запустил daemon PID 17892 на checkpoint `5447ab2`; источник `e38af1806dc8bf7197dc3fa9bfa6571302a3ca7fa9205f0ca523226f92013378`. Штатный `runtimeIdentity()` сравнил 27 именованных module hashes, `matchesRuntime=true`; это composite identity, не утверждение о raw single-file hash. Дополнительная запись: `.codex-runtime/integration-audit-20261004/live-runtime-code-identity.json`.

Passive `wait_for_bridge_state` вернул `connected_and_idle`; trusted CEP переподключился. Autonomy desired/ready/active — true, `persistenceError=null`; lifecycle opt-in остался off; pending 0, inflight пуст, edit null. Native project info: file null, `numItems=0`, revision 1, revision support true; lifecycle сообщает AE 26.2x49, dirty=false, revision 1, unnamed. Финальное evidence: `.codex-runtime/integration-audit-20261004/live-read-only-final.json`. После restart продуктовые тесты не повторялись. Не выполнялись project mutations, save, render, GUI или provider calls.

## Решения по трём блокам

**Ошибки и продолжение.** `repairDirective`, reconciliation и outcome-состояния уже есть. Сохраняем идентичность run и сначала делаем свежие read-back проверки; затем улучшаем общий actionable error и подсказку следующего инструмента. Внешнее исследование MCP ошибок поддерживает точные указания доступного server tool вместо команд/действий вне видимости сервера, но опубликованные метрики относятся к чужому набору серверов и не считаются показателями AE Agent ([arXiv:2609.35381](https://arxiv.org/abs/2609.35381)).

**Tool context и токены.** Для `get_solution` предпочтительнее полный список схем: выбирать до четырёх preferred tool schemas одного решения при общем лимите 24 000 сериализованных символов. Planner context уже отбирает core tools, совпадающие инструменты и до 8 ранжированных summaries схем. Подсчёт родителя — 170 tools / 732 230 UTF-16 символов — включает повторяющийся client wrapper и text policy; это не замер фактического per-turn payload и не raw server transport. Client lazy loading в каждом ходе неизвестна. Поэтому server redesign откладывается до измерений реальных tokens и качества. Cursor описывает динамическую загрузку и A/B оценку качества как опыт собственного harness; его проценты не переносятся на AE Agent ([Cursor Research](https://cursor.com/blog/improved-token-efficiency)).

**AE capability и доказательства.** Уже есть executable builders, montage manifest, manifest/hash-bound file/media/evidence paths и compact native ImageView proof; отдельная parallel-схема связывания дублировала бы существующее. Полезный недостающий regression case — текст с масштабом/offset/stretch, акцентами и descenders, а также фактическая подмена шрифта с проверкой rendered output. Generic bulk key reading не добавляется без конкретной typed need. Сторонние [RECIPES](https://github.com/VolksRat71/after-effects-mcp-vision/blob/main/docs/RECIPES.md) и [CAPABILITIES](https://github.com/VolksRat71/after-effects-mcp-vision/blob/main/docs/CAPABILITIES.md) полезны как карта probe-сценариев, не как proof этого проекта: CAPABILITIES содержит старую поверхность и внутренне расходящиеся замечания о font probing; не считать её текущим контрактом или live acceptance.

Внешний AE-проект документирует конкретную ловушку: `sourceRectAtTime` игнорирует Scale и требует source-time преобразования при offset/stretch; accents и descenders меняют ink bounds. Он также сообщает о silent font substitution и необходимости смотреть capture. Это обосновывает форму будущего regression test, но не разрешает запускать его на открытом клиентском AEP и не заменяет наши typed read-backs. Рекомендации другого проекта о командной lazy загрузке также не отвечают, какие схемы реально передаются клиенту в каждом ходе AE Agent.

В статье arXiv проверялись ошибки 150 MCP-серверов и пять моделей; Cursor описывает собственный production harness и A/B-измерение качества. Их единица наблюдения, модели и трафик не совпадают с нашей средой. Поэтому ссылки служат архитектурными подсказками для измеряемых гипотез, а числа из внешних публикаций здесь не используются для прогноза экономии или качества. Следующий эксперимент должен фиксировать фактические request tokens и результат на повторяемых задачах до решения о lazy context.

## Исполнители и ограничения

Факты и reassessment собрал Scout Luna; bounded read-only review выполнил Reviewer Sol/high; grouped tests, fixture fixes и эта заметка — Operator Luna. Flash 3.8/high через `ae-agent` завершился socket failure после partial writes; после process exit/file reconciliation Sol 6.1/high завершил те же исправления. Родитель был единственным live controller. Лимит — два активных помощника, включая AGY. Эта заметка не дублируется в другом handoff.

Полезный отдельный следующий тест — конкретный rendered text case с Scale, offset/stretch, descenders и подтверждённой подменой шрифта; сначала задать точную synthetic цель и измеримые критерии. Он потребует отдельного scope и не входит в эту завершённую проверку. Замороженная область, dependencies, auth/version, push/PR, save/render и клиентский AEP оставались вне scope.
