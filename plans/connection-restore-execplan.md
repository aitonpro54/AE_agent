# Восстановление подключения MCP → bridge → AE

15 октября 2026. Единственная цель: восстановленный допуск, настоящий bridge и
успешный `get_project_info` через обслуживающий чат MCP. Очередь, рендер, изменение
и сохранение AEP вне scope. Текущий чат — sole controller.

## Progress

- Передача принята из [предыдущего чата](connection-handoff-20261015.md), checkpoint
  7f7d9c4. Все прежние writers/native owners остановлены, pending0. Ветка продолжения:
  `codex/restore-mcp-connection`. Пять переданных WIP и семь чужих WIP сохранены.
- V13: native Open/C1 превысил read deadline30s; после ответа timeout завершилась
  запись OwnerEpoch. LaunchConsume отсутствует. Original controller/broker exact
  exits подтверждены. Порт3456 закрыт, CEP8870 существует; project read ещё не было.
- fae6d1f сократил измеренный Fresh147→28ms. Полное время C1 этим не доказано.
- Native successor и JS/driver интеграция завершены в 7729f55; source review Astra GO.
  V14c: все три native target собраны. SetupCreator завершился exit2 до prepare;
  exact original exit/EOF подтверждены, intent отсутствует, новый enrollment пуст.
- Найден конкретный pre-intent blocker: inherited foreign Modify ACE не проходят
  `OwnAcl` на old seal/roots. Один SID — CodexSandboxUsers, четыре не разрешились.
  Старые journal bytes/pins сохранены. Добавлен безопасный failure code в stderr.
- V14d: actual private ACL repair9/9 PASS с original-handle read-back и backup;
  source 5c1f41d, compile3 PASS, BuildAndSeal PASS. Creator exit0/bothEOF,
  pending0, seal11592B/intent584B; install shell закрыт. Bridge ещё не запускался.

## Decision Log

- Только подключение; уже принятые AME fixes сохраняются, операции очереди запрещены.
- [block: post-C1 recovery] [executor: ae_specialist — native; ae_implementer —
  JS/driver; Astra — выбранный пользователем bounded architecture review]
  [ownership: непересекающиеся native и build-helper файлы; root — Git/build/live].
- Поддержанного обычного post-C1 reinstall нет. Использовать existing SetupCreator:
  independent once local_operator successor с exclusive old fence, exact2 historical
  journal, durable CREATE_NEW intent до новых anchor/enrollment effects. Старые
  записи/floor не менять, JSON не считать grant, повтор old ensure исключён.
- Сохранить prepare424/final752/ACK80 и v1 fresh-install. V2 связывает original
  creator и actual intent со successor seal; никаких новых broker protocols.
- Parent read witness старого fence закрывается до creator. Только observer intent
  допускает existing native writer; обычные pins сохраняют прежний share mode.
- Перед единственным ensure нужен свежий servicing MCP adapter: desktop процессы
  старше d314a2f, Node24.19 подходит. Успех отдельного child не является подключением
  обслуживающего чат MCP. Если штатный restart недоступен агенту, запросить один
  технический шаг пользователя после полной готовности установки.
- [block: ACL допуска] [executor: ae_specialist — native correction; выбранная
  пользователем Astra — bounded review; root — sole permissions/build/live].
  Shared repository проверять по original pin/owner/present valid DACL; strict
  foreign-write policy относится к private runtime/journal/setup и их файлам.
  Три private parent DACL должны быть protected от будущего наследования.
  Scope machine repair — девять существующих private объектов, backup DACL и
  неизменность original IDs/bytes; ACL репозитория и ancestors не менять.
  Ancestor rename сохраняет physical intent/key, а canonical/pin проверки закрывают
  доступ. Он не даёт удалить intent через защищённого непосредственного родителя.

## Validation

- Successor behavioral fixtures5 и existing build fixtures12 PASS; syntax7 JS,
  PowerShell parser, compile identity.cs, rules/diff PASS. Source review Astra GO.
  Native C++ compile/link трёх targets PASS; live project read ещё не выполнен.
- V14c failure сверена по исходному retained HANDLE, exit2/stdoutEOF/stderrEOF;
  все handles закрыты, pending0. Доказанный ACL blocker воспроизведён точным
  предикатом на actual DACL без повторного запуска creator.
- ACL reference cases 5/5 PASS; native constexpr проверяет actual Modify,
  DELETE_CHILD/DELETE, WRITE_DAC/OWNER, read-only/inherit-only и protected parent.
  Исправленный native source compiled/linked во всех трёх targets — PASS.
- Machine repair изменил только девять private DACL через same original HANDLE;
  frozen input SHA, old setup pin, zero fence, IDs/bytes до/после PASS. DACL backup
  CREATE_NEW+Flush до изменений; repo/ancestor ACL не менялись.
- V14d actual input SHA299f0fd79c8f892ac418f4a73bc14730fba86a59d11fa5bdc51bb60e19ed4a66;
  `build-and-seal-receipt.json`: sealed_creator_closed, originalExit0,
  stdoutEOF/stderrEOF. Новый runtime автоматически не запускался.
- Переданные WIP имели syntax PASS, но содержали незавершённую native интеграцию и
  ошибки JS genesis key/selector. Это диагностические факты, не приёмка.
- Проверить native-compatible closed records, actual intent/binding, отсутствие
  replay/fallback, v1 compatibility и source syntax/rules/diff; затем all3 compile.
- Перед live freeze проверить fresh census и все actual inputs. Исторические
  original receipts не заменяют новый native grant.
- Критерий завершения: successful actual typed ensure → listener → panelConnected →
  get_project_info с именем/путём/числом элементов реального AE проекта. Offline
  тесты и успешная сборка не заменяют это чтение.

## Следующее действие

Пользователю передан один технический шаг: штатный Restart сервера after-effects
в настройках Codex. После подтверждения — один ensure в обслуживающем чат MCP,
status и реальный get_project_info. До подтверждения не расходовать admission.
