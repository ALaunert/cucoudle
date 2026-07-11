class Cucoudle < Formula
  include Language::Python::Virtualenv

  desc "Remote-control local CLI agent sessions (Claude, Codex, Cursor) from your phone"
  homepage "https://github.com/ALaunert/cucoudle"
  url "https://github.com/ALaunert/cucoudle/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "b66464bdac94096c9abb13f2750928eee6f6d3a593feaaab65940bd18d30de76"
  license "MIT"
  head "https://github.com/ALaunert/cucoudle.git", branch: "main"

  depends_on "python@3.13"

  revision 1

  def install
    # The desktop client lives in apps/desktop. Build an isolated virtualenv in
    # libexec and install the package together with its dependencies
    # (pydantic/websockets/qrcode wheels from PyPI — no Rust toolchain needed).
    # Homebrew's venv.pip_install always passes --no-deps, so we bootstrap pip
    # and call it directly instead.
    virtualenv_create(libexec, "python3.13")
    system libexec/"bin/python", "-m", "ensurepip", "--upgrade"
    system libexec/"bin/python", "-m", "pip", "install", buildpath/"apps/desktop"
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
    # --version passes even without runtime deps; importing the daemon module
    # proves pydantic/websockets actually landed in the venv.
    system libexec/"bin/python", "-c", "import cucoudle_desktop.daemon"
  end
end
