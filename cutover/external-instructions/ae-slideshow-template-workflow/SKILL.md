---
name: ae-slideshow-template-workflow
description: "AE slideshow/templates: import/order, clone/relink, timing/overlap, audio, ownership и защита source comps. Только для слайд-шоу и шаблонных сборок, не для диагностики подключения CEP."
---

# Слайд-шоу и шаблоны AE

Для legacy `AE_agent` прочти применимый builder/recipe contract. В Core используй только опубликованный `montage-pipeline-plan` contract через `get_plan_builder_contract`; recipes нет. Осмотри затронутые master, event pair,
media leaves, control layer, owner markers и защищённые sources. Работай по
identity/ownership: templates и outputs могут называться одинаково. Не импортируй
шаблон или все media заново ради диагностики.

Используй готовые typed tools/builders и ae-safe-project-automation. Перед записью
проверь весь затронутый mutation tree. Shared dependencies другого owner остаются
read-only. Clone/relink выполняй лишь когда это предусмотрено поручением и
контрактом; сохраняй карту source→duplicate и проверяй вложенные связи, expression
references, duration/in-out, masks, keys и controls, относящиеся к изменению.

Timing учитывает overlap, frame rate, sourceIn, finite footage и звук. Изменение
длительности не разрешает произвольно сдвигать ключи или playback speed. Audio
проверяй по реальным источникам/интервалам: совпадение имён не доказывает дубль,
а отключение дубля не должно оставлять дыру. Не вводи новую аудиополитку из другого
проекта: исходные требования текущего slideshow остаются источником истины.

Не меняй утверждённый стиль/no-template fades/control layer произвольно. Template
loading остаётся additive, custom paths/settings сохраняются. Нечитаемые файлы
перечисли явно; subset допустим только если он сохраняет смысл поручения, и его
нельзя объявить полной сборкой.

Сверь ordering, overlap, границы соседних сцен, source identity, audio и защищённые
объекты. Визуальные/временные изменения проверь на нужных кадрах/интервалах. После
ручной правки принимай актуальную ревизию; stale baseline должен отказать до записи.
Cleanup — отдельный scoped plan по ownership и dependencies.

Не запускай child ради уже готового простого плана. Для делегации смотри
 ae-task-routing. references/slideshow-patterns.md — локальное дополнение,
которого нет в дампе; не заменяй его выдуманной реконструкцией.
