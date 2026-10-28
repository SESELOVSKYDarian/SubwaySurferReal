"""Discover MP3 files for local playback and the static GitHub Pages playlist."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def playlist(root=ROOT, staged=False):
    root = Path(root).resolve()
    folder = root / 'assets' / 'audio'
    if staged:
        result = subprocess.run(['git', 'ls-files', '--stage', '-z', '--', 'assets/audio'],
                                cwd=root, check=True, capture_output=True)
        files = []
        for record in result.stdout.decode('utf8').split('\0'):
            if not record:
                continue
            metadata, name = record.split('\t', 1)
            if metadata.split()[0] in ('100644', '100755'):
                files.append(Path(name).relative_to('assets/audio'))
    else:
        files = [p.relative_to(folder) for p in folder.rglob('*')
                 if p.is_file() and not p.is_symlink()] if folder.exists() else []
    names = sorted((p.as_posix() for p in files if p.suffix.lower() == '.mp3'), key=str.casefold)
    return {'tracks': [quote(name, safe='/') for name in names]}


def write_playlist(root=ROOT, staged=False):
    target = Path(root) / 'assets' / 'audio' / 'playlist.json'
    content = json.dumps(playlist(root, staged), ensure_ascii=False, indent=2) + '\n'
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or target.read_text(encoding='utf8') != content:
        target.write_text(content, encoding='utf8', newline='\n')
    return target


def install_hook(root=ROOT):
    current = subprocess.run(['git', 'config', '--get', 'core.hooksPath'], cwd=root, capture_output=True, text=True)
    if current.stdout.strip() not in ('', '.githooks'):
        raise RuntimeError('Ya existe una configuración de hooks; no se reemplazó.')
    subprocess.run(['git', 'config', '--local', 'core.hooksPath', '.githooks'], cwd=root, check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--staged', action='store_true')
    parser.add_argument('--stage', action='store_true')
    parser.add_argument('--install-hook', action='store_true')
    args = parser.parse_args()
    if args.stage and not args.staged:
        parser.error('--stage requiere --staged para incluir solo los MP3 del commit')
    write_playlist(args.root, args.staged)
    if args.stage:
        subprocess.run(['git', 'add', '--', 'assets/audio/playlist.json'], cwd=args.root, check=True)
    if args.install_hook:
        install_hook(args.root)
