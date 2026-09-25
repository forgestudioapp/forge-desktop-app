"""Build-time portable Node.js; no system installation or registry changes."""
import hashlib,json,shutil,subprocess,tempfile,urllib.request,zipfile,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'.runtime-cache'
TARGET=ROOT/'runtimes/node-win-x64'
VERSION='24.20.0'
SHA256='6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba'
if TARGET.exists():
 print('Reusing existing Node runtime; runtime:verify checks its integrity.'); sys.exit(0)
CACHE.mkdir(exist_ok=True);TARGET.parent.mkdir(exist_ok=True)
archive=CACHE/f'node-v{VERSION}-win-x64.zip'
if not archive.exists():
 with urllib.request.urlopen(f'https://nodejs.org/dist/v{VERSION}/{archive.name}',timeout=120) as response,archive.open('wb') as output:
  shutil.copyfileobj(response,output)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=SHA256: raise RuntimeError('Node checksum mismatch')
stage=Path(tempfile.mkdtemp(prefix='node-build-',dir=CACHE))
with zipfile.ZipFile(archive) as source: source.extractall(stage)
runtime=stage/f'node-v{VERSION}-win-x64'
subprocess.run([str(runtime/'node.exe'),'--version'],check=True,timeout=15)
inventory={p.relative_to(runtime).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in runtime.rglob('*') if p.is_file()}
(runtime/'integrity.json').write_text(json.dumps(inventory,indent=2))
runtime.rename(TARGET)
print('Portable Node prepared:',TARGET)
