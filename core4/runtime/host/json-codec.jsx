(function () {
    // Lexical ES3 data codec. No global mutation or executable parser.
    var own = Object.prototype.hasOwnProperty, tag = Object.prototype.toString;
    function fault() { throw new Error('host_json_invalid'); }
    function forbidden(key) { return key === '__proto__' || key === 'constructor' || key === 'prototype'; }
    function parse(text) {
        if (typeof text !== 'string' || text.length > 262144) fault();
        var at = 0, nodes = 0;
        function white() { while (at < text.length && (text.charAt(at) === ' ' || text.charAt(at) === '\t' || text.charAt(at) === '\r' || text.charAt(at) === '\n')) at++; }
        function string() {
            if (text.charAt(at++) !== '"') fault();
            var out = '', c, escape, digits;
            while (at < text.length) {
                c = text.charAt(at++);
                if (c === '"') return out;
                if (c.charCodeAt(0) < 32) fault();
                if (c === '\\') {
                    escape = text.charAt(at++);
                    if (escape === 'u') { digits = text.substr(at, 4); if (!/^[0-9a-fA-F]{4}$/.test(digits)) fault(); out += String.fromCharCode(parseInt(digits, 16)); at += 4; }
                    else if (escape === '"' || escape === '\\' || escape === '/') out += escape;
                    else if (escape === 'b') out += '\b'; else if (escape === 'f') out += '\f'; else if (escape === 'n') out += '\n'; else if (escape === 'r') out += '\r'; else if (escape === 't') out += '\t'; else fault();
                } else out += c;
            }
            fault();
        }
        function value(depth) {
            if (depth > 24 || ++nodes > 32768) fault(); white();
            var c = text.charAt(at), result, key, seen, match, number;
            if (c === '"') return string();
            if (c === '{') {
                at++; white(); result = {}; seen = {};
                if (text.charAt(at) === '}') { at++; return result; }
                while (true) {
                    white(); if (text.charAt(at) !== '"') fault(); key = string();
                    if (forbidden(key) || own.call(seen, key)) fault(); seen[key] = true;
                    white(); if (text.charAt(at++) !== ':') fault(); result[key] = value(depth + 1); white(); c = text.charAt(at++);
                    if (c === '}') return result; if (c !== ',') fault();
                }
            }
            if (c === '[') {
                at++; white(); result = []; if (text.charAt(at) === ']') { at++; return result; }
                while (true) { result.push(value(depth + 1)); white(); c = text.charAt(at++); if (c === ']') return result; if (c !== ',') fault(); }
            }
            if (text.substr(at, 4) === 'true') { at += 4; return true; }
            if (text.substr(at, 5) === 'false') { at += 5; return false; }
            if (text.substr(at, 4) === 'null') { at += 4; return null; }
            match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
            if (!match) fault(); at += match[0].length; number = Number(match[0]); if (!isFinite(number)) fault(); return number;
        }
        var result = value(0); white(); if (at !== text.length) fault(); return result;
    }
    function stringify(value) {
        var ancestors = [], nodes = 0;
        function quote(text) {
            var out = '"', i, code, next, c;
            for (i = 0; i < text.length; i++) {
                c = text.charAt(i); code = text.charCodeAt(i); next = text.charCodeAt(i + 1);
                if (c === '"' || c === '\\') out += '\\' + c;
                else if (code < 32 || code === 0x2028 || code === 0x2029 || code >= 0xD800 && code <= 0xDBFF && !(next >= 0xDC00 && next <= 0xDFFF) || code >= 0xDC00 && code <= 0xDFFF && !(i > 0 && text.charCodeAt(i - 1) >= 0xD800 && text.charCodeAt(i - 1) <= 0xDBFF)) out += '\\u' + ('0000' + code.toString(16)).slice(-4);
                else out += c;
            }
            return out + '"';
        }
        function encode(item, depth) {
            if (depth > 24 || ++nodes > 32768) fault();
            if (item === null) return 'null';
            if (typeof item === 'string') return quote(item);
            if (typeof item === 'boolean') return item ? 'true' : 'false';
            if (typeof item === 'number') { if (!isFinite(item)) fault(); return String(item === 0 ? 0 : item); }
            if (typeof item !== 'object') fault();
            var i, k, out = [], array = tag.call(item) === '[object Array]';
            if (!array && (tag.call(item) !== '[object Object]' || item.constructor !== Object)) fault();
            for (i = 0; i < ancestors.length; i++) if (ancestors[i] === item) fault(); ancestors.push(item);
            if (array) for (i = 0; i < item.length; i++) out.push(encode(item[i], depth + 1));
            else for (k in item) if (own.call(item, k)) { if (forbidden(k)) fault(); out.push(quote(k) + ':' + encode(item[k], depth + 1)); }
            ancestors.pop(); return array ? '[' + out.join(',') + ']' : '{' + out.join(',') + '}';
        }
        var result = encode(value, 0); if (result.length > 262144) fault(); return result;
    }
    return { parse: parse, stringify: stringify };
}())
