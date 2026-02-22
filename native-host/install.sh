#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.chrome_bridge.native_host"

# Check for extension ID argument
if [ -z "${1:-}" ]; then
  echo "Usage: install.sh <extension-id>"
  exit 1
fi

EXT_ID="$1"

# Copy the host.ts to a stable location
HOST_LIB="/usr/local/lib/chrome-bridge"
mkdir -p "$HOST_LIB"
cp "$SCRIPT_DIR/host.ts" "$HOST_LIB/host.ts"

# Create the native host wrapper script with correct absolute path
HOST_BIN="/usr/local/bin/chrome-bridge-native"
cat > "$HOST_BIN" << WRAPPER
#!/bin/bash
exec npx -y bun "$HOST_LIB/host.ts"
WRAPPER
chmod +x "$HOST_BIN"

# Determine Chrome native messaging directory
if [[ "$OSTYPE" == "darwin"* ]]; then
  NM_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux"* ]]; then
  NM_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

mkdir -p "$NM_DIR"

# Generate manifest
cat > "$NM_DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "Chrome Bridge native messaging host",
  "path": "$HOST_BIN",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "Native host installed:"
echo "  Binary: $HOST_BIN"
echo "  Manifest: $NM_DIR/$HOST_NAME.json"
echo "  Extension ID: $EXT_ID"
