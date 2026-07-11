# typed: strict
# frozen_string_literal: true

# Homebrew formula for the Cucoudle desktop daemon and transparent CLI shims.
class Cucoudle < Formula
  include Language::Python::Virtualenv

  desc "Remote-control local CLI agent sessions (Claude, Codex, Cursor) from your phone"
  homepage "https://github.com/ALaunert/cucoudle"
  url "https://github.com/ALaunert/cucoudle/archive/refs/tags/v0.1.4.tar.gz"
  sha256 "ca4ac06c9c4b86167b96f4092c83ab684256e4e3e8e60f1b5f0f7b5d015512ec"
  license "MIT"
  head "https://github.com/ALaunert/cucoudle.git", branch: "main"

  depends_on "pydantic"
  depends_on "python@3.13"

  resource "qrcode" do
    url "https://files.pythonhosted.org/packages/8f/b2/7fc2931bfae0af02d5f53b174e9cf701adbb35f39d69c2af63d4a39f81a9/qrcode-8.2.tar.gz"
    sha256 "35c3f2a4172b33136ab9f6b3ef1c00260dd2f66f858f24d88418a015f446506c"
  end

  resource "websockets" do
    url "https://files.pythonhosted.org/packages/8c/02/b9a097e1e16fee4e2fd1ec8c39f6a9c5d6257bae8fa12640caf869f54436/websockets-16.1.tar.gz"
    sha256 "299468cbe42e2b9981134c7c51d99387d8a7bf562b00183b3eec53f882846dad"
  end

  def install
    # pydantic comes from its bottled formula; Homebrew adds dependency Python
    # paths to the virtualenv. The pure/C resources below require no Rust.
    venv = virtualenv_create(libexec, "python3.13")
    venv.pip_install resources
    cd "apps/desktop" do
      venv.pip_install Pathname.pwd
    end
    bin.install_symlink libexec/"bin/cucoudle"
  end

  service do
    run [opt_bin/"cucoudle", "daemon"]
    keep_alive true
    log_path var/"log/cucoudle/daemon.log"
    error_log_path var/"log/cucoudle/daemon.log"
  end

  def caveats
    <<~EOS
      cucoudle (desktop) is installed. Two more steps to finish setup:

        cucoudle install               # add shims + PATH integration to your shell
        brew services start cucoudle   # run the daemon in the background (autostart)

      Then open a new terminal and run `claude` / `codex` as usual, and
      `cucoudle pair` to link a phone. The relay is a hosted service — you do not
      run it locally. Remove everything with: cucoudle uninstall --purge

      Override the relay for local development with CUCOUDLE_RELAY_URL.
    EOS
  end

  test do
    assert_match "cucoudle", shell_output("#{bin}/cucoudle --version")
    system libexec/"bin/python", "-c", "import pydantic, qrcode, websockets"
  end
end
