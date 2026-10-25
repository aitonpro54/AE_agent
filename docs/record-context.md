# Контекст сохраняемой evidence

`ae-agent.record-context.v1` — небольшой описательный слой нового `ae-agent-plan-run-record.v1`. Он не является capability, scope исполнения или условием startup/admission. Envelope integrity сохраняется прежним механизмом `plan-run-records`.

Поля: `purpose` (`user_work`, `development`, `technical_check`), соответствующий `lifetime` (`work_context`, `product_change`, `ephemeral_check`), явный `contextId`, `project.file` и массив `resources` с `kind` (`project`, `output`, `job`, `native_process`) и точной `identity`. Lifetime описывает назначение evidence; автоматического удаления или истечения runtime authority он не задаёт.

Обычный typed runner при отсутствии описательного `options.recordContext` явно выбирает `user_work/work_context`, связывает context с данным run и проектом. Это default данного ingress, а не вывод из каталога или имени инструмента. Engineering/проверки передают свой purpose/context/resources явно. Metadata не расширяет публичные tool schemas и не выдаёт право запуска. Record с purpose `development` сохраняет те же proposal, manual/raw/save, checkpoint и UNKNOWN gates.

Старые records читаются без переписывания; отсутствие metadata проецируется только как `unclassified/unclassified`. Нельзя угадывать назначение архива или импортировать terminal results как текущую authority. Полные старые рабочие/native/bootstrap/recovery журналы остаются legacy. Core сохраняет действующие ownership/revisions/lifecycle/preference/checkpoints и адресные ограничения реально общих ресурсов. Совпадение исторического UUID само по себе не блокирует независимую правку, новый UUID не обходит reservation или потенциальный неразрешённый эффект.

Рабочие заказы не требуют продуктового milestone/commit. При обнаружении дефекта инструмента исполнитель обозначает отдельный engineering block со scope, изменениями, relevant verification и продуктовым решением. Прекращение чата, изменение ТЗ, ручная доработка и обычная рабочая проблема не превращаются автоматически в архитектуру или startup condition.
