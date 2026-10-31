# Независимый source review private core2–4

31 октября 2026. Reviewer: `readoption_slice1_review`, read-only.
Вердикт: **CHANGES REQUIRED**, два P2. Tests/probes/live не запускались.
Основание: четыре exact hashes в `review-freeze-01.json`; immutable source copies
в `review-freeze-01-source/`. Reviewer подтвердил совпадение hashes до/после чтения.
Это review промежуточного source, не приёмка последующих исправлений.

## P2-01 — pre-claim proof не включает старую adoption

Main:67 возвращает certificate-only baseline; transaction:203–207 сравнивает
expected proof с hash этого baseline. Adoption читается отдельно внутри apply.
Inspect → schema-valid byte change либо byte-equal inode replacement → apply со
старым proof могут принять новое состояние за original. Требуется snapshot old
adoption bytes/hash/full stat в общем inspect/apply proof, проверка до записи и
после await. Оба сценария должны отказать без записи.

Writer подтвердил дефект. Root принял correction в текущем scope; normal
certificate brand/generic readers не расширяются.

## P2-02 — claim может опубликовать нечитаемый replay payload

Store:19 допускает old JSON до128KiB; transaction:40–42 принимает JSON/schema
с whitespace. Decoder bytes():22 ограничивает base64 длиной65536. Проверка old
bytes на строке53 происходит после intent publication:216/store:51. Валидная
adoption плюс50000 trailing spaces проходит initial validation, но после claim
readState/inspect/finish отказывают readopt_encoded_bytes; generic readers fenced.
Требуется preclaim проверка encoding и budgets всех frozen replay inputs и
адресный zero-write regression.

## Остальной bounded review

Других конкретных P1/P2/P3 reviewer не нашёл. Статически сохранены private brands,
generic-reader fence, pinned replacement, bounded actor lineage, pre-CAS freshness
и post-CAS settlement без host. Release допускает both→install-only→none;
enable recovery не повторяет CAS. Эти выводы не подменяют crash-matrix tests.

Следующий шаг: scoped source corrections, новые exact hashes, адресные regressions
и независимое чтение исправленного delta. Повторный Argon не выполняется.
