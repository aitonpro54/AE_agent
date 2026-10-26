# Запрос архитектурного review Core 4.0.0

Статус: локальный пакет для чтения. Внешняя отправка и Pro-сеанс не выполнялись. [План и приёмка](core-4.0.0.md) — полный рабочий документ; bundle выбирает только intent, architecture и это краткое задание.

## Цель и известное состояние

Оценить проект минимального независимого Core и optional engine/modules до реализации. Сейчас разрешены только исходное чтение и документы. У прежнего runtime есть исторический UNKNOWN; ACK fix проверен в отдельной repair копии, ещё не опубликован в основной runtime. Разработка новой архитектуры не зависит от завершения старого cutover; будущая live работа зависит от свежего shared-resource reconciliation.

Предложение: один управляемый Core с independent receipts/fences; один on-demand worker; reviewed typed executor bundles отдельно в модулях; стабильный generic MCP и декларативный catalog; pins только выбранной closure. M1 — замена source существующего слоя на уже импортированный still и правка существующего статичного text layer в одном workflow. Photo success сохраняется при titles failure; resume не повторяет photo и сначала сверяет UNKNOWN.

## Границы и приёмка

Не менять реализацию, Git checkout/ветки, установленный runtime, credentials, MCP/CEP, AE-проект, БД или collectors. Не устанавливать Graphify, не регистрировать hooks/skills. Ни предложение, ни review не дают разрешения на эти действия.

M1 проверяет: физическое отсутствие packages при startup; загрузку только выбранных dependencies; catalog refresh без MCP reconnect; byte-identical Core/чужие plan pins при изменении одного модуля; explained diff→checks; photo mutation count=1 после titles recovery; durable receipt при reset/ACK loss; Core status/reset ≤2 s при worker infinite loop; отказ script/forged claims/stale targets до transport; immutable artifact/TOCTOU и crash windows send/ACK/read-back. Это будущие fixture критерии; продуктовые тесты сейчас не запускались.

Аналитика: расширяется существующий исходный fork Codeburn, один collector и один event ledger. Work unit/module/activity — атрибуции existing event IDs; shared usage без выдуманных долей; verified helpers без дублей. Dashboard recovery collector требуется отделить от read-only reporting. Quota относится к аккаунту, API-equivalent не равен деньгам подписки. Сейчас используются только документальные ID bindings, без запуска Codeburn. Graphify — независимый будущий code/AST-only pilot, вне startup и authority выбора tests.

## Privacy classification и allowlist

Содержимое `INTERNAL`. В bundle включены только эта проектная сводка и два design-документа. Runtime/security факты сведены к минимальному описанию `PRODUCTION-SENSITIVE`: UNKNOWN существует и нуждается в адресной сверке. Credentials, auth/config/state, operator records, process/runtime identifiers, пользовательские активы, usage logs/БД и raw transcripts исключены. Персональные paths, thread/helper UUID и исходники внешнего Codeburn не включены в выбранные документы. Локальный manifest генератора может указывать технический корень сборки; файл остаётся локальным до отдельного решения об отправке.

## Вопросы review

1. Сохраняет ли executor admission закрытый typed path при предметном JSX вне Core? Где есть недоказанное доверие к worker/schema/hash?
2. Полны ли reset/crash/UNKNOWN semantics и граница, после которой нельзя обещать отмену или replay?
3. Позволяют ли exact pins и catalog refresh менять один пакет без перепривязки чужого плана и полного рестарта?
4. Достаточно ли fresh step admission и contract bindings для photo→titles partial recovery при ручных edits?
5. Не скрывает ли diff→checks реальных общих зависимостей? Какие конкретные acceptance cases отсутствуют?
6. Что можно упростить в M1, сохранив независимость Core и пользовательские gates?

Нужен краткий verdict, существенные failure modes с конкретной ссылкой/сценарием, необходимые правки и адресные evidence gaps. Отделять архитектурный дефект от ещё не выполненной будущей проверки. Внешний verdict не является user approval или live proof. Если Pro-review состоится позднее, его принятые/отклонённые findings и изменения плана записать отдельным Decision Log до соответствующей реализации.
