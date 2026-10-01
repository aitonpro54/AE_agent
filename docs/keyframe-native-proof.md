# Native доказательство easing и HOLD

`apply_keyframe_ease` принимает положительные целочисленные keyIndices. HOLD
применяется без temporal ease; значения, времена и количество ключей сохраняются.
Все выбранные индексы проверяются до первой записи. Ответ содержит native before/
after, numeric interpolation enums и validity; несоответствие возвращает ошибку.

В server-proposed план после setter добавляйте `get_property_value` по свежим
stable comp/layer IDs и точному property path. Семантический PASS требует
самих native ключей и независимого чтения той же цели. Echo interpolation и
количество keyIndices не подтверждают применение. Для HOLD полезно отдельно
прочитать значение между ключами и просмотреть кадры после изменения кропа.

Live run19c ранее сообщил HOLD при фактическом LINEAR. Его receipt сохранён;
новая offline проверка отвергает оба прежних PASS. Точная причина native отказа
установлена последующим typed чтением выбора enum; гипотеза о temporal ease
не подтвердилась. VM regression проверяет actual generated JSX и no-op,
но не заменяет AE proof. Команда: `npm.cmd run smoke:keyframe-ease`.

Повторная live-проверка безопасно отказала: запрос HOLD выбрал numeric enum
6612, а ключи остались LINEAR. Keyed `get_property_value` теперь возвращает
`interpolationDiagnostics`: native constants, типы/строки, direct HOLD и
conditional probe. Typed native чтение подтвердило: direct HOLD=6614, constants
различаются, но chained conditional с literal `hold` выбирает6612. Selector
заменён явными `if/else`; отдельный explicit branch probe позволяет проверить
выбор до setter. Bounded VM adapter воспроизводит наблюдаемое расхождение,
не считается полноценным ExtendScript compiler или доказательством native fix.

Live run `7283ed96-f660-422e-981b-af6e18682a8e` подтвердил исправление:
Queen2/Metal3 ключа LINEAR6612→HOLD6614, native verification и два независимых
property read-back PASS. Times/values сохранены; samples между ключами дают
постоянные координаты. Кроп проверяется отдельно по фактическим PNG.

`replace_layer_source` также проверяет native source index/ID/name/type/path и
независимое чтение слоя. Индекс источника не сравнивается с его именем. Старые
receipts без stable comp ID не получают PASS из self-reported verification;
фактически завершённую замену проверяйте заново без повторения мутации.
