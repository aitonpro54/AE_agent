# Отдельные версии AE Agent и возврат к предыдущему коду

## Подготовка 3.3.2 — 2026-10-21

- Ветка `codex/release-3.3.2` создана от desktop HEAD `ce9d97778e6dc81590535a3640947b215dd7c19a`. В выпуск сохраняются 111 накопленных неопубликованных commits и все текущие pending improvements. Предыдущая опубликованная точка 3.3.1 — `662f41099944fbf57e03a0820d238b26abb642a1`; точный checkpoint desktop — `checkpoint/ae-agent-3.3.1-before-3.3.2`. Ветка, checkpoint, commits и push оформляются отдельно диспетчером.
- Product identity и текущие runtime/fixture ожидания синхронизированы на 3.3.2. Сохранённые pending improvements включают routing/reuse docs, common-title continuation и отдельный компонент manual AME queue grant. Grant пока используется только своим offline smoke: подключение к server/CEP routes и включение функции в этот выпуск не входят.
- Ноутбук: `origin/codex/release-3.3.3` — `1d246ae5a94238a54dadd5f2d01e9eb2eaf986ae`; общий предок с desktop — `63c8027a6832282810a7180c3dd5114b5e608cc6`, на исходном desktop HEAD `ce9d977` расхождение составляет 29 desktop-only / 184 laptop-only commits. Существующий laptop checkpoint `f92a75b89073bd1ba8848440a67928c22f529283` отличается от exact desktop HEAD. Следующий отдельный этап объединит desktop 3.3.2 и laptop 3.3.3 в новую 3.3.4; затем — отдельный аудит: inventory компонентов и измерение представительных задач с разделением runtime эффективности и затрат разработки/отладки (время, токены), после него адресная оптимизация подтверждённых bottlenecks отдельными milestones. Интеграция и аудит сейчас не выполняются.
- Validation PASS: `check:rules`, синтаксис всех 18 изменённых/pending JS, XML manifest и `git diff --check`; `ame-manual-queue-grant-smoke` (9 групп), `cep-panel-target-smoke` (16), `cep-panel-actions-smoke` (48 actions/full VM). AME title-jobs VM — 16 групп PASS; вторая часть `smoke:ame-title-jobs` — FAIL `fixture_runner_launch_identity_required`: существующий semantic fixture возвращает `{pid}`, production runner уже требует исходный process identity witness.
- Validation BLOCKED: `bridge-only-smoke-test` и network-часть `ae-agent-panel-bootstrap-smoke` — `owned_supervisor_unreserved_startup_refused`; изолированный fixture использует production `PROJECT_ROOT`, где существующий startup gate требует reservation. Bootstrap unit/VM часть достигла network stage без ошибки. Common-title recovery/reconnect — отсутствует обязательный ignored receipt `logs/cep-panel-control/cb5c3b53-5443-474e-93df-aa8210758886.json` (ENOENT). Gate/fixture проблемы присутствуют в исходном коде до bump; authority не ослаблялась и historical evidence не подменялись.
- Continuation contract исправлен отдельным `failedRecoveryCaptureIdle` из согласованных state/catalog/state; общий `nativeControlIdle` не ослаблен. Самодостаточный `common-title-assembly-continuation-smoke` — PASS (66 checks, deterministic synthetic evidence, production validators, без historical/live proof). Итоговые rules/syntax18/diff — PASS; перечисленные FAIL/BLOCKED остаются ограничениями release validation. Исторические receipts, testedAeContext и frozen-intake baseline сохранены. Установка, reload, live AE/CEP/provider acceptance, PR и GitHub Release не выполнялись.

## Подготовка 3.3.1 — 2026-10-09

- Ветка `codex/release-3.3.1` создана от `c8f82065b3b506c3e51ff5adc10caa14ba2ab153`; первый push/read-back PASS на `e5dc9f1f736005f6faecbff56106301c8c673dbd`. Опубликованный annotated checkpoint `checkpoint/ae-agent-3.3.0-before-3.3.1`: tag object `7d53d33ddc00aa919dcd956f644e872433587d70`, peeled target `c8f82065b3b506c3e51ff5adc10caa14ba2ab153`.
- Текущие product identity, канонические документы и адресные smoke fixtures обновлены до 3.3.1. Записи выпуска 3.3.0, testedAeContext и замороженная intake-граница сохранены.
- Validation: `check:rules`, 12 JS syntax checks, `bridge-only` и panel-bootstrap offline smokes, `git diff --check` — PASS. PR, GitHub Release и live AE/CEP/provider acceptance не выполнялись.

## Подготовка 3.3.0 — 2026-10-05

- Новая ветка `codex/release-3.3.0` опубликована от проверенного состояния
  `e2d83342eb7b4837a8ac03fbbfd240de78eebdbc`; checkpoint
  `checkpoint/ae-agent-3.2.0-before-3.3` опубликован как аннотированный тег. Предыдущая
  ветка и её указатели сохранены.
- До подготовки версии накопилось 68 коммитов и 168 файлов (`+30799/-427`)
  относительно `origin/codex/release-3.2.0`. Сами накопленные изменения здесь
  не повторяются; этот этап обновляет только версии в продуктовых файлах и документацию выпуска.
- Remote read-back PASS: ветка указывает на `7d815366043ef0c6b1938bebea0977ae0997ce62`; annotated checkpoint tag указывает на `725c7498ec15e0bfa9a427e67cd1236219fb38fb` (peeled target `e2d83342eb7b4837a8ac03fbbfd240de78eebdbc`). Инвентаризацию выполнял ae_scout, правки и проверки — ae_operator, Git-операции — родитель. PR и GitHub Release
  не создавались; установленная версия и живая приёмка не заявляются.
- Неотслеживаемые legacy review packs и кэш Windows исключены из области выпуска и
  оставлены нетронутыми.

Каждая новая версия разрабатывается в `codex/release-X.Y.Z`. До начала новой
версии фиксируется точный проверенный commit предыдущей версии annotated тегом.
Принятый выпуск получает тег `vX.Y.Z`; промежуточная точка — `checkpoint/...`.
Существующие теги не перемещаются, старые release-ветки сохраняются.

## Текущее разделение 3.1 и 3.2

- Предыдущий GitHub код: `codex/release-3.1.0`, commit
  `c6edff9738c20347b802d481d2bb6b3ad9ffc646`.
- Точный checkpoint: `checkpoint/ae-agent-3.1.0-before-3.2` на том же commit.
- Новая `codex/release-3.2.0` начинается с `d0729f6` и включает 29 накопленных
  commits относительно предыдущей ветки, затем отдельный commit подготовки версии.
- PR №4: `codex/release-3.1.0` → `main`, остаётся открытым.
- Подготовка версии: commit `b86fd2c`; offline проверки из release-плана — PASS.
- [Draft PR №5 версии 3.2](https://github.com/aitonpro54/AE_agent/pull/5):
  `codex/release-3.2.0` → `codex/release-3.1.0`.

Base 3.1 используется для сравнения изменений. PR 3.2 нельзя сливать в 3.1:
сначала отдельным поручением принимается PR №4 в main, затем base PR 3.2 меняется
на main и diff проверяется повторно. Для последовательных зависимых PR предпочтителен
merge commit, сохраняющий ancestry; после squash/rebase необходима отдельная проверка
истории. Слияние любого PR требует отдельного явного поручения.

## Постоянный порядок обновления

1. Проверить branch/HEAD, свежий remote, отсутствие конфликтующего имени ветки
   или тега; сохранить список незакоммиченных материалов. Точкой возврата служит
   конкретный проверенный commit, а не только название версии в файле.
2. Создать annotated checkpoint старого состояния и новую release-ветку от
   выбранного исходного HEAD. Если работа накопилась в старой локальной ветке,
   сначала сохранить её HEAD в новой ветке, затем вернуть только старый локальный
   указатель к опубликованной точке. Force push старой ветки не использовать.
3. Обновить canonical surfaces, проверяемые `scripts/clean-current-check.js`,
   runtime/fixture version expectations и текущие docs. Исторические receipts,
   release notes, testedAeContext и frozen-intake baseline не менять.
4. Выполнять milestones с отдельными commits и обновлять существующий план
   (Progress, Decision Log, Validation). Перед push выполнить check:rules,
   syntax/diff и относящиеся к изменениям offline smoke groups. Добавлять в Git
   только точные файлы текущего scope, не весь набор через `git add .`.
5. Push отправляет новую ветку и отдельно выбранный тег; draft PR описывает
   итоговые изменения, проверки, пределы и зависимость от предыдущего PR.
   Ветки и теги не являются обновлением установленного приложения.
6. После отдельного принятия версии закрепить проверенный commit тегом `vX.Y.Z`
   и по поручению оформить GitHub Release. Следующую версию начинать отдельной
   веткой; обновления принятой версии оформлять patch-выпуском с новым тегом.

## Возврат к 3.1

После сохранения текущих правок прежний код доступен так:

```powershell
git switch codex/release-3.1.0
```

Для отдельного checkout точного checkpoint, без переключения текущей работы:

```powershell
git worktree add --detach ..\AE_agent-3.1-checkpoint checkpoint/ae-agent-3.1.0-before-3.2
```

Целевой каталог должен быть новым. Detached checkout предназначен для инспекции
и сборки; для новых правок создаётся отдельная ветка.

Если 3.2 уже принята в main, её отмена оформляется новым revert PR с проверками,
сохраняющим опубликованную историю. Не использовать reset/force push main для
обычного возврата. Git хранит tracked исходники; ignored runtime, секреты,
внешние media/AEP и installed CEP в checkpoint не входят. Установка прежней
CEP/daemon и работа с AEP — отдельные действия с действующими gates.
