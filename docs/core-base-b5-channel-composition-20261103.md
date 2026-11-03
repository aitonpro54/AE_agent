# B5 — составная проверка доставки и позднего callback

3 ноября 2026. База после B1–B4; исходный commit `8d2593a`.
Пользователь подтвердил продолжение доводки базы: доставка, поздние ответы и
recovery. Titles/Slideshow и MCP/Codex maintenance остаются отложенными.

В B3b1 HTTP fence и callback dispatcher уже проверены отдельно. Этот срез
соединяет production `http-peer.js`, durable TEMP completion store и production
`poll-dispatcher.js` в одном сценарии. HTTP, HMAC и файловый журнал настоящие;
`evalScript`, AE observation и замена session задаются тестовой VM.

## Progress

Добавлены две проверки в `core4/test/start-over-channel.test.js`:

1. Доставленная через authenticated `/poll` команда остаётся в старом receiver.
   После fence дальнейшая выдача закрыта, новый dispatcher не обходит pending
   callback. Ответ до таймаута даёт только старую пару begin/complete и one-shot
   observation proof старой session; duplicate completion не добавляет events.
2. После реального HTTP timeout поздний VM callback получает
   `unknown_no_promotion`. Старый latch сохраняет результат под старым ключом.
   Свежий TEMP receiver отклоняет старый completion даже с корректным MAC своего
   канала (`completion_correlation`), затем завершает только свою новую команду.
   Старый UNKNOWN journal сохраняется побайтно.

Production defect не воспроизведён, runtime и CEP assets не изменялись.
Новый package/install для test-only изменения не нужен.

## Decision Log

- Это дополнительная проверка B3, а не реализация нового reset или транспорта.
- Два независимых TEMP receiver моделируют замену session. Тест не исполняет
  finisher/archive/publish и не доказывает прекращение живого AE.
- Нативные delivery/late callback, recovery принятой mutation, configured B4,
  full release и desktop–MSI round-trip остаются отдельными открытыми границами.
- Первоначальный прогон не принят: тест передал VM object напрямую в Node
  canonical validator. Исправлена тестовая JSON serialization boundary, которая
  соответствует реальному panel fetch. Production validator не ослаблялся.

## Validation

`validate-diff.js core4/test/start-over-channel.test.js --run`: один selected
check / 14 fresh cases PASS, включая две новые проверки. Exact evidence key
перепроверен после последнего прогона. Syntax и 55 boundaries PASS, native calls0.
`lifecycle-simulation` указан selector как deferred, его новый PASS не заявлен.
История и hashes — [evidence](evidence/core-base-b5-channel-composition-20261103.json).

Следующий шаг по подтверждённому scope: свежий штатный Core/CEP preflight,
затем ограниченный сценарий доставки/позднего ответа на собственном test AEP.
MCP/Codex restart/config не выполнять; settled transactions не повторять.
