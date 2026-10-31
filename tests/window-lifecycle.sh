#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/lifecycle-test
python3 - <<'PY'
from pathlib import Path
source = Path('macos/main.swift').read_text()
entry = 'let app=NSApplication.shared\n'
assert entry in source
Path('build/lifecycle-test/main.swift').write_text(source[:source.rindex(entry)] + Path('tests/window-lifecycle.swift').read_text())
PY
swiftc -swift-version 5 -target "$(uname -m)-apple-macosx13.0" macos/Server.swift build/lifecycle-test/main.swift -o build/lifecycle-test/WindowLifecycle -framework AppKit -framework WebKit -framework Network -framework UniformTypeIdentifiers -framework PDFKit -framework Vision
build/lifecycle-test/WindowLifecycle "$PWD/web-dist"
