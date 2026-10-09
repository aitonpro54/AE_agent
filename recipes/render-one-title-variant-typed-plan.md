# Один вариант титра через native Render Queue

Найти решение `render-one-title-variant-typed-plan` и прочитать
`docs/title-variant-render.md`. Использовать одну общую text comp и явные группы
text layer IDs; не создавать отдельную precomp для каждого титра.

Получить `inspect_title_variants`: exact saved project, root/variant IDs,
controlled IDs, варианты и уникальные MOV/AVI имена. Если очередь пуста, явно
подготовить template carrier через защищённый `add_comp_to_render_queue` и
повторить инспекцию. Read tool сам не меняет очередь.

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
AME mode, alpha/DXV High, художественное качество и media integrity не проверены.
