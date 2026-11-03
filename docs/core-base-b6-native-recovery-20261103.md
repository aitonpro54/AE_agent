# B6 — native доставка, поздний callback и recovery

**Последующее B7:** configuredcdf read/release также подтверждён обычным текущим
MCP без maintenance. [Актуальная сводная матрица](core-base-b7-configured-matrix-20261103.md).
Числа5/1 и открытый configured proof ниже описывают исходный B6 checkpoint;
current B7 —7/1, остальные факты B6 сохраняются.

3 ноября 2026. Ограниченный native-этап базы завершён. Source `d6dcd75`,
installed checkpoint `6918044`, package `cdf7338f…`, distribution `85c3d95a…`.
[Полное evidence](evidence/core-base-b6-native-recovery-20261103.json),
[действующий план](../plans/core-base-delivery-recovery-20261103.md).

## Progress

| Проверка | Наблюдаемый результат |
| --- | --- |
| Доставка | Native confirmation назвала собственный saved AEP, comp1/layer13 и `BASE_A→BASE_B`. Command `7c78e9fb…`, task `0558d0cf…`, proposal `c477c55e…`. |
| Потеря owner | Exact Node15616/birth639293094416076820/bootbed482de… остановлен один раз через retained OS handle после durable mutate begin. Native birth отличается от CIM на2ticks; сравнение на точности CIM не ослаблено. |
| Исход вызова | Клиент вернул `ipc_outcome_uncertain`; original run не отправлялся повторно. Diagnostic owner12216 держал execution queue закрытой. |
| Original mutation | После доказанной смерти owner та же native confirmation подтверждена один раз. Собственный AEP сохранён, затем открыт новым AE30024. Fresh typed read-back прочитал `BASE_B`. |
| Поздний callback | После подтверждения CEP сменила busy на `owner_recovery_required`; receiver26/ledger20 остались побайтно прежними. Числовой HTTP status напрямую не измерялся, packet capture отсутствует. |
| «Начать заново» | Новый server-owned reset `2fecd11c-faef-4651-9f27-e88e4498fb20`, attempts1. Required exact AE21960 exit выполнен штатным File→Exit. Истории26/20 архивированы exact, старый UNKNOWN не изменён. |
| Новая база | Session `ce977de2-4dab-4a0a-9b94-855a02b00c73`: старый8fe8b332… acquire отклонён `owner_work_session_changed`; explicit new acquire1, свежий project-inspection baseline, manual text read-back и release PASS. |
| Новый host | Отдельная штатная re-adoption `cd5bb102-b620-4e03-bd11-f7a73e37890e` привязала own path к exact AE30024. Старые UNKNOWN не мешали metadata-операции новой базы; runtime/session/history/AEP не менялись. |

Финальный standard owner27100/birth639293110869903720/
bootb76c6e87… ready; CEP auto connected, один listener3457, pending/UNKNOWN/fault0.
Current receiver5events/ledger1event settled. Оба прежних архива14/52events,
новый UNKNOWN26/20 и прочие старые records сохранены. После intentional adoption
change140защищённых файлов совпали с checkpoint; descriptor/client/MCP-config
и saved AEP неизменны. Saved/reopened AEP SHA:
`b6eaea7e0b3621af4580357816ea785e4ba776ae9d83bc3439a833563fb347e5`.

## Decision Log

- Физический эффект `BASE_B` доказан после save/reopen отдельным typed read.
  Логический исход старой команды остаётся UNKNOWN. Архив не переписан в success.
- Новый reset не является повтором69facd01…/9b128005…; новые stop/update/readopt
  IDs также не повторялись. Никакие markers/journals вручную не очищались.
- Computer Use отклонил ввод в CEPHtmlEngine до действия. Один новый reset
  отправлен через существующий authenticated panel API с action/epoch/nonce/HMAC
  и проверенным ответом. Публичного issuer, нового ingress или bypass auth не было.
- Native поздний completion наблюдался по CEP UI и закреплённому callback path.
  B5 отдельно покрывает настоящий TEMP HTTP/VM отказ old completion новым receiver.
  Эти два вида evidence не смешиваются в утверждение о native packet capture.
- Fresh re-adoption нового AE — отдельная explicit manual привязка. Она не
  выдаёт automatic lifecycle continuity или blanket mutation grant. Следующая
  операция проходит обычные fresh inspection/proposal/dry-run/native confirmation.
- Configured-client proof нового package остаётся вне этого этапа: пользователь
  разрешил только установку/args-path и standard native proof. Codex/app-server
  и configured MCP client не перезапускались. Titles/Slideshow не развивались.

## Validation

- Source acceptance15checks/330unique cases/55boundaries сохранена; все15current
  keys и exact source hashes совпали после native этапа. Новых runtime edits нет.
- Installed80runtime и7CEP bytes verified; после re-adoption7CEP hashes прежние.
- Архивный classifier: receiver26 —1unresolved; ledger20 —2unresolved. Current
  classifier: receiver5/ledger1 settled, unresolved0; новых mutation begins0.
- Original archived receiver содержит ровно один mutate begin и не содержит
  terminal success этой команды. Старые26/20 SHA совпали до/после позднего callback
  и после reset. Archived session/baseline exact.
- Первый read-only status во время reset transition не дал результата; helper
  не сохранил raw RPC error. Последующий same-intent status и native baseline PASS;
  reset не отправлялся повторно. Это не объявляется полной приёмкой transition SLA.
- AE launch один: сначала процесс30024 существовал без targetable окна; позднее
  то же окно появилось. Повторного запуска не было. Диалог Open проверен по
  фактическому имени файла перед Enter; никаких правок текста через UI не делалось.

Full release, fixed-package configured proof и двусторонняя переносимость остаются
открытыми. Нового Argon review/отправок не было. Для текущего bounded B6 новых
инженерных действий не требуется; следующий предметный продуктовый этап отдельно
определяет пользователь, Titles автоматически не возобновляются.
