'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { twice } = require('./helper.cjs');
test('portable', () => assert.equal(twice(4), 8));
