# Task-local evidence tooling

Эти копии сохранены для аудита конкретной source-приёмки C. Это не новый
product API, installed helper или автоматизация проекта. Исходные экземпляры
исполнялись из отдельных task TEMP; абсолютные пути и hashes есть в receipts.
Не запускать копии из evidence как обычные команды обслуживания Core.

Subset: SHA 4b9dd7f879b8e437dced728271d7d58628d15f2efb2c900c85b9e4c465a552d8.
Compare: SHA 9bec4f4314ccbe96d7520ae3bac9ce78e817d40e1e78c16b42922fb8e3142341.
Context join: SHA 8335dceced64f9305f01fc6106f11282fa6ccd441ad966b86437495397c835a2.
Self-check: SHA 56aedda199cdc9de24bec6571b7b036207dc7b9ad79628df539a2a5f57d7a4ab.
Фактически использованный scope join:
edb6b8b997050e4020316845e25c823cadb17f244ed05275f4d249146a4dfa49.
Его self-check:
9930b91a9d7314c2049196378af68c0ba9f4788113bf985eabf944af6a6b35cf.

Независимые read-only reviews ACCEPT. Node syntax и synthetic negative cases
прошли. Subset не выдаёт исключённые checks за PASS; join сохраняет разные
opaque environment contexts и не заявляет их эквивалентность.
Scope join отдельно разрешает только явное prior-subset-of-current: сохраняет
исходный scope каждого proof и не меняет current-key/log/closure gates.
