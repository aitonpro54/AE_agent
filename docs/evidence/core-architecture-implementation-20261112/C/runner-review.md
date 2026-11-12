# Проверка runner C

ae_reviewer read-only: **ACCEPT с ограничением полноты diff**.
SHA task-local run-selected.cjs:
`cf00330fa01d125d28aca48f8cb653fff17eb041dccfe19f74ce950a43c363f1`.
node --check PASS; source suites в ревью не запускались.

Runner сохраняет exact selection и batch commands, требует ненулевые завершённые
test counts и matching passed names, связывает raw logs с SHA и проверяет current
evidence keys до/после. FAIL не повторяется; timeout/source drift останавливают
дальнейший dispatch. Конкретного false PASS/unsafe dispatch не найдено.

Runner доверяет explicit config.changedPaths. Координатор отдельно сохраняет
полный tracked diff + untracked union к dd50fb8 и связывает его с config/selection
SHA. PASS относится к этому набору, releaseCertified=false. При timeout исход
потомков неизвестен; это не повод автоматически повторять batch.
