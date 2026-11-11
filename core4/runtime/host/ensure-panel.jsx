/* Fixed Core4 startup asset. Data and receipts live beside this package-owned copy. */
(function () { try {
    var directory = new File($.fileName).parent, input = new File(directory.fsName + '/request.json');
    function write(name, text) { var f = new File(directory.fsName + '/' + name); if (f.exists || !f.open('w')) throw new Error('startup_receipt_write'); f.encoding = 'UTF-8'; f.write(text); f.close(); }
    if (!input.open('r')) throw new Error('startup_request_missing');
    var text = input.read(); input.close();
    function quote(value) { var s = String(value), out = '"', i, c, n; for (i = 0; i < s.length; i++) { c = s.charAt(i); n = s.charCodeAt(i); if (c === '"' || c === '\\') out += '\\' + c; else if (n < 32 || n >= 55296 && n <= 57343) out += '\\u' + ('0000' + n.toString(16)).slice(-4); else out += c; } return out + '"'; }
    function facts() { var p = app.project; return '{"appVersion":' + quote(app.version) + ',"projectPresent":' + (p ? 'true' : 'false') + ',"file":' + (p && p.file ? quote(p.file.fsName) : 'null') + ',"dirty":' + (p && typeof p.dirty === 'boolean' ? String(p.dirty) : 'null') + ',"numItems":' + (p ? String(p.numItems) : 'null') + '}'; }
    function ack(code, operationId) { write('ack.json', '{"code":' + quote(code) + ',"operationId":' + quote(operationId) + ',"hostFacts":' + facts() + '}'); }
    // Closed, ASCII-only owner data. No eval/JSON dependency in the bootstrap.
    var match = /^\{"deadline":([0-9]+),"operationId":"([a-f0-9-]{36})"\}$/.exec(text);
    if (!match || new Date().getTime() >= Number(match[1])) return;
    if (new File(directory.fsName + '/executing.json').exists || new File(directory.fsName + '/ack.json').exists) return;
    var command = app.findMenuCommandId('AE Agent Core');
    if (typeof command !== 'number' || command <= 0 || command !== Math.floor(command)) { ack('requires_host_restart', match[2]); return; }
    write('executing.json', '{"operationId":"' + match[2] + '"}');
    if (new Date().getTime() >= Number(match[1])) return;
    app.executeCommand(command);
    ack('menu_executed', match[2]);
} catch (__startupFailure) { /* No unhandled AE modal. Durable owner intent remains unresolved; never replay. */ } }());
