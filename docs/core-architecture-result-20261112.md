# Core 4.2.6: результат архитектурного укрепления

12 ноября 2026. Каркас Core сохранён: внешний продукт готовит данные, Broker
проверяет намерение и authority, transport/CEP исполняют допущенный код и
возвращают исходное доказательство. Полная перепись и универсальный plugin ABI
для этих изменений не понадобились.

| Граница | Итоговое поведение |
| --- | --- |
| Завершение | Lower close разделяет одну cleanup promise между callers; stdio закрывает доступ до первого await, Broker lease освобождается после peer cleanup |
| Registry bootstrap | Exact bound registry_refresh_failed доходит до диагностики; latch, UNKNOWN и запрет автоматического повторного eval сохраняются |
| Builder input | Schema-valid optional поле нельзя добавить сверх desired и expectedBindings |
| Composition | Pure spec отделён от запуска; ранний builtin verifier и own-root проверка предшествуют импорту helper |
| Catalog revision | Identity учитывает полный выбранный состав, pins, engine, порядок, profiles и capabilities; старые revisions читаются opaque |
| Версии | Закрытая feature table сохраняет прежние version/format пары; 4.2.6 требует registry identity, незнакомая версия отклоняется |
| Profiles | Новый reviewed module переиспользует owned-text-layer-v1 через штатный selector/proof/HTTP route; fixed identity profiles и operator effects не расширяются |
| Tooling | Source snapshot использует repository shim; flattened standalone/native-read operator получают отдельные trusted pure bytes из OWN source, candidate остаётся данными |

Минимальная inline/spec дубликация остаётся намеренной границей bootstrap.
Parity tests связывают интерпретацию; проверка чужого target tree не удостоверяет
соседний helper исполняемого source tree. Новый helper не получает missing-file
fallback. Подробности: [bootstrap contract](core-composition-bootstrap-contract-20261112.md),
[version/profile matrix](core-version-profile-compatibility.md),
[catalog identity](core-selected-catalog-revision.md).

Новые standalone distributions имеют manifest v3 с разделением tooling/candidate.
Прежние v1/v2 inventories остаются data-readable; текущий executable требует v3.
Native-read operator сохраняет manifest v1: его reader проверяет полный
объявленный inventory и outer hash, без нового требования к старым inventories.
Это разные форматы, product/serverInfo остаётся 4.2.6.

Titles теперь проверен через настоящий prepareBuild, фактический Core contract
и inspection, build/propose/dry-run, подписанный HTTP, original receipt и свежий
read-back. Подтверждены сохранность соседнего объекта/стиля и pre-dispatch отказ
устаревшего inspection. Fixture имитирует AE и Windows observations; описательная
классификация records меняется на technical_check/ephemeral_check, authority
установленного AE из этого не следует. Полный Titles suite: 28/28 PASS.

Четыре owner candidates — readonly, manual, manual-titles-variants,
operator-render-jobs — детерминированы, содержат 70/90/115/164 runtime files и
прошли verifyPackage/verifyStandalone и actual dry-run из foreign CWD. Пакеты
не установлены в рабочую среду. Точные fingerprints и manifests сохраняются
в evidence C.

Исторический f548 fixture восстановлен исходным builder из Git commit
7dec462a5033700ccddf5a0756f80681103ba0ce: 343626 bytes,
SHA-256 dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8,
packageHash f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90.
Approximate current build не используется как историческое evidence.

Affected-union приёмка C завершена: **82/82 current checks, 72 distinct batches,
1338/1338 Node records PASS**, без fail/cancel/skip/todo в использованном evidence.
Итог [verified coverage](evidence/core-architecture-implementation-20261112/C/final/actual-selected-coverage.json)
имеет тип MULTI_CONTEXT_SELECTED_PASS: каждый check сохраняет собственный
контекст и opaque envhash. Равенство окружений не доказано; для initial main
невозможно восстановить прочие отличия окружения. Две проверки вне selected
scope — catalog-discovery и validation-reuse — не объявляются current PASS.

Все 11 исходных failed/UNKNOWN attempts сохранены. Identity, source pins и
replay guards не ослаблены. Legacy incident моделируется synthetic4.2.5 policy
на current code; это не исторический4.2.5 artifact и не native old-panel proof.
Production incident-repair pin прежний, frozen MSIX rebase не возобновлён.
Существующий Owner/3457 сохранён; kernel busy tests используют собственный
TEMP endpoint. Новый выпуск, установка, MCP/CEP cutover и native приёмка
пользовательского проекта не входят в выполненный source scope.

По следующему отдельному поручению пользователя `operator-render-jobs/owner`
`950d180c…` установлен на DESKTOP-32974QF штатным stopped update. Identity,
пользовательские AEP и защищённая история сохранены; новая CEP и одно native
чтение пустого проекта свежим effective-config клиентом PASS. Cached MCP этого
чата остался `owner_unavailable`; его обновление не заявляется. Live-мутация
учитывается следующим этапом [install/live-плана](../plans/core-architecture-install-live-20261112.md).

[План, решения и проверки](../plans/core-architecture-implementation-20261112.md).
