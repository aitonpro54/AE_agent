# Локальный разбор консультации по базе

1 ноября 2026. Ответ received, 21362 bytes,
SHA256 `d6e0efddae3c60305dca9161eddae05dd554771adcfeccd1b5a858a4c666d85a`.
Один upload/send, без retries. Verdict: Approve with Scope Reduction.
Summary-only, не code review; Review/Stage/Base/Type bindings есть.

| Finding / рекомендация | Локальное решение и evidence |
| --- | --- |
| F-01: blanket catch маскирует terminal read rejection | Принято как B1 defect: attachment-owner invoke catch, Broker.send/http-peer и direct read facade |
| F-02: отличать completed read от uncertain | Принято только для доверенного завершённого read outcome; чистые activity facts сами по себе не proof |
| F-03: причина attachment loss не установлена | Gap принят; telemetry отдельным срезом. Client-owner IPC и CEP peer разные каналы; не смешивать причины |
| F-04: lifecycle недоступен без тяжёлого SDK | Не доказано: отсутствие найденного exact hook не доказывает обязательность/достаточность SDK |
| Полностью отказаться от миграции | Отклонено как окончательный вывод: Kumo, mcpdo и OnePrism требуют оценки совместимости; blanket claim о всех proxies слишком широк |
| Обычный flag / terminal:true как proof | Отклонено: нужен private provenance и finite public projection, не public/serialized флаг |
| Owner закрывает journal при catch | Отклонено: original receiver completion уже сохранён; owner не переписывает исход и не очищает UNKNOWN |
| isError:true для подтверждённого отказа tool | Принято как направление MCP boundary; неизвестные transport outcomes остаются отдельно |
| Ровно четыре проверки, включая два live smoke | Принят ограниченный объём, не фиксированное число: selector/changed closure определяют tests; матрица — inventory evidence |
| Бесконечный reconnect | Требует B2 design: только transient failure, с сохранением Stop/auth fault/fences |
| PID/path handshake снимает attachment loss | Отклонено как выдача управления: observation не восстанавливает controller lease/grant |
| fs.stat/path/dirty/session marker закрывают same-path | Отклонено как continuity proof; current-target — отдельная гарантия |
| Native mutation отдельно от приёмки базы | Принято по user scope; read-only не объявляется mutation recovery |

Следующий срез B1: доверенная классификация завершённого read rejection,
owner/public projection и MCP error. Сначала source brief и validate-diff
без --run. Не добавлять одновременно reconnect, disconnect redesign, provider,
Titles или migration. Нового Argon review нет; runtime пока не менялся.
