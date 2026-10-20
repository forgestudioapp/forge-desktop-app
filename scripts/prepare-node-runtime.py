"""Build-time portable Node.js runtimes for Windows and macOS."""
import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.runtime-cache'
RUNTIMES = ROOT / 'runtimes'
VERSION = '24.20.0'
ARTIFACTS = {
    'win-x64': ('node-win-x64', 'zip', '6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba'),
    'darwin-arm64': ('node-darwin-arm64', 'tar.gz', '40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8'),
    'darwin-x64': ('node-darwin-x64', 'tar.gz', '9e5b2644cf107befb6aefca676b96d3296bc10138096f022ed378d6233ed81f4'),
}

def safe_extract_tar(archive, target):
    with tarfile.open(archive, 'r:gz') as source:
        root = target.resolve()
        for member in source.getmembers():
            destination = (target / member.name).resolve()
            if root != destination and root not in destination.parents:
                raise RuntimeError('Unsafe path in Node archive: ' + member.name)
        source.extractall(target)

def prepare(key):
    target_name, extension, expected = ARTIFACTS[key]
    target = RUNTIMES / target_name
    if target.exists():
        print('Reusing existing Node runtime:', target)
        return
    CACHE.mkdir(exist_ok=True)
    RUNTIMES.mkdir(exist_ok=True)
    upstream = f'node-v{VERSION}-{key}'
    archive = CACHE / f'{upstream}.{extension}'
    if not archive.exists():
        temporary = archive.with_suffix(archive.suffix + '.part')
        with urllib.request.urlopen(f'https://nodejs.org/dist/v{VERSION}/{archive.name}', timeout=120) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        temporary.replace(archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise RuntimeError('Node checksum mismatch: ' + archive.name)
    stage = Path(tempfile.mkdtemp(prefix='node-build-', dir=CACHE))
    try:
        if extension == 'zip':
            with zipfile.ZipFile(archive) as source:
                source.extractall(stage)
        else:
            safe_extract_tar(archive, stage)
        runtime = stage / upstream
        executable = runtime / ('node.exe' if key.startswith('win-') else 'bin/node')
        current_arch = 'arm64' if platform.machine().lower() in ('arm64', 'aarch64') else 'x64'
        if (sys.platform == 'win32' and key == 'win-x64') or (sys.platform == 'darwin' and key == 'darwin-' + current_arch):
            subprocess.run([str(executable), '--version'], check=True, timeout=15)
        inventory = {p.relative_to(runtime).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in runtime.rglob('*') if p.is_file()}
        (runtime / 'integrity.json').write_text(json.dumps(inventory, indent=2))
        runtime.rename(target)
        print('Portable Node prepared:', target)
    finally:
        shutil.rmtree(stage, ignore_errors=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all-macos', action='store_true')
    args = parser.parse_args()
    if args.all_macos:
        keys = ['darwin-arm64', 'darwin-x64']
    elif sys.platform == 'win32':
        keys = ['win-x64']
    elif sys.platform == 'darwin':
        arch = 'arm64' if platform.machine().lower() in ('arm64', 'aarch64') else 'x64'
        keys = ['darwin-' + arch]
    else:
        raise RuntimeError('Unsupported build platform: ' + sys.platform)
    for key in keys:
        prepare(key)

if __name__ == '__main__':
    main()
