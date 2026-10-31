# Работа с Titles 0.1 через существующий controller

Этот файл — инструкция оператору. Сам CLI выполняет только compile/prepare-build.
Пакет не запускает второй Broker, не подключается к CEP и не управляет AE.

1. Требуется уже сохранённый открытый AEP, существующие comp/layer IDs и буквальное
   совпадение `projectId` с `app.project.file.fsName`. Несохранённый пустой проект
   не подходит; пример `C:/example/film.aep` — placeholder, отправлять его как есть
   нельзя. Сохранение проекта не входит в пакет. Зафиксировать рабочий заказ,
   точную цель и желаемый текст в job JSON. Запустить
   `compile --job FILE`, проверить preview и literal text. Один job — один слой.
2. Единственный действующий Core MCP controller проверяет своё подключение,
   unresolved/pending и доступный module catalog по актуальным проектным gates.
   В owner composition сначала получить `controller_acquire` с пустым payload,
   затем выполнить `core_connect` и проверить `available:true`. Подключённая CEP
   сама по себе не устанавливает транспорт Broker для Titles. Удерживать lease
   через штатный `controller_renew` в пределах его срока; после release/acquire
   заново получить inspection/build/proposal refs текущего поколения.
   Получить свежий `get_module_contract` с
   `payload:{moduleId:"titles-current-target"}`. Сохранить только JSON результата.
3. Тем же controller вызвать `inspect_module_target` с
   `payload:{moduleId:"titles-current-target",contractId:CURRENT_ID,target:JOB_TARGET}`.
   Inspection должен подтвердить поддержку существующего слоя. Не выдавать
   inspection/preview за подтверждение пользователя. При ручных изменениях цели
   обновить inspection и baseline.
4. Передать эти свежие результаты в
   `prepare-build --job FILE --contract FILE --inspection FILE`. Проверить payload:
   один step, точные target/text/references, `oneStep:true`. При отказе совместимости
   остановить данный build и разобрать конкретное несовпадение; не подставлять pins
   или выдумывать evidence, ожидания, grants и timestamps.
5. Существующий controller вызывает `build_solution_plan` с возвращённым payload.
   Core сам создаёт ожидания из server-owned evidence. Новый taskId возвращает
   сервер; workflowId и описательный contextId сохраняют связь с job. Не передавать
   заранее выдуманный taskId для обхода owner refs. Далее controller ведёт
   `propose_plan` → `dry_run_plan` → разрешённый `run_plan` по действующим gates.
   Пятисекундная свежесть dry-run проверяется Core перед отправкой. Native
   confirmation текущей совпадающей цели остаётся внутри mutate; ручное
   подтверждение не означает automatic lifecycle/continuity прежней incarnation.
6. Проверить server receipt/read-back и точный target/text. При UNKNOWN/timeout
   сначала установить фактическое состояние через штатный controller/reconciliation;
   не повторять mutation из compiler, не менять identity для обхода fences.
   Save, raw JSX и destructive остаются отдельными gates и не входят в Titles 0.1.

Внешние JSON — недоверенные данные. Ни прохождение `prepare-build`, ни наличие
`synthetic:false` в файле не доказывают свежесть/подлинность server evidence или
авторизацию исполнения. Удаление папки Titles не удаляет state Core и не отменяет
уже отправленную команду. Собственные runtime receipts/state продукт не хранит.
