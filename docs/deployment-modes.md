# Режим запуска AE Agent

Обычное открытие панели и подключение к мосту не должны зависеть от
экспериментального одноразового сценария двух титров.

`AE_AGENT_DEPLOYMENT_MODE` выбирает маршрут до запуска процесса:

- `product` — обычный режим по умолчанию; используется существующий
  аутентифицированный мост и typed bootstrap панели.
- `initial-owned` — явно выбранный экспериментальный finite native runtime.
  Отсутствующий пакет, неполная установка и UNKNOWN приводят к отказу;
  перехода в product после ошибки нет.

Само существование `.codex-autonomy/trusted-read` не выбирает маршрут.
Экспериментальные переменные окружения без явного `initial-owned` отвергаются.
Native child получает этот режим явно. Режим managed child должен совпадать с
родительским после наложения конфигурации и проверяется до запуска.

## Границы bootstrap

`ensure_ae_agent_panel` остаётся операцией с `readOnlyHint:false`. Product bootstrap
требует automation credential, штатный adapter marker и закрытый серверный ticket.
Этот ticket разрешает только bootstrap и его внутреннее чтение проекта;
он не разрешает произвольные AE-команды или вложенное выполнение планов.

Сохраняются проверки Host/Origin, разные panel/automation credentials,
идентичность установленной панели, idle-проверки и сохранение UNKNOWN без повторной
отправки. Общий execution admission старых managed generations не открывается
выбором product mode. Fixture/title admission, proposal/dry-run, autonomy,
raw/destructive/save confirmations сохраняют собственные требования.

Это разделение запуска и чтения проекта, а не приёмка всех mutating workflows.

## Переход с уже работающего experimental runtime

Изменение режима не завершает и не удостоверяет исход прежней операции.
Текущий UNKNOWN нельзя обходить удалением каталога, переключением транспорта,
повторным ensure или новой установкой. До активации другой конфигурации нужно
сверить фактическое завершение исходных владельцев и pending effects.
Исторический LaunchConsume не является доказательством успешного запуска
или выхода процесса. Source/offline-проверки не заменяют живое чтение AE.

## Остановка и преемственность product daemon

Право остановить собственный зарегистрированный product daemon отделено от
write admission. Product genesis связывает первую положительную registration,
reservation и launch operation с явным разрешением миграции и её сохранённым
результатом. Следующие поколения проходят подписанную линейную succession;
current pointer обновляется после регистрации преемника. При наличии legacy
anchor сохраняются прежние проверки retained manifest и capsule.

Product shutdown требует пустых очередей, отсутствия active edit session,
bootstrap, native work, cleanup, outstanding transport и confirmed/executing
plan. Отдельный trusted признак разрешает остановку при свежем отсутствии
lifecycle store; corrupt, partial и неизвестное состояние не считаются idle.
Пассивный `/bridge/next` poll не мешает остановке, а реальная read/execution
операция продолжает учитываться. Это не открывает mutation admission.

Разовый repair receipt относится к известному never-admitted product generation.
Он связывает CREATE_NEW intent, исходные source snapshots и signed startup rows
с фактическим выходом того же удерживаемого OS HANDLE и сохраняет `graceful:false`.
Это private read-only consumer, без нового force tool; UNKNOWN, неполная запись,
подмена snapshot или другого поколения блокируют продолжение. Старый experimental
UNKNOWN и его журналы не становятся product grant или доказательством выхода.
