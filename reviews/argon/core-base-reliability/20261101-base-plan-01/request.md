# Argon: минимальный план доводки базы AE Core

Review ID: 20261101-base-plan-01. Stage: core-base-reliability. Type: plan.
Base: 6fcee4cdd213759e6e1f351657b19f6b919f15df.

## Поручение

Пользователь оставляет Titles/Slideshow на паузе, хочет довести подключение,
восстановление и диагностику Core с ограничением времени, проверок и расхода
контекста. Сначала исследовать известные MCP и возможное переиспользование.
Отслеживание смены проекта исследовать отдельно, пока без реализации.
Нужна одна консультация по минимальному плану базы; сравнительный research
готовых решений отдельно заказан в другом диалоге, не дублируй большой каталог.

## Наблюдаемая база

Собственный локальный Node Core: тонкие stdio MCP clients, один общий owner,
аутентифицированный local IPC, один controller lease; CEP панель связывает Core
с ExtendScript в AE. Есть generic module discovery/inspect/build/propose/dry-run/run,
журнал begin/complete, сохранение UNKNOWN и запрет автоматического повтора mutation.
Установленный первый status после restart клиента и чтение проекта работали.
Некоторые owner recovery/stop/update/re-adoption переходы проверены реально.
Это не полная приёмка всех ordinary cycles и не доказанный survival owner через
каждый restart приложения. Подтверждённого native изменения Titles пока нет.

Текущий Titles отказ на недоступном цвете — предметный разрыв. Он не должен
блокировать базовые connection tests. Source tests не являются native proof.
CEP reconnect ограничен окном ожидания, затем нужен Connect. Смена AE процесса
требует проверенной локальной перепривязки. Надёжный automatic project lifecycle
недоступен; manual current-target policy требует повторной проверки и native confirm.

Локальный source inventory: http-peer завершает известный read rejection и
сохраняет его код; Broker распознаёт terminal read failure, но выбрасывает ошибку;
attachment-owner перехватывает любое invoke exception как owner_outcome_uncertain.
Это кандидат на узкое исправление, а не причина раскрывать любые exceptions.
Потеря attachment между двумя вызовами наблюдалась ранее; причина не установлена.

## Предлагаемый план

1. Сравнить reuse/adapt/replace до реализации и явно учесть migration cost.
2. Исправить классификацию доказанного terminal read failure, сохранив UNKNOWN.
3. Закрыть конечную read-only матрицу: first status/idle, второй клиент/detach,
   CEP absent/ready, idle disconnect/reconnect, known rejection, timeout/no replay,
   dead-owner/stale-client объяснимое восстановление. Переиспользовать evidence
   неизменных closures; не запускать все suites и не чинить Titles.
4. Отдельно выяснить feasibility same-path open/revert/replacement в AE.
5. Позднее отдельная минимальная native mutation для проверки её исходов;
   чтение проекта не объявлять proof mutation recovery.

## Вопросы

1. Как сократить план ещё, сохранив пользовательскую надёжность? Что можно убрать
   или отложить, и какие обязательные гарантии мы сами неоправданно усложнили?
2. Какие готовые механизмы официального MCP/SDK или desktop MCP стоит проверить
   прежде своего кода? Различай протокол, transport supervisor и AE semantics.
3. Как минимально и надёжно различить completed read rejection и uncertain на
   owner boundary? Какие 2–4 регрессии действительно нужны, без большого test matrix?
4. Какое reconnect поведение даёт лучший UX без повторения side effects?
5. Какие условия достаточно выполнить, чтобы объявить базу готовой для модулей?
6. Как ограничить исследование project lifecycle, не обещая polling надёжность
   для same-path replacement и не начиная большой SDK проект?

## Границы и данные

INTERNAL sanitised architecture summary + PUBLIC links в отдельном сравнении.
Нет исходных пользовательских AEP, credentials, логов, личных paths, runtime state
или исходников. Передан авторский summary, не полный code audit; конкретные
ошибки кода требуют локальной проверки. Тестов, live операций, установки и
ослабления guards этот review не разрешает. Второго fix/result review нет.

Ответ по-русски: verdict, минимальная последовательность, findings с confidence,
что ещё не доказано, ссылки на первичные источники для внешних утверждений.
Привяжи ответ к Review ID/Base; не утверждай, что пересчитал неполученные hashes.
