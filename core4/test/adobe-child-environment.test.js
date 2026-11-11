'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { adobeEnvironment } = require('../runtime/adobe-child-environment');
const known = { SystemRoot: 'C:/Windows', APPDATA: 'C:/Users/Fixture/AppData/Roaming', LOCALAPPDATA: 'C:/Users/Fixture/AppData/Local', ProgramData: 'C:/ProgramData', ProgramFiles: 'C:/Program Files', CommonProgramFiles: 'C:/Program Files/Common Files' };
test('adobe-child-environment reconstructs native folders and a bounded PATH without inheriting owner/provider credentials', () => {
  let query;
  const env = adobeEnvironment('C:/Adobe Folder/AfterFX.exe', { probe(value) { query = value; return JSON.stringify(known); }, userInfo: () => ({ homedir: 'C:/Users/Fixture', username: 'Fixture' }), inherited: { USERPROFILE: '', PATH: 'C:/untrusted-extra', APPDATA: 'wrong', AE_CORE4_CONTROL_TOKEN: 'fixture-secret', OPENAI_API_KEY: 'fixture-provider-secret' } });
  assert.match(query, /GetFolderPath\('ApplicationData'\)/); assert.equal(env.APPDATA, known.APPDATA); assert.equal(env.LOCALAPPDATA, known.LOCALAPPDATA); assert.equal(env.USERPROFILE, 'C:/Users/Fixture'); assert.equal(env.PATH, [path.win32.dirname('C:/Adobe Folder/AfterFX.exe'), path.win32.join(known.SystemRoot, 'System32'), known.SystemRoot].join(';'));
  assert.equal(env.TEMP, path.win32.join(known.LOCALAPPDATA, 'Temp')); assert.equal(env.TMP, env.TEMP); assert.equal(Object.hasOwn(env, 'AE_CORE4_CONTROL_TOKEN'), false); assert.equal(Object.hasOwn(env, 'OPENAI_API_KEY'), false); assert.equal(Object.values(env).some(value => value.includes('untrusted-extra') || value.includes('fixture-secret')), false);
});
test('adobe-child-environment fail-closes missing native folders and unsafe path values', () => {
  for (const patch of [{ APPDATA: '' }, { SystemRoot: 'relative' }, { LOCALAPPDATA: 'C:/bad;path' }]) assert.throws(() => adobeEnvironment('C:/Adobe/AfterFX.exe', { probe: () => JSON.stringify({ ...known, ...patch }), userInfo: () => ({ homedir: 'C:/Users/Fixture', username: 'Fixture' }) }), /adobe_native_environment/);
});
test('adobe-child-environment works from an actually scrubbed owner process without leaking injected secrets', { skip: process.platform !== 'win32' }, () => {
  const script = "const {adobeEnvironment}=require(process.argv[1]);const e=adobeEnvironment(process.execPath);if(!e.USERPROFILE||!e.APPDATA||!e.LOCALAPPDATA||!e.ProgramData||e.PATH.includes('untrusted-extra')||e.OPENAI_API_KEY||e.AE_CORE4_CONTROL_TOKEN)throw Error('unsafe_env');console.log(JSON.stringify({homeMatches:e.USERPROFILE===require('node:os').userInfo().homedir,appdataAbsolute:require('node:path').isAbsolute(e.APPDATA),localAbsolute:require('node:path').isAbsolute(e.LOCALAPPDATA),pathParts:e.PATH.split(';').length,providerPassed:!!e.OPENAI_API_KEY,controlPassed:!!e.AE_CORE4_CONTROL_TOKEN}));";
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]])); Object.assign(env, { USERPROFILE: '', PATH: 'C:/untrusted-extra', OPENAI_API_KEY: 'fixture-provider', AE_CORE4_CONTROL_TOKEN: 'fixture-control' });
  const child = spawnSync(process.execPath, ['-e', script, require.resolve('../runtime/adobe-child-environment')], { env, encoding: 'utf8', windowsHide: true, timeout: 12000 });
  assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { homeMatches: true, appdataAbsolute: true, localAbsolute: true, pathParts: 3, providerPassed: false, controlPassed: false });
});
