"""Build-time only. Vendors Python and wheels; never installs into the user's Python."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.runtime-cache'
TARGET = ROOT / 'runtimes' / 'python-win-x64-u2net'
VERSION = '3.13.15'
PYTHON_SHA256 = 'd1f04d990aee1253d8569e8e5104e30fa9f5fa830899f14843448872d936a2cf'

def download(url, target, digest, algorithm='sha256'):
    if target.exists() and hashlib.new(algorithm, target.read_bytes()).hexdigest() == digest:
        return
    temporary = target.with_suffix('.part')
    with urllib.request.urlopen(url, timeout=120) as response, temporary.open('wb') as output:
        shutil.copyfileobj(response, output)
    if hashlib.new(algorithm, temporary.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Checksum mismatch: ' + url)
    temporary.replace(target)

def main():
    if sys.platform != 'win32':
        raise RuntimeError('Prepare this Windows x64 runtime on Windows.')
    if TARGET.exists():
        print('Reusing existing Python runtime; runtime:verify checks its integrity.')
        return
    CACHE.mkdir(exist_ok=True)
    TARGET.parent.mkdir(exist_ok=True)
    archive = CACHE / f'python-{VERSION}-embed-amd64.zip'
    download(f'https://www.python.org/ftp/python/{VERSION}/python-{VERSION}-embed-amd64.zip', archive, PYTHON_SHA256)
    model = CACHE / 'u2netp.onnx'
    download('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', model,
             '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8')
    staging = Path(tempfile.mkdtemp(prefix='python-build-', dir=CACHE))
    with zipfile.ZipFile(archive) as source:
        source.extractall(staging)
    packages = staging / 'Lib' / 'site-packages'
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
                    '--only-binary=:all:', '--platform', 'win_amd64', '--python-version', '3.13',
                    '--implementation', 'cp', '--abi', 'cp313', '--no-compile', '--ignore-installed',
                    '--require-hashes', '--find-links', str(CACHE / 'wheels'),
                    '--target', str(packages), '-r', str(ROOT / 'scripts/rembg-win-x64.lock')], check=True)
    (staging / 'python313._pth').write_text('python313.zip\n.\nLib/site-packages\nimport site\n')
    (staging / 'models').mkdir()
    shutil.copy2(model, staging / 'models/u2netp.onnx')
    shutil.copy2(ROOT / 'scripts/remove-background.py', staging / 'remove-background.py')
    # Preserve all wheel .dist-info licenses and Python's LICENSE.txt in the distribution.
    (staging / 'runtime.json').write_text(json.dumps({'python': VERSION, 'engine': 'onnxruntime-1.30.0', 'model': 'u2netp',
        'platform': 'win32', 'arch': 'x64', 'requirementsSha256': hashlib.sha256((ROOT / 'scripts/rembg-win-x64.lock').read_bytes()).hexdigest()}))
    subprocess.run([str(staging / 'python.exe'), '-I', '-B', str(staging / 'remove-background.py'), '--check'], check=True, timeout=120)
    inventory = {p.relative_to(staging).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in staging.rglob('*') if p.is_file()}
    (staging / 'integrity.json').write_text(json.dumps(inventory, indent=2))
    staging.rename(TARGET)
    print('Private runtime prepared:', TARGET)

if __name__ == '__main__':
    main()
