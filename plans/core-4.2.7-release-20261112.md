# Core 4.2.7: версия и push

12 ноября 2026. Поручение пользователя: обновить версию на 4.2.7 и выполнить
push в 4.2.7. База исходников — `48c5bad`, ранее принятые source/live результаты
фонового reconnect — `5f42f78` и direct current-chat MCP proof — `48c5bad`.

## Progress

- Создана ветка `codex/ae-agent-core-4.2.7` по существующему именованию version
  branches. Remote `origin`: `https://github.com/aitonpro54/AE_agent.git`.
  Read-only ls-remote не обнаружил занятую ветку 4.2.7.
- `ae_implementer` Sol High отвечает за product version/runtime/CEP/package
  metadata, адресные tests и актуальные version labels в документации.
  Root отвечает за Git, план и публикацию ветки. User dirty `AGENTS.md` и
  `plans/core-transfer-4.2.5-20261111.md` сохраняются и не входят в коммиты.
- Source 4.2.7 готов в 24 product/test/doc файлах. Runtime/MCP/CEP/package
  labels и exact allowlists согласованы; совместимость 4.2.6 сохранена.
  Feature-based registry/stamping включены для обеих версий. Новая нормализация
  panel identity выбирает только точные 4.2.6/4.2.7 из хешируемого CEP manifest;
  package/runtime отдельно отвергают несовпадение identity и release version.
- Восемь адресных команд дали 163/163 PASS; boundaries проверил 92 файла,
  liveCalls=0. Два одинаковых operator-render-jobs/owner комплекта проверены;
  настоящий прежний комплект 4.2.6 принят новым verifier без restamp.
- Independent `ae_reviewer` Sol High: bounded ACCEPT, открытых P1/P2 нет;
  24 source SHA и два пользовательских SHA совпали. Evidence и полный список
  команд сохранены в [release evidence](../docs/evidence/core-4.2.7-release-20261112/summary.json).

## Decision Log

- Это source version/release block. Исторические receipts, plans и evidence
  сохраняют прежние 4.2.6 pins; массовая замена версии в истории запрещена.
- 4.2.7 сохраняет защищённый feature profile 4.2.6: registry/panel identity,
  receiver/owner contracts, packaging format и composition semantics. Exact
  compatibility остаётся явной; широкие semver allowlists не вводятся.
- Legacy root package 3.3.5 и отдельные Titles/Slideshow product versions
  не являются версией Core4 и не повышаются автоматически.
- Проверка версии выполняется через текущие version/profile validators,
  затронутые адресные tests и deterministic operator-render-jobs/owner package
  и standalone v3 в TEMP. Полный release и новая live/двухмашинная установка
  не выводятся из одного bump. Текущая установленная 4.2.6 остаётся прежним
  отдельно принятым runtime до фактического штатного обновления.
- Push разрешён пользователем явно. Root отправит проверенную новую ветку
  обычным push без force и сверит remote HEAD. Другие ветки не переписываются.
- Результат post-commit push и сверка local/remote HEAD сохраняются локально
  в `.codex-runtime/core-4.2.7-release-20261112/push.json`; Git upstream также
  фиксирует целевую version branch. Публикация не создаёт GitHub Release или
  сертификат полной live-приёмки.

## Validation

- PASS: version-profile 21, catalog-revision 12, ae-panel-startup 41,
  panel-reconnect 70, capability composition focused 3, standalone 8,
  installable focused 7, mixed semantic version 1. Итого 163 теста в восьми
  командах. Полные команды и stdout — в evidence; повторов всего набора нет.
- Детерминированный package `2ce5b1c2c49ddc7be422a9d4b57d1d2d84e0b30e5ce703a9278df306e1c03e04`,
  164 runtime files; standalone v3 `f6803959685c71db19b8335fb97349343df86203ca3ec8ffff4f9f17d379fc9b`,
  183 files. Panel build `2111abf8…`, registry `f58832f9…` неизменён.
- Actual 4.2.6 package `75a95aa5…` / distribution `73543e6e…` принят текущим
  verifyStandalone/verifyPackage/panelIdentity без изменения прежних bytes.
  Negative tests отвергают обе перестановки release/identity mismatch.
- Foreign-CWD 4.2.7 standalone dry-run PASS: restricted imports, network/child
  blocked, TEMP destinations остались отсутствующими. Первые path-scope отказы
  сохранены: slash-form historical path и неправильный TEMP basename;
  исправлены только входные пути, защитные проверки сохранены.
- Validation map выбрал 65 checks и 9 deferred. Это selection, а не 65 PASS;
  полная current closure и `releaseCertified=true` не заявляются. Root legacy
  3.3.5, версии Titles/Slideshow и установленный runtime 4.2.6 не изменены.
- Никаких AE commands, install/update, service/config/credential changes в
  этом source-блоке не назначено.
