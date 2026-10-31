"""Local-only bounded scanner and source binding verification before freeze."""
from pathlib import Path
import hashlib
import importlib.util
import json
import re
import subprocess
import sys

packet = Path(__file__).resolve().parent
root = packet.parents[3]
scanner_path = Path('C:/Users/Ant/.codex/skills/codex-pro-review-bundle-skill/pro-review-bundle/scripts/build_bundle.py')
spec = importlib.util.spec_from_file_location('bundle_scanner', scanner_path)
scanner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = scanner
spec.loader.exec_module(scanner)
digest = lambda b: hashlib.sha256(b).hexdigest()
resolved = []
for name in ['request.md', 'plan.md', 'source-excerpts.md']:
    text = (packet / name).read_text(encoding='utf-8')
    if scanner.secret_hits(text):
        raise RuntimeError('secret-like content: ' + name)
    for kind, pattern in scanner.PII_PATTERNS:
        for match in pattern.finditer(text):
            line_start = text.rfind('\n', 0, match.start()) + 1
            line_end = text.find('\n', match.end())
            line = text[line_start:line_end if line_end >= 0 else None]
            in_hash = any(m.start() <= match.start() and m.end() >= match.end() for m in re.finditer(r'\b[a-f0-9]{40,64}\b', text))
            known_limit = match.group(0) == '3155378975999999999' and 'BigInt(s.birthTicks)' in line
            if kind != 'phone_like' or not (in_hash or known_limit):
                raise RuntimeError('unresolved possible PII: ' + name + ':' + str(text.count('\n', 0, match.start()) + 1))
            resolved.append({'file': name, 'kind': kind, 'line': text.count('\n', 0, match.start()) + 1, 'classification': 'immutable source hash digit run' if in_hash else 'DateTime tick limit constant'})
source_index = json.loads((packet / 'source-index.json').read_text(encoding='utf-8'))
excerpt = (packet / 'source-excerpts.md').read_text(encoding='utf-8')
quoted_lines = 0
for entry in source_index:
    data = (root / entry['path']).read_bytes()
    committed = subprocess.check_output(['git', 'show', entry['baseCommit'] + ':' + entry['path']], cwd=root)
    if digest(data) != entry['sha256'] or data != committed:
        raise RuntimeError('source hash/base mismatch: ' + entry['path'])
    section = excerpt.split('## ' + entry['path'] + '\n', 1)[1].split('\n## ', 1)[0]
    lines = data.decode('utf-8').splitlines()
    for first, last in entry['ranges']:
        for number in range(first, last + 1):
            expected = str(number) + (': ' + lines[number - 1] if lines[number - 1] else ':')
            if expected not in section.splitlines():
                raise RuntimeError('excerpt line mismatch: ' + entry['path'] + ':' + str(number))
            quoted_lines += 1
report = {'status': 'COMPLETE', 'sourceFilesVerified': len(source_index), 'sourceLinesVerified': quoted_lines, 'secretHits': 0, 'unresolvedPossiblePii': 0, 'resolvedTechnicalIdentifierWarnings': resolved, 'skippedFiles': 0, 'redactions': 0, 'privacySummary': 'Only logical host labels; no runtime state/credentials/user assets/account or personal paths. Source excerpt allowlist intentionally omits unchanged actor-constructor line.'}
(packet / 'local-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
