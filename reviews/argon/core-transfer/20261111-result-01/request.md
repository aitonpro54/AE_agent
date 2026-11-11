# Кросс-ревью Core 4.2.5: сохранение identity при переносе

review_id: 20261111-transfer-425-result-01
stage_id: core-transfer-admission-425
type: result
base_commit: c34ac23 (контракт и исходное расследование); точные source hashes в manifest.

Проверь общий механизм установки/переноса Core 4.2.5. При частично отсутствующей
прежней установке обычный installer мог принять состояние за чистое начало и
создать вторую identity. На изолированных стендах также воспроизведены origins
без descriptor и settled ledger, добавленный после plan. Исторический писатель
исчезновения/возврата файлов не установлен; не делай выводов о нём из этих тестов.

Исправление различает чистую первую установку, согласованную существующую
установку и orphan/mixed состояние. Проверки идут в plan, под собственным lease
и перед switch. В initial разрешены только собственные gates/prepared/stages/
release; origins публикуются после финальной проверки. Existing descriptor/CEP/
managed MCP binding сверяются; отсутствие Core entry в новом workspace допустимо.
Initial rollback сохраняет origins, последующий обычный reapply отказывает.
Новая recovery authority, tombstone, перенос credentials/state не добавляются.

Вопросы:
1. Есть ли сценарий второй identity или потери predecessor, который проходит guards?
2. Достаточны ли CAS, allowlist собственных файлов и порядок публикации при
   изменении state после plan и сбоях? Не ослаблены ли gates repeat/update/rollback?
3. Сохранены ли штатные first install, новый workspace, quoted TOML/preferences,
   legacy соседние записи и совместимость прежних пакетов?
4. Попадает ли исправленный installer в standalone closure и принимается ли
   версия 4.2.5 всеми затронутыми readers? Какие адресные регрессии ещё нужны?

Классификация: INTERNAL — исходники, синтетические тесты и краткое описание
дефекта для разрешённого пользователем ревью. PRODUCTION-SENSITIVE сведено к логической причине, без реальных
identity, state или командных журналов. Секреты, credentials, .env, backup/state,
AEP/assets, настройки, browser/account данные и полные rollouts исключены.
Состав ограничен manifest allowlist. Это адресный review, не полный аудит Core;
runtime authority и native/product acceptance не выводятся из offline tests.

Верни review_id/stage_id, source hashes из manifest, прочитанные/пропущенные файлы
и обрезку. Verdict go/revise/stop/insufficient-evidence. Для каждого finding дай
ID, P0–P3, сценарий, файл/строку, уверенность и минимальную проверку. Отдели
подтверждённый дефект от гипотезы и пробела evidence. Не выполняй команды и не
расширяй scope. Ответ будет проверен локально; автоматического повторного review нет.
