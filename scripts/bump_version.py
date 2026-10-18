"""Keep Fileport PC version numbers in sync.

Usage:
    python scripts/bump_version.py patch  # 1.9.1 -> 1.9.2
    python scripts/bump_version.py minor  # 1.9.1 -> 1.10.0
    python scripts/bump_version.py --check  # CI consistency check

Patch increments are for regular product builds. Minor increments start a
larger release. Rebuilding the *same commit* does not create a new version.
"""
import json
import re
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PACKAGE=ROOT/"package.json"
TAURI=ROOT/"src-tauri/tauri.conf.json"
CARGO=ROOT/"src-tauri/Cargo.toml"
HTML=ROOT/"src/index.html"
README=ROOT/"README.md"

def parse_version(raw):
    if not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)",raw):
        raise SystemExit(f"Invalid stable version: {raw!r}")
    return tuple(map(int,raw.split(".")))

def current():
    return json.loads(PACKAGE.read_text(encoding="utf-8"))["version"]

def check():
    version=current()
    parse_version(version)
    other=json.loads(TAURI.read_text(encoding="utf-8"))["version"]
    match=re.search(r'^version\s*=\s*"([^"]+)"',CARGO.read_text(encoding="utf-8"),re.M)
    if not match: raise SystemExit("Cargo.toml package version missing")
    cargo_version=match.group(1)
    page=HTML.read_text(encoding="utf-8")
    about=f'<div class="about-row"><span>Version</span><strong>{version}</strong></div>'
    readme=f"**Source version:** v{version}"
    if version != other or version != cargo_version or about not in page or readme not in README.read_text(encoding="utf-8"):
        raise SystemExit(f"Version mismatch: package={version}, Tauri={other}, Rust={cargo_version}; check About and README")
    print(f"Fileport PC v{version}: all versions agree")

def bump(kind):
    major,middle,patch=parse_version(current())
    if kind=="patch":patch+=1
    elif kind=="minor":middle+=1;patch=0
    else:raise SystemExit("Use 'patch', 'minor', or '--check'")
    new=f"{major}.{middle}.{patch}"
    package=json.loads(PACKAGE.read_text(encoding="utf-8"));package["version"]=new
    PACKAGE.write_text(json.dumps(package,indent=2)+"\n",encoding="utf-8")
    tauri=json.loads(TAURI.read_text(encoding="utf-8"));tauri["version"]=new
    TAURI.write_text(json.dumps(tauri,indent=2)+"\n",encoding="utf-8")
    cargo=CARGO.read_text(encoding="utf-8")
    cargo,n=re.subn(r'(^version\s*=\s*")[^"]+(")',lambda m:m.group(1)+new+m.group(2),cargo,count=1,flags=re.M)
    if n!=1:raise SystemExit("Cargo.toml version not found")
    CARGO.write_text(cargo,encoding="utf-8")
    page=HTML.read_text(encoding="utf-8")
    page,n=re.subn(r'(<div class="about-row"><span>Version</span><strong>)[^<]+(</strong></div>)',
       lambda m:m.group(1)+new+m.group(2),page,count=1)
    if n!=1:raise SystemExit("About version field not found")
    HTML.write_text(page,encoding="utf-8")
    text=README.read_text(encoding="utf-8")
    text,n=re.subn(r'(\*\*Source version:\*\* v)\d+\.\d+\.\d+',lambda m:m.group(1)+new,text,count=1)
    if n!=1:raise SystemExit("README source-version marker not found")
    README.write_text(text,encoding="utf-8")
    print(f"Bumped Fileport PC to {new}; write the CHANGELOG entry before publishing")

if __name__=="__main__":
    args=sys.argv[1:]
    if args==["--check"]:check()
    elif len(args)==1 and args[0] in ("patch","minor"):bump(args[0])
    else:raise SystemExit(__doc__)
