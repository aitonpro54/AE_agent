# Разбор Argon plan-review: CEP Origin

28 октября 2026. Ответ сохранён без редактирования из видимого DOM-контейнера:
`response.txt`, SHA-256 `df165fdf3be48ca7c1efd5c2bc56b94dbe5dedcbf1405895ee26f19658d1eeeb`.
Root пересчитал digest и сверил `response-meta.json`. Review/stage/type/base,
request SHA и external plan SHA совпали с локальными проверенными привязками.
Рецензент заявил полный просмотр9 context-файлов, но не вычислял SHA/bytes;
это ограничение, не независимая аттестация чтения. UI citation/code labels
сохранены в исходном ответе. Вердикт **go**,5 findings (2P2/3P3).

## Локальная оценка и принятый scope

| Finding | Внешний / локальный приоритет | Статус | Evidence на baseline b42942a | Новизна | Следующий шаг |
| --- | --- | --- | --- | --- | --- |
| CEP-ORIGIN-PLAN-01 | P2 / P2: точность CORS boundary, без доказанного обхода MAC | Подтверждён | `core4/integrations/cep/http-peer.js:26–30,95`: catch отражает null даже при отказе Host, OPTIONS hardcoded null | new относительно известных плановых уточнений; issue registry не заявлен | corsOrigin фиксировать после обоих ingress guards; test wrong Host/Origin без ACAO, OPTIONS для обоих modes |
| CEP-ORIGIN-PLAN-02 | P2 / P2: порядок auth и неизменность peer | Уже учтён, known-open | `http-peer.js:43–54`; шаги2–3 focused плана уже требуют stored-origin binding и guard до sequence; nonce delete расположен до auth | known в плане; уточнение nonce одноразовости | Сохранить one-time consume challenge; сверять origin в /link до role/duplicate-peer; post-link guard до state effects; same-sequence negatives/ACK |
| CEP-ORIGIN-PLAN-03 | P3 / P3: ясность scope, не текущий runtime defect | Уже учтён, known-open | `core4/integrations/cep/peer-protocol.js:6`: exact signed-body schema; `panel.js:8` формирует прежний body | known плановая граница; гипотетическое несовместимое расширение не реализовано | Оставить peer-protocol.js/schema неизменными, Origin в signed body не добавлять |
| CEP-ORIGIN-PLAN-04 | P3 / P3: test instrumentation gap | Подтверждён | `core4/test/installable-runtime.test.js:28–32`: POST/null/JSON.parse/non-headers helper | known техническому source-анализу до внешнего ответа; это не новая продуктовая поломка | Адресно расширить helper либо добавить raw helper для method/headers/204/missing/duplicates |
| CEP-ORIGIN-PLAN-05 | P3 / P3: клиентская проверка нового поля | Уже учтён, known-open | `core4/cep/js/panel.js:13–15`; раздел «Изменение панели» внешнего плана | known-open | Проверять exact challenge.origin до sign/link; VM/WebCrypto/fetch tests допуска/отказа |

Findings приняты для адресной реализации в уже порученном scope. Статусы выше
описывают baseline; «учтён» не означает «исправлен». После фактического patch и
tests добавить отдельный implementation/result record с точными source bindings.
Неподтверждённых новых требований к authority или расширений scope не принято.

## Границы интерпретации

- Проверяется значение Origin, доставленное HTTP-парсером. Тест не должен выдавать
  клиентский TypeError на undefined за отказ сервера. Стандартная обработка HTTP
  OWS парсером не заменяется самодельным HTTP ingress ради упомянутых пробелов.
- Origin не удостоверяет extension. MAC/roles/pins/epochs, physical guard,
  UNKNOWN/no-replay сохраняются. Cross-origin /link может одноразово потребить
  nonce; post-link отказ не меняет peer sequence/lastSeen/pending/ACK.
- Слова внешнего ответа о новых отдельных разрешениях не меняют полномочий:
  source/build/install уже поручены пользователем в соответствующем scope.
  Само review не выдаёт grants, не разрешает raw/save/destructive или новый live
  restart. Root остаётся единственным live-контроллером.
- Текущий baseline Core4 source byte-identical после docs commit `aa16598`.
  Plan-review b42942a применим к этим исходникам по independently checked closure;
  будущий patch получит свой commit/diff и обязательный result-review.
- Приёмка MSI не закрывает P1–P8 переноса десктоп↔MSI. Полный release suite,
  пользовательские AEP/assets, AME и прежний cutover исключены.

## Решение и продолжение

Root принял bounded plan-review и поручил единственному `ae_implementer` source
ownership `core4/**`: minimal HTTP/panel/test repair и адресные проверки. Installed
и runtime не меняются до frozen source/result-review. Root владеет plans, review
records, commit/package/install/read-back и AE/CEP/UI; worker не имеет live scope.
