# Проверка пакета

## Итог

Получен и локально разобран единственный ответ Argon: **go**, два P3;
F-01/F-02a/F-02b учтены в `decisions.md`.1upload/1send/0retries.
Root проверил хеши request/manifest/bundle/response, все15embedded files и
строковые bindings; результат — `local-verification.json`.
Response20645bytes, SHA-256
`b8a629433fe0c9d305df5e6b7d3ad7fcf7d40c0ca4707dcf692a8773091b5521`.
Runtime code после reviewed commit не менялся. Request/manifest/bundle/raw response
сохранены неизменными. Документальные уточнения не требуют нового Argon review.
Для точных payload excerpts, embedded diff и raw response scoped `.gitattributes`
сохраняет bytes и не исправляет цитируемые пробелы: начальный staged whitespace
check обнаружил их, нормализация изменила бы разрешённые/полученные hashes.
Project source и редактируемые документы сохраняют обычную whitespace-проверку.

## Подготовка до отправки — историческая запись

Пакет готов к ревью, не отправлен. Snapshot e6cde7c1f061763b6d0008162580039d2717aeb7.

Все15embedded files прочитаны по explicit allowlist, размеры/SHA проверяются перед передачей. Bundle132341bytes, SHA-256 2898a50929add26eaf6e232ac89e085c665b82e8a21a1c04b70b28d5341b3da2. Request 7447b03006b9e0db4e55e7b50e1d6f7273ca6e90c0d98243f6159b570fa255f3; manifest 8178776344b83ce542db9489b321eb1b4a8fafdf5db2c2018f6a0b9e269bba36.

Bundled build_bundle.py использован для initial assembly/scanner. Его draft оставлен локально: false-positive generic_secret на crypto.randomBytes и phone_like на hashes/date/durations разобраны вручную; никаких настоящих secrets/PII не обнаружено, redactions0. Итоговый bundle заново составлен из всей allowlist, включая ошибочно пропущенный сканером installer excerpt. Draft не передаётся и не объявляется COMPLETE.

Неизвестных пропусков нет. Известные scope/live пробелы в request/manifest. На передачу только bundle.md; approval/receipt/state/raw logs не входят.
