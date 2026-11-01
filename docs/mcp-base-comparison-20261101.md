# Подключение и восстановление: сравнение MCP для базы Core

1 ноября 2026. B0 по [плану базы](../plans/core-base-reliability-20261101.md).
Source baseline Core: `6fcee4cdd213759e6e1f351657b19f6b919f15df`.
Локальный research и разбор двух отдельно заказанных обращений Argon завершены.
Внешние программы не устанавливались и не запускались, live benchmarks нет.

## Что действительно можно переиспользовать

Готовые решения покрывают значительную часть обычного подключения и диагностики.
Нельзя исходить из необходимости писать всю эту базу самостоятельно. Самые
существенные варианты: AE transport без CEP у Kumo/23d1; готовый connection client
и Inspector у MCP; UX reconnect и получения поздних результатов у OnePrism.
Они решают разные слои. Вопрос замены определяется требуемым поведением после
сбоя и ценой адаптации, а не числом tools или декларацией «production-ready».

| Решение | Проверенный механизм | Граница evidence / цена принятия | Первичное решение |
| --- | --- | --- | --- |
| Kumo MCP 0.3.2, MIT, Node >=24 | File IPC, последовательные вызовы, cross-process busy lock; optional resident agent с heartbeat и очередью | Нет CEP для одного AE; потребуется новый host adapter/packaging и проверка timeout/ownership semantics | Главный кандидат альтернативного AE transport; не ставить без отдельного сравнения |
| 23d1 AE MCP, MIT, Node >=18 | JSX dispatch + result-file polling; очередь в одном процессе, пошаговый doctor | Простая поставка без панели; изученный bridge не даёт persistent command reconciliation, temp по умолчанию очищается в finally | Заимствовать диагностику по слоям; полная замена пока не обоснована |
| OnePrism | По документации: backoff reconnect, буфер результатов, late-result lookup, понятные причины refusal | Account/service/plan dependency; исходники и собственная live надёжность не проверены | Сильный образец UX; готовый продукт — отдельная оценка условий/стоимости |
| Официальные MCP SDK / Inspector / mcpdo | Стандартный протокол, диагностика, удержание и восстановление клиентских соединений | Не выполняют сами AE operations и не определяют сохранность AEP; mcpdo experimental | Рассмотреть вместо новых вспомогательных MCP clients/diagnostic harness |
| FastMCP | Готовые client lifecycle, transports, schemas и test composition | Python dependency и миграция Node shell; не готовый AE host adapter | Полезен при новом Python сервисе; сейчас нет доказанного выигрыша от переписывания |

## Первичные источники и существенные различия

### Kumo

Наблюдённый commit `73fea51220c9b2a8a5afbb95e50c37e0ad08e978`, версия 0.3.2.
[README](https://github.com/kumoproductions/mcp-aftereffects/tree/73fea51220c9b2a8a5afbb95e50c37e0ad08e978),
[FileIpcTransport](https://github.com/kumoproductions/mcp-aftereffects/blob/73fea51220c9b2a8a5afbb95e50c37e0ad08e978/src/transport/FileIpcTransport.ts).
Прочитан transport, package metadata и дерево репозитория через GitHub connector.

Две модели: push через запуск dispatcher и pull через resident startup agent.
Запрос/ответ имеют отдельные файлы по ID. Вызовы одного процесса сериализованы;
push использует межпроцессную блокировку. На timeout реализация пытается удалить
ещё не взятый запрос и различает reclaimed / already consumed; для последнего
сохраняет предупреждение, что выполнение может продолжаться. Stale lock снимается
по mtime. Это существенная готовая функциональность, а не только «тонкая обёртка».
Однако wall-clock stale recovery не эквивалентен нашей проверке исхода команды;
корректность удаления request при гонке с reader здесь отдельно не доказана.
Сохранение гарантий при заимствовании потребует адресного сравнения, не переписи
всех capabilities. Сам факт использования файлов не делает transport надёжнее
или менее надёжным, чем CEP.

### 23d1

Наблюдённый commit `be7717314439dda29b64cbba85664f04f737543b`.
[Bridge](https://github.com/23d1/after-effects-mcp/blob/be7717314439dda29b64cbba85664f04f737543b/src/bridge.ts),
[doctor](https://github.com/23d1/after-effects-mcp/blob/be7717314439dda29b64cbba85664f04f737543b/scripts/doctor.mjs).
Bridge сериализует вызовы promise queue, запускает JSX через platform host и
ждёт result.json; очередь продолжает работу и после ошибки. Temp directory
по умолчанию очищается в finally, KEEP_TEMP меняет это поведение. В данном файле
нет нашего механизма долговременного выяснения исхода после restart. Это вывод
о просмотренном bridge, не аудит всего репозитория. Doctor объясняет, на каком
слое оборвалась цепочка. Сам doctor включает выполнение скриптов и рендер;
его нельзя автоматически запускать как безвредный status check. Для Core полезен
его способ подачи диагностики, а не слепое копирование всего тестового сценария.

### OnePrism

[Официальная диагностика соединения](https://oneprism.io/docs/after-effects/support/connection).
Автор описывает reconnect с ожиданием 1–30 секунд, возобновление после wake/network,
до 20 буферизованных результатов и отдельный путь проверки позднего ответа.
Ошибки различают «не отправлено», «занято», «возможно ещё выполняется», отказ
аккаунта и конфликт выбора панели. Это прямо отвечает части наших UX проблем.
Публичные инструкции не доказывают fsync/crash durability или надёжный project
incarnation; account/plan dependency меняет границу локальности. Никакой покупки,
логина, установки и проверки платного сервиса не выполнялось.

### MCP и FastMCP

[MCP 2025-11-25 transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
описывает session/resumption и SSE replay. Это доставка ответа, не повтор AE
операции. Нельзя механически перенести эти правила на новую редакцию:
[MCP 2026-07-28 transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
использует per-request metadata и другую модель cancellation; версии различаются.
Core сейчас объявляет protocolVersion 2024-11-05. Protocol migration должна быть
отдельным обоснованным шагом с проверкой совместимости клиента.

[mcpdo](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/mcpdo)
— experimental companion Inspector, держит named connections в daemon,
повторно соединяется после потери transport и сериализует вызовы одного соединения.
Это готовый вариант для инструментов диагностики и повторного использования
соединения. Он не заменяет AE owner автоматически; Windows/наши extensions/
controller lifecycle compatibility не испытывались.

[FastMCP client](https://gofastmcp.com/clients/client) управляет соединением через
контекст, поддерживает stdio/HTTP/in-memory и negotiation. Добавление Python
ради уже существующего Node owner не выглядит дешёвым исправлением именно
CEP reconnect или outcome classification. Это оценка интеграции, не benchmark.

## Выбор без привязки к уже потраченным усилиям

Уточнение собственного baseline: установленная facade в
`core4/runtime/stdio-entry.js` переопределяет disconnect и возвращает
`disconnected:false` с причиной ownership общего runtime. Поэтому generic
Broker.disconnect не является доказательством работоспособного пользовательского
disconnect в поставке. В B2 необходим отдельный понятный контракт client detach,
controller release и физического link shutdown; сейчас эта UX граница открыта.

1. **Небольшая доводка текущей базы:** кратчайший кандидат для known-read-error
   mapping и ясного status. Не требует изменения AE transport. Оценка стоимости
   предварительная, до frozen diff и validation selection.
2. **Замена MCP оболочки/diagnostic tooling:** использовать готовые SDK/Inspector
   при подтверждённом пробеле протокола. Не переписывать owner/журнал вместе с ней.
3. **Замена AE transport на Kumo-подобный:** потенциально убирает целый CEP lifecycle.
   Достойна рассмотрения; требует одинаковых сценариев timeout/late result,
   нескольких клиентов и restart, плюс сохранения разрешённой области действий.
4. **Переход на готовый продукт:** может быть дешевле разработки, если подходят
   account/cloud/plan и эксплуатационные гарантии. Условия пользователя по этой
   границе ещё не определены; никаких покупок/подключений из research не следует.

Решение: выбрать минимальный диагностический срез B1 без смены transport.
Это не окончательный отказ от готовых решений: Kumo остаётся кандидатом
ограниченного transport experiment; SDK/Inspector — для протокола и диагностики;
OnePrism — образец reconnect/late-result UX. Titles не участвует в проверках.

## Argon

[Консультация по плану](../reviews/argon/core-base-reliability/20261101-base-plan-01/response.txt)
получена: scope reduction. [Локальный разбор](../reviews/argon/core-base-reliability/20261101-base-plan-01/decisions.md)
принимает known-error repair и раздельную mutation приёмку; отклоняет public proof
flags, journal rewrite и необоснованный окончательный отказ от migration.
В [отдельном сравнительном диалоге](https://gemini.google.com/app/09aee013f4e3730a)
получен лишь отказ; содержательного внешнего сравнения нет. Свой research выше
не выдаётся за мнение Argon. По одному send в каждый диалог, повторов0.

## Validation и ограничения

Read-only web/GitHub + локальный source inventory; tests/live calls/install0.
Source snippets от default branch прочитаны рядом с commit metadata; сторонние
проекты не собирались, coverage и timing не измерялись. Исторический research
29 октября не выдаётся за текущий source status. Ответы Argon и локальное решение
по ним добавляются отдельно; автоматического follow-up review нет.
