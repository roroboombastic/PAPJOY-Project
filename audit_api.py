import re, json
from pathlib import Path
root = Path(r'c:\Users\arikta\Desktop\PAPJOY - Copy - Copy - Copy')
frontend = root / 'frontend'
backend = root / 'Backend'
patterns = [r'fetch\s*\(', r'axios\.', r'API_BASE_URL', r'API_BASE\b', r'window\.API_BASE_URL', r'localhost', r'127\.0\.0\.1', r'/api/v1', r'/api/']
frontend_files = []
for ext in ['.js', '.jsx', '.html']:
    frontend_files.extend(sorted(frontend.rglob(f'*{ext}')))
entries=[]
for p in frontend_files:
    try:
        text = p.read_text(encoding='utf-8')
    except Exception:
        continue
    for i,line in enumerate(text.splitlines(),1):
        for pat in patterns:
            if re.search(pat, line):
                entries.append({'file': str(p.relative_to(root)).replace('\\','/'), 'line': i, 'text': line.strip()})
                break

backend_routes=[]
for p in sorted((backend / 'routes').glob('*.js')):
    try:
        text = p.read_text(encoding='utf-8')
    except Exception:
        continue
    for i,line in enumerate(text.splitlines(),1):
        m = re.search(r"router\.(get|post|put|delete|patch|use)\(\s*['\"]([^'\"]+)['\"]", line)
        if m:
            backend_routes.append({'file': str(p.relative_to(root)).replace('\\','/'), 'line': i, 'method': m.group(1).upper(), 'path': m.group(2)})

index = backend / 'routes' / 'index.js'
index_mounts=[]
try:
    text = index.read_text(encoding='utf-8')
    for i,line in enumerate(text.splitlines(),1):
        m = re.search(r"router\.use\(\s*['\"]([^'\"]+)['\"]\s*,\s*([\w_]+)\s*\)", line)
        if m:
            index_mounts.append({'line': i, 'base': m.group(1), 'router': m.group(2), 'lineText': line.strip()})
except Exception:
    pass

out = {'frontend_entries': entries, 'backend_routes': backend_routes, 'index_mounts': index_mounts}
print(json.dumps(out, indent=2))
