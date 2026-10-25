# Минимальная CEP Core

CEP показывает подключение/status, durable preference автономии, текущий server-owned план, ручную подготовку/dry-run/Run, сверку результата и защиту плейсхолдеров. Providers, чат, Hardcore, Usage, connector, dev-request и debug actions исключены из DOM, handlers и публичного каталога. Исторические receipt readers остаются для запрета replay старых неизвестных отправок.

Ручной confirmation session больше не зависит от chat storage: private nonce текущей страницы + panelConnectionId + generation + lifecycle epoch. Это selector для server-issued token, а не authority. Переподключение/reload меняет selector; старый token не используется. Tokenless MCP proposal сначала проходит authenticated adoption и dry-run; opaque token, payload/preview hash, revision, target и expiry сверяются исходными gates.

Run через минимальную панель требует trusted DOM click, подтверждение видимого canonical плана и private одноразовый frame с точными pins/session/epoch. Публичный `confirm:true`, программный action, отмена, смена контекста или истечение frame не создают это подтверждение. Server manual ingress, private brands, checkpoint, risk policy и raw dry-run gate сохраняются.

Physical evalScript latch, bootstrap delivery fence, causal lookup, product reset, durable action receipts, command submission/ACK и UNKNOWN/no-replay сохранены. Epoch не доказывает завершение старой отправки. AME-код оставлен в прежней паузе без новой приёмки.

`npm.cmd run smoke:core-cep` — только VM/DOM contract с synthetic HTTP/native stubs: session/adoption, accepted dry-run, raw/save/destructive click gates, stale pins, отказ/отмена, latch после reload и UNKNOWN без повторной отправки. Это не подтверждает внешний вид в CEP, browser event provenance, installed assets, live connectivity, AE evaluation или реальные изменения проекта. Установка и штатный native read-back относятся к отдельному cutover.
