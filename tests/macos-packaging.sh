#!/bin/bash
# Check the actual shipped bundles without installing or launching either app.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# != 1 || ! -f "$1" ]]; then
    echo "Usage: $0 build/MarkdownRE-<version>-<arch>.dmg" >&2
    exit 2
fi
dmg="$1"
temporary_root="${TMPDIR:-/tmp}"
work=$(mktemp -d "${temporary_root%/}/markdownre-packaging.XXXXXX")
mountpoint="$work/mounted"
mounted=false
cleanup() {
    if [[ "$mounted" == true ]]; then
        if ! hdiutil detach "$mountpoint" >/dev/null; then
            echo "请手动推出验证镜像：$mountpoint" >&2
            return
        fi
    fi
    if [[ -d "$mountpoint" ]]; then rmdir "$mountpoint"; fi
    rmdir "$work"
}
trap cleanup EXIT

hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$mountpoint" "$dmg" >/dev/null
mounted=true
development="build/MarkdwonRE.app"
release="$mountpoint/MarkdwonRE.app"
for app in "$development" "$release"; do
    codesign --verify --deep --strict "$app"
done
python3 - "$development" "$release" <<'PY'
import plistlib
import sys
from pathlib import Path

development, release = map(Path, sys.argv[1:])
for app, expected_id in [(development, 'org.markdownre.app.development'),
                         (release, 'org.markdownre.app')]:
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    assert info['CFBundleIdentifier'] == expected_id, (app, info['CFBundleIdentifier'])
    assert info['CFBundlePackageType'] == 'APPL', app
    assert info['LSApplicationCategoryType'] == 'public.app-category.productivity', app
    assert not info.get('LSUIElement') and not info.get('LSBackgroundOnly'), app
    assert (app / 'Contents/MacOS' / info['CFBundleExecutable']).is_file(), app
    icons = [info['CFBundleIconFile'], info['CFBundleDocumentTypes'][0]['CFBundleTypeIconFile']]
    for icon in icons:
        data = (app / 'Contents/Resources' / icon).read_bytes()
        assert data[:4] == b'icns' and int.from_bytes(data[4:8], 'big') == len(data), (app, icon)
    print(f'PASS: {app.name}: {expected_id}, application and document icons')

assert (release.parent / 'Applications').is_symlink()
assert (release.parent / 'Applications').readlink() == Path('/Applications')
assert len(list(release.parent.glob('*.app'))) == 1
print('PASS: one release app and the Applications installation link in the DMG')
PY
