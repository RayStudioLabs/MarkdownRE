#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

app="build/MarkdwonRE.app"
executable="$PWD/$app/Contents/MacOS/MarkdownRE"
if ps -ax -o command= | grep -F -x "$executable" >/dev/null; then
  echo "请先保存文件并退出正在运行的 MarkdwonRE.app，再重新构建。" >&2
  exit 1
fi

npm run build
mkdir -p build
stage="$(mktemp -d build/.markdownre-build.XXXXXX)"
trap 'rm -rf "$stage"' EXIT
staged_app="$stage/MarkdwonRE.app"
mkdir -p "$staged_app/Contents/MacOS" "$staged_app/Contents/Resources/web"
cp macos/Info.plist "$staged_app/Contents/Info.plist"
# A runnable build must not compete with the installed app in Launch Services.
# The DMG packager restores the release plist only inside its temporary staging
# directory. Keep the on-disk app name fixed for local development.
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier org.markdownre.app.development' "$staged_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName MarkdownRE (Development)' "$staged_app/Contents/Info.plist"
cp macos/assets/MarkdownRE.icns "$staged_app/Contents/Resources/MarkdownRE.icns"
cp macos/assets/MarkdownDocument.icns "$staged_app/Contents/Resources/MarkdownDocument.icns"
cp THIRD_PARTY_NOTICES.md THIRD_PARTY_LICENSES.txt LICENSE "$staged_app/Contents/Resources/"
cp -R web-dist/. "$staged_app/Contents/Resources/web/"
swiftc -swift-version 5 -target "$(uname -m)-apple-macosx13.0" -O macos/main.swift macos/Server.swift -o "$staged_app/Contents/MacOS/MarkdownRE" -framework AppKit -framework WebKit -framework Network -framework UniformTypeIdentifiers
codesign --force --sign - "$staged_app"
codesign --verify --deep --strict "$staged_app"
if [[ -e "$app" ]]; then
  # Retire any registration for the replaced build, including builds produced
  # before development and release acquired separate bundle identifiers.
  lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
  if ! "$lsregister" -u "$PWD/$app"; then
    echo "警告：未能撤销旧开发副本的系统登记。" >&2
  fi
  mv "$app" "$stage/previous.app"
fi
if ! mv "$staged_app" "$app"; then
  if [[ -e "$stage/previous.app" ]]; then mv "$stage/previous.app" "$app"; fi
  exit 1
fi
echo "Built $app (development; installer: ./scripts/build-dmg.sh)"
