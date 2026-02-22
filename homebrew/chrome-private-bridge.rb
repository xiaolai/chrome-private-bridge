class ChromePrivateBridge < Formula
  desc "MCP-native Chrome browser automation bridge"
  homepage "https://github.com/xiaolai/chrome-private-bridge"
  version "0.2.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xiaolai/chrome-private-bridge/releases/download/v0.2.0/chrome-private-bridge-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER"
    else
      url "https://github.com/xiaolai/chrome-private-bridge/releases/download/v0.2.0/chrome-private-bridge-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  on_linux do
    url "https://github.com/xiaolai/chrome-private-bridge/releases/download/v0.2.0/chrome-private-bridge-linux-x64.tar.gz"
    sha256 "PLACEHOLDER"
  end

  def install
    bin.install Dir["chrome-private-bridge*"].first => "chrome-private-bridge"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/chrome-private-bridge version")
  end
end
