# Correction delta review freeze02

31 октября 2026. Независимый reviewer `readoption_slice1_review`, read-only.
Вердикт: **CHANGES REQUIRED**. Original P2-01 и P2-02 закрыты по статике;
выявлен P2-03. Source hashes соответствуют `review-freeze-02.json`,64символа,
подтверждены до/после чтения. Tests/probes/live0, edits0.

## P2-03 — foreign canonical gates маскируются как owned перед claim

Transaction:66 передавал observed canonical gates в s.base() как owned;
store:64–66 превращал их в исключения certificate reader. После последнего
stable():252 во время materialize candidate/publication (store:47–48) мог
появиться foreign install.lock. Validator нормализовал его, canonical intent
публиковался на store:52; следующий readState отказывал уже после claim.

Требуется непосредственно перед первым link проверить отсутствие обоих gates
и передавать пустой owned. При preclaim допустим только исходный prefix0gates.
Адресные tests: fixture-hook publication.json создаёт install либо broker gate;
apply отказывает до intent, сохраняет foreign gate/adoption/barrier.

## Перенесённые выводы

Общий preflight связывает certificate/actors, old bytes/full stat, barrier и
absent stage; inspect, handles и apply используют одинаковый hash/post-await
проверки. Old replay budget проверяется до preparation; shared validateIntent
проверяет witness/replacement/old bytes/facts/anchors до link и при чтении.
Foundation без adoption и private brands не ослаблены. Это source вывод,
не результат выполнения новых tests.
