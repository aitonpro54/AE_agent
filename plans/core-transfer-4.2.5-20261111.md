# Core 4.2.5: причина смешения и защита переноса

## Цель и границы

По поручению пользователя установить причину двух identity на DESKTOP-32974QF,
исправить общий механизм переноса, выпустить и отправить в origin Core 4.2.5.
Подключить Argon и Astra к одному ограниченному кросс-ревью. MSI не изменять.
Текущая рабочая 4.2.4, обе доступные истории, настройки и AEP сохраняются.
Пользовательская правка AGENTS.md остаётся вне продуктовых коммитов.

## Progress

- База: 0b85436; восстановление инцидента завершено, запуск 4.2.4 принят.
- Причинную цепь и общую границу исследует ae_specialist recovery_boundary.
  Независимое чтение выполняет Astra/high по прямому выбору пользователя.
  Координатор остаётся единственным writer/controller живой установки.
- Подтверждено: identity 7ece создана initial install 7e2bc281, а не update 004c.
  В initial transaction previousDescriptor/client/CEP отсутствовали,
  previousConfig существовал. Исторический писатель возврата e0 ещё исследуется.
- Проверка готовности Argon направлена существующему локальному контроллеру
  ARGON_BrowserUse. Запрос и файлы ревью ещё не передавались в Gemini.
- Astra/high завершила независимый анализ: три P1 admission воспроизведены
  в четырёх TEMP-сценариях; исходный source hash и evidence сохранены в
  reviews/astra/core-transfer/20261111/. Контракт принят, реализация и
  адресная техническая валидация переданы ae_implementer package_verify.
- Конкретный запуск создания 7ece найден в локальном rollout: 10 ноября
  05:22:27Z, standalone initial apply при неизменившемся managed config.
  Bounded поиск завершён: писатель исчезновения root/возврата e0 не найден.
  Доказанный admission defect и открытый исторический пробел разделены в
  [расследовании](../docs/core-transfer-mixed-root-cause-20261111.md).

## Decision Log

- Не подменять первопричину описанием уже выполненного incident repair.
  Разделять доказанный admission gap, историческую причинную цепь и гипотезы.
- Предварительный воспроизводимый gap: отсутствие файлов установки позволяет
  создать identity при существующей managed Core binding в project config.
  Контракт исправления фиксируется после причинного исследования и ревью.
- Argon получает минимальный allowlist без credentials, backup/state, AEP,
  настроек и полных журналов. Astra работает read-only по локальным исходникам.
  Одно ограниченное Argon review, дальнейший разбор замечаний локальный.
- Coherent existing descriptor проверяется существующим pure verifier вместе
  с CEP; existing managed config должен указывать на прежнюю установленную
  binding. Отсутствие Core entry в новом workspace само по себе допустимо.
- Origins без descriptor отказывают как orphan. Initial rollback сохраняет
  свою прежнюю семантику; автоматический reapply после него не обещается.
  Tombstone/новая recovery authority не добавляются.
- Argon readiness остановлена Computer Use: URL окна не определён надёжно,
  Chrome extension не подключён. Отправок/вложений нет; обходов нет.
  Пользователю направлена просьба подключить Aiton/Gemini штатным способом.

## Validation

- Исходный Git: только пользовательский AGENTS.md изменён; origin подтверждён.
- Нужны: воспроизведение сбоя до исправления, регрессии initial/repeat/update/
  rollback и сохранности state/config, адресный routing и boundaries,
  детерминированный 4.2.5 package/standalone, кросс-ревью и triage findings,
  финальная проверка refs после push.
- Продуктовые сценарии Titles/Slideshow/AME и полная матрица P1–P8 не назначены.
  Новых live install/stop/native-команд в этом блоке пока нет.
