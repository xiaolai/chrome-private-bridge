#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.chrome_bridge.native_host"

# Create the native host wrapper script
HOST_BIN="/usr/local/bin/chrome-bridge-native"
cat > "$HOST_BIN" << 'WRAPPER'
#!/bin/bash
exec npx -y bun "$(dirname "$0")/../lib/chrome-bridge/host.ts"
WRAPPER
chmod +x "$HOST_BIN"

# Copy the host.ts to a stable location
HOST_LIB="/usr/local/lib/chrome-bridge"
mkdir -p "$HOST_LIB"
cp "$SCRIPT_DIR/host.ts" "$HOST_LIB/host.ts"

# Update wrapper to point to the correct location
cat > "$HOST_BIN" << WRAPPER
#!/bin/bash
exec npx -y bun "$HOST_LIB/host.ts"
WRAPPER

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

# Get the extension ID from arguments or prompt
EXT_ID="${1:-EXTENSION_ID_HERE}"

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
echo ""
echo "Usage: install.sh <extension-id>"
