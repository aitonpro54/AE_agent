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
до live проверки исправления не установлена; взаимодействие с temporal ease
остаётся гипотезой. VM regression проверяет actual generated JSX и no-op,
но не заменяет AE proof. Команда: `npm.cmd run smoke:keyframe-ease`.

Повторная live-проверка безопасно отказала: запрос HOLD выбрал numeric enum
6612, а ключи остались LINEAR. Keyed `get_property_value` теперь возвращает
`interpolationDiagnostics`: native constants, типы/строки, direct HOLD и
conditional probe. Это только чтение для установления причины до следующей записи.

`replace_layer_source` также проверяет native source index/ID/name/type/path и
независимое чтение слоя. Индекс источника не сравнивается с его именем. Старые
receipts без stable comp ID не получают PASS из self-reported verification;
фактически завершённую замену проверяйте заново без повторения мутации.
