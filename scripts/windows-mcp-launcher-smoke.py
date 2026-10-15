"""Offline Windows smoke; never starts the real MCP adapter or AE."""
import ctypes
from ctypes import wintypes
import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / '.codex-runtime/windows-mcp-launcher/ae-mcp-launcher.exe'
KERNEL = ctypes.WinDLL('kernel32', use_last_error=True)
USER = ctypes.WinDLL('user32', use_last_error=True)
KERNEL.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
KERNEL.OpenProcess.restype = wintypes.HANDLE
KERNEL.CloseHandle.argtypes = [wintypes.HANDLE]
KERNEL.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
KERNEL.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
KERNEL.CreateJobObjectW.restype = wintypes.HANDLE
KERNEL.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
KERNEL.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
USER.GetForegroundWindow.restype = wintypes.HWND
PAYLOAD = bytes(range(256)) * 4096
ERROR_BYTES = b'stderr\x00\xff\r\n'
ARGUMENTS = ['', 'space value', 'quote"value', 'trailing slash\\', 'slash\\"quote', 'кириллица']
DUMMY = r'''
import ctypes, json, os, pathlib, subprocess, sys, time
root = pathlib.Path.cwd()
if sys.argv[1] == 'daemon':
    (root / 'daemon-ready').write_text(str(os.getpid()))
    time.sleep(60)
else:
    row = dict(pid=os.getpid(), console=ctypes.windll.kernel32.GetConsoleWindow(),
               args=sys.argv[2:], cwd=os.getcwd(), marker=os.environ['AE_MCP_SMOKE_MARKER'])
    if sys.argv[1] == 'lifetime':
        daemon = subprocess.Popen([sys.executable, __file__, 'daemon'], stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000)
        row['daemonPid'] = daemon.pid
    (root / 'ready.json').write_text(json.dumps(row), encoding='utf-8')
    if sys.argv[1] == 'lifetime':
        time.sleep(60)
    else:
        data = sys.stdin.buffer.read()
        sys.stdout.buffer.write(data)
        sys.stderr.buffer.write(b'stderr\x00\xff\r\n')
        sys.exit(23)
'''


def wait_file(file):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if file.exists():
            try:
                return json.loads(file.read_text(encoding='utf-8'))
            except json.JSONDecodeError:
                pass
        time.sleep(.02)
    raise AssertionError(f'dummy did not become ready: {file.name}')


def process_handle(pid):
    handle = KERNEL.OpenProcess(0x100000 | 1, False, pid)
    assert handle, f'cannot open dummy {pid}'
    return handle


def check_windows(pids):
    windows = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    USER.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    USER.IsWindowVisible.argtypes = [wintypes.HWND]

    @callback_type
    def callback(hwnd, _):
        pid = wintypes.DWORD()
        USER.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids and USER.IsWindowVisible(hwnd):
            windows.append(int(hwnd))
        return True

    USER.EnumWindows(callback, 0)
    assert not windows, f'visible dummy/launcher windows: {windows}'


def run_dummy(mode):
    base = ROOT / '.codex-runtime/windows-mcp-launcher'
    with tempfile.TemporaryDirectory(prefix='smoke-', dir=base) as directory:
        folder = Path(directory)
        dummy = folder / 'dummy child.py'
        dummy.write_text(DUMMY, encoding='utf-8')
        env = dict(os.environ, AE_MCP_SMOKE_MARKER='stdio-preserved')
        foreground = USER.GetForegroundWindow()
        proc = subprocess.Popen([str(LAUNCHER), sys.executable, str(dummy), mode, *ARGUMENTS],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                cwd=folder, env=env)
        daemon_handle = child_handle = None
        try:
            row = wait_file(folder / 'ready.json')
            assert row['console'] == 0, row
            assert row['args'] == ARGUMENTS and row['marker'] == 'stdio-preserved', row
            assert Path(row['cwd']) == folder
            for _ in range(25):
                check_windows({proc.pid, row['pid']})
                assert USER.GetForegroundWindow() == foreground, 'foreground changed during dummy launch'
                time.sleep(.02)
            if mode == 'echo':
                stdout, stderr = proc.communicate(PAYLOAD, timeout=8)
                assert (stdout, stderr, proc.returncode) == (PAYLOAD, ERROR_BYTES, 23)
                return dict(bytes=len(stdout), stderrBytes=len(stderr), exitCode=23,
                            console=0, visibleWindows=0, foregroundUnchanged=True,
                            argvEnvironmentCwd=True, eof=True)
            child_handle = process_handle(row['pid'])
            daemon_handle = process_handle(row['daemonPid'])
            deadline = time.monotonic() + 5
            while not (folder / 'daemon-ready').exists() and time.monotonic() < deadline:
                time.sleep(.02)
            assert (folder / 'daemon-ready').exists()
            proc.kill()  # Only our launcher; the private job must kill only its adapter.
            proc.wait(timeout=5)
            assert KERNEL.WaitForSingleObject(child_handle, 5000) == 0, 'adapter orphaned'
            assert KERNEL.WaitForSingleObject(daemon_handle, 0) == 258, 'shared daemon was killed'
            return dict(launcherCancellation=True, adapterExited=True, descendantSurvived=True)
        finally:
            if proc.poll() is None:
                proc.kill()
            proc.wait(timeout=5)
            for stream in (proc.stdin, proc.stdout, proc.stderr):
                stream.close()
            # Handles identify only smoke processes; never enumerate or kill real adapters.
            for handle in (child_handle, daemon_handle):
                if handle:
                    if KERNEL.WaitForSingleObject(handle, 0) == 258:
                        KERNEL.TerminateProcess(handle, 0)
                        KERNEL.WaitForSingleObject(handle, 5000)
                    KERNEL.CloseHandle(handle)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--nested-worker':
        assert sys.stdin.readline().strip() == 'go'
        print(json.dumps(dict(echo=run_dummy('echo'), lifetime=run_dummy('lifetime'))))
    else:
        report = dict(echo=run_dummy('echo'), lifetime=run_dummy('lifetime'))
        # An existing caller job must allow the Windows 10+ atomic nested job.
        outer_job = KERNEL.CreateJobObjectW(None, None)
        assert outer_job
        worker = subprocess.Popen([sys.executable, __file__, '--nested-worker'],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  creationflags=0x08000000)
        try:
            assert KERNEL.AssignProcessToJobObject(outer_job, int(worker._handle))
            out, err = worker.communicate(b'go\n', timeout=15)
            assert worker.returncode == 0, err.decode('utf-8', errors='replace')
            report['nestedJob'] = json.loads(out)
        finally:
            if worker.poll() is None:
                worker.kill()
                worker.wait()
            KERNEL.CloseHandle(outer_job)
        report['collectedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        binary = LAUNCHER.read_bytes()
        pe_offset = int.from_bytes(binary[0x3c:0x40], 'little')
        subsystem = int.from_bytes(binary[pe_offset + 24 + 68:pe_offset + 24 + 70], 'little')
        assert subsystem == 2, 'launcher must use Windows GUI subsystem (WinExe)'
        report['binarySha256'] = hashlib.sha256(binary).hexdigest()
        report['sourceSha256'] = hashlib.sha256((ROOT / 'scripts/windows-mcp-launcher.cs').read_bytes()).hexdigest()
        report['peSubsystem'] = subsystem
        target = ROOT / '.codex-runtime/windows-mcp-launcher/smoke-report.json'
        target.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False))
