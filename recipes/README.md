# Reviewed Solution Recipes

Эта папка хранит reusable recipes для Safe Solution Library.

Правила:

- Каждая recipe должна иметь запись в `registry/solutions.json` со схемой `ae-solution.v1`.
- Recipe описывает безопасный validated Agent plan, а не обход planner/runner.
- Mutating workflows обязаны сохранять explicit confirmation, mutation permission, idempotency и read-back verification.
- Raw ExtendScript упоминается только как reviewed file under `scripts/solutions/`, если typed bridge tool пока не покрывает задачу.
- Не добавляйте сюда candidates или непроверенные live experiments. Для них будет ignored quarantine в `logs/solution-candidates/`.