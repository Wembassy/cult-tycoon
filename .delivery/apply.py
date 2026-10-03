"""Apply locally tested source edits only if before/after hashes match exactly."""
import hashlib, json, lzma
from pathlib import Path
root=Path.cwd().resolve(); bundle=Path(__file__).resolve().parent
compressed=b''.join((bundle/f'second-{i}.bin').read_bytes() for i in range(2))
assert hashlib.sha256(compressed).hexdigest()=='d7db252099cbafdd95d334797e73e140f9739c31cc910588bb6d9297a4101edb'
plan=json.loads(lzma.decompress(compressed)); old={}
for name, edits in plan['files']:
    path=(root/name).resolve()
    assert path.is_relative_to(root) and '.git' not in path.parts
    old[name]=path.read_text(encoding='utf-8') if path.exists() else ''
def digest(contents):
    h=hashlib.sha256()
    for name,_ in plan['files']:h.update(name.encode()+b'\0'+contents[name].encode())
    return h.hexdigest()
if digest(old)==plan['updated']:
    print('Source already matches tested snapshot')
else:
    assert digest(old)==plan['original'], 'Concurrent changes detected; refusing overwrite'
    updated={}
    for name,edits in plan['files']:
        lines=old[name].splitlines(keepends=True)
        for start,end,text in reversed(edits):lines[start:end]=[text]
        updated[name]=''.join(lines)
    assert digest(updated)==plan['updated'], 'Reconstruction mismatch'
    for name,text in updated.items():
        path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text,encoding='utf-8')
    print(f'Applied {len(updated)} tested files: {plan["updated"]}')
