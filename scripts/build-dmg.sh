#!/bin/bash
# Adapted from SleepControl, copyright © 2026 daichenyu, MIT license; see THIRD_PARTY_NOTICES.md.
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/build-macos.sh

APP="build/MarkdwonRE.app"
APP_NAME="MarkdwonRE.app"
VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")
ARCHS=$(/usr/bin/lipo -archs "$APP/Contents/MacOS/MarkdownRE")
case "$ARCHS" in
    "arm64"|"x86_64") ARCH_LABEL="$ARCHS" ;;
    *) ARCH_LABEL="universal" ;;
esac
DMG_NAME="MarkdownRE-$VERSION-$ARCH_LABEL.dmg"
STAGE=$(mktemp -d "$PWD/build/.dmg-stage.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT
DOCUMENTATION="$STAGE/.documentation"
mkdir "$DOCUMENTATION"

/usr/bin/codesign --verify --deep --strict "$APP"
/usr/bin/ditto "$APP" "$STAGE/$APP_NAME"
# Only the installable copy uses the release identity. Leaving another release
# bundle in build/ can make macOS resolve the app ID to that copy and omit the
# installed app from the Apps browser. The staged copy is removed on exit.
cp macos/Info.plist "$STAGE/$APP_NAME/Contents/Info.plist"
/usr/bin/codesign --force --sign - "$STAGE/$APP_NAME"
/usr/bin/codesign --verify --deep --strict "$STAGE/$APP_NAME"
cat > "$DOCUMENTATION/安装说明.txt" <<INSTRUCTIONS
MarkdownRE $VERSION

安装：将「${APP_NAME}」拖入旁边的 Applications 文件夹。
安装完成后推出磁盘映像，在「应用程序」中打开 MarkdownRE。

系统要求：macOS 13 或更高版本。
处理器架构：$ARCHS
此本地试用版采用 ad-hoc 签名，未经过 Apple 公证。如果 macOS 阻止打开，确认文件来源后可在「系统设置 → 隐私与安全性」中允许打开。
INSTRUCTIONS
cat > "$DOCUMENTATION/Read Me.txt" <<INSTRUCTIONS
MarkdownRE $VERSION

Drag $APP_NAME to the Applications folder, eject the disk image and open the app from Applications.

Requires macOS 13 or later. Processor architecture: $ARCHS
This local build is ad-hoc signed and not notarized by Apple. If macOS blocks it, verify the source and allow it in System Settings > Privacy & Security.
INSTRUCTIONS

DMG_PYTHON="${DMG_PYTHON:-python3}"
if ! "$DMG_PYTHON" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
    echo 'DMG 打包需要 Python 3.10 或更新版本，可通过 DMG_PYTHON 指定。' >&2
    exit 1
fi
TOOLS="$PWD/build/dmg-tools"
if [ ! -x "$TOOLS/bin/python" ]; then "$DMG_PYTHON" -m venv "$TOOLS"; fi
if ! cmp -s scripts/requirements-dmg.txt "$TOOLS/.requirements"; then
    "$TOOLS/bin/python" -m pip install --disable-pip-version-check -r scripts/requirements-dmg.txt
    cp scripts/requirements-dmg.txt "$TOOLS/.requirements"
fi
swift scripts/generate-dmg-background.swift "$STAGE"
"$TOOLS/bin/dmgbuild" -s scripts/dmg-settings.py \
    -D "app=$STAGE/$APP_NAME" -D "documentation=$DOCUMENTATION" \
    -D "icon=$PWD/macos/assets/MarkdownRE.icns" -D "background=$STAGE/background.png" \
    "MarkdownRE $VERSION" "$STAGE/$DMG_NAME"
/usr/bin/hdiutil verify "$STAGE/$DMG_NAME"
mv -f "$STAGE/$DMG_NAME" "build/$DMG_NAME"
(cd build && /usr/bin/shasum -a 256 "$DMG_NAME" > "$DMG_NAME.sha256")
printf '已生成安装包: %s/build/%s\n' "$PWD" "$DMG_NAME"
