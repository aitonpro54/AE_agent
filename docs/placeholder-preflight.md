# Preflight одного плейсхолдера

`build_placeholder_plan` строит локальный typed plan из свежих результатов
`get_comp_details`, `get_layer_details` и точного project item read-back. Он не
вызывает модель и не обращается к AE. Вход содержит `rootComp`, `targetComp`,
маршрут вложенных comp-слоёв `route`, `targetLayer`, новый `sourceItem`,
`rootRange` и `sourceRange` в секундах. Все comp, layer и source IDs должны
принадлежать одному текущему проекту. Нельзя выводить ID из имени или позиции.
В `targetLayer.sourceItemId` передаётся `get_layer_details.layer.source.itemId`;
в route `childCompItemId` — `source.itemId` вложенного comp-слоя. Точный
`find_project_items` даёт `itemId`, `duration` и `frameRate` нового source.

Ограниченный контракт: одна цель; максимум четыре уровня вложенности; частота
кадров root/target одинакова; route и target layer имеют stretch=100, выключенный
time remap и явные in/out. Времена должны попадать на границы кадров. Маршрут
преобразует root time в local comp time как `local = parent - startTime` на
каждом уровне. Длительность диапазона исходника должна совпасть с локальной.
При отличающемся stretch, time remap, смещении частоты кадров, недоступном ID,
заблокированном слое или неясном маршруте builder возвращает `ok:false`.

План содержит `replace_layer_source`, затем `set_layer_time_range`, затем
`get_layer_details`. В двух мутациях перед началом undo group проверяются
ожидаемые comp/layer/source IDs; замена также проверяет прежний source ID и
точные comp/source имена. Эти проверки откажут при изменившейся цели.
`expectedReadBack` задаёт итоговые source ID, start/in/out и оба временных
диапазона. После выполнения плана заново вызовите `get_layer_details` для той же
цели и передайте его полный ответ как `observed`, а `expectedReadBack` как
`expected` в `verify_placeholder_read_back`. Локальный verifier требует совпадения
comp/layer/source ID и имён, частоты кадров, stretch/time remap и времени с
допуском ¼ кадра. `needs_review` блокирует признание результата успешным.
Он проверяет конечный слой, но не подтверждает маршрут вложенности или визуальный
состав кадра: маршрут инспектируйте отдельно и визуально проверьте адресные кадры
в AE. Само наличие шага read-back в плане не заменяет независимую проверку.

Перед мутацией снова прочитайте текущий проект и цели, передайте готовый plan
в `propose_ai_agent_plan`, выполните dry-run и обычный CEP confirmation/read-back
flow. Raw JSX, direct mutation и save имеют прежние gates. Offline smoke
проверяет контракт и изолированный daemon, но не доказывает live AE результат.
