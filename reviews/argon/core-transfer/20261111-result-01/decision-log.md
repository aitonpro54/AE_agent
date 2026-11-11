# Локальный разбор Argon и кросс-проверка Astra

Одна разрешённая отправка, Aiton / 4 Argon, режим «Задача».
Отдельного effort selector в этом режиме нет; максимальное усилие не заявляется.
Payload bundle `5600ae493b70d369a3cac1478a7cd5a8246174e081d2a8b0af7351d627134abd`.
Исходный ответ и повторно открытый текст совпали:
`a1b1fdca5f2989ab60ce4ddd4437cb5503e7021b6e83a26285c1e3ff4b4a26ee`.
Полный ответ сохранён без изменений. Argon заявил чтение 9/9 файлов без обрезки;
независимое доказательство полного чтения моделью отсутствует.
Два UI-снимка содержат боковой список других чатов и сохранены только локально,
без публикации в Git. Их исходные hashes и пути указаны в ui-evidence-local.json.

Вердикт Argon: **go** по identity, с F01–F03, гипотезой H01 и пробелом G01.
Это внешний анализ точного снимка `1cb25357…`, не разрешение на execution.
Исчезновение/возврат исторических файлов review не устанавливает.

## Решения после независимой проверки Astra

| ID | Локальное решение | Действие |
| --- | --- | --- |
| F-425-01, P2 | Подтверждено: старые descriptor/config staging обнаруживаются после записи или перемещения CEP при rollback | Preflight точных .next/.core4-next/.rollback, повтор под lease и перед switch; разрешать только закреплённые собственные staging |
| F-425-02, P3 | Подтверждено для CEP root: dangling link скрыт existsSync, корень snapshot не проверен lstat | entryExists и plain canonical directory check корня snapshot; отказ до identity |
| F-425-03, P3 | Подтверждено при изменении config во время acquire, до writes=true | Удалять только собственные всё ещё совпадающие пустые broker/production/state, нерекурсивно и пока install gate удержан; сохранять прежние/заменённые/заполненные каталоги, retained и post-write состояние |
| H-425-01 | Отбрасывание custom Core keys подтверждено как прежнее поведение; право перезаписывать всю таблицу не закреплено | Отклонять неизвестные managed keys до записи; env/cwd не поддерживаются. Файл и соседние таблицы сохраняются |
| G-425-01 | Вне allowlist Argon; закрывается локально | client-entry, client-stdio и package-capability принимают/сообщают 4.2.5; hashes и scoped tests закрепляются в release evidence |

## Локальная совместимость вне внешнего snapshot

Полный native-read-recovery выявил прежний поддержанный preferences-only config:
после успешного IPC fixture сохраняет только enabled=false и повторяет update.
Строгая проверка обязательных command/args ошибочно отказывала. Coherent existing
descriptor/origins/CEP позволяют вывести binding и сохранить preferences, если
**оба** command/args отсутствуют. Частичная/чужая binding отказывает; virgin
managed header по-прежнему запрещает initial. Исходный native fixture сохраняется.

Изменения после immutable Argon snapshot проверяются локально. Повторное
обращение к Argon не назначается; payload/request/manifest не редактируются.
Реализация поручена ae_implementer, финальная независимая проверка — Astra.
Итоговый код принят Astra: installer 99f7e7b4…, lease eaddb6fa…, owner tests
224bc697…. [Точное заключение](../../../astra/core-transfer/20261111/review-post-triage.md).
Семь адресных групп и boundaries 88 PASS у исполнителя; свежая полная selection
по затронутым paths запущена на этих bytes. Полные результаты и package hashes
фиксируются после её завершения.
