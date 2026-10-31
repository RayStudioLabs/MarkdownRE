#!/bin/sh
# Opt in to a per-user Markdown MIME icon. Linux icon themes choose MIME icons
# independently of the application configured to open those files.
set -eu
case "${1:-}" in install|uninstall) action=$1 ;; *) echo "Usage: $0 install|uninstall" >&2; exit 2 ;; esac
asset_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
icon_root="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
for size in 16 24 32 48 64 128 256; do
  source="$asset_dir/document-icons/$size.png"
  destination="$icon_root/${size}x${size}/mimetypes/text-markdown.png"
  if [ ! -f "$source" ]; then echo "Missing icon: $source" >&2; exit 1; fi
  if [ -L "$destination" ]; then echo "Refusing symbolic link: $destination" >&2; exit 1; fi
  if [ -e "$destination" ] && ! cmp -s "$source" "$destination"; then
    echo "Existing user icon would be overwritten: $destination" >&2
    exit 1
  fi
done
for size in 16 24 32 48 64 128 256; do
  source="$asset_dir/document-icons/$size.png"
  destination="$icon_root/${size}x${size}/mimetypes/text-markdown.png"
  if [ "$action" = install ]; then
    mkdir -p "$(dirname -- "$destination")"
    cp "$source" "$destination"
  elif [ -e "$destination" ]; then
    rm "$destination"
  fi
done
if command -v xdg-icon-resource >/dev/null 2>&1; then xdg-icon-resource forceupdate --theme hicolor >/dev/null 2>&1 || true; fi
printf '%s\n' "Markdown MIME icons: $action completed. You may need to refresh or reopen your file manager."
