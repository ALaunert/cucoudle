import os
import stat
from pathlib import Path

from cucoudle_desktop import installer
from cucoudle_desktop.config import Config
from cucoudle_desktop.installer import (
    BLOCK_END,
    BLOCK_START,
    discover_tools,
    render_rc_with_block,
    render_rc_without_block,
    write_shims,
)


def _cfg(home: Path) -> Config:
    return Config(
        desktop_id="desk_test",
        desktop_name="test",
        platform="linux",
        app_version="0.1.0",
        relay_url="ws://localhost:8787",
        home=home,
    )


def test_discover_tools_finds_fake_binary(tmp_path, monkeypatch):
    tools_dir = tmp_path / "realbin"
    tools_dir.mkdir()
    fake = tools_dir / "claude"
    fake.write_text("#!/bin/sh\necho hi\n")
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", str(tools_dir))

    found = {t.name: t for t in discover_tools(tmp_path / "shimbin")}
    assert found["claude"].available
    assert found["claude"].path == str(fake)
    assert not found["codex"].available


def test_discover_excludes_shim_dir(tmp_path, monkeypatch):
    shim_dir = tmp_path / "shimbin"
    shim_dir.mkdir()
    # A shim named 'claude' living in the shim dir must NOT be discovered as real.
    (shim_dir / "claude").write_text("#!/bin/sh\n")
    (shim_dir / "claude").chmod(0o755)
    monkeypatch.setenv("PATH", str(shim_dir))
    found = {t.name: t for t in discover_tools(shim_dir)}
    assert not found["claude"].available


def test_rc_block_insert_is_idempotent(tmp_path):
    cfg = _cfg(tmp_path)
    original = "export FOO=1\n"
    once = render_rc_with_block(original, cfg.bin_dir)
    twice = render_rc_with_block(once, cfg.bin_dir)
    assert once == twice
    assert once.count(BLOCK_START) == 1
    assert BLOCK_END in once
    assert str(cfg.bin_dir) in once
    assert "export FOO=1" in once


def test_rc_block_remove(tmp_path):
    cfg = _cfg(tmp_path)
    original = "export FOO=1\n"
    with_block = render_rc_with_block(original, cfg.bin_dir)
    cleaned = render_rc_without_block(with_block)
    assert BLOCK_START not in cleaned
    assert "export FOO=1" in cleaned


def test_write_shims_are_executable(tmp_path):
    cfg = _cfg(tmp_path)
    tools = [installer.DiscoveredTool("claude", "/usr/bin/claude"),
             installer.DiscoveredTool("codex", None)]
    installed = write_shims(cfg, tools, python_executable="/usr/bin/python3")
    assert installed == ["claude"]
    shim = cfg.bin_dir / "claude"
    assert shim.exists()
    assert os.access(shim, os.X_OK)
    content = shim.read_text()
    assert content.startswith("#!/usr/bin/python3")
    assert "def main" in content
    # No shim for an unavailable tool.
    assert not (cfg.bin_dir / "codex").exists()


def test_install_uninstall_roundtrip(tmp_path, monkeypatch):
    # Isolate HOME so we exercise real rc-file editing on a scratch home.
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))
    (fake_home / ".zshrc").write_text("# my zshrc\n")

    tools_dir = tmp_path / "realbin"
    tools_dir.mkdir()
    (tools_dir / "claude").write_text("#!/bin/sh\n")
    (tools_dir / "claude").chmod(0o755)
    monkeypatch.setenv("PATH", str(tools_dir))

    cfg = _cfg(fake_home / ".cucoudle")
    result = installer.install(cfg, python_executable="/usr/bin/python3")
    assert "claude" in result["installed"]
    zshrc = (fake_home / ".zshrc").read_text()
    assert BLOCK_START in zshrc
    assert (fake_home / ".zshrc.cucoudle.bak").exists()

    installer.uninstall(cfg)
    assert BLOCK_START not in (fake_home / ".zshrc").read_text()
    assert not (cfg.bin_dir / "claude").exists()
