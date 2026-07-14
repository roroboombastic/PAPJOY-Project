import re, json
from pathlib import Path
root = Path(r'c:\Users\arikta\Desktop\PAPJOY - Copy - Copy - Copy')
frontend = root / 'frontend'
backend = root / 'Backend'
source_files = []
for p in frontend.glob('*.js'):
    source_files.append(p)
for p in frontend.glob('*.html'):
    source_files.append(p)
for p in frontend.glob('*.jsx'):
    source_files.append(p)
for p in (frontend / 'src').rglob('*.js'):
    source_files.append(p)
for p in (frontend / 'src').rglob('*.jsx'):
    source_files.append(p)
patterns = [r'fetch\s*\(', r'axios\.', r'API_BASE_URL', r'API_BASE\b', r'window\.API_BASE_URL', r'localhost', r'127\.0\.0\.1', r'/api/v1', r'/api/']
url_re = re.compile(r"['\"](https?://[^'\"]+|/api/v1[^'\"]*|/api/[^'\"]*)['\"]")
entries=[]
for p in sorted(source_files):
    try:
        text = p.read_text(encoding='utf-8')
    except Exception:
        continue
    for i,line in enumerate(text.splitlines(),1):
        if any(re.search(pat, line) for pat in patterns):
            matches = url_re.findall(line)
            if matches:
                for url in matches:
                    entries.append({'file': str(p.relative_to(root)).replace('\\','/'), 'line': i, 'text': line.strip(), 'url': url})
            else:
                entries.append({'file': str(p.relative_to(root)).replace('\\','/'), 'line': i, 'text': line.strip(), 'url': None})
# backend route extraction
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
index_mounts = []
try:
    text = index.read_text(encoding='utf-8')
    for i,line in enumerate(text.splitlines(),1):
        m = re.search(r"router\.use\(\s*['\"]([^'\"]+)['\"]\s*,\s*([\w_]+)\s*\)", line)
        if m:
            index_mounts.append({'line': i, 'base': m.group(1), 'router': m.group(2), 'text': line.strip()})
except Exception:
    pass
# build mounted route set
mounted = set()
for mount in index_mounts:
    base = mount['base']
    main = mount['router']
    router_file = None
    if main.endswith('Routes'):
        router_file = str((backend / 'routes' / (main[:-6].lower() + '.js')).relative_to(root)).replace('\\','/')
    elif main.endswith('Routes'.lower()):
        router_file = str((backend / 'routes' / (main[:-6].lower() + '.js')).relative_to(root)).replace('\\','/')
    else:
        candidate = backend / 'routes' / (main.replace('Routes','').replace('routes','').lower() + '.js')
        if candidate.exists():
            router_file = str(candidate.relative_to(root)).replace('\\','/')
    for route in backend_routes:
        if router_file and route['file'] == router_file:
            path = route['path']
            if not path.startswith('/'):
                path = '/' + path
            mounted.add(base.rstrip('/') + path)
# add all route paths as fallback
all_paths = set(route['path'] if route['path'].startswith('/') else '/' + route['path'] for route in backend_routes)
# evaluate frontend entries
broken=[]
for e in entries:
    url = e['url']
    if not url:
        continue
    if url.startswith('http'):
        path = re.sub(r'^https?://[^/]+', '', url)
    else:
        path = url
    status = 'Incorrect'
    if path in mounted:
        status = 'Correct'
    elif path in all_paths:
        status = 'Correct (missing base)' if path.startswith('/api/v1') else 'Correct (base mismatch)'
    elif path.startswith('/api/v1') and path[7:] in all_paths:
        status = 'Correct (strip /api/v1)'
    elif path == '/api/cart/sync':
        status = 'Incorrect (missing /api/v1)'
    broken.append({'file': e['file'], 'line': e['line'], 'url': url, 'path': path, 'status': status, 'text': e['text']})
# keep only incorrectish
broken_filtered = [b for b in broken if not b['status'].startswith('Correct')]
# dedupe
seen=set(); unique=[]
for b in broken_filtered:
    key=(b['file'], b['line'], b['url'])
    if key in seen: continue
    seen.add(key)
    unique.append(b)
Path('frontend_backend_api_broken.json').write_text(json.dumps({'broken': unique, 'mounts': index_mounts, 'backend_paths': sorted(all_paths)}, indent=2), encoding='utf-8')
print('done')
