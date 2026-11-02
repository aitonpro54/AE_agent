# Argon: проверка плана «Начать заново»

review_id: 20261102-b3-plan-01; stage_id: core-base-start-over; type: plan.
base_commit: ad12e125e01b2be89ec7298b32c69a366cc390d2.
Это новый самостоятельный механизм. Одно ревью плана до реализации;
автоматического повторного result/fix/final review нет.

## Цель

В локальной цепочке MCP → единый Node owner → CEP → After Effects пользователь
может прекратить прежние планы, сохранить UNKNOWN как неизвестные исходы и
начать новую работу от свежего состояния AE. Не требуется разгадать каждый
старый UNKNOWN. Нельзя допустить позднее исполнение или replay прежних команд.
Разрешены необходимые тестовые проекты, сохранение работы, restart AE/Core/CEP
и штатная установка. Пользовательские исходники защищаются сохранением/копией.

## Текущее состояние

Есть installation-scoped owner, authenticated thin IPC clients, controller lease,
durable receiver journal, Broker ledger, maintenance stop с HMAC receipts,
native PID/birth observations и fail-closed startup. Панель имеет persistent
physical latch, который после callback loss запрещает повторный evalScript.
reset_task отменяет только queued-unsent; reconcile_task ищет original completion.
Они не реализуют новый сеанс. Сейчас UNKNOWN запрещает восстановить writer.

B1 исправляет передачу известного terminal read rejection, его выбранные source
checks ещё заканчиваются. B2 улучшает ожидание Core; адресные offline checks
пройдены. Оба изменения незакоммичены и не установлены. Фрагменты из dirty
snapshot имеют собственные полные file hashes и line ranges. B3 production
code пока отсутствует. Installed/live/reset proof для B3 отсутствует — это
явный предмет будущей приёмки, а не потерянное evidence ревью плана.

## Кандидат

Приложенный контракт предлагает durable reset intent → freeze/maintenance stop
→ проверку прекращения старого Node/AE исполнения → полный архив прежних
broker/receiver stores и атрибутированных markers → новый подписанный session ID
и чистые stores → fresh project-inspection до новой работы с эффектами.
UNKNOWN в архиве не становится success, cancelled или not-executed. Сброс не
откатывает изменения AEP. Установка, credentials и origins сохраняются.

Нужен штатный механизм Core и кнопка панели. Finisher может быть отдельным
package-owned процессом того же runtime, запущенным owner после durable intent;
он продолжает только тот же reset ID. При необходимости AE restart он показывает
конкретное действие и ждёт, не убивает AE и не уничтожает несохранённую работу.
Обычный idle reset не требует restart AE. Потеря helper/owner должна оставлять
восстановимый закрытый сброс, без ручного удаления locks и без нового replay.
Старый browser latch остаётся под прежним session key; новый dispatcher выбирает
session ID только после проверки MAC и installation/package bindings.

## Вопросы

1. Достаточен ли такой archive/new-session путь, какие конкретные barrier proofs
   нужны для queued-unsent и delivered/UNKNOWN? Проверь поздний poll и callback.
2. Где возможна частичная разблокировка при crash между stop, archive и publish?
   Предложи минимальную forward-only схему и адресные fault cases.
3. Как отозвать старые clients/proposals/grants и browser latch, не подменяя
   UNKNOWN и не выдавая новый session ID за project continuity/AE authority?
4. Какие внешние/shared resource fences нельзя архивировать вместе со своим
   сеансом? Где нужен явный отказ либо сохранение ограничения новой работе?
5. Есть ли меньший безопасный срез в текущей композиции? Сравни с append-only
   abandonment markers в прежних журналах; не предлагай новый transport/framework.
   Дай конечную минимальную матрицу component/integration/installed приёмки.

## Формат ответа и границы

Верни IDs/base и plan/request digests из manifest, перечень прочитанного и
пропущенного, verdict go/revise/stop/insufficient-evidence. На finding: ID,
P0–P3, сценарий, конкретный path:line или отмеченная гипотеза, уверенность и
минимальная локальная проверка. Отдели дефект от упрощения и отсутствующего
live evidence. Не угадывай непереданные функции и не требуй полного нового
аудита/повторного Argon review после локальных fixes.

Не возвращаться к Titles/Slideshow, SDK, другому transport, общему project
lifecycle detector, AI providers или двухмашинной приёмке. Review не выдаёт
runtime authority. Рекомендации проверяются владельцем локально.

Данные: INTERNAL source/план, PUBLIC архитектурные понятия. Личные пути,
учётные записи, credentials, runtime state, пользовательские AEP/assets и полные
логи исключены. Ограничения intentional: фрагменты кода и план, без full code
audit, live наблюдений и future implementation. Состав и размеры — в manifest.
