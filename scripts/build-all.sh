#!/usr/bin/env bash
set -euo pipefail

VERSION=$(jq -r .version package.json)
DIST="dist"

rm -rf "$DIST"
mkdir -p "$DIST"

TARGETS=(
  "bun-darwin-arm64:chrome-private-bridge-darwin-arm64"
  "bun-darwin-x64:chrome-private-bridge-darwin-x64"
  "bun-linux-x64:chrome-private-bridge-linux-x64"
  "bun-windows-x64:chrome-private-bridge-windows-x64.exe"
)

for entry in "${TARGETS[@]}"; do
  target="${entry%%:*}"
  name="${entry##*:}"

  echo "Building $name ($target)..."
  bun build --compile --target="$target" src/server.ts --outfile "$DIST/$name"

  echo "Creating tarball..."
  tar -czf "$DIST/${name}-v${VERSION}.tar.gz" -C "$DIST" "$name"
  rm "$DIST/$name"
done

echo ""
echo "SHA256 checksums:"
cd "$DIST"
shasum -a 256 *.tar.gz | tee checksums.txt
