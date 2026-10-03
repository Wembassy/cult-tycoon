"""Apply the locally tested source diff, with complete before/after SHA guards.
Transport is confined to this delivery branch; it is not a runtime dependency.
"""
import hashlib, json, lzma
from pathlib import Path
root = Path.cwd().resolve()
bundle = Path(__file__).resolve().parent
compressed = b''.join((bundle / f'quality-{i}.bin').read_bytes() for i in range(6))
assert hashlib.sha256(compressed).hexdigest() == '45c0682d23f843bae74fa2aa46f226dadb2aa32d8bbdf7c31f1af2695859393c'
plan = json.loads(lzma.decompress(compressed))
old = {}
for name, edits in plan['files']:
    path = (root / name).resolve()
    assert path.is_relative_to(root) and '.git' not in path.parts
    old[name] = path.read_text(encoding='utf-8') if path.exists() else ''
def digest(contents):
    h = hashlib.sha256()
    for name, _ in plan['files']:
        h.update(name.encode() + b'\0' + contents[name].encode())
    return h.hexdigest()
if digest(old) == plan['updated']:
    print('Validated source changes already applied.')
else:
    assert digest(old) == plan['original'], 'Source changed since local validation; refusing to overwrite.'
    updated = {}
    for name, edits in plan['files']:
        lines = old[name].splitlines(keepends=True)
        for start, end, replacement in reversed(edits):
            lines[start:end] = [replacement]
        updated[name] = ''.join(lines)
    assert digest(updated) == plan['updated'], 'Reconstructed source differs from tested local source.'
    for name, text in updated.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')
    print(f'Applied {len(updated)} validated source files: {plan["updated"]}')
