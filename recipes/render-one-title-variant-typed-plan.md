# Один вариант титра через native Render Queue

Найти решение `render-one-title-variant-typed-plan` и прочитать
`docs/title-variant-render.md`. Использовать одну общую text comp и явные группы
text layer IDs; не создавать отдельную precomp для каждого титра.

Получить `inspect_title_variants`: exact saved project, root/variant IDs,
controlled IDs, варианты и уникальные MOV/AVI имена. Если очередь пуста, явно
подготовить template carrier через защищённый `add_comp_to_render_queue` и
повторить инспекцию. Read tool сам не меняет очередь.

Прямой ALPHA matte у controlled text допускается только с точным stable producer
layer в той же comp и source `CompItem`. Producer остаётся noncontrolled,
выключенная matte не включается, отдельный видимый фон с тем же source не меняется.
В reachable фоновых comps допускается immutable AV footage consumer с прямым
ALPHA producer на source comp, с той же проверкой точного owner/layer linkage.
Несколько consumers и повторные comp visits не дублируют dependency. Прежде
допустимые footage/shape matte producers вне controlled text сохраняют прежний
snapshot без новых ограничений.
При наличии таких связей `matteDependencies` автоматически входят в snapshot/hash
и сверяются после render/restoration и независимым durable read-back. Другие matte
types, цепочки, unsupported/incomplete definitions и drift блокируют success;
matte/masks/timing/transform не записываются. Ручные CEP gates остаются обязательными.

Для каждого варианта отдельно: project-matched checkpoint/edit session, свежий
state hash, один typed `render_one_title_variant` с active subset, точными
шаблонами и целочисленным frame range. Новый manual CEP proposal → current
successful dry-run → explicit CEP confirmation. Добавить независимый
`inspect_title_variants` с result binding `attemptId` из `renderReceipt.attemptId`.
Server автоматически проверяет независимый read-back и opaque authorization.
Dedicated `build_solution_plan` builder для этой recipe не реализован;
составить обычный typed plan и отправить через `propose_ai_agent_plan`.

При timeout/unknown: `reconcile_plan_run` и exact attempt inspection, без retry.
Только bound native DONE + restored state receipt доказывает completion.
Reservation навсегда исключает повторное использование output; новый output
сам по себе не разрешает повтор после неизвестной доставки по рабочему правилу.
Сначала сверить AE. Модуль блокирует ту же canonical destination/attempt;
глобальная блокировка других filename не реализована, поэтому не обходить unknown
сменой filename при подготовке следующего proposal.
Формат `DXV 3` разрешён только при фактическом `Format` и требует `.mov`.
Preset DXV High, alpha, художественное качество и media integrity отдельно
не проверены; их подтверждает только проверка фактического preset, медиа и кадра.
