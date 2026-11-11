'use strict';
// Shared Adobe child environment only. Never widen the owner/client environment.
const path = require('node:path');
const os = require('node:os');
const { windowsProbe } = require('./render-job-history');
const FOLDERS = Object.freeze({ SystemRoot: 'Windows', APPDATA: 'ApplicationData', LOCALAPPDATA: 'LocalApplicationData',
  ProgramData: 'CommonApplicationData', ProgramFiles: 'ProgramFiles', CommonProgramFiles: 'CommonProgramFiles',
  'ProgramFiles(x86)': 'ProgramFilesX86', 'CommonProgramFiles(x86)': 'CommonProgramFilesX86' });
const QUERY = '@{' + Object.entries(FOLDERS).map(([key, folder]) => "'" + key + "'=[Environment]::GetFolderPath('" + folder + "')").join(';') + '} | ConvertTo-Json -Compress';
function adobeEnvironment(executable, { probe = windowsProbe, userInfo = os.userInfo, inherited = process.env, failure = 'adobe_native_environment' } = {}) {
  const valid = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && path.win32.isAbsolute(value) && !/[;\x00-\x1f]/.test(value);
  const requireFact = condition => { if (!condition) throw new Error(failure); };
  const known = JSON.parse(probe(QUERY, failure)), user = userInfo();
  requireFact(valid(executable) && [known.SystemRoot, known.APPDATA, known.LOCALAPPDATA, known.ProgramData, user.homedir].every(valid));
  requireFact(typeof user.username === 'string' && user.username.length > 0 && user.username.length <= 256 && !/[\x00-\x1f]/.test(user.username));
  const windows = known.SystemRoot, system = path.win32.join(windows, 'System32'), homeRoot = path.win32.parse(user.homedir).root;
  const env = Object.fromEntries(Object.keys(FOLDERS).filter(key => valid(known[key])).map(key => [key, known[key]]));
  const temp = valid(inherited.TEMP) ? inherited.TEMP : path.win32.join(known.LOCALAPPDATA, 'Temp');
  return { ...env, WINDIR: windows, SYSTEMDRIVE: path.win32.parse(windows).root.slice(0, 2), ComSpec: path.win32.join(system, 'cmd.exe'),
    PATH: [path.win32.dirname(executable), system, windows].join(';'), PATHEXT: '.COM;.EXE;.BAT;.CMD',
    USERPROFILE: user.homedir, USERNAME: user.username, HOMEDRIVE: homeRoot.slice(0, 2), HOMEPATH: user.homedir.slice(2),
    TEMP: temp, TMP: temp, NODE_V8_COVERAGE: '' };
}
module.exports = { adobeEnvironment };
