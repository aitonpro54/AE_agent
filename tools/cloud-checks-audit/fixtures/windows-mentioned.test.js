'use strict';
// Windows и JSX упомянуты только в комментарии. Это не свидетельство зависимости.
const test = require('node:test');
const assert = require('node:assert/strict');
test('portable', () => assert.equal(2 + 2, 4));
