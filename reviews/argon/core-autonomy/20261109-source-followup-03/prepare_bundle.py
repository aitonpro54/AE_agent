"""Build the explicitly authorized static source-review packet, never run project code."""
import hashlib
import json
import pathlib
import runpy
import subprocess
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[4]
REVIEW = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path.home() / 'Documents/ChatGPT/ARGON_BrowserUse/packets/ae-core-autonomy-source-20261109-03'
STAGE = OUT / 'source'
KUMO = pathlib.Path.home() / 'AppData/Roaming/npm/node_modules/@kumoproductions/mcp-aftereffects'
SKILL = pathlib.Path.home() / '.codex/skills/codex-pro-review-bundle-skill/pro-review-bundle/scripts/build_bundle.py'
REVIEW_ID = 'ae-core-autonomy-source-followup-03'

CORE_FILES = [
    'core4/core/broker.js', 'core4/protocol/json.js',
    'core4/core/receiver.js', 'core4/core/ledger.js', 'core4/core/authority.js',
    'core4/core/state-lock.js', 'core4/protocol/dispatch.js',
    'core4/integrations/cep/http-peer.js',
    'core4/runtime/attachment-owner.js', 'core4/runtime/stdio-entry.js',
    'core4/runtime/controller-lease.js', 'core4/runtime/work-session.js',
    'core4/runtime/start-over-state.js', 'core4/runtime/start-over-inspection.js',
    'core4/runtime/start-over-panel-control.js', 'core4/tools/operate-start-over.js',
    'core4/cep/js/panel.js', 'core4/cep/js/poll-dispatcher.js',
    'core4/runtime/manual-policy.js', 'core4/runtime/operator-confirmation.js',
    'core4/runtime/windows-reservation-provider.js',
    'core4/runtime/project-save-proof.js', 'core4/runtime/project-lifecycle-proof.js',
    'core4/runtime/media-layer-proof.js',
    'core4/test/integration/cep-transport.test.js',
    'core4/test/owner-attachments.test.js', 'core4/test/start-over-operator.test.js',
    'core4/test/panel-start-over.test.js', 'core4/test/manual-runtime.test.js',
    'core4/test/media-layers.test.js', 'core4/test/modules/photo-placeholder.test.js',
    'core4/test/project-lifecycle.test.js', 'core4/test/project-save.test.js',
]
for module in ['project-inspection', 'media-import', 'layer-insert', 'photo-placeholder', 'project-lifecycle', 'project-save', 'comp-frame-export']:
    for name in ['contract.json', 'artifact.json', 'implementation.js', 'executor.jsx']:
        if module == 'project-inspection' and name == 'implementation.js':
            continue  # This built-in module has no separate implementation.js in the source tree.
        CORE_FILES.append(f'core4/modules/{module}/{name}')
    admission = f'core4/config/admissions/{module}.json'
    if (ROOT / admission).exists():
        CORE_FILES.append(admission)

KUMO_FILES = [
    'LICENSE', 'dist/policy.js', 'dist/registry.js', 'dist/opschema.js',
    'dist/tools/do.js', 'dist/operations/batch.js', 'dist/operations/instance.js',
    'dist/operations/layer.js', 'dist/operations/layer-advanced.js',
    'dist/operations/project.js', 'dist/transport/AeTransport.js',
    'dist/transport/FileIpcTransport.js', 'dist/transport/dialogs.js',
    'dist/transport/instances.js', 'dist/config.js', 'jsx/agent.jsx', 'jsx/dispatcher.jsx',
    'jsx/serve.jsx', 'jsx/helpers.jsx',
]

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    scanner = runpy.run_path(str(SKILL))
    rows, hits = [], []
    groups = {'core': [], 'kumo': []}
    for group, origin, files in [('core', ROOT, CORE_FILES), ('kumo', KUMO, KUMO_FILES)]:
        for rel in files:
            path = origin / rel
            if not path.is_file():
                raise RuntimeError(f'Missing explicitly selected file: {group}/{rel}')
            data = path.read_bytes()
            text = data.decode('utf-8')
            if '\x00' in text:
                raise RuntimeError(f'Binary file: {rel}')
            # Only reviewed public installed JavaScript is staged; no node_modules tree/config is copied.
            staged_rel = rel if group == 'core' else 'kumo/' + rel.removeprefix('dist/')
            destination = STAGE / staged_rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            groups[group].append(staged_rel)
            rows.append({'group': group, 'origin_relative_path': rel, 'packet_path': staged_rel,
                         'bytes': len(data), 'lines': len(text.splitlines()), 'sha256': digest(data),
                         'content': 'full file, exact bytes, no redactions'})
            for kind, regex in scanner['SECRET_PATTERNS'] + scanner['PII_PATTERNS']:
                for match in regex.finditer(text):
                    hits.append({'file': staged_rel, 'kind': kind,
                                 'line': text.count('\n', 0, match.start()) + 1,
                                 'matched': match.group(), 'status': 'REQUIRES_SEMANTIC_REVIEW'})
    task = (REVIEW / 'review-request.md').read_text(encoding='utf-8')
    for kind, regex in scanner['SECRET_PATTERNS'] + scanner['PII_PATTERNS']:
        for match in regex.finditer(task):
            hits.append({'file': 'review-request.md', 'kind': kind,
                         'line': task.count('\n', 0, match.start()) + 1,
                         'matched': match.group(), 'status': 'REQUIRES_SEMANTIC_REVIEW'})
    (OUT / 'scanner-hits.json').write_text(json.dumps(hits, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (OUT / 'review-request.md').write_text(task, encoding='utf-8')
    scanner_runs = []
    for group, files in groups.items():
        command = [sys.executable, str(SKILL), '--root', str(STAGE), '--title', f'Argon source review {group}',
                   '--task-file', str(REVIEW / 'review-request.md'), '--max-files', '100',
                   '--max-total-bytes', '1500000', '--max-file-bytes', '150000',
                   '--output', str(OUT / f'{group}-raw-scanner.md')]
        for file in files:
            command += ['--include', file]
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
        (OUT / f'{group}-scanner-result.txt').write_text(result.stdout+'\n'+result.stderr, encoding='utf-8')
        scanner_runs.append({'group': group, 'exit_code': result.returncode,
                             'raw_report': f'{group}-raw-scanner.md'})
        if result.returncode not in (0, 3):
            raise RuntimeError(f'Unexpected scanner failure: {group} code {result.returncode}')
    manifest = {'review_id': REVIEW_ID,
                'prepared_at': datetime.now(timezone.utc).isoformat(),
                'source_head': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
                'kumo_version': json.loads((KUMO/'package.json').read_text(encoding='utf-8'))['version'],
                'completeness': 'PENDING_SEMANTIC_REVIEW', 'selected_scope': 'complete files on explicit allowlist, not entire repositories',
                'files': rows, 'scanner_runs': scanner_runs, 'candidate_match_count': len(hits),
                'original_source_modifications': 0, 'project_code_executed': False,
                'software_tests_run': False, 'browser_upload_authorized_by_user': True,
                'excluded': ['AEP/media', 'runtime/config/credentials', 'browser profiles', 'full logs', 'unselected code']}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'packet_dir':str(OUT),'file_count':len(rows),'bytes':sum(r['bytes'] for r in rows),'candidate_matches':len(hits),'scanner_runs':scanner_runs},ensure_ascii=False))

if __name__ == '__main__':
    main()
