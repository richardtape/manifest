#!/usr/bin/env python3
"""[M5] §26's surface (faculty-ready Task 1): every operation, its method and capability, read from the route
definitions in packages/control-plane/src/api/routes/*.ts. Text parse: each `operationId:` opens a route, and the
`method:`, `capability:` and `auth:` lines up to the next `operationId:` are its."""
import glob, re, os, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else 'packages/control-plane/src'
OWNER = ['project:read','project:write','project:delete','source:write','secret:write','output:read','agent:session',
         'members:manage','build:create','release:create','release:deploy','release:promote','launch:rehearse',
         'launch:submit','launch:draft','approval:request']
ADMIN_OWN = ['release:approve','launch:record','quota:set']
rows = []
for f in sorted(glob.glob(f'{ROOT}/api/routes/*.ts')):
    if f.endswith('.test.ts'): continue
    src = open(f).read()
    parts = re.split(r"\boperationId:\s*'", src)
    for p in parts[1:]:
        op = p.split("'", 1)[0]
        m = re.search(r"\bmethod:\s*'([A-Z]+)'", p)
        c = re.search(r"\bcapability:\s*(\[[^\]]*\]|'[a-z:]+')", p)
        a = re.search(r"\bauth:\s*'([a-z-]+)'", p)
        pub = re.search(r"\bpublishEvent\(|\bpublish\(", p)
        cap = '-' if not c else ('|'.join(re.findall(r"'([a-z:]+)'", c.group(1))))
        rows.append((os.path.basename(f), op, m.group(1) if m else '?', cap, a.group(1) if a else '-'))
mut = [r for r in rows if r[2] not in ('GET', '?')]
print(f'operations: {len(rows)}; mutating (not GET): {len(mut)}')
print('\nMUTATING, capability in OWNER (an administrator who is not a member would need a reason):')
o = [r for r in mut if r[3] != '-' and all(x in OWNER for x in r[3].split('|'))]
for r in o: print(f'  {r[1]:32} {r[2]:6} {r[3]:18} auth={r[4]:10} {r[0]}')
print(f'  count: {len(o)}')
print('\nMUTATING, an administrator\'s own capability (exempt):')
x = [r for r in mut if r[3] != '-' and any(x in ADMIN_OWN for x in r[3].split('|'))]
for r in x: print(f'  {r[1]:32} {r[2]:6} {r[3]:18} auth={r[4]:10} {r[0]}')
print(f'  count: {len(x)}')
print('\nMUTATING, no project capability declared (session-only, platform-wide, or outside a project):')
n = [r for r in mut if r not in o and r not in x]
for r in n: print(f'  {r[1]:32} {r[2]:6} {r[3]:18} auth={r[4]:10} {r[0]}')
print(f'  count: {len(n)}')
unk = [r for r in rows if r[2] == '?']
if unk: print('\nUNPARSED METHOD:', unk)
