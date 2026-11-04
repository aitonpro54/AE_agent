# Перенос Core между MSI и десктопом принят

Проверки 4 ноября 2026; итог оформлен 5 ноября. **P1–P8 закрыты для выбранного manual/owner Core и двух проверенных машин.** [Машиночитаемый отчёт](evidence/core-portability-final-two-host-result-20261104.json). Полный release не заявляется; Titles/Slideshow остаются на паузе.

## Что подтверждено

| Параметр | MSI | DESKTOP-32974QF |
| --- | --- | --- |
| Пакет / установщик | 1f8c… / 18f247… | те же хеши |
| Состав | 80 runtime, 98 standalone, 7 CEP | тот же переносимый состав |
| AE / Node | 26.3x87 / 24.15.0 | 26.3x87 / 24.15.0 |
| Подтверждённый Origin | `file://`, connected | `file://`, connected |
| Финальное чтение AE | собственный сохранённый AEP, 1 элемент | пустой проект, 0 элементов |
| Журнал | 11→13, прежний prefix точен | 3→5, прежний prefix точен |
| Сохранность | ledger/AEP, 29 файлов настроек и1755 прежних файлов | ledger отсутствует;39 файлов настроек,221 прежний файл иlegacy сохранены |
| Управление | освобождено, pending/UNKNOWN/fault0 | то же |

[MSI evidence](evidence/core-portability-msi-origin-native-20261104.json), [desktop evidence](evidence/core-portability-desktop-origin-native-20261104.json). Это зафиксированные checkpoints; новые live-действия всегда требуют свежей проверки цели и состояния.

## P1–P8

| Gate | Итог | Проверенный предел |
| --- | --- | --- |
| P1 | PASS | Одинаковый переносимый пакет, независимые локальные установки и credentials. |
| P2 | PASS | Реальные среды, configured MCP/CEP/AE и literal Origin обоих хостов. |
| P3 | PASS | Desktop→MSI: инженерная дельта получена, штатная установка и native-чтение подтверждены. |
| P4 | PASS | MSI→desktop: последующая дельта получена, установлена и проверена тем же путём. |
| P5 | PASS | Настоящий повтор прежнего пакета9157, следующий перенос/applya88c и финальное подключение1f8c с сохранением состояния. |
| P6 | PASS в scope | Разделение authority, no-replay и fences в адресных source/TEMP проверках; независимые local installations. |
| P7 | PASS | Commits, decisions, review/evidence и точные raw-логи доступны с двух сторон. |
| P8 | PASS | Сводный отчёт с привязками двух реальных хостов и ограничениями. |

Промежуточная CDF-инкарнация после9157 не запускалась: её disk read-back подтверждён, а финальный configured native proof относится только к1f8c. Цепочка descriptor→a88c→9157→initial сохранена. [Repeat evidence](evidence/core-portability-p5-repeat-20261104.json), [successor installation](evidence/core-portability-desktop-origin-installed-20261104.json).

Независимый read-only review принял закрытие прежних пробелов P2/P5 и достаточность доказательств; [решение и границы review](evidence/core-portability-final-review-20261105.json).

## Manifest и продолжение

[Release-manifest](core-release-manifest-20261103.json): **69/71 current PASS**,36 exact reuse+33 свежих полных named checks; остаются только2 dedicated Titles под hold. Исходный setup-отказ exact-f548 и исторические неудачные batches сохранены; они не переобъявлены успешными. [Индекс перенесённых исторических логов](evidence/core-portability-reuse-logs-20261104.json). Новых тестов ради итогового отчёта нет.

Штатный следующий перенос: выбранный commit через Git → сборка manual/owner и verifiers/dry-run → при изменении runtime официальный stop/update/inspect/enable → свежий configured client и собственная CEP → contract/acquire/одна typed inspection/release → адресные evidence/manifest. Уже совпадающий verified runtime не требует лишней переустановки. Старые transaction IDs и UNKNOWN не повторяются. AppData, descriptors, credentials и живое состояние другой машины не копируются.

Ручных правок конфигурации при проверенных переносах — **0**. После смены пакета требуется штатный reconnect Codex; полностью фоновое пересоздание его службы без возобновления чата не доказано. Новые и изменяемые модули сохраняют [постоянный контракт переносимости](portability.md#новые-модули-и-последующие-версии) и получают необходимые проверки изменившихся границ.

Облако, перенос пользовательских AEP/assets/общих outputs и distributed lock не входят в этот результат. Read-only proof не даёт mutation authority или continuity. [Прежний ограниченный отчёт](core-portability-two-host-result-20261104.md) сохранён как история до закрытия P2/P5.
