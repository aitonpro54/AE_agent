# Смена проекта AE: ограниченное исследование L0

1 ноября 2026. Research-only по [плану базы](../plans/core-base-reliability-20261101.md).
Цель — понять доступность надёжного сигнала, не реализовывать новый provider.

## Разделение случаев

| Событие | Что можно наблюдать | Чего это не доказывает |
| --- | --- | --- |
| Новый процесс AE | PID вместе со временем запуска и executable identity | Какой проект открыт внутри того же процесса |
| Изменился путь AEP | Fresh read app.project.file | Same-path reopen/revert/replacement между чтениями |
| Изменились ревизия/содержимое | Признак изменения наблюдаемого состояния | Уникальную непрерывную incarnation; равенство двух snapshots не исключает промежуточную замену |
| Перед нами совпадающая цель | Повторное разрешение ID и проверка свойств непосредственно перед setter | Историческую непрерывность проекта |

Последние два требования различаются. Для некоторых операций достаточно
согласованной политики «текущая совпадающая цель». Требование непрерывности для
любой операции по умолчанию нуждается в предметном обосновании. Его нельзя
молча заменить polling и продолжить выдавать прежнюю гарантию.

## Источники и состояние

- [Adobe UXP for After Effects](https://developer.adobe.com/after-effects/uxp/)
  публикует host API reference и прямо указывает beta. Наличие UXP документации
  не доказывает поддержку в текущем установленном AE или нужного события.
- Официальные [Application](https://developer.adobe.com/after-effects/uxp/after-effects-api/application)
  и [Project](https://developer.adobe.com/after-effects/uxp/after-effects-api/project)
  проверены отдельно. Свойства имеют min version27.0; revision растёт при действиях,
  telemetryGuid описан как стабильный GUID проекта. Уникальность ID каждого
  открытия не обещана. В этих references event callback не найден; это
  ограниченный отрицательный результат, не отсутствие события во всех APIs.
- [Adobe community: SDK project opened/created](https://community.adobe.com/questions-529/sdk-detect-if-a-new-project-have-been-opened-or-created-55693)
  обсуждает idle/path observation. Это первичный практический ответ, а не
  официальный контракт покрытия всех переходов; same-path проблему он не решает.
- Текущий Core явно сообщает automaticLifecycle unavailable. Ранее принятая
  manual current-target policy сохраняется; source и runtime не менялись.

Первичный вывод: дешёвое достоверное обнаружение **всех** project incarnations
пока не установлено. Нельзя объявить SDK обязательным или достаточным лишь по
наличию idle hooks. Следующая ограниченная проверка — точный официальный API
application/project events и порядок их доставки относительно command dispatch.
Если нет documented exact event, зафиксировать gap и выбирать гарантию конкретной
операции; не начинать общий SDK проект ради read-only подключения.

## Граница работы

Никаких open/revert/save, native probes, установки SDK/UXP, создания AEP или
новых tests. L0 не блокирует B1 diagnostics и idle connection cycles.
Bounded L0 завершён выводом «не доказан дешёвый exact mechanism». Feasibility
такого detector остаётся открытым; дальнейший поиск SDK не prerequisite базы.
Предложенный Argon manual preflight принимается только как current-target
policy, не как решение continuity.
